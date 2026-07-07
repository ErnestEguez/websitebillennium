import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { guiaRemisionService } from '../services/guiaRemisionService'
import type { GuiaRemision } from '../services/guiaRemisionService'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { Loader2, Printer, ChevronLeft, Download } from 'lucide-react'

const fmtFecha = (s?: string | null) => {
    if (!s) return '—'
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    return m ? `${m[3]}/${m[2]}/${m[1]}` : s
}

export function GuiaRemisionRidePage() {
    const { id }   = useParams()
    const navigate = useNavigate()
    const [gr,      setGr]      = useState<(GuiaRemision & { empresa?: any }) | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => { if (id) cargar() }, [id])

    async function cargar() {
        try {
            setLoading(true)
            const data = await guiaRemisionService.getCompleta(id!)
            // Join empresa
            const { data: emp } = await supabase
                .from('empresas')
                .select('razon_social, nombre, ruc, direccion, telefono, logo_url, config_sri')
                .eq('id', data.empresa_id)
                .single()
            setGr({ ...data, empresa: emp ?? {} })
        } catch (e) {
            console.error('Error cargando GR:', e)
        } finally {
            setLoading(false)
        }
    }

    function descargarXml() {
        if (!gr?.xml_firmado) return
        const blob = new Blob([gr.xml_firmado], { type: 'application/xml' })
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
        a.download = `GR_${gr.secuencial}.xml`; a.click()
    }

    if (loading) return (
        <div className="flex flex-col items-center justify-center p-24 gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-teal-500" />
            <p className="text-slate-500 font-medium">Generando RIDE...</p>
        </div>
    )
    if (!gr) return <div className="p-12 text-center text-red-500">No se encontró la guía de remisión.</div>

    const empresa  = gr.empresa  || {}
    const detalles = gr.guia_remision_detalles ?? []
    const ambiente = gr.ambiente || empresa.config_sri?.ambiente || 'PRODUCCION'

    const fechaAutorizacionFmt = gr.fecha_autorizacion
        ? format(new Date(gr.fecha_autorizacion), 'yyyy-MM-dd HH:mm:ss')
        : gr.estado_sri || 'PENDIENTE'

    const totalBultos = detalles.reduce((s: number, d: any) => s + Number(d.cantidad ?? 0), 0)

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
                    <button onClick={descargarXml} disabled={!gr.xml_firmado}
                        className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-white transition-colors disabled:opacity-40">
                        <Download className="w-4 h-4" /> XML
                    </button>
                </div>
            </div>

            {/* ══════════════════════ RIDE DOCUMENT ══════════════════════ */}
            <div className="max-w-4xl mx-auto bg-white shadow-2xl print:shadow-none print:max-w-none text-[9.5px] leading-snug font-sans p-6 print:p-0">

                {/* ── CABECERA: EMPRESA | GUÍA DE REMISIÓN ── */}
                <table className="w-full border-collapse">
                    <tbody>
                        <tr>
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
                                    OBLIGADO A LLEVAR CONTABILIDAD {empresa.config_sri?.obligado_contabilidad || 'NO'}
                                </p>
                            </td>

                            <td className="border border-l-0 border-slate-400 p-0 w-[45%] align-top">
                                <table className="w-full border-collapse text-center">
                                    <tbody>
                                        <tr>
                                            <td className="border-b border-slate-400 p-1">
                                                <span className="font-bold">R.U.C.: </span>{empresa.ruc}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="border-b border-slate-400 p-1 bg-teal-50">
                                                <p className="font-black text-[13px] text-teal-700">GUÍA DE REMISIÓN</p>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="border-b border-slate-400 p-1">
                                                No. {gr.secuencial}
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="border-b border-slate-400 p-1 text-left">
                                                <p className="font-bold text-[8.5px]">NÚMERO DE AUTORIZACIÓN</p>
                                                <p className="font-mono text-[7.5px] break-all mt-0.5">
                                                    {gr.autorizacion_numero || gr.clave_acceso || '—'}
                                                </p>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="border-b border-slate-400 p-1 text-left">
                                                <div className="flex justify-between">
                                                    <span className="font-bold text-[8.5px]">FECHA Y HORA DE AUTORIZACIÓN</span>
                                                    <span className="font-mono text-[8px]">{fechaAutorizacionFmt}</span>
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

                {/* ── CLAVE DE ACCESO + QR ── */}
                <div className="border border-t-0 border-slate-400 p-2 flex items-center gap-4">
                    <div className="flex-1">
                        <p className="font-bold text-[8.5px] mb-0.5">CLAVE DE ACCESO</p>
                        <p className="font-mono text-[8px] break-all">{gr.clave_acceso}</p>
                    </div>
                    {gr.clave_acceso && (
                        <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${gr.clave_acceso}`}
                            alt="QR"
                            className="w-20 h-20 flex-shrink-0"
                        />
                    )}
                </div>

                {/* ── DATOS DEL TRANSPORTISTA ── */}
                <div className="border border-t-0 border-slate-400 p-1.5 bg-teal-50/30">
                    <p className="font-bold text-[8.5px] uppercase mb-1 text-teal-700">Datos del Transportista</p>
                    <div className="grid grid-cols-4 gap-x-3 gap-y-0.5">
                        <div className="col-span-2">
                            <span className="font-bold">Razón Social: </span>
                            <span>{(gr.transportista_nombre || '').toUpperCase()}</span>
                        </div>
                        <div>
                            <span className="font-bold">CI/RUC: </span>
                            <span>{gr.transportista_identificacion}</span>
                        </div>
                        <div>
                            <span className="font-bold">Placa: </span>
                            <span className="font-mono font-bold">{(gr.placa || '').toUpperCase()}</span>
                        </div>
                        <div>
                            <span className="font-bold">Fecha Inicio: </span>
                            <span>{fmtFecha(gr.fecha_ini_transporte)}</span>
                        </div>
                        <div>
                            <span className="font-bold">Fecha Fin: </span>
                            <span>{fmtFecha(gr.fecha_fin_transporte)}</span>
                        </div>
                        <div>
                            <span className="font-bold">Motivo: </span>
                            <span>{gr.motivo_traslado}</span>
                        </div>
                        {gr.ruta && (
                            <div>
                                <span className="font-bold">Ruta: </span>
                                <span>{gr.ruta.toUpperCase()}</span>
                            </div>
                        )}
                        <div>
                            <span className="font-bold">Dir. Salida: </span>
                            <span>{(gr.dir_salida || '').toUpperCase()}</span>
                        </div>
                    </div>
                </div>

                {/* ── DESTINATARIO ── */}
                <div className="border border-t-0 border-slate-400 p-1.5">
                    <p className="font-bold text-[8.5px] uppercase mb-1">Destinatario</p>
                    <div className="grid grid-cols-4 gap-x-3 gap-y-0.5">
                        <div className="col-span-2">
                            <span className="font-bold">Razón Social: </span>
                            <span>{(gr.destinatario_nombre || '').toUpperCase()}</span>
                        </div>
                        <div>
                            <span className="font-bold">CI/RUC: </span>
                            <span>{gr.destinatario_identificacion}</span>
                        </div>
                        <div>
                            <span className="font-bold">Dirección: </span>
                            <span>{(gr.destinatario_direccion || '').toUpperCase()}</span>
                        </div>
                    </div>
                </div>

                {/* ── DOCUMENTO SUSTENTO ── */}
                <div className="border border-t-0 border-slate-400 p-1.5 bg-slate-50">
                    <p className="font-bold text-[8.5px] uppercase mb-1">Documento de Sustento</p>
                    <div className="grid grid-cols-3 gap-x-3">
                        <div>
                            <span className="font-bold">Tipo Doc.: </span>
                            <span>FACTURA (01)</span>
                        </div>
                        <div>
                            <span className="font-bold">Número: </span>
                            <span className="font-mono">{gr.doc_sustento_numero}</span>
                        </div>
                        <div>
                            <span className="font-bold">Fecha: </span>
                            <span>{fmtFecha(gr.doc_sustento_fecha)}</span>
                        </div>
                        {gr.doc_sustento_autorizacion && (
                            <div className="col-span-3">
                                <span className="font-bold">Autorización: </span>
                                <span className="font-mono text-[8px] break-all">{gr.doc_sustento_autorizacion}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── TABLA DETALLES ── */}
                <table className="w-full border-collapse border border-t-0 border-slate-400 text-[9px]">
                    <thead>
                        <tr className="bg-slate-100 text-[8.5px]">
                            <th className="border border-slate-300 px-1 py-1 text-left font-bold">Código</th>
                            <th className="border border-slate-300 px-1 py-1 text-left font-bold">Descripción</th>
                            <th className="border border-slate-300 px-1 py-1 text-right font-bold whitespace-nowrap">Cantidad</th>
                            <th className="border border-slate-300 px-1 py-1 text-right font-bold whitespace-nowrap">P. Unit.</th>
                            <th className="border border-slate-300 px-1 py-1 text-right font-bold whitespace-nowrap">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {detalles.map((d: any, i: number) => (
                            <tr key={d.id || i} className={i % 2 === 0 ? '' : 'bg-slate-50'}>
                                <td className="border border-slate-200 px-1 py-0.5">{d.codigo || '—'}</td>
                                <td className="border border-slate-200 px-1 py-0.5">{(d.descripcion || '').toUpperCase()}</td>
                                <td className="border border-slate-200 px-1 py-0.5 text-right">{Number(d.cantidad).toFixed(2)}</td>
                                <td className="border border-slate-200 px-1 py-0.5 text-right">{Number(d.precio_unitario).toFixed(4)}</td>
                                <td className="border border-slate-200 px-1 py-0.5 text-right font-semibold">${Number(d.total).toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr className="bg-teal-50">
                            <td colSpan={2} className="border border-slate-300 px-1 py-1 font-bold text-right">TOTALES:</td>
                            <td className="border border-slate-300 px-1 py-1 text-right font-bold">{totalBultos.toFixed(2)}</td>
                            <td className="border border-slate-300 px-1 py-1"></td>
                            <td className="border border-slate-300 px-1 py-1 text-right font-bold">
                                ${detalles.reduce((s: number, d: any) => s + Number(d.total ?? 0), 0).toFixed(2)}
                            </td>
                        </tr>
                    </tfoot>
                </table>

                {/* ── INFO ADICIONAL ── */}
                <div className="border border-t-0 border-slate-400 px-2 py-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[9px]">
                    <div>
                        <span className="font-bold">Fecha de Emisión: </span>
                        <span>{fmtFecha(gr.fecha_emision)}</span>
                    </div>
                    <div>
                        <span className="font-bold">Estado SRI: </span>
                        <span className={gr.estado_sri === 'AUTORIZADO' ? 'text-green-700 font-bold' : 'text-orange-600 font-bold'}>
                            {gr.estado_sri}
                        </span>
                    </div>
                </div>

                {/* ── FOOTER ── */}
                <div className="border border-t-0 border-slate-400 px-2 py-1 flex justify-between items-center">
                    <p className="text-[8px] text-slate-400">
                        Este documento es una representación impresa de una Guía de Remisión Electrónica (RIDE)
                    </p>
                    <p className="text-[9px] font-bold text-slate-600">www.billenniumsystem.com</p>
                </div>

            </div>
        </>
    )
}
