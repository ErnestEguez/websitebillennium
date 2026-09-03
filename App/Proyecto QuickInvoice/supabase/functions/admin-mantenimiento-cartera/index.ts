// ============================================================
// EDGE FUNCTION: admin-mantenimiento-cartera
// Corrige errores de una migración de cartera (cartera_cxc con
// origen='MIGRACION') SIN dar a los usuarios de la empresa un botón
// de eliminar deudas, y sin depender de una sesión de superadmin
// persistente en el navegador.
//
// El usuario logueado en la empresa (cualquiera) abre el modal, pero
// para desbloquearlo debe escribir el correo/contraseña reales de una
// cuenta con rol admin_plataforma. Esta función verifica esas
// credenciales AQUÍ, en el servidor, con una sesión efímera que nunca
// se devuelve al navegador (no queda ninguna sesión de superadmin
// guardada en ese equipo) — cada acción (listar o eliminar) exige
// mandar la contraseña de nuevo, así que en cuanto se cierra el modal
// no queda forma de volver a entrar sin que alguien con las
// credenciales las escriba otra vez.
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const { email, password, empresa_id, action, ids } = await req.json();

        if (!email || !password) return json({ error: "Usuario y contraseña son obligatorios." }, 400);
        if (!empresa_id) return json({ error: "Falta empresa_id." }, 400);

        const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
        const ANON_KEY       = Deno.env.get("SUPABASE_ANON_KEY")!;
        const SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        // 1. Verificar credenciales con una sesión efímera — solo vive dentro
        //    de esta invocación, nunca se manda de vuelta al navegador.
        const authClient = createClient(SUPABASE_URL, ANON_KEY);
        const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({ email, password });
        if (signInError || !signInData?.user) {
            return json({ error: "Usuario o contraseña incorrectos." }, 401);
        }
        const userId = signInData.user.id;
        await authClient.auth.signOut().catch(() => {});

        // 2. Verificar rol admin_plataforma con la service role (bypassa RLS
        //    a propósito — es el único lugar de esta función que lo hace, y
        //    solo después de validar la contraseña real de esa cuenta).
        const admin = createClient(SUPABASE_URL, SERVICE_KEY, { db: { schema: "facturacion" } });
        const { data: profile } = await admin.from("profiles").select("rol").eq("id", userId).maybeSingle();
        if (profile?.rol !== "admin_plataforma") {
            return json({ error: "Esa cuenta no tiene permiso de superadministrador." }, 403);
        }

        // 3. Listar cartera migrada de ESTA empresa (nunca otra)
        if (action === "listar") {
            const { data: filas, error } = await admin
                .from("cartera_cxc")
                .select("id, numero_documento_externo, fecha_emision, valor_original, saldo, estado, clientes(nombre, identificacion)")
                .eq("empresa_id", empresa_id)
                .eq("origen", "MIGRACION")
                .order("fecha_emision", { ascending: false });
            if (error) return json({ error: error.message }, 500);

            const idsFilas = (filas ?? []).map((f: any) => f.id);
            const [{ data: pagos }, { data: aplic }] = await Promise.all([
                idsFilas.length
                    ? admin.from("cartera_cxc_pagos").select("cartera_id").in("cartera_id", idsFilas)
                    : Promise.resolve({ data: [] as any[] }),
                idsFilas.length
                    ? admin.from("aplicaciones_nc_cxc").select("cartera_cxc_id").in("cartera_cxc_id", idsFilas)
                    : Promise.resolve({ data: [] as any[] }),
            ]);
            const conPagos = new Set((pagos ?? []).map((p: any) => p.cartera_id));
            const conAplic = new Set((aplic ?? []).map((a: any) => a.cartera_cxc_id));

            return json({
                filas: (filas ?? []).map((f: any) => ({
                    id: f.id,
                    cliente_nombre: f.clientes?.nombre ?? "(cliente eliminado)",
                    cliente_identificacion: f.clientes?.identificacion ?? "",
                    numero_documento_externo: f.numero_documento_externo,
                    fecha_emision: f.fecha_emision,
                    valor_original: Number(f.valor_original) || 0,
                    saldo: Number(f.saldo) || 0,
                    estado: f.estado,
                    bloqueado: conPagos.has(f.id) || conAplic.has(f.id),
                })),
            });
        }

        // 4. Eliminar — re-verifica TODO server-side, sin confiar en el navegador
        if (action === "eliminar") {
            if (!Array.isArray(ids) || ids.length === 0) return json({ error: "No hay nada seleccionado." }, 400);

            const resultados: { id: string; label: string; ok: boolean; msg: string }[] = [];
            for (const id of ids) {
                const { data: fila } = await admin
                    .from("cartera_cxc")
                    .select("id, numero_documento_externo, saldo")
                    .eq("id", id).eq("empresa_id", empresa_id).eq("origen", "MIGRACION")
                    .maybeSingle();

                const label = fila ? `${fila.numero_documento_externo ?? id} — $${fila.saldo}` : id;

                if (!fila) {
                    resultados.push({ id, label, ok: false, msg: "No encontrado (o no es cartera migrada de esta empresa)" });
                    continue;
                }

                const [{ count: cPagos }, { count: cAplic }] = await Promise.all([
                    admin.from("cartera_cxc_pagos").select("id", { count: "exact", head: true }).eq("cartera_id", id),
                    admin.from("aplicaciones_nc_cxc").select("id", { count: "exact", head: true }).eq("cartera_cxc_id", id),
                ]);
                if ((cPagos ?? 0) > 0 || (cAplic ?? 0) > 0) {
                    resultados.push({ id, label, ok: false, msg: "Tiene pagos o notas de crédito aplicadas — no se puede eliminar" });
                    continue;
                }

                try {
                    let e = (await admin.from("cartera_cxc_pagos").delete().eq("cartera_id", id)).error
                    if (!e) e = (await admin.from("aplicaciones_nc_cxc").delete().eq("cartera_cxc_id", id)).error
                    if (!e) e = (await admin.from("cartera_cxc").delete()
                        .eq("id", id).eq("empresa_id", empresa_id).eq("origen", "MIGRACION")).error
                    if (e) throw e
                    resultados.push({ id, label, ok: true, msg: "Eliminado" });
                } catch (e: any) {
                    resultados.push({ id, label, ok: false, msg: e.message ?? String(e) });
                }
            }
            return json({ resultados });
        }

        return json({ error: "Acción inválida." }, 400);
    } catch (e: any) {
        return json({ error: e.message ?? String(e) }, 500);
    }
});
