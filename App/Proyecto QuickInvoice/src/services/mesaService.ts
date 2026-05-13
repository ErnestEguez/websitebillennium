import { supabase } from '../lib/supabase'

export interface Mesa {
    id: string
    empresa_id: string
    numero: string
    capacidad: number
    estado: 'libre' | 'ocupada' | 'reservada' | 'atendida'
}

export const mesaService = {
    async getMesas() {
        const { data, error } = await supabase
            .from('mesas')
            .select('*')
            .order('numero', { ascending: true })

        if (error) throw error
        return data as Mesa[]
    },

    async getMesaById(id: string) {
        const { data, error } = await supabase
            .from('mesas')
            .select('*')
            .eq('id', id)
            .single()

        if (error) throw error
        return data as Mesa
    },

    async createMesa(mesa: Partial<Mesa>) {
        const { data, error } = await supabase
            .from('mesas')
            .insert(mesa)
            .select()
            .single()

        if (error) throw error
        return data as Mesa
    },

    async updateMesa(id: string, updates: Partial<Mesa>) {
        const { data, error } = await supabase
            .from('mesas')
            .update(updates)
            .eq('id', id)
            .select()
            .single()

        if (error) throw error
        return data as Mesa
    },

    async deleteMesa(id: string) {
        const { error } = await supabase
            .from('mesas')
            .delete()
            .eq('id', id)

        if (error) throw error
        return true
    },

    async setMesaEstado(id: string, estado: Mesa['estado']) {
        const { error } = await supabase
            .from('mesas')
            .update({ estado })
            .eq('id', id)

        if (error) throw error
        return true
    },

    async resetMesa(mesaId: string) {
        // 1. Cancelar pedidos pendientes de esa mesa
        await supabase
            .from('pedidos')
            .update({ estado: 'cancelado' })
            .eq('mesa_id', mesaId)
            .neq('estado', 'facturado')

        // 2. Liberar mesa
        return this.setMesaEstado(mesaId, 'libre')
    },

    subscribeToMesas(callback: (payload: any) => void) {
        return supabase
            .channel('mesas_changes')
            .on('postgres_changes' as any, { event: '*', table: 'mesas' }, callback)
            .subscribe()
    }
}
