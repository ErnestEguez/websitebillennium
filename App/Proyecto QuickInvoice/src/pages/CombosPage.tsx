import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { HelpButton } from '../components/help/HelpButton'
import { ComboModal } from '../components/ComboModal'
import { combosService, type Combo } from '../services/combosService'
import { formatCurrency } from '../lib/utils'
import { Plus, Loader2, PackagePlus, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react'

export function CombosPage() {
    const { empresa, user } = useAuth()
    const [combos, setCombos] = useState<Combo[]>([])
    const [loading, setLoading] = useState(true)
    const [modalAbierto, setModalAbierto] = useState(false)
    const [editando, setEditando] = useState<Combo | null>(null)
    const [expandidoId, setExpandidoId] = useState<string | null>(null)
    const [eliminandoId, setEliminandoId] = useState<string | null>(null)

    useEffect(() => {
        if (empresa?.id) cargar()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [empresa?.id])

    async function cargar() {
        try {
            setLoading(true)
            const data = await combosService.listar(empresa!.id)
            setCombos(data)
        } catch (e: any) {
            alert('Error al cargar combos: ' + e.message)
        } finally {
            setLoading(false)
        }
    }

    async function eliminar(combo: Combo) {
        if (!confirm(`¿Eliminar el combo "${combo.descripcion}"? Los combos ya facturados no se ven afectados.`)) return
        setEliminandoId(combo.id)
        try {
            await combosService.eliminar(combo.id)
            await cargar()
        } catch (e: any) {
            alert('Error al eliminar: ' + e.message)
        } finally {
            setEliminandoId(null)
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
                        <PackagePlus className="w-7 h-7 text-primary-600" /> Combos
                    </h1>
                    <p className="text-slate-600 mt-1">Paquetes de productos a precio promocional — al vender, se descomponen en sus artículos reales</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => { setEditando(null); setModalAbierto(true) }}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-bold hover:bg-primary-700">
                        <Plus className="w-4 h-4" /> Nuevo Combo
                    </button>
                    <HelpButton pageKey="combos" />
                </div>
            </div>

            {modalAbierto && (
                <ComboModal
                    empresaId={empresa!.id}
                    createdBy={user?.id}
                    combo={editando}
                    onClose={() => setModalAbierto(false)}
                    onSaved={() => { setModalAbierto(false); cargar() }}
                />
            )}

            <div className="card overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16 text-slate-400"><Loader2 className="w-6 h-6 animate-spin" /></div>
                ) : combos.length === 0 ? (
                    <div className="py-16 text-center text-slate-400">
                        <PackagePlus className="w-10 h-10 mx-auto mb-2 opacity-30" />
                        <p>Todavía no hay combos creados.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {combos.map(c => {
                            const isExp = expandidoId === c.id
                            return (
                                <div key={c.id}>
                                    <div className="flex items-center gap-3 px-5 py-4 hover:bg-slate-50 cursor-pointer"
                                        onClick={() => setExpandidoId(isExp ? null : c.id)}>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-slate-900">{c.descripcion}</p>
                                            <p className="text-xs text-slate-400">{c.codigo ? `Código: ${c.codigo} · ` : ''}{c.componentes.length} artículo(s)</p>
                                        </div>
                                        <p className="font-black text-primary-700">{formatCurrency(c.precio_total)}</p>
                                        <button onClick={e => { e.stopPropagation(); setEditando(c); setModalAbierto(true) }}
                                            className="p-2 text-slate-400 hover:text-primary-600"><Pencil className="w-4 h-4" /></button>
                                        <button onClick={e => { e.stopPropagation(); eliminar(c) }} disabled={eliminandoId === c.id}
                                            className="p-2 text-slate-400 hover:text-red-500 disabled:opacity-40">
                                            {eliminandoId === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                        </button>
                                        {isExp ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                    </div>
                                    {isExp && (
                                        <div className="bg-slate-50 px-5 py-3">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="text-xs text-slate-400">
                                                        <th className="text-left pb-1 font-semibold">Artículo</th>
                                                        <th className="text-right pb-1 font-semibold">Cant.</th>
                                                        <th className="text-right pb-1 font-semibold">Precio c/IVA</th>
                                                        <th className="text-right pb-1 font-semibold">Subtotal</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-200">
                                                    {c.componentes.map((comp, i) => (
                                                        <tr key={comp.id ?? i}>
                                                            <td className="py-1.5 text-slate-700">{comp.nombre_producto}</td>
                                                            <td className="py-1.5 text-right text-slate-600">{comp.cantidad}</td>
                                                            <td className="py-1.5 text-right text-slate-600">{formatCurrency(comp.precio_unitario)}</td>
                                                            <td className="py-1.5 text-right font-semibold text-slate-800">{formatCurrency(comp.cantidad * comp.precio_unitario)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
