import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { pedidoService } from '../services/pedidoService'
import { formatCurrency, cn } from '../lib/utils'
import {
    Clock,
    CheckCircle2,
    ChefHat,
    ChevronDown,
    ChevronUp,
    CreditCard,
    Printer,
    RefreshCw
} from 'lucide-react'
import { BillingModal } from '../components/BillingModal'

export function OrdersPage() {
    const { empresa, profile } = useAuth()
    const [pedidos, setPedidos] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [expandedPedido, setExpandedPedido] = useState<string | null>(null)
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false)
    const [selectedPedido, setSelectedPedido] = useState<any>(null)
    const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0])

    useEffect(() => {
        if (!empresa?.id) return
        loadPedidos()

        const subscription = supabase
            .channel('pedidos-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => {
                loadPedidos()
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_detalles' }, () => {
                loadPedidos()
            })
            .subscribe()

        return () => {
            subscription.unsubscribe()
        }
    }, [empresa?.id, filterDate])

    async function loadPedidos() {
        try {
            setLoading(true)
            const data = await pedidoService.getPedidosGestion(empresa!.id, filterDate)
            setPedidos(data)
        } catch (err: any) {
            console.error(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleUpdateStatus = async (pedidoId: string, newStatus: string) => {
        try {
            await pedidoService.actualizarEstado(pedidoId, newStatus)
            loadPedidos()
        } catch (err: any) {
            alert(`Error al actualizar estado: ${err.message}`)
        }
    }

    const handleOpenInvoiceModal = (pedido: any) => {
        setSelectedPedido(pedido)
        setIsInvoiceModalOpen(true)
    }

    const getStatusStyles = (estado: string) => {
        switch (estado) {
            case 'pendiente': return 'bg-slate-100 text-slate-700 border-slate-200'
            case 'en_preparacion': return 'bg-amber-100 text-amber-700 border-amber-200'
            case 'servido': return 'bg-emerald-100 text-emerald-700 border-emerald-200'
            case 'facturado': return 'bg-blue-100 text-blue-700 border-blue-200'
            default: return 'bg-slate-100 text-slate-700'
        }
    }

    const getStatusIcon = (estado: string) => {
        switch (estado) {
            case 'pendiente': return <Clock className="w-4 h-4" />
            case 'en_preparacion': return <ChefHat className="w-4 h-4" />
            case 'servido': return <CheckCircle2 className="w-4 h-4" />
            case 'facturado': return <CreditCard className="w-4 h-4" />
            default: return null
        }
    }

    const handleRevertSplit = async (pedidoId: string) => {
        if (!confirm('¿Estás seguro de deshacer la división de esta mesa? Se volverán a unificar todos los pedidos divididos en uno solo.')) return

        try {
            setLoading(true)
            await pedidoService.revertirDivision(pedidoId)
            alert('¡División revertida correctamente! La mesa se ha unificado.')
            loadPedidos()
        } catch (err: any) {
            console.error(err)
            alert(`Error al revertir división: ${err.message}`)
            setLoading(false)
        }
    }

    if (loading) return <div className="p-8 text-center"><RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary-600" /></div>

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-slate-900">Gestión de Pedidos</h1>
                <div className="flex gap-4">
                    <input
                        type="date"
                        value={filterDate}
                        onChange={(e) => setFilterDate(e.target.value)}
                        className="px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none"
                    />
                    <button onClick={loadPedidos} className="btn btn-secondary flex items-center gap-2">
                        <RefreshCw className="w-4 h-4" />
                        Actualizar
                    </button>
                </div>
            </div>

            <div className="space-y-4">
                {pedidos.length === 0 ? (
                    <div className="card p-12 text-center text-slate-500">No hay pedidos para esta fecha</div>
                ) : (
                    pedidos.map(pedido => (
                        <div key={pedido.id} className="card overflow-hidden transition-all hover:shadow-md border-slate-200">
                            <div className="p-4 flex flex-wrap items-center justify-between gap-4 bg-white">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center font-bold text-slate-400 border border-slate-100">
                                        #{pedido.id.slice(0, 4)}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-900">
                                            Mesa {pedido.mesas?.numero}
                                            {pedido.nombre_cliente_mesa && (
                                                <span className="ml-2 font-normal text-slate-500 text-sm">({pedido.nombre_cliente_mesa})</span>
                                            )}
                                            {pedido.es_division && (
                                                <span className="ml-2 px-2 py-0.5 bg-purple-50 text-purple-600 text-[10px] font-bold uppercase rounded border border-purple-100">Dividido</span>
                                            )}
                                        </h3>
                                        <p className="text-xs text-slate-500 flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {new Date(pedido.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <span className={cn(
                                        "px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 uppercase tracking-wider",
                                        getStatusStyles(pedido.estado)
                                    )}>
                                        {getStatusIcon(pedido.estado)}
                                        {pedido.estado.replace('_', ' ')}
                                    </span>
                                    <span className="text-lg font-black text-slate-900">{formatCurrency(pedido.total)}</span>
                                </div>

                                <div className="flex items-center gap-2">
                                    {pedido.es_division && pedido.estado !== 'facturado' && (
                                        <button
                                            onClick={() => handleRevertSplit(pedido.id)}
                                            className="p-2 text-purple-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors mr-2"
                                            title="Deshacer División (Unificar)"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                            </svg>
                                        </button>
                                    )}

                                    {pedido.estado === 'pendiente' && (
                                        <button
                                            onClick={() => handleUpdateStatus(pedido.id, 'en_preparacion')}
                                            className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700 transition-colors"
                                        >
                                            Preparar
                                        </button>
                                    )}
                                    {pedido.estado === 'en_preparacion' && (
                                        <button
                                            onClick={() => handleUpdateStatus(pedido.id, 'servido')}
                                            className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold hover:bg-emerald-700 transition-colors"
                                        >
                                            Servir
                                        </button>
                                    )}
                                    {pedido.estado === 'servido' && (
                                        <button
                                            onClick={() => {
                                                if (profile?.rol === 'mesero') {
                                                    alert('Solo puede facturar la caja')
                                                } else {
                                                    handleOpenInvoiceModal(pedido)
                                                }
                                            }}
                                            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors flex items-center gap-2"
                                        >
                                            <CreditCard className="w-4 h-4" />
                                            Facturar
                                        </button>
                                    )}
                                    {pedido.estado === 'facturado' && (
                                        <button className="p-2 text-slate-400 hover:text-primary-600 transition-colors" title="Reimprimir">
                                            <Printer className="w-5 h-5" />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setExpandedPedido(expandedPedido === pedido.id ? null : pedido.id)}
                                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"
                                    >
                                        {expandedPedido === pedido.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                    </button>
                                </div>
                            </div>

                            {expandedPedido === pedido.id && (
                                <div className="p-4 bg-slate-50 border-t border-slate-100 animate-in slide-in-from-top-2 duration-200">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-slate-400 text-left">
                                                <th className="pb-2 font-black uppercase text-[10px] tracking-widest">Producto</th>
                                                <th className="pb-2 font-black uppercase text-[10px] tracking-widest text-center">Cant.</th>
                                                <th className="pb-2 font-black uppercase text-[10px] tracking-widest text-right">Precio</th>
                                                <th className="pb-2 font-black uppercase text-[10px] tracking-widest text-right">Subtotal</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200">
                                            {pedido.pedido_detalles?.map((detalle: any) => (
                                                <tr key={detalle.id}>
                                                    <td className="py-2 font-bold text-slate-700">{detalle.productos?.nombre}</td>
                                                    <td className="py-2 text-center font-mono">{detalle.cantidad}</td>
                                                    <td className="py-2 text-right text-slate-500 font-mono">{formatCurrency(detalle.precio_unitario)}</td>
                                                    <td className="py-2 text-right font-bold text-slate-900 font-mono">{formatCurrency(detalle.subtotal)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot>
                                            <tr className="border-t border-slate-200">
                                                <td colSpan={3} className="pt-3 font-bold text-slate-900 text-right">TOTAL FINAL</td>
                                                <td className="pt-3 text-right text-lg font-black text-primary-600 font-mono">{formatCurrency(pedido.total)}</td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {isInvoiceModalOpen && selectedPedido && (
                <BillingModal
                    isOpen={isInvoiceModalOpen}
                    onClose={() => setIsInvoiceModalOpen(false)}
                    pedido={selectedPedido}
                    onSuccess={() => {
                        alert('¡Factura generada exitosamente!')
                        setIsInvoiceModalOpen(false)
                        loadPedidos()
                    }}
                />
            )}
        </div>
    )
}
