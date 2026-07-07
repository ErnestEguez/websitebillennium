// ============================================================
// EDGE FUNCTION: sri-guia-remision — QuickInvoice
// Firma XAdES-BES, envía al SRI (codDoc=06), genera RIDE PDF y notifica por email
// Deno runtime (Supabase Edge Functions)
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import forge from "npm:node-forge@1.3.1";
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";
import generarXmlGR from "./xmlGeneratorGR.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

// ─── Firma XAdES-BES para Guía de Remisión ──────────────────

async function firmarXmlXadesBes(xmlContent: string, firmaB64: string, password: string): Promise<string> {
    const p12Der = forge.util.decode64(firmaB64);
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);

    let privateKey: forge.pki.rsa.PrivateKey | null = null;
    let leafCert: forge.pki.Certificate | null = null;
    const allCertsB64: string[] = [];

    for (const safeContent of p12.safeContents) {
        for (const safeBag of safeContent.safeBags) {
            if (safeBag.type === forge.pki.oids.pkcs8ShroudedKeyBag && safeBag.key) {
                privateKey = safeBag.key as forge.pki.rsa.PrivateKey;
            } else if (safeBag.type === forge.pki.oids.certBag && safeBag.cert) {
                const certDer = forge.asn1.toDer(forge.pki.certificateToAsn1(safeBag.cert)).getBytes();
                const certB64 = btoa(certDer);
                allCertsB64.push(certB64);
                if (!leafCert) leafCert = safeBag.cert;
            }
        }
    }
    if (!privateKey || !leafCert) throw new Error("No se pudo extraer clave privada o certificado del .p12");

    const certDerLeaf = forge.asn1.toDer(forge.pki.certificateToAsn1(leafCert)).getBytes();
    const certSha1B64 = await sha1b64(new TextEncoder().encode(certDerLeaf));

    const getAttrValue = (cert: forge.pki.Certificate, attr: string): string => {
        const a = cert.issuer.attributes.find((x: any) => x.shortName === attr || x.name === attr);
        return a?.value || "";
    };
    const issuerDN = `CN=${getAttrValue(leafCert, "CN")},OU=${getAttrValue(leafCert, "OU")},O=${getAttrValue(leafCert, "O")},L=${getAttrValue(leafCert, "L")},ST=${getAttrValue(leafCert, "ST")},C=${getAttrValue(leafCert, "C")}`;
    const serialNumber = BigInt("0x" + leafCert.serialNumber).toString();
    const publicKey   = leafCert.publicKey as forge.pki.rsa.PublicKey;
    const modulusB64  = btoa((publicKey as any).n.toByteArray().map((b: number) => String.fromCharCode(b < 0 ? b + 256 : b)).join(""));
    const exponentB64 = btoa((publicKey as any).e.toByteArray().map((b: number) => String.fromCharCode(b < 0 ? b + 256 : b)).join(""));

    const ts = Date.now();
    const signatureId          = `Signature-${ts}`;
    const signedPropertiesId   = `Signature-${ts}-SignedProperties`;
    const xadesObjectId        = `xades-${ts}`;
    const qualifyingPropsId    = `QualifyingProperties-${ts}`;
    const referenceComprobanteId = `Reference-Comprobante-${ts}`;
    const keyInfoId            = `KeyInfoId-${signatureId}`;

    const now = new Date();
    const ecuadorDate = new Date(now.getTime() - (5 * 60 * 60 * 1000));
    const signingTime = ecuadorDate.toISOString().split(".")[0] + "-05:00";

    const xmlLimpio  = xmlContent.replace(/<\?xml[^?]*\?>/i, "").trim();
    const digestXml  = await sha1b64(new TextEncoder().encode(xmlLimpio));

    const spContent = `<xades:SignedSignatureProperties><xades:SigningTime>${signingTime}</xades:SigningTime><xades:SigningCertificate><xades:Cert><xades:CertDigest><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod><ds:DigestValue>${certSha1B64}</ds:DigestValue></xades:CertDigest><xades:IssuerSerial><ds:X509IssuerName>${issuerDN}</ds:X509IssuerName><ds:X509SerialNumber>${serialNumber}</ds:X509SerialNumber></xades:IssuerSerial></xades:Cert></xades:SigningCertificate></xades:SignedSignatureProperties><xades:SignedDataObjectProperties><xades:DataObjectFormat ObjectReference="#${referenceComprobanteId}"><xades:Description>contenido comprobante</xades:Description><xades:MimeType>text/xml</xades:MimeType><xades:Encoding>UTF-8</xades:Encoding></xades:DataObjectFormat></xades:SignedDataObjectProperties>`;
    const signedPropertiesToHash = `<xades:SignedProperties xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="${signedPropertiesId}">${spContent}</xades:SignedProperties>`;
    const digestSP   = await sha1b64(new TextEncoder().encode(signedPropertiesToHash));

    const x509Chain  = allCertsB64.map(c => `<ds:X509Certificate>${c}</ds:X509Certificate>`).join("");
    const keyInfoContent = `<ds:X509Data>${x509Chain}</ds:X509Data><ds:KeyValue><ds:RSAKeyValue><ds:Modulus>${modulusB64}</ds:Modulus><ds:Exponent>${exponentB64}</ds:Exponent></ds:RSAKeyValue></ds:KeyValue>`;
    const keyInfoToHash  = `<ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="${keyInfoId}">${keyInfoContent}</ds:KeyInfo>`;
    const digestKI   = await sha1b64(new TextEncoder().encode(keyInfoToHash));

    const signedInfoToSign = `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:CanonicalizationMethod><ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></ds:SignatureMethod><ds:Reference Id="${referenceComprobanteId}" URI="#comprobante"><ds:Transforms><ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></ds:Transform></ds:Transforms><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod><ds:DigestValue>${digestXml}</ds:DigestValue></ds:Reference><ds:Reference Id="ReferenceKeyInfo" URI="#${keyInfoId}"><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod><ds:DigestValue>${digestKI}</ds:DigestValue></ds:Reference><ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#${signedPropertiesId}"><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod><ds:DigestValue>${digestSP}</ds:DigestValue></ds:Reference></ds:SignedInfo>`;

    const md = forge.md.sha1.create();
    md.update(signedInfoToSign, "utf8");
    const signatureValue = btoa(privateKey.sign(md)).replace(/\r?\n|\r/g, "");

    const signatureXml = `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="${signatureId}">${signedInfoToSign}<ds:SignatureValue Id="SignatureValue-${ts}">${signatureValue}</ds:SignatureValue><ds:KeyInfo Id="${keyInfoId}">${keyInfoContent}</ds:KeyInfo><ds:Object Id="${xadesObjectId}"><xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="${qualifyingPropsId}" Target="#${signatureId}"><xades:SignedProperties Id="${signedPropertiesId}">${spContent}</xades:SignedProperties></xades:QualifyingProperties></ds:Object></ds:Signature>`;

    // Guía de remisión: reemplazar </guiaRemision> en lugar de </factura>
    return xmlContent.replace("</guiaRemision>", `${signatureXml}</guiaRemision>`);
}

