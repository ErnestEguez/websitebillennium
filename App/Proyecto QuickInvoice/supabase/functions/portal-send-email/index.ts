// Envía correos del Portal (cotizaciones de la calculadora) vía la API de
// Resend (HTTPS, no SMTP) — mismo servicio y misma RESEND_API_KEY que ya
// usa factura-electronica/index.ts. Se cambió de SMTP2GO/nodemailer a
// esto porque el correo se marcaba como "enviado" sin ningún error pero
// nunca llegaba a destino (ni siquiera pudimos ver el log de SMTP2GO —
// la cuenta la administra un revendedor/hosting, sin panel propio). La
// API de Resend da error explícito si algo falla, nada de fallos mudos.
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-portal-secret",
};

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const secretEsperado = Deno.env.get("PORTAL_EMAIL_SECRET");
        const secretRecibido = req.headers.get("x-portal-secret");
        if (!secretEsperado || secretRecibido !== secretEsperado) {
            return new Response(JSON.stringify({ error: "No autorizado" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const { destinatario, asunto, cuerpo, cc } = await req.json();
        if (!destinatario || !asunto || !cuerpo) {
            return new Response(JSON.stringify({ error: "Faltan destinatario/asunto/cuerpo" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        if (!resendApiKey) {
            return new Response(JSON.stringify({ error: "RESEND_API_KEY no configurado" }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const resendFrom = Deno.env.get("PORTAL_RESEND_FROM") || "Billennium System <onboarding@resend.dev>";
        // white-space: pre-line no es confiable en todos los webmail
        // (Outlook/Hotmail suele limpiar ese CSS y el texto queda pegado
        // en un solo párrafo) — se convierten los saltos de línea a <br>
        // reales, que sí respeta cualquier cliente de correo.
        const escapado = cuerpo
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        const cuerpoHtml = `<div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.5;">${escapado.replace(/\n/g, "<br>")}</div>`;

        const resendRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${resendApiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from: resendFrom,
                to: destinatario,
                cc: cc || undefined,
                subject: asunto,
                html: cuerpoHtml,
                text: cuerpo,
            }),
        });

        const resendResult = await resendRes.json();
        if (!resendRes.ok) {
            console.error("[portal-send-email] Resend error:", JSON.stringify(resendResult));
            return new Response(JSON.stringify({ error: resendResult }), {
                status: 502,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        return new Response(JSON.stringify({ ok: true, id: resendResult.id }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (e) {
        console.error("[portal-send-email] Error:", e);
        return new Response(JSON.stringify({ error: String(e) }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
