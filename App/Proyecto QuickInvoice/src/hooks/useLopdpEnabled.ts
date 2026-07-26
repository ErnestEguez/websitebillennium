import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { lopdpConfigService } from '../services/lopdp/lopdpConfigService'

// Deliberadamente independiente de AuthContext/Modules: el flag vive en
// lopdp.empresas_config (schema aislado), no en facturacion.empresas ni
// facturacion.user_modules, para no tocar el estado global de auth mientras
// el módulo LOPDP no esté aprobado para producción.
export function useLopdpEnabled() {
    const { empresa } = useAuth()
    const [enabled, setEnabled] = useState(false)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!empresa?.id) { setEnabled(false); setLoading(false); return }
        let cancelled = false
        setLoading(true)
        lopdpConfigService.isEnabled(empresa.id)
            .then(val => { if (!cancelled) setEnabled(val) })
            .catch(() => { if (!cancelled) setEnabled(false) })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [empresa?.id])

    return { enabled, loading }
}
