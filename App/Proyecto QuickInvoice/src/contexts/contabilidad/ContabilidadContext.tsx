import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabaseContabilidad } from '../../lib/supabaseContabilidad'
import { useAuth as useQIAuth } from '../AuthContext'
import type { User } from '@supabase/supabase-js'
import type { LpEmpresa, LpUsuarioEmpresa } from '../../types/conta'

interface ContabilidadContextType {
    user: User | null
    empresas: LpEmpresa[]
    empresaActiva: LpEmpresa | null
    membresiaActiva: LpUsuarioEmpresa | null
    loading: boolean
    setEmpresaActiva: (empresa: LpEmpresa) => void
    signOut: () => Promise<void>
}

const ContabilidadContext = createContext<ContabilidadContextType | undefined>(undefined)
const EMPRESA_KEY = 'lp_empresa_activa_qi'

export function ContabilidadProvider({ children }: { children: React.ReactNode }) {
    const { user, empresa: qiEmpresa, signOut } = useQIAuth() as any
    const [empresas, setEmpresas]         = useState<LpEmpresa[]>([])
    const [empresaActiva, setEmpresaState] = useState<LpEmpresa | null>(null)
    const [membresiaActiva, setMembresia]  = useState<LpUsuarioEmpresa | null>(null)
    const [loading, setLoading]            = useState(true)
    const isMounted = React.useRef(true)

    useEffect(() => {
        isMounted.current = true
        if (!user?.id) { setLoading(false); return }
        cargarEmpresas()
        return () => { isMounted.current = false }
    }, [user?.id])

    async function cargarEmpresas() {
        try {
            setLoading(true)
            const { data: memberships } = await supabaseContabilidad
                .from('lp_usuarios_empresa')
                .select('*, empresa:lp_empresas(*)')
                .eq('user_id', user.id)
                .eq('activo', true)

            if (!isMounted.current) return

            let lista: LpEmpresa[] = (memberships ?? [])
                .map((m: any) => m.empresa)
                .filter(Boolean)

            // La empresa activa en QuickInvoice todavía no existe en LedgerPro: crearla
            if (qiEmpresa?.id && !lista.some(e => e.qi_empresa_id === qiEmpresa.id)) {
                const nueva = await provisionarEmpresa(qiEmpresa)
                if (nueva) lista = [...lista, nueva]
            }

            if (!isMounted.current) return
            setEmpresas(lista)

            // Restaurar empresa activa desde localStorage, o la vinculada a QI, o la que coincide por RUC
            const saved = localStorage.getItem(EMPRESA_KEY)
            let activa = lista.find(e => e.id === saved)
            if (!activa && qiEmpresa?.id) {
                activa = lista.find(e => e.qi_empresa_id === qiEmpresa.id)
            }
            if (!activa && qiEmpresa?.ruc) {
                activa = lista.find(e => e.ruc === qiEmpresa.ruc)
            }
            if (!activa && lista.length > 0) activa = lista[0]

            if (activa) {
                setEmpresaState(activa)
                const memb = memberships?.find((m: any) => m.empresa_id === activa!.id)
                setMembresia(memb ?? null)
            }
        } catch (e) {
            console.error('ContabilidadContext:', e)
        } finally {
            if (isMounted.current) setLoading(false)
        }
    }

    // Registra en LedgerPro (lp_empresas + lp_usuarios_empresa) la empresa activa de
    // QuickInvoice la primera vez que alguien de esa empresa entra a Contabilidad.
    async function provisionarEmpresa(qi: any): Promise<LpEmpresa | null> {
        try {
            // Por si otro usuario de la misma empresa ya la registró antes
            const { data: existente } = await supabaseContabilidad
                .from('lp_empresas')
                .select('*')
                .eq('qi_empresa_id', qi.id)
                .maybeSingle()

            let lpEmpresa = existente as LpEmpresa | null

            if (!lpEmpresa) {
                const { data: moneda } = await supabaseContabilidad
                    .from('lp_monedas')
                    .select('id')
                    .eq('codigo', 'USD')
                    .single()

                const nuevaEmpresa = {
                    id: crypto.randomUUID(),
                    nombre: qi.nombre,
                    razon_social: qi.razon_social || qi.nombre,
                    ruc: qi.ruc ?? null,
                    direccion: qi.direccion ?? null,
                    telefono: qi.telefono ?? null,
                    email: qi.email ?? null,
                    logo_url: qi.logo_url ?? null,
                    moneda_id: moneda?.id,
                    qi_empresa_id: qi.id,
                    activa: true,
                }

                const { error: errEmpresa } = await supabaseContabilidad
                    .from('lp_empresas')
                    .insert(nuevaEmpresa)

                if (errEmpresa) {
                    console.error('LedgerPro: error creando empresa', errEmpresa)
                    return null
                }
                lpEmpresa = nuevaEmpresa as unknown as LpEmpresa
            }

            const { error: errMemb } = await supabaseContabilidad
                .from('lp_usuarios_empresa')
                .insert({ user_id: user.id, empresa_id: lpEmpresa.id, rol: 'admin_conta', activo: true })

            if (errMemb) console.error('LedgerPro: error creando membresía', errMemb)

            return lpEmpresa
        } catch (e) {
            console.error('LedgerPro: error provisionando empresa', e)
            return null
        }
    }

    function setEmpresaActiva(empresa: LpEmpresa) {
        setEmpresaState(empresa)
        localStorage.setItem(EMPRESA_KEY, empresa.id)
        const memb = empresas.find(e => e.id === empresa.id)
        setMembresia(memb as any ?? null)
    }

    return (
        <ContabilidadContext.Provider value={{
            user, empresas, empresaActiva, membresiaActiva, loading, setEmpresaActiva, signOut
        }}>
            {children}
        </ContabilidadContext.Provider>
    )
}

export function useAuth() {
    const ctx = useContext(ContabilidadContext)
    if (!ctx) throw new Error('useAuth must be used within ContabilidadProvider')
    return ctx
}
