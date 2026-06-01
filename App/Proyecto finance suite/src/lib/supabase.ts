import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL      as string
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// En dev con VITE_SKIP_AUTH=true se usa service role key para bypassar RLS
const DEV_KEY = import.meta.env.DEV && import.meta.env.VITE_SKIP_AUTH === 'true'
    ? (import.meta.env.VITE_SUPABASE_SERVICE_KEY as string | undefined)
    : undefined

// Cliente principal — schema finance
export const supabase = createClient(SUPABASE_URL, DEV_KEY ?? SUPABASE_KEY, {
    db: { schema: 'finance' },
    auth: { detectSessionInUrl: false },
})
