import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { LogIn, Loader2 } from 'lucide-react'

export function LoginPage() {
    const navigate = useNavigate()
    // Redirect if already logged in AND has profile
    const { user, profile, loading: authLoading, signOut } = useAuth()
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (user && profile && !authLoading) {
            navigate('/', { replace: true })
        }
    }, [user, profile, authLoading, navigate])

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)

        // Validación de formato de email (para evitar que ingresen nombres o pines aquí)
        if (!email.includes('@')) {
            setError('Por favor ingrese un EMAIL válido (ej: usuario@quickinvoice.com).')
            setLoading(false)
            return
        }

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            })

            if (error) {
                console.error('FULL LOGIN ERROR OBJECT:', error)
                setError(error.message)
            } else if (data.user) {
                console.log('Login successful:', data)
                navigate('/', { replace: true })
            }
        } catch (err: any) {
            console.error('🔥 CRITICAL Login error:', err.message);
            setError('Ocurrió un error inesperado. Por favor, inténtalo de nuevo.');
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-primary-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4 shadow-lg shadow-primary-200">
                        Q
                    </div>
                    <h1 className="text-3xl font-bold text-slate-900">Bienvenido</h1>
                    <p className="text-slate-500 mt-2">Ingresa a tu cuenta de QuickInvoice</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Correo electrónico
                        </label>
                        <input
                            type="text"
                            required
                            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none"
                            placeholder="correo@ejemplo.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Contraseña
                        </label>
                        <input
                            type="password"
                            required
                            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all outline-none"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100">
                            {error}
                        </div>
                    )}

                    {user && !profile && (
                        <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 space-y-3">
                            <p className="text-xs text-amber-700 font-bold leading-tight">
                                Tienes una sesión activa pero no pudimos cargar tu perfil. Es posible que el registro esté dañado.
                            </p>
                            <button
                                onClick={() => signOut()}
                                className="w-full py-2 bg-white border border-amber-300 text-amber-700 text-xs font-black rounded-lg hover:bg-amber-100"
                            >
                                CERRAR SESIÓN Y REINTENTAR
                            </button>
                        </div>
                    )}


                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 rounded-lg transition-all flex items-center justify-center gap-2 group disabled:opacity-70"
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                <LogIn className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                Iniciar Sesión
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-8 pt-6 border-t border-slate-100 text-center space-y-4">
                    <button
                        onClick={signOut}
                        className="text-xs text-slate-400 hover:text-red-500 underline font-bold transition-colors"
                    >
                        ¿Problemas para entrar? Limpiar sesión y reintentar
                    </button>
                    <p className="text-[10px] text-slate-300">
                        © 2026 QuickInvoice. Sistema de Facturación Electrónica.
                    </p>
                </div>
            </div>
        </div>
    )
}
