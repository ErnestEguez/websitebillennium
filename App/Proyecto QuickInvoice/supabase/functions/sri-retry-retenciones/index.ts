// ============================================================
// EDGE FUNCTION: sri-retry-retenciones — QuickInvoice
// Barrido automático (llamado por pg_cron cada 15 min) de comprobantes
// de retención de compras no autorizados: reintenta sri-retencion cada
// 15 min hasta MAX_INTENTOS veces (~2h); al agotarse, avisa por correo
// UNA vez pero SIGUE reintentando indefinidamente cada 2 horas — mismo
// patrón que sri-retry-facturas (ver ese archivo), aplicado a
// facturacion.retenciones_compras en vez de comprobantes.
//
// Nota: retenciones_compras guarda UNA FILA POR LÍNEA (tipo FUENTE/IVA),
// no una por comprobante — varias filas comparten compra_id o
// liquidacion_id. Este barrido agrupa (dedupe) por ese identificador
// para no reintentar el mismo comprobante dos veces, y al actualizar
// intentos_sri/ultimo_intento_sri lo hace sobre TODAS las filas del
// grupo a la vez (igual que ya hace sri-retencion en su UPDATE final),
// para no desincronizar el conteo entre filas hermanas.
//
// Archivo nuevo e independiente — no modifica sri-retry-facturas ni la
// tabla comprobantes, cero riesgo para la facturación electrónica.
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_INTENTOS = 8;
const RUC_ALERTA = "0907388268001"; // Billennium System — cuyo SMTP se reutiliza para la alerta
const CORREO_ALERTA = "e_eguez@hotmail.com";

type RetRow = {
    compra_id: string | null;
    liquidacion_id: string | null;
    empresa_id: string;
    numero_retencion: string | null;
    estado_sri: string;
    intentos_sri: number | null;
    alerta_enviada: boolean;
    observaciones_sri: string | null;
    empresas: { nombre: string; razon_social: string; ruc: string } | null;
};

// Una misma retención (comprobante) tiene varias filas — una por tipo
// FUENTE/IVA — que comparten compra_id o liquidacion_id. Nos quedamos con
// una fila representativa por comprobante para no reintentar dos veces.
function dedupePorDocumento(rows: RetRow[]): RetRow[] {
    const vistos = new Set<string>();
    const out: RetRow[] = [];
    for (const r of rows) {
        const key = r.compra_id ? `c:${r.compra_id}` : `l:${r.liquidacion_id}`;
        if (vistos.has(key)) continue;
        vistos.add(key);
        out.push(r);
    }
    return out;
}

