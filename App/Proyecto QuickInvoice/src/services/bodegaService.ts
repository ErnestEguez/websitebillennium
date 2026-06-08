import { supabase } from '../lib/supabase'
import type { Bodega, StockBodega } from '../types/vendors'

export const bodegaService = {

    async listar(empresaId: string): Promise<Bodega[]> {
        const { data, error } = await supabase
            .from('bodegas')
            .select('*')
            .eq('empresa_id', empresaId)
            .eq('activo', true)
            .order('es_principal', { ascending: false })
            .order('nombre')
        if (error) throw error
        return data as Bodega[]
    },

    async listarTodas(empresaId: string): Promise<Bodega[]> {
        const { data, error } = await supabase
            .from('bodegas')
            .select('*')
            .eq('empresa_id', empresaId)
            .order('es_principal', { ascending: false })
            .order('nombre')
        if (error) throw error
        return data as Bodega[]
    },

    async obtener(id: string): Promise<Bodega> {
        const { data, error } = await supabase
            .from('bodegas')
            .select('*')
            .eq('id', id)
            .single()
        if (error) throw error
        return data as Bodega
    },

    async getPrincipal(empresaId: string): Promise<Bodega | null> {
        const { data } = await supabase
            .from('bodegas')
            .select('*')
            .eq('empresa_id', empresaId)
            .eq('es_principal', true)
            .eq('activo', true)
            .maybeSingle()
        return (data as Bodega) ?? null
    },

    async crear(bodega: Omit<Bodega, 'id' | 'created_at' | 'updated_at'>): Promise<Bodega> {
        const { data, error } = await supabase
            .from('bodegas')
            .insert(bodega)
            .select()
            .single()
        if (error) throw error
        return data as Bodega
    },

    async actualizar(id: string, campos: Partial<Bodega>): Promise<Bodega> {
        const { data, error } = await supabase
            .from('bodegas')
            .update(campos)
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        return data as Bodega
    },

    async desactivar(id: string): Promise<void> {
        const { error } = await supabase
            .from('bodegas')
            .update({ activo: false })
            .eq('id', id)
        if (error) throw error
    },

    // ── Stock ─────────────────────────────────────────────────

    async getStock(empresaId: string, bodegaId?: string): Promise<StockBodega[]> {
        let q = supabase
            .from('stock_bodega')
            .select(`
                *,
                bodega:bodegas(nombre, codigo),
                producto:productos(nombre, codigo)
            `)
            .eq('empresa_id', empresaId)
            .gt('cantidad', 0)

        if (bodegaId) q = q.eq('bodega_id', bodegaId)

        const { data, error } = await q.order('producto_id')
        if (error) throw error
        return data as StockBodega[]
    },

    async getStockProducto(productoId: string, bodegaId?: string): Promise<StockBodega[]> {
        let q = supabase
            .from('stock_bodega')
            .select(`*, bodega:bodegas(nombre, codigo)`)
            .eq('producto_id', productoId)

        if (bodegaId) q = q.eq('bodega_id', bodegaId)

        const { data, error } = await q
        if (error) throw error
        return data as StockBodega[]
    },

    // Upsert stock tras movimiento kardex (llamado desde kardexService)
    async upsertStock(
        empresaId: string,
        bodegaId: string,
        productoId: string,
        cantidad: number,
        costoPromedio: number,
    ): Promise<void> {
        const { error } = await supabase
            .from('stock_bodega')
            .upsert(
                { empresa_id: empresaId, bodega_id: bodegaId, producto_id: productoId, cantidad, costo_promedio: costoPromedio },
                { onConflict: 'bodega_id,producto_id' }
            )
        if (error) throw error
    },
}
