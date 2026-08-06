// Envía correos del Portal (cotizaciones de la calculadora) vía SMTP2GO,
// usando el mismo transporte (Deno + nodemailer) que ya usa sri-signer
// para las facturas — comprobado que SÍ entrega. El backend del Portal
// corre en Python sobre Vercel, donde las conexiones SMTP directas por
// puerto 587 quedan bloqueadas/restringidas sin lanzar ningún error
// visible (el envío "parece" exitoso pero nunca llega). En vez de pelear
// contra esa restricción, el Portal llama a este Edge Function por HTTPS
// (nunca bloqueado) y este sí abre la conexión SMTP real.
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

        const mailHost = Deno.env.get("PORTAL_SMTP_HOST") || "mail.smtp2go.com";
        const mailPort = Number(Deno.env.get("PORTAL_SMTP_PORT") || "587");
        const mailUser = Deno.env.get("PORTAL_SMTP_USER");
        const mailPass = Deno.env.get("PORTAL_SMTP_PASSWORD");

        if (!mailUser || !mailPass) {
            return new Response(JSON.stringify({ error: "SMTP no configurado (faltan secrets PORTAL_SMTP_USER / PORTAL_SMTP_PASSWORD)" }), {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const nodemailer = (await import("npm:nodemailer@6.9.13")).default;
        const transporter = nodemailer.createTransport({
            host: mailHost,
            port: mailPort,
            secure: false,
            auth: { user: mailUser, pass: mailPass },
            tls: { rejectUnauthorized: false },
        });

        await transporter.sendMail({
            from: `Billennium System <${mailUser}>`,
            to: destinatario,
            cc: cc || undefined,
            subject: asunto,
            text: cuerpo,
        });

        return new Response(JSON.stringify({ ok: true }), {
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
