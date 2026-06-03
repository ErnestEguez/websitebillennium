import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL      as string
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Cliente AUTH principal de Finance Suite (AuthContext lo importa como 'supabase').
// storageKey propio → BroadcastChannel aislado → Finance Suite no emite
// ni recibe eventos SIGNED_OUT hacia/desde Vendor Management u otras apps.
export const supabaseFacturacion = createClient(SUPABASE_URL, SUPABASE_KEY, {
    db:   { schema: 'facturacion' },
    auth: { flowType: 'implicit', storageKey: 'sb-finance-auth' },
})
