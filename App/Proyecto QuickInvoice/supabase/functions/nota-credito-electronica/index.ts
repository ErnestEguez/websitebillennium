// ============================================================
// EDGE FUNCTION: nota-credito-electronica — QuickInvoice
// Standalone: sin imports locales. Todo inline.
// Genera XML NC (codDoc=04), firma XAdES-BES, envía al SRI,
// genera RIDE PDF con logo e IVA, notifica por Resend.
// Deno runtime (Supabase Edge Functions)
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import forge from "npm:node-forge@1.3.1";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

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
  if (hex.length % 2 !== 0) hex = "0" + hex;
  const binary = hex.match(/.{1,2}/g)?.map((b) => String.fromCharCode(parseInt(b, 16))).join("") || "";
  return btoa(binary);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// ─── Email HTML Builder ──────────────────────────────
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
  <span style="font-size:11px;font-weight:700;padding:4px 14px;border-radius:99px;letter-spacing:1px;color:#c2410c;background:#fff7ed;">${opts.tipo}</span>
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

/** Fecha en zona Ecuador (UTC-5) → "DD/MM/YYYY" */
function fmtFechaEc(dateStr: string | Date): string {
  const raw = typeof dateStr === "string" ? new Date(dateStr) : dateStr;
  const ec = new Date(raw.getTime() - 5 * 60 * 60 * 1000);
  const dd = String(ec.getUTCDate()).padStart(2, "0");
  const mm = String(ec.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = ec.getUTCFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERADOR XML NOTA DE CRÉDITO (codDoc=04) — inline
// ─────────────────────────────────────────────────────────────────────────────

function generarXmlNC(nc: any, comprobanteOrigen: any): string {
  const empresa    = nc.empresas    || {};
  const cliente    = nc.clientes    || {};
  const configSri  = empresa.config_sri || {};
  const detalles   = nc.notas_credito_detalle || [];

  const ambiente    = configSri.ambiente === "PRODUCCION" ? "2" : "1";
  const partes      = (nc.secuencial || "001-001-000000001").split("-");
  const estab       = (partes[0] || "001").padStart(3, "0").slice(-3);
  const pto         = (partes[1] || "001").padStart(3, "0").slice(-3);
  const secuencial9 = (partes[2] || "000000001").padStart(9, "0");

  const fechaEmision    = fmtFechaEc(nc.created_at || new Date());
  // Fecha de la factura origen para el campo fechaEmisionDocSustento
  const fechaSustento   = comprobanteOrigen?.created_at
    ? fmtFechaEc(comprobanteOrigen.created_at)
    : fechaEmision;
  const numDocModificado = comprobanteOrigen?.secuencial || "001-001-000000001";

  // ── Tipo identificación comprador
  const identificacion = (cliente.identificacion || "9999999999999").trim();
  let tipoId: string;
  if (identificacion === "9999999999999")                                  tipoId = "07";
  else if (identificacion.length === 13 && identificacion.endsWith("001")) tipoId = "04";
  else if (identificacion.length === 10)                                   tipoId = "05";
  else                                                                     tipoId = "06";

  // ── Procesar detalles
  const detallesProcesados = detalles.map((d: any) => {
    const cantidad             = Number(d.cantidad        || 0);
    const pctIva               = Number(d.iva_porcentaje  || 0);
    const precioUnitarioSinIva = r2(Number(d.precio_unitario || 0));
    const subtotalSinIva       = r2(Number(d.subtotal         || 0));
    const valorIva             = r2(Number(d.iva_valor        || 0));
    const descuentoValor       = r2(Number(d.descuento || 0) * precioUnitarioSinIva * cantidad / 100);
    const codigoPct            = pctIva === 15 ? "4" : pctIva === 12 ? "2" : pctIva === 5 ? "5" : "0";
    const codigoPrincipal      = (d.productos?.codigo || d.producto_id || "SIN-COD").slice(0, 25);
    return { ...d, cantidad, pctIva, precioUnitarioSinIva, subtotalSinIva, valorIva, descuentoValor, codigoPct, codigoPrincipal };
  });

  // ── Agrupar IVA por tasa
  const ivaMap: Record<string, { base: number; valor: number; codigoPct: string }> = {};
  detallesProcesados.forEach((d: any) => {
    const key = String(d.pctIva);
    if (!ivaMap[key]) ivaMap[key] = { base: 0, valor: 0, codigoPct: d.codigoPct };
    ivaMap[key].base  = r2(ivaMap[key].base  + d.subtotalSinIva);
    ivaMap[key].valor = r2(ivaMap[key].valor + d.valorIva);
  });

  // ── Totales
  const totalSinImpuestosXml = r2(Object.values(ivaMap).reduce((s, iv) => s + iv.base,  0));
  const totalImpuestosXml    = r2(Object.values(ivaMap).reduce((s, iv) => s + iv.valor, 0));
  const valorModificacion    = r2(totalSinImpuestosXml + totalImpuestosXml);

  // ── Bloques XML
  const totalConImpuestosXml = Object.values(ivaMap).map((iv) => `
      <totalImpuesto>
        <codigo>2</codigo>
        <codigoPorcentaje>${iv.codigoPct}</codigoPorcentaje>
        <baseImponible>${iv.base.toFixed(2)}</baseImponible>
        <valor>${iv.valor.toFixed(2)}</valor>
      </totalImpuesto>`).join("");

  // En NC el SRI usa <codigoInterno> (no <codigoPrincipal> como en factura)
  const detallesXml = detallesProcesados.map((d: any) => `
    <detalle>
      <codigoInterno>${d.codigoPrincipal}</codigoInterno>
      <descripcion>${(d.nombre_producto || "Producto").toUpperCase()}</descripcion>
      <cantidad>${d.cantidad.toFixed(6)}</cantidad>
      <precioUnitario>${d.precioUnitarioSinIva.toFixed(6)}</precioUnitario>
      <descuento>${d.descuentoValor.toFixed(2)}</descuento>
      <precioTotalSinImpuesto>${d.subtotalSinIva.toFixed(2)}</precioTotalSinImpuesto>
      <impuestos>
        <impuesto>
          <codigo>2</codigo>
          <codigoPorcentaje>${d.codigoPct}</codigoPorcentaje>
          <tarifa>${d.pctIva.toFixed(0)}</tarifa>
          <baseImponible>${d.subtotalSinIva.toFixed(2)}</baseImponible>
          <valor>${d.valorIva.toFixed(2)}</valor>
        </impuesto>
      </impuestos>
    </detalle>`).join("");

  const rimpeTag = configSri.regimen_rimpe || empresa.razon_social?.includes("RIMPE")
    ? "<contribuyenteRimpe>CONTRIBUYENTE RÉGIMEN RIMPE</contribuyenteRimpe>"
    : "";

  const xml = `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<notaCredito id="comprobante" version="1.1.0">
  <infoTributaria>
    <ambiente>${ambiente}</ambiente>
    <tipoEmision>1</tipoEmision>
    <razonSocial>${(empresa.razon_social || empresa.nombre || "EMPRESA").toUpperCase()}</razonSocial>
    <nombreComercial>${(empresa.nombre || "EMPRESA").toUpperCase()}</nombreComercial>
    <ruc>${empresa.ruc || "9999999999999"}</ruc>
    <claveAcceso>${nc.clave_acceso}</claveAcceso>
    <codDoc>04</codDoc>
    <estab>${estab}</estab>
    <ptoEmi>${pto}</ptoEmi>
    <secuencial>${secuencial9}</secuencial>
    <dirMatriz>${(empresa.direccion || "ECUADOR").toUpperCase()}</dirMatriz>
    ${rimpeTag}
  </infoTributaria>
  <infoNotaCredito>
    <fechaEmision>${fechaEmision}</fechaEmision>
    <dirEstablecimiento>${(empresa.direccion || "LOCAL PRINCIPAL").toUpperCase()}</dirEstablecimiento>
    <tipoIdentificacionComprador>${tipoId}</tipoIdentificacionComprador>
    <razonSocialComprador>${(cliente.nombre || "CONSUMIDOR FINAL").toUpperCase()}</razonSocialComprador>
    <identificacionComprador>${identificacion}</identificacionComprador>
    <obligadoContabilidad>${configSri.obligado_contabilidad || "NO"}</obligadoContabilidad>
    <codDocModificado>01</codDocModificado>
    <numDocModificado>${numDocModificado}</numDocModificado>
    <fechaEmisionDocSustento>${fechaSustento}</fechaEmisionDocSustento>
    <totalSinImpuestos>${totalSinImpuestosXml.toFixed(2)}</totalSinImpuestos>
    <valorModificacion>${valorModificacion.toFixed(2)}</valorModificacion>
    <moneda>DOLAR</moneda>
    <totalConImpuestos>${totalConImpuestosXml}
    </totalConImpuestos>
    <motivo>${(nc.motivo_descripcion || nc.tipo_nc || "Nota de Crédito").substring(0, 300)}</motivo>
  </infoNotaCredito>
  <detalles>${detallesXml}
  </detalles>
  <infoAdicional>
    <campoAdicional nombre="Email">${cliente.email || "S/N"}</campoAdicional>
    <campoAdicional nombre="FacturaOrigen">${numDocModificado}</campoAdicional>
  </infoAdicional>
</notaCredito>`;

  return xml.replace(/\n\s*\n/g, "\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// RIDE PDF NC (jsPDF) — con logo y desglose de IVA
// ─────────────────────────────────────────────────────────────────────────────

async function generarRidePdfNC(nc: any, comprobanteOrigen: any): Promise<Uint8Array> {
  const empresa  = nc.empresas  || {};
  const cliente  = nc.clientes  || {};
  const detalles: any[] = nc.notas_credito_detalle || [];

  const f2 = (n: any) => (Math.round(Number(n??0)*100)/100).toFixed(2);
  const f4 = (n: any) => Number(n??0).toFixed(4);
  const fmtDate = (d: any): string => {
    if (!d) return '';
    const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : fmtFechaEc(d);
  };
  const fmtDT = (d: any): string => {
    if (!d) return 'PENDIENTE';
    try {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return 'PENDIENTE';
      const p = (n: number) => String(n).padStart(2,'0');
      return `${dt.getFullYear()}-${p(dt.getMonth()+1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}:${p(dt.getSeconds())}`;
    } catch { return 'PENDIENTE'; }
  };
  const r2x = (n: any) => Math.round(Number(n??0)*100)/100;

  // IVA breakdown
  const ivaBreakdown: Record<string, { base: number; iva: number }> = {};
  let totalDescuento = 0;
  detalles.forEach((d: any) => {
    const rate = String(d.iva_porcentaje??0);
    const base = r2x(d.subtotal);
    const iva  = r2x(d.iva_valor ?? (base*Number(rate)/100));
    const dcto = r2x(Number(d.precio_unitario??0)*Number(d.cantidad??0)*(Number(d.descuento??0)/100));
    if (!ivaBreakdown[rate]) ivaBreakdown[rate] = { base:0, iva:0 };
    ivaBreakdown[rate].base = r2x(ivaBreakdown[rate].base+base);
    ivaBreakdown[rate].iva  = r2x(ivaBreakdown[rate].iva +iva);
    totalDescuento = r2x(totalDescuento+dcto);
  });
  const ratesConIva = Object.keys(ivaBreakdown).filter(r => r!=='0').sort((a,b) => Number(a)-Number(b));
  const subtotalSinImpuestos = r2x(Object.values(ivaBreakdown).reduce((s,v) => s+v.base, 0));
  const valorTotal = r2x(nc.total ?? subtotalSinImpuestos + ratesConIva.reduce((s,r) => s+(ivaBreakdown[r]?.iva??0), 0));

  const claveAcceso  = nc.clave_acceso || '';
  const autorizacion = nc.autorizacion_numero || claveAcceso;
  const ambiente     = (nc.ambiente || (empresa.config_sri||{}).ambiente || 'PRODUCCION').toUpperCase();
  const obligado     = empresa.obligado_contabilidad ? 'SI' : 'NO';
  const fechaNC      = nc.fecha_emision || nc.created_at;

  // QR
  let qrDataUrl = '';
  if (claveAcceso) {
    try {
      const QRCode = (await import('npm:qrcode')).default;
      qrDataUrl = await QRCode.toDataURL(claveAcceso, { margin:1, width:120 });
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

  const doc = new jsPDF({ orientation:'p', unit:'mm', format:'a4' });
  const ML=10; const CW=190; const RX=200; const PH=284;
  const S400: [number,number,number] = [148,163,184];
  const S200: [number,number,number] = [226,232,240];
  const S100: [number,number,number] = [241,245,249];
  const ORAN: [number,number,number] = [254,215,170]; // orange-200 para NC
  const sd4 = () => { doc.setDrawColor(...S400); doc.setLineWidth(0.4); };
  const sd2 = () => { doc.setDrawColor(...S200); doc.setLineWidth(0.2); };
  const sf1 = () => doc.setFillColor(...S100);
  const sfO = () => doc.setFillColor(...ORAN);

  let y = 10;

  // ── HEADER (empresa 55% | NOTA DE CRÉDITO 45%) ──────────────────────
  const LW=104.5; const RW=85.5; const DIV=ML+LW;
  const RH1=7, RH2=8, RH3=7, RH4=10, RH5=7, RH6=9;
  const HDR_H = RH1+RH2+RH3+RH4+RH5+RH6;

  sfO(); doc.rect(DIV, y+RH1, RW, RH2, 'F');
  sd4();
  doc.rect(ML, y, CW, HDR_H);
  doc.line(DIV, y, DIV, y+HDR_H);
  doc.line(DIV, y+RH1,                 DIV+RW, y+RH1);
  doc.line(DIV, y+RH1+RH2,             DIV+RW, y+RH1+RH2);
  doc.line(DIV, y+RH1+RH2+RH3,         DIV+RW, y+RH1+RH2+RH3);
  doc.line(DIV, y+RH1+RH2+RH3+RH4,     DIV+RW, y+RH1+RH2+RH3+RH4);
  doc.line(DIV, y+RH1+RH2+RH3+RH4+RH5, DIV+RW, y+RH1+RH2+RH3+RH4+RH5);

  doc.setTextColor(0,0,0);
  let lY = y+2;
  if (logoB64) { doc.addImage(logoB64, logoExt, ML+2, lY, 40, 16); lY += 18; }
  doc.setFontSize(10.5); doc.setFont('helvetica','bold');
  const empNom = (empresa.razon_social||empresa.nombre||'').toUpperCase();
  const empLines = doc.splitTextToSize(empNom, LW-4);
  doc.text(empLines, ML+2, lY+3);
  lY += empLines.length*4+2;
  doc.setFontSize(7.5); doc.setFont('helvetica','normal');
  if (empresa.direccion) { doc.text(`Dir Matriz: ${empresa.direccion}`, ML+2, lY); lY += 4; }
  if (empresa.telefono)  { doc.text(`Telf. ${empresa.telefono}`, ML+2, lY); lY += 4; }
  doc.setFont('helvetica','bold');
  doc.text(`OBLIGADO A LLEVAR CONTABILIDAD ${obligado}`, ML+2, lY);

  let rY = y;
  doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(0,0,0);
  doc.text(`R.U.C.: ${empresa.ruc||''}`, DIV+RW/2, rY+RH1*0.65, { align:'center' });
  rY += RH1;
  doc.setFontSize(10); doc.setFont('helvetica','bold');
  doc.text('NOTA DE CRÉDITO', DIV+RW/2, rY+RH2*0.65, { align:'center' });
  rY += RH2;
  doc.setFontSize(8); doc.setFont('helvetica','normal');
  doc.text(`No. ${nc.secuencial||''}`, DIV+RW/2, rY+RH3*0.65, { align:'center' });
  rY += RH3;
  doc.setFontSize(7); doc.setFont('helvetica','bold');
  doc.text('NÚMERO DE AUTORIZACIÓN', DIV+2, rY+3.5);
  doc.setFont('helvetica','normal'); doc.setFontSize(6.5);
  doc.text(doc.splitTextToSize(autorizacion, RW-4).slice(0,2), DIV+2, rY+6.5);
  rY += RH4;
  doc.setFontSize(7); doc.setFont('helvetica','bold');
  doc.text('FECHA Y HORA DE AUTORIZACIÓN', DIV+2, rY+3.5);
  doc.setFont('helvetica','normal');
  doc.text(fmtDT(nc.fecha_autorizacion), DIV+RW-2, rY+3.5, { align:'right' });
  rY += RH5;
  doc.setFontSize(7.5); doc.setFont('helvetica','bold');
  doc.text('AMBIENTE:', DIV+2, rY+3.5);
  doc.setFont('helvetica','normal');
  doc.text(ambiente, DIV+RW-2, rY+3.5, { align:'right' });
  doc.setFont('helvetica','bold');
  doc.text('EMISIÓN:', DIV+2, rY+7);
  doc.setFont('helvetica','normal');
  doc.text('NORMAL', DIV+RW-2, rY+7, { align:'right' });
  y += HDR_H;

  // ── CLAVE DE ACCESO + QR ────────────────────────────────────────────
  const CA_H = 14;
  sd4(); doc.rect(ML, y, CW, CA_H);
  doc.setFontSize(7.5); doc.setFont('helvetica','bold'); doc.setTextColor(0,0,0);
  doc.text('CLAVE DE ACCESO', ML+2, y+4);
  doc.setFontSize(6.5); doc.setFont('helvetica','normal');
  doc.text(doc.splitTextToSize(claveAcceso, CW-28), ML+2, y+9);
  if (qrDataUrl) doc.addImage(qrDataUrl, 'PNG', RX-22, y+1, 20, 12);
  y += CA_H;

  // ── DATOS DEL COMPRADOR + FACTURA ORIGEN + MOTIVO ───────────────────
  const ORIG_H = 20;
  sd4(); doc.rect(ML, y, CW, ORIG_H);
  doc.setFontSize(7.5); doc.setTextColor(0,0,0);
  let oy = y+4;
  doc.setFont('helvetica','bold'); doc.text('Razón Social: ', ML+2, oy);
  doc.setFont('helvetica','normal');
  doc.text((cliente.nombre||'CONSUMIDOR FINAL').toUpperCase(), ML+2+doc.getTextWidth('Razón Social: '), oy);
  doc.setFont('helvetica','bold'); doc.text('RUC / CI: ', ML+CW*0.55+1, oy);
  doc.setFont('helvetica','normal');
  doc.text(cliente.identificacion||'9999999999999', ML+CW*0.55+1+doc.getTextWidth('RUC / CI: '), oy);
  oy += 5;
  doc.setFont('helvetica','bold'); doc.text('Fecha Emisión NC: ', ML+2, oy);
  doc.setFont('helvetica','normal');
  doc.text(fmtDate(fechaNC), ML+2+doc.getTextWidth('Fecha Emisión NC: '), oy);
  doc.setFont('helvetica','bold'); doc.text('Factura de Origen: ', ML+CW*0.55+1, oy);
  doc.setFont('helvetica','normal');
  doc.text(comprobanteOrigen?.secuencial||'—', ML+CW*0.55+1+doc.getTextWidth('Factura de Origen: '), oy);
  oy += 5;
  doc.setFont('helvetica','bold'); doc.text('Motivo: ', ML+2, oy);
  doc.setFont('helvetica','normal');
  const motivoTxt = (nc.motivo_descripcion||nc.tipo_nc||'—').substring(0,120);
  doc.text(doc.splitTextToSize(motivoTxt, CW-doc.getTextWidth('Motivo: ')-4)[0]||motivoTxt, ML+2+doc.getTextWidth('Motivo: '), oy);
  y += ORIG_H;

  // ── TABLA DETALLES (9 columnas, mismo formato que factura) ──────────
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
  ]; // 190 total
  const colXs: number[] = [];
  { let cx = ML; COLS.forEach(c => { colXs.push(cx); cx += c.w; }); }
  const TH=6; const TR=5.5;
  const drawHdr = (hy: number) => {
    sfO(); doc.rect(ML, hy, CW, TH, 'F');
    sd4(); doc.rect(ML, hy, CW, TH);
    sd2();
    COLS.forEach((c,i) => {
      if (i>0) doc.line(colXs[i], hy, colXs[i], hy+TH);
      doc.setFontSize(6.5); doc.setFont('helvetica','bold'); doc.setTextColor(0,0,0);
      const tx = c.align==='right'?colXs[i]+c.w-1:c.align==='center'?colXs[i]+c.w/2:colXs[i]+1;
      doc.text(c.label, tx, hy+TH*0.7, { align: c.align });
    });
  };
  drawHdr(y); y += TH;

  detalles.forEach((d: any, i: number) => {
    if (y+TR > PH) { doc.addPage(); y=10; drawHdr(y); y += TH; }
    if (i%2 !== 0) { sf1(); doc.rect(ML, y, CW, TR, 'F'); }
    sd4(); doc.rect(ML, y, CW, TR);
    sd2(); COLS.forEach((_,j) => { if (j>0) doc.line(colXs[j], y, colXs[j], y+TR); });
    const ivaRate = Number(d.iva_porcentaje??0);
    const dcto    = Number(d.descuento??0);
    const dctoV   = r2x(Number(d.precio_unitario??0)*Number(d.cantidad??0)*dcto/100);
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

  // ── INFO ADICIONAL (55%) | TOTALES NC (45%) ──────────────────────────
  const totRows: Array<{ label: string; val: string; last?: boolean }> = [];
  ratesConIva.forEach(r => totRows.push({ label:`SUBTOTAL BASE IVA ${r} %`, val:f2(ivaBreakdown[r]?.base) }));
  totRows.push({ label:'SUBTOTAL 0%',               val:f2(ivaBreakdown['0']?.base) });
  totRows.push({ label:'SUBTOTAL No sujeto de IVA', val:'0.00' });
  totRows.push({ label:'DESCUENTO',                  val:f2(totalDescuento) });
  totRows.push({ label:'SUBTOTAL SIN IMPUESTOS',     val:f2(subtotalSinImpuestos) });
  totRows.push({ label:'ICE', val:'0.00' });
  ratesConIva.forEach(r => totRows.push({ label:`IVA ${r} %`, val:f2(ivaBreakdown[r]?.iva) }));
  totRows.push({ label:'PROPINA', val:'0.00' });
  totRows.push({ label:'VALOR NOTA DE CRÉDITO', val:f2(valorTotal), last:true });

  const TotRH=5.5; const totH=totRows.length*TotRH;
  const infoItems = [
    { label:'Dirección', val:cliente.direccion },
    { label:'Teléfono',  val:cliente.telefono },
    { label:'Email',     val:cliente.email },
  ].filter(it => it.val);
  const leftH = 8+infoItems.length*4.5;
  const S5_H = Math.max(totH, leftH)+4;
  if (y+S5_H+9 > PH) { doc.addPage(); y=10; }

  sd4(); doc.rect(ML, y, CW, S5_H);
  doc.line(DIV, y, DIV, y+S5_H);

  let totY = y;
  totRows.forEach(row => {
    if (row.last) { sfO(); doc.rect(DIV, totY, RW, TotRH, 'F'); }
    sd2(); doc.rect(DIV, totY, RW, TotRH);
    doc.setFontSize(row.last?9:7.5); doc.setFont('helvetica','bold'); doc.setTextColor(0,0,0);
    doc.text(row.label, DIV+1.5, totY+TotRH*0.65);
    doc.text(row.val,   DIV+RW-1.5, totY+TotRH*0.65, { align:'right' });
    totY += TotRH;
  });

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
  y += S5_H;

  // ── FOOTER ──────────────────────────────────────────────────────────
  if (y+8 > PH) { doc.addPage(); y=10; }
  const FH=7;
  sd4(); doc.rect(ML, y, CW, FH);
  doc.setFontSize(6.5); doc.setFont('helvetica','normal'); doc.setTextColor(150,150,150);
  doc.text('Este documento es una representación impresa de una Nota de Crédito Electrónica (RIDE)', ML+2, y+FH*0.65);
  doc.setFontSize(7.5); doc.setFont('helvetica','bold'); doc.setTextColor(70,70,70);
  doc.text('www.billenniumsystem.com', RX-2, y+FH*0.65, { align:'right' });

  return new Uint8Array(doc.output("arraybuffer"));
}

// ─────────────────────────────────────────────────────────────────────────────
// FIRMA XAdES-BES — mismo algoritmo que factura, cierra </notaCredito>
// ─────────────────────────────────────────────────────────────────────────────

async function firmarXmlXadesBes(
  xmlContent: string,
  p12Base64: string,
  p12Password: string
): Promise<string> {
  const p12Der   = atob(p12Base64);
  const p12Asn1  = forge.asn1.fromDer(p12Der, { strict: false, parseAllBytes: false });
  const p12      = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, p12Password || "");

  const keyBags  = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });

  const privateKeyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] || Object.values(keyBags).flat()[0];
  const certBag       = certBags[forge.pki.oids.certBag]?.[0];

  if (!privateKeyBag?.key || !certBag?.cert) throw new Error("Credenciales inválidas en .p12");

  const privateKey = privateKeyBag.key;
  const cert       = certBag.cert;

  const certDerBytes = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
  const certB64      = btoa(certDerBytes);
  const certSha1B64  = await sha1b64(new Uint8Array(certDerBytes.split("").map((c: string) => c.charCodeAt(0))));

  const issuerDN = cert.issuer.attributes
    .slice().reverse()
    .map((a: any) => `${a.shortName}=${a.value}`)
    .join(",");

  const serialNumber = BigInt("0x" + cert.serialNumber).toString();
  const modulusB64   = hexToB64(privateKey.n.toString(16));
  const exponentB64  = hexToB64(privateKey.e.toString(16));

  const ts                     = Date.now();
  const signatureId            = `Signature-${ts}`;
  const keyInfoId              = `KeyInfoId-${signatureId}`;
  const signedPropertiesId     = `SignedProperties-${signatureId}`;
  const referenceComprobanteId = `Reference-ID-${ts}`;
  const xadesObjectId          = `XadesObjectId-${ts}`;
  const qualifyingPropsId      = `QualifyingProperties-${ts}`;

  const now         = new Date();
  const ecuadorDate = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  const signingTime = ecuadorDate.toISOString().split(".")[0] + "-05:00";

  const xmlLimpio = xmlContent.replace(/<\?xml[^?]*\?>/i, "").trim();
  const digestXml = await sha1b64(new TextEncoder().encode(xmlLimpio));

  const spContent = `<xades:SignedSignatureProperties><xades:SigningTime>${signingTime}</xades:SigningTime><xades:SigningCertificate><xades:Cert><xades:CertDigest><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod><ds:DigestValue>${certSha1B64}</ds:DigestValue></xades:CertDigest><xades:IssuerSerial><ds:X509IssuerName>${issuerDN}</ds:X509IssuerName><ds:X509SerialNumber>${serialNumber}</ds:X509SerialNumber></xades:IssuerSerial></xades:Cert></xades:SigningCertificate></xades:SignedSignatureProperties><xades:SignedDataObjectProperties><xades:DataObjectFormat ObjectReference="#${referenceComprobanteId}"><xades:Description>contenido comprobante</xades:Description><xades:MimeType>text/xml</xades:MimeType><xades:Encoding>UTF-8</xades:Encoding></xades:DataObjectFormat></xades:SignedDataObjectProperties>`;

  const signedPropertiesToHash = `<xades:SignedProperties xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="${signedPropertiesId}">${spContent}</xades:SignedProperties>`;
  const digestSP = await sha1b64(new TextEncoder().encode(signedPropertiesToHash));

  const keyInfoContent = `<ds:X509Data><ds:X509Certificate>${certB64}</ds:X509Certificate></ds:X509Data><ds:KeyValue><ds:RSAKeyValue><ds:Modulus>${modulusB64}</ds:Modulus><ds:Exponent>${exponentB64}</ds:Exponent></ds:RSAKeyValue></ds:KeyValue>`;
  const keyInfoToHash  = `<ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="${keyInfoId}">${keyInfoContent}</ds:KeyInfo>`;
  const digestKI       = await sha1b64(new TextEncoder().encode(keyInfoToHash));

  const signedInfoToSign = `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:CanonicalizationMethod><ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></ds:SignatureMethod><ds:Reference Id="${referenceComprobanteId}" URI="#comprobante"><ds:Transforms><ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></ds:Transform></ds:Transforms><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod><ds:DigestValue>${digestXml}</ds:DigestValue></ds:Reference><ds:Reference Id="ReferenceKeyInfo" URI="#${keyInfoId}"><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod><ds:DigestValue>${digestKI}</ds:DigestValue></ds:Reference><ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#${signedPropertiesId}"><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod><ds:DigestValue>${digestSP}</ds:DigestValue></ds:Reference></ds:SignedInfo>`;

  const md = forge.md.sha1.create();
  md.update(signedInfoToSign, "utf8");
  const signatureValue = btoa(privateKey.sign(md)).replace(/\r?\n|\r/g, "");

  const signatureXml = `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="${signatureId}">${signedInfoToSign}<ds:SignatureValue Id="SignatureValue-${ts}">${signatureValue}</ds:SignatureValue><ds:KeyInfo Id="${keyInfoId}">${keyInfoContent}</ds:KeyInfo><ds:Object Id="${xadesObjectId}"><xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="${qualifyingPropsId}" Target="#${signatureId}"><xades:SignedProperties Id="${signedPropertiesId}">${spContent}</xades:SignedProperties></xades:QualifyingProperties></ds:Object></ds:Signature>`;

  // NC cierra </notaCredito> — diferente de </factura>
  return xmlContent.replace("</notaCredito>", `${signatureXml}</notaCredito>`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINTS SRI
// ─────────────────────────────────────────────────────────────────────────────

const SRI_ENDPOINTS = {
  PRODUCCION: {
    recepcion:    "https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline",
    autorizacion: "https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline",
  },
  PRUEBAS: {
    recepcion:    "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline",
    autorizacion: "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { nota_credito_id, solo_consulta } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { db: { schema: "facturacion" } }
    );

    // ── Obtener NC base (evitar joins complejos que fallan en schema cache)
    const { data: nc, error: fetchErr } = await supabase
      .from("notas_credito")
      .select("*")
      .eq("id", nota_credito_id)
      .single();

    if (fetchErr || !nc) throw new Error(`NC no encontrada: ${fetchErr?.message}`);

    // ── Consultas separadas (evita "relationship not in schema cache")
    const [
      { data: clienteData },
      { data: empresaData },
      { data: detallesData },
      { data: origenData },
    ] = await Promise.all([
      supabase.from("clientes").select("*").eq("id", nc.cliente_id).single(),
      supabase.from("empresas").select("*").eq("id", nc.empresa_id).single(),
      supabase.from("notas_credito_detalle").select("*").eq("nota_credito_id", nota_credito_id),
      supabase.from("comprobantes").select("secuencial, created_at, clave_acceso").eq("id", nc.comprobante_origen_id).single(),
    ]);

    nc.clientes             = clienteData  || {};
    nc.empresas             = empresaData  || {};
    nc.notas_credito_detalle = detallesData || [];
    const comprobanteOrigenResolved = origenData || null;

    // ── Obtener códigos de productos en consulta separada
    const productoIds = (nc.notas_credito_detalle || [])
      .map((d: any) => d.producto_id)
      .filter(Boolean);

    const codigosMap: Record<string, string> = {};
    if (productoIds.length > 0) {
      const { data: prods } = await supabase
        .from("productos")
        .select("id, codigo")
        .in("id", productoIds);
      if (prods) prods.forEach((p: any) => { codigosMap[p.id] = p.codigo; });
    }

    nc.notas_credito_detalle = (nc.notas_credito_detalle || []).map((d: any) => ({
      ...d,
      productos: { codigo: codigosMap[d.producto_id] || null },
    }));

    const comprobanteOrigen = comprobanteOrigenResolved;
    const configSri         = nc.empresas.config_sri || {};
    const ambiente          = configSri.ambiente === "PRODUCCION" ? "PRODUCCION" : "PRUEBAS";
    const endpoints         = SRI_ENDPOINTS[ambiente as keyof typeof SRI_ENDPOINTS];

    const cleanMsg = (txt: string) => txt.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

    let xmlFirmado = nc.xml_firmado;
    let msgSri     = "";
    let autorizado = false;
    let estado_sri = nc.estado_sri;
    let numAuth    = nc.autorizacion_numero;
    let fechaAuth  = nc.fecha_autorizacion;

    // ── PASO 1: Consultar si ya está autorizada
    const soapAut = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns2:autorizacionComprobante xmlns:ns2="http://ec.gob.sri.ws.autorizacion"><claveAccesoComprobante>${nc.clave_acceso}</claveAccesoComprobante></ns2:autorizacionComprobante></soap:Body></soap:Envelope>`;

    const resAutPrev  = await fetch(endpoints.autorizacion, { method: "POST", body: soapAut, headers: { "Content-Type": "text/xml" } });
    const textAutPrev = await resAutPrev.text();
    console.log("[NC] CLAVE:", nc.clave_acceso);
    console.log("[NC] AUT-PREV:", textAutPrev.substring(0, 800));

    autorizado = textAutPrev.includes("<estado>AUTORIZADO</estado>");

    if (autorizado) {
      estado_sri = "AUTORIZADO";
      numAuth    = textAutPrev.match(/<numeroAutorizacion>(.*?)<\/numeroAutorizacion>/s)?.[1] ?? numAuth;
      fechaAuth  = textAutPrev.match(/<fechaAutorizacion>(.*?)<\/fechaAutorizacion>/s)?.[1]   ?? fechaAuth;
    } else {
      const rawMsg  = textAutPrev.match(/<mensaje>(.*?)<\/mensaje>/s)?.[1]                           || "";
      const rawInfo = textAutPrev.match(/<informacionAdicional>(.*?)<\/informacionAdicional>/s)?.[1] || "";
      msgSri = cleanMsg(`${rawMsg} ${rawInfo}`);
      console.log("[NC] MSG-PREV:", msgSri);

      if (msgSri.includes("CLAVE ACCESO REGISTRADA") || msgSri.includes("EN PROCESAMIENTO") || msgSri.includes("PROCESAMIENTO")) {
        estado_sri = "ENVIADO";
        msgSri     = `SRI (CLAVE YA REGISTRADA): ${msgSri}`;
      } else if (!solo_consulta) {
        // ── PASO 2: Firmar XML
        const { data: firmaBlob } = await supabase.storage.from("firmas_electronicas").download(configSri.firma_path);
        if (!firmaBlob) throw new Error("Firma no encontrada. Suba el .p12 en Configuración.");

        const firmaB64   = toBase64(await firmaBlob.arrayBuffer());
        const xmlSinFirma = generarXmlNC(nc, comprobanteOrigen);
        xmlFirmado        = await firmarXmlXadesBes(xmlSinFirma, firmaB64, configSri.firma_password);

        console.log("[NC] XML generado. Longitud:", xmlSinFirma.length);

        // ── PASO 3: Recepción SRI
        const xmlB64        = btoa(unescape(encodeURIComponent(xmlFirmado)));
        const soapRecepcion = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns2:validarComprobante xmlns:ns2="http://ec.gob.sri.ws.recepcion"><xml>${xmlB64}</xml></ns2:validarComprobante></soap:Body></soap:Envelope>`;

        const resRec  = await fetch(endpoints.recepcion, { method: "POST", body: soapRecepcion, headers: { "Content-Type": "text/xml" } });
        const textRec = await resRec.text();
        console.log("[NC] RECEPCION:", textRec.substring(0, 800));

        if (textRec.includes("RECIBIDA")) {
          estado_sri = "ENVIADO";
          msgSri     = "RECIBIDA POR SRI";
          await new Promise((r) => setTimeout(r, 4000));
        } else {
          const recMsg  = textRec.match(/<mensaje>(.*?)<\/mensaje>/s)?.[1]                           || "";
          const recInfo = textRec.match(/<informacionAdicional>(.*?)<\/informacionAdicional>/s)?.[1] || "";
          msgSri = `REC:${cleanMsg(`${recMsg} ${recInfo}`)}`;

          if (msgSri.includes("CLAVE ACCESO REGISTRADA") || msgSri.includes("EN PROCESAMIENTO")) {
            estado_sri = "ENVIADO";
          } else {
            estado_sri = "RECHAZADO";
            msgSri     = msgSri || "Error en recepción de la NC.";
          }
        }

        // ── PASO 4: Autorización post-recepción
        if (estado_sri === "ENVIADO") {
          const resAutPost  = await fetch(endpoints.autorizacion, { method: "POST", body: soapAut, headers: { "Content-Type": "text/xml" } });
          const textAutPost = await resAutPost.text();
          console.log("[NC] AUT-POST:", textAutPost.substring(0, 800));

          autorizado = textAutPost.includes("<estado>AUTORIZADO</estado>");

          if (autorizado) {
            estado_sri = "AUTORIZADO";
            numAuth    = textAutPost.match(/<numeroAutorizacion>(.*?)<\/numeroAutorizacion>/s)?.[1] ?? undefined;
            fechaAuth  = textAutPost.match(/<fechaAutorizacion>(.*?)<\/fechaAutorizacion>/s)?.[1]   ?? undefined;
            msgSri     = "OK";
          } else {
            const autMsg  = textAutPost.match(/<mensaje>(.*?)<\/mensaje>/s)?.[1]                           || "";
            const autInfo = textAutPost.match(/<informacionAdicional>(.*?)<\/informacionAdicional>/s)?.[1] || "";
            msgSri = `AUT:${cleanMsg(`${autMsg} ${autInfo}`) || textAutPost.substring(0, 300)}`;
          }
        }
      }
    }

    // ── PASO 5: Actualizar notas_credito
    const updateData: any = {
      estado_sri,
      xml_firmado:       xmlFirmado,
      observaciones_sri: msgSri || (autorizado ? "OK" : "PENDIENTE"),
      updated_at:        new Date().toISOString(),
    };
    if (autorizado) {
      updateData.autorizacion_numero = numAuth;
    }
    const { error: updateErr } = await supabase.from("notas_credito").update(updateData).eq("id", nota_credito_id);
    if (updateErr) {
      console.error("[NC] ERROR UPDATE notas_credito:", updateErr.message, updateErr.code);
      throw new Error(`Error actualizando NC en BD: ${updateErr.message}`);
    }
    console.log("[NC] UPDATE exitoso. estado_sri:", estado_sri, "autorizado:", autorizado);

    // ── PASO 6: Email con RIDE PDF + XML si fue autorizada (SMTP)
    if (autorizado && nc.clientes?.email) {
      try {
        const mailHost = configSri.mail_host as string | undefined;
        const mailUser = configSri.mail_user as string | undefined;
        const mailPass = configSri.mail_pass as string | undefined;

        if (!mailHost || !mailUser || !mailPass) {
          console.log("[NC-EMAIL] SMTP no configurado — saltando envío");
        } else {
          const nombreCliente = (nc.clientes?.nombre || "CONSUMIDOR FINAL").toUpperCase();
          const idCliente     = nc.clientes?.identificacion || "9999999999999";
          const fechaFmt      = fmtFechaEc(nc.created_at || new Date());
          const nombreEmpresa = (nc.empresas?.nombre || nc.empresas?.razon_social || "La Empresa").toUpperCase();

          const extraRows = `
    <tr style="border-bottom:1px solid #f3f4f6;"><td style="color:#6b7280;">Factura de origen</td><td align="right" style="color:#374151;">${comprobanteOrigen?.secuencial || "—"}</td></tr>
    <tr><td style="color:#6b7280;">Motivo</td><td align="right" style="color:#374151;">${nc.motivo_descripcion || nc.tipo_nc || "—"}</td></tr>`;

          const emailHtml = buildEmailHtml({
            tipo: "NOTA DE CRÉDITO ELECTRÓNICA",
            nombreCliente,
            identificacionCliente: idCliente,
            nombreEmpresa,
            ruc: nc.empresas?.ruc || "",
            logoUrl: nc.empresas?.logo_url || null,
            secuencial: nc.secuencial,
            fechaFormat: fechaFmt,
            total: Number(nc.total).toFixed(2),
            extraRows,
            accentBg: "#fff7ed",
            accentBorder: "#fed7aa",
          });

          // Generar RIDE PDF
          let pdfB64: string | null = null;
          try {
            const ridePdfBytes = await generarRidePdfNC(nc, comprobanteOrigen);
            let pdfBin = "";
            const chunk = 8192;
            for (let i = 0; i < ridePdfBytes.length; i += chunk) {
              pdfBin += String.fromCharCode(...ridePdfBytes.subarray(i, Math.min(i + chunk, ridePdfBytes.length)));
            }
            pdfB64 = btoa(pdfBin);
            console.log("[NC-EMAIL] PDF generado, b64 len:", pdfB64.length);
          } catch (pdfErr) {
            console.error("[NC-EMAIL] Error generando PDF:", pdfErr);
          }

          const attachments: any[] = [];
          if (pdfB64) {
            attachments.push({ filename: `RIDE_NC_${nc.secuencial}.pdf`, content: pdfB64, encoding: "base64", contentType: "application/pdf" });
          }
          attachments.push({ filename: `NC_${nc.secuencial}.xml`, content: xmlFirmado || "", contentType: "application/xml; charset=utf-8" });

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
            to: nc.clientes.email,
            cc: (configSri.mail_cc as string | undefined) || undefined,
            subject: `Nota de Crédito Autorizada ${nc.secuencial} - ${nombreEmpresa}`,
            html: emailHtml,
            attachments,
          });
          console.log("[NC-EMAIL] Enviado via SMTP a:", nc.clientes.email);
        }
      } catch (emailErr) {
        console.error("[NC-EMAIL] Error general:", emailErr);
      }
    }

    return new Response(
      JSON.stringify({
        success:              true,
        authorized:           autorizado,
        estado_sri,
        message:              msgSri,
        autorizacion_numero:  numAuth,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("[nota-credito-electronica] ERROR:", e.message);
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }
});
