
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const supabase = createClient(
    'https://alttjjytmcrixghxavbt.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsdHRqanl0bWNyaXhnaHhhdmJ0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTc0MDAwMiwiZXhwIjoyMDg1MzE2MDAyfQ.ClyXv0R1D-MOfT88L2_FAnS7Vf1Xn_YvK9g_p_Y_Y_Y'
)

async function debug() {
    console.log("🔍 REVISANDO EMPRESA...");
    const { data: emp } = await supabase.from('empresas').select('*').eq('ruc', '0907388268001').single();
    if (!emp) return console.log("❌ Empresa no encontrada");

    console.log("✅ Empresa:", emp.nombre);
    console.log("📂 Firma Path en DB:", emp.config_sri?.firma_path);
    console.log("🔑 Password en DB:", emp.config_sri?.firma_password ? "CONFIGURADO" : "FALTA");

    console.log("\n📦 ARCHIVOS EN STORAGE (firmas_electronicas):");
    const { data: files } = await supabase.storage.from('firmas_electronicas').list();
    files?.forEach(f => console.log(`   - ${f.name} (${f.metadata.size} bytes)`));

    console.log("\n📄 ULTIMA FACTURA:");
    const { data: comp } = await supabase.from('comprobantes').select('*').order('created_at', { ascending: false }).limit(1).single();
    console.log(`   ID Comprobante: ${comp?.id}`);
    console.log(`   Empresa ID: ${comp?.empresa_id}`);
    console.log(`   Estado: ${comp?.estado_sri}`);
    console.log(`   Error reportado: ${comp?.observaciones_sri}`);
}

debug();
