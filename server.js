const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();

// Middlewares obligatorios para procesar formularios y archivos estáticos
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Conexión limpia a MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/teleradiologia_db')
    .then(() => console.log('✅ Conectado a MongoDB (Sistema Clínico Integral)'))
    .catch(err => console.error('❌ Error de conexión NoSQL:', err));

// =========================================================================
// MODELOS DE BASE DE DATOS (NoSQL Mongoose)
// =========================================================================

const PacienteSchema = new mongoose.Schema({
    nombre: String,
    cedula: String,
    telefonoMovil: String,
    telefonoFijo: String,
    correo: { type: String, unique: true },
    direccion: String,
    contrasena: String,
    estrellas: { type: Number, default: 1 }, // Comienza con 1 estrella de cortesía
    statusConsulta: { type: String, default: 'Ninguno' },
    sintomasActuales: { type: String, default: '' },
    notificaciones: [String] // Array para almacenar avisos como: "Tío pablo ha visto tu historial."
});

const FamiliarSchema = new mongoose.Schema({
    nombrePacienteAVer: String,
    vinculo: String,
    nombreFamiliar: String,
    telefonoFamiliar: String,
    correoFamiliar: { type: String, unique: true },
    correoPacienteVinculado: String,
    contrasenaFamiliar: String
});

const MedicoSchema = new mongoose.Schema({
    nombreCompleto: String,
    cedulaProfesional: String,
    direccion: String,
    telefono: String,
    correo: { type: String, unique: true },
    contrasena: String,
    autorizado: { type: Boolean, default: false }, // Lo autoriza el Administrador
    documentosAdjuntos: { type: [String], default: ["Titulo.jpg", "Cedula.jpg"] } // Simulación de archivos cargados
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
        return res.status(400).send('<h1>Error: Las contraseñas no coinciden. Reintente.</h1>');
    }

    try {
        const nuevoPaciente = new Paciente({ nombre, cedula, telefonoMovil, telefonoFijo, correo, direccion, contrasena });
        await nuevoPaciente.save();
        res.redirect(`/paciente-dashboard.html?id=${nuevoPaciente._id}`);
    } catch (err) {
        res.status(500).send('Error al registrar el paciente o el correo ya existe.');
    }
});

// Login de Paciente
app.post('/api/pacientes/login', async (req, res) => {
    const { correo, contrasena } = req.body;
    try {
        const paciente = await Paciente.findOne({ correo, contrasena });
        if (!paciente) return res.status(401).send('<h1>Credenciales incorrectas</h1>');
        res.redirect(`/paciente-dashboard.html?id=${paciente._id}`);
    } catch (err) {
        res.status(500).send('Error en el servidor.');
    }
});

// Endpoint para traer los datos del Paciente y sus notificaciones en tiempo real
app.get('/api/pacientes/datos/:id', async (req, res) => {
    try {
        const paciente = await Paciente.findById(req.params.id);
        res.json(paciente);
    } catch (err) {
        res.status(500).json(null);
    }
});

// =========================================================================
// OPERACIONES DEL ROL: FAMILIAR (CON ENVÍO DE NOTIFICACIONES AL PACIENTE)
// =========================================================================

// Registro de Familiar
app.post('/api/familiares/registro', async (req, res) => {
    const { nombrePacienteAVer, vinculo, nombreFamiliar, telefonoFamiliar, correoFamiliar, correoPacienteVinculado, contrasenaFamiliar } = req.body;
    try {
        const nuevoFamiliar = new Familiar({ nombrePacienteAVer, vinculo, nombreFamiliar, telefonoFamiliar, correoFamiliar, correoPacienteVinculado, contrasenaFamiliar });
        await nuevoFamiliar.save();
        
        // Disparar alerta en el expediente del Paciente
        await Paciente.findOneAndUpdate(
            { correo: correoPacienteVinculado },
            { $push: { notificaciones: `Tu familiar ${nombreFamiliar} (${vinculo}) se ha registrado para monitorearte.` } }
        );

        res.redirect(`/familiar-dashboard.html?correoFamiliar=${nuevoFamiliar.correoFamiliar}`);
    } catch (err) {
        res.status(500).send('Error en el registro del familiar.');
    }
});

