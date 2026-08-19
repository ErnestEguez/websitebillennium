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

    // Ítems de la venta — comprobante_detalles (factura directa) o
    // pedidos.pedido_detalles (flujo de mesas/pedidos), lo que venga.
    const items: any[] = factura.pedidos?.pedido_detalles || factura.comprobante_detalles || []

    // Desglose de bases e IVA por tasa — siempre se muestran las 3 tasas
    // (0/5/15), aunque estén en $0, igual que el RIDE.
    const baseRate: Record<string, number> = { '0': 0, '5': 0, '15': 0 }
    const ivaRate: Record<string, number> = { '5': 0, '15': 0 }
    let totalDescuento = 0
    items.forEach((det: any) => {
        const rate = String(det.productos?.iva_porcentaje ?? det.iva_porcentaje ?? 0)
        const base = Number(det.subtotal || 0)
        if (rate in baseRate) baseRate[rate] += base
        else baseRate[rate] = (baseRate[rate] || 0) + base
        if (rate === '5' || rate === '15') {
            const iva = Number(det.iva_valor ?? (base * Number(rate) / 100))
            ivaRate[rate] += iva
        }
        totalDescuento += Number(det.descuento || 0)
    })
    const totalIva = ivaRate['5'] + ivaRate['15']

    const emailEmpresa = factura.empresas?.email
    const ciudadEmpresa = factura.empresas?.ciudad || 'Guayaquil'

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

            {/* ── Logo ── */}
            <div className="flex justify-center mb-2">
                {factura.empresas?.logo_url ? (
                    <img src={factura.empresas.logo_url} className="w-[64mm] h-auto object-contain" alt="Business" />
                ) : (
                    <div className="w-16 h-16 flex items-center justify-center bg-slate-100 rounded text-xl font-bold">
                        {factura.empresas?.nombre?.[0]}
                    </div>
                )}
            </div>

            {/* ── Empresa ── */}
            <div className="text-center space-y-1 mb-3">
                <h1 className="text-xs font-bold uppercase">{factura.empresas?.nombre}</h1>
                <p>RUC: {factura.empresas?.ruc}</p>
                {factura.empresas?.direccion && <p>{factura.empresas.direccion}</p>}
                <p>{emailEmpresa ? `${emailEmpresa} - ` : ''}{ciudadEmpresa} - Ecuador</p>
                <div className="border-t border-b border-dashed border-black py-1 my-2">
                    <p className="font-bold uppercase">Factura Electronica</p>
                    <p className="font-bold">No. {factura.secuencial}</p>
                </div>
            </div>

            {/* ── Bloque SRI: QR, clave, autorización, ambiente, fecha ── */}
            <div className="text-center space-y-1 mb-3 text-[8px]">
                <div className="flex flex-col items-center mb-1">
                    <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${factura.clave_acceso}`}
                        alt="QR SRI"
                        className="w-16 h-16"
                    />
                </div>
                <p className="font-bold">CLAVE DE ACCESO:</p>
                <p className="break-all font-mono leading-none">{factura.clave_acceso}</p>
                <p className="font-bold mt-1">AUTORIZACIÓN:</p>
                <p className="break-all font-mono leading-none">{factura.autorizacion_numero || factura.clave_acceso}</p>
                <p>AMBIENTE: {factura.ambiente || 'PRUEBAS'}</p>
                <p>FECHA AUT.: {factura.fecha_autorizacion ? format(new Date(factura.fecha_autorizacion), 'dd/MM/yyyy HH:mm') : 'PENDIENTE'}</p>
                <p>EMISIÓN: NORMAL</p>
            </div>

            {/* ── Datos de la factura (cliente) ── */}
            <div className="space-y-1 mb-3 border-t border-dashed border-black pt-2">
                <p><span className="font-bold">EMISIÓN:</span> {format(new Date(factura.created_at || new Date()), 'dd/MM/yyyy HH:mm')}</p>
                <p><span className="font-bold">CÉDULA/RUC:</span> {factura.clientes?.identificacion}</p>
                <p><span className="font-bold">NOMBRE:</span> {factura.clientes?.nombre}</p>
                {factura.clientes?.direccion && <p><span className="font-bold">DIRECCIÓN:</span> {factura.clientes.direccion}</p>}
                {factura.clientes?.email && <p><span className="font-bold">CORREO:</span> {factura.clientes.email}</p>}
                {factura.vendedores?.nombre && <p><span className="font-bold">VENDEDOR:</span> {factura.vendedores.nombre}</p>}
            </div>

            {/* ── Detalle ── */}
            <table className="w-full mb-4 border-collapse">
                <thead className="border-b border-dashed border-black">
                    <tr>
                        <th className="text-center pb-1">CANT</th>
                        <th className="text-left pb-1">DESCRIPCIÓN</th>
                        <th className="text-right pb-1">UNIT.</th>
                        <th className="text-right pb-1 pl-3">TOTAL</th>
                    </tr>
                </thead>
                <tbody className="pt-1">
                    {items.map((item: any, idx: number) => (
                        <tr key={item.id ?? idx}>
                            <td className="text-center">{item.cantidad}</td>
                            <td className="py-1 uppercase text-[9px]">{item.productos?.nombre ?? item.nombre_producto}</td>
                            <td className="text-right">{formatCurrency(Number(item.precio_unitario || 0))}</td>
                            <td className="text-right pl-3">{formatCurrency(Number(item.subtotal || 0))}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* ── Totales ── */}
            <div className="border-t border-dashed border-black pt-2 space-y-1">
                {/* Nota: det.subtotal ya viene SIN impuestos (base) — no se debe volver a
                    dividir por (1 + tasa/100), eso extraía IVA de un valor que ya era la base
                    y descuadraba contra el RIDE. Mismo criterio que InvoicePrint.tsx. */}
                <div className="flex justify-between">
                    <span>SUB TOTAL BASE IVA 0%:</span>
                    <span>{formatCurrency(baseRate['0'] || 0)}</span>
                </div>
                <div className="flex justify-between">
                    <span>SUBTOTAL BASE IVA 5%:</span>
                    <span>{formatCurrency(baseRate['5'] || 0)}</span>
                </div>
                <div className="flex justify-between">
                    <span>SUBTOTAL BASE IVA 15%:</span>
                    <span>{formatCurrency(baseRate['15'] || 0)}</span>
                </div>
                <div className="flex justify-between">
                    <span>DESCUENTO:</span>
                    <span>-{formatCurrency(totalDescuento)}</span>
                </div>
                <div className="flex justify-between">
                    <span>IVA 5%:</span>
                    <span>{formatCurrency(ivaRate['5'] || 0)}</span>
                </div>
                <div className="flex justify-between">
                    <span>IVA 15%:</span>
                    <span>{formatCurrency(ivaRate['15'] || 0)}</span>
                </div>
                <div className="flex justify-between font-bold">
                    <span>TOTAL IVA:</span>
                    <span>{formatCurrency(totalIva)}</span>
                </div>
                <div className="flex justify-between text-xs font-black pt-1 border-t border-black">
                    <span>TOTAL:</span>
                    <span>{formatCurrency(factura.total)}</span>
                </div>
            </div>

            {/* ── Formas de pago ── */}
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
                        <span className="font-bold">RECIBIDO:</span>
                        <span>{formatCurrency(montoRecibido)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-black">
                        <span>VUELTO:</span>
                        <span>{formatCurrency(vuelto ?? 0)}</span>
                    </div>
                </div>
            )}

            {/* ── Observaciones ── */}
            {factura.observacion && (
                <div className="mt-2 border-t border-dashed border-black pt-2">
                    <p className="font-bold">OBSERVACIONES:</p>
                    <p className="text-[9px]">{factura.observacion}</p>
                </div>
            )}

            <div className="mt-6 space-y-2 text-[8px]">
                <p className="mt-1">Proveedor de Facturación: Billennium System RUC 0907388268001</p>
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
                {/* ── Glosa fija por empresa ── */}
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
