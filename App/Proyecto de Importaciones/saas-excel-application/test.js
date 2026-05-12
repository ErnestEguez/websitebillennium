import { supabase } from './src/lib/supabase.js';

async function test() {
  const { data, error } = await supabase.from('productos').select('*').order('fecha_creacion', { ascending: false });
  console.log("Error:", error);
  console.log("Data:", data);
}

test();
