import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { productoService } from '../services/productoService'
import type { Producto, Categoria } from '../services/productoService'
import { formatCurrency } from '../lib/utils'
import {
    Search,
    ShoppingCart,
    Trash2,
    Minus,
    Plus,
    ChevronLeft,
    Utensils,
    Loader2,
    CreditCard,
    Split
} from 'lucide-react'
import { pedidoService } from '../services/pedidoService'
import { mesaService } from '../services/mesaService'
import { useAuth } from '../contexts/AuthContext'
import { WaiterOrderTakeMobile } from '../components/mobile/WaiterOrderTakeMobile'
import { SplitCheckModal } from '../components/SplitCheckModal'

import { BillingModal } from '../components/BillingModal'

interface CartItem extends Producto {
    cantidad: number
}

export function OrderTake() {
    const { mesaId } = useParams()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const urlPedidoId = searchParams.get('pedidoId')
    const [productos, setProductos] = useState<Producto[]>([])
    const [categorias, setCategorias] = useState<Categoria[]>([])
    const [mesa, setMesa] = useState<any>(null)
    const [selectedCategoria, setSelectedCategoria] = useState<string | null>(null)
    const [search, setSearch] = useState('')
    const [cart, setCart] = useState<CartItem[]>([])
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [existingPedido, setExistingPedido] = useState<any>(null)
    const [isBillingModalOpen, setIsBillingModalOpen] = useState(false)
    const [isSplitModalOpen, setIsSplitModalOpen] = useState(false)
    const { user, empresa, profile } = useAuth()

    useEffect(() => {
        if (mesaId) {
            loadData()
        }
    }, [mesaId])

    async function loadData() {
        try {
            const [prodData, catData, mesaData, pedidoActivo] = await Promise.all([
                productoService.getProductos(),
                productoService.getCategorias(),
                mesaService.getMesaById(mesaId!),
                urlPedidoId
                    ? pedidoService.getPedidoById(urlPedidoId)
                    : pedidoService.getPedidoActivoPorMesa(mesaId!)
            ])
            setProductos(prodData)
            setCategorias(catData)
            setMesa(mesaData)
            setExistingPedido(pedidoActivo)
        } catch (error) {
            console.error('Error loading order data:', error)
        } finally {
            setLoading(false)
        }
    }

    const addToCart = (producto: Producto) => {
        setCart(prev => {
            const existing = prev.find(item => item.id === producto.id)
            if (existing) {
                return prev.map(item =>
                    item.id === producto.id ? { ...item, cantidad: item.cantidad + 1 } : item
                )
            }
            return [...prev, { ...producto, cantidad: 1 }]
        })
    }

    const updateCantidad = (id: string, delta: number) => {
        setCart(prev => prev.map(item => {
            if (item.id === id) {
                const newCant = Math.max(1, item.cantidad + delta)
                return { ...item, cantidad: newCant }
            }
            return item
        }))
    }

    const removeFromCart = (id: string) => {
        setCart(prev => prev.filter(item => item.id !== id))
    }

    const subtotal = cart.reduce((sum, item) => sum + (item.precio_venta * item.cantidad), 0)
    const total = subtotal

    const handleDirectBilling = async () => {
        if (profile?.rol === 'mesero') {
            alert('Solo puede facturar la caja')
            return
        }

        if (!confirm('¿Está seguro de Facturar directamente? El pedido se creará y se cobrará en este momento.')) return

        const actualUser = user || (profile ? { id: profile.id } : null)
        const actualEmpresa = empresa || (profile ? { id: profile.empresa_id } : null)

        if (!mesaId || !actualUser?.id || !actualEmpresa?.id) {
            alert('Faltan datos (Usuario o Empresa no cargados). Por favor, refresque la página.')
            return
        }

        try {
            setSubmitting(true)
            let pedidoToInvoice = existingPedido

            if (!pedidoToInvoice) {
                pedidoToInvoice = await pedidoService.crearPedido(
                    mesaId,
                    actualUser.id,
                    actualEmpresa.id,
                    cart,
                    total
                )
            } else {
                if (cart.length > 0) {
                    await pedidoService.agregarItemsAPedido(
                        existingPedido.id,
                        cart,
                        (existingPedido.total || 0) + total
                    )
                    pedidoToInvoice = await pedidoService.getPedidoById(existingPedido.id)
                }
            }

            setExistingPedido(pedidoToInvoice)
            setIsBillingModalOpen(true)
        } catch (error: any) {
            console.error('Error preparing direct billing:', error)
            alert(`Error: ${error.message}`)
        } finally {
            setSubmitting(false)
        }
    }

    const handleConfirmarPedido = async () => {
        const actualUser = user || (profile ? { id: profile.id } : null)
        const actualEmpresa = empresa || (profile ? { id: profile.empresa_id } : null)

        if (!mesaId || !actualUser?.id || !actualEmpresa?.id) {
            alert('Faltan datos (Usuario o Empresa no cargados). Por favor, intenta recargar la página.')
            return
        }

        try {
            setSubmitting(true)
            let confirmedPedidoId = ''
            if (existingPedido) {
                if (cart.length > 0) {
                    await pedidoService.agregarItemsAPedido(
                        existingPedido.id,
                        cart,
                        (existingPedido.total || 0) + total
                    )
                    confirmedPedidoId = existingPedido.id
                    alert('¡Items agregados al pedido con éxito!')
                } else {
                    console.log('No hay items nuevos para agregar. Volviendo a mesas...')
                }
            } else {
                const newPedido = await pedidoService.crearPedido(
                    mesaId,
                    actualUser.id,
                    actualEmpresa.id,
                    cart,
                    total
                )
                confirmedPedidoId = newPedido.id
                alert('¡Pedido confirmado con éxito!')
            }

            if (confirmedPedidoId) {
                // Actualizar estado a En Preparación (Task 7)
                await pedidoService.actualizarEstado(confirmedPedidoId, 'en_preparacion')
                window.open(`/pedido/${confirmedPedidoId}/kitchen?auto=true`, '_blank')
            }

            navigate('/mesas')
        } catch (error: any) {
            console.error('Error confirming pedido (Full Details):', error)
            const errorMsg = error?.message || (typeof error === 'string' ? error : JSON.stringify(error))
            alert(`Error inesperado al confirmar: ${errorMsg}`)
        } finally {
            setSubmitting(false)
        }
    }

    const filteredProductos = productos.filter(p => {
        const matchesCat = !selectedCategoria || p.categoria_id === selectedCategoria
        const matchesSearch = p.nombre.toLowerCase().includes(search.toLowerCase())
        return matchesCat && matchesSearch
    })

    if (loading && !existingPedido) {
        return (
            <div className="flex items-center justify-center p-24">
                <Loader2 className="w-12 h-12 animate-spin text-primary-600" />
            </div>
        )
    }

    const isMesero = (profile?.rol as string) === 'mesero'

    return (
        <>
            {isMesero ? (
                <WaiterOrderTakeMobile
                    mesaNumero={mesa?.numero || '...'}
                    productos={productos}
                    categorias={categorias}
                    cart={cart}
                    addToCart={addToCart}
                    removeFromCart={removeFromCart}
                    updateCantidad={updateCantidad}
                    onConfirm={handleConfirmarPedido}
                    onBack={() => navigate('/mesas')}
                    onSplit={() => setIsSplitModalOpen(true)}
                    onBill={handleDirectBilling}
                    submitting={submitting}
                    existingTotal={existingPedido?.total}
                    existingPedido={existingPedido}
                    habilitarDivisionCuenta={empresa?.habilitar_division_cuenta}
                    canBill={false}
                    hasExistingPedido={!!existingPedido}
                />
            ) : (
                <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-12rem)] min-h-[600px] pb-4">
                    {/* Left: Product Selection */}
                    <div className="flex-1 flex flex-col min-h-0 bg-white rounded-xl shadow-sm border border-slate-100 p-4">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => navigate('/mesas')}
                                    className="p-2 hover:bg-slate-200 rounded-lg text-slate-600"
                                >
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                                <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                                    <Utensils className="w-6 h-6 text-primary-600" />
                                    Mesa {mesa?.numero || '...'}
                                    {existingPedido && (
                                        <span className="ml-4 px-3 py-1 bg-amber-100 text-amber-700 text-sm rounded-full flex items-center gap-2">
                                            <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                                            Agregando a pedido activo
                                        </span>
                                    )}
                                </h1>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4 mb-6">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar producto..."
                                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>
                            <select
                                className="px-4 py-2 rounded-lg border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-primary-500"
                                value={selectedCategoria || ''}
                                onChange={(e) => setSelectedCategoria(e.target.value || null)}
                            >
                                <option value="">Todas las categorías</option>
                                {categorias.map(cat => (
                                    <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-2 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 pb-4">
                            {filteredProductos.map(producto => (
                                <button
                                    key={producto.id}
                                    onClick={() => addToCart(producto)}
                                    className="card p-4 hover:border-primary-500 hover:ring-1 hover:ring-primary-500 transition-all text-left group"
                                >
                                    <div className="aspect-square bg-slate-100 rounded-lg mb-3 overflow-hidden">
                                        {producto.imagen_url ? (
                                            <img src={producto.imagen_url} alt={producto.nombre} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-slate-300">
                                                <Utensils className="w-8 h-8" />
                                            </div>
                                        )}
                                    </div>
                                    <h3 className="font-bold text-slate-900 text-sm line-clamp-2">{producto.nombre}</h3>
                                    <p className="text-primary-600 font-bold mt-1">{formatCurrency(producto.precio_venta)}</p>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Right: Cart/Order */}
                    <div className="w-full lg:w-96 flex flex-col h-full">
                        <div className="card flex-1 flex flex-col min-h-0 bg-white shadow-xl border-primary-100">
                            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-primary-50 bg-opacity-30">
                                <h2 className="font-bold text-slate-900 flex items-center gap-2">
                                    <ShoppingCart className="w-5 h-5 text-primary-600" />
                                    Pedido Actual
                                </h2>
                                <span className="px-2 py-1 bg-primary-100 text-primary-700 rounded text-xs font-bold">
                                    {cart.length} nuevos
                                </span>
                            </div>

                            {/* Check if Split Check is Enabled */}
                            {empresa?.habilitar_division_cuenta && existingPedido && (
                                <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex justify-end">
                                    <button
                                        onClick={() => setIsSplitModalOpen(true)}
                                        className="text-xs font-bold text-primary-600 flex items-center gap-1 hover:bg-primary-50 px-2 py-1 rounded transition-colors"
                                    >
                                        <Split className="w-4 h-4" />
                                        Dividir Cuenta
                                    </button>
                                </div>
                            )}

                            {existingPedido && (
                                <div className="bg-amber-50 p-4 border-b border-amber-100 flex flex-col max-h-48">
                                    <p className="text-xs font-bold text-amber-700 mb-2 uppercase tracking-widest flex-shrink-0">Ya ordenado:</p>
                                    <div className="space-y-3 overflow-y-auto pr-2">
                                        {(existingPedido.pedido_detalles || []).map((detalle: any) => (
                                            <div key={detalle.id} className="flex justify-between items-center text-sm text-amber-900">
                                                <span>{detalle.productos?.nombre} x{detalle.cantidad}</span>
                                                <span>{formatCurrency(detalle.subtotal)}</span>
                                            </div>
                                        ))}
                                        <div className="pt-1 mt-1 border-t border-amber-200 flex justify-between font-bold text-amber-900">
                                            <span>Subtotal actual:</span>
                                            <span>{formatCurrency(existingPedido.total)}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {cart.map(item => (
                                    <div key={item.id} className="flex gap-3 group">
                                        <div className="flex-1">
                                            <h4 className="text-sm font-bold text-slate-900 leading-tight">{item.nombre}</h4>
                                            <p className="text-xs text-slate-500 mt-0.5">{formatCurrency(item.precio_venta)}</p>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            <div className="flex items-center bg-slate-100 rounded-lg p-1">
                                                <button
                                                    onClick={() => updateCantidad(item.id, -1)}
                                                    className="p-1 hover:bg-white rounded shadow-sm text-slate-600"
                                                >
                                                    <Minus className="w-3 h-3" />
                                                </button>
                                                <span className="w-8 text-center text-sm font-bold">{item.cantidad}</span>
                                                <button
                                                    onClick={() => updateCantidad(item.id, 1)}
                                                    className="p-1 hover:bg-white rounded shadow-sm text-slate-600"
                                                >
                                                    <Plus className="w-3 h-3" />
                                                </button>
                                            </div>
                                            <button
                                                onClick={() => removeFromCart(item.id)}
                                                className="text-slate-400 hover:text-red-500 transition-colors"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {cart.length === 0 && (
                                    <div className="text-center py-12">
                                        <ShoppingCart className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                                        <p className="text-slate-400 text-sm">El pedido está vacío</p>
                                    </div>
                                )}
                            </div>

                            <div className="p-6 border-t border-slate-100 bg-slate-50 space-y-4">
                                <div className="space-y-2">
                                    <div className="flex justify-between text-slate-600">
                                        <span>{existingPedido ? 'Total Adicional' : 'Subtotal'}</span>
                                        <span>{formatCurrency(subtotal)}</span>
                                    </div>
                                    <div className="flex justify-between text-lg font-black text-slate-900 pt-2 border-t border-slate-200">
                                        <span>{existingPedido ? 'Total Final' : 'Total'}</span>
                                        <span>{formatCurrency(existingPedido ? (existingPedido.total + total) : total)}</span>
                                    </div>
                                </div>

                                {!isMesero && (
                                    <button
                                        disabled={(cart.length === 0 && !existingPedido) || submitting}
                                        onClick={handleDirectBilling}
                                        className="btn bg-amber-600 hover:bg-amber-700 text-white w-full py-3 rounded-xl font-bold mb-4 flex items-center justify-center gap-2 shadow-lg shadow-amber-200"
                                    >
                                        <CreditCard className="w-5 h-5" />
                                        Ir a Facturar Directo
                                    </button>
                                )}
                                <button
                                    disabled={(cart.length === 0 && !existingPedido) || submitting}
                                    onClick={handleConfirmarPedido}
                                    className={`btn w-full py-4 text-lg shadow-lg flex items-center justify-center gap-2 ${cart.length === 0 && !existingPedido
                                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                                        : 'btn-primary shadow-primary-200'
                                        }`}
                                >
                                    {submitting ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        cart.length === 0 && existingPedido ? 'Volver a Mesas' : 'Confirmar Pedido'
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isBillingModalOpen && existingPedido && (
                <BillingModal
                    isOpen={isBillingModalOpen}
                    onClose={() => setIsBillingModalOpen(false)}
                    pedido={existingPedido}
                    onSuccess={() => {
                        alert('¡Venta y Factura generadas correctamente!')
                        setIsBillingModalOpen(false)
                        navigate('/mesas')
                    }}
                />
            )}

            <SplitCheckModal
                isOpen={isSplitModalOpen}
                onClose={() => setIsSplitModalOpen(false)}
                pedido={existingPedido}
                onSuccess={() => {
                    alert('Cuenta dividida con éxito. Se han creado nuevos pedidos.');
                    navigate('/mesas');
                }}
            />
        </>
    )
}
