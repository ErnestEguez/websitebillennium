import { useAuth } from '../contexts/AuthContext'
import {
    TrendingUp,
    FileText,
    DollarSign,
    ArrowUpRight,
    RefreshCw,
    CheckCircle,
    Clock
} from 'lucide-react'
import { formatCurrency, cn } from '../lib/utils'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

function StatCard({ label, value, icon: Icon, sub, color = 'primary' }: any) {
    const colors: Record<string, string> = {
        primary: 'bg-primary-50 text-primary-600',
        green: 'bg-emerald-50 text-emerald-600',
        amber: 'bg-amber-50 text-amber-600',
        blue: 'bg-blue-50 text-blue-600',
    }
    return (
        <div className="card p-6">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm font-medium text-slate-500">{label}</p>
                    <h3 className="text-2xl font-bold text-slate-900 mt-1">{value}</h3>
                </div>
                <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center', colors[color])}>
                    <Icon className="w-6 h-6" />
                </div>
            </div>
            {sub && (
                <div className="mt-4 flex items-center gap-2">
                    <span className="flex items-center text-xs font-medium px-2 py-1 rounded-full bg-emerald-50 text-emerald-600">
                        <ArrowUpRight className="w-3 h-3 mr-1" />
                        {sub}
                    </span>
                    <span className="text-xs text-slate-400">hoy</span>
                </div>
            )}
        </div>
    )
}

export function Dashboard() {
    const { empresa, profile } = useAuth()
    const [loading, setLoading] = useState(true)
    const [stats, setStats] = useState({
        ventasHoy: 0,
        facturasHoy: 0,
        facturasAutorizadas: 0,
        ticketPromedio: 0,
    })
    const [recentFacturas, setRecentFacturas] = useState<any[]>([])

    useEffect(() => {
        if (empresa?.id) {
            loadData()
        }
    }, [empresa?.id])

    const loadData = async () => {
        if (!empresa?.id) return
        setLoading(true)
        try {
            // Inicio y fin del día actual
            const hoy = new Date()
            const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0)
            const fin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59)

            const { data: comprobantes } = await supabase
                .from('comprobantes')
                .select('id, secuencial, total, estado_sri, created_at, clientes(nombre)')
                .eq('empresa_id', empresa.id)
                .gte('created_at', inicio.toISOString())
                .lte('created_at', fin.toISOString())
                .order('created_at', { ascending: false })

            const all = comprobantes || []
            const totalVentas = all.reduce((s: number, c: any) => s + (Number(c.total) || 0), 0)
            const autorizadas = all.filter((c: any) => c.estado_sri === 'AUTORIZADO').length

            setStats({
                ventasHoy: totalVentas,
                facturasHoy: all.length,
                facturasAutorizadas: autorizadas,
                ticketPromedio: all.length > 0 ? totalVentas / all.length : 0,
            })
            setRecentFacturas(all.slice(0, 8))
        } catch (e) {
            console.error('Dashboard load error:', e)
        } finally {
            setLoading(false)
        }
    }

    // SuperAdmin no tiene empresa — mostrar mensaje
    if (profile?.rol === 'admin_plataforma') {
        return (
            <div className="space-y-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Panel de Administración</h1>
                    <p className="text-slate-500 text-sm mt-1">Vista global de la plataforma QuickInvoice</p>
                </div>
                <div className="card p-12 text-center space-y-4">
                    <div className="w-16 h-16 bg-primary-50 rounded-2xl flex items-center justify-center mx-auto">
                        <TrendingUp className="w-8 h-8 text-primary-600" />
                    </div>
                    <h2 className="text-xl font-bold text-slate-900">Bienvenido, Administrador</h2>
                    <p className="text-slate-500 max-w-md mx-auto">
                        Desde aquí gestiona las empresas, usuarios y configuración global de la plataforma.
                        Accede a <strong>Configuración</strong> para administrar las empresas registradas.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
                    <p className="text-slate-500 text-sm">
                        {empresa?.nombre} — {format(new Date(), "EEEE d 'de' MMMM yyyy", { locale: es })}
                    </p>
                </div>
                <button
                    onClick={loadData}
                    className="p-2 hover:bg-white rounded-lg transition-colors text-slate-500 border border-slate-200"
                    title="Refrescar"
                >
                    <RefreshCw className="w-5 h-5" />
                </button>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard label="Ventas del Día" value={formatCurrency(stats.ventasHoy)} icon={DollarSign} color="green" sub={`${stats.facturasHoy} facturas`} />
                <StatCard label="Facturas Emitidas" value={stats.facturasHoy.toString()} icon={FileText} color="primary" />
                <StatCard label="Autorizadas SRI" value={stats.facturasAutorizadas.toString()} icon={CheckCircle} color="green" />
                <StatCard label="Ticket Promedio" value={formatCurrency(stats.ticketPromedio)} icon={TrendingUp} color="amber" />
            </div>

            {/* Tabla de facturas recientes */}
            <div className="card">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="font-bold text-slate-900">Facturas de Hoy</h2>
                    <span className="text-xs text-slate-400 font-medium">{stats.facturasHoy} registros</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                                <th className="px-6 py-4 font-medium">Secuencial</th>
                                <th className="px-6 py-4 font-medium">Cliente</th>
                                <th className="px-6 py-4 font-medium">Hora</th>
                                <th className="px-6 py-4 font-medium">Estado SRI</th>
                                <th className="px-6 py-4 font-medium text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-slate-400 italic">
                                        Cargando...
                                    </td>
                                </tr>
                            ) : recentFacturas.length > 0 ? (
                                recentFacturas.map((f) => (
                                    <tr key={f.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-4 font-mono text-xs text-slate-600">{f.secuencial}</td>
                                        <td className="px-6 py-4 text-sm font-medium text-slate-900">
                                            {(f.clientes as any)?.nombre || 'Consumidor Final'}
                                        </td>
                                        <td className="px-6 py-4 text-xs text-slate-500">
                                            {format(new Date(f.created_at), 'HH:mm')}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={cn(
                                                'px-2 py-1 text-xs font-bold rounded-full flex items-center gap-1 w-fit',
                                                f.estado_sri === 'AUTORIZADO'
                                                    ? 'bg-emerald-50 text-emerald-700'
                                                    : f.estado_sri === 'ENVIADO'
                                                        ? 'bg-blue-50 text-blue-700'
                                                        : 'bg-amber-50 text-amber-700'
                                            )}>
                                                {f.estado_sri === 'AUTORIZADO'
                                                    ? <CheckCircle className="w-3 h-3" />
                                                    : <Clock className="w-3 h-3" />}
                                                {f.estado_sri || 'PENDIENTE'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm font-bold text-slate-900 text-right">
                                            {formatCurrency(f.total)}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={5} className="px-6 py-8 text-center text-slate-400 italic">
                                        No hay facturas registradas hoy
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
