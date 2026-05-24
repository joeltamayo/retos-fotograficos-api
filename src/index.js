import 'dotenv/config'

import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'

import authRoutes from './routes/auth.routes.js'
import homeRoutes from './routes/home.routes.js'
import catalogosRoutes from './routes/catalogos.routes.js'
import retosRoutes from './routes/retos.routes.js'
import fotografiasRoutes from './routes/fotografias.routes.js'
import galeriaRoutes from './routes/galeria.routes.js'
import rankingRoutes from './routes/ranking.routes.js'
import usuariosRoutes from './routes/usuarios.routes.js'
import adminRetosRoutes from './routes/admin/admin.retos.routes.js'
import adminFotografiasRoutes from './routes/admin/admin.fotografias.routes.js'
import adminUsuariosRoutes from './routes/admin/admin.usuarios.routes.js'
import { errorHandler } from './middlewares/errorHandler.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 5500
const FRONTEND_URL = process.env.FRONTEND_URL

const allowedOrigins = [
    ...String(process.env.FRONTEND_URLS || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    FRONTEND_URL,
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5500',
].filter(Boolean)

function isAllowedOrigin(origin) {
    if (!origin) {
        return true
    }

    if (allowedOrigins.includes(origin)) {
        return true
    }

    return /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
}

// Middlewares globales base para todas las requests.
app.use(cors({
    origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
            callback(null, true)
            return
        }

        callback(new Error(`Origen CORS no permitido: ${origin}`))
    },
    credentials: true,
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

// Servir archivos estáticos del frontend
const frontendPath = path.join(__dirname, '../../frontend')
app.use(express.static(frontendPath))

// Mapeo de rutas publicas y privadas por prefijo.
app.use('/api/auth', authRoutes)
app.use('/api/home', homeRoutes)
app.use('/api/catalogos', catalogosRoutes)
app.use('/api/retos', retosRoutes)
app.use('/api/fotografias', fotografiasRoutes)
app.use('/api/galeria', galeriaRoutes)
app.use('/api/ranking', rankingRoutes)
app.use('/api/usuarios', usuariosRoutes)
app.use('/api/admin/retos', adminRetosRoutes)
app.use('/api/admin/fotografias', adminFotografiasRoutes)
app.use('/api/admin/usuarios', adminUsuariosRoutes);

// Endpoint de salud basico para confirmar que el servicio esta vivo.
app.get('/api', (req, res) => {
    res.json({ status: 'ok', mensaje: 'API de retos fotograficos express en línea' })
})

/*
// Fallback para SPA: servir index.html para rutas no coincidentes
app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'))
})

*/

// ─── Middleware global de errores ────────────────────────────
app.use(errorHandler)

// ─── Iniciar el servidor ─────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`)
})