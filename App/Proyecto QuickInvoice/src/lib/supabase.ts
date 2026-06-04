import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL      as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// storageKey propio → BroadcastChannel aislado → no interfiere con
// Vendor Management, Finance Suite ni otras apps del mismo proyecto Supabase.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    db:   { schema: 'facturacion' },
    auth: { storageKey: 'sb-qi-auth' },
})
