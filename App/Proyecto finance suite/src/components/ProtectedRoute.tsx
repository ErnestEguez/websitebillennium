import { useAuth } from '../contexts/AuthContext'

const PORTAL_URL = import.meta.env.VITE_PORTAL_URL || 'https://www.billenniumsystem.com'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth()

    if (loading) return null

    if (!user) {
        window.location.replace(PORTAL_URL)
        return null
    }

    return <>{children}</>
}
