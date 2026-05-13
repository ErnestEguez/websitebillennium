import { useState, useEffect } from 'react'
import { inventoryService } from '../services/inventoryService'
import type { InventoryItem, KardexMovement } from '../services/inventoryService'
import { formatCurrency, cn } from '../lib/utils'
import {
    Package,
    History,
    AlertTriangle,
    ArrowUpCircle,
    ArrowDownCircle,
    Search,
    Filter
} from 'lucide-react'
import { format } from 'date-fns'

export function InventoryPage() {
    const [items, setItems] = useState<InventoryItem[]>([])
    const [kardex, setKardex] = useState<KardexMovement[]>([])
    const [activeTab, setActiveTab] = useState<'stock' | 'kardex'>('stock')
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')

    useEffect(() => {
        loadData()
    }, [])

    async function loadData() {
        try {
            setLoading(true)
            const [invData, kardexData] = await Promise.all([
                inventoryService.getInventory(),
                inventoryService.getKardex()
            ])
            setItems(invData)
            setKardex(kardexData)
        } catch (error) {
            console.error('Error loading inventory data:', error)
        } finally {
            setLoading(false)
        }
    }

    const filteredItems = items.filter(item =>
        item.nombre.toLowerCase().includes(search.toLowerCase()) ||
        item.categoria.toLowerCase().includes(search.toLowerCase())
    )

    const lowStockCount = items.filter(item => item.stock_actual <= item.stock_minimo).length

    if (loading) {
        return <div className="p-12 text-center">Cargando inventario...</div>
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Inventario & Kardex</h1>
                    <p className="text-slate-500">Control de stock y movimientos de mercancía</p>
                </div>
                <div className="flex items-center gap-2">
                    {lowStockCount > 0 && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 rounded-lg border border-amber-200 text-sm font-medium">
                            <AlertTriangle className="w-4 h-4" />
                            {lowStockCount} alertas de stock bajo
                        </div>
                    )}
                </div>
            </div>

            <div className="flex border-b border-slate-200">
                <button
                    onClick={() => setActiveTab('stock')}
                    className={cn(
                        "px-6 py-3 text-sm font-medium border-b-2 transition-all",
                        activeTab === 'stock'
                            ? "border-primary-600 text-primary-600"
                            : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                    )}
                >
                    <div className="flex items-center gap-2">
                        <Package className="w-4 h-4" />
                        Stock Actual
                    </div>
                </button>
                <button
                    onClick={() => setActiveTab('kardex')}
                    className={cn(
                        "px-6 py-3 text-sm font-medium border-b-2 transition-all",
                        activeTab === 'kardex'
                            ? "border-primary-600 text-primary-600"
                            : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
                    )}
                >
                    <div className="flex items-center gap-2">
                        <History className="w-4 h-4" />
                        Historial Kardex
                    </div>
                </button>
            </div>

            {activeTab === 'stock' ? (
                <div className="card">
                    <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Buscar por nombre o categoría..."
                                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                        <button className="btn bg-white border border-slate-200 text-slate-600 px-4 py-2 text-sm gap-2">
                            <Filter className="w-4 h-4" />
                            Filtros
                        </button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                                    <th className="px-6 py-4 font-medium">Producto</th>
                                    <th className="px-6 py-4 font-medium">Categoría</th>
                                    <th className="px-6 py-4 font-medium text-right">Stock Mínimo</th>
                                    <th className="px-6 py-4 font-medium text-right">Stock Actual</th>
                                    <th className="px-6 py-4 font-medium">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredItems.map((item) => {
                                    const isLow = item.stock_actual <= item.stock_minimo
                                    return (
                                        <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4">
                                                <p className="text-sm font-semibold text-slate-900">{item.nombre}</p>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="px-2 py-1 bg-slate-100 text-slate-600 text-xs rounded-full">
                                                    {item.categoria}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-600 text-right font-medium">
                                                {item.stock_minimo}
                                            </td>
                                            <td className={cn(
                                                "px-6 py-4 text-sm font-bold text-right",
                                                isLow ? "text-amber-600" : "text-slate-900"
                                            )}>
                                                {item.stock_actual}
                                            </td>
                                            <td className="px-6 py-4">
                                                {isLow ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                                                        <AlertTriangle className="w-3 h-3" />
                                                        Crítico
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                                                        Saludable
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="card overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                                <th className="px-6 py-4 font-medium">Fecha</th>
                                <th className="px-6 py-4 font-medium">Producto</th>
                                <th className="px-6 py-4 font-medium">Tipo</th>
                                <th className="px-6 py-4 font-medium text-right">Cantidad</th>
                                <th className="px-6 py-4 font-medium text-right">Costo Unit.</th>
                                <th className="px-6 py-4 font-medium">Referencia</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {kardex.map((mov) => (
                                <tr key={mov.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4 text-sm text-slate-600">
                                        {format(new Date(mov.fecha), 'dd/MM/yyyy HH:mm')}
                                    </td>
                                    <td className="px-6 py-4 text-sm font-medium text-slate-900">
                                        {mov.producto_nombre}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={cn(
                                            "inline-flex items-center gap-1 text-xs font-bold",
                                            mov.tipo_movimiento === 'VENTA' ? "text-red-500" : "text-emerald-500"
                                        )}>
                                            {mov.tipo_movimiento === 'VENTA' ? <ArrowDownCircle className="w-3 h-3" /> : <ArrowUpCircle className="w-3 h-3" />}
                                            {mov.tipo_movimiento}
                                        </span>
                                    </td>
                                    <td className={cn(
                                        "px-6 py-4 text-sm font-black text-right",
                                        mov.tipo_movimiento === 'VENTA' ? "text-red-600" : "text-emerald-600"
                                    )}>
                                        {mov.tipo_movimiento === 'VENTA' ? '-' : '+'}{mov.cantidad}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-600 text-right font-medium">
                                        {formatCurrency(mov.costo_unitario)}
                                    </td>
                                    <td className="px-6 py-4 text-xs text-slate-400 font-mono">
                                        {mov.referencia}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
