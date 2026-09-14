import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { HelpButton } from '../../components/help/HelpButton'
import {
    creditoElectrodomesticosService,
    type CreditoElectrodomesticos,
    type MetodoPagoCredito,
} from '../../services/creditoElectrodomesticosService'
import { distribuirPagoCuotas, calcularMoraCuota, type CuotaParaCobro, type ResultadoDistribucionPago } from '../../services/creditoElectrodomesticosCobro'
import { cobradorService, type Cobrador } from '../../services/cobradorService'
import { cuentasBancariasService } from '../../services/finance/bancosService'
import type { CuentaBancaria } from '../../types/finance'
import { formatCurrency } from '../../lib/utils'
import { ArrowLeft, Search, Loader2, DollarSign, Receipt, CheckCircle2 } from 'lucide-react'

const HOY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' })

const METODOS: { value: MetodoPagoCredito; label: string }[] = [
    { value: 'efectivo', label: '💵 Efectivo' },
    { value: 'transferencia', label: '🏦 Depósito / Transferencia' },
    { value: 'tarjeta', label: '💳 Tarjeta' },
    { value: 'cheque', label: '✏️ Cheque' },
    { value: 'otros', label: '🔄 Otros' },
]

const METODO_LABEL_PLANO: Record<MetodoPagoCredito, string> = {
    efectivo: 'Efectivo',
    transferencia: 'Depósito / Transferencia',
    tarjeta: 'Tarjeta',
    cheque: 'Cheque',
    nota_credito: 'Nota de Crédito',
    otros: 'Otros',
}

// ─── Comprobante de cobro A4 ────────────────────────────────────────────────
// Mismo patrón que generarHtmlA4 en ProformaPage.tsx: HTML en memoria,
// ventana nueva + print(), nunca se persiste el PDF en ningún lado.

