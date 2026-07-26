import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { facturacionService } from '../services/facturacionService'
import { sriService } from '../services/sriService'
import { politicaPrivacidadService } from '../services/lopdp/politicaPrivacidadService'
import { format } from 'date-fns'
import { Loader2, Printer, ChevronLeft, Download } from 'lucide-react'

const r2 = (n: unknown) => Number(Number(n ?? 0).toFixed(2))
const fmt2 = (n: unknown) => r2(n).toFixed(2)
const fmt4 = (n: unknown) => Number(n ?? 0).toFixed(4)

export function InvoicePrint() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [factura, setFactura] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    // LOPDP Fase 4: opcional — si la empresa no tiene el módulo configurado,
    // simplemente queda null y no se muestra nada. Nunca bloquea el RIDE.
    const [avisoLopdp, setAvisoLopdp] = useState<string | null>(null)

    useEffect(() => { if (id) loadFactura() }, [id])

    useEffect(() => {
        const empresaId = factura?.empresas?.id
        if (!empresaId) return
        let cancelled = false
        politicaPrivacidadService.obtener(empresaId)
            .then(cfg => {
                if (cancelled || !cfg?.slug || !cfg.aviso_lopdp_texto) return
                const url = `${window.location.origin}/p/${cfg.slug}`
                setAvisoLopdp(`${cfg.aviso_lopdp_texto} ${url}`)
            })
            .catch(() => {})
        return () => { cancelled = true }
    }, [factura?.empresas?.id])

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

    const empresa  = factura.empresas  || {}
    const cliente  = factura.clientes  || {}
    const detalles: any[] = factura.comprobante_detalles || factura.pedidos?.pedido_detalles || []
    const pagos:    any[] = factura.comprobante_pagos    || []

    // ── Totales agrupados por tasa IVA ──────────────────────────────────────────
    const ivaBreakdown: Record<string, { base: number; iva: number }> = {}
    let totalDescuento = 0
    detalles.forEach((d) => {
        const rate = String(d.iva_porcentaje ?? 0)
        const base = r2(d.subtotal)
        const iva  = r2(d.iva_valor ?? (base * Number(rate) / 100))
        // descuento: el campo almacena %, calculamos el valor
        const dctoVal = r2(Number(d.precio_unitario ?? 0) * Number(d.cantidad ?? 0) * (Number(d.descuento ?? 0) / 100))
        if (!ivaBreakdown[rate]) ivaBreakdown[rate] = { base: 0, iva: 0 }
        ivaBreakdown[rate].base = r2(ivaBreakdown[rate].base + base)
        ivaBreakdown[rate].iva  = r2(ivaBreakdown[rate].iva  + iva)
        totalDescuento = r2(totalDescuento + dctoVal)
    })

    const ratesConIva = Object.keys(ivaBreakdown)
        .filter(r => r !== '0')
        .sort((a, b) => Number(a) - Number(b))
    const subtotalSinImpuestos = r2(Object.values(ivaBreakdown).reduce((s, v) => s + v.base, 0))
    const totalIvaAll          = r2(ratesConIva.reduce((s, r) => s + (ivaBreakdown[r]?.iva ?? 0), 0))
    const valorTotal           = r2(factura.total ?? (subtotalSinImpuestos + totalIvaAll))

    const fechaEmision = factura.fecha_emision || factura.created_at
    const fechaVenc    = factura.fecha_vencimiento || fechaEmision

    // ── Nombre de forma de pago legible ─────────────────────────────────────────
    const labelPago: Record<string, string> = {
        efectivo:                     'EFECTIVO',
        tarjeta:                      'TARJETA DE CRÉDITO/DÉBITO',
        tarjeta_credito:              'TARJETA DE CRÉDITO',
        tarjeta_debito:               'TARJETA DE DÉBITO',
        transferencia:                'TRANSFERENCIA',
        cheque:                       'CHEQUE',
        credito:                      'SIN UTILIZACION DEL SISTEMA FINANCIERO',
        otros:                        'OTROS',
        sin_utilizacion_sistema_financiero: 'SIN UTILIZACION DEL SISTEMA FINANCIERO',
    }

    return (
        <>
            {/* Suprimir encabezado/pie automático del navegador al imprimir */}
            <style>{`
                @media print {
                    @page { margin: 0; size: A4 portrait; }
                    html, body { padding: 8mm 10mm !important; box-sizing: border-box; }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                }
            `}</style>

            {/* TOOLBAR — solo en pantalla */}
            <div className="print:hidden max-w-4xl mx-auto pt-6 px-4 flex justify-between items-center mb-6">
                <button onClick={() => navigate(-1)}
                    className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium">
                    <ChevronLeft className="w-4 h-4" /> Volver
                </button>
                <div className="flex gap-3">
                    <button onClick={() => window.print()}
                        className="btn btn-primary flex items-center gap-2 shadow-lg">
                        <Printer className="w-4 h-4" /> Imprimir / Guardar PDF
                    </button>
                    <button onClick={() => sriService.descargarXml(factura.id, factura.secuencial)}
                        className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-white transition-colors">
                        <Download className="w-4 h-4" /> XML
                    </button>
                </div>
            </div>

            {/* ══════════════════════ RIDE DOCUMENT ══════════════════════ */}
            <div className="max-w-4xl mx-auto bg-white shadow-2xl print:shadow-none print:max-w-none text-[9.5px] leading-snug font-sans p-6 print:p-0">

                {/* ── CABECERA: EMPRESA | FACTURA ── */}
                <table className="w-full border-collapse">
                    <tbody>
                        <tr>
                            {/* Empresa */}
                            <td className="border border-slate-400 p-2 w-[55%] align-top">
                                {empresa.logo_url && (
                                    <img src={empresa.logo_url} alt="Logo"
                                        className="h-16 max-w-[180px] object-contain mb-2"
                                        style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as any}
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                                    />
                                )}
                                <p className="font-black text-[12px]">
                                    {(empresa.razon_social || empresa.nombre || '').toUpperCase()}
                                </p>
                                <p className="mt-1">Dir Matriz: {empresa.direccion}</p>
                                {empresa.telefono && <p>Telf. {empresa.telefono}</p>}
                                <p className="mt-1 font-semibold">
                                    OBLIGADO A LLEVAR CONTABILIDAD {empresa.obligado_contabilidad ? 'SI' : 'NO'}
                                </p>
                            </td>

                            {/* Info FACTURA */}
                            <td className="border border-l-0 border-slate-400 p-0 w-[45%] align-top">
                                <table className="w-full border-collapse text-center">
                                    <tbody>
                                        <tr>
                                            <td className="border-b border-slate-400 p-1">
                                                <span className="font-bold">R.U.C.: </span>{empresa.ruc}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="border-b border-slate-400 p-1 bg-slate-100">
                                                <p className="font-black text-[13px]">FACTURA</p>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="border-b border-slate-400 p-1">
                                                No. {factura.secuencial}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="border-b border-slate-400 p-1 text-left">
                                                <p className="font-bold text-[8.5px]">NÚMERO DE AUTORIZACIÓN</p>
                                                <p className="font-mono text-[7.5px] break-all mt-0.5">
                                                    {factura.autorizacion_numero || factura.clave_acceso}
                                                </p>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="border-b border-slate-400 p-1 text-left">
                                                <div className="flex justify-between">
                                                    <span className="font-bold text-[8.5px]">FECHA Y HORA DE AUTORIZACIÓN</span>
                                                    <span className="font-mono text-[8px]">
                                                        {factura.fecha_autorizacion
                                                            ? format(new Date(factura.fecha_autorizacion), "yyyy-MM-dd HH:mm:ss")
                                                            : 'PENDIENTE'}
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="p-1 text-left">
                                                <div className="flex justify-between">
                                                    <span className="font-bold text-[8.5px]">AMBIENTE:</span>
                                                    <span>{(factura.ambiente || 'PRODUCCION').toUpperCase()}</span>
                                                </div>
                                                <div className="flex justify-between mt-0.5">
                                                    <span className="font-bold text-[8.5px]">EMISIÓN:</span>
                                                    <span>NORMAL</span>
                                                </div>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </td>
                        </tr>
                    </tbody>
                </table>

                {/* ── CLAVE DE ACCESO ── */}
                <div className="border border-t-0 border-slate-400 p-2 flex items-center gap-4">
                    <div className="flex-1">
                        <p className="font-bold text-[8.5px] mb-0.5">CLAVE DE ACCESO</p>
                        <p className="font-mono text-[8px] break-all">{factura.clave_acceso}</p>
                    </div>
                    <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${factura.clave_acceso}`}
                        alt="QR Clave de Acceso"
                        className="w-20 h-20 flex-shrink-0"
                    />
                </div>

                {/* ── DATOS DEL COMPRADOR ── */}
                <div className="border border-t-0 border-slate-400 p-1.5 grid grid-cols-4 gap-x-3 gap-y-0.5">
                    <div className="col-span-2">
                        <span className="font-bold">Razón Social: </span>
                        <span>{(cliente.nombre || 'CONSUMIDOR FINAL').toUpperCase()}</span>
                    </div>
                    <div>
                        <span className="font-bold">Fecha Emisión: </span>
                        <span>{format(new Date(fechaEmision), 'dd/MM/yyyy')}</span>
                    </div>
                    <div>
                        <span className="font-bold">RUC / CI: </span>
                        <span>{cliente.identificacion || '9999999999999'}</span>
                    </div>
                    <div className="col-span-2">
                        {cliente.direccion && <>
                            <span className="font-bold">Dirección: </span>
                            <span>{cliente.direccion}</span>
                        </>}
                    </div>
                    <div>
                        <span className="font-bold">Fecha Vencimiento: </span>
                        <span>{format(new Date(fechaVenc), 'dd/MM/yyyy')}</span>
                    </div>
                </div>

                {/* ── TABLA DETALLES ── */}
                <table className="w-full border-collapse border border-t-0 border-slate-400 text-[9px]">
                    <thead>
                        <tr className="bg-slate-100 text-[8.5px]">
                            <th className="border border-slate-300 px-1 py-1 text-left font-bold whitespace-nowrap">Cod. Principal</th>
                            <th className="border border-slate-300 px-1 py-1 text-left font-bold whitespace-nowrap">Cod. Auxiliar</th>
                            <th className="border border-slate-300 px-1 py-1 text-right font-bold whitespace-nowrap">Cant</th>
                            <th className="border border-slate-300 px-1 py-1 text-left font-bold">Descripción</th>
                            <th className="border border-slate-300 px-1 py-1 text-center font-bold whitespace-nowrap">Paga IVA</th>
                            <th className="border border-slate-300 px-1 py-1 text-right font-bold whitespace-nowrap">Dcto %</th>
                            <th className="border border-slate-300 px-1 py-1 text-right font-bold whitespace-nowrap">Dcto ($)</th>
                            <th className="border border-slate-300 px-1 py-1 text-right font-bold whitespace-nowrap">Precio Unitario</th>
                            <th className="border border-slate-300 px-1 py-1 text-right font-bold whitespace-nowrap">Precio Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {detalles.map((d: any, i: number) => {
                            const ivaRate = Number(d.iva_porcentaje ?? 0)
                            const dcto    = Number(d.descuento ?? 0)
                            const dctoVal = r2(Number(d.precio_unitario ?? 0) * Number(d.cantidad ?? 0) * dcto / 100)
                            return (
                                <tr key={d.id || i} className={i % 2 === 0 ? '' : 'bg-slate-50'}>
                                    <td className="border border-slate-200 px-1 py-0.5">
                                        {d.productos?.codigo || d.producto_id?.slice(0, 8) || '-'}
                                    </td>
                                    <td className="border border-slate-200 px-1 py-0.5">
                                        {d.codigo_auxiliar || ''}
                                    </td>
                                    <td className="border border-slate-200 px-1 py-0.5 text-right">
                                        {Number(d.cantidad).toFixed(2)}
                                    </td>
                                    <td className="border border-slate-200 px-1 py-0.5">
                                        {(d.nombre_producto || d.productos?.nombre || '').toUpperCase()}
                                    </td>
                                    <td className="border border-slate-200 px-1 py-0.5 text-center">
                                        {ivaRate > 0 ? `${ivaRate}%` : 'NO'}
                                    </td>
                                    <td className="border border-slate-200 px-1 py-0.5 text-right">
                                        {dcto.toFixed(2)}
                                    </td>
                                    <td className="border border-slate-200 px-1 py-0.5 text-right">
                                        {dctoVal.toFixed(2)}
                                    </td>
                                    <td className="border border-slate-200 px-1 py-0.5 text-right">
                                        {fmt4(d.precio_unitario)}
                                    </td>
                                    <td className="border border-slate-200 px-1 py-0.5 text-right font-semibold">
                                        {fmt2(d.subtotal)}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>

                {/* ── INFORMACIÓN ADICIONAL + TOTALES ── */}
                <table className="w-full border-collapse border border-t-0 border-slate-400">
                    <tbody>
                        <tr>
                            {/* INFO ADICIONAL + FORMA DE PAGO */}
                            <td className="border-r border-slate-400 p-2 align-top w-[55%]">
                                <p className="font-bold text-[8.5px] uppercase mb-1 border-b border-slate-300 pb-0.5">
                                    Información Adicional
                                </p>
                                <div className="space-y-0.5 text-[9px]">
                                    {cliente.direccion && (
                                        <div>
                                            <span className="font-bold">Dirección </span>
                                            <span>{cliente.direccion}</span>
                                        </div>
                                    )}
                                    {cliente.telefono && (
                                        <div>
                                            <span className="font-bold">Teléfono </span>
                                            <span>{cliente.telefono}</span>
                                        </div>
                                    )}
                                    {cliente.email && (
                                        <div>
                                            <span className="font-bold">Email </span>
                                            <span>{cliente.email}</span>
                                        </div>
                                    )}
                                    {factura.observacion && (
                                        <div>
                                            <span className="font-bold">Observación </span>
                                            <span>{factura.observacion}</span>
                                        </div>
                                    )}
                                </div>

                                {avisoLopdp && (
                                    <div className="mt-2 pt-1 border-t border-slate-200">
                                        <p className="font-bold text-[7.5px] uppercase text-slate-500">Aviso de Privacidad (LOPDP)</p>
                                        <p className="text-[7.5px] text-slate-500 leading-snug">{avisoLopdp}</p>
                                    </div>
                                )}

                                {pagos.length > 0 && (
                                    <div className="mt-2">
                                        <p className="font-bold text-[8.5px] uppercase mb-1 border-b border-slate-300 pb-0.5">
                                            Forma de Pago
                                        </p>
                                        <table className="w-full text-[9px]">
                                            <thead>
                                                <tr className="bg-slate-100 text-[8.5px]">
                                                    <th className="border border-slate-200 px-1 py-0.5 text-left font-bold">Forma Pago</th>
                                                    <th className="border border-slate-200 px-1 py-0.5 text-right font-bold">Monto</th>
                                                    <th className="border border-slate-200 px-1 py-0.5 text-right font-bold">Días Plazo</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {pagos.map((p: any, i: number) => (
                                                    <tr key={i}>
                                                        <td className="border border-slate-200 px-1 py-0.5">
                                                            {labelPago[p.metodo_pago] || (p.metodo_pago || '').toUpperCase().replace(/_/g, ' ')}
                                                        </td>
                                                        <td className="border border-slate-200 px-1 py-0.5 text-right">
                                                            {Number(p.valor).toFixed(2)}
                                                        </td>
                                                        <td className="border border-slate-200 px-1 py-0.5 text-right">
                                                            {p.dias_plazo ?? p.plazo ?? 0}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </td>

                            {/* TOTALES */}
                            <td className="p-2 align-top w-[45%]">
                                <table className="w-full text-[9px]">
                                    <tbody>
                                        {/* Base IVA X% — una fila por cada tasa con IVA */}
                                        {ratesConIva.map(rate => (
                                            <tr key={`base-${rate}`}>
                                                <td className="border border-slate-200 px-1 py-0.5 font-bold">
                                                    SUBTOTAL BASE IVA {rate} %
                                                </td>
                                                <td className="border border-slate-200 px-1 py-0.5 text-right">
                                                    {fmt2(ivaBreakdown[rate]?.base)}
                                                </td>
                                            </tr>
                                        ))}

                                        {/* Subtotal 0% — siempre visible */}
                                        <tr>
                                            <td className="border border-slate-200 px-1 py-0.5 font-bold">SUBTOTAL 0%</td>
                                            <td className="border border-slate-200 px-1 py-0.5 text-right">
                                                {fmt2(ivaBreakdown['0']?.base)}
                                            </td>
                                        </tr>

                                        <tr>
                                            <td className="border border-slate-200 px-1 py-0.5 font-bold">SUBTOTAL No sujeto de IVA</td>
                                            <td className="border border-slate-200 px-1 py-0.5 text-right">0.00</td>
                                        </tr>

                                        <tr>
                                            <td className="border border-slate-200 px-1 py-0.5 font-bold">DESCUENTO</td>
                                            <td className="border border-slate-200 px-1 py-0.5 text-right">
                                                {fmt2(totalDescuento)}
                                            </td>
                                        </tr>

                                        <tr>
                                            <td className="border border-slate-200 px-1 py-0.5 font-bold">SUBTOTAL SIN IMPUESTOS</td>
                                            <td className="border border-slate-200 px-1 py-0.5 text-right">
                                                {fmt2(subtotalSinImpuestos)}
                                            </td>
                                        </tr>

                                        <tr>
                                            <td className="border border-slate-200 px-1 py-0.5 font-bold">ICE</td>
                                            <td className="border border-slate-200 px-1 py-0.5 text-right">0.00</td>
                                        </tr>

                                        {/* IVA X% — una fila por cada tasa con IVA */}
                                        {ratesConIva.map(rate => (
                                            <tr key={`iva-${rate}`}>
                                                <td className="border border-slate-200 px-1 py-0.5 font-bold">
                                                    IVA {rate} %
                                                </td>
                                                <td className="border border-slate-200 px-1 py-0.5 text-right">
                                                    {fmt2(ivaBreakdown[rate]?.iva)}
                                                </td>
                                            </tr>
                                        ))}

                                        <tr>
                                            <td className="border border-slate-200 px-1 py-0.5 font-bold">PROPINA</td>
                                            <td className="border border-slate-200 px-1 py-0.5 text-right">0.00</td>
                                        </tr>

                                        <tr className="bg-slate-100">
                                            <td className="border border-slate-400 px-2 py-1 font-black text-[11px]">VALOR TOTAL</td>
                                            <td className="border border-slate-400 px-2 py-1 text-right font-black text-[11px]">
                                                {fmt2(valorTotal)}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </td>
                        </tr>
                    </tbody>
                </table>

                {/* ── FOOTER ── */}
                <div className="border border-t-0 border-slate-400 px-2 py-1 flex justify-between items-center">
                    <p className="text-[8px] text-slate-400">
                        Este documento es una representación impresa de un Comprobante Electrónico (RIDE)
                    </p>
                    <p className="text-[9px] font-bold text-slate-600">www.billenniumsystem.com</p>
                </div>

            </div>
        </>
    )
}
