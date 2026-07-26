import { useState } from 'react'
import { X, Plus } from 'lucide-react'

interface Props {
    label:        string
    value:        string[]
    onChange:     (value: string[]) => void
    sugerencias?: string[]
    placeholder?: string
}

// Componente genérico reutilizable para editar columnas TEXT[] (no existía
// ninguno equivalente en el repo). Combina chips de sugerencias rápidas con
// un input libre para agregar valores no listados.
export function MultiSelectChips({ label, value, onChange, sugerencias = [], placeholder }: Props) {
    const [texto, setTexto] = useState('')

    function agregar(v: string) {
        const limpio = v.trim()
        if (!limpio || value.includes(limpio)) return
        onChange([...value, limpio])
        setTexto('')
    }

    function quitar(v: string) {
        onChange(value.filter(item => item !== v))
    }

    const disponibles = sugerencias.filter(s => !value.includes(s))

    return (
        <div>
            <label className="label">{label}</label>

            {value.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                    {value.map(v => (
                        <span key={v} className="inline-flex items-center gap-1 bg-primary-50 text-primary-700 text-xs font-medium px-2.5 py-1 rounded-full">
                            {v}
                            <button type="button" onClick={() => quitar(v)} className="hover:text-primary-900">
                                <X className="w-3 h-3" />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            <div className="flex gap-2">
                <input
                    className="input flex-1"
                    value={texto}
                    placeholder={placeholder ?? 'Escribir y presionar Enter...'}
                    onChange={e => setTexto(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregar(texto) } }}
                />
                <button type="button" onClick={() => agregar(texto)} className="btn btn-secondary px-3">
                    <Plus className="w-4 h-4" />
                </button>
            </div>

            {disponibles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                    {disponibles.map(s => (
                        <button key={s} type="button" onClick={() => agregar(s)}
                            className="text-xs text-slate-500 bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-full transition-colors">
                            + {s}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
