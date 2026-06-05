import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const PORTAL_URL = import.meta.env.VITE_PORTAL_URL || 'https://billenniumsystem.com'

interface ProtectedRouteProps {
    allowedRoles: string[]
    children: React.ReactNode
}

export function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
    const { profile, loading } = useAuth()

    // Esperar que el perfil cargue antes de redirigir
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
        )
    }

    if (!profile) {
        // En localhost → login propio. En producción → portal
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return <Navigate to="/login" replace />
        }
        window.location.replace(PORTAL_URL)
        return null
    }

    // Mesero y cocina tienen su propia UI — redirigir a su ruta específica
    if (profile.rol === 'mesero' && !allowedRoles.includes('mesero'))
        return <Navigate to="/mesas" replace />
    if (profile.rol === 'cocina' && !allowedRoles.includes('cocina'))
        return <Navigate to="/pedidos" replace />

    // Todos los demás roles autenticados tienen acceso
    return <>{children}</>
}
