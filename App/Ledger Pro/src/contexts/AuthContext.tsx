import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'
import type { LpEmpresa, LpUsuarioEmpresa } from '../types/conta'

interface AuthContextType {
    user: User | null
    empresas: LpEmpresa[]
    empresaActiva: LpEmpresa | null
    membresiaActiva: LpUsuarioEmpresa | null
    loading: boolean
    setEmpresaActiva: (empresa: LpEmpresa) => void
    signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)
const EMPRESA_KEY = 'lp_empresa_activa'

// Eventos de Supabase que requieren cargar/re-verificar datos del usuario
const LOAD_EVENTS = ['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED'] as const

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser]                     = useState<User | null>(null)
    const [empresas, setEmpresas]             = useState<LpEmpresa[]>([])
    const [empresaActiva, setEmpresaActivaState] = useState<LpEmpresa | null>(null)
    const [membresiaActiva, setMembresiaActiva] = useState<LpUsuarioEmpresa | null>(null)
    const [loading, setLoading]               = useState(true)

    const isMounted        = React.useRef(true)
    const cargadoParaUser  = React.useRef<string | null>(null)

    // Si la carga tarda más de 10 s (token corrupto / lock de auth atascado),
    // forzar loading=false para mostrar el login en lugar de pantalla infinita
    useEffect(() => {
        const t = setTimeout(() => {
            if (isMounted.current) setLoading(false)
        }, 10_000)
        return () => clearTimeout(t)
    }, [])

    useEffect(() => {
        isMounted.current = true

        // Si viene de Portal vía magic link, mantener loading hasta que SIGNED_IN dispare
        const hasMagicLink =
            window.location.hash.includes('access_token') ||
            window.location.hash.includes('type=magiclink') ||
            new URLSearchParams(window.location.search).get('token_hash') !== null

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (!isMounted.current) return

            if (event === 'SIGNED_OUT') {
                cargadoParaUser.current = null
                resetState()
                if (isMounted.current) setLoading(false)
                return
            }

            if ((LOAD_EVENTS as readonly string[]).includes(event) && session?.user) {
                const uid = session.user.id

                if (cargadoParaUser.current !== uid) {
                    cargadoParaUser.current = uid
                    await cargarEmpresas(uid)
                }

                if (isMounted.current) setUser(session.user)
            }

            if (isMounted.current) setLoading(false)
        })

        // Si no hay magic link y no hay sesión activa, liberar loading
        if (!hasMagicLink) {
            supabase.auth.getSession().then(({ data: { session } }) => {
                if (!session && isMounted.current) setLoading(false)
            })
        }

        return () => {
            isMounted.current = false
            subscription.unsubscribe()
        }
    }, [])

    async function cargarEmpresas(userId: string, intento = 0) {
        // getSession() garantiza que el cliente tenga un JWT válido y fresco
        // antes de la llamada RPC (cubre el caso de token recién refrescado)
        if (intento === 0) {
            await supabase.auth.getSession()
        }

        const { data, error } = await supabase.rpc('lp_get_mis_empresas')

        if (error) {
            console.error('LP — error rpc lp_get_mis_empresas:', error)
            if (intento < 2 && isMounted.current) {
                await new Promise(r => setTimeout(r, 800))
                return cargarEmpresas(userId, intento + 1)
            }
            cargadoParaUser.current = null   // permite reintentar en próximo evento
            return
        }

        const lista: any[] = Array.isArray(data) ? data : []

        if (!lista.length) {
            if (intento < 2 && isMounted.current) {
                await new Promise(r => setTimeout(r, 800))
                return cargarEmpresas(userId, intento + 1)
            }
            console.warn('LP — sin empresas para usuario:', userId)
            cargadoParaUser.current = null   // permite reintentar en próximo evento
            return
        }

        if (!isMounted.current) return

        const listaEmpresas: LpEmpresa[] = lista.map(item => ({
            id:           item.id,
            nombre:       item.nombre,
            razon_social: item.razon_social,
            ruc:          item.ruc ?? null,
            moneda_id:    item.moneda_id,
            activa:       item.activa,
            moneda:       item.moneda,
        } as LpEmpresa))

        setEmpresas(listaEmpresas)

        const guardadaId = localStorage.getItem(EMPRESA_KEY)
        const porCookie  = listaEmpresas.find(e => e.id === guardadaId) ?? null
        // Auto-seleccionar solo cuando hay exactamente 1 empresa o cuando ya hay preferencia guardada.
        // Con 2+ empresas y sin preferencia, dejar null para que el selector de empresa se muestre.
        const guardada   = porCookie ?? (listaEmpresas.length === 1 ? listaEmpresas[0] : null)
        if (guardada) {
            setEmpresaActivaState(guardada)
            const mem = (lista.find(item => item.id === guardada.id)?.membresia ?? null) as LpUsuarioEmpresa | null
            setMembresiaActiva(mem)
        }
    }

    function setEmpresaActiva(empresa: LpEmpresa) {
        setEmpresaActivaState(empresa)
        localStorage.setItem(EMPRESA_KEY, empresa.id)
    }

    function resetState() {
        setUser(null)
        setEmpresas([])
        setEmpresaActivaState(null)
        setMembresiaActiva(null)
        localStorage.removeItem(EMPRESA_KEY)
    }

    function signOut() {
        cargadoParaUser.current = null
        // Only clear lp_ keys — sb- keys belong to the shared Portal session
        Object.keys(localStorage).forEach(k => {
            if (k.startsWith('lp_')) localStorage.removeItem(k)
        })
        // Fire and forget — never await to avoid spinner hang
        supabase.auth.signOut().catch(() => {})
        const portalUrl = import.meta.env.VITE_PORTAL_URL || 'https://websitebillennium-k4qc-ernesteguezs-projects.vercel.app'
        window.location.replace(portalUrl)
        return Promise.resolve()
    }

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
                <div className="w-16 h-16 bg-white rounded-2xl shadow-xl flex items-center justify-center mb-8">
                    <div className="w-8 h-8 bg-primary-600 rounded-lg animate-spin" />
                </div>
                <h1 className="text-xl font-bold text-slate-900 mb-2">Ledger Pro</h1>
                <p className="text-slate-500">Iniciando sistema contable...</p>
            </div>
        )
    }

    return (
        <AuthContext.Provider value={{
            user, empresas, empresaActiva, membresiaActiva, loading, setEmpresaActiva, signOut,
        }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within AuthProvider')
    return ctx
}
