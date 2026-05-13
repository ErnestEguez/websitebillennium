import { supabase } from '../lib/supabase'
import {
    startOfMonth, endOfMonth, subMonths, startOfYear,
    endOfYear, subYears, format
} from 'date-fns'
import { es } from 'date-fns/locale'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type PeriodoPreset = 'mes_actual' | 'mes_anterior' | 'trimestre_actual' | 'año_actual' | 'año_anterior'

export interface PeriodoFechas {
    inicio: Date
    fin: Date
    label: string
    prevInicio: Date
    prevFin: Date
}

export interface DashKpis {
    ventas: number
    ventas_prev: number
    costo: number
    margen: number
    facturas: number
    facturas_prev: number
    clientes_unicos: number
    ticket_promedio: number
}

export interface DashMensual {
    mes: string     // "2026-01"
    label: string   // "Ene 26"
    ventas: number
    costo: number
    margen: number
    facturas: number
}

export interface DashProducto {
    nombre: string
    producto_id: string | null
    unidades: number
    ventas: number
    costo: number
    margen: number
    margen_pct: number
    stock_actual: number
    rotacion: number  // unidades / stock_actual
}

export interface DashVendedor {
    nombre: string
    ventas: number
    facturas: number
    ticket_promedio: number
}

export interface DashPago {
    metodo: string
    valor: number
    pct: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export function calcPeriodo(preset: PeriodoPreset): PeriodoFechas {
    const now = new Date()

    switch (preset) {
        case 'mes_actual': {
            const ini = startOfMonth(now)
            const fin = endOfMonth(now)
            const p = subMonths(now, 1)
            return {
                inicio: ini, fin,
                prevInicio: startOfMonth(p), prevFin: endOfMonth(p),
                label: format(now, 'MMMM yyyy', { locale: es })
            }
        }
        case 'mes_anterior': {
            const m = subMonths(now, 1)
            const p = subMonths(now, 2)
            return {
                inicio: startOfMonth(m), fin: endOfMonth(m),
                prevInicio: startOfMonth(p), prevFin: endOfMonth(p),
                label: format(m, 'MMMM yyyy', { locale: es })
            }
        }
        case 'trimestre_actual': {
            const q = Math.floor(now.getMonth() / 3)
            const ini = new Date(now.getFullYear(), q * 3, 1)
            const fin = new Date(now.getFullYear(), q * 3 + 3, 0, 23, 59, 59)
            const pq = q === 0 ? 3 : q - 1
            const pYear = q === 0 ? now.getFullYear() - 1 : now.getFullYear()
            return {
                inicio: ini, fin,
                prevInicio: new Date(pYear, pq * 3, 1),
                prevFin: new Date(pYear, pq * 3 + 3, 0, 23, 59, 59),
                label: `Q${q + 1} ${now.getFullYear()}`
            }
        }
        case 'año_actual': {
            const py = subYears(now, 1)
            return {
                inicio: startOfYear(now), fin: endOfYear(now),
                prevInicio: startOfYear(py), prevFin: endOfYear(py),
                label: `Año ${now.getFullYear()}`
            }
        }
        case 'año_anterior': {
            const prev = subYears(now, 1)
            const p2 = subYears(now, 2)
            return {
                inicio: startOfYear(prev), fin: endOfYear(prev),
                prevInicio: startOfYear(p2), prevFin: endOfYear(p2),
                label: `Año ${prev.getFullYear()}`
            }
        }
    }
}

// Regresión lineal simple (para predicción)
export function linReg(values: number[]) {
    const n = values.length
    if (n < 2) return (_i: number) => values[values.length - 1] ?? 0
    const sumX = n * (n + 1) / 2
    const sumX2 = n * (n + 1) * (2 * n + 1) / 6
    const sumY = values.reduce((a, b) => a + b, 0)
    const sumXY = values.reduce((s, v, i) => s + (i + 1) * v, 0)
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n
    return (i: number) => Math.max(0, slope * i + intercept)
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const dashboardService = {

    // KPIs del período seleccionado + comparativo período anterior
    async loadKpis(
        empresaId: string,
        inicio: Date, fin: Date,
        prevInicio: Date, prevFin: Date
    ): Promise<DashKpis> {
        const [currRes, prevRes, kardexRes] = await Promise.all([
            supabase.from('comprobantes')
                .select('total, cliente_id')
                .eq('empresa_id', empresaId)
                .eq('estado_sistema', 'VIGENTE')
                .eq('tipo_comprobante', 'FACTURA')
                .gte('created_at', inicio.toISOString())
                .lte('created_at', fin.toISOString()),

            supabase.from('comprobantes')
                .select('total')
                .eq('empresa_id', empresaId)
                .eq('estado_sistema', 'VIGENTE')
                .eq('tipo_comprobante', 'FACTURA')
                .gte('created_at', prevInicio.toISOString())
                .lte('created_at', prevFin.toISOString()),

            supabase.from('kardex')
                .select('costo_unitario, cantidad')
                .eq('empresa_id', empresaId)
                .eq('tipo_movimiento', 'SALIDA')
                .gte('fecha', inicio.toISOString().split('T')[0])
                .lte('fecha', fin.toISOString().split('T')[0]),
        ])

        const curr = currRes.data || []
        const prev = prevRes.data || []
        const kard = kardexRes.data || []

        const ventas = curr.reduce((s: number, c: any) => s + Number(c.total), 0)
        const ventas_prev = prev.reduce((s: number, c: any) => s + Number(c.total), 0)
        const costo = kard.reduce((s: number, k: any) => s + Number(k.costo_unitario || 0) * Number(k.cantidad || 0), 0)
        const clientes_unicos = new Set(curr.map((c: any) => c.cliente_id)).size

        return {
            ventas: Math.round(ventas * 100) / 100,
            ventas_prev: Math.round(ventas_prev * 100) / 100,
            costo: Math.round(costo * 100) / 100,
            margen: Math.round((ventas - costo) * 100) / 100,
            facturas: curr.length,
            facturas_prev: prev.length,
            clientes_unicos,
            ticket_promedio: curr.length > 0 ? Math.round((ventas / curr.length) * 100) / 100 : 0,
        }
    },

    // Evolución mensual — últimos 12 meses (independiente del período seleccionado)
    async loadMensuales(empresaId: string): Promise<DashMensual[]> {
        const fin = endOfMonth(new Date())
        const inicio = startOfMonth(subMonths(new Date(), 11))

        const [compsRes, kardexRes] = await Promise.all([
            supabase.from('comprobantes')
                .select('total, created_at')
                .eq('empresa_id', empresaId)
                .eq('estado_sistema', 'VIGENTE')
                .eq('tipo_comprobante', 'FACTURA')
                .gte('created_at', inicio.toISOString())
                .lte('created_at', fin.toISOString()),

            supabase.from('kardex')
                .select('costo_unitario, cantidad, fecha')
                .eq('empresa_id', empresaId)
                .eq('tipo_movimiento', 'SALIDA')
                .gte('fecha', inicio.toISOString().split('T')[0])
                .lte('fecha', fin.toISOString().split('T')[0]),
        ])

        // Construir mapa de 12 meses
        const map: Record<string, DashMensual> = {}
        for (let i = 11; i >= 0; i--) {
            const d = subMonths(new Date(), i)
            const key = format(d, 'yyyy-MM')
            map[key] = {
                mes: key,
                label: `${MESES[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`,
                ventas: 0, costo: 0, margen: 0, facturas: 0,
            }
        }

        for (const c of (compsRes.data || [])) {
            const key = format(new Date(c.created_at), 'yyyy-MM')
            if (map[key]) { map[key].ventas += Number(c.total); map[key].facturas++ }
        }
        for (const k of (kardexRes.data || [])) {
            const key = k.fecha.substring(0, 7)
            if (map[key]) map[key].costo += Number(k.costo_unitario || 0) * Number(k.cantidad || 0)
        }

        return Object.values(map).map(m => ({
            ...m,
            ventas: Math.round(m.ventas * 100) / 100,
            costo: Math.round(m.costo * 100) / 100,
            margen: Math.round((m.ventas - m.costo) * 100) / 100,
        }))
    },

    // Top productos del período
    async loadProductos(empresaId: string, inicio: Date, fin: Date): Promise<DashProducto[]> {
        const [compsRes, kardexRes, stocksRes] = await Promise.all([
            supabase.from('comprobantes')
                .select('id, comprobante_detalles(nombre_producto, producto_id, cantidad, total)')
                .eq('empresa_id', empresaId)
                .eq('estado_sistema', 'VIGENTE')
                .eq('tipo_comprobante', 'FACTURA')
                .gte('created_at', inicio.toISOString())
                .lte('created_at', fin.toISOString()),

            supabase.from('kardex')
                .select('producto_id, cantidad, costo_unitario')
                .eq('empresa_id', empresaId)
                .eq('tipo_movimiento', 'SALIDA')
                .gte('fecha', inicio.toISOString().split('T')[0])
                .lte('fecha', fin.toISOString().split('T')[0]),

            supabase.from('productos')
                .select('id, stock')
                .eq('empresa_id', empresaId),
        ])

        // Agregar ventas por producto
        const prodMap: Record<string, { nombre: string; unidades: number; ventas: number; producto_id: string | null }> = {}
        for (const comp of (compsRes.data || [])) {
            for (const det of ((comp as any).comprobante_detalles || [])) {
                const key = det.producto_id || `__${det.nombre_producto}`
                if (!prodMap[key]) prodMap[key] = { nombre: det.nombre_producto, unidades: 0, ventas: 0, producto_id: det.producto_id }
                prodMap[key].unidades += Number(det.cantidad)
                prodMap[key].ventas += Number(det.total)
            }
        }

        // Agregar costos por producto desde kardex
        const costoMap: Record<string, number> = {}
        for (const k of (kardexRes.data || [])) {
            if (k.producto_id) costoMap[k.producto_id] = (costoMap[k.producto_id] || 0) + Number(k.costo_unitario || 0) * Number(k.cantidad || 0)
        }

        // Stock actual
        const stockMap: Record<string, number> = {}
        for (const p of (stocksRes.data || [])) stockMap[p.id] = Number(p.stock || 0)

        return Object.values(prodMap)
            .map(p => {
                const costo = costoMap[p.producto_id || ''] || 0
                const stock_actual = stockMap[p.producto_id || ''] || 0
                const margen = p.ventas - costo
                return {
                    nombre: p.nombre,
                    producto_id: p.producto_id,
                    unidades: Math.round(p.unidades * 100) / 100,
                    ventas: Math.round(p.ventas * 100) / 100,
                    costo: Math.round(costo * 100) / 100,
                    margen: Math.round(margen * 100) / 100,
                    margen_pct: p.ventas > 0 ? Math.round((margen / p.ventas) * 1000) / 10 : 0,
                    stock_actual,
                    rotacion: stock_actual > 0 ? Math.round((p.unidades / stock_actual) * 100) / 100 : p.unidades > 0 ? 999 : 0,
                }
            })
            .filter(p => p.ventas > 0)
            .sort((a, b) => b.ventas - a.ventas)
            .slice(0, 20)
    },

    // Ventas por vendedor del período
    async loadVendedores(empresaId: string, inicio: Date, fin: Date): Promise<DashVendedor[]> {
        const [compsRes, vendRes] = await Promise.all([
            supabase.from('comprobantes')
                .select('total, vendedor_id')
                .eq('empresa_id', empresaId)
                .eq('estado_sistema', 'VIGENTE')
                .eq('tipo_comprobante', 'FACTURA')
                .gte('created_at', inicio.toISOString())
                .lte('created_at', fin.toISOString()),

            supabase.from('vendedores')
                .select('id, nombre_vendedor')
                .eq('empresa_id', empresaId),
        ])

        const vendMap: Record<string, string> = {}
        for (const v of (vendRes.data || [])) vendMap[v.id] = v.nombre_vendedor

        const byVend: Record<string, { nombre: string; ventas: number; facturas: number }> = {}
        for (const c of (compsRes.data || [])) {
            const key = c.vendedor_id || '__sin'
            const nombre = c.vendedor_id ? (vendMap[c.vendedor_id] || 'Desconocido') : 'Sin asignar'
            if (!byVend[key]) byVend[key] = { nombre, ventas: 0, facturas: 0 }
            byVend[key].ventas += Number(c.total)
            byVend[key].facturas++
        }

        return Object.values(byVend)
            .map(v => ({
                ...v,
                ventas: Math.round(v.ventas * 100) / 100,
                ticket_promedio: v.facturas > 0 ? Math.round((v.ventas / v.facturas) * 100) / 100 : 0,
            }))
            .filter(v => v.ventas > 0)
            .sort((a, b) => b.ventas - a.ventas)
    },

    // Distribución de formas de pago del período
    async loadPagos(empresaId: string, inicio: Date, fin: Date): Promise<DashPago[]> {
        const { data: comps } = await supabase
            .from('comprobantes')
            .select('id')
            .eq('empresa_id', empresaId)
            .eq('estado_sistema', 'VIGENTE')
            .gte('created_at', inicio.toISOString())
            .lte('created_at', fin.toISOString())

        if (!comps || comps.length === 0) return []

        const { data: pagos } = await supabase
            .from('comprobante_pagos')
            .select('metodo_pago, valor')
            .in('comprobante_id', comps.map(c => c.id))

        const LABELS: Record<string, string> = {
            efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia',
            cheque: 'Cheque', credito: 'Crédito', otros: 'Otros',
        }

        const byMetodo: Record<string, number> = {}
        for (const p of (pagos || [])) {
            const m = p.metodo_pago || 'otros'
            byMetodo[m] = (byMetodo[m] || 0) + Number(p.valor)
        }

        const total = Object.values(byMetodo).reduce((s, v) => s + v, 0)
        return Object.entries(byMetodo)
            .map(([m, valor]) => ({
                metodo: LABELS[m] || m,
                valor: Math.round(valor * 100) / 100,
                pct: total > 0 ? Math.round((valor / total) * 1000) / 10 : 0,
            }))
            .sort((a, b) => b.valor - a.valor)
    },
}
