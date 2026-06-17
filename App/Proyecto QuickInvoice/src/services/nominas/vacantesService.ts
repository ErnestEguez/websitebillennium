import { supabase } from '../../lib/supabase'
import type { Vacante, EstadoVacante } from '../../types/nominas'

const nominas = () => supabase.schema('nominas')

const SELECT_CON_JOINS = '*, cargo:cargos(nombre), seccion:secciones(nombre), candidatos_count:candidatos(count)'

export const vacantesService = {

    async listar(empresaId: string): Promise<Vacante[]> {
        const { data, error } = await nominas()
            .from('vacantes')
            .select(SELECT_CON_JOINS)
            .eq('empresa_id', empresaId)
            .order('created_at', { ascending: false })
        if (error) throw error
        return (data ?? []).map((v: any) => ({
            ...v,
            candidatos_count: v.candidatos_count?.[0]?.count ?? 0,
        })) as Vacante[]
    },

    async crear(v: Omit<Vacante, 'id' | 'created_at' | 'updated_at' | 'cargo' | 'seccion' | 'candidatos_count'>): Promise<Vacante> {
        const { data, error } = await nominas()
            .from('vacantes')
            .insert(v)
            .select()
            .single()
        if (error) throw error
        return data as Vacante
    },

    async actualizar(id: string, campos: Partial<Omit<Vacante, 'cargo' | 'seccion' | 'candidatos_count'>>): Promise<Vacante> {
        const { data, error } = await nominas()
            .from('vacantes')
            .update(campos)
            .eq('id', id)
            .select()
            .single()
        if (error) throw error
        return data as Vacante
    },

    async cambiarEstado(id: string, estado: EstadoVacante): Promise<void> {
        const { error } = await nominas()
            .from('vacantes')
            .update({ estado })
            .eq('id', id)
        if (error) throw error
    },

    async eliminar(id: string): Promise<void> {
        const { error } = await nominas()
            .from('vacantes')
            .delete()
            .eq('id', id)
        if (error) throw error
    },
}
