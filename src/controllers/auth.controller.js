// ============================================================
//  Auth Controller
//
//  Este modulo concentra toda la logica de autenticacion:
//  - Registro de cuenta
//  - Login
//  - Refresh token (rotacion)
//  - Logout
//  - Endpoint de sesion activa (me)
//
//  Diseno general:
//  1) Access token (corto) en cookie httpOnly -> acceso a rutas protegidas.
//  2) Refresh token (largo) en cookie httpOnly -> renovacion de sesion.
//  3) En BD se guarda SOLO el hash SHA-256 del refresh token.
//     Esto evita exponer tokens utilizables si se filtra la BD.
//  4) Errores via next(error) para centralizar respuestas en errorHandler.
// ============================================================

import bcrypt from 'bcrypt'
import { createHash } from 'crypto'
import jwt from 'jsonwebtoken'
import pool from '../config/db.js'

const ACCESS_TOKEN_COOKIE = 'access_token'
const REFRESH_TOKEN_COOKIE = 'refresh_token'

// Configuracion unica de cookies de sesion.
// Se usa en set/clear para mantener comportamiento consistente.
const cookieOpts = (maxAge) => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge,
})

// Fabrica de errores HTTP para simplificar los controladores.
const createHttpError = (status, message) => {
    const error = new Error(message)
    error.status = status
    return error
}

// Evita strings vacios y tipos no string en validaciones basicas.
const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== ''

// Hash SHA-256 del refresh token para persistir solo huella digital.
const hashToken = (token) => createHash('sha256').update(token).digest('hex')

// Genera ambos JWTs a partir de id/rol del usuario.
// Separar esto evita duplicar logica entre login/registro/refresh.
const createAuthTokens = (usuario) => {
    const payload = {
        id: usuario.id,
        rol: usuario.rol,
    }

    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN,
    })

    const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
    })

    return { accessToken, refreshToken }
}

// Obtiene fecha de expiracion desde el propio JWT refresh (claim exp).
// Esta fecha se guarda en BD para invalidaciones y limpieza deterministica.
const getRefreshTokenExpiryDate = (refreshToken) => {
    const decoded = jwt.decode(refreshToken)
    if (!decoded?.exp) {
        throw createHttpError(500, 'No se pudo calcular la expiracion del refresh token')
    }
    return new Date(decoded.exp * 1000)
}

// Emite cookies de sesion.
const setAuthCookies = (res, accessToken, refreshToken) => {
    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, cookieOpts(15 * 60 * 1000))
    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, cookieOpts(7 * 24 * 60 * 60 * 1000))
}

// Elimina cookies de sesion del cliente.
const clearAuthCookies = (res) => {
    res.clearCookie(ACCESS_TOKEN_COOKIE, cookieOpts(0))
    res.clearCookie(REFRESH_TOKEN_COOKIE, cookieOpts(0))
}

/**
 * POST /api/auth/registro
 *
 * Flujo:
 * 1) Validar campos requeridos.
 * 2) Verificar unicidad de correo y nombre_usuario.
 * 3) Hashear contrasena con bcrypt.
 * 4) Insertar usuario con rol usuario.
 * 5) Generar tokens y guardar hash de refresh token.
 * 6) Confirmar transaccion y responder con cookies + usuario basico.
 *
 * - Si falla cualquier paso (insert usuario o insert refresh token),
 *   no queda informacion parcial en BD.
 */
