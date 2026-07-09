import { supabase } from '../lib/supabase'

export interface Linea {
    id: string
    empresa_id: string
    nombre: string
    descripcion?: string
    activo?: boolean
    created_at?: string
}

export const lineaService = {
    async getLineas(empresaId: string, incluirInactivas = false) {
        let query = supabase
            .from('lineas')
            .select('*')
            .eq('empresa_id', empresaId)
            .order('nombre', { ascending: true })

        if (!incluirInactivas) {
            query = query.neq('activo', false)
        }

        const { data, error } = await query
        if (error) throw error
        return data as Linea[]
    },

    async createLinea(linea: Partial<Linea>) {
        const { data, error } = await supabase
            .from('lineas')
            .insert({ ...linea, activo: true })
            .select()
            .single()

        if (error) throw error
        return data as Linea
    },

    async updateLinea(id: string, updates: Partial<Linea>) {
        const { data, error } = await supabase
            .from('lineas')
            .update(updates)
            .eq('id', id)
            .select()
            .single()

        if (error) throw error
        return data as Linea
    },

    async darBajaLinea(id: string) {
        const { error } = await supabase
            .from('lineas')
            .update({ activo: false })
            .eq('id', id)

        if (error) throw error
        return true
    },
}
