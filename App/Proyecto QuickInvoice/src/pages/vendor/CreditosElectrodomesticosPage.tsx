import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { HelpButton } from '../../components/help/HelpButton'
import {
    creditoElectrodomesticosService,
    type CreditoElectrodomesticos,
    type CuotaCredito,
    type EstadoCredito,
    type MetodoPagoCredito,
} from '../../services/creditoElectrodomesticosService'
import { formatCurrency } from '../../lib/utils'
import { ArrowLeft, DollarSign, Loader2, RotateCcw, Home } from 'lucide-react'

const ESTADO_BADGE: Record<EstadoCredito, string> = {
    CALCULADO: 'bg-slate-100 text-slate-600',
    VIGENTE: 'bg-blue-100 text-blue-700',
    EN_MORA: 'bg-red-100 text-red-700',
    LIQUIDADO: 'bg-emerald-100 text-emerald-700',
    ANULADO: 'bg-slate-200 text-slate-500 line-through',
}

const CUOTA_BADGE: Record<CuotaCredito['estado'], string> = {
    PENDIENTE: 'bg-slate-100 text-slate-600',
    PARCIAL: 'bg-amber-100 text-amber-700',
    PAGADA: 'bg-emerald-100 text-emerald-700',
    VENCIDA: 'bg-red-100 text-red-700',
    ANULADA: 'bg-slate-200 text-slate-400 line-through',
}

const METODOS_PAGO_CUOTA: { value: MetodoPagoCredito; label: string }[] = [
    { value: 'efectivo', label: '💵 Efectivo' },
    { value: 'transferencia', label: '🏦 Transferencia' },
    { value: 'tarjeta', label: '💳 Tarjeta' },
    { value: 'cheque', label: '✏️ Cheque' },
    { value: 'otros', label: '🔄 Otros' },
]

