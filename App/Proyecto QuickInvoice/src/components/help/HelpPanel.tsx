import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X, Minus, GripHorizontal, HelpCircle, ChevronDown, ChevronRight, AlertTriangle, Lightbulb } from 'lucide-react'
import { AYUDA } from '../../data/helpContent'

interface Props {
    pageKey: string
    onClose: () => void
}

const PANEL_W = 400
const PANEL_H_MAX = Math.round(window.innerHeight * 0.72)

export function HelpPanel({ pageKey, onClose }: Props) {
    const contenido = AYUDA[pageKey]
    const dragRef = useRef<{ dragging: boolean; ox: number; oy: number }>({ dragging: false, ox: 0, oy: 0 })

    // Posición inicial: esquina superior derecha con margen
    const [pos, setPos]         = useState({ x: Math.max(0, window.innerWidth - PANEL_W - 24), y: 80 })
    const [minimizado, setMin]  = useState(false)
    const [abiertos, setAbiertos] = useState<number[]>([0])  // primera sección abierta por defecto

    // ── Drag ──────────────────────────────────────────────────────────────
    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!dragRef.current.dragging) return
            const nx = Math.max(0, Math.min(e.clientX - dragRef.current.ox, window.innerWidth  - PANEL_W))
            const ny = Math.max(0, Math.min(e.clientY - dragRef.current.oy, window.innerHeight - 60))
            setPos({ x: nx, y: ny })
        }
        const onUp = () => { dragRef.current.dragging = false }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup',   onUp)
        return () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup',   onUp)
        }
    }, [])

    const startDrag = (e: React.MouseEvent) => {
        e.preventDefault()
        dragRef.current = { dragging: true, ox: e.clientX - pos.x, oy: e.clientY - pos.y }
    }

    const toggleSeccion = (i: number) =>
        setAbiertos(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])

    if (!contenido) return null

    return createPortal(
        <div
            className="fixed z-[9990] bg-white rounded-2xl shadow-2xl border border-indigo-100 flex flex-col overflow-hidden"
            style={{ width: PANEL_W, top: pos.y, left: pos.x, maxHeight: minimizado ? 'auto' : PANEL_H_MAX }}
        >
            {/* ── Barra de título (arrastrable) ───────────────────────────── */}
            <div
                onMouseDown={startDrag}
                className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-indigo-700 to-indigo-500 text-white cursor-grab active:cursor-grabbing select-none shrink-0 rounded-t-2xl"
            >
                <GripHorizontal className="w-4 h-4 text-indigo-300 shrink-0" />
                <HelpCircle className="w-4 h-4 shrink-0" />
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{contenido.titulo}</p>
                </div>
                <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={() => setMin(m => !m)}
                    className="p-1 hover:bg-white/20 rounded transition-colors"
                    title={minimizado ? 'Expandir' : 'Minimizar'}
                >
                    <Minus className="w-4 h-4" />
                </button>
                <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={onClose}
                    className="p-1 hover:bg-white/20 rounded transition-colors"
                    title="Cerrar"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* ── Contenido (colapsable vía minimizar) ────────────────────── */}
            {!minimizado && (
                <>
                    {/* Subtítulo */}
                    <div className="px-4 pt-3 pb-1 bg-indigo-50/60 border-b border-indigo-100 shrink-0">
                        <p className="text-xs text-indigo-600 font-medium">{contenido.subtitulo}</p>
                    </div>

                    {/* Secciones acordeón */}
                    <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                        {contenido.secciones.map((sec, i) => {
                            const isOpen = abiertos.includes(i)
                            return (
                                <div key={i}>
                                    <button
                                        onClick={() => toggleSeccion(i)}
                                        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors"
                                    >
                                        {isOpen
                                            ? <ChevronDown  className="w-4 h-4 text-indigo-400 shrink-0" />
                                            : <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                                        }
                                        <span className={`text-sm font-semibold ${isOpen ? 'text-indigo-700' : 'text-slate-700'}`}>
                                            {sec.titulo}
                                        </span>
                                    </button>

                                    {isOpen && (
                                        <div className="px-4 pb-4 space-y-3">
                                            {/* Texto principal — soporte para saltos de línea con \n */}
                                            <div className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                                                {sec.texto}
                                            </div>

                                            {/* Tips */}
                                            {sec.tips && sec.tips.length > 0 && (
                                                <div className="bg-indigo-50 rounded-xl p-3 space-y-1.5">
                                                    <div className="flex items-center gap-1.5 text-indigo-600 text-xs font-bold mb-1">
                                                        <Lightbulb className="w-3.5 h-3.5" />
                                                        Consejos
                                                    </div>
                                                    {sec.tips.map((tip, j) => (
                                                        <p key={j} className="text-xs text-indigo-700 leading-snug flex gap-1.5">
                                                            <span className="text-indigo-400 shrink-0">→</span>
                                                            {tip}
                                                        </p>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Alerta */}
                                            {sec.alerta && (
                                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
                                                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                                    <p className="text-xs text-amber-700 leading-snug">{sec.alerta}</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>

                    {/* Pie */}
                    <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 shrink-0">
                        <p className="text-[10px] text-slate-400 text-center">
                            Puedes mover esta ventana · QuickInvoice Ayuda
                        </p>
                    </div>
                </>
            )}
        </div>,
        document.body
    )
}
