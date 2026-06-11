import { supabase } from '../lib/supabase'
import { bodegaService } from './bodegaService'

export interface MovimientoKardex {
    id: string
    empresa_id: string
    producto_id: string
    bodega_id?: string
    fecha: string
    tipo_movimiento: 'ENTRADA' | 'SALIDA'
    motivo: string
    documento_referencia?: string
    cantidad: number
    costo_unitario?: number
    saldo_cantidad: number
    saldo_costo_promedio?: number
    created_at?: string
}

export interface KardexConProducto extends MovimientoKardex {
    producto?: {
        nombre: string
        codigo: string
    }
    bodega?: {
        nombre: string
        codigo?: string
    }
}

export const kardexService = {
    async getKardexByProducto(
        productoId: string,
        fechaInicio?: string,
        fechaFin?: string,
        bodegaId?: string,
    ): Promise<KardexConProducto[]> {
        let query = supabase
            .from('kardex')
            .select('*, producto:productos(nombre), bodega:bodegas(nombre,codigo)')
            .eq('producto_id', productoId)
            .order('fecha', { ascending: true })
            .order('created_at', { ascending: true })

        if (fechaInicio) query = query.gte('fecha', fechaInicio)
        if (fechaFin)    query = query.lte('fecha', `${fechaFin}T23:59:59.999Z`)
        if (bodegaId)    query = query.eq('bodega_id', bodegaId)

        const { data, error } = await query
        if (error) throw error
        return data || []
    },

    async getKardexByEmpresa(
        empresaId: string,
        fechaInicio?: string,
        fechaFin?: string,
        bodegaId?: string,
    ): Promise<KardexConProducto[]> {
        let query = supabase
            .from('kardex')
            .select('*, producto:productos(nombre,codigo), bodega:bodegas(nombre,codigo)')
            .eq('empresa_id', empresaId)
            .order('fecha', { ascending: false })

        if (fechaInicio) query = query.gte('fecha', fechaInicio)
        if (fechaFin)    query = query.lte('fecha', `${fechaFin}T23:59:59.999Z`)
        if (bodegaId)    query = query.eq('bodega_id', bodegaId)

        const { data, error } = await query
        if (error) throw error
        return data || []
    },

    async getResumenStock(empresaId: string, bodegaId?: string) {
        if (bodegaId) {
            // Stock específico por bodega desde stock_bodega
            const { data, error } = await supabase
                .from('stock_bodega')
                .select('cantidad, costo_promedio, producto:productos(id,nombre,stock,maneja_stock)')
                .eq('empresa_id', empresaId)
                .eq('bodega_id', bodegaId)
                .order('producto_id')
            if (error) throw error
            return (data || []).map((r: any) => ({
                id:            r.producto?.id,
                nombre:        r.producto?.nombre,
                stock:         r.cantidad,
                costo_promedio: r.costo_promedio,
                maneja_stock:  r.producto?.maneja_stock,
            }))
        }
        // Sin filtro de bodega: stock agregado en productos
        const { data, error } = await supabase
            .from('productos')
            .select('id, nombre, stock, costo_promedio, maneja_stock')
            .eq('empresa_id', empresaId)
            .eq('maneja_stock', true)
            .order('nombre')
        if (error) throw error
        return data || []
    },

    async registrarMovimiento(movimiento: Partial<MovimientoKardex>) {
        // 1. Obtener producto
        const { data: producto, error: errorProd } = await supabase
            .from('productos')
            .select('stock, costo_promedio, maneja_stock')
            .eq('id', movimiento.producto_id)
            .single()
        if (errorProd) throw errorProd
        if (!producto.maneja_stock) return

        const bodegaId = movimiento.bodega_id

        // 2. Obtener stock actual de la bodega (si se especifica) o del producto
        let stockActual: number
        let costoActual: number

        if (bodegaId) {
            const { data: sb } = await supabase
                .from('stock_bodega')
                .select('cantidad, costo_promedio')
                .eq('bodega_id', bodegaId)
                .eq('producto_id', movimiento.producto_id)
                .maybeSingle()
            stockActual = Number(sb?.cantidad ?? 0)
            costoActual = Number(sb?.costo_promedio ?? producto.costo_promedio ?? 0)
        } else {
            stockActual = Number(producto.stock || 0)
            costoActual = Number(producto.costo_promedio || 0)
        }

        const cantidad      = Number(movimiento.cantidad || 0)
        const costoUnitario = Number(movimiento.costo_unitario || costoActual)
        const nuevaCantidad = movimiento.tipo_movimiento === 'ENTRADA'
            ? stockActual + cantidad
            : stockActual - cantidad

        // Costo promedio ponderado (solo en ENTRADA)
        let nuevoCostoPromedio = costoActual
        if (movimiento.tipo_movimiento === 'ENTRADA' && costoUnitario > 0) {
            nuevoCostoPromedio = (stockActual + cantidad) > 0
                ? ((stockActual * costoActual) + (cantidad * costoUnitario)) / (stockActual + cantidad)
                : costoUnitario
        }

        // 3. Insertar en kardex
        const { error: errorKardex } = await supabase
            .from('kardex')
            .insert({
                ...movimiento,
                fecha:               movimiento.fecha || new Date().toISOString(),
                costo_unitario:      costoUnitario,
                saldo_cantidad:      nuevaCantidad,
                saldo_costo_promedio: nuevoCostoPromedio,
            })
        if (errorKardex) throw errorKardex

        // 4a. Si tiene bodega: upsert en stock_bodega y actualiza productos.stock = SUM
        if (bodegaId) {
            await bodegaService.upsertStock(
                movimiento.empresa_id!,
                bodegaId,
                movimiento.producto_id!,
                nuevaCantidad,
                nuevoCostoPromedio,
            )
            // Recalcular stock global del producto
            const { data: totales } = await supabase
                .from('stock_bodega')
                .select('cantidad')
                .eq('producto_id', movimiento.producto_id)
            const totalStock = (totales ?? []).reduce((s: number, r: any) => s + Number(r.cantidad), 0)
            await supabase.from('productos')
                .update({ stock: totalStock, costo_promedio: nuevoCostoPromedio })
                .eq('id', movimiento.producto_id)
        } else {
            // 4b. Sin bodega: actualiza productos directamente (comportamiento legacy)
            const { error: errorUpdate } = await supabase
                .from('productos')
                .update({ stock: nuevaCantidad, costo_promedio: nuevoCostoPromedio })
                .eq('id', movimiento.producto_id)
            if (errorUpdate) throw errorUpdate
        }
    },

    async generarSalidaVenta(empresaId: string, pedidoId: string, items: any[], bodegaId?: string) {
        for (const item of items) {
            await this.registrarMovimiento({
                empresa_id:          empresaId,
                producto_id:         item.producto_id,
                bodega_id:           bodegaId,
                tipo_movimiento:     'SALIDA',
                motivo:              `Venta - Factura #${pedidoId.slice(0, 8)}`,
                documento_referencia: pedidoId,
                cantidad:            item.cantidad,
            })
        }
    },
}
