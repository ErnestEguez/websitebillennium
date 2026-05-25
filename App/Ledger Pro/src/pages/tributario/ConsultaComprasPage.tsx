import { useEffect, useState } from 'react'
import { ShoppingCart, Loader2, AlertCircle, X, Download, ChevronDown, ChevronUp, FileText } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { cn, formatMoneda, mesNombre } from '../../lib/utils'

interface Compra {
    id: string
    tipo: 'factura' | 'nota_credito' | 'nota_debito'
    proveedor_ruc: string
    proveedor_nombre: string
    numero: string
    clave_acceso: string | null
    fecha_emision: string
    base_cero: number
    base_iva: number
    iva: number
    total: number
    codigo_retencion: string | null
    porcentaje_ret: number | null
    valor_retenido: number | null
}

const TIPO_LABEL: Record<string, string> = {
    factura:      'Factura',
    nota_credito: 'N/C',
    nota_debito:  'N/D',
}

const TIPO_STYLE: Record<string, string> = {
    factura:      'bg-blue-100 text-blue-700',
    nota_credito: 'bg-amber-100 text-amber-700',
    nota_debito:  'bg-orange-100 text-orange-700',
}

export function ConsultaComprasPage() {
    const { empresaActiva } = useAuth()

    const [año, setAño]           = useState(new Date().getFullYear())
    const [mes, setMes]           = useState(0)
    const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'factura' | 'nota_credito' | 'nota_debito'>('todos')
    const [busqueda, setBusqueda] = useState('')
    const [expandido, setExpandido] = useState<string | null>(null)

    const [datos, setDatos]       = useState<Compra[]>([])
    const [cargando, setCargando] = useState(false)
    const [error, setError]       = useState('')

    const sym = empresaActiva?.moneda?.simbolo ?? '$'

    useEffect(() => {
        if (empresaActiva) cargar()
    }, [empresaActiva, año, mes])

    async function cargar() {
        if (!empresaActiva) return
        setCargando(true)
        setError('')

        let q = supabase
            .from('lp_sri_comprobantes')
            .select('id,tipo,proveedor_ruc,proveedor_nombre,numero,clave_acceso,fecha_emision,base_cero,base_iva,iva,total,codigo_retencion,porcentaje_ret,valor_retenido')
            .eq('empresa_id', empresaActiva.id)
            .in('tipo', ['factura', 'nota_credito', 'nota_debito'])
            .eq('año', año)
            .order('fecha_emision', { ascending: false })

        if (mes > 0) q = q.eq('mes', mes)

        const { data, error: err } = await q
        if (err) setError(err.message)
        setDatos((data ?? []) as Compra[])
        setCargando(false)
    }

    const filtradas = datos.filter(r => {
        if (tipoFiltro !== 'todos' && r.tipo !== tipoFiltro) return false
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

    const totales = {
        facturas:  datos.filter(r => r.tipo === 'factura').length,
        ncnd:      datos.filter(r => r.tipo !== 'factura').length,
        base0:     filtradas.reduce((s, r) => s + r.base_cero, 0),
        baseGrav:  filtradas.reduce((s, r) => s + r.base_iva,  0),
        iva:       filtradas.reduce((s, r) => s + r.iva,        0),
        total:     filtradas.reduce((s, r) => s + r.total,      0),
        retenido:  filtradas.reduce((s, r) => s + (r.valor_retenido ?? 0), 0),
    }

    function exportarCsv() {
        const rows = [
            ['Tipo', 'RUC Proveedor', 'Nombre Proveedor', 'Número', 'Fecha', 'Clave Acceso',
             'Base 0%', 'Base Grav.', 'IVA', 'Total', 'Cód. Ret.', '% Ret.', 'Valor Retenido'],
            ...filtradas.map(r => [
                TIPO_LABEL[r.tipo] ?? r.tipo,
                r.proveedor_ruc,
                r.proveedor_nombre,
                r.numero,
                r.fecha_emision,
                r.clave_acceso ?? '',
                r.base_cero.toFixed(2),
                r.base_iva.toFixed(2),
                r.iva.toFixed(2),
                r.total.toFixed(2),
                r.codigo_retencion ?? '',
                String(r.porcentaje_ret ?? ''),
                (r.valor_retenido ?? 0).toFixed(2),
            ]),
        ]
        const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a')
        a.href     = url
        a.download = `Compras_SRI_${empresaActiva?.ruc ?? 'RUC'}_${año}${mes > 0 ? String(mes).padStart(2, '0') : ''}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    return (
        <div className="space-y-5 max-w-6xl">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Consulta de Compras SRI</h1>
                <p className="text-slate-500 text-sm mt-0.5">
                    Facturas, Notas de Crédito y Notas de Débito importadas desde el SRI
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
                    <div>
                        <label className="label">Tipo</label>
                        <select className="input" value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value as typeof tipoFiltro)}>
                            <option value="todos">Todos</option>
                            <option value="factura">Facturas</option>
                            <option value="nota_credito">Notas de Crédito</option>
                            <option value="nota_debito">Notas de Débito</option>
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
                        onClick={exportarCsv}
                        disabled={filtradas.length === 0}
                        className="btn btn-secondary gap-2"
                    >
                        <Download className="w-4 h-4" />
                        Exportar CSV
                    </button>
                </div>
            </div>

            {/* Resumen */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Facturas',        value: totales.facturas,               color: 'text-blue-600' },
                    { label: 'N/C y N/D',       value: totales.ncnd,                   color: 'text-amber-600' },
                    { label: 'Total IVA',        value: formatMoneda(totales.iva, sym), color: 'text-indigo-600' },
                    { label: 'Total Compras',    value: formatMoneda(totales.total, sym), color: 'text-emerald-600' },
                ].map(({ label, value, color }) => (
                    <div key={label} className="card p-4">
                        <p className={`text-xl font-bold ${color}`}>{value}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                    </div>
                ))}
            </div>

            {/* Tabla */}
            <div className="card overflow-hidden">
                <div className="bg-slate-700 px-5 py-3 text-white font-bold text-sm flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4" />
                    Comprobantes de compra — {mes > 0 ? mesNombre(mes) : 'Año completo'} {año}
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
                        <p className="text-xs mt-1">Importa los comprobantes del SRI en Integración SRI.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                                    <th className="py-2 px-2 w-8" />
                                    <th className="py-2 px-3 text-left">Tipo</th>
                                    <th className="py-2 px-3 text-left">Proveedor</th>
                                    <th className="py-2 px-3 text-left">Número</th>
                                    <th className="py-2 px-3 text-left">Fecha</th>
                                    <th className="py-2 px-3 text-right">Base 0%</th>
                                    <th className="py-2 px-3 text-right">Base Grav.</th>
                                    <th className="py-2 px-3 text-right">IVA</th>
                                    <th className="py-2 px-3 text-right">Total</th>
                                    <th className="py-2 px-3 text-center">Ret. IR</th>
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
                                                </td>
                                                <td className="py-2 px-3 font-mono text-xs text-slate-600">{r.numero}</td>
                                                <td className="py-2 px-3 text-xs text-slate-500">{r.fecha_emision}</td>
                                                <td className="py-2 px-3 text-right text-xs">
                                                    {r.base_cero > 0 ? formatMoneda(r.base_cero, sym) : '—'}
                                                </td>
                                                <td className="py-2 px-3 text-right text-xs">
                                                    {r.base_iva > 0 ? formatMoneda(r.base_iva, sym) : '—'}
                                                </td>
                                                <td className="py-2 px-3 text-right text-xs">
                                                    {r.iva > 0 ? formatMoneda(r.iva, sym) : '—'}
                                                </td>
                                                <td className="py-2 px-3 text-right font-semibold text-xs">
                                                    {formatMoneda(r.total, sym)}
                                                </td>
                                                <td className="py-2 px-3 text-center">
                                                    {r.codigo_retencion ? (
                                                        <span className="text-xs font-mono bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                                                            {r.codigo_retencion} · {r.porcentaje_ret}%
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-slate-300">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                            {isExp && (
                                                <tr key={`${r.id}-det`} className="bg-slate-50 border-b border-slate-100">
                                                    <td colSpan={10} className="px-8 py-3">
                                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Detalle</p>
                                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs font-mono text-slate-600">
                                                            <div><span className="text-slate-400">Base 0%:</span> {r.base_cero.toFixed(2)}</div>
                                                            <div><span className="text-slate-400">Base gravada:</span> {r.base_iva.toFixed(2)}</div>
                                                            <div><span className="text-slate-400">IVA:</span> {r.iva.toFixed(2)}</div>
                                                            {r.codigo_retencion && (
                                                                <>
                                                                    <div><span className="text-slate-400">Cód. Ret. IR:</span> {r.codigo_retencion}</div>
                                                                    <div><span className="text-slate-400">% Retención:</span> {r.porcentaje_ret}%</div>
                                                                    <div><span className="text-slate-400">Valor retenido:</span> {(r.valor_retenido ?? 0).toFixed(2)}</div>
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
                                <tr className="bg-slate-50 border-t-2 font-semibold text-sm">
                                    <td colSpan={5} className="py-2.5 px-3 text-right text-xs text-slate-500 uppercase">Totales</td>
                                    <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(totales.base0, sym)}</td>
                                    <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(totales.baseGrav, sym)}</td>
                                    <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(totales.iva, sym)}</td>
                                    <td className="py-2.5 px-3 text-right">{formatMoneda(totales.total, sym)}</td>
                                    <td className="py-2.5 px-3 text-center text-xs text-slate-500">
                                        {totales.retenido > 0 ? formatMoneda(totales.retenido, sym) : ''}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>

            {/* Nota */}
            {filtradas.some(r => r.tipo !== 'factura') && (
                <div className="card p-4 bg-amber-50 border-amber-200 text-xs text-amber-700 flex gap-2 items-start">
                    <FileText className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                        Las <strong>Notas de Crédito y Débito</strong> aparecen en este listado porque son comprobantes de compra descargados del SRI.
                        Para el ATS, se declaran en la sección de compras con código de comprobante 04 (N/C) y 05 (N/D).
                    </span>
                </div>
            )}
        </div>
    )
}
