// ============================================================
//  Middleware de autenticacion y autorizacion
//
//  verificarToken:
//    - Lee access_token desde cookie httpOnly.
//    - Verifica JWT y adjunta payload en req.usuario.
//
//  soloAdmin / soloUsuario:
//    - Autorizan por rol ya decodificado en req.usuario.
//
// ============================================================

import jwt from 'jsonwebtoken'

const ACCESS_TOKEN_COOKIE = 'access_token'

const createHttpError = (status, message) => {
    const error = new Error(message)
    error.status = status
    return error
}

export const verificarToken = (req, res, next) => {
    const token = req.cookies?.[ACCESS_TOKEN_COOKIE]

    if (!token) {
        return next(createHttpError(401, 'Token requerido'))
    }

    try {
        req.usuario = jwt.verify(token, process.env.JWT_SECRET)
        return next()
    } catch {
        return next(createHttpError(401, 'Token invalido o expirado'))
    }
}

// Permite acceso solo a cuentas con rol administrador.
export const soloAdmin = (req, res, next) => {
    const rol = req.usuario?.rol?.toLowerCase()
    if (rol !== 'administrador') {
        return next(createHttpError(403, 'Acceso denegado: se requiere rol administrador'))
    }
    return next()
}

// Permite acceso solo a cuentas con rol usuario.
export const soloUsuario = (req, res, next) => {
    const rol = req.usuario?.rol?.toLowerCase()
    if (rol !== 'usuario') {
        return next(createHttpError(403, 'Acceso denegado: se requiere rol usuario'))
    }
    return next()
}