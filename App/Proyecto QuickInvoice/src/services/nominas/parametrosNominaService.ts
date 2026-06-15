import { supabase } from '../../lib/supabase'
import type { ParametrosNomina } from '../../types/nominas'

const nominas = () => supabase.schema('nominas')

export const parametrosNominaService = {

    async obtener(empresaId: string): Promise<ParametrosNomina | null> {
        const { data, error } = await nominas()
            .from('parametros')
            .select('*')
            .eq('empresa_id', empresaId)
            .maybeSingle()
        if (error) throw error
        return data as ParametrosNomina | null
    },

    async guardar(empresaId: string, campos: Omit<ParametrosNomina, 'empresa_id' | 'updated_at'>): Promise<ParametrosNomina> {
        const { data, error } = await nominas()
            .from('parametros')
            .upsert({ empresa_id: empresaId, ...campos }, { onConflict: 'empresa_id' })
            .select()
            .single()
        if (error) throw error
        return data as ParametrosNomina
    },
}
