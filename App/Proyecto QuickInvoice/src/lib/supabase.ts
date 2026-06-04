import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL      as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

async function fetchConTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === 'string' ? input : input.toString()
    if (url.includes('/auth/v1/')) return fetch(input, init)
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), 25_000)
    try {
        return await fetch(input, { ...init, signal: controller.signal })
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
