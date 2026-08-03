import { supabase } from '../lib/supabase'

export interface IaFeaturesConfig {
    compras_enabled: boolean
    voz_enabled: boolean
    cv_enabled: boolean
}

export const iaFeaturesService = {
    // Sin fila = las 3 deshabilitadas (comportamiento por defecto, no requiere seed)
    async getConfig(empresaId: string): Promise<IaFeaturesConfig> {
        const { data, error } = await supabase
            .from('ia_features_config')
            .select('compras_enabled, voz_enabled, cv_enabled')
            .eq('empresa_id', empresaId)
            .maybeSingle()
        if (error) throw error
        return {
            compras_enabled: !!data?.compras_enabled,
            voz_enabled: !!data?.voz_enabled,
            cv_enabled: !!data?.cv_enabled,
        }
    },
}
