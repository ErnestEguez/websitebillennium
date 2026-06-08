import { Printer, Download } from 'lucide-react'
import { imprimirPagina, exportarExcel } from '../../lib/exportUtils'

interface Props {
    datos:         Record<string, unknown>[]
    nombreArchivo: string
    columnas?:     Record<string, string>
    titulo?:       string
    onPrint?:      () => void
}

export function PrintExportBar({ datos, nombreArchivo, columnas, titulo, onPrint }: Props) {
    return (
        <div className="no-print flex items-center gap-2 justify-end">
            {titulo && <span className="text-xs text-slate-400 mr-2">{titulo}</span>}
            <button
                onClick={() => exportarExcel(datos, nombreArchivo, columnas)}
                className="btn btn-secondary flex items-center gap-2 text-sm py-1.5 px-3"
                title="Exportar a Excel"
            >
                <Download className="w-4 h-4 text-green-600" />
                Excel
            </button>
            <button
                onClick={onPrint ?? imprimirPagina}
                className="btn btn-secondary flex items-center gap-2 text-sm py-1.5 px-3"
                title="Imprimir"
            >
                <Printer className="w-4 h-4 text-slate-500" />
                Imprimir
            </button>
        </div>
    )
}

