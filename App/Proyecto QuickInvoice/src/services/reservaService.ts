import { supabase } from '../lib/supabase'

export interface Reserva {
    id: string
    empresa_id: string
    mesa_id: string
    cliente_nombre: string
    personas: number
    fecha_hora: string
    estado: 'pendiente' | 'completada' | 'cancelada'
    created_at?: string
}

export const reservaService = {
    async getReservas(empresaId: string) {
        const { data, error } = await supabase
            .from('reservas')
            .select(`
                *,
                mesas (numero)
            `)
            .eq('empresa_id', empresaId)
            .order('fecha_hora', { ascending: true })

        if (error) throw error
        return data
    },

    async getReservasProximas(empresaId: string) {
        // Reservas para hoy que estén pendientes
        const hoy = new Date().toISOString().split('T')[0]
        const { data, error } = await supabase
            .from('reservas')
            .select('*')
            .eq('empresa_id', empresaId)
            .eq('estado', 'pendiente')
            .gte('fecha_hora', hoy)

        if (error) throw error
        return data as Reserva[]
    },

    async crearReserva(reserva: Partial<Reserva>) {
        const { data, error } = await supabase
            .from('reservas')
            .insert(reserva)
            .select()
            .single()

        if (error) throw error
        return data
    },

    async cambiarEstado(id: string, estado: Reserva['estado']) {
        const { error } = await supabase
            .from('reservas')
            .update({ estado })
            .eq('id', id)

        if (error) throw error
        return true
    }
}
