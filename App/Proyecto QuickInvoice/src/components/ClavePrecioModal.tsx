import { useState } from 'react'
import { Lock, X } from 'lucide-react'

interface ClavePrecioModalProps {
    onCorrecta: () => void
    onCancelar: () => void
    claveEsperada: string
}

export function ClavePrecioModal({ onCorrecta, onCancelar, claveEsperada }: ClavePrecioModalProps) {
    const [clave, setClave] = useState('')
    const [error, setError] = useState(false)

    function intentar() {
        if (clave === (claveEsperada || '')) {
            onCorrecta()
        } else {
            setError(true)
            setClave('')
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" onClick={onCancelar}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b">
                    <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Lock className="w-4 h-4 text-amber-500" /> Cambio de precio protegido
                    </h2>
                    <button onClick={onCancelar} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                </div>
                <div className="p-5 space-y-3">
                    <p className="text-xs text-slate-500">Digita la contraseña para desbloquear esta línea.</p>
                    <input
                        type="password"
                        autoFocus
                        value={clave}
                        onChange={e => { setClave(e.target.value); setError(false) }}
                        onKeyDown={e => e.key === 'Enter' && intentar()}
                        placeholder="••••"
                        className={`input w-full text-center tracking-widest ${error ? 'border-red-400 focus:ring-red-300' : ''}`}
                    />
                    {error && <p className="text-xs text-red-600 font-medium">Contraseña incorrecta.</p>}
                </div>
                <div className="flex gap-3 px-5 py-4 border-t bg-slate-50 rounded-b-2xl">
                    <button onClick={onCancelar} className="flex-1 py-2 text-sm font-bold border border-slate-200 bg-white rounded-xl hover:bg-slate-50 text-slate-600">
                        Cancelar
                    </button>
                    <button onClick={intentar} className="flex-1 py-2 text-sm font-bold bg-primary-600 text-white rounded-xl hover:bg-primary-700">
                        Desbloquear
                    </button>
                </div>
            </div>
        </div>
    )
}
