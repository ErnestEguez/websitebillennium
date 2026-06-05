import { useAuth } from '../../contexts/AuthContext'

interface Props {
    titulo:      string
    subtitulo?:  string
    filtros?:    { label: string; valor: string }[]
}

export function ReportPrintHeader({ titulo, subtitulo, filtros }: Props) {
    const { empresa } = useAuth()
    const ahora = new Date().toLocaleString('es-EC', {
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    })

    return (
        <div className="print-only border-b-2 border-slate-800 pb-4 mb-6">
            {/* Encabezado empresa */}
            <div className="flex items-start justify-between mb-3">
                <div>
                    <p className="text-xl font-black text-slate-900 uppercase tracking-wide">
                        {empresa?.nombre ?? 'Empresa'}
                    </p>
                    <p className="text-sm text-slate-600">RUC: {empresa?.ruc ?? '—'}</p>
                </div>
                <div className="text-right text-xs text-slate-500">
                    <p>Gestión de Compras — Billennium</p>
                    <p>Impreso: {ahora}</p>
                </div>
            </div>

            {/* Título del reporte */}
            <div className="text-center py-2 border-y border-slate-300">
                <p className="text-lg font-black text-slate-900 uppercase tracking-widest">{titulo}</p>
                {subtitulo && <p className="text-sm text-slate-600 mt-0.5">{subtitulo}</p>}
            </div>

            {/* Filtros aplicados */}
            {filtros && filtros.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
                    {filtros.map(f => (
                        <span key={f.label}>
                            <span className="font-bold">{f.label}:</span> {f.valor}
                        </span>
                    ))}
                </div>
            )}
        </div>
    )
}

