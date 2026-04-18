import 'dotenv/config' // Carga variables de entorno desde .env
import express from 'express' // Framework web
import cors from 'cors' // Middleware para CORS (permite frontend en otro dominio)
import cookieParser from 'cookie-parser' // Middleware para parsear cookies (para JWT en cookies)
import multer from 'multer' // Middleware para manejo de multipart/form-data (subida de archivos) 
import bcrypt from 'bcrypt' // Para hashear passwords y comparar hashes

import authRoutes from './routes/auth.routes.js'
import adminRoutes from './routes/admin.routes.js'

const app = express()
const PORT = process.env.PORT || 5500

// Forzar UTF-8 en todas las respuestas JSON para que los acentos
// y caracteres especiales del español se muestren correctamente
app.use((req, res, next) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    next()
})

// ─── CORS ────────────────────────────────────────────────────────────────────
// Configuración de CORS para permitir solicitudes desde el frontend 
// En producción, solo permitir el dominio del frontend (configurado en .env)
// En desarrollo, permitir localhost:3000
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? process.env.FRONTEND_URL
        : 'http://localhost:5500',
    credentials: true, // Permite enviar cookies (JWT) en solicitudes CORS
}))

// ─── Middlewares globales ─────────────────────────────────────────────────────
app.use(cookieParser())  // Para leer cookies (donde guardamos el JWT)
app.use(express.json())  // Para parsear JSON en el cuerpo de las solicitudes
app.use(express.urlencoded({ extended: true })) // Para parsear datos de formularios (x-www-form-urlencoded)

// ─── Rutas ───────────────────────────────────────────────────────────────────
// Rutas organizadas por funcionalidad: auth (login), admin (CRUD)
app.use('/api/auth', authRoutes)
app.use('/api/admin', adminRoutes)

// Ruta raíz para verificar que el servidor está corriendo
app.get('/', (req, res) => {
    res.json({ status: 'ok', mensaje: 'API de acceso vehicular en línea' })
})

// ─── Manejo de rutas no encontradas ─────────────────────────
// Si ninguna ruta coincide, respondemos con 404
app.use((req, res) => {
    res.status(404).json({ error: `Ruta ${req.method} ${req.path} no encontrada` })
})

// ─── Middleware de manejo de errores ─────────────────────────
// Captura errores de multer (subida de archivos) y otros errores
// Si el error es de multer, respondemos con un mensaje específico
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'El archivo excede el límite de 10 MB' })
        }
        return res.status(400).json({ error: `Error al subir archivo: ${err.message}` })
    }
    if (err) {
        return res.status(400).json({ error: err.message })
    }
    console.error(err.stack)
    res.status(500).json({ error: 'Error interno del servidor' })
})

// ─── Iniciar el servidor ─────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`)
})