export const registro = async (req, res, next) => {
    const { nombre, apellido, nombre_usuario, correo, contrasena } = req.body

    if (!isNonEmptyString(nombre) || !isNonEmptyString(apellido) || !isNonEmptyString(nombre_usuario) || !isNonEmptyString(correo) || !isNonEmptyString(contrasena)) {
        return next(createHttpError(400, 'Nombre, apellido, nombre_usuario, correo y contrasena son obligatorios'))
    }

    const nombreNormalizado = nombre.trim()
    const apellidoNormalizado = apellido.trim()
    const nombreUsuarioNormalizado = nombre_usuario.trim()
    const correoNormalizado = correo.trim().toLowerCase()

    const client = await pool.connect()

    try {
        await client.query('BEGIN')

        const existeResult = await client.query(
            `SELECT correo, nombre_usuario
               FROM usuarios
              WHERE correo = $1 OR nombre_usuario = $2
              LIMIT 1`,
            [correoNormalizado, nombreUsuarioNormalizado]
        )

                // Mensaje preciso para facilitar correccion en frontend.
        if (existeResult.rows.length > 0) {
            const usuarioExistente = existeResult.rows[0]
            if (usuarioExistente.correo === correoNormalizado) {
                throw createHttpError(409, 'El correo ya esta registrado')
            }
            if (usuarioExistente.nombre_usuario === nombreUsuarioNormalizado) {
                throw createHttpError(409, 'El nombre de usuario ya esta en uso')
            }
            throw createHttpError(409, 'Ya existe un usuario con esos datos')
        }

        const contrasenaHash = await bcrypt.hash(contrasena, 12)

        const nuevoUsuarioResult = await client.query(
            `INSERT INTO usuarios (nombre, apellido, nombre_usuario, correo, contrasena_hash, rol, estado)
             VALUES ($1, $2, $3, $4, $5, 'usuario', 'activo')
             RETURNING id, nombre_usuario, rol`,
            [nombreNormalizado, apellidoNormalizado, nombreUsuarioNormalizado, correoNormalizado, contrasenaHash]
        )

        const usuario = nuevoUsuarioResult.rows[0]
        const { accessToken, refreshToken } = createAuthTokens(usuario)

        await client.query(
            `INSERT INTO refresh_tokens (usuario_id, token_hash, expires_at)
             VALUES ($1, $2, $3)`,
            [usuario.id, hashToken(refreshToken), getRefreshTokenExpiryDate(refreshToken)]
        )

        await client.query('COMMIT')

        setAuthCookies(res, accessToken, refreshToken)
        return res.status(201).json({ usuario })
    } catch (error) {
        try {
            await client.query('ROLLBACK')
        } catch {
            // No-op: si el rollback falla, se delega el error original.
        }
        return next(error)
    } finally {
        client.release()
    }
}

/**
 * POST /api/auth/login
 *
 * Flujo:
 * 1) Validar body.
 * 2) Buscar usuario por correo.
 * 3) Comparar contrasena con hash bcrypt.
 * 4) Bloquear usuarios suspendidos.
 * 5) Actualizar ultimo_login y persistir nuevo refresh token hash.
 * 6) Responder con usuario basico y cookies.
 */
export const login = async (req, res, next) => {
    const { correo, contrasena } = req.body

    if (!isNonEmptyString(correo) || !isNonEmptyString(contrasena)) {
        return next(createHttpError(400, 'Correo y contrasena requeridos'))
    }

    const correoNormalizado = correo.trim().toLowerCase()

    try {
        const usuarioResult = await pool.query(
            `SELECT id, nombre_usuario, rol, estado, contrasena_hash
               FROM usuarios
              WHERE correo = $1
              LIMIT 1`,
            [correoNormalizado]
        )

        if (usuarioResult.rows.length === 0) {
            throw createHttpError(401, 'Credenciales incorrectas')
        }

        const usuario = usuarioResult.rows[0]
        const contrasenaValida = await bcrypt.compare(contrasena, usuario.contrasena_hash)

        if (!contrasenaValida) {
            throw createHttpError(401, 'Credenciales incorrectas')
        }

        if (usuario.estado === 'suspendido') {
            throw createHttpError(403, 'Tu cuenta esta suspendida')
        }

        const { accessToken, refreshToken } = createAuthTokens(usuario)

        // Se agrupa en transaccion para que ultimo_login y refresh token
        // queden sincronizados en el mismo evento de login.
        const client = await pool.connect()
        try {
            await client.query('BEGIN')
            await client.query(
                `UPDATE usuarios SET ultimo_login = NOW() WHERE id = $1`,
                [usuario.id]
            )
            await client.query(
                `INSERT INTO refresh_tokens (usuario_id, token_hash, expires_at)
                 VALUES ($1, $2, $3)`,
                [usuario.id, hashToken(refreshToken), getRefreshTokenExpiryDate(refreshToken)]
            )
            await client.query('COMMIT')
        } catch (error) {
            try {
                await client.query('ROLLBACK')
            } catch {
                // No-op: si rollback falla, se delega el error original.
            }
            throw error
        } finally {
            client.release()
        }

        setAuthCookies(res, accessToken, refreshToken)
        return res.status(200).json({
            usuario: {
                id: usuario.id,
                nombre_usuario: usuario.nombre_usuario,
                rol: usuario.rol,
            },
        })
    } catch (error) {
        return next(error)
    }
}