export function CreditosElectrodomesticosPage() {
    const { empresa } = useAuth()
    const [creditos, setCreditos] = useState<CreditoElectrodomesticos[]>([])
    const [loading, setLoading] = useState(true)
    const [filtro, setFiltro] = useState<EstadoCredito | ''>('')
    const [seleccionado, setSeleccionado] = useState<CreditoElectrodomesticos | null>(null)
    const [cargandoDetalle, setCargandoDetalle] = useState(false)

    useEffect(() => {
        if (empresa?.id) cargar()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [empresa?.id, filtro])

    async function cargar() {
        try {
            setLoading(true)
            const data = await creditoElectrodomesticosService.listar(empresa!.id, filtro || undefined)
            setCreditos(data)
        } catch (e: any) {
            alert('Error al cargar créditos: ' + e.message)
        } finally {
            setLoading(false)
        }
    }

    async function abrir(id: string) {
        try {
            setCargandoDetalle(true)
            const completo = await creditoElectrodomesticosService.getCompleto(id)
            setSeleccionado(completo)
        } catch (e: any) {
            alert('Error al abrir el crédito: ' + e.message)
        } finally {
            setCargandoDetalle(false)
        }
    }

    async function refrescarSeleccionado() {
        if (!seleccionado) return
        const completo = await creditoElectrodomesticosService.getCompleto(seleccionado.id)
        setSeleccionado(completo)
        cargar()
    }

    if (seleccionado) {
        return (
            <DetalleCredito
                credito={seleccionado}
                onVolver={() => { setSeleccionado(null); cargar() }}
                onRefrescar={refrescarSeleccionado}
            />
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
                        <Home className="w-7 h-7 text-primary-600" /> Créditos de Electrodomésticos
                    </h1>
                    <p className="text-slate-600 mt-1">Ventas a crédito con cuotas fijas, cobrador y garante</p>
                </div>
                <HelpButton pageKey="credito-electrodomesticos" />
            </div>

            <div className="flex gap-2">
                {(['', 'CALCULADO', 'VIGENTE', 'EN_MORA', 'LIQUIDADO', 'ANULADO'] as const).map(f => (
                    <button key={f} onClick={() => setFiltro(f)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            filtro === f ? 'bg-primary-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}>
                        {f === '' ? 'Todos' : f.replace('_', ' ')}
                    </button>
                ))}
            </div>

            <div className="card overflow-hidden">
                {loading || cargandoDetalle ? (
                    <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Factura</th>
                                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Cliente</th>
                                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Cobrador</th>
                                <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Financiado</th>
                                <th className="text-right px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Saldo</th>
                                <th className="text-center px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {creditos.map(c => (
                                <tr key={c.id} onClick={() => abrir(c.id)} className="hover:bg-slate-50 cursor-pointer">
                                    <td className="px-6 py-4 font-mono text-xs text-slate-600">{c.comprobantes?.secuencial || '—'}</td>
                                    <td className="px-6 py-4 font-medium text-slate-900">{c.clientes?.nombre}</td>
                                    <td className="px-6 py-4 text-slate-600">{c.cobradores?.nombres}</td>
                                    <td className="px-6 py-4 text-right text-slate-700">{formatCurrency(c.total_financiado)}</td>
                                    <td className="px-6 py-4 text-right font-bold text-slate-900">{formatCurrency(c.saldo_pendiente)}</td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${ESTADO_BADGE[c.estado]}`}>{c.estado}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
                {!loading && !cargandoDetalle && creditos.length === 0 && (
                    <div className="text-center py-16">
                        <Home className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500">No hay créditos de electrodomésticos registrados{filtro ? ` en estado ${filtro}` : ''}.</p>
                    </div>
                )}
            </div>
        </div>
    )
}

// ── Detalle + cobro de cuotas ────────────────────────────────────────────
function DetalleCredito({ credito, onVolver, onRefrescar }: {
    credito: CreditoElectrodomesticos
    onVolver: () => void
    onRefrescar: () => void
}) {
    const [cuotaPagando, setCuotaPagando] = useState<CuotaCredito | null>(null)
    const [valorPago, setValorPago] = useState(0)
    const [metodoPago, setMetodoPago] = useState<MetodoPagoCredito>('efectivo')
    const [referencia, setReferencia] = useState('')
    const [guardando, setGuardando] = useState(false)

    function abrirPago(cuota: CuotaCredito) {
        setCuotaPagando(cuota)
        setValorPago(cuota.saldo_pendiente)
        setMetodoPago('efectivo')
        setReferencia('')
    }

    async function confirmarPago() {
        if (!cuotaPagando) return
        if (valorPago <= 0) { alert('El valor debe ser mayor a cero'); return }
        if (valorPago > cuotaPagando.saldo_pendiente + 0.01) {
            alert(`El valor no puede superar el saldo pendiente de la cuota (${formatCurrency(cuotaPagando.saldo_pendiente)}).`)
            return
        }
        try {
            setGuardando(true)
            await creditoElectrodomesticosService.registrarPago({
                cuotaId: cuotaPagando.id,
                creditoId: credito.id,
                empresaId: credito.empresa_id,
                valor: valorPago,
                metodoPago,
                referencia: referencia || undefined,
            })
            setCuotaPagando(null)
            onRefrescar()
        } catch (e: any) {
            alert('Error al registrar el pago: ' + e.message)
        } finally {
            setGuardando(false)
        }
    }

    async function reversar(cuota: CuotaCredito) {
        const pagos = await creditoElectrodomesticosService.getPagosDeCuota(cuota.id)
        const ultimoActivo = pagos.find(p => p.estado === 'activo')
        if (!ultimoActivo) { alert('No hay un pago activo para reversar en esta cuota.'); return }
        const motivo = prompt(`¿Reversar el pago de ${formatCurrency(ultimoActivo.valor)} del ${ultimoActivo.fecha_pago}? Escribe el motivo:`)
        if (motivo === null) return
        try {
            await creditoElectrodomesticosService.reversarPago(ultimoActivo.id, motivo || undefined)
            onRefrescar()
        } catch (e: any) {
            alert('Error al reversar: ' + e.message)
        }
    }

    return (
        <div className="space-y-6">
            <button onClick={onVolver} className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700">
                <ArrowLeft className="w-4 h-4" /> Volver al listado
            </button>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">{credito.clientes?.nombre}</h1>
                        <p className="text-sm text-slate-500">Factura {credito.comprobantes?.secuencial || '—'} · Cobrador: {credito.cobradores?.nombres}</p>
                        {credito.garante && <p className="text-sm text-slate-500">Garante: {credito.garante.nombre} ({credito.garante.identificacion})</p>}
                    </div>
                    <span className={`inline-flex px-3 py-1 rounded-full text-sm font-bold ${ESTADO_BADGE[credito.estado]}`}>{credito.estado}</span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div><p className="text-slate-400 text-xs uppercase tracking-wide">Precio de contado</p><p className="font-bold text-slate-900">{formatCurrency(credito.total_factura)}</p></div>
                    <div><p className="text-slate-400 text-xs uppercase tracking-wide">Entrada</p><p className="font-bold text-slate-900">{formatCurrency(credito.valor_entrada)}</p></div>
                    <div><p className="text-slate-400 text-xs uppercase tracking-wide">Total financiado</p><p className="font-bold text-slate-900">{formatCurrency(credito.total_financiado)}</p></div>
                    <div><p className="text-slate-400 text-xs uppercase tracking-wide">Saldo pendiente</p><p className="font-black text-primary-700 text-lg">{formatCurrency(credito.saldo_pendiente)}</p></div>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100"><h2 className="font-bold text-slate-900">Cronograma de cuotas</h2></div>
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">#</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Vencimiento</th>
                            <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Cuota</th>
                            <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Pagado</th>
                            <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Saldo</th>
                            <th className="text-center px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase">Estado</th>
                            <th className="px-4 py-2.5" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {credito.cuotas?.map(c => (
                            <tr key={c.id} className="hover:bg-slate-50">
                                <td className="px-4 py-2.5">{c.numero_cuota}</td>
                                <td className="px-4 py-2.5">{c.fecha_vencimiento}</td>
                                <td className="px-4 py-2.5 text-right font-semibold">{formatCurrency(c.cuota_programada)}</td>
                                <td className="px-4 py-2.5 text-right text-emerald-600">{formatCurrency(c.total_pagado)}</td>
                                <td className="px-4 py-2.5 text-right font-bold">{formatCurrency(c.saldo_pendiente)}</td>
                                <td className="px-4 py-2.5 text-center">
                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${CUOTA_BADGE[c.estado]}`}>{c.estado}</span>
                                </td>
                                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                    {c.estado !== 'ANULADA' && c.saldo_pendiente > 0 && (
                                        <button onClick={() => abrirPago(c)} className="text-primary-600 hover:text-primary-800" title="Registrar pago">
                                            <DollarSign className="w-4 h-4" />
                                        </button>
                                    )}
                                    {c.total_pagado > 0 && (
                                        <button onClick={() => reversar(c)} className="text-slate-400 hover:text-red-600 ml-2" title="Reversar último pago">
                                            <RotateCcw className="w-4 h-4" />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Modal de pago */}
            {cuotaPagando && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
                        <div className="p-6 border-b border-slate-200">
                            <h2 className="text-lg font-bold text-slate-900">Registrar pago — Cuota #{cuotaPagando.numero_cuota}</h2>
                            <p className="text-xs text-slate-500 mt-1">Saldo pendiente de esta cuota: {formatCurrency(cuotaPagando.saldo_pendiente)}</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Valor</label>
                                <input type="number" min="0.01" step="0.01" value={valorPago || ''}
                                    onChange={e => setValorPago(parseFloat(e.target.value) || 0)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500 text-right font-bold text-lg" />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Forma de pago</label>
                                <select value={metodoPago} onChange={e => setMetodoPago(e.target.value as MetodoPagoCredito)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500">
                                    {METODOS_PAGO_CUOTA.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Referencia (opcional)</label>
                                <input type="text" value={referencia} onChange={e => setReferencia(e.target.value)}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-primary-500" />
                            </div>
                        </div>
                        <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
                            <button onClick={() => setCuotaPagando(null)} disabled={guardando} className="btn btn-secondary">Cancelar</button>
                            <button onClick={confirmarPago} disabled={guardando} className="btn btn-primary flex items-center gap-2">
                                {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                                Registrar pago
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
