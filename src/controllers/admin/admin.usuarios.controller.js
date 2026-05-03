// ============================================================
//  Controlador Admin de Usuarios
//
//  Este modulo concentra la logica de administracion para:
//  - listar usuarios con filtros, paginacion y resumen global
//  - consultar detalle de un usuario por ID
//  - cambiar estado de cuenta (activo/suspendido)
//  - cambiar rol (usuario/administrador)
// ============================================================

import db from '../../config/db.js'

const ESTADOS_VALIDOS = ['activo', 'suspendido']
const ROLES_VALIDOS = ['usuario', 'administrador']

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

const parseEstado = (estadoRaw) => {
	if (!isNonEmptyString(estadoRaw)) {
		throw createHttpError(400, 'estado es obligatorio')
	}

	const estado = estadoRaw.trim().toLowerCase()

	if (!ESTADOS_VALIDOS.includes(estado)) {
		throw createHttpError(400, 'estado invalido')
	}

	return estado
}

const parseRol = (rolRaw) => {
	if (!isNonEmptyString(rolRaw)) {
		throw createHttpError(400, 'rol es obligatorio')
	}

	const rol = rolRaw.trim().toLowerCase()

	if (!ROLES_VALIDOS.includes(rol)) {
		throw createHttpError(400, 'rol invalido')
	}

	return rol
}

// Construye WHERE dinamico para filtros de listado.
const buildGetUsuariosFilters = ({ rol, estado, buscar }) => {
	const conditions = []
	const params = []

	if (rol) {
		params.push(rol)
		conditions.push(`u.rol = $${params.length}`)
	}

	if (estado) {
		params.push(estado)
		conditions.push(`u.estado = $${params.length}`)
	}

	if (buscar) {
		params.push(`%${buscar}%`)
		conditions.push(
			`(
				u.nombre_usuario ILIKE $${params.length}
				OR u.correo ILIKE $${params.length}
				OR u.nombre ILIKE $${params.length}
			)`
		)
	}

	const whereClause = conditions.length > 0
		? ` WHERE ${conditions.join(' AND ')}`
		: ''

	return { whereClause, params }
}

/**
 * GET /api/admin/usuarios
 *
 * Query params:
 * - rol
 * - estado
 * - buscar
 * - pagina (default 1)
 * - limite (default 10)
 *
 * Respuesta:
 * { resumen, total, usuarios: [...] }
 */
export const getUsuarios = async (req, res, next) => {
	try {
		const pagina = toPositiveInt(req.query.pagina, 1)
		const limite = toPositiveInt(req.query.limite, 10)
		const offset = (pagina - 1) * limite

		const rol = req.query.rol !== undefined
			? parseRol(req.query.rol)
			: null

		const estado = req.query.estado !== undefined
			? parseEstado(req.query.estado)
			: null

		const buscar = isNonEmptyString(req.query.buscar)
			? req.query.buscar.trim()
			: null

		const { whereClause, params } = buildGetUsuariosFilters({ rol, estado, buscar })

		const resumenQuery = `
			SELECT
				COUNT(*)::int AS total,
				COUNT(*) FILTER (WHERE estado = 'activo')::int AS activos,
				COUNT(*) FILTER (WHERE estado = 'suspendido')::int AS suspendidos
			FROM usuarios
			WHERE rol = 'usuario'
		`

		const totalQuery = `
			SELECT COUNT(*)::int AS total
			FROM usuarios u
			${whereClause}
		`

		const usuariosQuery = `
			SELECT
				u.id,
				u.nombre,
				u.apellido,
				u.nombre_usuario,
				u.correo,
				u.foto_perfil_url,
				u.rol,
				u.estado,
				u.created_at,
				u.ultimo_login,
				(
					SELECT COUNT(*)::int
					FROM fotografias f
					WHERE f.usuario_id = u.id
				) AS total_fotos,
				(
					SELECT COUNT(*)::int
					FROM participaciones p
					WHERE p.usuario_id = u.id
				) AS total_retos
			FROM usuarios u
			${whereClause}
			ORDER BY u.created_at DESC
			LIMIT $${params.length + 1}
			OFFSET $${params.length + 2}
		`

		const [resumenResult, totalResult, usuariosResult] = await Promise.all([
			db.query(resumenQuery),
			db.query(totalQuery, params),
			db.query(usuariosQuery, [...params, limite, offset]),
		])

		return res.status(200).json({
			resumen: resumenResult.rows[0],
			total: totalResult.rows[0]?.total ?? 0,
			usuarios: usuariosResult.rows,
		})
	} catch (error) {
		return next(error)
	}
}

/**
 * GET /api/admin/usuarios/:usuarioId
 *
 * Obtiene detalle de perfil por ID para uso administrativo.
 */
