const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos desde cualquier ubicación del proyecto
app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, 'public')));

// Conexión dinámica: Usa Atlas en Render o local si falla
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/teleradiologia_db';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Base de Datos conectada de forma correcta'))
    .catch(err => console.error('❌ Error de conexión:', err));

// =========================================================================
// ESQUEMAS NO SQL
// =========================================================================
const PacienteSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    cedula: { type: String, required: true },
    telefonoMovil: String,
    telefonoFijo: String,
    correo: { type: String, unique: true, required: true },
    direccion: String,
    contrasena: { type: String, required: true },
    estrellas: { type: Number, default: 1 },
    statusConsulta: { type: String, default: 'Ninguno' },
    sintomasActuales: { type: String, default: '' },
    notificaciones: [String]
});

const FamiliarSchema = new mongoose.Schema({
    nombrePacienteAVer: String,
    vinculo: String,
    nombreFamiliar: String,
    telefonoFamiliar: String,
    correoFamiliar: { type: String, unique: true, required: true },
    correoPacienteVinculado: String,
    contrasenaFamiliar: { type: String, required: true }
});

const MedicoSchema = new mongoose.Schema({
    nombreCompleto: String,
    cedulaProfesional: String,
    direccion: String,
    telefono: String,
    correo: { type: String, unique: true, required: true },
    contrasena: { type: String, required: true },
    autorizado: { type: Boolean, default: false },
    documentosAdjuntos: { type: [String], default: ["Titulo.jpg", "Cedula.jpg"] }
});

const ConsultaSchema = new mongoose.Schema({
    idPaciente: mongoose.Schema.Types.ObjectId,
    sintomasReportados: String,
    diagnosticoTratamiento: String,
    fecha: { type: Date, default: Date.now }
});

const Paciente = mongoose.model('Paciente', PacienteSchema);
const Familiar = mongoose.model('Familiar', FamiliarSchema);
const Medico = mongoose.model('Medico', MedicoSchema);
const Consulta = mongoose.model('Consulta', ConsultaSchema);

// =========================================================================
// ENDPOINTS DE LA API
// =========================================================================

app.post('/api/pacientes/registro', async (req, res) => {
    const { nombre, cedula, telefonoMovil, telefonoFijo, correo, direccion, contrasena } = req.body;
    try {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(contrasena, salt);
        const nuevo = new Paciente({ nombre, cedula, telefonoMovil, telefonoFijo, correo, direccion, contrasena: hash });
        await nuevo.save();
        res.json({ success: true, id: nuevo._id });
    } catch (err) {
        res.status(500).json({ success: false, error: 'El correo ya existe en el sistema.' });
    }
});

