import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
    AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, Legend,
    ResponsiveContainer, LineChart, Line, ReferenceLine,
} from 'recharts'
import {
    TrendingUp, TrendingDown, Minus,
    DollarSign, ShoppingCart, BarChart2, FileText,
    CreditCard, Users, RefreshCw, ChevronDown, ChevronUp,
    AlertTriangle, Award, Zap,
} from 'lucide-react'
import {
    dashboardService,
    calcPeriodo,
    linReg,
    type PeriodoPreset,
    type DashKpis,
    type DashMensual,
    type DashProducto,
    type DashVendedor,
    type DashPago,
} from '../services/dashboardService'
import { formatCurrency } from '../lib/utils'
import { cn } from '../lib/utils'

// ─── Paleta de colores ────────────────────────────────────────────────────────
const C = {
    ventas: '#3b82f6',
    costo: '#f97316',
    margen: '#10b981',
    previo: '#cbd5e1',
    purple: '#8b5cf6',
    amber: '#f59e0b',
    teal: '#14b8a6',
    red: '#ef4444',
}
const PIE_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#64748b']

// ─── Helpers de formato ────────────────────────────────────────────────────────
const fc = (v: number) => formatCurrency(v)
const fp = (v: number) => `${v.toFixed(1)}%`
const fn = (v: number) => v.toLocaleString('en-US')

function pctChange(curr: number, prev: number) {
    if (prev === 0) return null
    return ((curr - prev) / prev) * 100
}

// ─── Tooltip personalizado para recharts ─────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    return (
        <div className="bg-slate-900 text-white text-xs rounded-xl shadow-2xl p-3 border border-slate-700 min-w-[160px]">
            <p className="font-bold mb-2 text-slate-300">{label}</p>
            {payload.map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
                        {p.name}
                    </span>
                    <span className="font-bold">{fc(p.value)}</span>
                </div>
            ))}
        </div>
    )
}

function PieTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null
    const p = payload[0]
    return (
        <div className="bg-slate-900 text-white text-xs rounded-xl shadow-2xl p-3 border border-slate-700">
            <p className="font-bold">{p.name}</p>
            <p className="text-slate-300">{fc(p.value)} · {p.payload.pct}%</p>
        </div>
    )
}

// ─── Componente: Badge de tendencia ──────────────────────────────────────────
function TrendBadge({ pct }: { pct: number | null }) {
    if (pct === null) return <span className="text-xs text-slate-400">—</span>
    const abs = Math.abs(pct).toFixed(1)
    if (pct > 1) return (
        <span className="flex items-center gap-0.5 text-emerald-600 text-xs font-bold">
            <TrendingUp className="w-3 h-3" />+{abs}%
        </span>
    )
    if (pct < -1) return (
        <span className="flex items-center gap-0.5 text-red-500 text-xs font-bold">
            <TrendingDown className="w-3 h-3" />{pct.toFixed(1)}%
        </span>
    )
    return (
        <span className="flex items-center gap-0.5 text-slate-400 text-xs font-bold">
            <Minus className="w-3 h-3" />{abs}%
        </span>
    )
}

// ─── Componente: KPI Card ─────────────────────────────────────────────────────
interface KpiProps {
    label: string
    value: string
    sub?: string
    trend?: number | null
    trendLabel?: string
    icon: React.ElementType
    iconBg: string
    iconColor: string
    accent: string
}

