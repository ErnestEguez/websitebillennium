import { useEffect, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, X, CheckCircle2 } from 'lucide-react'
import { useSentinel } from '../../contexts/SentinelContext'

interface TargetRect {
    top: number
    left: number
    width: number
    height: number
}

const TOOLTIP_W = 300
const TOOLTIP_H = 175
const PAD = 14

function calcTooltipPos(rect: TargetRect | null, viewW: number, viewH: number) {
    if (!rect) return { top: viewH / 2 - TOOLTIP_H / 2, left: viewW / 2 - TOOLTIP_W / 2 }

    const spaceBelow = viewH - (rect.top + rect.height)
    const top = spaceBelow >= TOOLTIP_H + PAD
        ? rect.top + rect.height + PAD
        : rect.top - TOOLTIP_H - PAD

    const left = Math.max(PAD, Math.min(rect.left, viewW - TOOLTIP_W - PAD))
    return { top, left }
}

export function GuidedTour() {
    const { tourActivo, pasoActual, avanzarPaso, finalizarTour, saltarTour } = useSentinel()
    const [targetRect, setTargetRect] = useState<TargetRect | null>(null)
    const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const paso = tourActivo?.pasos[pasoActual]

    // Localizar el elemento data-sentinel en el DOM
    useEffect(() => {
        if (!paso) { setTargetRect(null); return }

        const buscar = () => {
            const el = document.querySelector(`[data-sentinel="${paso.target}"]`)
            if (!el) return false
            const r = el.getBoundingClientRect()
            setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height })

            // Para acciones de click: avanzar automáticamente al hacer clic en el elemento
            if (paso.accion === 'click') {
                const handler = () => {
                    setTimeout(() => avanzarPaso(), 80)
                }
                el.addEventListener('click', handler, { once: true })
            }
            return true
        }

        setTargetRect(null)
        if (!buscar()) {
            // Reintentar — el elemento puede llegar después de la navegación
            retryRef.current = setTimeout(() => {
                if (!buscar()) setTimeout(buscar, 400)
            }, 200)
        }

        const onResize = () => buscar()
        window.addEventListener('resize', onResize)

        return () => {
            if (retryRef.current) clearTimeout(retryRef.current)
            window.removeEventListener('resize', onResize)
        }
    }, [paso, avanzarPaso])

    if (!tourActivo || !paso) return null

    const total    = tourActivo.pasos.length
    const progreso = Math.round((pasoActual / total) * 100)
    const esFinal  = pasoActual === total - 1

    const { top, left } = calcTooltipPos(targetRect, window.innerWidth, window.innerHeight)

    return createPortal(
        <>
            {/* Overlay con "spotlight": box-shadow gigante sobre el elemento resaltado */}
            {targetRect && (
                <div
                    className="fixed z-[9999] rounded-lg pointer-events-none transition-all duration-300"
                    style={{
                        top:    targetRect.top    - 5,
                        left:   targetRect.left   - 5,
                        width:  targetRect.width  + 10,
                        height: targetRect.height + 10,
                        boxShadow: '0 0 0 4px #6366f1, 0 0 0 9999px rgba(0,0,0,0.45)',
                        borderRadius: 8,
                    }}
                />
            )}
            {/* Fallback overlay cuando no se encontró el elemento */}
            {!targetRect && (
                <div className="fixed inset-0 z-[9998] bg-black/40 pointer-events-none" />
            )}

            {/* Tarjeta tooltip */}
            <div
                className="fixed z-[10000] bg-white rounded-2xl shadow-2xl border border-indigo-100 p-4 flex flex-col gap-2"
                style={{ top, left, width: TOOLTIP_W }}
            >
                {/* Cabecera */}
                <div className="flex items-start justify-between gap-2">
                    <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest leading-tight">
                        {tourActivo.nombre}
                    </span>
                    <button
                        onClick={saltarTour}
                        className="text-slate-400 hover:text-slate-600 shrink-0 -mt-0.5"
                        title="Cerrar guía"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Contenido del paso */}
                <div>
                    <p className="text-sm font-bold text-slate-800 leading-snug">{paso.titulo}</p>
                    <p className="text-sm text-slate-500 mt-0.5 leading-snug">{paso.texto}</p>
                </div>

                {/* Barra de progreso */}
                <div className="w-full bg-slate-100 rounded-full h-1">
                    <div
                        className="bg-indigo-500 h-1 rounded-full transition-all duration-500"
                        style={{ width: `${progreso}%` }}
                    />
                </div>

                {/* Pie */}
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-400">Paso {pasoActual + 1} de {total}</span>

                    <div className="flex items-center gap-2">
                        {paso.accion !== 'click' ? (
                            <button
                                onClick={esFinal ? finalizarTour : avanzarPaso}
                                className="flex items-center gap-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors"
                            >
                                {esFinal
                                    ? <><CheckCircle2 className="w-3.5 h-3.5" /> Completar</>
                                    : <>Siguiente <ChevronRight className="w-3.5 h-3.5" /></>
                                }
                            </button>
                        ) : (
                            <span className="text-[11px] text-indigo-400 italic">
                                Haz clic en el elemento resaltado
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </>,
        document.body
    )
}
