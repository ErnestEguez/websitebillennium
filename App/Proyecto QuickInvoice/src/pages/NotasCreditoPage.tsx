import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { HelpButton } from '../components/help/HelpButton'
import { ncService } from '../services/ncService'
import type { NotaCredito } from '../services/ncService'
import { kardexService } from '../services/kardexService'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency, cn } from '../lib/utils'
import { format } from 'date-fns'
import {
    FileMinus, Plus, Search,
    CheckCircle2, XCircle, Clock, Send,
    Download, Printer, RefreshCw, AlertCircle, Loader2, FileText,
    Ban, X,
} from 'lucide-react'

const estadoColors: Record<string, string> = {
    PENDIENTE:  'bg-slate-100 text-slate-600',
    ENVIADO:    'bg-orange-100 text-orange-700',
    AUTORIZADO: 'bg-emerald-100 text-emerald-700',
    RECHAZADO:  'bg-red-100 text-red-700',
}
const estadoIcons: Record<string, React.ReactElement> = {
    PENDIENTE:  <Clock        className="w-3 h-3" />,
    ENVIADO:    <Send         className="w-3 h-3" />,
    AUTORIZADO: <CheckCircle2 className="w-3 h-3" />,
    RECHAZADO:  <XCircle      className="w-3 h-3" />,
}
const tipoNcLabel: Record<string, string> = {
    DEVOLUCION: 'Devolución',
    DESCUENTO:  'Descuento',
    CORRECCION: 'Corrección',
}

