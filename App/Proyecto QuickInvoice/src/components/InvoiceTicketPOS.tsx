import { forwardRef, useId } from 'react'
import { formatCurrency } from '../lib/utils'
import { format } from 'date-fns'
import { IMPRESION_POS_DEFAULTS, type SriConfig } from '../services/facturacionService'

interface InvoiceTicketPOSProps {
    factura: any
    montoRecibido?: number
    vuelto?: number
    // Config en borrador (para vista previa antes de guardar). Si no se pasa,
    // se lee de factura.empresas.config_sri.impresion_pos (config guardada).
    configOverride?: SriConfig['impresion_pos']
    avisoLopdp?: string | null
}

export const InvoiceTicketPOS = forwardRef<HTMLDivElement, InvoiceTicketPOSProps>(({ factura, montoRecibido, vuelto, configOverride, avisoLopdp }, ref) => {
    const reactId = useId()
    const zoomClass = `ticket-zoom-${reactId.replace(/:/g, '')}`

    if (!factura) return null

    const config = { ...IMPRESION_POS_DEFAULTS, ...(configOverride ?? factura.empresas?.config_sri?.impresion_pos ?? {}) }
    const anchoContenido = config.ancho_papel_mm - config.margen_horizontal_mm * 2

    return (
        <div
            ref={ref}
            className={`mx-auto bg-white p-[5mm] font-mono text-[10px] leading-tight text-black print:p-0 ${zoomClass}`}
            style={{ width: `${anchoContenido}mm` }}
        >
            <style dangerouslySetInnerHTML={{ __html: `
                @page { size: ${config.ancho_papel_mm}mm auto; margin: 0; }
                @media print { .${zoomClass} { zoom: ${config.escala_pct}%; } }
            ` }} />
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
                    <p className="font-bold uppercase">Factura Electronica</p>
                    <p className="font-bold">№ {factura.secuencial}</p>
                </div>
            </div>

            <div className="space-y-1 mb-4">
                <p><span className="font-bold">CLIENTE:</span> {factura.clientes?.nombre}</p>
                <p><span className="font-bold">RUC/CI.:</span> {factura.clientes?.identificacion}</p>
                <p><span className="font-bold">FECHA:</span> {format(new Date(factura.created_at || new Date()), 'dd/MM/yyyy HH:mm')}</p>
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
                            <td className="py-1 uppercase text-[9px]">{item.productos?.nombre}</td>
                            <td className="text-center">{item.cantidad}</td>
                            <td className="text-right">{formatCurrency(item.subtotal)}</td>
                        </tr>
                    ))}
                    {/* Fallback for details if coming from comprobante_detalles snapshot */}
                    {!factura.pedidos?.pedido_detalles && factura.comprobante_detalles?.map((item: any) => (
                        <tr key={item.id}>
                            <td className="py-1 uppercase text-[9px]">{item.nombre_producto}</td>
                            <td className="text-center">{item.cantidad}</td>
                            <td className="text-right">{formatCurrency(item.subtotal)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="border-t border-dashed border-black pt-2 space-y-1">
                {/* Nota: det.subtotal ya viene SIN impuestos (base) — no se debe volver a
                    dividir por (1 + tasa/100), eso extraía IVA de un valor que ya era la base
                    y descuadraba contra el RIDE. Mismo criterio que InvoicePrint.tsx. */}
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

            {factura.comprobante_pagos && factura.comprobante_pagos.length > 0 && (
                <div className="mt-4 border-t border-dashed border-black pt-2 space-y-1">
                    <p className="font-bold">FORMAS DE PAGO:</p>
                    {factura.comprobante_pagos.map((p: any, idx: number) => (
                        <div key={idx} className="space-y-0.5">
                            <div className="flex justify-between text-[9px]">
                                <span className="uppercase">{p.metodo_pago.replace(/_/g, ' ')}:</span>
                                <span>{formatCurrency(p.valor)}</span>
                            </div>
                            {p.referencia && (
                                <div className="text-[8px] text-left pl-2 opacity-75">
                                    {p.metodo_pago === 'transferencia' ? `Banco: ${p.referencia}` : `Ref: ${p.referencia}`}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {montoRecibido != null && montoRecibido > 0 && (
                <div className="mt-2 border-t border-dashed border-black pt-2 space-y-1">
                    <div className="flex justify-between text-[9px]">
                        <span className="font-bold">EFECTIVO RECIBIDO:</span>
                        <span>{formatCurrency(montoRecibido)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-black">
                        <span>VUELTO / CAMBIO:</span>
                        <span>{formatCurrency(vuelto ?? 0)}</span>
                    </div>
                </div>
            )}

            <div className="mt-6 space-y-2 text-[8px]">
                <p className="font-bold uppercase border-t border-black pt-2 text-center">Información Electrónica SRI</p>
                <div className="flex flex-col items-center mb-2">
                    <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${factura.clave_acceso}`}
                        alt="QR SRI"
                        className="w-20 h-20"
                    />
                </div>
                <p className="font-bold">CLAVE DE ACCESO / AUTORIZACIÓN:</p>
                <p className="break-all font-mono leading-none text-[7px] text-center">{factura.autorizacion_numero || factura.clave_acceso}</p>
                <p>FECHA AUT.: {factura.fecha_autorizacion ? format(new Date(factura.fecha_autorizacion), 'dd/MM/yyyy HH:mm') : 'PENDIENTE'}</p>
                <p>AMBIENTE: {factura.ambiente || 'PRUEBAS'}</p>
                <p>EMISIÓN: NORMAL</p>
                {avisoLopdp && (
                    <p className="mt-3 pt-2 border-t border-dashed border-black leading-snug">
                        {avisoLopdp}
                    </p>
                )}

                <p className="mt-4 text-center border-t border-dashed border-black pt-2 italic">
                    Este documento es una representación impresa de un comprobante electrónico.
                </p>
                {(() => {
                    const lim = new Date()
                    let added = 0
                    while (added < 5) {
                        lim.setDate(lim.getDate() + 1)
                        const dow = lim.getDay()
                        if (dow !== 0 && dow !== 6) added++
                    }
                    const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
                    return (
                        <p className="text-center text-[9px] mt-1">
                            Aceptamos retenciones hasta {lim.getDate()}/{meses[lim.getMonth()]}/{lim.getFullYear()}
                        </p>
                    )
                })()}
                {factura.empresas?.glosa_factura && (
                    <p className="text-center text-[9px] mt-1 italic">{factura.empresas.glosa_factura}</p>
                )}
                <p className="text-center font-bold">¡GRACIAS POR SU VISITA!</p>
            </div>
            {config.lineas_avance_final > 0 && Array.from({ length: config.lineas_avance_final }).map((_, i) => (
                <p key={i}>&nbsp;</p>
            ))}
        </div>
    )
})

InvoiceTicketPOS.displayName = 'InvoiceTicketPOS'
