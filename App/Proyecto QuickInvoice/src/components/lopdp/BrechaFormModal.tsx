import { useState } from 'react'
import { AlertOctagon, X, Save } from 'lucide-react'
import { SEVERIDAD_BRECHA_LABELS, type BrechaSeguridad, type SeveridadBrecha } from '../../types/lopdp'

const VACIO: Partial<BrechaSeguridad> = {
    fecha_deteccion: new Date().toISOString().slice(0, 10),
    severidad: 'medio',
}

interface Props {
    brecha?: BrechaSeguridad
    onSave:  (campos: Partial<BrechaSeguridad>) => Promise<void>
    onClose: () => void
}

export function BrechaFormModal({ brecha, onSave, onClose }: Props) {
    const [form, setForm] = useState<Partial<BrechaSeguridad>>(brecha ?? VACIO)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const esEdicion = !!brecha
    const set = <K extends keyof BrechaSeguridad>(campo: K, val: BrechaSeguridad[K]) =>
        setForm(prev => ({ ...prev, [campo]: val }))

    async function handleSave() {
        setError('')
        if (!form.descripcion?.trim() || !form.fecha_deteccion) {
            setError('Descripción y fecha de detección son obligatorias.')
            return
        }
        try {
            setSaving(true)
            await onSave(form)
            onClose()
        } catch (e: any) {
            setError(e.message ?? 'Error al guardar')
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center">
                            <AlertOctagon className="w-5 h-5 text-red-600" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900">
                            {esEdicion ? 'Editar Incidente' : 'Nuevo Incidente de Seguridad'}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label">Fecha de detección <span className="text-red-500">*</span></label>
                            <input className="input" type="date" value={form.fecha_deteccion ?? ''}
                                disabled={esEdicion}
                                onChange={e => set('fecha_deteccion', e.target.value)} />
                        </div>
                        <div>
                            <label className="label">Severidad / riesgo <span className="text-red-500">*</span></label>
                            <select className="input" value={form.severidad ?? 'medio'}
                                onChange={e => set('severidad', e.target.value as SeveridadBrecha)}>
                                {Object.entries(SEVERIDAD_BRECHA_LABELS).map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="label">Descripción del incidente <span className="text-red-500">*</span></label>
                        <textarea className="input" rows={3} value={form.descripcion ?? ''}
                            onChange={e => set('descripcion', e.target.value)}
                            placeholder="¿Qué pasó, cómo se detectó, qué sistemas/datos involucra?" />
                    </div>

                    <div>
                        <label className="label">Alcance estimado (número de titulares afectados)</label>
                        <input className="input max-w-xs" type="number" min={0} value={form.alcance_titulares_estimado ?? ''}
                            onChange={e => set('alcance_titulares_estimado', e.target.value ? Number(e.target.value) : null)}
                            placeholder="Ej. 120" />
                    </div>

                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-xs text-amber-700">
                        Al guardar, el sistema calcula automáticamente: 5 días hábiles para notificar a la SPDP
                        {form.severidad === 'alto' && ', y 3 días hábiles para notificar a los titulares (por ser riesgo alto)'}.
                    </div>

                    {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
                </div>

                <div className="flex gap-3 justify-end p-6 border-t border-slate-100">
                    <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
                    <button onClick={handleSave} disabled={saving} className="btn btn-primary flex items-center gap-2">
                        {saving
                            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Guardando...</>
                            : <><Save className="w-4 h-4" /> Guardar</>}
                    </button>
                </div>
            </div>
        </div>
    )
}