// ─── RIDE PDF para Guía de Remisión ─────────────────────────

async function generarRideGR(guia: any): Promise<Uint8Array> {
    const empresa  = guia.empresa  || {};
    const detalles: any[] = guia.detalles || [];

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
            return `${dt.getFullYear()}-${p(dt.getMonth()+1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
        } catch { return "PENDIENTE"; }
    };

    const claveAcceso  = guia.clave_acceso  || "";
    const autorizacion = guia.autorizacion_numero || claveAcceso;
    const ambiente     = (guia.ambiente || "PRUEBAS").toUpperCase();
    const obligado     = empresa.obligado_contabilidad ? "SI" : "NO";

    // QR
    let qrDataUrl = "";
    if (claveAcceso) {
        try {
            const QRCode = (await import("npm:qrcode")).default;
            qrDataUrl = await QRCode.toDataURL(claveAcceso, { margin: 1, width: 120 });
        } catch { /* QR unavailable */ }
    }

    // Logo
    let logoB64 = ""; let logoExt = "PNG";
    if (empresa.logo_url) {
        try {
            const resp = await fetch(empresa.logo_url);
            logoB64 = toBase64(new Uint8Array(await resp.arrayBuffer()));
            logoExt = empresa.logo_url.toLowerCase().includes(".png") ? "PNG" : "JPEG";
        } catch { /* logo unavailable */ }
    }

    const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const ML = 10; const CW = 190; const RX = 200;
    const S400: [number,number,number] = [148,163,184];
    const S200: [number,number,number] = [226,232,240];
    const S100: [number,number,number] = [241,245,249];
    const sd4 = () => { doc.setDrawColor(...S400); doc.setLineWidth(0.4); };
    const sd2 = () => { doc.setDrawColor(...S200); doc.setLineWidth(0.2); };
    const sf1 = () => doc.setFillColor(...S100);

    let y = 10;

    // ── HEADER (empresa | GUÍA DE REMISIÓN) ──
    const LW = 104.5; const RW = 85.5; const DIV = ML + LW;
    const RH1=7, RH2=8, RH3=7, RH4=10, RH5=7, RH6=9;
    const HDR_H = RH1+RH2+RH3+RH4+RH5+RH6;

    sf1(); doc.rect(DIV, y+RH1, RW, RH2, "F");
    sd4();
    doc.rect(ML, y, CW, HDR_H);
    doc.line(DIV, y, DIV, y+HDR_H);
    doc.line(DIV, y+RH1,                 DIV+RW, y+RH1);
    doc.line(DIV, y+RH1+RH2,             DIV+RW, y+RH1+RH2);
    doc.line(DIV, y+RH1+RH2+RH3,         DIV+RW, y+RH1+RH2+RH3);
    doc.line(DIV, y+RH1+RH2+RH3+RH4,     DIV+RW, y+RH1+RH2+RH3+RH4);
    doc.line(DIV, y+RH1+RH2+RH3+RH4+RH5, DIV+RW, y+RH1+RH2+RH3+RH4+RH5);

    doc.setTextColor(0,0,0);
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
    doc.text(`OBLIGADO A LLEVAR CONTABILIDAD ${obligado}`, ML+2, lY);

    let rY = y;
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text(`R.U.C.: ${empresa.ruc || ""}`, DIV+RW/2, rY+RH1*0.65, { align: "center" });
    rY += RH1;
    doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text("GUÍA DE REMISIÓN", DIV+RW/2, rY+RH2*0.65, { align: "center" });
    rY += RH2;
    doc.setFontSize(8); doc.setFont("helvetica", "normal");
    doc.text(`No. ${guia.secuencial || ""}`, DIV+RW/2, rY+RH3*0.65, { align: "center" });
    rY += RH3;
    doc.setFontSize(7); doc.setFont("helvetica", "bold");
    doc.text("NÚMERO DE AUTORIZACIÓN", DIV+2, rY+3.5);
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
    doc.text(doc.splitTextToSize(autorizacion, RW-4).slice(0,2), DIV+2, rY+6.5);
    rY += RH4;
    doc.setFontSize(7); doc.setFont("helvetica", "bold");
    doc.text("FECHA Y HORA DE AUTORIZACIÓN", DIV+2, rY+3.5);
    doc.setFont("helvetica", "normal");
    doc.text(fmtDT(guia.fecha_autorizacion), DIV+RW-2, rY+3.5, { align: "right" });
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

    // ── CLAVE DE ACCESO + QR ──
    const CA_H = 14;
    sd4(); doc.rect(ML, y, CW, CA_H);
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold");
    doc.text("CLAVE DE ACCESO", ML+2, y+4);
    doc.setFontSize(6.5); doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(claveAcceso, CW-28), ML+2, y+9);
    if (qrDataUrl) doc.addImage(qrDataUrl, "PNG", RX-22, y+1, 20, 12);
    y += CA_H;

    // ── DATOS DE TRANSPORTE ──
    const TR_H = 18;
    sd4(); doc.rect(ML, y, CW, TR_H);
    doc.line(ML+CW/2, y, ML+CW/2, y+TR_H);
    doc.line(ML+CW/4, y+TR_H/2, ML+CW, y+TR_H/2);
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold");
    doc.text("TRANSPORTISTA:", ML+2, y+4);
    doc.setFont("helvetica", "normal");
    doc.text(`${guia.transportista_nombre || ""} — CI/RUC: ${guia.transportista_identificacion || ""}`, ML+2, y+8);
    doc.setFont("helvetica", "bold");
    doc.text("PLACA:", ML+2, y+13);
    doc.setFont("helvetica", "normal");
    doc.text(guia.placa || "", ML+14, y+13);

    const midX = ML+CW/2+2;
    doc.setFont("helvetica", "bold");
    doc.text("FECHA INICIO:", midX, y+4);
    doc.setFont("helvetica", "normal");
    doc.text(fmtDate(guia.fecha_ini_transporte), midX+26, y+4);
    doc.setFont("helvetica", "bold");
    doc.text("FECHA FIN:", midX, y+8);
    doc.setFont("helvetica", "normal");
    doc.text(fmtDate(guia.fecha_fin_transporte), midX+22, y+8);
    doc.setFont("helvetica", "bold");
    doc.text("MOTIVO:", midX, y+13);
    doc.setFont("helvetica", "normal");
    doc.text(guia.motivo_traslado || "VENTA", midX+14, y+13);
    const row2Mid = y + TR_H/2;
    doc.setFont("helvetica", "bold");
    doc.text("RUTA:", ML+2, row2Mid+4);
    doc.setFont("helvetica", "normal");
    doc.text(guia.ruta || "—", ML+12, row2Mid+4);
    y += TR_H;

    // ── DESTINATARIO ──
    const DEST_H = 12;
    sd4(); doc.rect(ML, y, CW, DEST_H);
    doc.line(ML+CW/2, y, ML+CW/2, y+DEST_H);
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold");
    doc.text("DESTINATARIO:", ML+2, y+4);
    doc.setFont("helvetica", "normal");
    doc.text(`${guia.destinatario_nombre || ""} — CI/RUC: ${guia.destinatario_identificacion || ""}`, ML+2, y+8.5);
    doc.setFont("helvetica", "bold");
    doc.text("DIRECCIÓN:", ML+CW/2+2, y+4);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(guia.destinatario_direccion || "", CW/2-4)[0] || "", ML+CW/2+2, y+8.5);
    y += DEST_H;

    // ── DOC. DE SUSTENTO ──
    const DS_H = 9;
    sd4(); doc.rect(ML, y, CW, DS_H);
    doc.setFontSize(7.5); doc.setFont("helvetica", "bold");
    doc.text("DOC. DE SUSTENTO:", ML+2, y+5.5);
    doc.setFont("helvetica", "normal");
    doc.text(`FACTURA  ${guia.doc_sustento_numero || ""}   |   Autorización: ${guia.doc_sustento_autorizacion || "—"}   |   Fecha: ${fmtDate(guia.doc_sustento_fecha)}`, ML+38, y+5.5);
    y += DS_H;

    // ── TABLA DETALLES ──
    const COLS = [
        { label: "Código",       w: 24, align: "left"  as const },
        { label: "Descripción",  w: 98, align: "left"  as const },
        { label: "Cantidad",     w: 18, align: "right" as const },
        { label: "P. Unitario",  w: 24, align: "right" as const },
        { label: "Total",        w: 26, align: "right" as const },
    ];
    const colXs: number[] = [];
    { let cx = ML; COLS.forEach(c => { colXs.push(cx); cx += c.w; }); }
    const TH = 6; const TR = 5.5;

    sf1(); doc.rect(ML, y, CW, TH, "F");
    sd4(); doc.rect(ML, y, CW, TH);
    sd2();
    COLS.forEach((c, i) => {
        if (i > 0) doc.line(colXs[i], y, colXs[i], y+TH);
        doc.setFontSize(7); doc.setFont("helvetica", "bold"); doc.setTextColor(0,0,0);
        doc.text(c.label, c.align === "right" ? colXs[i]+c.w-1 : colXs[i]+1, y+4, { align: c.align });
    });
    y += TH;

    for (const d of detalles) {
        if (y + TR > 270) {
            doc.addPage();
            y = 10;
        }
        sd2(); doc.rect(ML, y, CW, TR);
        COLS.forEach((c, i) => {
            if (i > 0) doc.line(colXs[i], y, colXs[i], y+TR);
        });
        doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(0,0,0);
        doc.text((d.codigo || "").toString().slice(0,20),       colXs[0]+1, y+3.8, { align: "left"  });
        doc.text(doc.splitTextToSize((d.descripcion || "").toUpperCase(), 96)[0] || "", colXs[1]+1, y+3.8, { align: "left"  });
        doc.text(Number(d.cantidad).toFixed(2),          colXs[2]+c_w(COLS,2)-1, y+3.8, { align: "right" });
        doc.text(Number(d.precio_unitario).toFixed(4),   colXs[3]+c_w(COLS,3)-1, y+3.8, { align: "right" });
        doc.text(f2(Number(d.total)),                    colXs[4]+c_w(COLS,4)-1, y+3.8, { align: "right" });
        y += TR;
    }

    // ── TOTAL ──
    y += 2;
    sd4(); doc.rect(ML+CW-50, y, 50, 8);
    sf1(); doc.rect(ML+CW-50, y, 50, 8, "F");
    doc.setFontSize(8); doc.setFont("helvetica", "bold");
    const totalGR = r2(detalles.reduce((s: number, d: any) => s + Number(d.total || 0), 0));
    doc.text("TOTAL:", ML+CW-48, y+5.5);
    doc.text(`$${f2(totalGR)}`, ML+CW-2, y+5.5, { align: "right" });

    return doc.output("arraybuffer") as unknown as Uint8Array;

    function c_w(cols: typeof COLS, i: number) { return cols[i].w; }
}

// ─── Email HTML ──────────────────────────────────────────────

function buildEmailHtmlGR(opts: {
    nombreDestinatario: string; nombreEmpresa: string;
    ruc: string; logoUrl?: string | null;
    secuencial: string; fechaFormat: string; placa: string;
    ambiente?: string;
}): string {
    const logoHtml = opts.logoUrl
        ? `<img src="${opts.logoUrl}" alt="" style="max-height:55px;max-width:180px;display:block;margin:0 auto;">`
        : `<span style="color:#fff;font-weight:800;font-size:18px;">${opts.nombreEmpresa}</span>`;
    const esPrueba = (opts.ambiente ?? "PRUEBAS") !== "PRODUCCION";
    const badge = esPrueba
        ? `<span style="display:inline-block;margin-top:12px;background:#f59e0b;color:#fff;padding:4px 16px;border-radius:20px;font-size:10px;font-weight:800;letter-spacing:1.5px;">&#9888; AMBIENTE DE PRUEBAS</span>`
        : `<span style="display:inline-block;margin-top:12px;background:#10b981;color:#fff;padding:4px 16px;border-radius:20px;font-size:10px;font-weight:800;letter-spacing:1.5px;">&#10003; PRODUCCI&#211;N</span>`;
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:24px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.14);">
<tr><td style="background:linear-gradient(135deg,#0f766e 0%,#14b8a6 100%);padding:24px 32px 20px;text-align:center;">
  ${logoHtml}
  <p style="margin:14px 0 4px;color:rgba(255,255,255,0.75);font-size:11px;letter-spacing:0.5px;text-transform:uppercase;">Guía de Remisión para</p>
  <p style="margin:0;color:#ffffff;font-size:17px;font-weight:700;">${opts.nombreDestinatario}</p>
  ${badge}
