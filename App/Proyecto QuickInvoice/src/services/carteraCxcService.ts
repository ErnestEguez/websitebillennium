import { contabilidadVentasService } from './contabilidadVentasService'
import { supabase } from '../lib/supabase'

export interface CarteraCxc {
    id: string
    empresa_id: string
    comprobante_id: string
    cliente_id: string
    fecha_emision: string
    fecha_vencimiento: string | null
    valor_original: number
    saldo: number
    estado: 'pendiente' | 'parcial' | 'pagada' | 'anulada'
    observaciones: string | null
    created_at: string
    updated_at: string
    // joins
    clientes?: { nombre: string; identificacion: string }
    comprobantes?: { secuencial: string; total: number }
}

export interface CarteraCxcPago {
    id: string
    cartera_id: string
    empresa_id: string
    fecha_pago: string
    valor: number
    metodo_pago: 'efectivo' | 'transferencia' | 'cheque' | 'tarjeta' | 'nota_credito' | 'otros' | 'retencion_fuente' | 'retencion_iva'
    referencia: string | null
    usuario_id: string | null
    created_at: string
    // Reversa / trazabilidad contable
    estado: 'activo' | 'reversado'
    lp_comprobante_id: string | null
    reversado_at: string | null
    reversado_por: string | null
    motivo_reversa: string | null
}

