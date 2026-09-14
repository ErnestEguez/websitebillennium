import { supabase } from '../lib/supabase'

// El combo y cada uno de sus componentes se capturan CON IVA incluido
// (así lo maneja el usuario al armar la promoción) — el desglose
// base/IVA se calcula recién al facturar, por componente, según el
// iva_porcentaje real de CADA producto (nunca una sola tasa para todo
// el combo, porque puede mezclar productos a distinta tarifa).
export interface ComboComponente {
    id?: string
    producto_id: string
    nombre_producto?: string
    codigo_producto?: string | null
    iva_porcentaje?: number
    cantidad: number
    precio_unitario: number // con IVA
}

export interface Combo {
    id: string
    empresa_id: string
    codigo: string | null
    descripcion: string
    precio_total: number // con IVA — debe cuadrar con la suma de componentes
    activo: boolean
    created_at: string
    componentes: ComboComponente[]
}

/** Línea de detalle de factura equivalente a un componente ya vendido — mismo shape que DetalleFacturaDirecta. */
export interface LineaVentaCombo {
    producto_id: string
    nombre_producto: string
    cantidad: number
    precio_unitario: number // sin IVA — listo para comprobante_detalles
    descuento: number
    iva_porcentaje: number
}

function mapComponentes(raw: any[]): ComboComponente[] {
    return (raw ?? [])
        .slice()
        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
        .map(c => ({
            id: c.id,
            producto_id: c.producto_id,
            nombre_producto: c.productos?.nombre,
            codigo_producto: c.productos?.codigo ?? null,
            iva_porcentaje: c.productos?.iva_porcentaje != null ? Number(c.productos.iva_porcentaje) : undefined,
            cantidad: Number(c.cantidad),
            precio_unitario: Number(c.precio_unitario),
        }))
}

export const combosService = {
    async listar(empresaId: string): Promise<Combo[]> {
        const { data, error } = await supabase
            .from('combos')
            .select(`
                id, empresa_id, codigo, descripcion, precio_total, activo, created_at,
                combo_componentes (id, producto_id, cantidad, precio_unitario, orden, productos (nombre, codigo, iva_porcentaje))
            `)
            .eq('empresa_id', empresaId)
            .eq('activo', true)
            .order('descripcion')
        if (error) throw error
        return (data ?? []).map((c: any) => ({
            id: c.id, empresa_id: c.empresa_id, codigo: c.codigo, descripcion: c.descripcion,
            precio_total: Number(c.precio_total), activo: c.activo, created_at: c.created_at,
            componentes: mapComponentes(c.combo_componentes),
        }))
    },

    /** Búsqueda en vivo para el buscador de Nueva Factura — por código o descripción. */
    async buscar(empresaId: string, texto: string): Promise<Combo[]> {
        const q = '%' + texto.trim().replace(/\*/g, '%') + '%'
        const { data, error } = await supabase
            .from('combos')
            .select(`
                id, empresa_id, codigo, descripcion, precio_total, activo, created_at,
                combo_componentes (id, producto_id, cantidad, precio_unitario, orden, productos (nombre, codigo, iva_porcentaje))
            `)
            .eq('empresa_id', empresaId)
            .eq('activo', true)
            .or(`descripcion.ilike.${q},codigo.ilike.${q}`)
            .order('descripcion')
            .limit(20)
        if (error) throw error
        return (data ?? []).map((c: any) => ({
            id: c.id, empresa_id: c.empresa_id, codigo: c.codigo, descripcion: c.descripcion,
            precio_total: Number(c.precio_total), activo: c.activo, created_at: c.created_at,
            componentes: mapComponentes(c.combo_componentes),
        }))
    },

    async crear(empresaId: string, input: { codigo: string | null; descripcion: string; precio_total: number; componentes: ComboComponente[] }, createdBy?: string): Promise<Combo> {
        const { data: combo, error } = await supabase
            .from('combos')
            .insert({
                empresa_id: empresaId,
                codigo: input.codigo || null,
                descripcion: input.descripcion,
                precio_total: input.precio_total,
                created_by: createdBy || null,
            })
            .select()
            .single()
        if (error) throw error

        const filas = input.componentes.map((c, i) => ({
            combo_id: combo.id,
            producto_id: c.producto_id,
            cantidad: c.cantidad,
            precio_unitario: c.precio_unitario,
            orden: i,
        }))
        const { error: errComp } = await supabase.from('combo_componentes').insert(filas)
        if (errComp) throw errComp

        return { ...combo, precio_total: Number(combo.precio_total), componentes: input.componentes }
    },

    async actualizar(comboId: string, input: { codigo: string | null; descripcion: string; precio_total: number; componentes: ComboComponente[] }): Promise<void> {
        const { error } = await supabase
            .from('combos')
            .update({
                codigo: input.codigo || null,
                descripcion: input.descripcion,
                precio_total: input.precio_total,
                updated_at: new Date().toISOString(),
            })
            .eq('id', comboId)
        if (error) throw error

        // Reemplaza los componentes completos — más simple y seguro que
        // reconciliar altas/bajas/ediciones fila por fila.
        const { error: errDel } = await supabase.from('combo_componentes').delete().eq('combo_id', comboId)
        if (errDel) throw errDel

        const filas = input.componentes.map((c, i) => ({
            combo_id: comboId,
            producto_id: c.producto_id,
            cantidad: c.cantidad,
            precio_unitario: c.precio_unitario,
            orden: i,
        }))
        const { error: errComp } = await supabase.from('combo_componentes').insert(filas)
        if (errComp) throw errComp
    },

    /** Baja lógica — igual que productos.activo, preserva el historial de combos ya facturados. */
    async eliminar(comboId: string): Promise<void> {
        const { error } = await supabase.from('combos').update({ activo: false, updated_at: new Date().toISOString() }).eq('id', comboId)
        if (error) throw error
    },

    /**
     * El combo NUNCA se vende como tal — al facturar, se descompone en sus
     * componentes reales (los que sí impactan Kardex y contabilidad).
     * cantidadCombos es cuántos combos completos se están vendiendo en esa
     * línea (ej. 2 combos de [1 cocina + 1 refri] = 2 cocinas + 2 refris).
     */
    expandirParaVenta(combo: Combo, cantidadCombos: number): LineaVentaCombo[] {
        return combo.componentes.map(c => {
            const ivaPct = c.iva_porcentaje ?? 15
            const precioNeto = Math.round((c.precio_unitario / (1 + ivaPct / 100)) * 10000) / 10000
            return {
                producto_id: c.producto_id,
                nombre_producto: c.nombre_producto ?? '',
                cantidad: c.cantidad * cantidadCombos,
                precio_unitario: precioNeto,
                descuento: 0,
                iva_porcentaje: ivaPct,
            }
        })
    },
}
