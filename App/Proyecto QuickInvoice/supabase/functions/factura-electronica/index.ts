// ============================================================
// EDGE FUNCTION: factura-electronica — QuickInvoice
// Standalone: sin imports locales. Todo inline.
// Firma XAdES-BES, envía al SRI, genera RIDE PDF, notifica por Resend.
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

/** Redondeo a 2 decimales en cada paso para evitar acumulación de float */
const r2 = (n: number) => Math.round(n * 100) / 100;

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
// GENERADOR DE XML SRI v1.1.0 (inline, sin import local)
// ─────────────────────────────────────────────────────────────────────────────

function generarXmlFactura(comprobante: any): string {
  const empresa   = comprobante.empresas || {};
  const cliente   = comprobante.clientes || {};
  const configSri = empresa.config_sri   || {};
  const detalles  = comprobante.comprobante_detalles || [];
  const pagos     = comprobante.comprobante_pagos    || [];

  const ambiente     = configSri.ambiente === "PRODUCCION" ? "2" : "1";
  const partes       = (comprobante.secuencial || "001-001-000000001").split("-");
  const estab        = (partes[0] || "001").padStart(3, "0").slice(-3);
  const pto          = (partes[1] || "001").padStart(3, "0").slice(-3);
  const secuencial9  = (partes[2] || "000000001").padStart(9, "0");
  const fechaEmision = fmtFechaEc(comprobante.created_at || new Date());

  // ── Procesar detalles (precio_unitario en DB ya es SIN IVA)
  const detallesProcesados = detalles.map((d: any) => {
    const cantidad             = Number(d.cantidad        || 0);
    const pctIva               = Number(d.iva_porcentaje  || 0);
    const precioUnitarioSinIva = r2(Number(d.precio_unitario || 0));
    const subtotalItemSinIva   = r2(Number(d.subtotal         || 0)); // pre-calculado en DB
    const valorIvaItem         = r2(Number(d.iva_valor        || 0)); // pre-calculado en DB
    const descuentoPct         = Number(d.descuento || 0);
    const descuentoValor       = r2(precioUnitarioSinIva * cantidad * descuentoPct / 100);
    const codigoPct            = pctIva === 15 ? "4" : pctIva === 12 ? "2" : pctIva === 5 ? "5" : "0";

    return { ...d, cantidad, pctIva, precioUnitarioSinIva, subtotalItemSinIva, valorIvaItem, descuentoValor, codigoPct };
  });

  // ── Agrupar IVA por tasa para <totalConImpuestos>
  const ivaMap: Record<string, { base: number; valor: number; codigoPct: string }> = {};
  detallesProcesados.forEach((d: any) => {
    const key = String(d.pctIva);
    if (!ivaMap[key]) ivaMap[key] = { base: 0, valor: 0, codigoPct: d.codigoPct };
    ivaMap[key].base  = r2(ivaMap[key].base  + d.subtotalItemSinIva);
    ivaMap[key].valor = r2(ivaMap[key].valor + d.valorIvaItem);
  });

  // ── Totales: derivados de los mismos valores redondeados del XML
  const totalSinImpuestosXml = r2(Object.values(ivaMap).reduce((s, iv) => s + iv.base,  0));
  const totalImpuestosXml    = r2(Object.values(ivaMap).reduce((s, iv) => s + iv.valor, 0));
  const importeTotalXml      = r2(totalSinImpuestosXml + totalImpuestosXml);

  // ── Bloques XML
  const totalConImpuestosXml = Object.values(ivaMap).map((iv) => `
      <totalImpuesto>
        <codigo>2</codigo>
        <codigoPorcentaje>${iv.codigoPct}</codigoPorcentaje>
        <baseImponible>${iv.base.toFixed(2)}</baseImponible>
        <valor>${iv.valor.toFixed(2)}</valor>
      </totalImpuesto>`).join("");

  const detallesXml = detallesProcesados.map((d: any) => {
    // Usar codigo de la tabla productos si viene del join; fallback al producto_id
    const codigoPrincipal = (d.productos?.codigo || d.codigo_producto || d.producto_id || "SIN-COD").slice(0, 25);
    return `
    <detalle>
      <codigoPrincipal>${codigoPrincipal}</codigoPrincipal>
      <descripcion>${(d.nombre_producto || "Producto").toUpperCase()}</descripcion>
      <cantidad>${d.cantidad.toFixed(6)}</cantidad>
      <precioUnitario>${d.precioUnitarioSinIva.toFixed(6)}</precioUnitario>
      <descuento>${d.descuentoValor.toFixed(2)}</descuento>
      <precioTotalSinImpuesto>${d.subtotalItemSinIva.toFixed(2)}</precioTotalSinImpuesto>
      <impuestos>
        <impuesto>
          <codigo>2</codigo>
          <codigoPorcentaje>${d.codigoPct}</codigoPorcentaje>
          <tarifa>${d.pctIva.toFixed(0)}</tarifa>
          <baseImponible>${d.subtotalItemSinIva.toFixed(2)}</baseImponible>
          <valor>${d.valorIvaItem.toFixed(2)}</valor>
        </impuesto>
      </impuestos>
    </detalle>`;
  }).join("");

  // ── Pagos
  const formasPagoSri: Record<string, string> = {
    efectivo:        "01",
    tarjeta:         "19",
    tarjeta_credito: "19",
    tarjeta_debito:  "20",
    transferencia:   "17",
    cheque:          "15",
    credito:         "16",
    otros:           "01",
  };
  const pagosXml = pagos.length > 0
    ? pagos.map((p: any) => `
      <pago>
        <formaPago>${formasPagoSri[p.metodo_pago] || "01"}</formaPago>
        <total>${Number(p.valor).toFixed(2)}</total>
      </pago>`).join("")
    : `
      <pago>
        <formaPago>01</formaPago>
        <total>${importeTotalXml.toFixed(2)}</total>
      </pago>`;

  // ── Tipo de identificación comprador
  const identificacion = (cliente.identificacion || "9999999999999").trim();
  let tipoId: string;
  if (identificacion === "9999999999999")                                 tipoId = "07";
  else if (identificacion.length === 13 && identificacion.endsWith("001")) tipoId = "04";
  else if (identificacion.length === 10)                                  tipoId = "05";
  else                                                                    tipoId = "06";

  const rimpeTag = configSri.regimen_rimpe || empresa.razon_social?.includes("RIMPE")
    ? "<contribuyenteRimpe>CONTRIBUYENTE RÉGIMEN RIMPE</contribuyenteRimpe>"
    : "";

  const xml = `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<factura id="comprobante" version="1.1.0">
  <infoTributaria>
    <ambiente>${ambiente}</ambiente>
    <tipoEmision>1</tipoEmision>
    <razonSocial>${(empresa.razon_social || empresa.nombre || "EMPRESA").toUpperCase()}</razonSocial>
    <nombreComercial>${(empresa.nombre || "EMPRESA").toUpperCase()}</nombreComercial>
    <ruc>${empresa.ruc || "9999999999999"}</ruc>
    <claveAcceso>${comprobante.clave_acceso}</claveAcceso>
    <codDoc>01</codDoc>
    <estab>${estab}</estab>
    <ptoEmi>${pto}</ptoEmi>
    <secuencial>${secuencial9}</secuencial>
    <dirMatriz>${(empresa.direccion || "ECUADOR").toUpperCase()}</dirMatriz>
    ${rimpeTag}
  </infoTributaria>
  <infoFactura>
    <fechaEmision>${fechaEmision}</fechaEmision>
    <dirEstablecimiento>${(empresa.direccion || "LOCAL PRINCIPAL").toUpperCase()}</dirEstablecimiento>
    <obligadoContabilidad>${configSri.obligado_contabilidad || "NO"}</obligadoContabilidad>
    <tipoIdentificacionComprador>${tipoId}</tipoIdentificacionComprador>
    <razonSocialComprador>${(cliente.nombre || "CONSUMIDOR FINAL").toUpperCase()}</razonSocialComprador>
    <identificacionComprador>${identificacion}</identificacionComprador>
    <direccionComprador>${(cliente.direccion || "ECUADOR").toUpperCase()}</direccionComprador>
    <totalSinImpuestos>${totalSinImpuestosXml.toFixed(2)}</totalSinImpuestos>
    <totalDescuento>0.00</totalDescuento>
    <totalConImpuestos>${totalConImpuestosXml}
    </totalConImpuestos>
    <propina>0.00</propina>
    <importeTotal>${importeTotalXml.toFixed(2)}</importeTotal>
    <moneda>DOLAR</moneda>
    <pagos>${pagosXml}
    </pagos>
  </infoFactura>
  <detalles>${detallesXml}
  </detalles>
  <infoAdicional>
    <campoAdicional nombre="Email">${cliente.email || "S/N"}</campoAdicional>
    <campoAdicional nombre="Direccion">${cliente.direccion || "S/N"}</campoAdicional>
  </infoAdicional>
</factura>`;

  return xml.replace(/\n\s*\n/g, "\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// RIDE PDF (jsPDF) — inline
// ─────────────────────────────────────────────────────────────────────────────

async function generarRidePdf(comprobante: any): Promise<Uint8Array> {
  const doc       = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  const empresa   = comprobante.empresas || {};
  const cliente   = comprobante.clientes || {};
  const detalles  = comprobante.comprobante_detalles || [];
  const pagos     = comprobante.comprobante_pagos    || [];
  const configSri = empresa.config_sri || {};

  let y = 10;

  // === LOGO ===
  let logoLoaded = false;
  if (empresa.logo_url) {
    try {
      const resp = await fetch(empresa.logo_url);
      const buf  = await resp.arrayBuffer();
      const imgB64 = toBase64(new Uint8Array(buf));
      const ext  = empresa.logo_url.toLowerCase().includes(".png") ? "PNG" : "JPEG";
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

  // === HEADER FACTURA (derecha) ===
  doc.setFillColor(30, 77, 184);
  doc.rect(135, y, 65, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("FACTURA", 167, y + 6, { align: "center" });
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`Nro: ${comprobante.secuencial}`, 136, y + 14);
  doc.text(`Fecha: ${fmtFechaEc(comprobante.created_at || new Date())}`, 136, y + 19);
  doc.text(`Ambiente: ${configSri.ambiente || "PRUEBAS"}`, 136, y + 24);

  y = 38;

  // === CLAVE DE ACCESO ===
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("CLAVE DE ACCESO:", 10, y);
  doc.setFont("helvetica", "normal");
  doc.text((comprobante.clave_acceso || "").substring(0, 80), 10, y + 4);
  y += 12;

  doc.setDrawColor(180);
  doc.line(10, y, 200, y);
  y += 5;

  // === CLIENTE ===
  doc.setFontSize(8);
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
  doc.setFillColor(30, 77, 184);
  doc.rect(10, y, 190, 7, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.text("DESCRIPCIÓN",       12,  y + 5);
  doc.text("CANT",              92,  y + 5, { align: "right" });
  doc.text("P.UNIT S/IVA",     127,  y + 5, { align: "right" });
  doc.text("SUBTOTAL",         155,  y + 5, { align: "right" });
  doc.text("IVA",              175,  y + 5, { align: "right" });
  doc.text("TOTAL",            200,  y + 5, { align: "right" });
  doc.setTextColor(0, 0, 0);
  y += 8;

  let subtotalBase = 0;
  let totalIvaAcc  = 0;

  detalles.forEach((d: any, i: number) => {
    if (i % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(10, y - 2, 190, 6, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    const subtotalLinea = Number(d.subtotal  || 0);
    const ivaLinea      = Number(d.iva_valor || 0);
    const totalLinea    = r2(subtotalLinea + ivaLinea);
    doc.text((d.nombre_producto || "PRODUCTO").toUpperCase().substring(0, 48), 12, y + 2);
    doc.text(Number(d.cantidad).toFixed(2),              92,  y + 2, { align: "right" });
    doc.text(`$${Number(d.precio_unitario).toFixed(4)}`, 127, y + 2, { align: "right" });
    doc.text(`$${subtotalLinea.toFixed(2)}`,             155, y + 2, { align: "right" });
    doc.text(`$${ivaLinea.toFixed(2)}`,                  175, y + 2, { align: "right" });
    doc.text(`$${totalLinea.toFixed(2)}`,                200, y + 2, { align: "right" });
    subtotalBase += subtotalLinea;
    totalIvaAcc  += ivaLinea;
    y += 6;
    if (y > 265) { doc.addPage(); y = 15; }
  });

  y += 3;
  doc.line(140, y, 200, y);
  y += 5;

  // === TOTALES ===
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("Subtotal sin IVA:", 141, y);
  doc.text(`$${subtotalBase.toFixed(2)}`, 200, y, { align: "right" });
  y += 5;
  doc.text("IVA:", 141, y);
  doc.text(`$${totalIvaAcc.toFixed(2)}`, 200, y, { align: "right" });
  y += 5;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL:", 141, y);
  doc.text(`$${Number(comprobante.total).toFixed(2)}`, 200, y, { align: "right" });
  y += 8;

  // === PAGOS ===
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  if (pagos.length > 0) {
    const pagoTexto = pagos
      .map((p: any) => `${(p.metodo_pago || "").replace("_", " ")} $${Number(p.valor).toFixed(2)}`)
      .join(" | ");
    doc.text(`Forma de Pago: ${pagoTexto}`, 10, y);
    y += 8;
  }

  // === AUTORIZACIÓN ===
  doc.line(10, y, 200, y);
  y += 5;
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.text("Nº AUTORIZACIÓN:", 10, y);
  doc.setFont("helvetica", "normal");
  doc.text(comprobante.autorizacion_numero || "", 10, y + 4);
  y += 12;
  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text(
    "Este documento es una representación impresa de un Comprobante Electrónico (RIDE)",
    10, y, { maxWidth: 190 }
  );

  return new Uint8Array(doc.output("arraybuffer"));
}

// ─────────────────────────────────────────────────────────────────────────────
// FIRMA XAdES-BES — inline
// ─────────────────────────────────────────────────────────────────────────────

async function firmarXmlXadesBes(
  xmlContent: string,
  p12Base64: string,
  p12Password: string
): Promise<string> {
  const p12Der   = atob(p12Base64);
  const p12Asn1  = forge.asn1.fromDer(p12Der);
  const p12      = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, p12Password);

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

  const ts                   = Date.now();
  const signatureId          = `Signature-${ts}`;
  const keyInfoId            = `KeyInfoId-${signatureId}`;
  const signedPropertiesId   = `SignedProperties-${signatureId}`;
  const referenceComprobanteId = `Reference-ID-${ts}`;
  const xadesObjectId        = `XadesObjectId-${ts}`;
  const qualifyingPropsId    = `QualifyingProperties-${ts}`;

  const now        = new Date();
  const ecuadorDate = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  const signingTime = ecuadorDate.toISOString().split(".")[0] + "-05:00";

  const xmlLimpio  = xmlContent.replace(/<\?xml[^?]*\?>/i, "").trim();
  const digestXml  = await sha1b64(new TextEncoder().encode(xmlLimpio));

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

  return xmlContent.replace("</factura>", `${signatureXml}</factura>`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINTS SRI
// ─────────────────────────────────────────────────────────────────────────────

const SRI_ENDPOINTS = {
  PRODUCCION: {
    recepcion:     "https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline",
    autorizacion:  "https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline",
  },
  PRUEBAS: {
    recepcion:     "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline",
    autorizacion:  "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// HANDLER PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { comprobante_id, solo_consulta } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Obtener comprobante completo. Sin join a productos para evitar error de FK en schema cache.
    const { data: comprobante, error: fetchErr } = await supabase
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

    if (fetchErr || !comprobante) throw new Error(`Comprobante no encontrado: ${fetchErr?.message}`);

    // Obtener códigos de productos en consulta separada (evita FK schema cache issue)
    const productoIds = (comprobante.comprobante_detalles || [])
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

    // Inyectar código en cada detalle para uso en XML
    comprobante.comprobante_detalles = (comprobante.comprobante_detalles || []).map((d: any) => ({
      ...d,
      productos: { codigo: codigosMap[d.producto_id] || null },
    }));

    const configSri = comprobante.empresas.config_sri || {};
    const ambiente  = configSri.ambiente === "PRODUCCION" ? "PRODUCCION" : "PRUEBAS";
    const endpoints = SRI_ENDPOINTS[ambiente as keyof typeof SRI_ENDPOINTS];

    const cleanMsg = (txt: string) => txt.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

    let xmlFirmado  = comprobante.xml_firmado;
    let msgSri      = "";
    let autorizado  = false;
    let estado_sri  = comprobante.estado_sri;
    let numAuth     = comprobante.autorizacion_numero;
    let fechaAuth   = comprobante.fecha_autorizacion;

    // ── PASO 1: Consultar si ya está autorizado
    const soapAut = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns2:autorizacionComprobante xmlns:ns2="http://ec.gob.sri.ws.autorizacion"><claveAccesoComprobante>${comprobante.clave_acceso}</claveAccesoComprobante></ns2:autorizacionComprobante></soap:Body></soap:Envelope>`;

    const resAutPrev  = await fetch(endpoints.autorizacion, { method: "POST", body: soapAut, headers: { "Content-Type": "text/xml" } });
    const textAutPrev = await resAutPrev.text();
    console.log("[FE] CLAVE:", comprobante.clave_acceso);
    console.log("[FE] AUT-PREV:", textAutPrev.substring(0, 800));

    autorizado = textAutPrev.includes("<estado>AUTORIZADO</estado>");

    if (autorizado) {
      estado_sri = "AUTORIZADO";
      numAuth    = textAutPrev.match(/<numeroAutorizacion>(.*?)<\/numeroAutorizacion>/s)?.[1] ?? numAuth;
      fechaAuth  = textAutPrev.match(/<fechaAutorizacion>(.*?)<\/fechaAutorizacion>/s)?.[1]   ?? fechaAuth;
    } else {
      const rawMsg  = textAutPrev.match(/<mensaje>(.*?)<\/mensaje>/s)?.[1]                           || "";
      const rawInfo = textAutPrev.match(/<informacionAdicional>(.*?)<\/informacionAdicional>/s)?.[1] || "";
      msgSri = cleanMsg(`${rawMsg} ${rawInfo}`);
      console.log("[FE] MSG-PREV:", msgSri);

      if (msgSri.includes("CLAVE ACCESO REGISTRADA") || msgSri.includes("EN PROCESAMIENTO") || msgSri.includes("PROCESAMIENTO")) {
        estado_sri = "ENVIADO";
        msgSri     = `SRI (CLAVE YA REGISTRADA): ${msgSri}`;
      } else if (!solo_consulta) {
        // ── PASO 2: Firmar XML
        const { data: firmaBlob } = await supabase.storage.from("firmas_electronicas").download(configSri.firma_path);
        if (!firmaBlob) throw new Error("Firma no encontrada. Suba el .p12 en Configuración.");

        const firmaB64  = toBase64(await firmaBlob.arrayBuffer());
        const xmlSinFirma = generarXmlFactura(comprobante);
        xmlFirmado = await firmarXmlXadesBes(xmlSinFirma, firmaB64, configSri.firma_password);

        console.log("[FE] XML generado. Total XML sin firma:", xmlSinFirma.length);

        // ── PASO 3: Enviar al SRI (recepción)
        const xmlB64       = btoa(unescape(encodeURIComponent(xmlFirmado)));
        const soapRecepcion = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns2:validarComprobante xmlns:ns2="http://ec.gob.sri.ws.recepcion"><xml>${xmlB64}</xml></ns2:validarComprobante></soap:Body></soap:Envelope>`;

        const resRec  = await fetch(endpoints.recepcion, { method: "POST", body: soapRecepcion, headers: { "Content-Type": "text/xml" } });
        const textRec = await resRec.text();
        console.log("[FE] RECEPCION:", textRec.substring(0, 800));

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
            msgSri = msgSri || "Error en recepción del comprobante.";
          }
        }

        // ── PASO 4: Autorización post-recepción
        if (estado_sri === "ENVIADO") {
          const resAutPost  = await fetch(endpoints.autorizacion, { method: "POST", body: soapAut, headers: { "Content-Type": "text/xml" } });
          const textAutPost = await resAutPost.text();
          console.log("[FE] AUT-POST:", textAutPost.substring(0, 800));

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

    // ── PASO 5: Actualizar base de datos
    const updateData: any = {
      estado_sri,
      xml_firmado: xmlFirmado,
      observaciones_sri: msgSri || (autorizado ? "OK" : "PENDIENTE"),
    };
    if (autorizado) {
      updateData.autorizacion_numero = numAuth;
      updateData.fecha_autorizacion  = fechaAuth ? new Date(fechaAuth).toISOString() : new Date().toISOString();
    }
    await supabase.from("comprobantes").update(updateData).eq("id", comprobante_id);

    // ── PASO 6: Email con RIDE PDF + XML si fue autorizado
    if (autorizado && comprobante.clientes?.email) {
      try {
        const resendApiKey   = Deno.env.get("RESEND_API_KEY");
        const nombreCliente  = (comprobante.clientes?.nombre || "CONSUMIDOR FINAL").toUpperCase();
        const idCliente      = comprobante.clientes?.identificacion || "9999999999999";
        const fechaFmt       = fmtFechaEc(comprobante.created_at || new Date());
        const nombreEmpresa  = (comprobante.empresas?.nombre || comprobante.empresas?.razon_social || "La Empresa").toUpperCase();

        const emailHtml = `<div style="font-family: Arial, sans-serif; padding: 20px;">
  <h2>Factura Electrónica Autorizada</h2>
  <p>Estimado/a <strong>${nombreCliente}</strong>,</p>
  <p>Su factura <strong>${comprobante.secuencial}</strong> del ${fechaFmt} fue <strong style="color:green">AUTORIZADA</strong> por el SRI.</p>
  <p><b>Identificación:</b> ${idCliente}<br><b>Total:</b> $${Number(comprobante.total).toFixed(2)}</p>
  <p>Se adjuntan el RIDE (PDF) y el XML firmado autorizado por el SRI.</p>
  <p>Atentamente,<br><strong>${nombreEmpresa}</strong></p>
</div>`;

        // Generar PDF (RIDE)
        let pdfB64: string | null = null;
        try {
          const ridePdfBytes = await generarRidePdf(comprobante);
          let pdfBin = "";
          const chunk = 8192;
          for (let i = 0; i < ridePdfBytes.length; i += chunk) {
            pdfBin += String.fromCharCode(...ridePdfBytes.subarray(i, Math.min(i + chunk, ridePdfBytes.length)));
          }
          pdfB64 = btoa(pdfBin);
          console.log("[FE-EMAIL] PDF generado, b64 len:", pdfB64.length);
        } catch (pdfErr) {
          console.error("[FE-EMAIL] Error generando PDF:", pdfErr);
        }

        // Codificar XML
        let xmlEmailB64: string;
        try {
          xmlEmailB64 = btoa(unescape(encodeURIComponent(xmlFirmado || "")));
        } catch {
          xmlEmailB64 = btoa(xmlFirmado || "");
        }

        const attachments: { filename: string; content: string }[] = [];
        if (pdfB64) attachments.push({ filename: `RIDE_${comprobante.secuencial}.pdf`, content: pdfB64 });
        attachments.push({ filename: `${comprobante.secuencial}.xml`, content: xmlEmailB64 });

        const resendFrom = configSri.resend_from
          ? `Facturación ${nombreEmpresa} <${configSri.resend_from}>`
          : "Facturación <onboarding@resend.dev>";

        const resendRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from:        resendFrom,
            to:          comprobante.clientes.email,
            subject:     `Factura Autorizada ${comprobante.secuencial} - ${nombreEmpresa}`,
            html:        emailHtml,
            attachments,
          }),
        });

        const resendResult = await resendRes.json();
        if (!resendRes.ok) {
          console.error("[FE-EMAIL] Resend error:", JSON.stringify(resendResult));
        } else {
          console.log("[FE-EMAIL] Enviado. ID:", resendResult.id);
        }
      } catch (emailErr) {
        console.error("[FE-EMAIL] Error general:", emailErr);
      }
    }

    return new Response(
      JSON.stringify({ success: true, authorized: autorizado, estado_sri, message: msgSri }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("[factura-electronica] ERROR:", e.message);
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  }
});
