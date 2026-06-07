import { useState, useEffect, useRef } from 'react'
import { useReactToPrint } from 'react-to-print'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency } from '../lib/utils'
import { Printer, Download, RefreshCw, Loader2, Package, BarChart3, Filter, Hash } from 'lucide-react'

interface ItemInventario {
    id: string
    codigo: string
    nombre: string
    categoria_id: string | null
    categoria_nombre: string
    stock: number
    costo_promedio: number
    ultimo_costo: number
}

interface Categoria { id: string; nombre: string }

const hoy = () => new Date().toISOString().split('T')[0]

export function ValorizacionInventarioPage() {
    const { empresa } = useAuth()
    const printRef = useRef<HTMLDivElement>(null)

    const [items, setItems]           = useState<ItemInventario[]>([])
    const [categorias, setCategorias] = useState<Categoria[]>([])
    const [loading, setLoading]       = useState(false)
    const [tipoCosto, setTipoCosto]   = useState<'promedio' | 'ultimo'>('promedio')
    const [catFiltro, setCatFiltro]   = useState<string>('TODOS')
    const [fechaCorte, setFechaCorte] = useState<string>(hoy())
    const [showCodigo, setShowCodigo] = useState(true)

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: `Inventario_${fechaCorte}`,
    })

    useEffect(() => {
        if (empresa?.id) cargar()
    }, [empresa?.id])

    async function cargar(corte?: string) {
        if (!empresa?.id) return
        const fechaUso = corte ?? fechaCorte
        setLoading(true)
        try {
            const [{ data: prods }, { data: cats }] = await Promise.all([
                supabase
                    .from('productos')
                    .select('id, codigo, nombre, stock, costo_promedio, categoria_id, maneja_stock')
                    .eq('empresa_id', empresa.id)
                    .eq('activo', true)
                    .eq('maneja_stock', true)
                    .order('nombre'),
                supabase
                    .from('categorias')
                    .select('id, nombre')
                    .eq('empresa_id', empresa.id)
                    .order('nombre'),
            ])

            const catMap: Record<string, string> = {}
            for (const c of (cats ?? [])) catMap[c.id] = c.nombre
            setCategorias(cats ?? [])

            const prodIds = (prods ?? []).map(p => p.id)
            const ultimoCostoMap: Record<string, number> = {}
            const stockCorteMap: Record<string, number>  = {}

            if (prodIds.length > 0) {
                // Stock histórico al corte: suma de movimientos kardex <= fechaCorte
                const { data: kardexAll } = await supabase
                    .from('kardex')
                    .select('producto_id, tipo_movimiento, cantidad, costo_unitario, fecha, created_at')
                    .eq('empresa_id', empresa.id)
                    .in('producto_id', prodIds)
                    .lte('fecha', fechaUso)
                    .order('created_at', { ascending: false })

                for (const k of (kardexAll ?? [])) {
                    const delta = k.tipo_movimiento === 'ENTRADA'
                        ? Number(k.cantidad)
                        : -Number(k.cantidad)
                    stockCorteMap[k.producto_id] = (stockCorteMap[k.producto_id] ?? 0) + delta

                    // Último costo de ENTRADA hasta la fecha
                    if (k.tipo_movimiento === 'ENTRADA' && !ultimoCostoMap[k.producto_id] && k.costo_unitario) {
                        ultimoCostoMap[k.producto_id] = Number(k.costo_unitario)
                    }
                }
            }

            const esHoy = fechaUso === hoy()

            setItems(
                (prods ?? []).map(p => {
                    const stockVal = esHoy
                        ? Number(p.stock || 0)
                        : Math.max(0, stockCorteMap[p.id] ?? 0)
                    return {
                        id:               p.id,
                        codigo:           p.codigo ?? '',
                        nombre:           p.nombre,
                        categoria_id:     p.categoria_id,
                        categoria_nombre: p.categoria_id ? (catMap[p.categoria_id] ?? '—') : '—',
                        stock:            stockVal,
                        costo_promedio:   Number(p.costo_promedio || 0),
                        ultimo_costo:     ultimoCostoMap[p.id] ?? Number(p.costo_promedio || 0),
                    }
                })
            )
        } finally {
            setLoading(false)
        }
    }

    function aplicarCorte() { cargar(fechaCorte) }

    const filtrados = items
        .filter(i => catFiltro === 'TODOS' || i.categoria_id === catFiltro)
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

    const costo = (i: ItemInventario) =>
        tipoCosto === 'promedio' ? i.costo_promedio : i.ultimo_costo

    const totalCantidad = filtrados.reduce((s, i) => s + i.stock, 0)
    const totalValor    = filtrados.reduce((s, i) => s + i.stock * costo(i), 0)
    const labelCosto    = tipoCosto === 'promedio' ? 'Costo Promedio' : 'Último Costo'
    const fechaLabel    = new Date(fechaCorte + 'T12:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' })

    function exportarExcel() {
        const colCosto = labelCosto
        const rows = filtrados.map(i => {
            const row: any = {}
            if (showCodigo) row['Código'] = i.codigo || '—'
            row['Descripción']  = i.nombre
            row['Categoría']    = i.categoria_nombre
            row[colCosto]       = costo(i)
            row['Cantidad']     = i.stock
            row['Costo Total']  = i.stock * costo(i)
            return row
        })
        const totRow: any = {}
        if (showCodigo) totRow['Código'] = ''
        totRow['Descripción'] = 'TOTALES'
        totRow['Categoría']   = ''
        totRow[labelCosto]    = 0
        totRow['Cantidad']    = totalCantidad
        totRow['Costo Total'] = totalValor
        rows.push(totRow)

        const ws = XLSX.utils.json_to_sheet(rows)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Inventario')
        XLSX.writeFile(wb, `Inventario_${fechaCorte}.xlsx`)
    }

    return (
        <div className="space-y-5">

            {/* Encabezado */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Inventario Valorado</h1>
                    <p className="text-slate-500 text-sm">Corte al {fechaLabel}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button onClick={() => cargar()} disabled={loading}
                        className="btn btn-secondary gap-2 text-sm">
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Actualizar
                    </button>
                    <button onClick={exportarExcel} disabled={loading || filtrados.length === 0}
                        className="btn btn-secondary gap-2 text-sm text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                        <Download className="w-4 h-4" />
                        Excel
                    </button>
                    <button onClick={() => handlePrint()} disabled={loading || filtrados.length === 0}
                        className="btn btn-secondary gap-2 text-sm">
                        <Printer className="w-4 h-4" />
                        Imprimir
                    </button>
                </div>
            </div>

            {/* Filtros */}
            <div className="card p-4 flex flex-wrap gap-5 items-end">

                {/* Tipo de costo */}
                <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="text-sm text-slate-600 font-medium whitespace-nowrap">Valorar con:</span>
                    <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
                        <button
                            onClick={() => setTipoCosto('promedio')}
                            className={`px-3 py-1.5 font-medium transition-colors ${tipoCosto === 'promedio' ? 'bg-primary-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                        >Costo Promedio</button>
                        <button
                            onClick={() => setTipoCosto('ultimo')}
                            className={`px-3 py-1.5 font-medium transition-colors ${tipoCosto === 'ultimo' ? 'bg-primary-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                        >Último Costo</button>
                    </div>
                </div>

                {/* Categoría */}
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="text-sm text-slate-600 font-medium whitespace-nowrap">Categoría:</span>
                    <select
                        className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-primary-400"
                        value={catFiltro}
                        onChange={e => setCatFiltro(e.target.value)}
                    >
                        <option value="TODOS">Todas</option>
                        {categorias.map(c => (
                            <option key={c.id} value={c.id}>{c.nombre}</option>
                        ))}
                    </select>
                </div>

                {/* Mostrar código */}
                <div className="flex items-center gap-2">
                    <Hash className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="text-sm text-slate-600 font-medium whitespace-nowrap">Mostrar código:</span>
                    <button
                        onClick={() => setShowCodigo(v => !v)}
                        className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors shrink-0 ${showCodigo ? 'bg-primary-600' : 'bg-slate-300'}`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${showCodigo ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                </div>

                {/* Fecha de corte */}
                <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-600 font-medium whitespace-nowrap">Fecha de corte:</span>
                    <input
                        type="date"
                        value={fechaCorte}
                        onChange={e => setFechaCorte(e.target.value)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-primary-400"
                    />
                    <button
                        onClick={aplicarCorte}
                        disabled={loading}
                        className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
                    >
                        Aplicar
                    </button>
                </div>
            </div>

            {/* Cards resumen */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="card p-4">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Artículos</p>
                    <p className="text-2xl font-black text-slate-900 mt-1">{filtrados.length}</p>
                </div>
                <div className="card p-4">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Unidades en Stock</p>
                    <p className="text-2xl font-black text-slate-900 mt-1">
                        {totalCantidad.toLocaleString('es-EC', { maximumFractionDigits: 3 })}
                    </p>
                </div>
                <div className="card p-4 col-span-2 md:col-span-1">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Valor Total</p>
                    <p className="text-2xl font-black text-primary-600 mt-1">{formatCurrency(totalValor)}</p>
                </div>
            </div>

            {/* Tabla pantalla */}
            <div className="card overflow-hidden">
                {loading ? (
                    <div className="py-16 flex justify-center items-center gap-2 text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin" /> Cargando inventario...
                    </div>
                ) : filtrados.length === 0 ? (
                    <div className="py-16 text-center text-slate-400">
                        <Package className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>No hay artículos con inventario activo</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-700 text-white text-xs uppercase tracking-wider">
                                    {showCodigo && <th className="py-3 px-4 text-left">Código</th>}
                                    <th className="py-3 px-4 text-left">Descripción</th>
                                    <th className="py-3 px-4 text-left">Categoría</th>
                                    <th className="py-3 px-4 text-right">{labelCosto}</th>
                                    <th className="py-3 px-4 text-right">Cantidad</th>
                                    <th className="py-3 px-4 text-right">Costo Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filtrados.map((item, idx) => (
                                    <tr key={item.id}
                                        className={`hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                                        {showCodigo && (
                                            <td className="py-2.5 px-4 font-mono text-xs text-slate-500">{item.codigo || '—'}</td>
                                        )}
                                        <td className="py-2.5 px-4 font-semibold text-slate-800">{item.nombre}</td>
                                        <td className="py-2.5 px-4">
                                            <span className="text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full font-medium">
                                                {item.categoria_nombre}
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-4 text-right font-mono text-slate-700">
                                            {formatCurrency(costo(item))}
                                        </td>
                                        <td className="py-2.5 px-4 text-right font-bold text-slate-900">
                                            {item.stock.toLocaleString('es-EC', { maximumFractionDigits: 3 })}
                                        </td>
                                        <td className="py-2.5 px-4 text-right font-bold text-slate-900">
                                            {formatCurrency(item.stock * costo(item))}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="bg-slate-800 text-white font-black text-sm">
                                    <td colSpan={showCodigo ? 3 : 2} className="py-3 px-4">TOTALES</td>
                                    <td className="py-3 px-4 text-right">—</td>
                                    <td className="py-3 px-4 text-right">
                                        {totalCantidad.toLocaleString('es-EC', { maximumFractionDigits: 3 })}
                                    </td>
                                    <td className="py-3 px-4 text-right text-primary-300">
                                        {formatCurrency(totalValor)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>

            {/* ── Área de impresión ──────────────────────────────────── */}
            <div className="hidden">
                <div ref={printRef} className="p-8 font-sans text-sm text-black">
                    <div className="text-center border-b-2 border-black pb-4 mb-5">
                        <h1 className="text-xl font-black uppercase">{empresa?.nombre || 'Empresa'}</h1>
                        {(empresa as any)?.ruc && (
                            <p className="text-xs mt-0.5">RUC: {(empresa as any).ruc}</p>
                        )}
                        <h2 className="text-lg font-bold mt-2">INVENTARIO VALORADO</h2>
                        <p className="text-xs text-gray-600">Valoración: {labelCosto}</p>
                        {catFiltro !== 'TODOS' && (
                            <p className="text-xs text-gray-600">
                                Categoría: {categorias.find(c => c.id === catFiltro)?.nombre ?? '—'}
                            </p>
                        )}
                        <p className="text-xs text-gray-600 mt-1">Corte al: {fechaLabel}</p>
                    </div>

                    <table className="w-full border-collapse text-xs">
                        <thead>
                            <tr className="bg-gray-200">
                                {showCodigo && <th className="border border-gray-400 py-1.5 px-2 text-left">Código</th>}
                                <th className="border border-gray-400 py-1.5 px-2 text-left">Descripción</th>
                                <th className="border border-gray-400 py-1.5 px-2 text-left">Categoría</th>
                                <th className="border border-gray-400 py-1.5 px-2 text-right">{labelCosto}</th>
                                <th className="border border-gray-400 py-1.5 px-2 text-right">Cantidad</th>
                                <th className="border border-gray-400 py-1.5 px-2 text-right">Costo Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtrados.map((item, idx) => (
                                <tr key={item.id} className={idx % 2 === 0 ? '' : 'bg-gray-50'}>
                                    {showCodigo && (
                                        <td className="border border-gray-200 py-1 px-2 font-mono">{item.codigo || '—'}</td>
                                    )}
                                    <td className="border border-gray-200 py-1 px-2 font-medium">{item.nombre}</td>
                                    <td className="border border-gray-200 py-1 px-2">{item.categoria_nombre}</td>
                                    <td className="border border-gray-200 py-1 px-2 text-right">{formatCurrency(costo(item))}</td>
                                    <td className="border border-gray-200 py-1 px-2 text-right font-bold">
                                        {item.stock.toLocaleString('es-EC', { maximumFractionDigits: 3 })}
                                    </td>
                                    <td className="border border-gray-200 py-1 px-2 text-right font-bold">
                                        {formatCurrency(item.stock * costo(item))}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="font-black bg-gray-300">
                                <td colSpan={showCodigo ? 3 : 2} className="border border-gray-400 py-1.5 px-2">TOTALES</td>
                                <td className="border border-gray-400 py-1.5 px-2 text-right">—</td>
                                <td className="border border-gray-400 py-1.5 px-2 text-right">
                                    {totalCantidad.toLocaleString('es-EC', { maximumFractionDigits: 3 })}
                                </td>
                                <td className="border border-gray-400 py-1.5 px-2 text-right">
                                    {formatCurrency(totalValor)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>

                    <p className="text-center text-xs text-gray-400 mt-6">
                        Generado por QuickInvoice — {fechaLabel}
                    </p>
                </div>
            </div>
        </div>
    )
}
