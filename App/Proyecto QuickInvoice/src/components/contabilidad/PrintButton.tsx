import { Printer } from 'lucide-react'

interface PrintButtonProps {
    titulo: string
    empresa?: string
    subtitulo?: string
}

export function PrintButton({ titulo, empresa, subtitulo }: PrintButtonProps) {
    function imprimir() {
        // Inyecta metadata de impresión temporalmente
        const meta = document.createElement('div')
        meta.id = '__print_header__'
        meta.innerHTML = `
            <div style="font-family:sans-serif;margin-bottom:16px;border-bottom:2px solid #1e293b;padding-bottom:12px">
                ${empresa ? `<p style="font-size:12px;color:#64748b;margin:0 0 4px">${empresa}</p>` : ''}
                <h1 style="font-size:20px;font-weight:bold;margin:0 0 2px;color:#0f172a">${titulo}</h1>
                ${subtitulo ? `<p style="font-size:12px;color:#475569;margin:0">${subtitulo}</p>` : ''}
                <p style="font-size:11px;color:#94a3b8;margin:4px 0 0">Impreso el ${new Date().toLocaleDateString('es-EC', { dateStyle: 'long' })}</p>
            </div>
        `
        meta.style.cssText = 'display:none'
        document.body.appendChild(meta)

        window.print()

        // Cleanup
        document.body.removeChild(meta)
    }

    return (
        <button onClick={imprimir} className="btn btn-secondary gap-2 text-sm">
            <Printer className="w-4 h-4" /> Imprimir
        </button>
    )
}