app.post('/api/pacientes/login', async (req, res) => {
    const { correo, contrasena } = req.body;
    try {
        const pac = await Paciente.findOne({ correo });
        if (!pac) return res.status(401).json({ success: false });
        const match = await bcrypt.compare(contrasena, pac.contrasena);
        if (!match) return res.status(401).json({ success: false });
        res.json({ success: true, id: pac._id });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/api/pacientes/datos/:id', async (req, res) => {
    try {
        const pac = await Paciente.findById(req.params.id).select('-contrasena');
        res.json(pac);
    } catch { res.status(404).json(null); }
});

app.get('/api/pacientes/historial/:id', async (req, res) => {
    try {
        const h = await Consulta.find({ idPaciente: req.params.id }).sort({ fecha: -1 });
        res.json(h);
    } catch { res.json([]); }
});

app.post('/api/pacientes/solicitar-consulta', async (req, res) => {
    try {
        const { idPaciente, sintomas } = req.body;
        const pac = await Paciente.findById(idPaciente);
        if (pac.estrellas < 1) return res.json({ success: false, redirigirAPago: true });
        
        pac.estrellas -= 1;
        pac.statusConsulta = 'Esperando';
        pac.sintomasActuales = sintomas;
        await pac.save();
        res.json({ success: true });
    } catch { res.status(500).json({ success: false }); }
});

app.post('/api/familiares/registro', async (req, res) => {
    const { nombreFamiliar, telefonoFamiliar, correoFamiliar, nombrePacienteAVer, vinculo, correoPacienteVinculado, contrasenaFamiliar } = req.body;
    try {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(contrasenaFamiliar, salt);
        const nuevo = new Familiar({ nombrePacienteAVer, vinculo, nombreFamiliar, telefonoFamiliar, correoFamiliar, correoPacienteVinculado, contrasenaFamiliar: hash });
        await nuevo.save();

        await Paciente.findOneAndUpdate(
            { correo: correoPacienteVinculado },
            { $push: { notificaciones: `Tu familiar ${nombreFamiliar} (${vinculo}) se ha registrado.` } }
        );
        res.json({ success: true });
    } catch { res.status(500).json({ success: false }); }
});

app.post('/api/familiares/login', async (req, res) => {
    const { correoFamiliar, contrasenaFamiliar } = req.body;
    try {
        const fam = await Familiar.findOne({ correoFamiliar });
        if (!fam) return res.status(401).json({ success: false });
        const match = await bcrypt.compare(contrasenaFamiliar, fam.contrasenaFamiliar);
        if (!match) return res.status(401).json({ success: false });

        const pac = await Paciente.findOne({ correo: fam.correoPacienteVinculado });
        await Paciente.findByIdAndUpdate(pac._id, { $push: { notificaciones: `${fam.nombreFamiliar} vio tu historial.` } });

        res.json({ success: true, idPaciente: pac._id, familiar: fam.nombreFamiliar });
    } catch { res.status(500).json({ success: false }); }
});

app.post('/api/medicos/registro', async (req, res) => {
    const { nombreCompleto, cedulaProfesional, direccion, telefono, correo, contrasena } = req.body;
    try {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(contrasena, salt);
        const med = new Medico({ nombreCompleto, cedulaProfesional, direccion, telefono, correo, contrasena: hash });
        await med.save();
        res.json({ success: true });
    } catch { res.status(500).json({ success: false }); }
});

app.post('/api/medicos/login', async (req, res) => {
    const { correo, contrasena } = req.body;
    try {
        const med = await Medico.findOne({ correo });
        if (!med) return res.status(401).json({ success: false });
        if (!med.autorizado) return res.status(403).json({ success: false });
        const match = await bcrypt.compare(contrasena, med.contrasena);
        if (!match) return res.status(401).json({ success: false });
        res.json({ success: true });
    } catch { res.status(500).json({ success: false }); }
});

app.post('/api/medicos/atender', async (req, res) => {
    const { idPaciente, recipeText } = req.body;
    try {
        const p = await Paciente.findById(idPaciente);
        const con = new Consulta({ idPaciente: p._id, sintomasReportados: p.sintomasActuales, diagnosticoTratamiento: recipeText });
        await con.save();

        p.statusConsulta = 'Atendido';
        p.sintomasActuales = '';
        await p.save();
        res.json({ success: true });
    } catch { res.status(500).json({ success: false }); }
});

app.post('/api/admin/login', (req, res) => {
    if (req.body.password === 'Admin') res.json({ success: true });
    else res.status(401).json({ success: false });
});

app.get('/api/admin/medicos-pendientes', async (req, res) => {
    const medicos = await Medico.find({ autorizado: false });
    res.json(medicos);
});

app.post('/api/admin/aprobar-medico', async (req, res) => {
    await Medico.findByIdAndUpdate(req.body.idMedico, { autorizado: true });
    res.json({ success: true });
});

app.get('/api/admin/pacientes', async (req, res) => {
    const p = await Paciente.find();
    res.json(p);
});

app.post('/api/admin/recargar-estrella', async (req, res) => {
    try {
        const pac = await Paciente.findById(req.body.idPaciente);
        pac.estrellas += 1;
        await pac.save();
        res.json({ success: true });
    } catch { res.status(500).json({ success: false }); }
});

// Manejador Dinámico de Archivos HTML
const despacharHTML = (archivo, res) => {
    res.sendFile(path.join(__dirname, archivo), (err) => {
        if (err) res.sendFile(path.join(__dirname, 'public', archivo), (err2) => {
            if (err2) res.status(404).send('Archivo no encontrado');
        });
    });
};

app.get('/', (req, res) => despacharHTML('index.html', res));
app.get('/admin.html', (req, res) => despacharHTML('admin.html', res));
app.get('/paciente-dashboard.html', (req, res) => despacharHTML('paciente-dashboard.html', res));
app.get('/medico-dashboard.html', (req, res) => despacharHTML('medico-dashboard.html', res));
app.get('/familiar-dashboard.html', (req, res) => despacharHTML('familiar-dashboard.html', res));
app.get('/pago.html', (req, res) => despacharHTML('pago.html', res));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor unificado en puerto ${PORT}`));