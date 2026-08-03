import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { iaFeaturesService } from '../services/iaFeaturesService'

export type IaFeature = 'compras' | 'voz' | 'cv'

// Solo controla si se MUESTRA el botón correspondiente — la protección
// real está del lado del servidor (Edge Functions gemini-client-proxy,
// scan-invoice, voice-assistant), que rechazan la llamada igual aunque
// se salte este chequeo.
export function useIaFeatureEnabled(feature: IaFeature) {
    const { empresa } = useAuth()
    const [enabled, setEnabled] = useState(false)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!empresa?.id) { setEnabled(false); setLoading(false); return }
        let cancelled = false
        setLoading(true)
        iaFeaturesService.getConfig(empresa.id)
            .then(cfg => { if (!cancelled) setEnabled(cfg[`${feature}_enabled`]) })
            .catch(() => { if (!cancelled) setEnabled(false) })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [empresa?.id, feature])

    return { enabled, loading }
}
