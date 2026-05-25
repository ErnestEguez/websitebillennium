import { supabase } from '../lib/supabase'
import { cxpService } from './bancosService'
import type { ComprobanteEgreso, EgresoPagoCxP } from '../types/finance'

const EGRESO_SELECT = `
    *,
    cuenta_bancaria:cuentas_bancarias(numero_cuenta, tipo, banco:bancos(nombre))
`

export const egresoService = {
    async listar(empresaId: string, filtros?: {
        desde?: string; hasta?: string; proveedorId?: string
        estado?: string; formaPago?: string
    }): Promise<ComprobanteEgreso[]> {
        let q = supabase
            .from('comprobantes_egreso')
            .select(EGRESO_SELECT)
            .eq('empresa_id', empresaId)
            .order('fecha', { ascending: false })
            .order('created_at', { ascending: false })

        if (filtros?.desde)      q = q.gte('fecha', filtros.desde)
        if (filtros?.hasta)      q = q.lte('fecha', filtros.hasta)
        if (filtros?.proveedorId) q = q.eq('proveedor_id', filtros.proveedorId)
        if (filtros?.estado)     q = q.eq('estado', filtros.estado)
        if (filtros?.formaPago)  q = q.eq('forma_pago', filtros.formaPago)

        const { data, error } = await q
        if (error) throw error
        return data as ComprobanteEgreso[]
    },

    async obtener(id: string): Promise<ComprobanteEgreso> {
        const { data, error } = await supabase
            .from('comprobantes_egreso')
            .select(`${EGRESO_SELECT}, pagos_cxp:egreso_pagos_cxp(*)`)
            .eq('id', id)
            .single()
        if (error) throw error
        return data as ComprobanteEgreso
    },

    async crear(params: {
        empresaId: string
        proveedorId: string
        formaPago: ComprobanteEgreso['forma_pago']
        cuentaBancariaId?: string
        monto: number
        referencia?: string
        concepto?: string
        cxpSeleccionados: { cxpId: string; montoAplicado: number }[]
        createdBy: string
    }): Promise<ComprobanteEgreso> {
        // 1. Obtener número de egreso
        const { data: numData, error: numError } = await supabase
            .rpc('fn_siguiente_numero_egreso', { p_empresa_id: params.empresaId })
        if (numError) throw numError

        // 2. Crear comprobante
        const { data: egreso, error: egErr } = await supabase
            .from('comprobantes_egreso')
            .insert({
                empresa_id:        params.empresaId,
                numero:            numData as string,
                fecha:             new Date().toISOString().slice(0, 10),
                proveedor_id:      params.proveedorId,
                forma_pago:        params.formaPago,
                cuenta_bancaria_id: params.cuentaBancariaId || null,
                monto_total:       params.monto,
                referencia:        params.referencia || null,
                concepto:          params.concepto || null,
                created_by:        params.createdBy,
            })
            .select()
            .single()
        if (egErr) throw egErr

        // 3. Registrar aplicaciones a CxP
        if (params.cxpSeleccionados.length > 0) {
            const lineas: EgresoPagoCxP[] = params.cxpSeleccionados.map(c => ({
                id: crypto.randomUUID(),
                empresa_id:    params.empresaId,
                egreso_id:     (egreso as ComprobanteEgreso).id,
                cxp_id:        c.cxpId,
                monto_aplicado: c.montoAplicado,
                created_at:    new Date().toISOString(),
            }))

            const { error: linErr } = await supabase
                .from('egreso_pagos_cxp')
                .insert(lineas)
            if (linErr) throw linErr

            // 4. Actualizar saldos en facturacion.pagos_proveedores
            for (const c of params.cxpSeleccionados) {
                await cxpService.registrarPago({
                    empresa_id:       params.empresaId,
                    cxp_id:           c.cxpId,
                    proveedor_id:     params.proveedorId,
                    fecha_pago:       new Date().toISOString().slice(0, 10),
                    monto:            c.montoAplicado,
                    forma_pago:       params.formaPago.toUpperCase(),
                    numero_referencia: (egreso as ComprobanteEgreso).numero,
                })
            }
        }

        // 5. Registrar movimiento bancario si tiene cuenta bancaria
        if (params.cuentaBancariaId) {
            await supabase
                .from('movimientos_bancarios')
                .insert({
                    empresa_id:        params.empresaId,
                    cuenta_bancaria_id: params.cuentaBancariaId,
                    tipo:              'otro',
                    fecha:             new Date().toISOString().slice(0, 10),
                    monto:             params.monto,
                    sentido:           'debito',
                    referencia:        (egreso as ComprobanteEgreso).numero,
                    descripcion:       params.concepto || 'Pago a proveedor',
                    origen:            'egreso',
                    origen_id:         (egreso as ComprobanteEgreso).id,
                    created_by:        params.createdBy,
                })
        }

        return egreso as ComprobanteEgreso
    },

    async anular(id: string, motivo: string, anuladoPor: string): Promise<void> {
        const { error } = await supabase
            .from('comprobantes_egreso')
            .update({
                estado:          'anulado',
                motivo_anulacion: motivo,
                anulado_por:     anuladoPor,
                updated_at:      new Date().toISOString(),
            })
            .eq('id', id)
        if (error) throw error
    },
}
