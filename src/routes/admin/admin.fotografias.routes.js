import { Router } from 'express'
import * as adminFotografiasController from '../../controllers/admin/admin.fotografias.controller.js'
import { verificarToken, esAdmin } from '../../middlewares/auth.js'

// Router de /api/admin/fotografias.
// Reservado para moderacion y gestion administrativa de fotografias.
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

const getfotografias = adminFotografiasController.getfotografias
	?? handlerNoImplementado('admin.fotografias.controller.getfotografias')
const getFotografia = adminFotografiasController.getFotografia
	?? handlerNoImplementado('admin.fotografias.controller.getFotografia')
const cambiarEstado = adminFotografiasController.cambiarEstado
	?? handlerNoImplementado('admin.fotografias.controller.cambiarEstado')
const eliminarFotografia = adminFotografiasController.eliminarFotografia
	?? handlerNoImplementado('admin.fotografias.controller.eliminarFotografia')

// GET /api/admin/fotografias
// Lista fotografias para moderacion en panel administrativo.
router.get('/', getfotografias)

// GET /api/admin/fotografias/:fotografiaId
// Devuelve el detalle de una fotografia por ID.
router.get('/:fotografiaId', getFotografia)

// PATCH /api/admin/fotografias/:fotografiaId/estado
// Cambia solo el estado de una fotografia.
router.patch('/:fotografiaId/estado', cambiarEstado)

// DELETE /api/admin/fotografias/:fotografiaId
// Elimina una fotografia por ID.
router.delete('/:fotografiaId', eliminarFotografia)

export default router
