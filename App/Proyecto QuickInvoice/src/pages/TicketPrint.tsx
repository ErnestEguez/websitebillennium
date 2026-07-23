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

    const montoUrl  = parseFloat(searchParams.get('monto')  || '0')
    const vueltoUrl = parseFloat(searchParams.get('vuelto') || '0')

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
            <div className="mx-auto bg-white p-[5mm] w-[72mm] font-mono text-[10px] leading-tight text-black print:p-0 print:shadow-none">
                <style dangerouslySetInnerHTML={{ __html: '@page { size: 80mm auto; margin: 0; }' }} />
                {/* Header Logos */}
                <div className="flex justify-center mb-4">
                    {factura.empresas?.logo_url ? (
                        <img src={factura.empresas.logo_url} className="w-[64mm] h-auto object-contain" alt="Business" />
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
                        {/* Fallback: facturas directas (sin pedido) usan comprobante_detalles */}
                        {!factura.pedidos?.pedido_detalles && factura.comprobante_detalles?.map((item: any) => (
                            <tr key={item.id}>
                                <td className="py-1 uppercase">{item.nombre_producto}</td>
                                <td className="text-center">{item.cantidad}</td>
                                <td className="text-right">{formatCurrency(item.subtotal)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="border-t border-dashed border-black pt-2 space-y-1">
                    {/* det.subtotal ya viene SIN impuestos (base) — no dividir de nuevo por
                        (1 + tasa/100), eso descuadraba contra el RIDE. Igual que InvoicePrint.tsx. */}
                    {(() => {
                        const breakdown: Record<number, number> = {}
                        const items = factura.pedidos?.pedido_detalles || factura.comprobante_detalles || []
                        items.forEach((det: any) => {
                            const rate = det.productos?.iva_porcentaje || det.iva_porcentaje || 0
                            breakdown[rate] = (breakdown[rate] || 0) + Number(det.subtotal || 0)
                        })
                        return Object.entries(breakdown).map(([rate, base]) => (
                            <div key={rate} className="flex justify-between">
                                <span>SUBTOTAL {rate}%:</span>
                                <span>{formatCurrency(base)}</span>
                            </div>
                        ))
                    })()}
                    {(() => {
                        const items = factura.pedidos?.pedido_detalles || factura.comprobante_detalles || []
                        const totalIva = items.reduce((sum: number, det: any) => {
                            const rate = det.productos?.iva_porcentaje || det.iva_porcentaje || 0
                            const iva = Number(det.iva_valor ?? (Number(det.subtotal || 0) * rate / 100))
                            return sum + iva
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

                {/* Formas de pago */}
                {factura.comprobante_pagos && factura.comprobante_pagos.length > 0 && (
                    <div className="mt-4 border-t border-dashed border-black pt-2 space-y-1">
                        <p className="font-bold">FORMAS DE PAGO:</p>
                        {factura.comprobante_pagos.map((p: any, idx: number) => (
                            <div key={idx} className="space-y-0.5">
                                <div className="flex justify-between">
                                    <span className="uppercase">{p.metodo_pago.replace(/_/g, ' ')}:</span>
                                    <span>{formatCurrency(p.valor)}</span>
                                </div>
                                {p.referencia && (
                                    <div className="text-[8px] pl-2 opacity-75">
                                        {p.metodo_pago === 'transferencia' ? `Banco: ${p.referencia}` : `Ref: ${p.referencia}`}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Efectivo recibido / vuelto (desde params de URL) */}
                {montoUrl > 0 && (
                    <div className="mt-2 border-t border-dashed border-black pt-2 space-y-1">
                        <div className="flex justify-between">
                            <span className="font-bold">EFECTIVO RECIBIDO:</span>
                            <span>{formatCurrency(montoUrl)}</span>
                        </div>
                        <div className="flex justify-between font-black">
                            <span>VUELTO / CAMBIO:</span>
                            <span>{formatCurrency(vueltoUrl)}</span>
                        </div>
                    </div>
                )}

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
