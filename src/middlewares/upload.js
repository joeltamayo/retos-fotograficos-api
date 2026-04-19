// ============================================================
//  Middleware de subida de imagenes
//
//  Este archivo centraliza la configuracion de multer para:
//  - Guardar archivos en memoria (Buffer), no en disco.
//  - Aceptar solo imagenes JPEG, PNG y WEBP.
//  - Limitar tamano a 5 MB por archivo.
//
//  Exporta dos middlewares listos para rutas:
//  - subirUnaImagen: campo "imagen"
//  - subirFotoPerfil: campo "foto_perfil"
// ============================================================

import multer from 'multer'

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024
const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp']

// Crea errores HTTP simples para integrarse con errorHandler.
const createUploadError = (message) => {
	const error = new Error(message)
	error.status = 400
	return error
}

// fileFilter decide si multer acepta o rechaza el archivo.
// Si no es imagen permitida, se rechaza con error claro.
const fileFilter = (req, file, cb) => {
	if (TIPOS_PERMITIDOS.includes(file.mimetype)) {
		return cb(null, true)
	}

	return cb(createUploadError('Solo se permiten imagenes JPEG, PNG y WEBP'))
}

const upload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: MAX_FILE_SIZE_BYTES },
	fileFilter,
})

// Envuelve upload.single para normalizar errores y asegurar status=400.
const crearMiddlewareSingle = (fieldName) => (req, res, next) => {
	upload.single(fieldName)(req, res, (err) => {
		if (!err) {
			return next()
		}

		if (err instanceof multer.MulterError) {
			err.status = 400

			if (err.code === 'LIMIT_FILE_SIZE') {
				err.message = 'El archivo excede el limite de 5 MB'
			}

			return next(err)
		}

		if (!err.status) {
			err.status = 400
		}

		return next(err)
	})
}

// Middleware para rutas que reciben una sola imagen en el campo "imagen".
export const subirUnaImagen = crearMiddlewareSingle('imagen')

// Middleware para rutas que reciben foto de perfil en el campo "foto_perfil".
export const subirFotoPerfil = crearMiddlewareSingle('foto_perfil')

