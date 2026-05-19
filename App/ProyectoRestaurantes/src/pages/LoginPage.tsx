import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

export function LoginPage() {
    const navigate = useNavigate()
    const { user, profile, loading: authLoading } = useAuth()

    const [email, setEmail]       = useState('')
    const [password, setPassword] = useState('')
    const [loginErr, setLoginErr] = useState('')
    const [logging, setLogging]   = useState(false)

    const hasMagicLink =
        window.location.hash.includes('access_token') ||
        window.location.hash.includes('type=magiclink') ||
        new URLSearchParams(window.location.search).get('token_hash') !== null

    useEffect(() => {
        if (user && profile && !authLoading) {
            navigate('/', { replace: true })
        }
    }, [user, profile, authLoading, navigate])

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault()
        setLoginErr('')
        setLogging(true)
        try {
            const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
            if (error) throw error
            // onAuthStateChange en AuthContext se encarga del resto
        } catch (err: any) {
            setLoginErr('Correo o contraseña incorrectos')
        } finally {
            setLogging(false)
        }
    }

    // Procesando magic link del portal
    if (hasMagicLink && authLoading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4 animate-pulse">
                        R
                    </div>
                    <p className="text-slate-500">Iniciando sesión...</p>
                </div>
            </div>
        )
    }

    // Sin sesión — formulario de doble acceso
    if (!user && !authLoading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="max-w-sm w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4">
                            R
                        </div>
                        <h1 className="text-xl font-bold text-slate-900">RestoFlow</h1>
                    </div>

                    {/* ── Login mesero / cocina ── */}
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">
                                Correo
                            </label>
                            <input
                                type="email"
                                required
                                autoComplete="username"
                                placeholder="tu@correo.com"
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">
                                Contraseña
                            </label>
                            <input
                                type="password"
                                required
                                autoComplete="current-password"
                                placeholder="••••••••"
                                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                            />
                        </div>

                        {loginErr && (
                            <p className="text-red-500 text-sm text-center">{loginErr}</p>
                        )}

                        <button
                            type="submit"
                            disabled={logging}
                            className="w-full bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 rounded-xl transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                        >
                            {logging ? (
                                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                                </svg>
                            ) : null}
                            Ingresar
                        </button>
                    </form>

                    {/* ── Separador ── */}
                    <div className="flex items-center gap-3 my-6">
                        <div className="flex-1 h-px bg-slate-200" />
                        <span className="text-xs text-slate-400 font-medium">o</span>
                        <div className="flex-1 h-px bg-slate-200" />
                    </div>

                    {/* ── Acceso portal (admin / cajero) ── */}
                    <p className="text-center text-xs text-slate-400 mb-3">
                        ¿Administrador o Cajero?
                    </p>
                    <a
                        href="https://billenniumsystem.com"
                        target="_blank"
                        rel="noreferrer"
                        className="w-full flex items-center justify-center gap-2 border border-slate-200 hover:bg-slate-50 text-slate-600 font-medium py-3 rounded-xl transition-colors text-sm"
                    >
                        Acceder desde el Portal Billennium
                    </a>
                </div>
            </div>
        )
    }

    return null
}
