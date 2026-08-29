import { useState, useRef, useEffect } from 'react'
import {
    Mic, MicOff, X, CheckCircle2, AlertCircle,
    Volume2, User, Briefcase, Package, Loader2,
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
    empresaId: string
}

declare global {
    interface Window {
        SpeechRecognition: any
        webkitSpeechRecognition: any
    }
}

// ── Parser de patrones (sin API externa) ───────────────────────────────────

function normalizar(texto: string): string {
    return texto
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
}

function extraerNumero(texto: string, patrones: RegExp[]): number {
    for (const p of patrones) {
        const m = texto.match(p)
        if (m) return parseFloat((m[1] || m[2] || '0').replace(',', '.'))
    }
    return 0
}

function buscarEnLista(nombre: string, lista: any[]): any | null {
    if (!nombre.trim()) return null
    const n = normalizar(nombre)
    // Coincidencia exacta primero
    let found = lista.find(x => normalizar(x.nombre ?? '') === n)
    if (found) return found
    // Coincidencia parcial
    found = lista.find(x =>
        normalizar(x.nombre ?? '').includes(n) || n.includes(normalizar(x.nombre ?? ''))
    )
    return found ?? null
}

function normalizarCedula(texto: string): string {
    // Convierte "09 07 388268" o "cero nueve cero siete..." → "0907388268"
    return texto.replace(/\s+/g, '').replace(/[^0-9]/g, '')
}

