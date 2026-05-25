import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL      as string
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Cliente para schema conta (LedgerPro — plan de cuentas, comprobantes)
export const supabaseContabilidad = createClient(SUPABASE_URL, SUPABASE_KEY, {
    db: { schema: 'conta' },
})
