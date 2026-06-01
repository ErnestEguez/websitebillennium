import { useAuth } from '../contexts/AuthContext'
import { magicLinkAccessToken, magicLinkRefreshToken } from '../lib/magicLink'

const PORTAL_URL = import.meta.env.VITE_PORTAL_URL || 'https://www.billenniumsystem.com'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { user, loading } = useAuth()

    if (loading) return null

    if (!user) {
        // DIAGNÓSTICO TEMPORAL — muestra info en lugar de redirigir
        return (
            <div style={{ fontFamily: 'monospace', padding: 24, background: '#fff', maxWidth: 600, margin: '40px auto', border: '1px solid #ccc', borderRadius: 8 }}>
                <h2 style={{ color: '#e00' }}>⚠️ Sin sesión — Diagnóstico</h2>
                <p><b>access_token capturado:</b> {magicLinkAccessToken ? '✅ SÍ (' + magicLinkAccessToken.slice(0, 20) + '...)' : '❌ NO (null)'}</p>
                <p><b>refresh_token capturado:</b> {magicLinkRefreshToken ? '✅ SÍ (' + magicLinkRefreshToken.slice(0, 20) + '...)' : '❌ NO (null)'}</p>
                <p><b>URL hash:</b> {window.location.hash || '(vacío)'}</p>
                <p><b>URL search:</b> {window.location.search || '(vacío)'}</p>
                <p><b>URL completa:</b> {window.location.href}</p>
                <hr />
                <button onClick={() => window.location.replace(PORTAL_URL)} style={{ marginTop: 12, padding: '8px 16px', cursor: 'pointer' }}>
                    Volver al portal →
                </button>
            </div>
        )
    }

    return <>{children}</>
}
