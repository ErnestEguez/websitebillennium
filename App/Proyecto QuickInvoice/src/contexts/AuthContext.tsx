import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { offlineDb } from '../lib/offlineDb'
import type { User } from '@supabase/supabase-js'

export interface Profile {
    id: string
    empresa_id: string | null
    rol: 'admin_plataforma' | 'oficina' | 'mesero' | 'cocina'
    nombre: string | null
}

interface Empresa {
    id: string
    nombre: string
    ruc: string
    logo_url?: string | null
    habilitar_division_cuenta?: boolean
    usar_vendor_management?: boolean
    usar_contabilidad_compras?: boolean
    config_cuentas_compras?: Record<string, unknown> | null
}

export interface Modules {
    vendor:    boolean
    finance:   boolean
    ledgerpro: boolean
}

export interface Permisos {
    perm_dashboard:          boolean
    perm_nueva_factura:      boolean
    perm_comprobantes:       boolean
    perm_notas_credito:      boolean
    perm_anulacion_facturas: boolean
    perm_cierres_caja:       boolean
    perm_consulta_ventas:    boolean
    perm_clientes:           boolean
    perm_cartera_cxc:        boolean
    perm_consulta_cartera:   boolean
    perm_estado_cuenta:      boolean
    perm_proveedores:        boolean
    perm_compras:            boolean
    perm_cxp:                boolean
    perm_reportes_cxp:       boolean
    perm_bancos:             boolean
    perm_egresos:            boolean
    perm_cheques:            boolean
    perm_movimientos_banc:   boolean
    perm_conciliacion:       boolean
    perm_plan_cuentas:       boolean
    perm_asientos:           boolean
    perm_reportes_cont:      boolean
    perm_tributario:         boolean
}

