import { supabase } from '../lib/supabase'

export interface Unidad {
    id: string
    empresa_id: string
    codigo: string
    nombre: string
    activo?: boolean
    created_at?: string
}

export const unidadService = {
    async getUnidades(empresaId: string, incluirInactivas = false) {
        let query = supabase
            .from('unidades')
            .select('*')
            .eq('empresa_id', empresaId)
            .order('nombre', { ascending: true })

        if (!incluirInactivas) {
            query = query.neq('activo', false)
        }

        const { data, error } = await query
        if (error) throw error
        return data as Unidad[]
    },

    async createUnidad(unidad: Partial<Unidad>) {
        const { data, error } = await supabase
            .from('unidades')
            .insert({ ...unidad, activo: true })
            .select()
            .single()

        if (error) throw error
        return data as Unidad
    },

    async updateUnidad(id: string, updates: Partial<Unidad>) {
        const { data, error } = await supabase
            .from('unidades')
            .update(updates)
            .eq('id', id)
            .select()
            .single()

        if (error) throw error
        return data as Unidad
    },

    async darBajaUnidad(id: string) {
        const { error } = await supabase
            .from('unidades')
            .update({ activo: false })
            .eq('id', id)

        if (error) throw error
        return true
    },
}
