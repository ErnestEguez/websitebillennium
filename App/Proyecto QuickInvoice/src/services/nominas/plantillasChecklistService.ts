import { supabase } from '../../lib/supabase'
import type { PlantillaChecklist, PlantillaItem, TipoChecklist } from '../../types/nominas'

const nominas = () => supabase.schema('nominas')

export const plantillasChecklistService = {

    // ─── Plantillas ───────────────────────────────────────────────────────────

    async listar(empresaId: string): Promise<PlantillaChecklist[]> {
        const { data, error } = await nominas()
            .from('plantillas_checklist')
            .select('*, cargo:cargos(nombre), seccion:secciones(nombre), items_count:plantilla_items(count)')
            .eq('empresa_id', empresaId)
            .eq('activo', true)
            .order('tipo')
            .order('nombre')
        if (error) throw error
        return (data ?? []).map((p: any) => ({
            ...p,
            items_count: p.items_count?.[0]?.count ?? 0,
        })) as PlantillaChecklist[]
    },

    async crear(p: Omit<PlantillaChecklist, 'id' | 'created_at' | 'updated_at' | 'cargo' | 'seccion' | 'items' | 'items_count'>): Promise<PlantillaChecklist> {
        const { data, error } = await nominas()
            .from('plantillas_checklist')
            .insert(p)
            .select()
            .single()
        if (error) throw error
        return data as PlantillaChecklist
    },

    async actualizar(id: string, campos: Partial<Omit<PlantillaChecklist, 'cargo' | 'seccion' | 'items' | 'items_count'>>): Promise<PlantillaChecklist> {
        const { data, error } = await nominas()
            .from('plantillas_checklist')
            .update(campos)
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        return data as PlantillaChecklist
    },

    async desactivar(id: string): Promise<void> {
        const { error } = await nominas()
            .from('plantillas_checklist')
            .update({ activo: false })
            .eq('id', id)
        if (error) throw error
    },

    // ─── Ítems de plantilla ───────────────────────────────────────────────────

    async listarItems(plantillaId: string): Promise<PlantillaItem[]> {
        const { data, error } = await nominas()
            .from('plantilla_items')
            .select('*')
            .eq('plantilla_id', plantillaId)
            .eq('activo', true)
            .order('orden')
        if (error) throw error
        return (data ?? []) as PlantillaItem[]
    },

    async crearItem(item: Omit<PlantillaItem, 'id' | 'created_at'>): Promise<PlantillaItem> {
        const { data, error } = await nominas()
            .from('plantilla_items')
            .insert(item)
            .select()
            .single()
        if (error) throw error
        return data as PlantillaItem
    },

    async actualizarItem(id: string, campos: Partial<PlantillaItem>): Promise<PlantillaItem> {
        const { data, error } = await nominas()
            .from('plantilla_items')
            .update(campos)
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        return data as PlantillaItem
    },

    async eliminarItem(id: string): Promise<void> {
        const { error } = await nominas()
            .from('plantilla_items')
            .delete()
            .eq('id', id)
        if (error) throw error
    },

    // Reordenar: actualiza el campo 'orden' de cada item en batch
    async reordenar(items: { id: string; orden: number }[]): Promise<void> {
        await Promise.all(items.map(({ id, orden }) =>
            nominas().from('plantilla_items').update({ orden }).eq('id', id)
        ))
    },

    // Para el selector de plantillas al crear un checklist
    async listarPorTipo(empresaId: string, tipo: TipoChecklist): Promise<PlantillaChecklist[]> {
        const { data, error } = await nominas()
            .from('plantillas_checklist')
            .select('*, items_count:plantilla_items(count)')
            .eq('empresa_id', empresaId)
            .eq('tipo', tipo)
            .eq('activo', true)
            .order('nombre')
        if (error) throw error
        return (data ?? []).map((p: any) => ({
            ...p,
            items_count: p.items_count?.[0]?.count ?? 0,
        })) as PlantillaChecklist[]
    },
}
