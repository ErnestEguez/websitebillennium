import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { getMisionConPasos, upsertProgreso } from '../services/sentinelService'
import type { MisionConPasos } from '../types/sentinel'

interface SentinelCtx {
    tourActivo:   MisionConPasos | null
    pasoActual:   number
    iniciandoTour: boolean
    iniciarTour:  (misionId: string) => Promise<void>
    avanzarPaso:  () => void
    finalizarTour: () => void
    saltarTour:   () => void
}

const Ctx = createContext<SentinelCtx | null>(null)

export function SentinelProvider({ children }: { children: ReactNode }) {
    const { user, empresa } = useAuth() as any
    const navigate = useNavigate()
    const [tourActivo,    setTourActivo]    = useState<MisionConPasos | null>(null)
    const [pasoActual,    setPasoActual]    = useState(0)
    const [iniciandoTour, setIniciandoTour] = useState(false)

    const iniciarTour = useCallback(async (misionId: string) => {
        setIniciandoTour(true)
        try {
            const mision = await getMisionConPasos(misionId)
            navigate(mision.ruta)
            // Pequeño delay para que la navegación se asiente antes de buscar elementos
            await new Promise(r => setTimeout(r, 120))
            setTourActivo(mision)
            setPasoActual(0)
            if (user?.id && empresa?.id) {
                upsertProgreso(user.id, empresa.id, misionId, false, 0)
            }
        } finally {
            setIniciandoTour(false)
        }
    }, [user, empresa, navigate])

    const avanzarPaso = useCallback(() => {
        if (!tourActivo) return
        const siguiente = pasoActual + 1
        if (siguiente >= tourActivo.pasos.length) {
            if (user?.id && empresa?.id) {
                upsertProgreso(user.id, empresa.id, tourActivo.id, true, siguiente)
            }
            setTourActivo(null)
            setPasoActual(0)
        } else {
            if (tourActivo.pasos[siguiente].ruta) {
                navigate(tourActivo.pasos[siguiente].ruta!)
            }
            setPasoActual(siguiente)
            if (user?.id && empresa?.id) {
                upsertProgreso(user.id, empresa.id, tourActivo.id, false, siguiente)
            }
        }
    }, [tourActivo, pasoActual, user, empresa, navigate])

    const finalizarTour = useCallback(() => {
        if (tourActivo && user?.id && empresa?.id) {
            upsertProgreso(user.id, empresa.id, tourActivo.id, true, tourActivo.pasos.length)
        }
        setTourActivo(null)
        setPasoActual(0)
    }, [tourActivo, user, empresa])

    const saltarTour = useCallback(() => {
        setTourActivo(null)
        setPasoActual(0)
    }, [])

    return (
        <Ctx.Provider value={{ tourActivo, pasoActual, iniciandoTour, iniciarTour, avanzarPaso, finalizarTour, saltarTour }}>
            {children}
        </Ctx.Provider>
    )
}

export function useSentinel() {
    const ctx = useContext(Ctx)
    if (!ctx) throw new Error('useSentinel debe usarse dentro de SentinelProvider')
    return ctx
}
