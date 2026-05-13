
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const supabase = createClient(
    'https://alttjjytmcrixghxavbt.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsdHRqanl0bWNyaXhnaHhhdmJ0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTc0MDAwMiwiZXhwIjoyMDg1MzE2MDAyfQ.ClyXv0R1D-MOfT88L2_FAnS7Vf1Xn_YvK9g_p_Y_Y_Y' // Reemplaza con tu SERVICE_ROLE real si este falla
)

async function checkStatus() {
    console.log("--- REVISANDO CONFIGURACION DE EMPRESAS ---")
    const { data: empresas } = await supabase.from('empresas').select('*')
    console.table(empresas?.map(e => ({
        id: e.id,
        ruc: e.ruc,
        nombre: e.nombre,
        firma_path: e.config_sri?.firma_path,
        has_pass: !!e.config_sri?.firma_password
    })))

    console.log("\n--- REVISANDO ARCHIVOS EN STORAGE ---")
    const { data: files } = await supabase.storage.from('firmas_electronicas').list('', { recursive: true })
    console.table(files?.map(f => ({ name: f.name, size: f.metadata?.size })))

    console.log("\n--- REVISANDO ULTIMOS COMPROBANTES ---")
    const { data: comps } = await supabase.from('comprobantes').select('secuencial, estado_sri, observaciones_sri, empresa_id').order('created_at', { ascending: false }).limit(5)
    console.table(comps)
}

checkStatus()
