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

    let subtotalBase = 0, totalIva = 0;
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
        subtotalBase += subtotalLinea;
        totalIva += ivaLinea;
        y += 6;
        if (y > 265) { doc.addPage(); y = 15; }
    });

    y += 3;
    doc.line(140, y, 200, y);
    y += 5;

    // === TOTALES ===
    doc.setFontSize(8);
    doc.text(`Subtotal sin IVA:`, 141, y);
    doc.text(`$${subtotalBase.toFixed(2)}`, 200, y, { align: 'right' });
    y += 5;
    doc.text(`IVA:`, 141, y);
    doc.text(`$${totalIva.toFixed(2)}`, 200, y, { align: 'right' });
    y += 5;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL:`, 141, y);
    doc.text(`$${Number(comprobante.total).toFixed(2)}`, 200, y, { align: 'right' });
    y += 8;

    // === PAGOS ===
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    if (pagos.length > 0) {
        const pagoTexto = pagos.map((p: any) => `${(p.metodo_pago || '').replace('_', ' ')} $${Number(p.valor).toFixed(2)}`).join(' | ');
        doc.text(`Forma de Pago: ${pagoTexto}`, 10, y);
        y += 8;
    }

    // === AUTORIZACIÓN ===
    doc.line(10, y, 200, y);
    y += 5;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('Nº AUTORIZACIÓN:', 10, y);
    doc.setFont('helvetica', 'normal');
    doc.text(comprobante.autorizacion_numero || '', 10, y + 4);
    y += 12;
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text('Este documento es una representación impresa de un Comprobante Electrónico (RIDE)', 10, y, { maxWidth: 190 });

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

        const emailHtml = `<div style="font-family: Arial, sans-serif; padding: 20px;">
  <h2>Factura Electrónica Autorizada</h2>
  <p>Estimado/a <strong>${nombreCliente}</strong>,</p>
  <p>Su factura <strong>${comprobante.secuencial}</strong> del ${fechaFormat} fue <strong style="color:green">AUTORIZADA</strong> por el SRI.</p>
  <p><b>Identificación:</b> ${identificacionCliente}<br><b>Total:</b> $${Number(comprobante.total).toFixed(2)}</p>
  <p>Se adjuntan el RIDE (PDF) y el XML firmado autorizado por el SRI.</p>
  <p>Atentamente,<br><strong>${nombreEmpresa}</strong></p>
</div>`;

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
