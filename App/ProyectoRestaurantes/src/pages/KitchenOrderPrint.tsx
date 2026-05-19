import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { pedidoService } from '../services/pedidoService'
import { format } from 'date-fns'
import { Printer, ChevronLeft } from 'lucide-react'

export function KitchenOrderPrint() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const [pedido, setPedido] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (id) loadPedido()
    }, [id])

    async function loadPedido() {
        try {
            setLoading(true)
            const data = await pedidoService.getPedidoById(id!)
            setPedido(data)

            // Auto-print logic
            if (searchParams.get('auto') === 'true') {
                setTimeout(() => {
                    window.print()
                    // Opcional: navegar atrás después de imprimir
                    // navigate(-1)
                }, 500)
            }
        } catch (error) {
            console.error('Error loading kitchen order:', error)
        } finally {
            setLoading(false)
        }
    }

    if (loading) return <div className="p-12 text-center animate-pulse">Generando Comanda...</div>
    if (!pedido) return <div className="p-12 text-center text-red-500">No se encontró el pedido.</div>

    const items = pedido.pedido_detalles || []
    const alimentos = items.filter((i: any) => (i.productos?.categorias?.tipo || 'ALIMENTO') === 'ALIMENTO')
    const bebidas = items.filter((i: any) => i.productos?.categorias?.tipo === 'BEBIDA')

    return (
        <div className="min-h-screen bg-slate-100 pb-12 print:bg-white print:pb-0">
            {/* Toolbar */}
            <div className="max-w-[80mm] mx-auto pt-6 px-4 flex justify-between items-center print:hidden mb-6">
                <button
                    onClick={() => {
                        if (window.history.length > 1) {
                            navigate(-1)
                        } else {
                            window.close()
                        }
                    }}
                    className="text-slate-600 font-bold bg-white px-4 py-2 rounded-lg border border-slate-200 flex items-center gap-1 active:scale-95 transition-all"
                >
                    <ChevronLeft className="w-5 h-5" /> Volver / Cerrar
                </button>
                <button onClick={() => window.print()} className="bg-primary-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-lg active:scale-95 transition-all">
                    <Printer className="w-4 h-4" /> Imprimir
                </button>
            </div>

            {/* Ticket 80mm */}
            <div className="mx-auto bg-white p-[5mm] w-[80mm] font-mono text-[11px] leading-snug text-black print:p-0 print:shadow-none">
                <style dangerouslySetInnerHTML={{ __html: '@page { size: 80mm auto; margin: 0; }' }} />
                <div className="text-center space-y-1 mb-4 border-b-2 border-black pb-2">
                    <h1 className="text-sm font-black uppercase">ORDEN DE PREPARACIÓN</h1>
                    <p className="text-[14px] font-black">PEDIDO № {pedido.id.slice(0, 8)}</p>
                    <p className="text-[16px] font-black bg-black text-white py-1">MESA: {pedido.mesas?.numero}</p>
                    <p className="text-[10px]">{format(new Date(pedido.created_at), 'dd/MM/yyyy HH:mm')}</p>
                </div>

                {alimentos.length > 0 && (
                    <div className="mb-4">
                        <h2 className="text-center border-b border-black font-bold mb-2">--- ALIMENTOS ---</h2>
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-dashed border-black">
                                    <th className="text-left py-1">CANT</th>
                                    <th className="text-left py-1">PRODUCTO</th>
                                </tr>
                            </thead>
                            <tbody>
                                {alimentos.map((item: any) => (
                                    <tr key={item.id} className="border-b border-dashed border-slate-200">
                                        <td className="py-2 font-black text-[14px] vertical-align-top">{item.cantidad}</td>
                                        <td className="py-2 uppercase font-bold">{item.productos?.nombre}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {bebidas.length > 0 && (
                    <div className="mb-4">
                        <h2 className="text-center border-b border-black font-bold mb-2">--- BEBIDAS ---</h2>
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-dashed border-black">
                                    <th className="text-left py-1">CANT</th>
                                    <th className="text-left py-1">PRODUCTO</th>
                                </tr>
                            </thead>
                            <tbody>
                                {bebidas.map((item: any) => (
                                    <tr key={item.id} className="border-b border-dashed border-slate-200">
                                        <td className="py-2 font-black text-[14px] vertical-align-top">{item.cantidad}</td>
                                        <td className="py-2 uppercase font-bold">{item.productos?.nombre}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="mt-6 border-t border-black pt-4 text-center">
                    <p className="font-bold uppercase">Mesero: {pedido.profiles?.nombre || 'General'}</p>
                    <div className="mt-8 border-t border-dashed border-black pt-2">
                        <p className="text-[8px] italic">Fin de Comanda</p>
                    </div>
                </div>
            </div>
        </div>
    )
}
