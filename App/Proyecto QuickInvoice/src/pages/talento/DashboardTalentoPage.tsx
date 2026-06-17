import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { evaluacionDesempenoService } from '../../services/nominas/evaluacionDesempenoService'
import { capacitacionService } from '../../services/nominas/capacitacionService'
import { climaService } from '../../services/nominas/climaService'
import { empleadosService } from '../../services/nominas/empleadosService'
import { Loader2, Users, TrendingDown, BookOpen, Star, Smile, TrendingUp, BarChart3 } from 'lucide-react'
import { cn } from '../../lib/utils'

interface Metricas {
    totalActivos: number
    ingresosUltimos30: number
    salidasUltimos30: number
    rotacionPct: number
    evalAlto: number
    evalMedio: number
    evalBajo: number
    evalTotal: number
    horasCapPromedio: number
    cursosActivos: number
    climaPromedio: number | null
    climaEncuesta: string | null
}

function StatCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string | number; sub?: string; color: string }) {
    return (
        <div className="card p-5 flex items-start gap-4">
            <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', color)}>
                <Icon className="w-5 h-5 text-white" />
            </div>
            <div>
                <p className="text-2xl font-bold text-slate-900">{value}</p>
                <p className="text-sm font-medium text-slate-600">{label}</p>
                {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
            </div>
        </div>
    )
}

function DistBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0
    return (
        <div className="flex items-center gap-3">
            <span className="text-xs text-slate-600 w-20 shrink-0">{label}</span>
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-bold text-slate-700 w-8 text-right">{pct}%</span>
            <span className="text-xs text-slate-400 w-6">({count})</span>
        </div>
    )
}

function ClimaMeter({ value }: { value: number }) {
    const pct = (value / 5) * 100
    const color = value >= 4 ? 'bg-emerald-500' : value >= 3 ? 'bg-blue-500' : value >= 2 ? 'bg-amber-500' : 'bg-red-500'
    const label = value >= 4 ? 'Muy bueno' : value >= 3 ? 'Bueno' : value >= 2 ? 'Regular' : 'Bajo'
    return (
        <div>
            <div className="flex justify-between text-sm mb-2">
                <span className="font-bold text-2xl text-slate-900">{value.toFixed(1)}</span>
                <span className={cn('text-sm font-medium', value >= 4 ? 'text-emerald-600' : value >= 3 ? 'text-blue-600' : 'text-amber-600')}>{label}</span>
            </div>
            <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
            </div>
            <div className="flex justify-between text-xs text-slate-400 mt-1"><span>1</span><span>5</span></div>
        </div>
    )
}

