import { supabase } from '../lib/supabase'

export interface Cobrador {
    id: string
    empresa_id: string
    codigo?: string | null
    nombres: string
    identificacion?: string | null
    telefono?: string | null
    correo?: string | null
    zona?: string | null
    estado: 'activo' | 'baja'
    fecha_baja?: string | null
    created_at?: string
}

export const cobradorService = {

    async getCobradoresActivos(empresaId: string): Promise<Cobrador[]> {
        const { data, error } = await supabase
            .from('cobradores')
            .select('*')
            .eq('empresa_id', empresaId)
            .eq('estado', 'activo')
            .order('nombres', { ascending: true })

        if (error) throw error
        return (data || []) as Cobrador[]
    },

    async getCobradores(empresaId: string): Promise<Cobrador[]> {
        const { data, error } = await supabase
            .from('cobradores')
            .select('*')
            .eq('empresa_id', empresaId)
            .order('nombres', { ascending: true })

        if (error) throw error
        return (data || []) as Cobrador[]
    },

    async createCobrador(cobrador: Omit<Cobrador, 'id' | 'created_at'>): Promise<Cobrador> {
        const { data, error } = await supabase
            .from('cobradores')
            .insert(cobrador)
            .select()
            .single()

        if (error) throw error
        return data as Cobrador
    },

    async updateCobrador(id: string, updates: Partial<Cobrador>): Promise<Cobrador> {
        const { data, error } = await supabase
            .from('cobradores')
            .update(updates)
            .eq('id', id)
            .select()
            .single()

        if (error) throw error
        return data as Cobrador
    },

    // Dar de baja en lugar de borrar para preservar historial en créditos ya asignados
    async darDeBajaCobrador(id: string): Promise<void> {
        const { error } = await supabase
            .from('cobradores')
            .update({ estado: 'baja', fecha_baja: new Date().toISOString() })
            .eq('id', id)

        if (error) throw error
    },
}
