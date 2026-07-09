import { useEffect, useRef, useState } from 'react'
import { Receipt, Loader2, AlertCircle, X, Download, Printer } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { formatMoneda, mesNombre } from '../../../lib/utils'

// ── Tipos ──────────────────────────────────────────────────────────────────

interface RetLine {
    tipo: string
    codigo: string
    descripcion: string | null
    base: number
    pct: number
    valor: number
}

interface RetencionRow {
    id: string
    fecha: string
    numero_factura: string
    proveedor_nombre: string
    proveedor_ruc: string
    base_0: number
    base_5: number
    base_15: number
    valor_iva: number
    total: number
    numero_retencion: string | null
    rets: RetLine[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

const f2 = (n: number) => n.toFixed(2)

const RET_COLS = 4

function celdaRet(r: RetLine | undefined) {
    if (!r) return null
    return { tipo: r.tipo, cod: r.codigo, desc: r.descripcion ?? '', base: r.base, pct: r.pct, valor: r.valor }
}

// ── Componente ─────────────────────────────────────────────────────────────

export function ConsultaRetencionesPage() {
    const { empresa } = useAuth() as any

    const [año, setAño]           = useState(new Date().getFullYear())
    const [mes, setMes]           = useState(0)
    const [busqueda, setBusqueda] = useState('')

    const [datos, setDatos]       = useState<RetencionRow[]>([])
    const [cargando, setCargando] = useState(false)
    const [error, setError]       = useState('')

    const printRef = useRef<HTMLDivElement>(null)

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

        const { data, error: err } = await supabase
            .from('ingresos_stock')
            .select(`id, fecha_emision, numero_factura, base_iva_0, base_iva_5, base_iva_15, valor_iva, total,
                     proveedor:proveedores(ruc, nombre_empresa),
                     retenciones:retenciones_compras(numero_retencion, tipo, codigo_retencion, descripcion, base_imponible, porcentaje, valor)`)
            .eq('empresa_id', empresa.id)
            .eq('estado', 'ACTIVO')
            .gte('fecha_emision', desde)
            .lte('fecha_emision', hasta)
            .order('fecha_emision', { ascending: false })

        if (err) { setError(err.message); setCargando(false); return }

        const rows: RetencionRow[] = (data ?? [])
            .filter((r: any) => (r.retenciones ?? []).length > 0)
            .map((r: any) => {
                const rets: RetLine[] = (r.retenciones ?? [])
                    .filter((rt: any) => rt.valor > 0)
                    .sort((a: any, b: any) => {
                        if (a.tipo === b.tipo) return 0
                        return a.tipo === 'FUENTE' ? -1 : 1
                    })
                    .slice(0, RET_COLS)
                    .map((rt: any) => ({
                        tipo:        rt.tipo,
                        codigo:      rt.codigo_retencion,
                        descripcion: rt.descripcion,
                        base:        rt.base_imponible ?? 0,
                        pct:         rt.porcentaje ?? 0,
                        valor:       rt.valor ?? 0,
                    }))

                const numRet = (r.retenciones?.[0]?.numero_retencion) ?? null

                return {
                    id:               r.id,
                    fecha:            r.fecha_emision,
                    numero_factura:   r.numero_factura ?? '',
                    proveedor_nombre: r.proveedor?.nombre_empresa ?? '',
                    proveedor_ruc:    r.proveedor?.ruc ?? '',
                    base_0:           r.base_iva_0  ?? 0,
                    base_5:           r.base_iva_5  ?? 0,
                    base_15:          r.base_iva_15 ?? 0,
                    valor_iva:        r.valor_iva   ?? 0,
                    total:            r.total        ?? 0,
                    numero_retencion: numRet,
                    rets,
                }
            })

        setDatos(rows)
        setCargando(false)
    }

    const filtradas = datos.filter(r => {
        if (!busqueda.trim()) return true
        const b = busqueda.toLowerCase()
        return (
            r.proveedor_nombre.toLowerCase().includes(b) ||
            r.proveedor_ruc.includes(b) ||
            r.numero_factura.includes(b) ||
            (r.numero_retencion ?? '').includes(b)
        )
    })

    // ── Totales por tipo+código ────────────────────────────────────────────

    const resumenMap: Record<string, { tipo: string; codigo: string; desc: string; totalBase: number; totalValor: number }> = {}
    for (const row of filtradas) {
        for (const rt of row.rets) {
            const key = `${rt.tipo}|${rt.codigo}`
            if (!resumenMap[key]) resumenMap[key] = { tipo: rt.tipo, codigo: rt.codigo, desc: rt.descripcion ?? '', totalBase: 0, totalValor: 0 }
            resumenMap[key].totalBase  += rt.base
            resumenMap[key].totalValor += rt.valor
        }
    }
    const resumen = Object.values(resumenMap).sort((a, b) => a.tipo.localeCompare(b.tipo) || a.codigo.localeCompare(b.codigo))
    const grandTotalRet = resumen.reduce((s, r) => s + r.totalValor, 0)

    // ── Excel ──────────────────────────────────────────────────────────────

    function exportarExcel() {
        const filas = filtradas.map(row => {
            const base: Record<string, any> = {
                'Fecha':          row.fecha,
                'No. Factura':    row.numero_factura,
                'Proveedor':      row.proveedor_nombre,
                'RUC':            row.proveedor_ruc,
                'Base 0%':        row.base_0,
                'Base 5%':        row.base_5,
                'Base 15%':       row.base_15,
                'IVA':            row.valor_iva,
                'Total Factura':  row.total,
                'Nro. Retención': row.numero_retencion ?? '',
            }
            for (let i = 0; i < RET_COLS; i++) {
                const rt = row.rets[i]
                const n = i + 1
                base[`Ret${n} Tipo`]  = rt?.tipo ?? ''
                base[`Ret${n} Cód.`]  = rt?.codigo ?? ''
                base[`Ret${n} Desc.`] = rt?.descripcion ?? ''
                base[`Ret${n} Base`]  = rt?.base ?? ''
                base[`Ret${n} Tasa%`] = rt?.pct ?? ''
                base[`Ret${n} Valor`] = rt?.valor ?? ''
            }
            return base
        })

        // Hoja resumen
        const filasResumen = resumen.map(r => ({
            'Tipo':         r.tipo,
            'Código':       r.codigo,
            'Descripción':  r.desc,
            'Total Base':   r.totalBase,
            'Total Retenido': r.totalValor,
        }))

        const ws1 = XLSX.utils.json_to_sheet(filas)
        const ws2 = XLSX.utils.json_to_sheet(filasResumen)
        const wb  = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws1, 'Retenciones')
        XLSX.utils.book_append_sheet(wb, ws2, 'Resumen por Tipo')
        XLSX.writeFile(wb, `Retenciones_${empresa?.ruc ?? 'RUC'}_${año}${mes > 0 ? String(mes).padStart(2, '0') : ''}.xlsx`)
    }

