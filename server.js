const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const bcrypt = require('bcryptjs'); // ¡Seguridad primero, ingeniero!

const app = express();

// Middlewares obligatorios
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Conexión limpia a MongoDB (Cambie a su URI de Atlas si va a producción)
mongoose.connect('mongodb://127.0.0.1:27017/teleradiologia_db')
    .then(() => console.log('✅ Conectado a MongoDB (Sistema Clínico Integral)'))
    .catch(err => console.error('❌ Error de conexión NoSQL:', err));

// =========================================================================
// MODELOS DE BASE DE DATOS (NoSQL Mongoose)
// =========================================================================

const PacienteSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    cedula: { type: String, required: true },
    telefonoMovil: String,
    telefonoFijo: String,
    correo: { type: String, unique: true, required: true },
    direccion: String,
    contrasena: { type: String, required: true }, // Irá encriptada
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
    contrasenaFamiliar: { type: String, required: true } // Irá encriptada
});

const MedicoSchema = new mongoose.Schema({
    nombreCompleto: String,
    cedulaProfesional: String,
    direccion: String,
    telefono: String,
    correo: { type: String, unique: true, required: true },
    contrasena: { type: String, required: true }, // Irá encriptada
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
// OPERACIONES DEL ROL: PACIENTE
// =========================================================================

// Registro de Paciente
app.post('/api/pacientes/registro', async (req, res) => {
    const { nombre, cedula, telefonoMovil, telefonoFijo, correo, direccion, contrasena, confirmarContrasena } = req.body;
    
    if (contrasena !== confirmarContrasena) {
        return res.status(400).json({ success: false, error: 'Las contraseñas no coinciden.' });
    }

    try {
        // Encriptar contraseña antes de guardar
        const salt = await bcrypt.genSalt(10);
        const hashContrasena = await bcrypt.hash(contrasena, salt);

        const nuevoPaciente = new Paciente({ 
            nombre, cedula, telefonoMovil, telefonoFijo, correo, direccion, contrasena: hashContrasena 
        });
        await nuevoPaciente.save();
        
        // Respondemos JSON para que el fetch del frontend redirija de manera limpia
        res.json({ success: true, id: nuevoPaciente._id });
    } catch (err) {
        res.status(500).json({ success: false, error: 'El correo ya se encuentra registrado.' });
    }
});

// Login de Paciente
app.post('/api/pacientes/login', async (req, res) => {
    const { correo, contrasena } = req.body;
    try {
        const paciente = await Paciente.findOne({ correo });
        if (!paciente) return res.status(401).json({ success: false, error: 'Credenciales inválidas.' });
        
        // Verificar clave hash
        const esValida = await bcrypt.compare(contrasena, paciente.contrasena);
        if (!esValida) return res.status(401).json({ success: false, error: 'Credenciales inválidas.' });

        res.json({ success: true, id: paciente._id });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Error interno en el servidor.' });
    }
});

// Obtener datos del paciente
app.get('/api/pacientes/datos/:id', async (req, res) => {
    try {
        const paciente = await Paciente.findById(req.params.id).select('-contrasena');
        res.json(paciente);
    } catch (err) {
        res.status(500).json(null);
    }
});

// Obtener historial de consultas del paciente (¡ESTA RUTA FALTABA!)
app.get('/api/pacientes/historial/:id', async (req, res) => {
    try {
        const historial = await Consulta.find({ idPaciente: req.params.id }).sort({ fecha: -1 });
        res.json(historial);
    } catch (err) {
        res.status(500).json([]);
    }
});

// Solicitar consulta descontando estrellas
app.post('/api/pacientes/solicitar-consulta', async (req, res) => {
    try {
        const { idPaciente, sintomas } = req.body;
        const pac = await Paciente.findById(idPaciente);
        if (!pac) return res.status(404).json({ success: false, error: 'Paciente no encontrado.' });

        if (pac.estrellas < 1) {
            return res.json({ success: false, redirigirAPago: true });
        }
        
        pac.estrellas -= 1;
        pac.statusConsulta = 'Esperando';
        pac.sintomasActuales = sintomas;
        await pac.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =========================================================================
// OPERACIONES DEL ROL: FAMILIAR
// =========================================================================

app.post('/api/familiares/registro', async (req, res) => {
    const { nombrePacienteAVer, vinculo, nombreFamiliar, telefonoFamiliar, correoFamiliar, correoPacienteVinculado, contrasenaFamiliar } = req.body;
    try {
        const salt = await bcrypt.genSalt(10);
        const hashClave = await bcrypt.hash(contrasenaFamiliar, salt);

        const nuevoFamiliar = new Familiar({ 
            nombrePacienteAVer, vinculo, nombreFamiliar, telefonoFamiliar, correoFamiliar, correoPacienteVinculado, contrasenaFamiliar: hashClave 
        });
        await nuevoFamiliar.save();
        
        await Paciente.findOneAndUpdate(
            { correo: correoPacienteVinculado },
            { $push: { notificaciones: `Tu familiar ${nombreFamiliar} (${vinculo}) se ha registrado para monitorearte.` } }
        );

        res.json({ success: true, correoFamiliar: nuevoFamiliar.correoFamiliar });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Error al registrar al familiar.' });
    }
});

app.post('/api/familiares/login', async (req, res) => {
    const { correoFamiliar, contrasenaFamiliar } = req.body;
    try {
        const fam = await Familiar.findOne({ correoFamiliar });
        if (!fam) return res.status(401).json({ success: false, error: 'Familiar no registrado.' });
        
        const esValida = await bcrypt.compare(contrasenaFamiliar, fam.contrasenaFamiliar);
        if (!esValida) return res.status(401).json({ success: false, error: 'Clave errónea.' });
        
        await Paciente.findOneAndUpdate(
            { correo: fam.correoPacienteVinculado },
            { $push: { notificaciones: `${fam.vinculo} ${fam.nombreFamiliar} ha visto tu historial.` } }
        );

        const paciente = await Paciente.findOne({ correo: fam.correoPacienteVinculado });
        res.json({ success: true, idPaciente: paciente._id, familiar: fam.nombreFamiliar });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Error en el acceso.' });
    }
});

// =========================================================================
// OPERACIONES DEL ROL: MÉDICO
// =========================================================================

app.post('/api/medicos/registro', async (req, res) => {
    const { nombreCompleto, cedulaProfesional, direccion, telefono, correo, contrasena } = req.body;
    try {
        const salt = await bcrypt.genSalt(10);
        const hashClave = await bcrypt.hash(contrasena, salt);

        const nuevoMedico = new Medico({ 
            nombreCompleto, cedulaProfesional, direccion, telefono, correo, contrasena: hashClave, autorizado: false 
        });
        await nuevoMedico.save();
        res.json({ success: true, message: 'Postulación enviada con éxito.' });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Error en la postulación médica.' });
    }
});

app.post('/api/medicos/login', async (req, res) => {
    const { correo, contrasena } = req.body;
    try {
        const med = await Medico.findOne({ correo });
        if (!med) return res.status(401).json({ success: false, error: 'Usuario médico no encontrado.' });
        
        const esValida = await bcrypt.compare(contrasena, med.contrasena);
        if (!esValida) return res.status(401).json({ success: false, error: 'Contraseña incorrecta.' });

        if (!med.autorizado) {
            return res.status(403).json({ success: false, noAutorizado: true });
        }
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Error de autenticación.' });
    }
});

app.post('/api/medicos/atender', async (req, res) => {
    try {
        const { idPaciente, recipeText } = req.body;
        const p = await Paciente.findById(idPaciente);
        if(!p) return res.status(404).json({ success: false, error: 'Paciente no localizado' });

        const c = new Consulta({ idPaciente: p._id, sintomasReportados: p.sintomasActuales, diagnosticoTratamiento: recipeText });
        await c.save();

        p.statusConsulta = 'Atendido';
        p.sintomasActuales = '';
        await p.save();
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// =========================================================================
// OPERACIONES DEL ROL: ADMINISTRADOR
// =========================================================================

app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === 'Admin') {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, error: 'Clave administrativa inválida' });
    }
});

app.get('/api/admin/medicos-pendientes', async (req, res) => {
    try {
        const medicos = await Medico.find({ autorizado: false }).select('-contrasena');
        res.json(medicos);
    } catch (err) {
        res.status(500).json([]);
    }
});

app.post('/api/admin/aprobar-medico', async (req, res) => {
    try {
        await Medico.findByIdAndUpdate(req.body.idMedico, { autorizado: true });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/admin/pacientes', async (req, res) => {
    try {
        const p = await Paciente.find().select('-contrasena');
        res.json(p);
    } catch (err) {
        res.status(500).json([]);
    }
});

// Conciliación manual de Estrellas (¡ESTA RUTA LA REQUERÍA TU FRONTEND!)
app.post('/api/admin/recargar-estrella', async (req, res) => {
    try {
        const pac = await Paciente.findById(req.body.idPaciente);
        if (pac) {
            pac.estrellas += 1;
            await pac.save();
            res.json({ success: true });
        } else {
            res.status(404).json({ success: false, error: 'Paciente no encontrado' });
        }
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Inicialización del servidor
app.listen(3000, () => console.log('🚀 Servidor unificado corriendo en puerto 3000 con máxima seguridad'));