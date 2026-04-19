// =============================================================
//  Middleware de autenticación y autorización
//
// Requisitos cubiertos:
// - verificarToken: valida JWT de cookie y carga req.usuario
// - esAdmin: permite solo si req.usuario.rol === 'administrador'
//
// Respuestas esperadas por frontend:
// - TOKEN_EXPIRADO (401)
// - NO_AUTORIZADO (401)
// - ACCESO_DENEGADO (403)
// =============================================================

import jwt from 'jsonwebtoken'

const ACCESS_TOKEN_COOKIE = 'access_token'

// Middleware 1: valida access token de cookie y carga req.usuario.
// Respuestas esperadas por frontend:
// - TOKEN_EXPIRADO (401)
// - NO_AUTORIZADO (401)
export const verificarToken = (req, res, next) => {
    const token = req.cookies?.[ACCESS_TOKEN_COOKIE]

    if (!token) {
        return res.status(401).json({ error: 'NO_AUTORIZADO' })
    }

    try {
        req.usuario = jwt.verify(token, process.env.JWT_ACCESS_SECRET)
        return next()
    } catch (error) {
        if (error?.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'TOKEN_EXPIRADO' })
        }

        return res.status(401).json({ error: 'NO_AUTORIZADO' })
    }
}

// Middleware 2: debe ir despues de verificarToken.
// Permite acceso solo a usuarios con rol administrador.
export const esAdmin = (req, res, next) => {
    if (req.usuario?.rol !== 'administrador') {
        return res.status(403).json({ error: 'ACCESO_DENEGADO' })
    }

    return next()
}