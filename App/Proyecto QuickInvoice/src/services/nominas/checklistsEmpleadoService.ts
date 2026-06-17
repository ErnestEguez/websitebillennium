import { supabase } from '../../lib/supabase'
import type { ChecklistEmpleado, ChecklistItemEmpleado, EstadoChecklist, TipoChecklist } from '../../types/nominas'
import { plantillasChecklistService } from './plantillasChecklistService'

const nominas = () => supabase.schema('nominas')

export const checklistsEmpleadoService = {

    // ─── Checklists ───────────────────────────────────────────────────────────

    async listar(empresaId: string, tipo?: TipoChecklist): Promise<ChecklistEmpleado[]> {
        let q = nominas()
            .from('checklists_empleado')
            .select(`
                *,
                empleado:empleados(nombres, apellidos, cargo:cargos(nombre)),
                items_count:checklist_items_empleado(count)
            `)
            .eq('empresa_id', empresaId)
            .order('created_at', { ascending: false })

        if (tipo) q = q.eq('tipo', tipo) as any

        const { data, error } = await (q as any)
        if (error) throw error

        return ((data ?? []) as any[]).map((c: any) => ({
            ...c,
            items_count: c.items_count?.[0]?.count ?? 0,
        })) as ChecklistEmpleado[]
    },

    async listarPorEmpleado(empleadoId: string): Promise<ChecklistEmpleado[]> {
        const { data, error } = await nominas()
            .from('checklists_empleado')
            .select('*, items_count:checklist_items_empleado(count)')
            .eq('empleado_id', empleadoId)
            .order('created_at', { ascending: false })
        if (error) throw error
        return (data ?? []).map((c: any) => ({
            ...c,
            items_count: c.items_count?.[0]?.count ?? 0,
        })) as ChecklistEmpleado[]
    },

    // Crea el checklist copiando los ítems de la plantilla (snapshot)
    async crearDesdeTemplate(
        empresaId: string,
        empleadoId: string,
        plantillaId: string,
        tipo: TipoChecklist,
        fechaInicio: string,
        fechaLimite?: string | null
    ): Promise<ChecklistEmpleado> {
        // 1. Crear el checklist
        const { data: ck, error: eck } = await nominas()
            .from('checklists_empleado')
            .insert({
                empresa_id: empresaId,
                empleado_id: empleadoId,
                plantilla_id: plantillaId,
                tipo,
                estado: 'pendiente',
                fecha_inicio: fechaInicio,
                fecha_limite: fechaLimite ?? null,
            })
            .select()
            .single()
        if (eck) throw eck

        // 2. Cargar ítems de la plantilla y copiarlos como snapshot
        const items = await plantillasChecklistService.listarItems(plantillaId)
        if (items.length > 0) {
            const snapshots = items.map(i => ({
                empresa_id: empresaId,
                checklist_id: ck.id,
                orden: i.orden,
                descripcion: i.descripcion,
                responsable_tipo: i.responsable_tipo,
                dias_plazo: i.dias_plazo ?? null,
                completado: false,
            }))
            const { error: ei } = await nominas()
                .from('checklist_items_empleado')
                .insert(snapshots)
            if (ei) throw ei
        }

        return ck as ChecklistEmpleado
    },

    // Crear checklist en blanco (sin plantilla)
    async crearVacio(
        empresaId: string,
        empleadoId: string,
        tipo: TipoChecklist,
        fechaInicio: string,
        fechaLimite?: string | null
    ): Promise<ChecklistEmpleado> {
        const { data, error } = await nominas()
            .from('checklists_empleado')
            .insert({ empresa_id: empresaId, empleado_id: empleadoId, tipo, estado: 'pendiente', fecha_inicio: fechaInicio, fecha_limite: fechaLimite ?? null })
            .select()
            .single()
        if (error) throw error
        return data as ChecklistEmpleado
    },

    async cambiarEstado(id: string, estado: EstadoChecklist): Promise<void> {
        const { error } = await nominas()
            .from('checklists_empleado')
            .update({ estado })
            .eq('id', id)
        if (error) throw error
    },

    async eliminar(id: string): Promise<void> {
        const { error } = await nominas()
            .from('checklists_empleado')
            .delete()
            .eq('id', id)
        if (error) throw error
    },

    // ─── Ítems ────────────────────────────────────────────────────────────────

    async listarItems(checklistId: string): Promise<ChecklistItemEmpleado[]> {
        const { data, error } = await nominas()
            .from('checklist_items_empleado')
            .select('*')
            .eq('checklist_id', checklistId)
            .order('orden')
        if (error) throw error
        return (data ?? []) as ChecklistItemEmpleado[]
    },

    async agregarItem(item: Omit<ChecklistItemEmpleado, 'id' | 'created_at' | 'updated_at'>): Promise<ChecklistItemEmpleado> {
        const { data, error } = await nominas()
            .from('checklist_items_empleado')
            .insert(item)
            .select()
            .single()
        if (error) throw error
        return data as ChecklistItemEmpleado
    },

    async marcarCompletado(id: string, completado: boolean, completadoPor?: string, notas?: string): Promise<void> {
        const { error } = await nominas()
            .from('checklist_items_empleado')
            .update({
                completado,
                fecha_completado: completado ? new Date().toISOString().slice(0, 10) : null,
                completado_por: completado ? (completadoPor ?? null) : null,
                notas: notas ?? null,
            })
            .eq('id', id)
        if (error) throw error
    },

    async eliminarItem(id: string): Promise<void> {
        const { error } = await nominas()
            .from('checklist_items_empleado')
            .delete()
            .eq('id', id)
        if (error) throw error
    },

    // Recalcula el estado del checklist según items completados
    async sincronizarEstado(checklistId: string): Promise<EstadoChecklist> {
        const { data, error } = await nominas()
            .from('checklist_items_empleado')
            .select('completado')
            .eq('checklist_id', checklistId)
        if (error) throw error
        const items = data ?? []
        if (items.length === 0) return 'pendiente'
        const total = items.length
        const completos = items.filter((i: any) => i.completado).length
        const estado: EstadoChecklist = completos === 0 ? 'pendiente' : completos < total ? 'en_progreso' : 'completado'
        await nominas().from('checklists_empleado').update({ estado }).eq('id', checklistId)
        return estado
    },
}
