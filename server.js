const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos directamente desde la raíz del proyecto
app.use(express.static(__dirname));

// Conexión dinámica: Usa Atlas en Render o local por defecto
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/teleradiologia_db';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Base de Datos conectada de forma correcta'))
    .catch(err => console.error('❌ Error de conexión:', err));

// =========================================================================
// ESQUEMAS Y MODELOS DE MONGOOSE
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
    statusConsulta: { type: String, default: 'Ninguna' }, // 'Ninguna', 'Esperando', 'Atendido'
    sintomasActuales: { type: String, default: '' }
});

const HistorialSchema = new mongoose.Schema({
    idPaciente: { type: mongoose.Schema.Types.ObjectId, ref: 'Paciente' },
    fecha: { type: Date, default: Date.now },
    sintomasReportados: String,
    diagnosticoTratamiento: String
});

const MedicoSchema = new mongoose.Schema({
    nombre: String,
    correo: { type: String, unique: true, required: true },
    contrasena: { type: String, required: true },
    especialidad: String,
    autorizado: { type: Boolean, default: false }
});

const Paciente = mongoose.model('Paciente', PacienteSchema);
const Historial = mongoose.model('Historial', HistorialSchema);
const Medico = mongoose.model('Medico', MedicoSchema);

// =========================================================================
// RUTAS DE AUTENTICACIÓN Y REGISTRO (AUTOGESTIÓN)
// =========================================================================

// Registro de Paciente
app.post('/api/pacientes/registro', async (req, res) => {
    try {
        const { nombre, cedula, correo, contrasena, telefonoMovil, direccion } = req.body;
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(contrasena, salt);

        const nuevoPaciente = new Paciente({
            nombre, cedula, correo, 
            contrasena: hashedPassword, 
            telefonoMovil, direccion
        });
        await nuevoPaciente.save();
        res.json({ success: true, idPaciente: nuevoPaciente._id });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Login de Paciente
app.post('/api/pacientes/login', async (req, res) => {
    try {
        const { correo, contrasena } = req.body;
        const pac = await Paciente.findOne({ correo });
        if (!pac) return res.status(400).json({ success: false });

        const valido = await bcrypt.compare(contrasena, pac.contrasena);
        if (!valido) return res.status(400).json({ success: false });

        res.json({ success: true, idPaciente: pac._id, nombre: pac.nombre });
    } catch {
        res.status(500).json({ success: false });
    }
});

// Registro de Médico
app.post('/api/medicos/registro', async (req, res) => {
    try {
        const { nombre, correo, contrasena, especialidad } = req.body;
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(contrasena, salt);

        const nuevoMed = new Medico({ nombre, correo, contrasena: hashedPassword, especialidad });
        await nuevoMed.save();
        res.json({ success: true });
    } catch {
        res.status(500).json({ success: false });
    }
});

// Login de Médico
app.post('/api/medicos/login', async (req, res) => {
    try {
        const { correo, contrasena } = req.body;
        const med = await Medico.findOne({ correo });
        if (!med) return res.status(400).json({ success: false });

        if (!med.autorizado) return res.status(403).json({ success: false, msg: 'No autorizado' });

        const valido = await bcrypt.compare(contrasena, med.contrasena);
        if (!valido) return res.status(400).json({ success: false });

        res.json({ success: true, idMedico: med._id });
    } catch {
        res.status(500).json({ success: false });
    }
});

// Login de Administrador
app.post('/api/admin/login', (req, res) => {
    if (req.body.password === 'admin123') { 
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false });
    }
});

// =========================================================================
// CORE OPERACIONAL (ENDPOINTS REQUERIDOS POR EL FRONTEND)
// =========================================================================

// Datos de un paciente en específico
app.get('/api/pacientes/datos/:id', async (req, res) => {
    try {
        const pac = await Paciente.findById(req.params.id);
        res.json(pac);
    } catch { res.status(404).send('No encontrado'); }
});

// Historial clínico de un paciente
app.get('/api/pacientes/historial/:id', async (req, res) => {
    try {
        const hist = await Historial.find({ idPaciente: req.params.id }).sort({ fecha: -1 });
        res.json(hist);
    } catch { res.status(500).json([]); }
});

// Solicitar consulta (Se descuenta 1 estrella del expediente)
app.post('/api/pacientes/solicitar-consulta', async (req, res) => {
    try {
        const { idPaciente, sintomas } = req.body;
        const pac = await Paciente.findById(idPaciente);
        
        if (pac.estrellas < 1) {
            return res.json({ success: false, sinEstrellas: true });
        }

        pac.estrellas -= 1;
        pac.statusConsulta = 'Esperando';
        pac.sintomasActuales = sintomas;
        await pac.save();

        res.json({ success: true });
    } catch { res.status(500).json({ success: false }); }
});

// Médicos: Obtener pacientes en cola de espera
app.get('/api/medicos/pacientes-espera', async (req, res) => {
    const listado = await Paciente.find({ statusConsulta: 'Esperando' });
    res.json(listado);
});

// Médicos: Diagnosticar y cerrar consulta
app.post('/api/medicos/atender', async (req, res) => {
    try {
        const { idPaciente, recipeText } = req.body;
        const pac = await Paciente.findById(idPaciente);

        const nuevoHist = new Historial({
            idPaciente: pac._id,
            sintomasReportados: pac.sintomasActuales,
            diagnosticoTratamiento: recipeText
        });
        await nuevoHist.save();

        pac.statusConsulta = 'Atendido';
        pac.sintomasActuales = '';
        await pac.save();

        res.json({ success: true });
    } catch { res.status(500).json({ success: false }); }
});

// Administrador: Listar pacientes para conciliar pagos
app.get('/api/admin/pacientes', async (req, res) => {
    const p = await Paciente.find();
    res.json(p);
});

// Administrador: Autorizar registros médicos
app.post('/api/admin/aprobar-medico', async (req, res) => {
    await Medico.findByIdAndUpdate(req.body.idMedico, { autorizado: true });
    res.json({ success: true });
});

// Administrador: Asignar estrella tras verificar capture de pago móvil
app.post('/api/admin/recargar-estrella', async (req, res) => {
    try {
        const pac = await Paciente.findById(req.body.idPaciente);
        pac.estrellas += 1;
        await pac.save();
        res.json({ success: true });
    } catch { res.status(500).json({ success: false }); }
});

// =========================================================================
// ENRUTAMIENTO DIRECTO DESDE LA RAÍZ (SIN CARPETA PUBLIC)
// =========================================================================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/paciente-dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'paciente-dashboard.html')));
app.get('/medico-dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'medico-dashboard.html')));
app.get('/familiar-dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'familiar-dashboard.html')));
app.get('/pago.html', (req, res) => res.sendFile(path.join(__dirname, 'pago.html')));

// Puerto adaptable para producción en Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo de manera impecable en el puerto ${PORT}`);
});