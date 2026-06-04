import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL      as string
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

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
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    db:     { schema: 'contabilidad' },
    auth:   { storageKey: 'sb-lp-auth', autoRefreshToken: false },
    global: { fetch: fetchConTimeout },
})
