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

		// Query base para ranking de FOTOS (no de usuarios).
		// El promedio total se calcula aquí para no depender de una
		// columna materializada en la vista.
		const baseSelect = `
			WITH ranking_base AS (
				SELECT
					fotografia_id,
					foto_titulo,
					foto_url,
					imagen_public_id,
					usuario_id,
					nombre,
					apellido,
					nombre_usuario,
					foto_perfil_url,
					foto_perfil_public_id,
					reto_id,
					reto_titulo,
					puntos_totales,
					(prom_creatividad + prom_composicion + prom_tema) AS promedio_total,
					total_calificaciones,
					prom_creatividad,
					prom_composicion,
					prom_tema,
					fecha_calificacion
				FROM vista_ranking_base
			)
			SELECT
				ROW_NUMBER() OVER (ORDER BY promedio_total DESC NULLS LAST, total_calificaciones DESC, puntos_totales DESC) AS posicion,
				fotografia_id,
				foto_titulo,
				foto_url,
				imagen_public_id,
				usuario_id,
				nombre,
				apellido,
				nombre_usuario,
				foto_perfil_url,
				foto_perfil_public_id,
				reto_id,
				reto_titulo,
				puntos_totales,
				promedio_total,
				total_calificaciones,
				prom_creatividad,
				prom_composicion,
				prom_tema
			FROM ranking_base
		`

		const whereClause = intervalo ? 'WHERE fecha_calificacion >= NOW() - CAST($1 AS INTERVAL)' : ''

		const tailQuery = `
			ORDER BY posicion
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
