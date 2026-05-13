import { useState, useEffect } from 'react'
import { inventarioService } from '../services/inventarioService'
import { proveedoresService, type Proveedor } from '../services/proveedoresService'
import { useAuth } from '../contexts/AuthContext'
import {
    Plus,
    FileText,
    Package,
    Trash2,
    Save
} from 'lucide-react'

interface ProductoIngreso {
    producto_id: string
    nombre: string
    cantidad: number
    costo_unitario: number
}

export function InventarioPage() {
    const { empresa, profile } = useAuth()
    const [proveedores, setProveedores] = useState<Proveedor[]>([])
    const [productos, setProductos] = useState<any[]>([])
    const [ingresos, setIngresos] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    // Form state
    const [proveedorId, setProveedorId] = useState('')
    const [numeroFactura, setNumeroFactura] = useState('')
    const [observaciones, setObservaciones] = useState('')
    const [productosIngreso, setProductosIngreso] = useState<ProductoIngreso[]>([])
    const [saving, setSaving] = useState(false)

    const [errorMsg, setErrorMsg] = useState<string | null>(null)

    useEffect(() => {
        if (empresa?.id) {
            loadData()
        }
    }, [empresa?.id])

    async function loadData() {
        setLoading(true)
        setErrorMsg(null)
        try {
            // Load independently to prevent one failure from blocking others
            try {
                const provs = await proveedoresService.getProveedoresByEmpresa(empresa!.id)
                setProveedores(provs)
            } catch (e: any) {
                console.error('Error loading proveedores:', e)
                setErrorMsg(prev => (prev ? prev + '\n' : '') + 'Error Proveedores: ' + e.message)
            }

            try {
                const prods = await inventarioService.getStockByEmpresa(empresa!.id)
                setProductos(prods)
            } catch (e: any) {
                console.error('Error loading productos:', e)
                setErrorMsg(prev => (prev ? prev + '\n' : '') + 'Error Productos: ' + e.message)
            }

            try {
                const ings = await inventarioService.getIngresosByEmpresa(empresa!.id)
                setIngresos(ings)
            } catch (e: any) {
                console.error('Error loading ingresos:', e)
                setErrorMsg(prev => (prev ? prev + '\n' : '') + 'Error Ingresos: ' + e.message)
            }

        } catch (error: any) {
            console.error('Error loading data:', error)
            setErrorMsg('Error general: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    function agregarProducto() {
        setProductosIngreso([...productosIngreso, {
            producto_id: '',
            nombre: '',
            cantidad: 0,
            costo_unitario: 0
        }])
    }

    function actualizarProducto(index: number, field: string, value: any) {
        const nuevos = [...productosIngreso]
        if (field === 'producto_id') {
            const prod = productos.find(p => p.id === value)
            nuevos[index] = {
                ...nuevos[index],
                producto_id: value,
                nombre: prod?.nombre || ''
            }
        } else {
            nuevos[index] = { ...nuevos[index], [field]: value }
        }
        setProductosIngreso(nuevos)
    }

    function eliminarProducto(index: number) {
        setProductosIngreso(productosIngreso.filter((_, i) => i !== index))
    }

    async function handleGuardar() {
        if (!proveedorId || productosIngreso.length === 0) {
            alert('Selecciona un proveedor y agrega al menos un producto')
            return
        }

        const productosValidos = productosIngreso.filter(p => p.producto_id && p.cantidad > 0 && p.costo_unitario > 0)
        if (productosValidos.length === 0) {
            alert('Completa los datos de los productos')
            return
        }

        try {
            setSaving(true)
            await inventarioService.createIngreso(
                {
                    empresa_id: empresa!.id,
                    proveedor_id: proveedorId,
                    numero_factura: numeroFactura,
                    fecha_ingreso: new Date().toISOString().split('T')[0],
                    observaciones,
                    created_by: profile!.id
                },
                productosValidos.map(p => ({
                    producto_id: p.producto_id,
                    cantidad: p.cantidad,
                    costo_unitario: p.costo_unitario
                }))
            )

            alert('Ingreso registrado exitosamente')
            // Limpiar formulario
            setProveedorId('')
            setNumeroFactura('')
            setObservaciones('')
            setProductosIngreso([])
            await loadData()
        } catch (error: any) {
            console.error('Error saving ingreso:', error)
            alert(`Error al guardar: ${error.message}`)
        } finally {
            setSaving(false)
        }
    }

    const total = productosIngreso.reduce((sum, p) => sum + (p.cantidad * p.costo_unitario), 0)

    if (loading) {
        return <div className="flex items-center justify-center h-64">Cargando...</div>
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-slate-900">Ingreso de Inventario</h1>
                <p className="text-slate-600 mt-1">Registra compras a proveedores</p>
                {errorMsg && (
                    <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 whitespace-pre-line">
                        {errorMsg}
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Formulario de Ingreso */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="card p-6">
                        <h2 className="text-xl font-bold text-slate-900 mb-4">Datos de la Compra</h2>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Proveedor <span className="text-red-500">*</span>
                                </label>
                                <select
                                    value={proveedorId}
                                    onChange={e => setProveedorId(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500"
                                >
                                    <option value="">Seleccionar...</option>
                                    {proveedores.map(p => (
                                        <option key={p.id} value={p.id}>{p.nombre_empresa}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Número de Factura
                                </label>
                                <input
                                    type="text"
                                    value={numeroFactura}
                                    onChange={e => setNumeroFactura(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500"
                                    placeholder="001-001-000123"
                                />
                            </div>
                        </div>
                        <div className="mt-4">
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                Observaciones
                            </label>
                            <textarea
                                value={observaciones}
                                onChange={e => setObservaciones(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500"
                                rows={2}
                                placeholder="Notas adicionales..."
                            />
                        </div>
                    </div>

                    <div className="card p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold text-slate-900">Productos</h2>
                            <button onClick={agregarProducto} className="btn btn-primary btn-sm flex items-center gap-2">
                                <Plus className="w-4 h-4" />
                                Agregar Producto
                            </button>
                        </div>

                        <div className="space-y-3">
                            {productosIngreso.map((prod, index) => (
                                <div key={index} className="flex gap-3 items-start p-3 bg-slate-50 rounded-lg">
                                    <select
                                        value={prod.producto_id}
                                        onChange={e => actualizarProducto(index, 'producto_id', e.target.value)}
                                        className="flex-1 px-3 py-2 rounded-lg border border-slate-300"
                                    >
                                        <option value="">Seleccionar producto...</option>
                                        {productos.map(p => (
                                            <option key={p.id} value={p.id}>{p.nombre}</option>
                                        ))}
                                    </select>
                                    <input
                                        type="number"
                                        value={prod.cantidad || ''}
                                        onChange={e => actualizarProducto(index, 'cantidad', parseFloat(e.target.value))}
                                        className="w-24 px-3 py-2 rounded-lg border border-slate-300"
                                        placeholder="Cant."
                                        min="0"
                                        step="0.01"
                                    />
                                    <input
                                        type="number"
                                        value={prod.costo_unitario || ''}
                                        onChange={e => actualizarProducto(index, 'costo_unitario', parseFloat(e.target.value))}
                                        className="w-28 px-3 py-2 rounded-lg border border-slate-300"
                                        placeholder="Costo"
                                        min="0"
                                        step="0.01"
                                    />
                                    <div className="w-28 px-3 py-2 bg-slate-100 rounded-lg text-right font-medium">
                                        ${(prod.cantidad * prod.costo_unitario).toFixed(2)}
                                    </div>
                                    <button
                                        onClick={() => eliminarProducto(index)}
                                        className="p-2 hover:bg-red-100 rounded-lg text-red-600"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        {productosIngreso.length === 0 && (
                            <div className="text-center py-8 text-slate-500">
                                <Package className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                                <p>Agrega productos a este ingreso</p>
                            </div>
                        )}

                        {productosIngreso.length > 0 && (
                            <div className="mt-4 pt-4 border-t border-slate-200 flex justify-between items-center">
                                <span className="text-lg font-bold text-slate-900">TOTAL:</span>
                                <span className="text-2xl font-bold text-primary-600">${total.toFixed(2)}</span>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={handleGuardar}
                        disabled={saving || productosIngreso.length === 0}
                        className="btn btn-primary w-full flex items-center justify-center gap-2"
                    >
                        {saving ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Guardando...
                            </>
                        ) : (
                            <>
                                <Save className="w-5 h-5" />
                                Registrar Ingreso
                            </>
                        )}
                    </button>
                </div>

                {/* Historial */}
                <div className="card p-6">
                    <h2 className="text-xl font-bold text-slate-900 mb-4">Historial de Ingresos</h2>
                    <div className="space-y-3 max-h-[600px] overflow-y-auto">
                        {ingresos.map(ing => (
                            <div key={ing.id} className="p-4 bg-slate-50 rounded-lg">
                                <div className="flex items-start justify-between mb-2">
                                    <div>
                                        <p className="font-medium text-slate-900">{ing.proveedor?.nombre_empresa || 'Sin proveedor'}</p>
                                        <p className="text-sm text-slate-500">{new Date(ing.fecha_ingreso).toLocaleDateString()}</p>
                                    </div>
                                    <FileText className="w-5 h-5 text-slate-400" />
                                </div>
                                {ing.numero_factura && (
                                    <p className="text-sm text-slate-600">Factura: {ing.numero_factura}</p>
                                )}
                                <p className="text-lg font-bold text-primary-600 mt-2">${ing.total.toFixed(2)}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
