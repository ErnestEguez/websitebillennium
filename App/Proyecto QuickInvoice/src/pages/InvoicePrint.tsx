import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { facturacionService } from '../services/facturacionService'
import { sriService } from '../services/sriService'
import { formatCurrency } from '../lib/utils'
import { format } from 'date-fns'
import { Loader2, Printer, ChevronLeft, Download } from 'lucide-react'

export function InvoicePrint() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [factura, setFactura] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (id) {
            loadFactura()
        }
    }, [id])

    async function loadFactura() {
        try {
            setLoading(true)
            const data = await facturacionService.getComprobanteCompleto(id!)
            setFactura(data)
        } catch (error) {
            console.error('Error loading invoice for print:', error)
        } finally {
            setLoading(false)
        }
    }

    if (loading) return (
        <div className="flex flex-col items-center justify-center p-24 gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary-600" />
            <p className="text-slate-500 font-medium">Generando RIDE...</p>
        </div>
    )

    if (!factura) return <div className="p-12 text-center text-red-500">No se encontró el comprobante.</div>

    return (
        <div className="min-h-screen bg-slate-50 pb-12 print:bg-white print:pb-0">
            {/* Toolbar for Screen Only */}
            <div className="max-w-4xl mx-auto pt-6 px-4 flex justify-between items-center print:hidden mb-6">
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium"
                >
                    <ChevronLeft className="w-4 h-4" />
                    Volver
                </button>
                <div className="flex gap-3">
                    <button
                        onClick={() => window.print()}
                        className="btn btn-primary flex items-center gap-2 shadow-lg"
                    >
                        <Printer className="w-4 h-4" />
                        Imprimir / Guardar PDF
                    </button>
                    <button
                        onClick={() => sriService.descargarXml(factura.id, factura.secuencial)}
                        className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-white transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        XML
                    </button>
                </div>
            </div>

            {/* Invoice Document */}
            <div className="max-w-4xl mx-auto bg-white shadow-2xl rounded-xl p-8 md:p-12 print:shadow-none print:rounded-none print:p-0">
                {/* Header Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-b-2 border-slate-100 pb-8 relative">

                    <div className="space-y-4">
                        <div className="flex items-center">
                            {factura.empresas?.logo_url ? (
                                <img
                                    src={factura.empresas.logo_url}
                                    alt="Logo Empresa"
                                    className="h-24 max-w-[200px] object-contain"
                                    crossOrigin="anonymous"
                                    style={{
                                        WebkitPrintColorAdjust: 'exact',
                                        printColorAdjust: 'exact',
                                        colorAdjust: 'exact'
                                    } as any}
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                                />
                            ) : (
                                <div className="text-primary-700 font-black text-2xl uppercase">
                                    {factura.empresas?.nombre}
                                </div>
                            )}
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{factura.empresas?.nombre}</h1>
                            <p className="text-slate-500 font-medium">{factura.empresas?.direccion || 'Ecuador'}</p>
                            <p className="text-slate-500">Tel: {factura.empresas?.telefono || '-'}</p>
                            <p className="text-slate-500">RUC: {factura.empresas?.ruc}</p>
                        </div>
                    </div>

                    <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col justify-center">
                        <h2 className="text-primary-600 font-black text-xl mb-1 uppercase tracking-widest text-center">Factura</h2>
                        <p className="text-slate-900 text-center font-bold text-lg mb-4">№ {factura.secuencial}</p>

                        <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                                <span className="text-slate-400 font-bold uppercase">Nº Autorización:</span>
                            </div>
                            <p className="font-mono text-[10px] break-all text-slate-600 bg-white p-2 rounded border border-slate-200">
                                {factura.autorizacion_numero || factura.clave_acceso}
                            </p>
                            <div className="flex justify-between pt-2">
                                <span className="text-slate-400 font-bold uppercase">Fecha/Hora Autorización:</span>
                                <span className="text-slate-900 font-bold">
                                    {factura.fecha_autorizacion ? format(new Date(factura.fecha_autorizacion), 'dd/MM/yyyy HH:mm') : 'PENDIENTE'}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400 font-bold uppercase">Ambiente:</span>
                                <span className="text-slate-900 font-bold">{factura.ambiente || 'PRUEBAS'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400 font-bold uppercase">Emisión:</span>
                                <span className="text-slate-900 font-bold">NORMAL</span>
                            </div>
                            <div className="flex justify-between pt-2 border-t border-slate-100 mt-2">
                                <span className="text-slate-400 font-bold uppercase">Clave de Acceso:</span>
                            </div>
                            <p className="font-mono text-[8px] break-all text-slate-400">
                                {factura.clave_acceso}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Info Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-8 border-b border-slate-100">
                    <div>
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Datos del Cliente</h3>
                        <p className="text-lg font-black text-slate-900">{factura.clientes?.nombre}</p>
                        <p className="text-slate-500 font-medium">identificación: {factura.clientes?.identificacion}</p>
                        <p className="text-slate-500">Email: {factura.clientes?.email}</p>
                    </div>
                    <div className="text-left md:text-right">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Fecha de Emisión</h3>
                        <p className="text-lg font-black text-slate-900">
                            {format(new Date(factura.created_at), 'dd / MM / yyyy')}
                        </p>
                        <p className="text-slate-500 font-medium">
                            Hora: {format(new Date(factura.created_at), 'HH:mm')}
                        </p>
                    </div>
                </div>

                {/* Details Table */}
                <div className="py-8">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                                <th className="pb-4">Descripción</th>
                                <th className="pb-4 text-center">Cant.</th>
                                <th className="pb-4 text-right">P.Unit S/IVA</th>
                                <th className="pb-4 text-right">Subtotal</th>
                                <th className="pb-4 text-right">IVA</th>
                                <th className="pb-4 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {(factura.comprobante_detalles || factura.pedidos?.pedido_detalles || []).map((item: any) => {
                                const subtotalSinIva = Number(item.subtotal || 0)
                                const ivaValor = Number(item.iva_valor ?? (subtotalSinIva * (Number(item.iva_porcentaje || 0) / 100)))
                                const totalLinea = subtotalSinIva + ivaValor
                                return (
                                    <tr key={item.id} className="text-sm">
                                        <td className="py-4 font-bold text-slate-900">{item.nombre_producto || item.productos?.nombre}</td>
                                        <td className="py-4 text-center font-medium text-slate-500">{Number(item.cantidad).toFixed(2)}</td>
                                        <td className="py-4 text-right font-medium text-slate-500">{formatCurrency(item.precio_unitario)}</td>
                                        <td className="py-4 text-right font-medium text-slate-500">{formatCurrency(subtotalSinIva)}</td>
                                        <td className="py-4 text-right font-medium text-slate-500">{formatCurrency(ivaValor)}</td>
                                        <td className="py-4 text-right font-black text-slate-900">{formatCurrency(totalLinea)}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Totals Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t-2 border-slate-100">
                    <div className="space-y-6">
                        <div className="bg-slate-50 rounded-2xl p-6 h-fit border border-slate-100">
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Información Adicional</h3>
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-slate-500 font-medium">Dirección:</span>
                                    <span className="text-slate-900 font-bold">{factura.clientes?.direccion || '-'}</span>
                                </div>
                                <div className="space-y-1.5">
                                    <span className="text-slate-500 font-medium block">Formas de Pago:</span>
                                    {factura.comprobante_pagos?.map((p: any, idx: number) => (
                                        <div key={idx} className="flex justify-between pl-4 text-xs">
                                            <span className="text-slate-600 uppercase italic">{p.metodo_pago.replace('_', ' ')}:</span>
                                            <span className="text-slate-900 font-black">{formatCurrency(p.valor)}</span>
                                        </div>
                                    ))}
                                    {(!factura.comprobante_pagos || factura.comprobante_pagos.length === 0) && (
                                        <span className="text-slate-900 font-bold pl-4">OTRAS CON UTILIZACION DEL SISTEMA FINANCIERO</span>
                                    )}
                                </div>
                                <div className="pt-2 border-t border-slate-200">
                                    <span className="text-slate-400 text-[10px] font-black uppercase">Requerimiento SRI:</span>
                                    <p className="text-slate-900 font-black text-xs mt-1">
                                        {factura.sri_utilizacion_sistema_financiero
                                            ? "CON UTILIZACION DEL SISTEMA FINANCIERO"
                                            : "SIN UTILIZACION DEL SISTEMA FINANCIERO"}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* QR Code */}
                        <div className="flex flex-col items-center justify-center p-6 bg-white border border-slate-100 rounded-2xl space-y-3">
                            <img
                                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${factura.clave_acceso}`}
                                alt="QR SRI"
                                className="w-32 h-32"
                            />
                            <p className="text-[8px] font-mono text-slate-400 uppercase tracking-tighter">Escanee para consultar en SRI</p>
                        </div>
                    </div>

                    <div className="space-y-3">
                        {/* Dinamyc Totals calculation */}
                        {(() => {
                            // Calcular IVA desde comprobante_detalles (facturas directas) o pedido_detalles (pedidos)
                            const detalles = factura.comprobante_detalles || factura.pedidos?.pedido_detalles || []
                            const breakdown: Record<string, { base: number; iva: number }> = {}
                            detalles.forEach((det: any) => {
                                const rate = det.iva_porcentaje ?? det.productos?.iva_porcentaje ?? 0
                                const base = det.subtotal || 0
                                const iva = det.iva_valor ?? (base * rate / 100)
                                const key = String(rate)
                                if (!breakdown[key]) breakdown[key] = { base: 0, iva: 0 }
                                breakdown[key].base += base
                                breakdown[key].iva += iva
                            })

                            return (
                                <>
                                    {Object.entries(breakdown).map(([rate, vals]) => (
                                        <div key={rate} className="flex justify-between items-center text-slate-500 font-medium">
                                            <span>Subtotal IVA {rate}%</span>
                                            <span>{formatCurrency((vals as any).base)}</span>
                                        </div>
                                    ))}
                                    <div className="flex justify-between items-center text-slate-500 font-medium">
                                        <span>IVA Total</span>
                                        <span>{formatCurrency(Object.values(breakdown).reduce((s: number, v: any) => s + v.iva, 0))}</span>
                                    </div>
                                </>
                            )
                        })()}

                        <div className="flex justify-between items-center bg-primary-600 text-white rounded-xl p-4 mt-4">
                            <span className="font-bold text-lg">TOTAL</span>
                            <span className="font-black text-2xl">{formatCurrency(factura.total)}</span>
                        </div>
                    </div>
                </div>

                <div className="mt-12 text-center border-t border-slate-100 pt-8 opacity-50 text-[10px] uppercase font-bold tracking-widest text-slate-400">
                    Este documento es una representación impresa de un comprobante electrónico (RIDE)
                </div>
            </div>
        </div>
    )
}
