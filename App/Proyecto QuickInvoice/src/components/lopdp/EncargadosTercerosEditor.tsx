import { useState } from 'react'
import { Lock, Plus, X } from 'lucide-react'
import type { EncargadoTercero } from '../../types/lopdp'

interface Props {
    value:    EncargadoTercero[]
    onChange: (value: EncargadoTercero[]) => void
}

// El objeto con fijo=true (QuickInvoice) se muestra bloqueado — no editable
// ni eliminable desde aquí. La base de datos ya lo garantiza con un trigger
// (se reinyecta si se intenta quitar), esto es solo el reflejo en la UI.
export function EncargadosTercerosEditor({ value, onChange }: Props) {
    const [nombre, setNombre] = useState('')
    const [tipo, setTipo] = useState('')

    const fijos    = value.filter(e => e.fijo)
    const propios  = value.filter(e => !e.fijo)

    function agregar() {
        if (!nombre.trim() || !tipo.trim()) return
        onChange([...value, { nombre: nombre.trim(), tipo: tipo.trim() }])
        setNombre(''); setTipo('')
    }

    function quitar(index: number) {
        const objetivo = propios[index]
        onChange(value.filter(e => e !== objetivo))
    }

    return (
        <div className="space-y-3">
            <label className="label">Terceros / encargados de tratamiento</label>

            {fijos.map((e, i) => (
                <div key={`fijo-${i}`} className="flex items-center gap-3 bg-slate-100 rounded-xl px-4 py-2.5">
                    <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-700">{e.nombre}</p>
                        <p className="text-xs text-slate-400">{e.tipo}</p>
                    </div>
                    <span className="ml-auto text-[10px] font-bold text-slate-400 uppercase tracking-wide shrink-0">Fijo</span>
                </div>
            ))}

            {propios.map((e, i) => (
                <div key={i} className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-700">{e.nombre}</p>
                        <p className="text-xs text-slate-400">{e.tipo}</p>
                    </div>
                    <button type="button" onClick={() => quitar(i)} className="p-1 hover:bg-red-50 rounded-lg text-red-500 shrink-0">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            ))}

            <div className="grid grid-cols-2 gap-2">
                <input className="input" placeholder="Nombre (ej. Contador Externo XYZ)"
                    value={nombre} onChange={e => setNombre(e.target.value)} />
                <div className="flex gap-2">
                    <input className="input flex-1" placeholder="Rol (ej. Servicio de contabilidad)"
                        value={tipo} onChange={e => setTipo(e.target.value)} />
                    <button type="button" onClick={agregar} className="btn btn-secondary px-3">
                        <Plus className="w-4 h-4" />
                    </button>
                </div>
            </div>
            <p className="text-xs text-slate-400">
                Agrega aquí otros terceros a los que tu empresa transfiere datos (ej. tu contador externo, un courier, una aseguradora). QuickInvoice ya aparece arriba de forma fija como encargado tecnológico.
            </p>
        </div>
    )
}
