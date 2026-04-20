import { Router } from 'express'
import { getHome } from '../controllers/home.controller.js'

// Router de /api/home.
// Mantener las rutas de Home aisladas facilita su mantenimiento.
// En este modulo solo se define la URL y que controlador atiende la solicitud.
const router = Router()

// GET /api/home
// Devuelve, en una sola llamada, la informacion principal de la portada:
// retos activos, fotos destacadas y fotos recientes.
router.get('/', getHome)

export default router
