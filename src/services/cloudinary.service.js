// ============================================================
//  Cloudinary Service
//
//  Este modulo concentra operaciones comunes con Cloudinary:
//  1) Subir una imagen desde memoria (Buffer)
//  2) Eliminar una imagen por su public_id
//  3) Eliminar una carpeta completa por prefijo
//
//  Objetivo:
//  Mantener los controladores limpios. En lugar de escribir
//  logica de Cloudinary en cada controller, todo vive aqui.
// ============================================================

import cloudinary from '../config/cloudinary.js'

/**
 * Sube una imagen a Cloudinary usando un Buffer en memoria.
 *
 * @param {Buffer} buffer - Archivo de imagen recibido por multer memoryStorage.
 * @param {Object} [opciones={}] - Opciones de Cloudinary.
 * @param {string} [opciones.folder] - Carpeta destino en Cloudinary.
 * @param {string} [opciones.public_id] - Identificador unico del recurso.
 * @param {Object|Array} [opciones.transformation] - Transformaciones opcionales.
 * @returns {Promise<Object>} Resultado completo de Cloudinary (url, public_id, etc.).
 *
 * Nota:
 * cloudinary.uploader.upload_stream usa callbacks.
 * Aqui lo envolvemos en Promise para usar async/await.
 */
export const subirImagen = async (buffer, opciones = {}) => {
	// Por defecto forzamos overwrite + invalidate para que los reemplazos
	// (ej. avatars o reemplazo de imagen de reto) actualicen la CDN rápidamente.
	const opcionesFinales = { overwrite: true, invalidate: true, ...opciones }

	try {
		const resultado = await new Promise((resolve, reject) => {
			const stream = cloudinary.uploader.upload_stream(opcionesFinales, (error, result) => {
				if (error) {
					return reject(error)
				}
				return resolve(result)
			})

			stream.end(buffer)
		})

		return resultado
	} catch (error) {
		// Se relanza para que el controller/middleware central de errores decida respuesta HTTP.
		throw error
	}
}

/**
 * Elimina una imagen puntual en Cloudinary por su public_id.
 *
 * @param {string} publicId - Identificador unico del archivo en Cloudinary.
 * @returns {Promise<Object>} Resultado de Cloudinary (por ejemplo: { result: 'ok' }).
 */
export const eliminarImagen = async (publicId) => {
	try {
		const resultado = await cloudinary.uploader.destroy(publicId)
		return resultado
	} catch (error) {
		// Se relanza para manejo centralizado en capas superiores.
		throw error
	}
}

/**
 * Elimina todos los recursos bajo un prefijo y luego la carpeta.
 *
 * @param {string} prefijo - Prefijo/carpeta en Cloudinary.
 * @returns {Promise<Object>} Resumen con resultados de borrado de recursos y carpeta.
 *
 * Flujo:
 * 1) delete_resources_by_prefix(prefijo) elimina archivos.
 * 2) delete_folder(prefijo) elimina carpeta (si ya quedo vacia).
 */
export const eliminarCarpeta = async (prefijo) => {
	try {
		const recursosEliminados = await cloudinary.api.delete_resources_by_prefix(prefijo)
		const carpetaEliminada = await cloudinary.api.delete_folder(prefijo)

		return {
			recursosEliminados,
			carpetaEliminada,
		}
	} catch (error) {
		// Se relanza para manejo centralizado en capas superiores.
		throw error
	}
}