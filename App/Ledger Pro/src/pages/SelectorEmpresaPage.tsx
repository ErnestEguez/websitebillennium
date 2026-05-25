import { useNavigate } from 'react-router-dom'
import { Building2, ArrowRight, LogOut, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import type { LpEmpresa } from '../types/conta'

export function SelectorEmpresaPage() {
    const { empresas, empresaActiva, setEmpresaActiva, user, signOut } = useAuth()
    const navigate = useNavigate()

    function seleccionar(empresa: LpEmpresa) {
        setEmpresaActiva(empresa)
        navigate('/dashboard', { replace: true })
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
            {/* Header */}
            <div className="mb-8 text-center">
                <div className="w-12 h-12 bg-primary-600 rounded-xl flex items-center justify-center text-white font-bold text-lg mx-auto mb-4">
                    LP
                </div>
                <h1 className="text-2xl font-bold text-slate-900">Ledger Pro</h1>
                <p className="text-slate-500 mt-1">Selecciona la empresa con la que vas a trabajar</p>
                {user?.email && (
                    <p className="text-xs text-slate-400 mt-2">
                        Sesión: <span className="font-medium">{user.email}</span>
                    </p>
                )}
            </div>

            {/* Grilla de empresas */}
            <div className="w-full max-w-2xl grid sm:grid-cols-2 gap-4">
                {empresas.map(empresa => {
                    const esActiva = empresa.id === empresaActiva?.id
                    return (
                        <button
                            key={empresa.id}
                            onClick={() => seleccionar(empresa)}
                            className={`bg-white border rounded-xl p-5 text-left hover:shadow-md transition-all group
                                ${esActiva
                                    ? 'border-primary-400 ring-2 ring-primary-100'
                                    : 'border-slate-200 hover:border-primary-300'
                                }`}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0
                                    ${esActiva ? 'bg-primary-100' : 'bg-slate-100 group-hover:bg-primary-50'}`}>
                                    <Building2 className={`w-5 h-5 ${esActiva ? 'text-primary-600' : 'text-slate-500 group-hover:text-primary-500'}`} />
                                </div>
                                <ArrowRight className={`w-4 h-4 mt-0.5 shrink-0 transition-colors
                                    ${esActiva ? 'text-primary-500' : 'text-slate-300 group-hover:text-primary-400'}`} />
                            </div>

                            <div className="mt-3">
                                <div className="flex items-center gap-2">
                                    <p className="font-semibold text-slate-900 leading-tight">{empresa.nombre}</p>
                                    {esActiva && (
                                        <span className="text-xs bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded font-medium shrink-0">
                                            activa
                                        </span>
                                    )}
                                </div>
                                {empresa.razon_social && empresa.razon_social !== empresa.nombre && (
                                    <p className="text-sm text-slate-500 mt-0.5 leading-tight">{empresa.razon_social}</p>
                                )}
                                {empresa.ruc && (
                                    <p className="text-xs text-slate-400 font-mono mt-1.5">RUC: {empresa.ruc}</p>
                                )}
                            </div>
                        </button>
                    )
                })}
            </div>

            {/* Botones de acción */}
            <div className="mt-8 flex flex-col items-center gap-3">
                {/* Cancelar: solo si ya hay una empresa activa (cambio, no primera selección) */}
                {empresaActiva && (
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors"
                    >
                        <X className="w-4 h-4" />
                        Cancelar
                    </button>
                )}
                <button
                    onClick={signOut}
                    className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-600 transition-colors"
                >
                    <LogOut className="w-4 h-4" />
                    Cerrar sesión
                </button>
            </div>
        </div>
    )
}
