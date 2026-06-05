import { supabase } from '../../lib/supabaseFinance'
import type { Conciliacion, ConciliacionLinea, MovimientoBancario } from '../../types/finance'

const CONCIL_SELECT = `
    *,
    cuenta_bancaria:cuentas_bancarias(numero_cuenta, tipo, banco:bancos(nombre))
`

export const conciliacionService = {
    async listar(empresaId: string, cuentaId?: string): Promise<Conciliacion[]> {
        let q = supabase
            .from('conciliaciones')
            .select(CONCIL_SELECT)
            .eq('empresa_id', empresaId)
            .order('periodo_año', { ascending: false })
            .order('periodo_mes', { ascending: false })

        if (cuentaId) q = q.eq('cuenta_bancaria_id', cuentaId)

        const { data, error } = await q
        if (error) throw error
        return data as Conciliacion[]
    },

    async obtener(id: string): Promise<Conciliacion> {
        const { data, error } = await supabase
            .from('conciliaciones')
            .select(`${CONCIL_SELECT}, lineas:conciliacion_lineas(*)`)
            .eq('id', id)
            .single()
        if (error) throw error
        return data as Conciliacion
    },

    async crear(conciliacion: Omit<Conciliacion, 'id' | 'created_at' | 'updated_at' | 'cuenta_bancaria'>): Promise<Conciliacion> {
        const { data, error } = await supabase
            .from('conciliaciones').insert(conciliacion).select().single()
        if (error) throw error
        return data as Conciliacion
    },

    async actualizarSaldoBanco(id: string, saldo: number): Promise<void> {
        const { error } = await supabase
            .from('conciliaciones')
            .update({ saldo_segun_banco: saldo, updated_at: new Date().toISOString() })
            .eq('id', id)
        if (error) throw error
    },

    async confirmar(id: string, saldoLibros: number): Promise<void> {
        const { error } = await supabase
            .from('conciliaciones')
            .update({
                estado: 'confirmada',
                saldo_segun_libros: saldoLibros,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id)
        if (error) throw error
    },

    async obtenerLineas(conciliacionId: string): Promise<ConciliacionLinea[]> {
        const { data, error } = await supabase
            .from('conciliacion_lineas')
            .select('*')
            .eq('conciliacion_id', conciliacionId)
            .order('fecha')
        if (error) throw error
        return data as ConciliacionLinea[]
    },

    async upsertLineas(lineas: Omit<ConciliacionLinea, 'id' | 'created_at'>[]): Promise<void> {
        const { error } = await supabase
            .from('conciliacion_lineas')
            .upsert(lineas.map(l => ({ ...l, id: crypto.randomUUID() })))
        if (error) throw error
    },

    async toggleConciliado(lineaId: string, conciliado: boolean): Promise<void> {
        const { error } = await supabase
            .from('conciliacion_lineas')
            .update({ conciliado })
            .eq('id', lineaId)
        if (error) throw error
    },

    async movimientosPendientes(empresaId: string, cuentaId: string, desde: string, hasta: string): Promise<MovimientoBancario[]> {
        const { data, error } = await supabase
            .from('movimientos_bancarios')
            .select('*')
            .eq('empresa_id', empresaId)
            .eq('cuenta_bancaria_id', cuentaId)
            .eq('estado', 'activo')
            .eq('conciliado', false)
            .gte('fecha', desde)
            .lte('fecha', hasta)
            .order('fecha')
        if (error) throw error
        return data as MovimientoBancario[]
    },
}


