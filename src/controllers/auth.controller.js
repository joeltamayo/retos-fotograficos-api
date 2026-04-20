// ============================================================
//  Controlador de autenticacion
//
//  Este modulo concentra la logica de:
//  - registro de usuarios
//  - inicio de sesion
//  - renovacion de sesion con refresh token
//  - cierre de sesion
//
//  Diseño general:
//  1) El access token dura poco y va en cookie httpOnly.
//  2) El refresh token dura mas y permite renovar la sesion.
//  3) En la base de datos no guardamos el refresh token en texto plano:
//     guardamos su hash SHA-256.
//  4) Si algo falla, se pasa el error con next(error) para que
//     errorHandler unifique la respuesta HTTP.
// ============================================================

import bcrypt from 'bcrypt'
import { createHash } from 'crypto'
import jwt from 'jsonwebtoken'
import db from '../config/db.js'

const SALT_ROUNDS = 12
const ACCESS_TOKEN_COOKIE = 'access_token'
const REFRESH_TOKEN_COOKIE = 'refresh_token'
const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000 // 7 dias en milisegundos

// Convierte strings tipo "15m" o "7d" a milisegundos.
// Se usa para poner maxAge coherente en las cookies.
const durationToMs = (duration) => {
    if (typeof duration !== 'string') {
        return 0
    }

    const match = duration.trim().match(/^(\d+)([smhd])$/i)
    if (!match) {
        return 0
    }

    const value = Number(match[1])
    const unit = match[2].toLowerCase()

    const factors = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
    }

    return value * factors[unit]
}

// Crea errores HTTP simples para delegarlos a errorHandler.
const createHttpError = (status, message) => {
    const error = new Error(message)
    error.status = status
    return error
}

// Valida que un campo sea texto no vacio.
const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== ''

// Normaliza el correo para evitar duplicados por mayusculas/minusculas.
const normalizeEmail = (correo) => correo.trim().toLowerCase()

// Calcula el SHA-256 de un texto.
// Aqui se usa para guardar el refresh token de forma segura en BD.
const hashToken = (token) => createHash('sha256').update(token).digest('hex')

