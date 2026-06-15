import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Users, Wallet, Save, Loader2, Check, AlertCircle, ArrowRight, Building2, Settings } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export function TalentoNominasConfigTab() {
    const { empresa, refreshEmpresa } = useAuth()
    const [activo, setActivo] = useState(false)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        setActivo(!!empresa?.usar_talento_humano)
        setLoading(false)
    }, [empresa?.usar_talento_humano])

    async function handleSave() {
        if (!empresa?.id) return
        setSaving(true)
        setSaved(false)
        setError('')
        try {
            const { error: err } = await supabase
                .from('empresas')
                .update({ usar_talento_humano: activo })
                .eq('id', empresa.id)
            if (err) throw err
            await refreshEmpresa()
            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
        } catch (e: any) {
            setError(e.message || 'Error al guardar')
        } finally {
            setSaving(false)
        }
    }

    if (loading) return (
        <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        </div>
    )

    return (
        <div className="max-w-3xl space-y-6 animate-in fade-in slide-in-from-bottom-4">

            <div className="card p-6 space-y-4">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-500" />
                    Talento Humano y Nóminas
                </h3>

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                        <p className="text-sm font-bold text-slate-800">Activar módulo de Talento Humano y Nóminas</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {activo
                                ? 'El sidebar muestra las secciones "Talento Humano" y "Liquidación de Nóminas".'
                                : 'El módulo está oculto. Activa esta opción para empezar a configurar la estructura organizativa y los parámetros de nómina.'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setActivo(v => !v)}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors shrink-0 ${
                            activo ? 'bg-indigo-600' : 'bg-slate-300'
                        }`}
                    >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                            activo ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                    </button>
                </div>

                {error && (
                    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {error}
                    </div>
                )}

                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="btn btn-primary w-full py-3 text-sm font-black flex items-center justify-center gap-2"
                >
                    {saving
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
                        : saved
                        ? <><Check className="w-4 h-4" /> Guardado</>
                        : <><Save className="w-4 h-4" /> Guardar</>
                    }
                </button>
            </div>

            {empresa?.usar_talento_humano && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Link
                        to="/talento/estructura"
                        className="card p-5 flex items-center justify-between hover:border-indigo-300 hover:shadow-md transition-all group"
                    >
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600">
                                <Building2 className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-slate-900">Estructura Organizativa</p>
                                <p className="text-xs text-slate-500">Secciones y cargos</p>
                            </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                    </Link>

                    <Link
                        to="/nominas/parametros"
                        className="card p-5 flex items-center justify-between hover:border-cyan-300 hover:shadow-md transition-all group"
                    >
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-cyan-50 text-cyan-600">
                                <Wallet className="w-5 h-5" />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-slate-900">Parámetros de Nómina</p>
                                <p className="text-xs text-slate-500">SBU, IESS, fondo de reserva</p>
                            </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-cyan-500 transition-colors" />
                    </Link>
                </div>
            )}

            {!empresa?.usar_talento_humano && (
                <p className="text-xs text-slate-400 flex items-center gap-1.5">
                    <Settings className="w-3.5 h-3.5" />
                    Activa el módulo y guarda para ver los accesos a Estructura Organizativa y Parámetros de Nómina.
                </p>
            )}
        </div>
    )
}
