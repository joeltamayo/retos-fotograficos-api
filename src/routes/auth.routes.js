// ============================================================
//  Rutas de autenticación
//
//  Este archivo solo declara el mapa de endpoints del grupo
//  /api/auth. Toda la lógica real vive en el controller.
//
//  Rutas:
//  - POST /registro  -> registro
//  - POST /login     -> login
//  - POST /refresh   -> refresh
//  - POST /logout    -> verificarToken + logout
// ============================================================

import { Router } from 'express'
import { registro, login, logout, refresh } from '../controllers/auth.controller.js'
import { verificarToken } from '../middlewares/auth.js'

const router = Router()

router.post('/registro', registro)
router.post('/login', login)
router.post('/refresh', refresh)
router.post('/logout', verificarToken, logout)

export default router