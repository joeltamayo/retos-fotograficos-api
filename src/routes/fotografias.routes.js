import { Router } from 'express'
import * as fotografiasController from '../controllers/fotografias.controller.js'
import * as calificacionesController from '../controllers/calificaciones.controller.js'
import * as comentariosController from '../controllers/comentarios.controller.js'
import { verificarToken } from '../middlewares/auth.js'
import { subirUnaImagen } from '../middlewares/upload.js'

// Router de /api/fotografias.
// Este modulo solo define rutas y middlewares.
// La logica de negocio vive en los controladores.
const router = Router()

// Si un controlador aun no esta implementado, devolvemos un error claro.
// Esto evita que Express falle al iniciar por callbacks undefined.
const handlerNoImplementado = (nombre) => (req, res) => {
	return res.status(501).json({ error: `Handler no implementado: ${nombre}` })
}

const subirFoto = fotografiasController.subirFoto ?? handlerNoImplementado('fotografias.controller.subirFoto')
const getFotografia = fotografiasController.getFotografia ?? handlerNoImplementado('fotografias.controller.getFotografia')
const getMiCalificacion = calificacionesController.getMiCalificacion
	?? handlerNoImplementado('calificaciones.controller.getMiCalificacion')
const calificar = calificacionesController.calificar
	?? handlerNoImplementado('calificaciones.controller.calificar')
const getComentarios = comentariosController.getComentarios
	?? handlerNoImplementado('comentarios.controller.getComentarios')
const comentar = comentariosController.comentar
	?? handlerNoImplementado('comentarios.controller.comentar')
const eliminarComentario = comentariosController.eliminarComentario
	?? handlerNoImplementado('comentarios.controller.eliminarComentario')
const getMiFotografia = fotografiasController.getMiFotografia
	?? handlerNoImplementado('fotografias.controller.getMiFotografia')

// POST /api/fotografias/
// Requiere sesion y una imagen en el campo "imagen".
router.post('/', verificarToken, subirUnaImagen, subirFoto)

// GET /api/fotografias/:fotografiaId
// Devuelve el detalle de una fotografia.
router.get('/:fotografiaId', getFotografia)

// GET /api/fotografias/:fotografiaId/mia
// Ruta para que el dueño vea su propia foto (incluso en revisión)
router.get('/:fotografiaId/mia', verificarToken, getMiFotografia);

// GET /api/fotografias/:fotografiaId/calificaciones/mia
// Devuelve la calificacion del usuario autenticado para esa foto.
router.get('/:fotografiaId/calificaciones/mia', verificarToken, getMiCalificacion)

// POST /api/fotografias/:fotografiaId/calificaciones
// Crea o actualiza la calificacion del usuario autenticado.
router.post('/:fotografiaId/calificaciones', verificarToken, calificar)

// GET /api/fotografias/:fotografiaId/comentarios
// Lista comentarios publicos de la fotografia.
router.get('/:fotografiaId/comentarios', getComentarios)

// POST /api/fotografias/:fotografiaId/comentarios
// Publica un comentario, requiere sesion.
router.post('/:fotografiaId/comentarios', verificarToken, comentar)

// DELETE /api/fotografias/:fotografiaId/comentarios/:comentarioId
// Elimina un comentario propio, requiere sesion.
router.delete('/:fotografiaId/comentarios/:comentarioId', verificarToken, eliminarComentario)

export default router
