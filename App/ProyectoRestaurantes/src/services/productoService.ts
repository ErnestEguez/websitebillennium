import { supabase } from '../lib/supabase'

export interface Producto {
    id: string
    nombre: string
    descripcion: string | null
    precio_venta: number
    categoria_id: string
    imagen_url: string | null
    iva_porcentaje: number
    maneja_stock?: boolean
    stock?: number
}

export interface Categoria {
    id: string
    nombre: string
    tipo?: 'ALIMENTO' | 'BEBIDA'
}

export const productoService = {
    async getProductos() {
        const { data, error } = await supabase
            .from('productos')
            .select('*, categorias(nombre)')
            .eq('activo', true)

        if (error) throw error
        return data
    },

    async getCategorias() {
        const { data, error } = await supabase
            .from('categorias')
            .select('*')
            .order('nombre', { ascending: true })

        if (error) throw error
        return data as Categoria[]
    },

    async createProducto(producto: Partial<Producto>) {
        const { data, error } = await supabase
            .from('productos')
            .insert(producto)
            .select()
            .single()

        if (error) throw error
        return data as Producto
    },

    async updateProducto(id: string, updates: Partial<Producto>) {
        const { data, error } = await supabase
            .from('productos')
            .update(updates)
            .eq('id', id)
            .select()
            .single()

        if (error) throw error
        return data as Producto
    },

    async deleteProducto(id: string) {
        const { error } = await supabase
            .from('productos')
            .update({ activo: false })
            .eq('id', id)

        if (error) throw error
        return true
    }
}
