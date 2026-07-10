import { useState, useEffect, useRef } from 'react'
import { HelpButton } from '../../components/help/HelpButton'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { cxpService } from '../../services/vendorService'
import type { CuentaPorPagar, PagoProveedor } from '../../types/vendors'
import { Wallet, AlertCircle, CheckCircle2, Clock, Loader2, ChevronDown, ChevronUp, ArrowRight } from 'lucide-react'
import { cn } from '../../lib/utils'

const HOY = new Date().toISOString().split('T')[0]
function fmt(n: number) { return `$${n.toFixed(2)}` }
function fmtFecha(s: string) {
    return new Date(s + 'T12:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })
}

const ESTADO_BADGE: Record<string, string> = {
    PENDIENTE:            'bg-amber-100 text-amber-700',
    PARCIALMENTE_PAGADO:  'bg-blue-100 text-blue-700',
    PAGADO:               'bg-green-100 text-green-700',
    ANULADO:              'bg-slate-100 text-slate-400',
}

export function CxPPage() {
    const { empresa } = useAuth()
    const [lista, setLista]           = useState<CuentaPorPagar[]>([])
    const [loading, setLoading]       = useState(true)
    const [filtro, setFiltro]         = useState<'pendientes'|'vencidas'|'todos'>('pendientes')
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [pagosDetalle, setPagosDetalle] = useState<Record<string, PagoProveedor[]>>({})
    const mountedRef = useRef(true)
    useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

    useEffect(() => {
        if (!empresa?.id) { setLoading(false); return }
        const eid = empresa.id
        let cancelled = false
        setLoading(true)
        cxpService.listar(eid, { vencidas: filtro === 'vencidas' })
            .then(data => {
                if (cancelled || !mountedRef.current) return
                const filtradas = filtro === 'pendientes'
                    ? data.filter(c => c.estado !== 'PAGADO' && c.estado !== 'ANULADO')
                    : filtro === 'vencidas'
                        ? data.filter(c => c.fecha_vencimiento < HOY && c.estado !== 'PAGADO' && c.estado !== 'ANULADO')
                        : data
                setLista(filtradas)
            })
            .catch(() => {})
            .finally(() => { if (!cancelled && mountedRef.current) setLoading(false) })
        return () => { cancelled = true }
    }, [empresa?.id, filtro])

    async function toggleDetalle(id: string) {
        if (expandedId === id) { setExpandedId(null); return }
        setExpandedId(id)
        if (!pagosDetalle[id]) {
            const pagos = await cxpService.historialPagos(id)
            setPagosDetalle(prev => ({ ...prev, [id]: pagos }))
        }
    }

    const totalPendiente = lista.filter(c => c.estado !== 'PAGADO' && c.estado !== 'ANULADO')
        .reduce((s, c) => s + c.saldo_pendiente, 0)
    const totalVencido = lista.filter(c => c.fecha_vencimiento < HOY && c.estado !== 'PAGADO' && c.estado !== 'ANULADO')
        .reduce((s, c) => s + c.saldo_pendiente, 0)

    return (
        <div className="space-y-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Cuentas por Pagar</h1>
                    <p className="text-slate-500 text-sm">Seguimiento de obligaciones con proveedores</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <HelpButton pageKey="cxp" />
                    <Link to="/teso/egresos/nuevo" className="btn btn-primary gap-2">
                        Registrar pago en Tesorería <ArrowRight className="w-4 h-4" />
                    </Link>
                </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-900">
                <AlertCircle className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
                <span>
                    Los pagos a proveedores (efectivo, cheque, transferencia, T/C, N/C, etc.) se registran desde{' '}
                    <Link to="/teso/egresos/nuevo" className="font-semibold underline">Tesorería → Nuevo Egreso</Link>,
                    donde también se generan el movimiento bancario y el asiento contable correspondiente.
                </span>
            </div>

            {/* Resumen */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {[
                    { label: 'Total pendiente', val: fmt(totalPendiente), icon: Clock,          color: 'text-amber-600' },
                    { label: 'Total vencido',   val: fmt(totalVencido),   icon: AlertCircle,    color: 'text-red-600'   },
                    { label: 'Documentos',      val: lista.length,        icon: CheckCircle2,   color: 'text-slate-700' },
                ].map(s => (
                    <div key={s.label} className="card p-4">
                        <div className="flex items-center gap-2 mb-1">
                            <s.icon className={`w-4 h-4 ${s.color}`} />
                            <p className="text-xs text-slate-500">{s.label}</p>
                        </div>
                        <p className={`text-xl font-bold ${s.color}`}>{s.val}</p>
                    </div>
                ))}
            </div>

            {/* Filtros */}
            <div className="flex gap-2">
                {(['pendientes', 'vencidas', 'todos'] as const).map(f => (
                    <button key={f} onClick={() => setFiltro(f)}
                        className={cn('px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                            filtro === f ? 'bg-primary-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50')}>
                        {f === 'pendientes' ? 'Pendientes' : f === 'vencidas' ? 'Vencidas' : 'Todas'}
                    </button>
                ))}
            </div>

            {/* Tabla */}
            <div className="card overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin" /> Cargando...
                    </div>
                ) : lista.length === 0 ? (
                    <div className="text-center py-16 text-slate-400">
                        <Wallet className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                        <p>No hay cuentas por pagar en esta vista</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b text-xs font-bold text-slate-500 uppercase">
                                <tr>
                                    {['Proveedor','Factura','Emisión','Vencimiento','Original','Saldo','Estado',''].map(h => (
                                        <th key={h} className="px-4 py-3 text-left whitespace-nowrap">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {lista.map(c => {
                                    const vencida = c.fecha_vencimiento < HOY && c.estado !== 'PAGADO'
                                    const isExpanded = expandedId === c.id
                                    return (
                                        <>
                                            <tr key={c.id}
                                                onClick={() => toggleDetalle(c.id)}
                                                className={cn('hover:bg-slate-50 cursor-pointer', vencida && 'bg-red-50/40')}>
                                                <td className="px-4 py-3 font-medium text-slate-800">
                                                    {(c.proveedor as any)?.nombre_empresa ?? '—'}
                                                </td>
                                                <td className="px-4 py-3 font-mono text-xs text-slate-500">
                                                    {(c.compra as any)?.numero_factura ?? '—'}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-slate-600">{fmtFecha(c.fecha_emision)}</td>
                                                <td className={cn('px-4 py-3 whitespace-nowrap font-medium', vencida ? 'text-red-600' : 'text-slate-600')}>
                                                    {fmtFecha(c.fecha_vencimiento)}
                                                    {vencida && <span className="ml-1 text-xs">⚠</span>}
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono">{fmt(c.monto_original)}</td>
                                                <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">{fmt(c.saldo_pendiente)}</td>
                                                <td className="px-4 py-3">
                                                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold', ESTADO_BADGE[c.estado])}>
                                                        {c.estado.replace('_', ' ')}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                                    <div className="flex items-center justify-end">
                                                        <button onClick={() => toggleDetalle(c.id)} className="p-1.5 text-slate-400">
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
                                                                        <th className="text-left pb-1">Forma</th>
                                                                        <th className="text-left pb-1">Referencia</th>
                                                                        <th className="text-right pb-1">Valor</th>
                                                                        <th className="text-center pb-1">Asiento</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-200">
                                                                    {pagosDetalle[c.id].map(p => (
                                                                        <tr key={p.id}>
                                                                            <td className="py-1 text-slate-600">{p.fecha_pago}</td>
                                                                            <td className="py-1 text-slate-600 capitalize">{p.forma_pago.replace('_', ' ').toLowerCase()}</td>
                                                                            <td className="py-1 text-slate-500">{p.numero_referencia || '—'}</td>
                                                                            <td className={`py-1 text-right font-medium ${p.estado === 'reversado' ? 'text-slate-400 line-through' : 'text-green-700'}`}>
                                                                                {fmt(p.monto)}
                                                                            </td>
                                                                            <td className="py-1 text-center">
                                                                                {p.estado === 'reversado' ? (
                                                                                    <span
                                                                                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-200 text-slate-600"
                                                                                        title={[p.reversado_at && `Reversado: ${p.reversado_at}`, p.motivo_reversa].filter(Boolean).join(' — ')}
                                                                                    >
                                                                                        Reversado
                                                                                    </span>
                                                                                ) : p.lp_comprobante_id ? (
                                                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                                                                        Contabilizado
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                                                                        Sin asiento
                                                                                    </span>
                                                                                )}
                                                                            </td>
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
                    </div>
                )}
            </div>
        </div>
    )
}
