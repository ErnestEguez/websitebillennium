import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ncService } from '../services/ncService'
import { format } from 'date-fns'
import { Loader2, Printer, ChevronLeft, Download } from 'lucide-react'

const r2 = (n: unknown) => Number(Number(n ?? 0).toFixed(2))
const fmt2 = (n: unknown) => r2(n).toFixed(2)
const fmt4 = (n: unknown) => Number(n ?? 0).toFixed(4)

export function NcRidePage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [nc, setNc] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => { if (id) loadNc() }, [id])

    async function loadNc() {
        try {
            setLoading(true)
            setNc(await ncService.getNcConDetalles(id!))
        } catch (err) {
            console.error('Error cargando NC para RIDE:', err)
        } finally {
            setLoading(false)
        }
    }

    if (loading) return (
        <div className="flex flex-col items-center justify-center p-24 gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-orange-500" />
            <p className="text-slate-500 font-medium">Generando RIDE...</p>
        </div>
    )
    if (!nc) return <div className="p-12 text-center text-red-500">No se encontró la nota de crédito.</div>

    const empresa  = nc.empresas  || {}
    const cliente  = nc.clientes  || {}
    const detalles: any[] = nc.notas_credito_detalle || []
    const origen   = nc.comprobante_origen || {}

    // ── Totales agrupados por tasa IVA ──────────────────────────────────────────
    const ivaBreakdown: Record<string, { base: number; iva: number }> = {}
    let totalDescuento = 0
    detalles.forEach((d) => {
        const rate = String(d.iva_porcentaje ?? 0)
        const base = r2(d.subtotal)
        const iva  = r2(d.iva_valor ?? (base * Number(rate) / 100))
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
    const valorTotal           = r2(nc.total ?? (subtotalSinImpuestos + totalIvaAll))

    const fechaEmision = nc.created_at
    const ambiente = nc.ambiente || empresa.config_sri?.ambiente || 'PRODUCCION'

    // Fecha origen en hora Ecuador (UTC-5)
    const fechaOrigenFmt = origen.created_at
        ? format(new Date(new Date(origen.created_at).getTime() - 5 * 60 * 60 * 1000), 'dd/MM/yyyy')
        : '—'

    return (
        <>
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
                    <button onClick={() => ncService.descargarXmlNC(nc.id, nc.secuencial)}
                        disabled={!nc.xml_firmado}
                        className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-white transition-colors disabled:opacity-40">
                        <Download className="w-4 h-4" /> XML
                    </button>
                </div>
            </div>

            {/* ══════════════════════ RIDE DOCUMENT ══════════════════════ */}
            <div className="max-w-4xl mx-auto bg-white shadow-2xl print:shadow-none print:max-w-none text-[9.5px] leading-snug font-sans p-6 print:p-0">

                {/* ── CABECERA: EMPRESA | NOTA DE CRÉDITO ── */}
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

                            {/* Info NOTA DE CRÉDITO */}
                            <td className="border border-l-0 border-slate-400 p-0 w-[45%] align-top">
                                <table className="w-full border-collapse text-center">
                                    <tbody>
                                        <tr>
                                            <td className="border-b border-slate-400 p-1">
                                                <span className="font-bold">R.U.C.: </span>{empresa.ruc}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="border-b border-slate-400 p-1 bg-orange-50">
                                                <p className="font-black text-[13px] text-orange-700">NOTA DE CRÉDITO</p>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="border-b border-slate-400 p-1">
                                                No. {nc.secuencial}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="border-b border-slate-400 p-1 text-left">
                                                <p className="font-bold text-[8.5px]">NÚMERO DE AUTORIZACIÓN</p>
                                                <p className="font-mono text-[7.5px] break-all mt-0.5">
                                                    {nc.autorizacion_numero || nc.clave_acceso || '—'}
                                                </p>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="border-b border-slate-400 p-1 text-left">
                                                <div className="flex justify-between">
                                                    <span className="font-bold text-[8.5px]">FECHA Y HORA DE AUTORIZACIÓN</span>
                                                    <span className="font-mono text-[8px]">
                                                        {nc.fecha_autorizacion
                                                            ? format(new Date(nc.fecha_autorizacion), "yyyy-MM-dd HH:mm:ss")
                                                            : nc.estado_sri || 'PENDIENTE'}
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="p-1 text-left">
                                                <div className="flex justify-between">
                                                    <span className="font-bold text-[8.5px]">AMBIENTE:</span>
                                                    <span>{ambiente.toUpperCase()}</span>
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
                        <p className="font-mono text-[8px] break-all">{nc.clave_acceso}</p>
                    </div>
                    {nc.clave_acceso && (
                        <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${nc.clave_acceso}`}
                            alt="QR Clave de Acceso"
                            className="w-20 h-20 flex-shrink-0"
                        />
                    )}
                </div>

                {/* ── DATOS DEL ADQUIRIENTE ── */}
                <div className="border border-t-0 border-slate-400 p-1.5 grid grid-cols-4 gap-x-3 gap-y-0.5">
                    <div className="col-span-2">
                        <span className="font-bold">Razón Social: </span>
                        <span>{(cliente.nombre || 'CONSUMIDOR FINAL').toUpperCase()}</span>
                    </div>
                    <div>
                        <span className="font-bold">Fecha Emisión: </span>
                        <span>
                            {fechaEmision
                                ? format(new Date(new Date(fechaEmision).getTime() - 5 * 60 * 60 * 1000), 'dd/MM/yyyy')
                                : '—'}
                        </span>
                    </div>
                    <div>
                        <span className="font-bold">RUC / CI: </span>
                        <span>{cliente.identificacion || '9999999999999'}</span>
                    </div>
                    {cliente.direccion && (
                        <div className="col-span-4">
                            <span className="font-bold">Dirección: </span>
                            <span>{cliente.direccion}</span>
                        </div>
                    )}
                </div>

                {/* ── COMPROBANTE QUE MODIFICA ── */}
                <div className="border border-t-0 border-slate-400 p-1.5 bg-orange-50/50">
                    <div className="grid grid-cols-4 gap-x-3 gap-y-0.5">
                        <div>
                            <span className="font-bold">Tipo Comprobante: </span>
                            <span>FACTURA</span>
                        </div>
                        <div>
                            <span className="font-bold">Serie y Nro.: </span>
                            <span className="font-mono">{origen.secuencial || '—'}</span>
                        </div>
                        <div>
                            <span className="font-bold">Fecha Emisión: </span>
                            <span>{fechaOrigenFmt}</span>
                        </div>
                        <div>
                            <span className="font-bold">Motivo: </span>
                            <span>{nc.motivo_descripcion || nc.tipo_nc || '—'}</span>
                        </div>
                    </div>
                </div>

                {/* ── TABLA DETALLES ── */}
                <table className="w-full border-collapse border border-t-0 border-slate-400 text-[9px]">
                    <thead>
                        <tr className="bg-slate-100 text-[8.5px]">
                            <th className="border border-slate-300 px-1 py-1 text-left font-bold whitespace-nowrap">Cod. Principal</th>
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
                                    <td className="border border-slate-200 px-1 py-0.5 text-right">
                                        {Number(d.cantidad).toFixed(2)}
                                    </td>
                                    <td className="border border-slate-200 px-1 py-0.5">
                                        {(d.nombre_producto || '').toUpperCase()}
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
                            {/* INFO ADICIONAL */}
                            <td className="border-r border-slate-400 p-2 align-top w-[55%]">
                                <p className="font-bold text-[8.5px] uppercase mb-1 border-b border-slate-300 pb-0.5">
                                    Información Adicional
                                </p>
                                <div className="space-y-0.5 text-[9px]">
                                    {cliente.email && (
                                        <div><span className="font-bold">Email </span><span>{cliente.email}</span></div>
                                    )}
                                    {cliente.telefono && (
                                        <div><span className="font-bold">Teléfono </span><span>{cliente.telefono}</span></div>
                                    )}
                                    {nc.tipo_nc && (
                                        <div><span className="font-bold">Tipo NC </span><span>{nc.tipo_nc}</span></div>
                                    )}
                                    {nc.motivo_sri && (
                                        <div><span className="font-bold">Motivo SRI </span><span>{nc.motivo_sri}</span></div>
                                    )}
                                    {nc.saldo_nc != null && (
                                        <div><span className="font-bold">Saldo NC </span><span>${fmt2(nc.saldo_nc)}</span></div>
                                    )}
                                </div>
                            </td>

                            {/* TOTALES */}
                            <td className="p-2 align-top w-[45%]">
                                <table className="w-full text-[9px]">
                                    <tbody>
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
                                            <td className="border border-slate-200 px-1 py-0.5 text-right">{fmt2(totalDescuento)}</td>
                                        </tr>
                                        <tr>
                                            <td className="border border-slate-200 px-1 py-0.5 font-bold">SUBTOTAL SIN IMPUESTOS</td>
                                            <td className="border border-slate-200 px-1 py-0.5 text-right">{fmt2(subtotalSinImpuestos)}</td>
                                        </tr>
                                        <tr>
                                            <td className="border border-slate-200 px-1 py-0.5 font-bold">ICE</td>
                                            <td className="border border-slate-200 px-1 py-0.5 text-right">0.00</td>
                                        </tr>
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
                                        <tr className="bg-orange-50">
                                            <td className="border border-slate-400 px-2 py-1 font-black text-[11px]">VALOR NC</td>
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
                        Este documento es una representación impresa de una Nota de Crédito Electrónica (RIDE)
                    </p>
                    <p className="text-[9px] font-bold text-slate-600">www.billenniumsystem.com</p>
                </div>

            </div>
        </>
    )
}
