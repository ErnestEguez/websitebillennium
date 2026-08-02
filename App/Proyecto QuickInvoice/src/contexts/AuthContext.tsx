import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { offlineDb } from '../lib/offlineDb'
import type { User } from '@supabase/supabase-js'
import { EmpresaSelectorScreen } from '../components/EmpresaSelectorScreen'
import type { EmpresaOption } from '../components/EmpresaSelectorScreen'
import { sesionUnicaService } from '../services/sesionUnicaService'
import { SesionDesplazadaModal } from '../components/SesionDesplazadaModal'

export type { EmpresaOption }

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
    usar_talento_humano?: boolean
    es_agente_retencion?: boolean
    numero_resolucion_retencion?: string | null
    fecha_inicio_retencion?: string | null
}

export interface Modules {
    vendor:         boolean
    finance:        boolean
    ledgerpro:      boolean
    talento_humano: boolean
}

export interface Permisos {
    perm_dashboard:          boolean
    perm_nueva_factura:      boolean
    perm_comprobantes:       boolean
    perm_notas_credito:      boolean
    perm_anulacion_facturas: boolean
    perm_cierres_caja:       boolean
    perm_consulta_ventas:    boolean
    perm_gerencia:           boolean
    perm_clientes:           boolean
    perm_cartera_cxc:        boolean
    perm_gestion_cartera:    boolean
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
    perm_th_estructura:        boolean
    perm_th_empleados:          boolean
    perm_th_nomina_parametros:  boolean
    perm_th_conceptos_nomina:   boolean
    perm_th_rol_nomina:         boolean
    perm_guias_remision:        boolean
    perm_preparaciones_pintura: boolean
    perm_productos:             boolean
    perm_ordenes_compra:        boolean
    perm_compras_inventario:    boolean
    perm_nc_proveedores:        boolean
    perm_ajuste_inventario:     boolean
    perm_transferencia_bodega:  boolean
    perm_inventario_valorizado: boolean
    perm_kardex:                boolean
    perm_importar_articulos:    boolean
    perm_configuracion:         boolean
    perm_codigos_retencion:     boolean
    perm_vendedores:            boolean
    perm_importar_clientes:     boolean
    perm_migracion_cartera:     boolean
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
    empresasDisponibles: EmpresaOption[]
    selectEmpresa: (empresaId: string) => Promise<void>
    refreshEmpresa: () => Promise<void>
    checkSesionUnicaSiToca: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Recuerda la última empresa activa por usuario para no repetir el selector
// multiempresa cada vez que el navegador descarta/recarga la pestaña.
const EMPRESA_ACTUAL_KEY = 'qi_empresa_actual_'

function getEmpresaGuardada(userId: string): string | null {
    try { return localStorage.getItem(EMPRESA_ACTUAL_KEY + userId) } catch { return null }
}

function guardarEmpresaActual(userId: string, empresaId: string) {
    try { localStorage.setItem(EMPRESA_ACTUAL_KEY + userId, empresaId) } catch {}
}

const DEFAULT_MODULES: Modules = { vendor: false, finance: false, ledgerpro: false, talento_humano: false }

export const DEFAULT_PERMISOS: Permisos = {
    perm_dashboard:          true,
    perm_nueva_factura:      true,
    perm_comprobantes:       true,
    perm_notas_credito:      true,
    perm_anulacion_facturas: true,
    perm_cierres_caja:       true,
    perm_consulta_ventas:    true,
    perm_gerencia:           true,
    perm_clientes:           true,
    perm_cartera_cxc:        true,
    perm_gestion_cartera:    true,
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
    perm_th_estructura:        true,
    perm_th_empleados:          true,
    perm_th_nomina_parametros:  true,
    perm_th_conceptos_nomina:   true,
    perm_th_rol_nomina:         true,
    perm_guias_remision:        true,
    perm_preparaciones_pintura: true,
    perm_productos:             true,
    perm_ordenes_compra:        true,
    perm_compras_inventario:    true,
    perm_nc_proveedores:        true,
    perm_ajuste_inventario:     true,
    perm_transferencia_bodega:  true,
    perm_inventario_valorizado: true,
    perm_kardex:                true,
    perm_importar_articulos:    true,
    perm_configuracion:         true,
    perm_codigos_retencion:     true,
    perm_vendedores:            true,
    perm_importar_clientes:     true,
    perm_migracion_cartera:     true,
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser]                           = useState<User | null>(null)
    const [profile, setProfile]                     = useState<Profile | null>(null)
    const [modules, setModules]                     = useState<Modules>(DEFAULT_MODULES)
    const [permisos, setPermisos]                   = useState<Permisos>(DEFAULT_PERMISOS)
    const [isAdmin, setIsAdmin]                     = useState(false)
    const [empresa, setEmpresa]                     = useState<Empresa | null>(null)
    const [loading, setLoading]                     = useState(true)
    const [cajaSesion, setCajaSesion]               = useState<any | null>(null)
    const [cajaBloqueada, setCajaBloqueada]         = useState<string | null>(null)
    const [empresasDisponibles, setEmpresasDisponibles] = useState<EmpresaOption[]>([])
    const [needsEmpresaSelection, setNeedsEmpresaSelection] = useState(false)
    const isMounted = React.useRef(true)

