// xmlGeneratorGR.ts
// Genera el XML de Guía de Remisión (sin firma) — SRI Ecuador v1.1.0 codDoc=06

import { format } from "https://esm.sh/date-fns@3.6.0";

export default function generarXmlGR(guia: any): string {
    const empresa  = guia.empresa  || {};
    const configSri = empresa.config_sri || {};
    const detalles: any[] = guia.detalles || [];

    const ambiente    = configSri.ambiente === "PRODUCCION" ? "2" : "1";
    const secuencial9 = (guia.secuencial?.split("-").pop() || "000000001").padStart(9, "0");
    const estab       = (guia.secuencial?.split("-")[0] || "001").padStart(3, "0").slice(-3);
    const pto         = (guia.secuencial?.split("-")[1] || "001").padStart(3, "0").slice(-3);

    const fmtDate = (d: string | null | undefined): string => {
        if (!d) return format(new Date(), "dd/MM/yyyy");
        const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d);
    };

    // Tipo de identificación del transportista
    const tipoIdTransp = guia.transportista_tipo_id || "05"; // 04=RUC, 05=CI, 06=Pasaporte

    // Tipo de identificación del destinatario
    const idDest = (guia.destinatario_identificacion || "9999999999999").trim();
    let tipoIdDest: string;
    if (idDest === "9999999999999") {
        tipoIdDest = "07";
    } else if (idDest.length === 13 && idDest.endsWith("001")) {
        tipoIdDest = "04";
    } else if (idDest.length === 10) {
        tipoIdDest = "05";
    } else {
        tipoIdDest = "06";
    }

    const obligado = configSri.obligado_contabilidad || "NO";

    const rimpeTag = configSri.regimen_rimpe || empresa.razon_social?.includes("RIMPE")
        ? "<contribuyenteRimpe>CONTRIBUYENTE RÉGIMEN RIMPE</contribuyenteRimpe>"
        : "";

    // Total sin impuestos (suma de totales de detalles; GR no lleva IVA)
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const totalSinImpuestos = r2(detalles.reduce((s: number, d: any) => s + Number(d.total || 0), 0));

    const detallesXml = detalles.map((d: any) => `
    <detalle>
      <codigoPrincipal>${(d.codigo || d.producto_id || "SIN-COD").slice(0, 25)}</codigoPrincipal>
      <descripcion>${(d.descripcion || "Producto").toUpperCase().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</descripcion>
      <cantidad>${Number(d.cantidad).toFixed(6)}</cantidad>
      <precioUnitario>${Number(d.precio_unitario).toFixed(6)}</precioUnitario>
      <descuento>0.00</descuento>
      <precioTotalSinImpuesto>${Number(d.total).toFixed(2)}</precioTotalSinImpuesto>
    </detalle>`).join("");

    // Número de autorización del documento de sustento (la factura)
    const numAutSustento = guia.doc_sustento_autorizacion || "";
    const fechaSustento  = fmtDate(guia.doc_sustento_fecha as string);

    const xml = `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<guiaRemision id="comprobante" version="1.1.0">
  <infoTributaria>
    <ambiente>${ambiente}</ambiente>
    <tipoEmision>1</tipoEmision>
    <razonSocial>${(empresa.razon_social || empresa.nombre || "EMPRESA").toUpperCase()}</razonSocial>
    <nombreComercial>${(empresa.nombre || "EMPRESA").toUpperCase()}</nombreComercial>
    <ruc>${empresa.ruc || "9999999999999"}</ruc>
    <claveAcceso>${guia.clave_acceso}</claveAcceso>
    <codDoc>06</codDoc>
    <estab>${estab}</estab>
    <ptoEmi>${pto}</ptoEmi>
    <secuencial>${secuencial9}</secuencial>
    <dirMatriz>${(empresa.direccion || "ECUADOR").toUpperCase()}</dirMatriz>
    ${rimpeTag}
  </infoTributaria>
  <infoGuiaRemision>
    <dirEstablecimientoSalida>${(guia.dir_salida || empresa.direccion || "ECUADOR").toUpperCase()}</dirEstablecimientoSalida>
    <obligadoContabilidad>${obligado}</obligadoContabilidad>
    <tipoIdentificacionTransportista>${tipoIdTransp}</tipoIdentificacionTransportista>
    <razonSocialTransportista>${(guia.transportista_nombre || "").toUpperCase()}</razonSocialTransportista>
    <identificacionTransportista>${guia.transportista_identificacion}</identificacionTransportista>
    <placa>${(guia.placa || "").toUpperCase()}</placa>
    <fechaIniTransporte>${fmtDate(guia.fecha_ini_transporte as string)}</fechaIniTransporte>
    <fechaFinTransporte>${fmtDate(guia.fecha_fin_transporte as string)}</fechaFinTransporte>
  </infoGuiaRemision>
  <destinatarios>
    <destinatario>
      <identificacionDestinatario>${guia.destinatario_identificacion}</identificacionDestinatario>
      <razonSocialDestinatario>${(guia.destinatario_nombre || "").toUpperCase()}</razonSocialDestinatario>
      <dirDestinatario>${(guia.destinatario_direccion || "ECUADOR").toUpperCase()}</dirDestinatario>
      <motivoTraslado>${(guia.motivo_traslado || "VENTA").toUpperCase()}</motivoTraslado>
      <docAduaneroUnico/>
      <codEstabDestino>001</codEstabDestino>
      <ruta>${(guia.ruta || "").toUpperCase()}</ruta>
      <codDocSustento>01</codDocSustento>
      <numDocSustento>${guia.doc_sustento_numero}</numDocSustento>
      <numAutDocSustento>${numAutSustento}</numAutDocSustento>
      <fechaEmisionDocSustento>${fechaSustento}</fechaEmisionDocSustento>
      <detalles>${detallesXml}
      </detalles>
    </destinatario>
  </destinatarios>
  <infoAdicional>
    <campoAdicional nombre="Destinatario">${(guia.destinatario_nombre || "").toUpperCase()}</campoAdicional>
    <campoAdicional nombre="Ruta">${(guia.ruta || "S/N").toUpperCase()}</campoAdicional>
  </infoAdicional>
</guiaRemision>`;

    return xml.replace(/\n\s*\n/g, "\n");
}
