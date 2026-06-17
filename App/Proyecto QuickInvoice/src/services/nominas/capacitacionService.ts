import { supabase } from '../../lib/supabase'
import type { Curso, InscripcionCurso, EstadoInscripcion } from '../../types/nominas'

const nominas = () => supabase.schema('nominas')

export const capacitacionService = {

    // ─── Cursos ───────────────────────────────────────────────────────────────

    async listarCursos(empresaId: string): Promise<Curso[]> {
        const { data, error } = await nominas()
            .from('cursos')
            .select('*, inscripciones_count:inscripciones_curso(count)')
            .eq('empresa_id', empresaId)
            .eq('activo', true)
            .order('fecha_inicio', { ascending: false })
        if (error) throw error
        return ((data ?? []) as any[]).map((c: any) => ({
            ...c,
            inscripciones_count: c.inscripciones_count?.[0]?.count ?? 0,
        })) as Curso[]
    },

    async crearCurso(c: Omit<Curso, 'id' | 'created_at' | 'updated_at' | 'inscripciones_count'>): Promise<Curso> {
        const { data, error } = await nominas()
            .from('cursos')
            .insert(c)
            .select()
            .single()
        if (error) throw error
        return data as Curso
    },

    async actualizarCurso(id: string, campos: Partial<Omit<Curso, 'inscripciones_count'>>): Promise<Curso> {
        const { data, error } = await nominas()
            .from('cursos')
            .update(campos)
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        return data as Curso
    },

    async desactivarCurso(id: string): Promise<void> {
        const { error } = await nominas()
            .from('cursos')
            .update({ activo: false })
            .eq('id', id)
        if (error) throw error
    },

    // ─── Inscripciones ────────────────────────────────────────────────────────

    async listarPorCurso(cursoId: string): Promise<InscripcionCurso[]> {
        const { data, error } = await nominas()
            .from('inscripciones_curso')
            .select('*, empleado:empleados(nombres, apellidos, cargo:cargos(nombre))')
            .eq('curso_id', cursoId)
            .order('created_at')
        if (error) throw error
        return (data ?? []) as InscripcionCurso[]
    },

    async listarPorEmpleado(empleadoId: string): Promise<InscripcionCurso[]> {
        const { data, error } = await nominas()
            .from('inscripciones_curso')
            .select('*, curso:cursos(nombre, horas, fecha_inicio, fecha_fin)')
            .eq('empleado_id', empleadoId)
            .order('created_at', { ascending: false })
        if (error) throw error
        return (data ?? []) as InscripcionCurso[]
    },

    async crearInscripcion(i: Omit<InscripcionCurso, 'id' | 'created_at' | 'updated_at' | 'empleado' | 'curso'>): Promise<InscripcionCurso> {
        const { data, error } = await nominas()
            .from('inscripciones_curso')
            .insert(i)
            .select()
            .single()
        if (error) throw error
        return data as InscripcionCurso
    },

    async actualizarInscripcion(id: string, campos: Partial<Omit<InscripcionCurso, 'empleado' | 'curso'>>): Promise<InscripcionCurso> {
        const { data, error } = await nominas()
            .from('inscripciones_curso')
            .update(campos)
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        return data as InscripcionCurso
    },

    async cambiarEstado(id: string, estado: EstadoInscripcion): Promise<void> {
        const { error } = await nominas()
            .from('inscripciones_curso')
            .update({ estado })
            .eq('id', id)
        if (error) throw error
    },

    async eliminarInscripcion(id: string): Promise<void> {
        const { error } = await nominas()
            .from('inscripciones_curso')
            .delete()
            .eq('id', id)
        if (error) throw error
    },

    // ─── Dashboard helpers ────────────────────────────────────────────────────

    async horasPromedioEmpleado(empresaId: string): Promise<number> {
        const { data, error } = await nominas()
            .from('inscripciones_curso')
            .select('curso:cursos(horas), empleado_id')
            .eq('empresa_id', empresaId)
            .in('estado', ['asistio', 'aprobado'])
        if (error) throw error
        if (!data || data.length === 0) return 0
        const porEmpleado: Record<string, number> = {}
        for (const row of data as any[]) {
            const horas = row.curso?.horas ?? 0
            porEmpleado[row.empleado_id] = (porEmpleado[row.empleado_id] ?? 0) + horas
        }
        const vals = Object.values(porEmpleado)
        return vals.length > 0 ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0
    },
}
