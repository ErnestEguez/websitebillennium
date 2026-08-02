import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { ScanLine, Upload, Camera, X, Loader2, CheckCircle2, AlertCircle, FileText } from 'lucide-react'
import { cn } from '../lib/utils'

export interface FacturaEscaneada {
    estab:         string
    pto_emi:       string
    secuencial:    string
    fecha_emision: string
    ruc_proveedor: string
    razon_social:  string
    clave_acceso:  string | null
    base_cero:     number
    base_iva:      number
    iva:           number
    total:         number
    items: {
        descripcion:     string
        cantidad:        number
        precio_unitario: number
        aplica_iva:      boolean
    }[]
}

interface Props {
    onAplicar: (data: FacturaEscaneada) => void
    empresaId: string
}

export function ScanFacturaButton({ onAplicar, empresaId }: Props) {
    const [open, setOpen]         = useState(false)
    const [preview, setPreview]   = useState<string | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [mimeType, setMimeType] = useState<string>('image/jpeg')
    const [fileName, setFileName] = useState<string>('')
    const [analizando, setAnalizando] = useState(false)
    const [resultado, setResultado]   = useState<FacturaEscaneada | null>(null)
    const [error, setError]           = useState('')

    const fileRef   = useRef<HTMLInputElement>(null)
    const cameraRef = useRef<HTMLInputElement>(null)

    function reset() {
        setPreview(null)
        setPreviewUrl(null)
        setResultado(null)
        setError('')
        setFileName('')
    }

    function handleFile(file: File) {
        if (!file) return
        setError('')
        setResultado(null)
        setFileName(file.name)
        setMimeType(file.type || 'image/jpeg')

        const reader = new FileReader()
        reader.onload = (e) => {
            const base64 = (e.target?.result as string).split(',')[1]
            setPreview(base64)
            // preview URL for images
            if (file.type.startsWith('image/')) {
                setPreviewUrl(e.target?.result as string)
            } else {
                setPreviewUrl(null)
            }
        }
        reader.readAsDataURL(file)
    }

    async function analizar() {
        if (!preview) return
        setAnalizando(true)
        setError('')
        setResultado(null)
        try {
            const { data, error: fnErr } = await supabase.functions.invoke('scan-invoice', {
                body: { content: preview, mimeType, empresa_id: empresaId },
            })
            if (fnErr || data?.error) throw new Error(fnErr?.message ?? data?.error)
            setResultado(data as FacturaEscaneada)
        } catch (e: any) {
            setError(e.message ?? 'Error al analizar el documento')
        } finally {
            setAnalizando(false)
        }
    }

    function aplicar() {
        if (!resultado) return
        onAplicar(resultado)
        setOpen(false)
        reset()
    }

    return (
        <>
            <button
                type="button"
                onClick={() => { setOpen(true); reset() }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-primary-300 text-primary-700 bg-primary-50 hover:bg-primary-100 text-sm font-medium transition-colors"
            >
                <ScanLine className="w-4 h-4" />
                Escanear factura
            </button>

            {open && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center">
                                    <ScanLine className="w-4 h-4 text-primary-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900">Escanear factura de proveedor</h3>
                                    <p className="text-xs text-slate-400">Sube un PDF o foto — la IA extrae los datos automáticamente</p>
                                </div>
                            </div>
                            <button onClick={() => { setOpen(false); reset() }} className="text-slate-400 hover:text-slate-600 p-1">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

                            {/* Botones de carga */}
                            {!preview && (
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => fileRef.current?.click()}
                                        className="flex flex-col items-center gap-3 p-6 border-2 border-dashed border-slate-300 rounded-xl hover:border-primary-400 hover:bg-primary-50 transition-colors"
                                    >
                                        <Upload className="w-8 h-8 text-slate-400" />
                                        <div className="text-center">
                                            <p className="font-medium text-slate-700 text-sm">Subir archivo</p>
                                            <p className="text-xs text-slate-400 mt-0.5">PDF o imagen</p>
                                        </div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => cameraRef.current?.click()}
                                        className="flex flex-col items-center gap-3 p-6 border-2 border-dashed border-slate-300 rounded-xl hover:border-primary-400 hover:bg-primary-50 transition-colors"
                                    >
                                        <Camera className="w-8 h-8 text-slate-400" />
                                        <div className="text-center">
                                            <p className="font-medium text-slate-700 text-sm">Tomar foto</p>
                                            <p className="text-xs text-slate-400 mt-0.5">Cámara del dispositivo</p>
                                        </div>
                                    </button>
                                </div>
                            )}

                            {/* Inputs ocultos */}
                            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
                                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
                            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                                onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />

                            {/* Preview */}
                            {preview && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-sm text-slate-600">
                                            <FileText className="w-4 h-4 text-primary-500" />
                                            <span className="truncate max-w-xs">{fileName}</span>
                                        </div>
                                        <button onClick={reset} className="text-xs text-slate-400 hover:text-red-500 underline">
                                            Cambiar archivo
                                        </button>
                                    </div>
                                    {previewUrl && (
                                        <img src={previewUrl} alt="Preview" className="w-full max-h-48 object-contain rounded-lg border border-slate-200 bg-slate-50" />
                                    )}
                                    {!previewUrl && (
                                        <div className="w-full h-20 bg-red-50 border border-red-200 rounded-lg flex items-center justify-center gap-2 text-red-600 text-sm">
                                            <FileText className="w-5 h-5" /> PDF listo para analizar
                                        </div>
                                    )}

                                    {!resultado && (
                                        <button
                                            type="button"
                                            onClick={analizar}
                                            disabled={analizando}
                                            className="w-full py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg flex items-center justify-center gap-2 disabled:opacity-70 transition-colors"
                                        >
                                            {analizando
                                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Analizando con IA...</>
                                                : <><ScanLine className="w-4 h-4" /> Analizar factura</>
                                            }
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Error */}
                            {error && (
                                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <span>{error}</span>
                                </div>
                            )}

                            {/* Resultados */}
                            {resultado && (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
                                        <CheckCircle2 className="w-4 h-4" />
                                        Datos extraídos — revisa antes de aplicar
                                    </div>

                                    {/* Cabecera */}
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-2 gap-2 text-sm">
                                        <div><span className="text-slate-500">Proveedor:</span> <strong>{resultado.razon_social ?? '—'}</strong></div>
                                        <div><span className="text-slate-500">RUC:</span> <strong>{resultado.ruc_proveedor ?? '—'}</strong></div>
                                        <div><span className="text-slate-500">N° Factura:</span> <strong>{resultado.estab}-{resultado.pto_emi}-{resultado.secuencial}</strong></div>
                                        <div><span className="text-slate-500">Fecha:</span> <strong>{resultado.fecha_emision ?? '—'}</strong></div>
                                        <div><span className="text-slate-500">Base 0%:</span> <strong>${(resultado.base_cero ?? 0).toFixed(2)}</strong></div>
                                        <div><span className="text-slate-500">Base IVA:</span> <strong>${(resultado.base_iva ?? 0).toFixed(2)}</strong></div>
                                        <div><span className="text-slate-500">IVA:</span> <strong>${(resultado.iva ?? 0).toFixed(2)}</strong></div>
                                        <div><span className="text-slate-500">Total:</span> <strong className="text-primary-700">${(resultado.total ?? 0).toFixed(2)}</strong></div>
                                    </div>

                                    {/* Ítems */}
                                    {resultado.items?.length > 0 && (
                                        <div className="border border-slate-200 rounded-xl overflow-hidden">
                                            <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200">
                                                {resultado.items.length} ítem(s) detectado(s)
                                            </div>
                                            <table className="w-full text-xs">
                                                <thead className="border-b border-slate-100">
                                                    <tr className="text-slate-500">
                                                        <th className="px-3 py-2 text-left">Descripción</th>
                                                        <th className="px-3 py-2 text-center">Cant.</th>
                                                        <th className="px-3 py-2 text-right">P. Unit.</th>
                                                        <th className="px-3 py-2 text-center">IVA</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {resultado.items.map((item, i) => (
                                                        <tr key={i} className="border-b border-slate-50">
                                                            <td className="px-3 py-2 text-slate-700">{item.descripcion}</td>
                                                            <td className="px-3 py-2 text-center">{item.cantidad}</td>
                                                            <td className="px-3 py-2 text-right">${item.precio_unitario?.toFixed(2)}</td>
                                                            <td className="px-3 py-2 text-center">
                                                                <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium',
                                                                    item.aplica_iva ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500')}>
                                                                    {item.aplica_iva ? '15%' : '0%'}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        {resultado && (
                            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
                                <button type="button" onClick={() => { setResultado(null) }}
                                    className="px-4 py-2 rounded-lg border border-slate-300 text-slate-600 text-sm hover:bg-slate-50">
                                    Volver a analizar
                                </button>
                                <button type="button" onClick={aplicar}
                                    className="px-5 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4" />
                                    Aplicar al formulario
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </>
    )
}
