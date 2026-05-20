import { Router } from 'express'
import { getRanking, getRankingPeriodos } from '../controllers/ranking.controller.js'

// Router de /api/ranking.
// Aqui se publican endpoints para tablas de ranking.
const router = Router()

// GET /api/ranking
// Devuelve top 5 del ranking segun el periodo solicitado.
router.get('/', getRanking)

// GET /api/ranking/periodos
// Devuelve opciones disponibles por periodo (dias, semanas, meses, anos).
router.get('/periodos', getRankingPeriodos)

export default router