interface AuthContextType {
    user: User | null
    profile: Profile | null
    empresa: Empresa | null
    modules: Modules
    permisos: Permisos
    isAdmin: boolean
    loading: boolean
    signOut: () => Promise<void>
    cajaSesion: any | null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const DEFAULT_MODULES: Modules = { vendor: false, finance: false, ledgerpro: false }

export const DEFAULT_PERMISOS: Permisos = {
    perm_dashboard:          true,
    perm_nueva_factura:      true,
    perm_comprobantes:       true,
    perm_notas_credito:      true,
    perm_anulacion_facturas: true,
    perm_cierres_caja:       true,
    perm_consulta_ventas:    true,
    perm_clientes:           true,
    perm_cartera_cxc:        true,
    perm_consulta_cartera:   true,
    perm_estado_cuenta:      true,
    perm_proveedores:        true,
    perm_compras:            true,
    perm_cxp:                true,
    perm_reportes_cxp:       true,
    perm_bancos:             true,
    perm_egresos:            true,
    perm_cheques:            true,
    perm_movimientos_banc:   true,
    perm_conciliacion:       true,
    perm_plan_cuentas:       true,
    perm_asientos:           true,
    perm_reportes_cont:      true,
    perm_tributario:         true,
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [profile, setProfile] = useState<Profile | null>(null)
    const [modules, setModules] = useState<Modules>(DEFAULT_MODULES)
    const [permisos, setPermisos] = useState<Permisos>(DEFAULT_PERMISOS)
    const [isAdmin, setIsAdmin] = useState(false)
    const [empresa, setEmpresa] = useState<Empresa | null>(null)
    const [loading, setLoading] = useState(true)
    const isMounted = React.useRef(true)

    const [cajaSesion, setCajaSesion] = useState<any | null>(null);
    const [cajaBloqueada, setCajaBloqueada] = useState<string | null>(null);

    useEffect(() => {
        isMounted.current = true;
        const initializeAuth = async () => {
            try {
                const sessionPromise = supabase.auth.getSession();
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Session fetch timeout')), 5000)
                );
                const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]) as any;
                if (!isMounted.current) return;
                if (session?.user) {
                    setUser(session.user);
                    await fetchProfile(session.user.id);
                } else {
                    const hasMagicLink =
                        window.location.hash.includes('access_token') ||
                        window.location.hash.includes('type=magiclink') ||
                        new URLSearchParams(window.location.search).get('token_hash') !== null;
                    if (!hasMagicLink) setLoading(false);
                }
            } catch (err) {
                if (isMounted.current) setLoading(false);
            }
        };
        initializeAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            if (!isMounted.current) return;
            if (_event === 'SIGNED_IN') {
                setUser(session?.user ?? null);
                if (session?.user) await fetchProfile(session.user.id);
            } else if (_event === 'SIGNED_OUT') {
                setUser(null); setProfile(null); setEmpresa(null);
                setCajaSesion(null); setCajaBloqueada(null);
                setModules(DEFAULT_MODULES); setPermisos(DEFAULT_PERMISOS);
                setIsAdmin(false); setLoading(false);
            } else if (_event === 'USER_UPDATED') {
                if (session?.user) await fetchProfile(session.user.id);
            }
        });

        const timer = setTimeout(() => {
            if (isMounted.current && loading) setLoading(false);
        }, 10000);

        return () => {
            isMounted.current = false;
            subscription.unsubscribe();
            clearTimeout(timer);
        };
    }, [])

    async function fetchProfile(userId: string) {
        if (profile?.id === userId && empresa) {
            await validarCaja(userId, empresa.id, profile.rol);
            setLoading(false)
            return
        }

        if (!navigator.onLine) {
            try {
                const cachedProfile = await offlineDb.getAppCache<Profile>(`profile:${userId}`)
                if (cachedProfile) {
                    setProfile(cachedProfile)
                    if (cachedProfile.empresa_id) {
                        const cachedEmpresa = await offlineDb.getAppCache<Empresa>(`empresa:${cachedProfile.empresa_id}`)
                        if (cachedEmpresa) {
                            setEmpresa(cachedEmpresa)
                            const cachedCaja = await offlineDb.getAppCache<any>(`cajaSesion:${cachedProfile.empresa_id}`)
                            if (cachedCaja) setCajaSesion(cachedCaja)
                        }
                    }
                    setLoading(false)
                    return
                }
            } catch (cacheErr) {}
            setLoading(false)
            return
        }

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Profile fetch timeout')), 8000)
        );

        try {
            const { data: profileData, error: profileError } = await Promise.race([
                supabase.from('profiles').select('*').eq('id', userId).single(),
                timeoutPromise as any
            ]) as any;

            if (profileError) {
                if (profileError.code === 'PGRST116' || profileError.status === 406) {
                    console.warn('⚠️ User has no profile in DB yet')
                }
                setLoading(false)
                return
            }

            const data = profileData || {}
            console.log('✅ Profile loaded:', data.rol);
            setProfile(data)
            offlineDb.setAppCache(`profile:${userId}`, data).catch(() => {})

            if (data.empresa_id) {
                const { data: empresaData, error: empresaError } = await supabase
                    .from('empresas')
                    .select('*')
                    .eq('id', data.empresa_id)
                    .single()

                if (!empresaError && empresaData) {
                    setEmpresa(empresaData)
                    offlineDb.setAppCache(`empresa:${empresaData.id}`, empresaData).catch(() => {})
                    await validarCaja(userId, data.empresa_id, data.rol)

                    const { data: modData, error: modError } = await supabase
                        .from('user_modules')
                        .select('*')
                        .eq('user_id', userId)
                        .eq('empresa_id', empresaData.id)
                        .maybeSingle()
                    console.log('[modules] data:', modData, 'error:', modError)
                    setModules(modData
                        ? { vendor: !!modData.vendor, finance: !!modData.finance, ledgerpro: !!modData.ledgerpro }
                        : DEFAULT_MODULES)
                    setIsAdmin(!!modData?.is_admin)

                    try {
                        const permQuery = supabase
                            .from('user_permisos')
                            .select('*')
                            .eq('user_id', userId)
                            .eq('empresa_id', empresaData.id)
                            .maybeSingle()
                        const permTimeout = new Promise<any>((_, reject) =>
                            setTimeout(() => reject(new Error('permisos timeout')), 4000)
                        )
                        const { data: permData, error: permError } = await Promise.race([permQuery, permTimeout])
                        console.log('[permisos] data:', permData, 'error:', permError)
                        if (permData) {
                            setPermisos({
                                perm_dashboard:          permData.perm_dashboard          ?? true,
                                perm_nueva_factura:      permData.perm_nueva_factura      ?? true,
                                perm_comprobantes:       permData.perm_comprobantes       ?? true,
                                perm_notas_credito:      permData.perm_notas_credito      ?? true,
                                perm_anulacion_facturas: permData.perm_anulacion_facturas ?? true,
                                perm_cierres_caja:       permData.perm_cierres_caja       ?? true,
                                perm_consulta_ventas:    permData.perm_consulta_ventas    ?? true,
                                perm_clientes:           permData.perm_clientes           ?? true,
                                perm_cartera_cxc:        permData.perm_cartera_cxc        ?? true,
                                perm_consulta_cartera:   permData.perm_consulta_cartera   ?? true,
                                perm_estado_cuenta:      permData.perm_estado_cuenta      ?? true,
                                perm_proveedores:        permData.perm_proveedores        ?? true,
                                perm_compras:            permData.perm_compras            ?? true,
                                perm_cxp:                permData.perm_cxp               ?? true,
                                perm_reportes_cxp:       permData.perm_reportes_cxp       ?? true,
                                perm_bancos:             permData.perm_bancos             ?? true,
                                perm_egresos:            permData.perm_egresos            ?? true,
                                perm_cheques:            permData.perm_cheques            ?? true,
                                perm_movimientos_banc:   permData.perm_movimientos_banc   ?? true,
                                perm_conciliacion:       permData.perm_conciliacion       ?? true,
                                perm_plan_cuentas:       permData.perm_plan_cuentas       ?? true,
                                perm_asientos:           permData.perm_asientos           ?? true,
                                perm_reportes_cont:      permData.perm_reportes_cont      ?? true,
                                perm_tributario:         permData.perm_tributario         ?? true,
                            })
                        } else {
                            setPermisos(DEFAULT_PERMISOS)
                        }
                    } catch (permErr) {
                        console.error('[permisos] error:', permErr)
                    }
                } else {
                    setEmpresa(null)
                }
            } else {
                setEmpresa(null)
            }
        } catch (error: any) {
            console.error('🔥 Auth context profile fetch error:', error.message);
        } finally {
            if (isMounted.current) setLoading(false)
        }
    }

    async function validarCaja(userId: string, empresaId: string, userRol: string) {
        try {
            const esRolOficina = userRol === 'oficina' || userRol === 'admin_plataforma';
            const esRolOperativo = userRol === 'mesero' || userRol === 'cocina';

            const { data: cajaAbierta, error } = await supabase
                .from('caja_sesiones')
                .select('*')
                .eq('empresa_id', empresaId)
                .eq('estado', 'abierta')
                .order('fecha_apertura', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) throw error;

            if (cajaAbierta) {
                setCajaSesion(cajaAbierta);
                setCajaBloqueada(null);
                offlineDb.setAppCache(`cajaSesion:${empresaId}`, cajaAbierta).catch(() => {})
            } else {
                if (esRolOficina) {
                    const { data: nuevaCaja, error: errorInsert } = await supabase
                        .from('caja_sesiones')
                        .insert({
                            empresa_id: empresaId,
                            usuario_id: userId,
                            base_inicial: 0,
                            estado: 'abierta',
                            fecha_apertura: new Date().toISOString()
                        })
                        .select()
                        .maybeSingle();
                    if (!errorInsert) {
                        setCajaSesion(nuevaCaja);
                        setCajaBloqueada(null);
                        offlineDb.setAppCache(`cajaSesion:${empresaId}`, nuevaCaja).catch(() => {})
                    }
                } else if (esRolOperativo) {
                    setCajaSesion(null);
                    setCajaBloqueada('SIN_CAJA');
                }
            }
        } catch (err) {
            console.error('Error validando caja:', err);
        }
    }

    const signOut = async () => {
        supabase.auth.signOut().catch(() => {})
        Object.keys(localStorage).forEach(k => {
            if (!k.startsWith('sb-')) localStorage.removeItem(k)
        })
        sessionStorage.clear()
        window.close()
    }

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
                <div className="w-16 h-16 bg-white rounded-2xl shadow-xl flex items-center justify-center mb-8 animate-pulse">
                    <div className="w-8 h-8 bg-primary-600 rounded-lg animate-spin"></div>
                </div>
                <h1 className="text-xl font-bold text-slate-900 mb-2">QuickInvoice</h1>
                <p className="text-slate-500 font-medium">
                    {user ? 'Validando tu perfil de acceso...' : 'Iniciando sistema...'}
                </p>
                <div className="mt-12 max-w-xs w-full space-y-4">
                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-primary-600 animate-[loading_10s_ease-in-out_infinite]"></div>
                    </div>
                </div>
                {user && (
                    <div className="mt-12 p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                        <p className="text-xs text-slate-400 mb-3">Si la carga tarda demasiado, puede haber un problema con tu conexión o perfil.</p>
                        <button onClick={() => signOut()} className="text-sm text-red-600 font-bold hover:underline py-2 px-4 rounded-lg hover:bg-red-50 transition-colors">
                            Ignorar y Cerrar Sesión
                        </button>
                    </div>
                )}
            </div>
        )
    }

    if (cajaBloqueada && cajaBloqueada !== 'SIN_CAJA' && user) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 p-6 text-center">
                <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full">
                    <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800 mb-2">Caja Cerrada para Ti</h2>
                    <p className="text-slate-600 mb-6">La caja está actualmente abierta por <strong>{cajaBloqueada}</strong>.</p>
                    <button onClick={() => signOut()} className="w-full bg-slate-800 hover:bg-slate-900 text-white font-medium py-3 px-4 rounded-xl transition-colors">
                        Cerrar Sesión
                    </button>
                </div>
            </div>
        )
    }

    return (
        <AuthContext.Provider value={{
            user, profile, empresa, modules, permisos, isAdmin, loading, signOut, cajaSesion
        } as any}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (context === undefined) throw new Error('useAuth must be used within an AuthProvider')
    return context
}
