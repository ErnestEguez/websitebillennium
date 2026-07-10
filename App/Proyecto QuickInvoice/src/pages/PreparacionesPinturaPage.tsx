import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
    preparacionPinturaService,
    type PreparacionPintura,
    type EstadoPrep,
} from '../services/preparacionPinturaService'
import { formatCurrency } from '../lib/utils'
import {
    Plus, FlaskConical, RefreshCw, Loader2, Trash2,
    FileText, ChevronDown, ChevronUp, Info, Calendar,
} from 'lucide-react'
import { cn } from '../lib/utils'

const ESTADO_LABEL: Record<EstadoPrep, string> = {
    PENDIENTE:  'Pendiente',
    PROFORMADA: 'Proformada',
    FACTURADA:  'Facturada',
    ANULADA:    'Anulada',
}

const ESTADO_COLOR: Record<EstadoPrep, string> = {
    PENDIENTE:  'bg-amber-100 text-amber-700',
    PROFORMADA: 'bg-violet-100 text-violet-700',
    FACTURADA:  'bg-emerald-100 text-emerald-700',
    ANULADA:    'bg-slate-100 text-slate-500 line-through',
}

const hoy = () => new Date().toISOString().split('T')[0]
const restarDias = (dias: number) => {
    const d = new Date()
    d.setDate(d.getDate() - dias)
    return d.toISOString().split('T')[0]
}

type RangoRapido = 'hoy' | 'semana' | 'mes' | 'todo'

