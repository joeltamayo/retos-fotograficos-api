import { Router } from 'express'
import * as adminUsuariosController from '../../controllers/admin/admin.usuarios.controller.js'
import { verificarToken, esAdmin } from '../../middlewares/auth.js'

// Router de /api/admin/usuarios.
// Reservado para gestion administrativa de cuentas de usuario.
const router = Router()

// Todas las rutas de este archivo requieren:
// 1) usuario autenticado (verificarToken)
// 2) rol administrador (esAdmin)
router.use(verificarToken, esAdmin)

// Si algun handler no esta implementado todavia,
// respondemos 501 para no romper el arranque del servidor.
const handlerNoImplementado = (nombre) => (req, res) => {
	return res.status(501).json({ error: `Handler no implementado: ${nombre}` })
}

const getUsuarios = adminUsuariosController.getUsuarios
	?? handlerNoImplementado('admin.usuarios.controller.getUsuarios')
const getUsuarioPorId = adminUsuariosController.getUsuarioPorId
	?? handlerNoImplementado('admin.usuarios.controller.getUsuarioPorId')
const cambiarEstado = adminUsuariosController.cambiarEstado
	?? handlerNoImplementado('admin.usuarios.controller.cambiarEstado')
const cambiarRol = adminUsuariosController.cambiarRol
	?? handlerNoImplementado('admin.usuarios.controller.cambiarRol')

// GET /api/admin/usuarios
// Lista usuarios con filtros y paginacion.
router.get('/', getUsuarios)

// GET /api/admin/usuarios/:usuarioId
// Obtiene detalle de un usuario por ID.
router.get('/:usuarioId', getUsuarioPorId)

// PATCH /api/admin/usuarios/:usuarioId/estado
// Cambia el estado del usuario (activo/suspendido).
router.patch('/:usuarioId/estado', cambiarEstado)

// PATCH /api/admin/usuarios/:usuarioId/rol
// Cambia el rol del usuario (usuario/administrador).
router.patch('/:usuarioId/rol', cambiarRol)

export default router
