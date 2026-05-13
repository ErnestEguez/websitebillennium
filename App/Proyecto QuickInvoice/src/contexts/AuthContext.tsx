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

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [profile, setProfile] = useState<Profile | null>(null)
    const [empresa, setEmpresa] = useState<Empresa | null>(null)
    const [loading, setLoading] = useState(true)
    const isMounted = React.useRef(true)

    const [cajaSesion, setCajaSesion] = useState<any | null>(null);
    const [cajaBloqueada, setCajaBloqueada] = useState<string | null>(null); // Nombre del usuario que bloquea

    useEffect(() => {
        isMounted.current = true;
        const initializeAuth = async () => {
            console.log('🏁 Auth Initialization Started');
            try {
                // Timeout para gertSession por si acaso cuelga
                const sessionPromise = supabase.auth.getSession();
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Session fetch timeout')), 5000)
                );

                const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]) as any;

                if (!isMounted.current) return;

                if (session?.user) {
                    console.log('📦 Session found for:', session.user.email, 'ID:', session.user.id);
                    setUser(session.user);
                    await fetchProfile(session.user.id);
                } else {
                    // Si hay magic link en la URL, onAuthStateChange lo procesará — no apagar loading todavía
                    const hasMagicLink =
                        window.location.hash.includes('access_token') ||
                        window.location.hash.includes('type=magiclink') ||
                        new URLSearchParams(window.location.search).get('token_hash') !== null;
                    if (!hasMagicLink) {
                        console.log('⚪ No active session found');
                        setLoading(false);
                    }
                }
            } catch (err) {
                console.error('❌ Auth Initialization Error:', err);
                if (isMounted.current) setLoading(false);
            }
        };

        initializeAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            if (!isMounted.current) return;
            console.log('🔔 AUTH STATE CHANGE EVENT:', _event);
            console.log('👤 Session User:', session?.user?.email || 'NONE');

            if (_event === 'SIGNED_IN') {
                setUser(session?.user ?? null);
                if (session?.user) await fetchProfile(session.user.id);
            } else if (_event === 'SIGNED_OUT') {
                console.warn('⚠️ SIGNED_OUT event received - Clearing state');
                setUser(null);
                setProfile(null);
                setEmpresa(null);
                setCajaSesion(null);
                setCajaBloqueada(null);
                setLoading(false);
            } else if (_event === 'TOKEN_REFRESHED') {
                console.log('🔄 Token Refreshed');
            } else if (_event === 'USER_UPDATED') {
                console.log('👤 User Updated');
                if (session?.user) await fetchProfile(session.user.id);
            }
        });

        const timer = setTimeout(() => {
            if (isMounted.current && loading) {
                console.warn('Auth timeout reached');
                setLoading(false);
            }
        }, 10000);

        return () => {
            isMounted.current = false;
            subscription.unsubscribe();
            clearTimeout(timer);
        };
    }, [])

    async function fetchProfile(userId: string) {
        // Avoid fetching if we already have the profile for this user
        if (profile?.id === userId && empresa) {
            console.log('⚡ Profile already loaded for', userId)
            await validarCaja(userId, empresa.id, profile.rol);
            setLoading(false)
            return
        }

        // ── Offline path: use IndexedDB cache ────────────────────────────────
        if (!navigator.onLine) {
            try {
                console.log('📴 Offline — loading profile from IndexedDB cache')
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
                console.warn('📴 Offline — no cached profile found for user', userId)
            } catch (cacheErr) {
                console.warn('Error reading offline cache:', cacheErr)
            }
            setLoading(false)
            return
        }

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Profile fetch timeout')), 8000)
        );

        try {
            console.log('🔄 Fetching profile for:', userId);

            const { data: profileData, error: profileError } = await Promise.race([
                supabase.from('profiles').select('*').eq('id', userId).single(),
                timeoutPromise as any
            ]) as any;

            if (profileError) {
                console.error('❌ Profile Fetch Error:', profileError)
                if (profileError.code === 'PGRST116' || profileError.status === 406) {
                    console.warn('⚠️ User has no profile in DB yet')
                    setEmpresa(null)
                }
                setLoading(false)
                return
            }

            const data = profileData || {}
            console.log('✅ Profile loaded:', data.rol);
            setProfile(data)
            // Persist profile for offline use
            offlineDb.setAppCache(`profile:${userId}`, data).catch(() => {})

            if (data.empresa_id) {
                const { data: empresaData, error: empresaError } = await supabase
                    .from('empresas')
                    .select('*')
                    .eq('id', data.empresa_id)
                    .single()

                if (!empresaError && empresaData) {
                    setEmpresa(empresaData)
                    // Persist empresa for offline use
                    offlineDb.setAppCache(`empresa:${empresaData.id}`, empresaData).catch(() => {})
                    await validarCaja(userId, data.empresa_id, data.rol);
                } else {
                    console.error('❌ Empresa Fetch Error:', empresaError)
                    setEmpresa(null)
                }
            } else {
                setEmpresa(null)
            }
        } catch (error: any) {
            console.error('🔥 Auth context profile fetch error:', error.message);
            // Ya no reseteamos el perfil a null en errores genéricos para evitar "Usuario" fallback
            // El loading sí debe terminar
        } finally {
            if (isMounted.current) setLoading(false)
        }
    }

    async function validarCaja(userId: string, empresaId: string, userRol: string) {
        try {
            const esRolOficina = userRol === 'oficina' || userRol === 'admin_plataforma';
            const esRolOperativo = userRol === 'mesero' || userRol === 'cocina';

            // Buscar caja abierta en la empresa
            const { data: cajaAbierta, error } = await supabase
                .from('caja_sesiones')
                .select('*')
                .eq('empresa_id', empresaId)
                .eq('estado', 'abierta')
                .maybeSingle();

            if (error) throw error;

            if (cajaAbierta) {
                if (cajaAbierta.usuario_id === userId) {
                    console.log('✅ Caja abierta propia encontrada');
                    setCajaSesion(cajaAbierta);
                    setCajaBloqueada(null);
                    offlineDb.setAppCache(`cajaSesion:${empresaId}`, cajaAbierta).catch(() => {})
                } else if (esRolOficina) {
                    console.log('ℹ️ Caja abierta por otro usuario, rol oficina puede continuar');
                    setCajaSesion(cajaAbierta);
                    setCajaBloqueada(null);
                    offlineDb.setAppCache(`cajaSesion:${empresaId}`, cajaAbierta).catch(() => {})
                } else {
                    console.log('✅ Mesero/cocina: caja de oficina disponible');
                    setCajaSesion(cajaAbierta);
                    setCajaBloqueada(null);
                    offlineDb.setAppCache(`cajaSesion:${empresaId}`, cajaAbierta).catch(() => {})
                }
            } else {
                if (esRolOficina) {
                    console.log('✨ Oficina: abriendo nueva caja para:', userId);
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

                    if (errorInsert) {
                        console.error('Error abriendo caja:', errorInsert);
                    } else {
                        setCajaSesion(nuevaCaja);
                        setCajaBloqueada(null);
                        offlineDb.setAppCache(`cajaSesion:${empresaId}`, nuevaCaja).catch(() => {})
                    }
                } else if (esRolOperativo) {
                    // Mesero/cocina NO puede abrir caja. Debe esperar que oficina la abra.
                    console.warn('⛔ Mesero/cocina: no hay caja abierta por oficina');
                    setCajaSesion(null);
                    setCajaBloqueada('SIN_CAJA');
                }
            }
        } catch (err) {
            console.error('Error validando caja:', err);
        }
    }

    const signOut = async () => {
        console.log('Emergency SignOut triggered');
        try {
            // Intentar cerrar sesión en Supabase (puede fallar si no hay internet o sesion rota)
            await supabase.auth.signOut().catch(() => { });
        } finally {
            // Limpieza TOTAL y FORZADA
            console.log('Clearing local caches and redirecting...');
            localStorage.clear();
            sessionStorage.clear();

            // Usar reload forzado para asegurar que todo rastro de memoria se limpie
            window.location.replace('/login');
        }
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
                        <button
                            onClick={() => signOut()}
                            className="text-sm text-red-600 font-bold hover:underline py-2 px-4 rounded-lg hover:bg-red-50 transition-colors"
                        >
                            Ignorar y Cerrar Sesión
                        </button>
                    </div>
                )}
            </div>
        )
    }

    // PANTALLA DE ESPERA DE CAJA (solo para cuando hay caja de OTRO usuario que bloquea)
    // Nota: SIN_CAJA NO bloquea la pantalla — el mesero puede tomar pedidos sin caja abierta
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
                    <p className="text-slate-600 mb-6">
                        La caja está actualmente abierta por <strong>{cajaBloqueada}</strong>.
                        <br /><br />
                        No puedes acceder al sistema hasta que el usuario anterior cierre su turno.
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
        <AuthContext.Provider value={{
            user,
            profile,
            empresa,
            loading,
            signOut,
            cajaSesion // Exponemos la sesión
        } as any}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}
