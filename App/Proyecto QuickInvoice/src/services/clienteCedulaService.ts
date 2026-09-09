// ============================================================
// Captura de cédula de clientes/garantes — 2 imágenes por cliente.
// Bucket privado "cedulas_clientes" (documento de identidad, nunca
// público) — ruta {empresa_id}/{cliente_id}_{slot}.{ext}, RLS por
// empresa (ver 20260909c_credito_electrodomesticos_permisos_items_y_cedulas.sql).
// ============================================================
import { supabase } from '../lib/supabase'

const BUCKET = 'cedulas_clientes'

function rutaImagen(empresaId: string, clienteId: string, slot: 1 | 2, ext: string): string {
    return `${empresaId}/${clienteId}_${slot}.${ext}`
}

export const clienteCedulaService = {
    async subirImagen(empresaId: string, clienteId: string, slot: 1 | 2, file: File): Promise<string> {
        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
        const path = rutaImagen(empresaId, clienteId, slot, ext)

        const { error: upErr } = await supabase.storage
            .from(BUCKET)
            .upload(path, file, { upsert: true })
        if (upErr) throw upErr

        const campo = slot === 1 ? 'cedula_imagen1_path' : 'cedula_imagen2_path'
        const { error: dbErr } = await supabase
            .from('clientes')
            .update({ [campo]: path })
            .eq('id', clienteId)
        if (dbErr) throw dbErr

        return path
    },

    async eliminarImagen(clienteId: string, slot: 1 | 2, path: string): Promise<void> {
        await supabase.storage.from(BUCKET).remove([path])
        const campo = slot === 1 ? 'cedula_imagen1_path' : 'cedula_imagen2_path'
        const { error } = await supabase
            .from('clientes')
            .update({ [campo]: null })
            .eq('id', clienteId)
        if (error) throw error
    },

    // URL firmada de corta duración (5 min) — el bucket es privado, nunca se
    // expone una URL pública/permanente para un documento de identidad.
    async urlFirmada(path: string): Promise<string> {
        const { data, error } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(path, 300)
        if (error) throw error
        return data.signedUrl
    },
}
