import { Router } from 'express'
import { getRanking } from '../controllers/ranking.controller.js'

// Router de /api/ranking.
// Aqui se publican endpoints para tablas de ranking.
const router = Router()

// GET /api/ranking
// Devuelve top 5 del ranking segun el periodo solicitado.
router.get('/', getRanking)

export default router
