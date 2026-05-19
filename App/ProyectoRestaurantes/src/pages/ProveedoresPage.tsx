import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { proveedoresService, type Proveedor } from '../services/proveedoresService'
import { Building2, Plus, Edit2, Trash2, Save, X } from 'lucide-react'

export function ProveedoresPage() {
    const { empresa } = useAuth()
    const [proveedores, setProveedores] = useState<Proveedor[]>([])
    const [loading, setLoading] = useState(true)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingProveedor, setEditingProveedor] = useState<Partial<Proveedor> | null>(null)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (empresa?.id) {
            loadProveedores()
        }
    }, [empresa?.id])

    async function loadProveedores() {
        try {
            setLoading(true)
            const data = await proveedoresService.getProveedoresByEmpresa(empresa!.id)
            setProveedores(data)
        } catch (error) {
            console.error('Error loading proveedores:', error)
            alert('Error al cargar proveedores')
        } finally {
            setLoading(false)
        }
    }

    async function handleSave() {
        if (!editingProveedor?.ruc || !editingProveedor?.nombre_empresa) {
            alert('RUC y Nombre de Empresa son obligatorios')
            return
        }

        try {
            setSaving(true)
            if (editingProveedor.id) {
                await proveedoresService.updateProveedor(editingProveedor.id, editingProveedor)
            } else {
                await proveedoresService.createProveedor({
                    ...editingProveedor,
                    empresa_id: empresa!.id
                })
            }
            await loadProveedores()
            setIsModalOpen(false)
            setEditingProveedor(null)
        } catch (error: any) {
            console.error('Error saving proveedor:', error)
            alert(`Error al guardar: ${error.message} `)
        } finally {
            setSaving(false)
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('¿Estás seguro de eliminar este proveedor?')) return

        try {
            await proveedoresService.deleteProveedor(id)
            await loadProveedores()
        } catch (error: any) {
            console.error('Error deleting proveedor:', error)
            alert(`Error al eliminar: ${error.message} `)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-slate-500">Cargando proveedores...</div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Proveedores</h1>
                    <p className="text-slate-600 mt-1">Gestiona tus proveedores</p>
                </div>
                <button
                    onClick={() => {
                        setEditingProveedor({})
                        setIsModalOpen(true)
                    }}
                    className="btn btn-primary flex items-center gap-2"
                >
                    <Plus className="w-5 h-5" />
                    Nuevo Proveedor
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {proveedores.map(proveedor => (
                    <div key={proveedor.id} className="card p-6 hover:shadow-lg transition-shadow">
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
                                    <Building2 className="w-6 h-6 text-primary-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900">{proveedor.nombre_empresa}</h3>
                                    <p className="text-sm text-slate-500">RUC: {proveedor.ruc}</p>
                                </div>
                            </div>
                            <div className="flex gap-1">
                                <button
                                    onClick={() => {
                                        setEditingProveedor(proveedor)
                                        setIsModalOpen(true)
                                    }}
                                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-primary-600"
                                >
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => handleDelete(proveedor.id)}
                                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-red-600"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2 text-sm">
                            {proveedor.nombre_encargado && (
                                <div>
                                    <span className="text-slate-500">Encargado:</span>
                                    <span className="ml-2 text-slate-700">{proveedor.nombre_encargado}</span>
                                </div>
                            )}
                            {proveedor.telefono && (
                                <div>
                                    <span className="text-slate-500">Teléfono:</span>
                                    <span className="ml-2 text-slate-700">{proveedor.telefono}</span>
                                </div>
                            )}
                            {proveedor.correo && (
                                <div>
                                    <span className="text-slate-500">Email:</span>
                                    <span className="ml-2 text-slate-700">{proveedor.correo}</span>
                                </div>
                            )}
                            {proveedor.direccion && (
                                <div>
                                    <span className="text-slate-500">Dirección:</span>
                                    <span className="ml-2 text-slate-700">{proveedor.direccion}</span>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {proveedores.length === 0 && (
                <div className="text-center py-12">
                    <Building2 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-500">No hay proveedores registrados</p>
                    <button
                        onClick={() => {
                            setEditingProveedor({})
                            setIsModalOpen(true)
                        }}
                        className="btn btn-primary mt-4"
                    >
                        Crear Primer Proveedor
                    </button>
                </div>
            )}

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
                            <h2 className="text-2xl font-bold text-slate-900">
                                {editingProveedor?.id ? 'Editar Proveedor' : 'Nuevo Proveedor'}
                            </h2>
                            <button
                                onClick={() => {
                                    setIsModalOpen(false)
                                    setEditingProveedor(null)
                                }}
                                className="p-2 hover:bg-slate-100 rounded-lg"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        RUC <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        maxLength={13}
                                        value={editingProveedor?.ruc || ''}
                                        onChange={e => setEditingProveedor({ ...editingProveedor, ruc: e.target.value })}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500"
                                        placeholder="1234567890001"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        Nombre Empresa <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={editingProveedor?.nombre_empresa || ''}
                                        onChange={e => setEditingProveedor({ ...editingProveedor, nombre_empresa: e.target.value })}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500"
                                        placeholder="Distribuidora XYZ"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Nombre Encargado
                                </label>
                                <input
                                    type="text"
                                    value={editingProveedor?.nombre_encargado || ''}
                                    onChange={e => setEditingProveedor({ ...editingProveedor, nombre_encargado: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500"
                                    placeholder="Juan Pérez"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        Teléfono
                                    </label>
                                    <input
                                        type="text"
                                        value={editingProveedor?.telefono || ''}
                                        onChange={e => setEditingProveedor({ ...editingProveedor, telefono: e.target.value })}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500"
                                        placeholder="0999999999"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">
                                        Email
                                    </label>
                                    <input
                                        type="email"
                                        value={editingProveedor?.correo || ''}
                                        onChange={e => setEditingProveedor({ ...editingProveedor, correo: e.target.value })}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500"
                                        placeholder="contacto@proveedor.com"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Dirección
                                </label>
                                <textarea
                                    value={editingProveedor?.direccion || ''}
                                    onChange={e => setEditingProveedor({ ...editingProveedor, direccion: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500"
                                    rows={3}
                                    placeholder="Av. Principal y Calle Secundaria"
                                />
                            </div>
                        </div>

                        <div className="p-6 border-t border-slate-200 flex gap-3 justify-end sticky bottom-0 bg-white">
                            <button
                                onClick={() => {
                                    setIsModalOpen(false)
                                    setEditingProveedor(null)
                                }}
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
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        Guardando...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-4 h-4" />
                                        Guardar
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
