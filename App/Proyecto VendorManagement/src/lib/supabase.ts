import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL      as string
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Fetch con timeout de 10 segundos.
// Evita que el GoTrueClient se quede bloqueado en un refresh de token
// que nunca responde, lo que congela toda la app.
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

// storageKey propio → BroadcastChannel aislado → no interfiere con
// QuickInvoice, Finance Suite ni otras apps del mismo proyecto Supabase.
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    db:     { schema: 'facturacion' },
    auth:   { storageKey: 'sb-vm-auth' },
    global: { fetch: fetchConTimeout },
})
