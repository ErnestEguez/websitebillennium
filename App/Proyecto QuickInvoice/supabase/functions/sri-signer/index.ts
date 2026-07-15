// ============================================================
// EDGE FUNCTION: sri-signer — QuickInvoice
// Firma XAdES-BES, envía al SRI, genera RIDE PDF y notifica por Resend
// Deno runtime (Supabase Edge Functions)
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
// @deno-types="https://esm.sh/forge@0.10.0/dist/forge.min.d.ts"
import forge from "npm:node-forge@1.3.1";
// @deno-types="https://esm.sh/jspdf@2.5.1/dist/jspdf.es.min.d.ts"
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";
import generarXml   from "./xmlGenerator.ts";
import generarXmlLC from "./xmlGeneratorLC.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

// ─── Helpers ────────────────────────────────────────────────

function toBase64(bytes: Uint8Array | ArrayBuffer): string {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let bin = "";
    u8.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin);
}

async function sha1b64(input: string | Uint8Array): Promise<string> {
    const md = forge.md.sha1.create();
    if (typeof input === "string") {
        md.update(input, "utf8");
    } else {
        md.update(forge.util.binary.raw.encode(input));
    }
    return btoa(md.digest().getBytes());
}

function hexToB64(hex: string): string {
    if (hex.length % 2 !== 0) hex = '0' + hex;
    const binary = hex.match(/.{1,2}/g)?.map(byte => String.fromCharCode(parseInt(byte, 16))).join('') || '';
    return btoa(binary);
}

// ─── Email HTML Builder ──────────────────────────────

function buildEmailHtml(opts: {
    tipo: string; nombreCliente: string; identificacionCliente: string;
    nombreEmpresa: string; ruc: string; logoUrl?: string | null;
    secuencial: string; fechaFormat: string; total: string;
    ambiente?: string;
    extraRows?: string; accentBg?: string; accentBorder?: string;
}): string {
    const logoHtml = opts.logoUrl
        ? `<img src="${opts.logoUrl}" alt="" style="max-height:55px;max-width:180px;display:block;margin:0 auto;">`
        : `<span style="color:#fff;font-weight:800;font-size:18px;">${opts.nombreEmpresa}</span>`;
    const bg = opts.accentBg ?? "#f8faff";
    const border = opts.accentBorder ?? "#dbeafe";
    const esPrueba = (opts.ambiente ?? 'PRUEBAS') !== 'PRODUCCION';
    const ambienteBadge = esPrueba
        ? `<span style="display:inline-block;margin-top:12px;background:#f59e0b;color:#fff;padding:4px 16px;border-radius:20px;font-size:10px;font-weight:800;letter-spacing:1.5px;">&#9888; AMBIENTE DE PRUEBAS</span>`
        : `<span style="display:inline-block;margin-top:12px;background:#10b981;color:#fff;padding:4px 16px;border-radius:20px;font-size:10px;font-weight:800;letter-spacing:1.5px;">&#10003; PRODUCCI&#211;N</span>`;
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:24px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.14);">
<tr><td style="background:linear-gradient(135deg,#1e4db8 0%,#2563eb 100%);padding:24px 32px 20px;text-align:center;">
  ${logoHtml}
  <p style="margin:14px 0 4px;color:rgba(255,255,255,0.75);font-size:11px;letter-spacing:0.5px;text-transform:uppercase;">Documento electr&#243;nico para</p>
  <p style="margin:0;color:#ffffff;font-size:17px;font-weight:700;">${opts.nombreCliente}</p>
  ${ambienteBadge}
</td></tr>
<tr><td style="background:#fff;padding:20px 32px 16px;text-align:center;">
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

// ─── RIDE PDF Generator (jsPDF) — replica fiel de InvoicePrint.tsx ────────────

