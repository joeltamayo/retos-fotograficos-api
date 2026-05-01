// ============================================================
//  Controlador de Fotografias
//
//  Este archivo contiene la logica de:
//  - Subir una fotografia a un reto (con validaciones de negocio)
//  - Consultar el detalle de una fotografia
//
//  El router solo mapea URLs; aqui se valida, se consulta y se responde.
// ============================================================

import { randomUUID } from 'node:crypto'
import db from '../config/db.js'
import { subirImagen } from '../services/cloudinary.service.js'

// Crea errores con status HTTP para que el middleware global
// los transforme en respuestas JSON consistentes.
const createHttpError = (status, message) => {
	const error = new Error(message)
	error.status = status
	return error
}

/**
 * POST /api/fotografias
 *
 * Body (multipart/form-data):
 * - reto_id (obligatorio)
 * - titulo (obligatorio)
 * - descripcion (opcional)
 * - imagen (obligatoria, llega en req.file por multer)
 */
export const subirFoto = async (req, res, next) => {
	const client = await db.connect()

	try {
		const { reto_id: retoId, titulo, descripcion = null } = req.body
		const usuarioId = req.usuario?.id
		const archivo = req.file

		// Validaciones minimas de entrada para evitar inserts incompletos.
		if (!retoId || !titulo || !archivo) {
			throw createHttpError(400, 'reto_id, titulo e imagen son obligatorios')
		}

		if (!usuarioId) {
			throw createHttpError(401, 'No autorizado')
		}

		// 1) El reto debe existir y estar activo para aceptar la foto.
		const retoActivoResult = await client.query(
			"SELECT id FROM retos WHERE id = $1 AND estado = 'activo' LIMIT 1",
			[retoId]
		)

		if (retoActivoResult.rowCount === 0) {
			throw createHttpError(400, 'El reto no existe o no esta activo')
		}

		// 2) Subir imagen a Cloudinary antes de abrir transaccion en DB.
		const fotografiaId = randomUUID()
		const cloudinaryResult = await subirImagen(archivo.buffer, {
			folder: 'retos-fotograficos/fotos',
			public_id: fotografiaId,
		})

		// 3) Crear participacion (si no existe) y guardar la foto de forma atomica.
		await client.query('BEGIN')

		const participacionResult = await client.query(
			`
				INSERT INTO participaciones (usuario_id, reto_id)
				VALUES ($1, $2)
				ON CONFLICT (usuario_id, reto_id)
				DO UPDATE SET usuario_id = EXCLUDED.usuario_id
				RETURNING id
			`,
			[usuarioId, retoId]
		)

		const participacionId = participacionResult.rows[0].id

		// 4) Verificar que no exista foto previa para esa participacion.
		const fotoExistenteResult = await client.query(
			`
				SELECT id
				FROM fotografias
				WHERE participacion_id = $1
				LIMIT 1
			`,
			[participacionId]
		)

		if (fotoExistenteResult.rowCount > 0) {
			throw createHttpError(409, 'Ya subiste una foto a este reto')
		}

		// 5) Persistir la foto en DB.

		const insertResult = await client.query(
			`
				INSERT INTO fotografias (
					id,
					participacion_id,
					usuario_id,
					reto_id,
					titulo,
					descripcion,
					imagen_url,
					imagen_public_id,
					estado
				)
				VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'revision')
				RETURNING id, titulo, imagen_url, estado
			`,
			[
				fotografiaId,
				participacionId,
				usuarioId,
				retoId,
				titulo,
				descripcion,
				cloudinaryResult.secure_url,
				cloudinaryResult.public_id,
			]
		)

		await client.query('COMMIT')

		return res.status(201).json(insertResult.rows[0])
	} catch (error) {
		// Si hubo BEGIN y algo falla en DB, se deshacen cambios parciales.
		try {
			await client.query('ROLLBACK')
		} catch {
			// No interrumpimos el flujo principal si rollback falla.
		}

		return next(error)
	} finally {
		client.release()
	}
}

/**
 * GET /api/fotografias/:fotografiaId
 *
 * Reglas de visibilidad:
 * - Admin puede ver cualquier estado.
 * - Usuario normal o anonimo solo puede ver estado 'aprobada'.
 */
export const getFotografia = async (req, res, next) => {
	try {
		const { fotografiaId } = req.params

		const resultado = await db.query(
			'SELECT * FROM vista_detalle_fotografia WHERE id = $1 LIMIT 1',
			[fotografiaId]
		)

		if (resultado.rowCount === 0) {
			throw createHttpError(404, 'Fotografia no encontrada')
		}

		const fotografia = resultado.rows[0]
		const esAdmin = req.usuario?.rol === 'administrador'

		// Si no es admin y no esta aprobada, respondemos 404 para no filtrar existencia.
		if (!esAdmin && fotografia.estado !== 'aprobada') {
			throw createHttpError(404, 'Fotografia no encontrada')
		}

		return res.status(200).json(fotografia)
	} catch (error) {
		return next(error)
	}
}

// GET /api/fotografias/:id/mia
// Permite al DUEÑO ver su propia foto aunque no esté aprobada
export async function getMiFotografia(req, res, next) {
	try {
		const { fotografiaId } = req.params;
		const result = await db.query(
			`SELECT * FROM vista_detalle_fotografia
       WHERE id = $1 AND usuario_id = $2`,
			[fotografiaId, req.usuario.id]
		);
		if (!result.rows.length) return res.status(404).json({ error: 'Fotografía no encontrada' });
		return res.json(result.rows[0]);
	} catch (err) { next(err); }
}