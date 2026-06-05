import { createClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL      as string
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Cliente para schema contabilidad (LedgerPro).
// storageKey aislado + custom fetch que inyecta token del cliente principal.
export const supabaseContabilidad = createClient(SUPABASE_URL, SUPABASE_KEY, {
    db:   { schema: 'contabilidad' },
    auth: {
        storageKey:         'sb-qi-conta-isolated',
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

// Alias para compatibilidad con páginas de LedgerPro que importan { supabase }
export { supabaseContabilidad as supabase }
