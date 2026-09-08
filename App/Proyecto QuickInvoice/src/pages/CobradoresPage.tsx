import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { cobradorService, type Cobrador } from '../services/cobradorService'
import { UserCheck, Plus, Edit2, UserX, Save, X, Truck } from 'lucide-react'

export function CobradoresPage() {
    const { empresa } = useAuth()
    const [cobradores, setCobradores] = useState<Cobrador[]>([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editing, setEditing] = useState<Partial<Cobrador> | null>(null)
    const [saving, setSaving] = useState(false)
    const [filtro, setFiltro] = useState<'activo' | 'baja' | 'todos'>('activo')

    useEffect(() => {
        if (empresa?.id) loadCobradores()
    }, [empresa?.id])

    async function loadCobradores() {
        try {
            setLoading(true)
            const data = await cobradorService.getCobradores(empresa!.id)
            setCobradores(data)
        } catch (e) {
            console.error(e)
            alert('Error al cargar cobradores')
        } finally {
            setLoading(false)
        }
    }

    async function handleSave() {
        if (!editing?.nombres?.trim()) {
            alert('El nombre es obligatorio')
            return
        }
        try {
            setSaving(true)
            if (editing.id) {
                await cobradorService.updateCobrador(editing.id, {
                    codigo: editing.codigo,
                    nombres: editing.nombres,
                    identificacion: editing.identificacion,
                    telefono: editing.telefono,
                    correo: editing.correo,
                    zona: editing.zona,
                })
            } else {
                await cobradorService.createCobrador({
                    empresa_id: empresa!.id,
                    codigo: editing.codigo,
                    nombres: editing.nombres,
                    identificacion: editing.identificacion,
                    telefono: editing.telefono,
                    correo: editing.correo,
                    zona: editing.zona,
                    estado: 'activo',
                })
            }
            await loadCobradores()
            setIsModalOpen(false)
            setEditing(null)
        } catch (e: any) {
            alert(`Error al guardar: ${e.message}`)
        } finally {
            setSaving(false)
        }
    }

    async function handleDarDeBaja(c: Cobrador) {
        if (!confirm(`¿Dar de baja a ${c.nombres}? El historial de créditos asignados se conserva.`)) return
        try {
            await cobradorService.darDeBajaCobrador(c.id)
            await loadCobradores()
        } catch (e: any) {
            alert(`Error: ${e.message}`)
        }
    }

    async function handleReactivar(c: Cobrador) {
        try {
            await cobradorService.updateCobrador(c.id, { estado: 'activo', fecha_baja: null })
            await loadCobradores()
        } catch (e: any) {
            alert(`Error: ${e.message}`)
        }
    }

    const filtrados = cobradores.filter(c =>
        filtro === 'todos' ? true : c.estado === filtro
    )

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-slate-500">Cargando cobradores...</div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Cobradores</h1>
                    <p className="text-slate-600 mt-1">Gestiona el equipo de cobro de créditos de electrodomésticos</p>
                </div>
                <button
                    onClick={() => { setEditing({}); setIsModalOpen(true) }}
                    className="btn btn-primary flex items-center gap-2"
                >
                    <Plus className="w-5 h-5" />
                    Nuevo Cobrador
                </button>
            </div>

            {/* Filtros */}
            <div className="flex gap-2">
                {(['activo', 'baja', 'todos'] as const).map(f => (
                    <button
                        key={f}
                        onClick={() => setFiltro(f)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            filtro === f
                                ? 'bg-primary-600 text-white'
                                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                        {f === 'activo' ? 'Activos' : f === 'baja' ? 'Dados de baja' : 'Todos'}
                    </button>
                ))}
            </div>

            {/* Tabla */}
            <div className="card overflow-hidden">
                <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Código</th>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Nombres</th>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Identificación</th>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Teléfono</th>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Zona</th>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
                            <th className="px-6 py-3" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filtrados.map(c => (
                            <tr key={c.id} className={`hover:bg-slate-50 ${c.estado === 'baja' ? 'opacity-50' : ''}`}>
                                <td className="px-6 py-4 text-slate-600 font-mono text-sm">{c.codigo || '—'}</td>
                                <td className="px-6 py-4 font-medium text-slate-900">{c.nombres}</td>
                                <td className="px-6 py-4 text-slate-600">{c.identificacion || '—'}</td>
                                <td className="px-6 py-4 text-slate-600">{c.telefono || '—'}</td>
                                <td className="px-6 py-4 text-slate-600">{c.zona || '—'}</td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        c.estado === 'activo'
                                            ? 'bg-green-100 text-green-800'
                                            : 'bg-red-100 text-red-800'
                                    }`}>
                                        {c.estado === 'activo' ? 'Activo' : 'Baja'}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex gap-1 justify-end">
                                        {c.estado === 'activo' ? (
                                            <>
                                                <button
                                                    onClick={() => { setEditing(c); setIsModalOpen(true) }}
                                                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-primary-600"
                                                    title="Editar"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDarDeBaja(c)}
                                                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-red-600"
                                                    title="Dar de baja"
                                                >
                                                    <UserX className="w-4 h-4" />
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={() => handleReactivar(c)}
                                                className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-green-600"
                                                title="Reactivar"
                                            >
                                                <UserCheck className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {filtrados.length === 0 && (
                    <div className="text-center py-12">
                        <Truck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500">No hay cobradores {filtro === 'activo' ? 'activos' : filtro === 'baja' ? 'dados de baja' : ''}</p>
                        {filtro === 'activo' && (
                            <button
                                onClick={() => { setEditing({}); setIsModalOpen(true) }}
                                className="btn btn-primary mt-4"
                            >
                                Crear primer cobrador
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && editing !== null && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                            <h2 className="text-xl font-bold text-slate-900">
                                {editing.id ? 'Editar Cobrador' : 'Nuevo Cobrador'}
                            </h2>
                            <button onClick={() => { setIsModalOpen(false); setEditing(null) }} className="p-2 hover:bg-slate-100 rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Nombres <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={editing.nombres || ''}
                                    onChange={e => setEditing({ ...editing, nombres: e.target.value })}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    placeholder="Juan Pérez"
                                    autoFocus
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Código</label>
                                    <input
                                        type="text"
                                        value={editing.codigo || ''}
                                        onChange={e => setEditing({ ...editing, codigo: e.target.value.toUpperCase() })}
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                        placeholder="COB01"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Identificación</label>
                                    <input
                                        type="text"
                                        value={editing.identificacion || ''}
                                        onChange={e => setEditing({ ...editing, identificacion: e.target.value })}
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                        placeholder="0900000000"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                                    <input
                                        type="text"
                                        value={editing.telefono || ''}
                                        onChange={e => setEditing({ ...editing, telefono: e.target.value })}
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                        placeholder="0999999999"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Zona</label>
                                    <input
                                        type="text"
                                        value={editing.zona || ''}
                                        onChange={e => setEditing({ ...editing, zona: e.target.value })}
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                        placeholder="Norte"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Correo</label>
                                <input
                                    type="email"
                                    value={editing.correo || ''}
                                    onChange={e => setEditing({ ...editing, correo: e.target.value })}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    placeholder="cobrador@empresa.com"
                                />
                            </div>
                        </div>

                        <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
                            <button
                                onClick={() => { setIsModalOpen(false); setEditing(null) }}
                                className="btn btn-secondary"
                                disabled={saving}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                className="btn btn-primary flex items-center gap-2"
                                disabled={saving}
                            >
                                {saving ? (
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <Save className="w-4 h-4" />
                                )}
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
