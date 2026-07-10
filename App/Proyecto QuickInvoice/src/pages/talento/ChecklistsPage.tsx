import { useState, useEffect } from 'react'
import { HelpButton } from '../../components/help/HelpButton'
import { useAuth } from '../../contexts/AuthContext'
import { checklistsEmpleadoService } from '../../services/nominas/checklistsEmpleadoService'
import { plantillasChecklistService } from '../../services/nominas/plantillasChecklistService'
import { empleadosService } from '../../services/nominas/empleadosService'
import type { ChecklistEmpleado, ChecklistItemEmpleado, TipoChecklist, EstadoChecklist, PlantillaChecklist } from '../../types/nominas'
import type { Empleado } from '../../types/nominas'
import { ClipboardList, Plus, X, Loader2, CheckSquare, Square, ChevronRight, Trash2, CalendarDays } from 'lucide-react'
import { cn } from '../../lib/utils'

const TIPO_LABEL: Record<TipoChecklist, string>   = { onboarding: '↓ Onboarding', offboarding: '↑ Offboarding' }
const TIPO_COLOR: Record<TipoChecklist, string>   = { onboarding: 'bg-green-100 text-green-700', offboarding: 'bg-red-100 text-red-600' }
const ESTADO_LABEL: Record<EstadoChecklist, string> = { pendiente: 'Pendiente', en_progreso: 'En progreso', completado: 'Completado' }
const ESTADO_COLOR: Record<EstadoChecklist, string> = {
    pendiente:   'bg-slate-100 text-slate-500',
    en_progreso: 'bg-amber-100 text-amber-700',
    completado:  'bg-emerald-100 text-emerald-700',
}

type FormNuevo = {
    empleado_id: string
    tipo: TipoChecklist
    plantilla_id: string
    desde_plantilla: boolean
    fecha_inicio: string
    fecha_limite: string
}

const EMPTY_FORM: FormNuevo = {
    empleado_id: '', tipo: 'onboarding', plantilla_id: '', desde_plantilla: true,
    fecha_inicio: new Date().toISOString().slice(0, 10), fecha_limite: '',
}

