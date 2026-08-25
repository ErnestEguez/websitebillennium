// Facturación en Vivo — borradores de factura para venta en vivo (TikTok,
// etc.). Viven aparte de Nueva Factura; se "emiten" cargándolos en el
// formulario normal para completar el pago y disparar el flujo SRI ya
// existente, sin tocarlo. Ver migración 20260824_facturas_en_vivo.sql.
import { supabase } from '../lib/supabase'
import { calcularLinea, type DetalleFacturaDirecta, type PagoFactura } from './facturaDirectaService'

export interface FacturaEnVivoDetalleInput {
    producto_id: string | null
    nombre_producto: string
    cantidad: number
    precio_unitario: number
    descuento: number
    iva_porcentaje: number
    talla?: string | null
    color?: string | null
}

export interface FacturaEnVivoPagoInput {
    metodo_pago: string
    valor: number
    referencia?: string | null
    cuenta_bancaria_id?: string | null
    numero_documento?: string | null
    observaciones?: string | null
}

export interface GuardarFacturaEnVivoInput {
    empresa_id: string
    cliente_id: string | null
    observaciones?: string | null
    detalles: FacturaEnVivoDetalleInput[]
    pagos: FacturaEnVivoPagoInput[]
    created_by?: string | null
}

export interface FacturaEnVivoResumen {
    id: string
    cliente_id: string | null
    cliente_nombre: string
    cliente_identificacion: string
    estado: string
    n_articulos: number
    subtotal: number
    formas_pago: string
    created_at: string
    updated_at: string
}

