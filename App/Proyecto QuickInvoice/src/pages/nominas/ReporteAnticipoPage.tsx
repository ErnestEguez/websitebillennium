import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer, Loader2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { anticipoService } from '../../services/nominas/anticipoService'
import { periodoNominaService } from '../../services/nominas/periodoNominaService'
import { supabase } from '../../lib/supabase'
import type { AnticipoLinea, PeriodoNomina } from '../../types/nominas'

const nominas = () => supabase.schema('nominas')

const fmt = (n: number) =>
    (n ?? 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtFecha = (s: string) => {
    const [y, m, d] = s.split('-')
    return `${d}/${m}/${y}`
}

export function ReporteAnticipoPage() {
    const { anticipoId } = useParams<{ anticipoId: string }>()
    const { empresa }    = useAuth() as any
    const navigate       = useNavigate()

    const [periodo,   setPeriodo]   = useState<PeriodoNomina  | null>(null)
    const [lineas,    setLineas]    = useState<AnticipoLinea[]>([])
    const [loading,   setLoading]   = useState(true)

    useEffect(() => {
        if (anticipoId) cargar()
    }, [anticipoId])

    async function cargar() {
        try {
            const { data: ant } = await nominas()
                .from('anticipos').select('*').eq('id', anticipoId!).single()
            if (!ant) return
            const [lins, per] = await Promise.all([
                anticipoService.obtenerLineas(anticipoId!),
                periodoNominaService.obtener(ant.periodo_id),
            ])
            setLineas(lins)
            setPeriodo(per)
        } catch {}
        finally { setLoading(false) }
    }

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
    )

    const hoy = new Date().toLocaleDateString('es-EC', { year: 'numeric', month: 'long', day: 'numeric' })
    const totalAnticipo = lineas.reduce((s, l) => s + (l.monto_anticipo ?? 0), 0)
    const totalNeto     = lineas.reduce((s, l) => s + (l.neto ?? 0), 0)

    const tieneDesc1 = lineas.some(l => l.desc1_nombre || (l.desc1_monto ?? 0) > 0)
    const tieneDesc2 = lineas.some(l => l.desc2_nombre || (l.desc2_monto ?? 0) > 0)

    return (
        <div>
            {/* Controles (no se imprimen) */}
            <div className="no-print flex items-center gap-3 mb-6">
                <button onClick={() => navigate(-1)}
                    className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm font-medium transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                    Volver
                </button>
                <button onClick={() => window.print()}
                    className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors ml-auto">
                    <Printer className="w-4 h-4" />
                    Imprimir
                </button>
            </div>

            {/* Documento imprimible */}
            <div className="print-doc bg-white p-8 max-w-4xl mx-auto shadow-sm border border-slate-200 rounded-2xl">
                {/* Encabezado */}
                <div className="text-center mb-6">
                    <h1 className="text-xl font-bold text-slate-900 uppercase tracking-wide">
                        {empresa?.nombre ?? 'Empresa'}
                    </h1>
                    <h2 className="text-base font-semibold text-slate-700 mt-1">
                        Anticipo de Quincena
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                        {periodo?.nombre}{' · '}
                        {periodo && `${fmtFecha(periodo.fecha_inicio)} – ${fmtFecha(periodo.fecha_fin)}`}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{hoy}</p>
                </div>

                {/* Tabla */}
                <table className="w-full text-sm border-collapse">
                    <thead>
                        <tr className="border-b-2 border-slate-300">
                            <th className="text-left py-2 px-3 font-semibold text-slate-700">Empleado</th>
                            <th className="text-right py-2 px-3 font-semibold text-slate-700">Anticipo</th>
                            {tieneDesc1 && <>
                                <th className="text-left py-2 px-3 font-semibold text-slate-700">Descuento 1</th>
                                <th className="text-right py-2 px-3 font-semibold text-slate-700">Monto</th>
                            </>}
                            {tieneDesc2 && <>
                                <th className="text-left py-2 px-3 font-semibold text-slate-700">Descuento 2</th>
                                <th className="text-right py-2 px-3 font-semibold text-slate-700">Monto</th>
                            </>}
                            <th className="text-right py-2 px-3 font-semibold text-slate-700">Neto a Recibir</th>
                            <th className="py-2 px-3 font-semibold text-slate-700 text-center">Firma</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lineas.map((linea, idx) => {
                            const emp    = linea.empleado
                            const nombre = emp
                                ? `${emp.apellidos} ${emp.nombres}`
                                : linea.empleado_id
                            return (
                                <tr key={linea.id}
                                    className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                    <td className="py-2.5 px-3 font-medium text-slate-800 border-b border-slate-200">
                                        {nombre}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-mono text-slate-700 border-b border-slate-200">
                                        {fmt(linea.monto_anticipo)}
                                    </td>
                                    {tieneDesc1 && <>
                                        <td className="py-2.5 px-3 text-slate-500 text-xs border-b border-slate-200">
                                            {linea.desc1_nombre ?? ''}
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono text-slate-500 text-xs border-b border-slate-200">
                                            {(linea.desc1_monto ?? 0) > 0 ? fmt(linea.desc1_monto!) : ''}
                                        </td>
                                    </>}
                                    {tieneDesc2 && <>
                                        <td className="py-2.5 px-3 text-slate-500 text-xs border-b border-slate-200">
                                            {linea.desc2_nombre ?? ''}
                                        </td>
                                        <td className="py-2.5 px-3 text-right font-mono text-slate-500 text-xs border-b border-slate-200">
                                            {(linea.desc2_monto ?? 0) > 0 ? fmt(linea.desc2_monto!) : ''}
                                        </td>
                                    </>}
                                    <td className="py-2.5 px-3 text-right font-bold font-mono text-emerald-700 border-b border-slate-200">
                                        {fmt(linea.neto)}
                                    </td>
                                    {/* Firma */}
                                    <td className="py-2.5 px-3 border-b border-slate-200">
                                        <div className="mx-auto w-36 border-b-2 border-slate-400 mt-4 mb-1" />
                                        <p className="text-center text-xs text-slate-400">Firma</p>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                    <tfoot>
                        <tr className="border-t-2 border-slate-300 bg-slate-50">
                            <td className="py-2.5 px-3 font-bold text-slate-700">
                                Total — {lineas.length} empleados
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold font-mono text-slate-800">
                                {fmt(totalAnticipo)}
                            </td>
                            {tieneDesc1 && <td colSpan={2} />}
                            {tieneDesc2 && <td colSpan={2} />}
                            <td className="py-2.5 px-3 text-right font-bold font-mono text-emerald-700">
                                {fmt(totalNeto)}
                            </td>
                            <td />
                        </tr>
                    </tfoot>
                </table>

                {/* Pie */}
                <div className="mt-8 pt-4 border-t border-slate-200 flex justify-between text-xs text-slate-400">
                    <span>{empresa?.nombre}</span>
                    <span>Generado el {hoy}</span>
                </div>
            </div>

            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    .print-doc {
                        box-shadow: none !important;
                        border: none !important;
                        padding: 0 !important;
                        max-width: 100% !important;
                    }
                    @page { size: portrait; margin: 1.5cm; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
            `}</style>
        </div>
    )
}
