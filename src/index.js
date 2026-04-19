import 'dotenv/config' // Carga variables de entorno desde .env
import express from 'express' // Framework web
import cors from 'cors' // Middleware para CORS (permite frontend en otro dominio)
import cookieParser from 'cookie-parser' // Middleware para parsear cookies (para JWT en cookies)

import authRoutes from './routes/auth.routes.js'
import adminRoutes from './routes/admin.routes.js'
import { errorHandler } from './middlewares/errorHandler.js'

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
    res.json({ status: 'ok', mensaje: 'API de retos fotograficos express en línea' })
})

// ─── Manejo de rutas no encontradas ─────────────────────────
// Si ninguna ruta coincide, respondemos con 404
app.use((req, res) => {
    res.status(404).json({ error: `Ruta ${req.method} ${req.path} no encontrada` })
})

// ─── Middleware global de errores ────────────────────────────
app.use(errorHandler)

// ─── Iniciar el servidor ─────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`)
})