// ============================================================
//  Controlador de Comentarios
//
//  Este modulo contiene la logica para:
//  - listar comentarios de una fotografia
//  - crear un comentario nuevo
//  - eliminar un comentario propio
//
//  El router solo define rutas y middlewares.
//  Aqui se aplican validaciones de negocio y consultas SQL.
// ============================================================

import db from '../config/db.js'

// Convierte cualquier valor a entero positivo.
// Si llega invalido, se usa un valor por defecto.
const toPositiveInt = (value, defaultValue) => {
	const parsed = Number.parseInt(value, 10)

	if (Number.isNaN(parsed) || parsed < 1) {
		return defaultValue
	}

	return parsed
}

// Estandariza la creacion de errores HTTP para manejo centralizado.
const createHttpError = (status, message) => {
	const error = new Error(message)
	error.status = status
	return error
}

/**
 * GET /api/fotografias/:fotografiaId/comentarios
 *
 * Query params:
 * - pagina (default 1)
 * - limite (default 20)
 */
export const getComentarios = async (req, res, next) => {
	try {
		const { fotografiaId } = req.params
		const pagina = toPositiveInt(req.query.pagina, 1)
		const limite = toPositiveInt(req.query.limite, 20)
		const offset = (pagina - 1) * limite

		const totalQuery = `
			SELECT COUNT(*)::int AS total
			FROM comentarios
			WHERE fotografia_id = $1
		`

		const comentariosQuery = `
			SELECT
				com.id,
				com.contenido,
				com.created_at,
				u.id AS usuario_id,
				u.nombre_usuario,
				u.foto_perfil_url
			FROM comentarios com
			JOIN usuarios u ON u.id = com.usuario_id
			WHERE com.fotografia_id = $1
			ORDER BY com.created_at ASC
			LIMIT $2 OFFSET $3
		`

		const [totalResult, comentariosResult] = await Promise.all([
			db.query(totalQuery, [fotografiaId]),
			db.query(comentariosQuery, [fotografiaId, limite, offset]),
		])

		return res.status(200).json({
			total: totalResult.rows[0]?.total ?? 0,
			comentarios: comentariosResult.rows,
		})
	} catch (error) {
		return next(error)
	}
}

/**
 * POST /api/fotografias/:fotografiaId/comentarios
 *
 * Body:
 * - contenido (obligatorio)
 */
export const comentar = async (req, res, next) => {
	try {
		const { fotografiaId } = req.params
		const usuarioId = req.usuario?.id
		const contenido = String(req.body?.contenido ?? '').trim()

		if (!usuarioId) {
			throw createHttpError(401, 'No autorizado')
		}

		if (!contenido) {
			throw createHttpError(400, 'El contenido del comentario es obligatorio')
		}

		// Solo se permite comentar fotos publicas (estado aprobada).
		const fotoResult = await db.query(
			`
				SELECT id
				FROM fotografias
				WHERE id = $1 AND estado = 'aprobada'
				LIMIT 1
			`,
			[fotografiaId]
		)

		if (fotoResult.rowCount === 0) {
			throw createHttpError(404, 'Fotografia no encontrada')
		}

		// Insertamos y en la misma consulta unimos los datos del autor.
		const comentarioResult = await db.query(
			`
				WITH nuevo_comentario AS (
					INSERT INTO comentarios (fotografia_id, usuario_id, contenido)
					VALUES ($1, $2, $3)
					RETURNING id, contenido, created_at, usuario_id
				)
				SELECT
					nc.id,
					nc.contenido,
					nc.created_at,
					u.nombre_usuario,
					u.foto_perfil_url
				FROM nuevo_comentario nc
				JOIN usuarios u ON u.id = nc.usuario_id
			`,
			[fotografiaId, usuarioId, contenido]
		)

		return res.status(201).json(comentarioResult.rows[0])
	} catch (error) {
		return next(error)
	}
}

/**
 * DELETE /api/fotografias/:fotografiaId/comentarios/:comentarioId
 *
 * Reglas:
 * - El comentario debe existir en esa fotografia
 * - Solo el autor del comentario puede eliminarlo
 */
export const eliminarComentario = async (req, res, next) => {
	try {
		const { fotografiaId, comentarioId } = req.params
		const usuarioId = req.usuario?.id

		if (!usuarioId) {
			throw createHttpError(401, 'No autorizado')
		}

		const comentarioResult = await db.query(
			`
				SELECT id, usuario_id
				FROM comentarios
				WHERE id = $1 AND fotografia_id = $2
				LIMIT 1
			`,
			[comentarioId, fotografiaId]
		)

		if (comentarioResult.rowCount === 0) {
			throw createHttpError(404, 'Comentario no encontrado')
		}

		if (comentarioResult.rows[0].usuario_id !== usuarioId) {
			throw createHttpError(403, 'No puedes eliminar un comentario que no es tuyo')
		}

		await db.query('DELETE FROM comentarios WHERE id = $1', [comentarioId])

		return res.status(200).json({ ok: true })
	} catch (error) {
		return next(error)
	}
}
