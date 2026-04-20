// ============================================================
//  Controlador de Retos
//
//  Este modulo concentra la logica de lectura/accion para:
//  - listar retos activos y finalizados con filtros
//  - obtener detalle de un reto con fotos relacionadas
//  - registrar la participacion de un usuario en un reto
//
//  El router solo define URLs; aqui se arma la consulta SQL,
//  se ejecuta la logica y se construyen las respuestas JSON.
// ============================================================

import db from '../config/db.js'

// Convierte un valor en entero positivo.
// Si llega invalido, usa el valor por defecto para evitar errores.
const toPositiveInt = (value, defaultValue) => {
	const parsed = Number.parseInt(value, 10)

	if (Number.isNaN(parsed) || parsed < 1) {
		return defaultValue
	}

	return parsed
}

// Estandariza errores HTTP para que el middleware global
// los responda con el status y mensaje correctos.
const createHttpError = (status, message) => {
	const error = new Error(message)
	error.status = status
	return error
}

// Construye WHERE dinamico para filtros opcionales de retos.
// - etiqueta se filtra contra el array etiquetas de la vista
// - categoria_id se compara de forma directa
const buildRetosFilters = ({ etiqueta, categoriaId }) => {
	const conditions = []
	const params = []

	if (etiqueta) {
		params.push(etiqueta)
		conditions.push(`$${params.length} = ANY(etiquetas)`)
	}

	if (categoriaId) {
		params.push(categoriaId)
		conditions.push(`categoria_id = $${params.length}`)
	}

	const whereClause = conditions.length > 0
		? ` WHERE ${conditions.join(' AND ')}`
		: ''

	return { whereClause, params }
}

/**
 * GET /api/retos/activos
 *
 * Query params opcionales:
 * - etiqueta
 * - categoria_id
 * - pagina (default 1)
 * - limite (default 9)
 */
export const getRetosActivos = async (req, res, next) => {
	try {
		const pagina = toPositiveInt(req.query.pagina, 1)
		const limite = toPositiveInt(req.query.limite, 9)
		const offset = (pagina - 1) * limite

		const { etiqueta, categoria_id: categoriaId } = req.query
		const { whereClause, params } = buildRetosFilters({ etiqueta, categoriaId })

		const totalQuery = `
			SELECT COUNT(*)::int AS total
			FROM vista_retos_activos
			${whereClause}
		`

		const retosQuery = `
			SELECT *
			FROM vista_retos_activos
			${whereClause}
			ORDER BY fecha_fin ASC
			LIMIT $${params.length + 1}
			OFFSET $${params.length + 2}
		`

		const [totalResult, retosResult] = await Promise.all([
			db.query(totalQuery, params),
			db.query(retosQuery, [...params, limite, offset]),
		])

		return res.status(200).json({
			total: totalResult.rows[0]?.total ?? 0,
			pagina,
			limite,
			retos: retosResult.rows,
		})
	} catch (error) {
		return next(error)
	}
}

/**
 * GET /api/retos/finalizados
 *
 * Mismos filtros y paginacion que /activos,
 * pero consultando vista_retos_finalizados.
 */
export const getRetosFinalizados = async (req, res, next) => {
	try {
		const pagina = toPositiveInt(req.query.pagina, 1)
		const limite = toPositiveInt(req.query.limite, 9)
		const offset = (pagina - 1) * limite

		const { etiqueta, categoria_id: categoriaId } = req.query
		const { whereClause, params } = buildRetosFilters({ etiqueta, categoriaId })

		const totalQuery = `
			SELECT COUNT(*)::int AS total
			FROM vista_retos_finalizados
			${whereClause}
		`

		const retosQuery = `
			SELECT *
			FROM vista_retos_finalizados
			${whereClause}
			ORDER BY fecha_fin DESC
			LIMIT $${params.length + 1}
			OFFSET $${params.length + 2}
		`

		const [totalResult, retosResult] = await Promise.all([
			db.query(totalQuery, params),
			db.query(retosQuery, [...params, limite, offset]),
		])

		return res.status(200).json({
			total: totalResult.rows[0]?.total ?? 0,
			pagina,
			limite,
			retos: retosResult.rows,
		})
	} catch (error) {
		return next(error)
	}
}

/**
 * GET /api/retos/:retoId
 *
 * Query params para paginacion de fotos:
 * - pagina (default 1)
 * - limite (default 12)
 */
export const getRetoPorId = async (req, res, next) => {
	try {
		const { retoId } = req.params
		const pagina = toPositiveInt(req.query.pagina, 1)
		const limite = toPositiveInt(req.query.limite, 12)
		const offset = (pagina - 1) * limite

		const retoQuery = `
			SELECT *
			FROM vista_retos_activos
			WHERE id = $1

			UNION

			SELECT *
			FROM vista_retos_finalizados
			WHERE id = $1

			LIMIT 1
		`

		const top5Query = `
			SELECT *
			FROM vista_fotos_por_reto
			WHERE reto_id = $1
			ORDER BY puntuacion_promedio DESC
			LIMIT 5
		`

		const fotosPaginadasQuery = `
			SELECT *
			FROM vista_fotos_por_reto
			WHERE reto_id = $1
			ORDER BY created_at DESC
			LIMIT $2
			OFFSET $3
		`

		const totalFotosQuery = `
			SELECT COUNT(*)::int AS total
			FROM vista_fotos_por_reto
			WHERE reto_id = $1
		`

		const [retoResult, top5Result, fotosResult, totalFotosResult] = await Promise.all([
			db.query(retoQuery, [retoId]),
			db.query(top5Query, [retoId]),
			db.query(fotosPaginadasQuery, [retoId, limite, offset]),
			db.query(totalFotosQuery, [retoId]),
		])

		if (retoResult.rowCount === 0) {
			throw createHttpError(404, 'Reto no encontrado')
		}

		return res.status(200).json({
			reto: retoResult.rows[0],
			top5: top5Result.rows,
			fotografias: {
				total: totalFotosResult.rows[0]?.total ?? 0,
				pagina,
				items: fotosResult.rows,
			},
		})
	} catch (error) {
		return next(error)
	}
}

/**
 * POST /api/retos/:retoId/participar
 *
 * Requiere req.usuario.id (inyectado por verificarToken).
 */
export const participar = async (req, res, next) => {
	try {
		const { retoId } = req.params
		const usuarioId = req.usuario?.id

		if (!usuarioId) {
			throw createHttpError(401, 'No autorizado')
		}

		// Debe existir y estar activo para permitir participacion.
		const retoActivoResult = await db.query(
			"SELECT id FROM retos WHERE id = $1 AND estado = 'activo' LIMIT 1",
			[retoId]
		)

		if (retoActivoResult.rowCount === 0) {
			throw createHttpError(400, 'El reto no existe o no esta activo')
		}

		const participacionResult = await db.query(
			`
				INSERT INTO participaciones (usuario_id, reto_id)
				VALUES ($1, $2)
				ON CONFLICT (usuario_id, reto_id) DO NOTHING
				RETURNING id
			`,
			[usuarioId, retoId]
		)

		if (participacionResult.rowCount === 0) {
			throw createHttpError(409, 'Ya estás participando en este reto')
		}

		return res.status(201).json({
			participacion_id: participacionResult.rows[0].id,
			mensaje: 'Te has unido al reto correctamente',
		})
	} catch (error) {
		return next(error)
	}
}
