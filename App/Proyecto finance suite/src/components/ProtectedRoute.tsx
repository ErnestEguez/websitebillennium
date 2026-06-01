import { useAuth } from '../contexts/AuthContext'
import { DevLoginPage } from '../pages/DevLoginPage'

const PORTAL_URL = import.meta.env.VITE_PORTAL_URL || 'https://www.billenniumsystem.com'
const IS_DEV = import.meta.env.DEV

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth()

    if (loading) return null

    if (!user) {
        if (IS_DEV) return <DevLoginPage />
        window.location.replace(PORTAL_URL)
        return null
    }

    return <>{children}</>
}
