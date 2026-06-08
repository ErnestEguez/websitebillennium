import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { compraService, proveedorService } from '../../services/vendorService'
import type { Compra, CompraConDetalle, Proveedor } from '../../types/vendors'
import {
    ShoppingCart, Search, Filter, Eye, Ban,
    Package, Wrench, ChevronDown, Loader2, RefreshCw,
    Calendar, AlertCircle, X, Download, Printer,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import * as XLSX from 'xlsx'

const HOY = new Date().toISOString().split('T')[0]
const PRIMER_DIA_MES = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    .toISOString().split('T')[0]

function fmt(n: number) { return `$${n.toFixed(2)}` }
function fmtFecha(s: string) {
    return new Date(s + 'T12:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })
}

const ESTADO_BADGE: Record<string, string> = {
    ACTIVO:   'bg-green-100 text-green-700',
    ANULADO:  'bg-red-100 text-red-600',
    DEVUELTO: 'bg-amber-100 text-amber-700',
}

// ── Modal de detalle ──────────────────────────────────────────────────────────
function DetalleModal({ id, onClose }: { id: string; onClose: () => void }) {
    const [data, setData]     = useState<CompraConDetalle | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError]   = useState('')

    useEffect(() => {
        compraService.obtenerConDetalle(id)
            .then(d  => setData(d))
            .catch(e => setError(e.message))
            .finally(() => setLoading(false))
    }, [id])

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
                {/* Header modal */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <h2 className="text-lg font-bold text-slate-900">Detalle de Compra</h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
                    {loading && (
                        <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
                            <Loader2 className="w-5 h-5 animate-spin" /> Cargando...
                        </div>
                    )}
                    {error && (
                        <div className="flex items-center gap-2 text-red-500 py-8 justify-center">
                            <AlertCircle className="w-5 h-5" /> {error}
                        </div>
                    )}
                    {data && !loading && (
                        <>
                            {/* Datos cabecera */}
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                                <div>
                                    <p className="text-xs text-slate-400 uppercase font-semibold mb-0.5">Proveedor</p>
                                    <p className="font-semibold text-slate-800">{(data.proveedor as any)?.nombre_empresa ?? '—'}</p>
                                    <p className="text-xs text-slate-400">{(data.proveedor as any)?.ruc}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-400 uppercase font-semibold mb-0.5">Número Factura</p>
                                    <p className="font-mono text-slate-800">
                                        {data.estab && data.pto_emi && data.secuencial
                                            ? `${data.estab}-${data.pto_emi}-${data.secuencial}`
                                            : data.numero_factura ?? '—'}
                                    </p>
                                    {data.numero_autorizacion && (
                                        <p className="text-xs text-slate-400 font-mono truncate">{data.numero_autorizacion}</p>
                                    )}
                                </div>
                                <div>
                                    <p className="text-xs text-slate-400 uppercase font-semibold mb-0.5">Fecha Emisión</p>
                                    <p className="text-slate-800">{fmtFecha(data.fecha_emision ?? data.fecha_ingreso)}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-400 uppercase font-semibold mb-0.5">Tipo</p>
                                    <span className={cn(
                                        'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium',
                                        data.tipo_compra === 'INVENTARIO' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                                    )}>
                                        {data.tipo_compra === 'INVENTARIO' ? <Package className="w-3 h-3" /> : <Wrench className="w-3 h-3" />}
                                        {data.tipo_compra === 'INVENTARIO' ? 'Inventario' : 'Servicio'}
                                    </span>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-400 uppercase font-semibold mb-0.5">Forma de Pago</p>
                                    <p className="text-slate-800">{data.forma_pago}</p>
                                    {data.fecha_vencimiento && (
                                        <p className="text-xs text-slate-400">Vence: {fmtFecha(data.fecha_vencimiento)}</p>
                                    )}
                                </div>
                                <div>
                                    <p className="text-xs text-slate-400 uppercase font-semibold mb-0.5">Estado</p>
                                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold', ESTADO_BADGE[data.estado] ?? '')}>
                                        {data.estado}
                                    </span>
                                </div>
                            </div>

                            {/* Totales */}
                            <div className="grid grid-cols-3 md:grid-cols-5 gap-2 bg-slate-50 rounded-xl p-4 text-center text-sm">
                                {[
                                    { label: 'Base IVA 0%',  val: fmt(data.base_iva_0  ?? 0) },
                                    { label: 'Base IVA 5%',  val: fmt(data.base_iva_5  ?? 0) },
                                    { label: 'Base IVA 15%', val: fmt(data.base_iva_15 ?? 0) },
                                    { label: 'IVA',          val: fmt(data.valor_iva   ?? 0) },
                                    { label: 'TOTAL',        val: fmt(data.total), bold: true },
                                ].map(t => (
                                    <div key={t.label}>
                                        <p className="text-xs text-slate-400">{t.label}</p>
                                        <p className={cn('font-mono', t.bold ? 'text-primary-700 font-bold text-base' : 'font-semibold text-slate-700')}>{t.val}</p>
                                    </div>
                                ))}
                            </div>

                            {/* Ítems inventario */}
                            {data.tipo_compra === 'INVENTARIO' && (data.detalle_ingresos_stock ?? []).length > 0 && (
                                <div>
                                    <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Ítems de Inventario</h3>
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-xs text-slate-400 border-b">
                                                <th className="text-left py-1.5 font-semibold">Producto</th>
                                                <th className="text-right py-1.5 font-semibold w-20">Cant.</th>
                                                <th className="text-right py-1.5 font-semibold w-28">Costo Unit.</th>
                                                <th className="text-right py-1.5 font-semibold w-24">Subtotal</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {data.detalle_ingresos_stock!.map((d, i) => (
                                                <tr key={i}>
                                                    <td className="py-1.5">
                                                        <p className="font-medium text-slate-800">{(d.producto as any)?.nombre ?? '—'}</p>
                                                        {(d.producto as any)?.codigo && (
                                                            <p className="text-xs text-slate-400">{(d.producto as any).codigo}</p>
                                                        )}
                                                    </td>
                                                    <td className="py-1.5 text-right font-mono text-slate-600">{d.cantidad}</td>
                                                    <td className="py-1.5 text-right font-mono text-slate-600">{fmt(d.costo_unitario)}</td>
                                                    <td className="py-1.5 text-right font-mono font-semibold text-slate-800">{fmt(d.subtotal ?? d.cantidad * d.costo_unitario)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Ítems servicio */}
                            {data.tipo_compra === 'SERVICIO' && (data.detalle_servicios ?? []).length > 0 && (
                                <div>
                                    <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Ítems de Servicio</h3>
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-xs text-slate-400 border-b">
                                                <th className="text-left py-1.5 font-semibold">Descripción</th>
                                                <th className="text-left py-1.5 font-semibold w-28">Tipo gasto</th>
                                                <th className="text-right py-1.5 font-semibold w-16">Cant.</th>
                                                <th className="text-right py-1.5 font-semibold w-24">P. Unit.</th>
                                                <th className="text-right py-1.5 font-semibold w-24">Subtotal</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {data.detalle_servicios!.map((d, i) => (
                                                <tr key={i}>
                                                    <td className="py-1.5 text-slate-800">{d.descripcion}</td>
                                                    <td className="py-1.5 text-xs text-slate-500">{d.tipo_gasto}</td>
                                                    <td className="py-1.5 text-right font-mono text-slate-600">{d.cantidad}</td>
                                                    <td className="py-1.5 text-right font-mono text-slate-600">{fmt(d.precio_unitario)}</td>
                                                    <td className="py-1.5 text-right font-mono font-semibold text-slate-800">{fmt(d.subtotal)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Retenciones */}
                            {(data.retenciones ?? []).length > 0 && (
                                <div>
                                    <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Retenciones</h3>
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-xs text-slate-400 border-b">
                                                <th className="text-left py-1.5 font-semibold">Tipo</th>
                                                <th className="text-left py-1.5 font-semibold">Código</th>
                                                <th className="text-right py-1.5 font-semibold w-28">Base</th>
                                                <th className="text-right py-1.5 font-semibold w-16">%</th>
                                                <th className="text-right py-1.5 font-semibold w-24">Valor</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {data.retenciones!.map((r, i) => (
                                                <tr key={i}>
                                                    <td className="py-1.5 text-slate-600">{r.tipo}</td>
                                                    <td className="py-1.5 font-mono text-slate-600">{r.codigo_retencion}</td>
                                                    <td className="py-1.5 text-right font-mono text-slate-600">{fmt(r.base_imponible)}</td>
                                                    <td className="py-1.5 text-right font-mono text-slate-600">{r.porcentaje}%</td>
                                                    <td className="py-1.5 text-right font-mono font-semibold text-slate-800">{fmt(r.valor)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* CxP */}
                            {data.cxp && (
                                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
                                    <p className="text-xs font-bold text-amber-700 uppercase mb-2">Cuenta por Pagar</p>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <p className="text-xs text-amber-600">Monto original</p>
                                            <p className="font-mono font-semibold">{fmt(data.cxp.monto_original)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-amber-600">Saldo pendiente</p>
                                            <p className="font-mono font-semibold">{fmt(data.cxp.saldo_pendiente)}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-amber-600">Estado</p>
                                            <p className="font-semibold">{data.cxp.estado}</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {data.observaciones && (
                                <div>
                                    <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Observaciones</p>
                                    <p className="text-sm text-slate-600">{data.observaciones}</p>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
                    <button onClick={onClose} className="btn btn-secondary text-sm">Cerrar</button>
                </div>
            </div>
        </div>
    )
}

// ── Página principal ──────────────────────────────────────────────────────────
export function ComprasPage() {
    const { empresa, user } = useAuth()
    const location = useLocation()

    const [msgBanner, setMsgBanner] = useState('')
    useEffect(() => {
        const st = location.state as { acctMsg?: string } | null
        if (st?.acctMsg) { setMsgBanner(st.acctMsg); window.history.replaceState({}, '') }
    }, [])

    const [compras, setCompras]       = useState<Compra[]>([])
    const [proveedores, setProveedores] = useState<Proveedor[]>([])
    const [loading, setLoading]       = useState(true)
    const [anulando, setAnulando]     = useState<string | null>(null)
    const [detalleId, setDetalleId]   = useState<string | null>(null)

    const [busqueda, setBusqueda]       = useState('')
    const [filtroTipo, setFiltroTipo]   = useState('')
    const [filtroEst, setFiltroEst]     = useState('ACTIVO')
    const [filtroProv, setFiltroProv]   = useState('')
    const [desde, setDesde]             = useState(PRIMER_DIA_MES)
    const [hasta, setHasta]             = useState(HOY)
    const [filtrosOpen, setFiltrosOpen] = useState(false)
    const [error, setError]             = useState('')

    const filtrosRef = useRef({ filtroTipo, filtroEst, filtroProv, desde, hasta })
    filtrosRef.current = { filtroTipo, filtroEst, filtroProv, desde, hasta }

    useEffect(() => {
        if (!empresa?.id) { setLoading(false); return }
        const eid = empresa.id
        let cancelled = false
        setLoading(true); setError('')
        const { filtroTipo: t, filtroEst: e, filtroProv: p, desde: d, hasta: h } = filtrosRef.current
        Promise.all([
            compraService.listar(eid, { tipo: t||undefined, estado: e||undefined, proveedorId: p||undefined, desde: d, hasta: h }),
            proveedorService.listar(eid),
        ]).then(([c, pv]) => { if (!cancelled) { setCompras(c); setProveedores(pv) } })
          .catch(err => { if (!cancelled) setError(err.message) })
          .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [empresa?.id])

    async function loadAll() {
        if (!empresa?.id) return
        try {
            setLoading(true); setError('')
            const [c, p] = await Promise.all([
                compraService.listar(empresa.id, {
                    tipo: filtroTipo || undefined, estado: filtroEst || undefined,
                    proveedorId: filtroProv || undefined, desde, hasta,
                }),
                proveedorService.listar(empresa.id),
            ])
            setCompras(c); setProveedores(p)
        } catch (e: any) { setError(e.message) }
        finally { setLoading(false) }
    }

    async function handleAnular(c: Compra) {
        const motivo = prompt(`Motivo de anulación para factura ${c.numero_factura ?? c.id.slice(0, 8)}:`)
        if (!motivo?.trim()) return
        try {
            setAnulando(c.id)
            await compraService.anular(c.id, motivo, user!.id)
            await loadAll()
        } catch (e: any) {
            alert('Error al anular: ' + e.message)
        } finally {
            setAnulando(null)
        }
    }

    const visibles = compras.filter(c => {
        if (!busqueda) return true
        const q = busqueda.toLowerCase()
        return (
            c.numero_factura?.toLowerCase().includes(q) ||
            (c.proveedor as any)?.nombre_empresa?.toLowerCase().includes(q) ||
            c.clave_acceso?.includes(q)
        )
    })

    const totalComprado = visibles.filter(c => c.estado === 'ACTIVO').reduce((s, c) => s + c.total, 0)
    const totalIva      = visibles.filter(c => c.estado === 'ACTIVO').reduce((s, c) => s + (c.valor_iva ?? 0), 0)
    const ctdInventario = visibles.filter(c => c.tipo_compra === 'INVENTARIO' && c.estado === 'ACTIVO').length
    const ctdServicio   = visibles.filter(c => c.tipo_compra === 'SERVICIO'   && c.estado === 'ACTIVO').length

    function exportarExcel() {
        const rows = visibles.map(c => ({
            Fecha:          fmtFecha(c.fecha_emision ?? c.fecha_ingreso),
            Tipo:           c.tipo_compra,
            Proveedor:      (c.proveedor as any)?.nombre_empresa ?? '',
            RUC:            (c.proveedor as any)?.ruc ?? '',
            'Nro. Factura': c.estab && c.pto_emi && c.secuencial
                                ? `${c.estab}-${c.pto_emi}-${c.secuencial}`
                                : (c.numero_factura ?? ''),
            'Base IVA 0':   c.base_iva_0  ?? 0,
            'Base IVA 5':   c.base_iva_5  ?? 0,
            'Base IVA 15':  c.base_iva_15 ?? 0,
            IVA:            c.valor_iva   ?? 0,
            Total:          c.total,
            'Forma Pago':   c.forma_pago,
            Estado:         c.estado,
        }))
        const ws = XLSX.utils.json_to_sheet(rows)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Compras')
        XLSX.writeFile(wb, `Compras_${desde}_${hasta}.xlsx`)
    }

    function imprimirReporte() {
        const html = `
        <html><head><title>Reporte de Compras</title>
        <style>
            body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; }
            h2 { font-size: 14px; margin-bottom: 4px; }
            p  { margin: 0 0 12px; color: #555; }
            table { width: 100%; border-collapse: collapse; }
            th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; padding: 6px 8px; text-align: left; border-bottom: 2px solid #e2e8f0; }
            td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; }
            tfoot td { font-weight: bold; background: #f8fafc; border-top: 2px solid #e2e8f0; }
            .right { text-align: right; }
            .badge-inv { background:#dbeafe; color:#1d4ed8; padding:1px 6px; border-radius:9px; }
            .badge-srv { background:#ede9fe; color:#7c3aed; padding:1px 6px; border-radius:9px; }
        </style></head><body>
        <h2>Reporte de Compras</h2>
        <p>Período: ${fmtFecha(desde)} al ${fmtFecha(hasta)} &nbsp;|&nbsp; Generado: ${new Date().toLocaleString('es-EC')}</p>
        <table>
            <thead><tr>
                <th>Fecha</th><th>Tipo</th><th>Proveedor</th><th>Factura</th>
                <th class="right">Base</th><th class="right">IVA</th><th class="right">Total</th>
                <th>Pago</th><th>Estado</th>
            </tr></thead>
            <tbody>
            ${visibles.map(c => `<tr>
                <td>${fmtFecha(c.fecha_emision ?? c.fecha_ingreso)}</td>
                <td><span class="${c.tipo_compra === 'INVENTARIO' ? 'badge-inv' : 'badge-srv'}">${c.tipo_compra === 'INVENTARIO' ? 'Inventario' : 'Servicio'}</span></td>
                <td>${(c.proveedor as any)?.nombre_empresa ?? ''}</td>
                <td>${c.estab && c.pto_emi && c.secuencial ? `${c.estab}-${c.pto_emi}-${c.secuencial}` : (c.numero_factura ?? '')}</td>
                <td class="right">$${((c.subtotal ?? 0) || c.total - (c.valor_iva ?? 0)).toFixed(2)}</td>
                <td class="right">$${(c.valor_iva ?? 0).toFixed(2)}</td>
                <td class="right"><b>$${c.total.toFixed(2)}</b></td>
                <td>${c.forma_pago}</td>
                <td>${c.estado}</td>
            </tr>`).join('')}
            </tbody>
            <tfoot><tr>
                <td colspan="4">Totales (${visibles.filter(c => c.estado === 'ACTIVO').length} activas)</td>
                <td class="right">$${visibles.filter(c => c.estado === 'ACTIVO').reduce((s, c) => s + (c.subtotal ?? c.total - (c.valor_iva ?? 0)), 0).toFixed(2)}</td>
                <td class="right">$${totalIva.toFixed(2)}</td>
                <td class="right">$${totalComprado.toFixed(2)}</td>
                <td colspan="2" />
            </tr></tfoot>
        </table>
        </body></html>`
        const w = window.open('', '_blank')
        if (!w) return
        w.document.write(html)
        w.document.close()
        w.focus()
        w.print()
    }

    return (
        <div className="space-y-5">
            {msgBanner && (
                <div className={cn('flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-sm font-medium',
                    msgBanner.startsWith('✓') ? 'bg-green-50 text-green-800 border border-green-200'
                                              : 'bg-amber-50 text-amber-800 border border-amber-200')}>
                    <span>{msgBanner}</span>
                    <button onClick={() => setMsgBanner('')} className="shrink-0 text-slate-400 hover:text-slate-600">✕</button>
                </div>
            )}

            {/* Header — solo título y botones de reporte */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Compras</h1>
                    <p className="text-slate-500 text-sm">Inventario y servicios — consulta</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={imprimirReporte}
                        className="btn btn-secondary flex items-center gap-2 text-sm">
                        <Printer className="w-4 h-4" /> Imprimir
                    </button>
                    <button onClick={exportarExcel}
                        className="btn btn-secondary flex items-center gap-2 text-sm">
                        <Download className="w-4 h-4" /> Exportar XLSX
                    </button>
                </div>
            </div>

            {/* Resumen */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: 'Total comprado',  val: fmt(totalComprado), color: 'text-primary-700' },
                    { label: 'IVA en compras',  val: fmt(totalIva),       color: 'text-slate-700'  },
                    { label: 'Inventario',       val: ctdInventario,       color: 'text-blue-700'   },
                    { label: 'Servicios',        val: ctdServicio,         color: 'text-purple-700' },
                ].map(s => (
                    <div key={s.label} className="card p-4 text-center">
                        <p className="text-xs text-slate-400 mb-1">{s.label}</p>
                        <p className={`text-xl font-bold ${s.color}`}>{s.val}</p>
                    </div>
                ))}
            </div>

            {/* Filtros */}
            <div className="card p-4 space-y-3">
                <div className="flex gap-3 flex-wrap">
                    <div className="relative flex-1 min-w-52">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input className="input pl-9 w-full" placeholder="Factura, proveedor, clave acceso..."
                            value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                    </div>
                    <button onClick={() => setFiltrosOpen(v => !v)}
                        className={cn('btn btn-secondary flex items-center gap-2 text-sm', filtrosOpen && 'bg-slate-100')}>
                        <Filter className="w-4 h-4" />
                        Filtros
                        <ChevronDown className={cn('w-3 h-3 transition-transform', filtrosOpen && 'rotate-180')} />
                    </button>
                    <button onClick={loadAll} className="btn btn-secondary p-2.5" title="Recargar">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                </div>

                {filtrosOpen && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2 border-t border-slate-100">
                        <div>
                            <label className="label text-xs">Tipo</label>
                            <select className="input text-sm" value={filtroTipo}
                                onChange={e => setFiltroTipo(e.target.value)}>
                                <option value="">Todos</option>
                                <option value="INVENTARIO">Inventario</option>
                                <option value="SERVICIO">Servicio</option>
                            </select>
                        </div>
                        <div>
                            <label className="label text-xs">Estado</label>
                            <select className="input text-sm" value={filtroEst}
                                onChange={e => setFiltroEst(e.target.value)}>
                                <option value="">Todos</option>
                                <option value="ACTIVO">Activo</option>
                                <option value="ANULADO">Anulado</option>
                                <option value="DEVUELTO">Devuelto</option>
                            </select>
                        </div>
                        <div>
                            <label className="label text-xs">Proveedor</label>
                            <select className="input text-sm" value={filtroProv}
                                onChange={e => setFiltroProv(e.target.value)}>
                                <option value="">Todos</option>
                                {proveedores.map(p => (
                                    <option key={p.id} value={p.id}>{p.nombre_empresa}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="label text-xs">Desde</label>
                            <input type="date" className="input text-sm" value={desde}
                                onChange={e => setDesde(e.target.value)} />
                        </div>
                        <div>
                            <label className="label text-xs">Hasta</label>
                            <input type="date" className="input text-sm" value={hasta}
                                onChange={e => setHasta(e.target.value)} />
                        </div>
                        <div className="col-span-full flex justify-end">
                            <button onClick={loadAll} className="btn btn-primary text-sm px-6">
                                Aplicar filtros
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Tabla */}
            <div className="card overflow-hidden">
                {error ? (
                    <div className="flex items-center justify-center py-16 gap-2 text-red-500 text-sm">
                        <AlertCircle className="w-5 h-5 shrink-0" /> Error al cargar: {error}
                    </div>
                ) : loading ? (
                    <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin" /> Cargando...
                    </div>
                ) : visibles.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                        <ShoppingCart className="w-12 h-12 mb-3 text-slate-200" />
                        <p className="font-medium">No hay compras en este período</p>
                        <p className="text-sm mt-1">Ajusta los filtros o registra una nueva compra</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    {['Fecha','Tipo','Proveedor','Factura','Base','IVA','Total','Pago','Estado',''].map(h => (
                                        <th key={h} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {visibles.map(c => (
                                    <tr key={c.id} className={cn(
                                        'hover:bg-slate-50 transition-colors',
                                        c.estado === 'ANULADO' && 'opacity-50'
                                    )}>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="flex items-center gap-1.5 text-slate-600">
                                                <Calendar className="w-3 h-3 text-slate-400" />
                                                {fmtFecha(c.fecha_emision ?? c.fecha_ingreso)}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={cn(
                                                'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium',
                                                c.tipo_compra === 'INVENTARIO'
                                                    ? 'bg-blue-100 text-blue-700'
                                                    : 'bg-purple-100 text-purple-700'
                                            )}>
                                                {c.tipo_compra === 'INVENTARIO'
                                                    ? <Package className="w-3 h-3" />
                                                    : <Wrench className="w-3 h-3" />}
                                                {c.tipo_compra === 'INVENTARIO' ? 'Inventario' : 'Servicio'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 max-w-[160px]">
                                            <p className="font-medium text-slate-800 truncate">
                                                {(c.proveedor as any)?.nombre_empresa ?? '—'}
                                            </p>
                                            <p className="text-xs text-slate-400">{(c.proveedor as any)?.ruc}</p>
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                                            {c.numero_factura
                                                ? c.estab && c.pto_emi && c.secuencial
                                                    ? `${c.estab}-${c.pto_emi}-${c.secuencial}`
                                                    : c.numero_factura
                                                : <span className="text-slate-300">—</span>
                                            }
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-slate-700">
                                            {fmt((c.subtotal ?? 0) || (c.total - (c.valor_iva ?? 0)))}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-slate-600">
                                            {fmt(c.valor_iva ?? 0)}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">
                                            {fmt(c.total)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={cn(
                                                'text-xs px-2 py-0.5 rounded-full font-medium',
                                                c.forma_pago === 'CREDITO'
                                                    ? 'bg-amber-100 text-amber-700'
                                                    : 'bg-slate-100 text-slate-600'
                                            )}>
                                                {c.forma_pago === 'CREDITO'
                                                    ? `Crédito${c.fecha_vencimiento ? ' ' + fmtFecha(c.fecha_vencimiento) : ''}`
                                                    : 'Contado'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={cn(
                                                'text-xs px-2 py-0.5 rounded-full font-semibold',
                                                ESTADO_BADGE[c.estado] ?? 'bg-slate-100 text-slate-600'
                                            )}>
                                                {c.estado}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={() => setDetalleId(c.id)}
                                                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-primary-600"
                                                    title="Ver detalle"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </button>
                                                {c.estado === 'ACTIVO' && (
                                                    <button
                                                        onClick={() => handleAnular(c)}
                                                        disabled={anulando === c.id}
                                                        className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-600"
                                                        title="Anular"
                                                    >
                                                        {anulando === c.id
                                                            ? <Loader2 className="w-4 h-4 animate-spin" />
                                                            : <Ban className="w-4 h-4" />}
                                                    </button>
                                                )}
                                                {c.estado === 'ANULADO' && c.motivo_anulacion && (
                                                    <span title={c.motivo_anulacion}>
                                                        <AlertCircle className="w-4 h-4 text-red-400" />
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                                <tr>
                                    <td colSpan={4} className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">
                                        Totales ({visibles.filter(c => c.estado === 'ACTIVO').length} compras activas)
                                    </td>
                                    <td className="px-4 py-3 text-right font-bold text-sm font-mono">
                                        {fmt(visibles.filter(c => c.estado === 'ACTIVO').reduce((s, c) => s + (c.subtotal ?? c.total - (c.valor_iva ?? 0)), 0))}
                                    </td>
                                    <td className="px-4 py-3 text-right font-bold text-sm font-mono">
                                        {fmt(visibles.filter(c => c.estado === 'ACTIVO').reduce((s, c) => s + (c.valor_iva ?? 0), 0))}
                                    </td>
                                    <td className="px-4 py-3 text-right font-bold text-sm font-mono text-primary-700">
                                        {fmt(totalComprado)}
                                    </td>
                                    <td colSpan={3} />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal detalle */}
            {detalleId && (
                <DetalleModal id={detalleId} onClose={() => setDetalleId(null)} />
            )}
        </div>
    )
}
