import multer from 'multer'

export const errorHandler = (err, req, res, next) => {
	if (res.headersSent) {
		return next(err)
	}

	if (err instanceof multer.MulterError) {
		if (err.code === 'LIMIT_FILE_SIZE') {
			return res.status(400).json({ error: 'El archivo excede el limite de 10 MB' })
		}
		return res.status(400).json({ error: `Error al subir archivo: ${err.message}` })
	}

	const status = err?.status || err?.statusCode || 500
	const message = err?.message || 'Error interno del servidor'

	if (status >= 500) {
		console.error(err)
	}

	return res.status(status).json({ error: message })
}
