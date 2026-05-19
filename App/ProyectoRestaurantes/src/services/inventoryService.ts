import { supabase } from '../lib/supabase'

export interface InventoryItem {
    id: string
    producto_id: string
    nombre: string
    stock_actual: number
    stock_minimo: number
    categoria: string
}

export interface KardexMovement {
    id: string
    fecha: string
    tipo_movimiento: 'COMPRA' | 'VENTA' | 'AJUSTE' | 'DEVOLUCION'
    cantidad: number
    costo_unitario: number
    referencia: string
    producto_id: string
    producto_nombre: string
}

export const inventoryService = {
    async getInventory() {
        // Query 'productos' directly since 'inventarios' table does not exist in current schema
        const { data, error } = await supabase
            .from('productos')
            .select(`
                id,
                nombre,
                stock,
                stock_minimo,
                categoria_id,
                categorias (nombre)
            `)
            .eq('maneja_stock', true)
            .order('nombre')

        if (error) throw error

        return data.map((item: any) => ({
            id: item.id, // Inventory ID is Product ID in this schema
            producto_id: item.id,
            nombre: item.nombre,
            stock_actual: item.stock || 0,
            stock_minimo: item.stock_minimo || 0,
            categoria: item.categorias?.nombre || 'General'
        })) as InventoryItem[]
    },

    async getKardex(productoId?: string) {
        let query = supabase
            .from('kardex')
            .select(`
        *,
        productos (nombre)
      `)
            .order('fecha', { ascending: false })

        if (productoId) {
            query = query.eq('producto_id', productoId)
        }

        const { data, error } = await query

        if (error) throw error

        return data.map((item: any) => ({
            ...item,
            producto_nombre: item.productos?.nombre
        })) as KardexMovement[]
    }
}
