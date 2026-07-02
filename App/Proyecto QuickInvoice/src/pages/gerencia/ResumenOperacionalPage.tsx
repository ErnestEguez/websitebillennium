import { useState, useCallback, useRef } from 'react'
import { useReactToPrint } from 'react-to-print'
import * as XLSX from 'xlsx'
import {
    ResponsiveContainer,
    BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
    PieChart, Pie, Cell,
} from 'recharts'
import {
    TrendingUp, TrendingDown, Minus, RefreshCw, Loader2,
    Settings, Plus, Trash2, Save, Download, Printer,
    AlertTriangle, CheckCircle, AlertCircle, XCircle,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { formatMoneda } from '../../lib/utils'
import { cn } from '../../lib/utils'
import {
    getResumenCompleto, guardarGastosManuales, guardarUmbrales,
    type ResumenCompleto, type GastoManual, type UmbralesGerencia,
} from '../../services/gerencia/resumenOperacionalService'

// ─── helpers ─────────────────────────────────────────────────────────────────

function hoy() { return new Date().toISOString().split('T')[0] }
function mesActual() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` }
function anioActual() { return String(new Date().getFullYear()) }

function fmtPct(v: number | null) {
    if (v === null) return '—'
    return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
}

// ─── Semáforo ─────────────────────────────────────────────────────────────────

const SEMAFORO_CONFIG = {
    saludable:   { label: 'Saludable',       color: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200', Icon: CheckCircle },
    observacion: { label: 'En observación',  color: 'bg-amber-400',   text: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',     Icon: AlertTriangle },
    riesgo:      { label: 'En riesgo',       color: 'bg-red-500',     text: 'text-red-700',     bg: 'bg-red-50 border-red-200',         Icon: AlertCircle },
    perdida:     { label: 'Pérdida',         color: 'bg-gray-700',    text: 'text-gray-700',    bg: 'bg-gray-100 border-gray-300',      Icon: XCircle },
}

// ─── Modal de umbrales ────────────────────────────────────────────────────────

function ModalUmbrales({ umbrales, onSave, onClose }: {
    umbrales: UmbralesGerencia
    onSave: (u: UmbralesGerencia) => void
    onClose: () => void
}) {
    const [saludable,   setSaludable]   = useState(String(umbrales.saludable))
    const [observacion, setObservacion] = useState(String(umbrales.observacion))

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
                <div className="flex items-center justify-between p-5 border-b">
                    <h2 className="font-bold text-slate-900">Configurar Semáforo</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
                </div>
                <div className="p-5 space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">🟢 Umbral Saludable (margen neto &gt; X%)</label>
                        <input type="number" min="0" max="100" step="0.5"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                            value={saludable} onChange={e => setSaludable(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">🟡 Umbral Observación (margen neto &gt; X%)</label>
                        <input type="number" min="0" max="100" step="0.5"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                            value={observacion} onChange={e => setObservacion(e.target.value)} />
                    </div>
                    <p className="text-xs text-slate-400">
                        🔴 Riesgo: margen entre 0% y {observacion}%<br/>
                        ⚫ Pérdida: margen negativo
                    </p>
                </div>
                <div className="flex justify-end gap-3 p-5 border-t">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                    <button
                        onClick={() => onSave({ saludable: Number(saludable), observacion: Number(observacion) })}
                        className="flex items-center gap-2 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                    >
                        <Save className="w-4 h-4" /> Guardar
                    </button>
                </div>
            </div>
        </div>
    )
}

// ─── Editor de Gastos Manuales ────────────────────────────────────────────────

const CATEGORIAS_SUGERIDAS = ['Arriendo', 'Sueldos', 'Servicios básicos', 'Comunicaciones', 'Publicidad', 'Transporte', 'Mantenimiento', 'Otros']

function EditorGastos({ gastos, onChange, onSave, saving }: {
    gastos: GastoManual[]
    onChange: (g: GastoManual[]) => void
    onSave: () => void
    saving: boolean
}) {
    function add()  { onChange([...gastos, { categoria: '', descripcion: '', valor: 0 }]) }
    function rem(i: number) { onChange(gastos.filter((_, j) => j !== i)) }
    function upd(i: number, field: keyof GastoManual, val: string | number) {
        onChange(gastos.map((g, j) => j === i ? { ...g, [field]: val } : g))
    }

    return (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-slate-700">Gastos Operacionales del Período</h3>
                <div className="flex gap-2">
                    <button onClick={add} className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50">
                        <Plus className="w-3.5 h-3.5" /> Agregar
                    </button>
                    <button onClick={onSave} disabled={saving}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Guardar
                    </button>
                </div>
            </div>
            <div className="space-y-2">
                {gastos.length === 0 && (
                    <p className="text-sm text-slate-400 py-4 text-center">Sin gastos registrados. Agrega los gastos del período.</p>
                )}
                {gastos.map((g, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-3 relative">
                            <input
                                list={`cat-list-${i}`}
                                className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                                placeholder="Categoría"
                                value={g.categoria}
                                onChange={e => upd(i, 'categoria', e.target.value)}
                            />
                            <datalist id={`cat-list-${i}`}>
                                {CATEGORIAS_SUGERIDAS.map(c => <option key={c} value={c} />)}
                            </datalist>
                        </div>
                        <input
                            className="col-span-5 px-2 py-1.5 border border-slate-200 rounded-lg text-sm"
                            placeholder="Descripción (opcional)"
                            value={g.descripcion}
                            onChange={e => upd(i, 'descripcion', e.target.value)}
                        />
                        <input
                            type="number" step="0.01" min="0"
                            className="col-span-3 px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-right font-mono"
                            placeholder="0.00"
                            value={g.valor || ''}
                            onChange={e => upd(i, 'valor', parseFloat(e.target.value) || 0)}
                        />
                        <button onClick={() => rem(i)} className="col-span-1 flex justify-center text-slate-400 hover:text-red-500">
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ))}
            </div>
            {gastos.length > 0 && (
                <div className="flex justify-between font-bold text-sm border-t border-slate-200 pt-3 mt-3">
                    <span>Total gastos</span>
                    <span className="font-mono">{formatMoneda(gastos.reduce((s,g)=>s+g.valor,0))}</span>
                </div>
            )}
        </div>
    )
}

// ─── Fila de la cascada P&L ───────────────────────────────────────────────────

function FilaPL({ linea }: { linea: any }) {
    const varPositiva = linea.linea?.signo === '-' ? linea.variacion < 0 : linea.variacion > 0
    const esResultado = linea.nivel === 'resultado'

    return (
        <tr className={cn(
            'border-b border-slate-100 text-sm',
            esResultado && 'bg-slate-50',
            linea.negrita && 'font-bold',
        )}>
            <td className={cn('px-4 py-2.5 text-slate-700', esResultado && 'text-slate-900')}>
                <span className={cn('text-xs mr-1', linea.signo === '+' ? 'text-emerald-600' : linea.signo === '-' ? 'text-red-500' : 'text-primary-600')}>
                    {linea.signo}
                </span>
                {linea.label}
            </td>
            <td className="px-4 py-2.5 text-right font-mono">
                {formatMoneda(linea.valor_actual)}
                {linea.pct_ingresos > 0 && linea.pct_ingresos !== 100 && (
                    <span className="text-xs text-slate-400 ml-1">({linea.pct_ingresos.toFixed(1)}%)</span>
                )}
            </td>
            <td className="px-4 py-2.5 text-right font-mono text-slate-400">
                {formatMoneda(linea.valor_anterior)}
            </td>
            <td className={cn('px-4 py-2.5 text-right font-mono', varPositiva ? 'text-emerald-600' : 'text-red-500')}>
                {linea.variacion !== 0 && (varPositiva ? <TrendingUp className="w-3.5 h-3.5 inline mr-1" /> : <TrendingDown className="w-3.5 h-3.5 inline mr-1" />)}
                {linea.variacion === 0 && <Minus className="w-3.5 h-3.5 inline mr-1 text-slate-300" />}
                {formatMoneda(Math.abs(linea.variacion))}
            </td>
            <td className={cn('px-4 py-2.5 text-right font-mono text-xs', varPositiva ? 'text-emerald-600' : 'text-red-500')}>
                {fmtPct(linea.pct_variacion)}
            </td>
        </tr>
    )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function ResumenOperacionalPage() {
    const { empresa } = useAuth()
    const printRef = useRef<HTMLDivElement>(null)

    const [tipo, setTipo]   = useState<'D' | 'M' | 'A'>('M')
    const [valor, setValor] = useState(mesActual())
    const [resumen, setResumen]   = useState<ResumenCompleto | null>(null)
    const [loading, setLoading]   = useState(false)
    const [savingG, setSavingG]   = useState(false)
    const [gastos, setGastos]     = useState<GastoManual[]>([])
    const [showUmbrales, setShowUmbrales] = useState(false)
    const [err, setErr]           = useState('')

    const handlePrint = useReactToPrint({ contentRef: printRef, documentTitle: `Resumen_Operacional_${valor}` })

    // ── Consultar ──
    const consultar = useCallback(async () => {
        if (!empresa?.id) return
        setLoading(true); setErr('')
        try {
            const data = await getResumenCompleto(empresa.id, tipo, valor)
            setResumen(data)
            setGastos(data.gastos_manuales)
        } catch (e: any) {
            setErr(e.message ?? 'Error al consultar')
        } finally {
            setLoading(false)
        }
    }, [empresa?.id, tipo, valor])

    // ── Guardar gastos ──
    async function handleSaveGastos() {
        if (!empresa?.id || !resumen) return
        setSavingG(true)
        try {
            await guardarGastosManuales(empresa.id, tipo, valor, gastos)
            await consultar()
        } finally {
            setSavingG(false)
        }
    }

    // ── Guardar umbrales ──
    async function handleSaveUmbrales(u: UmbralesGerencia) {
        if (!empresa?.id) return
        await guardarUmbrales(empresa.id, u)
        setShowUmbrales(false)
        await consultar()
    }

    // ── Exportar Excel ──
    function exportarExcel() {
        if (!resumen) return
        const rows = [
            [`RESUMEN OPERACIONAL — ${resumen.periodo_actual.label}`],
            [`Empresa: ${(empresa as any)?.nombre ?? ''}`],
            [],
            ['Rubro', 'Período Actual', '% Ingresos', 'Período Anterior', 'Variación $', 'Variación %'],
            ...resumen.lineas.map(l => [
                l.label,
                +l.valor_actual.toFixed(2),
                +l.pct_ingresos.toFixed(1),
                +l.valor_anterior.toFixed(2),
                +l.variacion.toFixed(2),
                l.pct_variacion !== null ? +l.pct_variacion.toFixed(1) : '',
            ]),
            [],
            ['TOP 5 CLIENTES', 'Ingresos'],
            ...resumen.top_clientes.map(c => [c.nombre, +c.total.toFixed(2)]),
            [],
            ['TOP 5 PRODUCTOS', 'Ingresos', 'Cantidad'],
            ...resumen.top_productos.map(p => [p.nombre, +p.total.toFixed(2), p.cantidad]),
        ]
        const ws = XLSX.utils.aoa_to_sheet(rows)
        ws['!cols'] = [40, 14, 10, 14, 14, 12].map(w => ({ wch: w }))
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
        ]
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Resumen Operacional')
        XLSX.writeFile(wb, `Resumen_Operacional_${valor}.xlsx`)
    }

    // ── Datos para gráficos ──
    const barData = resumen ? [
        {
            name: resumen.periodo_actual.label.substring(0, 12),
            Ingresos: +resumen.lineas[0].valor_actual.toFixed(2),
            'Costo de Ventas': +resumen.lineas[1].valor_actual.toFixed(2),
            'Gastos Oper.': +resumen.lineas[3].valor_actual.toFixed(2),
            'Resultado Neto': +resumen.lineas[8].valor_actual.toFixed(2),
        },
        {
            name: resumen.periodo_anterior.label.substring(0, 12),
            Ingresos: +resumen.lineas[0].valor_anterior.toFixed(2),
            'Costo de Ventas': +resumen.lineas[1].valor_anterior.toFixed(2),
            'Gastos Oper.': +resumen.lineas[3].valor_anterior.toFixed(2),
            'Resultado Neto': +resumen.lineas[8].valor_anterior.toFixed(2),
        },
    ] : []

    const sem = resumen ? SEMAFORO_CONFIG[resumen.estado_semaforo] : null
    const SemIcon = sem?.Icon

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <TrendingUp className="w-6 h-6 text-primary-600" />
                        Resumen Operacional
                    </h1>
                    <p className="text-slate-500 text-sm mt-0.5">Panel ejecutivo de ingresos y egresos</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    {resumen && (
                        <>
                            <button onClick={() => setShowUmbrales(true)}
                                className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">
                                <Settings className="w-4 h-4" /> Semáforo
                            </button>
                            <button onClick={exportarExcel}
                                className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">
                                <Download className="w-4 h-4" /> Excel
                            </button>
                            <button onClick={() => handlePrint()}
                                className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">
                                <Printer className="w-4 h-4" /> Imprimir
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Filtros */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-end gap-3">
                    {/* Tipo */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Período</label>
                        <div className="flex rounded-lg overflow-hidden border border-slate-200">
                            {([['D','Día'],['M','Mes'],['A','Año']] as [string,string][]).map(([t,l]) => (
                                <button key={t} onClick={() => { setTipo(t as any); setValor(t==='D'?hoy():t==='M'?mesActual():anioActual()) }}
                                    className={cn('px-4 py-2 text-sm font-medium transition-colors', tipo===t ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-50')}>
                                    {l}
                                </button>
                            ))}
                        </div>
                    </div>
                    {/* Selector de valor */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">
                            {tipo === 'D' ? 'Fecha' : tipo === 'M' ? 'Mes / Año' : 'Año'}
                        </label>
                        {tipo === 'D' && (
                            <input type="date" value={valor} onChange={e => setValor(e.target.value)}
                                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                        )}
                        {tipo === 'M' && (
                            <input type="month" value={valor} onChange={e => setValor(e.target.value)}
                                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                        )}
                        {tipo === 'A' && (
                            <select value={valor} onChange={e => setValor(e.target.value)}
                                className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none">
                                {Array.from({length:6},(_,i)=>String(new Date().getFullYear()-i)).map(y => (
                                    <option key={y} value={y}>{y}</option>
                                ))}
                            </select>
                        )}
                    </div>
                    <button onClick={consultar} disabled={loading}
                        className="flex items-center gap-2 px-5 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Generar
                    </button>
                </div>
                {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
            </div>

            {/* Semáforo */}
            {resumen && sem && SemIcon && (
                <div className={cn('rounded-xl border p-4 flex items-center gap-4', sem.bg)}>
                    <div className={cn('w-14 h-14 rounded-full flex items-center justify-center text-white flex-shrink-0', sem.color)}>
                        <SemIcon className="w-7 h-7" />
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center gap-3">
                            <span className={cn('font-bold text-lg', sem.text)}>{sem.label}</span>
                            <span className={cn('text-2xl font-bold font-mono', sem.text)}>{resumen.margen_neto.toFixed(1)}%</span>
                            <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium', sem.bg, sem.text)}>margen neto</span>
                        </div>
                        <p className={cn('text-sm mt-0.5', sem.text)}>{resumen.texto_semaforo}</p>
                    </div>
                    <div className="text-right text-sm hidden md:block">
                        <p className="text-slate-500 text-xs">{resumen.periodo_actual.label}</p>
                        <p className="font-bold font-mono text-lg">{formatMoneda(resumen.lineas[8].valor_actual)}</p>
                        <p className="text-xs text-slate-400">resultado neto</p>
                    </div>
                </div>
            )}

            {/* Tabla cascada P&L */}
            {resumen && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-5 py-3 border-b bg-slate-50 flex items-center justify-between">
                        <h3 className="font-semibold text-slate-700">Estado de Resultados Simplificado</h3>
                        {!resumen.tiene_contabilidad && (
                            <span className="text-xs px-2 py-1 bg-amber-100 text-amber-700 rounded-full border border-amber-200">
                                Sin módulo contable — costo desde inventario
                            </span>
                        )}
                    </div>
                    <table className="w-full text-sm">
                        <thead className="text-xs uppercase text-slate-500 border-b border-slate-200">
                            <tr>
                                <th className="px-4 py-3 text-left">Rubro</th>
                                <th className="px-4 py-3 text-right">{resumen.periodo_actual.label}</th>
                                <th className="px-4 py-3 text-right text-slate-400">{resumen.periodo_anterior.label}</th>
                                <th className="px-4 py-3 text-right">Variación $</th>
                                <th className="px-4 py-3 text-right">Var. %</th>
                            </tr>
                        </thead>
                        <tbody>
                            {resumen.lineas.map((l, i) => (
                                <FilaPL key={i} linea={l} />
                            ))}
                        </tbody>
                        {/* YTD */}
                        {tipo === 'M' && resumen.ytd_actual !== null && (
                            <tfoot>
                                <tr className="border-t-2 border-slate-300 bg-primary-50 font-medium text-sm">
                                    <td className="px-4 py-2.5 text-primary-700">Acumulado YTD (Ene — {valor.split('-')[1]} {valor.split('-')[0]})</td>
                                    <td className="px-4 py-2.5 text-right font-mono text-primary-700">{formatMoneda(resumen.ytd_actual!)}</td>
                                    <td className="px-4 py-2.5 text-right font-mono text-slate-400">{formatMoneda(resumen.ytd_anterior!)}</td>
                                    <td className={cn('px-4 py-2.5 text-right font-mono', (resumen.ytd_actual! - resumen.ytd_anterior!) >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                                        {formatMoneda(Math.abs(resumen.ytd_actual! - resumen.ytd_anterior!))}
                                    </td>
                                    <td className={cn('px-4 py-2.5 text-right font-mono text-xs', (resumen.ytd_actual! - resumen.ytd_anterior!) >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                                        {resumen.ytd_anterior! !== 0
                                            ? fmtPct((resumen.ytd_actual! - resumen.ytd_anterior!) / Math.abs(resumen.ytd_anterior!) * 100)
                                            : '—'}
                                    </td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            )}

            {/* Editor de gastos manuales */}
            {resumen && !resumen.tiene_contabilidad && (
                <EditorGastos
                    gastos={gastos}
                    onChange={setGastos}
                    onSave={handleSaveGastos}
                    saving={savingG}
                />
            )}

            {/* Gráficos */}
            {resumen && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Barras comparativas */}
                    <div className="bg-white rounded-xl border border-slate-200 p-5">
                        <h3 className="font-semibold text-slate-700 mb-4">Comparativo de Períodos</h3>
                        <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={barData} margin={{ top: 0, right: 0, left: 10, bottom: 0 }}>
                                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                                <Tooltip formatter={(v: any) => formatMoneda(v)} />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                <Bar dataKey="Ingresos"       fill="#3b82f6" radius={[3,3,0,0]} />
                                <Bar dataKey="Costo de Ventas" fill="#f43f5e" radius={[3,3,0,0]} />
                                <Bar dataKey="Gastos Oper."   fill="#f59e0b" radius={[3,3,0,0]} />
                                <Bar dataKey="Resultado Neto" fill="#10b981" radius={[3,3,0,0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    {/* Dona: composición de egresos */}
                    <div className="bg-white rounded-xl border border-slate-200 p-5">
                        <h3 className="font-semibold text-slate-700 mb-4">¿A dónde fue cada $ de ventas?</h3>
                        <div className="flex items-center gap-4">
                            <ResponsiveContainer width="55%" height={200}>
                                <PieChart>
                                    <Pie
                                        data={resumen.gastos_detalle}
                                        dataKey="valor"
                                        nameKey="categoria"
                                        cx="50%" cy="50%"
                                        innerRadius={50} outerRadius={80}
                                    >
                                        {resumen.gastos_detalle.map((d, i) => (
                                            <Cell key={i} fill={d.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(v: any) => formatMoneda(v)} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="flex-1 space-y-1.5">
                                {resumen.gastos_detalle.map((d, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs">
                                        <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: d.color }} />
                                        <span className="text-slate-600 truncate flex-1">{d.categoria}</span>
                                        <span className="font-mono text-slate-700">
                                            {resumen.lineas[0].valor_actual > 0
                                                ? (d.valor / resumen.lineas[0].valor_actual * 100).toFixed(1) + '%'
                                                : '—'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Top 5 */}
            {resumen && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Top clientes */}
                    <div className="bg-white rounded-xl border border-slate-200 p-5">
                        <h3 className="font-semibold text-slate-700 mb-3">Top 5 Clientes</h3>
                        <div className="space-y-2">
                            {resumen.top_clientes.length === 0 && <p className="text-sm text-slate-400">Sin datos</p>}
                            {resumen.top_clientes.map((c, i) => (
                                <div key={i} className="flex items-center gap-3">
                                    <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center flex-shrink-0">{i+1}</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-slate-700 truncate">{c.nombre}</p>
                                        <div className="h-1.5 rounded-full bg-slate-100 mt-1 overflow-hidden">
                                            <div className="h-full rounded-full bg-primary-400"
                                                style={{ width: `${resumen.top_clientes[0].total > 0 ? c.total/resumen.top_clientes[0].total*100 : 0}%` }} />
                                        </div>
                                    </div>
                                    <span className="font-mono text-sm font-semibold text-slate-800 flex-shrink-0">{formatMoneda(c.total)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* Top productos */}
                    <div className="bg-white rounded-xl border border-slate-200 p-5">
                        <h3 className="font-semibold text-slate-700 mb-3">Top 5 Productos</h3>
                        <div className="space-y-2">
                            {resumen.top_productos.length === 0 && <p className="text-sm text-slate-400">Sin datos</p>}
                            {resumen.top_productos.map((p, i) => (
                                <div key={i} className="flex items-center gap-3">
                                    <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center flex-shrink-0">{i+1}</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-slate-700 truncate">{p.nombre}</p>
                                        <div className="h-1.5 rounded-full bg-slate-100 mt-1 overflow-hidden">
                                            <div className="h-full rounded-full bg-emerald-400"
                                                style={{ width: `${resumen.top_productos[0].total > 0 ? p.total/resumen.top_productos[0].total*100 : 0}%` }} />
                                        </div>
                                    </div>
                                    <div className="text-right flex-shrink-0">
                                        <p className="font-mono text-sm font-semibold text-slate-800">{formatMoneda(p.total)}</p>
                                        {p.cantidad && <p className="text-xs text-slate-400">{p.cantidad.toFixed(0)} uds</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal umbrales */}
            {showUmbrales && resumen && (
                <ModalUmbrales
                    umbrales={resumen.umbrales}
                    onSave={handleSaveUmbrales}
                    onClose={() => setShowUmbrales(false)}
                />
            )}

            {/* Zona de impresión */}
            <div className="hidden print:block" ref={printRef}>
                <style>{`
                    @media print {
                        body { font-family: Arial, sans-serif; font-size: 10px; }
                        h1 { font-size: 16px; font-weight: bold; }
                        h2 { font-size: 13px; font-weight: bold; margin: 8px 0 4px; }
                        table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
                        th { background: #f0f0f0; border: 1px solid #ccc; padding: 4px 8px; text-align: left; font-size: 9px; text-transform: uppercase; }
                        td { border: 1px solid #ddd; padding: 3px 8px; font-size: 9px; }
                        .r { text-align: right; }
                        .bold { font-weight: bold; }
                        .neg { color: #dc2626; }
                        .pos { color: #16a34a; }
                        .res { background: #f8fafc; }
                    }
                `}</style>
                {resumen && (
                    <>
                        <h1>{(empresa as any)?.nombre ?? ''}</h1>
                        <p><strong>RESUMEN OPERACIONAL — {resumen.periodo_actual.label}</strong></p>
                        <p>vs. período anterior: {resumen.periodo_anterior.label}</p>
                        <p>Estado: <strong>{sem?.label}</strong> — Margen neto: <strong>{resumen.margen_neto.toFixed(1)}%</strong></p>
                        <br/>
                        <h2>Estado de Resultados</h2>
                        <table>
                            <thead><tr><th>Rubro</th><th className="r">Actual</th><th className="r">% Ing.</th><th className="r">Anterior</th><th className="r">Variación</th></tr></thead>
                            <tbody>
                                {resumen.lineas.map((l, i) => (
                                    <tr key={i} className={l.nivel === 'resultado' ? 'res' : ''}>
                                        <td className={l.negrita ? 'bold' : ''}>{l.label}</td>
                                        <td className={cn('r bold', l.valor_actual < 0 ? 'neg' : '')}>{formatMoneda(l.valor_actual)}</td>
                                        <td className="r">{l.pct_ingresos !== 100 ? l.pct_ingresos.toFixed(1) + '%' : ''}</td>
                                        <td className="r">{formatMoneda(l.valor_anterior)}</td>
                                        <td className={cn('r', l.variacion >= 0 ? 'pos' : 'neg')}>{formatMoneda(l.variacion)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <h2>Top 5 Clientes</h2>
                        <table><thead><tr><th>#</th><th>Cliente</th><th className="r">Ingresos</th></tr></thead>
                            <tbody>{resumen.top_clientes.map((c,i)=><tr key={i}><td>{i+1}</td><td>{c.nombre}</td><td className="r">{formatMoneda(c.total)}</td></tr>)}</tbody>
                        </table>
                        <h2>Top 5 Productos</h2>
                        <table><thead><tr><th>#</th><th>Producto</th><th className="r">Ingresos</th><th className="r">Cantidad</th></tr></thead>
                            <tbody>{resumen.top_productos.map((p,i)=><tr key={i}><td>{i+1}</td><td>{p.nombre}</td><td className="r">{formatMoneda(p.total)}</td><td className="r">{p.cantidad}</td></tr>)}</tbody>
                        </table>
                    </>
                )}
            </div>
        </div>
    )
}
