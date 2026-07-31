import { supabase } from '../../lib/supabaseFinance'
import { supabaseFacturacion } from '../../lib/supabase'
import { auditService } from '../auditoria/auditService'
import { cuentasBancariasService } from './bancosService'
import { contableConfigService } from '../contableConfigService'
import { contabilidadTesoreriaService } from '../contabilidadTesoreriaService'
import type { MovimientoBancario, LineaDistribucionContable } from '../../types/finance'

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

    async crear(
        mov: Omit<MovimientoBancario, 'id' | 'created_at' | 'updated_at' | 'cuenta_bancaria'>,
        lineas: LineaDistribucionContable[] = []
    ): Promise<MovimientoBancario> {
        const { data, error } = await supabase
            .from('movimientos_bancarios').insert(mov).select().single()
        if (error) throw error
        const movimiento = data as MovimientoBancario

        auditService.logEvent({
            empresaId: mov.empresa_id,
            modulo: 'bancos',
            accion: 'crear',
            entidad: 'movimiento_bancario',
            entidadId: movimiento.id,
            resumen: `Movimiento bancario ${mov.sentido === 'debito' ? 'débito' : 'crédito'} por ${mov.monto} — ${mov.descripcion ?? ''}`.trim(),
            detalle: { tipo: mov.tipo, sentido: mov.sentido, monto: mov.monto, cuenta_bancaria_id: mov.cuenta_bancaria_id },
            nivel: 'sensible',
        })

        // Asiento contable LedgerPro (no-fatal: el movimiento ya quedó registrado)
        let avisoContable: string | null = null
        try {
            const config = await contableConfigService.getConfig(mov.empresa_id)
            if (config?.contabilidad_en_linea) {
                const [cuentaBancaria, { data: empresaRow }] = await Promise.all([
                    cuentasBancariasService.obtener(mov.cuenta_bancaria_id),
                    supabaseFacturacion.from('empresas').select('ruc').eq('id', mov.empresa_id).maybeSingle(),
                ])

                const lpComprobanteId = await contabilidadTesoreriaService.crearAsientoMovimiento({
                    empresaId:        mov.empresa_id,
                    portalRuc:        (empresaRow as any)?.ruc ?? '',
                    fecha:            mov.fecha,
                    tipo:             mov.tipo,
                    sentido:          mov.sentido,
                    monto:            mov.monto,
                    cuentaContableId: cuentaBancaria.cuenta_contable_id,
                    descripcion:      mov.descripcion,
                    movimientoId:     movimiento.id,
                    lineas,
                })

                if (lpComprobanteId) {
                    const { error: updErr } = await supabase
                        .from('movimientos_bancarios')
                        .update({ tiene_asiento: true, comprobante_contable_id: lpComprobanteId })
                        .eq('id', movimiento.id)
                    if (updErr) throw updErr

                    movimiento.tiene_asiento = true
                    movimiento.comprobante_contable_id = lpComprobanteId
                }
            }
        } catch (e: any) {
            avisoContable = e?.message ?? 'Error desconocido al generar el asiento contable.'
            console.warn('[movimientoService.crear] Asiento contable omitido:', e)
        }

        return { ...movimiento, avisoContable }
    },

    async anular(id: string): Promise<void> {
        const { data: mov, error: getErr } = await supabase
            .from('movimientos_bancarios')
            .select('empresa_id, tiene_asiento, comprobante_contable_id, descripcion')
            .eq('id', id)
            .single()
        if (getErr) throw getErr

        const { error } = await supabase
            .from('movimientos_bancarios')
            .update({ estado: 'anulado', updated_at: new Date().toISOString() })
            .eq('id', id)
        if (error) throw error

        const { tiene_asiento, comprobante_contable_id } = mov as { tiene_asiento: boolean; comprobante_contable_id: string | null }
        if (tiene_asiento && comprobante_contable_id) {
            await contabilidadTesoreriaService.anularAsientoMovimiento(comprobante_contable_id)
        }

        auditService.logEvent({
            empresaId: (mov as any).empresa_id,
            modulo: 'bancos',
            accion: 'anular',
            entidad: 'movimiento_bancario',
            entidadId: id,
            resumen: `Anulación de movimiento bancario${(mov as any).descripcion ? ` — ${(mov as any).descripcion}` : ''}`,
            nivel: 'sensible',
        })
    },

    async marcarConciliado(ids: string[], conciliacionId: string): Promise<void> {
        const { error } = await supabase
            .from('movimientos_bancarios')
            .update({ conciliado: true, conciliacion_id: conciliacionId, updated_at: new Date().toISOString() })
            .in('id', ids)
        if (error) throw error
    },
}


