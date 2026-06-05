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

            const lista: LpEmpresa[] = (memberships ?? [])
                .map((m: any) => m.empresa)
                .filter(Boolean)
            setEmpresas(lista)

            // Restaurar empresa activa desde localStorage o usar la que coincide con QI
            const saved = localStorage.getItem(EMPRESA_KEY)
            let activa = lista.find(e => e.id === saved)
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
