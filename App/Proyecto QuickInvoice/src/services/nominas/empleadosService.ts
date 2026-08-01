import { supabase } from '../../lib/supabase'
import type { Empleado } from '../../types/nominas'
import { auditService } from '../auditoria/auditService'

const nominas = () => supabase.schema('nominas')

const SELECT_CON_JOINS = '*, seccion:secciones(nombre), cargo:cargos(nombre), jefe:empleados!jefe_inmediato_id(nombres, apellidos)'

// Campos sensibles: si cambian, se guarda un diff antes/después en el evento de auditoría.
const CAMPOS_SENSIBLES = ['sueldo_base', 'banco', 'tipo_cuenta', 'numero_cuenta', 'cedula'] as const

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

        auditService.logEvent({
            empresaId: empleado.empresa_id,
            modulo: 'talento_humano',
            accion: 'crear',
            entidad: 'empleado',
            entidadId: (data as any).id,
            resumen: `Alta de empleado — ${empleado.nombres} ${empleado.apellidos}`,
            nivel: 'sensible',
        })
        return data as Empleado
    },

    async actualizarEmpleado(id: string, campos: Partial<Omit<Empleado, 'seccion' | 'cargo' | 'jefe'>>): Promise<Empleado> {
        const camposSensiblesTocados = CAMPOS_SENSIBLES.filter(c => c in campos)
        const { data: antes } = camposSensiblesTocados.length > 0
            ? await nominas().from('empleados').select(['empresa_id', 'nombres', 'apellidos', ...camposSensiblesTocados].join(',')).eq('id', id).single()
            : { data: null as any }

        const { data, error } = await nominas()
            .from('empleados')
            .update(campos)
            .eq('id', id)
            .select()
            .single()
        if (error) throw error

        const cambios: Record<string, { antes: unknown; despues: unknown }> = {}
        for (const c of camposSensiblesTocados) {
            if (antes && antes[c] !== (campos as any)[c]) {
                cambios[c] = { antes: antes[c], despues: (campos as any)[c] }
            }
        }

        auditService.logEvent({
            empresaId: (data as any).empresa_id,
            modulo: 'talento_humano',
            accion: 'actualizar',
            entidad: 'empleado',
            entidadId: id,
            resumen: `Actualización de empleado — ${(data as any).nombres} ${(data as any).apellidos}`,
            cambios: Object.keys(cambios).length > 0 ? cambios : undefined,
            nivel: Object.keys(cambios).length > 0 ? 'sensible' : 'operativo',
        })
        return data as Empleado
    },

    async desactivarEmpleado(id: string): Promise<void> {
        const { data: antes } = await nominas().from('empleados').select('empresa_id, nombres, apellidos').eq('id', id).single()

        const { error } = await nominas()
            .from('empleados')
            .update({ activo: false })
            .eq('id', id)
        if (error) throw error

        if (antes) {
            auditService.logEvent({
                empresaId: (antes as any).empresa_id,
                modulo: 'talento_humano',
                accion: 'eliminar',
                entidad: 'empleado',
                entidadId: id,
                resumen: `Baja de empleado — ${(antes as any).nombres} ${(antes as any).apellidos}`,
                nivel: 'sensible',
            })
        }
    },
}
