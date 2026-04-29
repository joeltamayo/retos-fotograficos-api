import { Router } from 'express'
import * as usuariosController from '../controllers/usuarios.controller.js'
import { verificarToken } from '../middlewares/auth.js'
import { subirFotoPerfil } from '../middlewares/upload.js'

// Router de /api/usuarios.
// Centraliza endpoints de perfil, participaciones y gestion de usuario.
const router = Router()

// Si algun handler no esta implementado todavia,
// respondemos 501 para no romper el arranque del servidor.
const handlerNoImplementado = (nombre) => (req, res) => {
	return res.status(501).json({ error: `Handler no implementado: ${nombre}` })
}

const getMisParticipaciones = usuariosController.getMisParticipaciones
	?? handlerNoImplementado('usuarios.controller.getMisParticipaciones')
const getMiPerfil = usuariosController.getMiPerfil
	?? handlerNoImplementado('usuarios.controller.getMiPerfil')
const editarPerfil = usuariosController.editarPerfil
	?? handlerNoImplementado('usuarios.controller.editarPerfil')
const getFotosUsuario = usuariosController.getFotosUsuario
	?? handlerNoImplementado('usuarios.controller.getFotosUsuario')
const getPerfil = usuariosController.getPerfil
	?? handlerNoImplementado('usuarios.controller.getPerfil')

// IMPORTANTE:
// Las rutas /me van primero para que Express NO interprete "me"
// como si fuera :nombreUsuario.

// GET /api/usuarios/me/participaciones
// Requiere sesion activa y devuelve participaciones del usuario logueado.
router.get('/me/participaciones', verificarToken, getMisParticipaciones)

// GET /api/usuarios/me
// Requiere sesion activa y devuelve el perfil completo del usuario autenticado.
router.get('/me', verificarToken, getMiPerfil)

// PUT /api/usuarios/me
// Requiere sesion, permite actualizar perfil y foto (foto_perfil).
router.put('/me', verificarToken, subirFotoPerfil, editarPerfil)

// GET /api/usuarios/:nombreUsuario/fotos
// Devuelve la galeria publica del usuario solicitado.
router.get('/:nombreUsuario/fotos', getFotosUsuario)

// GET /api/usuarios/:nombreUsuario
// Devuelve el perfil publico del usuario solicitado.
router.get('/:nombreUsuario', getPerfil)

export default router
