
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const supabase = createClient(
    'https://alttjjytmcrixghxavbt.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsdHRqanl0bWNyaXhnaHhhdmJ0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTc0MDAwMiwiZXhwIjoyMDg1MzE2MDAyfQ.ClyXv0R1D-MOfT88L2_FAnS7Vf1Xn_YvK9g_p_Y_Y_Y'
)

async function debug() {
    console.log("--- 1. EMPRESA Y CONFIGURACION ---");
    const { data: emp, error: e1 } = await supabase.from('empresas').select('*').eq('ruc', '0907388268001').single();
    if (e1) console.log("Error buscando empresa:", e1.message);
    else {
        console.log("ID Empresa:", emp.id);
        console.log("Ruta Firma (firma_path):", emp.config_sri?.firma_path);
        console.log("Tiene Password:", !!emp.config_sri?.firma_password);
    }

    console.log("\n--- 2. ARCHIVOS SUBIDOS ---");
    const { data: files, error: e2 } = await supabase.storage.from('firmas_electronicas').list('', { recursive: true });
    if (e2) console.log("Error listando archivos:", e2.message);
    else {
        files.forEach(f => {
            console.log(`- Archivo: ${f.name} | Tamaño: ${f.metadata?.size} bytes`);
        });
    }

    console.log("\n--- 3. ULTIMO COMPROBANTE ---");
    const { data: comp, error: e3 } = await supabase.from('comprobantes').select('*').order('created_at', { ascending: false }).limit(1).single();
    if (e3) console.log("Error comprobante:", e3.message);
    else {
        console.log("Secuencial:", comp.secuencial);
        console.log("Estado SRI:", comp.estado_sri);
        console.log("Observaciones:", comp.observaciones_sri);
    }
}

debug();
