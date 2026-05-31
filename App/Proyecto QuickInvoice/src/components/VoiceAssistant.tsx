import { useState, useRef, useEffect } from 'react'
import {
    Mic, MicOff, X, CheckCircle2, AlertCircle,
    Loader2, Volume2, User, Package, Briefcase,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { cn } from '../lib/utils'

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface VoiceResultItem {
    existe: boolean
    id: string | null
    nombre: string
    cantidad: number
    precio_unitario: number
    iva_porcentaje: number
}

export interface VoiceResultCliente {
    existe: boolean
    id: string | null
    nombre: string
    identificacion: string | null
}

export interface VoiceResult {
    tipo: 'servicios' | 'inventario' | 'desconocido'
    cliente: VoiceResultCliente
    item: VoiceResultItem
    datos_faltantes: string[]
    accion_siguiente: string
    requiere_confirmacion: boolean
    resumen: string
}

interface Props {
    clientes: any[]
    servicios: any[]
    onApply: (result: VoiceResult) => void
}

// ── Tipos SpeechRecognition (no están en TypeScript por defecto) ───────────
declare global {
    interface Window {
        SpeechRecognition: any
        webkitSpeechRecognition: any
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: string }) {
    return (
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', color)}>
            {label}
        </span>
    )
}

// ── Componente principal ───────────────────────────────────────────────────

export function VoiceAssistant({ clientes, servicios, onApply }: Props) {
    const [open, setOpen] = useState(false)
    const [grabando, setGrabando] = useState(false)
    const [transcripcion, setTranscripcion] = useState('')
    const [procesando, setProcesando] = useState(false)
    const [resultado, setResultado] = useState<VoiceResult | null>(null)
    const [error, setError] = useState('')
    const [soportado, setSoportado] = useState(true)

    const recognitionRef = useRef<any>(null)

    useEffect(() => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition
        if (!SR) { setSoportado(false); return }

        const recognition = new SR()
        recognition.lang = 'es-EC'
        recognition.interimResults = true
        recognition.maxAlternatives = 1
        recognition.continuous = false

        recognition.onresult = (event: any) => {
            let texto = ''
            for (let i = event.resultIndex; i < event.results.length; i++) {
                texto += event.results[i][0].transcript
            }
            setTranscripcion(texto)
        }

        recognition.onend = () => {
            setGrabando(false)
        }

        recognition.onerror = (event: any) => {
            if (event.error !== 'no-speech') {
                setError(`Error de micrófono: ${event.error}`)
            }
            setGrabando(false)
        }

        recognitionRef.current = recognition
    }, [])

    function toggleGrabacion() {
        if (!soportado) {
            setError('Tu navegador no soporta reconocimiento de voz. Usa Chrome o Edge.')
            return
        }
        if (grabando) {
            recognitionRef.current?.stop()
            setGrabando(false)
        } else {
            setTranscripcion('')
            setResultado(null)
            setError('')
            recognitionRef.current?.start()
            setGrabando(true)
        }
    }

    async function procesarTranscripcion() {
        if (!transcripcion.trim()) return
        setProcesando(true)
        setError('')
        setResultado(null)

        try {
            const { data, error: fnError } = await supabase.functions.invoke('voice-assistant', {
                body: {
                    transcripcion: transcripcion.trim(),
                    clientes,
                    servicios,
                },
            })

            if (fnError) throw new Error(fnError.message)
            if (data?.error) throw new Error(data.error)

            setResultado(data as VoiceResult)
        } catch (e: any) {
            setError(e.message || 'Error al procesar la solicitud')
        } finally {
            setProcesando(false)
        }
    }

    function handleApply() {
        if (!resultado) return
        onApply(resultado)
        setOpen(false)
        setResultado(null)
        setTranscripcion('')
    }

    // ── Render ─────────────────────────────────────────────────────────────

    return (
        <>
            {/* Botón flotante */}
            <button
                onClick={() => setOpen(true)}
                title="Asistente de voz"
                className={cn(
                    'fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full shadow-lg',
                    'flex items-center justify-center transition-all duration-200',
                    'bg-primary-600 hover:bg-primary-700 text-white',
                    'hover:scale-110 active:scale-95'
                )}
            >
                <Mic className="w-6 h-6" />
            </button>

            {/* Modal */}
            {open && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                                    <Volume2 className="w-4 h-4 text-primary-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900 text-sm">Asistente de Voz</h3>
                                    <p className="text-xs text-slate-400">QuickInvoice</p>
                                </div>
                            </div>
                            <button onClick={() => { setOpen(false); recognitionRef.current?.stop() }}
                                className="text-slate-400 hover:text-slate-600 p-1">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Cuerpo */}
                        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

                            {/* Instrucción */}
                            {!resultado && (
                                <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3">
                                    Ejemplo: <em>"Elaborar factura de servicios para Juan Pérez por consultoría técnica a 150 dólares, cantidad 1, con IVA"</em>
                                </p>
                            )}

                            {/* Botón grabar */}
                            <div className="flex flex-col items-center gap-3">
                                <button
                                    onClick={toggleGrabacion}
                                    disabled={procesando}
                                    className={cn(
                                        'w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200',
                                        grabando
                                            ? 'bg-red-500 hover:bg-red-600 animate-pulse shadow-lg shadow-red-200'
                                            : 'bg-primary-600 hover:bg-primary-700 shadow-lg',
                                        procesando && 'opacity-40 cursor-not-allowed'
                                    )}
                                >
                                    {grabando
                                        ? <MicOff className="w-8 h-8 text-white" />
                                        : <Mic className="w-8 h-8 text-white" />
                                    }
                                </button>
                                <p className="text-xs text-slate-500">
                                    {grabando ? '🔴 Grabando... (clic para detener)' : 'Clic para hablar'}
                                </p>
                            </div>

                            {/* Transcripción */}
                            {(transcripcion || grabando) && (
                                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                                    <p className="text-xs text-slate-400 mb-1 font-medium">Transcripción:</p>
                                    <p className="text-sm text-slate-700 min-h-[40px]">
                                        {transcripcion || <span className="text-slate-400 italic">Escuchando...</span>}
                                    </p>
                                    {transcripcion && !grabando && !resultado && (
                                        <div className="flex gap-2 mt-3">
                                            <button
                                                onClick={procesarTranscripcion}
                                                disabled={procesando}
                                                className="btn btn-primary text-xs gap-1.5 flex-1"
                                            >
                                                {procesando
                                                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Procesando...</>
                                                    : <><CheckCircle2 className="w-3.5 h-3.5" /> Interpretar</>
                                                }
                                            </button>
                                            <button
                                                onClick={() => { setTranscripcion(''); setResultado(null) }}
                                                className="btn border border-slate-200 text-slate-500 text-xs px-3"
                                            >
                                                Borrar
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Error */}
                            {error && (
                                <div className="flex items-start gap-2 text-red-600 bg-red-50 rounded-lg p-3">
                                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <p className="text-xs">{error}</p>
                                </div>
                            )}

                            {/* Resultado estructurado */}
                            {resultado && (
                                <div className="space-y-3">
                                    {/* Resumen */}
                                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                                        <p className="text-xs text-blue-700">{resultado.resumen}</p>
                                    </div>

                                    {/* Campos */}
                                    <div className="space-y-2">
                                        <Row label="Tipo de factura">
                                            {resultado.tipo === 'servicios' && <Badge label="Servicios" color="bg-blue-100 text-blue-700" />}
                                            {resultado.tipo === 'inventario' && <Badge label="Inventario" color="bg-green-100 text-green-700" />}
                                            {resultado.tipo === 'desconocido' && <Badge label="Sin definir" color="bg-slate-100 text-slate-600" />}
                                        </Row>

                                        <Row label="Cliente" icon={<User className="w-3.5 h-3.5" />}>
                                            <span className="text-sm font-medium text-slate-800">
                                                {resultado.cliente.nombre || '—'}
                                            </span>
                                            {resultado.cliente.existe
                                                ? <Badge label="Existe" color="bg-green-100 text-green-700" />
                                                : <Badge label="No existe" color="bg-red-100 text-red-600" />
                                            }
                                        </Row>

                                        {resultado.tipo !== 'inventario' && (
                                            <Row label="Ítem" icon={<Briefcase className="w-3.5 h-3.5" />}>
                                                <span className="text-sm text-slate-700 flex-1">
                                                    {resultado.item.nombre || '—'}
                                                </span>
                                                {resultado.item.existe && <Badge label="En sistema" color="bg-green-100 text-green-700" />}
                                            </Row>
                                        )}

                                        {resultado.tipo === 'inventario' && (
                                            <Row label="Ítem" icon={<Package className="w-3.5 h-3.5" />}>
                                                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                                                    Seleccionar del inventario manualmente
                                                </span>
                                            </Row>
                                        )}

                                        <Row label="Cantidad">
                                            <span className="text-sm font-semibold">{resultado.item.cantidad}</span>
                                        </Row>

                                        <Row label="Precio unitario">
                                            <span className="text-sm font-semibold">
                                                ${resultado.item.precio_unitario.toFixed(2)}
                                            </span>
                                        </Row>

                                        <Row label="IVA">
                                            {resultado.item.iva_porcentaje > 0
                                                ? <Badge label={`${resultado.item.iva_porcentaje}%`} color="bg-amber-100 text-amber-700" />
                                                : <Badge label="0% — Sin IVA" color="bg-slate-100 text-slate-600" />
                                            }
                                        </Row>
                                    </div>

                                    {/* Datos faltantes */}
                                    {resultado.datos_faltantes.length > 0 && (
                                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                                            <p className="text-xs font-semibold text-amber-700 mb-1">Datos faltantes:</p>
                                            <ul className="space-y-0.5">
                                                {resultado.datos_faltantes.map(d => (
                                                    <li key={d} className="text-xs text-amber-600">• {d}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {/* Acción siguiente */}
                                    <p className="text-xs text-slate-500 italic">{resultado.accion_siguiente}</p>
                                </div>
                            )}
                        </div>

                        {/* Footer con botón Aplicar */}
                        {resultado && resultado.tipo !== 'desconocido' && (
                            <div className="px-5 py-4 border-t border-slate-100 flex gap-3">
                                <button
                                    onClick={handleApply}
                                    className="btn btn-primary flex-1 gap-2"
                                >
                                    <CheckCircle2 className="w-4 h-4" />
                                    Aplicar a factura
                                </button>
                                <button
                                    onClick={() => { setResultado(null); setTranscripcion('') }}
                                    className="btn border border-slate-200 text-slate-500 px-4"
                                >
                                    Reintentar
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    )
}

// ── Sub-componente fila ────────────────────────────────────────────────────

function Row({ label, icon, children }: {
    label: string
    icon?: React.ReactNode
    children: React.ReactNode
}) {
    return (
        <div className="flex items-center gap-2 py-1.5 border-b border-slate-50 last:border-0">
            <span className="text-xs text-slate-400 w-28 shrink-0 flex items-center gap-1">
                {icon}{label}
            </span>
            <div className="flex items-center gap-2 flex-wrap flex-1">
                {children}
            </div>
        </div>
    )
}
