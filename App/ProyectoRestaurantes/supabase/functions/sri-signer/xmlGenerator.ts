// xmlGenerator.ts
// Genera el XML del comprobante (sin firma) en formato SRI Ecuador v1.1.0
// ─────────────────────────────────────────────────────────────────────

import { format } from "https://esm.sh/date-fns@3.6.0";

export default function generarXml(comprobante: any): string {
  const empresa = comprobante.empresas || {};
  const cliente = comprobante.clientes || {};
  const configSri = empresa.config_sri || {};
  const detalles = comprobante.comprobante_detalles || [];
  const pagos = comprobante.comprobante_pagos || [];

  const ambiente = configSri.ambiente === "PRODUCCION" ? "2" : "1";
  const secuencial9 = comprobante.secuencial?.split("-").pop() || "000000001";
  const estab = (comprobante.secuencial?.split("-")[0] || "001").padStart(3, "0").slice(-3);
  const pto = (comprobante.secuencial?.split("-")[1] || "001").padStart(3, "0").slice(-3);
  const fechaEmision = format(new Date(comprobante.created_at || new Date()), "dd/MM/yyyy");

  // ── Calcular totales y desglosar IVA
  let subtotalSinIva = 0;
  let totalIva = 0;

  const detallesProcesados = detalles.map((d: any) => {
    const cantidad = Number(d.cantidad || 0);
    const precioUnitarioConIva = Number(d.precio_unitario || 0);
    const pctIva = Number(d.iva_porcentaje || 0);
    const factorIva = 1 + (pctIva / 100);

    const precioUnitarioSinIva = precioUnitarioConIva / factorIva;
    const subtotalItemSinIva = precioUnitarioSinIva * cantidad;
    const valorIvaItem = subtotalItemSinIva * (pctIva / 100);

    subtotalSinIva += subtotalItemSinIva;
    totalIva += valorIvaItem;

    return {
      ...d,
      precioUnitarioSinIva,
      subtotalItemSinIva,
      valorIvaItem,
      pctIva
    };
  });

  const totalConIva = subtotalSinIva + totalIva;

  // ── Agrupar IVAs para totalConImpuestos
  const ivaMap: Record<string, { base: number; valor: number; codigoPct: string; tarifa: number }> = {};
  detallesProcesados.forEach((d: any) => {
    const key = d.pctIva.toString();
    const codigoPct = d.pctIva === 15 ? "4" : d.pctIva === 12 ? "2" : d.pctIva === 0 ? "0" : d.pctIva === 5 ? "5" : "0";
    if (!ivaMap[key]) ivaMap[key] = { base: 0, valor: 0, codigoPct, tarifa: d.pctIva };
    ivaMap[key].base += d.subtotalItemSinIva;
    ivaMap[key].valor += d.valorIvaItem;
  });

  const totalConImpuestosXml = Object.values(ivaMap)
    .map(
      (iv) => `
      <totalImpuesto>
        <codigo>2</codigo>
        <codigoPorcentaje>${iv.codigoPct}</codigoPorcentaje>
        <baseImponible>${iv.base.toFixed(2)}</baseImponible>
        <valor>${iv.valor.toFixed(2)}</valor>
      </totalImpuesto>`
    )
    .join("");

  // ── Detalles XML
  const detallesXml = detallesProcesados
    .map(
      (d: any) => `
    <detalle>
      <codigoPrincipal>${(d.producto_id || "001").slice(0, 25)}</codigoPrincipal>
      <descripcion>${(d.nombre_producto || "Producto").toUpperCase()}</descripcion>
      <cantidad>${Number(d.cantidad).toFixed(6)}</cantidad>
      <precioUnitario>${d.precioUnitarioSinIva.toFixed(6)}</precioUnitario>
      <descuento>0.00</descuento>
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
    </detalle>`
    )
    .join("");

  // ── Pagos
  const formasPagoSri: Record<string, string> = {
    efectivo: "01",
    tarjeta_credito: "19",
    tarjeta_debito: "20",
    transferencia: "17",
    cheque: "15",
    credito: "16",
  };

  const pagosXml =
    pagos.length > 0
      ? pagos
        .map(
          (p: any) => `
      <pago>
        <formaPago>${formasPagoSri[p.metodo_pago] || "01"}</formaPago>
        <total>${Number(p.valor).toFixed(2)}</total>
      </pago>`
        )
        .join("")
      : `
      <pago>
        <formaPago>01</formaPago>
        <total>${(comprobante.total ?? totalConIva).toFixed(2)}</total>
      </pago>`;

  // ── Tipo de identificación
  const identificacion = (cliente.identificacion || "9999999999999").trim();
  let tipoId: string;
  if (identificacion === "9999999999999") {
    tipoId = "07";
  } else if (identificacion.length === 13 && identificacion.endsWith("001")) {
    tipoId = "04";
  } else if (identificacion.length === 10) {
    tipoId = "05";
  } else {
    tipoId = "06";
  }

  // DINÁMICO: Solo RIMPE si está configurado en la empresa.
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
    <totalSinImpuestos>${subtotalSinIva.toFixed(2)}</totalSinImpuestos>
    <totalDescuento>0.00</totalDescuento>
    <totalConImpuestos>${totalConImpuestosXml}
    </totalConImpuestos>
    <propina>0.00</propina>
    <importeTotal>${(comprobante.total ?? totalConIva).toFixed(2)}</importeTotal>
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

  return xml.replace(/\n\s*\n/g, '\n'); // Limpiar líneas vacías
}