export function ChecklistsPage() {
    const { empresa } = useAuth() as any
    const [checklists, setChecklists] = useState<ChecklistEmpleado[]>([])
    const [activo, setActivo] = useState<ChecklistEmpleado | null>(null)
    const [items, setItems] = useState<ChecklistItemEmpleado[]>([])
    const [empleados, setEmpleados] = useState<Empleado[]>([])
    const [plantillas, setPlantillas] = useState<PlantillaChecklist[]>([])
    const [loading, setLoading] = useState(true)
    const [loadingItems, setLoadingItems] = useState(false)
    const [saving, setSaving] = useState(false)

    const [filtroTipo, setFiltroTipo] = useState<TipoChecklist | 'todos'>('todos')
    const [filtroEstado, setFiltroEstado] = useState<EstadoChecklist | 'todos'>('todos')

    const [modalNuevo, setModalNuevo] = useState(false)
    const [form, setForm] = useState<FormNuevo>({ ...EMPTY_FORM })
    const [plantillasFiltradas, setPlantillasFiltradas] = useState<PlantillaChecklist[]>([])

    useEffect(() => { if (empresa?.id) init() }, [empresa?.id])

    async function init() {
        setLoading(true)
        try {
            const [cks, emps, plants] = await Promise.all([
                checklistsEmpleadoService.listar(empresa!.id),
                empleadosService.listarEmpleados(empresa!.id),
                plantillasChecklistService.listar(empresa!.id),
            ])
            setChecklists(cks)
            setEmpleados(emps)
            setPlantillas(plants)
        } catch (e) { console.error(e) }
        finally { setLoading(false) }
    }

    async function seleccionarChecklist(ck: ChecklistEmpleado) {
        setActivo(ck)
        setLoadingItems(true)
        try {
            const its = await checklistsEmpleadoService.listarItems(ck.id)
            setItems(its)
        } catch (e) { console.error(e) }
        finally { setLoadingItems(false) }
    }

    async function toggleItem(item: ChecklistItemEmpleado) {
        const nuevoCompletado = !item.completado
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, completado: nuevoCompletado, fecha_completado: nuevoCompletado ? new Date().toISOString().slice(0, 10) : null } : i))
        await checklistsEmpleadoService.marcarCompletado(item.id, nuevoCompletado)
        if (activo) {
            const nuevoEstado = await checklistsEmpleadoService.sincronizarEstado(activo.id)
            setActivo(prev => prev ? { ...prev, estado: nuevoEstado } : null)
            setChecklists(prev => prev.map(c => c.id === activo.id ? { ...c, estado: nuevoEstado } : c))
        }
    }

    async function eliminarChecklist(id: string) {
        if (!confirm('¿Eliminar este checklist y todas sus tareas?')) return
        await checklistsEmpleadoService.eliminar(id)
        if (activo?.id === id) { setActivo(null); setItems([]) }
        setChecklists(prev => prev.filter(c => c.id !== id))
    }

    // ── Formulario nuevo ──────────────────────────────────────────────────────

    function abrirNuevo() {
        setForm({ ...EMPTY_FORM })
        setPlantillasFiltradas(plantillas.filter(p => p.tipo === 'onboarding'))
        setModalNuevo(true)
    }

    function onCambioTipo(tipo: TipoChecklist) {
        setForm(v => ({ ...v, tipo, plantilla_id: '' }))
        setPlantillasFiltradas(plantillas.filter(p => p.tipo === tipo))
    }

    async function guardarNuevo() {
        if (!form.empleado_id) { alert('Selecciona un empleado'); return }
        if (form.desde_plantilla && !form.plantilla_id) { alert('Selecciona una plantilla'); return }
        setSaving(true)
        try {
            if (form.desde_plantilla) {
                await checklistsEmpleadoService.crearDesdeTemplate(
                    empresa!.id, form.empleado_id, form.plantilla_id, form.tipo,
                    form.fecha_inicio, form.fecha_limite || null
                )
            } else {
                await checklistsEmpleadoService.crearVacio(
                    empresa!.id, form.empleado_id, form.tipo,
                    form.fecha_inicio, form.fecha_limite || null
                )
            }
            setModalNuevo(false)
            await init()
        } catch (e: any) { alert(`Error: ${e.message}`) }
        finally { setSaving(false) }
    }

    // ── Filtrado ──────────────────────────────────────────────────────────────

    const lista = checklists.filter(c =>
        (filtroTipo   === 'todos' || c.tipo   === filtroTipo) &&
        (filtroEstado === 'todos' || c.estado === filtroEstado)
    )

    // Calcular progreso de ítems
    function progreso(ck: ChecklistEmpleado) {
        const total = (ck.items_count as any) ?? 0
        const comp  = (ck.items_completados as any) ?? 0
        return total > 0 ? Math.round((comp / total) * 100) : 0
    }

    const completadosActivos = items.filter(i => i.completado).length

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
    )

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Onboarding / Offboarding</h1>
                    <p className="text-slate-600 mt-1">Checklists de tareas por empleado</p>
                </div>
                <div className="flex items-center gap-2">
                    <HelpButton pageKey="onboarding" />
                    <button onClick={abrirNuevo} className="btn btn-primary flex items-center gap-2">
                        <Plus className="w-4 h-4" /> Nuevo Checklist
                    </button>
                </div>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap gap-2">
                <div className="flex gap-1 bg-slate-100 rounded-full p-1">
                    {(['todos', 'onboarding', 'offboarding'] as const).map(f => (
                        <button key={f} onClick={() => setFiltroTipo(f)}
                            className={cn('px-3 py-1 rounded-full text-xs font-medium transition-colors',
                                filtroTipo === f ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700')}>
                            {f === 'todos' ? 'Todos' : TIPO_LABEL[f]}
                        </button>
                    ))}
                </div>
                <div className="flex gap-1 bg-slate-100 rounded-full p-1">
                    {(['todos', 'pendiente', 'en_progreso', 'completado'] as const).map(f => (
                        <button key={f} onClick={() => setFiltroEstado(f)}
                            className={cn('px-3 py-1 rounded-full text-xs font-medium transition-colors',
                                filtroEstado === f ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700')}>
                            {f === 'todos' ? 'Todos' : ESTADO_LABEL[f]}
                        </button>
                    ))}
                </div>
            </div>

            <div className={cn('grid gap-4', activo ? 'grid-cols-[320px,1fr]' : 'grid-cols-1')}>

                {/* Lista de checklists */}
                <div className="space-y-2">
                    {lista.length === 0 ? (
                        <div className="card flex flex-col items-center py-16 text-slate-400">
                            <ClipboardList className="w-10 h-10 opacity-40 mb-3" />
                            <p className="font-semibold">Sin checklists</p>
                            <button onClick={abrirNuevo} className="btn btn-primary mt-4 text-sm flex items-center gap-1.5">
                                <Plus className="w-3.5 h-3.5" /> Crear checklist
                            </button>
                        </div>
                    ) : lista.map(ck => {
                        const pct = progreso(ck)
                        const total = (ck.items_count as any) ?? 0
                        const comp  = (ck.items_completados as any) ?? 0
                        return (
                            <div key={ck.id} onClick={() => seleccionarChecklist(ck)}
                                className={cn('card p-4 cursor-pointer transition-all hover:shadow-md',
                                    activo?.id === ck.id && 'ring-2 ring-indigo-500')}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold shrink-0', TIPO_COLOR[ck.tipo])}>
                                                {TIPO_LABEL[ck.tipo]}
                                            </span>
                                            <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold shrink-0', ESTADO_COLOR[ck.estado])}>
                                                {ESTADO_LABEL[ck.estado]}
                                            </span>
                                        </div>
                                        <p className="font-semibold text-slate-900 mt-1 truncate">
                                            {ck.empleado?.nombres} {ck.empleado?.apellidos}
                                        </p>
                                        {ck.empleado?.cargo?.nombre && (
                                            <p className="text-xs text-slate-400">{ck.empleado.cargo.nombre}</p>
                                        )}
                                        <div className="flex items-center gap-2 mt-1">
                                            <CalendarDays className="w-3 h-3 text-slate-400" />
                                            <span className="text-xs text-slate-500">{ck.fecha_inicio}</span>
                                            {ck.fecha_limite && <span className="text-xs text-slate-400">→ {ck.fecha_limite}</span>}
                                        </div>
                                        {total > 0 && (
                                            <div className="mt-2">
                                                <div className="flex justify-between text-xs text-slate-400 mb-0.5">
                                                    <span>{comp}/{total} tareas</span>
                                                    <span>{pct}%</span>
                                                </div>
                                                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className={cn('h-full rounded-full transition-all', pct === 100 ? 'bg-emerald-500' : 'bg-indigo-500')}
                                                        style={{ width: `${pct}%` }} />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex gap-1 shrink-0">
                                        <button onClick={e => { e.stopPropagation(); eliminarChecklist(ck.id) }}
                                            className="p-1 text-slate-300 hover:text-red-500 rounded transition-colors">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                        <ChevronRight className="w-4 h-4 text-slate-300 mt-0.5" />
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Panel de tareas */}
                {activo && (
                    <div className="card overflow-hidden flex flex-col">
                        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', TIPO_COLOR[activo.tipo])}>
                                        {TIPO_LABEL[activo.tipo]}
                                    </span>
                                    <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', ESTADO_COLOR[activo.estado])}>
                                        {ESTADO_LABEL[activo.estado]}
                                    </span>
                                </div>
                                <h2 className="text-lg font-bold text-slate-900">
                                    {activo.empleado?.nombres} {activo.empleado?.apellidos}
                                </h2>
                                <p className="text-xs text-slate-500">
                                    {completadosActivos}/{items.length} tareas completadas
                                    {activo.fecha_limite && ` · Límite: ${activo.fecha_limite}`}
                                </p>
                                {items.length > 0 && (
                                    <div className="mt-2 w-48">
                                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div className={cn('h-full rounded-full transition-all', completadosActivos === items.length ? 'bg-emerald-500' : 'bg-indigo-500')}
                                                style={{ width: items.length > 0 ? `${Math.round((completadosActivos / items.length) * 100)}%` : '0%' }} />
                                        </div>
                                    </div>
                                )}
                            </div>
                            <button onClick={() => { setActivo(null); setItems([]) }}
                                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
                            {loadingItems ? (
                                <div className="flex items-center gap-2 text-slate-400 py-8 justify-center">
                                    <Loader2 className="w-4 h-4 animate-spin" /> Cargando tareas...
                                </div>
                            ) : items.length === 0 ? (
                                <div className="text-center py-10 text-slate-400">
                                    <CheckSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
                                    <p className="text-sm">Este checklist no tiene tareas.</p>
                                </div>
                            ) : items.map(item => (
                                <div key={item.id}
                                    onClick={() => toggleItem(item)}
                                    className={cn(
                                        'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all',
                                        item.completado
                                            ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100'
                                            : 'border-slate-100 bg-white hover:border-indigo-200 hover:bg-indigo-50'
                                    )}>
                                    <div className="mt-0.5 shrink-0">
                                        {item.completado
                                            ? <CheckSquare className="w-5 h-5 text-emerald-500" />
                                            : <Square className="w-5 h-5 text-slate-300" />
                                        }
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={cn('text-sm', item.completado ? 'line-through text-slate-400' : 'text-slate-800')}>
                                            {item.descripcion}
                                        </p>
                                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                            <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium',
                                                item.responsable_tipo === 'empleado' ? 'bg-blue-100 text-blue-700' :
                                                item.responsable_tipo === 'rrhh'     ? 'bg-indigo-100 text-indigo-700' :
                                                item.responsable_tipo === 'it'       ? 'bg-violet-100 text-violet-700' :
                                                item.responsable_tipo === 'gerencia' ? 'bg-amber-100 text-amber-700' :
                                                'bg-slate-100 text-slate-500')}>
                                                {item.responsable_tipo === 'empleado' ? 'Empleado' :
                                                 item.responsable_tipo === 'rrhh'     ? 'RRHH' :
                                                 item.responsable_tipo === 'it'       ? 'TI' :
                                                 item.responsable_tipo === 'gerencia' ? 'Gerencia' : 'Otro'}
                                            </span>
                                            {item.dias_plazo && (
                                                <span className="text-xs text-slate-400">Día {item.dias_plazo}</span>
                                            )}
                                            {item.completado && item.fecha_completado && (
                                                <span className="text-xs text-emerald-600">✓ {item.fecha_completado}</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Modal nuevo checklist */}
            {modalNuevo && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <h3 className="text-lg font-bold text-slate-900">Nuevo Checklist</h3>
                            <button onClick={() => setModalNuevo(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="px-6 py-5 space-y-4">
                            {/* Tipo */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-2">Tipo</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {(['onboarding', 'offboarding'] as TipoChecklist[]).map(t => (
                                        <button key={t} onClick={() => onCambioTipo(t)}
                                            className={cn('py-2 rounded-lg text-sm font-medium border-2 transition-colors',
                                                form.tipo === t
                                                    ? t === 'onboarding' ? 'border-green-500 bg-green-50 text-green-700' : 'border-red-400 bg-red-50 text-red-600'
                                                    : 'border-slate-200 text-slate-500 hover:border-slate-300')}>
                                            {TIPO_LABEL[t]}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Empleado */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Empleado *</label>
                                <select className="input w-full" value={form.empleado_id}
                                    onChange={e => setForm(v => ({ ...v, empleado_id: e.target.value }))}>
                                    <option value="">— Seleccionar —</option>
                                    {empleados.map(e => (
                                        <option key={e.id} value={e.id}>{e.apellidos}, {e.nombres}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Desde plantilla */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-2">Origen</label>
                                <div className="flex gap-3">
                                    <button onClick={() => setForm(v => ({ ...v, desde_plantilla: true }))}
                                        className={cn('flex-1 py-2 rounded-lg text-sm border-2 transition-colors',
                                            form.desde_plantilla ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500')}>
                                        Desde plantilla
                                    </button>
                                    <button onClick={() => setForm(v => ({ ...v, desde_plantilla: false, plantilla_id: '' }))}
                                        className={cn('flex-1 py-2 rounded-lg text-sm border-2 transition-colors',
                                            !form.desde_plantilla ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500')}>
                                        En blanco
                                    </button>
                                </div>
                            </div>

                            {form.desde_plantilla && (
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Plantilla *</label>
                                    {plantillasFiltradas.length === 0 ? (
                                        <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                                            No hay plantillas de {form.tipo}. Créalas en "Plantillas Checklist".
                                        </p>
                                    ) : (
                                        <select className="input w-full" value={form.plantilla_id}
                                            onChange={e => setForm(v => ({ ...v, plantilla_id: e.target.value }))}>
                                            <option value="">— Seleccionar plantilla —</option>
                                            {plantillasFiltradas.map(p => (
                                                <option key={p.id} value={p.id}>{p.nombre} ({p.items_count ?? 0} tareas)</option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha inicio</label>
                                    <input type="date" className="input w-full" value={form.fecha_inicio}
                                        onChange={e => setForm(v => ({ ...v, fecha_inicio: e.target.value }))} />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha límite (opcional)</label>
                                    <input type="date" className="input w-full" value={form.fecha_limite}
                                        onChange={e => setForm(v => ({ ...v, fecha_limite: e.target.value }))} />
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
                            <button onClick={() => setModalNuevo(false)} className="btn btn-secondary flex items-center gap-2">
                                <X className="w-4 h-4" /> Cancelar
                            </button>
                            <button onClick={guardarNuevo} disabled={saving} className="btn btn-primary flex items-center gap-2">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Crear
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