</td></tr>
<tr><td style="background:#fff;padding:20px 32px 16px;text-align:center;">
  <p style="margin:0;color:#6b7280;font-size:13px;">Ha recibido una Guía de Remisión de</p>
  <p style="margin:6px 0 0;color:#0f766e;font-size:15px;font-weight:700;">${opts.nombreEmpresa}</p>
</td></tr>
<tr><td style="background:#fff;padding:0 32px;"><hr style="border:none;border-top:1px solid #e5e7eb;margin:0;"></td></tr>
<tr><td style="background:#fff;padding:12px 32px 16px;">
  <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;font-size:13px;">
    <tr style="border-bottom:1px solid #f3f4f6;"><td style="color:#6b7280;">N° Guía</td><td align="right" style="font-weight:700;">${opts.secuencial}</td></tr>
    <tr style="border-bottom:1px solid #f3f4f6;"><td style="color:#6b7280;">Fecha</td><td align="right">${opts.fechaFormat}</td></tr>
    <tr><td style="color:#6b7280;">Placa vehículo</td><td align="right" style="font-weight:700;">${opts.placa}</td></tr>
  </table>
</td></tr>
<tr><td style="background:#f0fdfa;padding:16px 32px;text-align:center;border-top:2px solid #99f6e4;border-bottom:2px solid #99f6e4;">
  <p style="margin:0;color:#6b7280;font-size:12px;">&#128206; Se adjuntan el <strong>RIDE PDF</strong> y el <strong>XML autorizado</strong> por el SRI</p>
