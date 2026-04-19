// ============================================================
//  Conexion a PostgreSQL
//
//  - ES modules (import/export)
//  - Pool creado con variables DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
//  - Si DB_SSL=true, agrega ssl: { rejectUnauthorized: false }
//  - Export default del pool
//  - Export query(text, params) con logging de query fallida
// ============================================================

import pg from 'pg'

const { Pool } = pg

const poolConfig = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: '-c client_encoding=UTF8',
}

// Compatibilidad opcional para proveedores que inyectan DATABASE_URL.
if (process.env.DATABASE_URL) {
    poolConfig.connectionString = process.env.DATABASE_URL
    delete poolConfig.host
    delete poolConfig.port
    delete poolConfig.database
    delete poolConfig.user
    delete poolConfig.password
}

if (String(process.env.DB_SSL).toLowerCase() === 'true') {
    poolConfig.ssl = { rejectUnauthorized: false }
}

const pool = new Pool(poolConfig)

// Conservamos referencia al query original para evitar recursion.
const poolQuery = pool.query.bind(pool)

export const query = async (text, params = []) => {
    try {
        return await poolQuery(text, params)
    } catch (error) {
        console.error('Query fallida en PostgreSQL', {
            text,
            params,
            message: error.message,
        })
        throw error
    }
}

// Permite este uso en controladores:
// import db from '../config/db.js'
// const result = await db.query('SELECT ...', [value])
pool.query = query

pool.on('connect', () => console.log('Conectado a PostgreSQL'))
pool.on('error', (err) => {
    console.error('Error en PostgreSQL:', err)
    process.exit(1)
})

export default pool