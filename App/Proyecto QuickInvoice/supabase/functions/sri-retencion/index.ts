// ============================================================
// EDGE FUNCTION: sri-retencion — VendorManagement
// Firma XAdES-BES y envía comprobantes de retención al SRI
// Deno runtime (Supabase Edge Functions)
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
// @deno-types="https://esm.sh/forge@0.10.0/dist/forge.min.d.ts"
import forge from "npm:node-forge@1.3.1";
import { generarXmlRetencion } from "./xmlGeneratorRetencion.ts";
import { jsPDF } from "npm:jspdf@2.5.1";

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
    if (hex.length % 2 !== 0) hex = "0" + hex;
    const binary = hex.match(/.{1,2}/g)?.map(
        (byte) => String.fromCharCode(parseInt(byte, 16))
    ).join("") || "";
    return btoa(binary);
}

// ─── Clave de Acceso (49 dígitos, módulo 11) ───────────────

function generarClaveAcceso(params: {
    fechaEmision: string   // YYYY-MM-DD
    ruc:          string
    ambiente:     string   // '1' | '2'
    estab:        string   // 3 digits
    pto:          string   // 3 digits
    secuencial:   string   // 9 digits
}): string {
    const { fechaEmision, ruc, ambiente, estab, pto, secuencial } = params
    const [y, m, d] = fechaEmision.split('-')
    const fecha8    = `${d}${m}${y}`
    const codNum    = String(Math.floor(Math.random() * 1e8)).padStart(8, '0')
    const base48    = `${fecha8}07${ruc}${ambiente}${estab}${pto}${secuencial}${codNum}1`

    if (base48.length !== 48) {
        console.warn("[ClaveAcceso] base48 length:", base48.length, base48)
    }

    const weights = [2, 3, 4, 5, 6, 7]
    let sum = 0
    for (let i = 0; i < base48.length; i++) {
        sum += parseInt(base48[i], 10) * weights[i % 6]
    }
    const residuo  = 11 - (sum % 11)
    const verifier = residuo === 11 ? 0 : residuo === 10 ? 1 : residuo

    return base48 + verifier.toString()
}

// ─── XAdES-BES Signer ──────────────────────────────────────

