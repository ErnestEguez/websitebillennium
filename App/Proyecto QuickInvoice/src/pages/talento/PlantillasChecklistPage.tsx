import { useState, useEffect } from 'react'
import { HelpButton } from '../../components/help/HelpButton'
import { useAuth } from '../../contexts/AuthContext'
import { plantillasChecklistService } from '../../services/nominas/plantillasChecklistService'
import { estructuraOrganizativaService } from '../../services/nominas/estructuraOrganizativaService'
import type { PlantillaChecklist, PlantillaItem, TipoChecklist, TipoResponsable, SeccionNomina, CargoNomina } from '../../types/nominas'
import { ListChecks, Plus, Edit2, Save, X, Loader2, Trash2, GripVertical, ChevronRight, CheckSquare, UserX } from 'lucide-react'
import { cn } from '../../lib/utils'

const RESP_LABEL: Record<TipoResponsable, string> = {
    empleado: 'Empleado', rrhh: 'RRHH', it: 'TI/Sistemas', gerencia: 'Gerencia', otro: 'Otro',
}
const RESP_COLOR: Record<TipoResponsable, string> = {
    empleado: 'bg-blue-100 text-blue-700',
    rrhh:     'bg-indigo-100 text-indigo-700',
    it:       'bg-violet-100 text-violet-700',
    gerencia: 'bg-amber-100 text-amber-700',
    otro:     'bg-slate-100 text-slate-500',
}

type FormPlantilla = { id?: string; nombre: string; tipo: TipoChecklist; cargo_id: string; seccion_id: string; descripcion: string }
type FormItem     = { id?: string; descripcion: string; responsable_tipo: TipoResponsable; dias_plazo: string }

const EMPTY_P: FormPlantilla = { nombre: '', tipo: 'onboarding', cargo_id: '', seccion_id: '', descripcion: '' }
const EMPTY_I: FormItem      = { descripcion: '', responsable_tipo: 'rrhh', dias_plazo: '' }

