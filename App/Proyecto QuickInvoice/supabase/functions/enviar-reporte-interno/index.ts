// ============================================================
// EDGE FUNCTION: enviar-reporte-interno — QuickInvoice
// Envío genérico de un reporte HTML interno (ej. Cierre de Caja General) al
// correo del usuario logueado, vía el mismo SMTP configurable por empresa
// que ya usa resend-factura-email (empresas.config_sri.mail_*).
// Deno runtime (Supabase Edge Functions)
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const { empresa_id, destinatario, asunto, html } = await req.json();
        if (!empresa_id || !destinatario || !asunto || !html) {
            throw new Error("Faltan empresa_id/destinatario/asunto/html");
        }

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
            { db: { schema: "facturacion" } }
        );

        const { data: empresa, error } = await supabase
            .from("empresas")
            .select("nombre, config_sri")
            .eq("id", empresa_id)
            .single();
        if (error || !empresa) throw new Error("Empresa no encontrada");

        const configSri = empresa.config_sri || {};
        const mailHost = configSri.mail_host as string | undefined;
        const mailUser = configSri.mail_user as string | undefined;
        const mailPass = configSri.mail_pass as string | undefined;
        if (!mailHost || !mailUser || !mailPass) {
            throw new Error("El servidor SMTP no está configurado. Configure el correo en Configuración SRI.");
        }

        const nombreEmpresa = empresa.nombre || "La Empresa";

        const nodemailer = (await import("npm:nodemailer@6.9.13")).default;
        const transporter = nodemailer.createTransport({
            host: mailHost,
            port: Number(configSri.mail_port) || 587,
            secure: configSri.mail_ssl === true,
            auth: { user: mailUser, pass: mailPass },
            tls: { rejectUnauthorized: false },
        });

        await transporter.sendMail({
            from: `${nombreEmpresa} <${mailUser}>`,
            to: destinatario,
            cc: (configSri.mail_cc as string | undefined) || undefined,
            subject: asunto,
            html,
        });

        console.log("[enviar-reporte-interno] Enviado a:", destinatario);

        return new Response(
            JSON.stringify({ success: true, message: `Correo enviado a ${destinatario}` }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (e: any) {
        console.error("[enviar-reporte-interno] ERROR:", e.message);
        return new Response(
            JSON.stringify({ success: false, error: e.message }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
    }
});