async function generarRidePdf(comprobante: any): Promise<Uint8Array> {
    const empresa  = comprobante.empresas  || {};
    const cliente  = comprobante.clientes  || {};
    const detalles: any[] = comprobante.comprobante_detalles || [];
    const pagos:    any[] = comprobante.comprobante_pagos    || [];

    const r2 = (n: any) => Math.round(Number(n ?? 0) * 100) / 100;
    const f2 = (n: any) => r2(n).toFixed(2);
    const f4 = (n: any) => Number(n ?? 0).toFixed(4);
    const fmtDate = (d: any): string => {
        if (!d) return '';
        const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d);
    };
    const fmtDT = (d: any): string => {
        if (!d) return 'PENDIENTE';
        try {
            const dt = new Date(d);
            if (isNaN(dt.getTime())) return 'PENDIENTE';
            const p = (n: number) => String(n).padStart(2, '0');
            return `${dt.getFullYear()}-${p(dt.getMonth()+1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}:${p(dt.getSeconds())}`;
        } catch { return 'PENDIENTE'; }
    };

    // IVA breakdown (mismo cálculo que InvoicePrint.tsx)
    const ivaBreakdown: Record<string, { base: number; iva: number }> = {};
    let totalDescuento = 0;
    detalles.forEach((d: any) => {
        const rate = String(d.iva_porcentaje ?? 0);
        const base = r2(d.subtotal);
        const iva  = r2(d.iva_valor ?? (base * Number(rate) / 100));
        const dcto = r2(Number(d.precio_unitario ?? 0) * Number(d.cantidad ?? 0) * (Number(d.descuento ?? 0) / 100));
        if (!ivaBreakdown[rate]) ivaBreakdown[rate] = { base: 0, iva: 0 };
        ivaBreakdown[rate].base = r2(ivaBreakdown[rate].base + base);
        ivaBreakdown[rate].iva  = r2(ivaBreakdown[rate].iva  + iva);
        totalDescuento = r2(totalDescuento + dcto);
    });
    const ratesConIva = Object.keys(ivaBreakdown).filter(r => r !== '0').sort((a, b) => Number(a) - Number(b));
    const subtotalSinImpuestos = r2(Object.values(ivaBreakdown).reduce((s, v) => s + v.base, 0));
    const valorTotal = r2(comprobante.total ?? subtotalSinImpuestos + ratesConIva.reduce((s, r) => s + (ivaBreakdown[r]?.iva ?? 0), 0));

    const fechaEmision = comprobante.fecha_emision || comprobante.created_at;
    const fechaVenc    = comprobante.fecha_vencimiento || fechaEmision;
    const claveAcceso  = comprobante.clave_acceso || '';
    const autorizacion = comprobante.autorizacion_numero || claveAcceso;
    const ambiente     = (comprobante.ambiente || (empresa.config_sri || {}).ambiente || 'PRODUCCION').toUpperCase();
    const obligado     = empresa.obligado_contabilidad ? 'SI' : 'NO';

    const labelPago: Record<string, string> = {
        efectivo: 'EFECTIVO', tarjeta: 'TARJETA DE CRÉDITO/DÉBITO',
        tarjeta_credito: 'TARJETA DE CRÉDITO', tarjeta_debito: 'TARJETA DE DÉBITO',
        transferencia: 'TRANSFERENCIA', cheque: 'CHEQUE',
        credito: 'SIN UTILIZACION DEL SISTEMA FINANCIERO',
        otros: 'OTROS', sin_utilizacion_sistema_financiero: 'SIN UTILIZACION DEL SISTEMA FINANCIERO',
    };

    // QR
    let qrDataUrl = '';
    if (claveAcceso) {
        try {
            const QRCode = (await import('npm:qrcode')).default;
            qrDataUrl = await QRCode.toDataURL(claveAcceso, { margin: 1, width: 120 });
        } catch { /* QR unavailable */ }
    }

    // Logo
    let logoB64 = ''; let logoExt = 'PNG';
    if (empresa.logo_url) {
        try {
            const resp = await fetch(empresa.logo_url);
            logoB64 = toBase64(new Uint8Array(await resp.arrayBuffer()));
            logoExt = empresa.logo_url.toLowerCase().includes('.png') ? 'PNG' : 'JPEG';
        } catch { /* logo unavailable */ }
    }

    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const ML = 10; const CW = 190; const RX = 200; const PH = 284;
    const S400: [number,number,number] = [148,163,184];
    const S200: [number,number,number] = [226,232,240];
    const S100: [number,number,number] = [241,245,249];
    const sd4 = () => { doc.setDrawColor(...S400); doc.setLineWidth(0.4); };
    const sd2 = () => { doc.setDrawColor(...S200); doc.setLineWidth(0.2); };
    const sf1 = () => doc.setFillColor(...S100);

    let y = 10;

    // ── SECTION 1: HEADER (empresa 55% | FACTURA 45%) ──────────────────
    const LW = 104.5; const RW = 85.5; const DIV = ML + LW;
    const RH1=7, RH2=8, RH3=7, RH4=10, RH5=7, RH6=9;
    const HDR_H = RH1+RH2+RH3+RH4+RH5+RH6; // 48mm

    // Fill FACTURA row (antes de dibujar bordes)
    sf1(); doc.rect(DIV, y+RH1, RW, RH2, 'F');

    // Bordes exteriores + divisores
    sd4();
    doc.rect(ML, y, CW, HDR_H);
    doc.line(DIV, y, DIV, y+HDR_H);
    doc.line(DIV, y+RH1,                 DIV+RW, y+RH1);
    doc.line(DIV, y+RH1+RH2,             DIV+RW, y+RH1+RH2);
    doc.line(DIV, y+RH1+RH2+RH3,         DIV+RW, y+RH1+RH2+RH3);
    doc.line(DIV, y+RH1+RH2+RH3+RH4,     DIV+RW, y+RH1+RH2+RH3+RH4);
    doc.line(DIV, y+RH1+RH2+RH3+RH4+RH5, DIV+RW, y+RH1+RH2+RH3+RH4+RH5);

    // Celda izquierda
    doc.setTextColor(0,0,0);
    let lY = y + 2;
    if (logoB64) { doc.addImage(logoB64, logoExt, ML+2, lY, 40, 16); lY += 18; }
    doc.setFontSize(10.5); doc.setFont('helvetica', 'bold');
    const empNom = (empresa.razon_social || empresa.nombre || '').toUpperCase();
    const empLines = doc.splitTextToSize(empNom, LW - 4);
    doc.text(empLines, ML+2, lY+3);
    lY += empLines.length * 4 + 2;
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
    if (empresa.direccion) { doc.text(`Dir Matriz: ${empresa.direccion}`, ML+2, lY); lY += 4; }
    if (empresa.telefono)  { doc.text(`Telf. ${empresa.telefono}`, ML+2, lY); lY += 4; }
    doc.setFont('helvetica', 'bold');
    doc.text(`OBLIGADO A LLEVAR CONTABILIDAD ${obligado}`, ML+2, lY);

    // Celda derecha (tabla anidada)
    let rY = y;
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(0,0,0);
    doc.text(`R.U.C.: ${empresa.ruc || ''}`, DIV+RW/2, rY+RH1*0.65, { align: 'center' });
    rY += RH1;
    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.text('FACTURA', DIV+RW/2, rY+RH2*0.65, { align: 'center' });
    rY += RH2;
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(`No. ${comprobante.secuencial || ''}`, DIV+RW/2, rY+RH3*0.65, { align: 'center' });
    rY += RH3;
    doc.setFontSize(7); doc.setFont('helvetica', 'bold');
    doc.text('NÚMERO DE AUTORIZACIÓN', DIV+2, rY+3.5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);
    doc.text(doc.splitTextToSize(autorizacion, RW-4).slice(0,2), DIV+2, rY+6.5);
    rY += RH4;
    doc.setFontSize(7); doc.setFont('helvetica', 'bold');
    doc.text('FECHA Y HORA DE AUTORIZACIÓN', DIV+2, rY+3.5);
    doc.setFont('helvetica', 'normal');
    doc.text(fmtDT(comprobante.fecha_autorizacion), DIV+RW-2, rY+3.5, { align: 'right' });
    rY += RH5;
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
    doc.text('AMBIENTE:', DIV+2, rY+3.5);
    doc.setFont('helvetica', 'normal');
    doc.text(ambiente, DIV+RW-2, rY+3.5, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text('EMISIÓN:', DIV+2, rY+7);
    doc.setFont('helvetica', 'normal');
    doc.text('NORMAL', DIV+RW-2, rY+7, { align: 'right' });

    y += HDR_H;

    // ── SECTION 2: CLAVE DE ACCESO + QR ────────────────────────────────
    const CA_H = 14;
    sd4(); doc.rect(ML, y, CW, CA_H);
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(0,0,0);
    doc.text('CLAVE DE ACCESO', ML+2, y+4);
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(claveAcceso, CW-28), ML+2, y+9);
    if (qrDataUrl) doc.addImage(qrDataUrl, 'PNG', RX-22, y+1, 20, 12);
    y += CA_H;

    // ── SECTION 3: DATOS DEL COMPRADOR ─────────────────────────────────
    const CL_H = 13;
    sd4(); doc.rect(ML, y, CW, CL_H);
    const C4W = CW/4; const c3x = ML+C4W*2+1; const c4x = ML+C4W*3+1;
    doc.setFontSize(7.5); doc.setTextColor(0,0,0);
    const row1y = y+4;
    doc.setFont('helvetica', 'bold'); doc.text('Razón Social: ', ML+2, row1y);
    doc.setFont('helvetica', 'normal');
    const rsLW = doc.getTextWidth('Razón Social: ');
    doc.text(doc.splitTextToSize((cliente.nombre||'CONSUMIDOR FINAL').toUpperCase(), C4W*2-rsLW-4)[0]||'', ML+2+rsLW, row1y);
    doc.setFont('helvetica', 'bold'); doc.text('Fecha Emisión: ', c3x, row1y);
    doc.setFont('helvetica', 'normal');
    doc.text(fmtDate(fechaEmision), c3x+doc.getTextWidth('Fecha Emisión: '), row1y);
    doc.setFont('helvetica', 'bold'); doc.text('RUC / CI: ', c4x, row1y);
    doc.setFont('helvetica', 'normal');
    doc.text(cliente.identificacion||'9999999999999', c4x+doc.getTextWidth('RUC / CI: '), row1y);
    const row2y = y+9.5;
    if (cliente.direccion) {
        doc.setFont('helvetica', 'bold'); doc.text('Dirección: ', ML+2, row2y);
        doc.setFont('helvetica', 'normal');
        const dLW = doc.getTextWidth('Dirección: ');
        doc.text(doc.splitTextToSize(cliente.direccion, C4W*2-dLW-4)[0]||'', ML+2+dLW, row2y);
    }
    doc.setFont('helvetica', 'bold'); doc.text('Fecha Vencimiento: ', c3x, row2y);
    doc.setFont('helvetica', 'normal');
    doc.text(fmtDate(fechaVenc), c3x+doc.getTextWidth('Fecha Vencimiento: '), row2y);
    y += CL_H;

    // ── SECTION 4: TABLA DETALLES (9 columnas) ─────────────────────────
    const COLS: Array<{ label: string; w: number; align: 'left'|'center'|'right' }> = [
        { label: 'Cod. Principal',  w: 22, align: 'left'   },
        { label: 'Cod. Auxiliar',   w: 18, align: 'left'   },
        { label: 'Cant',            w: 10, align: 'right'  },
        { label: 'Descripción',     w: 58, align: 'left'   },
        { label: 'Paga IVA',        w: 14, align: 'center' },
        { label: 'Dcto %',          w: 10, align: 'right'  },
        { label: 'Dcto ($)',        w: 12, align: 'right'  },
        { label: 'Precio Unitario', w: 24, align: 'right'  },
        { label: 'Precio Total',    w: 22, align: 'right'  },
    ]; // 22+18+10+58+14+10+12+24+22 = 190
    const colXs: number[] = [];
    { let cx = ML; COLS.forEach(c => { colXs.push(cx); cx += c.w; }); }

    const TH = 6; const TR = 5.5;
    const drawTableHeader = (hy: number) => {
        sf1(); doc.rect(ML, hy, CW, TH, 'F');
        sd4(); doc.rect(ML, hy, CW, TH);
        sd2();
        COLS.forEach((c, i) => {
            if (i > 0) doc.line(colXs[i], hy, colXs[i], hy+TH);
            doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(0,0,0);
            const tx = c.align === 'right' ? colXs[i]+c.w-1 : c.align === 'center' ? colXs[i]+c.w/2 : colXs[i]+1;
            doc.text(c.label, tx, hy+TH*0.7, { align: c.align });
        });
    };
    drawTableHeader(y); y += TH;

    detalles.forEach((d: any, i: number) => {
        if (y+TR > PH) { doc.addPage(); y = 10; drawTableHeader(y); y += TH; }
        if (i%2 !== 0) { sf1(); doc.rect(ML, y, CW, TR, 'F'); }
        sd4(); doc.rect(ML, y, CW, TR);
        sd2(); COLS.forEach((_,j) => { if (j>0) doc.line(colXs[j], y, colXs[j], y+TR); });

        const ivaRate = Number(d.iva_porcentaje ?? 0);
        const dcto    = Number(d.descuento ?? 0);
        const dctoV   = r2(Number(d.precio_unitario??0)*Number(d.cantidad??0)*dcto/100);
        const vals = [
            d.productos?.codigo||(d.producto_id||'').substring(0,8)||'-',
            d.codigo_auxiliar||'',
            Number(d.cantidad).toFixed(2),
            (d.nombre_producto||(d.productos&&d.productos.nombre)||'').toUpperCase(),
            ivaRate>0?`${ivaRate}%`:'NO',
            dcto.toFixed(2), dctoV.toFixed(2), f4(d.precio_unitario), f2(d.subtotal),
        ];
        doc.setFontSize(7); doc.setFont('helvetica','normal'); doc.setTextColor(0,0,0);
        COLS.forEach((c,j) => {
            let txt = String(vals[j]);
            if (j===3) { txt = doc.splitTextToSize(txt, c.w-2)[0]||txt; }
            else { while (doc.getTextWidth(txt)>c.w-2 && txt.length>1) txt=txt.slice(0,-1); }
            const tx = c.align==='right'?colXs[j]+c.w-1:c.align==='center'?colXs[j]+c.w/2:colXs[j]+1;
            doc.text(txt, tx, y+TR*0.65, { align: c.align });
        });
        y += TR;
    });

    // ── SECTION 5: INFO ADICIONAL (55%) | TOTALES (45%) ────────────────
    const totRows: Array<{ label: string; val: string; last?: boolean }> = [];
    ratesConIva.forEach(r => totRows.push({ label: `SUBTOTAL BASE IVA ${r} %`, val: f2(ivaBreakdown[r]?.base) }));
    totRows.push({ label: 'SUBTOTAL 0%',               val: f2(ivaBreakdown['0']?.base) });
    totRows.push({ label: 'SUBTOTAL No sujeto de IVA', val: '0.00' });
    totRows.push({ label: 'DESCUENTO',                  val: f2(totalDescuento) });
    totRows.push({ label: 'SUBTOTAL SIN IMPUESTOS',     val: f2(subtotalSinImpuestos) });
    totRows.push({ label: 'ICE', val: '0.00' });
    ratesConIva.forEach(r => totRows.push({ label: `IVA ${r} %`, val: f2(ivaBreakdown[r]?.iva) }));
    totRows.push({ label: 'PROPINA',     val: '0.00' });
    totRows.push({ label: 'VALOR TOTAL', val: f2(valorTotal), last: true });

    const TotRH = 5.5;
    const totH  = totRows.length * TotRH;
    const infoItems = [
        { label: 'Dirección',   val: cliente.direccion },
        { label: 'Teléfono',    val: cliente.telefono },
        { label: 'Email',       val: cliente.email },
        { label: 'Observación', val: comprobante.observacion },
    ].filter(it => it.val);
    const PagoColH=5.5; const PagoRH=5;
    const leftH = 8 + infoItems.length*4.5 + (pagos.length>0 ? 7+PagoColH+pagos.length*PagoRH : 0);
    const S5_H = Math.max(totH, leftH) + 4;

    if (y+S5_H+9 > PH) { doc.addPage(); y = 10; }

    sd4(); doc.rect(ML, y, CW, S5_H);
    doc.line(DIV, y, DIV, y+S5_H);

    // Totales (derecha)
    let totY = y;
    totRows.forEach(row => {
        if (row.last) { sf1(); doc.rect(DIV, totY, RW, TotRH, 'F'); }
        sd2(); doc.rect(DIV, totY, RW, TotRH);
        doc.setFontSize(row.last?9:7.5); doc.setFont('helvetica','bold'); doc.setTextColor(0,0,0);
        doc.text(row.label, DIV+1.5, totY+TotRH*0.65);
        doc.text(row.val,   DIV+RW-1.5, totY+TotRH*0.65, { align: 'right' });
        totY += TotRH;
    });

    // Información adicional (izquierda)
    let infoY = y+2;
    doc.setFontSize(7.5); doc.setFont('helvetica','bold'); doc.setTextColor(0,0,0);
    doc.text('INFORMACIÓN ADICIONAL', ML+2, infoY+2);
    sd2(); doc.line(ML+1, infoY+4, DIV-1, infoY+4);
    infoY += 7;
    infoItems.forEach(item => {
        doc.setFontSize(7.5); doc.setFont('helvetica','bold'); doc.setTextColor(0,0,0);
        doc.text(`${item.label} `, ML+2, infoY);
        doc.setFont('helvetica','normal');
        doc.text(String(item.val), ML+2+doc.getTextWidth(`${item.label} `), infoY);
        infoY += 4.5;
    });
    if (pagos.length > 0) {
        infoY += 2;
        doc.setFontSize(7.5); doc.setFont('helvetica','bold'); doc.setTextColor(0,0,0);
        doc.text('FORMA DE PAGO', ML+2, infoY+2);
        sd2(); doc.line(ML+1, infoY+4, DIV-1, infoY+4);
        infoY += 7;
        const PAG_FORMA = LW-4-20-16;
        const PAG_X = [ML+2, ML+2+PAG_FORMA, ML+2+PAG_FORMA+20];
        sf1(); doc.rect(ML+1, infoY-1, LW-2, PagoColH, 'F');
        doc.setFontSize(7); doc.setFont('helvetica','bold'); doc.setTextColor(0,0,0);
        doc.text('Forma Pago', PAG_X[0], infoY+PagoColH*0.65);
        doc.text('Monto',      PAG_X[1]+20, infoY+PagoColH*0.65, { align: 'right' });
        doc.text('Días Plazo', PAG_X[2]+16, infoY+PagoColH*0.65, { align: 'right' });
        infoY += PagoColH;
        doc.setFont('helvetica','normal');
        pagos.forEach((p: any) => {
            const pl = labelPago[p.metodo_pago]||(p.metodo_pago||'').toUpperCase().replace(/_/g,' ');
            doc.text(pl, PAG_X[0], infoY+2);
            doc.text(Number(p.valor).toFixed(2), PAG_X[1]+20, infoY+2, { align: 'right' });
            doc.text(String(p.dias_plazo??p.plazo??0), PAG_X[2]+16, infoY+2, { align: 'right' });
            infoY += PagoRH;
        });
    }
    y += S5_H;

    // ── SECTION 6: FOOTER ───────────────────────────────────────────────
    if (y+8 > PH) { doc.addPage(); y = 10; }
    const FH = 7;
    sd4(); doc.rect(ML, y, CW, FH);
    doc.setFontSize(6.5); doc.setFont('helvetica','normal'); doc.setTextColor(150,150,150);
    doc.text('Este documento es una representación impresa de un Comprobante Electrónico (RIDE)', ML+2, y+FH*0.65);
    doc.setFontSize(7.5); doc.setFont('helvetica','bold'); doc.setTextColor(70,70,70);
    doc.text('www.billenniumsystem.com', RX-2, y+FH*0.65, { align: 'right' });

    return new Uint8Array(doc.output('arraybuffer'));
}