/**
 * POST /api/auth/refresh
 *
 * Implementa rotacion de refresh token:
 * - Verifica firma JWT.
 * - Verifica existencia del hash en BD (token no revocado).
 * - Valida que pertenezca al mismo usuario y no este expirado.
 * - Elimina token anterior e inserta uno nuevo.
 *
 */
export const refresh = async (req, res, next) => {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE]

    if (!refreshToken) {
        return next(createHttpError(401, 'Refresh token no encontrado'))
    }

    let payload
    try {
        payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET)
    } catch {
        return next(createHttpError(401, 'Refresh token invalido o expirado'))
    }

    const refreshTokenHash = hashToken(refreshToken)
    const client = await pool.connect()

    try {
        await client.query('BEGIN')

        const tokenResult = await client.query(
            `SELECT rt.id AS refresh_id,
                    rt.usuario_id,
                    rt.expires_at,
                    u.nombre_usuario,
                    u.rol,
                    u.estado
               FROM refresh_tokens rt
               JOIN usuarios u ON u.id = rt.usuario_id
              WHERE rt.token_hash = $1
              FOR UPDATE`,
            [refreshTokenHash]
        )

        if (tokenResult.rows.length === 0) {
            throw createHttpError(401, 'Refresh token invalido o revocado')
        }

        const tokenData = tokenResult.rows[0]

        if (payload.id !== tokenData.usuario_id) {
            throw createHttpError(401, 'Refresh token invalido')
        }

        if (tokenData.estado === 'suspendido') {
            throw createHttpError(403, 'Tu cuenta esta suspendida')
        }

        if (new Date(tokenData.expires_at) <= new Date()) {
            await client.query(`DELETE FROM refresh_tokens WHERE id = $1`, [tokenData.refresh_id])
            throw createHttpError(401, 'Refresh token expirado')
        }

        const usuarioToken = {
            id: tokenData.usuario_id,
            rol: tokenData.rol,
        }

        const { accessToken, refreshToken: nuevoRefreshToken } = createAuthTokens(usuarioToken)

        // Rotacion atomica: se invalida token viejo antes de guardar el nuevo.
        await client.query(`DELETE FROM refresh_tokens WHERE id = $1`, [tokenData.refresh_id])
        await client.query(
            `INSERT INTO refresh_tokens (usuario_id, token_hash, expires_at)
             VALUES ($1, $2, $3)`,
            [tokenData.usuario_id, hashToken(nuevoRefreshToken), getRefreshTokenExpiryDate(nuevoRefreshToken)]
        )

        await client.query('COMMIT')

        setAuthCookies(res, accessToken, nuevoRefreshToken)
        return res.status(200).json({ ok: true })
    } catch (error) {
        try {
            await client.query('ROLLBACK')
        } catch {
            // No-op: si rollback falla, se delega el error original.
        }
        return next(error)
    } finally {
        client.release()
    }
}

/**
 * POST /api/auth/logout
 *
 * Revoca el refresh token activo del usuario autenticado y limpia cookies.
 * Si no existe cookie de refresh, igualmente limpia cookies y responde ok.
 */
export const logout = async (req, res, next) => {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE]

    try {
        if (refreshToken) {
            await pool.query(
                `DELETE FROM refresh_tokens
                  WHERE token_hash = $1
                    AND usuario_id = $2`,
                [hashToken(refreshToken), req.usuario.id]
            )
        }

        clearAuthCookies(res)
        return res.status(200).json({ ok: true })
    } catch (error) {
        return next(error)
    }
}

/**
 * GET /api/auth/me
 *
 * Retorna perfil basico de la sesion actual.
 * Se usa para restaurar estado de autenticacion al recargar frontend.
 */
export const me = async (req, res, next) => {
    try {
        const usuarioResult = await pool.query(
            `SELECT id, nombre, apellido, nombre_usuario, correo, rol, estado
               FROM usuarios
              WHERE id = $1
              LIMIT 1`,
            [req.usuario.id]
        )

        if (usuarioResult.rows.length === 0) {
            throw createHttpError(401, 'Usuario no encontrado')
        }

        const usuario = usuarioResult.rows[0]

        if (usuario.estado === 'suspendido') {
            throw createHttpError(403, 'Tu cuenta esta suspendida')
        }

        return res.status(200).json({
            usuario: {
                id: usuario.id,
                nombre: usuario.nombre,
                apellido: usuario.apellido,
                nombre_usuario: usuario.nombre_usuario,
                correo: usuario.correo,
                rol: usuario.rol,
            },
        })
    } catch (error) {
        return next(error)
    }
}