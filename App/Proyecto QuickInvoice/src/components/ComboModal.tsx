import { useState } from 'react'
import { X, Plus, Trash2, Loader2, PackagePlus } from 'lucide-react'
import { BuscadorProducto, type ProductoResultado } from './BuscadorProducto'
import { combosService, type Combo, type ComboComponente } from '../services/combosService'
import { formatCurrency } from '../lib/utils'

interface ComboModalProps {
    empresaId: string
    createdBy?: string
    combo?: Combo | null
    onClose: () => void
    onSaved: () => void
}

interface FilaComponente extends ComboComponente {
    _key: number
}

let seq = 0
function filaVacia(): FilaComponente {
    return { _key: seq++, producto_id: '', nombre_producto: '', cantidad: 1, precio_unitario: 0 }
}

export function ComboModal({ empresaId, createdBy, combo, onClose, onSaved }: ComboModalProps) {
    const [codigo, setCodigo] = useState(combo?.codigo ?? '')
    const [descripcion, setDescripcion] = useState(combo?.descripcion ?? '')
    const [precioTotal, setPrecioTotal] = useState(combo?.precio_total ?? 0)
    const [componentes, setComponentes] = useState<FilaComponente[]>(
        combo?.componentes?.length ? combo.componentes.map(c => ({ ...c, _key: seq++ })) : [filaVacia(), filaVacia()]
    )
    const [guardando, setGuardando] = useState(false)

    function actualizarFila(key: number, cambios: Partial<FilaComponente>) {
        setComponentes(prev => prev.map(f => f._key === key ? { ...f, ...cambios } : f))
    }
    function agregarFila() { setComponentes(prev => [...prev, filaVacia()]) }
    function quitarFila(key: number) { setComponentes(prev => prev.length <= 1 ? prev : prev.filter(f => f._key !== key)) }

    const suma = componentes.reduce((s, c) => s + (Number(c.cantidad) || 0) * (Number(c.precio_unitario) || 0), 0)
    const sumaRedondeada = Math.round(suma * 100) / 100
    const totalRedondeado = Math.round((Number(precioTotal) || 0) * 100) / 100
    const cuadra = sumaRedondeada === totalRedondeado
    const componentesValidos = componentes.every(c => c.producto_id && c.cantidad > 0 && c.precio_unitario > 0)
    const puedeGuardar = descripcion.trim().length > 0 && totalRedondeado > 0 && componentesValidos && cuadra

    async function handleGuardar() {
        if (!puedeGuardar) return
        setGuardando(true)
        try {
            const input = {
                codigo: codigo.trim() || null,
                descripcion: descripcion.trim(),
                precio_total: totalRedondeado,
                componentes: componentes.map(({ _key, ...c }) => c),
            }
            if (combo) {
                await combosService.actualizar(combo.id, input)
            } else {
                await combosService.crear(empresaId, input, createdBy)
            }
            onSaved()
        } catch (e: any) {
            alert('Error al guardar el combo: ' + e.message)
        } finally {
            setGuardando(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-6 max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <PackagePlus className="w-5 h-5 text-primary-600" /> {combo ? 'Editar Combo' : 'Nuevo Combo'}
                    </h2>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5 text-slate-400" /></button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Código (opcional)</label>
                            <input value={codigo} onChange={e => setCodigo(e.target.value)}
                                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-400" />
                        </div>
                        <div className="col-span-2">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Descripción del combo</label>
                            <input value={descripcion} onChange={e => setDescripcion(e.target.value)}
                                placeholder="Ej. Combo Cocina + Refrigeradora"
                                className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-400" />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Artículos del combo (con IVA incluido)</p>
                            <button onClick={agregarFila} className="flex items-center gap-1 text-xs font-bold text-primary-600 hover:text-primary-700">
                                <Plus className="w-3.5 h-3.5" /> Agregar artículo
                            </button>
                        </div>

                        <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                            {componentes.map(f => (
                                <div key={f._key} className="p-3 flex items-center gap-2">
                                    <div className="flex-1 min-w-0">
                                        {f.producto_id ? (
                                            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2">
                                                <span className="flex-1 text-sm truncate">{f.nombre_producto}</span>
                                                <button type="button" onClick={() => actualizarFila(f._key, { producto_id: '', nombre_producto: '', iva_porcentaje: undefined })}
                                                    className="text-slate-400 hover:text-red-500 text-xs px-1">✕</button>
                                            </div>
                                        ) : (
                                            <BuscadorProducto
                                                empresaId={empresaId}
                                                placeholder="Código o nombre del producto…"
                                                onSelect={(p: ProductoResultado) => actualizarFila(f._key, {
                                                    producto_id: p.id, nombre_producto: p.nombre, iva_porcentaje: p.iva_porcentaje,
                                                })}
                                            />
                                        )}
                                    </div>
                                    <input type="number" min={0} step="0.01" value={f.cantidad || ''}
                                        onChange={e => actualizarFila(f._key, { cantidad: Number(e.target.value) })}
                                        placeholder="Cant."
                                        className="w-20 px-2 py-2 rounded-lg border border-slate-200 text-sm text-right outline-none focus:ring-2 focus:ring-primary-400" />
                                    <input type="number" min={0} step="0.01" value={f.precio_unitario || ''}
                                        onChange={e => actualizarFila(f._key, { precio_unitario: Number(e.target.value) })}
                                        placeholder="Precio c/IVA"
                                        className="w-28 px-2 py-2 rounded-lg border border-slate-200 text-sm text-right outline-none focus:ring-2 focus:ring-primary-400" />
                                    <button onClick={() => quitarFila(f._key)} disabled={componentes.length <= 1}
                                        className="p-2 text-slate-300 hover:text-red-500 disabled:opacity-30">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-1">Total del combo (con IVA)</label>
                            <input type="number" min={0} step="0.01" value={precioTotal || ''}
                                onChange={e => setPrecioTotal(Number(e.target.value))}
                                className="w-32 px-3 py-2 rounded-xl border border-slate-200 text-right font-bold outline-none focus:ring-2 focus:ring-primary-400" />
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-slate-500">Suma de artículos</p>
                            <p className={`text-lg font-black ${cuadra ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(sumaRedondeada)}</p>
                            {!cuadra && totalRedondeado > 0 && (
                                <p className="text-xs text-red-500">No cuadra con el total (diferencia {formatCurrency(Math.abs(sumaRedondeada - totalRedondeado))})</p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50">
                        Cancelar
                    </button>
                    <button onClick={handleGuardar} disabled={!puedeGuardar || guardando}
                        className="flex-1 py-3 rounded-xl bg-primary-600 text-white font-bold disabled:opacity-40 flex items-center justify-center gap-2">
                        {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Guardar Combo
                    </button>
                </div>
            </div>
        </div>
    )
}
