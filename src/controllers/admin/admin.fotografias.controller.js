// ============================================================
//  Controlador Admin de Fotografias
//
//  Este modulo concentra la logica de administracion para:
//  - listar fotografias con filtros, paginacion y resumen global
//  - consultar detalle de una fotografia
//  - cambiar estado de moderacion
//  - eliminar fotografia y limpiar recurso en Cloudinary
// ============================================================

import db from '../../config/db.js'
import { eliminarImagen } from '../../services/cloudinary.service.js'

const ESTADOS_VALIDOS = ['revision', 'aprobada', 'desaprobada']

// Crea errores HTTP consistentes para el middleware global.
const createHttpError = (status, message) => {
	const error = new Error(message)
	error.status = status
	return error
}

// Convierte a entero positivo; si no puede, usa un valor por defecto.
const toPositiveInt = (value, defaultValue) => {
	const parsed = Number.parseInt(value, 10)
	return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue
}

// Valida strings no vacios (despues de trim).
const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== ''

// Valida UUID canonico para evitar errores SQL de casteo.
const parseUuid = (valueRaw, fieldName) => {
	if (!isNonEmptyString(valueRaw)) {
		throw createHttpError(400, `${fieldName} es obligatorio`)
	}

	const value = valueRaw.trim()
	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

	if (!uuidRegex.test(value)) {
		throw createHttpError(400, `${fieldName} invalido`)
	}

	return value
}

// Valida estado permitido para fotografias.
const parseEstado = (estadoRaw, fieldName = 'estado') => {
	if (!isNonEmptyString(estadoRaw)) {
		throw createHttpError(400, `${fieldName} es obligatorio`)
	}

	const estado = estadoRaw.trim().toLowerCase()

	if (!ESTADOS_VALIDOS.includes(estado)) {
		throw createHttpError(400, `${fieldName} invalido`)
	}

	return estado
}

// Construye WHERE dinamico para filtros de GET admin fotografias.
const buildGetFotografiasFilters = ({ estado, retoId }) => {
	const conditions = []
	const params = []

	if (estado) {
		params.push(estado)
		conditions.push(`f.estado = $${params.length}`)
	}

	if (retoId) {
		params.push(retoId)
		conditions.push(`f.reto_id = $${params.length}`)
	}

	const whereClause = conditions.length > 0
		? ` WHERE ${conditions.join(' AND ')}`
		: ''

	return { whereClause, params }
}

/**
 * GET /api/admin/fotografias
 *
 * Query params:
 * - estado
 * - reto_id
 * - pagina (default 1)
 * - limite (default 10)
 *
 * Respuesta:
 * { resumen, total, fotografias: [...] }
 */
