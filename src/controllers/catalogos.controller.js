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
        const search = String(req.query.search || '').trim()
        if (search) {
            const resultado = await db.query(
                `SELECT id, nombre
                 FROM categorias
                 WHERE similarity(nombre, $1) > 0.2
                 ORDER BY similarity(nombre, $1) DESC, nombre ASC
                 LIMIT 8`,
                [search]
            )

            return res.status(200).json({ categorias: resultado.rows })
        }

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

/**
 * Crea una categoria nueva.
 */
export const createCategoria = async (req, res, next) => {
    try {
        const nombre = String(req.body?.nombre || '').trim()
        if (!nombre) {
            return res.status(400).json({ error: 'Nombre requerido.' })
        }

        const existing = await db.query(
            'SELECT id FROM categorias WHERE LOWER(nombre) = LOWER($1) LIMIT 1',
            [nombre]
        )

        if (existing.rowCount > 0) {
            return res.status(409).json({ error: 'La categoría ya existe.' })
        }

        const resultado = await db.query(
            'INSERT INTO categorias (nombre) VALUES ($1) RETURNING id, nombre, descripcion',
            [nombre]
        )

        res.status(201).json({ categoria: resultado.rows[0] })
    } catch (error) {
        next(error)
    }
}