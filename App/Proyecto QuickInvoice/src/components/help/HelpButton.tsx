import { useState } from 'react'
import { HelpCircle } from 'lucide-react'
import { HelpPanel } from './HelpPanel'
import { AYUDA } from '../../data/helpContent'

interface Props {
    pageKey: string
    className?: string
}

export function HelpButton({ pageKey, className = '' }: Props) {
    const [abierto, setAbierto] = useState(false)

    // No renderizar si no existe contenido para esta página
    if (!AYUDA[pageKey]) return null

    return (
        <>
            <button
                onClick={() => setAbierto(true)}
                title="Abrir ayuda de esta página"
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg
                    text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200
                    transition-colors ${className}`}
            >
                <HelpCircle className="w-4 h-4" />
                Ayuda
            </button>

            {abierto && (
                <HelpPanel
                    pageKey={pageKey}
                    onClose={() => setAbierto(false)}
                />
            )}
        </>
    )
}