export function DashboardTalentoPage() {
    const { empresa } = useAuth() as any
    const [metricas, setMetricas] = useState<Metricas | null>(null)
    const [loading, setLoading]   = useState(true)

    useEffect(() => { if (empresa?.id) cargarMetricas() }, [empresa?.id])

    async function cargarMetricas() {
        setLoading(true)
        try {
            const hoy     = new Date()
            const hace30  = new Date(hoy); hace30.setDate(hoy.getDate() - 30)
            const hace30s = hace30.toISOString().slice(0, 10)

            const [empleados, desempDist, horasCap, cursosLista, climaRec] = await Promise.all([
                empleadosService.listarEmpleados(empresa!.id),
                evaluacionDesempenoService.distribucionDesempeno(empresa!.id),
                capacitacionService.horasPromedioEmpleado(empresa!.id),
                capacitacionService.listarCursos(empresa!.id),
                climaService.promedioReciente(empresa!.id),
            ])

            const activos = empleados.filter(e => e.activo)
            const ingresosUltimos30 = activos.filter(e => e.fecha_ingreso >= hace30s).length
            const salidasUltimos30  = empleados.filter(e => !e.activo && e.fecha_salida && e.fecha_salida >= hace30s).length
            const rotacionPct = activos.length > 0 ? Math.round((salidasUltimos30 / activos.length) * 100) : 0

            const cursosActivos = cursosLista.filter(c => c.activo && (!c.fecha_fin || c.fecha_fin >= hoy.toISOString().slice(0, 10))).length

            setMetricas({
                totalActivos: activos.length,
                ingresosUltimos30,
                salidasUltimos30,
                rotacionPct,
                evalAlto:  desempDist.alto,
                evalMedio: desempDist.medio,
                evalBajo:  desempDist.bajo,
                evalTotal: desempDist.total,
                horasCapPromedio: horasCap,
                cursosActivos,
                climaPromedio: climaRec?.promedio ?? null,
                climaEncuesta: climaRec?.encuesta ?? null,
            })
        } catch (e) { console.error(e) }
        finally { setLoading(false) }
    }

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
    )

    if (!metricas) return null

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-slate-900">Dashboard de Talento</h1>
                <p className="text-slate-600 mt-1">Indicadores clave de gestión de personas</p>
            </div>

            {/* Fila 1 — Headcount y movimientos */}
            <div>
                <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Headcount</h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard icon={Users}       label="Empleados activos"   value={metricas.totalActivos}       color="bg-indigo-500" />
                    <StatCard icon={TrendingUp}  label="Ingresos (30 días)"  value={metricas.ingresosUltimos30}  color="bg-emerald-500" sub="Nuevos empleados" />
                    <StatCard icon={TrendingDown} label="Salidas (30 días)"  value={metricas.salidasUltimos30}   color="bg-red-400" sub="Empleados que salieron" />
                    <StatCard icon={TrendingDown} label="Rotación mensual"   value={`${metricas.rotacionPct}%`}  color={metricas.rotacionPct > 10 ? 'bg-red-500' : metricas.rotacionPct > 5 ? 'bg-amber-500' : 'bg-blue-500'} sub="Salidas / activos" />
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Distribución de desempeño */}
                <div className="card p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <Star className="w-5 h-5 text-indigo-500" />
                        <h2 className="text-base font-bold text-slate-800">Distribución de Desempeño</h2>
                    </div>
                    {metricas.evalTotal === 0 ? (
                        <div className="text-center py-6 text-slate-400">
                            <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-40" />
                            <p className="text-sm">Sin evaluaciones completadas</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <DistBar label="Excelente"  count={metricas.evalAlto}  total={metricas.evalTotal} color="bg-emerald-500" />
                            <DistBar label="Bueno"      count={metricas.evalMedio} total={metricas.evalTotal} color="bg-blue-500"    />
                            <DistBar label="Regular/Bajo" count={metricas.evalBajo} total={metricas.evalTotal} color="bg-amber-400" />
                            <p className="text-xs text-slate-400 mt-3 text-right">{metricas.evalTotal} evaluaciones totales</p>
                        </div>
                    )}
                </div>

                {/* Capacitación */}
                <div className="card p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <BookOpen className="w-5 h-5 text-violet-500" />
                        <h2 className="text-base font-bold text-slate-800">Capacitación</h2>
                    </div>
                    <div className="space-y-4">
                        <div className="text-center">
                            <p className="text-4xl font-bold text-slate-900">{metricas.horasCapPromedio}</p>
                            <p className="text-sm text-slate-500 mt-1">horas promedio / empleado</p>
                        </div>
                        <div className={cn('rounded-xl p-3 text-center', metricas.cursosActivos > 0 ? 'bg-violet-50' : 'bg-slate-50')}>
                            <p className="text-2xl font-bold text-violet-700">{metricas.cursosActivos}</p>
                            <p className="text-xs text-slate-500">cursos activos</p>
                        </div>
                        {metricas.horasCapPromedio >= 40 && (
                            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg">
                                <TrendingUp className="w-4 h-4 text-emerald-500 shrink-0" />
                                <p className="text-xs text-emerald-700">Excelente inversión en desarrollo</p>
                            </div>
                        )}
                        {metricas.horasCapPromedio < 10 && metricas.horasCapPromedio > 0 && (
                            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 rounded-lg">
                                <TrendingDown className="w-4 h-4 text-amber-500 shrink-0" />
                                <p className="text-xs text-amber-700">Bajo nivel de capacitación</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Clima */}
                <div className="card p-6">
                    <div className="flex items-center gap-2 mb-4">
                        <Smile className="w-5 h-5 text-amber-500" />
                        <h2 className="text-base font-bold text-slate-800">Clima Organizacional</h2>
                    </div>
                    {metricas.climaPromedio == null ? (
                        <div className="text-center py-6 text-slate-400">
                            <Smile className="w-8 h-8 mx-auto mb-2 opacity-40" />
                            <p className="text-sm">Sin encuestas de clima</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <ClimaMeter value={metricas.climaPromedio} />
                            {metricas.climaEncuesta && (
                                <p className="text-xs text-slate-400 text-center">Encuesta más reciente:<br /><span className="font-medium text-slate-600">{metricas.climaEncuesta}</span></p>
                            )}
                            {metricas.climaPromedio < 3 && (
                                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 rounded-lg">
                                    <TrendingDown className="w-4 h-4 text-red-500 shrink-0" />
                                    <p className="text-xs text-red-700">Clima bajo — acciones de retención urgentes</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Indicadores adicionales */}
            <div className="card p-6 bg-gradient-to-r from-indigo-50 to-violet-50 border border-indigo-100">
                <h2 className="text-sm font-bold text-slate-600 mb-4">Guía de lectura</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600">
                    <div className="flex gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1 shrink-0" />
                        <p><strong>Rotación &lt; 5%:</strong> saludable para pymes. Si supera el 10%, revisar clima y compensaciones.</p>
                    </div>
                    <div className="flex gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500 mt-1 shrink-0" />
                        <p><strong>Desempeño:</strong> objetivo ideal es &gt;60% en nivel Excelente/Bueno.</p>
                    </div>
                    <div className="flex gap-2">
                        <div className="w-2 h-2 rounded-full bg-violet-500 mt-1 shrink-0" />
                        <p><strong>Capacitación:</strong> OIT recomienda mínimo 40h/año por empleado.</p>
                    </div>
                </div>
            </div>
        </div>
    )
}
