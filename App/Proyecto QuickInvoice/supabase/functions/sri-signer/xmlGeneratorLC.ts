// xmlGeneratorLC.ts
// Genera el XML de Liquidación de Compra (codDoc=03) para SRI Ecuador v1.0.0
// ─────────────────────────────────────────────────────────────────────────────

import { format } from "https://esm.sh/date-fns@3.6.0";

// Tipos de identificación SRI para el proveedor/beneficiario
const TIPO_ID_SRI: Record<string, string> = {
    CEDULA:    "05",
    PASAPORTE: "06",
    SIN_RUC:   "07",
    EXTERIOR:  "08",
    RUC:       "04",
};

// Forma de pago → código SRI
const FORMA_PAGO_SRI: Record<string, string> = {
    CONTADO:      "01",
    CREDITO:      "16",
    EFECTIVO:     "01",
    TRANSFERENCIA:"17",
    CHEQUE:       "15",
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

    // Totales con impuestos (IVA 15%)
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

    // Detalles
    const detalles: any[] = lc.detalles ?? [];
    const detallesXml = detalles.map((d: any, i: number) => {
        const cant = Number(d.cantidad || 1);
        const pu   = r2(Number(d.precio_unitario || 0));
        const sub  = r2(Number(d.subtotal || 0));
        const iva  = d.aplica_iva ? r2(sub * 0.15) : 0;
        const codigoPct = d.aplica_iva ? "4" : "0";
        const tarifa    = d.aplica_iva ? "15" : "0";
        return `
    <detalle>
      <codigoPrincipal>${String(i + 1).padStart(3, "0")}</codigoPrincipal>
      <descripcion>${(d.descripcion || "SERVICIO").toUpperCase()}</descripcion>
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

    // Retenciones (sólo si hay retenciones registradas)
    const retenciones: any[] = lc.retenciones ?? [];
    let retencionesXml = "";
    if (retenciones.length > 0) {
        const retenLines = retenciones.map((r: any) => {
            // codigo: 1=Renta, 2=IVA
            const codigoRet = r.tipo === "IVA" ? "2" : "1";
            return `
    <retencion>
      <codigo>${codigoRet}</codigo>
      <codigoPorcentaje>${r.codigo_retencion}</codigoPorcentaje>
      <tarifa>${Number(r.porcentaje).toFixed(2)}</tarifa>
      <valor>${Number(r.valor).toFixed(2)}</valor>
    </retencion>`;
        }).join("");
        retencionesXml = `
  <retenciones>${retenLines}
  </retenciones>`;
    }

    // Pago
    const formaPagoSri = FORMA_PAGO_SRI[lc.forma_pago] || "01";
    const totalPago    = importeTotal - r2(lc.total_retenciones ?? 0);
    const diasPlazo    = lc.forma_pago === "CREDITO"
        ? Math.max(0, Math.round((new Date(lc.fecha_vencimiento || lc.fecha_emision).getTime() - new Date(lc.fecha_emision).getTime()) / 86400000))
        : 0;

    const obligadoContabilidad = configSri.obligado_contabilidad || "NO";

    const rimpeTag = configSri.regimen_rimpe || (empresa.razon_social || "").includes("RIMPE")
        ? "<contribuyenteRimpe>CONTRIBUYENTE RÉGIMEN RIMPE</contribuyenteRimpe>"
        : "";

    const xml = `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<liquidacionCompra id="comprobante" version="1.0.0">
  <infoTributaria>
    <ambiente>${ambiente}</ambiente>
    <tipoEmision>1</tipoEmision>
    <razonSocial>${(empresa.razon_social || empresa.nombre || "EMPRESA").toUpperCase()}</razonSocial>
    <nombreComercial>${(empresa.nombre || "EMPRESA").toUpperCase()}</nombreComercial>
    <ruc>${empresa.ruc || "9999999999999"}</ruc>
    <claveAcceso>${lc.clave_acceso}</claveAcceso>
    <codDoc>03</codDoc>
    <estab>${estab}</estab>
    <ptoEmi>${ptoEmi}</ptoEmi>
    <secuencial>${secuencial9}</secuencial>
    <dirMatriz>${(empresa.direccion || "ECUADOR").toUpperCase()}</dirMatriz>
    ${rimpeTag}
  </infoTributaria>
  <infoLiquidacionCompra>
    <fechaEmision>${fechaEmision}</fechaEmision>
    <dirEstablecimiento>${(empresa.direccion || "LOCAL PRINCIPAL").toUpperCase()}</dirEstablecimiento>
    <obligadoContabilidad>${obligadoContabilidad}</obligadoContabilidad>
    <tipoIdentificacionProveedor>${tipoIdProveedor}</tipoIdentificacionProveedor>
    <razonSocialProveedor>${(lc.beneficiario_nombre || "PROVEEDOR").toUpperCase()}</razonSocialProveedor>
    <identificacionProveedor>${lc.beneficiario_identificacion}</identificacionProveedor>
    <totalSinImpuestos>${totalSinImpuestos.toFixed(2)}</totalSinImpuestos>
    <totalDescuento>${totalDescuento.toFixed(2)}</totalDescuento>
    <totalConImpuestos>${totalConImpuestosBlocks.join("")}
    </totalConImpuestos>
    <importeTotal>${importeTotal.toFixed(2)}</importeTotal>
    <moneda>DOLAR</moneda>
    <pagos>
      <pago>
        <formaPago>${formaPagoSri}</formaPago>
        <total>${totalPago.toFixed(2)}</total>
        <plazo>${diasPlazo}</plazo>
        <unidadTiempo>DIAS</unidadTiempo>
      </pago>
    </pagos>
  </infoLiquidacionCompra>
  <detalles>${detallesXml}
  </detalles>${retencionesXml}
  <infoAdicional>
    <campoAdicional nombre="Email">${lc.beneficiario_email || "S/N"}</campoAdicional>
    <campoAdicional nombre="Direccion">${(lc.beneficiario_direccion || "S/N").toUpperCase()}</campoAdicional>
    ${lc.observaciones ? `<campoAdicional nombre="Observaciones">${lc.observaciones}</campoAdicional>` : ""}
  </infoAdicional>
</liquidacionCompra>`;

    return xml.replace(/\n\s*\n/g, "\n");
}
