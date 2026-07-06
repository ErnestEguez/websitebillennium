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
  const doc       = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  const empresa   = nc.empresas   || {};
  const cliente   = nc.clientes   || {};
  const detalles  = nc.notas_credito_detalle || [];
  const configSri = empresa.config_sri || {};

  let y = 10;

  // === LOGO ===
  let logoLoaded = false;
  if (empresa.logo_url) {
    try {
      const resp   = await fetch(empresa.logo_url);
      const buf    = await resp.arrayBuffer();
      const imgB64 = toBase64(new Uint8Array(buf));
      const ext    = empresa.logo_url.toLowerCase().includes(".png") ? "PNG" : "JPEG";
      doc.addImage(imgB64, ext, 10, y, 40, 20);
      logoLoaded = true;
    } catch { /* logo no disponible */ }
  }

  // === EMPRESA ===
  const infoX = logoLoaded ? 55 : 10;
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text((empresa.razon_social || empresa.nombre || "EMPRESA").toUpperCase(), infoX, y + 6);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`RUC: ${empresa.ruc || ""}`, infoX, y + 12);
  doc.text(`Dir: ${empresa.direccion || ""}`, infoX, y + 17);
  if (empresa.telefono) doc.text(`Tel: ${empresa.telefono}`, infoX, y + 22);

  // === HEADER NOTA DE CRÉDITO (derecha) ===
  doc.setFillColor(220, 88, 30);  // naranja para diferenciar de factura
  doc.rect(135, y, 65, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("NOTA DE CRÉDITO", 167, y + 6, { align: "center" });
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`Nro: ${nc.secuencial}`, 136, y + 14);
  doc.text(`Fecha: ${fmtFechaEc(nc.created_at || new Date())}`, 136, y + 19);
  doc.text(`Ambiente: ${configSri.ambiente || "PRUEBAS"}`, 136, y + 24);

  y = 38;

  // === CLAVE DE ACCESO ===
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("CLAVE DE ACCESO:", 10, y);
  doc.setFont("helvetica", "normal");
  doc.text((nc.clave_acceso || "").substring(0, 80), 10, y + 4);
  y += 12;

  doc.setDrawColor(180);
  doc.line(10, y, 200, y);
  y += 5;

  // === FACTURA ORIGEN ===
  doc.setFontSize(8);
  doc.setFillColor(255, 243, 235);
  doc.rect(10, y, 190, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.text("FACTURA DE ORIGEN", 12, y + 4);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.text(`Secuencial: ${comprobanteOrigen?.secuencial || "—"}`, 12, y);
  doc.text(`Fecha: ${comprobanteOrigen?.created_at ? fmtFechaEc(comprobanteOrigen.created_at) : "—"}`, 90, y);
  y += 8;

  // === MOTIVO ===
  doc.setFont("helvetica", "bold");
  doc.text("Motivo:", 12, y);
  doc.setFont("helvetica", "normal");
  doc.text((nc.motivo_descripcion || nc.tipo_nc || "—").substring(0, 100), 35, y);
  y += 8;

  doc.line(10, y, 200, y);
  y += 5;

  // === CLIENTE ===
  doc.setFillColor(240, 240, 240);
  doc.rect(10, y, 190, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.text("DATOS DEL COMPRADOR", 12, y + 4);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.text(`Razón Social: ${(cliente.nombre || "CONSUMIDOR FINAL").toUpperCase()}`, 12, y);
  y += 5;
  doc.text(`Identificación: ${cliente.identificacion || "9999999999999"}`, 12, y);
  y += 5;
  doc.text(`Dirección: ${(cliente.direccion || "ECUADOR").toUpperCase()}`, 12, y);
  y += 8;

  doc.line(10, y, 200, y);
  y += 5;

  // === TABLA DETALLES ===
  doc.setFillColor(220, 88, 30);
  doc.rect(10, y, 190, 7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("DESCRIPCIÓN",    12,  y + 5);
  doc.text("CANT",           88,  y + 5, { align: "right" });
  doc.text("P.UNIT S/IVA",  120,  y + 5, { align: "right" });
  doc.text("SUBTOTAL",      148,  y + 5, { align: "right" });
  doc.text("IVA%",          162,  y + 5, { align: "right" });
  doc.text("IVA $",         178,  y + 5, { align: "right" });
  doc.text("TOTAL",         200,  y + 5, { align: "right" });
  doc.setTextColor(0, 0, 0);
  y += 8;

  detalles.forEach((d: any, i: number) => {
    if (i % 2 === 0) {
      doc.setFillColor(255, 250, 245);
      doc.rect(10, y - 2, 190, 6, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    const subtotalLinea = Number(d.subtotal   || 0);
    const ivaLinea      = Number(d.iva_valor  || 0);
    const pctIva        = Number(d.iva_porcentaje || 0);
    const totalLinea    = r2(subtotalLinea + ivaLinea);
    doc.text((d.nombre_producto || "PRODUCTO").toUpperCase().substring(0, 40),  12,  y + 2);
    doc.text(Number(d.cantidad).toFixed(2),                                      88,  y + 2, { align: "right" });
    doc.text(`$${Number(d.precio_unitario).toFixed(4)}`,                        120,  y + 2, { align: "right" });
    doc.text(`$${subtotalLinea.toFixed(2)}`,                                    148,  y + 2, { align: "right" });
    doc.text(`${pctIva.toFixed(0)}%`,                                           162,  y + 2, { align: "right" });
    doc.text(`$${ivaLinea.toFixed(2)}`,                                         178,  y + 2, { align: "right" });
    doc.text(`$${totalLinea.toFixed(2)}`,                                       200,  y + 2, { align: "right" });
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
  doc.setFont("helvetica", "normal");
  ratesConIva.forEach(rate => {
    const e = ivaMap.get(rate)!;
    doc.text(`Subtotal Base IVA ${rate}%:`, 141, y);
    doc.text(`$${e.base.toFixed(2)}`, 200, y, { align: "right" });
    y += 5;
  });
  if (base0 > 0 || ratesConIva.length === 0) {
    doc.text("Subtotal Base 0%:", 141, y);
    doc.text(`$${base0.toFixed(2)}`, 200, y, { align: "right" });
    y += 5;
  }
  doc.text("Subtotal sin Impuestos:", 141, y);
  doc.text(`$${subtotalSinImp.toFixed(2)}`, 200, y, { align: "right" });
  y += 5;
  ratesConIva.forEach(rate => {
    const e = ivaMap.get(rate)!;
    doc.text(`IVA ${rate}%:`, 141, y);
    doc.text(`$${e.iva.toFixed(2)}`, 200, y, { align: "right" });
    y += 5;
  });
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setFillColor(217, 119, 6);
  doc.rect(139, y - 3, 62, 9, "F");
  doc.setTextColor(255, 255, 255);
  doc.text("VALOR NOTA DE CRÉDITO:", 141, y + 3);
  doc.text(`$${Number(nc.total).toFixed(2)}`, 199, y + 3, { align: "right" });
  doc.setTextColor(0, 0, 0);
  y += 12;

  // === AUTORIZACIÓN ===
  doc.setDrawColor(180);
  doc.line(10, y, 200, y);
  y += 4;
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("Nº AUTORIZACIÓN SRI:", 10, y);
  doc.setFont("helvetica", "normal");
  doc.text(nc.autorizacion_numero || "—", 10, y + 5);
  y += 14;
  doc.setFontSize(7);
  doc.setTextColor(100);
  doc.text("Este documento es una representación impresa de una Nota de Crédito Electrónica (RIDE).", 105, y, { align: "center", maxWidth: 190 });
  y += 5;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 77, 184);
  doc.text("www.billenniumsystem.com", 105, y, { align: "center" });

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
