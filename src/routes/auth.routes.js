// ============================================================
//  Rutas de autenticación
//
//  Mapa de seguridad:
//  - Publicas: registro, login, refresh
//  - Protegidas: logout, me
//
//  Estas rutas delegan toda la logica al controller para que
//  el archivo de rutas se mantenga como "tabla de enrutamiento"
//  facil de leer y mantener.
// ============================================================

import { Router } from 'express'
import { registro, login, logout, refresh, me } from '../controllers/auth.controller.js'
import { verificarToken } from '../middlewares/auth.js'

const router = Router()

router.post('/registro', registro)
router.post('/login', login)
router.post('/logout', verificarToken, logout)
router.post('/refresh', refresh)
router.get('/me', verificarToken, me)

export default router