function KpiCard({ label, value, sub, trend, trendLabel, icon: Icon, iconBg, iconColor, accent }: KpiProps) {
    return (
        <div className={`bg-white rounded-2xl border-l-4 ${accent} shadow-sm p-5 flex flex-col gap-2 hover:shadow-md transition-shadow`}>
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${iconBg}`}>
                    <Icon className={`w-4 h-4 ${iconColor}`} />
                </div>
            </div>
            <p className="text-2xl font-black text-slate-900 leading-none">{value}</p>
            {sub && <p className="text-[11px] text-slate-400">{sub}</p>}
            {trend !== undefined && (
                <div className="flex items-center gap-2 pt-1.5 border-t border-slate-50">
                    <TrendBadge pct={trend ?? null} />
                    {trendLabel && <span className="text-[10px] text-slate-400">{trendLabel}</span>}
                </div>
            )}
        </div>
    )
}

// ─── Componente: Section card ─────────────────────────────────────────────────
function Card({ title, subtitle, children, className = '', action }: {
    title: string; subtitle?: string; children: React.ReactNode; className?: string; action?: React.ReactNode
}) {
    return (
        <div className={`bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden ${className}`}>
            <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-black text-slate-800">{title}</h3>
                    {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
                </div>
                {action}
            </div>
            <div className="p-6">{children}</div>
        </div>
    )
}

// ─── Presets de período ───────────────────────────────────────────────────────
const PRESETS: { key: PeriodoPreset; label: string }[] = [
    { key: 'mes_actual', label: 'Este mes' },
    { key: 'mes_anterior', label: 'Mes ant.' },
    { key: 'trimestre_actual', label: 'Trimestre' },
    { key: 'año_actual', label: 'Este año' },
    { key: 'año_anterior', label: 'Año ant.' },
]

// ─── Página principal ─────────────────────────────────────────────────────────
export function DashboardGerencialPage() {
    const { empresa } = useAuth()
    const [preset, setPreset] = useState<PeriodoPreset>('mes_actual')
    const [loading, setLoading] = useState(true)
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

    const [kpis, setKpis] = useState<DashKpis | null>(null)
    const [mensuales, setMensuales] = useState<DashMensual[]>([])
    const [productos, setProductos] = useState<DashProducto[]>([])
    const [vendedores, setVendedores] = useState<DashVendedor[]>([])
    const [pagos, setPagos] = useState<DashPago[]>([])
    const [sortProd, setSortProd] = useState<'ventas' | 'margen' | 'unidades' | 'rotacion'>('ventas')
    const [prodAsc, setProdAsc] = useState(false)
    const [showAllProd, setShowAllProd] = useState(false)

    const periodo = calcPeriodo(preset)

    const loadData = useCallback(async () => {
        if (!empresa?.id) return
        setLoading(true)
        try {
            const { inicio, fin, prevInicio, prevFin } = periodo
            const [k, m, p, v, pg] = await Promise.all([
                dashboardService.loadKpis(empresa.id, inicio, fin, prevInicio, prevFin),
                dashboardService.loadMensuales(empresa.id),
                dashboardService.loadProductos(empresa.id, inicio, fin),
                dashboardService.loadVendedores(empresa.id, inicio, fin),
                dashboardService.loadPagos(empresa.id, inicio, fin),
            ])
            setKpis(k)
            setMensuales(m)
            setProductos(p)
            setVendedores(v)
            setPagos(pg)
            setLastUpdate(new Date())
        } catch (e) {
            console.error('Dashboard error:', e)
        } finally {
            setLoading(false)
        }
    }, [empresa?.id, preset])

    useEffect(() => { loadData() }, [loadData])

    // Datos para gráfico de predicción (últimos 6 meses + siguiente mes proyectado)
    const predData = (() => {
        if (mensuales.length < 3) return []
        const last6 = mensuales.slice(-6)
        const values = last6.map(m => m.ventas)
        const predict = linReg(values)
        const nextVal = Math.round(predict(values.length + 1) * 100) / 100
        return [
            ...last6.map((m, i) => ({
                label: m.label,
                ventas: m.ventas,
                proyeccion: null as number | null,
                linea: Math.round(predict(i + 1) * 100) / 100,
            })),
            {
                label: (() => {
                    const last = mensuales[mensuales.length - 1]?.mes || ''
                    const [y, mo] = last.split('-').map(Number)
                    const next = new Date(y, mo, 1)
                    const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
                    return `${MESES[next.getMonth()]} ${next.getFullYear().toString().slice(2)}`
                })(),
                ventas: null as number | null,
                proyeccion: nextVal,
                linea: nextVal,
            },
        ]
    })()

    // Productos sorted
    const prodSorted = [...productos].sort((a, b) => {
        const v = sortProd === 'ventas' ? a.ventas - b.ventas
            : sortProd === 'margen' ? a.margen_pct - b.margen_pct
            : sortProd === 'unidades' ? a.unidades - b.unidades
            : a.rotacion - b.rotacion
        return prodAsc ? v : -v
    })
    const prodDisplay = showAllProd ? prodSorted : prodSorted.slice(0, 10)

    // Productos de baja rotación
    const bajaRotacion = productos
        .filter(p => p.stock_actual > 0 && p.unidades < p.stock_actual * 0.1)
        .sort((a, b) => a.rotacion - b.rotacion)
        .slice(0, 8)

    if (loading && !kpis) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center space-y-3">
                    <div className="w-12 h-12 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto" />
                    <p className="text-slate-500 text-sm">Cargando dashboard…</p>
                </div>
            </div>
        )
    }

    const margenPct = kpis && kpis.ventas > 0 ? (kpis.margen / kpis.ventas) * 100 : 0

    // Predicción siguiente mes
    const predNext = predData[predData.length - 1]?.proyeccion ?? 0
    const predPrev = mensuales[mensuales.length - 1]?.ventas ?? 0
    const predChange = pctChange(predNext, predPrev)

    return (
        <div className="space-y-6 pb-8">

            {/* ── Header ─────────────────────────────────────────── */}
            <div className="bg-gradient-to-r from-slate-800 via-slate-900 to-slate-800 rounded-2xl p-6 text-white shadow-xl">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-black tracking-tight">Dashboard Gerencial</h1>
                        <p className="text-slate-400 text-sm mt-1">
                            {empresa?.nombre} · Período: <span className="text-white font-semibold capitalize">{periodo.label}</span>
                        </p>
                        <p className="text-slate-500 text-[11px] mt-0.5">
                            Actualizado: {lastUpdate.toLocaleTimeString('es-EC')}
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {/* Selector de período */}
                        <div className="flex bg-slate-700/60 rounded-xl p-1 gap-1">
                            {PRESETS.map(p => (
                                <button
                                    key={p.key}
                                    onClick={() => setPreset(p.key)}
                                    className={cn(
                                        'px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                                        preset === p.key
                                            ? 'bg-primary-600 text-white shadow'
                                            : 'text-slate-300 hover:bg-slate-600/60 hover:text-white'
                                    )}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={loadData}
                            disabled={loading}
                            className="p-2.5 bg-slate-700/60 hover:bg-slate-600 rounded-xl transition-colors text-slate-300 hover:text-white"
                            title="Refrescar"
                        >
                            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
                        </button>
                    </div>
                </div>
            </div>

            {/* ── KPI Cards ──────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
                <KpiCard
                    label="Ventas Netas"
                    value={fc(kpis?.ventas ?? 0)}
                    sub={`${fn(kpis?.facturas ?? 0)} facturas`}
                    trend={pctChange(kpis?.ventas ?? 0, kpis?.ventas_prev ?? 0)}
                    trendLabel="vs período ant."
                    icon={DollarSign}
                    iconBg="bg-blue-50" iconColor="text-blue-600"
                    accent="border-blue-500"
                />
                <KpiCard
                    label="Costo de Ventas"
                    value={fc(kpis?.costo ?? 0)}
                    sub={`${fp((kpis?.ventas ?? 0) > 0 ? ((kpis?.costo ?? 0) / (kpis?.ventas ?? 1)) * 100 : 0)} de ventas`}
                    icon={ShoppingCart}
                    iconBg="bg-orange-50" iconColor="text-orange-600"
                    accent="border-orange-400"
                />
                <KpiCard
                    label="Margen Bruto"
                    value={fc(kpis?.margen ?? 0)}
                    sub={`Rentabilidad ${fp(margenPct)}`}
                    icon={BarChart2}
                    iconBg={margenPct >= 30 ? 'bg-emerald-50' : margenPct >= 15 ? 'bg-amber-50' : 'bg-red-50'}
                    iconColor={margenPct >= 30 ? 'text-emerald-600' : margenPct >= 15 ? 'text-amber-600' : 'text-red-600'}
                    accent={margenPct >= 30 ? 'border-emerald-500' : margenPct >= 15 ? 'border-amber-400' : 'border-red-400'}
                />
                <KpiCard
                    label="Facturas"
                    value={fn(kpis?.facturas ?? 0)}
                    trend={pctChange(kpis?.facturas ?? 0, kpis?.facturas_prev ?? 0)}
                    trendLabel="vs período ant."
                    icon={FileText}
                    iconBg="bg-slate-100" iconColor="text-slate-600"
                    accent="border-slate-400"
                />
                <KpiCard
                    label="Ticket Promedio"
                    value={fc(kpis?.ticket_promedio ?? 0)}
                    icon={CreditCard}
                    iconBg="bg-violet-50" iconColor="text-violet-600"
                    accent="border-violet-400"
                />
                <KpiCard
                    label="Clientes Únicos"
                    value={fn(kpis?.clientes_unicos ?? 0)}
                    sub="compraron en el período"
                    icon={Users}
                    iconBg="bg-teal-50" iconColor="text-teal-600"
                    accent="border-teal-400"
                />
            </div>

            {/* ── Evolución 12 meses + Forma de pago ───────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

                {/* Área chart — evolución anual */}
                <Card
                    title="Evolución de Ventas — Últimos 12 Meses"
                    subtitle="Ventas, costo de ventas y margen bruto mensual"
                    className="xl:col-span-2"
                >
                    <ResponsiveContainer width="100%" height={280}>
                        <AreaChart data={mensuales} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                            <defs>
                                <linearGradient id="gVentas" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={C.ventas} stopOpacity={0.25} />
                                    <stop offset="95%" stopColor={C.ventas} stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="gCosto" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={C.costo} stopOpacity={0.2} />
                                    <stop offset="95%" stopColor={C.costo} stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="gMargen" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={C.margen} stopOpacity={0.25} />
                                    <stop offset="95%" stopColor={C.margen} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                            <Area type="monotone" dataKey="ventas" name="Ventas" stroke={C.ventas} strokeWidth={2.5} fill="url(#gVentas)" dot={false} />
                            <Area type="monotone" dataKey="costo" name="Costo" stroke={C.costo} strokeWidth={2} fill="url(#gCosto)" dot={false} />
                            <Area type="monotone" dataKey="margen" name="Margen" stroke={C.margen} strokeWidth={2} fill="url(#gMargen)" dot={false} />
                        </AreaChart>
                    </ResponsiveContainer>
                </Card>

                {/* Donut — Formas de pago */}
                <Card title="Formas de Cobro" subtitle="Distribución del período seleccionado">
                    {pagos.length === 0 ? (
                        <div className="h-[280px] flex items-center justify-center text-slate-400 text-sm">Sin datos</div>
                    ) : (
                        <div className="space-y-4">
                            <ResponsiveContainer width="100%" height={180}>
                                <PieChart>
                                    <Pie
                                        data={pagos} cx="50%" cy="50%"
                                        innerRadius={50} outerRadius={80}
                                        dataKey="valor" nameKey="metodo"
                                        paddingAngle={2}
                                    >
                                        {pagos.map((_, i) => (
                                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<PieTooltip />} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="space-y-2">
                                {pagos.map((p, i) => (
                                    <div key={i} className="flex items-center justify-between text-xs">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                                            <span className="text-slate-600 font-medium">{p.metodo}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-slate-400">{p.pct}%</span>
                                            <span className="font-bold text-slate-800">{fc(p.valor)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </Card>
            </div>

            {/* ── Vendedores + Top Productos ────────────────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

                {/* Barras vendedores */}
                <Card title="Rendimiento por Vendedor" subtitle="Ventas netas del período">
                    {vendedores.length === 0 ? (
                        <div className="h-[220px] flex items-center justify-center">
                            <div className="text-center space-y-2 text-slate-400">
                                <Users className="w-8 h-8 mx-auto opacity-40" />
                                <p className="text-sm">Sin vendedores asignados en este período</p>
                            </div>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={Math.max(220, vendedores.length * 52)}>
                            <BarChart data={vendedores} layout="vertical" margin={{ top: 0, right: 60, left: 8, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                                    tickFormatter={v => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} />
                                <YAxis type="category" dataKey="nombre" tick={{ fontSize: 11, fill: '#374151' }} axisLine={false} tickLine={false} width={100} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="ventas" name="Ventas" fill={C.ventas} radius={[0, 6, 6, 0]} barSize={22}>
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                    {/* Tabla resumen vendedores */}
                    {vendedores.length > 0 && (
                        <div className="mt-4 border-t border-slate-50 pt-4">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="text-slate-400 uppercase text-[10px] tracking-wider">
                                        <th className="text-left pb-2">Vendedor</th>
                                        <th className="text-right pb-2">Facturas</th>
                                        <th className="text-right pb-2">Ticket Prom.</th>
                                        <th className="text-right pb-2">Ventas</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {vendedores.map((v, i) => (
                                        <tr key={i}>
                                            <td className="py-1.5 font-semibold text-slate-700 flex items-center gap-1.5">
                                                {i === 0 && <Award className="w-3 h-3 text-amber-500" />}
                                                {v.nombre}
                                            </td>
                                            <td className="py-1.5 text-right text-slate-500">{v.facturas}</td>
                                            <td className="py-1.5 text-right text-slate-500">{fc(v.ticket_promedio)}</td>
                                            <td className="py-1.5 text-right font-bold text-slate-800">{fc(v.ventas)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>

                {/* Top productos por ventas */}
                <Card title="Top 10 Artículos por Ventas" subtitle="Productos con mayor ingreso en el período">
                    {productos.length === 0 ? (
                        <div className="h-[220px] flex items-center justify-center text-slate-400 text-sm">Sin datos</div>
                    ) : (
                        <ResponsiveContainer width="100%" height={Math.max(220, Math.min(productos.slice(0, 10).length * 34, 360))}>
                            <BarChart
                                data={productos.slice(0, 10)}
                                layout="vertical"
                                margin={{ top: 0, right: 60, left: 8, bottom: 0 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                                <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                                    tickFormatter={v => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} />
                                <YAxis type="category" dataKey="nombre" tick={{ fontSize: 10, fill: '#374151' }} axisLine={false} tickLine={false} width={120}
                                    tickFormatter={v => v.length > 18 ? v.substring(0, 17) + '…' : v} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="ventas" name="Ventas" fill={C.teal} radius={[0, 6, 6, 0]} barSize={18} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </Card>
            </div>

            {/* ── Análisis de Rentabilidad por Producto ─────────── */}
            <Card
                title="Análisis de Rentabilidad por Producto"
                subtitle={`${periodo.label} · ${prodSorted.length} artículos vendidos`}
                action={
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">Ordenar por:</span>
                        {(['ventas', 'margen', 'unidades', 'rotacion'] as const).map(k => (
                            <button
                                key={k}
                                onClick={() => { if (sortProd === k) setProdAsc(!prodAsc); else { setSortProd(k); setProdAsc(false) } }}
                                className={cn(
                                    'px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1',
                                    sortProd === k ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                )}
                            >
                                {k === 'ventas' ? 'Ventas $' : k === 'margen' ? 'Margen %' : k === 'unidades' ? 'Unidades' : 'Rotación'}
                                {sortProd === k && (prodAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
                            </button>
                        ))}
                    </div>
                }
            >
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="bg-slate-50 text-slate-400 uppercase text-[10px] tracking-wider">
                                <th className="px-4 py-3 text-left font-semibold rounded-l-lg">#</th>
                                <th className="px-4 py-3 text-left font-semibold">Producto</th>
                                <th className="px-4 py-3 text-right font-semibold">Unidades</th>
                                <th className="px-4 py-3 text-right font-semibold">Ventas</th>
                                <th className="px-4 py-3 text-right font-semibold">Costo</th>
                                <th className="px-4 py-3 text-right font-semibold">Margen $</th>
                                <th className="px-4 py-3 text-right font-semibold">Margen %</th>
                                <th className="px-4 py-3 text-right font-semibold">Stock</th>
                                <th className="px-4 py-3 text-right font-semibold rounded-r-lg">Rotación</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {prodDisplay.map((p, i) => {
                                const mgColor = p.margen_pct >= 40 ? 'text-emerald-600 bg-emerald-50'
                                    : p.margen_pct >= 20 ? 'text-blue-600 bg-blue-50'
                                    : p.margen_pct >= 0 ? 'text-amber-600 bg-amber-50'
                                    : 'text-red-600 bg-red-50'
                                return (
                                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-4 py-2.5 text-slate-300 font-mono">{i + 1}</td>
                                        <td className="px-4 py-2.5 font-semibold text-slate-700 max-w-[200px] truncate">{p.nombre}</td>
                                        <td className="px-4 py-2.5 text-right text-slate-600">{fn(p.unidades)}</td>
                                        <td className="px-4 py-2.5 text-right font-bold text-slate-800">{fc(p.ventas)}</td>
                                        <td className="px-4 py-2.5 text-right text-orange-600">{p.costo > 0 ? fc(p.costo) : '—'}</td>
                                        <td className="px-4 py-2.5 text-right font-bold text-emerald-700">{p.costo > 0 ? fc(p.margen) : '—'}</td>
                                        <td className="px-4 py-2.5 text-right">
                                            {p.costo > 0 ? (
                                                <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black ${mgColor}`}>
                                                    {fp(p.margen_pct)}
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td className="px-4 py-2.5 text-right text-slate-500">{fn(p.stock_actual)}</td>
                                        <td className="px-4 py-2.5 text-right">
                                            <span className={cn(
                                                'font-bold',
                                                p.rotacion >= 2 ? 'text-emerald-600' : p.rotacion >= 0.5 ? 'text-blue-500' : 'text-amber-500'
                                            )}>
                                                {p.rotacion >= 999 ? '∞' : p.rotacion.toFixed(1)}x
                                            </span>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
                {prodSorted.length > 10 && (
                    <div className="mt-4 text-center">
                        <button
                            onClick={() => setShowAllProd(!showAllProd)}
                            className="text-xs text-primary-600 hover:text-primary-800 font-bold flex items-center gap-1 mx-auto"
                        >
                            {showAllProd ? <><ChevronUp className="w-3 h-3" />Ver menos</> : <><ChevronDown className="w-3 h-3" />Ver todos ({prodSorted.length})</>}
                        </button>
                    </div>
                )}
            </Card>

            {/* ── Predicción + Baja Rotación ────────────────────── */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

                {/* Proyección siguiente mes */}
                <Card
                    title="Proyección — Siguiente Mes"
                    subtitle="Regresión lineal sobre últimos 6 meses"
                    action={
                        predNext > 0 && (
                            <div className="text-right">
                                <p className="text-lg font-black text-slate-800">{fc(predNext)}</p>
                                <div className="flex items-center justify-end gap-1">
                                    <TrendBadge pct={predChange} />
                                    <span className="text-[10px] text-slate-400">vs mes actual</span>
                                </div>
                            </div>
                        )
                    }
                >
                    {predData.length < 3 ? (
                        <div className="h-[220px] flex items-center justify-center">
                            <div className="text-center space-y-2 text-slate-400">
                                <Zap className="w-8 h-8 mx-auto opacity-40" />
                                <p className="text-sm">Se necesitan al menos 3 meses de datos</p>
                            </div>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={220}>
                            <LineChart data={predData} margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                                    tickFormatter={v => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} />
                                <Tooltip content={<CustomTooltip />} />
                                <ReferenceLine x={predData[predData.length - 1]?.label} stroke="#cbd5e1" strokeDasharray="4 4" label={{ value: 'Proyectado', fontSize: 10, fill: '#94a3b8' }} />
                                <Line type="monotone" dataKey="ventas" name="Ventas reales" stroke={C.ventas} strokeWidth={2.5} dot={{ fill: C.ventas, r: 4 }} connectNulls={false} />
                                <Line type="monotone" dataKey="linea" name="Tendencia" stroke={C.previo} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                                <Line type="monotone" dataKey="proyeccion" name="Proyección" stroke={C.amber} strokeWidth={2.5} dot={{ fill: C.amber, r: 6, strokeWidth: 2, stroke: '#fff' }} connectNulls={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </Card>

                {/* Artículos con baja rotación */}
                <Card
                    title="Artículos de Baja Rotación"
                    subtitle="Stock disponible con pocas ventas en el período"
                    action={
                        bajaRotacion.length > 0 && (
                            <span className="flex items-center gap-1 text-amber-600 text-xs font-bold bg-amber-50 px-2.5 py-1 rounded-lg">
                                <AlertTriangle className="w-3 h-3" />
                                {bajaRotacion.length} artículos
                            </span>
                        )
                    }
                >
                    {bajaRotacion.length === 0 ? (
                        <div className="h-[200px] flex items-center justify-center">
                            <div className="text-center space-y-2 text-emerald-500">
                                <TrendingUp className="w-8 h-8 mx-auto" />
                                <p className="text-sm font-semibold">¡Excelente rotación!</p>
                                <p className="text-xs text-slate-400">No hay artículos con baja rotación</p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {bajaRotacion.map((p, i) => {
                                const pct = p.stock_actual > 0 ? (p.unidades / p.stock_actual) * 100 : 0
                                return (
                                    <div key={i} className="flex items-center gap-3 p-2.5 bg-amber-50/50 rounded-xl">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold text-slate-700 truncate">{p.nombre}</p>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className="text-[10px] text-slate-400">Stock: <b className="text-slate-600">{fn(p.stock_actual)}</b></span>
                                                <span className="text-[10px] text-slate-400">Vendido: <b className="text-orange-600">{fn(p.unidades)}</b></span>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-xs font-black text-amber-600">{pct.toFixed(1)}%</p>
                                            <p className="text-[10px] text-slate-400">rotado</p>
                                        </div>
                                        <div className="w-1.5 h-8 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className="w-full bg-amber-400 rounded-full transition-all"
                                                style={{ height: `${Math.min(pct, 100)}%`, marginTop: `${100 - Math.min(pct, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </Card>
            </div>

            {/* ── Comparativo Ventas vs Costos por Mes ──────────── */}
            <Card
                title="Ventas vs Costos — Comparativo Mensual"
                subtitle="Análisis de rentabilidad mes a mes — últimos 12 meses"
            >
                <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={mensuales} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                            tickFormatter={v => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="ventas" name="Ventas" fill={C.ventas} radius={[4, 4, 0, 0]} barSize={18} />
                        <Bar dataKey="costo" name="Costo" fill={C.costo} radius={[4, 4, 0, 0]} barSize={18} />
                        <Bar dataKey="margen" name="Margen" fill={C.margen} radius={[4, 4, 0, 0]} barSize={18} />
                    </BarChart>
                </ResponsiveContainer>
            </Card>

        </div>
    )
}
