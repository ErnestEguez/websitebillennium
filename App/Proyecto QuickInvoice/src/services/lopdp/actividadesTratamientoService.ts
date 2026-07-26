import { supabase } from '../../lib/supabase'
import type { ActividadTratamiento } from '../../types/lopdp'

const lopdp = () => supabase.schema('lopdp')

type CamposCreables = Omit<ActividadTratamiento,
    'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by' | 'activo'>

type CamposEditables = Partial<Omit<ActividadTratamiento,
    'id' | 'empresa_id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'>>

export const actividadesTratamientoService = {

    async listar(empresaId: string): Promise<ActividadTratamiento[]> {
        const { data, error } = await lopdp()
            .from('actividades_tratamiento')
            .select('*')
            .eq('empresa_id', empresaId)
            .eq('activo', true)
            .order('nombre')
        if (error) throw error
        return data as ActividadTratamiento[]
    },

    async crear(actividad: CamposCreables, userId: string): Promise<ActividadTratamiento> {
        const { data, error } = await lopdp()
            .from('actividades_tratamiento')
            .insert({ ...actividad, created_by: userId, updated_by: userId })
            .select()
            .single()
        if (error) throw error
        return data as ActividadTratamiento
    },

    async actualizar(id: string, campos: CamposEditables, userId: string): Promise<ActividadTratamiento> {
        const { data, error } = await lopdp()
            .from('actividades_tratamiento')
            .update({ ...campos, updated_by: userId })
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        return data as ActividadTratamiento
    },

    // Soft-delete: el RAT nunca se borra físicamente (evidencia de cumplimiento)
    async archivar(id: string, userId: string): Promise<void> {
        const { error } = await lopdp()
            .from('actividades_tratamiento')
            .update({ activo: false, updated_by: userId })
            .eq('id', id)
        if (error) throw error
    },
}
