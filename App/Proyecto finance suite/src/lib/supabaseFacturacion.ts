import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL      as string
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Cliente AUTH principal de Finance Suite (AuthContext lo importa como 'supabase').
// storageKey propio → BroadcastChannel aislado → Finance Suite no emite
// ni recibe eventos SIGNED_OUT hacia/desde Vendor Management u otras apps.
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

// Cliente AUTH principal de Finance Suite.
// flowType implicit para procesar magic links del portal.
// autoRefreshToken: false → previene bloqueo de mutex GoTrueClient.
export const supabaseFacturacion = createClient(SUPABASE_URL, SUPABASE_KEY, {
    db:     { schema: 'facturacion' },
    auth:   { flowType: 'implicit', storageKey: 'sb-finance-auth', autoRefreshToken: false },
    global: { fetch: fetchConTimeout },
})
