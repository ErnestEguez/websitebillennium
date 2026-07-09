import { supabase } from '../lib/supabase'

export interface Subcategoria {
    id: string
    empresa_id: string
    nombre: string
    descripcion?: string
    activo?: boolean
    created_at?: string
}

export const subcategoriaService = {
    async getSubcategorias(empresaId: string, incluirInactivas = false) {
        let query = supabase
            .from('subcategorias')
            .select('*')
            .eq('empresa_id', empresaId)
            .order('nombre', { ascending: true })

        if (!incluirInactivas) {
            query = query.neq('activo', false)
        }

        const { data, error } = await query
        if (error) throw error
        return data as Subcategoria[]
    },

    async createSubcategoria(sub: Partial<Subcategoria>) {
        const { data, error } = await supabase
            .from('subcategorias')
            .insert({ ...sub, activo: true })
            .select()
            .single()

        if (error) throw error
        return data as Subcategoria
    },

    async updateSubcategoria(id: string, updates: Partial<Subcategoria>) {
        const { data, error } = await supabase
            .from('subcategorias')
            .update(updates)
            .eq('id', id)
            .select()
            .single()

        if (error) throw error
        return data as Subcategoria
    },

    async darBajaSubcategoria(id: string) {
        const { error } = await supabase
            .from('subcategorias')
            .update({ activo: false })
            .eq('id', id)

        if (error) throw error
        return true
    },
}
