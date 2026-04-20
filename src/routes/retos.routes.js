import { Router } from 'express'
import {
	getRetosActivos,
	getRetosFinalizados,
	getRetoPorId,
	participar,
} from '../controllers/retos.controller.js'
import { verificarToken } from '../middlewares/auth.js'

// Router de /api/retos.
// Este archivo solo define las rutas y el orden en que se ejecutan
// middlewares/controladores. La logica de negocio vive en el controller.
const router = Router()

// GET /api/retos/activos
// Devuelve los retos que estan disponibles para participar.
router.get('/activos', getRetosActivos)

// GET /api/retos/finalizados
// Devuelve retos cerrados para consulta historica.
router.get('/finalizados', getRetosFinalizados)

// GET /api/retos/:retoId
// Obtiene el detalle de un reto especifico por su ID.
router.get('/:retoId', getRetoPorId)

// POST /api/retos/:retoId/participar
// Requiere sesion activa: primero validar token y luego registrar participacion.
router.post('/:retoId/participar', verificarToken, participar)

export default router
