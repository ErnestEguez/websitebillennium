import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL      as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Fetch con timeout de 10 segundos.
async function fetchConTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), 10_000)
    try {
        const res = await fetch(input, { ...init, signal: controller.signal })
        return res
    } finally {
        clearTimeout(id)
    }
}

// storageKey propio → BroadcastChannel aislado → no interfiere con otras apps.
// autoRefreshToken: false → previene bloqueo de mutex en GoTrueClient.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    db:     { schema: 'facturacion' },
    auth:   { storageKey: 'sb-qi-auth', autoRefreshToken: false },
    global: { fetch: fetchConTimeout },
})
