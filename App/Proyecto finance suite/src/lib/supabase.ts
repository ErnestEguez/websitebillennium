import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL      as string
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// En dev con VITE_SKIP_AUTH=true se usa service role key para bypassar RLS
const SERVICE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_KEY as string | undefined
const USE_SERVICE  = import.meta.env.DEV
    && import.meta.env.VITE_SKIP_AUTH === 'true'
    && !!SERVICE_KEY

// Cliente principal — schema finance
export const supabase = createClient(SUPABASE_URL, USE_SERVICE ? SERVICE_KEY! : SUPABASE_KEY, {
    db: { schema: 'finance' },
    auth: {
        detectSessionInUrl: false,
        // En modo service key: no usar localStorage (evita que una sesión
        // caducada override el service key y cause 401)
        persistSession:   !USE_SERVICE,
        autoRefreshToken: !USE_SERVICE,
    },
})
