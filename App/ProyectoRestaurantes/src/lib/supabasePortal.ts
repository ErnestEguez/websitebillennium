import { createClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Cliente aislado para leer del schema facturacion (portal).
// Inyecta el token del cliente principal para compartir sesión
// sin interferir con el schema restaurantes.
export const supabasePortal = createClient(url, key, {
    db: { schema: 'facturacion' },
    auth: {
        autoRefreshToken:  false,
        detectSessionInUrl: false,
        persistSession:    false,
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
