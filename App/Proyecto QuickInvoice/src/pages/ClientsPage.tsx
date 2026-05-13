import { useState, useEffect } from 'react'
import { facturacionService } from '../services/facturacionService'
import type { Cliente } from '../services/facturacionService'
import { useAuth } from '../contexts/AuthContext'
import {
    Plus,
    Search,
    Edit2,
    Trash2,
    User,
    X,
    Save,
    Loader2,
    Search as SearchIcon
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { validateIdentificacion } from '../lib/utils'

export function ClientsPage() {
    const { empresa } = useAuth()
    const [clientes, setClientes] = useState<Cliente[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingCliente, setEditingCliente] = useState<Partial<Cliente> | null>(null)
    const [isSearchingSRI, setIsSearchingSRI] = useState(false)

    useEffect(() => {
        if (empresa?.id) {
            loadData()
        }
    }, [empresa?.id])

    async function loadData() {
        try {
            setLoading(true)
            const data = await facturacionService.getClientes(empresa!.id)
            setClientes(data)
        } catch (error) {
            console.error('Error loading clients:', error)
        } finally {
            setLoading(false)
        }
    }

    async function lookupSRI() {
        if (!editingCliente?.identificacion) return
        const id = editingCliente.identificacion.trim()
        if (!id) return

        const validation = validateIdentificacion(id)
        if (!validation.isValid) {
            if (!confirm(`La identificación "${id}" no tiene 10 (Cédula) ni 13 (RUC) dígitos.\n\n¿Es este un Pasaporte?`)) {
                return
            }
        }

        try {
            setIsSearchingSRI(true)
            const { data, error } = await supabase.functions.invoke('sri-lookup', {
                body: { identificacion: id }
            })

            if (error) throw error
            const nombre = data?.nombreCompleto || data?.razonSocial
            if (nombre) {
                setEditingCliente(prev => ({ ...prev!, nombre }))
            } else if (data?.error) {
                alert('No se encontró información para esta identificación en el SRI')
            }
        } catch (err) {
            console.error('Error lookup SRI:', err)
            confirm('No se pudo consultar el SRI. ¿Desea ingresar el nombre manualmente?')
        } finally {
            setIsSearchingSRI(false)
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!empresa?.id || !editingCliente) return

        const id = (editingCliente.identificacion || '').trim()
        const validation = validateIdentificacion(id)
        if (!validation.isValid) {
            if (!confirm(`La identificación "${id}" no tiene 10 (Cédula) ni 13 (RUC) dígitos. ¿Es un Pasaporte?`)) {
                return
            }
        }

        try {
            if (editingCliente.id) {
                await facturacionService.updateCliente(editingCliente.id, editingCliente)
            } else {
                await facturacionService.createCliente({
                    ...editingCliente,
                    empresa_id: empresa.id
                } as any)
            }
            setIsModalOpen(false)
            setEditingCliente(null)
            loadData()
        } catch (error: any) {
            console.error('Error saving client:', error)
            alert(`Error al guardar el cliente: ${error.message}`)
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('¿Estás seguro de eliminar este cliente?')) return
        try {
            await facturacionService.deleteCliente(id)
            loadData()
        } catch (error: any) {
            console.error('Error deleting client:', error)
            alert(`Error al eliminar el cliente: ${error.message}`)
        }
    }

    const filtered = clientes.filter(c =>
        c.nombre.toLowerCase().includes(search.toLowerCase()) ||
        c.identificacion.includes(search)
    )

    if (loading) return <div className="p-12 text-center">Cargando clientes...</div>

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Maestro de Clientes</h1>
                    <p className="text-slate-500">Administra la base de datos de tus clientes para facturación</p>
                </div>
                <button
                    onClick={() => {
                        setEditingCliente({ identificacion: '', nombre: '', email: '', direccion: '' })
                        setIsModalOpen(true)
                    }}
                    className="btn btn-primary flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    Nuevo Cliente
                </button>
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                    type="text"
                    placeholder="Buscar por nombre o RUC/Cédula..."
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                                <th className="px-6 py-4 font-medium">Cliente</th>
                                <th className="px-6 py-4 font-medium">Identificación</th>
                                <th className="px-6 py-4 font-medium">Email</th>
                                <th className="px-6 py-4 font-medium">Teléfono</th>
                                <th className="px-6 py-4 font-medium text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filtered.map(cliente => (
                                <tr key={cliente.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400">
                                                <User className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-900">{cliente.nombre}</p>
                                                <p className="text-xs text-slate-400">{cliente.direccion || 'Sin dirección'}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 font-mono text-sm text-slate-600">
                                        {cliente.identificacion}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-500">
                                        {cliente.email || '-'}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-500">
                                        {cliente.telefono || '-'}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => {
                                                    setEditingCliente(cliente)
                                                    setIsModalOpen(true)
                                                }}
                                                className="p-2 hover:bg-white border border-transparent hover:border-slate-200 rounded-lg text-slate-400 hover:text-primary-600 transition-all"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(cliente.id)}
                                                className="p-2 hover:bg-white border border-transparent hover:border-red-100 rounded-lg text-slate-400 hover:text-red-600 transition-all"
                                                disabled={cliente.identificacion === '9999999999999'}
                                                title={cliente.identificacion === '9999999999999' ? 'Consumidor Final no se puede eliminar' : ''}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                                        No se encontraron clientes.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <h2 className="text-lg font-bold text-slate-900">
                                {editingCliente?.id ? 'Editar Cliente' : 'Nuevo Cliente'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div className="relative">
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Identificación (RUC/Cédula)</label>
                                <input
                                    required
                                    type="text"
                                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none pr-10"
                                    value={editingCliente?.identificacion || ''}
                                    onChange={(e) => setEditingCliente({ ...editingCliente, identificacion: e.target.value })}
                                    onBlur={() => {
                                        if (editingCliente?.identificacion && editingCliente.identificacion.length >= 10 && !editingCliente.nombre) {
                                            lookupSRI()
                                        }
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={lookupSRI}
                                    disabled={isSearchingSRI}
                                    className="absolute right-2 bottom-2 p-1 hover:bg-slate-100 rounded text-primary-600 transition-colors"
                                    title="Buscar en SRI"
                                >
                                    {isSearchingSRI ? <Loader2 className="w-3 h-3 animate-spin" /> : <SearchIcon className="w-3 h-3" />}
                                </button>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Nombre Completo / Razón Social</label>
                                <input
                                    required
                                    type="text"
                                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none"
                                    value={editingCliente?.nombre || ''}
                                    onChange={(e) => setEditingCliente({ ...editingCliente, nombre: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Email</label>
                                <input
                                    type="email"
                                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none"
                                    value={editingCliente?.email || ''}
                                    onChange={(e) => setEditingCliente({ ...editingCliente, email: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Dirección</label>
                                <textarea
                                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none resize-none h-20"
                                    value={editingCliente?.direccion || ''}
                                    onChange={(e) => setEditingCliente({ ...editingCliente, direccion: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Teléfono Móvil</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none"
                                    value={editingCliente?.telefono || ''}
                                    onChange={(e) => setEditingCliente({ ...editingCliente, telefono: e.target.value })}
                                />
                            </div>
                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 bg-primary-600 text-white rounded-lg px-4 py-2 font-bold hover:bg-primary-700 shadow-lg shadow-primary-200 flex items-center justify-center gap-2"
                                >
                                    <Save className="w-4 h-4" />
                                    Guardar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
