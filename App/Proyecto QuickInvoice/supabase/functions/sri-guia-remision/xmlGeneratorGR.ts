// xmlGeneratorGR.ts
// Genera el XML de Guía de Remisión (sin firma) — SRI Ecuador v1.0.0 codDoc=06
// Estructura validada contra XML autorizado real

import { format } from "https://esm.sh/date-fns@3.6.0";

export default function generarXmlGR(guia: any): string {
    const empresa   = guia.empresa  || {};
    const configSri = empresa.config_sri || {};
    const detalles: any[] = guia.detalles || [];

    const ambiente    = configSri.ambiente === "PRODUCCION" ? "2" : "1";
    const secuencial9 = (guia.secuencial?.split("-").pop() || "000000001").padStart(9, "0");
    const estab       = (guia.secuencial?.split("-")[0] || "001").padStart(3, "0").slice(-3);
    const pto         = (guia.secuencial?.split("-")[1] || "001").padStart(3, "0").slice(-3);

    // Solo & y < — escapar comillas aquí rompe la verificación de firma XAdES
    // (C14N no reintroduce &quot; en contenido de texto al canonicalizar).
    const esc = (s: string) => String(s || "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;");

    const fmtDate = (d: string | null | undefined): string => {
        if (!d) return format(new Date(), "dd/MM/yyyy");
        const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d);
    };

    const obligado = configSri.obligado_contabilidad || "NO";

    // Tipo de identificación del transportista (04=RUC, 05=Cédula, 06=Pasaporte)
    const tipoIdTransp = guia.transportista_tipo_id || "05";

    // RIMPE (solo si aplica)
    const rimpeTag = (configSri.regimen_rimpe || empresa.razon_social?.includes("RIMPE"))
        ? "\n    <contribuyenteRimpe>CONTRIBUYENTE RÉGIMEN RIMPE</contribuyenteRimpe>"
        : "";

    // Detalles — v1.0.0: codigoInterno, descripcion, cantidad (sin precios)
    const detallesXml = detalles.map((d: any) => `
      <detalle>
        <codigoInterno>${esc((d.codigo || d.producto_id || "SIN-COD").slice(0, 25))}</codigoInterno>
        <descripcion>${esc((d.descripcion || "Producto").toUpperCase())}</descripcion>
        <cantidad>${Number(d.cantidad).toFixed(2)}</cantidad>
      </detalle>`).join("");

    // Documento de sustento (opcional — solo si existe)
    const numAutSustento = guia.doc_sustento_autorizacion || "";
    const fechaSustento  = fmtDate(guia.doc_sustento_fecha as string);
    const sustentoXml    = guia.doc_sustento_numero ? `
      <codDocSustento>01</codDocSustento>
      <numDocSustento>${esc(guia.doc_sustento_numero)}</numDocSustento>
      <numAutDocSustento>${esc(numAutSustento)}</numAutDocSustento>
      <fechaEmisionDocSustento>${fechaSustento}</fechaEmisionDocSustento>` : "";

    const xml = `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<guiaRemision id="comprobante" version="1.0.0">
  <infoTributaria>
    <ambiente>${ambiente}</ambiente>
    <tipoEmision>1</tipoEmision>
    <razonSocial>${esc((empresa.razon_social || empresa.nombre || "EMPRESA").toUpperCase())}</razonSocial>
    <nombreComercial>${esc((empresa.nombre || "EMPRESA").toUpperCase())}</nombreComercial>
    <ruc>${empresa.ruc || "9999999999999"}</ruc>
    <claveAcceso>${guia.clave_acceso}</claveAcceso>
    <codDoc>06</codDoc>
    <estab>${estab}</estab>
    <ptoEmi>${pto}</ptoEmi>
    <secuencial>${secuencial9}</secuencial>
    <dirMatriz>${esc((empresa.direccion || "ECUADOR").toUpperCase())}</dirMatriz>${rimpeTag}
  </infoTributaria>
  <infoGuiaRemision>
    <dirEstablecimiento>${esc((empresa.direccion || "ECUADOR").toUpperCase())}</dirEstablecimiento>
    <dirPartida>${esc((guia.dir_salida || empresa.direccion || "ECUADOR").toUpperCase())}</dirPartida>
    <razonSocialTransportista>${esc((guia.transportista_nombre || "").toUpperCase())}</razonSocialTransportista>
    <tipoIdentificacionTransportista>${tipoIdTransp}</tipoIdentificacionTransportista>
    <rucTransportista>${esc(guia.transportista_identificacion || "")}</rucTransportista>
    <obligadoContabilidad>${obligado}</obligadoContabilidad>
    <fechaIniTransporte>${fmtDate(guia.fecha_ini_transporte as string)}</fechaIniTransporte>
    <fechaFinTransporte>${fmtDate(guia.fecha_fin_transporte as string)}</fechaFinTransporte>
    <placa>${esc((guia.placa || "").toUpperCase())}</placa>
  </infoGuiaRemision>
  <destinatarios>
    <destinatario>
      <identificacionDestinatario>${esc(guia.destinatario_identificacion || "9999999999999")}</identificacionDestinatario>
      <razonSocialDestinatario>${esc((guia.destinatario_nombre || "").toUpperCase())}</razonSocialDestinatario>
      <dirDestinatario>${esc((guia.destinatario_direccion || "ECUADOR").toUpperCase())}</dirDestinatario>
      <motivoTraslado>${esc((guia.motivo_traslado || "VENTA").toUpperCase())}</motivoTraslado>
      <ruta>${esc((guia.ruta || "").toUpperCase())}</ruta>${sustentoXml}
      <detalles>${detallesXml}
      </detalles>
    </destinatario>
  </destinatarios>
  <infoAdicional>
    <campoAdicional nombre="Destinatario">${esc((guia.destinatario_nombre || "").toUpperCase())}</campoAdicional>
    <campoAdicional nombre="Ruta">${esc((guia.ruta || "S/N").toUpperCase())}</campoAdicional>
  </infoAdicional>
</guiaRemision>`;

    return xml.replace(/\n\s*\n/g, "\n");
}
