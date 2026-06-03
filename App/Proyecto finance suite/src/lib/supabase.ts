import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL      as string
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Cliente secundario — schema finance.
// autoRefreshToken: false evita que compita con supabaseFacturacion (cliente
// primario de auth) por el refresh del token, eliminando el conflicto de
// GoTrueClient que emitía SIGNED_OUT y corrompía la sesión de otras apps.
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    db:   { schema: 'finance' },
    auth: { detectSessionInUrl: false, autoRefreshToken: false },
})