// Login de Familiar (Envía notificación inmediata al ingresar)
app.post('/api/familiares/login', async (req, res) => {
    const { correoFamiliar, contrasenaFamiliar } = req.body;
    try {
        const fam = await Familiar.findOne({ correoFamiliar, contrasenaFamiliar });
        if (!fam) return res.status(401).send('<h1>Familiar no registrado o clave errónea</h1>');
        
        // Notificar en tiempo real al paciente vinculado
        await Paciente.findOneAndUpdate(
            { correo: fam.correoPacienteVinculado },
            { $push: { notificaciones: `${fam.vinculo} ${fam.nombreFamiliar} ha visto tu historial.` } }
        );

        const paciente = await Paciente.findOne({ correo: fam.correoPacienteVinculado });
        res.redirect(`/familiar-dashboard.html?idPaciente=${paciente._id}&familiar=${encodeURIComponent(fam.nombreFamiliar)}`);
    } catch (err) {
        res.status(500).send('Error en el acceso.');
    }
});

// =========================================================================
// OPERACIONES DEL ROL: MÉDICO (REGISTRO SUJETO A AUTORIZACIÓN)
// =========================================================================

app.post('/api/medicos/registro', async (req, res) => {
    const { nombreCompleto, cedulaProfesional, direccion, telefono, correo, contrasena } = req.body;
    try {
        const nuevoMedico = new Medico({ nombreCompleto, cedulaProfesional, direccion, telefono, correo, contrasena, autorizado: false });
        await nuevoMedico.save();
        res.send('<h1>Registro médico enviado. Espere a que el Administrador valide sus títulos y credenciales cargadas.</h1>');
    } catch (err) {
        res.status(500).send('Error en la postulación médica.');
    }
});

app.post('/api/medicos/login', async (req, res) => {
    const { correo, contrasena } = req.body;
    try {
        const med = await Medico.findOne({ correo, contrasena });
        if (!med) return res.status(401).send('<h1>Usuario no encontrado</h1>');
        if (!med.autorizado) return res.status(403).send('<h1>Acceso retenido: Sus títulos aún están en verificación por el administrador.</h1>');
        
        res.redirect('/medico-dashboard.html');
    } catch (err) {
        res.status(500).send('Error de autenticación.');
    }
});

// =========================================================================
// OPERACIONES DEL ROL: ADMINISTRADOR
// =========================================================================

app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === 'Admin') {
        res.redirect('/admin.html');
    } else {
        res.status(401).send('<h1>Clave administrativa inválida</h1>');
    }
});

// Listar médicos pendientes para aprobar
app.get('/api/admin/medicos-pendientes', async (req, res) => {
    const medicos = await Medico.find({ autorizado: false });
    res.json(medicos);
});

// Aprobar médico
app.post('/api/admin/aprobar-medico', async (req, res) => {
    await Medico.findByIdAndUpdate(req.body.idMedico, { autorizado: true });
    res.json({ success: true });
});

// CONSULTA DE ATENCIÓN DE TRIAJE
app.post('/api/pacientes/solicitar-consulta', async (req, res) => {
    const { idPaciente, sintomas } = req.body;
    const pac = await Paciente.findById(idPaciente);
    if (pac.estrellas < 1) {
        return res.json({ success: false, redirigirAPago: true });
    }
    pac.estrellas -= 1;
    pac.statusConsulta = 'Esperando';
    pac.sintomasActuales = sintomas;
    await pac.save();
    res.json({ success: true });
});

app.get('/api/admin/pacientes', async (req, res) => {
    const p = await Paciente.find();
    res.json(p);
});

app.post('/api/medicos/atender', async (req, res) => {
    const { idPaciente, recipeText } = req.body;
    const p = await Paciente.findById(idPaciente);
    const c = new Consulta({ idPaciente: p._id, sintomasReportados: p.sintomasActuales, diagnosticoTratamiento: recipeText });
    await c.save();
    p.statusConsulta = 'Atendido';
    p.sintomasActuales = '';
    await p.save();
    res.json({ success: true });
});

app.listen(3000, () => console.log('🚀 Servidor unificado corriendo en puerto 3000'));