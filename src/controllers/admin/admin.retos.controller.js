// ============================================================
//  Controlador Admin de Retos
//
//  Este modulo concentra la logica de administracion para:
//  - listar retos con filtros, paginacion y resumen global
//  - consultar detalle de un reto (incluyendo archivados)
//  - crear retos con imagen y etiquetas
//  - editar retos (incluyendo reemplazo de imagen)
//  - cambiar estado del reto
//  - eliminar reto y limpiar recursos en Cloudinary
//
//  Nota:
//  El router solo define URLs. La logica de negocio y SQL vive aqui.
// ============================================================

import { randomUUID } from 'node:crypto'
import db from '../../config/db.js'
import { subirImagen, eliminarImagen, eliminarCarpeta } from '../../services/cloudinary.service.js'

const ESTADOS_VALIDOS = ['programado', 'activo', 'finalizado', 'archivado']

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

// Convierte texto/valor de fecha a Date valida.
// Si llega YYYY-MM-DD, la interpreta en horario local.
// Para fecha_fin puede fijarse al final del dia.
const parseFecha = (value, fieldName, { endOfDay = false } = {}) => {
	const esDateOnly = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
	let fecha

	if (esDateOnly) {
		const [year, month, day] = value.split('-').map((part) => Number.parseInt(part, 10))
		fecha = endOfDay
			? new Date(year, month - 1, day, 23, 59, 59, 999)
			: new Date(year, month - 1, day, 0, 0, 0, 0)
	} else {
		fecha = new Date(value)
	}

	if (Number.isNaN(fecha.getTime())) {
		throw createHttpError(400, `${fieldName} no es una fecha valida`)
	}

	return fecha
}

// Convierte categoria_id a entero positivo.
const parseCategoriaId = (categoriaIdRaw) => {
	const categoriaId = Number.parseInt(categoriaIdRaw, 10)

	if (!Number.isInteger(categoriaId) || categoriaId <= 0) {
		throw createHttpError(400, 'categoria_id debe ser un entero positivo')
	}

	return categoriaId
}

// Valida estado permitido en el sistema.
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

// Deriva el estado automaticamente a partir de las fechas.
// Regla:
// - fecha_inicio > ahora => programado
// - fecha_fin <= ahora => finalizado
// - en cualquier otro caso => activo
const deriveEstadoPorFechas = (fechaInicio, fechaFin, referencia = new Date()) => {
	if (fechaFin <= referencia) {
		return 'finalizado'
	}

	if (fechaInicio > referencia) {
		return 'programado'
	}

	return 'activo'
}

// Detecta si un campo vino en el body, incluso si llego vacio.
const hasBodyField = (body, key) => Object.prototype.hasOwnProperty.call(body, key)

// Parsea etiquetas desde multipart/form-data.
// Acepta:
// - string JSON: "[1,2,3]"
// - arreglo ya parseado: [1,2,3]
// - string vacio: "" (equivale a [])
const parseEtiquetas = (etiquetasRaw, etiquetasFueEnviada) => {
	if (!etiquetasFueEnviada) {
		return []
	}

	if (etiquetasRaw === undefined || etiquetasRaw === null || etiquetasRaw === '') {
		return []
	}

	let etiquetas = etiquetasRaw

	if (typeof etiquetasRaw === 'string') {
		try {
			etiquetas = JSON.parse(etiquetasRaw)
		} catch {
			throw createHttpError(400, 'etiquetas debe ser un JSON array de IDs')
		}
	}

	if (!Array.isArray(etiquetas)) {
		throw createHttpError(400, 'etiquetas debe ser un array')
	}

	const etiquetasNormalizadas = [...new Set(etiquetas.map((item) => {
		const id = Number.parseInt(item, 10)

		if (!Number.isInteger(id) || id <= 0) {
			throw createHttpError(400, 'Cada etiqueta debe ser un ID entero positivo')
		}

		return id
	}))]

	return etiquetasNormalizadas
}

