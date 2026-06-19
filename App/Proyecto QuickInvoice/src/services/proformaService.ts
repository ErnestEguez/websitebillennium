import { supabase } from '../lib/supabase'
import { puntoEmisionService } from './puntoEmisionService'
import { calcularLinea, calcularTotalesFactura } from './facturaDirectaService'
import type { DetalleFacturaDirecta } from './facturaDirectaService'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type EstadoProforma = 'vigente' | 'convertida' | 'anulada'

export interface ProformaDetalle {
    id: string
    proforma_id: string
    producto_id?: string | null
    nombre_producto: string
    cantidad: number
    precio_unitario: number
    descuento: number
    subtotal: number
    iva_porcentaje: number
    iva_valor: number
    total_linea: number
    created_at?: string
}

export interface Proforma {
    id: string
    empresa_id: string
    cliente_id: string
    vendedor_id?: string | null
    numero: string
    estado: EstadoProforma
    subtotal: number
    descuento_total: number
    base_iva_0: number
    base_iva_15: number
    valor_iva: number
    total: number
    observaciones?: string | null
    factura_id?: string | null
    factura_numero?: string | null
    factura_fecha?: string | null
    punto_emision_id?: string | null
    created_by?: string | null
    created_at: string
    updated_at: string
    // joins
    cliente?: { nombre: string; identificacion: string; email?: string | null; telefono?: string | null; direccion?: string | null } | null
    vendedor?: { nombre: string } | null
    detalles?: ProformaDetalle[]
}

export interface ProformaInput {
    empresa_id: string
    cliente_id: string
    detalles: DetalleFacturaDirecta[]
    vendedor_id?: string | null
    observaciones?: string
    created_by?: string
}

