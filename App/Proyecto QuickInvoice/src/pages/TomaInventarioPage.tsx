import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { HelpButton } from '../components/help/HelpButton'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Search, Download, Loader2, ClipboardList, Filter } from 'lucide-react'

interface ItemToma {
    id: string
    codigo: string
    nombre: string
    categoria_nombre: string
    stock: number
}

interface Categoria { id: string; nombre: string }

export function TomaInventarioPage() {
    const { empresa } = useAuth()

    const [items, setItems]           = useState<ItemToma[]>([])
    const [categorias, setCategorias] = useState<Categoria[]>([])
    const [texto, setTexto]           = useState('')
    const [catFiltro, setCatFiltro]   = useState('TODOS')
    const [loading, setLoading]       = useState(false)
    const [buscado, setBuscado]       = useState(false)

    useEffect(() => {
        if (!empresa?.id) return
        supabase.from('categorias').select('id, nombre').eq('empresa_id', empresa.id).order('nombre')
            .then(({ data }) => setCategorias(data ?? []))
    }, [empresa?.id])

    // Soporta "Brochas*" (comodín) igual que el resto de buscadores de la
    // app — '*' se traduce a '%' de SQL. Sin texto y sin categoría, trae
    // TODO el catálogo (para exportar la toma completa), paginado en
    // bloques de 1000 para no quedarse corto en catálogos grandes.
    async function buscar() {
        if (!empresa?.id) return
        setLoading(true)
        setBuscado(true)
        try {
            const catMap: Record<string, string> = {}
            for (const c of categorias) catMap[c.id] = c.nombre

            const PAGE = 1000
            let all: any[] = []
            let from = 0
            while (true) {
                let q = supabase
                    .from('productos')
                    .select('id, codigo, nombre, stock, categoria_id')
                    .eq('empresa_id', empresa.id)
                    .eq('activo', true)
                    .eq('maneja_stock', true)
                    .order('nombre')
                    .range(from, from + PAGE - 1)
                const t = texto.trim()
                if (t) {
                    const pattern = '%' + t.replace(/\*/g, '%') + '%'
                    q = q.or(`nombre.ilike.${pattern},codigo.ilike.${pattern}`)
                }
                if (catFiltro !== 'TODOS') q = q.eq('categoria_id', catFiltro)
                const { data, error } = await q
                if (error) throw error
                all = all.concat(data ?? [])
                if (!data || data.length < PAGE) break
                from += PAGE
            }

            setItems(all.map(p => ({
                id: p.id,
                codigo: p.codigo ?? '',
                nombre: p.nombre,
                categoria_nombre: p.categoria_id ? (catMap[p.categoria_id] ?? '—') : '—',
                stock: Number(p.stock || 0),
            })))
        } catch (e: any) {
            alert(`Error al buscar: ${e.message ?? e}`)
        } finally {
            setLoading(false)
        }
    }

    function exportarExcel() {
        const rows = items.map(i => ({
            'Código': i.codigo || '—',
            'Descripción': i.nombre,
            'Categoría': i.categoria_nombre,
            'Stock': i.stock,
            'Conteo Físico': '',
            'Diferencia': '',
        }))
        const ws = XLSX.utils.json_to_sheet(rows)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Toma de Inventario')
        const sufijo = texto.trim() ? `_${texto.trim().replace(/[*\s]/g, '')}` : ''
        XLSX.writeFile(wb, `TomaInventario${sufijo}_${new Date().toISOString().slice(0, 10)}.xlsx`)
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <ClipboardList className="w-6 h-6 text-primary-600" /> Toma de Inventarios
                    </h1>
                    <p className="text-slate-500 text-sm mt-0.5">
                        Lista para conteo físico — busca por código o nombre (usa * como comodín, ej: "Brochas*")
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <HelpButton pageKey="toma-inventario" />
                    <button onClick={exportarExcel} disabled={items.length === 0}
                        className="btn btn-secondary gap-2 text-sm text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                        <Download className="w-4 h-4" /> Exportar Excel
                    </button>
                </div>
            </div>

            <div className="card p-4 flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[220px]">
                    <label className="label">Buscar (código o nombre)</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder='Ej: Brochas*'
                            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                            value={texto}
                            onChange={e => setTexto(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); buscar() } }}
                        />
                    </div>
                </div>
                <div>
                    <label className="label flex items-center gap-1"><Filter className="w-3.5 h-3.5" /> Categoría</label>
                    <select className="input" value={catFiltro} onChange={e => setCatFiltro(e.target.value)}>
                        <option value="TODOS">Todas</option>
                        {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                    </select>
                </div>
                <button onClick={buscar} disabled={loading} className="btn btn-primary gap-2">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Buscar
                </button>
            </div>

            {buscado && !loading && (
                <p className="text-sm text-slate-500">{items.length} artículo(s) encontrado(s)</p>
            )}

            <div className="card overflow-hidden">
                {loading ? (
                    <div className="py-16 flex justify-center items-center gap-2 text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin" /> Buscando...
                    </div>
                ) : !buscado ? (
                    <div className="py-16 text-center text-slate-400">
                        <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>Escribe un código o nombre (ej: "Brochas*") y presiona Buscar.</p>
                        <p className="text-xs mt-1">Déjalo vacío y presiona Buscar para traer todo el catálogo.</p>
                    </div>
                ) : items.length === 0 ? (
                    <div className="py-16 text-center text-slate-400">
                        <p>Sin artículos para ese criterio.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-700 text-white text-xs uppercase tracking-wider">
                                    <th className="py-3 px-4 text-left">Código</th>
                                    <th className="py-3 px-4 text-left">Descripción</th>
                                    <th className="py-3 px-4 text-left">Categoría</th>
                                    <th className="py-3 px-4 text-right">Stock</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {items.map((item, idx) => (
                                    <tr key={item.id} className={`hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                                        <td className="py-2.5 px-4 font-mono text-xs text-slate-500">{item.codigo || '—'}</td>
                                        <td className="py-2.5 px-4 font-semibold text-slate-800">{item.nombre}</td>
                                        <td className="py-2.5 px-4">
                                            <span className="text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full font-medium">
                                                {item.categoria_nombre}
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-4 text-right font-bold text-slate-900">
                                            {item.stock.toLocaleString('es-EC', { maximumFractionDigits: 3 })}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
