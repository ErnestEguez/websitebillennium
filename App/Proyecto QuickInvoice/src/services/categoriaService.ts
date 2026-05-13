import { supabase } from '../lib/supabase'

export interface Categoria {
    id: string
    empresa_id: string
    nombre: string
    tipo?: string
    descripcion?: string
    activo?: boolean
    created_at?: string
}

export const categoriaService = {
    async getCategorias(empresaId: string, incluirInactivas = false) {
        let query = supabase
            .from('categorias')
            .select('*')
            .eq('empresa_id', empresaId)
            .order('nombre', { ascending: true })

        if (!incluirInactivas) {
            query = query.neq('activo', false)
        }

        const { data, error } = await query
        if (error) throw error
        return data as Categoria[]
    },

    async createCategoria(categoria: Partial<Categoria>) {
        const { data, error } = await supabase
            .from('categorias')
            .insert({ ...categoria, activo: true })
            .select()
            .single()

        if (error) throw error
        return data as Categoria
    },

    async updateCategoria(id: string, updates: Partial<Categoria>) {
        const { data, error } = await supabase
            .from('categorias')
            .update(updates)
            .eq('id', id)
            .select()
            .single()

        if (error) throw error
        return data as Categoria
    },

    async darBajaCategoria(id: string) {
        const { error } = await supabase
            .from('categorias')
            .update({ activo: false })
            .eq('id', id)

        if (error) throw error
        return true
    },

    // Mantener por compatibilidad (eliminación física real)
    async deleteCategoria(id: string) {
        const { error } = await supabase
            .from('categorias')
            .delete()
            .eq('id', id)

        if (error) throw error
        return true
    }
}