async function firmarXmlRetencion(
    xmlContent: string,
    p12Base64:  string,
    p12Password: string
): Promise<string> {
    const p12Der  = atob(p12Base64);
    const p12Asn1 = forge.asn1.fromDer(p12Der, { strict: false, parseAllBytes: false });
    const p12     = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, p12Password || "");

    const keyBags  = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });

    const privateKeyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ||
        Object.values(keyBags).flat()[0];
    const certBag = certBags[forge.pki.oids.certBag]?.[0];

    if (!privateKeyBag?.key || !certBag?.cert)
        throw new Error("Credenciales inválidas en .p12");

    const privateKey = privateKeyBag.key;
    const cert       = certBag.cert;

    const certDerBytes = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
    const certB64      = btoa(certDerBytes);
    const certSha1B64  = await sha1b64(
        new Uint8Array(certDerBytes.split("").map((c) => c.charCodeAt(0)))
    );

    const issuerDN = cert.issuer.attributes
        .slice().reverse()
        .map((a: any) => `${a.shortName}=${a.value}`)
        .join(",");

    const serialNumber = BigInt("0x" + cert.serialNumber).toString();
    const modulusB64   = hexToB64(privateKey.n.toString(16));
    const exponentB64  = hexToB64(privateKey.e.toString(16));

    const ts                    = Date.now();
    const signatureId           = `Signature-${ts}`;
    const keyInfoId             = `KeyInfoId-${signatureId}`;
    const signedPropertiesId    = `SignedProperties-${signatureId}`;
    const referenceComprobanteId = `Reference-ID-${ts}`;
    const xadesObjectId         = `XadesObjectId-${ts}`;
    const qualifyingPropsId     = `QualifyingProperties-${ts}`;

    const now = new Date();
    const ecuadorDate = new Date(now.getTime() - 5 * 60 * 60 * 1000);
    const signingTime = ecuadorDate.toISOString().split(".")[0] + "-05:00";

    const xmlLimpio  = xmlContent.replace(/<\?xml[^?]*\?>/i, "").trim();
    const digestXml  = await sha1b64(new TextEncoder().encode(xmlLimpio));

    const spContent = `<xades:SignedSignatureProperties><xades:SigningTime>${signingTime}</xades:SigningTime><xades:SigningCertificate><xades:Cert><xades:CertDigest><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod><ds:DigestValue>${certSha1B64}</ds:DigestValue></xades:CertDigest><xades:IssuerSerial><ds:X509IssuerName>${issuerDN}</ds:X509IssuerName><ds:X509SerialNumber>${serialNumber}</ds:X509SerialNumber></xades:IssuerSerial></xades:Cert></xades:SigningCertificate></xades:SignedSignatureProperties><xades:SignedDataObjectProperties><xades:DataObjectFormat ObjectReference="#${referenceComprobanteId}"><xades:Description>contenido comprobante</xades:Description><xades:MimeType>text/xml</xades:MimeType><xades:Encoding>UTF-8</xades:Encoding></xades:DataObjectFormat></xades:SignedDataObjectProperties>`;

    const signedPropertiesToHash = `<xades:SignedProperties xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="${signedPropertiesId}">${spContent}</xades:SignedProperties>`;
    const digestSP = await sha1b64(new TextEncoder().encode(signedPropertiesToHash));

    const keyInfoContent  = `<ds:X509Data><ds:X509Certificate>${certB64}</ds:X509Certificate></ds:X509Data><ds:KeyValue><ds:RSAKeyValue><ds:Modulus>${modulusB64}</ds:Modulus><ds:Exponent>${exponentB64}</ds:Exponent></ds:RSAKeyValue></ds:KeyValue>`;
    const keyInfoToHash   = `<ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="${keyInfoId}">${keyInfoContent}</ds:KeyInfo>`;
    const digestKI        = await sha1b64(new TextEncoder().encode(keyInfoToHash));

    const signedInfoToSign = `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:CanonicalizationMethod><ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></ds:SignatureMethod><ds:Reference Id="${referenceComprobanteId}" URI="#comprobante"><ds:Transforms><ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></ds:Transform></ds:Transforms><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod><ds:DigestValue>${digestXml}</ds:DigestValue></ds:Reference><ds:Reference Id="ReferenceKeyInfo" URI="#${keyInfoId}"><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod><ds:DigestValue>${digestKI}</ds:DigestValue></ds:Reference><ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#${signedPropertiesId}"><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod><ds:DigestValue>${digestSP}</ds:DigestValue></ds:Reference></ds:SignedInfo>`;

    const md = forge.md.sha1.create();
    md.update(signedInfoToSign, "utf8");
    const signatureValue = btoa(privateKey.sign(md)).replace(/\r?\n|\r/g, "");

    const signatureXml = `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="${signatureId}">${signedInfoToSign}<ds:SignatureValue Id="SignatureValue-${ts}">${signatureValue}</ds:SignatureValue><ds:KeyInfo Id="${keyInfoId}">${keyInfoContent}</ds:KeyInfo><ds:Object Id="${xadesObjectId}"><xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="${qualifyingPropsId}" Target="#${signatureId}"><xades:SignedProperties Id="${signedPropertiesId}">${spContent}</xades:SignedProperties></xades:QualifyingProperties></ds:Object></ds:Signature>`;

    return xmlContent.replace(
        "</comprobanteRetencion>",
        `${signatureXml}</comprobanteRetencion>`
    );
}

// ─── Email helpers ───────────────────────────────────────────

