import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL      as string
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

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
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    db:     { schema: 'contabilidad' },
    auth:   { storageKey: 'sb-lp-auth', autoRefreshToken: false },
    global: { fetch: fetchConTimeout },
})
