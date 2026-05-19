import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

interface ProtectedRouteProps {
    allowedRoles: string[]
    children: React.ReactNode
}

export function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
    const { profile } = useAuth()

    if (!profile) {
        return <Navigate to="/login" replace />
    }

    if (!allowedRoles.includes(profile.rol)) {
        // Redirigir a una ruta segura según el rol para evitar bucles
        if (profile.rol === 'mesero') return <Navigate to="/mesas" replace />
        if (profile.rol === 'cocina') return <Navigate to="/pedidos" replace />

        // Si es admin_plataforma y está en una ruta no permitida, mandarlo a configuración
        if (profile.rol === 'admin_plataforma') return <Navigate to="/configuracion" replace />

        return <Navigate to="/login" replace />
    }

    return <>{children}</>
}
