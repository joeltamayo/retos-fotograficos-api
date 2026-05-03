// ============================================================
//  Controlador de Usuarios
//
//  Este modulo concentra la logica de:
//  - Consultar perfil publico/propio
//  - Consultar fotos de un usuario
//  - Consultar participaciones del usuario autenticado
//  - Editar perfil (incluyendo foto y contrasena)
// ============================================================

import bcrypt from 'bcrypt'
import db from '../config/db.js'
import { subirImagen } from '../services/cloudinary.service.js'

const SALT_ROUNDS = 12

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

// Evita duplicados por mayusculas/minusculas en correo.
const normalizeEmail = (correo) => correo.trim().toLowerCase()

/**
 * GET /api/usuarios/:nombreUsuario
 *
 * Reglas:
 * - Si no existe el usuario o esta suspendido -> 404.
 * - Si es perfil propio, incluir correo.
 * - Si es perfil ajeno, ocultar correo.
 */
export const getPerfil = async (req, res, next) => {
	try {
		const { nombreUsuario } = req.params

		if (!isNonEmptyString(nombreUsuario)) {
			return next(createHttpError(400, 'nombreUsuario es obligatorio'))
		}

		const result = await db.query(
			`SELECT *
			 FROM vista_perfil_usuario
			 WHERE nombre_usuario = $1
			 LIMIT 1`,
			[nombreUsuario.trim()]
		)

		if (result.rowCount === 0) {
			return next(createHttpError(404, 'Perfil no encontrado'))
		}

		const perfil = result.rows[0]

		if (perfil.estado === 'suspendido') {
			return next(createHttpError(404, 'Perfil no encontrado'))
		}

		const esPerfilPropio = req.usuario?.nombre_usuario === nombreUsuario.trim()

		if (esPerfilPropio) {
			return res.status(200).json(perfil)
		}

		// Omitimos correo para proteger privacidad en perfiles ajenos.
		const { correo, ...perfilPublico } = perfil
		return res.status(200).json(perfilPublico)
	} catch (error) {
		return next(error)
	}
}

/**
 * GET /api/usuarios/me
 *
 * Devuelve el perfil completo del usuario autenticado.
 */
export const getMiPerfil = async (req, res, next) => {
	try {
		const nombreUsuario = req.usuario?.nombre_usuario

		if (!isNonEmptyString(nombreUsuario)) {
			return next(createHttpError(401, 'No autorizado'))
		}

		const result = await db.query(
			`SELECT *
			 FROM vista_perfil_usuario
			 WHERE nombre_usuario = $1
			 LIMIT 1`,
			[nombreUsuario.trim()]
		)

		if (result.rowCount === 0) {
			return next(createHttpError(404, 'Perfil no encontrado'))
		}

		const perfil = result.rows[0]

		if (perfil.estado === 'suspendido') {
			return next(createHttpError(404, 'Perfil no encontrado'))
		}

		return res.status(200).json(perfil)
	} catch (error) {
		return next(error)
	}
}

/**
 * GET /api/usuarios/:nombreUsuario/fotos
 *
 * Query params:
 * - orden: recientes | mejores (default: recientes)
 * - pagina (default: 1)
 * - limite (default: 12)
 */
