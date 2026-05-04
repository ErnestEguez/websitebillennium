import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const body = await req.json();
    const { email, password, nombre, empresa } = body;

    if (!email || !password || !nombre || !empresa) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: email, password, nombre, empresa' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!empresa.ruc || !empresa.nombre_comercial || !empresa.direccion || !empresa.telefonos) {
      return new Response(
        JSON.stringify({ error: 'Missing empresa fields: ruc, nombre_comercial, direccion, telefonos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: authData, error: createAuthError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre },
    });

    if (createAuthError) {
      return new Response(
        JSON.stringify({ error: createAuthError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!authData.user) {
      return new Response(
        JSON.stringify({ error: 'Failed to create user' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: empresaData, error: empresaError } = await supabase
      .from('empresas')
      .insert([{
        ruc: empresa.ruc,
        nombre_comercial: empresa.nombre_comercial,
        representante_legal: nombre,
        direccion: empresa.direccion,
        telefonos: empresa.telefonos,
        correos: email,
        activo: true,
        habilitar_proformas: true,
        habilitar_pedidos: true,
      }])
      .select()
      .single();

    if (empresaError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      return new Response(
        JSON.stringify({ error: empresaError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { error: vendedorError } = await supabase
      .from('vendedores')
      .insert([{
        id: authData.user.id,
        nombre,
        email,
        telefono: empresa.telefonos,
        empresa_id: empresaData.id,
        activo: true,
        is_admin: true,
      }]);

    if (vendedorError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      return new Response(
        JSON.stringify({ error: vendedorError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        user_id: authData.user.id,
        empresa_id: empresaData.id
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});