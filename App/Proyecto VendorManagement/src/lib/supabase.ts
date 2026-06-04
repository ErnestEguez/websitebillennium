import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL      as string
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Timeout SOLO en queries de datos (/rest/v1/) para evitar loading infinito.
// Las peticiones de auth (/auth/v1/) NO tienen timeout — necesitan
// completar aunque el servidor esté lento (p.ej. validación de magic link).
async function fetchConTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.includes('/auth/v1/')) {
        return fetch(input, init)
    }
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), 25_000)
    try {
        return await fetch(input, { ...init, signal: controller.signal })
    } finally {
        clearTimeout(id)
    }
}

// storageKey propio → BroadcastChannel aislado → no interfiere con otras apps.
// autoRefreshToken: false → el GoTrueClient no adquiere el mutex de refresh
// que puede bloquearse cuando la sesión es invalidada externamente.
// El token dura 1h; al expirar los requests fallan con error manejable.
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    db:     { schema: 'facturacion' },
    auth:   {
        storageKey:       'sb-vm-auth',
        autoRefreshToken: false,
    },
    global: { fetch: fetchConTimeout },
})
