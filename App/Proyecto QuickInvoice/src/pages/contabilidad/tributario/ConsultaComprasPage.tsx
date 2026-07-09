import { useEffect, useState } from 'react'
import { ShoppingCart, Loader2, AlertCircle, X, Download, ChevronDown, ChevronUp } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { cn, formatMoneda, mesNombre } from '../../../lib/utils'

interface Compra {
    id: string
    tipo: 'compra' | 'venta'
    proveedor_ruc: string
    proveedor_nombre: string
    numero: string
    clave_acceso: string | null
    fecha_emision: string
    base_cero: number
    base_iva5: number
    iva5: number
    base_iva15: number
    iva15: number
    base_iva: number   // total gravada (5+15)
    iva: number        // total IVA
    total: number
    codigo_retencion: string | null
    porcentaje_ret: number | null
    valor_retenido: number | null
    tipo_compra?: string
}

const TIPO_LABEL: Record<string, string> = {
    compra: 'Compra',
    venta:  'Venta',
}

const TIPO_STYLE: Record<string, string> = {
    compra: 'bg-blue-100 text-blue-700',
    venta:  'bg-emerald-100 text-emerald-700',
}

export function ConsultaComprasPage() {
    const { empresa } = useAuth() as any

    const [año, setAño]           = useState(new Date().getFullYear())
    const [mes, setMes]           = useState(0)
    const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'compra' | 'venta'>('todos')
    const [busqueda, setBusqueda] = useState('')
    const [expandido, setExpandido] = useState<string | null>(null)

    const [datos, setDatos]       = useState<Compra[]>([])
    const [cargando, setCargando] = useState(false)
    const [error, setError]       = useState('')

    useEffect(() => {
        if (empresa?.id) cargar()
    }, [empresa?.id, año, mes])

    async function cargar() {
        if (!empresa?.id) return
        setCargando(true)
        setError('')

        const desde = mes > 0
            ? `${año}-${String(mes).padStart(2, '0')}-01`
            : `${año}-01-01`
        const hasta = mes > 0
            ? `${año}-${String(mes).padStart(2, '0')}-${new Date(año, mes, 0).getDate()}`
            : `${año}-12-31`

        try {
            const [comprasRes, ventasRes] = await Promise.all([
                supabase
                    .from('ingresos_stock')
                    .select('id, numero_factura, clave_acceso, fecha_emision, base_iva_0, base_iva_5, base_iva_15, valor_iva, total, tipo_compra, proveedor:proveedores(ruc, nombre_empresa), retenciones:retenciones_compras(codigo_retencion, porcentaje, valor)')
                    .eq('empresa_id', empresa.id)
                    .eq('estado', 'ACTIVO')
                    .gte('fecha_emision', desde)
                    .lte('fecha_emision', hasta)
                    .order('fecha_emision', { ascending: false }),

                supabase
                    .from('comprobantes')
                    .select('id, secuencial, clave_acceso, created_at, total, cliente:clientes(identificacion, nombre), comprobante_detalles(subtotal, iva_porcentaje, iva_valor)')
                    .eq('empresa_id', empresa.id)
                    .gte('created_at', desde)
                    .lte('created_at', hasta + 'T23:59:59')
                    .order('created_at', { ascending: false }),
            ])

            const compras: Compra[] = (comprasRes.data ?? []).map((r: any) => {
                const b5  = r.base_iva_5  ?? 0
                const b15 = r.base_iva_15 ?? 0
                const iv5  = Math.round(b5  * 0.05 * 100) / 100
                const iv15 = Math.round(b15 * 0.15 * 100) / 100
                return {
                    id:               r.id,
                    tipo:             'compra' as const,
                    proveedor_ruc:    r.proveedor?.ruc ?? '',
                    proveedor_nombre: r.proveedor?.nombre_empresa ?? '',
                    numero:           r.numero_factura ?? '',
                    clave_acceso:     r.clave_acceso,
                    fecha_emision:    r.fecha_emision,
                    base_cero:        r.base_iva_0 ?? 0,
                    base_iva5:        b5,
                    iva5:             iv5,
                    base_iva15:       b15,
                    iva15:            iv15,
                    base_iva:         b5 + b15,
                    iva:              r.valor_iva ?? 0,
                    total:            r.total ?? 0,
                    codigo_retencion: r.retenciones?.[0]?.codigo_retencion ?? null,
                    porcentaje_ret:   r.retenciones?.[0]?.porcentaje ?? null,
                    valor_retenido:   r.retenciones?.reduce((s: number, ret: any) => s + (ret.valor ?? 0), 0) || null,
                    tipo_compra:      r.tipo_compra,
                }
            })

            const ventas: Compra[] = (ventasRes.data ?? []).map((r: any) => {
                const dets = r.comprobante_detalles ?? []
                let b0 = 0, b5 = 0, b15 = 0, iv5 = 0, iv15 = 0
                for (const d of dets) {
                    const pct = d.iva_porcentaje ?? 0
                    const sub = d.subtotal ?? 0
                    const ivd = d.iva_valor  ?? 0
                    if (pct === 0)       { b0  += sub; }
                    else if (pct === 5)  { b5  += sub; iv5  += ivd; }
                    else                 { b15 += sub; iv15 += ivd; }
                }
                return {
                    id:               r.id,
                    tipo:             'venta' as const,
                    proveedor_ruc:    r.cliente?.identificacion ?? '',
                    proveedor_nombre: r.cliente?.nombre ?? '',
                    numero:           r.secuencial ?? '',
                    clave_acceso:     r.clave_acceso,
                    fecha_emision:    r.created_at?.slice(0, 10) ?? '',
                    base_cero:        b0,
                    base_iva5:        b5,
                    iva5:             Math.round(iv5  * 100) / 100,
                    base_iva15:       b15,
                    iva15:            Math.round(iv15 * 100) / 100,
                    base_iva:         b5 + b15,
                    iva:              Math.round((iv5 + iv15) * 100) / 100,
                    total:            r.total ?? 0,
                    codigo_retencion: null,
                    porcentaje_ret:   null,
                    valor_retenido:   null,
                }
            })

            if (comprasRes.error) setError(comprasRes.error.message)
            if (ventasRes.error) setError(prev => prev ? prev + ' | ' + ventasRes.error!.message : ventasRes.error!.message)

            setDatos([...compras, ...ventas].sort((a, b) => b.fecha_emision.localeCompare(a.fecha_emision)))
        } catch (e: any) {
            setError(e.message ?? 'Error cargando datos')
        }
        setCargando(false)
    }

    const filtradas = datos.filter(r => {
        if (tipoFiltro !== 'todos' && r.tipo !== tipoFiltro) return false
        if (busqueda.trim()) {
            const b = busqueda.toLowerCase()
            return (
                r.proveedor_nombre.toLowerCase().includes(b) ||
                r.proveedor_ruc.includes(b) ||
                r.numero.includes(b)
            )
        }
        return true
    })

    const totales = {
        compras:   datos.filter(r => r.tipo === 'compra').length,
        ventas:    datos.filter(r => r.tipo === 'venta').length,
        base0:     filtradas.reduce((s, r) => s + r.base_cero,   0),
        base5:     filtradas.reduce((s, r) => s + r.base_iva5,   0),
        iva5:      filtradas.reduce((s, r) => s + r.iva5,         0),
        base15:    filtradas.reduce((s, r) => s + r.base_iva15,  0),
        iva15:     filtradas.reduce((s, r) => s + r.iva15,        0),
        iva:       filtradas.reduce((s, r) => s + r.iva,          0),
        total:     filtradas.reduce((s, r) => s + r.total,        0),
        retenido:  filtradas.reduce((s, r) => s + (r.valor_retenido ?? 0), 0),
    }

    function exportarExcel() {
        const filas = filtradas.map(r => ({
            'Tipo':             TIPO_LABEL[r.tipo] ?? r.tipo,
            'RUC / CI':         r.proveedor_ruc,
            'Nombre':           r.proveedor_nombre,
            'Número':           r.numero,
            'Fecha':            r.fecha_emision,
            'Base 0%':          r.base_cero,
            'Base 5%':          r.base_iva5,
            'IVA 5%':           r.iva5,
            'Base 15%':         r.base_iva15,
            'IVA 15%':          r.iva15,
            'Total IVA':        r.iva,
            'Total':            r.total,
            'Cód. Ret. IR':     r.codigo_retencion ?? '',
            '% Retención':      r.porcentaje_ret ?? '',
            'Valor Retenido':   r.valor_retenido ?? 0,
            'Clave Acceso':     r.clave_acceso ?? '',
        }))
        const ws = XLSX.utils.json_to_sheet(filas)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Compras y Ventas')
        XLSX.writeFile(wb, `Tributario_${empresa?.ruc ?? 'RUC'}_${año}${mes > 0 ? String(mes).padStart(2, '0') : ''}.xlsx`)
    }

    return (
        <div className="space-y-5 max-w-6xl">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Consulta Tributaria — Compras y Ventas</h1>
                <p className="text-slate-500 text-sm mt-0.5">
                    Facturas de compra y venta registradas en el sistema
                </p>
            </div>

            {error && (
                <div className="card px-5 py-3 bg-red-50 border-red-200 text-red-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{error}</span>
                    <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
                </div>
            )}

            {/* Filtros */}
            <div className="card p-5">
                <div className="flex flex-wrap gap-4 items-end">
                    <div>
                        <label className="label">Año</label>
                        <select className="input" value={año} onChange={e => setAño(+e.target.value)}>
                            {[2023, 2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="label">Mes</label>
                        <select className="input" value={mes} onChange={e => setMes(+e.target.value)}>
                            <option value={0}>Todos</option>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                <option key={m} value={m}>{mesNombre(m)}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="label">Tipo</label>
                        <select className="input" value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value as typeof tipoFiltro)}>
                            <option value="todos">Todos</option>
                            <option value="compra">Compras</option>
                            <option value="venta">Ventas</option>
                        </select>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="label">Buscar</label>
                        <input
                            className="input"
                            placeholder="RUC, nombre, número..."
                            value={busqueda}
                            onChange={e => setBusqueda(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={exportarExcel}
                        disabled={filtradas.length === 0}
                        className="btn btn-secondary gap-2"
                    >
                        <Download className="w-4 h-4" />
                        Exportar Excel
                    </button>
                </div>
            </div>

            {/* Resumen */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Compras',        value: totales.compras,              color: 'text-blue-600' },
                    { label: 'Ventas',         value: totales.ventas,               color: 'text-emerald-600' },
                    { label: 'Total IVA',      value: formatMoneda(totales.iva),    color: 'text-indigo-600' },
                    { label: 'Total General',  value: formatMoneda(totales.total),  color: 'text-slate-800' },
                ].map(({ label, value, color }) => (
                    <div key={label} className="card p-4">
                        <p className={`text-xl font-bold ${color}`}>{value}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                    </div>
                ))}
            </div>

            {/* Tabla */}
            <div className="card overflow-hidden">
                <div className="bg-slate-700 px-5 py-3 text-white font-bold text-sm flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4" />
                    Comprobantes — {mes > 0 ? mesNombre(mes) : 'Año completo'} {año}
                    {filtradas.length !== datos.length && (
                        <span className="ml-2 text-xs font-normal text-slate-300">
                            ({filtradas.length} de {datos.length})
                        </span>
                    )}
                </div>

                {cargando ? (
                    <div className="py-12 text-center text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando...
                    </div>
                ) : filtradas.length === 0 ? (
                    <div className="py-12 text-center text-slate-400">
                        <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-20" />
                        <p>Sin comprobantes para los filtros seleccionados.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                                    <th className="py-2 px-2 w-8" />
                                    <th className="py-2 px-3 text-left">Tipo</th>
                                    <th className="py-2 px-3 text-left">Proveedor / Cliente</th>
                                    <th className="py-2 px-3 text-left">Número</th>
                                    <th className="py-2 px-3 text-left">Fecha</th>
                                    <th className="py-2 px-3 text-right">Base 0%</th>
                                    <th className="py-2 px-3 text-right">Base 5%</th>
                                    <th className="py-2 px-3 text-right">IVA 5%</th>
                                    <th className="py-2 px-3 text-right">Base 15%</th>
                                    <th className="py-2 px-3 text-right">IVA 15%</th>
                                    <th className="py-2 px-3 text-right">Total</th>
                                    <th className="py-2 px-3 text-center">Ret. IR</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtradas.map(r => {
                                    const isExp = expandido === r.id
                                    return (
                                        <>
                                            <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                                                <td className="py-2 px-2">
                                                    <button
                                                        onClick={() => setExpandido(isExp ? null : r.id)}
                                                        className="text-slate-400 hover:text-slate-600"
                                                    >
                                                        {isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                    </button>
                                                </td>
                                                <td className="py-2 px-3">
                                                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', TIPO_STYLE[r.tipo])}>
                                                        {TIPO_LABEL[r.tipo] ?? r.tipo}
                                                    </span>
                                                </td>
                                                <td className="py-2 px-3">
                                                    <div className="font-medium text-slate-700 text-xs">{r.proveedor_nombre}</div>
                                                    <div className="text-slate-400 text-xs font-mono">{r.proveedor_ruc}</div>
                                                </td>
                                                <td className="py-2 px-3 font-mono text-xs text-slate-600">{r.numero}</td>
                                                <td className="py-2 px-3 text-xs text-slate-500">{r.fecha_emision}</td>
                                                <td className="py-2 px-3 text-right text-xs">
                                                    {r.base_cero > 0 ? formatMoneda(r.base_cero) : '—'}
                                                </td>
                                                <td className="py-2 px-3 text-right text-xs">
                                                    {r.base_iva5 > 0 ? formatMoneda(r.base_iva5) : '—'}
                                                </td>
                                                <td className="py-2 px-3 text-right text-xs">
                                                    {r.iva5 > 0 ? formatMoneda(r.iva5) : '—'}
                                                </td>
                                                <td className="py-2 px-3 text-right text-xs">
                                                    {r.base_iva15 > 0 ? formatMoneda(r.base_iva15) : '—'}
                                                </td>
                                                <td className="py-2 px-3 text-right text-xs">
                                                    {r.iva15 > 0 ? formatMoneda(r.iva15) : '—'}
                                                </td>
                                                <td className="py-2 px-3 text-right font-semibold text-xs">
                                                    {formatMoneda(r.total)}
                                                </td>
                                                <td className="py-2 px-3 text-center">
                                                    {r.codigo_retencion ? (
                                                        <span className="text-xs font-mono bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                                                            {r.codigo_retencion} · {r.porcentaje_ret}%
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-slate-300">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                            {isExp && (
                                                <tr key={`${r.id}-det`} className="bg-slate-50 border-b border-slate-100">
                                                    <td colSpan={12} className="px-8 py-3">
                                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Detalle</p>
                                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs font-mono text-slate-600">
                                                            <div><span className="text-slate-400">Base 0%:</span> {r.base_cero.toFixed(2)}</div>
                                                            <div><span className="text-slate-400">Base 5%:</span> {r.base_iva5.toFixed(2)}</div>
                                                            <div><span className="text-slate-400">IVA 5%:</span> {r.iva5.toFixed(2)}</div>
                                                            <div><span className="text-slate-400">Base 15%:</span> {r.base_iva15.toFixed(2)}</div>
                                                            <div><span className="text-slate-400">IVA 15%:</span> {r.iva15.toFixed(2)}</div>
                                                            <div><span className="text-slate-400">Total IVA:</span> {r.iva.toFixed(2)}</div>
                                                            {r.tipo_compra && <div><span className="text-slate-400">Tipo compra:</span> {r.tipo_compra}</div>}
                                                            {r.codigo_retencion && (
                                                                <>
                                                                    <div><span className="text-slate-400">Cód. Ret. IR:</span> {r.codigo_retencion}</div>
                                                                    <div><span className="text-slate-400">% Retención:</span> {r.porcentaje_ret}%</div>
                                                                    <div><span className="text-slate-400">Valor retenido:</span> {(r.valor_retenido ?? 0).toFixed(2)}</div>
                                                                </>
                                                            )}
                                                            <div className="col-span-2 md:col-span-3">
                                                                <span className="text-slate-400">Clave de acceso:</span>{' '}
                                                                <span className="break-all">{r.clave_acceso ?? '(sin clave de acceso)'}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </>
                                    )
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="bg-slate-50 border-t-2 font-semibold text-sm">
                                    <td colSpan={5} className="py-2.5 px-3 text-right text-xs text-slate-500 uppercase">Totales</td>
                                    <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(totales.base0)}</td>
                                    <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(totales.base5)}</td>
                                    <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(totales.iva5)}</td>
                                    <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(totales.base15)}</td>
                                    <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(totales.iva15)}</td>
                                    <td className="py-2.5 px-3 text-right">{formatMoneda(totales.total)}</td>
                                    <td className="py-2.5 px-3 text-center text-xs text-slate-500">
                                        {totales.retenido > 0 ? formatMoneda(totales.retenido) : ''}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
