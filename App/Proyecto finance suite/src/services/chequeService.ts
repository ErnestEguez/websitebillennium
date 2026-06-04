import { supabase } from '../lib/supabase'
import type { Cheque } from '../types/finance'

const CHEQUE_SELECT = `
    *,
    cuenta_bancaria:cuentas_bancarias(numero_cuenta, tipo, banco:bancos(nombre))
`

export const chequeService = {
    async listar(empresaId: string, filtros?: {
        cuentaId?: string; estado?: string
        desde?: string; hasta?: string; soloPostfechados?: boolean
    }): Promise<Cheque[]> {
        let q = supabase
            .from('cheques')
            .select(CHEQUE_SELECT)
            .eq('empresa_id', empresaId)
            .order('fecha_emision', { ascending: false })

        if (filtros?.cuentaId)        q = q.eq('cuenta_bancaria_id', filtros.cuentaId)
        if (filtros?.estado)          q = q.eq('estado', filtros.estado)
        if (filtros?.desde)           q = q.gte('fecha_emision', filtros.desde)
        if (filtros?.hasta)           q = q.lte('fecha_emision', filtros.hasta)
        if (filtros?.soloPostfechados) q = q.eq('es_postfechado', true).neq('estado', 'cobrado').neq('estado', 'anulado')

        const { data, error } = await q
        if (error) throw error
        return data as Cheque[]
    },

    async crear(cheque: Omit<Cheque, 'id' | 'created_at' | 'updated_at' | 'cuenta_bancaria'>): Promise<Cheque> {
        const { data, error } = await supabase
            .from('cheques').insert(cheque).select().single()
        if (error) throw error
        return data as Cheque
    },

    async marcarCobrado(id: string, fechaCobro: string, empresaId: string): Promise<void> {
        // Obtener el cheque para saber la cuenta y monto
        const { data: cheque, error: cErr } = await supabase
            .from('cheques').select('*').eq('id', id).single()
        if (cErr) throw cErr
        const ch = cheque as Cheque

        // Crear movimiento de cobro
        const { data: mov, error: movErr } = await supabase
            .from('movimientos_bancarios')
            .insert({
                empresa_id:        empresaId,
                cuenta_bancaria_id: ch.cuenta_bancaria_id,
                tipo:              'cheque',
                fecha:             fechaCobro,
                monto:             ch.monto,
                sentido:           'debito',
                referencia:        ch.numero_cheque,
                descripcion:       `Cheque cobrado — ${ch.beneficiario}`,
                origen:            'egreso',
                origen_id:         id,
            })
            .select('id')
            .single()
        if (movErr) throw movErr

        // Actualizar cheque
        const { error } = await supabase
            .from('cheques')
            .update({
                estado:             'cobrado',
                fecha_cobro_real:   fechaCobro,
                movimiento_cobro_id: (mov as { id: string }).id,
                updated_at:         new Date().toISOString(),
            })
            .eq('id', id)
        if (error) throw error
    },

    async anular(id: string, notas: string): Promise<void> {
        const { error } = await supabase
            .from('cheques')
            .update({
                estado:    'anulado',
                notas,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id)
        if (error) throw error
    },
}
