import { supabase } from '../lib/supabase'

export interface PrecioVolumen {
    id: string
    id_empresa: string
    codigoitem: string
    desde: number
    hasta: number
    precio: number
    status: boolean
    created_at: string
    updated_at: string
}

export interface NuevoPrecioVolumen {
    id_empresa: string
    codigoitem: string
    desde: number
    hasta: number
    precio: number
}

export const precioVolumenService = {

    async getByProducto(empresaId: string, productoId: string): Promise<PrecioVolumen[]> {
        const { data, error } = await supabase
            .from('preciovolumen')
            .select('*')
            .eq('id_empresa', empresaId)
            .eq('codigoitem', productoId)
            .order('desde', { ascending: true })
        if (error) throw error
        return data ?? []
    },

    async crear(input: NuevoPrecioVolumen): Promise<PrecioVolumen> {
        const { data, error } = await supabase
            .from('preciovolumen')
            .insert({ ...input, status: true })
            .select()
            .single()
        if (error) throw error
        return data
    },

    async toggleStatus(id: string, status: boolean): Promise<void> {
        const { error } = await supabase
            .from('preciovolumen')
            .update({ status })
            .eq('id', id)
        if (error) throw error
    },

    /** Retorna el precio por volumen activo para una cantidad dada,
     *  o null si no existe rango aplicable (usar precio de lista). */
    async resolverPrecio(
        empresaId: string,
        productoId: string,
        cantidad: number
    ): Promise<number | null> {
        const { data, error } = await supabase
            .from('preciovolumen')
            .select('precio')
            .eq('id_empresa', empresaId)
            .eq('codigoitem', productoId)
            .eq('status', true)
            .lte('desde', cantidad)
            .gte('hasta', cantidad)
            .order('desde', { ascending: false })
            .limit(1)
            .maybeSingle()
        if (error) throw error
        return data ? Number(data.precio) : null
    },
}
