import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Same project, schema contabilidad — shares auth storage with the main client
export const supabaseContabilidad = createClient(url, key, {
    db: { schema: 'contabilidad' },
    auth: {
        // Same storage key as the main facturacion client → session is shared
        storageKey: `sb-${url.split('//')[1]?.split('.')[0]}-auth-token`,
    },
})
