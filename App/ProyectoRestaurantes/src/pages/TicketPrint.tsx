import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { facturacionService } from '../services/facturacionService'
import { formatCurrency } from '../lib/utils'
import { format } from 'date-fns'
import { Printer, ChevronLeft } from 'lucide-react'

export function TicketPrint() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const [factura, setFactura] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (id) loadFactura()
    }, [id])

    async function loadFactura() {
        try {
            setLoading(true)
            const data = await facturacionService.getComprobanteCompleto(id!)
            setFactura(data)

            if (searchParams.get('auto') === 'true') {
                setTimeout(() => {
                    window.print()
                }, 800)
            }
        } catch (error) {
            console.error('Error loading ticket:', error)
        } finally {
            setLoading(false)
        }
    }

    if (loading) return <div className="p-12 text-center animate-pulse">Generando Ticket...</div>
    if (!factura) return <div className="p-12 text-center text-red-500">No se encontró el comprobante.</div>

    return (
        <div className="min-h-screen bg-slate-100 pb-12 print:bg-white print:pb-0">
            {/* Toolbar */}
            <div className="max-w-[80mm] mx-auto pt-6 px-4 flex justify-between items-center print:hidden mb-6">
                <button onClick={() => navigate(-1)} className="text-slate-600 font-medium flex items-center gap-1">
                    <ChevronLeft className="w-4 h-4" /> Volver
                </button>
                <button onClick={() => window.print()} className="bg-primary-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-lg">
                    <Printer className="w-4 h-4" /> Imprimir
                </button>
            </div>

            {/* Ticket 80mm */}
            <div className="mx-auto bg-white p-[5mm] w-[80mm] font-mono text-[10px] leading-tight text-black print:p-0 print:shadow-none">
                <style dangerouslySetInnerHTML={{ __html: '@page { size: 80mm auto; margin: 0; }' }} />
                {/* Header Logos */}
                <div className="flex justify-center mb-4">
                    {factura.empresas?.logo_url ? (
                        <img src={factura.empresas.logo_url} className="w-20 h-20 object-contain" alt="Business" />
                    ) : (
                        <div className="w-16 h-16 flex items-center justify-center bg-slate-100 rounded text-xl font-bold">
                            {factura.empresas?.nombre?.[0]}
                        </div>
                    )}
                </div>

                <div className="text-center space-y-1 mb-4">
                    <h1 className="text-xs font-bold uppercase">{factura.empresas?.nombre}</h1>
                    <p>{factura.empresas?.direccion || 'Ecuador'}</p>
                    <p>RUC: {factura.empresas?.ruc}</p>
                    <div className="border-t border-b border-dashed border-black py-1 my-2">
                        <p className="font-bold">FACTURA № {factura.secuencial}</p>
                    </div>
                </div>

                <div className="space-y-1 mb-4">
                    <p><span className="font-bold">CLIENTE:</span> {factura.clientes?.nombre}</p>
                    <p><span className="font-bold">RUC/CI.:</span> {factura.clientes?.identificacion}</p>
                    <p><span className="font-bold">FECHA:</span> {format(new Date(factura.created_at), 'dd/MM/yyyy HH:mm')}</p>
                </div>

                <table className="w-full mb-4 border-collapse">
                    <thead className="border-b border-dashed border-black">
                        <tr>
                            <th className="text-left pb-1">DESCRIPCIÓN</th>
                            <th className="text-center pb-1">CANT</th>
                            <th className="text-right pb-1">TOTAL</th>
                        </tr>
                    </thead>
                    <tbody className="pt-1">
                        {factura.pedidos?.pedido_detalles?.map((item: any) => (
                            <tr key={item.id}>
                                <td className="py-1 uppercase">{item.productos?.nombre}</td>
                                <td className="text-center">{item.cantidad}</td>
                                <td className="text-right">{formatCurrency(item.subtotal)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="border-t border-dashed border-black pt-2 space-y-1">
                    {(() => {
                        const breakdown: Record<number, number> = {}
                        factura.pedidos?.pedido_detalles?.forEach((det: any) => {
                            const rate = det.productos?.iva_porcentaje || 0
                            breakdown[rate] = (breakdown[rate] || 0) + (det.subtotal / (1 + rate / 100))
                        })
                        return Object.entries(breakdown).map(([rate, base]) => (
                            <div key={rate} className="flex justify-between">
                                <span>SUBTOTAL {rate}%:</span>
                                <span>{formatCurrency(base)}</span>
                            </div>
                        ))
                    })()}
                    {(() => {
                        const totalIva = factura.pedidos?.pedido_detalles?.reduce((sum: number, det: any) => {
                            const rate = det.productos?.iva_porcentaje || 0
                            const base = det.subtotal / (1 + rate / 100)
                            return sum + (det.subtotal - base)
                        }, 0)
                        return (
                            <div className="flex justify-between">
                                <span>TOTAL IVA:</span>
                                <span>{formatCurrency(totalIva)}</span>
                            </div>
                        )
                    })()}
                    <div className="flex justify-between text-xs font-black pt-1 border-t border-black">
                        <span>TOTAL A PAGAR:</span>
                        <span>{formatCurrency(factura.total)}</span>
                    </div>
                </div>

                <div className="mt-6 space-y-2 text-[8px]">
                    <p className="font-bold uppercase border-t border-black pt-2">Información SRI:</p>
                    <p>AUTORIZACIÓN:</p>
                    <p className="break-all font-mono leading-none">{factura.autorizacion_numero || factura.clave_acceso}</p>
                    <p>FECHA AUT.: {factura.fecha_autorizacion ? format(new Date(factura.fecha_autorizacion), 'dd/MM/yyyy HH:mm') : 'PENDIENTE'}</p>
                    <p>AMBIENTE: {factura.ambiente || 'PRUEBAS'}</p>
                    <p>EMISIÓN: NORMAL</p>
                    <p className="mt-4 text-center border-t border-dashed border-black pt-2 italic">
                        Gracias por su visita
                    </p>
                </div>
            </div>
        </div>
    )
}
