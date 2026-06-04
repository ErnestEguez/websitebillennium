import { supabase } from '../lib/supabase'
import { supabaseFacturacion } from '../lib/supabaseFacturacion'
import { cxpService } from './bancosService'
import { anticipoService } from './anticipoService'
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

        // 5. Registrar movimiento bancario (solo si NO es cheque_postfechado — ese se registra al cobro)
        const esPostfechado = params.formaPago === 'cheque_postfechado'
        const tipoMovimiento = (['cheque'].includes(params.formaPago)) ? 'cheque'
            : params.formaPago === 'transferencia' ? 'transferencia'
            : 'otro'
        if (params.cuentaBancariaId && !esPostfechado) {
            await supabase
                .from('movimientos_bancarios')
                .insert({
                    empresa_id:        params.empresaId,
                    cuenta_bancaria_id: params.cuentaBancariaId,
                    tipo:              tipoMovimiento,
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

    async obtenerParaImprimir(id: string): Promise<{
        egreso: ComprobanteEgreso
        proveedor: { nombre_empresa: string; ruc: string } | null
        facturas: { numero_factura: string; monto_aplicado: number }[]
    }> {
        // 1. Egreso con pagos_cxp
        const { data: egreso, error } = await supabase
            .from('comprobantes_egreso')
            .select(`${EGRESO_SELECT}, pagos_cxp:egreso_pagos_cxp(cxp_id, monto_aplicado)`)
            .eq('id', id)
            .single()
        if (error) throw error
        const eg = egreso as ComprobanteEgreso

        // 2. Proveedor desde facturacion (cross-schema)
        const { data: prov } = await supabaseFacturacion
            .from('proveedores')
            .select('nombre_empresa, ruc')
            .eq('id', eg.proveedor_id)
            .maybeSingle()

        // 3. Números de factura de cada CxP
        const facturas: { numero_factura: string; monto_aplicado: number }[] = []
        if (eg.pagos_cxp?.length) {
            for (const p of eg.pagos_cxp as { cxp_id: string; monto_aplicado: number }[]) {
                const { data: cxp } = await supabaseFacturacion
                    .from('cuentas_por_pagar')
                    .select('compra:ingresos_stock(numero_factura)')
                    .eq('id', p.cxp_id)
                    .maybeSingle()
                const nf = (cxp as any)?.compra?.numero_factura ?? p.cxp_id.slice(0, 8)
                facturas.push({ numero_factura: nf, monto_aplicado: p.monto_aplicado })
            }
        }

        return { egreso: eg, proveedor: prov as any, facturas }
    },

    async registrarAnticiposUsados(empresaId: string, egresoId: string, anticipos: { anticipoId: string; montoAplicado: number }[]): Promise<void> {
        if (anticipos.length === 0) return
        const { error } = await supabase
            .from('egreso_anticipos')
            .insert(anticipos.map(a => ({
                empresa_id:     empresaId,
                egreso_id:      egresoId,
                anticipo_id:    a.anticipoId,
                monto_aplicado: a.montoAplicado,
            })))
        if (error) throw error
    },

    async anular(id: string, motivo: string, anuladoPor: string): Promise<void> {
        // 1. Obtener el egreso con empresa_id y numero para reversión segura
        const { data: egreso, error: eErr } = await supabase
            .from('comprobantes_egreso')
            .select('empresa_id, numero')
            .eq('id', id)
            .single()
        if (eErr) throw eErr

        const { empresa_id, numero } = egreso as { empresa_id: string; numero: string }
        if (!numero) throw new Error('El egreso no tiene número — no se puede revertir')

        // 2. Marcar egreso como anulado
        const { error } = await supabase
            .from('comprobantes_egreso')
            .update({ estado: 'anulado', motivo_anulacion: motivo, anulado_por: anuladoPor, updated_at: new Date().toISOString() })
            .eq('id', id)
        if (error) throw error

        // 3. Anular movimiento bancario generado
        await supabase
            .from('movimientos_bancarios')
            .update({ estado: 'anulado', updated_at: new Date().toISOString() })
            .eq('origen_id', id)
            .eq('origen', 'egreso')

        // 4. Revertir pagos de CxP en facturación (filtrado por empresa)
        await cxpService.revertirPagos(empresa_id, numero)

        // 5. Revertir anticipos cruzados
        const { data: anticiposUsados } = await supabase
            .from('egreso_anticipos')
            .select('anticipo_id, monto_aplicado')
            .eq('egreso_id', id)
        if (anticiposUsados && anticiposUsados.length > 0) {
            for (const ea of anticiposUsados as { anticipo_id: string; monto_aplicado: number }[]) {
                await anticipoService.revertirAplicacion(ea.anticipo_id, ea.monto_aplicado)
            }
        }
    },
}
