// ============================================================
// EDGE FUNCTION: resend-factura-email — QuickInvoice
// Reenvío de correo de factura via SMTP configurable por empresa
// Deno runtime (Supabase Edge Functions)
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function toBase64(bytes: Uint8Array | ArrayBuffer): string {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let bin = "";
    u8.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin);
}

function buildEmailHtml(opts: {
    tipo: string; nombreCliente: string; identificacionCliente: string;
    nombreEmpresa: string; ruc: string; logoUrl?: string | null;
    secuencial: string; fechaFormat: string; total: string;
    extraRows?: string; accentBg?: string; accentBorder?: string;
}): string {
    const logoHtml = opts.logoUrl
        ? `<img src="${opts.logoUrl}" alt="" style="max-height:55px;max-width:180px;display:block;margin:0 auto;">`
        : `<span style="color:#fff;font-weight:800;font-size:18px;">${opts.nombreEmpresa}</span>`;
    const bg = opts.accentBg ?? "#f8faff";
    const border = opts.accentBorder ?? "#dbeafe";
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:24px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.14);">
<tr><td style="background:linear-gradient(135deg,#1e4db8 0%,#2563eb 100%);padding:28px 32px;text-align:center;">${logoHtml}</td></tr>
<tr><td style="background:#fff;padding:28px 32px 16px;text-align:center;">
  <p style="margin:0 0 6px;color:#6b7280;font-size:13px;">Estimado/a</p>
  <h2 style="margin:0 0 8px;color:#111827;font-size:20px;font-weight:700;">${opts.nombreCliente}</h2>
  <p style="margin:0;color:#6b7280;font-size:13px;">Ha recibido un documento electr&#243;nico de</p>
  <p style="margin:6px 0 0;color:#1e4db8;font-size:15px;font-weight:700;">${opts.nombreEmpresa}</p>
</td></tr>
<tr><td style="background:#fff;padding:0 32px;"><hr style="border:none;border-top:1px solid #e5e7eb;margin:0;"></td></tr>
<tr><td style="background:#fff;padding:10px 32px 0;text-align:center;">
  <span style="font-size:11px;font-weight:700;padding:4px 14px;border-radius:99px;letter-spacing:1px;color:#1e40af;background:#dbeafe;">${opts.tipo}</span>
</td></tr>
<tr><td style="background:#fff;padding:12px 32px 16px;">
  <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
    <tr style="border-bottom:1px solid #f3f4f6;"><td style="color:#6b7280;">N&#176; Comprobante</td><td align="right" style="font-weight:700;color:#111827;">${opts.secuencial}</td></tr>
    <tr style="border-bottom:1px solid #f3f4f6;"><td style="color:#6b7280;">Identificaci&#243;n</td><td align="right" style="color:#374151;">${opts.identificacionCliente}</td></tr>
    <tr${opts.extraRows ? ' style="border-bottom:1px solid #f3f4f6;"' : ""}><td style="color:#6b7280;">Fecha</td><td align="right" style="color:#374151;">${opts.fechaFormat}</td></tr>
    ${opts.extraRows ?? ""}
  </table>
</td></tr>
<tr><td style="background:${bg};padding:22px 32px;text-align:center;border-top:2px solid ${border};border-bottom:2px solid ${border};">
  <p style="margin:0 0 4px;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;">Valor Total</p>
  <p style="margin:0;color:#111827;font-size:46px;font-weight:900;line-height:1.1;">$${opts.total}</p>
</td></tr>
<tr><td style="background:#fff;padding:16px 32px;text-align:center;">
  <p style="margin:0;color:#6b7280;font-size:12px;">&#128206; Se adjuntan el <strong>RIDE en PDF</strong> y el <strong>XML autorizado</strong> por el SRI</p>
</td></tr>
<tr><td style="background:#1e3a8a;padding:18px 32px;text-align:center;">
  <p style="margin:0 0 4px;color:rgba(255,255,255,0.9);font-size:12px;font-weight:600;">${opts.nombreEmpresa} &nbsp;&middot;&nbsp; RUC: ${opts.ruc}</p>
  <p style="margin:0;color:rgba(255,255,255,0.55);font-size:10px;">Powered by QuickInvoice &nbsp;&middot;&nbsp; www.billenniumsystem.com</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

