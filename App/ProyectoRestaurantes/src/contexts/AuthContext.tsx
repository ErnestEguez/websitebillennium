import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { supabasePortal } from '../lib/supabasePortal'
import type { User } from '@supabase/supabase-js'

export interface Profile {
    id: string
    empresa_id: string | null
    rol: 'admin_plataforma' | 'oficina' | 'mesero' | 'cocina'
    nombre: string | null
    email?: string | null
}

export interface Empresa {
    id: string
    nombre: string
    ruc: string
    logo_url?: string | null
    habilitar_division_cuenta?: boolean
}

interface AuthContextType {
    user: User | null
    profile: Profile | null
    empresa: Empresa | null
    loading: boolean
    signOut: () => Promise<void>
    cajaSesion: any | null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)
const PORTAL_URL = import.meta.env.VITE_PORTAL_URL || 'https://websitebillennium-k4qc-ernesteguezs-projects.vercel.app'

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser]               = useState<User | null>(null)
    const [profile, setProfile]         = useState<Profile | null>(null)
    const [empresa, setEmpresa]         = useState<Empresa | null>(null)
    const [loading, setLoading]         = useState(true)
    const [cajaSesion, setCajaSesion]   = useState<any | null>(null)
    const [cajaBloqueada, setCajaBloqueada] = useState<string | null>(null)
    const isMounted  = React.useRef(true)
    const loadingRef = React.useRef(true)

    useEffect(() => {
        isMounted.current = true

        // Detectar magic link del portal (SSO)
        const hasMagicLink =
            window.location.hash.includes('access_token') ||
            window.location.hash.includes('type=magiclink') ||
            new URLSearchParams(window.location.search).get('token_hash') !== null

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (!isMounted.current) return

            if (event === 'SIGNED_OUT') {
                setUser(null); setProfile(null); setEmpresa(null)
                setCajaSesion(null); setCajaBloqueada(null)
                loadingRef.current = false
                if (isMounted.current) setLoading(false)
                return
            }

            if (['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event) && session?.user) {
                setUser(session.user)
                await fetchProfileAndEmpresa(session.user)
            }

            if (isMounted.current) {
                loadingRef.current = false
                setLoading(false)
            }
        })

        // Si no hay magic link, verificar sesión existente (para meseros con email/password)
        if (!hasMagicLink) {
            supabase.auth.getSession().then(({ data: { session } }) => {
                if (!session && isMounted.current) {
                    loadingRef.current = false
                    setLoading(false)
                }
            })
        }

        // Timeout de seguridad
        const timer = setTimeout(() => {
            if (isMounted.current && loadingRef.current) {
                loadingRef.current = false
                setLoading(false)
            }
        }, 10000)

        return () => {
            isMounted.current = false
            subscription.unsubscribe()
            clearTimeout(timer)
        }
    }, [])

    async function fetchProfileAndEmpresa(authUser: User) {
        try {
            // ── Paso 1: buscar en restaurantes.staff (mesero / cocina) ──
            const { data: staffData } = await supabase
                .from('staff')
                .select('id, empresa_id, rol, estado')
                .eq('id', authUser.id)
                .eq('estado', 'activo')
                .maybeSingle()

            let prof: Profile
            let empresaId: string | null = null

            if (staffData) {
                // Usuario de salón: mesero o cocina
                prof = {
                    id:         authUser.id,
                    empresa_id: staffData.empresa_id,
                    rol:        staffData.rol as Profile['rol'],
                    nombre:     authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || null,
                    email:      authUser.email || null,
                }
                empresaId = staffData.empresa_id
            } else {
                // ── Paso 2: buscar en facturacion.profiles (portal: oficina / admin) ──
                const { data: portalProfile } = await supabasePortal
                    .from('profiles')
                    .select('id, empresa_id, rol, nombre')
                    .eq('id', authUser.id)
                    .maybeSingle()

                if (!portalProfile || !isMounted.current) {
                    if (isMounted.current) { loadingRef.current = false; setLoading(false) }
                    return
                }

                prof = {
                    id:         portalProfile.id,
                    empresa_id: portalProfile.empresa_id,
                    rol:        portalProfile.rol as Profile['rol'],
                    nombre:     portalProfile.nombre,
                    email:      authUser.email || null,
                }
                empresaId = portalProfile.empresa_id
            }

            if (!isMounted.current) return
            setProfile(prof)

            // ── Paso 3: cargar empresa desde facturacion.empresas (portal) ──
            if (empresaId) {
                const { data: emp } = await supabasePortal
                    .from('empresas')
                    .select('id, nombre, ruc, logo_url')
                    .eq('id', empresaId)
                    .maybeSingle()

                if (emp && isMounted.current) {
                    // Cargar config RestoFlow (habilitar_division_cuenta, etc.)
                    const { data: restoCfg } = await supabase
                        .from('config_empresa')
                        .select('habilitar_division_cuenta, config_general')
                        .eq('empresa_id', empresaId)
                        .maybeSingle()

                    const empresaObj: Empresa = {
                        id:                       emp.id,
                        nombre:                   emp.nombre,
                        ruc:                      emp.ruc,
                        logo_url:                 emp.logo_url,
                        habilitar_division_cuenta: restoCfg?.habilitar_division_cuenta ?? false,
                    }

                    setEmpresa(empresaObj)

                    // Solo valida caja si tiene empresa (admin sin empresa se salta esto)
                    await validarCaja(authUser.id, empresaId, prof.rol)
                }
            }
        } catch (e: any) {
            console.error('RestoFlow AuthContext error:', e.message)
        } finally {
            if (isMounted.current) {
                loadingRef.current = false
                setLoading(false)
            }
        }
    }

    async function validarCaja(userId: string, empresaId: string, rol: string) {
        try {
            const esOficina  = rol === 'oficina' || rol === 'admin_plataforma'
            const esOperativo = rol === 'mesero' || rol === 'cocina'

            const { data: cajaAbierta, error } = await supabase
                .from('caja_sesiones')
                .select('*')
                .eq('empresa_id', empresaId)
                .eq('estado', 'abierta')
                .maybeSingle()

            if (error) throw error

            if (cajaAbierta) {
                setCajaSesion(cajaAbierta)
                setCajaBloqueada(null)
            } else if (esOficina) {
                // Oficina abre caja automáticamente
                const { data: nuevaCaja, error: errInsert } = await supabase
                    .from('caja_sesiones')
                    .insert({
                        empresa_id:    empresaId,
                        usuario_id:    userId,
                        base_inicial:  0,
                        estado:        'abierta',
                        fecha_apertura: new Date().toISOString(),
                    })
                    .select()
                    .single()

                if (!errInsert && isMounted.current) {
                    setCajaSesion(nuevaCaja)
                    setCajaBloqueada(null)
                }
            } else if (esOperativo) {
                // Mesero/cocina esperan que oficina abra caja
                if (isMounted.current) {
                    setCajaSesion(null)
                    setCajaBloqueada('SIN_CAJA')
                }
            }
        } catch (err) {
            console.error('Error validando caja:', err)
        }
    }

    async function signOut() {
        // Fire-and-forget — no await para evitar spinner colgado
        supabase.auth.signOut().catch(() => {})
        // Cerrar ventana (app abierta desde portal) o redirigir al portal
        window.close()
        setTimeout(() => window.location.replace(PORTAL_URL), 300)
        return Promise.resolve()
    }

    // ── Pantalla de carga ──
    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
                <div className="w-16 h-16 bg-white rounded-2xl shadow-xl flex items-center justify-center mb-8 animate-pulse">
                    <div className="w-8 h-8 bg-primary-600 rounded-lg animate-spin" />
                </div>
                <h1 className="text-xl font-bold text-slate-900 mb-2">RestoFlow</h1>
                <p className="text-slate-500 font-medium">
                    {user ? 'Validando perfil de acceso...' : 'Iniciando sistema...'}
                </p>
                {user && (
                    <div className="mt-10 p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                        <p className="text-xs text-slate-400 mb-3">Si tarda demasiado, puede haber un problema con tu conexión.</p>
                        <button
                            onClick={() => signOut()}
                            className="text-sm text-red-600 font-bold hover:underline py-2 px-4 rounded-lg hover:bg-red-50 transition-colors"
                        >
                            Cerrar sesión y reintentar
                        </button>
                    </div>
                )}
            </div>
        )
    }

    // ── Pantalla de bloqueo por caja (solo conflictos reales, no SIN_CAJA) ──
    if (cajaBloqueada && cajaBloqueada !== 'SIN_CAJA' && user) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 p-6 text-center">
                <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full">
                    <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800 mb-2">Caja Bloqueada</h2>
                    <p className="text-slate-600 mb-6">
                        La caja está abierta por <strong>{cajaBloqueada}</strong>.<br /><br />
                        Espera a que ese usuario cierre su turno.
                    </p>
                    <button
                        onClick={() => signOut()}
                        className="w-full bg-slate-800 hover:bg-slate-900 text-white font-medium py-3 px-4 rounded-xl transition-colors"
                    >
                        Cerrar Sesión
                    </button>
                </div>
            </div>
        )
    }

    return (
        <AuthContext.Provider value={{ user, profile, empresa, loading, signOut, cajaSesion } as any}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const ctx = useContext(AuthContext)
    if (!ctx) throw new Error('useAuth must be used within AuthProvider')
    return ctx
}
