import { useState, useEffect, useRef } from 'react'
import { useReactToPrint } from 'react-to-print'
import * as XLSX from 'xlsx'
import { useAuth } from '../contexts/AuthContext'
import { kardexService, type KardexConProducto } from '../services/kardexService'
import { TrendingUp, TrendingDown, Package, Printer, Download } from 'lucide-react'
import { formatCurrency } from '../lib/utils'

export function KardexPage() {
    const { empresa } = useAuth()
    const printRef = useRef<HTMLDivElement>(null)

    const [productos, setProductos] = useState<any[]>([])
    const [productoSeleccionado, setProductoSeleccionado] = useState('')
    const [movimientos, setMovimientos] = useState<KardexConProducto[]>([])
    const [fechaInicio, setFechaInicio] = useState(() => {
        const today = new Date()
        return new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
    })
    const [fechaFin, setFechaFin] = useState(() => new Date().toISOString().split('T')[0])
    const [loading, setLoading] = useState(false)

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: `Kardex_${productoActualNombre()}_${fechaInicio}_${fechaFin}`,
    })

    function productoActualNombre() {
        return productos.find(p => p.id === productoSeleccionado)?.nombre ?? 'producto'
    }

    useEffect(() => {
        if (empresa?.id) loadProductos()
    }, [empresa?.id])

    async function loadProductos() {
        try {
            const data = await kardexService.getResumenStock(empresa!.id)
            setProductos(data)
        } catch (error) {
            console.error('Error loading productos:', error)
        }
    }

    async function loadKardex() {
        if (!productoSeleccionado) {
            alert('Selecciona un producto')
            return
        }
        try {
            setLoading(true)
            const data = await kardexService.getKardexByProducto(
                productoSeleccionado,
                fechaInicio || undefined,
                fechaFin || undefined
            )
            setMovimientos(data)
        } catch (error) {
            console.error('Error loading kardex:', error)
            alert('Error al cargar movimientos')
        } finally {
            setLoading(false)
        }
    }

    const productoActual = productos.find(p => p.id === productoSeleccionado)

    // ── Calcular filas con saldo acumulado ─────────────────────────
    function buildRows() {
        const allSaldosZero = movimientos.every(m => !m.saldo_cantidad)
        let saldoAcum = 0
        return movimientos.map((mov, idx) => {
            let saldoMostrar: number
            if (allSaldosZero) {
                if (idx === 0) {
                    saldoAcum = mov.tipo_movimiento === 'ENTRADA' ? Number(mov.cantidad) : -Number(mov.cantidad)
                } else {
                    saldoAcum = mov.tipo_movimiento === 'ENTRADA'
                        ? saldoAcum + Number(mov.cantidad)
                        : saldoAcum - Number(mov.cantidad)
                }
                saldoMostrar = saldoAcum
            } else {
                saldoMostrar = Number(mov.saldo_cantidad)
            }
            const costoMostrar = Number(mov.costo_unitario || mov.saldo_costo_promedio || 0)
            return { ...mov, saldoMostrar, costoMostrar }
        })
    }

    const rows = movimientos.length > 0 ? buildRows() : []

    function exportarExcel() {
        if (rows.length === 0) return
        const prod = productoActual
        const exRows = rows.map(mov => ({
            'Fecha':         new Date(mov.fecha).toLocaleDateString('es-EC'),
            'Tipo':          mov.tipo_movimiento,
            'Motivo':        mov.motivo,
            'Documento':     mov.documento_referencia || '',
            'Entrada':       mov.tipo_movimiento === 'ENTRADA' ? Number(mov.cantidad) : '',
            'Salida':        mov.tipo_movimiento === 'SALIDA'  ? Number(mov.cantidad) : '',
            'Saldo':         mov.saldoMostrar,
            'Costo Unit.':   mov.costoMostrar > 0 ? mov.costoMostrar : '',
            'Valor Total':   mov.costoMostrar > 0 ? mov.saldoMostrar * mov.costoMostrar : '',
        }))

        const ws = XLSX.utils.json_to_sheet(exRows)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Kardex')
        XLSX.writeFile(wb, `Kardex_${prod?.nombre ?? 'producto'}_${fechaInicio}_${fechaFin}.xlsx`)
    }

    const fechaDesdeLabel = new Date(fechaInicio + 'T12:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' })
    const fechaHastaLabel = new Date(fechaFin   + 'T12:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' })

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
                            <Download className="w-4 h-4" />
                            Excel
                        </button>
                        <button onClick={() => handlePrint()}
                            className="btn btn-secondary gap-2 text-sm">
                            <Printer className="w-4 h-4" />
                            Imprimir
                        </button>
                    </div>
                )}
            </div>

            {/* Filtros */}
            <div className="card p-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-2">Producto</label>
                        <select
                            value={productoSeleccionado}
                            onChange={e => setProductoSeleccionado(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500"
                        >
                            <option value="">Seleccionar producto...</option>
                            {productos.map(p => (
                                <option key={p.id} value={p.id}>{p.nombre} — Stock: {p.stock}</option>
                            ))}
                        </select>
                    </div>
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
                <button onClick={loadKardex} disabled={!productoSeleccionado || loading}
                    className="btn btn-primary mt-4">
                    {loading ? 'Consultando...' : 'Consultar'}
                </button>
            </div>

            {/* Resumen del Producto */}
            {productoActual && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="card p-6">
                        <div className="flex items-center gap-3 mb-2">
                            <Package className="w-8 h-8 text-primary-600" />
                            <h3 className="text-lg font-bold text-slate-900">Stock Actual</h3>
                        </div>
                        <p className="text-3xl font-bold text-primary-600">{productoActual.stock}</p>
                    </div>
                    <div className="card p-6">
                        <h3 className="text-lg font-bold text-slate-900 mb-2">Costo Promedio</h3>
                        <p className="text-3xl font-bold text-slate-900">${productoActual.costo_promedio?.toFixed(2) || '0.00'}</p>
                    </div>
                    <div className="card p-6">
                        <h3 className="text-lg font-bold text-slate-900 mb-2">Valor en Stock</h3>
                        <p className="text-3xl font-bold text-green-600">
                            {formatCurrency((productoActual.stock || 0) * (productoActual.costo_promedio || 0))}
                        </p>
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
                                        <td className="px-4 py-3 text-sm text-slate-900">
                                            {new Date(mov.fecha).toLocaleDateString('es-EC')}
                                        </td>
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
                    {/* Encabezado */}
                    <div className="text-center border-b-2 border-black pb-4 mb-5">
                        <h1 className="text-xl font-black uppercase">{empresa?.nombre || 'Empresa'}</h1>
                        {(empresa as any)?.ruc && <p className="text-xs mt-0.5">RUC: {(empresa as any).ruc}</p>}
                        <h2 className="text-lg font-bold mt-2">KARDEX DE INVENTARIO</h2>
                        <p className="font-semibold mt-1">{productoActual?.nombre}</p>
                        <p className="text-gray-600">Período: {fechaDesdeLabel} — {fechaHastaLabel}</p>
                        {productoActual && (
                            <p className="text-gray-600">
                                Stock actual: {productoActual.stock} | Costo promedio: ${productoActual.costo_promedio?.toFixed(2)}
                            </p>
                        )}
                    </div>

                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-gray-200">
                                <th className="border border-gray-400 py-1 px-2 text-left">Fecha</th>
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
                                    <td className="border border-gray-200 py-0.5 px-2">
                                        {new Date(mov.fecha).toLocaleDateString('es-EC')}
                                    </td>
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
                                    <td className="border border-gray-200 py-0.5 px-2 text-right font-bold">
                                        {mov.saldoMostrar.toFixed(2)}
                                    </td>
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
