// ============================================================
//  Controlador de Galeria
//
//  Este modulo resuelve GET /api/galeria:
//  - Lee filtros opcionales desde query params.
//  - Construye SQL dinamico parametrizado (seguro).
//  - Aplica ordenamiento y paginacion.
//  - Devuelve total + lista de fotos.
// ============================================================

import db from '../config/db.js'

// Convierte cualquier valor a entero positivo.
// Si no se puede convertir, retorna el valor por defecto.
const toPositiveInt = (value, defaultValue) => {
	const parsed = Number.parseInt(value, 10)
	return Number.isInteger(parsed) && parsed > 0 ? parsed : defaultValue
}

// Mapa cerrado de ordenes permitidos -> columna SQL.
// Se usa un mapa fijo para evitar inyeccion por ORDER BY.
const ORDER_BY_MAP = {
	recientes: 'created_at DESC',
	mejores: 'puntuacion_promedio DESC',
	votadas: 'total_calificaciones DESC',
	tendencia: 'calificaciones_recientes DESC',
}

/**
 * GET /api/galeria
 *
 * Query params:
 * - orden: recientes | mejores | votadas | tendencia
 * - categoria_id: numero entero
 * - etiqueta: texto (se busca en el arreglo "etiquetas")
 * - pagina: default 1
 * - limite: default 20
 *
 * Respuesta:
 * {
 *   total: number,
 *   pagina: number,
 *   limite: number,
 *   fotos: []
 * }
 */
export const getGaleria = async (req, res, next) => {
	try {
		const pagina = toPositiveInt(req.query.pagina, 1)
		const limite = toPositiveInt(req.query.limite, 20)
		const offset = (pagina - 1) * limite

		const { orden, categoria_id: categoriaId, etiqueta } = req.query
		const orderBy = ORDER_BY_MAP[orden] ?? ORDER_BY_MAP.recientes

		// WHERE base para poder agregar condiciones con AND dinamicamente.
		const whereParts = ['WHERE 1=1']
		const params = []

		if (categoriaId !== undefined && categoriaId !== null && categoriaId !== '') {
			const categoriaIdInt = Number.parseInt(categoriaId, 10)

			if (!Number.isInteger(categoriaIdInt) || categoriaIdInt <= 0) {
				return res.status(400).json({ error: 'categoria_id debe ser un entero positivo' })
			}

			params.push(categoriaIdInt)
			whereParts.push(`AND categoria_id = $${params.length}`)
		}

		if (etiqueta !== undefined && etiqueta !== null && etiqueta !== '') {
			params.push(etiqueta)
			whereParts.push(`AND $${params.length} = ANY(etiquetas)`)
		}

		const whereClause = whereParts.join('\n')

		// Query separada de conteo para conocer el total real de filas
		// sin afectar por LIMIT/OFFSET.
		const totalQuery = `
			SELECT COUNT(*)::int AS total
			FROM vista_galeria
			${whereClause}
		`

		const fotosQuery = `
			SELECT *
			FROM vista_galeria
			${whereClause}
			ORDER BY ${orderBy}
			LIMIT $${params.length + 1}
			OFFSET $${params.length + 2}
		`

		const [totalResult, fotosResult] = await Promise.all([
			db.query(totalQuery, params),
			db.query(fotosQuery, [...params, limite, offset]),
		])

		return res.status(200).json({
			total: totalResult.rows[0]?.total ?? 0,
			pagina,
			limite,
			fotos: fotosResult.rows,
		})
	} catch (error) {
		// Delegamos al middleware global para mantener
		// formato de errores consistente en toda la API.
		return next(error)
	}
}
