import { useState } from 'react'
import { UserCog, X, Save } from 'lucide-react'
import {
    TIPO_SOLICITUD_LABELS, TIPO_SOLICITUD_DESCRIPCION,
    type SolicitudTitular, type TipoSolicitud,
} from '../../types/lopdp'

const VACIO: Partial<SolicitudTitular> = {
    tipo_solicitud: 'acceso',
    fecha_recepcion: new Date().toISOString().slice(0, 10),
}

interface Props {
    solicitud?: SolicitudTitular
    onSave:     (campos: Partial<SolicitudTitular>) => Promise<void>
    onClose:    () => void
}

export function SolicitudFormModal({ solicitud, onSave, onClose }: Props) {
    const [form, setForm] = useState<Partial<SolicitudTitular>>(solicitud ?? VACIO)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')

    const set = <K extends keyof SolicitudTitular>(campo: K, val: SolicitudTitular[K]) =>
        setForm(prev => ({ ...prev, [campo]: val }))

    async function handleSave() {
        setError('')
        if (!form.nombre_titular?.trim() || !form.descripcion?.trim() || !form.fecha_recepcion) {
            setError('Nombre del titular, descripción y fecha de recepción son obligatorios.')
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

    const esEdicion = !!solicitud

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center">
                            <UserCog className="w-5 h-5 text-emerald-600" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900">
                            {esEdicion ? 'Editar Solicitud' : 'Nueva Solicitud ARCO-POL'}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    <div>
                        <label className="label">Tipo de solicitud <span className="text-red-500">*</span></label>
                        <select className="input" value={form.tipo_solicitud ?? 'acceso'}
                            disabled={esEdicion}
                            onChange={e => set('tipo_solicitud', e.target.value as TipoSolicitud)}>
                            {Object.entries(TIPO_SOLICITUD_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                            ))}
                        </select>
                        <p className="text-xs text-slate-400 mt-1.5">
                            {TIPO_SOLICITUD_DESCRIPCION[(form.tipo_solicitud ?? 'acceso') as TipoSolicitud]}
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label">Nombre del titular <span className="text-red-500">*</span></label>
                            <input className="input" value={form.nombre_titular ?? ''}
                                onChange={e => set('nombre_titular', e.target.value)}
                                placeholder="Nombre completo de quien solicita" />
                        </div>
                        <div>
                            <label className="label">Identificación (cédula/RUC)</label>
                            <input className="input" value={form.identificacion_titular ?? ''}
                                onChange={e => set('identificacion_titular', e.target.value)}
                                placeholder="Opcional — mejora la búsqueda para portabilidad" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label">Email de contacto</label>
                            <input className="input" type="email" value={form.email_titular ?? ''}
                                onChange={e => set('email_titular', e.target.value)}
                                placeholder="correo@titular.com" />
                        </div>
                        <div>
                            <label className="label">Teléfono</label>
                            <input className="input" value={form.telefono_titular ?? ''}
                                onChange={e => set('telefono_titular', e.target.value)}
                                placeholder="0999999999" />
                        </div>
                    </div>

                    <div>
                        <label className="label">Descripción de la solicitud <span className="text-red-500">*</span></label>
                        <textarea className="input" rows={3} value={form.descripcion ?? ''}
                            onChange={e => set('descripcion', e.target.value)}
                            placeholder="¿Qué pide exactamente el titular? Cítalo con tus propias palabras — esto queda como respaldo de lo recibido." />
                    </div>

                    <div>
                        <label className="label">Fecha de recepción <span className="text-red-500">*</span></label>
                        <input className="input max-w-xs" type="date" value={form.fecha_recepcion ?? ''}
                            disabled={esEdicion}
                            onChange={e => set('fecha_recepcion', e.target.value)} />
                        <p className="text-xs text-slate-400 mt-1.5">
                            El plazo de 15 días hábiles (y la posible prórroga de 10 más) se calcula automáticamente desde esta fecha, usando el calendario oficial de feriados de Ecuador.
                        </p>
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