// ─── XAdES-BES Signer ──────────────────

async function firmarXmlXadesBes(
    xmlContent: string,
    p12Base64: string,
    p12Password: string
): Promise<string> {
    const p12Der = atob(p12Base64);
    const p12Asn1 = forge.asn1.fromDer(p12Der, { strict: false, parseAllBytes: false });
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, p12Password || "");

    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });

    const privateKeyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] || Object.values(keyBags).flat()[0];
    const certBag = certBags[forge.pki.oids.certBag]?.[0];

    if (!privateKeyBag?.key || !certBag?.cert) throw new Error("Credenciales inválidas en .p12");

    // Diagnóstico: mostrar todos los certs del .p12
    const allCertBags = certBags[forge.pki.oids.certBag] || [];
    console.log(`[P12 DIAG] Total cert bags: ${allCertBags.length}`);
    allCertBags.forEach((b: any, i: number) => {
        if (b.cert) {
            console.log(`[P12 DIAG] Cert ${i}: Subject=${b.cert.subject.getField('CN')?.value ?? '?'}, Issuer=${b.cert.issuer.getField('CN')?.value ?? '?'}, Valid=${b.cert.validity.notBefore.toISOString()}→${b.cert.validity.notAfter.toISOString()}`);
        }
    });

    const privateKey = privateKeyBag.key;
    // Seleccionar el cert que coincide con la clave privada
    let cert = certBag.cert;
    for (const bag of allCertBags) {
        if (bag.cert?.publicKey) {
            try {
                const pubN = (bag.cert.publicKey as any).n?.toString(16);
                const privN = (privateKey as any).n?.toString(16);
                if (pubN && privN && pubN === privN) {
                    cert = bag.cert;
                    console.log(`[P12 DIAG] Matched cert to private key: ${cert.subject.getField('CN')?.value}`);
                    break;
                }
            } catch { /* skip */ }
        }
    }

    // Construir cadena de certificados (signing cert + CA chain)
    const allCertsB64: string[] = [];
    for (const bag of allCertBags) {
        if (bag.cert) {
            const derBytes = forge.asn1.toDer(forge.pki.certificateToAsn1(bag.cert)).getBytes();
            allCertsB64.push(btoa(derBytes));
        }
    }

    const certDerBytes = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const certB64 = btoa(certDerBytes);
    const certSha1B64 = await sha1b64(new Uint8Array(certDerBytes.split('').map(c => c.charCodeAt(0))));

    const issuerDN = cert.issuer.attributes
        .slice().reverse()
        .map((a: any) => `${a.shortName}=${a.value}`)
        .join(",");

    const serialNumber = BigInt("0x" + cert.serialNumber).toString();
    const modulusB64 = hexToB64(privateKey.n.toString(16));
    const exponentB64 = hexToB64(privateKey.e.toString(16));

    const ts = Date.now();
    const signatureId = `Signature-${ts}`;
    const keyInfoId = `KeyInfoId-${signatureId}`;
    const signedPropertiesId = `SignedProperties-${signatureId}`;
    const referenceComprobanteId = `Reference-ID-${ts}`;
    const xadesObjectId = `XadesObjectId-${ts}`;
    const qualifyingPropsId = `QualifyingProperties-${ts}`;
    const now = new Date();
    const ecuadorDate = new Date(now.getTime() - (5 * 60 * 60 * 1000));
    const signingTime = ecuadorDate.toISOString().split(".")[0] + "-05:00";

    const xmlLimpio = xmlContent.replace(/<\?xml[^?]*\?>/i, "").trim();
    const digestXml = await sha1b64(new TextEncoder().encode(xmlLimpio));

    const spContent = `<xades:SignedSignatureProperties><xades:SigningTime>${signingTime}</xades:SigningTime><xades:SigningCertificate><xades:Cert><xades:CertDigest><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod><ds:DigestValue>${certSha1B64}</ds:DigestValue></xades:CertDigest><xades:IssuerSerial><ds:X509IssuerName>${issuerDN}</ds:X509IssuerName><ds:X509SerialNumber>${serialNumber}</ds:X509SerialNumber></xades:IssuerSerial></xades:Cert></xades:SigningCertificate></xades:SignedSignatureProperties><xades:SignedDataObjectProperties><xades:DataObjectFormat ObjectReference="#${referenceComprobanteId}"><xades:Description>contenido comprobante</xades:Description><xades:MimeType>text/xml</xades:MimeType><xades:Encoding>UTF-8</xades:Encoding></xades:DataObjectFormat></xades:SignedDataObjectProperties>`;
    const signedPropertiesToHash = `<xades:SignedProperties xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="${signedPropertiesId}">${spContent}</xades:SignedProperties>`;
    const digestSP = await sha1b64(new TextEncoder().encode(signedPropertiesToHash));

    const x509Chain = allCertsB64.map(c => `<ds:X509Certificate>${c}</ds:X509Certificate>`).join('');
    const keyInfoContent = `<ds:X509Data>${x509Chain}</ds:X509Data><ds:KeyValue><ds:RSAKeyValue><ds:Modulus>${modulusB64}</ds:Modulus><ds:Exponent>${exponentB64}</ds:Exponent></ds:RSAKeyValue></ds:KeyValue>`;
    const keyInfoToHash = `<ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="${keyInfoId}">${keyInfoContent}</ds:KeyInfo>`;
    const digestKI = await sha1b64(new TextEncoder().encode(keyInfoToHash));

    const signedInfoToSign = `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:CanonicalizationMethod><ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></ds:SignatureMethod><ds:Reference Id="${referenceComprobanteId}" URI="#comprobante"><ds:Transforms><ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></ds:Transform></ds:Transforms><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod><ds:DigestValue>${digestXml}</ds:DigestValue></ds:Reference><ds:Reference Id="ReferenceKeyInfo" URI="#${keyInfoId}"><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod><ds:DigestValue>${digestKI}</ds:DigestValue></ds:Reference><ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#${signedPropertiesId}"><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod><ds:DigestValue>${digestSP}</ds:DigestValue></ds:Reference></ds:SignedInfo>`;

    const md = forge.md.sha1.create();
    md.update(signedInfoToSign, "utf8");
    const signatureValue = btoa(privateKey.sign(md)).replace(/\r?\n|\r/g, "");

    const signatureXml = `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="${signatureId}">${signedInfoToSign}<ds:SignatureValue Id="SignatureValue-${ts}">${signatureValue}</ds:SignatureValue><ds:KeyInfo Id="${keyInfoId}">${keyInfoContent}</ds:KeyInfo><ds:Object Id="${xadesObjectId}"><xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="${qualifyingPropsId}" Target="#${signatureId}"><xades:SignedProperties Id="${signedPropertiesId}">${spContent}</xades:SignedProperties></xades:QualifyingProperties></ds:Object></ds:Signature>`;

    // Detectar el tag raíz del comprobante (factura, liquidacionCompra, etc.)
    const rootTag = xmlContent.match(/<(\w+)\s+id="comprobante"/)?.[1] ?? "factura";
    return xmlContent.replace(`</${rootTag}>`, `${signatureXml}</${rootTag}>`);
}

