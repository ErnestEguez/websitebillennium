import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { capacitacionService } from '../../services/nominas/capacitacionService'
import { empleadosService } from '../../services/nominas/empleadosService'
import type { Curso, InscripcionCurso, TipoCurso, EstadoInscripcion } from '../../types/nominas'
import type { Empleado } from '../../types/nominas'
import { BookOpen, Plus, Edit2, Trash2, X, Save, Loader2, ChevronRight, GraduationCap, CheckCircle2, XCircle, Clock, UserPlus } from 'lucide-react'
import { cn } from '../../lib/utils'

const TIPO_COLOR: Record<TipoCurso, string> = { interno: 'bg-indigo-100 text-indigo-700', externo: 'bg-violet-100 text-violet-700' }
const ESTADO_COLOR: Record<EstadoInscripcion, string> = {
    inscrito:   'bg-slate-100 text-slate-500',
    asistio:    'bg-blue-100 text-blue-700',
    aprobado:   'bg-emerald-100 text-emerald-700',
    no_asistio: 'bg-red-100 text-red-600',
}
const ESTADO_LABEL: Record<EstadoInscripcion, string> = {
    inscrito: 'Inscrito', asistio: 'Asistió', aprobado: 'Aprobado', no_asistio: 'No asistió',
}

type FormCurso = { id?: string; nombre: string; tipo: TipoCurso; proveedor: string; descripcion: string; horas: string; costo_total: string; fecha_inicio: string; fecha_fin: string }
type FormInsc  = { id?: string; empleado_id: string; estado: EstadoInscripcion; costo_empleado: string; notas: string }

const EMPTY_C: FormCurso = { nombre: '', tipo: 'interno', proveedor: '', descripcion: '', horas: '', costo_total: '', fecha_inicio: '', fecha_fin: '' }
const EMPTY_I: FormInsc  = { empleado_id: '', estado: 'inscrito', costo_empleado: '', notas: '' }

