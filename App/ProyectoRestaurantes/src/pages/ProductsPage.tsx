import { useState, useEffect } from 'react'
import { productoService } from '../services/productoService'
import type { Producto, Categoria } from '../services/productoService'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency } from '../lib/utils'
import {
    Plus,
    Search,
    Edit2,
    Trash2,
    Package,
    X,
    Save
} from 'lucide-react'

export function ProductsPage() {
    const { empresa } = useAuth()
    const [productos, setProductos] = useState<any[]>([])
    const [categorias, setCategorias] = useState<Categoria[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [selectedCategoria, setSelectedCategoria] = useState<string>('')
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingProduct, setEditingProduct] = useState<Partial<Producto> | null>(null)

    useEffect(() => {
        if (empresa?.id) {
            loadData()
        }
    }, [empresa?.id])

    async function loadData() {
        try {
            setLoading(true)
            const [prodData, catData] = await Promise.all([
                productoService.getProductos(),
                productoService.getCategorias()
            ])
            setProductos(prodData)
            setCategorias(catData)
        } catch (error) {
            console.error('Error loading products:', error)
        } finally {
            setLoading(false)
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!empresa?.id || !editingProduct) return

        try {
            if (editingProduct.id) {
                const cleanProduct = { ...editingProduct } as any
                delete cleanProduct.categorias
                await productoService.updateProducto(editingProduct.id, cleanProduct)
            } else {
                await productoService.createProducto({
                    ...editingProduct,
                    empresa_id: empresa.id,
                    activo: true
                } as any)
            }
            setIsModalOpen(false)
            setEditingProduct(null)
            loadData()
        } catch (error) {
            console.error('Error saving product:', error)
            alert('Error al guardar el producto')
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('¿Estás seguro de eliminar este producto?')) return
        try {
            await productoService.deleteProducto(id)
            loadData()
        } catch (error) {
            console.error('Error deleting product:', error)
            alert('Error al eliminar el producto')
        }
    }

    const filtered = productos.filter(p => {
        const matchesSearch = p.nombre.toLowerCase().includes(search.toLowerCase())
        const matchesCat = !selectedCategoria || p.categoria_id === selectedCategoria
        return matchesSearch && matchesCat
    })

    if (loading) return <div className="p-12 text-center">Cargando productos...</div>

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Maestro de Productos</h1>
                    <p className="text-slate-500">Gestiona el menú y catálogo de tu restaurante</p>
                </div>
                <button
                    onClick={() => {
                        setEditingProduct({
                            nombre: '',
                            precio_venta: 0,
                            iva_porcentaje: 15,
                            categoria_id: categorias[0]?.id,
                            maneja_stock: true
                        })
                        setIsModalOpen(true)
                    }}
                    className="btn btn-primary flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    Nuevo Producto
                </button>
            </div>

            <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre..."
                        className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <select
                    className="px-4 py-2 rounded-lg border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-primary-500"
                    value={selectedCategoria}
                    onChange={(e) => setSelectedCategoria(e.target.value)}
                >
                    <option value="">Todas las categorías</option>
                    {categorias.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                    ))}
                </select>
            </div>

            <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                                <th className="px-6 py-4 font-medium">Producto</th>
                                <th className="px-6 py-4 font-medium">Categoría</th>
                                <th className="px-6 py-4 font-medium text-right">Precio</th>
                                <th className="px-6 py-4 font-medium text-center">IVA</th>
                                <th className="px-6 py-4 font-medium text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filtered.map(producto => (
                                <tr key={producto.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400">
                                                {producto.imagen_url ? (
                                                    <img src={producto.imagen_url} alt={producto.nombre} className="w-full h-full object-cover rounded-lg" />
                                                ) : (
                                                    <Package className="w-5 h-5" />
                                                )}
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-900">{producto.nombre}</p>
                                                <p className="text-xs text-slate-400 line-clamp-1">{producto.descripcion || 'Sin descripción'}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="px-2 py-1 bg-primary-50 text-primary-700 rounded text-xs font-bold">
                                            {producto.categorias?.nombre || 'General'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right font-bold text-slate-900">
                                        {formatCurrency(producto.precio_venta)}
                                    </td>
                                    <td className="px-6 py-4 text-center text-sm text-slate-500">
                                        {producto.iva_porcentaje}%
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => {
                                                    setEditingProduct(producto)
                                                    setIsModalOpen(true)
                                                }}
                                                className="p-2 hover:bg-white border border-transparent hover:border-slate-200 rounded-lg text-slate-400 hover:text-primary-600 transition-all"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(producto.id)}
                                                className="p-2 hover:bg-white border border-transparent hover:border-red-100 rounded-lg text-slate-400 hover:text-red-600 transition-all"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                                        No se encontraron productos.
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
                                {editingProduct?.id ? 'Editar Producto' : 'Nuevo Producto'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Nombre</label>
                                <input
                                    required
                                    type="text"
                                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none"
                                    value={editingProduct?.nombre || ''}
                                    onChange={(e) => setEditingProduct({ ...editingProduct, nombre: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Precio Venta</label>
                                    <input
                                        required
                                        type="number"
                                        step="0.01"
                                        className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none"
                                        value={editingProduct?.precio_venta || 0}
                                        onChange={(e) => setEditingProduct({ ...editingProduct, precio_venta: parseFloat(e.target.value) })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">IVA (%)</label>
                                    <select
                                        className="w-full px-4 py-2 rounded-lg border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-primary-500"
                                        value={editingProduct?.iva_porcentaje || 15}
                                        onChange={(e) => setEditingProduct({ ...editingProduct, iva_porcentaje: parseInt(e.target.value) })}
                                    >
                                        <option value={0}>0%</option>
                                        <option value={5}>5%</option>
                                        <option value={5}>5%</option>
                                        <option value={8}>8%</option>
                                        <option value={15}>15% (Actual)</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="maneja_stock"
                                    className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                                    checked={editingProduct?.maneja_stock ?? true}
                                    onChange={(e) => setEditingProduct({ ...editingProduct, maneja_stock: e.target.checked })}
                                />
                                <label htmlFor="maneja_stock" className="text-sm font-medium text-slate-700 select-none">
                                    Controlar Stock (Kardex)
                                </label>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Categoría</label>
                                <select
                                    required
                                    className="w-full px-4 py-2 rounded-lg border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-primary-500"
                                    value={editingProduct?.categoria_id || ''}
                                    onChange={(e) => setEditingProduct({ ...editingProduct, categoria_id: e.target.value })}
                                >
                                    <option value="" disabled>Seleccionar...</option>
                                    {categorias.map(cat => (
                                        <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Descripción</label>
                                <textarea
                                    className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none resize-none h-20"
                                    value={editingProduct?.descripcion || ''}
                                    onChange={(e) => setEditingProduct({ ...editingProduct, descripcion: e.target.value })}
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
