import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { compraService, proveedorService } from '../../services/vendorService'
import type { Compra, Proveedor } from '../../types/vendors'
import {
    ShoppingCart, Plus, Search, Filter, Eye, Ban,
    Package, Wrench, ChevronDown, Loader2, RefreshCw,
    FileText, Calendar, AlertCircle,
} from 'lucide-react'
import { cn } from '../../lib/utils'

const HOY = new Date().toISOString().split('T')[0]
const PRIMER_DIA_MES = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().split('T')[0]

function fmt(n: number) { return `$${n.toFixed(2)}` }
function fmtFecha(s: string) {
    return new Date(s + 'T12:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })
}

const ESTADO_BADGE: Record<string, string> = {
    ACTIVO:   'bg-green-100 text-green-700',
    ANULADO:  'bg-red-100 text-red-600',
    DEVUELTO: 'bg-amber-100 text-amber-700',
}
const TIPO_ICON = { INVENTARIO: Package, SERVICIO: Wrench }

export function ComprasPage() {
    const { empresa, user } = useAuth()
    const navigate = useNavigate()
    const location  = useLocation()

    // Non-blocking message passed via navigate state (replaces alert())
    const [msgBanner, setMsgBanner] = useState<string>('')
    useEffect(() => {
        const st = location.state as { acctMsg?: string } | null
        if (st?.acctMsg) { setMsgBanner(st.acctMsg); window.history.replaceState({}, '') }
    }, [])

    const [compras, setCompras] = useState<Compra[]>([])
    const [proveedores, setProveedores] = useState<Proveedor[]>([])
    const [loading, setLoading] = useState(true)
    const [anulando, setAnulando] = useState<string | null>(null)

    // Filtros
    const [busqueda, setBusqueda]     = useState('')
    const [filtroTipo, setFiltroTipo] = useState('')
    const [filtroEst, setFiltroEst]   = useState('ACTIVO')
    const [filtroProv, setFiltroProv] = useState('')
    const [desde, setDesde]           = useState(PRIMER_DIA_MES)
    const [hasta, setHasta]           = useState(HOY)
    const [filtrosOpen, setFiltrosOpen] = useState(false)
    const [error, setError]             = useState('')

    // Ref to always read latest filter values without stale closure
    const filtrosRef = useRef({ filtroTipo, filtroEst, filtroProv, desde, hasta })
    filtrosRef.current = { filtroTipo, filtroEst, filtroProv, desde, hasta }

    useEffect(() => {
        if (!empresa?.id) { setLoading(false); return }
        const eid = empresa.id
        let cancelled = false
        setLoading(true)
        setError('')
        const { filtroTipo: t, filtroEst: e, filtroProv: p, desde: d, hasta: h } = filtrosRef.current
        Promise.all([
            compraService.listar(eid, { tipo: t||undefined, estado: e||undefined, proveedorId: p||undefined, desde: d, hasta: h }),
            proveedorService.listar(eid),
        ]).then(([c, pv]) => { if (!cancelled) { setCompras(c); setProveedores(pv) } })
          .catch(err  => { if (!cancelled) setError(err.message) })
          .finally(()  => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [empresa?.id])

    async function loadAll() {
        if (!empresa?.id) return
        try {
            setLoading(true); setError('')
            const [c, p] = await Promise.all([
                compraService.listar(empresa.id, {
                    tipo: filtroTipo || undefined, estado: filtroEst || undefined,
                    proveedorId: filtroProv || undefined, desde, hasta,
                }),
                proveedorService.listar(empresa.id),
            ])
            setCompras(c); setProveedores(p)
        } catch (e: any) { setError(e.message) }
        finally { setLoading(false) }
    }

    async function aplicarFiltros() { await loadAll() }

    async function handleAnular(c: Compra) {
        const motivo = prompt(`Motivo de anulación para factura ${c.numero_factura ?? c.id.slice(0, 8)}:`)
        if (!motivo?.trim()) return
        try {
            setAnulando(c.id)
            await compraService.anular(c.id, motivo, user!.id)
            await loadAll()
        } catch (e: any) {
            alert('Error al anular: ' + e.message)
        } finally {
            setAnulando(null)
        }
    }

    const visibles = compras.filter(c => {
        if (!busqueda) return true
        const q = busqueda.toLowerCase()
        return (
            c.numero_factura?.toLowerCase().includes(q) ||
            (c.proveedor as any)?.nombre_empresa?.toLowerCase().includes(q) ||
            c.clave_acceso?.includes(q)
        )
    })

    // Totales resumen
    const totalComprado = visibles.filter(c => c.estado === 'ACTIVO').reduce((s, c) => s + c.total, 0)
    const totalIva      = visibles.filter(c => c.estado === 'ACTIVO').reduce((s, c) => s + (c.valor_iva ?? 0), 0)
    const ctdInventario = visibles.filter(c => c.tipo_compra === 'INVENTARIO' && c.estado === 'ACTIVO').length
    const ctdServicio   = visibles.filter(c => c.tipo_compra === 'SERVICIO'   && c.estado === 'ACTIVO').length

    return (
        <div className="space-y-5">
            {/* Accounting result banner (non-blocking, replaces alert) */}
            {msgBanner && (
                <div className={cn('flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm font-medium',
                    msgBanner.startsWith('✓') ? 'bg-green-50 text-green-800 border border-green-200'
                                              : 'bg-amber-50 text-amber-800 border border-amber-200')}>
                    <span>{msgBanner}</span>
                    <button onClick={() => setMsgBanner('')} className="shrink-0 text-slate-400 hover:text-slate-600">✕</button>
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Compras</h1>
                    <p className="text-slate-500 text-sm">Inventario y servicios</p>
                </div>
                <div className="flex gap-2">
                    <Link to="/compras/nueva-servicio" className="btn btn-secondary flex items-center gap-2 text-sm">
                        <Wrench className="w-4 h-4" /> Nueva compra servicio
                    </Link>
                    <Link to="/compras/nueva-inventario" className="btn btn-primary flex items-center gap-2 text-sm">
                        <Plus className="w-4 h-4" /> Nueva compra inventario
                    </Link>
                </div>
            </div>

            {/* Resumen */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: 'Total comprado',  val: fmt(totalComprado), color: 'text-primary-700' },
                    { label: 'IVA en compras',  val: fmt(totalIva),       color: 'text-slate-700'  },
                    { label: 'Inventario',       val: ctdInventario,       color: 'text-blue-700'   },
                    { label: 'Servicios',        val: ctdServicio,         color: 'text-purple-700' },
                ].map(s => (
                    <div key={s.label} className="card p-4 text-center">
                        <p className="text-xs text-slate-400 mb-1">{s.label}</p>
                        <p className={`text-xl font-bold ${s.color}`}>{s.val}</p>
                    </div>
                ))}
            </div>

            {/* Barra de búsqueda y filtros */}
            <div className="card p-4 space-y-3">
                <div className="flex gap-3 flex-wrap">
                    <div className="relative flex-1 min-w-52">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input className="input pl-9 w-full" placeholder="Factura, proveedor, clave acceso..."
                            value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                    </div>
                    <button onClick={() => setFiltrosOpen(v => !v)}
                        className={cn('btn btn-secondary flex items-center gap-2 text-sm',
                            filtrosOpen && 'bg-slate-100')}>
                        <Filter className="w-4 h-4" />
                        Filtros
                        <ChevronDown className={cn('w-3 h-3 transition-transform', filtrosOpen && 'rotate-180')} />
                    </button>
                    <button onClick={loadAll} className="btn btn-secondary p-2.5" title="Recargar">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>

                {filtrosOpen && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2 border-t border-slate-100">
                        <div>
                            <label className="label text-xs">Tipo</label>
                            <select className="input text-sm" value={filtroTipo}
                                onChange={e => setFiltroTipo(e.target.value)}>
                                <option value="">Todos</option>
                                <option value="INVENTARIO">Inventario</option>
                                <option value="SERVICIO">Servicio</option>
                            </select>
                        </div>
                        <div>
                            <label className="label text-xs">Estado</label>
                            <select className="input text-sm" value={filtroEst}
                                onChange={e => setFiltroEst(e.target.value)}>
                                <option value="">Todos</option>
                                <option value="ACTIVO">Activo</option>
                                <option value="ANULADO">Anulado</option>
                                <option value="DEVUELTO">Devuelto</option>
                            </select>
                        </div>
                        <div>
                            <label className="label text-xs">Proveedor</label>
                            <select className="input text-sm" value={filtroProv}
                                onChange={e => setFiltroProv(e.target.value)}>
                                <option value="">Todos</option>
                                {proveedores.map(p => (
                                    <option key={p.id} value={p.id}>{p.nombre_empresa}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="label text-xs">Desde</label>
                            <input type="date" className="input text-sm" value={desde}
                                onChange={e => setDesde(e.target.value)} />
                        </div>
                        <div>
                            <label className="label text-xs">Hasta</label>
                            <input type="date" className="input text-sm" value={hasta}
                                onChange={e => setHasta(e.target.value)} />
                        </div>
                        <div className="col-span-full flex justify-end">
                            <button onClick={aplicarFiltros} className="btn btn-primary text-sm px-6">
                                Aplicar filtros
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Tabla */}
            <div className="card overflow-hidden">
                {error ? (
                    <div className="flex items-center justify-center py-16 gap-2 text-red-500 text-sm">
                        <AlertCircle className="w-5 h-5 shrink-0" /> Error al cargar: {error}
                    </div>
                ) : loading ? (
                    <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin" /> Cargando...
                    </div>
                ) : visibles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                        <ShoppingCart className="w-12 h-12 mb-3 text-slate-200" />
                        <p className="font-medium">No hay compras en este período</p>
                        <p className="text-sm mt-1">Ajusta los filtros o registra una nueva compra</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    {['Fecha','Tipo','Proveedor','Factura','Base','IVA','Total','Pago','Estado',''].map(h => (
                                        <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {visibles.map(c => {
                                    const TipoIcon = TIPO_ICON[c.tipo_compra] ?? FileText
                                    return (
                                        <tr key={c.id} className={cn(
                                            'hover:bg-slate-50 transition-colors',
                                            c.estado === 'ANULADO' && 'opacity-50'
                                        )}>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <div className="flex items-center gap-1.5 text-slate-600">
                                                    <Calendar className="w-3 h-3 text-slate-400" />
                                                    {fmtFecha(c.fecha_emision ?? c.fecha_ingreso)}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={cn(
                                                    'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium',
                                                    c.tipo_compra === 'INVENTARIO'
                                                        ? 'bg-blue-100 text-blue-700'
                                                        : 'bg-purple-100 text-purple-700'
                                                )}>
                                                    <TipoIcon className="w-3 h-3" />
                                                    {c.tipo_compra === 'INVENTARIO' ? 'Inventario' : 'Servicio'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 max-w-[160px]">
                                                <p className="font-medium text-slate-800 truncate">
                                                    {(c.proveedor as any)?.nombre_empresa ?? '—'}
                                                </p>
                                                <p className="text-xs text-slate-400">
                                                    {(c.proveedor as any)?.ruc}
                                                </p>
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                                                {c.numero_factura
                                                    ? c.estab && c.pto_emi && c.secuencial
                                                        ? `${c.estab}-${c.pto_emi}-${c.secuencial}`
                                                        : c.numero_factura
                                                    : <span className="text-slate-300">—</span>
                                                }
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-slate-700">
                                                {fmt((c.subtotal ?? 0) || (c.total - (c.valor_iva ?? 0)))}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-slate-600">
                                                {fmt(c.valor_iva ?? 0)}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                                                {fmt(c.total)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={cn(
                                                    'text-xs px-2 py-0.5 rounded-full font-medium',
                                                    c.forma_pago === 'CREDITO'
                                                        ? 'bg-amber-100 text-amber-700'
                                                        : 'bg-slate-100 text-slate-600'
                                                )}>
                                                    {c.forma_pago === 'CREDITO'
                                                        ? `Crédito${c.fecha_vencimiento ? ' ' + fmtFecha(c.fecha_vencimiento) : ''}`
                                                        : 'Contado'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={cn(
                                                    'text-xs px-2 py-0.5 rounded-full font-semibold',
                                                    ESTADO_BADGE[c.estado] ?? 'bg-slate-100 text-slate-600'
                                                )}>
                                                    {c.estado}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={() => navigate(`/compras/${c.id}`)}
                                                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-primary-600"
                                                        title="Ver detalle"
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </button>
                                                    {c.estado === 'ACTIVO' && (
                                                        <button
                                                            onClick={() => handleAnular(c)}
                                                            disabled={anulando === c.id}
                                                            className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600"
                                                            title="Anular"
                                                        >
                                                            {anulando === c.id
                                                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                                                : <Ban className="w-4 h-4" />
                                                            }
                                                        </button>
                                                    )}
                                                    {c.estado === 'ANULADO' && c.motivo_anulacion && (
                                                        <span title={c.motivo_anulacion}>
                                                            <AlertCircle className="w-4 h-4 text-red-400" />
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                            <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                                <tr>
                                    <td colSpan={4} className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">
                                        Totales ({visibles.filter(c => c.estado === 'ACTIVO').length} compras activas)
                                    </td>
                                    <td className="px-4 py-3 text-right font-bold text-sm font-mono">
                                        {fmt(visibles.filter(c => c.estado === 'ACTIVO').reduce((s, c) => s + (c.subtotal ?? c.total - (c.valor_iva ?? 0)), 0))}
                                    </td>
                                    <td className="px-4 py-3 text-right font-bold text-sm font-mono">
                                        {fmt(visibles.filter(c => c.estado === 'ACTIVO').reduce((s, c) => s + (c.valor_iva ?? 0), 0))}
                                    </td>
                                    <td className="px-4 py-3 text-right font-bold text-sm font-mono text-primary-700">
                                        {fmt(totalComprado)}
                                    </td>
                                    <td colSpan={3} />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}

