import { useState, useEffect, useRef } from 'react'
import { useReactToPrint } from 'react-to-print'
import * as XLSX from 'xlsx'
import { useAuth } from '../contexts/AuthContext'
import { kardexService, type KardexConProducto } from '../services/kardexService'
import { bodegaService } from '../services/bodegaService'
import type { Bodega } from '../types/vendors'
import { TrendingUp, TrendingDown, Package, Printer, Download, Warehouse, Search, X } from 'lucide-react'
import { formatCurrency } from '../lib/utils'
import { supabase } from '../lib/supabase'
import { useFormDraft } from '../hooks/useFormDraft'

export function KardexPage() {
    const { empresa } = useAuth()
    const printRef = useRef<HTMLDivElement>(null)

    const [_productos,           _setProductos]           = useState<any[]>([])
    const [bodegas,              setBodegas]              = useState<Bodega[]>([])
    const [productoSeleccionado, setProductoSeleccionado] = useState('')
    const [productoNombre,       setProductoNombre]       = useState('')
    const [searchText,           setSearchText]           = useState('')
    const [searchResults,        setSearchResults]        = useState<any[]>([])
    const [searchOpen,           setSearchOpen]           = useState(false)
    const [searching,            setSearching]            = useState(false)
    // productoActual se guarda en estado para evitar zona muerta temporal con useReactToPrint
    const [productoActual,       setProductoActual]       = useState<any>(null)
    const [bodegaSeleccionada,   setBodegaSeleccionada]   = useState('')   // '' = todas
    const [movimientos,          setMovimientos]          = useState<KardexConProducto[]>([])
    const [saldoInicial,         setSaldoInicial]         = useState(0)
    const [stockBodega,          setStockBodega]          = useState<{ cantidad: number; costo_promedio: number } | null>(null)
    const [fechaInicio, setFechaInicio] = useState(() => {
        const t = new Date()
        return new Date(t.getFullYear(), t.getMonth(), 1).toISOString().split('T')[0]
    })
    const [fechaFin, setFechaFin] = useState(() => new Date().toISOString().split('T')[0])
    const [loading, setLoading]   = useState(false)

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: `Kardex_${productoActualNombre()}_${fechaInicio}_${fechaFin}`,
    })

    function productoActualNombre() {
        return productoActual?.nombre ?? 'producto'
    }

    // Preserva selección de producto/bodega/fechas Y los datos ya cargados al
    // navegar a otra pantalla (ej. Inventario Valorado) y volver — se ve tal
    // cual quedó, sin tener que volver a buscar.
    useFormDraft(
        'draft_kardex',
        () => ({ productoSeleccionado, productoNombre, bodegaSeleccionada, fechaInicio, fechaFin, productoActual, movimientos, saldoInicial, stockBodega }),
        (d) => {
            if (d.productoSeleccionado) setProductoSeleccionado(d.productoSeleccionado)
            if (d.productoNombre) setProductoNombre(d.productoNombre)
            if (d.bodegaSeleccionada !== undefined) setBodegaSeleccionada(d.bodegaSeleccionada)
            if (d.fechaInicio) setFechaInicio(d.fechaInicio)
            if (d.fechaFin) setFechaFin(d.fechaFin)
            if (d.productoActual) setProductoActual(d.productoActual)
            if (d.movimientos) setMovimientos(d.movimientos)
            if (d.saldoInicial !== undefined) setSaldoInicial(d.saldoInicial)
            if (d.stockBodega !== undefined) setStockBodega(d.stockBodega)
        },
        [productoSeleccionado, productoNombre, bodegaSeleccionada, fechaInicio, fechaFin, productoActual, movimientos, saldoInicial, stockBodega],
    )

    useEffect(() => {
        if (empresa?.id) cargarCatalogos()
    }, [empresa?.id])

    async function cargarCatalogos() {
        try {
            const bods = await bodegaService.listar(empresa!.id)
            setBodegas(bods)
        } catch (e) {
            console.error('Error cargando catálogos:', e)
        }
    }

    // Búsqueda server-side con ILIKE (código o nombre)
    useEffect(() => {
        if (!empresa?.id || searchText.trim().length < 2) { setSearchResults([]); return }
        const timer = setTimeout(async () => {
            setSearching(true)
            try {
                const q = '%' + searchText.trim().replace(/\*/g, '%') + '%'
                const { data } = await supabase
                    .from('productos')
                    .select('id, codigo, nombre, stock, costo_promedio')
                    .eq('empresa_id', empresa.id)
                    .eq('activo', true)
                    .eq('maneja_stock', true)
                    .or(`nombre.ilike.${q},codigo.ilike.${q}`)
                    .order('nombre')
                    .limit(30)
                setSearchResults(data ?? [])
                setSearchOpen(true)
            } finally {
                setSearching(false)
            }
        }, 300)
        return () => clearTimeout(timer)
    }, [searchText, empresa?.id])

    async function loadKardex() {
        if (!productoSeleccionado) { alert('Selecciona un producto'); return }
        try {
            setLoading(true)
            const [movs] = await Promise.all([
                kardexService.getKardexByProducto(
                    productoSeleccionado,
                    fechaInicio || undefined,
                    fechaFin    || undefined,
                    bodegaSeleccionada || undefined,
                ),
            ])
            setMovimientos(movs)

            // Saldo inicial: neto de movimientos previos al rango, para que el
            // saldo mostrado en la tabla sea correcto y cronológico
            if (fechaInicio) {
                let qIni = supabase
                    .from('kardex')
                    .select('cantidad, tipo_movimiento')
                    .eq('producto_id', productoSeleccionado)
                    .lt('fecha', fechaInicio)
                if (bodegaSeleccionada) qIni = qIni.eq('bodega_id', bodegaSeleccionada)
                const { data: prevMovs } = await qIni
                setSaldoInicial((prevMovs ?? []).reduce((s, m) =>
                    s + (m.tipo_movimiento === 'ENTRADA' ? Number(m.cantidad) : -Number(m.cantidad)), 0))
            } else {
                setSaldoInicial(0)
            }

            // Stock actual en la bodega seleccionada (o global si todas)
            if (bodegaSeleccionada) {
                const { data } = await supabase
                    .from('stock_bodega')
                    .select('cantidad, costo_promedio')
                    .eq('producto_id', productoSeleccionado)
                    .eq('bodega_id', bodegaSeleccionada)
                    .maybeSingle()
                setStockBodega(data ? { cantidad: Number(data.cantidad), costo_promedio: Number(data.costo_promedio) } : { cantidad: 0, costo_promedio: 0 })
            } else {
                const prod = productoActual
                setStockBodega(prod ? { cantidad: Number(prod.stock ?? 0), costo_promedio: Number(prod.costo_promedio ?? 0) } : null)
            }
        } catch (e) {
            console.error('Error cargando kardex:', e)
            alert('Error al cargar movimientos')
        } finally {
            setLoading(false)
        }
    }

    // ── Filas con saldo acumulado, recalculado en orden cronológico ──
    function buildRows() {
        let saldoAcum = saldoInicial
        return movimientos.map(mov => {
            saldoAcum += mov.tipo_movimiento === 'ENTRADA' ? Number(mov.cantidad) : -Number(mov.cantidad)
            const costoMostrar = Number(mov.costo_unitario || mov.saldo_costo_promedio || 0)
            return { ...mov, saldoMostrar: saldoAcum, costoMostrar }
        })
    }

    const rows         = movimientos.length > 0 ? buildRows() : []
    const bodegaActual = bodegas.find(b => b.id === bodegaSeleccionada)

    const totalEntradas = rows.filter(r => r.tipo_movimiento === 'ENTRADA').reduce((s, r) => s + Number(r.cantidad), 0)
    const totalSalidas  = rows.filter(r => r.tipo_movimiento === 'SALIDA' ).reduce((s, r) => s + Number(r.cantidad), 0)

    function exportarExcel() {
        if (rows.length === 0) return
        const exRows = rows.map(mov => ({
            'Fecha':      new Date(mov.fecha).toLocaleDateString('es-EC'),
            'Bodega':     (mov.bodega as any)?.nombre ?? (bodegaActual?.nombre ?? 'Todas'),
            'Tipo':       mov.tipo_movimiento,
            'Motivo':     mov.motivo,
            'Documento':  mov.documento_referencia || '',
            'Entrada':    mov.tipo_movimiento === 'ENTRADA' ? Number(mov.cantidad) : '',
            'Salida':     mov.tipo_movimiento === 'SALIDA'  ? Number(mov.cantidad) : '',
            'Saldo':      mov.saldoMostrar,
            'Costo Unit.': mov.costoMostrar > 0 ? mov.costoMostrar : '',
            'Valor Total': mov.costoMostrar > 0 ? mov.saldoMostrar * mov.costoMostrar : '',
        }))
        const ws = XLSX.utils.json_to_sheet(exRows)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Kardex')
        XLSX.writeFile(wb, `Kardex_${productoActual?.nombre ?? 'producto'}_${bodegaActual?.codigo ?? 'TODAS'}_${fechaInicio}_${fechaFin}.xlsx`)
    }

    const fechaDesdeLabel = new Date(fechaInicio + 'T12:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' })
    const fechaHastaLabel = new Date(fechaFin    + 'T12:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' })

    const mostrarColBodega = !bodegaSeleccionada   // solo cuando es "todas" hay variedad de bodegas

    return (
        <div className="space-y-6">

            {/* Encabezado */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Kardex de Inventario</h1>
                    <p className="text-slate-600 mt-1">Consulta movimientos de productos</p>
                </div>
                {rows.length > 0 && (
                    <div className="flex gap-2">
                        <button onClick={exportarExcel}
                            className="btn btn-secondary gap-2 text-sm text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                            <Download className="w-4 h-4" /> Excel
                        </button>
                        <button onClick={() => handlePrint()}
                            className="btn btn-secondary gap-2 text-sm">
                            <Printer className="w-4 h-4" /> Imprimir
                        </button>
                    </div>
                )}
            </div>

            {/* Filtros */}
            <div className="card p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-2 relative">
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Producto <span className="text-slate-400 font-normal">(busca por código o nombre)</span>
                        </label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                className="w-full pl-9 pr-8 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                                placeholder="Escribe código o descripción..."
                                value={searchText}
                                onChange={e => { setSearchText(e.target.value); setSearchOpen(true) }}
                                onFocus={() => setSearchOpen(true)}
                            />
                            {searching && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />}
                            {productoSeleccionado && !searching && (
                                <button onMouseDown={e => { e.preventDefault(); setProductoSeleccionado(''); setProductoNombre(''); setSearchText(''); setSearchResults([]); setMovimientos([]); setProductoActual(null) }}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        {productoSeleccionado && (
                            <p className="text-xs text-primary-600 mt-1 font-medium">✓ {productoNombre}</p>
                        )}
                        {searchOpen && searchResults.length > 0 && (
                            <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-white rounded-xl border border-slate-200 shadow-xl max-h-64 overflow-y-auto">
                                {searchResults.map(p => (
                                    <button key={p.id} type="button"
                                        onMouseDown={e => {
                                            e.preventDefault()
                                            setProductoSeleccionado(p.id)
                                            setProductoActual(p)
                                            setProductoNombre(`${p.codigo ? p.codigo + ' — ' : ''}${p.nombre}`)
                                            setSearchText(`${p.codigo ? p.codigo + ' — ' : ''}${p.nombre}`)
                                            setSearchResults([])
                                            setSearchOpen(false)
                                        }}
                                        className="w-full text-left px-4 py-2.5 hover:bg-primary-50 flex items-center gap-3 text-sm border-b border-slate-100 last:border-0">
                                        <div>
                                            {p.codigo && <span className="font-mono text-xs text-slate-400 mr-2">{p.codigo}</span>}
                                            <span className="text-slate-800 font-medium">{p.nombre}</span>
                                        </div>
                                        <span className="ml-auto text-xs text-slate-400 shrink-0">Stock: {p.stock ?? 0}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            <span className="flex items-center gap-1"><Warehouse className="w-4 h-4" /> Bodega</span>
                        </label>
                        <select value={bodegaSeleccionada} onChange={e => setBodegaSeleccionada(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500">
                            <option value="">Todas las bodegas</option>
                            {bodegas.map(b => (
                                <option key={b.id} value={b.id}>
                                    {b.codigo ? `[${b.codigo}] ` : ''}{b.nombre}{b.es_principal ? ' ★' : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Fecha Inicio</label>
                            <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Fecha Fin</label>
                            <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500" />
                        </div>
                    </div>
                </div>
                <button onClick={loadKardex} disabled={!productoSeleccionado || loading}
                    className="btn btn-primary">
                    {loading ? 'Consultando...' : 'Consultar'}
                </button>
            </div>

            {/* Resumen del Producto */}
            {productoActual && stockBodega !== null && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="card p-5">
                        <div className="flex items-center gap-2 mb-1">
                            <Package className="w-5 h-5 text-primary-600" />
                            <p className="text-xs font-bold text-slate-400 uppercase">
                                Stock {bodegaActual ? bodegaActual.nombre : 'Total'}
                            </p>
                        </div>
                        <p className="text-3xl font-bold text-primary-600">
                            {stockBodega.cantidad.toLocaleString('es-EC', { maximumFractionDigits: 3 })}
                        </p>
                    </div>
                    <div className="card p-5">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-1">Costo Promedio</p>
                        <p className="text-3xl font-bold text-slate-900">${stockBodega.costo_promedio.toFixed(2)}</p>
                    </div>
                    <div className="card p-5">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-1">Valor en Stock</p>
                        <p className="text-3xl font-bold text-green-600">
                            {formatCurrency(stockBodega.cantidad * stockBodega.costo_promedio)}
                        </p>
                    </div>
                    <div className="card p-5">
                        <p className="text-xs font-bold text-slate-400 uppercase mb-1">Período</p>
                        <p className="text-sm font-semibold text-slate-600">
                            <span className="text-green-600">+{totalEntradas.toFixed(2)}</span>
                            {' / '}
                            <span className="text-red-600">-{totalSalidas.toFixed(2)}</span>
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">{rows.length} movimientos · saldo inicial: {saldoInicial.toFixed(2)}</p>
                    </div>
                </div>
            )}

            {/* Tabla de Movimientos */}
            {rows.length > 0 && (
                <div className="card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-700 text-white">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Fecha</th>
                                    {mostrarColBodega && <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Bodega</th>}
                                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Tipo</th>
                                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Motivo</th>
                                    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider">Documento</th>
                                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider">Entrada</th>
                                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider">Salida</th>
                                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider">Saldo</th>
                                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider">Costo Unit.</th>
                                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider">Valor Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {rows.map((mov, idx) => (
                                    <tr key={mov.id} className={`hover:bg-slate-50 ${idx % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                                        <td className="px-4 py-3 text-sm text-slate-900 whitespace-nowrap">
                                            {new Date(mov.fecha).toLocaleDateString('es-EC')}
                                        </td>
                                        {mostrarColBodega && (
                                            <td className="px-4 py-3 text-xs text-slate-500">
                                                {(mov.bodega as any)?.nombre ?? '—'}
                                            </td>
                                        )}
                                        <td className="px-4 py-3">
                                            {mov.tipo_movimiento === 'ENTRADA' ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
                                                    <TrendingUp className="w-3 h-3" /> Entrada
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                                                    <TrendingDown className="w-3 h-3" /> Salida
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-slate-600">{mov.motivo}</td>
                                        <td className="px-4 py-3 text-sm text-slate-600">{mov.documento_referencia || '—'}</td>
                                        <td className="px-4 py-3 text-right text-sm font-medium text-green-600">
                                            {mov.tipo_movimiento === 'ENTRADA' ? Number(mov.cantidad).toFixed(2) : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-right text-sm font-medium text-red-600">
                                            {mov.tipo_movimiento === 'SALIDA' ? Number(mov.cantidad).toFixed(2) : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-right text-sm font-bold text-slate-900">
                                            {mov.saldoMostrar.toFixed(2)}
                                        </td>
                                        <td className="px-4 py-3 text-right text-sm text-slate-600 font-mono">
                                            {mov.costoMostrar > 0 ? `$${mov.costoMostrar.toFixed(4)}` : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-right text-sm font-medium text-slate-700">
                                            {mov.costoMostrar > 0 ? formatCurrency(mov.saldoMostrar * mov.costoMostrar) : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {movimientos.length === 0 && productoSeleccionado && !loading && (
                <div className="card p-12 text-center">
                    <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500">No hay movimientos en el rango seleccionado</p>
                </div>
            )}

            {/* ── Área de impresión ──────────────────────────────────── */}
            <div className="hidden">
                <div ref={printRef} className="p-8 font-sans text-xs text-black">
                    <div className="text-center border-b-2 border-black pb-4 mb-5">
                        <h1 className="text-xl font-black uppercase">{empresa?.nombre || 'Empresa'}</h1>
                        {(empresa as any)?.ruc && <p className="text-xs mt-0.5">RUC: {(empresa as any).ruc}</p>}
                        <h2 className="text-lg font-bold mt-2">KARDEX DE INVENTARIO</h2>
                        <p className="font-semibold mt-1">{productoActual?.nombre}</p>
                        <p className="text-gray-600">
                            Bodega: {bodegaActual ? `${bodegaActual.nombre}${bodegaActual.codigo ? ` [${bodegaActual.codigo}]` : ''}` : 'Todas las bodegas'}
                        </p>
                        <p className="text-gray-600">Período: {fechaDesdeLabel} — {fechaHastaLabel}</p>
                        {stockBodega && (
                            <p className="text-gray-600">
                                Stock: {stockBodega.cantidad} | Costo promedio: ${stockBodega.costo_promedio.toFixed(2)}
                            </p>
                        )}
                    </div>

                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-gray-200">
                                <th className="border border-gray-400 py-1 px-2 text-left">Fecha</th>
                                {mostrarColBodega && <th className="border border-gray-400 py-1 px-2 text-left">Bodega</th>}
                                <th className="border border-gray-400 py-1 px-2 text-left">Tipo</th>
                                <th className="border border-gray-400 py-1 px-2 text-left">Motivo</th>
                                <th className="border border-gray-400 py-1 px-2 text-left">Documento</th>
                                <th className="border border-gray-400 py-1 px-2 text-right">Entrada</th>
                                <th className="border border-gray-400 py-1 px-2 text-right">Salida</th>
                                <th className="border border-gray-400 py-1 px-2 text-right">Saldo</th>
                                <th className="border border-gray-400 py-1 px-2 text-right">Costo Unit.</th>
                                <th className="border border-gray-400 py-1 px-2 text-right">Valor Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((mov, idx) => (
                                <tr key={mov.id} className={idx % 2 === 0 ? '' : 'bg-gray-50'}>
                                    <td className="border border-gray-200 py-0.5 px-2">{new Date(mov.fecha).toLocaleDateString('es-EC')}</td>
                                    {mostrarColBodega && <td className="border border-gray-200 py-0.5 px-2">{(mov.bodega as any)?.nombre ?? '—'}</td>}
                                    <td className="border border-gray-200 py-0.5 px-2 font-medium">
                                        {mov.tipo_movimiento === 'ENTRADA' ? 'Entrada' : 'Salida'}
                                    </td>
                                    <td className="border border-gray-200 py-0.5 px-2">{mov.motivo}</td>
                                    <td className="border border-gray-200 py-0.5 px-2">{mov.documento_referencia || '—'}</td>
                                    <td className="border border-gray-200 py-0.5 px-2 text-right text-green-700 font-medium">
                                        {mov.tipo_movimiento === 'ENTRADA' ? Number(mov.cantidad).toFixed(2) : ''}
                                    </td>
                                    <td className="border border-gray-200 py-0.5 px-2 text-right text-red-700 font-medium">
                                        {mov.tipo_movimiento === 'SALIDA' ? Number(mov.cantidad).toFixed(2) : ''}
                                    </td>
                                    <td className="border border-gray-200 py-0.5 px-2 text-right font-bold">{mov.saldoMostrar.toFixed(2)}</td>
                                    <td className="border border-gray-200 py-0.5 px-2 text-right font-mono">
                                        {mov.costoMostrar > 0 ? `$${mov.costoMostrar.toFixed(4)}` : '—'}
                                    </td>
                                    <td className="border border-gray-200 py-0.5 px-2 text-right font-bold">
                                        {mov.costoMostrar > 0 ? `$${(mov.saldoMostrar * mov.costoMostrar).toFixed(2)}` : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <p className="text-center text-gray-400 mt-6 text-xs">
                        Generado por QuickInvoice — {new Date().toLocaleDateString('es-EC')}
                    </p>
                </div>
            </div>
        </div>
    )
}
