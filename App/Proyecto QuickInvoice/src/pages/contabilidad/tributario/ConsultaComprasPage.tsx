import { useEffect, useState } from 'react'
import { ShoppingCart, Loader2, AlertCircle, X, Download, ChevronDown, ChevronUp } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { cn, formatMoneda, mesNombre } from '../../../lib/utils'

const REGIMEN_LABEL: Record<string, string> = {
    GENERAL: 'Régimen General',
    RIMPE_EMPRENDEDOR: 'RIMPE Emprendedor',
    RIMPE_NEGOCIO_POPULAR: 'RIMPE Negocio Popular',
}
function esRimpe(tipoRegimen: string | null) {
    return tipoRegimen === 'RIMPE_EMPRENDEDOR' || tipoRegimen === 'RIMPE_NEGOCIO_POPULAR'
}

interface Compra {
    id: string
    tipo: 'compra'
    proveedor_ruc: string
    proveedor_nombre: string
    tipo_regimen: string | null
    numero: string
    clave_acceso: string | null
    fecha_emision: string
    base_cero: number
    base_iva5: number
    iva5: number
    base_iva15: number
    iva15: number
    base_iva: number   // total gravada (5+15)
    iva: number        // total IVA
    total: number
    // Retención en la Fuente (Renta) y de IVA son conceptos y campos
    // distintos del SRI — antes se mezclaban en una sola suma/código,
    // perdiendo la separación.
    codigo_ret_fuente: string | null
    pct_ret_fuente: number | null
    valor_ret_fuente: number
    codigo_ret_iva: string | null
    pct_ret_iva: number | null
    valor_ret_iva: number
    tipo_compra?: string
    // true = gasto del negocio (entra al Formulario 104). false = gasto
    // personal del propietario -- editable acá antes de declarar.
    es_gasto_negocio: boolean
}

const TIPO_LABEL: Record<string, string> = {
    compra: 'Compra',
}

const TIPO_STYLE: Record<string, string> = {
    compra: 'bg-blue-100 text-blue-700',
}