function esc(s: string | null | undefined): string {
    if (!s) return ''
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function n2(n: number): string { return n.toFixed(2) }

function generarComprobanteCobroA4(input: {
    empresa: { nombre: string; ruc: string; logo_url?: string | null }
    credito: CreditoElectrodomesticos
    reciboInterno: number
    reciboExterno: string | null
    fecha: string
    metodoPago: MetodoPagoCredito
    cuentaBancariaLabel: string | null
    papeletaDeposito: string | null
    aplicaciones: { numeroCuota: number; moraAplicada: number; interesAplicado: number; capitalAplicado: number; totalAplicado: number; quedaSaldoEnCuota: boolean }[]
    montoCobrado: number
    saldoRestante: number
}): string {
    const { empresa: emp, credito, reciboInterno, reciboExterno, fecha, metodoPago, cuentaBancariaLabel, papeletaDeposito, aplicaciones, montoCobrado, saldoRestante } = input
    const fechaFormat = new Date(fecha + 'T12:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' })
    const logoHtml = emp.logo_url
        ? `<img src="${esc(emp.logo_url)}" alt="Logo" style="max-height:65px;max-width:150px;object-fit:contain;margin-bottom:6px;">`
        : ''

    const filas = aplicaciones.map(a => `
        <tr>
          <td class="c">${a.numeroCuota}</td>
          <td class="r">${a.moraAplicada > 0 ? n2(a.moraAplicada) : '—'}</td>
          <td class="r">${n2(a.interesAplicado)}</td>
          <td class="r">${n2(a.capitalAplicado)}</td>
          <td class="r bold">${n2(a.totalAplicado)}</td>
          <td class="c">${a.quedaSaldoEnCuota ? 'Parcial' : 'Saldada'}</td>
        </tr>`).join('')

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Recibo ${reciboInterno}</title>
<style>
  @page { margin: 14mm 14mm 18mm 14mm; size: A4; }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;font-size:9.5pt;color:#1a1a2e}
  .header{display:flex;justify-content:space-between;align-items:flex-start;
          padding-bottom:12px;margin-bottom:14px;border-bottom:3px solid #059669}
  .emp h1{font-size:14pt;font-weight:900;color:#059669;margin-bottom:3px}
  .emp p{font-size:8.5pt;color:#555;line-height:1.6}
  .doc-box{text-align:right}
  .doc-box .titulo{font-size:14pt;font-weight:900;color:#059669;letter-spacing:.5px}
  .doc-box .numero{font-family:monospace;font-size:10pt;font-weight:bold;color:#1a1a2e}
  .doc-box .fec{font-size:8.5pt;color:#555;margin-top:3px}
  .cli-box{background:#ecfdf5;border:1px solid #a7f3d0;border-radius:7px;
           padding:10px 14px;margin-bottom:14px}
  .cli-box h4{font-size:7pt;font-weight:900;text-transform:uppercase;letter-spacing:1px;
              color:#059669;margin-bottom:6px}
  .cli-grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 20px}
  .lbl{font-size:8pt;color:#888}
  .val{font-size:9pt;font-weight:bold;color:#1a1a2e}
  table{width:100%;border-collapse:collapse;margin-bottom:12px;font-size:8.5pt}
  thead tr{background:#059669;color:#fff}
  thead th{padding:6px 8px;text-align:left;font-size:7.5pt;font-weight:bold}
  tbody tr:nth-child(even){background:#f0fdf4}
  tbody td{padding:5px 8px;border-bottom:1px solid #d1fae5}
  .c{text-align:center}
  .r{text-align:right}
  .bold{font-weight:bold}
  .totbox{width:280px;margin-left:auto;border:1px solid #a7f3d0;border-radius:7px;overflow:hidden}
  .totbox table{margin-bottom:0}
  .totbox tr td{padding:5px 10px;border-bottom:1px solid #d1fae5;font-size:9pt}
  .totbox tr:last-child td{background:#059669;color:#fff;font-size:11pt;font-weight:900;border-bottom:none}
  .totbox td:last-child{text-align:right;font-weight:bold}
  .footer{margin-top:18px;border-top:1px solid #d1fae5;padding-top:8px;
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
    <div class="titulo">RECIBO DE COBRO</div>
    <div class="numero">N.º ${reciboInterno}</div>
    ${reciboExterno ? `<div class="numero" style="font-size:8.5pt;color:#555">Externo: ${esc(reciboExterno)}</div>` : ''}
    <div class="fec">Fecha: ${fechaFormat}</div>
  </div>
</div>

<div class="cli-box">
  <h4>Datos del crédito</h4>
  <div class="cli-grid">
    <div>
      <div class="lbl">Cliente</div>
      <div class="val">${esc(credito.clientes?.nombre)}</div>
    </div>
    <div>
      <div class="lbl">Identificación</div>
      <div class="val">${esc(credito.clientes?.identificacion)}</div>
    </div>
    <div>
      <div class="lbl">Factura</div>
      <div class="val">${esc(credito.comprobantes?.secuencial)}</div>
    </div>
    <div>
      <div class="lbl">Cobrador</div>
      <div class="val">${esc(credito.cobradores?.nombres)}</div>
    </div>
    <div>
      <div class="lbl">Forma de pago</div>
      <div class="val">${esc(METODO_LABEL_PLANO[metodoPago])}</div>
    </div>
    ${cuentaBancariaLabel ? `<div><div class="lbl">Cuenta bancaria</div><div class="val">${esc(cuentaBancariaLabel)}</div></div>` : ''}
    ${papeletaDeposito ? `<div><div class="lbl"># Papeleta de depósito</div><div class="val">${esc(papeletaDeposito)}</div></div>` : ''}
  </div>
</div>

<table>
  <thead>
    <tr>
      <th class="c" style="width:60px">Cuota</th>
      <th class="r">Mora</th>
      <th class="r">Interés</th>
      <th class="r">Capital</th>
      <th class="r">Total</th>
      <th class="c" style="width:70px">Estado</th>
    </tr>
  </thead>
  <tbody>
    ${filas || '<tr><td colspan="6" style="text-align:center;color:#aaa;padding:14px">Sin cuotas aplicadas</td></tr>'}
  </tbody>
</table>

<div class="totbox">
  <table>
    <tr><td>Saldo restante del crédito</td><td>$ ${n2(saldoRestante)}</td></tr>
    <tr><td>TOTAL COBRADO</td><td>$ ${n2(montoCobrado)}</td></tr>
  </table>
</div>

<div class="footer">
  Recibo de cobro interno — Corina ERP &nbsp;·&nbsp; ${new Date().toLocaleDateString('es-EC')}
</div>
</body>
</html>`
}

type Paso = 'cliente' | 'credito' | 'cobro'

export function CancelacionOficinaPage() {
    const { empresa } = useAuth()
    const [paso, setPaso] = useState<Paso>('cliente')

    // Paso 1: cliente
    const [busqueda, setBusqueda] = useState('')
    const [clientesConDeuda, setClientesConDeuda] = useState<{ id: string; nombre: string; identificacion: string; saldoTotal: number }[]>([])
    const [buscando, setBuscando] = useState(false)
    const [, setClienteId] = useState<string | null>(null)

    useEffect(() => {
        if (!busqueda.trim() || !empresa?.id) { setClientesConDeuda([]); return }
        const t = setTimeout(async () => {
            setBuscando(true)
            try {
                const r = await creditoElectrodomesticosService.buscarClientesConDeuda(empresa.id, busqueda.trim())
                setClientesConDeuda(r)
            } catch (e: any) {
                console.error('Error buscando clientes con deuda:', e)
                setClientesConDeuda([])
            } finally { setBuscando(false) }
        }, 300)
        return () => clearTimeout(t)
    }, [busqueda, empresa?.id])

    // Paso 2: créditos del cliente
    const [creditos, setCreditos] = useState<CreditoElectrodomesticos[]>([])
    const [cargandoCreditos, setCargandoCreditos] = useState(false)

    async function elegirCliente(id: string) {
        setClienteId(id)
        setPaso('credito')
        setCargandoCreditos(true)
        try {
            const r = await creditoElectrodomesticosService.listarCreditosConDeudaPorCliente(empresa!.id, id)
            setCreditos(r)
            if (r.length === 1) elegirCredito(r[0].id)
        } finally { setCargandoCreditos(false) }
    }

    // Paso 3: cobro
    const [credito, setCredito] = useState<CreditoElectrodomesticos | null>(null)
    const [cargandoDetalle, setCargandoDetalle] = useState(false)
    const [cobradores, setCobradores] = useState<Cobrador[]>([])
    const [cuentas, setCuentas] = useState<CuentaBancaria[]>([])

    async function elegirCredito(id: string) {
        setCargandoDetalle(true)
        try {
            const [completo, cobs, cts] = await Promise.all([
                creditoElectrodomesticosService.getCompleto(id),
                cobradorService.getCobradoresActivos(empresa!.id),
                cuentasBancariasService.listar(empresa!.id).catch(() => []),
            ])
            setCredito(completo)
            setCobradores(cobs)
            setCuentas(cts)
            setPaso('cobro')
        } finally { setCargandoDetalle(false) }
    }

    const cuotasParaCobro: CuotaParaCobro[] = (credito?.cuotas || [])
        .filter(c => c.estado !== 'PAGADA' && c.estado !== 'ANULADA')
        .sort((a, b) => a.numero_cuota - b.numero_cuota)
        .map(c => ({
            id: c.id,
            numeroCuota: c.numero_cuota,
            fechaVencimiento: c.fecha_vencimiento,
            capitalProgramado: c.capital_programado,
            interesProgramado: c.interes_programado,
            capitalPagado: c.capital_pagado,
            interesPagado: c.interes_pagado,
        }))

    const [montoCobrar, setMontoCobrar] = useState(0)
    const [metodoPago, setMetodoPago] = useState<MetodoPagoCredito>('efectivo')
    const [cuentaBancariaId, setCuentaBancariaId] = useState('')
    const [papeletaDeposito, setPapeletaDeposito] = useState('')
    const [reciboExterno, setReciboExterno] = useState('')
    const [cambiandoCobrador, setCambiandoCobrador] = useState(false)
    const [guardando, setGuardando] = useState(false)
    const [reciboConfirmado, setReciboConfirmado] = useState<number | null>(null)

    const previa: ResultadoDistribucionPago | null = credito && montoCobrar > 0
        ? distribuirPagoCuotas(cuotasParaCobro, montoCobrar, HOY, 0, 0) // preview simple; la mora real la calcula el servidor con la config real al grabar
        : null

    async function handleCambiarCobrador(nuevoCobradorId: string) {
        if (!credito) return
        setCambiandoCobrador(true)
        try {
            await creditoElectrodomesticosService.cambiarCobrador(credito.id, empresa!.id, nuevoCobradorId)
            setCredito({ ...credito, cobrador_id: nuevoCobradorId, cobradores: cobradores.find(c => c.id === nuevoCobradorId) as any })
        } catch (e: any) {
            alert('Error al cambiar el cobrador: ' + e.message)
        } finally {
            setCambiandoCobrador(false)
        }
    }

    async function handleRegistrarCobro() {
        if (!credito) return
        if (montoCobrar <= 0) { alert('Ingresa el monto a cobrar'); return }
        if (metodoPago === 'transferencia' && !cuentaBancariaId) { alert('Selecciona la cuenta bancaria del depósito'); return }
        try {
            setGuardando(true)
            const r = await creditoElectrodomesticosService.registrarCobroMultiple({
                empresaId: empresa!.id,
                creditoId: credito.id,
                cuotas: cuotasParaCobro,
                montoTotal: montoCobrar,
                fechaHoy: HOY,
                metodoPago,
                cuentaBancariaId: metodoPago === 'transferencia' ? cuentaBancariaId : null,
                papeletaDeposito: metodoPago === 'transferencia' ? papeletaDeposito || null : null,
                reciboExterno: reciboExterno || null,
            })
            setReciboConfirmado(r.reciboInterno)
            const actualizado = await creditoElectrodomesticosService.getCompleto(credito.id)
            setCredito(actualizado)

            const cuentaSeleccionada = cuentaBancariaId ? cuentas.find(c => c.id === cuentaBancariaId) : null
            const html = generarComprobanteCobroA4({
                empresa: empresa!,
                credito: actualizado,
                reciboInterno: r.reciboInterno,
                reciboExterno: reciboExterno || null,
                fecha: HOY,
                metodoPago,
                cuentaBancariaLabel: cuentaSeleccionada ? `${cuentaSeleccionada.banco?.nombre ?? ''} — ${cuentaSeleccionada.numero_cuenta}` : null,
                papeletaDeposito: metodoPago === 'transferencia' ? (papeletaDeposito || null) : null,
                aplicaciones: r.distribucion.aplicaciones,
                montoCobrado: montoCobrar,
                saldoRestante: actualizado.saldo_pendiente,
            })
            const win = window.open('', '_blank', 'width=900,height=700')
            if (win) {
                win.document.write(html)
                win.document.close()
                win.focus()
                setTimeout(() => { win.print() }, 450)
            }

            setMontoCobrar(0)
        } catch (e: any) {
            alert('Error al registrar el cobro: ' + e.message)
        } finally {
            setGuardando(false)
        }
    }

    function reiniciar() {
        setPaso('cliente')
        setClienteId(null)
        setCredito(null)
        setBusqueda('')
        setClientesConDeuda([])
        setCreditos([])
        setReciboConfirmado(null)
        setMontoCobrar(0)
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
                        <DollarSign className="w-7 h-7 text-primary-600" /> Cancelación Oficina
                    </h1>
                    <p className="text-slate-600 mt-1">Cobro de cuotas de crédito de electrodomésticos en ventanilla</p>
                </div>
                <HelpButton pageKey="cancelacion-oficina" />
            </div>

            {paso !== 'cliente' && (
                <button onClick={reiniciar} className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700">
                    <ArrowLeft className="w-4 h-4" /> Buscar otro cliente
                </button>
            )}

            {/* Paso 1: cliente */}
            {paso === 'cliente' && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
                    <h2 className="font-bold text-slate-900">Buscar cliente con deuda</h2>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            placeholder="Nombre o identificación…"
                            value={busqueda}
                            onChange={e => setBusqueda(e.target.value)}
                            className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-400"
                        />
                        {buscando && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-slate-300" />}
                    </div>
                    {clientesConDeuda.length > 0 && (
                        <div className="border border-slate-200 rounded-xl divide-y divide-slate-50">
                            {clientesConDeuda.map(c => (
                                <button key={c.id} onClick={() => elegirCliente(c.id)}
                                    className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center justify-between">
                                    <div>
                                        <p className="font-bold text-slate-900">{c.nombre}</p>
                                        <p className="text-xs text-slate-400">{c.identificacion}</p>
                                    </div>
                                    <p className="font-black text-primary-700">{formatCurrency(c.saldoTotal)}</p>
                                </button>
                            ))}
                        </div>
                    )}
                    {busqueda.trim() && !buscando && clientesConDeuda.length === 0 && (
                        <p className="text-sm text-slate-400 text-center py-6">Sin clientes con deuda pendiente que coincidan.</p>
                    )}
                </div>
            )}

            {/* Paso 2: créditos del cliente */}
            {paso === 'credito' && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
                    <h2 className="font-bold text-slate-900">Créditos con saldo pendiente</h2>
                    {cargandoCreditos ? (
                        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
                    ) : (
                        <div className="border border-slate-200 rounded-xl divide-y divide-slate-50">
                            {creditos.map(c => (
                                <button key={c.id} onClick={() => elegirCredito(c.id)}
                                    className="w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center justify-between">
                                    <div>
                                        <p className="font-mono text-xs text-slate-400">{c.comprobantes?.secuencial}</p>
                                        <p className="text-sm text-slate-600">Cobrador: {c.cobradores?.nombres}</p>
                                    </div>
                                    <p className="font-black text-primary-700">{formatCurrency(c.saldo_pendiente)}</p>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Paso 3: cobro */}
            {paso === 'cobro' && credito && (
                cargandoDetalle ? (
                    <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
                ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900">{credito.clientes?.nombre}</h2>
                                    <p className="text-sm text-slate-500">Factura {credito.comprobantes?.secuencial}</p>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Cobrador</label>
                                    <select
                                        value={credito.cobrador_id}
                                        disabled={cambiandoCobrador}
                                        onChange={e => handleCambiarCobrador(e.target.value)}
                                        className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-primary-500">
                                        {cobradores.map(c => <option key={c.id} value={c.id}>{c.nombres}</option>)}
                                    </select>
                                </div>
                            </div>

                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 border-y border-slate-200">
                                    <tr>
                                        <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Cuota</th>
                                        <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Vence</th>
                                        <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Días</th>
                                        <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Cuota</th>
                                        <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Mora</th>
                                        <th className="text-right px-3 py-2 text-xs font-semibold text-slate-500 uppercase">Saldo</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {cuotasParaCobro.map(c => {
                                        const mora = calcularMoraCuota(c, HOY, 0, 0) // solo referencial en pantalla; el real se calcula al grabar con la config de la empresa
                                        const aplicacion = previa?.aplicaciones.find(a => a.cuotaId === c.id)
                                        return (
                                            <tr key={c.id} className={aplicacion ? 'bg-emerald-50' : ''}>
                                                <td className="px-3 py-2">{c.numeroCuota}</td>
                                                <td className="px-3 py-2">{c.fechaVencimiento}</td>
                                                <td className="px-3 py-2 text-center">{mora.diasVencidos || '—'}</td>
                                                <td className="px-3 py-2 text-right">{formatCurrency(c.capitalProgramado + c.interesProgramado)}</td>
                                                <td className="px-3 py-2 text-right text-red-500">{mora.mora > 0 ? formatCurrency(mora.mora) : '—'}</td>
                                                <td className="px-3 py-2 text-right font-bold">
                                                    {formatCurrency(Math.max(0, (c.capitalProgramado + c.interesProgramado) - (c.capitalPagado + c.interesPagado)))}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                            <p className="text-[11px] text-slate-400 mt-2">La mora mostrada aquí es referencial (se recalcula con la tasa real de la empresa al grabar el cobro).</p>
                        </div>

                        {previa && previa.aplicaciones.length > 0 && (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                                <p className="text-xs font-bold text-emerald-700 uppercase tracking-widest mb-2">Vista previa de aplicación</p>
                                <div className="space-y-1 text-sm">
                                    {previa.aplicaciones.map(a => (
                                        <div key={a.cuotaId} className="flex justify-between text-emerald-800">
                                            <span>Cuota #{a.numeroCuota} {a.quedaSaldoEnCuota ? '(parcial)' : '(saldada)'}</span>
                                            <span className="font-bold">{formatCurrency(a.totalAplicado)}</span>
                                        </div>
                                    ))}
                                </div>
                                {previa.montoSobrante > 0 && (
                                    <p className="text-xs text-red-600 font-bold mt-2">⚠ Sobran {formatCurrency(previa.montoSobrante)} — no hay más cuotas pendientes para aplicar. Reduce el valor.</p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Panel de cobro */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4 h-fit">
                        <h2 className="font-bold text-slate-900 flex items-center gap-2"><Receipt className="w-4 h-4" /> Registrar cobro</h2>

                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Monto a cobrar</label>
                            <input type="number" min="0.01" step="0.01" value={montoCobrar || ''}
                                onChange={e => setMontoCobrar(parseFloat(e.target.value) || 0)}
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500 text-right font-bold text-lg" />
                        </div>

                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Forma de pago</label>
                            <select value={metodoPago} onChange={e => setMetodoPago(e.target.value as MetodoPagoCredito)}
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500">
                                {METODOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>

                        {metodoPago === 'transferencia' && (
                            <>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cuenta bancaria</label>
                                    <select value={cuentaBancariaId} onChange={e => setCuentaBancariaId(e.target.value)}
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500">
                                        <option value="">— Selecciona —</option>
                                        {cuentas.map(c => <option key={c.id} value={c.id}>{c.banco?.nombre} — {c.numero_cuenta}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest"># Papeleta de depósito</label>
                                    <input value={papeletaDeposito} onChange={e => setPapeletaDeposito(e.target.value)}
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500" />
                                </div>
                            </>
                        )}

                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">N° recibo externo (talonario físico)</label>
                            <input value={reciboExterno} onChange={e => setReciboExterno(e.target.value)}
                                placeholder="Opcional"
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500" />
                        </div>

                        <button onClick={handleRegistrarCobro} disabled={guardando || montoCobrar <= 0}
                            className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-40">
                            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            Registrar cobro
                        </button>

                        {reciboConfirmado != null && (
                            <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 text-center">
                                <p className="text-xs text-primary-600 uppercase tracking-widest font-bold">Recibo interno</p>
                                <p className="text-2xl font-black text-primary-700">#{reciboConfirmado}</p>
                                <p className="text-xs text-primary-500 mt-1">Saldo restante: {formatCurrency(credito.saldo_pendiente)}</p>
                            </div>
                        )}
                    </div>
                </div>
                )
            )}
        </div>
    )
}
