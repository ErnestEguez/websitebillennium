import { useEffect, useState } from 'react'
import { FileMinus, Loader2, AlertCircle, X, Download } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { formatMoneda, mesNombre } from '../../../lib/utils'

interface NcProveedorFila {
    id: string
    tipo: string
    numero_nc: string | null
    autorizacion_nc: string | null
    fecha_nc: string
    ruc_emisor: string
    nombre_emisor: string
    numero_factura_origen: string | null
    fecha_factura_origen: string | null
    base_cero: number
    base_iva5: number
    base_iva15: number
    valor_iva: number
    total: number
}

const TIPO_LABEL: Record<string, string> = {
    DEVOLUCION_MERCADERIA: 'Devolución Mercadería',
    NC_VALOR: 'N/C Valor',
}

export function ConsultaNcProveedoresPage() {
    const { empresa } = useAuth() as any

    const [año, setAño]           = useState(new Date().getFullYear())
    const [mes, setMes]           = useState(0)
    const [busqueda, setBusqueda] = useState('')

    const [datos, setDatos]       = useState<NcProveedorFila[]>([])
    const [cargando, setCargando] = useState(false)
    const [error, setError]       = useState('')

    useEffect(() => {
        if (empresa?.id) cargar()
    }, [empresa?.id, año, mes])

    async function cargar() {
        if (!empresa?.id) return
        setCargando(true)
        setError('')

        const desde = mes > 0
            ? `${año}-${String(mes).padStart(2, '0')}-01`
            : `${año}-01-01`
        const hasta = mes > 0
            ? `${año}-${String(mes).padStart(2, '0')}-${new Date(año, mes, 0).getDate()}`
            : `${año}-12-31`

        try {
            const { data, error: err } = await supabase
                .from('notas_credito_proveedores')
                .select('id, tipo, numero_nc, autorizacion_nc, fecha_nc, base_iva_0, base_iva_5, base_iva_15, valor_iva, total, proveedor:proveedores(ruc, nombre_empresa), compra:ingresos_stock(numero_factura, fecha_emision)')
                .eq('empresa_id', empresa.id)
                .eq('estado', 'ACTIVA')
                .gte('fecha_nc', desde)
                .lte('fecha_nc', hasta)
                .order('fecha_nc', { ascending: false })

            if (err) { setError(err.message); setDatos([]); return }

            const filas: NcProveedorFila[] = (data ?? []).map((r: any) => ({
                id: r.id,
                tipo: r.tipo,
                numero_nc: r.numero_nc,
                autorizacion_nc: r.autorizacion_nc,
                fecha_nc: r.fecha_nc,
                ruc_emisor: r.proveedor?.ruc ?? '',
                nombre_emisor: r.proveedor?.nombre_empresa ?? '',
                numero_factura_origen: r.compra?.numero_factura ?? null,
                fecha_factura_origen: r.compra?.fecha_emision ?? null,
                base_cero: r.base_iva_0 ?? 0,
                base_iva5: r.base_iva_5 ?? 0,
                base_iva15: r.base_iva_15 ?? 0,
                valor_iva: r.valor_iva ?? 0,
                total: r.total ?? 0,
            }))
            setDatos(filas)
        } catch (e: any) {
            setError(e.message ?? 'Error cargando datos')
        }
        setCargando(false)
    }

    const filtradas = datos.filter(r => {
        if (!busqueda.trim()) return true
        const b = busqueda.toLowerCase()
        return (
            r.nombre_emisor.toLowerCase().includes(b) ||
            r.ruc_emisor.includes(b) ||
            (r.numero_nc ?? '').toLowerCase().includes(b) ||
            (r.numero_factura_origen ?? '').toLowerCase().includes(b)
        )
    })

    const iva5 = (r: NcProveedorFila) => Math.round(r.base_iva5 * 0.05 * 100) / 100
    const iva15 = (r: NcProveedorFila) => Math.round(r.base_iva15 * 0.15 * 100) / 100
    const totalBases = (r: NcProveedorFila) => r.base_cero + r.base_iva5 + r.base_iva15

    const totales = {
        cantidad:   filtradas.length,
        totalBases: filtradas.reduce((s, r) => s + totalBases(r), 0),
        iva:        filtradas.reduce((s, r) => s + r.valor_iva, 0),
        total:      filtradas.reduce((s, r) => s + r.total, 0),
    }

    function exportarExcel() {
        const headers = [
            'numero', 'tipo', 'secuencial', 'clave_autorizacion', 'ruc_emisor', 'nombre_emisor',
            'fecha_emision', 'numero_documento_modificado', 'FECHA_documento_modificado',
            'subtotal_cero', 'subtotal_iva_15', 'subtotal_iva_5', 'Total_Bases',
            'iva 5%', 'iva 15%', 'Total_IVA', 'total_SinImpuestos', 'valor_Modificacion',
        ]

        const filas = filtradas.map((r, i) => [
            i + 1,
            TIPO_LABEL[r.tipo] ?? r.tipo,
            r.numero_nc ?? '',
            r.autorizacion_nc ?? '',
            r.ruc_emisor,
            r.nombre_emisor,
            r.fecha_nc,
            r.numero_factura_origen ?? '',
            r.fecha_factura_origen ?? '',
            r.base_cero,
            r.base_iva15,
            r.base_iva5,
            totalBases(r),
            iva5(r),
            iva15(r),
            r.valor_iva,
            totalBases(r),
            r.total,
        ])

        const filaTotales = [
            '', '', '', '', '', '', 'TOTALES', '', '',
            filtradas.reduce((s, r) => s + r.base_cero, 0),
            filtradas.reduce((s, r) => s + r.base_iva15, 0),
            filtradas.reduce((s, r) => s + r.base_iva5, 0),
            totales.totalBases,
            filtradas.reduce((s, r) => s + iva5(r), 0),
            filtradas.reduce((s, r) => s + iva15(r), 0),
            totales.iva,
            totales.totalBases,
            totales.total,
        ]

        const nombreEmpresa = empresa?.razon_social || empresa?.nombre || ''
        const periodo = `${mes > 0 ? mesNombre(mes) : 'Año completo'} ${año}`

        const aoa = [
            ['Notas de Crédito de Proveedores'],
            [`Empresa: ${nombreEmpresa}`],
            [`Período: ${periodo}`],
            [],
            headers,
            ...filas,
            filaTotales,
        ]

        const ws = XLSX.utils.aoa_to_sheet(aoa)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'NC Proveedores')
        XLSX.writeFile(wb, `NC_Proveedores_${empresa?.ruc ?? 'RUC'}_${año}${mes > 0 ? String(mes).padStart(2, '0') : ''}.xlsx`)
    }

    return (
        <div className="space-y-5 max-w-6xl">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Notas de Crédito de Proveedores</h1>
                <p className="text-slate-500 text-sm mt-0.5">
                    N/C de devolución de mercadería y ajuste de valor registradas en Compras
                </p>
            </div>

            {error && (
                <div className="card px-5 py-3 bg-red-50 border-red-200 text-red-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{error}</span>
                    <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
                </div>
            )}

            <div className="card p-5">
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
                            <option value={0}>Todos</option>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                <option key={m} value={m}>{mesNombre(m)}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1 min-w-[200px]">
                        <label className="label">Buscar</label>
                        <input
                            className="input"
                            placeholder="RUC, nombre, N° N/C, factura..."
                            value={busqueda}
                            onChange={e => setBusqueda(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={exportarExcel}
                        disabled={filtradas.length === 0}
                        className="btn btn-secondary gap-2"
                    >
                        <Download className="w-4 h-4" />
                        Exportar Excel
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'N/C registradas', value: totales.cantidad,                      color: 'text-blue-600' },
                    { label: 'Total Bases',     value: formatMoneda(totales.totalBases),       color: 'text-amber-600' },
                    { label: 'Total IVA',       value: formatMoneda(totales.iva),              color: 'text-indigo-600' },
                    { label: 'Total General',   value: formatMoneda(totales.total),            color: 'text-slate-800' },
                ].map(({ label, value, color }) => (
                    <div key={label} className="card p-4">
                        <p className={`text-xl font-bold ${color}`}>{value}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                    </div>
                ))}
            </div>

            <div className="card overflow-hidden">
                <div className="bg-slate-700 px-5 py-3 text-white font-bold text-sm flex items-center gap-2">
                    <FileMinus className="w-4 h-4" />
                    N/C Proveedores — {mes > 0 ? mesNombre(mes) : 'Año completo'} {año}
                    {filtradas.length !== datos.length && (
                        <span className="ml-2 text-xs font-normal text-slate-300">
                            ({filtradas.length} de {datos.length})
                        </span>
                    )}
                </div>

                {cargando ? (
                    <div className="py-12 text-center text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando...
                    </div>
                ) : filtradas.length === 0 ? (
                    <div className="py-12 text-center text-slate-400">
                        <FileMinus className="w-10 h-10 mx-auto mb-2 opacity-20" />
                        <p>Sin N/C de proveedores para los filtros seleccionados.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                                    <th className="py-2 px-3 text-left">Tipo</th>
                                    <th className="py-2 px-3 text-left">Proveedor</th>
                                    <th className="py-2 px-3 text-left">N° N/C</th>
                                    <th className="py-2 px-3 text-left">Factura Origen</th>
                                    <th className="py-2 px-3 text-left">Fecha N/C</th>
                                    <th className="py-2 px-3 text-right">Base 0%</th>
                                    <th className="py-2 px-3 text-right">Base 5%</th>
                                    <th className="py-2 px-3 text-right">Base 15%</th>
                                    <th className="py-2 px-3 text-right">Total Bases</th>
                                    <th className="py-2 px-3 text-right">IVA</th>
                                    <th className="py-2 px-3 text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtradas.map(r => (
                                    <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                                        <td className="py-2 px-3 text-xs text-slate-600">{TIPO_LABEL[r.tipo] ?? r.tipo}</td>
                                        <td className="py-2 px-3">
                                            <div className="font-medium text-slate-700 text-xs">{r.nombre_emisor}</div>
                                            <div className="text-slate-400 text-xs font-mono">{r.ruc_emisor}</div>
                                        </td>
                                        <td className="py-2 px-3 font-mono text-xs text-slate-600">{r.numero_nc || '—'}</td>
                                        <td className="py-2 px-3 font-mono text-xs text-slate-600">{r.numero_factura_origen || '—'}</td>
                                        <td className="py-2 px-3 text-xs text-slate-500">{r.fecha_nc}</td>
                                        <td className="py-2 px-3 text-right text-xs">{r.base_cero > 0 ? formatMoneda(r.base_cero) : '—'}</td>
                                        <td className="py-2 px-3 text-right text-xs">{r.base_iva5 > 0 ? formatMoneda(r.base_iva5) : '—'}</td>
                                        <td className="py-2 px-3 text-right text-xs">{r.base_iva15 > 0 ? formatMoneda(r.base_iva15) : '—'}</td>
                                        <td className="py-2 px-3 text-right text-xs font-medium">{formatMoneda(totalBases(r))}</td>
                                        <td className="py-2 px-3 text-right text-xs">{r.valor_iva > 0 ? formatMoneda(r.valor_iva) : '—'}</td>
                                        <td className="py-2 px-3 text-right font-semibold text-xs">{formatMoneda(r.total)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="bg-slate-50 border-t-2 font-semibold text-sm">
                                    <td colSpan={5} className="py-2.5 px-3 text-right text-xs text-slate-500 uppercase">Totales</td>
                                    <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(filtradas.reduce((s, r) => s + r.base_cero, 0))}</td>
                                    <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(filtradas.reduce((s, r) => s + r.base_iva5, 0))}</td>
                                    <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(filtradas.reduce((s, r) => s + r.base_iva15, 0))}</td>
                                    <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(totales.totalBases)}</td>
                                    <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(totales.iva)}</td>
                                    <td className="py-2.5 px-3 text-right">{formatMoneda(totales.total)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
