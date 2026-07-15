import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { format } from 'date-fns'
import { Loader2, Printer, ChevronLeft, Download } from 'lucide-react'

const fmt2 = (n: unknown) => Number(Number(n ?? 0).toFixed(2)).toFixed(2)

export function LiquidacionCompraRidePage() {
    const { id }       = useParams()
    const navigate     = useNavigate()
    const { empresa }  = useAuth()
    const [datos, setDatos]     = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (id && empresa?.id) loadDatos()
    }, [id, empresa?.id])

    async function loadDatos() {
        try {
            setLoading(true)
            const { data: lc, error } = await supabase
                .from('liquidaciones_compra')
                .select(`
                    *,
                    detalles:liquidacion_compra_detalles(*)
                `)
                .eq('id', id!)
                .single()
            if (error) throw error
            setDatos(lc)
        } catch (e: any) {
            console.error('Error cargando LC para RIDE:', e)
            setDatos(null)
        } finally {
            setLoading(false)
        }
    }

    function descargarXml() {
        if (!datos?.xml_firmado) return
        const numLC = `${datos.establecimiento}-${datos.punto_emision}-${datos.secuencial}`
        const blob  = new Blob([datos.xml_firmado], { type: 'application/xml' })
        const url   = URL.createObjectURL(blob)
        const a     = document.createElement('a')
        a.href      = url
        a.download  = `LC-${numLC}.xml`
        a.click()
        URL.revokeObjectURL(url)
    }

    if (loading) return (
        <div className="flex flex-col items-center justify-center p-24 gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary-500" />
            <p className="text-slate-500 font-medium">Generando RIDE...</p>
        </div>
    )
    if (!datos) return (
        <div className="p-12 text-center text-red-500">No se encontró la liquidación de compra.</div>
    )

    const numLC    = `${datos.establecimiento}-${datos.punto_emision}-${datos.secuencial}`
    const detalles = datos.detalles ?? []
    const ambiente = (empresa as any)?.config_sri?.ambiente || 'PRODUCCION'

    return (
        <>
            <style>{`
                @media print {
                    @page { margin: 0; size: A4 portrait; }
                    html, body { padding: 8mm 10mm !important; box-sizing: border-box; }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                }
            `}</style>

            {/* TOOLBAR */}
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
                    {datos.xml_firmado && (
                        <button onClick={descargarXml}
                            className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-white transition-colors">
                            <Download className="w-4 h-4" /> XML
                        </button>
                    )}
                </div>
            </div>

            {/* RIDE DOCUMENT */}
            <div className="max-w-4xl mx-auto bg-white shadow-2xl print:shadow-none print:max-w-none text-[9.5px] leading-snug font-sans p-6 print:p-0">

                {/* CABECERA */}
                <table className="w-full border-collapse">
                    <tbody>
                        <tr>
                            {/* Empresa */}
                            <td className="border border-slate-400 p-2 w-[55%] align-top">
                                {(empresa as any)?.logo_url && (
                                    <img src={(empresa as any).logo_url} alt="Logo"
                                        className="h-16 max-w-[180px] object-contain mb-2"
                                        style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as any}
                                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                                    />
                                )}
                                <p className="font-black text-[12px]">
                                    {((empresa as any)?.razon_social || (empresa as any)?.nombre || '').toUpperCase()}
                                </p>
                                <p className="mt-0.5">Dir Matriz: {(empresa as any)?.direccion}</p>
                                {(empresa as any)?.telefono && <p>Telf. {(empresa as any).telefono}</p>}
                                <p className="mt-1 font-semibold">
                                    OBLIGADO A LLEVAR CONTABILIDAD: {(empresa as any)?.config_sri?.obligado_contabilidad || 'NO'}
                                </p>
                            </td>

                            {/* Info del comprobante */}
                            <td className="border border-l-0 border-slate-400 p-0 w-[45%] align-top">
                                <table className="w-full border-collapse text-center">
                                    <tbody>
                                        <tr>
                                            <td className="border-b border-slate-400 p-1">
                                                <span className="font-bold">R.U.C.: </span>{(empresa as any)?.ruc}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="border-b border-slate-400 p-1 bg-blue-50">
                                                <p className="font-black text-[11px] text-blue-800">LIQUIDACIÓN DE COMPRA</p>
                                                <p className="font-black text-[11px] text-blue-800">DE BIENES Y PRESTACIÓN DE SERVICIOS</p>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="border-b border-slate-400 p-1 font-bold">
                                                No. {numLC}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="border-b border-slate-400 p-1 text-left">
                                                <p className="font-bold text-[8.5px]">NÚMERO DE AUTORIZACIÓN</p>
                                                <p className="font-mono text-[7.5px] break-all mt-0.5">
                                                    {datos.numero_autorizacion || datos.clave_acceso || '—'}
                                                </p>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="border-b border-slate-400 p-1 text-left">
                                                <div className="flex justify-between">
                                                    <span className="font-bold text-[8.5px]">FECHA Y HORA DE AUTORIZACIÓN</span>
                                                    <span className="font-mono text-[8px]">
                                                        {datos.fecha_autorizacion
                                                            ? format(new Date(datos.fecha_autorizacion), 'yyyy-MM-dd HH:mm:ss')
                                                            : datos.estado_sri || 'PENDIENTE'}
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

                {/* CLAVE DE ACCESO */}
                <div className="border border-t-0 border-slate-400 p-2 flex items-center gap-4">
                    <div className="flex-1">
                        <p className="font-bold text-[8.5px] mb-0.5">CLAVE DE ACCESO</p>
                        <p className="font-mono text-[8px] break-all">{datos.clave_acceso || '—'}</p>
                    </div>
                    {datos.clave_acceso && (
                        <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${datos.clave_acceso}`}
                            alt="QR"
                            className="w-20 h-20 flex-shrink-0"
                        />
                    )}
                </div>

                {/* DATOS DEL BENEFICIARIO */}
                <div className="border border-t-0 border-slate-400 p-1.5">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                        <div className="col-span-2">
                            <span className="font-bold">Nombres y Apellidos / Razón Social: </span>
                            <span>{(datos.beneficiario_nombre || '').toUpperCase()}</span>
                        </div>
                        <div>
                            <span className="font-bold">Tipo Identificación: </span>
                            <span>{datos.beneficiario_tipo_id || '—'}</span>
                        </div>
                        <div>
                            <span className="font-bold">RUC/CI: </span>
                            <span className="font-mono">{datos.beneficiario_identificacion || '—'}</span>
                        </div>
                        <div>
                            <span className="font-bold">Fecha Emisión: </span>
                            <span>{datos.fecha_emision
                                ? format(new Date(datos.fecha_emision + 'T12:00:00'), 'dd/MM/yyyy')
                                : '—'}</span>
                        </div>
                        {datos.beneficiario_direccion && (
                            <div>
                                <span className="font-bold">Dirección: </span>
                                <span>{datos.beneficiario_direccion}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* TABLA DE DETALLES */}
                <table className="w-full border-collapse border border-t-0 border-slate-400 text-[9px]">
                    <thead>
                        <tr className="bg-slate-100 text-[8.5px]">
                            <th className="border border-slate-300 px-1 py-1 text-left font-bold">Cod. Principal</th>
                            <th className="border border-slate-300 px-1 py-1 text-left font-bold">Descripción</th>
                            <th className="border border-slate-300 px-1 py-1 text-right font-bold">Cant.</th>
                            <th className="border border-slate-300 px-1 py-1 text-right font-bold">Precio Unitario</th>
                            <th className="border border-slate-300 px-1 py-1 text-right font-bold">Dcto.</th>
                            <th className="border border-slate-300 px-1 py-1 text-right font-bold">Precio Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {detalles.map((d: any, i: number) => (
                            <tr key={d.id ?? i} className={i % 2 === 0 ? '' : 'bg-slate-50'}>
                                <td className="border border-slate-200 px-1 py-0.5 font-mono">
                                    {String(i + 1).padStart(3, '0')}
                                </td>
                                <td className="border border-slate-200 px-1 py-0.5">
                                    {(d.descripcion || '').toUpperCase()}
                                </td>
                                <td className="border border-slate-200 px-1 py-0.5 text-right font-mono">
                                    {Number(d.cantidad).toFixed(2)}
                                </td>
                                <td className="border border-slate-200 px-1 py-0.5 text-right font-mono">
                                    {fmt2(d.precio_unitario)}
                                </td>
                                <td className="border border-slate-200 px-1 py-0.5 text-right font-mono">
                                    {fmt2(Number(d.descuento ?? 0) * Number(d.subtotal) / 100)}
                                </td>
                                <td className="border border-slate-200 px-1 py-0.5 text-right font-mono font-bold">
                                    {fmt2(d.subtotal)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* TOTALES */}
                <table className="w-full border-collapse border border-t-0 border-slate-400">
                    <tbody>
                        <tr>
                            {/* Información adicional */}
                            <td className="border-r border-slate-400 p-2 align-top w-[55%]">
                                <p className="font-bold text-[8.5px] uppercase mb-1 border-b border-slate-300 pb-0.5">
                                    Información Adicional
                                </p>
                                <div className="space-y-0.5 text-[9px]">
                                    {datos.beneficiario_email && (
                                        <div><span className="font-bold">Email: </span><span>{datos.beneficiario_email}</span></div>
                                    )}
                                    {datos.beneficiario_direccion && (
                                        <div><span className="font-bold">Dirección: </span><span>{datos.beneficiario_direccion}</span></div>
                                    )}
                                    {datos.forma_pago && (
                                        <div><span className="font-bold">Forma de Pago: </span><span>{datos.forma_pago}</span></div>
                                    )}
                                    {datos.observaciones && (
                                        <div><span className="font-bold">Observaciones: </span><span>{datos.observaciones}</span></div>
                                    )}
                                </div>
                            </td>

                            {/* Totales */}
                            <td className="p-2 align-top w-[45%]">
                                <table className="w-full text-[9px]">
                                    <tbody>
                                        {datos.base_iva_0 > 0 && (
                                            <tr>
                                                <td className="border border-slate-200 px-1 py-0.5">SUBTOTAL 0%</td>
                                                <td className="border border-slate-200 px-1 py-0.5 text-right font-mono">{fmt2(datos.base_iva_0)}</td>
                                            </tr>
                                        )}
                                        {datos.base_iva_15 > 0 && (
                                            <tr>
                                                <td className="border border-slate-200 px-1 py-0.5">SUBTOTAL 15%</td>
                                                <td className="border border-slate-200 px-1 py-0.5 text-right font-mono">{fmt2(datos.base_iva_15)}</td>
                                            </tr>
                                        )}
                                        <tr>
                                            <td className="border border-slate-200 px-1 py-0.5">SUBTOTAL SIN IMPUESTOS</td>
                                            <td className="border border-slate-200 px-1 py-0.5 text-right font-mono">{fmt2(datos.subtotal)}</td>
                                        </tr>
                                        <tr>
                                            <td className="border border-slate-200 px-1 py-0.5">DESCUENTO</td>
                                            <td className="border border-slate-200 px-1 py-0.5 text-right font-mono">0.00</td>
                                        </tr>
                                        <tr>
                                            <td className="border border-slate-200 px-1 py-0.5">IVA 15%</td>
                                            <td className="border border-slate-200 px-1 py-0.5 text-right font-mono">{fmt2(datos.valor_iva)}</td>
                                        </tr>
                                        {datos.total_retenciones > 0 && (
                                            <tr>
                                                <td className="border border-slate-200 px-1 py-0.5 text-amber-700">RETENCIONES</td>
                                                <td className="border border-slate-200 px-1 py-0.5 text-right font-mono text-amber-700">-{fmt2(datos.total_retenciones)}</td>
                                            </tr>
                                        )}
                                        <tr className="bg-blue-50">
                                            <td className="border border-slate-400 px-2 py-1 font-black text-[11px]">VALOR TOTAL</td>
                                            <td className="border border-slate-400 px-2 py-1 text-right font-black text-[11px] font-mono">
                                                {fmt2(datos.total)}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </td>
                        </tr>
                    </tbody>
                </table>

                {/* FOOTER */}
                <div className="border border-t-0 border-slate-400 px-2 py-1 flex justify-between items-center">
                    <p className="text-[8px] text-slate-400">
                        Este documento es una representación impresa de una Liquidación de Compra Electrónica (RIDE)
                    </p>
                    <p className="text-[9px] font-bold text-slate-600">www.billenniumsystem.com</p>
                </div>

            </div>
        </>
    )
}
