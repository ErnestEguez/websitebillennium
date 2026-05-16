import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { ShoppingCart, Truck, Wallet, Package, Wrench, TrendingDown, AlertCircle } from 'lucide-react'

function fmt(n: number) { return `$${n.toFixed(2)}` }

export function DashboardPage() {
    const { empresa } = useAuth()
    const [stats, setStats] = useState({
        totalMes: 0, cxpPendiente: 0, cxpVencida: 0,
        comprasInventario: 0, comprasServicio: 0, proveedoresActivos: 0,
    })
    const [loading, setLoading] = useState(true)

    useEffect(() => { if (empresa?.id) loadStats() }, [empresa?.id])

    async function loadStats() {
        try {
            const primerDiaMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
                .toISOString().split('T')[0]
            const hoy = new Date().toISOString().split('T')[0]

            const [comprasRes, cxpRes, provRes] = await Promise.all([
                supabase.from('ingresos_stock')
                    .select('total, tipo_compra')
                    .eq('empresa_id', empresa!.id)
                    .eq('estado', 'ACTIVO')
                    .gte('fecha_ingreso', primerDiaMes)
                    .lte('fecha_ingreso', hoy),
                supabase.from('cuentas_por_pagar')
                    .select('saldo_pendiente, fecha_vencimiento, estado')
                    .eq('empresa_id', empresa!.id)
                    .in('estado', ['PENDIENTE', 'PARCIALMENTE_PAGADO']),
                supabase.from('proveedores')
                    .select('id', { count: 'exact', head: true })
                    .eq('empresa_id', empresa!.id)
                    .eq('estado', 'ACTIVO'),
            ])

            const compras = comprasRes.data ?? []
            const cxpList = cxpRes.data ?? []

            setStats({
                totalMes: compras.reduce((s, c) => s + c.total, 0),
                comprasInventario: compras.filter(c => c.tipo_compra === 'INVENTARIO').length,
                comprasServicio:   compras.filter(c => c.tipo_compra === 'SERVICIO').length,
                cxpPendiente: cxpList.reduce((s, c) => s + c.saldo_pendiente, 0),
                cxpVencida:   cxpList.filter(c => c.fecha_vencimiento < hoy).reduce((s, c) => s + c.saldo_pendiente, 0),
                proveedoresActivos: provRes.count ?? 0,
            })
        } catch (e) {
            console.error('Dashboard stats error:', e)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
                <p className="text-slate-500 text-sm">Resumen de compras y proveedores — mes actual</p>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                    { label: 'Total comprado (mes)', val: fmt(stats.totalMes),       icon: TrendingDown, color: 'text-primary-600' },
                    { label: 'CxP pendiente',        val: fmt(stats.cxpPendiente),   icon: Wallet,       color: 'text-amber-600'   },
                    { label: 'CxP vencida',          val: fmt(stats.cxpVencida),     icon: AlertCircle,  color: 'text-red-600'     },
                    { label: 'Compras inventario',   val: stats.comprasInventario,   icon: Package,      color: 'text-blue-600'    },
                    { label: 'Compras servicios',    val: stats.comprasServicio,     icon: Wrench,       color: 'text-purple-600'  },
                    { label: 'Proveedores activos',  val: stats.proveedoresActivos,  icon: Truck,        color: 'text-slate-600'   },
                ].map(k => (
                    <div key={k.label} className="card p-5">
                        <div className="flex items-center gap-3 mb-2">
                            <k.icon className={`w-5 h-5 ${k.color}`} />
                            <p className="text-xs text-slate-500">{k.label}</p>
                        </div>
                        <p className={`text-2xl font-bold ${k.color}`}>
                            {loading ? '—' : k.val}
                        </p>
                    </div>
                ))}
            </div>

            {/* Accesos rápidos */}
            <div>
                <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Accesos rápidos</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        { to: '/compras/nueva-inventario', label: 'Nueva compra inventario', icon: Package,      color: 'bg-blue-50 text-blue-700 hover:bg-blue-100'    },
                        { to: '/compras/nueva-servicio',   label: 'Nueva compra servicio',   icon: Wrench,       color: 'bg-purple-50 text-purple-700 hover:bg-purple-100' },
                        { to: '/compras',                  label: 'Ver todas las compras',   icon: ShoppingCart, color: 'bg-primary-50 text-primary-700 hover:bg-primary-100' },
                        { to: '/cxp',                      label: 'Cuentas por pagar',       icon: Wallet,       color: 'bg-amber-50 text-amber-700 hover:bg-amber-100'  },
                    ].map(a => (
                        <Link key={a.to} to={a.to}
                            className={`card p-4 flex flex-col items-center gap-2 text-center transition-colors ${a.color}`}>
                            <a.icon className="w-6 h-6" />
                            <span className="text-sm font-medium">{a.label}</span>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    )
}
