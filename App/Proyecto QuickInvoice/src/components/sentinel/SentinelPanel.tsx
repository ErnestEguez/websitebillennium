import { useState, useEffect } from 'react'
import { Compass, CheckCircle2, Circle, ChevronRight, X, Loader2, Trophy } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useSentinel } from '../../contexts/SentinelContext'
import { getMisiones, getProgreso } from '../../services/sentinelService'
import type { MisionMeta, ProgresoMision } from '../../types/sentinel'

function agrupar(misiones: MisionMeta[]): Record<string, MisionMeta[]> {
    return misiones.reduce((acc, m) => {
        acc[m.modulo] = acc[m.modulo] ? [...acc[m.modulo], m] : [m]
        return acc
    }, {} as Record<string, MisionMeta[]>)
}

export function SentinelPanel({ isSidebarOpen }: { isSidebarOpen: boolean }) {
    const { user, empresa } = useAuth() as any
    const { iniciarTour, iniciandoTour } = useSentinel()

    const [abierto,   setAbierto]   = useState(false)
    const [misiones,  setMisiones]  = useState<MisionMeta[]>([])
    const [progreso,  setProgreso]  = useState<ProgresoMision[]>([])
    const [cargando,  setCargando]  = useState(false)
    const [iniciando, setIniciando] = useState<string | null>(null)

    useEffect(() => {
        if (!abierto || !user?.id || !empresa?.id) return
        setCargando(true)
        Promise.all([getMisiones(), getProgreso(user.id, empresa.id)])
            .then(([ms, pr]) => { setMisiones(ms); setProgreso(pr) })
            .finally(() => setCargando(false))
    }, [abierto, user?.id, empresa?.id])

    const completadas = progreso.filter(p => p.completada).length
    const pct = misiones.length ? Math.round((completadas / misiones.length) * 100) : 0
    const estaCompleta = (id: string) => progreso.find(p => p.mision_id === id)?.completada ?? false
    const grupos = agrupar(misiones)

    async function handleIniciar(misionId: string) {
        setIniciando(misionId)
        setAbierto(false)
        try {
            await iniciarTour(misionId)
        } finally {
            setIniciando(null)
        }
    }

    return (
        <>
            {/* Botón disparador en el sidebar */}
            <button
                onClick={() => setAbierto(true)}
                title="Guía Sentinel"
                className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg transition-colors text-slate-600 hover:bg-indigo-50 hover:text-indigo-700"
            >
                <Compass className="w-5 h-5 shrink-0 text-indigo-400" />
                {isSidebarOpen && <span className="text-sm">Guía Sentinel</span>}
                {isSidebarOpen && pct > 0 && pct < 100 && (
                    <span className="ml-auto text-[10px] font-bold text-indigo-400">{pct}%</span>
                )}
                {isSidebarOpen && pct === 100 && (
                    <Trophy className="ml-auto w-3.5 h-3.5 text-yellow-400" />
                )}
            </button>

            {/* Panel deslizable */}
            {abierto && (
                <div className="fixed inset-0 z-[9990] flex justify-end">
                    {/* Backdrop */}
                    <div
                        className="absolute inset-0 bg-black/30"
                        onClick={() => setAbierto(false)}
                    />

                    {/* Panel */}
                    <div className="relative w-[340px] h-full bg-white shadow-2xl flex flex-col">
                        {/* Cabecera */}
                        <div className="bg-gradient-to-br from-indigo-700 to-indigo-500 px-5 py-5 text-white shrink-0">
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                    <Compass className="w-5 h-5" />
                                    <span className="font-bold text-lg tracking-tight">Sentinel</span>
                                </div>
                                <button onClick={() => setAbierto(false)} className="text-indigo-200 hover:text-white">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <p className="text-indigo-200 text-xs">Guía interactiva de QuickInvoice</p>

                            {misiones.length > 0 && (
                                <div className="mt-3">
                                    <div className="flex justify-between text-xs text-indigo-200 mb-1.5">
                                        <span>{completadas} de {misiones.length} misiones completadas</span>
                                        <span className="font-bold">{pct}%</span>
                                    </div>
                                    <div className="w-full bg-white/20 rounded-full h-1.5">
                                        <div
                                            className="bg-white h-1.5 rounded-full transition-all duration-700"
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Lista de misiones */}
                        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
                            {cargando ? (
                                <div className="flex justify-center py-10">
                                    <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                                </div>
                            ) : (
                                Object.entries(grupos).map(([modulo, items]) => (
                                    <div key={modulo}>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-2 mb-1.5">
                                            {modulo}
                                        </p>
                                        <div className="space-y-1">
                                            {items.map(m => {
                                                const completa   = estaCompleta(m.id)
                                                const cargandoM  = iniciando === m.id || (iniciandoTour && iniciando === m.id)
                                                return (
                                                    <button
                                                        key={m.id}
                                                        onClick={() => handleIniciar(m.id)}
                                                        disabled={cargandoM}
                                                        className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${
                                                            completa
                                                                ? 'bg-green-50 hover:bg-green-100'
                                                                : 'hover:bg-indigo-50'
                                                        } disabled:opacity-60`}
                                                    >
                                                        {cargandoM ? (
                                                            <Loader2 className="w-5 h-5 shrink-0 text-indigo-400 animate-spin mt-0.5" />
                                                        ) : completa ? (
                                                            <CheckCircle2 className="w-5 h-5 shrink-0 text-green-500 mt-0.5" />
                                                        ) : (
                                                            <Circle className="w-5 h-5 shrink-0 text-slate-300 mt-0.5" />
                                                        )}
                                                        <div className="flex-1 min-w-0">
                                                            <p className={`text-sm font-semibold leading-tight ${completa ? 'text-green-700 line-through' : 'text-slate-700'}`}>
                                                                {m.nombre}
                                                            </p>
                                                            <p className="text-xs text-slate-400 mt-0.5 leading-snug">{m.descripcion}</p>
                                                        </div>
                                                        <ChevronRight className="w-4 h-4 shrink-0 text-slate-300 mt-1" />
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Pie */}
                        <div className="px-4 py-3 border-t bg-slate-50 shrink-0">
                            <p className="text-[11px] text-slate-400 text-center">
                                Haz clic en una misión para iniciar el tour interactivo
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
