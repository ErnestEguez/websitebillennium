import { FORMA_PAGO_LABELS, TIPO_MOVIMIENTO_LABELS } from '../types/finance'
import type { ComprobanteEgreso, MovimientoBancario, LineaDistribucionContable } from '../types/finance'

// Comprobantes de Tesorería (Egreso / Ingreso) — formato A4, media página.
// El contenido se limita a ~media hoja para permitir archivar dos comprobantes
// por hoja A4; el "pie de informe" va dentro del documento (no como footer de @page).
const ESTILOS = `
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,sans-serif;font-size:10.5px;color:#111}
  .voucher{padding:14px 20px}
  .hdr{border-bottom:3px solid #1e3a5f;padding-bottom:8px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:flex-start}
  .emp{font-size:14px;font-weight:bold;color:#1e3a5f}
  .ruc{font-size:9px;color:#555;margin-top:2px}
  .doc-title{text-align:right}
  .doc-title h1{font-size:13px;font-weight:bold;text-transform:uppercase;color:#1e3a5f;letter-spacing:1px}
  .doc-title .num{font-size:12px;font-weight:bold;color:#c00;margin-top:3px;font-family:monospace}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}
  .campo{margin-bottom:5px}
  .campo .lbl{font-size:8.5px;text-transform:uppercase;color:#888;letter-spacing:.5px}
  .campo .val{font-size:10.5px;font-weight:600;color:#111;margin-top:1px;border-bottom:1px dotted #ccc;padding-bottom:1px}
  table{width:100%;border-collapse:collapse;margin:8px 0}
  thead tr{background:#1e3a5f;color:#fff}
  thead th{padding:4px 8px;text-align:left;font-size:9px;text-transform:uppercase}
  tbody tr:nth-child(even){background:#f4f6fb}
  tbody td{padding:3px 8px;border-bottom:1px solid #e2e6ee;font-size:10px}
  .total-row{background:#1e3a5f!important;color:#fff;font-weight:bold}
  .total-row td{padding:5px 8px}
  .firmas{margin-top:26px;display:grid;gap:20px}
  .firmas-2{grid-template-columns:repeat(2,1fr)}
  .firmas-3{grid-template-columns:repeat(3,1fr)}
  .firma-box{border-top:1px solid #1e3a5f;padding-top:5px;text-align:center}
  .firma-box .lbl{font-size:8.5px;text-transform:uppercase;color:#888;letter-spacing:.5px}
  .pie{margin-top:14px;font-size:8.5px;color:#aaa;border-top:1px solid #eee;padding-top:5px;text-align:center}
  @media print{
    body{padding:0}
    @page{margin:8mm;size:A4 portrait}
    .voucher{min-height:125mm}
  }
`

export function abrirVentanaImpresion(html: string): boolean {
    const w = window.open('', '_blank', 'width=800,height=700')
    if (!w) { alert('Activa las ventanas emergentes para imprimir'); return false }
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 600)
    return true
}

