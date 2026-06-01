import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL      as string
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string

const SERVICE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_KEY as string | undefined
const USE_SERVICE  = import.meta.env.DEV
    && import.meta.env.VITE_SKIP_AUTH === 'true'
    && !!SERVICE_KEY

// Cliente para schema facturacion (proveedores, CxP, pagos)
export const supabaseFacturacion = createClient(SUPABASE_URL, USE_SERVICE ? SERVICE_KEY! : SUPABASE_KEY, {
    db: { schema: 'facturacion' },
    auth: {
        flowType:         'implicit',
        persistSession:   !USE_SERVICE,
        autoRefreshToken: !USE_SERVICE,
    },
})
