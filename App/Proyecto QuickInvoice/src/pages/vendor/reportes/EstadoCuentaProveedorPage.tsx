import { useState, useEffect, useRef } from 'react'
import { useReactToPrint } from 'react-to-print'
import * as XLSX from 'xlsx'
import { useAuth } from '../../../contexts/AuthContext'
import { supabase } from '../../../lib/supabase'
import { proveedorService } from '../../../services/vendorService'
import type { Proveedor } from '../../../types/vendors'
import { FileText, Loader2, Building2, Printer, Download, Search } from 'lucide-react'
import { cn } from '../../../lib/utils'

const HOY         = new Date().toISOString().split('T')[0]
const PRIMER_DIA  = `${new Date().getFullYear()}-01-01`

const PRINT_CSS = `
    @page { size: A4 portrait; margin: 15mm 18mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5px; color: #111; }
    .rpt-header {
        display: flex; justify-content: space-between; align-items: flex-start;
        border-bottom: 3px solid #1e3a5f; padding-bottom: 10px; margin-bottom: 14px;
    }
    .rpt-header-left .emp-nombre {
        font-size: 16px; font-weight: 900; color: #1e3a5f; text-transform: uppercase; letter-spacing: 0.5px;
    }
    .rpt-header-left .emp-ruc { font-size: 10px; color: #555; margin-top: 2px; }
    .rpt-header-left .emp-dir { font-size: 10px; color: #777; margin-top: 1px; }
    .rpt-header-right { text-align: right; }
    .rpt-header-right .rpt-titulo {
        font-size: 14px; font-weight: 900; text-transform: uppercase;
        color: #1e3a5f; letter-spacing: 1px;
    }
    .rpt-header-right .rpt-subtitulo { font-size: 11px; color: #555; margin-top: 2px; font-weight: bold; }
    .rpt-header-right .rpt-periodo  { font-size: 10px; color: #777; margin-top: 2px; }
    .rpt-header-right .rpt-gen      { font-size: 9px;  color: #aaa; margin-top: 4px; }
    .prov-ficha {
        border: 1px solid #c8d0e0; border-radius: 5px;
        padding: 10px 14px; margin-bottom: 14px;
        background: #f8fafd;
        display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px;
    }
    .prov-ficha-titulo {
        grid-column: 1 / -1; font-size: 9px; font-weight: 900; text-transform: uppercase;
        color: #1e3a5f; letter-spacing: 0.8px; margin-bottom: 6px;
        border-bottom: 1px solid #c8d0e0; padding-bottom: 4px;
    }
    .prov-row { display: flex; gap: 6px; align-items: baseline; }
    .prov-label { font-size: 9px; font-weight: bold; color: #666; text-transform: uppercase; white-space: nowrap; }
    .prov-value { font-size: 10.5px; color: #111; }
    .mov-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
    .mov-table thead tr { background: #1e3a5f; color: #fff; }
    .mov-table thead th {
        padding: 6px 8px; font-size: 9px; text-transform: uppercase;
        letter-spacing: 0.5px; font-weight: bold; white-space: nowrap;
    }
    .mov-table thead th.r { text-align: right; }
    .mov-table tbody tr.alt { background: #f4f7fc; }
    .mov-table tbody td { padding: 4.5px 8px; border-bottom: 1px solid #e4e9f2; font-size: 10px; }
    .mov-table tbody td.r { text-align: right; font-family: 'Courier New', monospace; }
    .mov-table tbody td.cargo  { color: #b91c1c; font-weight: 600; }
    .mov-table tbody td.abono  { color: #15803d; font-weight: 600; }
    .mov-table tbody td.saldo-pos { color: #b45309; font-weight: bold; }
    .mov-table tbody td.saldo-ok  { color: #15803d; font-weight: bold; }
    .mov-table tfoot tr { background: #1e3a5f; color: #fff; border-top: 2px solid #0f2040; }
    .mov-table tfoot td { padding: 6px 8px; font-size: 10px; font-weight: bold; }
    .mov-table tfoot td.r { text-align: right; font-family: 'Courier New', monospace; }
    .badge {
        display: inline-block; padding: 1px 6px; border-radius: 99px;
        font-size: 8.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.3px;
    }
    .badge-fact { background: #fee2e2; color: #b91c1c; }
    .badge-pago { background: #dcfce7; color: #15803d; }
    .badge-ret  { background: #dbeafe; color: #1d4ed8; }
    .saldo-box {
        margin-left: auto; width: 280px;
        border: 2px solid #1e3a5f; border-radius: 5px;
        overflow: hidden; margin-bottom: 18px;
    }
    .saldo-box-titulo {
        background: #1e3a5f; color: #fff; text-align: center;
        font-size: 9px; font-weight: 900; text-transform: uppercase;
        letter-spacing: 1px; padding: 4px;
    }
    .saldo-box-row {
        display: flex; justify-content: space-between; align-items: center;
        padding: 5px 12px; border-bottom: 1px solid #e4e9f2; font-size: 10px;
    }
    .saldo-box-row:last-child { border-bottom: none; }
    .saldo-box-row.total { background: #f0f4ff; padding: 7px 12px; }
    .saldo-box-row .lbl { color: #444; }
    .saldo-box-row .val { font-family: 'Courier New', monospace; font-weight: bold; }
    .saldo-box-row.total .val { font-size: 14px; }
    .val-pos { color: #b45309; }
    .val-neg { color: #15803d; }
    .rpt-footer {
        margin-top: 24px; border-top: 1px solid #cbd5e0;
        padding-top: 8px;
        display: flex; justify-content: space-between; align-items: center;
    }
    .rpt-footer .footer-note { font-size: 8.5px; color: #94a3b8; }
    .rpt-footer .footer-conf { font-size: 8px; color: #94a3b8; text-align: right; font-style: italic; }
    .rpt-footer .footer-page { font-size: 8.5px; color: #94a3b8; }
`