export function ConsultaComprasPage() {
    const { empresa } = useAuth() as any

    const [año, setAño]           = useState(new Date().getFullYear())
    const [mes, setMes]           = useState(0)
    const [busqueda, setBusqueda] = useState('')
    const [expandido, setExpandido] = useState<string | null>(null)

    const [datos, setDatos]       = useState<Compra[]>([])
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
            const comprasRes = await supabase
                .from('ingresos_stock')
                .select('id, numero_factura, clave_acceso, fecha_emision, base_iva_0, base_iva_5, base_iva_15, valor_iva, total, tipo_compra, es_gasto_negocio, proveedor:proveedores(ruc, nombre_empresa, tipo_regimen), retenciones:retenciones_compras(tipo, codigo_retencion, porcentaje, valor)')
                .eq('empresa_id', empresa.id)
                .eq('estado', 'ACTIVO')
                .gte('fecha_emision', desde)
                .lte('fecha_emision', hasta)
                .order('fecha_emision', { ascending: false })

            const compras: Compra[] = (comprasRes.data ?? []).map((r: any) => {
                const b5  = r.base_iva_5  ?? 0
                const b15 = r.base_iva_15 ?? 0
                const iv5  = Math.round(b5  * 0.05 * 100) / 100
                const iv15 = Math.round(b15 * 0.15 * 100) / 100
                const retsFuente = (r.retenciones ?? []).filter((x: any) => x.tipo === 'FUENTE')
                const retsIva    = (r.retenciones ?? []).filter((x: any) => x.tipo === 'IVA')
                return {
                    id:               r.id,
                    tipo:             'compra' as const,
                    proveedor_ruc:    r.proveedor?.ruc ?? '',
                    proveedor_nombre: r.proveedor?.nombre_empresa ?? '',
                    tipo_regimen:     r.proveedor?.tipo_regimen ?? null,
                    es_gasto_negocio: r.es_gasto_negocio ?? true,
                    numero:           r.numero_factura ?? '',
                    clave_acceso:     r.clave_acceso,
                    fecha_emision:    r.fecha_emision,
                    base_cero:        r.base_iva_0 ?? 0,
                    base_iva5:        b5,
                    iva5:             iv5,
                    base_iva15:       b15,
                    iva15:            iv15,
                    base_iva:         b5 + b15,
                    iva:              r.valor_iva ?? 0,
                    total:            r.total ?? 0,
                    codigo_ret_fuente: retsFuente[0]?.codigo_retencion ?? null,
                    pct_ret_fuente:    retsFuente[0]?.porcentaje ?? null,
                    valor_ret_fuente:  retsFuente.reduce((s: number, ret: any) => s + (ret.valor ?? 0), 0),
                    codigo_ret_iva:    retsIva[0]?.codigo_retencion ?? null,
                    pct_ret_iva:       retsIva[0]?.porcentaje ?? null,
                    valor_ret_iva:     retsIva.reduce((s: number, ret: any) => s + (ret.valor ?? 0), 0),
                    tipo_compra:      r.tipo_compra,
                }
            })

            if (comprasRes.error) setError(comprasRes.error.message)

            setDatos(compras.sort((a, b) => b.fecha_emision.localeCompare(a.fecha_emision)))
        } catch (e: any) {
            setError(e.message ?? 'Error cargando datos')
        }
        setCargando(false)
    }

    async function toggleGastoNegocio(id: string, valorActual: boolean) {
        const nuevoValor = !valorActual
        setDatos(prev => prev.map(r => r.id === id ? { ...r, es_gasto_negocio: nuevoValor } : r))
        const { error: er } = await supabase.from('ingresos_stock').update({ es_gasto_negocio: nuevoValor }).eq('id', id)
        if (er) {
            setDatos(prev => prev.map(r => r.id === id ? { ...r, es_gasto_negocio: valorActual } : r))
            setError(`No se pudo actualizar: ${er.message}`)
        }
    }

    const filtradas = datos.filter(r => {
        if (busqueda.trim()) {
            const b = busqueda.toLowerCase()
            return (
                r.proveedor_nombre.toLowerCase().includes(b) ||
                r.proveedor_ruc.includes(b) ||
                r.numero.includes(b)
            )
        }
        return true
    })

    // Suma las columnas de Base/IVA/Total/Retenciones sobre cualquier
    // subconjunto de filas — se usa tanto para el total general (todas las
    // compras) como para el total de solo gasto de negocio.
    function sumarColumnas(filas: typeof datos) {
        return {
            compras:   filas.length,
            base0:     filas.reduce((s, r) => s + r.base_cero,   0),
            base5:     filas.reduce((s, r) => s + r.base_iva5,   0),
            iva5:      filas.reduce((s, r) => s + r.iva5,         0),
            base15:    filas.reduce((s, r) => s + r.base_iva15,  0),
            iva15:     filas.reduce((s, r) => s + r.iva15,        0),
            iva:       filas.reduce((s, r) => s + r.iva,          0),
            totalBases: filas.reduce((s, r) => s + r.base_cero + r.base_iva5 + r.base_iva15, 0),
            total:     filas.reduce((s, r) => s + r.total,        0),
            retenidoFuente: filas.reduce((s, r) => s + r.valor_ret_fuente, 0),
            retenidoIva:    filas.reduce((s, r) => s + r.valor_ret_iva,    0),
        }
    }

    // Gasto de negocio: lo único que declara el 104 (casillero 500/504/510,
    // y su conteo va al casillero 115) — el resto son gastos personales del
    // propietario, útiles solo para Impuesto a la Renta. Las filas marcadas
    // como gasto personal SIGUEN visibles en la tabla de abajo (no se
    // ocultan) — solo quedan fuera de este total y del 104.
    const gastoNegocio = filtradas.filter(r => r.es_gasto_negocio)

    // Total general: TODAS las compras filtradas (negocio + personal).
    const totales = sumarColumnas(filtradas)
    // Total de solo gasto de negocio: el que de verdad se declara en el 104.
    const totalesNegocio = sumarColumnas(gastoNegocio)

    // Resumen por régimen del proveedor — no es un casillero oficial del
    // 104 (el formulario del SRI no abre por régimen), es un reporte de
    // gestión adicional sobre las compras que SÍ son gasto de negocio.
    const rimpe   = gastoNegocio.filter(r => esRimpe(r.tipo_regimen))
    const general = gastoNegocio.filter(r => !esRimpe(r.tipo_regimen))
    const resumenRegimen = {
        rimpe:   { compras: rimpe.length,   valor: rimpe.reduce((s, r) => s + r.total, 0) },
        general: { compras: general.length, valor: general.reduce((s, r) => s + r.total, 0) },
        suma:    { compras: gastoNegocio.length, valor: gastoNegocio.reduce((s, r) => s + r.total, 0) },
    }

    function exportarExcel() {
        const headers = [
            'numero', 'tipo', 'secuencial', 'clave_autorizacion', 'ruc_emisor', 'nombre_emisor', 'regimen',
            'fecha_emision', 'subtotal_cero', 'subtotal_iva_15', 'subtotal_iva_5', 'subtotal_exento',
            'total_bases', 'iva 5%', 'iva 15%', 'importe_total',
            'Cód. Ret. Fuente', '% Ret. Fuente', 'Valor Ret. Fuente',
            'Cód. Ret. IVA', '% Ret. IVA', 'Valor Ret. IVA',
            'Gasto Negocio',
        ]

        const filas = filtradas.map((r, i) => [
            i + 1,
            TIPO_LABEL[r.tipo] ?? r.tipo,
            r.numero,
            r.clave_acceso ?? '',
            r.proveedor_ruc,
            r.proveedor_nombre,
            r.tipo_regimen ? (REGIMEN_LABEL[r.tipo_regimen] ?? r.tipo_regimen) : '',
            r.fecha_emision,
            r.base_cero,
            r.base_iva15,
            r.base_iva5,
            0, // subtotal_exento — no se registra en el sistema aún
            r.base_cero + r.base_iva5 + r.base_iva15,
            r.iva5,
            r.iva15,
            r.total,
            r.codigo_ret_fuente ?? '',
            r.pct_ret_fuente ?? '',
            r.valor_ret_fuente,
            r.codigo_ret_iva ?? '',
            r.pct_ret_iva ?? '',
            r.valor_ret_iva,
            r.es_gasto_negocio ? 'Sí' : 'No',
        ])

        const filaTotalNegocio = [
            '', '', '', '', '', '', '', 'TOTAL GASTO DE NEGOCIO (declarable 104)',
            totalesNegocio.base0, totalesNegocio.base15, totalesNegocio.base5, 0, totalesNegocio.totalBases,
            totalesNegocio.iva5, totalesNegocio.iva15, totalesNegocio.total,
            '', '', totalesNegocio.retenidoFuente,
            '', '', totalesNegocio.retenidoIva,
            '',
        ]

        const filaTotales = [
            '', '', '', '', '', '', '', 'TOTAL GENERAL (todas, incl. gasto personal)',
            totales.base0, totales.base15, totales.base5, 0, totales.totalBases,
            totales.iva5, totales.iva15, totales.total,
            '', '', totales.retenidoFuente,
            '', '', totales.retenidoIva,
            '',
        ]

        const nombreEmpresa = empresa?.razon_social || empresa?.nombre || ''
        const periodo = `${mes > 0 ? mesNombre(mes) : 'Año completo'} ${año}`

        const aoa = [
            ['Consulta Tributaria — Compras'],
            [`Empresa: ${nombreEmpresa}`],
            [`Período: ${periodo}`],
            [],
            headers,
            ...filas,
            filaTotalNegocio,
            filaTotales,
        ]

        const ws = XLSX.utils.aoa_to_sheet(aoa)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Compras')
        XLSX.writeFile(wb, `Tributario_Compras_${empresa?.ruc ?? 'RUC'}_${año}${mes > 0 ? String(mes).padStart(2, '0') : ''}.xlsx`)
    }

    return (
        <div className="space-y-5 max-w-6xl">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Consulta Tributaria — Compras</h1>
                <p className="text-slate-500 text-sm mt-0.5">
                    Facturas de compra registradas en el sistema
                </p>
            </div>

            {error && (
                <div className="card px-5 py-3 bg-red-50 border-red-200 text-red-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{error}</span>
                    <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
                </div>
            )}

            {/* Filtros */}
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
                            placeholder="RUC, nombre, número..."
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

            {/* Resumen — TODAS las compras (negocio + personal). Para el total
                que sí declara el 104, ver "Gasto de Negocio" más abajo. */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Compras (todas)',       value: totales.compras,                  color: 'text-blue-600' },
                    { label: 'Total Bases (todas)',   value: formatMoneda(totales.totalBases), color: 'text-amber-600' },
                    { label: 'Total IVA (todas)',     value: formatMoneda(totales.iva),        color: 'text-indigo-600' },
                    { label: 'Total General (todas)', value: formatMoneda(totales.total),      color: 'text-slate-800' },
                ].map(({ label, value, color }) => (
                    <div key={label} className="card p-4">
                        <p className={`text-xl font-bold ${color}`}>{value}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                    </div>
                ))}
            </div>

            {/* Gasto de negocio (lo que declara el 104) vs por régimen del proveedor */}
            {filtradas.length > 0 && (
                <div className="card overflow-hidden">
                    <div className="bg-indigo-700 px-5 py-3 text-white font-bold text-sm">
                        Gasto de Negocio (declarable en Formulario 104) — por Régimen del Proveedor
                    </div>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                                <th className="py-2 px-4 text-left">Régimen</th>
                                <th className="py-2 px-4 text-right"># Facturas</th>
                                <th className="py-2 px-4 text-right">Valor Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="border-b border-slate-100">
                                <td className="py-2 px-4 text-slate-700">RIMPE</td>
                                <td className="py-2 px-4 text-right font-mono">{resumenRegimen.rimpe.compras}</td>
                                <td className="py-2 px-4 text-right font-mono">{formatMoneda(resumenRegimen.rimpe.valor)}</td>
                            </tr>
                            <tr className="border-b border-slate-100">
                                <td className="py-2 px-4 text-slate-700">Régimen General</td>
                                <td className="py-2 px-4 text-right font-mono">{resumenRegimen.general.compras}</td>
                                <td className="py-2 px-4 text-right font-mono">{formatMoneda(resumenRegimen.general.valor)}</td>
                            </tr>
                        </tbody>
                        <tfoot>
                            <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold">
                                <td className="py-2.5 px-4 text-xs uppercase tracking-wide text-slate-600">Suma (Casillero 115)</td>
                                <td className="py-2.5 px-4 text-right font-mono">{resumenRegimen.suma.compras}</td>
                                <td className="py-2.5 px-4 text-right font-mono">{formatMoneda(resumenRegimen.suma.valor)}</td>
                            </tr>
                        </tfoot>
                    </table>
                    {gastoNegocio.length !== filtradas.length && (
                        <p className="px-5 py-2.5 text-xs text-amber-700 bg-amber-50 border-t border-amber-100">
                            {filtradas.length - gastoNegocio.length} compra(s) marcada(s) como gasto personal (no del negocio) — siguen visibles en la tabla de abajo (checkbox desmarcado), pero quedan fuera de esta suma y del Formulario 104. Base total excluida: {formatMoneda(totales.totalBases - totalesNegocio.totalBases)}.
                        </p>
                    )}
                </div>
            )}

            {/* Tabla */}
            <div className="card overflow-hidden">
                <div className="bg-slate-700 px-5 py-3 text-white font-bold text-sm flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4" />
                    Comprobantes — {mes > 0 ? mesNombre(mes) : 'Año completo'} {año}
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
                        <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-20" />
                        <p>Sin comprobantes para los filtros seleccionados.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                                    <th className="py-2 px-2 w-8" />
                                    <th className="py-2 px-3 text-left">Tipo</th>
                                    <th className="py-2 px-3 text-left">Proveedor / Cliente</th>
                                    <th className="py-2 px-3 text-left">Número</th>
                                    <th className="py-2 px-3 text-left">Fecha</th>
                                    <th className="py-2 px-3 text-right">Base 0%</th>
                                    <th className="py-2 px-3 text-right">Base 5%</th>
                                    <th className="py-2 px-3 text-right">IVA 5%</th>
                                    <th className="py-2 px-3 text-right">Base 15%</th>
                                    <th className="py-2 px-3 text-right">IVA 15%</th>
                                    <th className="py-2 px-3 text-right">Total Bases</th>
                                    <th className="py-2 px-3 text-right">Total</th>
                                    <th className="py-2 px-3 text-center">Ret. Fuente</th>
                                    <th className="py-2 px-3 text-center">Ret. IVA</th>
                                    <th className="py-2 px-3 text-center" title="Se declara en el Formulario 104">Gasto Negocio</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtradas.map(r => {
                                    const isExp = expandido === r.id
                                    return (
                                        <>
                                            <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                                                <td className="py-2 px-2">
                                                    <button
                                                        onClick={() => setExpandido(isExp ? null : r.id)}
                                                        className="text-slate-400 hover:text-slate-600"
                                                    >
                                                        {isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                    </button>
                                                </td>
                                                <td className="py-2 px-3">
                                                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', TIPO_STYLE[r.tipo])}>
                                                        {TIPO_LABEL[r.tipo] ?? r.tipo}
                                                    </span>
                                                </td>
                                                <td className="py-2 px-3">
                                                    <div className="font-medium text-slate-700 text-xs">{r.proveedor_nombre}</div>
                                                    <div className="text-slate-400 text-xs font-mono">{r.proveedor_ruc}</div>
                                                    {esRimpe(r.tipo_regimen) && (
                                                        <span className="inline-block mt-0.5 text-[10px] font-bold uppercase tracking-wide bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">RIMPE</span>
                                                    )}
                                                </td>
                                                <td className="py-2 px-3 font-mono text-xs text-slate-600">{r.numero}</td>
                                                <td className="py-2 px-3 text-xs text-slate-500">{r.fecha_emision}</td>
                                                <td className="py-2 px-3 text-right text-xs">
                                                    {r.base_cero > 0 ? formatMoneda(r.base_cero) : '—'}
                                                </td>
                                                <td className="py-2 px-3 text-right text-xs">
                                                    {r.base_iva5 > 0 ? formatMoneda(r.base_iva5) : '—'}
                                                </td>
                                                <td className="py-2 px-3 text-right text-xs">
                                                    {r.iva5 > 0 ? formatMoneda(r.iva5) : '—'}
                                                </td>
                                                <td className="py-2 px-3 text-right text-xs">
                                                    {r.base_iva15 > 0 ? formatMoneda(r.base_iva15) : '—'}
                                                </td>
                                                <td className="py-2 px-3 text-right text-xs">
                                                    {r.iva15 > 0 ? formatMoneda(r.iva15) : '—'}
                                                </td>
                                                <td className="py-2 px-3 text-right text-xs font-medium">
                                                    {formatMoneda(r.base_cero + r.base_iva5 + r.base_iva15)}
                                                </td>
                                                <td className="py-2 px-3 text-right font-semibold text-xs">
                                                    {formatMoneda(r.total)}
                                                </td>
                                                <td className="py-2 px-3 text-center">
                                                    {r.codigo_ret_fuente ? (
                                                        <span className="text-xs font-mono bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                                                            {r.codigo_ret_fuente} · {r.pct_ret_fuente}%
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-slate-300">—</span>
                                                    )}
                                                </td>
                                                <td className="py-2 px-3 text-center">
                                                    {r.codigo_ret_iva ? (
                                                        <span className="text-xs font-mono bg-violet-100 text-violet-700 px-2 py-0.5 rounded">
                                                            {r.codigo_ret_iva} · {r.pct_ret_iva}%
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-slate-300">—</span>
                                                    )}
                                                </td>
                                                <td className="py-2 px-3 text-center">
                                                    <label className="inline-flex items-center cursor-pointer" title="Desmarca si es un gasto personal, no del negocio -- no entrará al Formulario 104">
                                                        <input type="checkbox"
                                                            checked={r.es_gasto_negocio}
                                                            onChange={() => toggleGastoNegocio(r.id, r.es_gasto_negocio)}
                                                        />
                                                    </label>
                                                </td>
                                            </tr>
                                            {isExp && (
                                                <tr key={`${r.id}-det`} className="bg-slate-50 border-b border-slate-100">
                                                    <td colSpan={15} className="px-8 py-3">
                                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Detalle</p>
                                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs font-mono text-slate-600">
                                                            <div><span className="text-slate-400">Base 0%:</span> {r.base_cero.toFixed(2)}</div>
                                                            <div><span className="text-slate-400">Base 5%:</span> {r.base_iva5.toFixed(2)}</div>
                                                            <div><span className="text-slate-400">IVA 5%:</span> {r.iva5.toFixed(2)}</div>
                                                            <div><span className="text-slate-400">Base 15%:</span> {r.base_iva15.toFixed(2)}</div>
                                                            <div><span className="text-slate-400">IVA 15%:</span> {r.iva15.toFixed(2)}</div>
                                                            <div><span className="text-slate-400">Total IVA:</span> {r.iva.toFixed(2)}</div>
                                                            {r.tipo_compra && <div><span className="text-slate-400">Tipo compra:</span> {r.tipo_compra}</div>}
                                                            {r.codigo_ret_fuente && (
                                                                <>
                                                                    <div><span className="text-slate-400">Cód. Ret. Fuente:</span> {r.codigo_ret_fuente}</div>
                                                                    <div><span className="text-slate-400">% Ret. Fuente:</span> {r.pct_ret_fuente}%</div>
                                                                    <div><span className="text-slate-400">Valor Ret. Fuente:</span> {r.valor_ret_fuente.toFixed(2)}</div>
                                                                </>
                                                            )}
                                                            {r.codigo_ret_iva && (
                                                                <>
                                                                    <div><span className="text-slate-400">Cód. Ret. IVA:</span> {r.codigo_ret_iva}</div>
                                                                    <div><span className="text-slate-400">% Ret. IVA:</span> {r.pct_ret_iva}%</div>
                                                                    <div><span className="text-slate-400">Valor Ret. IVA:</span> {r.valor_ret_iva.toFixed(2)}</div>
                                                                </>
                                                            )}
                                                            <div className="col-span-2 md:col-span-3">
                                                                <span className="text-slate-400">Clave de acceso:</span>{' '}
                                                                <span className="break-all">{r.clave_acceso ?? '(sin clave de acceso)'}</span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </>
                                    )
                                })}
                            </tbody>
                            <tfoot>
                                <tr className="bg-indigo-50 border-t-2 border-indigo-200 font-semibold text-sm">
                                    <td colSpan={5} className="py-2.5 px-3 text-right text-xs text-indigo-700 uppercase" title="Solo compras marcadas como gasto de negocio — es lo que se declara en el Formulario 104">
                                        Total Gasto de Negocio (declarable 104)
                                    </td>
                                    <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(totalesNegocio.base0)}</td>
                                    <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(totalesNegocio.base5)}</td>
                                    <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(totalesNegocio.iva5)}</td>
                                    <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(totalesNegocio.base15)}</td>
                                    <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(totalesNegocio.iva15)}</td>
                                    <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(totalesNegocio.totalBases)}</td>
                                    <td className="py-2.5 px-3 text-right">{formatMoneda(totalesNegocio.total)}</td>
                                    <td className="py-2.5 px-3 text-center text-xs text-slate-500">
                                        {totalesNegocio.retenidoFuente > 0 ? formatMoneda(totalesNegocio.retenidoFuente) : ''}
                                    </td>
                                    <td className="py-2.5 px-3 text-center text-xs text-slate-500">
                                        {totalesNegocio.retenidoIva > 0 ? formatMoneda(totalesNegocio.retenidoIva) : ''}
                                    </td>
                                    <td className="py-2.5 px-3 text-center text-xs text-slate-500">{gastoNegocio.length}/{filtradas.length}</td>
                                </tr>
                                <tr className="bg-slate-50 border-t border-slate-200 font-semibold text-sm">
                                    <td colSpan={5} className="py-2.5 px-3 text-right text-xs text-slate-500 uppercase" title="Todas las compras filtradas, incluyendo las marcadas como gasto personal">
                                        Total General (todas, incl. gasto personal)
                                    </td>
                                    <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(totales.base0)}</td>
                                    <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(totales.base5)}</td>
                                    <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(totales.iva5)}</td>
                                    <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(totales.base15)}</td>
                                    <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(totales.iva15)}</td>
                                    <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(totales.totalBases)}</td>
                                    <td className="py-2.5 px-3 text-right">{formatMoneda(totales.total)}</td>
                                    <td className="py-2.5 px-3 text-center text-xs text-slate-500">
                                        {totales.retenidoFuente > 0 ? formatMoneda(totales.retenidoFuente) : ''}
                                    </td>
                                    <td className="py-2.5 px-3 text-center text-xs text-slate-500">
                                        {totales.retenidoIva > 0 ? formatMoneda(totales.retenidoIva) : ''}
                                    </td>
                                    <td className="py-2.5 px-3 text-center text-xs text-slate-500">{filtradas.length}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
