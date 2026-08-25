import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { HelpButton } from '../components/help/HelpButton'
import { BuscadorProducto, type ProductoResultado } from '../components/BuscadorProducto'
import { BarChart3, Search, Loader2, X, AlertCircle } from 'lucide-react'

interface FilaResultado {
    codigo: string
    nombre: string
    talla: string
    color: string
    cantidad: number
}

function primerDiaMes(): string {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]
}
function hoy(): string {
    return new Date().toISOString().split('T')[0]
}

export function ConsultaTallaColorPage() {
    const { empresa } = useAuth()
    const etiquetaLinea = empresa?.etiqueta_campo_linea || 'Talla'
    const etiquetaSubcat = empresa?.etiqueta_campo_subcategoria || 'Color'

    const [articulo, setArticulo] = useState<ProductoResultado | null>(null)
    const [desde, setDesde] = useState(primerDiaMes())
    const [hasta, setHasta] = useState(hoy())
    const [buscando, setBuscando] = useState(false)
    const [resultados, setResultados] = useState<FilaResultado[] | null>(null)
    const [error, setError] = useState('')

    async function buscar() {
        if (!empresa?.id) return
        setBuscando(true); setError(''); setResultados(null)
        try {
            let query = supabase
                .from('ventas_talla_color')
                .select('producto_id, nombre_producto, talla, color, cantidad')
                .eq('empresa_id', empresa.id)
                .gte('fecha', desde)
                .lte('fecha', hasta)
            if (articulo) query = query.eq('producto_id', articulo.id)
            const { data, error: errQuery } = await query
            if (errQuery) throw errQuery

            // producto_id no es una FK declarada (igual que en comprobante_detalles),
            // así que el código se resuelve aparte en vez de con un embed de PostgREST.
            const prodIds = [...new Set((data ?? []).map(r => r.producto_id).filter(Boolean))]
            let codigos: Record<string, string> = {}
            if (prodIds.length > 0) {
                const { data: prods } = await supabase.from('productos').select('id, codigo').in('id', prodIds)
                codigos = Object.fromEntries((prods ?? []).map(p => [p.id, p.codigo ?? '']))
            }

            const grupos = new Map<string, FilaResultado>()
            for (const r of data ?? []) {
                const key = `${r.producto_id ?? r.nombre_producto}|${r.talla ?? ''}|${r.color ?? ''}`
                const prev = grupos.get(key) ?? {
                    codigo: r.producto_id ? (codigos[r.producto_id] ?? '') : '',
                    nombre: r.nombre_producto ?? '',
                    talla: r.talla ?? '—',
                    color: r.color ?? '—',
                    cantidad: 0,
                }
                prev.cantidad += Number(r.cantidad) || 0
                grupos.set(key, prev)
            }
            setResultados(Array.from(grupos.values()).sort((a, b) => a.nombre.localeCompare(b.nombre)))
        } catch (e: any) {
            setError(e.message)
        } finally {
            setBuscando(false)
        }
    }

    return (
        <div className="max-w-4xl space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center">
                    <BarChart3 className="w-6 h-6 text-violet-600" />
                </div>
                <div className="flex-1">
                    <h1 className="text-xl font-bold text-slate-900">Consulta {etiquetaLinea}/{etiquetaSubcat}</h1>
                    <p className="text-sm text-slate-500">Cantidad vendida por artículo, {etiquetaLinea.toLowerCase()} y {etiquetaSubcat.toLowerCase()}, en un periodo.</p>
                </div>
                <HelpButton pageKey="consulta-talla-color" />
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="md:col-span-1">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Artículo (opcional — vacío = todos)</label>
                        {articulo ? (
                            <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                                <span className="text-sm font-medium text-slate-800 truncate">{articulo.nombre}</span>
                                <button onClick={() => setArticulo(null)} className="text-slate-400 hover:text-red-500 shrink-0 ml-2">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <BuscadorProducto empresaId={empresa?.id ?? ''} onSelect={setArticulo} />
                        )}
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Desde</label>
                        <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-2">Hasta</label>
                        <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                </div>
                <button onClick={buscar} disabled={buscando}
                    className="btn btn-primary flex items-center gap-2 disabled:opacity-50">
                    {buscando ? <><Loader2 className="w-4 h-4 animate-spin" /> Buscando...</> : <><Search className="w-4 h-4" /> Buscar</>}
                </button>
            </div>

            {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
                </div>
            )}

            {resultados && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    {resultados.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 text-sm">
                            No hay ventas con {etiquetaLinea}/{etiquetaSubcat} registradas en ese periodo.
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                                <tr>
                                    <th className="text-left py-2 px-3">Código</th>
                                    <th className="text-left py-2 px-3">Descripción</th>
                                    <th className="text-left py-2 px-3">{etiquetaLinea}</th>
                                    <th className="text-left py-2 px-3">{etiquetaSubcat}</th>
                                    <th className="text-right py-2 px-3">Cantidad</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {resultados.map((r, i) => (
                                    <tr key={i}>
                                        <td className="py-2 px-3 font-mono text-slate-500">{r.codigo || '—'}</td>
                                        <td className="py-2 px-3">{r.nombre}</td>
                                        <td className="py-2 px-3">{r.talla}</td>
                                        <td className="py-2 px-3">{r.color}</td>
                                        <td className="py-2 px-3 text-right font-mono font-semibold">{r.cantidad}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    )
}
