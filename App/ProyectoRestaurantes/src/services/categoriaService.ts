import { supabase } from '../lib/supabase'

export interface Categoria {
    id: string
    empresa_id: string
    nombre: string
    tipo?: string
    created_at?: string
}

export const categoriaService = {
    async getCategorias(empresaId: string) {
        const { data, error } = await supabase
            .from('categorias')
            .select('*')
            .eq('empresa_id', empresaId)
            .order('nombre', { ascending: true })

        if (error) throw error
        return data as Categoria[]
    },

    async createCategoria(categoria: Partial<Categoria>) {
        const { data, error } = await supabase
            .from('categorias')
            .insert(categoria)
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

    async deleteCategoria(id: string) {
        const { error } = await supabase
            .from('categorias')
            .delete()
            .eq('id', id)

        if (error) throw error
        return true
    }
}