export const getUsuarioPorId = async (req, res, next) => {
	try {
		const usuarioId = parseUuid(req.params.usuarioId, 'usuarioId')

		const perfilResult = await db.query(
			`SELECT *
			 FROM vista_perfil_usuario
			 WHERE id = $1
			 LIMIT 1`,
			[usuarioId]
		)

		if (perfilResult.rowCount === 0) {
			return next(createHttpError(404, 'Usuario no encontrado'))
		}

		const perfil = perfilResult.rows[0]

		// Forzamos incluir correo para contexto administrativo.
		const correoResult = await db.query(
			`SELECT correo
			 FROM usuarios
			 WHERE id = $1
			 LIMIT 1`,
			[usuarioId]
		)

		if (correoResult.rowCount === 0) {
			return next(createHttpError(404, 'Usuario no encontrado'))
		}

		return res.status(200).json({
			...perfil,
			correo: correoResult.rows[0].correo,
		})
	} catch (error) {
		return next(error)
	}
}

/**
 * PATCH /api/admin/usuarios/:usuarioId/estado
 *
 * Body:
 * { estado }
 */
export const cambiarEstado = async (req, res, next) => {
	let client

	try {
		const usuarioId = parseUuid(req.params.usuarioId, 'usuarioId')
		const estado = parseEstado(req.body?.estado)

		client = await db.connect()
		await client.query('BEGIN')

		const updateResult = await client.query(
			`UPDATE usuarios
			 SET estado = $1
			 WHERE id = $2
			 RETURNING id, estado`,
			[estado, usuarioId]
		)

		if (updateResult.rowCount === 0) {
			await client.query('ROLLBACK')
			return next(createHttpError(404, 'Usuario no encontrado'))
		}

		if (estado === 'suspendido') {
			await client.query(
				`DELETE FROM refresh_tokens
				 WHERE usuario_id = $1`,
				[usuarioId]
			)
		}

		await client.query('COMMIT')
		return res.status(200).json(updateResult.rows[0])
	} catch (error) {
		if (client) {
			await client.query('ROLLBACK')
		}
		return next(error)
	} finally {
		if (client) {
			client.release()
		}
	}
}

/**
 * PATCH /api/admin/usuarios/:usuarioId/rol
 *
 * Body:
 * { rol }
 */
export const cambiarRol = async (req, res, next) => {
	try {
		const usuarioId = parseUuid(req.params.usuarioId, 'usuarioId')
		const rol = parseRol(req.body?.rol)

		const result = await db.query(
			`UPDATE usuarios
			 SET rol = $1
			 WHERE id = $2
			 RETURNING id, rol`,
			[rol, usuarioId]
		)

		if (result.rowCount === 0) {
			return next(createHttpError(404, 'Usuario no encontrado'))
		}

		return res.status(200).json(result.rows[0])
	} catch (error) {
		return next(error)
	}
}

/**
 * DELETE /api/admin/usuarios/:usuarioId
 *
 * Elimina un usuario y todos sus datos relacionados (fotografias, participaciones, etc).
 * Operacion en transaccion para garantizar consistencia.
 */
export const deleteUsuario = async (req, res, next) => {
	let client

	try {
		const usuarioId = parseUuid(req.params.usuarioId, 'usuarioId')

		client = await db.connect()
		await client.query('BEGIN')

		// Verificar que el usuario existe
		const checkResult = await client.query(
			`SELECT id FROM usuarios WHERE id = $1`,
			[usuarioId]
		)

		if (checkResult.rowCount === 0) {
			await client.query('ROLLBACK')
			return next(createHttpError(404, 'Usuario no encontrado'))
		}

		// Eliminar comentarios del usuario
		await client.query(
			`DELETE FROM comentarios WHERE usuario_id = $1`,
			[usuarioId]
		)

		// Eliminar calificaciones del usuario
		await client.query(
			`DELETE FROM calificaciones WHERE usuario_id = $1`,
			[usuarioId]
		)

		// Eliminar fotografias del usuario (y sus calificaciones/comentarios asociados)
		await client.query(
			`DELETE FROM fotografias WHERE usuario_id = $1`,
			[usuarioId]
		)

		// Eliminar participaciones del usuario
		await client.query(
			`DELETE FROM participaciones WHERE usuario_id = $1`,
			[usuarioId]
		)

		// Eliminar refresh tokens
		await client.query(
			`DELETE FROM refresh_tokens WHERE usuario_id = $1`,
			[usuarioId]
		)

		// Eliminar el usuario
		const deleteResult = await client.query(
			`DELETE FROM usuarios WHERE id = $1 RETURNING id`,
			[usuarioId]
		)

		await client.query('COMMIT')

		return res.status(200).json({
			message: 'Usuario eliminado correctamente',
			id: deleteResult.rows[0]?.id,
		})
	} catch (error) {
		if (client) {
			await client.query('ROLLBACK')
		}
		return next(error)
	} finally {
		if (client) {
			client.release()
		}
	}
}
