import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { BookOpen, FileText, BarChart2, TrendingUp, AlertCircle, LogOut, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatMoneda, mesNombre } from '../lib/utils'

const PORTAL_URL = import.meta.env.VITE_PORTAL_URL || 'https://websitebillennium-k4qc-ernesteguezs-projects.vercel.app'

function SinEmpresa() {
    const { user } = useAuth()
    const [reintentando, setReintentando] = useState(false)

    function limpiarYSalir() {
        Object.keys(localStorage).forEach(k => {
            if (k.startsWith('sb-') || k.startsWith('lp_')) localStorage.removeItem(k)
        })
        window.location.replace(PORTAL_URL)
    }

    async function reintentar() {
        setReintentando(true)
        window.location.reload()
    }

    return (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
            <AlertCircle className="w-12 h-12 text-amber-400" />
            <h2 className="text-lg font-bold text-slate-900">Sin empresa asignada</h2>
            <p className="text-slate-500 text-sm">
                Tu usuario no tiene acceso a ninguna empresa contable.
            </p>
            {user?.email && (
                <p className="text-xs bg-slate-100 px-4 py-2 rounded-lg text-slate-600">
                    Sesión activa: <strong>{user.email}</strong>
                </p>
            )}
            <div className="flex gap-3 mt-2">
                <button onClick={reintentar} disabled={reintentando}
                    className="btn btn-primary gap-2 text-sm">
                    <RefreshCw className="w-4 h-4" /> Reintentar
                </button>
                <Link to="/admin"
                    className="btn text-sm gap-2 border border-primary-300 text-primary-700 hover:bg-primary-50">
                    Ir a Administración
                </Link>
                <button onClick={limpiarYSalir}
                    className="btn text-sm gap-2 border border-slate-200 text-slate-600 hover:bg-slate-50">
                    <LogOut className="w-4 h-4" /> Cerrar sesión
                </button>
            </div>
        </div>
    )
}

interface Resumen {
    total_cuentas: number
    total_comprobantes: number
    total_debe_mes: number
    total_haber_mes: number
    periodo_activo: string | null
}

export function DashboardPage() {
    const { empresaActiva, user } = useAuth()
    const [resumen, setResumen] = useState<Resumen>({
        total_cuentas: 0,
        total_comprobantes: 0,
        total_debe_mes: 0,
        total_haber_mes: 0,
        periodo_activo: null,
    })
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!empresaActiva) return
        cargarResumen()
    }, [empresaActiva])

    async function cargarResumen() {
        if (!empresaActiva) return
        setLoading(true)
        const hoy = new Date()
        const año = hoy.getFullYear()
        const mes = hoy.getMonth() + 1

        const [cuentasRes, compRes, periodoRes] = await Promise.all([
            supabase.from('lp_cuentas')
                .select('id', { count: 'exact', head: true })
                .eq('empresa_id', empresaActiva.id)
                .eq('activa', true)
                .eq('acepta_movimientos', true),

            supabase.from('lp_comprobantes')
                .select('total_debe, total_haber')
                .eq('empresa_id', empresaActiva.id)
                .eq('estado', 'confirmado'),

            supabase.from('lp_periodos')
                .select('*')
                .eq('empresa_id', empresaActiva.id)
                .eq('año', año)
                .eq('mes', mes)
                .maybeSingle(),
        ])

        const compMes = (compRes.data ?? []).reduce(
            (acc, c) => ({ debe: acc.debe + c.total_debe, haber: acc.haber + c.total_haber }),
            { debe: 0, haber: 0 }
        )

        setResumen({
            total_cuentas: cuentasRes.count ?? 0,
            total_comprobantes: compRes.data?.length ?? 0,
            total_debe_mes: compMes.debe,
            total_haber_mes: compMes.haber,
            periodo_activo: periodoRes.data
                ? `${mesNombre(periodoRes.data.mes ?? mes)} ${periodoRes.data.año} — ${periodoRes.data.estado}`
                : 'Sin período configurado',
        })
        setLoading(false)
    }

    const moneda = empresaActiva?.moneda
    const sym = moneda?.simbolo ?? '$'

    if (!empresaActiva) {
        if (user?.email === 'admin@billenniumsystem.com') {
            return <Navigate to="/admin" replace />
        }
        return <SinEmpresa />
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
                <p className="text-slate-500 text-sm mt-1">{empresaActiva.razon_social}</p>
            </div>

            {/* Período activo */}
            {resumen.periodo_activo && (
                <div className="bg-primary-50 border border-primary-200 rounded-xl px-5 py-3 flex items-center gap-3">
                    <div className="w-2 h-2 bg-primary-500 rounded-full" />
                    <span className="text-sm font-medium text-primary-800">
                        Período actual: <span className="capitalize">{resumen.periodo_activo}</span>
                    </span>
                </div>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                    { label: 'Cuentas activas',       value: resumen.total_cuentas,    icon: BookOpen,   color: 'text-primary-600',  bg: 'bg-primary-50' },
                    { label: 'Comprobantes',           value: resumen.total_comprobantes, icon: FileText, color: 'text-blue-600',     bg: 'bg-blue-50' },
                    { label: 'Total Debe (acum.)',      value: formatMoneda(resumen.total_debe_mes, sym), icon: TrendingUp, color: 'text-amber-600', bg: 'bg-amber-50', isText: true },
                    { label: 'Total Haber (acum.)',     value: formatMoneda(resumen.total_haber_mes, sym), icon: BarChart2, color: 'text-emerald-600', bg: 'bg-emerald-50', isText: true },
                ].map(kpi => (
                    <div key={kpi.label} className="card p-5">
                        <div className={`w-10 h-10 rounded-xl ${kpi.bg} flex items-center justify-center mb-3`}>
                            <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                        </div>
                        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{kpi.label}</p>
                        <p className="text-2xl font-bold text-slate-900 mt-1">
                            {loading ? '—' : kpi.value}
                        </p>
                    </div>
                ))}
            </div>

            {/* Accesos rápidos */}
            <div className="card p-6">
                <h2 className="text-base font-bold text-slate-900 mb-4">Accesos rápidos</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                        { to: '/comprobantes/nuevo', label: 'Nuevo Asiento',           icon: FileText,  color: 'bg-blue-600' },
                        { to: '/plan-cuentas',       label: 'Plan de Cuentas',         icon: BookOpen,  color: 'bg-primary-600' },
                        { to: '/reportes/balance-comprobacion', label: 'Bal. Comprobación', icon: BarChart2, color: 'bg-amber-600' },
                    ].map(a => (
                        <Link
                            key={a.to}
                            to={a.to}
                            className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 hover:border-primary-300 hover:bg-primary-50 transition-colors group"
                        >
                            <div className={`w-9 h-9 ${a.color} rounded-lg flex items-center justify-center`}>
                                <a.icon className="w-4 h-4 text-white" />
                            </div>
                            <span className="text-sm font-medium text-slate-700 group-hover:text-primary-700">{a.label}</span>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    )
}
