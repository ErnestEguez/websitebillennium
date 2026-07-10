import { useState, useEffect } from 'react'
import { HelpButton } from '../../components/help/HelpButton'
import { useAuth } from '../../contexts/AuthContext'
import { climaService } from '../../services/nominas/climaService'
import { empleadosService } from '../../services/nominas/empleadosService'
import type { EncuestaClima, RespuestaClima, PromediosClima } from '../../types/nominas'
import type { Empleado } from '../../types/nominas'
import { Smile, Plus, X, Save, Loader2, ChevronRight, Trash2, LockKeyhole, BarChart2 } from 'lucide-react'
import { cn } from '../../lib/utils'

const DIM_LABELS: { key: keyof PromediosClima; label: string; color: string }[] = [
    { key: 'satisfaccion_general', label: 'Satisfacción general',   color: 'bg-indigo-500' },
    { key: 'ambiente_trabajo',     label: 'Ambiente de trabajo',    color: 'bg-blue-500'   },
    { key: 'liderazgo',            label: 'Liderazgo',              color: 'bg-violet-500' },
    { key: 'crecimiento',          label: 'Crecimiento / Carrera',  color: 'bg-emerald-500'},
    { key: 'comunicacion',         label: 'Comunicación interna',   color: 'bg-amber-500'  },
]

function scoreColor(v: number) {
    if (v >= 4)   return 'text-emerald-600'
    if (v >= 3)   return 'text-blue-600'
    if (v >= 2)   return 'text-amber-600'
    return 'text-red-600'
}

type FormEncuesta = { id?: string; nombre: string; descripcion: string; fecha: string }
type FormResp     = { empleado_id: string; anonima: boolean; satisfaccion_general: number; ambiente_trabajo: number; liderazgo: number; crecimiento: number; comunicacion: number; comentarios: string }

const hoy = new Date().toISOString().slice(0, 10)
const EMPTY_R: FormResp = { empleado_id: '', anonima: false, satisfaccion_general: 3, ambiente_trabajo: 3, liderazgo: 3, crecimiento: 3, comunicacion: 3, comentarios: '' }

