import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { kardexService, type KardexConProducto } from '../services/kardexService'
import { TrendingUp, TrendingDown, Package } from 'lucide-react'

export function KardexPage() {
    const { empresa } = useAuth()
    const [productos, setProductos] = useState<any[]>([])
    const [productoSeleccionado, setProductoSeleccionado] = useState('')
    const [movimientos, setMovimientos] = useState<KardexConProducto[]>([])
    const [fechaInicio, setFechaInicio] = useState(() => {
        const today = new Date()
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
        return firstDay.toISOString().split('T')[0]
    })
    const [fechaFin, setFechaFin] = useState(() => {
        const today = new Date()
        return today.toISOString().split('T')[0]
    })
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (empresa?.id) {
            loadProductos()
        }
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

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-slate-900">Kardex de Inventario</h1>
                <p className="text-slate-600 mt-1">Consulta movimientos de productos</p>
            </div>

            {/* Filtros */}
            <div className="card p-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Producto
                        </label>
                        <select
                            value={productoSeleccionado}
                            onChange={e => setProductoSeleccionado(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500"
                        >
                            <option value="">Seleccionar producto...</option>
                            {productos.map(p => (
                                <option key={p.id} value={p.id}>
                                    {p.nombre} - Stock: {p.stock}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Fecha Inicio
                        </label>
                        <input
                            type="date"
                            value={fechaInicio}
                            onChange={e => setFechaInicio(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Fecha Fin
                        </label>
                        <input
                            type="date"
                            value={fechaFin}
                            onChange={e => setFechaFin(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500"
                        />
                    </div>
                </div>
                <button
                    onClick={loadKardex}
                    disabled={!productoSeleccionado || loading}
                    className="btn btn-primary mt-4"
                >
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
                            ${((productoActual.stock || 0) * (productoActual.costo_promedio || 0)).toFixed(2)}
                        </p>
                    </div>
                </div>
            )}

            {/* Tabla de Movimientos */}
            {movimientos.length > 0 && (() => {
                // Calcular saldo acumulado en tiempo real (para corregir registros históricos con saldo=0)
                const allSaldosZero = movimientos.every(m => !m.saldo_cantidad)
                let saldoAcum = allSaldosZero ? 0 : Number(movimientos[0].saldo_cantidad)
                if (allSaldosZero) {
                    // Reconstituir desde el primer movimiento
                }
                const rows = movimientos.map((mov, idx) => {
                    let saldoMostrar: number
                    if (allSaldosZero) {
                        // Calcular acumulado desde cero
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

                return (
                    <div className="card overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Fecha</th>
                                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Tipo</th>
                                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Motivo</th>
                                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-900">Documento</th>
                                        <th className="px-6 py-4 text-right text-sm font-semibold text-slate-900">Entrada</th>
                                        <th className="px-6 py-4 text-right text-sm font-semibold text-slate-900">Salida</th>
                                        <th className="px-6 py-4 text-right text-sm font-semibold text-slate-900">Saldo</th>
                                        <th className="px-6 py-4 text-right text-sm font-semibold text-slate-900">Costo Unit.</th>
                                        <th className="px-6 py-4 text-right text-sm font-semibold text-slate-900">Valor Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    {rows.map(mov => (
                                        <tr key={mov.id} className="hover:bg-slate-50">
                                            <td className="px-6 py-4 text-sm text-slate-900">
                                                {new Date(mov.fecha).toLocaleDateString('es-EC')}
                                            </td>
                                            <td className="px-6 py-4">
                                                {mov.tipo_movimiento === 'ENTRADA' ? (
                                                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-medium">
                                                        <TrendingUp className="w-4 h-4" />
                                                        Entrada
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-100 text-red-700 text-sm font-medium">
                                                        <TrendingDown className="w-4 h-4" />
                                                        Salida
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-600">{mov.motivo}</td>
                                            <td className="px-6 py-4 text-sm text-slate-600">{mov.documento_referencia || '-'}</td>
                                            <td className="px-6 py-4 text-right text-sm font-medium text-green-600">
                                                {mov.tipo_movimiento === 'ENTRADA' ? Number(mov.cantidad).toFixed(2) : '-'}
                                            </td>
                                            <td className="px-6 py-4 text-right text-sm font-medium text-red-600">
                                                {mov.tipo_movimiento === 'SALIDA' ? Number(mov.cantidad).toFixed(2) : '-'}
                                            </td>
                                            <td className="px-6 py-4 text-right text-sm font-bold text-slate-900">
                                                {mov.saldoMostrar.toFixed(2)}
                                            </td>
                                            <td className="px-6 py-4 text-right text-sm text-slate-600">
                                                {mov.costoMostrar > 0 ? `$${mov.costoMostrar.toFixed(4)}` : '-'}
                                            </td>
                                            <td className="px-6 py-4 text-right text-sm font-medium text-slate-700">
                                                {mov.costoMostrar > 0 ? `$${(mov.saldoMostrar * mov.costoMostrar).toFixed(2)}` : '-'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            })()}

            {movimientos.length === 0 && productoSeleccionado && !loading && (
                <div className="card p-12 text-center">
                    <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500">No hay movimientos para este producto en el rango seleccionado</p>
                </div>
            )}
        </div>
    )
}
