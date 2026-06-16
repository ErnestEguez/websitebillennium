import { supabase } from '../../lib/supabase'
import type { CuentasNomina } from '../../types/nominas'

const nominas = () => supabase.schema('nominas')

export const cuentasNominaService = {

    async obtener(empresaId: string): Promise<CuentasNomina | null> {
        const { data, error } = await nominas()
            .from('cuentas_nomina')
            .select('*')
            .eq('empresa_id', empresaId)
            .single()
        if (error && error.code !== 'PGRST116') throw error
        return data as CuentasNomina | null
    },

    async guardar(cuentas: CuentasNomina): Promise<CuentasNomina> {
        const { data, error } = await nominas()
            .from('cuentas_nomina')
            .upsert({ ...cuentas, updated_at: new Date().toISOString() })
            .select()
            .single()
        if (error) throw error
        return data as CuentasNomina
    },
}