export const getFotosUsuario = async (req, res, next) => {
	try {
		const { nombreUsuario } = req.params
		const pagina = toPositiveInt(req.query.pagina, 1)
		const limite = toPositiveInt(req.query.limite, 12)
		const offset = (pagina - 1) * limite

		if (!isNonEmptyString(nombreUsuario)) {
			return next(createHttpError(400, 'nombreUsuario es obligatorio'))
		}

		// Paso 1: obtener usuario_id por nombre de usuario.
		const usuarioResult = await db.query(
			`SELECT id, estado
			 FROM usuarios
			 WHERE nombre_usuario = $1
			 LIMIT 1`,
			[nombreUsuario.trim()]
		)

		if (usuarioResult.rowCount === 0 || usuarioResult.rows[0].estado === 'suspendido') {
			return next(createHttpError(404, 'Usuario no encontrado'))
		}

		const usuarioId = usuarioResult.rows[0].id

		const ORDER_BY_MAP = {
			recientes: 'created_at DESC',
			mejores: 'puntuacion_promedio DESC',
		}

		const orden = (req.query.orden ?? 'recientes').toString().toLowerCase()
		const orderBy = ORDER_BY_MAP[orden] ?? ORDER_BY_MAP.recientes

		const totalQuery = `
			SELECT COUNT(*)::int AS total
			FROM vista_galeria
			WHERE usuario_id = $1
		`

		const fotosQuery = `
			SELECT *
			FROM vista_galeria
			WHERE usuario_id = $1
			ORDER BY ${orderBy}
			LIMIT $2 OFFSET $3
		`

		const [totalResult, fotosResult] = await Promise.all([
			db.query(totalQuery, [usuarioId]),
			db.query(fotosQuery, [usuarioId, limite, offset]),
		])

		return res.status(200).json({
			total: totalResult.rows[0]?.total ?? 0,
			pagina,
			fotos: fotosResult.rows,
		})
	} catch (error) {
		return next(error)
	}
}

/**
 * GET /api/usuarios/me/participaciones
 *
 * Requiere req.usuario.id (middleware verificarToken).
 */
export const getMisParticipaciones = async (req, res, next) => {
	try {
		const usuarioId = req.usuario?.id
		const pagina = toPositiveInt(req.query.pagina, 1)
		const limite = toPositiveInt(req.query.limite, 10)
		const offset = (pagina - 1) * limite

		if (!usuarioId) {
			return next(createHttpError(401, 'No autorizado'))
		}

		const totalQuery = `
			SELECT COUNT(*)::int AS total
			FROM participaciones
			WHERE usuario_id = $1
		`

		const participacionesQuery = `
			SELECT *
			FROM vista_participaciones_con_metricas
			WHERE usuario_id = $1
			ORDER BY fecha_participacion DESC
			LIMIT $2 OFFSET $3
		`

		const [totalResult, participacionesResult] = await Promise.all([
			db.query(totalQuery, [usuarioId]),
			db.query(participacionesQuery, [usuarioId, limite, offset]),
		])

		return res.status(200).json({
			total: totalResult.rows[0]?.total ?? 0,
			participaciones: participacionesResult.rows,
		})
	} catch (error) {
		return next(error)
	}
}

/**
 * PUT /api/usuarios/me
 *
 * Body multipart:
 * - nombre, apellido, nombre_usuario, correo, contrasena, biografia
 * - req.file (foto_perfil) opcional
 *
 * Reglas:
 * - Debe venir al menos un campo para actualizar.
 * - Si cambia correo o nombre_usuario, validar unicidad.
 * - Si llega imagen, se sobreescribe siempre en Cloudinary con:
 *   public_id = perfil-<usuario_id>
 */
