import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { format } from 'date-fns'
import { Loader2, Printer, ChevronLeft, Download } from 'lucide-react'

const fmt2 = (n: unknown) => Number(Number(n ?? 0).toFixed(2)).toFixed(2)

interface Linea {
    tipo:             string
    codigo_retencion: string
    descripcion:      string
    base_imponible:   number
    porcentaje:       number
    valor:            number
}

export function RetencionRidePage() {
    const { compra_id }    = useParams()
    const [searchParams]   = useSearchParams()
    const esLC             = searchParams.get('tipo') === 'lc'
    const navigate         = useNavigate()
    const { empresa }      = useAuth()
    const [datos, setDatos]   = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (compra_id && empresa?.id) loadDatos()
    }, [compra_id, empresa?.id, esLC])

    async function loadDatos() {
        try {
            setLoading(true)

            let q = supabase
                .from('retenciones_compras')
                .select(`
                    compra_id, liquidacion_id, numero_retencion, fecha_emision,
                    tipo, codigo_retencion, descripcion,
                    base_imponible, porcentaje, valor,
                    estado, numero_autorizacion, fecha_autorizacion,
                    estado_sri, clave_acceso, xml_firmado,
                    compra:ingresos_stock!compra_id(numero_factura, fecha_emision),
                    lc:liquidaciones_compra!liquidacion_id(establecimiento, punto_emision, secuencial, fecha_emision),
                    proveedor:proveedores(nombre_empresa, ruc, telefono, correo, direccion)
                `)
                .eq('empresa_id', empresa!.id)
                .order('tipo', { ascending: true })

            q = esLC
                ? q.eq('liquidacion_id', compra_id!)
                : q.eq('compra_id', compra_id!)

            const { data, error } = await q
            if (error) throw error

            const rows = data ?? []
            if (rows.length === 0) { setDatos(null); return }

            const meta = rows[0] as any
            const lineas: Linea[] = rows.map((r: any) => ({
                tipo:             r.tipo,
                codigo_retencion: r.codigo_retencion,
                descripcion:      r.descripcion ?? '',
                base_imponible:   Number(r.base_imponible),
                porcentaje:       Number(r.porcentaje),
                valor:            Number(r.valor),
            }))

            // Calcular número y fecha del documento sustento
            let sustentoNumero = ''
            let sustentoFecha  = ''
            if (esLC && meta.lc) {
                sustentoNumero = `${meta.lc.establecimiento}-${meta.lc.punto_emision}-${meta.lc.secuencial}`
                sustentoFecha  = meta.lc.fecha_emision
            } else if (meta.compra) {
                sustentoNumero = meta.compra.numero_factura ?? ''
                sustentoFecha  = meta.compra.fecha_emision
            }

            setDatos({
                numero_retencion:    meta.numero_retencion,
                fecha_emision:       meta.fecha_emision,
                numero_autorizacion: meta.numero_autorizacion,
                fecha_autorizacion:  meta.fecha_autorizacion,
                estado_sri:          meta.estado_sri,
                clave_acceso:        meta.clave_acceso,
                xml_firmado:         meta.xml_firmado,
                sustento_numero:     sustentoNumero,
                sustento_fecha:      sustentoFecha,
                es_lc:               esLC,
                proveedor:           meta.proveedor,
                lineas,
            })
        } catch (e: any) {
            console.error('Error cargando retención para RIDE:', e)
            setDatos(null)
        } finally {
            setLoading(false)
        }
    }

    function descargarXml() {
        if (!datos?.xml_firmado) return
        const blob = new Blob([datos.xml_firmado], { type: 'application/xml' })
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a')
        a.href     = url
        a.download = `RET-${datos.numero_retencion ?? compra_id}.xml`
        a.click()
        URL.revokeObjectURL(url)
    }

    if (loading) return (
        <div className="flex flex-col items-center justify-center p-24 gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-amber-500" />
            <p className="text-slate-500 font-medium">Generando RIDE...</p>
        </div>
    )
    if (!datos) return <div className="p-12 text-center text-red-500">No se encontró el comprobante de retención.</div>

    const proveedor = datos.proveedor || {}
    const lineas: Linea[] = datos.lineas
    const totalRetenido = lineas.reduce((s, l) => s + l.valor, 0)

    // Período fiscal: MM/YYYY de la fecha de emisión
    const [fy, fm] = (datos.fecha_emision || '').split('-')
    const periodoFiscal = fm && fy ? `${fm}/${fy}` : '—'

    // Separar líneas por tipo para el resumen
    const lineasFuente = lineas.filter(l => l.tipo === 'FUENTE')
    const lineasIva    = lineas.filter(l => l.tipo === 'IVA')

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
                    {datos.xml_firmado && (
                        <button onClick={descargarXml}
                            className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-white transition-colors">
                            <Download className="w-4 h-4" /> XML
                        </button>
                    )}
                </div>
            </div>

            {/* ══════════════════════ RIDE DOCUMENT ══════════════════════ */}
            <div className="max-w-4xl mx-auto bg-white shadow-2xl print:shadow-none print:max-w-none text-[9.5px] leading-snug font-sans p-6 print:p-0">

                {/* ── CABECERA: EMPRESA | COMPROBANTE DE RETENCIÓN ── */}
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
                                <p className="mt-1">Dir Matriz: {(empresa as any)?.direccion}</p>
                                {(empresa as any)?.telefono && <p>Telf. {(empresa as any).telefono}</p>}
                                <p className="mt-1 font-semibold">
                                    OBLIGADO A LLEVAR CONTABILIDAD {(empresa as any)?.obligado_contabilidad ? 'SI' : 'NO'}
                                </p>
                            </td>

                            {/* Info COMPROBANTE DE RETENCIÓN */}
                            <td className="border border-l-0 border-slate-400 p-0 w-[45%] align-top">
                                <table className="w-full border-collapse text-center">
                                    <tbody>
                                        <tr>
                                            <td className="border-b border-slate-400 p-1">
                                                <span className="font-bold">R.U.C.: </span>{(empresa as any)?.ruc}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="border-b border-slate-400 p-1 bg-amber-50">
                                                <p className="font-black text-[11px] text-amber-800">COMPROBANTE DE RETENCIÓN</p>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="border-b border-slate-400 p-1">
                                                No. {datos.numero_retencion || '—'}
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
                                                            ? format(new Date(datos.fecha_autorizacion), "yyyy-MM-dd HH:mm:ss")
                                                            : datos.estado_sri || 'PENDIENTE'}
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="p-1 text-left">
                                                <div className="flex justify-between">
                                                    <span className="font-bold text-[8.5px]">AMBIENTE:</span>
                                                    <span>{((empresa as any)?.config_sri?.ambiente || 'PRODUCCION').toUpperCase()}</span>
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
                        <p className="font-mono text-[8px] break-all">{datos.clave_acceso || '—'}</p>
                    </div>
                    {datos.clave_acceso && (
                        <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${datos.clave_acceso}`}
                            alt="QR Clave de Acceso"
                            className="w-20 h-20 flex-shrink-0"
                        />
                    )}
                </div>

                {/* ── DATOS DEL SUJETO RETENIDO ── */}
                <div className="border border-t-0 border-slate-400 p-1.5">
                    <div className="grid grid-cols-4 gap-x-3 gap-y-0.5">
                        <div className="col-span-2">
                            <span className="font-bold">Razón Social: </span>
                            <span>{(proveedor.nombre_empresa || '').toUpperCase()}</span>
                        </div>
                        <div>
                            <span className="font-bold">Fecha Emisión: </span>
                            <span>{datos.fecha_emision
                                ? format(new Date(datos.fecha_emision + 'T12:00:00'), 'dd/MM/yyyy')
                                : '—'}</span>
                        </div>
                        <div>
                            <span className="font-bold">RUC: </span>
                            <span>{proveedor.ruc || '—'}</span>
                        </div>
                        <div className="col-span-2">
                            <span className="font-bold">Período Fiscal: </span>
                            <span>{periodoFiscal}</span>
                        </div>
                        {proveedor.direccion && (
                            <div className="col-span-2">
                                <span className="font-bold">Dirección: </span>
                                <span>{proveedor.direccion}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── COMPROBANTE SUSTENTO ── */}
                <div className="border border-t-0 border-slate-400 p-1.5 bg-amber-50/40">
                    <div className="grid grid-cols-3 gap-x-3">
                        <div>
                            <span className="font-bold">Tipo Comprobante Sustento: </span>
                            <span>{datos.es_lc ? 'LIQUIDACIÓN DE COMPRA' : 'FACTURA'}</span>
                        </div>
                        <div>
                            <span className="font-bold">Nro. Sustento: </span>
                            <span className="font-mono">{datos.sustento_numero || '—'}</span>
                        </div>
                        <div>
                            <span className="font-bold">Fecha Emisión Doc.: </span>
                            <span>{datos.sustento_fecha
                                ? format(new Date(datos.sustento_fecha + 'T12:00:00'), 'dd/MM/yyyy')
                                : '—'}</span>
                        </div>
                    </div>
                </div>

                {/* ── TABLA DE RETENCIONES ── */}
                <table className="w-full border-collapse border border-t-0 border-slate-400 text-[9px]">
                    <thead>
                        <tr className="bg-slate-100 text-[8.5px]">
                            <th className="border border-slate-300 px-1 py-1 text-left font-bold">Tipo</th>
                            <th className="border border-slate-300 px-1 py-1 text-left font-bold whitespace-nowrap">Código de Retención</th>
                            <th className="border border-slate-300 px-1 py-1 text-left font-bold">Descripción</th>
                            <th className="border border-slate-300 px-1 py-1 text-right font-bold whitespace-nowrap">Base Imponible</th>
                            <th className="border border-slate-300 px-1 py-1 text-right font-bold whitespace-nowrap">% de Retención</th>
                            <th className="border border-slate-300 px-1 py-1 text-right font-bold whitespace-nowrap">Valor Retenido</th>
                        </tr>
                    </thead>
                    <tbody>
                        {/* Fuente primero, IVA después */}
                        {[...lineasFuente, ...lineasIva].map((l, i) => (
                            <tr key={i} className={i % 2 === 0 ? '' : 'bg-slate-50'}>
                                <td className="border border-slate-200 px-1 py-0.5">
                                    <span className={`px-1 py-0.5 rounded text-[8px] font-semibold ${
                                        l.tipo === 'FUENTE'
                                            ? 'bg-blue-100 text-blue-700'
                                            : 'bg-purple-100 text-purple-700'
                                    }`}>{l.tipo}</span>
                                </td>
                                <td className="border border-slate-200 px-1 py-0.5 font-mono font-bold">
                                    {l.codigo_retencion}
                                </td>
                                <td className="border border-slate-200 px-1 py-0.5">
                                    {l.descripcion.toUpperCase()}
                                </td>
                                <td className="border border-slate-200 px-1 py-0.5 text-right font-mono">
                                    {fmt2(l.base_imponible)}
                                </td>
                                <td className="border border-slate-200 px-1 py-0.5 text-right font-mono">
                                    {l.porcentaje.toFixed(2)}%
                                </td>
                                <td className="border border-slate-200 px-1 py-0.5 text-right font-mono font-bold text-amber-800">
                                    {fmt2(l.valor)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* ── RESUMEN + TOTAL ── */}
                <table className="w-full border-collapse border border-t-0 border-slate-400">
                    <tbody>
                        <tr>
                            {/* Info adicional */}
                            <td className="border-r border-slate-400 p-2 align-top w-[55%]">
                                <p className="font-bold text-[8.5px] uppercase mb-1 border-b border-slate-300 pb-0.5">
                                    Información Adicional
                                </p>
                                <div className="space-y-0.5 text-[9px]">
                                    {proveedor.correo && (
                                        <div><span className="font-bold">Email </span><span>{proveedor.correo}</span></div>
                                    )}
                                    {proveedor.telefono && (
                                        <div><span className="font-bold">Teléfono </span><span>{proveedor.telefono}</span></div>
                                    )}
                                    <div>
                                        <span className="font-bold">Líneas Retención Fuente </span>
                                        <span>{lineasFuente.length}</span>
                                    </div>
                                    {lineasIva.length > 0 && (
                                        <div>
                                            <span className="font-bold">Líneas Retención IVA </span>
                                            <span>{lineasIva.length}</span>
                                        </div>
                                    )}
                                </div>
                            </td>

                            {/* Totales */}
                            <td className="p-2 align-top w-[45%]">
                                <table className="w-full text-[9px]">
                                    <tbody>
                                        {lineasFuente.length > 0 && (
                                            <tr>
                                                <td className="border border-slate-200 px-1 py-0.5 font-bold">TOTAL RETENCIÓN FUENTE</td>
                                                <td className="border border-slate-200 px-1 py-0.5 text-right font-mono">
                                                    {fmt2(lineasFuente.reduce((s, l) => s + l.valor, 0))}
                                                </td>
                                            </tr>
                                        )}
                                        {lineasIva.length > 0 && (
                                            <tr>
                                                <td className="border border-slate-200 px-1 py-0.5 font-bold">TOTAL RETENCIÓN IVA</td>
                                                <td className="border border-slate-200 px-1 py-0.5 text-right font-mono">
                                                    {fmt2(lineasIva.reduce((s, l) => s + l.valor, 0))}
                                                </td>
                                            </tr>
                                        )}
                                        <tr className="bg-amber-50">
                                            <td className="border border-slate-400 px-2 py-1 font-black text-[11px]">TOTAL RETENIDO</td>
                                            <td className="border border-slate-400 px-2 py-1 text-right font-black text-[11px] font-mono">
                                                {fmt2(totalRetenido)}
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
                        Este documento es una representación impresa de un Comprobante de Retención Electrónico (RIDE)
                    </p>
                    <p className="text-[9px] font-bold text-slate-600">www.billenniumsystem.com</p>
                </div>

            </div>
        </>
    )
}
