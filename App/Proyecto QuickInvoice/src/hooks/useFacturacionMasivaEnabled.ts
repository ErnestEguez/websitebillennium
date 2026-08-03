import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { facturacionMasivaService } from '../services/facturacionMasivaService'

export function useFacturacionMasivaEnabled() {
    const { empresa } = useAuth()
    const [enabled, setEnabled] = useState(false)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!empresa?.id) { setEnabled(false); setLoading(false); return }
        let cancelled = false
        setLoading(true)
        facturacionMasivaService.isEnabled(empresa.id)
            .then(val => { if (!cancelled) setEnabled(val) })
            .catch(() => { if (!cancelled) setEnabled(false) })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [empresa?.id])

    return { enabled, loading }
}
