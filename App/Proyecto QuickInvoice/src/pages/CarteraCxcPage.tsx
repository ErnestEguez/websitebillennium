import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
    carteraCxcService,
    type CarteraCxc,
    type CarteraCxcPago,
} from '../services/carteraCxcService'
import { formatCurrency } from '../lib/utils'
import {
    CreditCard, DollarSign, AlertCircle, CheckCircle2, X,
    Save, ChevronDown, ChevronUp, Search, Printer, Users,
} from 'lucide-react'

const METODOS_PAGO: { value: CarteraCxcPago['metodo_pago']; label: string }[] = [
    { value: 'efectivo',      label: 'Efectivo' },
    { value: 'transferencia', label: 'Transferencia' },
    { value: 'cheque',        label: 'Cheque' },
    { value: 'tarjeta',       label: 'Tarjeta' },
    { value: 'nota_credito',  label: 'Nota de Crédito' },
    { value: 'otros',         label: 'Otros' },
]

const ESTADO_BADGE: Record<string, string> = {
    pendiente: 'bg-yellow-100 text-yellow-800',
    parcial:   'bg-blue-100 text-blue-800',
    pagada:    'bg-green-100 text-green-800',
    anulada:   'bg-red-100 text-red-800',
}

interface Distribucion {
    cartera: CarteraCxc
    aplicado: number  // monto que se aplica a esta factura
}

/** Distribuye un pago FIFO entre facturas ordenadas por fecha_emision */
function distribuirFIFO(facturas: CarteraCxc[], totalPago: number): Distribucion[] {
    let resto = totalPago
    return facturas.map(f => {
        if (resto <= 0) return { cartera: f, aplicado: 0 }
        const aplicado = Math.min(resto, Number(f.saldo))
        resto = Math.round((resto - aplicado) * 100) / 100
        return { cartera: f, aplicado: Math.round(aplicado * 100) / 100 }
    })
}

