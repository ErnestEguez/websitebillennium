// xmlGeneratorLC.ts
// Genera el XML de Liquidación de Compra (codDoc=03) para SRI Ecuador v1.1.0
// Las retenciones de una LC son comprobantes separados — NO van en este XML.
// ─────────────────────────────────────────────────────────────────────────────

import { format } from "https://esm.sh/date-fns@3.6.0";

// Escapa texto libre antes de insertarlo en el XML — sin esto un "&", "<" o
// ">" en nombre/dirección del proveedor o descripción rompe la estructura
// del documento y el SRI la rechaza con ConversionArchivoXMLException.
function escapeXml(value: unknown): string {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

// Tipos de identificación SRI para el proveedor/beneficiario
const TIPO_ID_SRI: Record<string, string> = {
    CEDULA:    "05",
    PASAPORTE: "06",
    SIN_RUC:   "07",
    EXTERIOR:  "08",
    RUC:       "04",
};

export default function generarXmlLC(lc: any, empresa: any): string {
    const configSri = empresa.config_sri || {};
    const r2 = (n: number) => Math.round(n * 100) / 100;

    const ambiente    = configSri.ambiente === "PRODUCCION" ? "2" : "1";
    const estab       = (lc.establecimiento || "001").padStart(3, "0").slice(-3);
    const ptoEmi      = (lc.punto_emision   || "001").padStart(3, "0").slice(-3);
    const secuencial9 = (lc.secuencial      || "000000001").padStart(9, "0");

    // Fecha en hora Ecuador (UTC-5)
    const fechaRaw     = new Date(lc.fecha_emision + "T12:00:00");
    const fechaEmision = format(fechaRaw, "dd/MM/yyyy");

    // Tipo de identificación del beneficiario/proveedor
    const tipoIdProveedor = TIPO_ID_SRI[lc.beneficiario_tipo_id] || "05";

    // Totales
    const totalSinImpuestos = r2(lc.subtotal ?? 0);
    const totalDescuento    = 0;
    const valorIva          = r2(lc.valor_iva ?? 0);
    const importeTotal      = r2(lc.total ?? 0);

    // Totales con impuestos
    const base0   = r2(lc.base_iva_0  ?? 0);
    const base15  = r2(lc.base_iva_15 ?? 0);
    const totalConImpuestosBlocks: string[] = [];
    if (base0 > 0) {
        totalConImpuestosBlocks.push(`
      <totalImpuesto>
        <codigo>2</codigo>
        <codigoPorcentaje>0</codigoPorcentaje>
        <baseImponible>${base0.toFixed(2)}</baseImponible>
        <valor>0.00</valor>
      </totalImpuesto>`);
    }
    if (base15 > 0) {
        totalConImpuestosBlocks.push(`
      <totalImpuesto>
        <codigo>2</codigo>
        <codigoPorcentaje>4</codigoPorcentaje>
        <baseImponible>${base15.toFixed(2)}</baseImponible>
        <valor>${valorIva.toFixed(2)}</valor>
      </totalImpuesto>`);
    }
    // Siempre emitir al menos un bloque si ambas bases son 0
    if (base0 === 0 && base15 === 0) {
        totalConImpuestosBlocks.push(`
      <totalImpuesto>
        <codigo>2</codigo>
        <codigoPorcentaje>0</codigoPorcentaje>
        <baseImponible>${totalSinImpuestos.toFixed(2)}</baseImponible>
        <valor>0.00</valor>
      </totalImpuesto>`);
    }

    // Detalles
    const detalles: any[] = lc.detalles ?? [];
    const detallesXml = detalles.map((d: any, i: number) => {
        const cant = Number(d.cantidad || 1);
        const pu   = r2(Number(d.precio_unitario || 0));
        const sub  = r2(Number(d.subtotal || 0));
        const iva  = d.aplica_iva ? r2(sub * 0.15) : 0;
        const codigoPct = d.aplica_iva ? "4" : "0";
        const tarifa    = d.aplica_iva ? "15.00" : "0.00";
        return `
    <detalle>
      <codigoPrincipal>${String(i + 1).padStart(3, "0")}</codigoPrincipal>
      <descripcion>${escapeXml((d.descripcion || "SERVICIO").toUpperCase())}</descripcion>
      <cantidad>${cant.toFixed(6)}</cantidad>
      <precioUnitario>${pu.toFixed(6)}</precioUnitario>
      <descuento>${r2(Number(d.descuento || 0) * sub / 100).toFixed(2)}</descuento>
      <precioTotalSinImpuesto>${sub.toFixed(2)}</precioTotalSinImpuesto>
      <impuestos>
        <impuesto>
          <codigo>2</codigo>
          <codigoPorcentaje>${codigoPct}</codigoPorcentaje>
          <tarifa>${tarifa}</tarifa>
          <baseImponible>${sub.toFixed(2)}</baseImponible>
          <valor>${iva.toFixed(2)}</valor>
        </impuesto>
      </impuestos>
    </detalle>`;
    }).join("");

    const obligadoContabilidad = configSri.obligado_contabilidad || "NO";

    // Agente de retención — solo incluir si está habilitado
    const esAgenteRetencion = configSri.agente_retencion || empresa.agente_retencion;
    const agenteRetencionTag = esAgenteRetencion
        ? "\n    <agenteRetencion>1</agenteRetencion>"
        : "";

    // RIMPE
    const esRimpe = configSri.regimen_rimpe || (empresa.razon_social || "").includes("RIMPE");
    const rimpeTag = esRimpe
        ? "\n    <contribuyenteRimpe>CONTRIBUYENTE RÉGIMEN RIMPE</contribuyenteRimpe>"
        : "";

    // infoAdicional
    const camposAdicionales: string[] = [];
    if (lc.beneficiario_email) {
        camposAdicionales.push(`    <campoAdicional nombre="Email">${escapeXml(lc.beneficiario_email)}</campoAdicional>`);
    }
    if (lc.beneficiario_direccion) {
        camposAdicionales.push(`    <campoAdicional nombre="Direccion">${escapeXml((lc.beneficiario_direccion).toUpperCase())}</campoAdicional>`);
    }
    if (lc.observaciones) {
        camposAdicionales.push(`    <campoAdicional nombre="Observaciones">${escapeXml(lc.observaciones)}</campoAdicional>`);
    }
    if (camposAdicionales.length === 0) {
        camposAdicionales.push(`    <campoAdicional nombre="Emisor">${escapeXml((empresa.razon_social || "EMPRESA").toUpperCase())}</campoAdicional>`);
    }

    // XML v1.1.0 — estructura validada contra XML autorizado SRI Ecuador
    // SIN <pagos> y SIN <retenciones> (no forman parte del schema LC v1.1.0)
    const xml = `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<liquidacionCompra id="comprobante" version="1.1.0">
  <infoTributaria>
    <ambiente>${ambiente}</ambiente>
    <tipoEmision>1</tipoEmision>
    <razonSocial>${escapeXml((empresa.razon_social || empresa.nombre || "EMPRESA").toUpperCase())}</razonSocial>
    <nombreComercial>${escapeXml((empresa.nombre || empresa.razon_social || "EMPRESA").toUpperCase())}</nombreComercial>
    <ruc>${empresa.ruc || "9999999999999"}</ruc>
    <claveAcceso>${lc.clave_acceso}</claveAcceso>
    <codDoc>03</codDoc>
    <estab>${estab}</estab>
    <ptoEmi>${ptoEmi}</ptoEmi>
    <secuencial>${secuencial9}</secuencial>
    <dirMatriz>${escapeXml((empresa.direccion || "ECUADOR").toUpperCase())}</dirMatriz>${agenteRetencionTag}${rimpeTag}
  </infoTributaria>
  <infoLiquidacionCompra>
    <fechaEmision>${fechaEmision}</fechaEmision>
    <dirEstablecimiento>${escapeXml((empresa.direccion || "LOCAL PRINCIPAL").toUpperCase())}</dirEstablecimiento>
    <obligadoContabilidad>${obligadoContabilidad}</obligadoContabilidad>
    <tipoIdentificacionProveedor>${tipoIdProveedor}</tipoIdentificacionProveedor>
    <razonSocialProveedor>${escapeXml((lc.beneficiario_nombre || "PROVEEDOR").toUpperCase())}</razonSocialProveedor>
    <identificacionProveedor>${lc.beneficiario_identificacion}</identificacionProveedor>
    <totalSinImpuestos>${totalSinImpuestos.toFixed(2)}</totalSinImpuestos>
    <totalDescuento>${totalDescuento.toFixed(2)}</totalDescuento>
    <totalConImpuestos>${totalConImpuestosBlocks.join("")}
    </totalConImpuestos>
    <importeTotal>${importeTotal.toFixed(2)}</importeTotal>
    <moneda>DOLAR</moneda>
  </infoLiquidacionCompra>
  <detalles>${detallesXml}
  </detalles>
  <infoAdicional>
${camposAdicionales.join("\n")}
  </infoAdicional>
</liquidacionCompra>`;

    return xml.replace(/\n\s*\n/g, "\n");
}