async function generarRidePdf(comprobante: any): Promise<Uint8Array> {
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const empresa = comprobante.empresas || {};
    const cliente = comprobante.clientes || {};
    const detalles = comprobante.comprobante_detalles || [];
    const pagos = comprobante.comprobante_pagos || [];
    const configSri = empresa.config_sri || {};

    let y = 10;

    // === LOGO ===
    let logoLoaded = false;
    if (empresa.logo_url) {
        try {
            const resp = await fetch(empresa.logo_url);
            const buf = await resp.arrayBuffer();
            const imgB64 = toBase64(new Uint8Array(buf));
            const ext = empresa.logo_url.toLowerCase().includes('.png') ? 'PNG' : 'JPEG';
            doc.addImage(imgB64, ext, 10, y, 40, 20);
            logoLoaded = true;
        } catch { /* logo no disponible */ }
    }

    // === EMPRESA ===
    const infoX = logoLoaded ? 55 : 10;
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text((empresa.razon_social || empresa.nombre || 'EMPRESA').toUpperCase(), infoX, y + 6);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`RUC: ${empresa.ruc || ''}`, infoX, y + 12);
    doc.text(`Dir: ${empresa.direccion || ''}`, infoX, y + 17);
    if (empresa.telefono) doc.text(`Tel: ${empresa.telefono}`, infoX, y + 22);

    // === FACTURA HEADER (derecha) ===
    doc.setFillColor(30, 77, 184);
    doc.rect(135, y, 65, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('FACTURA', 167, y + 6, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Nro: ${comprobante.secuencial}`, 136, y + 14);
    const fechaRawPdf = new Date(comprobante.created_at);
    const fechaEcuadorPdf = new Date(fechaRawPdf.getTime() - 5 * 60 * 60 * 1000);
    doc.text(`Fecha: ${fechaEcuadorPdf.toLocaleDateString('es-EC')}`, 136, y + 19);
    doc.text(`Ambiente: ${configSri.ambiente || 'PRUEBAS'}`, 136, y + 24);

    y = 38;

    // === CLAVE DE ACCESO ===
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('CLAVE DE ACCESO:', 10, y);
    doc.setFont('helvetica', 'normal');
    doc.text((comprobante.clave_acceso || '').substring(0, 80), 10, y + 4);
    y += 12;

    doc.setDrawColor(180);
    doc.line(10, y, 200, y);
    y += 5;

    // === CLIENTE ===
    doc.setFontSize(8);
    doc.setFillColor(240, 240, 240);
    doc.rect(10, y, 190, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.text('DATOS DEL COMPRADOR', 12, y + 4);
    y += 8;
    doc.setFont('helvetica', 'normal');
    doc.text(`Razón Social: ${(cliente.nombre || 'CONSUMIDOR FINAL').toUpperCase()}`, 12, y);
    y += 5;
    doc.text(`Identificación: ${cliente.identificacion || '9999999999999'}`, 12, y);
    y += 5;
    doc.text(`Dirección: ${(cliente.direccion || 'ECUADOR').toUpperCase()}`, 12, y);
    y += 8;

    doc.line(10, y, 200, y);
    y += 5;

    // === TABLA DETALLES ===
    doc.setFillColor(30, 77, 184);
    doc.rect(10, y, 190, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('DESCRIPCIÓN', 12, y + 5);
    doc.text('CANT', 92, y + 5, { align: 'right' });
    doc.text('P.UNIT S/IVA', 127, y + 5, { align: 'right' });
    doc.text('SUBTOTAL', 155, y + 5, { align: 'right' });
    doc.text('IVA', 175, y + 5, { align: 'right' });
    doc.text('TOTAL', 200, y + 5, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    y += 8;

    detalles.forEach((d: any, i: number) => {
        if (i % 2 === 0) { doc.setFillColor(248, 250, 252); doc.rect(10, y - 2, 190, 6, 'F'); }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        const subtotalLinea = Number(d.subtotal || 0);
        const ivaLinea = Number(d.iva_valor || 0);
        const totalLinea = subtotalLinea + ivaLinea;
        doc.text((d.nombre_producto || 'PRODUCTO').toUpperCase().substring(0, 48), 12, y + 2);
        doc.text(Number(d.cantidad).toFixed(2), 92, y + 2, { align: 'right' });
        doc.text(`$${Number(d.precio_unitario).toFixed(4)}`, 127, y + 2, { align: 'right' });
        doc.text(`$${subtotalLinea.toFixed(2)}`, 155, y + 2, { align: 'right' });
        doc.text(`$${ivaLinea.toFixed(2)}`, 175, y + 2, { align: 'right' });
        doc.text(`$${totalLinea.toFixed(2)}`, 200, y + 2, { align: 'right' });
        y += 6;
        if (y > 265) { doc.addPage(); y = 15; }
    });

    y += 3;
    doc.setDrawColor(180);
    doc.line(140, y, 200, y);
    y += 5;

    // === DESGLOSE IVA POR TARIFA ===
    const ivaMap = new Map<number, { base: number; iva: number }>();
    detalles.forEach((d: any) => {
        const rate = Math.round(Number(d.iva_porcentaje ?? 0));
        const prev = ivaMap.get(rate) ?? { base: 0, iva: 0 };
        ivaMap.set(rate, { base: prev.base + Number(d.subtotal ?? 0), iva: prev.iva + Number(d.iva_valor ?? 0) });
    });
    const ratesConIva = [...ivaMap.keys()].filter(r => r > 0).sort((a, b) => a - b);
    const base0 = ivaMap.get(0)?.base ?? 0;
    const subtotalSinImp = [...ivaMap.values()].reduce((s, v) => s + v.base, 0);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    ratesConIva.forEach(rate => {
        const e = ivaMap.get(rate)!;
        doc.text(`Subtotal Base IVA ${rate}%:`, 141, y);
        doc.text(`$${e.base.toFixed(2)}`, 200, y, { align: 'right' });
        y += 5;
    });
    if (base0 > 0 || ratesConIva.length === 0) {
        doc.text(`Subtotal Base 0%:`, 141, y);
        doc.text(`$${base0.toFixed(2)}`, 200, y, { align: 'right' });
        y += 5;
    }
    doc.text(`Subtotal sin Impuestos:`, 141, y);
    doc.text(`$${subtotalSinImp.toFixed(2)}`, 200, y, { align: 'right' });
    y += 5;
    ratesConIva.forEach(rate => {
        const e = ivaMap.get(rate)!;
        doc.text(`IVA ${rate}%:`, 141, y);
        doc.text(`$${e.iva.toFixed(2)}`, 200, y, { align: 'right' });
        y += 5;
    });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(30, 77, 184);
    doc.rect(139, y - 3, 62, 9, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(`VALOR TOTAL:`, 141, y + 3);
    doc.text(`$${Number(comprobante.total).toFixed(2)}`, 199, y + 3, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    y += 12;

    // === PAGOS ===
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    if (pagos.length > 0) {
        const pagoTexto = pagos.map((p: any) => `${(p.metodo_pago || '').replace(/_/g, ' ')} $${Number(p.valor).toFixed(2)}`).join(' | ');
        doc.text(`Forma de Pago: ${pagoTexto}`, 10, y);
        y += 8;
    }

    // === AUTORIZACIÓN ===
    doc.setDrawColor(180);
    doc.line(10, y, 200, y);
    y += 4;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('Nº AUTORIZACIÓN SRI:', 10, y);
    doc.setFont('helvetica', 'normal');
    doc.text(comprobante.autorizacion_numero || '—', 10, y + 5);
    y += 14;
    doc.setFontSize(7);
    doc.setTextColor(100);
    doc.text('Este documento es una representación impresa de un Comprobante Electrónico (RIDE).', 105, y, { align: 'center', maxWidth: 190 });
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 77, 184);
    doc.text('www.billenniumsystem.com', 105, y, { align: 'center' });

    return new Uint8Array(doc.output('arraybuffer'));
}

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const { comprobante_id } = await req.json();
        if (!comprobante_id) throw new Error("comprobante_id es requerido");

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
            { db: { schema: "facturacion" } }
        );

        const { data: comprobante, error } = await supabase
            .from("comprobantes")
            .select(`
                *,
                clientes (*),
                empresas (*),
                comprobante_detalles (*),
                comprobante_pagos (*)
            `)
            .eq("id", comprobante_id)
            .single();

        if (error || !comprobante) throw new Error("Comprobante no encontrado");
        if (!comprobante.clientes?.email) throw new Error("El cliente no tiene email registrado");
        if (comprobante.estado_sri !== "AUTORIZADO") throw new Error("Solo se pueden reenviar comprobantes autorizados por el SRI");

        const configSri = comprobante.empresas?.config_sri || {};
        const mailHost = configSri.mail_host as string | undefined;
        const mailUser = configSri.mail_user as string | undefined;
        const mailPass = configSri.mail_pass as string | undefined;

        if (!mailHost || !mailUser || !mailPass) {
            throw new Error("El servidor SMTP no está configurado. Configure el correo en Configuración SRI.");
        }

        const nombreCliente = (comprobante.clientes?.nombre || "CONSUMIDOR FINAL").toUpperCase();
        const identificacionCliente = comprobante.clientes?.identificacion || "9999999999999";
        const nombreEmpresa = (comprobante.empresas?.nombre || comprobante.empresas?.razon_social || "La Empresa").toUpperCase();
        const fechaRaw = new Date(comprobante.created_at);
        const fechaEcuador = new Date(fechaRaw.getTime() - 5 * 60 * 60 * 1000);
        const fechaFormat = fechaEcuador.toLocaleDateString("es-EC");

        const emailHtml = buildEmailHtml({
            tipo: "FACTURA ELECTRÓNICA",
            nombreCliente,
            identificacionCliente,
            nombreEmpresa,
            ruc: comprobante.empresas?.ruc || "",
            logoUrl: comprobante.empresas?.logo_url || null,
            secuencial: comprobante.secuencial,
            fechaFormat,
            total: Number(comprobante.total).toFixed(2),
        });

        // ── Generar PDF ──
        let pdfB64: string | null = null;
        try {
            const ridePdfBytes = await generarRidePdf(comprobante);
            let pdfBin = '';
            const chunkPdf = 8192;
            for (let i = 0; i < ridePdfBytes.length; i += chunkPdf) {
                pdfBin += String.fromCharCode(...ridePdfBytes.subarray(i, Math.min(i + chunkPdf, ridePdfBytes.length)));
            }
            pdfB64 = btoa(pdfBin);
        } catch (pdfErr) {
            console.error("[RESEND EMAIL] Error generando PDF:", pdfErr);
        }

        const attachments: any[] = [];
        if (pdfB64) {
            attachments.push({
                filename: `RIDE_${comprobante.secuencial}.pdf`,
                content: pdfB64,
                encoding: 'base64',
                contentType: 'application/pdf',
            });
        }
        if (comprobante.xml_firmado) {
            attachments.push({
                filename: `${comprobante.secuencial}.xml`,
                content: comprobante.xml_firmado,
                contentType: 'application/xml; charset=utf-8',
            });
        }

        // ── Enviar vía SMTP (nodemailer) ──
        const nodemailer = (await import("npm:nodemailer@6.9.13")).default;
        const transporter = nodemailer.createTransport({
            host: mailHost,
            port: Number(configSri.mail_port) || 587,
            secure: configSri.mail_ssl === true,
            auth: { user: mailUser, pass: mailPass },
            tls: { rejectUnauthorized: false },
        });

        await transporter.sendMail({
            from: `Facturación ${nombreEmpresa} <${mailUser}>`,
            to: comprobante.clientes.email,
            cc: (configSri.mail_cc as string | undefined) || undefined,
            subject: `Factura Autorizada ${comprobante.secuencial} - ${nombreEmpresa}`,
            html: emailHtml,
            attachments,
        });

        console.log("[RESEND EMAIL] Enviado a:", comprobante.clientes.email);

        return new Response(
            JSON.stringify({ success: true, message: `Correo enviado a ${comprobante.clientes.email}` }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (e: any) {
        console.error("[resend-factura-email] ERROR:", e.message);
        return new Response(
            JSON.stringify({ success: false, error: e.message }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
    }
});
