import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { vendedorService, type Vendedor } from '../services/vendedorService'
import { UserCheck, Plus, Edit2, UserX, Save, X } from 'lucide-react'

export function VendedoresPage() {
    const { empresa } = useAuth()
    const [vendedores, setVendedores] = useState<Vendedor[]>([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editing, setEditing] = useState<Partial<Vendedor> | null>(null)
    const [saving, setSaving] = useState(false)
    const [filtro, setFiltro] = useState<'activo' | 'baja' | 'todos'>('activo')

    useEffect(() => {
        if (empresa?.id) loadVendedores()
    }, [empresa?.id])

    async function loadVendedores() {
        try {
            setLoading(true)
            const data = await vendedorService.getVendedores(empresa!.id)
            setVendedores(data)
        } catch (e) {
            console.error(e)
            alert('Error al cargar vendedores')
        } finally {
            setLoading(false)
        }
    }

    async function handleSave() {
        if (!editing?.nombre?.trim()) {
            alert('El nombre es obligatorio')
            return
        }
        try {
            setSaving(true)
            if (editing.id) {
                await vendedorService.updateVendedor(editing.id, {
                    nombre: editing.nombre,
                    iniciales: editing.iniciales,
                    email: editing.email,
                    telefono: editing.telefono,
                })
            } else {
                await vendedorService.createVendedor({
                    empresa_id: empresa!.id,
                    nombre: editing.nombre,
                    iniciales: editing.iniciales,
                    email: editing.email,
                    telefono: editing.telefono,
                    estado: 'activo',
                })
            }
            await loadVendedores()
            setIsModalOpen(false)
            setEditing(null)
        } catch (e: any) {
            alert(`Error al guardar: ${e.message}`)
        } finally {
            setSaving(false)
        }
    }

    async function handleDarDeBaja(v: Vendedor) {
        if (!confirm(`¿Dar de baja a ${v.nombre}? El historial de facturas se conserva.`)) return
        try {
            await vendedorService.darDeBajaVendedor(v.id)
            await loadVendedores()
        } catch (e: any) {
            alert(`Error: ${e.message}`)
        }
    }

    async function handleReactivar(v: Vendedor) {
        try {
            await vendedorService.updateVendedor(v.id, { estado: 'activo', fecha_baja: null })
            await loadVendedores()
        } catch (e: any) {
            alert(`Error: ${e.message}`)
        }
    }

    const filtrados = vendedores.filter(v =>
        filtro === 'todos' ? true : v.estado === filtro
    )

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-slate-500">Cargando vendedores...</div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Vendedores</h1>
                    <p className="text-slate-600 mt-1">Gestiona el equipo de ventas</p>
                </div>
                <button
                    onClick={() => { setEditing({}); setIsModalOpen(true) }}
                    className="btn btn-primary flex items-center gap-2"
                >
                    <Plus className="w-5 h-5" />
                    Nuevo Vendedor
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
                            <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Nombre</th>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Iniciales</th>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Email</th>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Teléfono</th>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
                            <th className="px-6 py-3" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {filtrados.map(v => (
                            <tr key={v.id} className={`hover:bg-slate-50 ${v.estado === 'baja' ? 'opacity-50' : ''}`}>
                                <td className="px-6 py-4 font-medium text-slate-900">{v.nombre}</td>
                                <td className="px-6 py-4 text-slate-600">
                                    {v.iniciales ? (
                                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary-100 text-primary-700 font-bold text-sm">
                                            {v.iniciales}
                                        </span>
                                    ) : '—'}
                                </td>
                                <td className="px-6 py-4 text-slate-600">{v.email || '—'}</td>
                                <td className="px-6 py-4 text-slate-600">{v.telefono || '—'}</td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        v.estado === 'activo'
                                            ? 'bg-green-100 text-green-800'
                                            : 'bg-red-100 text-red-800'
                                    }`}>
                                        {v.estado === 'activo' ? 'Activo' : 'Baja'}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex gap-1 justify-end">
                                        {v.estado === 'activo' ? (
                                            <>
                                                <button
                                                    onClick={() => { setEditing(v); setIsModalOpen(true) }}
                                                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-primary-600"
                                                    title="Editar"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDarDeBaja(v)}
                                                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-red-600"
                                                    title="Dar de baja"
                                                >
                                                    <UserX className="w-4 h-4" />
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={() => handleReactivar(v)}
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
                        <UserCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500">No hay vendedores {filtro === 'activo' ? 'activos' : filtro === 'baja' ? 'dados de baja' : ''}</p>
                        {filtro === 'activo' && (
                            <button
                                onClick={() => { setEditing({}); setIsModalOpen(true) }}
                                className="btn btn-primary mt-4"
                            >
                                Crear primer vendedor
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
                                {editing.id ? 'Editar Vendedor' : 'Nuevo Vendedor'}
                            </h2>
                            <button onClick={() => { setIsModalOpen(false); setEditing(null) }} className="p-2 hover:bg-slate-100 rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Nombre <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={editing.nombre || ''}
                                    onChange={e => setEditing({ ...editing, nombre: e.target.value })}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    placeholder="Juan Pérez"
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Iniciales</label>
                                <input
                                    type="text"
                                    maxLength={4}
                                    value={editing.iniciales || ''}
                                    onChange={e => setEditing({ ...editing, iniciales: e.target.value.toUpperCase() })}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    placeholder="JP"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                                    <input
                                        type="email"
                                        value={editing.email || ''}
                                        onChange={e => setEditing({ ...editing, email: e.target.value })}
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                        placeholder="juan@empresa.com"
                                    />
                                </div>
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
