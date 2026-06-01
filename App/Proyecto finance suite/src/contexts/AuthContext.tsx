import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabaseFacturacion as supabase } from '../lib/supabaseFacturacion'
import { magicLinkRefreshToken } from '../lib/magicLink'
import type { User } from '@supabase/supabase-js'

export interface Profile {
    id: string
    empresa_id: string | null
    rol: string
    nombre: string | null
    email?: string | null
}

export interface Empresa {
    id: string
    nombre: string
    ruc: string
    logo_url?: string | null
}

interface AuthContextType {
    user: User | null
    profile: Profile | null
    empresa: Empresa | null
    loading: boolean
    signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)
const PORTAL_URL = import.meta.env.VITE_PORTAL_URL || 'https://www.billenniumsystem.com'

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser]       = useState<User | null>(null)
    const [profile, setProfile] = useState<Profile | null>(null)
    const [empresa, setEmpresa] = useState<Empresa | null>(null)
    const [loading, setLoading] = useState(true)
    const isMounted = React.useRef(true)

    useEffect(() => {
        isMounted.current = true

        // magicLinkRefreshToken fue capturado en main.tsx antes de que Supabase inicializara
        const refreshToken = magicLinkRefreshToken
        const hasMagicLink = !!refreshToken ||
            new URLSearchParams(window.location.search).get('token_hash') !== null

        if (refreshToken) {
            // Usar refresh_token para obtener sesión fresca (evita 401 por desfase de reloj)
            supabase.auth.refreshSession({ refresh_token: refreshToken })
                .then(async ({ data, error }) => {
                    if (!isMounted.current) return
                    if (!error && data.session?.user) {
                        setUser(data.session.user)
                        await fetchProfile(data.session.user.id)
                    }
                    if (isMounted.current) setLoading(false)
                })
            return () => { isMounted.current = false }
        }

        // Flujo normal (sin magic link)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (!isMounted.current) return

            if (event === 'SIGNED_OUT') {
                setUser(null); setProfile(null); setEmpresa(null)
                if (isMounted.current) setLoading(false)
                return
            }

            if (['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED'].includes(event)) {
                if (session?.user) {
                    setUser(session.user)
                    await fetchProfile(session.user.id)
                    if (isMounted.current) setLoading(false)
                } else if (!hasMagicLink) {
                    if (isMounted.current) setLoading(false)
                }
            }
        })

        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session && isMounted.current) setLoading(false)
        })

        return () => { isMounted.current = false; subscription.unsubscribe() }
    }, [])

    async function fetchProfile(userId: string) {
        try {
            const { data: prof } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle()

            if (!prof || !isMounted.current) return
            setProfile(prof as Profile)

            if (prof.empresa_id) {
                const { data: emp } = await supabase
                    .from('empresas')
                    .select('id, nombre, ruc, logo_url')
                    .eq('id', prof.empresa_id)
                    .maybeSingle()
                if (emp && isMounted.current) setEmpresa(emp as Empresa)
            }
        } catch (e) {
            console.error('FS AuthContext fetchProfile error:', e)
        }
    }

    function signOut() {
        supabase.auth.signOut().catch(() => {})
        window.close()
        setTimeout(() => { window.location.replace(PORTAL_URL) }, 300)
        return Promise.resolve()
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="w-16 h-16 bg-white rounded-2xl shadow-xl flex items-center justify-center mb-6">
                    <div className="w-8 h-8 bg-primary-600 rounded-lg animate-spin" />
                </div>
                <p className="text-slate-500 text-sm">Iniciando Finance Suite...</p>
            </div>
        )
    }

    return (
        <AuthContext.Provider value={{ user, profile, empresa, loading, signOut }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within AuthProvider')
    return ctx
}
