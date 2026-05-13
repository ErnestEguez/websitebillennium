import { useState, useEffect } from 'react'
import { precioVolumenService, type PrecioVolumen } from '../services/precioVolumenService'
import { Layers, Plus, Loader2, ToggleLeft, ToggleRight, X } from 'lucide-react'
import { formatCurrency } from '../lib/utils'

interface Props {
    producto: { id: string; nombre: string; precio_venta: number }
    empresaId: string
    onClose: () => void
}

export function PrecioVolumenModal({ producto, empresaId, onClose }: Props) {
    const [rangos, setRangos] = useState<PrecioVolumen[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [form, setForm] = useState({ desde: '', hasta: '', precio: '' })
    const [error, setError] = useState('')

    useEffect(() => { cargar() }, [])

    async function cargar() {
        setLoading(true)
        try {
            setRangos(await precioVolumenService.getByProducto(empresaId, producto.id))
        } finally {
            setLoading(false)
        }
    }

    async function handleAgregar() {
        setError('')
        const desde = parseFloat(form.desde)
        const hasta = parseFloat(form.hasta)
        const precio = parseFloat(form.precio)

        if (isNaN(desde) || isNaN(hasta) || isNaN(precio))
            return setError('Complete todos los campos con valores numéricos.')
        if (hasta <= desde)
            return setError('"Hasta" debe ser mayor que "Desde".')
        if (precio <= 0)
            return setError('El precio debe ser mayor a 0.')

        const solapado = rangos.filter(r => r.status).some(r =>
            !(hasta < r.desde || desde > r.hasta)
        )
        if (solapado)
            return setError('El rango se solapa con un rango activo existente.')

        try {
            setSaving(true)
            await precioVolumenService.crear({
                id_empresa: empresaId,
                codigoitem: producto.id,
                desde,
                hasta,
                precio,
            })
            setForm({ desde: '', hasta: '', precio: '' })
            await cargar()
        } catch (e: any) {
            setError(e.message)
        } finally {
            setSaving(false)
        }
    }

    async function handleToggle(rango: PrecioVolumen) {
        try {
            await precioVolumenService.toggleStatus(rango.id, !rango.status)
            await cargar()
        } catch {
            setError('Error al cambiar estado')
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg space-y-5 p-6 animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-violet-100 rounded-xl flex items-center justify-center">
                            <Layers className="w-5 h-5 text-violet-600" />
                        </div>
                        <div>
                            <h2 className="font-black text-slate-900 text-base">Precios por Volumen</h2>
                            <p className="text-xs text-slate-500">{producto.nombre}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
                        <X className="w-4 h-4 text-slate-500" />
                    </button>
                </div>

                {/* Precio de lista */}
                <div className="bg-slate-50 rounded-xl px-4 py-2.5 flex items-center justify-between text-sm">
                    <span className="text-slate-500">Precio de lista (sin IVA)</span>
                    <span className="font-bold text-slate-800">{formatCurrency(producto.precio_venta)}</span>
                </div>

                {/* Tabla de rangos */}
                {loading ? (
                    <div className="flex justify-center py-6">
                        <Loader2 className="animate-spin w-5 h-5 text-slate-400" />
                    </div>
                ) : rangos.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-4 italic">
                        Sin rangos definidos — se usa el precio de lista.
                    </p>
                ) : (
                    <div className="rounded-xl border border-slate-100 overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-400">
                                    <th className="px-4 py-2.5 text-left font-medium">Desde</th>
                                    <th className="px-4 py-2.5 text-left font-medium">Hasta</th>
                                    <th className="px-4 py-2.5 text-right font-medium">Precio s/IVA</th>
                                    <th className="px-4 py-2.5 text-center font-medium">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {rangos.map(r => (
                                    <tr
                                        key={r.id}
                                        className={`hover:bg-slate-50 transition-colors ${!r.status ? 'opacity-40' : ''}`}
                                    >
                                        <td className="px-4 py-2.5 font-mono text-slate-700">{r.desde}</td>
                                        <td className="px-4 py-2.5 font-mono text-slate-700">{r.hasta}</td>
                                        <td className="px-4 py-2.5 text-right font-bold text-violet-700">
                                            {formatCurrency(r.precio)}
                                        </td>
                                        <td className="px-4 py-2.5 text-center">
                                            <button
                                                onClick={() => handleToggle(r)}
                                                title={r.status ? 'Desactivar' : 'Activar'}
                                                className="inline-flex"
                                            >
                                                {r.status
                                                    ? <ToggleRight className="w-5 h-5 text-emerald-500" />
                                                    : <ToggleLeft className="w-5 h-5 text-slate-300" />}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Formulario nuevo rango */}
                <div className="border-t border-slate-100 pt-4 space-y-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Agregar nuevo rango
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                        <div>
                            <label className="text-[10px] text-slate-400 font-bold block mb-1">Desde (cant.)</label>
                            <input
                                type="number" min="0" step="1" placeholder="ej. 12"
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-violet-400"
                                value={form.desde}
                                onChange={e => setForm(f => ({ ...f, desde: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-400 font-bold block mb-1">Hasta (cant.)</label>
                            <input
                                type="number" min="1" step="1" placeholder="ej. 23"
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-violet-400"
                                value={form.hasta}
                                onChange={e => setForm(f => ({ ...f, hasta: e.target.value }))}
                            />
                        </div>
                        <div>
                            <label className="text-[10px] text-slate-400 font-bold block mb-1">Precio s/IVA</label>
                            <input
                                type="number" min="0.0001" step="0.0001" placeholder="ej. 0.9500"
                                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-violet-400"
                                value={form.precio}
                                onChange={e => setForm(f => ({ ...f, precio: e.target.value }))}
                            />
                        </div>
                    </div>

                    {error && (
                        <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
                    )}

                    <button
                        onClick={handleAgregar}
                        disabled={saving}
                        className="w-full py-2.5 bg-violet-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-violet-700 disabled:opacity-50 transition-colors"
                    >
                        {saving
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <><Plus className="w-4 h-4" /> Agregar rango</>}
                    </button>
                </div>
            </div>
        </div>
    )
}
