import { supabase } from '../../lib/supabase'
import type { HistorialSalario } from '../../types/nominas'

const nominas = () => supabase.schema('nominas')

export const historialSalariosService = {

    async listar(empleadoId: string): Promise<HistorialSalario[]> {
        const { data, error } = await nominas()
            .from('historial_salarios')
            .select('*')
            .eq('empleado_id', empleadoId)
            .order('fecha', { ascending: false })
        if (error) throw error
        return (data ?? []) as HistorialSalario[]
    },

    async crear(h: Omit<HistorialSalario, 'id' | 'created_at'>): Promise<HistorialSalario> {
        const { data, error } = await nominas()
            .from('historial_salarios')
            .insert(h)
            .select()
            .single()
        if (error) throw error
        return data as HistorialSalario
    },

    async eliminar(id: string): Promise<void> {
        const { error } = await nominas()
            .from('historial_salarios')
            .delete()
            .eq('id', id)
        if (error) throw error
    },
}
