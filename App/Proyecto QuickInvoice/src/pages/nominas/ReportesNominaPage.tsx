import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Printer, Loader2, FileSpreadsheet, Receipt } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { periodoNominaService } from '../../services/nominas/periodoNominaService'
import { useAuth } from '../../contexts/AuthContext'
import type { PeriodoNomina } from '../../types/nominas'
import { cn } from '../../lib/utils'
import * as XLSX from 'xlsx'

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
    horas?: number | null
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

type Vista = 'completo' | 'resumido' | 'descuentos' | 'papeletas'

export function ReportesNominaPage() {
    const { periodoId } = useParams<{ periodoId: string }>()
    const { empresa }   = useAuth() as any
    const navigate      = useNavigate()

    const [periodo, setPeriodo] = useState<PeriodoNomina | null>(null)
    const [cabs, setCabs]       = useState<CabeceraConLineas[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError]     = useState<string | null>(null)
    const [vista, setVista]     = useState<Vista>('completo')

    const originalTitle = useRef(document.title)

    // Cambiar título del documento al imprimir (aparece en el encabezado del browser)
    useEffect(() => {
        const nombreEmp = empresa?.nombre ?? ''
        const onBefore = () => {
            document.title = nombreEmp
                ? `${nombreEmp} — ${periodo?.nombre ?? ''}`
                : document.title
        }
        const onAfter = () => { document.title = originalTitle.current }
        window.addEventListener('beforeprint', onBefore)
        window.addEventListener('afterprint',  onAfter)
        return () => {
            window.removeEventListener('beforeprint', onBefore)
            window.removeEventListener('afterprint',  onAfter)
        }
    }, [empresa?.nombre, periodo?.nombre])

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
                    .select('id, empleado_id, sueldo_base, total_ingresos, total_descuentos, neto, empleado:empleados(nombres, apellidos, cargo:cargos(nombre)), lineas:rol_lineas(codigo, nombre, tipo, monto, orden, horas)')
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

    // Días trabajados: base (30 o 15) menos días de falta (campo horas de DIAS_FALTA)
    function getDias(cab: CabeceraConLineas): number {
        const base = periodo?.tipo_nomina === 'mensual' ? 30 : 15
        const falta = cab.lineas.find(l => l.codigo === 'DIAS_FALTA')
        return Math.max(0, base - (falta?.horas ?? 0))
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

    const esLiquidado = periodo?.estado === 'liquidado'
    const esBorrador  = periodo?.estado !== 'liquidado'

    // ── Excel export ────────────────────────────────────────────────────────────

    function exportarExcel() {
        if (vista === 'resumido')   exportResumido()
        else if (vista === 'completo') exportCompleto()
        else exportDescuentos()
    }

    function exportResumido() {
        const nombre = periodo!.nombre.replace(/\s+/g, '_')
        const encabezado = [
            [`${empresa?.nombre ?? 'Empresa'} — Rol de Pagos — Resumen — ${periodo!.nombre}`],
            [`${fmtFecha(periodo!.fecha_inicio)} – ${fmtFecha(periodo!.fecha_fin)}`],
            esBorrador ? ['BORRADOR — No es documento oficial'] : [],
            [],
        ]
        const cols = ['Empleado', 'Cargo', 'Días Trabajados', 'Sueldo Base', 'Total Ingresos', 'Total Descuentos', 'Neto a Recibir']
        const filas = cabs.map(cab => [
            `${cab.empleado?.apellidos ?? ''}, ${cab.empleado?.nombres ?? ''}`,
            cab.empleado?.cargo?.nombre ?? '',
            getDias(cab),
            cab.sueldo_base,
            cab.total_ingresos,
            cab.total_descuentos,
            cab.neto,
        ])
        const totales = ['TOTALES', '', '',
            cabs.reduce((s, c) => s + c.sueldo_base, 0),
            cabs.reduce((s, c) => s + c.total_ingresos, 0),
            cabs.reduce((s, c) => s + c.total_descuentos, 0),
            cabs.reduce((s, c) => s + c.neto, 0),
        ]
        const ws = XLSX.utils.aoa_to_sheet([...encabezado, cols, ...filas, totales])
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Rol Resumido')
        XLSX.writeFile(wb, `rol_resumido_${nombre}.xlsx`)
    }

    function exportCompleto() {
        const nombre = periodo!.nombre.replace(/\s+/g, '_')
        const encabezado = [
            [`${empresa?.nombre ?? 'Empresa'} — Rol de Pagos — Completo — ${periodo!.nombre}`],
            [`${fmtFecha(periodo!.fecha_inicio)} – ${fmtFecha(periodo!.fecha_fin)}`],
            esBorrador ? ['BORRADOR — No es documento oficial'] : [],
            [],
        ]
        const cols = [
            'Empleado', 'Cargo', 'Días',
            ...colsIngreso.map(c => c.nombre), 'Total Ingresos',
            ...colsDescuento.map(c => c.nombre), 'Total Descuentos',
            'Neto',
        ]
        const filas = cabs.map(cab => [
            `${cab.empleado?.apellidos ?? ''}, ${cab.empleado?.nombres ?? ''}`,
            cab.empleado?.cargo?.nombre ?? '',
            getDias(cab),
            ...colsIngreso.map(c => getMonto(cab, c.codigo) || ''),
            cab.total_ingresos,
            ...colsDescuento.map(c => getMonto(cab, c.codigo) || ''),
            cab.total_descuentos,
            cab.neto,
        ])
        const totales = [
            'TOTALES', '', '',
            ...colsIngreso.map(c => cabs.reduce((s, cab) => s + getMonto(cab, c.codigo), 0)),
            cabs.reduce((s, c) => s + c.total_ingresos, 0),
            ...colsDescuento.map(c => cabs.reduce((s, cab) => s + getMonto(cab, c.codigo), 0)),
            cabs.reduce((s, c) => s + c.total_descuentos, 0),
            cabs.reduce((s, c) => s + c.neto, 0),
        ]
        const ws = XLSX.utils.aoa_to_sheet([...encabezado, cols, ...filas, totales])
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Rol Completo')
        XLSX.writeFile(wb, `rol_completo_${nombre}.xlsx`)
    }

    function exportDescuentos() {
        const nombre = periodo!.nombre.replace(/\s+/g, '_')
        const encabezado = [
            [`${empresa?.nombre ?? 'Empresa'} — Auxiliar de Descuentos — ${periodo!.nombre}`],
            [`${fmtFecha(periodo!.fecha_inicio)} – ${fmtFecha(periodo!.fecha_fin)}`],
            esBorrador ? ['BORRADOR — No es documento oficial'] : [],
            [],
        ]
        const cols = ['Empleado', ...colsDescuento.map(c => c.nombre), 'Total Descuentos']
        const filas = cabs.map(cab => [
            `${cab.empleado?.apellidos ?? ''}, ${cab.empleado?.nombres ?? ''}`,
            ...colsDescuento.map(c => getMonto(cab, c.codigo) || ''),
            cab.total_descuentos,
        ])
        const totales = [
            'TOTALES',
            ...colsDescuento.map(c => cabs.reduce((s, cab) => s + getMonto(cab, c.codigo), 0)),
            cabs.reduce((s, c) => s + c.total_descuentos, 0),
        ]
        const ws = XLSX.utils.aoa_to_sheet([...encabezado, cols, ...filas, totales])
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Aux Descuentos')
        XLSX.writeFile(wb, `auxiliar_descuentos_${nombre}.xlsx`)
    }

    // ────────────────────────────────────────────────────────────────────────────

    if (loading) return (
        <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
    )

    if (!periodo) return (
        <div className="text-center py-20 text-slate-400">Período no encontrado.</div>
    )

    const VISTA_LABELS: Record<Vista, string> = {
        completo:   'Rol Completo',
        resumido:   'Rol Resumido',
        descuentos: 'Auxiliar Descuentos',
        papeletas:  'Papeletas Individuales',
    }

    // Totales globales para el pie de tablas
    const totalIngresos   = cabs.reduce((s, c) => s + c.total_ingresos,   0)
    const totalDescuentos = cabs.reduce((s, c) => s + c.total_descuentos, 0)
    const totalNeto       = cabs.reduce((s, c) => s + c.neto,             0)

    return (
        <>
            {/* Estilos de impresión — landscape SOLO para Rol Completo */}
            <style>{`
                ${vista === 'completo'
                    ? '@page { size: landscape; margin: 1cm; }'
                    : '@page { size: A4 portrait; margin: 1.5cm; }'}
                @media print {
                    .no-print { display: none !important; }
                    body { font-size: 9px; }
                    table { font-size: 8px; border-collapse: collapse; width: 100%; }
                    th, td { padding: 3px 5px !important; border: 1px solid #e2e8f0; }
                    .page-header { margin-bottom: 8px; }
                    .papeleta-item { page-break-after: always; break-after: page; border: 1px solid #94a3b8; padding: 16px; margin-bottom: 0; }
                    .papeleta-item:last-child { page-break-after: avoid; break-after: avoid; }
                }
            `}</style>

            {/* Marca de agua BORRADOR — fija, visible solo al imprimir */}
            {esBorrador && (
                <div style={{
                    position: 'fixed', top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%) rotate(-45deg)',
                    fontSize: '100px', fontWeight: 900,
                    color: 'rgba(239, 68, 68, 0.10)',
                    zIndex: 9999, pointerEvents: 'none',
                    whiteSpace: 'nowrap', userSelect: 'none',
                    display: 'none',
                }} className="print:block">
                    BORRADOR
                </div>
            )}

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
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold text-slate-900">Reportes — {periodo.nombre}</h1>
                            {esBorrador && (
                                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-bold rounded-full border border-amber-300">
                                    BORRADOR
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-slate-400">
                            {fmtFecha(periodo.fecha_inicio)} – {fmtFecha(periodo.fecha_fin)}
                        </p>
                    </div>
                </div>

                {error && (
                    <div className="no-print bg-red-50 text-red-700 border border-red-200 rounded-xl px-4 py-3 text-sm">
                        {error}
                    </div>
                )}

                {/* Tabs + botones de acción */}
                <div className="no-print flex flex-wrap items-center gap-3">
                    <div className="flex gap-1 bg-slate-100 rounded-xl p-1 flex-wrap">
                        {([
                            ['completo',   'Rol Completo'],
                            ['resumido',   'Rol Resumido'],
                            ['descuentos', 'Auxiliar Descuentos'],
                            ...(esLiquidado ? [['papeletas', 'Papeletas']] : []),
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

                    {/* Botones imprimir + excel */}
                    <div className="flex items-center gap-2 ml-auto">
                        <button
                            onClick={() => window.print()}
                            className="flex items-center gap-2 border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                        >
                            <Printer className="w-4 h-4" />
                            Imprimir {VISTA_LABELS[vista]}
                        </button>
                        {vista !== 'papeletas' && (
                            <button
                                onClick={exportarExcel}
                                className="flex items-center gap-2 border border-emerald-400 text-emerald-700 hover:bg-emerald-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                            >
                                <FileSpreadsheet className="w-4 h-4" />
                                Excel
                            </button>
                        )}
                        {!esLiquidado && (
                            <button
                                onClick={() => setVista('papeletas')}
                                disabled
                                title="Papeletas disponibles solo después de Liquidación Definitiva"
                                className="flex items-center gap-2 border border-slate-200 text-slate-400 px-4 py-2 rounded-xl text-sm font-medium cursor-not-allowed opacity-60"
                            >
                                <Receipt className="w-4 h-4" />
                                Papeletas
                            </button>
                        )}
                    </div>
                </div>

                {/* ── ENCABEZADO IMPRESO (visible solo al imprimir) ── */}
                <div className="page-header text-center hidden print:block mb-4">
                    <p className="font-bold text-lg uppercase tracking-wide">
                        {empresa?.nombre ?? ''}
                    </p>
                    <p className="text-sm font-semibold mt-0.5">ROL DE PAGOS</p>
                    <p className="text-xs mt-0.5">{periodo.nombre}</p>
                    <p className="text-xs">{fmtFecha(periodo.fecha_inicio)} – {fmtFecha(periodo.fecha_fin)}</p>
                    <p className="text-xs font-semibold mt-0.5">{VISTA_LABELS[vista]}</p>
                    {esBorrador && (
                        <p className="text-xs font-bold text-red-600 mt-1 border border-red-300 inline-block px-3 py-0.5 rounded">
                            *** BORRADOR — No es documento oficial ***
                        </p>
                    )}
                    <hr className="mt-2 border-slate-400" />
                </div>

                {/* ── ROL COMPLETO (pivot, landscape) ──────────────────── */}
                {vista === 'completo' && (
                    <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200">
                        <table className="w-full text-xs whitespace-nowrap">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                {/* Fila de sección INGRESOS / DESCUENTOS */}
                                <tr className="text-[10px]">
                                    <th colSpan={3} className="bg-white border-b-0"></th>
                                    <th
                                        colSpan={colsIngreso.length + 1}
                                        className="text-center px-2 py-1 font-bold text-emerald-800 bg-emerald-50 border-b border-emerald-200 border-l border-l-emerald-300"
                                    >
                                        ── INGRESOS ──
                                    </th>
                                    <th
                                        colSpan={colsDescuento.length + 1}
                                        className="text-center px-2 py-1 font-bold text-red-700 bg-red-50 border-b border-red-200 border-l border-l-red-300"
                                    >
                                        ── DESCUENTOS ──
                                    </th>
                                    <th className="bg-white border-b-0"></th>
                                </tr>
                                {/* Fila de columnas */}
                                <tr>
                                    <th className="text-left px-3 py-2.5 font-semibold text-slate-600 sticky left-0 bg-slate-50 z-10 min-w-[180px]">Empleado</th>
                                    <th className="text-left px-3 py-2.5 font-semibold text-slate-500 min-w-[120px]">Cargo</th>
                                    <th className="text-center px-3 py-2.5 font-semibold text-slate-500 min-w-[55px]">Días</th>
                                    {colsIngreso.map(c => (
                                        <th key={c.codigo} className="text-right px-3 py-2.5 font-semibold text-emerald-700 min-w-[90px]">
                                            <span className="block text-[9px] font-mono text-slate-400">{c.codigo}</span>
                                            {c.nombre}
                                        </th>
                                    ))}
                                    <th className="text-right px-3 py-2.5 font-bold text-emerald-800 min-w-[90px] border-l border-emerald-200">Total Ing.</th>
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
                                        <td className="px-3 py-2 text-center font-medium text-slate-700">{getDias(cab)}</td>
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
                                    <td colSpan={3} className="px-3 py-2.5 font-bold text-slate-800 sticky left-0 bg-slate-50">TOTALES</td>
                                    {colsIngreso.map(c => (
                                        <td key={c.codigo} className="px-3 py-2.5 text-right font-bold text-emerald-800">
                                            {fmt(cabs.reduce((s, cab) => s + getMonto(cab, c.codigo), 0))}
                                        </td>
                                    ))}
                                    <td className="px-3 py-2.5 text-right font-bold text-emerald-900 border-l border-emerald-200">
                                        {fmt(totalIngresos)}
                                    </td>
                                    {colsDescuento.map(c => (
                                        <td key={c.codigo} className="px-3 py-2.5 text-right font-bold text-red-700">
                                            {fmt(cabs.reduce((s, cab) => s + getMonto(cab, c.codigo), 0))}
                                        </td>
                                    ))}
                                    <td className="px-3 py-2.5 text-right font-bold text-red-800 border-l border-red-200">
                                        {fmt(totalDescuentos)}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-bold text-primary-800 border-l border-primary-200">
                                        {fmt(totalNeto)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}

                {/* ── ROL RESUMIDO (portrait) ───────────────────────────── */}
                {vista === 'resumido' && (
                    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                {/* Fila de sección */}
                                <tr className="text-[10px]">
                                    <th colSpan={4} className="bg-white border-b-0"></th>
                                    <th className="text-center py-1 font-bold text-emerald-800 bg-emerald-50 border-b border-emerald-200">
                                        INGRESOS
                                    </th>
                                    <th className="text-center py-1 font-bold text-red-700 bg-red-50 border-b border-red-200">
                                        DESCUENTOS
                                    </th>
                                    <th className="bg-white border-b-0"></th>
                                </tr>
                                <tr>
                                    <th className="text-left px-5 py-3 font-semibold text-slate-600">Empleado</th>
                                    <th className="text-left px-4 py-3 font-semibold text-slate-600">Cargo</th>
                                    <th className="text-center px-3 py-3 font-semibold text-slate-600">Días</th>
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
                                        <td className="px-3 py-3 text-center font-medium text-slate-700">{getDias(cab)}</td>
                                        <td className="px-4 py-3 text-right text-slate-700">${fmt(cab.sueldo_base)}</td>
                                        <td className="px-4 py-3 text-right text-emerald-700 font-medium">${fmt(cab.total_ingresos)}</td>
                                        <td className="px-4 py-3 text-right text-red-600 font-medium">${fmt(cab.total_descuentos)}</td>
                                        <td className="px-4 py-3 text-right text-primary-700 font-bold">${fmt(cab.neto)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                                <tr>
                                    <td colSpan={4} className="px-5 py-3 font-bold text-slate-800">TOTALES</td>
                                    <td className="px-4 py-3 text-right font-bold text-emerald-800">
                                        ${fmt(totalIngresos)}
                                    </td>
                                    <td className="px-4 py-3 text-right font-bold text-red-700">
                                        ${fmt(totalDescuentos)}
                                    </td>
                                    <td className="px-4 py-3 text-right font-bold text-primary-800">
                                        ${fmt(totalNeto)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}

                {/* ── AUXILIAR DE DESCUENTOS (portrait) ────────────────── */}
                {vista === 'descuentos' && (
                    <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200">
                        {colsDescuento.length === 0 ? (
                            <div className="py-16 text-center text-slate-400 text-sm">No hay descuentos en este período.</div>
                        ) : (
                            <table className="w-full text-xs whitespace-nowrap">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    {/* Fila de sección */}
                                    <tr className="text-[10px]">
                                        <th className="bg-white border-b-0"></th>
                                        <th
                                            colSpan={colsDescuento.length + 1}
                                            className="text-center py-1 font-bold text-red-700 bg-red-50 border-b border-red-200"
                                        >
                                            ── DESCUENTOS ──
                                        </th>
                                    </tr>
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
                                            {fmt(totalDescuentos)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        )}
                    </div>
                )}

                {/* ── PAPELETAS INDIVIDUALES (solo liquidado) ───────────── */}
                {vista === 'papeletas' && esLiquidado && (
                    <div className="space-y-6">
                        {/* Aviso pantalla */}
                        <div className="no-print bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-600 flex items-center gap-2">
                            <Receipt className="w-4 h-4 shrink-0" />
                            Se imprimirá una papeleta por empleado. Haz clic en <strong>Imprimir Papeletas Individuales</strong>.
                        </div>

                        {cabs.map((cab, idx) => {
                            const ingresosLineas   = cab.lineas.filter(l => l.tipo === 'ingreso')
                            const descuentosLineas = cab.lineas.filter(l => l.tipo === 'descuento')
                            const diasTrabajados   = getDias(cab)
                            const base             = periodo.tipo_nomina === 'mensual' ? 30 : 15

                            return (
                                <div key={cab.id} className="papeleta-item bg-white rounded-2xl border border-slate-200 p-6 max-w-2xl mx-auto">
                                    {/* Encabezado papeleta */}
                                    <div className="text-center mb-4 pb-3 border-b border-slate-200">
                                        <p className="font-bold text-base uppercase tracking-wide text-slate-900">
                                            {empresa?.nombre ?? ''}
                                        </p>
                                        <p className="text-sm font-semibold text-slate-600 mt-0.5">COMPROBANTE INDIVIDUAL DE PAGO</p>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            {periodo.nombre} · {fmtFecha(periodo.fecha_inicio)} – {fmtFecha(periodo.fecha_fin)}
                                        </p>
                                    </div>

                                    {/* Datos del empleado */}
                                    <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                                        <div>
                                            <span className="text-slate-400 text-xs">Empleado</span>
                                            <p className="font-semibold text-slate-800">
                                                {cab.empleado?.apellidos}, {cab.empleado?.nombres}
                                            </p>
                                        </div>
                                        <div>
                                            <span className="text-slate-400 text-xs">Cargo</span>
                                            <p className="font-semibold text-slate-800">{cab.empleado?.cargo?.nombre ?? '—'}</p>
                                        </div>
                                        <div>
                                            <span className="text-slate-400 text-xs">Sueldo Base</span>
                                            <p className="font-semibold text-slate-800">${fmt(cab.sueldo_base)}</p>
                                        </div>
                                        <div>
                                            <span className="text-slate-400 text-xs">Días Trabajados</span>
                                            <p className={cn('font-semibold', diasTrabajados < base ? 'text-amber-600' : 'text-slate-800')}>
                                                {diasTrabajados} / {base}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Columnas INGRESOS / DESCUENTOS */}
                                    <div className="grid grid-cols-2 gap-4 mb-4">
                                        {/* Ingresos */}
                                        <div>
                                            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2 pb-1 border-b border-emerald-200">
                                                Ingresos
                                            </p>
                                            <div className="space-y-1">
                                                {ingresosLineas.map(l => (
                                                    <div key={l.codigo} className="flex justify-between text-xs">
                                                        <span className="text-slate-600 truncate mr-2">{l.nombre}</span>
                                                        <span className="text-emerald-700 font-medium shrink-0">${fmt(l.monto)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="flex justify-between text-sm font-bold border-t border-emerald-200 mt-2 pt-1.5">
                                                <span className="text-emerald-800">Total Ingresos</span>
                                                <span className="text-emerald-800">${fmt(cab.total_ingresos)}</span>
                                            </div>
                                        </div>

                                        {/* Descuentos */}
                                        <div>
                                            <p className="text-xs font-bold text-red-600 uppercase tracking-wider mb-2 pb-1 border-b border-red-200">
                                                Descuentos
                                            </p>
                                            <div className="space-y-1">
                                                {descuentosLineas.map(l => (
                                                    <div key={l.codigo} className="flex justify-between text-xs">
                                                        <span className="text-slate-600 truncate mr-2">{l.nombre}</span>
                                                        <span className="text-red-600 font-medium shrink-0">${fmt(l.monto)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="flex justify-between text-sm font-bold border-t border-red-200 mt-2 pt-1.5">
                                                <span className="text-red-700">Total Descuentos</span>
                                                <span className="text-red-700">${fmt(cab.total_descuentos)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Neto */}
                                    <div className="flex justify-between items-center bg-primary-50 border border-primary-200 rounded-xl px-4 py-3 mb-6">
                                        <span className="font-bold text-primary-800">NETO A RECIBIR</span>
                                        <span className="font-bold text-xl text-primary-700">${fmt(cab.neto)}</span>
                                    </div>

                                    {/* Firmas */}
                                    <div className="grid grid-cols-2 gap-12 mt-2">
                                        <div className="text-center">
                                            <div className="border-t border-slate-400 pt-2">
                                                <p className="text-xs text-slate-500">Firma Empleador</p>
                                            </div>
                                        </div>
                                        <div className="text-center">
                                            <div className="border-t border-slate-400 pt-2">
                                                <p className="text-xs text-slate-500">
                                                    Firma Empleado — {cab.empleado?.apellidos}, {cab.empleado?.nombres}
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Número de papeleta */}
                                    <p className="text-right text-[10px] text-slate-300 mt-3">
                                        Papeleta {idx + 1} de {cabs.length}
                                    </p>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </>
    )
}
