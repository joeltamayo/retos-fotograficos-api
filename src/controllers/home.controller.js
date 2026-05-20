// ============================================================
//  Controlador de Home
//
//  Este controlador construye la respuesta de la portada (home)
//  con una sola peticion HTTP. Para que responda mas rapido,
//  ejecuta las 3 consultas al mismo tiempo con Promise.all.
// ============================================================

import db from '../config/db.js'

const syncEstadosPorFecha = async () => {
    await db.query(
        `
            UPDATE retos
                        SET estado = 'finalizado'
                        WHERE estado <> 'finalizado'
                            AND fecha_fin <= NOW()
        `
    )

    await db.query(
        `
            UPDATE retos
                        SET estado = 'programado'
                        WHERE estado <> 'finalizado'
                            AND fecha_inicio > NOW()
        `
    )

        await db.query(
                `
                        UPDATE retos
                        SET estado = 'activo'
                        WHERE estado <> 'finalizado'
                            AND fecha_inicio <= NOW()
                            AND fecha_fin > NOW()
                `
        )
}

/**
 * GET /api/home
 *
 * Respuesta esperada:
 * {
 *   retos_activos: [...],
 *   fotos_destacadas: [...],
 *   fotos_recientes: [...]
 * }
 */
export const getHome = async (req, res, next) => {
    try {
        await syncEstadosPorFecha()

        // Promise.all permite correr las 3 queries en paralelo.
        // Esto reduce el tiempo total comparado con ejecutarlas una por una.
        const [retosActivosResult, fotosDestacadasResult, fotosRecientesResult] = await Promise.all([
            db.query('SELECT * FROM vista_retos_activos ORDER BY fecha_fin ASC LIMIT 6'),
            db.query('SELECT * FROM vista_fotos_destacadas ORDER BY puntuacion_promedio DESC LIMIT 6'),
            db.query('SELECT * FROM vista_fotos_recientes ORDER BY created_at DESC LIMIT 12'),
        ])

        return res.status(200).json({
            retos_activos: retosActivosResult.rows,
            fotos_destacadas: fotosDestacadasResult.rows,
            fotos_recientes: fotosRecientesResult.rows,
        })
    } catch (error) {
        // Si cualquiera de las 3 consultas falla, delegamos el error
        // al middleware global para mantener respuestas consistentes.
        return next(error)
    }
}