// Helper para obtener un reto completo con categoria, etiquetas y conteos.
// Se usa despues de crear/editar y tambien para GET por id.
const obtenerRetoCompletoPorId = async (executor, retoId) => {
	const result = await executor.query(
		`SELECT
			r.id,
			r.titulo,
			r.descripcion,
			r.categoria_id,
			cat.nombre AS categoria_nombre,
			r.imagen_url,
			r.imagen_public_id,
			r.fecha_inicio,
			r.fecha_fin,
			r.estado,
			r.creado_por,
			r.created_at,
			r.updated_at,
			COUNT(DISTINCT p.id)::int AS total_participantes,
			COUNT(DISTINCT f.id)::int AS total_fotografias,
			COALESCE(ARRAY_AGG(DISTINCT e.id) FILTER (WHERE e.id IS NOT NULL), '{}') AS etiqueta_ids,
			COALESCE(ARRAY_AGG(DISTINCT e.nombre) FILTER (WHERE e.nombre IS NOT NULL), '{}') AS etiquetas
		 FROM retos r
		 LEFT JOIN categorias cat ON cat.id = r.categoria_id
		 LEFT JOIN participaciones p ON p.reto_id = r.id
		 LEFT JOIN fotografias f ON f.reto_id = r.id
		 LEFT JOIN reto_etiquetas re ON re.reto_id = r.id
		 LEFT JOIN etiquetas e ON e.id = re.etiqueta_id
		 WHERE r.id = $1
		 GROUP BY r.id, cat.nombre
		 LIMIT 1`,
		[retoId]
	)

	return result.rows[0] ?? null
}

// Construye WHERE dinamico para filtros de GET admin retos.
const buildGetRetosFilters = ({ estado, categoriaId, buscar }) => {
	const conditions = []
	const params = []

	if (estado) {
		params.push(estado)
		conditions.push(`r.estado = $${params.length}`)
	}

	if (categoriaId) {
		params.push(categoriaId)
		conditions.push(`r.categoria_id = $${params.length}`)
	}

	if (buscar) {
		params.push(`%${buscar}%`)
		conditions.push(`r.titulo ILIKE $${params.length}`)
	}

	const whereClause = conditions.length > 0
		? ` WHERE ${conditions.join(' AND ')}`
		: ''

	return { whereClause, params }
}

// Limpia carpeta en Cloudinary sin romper el flujo cuando la carpeta no existe.
// Normaliza distintos formatos de error que puede devolver la SDK (message, error.message, http_code, etc.)
const eliminarCarpetaSiExiste = async (prefijo) => {
	try {
 		await eliminarCarpeta(prefijo)
 	} catch (error) {
 		// Extraer texto útil del error, soportando varias formas que usa la SDK
 		const candidate = error?.message || error?.error?.message || error?.errors?.[0]?.message || error?.response?.body || error
 		const mensaje = String(candidate ?? '').toLowerCase()

 		// Si la SDK proporciona código HTTP 404, considerarlo inexistente
 		const httpCode = error?.http_code || error?.status_code || error?.status || (error?.response && error.response.status)

 		if (
 			Number(httpCode) === 404
 			|| mensaje.includes('not found')
 			|| mensaje.includes('cant find folder')
 			|| mensaje.includes("can't find folder")
 		) {
 			return
 		}

 		throw error
 	}
}

/**
 * GET /api/admin/retos
 *
 * Query params:
 * - estado
 * - categoria_id
 * - buscar
 * - pagina (default 1)
 * - limite (default 10)
 *
 * Respuesta:
 * { resumen, total, retos: [...] }
 */
