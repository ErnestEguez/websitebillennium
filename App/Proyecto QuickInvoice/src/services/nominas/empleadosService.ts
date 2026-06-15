import { supabase } from '../../lib/supabase'
import type { Empleado } from '../../types/nominas'

const nominas = () => supabase.schema('nominas')

const SELECT_CON_JOINS = '*, seccion:secciones(nombre), cargo:cargos(nombre), jefe:empleados!jefe_inmediato_id(nombres, apellidos)'

export const empleadosService = {

    async listarEmpleados(empresaId: string): Promise<Empleado[]> {
        const { data, error } = await nominas()
            .from('empleados')
            .select(SELECT_CON_JOINS)
            .eq('empresa_id', empresaId)
            .eq('activo', true)
            .order('apellidos')
        if (error) throw error
        return data as unknown as Empleado[]
    },

    async listarEmpleadosTodos(empresaId: string): Promise<Empleado[]> {
        const { data, error } = await nominas()
            .from('empleados')
            .select(SELECT_CON_JOINS)
            .eq('empresa_id', empresaId)
            .order('apellidos')
        if (error) throw error
        return data as unknown as Empleado[]
    },

    async crearEmpleado(empleado: Omit<Empleado, 'id' | 'created_at' | 'updated_at' | 'activo' | 'seccion' | 'cargo' | 'jefe'>): Promise<Empleado> {
        const { data, error } = await nominas()
            .from('empleados')
            .insert(empleado)
            .select()
            .single()
        if (error) throw error
        return data as Empleado
    },

    async actualizarEmpleado(id: string, campos: Partial<Omit<Empleado, 'seccion' | 'cargo' | 'jefe'>>): Promise<Empleado> {
        const { data, error } = await nominas()
            .from('empleados')
            .update(campos)
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        return data as Empleado
    },

    async desactivarEmpleado(id: string): Promise<void> {
        const { error } = await nominas()
            .from('empleados')
            .update({ activo: false })
            .eq('id', id)
        if (error) throw error
    },
}
