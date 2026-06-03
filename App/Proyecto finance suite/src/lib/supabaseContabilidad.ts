import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL      as string
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Cliente secundario — schema contabilidad (LedgerPro).
// autoRefreshToken: false evita que compita con supabaseFacturacion (cliente
// primario de auth) por el refresh del token.
export const supabaseContabilidad = createClient(SUPABASE_URL, SUPABASE_KEY, {
    db:   { schema: 'contabilidad' },
    auth: { detectSessionInUrl: false, autoRefreshToken: false },
})
