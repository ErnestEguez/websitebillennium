import { useEffect, useRef, useState } from 'react'
import { useReactToPrint } from 'react-to-print'
import { FileText, Loader2, AlertCircle, X, Download, Printer } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { formatMoneda, mesNombre } from '../../../lib/utils'

// ── Tipos ──────────────────────────────────────────────────────────────────

interface FacturaVenta {
    id: string
    fecha: string
    ruc: string
    nombre: string
    numero: string
    base_0: number
    base_5: number
    iva_5: number
    base_15: number
    iva_15: number
    total: number
    estado_sistema: 'VIGENTE' | 'ANULADA'
    fecha_anulacion: string | null
    motivo_anulacion: string | null
}

// ── Componente ─────────────────────────────────────────────────────────────

export function ConsultaFacturasVentasPage() {
    const { empresa } = useAuth() as any

    const [año, setAño]           = useState(new Date().getFullYear())
    const [mes, setMes]           = useState(new Date().getMonth() + 1)
    const [busqueda, setBusqueda] = useState('')
    const [vista, setVista]       = useState<'vigentes' | 'anuladas'>('vigentes')

    const [datos, setDatos]       = useState<FacturaVenta[]>([])
    const [cargando, setCargando] = useState(false)
    const [error, setError]       = useState('')

    const printRef = useRef<HTMLDivElement>(null)
    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: `Facturas_Ventas_${empresa?.ruc ?? 'RUC'}_${año}${String(mes).padStart(2, '0')}`,
    })

    useEffect(() => {
        if (empresa?.id) cargar()
    }, [empresa?.id, año, mes])

    async function cargar() {
        if (!empresa?.id) return
        setCargando(true)
        setError('')

        const mesStr = String(mes).padStart(2, '0')
        const desde  = `${año}-${mesStr}-01`
        const hastaD = new Date(año, mes, 0).getDate()
        const hasta  = `${año}-${mesStr}-${hastaD}`

        const { data, error: err } = await supabase
            .from('comprobantes')
            .select(`id, secuencial, created_at, total, estado_sri, estado_sistema,
                     fecha_anulacion, motivo_anulacion,
                     cliente:clientes(identificacion, nombre),
                     comprobante_detalles(subtotal, iva_porcentaje, iva_valor)`)
            .eq('empresa_id', empresa.id)
            .eq('tipo_comprobante', 'FACTURA')
            .eq('estado_sri', 'AUTORIZADO')
            .gte('created_at', `${desde}T00:00:00`)
            .lte('created_at', `${hasta}T23:59:59`)
            .order('created_at', { ascending: true })

        if (err) { setError(err.message); setCargando(false); return }

        const rows: FacturaVenta[] = (data ?? []).map((r: any) => {
            const dets = r.comprobante_detalles ?? []
            let b0 = 0, b5 = 0, iv5 = 0, b15 = 0, iv15 = 0
            for (const d of dets) {
                const pct = d.iva_porcentaje ?? 0
                const sub = d.subtotal  ?? 0
                const ivd = d.iva_valor ?? 0
                if (pct === 0)      { b0  += sub }
                else if (pct === 5) { b5  += sub; iv5  += ivd }
                else                { b15 += sub; iv15 += ivd }
            }
            return {
                id:      r.id,
                fecha:   (r.created_at as string).slice(0, 10),
                ruc:     r.cliente?.identificacion ?? '',
                nombre:  r.cliente?.nombre ?? '',
                numero:  r.secuencial ?? '',
                base_0:  Math.round(b0   * 100) / 100,
                base_5:  Math.round(b5   * 100) / 100,
                iva_5:   Math.round(iv5  * 100) / 100,
                base_15: Math.round(b15  * 100) / 100,
                iva_15:  Math.round(iv15 * 100) / 100,
                total:   r.total ?? 0,
                estado_sistema:   (r.estado_sistema === 'ANULADA' ? 'ANULADA' : 'VIGENTE') as 'VIGENTE' | 'ANULADA',
                fecha_anulacion:  r.fecha_anulacion ?? null,
                motivo_anulacion: r.motivo_anulacion ?? null,
            }
        })

        setDatos(rows)
        setCargando(false)
    }

    const datosVista = datos.filter(r => vista === 'anuladas' ? r.estado_sistema === 'ANULADA' : r.estado_sistema !== 'ANULADA')

    const filtradas = datosVista.filter(r => {
        if (!busqueda.trim()) return true
        const b = busqueda.toLowerCase()
        return (
            r.nombre.toLowerCase().includes(b) ||
            r.ruc.includes(b) ||
            r.numero.includes(b)
        )
    })

    // ── Totales ────────────────────────────────────────────────────────────

    const tot = {
        base_0:  filtradas.reduce((s, r) => s + r.base_0,  0),
        base_5:  filtradas.reduce((s, r) => s + r.base_5,  0),
        iva_5:   filtradas.reduce((s, r) => s + r.iva_5,   0),
        base_15: filtradas.reduce((s, r) => s + r.base_15, 0),
        iva_15:  filtradas.reduce((s, r) => s + r.iva_15,  0),
        total:   filtradas.reduce((s, r) => s + r.total,   0),
    }

    // ── Excel ──────────────────────────────────────────────────────────────

    function exportarExcel() {
        const esAnuladas = vista === 'anuladas'
        const estadoLabel = esAnuladas ? 'ANULADAS' : 'VIGENTES'

        const colHeaders = [
            'Fecha', 'Cédula/RUC', 'Nombre', 'No. Factura',
            ...(esAnuladas ? ['Fecha Anulación', 'Motivo Anulación'] : []),
            'Base 0%', 'Base 5%', 'IVA 5%', 'Base 15%', 'IVA 15%', 'Total',
        ]

        const filas: (string | number)[][] = [
            ['Empresa:', empresa?.nombre ?? ''],
            ['RUC:', empresa?.ruc ?? ''],
            ['Período:', periodo],
            ['Estado:', estadoLabel],
            [],
            colHeaders,
            ...filtradas.map(r => [
                r.fecha, r.ruc, r.nombre, r.numero,
                ...(esAnuladas ? [r.fecha_anulacion ? r.fecha_anulacion.slice(0, 10) : '', r.motivo_anulacion ?? ''] : []),
                r.base_0, r.base_5, r.iva_5, r.base_15, r.iva_15, r.total,
            ]),
            [
                'TOTALES', '', '', '',
                ...(esAnuladas ? ['', ''] : []),
                tot.base_0, tot.base_5, tot.iva_5, tot.base_15, tot.iva_15, tot.total,
            ],
        ]

        const ws = XLSX.utils.aoa_to_sheet(filas)
        // Ancho de columnas
        ws['!cols'] = [
            { wch: 12 }, { wch: 15 }, { wch: 35 }, { wch: 20 },
            ...(esAnuladas ? [{ wch: 14 }, { wch: 30 }] : []),
            { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 12 },
        ]
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, `Facturas ${esAnuladas ? 'Anuladas' : 'Vigentes'}`)
        XLSX.writeFile(wb, `FacturasVentas_${estadoLabel}_${empresa?.ruc ?? 'RUC'}_${año}${String(mes).padStart(2, '0')}.xlsx`)
    }

    // ── Render ─────────────────────────────────────────────────────────────

    const periodo = `${mesNombre(mes)} ${año}`
    const f2 = (n: number) => n.toFixed(2)

    return (
        <div className="space-y-5 max-w-full">
            {/* Print styles */}
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                    #print-ventas { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    table { font-size: 9px; }
                    th, td { padding: 3px 5px !important; }
                }
            `}</style>

            {/* Header */}
            <div className="no-print">
                <h1 className="text-2xl font-bold text-slate-900">Facturas Autorizadas — Ventas</h1>
                <p className="text-slate-500 text-sm mt-0.5">Facturas electrónicas autorizadas por el SRI — {periodo}</p>
            </div>

            {/* Tabs Vigentes / Anuladas */}
            <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit no-print">
                <button
                    onClick={() => setVista('vigentes')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${vista === 'vigentes' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}
                >
                    Vigentes ({datos.filter(r => r.estado_sistema !== 'ANULADA').length})
                </button>
                <button
                    onClick={() => setVista('anuladas')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${vista === 'anuladas' ? 'bg-white text-red-700 shadow-sm' : 'text-slate-500'}`}
                >
                    Anuladas ({datos.filter(r => r.estado_sistema === 'ANULADA').length})
                </button>
            </div>

            {error && (
                <div className="card px-5 py-3 bg-red-50 border-red-200 text-red-700 text-sm flex items-center gap-2 no-print">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{error}</span>
                    <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
                </div>
            )}

            {/* Filtros */}
            <div className="card p-5 no-print">
                <div className="flex flex-wrap gap-4 items-end">
                    <div>
                        <label className="label">Año</label>
                        <select className="input" value={año} onChange={e => setAño(+e.target.value)}>
                            {[2023, 2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="label">Mes</label>
                        <select className="input" value={mes} onChange={e => setMes(+e.target.value)}>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                <option key={m} value={m}>{mesNombre(m)}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="label">Buscar</label>
                        <input
                            className="input"
                            placeholder="Nombre, RUC/CI, número de factura..."
                            value={busqueda}
                            onChange={e => setBusqueda(e.target.value)}
                        />
                    </div>
                    <div className="flex gap-2">
                        <button onClick={exportarExcel} disabled={filtradas.length === 0} className="btn btn-secondary gap-2">
                            <Download className="w-4 h-4" /> Excel
                        </button>
                        <button onClick={() => handlePrint()} disabled={filtradas.length === 0} className="btn btn-secondary gap-2">
                            <Printer className="w-4 h-4" /> Imprimir
                        </button>
                    </div>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 no-print">
                <div className="card p-4">
                    <p className={`text-xl font-bold ${vista === 'anuladas' ? 'text-red-600' : 'text-emerald-600'}`}>{filtradas.length}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Facturas {vista === 'anuladas' ? 'anuladas' : 'vigentes'}</p>
                </div>
                <div className="card p-4">
                    <p className="text-xl font-bold text-slate-700">{formatMoneda(tot.base_0)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Total Base 0%</p>
                </div>
                <div className="card p-4">
                    <p className="text-xl font-bold text-blue-700">{formatMoneda(tot.base_5 + tot.base_15)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Total Base Gravada</p>
                </div>
                <div className="card p-4">
                    <p className="text-xl font-bold text-indigo-700">{formatMoneda(tot.iva_5 + tot.iva_15)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Total IVA</p>
                </div>
                <div className="card p-4">
                    <p className="text-xl font-bold text-slate-900">{formatMoneda(tot.total)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Total General</p>
                </div>
            </div>

            {/* Tabla */}
            <div id="print-ventas" ref={printRef} className="card overflow-hidden">
                {/* Encabezado del reporte — visible en impresión */}
                <div className="hidden print:block px-6 pt-5 pb-3 border-b">
                    <div className="flex justify-between items-start">
                        <div>
                            <h2 className="text-lg font-bold">{empresa?.nombre ?? 'Empresa'}</h2>
                            <p className="text-sm text-gray-600">RUC: {empresa?.ruc ?? ''}</p>
                        </div>
                        <div className="text-right">
                            <h3 className="text-base font-bold uppercase">Facturas {vista === 'anuladas' ? 'Anuladas' : 'Vigentes'} — Ventas</h3>
                            <p className="text-sm text-gray-600">Período: {periodo}</p>
                            <p className="text-xs text-gray-400">Generado: {new Date().toLocaleString('es-EC')}</p>
                        </div>
                    </div>
                </div>

                <div className="bg-emerald-700 px-5 py-3 text-white font-bold text-sm flex items-center gap-2 print:hidden">
                    <FileText className="w-4 h-4" />
                    Facturas {vista === 'anuladas' ? 'Anuladas' : 'Vigentes'} — {periodo}
                    {filtradas.length !== datosVista.length && (
                        <span className="ml-2 text-xs font-normal opacity-80">
                            ({filtradas.length} de {datosVista.length})
                        </span>
                    )}
                </div>

                {cargando ? (
                    <div className="py-12 text-center text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando...
                    </div>
                ) : filtradas.length === 0 ? (
                    <div className="py-12 text-center text-slate-400">
                        <FileText className="w-10 h-10 mx-auto mb-2 opacity-20" />
                        <p>Sin facturas {vista === 'anuladas' ? 'anuladas' : 'vigentes'} para el período seleccionado.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                            <thead>
                                {/* Fila 1 — grupos */}
                                <tr className="bg-slate-700 text-white text-center">
                                    <th rowSpan={2} className="py-2 px-3 text-left border border-slate-600 whitespace-nowrap">#</th>
                                    <th rowSpan={2} className="py-2 px-3 text-left border border-slate-600 whitespace-nowrap">Fecha</th>
                                    <th rowSpan={2} className="py-2 px-3 border border-slate-600 whitespace-nowrap">Cédula/RUC</th>
                                    <th rowSpan={2} className="py-2 px-3 text-left border border-slate-600 min-w-[160px]">Nombre Cliente</th>
                                    <th rowSpan={2} className="py-2 px-3 border border-slate-600 whitespace-nowrap">No. Factura</th>
                                    {vista === 'anuladas' && (
                                        <>
                                            <th rowSpan={2} className="py-2 px-3 border border-slate-600 whitespace-nowrap">Fecha Anulación</th>
                                            <th rowSpan={2} className="py-2 px-3 text-left border border-slate-600 min-w-[160px]">Motivo</th>
                                        </>
                                    )}
                                    <th rowSpan={2} className="py-2 px-3 text-right border border-slate-600 whitespace-nowrap">Base 0%</th>
                                    <th colSpan={2} className="py-2 px-3 border border-slate-500 bg-blue-800 whitespace-nowrap">IVA 5%</th>
                                    <th colSpan={2} className="py-2 px-3 border border-slate-500 bg-indigo-800 whitespace-nowrap">IVA 15%</th>
                                    <th rowSpan={2} className="py-2 px-3 text-right border border-slate-600 whitespace-nowrap">Total</th>
                                </tr>
                                {/* Fila 2 — sub-columnas IVA */}
                                <tr className="bg-slate-600 text-slate-200 text-center">
                                    <th className="py-1.5 px-3 border border-slate-500 font-normal whitespace-nowrap">Base 5%</th>
                                    <th className="py-1.5 px-3 border border-slate-500 font-normal whitespace-nowrap">IVA 5%</th>
                                    <th className="py-1.5 px-3 border border-slate-500 font-normal whitespace-nowrap">Base 15%</th>
                                    <th className="py-1.5 px-3 border border-slate-500 font-normal whitespace-nowrap">IVA 15%</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtradas.map((r, idx) => (
                                    <tr key={r.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                        <td className="py-1.5 px-3 border border-slate-200 text-slate-400 text-center">{idx + 1}</td>
                                        <td className="py-1.5 px-3 border border-slate-200 whitespace-nowrap">{r.fecha}</td>
                                        <td className="py-1.5 px-3 border border-slate-200 font-mono whitespace-nowrap text-center">{r.ruc}</td>
                                        <td className="py-1.5 px-3 border border-slate-200">{r.nombre}</td>
                                        <td className="py-1.5 px-3 border border-slate-200 font-mono whitespace-nowrap text-center">{r.numero}</td>
                                        {vista === 'anuladas' && (
                                            <>
                                                <td className="py-1.5 px-3 border border-slate-200 whitespace-nowrap">
                                                    {r.fecha_anulacion ? new Date(r.fecha_anulacion).toLocaleDateString('es-EC') : '—'}
                                                </td>
                                                <td className="py-1.5 px-3 border border-slate-200">{r.motivo_anulacion ?? '—'}</td>
                                            </>
                                        )}
                                        <td className="py-1.5 px-3 border border-slate-200 text-right whitespace-nowrap">
                                            {r.base_0 > 0 ? f2(r.base_0) : '—'}
                                        </td>
                                        <td className="py-1.5 px-3 border border-slate-200 text-right whitespace-nowrap bg-blue-50">
                                            {r.base_5 > 0 ? f2(r.base_5) : '—'}
                                        </td>
                                        <td className="py-1.5 px-3 border border-slate-200 text-right whitespace-nowrap bg-blue-50 font-medium text-blue-700">
                                            {r.iva_5 > 0 ? f2(r.iva_5) : '—'}
                                        </td>
                                        <td className="py-1.5 px-3 border border-slate-200 text-right whitespace-nowrap bg-indigo-50">
                                            {r.base_15 > 0 ? f2(r.base_15) : '—'}
                                        </td>
                                        <td className="py-1.5 px-3 border border-slate-200 text-right whitespace-nowrap bg-indigo-50 font-medium text-indigo-700">
                                            {r.iva_15 > 0 ? f2(r.iva_15) : '—'}
                                        </td>
                                        <td className="py-1.5 px-3 border border-slate-200 text-right font-semibold whitespace-nowrap">
                                            {f2(r.total)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="bg-slate-100 border-t-2 border-slate-500 font-bold text-sm">
                                    <td colSpan={vista === 'anuladas' ? 7 : 5} className="py-2 px-3 text-right text-slate-600 uppercase text-xs border border-slate-300">
                                        TOTALES ({filtradas.length} facturas)
                                    </td>
                                    <td className="py-2 px-3 text-right border border-slate-300 whitespace-nowrap">{f2(tot.base_0)}</td>
                                    <td className="py-2 px-3 text-right border border-slate-300 whitespace-nowrap bg-blue-100">{f2(tot.base_5)}</td>
                                    <td className="py-2 px-3 text-right border border-slate-300 whitespace-nowrap bg-blue-100 text-blue-700">{f2(tot.iva_5)}</td>
                                    <td className="py-2 px-3 text-right border border-slate-300 whitespace-nowrap bg-indigo-100">{f2(tot.base_15)}</td>
                                    <td className="py-2 px-3 text-right border border-slate-300 whitespace-nowrap bg-indigo-100 text-indigo-700">{f2(tot.iva_15)}</td>
                                    <td className="py-2 px-3 text-right border border-slate-300 whitespace-nowrap">{f2(tot.total)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
