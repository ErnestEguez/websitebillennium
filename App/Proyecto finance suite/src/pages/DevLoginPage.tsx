import { useState } from 'react'
import { supabaseFacturacion as supabase } from '../lib/supabaseFacturacion'
import { Loader2, Mail, CheckCircle } from 'lucide-react'

export function DevLoginPage() {
    const [email, setEmail]     = useState('')
    const [sent, setSent]       = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError]     = useState('')

    async function enviarLink() {
        if (!email.trim()) return
        setLoading(true)
        setError('')
        const { error: err } = await supabase.auth.signInWithOtp({
            email: email.trim(),
            options: { emailRedirectTo: window.location.origin },
        })
        if (err) setError(err.message)
        else setSent(true)
        setLoading(false)
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
            <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm space-y-5">
                <div className="text-center">
                    <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                        <Mail className="w-6 h-6 text-primary-600" />
                    </div>
                    <h1 className="text-xl font-bold text-slate-900">Finance Suite</h1>
                    <p className="text-xs text-amber-600 mt-1 bg-amber-50 rounded px-2 py-1 inline-block">
                        🛠 Modo desarrollo local
                    </p>
                </div>

                {sent ? (
                    <div className="text-center space-y-3">
                        <CheckCircle className="w-10 h-10 text-green-500 mx-auto" />
                        <p className="text-sm text-slate-600">
                            Enlace enviado a <strong>{email}</strong>
                        </p>
                        <p className="text-xs text-slate-400">
                            Revisa tu correo y haz clic en el enlace para entrar.
                        </p>
                    </div>
                ) : (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                                Email
                            </label>
                            <input
                                type="email"
                                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary-400"
                                placeholder="tu@empresa.com"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && enviarLink()}
                                autoFocus
                            />
                        </div>
                        {error && (
                            <p className="text-xs text-red-600 bg-red-50 rounded p-2">{error}</p>
                        )}
                        <button
                            onClick={enviarLink}
                            disabled={loading || !email.trim()}
                            className="w-full bg-primary-600 hover:bg-primary-700 text-white rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                            Enviar enlace de acceso
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}
