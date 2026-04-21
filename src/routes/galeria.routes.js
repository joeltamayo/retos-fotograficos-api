import { Router } from 'express'
import { getGaleria } from '../controllers/galeria.controller.js'

// Router de /api/galeria.
// Expone endpoints de consulta de galeria publica.
const router = Router()

// GET /api/galeria
// Lista fotos aprobadas con filtros opcionales y paginacion.
// La logica SQL vive en el controlador para mantener el router simple.
router.get('/', getGaleria)

export default router
