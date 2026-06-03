import { createClient } from '@supabase/supabase-js'
import { supabaseFacturacion } from './supabaseFacturacion'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL      as string
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Cliente secundario — schema finance.
// storageKey aislado → BroadcastChannel propio → no emite ni recibe eventos
// SIGNED_OUT hacia/desde otros clientes (Vendor Management, etc.).
// persistSession: false → no compite por el storage compartido.
// El token se inyecta desde supabaseFacturacion (cliente primario de auth)
// en cada request, garantizando que siempre se usa la sesión vigente.
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    db:   { schema: 'finance' },
    auth: {
        storageKey:         'sb-finance-isolated',
        persistSession:     false,
        autoRefreshToken:   false,
        detectSessionInUrl: false,
    },
    global: {
        fetch: async (url: RequestInfo | URL, options: RequestInit = {}) => {
            const { data: { session } } = await supabaseFacturacion.auth.getSession()
            const headers = new Headers(options.headers)
            headers.set('apikey', SUPABASE_KEY)
            if (session?.access_token) {
                headers.set('Authorization', `Bearer ${session.access_token}`)
            }
            return fetch(url, { ...options, headers })
        },
    },
})