// Genera access token y refresh token a partir del usuario.
// Tambien guarda el hash del refresh token en refresh_tokens.
const generarTokens = async (usuario) => {
    const payload = {
        id: usuario.id,
        rol: usuario.rol,
        nombre_usuario: usuario.nombre_usuario,
    }

    const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
        expiresIn: process.env.JWT_ACCESS_EXPIRES,
    })

    const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
        expiresIn: process.env.JWT_REFRESH_EXPIRES,
    })

    const refreshTokenHash = hashToken(refreshToken)
    const refreshExpiresAt = new Date(Date.now() + durationToMs(process.env.JWT_REFRESH_EXPIRES))

    await db.query(
        `INSERT INTO refresh_tokens (usuario_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [usuario.id, refreshTokenHash, refreshExpiresAt]
    )

    return { accessToken, refreshToken }
}

// Pone las cookies de sesion con la misma politica en toda la app.
// sameSite strict reduce el riesgo de que el navegador envie cookies
// en contextos externos no deseados.
const setTokenCookies = (res, accessToken, refreshToken) => {
    const cookieBase = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
    }

    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
        ...cookieBase,
        maxAge: durationToMs(process.env.JWT_ACCESS_EXPIRES),
    })

    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
        ...cookieBase,
        maxAge: REFRESH_TOKEN_MAX_AGE_MS,
    })
}

// Elimina ambas cookies de autenticacion del navegador.
const clearTokenCookies = (res) => {
    const cookieBase = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
    }

    res.clearCookie(ACCESS_TOKEN_COOKIE, cookieBase)
    res.clearCookie(REFRESH_TOKEN_COOKIE, cookieBase)
}

// Devuelve solo los datos publicos del usuario, sin hashes ni datos internos.
const publicUser = (usuario) => ({
    id: usuario.id,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    nombre_usuario: usuario.nombre_usuario,
    correo: usuario.correo,
    rol: usuario.rol,
})

/**
 * POST /api/auth/registro
 *
 * Crea un usuario nuevo con rol 'usuario'.
 * Flujo resumido:
 * 1) validar campos
 * 2) revisar duplicados
 * 3) hashear contrasena
 * 4) insertar usuario
 * 5) generar tokens y cookies
 */
export const registro = async (req, res, next) => {
    const { nombre, apellido, nombre_usuario, correo, contrasena } = req.body

    if (!isNonEmptyString(nombre) || !isNonEmptyString(apellido) || !isNonEmptyString(nombre_usuario) || !isNonEmptyString(correo) || !isNonEmptyString(contrasena)) {
        return next(createHttpError(400, 'Nombre, apellido, nombre_usuario, correo y contrasena son obligatorios'))
    }

    const nombreNormalizado = nombre.trim()
    const apellidoNormalizado = apellido.trim()
    const nombreUsuarioNormalizado = nombre_usuario.trim()
    const correoNormalizado = normalizeEmail(correo)

    try {
        const existente = await db.query(
            `SELECT id, correo, nombre_usuario
             FROM usuarios
             WHERE correo = $1 OR nombre_usuario = $2
             LIMIT 1`,
            [correoNormalizado, nombreUsuarioNormalizado]
        )

        if (existente.rows.length > 0) {
            const usuarioExistente = existente.rows[0]

            if (usuarioExistente.correo === correoNormalizado) {
                return next(createHttpError(409, 'El correo ya existe'))
            }

            if (usuarioExistente.nombre_usuario === nombreUsuarioNormalizado) {
                return next(createHttpError(409, 'El nombre de usuario ya existe'))
            }

            return next(createHttpError(409, 'Ya existe un registro con esos datos'))
        }

        const contrasenaHash = await bcrypt.hash(contrasena, SALT_ROUNDS)

        const result = await db.query(
            `INSERT INTO usuarios (nombre, apellido, nombre_usuario, correo, contrasena_hash, rol, estado)
             VALUES ($1, $2, $3, $4, $5, 'usuario', 'activo')
             RETURNING id, nombre, apellido, nombre_usuario, correo, rol`,
            [nombreNormalizado, apellidoNormalizado, nombreUsuarioNormalizado, correoNormalizado, contrasenaHash]
        )

        const usuario = result.rows[0]
        const { accessToken, refreshToken } = await generarTokens(usuario)
        setTokenCookies(res, accessToken, refreshToken)

        return res.status(201).json({ usuario: publicUser(usuario) })
    } catch (error) {
        return next(error)
    }
}

/**
 * POST /api/auth/login
 *
 * Inicia sesion para usuarios y administradores.
 * Reglas:
 * - buscar por correo
 * - validar contrasena
 * - bloquear suspendidos
 * - actualizar ultimo_login
 */
export const login = async (req, res, next) => {
    const { correo, contrasena } = req.body

    if (!isNonEmptyString(correo) || !isNonEmptyString(contrasena)) {
        return next(createHttpError(400, 'Correo y contrasena son obligatorios'))
    }

    const correoNormalizado = normalizeEmail(correo)

    try {
        const result = await db.query(
            `SELECT id, nombre, apellido, nombre_usuario, correo, rol, estado, contrasena_hash
             FROM usuarios
             WHERE correo = $1
             LIMIT 1`,
            [correoNormalizado]
        )

        if (result.rows.length === 0) {
            return next(createHttpError(401, 'Credenciales incorrectas'))
        }

        const usuario = result.rows[0]
        const contrasenaValida = await bcrypt.compare(contrasena, usuario.contrasena_hash)

        if (!contrasenaValida) {
            return next(createHttpError(401, 'Credenciales incorrectas'))
        }

        if (usuario.estado === 'suspendido') {
            return next(createHttpError(403, 'Usuario suspendido'))
        }

        await db.query(
            `UPDATE usuarios
             SET ultimo_login = NOW()
             WHERE id = $1`,
            [usuario.id]
        )

        const { accessToken, refreshToken } = await generarTokens(usuario)
        setTokenCookies(res, accessToken, refreshToken)

        return res.status(200).json({ usuario: publicUser(usuario) })
    } catch (error) {
        return next(error)
    }
}

/**
 * POST /api/auth/refresh
 *
 * Renueva la sesion usando la cookie refresh_token.
 * Hace rotacion: elimina el refresh viejo y crea uno nuevo.
 */
export const refresh = async (req, res, next) => {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE]

    if (!refreshToken) {
        return next(createHttpError(401, 'NO_AUTORIZADO'))
    }

    try {
        let payload
        try {
            payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET)
        } catch {
            return next(createHttpError(401, 'NO_AUTORIZADO'))
        }

        const refreshTokenHash = hashToken(refreshToken)

        const result = await db.query(
            `SELECT rt.id AS refresh_id,
                    rt.usuario_id,
                    rt.expires_at,
                    u.id,
                    u.nombre,
                    u.apellido,
                    u.nombre_usuario,
                    u.correo,
                    u.rol,
                    u.estado
             FROM refresh_tokens rt
             INNER JOIN usuarios u ON u.id = rt.usuario_id
             WHERE rt.token_hash = $1
             LIMIT 1`,
            [refreshTokenHash]
        )

        if (result.rows.length === 0) {
            return next(createHttpError(401, 'NO_AUTORIZADO'))
        }

        const tokenData = result.rows[0]

        if (new Date(tokenData.expires_at) <= new Date()) {
            await db.query('DELETE FROM refresh_tokens WHERE id = $1', [tokenData.refresh_id])
            return next(createHttpError(401, 'NO_AUTORIZADO'))
        }

        if (payload.id !== tokenData.usuario_id) {
            return next(createHttpError(401, 'NO_AUTORIZADO'))
        }

        await db.query('DELETE FROM refresh_tokens WHERE id = $1', [tokenData.refresh_id])

        const usuario = {
            id: tokenData.id,
            nombre: tokenData.nombre,
            apellido: tokenData.apellido,
            nombre_usuario: tokenData.nombre_usuario,
            correo: tokenData.correo,
            rol: tokenData.rol,
        }

        const { accessToken, refreshToken: nuevoRefreshToken } = await generarTokens(usuario)
        setTokenCookies(res, accessToken, nuevoRefreshToken)

        return res.status(200).json({ ok: true })
    } catch (error) {
        return next(error)
    }
}

/**
 * POST /api/auth/logout
 *
 * Elimina el refresh token de la base de datos y limpia cookies.
 * No importa si el token ya no existe en BD: igual cerramos sesion.
 */
export const logout = async (req, res, next) => {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE]

    try {
        if (refreshToken) {
            const refreshTokenHash = hashToken(refreshToken)
            await db.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [refreshTokenHash])
        }

        clearTokenCookies(res)
        return res.status(200).json({ ok: true })
    } catch (error) {
        return next(error)
    }
}
