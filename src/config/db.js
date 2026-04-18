// ============================================================
//  Conexión a PostgreSQL
//
//  Crea un "pool" de conexiones a la base de datos.
//
//  Detección automática del entorno:
//  - En producción (Render) existe DATABASE_URL con SSL requerido
//  - En desarrollo local se usan las variables separadas del .env
// ============================================================


import pg from 'pg' // Usamos la versión moderna de pg que soporta ES Modules

const { Pool } = pg // Extraemos Pool para crear un pool de conexiones

const isProduction = process.env.NODE_ENV === 'production'

const pool = new Pool(
    process.env.DATABASE_URL
        ? {
            // Render inyecta esta variable automáticamente al desplegar.
            connectionString: process.env.DATABASE_URL,
            ssl: isProduction ? { rejectUnauthorized: false } : false,
            options: '-c client_encoding=UTF8', // Asegura que la conexión use UTF-8
        }
        : {
            // Variables del .env para desarrollo local
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            options: '-c client_encoding=UTF8'
        }
)

// Eventos para monitorear el estado de la conexión
pool.on('connect', () => console.log('Conectado a PostgreSQL'))
pool.on('error', (err) => { console.error('Error en PostgreSQL:', err); process.exit(1) })

export default pool // Exportamos el pool para usarlo en el resto de la aplicación