import { supabase } from '../../lib/supabase'
import type { PeriodoNomina } from '../../types/nominas'

const nominas = () => supabase.schema('nominas')

export const periodoNominaService = {

    async listar(empresaId: string): Promise<PeriodoNomina[]> {
        const { data, error } = await nominas()
            .from('periodos')
            .select('*')
            .eq('empresa_id', empresaId)
            .order('fecha_inicio', { ascending: false })
        if (error) throw error
        return data as PeriodoNomina[]
    },

    async obtener(id: string): Promise<PeriodoNomina> {
        const { data, error } = await nominas()
            .from('periodos')
            .select('*')
            .eq('id', id)
            .single()
        if (error) throw error
        return data as PeriodoNomina
    },

    async crear(periodo: Omit<PeriodoNomina, 'id' | 'estado' | 'total_ingresos' | 'total_descuentos' | 'total_neto' | 'created_at' | 'updated_at'>): Promise<PeriodoNomina> {
        const { data, error } = await nominas()
            .from('periodos')
            .insert(periodo)
            .select()
            .single()
        if (error) throw error
        return data as PeriodoNomina
    },

    async cerrar(id: string): Promise<void> {
        const { error } = await nominas()
            .from('periodos')
            .update({ estado: 'cerrado', updated_at: new Date().toISOString() })
            .eq('id', id)
        if (error) throw error
    },

    async eliminar(id: string): Promise<void> {
        const { error } = await nominas()
            .from('periodos')
            .delete()
            .eq('id', id)
        if (error) throw error
    },

    async contarCabeceras(periodoId: string): Promise<number> {
        const { count, error } = await nominas()
            .from('rol_cabecera')
            .select('id', { count: 'exact', head: true })
            .eq('periodo_id', periodoId)
        if (error) throw error
        return count ?? 0
    },
}