    // ── Imprimir ───────────────────────────────────────────────────────────

    function imprimir() { window.print() }

    // ── Render ─────────────────────────────────────────────────────────────

    const periodo = mes > 0 ? `${mesNombre(mes)} ${año}` : `Año ${año}`

    return (
        <div className="space-y-5 max-w-full">
            <style>{`
                @media print {
                    body > *:not(#print-area) { display: none !important; }
                    #print-area { display: block !important; }
                    .no-print { display: none !important; }
                    table { font-size: 9px; }
                    th, td { padding: 2px 4px !important; }
                }
            `}</style>

            {/* Header */}
            <div className="no-print">
                <h1 className="text-2xl font-bold text-slate-900">Consulta de Retenciones</h1>
                <p className="text-slate-500 text-sm mt-0.5">Retenciones emitidas en compras — {periodo}</p>
            </div>

            {error && (
                <div className="card px-5 py-3 bg-red-50 border-red-200 text-red-700 text-sm flex items-center gap-2 no-print">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{error}</span>
                    <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
                </div>
            )}

            {/* Filtros */}
            <div className="card p-5 no-print">
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
                    <div className="flex-1 min-w-[200px]">
                        <label className="label">Buscar</label>
                        <input
                            className="input"
                            placeholder="Proveedor, RUC, No. factura, No. retención..."
                            value={busqueda}
                            onChange={e => setBusqueda(e.target.value)}
                        />
                    </div>
                    <div className="flex gap-2">
                        <button onClick={exportarExcel} disabled={filtradas.length === 0} className="btn btn-secondary gap-2">
                            <Download className="w-4 h-4" /> Excel
                        </button>
                        <button onClick={imprimir} disabled={filtradas.length === 0} className="btn btn-secondary gap-2">
                            <Printer className="w-4 h-4" /> Imprimir
                        </button>
                    </div>
                </div>
            </div>

            {/* Resumen KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 no-print">
                <div className="card p-4">
                    <p className="text-xl font-bold text-purple-600">{filtradas.length}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Facturas con retención</p>
                </div>
                <div className="card p-4">
                    <p className="text-xl font-bold text-blue-600">
                        {formatMoneda(filtradas.reduce((s, r) => s + r.rets.reduce((s2, rt) => s2 + rt.base, 0), 0))}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">Total bases retenidas</p>
                </div>
                <div className="card p-4">
                    <p className="text-xl font-bold text-emerald-600">{formatMoneda(grandTotalRet)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Total valor retenido</p>
                </div>
                <div className="card p-4">
                    <p className="text-xl font-bold text-slate-700">{resumen.length}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Tipos de retención</p>
                </div>
            </div>

            {/* Tabla principal */}
            <div id="print-area" ref={printRef} className="card overflow-hidden">
                <div className="bg-purple-700 px-5 py-3 text-white font-bold text-sm flex items-center gap-2">
                    <Receipt className="w-4 h-4" />
                    Retenciones — {periodo}
                    {filtradas.length !== datos.length && (
                        <span className="ml-2 text-xs font-normal opacity-80">
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
                        <Receipt className="w-10 h-10 mx-auto mb-2 opacity-20" />
                        <p>Sin retenciones para los filtros seleccionados.</p>
                        <p className="text-xs mt-1">Registra retenciones al crear compras de inventario o servicios.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                            <thead>
                                {/* Fila 1 — grupos */}
                                <tr className="bg-slate-700 text-white text-center">
                                    <th rowSpan={2} className="py-2 px-2 text-left border border-slate-600 whitespace-nowrap">Fecha</th>
                                    <th rowSpan={2} className="py-2 px-2 text-left border border-slate-600 whitespace-nowrap">No. Factura</th>
                                    <th rowSpan={2} className="py-2 px-2 text-left border border-slate-600 whitespace-nowrap min-w-[140px]">Proveedor</th>
                                    <th rowSpan={2} className="py-2 px-2 border border-slate-600 whitespace-nowrap">RUC</th>
                                    <th rowSpan={2} className="py-2 px-2 text-right border border-slate-600 whitespace-nowrap">Total Bases</th>
                                    <th rowSpan={2} className="py-2 px-2 text-right border border-slate-600 whitespace-nowrap">IVA</th>
                                    <th rowSpan={2} className="py-2 px-2 text-right border border-slate-600 whitespace-nowrap">Total Fac.</th>
                                    <th rowSpan={2} className="py-2 px-2 border border-slate-600 whitespace-nowrap">Nro. Ret.</th>
                                    {Array.from({ length: RET_COLS }, (_, i) => (
                                        <th key={i} colSpan={4} className="py-2 px-2 border border-slate-500 bg-purple-800">
                                            Retención {i + 1}
                                        </th>
                                    ))}
                                </tr>
                                {/* Fila 2 — sub-columnas por retención */}
                                <tr className="bg-slate-600 text-slate-200 text-center">
                                    {Array.from({ length: RET_COLS }, (_, i) => (
                                        <>
                                            <th key={`t${i}`} className="py-1.5 px-2 border border-slate-500 font-normal whitespace-nowrap">Tipo / Cód.</th>
                                            <th key={`b${i}`} className="py-1.5 px-2 border border-slate-500 font-normal text-right whitespace-nowrap">Base</th>
                                            <th key={`p${i}`} className="py-1.5 px-2 border border-slate-500 font-normal text-right whitespace-nowrap">%</th>
                                            <th key={`v${i}`} className="py-1.5 px-2 border border-slate-500 font-normal text-right whitespace-nowrap">Valor</th>
                                        </>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filtradas.map((row, idx) => (
                                    <tr key={row.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                        <td className="py-2 px-2 border border-slate-200 whitespace-nowrap">{row.fecha}</td>
                                        <td className="py-2 px-2 border border-slate-200 font-mono whitespace-nowrap">{row.numero_factura}</td>
                                        <td className="py-2 px-2 border border-slate-200">
                                            <div className="font-medium text-slate-700">{row.proveedor_nombre}</div>
                                        </td>
                                        <td className="py-2 px-2 border border-slate-200 font-mono whitespace-nowrap">{row.proveedor_ruc}</td>
                                        <td className="py-2 px-2 border border-slate-200 text-right whitespace-nowrap">
                                            {f2(row.base_0 + row.base_5 + row.base_15)}
                                        </td>
                                        <td className="py-2 px-2 border border-slate-200 text-right whitespace-nowrap">
                                            {f2(row.valor_iva)}
                                        </td>
                                        <td className="py-2 px-2 border border-slate-200 text-right font-semibold whitespace-nowrap">
                                            {f2(row.total)}
                                        </td>
                                        <td className="py-2 px-2 border border-slate-200 font-mono text-slate-600 whitespace-nowrap text-center">
                                            {row.numero_retencion ?? '—'}
                                        </td>
                                        {Array.from({ length: RET_COLS }, (_, i) => {
                                            const c = celdaRet(row.rets[i])
                                            return c ? (
                                                <>
                                                    <td key={`t${i}`} className="py-2 px-2 border border-slate-200 whitespace-nowrap">
                                                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${c.tipo === 'FUENTE' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'}`}>
                                                            {c.tipo}
                                                        </span>
                                                        <span className="ml-1 font-mono text-slate-500">{c.cod}</span>
                                                    </td>
                                                    <td key={`b${i}`} className="py-2 px-2 border border-slate-200 text-right whitespace-nowrap">{f2(c.base)}</td>
                                                    <td key={`p${i}`} className="py-2 px-2 border border-slate-200 text-right whitespace-nowrap">{f2(c.pct)}%</td>
                                                    <td key={`v${i}`} className="py-2 px-2 border border-slate-200 text-right font-semibold text-emerald-700 whitespace-nowrap">{f2(c.valor)}</td>
                                                </>
                                            ) : (
                                                <td key={`e${i}`} colSpan={4} className="border border-slate-100 bg-slate-50" />
                                            )
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="bg-slate-100 font-semibold border-t-2 border-slate-400">
                                    <td colSpan={4} className="py-2 px-2 text-right text-slate-600 uppercase text-xs border border-slate-300">TOTALES</td>
                                    <td className="py-2 px-2 text-right border border-slate-300 whitespace-nowrap">
                                        {f2(filtradas.reduce((s, r) => s + r.base_0 + r.base_5 + r.base_15, 0))}
                                    </td>
                                    <td className="py-2 px-2 text-right border border-slate-300 whitespace-nowrap">
                                        {f2(filtradas.reduce((s, r) => s + r.valor_iva, 0))}
                                    </td>
                                    <td className="py-2 px-2 text-right border border-slate-300 whitespace-nowrap">
                                        {f2(filtradas.reduce((s, r) => s + r.total, 0))}
                                    </td>
                                    <td className="border border-slate-300" />
                                    {Array.from({ length: RET_COLS }, (_, i) => (
                                        <>
                                            <td key={`t${i}`} className="border border-slate-300" colSpan={2} />
                                            <td key={`p${i}`} className="border border-slate-300" />
                                            <td key={`v${i}`} className="py-2 px-2 text-right text-emerald-700 border border-slate-300 whitespace-nowrap">
                                                {f2(filtradas.reduce((s, r) => s + (r.rets[i]?.valor ?? 0), 0))}
                                            </td>
                                        </>
                                    ))}
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}

                {/* Resumen por tipo */}
                {resumen.length > 0 && (
                    <div className="border-t border-slate-200 p-5">
                        <h3 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wide">Resumen por Tipo de Retención</h3>
                        <table className="text-xs border-collapse w-full max-w-2xl">
                            <thead>
                                <tr className="bg-slate-100">
                                    <th className="py-1.5 px-3 text-left border border-slate-300">Tipo</th>
                                    <th className="py-1.5 px-3 text-left border border-slate-300">Código</th>
                                    <th className="py-1.5 px-3 text-left border border-slate-300">Descripción</th>
                                    <th className="py-1.5 px-3 text-right border border-slate-300">Total Base</th>
                                    <th className="py-1.5 px-3 text-right border border-slate-300">Total Retenido</th>
                                </tr>
                            </thead>
                            <tbody>
                                {resumen.map(r => (
                                    <tr key={`${r.tipo}|${r.codigo}`} className="border-b border-slate-200">
                                        <td className="py-1.5 px-3 border border-slate-200">
                                            <span className={`px-1.5 py-0.5 rounded font-medium ${r.tipo === 'FUENTE' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'}`}>
                                                {r.tipo}
                                            </span>
                                        </td>
                                        <td className="py-1.5 px-3 font-mono border border-slate-200">{r.codigo}</td>
                                        <td className="py-1.5 px-3 border border-slate-200 text-slate-600">{r.desc}</td>
                                        <td className="py-1.5 px-3 text-right border border-slate-200">{f2(r.totalBase)}</td>
                                        <td className="py-1.5 px-3 text-right font-semibold text-emerald-700 border border-slate-200">{f2(r.totalValor)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="bg-slate-100 font-bold border-t-2 border-slate-400">
                                    <td colSpan={3} className="py-1.5 px-3 text-right text-slate-600 border border-slate-300">TOTAL</td>
                                    <td className="py-1.5 px-3 text-right border border-slate-300">
                                        {f2(resumen.reduce((s, r) => s + r.totalBase, 0))}
                                    </td>
                                    <td className="py-1.5 px-3 text-right text-emerald-700 border border-slate-300">
                                        {f2(grandTotalRet)}
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
