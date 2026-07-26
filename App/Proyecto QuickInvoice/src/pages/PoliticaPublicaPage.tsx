import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FileQuestion } from 'lucide-react'
import { politicaPrivacidadService } from '../services/lopdp/politicaPrivacidadService'
import { PoliticaPrivacidadDocumento } from '../components/lopdp/PoliticaPrivacidadDocumento'
import type { PoliticaPrivacidadPublica } from '../types/lopdp'

// Página 100% pública, sin autenticación — accesible con o sin sesión
// activa de QuickInvoice. Nunca importa AuthContext ni depende de useAuth().
export function PoliticaPublicaPage() {
    const { slug } = useParams<{ slug: string }>()
    const [politica, setPolitica] = useState<PoliticaPrivacidadPublica | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(false)

    useEffect(() => {
        if (!slug) { setLoading(false); setError(true); return }
        let cancelled = false
        politicaPrivacidadService.obtenerPublicaPorSlug(slug)
            .then(data => { if (!cancelled) { setPolitica(data); setError(!data) } })
            .catch(() => { if (!cancelled) setError(true) })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [slug])

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
            </div>
        )
    }

    if (error || !politica) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
                <FileQuestion className="w-14 h-14 text-slate-300 mb-3" />
                <p className="text-slate-500 font-medium">No encontramos una política de privacidad publicada en esta dirección.</p>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-50 py-10 px-4">
            <PoliticaPrivacidadDocumento
                contenido={politica.contenido}
                numeroVersion={politica.numero_version}
                fechaPublicacion={politica.fecha_publicacion}
            />
        </div>
    )
}