export const getRetos = async (req, res, next) => {
	try {
		const pagina = toPositiveInt(req.query.pagina, 1)
		const limite = toPositiveInt(req.query.limite, 10)
		const offset = (pagina - 1) * limite

		const estado = req.query.estado
			? parseEstado(req.query.estado, 'estado')
			: null

		let categoriaId = null
		if (req.query.categoria_id !== undefined) {
			categoriaId = parseCategoriaId(req.query.categoria_id)
		}

		const buscar = isNonEmptyString(req.query.buscar)
			? req.query.buscar.trim()
			: null

		const { whereClause, params } = buildGetRetosFilters({ estado, categoriaId, buscar })

		const resumenQuery = `
			SELECT
				COUNT(*) FILTER (WHERE estado = 'activo')::int AS activos,
				COUNT(*) FILTER (WHERE estado = 'finalizado')::int AS finalizados,
				COUNT(*) FILTER (WHERE estado = 'programado')::int AS programados,
				COUNT(*) FILTER (WHERE estado = 'archivado')::int AS archivados,
				(SELECT COUNT(*)::int FROM participaciones) AS total_participantes,
				(SELECT COUNT(*)::int FROM fotografias) AS total_fotografias
			FROM retos
		`

		const totalQuery = `
			SELECT COUNT(*)::int AS total
			FROM retos r
			${whereClause}
		`

		const retosQuery = `
			SELECT
				r.id,
				r.titulo,
				r.descripcion,
				r.categoria_id,
				cat.nombre AS categoria_nombre,
				r.imagen_url,
				r.imagen_public_id,
				r.fecha_inicio,
				r.fecha_fin,
				r.estado,
				r.creado_por,
				r.created_at,
				r.updated_at,
				COUNT(DISTINCT p.id)::int AS total_participantes,
				COUNT(DISTINCT f.id)::int AS total_fotografias,
				COALESCE(ARRAY_AGG(DISTINCT e.id) FILTER (WHERE e.id IS NOT NULL), '{}') AS etiqueta_ids,
				COALESCE(ARRAY_AGG(DISTINCT e.nombre) FILTER (WHERE e.nombre IS NOT NULL), '{}') AS etiquetas
			FROM retos r
			LEFT JOIN categorias cat ON cat.id = r.categoria_id
			LEFT JOIN participaciones p ON p.reto_id = r.id
			LEFT JOIN fotografias f ON f.reto_id = r.id
			LEFT JOIN reto_etiquetas re ON re.reto_id = r.id
			LEFT JOIN etiquetas e ON e.id = re.etiqueta_id
			${whereClause}
			GROUP BY r.id, cat.nombre
			ORDER BY r.created_at DESC
			LIMIT $${params.length + 1}
			OFFSET $${params.length + 2}
		`

		// El resumen se calcula siempre y en paralelo con total/lista paginada.
		const [resumenResult, totalResult, retosResult] = await Promise.all([
			db.query(resumenQuery),
			db.query(totalQuery, params),
			db.query(retosQuery, [...params, limite, offset]),
		])

		return res.status(200).json({
			resumen: resumenResult.rows[0],
			total: totalResult.rows[0]?.total ?? 0,
			retos: retosResult.rows,
		})
	} catch (error) {
		return next(error)
	}
}

/**
 * GET /api/admin/retos/:retoId
 *
 * Obtiene detalle completo de un reto por ID.
 * Incluye cualquier estado, incluso archivado.
 */
export const getRetoPorId = async (req, res, next) => {
	try {
		const { retoId } = req.params
		const reto = await obtenerRetoCompletoPorId(db, retoId)

		if (!reto) {
			return next(createHttpError(404, 'Reto no encontrado'))
		}

		return res.status(200).json(reto)
	} catch (error) {
		return next(error)
	}
}

/**
 * POST /api/admin/retos
 *
 * Body (multipart):
 * - titulo, descripcion, categoria_id, fecha_inicio, fecha_fin
 * - estado (opcional, default programado)
 * - etiquetas (JSON array de IDs, opcional)
 * - req.file (imagen, opcional)
 */
export const crearReto = async (req, res, next) => {
	let client
	let imagenSubidaPublicId = null

	try {
		const {
			titulo,
			descripcion,
			categoria_id: categoriaIdRaw,
			fecha_inicio: fechaInicioRaw,
			fecha_fin: fechaFinRaw,
			estado: estadoRaw,
		} = req.body

		if (!isNonEmptyString(titulo) || !isNonEmptyString(descripcion)) {
			return next(createHttpError(400, 'titulo y descripcion son obligatorios'))
		}

		if (!isNonEmptyString(categoriaIdRaw)) {
			return next(createHttpError(400, 'categoria_id es obligatorio'))
		}

		if (!isNonEmptyString(fechaInicioRaw) || !isNonEmptyString(fechaFinRaw)) {
			return next(createHttpError(400, 'fecha_inicio y fecha_fin son obligatorias'))
		}

		const categoriaId = parseCategoriaId(categoriaIdRaw)
		const fechaInicio = parseFecha(fechaInicioRaw, 'fecha_inicio')
		const fechaFin = parseFecha(fechaFinRaw, 'fecha_fin', { endOfDay: true })

		if (fechaFin <= fechaInicio) {
			return next(createHttpError(400, 'fecha_fin debe ser mayor que fecha_inicio'))
		}

		const estado = estadoRaw ? parseEstado(estadoRaw) : 'programado'
		const etiquetasFueEnviada = hasBodyField(req.body, 'etiquetas')
		const etiquetas = parseEtiquetas(req.body.etiquetas, etiquetasFueEnviada)

		let imagenUrl = null
		let imagenPublicId = null

		if (req.file) {
			const resultadoCloudinary = await subirImagen(req.file.buffer, {
				folder: 'retos-fotograficos/retos',
				public_id: `reto-${randomUUID()}`,
			})

			imagenUrl = resultadoCloudinary.secure_url
			imagenPublicId = resultadoCloudinary.public_id
			imagenSubidaPublicId = resultadoCloudinary.public_id
		}

		client = await db.connect()
		await client.query('BEGIN')

		const insertRetoResult = await client.query(
			`INSERT INTO retos (
				titulo,
				descripcion,
				categoria_id,
				imagen_url,
				imagen_public_id,
				fecha_inicio,
				fecha_fin,
				estado,
				creado_por
			)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			RETURNING id`,
			[
				titulo.trim(),
				descripcion.trim(),
				categoriaId,
				imagenUrl,
				imagenPublicId,
				fechaInicio.toISOString(),
				fechaFin.toISOString(),
				estado,
				req.usuario?.id ?? null,
			]
		)

		const retoId = insertRetoResult.rows[0].id

		if (etiquetas.length > 0) {
			await client.query(
				`INSERT INTO reto_etiquetas (reto_id, etiqueta_id)
				 SELECT $1, UNNEST($2::int[])
				 ON CONFLICT DO NOTHING`,
				[retoId, etiquetas]
			)
		}

		const retoCompleto = await obtenerRetoCompletoPorId(client, retoId)

		await client.query('COMMIT')
		return res.status(201).json(retoCompleto)
	} catch (error) {
		if (client) {
			await client.query('ROLLBACK')
		}

		// Si fallo la transaccion y ya subi imagen, la eliminamos para evitar huerfanos.
		if (imagenSubidaPublicId) {
			try {
				await eliminarImagen(imagenSubidaPublicId)
			} catch {
				// Si Cloudinary falla al limpiar, no ocultamos el error principal.
			}
		}

		return next(error)
	} finally {
		if (client) {
			client.release()
		}
	}
}

