import { supabase } from '../lib/supabase'

export interface MovimientoKardex {
    id: string
    empresa_id: string
    producto_id: string
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
}

export const kardexService = {
    async getKardexByProducto(
        productoId: string,
        fechaInicio?: string,
        fechaFin?: string
    ): Promise<KardexConProducto[]> {
        let query = supabase
            .from('kardex')
            .select(`
                *,
                producto:productos(nombre)
            `)
            .eq('producto_id', productoId)
            .order('fecha', { ascending: true })

        if (fechaInicio) {
            query = query.gte('fecha', fechaInicio)
        }
        if (fechaFin) {
            query = query.lte('fecha', `${fechaFin}T23:59:59.999Z`)
        }

        const { data, error } = await query

        if (error) throw error
        return data || []
    },

    async getKardexByEmpresa(
        empresaId: string,
        fechaInicio?: string,
        fechaFin?: string
    ): Promise<KardexConProducto[]> {
        let query = supabase
            .from('kardex')
            .select(`
                *,
                producto:productos(nombre)
            `)
            .eq('empresa_id', empresaId)
            .order('fecha', { ascending: false })

        if (fechaInicio) {
            query = query.gte('fecha', fechaInicio)
        }
        if (fechaFin) {
            query = query.lte('fecha', `${fechaFin}T23:59:59.999Z`)
        }

        const { data, error } = await query

        if (error) throw error
        return data || []
    },

    async getResumenStock(empresaId: string) {
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
        // 1. Obtener producto actual para calcular saldo
        const { data: producto, error: errorProd } = await supabase
            .from('productos')
            .select('stock, costo_promedio, maneja_stock')
            .eq('id', movimiento.producto_id)
            .single()

        if (errorProd) throw errorProd
        if (!producto.maneja_stock) return // No registrar si no maneja stock

        const nuevaCantidad = movimiento.tipo_movimiento === 'ENTRADA'
            ? (producto.stock || 0) + (movimiento.cantidad || 0)
            : (producto.stock || 0) - (movimiento.cantidad || 0)

        // 2. Insertar en Kardex
        const { error: errorKardex } = await supabase
            .from('kardex')
            .insert({
                ...movimiento,
                fecha: movimiento.fecha || new Date().toISOString(),
                saldo_cantidad: nuevaCantidad,
                saldo_costo_promedio: producto.costo_promedio
            })

        if (errorKardex) throw errorKardex

        // 3. Actualizar stock en productos
        const { error: errorUpdate } = await supabase
            .from('productos')
            .update({ stock: nuevaCantidad })
            .eq('id', movimiento.producto_id)

        if (errorUpdate) throw errorUpdate
    },

    async generarSalidaVenta(empresaId: string, pedidoId: string, items: any[]) {
        for (const item of items) {
            await this.registrarMovimiento({
                empresa_id: empresaId,
                producto_id: item.producto_id,
                tipo_movimiento: 'SALIDA',
                motivo: `Venta - Pedido #${pedidoId.slice(0, 8)}`,
                documento_referencia: pedidoId,
                cantidad: item.cantidad
            })
        }
    }
}
