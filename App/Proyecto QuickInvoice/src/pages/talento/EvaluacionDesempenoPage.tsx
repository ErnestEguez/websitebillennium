import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { evaluacionDesempenoService } from '../../services/nominas/evaluacionDesempenoService'
import { empleadosService } from '../../services/nominas/empleadosService'
import type {
    PeriodoEvaluacion, Evaluacion, FrecuenciaEvaluacion,
    EstadoPeriodoEval, TipoEvaluacion, CriterioEvaluacion
} from '../../types/nominas'
import type { Empleado } from '../../types/nominas'
import { Star, Plus, Edit2, Trash2, X, Save, Loader2, ChevronRight, Award, LockKeyhole } from 'lucide-react'
import { cn } from '../../lib/utils'

const FREC_LABEL: Record<FrecuenciaEvaluacion, string> = { trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual', libre: 'Libre' }
const ESTADO_COLOR: Record<EstadoPeriodoEval, string>  = { borrador: 'bg-slate-100 text-slate-500', abierto: 'bg-green-100 text-green-700', cerrado: 'bg-blue-100 text-blue-700' }

const CRITERIOS_DEFAULT: CriterioEvaluacion[] = [
    { nombre: 'Cumplimiento de objetivos y metas', calificacion: 3 },
    { nombre: 'Calidad del trabajo',               calificacion: 3 },
    { nombre: 'Trabajo en equipo',                 calificacion: 3 },
    { nombre: 'Iniciativa y proactividad',         calificacion: 3 },
    { nombre: 'Puntualidad y asistencia',          calificacion: 3 },
]

function calBadge(c: number | null | undefined) {
    if (c == null) return null
    if (c >= 4)   return { label: 'Excelente', cls: 'bg-emerald-100 text-emerald-700' }
    if (c >= 3)   return { label: 'Bueno',     cls: 'bg-blue-100 text-blue-700' }
    if (c >= 2)   return { label: 'Regular',   cls: 'bg-amber-100 text-amber-700' }
    return              { label: 'Deficiente', cls: 'bg-red-100 text-red-600' }
}

type FormPeriodo = { id?: string; nombre: string; frecuencia: FrecuenciaEvaluacion; fecha_inicio: string; fecha_fin: string }
type FormEval    = { id?: string; empleado_id: string; tipo: TipoEvaluacion; comentarios: string; criterios: CriterioEvaluacion[] }

const hoy = new Date().toISOString().slice(0, 10)

export function EvaluacionDesempenoPage() {
    const { empresa } = useAuth() as any
    const [periodos, setPeriodos]     = useState<PeriodoEvaluacion[]>([])
    const [activo, setActivo]         = useState<PeriodoEvaluacion | null>(null)
    const [evaluaciones, setEvals]    = useState<Evaluacion[]>([])
    const [empleados, setEmpleados]   = useState<Empleado[]>([])
    const [loading, setLoading]       = useState(true)
    const [loadingEvals, setLoadingE] = useState(false)
    const [saving, setSaving]         = useState(false)

    const [modalP, setModalP] = useState(false)
    const [formP, setFormP]   = useState<FormPeriodo>({ nombre: '', frecuencia: 'anual', fecha_inicio: hoy, fecha_fin: hoy })

    const [modalE, setModalE] = useState(false)
    const [formE, setFormE]   = useState<FormEval>({ empleado_id: '', tipo: 'jefe', comentarios: '', criterios: CRITERIOS_DEFAULT.map(c => ({ ...c })) })

    useEffect(() => { if (empresa?.id) init() }, [empresa?.id])

    async function init() {
        setLoading(true)
        try {
            const [ps, emps] = await Promise.all([
                evaluacionDesempenoService.listarPeriodos(empresa!.id),
                empleadosService.listarEmpleados(empresa!.id),
            ])
            setPeriodos(ps)
            setEmpleados(emps)
        } catch (e) { console.error(e) }
        finally { setLoading(false) }
    }

    async function seleccionarPeriodo(p: PeriodoEvaluacion) {
        setActivo(p)
        setLoadingE(true)
        try {
            const evals = await evaluacionDesempenoService.listarPorPeriodo(p.id)
            setEvals(evals)
        } catch (e) { console.error(e) }
        finally { setLoadingE(false) }
    }

    // ── Períodos ──────────────────────────────────────────────────────────────

    function abrirNuevoPeriodo() {
        setFormP({ nombre: '', frecuencia: 'anual', fecha_inicio: hoy, fecha_fin: hoy })
        setModalP(true)
    }

    function abrirEditarPeriodo(p: PeriodoEvaluacion) {
        setFormP({ id: p.id, nombre: p.nombre, frecuencia: p.frecuencia, fecha_inicio: p.fecha_inicio, fecha_fin: p.fecha_fin })
        setModalP(true)
    }

    async function guardarPeriodo() {
        if (!formP.nombre.trim()) { alert('El nombre es obligatorio'); return }
        setSaving(true)
        try {
            const payload = { empresa_id: empresa!.id, ...formP, nombre: formP.nombre.trim(), estado: 'borrador' as EstadoPeriodoEval }
            if (formP.id) await evaluacionDesempenoService.actualizarPeriodo(formP.id, payload)
            else          await evaluacionDesempenoService.crearPeriodo(payload)
            setModalP(false)
            await init()
        } catch (e: any) { alert(`Error: ${e.message}`) }
        finally { setSaving(false) }
    }

    async function cambiarEstado(p: PeriodoEvaluacion, estado: EstadoPeriodoEval) {
        await evaluacionDesempenoService.cambiarEstadoPeriodo(p.id, estado)
        if (activo?.id === p.id) setActivo(prev => prev ? { ...prev, estado } : null)
        setPeriodos(prev => prev.map(x => x.id === p.id ? { ...x, estado } : x))
    }

    async function eliminarPeriodo(p: PeriodoEvaluacion) {
        if (!confirm(`¿Eliminar el período "${p.nombre}" y todas sus evaluaciones?`)) return
        await evaluacionDesempenoService.eliminarPeriodo(p.id)
        if (activo?.id === p.id) { setActivo(null); setEvals([]) }
        setPeriodos(prev => prev.filter(x => x.id !== p.id))
    }

    // ── Evaluaciones ──────────────────────────────────────────────────────────

    function abrirNuevaEval() {
        setFormE({ empleado_id: '', tipo: 'jefe', comentarios: '', criterios: CRITERIOS_DEFAULT.map(c => ({ ...c })) })
        setModalE(true)
    }

    function abrirEditarEval(ev: Evaluacion) {
        setFormE({ id: ev.id, empleado_id: ev.empleado_id, tipo: ev.tipo, comentarios: ev.comentarios ?? '', criterios: ev.criterios.length > 0 ? ev.criterios.map(c => ({ ...c })) : CRITERIOS_DEFAULT.map(c => ({ ...c })) })
        setModalE(true)
    }

    async function guardarEval() {
        if (!formE.empleado_id) { alert('Selecciona un empleado'); return }
        if (!activo) return
        setSaving(true)
        try {
            const calFinal = formE.criterios.length > 0
                ? Math.round((formE.criterios.reduce((s, c) => s + c.calificacion, 0) / formE.criterios.length) * 10) / 10
                : null
            const payload = {
                empresa_id: empresa!.id, periodo_id: activo.id,
                empleado_id: formE.empleado_id, tipo: formE.tipo,
                estado: 'completado' as const,
                criterios: formE.criterios, calificacion_final: calFinal,
                comentarios: formE.comentarios || null,
            }
            if (formE.id) await evaluacionDesempenoService.actualizar(formE.id, payload)
            else          await evaluacionDesempenoService.crear(payload)
            setModalE(false)
            const evals = await evaluacionDesempenoService.listarPorPeriodo(activo.id)
            setEvals(evals)
        } catch (e: any) { alert(`Error: ${e.message}`) }
        finally { setSaving(false) }
    }

    async function eliminarEval(id: string) {
        if (!confirm('¿Eliminar esta evaluación?')) return
        await evaluacionDesempenoService.eliminar(id)
        setEvals(prev => prev.filter(e => e.id !== id))
    }

    function setCriterioCalif(idx: number, val: number) {
        setFormE(prev => {
            const criterios = [...prev.criterios]
            criterios[idx] = { ...criterios[idx], calificacion: val }
            return { ...prev, criterios }
        })
    }

    function agregarCriterio() {
        setFormE(prev => ({ ...prev, criterios: [...prev.criterios, { nombre: '', calificacion: 3 }] }))
    }

    function eliminarCriterio(idx: number) {
        setFormE(prev => ({ ...prev, criterios: prev.criterios.filter((_, i) => i !== idx) }))
    }

    const promedioForm = formE.criterios.length > 0
        ? (formE.criterios.reduce((s, c) => s + c.calificacion, 0) / formE.criterios.length).toFixed(1)
        : '-'

    if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Evaluación de Desempeño</h1>
                    <p className="text-slate-600 mt-1">Períodos y evaluaciones individuales por empleado</p>
                </div>
                <button onClick={abrirNuevoPeriodo} className="btn btn-primary flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Nuevo Período
                </button>
            </div>

            <div className={cn('grid gap-4', activo ? 'grid-cols-[300px,1fr]' : 'grid-cols-1')}>

                {/* Lista de períodos */}
                <div className="space-y-2">
                    {periodos.length === 0 ? (
                        <div className="card flex flex-col items-center py-16 text-slate-400">
                            <Award className="w-10 h-10 opacity-40 mb-3" />
                            <p className="font-semibold">Sin períodos de evaluación</p>
                            <button onClick={abrirNuevoPeriodo} className="btn btn-primary mt-4 text-sm flex items-center gap-1.5">
                                <Plus className="w-3.5 h-3.5" /> Crear período
                            </button>
                        </div>
                    ) : periodos.map(p => (
                        <div key={p.id} onClick={() => seleccionarPeriodo(p)}
                            className={cn('card p-4 cursor-pointer transition-all hover:shadow-md', activo?.id === p.id && 'ring-2 ring-indigo-500')}>
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', ESTADO_COLOR[p.estado])}>
                                            {p.estado.charAt(0).toUpperCase() + p.estado.slice(1)}
                                        </span>
                                        <span className="text-xs text-slate-400">{FREC_LABEL[p.frecuencia]}</span>
                                    </div>
                                    <p className="font-semibold text-slate-900 truncate">{p.nombre}</p>
                                    <p className="text-xs text-slate-400 mt-0.5">{p.fecha_inicio} → {p.fecha_fin}</p>
                                    <p className="text-xs text-slate-500 mt-0.5">{p.evaluaciones_count ?? 0} evaluaciones</p>
                                </div>
                                <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                    <button onClick={() => abrirEditarPeriodo(p)} className="p-1 text-slate-300 hover:text-indigo-600 rounded transition-colors">
                                        <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => eliminarPeriodo(p)} className="p-1 text-slate-300 hover:text-red-500 rounded transition-colors">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                    <ChevronRight className="w-4 h-4 text-slate-300 mt-0.5" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Panel de evaluaciones */}
                {activo && (
                    <div className="card overflow-hidden flex flex-col">
                        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-bold text-slate-900">{activo.nombre}</h2>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', ESTADO_COLOR[activo.estado])}>
                                        {activo.estado.charAt(0).toUpperCase() + activo.estado.slice(1)}
                                    </span>
                                    <span className="text-xs text-slate-400">{evaluaciones.length} evaluaciones</span>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                {activo.estado === 'borrador' && (
                                    <button onClick={() => cambiarEstado(activo, 'abierto')} className="btn btn-secondary text-xs">Abrir período</button>
                                )}
                                {activo.estado === 'abierto' && (
                                    <>
                                        <button onClick={() => abrirNuevaEval()} className="btn btn-primary text-sm flex items-center gap-1.5">
                                            <Plus className="w-3.5 h-3.5" /> Nueva Evaluación
                                        </button>
                                        <button onClick={() => cambiarEstado(activo, 'cerrado')} className="btn btn-secondary text-xs flex items-center gap-1">
                                            <LockKeyhole className="w-3 h-3" /> Cerrar
                                        </button>
                                    </>
                                )}
                                <button onClick={() => { setActivo(null); setEvals([]) }} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {loadingEvals ? (
                                <div className="flex items-center justify-center py-10 text-slate-400">
                                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando...
                                </div>
                            ) : evaluaciones.length === 0 ? (
                                <div className="text-center py-12 text-slate-400">
                                    <Award className="w-8 h-8 mx-auto mb-2 opacity-40" />
                                    <p className="text-sm">Sin evaluaciones en este período.</p>
                                    {activo.estado === 'abierto' && (
                                        <button onClick={abrirNuevaEval} className="btn btn-primary mt-3 text-sm flex items-center gap-1.5 mx-auto">
                                            <Plus className="w-3.5 h-3.5" /> Agregar
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                                        <tr>
                                            <th className="px-5 py-3 text-left">Empleado</th>
                                            <th className="px-4 py-3 text-left">Tipo</th>
                                            <th className="px-4 py-3 text-center">Calificación</th>
                                            <th className="px-4 py-3 text-center">Criterios</th>
                                            <th className="px-4 py-3"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {evaluaciones.map(ev => {
                                            const badge = calBadge(ev.calificacion_final)
                                            return (
                                                <tr key={ev.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-5 py-3">
                                                        <p className="font-semibold text-slate-800">{ev.empleado?.nombres} {ev.empleado?.apellidos}</p>
                                                        {ev.empleado?.cargo?.nombre && <p className="text-xs text-slate-400">{ev.empleado.cargo.nombre}</p>}
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-500">{ev.tipo === 'jefe' ? 'Por jefe' : ev.tipo === 'auto' ? 'Autoevaluación' : '360°'}</td>
                                                    <td className="px-4 py-3 text-center">
                                                        {badge && (
                                                            <span className={cn('px-2 py-0.5 rounded-full text-xs font-bold', badge.cls)}>
                                                                {ev.calificacion_final?.toFixed(1)} — {badge.label}
                                                            </span>
                                                        )}
                                                        {!badge && <span className="text-slate-300">—</span>}
                                                    </td>
                                                    <td className="px-4 py-3 text-center text-slate-400 text-xs">{ev.criterios.length} criterios</td>
                                                    <td className="px-4 py-3 text-right">
                                                        <div className="flex gap-1 justify-end">
                                                            {activo.estado !== 'cerrado' && (
                                                                <button onClick={() => abrirEditarEval(ev)} className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors">
                                                                    <Edit2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                            <button onClick={() => eliminarEval(ev.id)} className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors">
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Modal período */}
            {modalP && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <h3 className="text-lg font-bold text-slate-900">{formP.id ? 'Editar Período' : 'Nuevo Período'}</h3>
                            <button onClick={() => setModalP(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="px-6 py-5 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre *</label>
                                <input className="input w-full" value={formP.nombre}
                                    onChange={e => setFormP(v => ({ ...v, nombre: e.target.value }))}
                                    placeholder="Ej: Evaluación Anual 2026" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Frecuencia</label>
                                <select className="input w-full" value={formP.frecuencia}
                                    onChange={e => setFormP(v => ({ ...v, frecuencia: e.target.value as FrecuenciaEvaluacion }))}>
                                    {(Object.keys(FREC_LABEL) as FrecuenciaEvaluacion[]).map(f => <option key={f} value={f}>{FREC_LABEL[f]}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha inicio</label>
                                    <input type="date" className="input w-full" value={formP.fecha_inicio} onChange={e => setFormP(v => ({ ...v, fecha_inicio: e.target.value }))} />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha fin</label>
                                    <input type="date" className="input w-full" value={formP.fecha_fin} onChange={e => setFormP(v => ({ ...v, fecha_fin: e.target.value }))} />
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
                            <button onClick={() => setModalP(false)} className="btn btn-secondary flex items-center gap-2"><X className="w-4 h-4" /> Cancelar</button>
                            <button onClick={guardarPeriodo} disabled={saving} className="btn btn-primary flex items-center gap-2">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal evaluación */}
            {modalE && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <h3 className="text-lg font-bold text-slate-900">{formE.id ? 'Editar Evaluación' : 'Nueva Evaluación'}</h3>
                            <button onClick={() => setModalE(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Empleado *</label>
                                    <select className="input w-full" value={formE.empleado_id}
                                        onChange={e => setFormE(v => ({ ...v, empleado_id: e.target.value }))}>
                                        <option value="">— Seleccionar —</option>
                                        {empleados.map(e => <option key={e.id} value={e.id}>{e.apellidos}, {e.nombres}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo</label>
                                    <select className="input w-full" value={formE.tipo}
                                        onChange={e => setFormE(v => ({ ...v, tipo: e.target.value as TipoEvaluacion }))}>
                                        <option value="jefe">Por jefe / supervisor</option>
                                        <option value="auto">Autoevaluación</option>
                                        <option value="360">Evaluación 360°</option>
                                    </select>
                                </div>
                            </div>

                            {/* Criterios */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-semibold text-slate-600">Criterios de evaluación</label>
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs text-slate-500">Promedio: <strong className={cn('font-bold', parseFloat(promedioForm) >= 4 ? 'text-emerald-600' : parseFloat(promedioForm) >= 3 ? 'text-blue-600' : 'text-amber-600')}>{promedioForm}</strong></span>
                                        <button onClick={agregarCriterio} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
                                            <Plus className="w-3 h-3" /> Agregar
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {formE.criterios.map((c, idx) => (
                                        <div key={idx} className="flex items-center gap-2 p-2 rounded-lg border border-slate-100 bg-slate-50">
                                            <input className="input flex-1 text-sm py-1.5" value={c.nombre}
                                                onChange={e => setFormE(prev => {
                                                    const criterios = [...prev.criterios]
                                                    criterios[idx] = { ...criterios[idx], nombre: e.target.value }
                                                    return { ...prev, criterios }
                                                })}
                                                placeholder="Criterio..." />
                                            {/* Calificación 1-5 */}
                                            <div className="flex gap-0.5">
                                                {[1, 2, 3, 4, 5].map(n => (
                                                    <button key={n} onClick={() => setCriterioCalif(idx, n)}
                                                        className={cn('w-6 h-6 rounded text-xs font-bold transition-colors',
                                                            c.calificacion >= n ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-400 hover:bg-indigo-100')}>
                                                        {n}
                                                    </button>
                                                ))}
                                            </div>
                                            <button onClick={() => eliminarCriterio(idx)} className="p-1 text-slate-300 hover:text-red-400 rounded">
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Comentarios generales</label>
                                <textarea className="input w-full resize-none" rows={3}
                                    value={formE.comentarios}
                                    onChange={e => setFormE(v => ({ ...v, comentarios: e.target.value }))}
                                    placeholder="Observaciones del evaluador..." />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
                            <button onClick={() => setModalE(false)} className="btn btn-secondary flex items-center gap-2"><X className="w-4 h-4" /> Cancelar</button>
                            <button onClick={guardarEval} disabled={saving} className="btn btn-primary flex items-center gap-2">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />} Guardar Evaluación
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