export const facturaEnVivoService = {

    async listarPendientes(empresaId: string): Promise<FacturaEnVivoResumen[]> {
        const { data, error } = await supabase
            .from('facturas_en_vivo')
            .select('id, cliente_id, estado, created_at, updated_at, clientes(nombre, identificacion), facturas_en_vivo_detalles(cantidad, precio_unitario, descuento, iva_porcentaje), facturas_en_vivo_pagos(metodo_pago)')
            .eq('empresa_id', empresaId)
            .eq('estado', 'PENDIENTE')
            .order('updated_at', { ascending: false })
        if (error) throw error

        return (data ?? []).map((f: any) => {
            const detalles: any[] = f.facturas_en_vivo_detalles ?? []
            const subtotal = detalles.reduce((s, d) => s + calcularLinea(d as DetalleFacturaDirecta).subtotal_neto, 0)
            const metodos = [...new Set((f.facturas_en_vivo_pagos ?? []).map((p: any) => p.metodo_pago))]
            return {
                id: f.id,
                cliente_id: f.cliente_id,
                cliente_nombre: f.clientes?.nombre ?? '(sin cliente aún)',
                cliente_identificacion: f.clientes?.identificacion ?? '',
                estado: f.estado,
                n_articulos: detalles.length,
                subtotal: Math.round(subtotal * 100) / 100,
                formas_pago: metodos.join(', ') || '—',
                created_at: f.created_at,
                updated_at: f.updated_at,
            }
        })
    },

    async obtener(id: string) {
        const { data, error } = await supabase
            .from('facturas_en_vivo')
            .select('*, clientes(*), facturas_en_vivo_detalles(*), facturas_en_vivo_pagos(*)')
            .eq('id', id)
            .single()
        if (error) throw error
        return data
    },

    async crear(input: GuardarFacturaEnVivoInput) {
        const { empresa_id, cliente_id, observaciones, detalles, pagos, created_by } = input

        const { data: cab, error } = await supabase
            .from('facturas_en_vivo')
            .insert({
                empresa_id, cliente_id: cliente_id || null,
                observaciones: observaciones || null,
                estado: 'PENDIENTE',
                created_by: created_by || null,
            })
            .select()
            .single()
        if (error) throw error

        await this._guardarDetallesYPagos(cab.id, detalles, pagos)
        return cab
    },

    async actualizar(id: string, input: Omit<GuardarFacturaEnVivoInput, 'empresa_id' | 'created_by'>) {
        const { cliente_id, observaciones, detalles, pagos } = input

        const { error } = await supabase
            .from('facturas_en_vivo')
            .update({
                cliente_id: cliente_id || null,
                observaciones: observaciones || null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id)
        if (error) throw error

        // Reemplaza detalle/pagos completos — más simple y seguro que hacer
        // diff línea por línea para un borrador que se edita libremente.
        await Promise.all([
            supabase.from('facturas_en_vivo_detalles').delete().eq('factura_en_vivo_id', id),
            supabase.from('facturas_en_vivo_pagos').delete().eq('factura_en_vivo_id', id),
        ])
        await this._guardarDetallesYPagos(id, detalles, pagos)
    },

    async _guardarDetallesYPagos(facturaEnVivoId: string, detalles: FacturaEnVivoDetalleInput[], pagos: FacturaEnVivoPagoInput[]) {
        const detallesValidos = detalles.filter(d => d.cantidad > 0 && d.precio_unitario > 0)
        if (detallesValidos.length > 0) {
            const { error } = await supabase
                .from('facturas_en_vivo_detalles')
                .insert(detallesValidos.map(d => ({
                    factura_en_vivo_id: facturaEnVivoId,
                    producto_id: d.producto_id,
                    nombre_producto: d.nombre_producto,
                    cantidad: d.cantidad,
                    precio_unitario: d.precio_unitario,
                    descuento: d.descuento,
                    iva_porcentaje: d.iva_porcentaje,
                    talla: d.talla || null,
                    color: d.color || null,
                })))
            if (error) throw error
        }

        const pagosValidos = pagos.filter(p => p.valor > 0)
        if (pagosValidos.length > 0) {
            const { error } = await supabase
                .from('facturas_en_vivo_pagos')
                .insert(pagosValidos.map(p => ({
                    factura_en_vivo_id: facturaEnVivoId,
                    metodo_pago: p.metodo_pago,
                    valor: p.valor,
                    referencia: p.referencia || null,
                    cuenta_bancaria_id: p.cuenta_bancaria_id || null,
                    numero_documento: p.numero_documento || null,
                    observaciones: p.observaciones || null,
                })))
            if (error) throw error
        }
    },

    async eliminar(id: string) {
        const { error } = await supabase.from('facturas_en_vivo').delete().eq('id', id)
        if (error) throw error
    },

    async marcarEmitida(id: string, comprobanteId: string) {
        const { error } = await supabase
            .from('facturas_en_vivo')
            .update({ estado: 'EMITIDA', comprobante_id: comprobanteId, updated_at: new Date().toISOString() })
            .eq('id', id)
        if (error) throw error
    },

    // Convierte el detalle/pagos guardados de un borrador al shape que
    // consume el formulario de Nueva Factura, para precargarlo al emitir.
    mapearParaFormulario(draft: any): { detalles: DetalleFacturaDirecta[]; pagos: PagoFactura[] } {
        const detalles: DetalleFacturaDirecta[] = (draft.facturas_en_vivo_detalles ?? []).map((d: any) => ({
            producto_id: d.producto_id,
            nombre_producto: d.nombre_producto,
            cantidad: Number(d.cantidad) || 1,
            precio_unitario: Number(d.precio_unitario) || 0,
            descuento: Number(d.descuento) || 0,
            iva_porcentaje: Number(d.iva_porcentaje ?? 15),
            subproducto_id: null,
            factor_conversion: 1,
            talla: d.talla ?? null,
            color: d.color ?? null,
        }))
        const pagos: PagoFactura[] = (draft.facturas_en_vivo_pagos ?? []).map((p: any) => ({
            metodo: p.metodo_pago,
            valor: Number(p.valor) || 0,
            referencia: p.referencia ?? '',
            cuenta_bancaria_id: p.cuenta_bancaria_id ?? null,
            numero_documento: p.numero_documento ?? undefined,
            observaciones: p.observaciones ?? undefined,
        }))
        return { detalles, pagos }
    },
}