function parsearTranscripcion(texto: string, clientes: any[], servicios: any[]): VoiceResult {
    const t = normalizar(texto)

    // ── 1. Tipo de factura ─────────────────────────────────────────────────
    let tipo: 'servicios' | 'inventario' | 'desconocido' = 'desconocido'
    if (/\bservicio(s)?\b/.test(t)) tipo = 'servicios'
    else if (/\binventario(s)?\b|\bproducto(s)?\b/.test(t)) tipo = 'inventario'
    else if (/\bprecio\b|\bdolar(es)?\b|\bcantidad\b|\bvalor\b/.test(t)) tipo = 'servicios'

    // ── 2. Cédula / RUC (extraer antes del nombre para no confundirla) ─────
    let identificacion: string | null = null
    const cedMatch = t.match(/cedula(?:\s+numero)?\s+([\d\s]{8,20})/)
        ?? t.match(/ruc(?:\s+numero)?\s+([\d\s]{10,20})/)
    if (cedMatch?.[1]) {
        identificacion = normalizarCedula(cedMatch[1]).slice(0, 13)
    }
    // Buscar cliente por identificación primero
    let clienteEncontradoPorId = identificacion
        ? clientes.find(c => (c.identificacion ?? '').replace(/\D/g,'') === identificacion)
        : null

    // ── 3. Nombre del cliente ──────────────────────────────────────────────
    let clienteNombre = ''
    const clientePatrones = [
        /a nombre de\s+([a-z\s]{3,40}?)(?:\s+cedula|\s+ruc|\s+concepto|\s+por\b|\s*$)/,
        /para el cliente\s+([a-z\s]{3,40}?)(?:\s+cedula|\s+ruc|\s+concepto|\s+por\b|\s*$)/,
        /cliente\s+([a-z\s]{3,40}?)(?:\s+cedula|\s+ruc|\s+concepto|\s+por\b|\s*$)/,
        /\bpara\s+([a-z\s]{3,40}?)(?:\s+cedula|\s+ruc|\s+concepto|\s+por\b|\s*$)/,
    ]
    for (const p of clientePatrones) {
        const m = t.match(p)
        const cand = m?.[1]?.trim() ?? ''
        if (cand.length > 2) {
            clienteNombre = cand.replace(/^(el|la|los|las|un|una|al)\s+/, '').trim()
            break
        }
    }

    const clienteEncontrado = clienteEncontradoPorId
        ?? buscarEnLista(clienteNombre, clientes)

    // ── 4. Descripción del ítem ────────────────────────────────────────────
    let itemNombre = ''
    const PRECIO_STOP = /\s+valor\b|\s+precio\b|\s+a\s+\d|\s+cantidad\b|\s+con\b|\s+sin\b|\s+\d{2,}|\s*$/
    const itemPatrones = [
        new RegExp('concepto\\s+(.+?)(?:' + PRECIO_STOP.source + ')'),
        new RegExp('por (?:el )?(?:concepto|servicio|producto)\\s+(.+?)(?:' + PRECIO_STOP.source + ')'),
        new RegExp('(?:servicio|producto)\\s+(.+?)(?:' + PRECIO_STOP.source + ')'),
        new RegExp('por\\s+(.+?)(?:\\s+a\\s+(?:un\\s+)?precio\\b|' + PRECIO_STOP.source + ')'),
    ]
    for (const p of itemPatrones) {
        const m = t.match(p)
        const candidato = m?.[1]?.trim() ?? ''
        if (candidato.length > 2) {
            // Quitar artículos iniciales y cualquier número/precio que se haya colado al final
            itemNombre = candidato
                .replace(/^(el|la|los|las|un|una)\s+/, '')
                .replace(/\s*[\d]+[.,]?[\d]*\s*(dolar|dolares|usd|con iva|sin iva)?\s*$/i, '')
                .trim()
            break
        }
    }

    const itemEncontrado = tipo !== 'inventario' ? buscarEnLista(itemNombre, servicios) : null

    // ── 5. Precio ──────────────────────────────────────────────────────────
    const precio = extraerNumero(t, [
        /precio unitario de\s+([\d]+[.,]?[\d]*)/,
        /precio de\s+([\d]+[.,]?[\d]*)/,
        /valor\s+([\d]+[.,]?[\d]*)/,
        /monto\s+([\d]+[.,]?[\d]*)/,
        /a\s+([\d]+[.,]?[\d]*)\s*(?:con|sin|iva|dolar|\s*$)/,  // "a 150 con IVA"
        /a\s+([\d]+[.,]?[\d]*)\s*dolar/,
        /precio\s+([\d]+[.,]?[\d]*)/,
        /unitario\s+([\d]+[.,]?[\d]*)/,
        /([\d]+[.,][\d]+)\s*(?:con|sin|iva|dolar)/,            // "150.00 con IVA"
        /([\d]{2,})\s*(?:con\s+iva|sin\s+iva)/,               // "150 con IVA"
        /([\d]+[.,][\d]+)\s*dolar/,
        /([\d]{2,})\s*dolar/,
    ])

    // ── 6. Cantidad ────────────────────────────────────────────────────────
    const cantidad = extraerNumero(t, [
        /cantidad\s+(\d+)/,
        /(\d+)\s+unidades?/,
        /(\d+)\s+items?/,
    ]) || 1

    // ── 7. IVA ─────────────────────────────────────────────────────────────
    let ivaPorcentaje = 15
    if (/sin\s+iva/.test(t)) ivaPorcentaje = 0
    else if (/con\s+iva/.test(t)) ivaPorcentaje = 15

    // ── 8. Datos faltantes ─────────────────────────────────────────────────
    const faltantes: string[] = []
    if (!clienteNombre && !clienteEncontrado) faltantes.push('Nombre del cliente')
    if (tipo === 'servicios' && !itemNombre) faltantes.push('Descripción del servicio')
    if (tipo === 'servicios' && !precio) faltantes.push('Precio unitario')
    if (tipo === 'desconocido') faltantes.push('Tipo de factura (servicios o inventario)')

    // ── 9. Resumen ─────────────────────────────────────────────────────────
    const nombreMostrar = clienteEncontrado?.nombre ?? clienteNombre
    const partes: string[] = []
    if (tipo !== 'desconocido') partes.push(`Factura de ${tipo}`)
    if (nombreMostrar) partes.push(`cliente: ${nombreMostrar}${clienteEncontrado ? ' ✓' : ' (nuevo)'}`)
    if (itemNombre) partes.push(`ítem: ${itemNombre}${itemEncontrado ? ' ✓' : ''}`)
    if (precio) partes.push(`precio: $${precio.toFixed(2)} × ${cantidad}`)
    partes.push(ivaPorcentaje > 0 ? `IVA ${ivaPorcentaje}%` : 'Sin IVA')
    const resumen = partes.join(' | ')

    return {
        tipo,
        cliente: {
            existe: !!clienteEncontrado,
            id: clienteEncontrado?.id ?? null,
            nombre: clienteEncontrado?.nombre ?? clienteNombre,
            identificacion: clienteEncontrado?.identificacion ?? identificacion,
        },
        item: {
            existe: !!itemEncontrado,
            id: itemEncontrado?.id ?? null,
            nombre: itemNombre || (itemEncontrado?.nombre ?? ''),
            cantidad,
            precio_unitario: precio || (itemEncontrado?.precio_venta ?? 0),
            iva_porcentaje: ivaPorcentaje,
        },
        datos_faltantes: faltantes,
        accion_siguiente: faltantes.length === 0
            ? 'Datos completos. Revisa y haz clic en "Aplicar a factura".'
            : `Falta: ${faltantes.join(', ')}.`,
        requiere_confirmacion: true,
        resumen,
    }
}

