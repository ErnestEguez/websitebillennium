import { useState, useEffect } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { HelpButton } from '../components/help/HelpButton'
import { useFormDraft } from '../hooks/useFormDraft'
import { preparacionPinturaService } from '../services/preparacionPinturaService'
import { useAuth } from '../contexts/AuthContext'
import { facturacionService } from '../services/facturacionService'
import {
    facturaDirectaService,
    calcularLinea,
    calcularTotalesFactura,
    type DetalleFacturaDirecta,
    type PagoFactura,
} from '../services/facturaDirectaService'
import { proformaService, type Proforma, type EstadoProforma } from '../services/proformaService'
import { vendedorService, type Vendedor } from '../services/vendedorService'
import { catalogCacheService } from '../services/catalogCacheService'
import { supabase } from '../lib/supabase'
import { cuentasBancariasService } from '../services/finance/bancosService'
import { precioVolumenService } from '../services/precioVolumenService'
import type { CuentaBancaria } from '../types/finance'
import { formatCurrency } from '../lib/utils'
import { mensajeErrorFuncion } from '../lib/functionsError'
import {
    FileText, FilePlus, Search, Plus, Trash2, X, Save, Loader2,
    User, Briefcase, Package, ChevronDown, ChevronUp, ArrowLeft,
    CheckCircle2, RefreshCw, Ban, CreditCard, Eye,
    FileCheck, AlertCircle, Printer, PaintBucket, Mail,
} from 'lucide-react'
import { cn } from '../lib/utils'

// ─── Print helpers ───────────────────────────────────────────────────────────

