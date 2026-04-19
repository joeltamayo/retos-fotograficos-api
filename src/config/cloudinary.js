// ============================================================
//  Configuración de Cloudinary y Multer
//
//  Cloudinary es el servicio de almacenamiento de imágenes.
//  Multer es el middleware que recibe archivos en los requests.
//
//  Flujo de subida de archivos:
//  1. El cliente manda un request multipart/form-data con imágenes
//  2. Multer intercepta el request y guarda la imagen en MEMORIA
//     (no en disco) como un Buffer (arreglo de bytes)
//  3. El controller toma ese Buffer y lo sube a Cloudinary
//     usando la función subirBuffer()
//  4. Cloudinary devuelve la URL de la imagen subida, que se guarda en la base de datos
// ============================================================

import { v2 as cloudinary } from 'cloudinary'
import multer from 'multer'

// Configuracion de Cloudinary con las credenciales de las variables de entorno
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
})

// ─── Configuración de Multer ──────────────────────────────────────────────────
const uploadDocumentos = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (req, file, cb) => {
        const permitidos = ['image/jpeg', 'image/png']
        if (permitidos.includes(file.mimetype)) {
            cb(null, true)
        } else {
            cb(new Error('Solo se permiten imágenes JPG y PNG'))
        }
    },
})

// ─── subirBuffer ─────────────────────────────────────────────────────────────
// Sube un archivo en memoria a Cloudinary.
const subirBuffer = (buffer, opciones) =>
    new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(opciones, (error, result) =>
            error ? reject(error) : resolve(result)
        )
        stream.end(buffer)
    })

// ─── eliminarCarpeta ──────────────────────────────────────────────────────
// Elimina una carpeta completa en Cloudinary, incluyendo todos los archivos dentro de ella.
const eliminarCarpeta = async (vehiculo_id) => {
    const prefix = `acceso-vehicular/documentos/${vehiculo_id}`
    try {
        await cloudinary.api.delete_resources_by_prefix(prefix) // Elimina todos los archivos que comienzan con el prefijo
        await cloudinary.api.delete_folder(prefix) // Elimina la carpeta (si está vacía)
    } catch (err) {
        console.error('Error al eliminar carpeta de Cloudinary:', err.message)
    }
}

// Exportamos la configuración de Cloudinary, el middleware de Multer, y las funciones de subida y eliminación
export { cloudinary, uploadDocumentos, subirBuffer, eliminarCarpeta } // 
export default cloudinary