function filtroDocumento(ret: RetRow) {
    return ret.compra_id ? { compra_id: ret.compra_id } : { liquidacion_id: ret.liquidacion_id };
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { db: { schema: "facturacion" } }
    );

    const resumen = { revisadas: 0, autorizadas: 0, siguen_pendientes: 0, rechazadas_alertadas: 0, alertas_enviadas: 0, errores: [] as string[] };

    try {
        const quinceMinAtras = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const dosHorasAtras  = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        const SELECT_COLS = "compra_id, liquidacion_id, empresa_id, numero_retencion, estado_sri, intentos_sri, alerta_enviada, observaciones_sri, empresas(nombre, razon_social, ruc)";

        // Fase rápida (intentos_sri < MAX_INTENTOS): cada 15 min, igual que facturas.
        const { data: rapidosRaw, error: errRapidos } = await supabase
            .from("retenciones_compras")
            .select(SELECT_COLS)
            .in("estado_sri", ["NO_FIRMADA", "ENVIADO"])
            .neq("estado", "ANULADO")
            .lt("intentos_sri", MAX_INTENTOS)
            .or(`ultimo_intento_sri.is.null,ultimo_intento_sri.lt.${quinceMinAtras}`);
        if (errRapidos) throw errRapidos;

        // Fase lenta (intentos_sri >= MAX_INTENTOS): ya se avisó una vez por
        // correo, pero sigue reintentando cada 2 horas indefinidamente.
        const { data: lentosRaw, error: errLentos } = await supabase
            .from("retenciones_compras")
            .select(SELECT_COLS)
            .in("estado_sri", ["NO_FIRMADA", "ENVIADO"])
            .neq("estado", "ANULADO")
            .gte("intentos_sri", MAX_INTENTOS)
            .lt("ultimo_intento_sri", dosHorasAtras);
        if (errLentos) throw errLentos;

        const rapidos = dedupePorDocumento((rapidosRaw ?? []) as unknown as RetRow[]);
        const lentos  = dedupePorDocumento((lentosRaw  ?? []) as unknown as RetRow[]);
        const pendientes = [...rapidos, ...lentos];
        resumen.revisadas = pendientes.length;

        for (const ret of pendientes) {
            try {
                // 1. Reintentar autorización (mismo llamado que hace el botón manual)
                const signerRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/sri-retencion`, {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        compra_id:      ret.compra_id ?? undefined,
                        liquidacion_id: ret.liquidacion_id ?? undefined,
                        empresa_id:     ret.empresa_id,
                    }),
                });
                const signerData = await signerRes.json().catch(() => ({}));

                const nuevosIntentos = (ret.intentos_sri ?? 0) + 1;
                const autorizada = signerData?.authorized === true || signerData?.estado_sri === "AUTORIZADO";

                await supabase.from("retenciones_compras").update({
                    intentos_sri: nuevosIntentos,
                    ultimo_intento_sri: new Date().toISOString(),
                }).match(filtroDocumento(ret)).eq("empresa_id", ret.empresa_id);

                if (autorizada) {
                    resumen.autorizadas++;
                    continue;
                }

                resumen.siguen_pendientes++;

                // 2. Se agotaron los intentos sin autorizar → avisar (una sola vez)
                if (nuevosIntentos >= MAX_INTENTOS && !ret.alerta_enviada) {
                    const enviado = await enviarAlerta(supabase, {
                        secuencial: ret.numero_retencion || "(sin número)",
                        empresaNombre: ret.empresas?.razon_social || ret.empresas?.nombre || "Empresa desconocida",
                        empresaRuc: ret.empresas?.ruc || "",
                        motivo: signerData?.error || signerData?.message || ret.observaciones_sri || "Sin detalle disponible",
                        contexto: "reintentos_agotados",
                    });
                    if (enviado) {
                        await supabase.from("retenciones_compras").update({ alerta_enviada: true })
                            .match(filtroDocumento(ret)).eq("empresa_id", ret.empresa_id);
                        resumen.alertas_enviadas++;
                    }
                }
            } catch (e: any) {
                resumen.errores.push(`${ret.numero_retencion ?? ret.compra_id ?? ret.liquidacion_id}: ${e.message}`);
            }
        }

        // 3. Rechazos firmes del SRI (estado_sri = RECHAZADO) — no entran al
        //    barrido de arriba (no tiene sentido reintentar solo, el SRI no
        //    va a cambiar de opinión sin que alguien corrija algo), así que
        //    se alertan de inmediato la primera vez que se detectan.
        const { data: rechazadasRaw, error: errRechazadas } = await supabase
            .from("retenciones_compras")
            .select("compra_id, liquidacion_id, empresa_id, numero_retencion, observaciones_sri, alerta_enviada, empresas(nombre, razon_social, ruc)")
            .eq("estado_sri", "RECHAZADO")
            .neq("estado", "ANULADO")
            .eq("alerta_enviada", false);
        if (errRechazadas) throw errRechazadas;

        const rechazadas = dedupePorDocumento((rechazadasRaw ?? []) as unknown as RetRow[]);

        for (const ret of rechazadas) {
            try {
                const enviado = await enviarAlerta(supabase, {
                    secuencial: ret.numero_retencion || "(sin número)",
                    empresaNombre: ret.empresas?.razon_social || ret.empresas?.nombre || "Empresa desconocida",
                    empresaRuc: ret.empresas?.ruc || "",
                    motivo: ret.observaciones_sri || "Sin detalle disponible",
                    contexto: "rechazado",
                });
                if (enviado) {
                    await supabase.from("retenciones_compras").update({ alerta_enviada: true })
                        .match(filtroDocumento(ret)).eq("empresa_id", ret.empresa_id);
                    resumen.rechazadas_alertadas++;
                    resumen.alertas_enviadas++;
                }
            } catch (e: any) {
                resumen.errores.push(`${ret.numero_retencion ?? ret.compra_id ?? ret.liquidacion_id}: ${e.message}`);
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
    info: { secuencial: string; empresaNombre: string; empresaRuc: string; motivo: string; contexto: "reintentos_agotados" | "rechazado" }
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
            ? `⚠️ Retención RECHAZADA por el SRI — ${info.empresaNombre}`
            : `⚠️ Retención NO autorizada tras ${MAX_INTENTOS} intentos — ${info.empresaNombre}`;
        const parrafoIntro = esRechazo
            ? "El SRI rechazó este comprobante de retención directamente (no quedó pendiente, no se reintenta automáticamente):"
            : `Después de ${MAX_INTENTOS} intentos automáticos, este comprobante de retención no logró autorizarse:`;

        await transporter.sendMail({
            from: `Alertas Corina ERP <${mailUser}>`,
            to: CORREO_ALERTA,
            subject: asunto,
            html: `
                <h2>Retención de compra sin autorizar por el SRI</h2>
                <p>${parrafoIntro}</p>
                <ul>
                    <li><b>Empresa:</b> ${info.empresaNombre} (RUC ${info.empresaRuc})</li>
                    <li><b>Retención:</b> ${info.secuencial}</li>
                    <li><b>Motivo / último error:</b> ${info.motivo}</li>
                </ul>
                <p>Revísala manualmente en Compras → Retenciones antes de que el proveedor la reclame.</p>
            `,
        });
        return true;
    } catch (e) {
        console.error("[ALERTA] Error enviando:", e);
        return false;
    }
}
