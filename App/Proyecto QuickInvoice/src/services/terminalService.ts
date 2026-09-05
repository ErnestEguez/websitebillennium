import { supabase } from '../lib/supabase'

export interface Terminal {
    id: string
    empresa_id: string
    nombre: string
    punto_emision_id: string | null
    created_at?: string
    updated_at?: string
    // join
    punto_emision?: { establecimiento: string; punto_emision: string; nombre: string } | null
}

export const terminalService = {

    async listar(empresaId: string): Promise<Terminal[]> {
        const { data, error } = await supabase
            .from('terminales')
            .select('*, punto_emision:puntos_emision(establecimiento, punto_emision, nombre)')
            .eq('empresa_id', empresaId)
            .order('nombre')
        if (error) throw error
        return data as Terminal[]
    },

    async obtenerPorNombre(empresaId: string, nombre: string): Promise<Terminal | null> {
        const { data, error } = await supabase
            .from('terminales')
            .select('*')
            .eq('empresa_id', empresaId)
            .eq('nombre', nombre)
            .maybeSingle()
        if (error) throw error
        return data as Terminal | null
    },

    async crear(empresaId: string, nombre: string, puntoEmisionId: string | null): Promise<Terminal> {
        const { data, error } = await supabase
            .from('terminales')
            .insert({ empresa_id: empresaId, nombre: nombre.trim(), punto_emision_id: puntoEmisionId })
            .select()
            .single()
        if (error) throw error
        return data as Terminal
    },

    async actualizar(id: string, campos: Partial<Pick<Terminal, 'nombre' | 'punto_emision_id'>>): Promise<Terminal> {
        const { data, error } = await supabase
            .from('terminales')
            .update({ ...campos, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        return data as Terminal
    },

    async eliminar(id: string): Promise<void> {
        const { error } = await supabase.from('terminales').delete().eq('id', id)
        if (error) throw error
    },
}
