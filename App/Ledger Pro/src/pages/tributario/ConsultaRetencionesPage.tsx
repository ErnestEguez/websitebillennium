import { useEffect, useState } from 'react'
import { Receipt, Loader2, AlertCircle, X, Download } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatMoneda, mesNombre } from '../../lib/utils'

interface Retencion {
    id: string
    proveedor_ruc: string
    proveedor_nombre: string
    numero: string
    clave_acceso: string | null
    fecha_emision: string
    base_cero: number
    base_iva: number
    codigo_retencion: string | null
    porcentaje_ret: number | null
    valor_retenido: number | null
}

export function ConsultaRetencionesPage() {
    const { empresaActiva } = useAuth()

    const [año, setAño] = useState(new Date().getFullYear())
    const [mes, setMes] = useState(0)   // 0 = todos los meses
    const [busqueda, setBusqueda] = useState('')

    const [datos, setDatos] = useState<Retencion[]>([])
    const [cargando, setCargando] = useState(false)
    const [error, setError] = useState('')

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
            .select('id,proveedor_ruc,proveedor_nombre,numero,clave_acceso,fecha_emision,base_cero,base_iva,codigo_retencion,porcentaje_ret,valor_retenido')
            .eq('empresa_id', empresaActiva.id)
            .eq('tipo', 'retencion')
            .eq('año', año)
            .order('fecha_emision', { ascending: false })

        if (mes > 0) q = q.eq('mes', mes)

        const { data, error: err } = await q
        if (err) setError(err.message)
        setDatos((data ?? []) as Retencion[])
        setCargando(false)
    }

    const filtradas = busqueda.trim()
        ? datos.filter(r =>
            r.proveedor_nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
            r.proveedor_ruc.includes(busqueda) ||
            r.numero.includes(busqueda) ||
            (r.codigo_retencion ?? '').includes(busqueda)
        )
        : datos

    const totVal  = filtradas.reduce((s, r) => s + (r.valor_retenido ?? 0), 0)
    const totBase = filtradas.reduce((s, r) => s + (r.base_iva > 0 ? r.base_iva : r.base_cero), 0)

    function exportarCsv() {
        const rows = [
            ['RUC Retentor', 'Nombre Retentor', 'Número', 'Fecha', 'Clave Acceso', 'Cód. Ret.', 'Base', '% Ret.', 'Valor Retenido'],
            ...filtradas.map(r => [
                r.proveedor_ruc,
                r.proveedor_nombre,
                r.numero,
                r.fecha_emision,
                r.clave_acceso ?? '',
                r.codigo_retencion ?? '',
                (r.base_iva > 0 ? r.base_iva : r.base_cero).toFixed(2),
                String(r.porcentaje_ret ?? 0),
                (r.valor_retenido ?? 0).toFixed(2),
            ]),
        ]
        const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n')
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `Retenciones_${empresaActiva?.ruc ?? 'RUC'}_${año}${mes > 0 ? String(mes).padStart(2, '0') : ''}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    return (
        <div className="space-y-5 max-w-6xl">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Consulta de Retenciones</h1>
                <p className="text-slate-500 text-sm mt-0.5">
                    Retenciones recibidas importadas desde el SRI
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
                            placeholder="RUC, nombre, número, código..."
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
            <div className="grid grid-cols-3 gap-4">
                {[
                    { label: 'Retenciones encontradas', value: filtradas.length, color: 'text-purple-600' },
                    { label: 'Base total retenida', value: formatMoneda(totBase, sym), color: 'text-blue-600' },
                    { label: 'Valor total retenido', value: formatMoneda(totVal, sym), color: 'text-emerald-600' },
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
                    <Receipt className="w-4 h-4" />
                    Retenciones — {mes > 0 ? mesNombre(mes) : 'Año completo'} {año}
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
                        <Receipt className="w-10 h-10 mx-auto mb-2 opacity-20" />
                        <p>Sin retenciones para los filtros seleccionados.</p>
                        <p className="text-xs mt-1">Importa los comprobantes del SRI en Integración SRI.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                                    <th className="py-2 px-3 text-left">Retentor</th>
                                    <th className="py-2 px-3 text-left">Número</th>
                                    <th className="py-2 px-3 text-left">Fecha</th>
                                    <th className="py-2 px-3 text-center">Cód. Ret.</th>
                                    <th className="py-2 px-3 text-right">Base</th>
                                    <th className="py-2 px-3 text-right">%</th>
                                    <th className="py-2 px-3 text-right">Valor Retenido</th>
                                    <th className="py-2 px-3 text-left">Clave Acceso</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtradas.map(r => (
                                    <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                                        <td className="py-2 px-3">
                                            <div className="font-medium text-slate-700 text-xs">{r.proveedor_nombre}</div>
                                            <div className="text-slate-400 text-xs font-mono">{r.proveedor_ruc}</div>
                                        </td>
                                        <td className="py-2 px-3 font-mono text-xs text-slate-600">{r.numero}</td>
                                        <td className="py-2 px-3 text-xs text-slate-500">{r.fecha_emision}</td>
                                        <td className="py-2 px-3 text-center">
                                            <span className="text-xs font-mono bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                                                {r.codigo_retencion ?? '—'}
                                            </span>
                                        </td>
                                        <td className="py-2 px-3 text-right text-xs">
                                            {formatMoneda(r.base_iva > 0 ? r.base_iva : r.base_cero, sym)}
                                        </td>
                                        <td className="py-2 px-3 text-right text-xs">{r.porcentaje_ret ?? 0}%</td>
                                        <td className="py-2 px-3 text-right font-semibold text-xs text-emerald-700">
                                            {formatMoneda(r.valor_retenido ?? 0, sym)}
                                        </td>
                                        <td className="py-2 px-3 text-xs font-mono text-slate-400 max-w-[200px] truncate" title={r.clave_acceso ?? ''}>
                                            {r.clave_acceso ? r.clave_acceso.substring(0, 20) + '…' : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="bg-slate-50 border-t-2 font-semibold text-sm">
                                    <td colSpan={4} className="py-2.5 px-3 text-right text-xs text-slate-500 uppercase">Totales</td>
                                    <td className="py-2.5 px-3 text-right text-xs">{formatMoneda(totBase, sym)}</td>
                                    <td />
                                    <td className="py-2.5 px-3 text-right text-emerald-700">{formatMoneda(totVal, sym)}</td>
                                    <td />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
