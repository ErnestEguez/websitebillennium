import { supabase } from '../../lib/supabase'
import type { EmpleadoHijo, EmpleadoEstudio } from '../../types/nominas'

const nominas = () => supabase.schema('nominas')

export const hijosEmpleadoService = {

    async listar(empleadoId: string): Promise<EmpleadoHijo[]> {
        const { data, error } = await nominas()
            .from('empleados_hijos')
            .select('*')
            .eq('empleado_id', empleadoId)
            .order('fecha_nacimiento', { ascending: true })
        if (error) throw error
        return (data ?? []) as EmpleadoHijo[]
    },

    async crear(h: Omit<EmpleadoHijo, 'id' | 'created_at'>): Promise<EmpleadoHijo> {
        const { data, error } = await nominas()
            .from('empleados_hijos')
            .insert(h)
            .select()
            .single()
        if (error) throw error
        return data as EmpleadoHijo
    },

    async eliminar(id: string): Promise<void> {
        const { error } = await nominas()
            .from('empleados_hijos')
            .delete()
            .eq('id', id)
        if (error) throw error
    },
}

export const estudiosEmpleadoService = {

    async listar(empleadoId: string): Promise<EmpleadoEstudio[]> {
        const { data, error } = await nominas()
            .from('empleados_estudios')
            .select('*')
            .eq('empleado_id', empleadoId)
            .order('created_at', { ascending: true })
        if (error) throw error
        return (data ?? []) as EmpleadoEstudio[]
    },

    async crear(e: Omit<EmpleadoEstudio, 'id' | 'created_at'>): Promise<EmpleadoEstudio> {
        const { data, error } = await nominas()
            .from('empleados_estudios')
            .insert(e)
            .select()
            .single()
        if (error) throw error
        return data as EmpleadoEstudio
    },

    async eliminar(id: string): Promise<void> {
        const { error } = await nominas()
            .from('empleados_estudios')
            .delete()
            .eq('id', id)
        if (error) throw error
    },
}
