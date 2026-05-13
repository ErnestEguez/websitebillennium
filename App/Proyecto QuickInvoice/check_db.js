
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFsdHRqanl0bWNyaXhnaHhhdmJ0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTc0MDAwMiwiZXhwIjoyMDg1MzE2MDAyfQ.ClyXv0R1D-MOfT88L2_FAnS7Vf1Xn_YvK9g_p_Y_Y_Y'
);

async function check() {
    try {
        console.log("1. Buscando empresa por RUC 0907388268001...");
        const { data: empresa, error: e1 } = await supabase
            .from('empresas')
            .select('*')
            .eq('ruc', '0907388268001')
            .single();

        if (e1 || !empresa) {
            console.error("❌ Error o no encontrada:", e1?.message);
            return;
        }
        console.log("✅ Empresa:", empresa.nombre);
        console.log("   ID:", empresa.id);
        console.log("   Firma Path:", empresa.config_sri?.firma_path);
        console.log("   Password existe:", !!empresa.config_sri?.firma_password);

        console.log("\n2. Listando archivos en Storage...");
        const { data: files } = await supabase.storage.from('firmas_electronicas').list('', { recursive: true });
        if (files) {
            files.forEach(f => console.log(`   - ${f.name} (${f.metadata?.size} bytes)`));
        }

        console.log("\n3. Último error registrado:");
        const { data: comp } = await supabase
            .from('comprobantes')
            .select('secuencial, estado_sri, observaciones_sri, clave_acceso, empresa_id')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (comp) {
            console.log(`   Doc: ${comp.secuencial}`);
            console.log(`   Clave: ${comp.clave_acceso}`);
            console.log(`   Error: ${comp.observaciones_sri}`);
            console.log(`   Empresa del doc: ${comp.empresa_id}`);
        }
    } catch (e) {
        console.error(e);
    }
}

check();
