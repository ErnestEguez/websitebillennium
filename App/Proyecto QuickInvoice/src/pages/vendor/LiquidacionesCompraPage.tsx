import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { liquidacionCompraService } from '../../services/liquidacionCompraService'
import type { LiquidacionCompra, KPIsLC, EstadoLC } from '../../types/liquidacionCompra'
import { ESTADO_LC_BADGE } from '../../types/liquidacionCompra'
import { Link } from 'react-router-dom'
import {
    FilePlus, Search, Filter, Eye, Ban, Download, Loader2,
    AlertCircle, X, CheckCircle, Clock, XCircle, FileText,
    RefreshCw, Send,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import * as XLSX from 'xlsx'

const HOY = new Date().toISOString().split('T')[0]
const PRIMER_DIA_MES = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().split('T')[0]

function fmt(n: number) { return `$${(n ?? 0).toFixed(2)}` }
function fmtFecha(s?: string | null) {
    if (!s) return '—'
    return new Date(s + 'T12:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })
}
function numLC(lc: LiquidacionCompra) {
    return `${lc.establecimiento}-${lc.punto_emision}-${lc.secuencial}`
}

// ── Modal de detalle ───────────────────────────────────────────
function DetalleModal({ id, onClose, onAnular }: {
    id: string
    onClose: () => void
    onAnular: (id: string) => void
}) {
    const [data, setData]   = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [autorizando, setAutorizando] = useState(false)
    const [msgSRI, setMsgSRI] = useState('')

    useEffect(() => {
        liquidacionCompraService.obtenerCompleta(id)
            .then(d => setData(d))
            .catch(e => setError(e.message))
            .finally(() => setLoading(false))
    }, [id])

    async function handleAutorizar() {
        if (!data) return
        setAutorizando(true)
        setMsgSRI('')
        try {
            const updated = await liquidacionCompraService.autorizar(id)
            setData({ ...data, ...updated })
            setMsgSRI('Liquidación autorizada por el SRI.')
        } catch (e: any) {
            setMsgSRI(`Error: ${e.message}`)
        } finally {
            setAutorizando(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <h2 className="text-lg font-bold text-slate-900">Liquidación de Compra</h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
                    {loading && (
                        <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
                            <Loader2 className="w-5 h-5 animate-spin" /> Cargando…
                        </div>
                    )}
                    {error && (
                        <div className="flex items-center gap-2 text-red-500 py-8 justify-center">
                            <AlertCircle className="w-5 h-5" /> {error}
                        </div>
                    )}
                    {data && !loading && (
                        <>
                            {/* Encabezado */}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                                <div>
                                    <p className="text-xs text-slate-400 uppercase font-semibold mb-0.5">Número</p>
                                    <p className="font-mono font-semibold text-slate-900">{numLC(data)}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-400 uppercase font-semibold mb-0.5">Estado SRI</p>
                                    <span className={cn('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium', ESTADO_LC_BADGE[data.estado_sri as EstadoLC])}>
                                        {data.estado_sri}
                                    </span>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-400 uppercase font-semibold mb-0.5">Fecha</p>
                                    <p className="text-slate-800">{fmtFecha(data.fecha_emision)}</p>
                                </div>
                                <div className="col-span-2 md:col-span-3">
                                    <p className="text-xs text-slate-400 uppercase font-semibold mb-0.5">Beneficiario</p>
                                    <p className="font-semibold text-slate-800">{data.beneficiario_nombre}</p>
                                    <p className="text-xs text-slate-500">{data.beneficiario_tipo_id} · {data.beneficiario_identificacion}</p>
                                    {data.beneficiario_direccion && <p className="text-xs text-slate-400">{data.beneficiario_direccion}</p>}
                                </div>
                                {data.numero_autorizacion && (
                                    <div className="col-span-2 md:col-span-3">
                                        <p className="text-xs text-slate-400 uppercase font-semibold mb-0.5">Autorización SRI</p>
                                        <p className="font-mono text-xs text-slate-600 break-all">{data.numero_autorizacion}</p>
                                        {data.fecha_autorizacion && <p className="text-xs text-slate-400">{new Date(data.fecha_autorizacion).toLocaleString('es-EC')}</p>}
                                    </div>
                                )}
                            </div>

                            {/* Detalles */}
                            {data.detalles?.length > 0 && (
                                <div>
                                    <p className="text-xs text-slate-400 uppercase font-semibold mb-2">Detalle</p>
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                <th className="text-left px-3 py-2 text-xs text-slate-500 font-medium">Descripción</th>
                                                <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium">Cant.</th>
                                                <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium">P.U.</th>
                                                <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium">Subtotal</th>
                                                <th className="text-center px-3 py-2 text-xs text-slate-500 font-medium">IVA</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {data.detalles.map((d: any) => (
                                                <tr key={d.id}>
                                                    <td className="px-3 py-2 text-slate-800">{d.descripcion}</td>
                                                    <td className="px-3 py-2 text-right text-slate-600">{d.cantidad}</td>
                                                    <td className="px-3 py-2 text-right text-slate-600">{fmt(d.precio_unitario)}</td>
                                                    <td className="px-3 py-2 text-right font-medium text-slate-800">{fmt(d.subtotal)}</td>
                                                    <td className="px-3 py-2 text-center">
                                                        {d.aplica_iva
                                                            ? <span className="text-xs text-green-600 font-medium">15%</span>
                                                            : <span className="text-xs text-slate-400">0%</span>}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Retenciones */}
                            {data.retenciones?.length > 0 && (
                                <div>
                                    <p className="text-xs text-slate-400 uppercase font-semibold mb-2">Retenciones</p>
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                <th className="text-left px-3 py-2 text-xs text-slate-500 font-medium">Tipo</th>
                                                <th className="text-left px-3 py-2 text-xs text-slate-500 font-medium">Código</th>
                                                <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium">Base</th>
                                                <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium">%</th>
                                                <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium">Valor</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {data.retenciones.map((r: any) => (
                                                <tr key={r.id}>
                                                    <td className="px-3 py-2">
                                                        <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', r.tipo === 'IR' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700')}>
                                                            {r.tipo}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2 font-mono text-xs text-slate-600">{r.codigo_retencion}</td>
                                                    <td className="px-3 py-2 text-right text-slate-600">{fmt(r.base_imponible)}</td>
                                                    <td className="px-3 py-2 text-right text-slate-600">{r.porcentaje}%</td>
                                                    <td className="px-3 py-2 text-right font-semibold text-slate-800">{fmt(r.valor)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Totales */}
                            <div className="bg-slate-50 rounded-xl p-4 space-y-1.5 text-sm">
                                <div className="flex justify-between text-slate-600">
                                    <span>Base IVA 0%</span><span>{fmt(data.base_iva_0)}</span>
                                </div>
                                <div className="flex justify-between text-slate-600">
                                    <span>Base IVA 15%</span><span>{fmt(data.base_iva_15)}</span>
                                </div>
                                <div className="flex justify-between text-slate-600">
                                    <span>IVA 15%</span><span>{fmt(data.valor_iva)}</span>
                                </div>
                                {data.total_retenciones > 0 && (
                                    <div className="flex justify-between text-amber-600">
                                        <span>Total Retenciones</span><span>-{fmt(data.total_retenciones)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between font-bold text-slate-900 text-base border-t border-slate-200 pt-2 mt-1">
                                    <span>Total</span><span>{fmt(data.total)}</span>
                                </div>
                            </div>

                            {data.observaciones_sri && (
                                <div className="bg-red-50 rounded-xl p-3 text-sm text-red-700">
                                    <p className="font-semibold mb-1">Observaciones SRI:</p>
                                    <p>{data.observaciones_sri}</p>
                                </div>
                            )}

                            {msgSRI && (
                                <div className={cn('rounded-xl p-3 text-sm', msgSRI.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700')}>
                                    {msgSRI}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Acciones */}
                {data && !loading && (
                    <div className="px-6 py-4 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
                        {['PENDIENTE', 'RECHAZADO'].includes(data.estado_sri) && (
                            <button
                                onClick={handleAutorizar}
                                disabled={autorizando}
                                className="btn-primary flex items-center gap-2"
                            >
                                {autorizando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                {autorizando ? 'Autorizando…' : (data.estado_sri === 'RECHAZADO' ? 'Reintentar SRI' : 'Autorizar en SRI')}
                            </button>
                        )}
                        <Link
                            to={`/liquidaciones/${id}/ride`}
                            className="btn-secondary flex items-center gap-2 text-sm"
                        >
                            <FileText className="w-4 h-4" /> RIDE
                        </Link>
                        {data.xml_firmado && (
                            <a
                                href={`data:text/xml;charset=utf-8,${encodeURIComponent(data.xml_firmado)}`}
                                download={`LC-${numLC(data)}.xml`}
                                className="btn-secondary flex items-center gap-2 text-sm"
                            >
                                <Download className="w-4 h-4" /> XML
                            </a>
                        )}
                        {data.estado_sri !== 'ANULADO' && (
                            <button
                                onClick={() => onAnular(id)}
                                className="px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-1"
                            >
                                <Ban className="w-4 h-4" /> Anular
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}

// ── Modal anular ───────────────────────────────────────────────
function AnularModal({ id, onClose, onDone }: {
    id: string; onClose: () => void; onDone: () => void
}) {
    const [motivo, setMotivo] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    async function handleAnular() {
        if (!motivo.trim()) { setError('El motivo es obligatorio.'); return }
        setLoading(true)
        try {
            await liquidacionCompraService.anular(id, motivo)
            onDone()
        } catch (e: any) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
                <h3 className="text-lg font-bold text-slate-900">Anular Liquidación</h3>
                <p className="text-sm text-slate-600">Esta acción marcará la liquidación como ANULADA y no puede deshacerse.</p>
                <textarea
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none resize-none"
                    rows={3}
                    placeholder="Motivo de anulación…"
                    value={motivo}
                    onChange={e => setMotivo(e.target.value)}
                />
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="btn-secondary">Cancelar</button>
                    <button
                        onClick={handleAnular}
                        disabled={loading}
                        className="px-4 py-2 text-sm font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
                    >
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        Confirmar anulación
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Página principal ───────────────────────────────────────────
export function LiquidacionesCompraPage() {
    const { empresa } = useAuth()
    const navigate = useNavigate()

    const [lista, setLista]     = useState<LiquidacionCompra[]>([])
    const [kpis, setKpis]       = useState<KPIsLC | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError]     = useState('')

    // Filtros
    const [desde, setDesde]       = useState(PRIMER_DIA_MES)
    const [hasta, setHasta]       = useState(HOY)
    const [estado, setEstado]     = useState('')
    const [busqueda, setBusqueda] = useState('')

    // Modales
    const [detalleId, setDetalleId]       = useState<string | null>(null)
    const [anularId, setAnularId]         = useState<string | null>(null)
    const [autorizandoId, setAutorizandoId] = useState<string | null>(null)

    // Exportar
    const [exporting, setExporting] = useState(false)

    async function cargar() {
        if (!empresa) return
        setLoading(true)
        setError('')
        try {
            const [rows, k] = await Promise.all([
                liquidacionCompraService.listar(empresa.id, { estado: estado || undefined, desde, hasta, busqueda: busqueda || undefined }),
                liquidacionCompraService.getKPIs(empresa.id),
            ])
            setLista(rows)
            setKpis(k)
        } catch (e: any) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { cargar() }, [empresa])

    async function handleExportar() {
        if (!empresa) return
        setExporting(true)
        try {
            const filas = await liquidacionCompraService.paraExcel(empresa.id, desde, hasta)
            const wb = XLSX.utils.book_new()
            const ws = XLSX.utils.json_to_sheet(filas.map(lc => ({
                'Número':           numLC(lc),
                'Fecha':            lc.fecha_emision,
                'Beneficiario':     lc.beneficiario_nombre,
                'Identificación':   lc.beneficiario_identificacion,
                'Tipo ID':          lc.beneficiario_tipo_id,
                'Subtotal':         lc.subtotal,
                'IVA':              lc.valor_iva,
                'Total':            lc.total,
                'Retenciones':      lc.total_retenciones,
                'Estado SRI':       lc.estado_sri,
                'Autorización':     lc.numero_autorizacion ?? '',
                'Forma Pago':       lc.forma_pago,
                'Vencimiento':      lc.fecha_vencimiento ?? '',
                'Sustento':         lc.tipo_sustento,
            })))
            XLSX.utils.book_append_sheet(wb, ws, 'Liquidaciones')
            XLSX.writeFile(wb, `LC-${empresa.ruc}-${desde.slice(0,7)}.xlsx`)
        } catch (e: any) {
            setError(e.message)
        } finally {
            setExporting(false)
        }
    }

    function handleAnuladoConfirmado() {
        setAnularId(null)
        setDetalleId(null)
        cargar()
    }

    async function handleAutorizarInline(lc: LiquidacionCompra) {
        setAutorizandoId(lc.id)
        try {
            await liquidacionCompraService.autorizar(lc.id)
            await cargar()
        } catch (e: any) {
            setError(`Error al autorizar LC ${numLC(lc)}: ${e.message}`)
        } finally {
            setAutorizandoId(null)
        }
    }

    function descargarXml(lc: LiquidacionCompra) {
        const xml = (lc as any).xml_firmado
        if (!xml) return
        const blob = new Blob([xml], { type: 'application/xml' })
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a')
        a.href     = url
        a.download = `LC-${numLC(lc)}.xml`
        a.click()
        URL.revokeObjectURL(url)
    }

    const kpiCards = [
        { label: 'Total emitidas', value: kpis?.total ?? 0, icon: FileText, color: 'text-slate-600', bg: 'bg-slate-50' },
        { label: 'Autorizadas', value: kpis?.autorizadas ?? 0, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
        { label: 'Pendientes', value: kpis?.pendientes ?? 0, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
        { label: 'Rechazadas', value: kpis?.rechazadas ?? 0, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50' },
        { label: 'Monto autorizado', value: fmt(kpis?.monto_autorizado ?? 0), icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50', wide: true },
    ]

    return (
        <div className="space-y-6">
            {/* Título */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Liquidaciones de Compra</h1>
                    <p className="text-sm text-slate-500 mt-0.5">Comprobantes electrónicos codDoc=03 · SRI Ecuador</p>
                </div>
                <button
                    onClick={() => navigate('/liquidaciones/nueva')}
                    className="btn-primary flex items-center gap-2"
                >
                    <FilePlus className="w-4 h-4" /> Nueva Liquidación
                </button>
            </div>

            {/* KPIs */}
            {kpis && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {kpiCards.map(k => (
                        <div key={k.label} className={cn('card p-4', k.wide && 'sm:col-span-2')}>
                            <div className="flex items-center gap-3">
                                <div className={cn('p-2 rounded-lg', k.bg)}>
                                    <k.icon className={cn('w-4 h-4', k.color)} />
                                </div>
                                <div>
                                    <p className="text-xs text-slate-500">{k.label}</p>
                                    <p className="text-xl font-bold text-slate-900">{typeof k.value === 'number' ? k.value : k.value}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Filtros */}
            <div className="card p-4">
                <div className="flex flex-wrap gap-3 items-end">
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">Desde</label>
                        <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">Hasta</label>
                        <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">Estado</label>
                        <select value={estado} onChange={e => setEstado(e.target.value)}
                            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none">
                            <option value="">Todos</option>
                            <option value="PENDIENTE">Pendiente</option>
                            <option value="AUTORIZADO">Autorizado</option>
                            <option value="RECHAZADO">Rechazado</option>
                            <option value="ANULADO">Anulado</option>
                        </select>
                    </div>
                    <div className="flex-1 min-w-[180px]">
                        <label className="block text-xs text-slate-500 mb-1">Buscar</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Nombre, cédula, secuencial…"
                                value={busqueda}
                                onChange={e => setBusqueda(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && cargar()}
                                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                            />
                        </div>
                    </div>
                    <button onClick={cargar} disabled={loading}
                        className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 flex items-center gap-2">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Filter className="w-4 h-4" />}
                        Filtrar
                    </button>
                    <button onClick={cargar} title="Recargar" disabled={loading}
                        className="p-2 border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-500">
                        <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
                    </button>
                    <button onClick={handleExportar} disabled={exporting}
                        className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                        {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        Excel
                    </button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-xl p-4 text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0" /> {error}
                </div>
            )}

            {/* Lista */}
            <div className="card overflow-hidden">
                {loading && lista.length === 0 ? (
                    <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin" /> Cargando…
                    </div>
                ) : lista.length === 0 ? (
                    <div className="text-center py-20 text-slate-400">
                        <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
                        <p className="text-sm font-medium">No hay liquidaciones en este período</p>
                        <button onClick={() => navigate('/liquidaciones/nueva')} className="mt-3 btn-primary text-sm">
                            Nueva Liquidación
                        </button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                    <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Número</th>
                                    <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Beneficiario</th>
                                    <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Fecha</th>
                                    <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Total</th>
                                    <th className="text-right px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Retenciones</th>
                                    <th className="text-left px-4 py-3 text-xs text-slate-500 font-semibold uppercase">Estado</th>
                                    <th className="px-4 py-3" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {lista.map(lc => (
                                    <tr key={lc.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-3 font-mono text-xs text-slate-700">{numLC(lc)}</td>
                                        <td className="px-4 py-3">
                                            <p className="font-medium text-slate-800 truncate max-w-[200px]">{lc.beneficiario_nombre}</p>
                                            <p className="text-xs text-slate-400">{lc.beneficiario_tipo_id} · {lc.beneficiario_identificacion}</p>
                                        </td>
                                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmtFecha(lc.fecha_emision)}</td>
                                        <td className="px-4 py-3 text-right font-semibold text-slate-800">{fmt(lc.total)}</td>
                                        <td className="px-4 py-3 text-right text-amber-700">
                                            {lc.total_retenciones > 0 ? `-${fmt(lc.total_retenciones)}` : <span className="text-slate-300">—</span>}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', ESTADO_LC_BADGE[lc.estado_sri])}>
                                                {lc.estado_sri}
                                            </span>
                                        </td>
                                        <td className="px-2 py-3">
                                            <div className="flex items-center gap-1 justify-end">
                                                {/* Autorizar / Reintentar */}
                                                {['PENDIENTE', 'RECHAZADO'].includes(lc.estado_sri) && lc.estado_sri !== 'ANULADO' && (
                                                    <button
                                                        onClick={() => handleAutorizarInline(lc)}
                                                        disabled={autorizandoId === lc.id}
                                                        title={lc.estado_sri === 'RECHAZADO' ? 'Reintentar' : 'Autorizar en SRI'}
                                                        className="flex items-center gap-1 px-2 py-1.5 bg-primary-600 text-white text-xs rounded-lg hover:bg-primary-700 disabled:opacity-50 whitespace-nowrap"
                                                    >
                                                        {autorizandoId === lc.id
                                                            ? <Loader2 className="w-3 h-3 animate-spin" />
                                                            : <Send className="w-3 h-3" />}
                                                        {autorizandoId === lc.id ? '' : (lc.estado_sri === 'RECHAZADO' ? 'Reintentar' : 'Autorizar')}
                                                    </button>
                                                )}
                                                {/* RIDE */}
                                                <Link
                                                    to={`/liquidaciones/${lc.id}/ride`}
                                                    title="Ver RIDE"
                                                    className="flex items-center gap-1 px-2 py-1.5 border border-slate-200 text-slate-600 text-xs rounded-lg hover:bg-slate-50"
                                                >
                                                    <FileText className="w-3 h-3" /> RIDE
                                                </Link>
                                                {/* XML */}
                                                {(lc as any).xml_firmado && (
                                                    <button
                                                        onClick={() => descargarXml(lc)}
                                                        title="Descargar XML"
                                                        className="flex items-center gap-1 px-2 py-1.5 border border-slate-200 text-slate-600 text-xs rounded-lg hover:bg-slate-50"
                                                    >
                                                        <Download className="w-3 h-3" /> XML
                                                    </button>
                                                )}
                                                {/* Ver detalle */}
                                                <button
                                                    onClick={() => setDetalleId(lc.id)}
                                                    title="Ver detalle"
                                                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-primary-600"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                                {/* Anular */}
                                                {lc.estado_sri !== 'ANULADO' && (
                                                    <button
                                                        onClick={() => setAnularId(lc.id)}
                                                        title="Anular"
                                                        className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600"
                                                    >
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

            {/* Modales */}
            {detalleId && (
                <DetalleModal
                    id={detalleId}
                    onClose={() => setDetalleId(null)}
                    onAnular={id => { setAnularId(id); setDetalleId(null) }}
                />
            )}
            {anularId && (
                <AnularModal
                    id={anularId}
                    onClose={() => setAnularId(null)}
                    onDone={handleAnuladoConfirmado}
                />
            )}
        </div>
    )
}
