import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  || 'https://ietsocfibsoclienqafq.supabase.co';

const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlldHNvY2ZpYnNvY2xpZW5xYWZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1ODAzODEsImV4cCI6MjA4ODE1NjM4MX0.v3pC3oDapKexAXW6cMzA2Tp6LUb-IzbQE8oUVC22Hm4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: 'importaciones' },
});
