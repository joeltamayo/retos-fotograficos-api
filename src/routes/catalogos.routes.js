import { Router } from 'express'
import { getCategorias, getEtiquetas } from '../controllers/catalogos.controller.js'

// Router de /api/catalogos.
// Este modulo agrupa listas cortas que sirven para llenar filtros
// y formularios del frontend, por ejemplo categorias y etiquetas.
const router = Router()

// GET /api/catalogos/categorias
// Devuelve todas las categorias ordenadas alfabeticamente.
router.get('/categorias', getCategorias)

// GET /api/catalogos/etiquetas
// Devuelve todas las etiquetas ordenadas alfabeticamente.
router.get('/etiquetas', getEtiquetas)

export default router
