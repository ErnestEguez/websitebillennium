import React from 'react'
import { Building2, LogOut } from 'lucide-react'

export interface EmpresaOption {
    id: string
    nombre: string
    ruc: string
    logo_url?: string | null
    rol: string
}

interface Props {
    empresas: EmpresaOption[]
    onSelect: (empresaId: string) => Promise<void>
    onSignOut: () => Promise<void>
    userName?: string
}

export function EmpresaSelectorScreen({ empresas, onSelect, onSignOut, userName }: Props) {
    const [selecting, setSelecting] = React.useState<string | null>(null)

    const handleSelect = async (id: string) => {
        setSelecting(id)
        await onSelect(id)
        setSelecting(null)
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
            <div className="w-full max-w-lg">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Building2 className="w-8 h-8 text-primary-600" />
                    </div>
                    <h1 className="text-2xl font-bold text-slate-900">Selecciona una empresa</h1>
                    {userName && (
                        <p className="text-slate-500 mt-1">Bienvenido, <span className="font-semibold">{userName}</span></p>
                    )}
                </div>

                <div className="space-y-3">
                    {empresas.map(emp => (
                        <button
                            key={emp.id}
                            onClick={() => handleSelect(emp.id)}
                            disabled={!!selecting}
                            className="w-full bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 hover:border-primary-400 hover:shadow-md transition-all text-left disabled:opacity-60"
                        >
                            {emp.logo_url ? (
                                <img src={emp.logo_url} alt={emp.nombre} className="w-12 h-12 object-contain rounded-lg shrink-0" />
                            ) : (
                                <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center text-primary-700 font-bold text-xl shrink-0">
                                    {emp.nombre[0]}
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-slate-900 truncate">{emp.nombre}</p>
                                <p className="text-sm text-slate-500">RUC: {emp.ruc}</p>
                            </div>
                            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full shrink-0 capitalize">
                                {emp.rol}
                            </span>
                            {selecting === emp.id && (
                                <div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin shrink-0" />
                            )}
                        </button>
                    ))}
                </div>

                <div className="mt-8 text-center">
                    <button
                        onClick={onSignOut}
                        className="text-sm text-slate-400 hover:text-red-600 flex items-center gap-1.5 mx-auto transition-colors"
                    >
                        <LogOut className="w-4 h-4" />
                        Cerrar sesión
                    </button>
                </div>
            </div>
        </div>
    )
}
