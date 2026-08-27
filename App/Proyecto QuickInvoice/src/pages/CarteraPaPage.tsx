import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { ventaPaService, type SaldoPaCliente } from '../services/ventaPaService'
import { cuentasBancariasService } from '../services/finance/bancosService'
import type { CuentaBancaria } from '../types/finance'
import { formatCurrency } from '../lib/utils'
import { HelpButton } from '../components/help/HelpButton'
import { Wallet, Loader2, AlertCircle, CheckCircle2, X, Send } from 'lucide-react'

const METODOS = [
    { value: 'efectivo', label: 'Efectivo' },
    { value: 'transferencia', label: 'Transferencia' },
    { value: 'tarjeta', label: 'Tarjeta D/C' },
    { value: 'cheque', label: 'Cheque' },
    { value: 'otros', label: 'Otros' },
]

// ─── Comprobante de abono (80mm, no tributario) ──────────────────────────────

function esc(s: string | null | undefined): string {
    if (!s) return ''
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function n2(n: number): string { return (n ?? 0).toFixed(2) }

interface DatosComprobantePA {
    empresa: { nombre: string; ruc: string; logo_url?: string | null }
    cliente: { nombre: string; identificacion: string }
    valor: number
    metodoPago: string
    referencia?: string
    cuentaBancariaNombre?: string
    numeroDocumento?: string
    observaciones?: string
    saldoAntes: number
    saldoDespues: number
    totalAcumulado: number
}

function generarHtml80mmAbonoPa(d: DatosComprobantePA): string {
    const fecha = new Date().toLocaleString('es-EC')
    const metodoLabel = METODOS.find(m => m.value === d.metodoPago)?.label ?? d.metodoPago
    const logoHtml = d.empresa.logo_url
        ? `<div class="c" style="margin-bottom:4px"><img src="${esc(d.empresa.logo_url)}" alt="Logo" style="width:60mm;max-height:35mm;object-fit:contain"></div>`
        : ''

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Comprobante de abono</title>
<style>
  @page{margin:0;size:80mm auto}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Courier New',Courier,monospace;font-size:8pt;color:#000;width:72mm;padding-left:2mm}
  .c{text-align:center}
  .b{font-weight:bold}
  .emp{font-size:10.5pt;font-weight:900;text-align:center}
  .sep{border:none;border-top:1px dashed #000;margin:4px 0}
  table{width:100%;border-collapse:collapse}
  td{vertical-align:top;padding:1.5px 0}
  .lbl{width:55%}
  .val{width:45%;text-align:right;font-weight:bold}
  .gran{border-top:1px solid #000;padding-top:3px;font-size:9.5pt;font-weight:900}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head>
<body>
${logoHtml}
<div class="emp">${esc(d.empresa.nombre)}</div>
<div class="c" style="font-size:7.5pt">RUC: ${esc(d.empresa.ruc)}</div>
<hr class="sep">
<div class="c b" style="font-size:9pt">COMPROBANTE DE ABONO</div>
<div class="c b" style="font-size:8pt">PLAN ACUMULATIVO</div>
<div class="c" style="font-size:7.5pt">${esc(fecha)}</div>
<hr class="sep">
<div><span class="b">Cliente:</span> ${esc(d.cliente.nombre)}</div>
<div><span class="b">RUC/CI:</span> ${esc(d.cliente.identificacion)}</div>
<hr class="sep">
<table>
  <tr><td class="lbl">Forma de pago</td><td class="val">${esc(metodoLabel)}</td></tr>
  ${d.referencia ? `<tr><td class="lbl">Referencia</td><td class="val">${esc(d.referencia)}</td></tr>` : ''}
  ${d.cuentaBancariaNombre ? `<tr><td class="lbl">Cuenta destino</td><td class="val">${esc(d.cuentaBancariaNombre)}</td></tr>` : ''}
  ${d.numeroDocumento ? `<tr><td class="lbl">N° comprobante</td><td class="val">${esc(d.numeroDocumento)}</td></tr>` : ''}
  ${d.observaciones ? `<tr><td class="lbl">Obs.</td><td class="val">${esc(d.observaciones)}</td></tr>` : ''}
</table>
<hr class="sep">
<table>
  <tr><td class="lbl">Total acumulado</td><td class="val">$${n2(d.totalAcumulado)}</td></tr>
  <tr><td class="lbl">Saldo anterior</td><td class="val">$${n2(d.saldoAntes)}</td></tr>
  <tr class="gran"><td class="lbl">ABONO</td><td class="val">$${n2(d.valor)}</td></tr>
  <tr><td class="lbl">Saldo restante</td><td class="val">$${n2(d.saldoDespues)}</td></tr>
</table>
<hr class="sep">
${d.saldoDespues <= 0.01
        ? `<div class="c b" style="font-size:7.5pt">Saldo cancelado — ya se puede facturar</div>`
        : ''}
<div class="c" style="font-size:7pt">Comprobante interno — no es un documento tributario.</div>
<div class="c" style="font-size:7pt">La factura electrónica se emite al cancelar el saldo total.</div>
</body>
</html>`
}

export function CarteraPaPage() {
    const { empresa, cajaSesion, profile } = useAuth()

    const [clientes, setClientes] = useState<SaldoPaCliente[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    const [cuentasBancarias, setCuentasBancarias] = useState<CuentaBancaria[]>([])

    const [pagoModal, setPagoModal] = useState<SaldoPaCliente | null>(null)
    const [valorPago, setValorPago] = useState('')
    const [metodoPago, setMetodoPago] = useState('efectivo')
    const [referenciaPago, setReferenciaPago] = useState('')
    const [cuentaBancariaId, setCuentaBancariaId] = useState('')
    const [numeroDocumento, setNumeroDocumento] = useState('')
    const [observacionesPago, setObservacionesPago] = useState('')
    const [guardandoPago, setGuardandoPago] = useState(false)

    const [facturando, setFacturando] = useState<string | null>(null)

    const cargar = useCallback(async () => {
        if (!empresa?.id) return
        setLoading(true); setError('')
        try {
            setClientes(await ventaPaService.listarClientesConSaldo(empresa.id))
        } catch (e: any) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }, [empresa?.id])

    useEffect(() => { cargar() }, [cargar])

    useEffect(() => {
        if (!empresa?.id) return
        cuentasBancariasService.listar(empresa.id).catch(() => [] as CuentaBancaria[]).then(setCuentasBancarias)
    }, [empresa?.id])

    function abrirModalPago(c: SaldoPaCliente) {
        setPagoModal(c)
        setValorPago(c.saldo.toFixed(2))
        setMetodoPago('efectivo')
        setReferenciaPago('')
        setCuentaBancariaId('')
        setNumeroDocumento('')
        setObservacionesPago('')
    }

    function imprimirComprobantePago(d: DatosComprobantePA) {
        const html = generarHtml80mmAbonoPa(d)
        const win = window.open('', '_blank', 'width=900,height=700')
        if (win) {
            win.document.write(html)
            win.document.close()
            win.focus()
            setTimeout(() => { win.print() }, 450)
        }
    }

    async function handleRegistrarPago() {
        if (!pagoModal || !empresa?.id) return
        const valor = parseFloat(valorPago) || 0
        if (valor <= 0) { alert('Ingrese un valor de pago válido'); return }

        setGuardandoPago(true)
        try {
            const { saldoDespues, listoParaConsolidar } = await ventaPaService.registrarPago({
                empresa_id: empresa.id,
                cliente_id: pagoModal.cliente_id,
                valor,
                metodo_pago: metodoPago,
                referencia: referenciaPago || undefined,
                cuenta_bancaria_id: metodoPago === 'transferencia' ? (cuentaBancariaId || null) : null,
                numero_documento: metodoPago === 'transferencia' ? (numeroDocumento || null) : null,
                observaciones: metodoPago === 'transferencia' ? (observacionesPago || null) : null,
                created_by: profile?.id ?? null,
            })

            const cuentaSeleccionada = cuentasBancarias.find(cb => cb.id === cuentaBancariaId)
            imprimirComprobantePago({
                empresa: { nombre: empresa.nombre, ruc: empresa.ruc, logo_url: empresa.logo_url },
                cliente: { nombre: pagoModal.nombre, identificacion: pagoModal.identificacion },
                valor,
                metodoPago,
                referencia: metodoPago !== 'transferencia' ? (referenciaPago || undefined) : undefined,
                cuentaBancariaNombre: metodoPago === 'transferencia' && cuentaSeleccionada
                    ? `${cuentaSeleccionada.banco?.nombre ?? ''} — ${cuentaSeleccionada.numero_cuenta}` : undefined,
                numeroDocumento: metodoPago === 'transferencia' ? (numeroDocumento || undefined) : undefined,
                observaciones: metodoPago === 'transferencia' ? (observacionesPago || undefined) : undefined,
                saldoAntes: pagoModal.saldo,
                saldoDespues,
                totalAcumulado: pagoModal.total_acumulado,
            })

            setPagoModal(null)
            await cargar()
            if (listoParaConsolidar) {
                alert(`✅ Pago registrado. ${pagoModal.nombre} canceló el 100% del saldo — ya se puede facturar desde el botón "Facturar".`)
            }
        } catch (e: any) {
            alert('Error: ' + e.message)
        } finally {
            setGuardandoPago(false)
        }
    }

    async function handleFacturar(c: SaldoPaCliente) {
        if (!empresa?.id) return
        if (!cajaSesion) { alert('No hay una caja abierta. Abra caja primero.'); return }
        if (!confirm(`¿Consolidar y facturar todo lo acumulado de ${c.nombre}? Se generará una sola factura electrónica con fecha de hoy.`)) return

        setFacturando(c.cliente_id)
        try {
            const factura = await ventaPaService.consolidarYFacturar({
                empresa_id: empresa.id,
                cliente_id: c.cliente_id,
                caja_sesion_id: cajaSesion.id,
                created_by: profile?.id ?? null,
            })
            alert(`✅ Factura ${factura.secuencial ?? ''} generada. Revísela en Facturación → Comprobantes.`)
            await cargar()
        } catch (e: any) {
            alert('Error al facturar: ' + e.message)
        } finally {
            setFacturando(null)
        }
    }

    return (
        <div className="max-w-4xl space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-amber-100 flex items-center justify-center">
                    <Wallet className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-slate-900">Cartera — Plan Acumulativo (PA)</h1>
                    <p className="text-sm text-slate-500">
                        Ventas acumuladas sin factura todavía. Se factura automáticamente al cancelar el 100% del saldo.
                    </p>
                </div>
                <HelpButton pageKey="cartera-pa" />
            </div>

            {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
                </div>
            )}

            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
                    </div>
                ) : clientes.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-sm">
                        Ningún cliente tiene saldo pendiente en Plan Acumulativo.
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                            <tr>
                                <th className="text-left py-2 px-3">Cliente</th>
                                <th className="text-right py-2 px-3">Acumulado</th>
                                <th className="text-right py-2 px-3">Pagado</th>
                                <th className="text-right py-2 px-3">Saldo</th>
                                <th className="text-right py-2 px-3">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {clientes.map(c => {
                                const listo = c.saldo <= 0.01
                                return (
                                    <tr key={c.cliente_id}>
                                        <td className="py-2 px-3">
                                            <p className="font-medium text-slate-800">{c.nombre}</p>
                                            <p className="text-xs text-slate-400 font-mono">{c.identificacion}</p>
                                        </td>
                                        <td className="py-2 px-3 text-right font-mono">{formatCurrency(c.total_acumulado)}</td>
                                        <td className="py-2 px-3 text-right font-mono text-emerald-600">{formatCurrency(c.total_pagado)}</td>
                                        <td className="py-2 px-3 text-right font-mono font-bold text-amber-700">{formatCurrency(c.saldo)}</td>
                                        <td className="py-2 px-3 text-right whitespace-nowrap">
                                            {!listo && (
                                                <button onClick={() => abrirModalPago(c)}
                                                    className="btn btn-primary btn-sm mr-1.5">
                                                    Registrar pago
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleFacturar(c)}
                                                disabled={!listo || facturando === c.cliente_id}
                                                title={listo ? 'Consolidar y facturar' : 'Solo se puede facturar cuando el saldo llega a $0'}
                                                className="btn btn-sm flex items-center gap-1 disabled:opacity-40 bg-emerald-600 text-white hover:bg-emerald-700 inline-flex"
                                            >
                                                {facturando === c.cliente_id
                                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    : <CheckCircle2 className="w-3.5 h-3.5" />}
                                                Facturar
                                            </button>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {pagoModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-slate-900">Registrar pago — {pagoModal.nombre}</h3>
                            <button onClick={() => setPagoModal(null)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <p className="text-sm text-slate-500">
                            Saldo pendiente: <span className="font-bold text-amber-700">{formatCurrency(pagoModal.saldo)}</span>
                        </p>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-500 uppercase">Valor a pagar</label>
                            <input type="number" min="0.01" max={pagoModal.saldo} step="0.01"
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500"
                                value={valorPago} onChange={e => setValorPago(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-500 uppercase">Forma de pago</label>
                            <select className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-primary-500"
                                value={metodoPago} onChange={e => setMetodoPago(e.target.value)}>
                                {METODOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                        </div>
                        {metodoPago === 'transferencia' ? (
                            <>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-500 uppercase">Cuenta bancaria destino</label>
                                    <select className="w-full px-3 py-2 border border-blue-200 bg-blue-50 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400 text-blue-900"
                                        value={cuentaBancariaId} onChange={e => setCuentaBancariaId(e.target.value)}>
                                        <option value="">🏦 Cuenta bancaria destino…</option>
                                        {cuentasBancarias.map(cb => (
                                            <option key={cb.id} value={cb.id}>{cb.banco?.nombre} — {cb.numero_cuenta}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-slate-500 uppercase">N° comprobante</label>
                                        <input type="text" className="w-full px-3 py-2 border border-blue-200 bg-blue-50 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400 text-blue-900"
                                            value={numeroDocumento} onChange={e => setNumeroDocumento(e.target.value)} />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-semibold text-slate-500 uppercase">Observaciones</label>
                                        <input type="text" className="w-full px-3 py-2 border border-blue-200 bg-blue-50 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400 text-blue-900"
                                            value={observacionesPago} onChange={e => setObservacionesPago(e.target.value)} />
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-slate-500 uppercase">Referencia (opcional)</label>
                                <input type="text" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500"
                                    value={referenciaPago} onChange={e => setReferenciaPago(e.target.value)} />
                            </div>
                        )}
                        <button onClick={handleRegistrarPago} disabled={guardandoPago}
                            className="btn btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
                            {guardandoPago ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : <><Send className="w-4 h-4" /> Registrar pago</>}
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