export const carteraCxcService = {

    async getCartera(empresaId: string, filtroEstado?: string): Promise<CarteraCxc[]> {
        let query = supabase
            .from('cartera_cxc')
            .select(`
                *,
                clientes (nombre, identificacion),
                comprobantes (secuencial, total)
            `)
            .eq('empresa_id', empresaId)
            .order('fecha_vencimiento', { ascending: true })

        if (filtroEstado === 'activos') {
            query = query.in('estado', ['pendiente', 'parcial'])
        } else if (filtroEstado && filtroEstado !== 'todos') {
            query = query.eq('estado', filtroEstado)
        }

        const { data, error } = await query
        if (error) throw error
        return (data || []) as CarteraCxc[]
    },

    async getPagosDeCartera(carteraId: string): Promise<CarteraCxcPago[]> {
        const { data, error } = await supabase
            .from('cartera_cxc_pagos')
            .select('*')
            .eq('cartera_id', carteraId)
            .order('fecha_pago', { ascending: false })

        if (error) throw error
        return (data || []) as CarteraCxcPago[]
    },

    async registrarPago(
        carteraId: string,
        empresaId: string,
        valor: number,
        metodoPago: CarteraCxcPago['metodo_pago'],
        referencia?: string
    ): Promise<CarteraCxcPago> {
        const { data: { user } } = await supabase.auth.getUser()

        const { data, error } = await supabase
            .from('cartera_cxc_pagos')
            .insert({
                cartera_id: carteraId,
                empresa_id: empresaId,
                fecha_pago: new Date().toISOString().split('T')[0],
                valor,
                metodo_pago: metodoPago,
                referencia: referencia || null,
                usuario_id: user?.id || null,
            })
            .select()
            .single()

        if (error) throw error
        // El trigger fn_actualizar_saldo_cxc actualiza el saldo y estado automáticamente
        return data as CarteraCxcPago
    },

    /**
     * Registra una retención que llegó DESPUÉS de facturar (el cliente no la
     * traía al momento de la venta, quedó como crédito, y ahora llega su
     * comprobante físico). Inserta el pago (rebaja el saldo vía el mismo
     * trigger de siempre) Y el detalle en retenciones_ventas (origen='CARTERA'),
     * igual que se hace al capturarla directo en la factura.
     */
    async registrarPagoRetencion(
        cartera: { id: string; comprobante_id: string; cliente_id: string },
        empresaId: string,
        retencion: { tipo: 'FUENTE' | 'IVA'; codigo: string; descripcion: string; base: number; pct: number; valor: number },
        numeroRetencion: string | undefined,
    ): Promise<CarteraCxcPago> {
        const { data: { user } } = await supabase.auth.getUser()
        const metodo: CarteraCxcPago['metodo_pago'] = retencion.tipo === 'FUENTE' ? 'retencion_fuente' : 'retencion_iva'
        const fecha = new Date().toISOString().split('T')[0]

        const { data: pago, error } = await supabase
            .from('cartera_cxc_pagos')
            .insert({
                cartera_id: cartera.id,
                empresa_id: empresaId,
                fecha_pago: fecha,
                valor: retencion.valor,
                metodo_pago: metodo,
                referencia: numeroRetencion || null,
                usuario_id: user?.id || null,
            })
            .select()
            .single()
        if (error) throw error

        const { error: errorRet } = await supabase
            .from('retenciones_ventas')
            .insert({
                empresa_id: empresaId,
                comprobante_id: cartera.comprobante_id,
                cliente_id: cartera.cliente_id,
                numero_retencion: numeroRetencion || null,
                fecha_emision: fecha,
                tipo: retencion.tipo,
                codigo_retencion: retencion.codigo,
                descripcion: retencion.descripcion || null,
                base_imponible: retencion.base,
                porcentaje: retencion.pct,
                valor: retencion.valor,
                origen: 'CARTERA',
                created_by: user?.id || null,
            })
        if (errorRet) console.error('Error registrando retenciones_ventas (cartera):', errorRet)

        // El trigger fn_actualizar_saldo_cxc actualiza el saldo y estado automáticamente
        return pago as CarteraCxcPago
    },

    /** Vincula el asiento contable (lp_comprobantes) generado para un pago. */
    async actualizarComprobantePago(pagoId: string, lpComprobanteId: string): Promise<void> {
        const { error } = await supabase
            .from('cartera_cxc_pagos')
            .update({ lp_comprobante_id: lpComprobanteId })
            .eq('id', pagoId)
        if (error) throw error
    },

    /**
     * Reversa un pago sin borrarlo: anula el asiento contable vinculado
     * (si no es compartido con otros pagos activos) y marca el pago como
     * 'reversado'. El trigger recalcula el saldo de la cartera.
     */
    async reversarPago(pagoId: string, motivo?: string): Promise<void> {
        const { data: pago, error: errPago } = await supabase
            .from('cartera_cxc_pagos')
            .select('id, estado, lp_comprobante_id')
            .eq('id', pagoId)
            .single()
        if (errPago) throw errPago
        if (pago.estado === 'reversado') throw new Error('Este pago ya fue reversado')

        if (pago.lp_comprobante_id) {
            const { count } = await supabase
                .from('cartera_cxc_pagos')
                .select('id', { count: 'exact', head: true })
                .eq('lp_comprobante_id', pago.lp_comprobante_id)
                .eq('estado', 'activo')
                .neq('id', pagoId)

            if (!count) {
                await contabilidadVentasService.anularAsientoCobro(pago.lp_comprobante_id)
            }
        }

        const { data: { user } } = await supabase.auth.getUser()
        const { data: updated, error } = await supabase
            .from('cartera_cxc_pagos')
            .update({
                estado: 'reversado',
                reversado_at: new Date().toISOString(),
                reversado_por: user?.id || null,
                motivo_reversa: motivo || null,
            })
            .eq('id', pagoId)
            .select('id')
            .maybeSingle()
        if (error) throw error
        if (!updated) throw new Error('No se pudo reversar el pago: el registro no se actualizó (revisa permisos/RLS de cartera_cxc_pagos).')
        // El trigger fn_actualizar_saldo_cxc recalcula saldo/estado de la cartera
    },

    async anularCartera(carteraId: string, observacion?: string): Promise<void> {
        const { error } = await supabase
            .from('cartera_cxc')
            .update({
                estado: 'anulada',
                observaciones: observacion || 'Anulado manualmente',
                updated_at: new Date().toISOString(),
            })
            .eq('id', carteraId)

        if (error) throw error
    },

    async getCarteraActivaPorCliente(empresaId: string, clienteId: string): Promise<CarteraCxc[]> {
        const { data, error } = await supabase
            .from('cartera_cxc')
            .select(`*, clientes (nombre, identificacion), comprobantes (secuencial, total)`)
            .eq('empresa_id', empresaId)
            .eq('cliente_id', clienteId)
            .in('estado', ['pendiente', 'parcial'])
            .order('fecha_emision', { ascending: true })
        if (error) throw error
        return (data || []) as CarteraCxc[]
    },

    async registrarPagoMultiple(
        distribuciones: { carteraId: string; valor: number }[],
        empresaId: string,
        metodoPago: CarteraCxcPago['metodo_pago'],
        referencia?: string
    ): Promise<CarteraCxcPago[]> {
        const { data: { user } } = await supabase.auth.getUser()
        const fecha = new Date().toISOString().split('T')[0]
        const pagos = distribuciones.map(d => ({
            cartera_id: d.carteraId,
            empresa_id: empresaId,
            fecha_pago: fecha,
            valor: d.valor,
            metodo_pago: metodoPago,
            referencia: referencia || null,
            usuario_id: user?.id || null,
        }))
        const { data, error } = await supabase.from('cartera_cxc_pagos').insert(pagos).select()
        if (error) throw error
        return (data || []) as CarteraCxcPago[]
    },

    async getEstadoCuentaCliente(empresaId: string, clienteId: string) {
        // Todas las carteras del cliente (cualquier estado)
        const { data: carteras, error: errC } = await supabase
            .from('cartera_cxc')
            .select(`*, comprobantes (secuencial, total)`)
            .eq('empresa_id', empresaId)
            .eq('cliente_id', clienteId)
            .order('fecha_emision', { ascending: true })
        if (errC) throw errC

        // Todos los pagos de esas carteras
        const carteraIds = (carteras || []).map(c => c.id)
        let pagos: any[] = []
        if (carteraIds.length > 0) {
            const { data: p, error: errP } = await supabase
                .from('cartera_cxc_pagos')
                .select('*')
                .in('cartera_id', carteraIds)
                .eq('estado', 'activo')
                .order('fecha_pago', { ascending: true })
            if (errP) throw errP
            pagos = p || []
        }

        // Agrupar pagos por cartera_id
        const pagosPorCartera: Record<string, typeof pagos> = {}
        for (const p of pagos) {
            if (!pagosPorCartera[p.cartera_id]) pagosPorCartera[p.cartera_id] = []
            pagosPorCartera[p.cartera_id].push(p)
        }

        return (carteras || []).map(c => ({
            ...c,
            pagos: pagosPorCartera[c.id] || [],
        }))
    },

    async getClientesConCartera(empresaId: string) {
        const { data, error } = await supabase
            .from('cartera_cxc')
            .select('cliente_id, clientes(id, nombre, identificacion)')
            .eq('empresa_id', empresaId)
            .order('cliente_id')
        if (error) throw error
        // Unique by cliente_id
        const map: Record<string, any> = {}
        for (const r of data || []) {
            if (!map[r.cliente_id]) map[r.cliente_id] = r.clientes
        }
        return Object.values(map).sort((a: any, b: any) => a.nombre.localeCompare(b.nombre))
    },

    async getResumenPorCliente(empresaId: string) {
        const { data, error } = await supabase
            .from('cartera_cxc')
            .select(`
                cliente_id,
                saldo,
                estado,
                clientes (nombre, identificacion)
            `)
            .eq('empresa_id', empresaId)
            .in('estado', ['pendiente', 'parcial'])

        if (error) throw error

        // Agrupar por cliente
        const resumen: Record<string, { nombre: string; identificacion: string; total_saldo: number; facturas: number }> = {}
        for (const row of data || []) {
            const cid = row.cliente_id as string
            if (!resumen[cid]) {
                resumen[cid] = {
                    nombre: (row.clientes as any)?.nombre || 'Sin nombre',
                    identificacion: (row.clientes as any)?.identificacion || '',
                    total_saldo: 0,
                    facturas: 0,
                }
            }
            resumen[cid].total_saldo += Number(row.saldo)
            resumen[cid].facturas += 1
        }

        return Object.values(resumen).sort((a, b) => b.total_saldo - a.total_saldo)
    },
}