export function PlantillasChecklistPage() {
    const { empresa } = useAuth() as any
    const [plantillas, setPlantillas] = useState<PlantillaChecklist[]>([])
    const [items, setItems] = useState<PlantillaItem[]>([])
    const [secciones, setSecciones] = useState<SeccionNomina[]>([])
    const [cargos, setCargos] = useState<CargoNomina[]>([])
    const [loading, setLoading] = useState(true)
    const [activa, setActiva] = useState<PlantillaChecklist | null>(null)
    const [filtro, setFiltro] = useState<TipoChecklist | 'todas'>('todas')

    const [modalP, setModalP] = useState(false)
    const [formP, setFormP] = useState<FormPlantilla>({ ...EMPTY_P })

    const [editandoItem, setEditandoItem] = useState<string | null>(null) // id del item en edición inline
    const [formI, setFormI] = useState<FormItem>({ ...EMPTY_I })
    const [addingItem, setAddingItem] = useState(false)

    const [saving, setSaving] = useState(false)
    const [loadingItems, setLoadingItems] = useState(false)

    useEffect(() => {
        if (empresa?.id) init()
    }, [empresa?.id])

    async function init() {
        setLoading(true)
        try {
            const [ps, secs, cars] = await Promise.all([
                plantillasChecklistService.listar(empresa!.id),
                estructuraOrganizativaService.listarSecciones(empresa!.id),
                estructuraOrganizativaService.listarCargos(empresa!.id),
            ])
            setPlantillas(ps)
            setSecciones(secs)
            setCargos(cars)
        } catch (e) { console.error(e) }
        finally { setLoading(false) }
    }

    async function seleccionarPlantilla(p: PlantillaChecklist) {
        setActiva(p)
        setAddingItem(false)
        setEditandoItem(null)
        setLoadingItems(true)
        try {
            const its = await plantillasChecklistService.listarItems(p.id)
            setItems(its)
        } catch (e) { console.error(e) }
        finally { setLoadingItems(false) }
    }

    // ── CRUD plantillas ───────────────────────────────────────────────────────

    function abrirNueva() { setFormP({ ...EMPTY_P }); setModalP(true) }
    function abrirEditar(p: PlantillaChecklist) {
        setFormP({ id: p.id, nombre: p.nombre, tipo: p.tipo, cargo_id: p.cargo_id ?? '', seccion_id: p.seccion_id ?? '', descripcion: p.descripcion ?? '' })
        setModalP(true)
    }

    async function guardarPlantilla() {
        if (!formP.nombre.trim()) { alert('El nombre es obligatorio'); return }
        setSaving(true)
        try {
            const payload = { empresa_id: empresa!.id, nombre: formP.nombre.trim(), tipo: formP.tipo, cargo_id: formP.cargo_id || null, seccion_id: formP.seccion_id || null, descripcion: formP.descripcion || null, activo: true }
            if (formP.id) await plantillasChecklistService.actualizar(formP.id, payload)
            else await plantillasChecklistService.crear(payload)
            setModalP(false)
            await init()
        } catch (e: any) { alert(`Error: ${e.message}`) }
        finally { setSaving(false) }
    }

    async function desactivarPlantilla(p: PlantillaChecklist) {
        if (!confirm(`¿Desactivar la plantilla "${p.nombre}"?`)) return
        await plantillasChecklistService.desactivar(p.id)
        if (activa?.id === p.id) setActiva(null)
        await init()
    }

    // ── CRUD ítems ────────────────────────────────────────────────────────────

    async function guardarItem() {
        if (!formI.descripcion.trim() || !activa) { alert('La descripción es obligatoria'); return }
        setSaving(true)
        try {
            if (editandoItem) {
                await plantillasChecklistService.actualizarItem(editandoItem, {
                    descripcion: formI.descripcion.trim(),
                    responsable_tipo: formI.responsable_tipo,
                    dias_plazo: formI.dias_plazo ? parseInt(formI.dias_plazo) : null,
                })
            } else {
                const maxOrden = items.length > 0 ? Math.max(...items.map(i => i.orden)) + 1 : 1
                await plantillasChecklistService.crearItem({
                    empresa_id: empresa!.id,
                    plantilla_id: activa.id,
                    orden: maxOrden,
                    descripcion: formI.descripcion.trim(),
                    responsable_tipo: formI.responsable_tipo,
                    dias_plazo: formI.dias_plazo ? parseInt(formI.dias_plazo) : null,
                    activo: true,
                })
            }
            setFormI({ ...EMPTY_I })
            setEditandoItem(null)
            setAddingItem(false)
            const its = await plantillasChecklistService.listarItems(activa.id)
            setItems(its)
        } catch (e: any) { alert(`Error: ${e.message}`) }
        finally { setSaving(false) }
    }

    function iniciarEdicionItem(item: PlantillaItem) {
        setEditandoItem(item.id)
        setAddingItem(false)
        setFormI({ id: item.id, descripcion: item.descripcion, responsable_tipo: item.responsable_tipo, dias_plazo: item.dias_plazo?.toString() ?? '' })
    }

    async function eliminarItem(id: string) {
        if (!confirm('¿Eliminar este ítem?')) return
        await plantillasChecklistService.eliminarItem(id)
        if (activa) {
            const its = await plantillasChecklistService.listarItems(activa.id)
            setItems(its)
        }
    }

    async function moverItem(id: string, dir: 1 | -1) {
        const idx = items.findIndex(i => i.id === id)
        if ((dir === -1 && idx === 0) || (dir === 1 && idx === items.length - 1)) return
        const updated = [...items]
        const tmp = updated[idx].orden
        updated[idx] = { ...updated[idx], orden: updated[idx + dir].orden }
        updated[idx + dir] = { ...updated[idx + dir], orden: tmp }
        updated.sort((a, b) => a.orden - b.orden)
        setItems(updated)
        await plantillasChecklistService.reordenar(updated.map(i => ({ id: i.id, orden: i.orden })))
    }

    const plantillasFiltradas = plantillas.filter(p => filtro === 'todas' || p.tipo === filtro)

    if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Plantillas de Checklist</h1>
                    <p className="text-slate-600 mt-1">Define tareas reutilizables para onboarding y offboarding</p>
                </div>
                <div className="flex items-center gap-2">
                    <HelpButton pageKey="plantillas-checklist" />
                    <button onClick={abrirNueva} className="btn btn-primary flex items-center gap-2">
                        <Plus className="w-4 h-4" /> Nueva Plantilla
                    </button>
                </div>
            </div>

            {/* Filtro tipo */}
            <div className="flex gap-2">
                {(['todas', 'onboarding', 'offboarding'] as const).map(f => (
                    <button key={f} onClick={() => setFiltro(f)}
                        className={cn('px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                            filtro === f ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
                        {f === 'todas' ? 'Todas' : f === 'onboarding' ? '↓ Onboarding' : '↑ Offboarding'}
                    </button>
                ))}
            </div>

            <div className={cn('grid gap-4', activa ? 'grid-cols-[300px,1fr]' : 'grid-cols-1')}>

                {/* Lista de plantillas */}
                <div className="space-y-2">
                    {plantillasFiltradas.length === 0 ? (
                        <div className="card flex flex-col items-center py-16 text-slate-400">
                            <ListChecks className="w-10 h-10 opacity-40 mb-3" />
                            <p className="font-semibold">Sin plantillas</p>
                            <button onClick={abrirNueva} className="btn btn-primary mt-4 text-sm flex items-center gap-1.5">
                                <Plus className="w-3.5 h-3.5" /> Crear plantilla
                            </button>
                        </div>
                    ) : plantillasFiltradas.map(p => (
                        <div key={p.id} onClick={() => seleccionarPlantilla(p)}
                            className={cn('card p-4 cursor-pointer transition-all hover:shadow-md',
                                activa?.id === p.id && 'ring-2 ring-indigo-500')}>
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold shrink-0',
                                            p.tipo === 'onboarding' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600')}>
                                            {p.tipo === 'onboarding' ? '↓ Onboarding' : '↑ Offboarding'}
                                        </span>
                                    </div>
                                    <p className="font-semibold text-slate-900 mt-1 truncate">{p.nombre}</p>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        {(p.items_count as any) ?? 0} tareas
                                        {p.cargo?.nombre && ` · ${p.cargo.nombre}`}
                                    </p>
                                </div>
                                <div className="flex gap-1 shrink-0">
                                    <button onClick={e => { e.stopPropagation(); abrirEditar(p) }}
                                        className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors">
                                        <Edit2 className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={e => { e.stopPropagation(); desactivarPlantilla(p) }}
                                        className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors">
                                        <UserX className="w-3.5 h-3.5" />
                                    </button>
                                    <ChevronRight className="w-4 h-4 text-slate-300 mt-0.5" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Editor de ítems */}
                {activa && (
                    <div className="card overflow-hidden flex flex-col">
                        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-bold text-slate-900">{activa.nombre}</h2>
                                <p className="text-xs text-slate-500">{items.length} tareas · {activa.tipo === 'onboarding' ? 'Ingreso' : 'Salida'}</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => { setAddingItem(true); setEditandoItem(null); setFormI({ ...EMPTY_I }) }}
                                    className="btn btn-primary text-sm flex items-center gap-1.5">
                                    <Plus className="w-3.5 h-3.5" /> Agregar tarea
                                </button>
                                <button onClick={() => { setActiva(null); setItems([]) }}
                                    className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
                            {loadingItems ? (
                                <div className="flex items-center gap-2 text-slate-400 py-8 justify-center">
                                    <Loader2 className="w-4 h-4 animate-spin" />Cargando...
                                </div>
                            ) : (
                                <>
                                    {items.map((item, idx) => (
                                        <div key={item.id}>
                                            {editandoItem === item.id ? (
                                                // Edición inline
                                                <div className="border border-indigo-200 rounded-xl p-3 bg-indigo-50 space-y-3">
                                                    <input className="input w-full text-sm" value={formI.descripcion}
                                                        onChange={e => setFormI(v => ({ ...v, descripcion: e.target.value }))}
                                                        placeholder="Descripción de la tarea" autoFocus />
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Responsable</label>
                                                            <select className="input w-full text-sm" value={formI.responsable_tipo}
                                                                onChange={e => setFormI(v => ({ ...v, responsable_tipo: e.target.value as TipoResponsable }))}>
                                                                {(Object.keys(RESP_LABEL) as TipoResponsable[]).map(r => (
                                                                    <option key={r} value={r}>{RESP_LABEL[r]}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Días plazo (desde ingreso)</label>
                                                            <input type="number" min="1" className="input w-full text-sm" value={formI.dias_plazo}
                                                                onChange={e => setFormI(v => ({ ...v, dias_plazo: e.target.value }))}
                                                                placeholder="Ej: 3" />
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2 justify-end">
                                                        <button onClick={() => { setEditandoItem(null) }} className="btn btn-secondary text-xs flex items-center gap-1">
                                                            <X className="w-3 h-3" /> Cancelar
                                                        </button>
                                                        <button onClick={guardarItem} disabled={saving} className="btn btn-primary text-xs flex items-center gap-1">
                                                            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Guardar
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                // Vista normal del ítem
                                                <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 group transition-colors">
                                                    <div className="flex flex-col gap-0.5 shrink-0">
                                                        <button onClick={() => moverItem(item.id, -1)} disabled={idx === 0}
                                                            className="p-0.5 text-slate-300 hover:text-slate-500 disabled:opacity-20">
                                                            <GripVertical className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                    <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold flex items-center justify-center shrink-0">
                                                        {item.orden}
                                                    </span>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm text-slate-800">{item.descripcion}</p>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <span className={cn('px-1.5 py-0.5 rounded text-xs font-medium', RESP_COLOR[item.responsable_tipo])}>
                                                                {RESP_LABEL[item.responsable_tipo]}
                                                            </span>
                                                            {item.dias_plazo && (
                                                                <span className="text-xs text-slate-400">Día {item.dias_plazo}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => iniciarEdicionItem(item)}
                                                            className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors">
                                                            <Edit2 className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button onClick={() => eliminarItem(item.id)}
                                                            className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors">
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}

                                    {/* Formulario de agregar ítem */}
                                    {addingItem && (
                                        <div className="border-2 border-dashed border-indigo-300 rounded-xl p-3 bg-indigo-50 space-y-3">
                                            <input className="input w-full text-sm" value={formI.descripcion}
                                                onChange={e => setFormI(v => ({ ...v, descripcion: e.target.value }))}
                                                placeholder="Descripción de la nueva tarea" autoFocus
                                                onKeyDown={e => e.key === 'Enter' && guardarItem()} />
                                            <div className="grid grid-cols-2 gap-3">
                                                <div>
                                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Responsable</label>
                                                    <select className="input w-full text-sm" value={formI.responsable_tipo}
                                                        onChange={e => setFormI(v => ({ ...v, responsable_tipo: e.target.value as TipoResponsable }))}>
                                                        {(Object.keys(RESP_LABEL) as TipoResponsable[]).map(r => (
                                                            <option key={r} value={r}>{RESP_LABEL[r]}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Días plazo</label>
                                                    <input type="number" min="1" className="input w-full text-sm" value={formI.dias_plazo}
                                                        onChange={e => setFormI(v => ({ ...v, dias_plazo: e.target.value }))}
                                                        placeholder="Ej: 3" />
                                                </div>
                                            </div>
                                            <div className="flex gap-2 justify-end">
                                                <button onClick={() => setAddingItem(false)} className="btn btn-secondary text-xs flex items-center gap-1">
                                                    <X className="w-3 h-3" /> Cancelar
                                                </button>
                                                <button onClick={guardarItem} disabled={saving} className="btn btn-primary text-xs flex items-center gap-1">
                                                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Agregar
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {items.length === 0 && !addingItem && (
                                        <div className="text-center py-10 text-slate-400">
                                            <CheckSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
                                            <p className="text-sm">Sin tareas. Agrega la primera tarea a esta plantilla.</p>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Modal plantilla */}
            {modalP && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <h3 className="text-lg font-bold text-slate-900">
                                {formP.id ? 'Editar Plantilla' : 'Nueva Plantilla'}
                            </h3>
                            <button onClick={() => setModalP(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="px-6 py-5 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre de la plantilla *</label>
                                <input className="input w-full" value={formP.nombre}
                                    onChange={e => setFormP(v => ({ ...v, nombre: e.target.value }))}
                                    placeholder="Ej: Onboarding Administrativo" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {(['onboarding', 'offboarding'] as TipoChecklist[]).map(t => (
                                        <button key={t} onClick={() => setFormP(v => ({ ...v, tipo: t }))}
                                            className={cn('py-2 rounded-lg text-sm font-medium border-2 transition-colors',
                                                formP.tipo === t
                                                    ? t === 'onboarding' ? 'border-green-500 bg-green-50 text-green-700' : 'border-red-400 bg-red-50 text-red-600'
                                                    : 'border-slate-200 text-slate-500 hover:border-slate-300')}>
                                            {t === 'onboarding' ? '↓ Onboarding (Ingreso)' : '↑ Offboarding (Salida)'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Sección (opcional)</label>
                                    <select className="input w-full" value={formP.seccion_id}
                                        onChange={e => setFormP(v => ({ ...v, seccion_id: e.target.value }))}>
                                        <option value="">— Todas —</option>
                                        {secciones.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Cargo (opcional)</label>
                                    <select className="input w-full" value={formP.cargo_id}
                                        onChange={e => setFormP(v => ({ ...v, cargo_id: e.target.value }))}>
                                        <option value="">— Todos —</option>
                                        {cargos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Descripción</label>
                                <textarea className="input w-full resize-none" rows={2}
                                    value={formP.descripcion}
                                    onChange={e => setFormP(v => ({ ...v, descripcion: e.target.value }))}
                                    placeholder="¿Para qué se usa esta plantilla?" />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
                            <button onClick={() => setModalP(false)} className="btn btn-secondary flex items-center gap-2">
                                <X className="w-4 h-4" /> Cancelar
                            </button>
                            <button onClick={guardarPlantilla} disabled={saving} className="btn btn-primary flex items-center gap-2">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
