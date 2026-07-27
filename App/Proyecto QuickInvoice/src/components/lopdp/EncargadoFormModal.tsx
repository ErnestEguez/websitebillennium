import { useState } from 'react'
import { Building2, X, Save } from 'lucide-react'
import type { EncargadoTratamiento } from '../../types/lopdp'

const VACIO: Partial<EncargadoTratamiento> = {
    tiene_contrato_dpa: false,
    destruccion_confirmada: false,
}

interface Props {
    encargado?: EncargadoTratamiento
    onSave:     (campos: Partial<EncargadoTratamiento>) => Promise<void>
    onClose:    () => void
}

export function EncargadoFormModal({ encargado, onSave, onClose }: Props) {
    const [form, setForm] = useState<Partial<EncargadoTratamiento>>(encargado ?? VACIO)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const set = <K extends keyof EncargadoTratamiento>(campo: K, val: EncargadoTratamiento[K]) =>
        setForm(prev => ({ ...prev, [campo]: val }))

    async function handleSave() {
        setError('')
        if (!form.nombre?.trim() || !form.tipo_servicio?.trim()) {
            setError('Nombre y tipo de servicio son obligatorios.')
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
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
                            <Building2 className="w-5 h-5 text-emerald-600" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900">
                            {encargado ? 'Editar Encargado' : 'Nuevo Encargado de Tratamiento'}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    <div>
                        <label className="label">Nombre <span className="text-red-500">*</span></label>
                        <input className="input" value={form.nombre ?? ''}
                            onChange={e => set('nombre', e.target.value)}
                            placeholder="Ej. Contador Externo XYZ" />
                    </div>

                    <div>
                        <label className="label">Tipo de servicio <span className="text-red-500">*</span></label>
                        <input className="input" value={form.tipo_servicio ?? ''}
                            onChange={e => set('tipo_servicio', e.target.value)}
                            placeholder="Ej. Servicio de contabilidad externa" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <label className="flex items-center gap-3 cursor-pointer pt-6">
                            <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-primary-600"
                                checked={!!form.tiene_contrato_dpa}
                                onChange={e => set('tiene_contrato_dpa', e.target.checked)} />
                            <span className="text-sm text-slate-700">Tiene contrato/DPA vigente</span>
                        </label>
                        <div>
                            <label className="label">Fecha de vigencia</label>
                            <input className="input" type="date" value={form.fecha_vigencia ?? ''}
                                onChange={e => set('fecha_vigencia', e.target.value)} />
                        </div>
                    </div>
                    <p className="text-xs text-slate-400 -mt-2">
                        Sin fecha registrada también genera alerta en el listado — no se asume que "sin fecha" significa "sin vencimiento".
                    </p>

                    <div className="pt-2 border-t border-slate-100">
                        <label className="label">Destrucción/devolución de datos al finalizar el encargo</label>
                        <textarea className="input" rows={2} value={form.nota_destruccion ?? ''}
                            onChange={e => set('nota_destruccion', e.target.value)}
                            placeholder="Nota: qué se acordó hacer con los datos al terminar la relación (recordatorio: 5 días de plazo)" />
                        <label className="flex items-center gap-3 cursor-pointer mt-2">
                            <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-primary-600"
                                checked={!!form.destruccion_confirmada}
                                onChange={e => set('destruccion_confirmada', e.target.checked)} />
                            <span className="text-sm text-slate-700">Destrucción/devolución ya confirmada (solo si el encargo ya finalizó)</span>
                        </label>
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
