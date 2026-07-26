import { useState } from 'react'
import { ShieldCheck, X, Save } from 'lucide-react'
import { MultiSelectChips } from './MultiSelectChips'
import {
    BASE_LEGAL_LABELS, CATEGORIAS_DATOS_SUGERIDAS, CATEGORIAS_TITULARES_SUGERIDAS,
    type ActividadTratamiento, type BaseLegal,
} from '../../types/lopdp'

const VACIO: Partial<ActividadTratamiento> = {
    categorias_datos: [],
    categoria_titulares: [],
    base_legal: 'consentimiento',
    hay_transferencia_terceros: false,
    transferencia_internacional: false,
}

interface Props {
    actividad?: ActividadTratamiento
    onSave:     (campos: Partial<ActividadTratamiento>) => Promise<void>
    onClose:    () => void
}

export function RatFormModal({ actividad, onSave, onClose }: Props) {
    const [form, setForm] = useState<Partial<ActividadTratamiento>>(actividad ?? VACIO)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const set = <K extends keyof ActividadTratamiento>(campo: K, val: ActividadTratamiento[K]) =>
        setForm(prev => ({ ...prev, [campo]: val }))

    async function handleSave() {
        setError('')
        if (!form.nombre?.trim() || !form.finalidad?.trim() || !form.plazo_retencion?.trim()) {
            setError('Nombre, finalidad y plazo de retención son obligatorios.')
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

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
                            <ShieldCheck className="w-5 h-5 text-emerald-600" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900">
                            {actividad ? 'Editar Actividad de Tratamiento' : 'Nueva Actividad de Tratamiento'}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    <div>
                        <label className="label">Nombre de la actividad <span className="text-red-500">*</span></label>
                        <input className="input" value={form.nombre ?? ''}
                            onChange={e => set('nombre', e.target.value)}
                            placeholder="Ej. Gestión de nómina de empleados" />
                    </div>

                    <div>
                        <label className="label">Finalidad <span className="text-red-500">*</span></label>
                        <textarea className="input" rows={2} value={form.finalidad ?? ''}
                            onChange={e => set('finalidad', e.target.value)}
                            placeholder="¿Para qué se usan estos datos?" />
                    </div>

                    <MultiSelectChips
                        label="Categorías de datos tratados"
                        value={form.categorias_datos ?? []}
                        onChange={v => set('categorias_datos', v)}
                        sugerencias={CATEGORIAS_DATOS_SUGERIDAS}
                    />

                    <MultiSelectChips
                        label="Categorías de titulares"
                        value={form.categoria_titulares ?? []}
                        onChange={v => set('categoria_titulares', v)}
                        sugerencias={CATEGORIAS_TITULARES_SUGERIDAS}
                    />

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label">Base legal (Art. 7 LOPDP) <span className="text-red-500">*</span></label>
                            <select className="input" value={form.base_legal ?? 'consentimiento'}
                                onChange={e => set('base_legal', e.target.value as BaseLegal)}>
                                {Object.entries(BASE_LEGAL_LABELS).map(([k, v]) => (
                                    <option key={k} value={k}>{v}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="label">Plazo de retención <span className="text-red-500">*</span></label>
                            <input className="input" value={form.plazo_retencion ?? ''}
                                onChange={e => set('plazo_retencion', e.target.value)}
                                placeholder="Ej. 5 años tras fin de relación" />
                        </div>
                    </div>

                    <div>
                        <label className="label">Detalle de la base legal (opcional)</label>
                        <input className="input" value={form.base_legal_detalle ?? ''}
                            onChange={e => set('base_legal_detalle', e.target.value)}
                            placeholder="Ej. Cláusula 5 del contrato laboral" />
                    </div>

                    <div className="space-y-3 pt-2 border-t border-slate-100">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-primary-600"
                                checked={!!form.hay_transferencia_terceros}
                                onChange={e => set('hay_transferencia_terceros', e.target.checked)} />
                            <span className="text-sm font-medium text-slate-700">¿Hay transferencia a terceros/encargados?</span>
                        </label>
                        {form.hay_transferencia_terceros && (
                            <input className="input" value={form.terceros_detalle ?? ''}
                                onChange={e => set('terceros_detalle', e.target.value)}
                                placeholder="¿A quién se transfiere y con qué propósito?" />
                        )}

                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-primary-600"
                                checked={!!form.transferencia_internacional}
                                onChange={e => set('transferencia_internacional', e.target.checked)} />
                            <span className="text-sm font-medium text-slate-700">¿Hay transferencia internacional?</span>
                        </label>
                        {form.transferencia_internacional && (
                            <input className="input" value={form.pais_transferencia ?? ''}
                                onChange={e => set('pais_transferencia', e.target.value)}
                                placeholder="País de destino" />
                        )}
                    </div>

                    <div>
                        <label className="label">Medidas de seguridad (opcional)</label>
                        <textarea className="input" rows={2} value={form.medidas_seguridad ?? ''}
                            onChange={e => set('medidas_seguridad', e.target.value)}
                            placeholder="Descripción general de medidas técnicas/organizativas" />
                    </div>

                    {error && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
                </div>

                {/* Footer */}
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