function ScoreButtons({ value, onChange }: { value: number; onChange: (v: number) => void }) {
    const labels = ['', 'Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente']
    return (
        <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(n => (
                <button key={n} type="button" onClick={() => onChange(n)} title={labels[n]}
                    className={cn('w-9 h-9 rounded-lg text-sm font-bold transition-colors',
                        value === n ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-indigo-100')}>
                    {n}
                </button>
            ))}
        </div>
    )
}

export function ClimaPage() {
    const { empresa } = useAuth() as any
    const [encuestas, setEncuestas] = useState<EncuestaClima[]>([])
    const [activa, setActiva]       = useState<EncuestaClima | null>(null)
    const [respuestas, setResps]    = useState<RespuestaClima[]>([])
    const [promedios, setProms]     = useState<PromediosClima | null>(null)
    const [empleados, setEmpleados] = useState<Empleado[]>([])
    const [loading, setLoading]     = useState(true)
    const [loadingR, setLoadingR]   = useState(false)
    const [saving, setSaving]       = useState(false)

    const [modalE, setModalE] = useState(false)
    const [formE, setFormE]   = useState<FormEncuesta>({ nombre: '', descripcion: '', fecha: hoy })
    const [modalR, setModalR] = useState(false)
    const [formR, setFormR]   = useState<FormResp>({ ...EMPTY_R })

    useEffect(() => { if (empresa?.id) init() }, [empresa?.id])

    async function init() {
        setLoading(true)
        try {
            const [encs, emps] = await Promise.all([
                climaService.listarEncuestas(empresa!.id),
                empleadosService.listarEmpleados(empresa!.id),
            ])
            setEncuestas(encs)
            setEmpleados(emps)
        } catch (e) { console.error(e) }
        finally { setLoading(false) }
    }

    async function seleccionarEncuesta(enc: EncuestaClima) {
        setActiva(enc)
        setLoadingR(true)
        try {
            const rs = await climaService.listarRespuestas(enc.id)
            setResps(rs)
            setProms(climaService.calcularPromedios(rs))
        } catch (e) { console.error(e) }
        finally { setLoadingR(false) }
    }

    // ── Encuestas ─────────────────────────────────────────────────────────────

    async function guardarEncuesta() {
        if (!formE.nombre.trim()) { alert('El nombre es obligatorio'); return }
        setSaving(true)
        try {
            const payload = { empresa_id: empresa!.id, nombre: formE.nombre.trim(), descripcion: formE.descripcion || null, fecha: formE.fecha, estado: 'activa' as const }
            if (formE.id) await climaService.actualizarEncuesta(formE.id, payload)
            else          await climaService.crearEncuesta(payload)
            setModalE(false)
            await init()
        } catch (e: any) { alert(`Error: ${e.message}`) }
        finally { setSaving(false) }
    }

    async function cerrarEncuesta(enc: EncuestaClima) {
        if (!confirm(`¿Cerrar la encuesta "${enc.nombre}"?`)) return
        await climaService.cerrarEncuesta(enc.id)
        if (activa?.id === enc.id) setActiva(prev => prev ? { ...prev, estado: 'cerrada' } : null)
        setEncuestas(prev => prev.map(e => e.id === enc.id ? { ...e, estado: 'cerrada' } : e))
    }

    // ── Respuestas ────────────────────────────────────────────────────────────

    async function guardarRespuesta() {
        if (!activa) return
        if (!formR.anonima && !formR.empleado_id) { alert('Selecciona un empleado o marca como anónima'); return }
        setSaving(true)
        try {
            await climaService.crearRespuesta({
                empresa_id: empresa!.id,
                encuesta_id: activa.id,
                empleado_id: formR.anonima ? null : formR.empleado_id || null,
                satisfaccion_general: formR.satisfaccion_general,
                ambiente_trabajo:     formR.ambiente_trabajo,
                liderazgo:            formR.liderazgo,
                crecimiento:          formR.crecimiento,
                comunicacion:         formR.comunicacion,
                comentarios: formR.comentarios || null,
                anonima: formR.anonima,
            })
            setModalR(false)
            const rs = await climaService.listarRespuestas(activa.id)
            setResps(rs)
            setProms(climaService.calcularPromedios(rs))
        } catch (e: any) { alert(`Error: ${e.message}`) }
        finally { setSaving(false) }
    }

    async function eliminarResp(id: string) {
        if (!confirm('¿Eliminar esta respuesta?')) return
        await climaService.eliminarRespuesta(id)
        const rs = respuestas.filter(r => r.id !== id)
        setResps(rs)
        setProms(climaService.calcularPromedios(rs))
    }

    if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Clima Organizacional</h1>
                    <p className="text-slate-600 mt-1">Encuestas de satisfacción y métricas de retención</p>
                </div>
                <div className="flex items-center gap-2">
                    <HelpButton pageKey="clima" />
                    <button onClick={() => { setFormE({ nombre: '', descripcion: '', fecha: hoy }); setModalE(true) }}
                        className="btn btn-primary flex items-center gap-2">
                        <Plus className="w-4 h-4" /> Nueva Encuesta
                    </button>
                </div>
            </div>

            <div className={cn('grid gap-4', activa ? 'grid-cols-[300px,1fr]' : 'grid-cols-1')}>

                {/* Lista de encuestas */}
                <div className="space-y-2">
                    {encuestas.length === 0 ? (
                        <div className="card flex flex-col items-center py-16 text-slate-400">
                            <Smile className="w-10 h-10 opacity-40 mb-3" />
                            <p className="font-semibold">Sin encuestas</p>
                            <button onClick={() => { setFormE({ nombre: '', descripcion: '', fecha: hoy }); setModalE(true) }}
                                className="btn btn-primary mt-4 text-sm flex items-center gap-1.5">
                                <Plus className="w-3.5 h-3.5" /> Crear encuesta
                            </button>
                        </div>
                    ) : encuestas.map(enc => (
                        <div key={enc.id} onClick={() => seleccionarEncuesta(enc)}
                            className={cn('card p-4 cursor-pointer transition-all hover:shadow-md', activa?.id === enc.id && 'ring-2 ring-indigo-500')}>
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold',
                                            enc.estado === 'activa' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500')}>
                                            {enc.estado === 'activa' ? 'Activa' : 'Cerrada'}
                                        </span>
                                    </div>
                                    <p className="font-semibold text-slate-900 truncate">{enc.nombre}</p>
                                    <p className="text-xs text-slate-400 mt-0.5">{enc.fecha} · {enc.respuestas_count ?? 0} respuestas</p>
                                </div>
                                <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                                    {enc.estado === 'activa' && (
                                        <button onClick={() => cerrarEncuesta(enc)} className="p-1 text-slate-300 hover:text-amber-500 rounded transition-colors" title="Cerrar encuesta">
                                            <LockKeyhole className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                    <ChevronRight className="w-4 h-4 text-slate-300 mt-0.5" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Panel de resultados */}
                {activa && (
                    <div className="card overflow-hidden flex flex-col">
                        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-bold text-slate-900">{activa.nombre}</h2>
                                <p className="text-xs text-slate-500">{respuestas.length} respuestas · {activa.fecha}</p>
                            </div>
                            <div className="flex gap-2">
                                {activa.estado === 'activa' && (
                                    <button onClick={() => { setFormR({ ...EMPTY_R }); setModalR(true) }}
                                        className="btn btn-primary text-sm flex items-center gap-1.5">
                                        <Plus className="w-3.5 h-3.5" /> Agregar respuesta
                                    </button>
                                )}
                                <button onClick={() => { setActiva(null); setResps([]); setProms(null) }}
                                    className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
                            {loadingR ? (
                                <div className="flex items-center justify-center py-10 text-slate-400">
                                    <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando...
                                </div>
                            ) : (
                                <>
                                    {/* Promedios por dimensión */}
                                    {promedios && (
                                        <div>
                                            <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                                                <BarChart2 className="w-4 h-4 text-indigo-500" /> Resultados por dimensión
                                            </h3>
                                            <div className="space-y-3">
                                                {DIM_LABELS.filter(d => d.key !== 'total_respuestas').map(dim => {
                                                    const val = promedios[dim.key] as number
                                                    const pct = (val / 5) * 100
                                                    return (
                                                        <div key={dim.key}>
                                                            <div className="flex justify-between text-xs mb-1">
                                                                <span className="text-slate-600">{dim.label}</span>
                                                                <span className={cn('font-bold', scoreColor(val))}>{val.toFixed(1)} / 5</span>
                                                            </div>
                                                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                                <div className={cn('h-full rounded-full transition-all', dim.color)} style={{ width: `${pct}%` }} />
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {/* Lista de respuestas */}
                                    {respuestas.length === 0 ? (
                                        <div className="text-center py-8 text-slate-400">
                                            <Smile className="w-8 h-8 mx-auto mb-2 opacity-40" />
                                            <p className="text-sm">Sin respuestas aún.</p>
                                        </div>
                                    ) : (
                                        <div>
                                            <h3 className="text-sm font-bold text-slate-700 mb-2">Respuestas individuales</h3>
                                            <div className="space-y-2">
                                                {respuestas.map(r => (
                                                    <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-200 bg-slate-50">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-medium text-slate-700">
                                                                {r.anonima ? 'Anónimo' : r.empleado ? `${r.empleado.nombres} ${r.empleado.apellidos}` : '—'}
                                                            </p>
                                                            <div className="flex gap-3 mt-1 flex-wrap">
                                                                {DIM_LABELS.filter(d => d.key !== 'total_respuestas').map(dim => {
                                                                    const val = r[dim.key as keyof RespuestaClima] as number | null
                                                                    if (val == null) return null
                                                                    return (
                                                                        <span key={dim.key} className="text-xs text-slate-500">
                                                                            {dim.label.split(' ')[0]}: <span className={cn('font-bold', scoreColor(val))}>{val}</span>
                                                                        </span>
                                                                    )
                                                                })}
                                                            </div>
                                                            {r.comentarios && <p className="text-xs text-slate-400 mt-1 italic">"{r.comentarios}"</p>}
                                                        </div>
                                                        <button onClick={() => eliminarResp(r.id)} className="p-1 text-slate-300 hover:text-red-400 rounded shrink-0">
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Modal encuesta */}
            {modalE && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <h3 className="text-lg font-bold text-slate-900">Nueva Encuesta</h3>
                            <button onClick={() => setModalE(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="px-6 py-5 space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre *</label>
                                <input className="input w-full" value={formE.nombre} onChange={e => setFormE(v => ({ ...v, nombre: e.target.value }))} placeholder="Ej: Encuesta de Clima Q2 2026" />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha</label>
                                <input type="date" className="input w-full" value={formE.fecha} onChange={e => setFormE(v => ({ ...v, fecha: e.target.value }))} />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Descripción</label>
                                <textarea className="input w-full resize-none" rows={2} value={formE.descripcion} onChange={e => setFormE(v => ({ ...v, descripcion: e.target.value }))} placeholder="Contexto de la encuesta..." />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
                            <button onClick={() => setModalE(false)} className="btn btn-secondary flex items-center gap-2"><X className="w-4 h-4" /> Cancelar</button>
                            <button onClick={guardarEncuesta} disabled={saving} className="btn btn-primary flex items-center gap-2">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Crear
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal respuesta */}
            {modalR && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <h3 className="text-lg font-bold text-slate-900">Agregar Respuesta</h3>
                            <button onClick={() => setModalR(false)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="px-6 py-5 space-y-4">
                            <div className="flex items-center gap-3">
                                <input type="checkbox" id="anon" checked={formR.anonima} onChange={e => setFormR(v => ({ ...v, anonima: e.target.checked }))} className="w-4 h-4 accent-indigo-600" />
                                <label htmlFor="anon" className="text-sm font-medium text-slate-700">Respuesta anónima</label>
                            </div>
                            {!formR.anonima && (
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Empleado</label>
                                    <select className="input w-full" value={formR.empleado_id} onChange={e => setFormR(v => ({ ...v, empleado_id: e.target.value }))}>
                                        <option value="">— Seleccionar —</option>
                                        {empleados.map(e => <option key={e.id} value={e.id}>{e.apellidos}, {e.nombres}</option>)}
                                    </select>
                                </div>
                            )}
                            <div className="space-y-3">
                                {DIM_LABELS.filter(d => d.key !== 'total_respuestas').map(dim => (
                                    <div key={dim.key} className="flex items-center justify-between gap-3">
                                        <label className="text-sm text-slate-700 min-w-0 flex-1">{dim.label}</label>
                                        <ScoreButtons value={formR[dim.key as keyof FormResp] as number} onChange={v => setFormR(prev => ({ ...prev, [dim.key]: v }))} />
                                    </div>
                                ))}
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Comentarios libres</label>
                                <textarea className="input w-full resize-none" rows={2} value={formR.comentarios} onChange={e => setFormR(v => ({ ...v, comentarios: e.target.value }))} placeholder="¿Qué mejorarías?..." />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
                            <button onClick={() => setModalR(false)} className="btn btn-secondary flex items-center gap-2"><X className="w-4 h-4" /> Cancelar</button>
                            <button onClick={guardarRespuesta} disabled={saving} className="btn btn-primary flex items-center gap-2">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smile className="w-4 h-4" />} Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
