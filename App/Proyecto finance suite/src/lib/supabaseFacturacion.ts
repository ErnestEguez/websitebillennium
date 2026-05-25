import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL      as string
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Cliente para schema facturacion (proveedores, CxP, pagos)
export const supabaseFacturacion = createClient(SUPABASE_URL, SUPABASE_KEY, {
    db: { schema: 'facturacion' },
})
