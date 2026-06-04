import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL      as string
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// storageKey propio → BroadcastChannel aislado → no interfiere con
// QuickInvoice, Finance Suite ni otras apps del mismo proyecto Supabase.
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    db:   { schema: 'facturacion' },
    auth: { storageKey: 'sb-vm-auth' },
})