export const getfotografias = async (req, res, next) => {
	try {
		const pagina = toPositiveInt(req.query.pagina, 1)
		const limite = toPositiveInt(req.query.limite, 10)
		const offset = (pagina - 1) * limite

		const estado = req.query.estado
			? parseEstado(req.query.estado, 'estado')
			: null

		const retoId = req.query.reto_id !== undefined
			? parseUuid(req.query.reto_id, 'reto_id')
			: null

		const { whereClause, params } = buildGetFotografiasFilters({ estado, retoId })

		const resumenQuery = `
			SELECT
				COUNT(*)::int AS total,
				COUNT(*) FILTER (WHERE estado = 'revision')::int AS en_revision,
				COUNT(*) FILTER (WHERE estado = 'aprobada')::int AS aprobadas,
				COUNT(*) FILTER (WHERE estado = 'desaprobada')::int AS desaprobadas
			FROM fotografias
		`

		const totalQuery = `
			SELECT COUNT(*)::int AS total
			FROM fotografias f
			${whereClause}
		`

		const fotografiasQuery = `
			SELECT
				f.id,
				f.titulo,
				f.descripcion,
				f.imagen_url,
				f.imagen_public_id,
				f.estado,
				f.created_at,
				f.updated_at,
				f.usuario_id,
				f.reto_id,
				u.nombre_usuario,
				r.titulo AS reto_titulo,
				COUNT(DISTINCT c.id)::int AS total_calificaciones,
				COUNT(DISTINCT cm.id)::int AS total_comentarios,
				COALESCE(ROUND(AVG(c.creatividad + c.composicion + c.tema), 2), 0) AS puntuacion_total
			FROM fotografias f
			JOIN usuarios u ON u.id = f.usuario_id
			JOIN retos r ON r.id = f.reto_id
			LEFT JOIN calificaciones c ON c.fotografia_id = f.id
			LEFT JOIN comentarios cm ON cm.fotografia_id = f.id
			${whereClause}
			GROUP BY f.id, u.nombre_usuario, r.titulo
			ORDER BY f.created_at DESC
			LIMIT $${params.length + 1}
			OFFSET $${params.length + 2}
		`

		const [resumenResult, totalResult, fotografiasResult] = await Promise.all([
			db.query(resumenQuery),
			db.query(totalQuery, params),
			db.query(fotografiasQuery, [...params, limite, offset]),
		])

		return res.status(200).json({
			resumen: resumenResult.rows[0],
			total: totalResult.rows[0]?.total ?? 0,
			fotografias: fotografiasResult.rows,
		})
	} catch (error) {
		return next(error)
	}
}

/**
 * GET /api/admin/fotografias/:fotografiaId
 *
 * Obtiene detalle completo de una fotografia por ID.
 */
export const getFotografia = async (req, res, next) => {
	try {
		const fotografiaId = parseUuid(req.params.fotografiaId, 'fotografiaId')

		const result = await db.query(
			`SELECT *
			 FROM vista_detalle_fotografia
			 WHERE id = $1
			 LIMIT 1`,
			[fotografiaId]
		)

		if (result.rowCount === 0) {
			return next(createHttpError(404, 'Fotografia no encontrada'))
		}

		return res.status(200).json(result.rows[0])
	} catch (error) {
		return next(error)
	}
}

/**
 * PATCH /api/admin/fotografias/:fotografiaId/estado
 *
 * Body:
 * { estado }
 */
export const cambiarEstado = async (req, res, next) => {
	try {
		const fotografiaId = parseUuid(req.params.fotografiaId, 'fotografiaId')
		const estado = parseEstado(req.body?.estado)

		const result = await db.query(
			`UPDATE fotografias
			 SET estado = $1
			 WHERE id = $2
			 RETURNING id, estado`,
			[estado, fotografiaId]
		)

		if (result.rowCount === 0) {
			return next(createHttpError(404, 'Fotografia no encontrada'))
		}

		return res.status(200).json(result.rows[0])
	} catch (error) {
		return next(error)
	}
}

/**
 * DELETE /api/admin/fotografias/:fotografiaId
 *
 * Flujo:
 * 1) Obtener imagen_public_id de BD
 * 2) Eliminar imagen en Cloudinary (si existe)
 * 3) Eliminar fotografia en BD (CASCADE borra relaciones)
 */
export const eliminarFotografia = async (req, res, next) => {
	try {
		const fotografiaId = parseUuid(req.params.fotografiaId, 'fotografiaId')

		const fotografiaResult = await db.query(
			`SELECT id, imagen_public_id
			 FROM fotografias
			 WHERE id = $1
			 LIMIT 1`,
			[fotografiaId]
		)

		if (fotografiaResult.rowCount === 0) {
			return next(createHttpError(404, 'Fotografia no encontrada'))
		}

		const fotografia = fotografiaResult.rows[0]

		if (isNonEmptyString(fotografia.imagen_public_id)) {
			await eliminarImagen(fotografia.imagen_public_id)
		}

		await db.query('DELETE FROM fotografias WHERE id = $1', [fotografiaId])

		return res.status(200).json({ ok: true })
	} catch (error) {
		return next(error)
	}
}