function buildEmailHtml(opts: {
    tipo: string; nombreCliente: string; identificacionCliente: string;
    nombreEmpresa: string; ruc: string; logoUrl?: string | null;
    secuencial: string; fechaFormat: string; total: string;
    ambiente?: string; extraRows?: string;
}): string {
    const logoHtml = opts.logoUrl
        ? `<img src="${opts.logoUrl}" alt="" style="max-height:55px;max-width:180px;display:block;margin:0 auto;">`
        : `<span style="color:#fff;font-weight:800;font-size:18px;">${opts.nombreEmpresa}</span>`;
    const esPrueba = (opts.ambiente ?? "PRUEBAS") !== "PRODUCCION";
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
<tr><td style="background:#fefce8;padding:22px 32px;text-align:center;border-top:2px solid #fde68a;border-bottom:2px solid #fde68a;">
  <p style="margin:0 0 4px;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;">Total Retenido</p>
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

async function generarRideRetencionPdf(opts: {
    empresa: any; proveedor: any; compra: any;
    claveAcceso: string; estab: string; pto: string; secuencial: string;
    fechaEmision: string; numAuth?: string; fechaAuth?: string;
    retenciones: { tipo: string; codigo_retencion: string; base_imponible: number; porcentaje: number; valor: number }[];
}): Promise<Uint8Array> {
    const f2 = (n: any) => Number(n ?? 0).toFixed(2);
    const fmtDate = (d: any): string => {
        const m = String(d ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d ?? "");
    };
    const configSri = opts.empresa.config_sri || {};
    const ambiente = ((configSri.ambiente || "PRUEBAS") as string).toUpperCase();
    const numRet = `${opts.estab}-${opts.pto}-${opts.secuencial}`;

    let logoB64 = ""; let logoExt = "PNG";
    if (opts.empresa.logo_url) {
        try {
            const resp = await fetch(opts.empresa.logo_url);
            logoB64 = toBase64(new Uint8Array(await resp.arrayBuffer()));
            logoExt = opts.empresa.logo_url.toLowerCase().includes(".png") ? "PNG" : "JPEG";
        } catch { /* logo unavailable */ }
    }

    let qrDataUrl = "";
    if (opts.claveAcceso) {
        try {
            const QRCode = (await import("npm:qrcode")).default;
            qrDataUrl = await QRCode.toDataURL(opts.claveAcceso, { margin: 1, width: 120 });
        } catch { /* QR unavailable */ }
    }

    const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const ML = 10; const CW = 190; const RX = 200; const PH = 284;
    const S400: [number,number,number] = [148, 163, 184];
    const S200: [number,number,number] = [226, 232, 240];
    const S100: [number,number,number] = [241, 245, 249];
    const sd4 = () => { doc.setDrawColor(...S400); doc.setLineWidth(0.4); };
    const sf1 = () => doc.setFillColor(...S100);

    let y = 10;
    const LW = 104.5; const RW = 85.5; const DIV = ML + LW;
    const HDR_H = 48;
    const RH1=7, RH2=8, RH3=7, RH4=10, RH5=7, RH6=9;
    sf1(); doc.rect(DIV, y+RH1, RW, RH2, "F");
    sd4();
    doc.rect(ML, y, CW, HDR_H);
    doc.line(DIV, y, DIV, y+HDR_H);
    [RH1, RH1+RH2, RH1+RH2+RH3, RH1+RH2+RH3+RH4, RH1+RH2+RH3+RH4+RH5].forEach(o =>
        doc.line(DIV, y+o, DIV+RW, y+o));

    let lY = y + 2;
    if (logoB64) { doc.addImage(logoB64, logoExt, ML+2, lY, 40, 16); lY += 18; }
    const empNom = (opts.empresa.razon_social || opts.empresa.nombre || "").toUpperCase();
    doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text(doc.splitTextToSize(empNom, LW-4), ML+2, lY+3);
    lY += doc.splitTextToSize(empNom, LW-4).length * 4 + 2;
    doc.setFontSize(7.5); doc.setFont("helvetica", "normal");
    if (opts.empresa.direccion) { doc.text(`Dir: ${opts.empresa.direccion}`, ML+2, lY); lY += 4; }
    doc.setFont("helvetica", "bold");
    doc.text(`R.U.C.: ${opts.empresa.ruc || ""}`, ML+2, lY);

    const rX = DIV + 2; let rY = y + 2;
    doc.setFontSize(6.5); doc.setFont("helvetica", "normal");
    doc.text("R.U.C.", rX, rY + RH1 - 1);
    doc.setFontSize(8.5); doc.setFont("helvetica", "bold");
    doc.text(opts.empresa.ruc || "", rX, rY + RH1 + 3.5);
    rY += RH1 + RH2;
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(100, 0, 200);
    doc.text("COMPROBANTE DE RETENCIÓN", DIV + RW/2, rY + 4.5, { align: "center" });
    doc.setTextColor(0,0,0);
    rY += RH3;
    doc.setFontSize(6.5); doc.setFont("helvetica", "normal");
    doc.text("Número:", rX, rY + 3); doc.setFont("helvetica", "bold");
    doc.text(numRet, rX + 20, rY + 3);
    rY += RH4;
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
    doc.text("NÚMERO DE AUTORIZACIÓN:", rX, rY + 4);
    doc.setFont("helvetica", "bold"); doc.setFontSize(6);
    doc.text((opts.numAuth || "").substring(0, 49), rX, rY + 8);
    rY += RH5;
    const ambLabel = ambiente === "PRODUCCION" ? "AMBIENTE: PRODUCCIÓN" : "AMBIENTE: PRUEBAS";
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
    doc.text(ambLabel, rX, rY + 3);
    doc.text("EMISIÓN NORMAL", rX, rY + 6.5);
    doc.text(`Fecha Auth: ${opts.fechaAuth ? fmtDate(opts.fechaAuth.substring(0,10)) : "--"}`, rX, rY + 9.5);

    y += HDR_H + 4;

    // Proveedor info
    sd4(); sf1(); doc.rect(ML, y, CW, 6, "FD");
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(0,0,0);
    doc.text("DATOS DEL PROVEEDOR", ML+2, y+4.5);
    y += 6;
    sd4(); doc.rect(ML, y, CW, 14); doc.line(ML+100, y, ML+100, y+14);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    doc.text("Razón Social:", ML+2, y+4); doc.setFont("helvetica", "bold");
    doc.text(opts.proveedor.nombre_empresa || "", ML+2, y+8);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7);
    doc.text("RUC / Identificación:", ML+2, y+12); doc.setFont("helvetica", "bold");
    doc.text(opts.proveedor.ruc || "", ML+30, y+12);
    doc.setFont("helvetica", "normal");
    doc.text("Fecha Emisión:", ML+102, y+4); doc.setFont("helvetica", "bold");
    doc.text(fmtDate(opts.fechaEmision), ML+125, y+4);
    doc.setFont("helvetica", "normal");
    doc.text("Doc. Sustento:", ML+102, y+8); doc.setFont("helvetica", "bold");
    doc.text(opts.compra.numero_factura || "", ML+125, y+8);
    doc.setFont("helvetica", "normal");
    doc.text("Fecha Doc. Sustento:", ML+102, y+12); doc.setFont("helvetica", "bold");
    doc.text(fmtDate(opts.compra.fecha_emision || ""), ML+132, y+12);
    y += 18;

    // Retenciones table
    sd4(); sf1(); doc.rect(ML, y, CW, 6, "FD");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(0,0,0);
    doc.text("DETALLE DE RETENCIONES", ML+2, y+4.5);
    y += 6;

    const cols = [
        { label: "Tipo", x: ML+2, w: 12 },
        { label: "Código", x: ML+14, w: 16 },
        { label: "Base Imponible", x: ML+30, w: 35 },
        { label: "% Retención", x: ML+65, w: 30 },
        { label: "Valor Retenido", x: ML+95, w: 95 },
    ];
    sd4(); sf1(); doc.rect(ML, y, CW, 6, "FD");
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5);
    cols.forEach(c => doc.text(c.label, c.x, y+4));
    y += 6;

    doc.setFont("helvetica", "normal");
    let totalRet = 0;
    for (const r of opts.retenciones) {
        const rowH = 6;
        doc.setDrawColor(...S200); doc.setLineWidth(0.2);
        doc.rect(ML, y, CW, rowH);
        doc.setFontSize(6.5);
        doc.text(r.tipo === "IR" ? "IR" : "IVA", cols[0].x, y+4);
        doc.text(r.codigo_retencion || "", cols[1].x, y+4);
        doc.text(f2(r.base_imponible), cols[2].x+30, y+4, { align: "right" });
        doc.text(f2(r.porcentaje) + "%", cols[3].x+20, y+4, { align: "right" });
        doc.text(f2(r.valor), RX-5, y+4, { align: "right" });
        totalRet += Number(r.valor ?? 0);
        y += rowH;
    }
    // Total row
    sf1(); doc.rect(ML, y, CW, 7, "FD"); sd4(); doc.rect(ML, y, CW, 7);
    doc.setFont("helvetica", "bold"); doc.setFontSize(8);
    doc.text("TOTAL RETENIDO:", ML+2, y+5);
    doc.text(`$${f2(totalRet)}`, RX-5, y+5, { align: "right" });
    y += 12;

    // Clave acceso
    if (opts.claveAcceso) {
        sd4(); sf1(); doc.rect(ML, y, CW, 5, "FD");
        doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.text("CLAVE DE ACCESO:", ML+2, y+3.5);
        y += 5;
        doc.rect(ML, y, CW, 8);
        doc.setFont("helvetica", "normal"); doc.setFontSize(6);
        doc.text(opts.claveAcceso || "", ML + CW/2, y+5, { align: "center" });
        y += 10;
        if (qrDataUrl) { doc.addImage(qrDataUrl, "PNG", ML + CW/2 - 15, y, 30, 30); y += 32; }
    }

    return doc.output("arraybuffer") as unknown as Uint8Array;
}

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