    // ── Sesión única activa por usuario ─────────────────────────
    // (feature flag por empresa — sin flag activo, todo esto es no-op)
    const [sesionDesplazada, setSesionDesplazada] = useState(false)
    const sesionUnicaEnabledRef = React.useRef(false)
    const sessionJustSignedIn   = React.useRef(false)
    const userIdRef    = React.useRef<string | null>(null)
    const lastSessionCheckAt = React.useRef(Date.now())
    const checkEnCurso      = React.useRef(false)

    useEffect(() => { userIdRef.current = user?.id ?? null }, [user])

    function chequearSesionSiCorresponde() {
        if (!sesionUnicaEnabledRef.current || checkEnCurso.current) return
        if (!userIdRef.current) return
        if (Date.now() - lastSessionCheckAt.current < sesionUnicaService.SESSION_CHECK_INTERVAL_MS) return
        checkEnCurso.current = true
        sesionUnicaService.verificarSesionVigente(userIdRef.current)
            .then(vigente => {
                lastSessionCheckAt.current = Date.now()
                if (!vigente && isMounted.current) setSesionDesplazada(true)
            })
            .catch(() => { /* falla de red: se reintenta en el próximo disparador disponible */ })
            .finally(() => { checkEnCurso.current = false })
    }

    useEffect(() => {
        const interval = setInterval(chequearSesionSiCorresponde, 60_000)
        const onVisible = () => { if (document.visibilityState === 'visible') chequearSesionSiCorresponde() }
        document.addEventListener('visibilitychange', onVisible)
        return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible) }
    }, [])

    useEffect(() => {
        isMounted.current = true

        // true si la URL trae un enlace mágico sin procesar todavía —
        // ya sea el formato implícito (#access_token=...) que el SDK
        // detecta solo, o el formato ?token_hash=...&type=... que
        // requiere canjearlo explícitamente (ver más abajo).
        function hayMagicLinkEnUrl(): boolean {
            return (
                window.location.hash.includes('access_token') ||
                window.location.hash.includes('type=magiclink') ||
                new URLSearchParams(window.location.search).get('token_hash') !== null
            )
        }

        const initializeAuth = async () => {
            try {
                // Algunas plantillas de correo de Supabase enlazan directo al
                // sitio con ?token_hash=...&type=..., en vez de pasar primero
                // por /auth/v1/verify (que sí deja el session en #access_token
                // y el SDK detecta solo). Ese caso hay que canjearlo a mano con
                // verifyOtp — si no, la sesión nunca se establece y el login
                // queda en loop pidiendo el correo otra vez.
                const tokenHash = new URLSearchParams(window.location.search).get('token_hash')
                const tipoParam = new URLSearchParams(window.location.search).get('type')
                if (tokenHash && tipoParam) {
                    const { error: otpError } = await supabase.auth.verifyOtp({
                        token_hash: tokenHash,
                        type: tipoParam as 'magiclink' | 'email' | 'recovery' | 'invite',
                    })
                    if (!otpError) window.history.replaceState({}, '', window.location.pathname)
                }

                const sessionPromise = supabase.auth.getSession()
                const timeoutPromise = new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Session fetch timeout')), 5000)
                )
                const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]) as any
                if (!isMounted.current) return
                if (session?.user) {
                    setUser(session.user)
                    setTimeout(() => { if (isMounted.current) fetchProfile(session.user.id) }, 0)
                } else {
                    if (!hayMagicLinkEnUrl()) setLoading(false)
                }
            } catch {
                // Si sigue habiendo un enlace mágico sin procesar (ej. la
                // verificación de arriba tardó más que el timeout de la
                // carrera), no mandar a /login todavía — se resuelve con el
                // evento SIGNED_IN o con el timeout de seguridad de abajo.
                if (isMounted.current && !hayMagicLinkEnUrl()) setLoading(false)
            }
        }
        initializeAuth()

        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
            if (!isMounted.current) return
            if (_event === 'SIGNED_IN') {
                sessionJustSignedIn.current = true
                setUser(session?.user ?? null)
                if (session?.user) setTimeout(() => { if (isMounted.current) fetchProfile(session.user.id) }, 0)
            } else if (_event === 'SIGNED_OUT') {
                setUser(null); setProfile(null); setEmpresa(null)
                setCajaSesion(null); setCajaBloqueada(null)
                setModules(DEFAULT_MODULES); setPermisos(DEFAULT_PERMISOS)
                setIsAdmin(false); setEmpresasDisponibles([])
                setNeedsEmpresaSelection(false); setLoading(false)
            } else if (_event === 'USER_UPDATED') {
                if (session?.user) await fetchProfile(session.user.id)
            }
        })

        const timer = setTimeout(() => {
            if (isMounted.current) setLoading(false)
        }, 10000)

        return () => {
            isMounted.current = false
            subscription.unsubscribe()
            clearTimeout(timer)
        }
    }, [])

    // Carga empresa + módulos + permisos para un empresa_id dado.
    // Es el único lugar donde se hacen esas 3 queries.
    async function loadEmpresaById(userId: string, empresaId: string, userRol: string) {
        const { data: empresaData, error: empresaError } = await supabase
            .from('empresas')
            .select('*')
            .eq('id', empresaId)
            .single()

        if (empresaError || !empresaData) {
            console.error('❌ Error cargando empresa:', empresaError)
            if (isMounted.current) setEmpresa(null)
            return
        }

        if (isMounted.current) {
            setEmpresa(empresaData)
            offlineDb.setAppCache(`empresa:${empresaData.id}`, empresaData).catch(() => {})
        }
        guardarEmpresaActual(userId, empresaId)

        try {
            // El flag es por empresa (control de rollout), pero la sesión es
            // GLOBAL por usuario: una vez activado en esta sesión de navegador,
            // no se vuelve a apagar aunque después cargue una empresa sin el
            // flag — "OR acumulativo", nunca pasa de true a false.
            const flagEnabled = await sesionUnicaService.isEnabled(empresaId)
            if (flagEnabled) sesionUnicaEnabledRef.current = true
            if (sesionUnicaEnabledRef.current) {
                // sessionJustSignedIn=true → genera session_id nuevo (desplaza el
                // dispositivo anterior). false → reusa el existente (cambio de
                // empresa o recarga de página, no debe autodesplazar a nadie).
                await sesionUnicaService.registrarSesion(userId, empresaId, sessionJustSignedIn.current)
                sessionJustSignedIn.current = false
                lastSessionCheckAt.current = Date.now()
            }
        } catch (e) {
            console.error('Error en sesión única:', e) // nunca bloquea el login normal
        }

        await validarCaja(userId, empresaId, userRol)

        const { data: modData } = await supabase
            .from('user_modules')
            .select('*')
            .eq('user_id', userId)
            .eq('empresa_id', empresaId)
            .maybeSingle()

        if (isMounted.current) {
            setModules(modData
                ? { vendor: !!modData.vendor, finance: !!modData.finance, ledgerpro: !!modData.ledgerpro, talento_humano: !!modData.talento_humano }
                : DEFAULT_MODULES)
            setIsAdmin(!!modData?.is_admin)
        }

        try {
            const { data: permData } = await Promise.race([
                supabase.from('user_permisos').select('*')
                    .eq('user_id', userId).eq('empresa_id', empresaId).maybeSingle(),
                new Promise<any>((_, reject) => setTimeout(() => reject(new Error('permisos timeout')), 4000))
            ])
            if (isMounted.current) {
                setPermisos(permData ? {
                    perm_dashboard:          permData.perm_dashboard          ?? true,
                    perm_nueva_factura:      permData.perm_nueva_factura      ?? true,
                    perm_comprobantes:       permData.perm_comprobantes       ?? true,
                    perm_notas_credito:      permData.perm_notas_credito      ?? true,
                    perm_anulacion_facturas: permData.perm_anulacion_facturas ?? true,
                    perm_cierres_caja:       permData.perm_cierres_caja       ?? true,
                    perm_consulta_ventas:    permData.perm_consulta_ventas    ?? true,
                    perm_gerencia:           permData.perm_gerencia           ?? true,
                    perm_clientes:           permData.perm_clientes           ?? true,
                    perm_cartera_cxc:        permData.perm_cartera_cxc        ?? true,
                    perm_gestion_cartera:    permData.perm_gestion_cartera    ?? true,
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
                    perm_th_estructura:        permData.perm_th_estructura        ?? true,
                    perm_th_empleados:          permData.perm_th_empleados          ?? true,
                    perm_th_nomina_parametros:  permData.perm_th_nomina_parametros  ?? true,
                    perm_th_conceptos_nomina:   permData.perm_th_conceptos_nomina   ?? true,
                    perm_th_rol_nomina:         permData.perm_th_rol_nomina         ?? true,
                    perm_guias_remision:        permData.perm_guias_remision        ?? true,
                    perm_preparaciones_pintura: permData.perm_preparaciones_pintura ?? true,
                    perm_productos:             permData.perm_productos             ?? true,
                    perm_ordenes_compra:        permData.perm_ordenes_compra        ?? true,
                    perm_compras_inventario:    permData.perm_compras_inventario    ?? true,
                    perm_nc_proveedores:        permData.perm_nc_proveedores        ?? true,
                    perm_ajuste_inventario:     permData.perm_ajuste_inventario     ?? true,
                    perm_transferencia_bodega:  permData.perm_transferencia_bodega  ?? true,
                    perm_inventario_valorizado: permData.perm_inventario_valorizado ?? true,
                    perm_kardex:                permData.perm_kardex                ?? true,
                    perm_importar_articulos:    permData.perm_importar_articulos    ?? true,
                    perm_configuracion:         permData.perm_configuracion         ?? true,
                    perm_codigos_retencion:     permData.perm_codigos_retencion     ?? true,
                    perm_vendedores:            permData.perm_vendedores            ?? true,
                    perm_importar_clientes:     permData.perm_importar_clientes     ?? true,
                    perm_migracion_cartera:     permData.perm_migracion_cartera     ?? true,
                } : DEFAULT_PERMISOS)
            }
        } catch {
            if (isMounted.current) setPermisos(DEFAULT_PERMISOS)
        }
    }

    // Re-lee la empresa actual (ej. tras cambiar un flag en Ajustes) sin recargar módulos/permisos/caja.
    async function refreshEmpresa() {
        if (!empresa?.id) return
        const { data, error } = await supabase
            .from('empresas')
            .select('*')
            .eq('id', empresa.id)
            .single()
        if (!error && data && isMounted.current) {
            setEmpresa(data)
            offlineDb.setAppCache(`empresa:${data.id}`, data).catch(() => {})
        }
    }

    async function fetchProfile(userId: string) {
        // Si ya tiene empresa cargada (misma sesión, re-auth), solo revalida caja
        if (profile?.id === userId && empresa) {
            await validarCaja(userId, empresa.id, profile.rol)
            if (isMounted.current) setLoading(false)
            return
        }

        // Modo offline: usa caché
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
            } catch {}
            setLoading(false)
            return
        }

        try {
            const { data: profileData, error: profileError } = await Promise.race([
                supabase.from('profiles').select('*').eq('id', userId).single(),
                new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Profile fetch timeout')), 8000))
            ]) as any

            if (profileError) {
                if (profileError.code === 'PGRST116' || profileError.status === 406) {
                    console.warn('⚠️ User has no profile in DB yet')
                }
                if (isMounted.current) setLoading(false)
                return
            }

            const data = profileData || {}
            if (isMounted.current) {
                setProfile(data)
                offlineDb.setAppCache(`profile:${userId}`, data).catch(() => {})
            }

            // Consultar empresas asignadas al usuario
            const { data: ueData } = await supabase
                .from('usuario_empresas')
                .select('empresa_id, rol, activo')
                .eq('user_id', userId)

            const activeUE = (ueData || []).filter((r: any) => r.activo !== false)

            if (activeUE.length >= 2) {
                // Múltiples empresas: cargar nombres y mostrar selector
                const empresaIds = activeUE.map((r: any) => r.empresa_id)
                const { data: eList } = await supabase
                    .from('empresas')
                    .select('id, nombre, ruc, logo_url')
                    .in('id', empresaIds)

                const options: EmpresaOption[] = (eList || []).map((e: any) => ({
                    id: e.id,
                    nombre: e.nombre,
                    ruc: e.ruc,
                    logo_url: e.logo_url ?? null,
                    rol: activeUE.find((r: any) => r.empresa_id === e.id)?.rol || data.rol,
                }))

                if (options.length >= 2) {
                    if (isMounted.current) setEmpresasDisponibles(options)

                    // Si ya había una empresa activa elegida antes (misma sesión /
                    // pestaña recargada), reentrar directo sin repetir el selector.
                    const empresaGuardada = getEmpresaGuardada(userId)
                    const opcionGuardada = empresaGuardada
                        ? options.find(o => o.id === empresaGuardada)
                        : undefined

                    if (opcionGuardada) {
                        await loadEmpresaById(userId, opcionGuardada.id, opcionGuardada.rol)
                    } else if (isMounted.current) {
                        setNeedsEmpresaSelection(true)
                    }
                    return // finally ejecuta setLoading(false)
                }

                // La query de empresas falló o devolvió menos de 2 — fallback
                if (options.length === 1) {
                    if (isMounted.current) setEmpresasDisponibles(options)
                    await loadEmpresaById(userId, options[0].id, options[0].rol)
                } else {
                    // Sin resultados: usar profiles.empresa_id
                    if (data.empresa_id) await loadEmpresaById(userId, data.empresa_id, data.rol)
                    else if (isMounted.current) setEmpresa(null)
                }

            } else if (activeUE.length === 1) {
                // Una sola empresa asignada: entrar directo
                await loadEmpresaById(userId, activeUE[0].empresa_id, activeUE[0].rol)

            } else {
                // Sin filas en usuario_empresas: fallback a profiles.empresa_id
                if (data.empresa_id) {
                    await loadEmpresaById(userId, data.empresa_id, data.rol)
                } else {
                    if (isMounted.current) setEmpresa(null)
                }
            }

        } catch (error: any) {
            console.error('🔥 Auth context profile fetch error:', error.message)
        } finally {
            if (isMounted.current) setLoading(false)
        }
    }

    // Cambia la empresa activa (llamado desde el selector o el switcher del header)
    const selectEmpresa = async (empresaId: string) => {
        if (!user) return
        if (isMounted.current) {
            setLoading(true)
            setNeedsEmpresaSelection(false)
            setCajaSesion(null)
            setCajaBloqueada(null)
        }
        const opt = empresasDisponibles.find(e => e.id === empresaId)
        await loadEmpresaById(user.id, empresaId, opt?.rol || profile?.rol || 'oficina')
        if (isMounted.current) setLoading(false)
    }

    async function validarCaja(userId: string, empresaId: string, userRol: string) {
        try {
            const esRolOficina   = userRol === 'oficina' || userRol === 'admin_plataforma'
            const esRolOperativo = userRol === 'mesero'  || userRol === 'cocina'

            const { data: cajaAbierta, error } = await supabase
                .from('caja_sesiones')
                .select('*')
                .eq('empresa_id', empresaId)
                .eq('estado', 'abierta')
                .order('fecha_apertura', { ascending: false })
                .limit(1)
                .maybeSingle()

            if (error) throw error

            if (cajaAbierta) {
                if (isMounted.current) {
                    setCajaSesion(cajaAbierta)
                    setCajaBloqueada(null)
                    offlineDb.setAppCache(`cajaSesion:${empresaId}`, cajaAbierta).catch(() => {})
                }
            } else if (esRolOficina) {
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
                    .maybeSingle()
                if (!errorInsert && isMounted.current) {
                    setCajaSesion(nuevaCaja)
                    setCajaBloqueada(null)
                    offlineDb.setAppCache(`cajaSesion:${empresaId}`, nuevaCaja).catch(() => {})
                }
            } else if (esRolOperativo) {
                if (isMounted.current) {
                    setCajaSesion(null)
                    setCajaBloqueada('SIN_CAJA')
                }
            }
        } catch (err) {
            console.error('Error validando caja:', err)
        }
    }

    const signOut = async () => {
        if (sesionUnicaEnabledRef.current) {
            sesionUnicaService.cerrarSesion('logout_manual').catch(() => {}) // fire-and-forget: no bloquea el resto del logout
        }
        supabase.auth.signOut().catch(() => {})
        Object.keys(localStorage).forEach(k => {
            if (!k.startsWith('sb-')) localStorage.removeItem(k)
        })
        sessionStorage.clear()
        window.close()
    }

    // Se llama al hacer click en el modal de sesión desplazada. Deliberadamente
    // SIN llamar a cerrar_sesion RPC — eso borraría la sesión NUEVA y legítima
    // del otro dispositivo, no la propia.
    const confirmarSesionDesplazada = async () => {
        setSesionDesplazada(false)
        await supabase.auth.signOut().catch(() => {})
        Object.keys(localStorage).forEach(k => {
            if (!k.startsWith('sb-')) localStorage.removeItem(k)
        })
        sessionStorage.clear()
        window.location.href = '/login'
    }

    // ── Renders especiales ──────────────────────────────────────

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
                <div className="mt-12 max-w-xs w-full">
                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-primary-600 animate-[loading_10s_ease-in-out_infinite]"></div>
                    </div>
                </div>
                {user && (
                    <div className="mt-12 p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
                        <p className="text-xs text-slate-400 mb-3">Si la carga tarda demasiado, puede haber un problema con tu conexión o perfil.</p>
                        <button onClick={signOut} className="text-sm text-red-600 font-bold hover:underline py-2 px-4 rounded-lg hover:bg-red-50 transition-colors">
                            Ignorar y Cerrar Sesión
                        </button>
                    </div>
                )}
            </div>
        )
    }

    if (needsEmpresaSelection) {
        return (
            <EmpresaSelectorScreen
                empresas={empresasDisponibles}
                onSelect={selectEmpresa}
                onSignOut={signOut}
                userName={profile?.nombre || ''}
            />
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
                    <button onClick={signOut} className="w-full bg-slate-800 hover:bg-slate-900 text-white font-medium py-3 px-4 rounded-xl transition-colors">
                        Cerrar Sesión
                    </button>
                </div>
            </div>
        )
    }

    return (
        <AuthContext.Provider value={{
            user, profile, empresa, modules, permisos, isAdmin,
            loading, signOut, cajaSesion,
            empresasDisponibles, selectEmpresa, refreshEmpresa,
            checkSesionUnicaSiToca: chequearSesionSiCorresponde,
        } as any}>
            {children}
            <SesionDesplazadaModal open={sesionDesplazada} onConfirm={confirmarSesionDesplazada} />
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (context === undefined) throw new Error('useAuth must be used within an AuthProvider')
    return context
}
