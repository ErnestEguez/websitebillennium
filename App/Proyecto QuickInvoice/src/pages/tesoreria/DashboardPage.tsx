import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CreditCard, FileText, CheckSquare, ArrowDownUp, Loader2, Plus, AlertTriangle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { cuentasBancariasService } from '../../services/finance/bancosService'
import { egresoService } from '../../services/finance/egresoService'
import { chequeService } from '../../services/finance/chequeService'
import { formatMoneda } from '../../lib/utils'
import type { CuentaBancaria, ComprobanteEgreso, Cheque } from '../../types/finance'

export function DashboardPage() {
    const { empresa } = useAuth()

    const [cuentas, setCuentas]       = useState<CuentaBancaria[]>([])
    const [egresos, setEgresos]       = useState<ComprobanteEgreso[]>([])
    const [chequesPend, setChequesPend] = useState<Cheque[]>([])
    const [loading, setLoading]       = useState(true)

    const hoy  = new Date().toISOString().slice(0, 10)
    const ini  = hoy.slice(0, 7) + '-01'

    useEffect(() => {
        if (!empresa?.id) { setLoading(false); return }
        const eid = empresa.id
        Promise.all([
            cuentasBancariasService.listar(eid),
            egresoService.listar(eid, { desde: ini, hasta: hoy }),
            chequeService.listar(eid, { soloPostfechados: true }),
        ]).then(([c, e, ch]) => {
            setCuentas(c); setEgresos(e); setChequesPend(ch)
        }).catch(() => {}).finally(() => setLoading(false))
    }, [empresa?.id])

    const totalSaldos  = cuentas.reduce((s, c) => s + (c.saldo_inicial || 0), 0)
    const totalEgresos = egresos.filter(e => e.estado === 'emitido').reduce((s, e) => s + e.monto_total, 0)

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24 text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />Cargando...
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Finance Suite</h1>
                <p className="text-slate-500 text-sm mt-0.5">Gestión financiera bancaria — {empresa?.nombre}</p>
            </div>

            {/* Resumen */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="card p-5">
                    <CreditCard className="w-8 h-8 text-primary-600 mb-3" />
                    <p className="text-2xl font-bold text-slate-900">{cuentas.filter(c => c.estado === 'activa').length}</p>
                    <p className="text-sm text-slate-500 mt-0.5">Cuentas activas</p>
                    <p className="text-xs text-primary-600 font-semibold mt-1">{formatMoneda(totalSaldos)} saldo total</p>
                </div>
                <div className="card p-5">
                    <FileText className="w-8 h-8 text-emerald-600 mb-3" />
                    <p className="text-2xl font-bold text-slate-900">{egresos.filter(e => e.estado === 'emitido').length}</p>
                    <p className="text-sm text-slate-500 mt-0.5">Egresos del mes</p>
                    <p className="text-xs text-emerald-600 font-semibold mt-1">{formatMoneda(totalEgresos)}</p>
                </div>
                <div className="card p-5">
                    <CheckSquare className="w-8 h-8 text-amber-600 mb-3" />
                    <p className="text-2xl font-bold text-slate-900">{chequesPend.length}</p>
                    <p className="text-sm text-slate-500 mt-0.5">Cheques post-fechados</p>
                    <p className="text-xs text-amber-600 font-semibold mt-1">pendientes de cobro</p>
                </div>
                <div className="card p-5">
                    <ArrowDownUp className="w-8 h-8 text-slate-600 mb-3" />
                    <p className="text-2xl font-bold text-slate-900">{cuentas.filter(c => c.participa_conciliacion).length}</p>
                    <p className="text-sm text-slate-500 mt-0.5">Cuentas en conciliación</p>
                    <p className="text-xs text-slate-400 font-semibold mt-1">activas</p>
                </div>
            </div>

            {/* Cuentas bancarias */}
            <div className="card overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="font-bold text-slate-800">Cuentas Bancarias</h2>
                    <Link to="/cuentas-bancarias" className="text-xs text-primary-600 hover:underline font-semibold">Ver todas</Link>
                </div>
                {cuentas.length === 0 ? (
                    <div className="py-10 text-center text-slate-400">
                        <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No hay cuentas bancarias registradas.</p>
                        <Link to="/cuentas-bancarias" className="mt-3 inline-flex items-center gap-1.5 btn btn-primary text-xs">
                            <Plus className="w-3.5 h-3.5" />Nueva cuenta
                        </Link>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {cuentas.slice(0, 5).map(c => (
                            <div key={c.id} className="flex items-center justify-between px-5 py-3">
                                <div>
                                    <p className="text-sm font-semibold text-slate-800">{c.banco?.nombre}</p>
                                    <p className="text-xs text-slate-500 font-mono">{c.numero_cuenta} · {c.tipo}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-bold text-slate-900">{formatMoneda(c.saldo_inicial)}</p>
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                        c.estado === 'activa' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                                    }`}>{c.estado}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Alertas */}
            {chequesPend.length > 0 && (
                <div className="card p-4 bg-amber-50 border-amber-200">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-semibold text-amber-800">
                                {chequesPend.length} cheque{chequesPend.length > 1 ? 's' : ''} post-fechado{chequesPend.length > 1 ? 's' : ''} pendiente{chequesPend.length > 1 ? 's' : ''} de cobro
                            </p>
                            <Link to="/cheques/a-fecha" className="text-xs text-amber-700 underline mt-0.5 inline-block">
                                Revisar cheques a fecha →
                            </Link>
                        </div>
                    </div>
                </div>
            )}

            {/* Acciones rápidas */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { to: '/egresos/nuevo',   label: 'Nuevo Egreso',        icon: FileText,   color: 'text-primary-600' },
                    { to: '/movimientos',     label: 'Nuevo Movimiento',    icon: ArrowDownUp,color: 'text-slate-600'   },
                    { to: '/anticipos',       label: 'Nuevo Anticipo',      icon: ArrowDownUp,color: 'text-emerald-600' },
                    { to: '/conciliacion/nueva', label: 'Nueva Conciliación', icon: CheckSquare, color: 'text-violet-600' },
                ].map(({ to, label, icon: Icon, color }) => (
                    <Link key={to} to={to}
                        className="card p-4 flex flex-col items-center gap-2 hover:shadow-md transition-shadow cursor-pointer text-center">
                        <Icon className={`w-6 h-6 ${color}`} />
                        <span className="text-xs font-semibold text-slate-700">{label}</span>
                    </Link>
                ))}
            </div>
        </div>
    )
}




