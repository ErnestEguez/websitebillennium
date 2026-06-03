import { createClient } from '@supabase/supabase-js'
import { supabaseFacturacion } from './supabaseFacturacion'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL      as string
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Cliente secundario — schema contabilidad (LedgerPro).
// Mismo patrón que supabase.ts: storageKey aislado para BroadcastChannel
// independiente, custom fetch inyecta token desde supabaseFacturacion.
export const supabaseContabilidad = createClient(SUPABASE_URL, SUPABASE_KEY, {
    db:   { schema: 'contabilidad' },
    auth: {
        storageKey:         'sb-contabilidad-isolated',
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
