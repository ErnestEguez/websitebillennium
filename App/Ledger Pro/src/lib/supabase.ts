import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase credentials missing. Please check your .env file.')
}

// Un único cliente. Default schema: contabilidad.
// Para leer tablas de QuickInvoice (facturacion) usar RPC contabilidad.lp_get_facturas_qi
const SUPABASE_URL  = supabaseUrl  || 'https://ietsocfibsoclienqafq.supabase.co'
const SUPABASE_KEY  = supabaseAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlldHNvY2ZpYnNvY2xpZW5xYWZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1ODAzODEsImV4cCI6MjA4ODE1NjM4MX0.v3pC3oDapKexAXW6cMzA2Tp6LUb-IzbQE8oUVC22Hm4'
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    db: { schema: 'contabilidad' },
})