export function htmlComprobanteEgreso(params: {
    empresa: { nombre?: string | null; ruc?: string | null } | null
    eg: ComprobanteEgreso
    proveedor: { nombre_empresa: string; ruc: string } | null
    facturas: { numero_factura: string; monto_aplicado: number }[]
}): string {
    const { empresa, eg, proveedor, facturas } = params
    const fechaEmision = new Date().toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' })
    const filas = facturas.map(f =>
        `<tr><td>${f.numero_factura}</td><td style="text-align:right">$${f.monto_aplicado.toFixed(2)}</td></tr>`
    ).join('')

    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Comprobante de Egreso ${eg.numero}</title>
<style>${ESTILOS}</style></head><body>
<div class="voucher">
<div class="hdr">
  <div><div class="emp">${empresa?.nombre ?? ''}</div><div class="ruc">RUC: ${empresa?.ruc ?? ''}</div></div>
  <div class="doc-title"><h1>Comprobante de Egreso</h1><div class="num">${eg.numero}</div></div>
</div>
<div class="grid2">
  <div>
    <div class="campo"><div class="lbl">Proveedor</div><div class="val">${proveedor?.nombre_empresa ?? '—'}</div></div>
    <div class="campo"><div class="lbl">RUC / Cédula</div><div class="val">${proveedor?.ruc ?? '—'}</div></div>
    <div class="campo"><div class="lbl">Concepto</div><div class="val">${eg.concepto ?? 'Pago a proveedor'}</div></div>
  </div>
  <div>
    <div class="campo"><div class="lbl">Fecha</div><div class="val">${new Date(eg.fecha + 'T12:00:00').toLocaleDateString('es-EC',{day:'2-digit',month:'long',year:'numeric'})}</div></div>
    <div class="campo"><div class="lbl">Forma de pago</div><div class="val">${FORMA_PAGO_LABELS[eg.forma_pago]}</div></div>
    <div class="campo"><div class="lbl">Cuenta bancaria</div><div class="val">${eg.cuenta_bancaria?.banco?.nombre ? eg.cuenta_bancaria.banco.nombre + ' — ' + eg.cuenta_bancaria.numero_cuenta : '—'}</div></div>
    ${eg.referencia ? `<div class="campo"><div class="lbl">N° Referencia / Cheque</div><div class="val">${eg.referencia}</div></div>` : ''}
  </div>
</div>
${facturas.length ? `
<table>
  <thead><tr><th>Factura aplicada</th><th style="text-align:right">Monto aplicado</th></tr></thead>
  <tbody>${filas}</tbody>
  <tfoot><tr class="total-row"><td>TOTAL PAGADO</td><td style="text-align:right">$${eg.monto_total.toFixed(2)}</td></tr></tfoot>
</table>` : `<p style="margin:8px 0;color:#888;font-size:10px">Sin facturas registradas.</p>`}
<div class="firmas firmas-3">
  <div class="firma-box"><div class="lbl">Elaborado por</div></div>
  <div class="firma-box"><div class="lbl">Revisado por</div></div>
  <div class="firma-box"><div class="lbl">Recibí conforme</div></div>
</div>
<div class="pie">${empresa?.nombre ?? ''} — Comprobante de Egreso ${eg.numero} — Emitido el ${fechaEmision}</div>
</div>
</body></html>`
}

export function htmlComprobanteIngreso(params: {
    empresa: { nombre?: string | null; ruc?: string | null } | null
    mov: MovimientoBancario
    lineas?: LineaDistribucionContable[]
}): string {
    const { empresa, mov, lineas } = params
    const fechaEmision = new Date().toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' })
    const numero = `ING-${mov.fecha.replace(/-/g, '')}-${mov.id.slice(0, 4).toUpperCase()}`
    const filasLineas = (lineas ?? []).filter(l => l.cuenta_id).map(l =>
        `<tr><td>${l.cuenta_codigo} — ${l.cuenta_nombre}</td><td style="text-align:right">$${l.monto.toFixed(2)}</td></tr>`
    ).join('')

    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<title>Comprobante de Ingreso ${numero}</title>
<style>${ESTILOS}</style></head><body>
<div class="voucher">
<div class="hdr">
  <div><div class="emp">${empresa?.nombre ?? ''}</div><div class="ruc">RUC: ${empresa?.ruc ?? ''}</div></div>
  <div class="doc-title"><h1>Comprobante de Ingreso</h1><div class="num">${numero}</div></div>
</div>
<div class="grid2">
  <div>
    <div class="campo"><div class="lbl">Tipo de movimiento</div><div class="val">${TIPO_MOVIMIENTO_LABELS[mov.tipo]}</div></div>
    <div class="campo"><div class="lbl">Descripción / Concepto</div><div class="val">${mov.descripcion ?? '—'}</div></div>
    ${mov.referencia ? `<div class="campo"><div class="lbl">N° Referencia</div><div class="val">${mov.referencia}</div></div>` : ''}
  </div>
  <div>
    <div class="campo"><div class="lbl">Fecha</div><div class="val">${new Date(mov.fecha + 'T12:00:00').toLocaleDateString('es-EC',{day:'2-digit',month:'long',year:'numeric'})}</div></div>
    <div class="campo"><div class="lbl">Cuenta bancaria</div><div class="val">${mov.cuenta_bancaria?.banco?.nombre ? mov.cuenta_bancaria.banco.nombre + ' — ' + mov.cuenta_bancaria.numero_cuenta : '—'}</div></div>
    <div class="campo"><div class="lbl">Sentido</div><div class="val">${mov.sentido === 'credito' ? 'Crédito (ingreso)' : 'Débito'}</div></div>
  </div>
</div>
${filasLineas ? `
<table>
  <thead><tr><th>Cuenta contable</th><th style="text-align:right">Monto</th></tr></thead>
  <tbody>${filasLineas}</tbody>
  <tfoot><tr class="total-row"><td>TOTAL</td><td style="text-align:right">$${mov.monto.toFixed(2)}</td></tr></tfoot>
</table>` : `
<table>
  <tfoot><tr class="total-row"><td>MONTO TOTAL</td><td style="text-align:right">$${mov.monto.toFixed(2)}</td></tr></tfoot>
</table>`}
<div class="firmas firmas-2">
  <div class="firma-box"><div class="lbl">Elaborado por</div></div>
  <div class="firma-box"><div class="lbl">Revisado por</div></div>
</div>
<div class="pie">${empresa?.nombre ?? ''} — Comprobante de Ingreso ${numero} — Emitido el ${fechaEmision}</div>
</div>
</body></html>`
}
