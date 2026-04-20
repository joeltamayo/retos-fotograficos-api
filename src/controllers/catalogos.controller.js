// ============================================================
//  Controlador de catalogos
//
//  Este archivo contiene la logica de lectura para datos cortos
//  y reutilizables del sistema, como categorias y etiquetas.
//
//  Idea general:
//  - El router decide la URL.
//  - El controlador consulta la base de datos.
//  - La respuesta siempre regresa JSON sencillo para que el
//    frontend lo consuma sin transformaciones extra.
// ============================================================

import db from '../config/db.js'

/**
 * Obtiene todas las categorias del sistema.
 *
 * Se usa para poblar filtros, selects y formularios.
 * No lleva paginacion porque el catalogo es pequeno.
 */
export const getCategorias = async (req, res, next) => {
    try {
        const resultado = await db.query(
            'SELECT id, nombre, descripcion FROM categorias ORDER BY nombre ASC'
        )

        res.status(200).json({ categorias: resultado.rows })
    } catch (error) {
        next(error)
    }
}

/**
 * Obtiene todas las etiquetas del sistema.
 *
 * Se usa para filtros de busqueda y para mostrar opciones
 * relacionadas con retos o galeria.
 * No lleva paginacion porque el catalogo es pequeno.
 */
export const getEtiquetas = async (req, res, next) => {
    try {
        const resultado = await db.query(
            'SELECT id, nombre FROM etiquetas ORDER BY nombre ASC'
        )

        res.status(200).json({ etiquetas: resultado.rows })
    } catch (error) {
        next(error)
    }
}