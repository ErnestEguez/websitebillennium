// ============================================================
// EDGE FUNCTION: sri-retry-facturas — QuickInvoice
// Barrido automático (llamado por pg_cron cada 15 min) de facturas
// no autorizadas. Cadencia (2026-09-10, ajustada para bajar el costo
// de invocaciones en Supabase — antes eran 8 intentos cada 15 min,
// ~2h de reintentos rápidos):
//   Fase rápida (0-1h desde created_at): 4 intentos, cada 15 min.
//   Fase media  (1h-24h desde created_at): 1 intento cada 2 horas.
//   Pasadas 24h desde created_at: se DEJA de reintentar automático —
//   queda solo el botón manual de "Reintentar" en Comprobantes.
// Alerta por correo (SMTP de la empresa Billennium System, RUC
// 0907388268001): se dispara UNA vez por factura cuando pasan 4 horas
// desde created_at sin lograr autorizarse — ya no depende de un
// conteo de intentos, es puramente por tiempo transcurrido, para que
// avise igual aunque el SRI esté tan caído que ni siquiera se pueda
// reintentar seguido.
//
// 2026-08-03: se agregó el caso RECHAZADO (rechazo firme del SRI, no
// solo "sigue pendiente"). Antes solo se barrían PENDIENTE/ENVIADO,
// así que una factura rechazada de una vez nunca entraba a este
// barrido y NUNCA disparaba la alerta — se detectó porque una
// rechazada real no avisó. Un rechazo firme no se arregla reintentando
// solo (el motivo no cambia), así que se alerta de inmediato. Este
// camino (RECHAZADO) NO se tocó en el ajuste de cadencia de arriba —
// sigue reintentando cada 2h indefinidamente, sin tope de 24h.
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INTENTOS_FASE_RAPIDA = 4;
const RUC_ALERTA = "0907388268001"; // Billennium System — cuyo SMTP se reutiliza para la alerta
const CORREO_ALERTA = "e_eguez@hotmail.com";

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { db: { schema: "facturacion" } }
    );

    const resumen = { revisadas: 0, autorizadas: 0, siguen_pendientes: 0, rechazadas_alertadas: 0, alertas_enviadas: 0, errores: [] as string[] };

    try {
        const quinceMinAtras       = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const dosHorasAtras        = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        const cuatroHorasAtras     = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
        const veinticuatroHorasAtras = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const SELECT_COLS = "id, secuencial, empresa_id, estado_sri, estado_sistema, intentos_sri, alerta_enviada, observaciones_sri, created_at, empresas(nombre, razon_social, ruc)";

        // Fase rápida (0-1h desde created_at, intentos_sri < 4): cada 15 min.
        const { data: rapidos, error: errRapidos } = await supabase
            .from("comprobantes")
            .select(SELECT_COLS)
            .eq("tipo_comprobante", "FACTURA")
            .in("estado_sri", ["PENDIENTE", "ENVIADO"])
            .neq("estado_sistema", "ANULADA")
            .lt("intentos_sri", INTENTOS_FASE_RAPIDA)
            .or(`ultimo_intento_sri.is.null,ultimo_intento_sri.lt.${quinceMinAtras}`);
        if (errRapidos) throw errRapidos;

        // Fase media (1h-24h desde created_at, intentos_sri >= 4): cada 2h.
        // Pasadas 24h desde created_at, deja de aparecer aquí — el tope de
        // created_at >= veinticuatroHorasAtras es lo que corta el
        // reintento automático para siempre (antes era indefinido). De ahí
        // en adelante, solo el botón manual "Reintentar" en Comprobantes.
        const { data: lentos, error: errLentos } = await supabase
            .from("comprobantes")
            .select(SELECT_COLS)
            .eq("tipo_comprobante", "FACTURA")
            .in("estado_sri", ["PENDIENTE", "ENVIADO"])
            .neq("estado_sistema", "ANULADA")
            .gte("intentos_sri", INTENTOS_FASE_RAPIDA)
            .gte("created_at", veinticuatroHorasAtras)
            .lt("ultimo_intento_sri", dosHorasAtras);
        if (errLentos) throw errLentos;

        // 2026-09-08: RECHAZADO también se reintenta cada 2h, no solo se
        // alerta y se abandona. El supuesto original ("un rechazo firme no
        // se arregla reintentando solo, el motivo no cambia") es cierto para
        // un rechazo real del SRI por contenido, pero NO para el caso real
        // que se detectó en producción: una caída/certificado inválido del
        // SRI (cel.sri.gob.ec) hace que sri-signer reciba una respuesta que
        // no matchea "RECIBIDA" ni "CLAVE ACCESO REGISTRADA", y ese `else`
        // clasifica cualquier respuesta rara como RECHAZADO firme — aunque
        // haya sido un problema transitorio de conexión, no del comprobante.
        // Como RECHAZADO no entraba nunca más en las consultas de arriba,
        // esas facturas quedaban huérfanas del barrido para siempre después
        // de la única alerta por correo, aunque el cron siguiera corriendo
        // cada 15 min sin ningún error. Se sigue mandando la alerta una sola
        // vez (ver más abajo), pero ahora también se reintenta indefinidamente.
        const { data: rechazadasRetry, error: errRechazadasRetry } = await supabase
            .from("comprobantes")
            .select(SELECT_COLS)
            .eq("tipo_comprobante", "FACTURA")
            .eq("estado_sri", "RECHAZADO")
            .neq("estado_sistema", "ANULADA")
            .or(`ultimo_intento_sri.is.null,ultimo_intento_sri.lt.${dosHorasAtras}`);
        if (errRechazadasRetry) throw errRechazadasRetry;

        const pendientes = [...(rapidos ?? []), ...(lentos ?? []), ...(rechazadasRetry ?? [])];
        resumen.revisadas = pendientes.length;

        for (const comp of pendientes ?? []) {
            try {
                // 1. Reintentar autorización (mismo llamado que hace el botón manual)
                const signerRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/sri-signer`, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ comprobante_id: comp.id }),
                });
                const signerData = await signerRes.json().catch(() => ({}));

                const nuevosIntentos = (comp.intentos_sri ?? 0) + 1;
                const autorizada = signerData?.authorized === true || signerData?.estado_sri === "AUTORIZADO";

                await supabase.from("comprobantes").update({
                    intentos_sri: nuevosIntentos,
                    ultimo_intento_sri: new Date().toISOString(),
                }).eq("id", comp.id);

                if (autorizada) {
                    resumen.autorizadas++;
                    continue;
                }

                resumen.siguen_pendientes++;
            } catch (e: any) {
                resumen.errores.push(`${comp.secuencial}: ${e.message}`);
            }
        }

        // 2. Facturas PENDIENTE/ENVIADO que llevan más de 4 horas desde
        //    created_at sin autorizarse → avisar (una sola vez), sin
        //    importar cuántos intentos alcanzó a hacer — así avisa aunque
        //    el SRI esté tan caído que ni siquiera haya podido reintentar.
        const { data: sinAutorizar4h, error: err4h } = await supabase
            .from("comprobantes")
            .select("id, secuencial, empresa_id, observaciones_sri, empresas(nombre, razon_social, ruc)")
            .eq("tipo_comprobante", "FACTURA")
            .in("estado_sri", ["PENDIENTE", "ENVIADO"])
            .neq("estado_sistema", "ANULADA")
            .eq("alerta_enviada", false)
            .lt("created_at", cuatroHorasAtras);
        if (err4h) throw err4h;

        for (const comp of sinAutorizar4h ?? []) {
            try {
                const enviado = await enviarAlerta(supabase, {
                    secuencial: comp.secuencial,
                    empresaNombre: (comp.empresas as any)?.razon_social || (comp.empresas as any)?.nombre || "Empresa desconocida",
                    empresaRuc: (comp.empresas as any)?.ruc || "",
                    motivo: comp.observaciones_sri || "Sin detalle disponible",
                    contexto: "no_autorizada_4h",
                });
                if (enviado) {
                    await supabase.from("comprobantes").update({ alerta_enviada: true }).eq("id", comp.id);
                    resumen.alertas_enviadas++;
                }
            } catch (e: any) {
                resumen.errores.push(`${comp.secuencial}: ${e.message}`);
            }
        }

        // 3. Rechazos firmes del SRI (estado_sri = RECHAZADO) — no entran al
        //    barrido de arriba (no tiene sentido reintentar solo, el SRI no
        //    va a cambiar de opinión sin que alguien corrija algo), así que
        //    se alertan de inmediato la primera vez que se detectan.
        const { data: rechazadas, error: errRechazadas } = await supabase
            .from("comprobantes")
            .select("id, secuencial, empresa_id, observaciones_sri, empresas(nombre, razon_social, ruc)")
            .eq("tipo_comprobante", "FACTURA")
            .eq("estado_sri", "RECHAZADO")
            .neq("estado_sistema", "ANULADA")
            .eq("alerta_enviada", false);

        if (errRechazadas) throw errRechazadas;

        for (const comp of rechazadas ?? []) {
            try {
                const enviado = await enviarAlerta(supabase, {
                    secuencial: comp.secuencial,
                    empresaNombre: (comp.empresas as any)?.razon_social || (comp.empresas as any)?.nombre || "Empresa desconocida",
                    empresaRuc: (comp.empresas as any)?.ruc || "",
                    motivo: comp.observaciones_sri || "Sin detalle disponible",
                    contexto: "rechazado",
                });
                if (enviado) {
                    await supabase.from("comprobantes").update({ alerta_enviada: true }).eq("id", comp.id);
                    resumen.rechazadas_alertadas++;
                    resumen.alertas_enviadas++;
                }
            } catch (e: any) {
                resumen.errores.push(`${comp.secuencial}: ${e.message}`);
            }
        }

        return new Response(JSON.stringify({ success: true, ...resumen }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (e: any) {
        return new Response(JSON.stringify({ success: false, error: e.message, ...resumen }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});

async function enviarAlerta(
    supabase: ReturnType<typeof createClient>,
    info: { secuencial: string; empresaNombre: string; empresaRuc: string; motivo: string; contexto: "no_autorizada_4h" | "rechazado" }
): Promise<boolean> {
    try {
        const { data: empresaAlerta } = await supabase
            .from("empresas")
            .select("config_sri")
            .eq("ruc", RUC_ALERTA)
            .single();

        const configSri = (empresaAlerta as any)?.config_sri || {};
        const mailHost = configSri.mail_host as string | undefined;
        const mailUser = configSri.mail_user as string | undefined;
        const mailPass = configSri.mail_pass as string | undefined;

        if (!mailHost || !mailUser || !mailPass) {
            console.log("[ALERTA] SMTP no configurado en la empresa de alerta — no se pudo enviar");
            return false;
        }

        const nodemailer = (await import("npm:nodemailer@6.9.13")).default;
        const transporter = nodemailer.createTransport({
            host: mailHost,
            port: Number(configSri.mail_port) || 587,
            secure: configSri.mail_ssl === true,
            auth: { user: mailUser, pass: mailPass },
            tls: { rejectUnauthorized: false },
        });

        const esRechazo = info.contexto === "rechazado";
        const asunto = esRechazo
            ? `⚠️ Factura RECHAZADA por el SRI — ${info.empresaNombre}`
            : `⚠️ Factura sin autorizar tras 4 horas — ${info.empresaNombre}`;
        const parrafoIntro = esRechazo
            ? "El SRI rechazó esta factura directamente (no quedó pendiente, no se reintenta automáticamente):"
            : "Han pasado más de 4 horas desde que se emitió esta factura y todavía no logra autorizarse en el SRI (el sistema la sigue reintentando automáticamente hasta las 24 horas; después de eso, solo con el botón manual):";

        await transporter.sendMail({
            from: `Alertas Corina ERP <${mailUser}>`,
            to: CORREO_ALERTA,
            subject: asunto,
            html: `
                <h2>Factura sin autorizar por el SRI</h2>
                <p>${parrafoIntro}</p>
                <ul>
                    <li><b>Empresa:</b> ${info.empresaNombre} (RUC ${info.empresaRuc})</li>
                    <li><b>Factura:</b> ${info.secuencial}</li>
                    <li><b>Motivo / último error:</b> ${info.motivo}</li>
                </ul>
                <p>Revísala manualmente en Facturación Electrónica antes de que el cliente se entere.</p>
            `,
        });
        return true;
    } catch (e) {
        console.error("[ALERTA] Error enviando:", e);
        return false;
    }
}
