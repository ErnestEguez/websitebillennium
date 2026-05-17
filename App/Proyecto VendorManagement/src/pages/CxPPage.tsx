import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { cxpService } from '../services/vendorService'
import { contabilidadService } from '../services/contabilidadService'
import type { CuentasCompras } from '../services/contabilidadService'
import type { CuentaPorPagar, FormasPago } from '../types/vendors'
import { Wallet, AlertCircle, CheckCircle2, Clock, Loader2, X } from 'lucide-react'
import { cn } from '../lib/utils'

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
    const { empresa, profile } = useAuth()
    const [lista, setLista]           = useState<CuentaPorPagar[]>([])
    const [loading, setLoading]       = useState(true)
    const [filtro, setFiltro]         = useState<'pendientes'|'vencidas'|'todos'>('pendientes')
    const [modalCxp, setModalCxp]     = useState<CuentaPorPagar | null>(null)
    const [montoPago, setMontoPago]   = useState('')
    const [formaPago, setFormaPago]   = useState<FormasPago>('TRANSFERENCIA')
    const [referencia, setReferencia] = useState('')
    const [guardando, setGuardando]   = useState(false)

    useEffect(() => { if (empresa?.id) load() }, [empresa?.id, filtro])

    async function load() {
        try {
            setLoading(true)
            const data = await cxpService.listar(empresa!.id, {
                estado: filtro === 'todos' ? undefined : undefined,
                vencidas: filtro === 'vencidas',
            })
            const filtradas = filtro === 'pendientes'
                ? data.filter(c => c.estado !== 'PAGADO' && c.estado !== 'ANULADO')
                : filtro === 'vencidas'
                    ? data.filter(c => c.fecha_vencimiento < HOY && c.estado !== 'PAGADO' && c.estado !== 'ANULADO')
                    : data
            setLista(filtradas)
        } catch (e: any) {
            alert('Error: ' + e.message)
        } finally {
            setLoading(false)
        }
    }

    async function handlePago() {
        if (!modalCxp || !montoPago) return
        const monto = parseFloat(montoPago)
        if (isNaN(monto) || monto <= 0) { alert('Monto inválido'); return }
        try {
            setGuardando(true)
            await cxpService.registrarPago({
                empresa_id:       empresa!.id,
                cxp_id:           modalCxp.id,
                proveedor_id:     modalCxp.proveedor_id,
                fecha_pago:       HOY,
                monto,
                forma_pago:       formaPago,
                numero_referencia: referencia || undefined,
            })

            // Asiento contable de egreso (no-fatal)
            if (empresa!.usar_contabilidad_compras && empresa!.config_cuentas_compras) {
                const ctas = empresa!.config_cuentas_compras as unknown as CuentasCompras
                if (ctas.cuentas_por_pagar && ctas.efectivo) {
                    contabilidadService.crearAsientoPago({
                        empresaId: empresa!.id, portalRuc: empresa?.ruc,
                        fecha:      HOY,
                        glosa:      `Pago proveedor ${formaPago}${referencia ? ' ' + referencia : ''}`,
                        monto,
                        cuentas:    ctas,
                        referencia: referencia || undefined,
                        creadoPor:  profile?.id,
                    }).catch(err => console.warn('Asiento pago no creado:', err.message))
                }
            }

            setModalCxp(null)
            setMontoPago(''); setReferencia('')
            await load()
        } catch (e: any) {
            alert('Error al registrar pago: ' + e.message)
        } finally {
            setGuardando(false)
        }
    }

    const totalPendiente = lista.filter(c => c.estado !== 'PAGADO' && c.estado !== 'ANULADO')
        .reduce((s, c) => s + c.saldo_pendiente, 0)
    const totalVencido = lista.filter(c => c.fecha_vencimiento < HOY && c.estado !== 'PAGADO' && c.estado !== 'ANULADO')
        .reduce((s, c) => s + c.saldo_pendiente, 0)

    return (
        <div className="space-y-5">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Cuentas por Pagar</h1>
                <p className="text-slate-500 text-sm">Seguimiento de obligaciones con proveedores</p>
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
                                    return (
                                        <tr key={c.id} className={cn('hover:bg-slate-50', vencida && 'bg-red-50/40')}>
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
                                            <td className="px-4 py-3">
                                                {c.estado !== 'PAGADO' && c.estado !== 'ANULADO' && (
                                                    <button onClick={() => { setModalCxp(c); setMontoPago(c.saldo_pendiente.toFixed(2)) }}
                                                        className="text-xs btn btn-primary py-1 px-3">
                                                        Registrar pago
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal pago */}
            {modalCxp && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-bold text-slate-900">Registrar Pago</h2>
                            <button onClick={() => setModalCxp(null)} className="p-1 hover:bg-slate-100 rounded-lg">
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        <div className="bg-slate-50 rounded-xl p-4 text-sm space-y-1">
                            <p className="font-semibold">{(modalCxp.proveedor as any)?.nombre_empresa}</p>
                            <p className="text-slate-500">Saldo pendiente: <span className="font-bold text-slate-800">{fmt(modalCxp.saldo_pendiente)}</span></p>
                            <p className="text-slate-500">Vence: {fmtFecha(modalCxp.fecha_vencimiento)}</p>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="label">Monto a pagar <span className="text-red-500">*</span></label>
                                <input type="number" step={0.01} min={0.01} max={modalCxp.saldo_pendiente}
                                    className="input" value={montoPago}
                                    onChange={e => setMontoPago(e.target.value)} />
                            </div>
                            <div>
                                <label className="label">Forma de pago</label>
                                <select className="input" value={formaPago}
                                    onChange={e => setFormaPago(e.target.value as FormasPago)}>
                                    <option value="TRANSFERENCIA">Transferencia</option>
                                    <option value="EFECTIVO">Efectivo</option>
                                    <option value="CHEQUE">Cheque</option>
                                    <option value="NOTA_DEBITO">Nota de débito</option>
                                    <option value="OTRO">Otro</option>
                                </select>
                            </div>
                            <div>
                                <label className="label">Nº referencia / cheque (opcional)</label>
                                <input className="input" value={referencia}
                                    onChange={e => setReferencia(e.target.value)}
                                    placeholder="Nº transferencia, cheque..." />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button onClick={() => setModalCxp(null)} className="btn btn-secondary flex-1">Cancelar</button>
                            <button onClick={handlePago} disabled={guardando}
                                className="btn btn-primary flex-1 flex items-center justify-center gap-2">
                                {guardando ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : 'Confirmar pago'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
