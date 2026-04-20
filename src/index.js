import 'dotenv/config'

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

const app = express()
const PORT = process.env.PORT || 3000
const FRONTEND_URL = process.env.FRONTEND_URL

// Middlewares globales base para todas las requests.
app.use(cors({ origin: FRONTEND_URL, credentials: true }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())

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
app.get('/', (req, res) => {
    res.json({ status: 'ok', mensaje: 'API de retos fotograficos express en línea' })
})

// 404 para cualquier endpoint no registrado.
app.use((req, res) => {
    res.status(404).json({
        error: 'ENDPOINT_NO_ENCONTRADO',
        detalle: `${req.method} ${req.originalUrl}`,
    })
})

// ─── Middleware global de errores ────────────────────────────
app.use(errorHandler)

// ─── Iniciar el servidor ─────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`)
})