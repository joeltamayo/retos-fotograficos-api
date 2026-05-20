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

const PERIODOS_LIMITES = {
	diario: 14,
	semanal: 12,
	mensual: 12,
	anual: 6,
	historico: 1,
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

function isValidDateString(value) {
	if (!DATE_REGEX.test(value)) {
		return false
	}

	const parsed = new Date(`${value}T00:00:00`)
	return !Number.isNaN(parsed.getTime())
}

function normalizeLimit(rawLimit, fallback) {
	const parsed = Number.parseInt(rawLimit, 10)
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback
	}

	return Math.min(parsed, 60)
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
		const inicio = req.query.inicio?.toString()
		const fin = req.query.fin?.toString()

		if ((inicio && !fin) || (!inicio && fin)) {
			return res.status(400).json({ error: 'Rango de fechas incompleto' })
		}

		if (inicio && fin) {
			if (!isValidDateString(inicio) || !isValidDateString(fin)) {
				return res.status(400).json({ error: 'Formato de fecha invalido (YYYY-MM-DD)' })
			}

			if (new Date(`${inicio}T00:00:00`) > new Date(`${fin}T00:00:00`)) {
				return res.status(400).json({ error: 'Rango de fechas invalido' })
			}
		}

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

		let whereClause = ''
		let queryParams = []

		if (inicio && fin && periodo !== 'historico') {
			whereClause = 'WHERE fecha_calificacion >= $1::date AND fecha_calificacion < ($2::date + INTERVAL \'1 day\')'
			queryParams = [inicio, fin]
		} else if (intervalo) {
			whereClause = 'WHERE fecha_calificacion >= NOW() - CAST($1 AS INTERVAL)'
			queryParams = [intervalo]
		}

		const tailQuery = `
			ORDER BY posicion
			LIMIT 5
		`

		const rankingQuery = `${baseSelect}\n${whereClause}\n${tailQuery}`

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

/**
 * GET /api/ranking/periodos
 *
 * Query params:
 * - periodo (opcional): diario | semanal | mensual | anual | historico
 * - limite (opcional): numero maximo de opciones a devolver
 */
export const getRankingPeriodos = async (req, res, next) => {
	try {
		const periodo = (req.query.periodo ?? 'semanal').toString().toLowerCase()

		if (!(periodo in PERIODOS)) {
			return res.status(400).json({ error: 'Periodo invalido' })
		}

		const limite = normalizeLimit(req.query.limite, PERIODOS_LIMITES[periodo])

		if (periodo === 'historico') {
			return res.status(200).json({
				periodo,
				opciones: [{ inicio: null, fin: null }],
			})
		}

		const consultas = {
			diario: `
				SELECT DISTINCT DATE(fecha_calificacion) AS inicio,
					DATE(fecha_calificacion) AS fin
				FROM vista_ranking_base
				ORDER BY inicio DESC
				LIMIT $1
			`,
			semanal: `
				SELECT
					DATE_TRUNC('week', fecha_calificacion)::date AS inicio,
					(DATE_TRUNC('week', fecha_calificacion)::date + INTERVAL '6 days')::date AS fin
				FROM vista_ranking_base
				GROUP BY 1, 2
				ORDER BY inicio DESC
				LIMIT $1
			`,
			mensual: `
				SELECT
					DATE_TRUNC('month', fecha_calificacion)::date AS inicio,
					(DATE_TRUNC('month', fecha_calificacion)::date + INTERVAL '1 month - 1 day')::date AS fin
				FROM vista_ranking_base
				GROUP BY 1, 2
				ORDER BY inicio DESC
				LIMIT $1
			`,
			anual: `
				SELECT
					DATE_TRUNC('year', fecha_calificacion)::date AS inicio,
					(DATE_TRUNC('year', fecha_calificacion)::date + INTERVAL '1 year - 1 day')::date AS fin
				FROM vista_ranking_base
				GROUP BY 1, 2
				ORDER BY inicio DESC
				LIMIT $1
			`,
		}

		const query = consultas[periodo]
		const result = await db.query(query, [limite])

		return res.status(200).json({
			periodo,
			opciones: result.rows,
		})
	} catch (error) {
		return next(error)
	}
}
