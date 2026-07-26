import { supabase } from '../../lib/supabase'
import type { LopdpEmpresaConfig } from '../../types/lopdp'

const lopdp = () => supabase.schema('lopdp')

export const lopdpConfigService = {

    // Sin fila = módulo deshabilitado (comportamiento por defecto, no requiere seed)
    async isEnabled(empresaId: string): Promise<boolean> {
        const { data, error } = await lopdp()
            .from('empresas_config')
            .select('lopdp_enabled')
            .eq('empresa_id', empresaId)
            .maybeSingle()
        if (error) throw error
        return !!data?.lopdp_enabled
    },
}

export type { LopdpEmpresaConfig }