export function PreparacionesPinturaPage() {
    const { empresa } = useAuth() as any
    const navigate = useNavigate()
    const [preps, setPreps] = useState<PreparacionPintura[]>([])
    const [loading, setLoading] = useState(true)
    const [anulando, setAnulando] = useState<string | null>(null)
    const [expanded, setExpanded] = useState<string | null>(null)
    const [filtroEstado, setFiltroEstado] = useState<EstadoPrep | ''>('')
    const [loadingDetail, setLoadingDetail] = useState<string | null>(null)
    const [detailMap, setDetailMap] = useState<Record<string, PreparacionPintura>>({})

    // Filtros de fecha — por defecto: hoy
    const [desde, setDesde] = useState(hoy())
    const [hasta, setHasta] = useState(hoy())
    const [rangoActivo, setRangoActivo] = useState<RangoRapido>('hoy')

    useEffect(() => {
        if (empresa?.id) load()
    }, [empresa?.id, desde, hasta])

    async function load() {
        try {
            setLoading(true)
            const desdeParam = desde || undefined
            const hastaParam = hasta || undefined
            const data = await preparacionPinturaService.listar(empresa!.id, desdeParam, hastaParam)
            setPreps(data)
        } catch (e: any) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }

    function aplicarRango(rango: RangoRapido) {
        setRangoActivo(rango)
        if (rango === 'hoy')   { setDesde(hoy());         setHasta(hoy()) }
        if (rango === 'semana'){ setDesde(restarDias(6));  setHasta(hoy()) }
        if (rango === 'mes')   { setDesde(restarDias(29)); setHasta(hoy()) }
        if (rango === 'todo')  { setDesde('');             setHasta('') }
    }

    function handleDesdeChange(v: string) {
        setDesde(v)
        setRangoActivo('todo')
    }

    function handleHastaChange(v: string) {
        setHasta(v)
        setRangoActivo('todo')
    }

    async function toggleExpand(prep: PreparacionPintura) {
        if (expanded === prep.id) { setExpanded(null); return }
        setExpanded(prep.id)
        if (!detailMap[prep.id]) {
            setLoadingDetail(prep.id)
            try {
                const full = await preparacionPinturaService.getCompleta(prep.id)
                setDetailMap(prev => ({ ...prev, [prep.id]: full }))
            } catch (e) {
                console.error(e)
            } finally {
                setLoadingDetail(null)
            }
        }
    }

    async function handleAnular(prep: PreparacionPintura) {
        if (!confirm(`¿Anular la preparación "${prep.descripcion}"?\n\nEsto revertirá las salidas de kardex de los insumos.`)) return
        try {
            setAnulando(prep.id)
            await preparacionPinturaService.anular(prep.id, empresa!.id)
            await load()
            setExpanded(null)
        } catch (e: any) {
            alert('Error al anular: ' + e.message)
        } finally {
            setAnulando(null)
        }
    }

    const lista = filtroEstado
        ? preps.filter(p => p.estado === filtroEstado)
        : preps

    const kpis = {
        total:      preps.length,
        pendientes: preps.filter(p => p.estado === 'PENDIENTE').length,
        facturadas: preps.filter(p => p.estado === 'FACTURADA').length,
        anuladas:   preps.filter(p => p.estado === 'ANULADA').length,
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <FlaskConical className="w-6 h-6 text-primary-600" />
                        Preparaciones de Pintura
                    </h1>
                    <p className="text-sm text-slate-500 mt-0.5">Mini-producción de pinturas automotrices</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={load}
                        disabled={loading}
                        className="p-2.5 hover:bg-slate-100 rounded-xl transition-colors text-slate-500"
                    >
                        <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
                    </button>
                    <button
                        onClick={() => navigate('/preparaciones-pintura/nueva')}
                        className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-xl font-semibold text-sm hover:bg-primary-700 transition-colors shadow-sm"
                    >
                        <Plus className="w-4 h-4" /> Nueva Preparación
                    </button>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                    { label: 'Total',      value: kpis.total,      color: 'text-slate-700',    bg: 'bg-slate-50'  },
                    { label: 'Pendientes', value: kpis.pendientes, color: 'text-amber-700',    bg: 'bg-amber-50'  },
                    { label: 'Facturadas', value: kpis.facturadas, color: 'text-emerald-700',  bg: 'bg-emerald-50'},
                    { label: 'Anuladas',   value: kpis.anuladas,   color: 'text-slate-500',    bg: 'bg-slate-50'  },
                ].map(k => (
                    <div key={k.label} className={cn('rounded-2xl p-5 border border-slate-100', k.bg)}>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{k.label}</p>
                        <p className={cn('text-3xl font-black mt-1', k.color)}>{k.value}</p>
                    </div>
                ))}
            </div>

            {/* Filtros de fecha */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center gap-3">
                <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                {/* Botones rápidos */}
                {([
                    { key: 'hoy',    label: 'Hoy'    },
                    { key: 'semana', label: 'Semana' },
                    { key: 'mes',    label: 'Mes'    },
                    { key: 'todo',   label: 'Todo'   },
                ] as const).map(r => (
                    <button
                        key={r.key}
                        onClick={() => aplicarRango(r.key)}
                        className={cn(
                            'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                            rangoActivo === r.key
                                ? 'bg-primary-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        )}
                    >
                        {r.label}
                    </button>
                ))}

                {/* Separador */}
                <div className="w-px h-5 bg-slate-200 hidden sm:block" />

                {/* Calendarios */}
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Desde</span>
                    <input
                        type="date"
                        value={desde}
                        onChange={e => handleDesdeChange(e.target.value)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:ring-2 focus:ring-primary-500"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Hasta</span>
                    <input
                        type="date"
                        value={hasta}
                        onChange={e => handleHastaChange(e.target.value)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:ring-2 focus:ring-primary-500"
                    />
                </div>
            </div>

            {/* Filtro por estado */}
            <div className="flex gap-2 flex-wrap">
                {(['', 'PENDIENTE', 'PROFORMADA', 'FACTURADA', 'ANULADA'] as const).map(e => (
                    <button
                        key={e}
                        onClick={() => setFiltroEstado(e)}
                        className={cn(
                            'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                            filtroEstado === e
                                ? 'bg-primary-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        )}
                    >
                        {e === '' ? 'Todos' : ESTADO_LABEL[e]}
                    </button>
                ))}
            </div>

            {/* Lista */}
            {loading ? (
                <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" /> Cargando…
                </div>
            ) : lista.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                    <FlaskConical className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="font-semibold">No hay preparaciones</p>
                    <p className="text-sm mt-1">
                        {desde || hasta
                            ? 'No hay preparaciones en el período seleccionado.'
                            : 'Cree una nueva preparación de pintura para comenzar.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {lista.map(prep => (
                        <div key={prep.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                            {/* Fila principal */}
                            <div className="p-5 flex items-start gap-4">
                                {/* Info */}
                                <div className="flex-1 min-w-0 space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-bold', ESTADO_COLOR[prep.estado])}>
                                            {ESTADO_LABEL[prep.estado]}
                                        </span>
                                        <span className="text-xs text-slate-400">
                                            {new Date(prep.created_at).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </span>
                                    </div>
                                    <p className="font-semibold text-slate-800 text-sm leading-tight">{prep.descripcion}</p>
                                    <div className="flex items-center gap-4 text-xs text-slate-500 flex-wrap">
                                        <span>Presentación: <strong>{prep.unidad}</strong></span>
                                        <span>Costo: <strong className="text-amber-700">{formatCurrency(prep.costo_total)}</strong></span>
                                        {prep.precio_con_iva && (
                                            <span>Precio: <strong className="text-primary-700">{formatCurrency(prep.precio_con_iva)}</strong></span>
                                        )}
                                        <span>IVA: {prep.iva_porcentaje}%</span>
                                    </div>
                                </div>

                                {/* Acciones */}
                                <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                                    {prep.estado === 'PENDIENTE' && (
                                        <>
                                            <button
                                                onClick={() => navigate(`/nueva-factura?prep_id=${prep.id}`)}
                                                className="flex items-center gap-1.5 px-3 py-2 bg-primary-50 text-primary-700 rounded-lg text-xs font-semibold hover:bg-primary-100 transition-colors"
                                            >
                                                <FileText className="w-3.5 h-3.5" /> Facturar
                                            </button>
                                            <button
                                                onClick={() => navigate(`/proformas?prep_id=${prep.id}`)}
                                                className="flex items-center gap-1.5 px-3 py-2 bg-violet-50 text-violet-700 rounded-lg text-xs font-semibold hover:bg-violet-100 transition-colors"
                                            >
                                                <FileText className="w-3.5 h-3.5" /> Proformar
                                            </button>
                                            <button
                                                onClick={() => handleAnular(prep)}
                                                disabled={anulando === prep.id}
                                                className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100 transition-colors disabled:opacity-50"
                                            >
                                                {anulando === prep.id
                                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    : <Trash2 className="w-3.5 h-3.5" />}
                                                Anular
                                            </button>
                                        </>
                                    )}
                                    {prep.estado === 'PROFORMADA' && (
                                        <button
                                            onClick={() => navigate('/proformas')}
                                            className="flex items-center gap-1.5 px-3 py-2 bg-violet-50 text-violet-700 rounded-lg text-xs font-semibold hover:bg-violet-100 transition-colors"
                                        >
                                            <FileText className="w-3.5 h-3.5" /> Ver Proforma
                                        </button>
                                    )}
                                    {prep.estado === 'FACTURADA' && (
                                        <button
                                            onClick={() => navigate('/facturacion')}
                                            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-semibold hover:bg-emerald-100 transition-colors"
                                        >
                                            <FileText className="w-3.5 h-3.5" /> Ver Factura
                                        </button>
                                    )}

                                    {/* Expandir detalles */}
                                    <button
                                        onClick={() => toggleExpand(prep)}
                                        className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400"
                                    >
                                        {expanded === prep.id
                                            ? <ChevronUp className="w-4 h-4" />
                                            : <ChevronDown className="w-4 h-4" />}
                                    </button>
                                </div>
                            </div>

                            {/* Detalle expandido */}
                            {expanded === prep.id && (
                                <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">
                                    {loadingDetail === prep.id ? (
                                        <div className="flex items-center gap-2 text-slate-400 text-sm">
                                            <Loader2 className="w-4 h-4 animate-spin" /> Cargando detalle…
                                        </div>
                                    ) : detailMap[prep.id]?.insumos?.length ? (
                                        <div className="space-y-2">
                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                                <Info className="w-3 h-3" /> Insumos utilizados
                                            </p>
                                            <table className="w-full text-xs">
                                                <thead>
                                                    <tr className="text-left text-slate-500 border-b border-slate-200">
                                                        <th className="pb-1.5 font-semibold">Tipo</th>
                                                        <th className="pb-1.5 font-semibold">Artículo</th>
                                                        <th className="pb-1.5 font-semibold text-right">Cantidad</th>
                                                        <th className="pb-1.5 font-semibold text-right">C.Unit.</th>
                                                        <th className="pb-1.5 font-semibold text-right">C.Total</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {detailMap[prep.id].insumos!.map((ins, i) => (
                                                        <tr key={i} className="border-b border-slate-100 last:border-0">
                                                            <td className="py-1.5">
                                                                <span className={cn(
                                                                    'px-1.5 py-0.5 rounded text-[10px] font-bold',
                                                                    ins.tipo === 'BASE' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                                                                )}>
                                                                    {ins.tipo}
                                                                </span>
                                                            </td>
                                                            <td className="py-1.5 font-semibold text-slate-700">{ins.descripcion || ins.producto?.nombre}</td>
                                                            <td className="py-1.5 text-right">{ins.cantidad} {ins.unidad}</td>
                                                            <td className="py-1.5 text-right">{formatCurrency(ins.costo_unitario)}</td>
                                                            <td className="py-1.5 text-right font-semibold">{formatCurrency(ins.costo_total)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot>
                                                    <tr className="font-black text-slate-800 border-t-2 border-slate-300">
                                                        <td colSpan={4} className="pt-2 text-right">Costo Total:</td>
                                                        <td className="pt-2 text-right">{formatCurrency(prep.costo_total)}</td>
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    ) : (
                                        <p className="text-sm text-slate-400 italic">Sin detalle de insumos.</p>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
