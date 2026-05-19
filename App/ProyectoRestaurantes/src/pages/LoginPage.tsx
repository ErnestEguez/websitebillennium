import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function LoginPage() {
    const navigate = useNavigate()
    const { user, profile, loading: authLoading } = useAuth()

    const hasMagicLink =
        window.location.hash.includes('access_token') ||
        window.location.hash.includes('type=magiclink') ||
        new URLSearchParams(window.location.search).get('token_hash') !== null

    useEffect(() => {
        if (user && profile && !authLoading) {
            navigate('/', { replace: true })
        }
    }, [user, profile, authLoading, navigate])

    // Procesando magic link del portal
    if (hasMagicLink && authLoading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4 animate-pulse">
                        R
                    </div>
                    <p className="text-slate-500">Iniciando sesión...</p>
                </div>
            </div>
        )
    }

    // Sin sesión — acceso solo desde el portal
    if (!user && !authLoading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="max-w-sm w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-slate-200">
                    <div className="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold mx-auto mb-6">
                        R
                    </div>
                    <h1 className="text-xl font-bold text-slate-900 mb-2">RestoFlow</h1>
                    <p className="text-slate-500 text-sm mb-6">
                        Accede a esta aplicación desde el Portal Billennium.
                    </p>
                    <button
                        onClick={() => window.close()}
                        className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-3 rounded-xl transition-colors text-sm"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        )
    }

    return null
}