export function CarteraCxcPage() {
    const { empresa } = useAuth()
    const [cartera, setCartera]         = useState<CarteraCxc[]>([])
    const [loading, setLoading]         = useState(true)
    const [filtroEstado, setFiltroEstado] = useState('activos')
    const [filtroCliente, setFiltroCliente] = useState('')
    const [expandedId, setExpandedId]   = useState<string | null>(null)
    const [pagosDetalle, setPagosDetalle] = useState<Record<string, CarteraCxcPago[]>>({})

    // ── Modal pago individual ──
    const [pagoModal, setPagoModal]     = useState<CarteraCxc | null>(null)
    const [pagoValor, setPagoValor]     = useState('')
    const [pagoMetodo, setPagoMetodo]   = useState<CarteraCxcPago['metodo_pago']>('efectivo')
    const [pagoRef, setPagoRef]         = useState('')
    const [savingPago, setSavingPago]   = useState(false)

    // ── Modal pago multi-factura ──
    const [multiModal, setMultiModal]   = useState(false)
    const [multiCliente, setMultiCliente] = useState('')          // texto búsqueda
    const [multiClienteId, setMultiClienteId] = useState<string | null>(null)
    const [multiFacturas, setMultiFacturas] = useState<CarteraCxc[]>([])
    const [multiTotal, setMultiTotal]   = useState('')
    const [multiMetodo, setMultiMetodo] = useState<CarteraCxcPago['metodo_pago']>('cheque')
    const [multiRef, setMultiRef]       = useState('')
    const [savingMulti, setSavingMulti] = useState(false)
    const [loadingMultiFacturas, setLoadingMultiFacturas] = useState(false)

    useEffect(() => {
        if (empresa?.id) loadCartera()
    }, [empresa?.id, filtroEstado])

    async function loadCartera() {
        try {
            setLoading(true)
            const data = await carteraCxcService.getCartera(empresa!.id, filtroEstado)
            setCartera(data)
        } catch (e) {
            console.error(e)
            alert('Error al cargar cartera')
        } finally {
            setLoading(false)
        }
    }

    async function toggleDetalle(id: string) {
        if (expandedId === id) { setExpandedId(null); return }
        setExpandedId(id)
        if (!pagosDetalle[id]) {
            const pagos = await carteraCxcService.getPagosDeCartera(id)
            setPagosDetalle(prev => ({ ...prev, [id]: pagos }))
        }
    }

    // ── Pago individual ──
    async function handleRegistrarPago() {
        if (!pagoModal) return
        const valor = parseFloat(pagoValor)
        if (isNaN(valor) || valor <= 0) { alert('Ingresa un valor válido mayor a 0'); return }
        if (valor > pagoModal.saldo) { alert(`El valor no puede superar el saldo (${formatCurrency(pagoModal.saldo)})`); return }
        try {
            setSavingPago(true)
            await carteraCxcService.registrarPago(pagoModal.id, empresa!.id, valor, pagoMetodo, pagoRef)
            const nuevoSaldo = Math.round((pagoModal.saldo - valor) * 100) / 100
            // Imprimir comprobante
            imprimirComprobante([{
                cartera: { ...pagoModal, saldo: pagoModal.saldo },
                aplicado: valor,
            }], valor, pagoMetodo, pagoRef, nuevoSaldo)
            setPagoModal(null); setPagoValor(''); setPagoRef('')
            await loadCartera()
        } catch (e: any) {
            alert(`Error al registrar pago: ${e.message}`)
        } finally {
            setSavingPago(false)
        }
    }

    // ── Cargar facturas del cliente para pago multi ──
    async function buscarFacturasCliente(clienteId: string, clienteNombre: string) {
        setMultiClienteId(clienteId)
        setMultiCliente(clienteNombre)
        setLoadingMultiFacturas(true)
        try {
            const facts = await carteraCxcService.getCarteraActivaPorCliente(empresa!.id, clienteId)
            setMultiFacturas(facts)
        } catch (e: any) {
            alert(`Error: ${e.message}`)
        } finally {
            setLoadingMultiFacturas(false)
        }
    }

    // Distribución FIFO reactiva
    const distribucion: Distribucion[] = useMemo(() => {
        const total = parseFloat(multiTotal)
        if (isNaN(total) || total <= 0 || multiFacturas.length === 0) return []
        return distribuirFIFO(multiFacturas, total)
    }, [multiTotal, multiFacturas])

    const totalSaldoCliente = multiFacturas.reduce((s, f) => s + Number(f.saldo), 0)
    const totalAplicado     = distribucion.reduce((s, d) => s + d.aplicado, 0)
    const excede            = parseFloat(multiTotal) > totalSaldoCliente + 0.001

    // ── Pago multi-factura ──
    async function handlePagoMultiple() {
        const total = parseFloat(multiTotal)
        if (isNaN(total) || total <= 0) { alert('Ingresa un valor válido'); return }
        if (excede) { alert(`El valor supera el total de la deuda (${formatCurrency(totalSaldoCliente)})`); return }
        const dists = distribucion.filter(d => d.aplicado > 0)
        if (dists.length === 0) { alert('Sin facturas a pagar'); return }
        try {
            setSavingMulti(true)
            await carteraCxcService.registrarPagoMultiple(
                dists.map(d => ({ carteraId: d.cartera.id, valor: d.aplicado })),
                empresa!.id,
                multiMetodo,
                multiRef
            )
            // Imprimir comprobante multi
            const saldoRestante = Math.round((totalSaldoCliente - totalAplicado) * 100) / 100
            imprimirComprobante(dists, total, multiMetodo, multiRef, saldoRestante)
            cerrarMultiModal()
            await loadCartera()
        } catch (e: any) {
            alert(`Error: ${e.message}`)
        } finally {
            setSavingMulti(false)
        }
    }

    function cerrarMultiModal() {
        setMultiModal(false); setMultiCliente(''); setMultiClienteId(null)
        setMultiFacturas([]); setMultiTotal(''); setMultiRef('')
        setMultiMetodo('cheque')
    }

    // ── Imprimir comprobante de pago (A4 y 80mm) ──
    function imprimirComprobante(
        dists: Distribucion[],
        totalPagado: number,
        metodo: string,
        referencia: string,
        saldoRestante: number
    ) {
        const primerCliente = dists[0]?.cartera
        const ahora = new Date()
        const fechaHora = ahora.toLocaleString('es-EC', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false
        })
        const nombreEmpresa = (empresa as any)?.nombre || (empresa as any)?.razon_social || 'EMPRESA'
        const rucEmpresa    = (empresa as any)?.ruc || ''
        const dirEmpresa    = (empresa as any)?.direccion || ''
        const telEmpresa    = (empresa as any)?.telefono || ''
        const metodoLabel   = METODOS_PAGO.find(m => m.value === metodo)?.label || metodo
        const clienteNombre = primerCliente?.clientes?.nombre || '—'
        const clienteId     = primerCliente?.clientes?.identificacion || '—'
        const saldoAnterior = dists.reduce((s, d) => s + Number(d.cartera.saldo), 0)

        // Filas tabla facturas
        const filasA4 = dists.filter(d => d.aplicado > 0).map(d => {
            const saldoNuevo = Math.max(0, Math.round((d.cartera.saldo - d.aplicado) * 100) / 100)
            return `<tr>
                <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:11px">${d.cartera.comprobantes?.secuencial || '—'}</td>
                <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;text-align:right">${formatCurrency(d.cartera.valor_original)}</td>
                <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;text-align:right;color:#dc2626">${formatCurrency(d.cartera.saldo)}</td>
                <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:bold;color:#16a34a">${formatCurrency(d.aplicado)}</td>
                <td style="padding:4px 6px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:bold;color:${saldoNuevo===0?'#16a34a':'#dc2626'}">${saldoNuevo === 0 ? '✓ CANCELADA' : formatCurrency(saldoNuevo)}</td>
            </tr>`
        }).join('')

        const filas80 = dists.filter(d => d.aplicado > 0).map(d => {
            const saldoNuevo = Math.max(0, Math.round((d.cartera.saldo - d.aplicado) * 100) / 100)
            return `<tr>
                <td style="padding:2px 0;font-size:10px">${(d.cartera.comprobantes?.secuencial || '—').split('-').pop()}</td>
                <td style="padding:2px 0;font-size:10px;text-align:right">${formatCurrency(d.cartera.saldo)}</td>
                <td style="padding:2px 0;font-size:10px;text-align:right;font-weight:bold">${formatCurrency(d.aplicado)}</td>
                <td style="padding:2px 0;font-size:10px;text-align:right">${saldoNuevo === 0 ? 'OK' : formatCurrency(saldoNuevo)}</td>
            </tr>`
        }).join('')

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Comprobante de Pago</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:12px;color:#111}

  /* ── A4 ── */
  .a4{display:block;padding:24px;max-width:210mm}
  .a4 .hdr{text-align:center;border-bottom:2px solid #1e3a5f;padding-bottom:12px;margin-bottom:14px}
  .a4 .empresa{font-size:15px;font-weight:bold;text-transform:uppercase;color:#1e3a5f}
  .a4 .titulo{font-size:13px;font-weight:bold;background:#1e3a5f;color:white;padding:4px 12px;display:inline-block;border-radius:4px;margin:6px 0}
  .a4 .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0;background:#f8fafc;padding:10px;border-radius:6px}
  .a4 .campo label{font-size:9px;color:#64748b;text-transform:uppercase;font-weight:bold;display:block}
  .a4 .campo p{font-size:12px;margin-top:2px}
  .a4 table{width:100%;border-collapse:collapse;margin:10px 0}
  .a4 th{background:#1e3a5f;color:white;padding:5px 6px;font-size:10px;text-transform:uppercase}
  .a4 th.r{text-align:right}
  .a4 .totbox{background:#f1f5f9;border-left:4px solid #1e3a5f;padding:10px 14px;margin-top:12px}
  .a4 .totbox .row{display:flex;justify-content:space-between;padding:3px 0;font-size:12px}
  .a4 .totbox .big{font-size:16px;font-weight:bold;border-top:2px solid #1e3a5f;margin-top:6px;padding-top:6px}
  .a4 .paginfo{margin-top:12px;border:1px solid #e2e8f0;border-radius:6px;padding:10px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
  .a4 .paginfo label{font-size:9px;color:#64748b;text-transform:uppercase;font-weight:bold;display:block}
  .a4 .paginfo p{font-size:12px;font-weight:bold;margin-top:2px}
  .a4 .footer{margin-top:16px;text-align:center;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:8px}

  /* ── 80mm ── */
  .mm80{display:none;width:72mm;padding:4mm;font-family:'Courier New',monospace}
  .mm80 .center{text-align:center}
  .mm80 .bold{font-weight:bold}
  .mm80 .sep{border-top:1px dashed #000;margin:3px 0}
  .mm80 table{width:100%;font-size:9px}
  .mm80 th{font-size:9px;border-bottom:1px solid #000;padding-bottom:2px;text-align:left}
  .mm80 th.r{text-align:right}
  .mm80 .total-row{display:flex;justify-content:space-between;font-size:10px;padding:1px 0}
  .mm80 .total-big{font-size:13px;font-weight:bold;border-top:1px solid #000;border-bottom:1px solid #000;padding:3px 0;display:flex;justify-content:space-between}

  /* controles */
  .ctrl{padding:14px;background:#f1f5f9;display:flex;gap:10px;justify-content:center}
  .btn-a4{padding:8px 20px;background:#1e3a5f;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px}
  .btn-80{padding:8px 20px;background:#0f766e;color:white;border:none;border-radius:6px;cursor:pointer;font-size:13px}

  @media print{
    .ctrl,.no-print{display:none!important}
    .a4,.mm80{display:block!important}
  }
</style>
<script>
  function printA4(){
    document.querySelector('.mm80').style.display='none';
    document.querySelector('.a4').style.display='block';
    window.print();
  }
  function print80(){
    document.querySelector('.a4').style.display='none';
    document.querySelector('.mm80').style.display='block';
    window.print();
  }
</script>
</head><body>

<div class="ctrl no-print">
  <button class="btn-a4" onclick="printA4()">🖨 Imprimir A4</button>
  <button class="btn-80" onclick="print80()">🖨 Imprimir 80mm</button>
</div>

<!-- ═══════ A4 ═══════ -->
<div class="a4">
  <div class="hdr">
    <div class="empresa">${nombreEmpresa}</div>
    <div style="font-size:11px;color:#475569">RUC: ${rucEmpresa} | ${dirEmpresa}${telEmpresa ? ' | Tel: ' + telEmpresa : ''}</div>
    <div class="titulo">COMPROBANTE DE PAGO</div>
    <div style="font-size:11px;color:#64748b">${fechaHora}</div>
  </div>

  <div class="grid2">
    <div class="campo"><label>Cliente</label><p><strong>${clienteNombre}</strong></p></div>
    <div class="campo"><label>Identificación</label><p>${clienteId}</p></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>No. Factura</th>
        <th class="r">Deuda</th>
        <th class="r">Abono</th>
        <th class="r">Saldo</th>
      </tr>
    </thead>
    <tbody>${filasA4}</tbody>
  </table>

  <div class="paginfo">
    <div><label>Forma de pago</label><p>${metodoLabel}</p></div>
    <div><label>Referencia / Nro.</label><p>${referencia || '—'}</p></div>
    <div><label>Fecha y hora</label><p>${fechaHora}</p></div>
  </div>

  <div class="totbox">
    <div class="row"><span>Saldo anterior:</span><span>${formatCurrency(saldoAnterior)}</span></div>
    <div class="row big"><span>VALOR PAGADO:</span><span>${formatCurrency(totalPagado)}</span></div>
    <div class="row" style="color:#dc2626"><span>Saldo pendiente:</span><span>${formatCurrency(saldoRestante)}</span></div>
  </div>
  <div class="footer">Documento interno de cobro — no válido como comprobante fiscal SRI</div>
</div>

<!-- ═══════ 80mm ═══════ -->
<div class="mm80">
  <div class="center bold" style="font-size:12px">${nombreEmpresa}</div>
  <div class="center" style="font-size:9px">RUC: ${rucEmpresa}</div>
  <div class="center" style="font-size:9px">${dirEmpresa}</div>
  <div class="sep"></div>
  <div class="center bold" style="font-size:11px">COMPROBANTE DE PAGO</div>
  <div class="center" style="font-size:9px">${fechaHora}</div>
  <div class="sep"></div>
  <div style="font-size:10px"><b>Cliente:</b> ${clienteNombre}</div>
  <div style="font-size:9px">ID: ${clienteId}</div>
  <div class="sep"></div>
  <table>
    <thead>
      <tr>
        <th>Factura</th><th class="r">Saldo</th><th class="r">Abono</th><th class="r">Nuevo</th>
      </tr>
    </thead>
    <tbody>${filas80}</tbody>
  </table>
  <div class="sep"></div>
  <div class="total-row"><span>Forma pago:</span><span><b>${metodoLabel}</b></span></div>
  ${referencia ? `<div class="total-row"><span>Referencia:</span><span>${referencia}</span></div>` : ''}
  <div class="sep"></div>
  <div class="total-big"><span>TOTAL PAGADO:</span><span>${formatCurrency(totalPagado)}</span></div>
  <div class="total-row" style="color:#dc2626"><span>Saldo pendiente:</span><span>${formatCurrency(saldoRestante)}</span></div>
  <div class="sep"></div>
  <div class="center" style="font-size:8px">Documento interno de cobro</div>
</div>

</body></html>`

        const w = window.open('', '_blank', 'width=800,height=700')
        if (w) { w.document.write(html); w.document.close(); w.focus() }
    }

    // ── Imprimir cartera (listado actual) ──
    function imprimirCartera() {
        const ahora = new Date().toLocaleString('es-EC', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false
        })
        const nombreEmpresa = (empresa as any)?.nombre || (empresa as any)?.razon_social || 'EMPRESA'
        const tituloFiltro  = filtroCliente
            ? `Cliente: ${filtroCliente}`
            : `Estado: ${filtroEstado === 'todos' ? 'Todos' : filtroEstado}`

        const filas = carteraFiltrada.map(c => {
            const vDias = diasVencido(c.fecha_vencimiento)
            return `<tr>
                <td style="padding:4px 6px;border-bottom:1px solid #eee;font-family:monospace">${c.comprobantes?.secuencial || '—'}</td>
                <td style="padding:4px 6px;border-bottom:1px solid #eee">${c.clientes?.nombre || '—'}</td>
                <td style="padding:4px 6px;border-bottom:1px solid #eee;font-size:10px;color:#555">${c.clientes?.identificacion || ''}</td>
                <td style="padding:4px 6px;border-bottom:1px solid #eee">${c.fecha_emision}</td>
                <td style="padding:4px 6px;border-bottom:1px solid #eee;color:${vDias ? '#dc2626' : '#555'}">${c.fecha_vencimiento || '—'}${vDias ? ` (${vDias}d)` : ''}</td>
                <td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:right">${formatCurrency(c.valor_original)}</td>
                <td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:right;font-weight:bold;color:#dc2626">${formatCurrency(c.saldo)}</td>
                <td style="padding:4px 6px;border-bottom:1px solid #eee;text-align:center">
                    <span style="padding:2px 8px;border-radius:999px;font-size:10px;background:${c.estado==='pagada'?'#dcfce7':c.estado==='parcial'?'#dbeafe':'#fef9c3'};color:${c.estado==='pagada'?'#166534':c.estado==='parcial'?'#1e40af':'#854d0e'}">${c.estado}</span>
                </td>
            </tr>`
        }).join('')

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Cartera por Cobrar</title>
<style>
  body{font-family:Arial,sans-serif;font-size:11px;color:#111;margin:0;padding:16px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #333;padding-bottom:10px;margin-bottom:14px}
  .empresa-nombre{font-size:15px;font-weight:bold;text-transform:uppercase}
  .titulo-reporte{font-size:14px;font-weight:bold;color:#1d4ed8;text-align:right}
  table{width:100%;border-collapse:collapse}
  th{background:#1e3a5f;color:white;padding:6px 6px;text-align:left;font-size:10px;text-transform:uppercase}
  th.r{text-align:right} th.c{text-align:center}
  .totales{display:flex;justify-content:flex-end;gap:32px;margin-top:12px;padding:10px;background:#f1f5f9;border-radius:6px}
  .totales div{text-align:right}
  .totales label{font-size:10px;color:#666;text-transform:uppercase;display:block}
  .totales span{font-size:14px;font-weight:bold}
  .footer{text-align:center;margin-top:16px;font-size:10px;color:#888;border-top:1px solid #ddd;padding-top:6px}
  @media print{.no-print{display:none}body{padding:8px}}
</style></head><body>
<div class="header">
  <div>
    <div class="empresa-nombre">${nombreEmpresa}</div>
    <div style="color:#555;font-size:11px">RUC: ${(empresa as any)?.ruc || ''} | ${(empresa as any)?.direccion || ''}</div>
  </div>
  <div>
    <div class="titulo-reporte">CARTERA POR COBRAR</div>
    <div style="font-size:11px;color:#555;text-align:right">${tituloFiltro}</div>
    <div style="font-size:10px;color:#888;text-align:right">Generado: ${ahora}</div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th>Factura</th><th>Cliente</th><th>Identificación</th>
      <th>Emisión</th><th>Vencimiento</th>
      <th class="r">Original</th><th class="r">Saldo</th><th class="c">Estado</th>
    </tr>
  </thead>
  <tbody>${filas}</tbody>
</table>

<div class="totales">
  <div><label>Facturas</label><span>${carteraFiltrada.length}</span></div>
  <div><label>Total original</label><span>${formatCurrency(totalOriginal)}</span></div>
  <div><label>Saldo pendiente</label><span style="color:#dc2626">${formatCurrency(totalSaldo)}</span></div>
</div>

<div class="footer">QuickInvoice — Reporte interno de cartera</div>
<div class="no-print" style="text-align:center;margin-top:16px">
  <button onclick="window.print()" style="padding:8px 24px;background:#1e3a5f;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px">Imprimir</button>
</div>
</body></html>`

        const w = window.open('', '_blank', 'width=950,height=700')
        if (w) { w.document.write(html); w.document.close(); w.focus(); setTimeout(() => w.print(), 400) }
    }

    const carteraFiltrada = filtroCliente.trim()
        ? cartera.filter(c =>
            c.clientes?.nombre?.toLowerCase().includes(filtroCliente.toLowerCase()) ||
            c.clientes?.identificacion?.includes(filtroCliente))
        : cartera

    const totalSaldo    = carteraFiltrada.reduce((s, c) => s + Number(c.saldo), 0)
    const totalOriginal = carteraFiltrada.reduce((s, c) => s + Number(c.valor_original), 0)

    const diasVencido = (fechaVenc: string | null) => {
        if (!fechaVenc) return null
        const diff = Math.floor((Date.now() - new Date(fechaVenc).getTime()) / 86400000)
        return diff > 0 ? diff : null
    }

    // Lista única de clientes en la cartera activa (para el selector del modal multi)
    const clientesUnicos = useMemo(() => {
        const map: Record<string, { id: string; nombre: string; identificacion: string }> = {}
        cartera.forEach(c => {
            if (c.cliente_id && c.clientes?.nombre && !map[c.cliente_id]) {
                map[c.cliente_id] = { id: c.cliente_id, nombre: c.clientes.nombre, identificacion: c.clientes.identificacion || '' }
            }
        })
        return Object.values(map).sort((a, b) => a.nombre.localeCompare(b.nombre))
    }, [cartera])

    const clientesFiltrados = multiCliente
        ? clientesUnicos.filter(c =>
            c.nombre.toLowerCase().includes(multiCliente.toLowerCase()) ||
            c.identificacion.includes(multiCliente))
        : clientesUnicos

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-slate-500">Cargando cartera...</div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Encabezado */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Cartera por Cobrar</h1>
                    <p className="text-slate-600 mt-1">Facturas a crédito pendientes de cobro</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => { setMultiModal(true); setFiltroEstado('pendiente') }}
                        className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700"
                    >
                        <Users className="w-4 h-4" />
                        Cobro a Cliente
                    </button>
                    <button
                        onClick={imprimirCartera}
                        className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 text-white rounded-xl text-sm font-semibold hover:bg-slate-800"
                    >
                        <Printer className="w-4 h-4" />
                        Imprimir Cartera
                    </button>
                </div>
            </div>

            {/* Resumen */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="card p-5 flex items-center gap-4">
                    <div className="w-12 h-12 bg-yellow-100 rounded-xl flex items-center justify-center">
                        <CreditCard className="w-6 h-6 text-yellow-600" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-500">Facturas en vista</p>
                        <p className="text-2xl font-bold text-slate-900">{carteraFiltrada.length}</p>
                    </div>
                </div>
                <div className="card p-5 flex items-center gap-4">
                    <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
                        <DollarSign className="w-6 h-6 text-primary-600" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-500">Valor original</p>
                        <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalOriginal)}</p>
                    </div>
                </div>
                <div className="card p-5 flex items-center gap-4">
                    <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                        <AlertCircle className="w-6 h-6 text-red-600" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-500">Saldo pendiente</p>
                        <p className="text-2xl font-bold text-red-600">{formatCurrency(totalSaldo)}</p>
                    </div>
                </div>
            </div>

            {/* Buscador + filtros */}
            <div className="flex flex-wrap gap-3 items-center">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Buscar cliente..."
                        value={filtroCliente}
                        onChange={e => setFiltroCliente(e.target.value)}
                        className="pl-9 pr-8 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-primary-500 outline-none w-56"
                    />
                    {filtroCliente && (
                        <button onClick={() => setFiltroCliente('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
                <div className="flex gap-2 flex-wrap">
                    {[
                        { value: 'activos',   label: 'Activos (Pend+Parcial)' },
                        { value: 'pendiente', label: 'Pendiente' },
                        { value: 'parcial',   label: 'Parcial' },
                        { value: 'pagada',    label: 'Pagada' },
                        { value: 'todos',     label: 'Todos' },
                    ].map(f => (
                        <button
                            key={f.value}
                            onClick={() => setFiltroEstado(f.value)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                filtroEstado === f.value
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tabla */}
            <div className="card overflow-hidden">
                <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Factura</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Cliente</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Emisión</th>
                            <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Vencimiento</th>
                            <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Original</th>
                            <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Saldo</th>
                            <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Estado</th>
                            <th className="px-4 py-3" />
                        </tr>
                    </thead>
                    <tbody>
                        {carteraFiltrada.map(c => {
                            const vencidoDias = diasVencido(c.fecha_vencimiento)
                            const isExpanded  = expandedId === c.id
                            return (
                                <>
                                    <tr
                                        key={c.id}
                                        className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer ${vencidoDias ? 'bg-red-50/30' : ''}`}
                                        onClick={() => toggleDetalle(c.id)}
                                    >
                                        <td className="px-4 py-3 font-mono text-sm text-slate-700">{c.comprobantes?.secuencial || '—'}</td>
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-slate-900 text-sm">{c.clientes?.nombre || '—'}</div>
                                            <div className="text-xs text-slate-500">{c.clientes?.identificacion}</div>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-600">{c.fecha_emision}</td>
                                        <td className="px-4 py-3 text-sm">
                                            {c.fecha_vencimiento ? (
                                                <span className={vencidoDias ? 'text-red-600 font-semibold' : 'text-slate-600'}>
                                                    {c.fecha_vencimiento}
                                                    {vencidoDias && <span className="ml-1 text-xs">({vencidoDias}d vencido)</span>}
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-right text-sm text-slate-600">{formatCurrency(c.valor_original)}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-sm text-red-600">{formatCurrency(c.saldo)}</td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ESTADO_BADGE[c.estado] || ''}`}>
                                                {c.estado}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                            <div className="flex gap-1 justify-end items-center">
                                                {(c.estado === 'pendiente' || c.estado === 'parcial') && (
                                                    <button
                                                        onClick={() => { setPagoModal(c); setPagoValor(String(c.saldo)) }}
                                                        className="px-3 py-1.5 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-700 font-medium"
                                                    >
                                                        Abonar
                                                    </button>
                                                )}
                                                <button className="p-1.5 text-slate-400">
                                                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>

                                    {isExpanded && (
                                        <tr key={`${c.id}-detail`} className="bg-slate-50">
                                            <td colSpan={8} className="px-6 py-4">
                                                <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Historial de pagos</p>
                                                {(pagosDetalle[c.id] || []).length === 0 ? (
                                                    <p className="text-sm text-slate-400">Sin pagos registrados</p>
                                                ) : (
                                                    <table className="w-full text-sm">
                                                        <thead>
                                                            <tr className="text-xs text-slate-500">
                                                                <th className="text-left pb-1">Fecha</th>
                                                                <th className="text-left pb-1">Método</th>
                                                                <th className="text-left pb-1">Referencia</th>
                                                                <th className="text-right pb-1">Valor</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-200">
                                                            {pagosDetalle[c.id].map(p => (
                                                                <tr key={p.id}>
                                                                    <td className="py-1 text-slate-600">{p.fecha_pago}</td>
                                                                    <td className="py-1 text-slate-600 capitalize">{p.metodo_pago.replace('_', ' ')}</td>
                                                                    <td className="py-1 text-slate-500">{p.referencia || '—'}</td>
                                                                    <td className="py-1 text-right font-medium text-green-700">{formatCurrency(p.valor)}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                )}
                                            </td>
                                        </tr>
                                    )}
                                </>
                            )
                        })}
                    </tbody>
                </table>

                {carteraFiltrada.length === 0 && (
                    <div className="text-center py-12">
                        <CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500">
                            {filtroCliente ? `Sin resultados para "${filtroCliente}"` : `No hay facturas con estado "${filtroEstado}"`}
                        </p>
                    </div>
                )}
            </div>

            {/* ═══════════════════════════════════════════════════
                MODAL PAGO INDIVIDUAL
            ═══════════════════════════════════════════════════ */}
            {pagoModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">Registrar Abono</h2>
                                <p className="text-sm text-slate-500 mt-0.5">
                                    Factura {pagoModal.comprobantes?.secuencial} — {pagoModal.clientes?.nombre}
                                </p>
                            </div>
                            <button onClick={() => setPagoModal(null)} className="p-2 hover:bg-slate-100 rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="bg-slate-50 rounded-xl p-4 flex justify-between text-sm">
                                <div>
                                    <p className="text-slate-500">Valor original</p>
                                    <p className="font-semibold">{formatCurrency(pagoModal.valor_original)}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-slate-500">Saldo pendiente</p>
                                    <p className="font-bold text-red-600 text-lg">{formatCurrency(pagoModal.saldo)}</p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Valor del abono <span className="text-red-500">*</span></label>
                                <input
                                    type="number" min="0.01" step="0.01" max={pagoModal.saldo}
                                    value={pagoValor}
                                    onChange={e => setPagoValor(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Método de pago</label>
                                <select
                                    value={pagoMetodo}
                                    onChange={e => setPagoMetodo(e.target.value as CarteraCxcPago['metodo_pago'])}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500"
                                >
                                    {METODOS_PAGO.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Referencia / Número</label>
                                <input
                                    type="text" value={pagoRef} onChange={e => setPagoRef(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500"
                                    placeholder="Nro. transferencia, cheque, etc."
                                />
                            </div>
                        </div>

                        <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
                            <button onClick={() => setPagoModal(null)} className="btn btn-secondary" disabled={savingPago}>Cancelar</button>
                            <button onClick={handleRegistrarPago} className="btn btn-primary flex items-center gap-2" disabled={savingPago}>
                                {savingPago
                                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    : <Save className="w-4 h-4" />}
                                Registrar y Comprobante
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════
                MODAL COBRO MULTI-FACTURA
            ═══════════════════════════════════════════════════ */}
            {multiModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                        {/* Header */}
                        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">Cobro a Cliente</h2>
                                <p className="text-sm text-slate-500">Un pago aplica a varias facturas (distribución FIFO)</p>
                            </div>
                            <button onClick={cerrarMultiModal} className="p-2 hover:bg-slate-100 rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-5 overflow-y-auto flex-1">
                            {/* Paso 1: Seleccionar cliente */}
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">
                                    1. Seleccionar cliente
                                </label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder="Buscar por nombre o RUC..."
                                        value={multiCliente}
                                        onChange={e => { setMultiCliente(e.target.value); setMultiClienteId(null); setMultiFacturas([]) }}
                                        className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500"
                                    />
                                </div>
                                {/* Lista de clientes */}
                                {!multiClienteId && clientesFiltrados.length > 0 && (
                                    <div className="mt-2 border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-40 overflow-y-auto">
                                        {clientesFiltrados.map(cl => (
                                            <button
                                                key={cl.id}
                                                onClick={() => buscarFacturasCliente(cl.id, cl.nombre)}
                                                className="w-full text-left px-4 py-2.5 hover:bg-primary-50 text-sm transition-colors"
                                            >
                                                <span className="font-medium text-slate-900">{cl.nombre}</span>
                                                <span className="ml-2 text-slate-500 text-xs">{cl.identificacion}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Paso 2: Facturas pendientes */}
                            {multiClienteId && (
                                <>
                                    {loadingMultiFacturas ? (
                                        <p className="text-sm text-slate-500">Cargando facturas...</p>
                                    ) : multiFacturas.length === 0 ? (
                                        <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-4 py-3">Este cliente no tiene facturas pendientes.</p>
                                    ) : (
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 mb-2">
                                                2. Facturas pendientes — Total deuda: <span className="text-red-600">{formatCurrency(totalSaldoCliente)}</span>
                                            </label>
                                            <div className="border border-slate-200 rounded-xl overflow-hidden">
                                                <table className="w-full text-sm">
                                                    <thead className="bg-slate-50">
                                                        <tr>
                                                            <th className="text-left px-3 py-2 text-xs text-slate-500 uppercase">Factura</th>
                                                            <th className="text-left px-3 py-2 text-xs text-slate-500 uppercase">Emisión</th>
                                                            <th className="text-right px-3 py-2 text-xs text-slate-500 uppercase">Saldo</th>
                                                            <th className="text-right px-3 py-2 text-xs text-slate-500 uppercase">Aplica</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {multiFacturas.map((f, i) => {
                                                            const dist = distribucion[i]
                                                            return (
                                                                <tr key={f.id} className={dist?.aplicado > 0 ? 'bg-green-50/50' : ''}>
                                                                    <td className="px-3 py-2 font-mono text-slate-700">{f.comprobantes?.secuencial}</td>
                                                                    <td className="px-3 py-2 text-slate-500">{f.fecha_emision}</td>
                                                                    <td className="px-3 py-2 text-right text-red-600 font-medium">{formatCurrency(f.saldo)}</td>
                                                                    <td className="px-3 py-2 text-right font-bold text-green-700">
                                                                        {dist?.aplicado > 0 ? formatCurrency(dist.aplicado) : '—'}
                                                                    </td>
                                                                </tr>
                                                            )
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {/* Paso 3: Datos del pago */}
                                    {multiFacturas.length > 0 && (
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-sm font-semibold text-slate-700 mb-1">3. Valor a pagar <span className="text-red-500">*</span></label>
                                                <input
                                                    type="number" min="0.01" step="0.01"
                                                    value={multiTotal}
                                                    onChange={e => setMultiTotal(e.target.value)}
                                                    className={`w-full px-4 py-2.5 rounded-xl border focus:ring-2 focus:ring-primary-500 font-mono text-lg font-bold ${excede ? 'border-red-400 bg-red-50' : 'border-slate-300'}`}
                                                    placeholder="0.00"
                                                    autoFocus
                                                />
                                                {excede && <p className="text-xs text-red-500 mt-1">Supera la deuda total</p>}
                                            </div>
                                            <div>
                                                <label className="block text-sm font-semibold text-slate-700 mb-1">Método</label>
                                                <select
                                                    value={multiMetodo}
                                                    onChange={e => setMultiMetodo(e.target.value as CarteraCxcPago['metodo_pago'])}
                                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500"
                                                >
                                                    {METODOS_PAGO.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-semibold text-slate-700 mb-1">Referencia</label>
                                                <input
                                                    type="text" value={multiRef} onChange={e => setMultiRef(e.target.value)}
                                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500"
                                                    placeholder="Nro. cheque, transferencia..."
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Resumen */}
                                    {totalAplicado > 0 && (
                                        <div className="bg-primary-50 border border-primary-200 rounded-xl px-5 py-4 flex justify-between items-center">
                                            <div>
                                                <p className="text-sm text-primary-700">Pagos a registrar</p>
                                                <p className="text-xs text-primary-500">{distribucion.filter(d => d.aplicado > 0).length} factura(s)</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-2xl font-bold text-primary-800">{formatCurrency(totalAplicado)}</p>
                                                <p className="text-xs text-primary-500">Saldo restante: {formatCurrency(Math.max(0, totalSaldoCliente - totalAplicado))}</p>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
                            <button onClick={cerrarMultiModal} className="btn btn-secondary" disabled={savingMulti}>Cancelar</button>
                            <button
                                onClick={handlePagoMultiple}
                                className="btn btn-primary flex items-center gap-2"
                                disabled={savingMulti || totalAplicado <= 0 || excede}
                            >
                                {savingMulti
                                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    : <Save className="w-4 h-4" />}
                                Registrar y Comprobante
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
