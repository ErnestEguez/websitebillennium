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
    Search as SearchIcon,
    RotateCcw,
    EyeOff,
    ChevronDown,
    ChevronUp,
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
    const [showBaja, setShowBaja] = useState(false)
    const [clientesBaja, setClientesBaja] = useState<Cliente[]>([])
    const [loadingBaja, setLoadingBaja] = useState(false)
    const [restorandoId, setRestorandoId] = useState<string | null>(null)

    // Búsqueda solo al presionar Enter o botón Buscar
    async function buscarClientes() {
        if (!empresa?.id) return
        setLoading(true)
        try {
            if (!search.trim()) {
                await loadData(); return
            }
            const q = '%' + search.trim().replace(/\*/g, '%') + '%'
            const { data } = await supabase
                .from('clientes').select('*')
                .eq('empresa_id', empresa.id)
                .neq('activo', false)
                .or(`nombre.ilike.${q},identificacion.ilike.${q}`)
                .order('nombre').limit(200)
            setClientes(data as Cliente[] ?? [])
        } finally { setLoading(false) }
    }

    // Sin carga inicial — el usuario busca con el botón Buscar o Enter
    useEffect(() => { if (empresa?.id) setLoading(false) }, [empresa?.id])

    async function loadData() {
        // Solo se llama después de guardar/eliminar para refrescar el resultado actual
        if (search.trim()) await buscarClientes()
    }

    async function cargarClientesBaja() {
        if (!empresa?.id) return
        setLoadingBaja(true)
        try {
            const { data } = await supabase
                .from('clientes').select('*')
                .eq('empresa_id', empresa.id)
                .eq('activo', false)
                .order('nombre')
            setClientesBaja(data as Cliente[] ?? [])
        } finally {
            setLoadingBaja(false)
        }
    }

    async function restaurarCliente(id: string) {
        setRestorandoId(id)
        try {
            await facturacionService.restaurarCliente(id)
            setClientesBaja(prev => prev.filter(c => c.id !== id))
        } catch (e: any) {
            alert('Error al restaurar: ' + e.message)
        } finally {
            setRestorandoId(null)
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

    async function handleDelete(id: string, identificacion: string) {
        if (identificacion === '9999999999999') {
            alert('El Consumidor Final no puede darse de baja.')
            return
        }
        if (!confirm('¿Dar de baja este cliente? Podrás restaurarlo después desde "Ver Dados de Baja".')) return
        try {
            await facturacionService.deleteCliente(id)
            loadData()
        } catch (error: any) {
            console.error('Error dando de baja al cliente:', error)
            alert(`Error: ${error.message}`)
        }
    }

    const filtered = clientes  // ya viene filtrado del servidor

    if (loading) return <div className="p-12 text-center">Cargando clientes...</div>

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Maestro de Clientes</h1>
                    <p className="text-slate-500">Administra la base de datos de tus clientes para facturación</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => {
                            const next = !showBaja
                            setShowBaja(next)
                            if (next && clientesBaja.length === 0) cargarClientesBaja()
                        }}
                        className="btn btn-secondary flex items-center gap-2"
                    >
                        <EyeOff className="w-4 h-4" />
                        {showBaja ? 'Ocultar Dados de Baja' : 'Ver Dados de Baja'}
                        {showBaja ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
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
            </div>

            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Nombre o RUC/Cédula — Enter o Buscar (use * como comodín)"
                        className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') buscarClientes() }}
                    />
                </div>
                <button onClick={buscarClientes} disabled={loading}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <SearchIcon className="w-4 h-4" />}
                    Buscar
                </button>
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
                                                onClick={() => handleDelete(cliente.id, cliente.identificacion)}
                                                className="p-2 hover:bg-white border border-transparent hover:border-red-100 rounded-lg text-slate-400 hover:text-red-600 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                                                disabled={cliente.identificacion === '9999999999999'}
                                                title={cliente.identificacion === '9999999999999' ? 'El Consumidor Final no puede eliminarse' : 'Eliminar'}
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
                                        {!search.trim()
                                            ? 'Escribe un nombre o RUC/cédula y presiona Buscar.'
                                            : 'No se encontraron clientes con ese criterio.'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Sección Dados de Baja */}
            {showBaja && (
                <div className="card overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-slate-100 border-b border-slate-200">
                        <div className="flex items-center gap-2">
                            <EyeOff className="w-4 h-4 text-slate-500" />
                            <span className="font-bold text-slate-600 text-sm uppercase tracking-wide">Clientes Dados de Baja</span>
                            <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-semibold">{clientesBaja.length}</span>
                        </div>
                        {loadingBaja && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                                    <th className="px-6 py-3 font-medium">Cliente</th>
                                    <th className="px-6 py-3 font-medium">Identificación</th>
                                    <th className="px-6 py-3 font-medium">Email</th>
                                    <th className="px-6 py-3 font-medium">Teléfono</th>
                                    <th className="px-6 py-3 font-medium text-right">Restaurar</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {clientesBaja.map(c => (
                                    <tr key={c.id} className="hover:bg-slate-50 opacity-70">
                                        <td className="px-6 py-3">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 bg-slate-200 rounded-lg flex items-center justify-center text-slate-400">
                                                    <User className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <p className="font-semibold text-slate-500">{c.nombre}</p>
                                                    <p className="text-xs text-slate-400">{c.direccion || 'Sin dirección'}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-3 font-mono text-sm text-slate-500">{c.identificacion}</td>
                                        <td className="px-6 py-3 text-sm text-slate-400">{c.email || '—'}</td>
                                        <td className="px-6 py-3 text-sm text-slate-400">{c.telefono || '—'}</td>
                                        <td className="px-6 py-3 text-right">
                                            <button
                                                onClick={() => restaurarCliente(c.id)}
                                                disabled={restorandoId === c.id}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium"
                                            >
                                                {restorandoId === c.id
                                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                                    : <RotateCcw className="w-3 h-3" />
                                                }
                                                Restaurar
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {!loadingBaja && clientesBaja.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-8 text-center text-slate-400 text-sm">
                                            No hay clientes dados de baja.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

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