export function NotasCreditoPage() {
    const { empresa, profile } = useAuth()
    const navigate = useNavigate()
    const [notas, setNotas] = useState<NotaCredito[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    const [reintentando, setReintentando] = useState<string | null>(null)
    const [imprimiendo, setImprimiendo] = useState<string | null>(null)
    const [msgMap, setMsgMap] = useState<Record<string, string>>({})   // ncId → msg reintentar

    // ── Anulación ──────────────────────────────────────────
    const [ncAnular, setNcAnular] = useState<NotaCredito | null>(null)
    const [impacto, setImpacto] = useState<{ pagos: { id: string; valor: number; facturaSecuencial: string | null }[]; totalARevertir: number } | null>(null)
    const [motivoAnulacion, setMotivoAnulacion] = useState('')
    const [cargandoImpacto, setCargandoImpacto] = useState(false)
    const [anulando, setAnulando] = useState(false)

    useEffect(() => {
        if (empresa?.id) loadData()
    }, [empresa?.id])

    async function loadData() {
        setLoading(true)
        try { setNotas(await ncService.getNotasCredito(empresa!.id)) }
        catch (e: any) { console.error('Error cargando NC:', e) }
        finally { setLoading(false) }
    }

    // ── Reintentar envío al SRI ──────────────────────────
    async function reintentarEnvio(nc: NotaCredito) {
        setReintentando(nc.id)
        setMsgMap(m => ({ ...m, [nc.id]: '' }))
        try {
            const res = await ncService.reintentarNC(nc.id)

            // Si se autorizó y es devolución → actualizar inventario (evita duplicados por documento_referencia)
            if (res.authorized && nc.tipo_nc === 'DEVOLUCION') {
                const ncFull = await ncService.getNcConDetalles(nc.id)
                for (const det of (ncFull.notas_credito_detalle || [])) {
                    if (!det.producto_id) continue
                    try {
                        // Verificar que no haya ya un movimiento ENTRADA para esta NC
                        const { count } = await import('../lib/supabase').then(({ supabase }) =>
                            supabase.from('kardex')
                                .select('*', { count: 'exact', head: true })
                                .eq('producto_id', det.producto_id)
                                .eq('tipo_movimiento', 'ENTRADA')
                                .eq('documento_referencia', nc.secuencial)
                        )
                        if (!count || count === 0) {
                            await kardexService.registrarMovimiento({
                                empresa_id:           empresa!.id,
                                producto_id:          det.producto_id,
                                tipo_movimiento:      'ENTRADA',
                                motivo:               'DEVOLUCION_NC',
                                documento_referencia: nc.secuencial,
                                cantidad:             Number(det.cantidad),
                                costo_unitario:       Number(det.precio_unitario),
                            })
                        }
                    } catch (kErr) { console.error('Kardex NC reintentar:', kErr) }
                }
            }

            const msg = res.authorized
                ? `✓ AUTORIZADA. Nº: ${res.autorizacion_numero || ''}`
                : `${res.estado_sri}: ${res.message || 'Sin detalle'}`
            setMsgMap(m => ({ ...m, [nc.id]: msg }))
            await loadData()
        } catch (e: any) {
            setMsgMap(m => ({ ...m, [nc.id]: `Error: ${e.message}` }))
        } finally {
            setReintentando(null)
        }
    }

    // ── Imprimir RIDE 80mm desde el listado ─────────────
    async function imprimirRide80(nc: NotaCredito) {
        setImprimiendo(nc.id)
        try {
            const ncFull = await ncService.getNcConDetalles(nc.id)
            const detalles   = ncFull.notas_credito_detalle || []
            const empresa_nc = ncFull.empresas || {}
            const cliente_nc = ncFull.clientes || {}
            const origen     = ncFull.comprobante_origen || {}

            const subSinIva = detalles.reduce((s: number, d: any) => s + Number(d.subtotal || 0), 0)
            const ivaTotal  = detalles.reduce((s: number, d: any) => s + Number(d.iva_valor || 0), 0)
            const totalNc   = Math.round((subSinIva + ivaTotal) * 100) / 100

            const logoHtml = empresa_nc.logo_url
                ? `<div style="text-align:center;margin-bottom:3px"><img src="${empresa_nc.logo_url}" style="max-height:28px;max-width:58mm" onerror="this.style.display='none'"></div>`
                : ''

            const filas = detalles.map((d: any) => `
                <tr>
                  <td style="padding:1px 0">${(d.nombre_producto || '').substring(0, 24).toUpperCase()}</td>
                  <td style="text-align:right;white-space:nowrap">${Number(d.cantidad).toFixed(2)} x $${Number(d.precio_unitario).toFixed(2)}</td>
                </tr>
                <tr>
                  <td style="padding-left:4px;color:#555;font-size:8px">Sub: $${Number(d.subtotal).toFixed(2)}  IVA${Number(d.iva_porcentaje).toFixed(0)}%: $${Number(d.iva_valor).toFixed(2)}</td>
                  <td style="text-align:right;font-weight:bold">$${(Number(d.subtotal) + Number(d.iva_valor)).toFixed(2)}</td>
                </tr>
                <tr><td colspan="2"><hr style="border:none;border-top:1px dotted #ccc;margin:1px 0"></td></tr>`).join('')

            const w = window.open('', '_blank', 'width=320,height=750')!
            w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>RIDE NC ${nc.secuencial}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{width:72mm;padding:3mm;font-family:Arial,sans-serif;font-size:9px;}
.center{text-align:center;}.bold{font-weight:bold;}
.hr{border-top:1px dashed #000;margin:3px 0;}
.hr2{border-top:2px solid #000;margin:3px 0;}
table{width:100%;border-collapse:collapse;}td{vertical-align:top;}
@media print{@page{size:80mm auto;margin:0}body{padding:2mm;}}
</style></head><body>
${logoHtml}
<div class="center bold" style="font-size:11px">${((empresa_nc.razon_social || empresa_nc.nombre) || 'EMPRESA').toUpperCase()}</div>
<div class="center">RUC: ${empresa_nc.ruc || ''}</div>
<div class="center" style="font-size:8px">${empresa_nc.direccion || ''}</div>
<div class="hr2"></div>
<div class="center bold" style="font-size:12px;border:1px solid #000;padding:2px;margin:3px 0">NOTA DE CRÉDITO</div>
<table>
  <tr><td class="bold">NC:</td><td style="text-align:right">${nc.secuencial}</td></tr>
  <tr><td>Factura:</td><td style="text-align:right">${(origen as any).secuencial || '—'}</td></tr>
  <tr><td>Fecha:</td><td style="text-align:right">${format(new Date(nc.created_at), 'dd/MM/yyyy HH:mm')}</td></tr>
</table>
<div class="hr"></div>
<div class="bold">Cliente:</div>
<div>${(cliente_nc.nombre || 'CONSUMIDOR FINAL').substring(0, 35).toUpperCase()}</div>
<div style="font-size:8px">CI/RUC: ${cliente_nc.identificacion || ''}</div>
<div class="hr"></div>
<div class="bold" style="font-size:8px">Motivo: ${nc.motivo_descripcion || nc.tipo_nc}</div>
<div class="hr"></div>
<table>${filas}</table>
<div class="hr2"></div>
<table>
  <tr><td>Subtotal s/IVA:</td><td style="text-align:right">$${subSinIva.toFixed(2)}</td></tr>
  <tr><td>Total IVA:</td><td style="text-align:right">$${ivaTotal.toFixed(2)}</td></tr>
  <tr><td class="bold" style="font-size:11px">TOTAL NC:</td><td style="text-align:right;font-weight:bold;font-size:11px">$${totalNc.toFixed(2)}</td></tr>
</table>
<div class="hr2"></div>
<div style="font-size:8px;word-break:break-all">${nc.autorizacion_numero || ('PENDIENTE: ' + nc.estado_sri)}</div>
<div class="hr"></div>
<div class="center" style="font-size:7px">Comprobante Electrónico — RIDE NC</div>
</body></html>`)
            w.document.close()
            w.focus()
            setTimeout(() => { w.print() }, 300)
        } catch (e: any) {
            alert('Error al imprimir: ' + e.message)
        } finally {
            setImprimiendo(null)
        }
    }

    // ── Anular NC ─────────────────────────────────────────
    async function abrirAnular(nc: NotaCredito) {
        setNcAnular(nc)
        setMotivoAnulacion('')
        setImpacto(null)
        setCargandoImpacto(true)
        try { setImpacto(await ncService.getImpactoAnulacion(nc.id)) }
        catch (e: any) { alert('Error al calcular el impacto: ' + e.message) }
        finally { setCargandoImpacto(false) }
    }

    async function confirmarAnular() {
        if (!ncAnular || !profile?.id) return
        if (!motivoAnulacion.trim()) { alert('El motivo es obligatorio'); return }
        setAnulando(true)
        try {
            await ncService.anularNC(ncAnular.id, motivoAnulacion.trim(), profile.id)
            setNcAnular(null)
            await loadData()
        } catch (e: any) {
            alert('Error al anular: ' + e.message)
        } finally {
            setAnulando(false)
        }
    }

    const filtradas = notas.filter(n =>
        n.secuencial.includes(search) ||
        (n.clientes?.nombre || '').toLowerCase().includes(search.toLowerCase()) ||
        (n.comprobante_origen as any)?.secuencial?.includes(search)
    )

    const stats = {
        autorizadas: notas.filter(n => n.estado_sri === 'AUTORIZADO').length,
        pendientes:  notas.filter(n => n.estado_sri === 'PENDIENTE').length,
        rechazadas:  notas.filter(n => n.estado_sri === 'RECHAZADO').length,
        totalMonto:  notas.filter(n => n.estado_sri === 'AUTORIZADO').reduce((s, n) => s + n.total, 0),
    }

    if (loading) return <div className="p-12 text-center text-slate-500">Cargando notas de crédito...</div>

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <FileMinus className="w-6 h-6 text-orange-500" />
                        Notas de Crédito
                    </h1>
                    <p className="text-slate-500 text-sm">Devoluciones, descuentos y correcciones autorizadas por SRI</p>
                </div>
                <HelpButton pageKey="notas-credito" />
                <button
                    onClick={() => navigate('/notas-credito/nueva')}
                    className="btn bg-primary-600 text-white gap-2 hover:bg-primary-700 shadow-lg shadow-primary-200 active:scale-95 transition-all"
                >
                    <Plus className="w-4 h-4" />
                    Nueva Nota de Crédito
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Autorizadas', value: stats.autorizadas, color: 'text-emerald-600' },
                    { label: 'Pendientes',  value: stats.pendientes,  color: 'text-slate-600' },
                    { label: 'Rechazadas',  value: stats.rechazadas,  color: 'text-red-600' },
                    { label: 'Monto Total', value: formatCurrency(stats.totalMonto), color: 'text-primary-700' },
                ].map(s => (
                    <div key={s.label} className="card p-4 hover:shadow-md transition-shadow">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{s.label}</p>
                        <p className={cn("text-xl font-black mt-1", s.color)}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Tabla */}
            <div className="card shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-white">
                    <div className="relative max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar por NC, cliente o factura..."
                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                {filtradas.length === 0 ? (
                    <div className="p-12 text-center text-slate-400">
                        <FileMinus className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="font-medium">Sin notas de crédito</p>
                        <p className="text-sm mt-1">Emite tu primera NC desde el botón superior</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider font-bold">
                                    <th className="px-4 py-3">Secuencial NC</th>
                                    <th className="px-4 py-3">Factura Origen</th>
                                    <th className="px-4 py-3">Cliente</th>
                                    <th className="px-4 py-3">Tipo / Motivo</th>
                                    <th className="px-4 py-3">Fecha</th>
                                    <th className="px-4 py-3 text-right">Total</th>
                                    <th className="px-4 py-3 text-center">Estado SRI</th>
                                    <th className="px-4 py-3 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {filtradas.map(nc => (
                                    <>
                                        <tr key={nc.id} className="hover:bg-slate-50/50 transition-colors">
                                            <td className="px-4 py-3 font-mono text-sm font-bold text-slate-900">
                                                {nc.secuencial}
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs text-slate-600">
                                                {(nc.comprobante_origen as any)?.secuencial || '—'}
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="text-sm font-medium text-slate-900">{nc.clientes?.nombre || '—'}</p>
                                                <p className="text-[10px] text-slate-400">{nc.clientes?.identificacion}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={cn(
                                                    'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase',
                                                    nc.tipo_nc === 'DEVOLUCION' ? 'bg-blue-100 text-blue-700' :
                                                    nc.tipo_nc === 'DESCUENTO'  ? 'bg-purple-100 text-purple-700' :
                                                    'bg-yellow-100 text-yellow-700'
                                                )}>
                                                    {tipoNcLabel[nc.tipo_nc]}
                                                </span>
                                                <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[140px]" title={nc.motivo_descripcion}>
                                                    {nc.motivo_descripcion}
                                                </p>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                                                {format(new Date(nc.created_at), 'dd/MM/yyyy HH:mm')}
                                            </td>
                                            <td className="px-4 py-3 text-sm font-bold text-slate-900 text-right">
                                                {formatCurrency(nc.total)}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={cn(
                                                    'px-2 py-0.5 rounded-full text-[10px] font-medium inline-flex items-center gap-1',
                                                    estadoColors[nc.estado_sri] || 'bg-gray-100 text-gray-700'
                                                )}>
                                                    {estadoIcons[nc.estado_sri]}
                                                    {nc.estado_sri}
                                                </span>
                                                {nc.estado_sistema === 'ANULADA' && (
                                                    <span className="block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">
                                                        ANULADA
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex justify-center items-center gap-1 flex-wrap">
                                                    {/* Anular — solo si está autorizada y activa */}
                                                    {nc.estado_sri === 'AUTORIZADO' && nc.estado_sistema !== 'ANULADA' && (
                                                        <button
                                                            onClick={() => abrirAnular(nc)}
                                                            title="Anular esta N/C"
                                                            className="p-1.5 bg-red-50 hover:bg-red-100 rounded-lg text-red-600 transition-colors"
                                                        >
                                                            <Ban className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                    {/* Reintentar: visible si no está autorizada */}
                                                    {nc.estado_sri !== 'AUTORIZADO' && (
                                                        <button
                                                            onClick={() => reintentarEnvio(nc)}
                                                            disabled={reintentando === nc.id}
                                                            title="Reintentar envío al SRI"
                                                            className="p-1.5 bg-primary-50 hover:bg-primary-100 rounded-lg text-primary-700 transition-colors disabled:opacity-50"
                                                        >
                                                            {reintentando === nc.id
                                                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                : <RefreshCw className="w-3.5 h-3.5" />}
                                                        </button>
                                                    )}
                                                    {/* Imprimir RIDE 80mm */}
                                                    <button
                                                        onClick={() => imprimirRide80(nc)}
                                                        disabled={imprimiendo === nc.id}
                                                        title="Imprimir RIDE 80mm"
                                                        className="p-1.5 bg-slate-50 hover:bg-orange-50 rounded-lg text-slate-500 hover:text-orange-600 transition-colors disabled:opacity-50"
                                                    >
                                                        {imprimiendo === nc.id
                                                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                            : <Printer className="w-3.5 h-3.5" />}
                                                    </button>
                                                    {/* RIDE A4 */}
                                                    <button
                                                        onClick={() => window.open(`/notas-credito/${nc.id}/ride`, '_blank')}
                                                        title="Ver RIDE A4"
                                                        className="p-1.5 bg-slate-50 hover:bg-orange-50 rounded-lg text-slate-500 hover:text-orange-600 transition-colors"
                                                    >
                                                        <FileText className="w-3.5 h-3.5" />
                                                    </button>
                                                    {/* Descargar XML */}
                                                    <button
                                                        onClick={() => ncService.descargarXmlNC(nc.id, nc.secuencial)}
                                                        disabled={!nc.xml_firmado}
                                                        title={nc.xml_firmado ? 'Descargar XML firmado' : 'XML no disponible'}
                                                        className="p-1.5 bg-slate-50 hover:bg-blue-50 rounded-lg text-slate-500 hover:text-blue-600 transition-colors disabled:opacity-30"
                                                    >
                                                        <Download className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>

                                        {/* Fila de mensaje SRI o resultado de reintento */}
                                        {(nc.estado_sri !== 'AUTORIZADO' && nc.observaciones_sri) || msgMap[nc.id] ? (
                                            <tr key={`${nc.id}-msg`} className="bg-red-50 border-t-0">
                                                <td colSpan={8} className="px-4 py-2">
                                                    {msgMap[nc.id] ? (
                                                        <p className={cn(
                                                            'text-xs font-mono',
                                                            msgMap[nc.id].startsWith('✓') ? 'text-emerald-700' : 'text-red-700'
                                                        )}>
                                                            <AlertCircle className="w-3 h-3 inline mr-1" />
                                                            {msgMap[nc.id]}
                                                        </p>
                                                    ) : nc.observaciones_sri && nc.estado_sri !== 'AUTORIZADO' ? (
                                                        <p className="text-xs font-mono text-red-700">
                                                            <AlertCircle className="w-3 h-3 inline mr-1" />
                                                            {nc.observaciones_sri}
                                                        </p>
                                                    ) : null}
                                                </td>
                                            </tr>
                                        ) : null}
                                    </>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ── Modal Anular NC ─────────────────────────── */}
            {ncAnular && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-start">
                            <div>
                                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                    <Ban className="w-5 h-5 text-red-500" /> Anular Nota de Crédito
                                </h2>
                                <p className="text-sm text-slate-500 mt-0.5">N/C {ncAnular.secuencial} — {ncAnular.clientes?.nombre}</p>
                            </div>
                            <button onClick={() => setNcAnular(null)} className="p-2 hover:bg-slate-100 rounded-full">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            {cargandoImpacto ? (
                                <div className="py-6 text-center text-slate-400 text-sm">
                                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Calculando impacto...
                                </div>
                            ) : impacto && impacto.pagos.length > 0 ? (
                                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                                    <p className="text-sm text-amber-800 flex items-start gap-2">
                                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                        Esta N/C aplicó <strong>{formatCurrency(impacto.totalARevertir)}</strong> a {impacto.pagos.length === 1 ? 'la siguiente factura' : 'las siguientes facturas'}. Al anular, se revertirá ese saldo (la factura volverá a quedar pendiente por ese valor).
                                    </p>
                                    <ul className="text-xs text-amber-900 space-y-0.5">
                                        {impacto.pagos.map(p => (
                                            <li key={p.id} className="flex justify-between font-mono">
                                                <span>{p.facturaSecuencial ?? '—'}</span>
                                                <span>{formatCurrency(p.valor)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : (
                                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-600">
                                    Esta N/C no tiene saldo aplicado a ninguna factura — no hay nada que revertir, solo se marcará como anulada.
                                </div>
                            )}
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Motivo de anulación *</label>
                                <textarea
                                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-red-400 outline-none text-sm resize-none h-20"
                                    value={motivoAnulacion}
                                    onChange={e => setMotivoAnulacion(e.target.value)}
                                    placeholder="Ej: NC digitada por error"
                                    autoFocus
                                />
                            </div>
                            <p className="text-[11px] text-slate-400">Una N/C anulada no se puede reactivar.</p>
                            <div className="flex gap-3 pt-1">
                                <button onClick={() => setNcAnular(null)} disabled={anulando}
                                    className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 disabled:opacity-50">
                                    Cancelar
                                </button>
                                <button onClick={confirmarAnular} disabled={anulando || cargandoImpacto || !motivoAnulacion.trim()}
                                    className="flex-1 bg-red-600 text-white rounded-xl px-4 py-2 font-bold hover:bg-red-700 flex items-center justify-center gap-2 disabled:opacity-50">
                                    {anulando ? <><Loader2 className="w-4 h-4 animate-spin" /> Anulando...</> : <><Ban className="w-4 h-4" /> Confirmar Anulación</>}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