export const editarPerfil = async (req, res, next) => {
	try {
		const usuarioId = req.usuario?.id

		if (!usuarioId) {
			return next(createHttpError(401, 'No autorizado'))
		}

		const {
			nombre,
			apellido,
			nombre_usuario: nombreUsuario,
			correo,
			contrasena,
			biografia,
		} = req.body

		const fotoPerfil = req.file

		const hayCamposTexto = [nombre, apellido, nombreUsuario, correo, contrasena, biografia]
			.some((valor) => valor !== undefined)

		if (!hayCamposTexto && !fotoPerfil) {
			return next(createHttpError(400, 'Debes enviar al menos un campo para actualizar'))
		}

		const actualResult = await db.query(
			`SELECT id, nombre_usuario, correo, foto_perfil_url, foto_perfil_public_id
			 FROM usuarios
			 WHERE id = $1
			 LIMIT 1`,
			[usuarioId]
		)

		if (actualResult.rowCount === 0) {
			return next(createHttpError(404, 'Usuario no encontrado'))
		}

		const usuarioActual = actualResult.rows[0]

		const updates = []
		const params = [usuarioId]

		const agregarCampoUpdate = (columna, valor) => {
			params.push(valor)
			updates.push(`${columna} = $${params.length}`)
		}

		if (nombre !== undefined) {
			if (!isNonEmptyString(nombre)) {
				return next(createHttpError(400, 'nombre no puede ser vacio'))
			}
			agregarCampoUpdate('nombre', nombre.trim())
		}

		if (apellido !== undefined) {
			if (!isNonEmptyString(apellido)) {
				return next(createHttpError(400, 'apellido no puede ser vacio'))
			}
			agregarCampoUpdate('apellido', apellido.trim())
		}

		if (correo !== undefined) {
			if (!isNonEmptyString(correo)) {
				return next(createHttpError(400, 'correo no puede ser vacio'))
			}

			const correoNormalizado = normalizeEmail(correo)

			if (correoNormalizado !== usuarioActual.correo) {
				const correoExisteResult = await db.query(
					`SELECT id
					 FROM usuarios
					 WHERE correo = $1 AND id <> $2
					 LIMIT 1`,
					[correoNormalizado, usuarioId]
				)

				if (correoExisteResult.rowCount > 0) {
					return next(createHttpError(409, 'El correo ya existe'))
				}
			}

			agregarCampoUpdate('correo', correoNormalizado)
		}

		if (nombreUsuario !== undefined) {
			if (!isNonEmptyString(nombreUsuario)) {
				return next(createHttpError(400, 'nombre_usuario no puede ser vacio'))
			}

			const nombreUsuarioNormalizado = nombreUsuario.trim()

			if (nombreUsuarioNormalizado !== usuarioActual.nombre_usuario) {
				const usuarioExisteResult = await db.query(
					`SELECT id
					 FROM usuarios
					 WHERE nombre_usuario = $1 AND id <> $2
					 LIMIT 1`,
					[nombreUsuarioNormalizado, usuarioId]
				)

				if (usuarioExisteResult.rowCount > 0) {
					return next(createHttpError(409, 'El nombre de usuario ya existe'))
				}
			}

			agregarCampoUpdate('nombre_usuario', nombreUsuarioNormalizado)
		}

		if (biografia !== undefined) {
			// Se permite string vacio para que el usuario pueda limpiar su biografia.
			agregarCampoUpdate('biografia', biografia)
		}

		if (contrasena !== undefined) {
			if (!isNonEmptyString(contrasena)) {
				return next(createHttpError(400, 'contrasena no puede ser vacia'))
			}

			const contrasenaHash = await bcrypt.hash(contrasena, SALT_ROUNDS)
			agregarCampoUpdate('contrasena_hash', contrasenaHash)
		}

		if (fotoPerfil) {
			const cloudinaryResult = await subirImagen(fotoPerfil.buffer, {
				folder: 'retos-fotograficos/perfiles',
				public_id: `perfil-${usuarioId}`,
			})

			agregarCampoUpdate('foto_perfil_url', cloudinaryResult.secure_url)
			agregarCampoUpdate('foto_perfil_public_id', cloudinaryResult.public_id)
		}

		if (updates.length === 0) {
			return next(createHttpError(400, 'No hay campos validos para actualizar'))
		}

		const updateQuery = `
			UPDATE usuarios
			SET ${updates.join(', ')}
			WHERE id = $1
			RETURNING id, nombre, apellido, nombre_usuario, correo, biografia, foto_perfil_url, rol, estado, created_at AS fecha_registro, ultimo_login
		`

		const updatedResult = await db.query(updateQuery, params)
		const perfilActualizado = updatedResult.rows[0]

		// Para reducir exposicion de datos, omitimos correo en esta respuesta.
		const { correo: _correo, ...perfilRespuesta } = perfilActualizado
		return res.status(200).json(perfilRespuesta)
	} catch (error) {
		return next(error)
	}
}