function esc(s: string | null | undefined): string {
    if (!s) return ''
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function n2(n: number): string { return n.toFixed(2) }

function generarHtmlA4(
    prf: Proforma,
    emp: { nombre: string; ruc: string; logo_url?: string | null },
): string {
    const fecha = new Date(prf.created_at).toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' })
    const detalles = prf.detalles ?? []
    const filas = detalles.map((d, i) => `
        <tr>
          <td class="c">${i + 1}</td>
          <td>${esc(d.nombre_producto)}</td>
          <td class="c">${n2(d.cantidad)}</td>
          <td class="r">${n2(d.precio_unitario)}</td>
          <td class="c">${d.descuento > 0 ? d.descuento + '%' : '—'}</td>
          <td class="c">${d.iva_porcentaje}%</td>
          <td class="r bold">${n2(d.total_linea)}</td>
        </tr>`).join('')

    const logoHtml = emp.logo_url
        ? `<img src="${esc(emp.logo_url)}" alt="Logo" style="max-height:65px;max-width:150px;object-fit:contain;margin-bottom:6px;">`
        : ''

    const estadoColor = prf.estado === 'anulada' ? '#b91c1c' : prf.estado === 'convertida' ? '#3730a3' : '#065f46'
    const estadoLabel = prf.estado === 'vigente' ? 'VIGENTE' : prf.estado === 'convertida' ? 'CONVERTIDA' : 'ANULADA'

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Proforma ${esc(prf.numero)}</title>
<style>
  @page { margin: 14mm 14mm 18mm 14mm; size: A4; }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;font-size:9.5pt;color:#1a1a2e}
  .header{display:flex;justify-content:space-between;align-items:flex-start;
          padding-bottom:12px;margin-bottom:14px;border-bottom:3px solid #7c3aed}
  .emp h1{font-size:14pt;font-weight:900;color:#7c3aed;margin-bottom:3px}
  .emp p{font-size:8.5pt;color:#555;line-height:1.6}
  .doc-box{text-align:right}
  .doc-box .titulo{font-size:14pt;font-weight:900;color:#7c3aed;letter-spacing:.5px}
  .doc-box .numero{font-family:monospace;font-size:10pt;font-weight:bold;color:#1a1a2e}
  .doc-box .fec{font-size:8.5pt;color:#555;margin-top:3px}
  .badge{display:inline-block;padding:2px 9px;border-radius:12px;font-size:7.5pt;
         font-weight:bold;margin-top:5px;background:#f0fdf4;color:${estadoColor};border:1px solid ${estadoColor}}
  .cli-box{background:#f5f3ff;border:1px solid #ddd6fe;border-radius:7px;
           padding:10px 14px;margin-bottom:14px}
  .cli-box h4{font-size:7pt;font-weight:900;text-transform:uppercase;letter-spacing:1px;
              color:#7c3aed;margin-bottom:6px}
  .cli-grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 20px}
  .lbl{font-size:8pt;color:#888}
  .val{font-size:9pt;font-weight:bold;color:#1a1a2e}
  table{width:100%;border-collapse:collapse;margin-bottom:12px;font-size:8.5pt}
  thead tr{background:#7c3aed;color:#fff}
  thead th{padding:6px 8px;text-align:left;font-size:7.5pt;font-weight:bold}
  tbody tr:nth-child(even){background:#faf9ff}
  tbody td{padding:5px 8px;border-bottom:1px solid #ede9fe}
  .c{text-align:center}
  .r{text-align:right}
  .bold{font-weight:bold}
  .totbox{width:270px;margin-left:auto;border:1px solid #ddd6fe;border-radius:7px;overflow:hidden}
  .totbox table{margin-bottom:0}
  .totbox tr td{padding:5px 10px;border-bottom:1px solid #ede9fe;font-size:9pt}
  .totbox tr:last-child td{background:#7c3aed;color:#fff;font-size:11pt;font-weight:900;border-bottom:none}
  .totbox td:last-child{text-align:right;font-weight:bold}
  .obs{margin-top:14px;border-top:1px solid #ede9fe;padding-top:10px;font-size:8.5pt;color:#555}
  .obs strong{color:#1a1a2e}
  .footer{margin-top:18px;border-top:1px solid #ede9fe;padding-top:8px;
          text-align:center;font-size:7.5pt;color:#aaa}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head>
<body>
<div class="header">
  <div class="emp">
    ${logoHtml}
    <h1>${esc(emp.nombre)}</h1>
    <p>RUC: <strong>${esc(emp.ruc)}</strong></p>
  </div>
  <div class="doc-box">
    <div class="titulo">PROFORMA DE VENTA</div>
    <div class="numero">${esc(prf.numero)}</div>
    <div class="fec">Fecha: ${fecha}</div>
    <div><span class="badge">${estadoLabel}</span></div>
    ${prf.factura_numero ? `<div style="margin-top:6px;font-size:8pt;color:#555">Factura: <strong style="color:#3730a3;font-family:monospace">${esc(prf.factura_numero)}</strong></div>` : ''}
  </div>
</div>

<div class="cli-box">
  <h4>Datos del cliente</h4>
  <div class="cli-grid">
    <div>
      <div class="lbl">Nombre / Razón Social</div>
      <div class="val">${esc(prf.cliente?.nombre)}</div>
    </div>
    <div>
      <div class="lbl">RUC / Cédula</div>
      <div class="val">${esc(prf.cliente?.identificacion)}</div>
    </div>
    ${prf.cliente?.email ? `<div><div class="lbl">Email</div><div class="val">${esc(prf.cliente.email)}</div></div>` : ''}
    ${prf.cliente?.telefono ? `<div><div class="lbl">Teléfono</div><div class="val">${esc(prf.cliente.telefono)}</div></div>` : ''}
    ${prf.cliente?.direccion ? `<div style="grid-column:1/-1"><div class="lbl">Dirección</div><div class="val">${esc(prf.cliente.direccion)}</div></div>` : ''}
  </div>
</div>

<table>
  <thead>
    <tr>
      <th style="width:28px">#</th>
      <th>Descripción</th>
      <th class="c" style="width:60px">Cant.</th>
      <th class="r" style="width:88px">P.Unitario</th>
      <th class="c" style="width:52px">Dto.</th>
      <th class="c" style="width:50px">IVA</th>
      <th class="r" style="width:88px">Total</th>
    </tr>
  </thead>
  <tbody>
    ${filas || '<tr><td colspan="7" style="text-align:center;color:#aaa;padding:14px">Sin ítems</td></tr>'}
  </tbody>
</table>

<div class="totbox">
  <table>
    ${prf.base_iva_0 > 0 ? `<tr><td>Base 0%</td><td>$ ${n2(prf.base_iva_0)}</td></tr>` : ''}
    ${prf.base_iva_15 > 0 ? `<tr><td>Base 15%</td><td>$ ${n2(prf.base_iva_15)}</td></tr>` : ''}
    ${prf.descuento_total > 0 ? `<tr><td style="color:#b45309">Descuentos</td><td style="color:#b45309">− $ ${n2(prf.descuento_total)}</td></tr>` : ''}
    <tr><td>IVA (15%)</td><td>$ ${n2(prf.valor_iva)}</td></tr>
    <tr><td>TOTAL A PAGAR</td><td>$ ${n2(prf.total)}</td></tr>
  </table>
</div>

${prf.observaciones ? `<div class="obs"><strong>Observaciones:</strong> ${esc(prf.observaciones)}</div>` : ''}

<div class="footer">
  Este documento es una cotización referencial y <strong>no tiene validez tributaria</strong>.<br>
  Generado por QuickInvoice &nbsp;·&nbsp; ${new Date().toLocaleDateString('es-EC')}
</div>
</body>
</html>`
}

interface EmpresaTicket {
    nombre: string
    ruc: string
    logo_url?: string | null
    direccion?: string | null
    email?: string | null
    ciudad?: string | null
}

function generarHtml80mm(
    prf: Proforma,
    emp: EmpresaTicket,
): string {
    const fecha = new Date(prf.created_at).toLocaleDateString('es-EC')
    const detalles = prf.detalles ?? []
    const logoHtml = emp.logo_url
        ? `<div class="c" style="margin-bottom:4px"><img src="${esc(emp.logo_url)}" alt="Logo" style="width:60mm;max-height:35mm;object-fit:contain"></div>`
        : ''
    // Una sola línea por ítem (Cant/Descripción/Unit./Total), igual que el
    // ticket de factura real — si la descripción no cabe, se envuelve hacia
    // abajo sola (word-break), sin arrastrar las demás columnas.
    const filas = detalles.map(d => `
        <tr>
          <td class="c" style="padding:2px 1px">${n2(d.cantidad)}</td>
          <td style="padding:2px 4px;word-break:break-word">${esc(d.nombre_producto)}${d.descuento > 0 ? ` (-${d.descuento}%)` : ''}</td>
          <td class="r" style="padding:2px 1px;white-space:nowrap">$${n2(d.precio_unitario)}</td>
          <td class="r" style="padding:2px 1px;white-space:nowrap">$${n2(d.subtotal)}</td>
        </tr>`).join('')

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Proforma ${esc(prf.numero)}</title>
<style>
  @page{margin:0;size:80mm auto}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Courier New',Courier,monospace;font-size:8pt;font-weight:bold;color:#000;width:72mm;padding-left:2mm}
  .c{text-align:center}
  .r{text-align:right}
  .b{font-weight:bold}
  .emp{font-size:10.5pt;font-weight:900;text-align:center}
  .sep{border:none;border-top:1px dashed #000;margin:4px 0}
  table{width:100%;border-collapse:collapse}
  td,th{vertical-align:top}
  .items-head th{border-bottom:1px dashed #000;padding:0 1px 2px;font-size:7.5pt;text-align:left}
  .items-head th.c{text-align:center}
  .items-head th.r{text-align:right}
  .tot-lbl{width:55%}
  .tot-val{width:45%;text-align:right;font-weight:bold}
  .gran-total td{border-top:1px solid #000;padding-top:3px;font-size:9.5pt;font-weight:900}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head>
<body>
${logoHtml}
<div class="emp">${esc(emp.nombre)}</div>
<div class="c" style="font-size:7.5pt">RUC: ${esc(emp.ruc)}</div>
${emp.direccion ? `<div class="c" style="font-size:7pt">${esc(emp.direccion)}</div>` : ''}
<div class="c" style="font-size:7pt">${emp.email ? esc(emp.email) + ' - ' : ''}${esc(emp.ciudad || 'Guayaquil')} - Ecuador</div>
<hr class="sep">
<div class="c b" style="font-size:9pt">PROFORMA DE VENTA</div>
<div class="c b" style="font-size:8pt">${esc(prf.numero)}</div>
<div class="c" style="font-size:7.5pt">Fecha: ${fecha}</div>
<hr class="sep">
<div><span class="b">Cliente:</span> ${esc(prf.cliente?.nombre)}</div>
<div><span class="b">RUC/CI:</span> ${esc(prf.cliente?.identificacion)}</div>
${prf.cliente?.telefono ? `<div><span class="b">Tel:</span> ${esc(prf.cliente.telefono)}</div>` : ''}
<hr class="sep">
<table>
  <thead class="items-head">
    <tr>
      <th class="c">Cant</th>
      <th>Descripción</th>
      <th class="r">Unit.</th>
      <th class="r">Total</th>
    </tr>
  </thead>
  <tbody>
    ${filas || '<tr><td colspan="4" style="text-align:center">Sin ítems</td></tr>'}
  </tbody>
</table>
<hr class="sep">
<table>
  <tr><td class="tot-lbl">Subtotal 0%</td><td class="tot-val">$${n2(prf.base_iva_0)}</td></tr>
  <tr><td class="tot-lbl">Subtotal 15%</td><td class="tot-val">$${n2(prf.base_iva_15)}</td></tr>
  ${prf.descuento_total > 0 ? `<tr><td class="tot-lbl">Descuentos</td><td class="tot-val">-$${n2(prf.descuento_total)}</td></tr>` : ''}
  <tr><td class="tot-lbl">IVA (15%)</td><td class="tot-val">$${n2(prf.valor_iva)}</td></tr>
  <tr class="gran-total"><td class="tot-lbl">TOTAL</td><td class="tot-val">$${n2(prf.total)}</td></tr>
</table>
${prf.observaciones ? `<hr class="sep"><div style="font-size:7.5pt"><span class="b">Obs:</span> ${esc(prf.observaciones)}</div>` : ''}
<hr class="sep">
<div class="c" style="font-size:7pt">Cotización sin validez tributaria</div>
<div class="c" style="font-size:7pt">${new Date().toLocaleDateString('es-EC')}</div>
</body>
</html>`
}

// Correo al cliente con el detalle de la proforma — mismo contenido que el
// ticket 80mm, con estilo de correo (reutiliza la función edge genérica
// enviar-reporte-interno, la misma que ya usa el correo de Cierre de Caja).
function construirHtmlCorreoProforma(prf: Proforma, emp: EmpresaTicket): string {
    const fecha = new Date(prf.created_at).toLocaleDateString('es-EC')
    const detalles = prf.detalles ?? []
    const fila = (label: string, val: string, bold = false) =>
        `<tr><td style="padding:4px 0;color:#374151${bold ? ';font-weight:700' : ''}">${label}</td><td style="padding:4px 0;text-align:right${bold ? ';font-weight:700' : ''}">${val}</td></tr>`
    const filasItems = detalles.map(d => `
        <tr>
          <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;text-align:center;font-size:12px">${n2(d.cantidad)}</td>
          <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;font-size:13px">${esc(d.nombre_producto)}${d.descuento > 0 ? ` <span style="color:#9ca3af;font-size:11px">(-${d.descuento}%)</span>` : ''}</td>
          <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:12px;white-space:nowrap">$${n2(d.precio_unitario)}</td>
          <td style="padding:6px 4px;border-bottom:1px solid #f3f4f6;text-align:right;font-size:12px;font-weight:700;white-space:nowrap">$${n2(d.subtotal)}</td>
        </tr>`).join('')
    const logoHtml = emp.logo_url
        ? `<img src="${esc(emp.logo_url)}" alt="" style="max-height:55px;max-width:180px;display:block;margin:0 auto;">`
        : `<span style="color:#fff;font-weight:800;font-size:18px;">${esc(emp.nombre)}</span>`

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f5;padding:24px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.14);">
<tr><td style="background:linear-gradient(135deg,#7c3aed 0%,#6d28d9 100%);padding:24px 28px;text-align:center">
  ${logoHtml}
</td></tr>
<tr><td style="padding:20px 28px 8px;text-align:center">
  <p style="margin:0;color:#111827;font-size:17px;font-weight:700;">Proforma de Venta</p>
  <p style="margin:4px 0 0;color:#6b7280;font-size:13px;">${esc(prf.numero)} · ${fecha}</p>
</td></tr>
<tr><td style="padding:8px 28px;color:#374151;font-size:13px;">
  <b>Cliente:</b> ${esc(prf.cliente?.nombre)}<br>
  <b>RUC/CI:</b> ${esc(prf.cliente?.identificacion)}
</td></tr>
<tr><td style="padding:12px 28px;">
  <table width="100%" style="border-collapse:collapse;">
    <tr>
      <th style="text-align:center;font-size:11px;color:#9ca3af;border-bottom:1px solid #e5e7eb;padding-bottom:4px;">Cant</th>
      <th style="text-align:left;font-size:11px;color:#9ca3af;border-bottom:1px solid #e5e7eb;padding-bottom:4px;">Descripción</th>
      <th style="text-align:right;font-size:11px;color:#9ca3af;border-bottom:1px solid #e5e7eb;padding-bottom:4px;">Unit.</th>
      <th style="text-align:right;font-size:11px;color:#9ca3af;border-bottom:1px solid #e5e7eb;padding-bottom:4px;">Total</th>
    </tr>
    ${filasItems || '<tr><td colspan="4" style="color:#9ca3af;font-size:12px;padding:8px 4px">Sin ítems</td></tr>'}
  </table>
</td></tr>
<tr><td style="padding:16px 28px;background:#f8faff;border-top:2px solid #ede9fe;">
  <table width="100%" style="border-collapse:collapse;font-size:13px;">
    ${fila('Subtotal 0%', `$${n2(prf.base_iva_0)}`)}
    ${fila('Subtotal 15%', `$${n2(prf.base_iva_15)}`)}
    ${prf.descuento_total > 0 ? fila('Descuentos', `-$${n2(prf.descuento_total)}`) : ''}
    ${fila('IVA (15%)', `$${n2(prf.valor_iva)}`)}
    ${fila('TOTAL', `$${n2(prf.total)}`, true)}
  </table>
</td></tr>
${prf.observaciones ? `<tr><td style="padding:8px 28px;color:#6b7280;font-size:12px;">Obs: ${esc(prf.observaciones)}</td></tr>` : ''}
<tr><td style="background:#f8faff;padding:14px 28px;text-align:center;">
  <p style="margin:0;color:#9ca3af;font-size:11px;font-style:italic;">Cotización sin validez tributaria</p>
</td></tr>
<tr><td style="background:#4c1d95;padding:16px 28px;text-align:center;">
  <p style="margin:0 0 4px;color:rgba(255,255,255,0.9);font-size:12px;font-weight:600;">${esc(emp.nombre)} · RUC: ${esc(emp.ruc)}</p>
  <p style="margin:0;color:rgba(255,255,255,0.55);font-size:10px;">QuickInvoice · www.billenniumsystem.com</p>
</td></tr>
</table>
</td></tr>
</table>
</body></html>`
}

// ─── Constantes ──────────────────────────────────────────────────────────────

const DETALLE_VACIO: DetalleFacturaDirecta = {
    producto_id: null,
    nombre_producto: '',
    cantidad: 1,
    precio_unitario: 0,
    descuento: 0,
    iva_porcentaje: 15,
    subproducto_id: null,
    factor_conversion: 1,
}

const METODOS_PAGO: { value: PagoFactura['metodo']; label: string }[] = [
    { value: 'efectivo',     label: '💵 Efectivo' },
    { value: 'tarjeta',      label: '💳 Tarjeta D/C' },
    { value: 'transferencia',label: '🏦 Transferencia' },
    { value: 'credito',      label: '📄 Crédito' },
    { value: 'cheque',       label: '✏️ Cheque al día' },
    { value: 'cheque_fecha', label: '📅 Cheque a fecha' },
    { value: 'otros',        label: '🔄 Otros' },
]

const ESTADO_BADGE: Record<EstadoProforma, string> = {
    vigente:    'bg-emerald-50 text-emerald-700 border border-emerald-200',
    convertida: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
    anulada:    'bg-red-50 text-red-600 border border-red-200',
}

const ESTADO_LABEL: Record<EstadoProforma, string> = {
    vigente:    'Vigente',
    convertida: 'Convertida',
    anulada:    'Anulada',
}

// ─── Componente principal ────────────────────────────────────────────────────

export function ProformaPage() {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const prepId = searchParams.get('prep_id')
    const { empresa, cajaSesion, permisos } = useAuth()

    // Vista: 'lista' | 'form'
    const [vista, setVista] = useState<'lista' | 'form'>('lista')

    // ── Datos maestros ────────────────────────────────────────────────────────
    const [clientes, setClientes]       = useState<any[]>([])
    const [_productos, _setProductos]   = useState<any[]>([])
    const [vendedores, setVendedores]   = useState<Vendedor[]>([])
    const [cuentasBancarias, setCuentasBancarias] = useState<CuentaBancaria[]>([])

    // ── Lista de proformas ────────────────────────────────────────────────────
    const [proformas, setProformas]     = useState<Proforma[]>([])
    const [loadingLista, setLoadingLista] = useState(false)
    const [filtroTexto, setFiltroTexto] = useState('')
    const [filtroDesde, setFiltroDesde] = useState('')
    const [filtroHasta, setFiltroHasta] = useState('')
    const [filtroEstado, setFiltroEstado] = useState<EstadoProforma | ''>('')

    // ── Formulario ────────────────────────────────────────────────────────────
    const [proformaEditando, setProformaEditando] = useState<Proforma | null>(null) // null = nueva
    const [searchCliente,    setSearchCliente]    = useState('')
    const [selectedCliente,  setSelectedCliente]  = useState<any>(null)
    const [clienteResults,   setClienteResults]   = useState<any[]>([])
    const [clienteOpen,      setClienteOpen]      = useState(false)
    const [isClientFormOpen, setIsClientFormOpen] = useState(false)
    const [newClient, setNewClient] = useState({ identificacion: '', nombre: '', email: '', direccion: '', telefono: '' })
    const [isSavingClient, setIsSavingClient]     = useState(false)
    const [selectedVendedorId, setSelectedVendedorId] = useState('')
    const [detalles, setDetalles]                 = useState<DetalleFacturaDirecta[]>([{ ...DETALLE_VACIO }])
    const [observaciones, setObservaciones]       = useState('')
    const [esModoServicio, setEsModoServicio]     = useState(false)
    const [clienteCollapsed, setClienteCollapsed] = useState(false)
    const [vendedorCollapsed, setVendedorCollapsed] = useState(false)
    const [searchProducto, setSearchProducto]     = useState<Record<number, string>>({})
    const [productDropdown, setProductDropdown]   = useState<number | null>(null)
    const [searchResults,  setSearchResults]      = useState<any[]>([])
    const [saving, setSaving]                     = useState(false)
    const [savedProforma, setSavedProforma]       = useState<Proforma | null>(null)

    // ── Modal impresión ───────────────────────────────────────────────────────
    const [printModal, setPrintModal] = useState<{ open: boolean; proforma: Proforma | null }>({ open: false, proforma: null })
    const [printLoading, setPrintLoading] = useState(false)
    const [enviandoCorreoProforma, setEnviandoCorreoProforma] = useState(false)
    // Dirección/email/ciudad de la empresa — no vienen en el contexto de auth
    // (solo trae nombre/ruc/logo), se cargan aparte solo para el encabezado
    // del ticket 80mm y el correo.
    const [empresaExtra, setEmpresaExtra] = useState<{ direccion?: string | null; email?: string | null; ciudad?: string | null }>({})

    // ── Modal conversión a factura ────────────────────────────────────────────
    const [convertModal, setConvertModal] = useState<{ open: boolean; proforma: Proforma | null }>({ open: false, proforma: null })
    const [pagos,         setPagos]         = useState<PagoFactura[]>([{ metodo: 'efectivo', valor: 0 }])
    const [montoRecibido, setMontoRecibido] = useState(0)
    const [diasPlazoCredito, setDiasPlazoCredito] = useState(30)
    const [converting, setConverting]       = useState(false)
    const [facturaGenerada, setFacturaGenerada] = useState<{ numero: string; id: string } | null>(null)

    // ── Draft — evita perder la digitación al salir a otra área del ERP ────────
    const clearDraft = useFormDraft(
        'draft_proforma',
        () => ({ proformaEditando, selectedCliente, selectedVendedorId, detalles, observaciones, esModoServicio }),
        (d) => {
            const tieneContenido = !!d.selectedCliente || (d.detalles ?? []).some(x => x.nombre_producto)
            if (!tieneContenido) return
            if (d.proformaEditando)   setProformaEditando(d.proformaEditando)
            if (d.selectedCliente)    setSelectedCliente(d.selectedCliente)
            if (d.selectedVendedorId) setSelectedVendedorId(d.selectedVendedorId)
            if (d.detalles?.length)   setDetalles(d.detalles)
            if (d.observaciones)      setObservaciones(d.observaciones)
            if (d.esModoServicio)     setEsModoServicio(d.esModoServicio)
            setVista('form')
        },
        [proformaEditando, selectedCliente, selectedVendedorId, detalles, observaciones, esModoServicio],
    )

    // ─── Carga inicial ────────────────────────────────────────────────────────

    useEffect(() => {
        if (empresa?.id) {
            loadDatos()
            buscarProformas()
        }
    }, [empresa?.id])

    // Pre-carga desde preparación de pintura — carga TODOS los preps acumulados
    const PREP_IDS_KEY = `qi_prep_ids_prf_${empresa?.id ?? ''}`
    useEffect(() => {
        if (!prepId || !empresa?.id) return
        ;(async () => {
            try {
                const { supabase } = await import('../lib/supabase')

                // Acumular el nuevo prep_id
                const stored: string[] = JSON.parse(sessionStorage.getItem(PREP_IDS_KEY) || '[]')
                const allIds = stored.includes(prepId) ? stored : [...stored, prepId]
                sessionStorage.setItem(PREP_IDS_KEY, JSON.stringify(allIds))

                // Cargar TODOS los preps acumulados
                const prepDetalles: DetalleFacturaDirecta[] = []
                for (const pid of allIds) {
                    const prep = await preparacionPinturaService.getCompleta(pid)
                    const { data: prod } = await supabase
                        .from('productos')
                        .select('id, nombre, iva_porcentaje')
                        .eq('empresa_id', empresa!.id)
                        .ilike('codigo', prep.codigo_producto)
                        .eq('activo', true)
                        .maybeSingle()
                    prepDetalles.push({
                        producto_id:       prod?.id ?? null,
                        nombre_producto:   prep.descripcion,
                        cantidad:          1,
                        precio_unitario:   prep.precio_sin_iva ?? 0,
                        descuento:         0,
                        iva_porcentaje:    prep.iva_porcentaje,
                        subproducto_id:    null,
                        factor_conversion: 1,
                    })
                }

                // Reemplazar líneas: poner todos los preps, conservar líneas manuales
                setDetalles(prev => {
                    const prepNombres = new Set(prepDetalles.map(d => d.nombre_producto))
                    const manuales = prev.filter(d =>
                        (d.producto_id || d.nombre_producto.trim()) &&
                        !prepNombres.has(d.nombre_producto)
                    )
                    return [...prepDetalles, ...manuales]
                })
                setVista('form')
            } catch (e) {
                console.error('Error cargando preparación en proforma:', e)
            }
        })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prepId, empresa?.id])

    async function loadDatos() {
        // Solo carga datos livianos: vendedores y cuentas bancarias.
        // Clientes y productos se buscan bajo demanda con BuscadorProducto/buscarClientes.
        const [vends, cuentas] = await Promise.all([
            vendedorService.getVendedoresActivos(empresa!.id).catch(() => []),
            cuentasBancariasService.listar(empresa!.id).catch(() => []),
        ])
        setVendedores(vends)
        setCuentasBancarias(cuentas.filter((c: CuentaBancaria) => c.estado === 'activa'))
        if (vends.length === 1) setSelectedVendedorId(vends[0].id)
        // Garantizar que el Consumidor Final exista (lo crea si fue eliminado)
        try {
            const cf = await facturacionService.ensureConsumidorFinal(empresa!.id)
            if (cf) setSelectedCliente(cf)
        } catch { /* sin conexión, continuar sin CF */ }
        supabase.from('empresas').select('direccion, email, ciudad').eq('id', empresa!.id).single()
            .then(({ data }) => { if (data) setEmpresaExtra(data) })
    }

    // Búsqueda de clientes: solo al presionar Enter o botón Buscar
    async function buscarClientes() {
        if (!empresa?.id || selectedCliente || !searchCliente.trim()) return
        const q = '%' + searchCliente.trim().replace(/\*/g, '%') + '%'
        const { data } = await supabase
            .from('clientes').select('id, nombre, identificacion')
            .eq('empresa_id', empresa.id)
            .or(`nombre.ilike.${q},identificacion.ilike.${q}`)
            .order('nombre').limit(50)
        setClienteResults(data ?? [])
        setClienteOpen(true)
    }

    // Búsqueda de productos por línea: solo al presionar Enter o botón Buscar
    async function buscarProductoLinea(idx: number) {
        const texto = (searchProducto[idx] || '').trim()
        if (!empresa?.id || !texto) { setSearchResults([]); return }
        const q = '%' + texto.replace(/\*/g, '%') + '%'
        const { data } = await supabase
            .from('productos').select('*, subproductos(*)')
            .eq('empresa_id', empresa.id).eq('activo', true)
            .or(`nombre.ilike.${q},codigo.ilike.${q}`)
            .order('nombre').limit(50)
        setSearchResults(data ?? [])
        setProductDropdown(idx)
    }

    async function buscarProformas() {
        if (!empresa?.id) return
        setLoadingLista(true)
        try {
            const lista = await proformaService.listar(empresa.id, {
                clienteTexto: filtroTexto || undefined,
                desde:        filtroDesde || undefined,
                hasta:        filtroHasta || undefined,
                estado:       filtroEstado || undefined,
            })
            setProformas(lista)
        } catch (e: any) {
            alert('Error al cargar proformas: ' + e.message)
        } finally {
            setLoadingLista(false)
        }
    }

    // ─── Lista: acciones ──────────────────────────────────────────────────────

    async function handleAbrir(prf: Proforma) {
        const completa = await proformaService.getCompleta(prf.id)
        setProformaEditando(completa)

        // Cargar estado del formulario con los datos de la proforma
        const cli = clientes.find(c => c.id === completa.cliente_id) ?? { id: completa.cliente_id, nombre: completa.cliente?.nombre ?? '', identificacion: completa.cliente?.identificacion ?? '' }
        setSelectedCliente(cli)
        setSelectedVendedorId(completa.vendedor_id ?? '')
        setObservaciones(completa.observaciones ?? '')
        // Convertir detalles guardados al formato del formulario
        const dets: DetalleFacturaDirecta[] = (completa.detalles ?? []).map(d => ({
            producto_id:      d.producto_id ?? null,
            nombre_producto:  d.nombre_producto,
            cantidad:         d.cantidad,
            precio_unitario:  d.precio_unitario,
            descuento:        d.descuento,
            iva_porcentaje:   d.iva_porcentaje,
            subproducto_id:   null,
            factor_conversion: 1,
        }))
        setDetalles(dets.length > 0 ? dets : [{ ...DETALLE_VACIO }])
        setSearchProducto({})
        setSavedProforma(null)
        setClienteCollapsed(true)
        setVendedorCollapsed(true)
        setVista('form')
    }

    async function handleAnular(prf: Proforma) {
        if (!window.confirm(`¿Anular la proforma ${prf.numero}? Esta acción no se puede deshacer.`)) return
        try {
            await proformaService.anular(prf.id)
            await buscarProformas()
        } catch (e: any) {
            alert('Error al anular: ' + e.message)
        }
    }

    function handleIniciarConvertir(prf: Proforma) {
        // Pre-cargar detalles de la proforma
        const total = prf.total ?? 0
        setPagos([{ metodo: 'efectivo', valor: total }])
        setMontoRecibido(total)
        setDiasPlazoCredito(30)
        setFacturaGenerada(null)
        setConvertModal({ open: true, proforma: prf })
    }

    // ─── Formulario: detalles ─────────────────────────────────────────────────

    const addLinea    = () => setDetalles(prev => [...prev, { ...DETALLE_VACIO }])
    const removeLinea = (i: number) => setDetalles(prev => prev.filter((_, j) => j !== i))
    const updateLinea = (i: number, field: keyof DetalleFacturaDirecta, val: any) =>
        setDetalles(prev => prev.map((d, j) => j === i ? { ...d, [field]: val } : d))

    async function selectProducto(idx: number, prod: any) {
        let precioFinal = prod.precio_venta
        if (empresa?.id) {
            try {
                const pv = await precioVolumenService.resolverPrecio(empresa.id, prod.id, detalles[idx]?.cantidad || 1)
                if (pv !== null) precioFinal = pv
            } catch { /* sin rangos, usa precio_venta */ }
        }
        setDetalles(prev => prev.map((d, i) => i === idx ? {
            ...d,
            producto_id:     prod.id,
            nombre_producto: prod.nombre,
            precio_unitario: precioFinal,
            iva_porcentaje:  prod.iva_porcentaje ?? 15,
            subproducto_id:  null,
            factor_conversion: 1,
        } : d))
        setSearchProducto(prev => ({ ...prev, [idx]: prod.nombre }))
        setProductDropdown(null)
    }

    // ─── Formulario: guardar proforma ─────────────────────────────────────────

    async function handleGuardarProforma() {
        if (!selectedCliente) return alert('Seleccione un cliente')
        const validos = detalles.filter(d => d.nombre_producto && d.cantidad > 0 && d.precio_unitario > 0)
        if (validos.length === 0) return alert('Agregue al menos un ítem con cantidad y precio')

        try {
            setSaving(true)
            const saved = await proformaService.crear({
                empresa_id:   empresa!.id,
                cliente_id:   selectedCliente.id,
                detalles:     validos,
                vendedor_id:  selectedVendedorId || null,
                observaciones: observaciones || undefined,
            })
            setSavedProforma(saved)
            setProformaEditando(saved)
            clearDraft()
            await buscarProformas()
            // Vincular todos los preparados acumulados en esta proforma
            const prepIds: string[] = JSON.parse(sessionStorage.getItem(PREP_IDS_KEY) || '[]')
            sessionStorage.removeItem(PREP_IDS_KEY)
            for (const pid of prepIds) {
                preparacionPinturaService.vincularProforma(pid, saved.id).catch(console.error)
            }
        } catch (e: any) {
            alert('Error al guardar proforma: ' + e.message)
        } finally {
            setSaving(false)
        }
    }

    function handleNuevaProforma() {
        setProformaEditando(null)
        setSavedProforma(null)
        setSelectedCliente(null)
        setSearchCliente('')
        setSelectedVendedorId(vendedores.length === 1 ? vendedores[0].id : '')
        setDetalles([{ ...DETALLE_VACIO }])
        setObservaciones('')
        setSearchProducto({})
        setClienteCollapsed(false)
        setVendedorCollapsed(true)
        const cf = clientes.find(c => c.identificacion === '9999999999999')
        if (cf) setSelectedCliente(cf)
        setVista('form')
    }

    // ─── Modal conversión ─────────────────────────────────────────────────────

    const addPago    = () => setPagos(prev => [...prev, { metodo: 'efectivo', valor: 0 }])
    const removePago = (i: number) => setPagos(prev => prev.filter((_, j) => j !== i))
    const updatePago = (i: number, f: keyof PagoFactura, v: any) =>
        setPagos(prev => prev.map((p, j) => j === i ? { ...p, [f]: v } : p))

    async function handleConvertirAFactura() {
        const prf = convertModal.proforma
        if (!prf) return
        if (!cajaSesion) return alert('No hay caja abierta. Abra caja antes de facturar.')

        const prfCompleta = await proformaService.getCompleta(prf.id)
        const detallesValidos: DetalleFacturaDirecta[] = (prfCompleta.detalles ?? []).map(d => ({
            producto_id:      d.producto_id ?? null,
            nombre_producto:  d.nombre_producto,
            cantidad:         d.cantidad,
            precio_unitario:  d.precio_unitario,
            descuento:        d.descuento,
            iva_porcentaje:   d.iva_porcentaje,
            subproducto_id:   null,
            factor_conversion: 1,
        }))

        const totales     = calcularTotalesFactura(detallesValidos)
        const totalPagado = pagos.reduce((s, p) => s + (Number(p.valor) || 0), 0)
        if (totalPagado < totales.total - 0.01) {
            return alert(`El monto de pago (${formatCurrency(totalPagado)}) no cubre el total (${formatCurrency(totales.total)}).`)
        }

        try {
            setConverting(true)
            const factura = await facturaDirectaService.generarFacturaDirecta({
                empresa_id:          empresa!.id,
                cliente_id:          prf.cliente_id,
                detalles:            detallesValidos,
                pagos:               pagos.filter(p => p.valor > 0),
                caja_sesion_id:      cajaSesion.id,
                vendedor_id:         prf.vendedor_id ?? null,
                dias_plazo_credito:  diasPlazoCredito,
            })

            // Marcar referencia cruzada en ambas tablas
            await proformaService.marcarConvertida(prf.id, factura.id, factura.secuencial)

            setFacturaGenerada({ id: factura.id, numero: factura.secuencial })
            await buscarProformas()
        } catch (e: any) {
            alert('Error al generar factura: ' + e.message)
        } finally {
            setConverting(false)
        }
    }

    // ─── Impresión ───────────────────────────────────────────────────────────

    async function imprimirProforma(prf: Proforma, formato: 'a4' | '80mm') {
        if (!empresa) return
        setPrintLoading(true)
        try {
            const completa = (prf.detalles && prf.detalles.length > 0)
                ? prf
                : await proformaService.getCompleta(prf.id)
            const html = formato === 'a4'
                ? generarHtmlA4(completa, empresa)
                : generarHtml80mm(completa, { ...empresa, ...empresaExtra })
            const win = window.open('', '_blank', 'width=900,height=700')
            if (win) {
                win.document.write(html)
                win.document.close()
                win.focus()
                setTimeout(() => { win.print() }, 450)
            }
            setPrintModal({ open: false, proforma: null })
        } catch (e: any) {
            alert('Error al generar impresión: ' + e.message)
        } finally {
            setPrintLoading(false)
        }
    }

    // Envía la proforma al correo del cliente (si lo tiene registrado), vía
    // la misma función edge genérica que ya usa el correo de Cierre de Caja
    // General — reutiliza el SMTP configurado por empresa, sin firma SRI ni
    // adjuntos, porque una proforma no es un documento tributario.
    async function enviarProformaPorCorreo(prf: Proforma) {
        if (!empresa) return
        setEnviandoCorreoProforma(true)
        try {
            const completa = await proformaService.getCompleta(prf.id)
            if (!completa.cliente?.email) {
                alert('El cliente no tiene correo electrónico registrado.')
                return
            }
            const html = construirHtmlCorreoProforma(completa, { ...empresa, ...empresaExtra })
            const { error } = await supabase.functions.invoke('enviar-reporte-interno', {
                body: {
                    empresa_id: empresa.id,
                    destinatario: completa.cliente.email,
                    asunto: `Proforma ${completa.numero} — ${empresa.nombre}`,
                    html,
                },
            })
            if (error) throw new Error(await mensajeErrorFuncion(error, 'Error al enviar el correo'))
            alert(`✅ Proforma enviada a ${completa.cliente.email}`)
            setPrintModal({ open: false, proforma: null })
        } catch (e: any) {
            alert('Error al enviar: ' + e.message)
        } finally {
            setEnviandoCorreoProforma(false)
        }
    }

    // ─── Totales del formulario ───────────────────────────────────────────────

    const totalesForm    = calcularTotalesFactura(detalles)
    const totalPagoConv  = pagos.reduce((s, p) => s + (Number(p.valor) || 0), 0)
    const pendienteConv  = (convertModal.proforma?.total ?? 0) - totalPagoConv
    const tieneEfectivo  = pagos.some(p => p.metodo === 'efectivo')
    const vuelto         = tieneEfectivo ? Math.max(0, montoRecibido - (convertModal.proforma?.total ?? 0)) : 0

    // filteredClientes reemplazado por clienteResults (server-side)

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-6">

            {/* ── Header con selector Factura / Proforma ── */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <FileText className="w-7 h-7 text-violet-600" />
                        Proformas
                    </h1>
                    <p className="text-slate-500 text-sm">Cotizaciones y presupuestos para clientes</p>
                </div>
                <div className="flex items-center gap-2 self-start">
                    <HelpButton pageKey="proformas" />
                </div>

                {/* Toggle Factura / Proforma */}
                <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit self-start md:self-auto">
                    <Link
                        to="/nueva-factura"
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-slate-500 hover:text-slate-700 hover:bg-white/60 transition-colors"
                    >
                        <FilePlus className="w-4 h-4" />
                        Factura
                    </Link>
                    <button
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-white shadow text-violet-700 cursor-default"
                    >
                        <FileText className="w-4 h-4" />
                        Proforma
                    </button>
                </div>
            </div>

            {/* ══════════════════════════════════════════════════════════ */}
            {/* VISTA: LISTA DE PROFORMAS                                 */}
            {/* ══════════════════════════════════════════════════════════ */}
            {vista === 'lista' && (
                <div className="space-y-4">

                    {/* Filtros de búsqueda */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                            <div className="md:col-span-2 relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar por cliente, identificación o N.º proforma…"
                                    className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-violet-400"
                                    value={filtroTexto}
                                    onChange={e => setFiltroTexto(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && buscarProformas()}
                                />
                            </div>
                            <input type="date" className="input text-sm" value={filtroDesde}
                                onChange={e => setFiltroDesde(e.target.value)}
                                title="Desde" />
                            <input type="date" className="input text-sm" value={filtroHasta}
                                onChange={e => setFiltroHasta(e.target.value)}
                                title="Hasta" />
                        </div>
                        <div className="flex flex-wrap gap-2 mt-3">
                            {(['', 'vigente', 'convertida', 'anulada'] as const).map(est => (
                                <button
                                    key={est}
                                    onClick={() => setFiltroEstado(est as any)}
                                    className={cn(
                                        'px-3 py-1 rounded-full text-xs font-semibold border transition-colors',
                                        filtroEstado === est
                                            ? 'bg-violet-600 text-white border-violet-600'
                                            : 'bg-white text-slate-600 border-slate-200 hover:border-violet-400'
                                    )}
                                >
                                    {est === '' ? 'Todos' : ESTADO_LABEL[est as EstadoProforma]}
                                </button>
                            ))}
                            <button onClick={buscarProformas}
                                disabled={loadingLista}
                                className="ml-auto flex items-center gap-1 px-3 py-1 bg-violet-600 text-white rounded-lg text-xs font-bold disabled:opacity-60">
                                {loadingLista
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <RefreshCw className="w-3.5 h-3.5" />}
                                Buscar
                            </button>
                            <button onClick={handleNuevaProforma}
                                className="flex items-center gap-1 px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold">
                                <Plus className="w-3.5 h-3.5" /> Nueva Proforma
                            </button>
                        </div>
                    </div>

                    {/* Tabla de proformas */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        {proformas.length === 0 ? (
                            <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
                                <FileText className="w-12 h-12 opacity-30" />
                                <p className="text-sm">No hay proformas. Cree una nueva.</p>
                                <button onClick={handleNuevaProforma}
                                    className="mt-2 px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-bold flex items-center gap-2">
                                    <Plus className="w-4 h-4" /> Nueva Proforma
                                </button>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 border-b border-slate-100">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">N.º Proforma</th>
                                            <th className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase">Cliente</th>
                                            <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase">Fecha</th>
                                            <th className="px-4 py-3 text-right text-xs font-bold text-slate-500 uppercase">Total</th>
                                            <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase">Estado</th>
                                            <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase">Factura</th>
                                            <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {proformas.map((prf, i) => (
                                            <tr key={prf.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                                                <td className="px-4 py-3 font-mono font-bold text-violet-700 text-xs">
                                                    {prf.numero}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <p className="font-semibold text-slate-900 text-sm">{prf.cliente?.nombre ?? '—'}</p>
                                                    <p className="text-xs text-slate-400">{prf.cliente?.identificacion}</p>
                                                </td>
                                                <td className="px-4 py-3 text-center text-xs text-slate-500">
                                                    {prf.created_at ? new Date(prf.created_at).toLocaleDateString('es-EC') : '—'}
                                                </td>
                                                <td className="px-4 py-3 text-right font-bold text-slate-900">
                                                    {formatCurrency(prf.total)}
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold', ESTADO_BADGE[prf.estado])}>
                                                        {ESTADO_LABEL[prf.estado]}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-center text-xs">
                                                    {prf.factura_numero
                                                        ? <span className="font-mono text-indigo-700">{prf.factura_numero}</span>
                                                        : <span className="text-slate-300">—</span>}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center justify-center gap-1.5">
                                                        {/* Abrir/editar */}
                                                        <button
                                                            onClick={() => handleAbrir(prf)}
                                                            title="Abrir proforma"
                                                            className="p-1.5 rounded-lg text-slate-400 hover:text-violet-700 hover:bg-violet-50 transition-colors">
                                                            <Eye className="w-4 h-4" />
                                                        </button>
                                                        {/* Imprimir */}
                                                        <button
                                                            onClick={() => setPrintModal({ open: true, proforma: prf })}
                                                            title="Imprimir proforma"
                                                            className="p-1.5 rounded-lg text-slate-400 hover:text-violet-700 hover:bg-violet-50 transition-colors">
                                                            <Printer className="w-4 h-4" />
                                                        </button>
                                                        {/* Convertir a factura */}
                                                        {prf.estado === 'vigente' && (
                                                            <button
                                                                onClick={() => handleIniciarConvertir(prf)}
                                                                title="Convertir a Factura"
                                                                className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors">
                                                                <FileCheck className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        {/* Anular */}
                                                        {prf.estado === 'vigente' && (
                                                            <button
                                                                onClick={() => handleAnular(prf)}
                                                                title="Anular"
                                                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                                                                <Ban className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════ */}
            {/* VISTA: FORMULARIO DE PROFORMA                             */}
            {/* ══════════════════════════════════════════════════════════ */}
            {vista === 'form' && (
                <div className="space-y-4">

                    {/* Barra superior del formulario */}
                    <div className="flex items-center justify-between gap-4 bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                        <button
                            onClick={() => { setVista('lista'); setSavedProforma(null) }}
                            className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors">
                            <ArrowLeft className="w-4 h-4" /> Volver a lista
                        </button>

                        <div className="flex items-center gap-3">
                            {proformaEditando && (
                                <span className="font-mono text-xs font-bold text-violet-700 bg-violet-50 px-3 py-1.5 rounded-full border border-violet-200">
                                    {proformaEditando.numero}
                                </span>
                            )}
                            {proformaEditando && (
                                <span className={cn('text-xs px-2 py-1 rounded-full font-semibold', ESTADO_BADGE[proformaEditando.estado])}>
                                    {ESTADO_LABEL[proformaEditando.estado]}
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            {/* Imprimir (solo si ya existe una proforma guardada) */}
                            {proformaEditando && (
                                <button
                                    onClick={() => setPrintModal({ open: true, proforma: proformaEditando })}
                                    className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold transition-colors">
                                    <Printer className="w-4 h-4" />
                                    Imprimir
                                </button>
                            )}
                            {/* Convertir a Factura (solo si la proforma ya fue guardada y está vigente) */}
                            {proformaEditando?.estado === 'vigente' && (
                                <button
                                    onClick={() => handleIniciarConvertir(proformaEditando)}
                                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition-colors">
                                    <FileCheck className="w-4 h-4" />
                                    Convertir a Factura
                                </button>
                            )}
                            {/* Guardar proforma (solo si está vigente o es nueva) */}
                            {(!proformaEditando || proformaEditando.estado === 'vigente') && (
                                <button
                                    onClick={handleGuardarProforma}
                                    disabled={saving}
                                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold disabled:opacity-60 transition-colors">
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    {proformaEditando ? 'Actualizar Proforma' : 'Guardar Proforma'}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Proforma guardada exitosamente */}
                    {savedProforma && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 flex items-center gap-3">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                            <div>
                                <p className="font-bold text-emerald-800 text-sm">Proforma guardada correctamente</p>
                                <p className="text-xs text-emerald-600">N.º {savedProforma.numero} · Total: {formatCurrency(savedProforma.total)}</p>
                            </div>
                            <button onClick={() => { handleNuevaProforma() }} className="ml-auto text-xs font-bold text-emerald-700 hover:text-emerald-900">
                                Nueva proforma
                            </button>
                        </div>
                    )}

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                        {/* ── COLUMNA PRINCIPAL ── */}
                        <div className="xl:col-span-2 space-y-6">

                            {/* SECCIÓN CLIENTE */}
                            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
                                <div
                                    className="flex items-center justify-between px-5 py-3 cursor-pointer select-none hover:bg-slate-50 transition-colors"
                                    onClick={() => !isClientFormOpen && setClienteCollapsed(c => !c)}>
                                    <h2 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                                        <User className="w-4 h-4 text-violet-500" /> Cliente
                                        {clienteCollapsed && selectedCliente && (
                                            <span className="font-semibold text-slate-700 ml-1">
                                                — {selectedCliente.nombre}
                                                <span className="text-slate-400 font-normal ml-1">({selectedCliente.identificacion})</span>
                                            </span>
                                        )}
                                    </h2>
                                    <div className="flex items-center gap-3">
                                        {!clienteCollapsed && !isClientFormOpen && (
                                            <button onClick={e => { e.stopPropagation(); setIsClientFormOpen(true) }}
                                                className="text-violet-600 hover:text-violet-700 flex items-center gap-1 text-xs font-bold">
                                                <Plus className="w-3.5 h-3.5" /> Nuevo
                                            </button>
                                        )}
                                        {clienteCollapsed ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
                                    </div>
                                </div>
                                {!clienteCollapsed && (
                                    <div className="px-5 pb-5 space-y-3 border-t border-slate-50">
                                        {isClientFormOpen ? (
                                            <div className="bg-slate-50 rounded-xl border border-violet-100 p-4 space-y-3 mt-3">
                                                <input placeholder="Identificación / RUC / Cédula"
                                                    className="w-full px-4 py-2 rounded-lg border border-slate-200 text-sm"
                                                    value={newClient.identificacion}
                                                    onChange={e => setNewClient({ ...newClient, identificacion: e.target.value })} />
                                                <input placeholder="Nombre / Razón Social *"
                                                    className="w-full px-4 py-2 rounded-lg border border-slate-200 text-sm"
                                                    value={newClient.nombre}
                                                    onChange={e => setNewClient({ ...newClient, nombre: e.target.value })} />
                                                <div className="grid grid-cols-2 gap-3">
                                                    <input placeholder="Email"
                                                        className="px-4 py-2 rounded-lg border border-slate-200 text-sm"
                                                        value={newClient.email}
                                                        onChange={e => setNewClient({ ...newClient, email: e.target.value })} />
                                                    <input placeholder="Teléfono"
                                                        className="px-4 py-2 rounded-lg border border-slate-200 text-sm"
                                                        value={newClient.telefono}
                                                        onChange={e => setNewClient({ ...newClient, telefono: e.target.value })} />
                                                </div>
                                                <input placeholder="Dirección"
                                                    className="w-full px-4 py-2 rounded-lg border border-slate-200 text-sm"
                                                    value={newClient.direccion}
                                                    onChange={e => setNewClient({ ...newClient, direccion: e.target.value })} />
                                                <div className="flex gap-2 pt-1">
                                                    <button onClick={() => setIsClientFormOpen(false)}
                                                        className="flex-1 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold hover:bg-slate-50">
                                                        Cancelar
                                                    </button>
                                                    <button
                                                        disabled={isSavingClient}
                                                        onClick={async () => {
                                                            if (!newClient.identificacion || !newClient.nombre) return alert('Identificación y nombre son requeridos')
                                                            try {
                                                                setIsSavingClient(true)
                                                                const created = await facturacionService.createCliente({ ...newClient, empresa_id: empresa!.id })
                                                                const fresh   = await catalogCacheService.forceRefreshClientes(empresa!.id).catch(() => null)
                                                                setClientes(fresh ?? (prev => [...prev, created]))
                                                                setSelectedCliente(created)
                                                                setIsClientFormOpen(false)
                                                                setNewClient({ identificacion: '', nombre: '', email: '', direccion: '', telefono: '' })
                                                                setClienteCollapsed(true)
                                                            } catch { alert('Error al guardar cliente') }
                                                            finally { setIsSavingClient(false) }
                                                        }}
                                                        className="flex-1 py-2 bg-violet-600 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60">
                                                        {isSavingClient ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-2 mt-3 relative">
                                                <div className="relative">
                                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                                    <input type="text"
                                                        placeholder="Nombre o RUC — Enter o Buscar (use * como comodín)"
                                                        className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-violet-400 outline-none text-sm"
                                                        value={searchCliente}
                                                        onChange={e => { setSearchCliente(e.target.value); setClienteOpen(false) }}
                                                        onKeyDown={e => { if (e.key === 'Enter') buscarClientes() }} />
                                                </div>
                                                <button type="button" onClick={buscarClientes}
                                                    className="px-3 py-2 text-sm bg-violet-600 text-white rounded-xl hover:bg-violet-700">
                                                    Buscar
                                                </button>
                                                {clienteOpen && clienteResults.length > 0 && !selectedCliente && (
                                                    <div className="absolute z-20 w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-2xl max-h-64 overflow-y-auto">
                                                        {clienteResults.map(c => (
                                                            <button key={c.id}
                                                                className="w-full px-4 py-3 text-left hover:bg-slate-50 flex justify-between items-center border-b border-slate-50 last:border-0 text-sm"
                                                                onMouseDown={e => { e.preventDefault(); setSelectedCliente(c); setSearchCliente(c.nombre); setClienteOpen(false); setClienteCollapsed(true) }}>
                                                                <div>
                                                                    <p className="font-bold text-slate-900">{c.nombre}</p>
                                                                    <p className="text-xs text-slate-500">{c.identificacion}</p>
                                                                </div>
                                                                <User className="w-4 h-4 text-slate-300" />
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                                {selectedCliente && (
                                                    <div className="bg-violet-50 border border-violet-100 rounded-xl p-3">
                                                        <div className="flex items-start justify-between">
                                                            <div>
                                                                <p className="text-[10px] font-bold text-violet-600 uppercase tracking-widest">Seleccionado</p>
                                                                <p className="font-black text-violet-900 text-sm">{selectedCliente.nombre}</p>
                                                                <p className="text-xs text-violet-600">{selectedCliente.identificacion}</p>
                                                            </div>
                                                            <button onClick={() => setSelectedCliente(null)} className="text-violet-400 hover:text-violet-700">
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* SECCIÓN VENDEDOR */}
                            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                                <div
                                    className="flex items-center justify-between px-5 py-3 cursor-pointer select-none hover:bg-slate-50 transition-colors"
                                    onClick={() => setVendedorCollapsed(c => !c)}>
                                    <h2 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                                        <Briefcase className="w-4 h-4 text-violet-500" /> Vendedor
                                        {vendedorCollapsed && selectedVendedorId && (
                                            <span className="font-semibold text-slate-700 ml-1">
                                                — {vendedores.find(v => v.id === selectedVendedorId)?.nombre || ''}
                                            </span>
                                        )}
                                    </h2>
                                    {vendedorCollapsed ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
                                </div>
                                {!vendedorCollapsed && (
                                    <div className="px-5 pb-4 pt-3 border-t border-slate-50">
                                        <select
                                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-violet-400 bg-white"
                                            value={selectedVendedorId}
                                            onChange={e => { setSelectedVendedorId(e.target.value); if (e.target.value) setVendedorCollapsed(true) }}>
                                            <option value="">— Sin vendedor asignado —</option>
                                            {vendedores.map(v => (
                                                <option key={v.id} value={v.id}>{v.nombre}{v.iniciales ? ` (${v.iniciales})` : ''}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>

                            {/* SECCIÓN DETALLE */}
                            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
                                <div className="flex items-center justify-between flex-wrap gap-3">
                                    <h2 className="font-bold text-slate-900 flex items-center gap-2">
                                        <Package className="w-5 h-5 text-violet-500" />
                                        {esModoServicio ? 'Detalle de Servicios' : 'Detalle de Artículos / Servicios'}
                                    </h2>
                                    <div className="flex items-center gap-4">
                                        <label className="flex items-center gap-2 cursor-pointer select-none">
                                            <div
                                                onClick={() => {
                                                    if (!esModoServicio && detalles.some(d => d.producto_id)) {
                                                        if (!window.confirm('Al cambiar a modo Servicios se limpiarán las líneas. ¿Continuar?')) return
                                                    }
                                                    setEsModoServicio(prev => !prev)
                                                    setDetalles([{ ...DETALLE_VACIO, producto_id: null }])
                                                    setSearchProducto({})
                                                }}
                                                className={cn(
                                                    'relative w-10 h-5 rounded-full transition-colors duration-200 cursor-pointer',
                                                    esModoServicio ? 'bg-violet-600' : 'bg-slate-300'
                                                )}>
                                                <span className={cn(
                                                    'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200',
                                                    esModoServicio ? 'left-5' : 'left-0.5'
                                                )} />
                                            </div>
                                            <span className="text-sm font-medium text-slate-600">Modo Servicios</span>
                                        </label>
                                        <button onClick={addLinea}
                                            className="text-violet-600 hover:text-violet-700 flex items-center gap-1 text-sm font-bold">
                                            <Plus className="w-4 h-4" /> Agregar línea
                                        </button>
                                        {permisos.perm_preparaciones_pintura && (
                                            <button onClick={() => navigate('/preparaciones-pintura/nueva?origen=proforma')}
                                                className="text-amber-600 hover:text-amber-700 p-1.5 -m-1.5 rounded-lg hover:bg-amber-50 transition-colors"
                                                title="Preparar Pintura">
                                                <PaintBucket className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Encabezados */}
                                <div className="hidden md:grid grid-cols-12 gap-2 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    <div className={esModoServicio ? 'col-span-5' : 'col-span-2'}>Descripción</div>
                                    {!esModoServicio && <div className="col-span-2 text-center">Cantidad</div>}
                                    {esModoServicio && <div className="col-span-1 text-center">Cant.</div>}
                                    <div className="col-span-2 text-right">P. Unitario</div>
                                    <div className="col-span-2 text-right">Dto%</div>
                                    <div className="col-span-1 text-center">IVA%</div>
                                    <div className="col-span-1 text-right">Subtotal</div>
                                    <div className="col-span-1 text-right">Total</div>
                                    <div className="col-span-1" />
                                </div>

                                {/* Líneas */}
                                <div className="space-y-2">
                                    {detalles.map((det, idx) => {
                                        const lin  = calcularLinea(det)
                                        // Productos: server-side ILIKE, resultados en searchResults
                                        const prods = esModoServicio ? [] : (productDropdown === idx ? searchResults : [])

                                        return (
                                            <div key={idx} className="grid grid-cols-12 gap-2 items-start bg-slate-50/50 rounded-xl p-2 border border-slate-100">
                                                {/* Descripción */}
                                                <div className={cn('relative', esModoServicio ? 'col-span-5' : 'col-span-2')}>
                                                    <input
                                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-violet-400"
                                                        placeholder={esModoServicio ? 'Descripción del servicio' : 'Código/nombre + Enter o Buscar (usa *)'}
                                                        value={esModoServicio ? det.nombre_producto : (searchProducto[idx] ?? det.nombre_producto)}
                                                        onChange={e => {
                                                            if (esModoServicio) {
                                                                updateLinea(idx, 'nombre_producto', e.target.value)
                                                            } else {
                                                                setSearchProducto(prev => ({ ...prev, [idx]: e.target.value }))
                                                                setSearchResults([])
                                                            }
                                                        }}
                                                        onKeyDown={e => { if (e.key === 'Enter' && !esModoServicio) { e.preventDefault(); buscarProductoLinea(idx) } }}
                                                        onBlur={() => setTimeout(() => setProductDropdown(null), 200)}
                                                    />
                                                    {/* Dropdown productos */}
                                                    {!esModoServicio && productDropdown === idx && prods.length > 0 && (
                                                        <div className="absolute z-30 left-0 top-full mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                                                            {prods.map(prod => (
                                                                <button
                                                                    key={prod.id}
                                                                    className="w-full px-3 py-2.5 text-left hover:bg-violet-50 text-sm flex items-center justify-between border-b border-slate-50 last:border-0"
                                                                    onMouseDown={() => selectProducto(idx, prod)}>
                                                                    <div>
                                                                        <p className="font-semibold text-slate-800">{prod.nombre}</p>
                                                                        <p className="text-[10px] text-slate-400">{prod.codigo} · IVA {prod.iva_porcentaje}%</p>
                                                                    </div>
                                                                    <span className="text-xs font-bold text-violet-700 shrink-0 ml-2">{formatCurrency(prod.precio_venta)}</span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Cantidad */}
                                                <div className={esModoServicio ? 'col-span-1' : 'col-span-2'}>
                                                    <input type="number" min="0.01" step="0.01"
                                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-center outline-none focus:ring-2 focus:ring-violet-400"
                                                        value={det.cantidad}
                                                        onChange={e => updateLinea(idx, 'cantidad', parseFloat(e.target.value) || 0)} />
                                                </div>

                                                {/* Precio unitario */}
                                                <div className="col-span-2">
                                                    <input type="number" min="0" step="0.01"
                                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-right outline-none focus:ring-2 focus:ring-violet-400"
                                                        value={det.precio_unitario}
                                                        onChange={e => updateLinea(idx, 'precio_unitario', parseFloat(e.target.value) || 0)} />
                                                </div>

                                                {/* Descuento % */}
                                                <div className="col-span-2">
                                                    <input type="number" min="0" max="100" step="0.01"
                                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-right outline-none focus:ring-2 focus:ring-violet-400"
                                                        value={det.descuento}
                                                        onChange={e => updateLinea(idx, 'descuento', parseFloat(e.target.value) || 0)} />
                                                </div>

                                                {/* IVA % */}
                                                <div className="col-span-1">
                                                    <select
                                                        className="w-full px-2 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-violet-400 bg-white"
                                                        value={det.iva_porcentaje}
                                                        onChange={e => updateLinea(idx, 'iva_porcentaje', parseFloat(e.target.value))}>
                                                        <option value={0}>0%</option>
                                                        <option value={5}>5%</option>
                                                        <option value={15}>15%</option>
                                                    </select>
                                                </div>

                                                {/* Subtotal (sin IVA) */}
                                                <div className="col-span-1 flex items-center justify-end">
                                                    <span className="text-sm font-semibold text-slate-700">
                                                        {formatCurrency(lin.subtotal_neto)}
                                                    </span>
                                                </div>

                                                {/* Total (con IVA) */}
                                                <div className="col-span-1 flex items-center justify-end">
                                                    <span className="text-sm font-bold text-slate-900">
                                                        {formatCurrency(lin.total)}
                                                    </span>
                                                </div>

                                                {/* Eliminar */}
                                                <div className="col-span-1 flex items-center justify-center">
                                                    <button onClick={() => removeLinea(idx)}
                                                        disabled={detalles.length === 1}
                                                        className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-20 transition-colors">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>

                                <button onClick={addLinea}
                                    className="w-full mt-2 py-2.5 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:border-violet-300 hover:text-violet-500 text-sm font-bold flex items-center justify-center gap-2 transition-colors">
                                    <Plus className="w-4 h-4" />
                                    Agregar línea
                                </button>
                            </div>

                            {/* Observaciones */}
                            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                                <label className="text-sm font-bold text-slate-700 mb-2 block">Observaciones</label>
                                <textarea
                                    rows={3}
                                    placeholder="Notas adicionales para el cliente, condiciones, validez de la proforma…"
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-violet-400 resize-none"
                                    value={observaciones}
                                    onChange={e => setObservaciones(e.target.value)} />
                            </div>
                        </div>

                        {/* ── COLUMNA LATERAL: TOTALES ── */}
                        <div className="space-y-4">
                            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3 sticky top-4">
                                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-widest">Resumen</h3>
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">Subtotal</span>
                                        <span className="font-semibold">{formatCurrency(totalesForm.subtotal)}</span>
                                    </div>
                                    {totalesForm.descuentos > 0 && (
                                        <div className="flex justify-between text-sm text-amber-600">
                                            <span>Descuentos</span>
                                            <span className="font-semibold">−{formatCurrency(totalesForm.descuentos)}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500">IVA</span>
                                        <span className="font-semibold">{formatCurrency(totalesForm.iva)}</span>
                                    </div>
                                    <div className="border-t border-slate-100 pt-2 flex justify-between">
                                        <span className="font-bold text-slate-900">TOTAL</span>
                                        <span className="font-black text-xl text-violet-700">{formatCurrency(totalesForm.total)}</span>
                                    </div>
                                </div>

                                <div className="pt-2 space-y-2">
                                    {(!proformaEditando || proformaEditando.estado === 'vigente') && (
                                        <button
                                            onClick={handleGuardarProforma}
                                            disabled={saving}
                                            className="w-full flex items-center justify-center gap-2 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold text-sm disabled:opacity-60 transition-colors">
                                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                            {proformaEditando ? 'Actualizar Proforma' : 'Guardar Proforma'}
                                        </button>
                                    )}
                                    {proformaEditando?.estado === 'vigente' && (
                                        <button
                                            onClick={() => handleIniciarConvertir(proformaEditando)}
                                            className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-colors">
                                            <FileCheck className="w-4 h-4" />
                                            Convertir a Factura
                                        </button>
                                    )}
                                    {proformaEditando?.estado === 'convertida' && (
                                        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-center">
                                            <p className="text-xs font-bold text-indigo-700">Convertida a factura</p>
                                            <p className="text-xs text-indigo-600 font-mono">{proformaEditando.factura_numero}</p>
                                        </div>
                                    )}
                                    <button
                                        onClick={() => {
                                            if (!confirm('¿Salir sin guardar los cambios de esta proforma?')) return
                                            clearDraft()
                                            setVista('lista')
                                            setSavedProforma(null)
                                        }}
                                        className="w-full flex items-center justify-center gap-2 py-2.5 border border-red-200 text-red-600 hover:bg-red-50 rounded-xl font-bold text-sm transition-colors">
                                        <ArrowLeft className="w-4 h-4" />
                                        Salir sin Grabar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════ */}
            {/* MODAL: SELECCIÓN DE FORMATO DE IMPRESIÓN                  */}
            {/* ══════════════════════════════════════════════════════════ */}
            {printModal.open && printModal.proforma && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
                        <div className="flex items-center justify-between p-5 border-b border-slate-100">
                            <h3 className="font-bold text-slate-900 flex items-center gap-2">
                                <Printer className="w-5 h-5 text-violet-600" />
                                Imprimir Proforma
                            </h3>
                            {!printLoading && (
                                <button onClick={() => setPrintModal({ open: false, proforma: null })}
                                    className="text-slate-400 hover:text-slate-600">
                                    <X className="w-5 h-5" />
                                </button>
                            )}
                        </div>
                        <div className="p-5 space-y-3">
                            <p className="text-sm text-slate-500">
                                Formato de impresión para{' '}
                                <span className="font-bold font-mono text-violet-700">{printModal.proforma.numero}</span>
                            </p>

                            {/* Opción A4 */}
                            <button
                                onClick={() => imprimirProforma(printModal.proforma!, 'a4')}
                                disabled={printLoading}
                                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-violet-200 hover:border-violet-500 hover:bg-violet-50 transition-all group disabled:opacity-60 text-left">
                                <div className="w-11 h-14 bg-violet-100 group-hover:bg-violet-200 rounded-lg flex flex-col items-center justify-center shrink-0 transition-colors gap-0.5">
                                    <FileText className="w-5 h-6 text-violet-600" />
                                    <span className="text-[9px] font-black text-violet-600">A4</span>
                                </div>
                                <div>
                                    <div className="font-bold text-slate-900 text-sm">Tamaño A4</div>
                                    <div className="text-xs text-slate-500 mt-0.5">Impresora láser / inyección de tinta</div>
                                    <div className="text-xs text-slate-400">Diseño profesional con logo y tabla completa</div>
                                </div>
                                {printLoading && <Loader2 className="w-4 h-4 animate-spin text-violet-500 ml-auto" />}
                            </button>

                            {/* Opción 80mm */}
                            <button
                                onClick={() => imprimirProforma(printModal.proforma!, '80mm')}
                                disabled={printLoading}
                                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-slate-200 hover:border-violet-400 hover:bg-violet-50 transition-all group disabled:opacity-60 text-left">
                                <div className="w-11 h-14 bg-slate-100 group-hover:bg-violet-100 rounded-lg flex flex-col items-center justify-center shrink-0 transition-colors gap-0.5">
                                    <Printer className="w-5 h-5 text-slate-500 group-hover:text-violet-600" />
                                    <span className="text-[9px] font-black text-slate-500 group-hover:text-violet-600">80mm</span>
                                </div>
                                <div>
                                    <div className="font-bold text-slate-900 text-sm">Ticket 80mm</div>
                                    <div className="text-xs text-slate-500 mt-0.5">Impresora térmica de recibos</div>
                                    <div className="text-xs text-slate-400">Formato compacto para papel de rollo</div>
                                </div>
                            </button>

                            {/* Opción enviar por correo */}
                            <button
                                onClick={() => enviarProformaPorCorreo(printModal.proforma!)}
                                disabled={printLoading || enviandoCorreoProforma}
                                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-slate-200 hover:border-violet-400 hover:bg-violet-50 transition-all group disabled:opacity-60 text-left">
                                <div className="w-11 h-14 bg-slate-100 group-hover:bg-violet-100 rounded-lg flex items-center justify-center shrink-0 transition-colors">
                                    {enviandoCorreoProforma
                                        ? <Loader2 className="w-5 h-5 text-violet-500 animate-spin" />
                                        : <Mail className="w-5 h-5 text-slate-500 group-hover:text-violet-600" />}
                                </div>
                                <div>
                                    <div className="font-bold text-slate-900 text-sm">Enviar por correo</div>
                                    <div className="text-xs text-slate-500 mt-0.5">Al correo del cliente, si está registrado</div>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════════ */}
            {/* MODAL: CONVERTIR A FACTURA                                */}
            {/* ══════════════════════════════════════════════════════════ */}
            {convertModal.open && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        {/* Header del modal */}
                        <div className="flex items-center justify-between p-5 border-b border-slate-100">
                            <div>
                                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                                    <FileCheck className="w-5 h-5 text-emerald-600" />
                                    Convertir a Factura
                                </h3>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    Proforma {convertModal.proforma?.numero}  · Total {formatCurrency(convertModal.proforma?.total ?? 0)}
                                </p>
                            </div>
                            {!facturaGenerada && (
                                <button onClick={() => setConvertModal({ open: false, proforma: null })}
                                    className="text-slate-400 hover:text-slate-600">
                                    <X className="w-5 h-5" />
                                </button>
                            )}
                        </div>

                        {facturaGenerada ? (
                            /* ── Éxito ── */
                            <div className="p-6 text-center space-y-4">
                                <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
                                <div>
                                    <p className="font-bold text-slate-900 text-lg">¡Factura generada!</p>
                                    <p className="text-sm text-slate-500 mt-1">
                                        N.º <span className="font-mono font-bold text-indigo-700">{facturaGenerada.numero}</span>
                                    </p>
                                    <p className="text-xs text-slate-400 mt-2">
                                        La proforma quedó marcada como "Convertida" con referencia a esta factura.
                                    </p>
                                </div>
                                <button
                                    onClick={() => { setConvertModal({ open: false, proforma: null }); setVista('lista') }}
                                    className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm">
                                    Cerrar y volver a lista
                                </button>
                            </div>
                        ) : (
                            /* ── Formulario de pago ── */
                            <div className="p-5 space-y-4">
                                {!cajaSesion && (
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-2 text-sm text-amber-700">
                                        <AlertCircle className="w-4 h-4 shrink-0" />
                                        No hay caja abierta. Abra caja antes de facturar.
                                    </div>
                                )}

                                {/* Pagos */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-bold text-slate-700">Forma de pago</h4>
                                        <button onClick={addPago}
                                            className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                                            <Plus className="w-3 h-3" /> Agregar
                                        </button>
                                    </div>
                                    {pagos.map((pago, i) => (
                                        <div key={i} className="space-y-1.5">
                                            <div className="flex gap-2 items-center">
                                                <select
                                                    className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                                                    value={pago.metodo}
                                                    onChange={e => updatePago(i, 'metodo', e.target.value as any)}>
                                                    {METODOS_PAGO.map(m => (
                                                        <option key={m.value} value={m.value}>{m.label}</option>
                                                    ))}
                                                </select>
                                                <input type="number" min="0" step="0.01"
                                                    className="w-28 px-3 py-2 rounded-lg border border-slate-200 text-sm text-right outline-none focus:ring-2 focus:ring-emerald-400"
                                                    value={pago.valor}
                                                    onChange={e => updatePago(i, 'valor', parseFloat(e.target.value) || 0)} />
                                                {pagos.length > 1 && (
                                                    <button onClick={() => removePago(i)}
                                                        className="text-slate-300 hover:text-red-500 transition-colors">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                            {/* Cuenta bancaria destino — solo transferencia */}
                                            {pago.metodo === 'transferencia' && (
                                                <select
                                                    className="w-full px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-xs outline-none focus:ring-2 focus:ring-blue-400 text-blue-900"
                                                    value={pago.cuenta_bancaria_id ?? ''}
                                                    onChange={e => {
                                                        const cb = cuentasBancarias.find(c => c.id === e.target.value)
                                                        const label = cb ? `${cb.banco?.nombre ?? ''} — ${cb.numero_cuenta}` : ''
                                                        updatePago(i, 'cuenta_bancaria_id', e.target.value || null)
                                                        updatePago(i, 'cuenta_bancaria_contable_id', cb?.cuenta_contable_id ?? null)
                                                        updatePago(i, 'referencia', label || pago.referencia || '')
                                                    }}
                                                >
                                                    <option value="">🏦 Cuenta bancaria destino…</option>
                                                    {cuentasBancarias.map(cb => (
                                                        <option key={cb.id} value={cb.id}>
                                                            {cb.banco?.nombre} — {cb.numero_cuenta}
                                                        </option>
                                                    ))}
                                                </select>
                                            )}
                                            {/* Referencia / N° cheque */}
                                            {(pago.metodo === 'cheque' || pago.metodo === 'cheque_fecha' || pago.metodo === 'tarjeta') && (
                                                <input type="text"
                                                    placeholder={pago.metodo === 'tarjeta' ? 'Últimos 4 dígitos…' : 'N° de cheque…'}
                                                    className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                                                    value={pago.referencia ?? ''}
                                                    onChange={e => updatePago(i, 'referencia', e.target.value)}
                                                />
                                            )}
                                            {/* Transferencia: N° de comprobante y observaciones */}
                                            {pago.metodo === 'transferencia' && (
                                                <div className="grid grid-cols-2 gap-1.5">
                                                    <input type="text"
                                                        placeholder="N° comprobante transferencia"
                                                        className="px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-xs outline-none focus:ring-2 focus:ring-blue-400 text-blue-900"
                                                        value={pago.numero_documento ?? ''}
                                                        onChange={e => updatePago(i, 'numero_documento', e.target.value || null)}
                                                    />
                                                    <input type="text"
                                                        placeholder="Observaciones"
                                                        className="px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-xs outline-none focus:ring-2 focus:ring-blue-400 text-blue-900"
                                                        value={pago.observaciones ?? ''}
                                                        onChange={e => updatePago(i, 'observaciones', e.target.value || null)}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* Crédito: plazo */}
                                {pagos.some(p => p.metodo === 'credito') && (
                                    <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-xl p-3">
                                        <CreditCard className="w-4 h-4 text-amber-600 shrink-0" />
                                        <label className="text-sm font-bold text-amber-800 whitespace-nowrap">Plazo crédito</label>
                                        <select
                                            className="flex-1 px-3 py-2 rounded-lg border border-amber-200 text-sm bg-white outline-none focus:ring-2 focus:ring-amber-400"
                                            value={diasPlazoCredito}
                                            onChange={e => setDiasPlazoCredito(Number(e.target.value))}>
                                            {[15, 30, 45, 60, 90, 120].map(d => (
                                                <option key={d} value={d}>{d} días</option>
                                            ))}
                                        </select>
                                    </div>
                                )}

                                {/* Efectivo: monto recibido y vuelto */}
                                {tieneEfectivo && (
                                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <label className="text-sm text-slate-600 font-medium whitespace-nowrap">Recibido en efectivo</label>
                                            <input type="number" min="0" step="0.01"
                                                className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-right outline-none"
                                                value={montoRecibido}
                                                onChange={e => setMontoRecibido(parseFloat(e.target.value) || 0)} />
                                        </div>
                                        {vuelto > 0 && (
                                            <div className="flex justify-between text-sm font-bold text-emerald-700">
                                                <span>Vuelto</span>
                                                <span>{formatCurrency(vuelto)}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Resumen totales modal */}
                                <div className="bg-slate-50 rounded-xl p-3 space-y-1.5 text-sm">
                                    <div className="flex justify-between text-slate-600">
                                        <span>Total proforma</span>
                                        <span className="font-bold">{formatCurrency(convertModal.proforma?.total ?? 0)}</span>
                                    </div>
                                    <div className="flex justify-between text-slate-600">
                                        <span>Total pagado</span>
                                        <span className={cn('font-bold', pendienteConv > 0.01 ? 'text-red-600' : 'text-emerald-600')}>
                                            {formatCurrency(totalPagoConv)}
                                        </span>
                                    </div>
                                    {pendienteConv > 0.01 && (
                                        <div className="flex justify-between text-red-600 font-bold">
                                            <span>Pendiente</span>
                                            <span>{formatCurrency(pendienteConv)}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Acciones */}
                                <div className="flex gap-2 pt-1">
                                    <button
                                        onClick={() => setConvertModal({ open: false, proforma: null })}
                                        className="flex-1 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold hover:bg-slate-50">
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={handleConvertirAFactura}
                                        disabled={converting || !cajaSesion || pendienteConv > 0.01}
                                        className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60">
                                        {converting
                                            ? <Loader2 className="w-4 h-4 animate-spin" />
                                            : <FileCheck className="w-4 h-4" />}
                                        Generar Factura
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
