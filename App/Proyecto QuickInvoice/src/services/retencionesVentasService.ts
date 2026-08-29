// Retenciones que los CLIENTES le aplican a esta empresa sobre sus ventas —
// tres momentos distintos, misma tabla facturacion.retenciones_ventas salvo
// la de tarjeta (ver abajo):
//   a) Al momento de facturar — ya se captura en FacturaDirectaPage.tsx vía
//      facturaDirectaService (origen='FACTURA'). No hay nada que hacer acá.
//   b) Después de facturar, con saldo en Cartera CxC abierto — ya cubierto
//      por carteraCxcService.registrarPagoRetencion (origen='CARTERA').
//   c) Después de facturar, factura YA pagada (sin saldo en cartera) — el
//      hueco que cubre este servicio: busca la factura por número completo
//      y graba la retención sin tocar cartera_cxc_pagos/saldo, porque no
//      hay saldo que rebajar.
//
// Las retenciones de tarjeta de crédito (RECAP del banco) NO tienen factura
// asociada, así que van en una tabla separada (retenciones_tarjeta_banco) —
// no se declaran en el ATS, solo suman en el Formulario 104.
import { supabase } from '../lib/supabase'
import type { RetLine } from '../components/vendor/RetencionesEditor'

export interface FacturaParaRetencion {
    id: string
    secuencial: string
    fecha: string
    total: number
    cliente_id: string
    cliente_nombre: string
    cliente_identificacion: string
}

export interface RetencionTarjetaBanco {
    id: string
    empresa_id: string
    fecha: string
    banco: string
    numero_lote: string | null
    base_imponible: number
    porcentaje: number
    valor: number
    observaciones: string | null
    estado: 'ACTIVO' | 'ANULADO'
    created_at: string
}

export const retencionesVentasService = {

    // Busca facturas por número completo/parcial O por nombre/RUC del cliente,
    // para poder registrarle una retención llegada después sin importar si ya
    // se pagó o si sigue con saldo en cartera. Devuelve varias candidatas —
    // la pantalla decide si hay una sola coincidencia o si el usuario debe
    // elegir de una lista.
    async buscarFacturas(empresaId: string, texto: string): Promise<FacturaParaRetencion[]> {
        const q = texto.trim()
        if (!q) return []

        const { data: clientesMatch } = await supabase
            .from('clientes')
            .select('id')
            .eq('empresa_id', empresaId)
            .or(`nombre.ilike.%${q}%,identificacion.ilike.%${q}%`)
        const clienteIds = (clientesMatch ?? []).map((c: any) => c.id)

        let query = supabase
            .from('comprobantes')
            .select('id, secuencial, created_at, total, cliente_id, clientes(nombre, identificacion)')
            .eq('empresa_id', empresaId)
            .eq('tipo_comprobante', 'FACTURA')
            .neq('estado_sistema', 'ANULADA')
            .order('created_at', { ascending: false })
            .limit(20)

        query = clienteIds.length > 0
            ? query.or(`secuencial.ilike.%${q}%,cliente_id.in.(${clienteIds.join(',')})`)
            : query.ilike('secuencial', `%${q}%`)

        const { data, error } = await query
        if (error) throw error
        return (data ?? []).map((d: any) => ({
            id: d.id,
            secuencial: d.secuencial,
            fecha: d.created_at,
            total: Number(d.total) || 0,
            cliente_id: d.cliente_id,
            cliente_nombre: d.clientes?.nombre ?? '',
            cliente_identificacion: d.clientes?.identificacion ?? '',
        }))
    },

    // Registra una o varias líneas de retención contra una factura YA
    // encontrada, sin tocar cartera_cxc/saldo — para facturas pagadas en
    // efectivo/tarjeta que nunca tuvieron cuenta por cobrar abierta. Si la
    // factura SÍ tiene saldo pendiente en Cartera CxC, usar en su lugar
    // carteraCxcService.registrarPagoRetencion (rebaja el saldo).
    async registrarRetencionPosterior(input: {
        empresa_id: string
        factura: FacturaParaRetencion
        numero_retencion?: string
        fecha_emision: string
        retenciones: RetLine[]
        created_by?: string | null
    }): Promise<void> {
        const { empresa_id, factura, numero_retencion, fecha_emision, retenciones, created_by } = input
        const validas = retenciones.filter(r => r.codigo && r.valor > 0)
        if (validas.length === 0) throw new Error('Agrega al menos una línea de retención con código y valor')

        const { error } = await supabase
            .from('retenciones_ventas')
            .insert(validas.map(r => ({
                empresa_id,
                comprobante_id: factura.id,
                cliente_id: factura.cliente_id,
                numero_retencion: numero_retencion || null,
                fecha_emision,
                tipo: r.tipo,
                codigo_retencion: r.codigo,
                descripcion: r.descripcion || null,
                base_imponible: r.base,
                porcentaje: r.pct,
                valor: r.valor,
                origen: 'CARTERA',
                created_by: created_by || null,
            })))
        if (error) throw error
    },

    async registrarRetencionTarjeta(input: {
        empresa_id: string
        fecha: string
        banco: string
        numero_lote?: string
        base_imponible: number
        porcentaje: number
        valor: number
        observaciones?: string
        created_by?: string | null
    }): Promise<void> {
        if (!input.banco.trim()) throw new Error('El banco es obligatorio')
        if (!(input.valor > 0)) throw new Error('El valor retenido debe ser mayor a cero')
        const { error } = await supabase
            .from('retenciones_tarjeta_banco')
            .insert({
                empresa_id: input.empresa_id,
                fecha: input.fecha,
                banco: input.banco.trim(),
                numero_lote: input.numero_lote || null,
                base_imponible: input.base_imponible,
                porcentaje: input.porcentaje,
                valor: input.valor,
                observaciones: input.observaciones || null,
                created_by: input.created_by || null,
            })
        if (error) throw error
    },

    // Retenciones de clientes del período (para el reporte y para ATS/104) —
    // ambos orígenes FACTURA + CARTERA, más las de tarjeta por separado.
    async listarPorPeriodo(empresaId: string, desde: string, hasta: string): Promise<{
        ventas: any[]
        tarjeta: RetencionTarjetaBanco[]
    }> {
        const [{ data: ventas, error: e1 }, { data: tarjeta, error: e2 }] = await Promise.all([
            supabase
                .from('retenciones_ventas')
                .select('*, comprobantes(secuencial, created_at), clientes(nombre, identificacion)')
                .eq('empresa_id', empresaId)
                .eq('estado', 'ACTIVO')
                .gte('fecha_emision', desde).lte('fecha_emision', hasta)
                .order('fecha_emision', { ascending: false }),
            supabase
                .from('retenciones_tarjeta_banco')
                .select('*')
                .eq('empresa_id', empresaId)
                .eq('estado', 'ACTIVO')
                .gte('fecha', desde).lte('fecha', hasta)
                .order('fecha', { ascending: false }),
        ])
        if (e1) throw e1
        if (e2) throw e2
        return { ventas: ventas ?? [], tarjeta: (tarjeta ?? []) as RetencionTarjetaBanco[] }
    },
}