/**
 * PUT /api/admin/retos/:retoId
 *
 * Params:
 * - retoId
 *
 * Body y archivo:
 * - mismos campos que crearReto, pero todos opcionales
 */
export const editarReto = async (req, res, next) => {
	let client

	try {
		const { retoId } = req.params
		const etiquetasFueEnviada = hasBodyField(req.body, 'etiquetas')
		const etiquetas = parseEtiquetas(req.body.etiquetas, etiquetasFueEnviada)

		client = await db.connect()
		await client.query('BEGIN')

		// FOR UPDATE evita condiciones de carrera cuando dos admins editan el mismo reto.
		const existenteResult = await client.query(
			`SELECT id, titulo, descripcion, categoria_id, fecha_inicio, fecha_fin, estado, imagen_public_id
			 FROM retos
			 WHERE id = $1
			 LIMIT 1
			 FOR UPDATE`,
			[retoId]
		)

		if (existenteResult.rowCount === 0) {
			await client.query('ROLLBACK')
			return next(createHttpError(404, 'Reto no encontrado'))
		}

		const retoActual = existenteResult.rows[0]
		const updates = []
		const params = [retoId]

		const agregarCampoUpdate = (columna, valor) => {
			params.push(valor)
			updates.push(`${columna} = $${params.length}`)
		}

		if (req.body.titulo !== undefined) {
			if (!isNonEmptyString(req.body.titulo)) {
				throw createHttpError(400, 'titulo no puede ser vacio')
			}
			agregarCampoUpdate('titulo', req.body.titulo.trim())
		}

		if (req.body.descripcion !== undefined) {
			if (!isNonEmptyString(req.body.descripcion)) {
				throw createHttpError(400, 'descripcion no puede ser vacia')
			}
			agregarCampoUpdate('descripcion', req.body.descripcion.trim())
		}

		let categoriaIdFinal = retoActual.categoria_id
		if (req.body.categoria_id !== undefined) {
			categoriaIdFinal = parseCategoriaId(req.body.categoria_id)
			agregarCampoUpdate('categoria_id', categoriaIdFinal)
		}

		const fechaInicioFinal = req.body.fecha_inicio !== undefined
			? parseFecha(req.body.fecha_inicio, 'fecha_inicio')
			: new Date(retoActual.fecha_inicio)

		const fechaFinFinal = req.body.fecha_fin !== undefined
			? parseFecha(req.body.fecha_fin, 'fecha_fin', { endOfDay: true })
			: new Date(retoActual.fecha_fin)

		if (fechaFinFinal <= fechaInicioFinal) {
			throw createHttpError(400, 'fecha_fin debe ser mayor que fecha_inicio')
		}

		const estadoFinal = deriveEstadoPorFechas(fechaInicioFinal, fechaFinFinal)
		agregarCampoUpdate('estado', estadoFinal)

		if (req.body.fecha_inicio !== undefined) {
			agregarCampoUpdate('fecha_inicio', fechaInicioFinal.toISOString())
		}

		if (req.body.fecha_fin !== undefined) {
			agregarCampoUpdate('fecha_fin', fechaFinFinal.toISOString())
		}

		if (req.file) {
			const publicIdParaSobreescribir = isNonEmptyString(retoActual.imagen_public_id)
				? retoActual.imagen_public_id
				: `reto-${retoId}`

			const resultadoCloudinary = await subirImagen(req.file.buffer, {
				folder: 'retos-fotograficos/retos',
				public_id: publicIdParaSobreescribir,
			})

			agregarCampoUpdate('imagen_url', resultadoCloudinary.secure_url)
			agregarCampoUpdate('imagen_public_id', resultadoCloudinary.public_id)
		}

		const hayCamposParaActualizar = updates.length > 0
		const hayCambioDeEtiquetas = etiquetasFueEnviada

		if (!hayCamposParaActualizar && !hayCambioDeEtiquetas) {
			throw createHttpError(400, 'Debes enviar al menos un campo para actualizar')
		}

		if (hayCamposParaActualizar) {
			await client.query(
				`UPDATE retos
				 SET ${updates.join(', ')}
				 WHERE id = $1`,
				params
			)
		}

		if (hayCambioDeEtiquetas) {
			await client.query('DELETE FROM reto_etiquetas WHERE reto_id = $1', [retoId])

			if (etiquetas.length > 0) {
				await client.query(
					`INSERT INTO reto_etiquetas (reto_id, etiqueta_id)
					 SELECT $1, UNNEST($2::int[])
					 ON CONFLICT DO NOTHING`,
					[retoId, etiquetas]
				)
			}
		}

		const retoActualizado = await obtenerRetoCompletoPorId(client, retoId)

		await client.query('COMMIT')
		return res.status(200).json(retoActualizado)
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
 * PATCH /api/admin/retos/:retoId/estado
 *
 * Body:
 * { estado }
 */
export const cambiarEstado = async (req, res, next) => {
	try {
		const { retoId } = req.params
		const estado = parseEstado(req.body?.estado)

		const result = await db.query(
			`UPDATE retos
			 SET estado = $1
			 WHERE id = $2
			 RETURNING id, estado`,
			[estado, retoId]
		)

		if (result.rowCount === 0) {
			return next(createHttpError(404, 'Reto no encontrado'))
		}

		return res.status(200).json(result.rows[0])
	} catch (error) {
		return next(error)
	}
}

/**
 * DELETE /api/admin/retos/:retoId
 *
 * Flujo:
 * 1) Obtener imagen_public_id del reto
 * 2) Eliminar imagen principal del reto en Cloudinary (si existe)
 * 3) Eliminar carpeta de fotos del reto en Cloudinary
 * 4) Eliminar reto en BD (el CASCADE borra lo relacionado)
 */
export const eliminarReto = async (req, res, next) => {
	try {
		const { retoId } = req.params

		const retoResult = await db.query(
			`SELECT id, imagen_public_id
			 FROM retos
			 WHERE id = $1
			 LIMIT 1`,
			[retoId]
		)

		if (retoResult.rowCount === 0) {
			return next(createHttpError(404, 'Reto no encontrado'))
		}

		const reto = retoResult.rows[0]

		if (isNonEmptyString(reto.imagen_public_id)) {
			await eliminarImagen(reto.imagen_public_id)
		}

		// Eliminar individualmente las fotografias asociadas al reto usando sus public_id
		// (no todas las fotos se almacenan en una subcarpeta por reto, por eso borramos por public_id)
		try {
			const fotosResult = await db.query(
				`SELECT imagen_public_id FROM fotografias WHERE reto_id = $1 AND imagen_public_id IS NOT NULL`,
				[retoId]
			)

			if (fotosResult.rowCount > 0) {
				for (const row of fotosResult.rows) {
					const publicId = row.imagen_public_id
					if (isNonEmptyString(publicId)) {
						try {
							await eliminarImagen(publicId)
						} catch (err) {
							// Si falla eliminar una imagen individual, continuamos con las demás.
						}
					}
				}
			}
		} catch (err) {
			// Si la consulta falla, no bloqueamos la eliminación del reto; volvemos a lanzar
			return next(err)
		}

		// Intentar eliminar la carpeta específica por reto si existe (flujo seguro)
		await eliminarCarpetaSiExiste(`retos-fotograficos/fotos/${retoId}`)

		await db.query('DELETE FROM retos WHERE id = $1', [retoId])

		return res.status(200).json({ ok: true })
	} catch (error) {
		return next(error)
	}
}
