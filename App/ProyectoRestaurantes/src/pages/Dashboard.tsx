import { useAuth } from '../contexts/AuthContext'
import {
    TrendingUp,
    Users,
    ShoppingCart,
    Clock,
    ArrowUpRight,
    ArrowDownRight,
    RefreshCw,
    Database
} from 'lucide-react'
import { formatCurrency, cn } from '../lib/utils'
import { seedService } from '../services/seedService'
import { pedidoService } from '../services/pedidoService'
import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'

function StatCard({ label, value, icon: Icon, trend, trendValue }: any) {
    return (
        <div className="card p-6">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm font-medium text-slate-500">{label}</p>
                    <h3 className="text-2xl font-bold text-slate-900 mt-1">{value}</h3>
                </div>
                <div className="w-12 h-12 bg-primary-50 rounded-xl flex items-center justify-center text-primary-600">
                    <Icon className="w-6 h-6" />
                </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
                <span className={cn(
                    "flex items-center text-xs font-medium px-2 py-1 rounded-full",
                    trend === 'up' ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                )}>
                    {trend === 'up' ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
                    {trendValue}
                </span>
                <span className="text-xs text-slate-400">vs ayer</span>
            </div>
        </div>
    )
}



export function Dashboard() {
    const { empresa } = useAuth()
    const [seeding, setSeeding] = useState(false)
    const [stats, setStats] = useState({
        totalVentas: 0,
        pedidosActivos: 0,
        mesasOcupadas: 0,
        promedioTicket: 0
    })
    const [recentPedidos, setRecentPedidos] = useState<any[]>([])

    useEffect(() => {
        if (empresa?.id) {
            loadDashboardData()
        }
    }, [empresa?.id])

    const loadDashboardData = async () => {
        if (!empresa?.id) return
        try {
            const [s, p] = await Promise.all([
                pedidoService.getEstadisticas(empresa.id),
                pedidoService.getPedidosRecientes(5)
            ])
            setStats(s)
            setRecentPedidos(p)
        } catch {
            // console.error('Error loading dashboard:', error)
        }
    }

    const handleSeed = async () => {
        if (!empresa?.id) return
        try {
            setSeeding(true)
            await seedService.seedInitialData(empresa.id)
            alert('¡Datos de prueba cargados exitosamente!')
            loadDashboardData()
        } catch {
            alert('Error al cargar datos. Revisa la consola.')
        } finally {
            setSeeding(false)
        }
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
                    <p className="text-slate-500 text-sm">Resumen de operaciones de hoy</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={loadDashboardData}
                        className="p-2 hover:bg-white rounded-lg transition-colors text-slate-500 border border-slate-200"
                        title="Refrescar Datos"
                    >
                        <RefreshCw className="w-5 h-5" />
                    </button>
                    {empresa?.id === 'demo' && (
                        <button
                            onClick={handleSeed}
                            disabled={seeding}
                            className="btn btn-secondary flex items-center gap-2"
                        >
                            <Database className="w-4 h-4" />
                            {seeding ? 'Cargando...' : 'Cargar Datos Demo'}
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    label="Ventas del Día"
                    value={formatCurrency(stats.totalVentas)}
                    icon={TrendingUp}
                    trend="up"
                    trendValue="Hoy"
                />
                <StatCard
                    label="Pedidos Activos"
                    value={stats.pedidosActivos.toString()}
                    icon={ShoppingCart}
                    trend="up"
                    trendValue="En proceso"
                />
                <StatCard
                    label="Mesas Ocupadas"
                    value={stats.mesasOcupadas.toString()}
                    icon={Users}
                    trend="up"
                    trendValue="Ahora"
                />
                <StatCard
                    label="Ticket Promedio"
                    value={formatCurrency(stats.promedioTicket)}
                    icon={Clock}
                    trend="up"
                    trendValue="Media"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 card">
                    <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                        <h2 className="font-bold text-slate-900">Ventas Recientes</h2>
                        <button className="text-sm text-primary-600 font-medium hover:text-primary-700">Ver todo</button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                                    <th className="px-6 py-4 font-medium">Pedido</th>
                                    <th className="px-6 py-4 font-medium">Mesa</th>
                                    <th className="px-6 py-4 font-medium">Estado</th>
                                    <th className="px-6 py-4 font-medium text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {recentPedidos.length > 0 ? (
                                    recentPedidos.map((pedido) => (
                                        <tr key={pedido.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4">
                                                <p className="text-sm font-medium text-slate-900">#{pedido.id.slice(0, 8)}</p>
                                                <p className="text-xs text-slate-500 font-normal">
                                                    {new Date(pedido.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </p>
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-600">Mesa {pedido.mesas?.numero}</td>
                                            <td className="px-6 py-4">
                                                <span className={cn(
                                                    "px-2 py-1 text-xs font-medium rounded-full",
                                                    pedido.estado === 'atendido' ? "bg-emerald-50 text-emerald-600" :
                                                        pedido.estado === 'pendiente' ? "bg-amber-50 text-amber-600" :
                                                            "bg-blue-50 text-blue-600"
                                                )}>
                                                    {pedido.estado.charAt(0).toUpperCase() + pedido.estado.slice(1)}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-sm font-bold text-slate-900 text-right">
                                                {formatCurrency(pedido.total)}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-8 text-center text-slate-500 italic">
                                            No hay pedidos recientes
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="card p-6">
                    <h2 className="font-bold text-slate-900 mb-6">Estado de Mesas</h2>
                    <div className="space-y-4">
                        {[
                            { label: 'Ocupadas', count: stats.mesasOcupadas, color: 'bg-amber-500' },
                            { label: 'Libres', count: 8 - stats.mesasOcupadas, color: 'bg-emerald-500' },
                        ].map((status) => (
                            <div key={status.label} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className={cn("w-2 h-2 rounded-full", status.color)} />
                                    <span className="text-sm text-slate-600">{status.label}</span>
                                </div>
                                <span className="text-sm font-bold text-slate-900">{status.count}</span>
                            </div>
                        ))}
                    </div>
                    <div className="mt-8 pt-6 border-t border-slate-100">
                        <Link to="/mesas" className="btn btn-primary w-full block text-center">Ver Mapa de Salón</Link>
                    </div>
                </div>
            </div>
        </div>
    )
}
