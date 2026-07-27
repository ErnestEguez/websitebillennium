import { supabase } from '../../lib/supabase'
import type { EncargadoTratamiento } from '../../types/lopdp'

const lopdp = () => supabase.schema('lopdp')

type CamposCreables = Omit<EncargadoTratamiento,
    'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by' | 'activo' | 'destruccion_confirmada'>

type CamposEditables = Partial<Omit<EncargadoTratamiento,
    'id' | 'empresa_id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'>>

export const encargadosService = {

    async listar(empresaId: string): Promise<EncargadoTratamiento[]> {
        const { data, error } = await lopdp()
            .from('encargados_tratamiento')
            .select('*')
            .eq('empresa_id', empresaId)
            .eq('activo', true)
            .order('nombre')
        if (error) throw error
        return data as EncargadoTratamiento[]
    },

    async crear(encargado: CamposCreables, userId: string): Promise<EncargadoTratamiento> {
        const { data, error } = await lopdp()
            .from('encargados_tratamiento')
            .insert({ ...encargado, created_by: userId, updated_by: userId })
            .select()
            .single()
        if (error) throw error
        return data as EncargadoTratamiento
    },

    async actualizar(id: string, campos: CamposEditables, userId: string): Promise<EncargadoTratamiento> {
        const { data, error } = await lopdp()
            .from('encargados_tratamiento')
            .update({ ...campos, updated_by: userId })
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        return data as EncargadoTratamiento
    },

    async archivar(id: string, userId: string): Promise<void> {
        const { error } = await lopdp()
            .from('encargados_tratamiento')
            .update({ activo: false, updated_by: userId })
            .eq('id', id)
        if (error) throw error
    },
}