const SRI_ENDPOINTS = {
    PRODUCCION: {
        recepcion: "https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline",
        autorizacion: "https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline",
    },
    PRUEBAS: {
        recepcion: "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline",
        autorizacion: "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline",
    },
};

// ─── Clave de Acceso SRI (49 dígitos, módulo 11) ─────────────────────────────

function computeClaveAcceso(params: {
    fechaEmision: string;  // 'YYYY-MM-DD'
    codDoc:       string;  // '03' para LC
    ruc:          string;
    ambiente:     string;  // '1' pruebas, '2' produccion
    estab:        string;  // 3 dígitos
    ptoEmi:       string;  // 3 dígitos
    secuencial:   string;  // 9 dígitos
    codNumerico:  string;  // 8 dígitos aleatorios
}): string {
    const { fechaEmision, codDoc, ruc, ambiente, estab, ptoEmi, secuencial, codNumerico } = params;
    const [y, m, d] = fechaEmision.split("-");
    const fecha8 = `${d}${m}${y}`;
    const base48 = `${fecha8}${codDoc}${ruc}${ambiente}${estab}${ptoEmi}${secuencial}${codNumerico}1`;

    // Módulo 11 con coeficientes 2-7 de derecha a izquierda
    const coefs = [2, 3, 4, 5, 6, 7];
    let sum = 0;
    for (let i = base48.length - 1; i >= 0; i--) {
        sum += parseInt(base48[i]) * coefs[(base48.length - 1 - i) % 6];
    }
    const residuo = sum % 11;
    const dv = residuo === 0 ? 0 : residuo === 1 ? 1 : 11 - residuo;
    return `${base48}${dv}`;
}

// ─── RIDE PDF para Liquidación de Compra ─────────────────────────────────────

