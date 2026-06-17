import { supabase } from '../../lib/supabase'
import type { PeriodoEvaluacion, Evaluacion, EstadoPeriodoEval, CriterioEvaluacion } from '../../types/nominas'

const nominas = () => supabase.schema('nominas')

export const evaluacionDesempenoService = {

    // ─── Períodos ─────────────────────────────────────────────────────────────

    async listarPeriodos(empresaId: string): Promise<PeriodoEvaluacion[]> {
        const { data, error } = await nominas()
            .from('periodos_evaluacion')
            .select('*, evaluaciones_count:evaluaciones(count)')
            .eq('empresa_id', empresaId)
            .order('fecha_inicio', { ascending: false })
        if (error) throw error
        return ((data ?? []) as any[]).map((p: any) => ({
            ...p,
            evaluaciones_count: p.evaluaciones_count?.[0]?.count ?? 0,
        })) as PeriodoEvaluacion[]
    },

    async crearPeriodo(p: Omit<PeriodoEvaluacion, 'id' | 'created_at' | 'updated_at' | 'evaluaciones_count'>): Promise<PeriodoEvaluacion> {
        const { data, error } = await nominas()
            .from('periodos_evaluacion')
            .insert(p)
            .select()
            .single()
        if (error) throw error
        return data as PeriodoEvaluacion
    },

    async actualizarPeriodo(id: string, campos: Partial<PeriodoEvaluacion>): Promise<PeriodoEvaluacion> {
        const { data, error } = await nominas()
            .from('periodos_evaluacion')
            .update(campos)
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        return data as PeriodoEvaluacion
    },

    async cambiarEstadoPeriodo(id: string, estado: EstadoPeriodoEval): Promise<void> {
        const { error } = await nominas()
            .from('periodos_evaluacion')
            .update({ estado })
            .eq('id', id)
        if (error) throw error
    },

    async eliminarPeriodo(id: string): Promise<void> {
        const { error } = await nominas()
            .from('periodos_evaluacion')
            .delete()
            .eq('id', id)
        if (error) throw error
    },

    // ─── Evaluaciones ─────────────────────────────────────────────────────────

    async listarPorPeriodo(periodoId: string): Promise<Evaluacion[]> {
        const { data, error } = await nominas()
            .from('evaluaciones')
            .select('*, empleado:empleados(nombres, apellidos, cargo:cargos(nombre))')
            .eq('periodo_id', periodoId)
            .order('created_at')
        if (error) throw error
        return ((data ?? []) as any[]).map((e: any) => ({
            ...e,
            criterios: e.criterios ?? [],
        })) as Evaluacion[]
    },

    async listarPorEmpleado(empleadoId: string): Promise<Evaluacion[]> {
        const { data, error } = await nominas()
            .from('evaluaciones')
            .select('*, periodo:periodos_evaluacion(nombre, fecha_inicio, fecha_fin)')
            .eq('empleado_id', empleadoId)
            .order('created_at', { ascending: false })
        if (error) throw error
        return ((data ?? []) as any[]).map((e: any) => ({
            ...e,
            criterios: e.criterios ?? [],
        })) as Evaluacion[]
    },

    async crear(e: Omit<Evaluacion, 'id' | 'created_at' | 'updated_at' | 'empleado'>): Promise<Evaluacion> {
        const { data, error } = await nominas()
            .from('evaluaciones')
            .insert(e)
            .select()
            .single()
        if (error) throw error
        return { ...(data as any), criterios: (data as any).criterios ?? [] } as Evaluacion
    },

    async actualizar(id: string, campos: Partial<Omit<Evaluacion, 'empleado'>>): Promise<Evaluacion> {
        const { data, error } = await nominas()
            .from('evaluaciones')
            .update(campos)
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        return { ...(data as any), criterios: (data as any).criterios ?? [] } as Evaluacion
    },

    async guardarCriterios(id: string, criterios: CriterioEvaluacion[]): Promise<void> {
        const calificacion_final = criterios.length > 0
            ? Math.round((criterios.reduce((s, c) => s + c.calificacion, 0) / criterios.length) * 10) / 10
            : null
        const { error } = await nominas()
            .from('evaluaciones')
            .update({ criterios, calificacion_final, estado: 'completado' })
            .eq('id', id)
        if (error) throw error
    },

    async eliminar(id: string): Promise<void> {
        const { error } = await nominas()
            .from('evaluaciones')
            .delete()
            .eq('id', id)
        if (error) throw error
    },

    // ─── Dashboard helpers ────────────────────────────────────────────────────

    async distribucionDesempeno(empresaId: string): Promise<{ alto: number; medio: number; bajo: number; total: number }> {
        const { data, error } = await nominas()
            .from('evaluaciones')
            .select('calificacion_final')
            .eq('empresa_id', empresaId)
            .eq('estado', 'completado')
            .not('calificacion_final', 'is', null)
        if (error) throw error
        const vals = (data ?? []).map((e: any) => e.calificacion_final as number)
        const total = vals.length
        const alto  = vals.filter(v => v >= 4).length
        const medio = vals.filter(v => v >= 2.5 && v < 4).length
        const bajo  = vals.filter(v => v < 2.5).length
        return { alto, medio, bajo, total }
    },
}
