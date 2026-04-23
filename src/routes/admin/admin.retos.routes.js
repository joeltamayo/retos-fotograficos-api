import { Router } from 'express'
import * as adminRetosController from '../../controllers/admin/admin.retos.controller.js'
import { verificarToken, esAdmin } from '../../middlewares/auth.js'
import { subirUnaImagen } from '../../middlewares/upload.js'

// Router de /api/admin/retos.
// Reservado para operaciones administrativas de retos.
const router = Router()

// Todas las rutas de este archivo requieren:
// 1) usuario autenticado (verificarToken)
// 2) rol administrador (esAdmin)
// Se aplica una sola vez para evitar repetirlo en cada endpoint.
router.use(verificarToken, esAdmin)

// Si algun handler no esta implementado todavia,
// respondemos 501 para no romper el arranque del servidor.
const handlerNoImplementado = (nombre) => (req, res) => {
	return res.status(501).json({ error: `Handler no implementado: ${nombre}` })
}

const getRetos = adminRetosController.getRetos
	?? handlerNoImplementado('admin.retos.controller.getRetos')
const getRetoPorId = adminRetosController.getRetoPorId
	?? handlerNoImplementado('admin.retos.controller.getRetoPorId')
const crearReto = adminRetosController.crearReto
	?? handlerNoImplementado('admin.retos.controller.crearReto')
const editarReto = adminRetosController.editarReto
	?? handlerNoImplementado('admin.retos.controller.editarReto')
const cambiarEstado = adminRetosController.cambiarEstado
	?? handlerNoImplementado('admin.retos.controller.cambiarEstado')
const eliminarReto = adminRetosController.eliminarReto
	?? handlerNoImplementado('admin.retos.controller.eliminarReto')

// GET /api/admin/retos
// Lista retos para el panel de administracion.
router.get('/', getRetos)

// GET /api/admin/retos/:retoId
// Devuelve el detalle de un reto por ID.
router.get('/:retoId', getRetoPorId)

// POST /api/admin/retos
// Crea un reto nuevo. Si llega archivo en campo "imagen", se procesa con multer.
router.post('/', subirUnaImagen, crearReto)

// PUT /api/admin/retos/:retoId
// Edita un reto existente. Tambien permite actualizar imagen (campo "imagen").
router.put('/:retoId', subirUnaImagen, editarReto)

// PATCH /api/admin/retos/:retoId/estado
// Cambia solo el estado del reto (accion puntual de administracion).
router.patch('/:retoId/estado', cambiarEstado)

// DELETE /api/admin/retos/:retoId
// Elimina un reto por ID.
router.delete('/:retoId', eliminarReto)

export default router