</td></tr>
<tr><td style="background:#0f4c45;padding:18px 32px;text-align:center;">
  <p style="margin:0 0 4px;color:rgba(255,255,255,0.9);font-size:12px;font-weight:600;">${opts.nombreEmpresa} &nbsp;&middot;&nbsp; RUC: ${opts.ruc}</p>
  <p style="margin:0;color:rgba(255,255,255,0.55);font-size:10px;">Powered by QuickInvoice &nbsp;&middot;&nbsp; www.billenniumsystem.com</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}

// ─── Endpoints SRI ──────────────────────────────────────────

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

// ─── Handler principal ──────────────────────────────────────

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const { guia_remision_id, solo_consulta } = await req.json();
        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );

        // Cargar guía con detalles y empresa
        const { data: guiaRow, error: guiaErr } = await supabase
            .from("guias_remision")
            .select("*, guia_remision_detalles(*)")
            .eq("id", guia_remision_id)
            .single();
        if (guiaErr || !guiaRow) throw new Error("Guía de remisión no encontrada");

        const { data: empresaRow } = await supabase
            .from("empresas")
            .select("*")
            .eq("id", guiaRow.empresa_id)
            .single();
        if (!empresaRow) throw new Error("Empresa no encontrada");

        const guia = { ...guiaRow, empresa: empresaRow, detalles: guiaRow.guia_remision_detalles || [] };
        const configSri = empresaRow.config_sri || {};
        const ambiente  = configSri.ambiente === "PRODUCCION" ? "PRODUCCION" : "PRUEBAS";
        const endpoints = SRI_ENDPOINTS[ambiente];

        let xmlFirmado = guia.xml_firmado;
        let msgSri = "";
        let autorizado = false;
        let estado_sri = guia.estado_sri;
        let numAuth    = guia.autorizacion_numero;
        let fechaAuth  = guia.fecha_autorizacion;

        const cleanMsg = (txt: string) => txt.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

        const soapAut = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns2:autorizacionComprobante xmlns:ns2="http://ec.gob.sri.ws.autorizacion"><claveAccesoComprobante>${guia.clave_acceso}</claveAccesoComprobante></ns2:autorizacionComprobante></soap:Body></soap:Envelope>`;

        const necesitaPreCheck = solo_consulta || estado_sri === "ENVIADO" || estado_sri === "AUTORIZADO";
        let yaRegistrada = false;

        if (necesitaPreCheck) {
            const resAut = await fetch(endpoints.autorizacion, { method: "POST", body: soapAut, headers: { "Content-Type": "text/xml" } });
            const txtAut = await resAut.text();
            autorizado   = txtAut.includes("<estado>AUTORIZADO</estado>");
            if (autorizado) {
                estado_sri = "AUTORIZADO";
                numAuth    = txtAut.match(/<numeroAutorizacion>(.*?)<\/numeroAutorizacion>/s)?.[1];
                fechaAuth  = txtAut.match(/<fechaAutorizacion>(.*?)<\/fechaAutorizacion>/s)?.[1];
            } else {
                const msg = cleanMsg(`${txtAut.match(/<mensaje>(.*?)<\/mensaje>/s)?.[1] || ""} ${txtAut.match(/<informacionAdicional>(.*?)<\/informacionAdicional>/s)?.[1] || ""}`);
                if (msg.includes("CLAVE ACCESO REGISTRADA") || msg.includes("EN PROCESAMIENTO")) {
                    estado_sri = "ENVIADO"; yaRegistrada = true; msgSri = `SRI: ${msg}`;
                } else { msgSri = msg; }
            }
        }

        if (!autorizado && !solo_consulta && !yaRegistrada) {
            const { data: firmaBlob } = await supabase.storage.from("firmas_electronicas").download(configSri.firma_path);
            if (!firmaBlob) throw new Error("Firma no encontrada. Suba el .p12 en Configuración.");

            const firmaB64   = toBase64(await firmaBlob.arrayBuffer());
            const xmlSinFirma = generarXmlGR(guia);
            xmlFirmado        = await firmarXmlXadesBes(xmlSinFirma, firmaB64, configSri.firma_password);

            const xmlB64       = btoa(unescape(encodeURIComponent(xmlFirmado)));
            const soapRec      = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns2:validarComprobante xmlns:ns2="http://ec.gob.sri.ws.recepcion"><xml>${xmlB64}</xml></ns2:validarComprobante></soap:Body></soap:Envelope>`;

            const resRec  = await fetch(endpoints.recepcion, { method: "POST", body: soapRec, headers: { "Content-Type": "text/xml" } });
            const txtRec  = await resRec.text();

            if (txtRec.includes("RECIBIDA")) {
                estado_sri = "ENVIADO"; msgSri = "RECIBIDA POR SRI";
                await new Promise(r => setTimeout(r, 1500));
            } else {
                const msg = cleanMsg(`${txtRec.match(/<mensaje>(.*?)<\/mensaje>/s)?.[1] || ""} ${txtRec.match(/<informacionAdicional>(.*?)<\/informacionAdicional>/s)?.[1] || ""}`);
                msgSri = `REC:${msg}`;
                estado_sri = (msg.includes("CLAVE ACCESO REGISTRADA") || msg.includes("EN PROCESAMIENTO")) ? "ENVIADO" : "RECHAZADO";
            }

            if (estado_sri === "ENVIADO") {
                const resAut2 = await fetch(endpoints.autorizacion, { method: "POST", body: soapAut, headers: { "Content-Type": "text/xml" } });
                const txtAut2 = await resAut2.text();
                autorizado    = txtAut2.includes("<estado>AUTORIZADO</estado>");
                if (autorizado) {
                    estado_sri = "AUTORIZADO";
                    numAuth    = txtAut2.match(/<numeroAutorizacion>(.*?)<\/numeroAutorizacion>/s)?.[1];
                    fechaAuth  = txtAut2.match(/<fechaAutorizacion>(.*?)<\/fechaAutorizacion>/s)?.[1];
                    msgSri     = "OK";
                } else {
                    const msg2 = cleanMsg(`${txtAut2.match(/<mensaje>(.*?)<\/mensaje>/s)?.[1] || ""} ${txtAut2.match(/<informacionAdicional>(.*?)<\/informacionAdicional>/s)?.[1] || ""}`);
                    msgSri = `AUT:${msg2 || txtAut2.substring(0, 300)}`;
                }
            }
        }

        // Actualizar BD
        const updateData: any = {
            estado_sri,
            xml_firmado: xmlFirmado,
            observaciones_sri: msgSri || (autorizado ? "OK" : "PENDIENTE"),
        };
        if (autorizado) {
            updateData.autorizacion_numero = numAuth;
            updateData.fecha_autorizacion  = fechaAuth ? new Date(fechaAuth).toISOString() : new Date().toISOString();
        }
        await supabase.from("guias_remision").update(updateData).eq("id", guia_remision_id);

        // Email en background
        const emailTask = (async () => {
            if (!autorizado) return;
            try {
                const mailHost = configSri.mail_host as string | undefined;
                const mailUser = configSri.mail_user as string | undefined;
                const mailPass = configSri.mail_pass as string | undefined;
                if (!mailHost || !mailUser || !mailPass) return;

                const fechaRaw    = new Date(guia.created_at);
                const fechaEc     = new Date(fechaRaw.getTime() - 5 * 60 * 60 * 1000);
                const fechaFormat = fechaEc.toLocaleDateString("es-EC");
                const nombreEmpresa = (empresaRow.nombre || empresaRow.razon_social || "La Empresa").toUpperCase();

                const emailHtml = buildEmailHtmlGR({
                    nombreDestinatario: guia.destinatario_nombre || "DESTINATARIO",
                    nombreEmpresa,
                    ruc: empresaRow.ruc || "",
                    logoUrl: empresaRow.logo_url || null,
                    secuencial: guia.secuencial,
                    fechaFormat,
                    placa: guia.placa || "",
                    ambiente,
                });

                const guiaActualizada = { ...guia, autorizacion_numero: numAuth, fecha_autorizacion: fechaAuth };
                const ridePdfBytes = await generarRideGR(guiaActualizada);
                let pdfBin = "";
                for (let i = 0; i < ridePdfBytes.length; i += 8192) {
                    pdfBin += String.fromCharCode(...ridePdfBytes.subarray(i, Math.min(i + 8192, ridePdfBytes.length)));
                }
                const pdfB64 = btoa(pdfBin);

                const nodemailer = (await import("npm:nodemailer@6.9.13")).default;
                const transporter = nodemailer.createTransport({
                    host: mailHost, port: Number(configSri.mail_port) || 587,
                    secure: configSri.mail_ssl === true,
                    auth: { user: mailUser, pass: mailPass },
                    tls: { rejectUnauthorized: false },
                });

                // Email al destinatario si hay correo en el cliente vinculado
                const { data: clienteData } = await supabase.from("clientes").select("email").eq("id", guia.cliente_id).maybeSingle();
                const toEmail = clienteData?.email;
                if (!toEmail) return;

                await transporter.sendMail({
                    from: `Facturación ${nombreEmpresa} <${mailUser}>`,
                    to: toEmail,
                    cc: (configSri.mail_cc as string | undefined) || undefined,
                    subject: `Guía de Remisión ${guia.secuencial} - ${nombreEmpresa}`,
                    html: emailHtml,
                    attachments: [
                        { filename: `RIDE_GR_${guia.secuencial}.pdf`, content: pdfB64, encoding: "base64", contentType: "application/pdf" },
                        { filename: `GR_${guia.secuencial}.xml`, content: xmlFirmado || "", contentType: "application/xml; charset=utf-8" },
                    ],
                });
            } catch (emailErr) {
                console.error("[EMAIL-GR] Error:", emailErr);
            }
        })();

        (globalThis as any).EdgeRuntime?.waitUntil?.(emailTask);

        return new Response(JSON.stringify({ success: true, authorized: autorizado, estado_sri, message: msgSri }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

    } catch (e: any) {
        console.error("[sri-guia-remision] ERROR:", e.message);
        return new Response(JSON.stringify({ success: false, error: e.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
        });
    }
});