// ── Componente ─────────────────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: string }) {
    return (
        <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', color)}>
            {label}
        </span>
    )
}

function Row({ label, icon, children }: {
    label: string; icon?: React.ReactNode; children: React.ReactNode
}) {
    return (
        <div className="flex items-center gap-2 py-1.5 border-b border-slate-50 last:border-0">
            <span className="text-xs text-slate-400 w-28 shrink-0 flex items-center gap-1">
                {icon}{label}
            </span>
            <div className="flex items-center gap-2 flex-wrap flex-1">{children}</div>
        </div>
    )
}

export function VoiceAssistant({ clientes, servicios, onApply, empresaId }: Props) {
    const [open, setOpen]               = useState(false)
    const [grabando, setGrabando]       = useState(false)
    const [procesando, setProcesando]   = useState(false)
    const [usandoIA, setUsandoIA]       = useState(false)
    const [silencio, setSilencio]       = useState(0) // segundos de silencio restantes
    const [transcripcion, setTranscripcion] = useState('')
    const [resultado, setResultado]     = useState<VoiceResult | null>(null)
    const [error, setError]             = useState('')
    const [soportado, setSoportado]     = useState(true)
    const recognitionRef                = useRef<any>(null)
    const silenceTimerRef               = useRef<ReturnType<typeof setTimeout> | null>(null)
    const silenceCountRef               = useRef<ReturnType<typeof setInterval> | null>(null)
    const transcripcionRef              = useRef('')
    const SILENCE_MS                    = 3000

    function limpiarTimers() {
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
        if (silenceCountRef.current) clearInterval(silenceCountRef.current)
        silenceTimerRef.current = null
        silenceCountRef.current = null
        setSilencio(0)
    }

    function iniciarTimerSilencio() {
        limpiarTimers()
        let restantes = Math.ceil(SILENCE_MS / 1000)
        setSilencio(restantes)
        silenceCountRef.current = setInterval(() => {
            restantes -= 1
            setSilencio(restantes)
        }, 1000)
        silenceTimerRef.current = setTimeout(() => {
            limpiarTimers()
            recognitionRef.current?.stop()
        }, SILENCE_MS)
    }

    useEffect(() => {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition
        if (!SR) { setSoportado(false); return }

        const r = new SR()
        r.lang             = 'es-EC'
        r.interimResults   = true
        r.maxAlternatives  = 1
        r.continuous       = true   // grabación continua

        r.onresult = (event: any) => {
            let texto = ''
            for (let i = 0; i < event.results.length; i++) {
                texto += event.results[i][0].transcript
            }
            transcripcionRef.current = texto
            setTranscripcion(texto)
            // Reiniciar temporizador de silencio cada vez que hay habla
            iniciarTimerSilencio()
        }
        r.onend   = () => {
            limpiarTimers()
            setGrabando(false)
        }
        r.onerror = (event: any) => {
            if (event.error !== 'no-speech') setError(`Error de micrófono: ${event.error}`)
            limpiarTimers()
            setGrabando(false)
        }
        recognitionRef.current = r
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    function toggleGrabacion() {
        if (!soportado) {
            setError('Tu navegador no soporta voz. Usa Chrome o Edge.')
            return
        }
        if (grabando) {
            limpiarTimers()
            recognitionRef.current?.stop()
        } else {
            transcripcionRef.current = ''
            setTranscripcion('')
            setResultado(null)
            setError('')
            recognitionRef.current?.start()
            setGrabando(true)
        }
    }

    async function interpretar(texto?: string) {
        const t = texto ?? transcripcion
        if (!t.trim()) return
        setError('')
        setProcesando(true)
        setResultado(null)

        try {
            // Intentar con Gemini vía Edge Function
            const { data, error: fnErr } = await supabase.functions.invoke('voice-assistant', {
                body: { transcripcion: t.trim(), clientes, servicios, empresa_id: empresaId },
            })
            if (fnErr || data?.error) throw new Error(fnErr?.message ?? data?.error ?? 'Error')
            setUsandoIA(true)
            setResultado(data as VoiceResult)
        } catch {
            // Fallback: parser local sin API
            setUsandoIA(false)
            const res = parsearTranscripcion(t, clientes, servicios)
            setResultado(res)
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

    return (
        <>
            {/* Botón flotante */}
            <button
                onClick={() => setOpen(true)}
                title="Asistente de voz"
                className={cn(
                    'fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full shadow-lg',
                    'flex items-center justify-center transition-all duration-200',
                    'bg-primary-600 hover:bg-primary-700 text-white hover:scale-110 active:scale-95'
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
                                    <p className="text-xs text-slate-400">Corina ERP — sin costo</p>
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
                                <div className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3 space-y-1">
                                    <p className="font-medium text-slate-600">Ejemplos de frases:</p>
                                    <p><em>"Factura de servicios para Juan Pérez por consultoría a 150 dólares, cantidad 1, sin IVA"</em></p>
                                    <p><em>"Factura de inventario para Empresa ABC"</em></p>
                                </div>
                            )}

                            {/* Botón grabar */}
                            <div className="flex flex-col items-center gap-3">
                                <button
                                    onClick={toggleGrabacion}
                                    className={cn(
                                        'w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200',
                                        grabando
                                            ? 'bg-red-500 hover:bg-red-600 animate-pulse shadow-lg shadow-red-200'
                                            : 'bg-primary-600 hover:bg-primary-700 shadow-lg'
                                    )}
                                >
                                    {grabando
                                        ? <MicOff className="w-8 h-8 text-white" />
                                        : <Mic className="w-8 h-8 text-white" />
                                    }
                                </button>
                                <p className="text-xs text-slate-500">
                                    {grabando
                                        ? silencio > 0
                                            ? `🔴 Grabando — para en ${silencio}s de silencio`
                                            : '🔴 Grabando... (clic para detener)'
                                        : 'Clic para hablar'}
                                </p>
                            </div>

                            {/* Transcripción editable */}
                            {(transcripcion || grabando) && (
                                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                                    <p className="text-xs text-slate-400 mb-1 font-medium flex items-center gap-1">
                                        Transcripción
                                        {!grabando && <span className="text-slate-300">— edita si hay errores</span>}
                                    </p>
                                    {grabando ? (
                                        <p className="text-sm text-slate-700 min-h-[40px]">
                                            {transcripcion || <span className="text-slate-400 italic">Escuchando...</span>}
                                        </p>
                                    ) : (
                                        <textarea
                                            className="w-full text-sm text-slate-700 bg-white border border-slate-200 rounded-lg p-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary-300 min-h-[60px]"
                                            value={transcripcion}
                                            onChange={e => {
                                                setTranscripcion(e.target.value)
                                                transcripcionRef.current = e.target.value
                                            }}
                                            placeholder="Edita el texto si el reconocimiento de voz no fue exacto..."
                                        />
                                    )}
                                    {transcripcion && !grabando && !resultado && (
                                        <div className="flex gap-2 mt-3">
                                            <button onClick={() => interpretar()} disabled={procesando}
                                                className="btn btn-primary text-xs gap-1.5 flex-1">
                                                {procesando
                                                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Procesando...</>
                                                    : <><CheckCircle2 className="w-3.5 h-3.5" /> Interpretar</>
                                                }
                                            </button>
                                            <button
                                                onClick={() => { setTranscripcion(''); setResultado(null) }}
                                                className="btn border border-slate-200 text-slate-500 text-xs px-3">
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

                            {/* Resultado */}
                            {resultado && (
                                <div className="space-y-3">
                                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-start justify-between gap-2">
                                        <p className="text-xs text-blue-700 flex-1">{resultado.resumen}</p>
                                        <span className={cn('text-xs px-2 py-0.5 rounded-full shrink-0 font-medium',
                                            usandoIA ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-500')}>
                                            {usandoIA ? '✨ Gemini' : '⚙ Básico'}
                                        </span>
                                    </div>

                                    <div className="space-y-0">
                                        <Row label="Tipo">
                                            {resultado.tipo === 'servicios' && <Badge label="Servicios" color="bg-blue-100 text-blue-700" />}
                                            {resultado.tipo === 'inventario' && <Badge label="Inventario" color="bg-green-100 text-green-700" />}
                                            {resultado.tipo === 'desconocido' && <Badge label="Sin definir" color="bg-slate-100 text-slate-600" />}
                                        </Row>
                                        <Row label="Cliente" icon={<User className="w-3.5 h-3.5" />}>
                                            <span className="text-sm font-medium text-slate-800">
                                                {resultado.cliente.nombre || '—'}
                                            </span>
                                            {resultado.cliente.nombre && (resultado.cliente.existe
                                                ? <Badge label="Existe ✓" color="bg-green-100 text-green-700" />
                                                : <Badge label="No existe" color="bg-red-100 text-red-600" />
                                            )}
                                        </Row>
                                        {resultado.tipo === 'inventario' ? (
                                            <Row label="Ítem" icon={<Package className="w-3.5 h-3.5" />}>
                                                <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                                                    Seleccionar del inventario manualmente
                                                </span>
                                            </Row>
                                        ) : (
                                            <Row label="Ítem" icon={<Briefcase className="w-3.5 h-3.5" />}>
                                                <span className="text-sm text-slate-700 flex-1">
                                                    {resultado.item.nombre || '—'}
                                                </span>
                                                {resultado.item.existe && <Badge label="En catálogo ✓" color="bg-green-100 text-green-700" />}
                                            </Row>
                                        )}
                                        <Row label="Cantidad">
                                            <span className="text-sm font-semibold">{resultado.item.cantidad}</span>
                                        </Row>
                                        <Row label="Precio unit.">
                                            <span className="text-sm font-semibold">
                                                {resultado.item.precio_unitario > 0
                                                    ? `$${resultado.item.precio_unitario.toFixed(2)}`
                                                    : '—'}
                                            </span>
                                        </Row>
                                        <Row label="IVA">
                                            {resultado.item.iva_porcentaje > 0
                                                ? <Badge label={`${resultado.item.iva_porcentaje}%`} color="bg-amber-100 text-amber-700" />
                                                : <Badge label="0% — Sin IVA" color="bg-slate-100 text-slate-600" />
                                            }
                                        </Row>
                                    </div>

                                    {resultado.datos_faltantes.length > 0 && (
                                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3">
                                            <p className="text-xs font-semibold text-amber-700 mb-1">Datos faltantes:</p>
                                            {resultado.datos_faltantes.map(d => (
                                                <p key={d} className="text-xs text-amber-600">• {d}</p>
                                            ))}
                                        </div>
                                    )}

                                    <p className="text-xs text-slate-500 italic">{resultado.accion_siguiente}</p>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        {resultado && resultado.tipo !== 'desconocido' && (
                            <div className="px-5 py-4 border-t border-slate-100 flex gap-3">
                                <button onClick={handleApply} className="btn btn-primary flex-1 gap-2">
                                    <CheckCircle2 className="w-4 h-4" /> Aplicar a factura
                                </button>
                                <button
                                    onClick={() => { setResultado(null); setTranscripcion('') }}
                                    className="btn border border-slate-200 text-slate-500 px-4">
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
