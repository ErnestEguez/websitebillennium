// ============================================================
// EDGE FUNCTION: sri-retry-facturas — QuickInvoice
// Barrido automático (llamado por pg_cron cada 15 min) de facturas
// no autorizadas: reintenta sri-signer hasta MAX_INTENTOS veces;
// al agotarse sin autorizar, avisa por correo (SMTP de la empresa
// Billennium System, RUC 0907388268001) sin importar de qué
// empresa cliente sea la factura.
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_INTENTOS = 8;
const RUC_ALERTA = "0907388268001"; // Billennium System — cuyo SMTP se reutiliza para la alerta
const CORREO_ALERTA = "billenniumsystem@gmail.com";

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { db: { schema: "facturacion" } }
    );

    const resumen = { revisadas: 0, autorizadas: 0, siguen_pendientes: 0, alertas_enviadas: 0, errores: [] as string[] };

    try {
        const quinceMinAtras = new Date(Date.now() - 15 * 60 * 1000).toISOString();

        const { data: pendientes, error: errQuery } = await supabase
            .from("comprobantes")
            .select("id, secuencial, empresa_id, estado_sri, estado_sistema, intentos_sri, alerta_enviada, observaciones_sri, empresas(nombre, razon_social, ruc)")
            .eq("tipo_comprobante", "FACTURA")
            .in("estado_sri", ["PENDIENTE", "ENVIADO"])
            .neq("estado_sistema", "ANULADA")
            .lt("intentos_sri", MAX_INTENTOS)
            .or(`ultimo_intento_sri.is.null,ultimo_intento_sri.lt.${quinceMinAtras}`);

        if (errQuery) throw errQuery;

        resumen.revisadas = pendientes?.length ?? 0;

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

                // 2. Se agotaron los intentos sin autorizar → avisar (una sola vez)
                if (nuevosIntentos >= MAX_INTENTOS && !comp.alerta_enviada) {
                    const enviado = await enviarAlerta(supabase, {
                        secuencial: comp.secuencial,
                        empresaNombre: (comp.empresas as any)?.razon_social || (comp.empresas as any)?.nombre || "Empresa desconocida",
                        empresaRuc: (comp.empresas as any)?.ruc || "",
                        motivo: signerData?.error || signerData?.message || comp.observaciones_sri || "Sin detalle disponible",
                    });
                    if (enviado) {
                        await supabase.from("comprobantes").update({ alerta_enviada: true }).eq("id", comp.id);
                        resumen.alertas_enviadas++;
                    }
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
    info: { secuencial: string; empresaNombre: string; empresaRuc: string; motivo: string }
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

        await transporter.sendMail({
            from: `Alertas QuickInvoice <${mailUser}>`,
            to: CORREO_ALERTA,
            subject: `⚠️ Factura NO autorizada tras ${MAX_INTENTOS} intentos — ${info.empresaNombre}`,
            html: `
                <h2>Factura sin autorizar por el SRI</h2>
                <p>Después de ${MAX_INTENTOS} intentos automáticos, esta factura no logró autorizarse:</p>
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
