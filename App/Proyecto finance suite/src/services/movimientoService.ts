import { supabase } from '../lib/supabase'
import type { MovimientoBancario } from '../types/finance'

const MOV_SELECT = `
    *,
    cuenta_bancaria:cuentas_bancarias(numero_cuenta, tipo, banco:bancos(nombre))
`

export const movimientoService = {
    async listar(empresaId: string, filtros?: {
        cuentaId?: string; tipo?: string; estado?: string
        desde?: string; hasta?: string; conciliado?: boolean
    }): Promise<MovimientoBancario[]> {
        let q = supabase
            .from('movimientos_bancarios')
            .select(MOV_SELECT)
            .eq('empresa_id', empresaId)
            .order('fecha', { ascending: false })
            .order('created_at', { ascending: false })

        if (filtros?.cuentaId)              q = q.eq('cuenta_bancaria_id', filtros.cuentaId)
        if (filtros?.tipo)                  q = q.eq('tipo', filtros.tipo)
        if (filtros?.estado)               q = q.eq('estado', filtros.estado)
        if (filtros?.desde)                q = q.gte('fecha', filtros.desde)
        if (filtros?.hasta)                q = q.lte('fecha', filtros.hasta)
        if (filtros?.conciliado !== undefined) q = q.eq('conciliado', filtros.conciliado)

        const { data, error } = await q
        if (error) throw error
        return data as MovimientoBancario[]
    },

    async crear(mov: Omit<MovimientoBancario, 'id' | 'created_at' | 'updated_at' | 'cuenta_bancaria'>): Promise<MovimientoBancario> {
        const { data, error } = await supabase
            .from('movimientos_bancarios').insert(mov).select().single()
        if (error) throw error
        return data as MovimientoBancario
    },

    async anular(id: string): Promise<void> {
        const { error } = await supabase
            .from('movimientos_bancarios')
            .update({ estado: 'anulado', updated_at: new Date().toISOString() })
            .eq('id', id)
        if (error) throw error
    },

    async marcarConciliado(ids: string[], conciliacionId: string): Promise<void> {
        const { error } = await supabase
            .from('movimientos_bancarios')
            .update({ conciliado: true, conciliacion_id: conciliacionId, updated_at: new Date().toISOString() })
            .in('id', ids)
        if (error) throw error
    },
}
