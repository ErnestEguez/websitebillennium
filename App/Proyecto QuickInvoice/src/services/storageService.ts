import { supabase } from '../lib/supabase'

const BUCKET = 'talento-cvs'
const SIGNED_URL_EXPIRY_SECS = 3600 // 1 hora

export const storageService = {

    // Sube (o reemplaza) el CV del candidato.
    // Ruta: {empresaId}/{candidatoId}.{ext}
    // Devuelve el path para guardar en candidatos.cv_url.
    async uploadCV(empresaId: string, candidatoId: string, file: File): Promise<string> {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf'
        const path = `${empresaId}/${candidatoId}.${ext}`
        const { error } = await supabase.storage
            .from(BUCKET)
            .upload(path, file, {
                upsert: true,
                contentType: file.type,
            })
        if (error) throw error
        return path
    },

    // Genera una URL firmada de lectura con TTL de 1 hora.
    // Llámala justo antes de abrir el archivo — no la guardes en BD.
    async getSignedUrl(path: string, expiresIn = SIGNED_URL_EXPIRY_SECS): Promise<string> {
        const { data, error } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(path, expiresIn)
        if (error) throw error
        return data.signedUrl
    },

    // Elimina el archivo del bucket (útil al borrar candidato o cambiar CV).
    async deleteCV(path: string): Promise<void> {
        const { error } = await supabase.storage
            .from(BUCKET)
            .remove([path])
        if (error) throw error
    },

    // Determina si un valor guardado es una ruta interna de storage
    // o una URL externa (legado / pegado a mano).
    isStoragePath(value: string): boolean {
        return !!value && !value.startsWith('http')
    },
}
