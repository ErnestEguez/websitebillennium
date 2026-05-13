import { supabase } from '../lib/supabase'

export interface Vendedor {
    id: string
    empresa_id: string
    nombre: string
    iniciales?: string
    email?: string
    telefono?: string
    estado: 'activo' | 'baja'
    fecha_baja?: string | null
    created_at?: string
}

export const vendedorService = {

    async getVendedoresActivos(empresaId: string): Promise<Vendedor[]> {
        const { data, error } = await supabase
            .from('vendedores')
            .select('*')
            .eq('empresa_id', empresaId)
            .eq('estado', 'activo')
            .order('nombre', { ascending: true })

        if (error) throw error
        return (data || []) as Vendedor[]
    },

    async getVendedores(empresaId: string): Promise<Vendedor[]> {
        const { data, error } = await supabase
            .from('vendedores')
            .select('*')
            .eq('empresa_id', empresaId)
            .order('nombre', { ascending: true })

        if (error) throw error
        return (data || []) as Vendedor[]
    },

    async createVendedor(vendedor: Omit<Vendedor, 'id' | 'created_at' | 'updated_at'>): Promise<Vendedor> {
        const { data, error } = await supabase
            .from('vendedores')
            .insert(vendedor)
            .select()
            .single()

        if (error) throw error
        return data as Vendedor
    },

    async updateVendedor(id: string, updates: Partial<Vendedor>): Promise<Vendedor> {
        const { data, error } = await supabase
            .from('vendedores')
            .update(updates)
            .eq('id', id)
            .select()
            .single()

        if (error) throw error
        return data as Vendedor
    },

    // Dar de baja en lugar de borrar para preservar historial en comprobantes
    async darDeBajaVendedor(id: string): Promise<void> {
        const { error } = await supabase
            .from('vendedores')
            .update({ estado: 'baja', fecha_baja: new Date().toISOString() })
            .eq('id', id)

        if (error) throw error
    },
}
