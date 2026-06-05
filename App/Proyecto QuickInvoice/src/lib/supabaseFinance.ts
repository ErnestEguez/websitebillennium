import { createClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL      as string
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Cliente para schema finance (Tesorería).
// Custom fetch inyecta token del cliente principal (facturacion).
export const supabaseFinance = createClient(SUPABASE_URL, SUPABASE_KEY, {
    db:   { schema: 'finance' },
    auth: {
        storageKey:         'sb-qi-finance-isolated',
        autoRefreshToken:   false,
        detectSessionInUrl: false,
        persistSession:     false,
    },
    global: {
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
            const { data: { session } } = await supabase.auth.getSession()
            const headers = new Headers(init?.headers)
            if (session?.access_token) {
                headers.set('Authorization', `Bearer ${session.access_token}`)
                headers.set('apikey', SUPABASE_KEY)
            }
            return fetch(input, { ...init, headers })
        },
    },
})

// Alias para compatibilidad con servicios de Finance Suite que importan { supabase }
export { supabaseFinance as supabase }
