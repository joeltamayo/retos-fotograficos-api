// ============================================================
//  Controlador de Calificaciones
//
//  Este archivo maneja la logica de:
//  - Consultar la calificacion que el usuario actual dio a una foto
//  - Crear o actualizar esa calificacion
//
//  Objetivo: mantener el router limpio y concentrar aqui las
//  validaciones de negocio y operaciones a base de datos.
// ============================================================

import db from '../config/db.js'

// Helper simple para crear errores con codigo HTTP.
// El middleware global de errores convertira esto en JSON.
const createHttpError = (status, message) => {
	const error = new Error(message)
	error.status = status
	return error
}

// Convierte un valor a entero y valida que este en [1, 5].
// Retorna null si no es valido.
const parsePuntaje = (value) => {
	const numero = Number(value)
	if (!Number.isInteger(numero)) {
		return null
	}

	if (numero < 1 || numero > 5) {
		return null
	}

	return numero
}

/**
 * GET /api/fotografias/:fotografiaId/calificaciones/mia
 *
 * Devuelve la calificacion del usuario autenticado sobre una foto.
 * Si no existe, devuelve calificacion: null.
 */
export const getMiCalificacion = async (req, res, next) => {
	try {
		const { fotografiaId } = req.params
		const usuarioId = req.usuario?.id

		if (!usuarioId) {
			throw createHttpError(401, 'No autorizado')
		}

		const resultado = await db.query(
			`
				SELECT creatividad, composicion, tema
				FROM calificaciones
				WHERE fotografia_id = $1 AND usuario_id = $2
				LIMIT 1
			`,
			[fotografiaId, usuarioId]
		)

		if (resultado.rowCount === 0) {
			return res.status(200).json({ calificacion: null })
		}

		const { creatividad, composicion, tema } = resultado.rows[0]

		return res.status(200).json({
			calificacion: {
				creatividad,
				composicion,
				tema,
				total: creatividad + composicion + tema,
			},
		})
	} catch (error) {
		return next(error)
	}
}

/**
 * POST /api/fotografias/:fotografiaId/calificaciones
 *
 * Crea o actualiza la calificacion del usuario autenticado.
 * Reglas:
 * - Cada criterio debe ser entero entre 1 y 5
 * - La foto debe existir y estar aprobada
 * - El autor de la foto no puede calificarse a si mismo
 */
export const calificar = async (req, res, next) => {
	try {
		const { fotografiaId } = req.params
		const usuarioId = req.usuario?.id
		const creatividad = parsePuntaje(req.body?.creatividad)
		const composicion = parsePuntaje(req.body?.composicion)
		const tema = parsePuntaje(req.body?.tema)

		if (!usuarioId) {
			throw createHttpError(401, 'No autorizado')
		}

		// Validar los 3 criterios requeridos y su rango permitido.
		if (creatividad === null || composicion === null || tema === null) {
			throw createHttpError(400, 'creatividad, composicion y tema deben ser enteros entre 1 y 5')
		}

		// Verifica existencia de la foto y recupera su autor.
		const fotoResult = await db.query(
			`
				SELECT usuario_id, estado
				FROM fotografias
				WHERE id = $1
				LIMIT 1
			`,
			[fotografiaId]
		)

		if (fotoResult.rowCount === 0 || fotoResult.rows[0].estado !== 'aprobada') {
			throw createHttpError(404, 'Fotografia no encontrada')
		}

		// Regla de negocio: no se permite autocalificacion.
		if (fotoResult.rows[0].usuario_id === usuarioId) {
			throw createHttpError(403, 'No puedes calificar tu propia fotografia')
		}

		// Verificamos si ya existe para decidir si respondemos 200 o 201.
		const existenteResult = await db.query(
			`
				SELECT 1
				FROM calificaciones
				WHERE fotografia_id = $1 AND usuario_id = $2
				LIMIT 1
			`,
			[fotografiaId, usuarioId]
		)

		await db.query(
			`
				INSERT INTO calificaciones (
					fotografia_id,
					usuario_id,
					creatividad,
					composicion,
					tema
				)
				VALUES ($1, $2, $3, $4, $5)
				ON CONFLICT (fotografia_id, usuario_id)
				DO UPDATE SET
					creatividad = $3,
					composicion = $4,
					tema = $5,
					updated_at = NOW()
			`,
			[fotografiaId, usuarioId, creatividad, composicion, tema]
		)

		const statusCode = existenteResult.rowCount > 0 ? 200 : 201

		return res.status(statusCode).json({
			creatividad,
			composicion,
			tema,
			total: creatividad + composicion + tema,
		})
	} catch (error) {
		return next(error)
	}
}
