// ============================================================
//  Middleware global de errores
//
//  Este middleware centraliza TODAS las respuestas de error.
//
//  - El controlador solo lanza o pasa errores con next(error).
//  - Todas las respuestas tienen el mismo formato JSON.
//  - El frontend recibe codigos/mensajes predecibles.
//
//  Formato de salida estandar:
//  {
//    "error": "mensaje legible",
//    "detalle": "informacion adicional"
//  }
// ============================================================

export const errorHandler = (err, req, res, next) => {
	// Siempre dejamos traza del error para diagnostico en servidor.
	console.error(err)

	// Si la respuesta ya comenzo, Express exige delegar al manejador siguiente.
	if (res.headersSent) {
		return next(err)
	}

	// 1) Errores de Multer (subida de archivos)
	if (err?.name === 'MulterError') {
		if (err.code === 'LIMIT_FILE_SIZE') {
			return res.status(400).json({
				error: 'El archivo supera el límite de 5MB',
				detalle: err.message || 'Archivo demasiado grande',
			})
		}

		return res.status(400).json({
			error: err.message || 'Error al procesar archivo',
			detalle: err.code || 'MulterError',
		})
	}

	// 2) Errores con status definido por la capa de aplicacion
	if (err?.status) {
		return res.status(err.status).json({
			error: err.message || 'Error de solicitud',
			detalle: err.detail || 'Sin detalle adicional',
		})
	}

	// 3) Errores de PostgreSQL
	if (err?.code === '23505') {
		return res.status(409).json({
			error: 'Ya existe un registro con esos datos',
			detalle: err.detail || 'Violacion de unicidad',
		})
	}

	if (err?.code === '23503') {
		return res.status(400).json({
			error: 'Referencia a recurso inexistente',
			detalle: err.detail || 'Violacion de llave foranea',
		})
	}

	// 4) Cualquier otro error
	if (process.env.NODE_ENV === 'development') {
		return res.status(500).json({
			error: err?.message || 'Error interno del servidor',
			detalle: err?.stack || 'Sin stack disponible',
		})
	}

	return res.status(500).json({
		error: 'Error interno del servidor',
		detalle: 'No disponible en produccion',
	})
}