async function generarRideLcPdf(lc: any, empresa: any): Promise<Uint8Array> {
    const r2 = (n: any) => Math.round(Number(n ?? 0) * 100) / 100;
    const f2 = (n: any) => r2(n).toFixed(2);
    const fmtDate = (d: any): string => {
        if (!d) return "";
        const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d);
    };
    const fmtDT = (d: any): string => {
        if (!d) return "PENDIENTE";
        try {
            const dt = new Date(d);
            if (isNaN(dt.getTime())) return "PENDIENTE";
            const p = (n: number) => String(n).padStart(2, "0");
            return `${dt.getFullYear()}-${p(dt.getMonth()+1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}:${p(dt.getSeconds())}`;
        } catch { return "PENDIENTE"; }
    };

    const configSri = empresa.config_sri || {};
    const ambiente  = (configSri.ambiente || "PRUEBAS").toUpperCase();
    const autorizacion = lc.numero_autorizacion || lc.clave_acceso || "";
    const claveAcceso  = lc.clave_acceso || "";
    const detalles: any[] = lc.detalles ?? [];
    const retenciones: any[] = lc.retenciones ?? [];

    // Logo
    let logoB64 = ""; let logoExt = "PNG";
    if (empresa.logo_url) {
        try {
            const resp = await fetch(empresa.logo_url);
            logoB64 = toBase64(new Uint8Array(await resp.arrayBuffer()));
            logoExt = empresa.logo_url.toLowerCase().includes(".png") ? "PNG" : "JPEG";
        } catch { /* logo unavailable */ }
    }

    // QR
    let qrDataUrl = "";
    if (claveAcceso) {
        try {
            const QRCode = (await import("npm:qrcode")).default;
            qrDataUrl = await QRCode.toDataURL(claveAcceso, { margin: 1, width: 120 });
        } catch { /* QR unavailable */ }
    }

    const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const ML = 10; const CW = 190; const RX = 200; const PH = 284;
    const S400: [number,number,number] = [148, 163, 184];
    const S200: [number,number,number] = [226, 232, 240];
    const S100: [number,number,number] = [241, 245, 249];
    const sd4 = () => { doc.setDrawColor(...S400); doc.setLineWidth(0.4); };
    const sd2 = () => { doc.setDrawColor(...S200); doc.setLineWidth(0.2); };
    const sf1 = () => doc.setFillColor(...S100);

    let y = 10;

    // ── HEADER ────────────────────────────────────────────────────────
    const LW = 104.5; const RW = 85.5; const DIV = ML + LW;
    const HDR_H = 48;
    const RH1=7, RH2=8, RH3=7, RH4=10, RH5=7, RH6=9;
    sf1(); doc.rect(DIV, y+RH1, RW, RH2, "F");
    sd4();
    doc.rect(ML, y, CW, HDR_H);
    doc.line(DIV, y, DIV, y+HDR_H);
    [RH1, RH1+RH2, RH1+RH2+RH3, RH1+RH2+RH3+RH4, RH1+RH2+RH3+RH4+RH5].forEach(o =>
        doc.line(DIV, y+o, DIV+RW, y+o));

    // Celda izquierda
    doc.setTextColor(0, 0, 0);
    let lY = y + 2;
    if (logoB64) { doc.addImage(logoB64, logoExt, ML+2, lY, 40, 16); lY += 18; }
    doc.setFontSize(10.5); doc.setFont("helvetica", "bold");
    const empNom = (empresa.razon_social || empresa.nombre || "").toUpperCase();
    const empLines = doc.splitTextToSize(empNom, LW - 4);
    doc.text(empLines, ML+2, lY+3);
    lY += empLines.length * 4 + 2;
    doc.setFontSize(7.5); doc.setFont("helvetica", "normal");
    if (empresa.direccion) { doc.text(`Dir: ${empresa.direccion}`, ML+2, lY); lY += 4; }
    doc.setFont("helvetica", "bold");
    doc.text(`R.U.C.: ${empresa.ruc || ""}`, ML+2, lY);

    // Celda derecha
    let rY = y;
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text(`R.U.C.: ${empresa.ruc || ""}`, DIV+RW/2, rY+RH1*0.65, { align: "center" });
    rY += RH1;
    doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text("LIQUIDACIÓN DE COMPRA", DIV+RW/2, rY+RH2*0.65, { align: "center" });
    rY += RH2;
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text(`No. ${lc.establecimiento}-${lc.punto_emision}-${lc.secuencial}`, DIV+RW/2, rY+RH3*0.65, { align: "center" });
    rY += RH3;
    doc.setFontSize(7); doc.setFont("helvetica", "bold");
    doc.text("NÚMERO DE AUTORIZACIÓN", DIV+2, rY+3.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
    doc.text(doc.splitTextToSize(autorizacion, RW-4).slice(0,2), DIV+2, rY+6.5);
    rY += RH4;
    doc.setFontSize(7); doc.setFont("helvetica", "bold");
    doc.text("FECHA Y HORA DE AUTORIZACIÓN", DIV+2, rY+3.5);
    doc.setFont("helvetica", "normal");
    doc.text(fmtDT(lc.fecha_autorizacion), DIV+RW-2, rY+3.5, { align: "right" });
    rY += RH5;
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold");
    doc.text("AMBIENTE:", DIV+2, rY+3.5);
    doc.setFont("helvetica", "normal");
    doc.text(ambiente, DIV+RW-2, rY+3.5, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text("EMISIÓN:", DIV+2, rY+7);
    doc.setFont("helvetica", "normal");
    doc.text("NORMAL", DIV+RW-2, rY+7, { align: "right" });
    y += HDR_H;

    // ── CLAVE DE ACCESO + QR ──────────────────────────────────────────
    const CA_H = 14;
    sd4(); doc.rect(ML, y, CW, CA_H);
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(0,0,0);
    doc.text("CLAVE DE ACCESO", ML+2, y+4);
    doc.setFontSize(6.5); doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(claveAcceso, CW-28), ML+2, y+9);
    if (qrDataUrl) doc.addImage(qrDataUrl, "PNG", RX-22, y+1, 20, 12);
    y += CA_H;

    // ── DATOS DEL PROVEEDOR / BENEFICIARIO ────────────────────────────
    const PR_H = 13;
    sd4(); doc.rect(ML, y, CW, PR_H);
    doc.setFontSize(7.5); doc.setTextColor(0,0,0);
    const rp1y = y + 4;
    doc.setFont("helvetica", "bold"); doc.text("Proveedor: ", ML+2, rp1y);
    doc.setFont("helvetica", "normal");
    doc.text((lc.beneficiario_nombre || "").toUpperCase(), ML+2+doc.getTextWidth("Proveedor: "), rp1y);
    doc.setFont("helvetica", "bold"); doc.text("Fecha Emisión: ", ML+CW/2, rp1y);
    doc.setFont("helvetica", "normal");
    doc.text(fmtDate(lc.fecha_emision), ML+CW/2+doc.getTextWidth("Fecha Emisión: "), rp1y);
    const rp2y = y + 9.5;
    doc.setFont("helvetica", "bold"); doc.text("Identificación: ", ML+2, rp2y);
    doc.setFont("helvetica", "normal");
    doc.text(`${lc.beneficiario_tipo_id} · ${lc.beneficiario_identificacion}`, ML+2+doc.getTextWidth("Identificación: "), rp2y);
    doc.setFont("helvetica", "bold"); doc.text("Forma Pago: ", ML+CW/2, rp2y);
    doc.setFont("helvetica", "normal");
    doc.text(lc.forma_pago || "CONTADO", ML+CW/2+doc.getTextWidth("Forma Pago: "), rp2y);
    y += PR_H;

    // ── TABLA DETALLES ────────────────────────────────────────────────
    const COLS_DET = [
        { label: "Descripción",      w: 90, align: "left"  as const },
        { label: "Cant.",            w: 20, align: "right" as const },
        { label: "Precio Unit.",     w: 30, align: "right" as const },
        { label: "IVA",              w: 14, align: "center" as const },
        { label: "Subtotal",         w: 36, align: "right" as const },
    ];
    const colXsDet: number[] = [];
    { let cx = ML; COLS_DET.forEach(c => { colXsDet.push(cx); cx += c.w; }); }
    const TH = 6; const TR = 5.5;
    sf1(); doc.rect(ML, y, CW, TH, "F");
    sd4(); doc.rect(ML, y, CW, TH);
    sd2();
    COLS_DET.forEach((c, i) => {
        if (i > 0) doc.line(colXsDet[i], y, colXsDet[i], y+TH);
        doc.setFontSize(6.5); doc.setFont("helvetica", "bold"); doc.setTextColor(0,0,0);
        const tx = c.align === "right" ? colXsDet[i]+c.w-1 : c.align === "center" ? colXsDet[i]+c.w/2 : colXsDet[i]+1;
        doc.text(c.label, tx, y+TH*0.7, { align: c.align });
    });
    y += TH;

    detalles.forEach((d: any, i: number) => {
        if (y + TR > PH) { doc.addPage(); y = 10; }
        if (i%2 !== 0) { sf1(); doc.rect(ML, y, CW, TR, "F"); }
        sd4(); doc.rect(ML, y, CW, TR);
        sd2(); COLS_DET.forEach((_, j) => { if (j>0) doc.line(colXsDet[j], y, colXsDet[j], y+TR); });
        const ivaLabel = d.aplica_iva ? "15%" : "0%";
        const vals = [
            d.descripcion || "",
            Number(d.cantidad || 1).toFixed(2),
            f2(d.precio_unitario),
            ivaLabel,
            f2(d.subtotal),
        ];
        doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(0,0,0);
        COLS_DET.forEach((c, j) => {
            let txt = String(vals[j]);
            if (j === 0) txt = doc.splitTextToSize(txt, c.w-2)[0] || txt;
            else { while (doc.getTextWidth(txt) > c.w-2 && txt.length > 1) txt = txt.slice(0,-1); }
            const tx = c.align==="right" ? colXsDet[j]+c.w-1 : c.align==="center" ? colXsDet[j]+c.w/2 : colXsDet[j]+1;
            doc.text(txt, tx, y+TR*0.65, { align: c.align });
        });
        y += TR;
    });

    // ── RETENCIONES + TOTALES ─────────────────────────────────────────
    const totRows = [
        { label: "Base IVA 0%",    val: f2(lc.base_iva_0) },
        { label: "Base IVA 15%",   val: f2(lc.base_iva_15) },
        { label: "IVA 15%",        val: f2(lc.valor_iva) },
        { label: "TOTAL FACTURA",  val: f2(lc.total), bold: true },
    ];
    if ((lc.total_retenciones ?? 0) > 0) {
        totRows.push({ label: "TOTAL RETENCIONES", val: `-${f2(lc.total_retenciones)}`, bold: false });
        totRows.push({ label: "NETO A PAGAR",       val: f2(r2(lc.total - lc.total_retenciones)), bold: true });
    }

    const TotRH = 5.5;
    const totH  = totRows.length * TotRH;
    const leftH = retenciones.length > 0 ? 8 + retenciones.length * 5 + 10 : 8;
    const S5_H  = Math.max(totH, leftH) + 4;

    if (y + S5_H + 9 > PH) { doc.addPage(); y = 10; }
    sd4(); doc.rect(ML, y, CW, S5_H);
    doc.line(DIV, y, DIV, y+S5_H);

    // Totales (derecha)
    let totY = y;
    totRows.forEach(row => {
        if ((row as any).bold) { sf1(); doc.rect(DIV, totY, RW, TotRH, "F"); }
        sd2(); doc.rect(DIV, totY, RW, TotRH);
        doc.setFontSize((row as any).bold ? 9 : 7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(0,0,0);
        doc.text(row.label, DIV+1.5, totY+TotRH*0.65);
        doc.text(row.val, DIV+RW-1.5, totY+TotRH*0.65, { align: "right" });
        totY += TotRH;
    });

    // Retenciones (izquierda)
    if (retenciones.length > 0) {
        let retY = y + 2;
        doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(0,0,0);
        doc.text("RETENCIONES", ML+2, retY+2);
        sd2(); doc.line(ML+1, retY+4, DIV-1, retY+4);
        retY += 7;
        retenciones.forEach((r: any) => {
            doc.setFontSize(7); doc.setFont("helvetica", "bold");
            doc.text(`${r.tipo} ${r.codigo_retencion} (${r.porcentaje}%): `, ML+2, retY);
            doc.setFont("helvetica", "normal");
            doc.text(`-$${f2(r.valor)}`, ML+2+doc.getTextWidth(`${r.tipo} ${r.codigo_retencion} (${r.porcentaje}%): `), retY);
            retY += 5;
        });
    } else {
        let infoY = y + 2;
        doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(0,0,0);
        doc.text("INFORMACIÓN ADICIONAL", ML+2, infoY+2);
        if (lc.observaciones) {
            infoY += 6;
            doc.setFont("helvetica", "normal"); doc.setFontSize(7);
            doc.text(doc.splitTextToSize(lc.observaciones, LW-4), ML+2, infoY);
        }
    }
    y += S5_H;

    // ── FOOTER ───────────────────────────────────────────────────────
    if (y + 8 > PH) { doc.addPage(); y = 10; }
    const FH = 7;
    sd4(); doc.rect(ML, y, CW, FH);
    doc.setFontSize(6.5); doc.setFont("helvetica", "normal"); doc.setTextColor(150, 150, 150);
    doc.text("Este documento es una representación impresa de un Comprobante Electrónico (RIDE)", ML+2, y+FH*0.65);
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(70, 70, 70);
    doc.text("www.billenniumsystem.com", RX-2, y+FH*0.65, { align: "right" });

    return new Uint8Array(doc.output("arraybuffer"));
}

// ─── Handler principal para Liquidaciones de Compra ──────────────────────────

async function handleLiquidacion(liquidacion_id: string, supabase: any): Promise<Response> {
    const cleanMsg = (txt: string) => txt.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

    // 1. Cargar LC completa con empresa y detalles
    //    Las retenciones son comprobantes separados (codDoc=07), no parte del XML LC v1.1.0
    const { data: lc, error: lcError } = await supabase
        .from("liquidaciones_compra")
        .select(`
            *,
            detalles:liquidacion_compra_detalles(*)
        `)
        .eq("id", liquidacion_id)
        .single();

    if (lcError || !lc) throw new Error(`Liquidación no encontrada: ${lcError?.message}`);
    if (lc.estado_sri === "AUTORIZADO") {
        return new Response(JSON.stringify({ success: true, authorized: true, estado_sri: "AUTORIZADO", message: "Ya autorizada" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    // Cargar empresa por separado (liquidaciones_compra no tiene FK declarada a empresas)
    const { data: empresaData, error: empError } = await supabase
        .from("empresas")
        .select("*")
        .eq("id", lc.empresa_id)
        .single();
    if (empError || !empresaData) throw new Error(`Empresa no encontrada: ${empError?.message}`);

    const empresa  = empresaData;
    const configSri = empresa.config_sri || {};
    const ambiente = configSri.ambiente === "PRODUCCION" ? "PRODUCCION" : "PRUEBAS";
    const endpoints = SRI_ENDPOINTS[ambiente as keyof typeof SRI_ENDPOINTS];

    // 2. Calcular o reutilizar la clave de acceso
    let claveAcceso = lc.clave_acceso;
    if (!claveAcceso) {
        const codNumerico = Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join("");
        claveAcceso = computeClaveAcceso({
            fechaEmision: lc.fecha_emision,
            codDoc:       "03",
            ruc:          empresa.ruc,
            ambiente:     ambiente === "PRODUCCION" ? "2" : "1",
            estab:        lc.establecimiento,
            ptoEmi:       lc.punto_emision,
            secuencial:   lc.secuencial,
            codNumerico,
        });
        // Guardar ya para que el XML tenga la clave correcta
        await supabase.from("liquidaciones_compra").update({ clave_acceso: claveAcceso }).eq("id", liquidacion_id);
        lc.clave_acceso = claveAcceso;
    }

    // 3. Obtener firma electrónica
    const { data: firmaBlob } = await supabase.storage
        .from("firmas_electronicas")
        .download(configSri.firma_path);
    if (!firmaBlob) throw new Error("Firma no encontrada. Suba el .p12 en Configuración.");
    const firmaB64 = toBase64(await firmaBlob.arrayBuffer());

    // 4. Generar y firmar XML
    const xmlSinFirma = generarXmlLC(lc, empresa);
    const xmlFirmado  = await firmarXmlXadesBes(xmlSinFirma, firmaB64, configSri.firma_password);

    // 5. SOAP: recepción
    const soapAutorizacion = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns2:autorizacionComprobante xmlns:ns2="http://ec.gob.sri.ws.autorizacion"><claveAccesoComprobante>${claveAcceso}</claveAccesoComprobante></ns2:autorizacionComprobante></soap:Body></soap:Envelope>`;
    const xmlB64 = btoa(unescape(encodeURIComponent(xmlFirmado)));
    const soapRecepcion = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns2:validarComprobante xmlns:ns2="http://ec.gob.sri.ws.recepcion"><xml>${xmlB64}</xml></ns2:validarComprobante></soap:Body></soap:Envelope>`;

    const resRec = await fetch(endpoints.recepcion, { method: "POST", body: soapRecepcion, headers: { "Content-Type": "text/xml" } });
    const textRec = await resRec.text();
    console.log("[LC SRI] RECEPCION:", textRec.substring(0, 600));

    let estado_sri = "RECHAZADO";
    let msgSri = "";
    let autorizado = false;
    let numAuth: string | undefined;
    let fechaAuth: string | undefined;

    if (textRec.includes("RECIBIDA") || textRec.includes("CLAVE ACCESO REGISTRADA") || textRec.includes("EN PROCESAMIENTO")) {
        estado_sri = "ENVIADO";
        await new Promise(r => setTimeout(r, 1500));

        const resAut = await fetch(endpoints.autorizacion, { method: "POST", body: soapAutorizacion, headers: { "Content-Type": "text/xml" } });
        const textAut = await resAut.text();
        console.log("[LC SRI] AUT:", textAut.substring(0, 600));

        autorizado = textAut.includes("<estado>AUTORIZADO</estado>");
        if (autorizado) {
            estado_sri = "AUTORIZADO";
            numAuth   = textAut.match(/<numeroAutorizacion>(.*?)<\/numeroAutorizacion>/s)?.[1];
            fechaAuth = textAut.match(/<fechaAutorizacion>(.*?)<\/fechaAutorizacion>/s)?.[1];
            msgSri = "OK";
        } else {
            const autMsg  = textAut.match(/<mensaje>(.*?)<\/mensaje>/s)?.[1] || "";
            const autInfo = textAut.match(/<informacionAdicional>(.*?)<\/informacionAdicional>/s)?.[1] || "";
            msgSri = cleanMsg(`${autMsg} ${autInfo}`) || textAut.substring(0, 200);
        }
    } else {
        const recMsg  = textRec.match(/<mensaje>(.*?)<\/mensaje>/s)?.[1] || "";
        const recInfo = textRec.match(/<informacionAdicional>(.*?)<\/informacionAdicional>/s)?.[1] || "";
        msgSri = cleanMsg(`${recMsg} ${recInfo}`) || textRec.substring(0, 200);
    }

    // 6. Actualizar DB
    const updateData: Record<string, any> = {
        estado_sri,
        xml_firmado:      xmlFirmado,
        observaciones_sri: msgSri || (autorizado ? "OK" : "PENDIENTE"),
    };
    if (autorizado) {
        updateData.numero_autorizacion = numAuth;
        updateData.fecha_autorizacion  = fechaAuth ? new Date(fechaAuth).toISOString() : new Date().toISOString();
        // Actualizar también la CxP relacionada si existe
        await supabase.from("cuentas_por_pagar").update({ observaciones: `Autorización SRI: ${numAuth}` }).eq("liquidacion_id", liquidacion_id);
    }
    await supabase.from("liquidaciones_compra").update(updateData).eq("id", liquidacion_id);

    // 7. Email al beneficiario (background, no bloquea respuesta)
    const emailTask = (async () => {
        if (!autorizado || !lc.beneficiario_email) return;
        try {
            const mailHost = configSri.mail_host as string | undefined;
            const mailUser = configSri.mail_user as string | undefined;
            const mailPass = configSri.mail_pass as string | undefined;
            if (!mailHost || !mailUser || !mailPass) return;

            const nombreEmpresa = (empresa.razon_social || empresa.nombre || "La Empresa").toUpperCase();
            const fechaFormat   = new Date(lc.fecha_emision + "T12:00:00").toLocaleDateString("es-EC");
            const numLC         = `${lc.establecimiento}-${lc.punto_emision}-${lc.secuencial}`;

            const emailHtml = buildEmailHtml({
                tipo:                  "LIQUIDACIÓN DE COMPRA",
                nombreCliente:         (lc.beneficiario_nombre || "").toUpperCase(),
                identificacionCliente: lc.beneficiario_identificacion,
                nombreEmpresa,
                ruc:    empresa.ruc || "",
                logoUrl: empresa.logo_url || null,
                secuencial: numLC,
                fechaFormat,
                total:  Number(lc.total).toFixed(2),
                ambiente: configSri.ambiente,
            });

            let pdfB64: string | null = null;
            try {
                lc.numero_autorizacion  = numAuth;
                lc.fecha_autorizacion   = updateData.fecha_autorizacion;
                const ridePdfBytes = await generarRideLcPdf(lc, empresa);
                let bin = "";
                const chunk = 8192;
                for (let i = 0; i < ridePdfBytes.length; i += chunk) {
                    bin += String.fromCharCode(...ridePdfBytes.subarray(i, Math.min(i+chunk, ridePdfBytes.length)));
                }
                pdfB64 = btoa(bin);
            } catch (pdfErr) {
                console.error("[LC EMAIL] Error PDF:", pdfErr);
            }

            const attachments: any[] = [];
            if (pdfB64) {
                attachments.push({ filename: `RIDE_LC_${numLC}.pdf`, content: pdfB64, encoding: "base64", contentType: "application/pdf" });
            }
            attachments.push({ filename: `LC_${numLC}.xml`, content: xmlFirmado || "", contentType: "application/xml; charset=utf-8" });

            const nodemailer = (await import("npm:nodemailer@6.9.13")).default;
            const transporter = nodemailer.createTransport({
                host: mailHost, port: Number(configSri.mail_port) || 587,
                secure: configSri.mail_ssl === true,
                auth: { user: mailUser, pass: mailPass },
                tls: { rejectUnauthorized: false },
            });
            await transporter.sendMail({
                from: `Facturación ${nombreEmpresa} <${mailUser}>`,
                to: lc.beneficiario_email,
                subject: `Liquidación de Compra ${numLC} - ${nombreEmpresa}`,
                html: emailHtml,
                attachments,
            });
            console.log("[LC EMAIL] Enviado a:", lc.beneficiario_email);
        } catch (emailErr) {
            console.error("[LC EMAIL] Error:", emailErr);
        }
    })();
    (globalThis as any).EdgeRuntime?.waitUntil?.(emailTask);

    return new Response(JSON.stringify({ success: true, authorized: autorizado, estado_sri, message: msgSri }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

// ─────────────────────────────────────────────────────────────────────────────

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const body = await req.json();
        const { comprobante_id, solo_consulta, liquidacion_id } = body;

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
            { db: { schema: "facturacion" } }
        );

        // Routing para Liquidaciones de Compra (codDoc=03)
        if (liquidacion_id) {
            return await handleLiquidacion(liquidacion_id, supabase);
        }

        const { data: comprobante } = await supabase
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

        if (!comprobante) throw new Error("Comprobante no encontrado");

        const configSri = comprobante.empresas.config_sri;
        const ambiente = configSri.ambiente === "PRODUCCION" ? "PRODUCCION" : "PRUEBAS";
        const endpoints = SRI_ENDPOINTS[ambiente];

        let xmlFirmado = comprobante.xml_firmado;
        let msgSri = "";
        let autorizado = false;
        let estado_sri = comprobante.estado_sri;
        let numAuth = comprobante.autorizacion_numero;
        let fechaAuth = comprobante.fecha_autorizacion;

        const cleanMsg = (txt: string) => txt.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

        // ─── PASO 1: CONSULTAR SI YA ESTÁ AUTORIZADO ───
        // Saltamos el pre-check para facturas PENDIENTE/RECHAZADO: el SRI aún no las conoce,
        // así que el round-trip es innecesario. Solo consultamos primero cuando el comprobante
        // ya fue enviado al SRI (ENVIADO/AUTORIZADO) o cuando es consulta manual.
        const soapAutorizacion = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns2:autorizacionComprobante xmlns:ns2="http://ec.gob.sri.ws.autorizacion"><claveAccesoComprobante>${comprobante.clave_acceso}</claveAccesoComprobante></ns2:autorizacionComprobante></soap:Body></soap:Envelope>`;
        const necesitaPreCheck = solo_consulta || estado_sri === "ENVIADO" || estado_sri === "AUTORIZADO";
        let yaRegistradaEnSri = false;

        if (necesitaPreCheck) {
            const resAutPrev = await fetch(endpoints.autorizacion, { method: "POST", body: soapAutorizacion, headers: { "Content-Type": "text/xml" } });
            const textAutPrev = await resAutPrev.text();
            console.log("[SRI DEBUG] CLAVE:", comprobante.clave_acceso);
            console.log("[SRI DEBUG] AUT PREV:", textAutPrev.substring(0, 800));

            autorizado = textAutPrev.includes("<estado>AUTORIZADO</estado>");

            if (autorizado) {
                estado_sri = "AUTORIZADO";
                numAuth = textAutPrev.match(/<numeroAutorizacion>(.*?)<\/numeroAutorizacion>/s)?.[1];
                fechaAuth = textAutPrev.match(/<fechaAutorizacion>(.*?)<\/fechaAutorizacion>/s)?.[1];
            } else {
                const rawMensaje = textAutPrev.match(/<mensaje>(.*?)<\/mensaje>/s)?.[1] || "";
                const rawInfo = textAutPrev.match(/<informacionAdicional>(.*?)<\/informacionAdicional>/s)?.[1] || "";
                msgSri = cleanMsg(`${rawMensaje} ${rawInfo}`);
                console.log("[SRI DEBUG] MSG PREV:", msgSri);

                if (msgSri.includes("CLAVE ACCESO REGISTRADA") || msgSri.includes("EN PROCESAMIENTO") || msgSri.includes("PROCESAMIENTO")) {
                    estado_sri = "ENVIADO";
                    yaRegistradaEnSri = true;
                    msgSri = `SRI (CLAVE YA REGISTRADA): ${msgSri}`;
                }
            }
        }

        if (!autorizado && !solo_consulta && !yaRegistradaEnSri) {
            // ─── PASO 2: FIRMAR Y ENVIAR ───
            const { data: firmaBlob } = await supabase.storage.from("firmas_electronicas").download(configSri.firma_path);
            if (!firmaBlob) throw new Error("Firma no encontrada. Suba el .p12 en Configuración.");

            const firmaB64 = toBase64(await firmaBlob.arrayBuffer());
            const xmlSinFirma = generarXml(comprobante);
            xmlFirmado = await firmarXmlXadesBes(xmlSinFirma, firmaB64, configSri.firma_password);

            const xmlB64 = btoa(unescape(encodeURIComponent(xmlFirmado)));
            const soapRecepcion = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns2:validarComprobante xmlns:ns2="http://ec.gob.sri.ws.recepcion"><xml>${xmlB64}</xml></ns2:validarComprobante></soap:Body></soap:Envelope>`;

            const resRec = await fetch(endpoints.recepcion, { method: "POST", body: soapRecepcion, headers: { "Content-Type": "text/xml" } });
            const textRec = await resRec.text();
            console.log("[SRI DEBUG] RECEPCION:", textRec.substring(0, 800));

            if (textRec.includes("RECIBIDA")) {
                estado_sri = "ENVIADO";
                msgSri = "RECIBIDA POR SRI";
                await new Promise(r => setTimeout(r, 1500));
            } else {
                const recMensaje = textRec.match(/<mensaje>(.*?)<\/mensaje>/s)?.[1] || "";
                const recInfo = textRec.match(/<informacionAdicional>(.*?)<\/informacionAdicional>/s)?.[1] || "";
                msgSri = `REC:${cleanMsg(`${recMensaje} ${recInfo}`)}`;

                if (msgSri.includes("CLAVE ACCESO REGISTRADA") || msgSri.includes("EN PROCESAMIENTO")) {
                    estado_sri = "ENVIADO";
                } else {
                    estado_sri = "RECHAZADO";
                    msgSri = msgSri || "Error en recepción del comprobante.";
                }
            }

            if (estado_sri === "ENVIADO") {
                const resAutPost = await fetch(endpoints.autorizacion, { method: "POST", body: soapAutorizacion, headers: { "Content-Type": "text/xml" } });
                const textAutPost = await resAutPost.text();
                console.log("[SRI DEBUG] AUT POST:", textAutPost.substring(0, 800));
                autorizado = textAutPost.includes("<estado>AUTORIZADO</estado>");

                if (autorizado) {
                    estado_sri = "AUTORIZADO";
                    numAuth = textAutPost.match(/<numeroAutorizacion>(.*?)<\/numeroAutorizacion>/s)?.[1];
                    fechaAuth = textAutPost.match(/<fechaAutorizacion>(.*?)<\/fechaAutorizacion>/s)?.[1];
                    msgSri = "OK";
                } else {
                    const autMsg = textAutPost.match(/<mensaje>(.*?)<\/mensaje>/s)?.[1] || "";
                    const autInfo = textAutPost.match(/<informacionAdicional>(.*?)<\/informacionAdicional>/s)?.[1] || "";
                    const fullAutMsg = cleanMsg(`${autMsg} ${autInfo}`);
                    msgSri = `AUT:${fullAutMsg || textAutPost.substring(0, 300)}`;
                }
            }
        }

        // ─── PASO 3: ACTUALIZAR BASE DE DATOS ───
        const updateData: any = {
            estado_sri,
            xml_firmado: xmlFirmado,
            observaciones_sri: msgSri || (autorizado ? "OK" : "PENDIENTE")
        };

        if (autorizado) {
            updateData.autorizacion_numero = numAuth;
            updateData.fecha_autorizacion = fechaAuth ? new Date(fechaAuth).toISOString() : new Date().toISOString();
        }

        await supabase.from("comprobantes").update(updateData).eq("id", comprobante_id);

        // ─── PASO 4: NOTIFICACIÓN POR CORREO (background, no bloquea la respuesta) ───
        const emailTask = (async () => {
            if (!autorizado || !comprobante.clientes?.email) return;
            try {
                const mailHost = configSri.mail_host as string | undefined;
                const mailUser = configSri.mail_user as string | undefined;
                const mailPass = configSri.mail_pass as string | undefined;

                if (!mailHost || !mailUser || !mailPass) {
                    console.log("[EMAIL] SMTP no configurado en config_sri — saltando envío");
                    return;
                }

                const nombreCliente = (comprobante.clientes?.nombre || "CONSUMIDOR FINAL").toUpperCase();
                const identificacionCliente = comprobante.clientes?.identificacion || "9999999999999";
                const fechaRaw = new Date(comprobante.created_at);
                const fechaEcuador = new Date(fechaRaw.getTime() - 5 * 60 * 60 * 1000);
                const fechaFormat = fechaEcuador.toLocaleDateString("es-EC");
                const nombreEmpresa = (comprobante.empresas?.nombre || comprobante.empresas?.razon_social || "La Empresa").toUpperCase();

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
                    ambiente,
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
                    console.log("[EMAIL] PDF generado, tamaño base64:", pdfB64.length);
                } catch (pdfErr) {
                    console.error("[EMAIL] Error generando PDF:", pdfErr);
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
                attachments.push({
                    filename: `${comprobante.secuencial}.xml`,
                    content: xmlFirmado || '',
                    contentType: 'application/xml; charset=utf-8',
                });

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
                console.log("[EMAIL] Enviado via SMTP a:", comprobante.clientes.email);
            } catch (emailErr) {
                console.error("[EMAIL] Error general:", emailErr);
            }
        })();

        // Mantiene la función viva para completar el email aunque la respuesta ya se entregó
        (globalThis as any).EdgeRuntime?.waitUntil?.(emailTask);

        return new Response(JSON.stringify({
            success: true,
            authorized: autorizado,
            estado_sri,
            message: msgSri
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (e: any) {
        console.error("[sri-signer] ERROR:", e.message);
        return new Response(JSON.stringify({ success: false, error: e.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200
        });
    }
});