export function CapacitacionPage() {
    const { empresa } = useAuth() as any
    const [cursos, setCursos]           = useState<Curso[]>([])
    const [activo, setActivo]           = useState<Curso | null>(null)
    const [inscripciones, setInscrips]  = useState<InscripcionCurso[]>([])
    const [empleados, setEmpleados]     = useState<Empleado[]>([])
    const [loading, setLoading]         = useState(true)
    const [loadingI, setLoadingI]       = useState(false)
    const [saving, setSaving]           = useState(false)

    const [modalC, setModalC] = useState(false)
    const [formC, setFormC]   = useState<FormCurso>({ ...EMPTY_C })
    const [modalI, setModalI] = useState(false)
    const [formI, setFormI]   = useState<FormInsc>({ ...EMPTY_I })

    useEffect(() => { if (empresa?.id) init() }, [empresa?.id])

    async function init() {
        setLoading(true)
        try {
            const [cs, emps] = await Promise.all([
                capacitacionService.listarCursos(empresa!.id),
                empleadosService.listarEmpleados(empresa!.id),
            ])
            setCursos(cs)
            setEmpleados(emps)
        } catch (e) { console.error(e) }
        finally { setLoading(false) }
    }

    async function seleccionarCurso(c: Curso) {
        setActivo(c)
        setLoadingI(true)
        try {
            const ins = await capacitacionService.listarPorCurso(c.id)
            setInscrips(ins)
        } catch (e) { console.error(e) }
        finally { setLoadingI(false) }
    }

    // ── Cursos ────────────────────────────────────────────────────────────────

    function abrirNuevoCurso() { setFormC({ ...EMPTY_C }); setModalC(true) }
    function abrirEditarCurso(c: Curso) {
        setFormC({ id: c.id, nombre: c.nombre, tipo: c.tipo, proveedor: c.proveedor ?? '', descripcion: c.descripcion ?? '', horas: c.horas.toString(), costo_total: c.costo_total?.toString() ?? '', fecha_inicio: c.fecha_inicio ?? '', fecha_fin: c.fecha_fin ?? '' })
        setModalC(true)
    }

    async function guardarCurso() {
        if (!formC.nombre.trim()) { alert('El nombre es obligatorio'); return }
        setSaving(true)
        try {
            const payload = {
                empresa_id: empresa!.id,
                nombre: formC.nombre.trim(), tipo: formC.tipo,
                proveedor: formC.proveedor || null, descripcion: formC.descripcion || null,
                horas: parseFloat(formC.horas) || 0,
                costo_total: formC.costo_total ? parseFloat(formC.costo_total) : null,
                fecha_inicio: formC.fecha_inicio || null, fecha_fin: formC.fecha_fin || null,
                activo: true,
            }
            if (formC.id) await capacitacionService.actualizarCurso(formC.id, payload)
            else          await capacitacionService.crearCurso(payload)
            setModalC(false)
            await init()
        } catch (e: any) { alert(`Error: ${e.message}`) }
        finally { setSaving(false) }
    }

    async function desactivarCurso(c: Curso) {
        if (!confirm(`¿Desactivar el curso "${c.nombre}"?`)) return
        await capacitacionService.desactivarCurso(c.id)
        if (activo?.id === c.id) { setActivo(null); setInscrips([]) }
        await init()
    }

    // ── Inscripciones ─────────────────────────────────────────────────────────

    function abrirNuevaInsc() { setFormI({ ...EMPTY_I }); setModalI(true) }
    function abrirEditarInsc(i: InscripcionCurso) {
        setFormI({ id: i.id, empleado_id: i.empleado_id, estado: i.estado, costo_empleado: i.costo_empleado?.toString() ?? '', notas: i.notas ?? '' })
        setModalI(true)
    }

    async function guardarInsc() {
        if (!formI.empleado_id || !activo) { alert('Selecciona un empleado'); return }
        setSaving(true)
        try {
            const payload = {
                empresa_id: empresa!.id, curso_id: activo.id,
                empleado_id: formI.empleado_id, estado: formI.estado,
                costo_empleado: formI.costo_empleado ? parseFloat(formI.costo_empleado) : 0,
                notas: formI.notas || null, certificado_url: null,
            }
            if (formI.id) await capacitacionService.actualizarInscripcion(formI.id, payload)
            else          await capacitacionService.crearInscripcion(payload)
            setModalI(false)
            const ins = await capacitacionService.listarPorCurso(activo.id)
            setInscrips(ins)
        } catch (e: any) { alert(`Error: ${e.message}`) }
        finally { setSaving(false) }
    }

    async function eliminarInsc(id: string) {
        if (!confirm('¿Eliminar esta inscripción?')) return
        await capacitacionService.eliminarInscripcion(id)
        setInscrips(prev => prev.filter(i => i.id !== id))
    }

    const aprobados = inscripciones.filter(i => i.estado === 'aprobado').length

    if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Capacitación y Desarrollo</h1>
                    <p className="text-slate-600 mt-1">Cursos internos y externos, inscripciones y certificaciones</p>
                </div>
                <button onClick={abrirNuevoCurso} className="btn btn-primary flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Nuevo Curso
                </button>
            </div>

            <div className={cn('grid gap-4', activo ? 'grid-cols-[320px,1fr]' : 'grid-cols-1')}>

                {/* Lista de cursos */}
                <div className="space-y-2">
                    {cursos.length === 0 ? (
                        <div className="card flex flex-col items-center py-16 text-slate-400">
                            <GraduationCap className="w-10 h-10 opacity-40 mb-3" />
                            <p className="font-semibold">Sin cursos registrados</p>
                            <button onClick={abrirNuevoCurso} className="btn btn-primary mt-4 text-sm flex items-center gap-1.5">
                                <Plus className="w-3.5 h-3.5" /> Agregar curso
                            </button>
                        </div>
                    ) : cursos.map(c => (
                        <div key={c.id} onClick={() => seleccionarCurso(c)}
                            className={cn('card p-4 cursor-pointer transition-all hover:shadow-md', activo?.id === c.id && 'ring-2 ring-indigo-500')}>
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', TIPO_COLOR[c.tipo])}>
                                            {c.tipo === 'interno' ? 'Interno' : 'Externo'}
                                        </span>
                                        <span className="text-xs text-slate-400">{c.horas}h</span>
                                    </div>
                                    <p className="font-semibold text-slate-900 truncate">{c.nombre}</p>
                                    {c.proveedor && <p className="text-xs text-slate-400">{c.proveedor}</p>}
                                    <div className="flex items-center gap-3 mt-0.5">
                                        <span className="text-xs text-slate-500">{c.inscripciones_count ?? 0} participantes</span>
                                        {c.costo_total && <span className="text-xs text-slate-500">${c.costo_total.toLocaleString()}</span>}
                                    </div>
                                    {c.fecha_inicio && <p className="text-xs text-slate-400 mt-0.5">{c.fecha_inicio}{c.fecha_fin ? ` → ${c.fecha_fin}` : ''}</p>}
                                </div>
                                <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                    <button onClick={() => abrirEditarCurso(c)} className="p-1 text-slate-300 hover:text-indigo-600 rounded transition-colors">
                                        <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => desactivarCurso(c)} className="p-1 text-slate-300 hover:text-red-500 rounded transition-colors">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                    <ChevronRight className="w-4 h-4 text-slate-300 mt-0.5" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Panel de inscripciones */}
                {activo && (
                    <div className="card overflow-hidden flex flex-col">
                        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-bold text-slate-900">{activo.nombre}</h2>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {inscripciones.length} inscritos · {aprobados} aprobados · {activo.horas}h
                                    {activo.costo_total ? ` · Costo total $${activo.costo_total.toLocaleString()}` : ''}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={abrirNuevaInsc} className="btn btn-primary text-sm flex items-center gap-1.5">
                                    <UserPlus className="w-3.5 h-3.5" /> Inscribir
                                </button>
                                <button onClick={() => { setActivo(null); setInscrips([]) }} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {loadingI ? (
                                <div className="flex items-center justify-center py-10 text-slate-400">
                                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando...
                                </div>
                            ) : inscripciones.length === 0 ? (
                                <div className="text-center py-12 text-slate-400">
                                    <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40" />
                                    <p className="text-sm">Sin participantes. Inscribe el primer empleado.</p>
                                    <button onClick={abrirNuevaInsc} className="btn btn-primary mt-3 text-sm flex items-center gap-1.5 mx-auto">
                                        <UserPlus className="w-3.5 h-3.5" /> Inscribir
                                    </button>
                                </div>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                                        <tr>
                                            <th className="px-5 py-3 text-left">Empleado</th>
                                            <th className="px-4 py-3 text-left">Estado</th>
                                            <th className="px-4 py-3 text-right">Costo</th>
                                            <th className="px-4 py-3 text-left">Notas</th>
                                            <th className="px-4 py-3"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {inscripciones.map(i => (
                                            <tr key={i.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-5 py-3">
                                                    <p className="font-semibold text-slate-800">{i.empleado?.nombres} {i.empleado?.apellidos}</p>
                                                    {i.empleado?.cargo?.nombre && <p className="text-xs text-slate-400">{i.empleado.cargo.nombre}</p>}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-1.5">
                                                        {i.estado === 'aprobado'   && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                                                        {i.estado === 'no_asistio' && <XCircle       className="w-3.5 h-3.5 text-red-400" />}
                                                        {i.estado === 'inscrito'   && <Clock          className="w-3.5 h-3.5 text-slate-400" />}
                                                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', ESTADO_COLOR[i.estado])}>
                                                            {ESTADO_LABEL[i.estado]}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-right text-slate-600">
                                                    {i.costo_empleado ? `$${i.costo_empleado.toLocaleString()}` : '—'}
                                                </td>
                                                <td className="px-4 py-3 text-slate-400 text-xs truncate max-w-[150px]">{i.notas || '—'}</td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="flex gap-1 justify-end">
                                                        <button onClick={() => abrirEditarInsc(i)} className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors">
                                                            <Edit2 className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button onClick={() => eliminarInsc(i.id)} className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors">
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Modal curso */}
            {modalC && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <h3 className="text-lg font-bold text-slate-900">{formC.id ? 'Editar Curso' : 'Nuevo Curso'}</h3>
                            <button onClick={() => setModalC(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="px-6 py-5 space-y-4">
                            <div className="grid grid-cols-3 gap-3">
                                <div className="col-span-2">
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre *</label>
                                    <input className="input w-full" value={formC.nombre} onChange={e => setFormC(v => ({ ...v, nombre: e.target.value }))} placeholder="Nombre del curso" />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo</label>
                                    <select className="input w-full" value={formC.tipo} onChange={e => setFormC(v => ({ ...v, tipo: e.target.value as TipoCurso }))}>
                                        <option value="interno">Interno</option>
                                        <option value="externo">Externo</option>
                                    </select>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Proveedor / Instructor</label>
                                    <input className="input w-full" value={formC.proveedor} onChange={e => setFormC(v => ({ ...v, proveedor: e.target.value }))} placeholder="Ej: SECAP, Udemy..." />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Horas</label>
                                    <input type="number" min="0" step="0.5" className="input w-full" value={formC.horas} onChange={e => setFormC(v => ({ ...v, horas: e.target.value }))} placeholder="0" />
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Costo total ($)</label>
                                    <input type="number" min="0" step="0.01" className="input w-full" value={formC.costo_total} onChange={e => setFormC(v => ({ ...v, costo_total: e.target.value }))} placeholder="0.00" />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha inicio</label>
                                    <input type="date" className="input w-full" value={formC.fecha_inicio} onChange={e => setFormC(v => ({ ...v, fecha_inicio: e.target.value }))} />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha fin</label>
                                    <input type="date" className="input w-full" value={formC.fecha_fin} onChange={e => setFormC(v => ({ ...v, fecha_fin: e.target.value }))} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Descripción</label>
                                <textarea className="input w-full resize-none" rows={2} value={formC.descripcion} onChange={e => setFormC(v => ({ ...v, descripcion: e.target.value }))} placeholder="Temas, objetivos del curso..." />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
                            <button onClick={() => setModalC(false)} className="btn btn-secondary flex items-center gap-2"><X className="w-4 h-4" /> Cancelar</button>
                            <button onClick={guardarCurso} disabled={saving} className="btn btn-primary flex items-center gap-2">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal inscripción */}
            {modalI && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <h3 className="text-lg font-bold text-slate-900">{formI.id ? 'Editar Inscripción' : 'Inscribir Empleado'}</h3>
                            <button onClick={() => setModalI(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="px-6 py-5 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Empleado *</label>
                                <select className="input w-full" value={formI.empleado_id} onChange={e => setFormI(v => ({ ...v, empleado_id: e.target.value }))}>
                                    <option value="">— Seleccionar —</option>
                                    {empleados.map(e => <option key={e.id} value={e.id}>{e.apellidos}, {e.nombres}</option>)}
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Estado</label>
                                    <select className="input w-full" value={formI.estado} onChange={e => setFormI(v => ({ ...v, estado: e.target.value as EstadoInscripcion }))}>
                                        <option value="inscrito">Inscrito</option>
                                        <option value="asistio">Asistió</option>
                                        <option value="aprobado">Aprobado</option>
                                        <option value="no_asistio">No asistió</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Costo empleado ($)</label>
                                    <input type="number" min="0" step="0.01" className="input w-full" value={formI.costo_empleado} onChange={e => setFormI(v => ({ ...v, costo_empleado: e.target.value }))} placeholder="0.00" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Notas</label>
                                <textarea className="input w-full resize-none" rows={2} value={formI.notas} onChange={e => setFormI(v => ({ ...v, notas: e.target.value }))} placeholder="Observaciones..." />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
                            <button onClick={() => setModalI(false)} className="btn btn-secondary flex items-center gap-2"><X className="w-4 h-4" /> Cancelar</button>
                            <button onClick={guardarInsc} disabled={saving} className="btn btn-primary flex items-center gap-2">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