const fmt  = (n: number) => `$${n.toFixed(2)}`
const fmtF = (s?: string | null) =>
    s ? new Date(s + 'T12:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtFLong = (s?: string | null) =>
    s ? new Date(s + 'T12:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'

interface MovProveedor {
    fecha:       string
    tipo:        'FACTURA' | 'PAGO' | 'RETENCION'
    descripcion: string
    cargo:       number
    abono:       number
    saldo:       number
}

// ─────────────────────────────────────────────────────────────────────────────

export function EstadoCuentaProveedorPage() {
    const { empresa }                    = useAuth()
    const printRef                       = useRef<HTMLDivElement>(null)
    const [proveedores, setProveedores]  = useState<Proveedor[]>([])
    const [provId, setProvId]            = useState('')
    const [desde, setDesde]              = useState(PRIMER_DIA)
    const [hasta, setHasta]              = useState(HOY)
    const [movimientos, setMovimientos]  = useState<MovProveedor[]>([])
    const [loading, setLoading]          = useState(false)
    const [proveedor, setProveedor]      = useState<Proveedor | null>(null)
    const [errorMsg, setErrorMsg]        = useState('')

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: `EstadoCuenta_${proveedor?.nombre_empresa ?? 'proveedor'}_${desde}_${hasta}`,
        pageStyle: PRINT_CSS,
    })

    useEffect(() => {
        if (!empresa?.id) return
        proveedorService.listar(empresa.id)
            .then(setProveedores)
            .catch(e => setErrorMsg('Error cargando proveedores: ' + (e?.message ?? String(e))))
    }, [empresa?.id])

    async function consultar() {
        if (!provId || !empresa?.id) { alert('Selecciona un proveedor'); return }
        try {
            setLoading(true)
            setMovimientos([])
            const prov = proveedores.find(p => p.id === provId)
            setProveedor(prov ?? null)

            const [comprasRes, pagosRes, retencionesRes] = await Promise.allSettled([
                supabase
                    .from('ingresos_stock')
                    .select('id, numero_factura, fecha_emision, fecha_ingreso, total, estado')
                    .eq('empresa_id', empresa.id)
                    .eq('proveedor_id', provId)
                    .gte('fecha_ingreso', desde)
                    .lte('fecha_ingreso', hasta)
                    .order('fecha_ingreso'),
                supabase
                    .from('pagos_proveedores')
                    .select('fecha_pago, monto, forma_pago, numero_referencia, cxp_id')
                    .eq('empresa_id', empresa.id)
                    .eq('proveedor_id', provId)
                    .gte('fecha_pago', desde)
                    .lte('fecha_pago', hasta)
                    .order('fecha_pago'),
                supabase
                    .from('retenciones_compras')
                    .select('fecha_emision, valor, codigo_retencion, tipo')
                    .eq('empresa_id', empresa.id)
                    .eq('proveedor_id', provId)
                    .gte('fecha_emision', desde)
                    .lte('fecha_emision', hasta)
                    .eq('estado', 'ACTIVO')
                    .order('fecha_emision'),
            ])

            const compras     = comprasRes.status     === 'fulfilled' ? (comprasRes.value.data     ?? []) : []
            const pagos       = pagosRes.status       === 'fulfilled' ? (pagosRes.value.data       ?? []) : []
            const retenciones = retencionesRes.status === 'fulfilled' ? (retencionesRes.value.data ?? []) : []

            const todos = [
                ...compras.map(c     => ({ fecha: c.fecha_emision ?? c.fecha_ingreso, item: c, tipo: 'FACTURA'   as const })),
                ...pagos.map(p       => ({ fecha: p.fecha_pago,                       item: p, tipo: 'PAGO'      as const })),
                ...retenciones.map(r => ({ fecha: r.fecha_emision,                    item: r, tipo: 'RETENCION' as const })),
            ].sort((a, b) => a.fecha.localeCompare(b.fecha))

            let saldo = 0
            const movs: MovProveedor[] = []

            for (const { fecha, item, tipo } of todos) {
                if (tipo === 'FACTURA') {
                    if (item.estado === 'ANULADO') continue
                    saldo += item.total
                    movs.push({ fecha, tipo, descripcion: `Factura ${item.numero_factura ?? item.id.slice(0, 8)}`, cargo: item.total, abono: 0, saldo })
                } else if (tipo === 'PAGO') {
                    saldo -= item.monto
                    movs.push({ fecha, tipo, descripcion: `Pago ${item.forma_pago}${item.numero_referencia ? ' #' + item.numero_referencia : ''}`, cargo: 0, abono: item.monto, saldo })
                } else {
                    saldo -= item.valor
                    movs.push({ fecha, tipo, descripcion: `Retención ${item.tipo} cód. ${item.codigo_retencion}`, cargo: 0, abono: item.valor, saldo })
                }
            }

            setMovimientos(movs)
        } catch (e: any) {
            alert('Error: ' + e.message)
        } finally {
            setLoading(false)
        }
    }

    function exportarExcel() {
        if (!movimientos.length) return
        const filas = movimientos.map(m => ({
            'Fecha':        fmtF(m.fecha),
            'Tipo':         m.tipo,
            'Descripción':  m.descripcion,
            'Cargo (+)':    m.cargo   > 0 ? m.cargo   : '',
            'Abono (-)':    m.abono   > 0 ? m.abono   : '',
            'Saldo':        m.saldo,
        }))
        filas.push({
            'Fecha': '',
            'Tipo': 'TOTALES',
            'Descripción': `${movimientos.length} movimientos`,
            'Cargo (+)': totalCargos,
            'Abono (-)': totalAbonos,
            'Saldo':     saldoFinal,
        })
        const ws = XLSX.utils.json_to_sheet(filas)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Estado de Cuenta')
        XLSX.writeFile(wb, `EstadoCuenta_${proveedor?.nombre_empresa ?? 'proveedor'}_${desde}_${hasta}.xlsx`)
    }

    const saldoFinal  = movimientos.length > 0 ? movimientos[movimientos.length - 1].saldo : 0
    const totalCargos = movimientos.reduce((s, m) => s + m.cargo, 0)
    const totalAbonos = movimientos.reduce((s, m) => s + m.abono, 0)

    const generadoEl  = new Date().toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' } as any)

    // ── UI ────────────────────────────────────────────────────────────────────

    return (
        <div className="space-y-5">

            {errorMsg && (
                <div className="card px-4 py-3 bg-red-50 border-red-200 text-red-700 text-sm">{errorMsg}</div>
            )}

            {/* Título pantalla */}
            <div className="flex items-start justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Estado de Cuenta por Proveedor</h1>
                    <p className="text-slate-500 text-sm">Historial de facturas, pagos y retenciones</p>
                </div>
                {movimientos.length > 0 && (
                    <div className="flex gap-2">
                        <button onClick={exportarExcel}
                            className="btn btn-secondary gap-2 text-sm text-emerald-700 border-emerald-200 hover:bg-emerald-50">
                            <Download className="w-4 h-4" /> Excel
                        </button>
                        <button onClick={() => handlePrint()}
                            className="btn btn-secondary gap-2 text-sm">
                            <Printer className="w-4 h-4" /> Imprimir
                        </button>
                    </div>
                )}
            </div>

            {/* Filtros */}
            <div className="card p-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-2">
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5">
                            Proveedor <span className="text-red-500">*</span>
                        </label>
                        <select className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-primary-400 bg-white"
                            value={provId} onChange={e => setProvId(e.target.value)}>
                            <option value="">Seleccionar proveedor...</option>
                            {proveedores.map(p => (
                                <option key={p.id} value={p.id}>{p.nombre_empresa} — {p.ruc}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5">Desde</label>
                        <input type="date" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-primary-400"
                            value={desde} onChange={e => setDesde(e.target.value)} />
                    </div>
                    <div>
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5">Hasta</label>
                        <input type="date" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-primary-400"
                            value={hasta} onChange={e => setHasta(e.target.value)} />
                    </div>
                </div>
                <button onClick={consultar} disabled={!provId || loading}
                    className="btn btn-primary gap-2 text-sm">
                    {loading
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Consultando...</>
                        : <><Search className="w-4 h-4" /> Generar estado de cuenta</>
                    }
                </button>
            </div>

            {/* Resumen en pantalla */}
            {proveedor && movimientos.length > 0 && (
                <div className="card p-5 flex items-start gap-4">
                    <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center shrink-0">
                        <Building2 className="w-6 h-6 text-primary-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-lg text-slate-900 truncate">{proveedor.nombre_empresa}</p>
                        <p className="text-slate-500 text-sm">RUC: {proveedor.ruc}
                            {proveedor.ciudad ? ` · ${proveedor.ciudad}` : ''}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">Período: {fmtF(desde)} — {fmtF(hasta)}</p>
                    </div>
                    <div className="text-right shrink-0 space-y-0.5">
                        <p className="text-xs text-slate-500">Cargos: <span className="font-mono font-semibold text-red-700">{fmt(totalCargos)}</span></p>
                        <p className="text-xs text-slate-500">Abonos: <span className="font-mono font-semibold text-green-700">{fmt(totalAbonos)}</span></p>
                        <p className={cn('text-xl font-black font-mono mt-1',
                            saldoFinal > 0.005 ? 'text-amber-700' : 'text-green-700')}>
                            {fmt(saldoFinal)}
                        </p>
                        <p className={cn('text-xs font-semibold',
                            saldoFinal > 0.005 ? 'text-amber-500' : 'text-green-500')}>
                            {saldoFinal > 0.005 ? 'Saldo pendiente' : 'Al día'}
                        </p>
                    </div>
                </div>
            )}

            {/* Tabla en pantalla */}
            {loading ? (
                <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin" /> Consultando...
                </div>
            ) : movimientos.length > 0 ? (
                <div className="card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-700 text-white text-xs uppercase tracking-wider">
                                <tr>
                                    <th className="px-4 py-3 text-left">Fecha</th>
                                    <th className="px-4 py-3 text-left">Tipo</th>
                                    <th className="px-4 py-3 text-left">Descripción</th>
                                    <th className="px-4 py-3 text-right">Cargo (+)</th>
                                    <th className="px-4 py-3 text-right">Abono (-)</th>
                                    <th className="px-4 py-3 text-right">Saldo</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {movimientos.map((m, i) => (
                                    <tr key={i} className={cn('hover:bg-slate-50 transition-colors',
                                        i % 2 !== 0 && 'bg-slate-50/40')}>
                                        <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">{fmtF(m.fecha)}</td>
                                        <td className="px-4 py-2.5">
                                            <span className={cn('inline-block text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide',
                                                m.tipo === 'FACTURA'   ? 'bg-red-100 text-red-700'    :
                                                m.tipo === 'PAGO'      ? 'bg-green-100 text-green-700' :
                                                                          'bg-blue-100 text-blue-700')}>
                                                {m.tipo === 'FACTURA' ? 'Factura' : m.tipo === 'PAGO' ? 'Pago' : 'Retención'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2.5 text-slate-700">{m.descripcion}</td>
                                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-red-700">
                                            {m.cargo > 0 ? fmt(m.cargo) : <span className="text-slate-300">—</span>}
                                        </td>
                                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-green-700">
                                            {m.abono > 0 ? fmt(m.abono) : <span className="text-slate-300">—</span>}
                                        </td>
                                        <td className={cn('px-4 py-2.5 text-right font-mono font-bold',
                                            m.saldo > 0.005 ? 'text-amber-700' : 'text-green-700')}>
                                            {fmt(m.saldo)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-slate-800 text-white">
                                <tr>
                                    <td colSpan={3} className="px-4 py-3 text-xs font-semibold">{movimientos.length} movimientos</td>
                                    <td className="px-4 py-3 text-right font-mono font-bold">{fmt(totalCargos)}</td>
                                    <td className="px-4 py-3 text-right font-mono font-bold">{fmt(totalAbonos)}</td>
                                    <td className={cn('px-4 py-3 text-right font-mono font-bold text-base',
                                        saldoFinal > 0.005 ? 'text-amber-300' : 'text-green-400')}>
                                        {fmt(saldoFinal)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            ) : !loading && provId && (
                <div className="text-center py-16 text-slate-400">
                    <FileText className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                    <p>Sin movimientos para el proveedor y período seleccionados</p>
                </div>
            )}

            {/* ══════════════════════════════════════════════════════
                ÁREA DE IMPRESIÓN — completamente aislada del UI
                Solo se renderiza al imprimir con useReactToPrint
            ══════════════════════════════════════════════════════ */}
            <div className="hidden">
                <div ref={printRef}>
                    {/* ── Encabezado de la empresa ── */}
                    <div className="rpt-header">
                        <div className="rpt-header-left">
                            <div className="emp-nombre">{empresa?.nombre ?? 'Empresa'}</div>
                            <div className="emp-ruc">RUC: {(empresa as any)?.ruc ?? '—'}</div>
                            {(empresa as any)?.direccion && (
                                <div className="emp-dir">{(empresa as any).direccion}</div>
                            )}
                        </div>
                        <div className="rpt-header-right">
                            <div className="rpt-titulo">Estado de Cuenta</div>
                            <div className="rpt-subtitulo">Proveedor</div>
                            <div className="rpt-periodo">
                                Período: {fmtFLong(desde)} al {fmtFLong(hasta)}
                            </div>
                            <div className="rpt-gen">Generado: {generadoEl}</div>
                        </div>
                    </div>

                    {/* ── Ficha del proveedor ── */}
                    {proveedor && (
                        <div className="prov-ficha">
                            <div className="prov-ficha-titulo">Datos del Proveedor</div>
                            <div className="prov-row">
                                <span className="prov-label">Razón Social:</span>
                                <span className="prov-value" style={{ fontWeight: 'bold' }}>{proveedor.nombre_empresa}</span>
                            </div>
                            <div className="prov-row">
                                <span className="prov-label">RUC / Identificación:</span>
                                <span className="prov-value">{proveedor.ruc}</span>
                            </div>
                            {proveedor.nombre_encargado && (
                                <div className="prov-row">
                                    <span className="prov-label">Contacto:</span>
                                    <span className="prov-value">{proveedor.nombre_encargado}</span>
                                </div>
                            )}
                            {proveedor.correo && (
                                <div className="prov-row">
                                    <span className="prov-label">Email:</span>
                                    <span className="prov-value">{proveedor.correo}</span>
                                </div>
                            )}
                            {proveedor.telefono && (
                                <div className="prov-row">
                                    <span className="prov-label">Teléfono:</span>
                                    <span className="prov-value">{proveedor.telefono}</span>
                                </div>
                            )}
                            {(proveedor.ciudad || proveedor.provincia) && (
                                <div className="prov-row">
                                    <span className="prov-label">Ciudad / Provincia:</span>
                                    <span className="prov-value">
                                        {[proveedor.ciudad, proveedor.provincia].filter(Boolean).join(', ')}
                                    </span>
                                </div>
                            )}
                            {proveedor.direccion && (
                                <div className="prov-row" style={{ gridColumn: '1 / -1' }}>
                                    <span className="prov-label">Dirección:</span>
                                    <span className="prov-value">{proveedor.direccion}</span>
                                </div>
                            )}
                            <div className="prov-row">
                                <span className="prov-label">Condición de pago:</span>
                                <span className="prov-value">
                                    {proveedor.condicion_pago === 'CREDITO'
                                        ? `Crédito${proveedor.dias_credito ? ` ${proveedor.dias_credito} días` : ''}`
                                        : 'Contado'}
                                </span>
                            </div>
                            {proveedor.agente_retencion && (
                                <div className="prov-row">
                                    <span className="prov-label">Agente retención:</span>
                                    <span className="prov-value">Sí</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Tabla de movimientos ── */}
                    <table className="mov-table">
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'left',  width: '82px' }}>Fecha</th>
                                <th style={{ textAlign: 'left',  width: '76px' }}>Tipo</th>
                                <th style={{ textAlign: 'left'               }}>Descripción</th>
                                <th style={{ textAlign: 'right', width: '88px' }}>Cargo (+)</th>
                                <th style={{ textAlign: 'right', width: '88px' }}>Abono (-)</th>
                                <th style={{ textAlign: 'right', width: '88px' }}>Saldo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {movimientos.map((m, i) => (
                                <tr key={i} className={i % 2 !== 0 ? 'alt' : ''}>
                                    <td>{fmtF(m.fecha)}</td>
                                    <td>
                                        <span className={cn('badge',
                                            m.tipo === 'FACTURA'   ? 'badge-fact' :
                                            m.tipo === 'PAGO'      ? 'badge-pago' : 'badge-ret')}>
                                            {m.tipo === 'FACTURA' ? 'Factura' : m.tipo === 'PAGO' ? 'Pago' : 'Ret.'}
                                        </span>
                                    </td>
                                    <td>{m.descripcion}</td>
                                    <td className={cn('r', m.cargo > 0 ? 'cargo' : '')} style={{ color: m.cargo === 0 ? '#ccc' : undefined }}>
                                        {m.cargo > 0 ? fmt(m.cargo) : '—'}
                                    </td>
                                    <td className={cn('r', m.abono > 0 ? 'abono' : '')} style={{ color: m.abono === 0 ? '#ccc' : undefined }}>
                                        {m.abono > 0 ? fmt(m.abono) : '—'}
                                    </td>
                                    <td className={cn('r', m.saldo > 0.005 ? 'saldo-pos' : 'saldo-ok')}>
                                        {fmt(m.saldo)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colSpan={3} style={{ fontSize: '9px', color: '#ccd3e0' }}>
                                    {movimientos.length} movimiento{movimientos.length !== 1 ? 's' : ''} en el período
                                </td>
                                <td className="r">{fmt(totalCargos)}</td>
                                <td className="r">{fmt(totalAbonos)}</td>
                                <td className="r" style={{ fontSize: '11px', color: saldoFinal > 0.005 ? '#fbbf24' : '#86efac' }}>
                                    {fmt(saldoFinal)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>

                    {/* ── Caja resumen de saldo ── */}
                    <div className="saldo-box">
                        <div className="saldo-box-titulo">Resumen del Período</div>
                        <div className="saldo-box-row">
                            <span className="lbl">Total Facturas (cargos):</span>
                            <span className="val val-pos">{fmt(totalCargos)}</span>
                        </div>
                        <div className="saldo-box-row">
                            <span className="lbl">Total Pagos + Retenciones:</span>
                            <span className="val val-neg">{fmt(totalAbonos)}</span>
                        </div>
                        <div className="saldo-box-row total">
                            <span className="lbl" style={{ fontWeight: 'bold' }}>
                                {saldoFinal > 0.005 ? 'SALDO PENDIENTE:' : 'SALDO:'}
                            </span>
                            <span className={cn('val', saldoFinal > 0.005 ? 'val-pos' : 'val-neg')}>
                                {fmt(Math.abs(saldoFinal))}
                            </span>
                        </div>
                    </div>

                    {/* ── Pie de página ── */}
                    <div className="rpt-footer">
                        <div className="footer-note">
                            QuickInvoice — Finance Suite · Billennium System
                        </div>
                        <div className="footer-conf">
                            Documento confidencial — uso exclusivo de {empresa?.nombre ?? 'la empresa'}
                        </div>
                        <div className="footer-page">
                            {generadoEl}
                        </div>
                    </div>

                </div>
            </div>
            {/* ── Fin área de impresión ── */}

        </div>
    )
}
