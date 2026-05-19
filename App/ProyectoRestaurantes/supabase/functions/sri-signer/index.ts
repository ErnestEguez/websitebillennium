// ============================================================
// EDGE FUNCTION: sri-signer
// Firma XAdES-BES, envía al SRI, genera RIDE PDF y notifica por Resend
// Deno runtime (Supabase Edge Functions)
// ============================================================

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@3.2.0";
// @deno-types="https://esm.sh/forge@0.10.0/dist/forge.min.d.ts"
import forge from "npm:node-forge@1.3.1";
// @deno-types="https://esm.sh/jspdf@2.5.1/dist/jspdf.es.min.d.ts"
import { jsPDF } from "https://esm.sh/jspdf@2.5.1";
import generarXml from "./xmlGenerator.ts";

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

// ─── RIDE PDF Generator (jsPDF) ────────────────────

function generarRidePdf(comprobante: any): Uint8Array {
    const doc = new jsPDF();
    const empresa = comprobante.empresas || {};
    const cliente = comprobante.clientes || {};
    const detalles = comprobante.comprobante_detalles || [];

    // Header
    doc.setFontSize(14);
    doc.text((empresa.razon_social || "EMPRESA").toUpperCase(), 10, 20);
    doc.setFontSize(8);
    doc.text(`RUC: ${empresa.ruc || "N/A"}`, 10, 28);
    doc.text(`Dirección: ${empresa.direccion || "Ecuador"}`, 10, 33);

    doc.setFontSize(12);
    doc.text(`FACTURA Nro: ${comprobante.secuencial}`, 110, 20);
    doc.setFontSize(8);
    doc.text(`CLAVE DE ACCESO:`, 110, 28);
    doc.text(comprobante.clave_acceso || "", 110, 31);

    // Info Cuadro
    doc.rect(10, 45, 190, 25);
    doc.text(`Razón Social Client: ${(cliente.nombre || "CONSUMIDOR FINAL").toUpperCase()}`, 12, 53);
    doc.text(`Identificación: ${cliente.identificacion || "9999999999999"}`, 12, 58);
    doc.text(`Fecha Emisión: ${new Date(comprobante.created_at).toLocaleDateString()}`, 12, 63);

    // Tabla Detalles
    doc.setFontSize(9);
    doc.line(10, 75, 200, 75);
    doc.text("Cant", 12, 80);
    doc.text("Descripción", 30, 80);
    doc.text("P. Unit", 150, 80);
    doc.text("Total", 180, 80);
    doc.line(10, 83, 200, 83);

    let y = 90;
    detalles.forEach((d: any) => {
        doc.text(`${d.cantidad}`, 12, y);
        doc.text(`${(d.nombre_producto || "PRODUCTO").slice(0, 50)}`, 30, y);
        doc.text(`$${Number(d.precio_unitario).toFixed(2)}`, 150, y);
        doc.text(`$${Number(d.total).toFixed(2)}`, 180, y);
        y += 7;
        if (y > 270) { doc.addPage(); y = 20; }
    });

    doc.line(140, y, 200, y);
    y += 10;
    doc.setFontSize(11);
    doc.text(`TOTAL: $${Number(comprobante.total).toFixed(2)}`, 150, y);

    return new Uint8Array(doc.output("arraybuffer"));
}

// ─── XAdES-BES Signer ──────────────────

async function firmarXmlXadesBes(
    xmlContent: string,
    p12Base64: string,
    p12Password: string
): Promise<string> {
    const p12Der = atob(p12Base64);
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, p12Password);

    const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });

    const privateKeyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] || Object.values(keyBags).flat()[0];
    const certBag = certBags[forge.pki.oids.certBag]?.[0];

    if (!privateKeyBag?.key || !certBag?.cert) throw new Error("Credenciales inválidas en .p12");

    const privateKey = privateKeyBag.key;
    const cert = certBag.cert;

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

    const keyInfoContent = `<ds:X509Data><ds:X509Certificate>${certB64}</ds:X509Certificate></ds:X509Data><ds:KeyValue><ds:RSAKeyValue><ds:Modulus>${modulusB64}</ds:Modulus><ds:Exponent>${exponentB64}</ds:Exponent></ds:RSAKeyValue></ds:KeyValue>`;
    const keyInfoToHash = `<ds:KeyInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="${keyInfoId}">${keyInfoContent}</ds:KeyInfo>`;
    const digestKI = await sha1b64(new TextEncoder().encode(keyInfoToHash));

    const signedInfoToSign = `<ds:SignedInfo xmlns:ds="http://www.w3.org/2000/09/xmldsig#"><ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></ds:CanonicalizationMethod><ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"></ds:SignatureMethod><ds:Reference Id="${referenceComprobanteId}" URI="#comprobante"><ds:Transforms><ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></ds:Transform></ds:Transforms><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod><ds:DigestValue>${digestXml}</ds:DigestValue></ds:Reference><ds:Reference Id="ReferenceKeyInfo" URI="#${keyInfoId}"><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod><ds:DigestValue>${digestKI}</ds:DigestValue></ds:Reference><ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#${signedPropertiesId}"><ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"></ds:DigestMethod><ds:DigestValue>${digestSP}</ds:DigestValue></ds:Reference></ds:SignedInfo>`;

    const md = forge.md.sha1.create();
    md.update(signedInfoToSign, "utf8");
    const signatureValue = btoa(privateKey.sign(md)).replace(/\r?\n|\r/g, "");

    const signatureXml = `<ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="${signatureId}">${signedInfoToSign}<ds:SignatureValue Id="SignatureValue-${ts}">${signatureValue}</ds:SignatureValue><ds:KeyInfo Id="${keyInfoId}">${keyInfoContent}</ds:KeyInfo><ds:Object Id="${xadesObjectId}"><xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="${qualifyingPropsId}" Target="#${signatureId}"><xades:SignedProperties Id="${signedPropertiesId}">${spContent}</xades:SignedProperties></xades:QualifyingProperties></ds:Object></ds:Signature>`;

    return xmlContent.replace("</factura>", `${signatureXml}</factura>`);
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

serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

    try {
        const { comprobante_id, solo_consulta } = await req.json();
        const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

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

        // ─── PASO 1: CONSULTAR SI YA ESTÁ AUTORIZADO (O EN PROCESO) ───
        // Siempre consultamos primero para evitar "Duplicado" si falló la red antes
        const soapAutorizacion = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns2:autorizacionComprobante xmlns:ns2="http://ec.gob.sri.ws.autorizacion"><claveAccesoComprobante>${comprobante.clave_acceso}</claveAccesoComprobante></ns2:autorizacionComprobante></soap:Body></soap:Envelope>`;
        const resAutPrev = await fetch(endpoints.autorizacion, { method: "POST", body: soapAutorizacion, headers: { "Content-Type": "text/xml" } });
        const textAutPrev = await resAutPrev.text();

        autorizado = textAutPrev.includes("<estado>AUTORIZADO</estado>");

        if (autorizado) {
            estado_sri = "AUTORIZADO";
            numAuth = textAutPrev.match(/<numeroAutorizacion>(.*?)<\/numeroAutorizacion>/s)?.[1];
            fechaAuth = textAutPrev.match(/<fechaAutorizacion>(.*?)<\/fechaAutorizacion>/s)?.[1];
        } else {
            // Si no está autorizado, vemos si está "En procesamiento" o "Clave registrada"
            const rawMensaje = textAutPrev.match(/<mensaje>(.*?)<\/mensaje>/s)?.[1] || "";
            const rawInfo = textAutPrev.match(/<informacionAdicional>(.*?)<\/informacionAdicional>/s)?.[1] || "";
            msgSri = cleanMsg(`${rawMensaje} ${rawInfo}`);

            if (msgSri.includes("CLAVE ACCESO REGISTRADA") || msgSri.includes("EN PROCESAMIENTO") || msgSri.includes("PROCESAMIENTO")) {
                estado_sri = "ENVIADO";
                msgSri = "El SRI está procesando este documento. Por favor, reintente en unos minutos.";
            } else if (!solo_consulta) {
                // ─── PASO 2: SI NO EXISTE EN EL SRI, FIRMAR Y ENVIAR ───
                const { data: firmaBlob } = await supabase.storage.from("firmas_electronicas").download(configSri.firma_path);
                if (!firmaBlob) throw new Error("Firma no encontrada para envío");

                const firmaB64 = toBase64(await firmaBlob.arrayBuffer());
                const xmlSinFirma = generarXml(comprobante);
                xmlFirmado = await firmarXmlXadesBes(xmlSinFirma, firmaB64, configSri.firma_password);

                const xmlB64 = btoa(unescape(encodeURIComponent(xmlFirmado)));
                const soapRecepcion = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ns2:validarComprobante xmlns:ns2="http://ec.gob.sri.ws.recepcion"><xml>${xmlB64}</xml></ns2:validarComprobante></soap:Body></soap:Envelope>`;

                const resRec = await fetch(endpoints.recepcion, { method: "POST", body: soapRecepcion, headers: { "Content-Type": "text/xml" } });
                const textRec = await resRec.text();

                if (textRec.includes("RECIBIDA")) {
                    estado_sri = "ENVIADO";
                    msgSri = "RECIBIDA POR SRI";
                    // Esperar un poco más para la autorización
                    await new Promise(r => setTimeout(r, 4000));
                } else {
                    const recMensaje = textRec.match(/<mensaje>(.*?)<\/mensaje>/s)?.[1] || "";
                    const recInfo = textRec.match(/<informacionAdicional>(.*?)<\/informacionAdicional>/s)?.[1] || "";
                    msgSri = cleanMsg(`${recMensaje} ${recInfo}`);

                    if (msgSri.includes("CLAVE ACCESO REGISTRADA") || msgSri.includes("EN PROCESAMIENTO")) {
                        estado_sri = "ENVIADO";
                    } else {
                        estado_sri = "RECHAZADO";
                        msgSri = msgSri || "Error en recepción del comprobante.";
                    }
                }

                // Si se envió con éxito o ya existía, intentar autorizar de nuevo
                if (estado_sri === "ENVIADO") {
                    const resAutPost = await fetch(endpoints.autorizacion, { method: "POST", body: soapAutorizacion, headers: { "Content-Type": "text/xml" } });
                    const textAutPost = await resAutPost.text();
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
                        if (fullAutMsg) msgSri = fullAutMsg;
                    }
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

        // ─── PASO 4: NOTIFICACIÓN POR CORREO (Solo si acaba de ser AUTORIZADO) ───
        if (autorizado && comprobante.clientes?.email) {
            try {
                // ... (mantenemos la lógica de envío de correo exacta a la anterior para no romper nada) ...
                const ridePdfBytes = generarRidePdf(comprobante);
                const nombreCliente = (comprobante.clientes?.nombre || "CONSUMIDOR FINAL").toUpperCase();
                const identificacionCliente = comprobante.clientes?.identificacion || "9999999999999";
                const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
                const fechaFormat = new Date(comprobante.created_at).toLocaleDateString();

                await resend.emails.send({
                    from: "Notificacion <onboarding@resend.dev>",
                    to: comprobante.clientes.email,
                    subject: `Notificación de Documento Electrónico - ${comprobante.secuencial}`,
                    html: `
                        <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px;">
                            <div style="max-width: 600px; margin: auto; background-color: #fff; border: 1px solid #ddd;">
                                <div style="background-color: #708090; padding: 15px; text-align: center; color: #fff; font-size: 18px; font-weight: bold;">
                                    Notificación de Documento
                                </div>
                                <div style="padding: 25px; color: #333;">
                                    <h2 style="color: #4a4a4a; font-size: 18px; margin-bottom: 20px;">Nuevo Documento Electrónico Recibido</h2>
                                    <p>Estimado/a usuario/a,</p>
                                    <p>Le informamos que ha recibido un nuevo documento electrónico de <strong>${(comprobante.empresas.razon_social || "EMPRESA").toUpperCase()}</strong>. Enviamos adjunto el PDF + XML.</p>
                                    
                                    <p style="margin-top: 25px; font-weight: bold; color: #666; border-bottom: 1px solid #eee; padding-bottom: 5px;">Datos del Emisor:</p>
                                    <ul style="list-style: none; padding: 0; margin-top: 10px; font-size: 13px;">
                                        <li><strong>Nombre:</strong> ${(comprobante.empresas.razon_social || "Empresa").toUpperCase()}</li>
                                        <li><strong>RUC:</strong> ${comprobante.empresas.ruc}</li>
                                    </ul>

                                    <p style="margin-top: 25px; font-weight: bold; color: #666; border-bottom: 1px solid #eee; padding-bottom: 5px;">Detalles del documento:</p>
                                    <ul style="list-style: none; padding: 0; margin-top: 15px;">
                                        <li style="padding: 5px 0;">• <strong>Fecha:</strong> ${fechaFormat}</li>
                                        <li style="padding: 5px 0;">• <strong>Documento:</strong> Factura</li>
                                        <li style="padding: 5px 0;">• <strong>Número:</strong> ${comprobante.secuencial}</li>
                                        <li style="padding: 5px 0;">• <strong>Identificación:</strong> ${identificacionCliente}</li>
                                        <li style="padding: 5px 0;">• <strong>Nombre:</strong> ${nombreCliente}</li>
                                    </ul>
                                    <p style="margin-top: 25px;">Si tiene alguna pregunta, no dude en contactarnos.</p>
                                </div>
                                <div style="background-color: #607d8b; padding: 20px; text-align: center; color: #fff; font-size: 11px;">
                                    <p style="margin: 0;">Todos los derechos reservados. Software Desarrollado por Billennium System 0980136389</p>
                                    <p style="margin-top: 8px; font-weight: bold;">
                                        Factura electronica emitida por Billennium System para mayor informacion ingrese a 
                                        <a href="http://www.billenniumsystem.com" style="color: #fff; text-decoration: underline;">www.billenniumsystem.com</a>
                                    </p>
                                </div>
                            </div>
                        </div>
                    `,
                    attachments: [
                        { filename: `${comprobante.secuencial}.xml`, content: xmlFirmado },
                        { filename: `${comprobante.secuencial}.pdf`, content: btoa(String.fromCharCode(...ridePdfBytes)) },
                    ],
                });
            } catch (emailErr) {
                console.error("Error enviando correo:", emailErr);
            }
        }

        return new Response(JSON.stringify({
            success: true,
            authorized: autorizado,
            estado_sri,
            message: msgSri
        }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

    } catch (e: any) {
        return new Response(JSON.stringify({ success: false, error: e.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });
    }
});
