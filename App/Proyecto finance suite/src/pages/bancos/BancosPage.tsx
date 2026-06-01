import { useEffect, useState } from 'react'
import { Plus, Pencil, ToggleLeft, ToggleRight, Loader2, X, AlertCircle, Landmark } from 'lucide-react'
import { bancosService } from '../../services/bancosService'
import { cn } from '../../lib/utils'
import type { Banco } from '../../types/finance'

const EMPTY: Omit<Banco, 'id' | 'created_at'> = {
    codigo: '', nombre: '', abreviatura: '', ruc: '', pais: 'EC', activo: true,
}

export function BancosPage() {
    const [lista, setLista]     = useState<Banco[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError]     = useState('')
    const [busq, setBusq]       = useState('')
    const [modal, setModal]     = useState(false)
    const [editId, setEditId]   = useState<string | null>(null)
    const [form, setForm]       = useState(EMPTY)
    const [saving, setSaving]   = useState(false)

    useEffect(() => { cargar() }, [])

    async function cargar() {
        setLoading(true)
        try { setLista(await bancosService.listar()) }
        catch (e: unknown) { setError(String(e)) }
        finally { setLoading(false) }
    }

    function abrirNuevo() {
        const maxCod = lista.reduce((max, b) => {
            const n = parseInt(b.codigo, 10)
            return isNaN(n) ? max : Math.max(max, n)
        }, 0)
        const sigCodigo = String(maxCod + 1).padStart(3, '0')
        setEditId(null)
        setForm({ ...EMPTY, codigo: sigCodigo })
        setModal(true)
    }

    function abrirEditar(b: Banco) {
        setEditId(b.id)
        setForm({ codigo: b.codigo, nombre: b.nombre, abreviatura: b.abreviatura ?? '', ruc: b.ruc ?? '', pais: b.pais, activo: b.activo })
        setModal(true)
    }

    async function guardar() {
        if (!form.codigo.trim() || !form.nombre.trim()) { setError('Código y nombre son obligatorios'); return }
        setSaving(true); setError('')
        try {
            if (editId) await bancosService.actualizar(editId, form)
            else        await bancosService.crear(form)
            setModal(false)
            await cargar()
        } catch (e: unknown) { setError(String(e)) }
        finally { setSaving(false) }
    }

    async function toggleActivo(b: Banco) {
        try {
            await bancosService.toggleActivo(b.id, !b.activo)
            setLista(prev => prev.map(x => x.id === b.id ? { ...x, activo: !x.activo } : x))
        } catch (e: unknown) { setError(String(e)) }
    }

    const filtrados = lista.filter(b =>
        !busq || b.nombre.toLowerCase().includes(busq.toLowerCase()) ||
        b.codigo.includes(busq) || (b.abreviatura ?? '').toLowerCase().includes(busq.toLowerCase())
    )

    return (
        <div className="space-y-5 max-w-5xl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Bancos</h1>
                    <p className="text-slate-500 text-sm mt-0.5">Catálogo de bancos del Ecuador</p>
                </div>
                <button onClick={abrirNuevo} className="btn btn-primary gap-2">
                    <Plus className="w-4 h-4" />Nuevo banco
                </button>
            </div>

            {error && (
                <div className="card px-4 py-3 bg-red-50 border-red-200 text-red-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{error}</span>
                    <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
                </div>
            )}

            <div className="card p-4">
                <input className="input max-w-xs" placeholder="Buscar por nombre, código..."
                    value={busq} onChange={e => setBusq(e.target.value)} />
            </div>

            <div className="card overflow-hidden">
                <div className="bg-slate-700 px-5 py-3 text-white text-sm font-bold flex items-center gap-2">
                    <Landmark className="w-4 h-4" />
                    Bancos ({filtrados.length})
                </div>
                {loading ? (
                    <div className="py-12 text-center text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando...
                    </div>
                ) : filtrados.length === 0 ? (
                    <div className="py-12 text-center text-slate-400">
                        <Landmark className="w-10 h-10 mx-auto mb-2 opacity-20" />
                        <p>No hay bancos {busq ? 'con esa búsqueda' : 'registrados'}</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                                    <th className="py-2 px-4 text-left">Código</th>
                                    <th className="py-2 px-4 text-left">Nombre</th>
                                    <th className="py-2 px-4 text-left">Abreviatura</th>
                                    <th className="py-2 px-4 text-left">RUC</th>
                                    <th className="py-2 px-4 text-center">Estado</th>
                                    <th className="py-2 px-4 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtrados.map(b => (
                                    <tr key={b.id} className={cn('border-b border-slate-100 hover:bg-slate-50', !b.activo && 'opacity-50')}>
                                        <td className="py-2.5 px-4 font-mono text-xs font-bold text-slate-600">{b.codigo}</td>
                                        <td className="py-2.5 px-4 font-semibold text-slate-800">{b.nombre}</td>
                                        <td className="py-2.5 px-4 text-xs text-slate-500">{b.abreviatura || '—'}</td>
                                        <td className="py-2.5 px-4 font-mono text-xs text-slate-400">{b.ruc || '—'}</td>
                                        <td className="py-2.5 px-4 text-center">
                                            <button onClick={() => toggleActivo(b)} title={b.activo ? 'Desactivar' : 'Activar'}>
                                                {b.activo
                                                    ? <ToggleRight className="w-5 h-5 text-green-500 mx-auto" />
                                                    : <ToggleLeft  className="w-5 h-5 text-slate-400 mx-auto" />
                                                }
                                            </button>
                                        </td>
                                        <td className="py-2.5 px-4 text-center">
                                            <button onClick={() => abrirEditar(b)}
                                                className="p-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-700">
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal */}
            {modal && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="flex items-center justify-between px-6 py-4 border-b">
                            <h2 className="font-bold text-slate-900">{editId ? 'Editar Banco' : 'Nuevo Banco'}</h2>
                            <button onClick={() => setModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            {error && <p className="text-red-600 text-sm">{error}</p>}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="label">Código *</label>
                                    <input className="input" value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} />
                                </div>
                                <div>
                                    <label className="label">Abreviatura</label>
                                    <input className="input" value={form.abreviatura ?? ''} onChange={e => setForm(f => ({ ...f, abreviatura: e.target.value }))} />
                                </div>
                            </div>
                            <div>
                                <label className="label">Nombre *</label>
                                <input className="input" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
                            </div>
                            <div>
                                <label className="label">RUC</label>
                                <input className="input font-mono" value={form.ruc ?? ''} onChange={e => setForm(f => ({ ...f, ruc: e.target.value }))} />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-slate-50 rounded-b-2xl">
                            <button onClick={() => setModal(false)} className="btn btn-secondary">Cancelar</button>
                            <button onClick={guardar} disabled={saving} className="btn btn-primary gap-2">
                                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                {editId ? 'Guardar cambios' : 'Crear banco'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
