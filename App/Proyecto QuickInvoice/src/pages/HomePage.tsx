import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { AlertCircle } from 'lucide-react'

export function HomePage() {
    const [mensaje, setMensaje] = useState<string>('')

    useEffect(() => {
        supabase
            .from('mensajes_plataforma')
            .select('mensaje, activo')
            .eq('id', 1)
            .maybeSingle()
            .then(({ data }) => {
                if (data?.activo && data?.mensaje?.trim()) {
                    setMensaje(data.mensaje.trim())
                }
            })
    }, [])

    return (
        <div className="relative w-full h-full min-h-screen overflow-hidden flex items-center justify-center bg-slate-900">
            {/* Imagen de fondo */}
            <img
                src="/home-banner.png"
                alt="QuickInvoice"
                className="absolute inset-0 w-full h-full object-cover"
                data-pin-nopin="true"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />

            {/* Overlay de mensaje (solo si hay mensaje) */}
            {mensaje && (
                <div className="relative z-10 max-w-xl w-full mx-6 mt-6 self-start">
                    <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl border border-white/50 p-5">
                        <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center">
                                <AlertCircle className="w-5 h-5 text-primary-600" />
                            </div>
                            <div className="flex-1">
                                <p className="text-xs font-semibold uppercase tracking-wide text-primary-600 mb-1">
                                    Aviso del Sistema
                                </p>
                                <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-wrap">
                                    {mensaje}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
