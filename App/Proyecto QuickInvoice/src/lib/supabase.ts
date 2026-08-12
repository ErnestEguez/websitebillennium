import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL      as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// ── Aviso global de sesión expirada ─────────────────────────────────────────
// Con autoRefreshToken:false (ver abajo) el JWT expira solo pasada ~1h y cada
// pantalla recibía el error crudo "JWT expired" de PostgREST sin explicación.
// En vez de tocar el refresh (eso fue lo que causó el bloqueo de mutex que
// se corrigió desactivándolo), se detecta acá — a nivel de fetch, sin tocar
// GoTrueClient — y se avisa a quien esté suscrito (AuthContext) para mostrar
// un modal claro en vez de dejar que el error crudo llegue a cada página.
type ListenerSesionExpirada = () => void
const listenersSesionExpirada = new Set<ListenerSesionExpirada>()
let sesionExpiradaNotificada = false

export function onSessionExpired(cb: ListenerSesionExpirada): () => void {
    listenersSesionExpirada.add(cb)
    return () => listenersSesionExpirada.delete(cb)
}

function notificarSesionExpirada() {
    if (sesionExpiradaNotificada) return
    sesionExpiradaNotificada = true
    listenersSesionExpirada.forEach(cb => cb())
}

async function fetchConTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.includes('/auth/v1/')) return fetch(input, init)
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), 25_000)
    try {
        const response = await fetch(input, { ...init, signal: controller.signal })
        // 401 de PostgREST en un endpoint que no es /auth/v1/ es, en la práctica,
        // siempre un JWT vencido o inválido (RLS deniega con 200 vacío o 403,
        // no 401) — así que es una señal confiable sin necesidad de leer el body.
        if (response.status === 401) notificarSesionExpirada()
        return response
    } finally {
        clearTimeout(id)
    }
}

// storageKey propio → BroadcastChannel aislado → no interfiere con otras apps.
// autoRefreshToken: false → previene bloqueo de mutex en GoTrueClient.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    db:     { schema: 'facturacion' },
    auth:   {
        storageKey:       'sb-qi-auth',
        autoRefreshToken: false,
    },
    global: { fetch: fetchConTimeout },
})

// Aliases para compatibilidad con Finance Suite y otros módulos migrados
export { supabase as supabaseFacturacion }
