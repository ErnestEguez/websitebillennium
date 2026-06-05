import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Mail, Loader2, CheckCircle2 } from 'lucide-react'

const PORTAL_URL = import.meta.env.VITE_PORTAL_URL || 'https://billenniumsystem.com'

export function LoginPage() {
    const navigate = useNavigate()
    const { user, profile, loading: authLoading, signOut } = useAuth()
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(false)
    const [sent, setSent] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (user && profile && !authLoading) {
            navigate('/', { replace: true })
        }
    }, [user, profile, authLoading, navigate])

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email.includes('@')) {
            setError('Ingresa un correo electrónico válido.')
            return
        }
        setLoading(true)
        setError(null)
        try {
            const { error } = await supabase.auth.signInWithOtp({
                email,
                options: {
                    emailRedirectTo: window.location.origin,
                },
            })
            if (error) throw error
            setSent(true)
        } catch (err: any) {
            setError(err.message ?? 'Error al enviar el enlace.')
        } finally {
            setLoading(false)
        }
    }

    if (sent) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-200 text-center">
                    <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-slate-900 mb-2">Revisa tu correo</h2>
                    <p className="text-slate-500 text-sm">
                        Enviamos un enlace de acceso a <strong>{email}</strong>.
                        Haz click en el enlace para entrar.
                    </p>
                    <button
                        onClick={() => { setSent(false); setEmail('') }}
                        className="mt-6 text-xs text-slate-400 hover:text-slate-600 underline"
                    >
                        Usar otro correo
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4 shadow-lg shadow-primary-200">
                        Q
                    </div>
                    <h1 className="text-3xl font-bold text-slate-900">Bienvenido</h1>
                    <p className="text-slate-500 mt-2 text-sm">
                        Ingresa tu correo y te enviamos un enlace de acceso
                    </p>
                </div>

                <form onSubmit={handleLogin} className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Correo electrónico
                        </label>
                        <input
                            type="email"
                            required
                            autoFocus
                            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none"
                            placeholder="correo@ejemplo.com"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                        />
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
                            {error}
                        </div>
                    )}

                    {user && !profile && (
                        <div className="p-4 bg-amber-50 rounded-xl border border-amber-200">
                            <p className="text-xs text-amber-700 font-bold mb-2">
                                Sesión activa sin perfil. Limpia la sesión e intenta de nuevo.
                            </p>
                            <button onClick={() => signOut()}
                                className="w-full py-2 bg-white border border-amber-300 text-amber-700 text-xs font-black rounded-lg hover:bg-amber-100">
                                CERRAR SESIÓN
                            </button>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                    >
                        {loading
                            ? <Loader2 className="w-5 h-5 animate-spin" />
                            : <><Mail className="w-5 h-5" /> Enviar enlace de acceso</>
                        }
                    </button>
                </form>

                <p className="mt-8 text-center text-[10px] text-slate-300">
                    © 2026 QuickInvoice — Sistema de Facturación Electrónica
                </p>
            </div>
        </div>
    )
}
