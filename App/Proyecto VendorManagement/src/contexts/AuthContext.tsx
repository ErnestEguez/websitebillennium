import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
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
    usar_contabilidad_compras?: boolean
    config_cuentas_compras?:   Record<string, string> | null
}

interface AuthContextType {
    user: User | null
    profile: Profile | null
    empresa: Empresa | null
    loading: boolean
    signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)
const PORTAL_URL = import.meta.env.VITE_PORTAL_URL || 'https://websitebillennium-k4qc-ernesteguezs-projects.vercel.app'

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser]       = useState<User | null>(null)
    const [profile, setProfile] = useState<Profile | null>(null)
    const [empresa, setEmpresa] = useState<Empresa | null>(null)
    const [loading, setLoading] = useState(true)
    const isMounted = React.useRef(true)

    useEffect(() => {
        isMounted.current = true

        const hasMagicLink =
            window.location.hash.includes('access_token') ||
            window.location.hash.includes('type=magiclink') ||
            new URLSearchParams(window.location.search).get('token_hash') !== null

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (!isMounted.current) return

            if (event === 'SIGNED_OUT') {
                setUser(null); setProfile(null); setEmpresa(null)
                if (isMounted.current) setLoading(false)
                return
            }

            if (['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED'].includes(event) && session?.user) {
                setUser(session.user)
                await fetchProfile(session.user.id)
            }

            if (isMounted.current) setLoading(false)
        })

        if (!hasMagicLink) {
            supabase.auth.getSession().then(({ data: { session } }) => {
                if (!session && isMounted.current) setLoading(false)
            })
        } else {
            // Si hay magic link pero _initialize() falla (p.ej. GET /auth/v1/user
            // tarda más de 10s por carga de red), SIGNED_IN nunca se dispara.
            // Timeout de seguridad: si en 20s no hay sesión, reenviar al portal.
            const fallback = setTimeout(() => {
                if (isMounted.current && loading) {
                    setLoading(false)
                }
            }, 20_000)
            return () => { isMounted.current = false; subscription.unsubscribe(); clearTimeout(fallback) }
        }

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
                    .select('id, nombre, ruc, logo_url, usar_contabilidad_compras, config_cuentas_compras')
                    .eq('id', prof.empresa_id)
                    .maybeSingle()
                if (emp && isMounted.current) setEmpresa(emp as Empresa)
            }
        } catch (e) {
            console.error('VM AuthContext fetchProfile error:', e)
        }
    }

    function signOut() {
        // Fire-and-forget — never await to avoid spinner hang
        supabase.auth.signOut().catch(() => {})
        window.location.replace(PORTAL_URL)
        return Promise.resolve()
    }

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
                <div className="w-16 h-16 bg-white rounded-2xl shadow-xl flex items-center justify-center mb-6">
                    <div className="w-8 h-8 bg-primary-600 rounded-lg animate-spin" />
                </div>
                <p className="text-slate-500 text-sm">Iniciando Gestión de Compras...</p>
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
