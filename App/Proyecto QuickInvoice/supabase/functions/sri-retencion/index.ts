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
    const p12Asn1 = forge.asn1.fromDer(p12Der, false);
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
        const { compra_id, empresa_id, solo_consulta } = await req.json();
        if (!compra_id || !empresa_id)
            throw new Error("compra_id y empresa_id son requeridos");

        const supabase = createClient(
            Deno.env.get("SUPABASE_URL")!,
            Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
            { db: { schema: "facturacion" } }
        );

        // ── 1. Fetch retenciones ──────────────────────────────
        const { data: rows, error: rowsErr } = await supabase
            .from("retenciones_compras")
            .select(`
                id, tipo, codigo_retencion, base_imponible, porcentaje, valor,
                fecha_emision, numero_retencion, estado, estado_sri,
                clave_acceso, numero_autorizacion, xml_firmado,
                proveedor:proveedores(ruc, nombre_empresa)
            `)
            .eq("compra_id", compra_id)
            .eq("empresa_id", empresa_id)
            .neq("estado", "ANULADO")
            .order("tipo");

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

        // ── 4. Fetch compra (numero_factura, fecha_emision) ───
        const { data: compra, error: compraErr } = await supabase
            .from("ingresos_stock")
            .select("numero_factura, fecha_emision")
            .eq("id", compra_id)
            .single();

        if (compraErr || !compra) throw new Error("Compra no encontrada");

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
                        fecha_emision:  (compra as any).fecha_emision,
                        numero_factura: (compra as any).numero_factura || "",
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

        await supabase
            .from("retenciones_compras")
            .update(updatePayload)
            .eq("compra_id", compra_id)
            .eq("empresa_id", empresa_id)
            .neq("estado", "ANULADO");

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
