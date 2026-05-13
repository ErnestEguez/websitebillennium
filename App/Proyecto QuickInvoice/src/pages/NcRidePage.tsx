import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ncService } from '../services/ncService'
import { formatCurrency } from '../lib/utils'
import { format } from 'date-fns'
import { Loader2, Printer, ChevronLeft, Download } from 'lucide-react'

export function NcRidePage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const [nc, setNc] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (id) loadNc()
    }, [id])

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

    const empresa   = nc.empresas   || {}
    const cliente   = nc.clientes   || {}
    const detalles  = nc.notas_credito_detalle || []
    const origen    = nc.comprobante_origen    || {}

    const ivaTotal  = detalles.reduce((s: number, d: any) => s + Number(d.iva_valor || 0), 0)

    // Agrupar IVA por tasa
    const ivaBreakdown: Record<string, { base: number; iva: number }> = {}
    detalles.forEach((d: any) => {
        const rate = String(Number(d.iva_porcentaje || 0))
        if (!ivaBreakdown[rate]) ivaBreakdown[rate] = { base: 0, iva: 0 }
        ivaBreakdown[rate].base += Number(d.subtotal  || 0)
        ivaBreakdown[rate].iva  += Number(d.iva_valor || 0)
    })

    const fechaEmision = nc.created_at
        ? format(new Date(new Date(nc.created_at).getTime() - 5 * 60 * 60 * 1000), 'dd/MM/yyyy')
        : '—'

    return (
        <div className="min-h-screen bg-slate-50 pb-12 print:bg-white print:pb-0">
            {/* Toolbar — solo en pantalla */}
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
                        onClick={() => ncService.descargarXmlNC(nc.id, nc.secuencial)}
                        disabled={!nc.xml_firmado}
                        className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-slate-600 hover:bg-white transition-colors disabled:opacity-40"
                    >
                        <Download className="w-4 h-4" />
                        XML
                    </button>
                </div>
            </div>

            {/* Documento RIDE */}
            <div className="max-w-4xl mx-auto bg-white shadow-2xl rounded-xl p-8 md:p-12 print:shadow-none print:rounded-none print:p-0">

                {/* ── Cabecera ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-b-2 border-slate-100 pb-8">

                    {/* Empresa + Logo */}
                    <div className="space-y-4">
                        <div>
                            {empresa.logo_url ? (
                                <img
                                    src={empresa.logo_url}
                                    alt="Logo"
                                    className="h-20 max-w-[180px] object-contain mb-3"
                                    crossOrigin="anonymous"
                                    style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as any}
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                                />
                            ) : null}
                            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
                                {empresa.razon_social || empresa.nombre}
                            </h1>
                            <p className="text-slate-500 font-medium">{empresa.direccion || 'Ecuador'}</p>
                            <p className="text-slate-500">Tel: {empresa.telefono || '—'}</p>
                            <p className="text-slate-500">RUC: {empresa.ruc}</p>
                        </div>
                    </div>

                    {/* Identificación del comprobante */}
                    <div className="bg-orange-50 rounded-2xl p-6 border border-orange-100 flex flex-col justify-center">
                        <h2 className="text-orange-600 font-black text-xl mb-1 uppercase tracking-widest text-center">
                            Nota de Crédito
                        </h2>
                        <p className="text-slate-900 text-center font-bold text-lg mb-4">№ {nc.secuencial}</p>

                        <div className="space-y-2 text-xs">
                            <div className="flex justify-between">
                                <span className="text-slate-400 font-bold uppercase">Nº Autorización:</span>
                            </div>
                            <p className="font-mono text-[10px] break-all text-slate-600 bg-white p-2 rounded border border-orange-100">
                                {nc.autorizacion_numero || nc.clave_acceso || '—'}
                            </p>
                            <div className="flex justify-between pt-2">
                                <span className="text-slate-400 font-bold uppercase">Fecha Autorización:</span>
                                <span className="text-slate-900 font-bold">
                                    {nc.fecha_autorizacion
                                        ? format(new Date(nc.fecha_autorizacion), 'dd/MM/yyyy HH:mm')
                                        : nc.estado_sri}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400 font-bold uppercase">Ambiente:</span>
                                <span className="text-slate-900 font-bold">
                                    {empresa.config_sri?.ambiente || 'PRUEBAS'}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400 font-bold uppercase">Emisión:</span>
                                <span className="text-slate-900 font-bold">NORMAL</span>
                            </div>
                            <div className="flex justify-between pt-2 border-t border-orange-100 mt-2">
                                <span className="text-slate-400 font-bold uppercase">Clave de Acceso:</span>
                            </div>
                            <p className="font-mono text-[8px] break-all text-slate-400">
                                {nc.clave_acceso}
                            </p>
                        </div>
                    </div>
                </div>

                {/* ── Datos del cliente + Factura origen ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-8 border-b border-slate-100">
                    <div>
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Datos del Cliente</h3>
                        <p className="text-lg font-black text-slate-900">{(cliente.nombre || 'CONSUMIDOR FINAL').toUpperCase()}</p>
                        <p className="text-slate-500 font-medium">Identificación: {cliente.identificacion}</p>
                        <p className="text-slate-500">Email: {cliente.email || '—'}</p>
                        <p className="text-slate-500">Dirección: {cliente.direccion || '—'}</p>
                    </div>
                    <div>
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Comprobante que Modifica</h3>
                        <p className="text-slate-900 font-bold">Factura: {origen.secuencial || '—'}</p>
                        {origen.created_at && (
                            <p className="text-slate-500">
                                Fecha factura: {format(new Date(new Date(origen.created_at).getTime() - 5 * 60 * 60 * 1000), 'dd/MM/yyyy')}
                            </p>
                        )}
                        <p className="text-slate-900 font-bold mt-3">Fecha NC: {fechaEmision}</p>
                        <div className="mt-2">
                            <span className="text-xs text-slate-400 font-bold uppercase">Motivo:</span>
                            <p className="text-slate-900 font-medium">{nc.motivo_descripcion || nc.tipo_nc}</p>
                        </div>
                    </div>
                </div>

                {/* ── Tabla de detalles ── */}
                <div className="py-8">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                                <th className="pb-4">Descripción</th>
                                <th className="pb-4 text-center">Cant.</th>
                                <th className="pb-4 text-right">P.Unit S/IVA</th>
                                <th className="pb-4 text-right">Subtotal</th>
                                <th className="pb-4 text-right">IVA %</th>
                                <th className="pb-4 text-right">IVA $</th>
                                <th className="pb-4 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {detalles.map((d: any) => {
                                const sub   = Number(d.subtotal   || 0)
                                const iva   = Number(d.iva_valor  || 0)
                                const total = sub + iva
                                return (
                                    <tr key={d.id} className="text-sm">
                                        <td className="py-4 font-bold text-slate-900">{d.nombre_producto}</td>
                                        <td className="py-4 text-center font-medium text-slate-500">{Number(d.cantidad).toFixed(2)}</td>
                                        <td className="py-4 text-right font-medium text-slate-500">{formatCurrency(d.precio_unitario)}</td>
                                        <td className="py-4 text-right font-medium text-slate-500">{formatCurrency(sub)}</td>
                                        <td className="py-4 text-right font-medium text-slate-500">{Number(d.iva_porcentaje).toFixed(0)}%</td>
                                        <td className="py-4 text-right font-medium text-slate-500">{formatCurrency(iva)}</td>
                                        <td className="py-4 text-right font-black text-slate-900">{formatCurrency(total)}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>

                {/* ── Totales ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t-2 border-slate-100">
                    {/* Izquierda: info adicional + QR */}
                    <div className="space-y-6">
                        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3">Información Adicional</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Tipo NC:</span>
                                    <span className="font-bold text-slate-900">{nc.tipo_nc}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Motivo SRI:</span>
                                    <span className="font-bold text-slate-900">{nc.motivo_sri}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Saldo NC:</span>
                                    <span className="font-bold text-slate-900">{formatCurrency(nc.saldo_nc)}</span>
                                </div>
                            </div>
                        </div>

                        {nc.clave_acceso && (
                            <div className="flex flex-col items-center justify-center p-6 bg-white border border-slate-100 rounded-2xl space-y-3">
                                <img
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${nc.clave_acceso}`}
                                    alt="QR SRI"
                                    className="w-32 h-32"
                                />
                                <p className="text-[8px] font-mono text-slate-400 uppercase tracking-tighter">Escanee para consultar en SRI</p>
                            </div>
                        )}
                    </div>

                    {/* Derecha: desglose IVA + total */}
                    <div className="space-y-3">
                        {Object.entries(ivaBreakdown).map(([rate, vals]) => (
                            <div key={rate} className="flex justify-between items-center text-slate-500 font-medium">
                                <span>Subtotal IVA {rate}%</span>
                                <span>{formatCurrency(vals.base)}</span>
                            </div>
                        ))}
                        <div className="flex justify-between items-center text-slate-500 font-medium">
                            <span>IVA Total</span>
                            <span>{formatCurrency(ivaTotal)}</span>
                        </div>
                        <div className="flex justify-between items-center bg-orange-500 text-white rounded-xl p-4 mt-4">
                            <span className="font-bold text-lg">VALOR NC</span>
                            <span className="font-black text-2xl">{formatCurrency(nc.total)}</span>
                        </div>
                    </div>
                </div>

                <div className="mt-12 text-center border-t border-slate-100 pt-8 opacity-50 text-[10px] uppercase font-bold tracking-widest text-slate-400">
                    Este documento es una representación impresa de una Nota de Crédito Electrónica (RIDE)
                </div>
            </div>
        </div>
    )
}
