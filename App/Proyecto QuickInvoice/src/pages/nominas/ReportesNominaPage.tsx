import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { periodoNominaService } from '../../services/nominas/periodoNominaService'
import type { PeriodoNomina } from '../../types/nominas'
import { cn } from '../../lib/utils'

const nominas = () => supabase.schema('nominas')

const fmt = (n: number) =>
    n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtFecha = (s: string) => {
    const [y, m, d] = s.split('-')
    return `${d}/${m}/${y}`
}

interface Linea {
    codigo: string
    nombre: string
    tipo: 'ingreso' | 'descuento'
    monto: number
    orden: number
}

interface CabeceraConLineas {
    id: string
    empleado_id: string
    sueldo_base: number
    total_ingresos: number
    total_descuentos: number
    neto: number
    empleado: { nombres: string; apellidos: string; cargo?: { nombre: string } | null } | null
    lineas: Linea[]
}

interface ColConcepto {
    codigo: string
    nombre: string
    tipo: 'ingreso' | 'descuento'
    orden: number
}

type Vista = 'completo' | 'resumido' | 'descuentos'

export function ReportesNominaPage() {
    const { periodoId } = useParams<{ periodoId: string }>()
    const navigate = useNavigate()

    const [periodo, setPeriodo] = useState<PeriodoNomina | null>(null)
    const [cabs, setCabs]       = useState<CabeceraConLineas[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError]     = useState<string | null>(null)
    const [vista, setVista]     = useState<Vista>('completo')

    useEffect(() => {
        if (periodoId) cargar()
    }, [periodoId])

    async function cargar() {
        setLoading(true)
        setError(null)
        try {
            const [per, rawCabs] = await Promise.all([
                periodoNominaService.obtener(periodoId!),
                nominas()
                    .from('rol_cabecera')
                    .select('id, empleado_id, sueldo_base, total_ingresos, total_descuentos, neto, empleado:empleados(nombres, apellidos, cargo:cargos(nombre)), lineas:rol_lineas(codigo, nombre, tipo, monto, orden)')
                    .eq('periodo_id', periodoId!)
                    .order('created_at'),
            ])
            if (rawCabs.error) throw rawCabs.error
            setPeriodo(per)

            const sorted = (rawCabs.data as unknown as CabeceraConLineas[]).map(c => ({
                ...c,
                lineas: [...(c.lineas ?? [])].sort((a, b) => a.orden - b.orden),
            }))
            setCabs(sorted)
        } catch (e: any) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    // Construir columnas únicas ordenadas
    const allConceptos = (() => {
        const map = new Map<string, ColConcepto>()
        for (const c of cabs) {
            for (const l of c.lineas) {
                if (!map.has(l.codigo)) {
                    map.set(l.codigo, { codigo: l.codigo, nombre: l.nombre, tipo: l.tipo, orden: l.orden })
                }
            }
        }
        return [...map.values()].sort((a, b) => a.orden - b.orden)
    })()

    const colsIngreso   = allConceptos.filter(c => c.tipo === 'ingreso')
    const colsDescuento = allConceptos.filter(c => c.tipo === 'descuento')

    function getMonto(cab: CabeceraConLineas, codigo: string) {
        return cab.lineas.find(l => l.codigo === codigo)?.monto ?? 0
    }

    if (loading) return (
        <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
    )

    if (!periodo) return (
        <div className="text-center py-20 text-slate-400">Período no encontrado.</div>
    )

    return (
        <>
            {/* Estilos de impresión */}
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    body { font-size: 9px; }
                    table { font-size: 8px; border-collapse: collapse; width: 100%; }
                    th, td { padding: 3px 5px !important; border: 1px solid #e2e8f0; }
                    @page { size: landscape; margin: 1cm; }
                    .page-header { margin-bottom: 8px; }
                }
            `}</style>

            <div className="space-y-4">
                {/* Barra superior */}
                <div className="no-print flex flex-wrap items-center gap-4">
                    <button
                        onClick={() => navigate(`/nominas/rol/${periodoId}`)}
                        className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm font-medium transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Volver al Rol
                    </button>
                    <div className="flex-1">
                        <h1 className="text-xl font-bold text-slate-900">Reportes — {periodo.nombre}</h1>
                        <p className="text-xs text-slate-400">
                            {fmtFecha(periodo.fecha_inicio)} – {fmtFecha(periodo.fecha_fin)}
                        </p>
                    </div>
                    <button
                        onClick={() => window.print()}
                        className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                    >
                        <Printer className="w-4 h-4" />
                        Imprimir
                    </button>
                </div>

                {error && (
                    <div className="no-print bg-red-50 text-red-700 border border-red-200 rounded-xl px-4 py-3 text-sm">
                        {error}
                    </div>
                )}

                {/* Tabs */}
                <div className="no-print flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
                    {([
                        ['completo',   'Rol Completo'],
                        ['resumido',   'Rol Resumido'],
                        ['descuentos', 'Auxiliar Descuentos'],
                    ] as [Vista, string][]).map(([v, label]) => (
                        <button
                            key={v}
                            onClick={() => setVista(v)}
                            className={cn(
                                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                                vista === v
                                    ? 'bg-white shadow-sm text-primary-700'
                                    : 'text-slate-500 hover:text-slate-700'
                            )}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {/* Encabezado impreso */}
                <div className="page-header text-center hidden print:block">
                    <p className="font-bold text-base">Rol de Pagos — {periodo.nombre}</p>
                    <p className="text-xs">{fmtFecha(periodo.fecha_inicio)} – {fmtFecha(periodo.fecha_fin)}</p>
                    <p className="text-xs font-semibold mt-1">
                        {vista === 'completo' ? 'Detalle Completo' : vista === 'resumido' ? 'Resumen' : 'Auxiliar de Descuentos'}
                    </p>
                </div>

                {/* ── ROL COMPLETO (pivot) ────────────────────────────── */}
                {vista === 'completo' && (
                    <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200">
                        <table className="w-full text-xs whitespace-nowrap">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="text-left px-3 py-2.5 font-semibold text-slate-600 sticky left-0 bg-slate-50 z-10 min-w-[180px]">Empleado</th>
                                    <th className="text-left px-3 py-2.5 font-semibold text-slate-500 min-w-[120px]">Cargo</th>
                                    {/* Ingresos */}
                                    {colsIngreso.map(c => (
                                        <th key={c.codigo} className="text-right px-3 py-2.5 font-semibold text-emerald-700 min-w-[90px]">
                                            <span className="block text-[9px] font-mono text-slate-400">{c.codigo}</span>
                                            {c.nombre}
                                        </th>
                                    ))}
                                    <th className="text-right px-3 py-2.5 font-bold text-emerald-800 min-w-[90px] border-l border-emerald-200">Total Ing.</th>
                                    {/* Descuentos */}
                                    {colsDescuento.map(c => (
                                        <th key={c.codigo} className="text-right px-3 py-2.5 font-semibold text-red-600 min-w-[90px]">
                                            <span className="block text-[9px] font-mono text-slate-400">{c.codigo}</span>
                                            {c.nombre}
                                        </th>
                                    ))}
                                    <th className="text-right px-3 py-2.5 font-bold text-red-700 min-w-[90px] border-l border-red-200">Total Desc.</th>
                                    <th className="text-right px-3 py-2.5 font-bold text-primary-700 min-w-[90px] border-l border-primary-200">Neto</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {cabs.map(cab => (
                                    <tr key={cab.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-3 py-2 font-medium text-slate-800 sticky left-0 bg-white">
                                            {cab.empleado?.apellidos}, {cab.empleado?.nombres}
                                        </td>
                                        <td className="px-3 py-2 text-slate-500">{cab.empleado?.cargo?.nombre ?? '—'}</td>
                                        {colsIngreso.map(c => (
                                            <td key={c.codigo} className="px-3 py-2 text-right text-emerald-700">
                                                {getMonto(cab, c.codigo) !== 0 ? fmt(getMonto(cab, c.codigo)) : <span className="text-slate-300">—</span>}
                                            </td>
                                        ))}
                                        <td className="px-3 py-2 text-right font-semibold text-emerald-800 border-l border-emerald-100">
                                            {fmt(cab.total_ingresos)}
                                        </td>
                                        {colsDescuento.map(c => (
                                            <td key={c.codigo} className="px-3 py-2 text-right text-red-600">
                                                {getMonto(cab, c.codigo) !== 0 ? fmt(getMonto(cab, c.codigo)) : <span className="text-slate-300">—</span>}
                                            </td>
                                        ))}
                                        <td className="px-3 py-2 text-right font-semibold text-red-700 border-l border-red-100">
                                            {fmt(cab.total_descuentos)}
                                        </td>
                                        <td className="px-3 py-2 text-right font-bold text-primary-700 border-l border-primary-100">
                                            {fmt(cab.neto)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                                <tr>
                                    <td colSpan={2} className="px-3 py-2.5 font-bold text-slate-800 sticky left-0 bg-slate-50">TOTALES</td>
                                    {colsIngreso.map(c => (
                                        <td key={c.codigo} className="px-3 py-2.5 text-right font-bold text-emerald-800">
                                            {fmt(cabs.reduce((s, cab) => s + getMonto(cab, c.codigo), 0))}
                                        </td>
                                    ))}
                                    <td className="px-3 py-2.5 text-right font-bold text-emerald-900 border-l border-emerald-200">
                                        {fmt(cabs.reduce((s, c) => s + c.total_ingresos, 0))}
                                    </td>
                                    {colsDescuento.map(c => (
                                        <td key={c.codigo} className="px-3 py-2.5 text-right font-bold text-red-700">
                                            {fmt(cabs.reduce((s, cab) => s + getMonto(cab, c.codigo), 0))}
                                        </td>
                                    ))}
                                    <td className="px-3 py-2.5 text-right font-bold text-red-800 border-l border-red-200">
                                        {fmt(cabs.reduce((s, c) => s + c.total_descuentos, 0))}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-bold text-primary-800 border-l border-primary-200">
                                        {fmt(cabs.reduce((s, c) => s + c.neto, 0))}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}

                {/* ── ROL RESUMIDO ─────────────────────────────────────── */}
                {vista === 'resumido' && (
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="text-left px-5 py-3 font-semibold text-slate-600">Empleado</th>
                                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Cargo</th>
                                    <th className="text-right px-4 py-3 font-semibold text-slate-600">Sueldo Base</th>
                                    <th className="text-right px-4 py-3 font-semibold text-emerald-700">Total Ingresos</th>
                                    <th className="text-right px-4 py-3 font-semibold text-red-600">Total Descuentos</th>
                                    <th className="text-right px-4 py-3 font-semibold text-primary-700">Neto a Recibir</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {cabs.map(cab => (
                                    <tr key={cab.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-5 py-3 font-medium text-slate-800">
                                            {cab.empleado?.apellidos}, {cab.empleado?.nombres}
                                        </td>
                                        <td className="px-4 py-3 text-slate-500 text-sm">{cab.empleado?.cargo?.nombre ?? '—'}</td>
                                        <td className="px-4 py-3 text-right text-slate-700">${fmt(cab.sueldo_base)}</td>
                                        <td className="px-4 py-3 text-right text-emerald-700 font-medium">${fmt(cab.total_ingresos)}</td>
                                        <td className="px-4 py-3 text-right text-red-600 font-medium">${fmt(cab.total_descuentos)}</td>
                                        <td className="px-4 py-3 text-right text-primary-700 font-bold">${fmt(cab.neto)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                                <tr>
                                    <td colSpan={3} className="px-5 py-3 font-bold text-slate-800">TOTALES</td>
                                    <td className="px-4 py-3 text-right font-bold text-emerald-800">
                                        ${fmt(cabs.reduce((s, c) => s + c.total_ingresos, 0))}
                                    </td>
                                    <td className="px-4 py-3 text-right font-bold text-red-700">
                                        ${fmt(cabs.reduce((s, c) => s + c.total_descuentos, 0))}
                                    </td>
                                    <td className="px-4 py-3 text-right font-bold text-primary-800">
                                        ${fmt(cabs.reduce((s, c) => s + c.neto, 0))}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}

                {/* ── AUXILIAR DE DESCUENTOS ───────────────────────────── */}
                {vista === 'descuentos' && (
                    <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200">
                        {colsDescuento.length === 0 ? (
                            <div className="py-16 text-center text-slate-400 text-sm">No hay descuentos en este período.</div>
                        ) : (
                            <table className="w-full text-xs whitespace-nowrap">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="text-left px-4 py-2.5 font-semibold text-slate-600 sticky left-0 bg-slate-50 min-w-[180px]">Empleado</th>
                                        {colsDescuento.map(c => (
                                            <th key={c.codigo} className="text-right px-3 py-2.5 font-semibold text-red-600 min-w-[110px]">
                                                <span className="block text-[9px] font-mono text-slate-400">{c.codigo}</span>
                                                {c.nombre}
                                            </th>
                                        ))}
                                        <th className="text-right px-3 py-2.5 font-bold text-red-800 min-w-[90px] border-l border-red-200">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {cabs.map(cab => (
                                        <tr key={cab.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-2 font-medium text-slate-800 sticky left-0 bg-white">
                                                {cab.empleado?.apellidos}, {cab.empleado?.nombres}
                                            </td>
                                            {colsDescuento.map(c => (
                                                <td key={c.codigo} className="px-3 py-2 text-right text-red-600">
                                                    {getMonto(cab, c.codigo) !== 0
                                                        ? fmt(getMonto(cab, c.codigo))
                                                        : <span className="text-slate-300">—</span>}
                                                </td>
                                            ))}
                                            <td className="px-3 py-2 text-right font-bold text-red-700 border-l border-red-100">
                                                {fmt(cab.total_descuentos)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                                    <tr>
                                        <td className="px-4 py-2.5 font-bold text-slate-800 sticky left-0 bg-slate-50">TOTALES</td>
                                        {colsDescuento.map(c => (
                                            <td key={c.codigo} className="px-3 py-2.5 text-right font-bold text-red-700">
                                                {fmt(cabs.reduce((s, cab) => s + getMonto(cab, c.codigo), 0))}
                                            </td>
                                        ))}
                                        <td className="px-3 py-2.5 text-right font-bold text-red-800 border-l border-red-200">
                                            {fmt(cabs.reduce((s, c) => s + c.total_descuentos, 0))}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        )}
                    </div>
                )}
            </div>
        </>
    )
}
