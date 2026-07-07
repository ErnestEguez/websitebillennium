import { supabase } from '../lib/supabase'

export interface Transportista {
    id: string
    empresa_id: string
    nombre: string
    tipo_identificacion: string  // '04'=RUC, '05'=Cédula, '06'=Pasaporte
    identificacion: string
    placa: string
    telefono?: string | null
    activo: boolean
    created_at?: string
}

export const transportistasService = {

    async listar(empresaId: string): Promise<Transportista[]> {
        const { data, error } = await supabase
            .from('transportistas')
            .select('*')
            .eq('empresa_id', empresaId)
            .eq('activo', true)
            .order('nombre')
        if (error) throw error
        return (data ?? []) as Transportista[]
    },

    async crear(datos: Omit<Transportista, 'id' | 'created_at'>): Promise<Transportista> {
        const { data, error } = await supabase
            .from('transportistas')
            .insert(datos)
            .select()
            .single()
        if (error) throw error
        return data as Transportista
    },

    async actualizar(id: string, campos: Partial<Transportista>): Promise<void> {
        const { error } = await supabase
            .from('transportistas')
            .update(campos)
            .eq('id', id)
        if (error) throw error
    },

    async desactivar(id: string): Promise<void> {
        const { error } = await supabase
            .from('transportistas')
            .update({ activo: false })
            .eq('id', id)
        if (error) throw error
    },
}
