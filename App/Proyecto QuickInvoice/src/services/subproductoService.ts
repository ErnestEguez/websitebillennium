import { supabase } from '../lib/supabase'

export interface Subproducto {
    id: string
    producto_id: string
    empresa_id: string
    nombre: string
    precio_sin_iva: number
    factor_conversion: number
    estado: boolean
    created_at?: string
}

export const subproductoService = {
    async getByProducto(productoId: string): Promise<Subproducto[]> {
        const { data, error } = await supabase
            .from('subproductos')
            .select('*')
            .eq('producto_id', productoId)
            .order('nombre')

        if (error) throw error
        return data || []
    },

    async getActivosByProducto(productoId: string): Promise<Subproducto[]> {
        const { data, error } = await supabase
            .from('subproductos')
            .select('*')
            .eq('producto_id', productoId)
            .eq('estado', true)
            .order('nombre')

        if (error) throw error
        return data || []
    },

    async create(sub: Omit<Subproducto, 'id' | 'created_at'>): Promise<Subproducto> {
        const { data, error } = await supabase
            .from('subproductos')
            .insert(sub)
            .select()
            .single()

        if (error) throw error
        return data
    },

    async update(id: string, changes: Partial<Subproducto>): Promise<Subproducto> {
        const { data, error } = await supabase
            .from('subproductos')
            .update(changes)
            .eq('id', id)
            .select()
            .single()

        if (error) throw error
        return data
    },

    async toggleEstado(id: string, estado: boolean): Promise<void> {
        const { error } = await supabase
            .from('subproductos')
            .update({ estado })
            .eq('id', id)

        if (error) throw error
    },
}
