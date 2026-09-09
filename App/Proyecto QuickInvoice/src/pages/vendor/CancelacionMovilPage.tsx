import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { HelpButton } from '../../components/help/HelpButton'
import { supabase } from '../../lib/supabase'
import { facturacionService, type Cliente } from '../../services/facturacionService'
import { clienteCedulaService } from '../../services/clienteCedulaService'
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
import { ArrowLeft, Search, Loader2, MapPin, User, CheckCircle2, DollarSign, Printer } from 'lucide-react'

const HOY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' })

const METODOS: { value: MetodoPagoCredito; label: string }[] = [
    { value: 'efectivo', label: '💵 Efectivo' },
    { value: 'transferencia', label: '🏦 Depósito' },
    { value: 'tarjeta', label: '💳 Tarjeta' },
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

type Paso = 'cliente' | 'credito' | 'cobro'

function esc(s: string | null | undefined): string {
    if (!s) return ''
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function n2(n: number): string { return n.toFixed(2) }

interface DatosUltimoCobro {
    empresa: { nombre: string; ruc: string }
    clienteNombre: string
    clienteIdentificacion: string
    facturaSecuencial: string
    cobradorNombre: string
    reciboInterno: number
    reciboExterno: string | null
    fecha: string
    metodoPago: MetodoPagoCredito
    aplicaciones: { numeroCuota: number; moraAplicada: number; interesAplicado: number; capitalAplicado: number; totalAplicado: number }[]
    montoCobrado: number
    saldoRestante: number
}

// Ticket térmico de cobro — mismo patrón que generarHtml80mm en ProformaPage
// (Courier New, @page margin:0, body centrado con mx-auto para que la
// impresora térmica no corte el borde izquierdo), parametrizado a 56 o 80mm
// porque un cobrador en terreno puede traer cualquiera de las dos.
function generarTicketCobroMovil(d: DatosUltimoCobro, anchoMm: 56 | 80): string {
    const margen = 3
    const anchoContenido = anchoMm - margen * 2
    const fecha = new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-EC')
    const filas = d.aplicaciones.map(a => `
        <tr>
          <td class="c">${a.numeroCuota}</td>
          <td class="r">${a.moraAplicada > 0 ? n2(a.moraAplicada) : '—'}</td>
          <td class="r">${n2(a.interesAplicado)}</td>
          <td class="r">${n2(a.capitalAplicado)}</td>
          <td class="r b">${n2(a.totalAplicado)}</td>
        </tr>`).join('')

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Recibo ${d.reciboInterno}</title>
<style>
  @page{margin:0;size:${anchoMm}mm auto}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Courier New',Courier,monospace;font-size:7pt;font-weight:bold;color:#000;width:${anchoContenido}mm;margin:0 auto;padding:0}
  .c{text-align:center}
  .r{text-align:right}
  .b{font-weight:bold}
  .emp{font-size:8.5pt;font-weight:900;text-align:center}
  .sep{border:none;border-top:1px dashed #000;margin:4px 0}
  table{width:100%;border-collapse:collapse}
  td,th{vertical-align:top}
  th{border-bottom:1px dashed #000;padding:0 1px 2px;font-size:6.5pt;text-align:left}
  th.c{text-align:center}
  th.r{text-align:right}
  .tot-lbl{width:60%}
  .tot-val{width:40%;text-align:right;font-weight:bold}
  .gran-total td{border-top:1px solid #000;padding-top:3px;font-size:8.5pt;font-weight:900}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head>
<body>
<div class="emp">${esc(d.empresa.nombre)}</div>
<div class="c" style="font-size:6.5pt">RUC: ${esc(d.empresa.ruc)}</div>
<hr class="sep">
<div class="c b" style="font-size:8pt">RECIBO DE COBRO</div>
<div class="c b" style="font-size:7pt">N.º ${d.reciboInterno}</div>
${d.reciboExterno ? `<div class="c" style="font-size:6.5pt">Externo: ${esc(d.reciboExterno)}</div>` : ''}
<div class="c" style="font-size:6.5pt">Fecha: ${fecha}</div>
<hr class="sep">
<div><span class="b">Cliente:</span> ${esc(d.clienteNombre)}</div>
<div><span class="b">RUC/CI:</span> ${esc(d.clienteIdentificacion)}</div>
<div><span class="b">Factura:</span> ${esc(d.facturaSecuencial)}</div>
<div><span class="b">Cobrador:</span> ${esc(d.cobradorNombre)}</div>
<div><span class="b">Forma pago:</span> ${esc(METODO_LABEL_PLANO[d.metodoPago])}</div>
<hr class="sep">
<table>
  <thead>
    <tr>
      <th class="c">Cuota</th>
      <th class="r">Mora</th>
      <th class="r">Int.</th>
      <th class="r">Cap.</th>
      <th class="r">Total</th>
    </tr>
  </thead>
  <tbody>
    ${filas || '<tr><td colspan="5" style="text-align:center">Sin cuotas aplicadas</td></tr>'}
  </tbody>
</table>
<hr class="sep">
<table>
  <tr><td class="tot-lbl">Saldo restante</td><td class="tot-val">$${n2(d.saldoRestante)}</td></tr>
  <tr class="gran-total"><td class="tot-lbl">TOTAL COBRADO</td><td class="tot-val">$${n2(d.montoCobrado)}</td></tr>
</table>
<hr class="sep">
<div class="c" style="font-size:6.5pt">Recibo interno — Corina ERP</div>
<div class="c" style="font-size:6.5pt">${new Date().toLocaleDateString('es-EC')}</div>
<p>&nbsp;</p>
</body>
</html>`
}

function imprimirTicketCobroMovil(d: DatosUltimoCobro, anchoMm: 56 | 80) {
    const html = generarTicketCobroMovil(d, anchoMm)
    const win = window.open('', '_blank', 'width=500,height=700')
    if (win) {
        win.document.write(html)
        win.document.close()
        win.focus()
        setTimeout(() => { win.print() }, 450)
    }
}

export function CancelacionMovilPage() {
    const { empresa } = useAuth()
    const [paso, setPaso] = useState<Paso>('cliente')

    // Paso 1: cliente
    const [busqueda, setBusqueda] = useState('')
    const [clientesConDeuda, setClientesConDeuda] = useState<{ id: string; nombre: string; identificacion: string; saldoTotal: number }[]>([])
    const [buscando, setBuscando] = useState(false)

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
    const [clienteFull, setClienteFull] = useState<Cliente | null>(null)
    const [cedulaUrls, setCedulaUrls] = useState<{ 1?: string; 2?: string }>({})
    const [cargandoDetalle, setCargandoDetalle] = useState(false)
    const [cobradores, setCobradores] = useState<Cobrador[]>([])
    const [cuentas, setCuentas] = useState<CuentaBancaria[]>([])
    const [capturandoGeo, setCapturandoGeo] = useState(false)

    async function elegirCredito(id: string) {
        setCargandoDetalle(true)
        try {
            const completo = await creditoElectrodomesticosService.getCompleto(id)
            const [cobs, cts, clienteRow] = await Promise.all([
                cobradorService.getCobradoresActivos(empresa!.id),
                cuentasBancariasService.listar(empresa!.id).catch(() => []),
                supabase.from('clientes').select('*').eq('id', completo.cliente_id).single(),
            ])
            setCredito(completo)
            setCobradores(cobs)
            setCuentas(cts)
            const cliente = (clienteRow.data as Cliente) ?? null
            setClienteFull(cliente)
            const urls: { 1?: string; 2?: string } = {}
            if (cliente?.cedula_imagen1_path) urls[1] = await clienteCedulaService.urlFirmada(cliente.cedula_imagen1_path).catch(() => undefined)
            if (cliente?.cedula_imagen2_path) urls[2] = await clienteCedulaService.urlFirmada(cliente.cedula_imagen2_path).catch(() => undefined)
            setCedulaUrls(urls)
            setPaso('cobro')
        } finally { setCargandoDetalle(false) }
    }

    async function handleCapturarUbicacion() {
        if (!clienteFull?.id) return
        if (!navigator.geolocation) { alert('Este dispositivo/navegador no soporta geolocalización.'); return }
        setCapturandoGeo(true)
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                try {
                    const geo_latitud = pos.coords.latitude
                    const geo_longitud = pos.coords.longitude
                    const geo_capturada_at = new Date().toISOString()
                    await facturacionService.updateCliente(clienteFull.id, { geo_latitud, geo_longitud, geo_capturada_at })
                    setClienteFull(prev => prev ? { ...prev, geo_latitud, geo_longitud, geo_capturada_at } : prev)
                } catch (e: any) {
                    alert('Error al guardar la ubicación: ' + e.message)
                } finally {
                    setCapturandoGeo(false)
                }
            },
            (err) => {
                alert('No se pudo obtener la ubicación: ' + err.message)
                setCapturandoGeo(false)
            },
            { enableHighAccuracy: true, timeout: 15000 }
        )
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
    const [reciboExterno, setReciboExterno] = useState('')
    const [cambiandoCobrador, setCambiandoCobrador] = useState(false)
    const [guardando, setGuardando] = useState(false)
    const [reciboConfirmado, setReciboConfirmado] = useState<number | null>(null)
    const [ultimoCobro, setUltimoCobro] = useState<DatosUltimoCobro | null>(null)

    const previa: ResultadoDistribucionPago | null = credito && montoCobrar > 0
        ? distribuirPagoCuotas(cuotasParaCobro, montoCobrar, HOY, 0, 0)
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
                reciboExterno: reciboExterno || null,
            })
            setReciboConfirmado(r.reciboInterno)
            const actualizado = await creditoElectrodomesticosService.getCompleto(credito.id)
            setCredito(actualizado)
            setUltimoCobro({
                empresa: { nombre: empresa!.nombre, ruc: empresa!.ruc },
                clienteNombre: actualizado.clientes?.nombre ?? '',
                clienteIdentificacion: actualizado.clientes?.identificacion ?? '',
                facturaSecuencial: actualizado.comprobantes?.secuencial ?? '',
                cobradorNombre: actualizado.cobradores?.nombres ?? '',
                reciboInterno: r.reciboInterno,
                reciboExterno: reciboExterno || null,
                fecha: HOY,
                metodoPago,
                aplicaciones: r.distribucion.aplicaciones,
                montoCobrado: montoCobrar,
                saldoRestante: actualizado.saldo_pendiente,
            })
            setMontoCobrar(0)
        } catch (e: any) {
            alert('Error al registrar el cobro: ' + e.message)
        } finally {
            setGuardando(false)
        }
    }

    function reiniciar() {
        setPaso('cliente')
        setCredito(null)
        setClienteFull(null)
        setCedulaUrls({})
        setBusqueda('')
        setClientesConDeuda([])
        setCreditos([])
        setReciboConfirmado(null)
        setUltimoCobro(null)
        setMontoCobrar(0)
    }

    return (
        <div className="max-w-md mx-auto space-y-4 pb-8">
            <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <DollarSign className="w-6 h-6 text-primary-600" /> Cobros Móvil
                </h1>
                <HelpButton pageKey="cancelacion-movil" />
            </div>

            {paso !== 'cliente' && (
                <button onClick={reiniciar} className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                    <ArrowLeft className="w-4 h-4" /> Buscar otro cliente
                </button>
            )}

            {/* Paso 1: cliente */}
            {paso === 'cliente' && (
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
                    <h2 className="font-bold text-slate-900 text-sm">Buscar cliente con deuda</h2>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            placeholder="Nombre o cédula…"
                            value={busqueda}
                            onChange={e => setBusqueda(e.target.value)}
                            className="w-full pl-10 pr-4 py-3.5 text-base rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-400"
                        />
                        {buscando && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-slate-300" />}
                    </div>
                    {clientesConDeuda.length > 0 && (
                        <div className="border border-slate-200 rounded-xl divide-y divide-slate-50">
                            {clientesConDeuda.map(c => (
                                <button key={c.id} onClick={() => elegirCliente(c.id)}
                                    className="w-full text-left px-4 py-3.5 active:bg-slate-100 flex items-center justify-between">
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
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
                    <h2 className="font-bold text-slate-900 text-sm">Créditos con saldo pendiente</h2>
                    {cargandoCreditos ? (
                        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
                    ) : (
                        <div className="border border-slate-200 rounded-xl divide-y divide-slate-50">
                            {creditos.map(c => (
                                <button key={c.id} onClick={() => elegirCredito(c.id)}
                                    className="w-full text-left px-4 py-3.5 active:bg-slate-100 flex items-center justify-between">
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
                <div className="space-y-4">
                    {/* Cliente + foto de cédula */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                        <div className="flex gap-3">
                            <div className="w-20 h-20 shrink-0 rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center">
                                {cedulaUrls[1]
                                    ? <img src={cedulaUrls[1]} alt="Cédula" className="w-full h-full object-cover" />
                                    : <User className="w-8 h-8 text-slate-300" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-slate-900 leading-tight">{credito.clientes?.nombre}</p>
                                <p className="text-xs text-slate-400">{credito.clientes?.identificacion}</p>
                                <p className="text-xs text-slate-400 font-mono mt-0.5">Factura {credito.comprobantes?.secuencial}</p>
                                {clienteFull?.direccion && <p className="text-xs text-slate-500 mt-1">{clienteFull.direccion}</p>}
                            </div>
                        </div>

                        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                            <div className="text-xs text-slate-500 flex items-center gap-1.5 min-w-0">
                                <MapPin className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                                {clienteFull?.geo_latitud != null ? (
                                    <a href={`https://www.google.com/maps?q=${clienteFull.geo_latitud},${clienteFull.geo_longitud}`}
                                        target="_blank" rel="noopener noreferrer" className="text-primary-600 font-semibold underline truncate">
                                        Ver ubicación guardada
                                    </a>
                                ) : (
                                    <span className="text-slate-400">Sin ubicación capturada</span>
                                )}
                            </div>
                            <button type="button" onClick={handleCapturarUbicacion} disabled={capturandoGeo}
                                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold disabled:opacity-50">
                                {capturandoGeo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MapPin className="w-3.5 h-3.5" />}
                                {clienteFull?.geo_latitud != null ? 'Actualizar' : 'Capturar aquí'}
                            </button>
                        </div>
                    </div>

                    {/* Cobrador */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Cobrador</label>
                        <select
                            value={credito.cobrador_id}
                            disabled={cambiandoCobrador}
                            onChange={e => handleCambiarCobrador(e.target.value)}
                            className="w-full px-3 py-2.5 rounded-lg border border-slate-300 text-sm outline-none focus:ring-2 focus:ring-primary-500">
                            {cobradores.map(c => <option key={c.id} value={c.id}>{c.nombres}</option>)}
                        </select>
                    </div>

                    {/* Cuotas (compacto) */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                        <h2 className="font-bold text-slate-900 text-sm mb-2">Cuotas pendientes</h2>
                        <div className="space-y-1.5">
                            {cuotasParaCobro.map(c => {
                                const mora = calcularMoraCuota(c, HOY, 0, 0)
                                const aplicacion = previa?.aplicaciones.find(a => a.cuotaId === c.id)
                                const saldo = Math.max(0, (c.capitalProgramado + c.interesProgramado) - (c.capitalPagado + c.interesPagado))
                                return (
                                    <div key={c.id} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${aplicacion ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                                        <div>
                                            <span className="font-bold">#{c.numeroCuota}</span>
                                            <span className="text-slate-400 text-xs ml-2">{c.fechaVencimiento}</span>
                                            {mora.diasVencidos > 0 && <span className="text-red-500 text-xs ml-2">{mora.diasVencidos}d venc.</span>}
                                        </div>
                                        <span className="font-bold">{formatCurrency(saldo)}</span>
                                    </div>
                                )
                            })}
                        </div>
                        {previa && previa.montoSobrante > 0 && (
                            <p className="text-xs text-red-600 font-bold mt-2">⚠ Sobran {formatCurrency(previa.montoSobrante)} — reduce el valor.</p>
                        )}
                    </div>

                    {/* Cobro */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
                        <div>
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Monto a cobrar</label>
                            <input type="number" inputMode="decimal" min="0.01" step="0.01" value={montoCobrar || ''}
                                onChange={e => setMontoCobrar(parseFloat(e.target.value) || 0)}
                                className="w-full px-4 py-3 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500 text-right font-black text-2xl" />
                        </div>

                        <div className="grid grid-cols-4 gap-1.5">
                            {METODOS.map(m => (
                                <button key={m.value} type="button" onClick={() => setMetodoPago(m.value)}
                                    className={`py-2.5 rounded-lg text-xs font-bold border ${metodoPago === m.value ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-slate-500 border-slate-200'}`}>
                                    {m.label}
                                </button>
                            ))}
                        </div>

                        {metodoPago === 'transferencia' && (
                            <select value={cuentaBancariaId} onChange={e => setCuentaBancariaId(e.target.value)}
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500 text-sm">
                                <option value="">— Cuenta bancaria —</option>
                                {cuentas.map(c => <option key={c.id} value={c.id}>{c.banco?.nombre} — {c.numero_cuenta}</option>)}
                            </select>
                        )}

                        <input value={reciboExterno} onChange={e => setReciboExterno(e.target.value)}
                            placeholder="N° recibo externo (opcional)"
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500 text-sm" />

                        <button onClick={handleRegistrarCobro} disabled={guardando || montoCobrar <= 0}
                            className="w-full flex items-center justify-center gap-2 py-4 bg-emerald-600 text-white rounded-xl font-bold text-base hover:bg-emerald-700 disabled:opacity-40">
                            {guardando ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                            Cobrar {montoCobrar > 0 ? formatCurrency(montoCobrar) : ''}
                        </button>

                        {reciboConfirmado != null && ultimoCobro && (
                            <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 text-center space-y-3">
                                <div>
                                    <p className="text-xs text-primary-600 uppercase tracking-widest font-bold">Recibo interno</p>
                                    <p className="text-2xl font-black text-primary-700">#{reciboConfirmado}</p>
                                    <p className="text-xs text-primary-500 mt-1">Saldo restante: {formatCurrency(credito.saldo_pendiente)}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <button type="button" onClick={() => imprimirTicketCobroMovil(ultimoCobro, 56)}
                                        className="flex items-center justify-center gap-1.5 py-2.5 bg-white border border-primary-300 text-primary-700 rounded-lg text-xs font-bold">
                                        <Printer className="w-3.5 h-3.5" /> Ticket 56mm
                                    </button>
                                    <button type="button" onClick={() => imprimirTicketCobroMovil(ultimoCobro, 80)}
                                        className="flex items-center justify-center gap-1.5 py-2.5 bg-white border border-primary-300 text-primary-700 rounded-lg text-xs font-bold">
                                        <Printer className="w-3.5 h-3.5" /> Ticket 80mm
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                )
            )}
        </div>
    )
}
