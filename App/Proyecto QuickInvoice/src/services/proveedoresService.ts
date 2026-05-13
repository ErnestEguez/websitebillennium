import { supabase } from '../lib/supabase'

export interface Proveedor {
    id: string
    empresa_id: string
    ruc: string
    nombre_empresa: string
    nombre_encargado?: string
    direccion?: string
    correo?: string
    telefono?: string
    created_at?: string
    updated_at?: string
}

export const proveedoresService = {
    async getProveedoresByEmpresa(empresaId: string): Promise<Proveedor[]> {
        const { data, error } = await supabase
            .from('proveedores')
            .select('*')
            .eq('empresa_id', empresaId)
            .order('nombre_empresa', { ascending: true })

        if (error) throw error
        return data || []
    },

    async createProveedor(proveedor: Partial<Proveedor>): Promise<Proveedor> {
        const { data, error } = await supabase
            .from('proveedores')
            .insert({
                ...proveedor,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .select()
            .single()

        if (error) throw error
        return data
    },

    async updateProveedor(id: string, updates: Partial<Proveedor>): Promise<Proveedor> {
        const { data, error } = await supabase
            .from('proveedores')
            .update({
                ...updates,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single()

        if (error) throw error
        return data
    },

    async deleteProveedor(id: string): Promise<boolean> {
        const { error } = await supabase
            .from('proveedores')
            .delete()
            .eq('id', id)

        if (error) throw error
        return true
    }
}