const cleanMsg = (txt: string) =>
    txt.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

// ─── Main handler ───────────────────────────────────────────

serve(async (req) => {
    if (req.method === "OPTIONS")
        return new Response("ok", { headers: corsHeaders });

    try {
        const { compra_id, liquidacion_id, empresa_id, solo_consulta } = await req.json();
        if ((!compra_id && !liquidacion_id) || !empresa_id)
            throw new Error("(compra_id o liquidacion_id) y empresa_id son requeridos");
        const esLC = !!liquidacion_id;

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
            { db: { schema: "facturacion" } }
        );

        // ── 1. Fetch retenciones ──────────────────────────────
        let retQ = supabase
            .from("retenciones_compras")
            .select(`
                id, tipo, codigo_retencion, base_imponible, porcentaje, valor,
                fecha_emision, numero_retencion, estado, estado_sri,
                clave_acceso, numero_autorizacion, xml_firmado,
                proveedor:proveedores(ruc, nombre_empresa, correo)
            `)
            .eq("empresa_id", empresa_id)
            .neq("estado", "ANULADO")
            .order("tipo");

        retQ = esLC
            ? retQ.eq("liquidacion_id", liquidacion_id)
            : retQ.eq("compra_id", compra_id);

        const { data: rows, error: rowsErr } = await retQ;

        if (rowsErr) throw rowsErr;
        if (!rows || rows.length === 0)
            throw new Error("No hay retenciones activas para esta compra");

        const primera = rows[0] as any;

        // ── 2. Check if already authorized ───────────────────
        if (primera.estado_sri === "AUTORIZADO") {
            return new Response(JSON.stringify({
                success:    true,
                authorized: true,
                estado_sri: "AUTORIZADO",
                message:    "Ya autorizada: " + (primera.numero_autorizacion || ""),
            }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── 3. Fetch empresa ──────────────────────────────────
        const { data: empresa, error: empErr } = await supabase
            .from("empresas")
            .select("id, ruc, razon_social, nombre, direccion, config_sri")
            .eq("id", empresa_id)
            .single();

        if (empErr || !empresa) throw new Error("Empresa no encontrada");
        const configSri = (empresa as any).config_sri || {};

        // ── 4. Fetch sustento (factura o LC) ─────────────────
        let sustentoNumero = "";
        let sustentoFecha  = "";
        let codDocSustento = "01";

        if (esLC) {
            const { data: lc, error: lcErr } = await supabase
                .from("liquidaciones_compra")
                .select("establecimiento, punto_emision, secuencial, fecha_emision")
                .eq("id", liquidacion_id)
                .single();

            if (lcErr || !lc) throw new Error("Liquidación de compra no encontrada");
            const l = lc as any;
            sustentoNumero = `${l.establecimiento}-${l.punto_emision}-${l.secuencial}`;
            sustentoFecha  = l.fecha_emision;
            codDocSustento = "03";
        } else {
            const { data: compra, error: compraErr } = await supabase
                .from("ingresos_stock")
                .select("numero_factura, fecha_emision")
                .eq("id", compra_id)
                .single();

            if (compraErr || !compra) throw new Error("Compra no encontrada");
            sustentoNumero = (compra as any).numero_factura || "";
            sustentoFecha  = (compra as any).fecha_emision;
        }

        // ── 5. Determine estab / pto / secuencial ─────────────
        let estab       = ((configSri.estab        || "001") + "").padStart(3, "0");
        let pto         = ((configSri.pto_emision  || "001") + "").padStart(3, "0");
        let secuencial9 = "000000001";
        let numRet      = primera.numero_retencion as string | null;

        if (numRet) {
            const partes = numRet.split("-");
            if (partes.length === 3) {
                estab       = partes[0].padStart(3, "0");
                pto         = partes[1].padStart(3, "0");
                secuencial9 = partes[2].padStart(9, "0");
            } else {
                secuencial9 = numRet.replace(/\D/g, "").padStart(9, "0").slice(-9);
            }
        } else {
            // Auto-generate: find max secuencial in DB
            const { data: existing } = await supabase
                .from("retenciones_compras")
                .select("numero_retencion")
                .eq("empresa_id", empresa_id)
                .not("numero_retencion", "is", null);

            let maxSeq = 0;
            (existing ?? []).forEach((r: any) => {
                const m = (r.numero_retencion || "").match(/^\d{3}-\d{3}-(\d+)$/);
                if (m) {
                    const seq = parseInt(m[1], 10);
                    if (seq > maxSeq) maxSeq = seq;
                }
            });
            const nextSeq = maxSeq + 1;
            secuencial9   = nextSeq.toString().padStart(9, "0");
            numRet        = `${estab}-${pto}-${secuencial9}`;
        }

        // ── 6. Build ambient and clave de acceso ──────────────
        const ambienteKey = configSri.ambiente === "PRODUCCION" ? "PRODUCCION" : "PRUEBAS";
        const endpoints   = SRI_ENDPOINTS[ambienteKey];
        const ambienteCod = ambienteKey === "PRODUCCION" ? "2" : "1";

        const fechaEmision = (primera.fecha_emision as string) ||
            new Date().toISOString().split("T")[0];

        const claveAcceso = generarClaveAcceso({
            fechaEmision,
            ruc:       (empresa as any).ruc,
            ambiente:  ambienteCod,
            estab,
            pto,
            secuencial: secuencial9,
        });

        console.log("[sri-retencion] claveAcceso:", claveAcceso);

        // ── 7. Consult SRI first (might already be authorized) ─
        const soapAut = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns2:autorizacionComprobante xmlns:ns2="http://ec.gob.sri.ws.autorizacion"><claveAccesoComprobante>${claveAcceso}</claveAccesoComprobante></ns2:autorizacionComprobante></soap:Body></soap:Envelope>`;

        let xmlFirmado   = primera.xml_firmado as string | null;
        let msgSri       = "";
        let autorizado   = false;
        let estado_sri   = "NO_FIRMADA";
        let numAuth: string | undefined;
        let fechaAuth: string | undefined;

        const resAutPrev  = await fetch(endpoints.autorizacion, {
            method: "POST", body: soapAut, headers: { "Content-Type": "text/xml" }
        });
        const textAutPrev = await resAutPrev.text();
        console.log("[sri-retencion] AUT PREV:", textAutPrev.substring(0, 600));

        autorizado = textAutPrev.includes("<estado>AUTORIZADO</estado>");

        if (autorizado) {
            estado_sri = "AUTORIZADO";
            numAuth    = textAutPrev.match(/<numeroAutorizacion>(.*?)<\/numeroAutorizacion>/s)?.[1];
            fechaAuth  = textAutPrev.match(/<fechaAutorizacion>(.*?)<\/fechaAutorizacion>/s)?.[1];
        } else {
            const rawMsg  = textAutPrev.match(/<mensaje>(.*?)<\/mensaje>/s)?.[1] || "";
            const rawInfo = textAutPrev.match(/<informacionAdicional>(.*?)<\/informacionAdicional>/s)?.[1] || "";
            msgSri = cleanMsg(`${rawMsg} ${rawInfo}`);

            if (
                msgSri.includes("CLAVE ACCESO REGISTRADA") ||
                msgSri.includes("EN PROCESAMIENTO")
            ) {
                estado_sri = "ENVIADO";
                msgSri     = `SRI (CLAVE YA REGISTRADA): ${msgSri}`;
            } else if (!solo_consulta) {
                // ── 8. Sign and send ──────────────────────────
                if (!configSri.firma_path)
                    throw new Error("Firma electrónica no configurada. Configure en QuickInvoice → Configuración SRI.");

                const { data: firmaBlob } = await supabase.storage
                    .from("firmas_electronicas")
                    .download(configSri.firma_path);
                if (!firmaBlob)
                    throw new Error("Firma no encontrada en Storage. Suba el .p12 en Configuración.");

                const firmaB64 = toBase64(await firmaBlob.arrayBuffer());

                const proveedor = primera.proveedor as any;
                const xmlSinFirma = generarXmlRetencion({
                    empresa: {
                        ruc:          (empresa as any).ruc,
                        razon_social: (empresa as any).razon_social || (empresa as any).nombre || "",
                        nombre:       (empresa as any).nombre || "",
                        direccion:    (empresa as any).direccion || "",
                        config_sri:   configSri,
                    },
                    proveedor: {
                        ruc:            proveedor?.ruc || "",
                        nombre_empresa: proveedor?.nombre_empresa || "PROVEEDOR",
                    },
                    compra: {
                        fecha_emision:   sustentoFecha,
                        numero_factura:  sustentoNumero,
                        codDocSustento,
                    },
                    claveAcceso,
                    estab,
                    pto,
                    secuencial: secuencial9,
                    retenciones: rows.map((r: any) => ({
                        tipo:             r.tipo,
                        codigo_retencion: r.codigo_retencion,
                        base_imponible:   Number(r.base_imponible),
                        porcentaje:       Number(r.porcentaje),
                        valor:            Number(r.valor),
                    })),
                    fechaEmision,
                });

                console.log("[sri-retencion] XML sin firma (primeros 400):", xmlSinFirma.substring(0, 400));

                xmlFirmado = await firmarXmlRetencion(
                    xmlSinFirma,
                    firmaB64,
                    configSri.firma_password || ""
                );

                const xmlB64     = btoa(unescape(encodeURIComponent(xmlFirmado)));
                const soapRecep  = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns2:validarComprobante xmlns:ns2="http://ec.gob.sri.ws.recepcion"><xml>${xmlB64}</xml></ns2:validarComprobante></soap:Body></soap:Envelope>`;

                const resRec  = await fetch(endpoints.recepcion, {
                    method: "POST", body: soapRecep, headers: { "Content-Type": "text/xml" }
                });
                const textRec = await resRec.text();
                console.log("[sri-retencion] RECEPCION:", textRec.substring(0, 600));

                if (textRec.includes("RECIBIDA")) {
                    estado_sri = "ENVIADO";
                    msgSri     = "RECIBIDA POR SRI";
                    await new Promise((r) => setTimeout(r, 4000));
                } else {
                    const recMsg  = textRec.match(/<mensaje>(.*?)<\/mensaje>/s)?.[1] || "";
                    const recInfo = textRec.match(/<informacionAdicional>(.*?)<\/informacionAdicional>/s)?.[1] || "";
                    msgSri        = `REC:${cleanMsg(`${recMsg} ${recInfo}`)}`;

                    if (msgSri.includes("CLAVE ACCESO REGISTRADA") || msgSri.includes("EN PROCESAMIENTO")) {
                        estado_sri = "ENVIADO";
                    } else {
                        estado_sri = "RECHAZADO";
                        msgSri     = msgSri || "Error en recepción del comprobante.";
                    }
                }

                if (estado_sri === "ENVIADO") {
                    const resAutPost  = await fetch(endpoints.autorizacion, {
                        method: "POST", body: soapAut, headers: { "Content-Type": "text/xml" }
                    });
                    const textAutPost = await resAutPost.text();
                    console.log("[sri-retencion] AUT POST:", textAutPost.substring(0, 600));

                    autorizado = textAutPost.includes("<estado>AUTORIZADO</estado>");
                    if (autorizado) {
                        estado_sri = "AUTORIZADO";
                        numAuth    = textAutPost.match(/<numeroAutorizacion>(.*?)<\/numeroAutorizacion>/s)?.[1];
                        fechaAuth  = textAutPost.match(/<fechaAutorizacion>(.*?)<\/fechaAutorizacion>/s)?.[1];
                        msgSri     = "OK";
                    } else {
                        const autMsg  = textAutPost.match(/<mensaje>(.*?)<\/mensaje>/s)?.[1] || "";
                        const autInfo = textAutPost.match(/<informacionAdicional>(.*?)<\/informacionAdicional>/s)?.[1] || "";
                        msgSri        = `AUT:${cleanMsg(`${autMsg} ${autInfo}`) || textAutPost.substring(0, 200)}`;
                    }
                }
            }
        }

        // ── 9. Update all rows in this document group ─────────
        const updatePayload: Record<string, any> = {
            clave_acceso:      claveAcceso,
            estado_sri,
            xml_firmado:       xmlFirmado,
            observaciones_sri: msgSri || (autorizado ? "OK" : "PENDIENTE"),
        };

        if (numRet && numRet !== primera.numero_retencion) {
            updatePayload.numero_retencion = numRet;
        }

        if (autorizado) {
            updatePayload.numero_autorizacion = numAuth;
            updatePayload.fecha_autorizacion  = fechaAuth
                ? new Date(fechaAuth).toISOString()
                : new Date().toISOString();
            updatePayload.origen = "SRI";
        }

        let upd = supabase
            .from("retenciones_compras")
            .update(updatePayload)
            .eq("empresa_id", empresa_id)
            .neq("estado", "ANULADO");

        upd = esLC
            ? upd.eq("liquidacion_id", liquidacion_id)
            : upd.eq("compra_id", compra_id);

        const { error: updErr } = await upd;
        if (updErr) console.error("[sri-retencion] Update error:", updErr.message);

        // ── 10. Email al proveedor (background) ───────────────
        const emailTask = (async () => {
            if (!autorizado) return;
            const proveedorCorreo = (primera.proveedor as any)?.correo as string | undefined;
            if (!proveedorCorreo) return;
            try {
                const mailHost = configSri.mail_host as string | undefined;
                const mailUser = configSri.mail_user as string | undefined;
                const mailPass = configSri.mail_pass as string | undefined;
                if (!mailHost || !mailUser || !mailPass) return;

                const nombreEmpresa = ((empresa as any).razon_social || (empresa as any).nombre || "La Empresa").toUpperCase();
                const provNombre    = (primera.proveedor as any)?.nombre_empresa || "";
                const provRuc       = (primera.proveedor as any)?.ruc || "";
                const fechaFormat   = new Date(fechaEmision + "T12:00:00").toLocaleDateString("es-EC");

                const emailHtml = buildEmailHtml({
                    tipo:                  "COMPROBANTE DE RETENCIÓN",
                    nombreCliente:         provNombre.toUpperCase(),
                    identificacionCliente: provRuc,
                    nombreEmpresa,
                    ruc:       (empresa as any).ruc || "",
                    logoUrl:   (empresa as any).logo_url || null,
                    secuencial: numRet || "",
                    fechaFormat,
                    total:     rows.reduce((s: number, r: any) => s + Number(r.valor ?? 0), 0).toFixed(2),
                    ambiente:  configSri.ambiente,
                    extraRows: `<tr><td style="color:#6b7280;">Doc. Sustento</td><td align="right" style="color:#374151;">${sustentoNumero}</td></tr>`,
                });

                let pdfB64: string | null = null;
                try {
                    const pdfBytes = await generarRideRetencionPdf({
                        empresa,
                        proveedor: primera.proveedor,
                        compra:    { numero_factura: sustentoNumero, fecha_emision: sustentoFecha },
                        claveAcceso,
                        estab, pto, secuencial: secuencial9,
                        fechaEmision,
                        numAuth,
                        fechaAuth,
                        retenciones: rows.map((r: any) => ({
                            tipo:             r.tipo,
                            codigo_retencion: r.codigo_retencion,
                            base_imponible:   Number(r.base_imponible),
                            porcentaje:       Number(r.porcentaje),
                            valor:            Number(r.valor),
                        })),
                    });
                    let bin = "";
                    const chunk = 8192;
                    for (let i = 0; i < pdfBytes.length; i += chunk)
                        bin += String.fromCharCode(...pdfBytes.subarray(i, Math.min(i + chunk, pdfBytes.length)));
                    pdfB64 = btoa(bin);
                } catch (pdfErr) {
                    console.error("[RET EMAIL] Error PDF:", pdfErr);
                }

                const attachments: any[] = [];
                if (pdfB64)
                    attachments.push({ filename: `RIDE_RET_${numRet}.pdf`, content: pdfB64, encoding: "base64", contentType: "application/pdf" });
                attachments.push({ filename: `RET_${numRet}.xml`, content: xmlFirmado || "", contentType: "application/xml; charset=utf-8" });

                const nodemailer = (await import("npm:nodemailer@6.9.13")).default;
                const transporter = nodemailer.createTransport({
                    host: mailHost, port: Number(configSri.mail_port) || 587,
                    secure: configSri.mail_ssl === true,
                    auth: { user: mailUser, pass: mailPass },
                    tls: { rejectUnauthorized: false },
                });
                await transporter.sendMail({
                    from:    `Facturación ${nombreEmpresa} <${mailUser}>`,
                    to:      proveedorCorreo,
                    subject: `Comprobante de Retención ${numRet} - ${nombreEmpresa}`,
                    html:    emailHtml,
                    attachments,
                });
                console.log("[RET EMAIL] Enviado a:", proveedorCorreo);
            } catch (emailErr) {
                console.error("[RET EMAIL] Error:", emailErr);
            }
        })();
        (globalThis as any).EdgeRuntime?.waitUntil?.(emailTask);

        return new Response(JSON.stringify({
            success:    true,
            authorized: autorizado,
            estado_sri,
            message:    msgSri,
            numero_autorizacion: numAuth,
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (e: any) {
        console.error("[sri-retencion] ERROR:", e.message);
        return new Response(JSON.stringify({ success: false, error: e.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
        });
    }
});