export interface ProformaFiltros {
    clienteTexto?: string   // nombre o identificación (filtro en cliente)
    desde?: string          // YYYY-MM-DD
    hasta?: string          // YYYY-MM-DD
    estado?: EstadoProforma
    numero?: string
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const proformaService = {

    async crear(input: ProformaInput): Promise<Proforma> {
        const { empresa_id, cliente_id, detalles, vendedor_id, observaciones, created_by } = input

        // Obtener punto de emisión activo en este dispositivo
        const puntoEmision = await puntoEmisionService.resolverParaDispositivo(empresa_id)

        let numero: string
        if (puntoEmision) {
            const { data: nextSec, error: secErr } = await supabase
                .rpc('qi_next_secuencial_punto', {
                    p_punto_emision_id: puntoEmision.id,
                    p_tipo_comprobante: 'PROFORMA',
                })
            if (secErr) throw secErr
            const est = puntoEmision.establecimiento.padStart(3, '0')
            const pto = puntoEmision.punto_emision.padStart(3, '0')
            numero = `PRF-${est}-${pto}-${(nextSec as number).toString().padStart(9, '0')}`
        } else {
            // Fallback sin punto de emisión configurado
            const { data: last } = await supabase
                .from('proformas')
                .select('numero')
                .eq('empresa_id', empresa_id)
                .like('numero', 'PRF-%')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()
            const lastNum = last ? parseInt(last.numero.split('-').pop() || '0', 10) : 0
            numero = `PRF-001-001-${(lastNum + 1).toString().padStart(9, '0')}`
        }

        // Calcular totales
        const totales = calcularTotalesFactura(detalles)
        let base0 = 0, base15 = 0
        for (const d of detalles) {
            if (d.cantidad <= 0 || d.precio_unitario <= 0) continue
            const l = calcularLinea(d)
            if ((d.iva_porcentaje ?? 0) === 0) base0 += l.subtotal_neto
            else base15 += l.subtotal_neto
        }

        // Insertar cabecera
        const { data: proforma, error: errPrf } = await supabase
            .from('proformas')
            .insert({
                empresa_id,
                cliente_id,
                vendedor_id: vendedor_id || null,
                numero,
                estado: 'vigente',
                subtotal: totales.subtotal,
                descuento_total: totales.descuentos,
                base_iva_0: base0,
                base_iva_15: base15,
                valor_iva: totales.iva,
                total: totales.total,
                observaciones: observaciones || null,
                punto_emision_id: puntoEmision?.id || null,
                created_by: created_by || null,
            })
            .select()
            .single()
        if (errPrf) throw errPrf

        // Insertar detalles
        const detallesInsert = detalles
            .filter(d => d.cantidad > 0 && d.precio_unitario > 0 && d.nombre_producto)
            .map(d => {
                const l = calcularLinea(d)
                return {
                    proforma_id: (proforma as Proforma).id,
                    producto_id:     d.producto_id || null,
                    nombre_producto: d.nombre_producto,
                    cantidad:        d.cantidad,
                    precio_unitario: d.precio_unitario,
                    descuento:       d.descuento,
                    subtotal:        l.subtotal_neto,
                    iva_porcentaje:  d.iva_porcentaje,
                    iva_valor:       l.iva_valor,
                    total_linea:     l.total,
                }
            })

        if (detallesInsert.length > 0) {
            const { error: errDet } = await supabase
                .from('proforma_detalles')
                .insert(detallesInsert)
            if (errDet) throw errDet
        }

        return proforma as Proforma
    },

    async listar(empresaId: string, filtros?: ProformaFiltros): Promise<Proforma[]> {
        let q = supabase
            .from('proformas')
            .select('*, cliente:clientes(nombre, identificacion), vendedor:vendedores(nombre)')
            .eq('empresa_id', empresaId)
            .order('created_at', { ascending: false })
            .limit(200)

        if (filtros?.desde)  q = q.gte('created_at', filtros.desde)
        if (filtros?.hasta)  q = q.lte('created_at', filtros.hasta + 'T23:59:59')
        if (filtros?.estado) q = q.eq('estado', filtros.estado)
        if (filtros?.numero) q = q.ilike('numero', `%${filtros.numero}%`)

        const { data, error } = await q
        if (error) throw error

        let lista = (data || []) as Proforma[]

        // Filtro por cliente (en JS porque es un join)
        if (filtros?.clienteTexto) {
            const txt = filtros.clienteTexto.toLowerCase()
            lista = lista.filter(p =>
                p.cliente?.nombre?.toLowerCase().includes(txt) ||
                p.cliente?.identificacion?.includes(txt)
            )
        }

        return lista
    },

    async getCompleta(id: string): Promise<Proforma> {
        const { data, error } = await supabase
            .from('proformas')
            .select(`
                *,
                cliente:clientes(nombre, identificacion, email, telefono, direccion),
                vendedor:vendedores(nombre),
                detalles:proforma_detalles(*)
            `)
            .eq('id', id)
            .single()
        if (error) throw error
        return data as Proforma
    },

    async anular(id: string): Promise<void> {
        const { error } = await supabase
            .from('proformas')
            .update({ estado: 'anulada', updated_at: new Date().toISOString() })
            .eq('id', id)
        if (error) throw error
    },

    // Marca la proforma como convertida y graba la referencia cruzada en ambas tablas
    async marcarConvertida(
        proformaId: string,
        facturaId: string,
        facturaNumero: string,
    ): Promise<void> {
        // 1. Obtener número de la proforma
        const { data: prf } = await supabase
            .from('proformas')
            .select('numero')
            .eq('id', proformaId)
            .single()

        // 2. Actualizar proforma con referencia a la factura
        const { error: e1 } = await supabase
            .from('proformas')
            .update({
                estado:         'convertida',
                factura_id:     facturaId,
                factura_numero: facturaNumero,
                factura_fecha:  new Date().toISOString().slice(0, 10),
                updated_at:     new Date().toISOString(),
            })
            .eq('id', proformaId)
        if (e1) throw e1

        // 3. Actualizar comprobante con referencia a la proforma
        const { error: e2 } = await supabase
            .from('comprobantes')
            .update({
                proforma_id:     proformaId,
                proforma_numero: prf?.numero ?? null,
            })
            .eq('id', facturaId)
        if (e2) throw e2
    },
}
