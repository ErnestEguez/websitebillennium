import { createClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Isolated client for the contabilidad schema.
// IMPORTANT: does NOT share auth storage with the main client.
// Instead, it injects the current access_token from the main client
// into every request via a custom fetch. This avoids the token-refresh
// race condition that caused subsequent main-client queries to hang.
export const supabaseContabilidad = createClient(url, key, {
    db: { schema: 'contabilidad' },
    auth: {
        storageKey:         'vm-contabilidad-isolated',
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
            }
            return fetch(input, { ...init, headers })
        },
    },
})
