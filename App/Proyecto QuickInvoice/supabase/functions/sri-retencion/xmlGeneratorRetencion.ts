// xmlGeneratorRetencion.ts
// Genera comprobanteRetencion XML (codDoc=07, version 1.0.0) para SRI Ecuador

export interface RetencionLine {
    tipo:             string  // 'FUENTE' | 'IVA'
    codigo_retencion: string
    base_imponible:   number
    porcentaje:       number
    valor:            number
}

export interface RetencionXmlData {
    empresa: {
        ruc:          string
        razon_social: string
        nombre:       string
        direccion:    string
        config_sri:   Record<string, any>
    }
    proveedor: {
        ruc:            string
        nombre_empresa: string
    }
    compra: {
        fecha_emision:  string  // YYYY-MM-DD
        numero_factura: string
    }
    claveAcceso:  string
    estab:        string
    pto:          string
    secuencial:   string  // 9-digit padded
    retenciones:  RetencionLine[]
    fechaEmision: string  // YYYY-MM-DD
}

function fmtDate(s: string): string {
    const [y, m, d] = s.split('-')
    return `${d}/${m}/${y}`
}

// SRI exige exactamente 15 dígitos sin guiones: estab(3) + pto(3) + secuencial(9)
function fmtNumDoc(numero: string): string {
    const partes = (numero || '').split('-')
    if (partes.length === 3) {
        const estab = partes[0].padStart(3, '0').slice(-3)
        const pto   = partes[1].padStart(3, '0').slice(-3)
        const seq   = partes[2].padStart(9, '0').slice(-9)
        return estab + pto + seq
    }
    return numero.replace(/-/g, '').padStart(15, '0').slice(-15)
}

export function generarXmlRetencion(data: RetencionXmlData): string {
    const { empresa, proveedor, compra, claveAcceso, estab, pto, secuencial, retenciones, fechaEmision } = data
    const cfg     = empresa.config_sri || {}
    const ambiente = cfg.ambiente === 'PRODUCCION' ? '2' : '1'

    const [fy, fm] = fechaEmision.split('-')
    const periodoFiscal = `${fm}/${fy}`

    const rucProv = (proveedor.ruc || '').trim()
    const tipoIdProv = rucProv.length === 13 ? '04' : rucProv.length === 10 ? '05' : '04'

    const rimpeTag = cfg.regimen_rimpe
        ? '<contribuyenteRimpe>CONTRIBUYENTE RÉGIMEN RIMPE</contribuyenteRimpe>'
        : ''

    const impuestosXml = retenciones.map(r => {
        const codigoSRI = r.tipo === 'IVA' ? '1' : '2'
        return `
    <impuesto>
      <codigo>${codigoSRI}</codigo>
      <codigoRetencion>${r.codigo_retencion}</codigoRetencion>
      <baseImponible>${r.base_imponible.toFixed(2)}</baseImponible>
      <porcentajeRetener>${r.porcentaje.toFixed(2)}</porcentajeRetener>
      <valorRetenido>${r.valor.toFixed(2)}</valorRetenido>
      <codDocSustento>01</codDocSustento>
      <numDocSustento>${fmtNumDoc(compra.numero_factura || '001-001-000000001')}</numDocSustento>
      <fechaEmisionDocSustento>${fmtDate(compra.fecha_emision)}</fechaEmisionDocSustento>
    </impuesto>`
    }).join('')

    return `<?xml version="1.0" encoding="UTF-8"?>
<comprobanteRetencion id="comprobante" version="1.0.0">
  <infoTributaria>
    <ambiente>${ambiente}</ambiente>
    <tipoEmision>1</tipoEmision>
    <razonSocial>${(empresa.razon_social || empresa.nombre || '').toUpperCase()}</razonSocial>
    <nombreComercial>${(empresa.nombre || '').toUpperCase()}</nombreComercial>
    <ruc>${empresa.ruc}</ruc>
    <claveAcceso>${claveAcceso}</claveAcceso>
    <codDoc>07</codDoc>
    <estab>${estab}</estab>
    <ptoEmi>${pto}</ptoEmi>
    <secuencial>${secuencial}</secuencial>
    <dirMatriz>${(empresa.direccion || 'ECUADOR').toUpperCase()}</dirMatriz>
    ${rimpeTag}
  </infoTributaria>
  <infoCompRetencion>
    <fechaEmision>${fmtDate(fechaEmision)}</fechaEmision>
    <dirEstablecimiento>${(empresa.direccion || 'LOCAL PRINCIPAL').toUpperCase()}</dirEstablecimiento>
    <obligadoContabilidad>${cfg.obligado_contabilidad || 'NO'}</obligadoContabilidad>
    <tipoIdentificacionSujetoRetenido>${tipoIdProv}</tipoIdentificacionSujetoRetenido>
    <razonSocialSujetoRetenido>${proveedor.nombre_empresa.toUpperCase()}</razonSocialSujetoRetenido>
    <identificacionSujetoRetenido>${rucProv}</identificacionSujetoRetenido>
    <periodoFiscal>${periodoFiscal}</periodoFiscal>
  </infoCompRetencion>
  <impuestos>${impuestosXml}
  </impuestos>
</comprobanteRetencion>`
}
