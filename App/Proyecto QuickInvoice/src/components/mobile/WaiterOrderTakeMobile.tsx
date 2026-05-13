import { useState, useMemo } from 'react'
import {
    Search,
    Plus,
    Minus,
    Trash2,
    ChevronLeft,
    Utensils,
    CheckCircle2,
    Split,
    CreditCard,
    X
} from 'lucide-react'
import { formatCurrency } from '../../lib/utils'
import type { Producto, Categoria } from '../../services/productoService'
import { cn } from '../../lib/utils'

interface CartItem extends Producto {
    cantidad: number
}

interface WaiterOrderTakeMobileProps {
    mesaNumero: string
    productos: Producto[]
    categorias: Categoria[]
    cart: CartItem[]
    addToCart: (p: Producto) => void
    removeFromCart: (id: string) => void
    updateCantidad: (id: string, delta: number) => void
    onConfirm: () => void
    onBack: () => void
    onSplit?: () => void
    onBill?: () => void
    submitting: boolean
    existingTotal?: number
    existingPedido?: any
    habilitarDivisionCuenta?: boolean
    canBill?: boolean
    hasExistingPedido?: boolean
}

export function WaiterOrderTakeMobile({
    mesaNumero,
    productos,
    categorias,
    cart,
    addToCart,
    removeFromCart,
    updateCantidad,
    onConfirm,
    onBack,
    onSplit,
    onBill,
    submitting,
    existingTotal = 0,
    existingPedido,
    habilitarDivisionCuenta,
    canBill,
    hasExistingPedido
}: WaiterOrderTakeMobileProps) {
    const [activeCategory, setActiveCategory] = useState<string>('all')
    const [searchTerm, setSearchTerm] = useState('')
    const [isCartOpen, setIsCartOpen] = useState(false)

    const filteredProductos = useMemo(() => {
        return productos.filter(p => {
            const matchesCat = activeCategory === 'all' || p.categoria_id === activeCategory
            const matchesSearch = p.nombre.toLowerCase().includes(searchTerm.toLowerCase())
            return matchesCat && matchesSearch
        })
    }, [productos, activeCategory, searchTerm])

    const cartTotal = cart.reduce((sum, item) => sum + (item.precio_venta * item.cantidad), 0)
    const totalItems = cart.reduce((sum, item) => sum + item.cantidad, 0)

    return (
        <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
            {/* 1. Top Bar */}
            <div className="bg-white px-4 py-3 shadow-sm border-b border-slate-200 z-20">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-slate-100">
                        <ChevronLeft className="w-6 h-6 text-slate-700" />
                    </button>
                    <div>
                        <h1 className="text-lg font-black text-slate-900 leading-none">Mesa {mesaNumero}</h1>
                        <p className="text-xs text-slate-500 font-medium">Toma de Pedido</p>
                    </div>
                    {existingTotal > 0 && (
                        <div className="ml-auto bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-1 rounded-full">
                            Orden Activa
                        </div>
                    )}
                </div>

                {/* Search */}
                <div className="mt-3 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Buscar producto..."
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-100 border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-primary-500"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* 2. Category Tabs */}
            <div className="bg-white border-b border-slate-100 px-4 py-2 z-10 shadow-sm">
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                    <button
                        onClick={() => setActiveCategory('all')}
                        className={cn(
                            "px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors",
                            activeCategory === 'all'
                                ? "bg-slate-900 text-white"
                                : "bg-slate-100 text-slate-600"
                        )}
                    >
                        Todo
                    </button>
                    {categorias.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => setActiveCategory(cat.id)}
                            className={cn(
                                "px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors",
                                activeCategory === cat.id
                                    ? "bg-slate-900 text-white"
                                    : "bg-slate-100 text-slate-600"
                            )}
                        >
                            {cat.nombre}
                        </button>
                    ))}
                </div>
            </div>

            {/* 3. Product List */}
            <div className="flex-1 overflow-y-auto p-4 pb-28 space-y-3">
                {filteredProductos.map(p => {
                    const inCart = cart.find(i => i.id === p.id)
                    return (
                        <div
                            key={p.id}
                            className={cn(
                                "bg-white p-3 rounded-2xl shadow-sm border border-slate-100 flex gap-4 transition-all active:scale-[0.98]",
                                inCart ? "ring-1 ring-primary-500 border-primary-100" : ""
                            )}
                        >
                            <div className="w-20 h-20 bg-slate-100 rounded-xl flex-shrink-0 overflow-hidden">
                                {p.imagen_url ? (
                                    <img src={p.imagen_url} alt={p.nombre} className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                                        <Utensils className="w-8 h-8" />
                                    </div>
                                )}
                            </div>
                            <div className="flex-1 flex flex-col justify-between">
                                <div>
                                    <h3 className="font-bold text-slate-900 leading-tight">{p.nombre}</h3>
                                    <p className="text-primary-600 font-bold mt-1">{formatCurrency(p.precio_venta)}</p>
                                </div>
                                <div className="flex items-center justify-end">
                                    {inCart ? (
                                        <div className="flex items-center gap-3 bg-primary-50 rounded-lg px-2 py-1">
                                            <button onClick={() => updateCantidad(p.id, -1)} className="p-1 bg-white rounded-md shadow-sm">
                                                <Minus className="w-4 h-4 text-primary-700" />
                                            </button>
                                            <span className="font-bold text-primary-900 min-w-[1.5rem] text-center">{inCart.cantidad}</span>
                                            <button onClick={() => updateCantidad(p.id, 1)} className="p-1 bg-white rounded-md shadow-sm">
                                                <Plus className="w-4 h-4 text-primary-700" />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => addToCart(p)}
                                            className="bg-slate-900 text-white p-2 rounded-xl shadow-lg shadow-slate-200"
                                        >
                                            <Plus className="w-5 h-5" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* 4. Sticky Cart Footer */}
            {(totalItems > 0 || hasExistingPedido) && (
                <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.1)] z-30">
                    <button
                        onClick={() => setIsCartOpen(true)}
                        className={cn(
                            "w-full rounded-2xl p-4 flex items-center justify-between shadow-lg active:scale-[0.98] transition-all",
                            totalItems > 0 ? "bg-primary-600 shadow-primary-200 text-white" : "bg-slate-800 shadow-slate-200 text-white"
                        )}
                    >
                        <div className="flex items-center gap-3">
                            <div className={cn(
                                "bg-opacity-30 px-3 py-1 rounded-lg font-bold text-sm",
                                totalItems > 0 ? "bg-primary-800" : "bg-slate-600"
                            )}>
                                {totalItems > 0 ? `${totalItems} ítems` : 'Ver Cuenta'}
                            </div>
                            <span className="font-medium text-primary-100">
                                {totalItems > 0 ? 'Ver pedido' : 'Pedido de la mesa'}
                            </span>
                        </div>
                        <div className="font-black text-lg">
                            {formatCurrency(cartTotal + existingTotal)}
                        </div>
                    </button>
                </div>
            )}

            {/* 5. Cart Modal/Drawer */}
            {isCartOpen && (
                <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/50 backdrop-blur-sm">
                    <div className="flex-1" onClick={() => setIsCartOpen(false)} />
                    <div className="bg-white rounded-t-3xl shadow-2xl p-6 pb-8 max-h-[85vh] flex flex-col animate-[slideUp_0.3s_ease-out]">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-xl font-black text-slate-900">Resumen del Pedido</h2>
                            <button onClick={() => setIsCartOpen(false)} className="p-2 bg-slate-100 rounded-full">
                                <X className="w-5 h-5 text-slate-500" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto space-y-4 mb-6 pr-2">
                            {/* New items in cart */}
                            {cart.length > 0 && (
                                <div className="space-y-4">
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Nuevos items</h3>
                                    {cart.map(item => (
                                        <div key={item.id} className="flex justify-between items-start border-b border-slate-50 pb-4">
                                            <div className="flex gap-3">
                                                <div className="bg-primary-50 p-2 rounded-lg h-12 w-12 flex items-center justify-center">
                                                    <span className="font-bold text-primary-600 text-sm">x{item.cantidad}</span>
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-slate-900 leading-tight">{item.nombre}</h4>
                                                    <p className="text-sm text-slate-500 font-medium">{formatCurrency(item.precio_venta * item.cantidad)}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="flex items-center bg-slate-100 rounded-lg p-1">
                                                    <button onClick={() => updateCantidad(item.id, -1)} className="p-1 hover:bg-white rounded transition-colors">
                                                        <Minus className="w-3 h-3 text-slate-500" />
                                                    </button>
                                                    <button onClick={() => updateCantidad(item.id, 1)} className="p-1 hover:bg-white rounded transition-colors">
                                                        <Plus className="w-3 h-3 text-slate-500" />
                                                    </button>
                                                </div>
                                                <button onClick={() => removeFromCart(item.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Existing items from previous commands */}
                            {existingPedido?.pedido_detalles && existingPedido.pedido_detalles.length > 0 && (
                                <div className="space-y-4 mt-6">
                                    <h3 className="text-xs font-bold text-amber-600 uppercase tracking-wider">Ya ordenado</h3>
                                    <div className="bg-amber-50 rounded-2xl p-4 space-y-3">
                                        {existingPedido.pedido_detalles.map((detalle: any) => (
                                            <div key={detalle.id} className="flex justify-between items-center text-sm">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-amber-700">x{detalle.cantidad}</span>
                                                    <span className="text-amber-900 font-medium">{detalle.productos?.nombre}</span>
                                                </div>
                                                <span className="text-amber-700 font-bold">{formatCurrency(detalle.subtotal)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {cart.length === 0 && !hasExistingPedido && (
                                <div className="text-center py-12">
                                    <Utensils className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                                    <p className="text-slate-400 font-medium">No hay productos seleccionados</p>
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div className="flex justify-between text-lg font-bold text-slate-600">
                                <span>Subtotal</span>
                                <span>{formatCurrency(cartTotal)}</span>
                            </div>
                            {existingTotal > 0 && (
                                <div className="flex justify-between text-sm text-amber-600 font-bold bg-amber-50 p-2 rounded-lg">
                                    <span>Previamente ordenado</span>
                                    <span>{formatCurrency(existingTotal)}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-2xl font-black text-slate-900 pt-4 border-t border-slate-100">
                                <span>Total</span>
                                <span>{formatCurrency(cartTotal + existingTotal)}</span>
                            </div>

                            <div className="flex flex-col gap-3 pt-2">
                                <div className="grid grid-cols-2 gap-3">
                                    {habilitarDivisionCuenta && hasExistingPedido && (
                                        <button
                                            onClick={onSplit}
                                            className="flex items-center justify-center gap-2 py-3 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 transition-colors"
                                        >
                                            <Split className="w-4 h-4" />
                                            Dividir
                                        </button>
                                    )}
                                    {canBill && (hasExistingPedido || cart.length > 0) && (
                                        <button
                                            onClick={onBill}
                                            disabled={submitting}
                                            className="flex items-center justify-center gap-2 py-3 bg-amber-100 text-amber-700 rounded-xl font-bold text-sm hover:bg-amber-200 transition-colors"
                                        >
                                            <CreditCard className="w-4 h-4" />
                                            Facturar
                                        </button>
                                    )}
                                </div>
                                <button
                                    disabled={submitting}
                                    onClick={onConfirm}
                                    className="w-full bg-primary-600 text-white py-4 rounded-2xl font-bold text-lg shadow-xl shadow-primary-200 flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                                >
                                    {submitting ? 'Enviando...' : (
                                        <>
                                            Confirmar Pedido <CheckCircle2 className="w-6 h-6" />
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
