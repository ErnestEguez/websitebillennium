import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('RestoFlow: faltan variables de entorno VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
}

// Cliente principal — apunta al schema restaurantes del proyecto portal
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    db: { schema: 'restaurantes' },
})
