// ============================================================
//  Controlador de Ranking
//
//  Este archivo maneja GET /api/ranking.
//  Objetivo:
//  - Recibir un periodo (diario, semanal, mensual, anual, historico).
//  - Aplicar filtro de fecha cuando corresponde.
//  - Regresar el top 5 de usuarios con su posicion.
// ============================================================

import db from '../config/db.js'

// Mapa cerrado de periodos permitidos a intervalos de PostgreSQL.
// historico usa null para indicar que NO lleva filtro por fecha.
const PERIODOS = {
	diario: '1 day',
	semanal: '7 days',
	mensual: '1 month',
	anual: '1 year',
	historico: null,
}

/**
 * GET /api/ranking
 *
 * Query params:
 * - periodo (opcional): diario | semanal | mensual | anual | historico
 *   default: semanal
 *
 * Respuesta 200:
 * {
 *   periodo: 'semanal',
 *   ranking: [ ...top 5... ]
 * }
 */
export const getRanking = async (req, res, next) => {
	try {
		const periodo = (req.query.periodo ?? 'semanal').toString().toLowerCase()

		// Si el periodo no existe en el mapa, se responde 400.
		if (!(periodo in PERIODOS)) {
			return res.status(400).json({ error: 'Periodo inválido' })
		}

		const intervalo = PERIODOS[periodo]

		// Query base solicitada para ranking. Se agrega WHERE solo
		// cuando el periodo NO es historico.
		const baseSelect = `
			SELECT
				ROW_NUMBER() OVER (ORDER BY SUM(puntos_calificacion) DESC) AS posicion,
				usuario_id,
				nombre,
				apellido,
				nombre_usuario,
				foto_perfil_url,
				SUM(puntos_calificacion) AS puntos_totales,
				COUNT(DISTINCT fotografia_id) AS total_fotos_calificadas
			FROM vista_ranking_base
		`

		const whereClause = intervalo ? 'WHERE fecha_calificacion >= NOW() - CAST($1 AS INTERVAL)' : ''

		const tailQuery = `
			GROUP BY usuario_id, nombre, apellido, nombre_usuario, foto_perfil_url
			ORDER BY puntos_totales DESC
			LIMIT 5
		`

		const rankingQuery = `${baseSelect}\n${whereClause}\n${tailQuery}`
		const queryParams = intervalo ? [intervalo] : []

		const rankingResult = await db.query(rankingQuery, queryParams)

		return res.status(200).json({
			periodo,
			ranking: rankingResult.rows,
		})
	} catch (error) {
		// Delegamos errores inesperados al middleware global.
		return next(error)
	}
}
