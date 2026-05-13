// xmlGeneratorNC.ts
// Genera el XML de Nota de Crédito (codDoc=04) en formato SRI Ecuador v1.0.0
// ─────────────────────────────────────────────────────────────────────────────

import { format } from "https://esm.sh/date-fns@3.6.0";

export default function generarXmlNC(nc: any): string {
  const empresa    = nc.empresas || {};
  const cliente    = nc.clientes || {};
  const configSri  = empresa.config_sri || {};
  const detalles   = nc.notas_credito_detalle || [];
  const origen     = nc.comprobante_origen || {};   // factura de referencia (join)

  const ambiente      = configSri.ambiente === "PRODUCCION" ? "2" : "1";
  const secuencial9   = (nc.secuencial?.split("-").pop() || "000000001").padStart(9, "0");
  const estab         = (nc.secuencial?.split("-")[0] || "001").padStart(3, "0").slice(-3);
  const pto           = (nc.secuencial?.split("-")[1] || "001").padStart(3, "0").slice(-3);
  const fechaEmision  = format(new Date(nc.created_at || new Date()), "dd/MM/yyyy");
  const fechaOrigen   = format(new Date(origen.created_at || new Date()), "dd/MM/yyyy");

  const r2 = (n: number) => Math.round(n * 100) / 100;

  // ── Procesar detalles con el mismo patrón exacto que xmlGenerator.ts
  const detallesProcesados = detalles.map((d: any) => {
    const cantidad             = Number(d.cantidad        || 0);
    const pctIva               = Number(d.iva_porcentaje  || 0);
    const precioUnitarioSinIva = r2(Number(d.precio_unitario || 0));
    const subtotalItemSinIva   = r2(Number(d.subtotal         || 0));
    const valorIvaItem         = r2(Number(d.iva_valor        || 0));
    const descuentoPct         = Number(d.descuento || 0);
    const descuentoValor       = r2(precioUnitarioSinIva * cantidad * descuentoPct / 100);

    return { ...d, precioUnitarioSinIva, subtotalItemSinIva, valorIvaItem, pctIva, descuentoValor };
  });

  // ── Agrupar por tasa de IVA (mismo patrón que factura)
  const ivaMap: Record<string, { base: number; valor: number; codigoPct: string; tarifa: number }> = {};
  detallesProcesados.forEach((d: any) => {
    const key        = d.pctIva.toString();
    const codigoPct  = d.pctIva === 15 ? "4" : d.pctIva === 12 ? "2" : d.pctIva === 5 ? "5" : "0";
    if (!ivaMap[key]) ivaMap[key] = { base: 0, valor: 0, codigoPct, tarifa: d.pctIva };
    ivaMap[key].base  = r2(ivaMap[key].base  + d.subtotalItemSinIva);
    ivaMap[key].valor = r2(ivaMap[key].valor + d.valorIvaItem);
  });

  const totalSinImpuestosXml = r2(Object.values(ivaMap).reduce((s, iv) => s + iv.base,  0));
  const totalImpuestosXml    = r2(Object.values(ivaMap).reduce((s, iv) => s + iv.valor, 0));
  const valorModificacionXml = r2(totalSinImpuestosXml + totalImpuestosXml);

  const totalConImpuestosXml = Object.values(ivaMap).map(iv => `
      <totalImpuesto>
        <codigo>2</codigo>
        <codigoPorcentaje>${iv.codigoPct}</codigoPorcentaje>
        <baseImponible>${iv.base.toFixed(2)}</baseImponible>
        <valor>${iv.valor.toFixed(2)}</valor>
      </totalImpuesto>`).join("");

  const detallesXml = detallesProcesados.map((d: any) => `
    <detalle>
      <codigoInterno>${(d.productos?.codigo || d.producto_id || "SIN-COD").slice(0, 25)}</codigoInterno>
      <descripcion>${(d.nombre_producto || "Producto").toUpperCase()}</descripcion>
      <cantidad>${Number(d.cantidad).toFixed(6)}</cantidad>
      <precioUnitario>${d.precioUnitarioSinIva.toFixed(6)}</precioUnitario>
      <descuento>${d.descuentoValor.toFixed(2)}</descuento>
      <precioTotalSinImpuesto>${d.subtotalItemSinIva.toFixed(2)}</precioTotalSinImpuesto>
      <impuestos>
        <impuesto>
          <codigo>2</codigo>
          <codigoPorcentaje>${d.pctIva === 15 ? "4" : d.pctIva === 12 ? "2" : d.pctIva === 5 ? "5" : "0"}</codigoPorcentaje>
          <tarifa>${d.pctIva.toFixed(0)}</tarifa>
          <baseImponible>${d.subtotalItemSinIva.toFixed(2)}</baseImponible>
          <valor>${d.valorIvaItem.toFixed(2)}</valor>
        </impuesto>
      </impuestos>
    </detalle>`).join("");

  // ── Tipo de identificación comprador
  const identificacion = (cliente.identificacion || "9999999999999").trim();
  let tipoId: string;
  if (identificacion === "9999999999999")                              tipoId = "07";
  else if (identificacion.length === 13 && identificacion.endsWith("001")) tipoId = "04";
  else if (identificacion.length === 10)                               tipoId = "05";
  else                                                                 tipoId = "06";

  // ── Motivo: combina código SRI + descripción libre
  const motivoTextos: Record<string, string> = {
    "01": "DEVOLUCION Y ANULACION DE BIENES",
    "02": "ANULACION DE COMPROBANTE ELECTRONICO",
    "03": "REBAJA O DESCUENTO",
    "04": "CORRECCION EN EL VALOR",
  };
  const motivoFinal = `${motivoTextos[nc.motivo_sri] || "DEVOLUCION"}: ${nc.motivo_descripcion || ""}`.toUpperCase();

  const rimpeTag = configSri.regimen_rimpe || empresa.razon_social?.includes("RIMPE")
    ? "<contribuyenteRimpe>CONTRIBUYENTE RÉGIMEN RIMPE</contribuyenteRimpe>"
    : "";

  const xml = `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<notaCredito id="comprobante" version="1.0.0">
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
    <numDocModificado>${origen.secuencial || ""}</numDocModificado>
    <fechaEmisionDocSustento>${fechaOrigen}</fechaEmisionDocSustento>
    <totalSinImpuestos>${totalSinImpuestosXml.toFixed(2)}</totalSinImpuestos>
    <valorModificacion>${valorModificacionXml.toFixed(2)}</valorModificacion>
    <moneda>DOLAR</moneda>
    <totalConImpuestos>${totalConImpuestosXml}
    </totalConImpuestos>
    <motivo>${motivoFinal}</motivo>
  </infoNotaCredito>
  <detalles>${detallesXml}
  </detalles>
  <infoAdicional>
    <campoAdicional nombre="Email">${cliente.email || "S/N"}</campoAdicional>
    <campoAdicional nombre="FacturaOrigen">${origen.secuencial || "S/N"}</campoAdicional>
  </infoAdicional>
</notaCredito>`;

  return xml.replace(/\n\s*\n/g, '\n');
}
