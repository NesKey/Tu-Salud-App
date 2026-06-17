    const express = require('express');
const app = express();
const path = require('path');

// =========================================================================
// MIDDLEWARES CRÍTICOS (Obligatorios para procesar los datos de los formularios)
// =========================================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir los archivos estáticos de la carpeta public (donde está tu index.html)
app.use(express.static(path.join(__dirname)));

// =========================================================================
// RUTAS DE LA COLUMNA 1: PACIENTES (REGISTRO Y LOGIN)
// =========================================================================

// 1. Registro de Paciente
app.post('/api/pacientes/registro', (req, res) => {
    const { nombre, correo, enfermedad } = req.body;
    
    // Aquí va tu lógica NoSQL para guardar el registro
    console.log(`[NoSQL] Registrando paciente: ${nombre} | Correo: ${correo} | Condición: ${enfermedad}`);
    
    // Redirección segura para que el navegador no se quede en blanco o texto plano
    // Reemplaza '/paciente-dashboard.html' por la ruta real de tu interfaz de usuario
    res.redirect('/paciente-dashboard.html'); 
});

// 2. Login de Paciente
app.post('/api/pacientes/login', (req, res) => {
    const { correo } = req.body;
    
    console.log(`[NoSQL] Intento de ingreso de paciente: ${correo}`);
    
    // Lógica de verificación...
    res.redirect('/paciente-dashboard.html');
});

// =========================================================================
// RUTAS DE LA COLUMNA 2: FAMILIARES (VINCULACIÓN CLÍNICA)
// =========================================================================

// 3. Registro y Vinculación de Familiar
app.post('/api/familiares/registro', (req, res) => {
    const { nombreFamiliar, correoFamiliar, correoPacienteVinculado } = req.body;
    
    console.log(`[NoSQL] Enlazando Familiar: ${nombreFamiliar} con Paciente: ${correoPacienteVinculado}`);
    
    // Lógica de vinculación en tu base de datos...
    res.redirect('/familiar-dashboard.html');
});

// 4. Login de Familiar
app.post('/api/familiares/login', (req, res) => {
    const { correoFamiliar } = req.body;
    
    console.log(`[NoSQL] Acceso de monitor familiar: ${correoFamiliar}`);
    
    res.redirect('/familiar-dashboard.html');
});

// =========================================================================
// RUTAS DE LA COLUMNA 3: PERSONAL MÉDICO
// =========================================================================

// 5. Login de Médico de Guardia
app.post('/api/medicos/login', (req, res) => {
    const { cedula } = req.body;
    
    console.log(`[NoSQL] Verificando credenciales del Médico con Cédula: ${cedula}`);
    
    // Lógica para comprobar el código MSAS o la guardia activa...
    res.redirect('/medico-dashboard.html');
});

// =========================================================================
// CONTROL DE ERRORES GENERAL (Ruta de respaldo si algo sale mal)
// =========================================================================
app.use((req, res) => {
    res.status(404).send('<h1>404 - Ruta no encontrada en el sistema NoSQL</h1>');
});

// Iniciar el servidor en el puerto 3000
const PUERTO = 3000;
app.listen(PUERTO, () => {
    console.log(`Servidor de Triaje Clínico corriendo en http://localhost:${PUERTO}`);
});