import React, { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { BookOpen, Loader2, Eye, EyeOff } from 'lucide-react'

export function LoginPage() {
    const { user } = useAuth()
    const [email, setEmail]       = useState('')
    const [password, setPassword] = useState('')
    const [loading, setLoading]   = useState(false)
    const [showPwd, setShowPwd]   = useState(false)
    const [error, setError]       = useState<string | null>(null)

    const PORTAL_URL = import.meta.env.VITE_PORTAL_URL || 'https://websitebillennium-k4qc-ernesteguezs-projects.vercel.app'

    if (user) return <Navigate to="/dashboard" replace />

    // Si no hay usuario y no hay magic link procesándose, redirigir al Portal
    const hasMagicLink =
        window.location.hash.includes('access_token') ||
        new URLSearchParams(window.location.search).get('token_hash') !== null
    if (!hasMagicLink) {
        window.location.replace(PORTAL_URL)
        return null
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        setLoading(true)
        const { error } = await supabase.auth.signInWithPassword({
            email:    email.trim().toLowerCase(),
            password: password.trim(),
        })
        if (error) setError(error.message)
        setLoading(false)
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-primary-900 via-primary-800 to-slate-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl shadow-xl mb-4">
                        <BookOpen className="w-8 h-8 text-primary-600" />
                    </div>
                    <h1 className="text-3xl font-bold text-white">Ledger Pro</h1>
                    <p className="text-primary-200 mt-1">Sistema Contable Multiempresa</p>
                </div>

                <div className="bg-white rounded-2xl shadow-2xl p-8">
                    <h2 className="text-xl font-bold text-slate-900 mb-6">Iniciar Sesión</h2>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="label">Correo electrónico</label>
                            <input
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                className="input"
                                placeholder="tu@correo.com"
                                required
                            />
                        </div>
                        <div>
                            <label className="label">Contraseña</label>
                            <div className="relative">
                                <input
                                    type={showPwd ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="input pr-10"
                                    placeholder="••••••••"
                                    required
                                />
                                <button type="button" tabIndex={-1}
                                    onClick={() => setShowPwd(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                        {error && (
                            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
                        )}
                        <button
                            type="submit"
                            disabled={loading}
                            className="btn btn-primary w-full py-3"
                        >
                            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ingresar'}
                        </button>
                    </form>
                </div>

                <p className="text-center text-primary-300 text-xs mt-6">
                    Billennium System · v1.0.0
                </p>
            </div>
        </div>
    )
}
