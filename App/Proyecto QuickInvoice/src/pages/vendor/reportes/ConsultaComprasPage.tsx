import { useState, useEffect, useRef } from 'react'
import { useReactToPrint } from 'react-to-print'
import { useAuth } from '../../../contexts/AuthContext'
import { compraService, proveedorService } from '../../../services/vendorService'
import type { Compra, Proveedor } from '../../../types/vendors'
import { Search, RefreshCw, Loader2, FileText, Package, Wrench } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { PrintExportBar } from '../../../components/vendor/PrintExportBar'

const HOY = new Date().toISOString().split('T')[0]
const PRIMER_DIA_MES = `${new Date().getFullYear()}-01-01`
const fmt  = (n: number) => `$${n.toFixed(2)}`
const fmtF = (s?: string | null) =>
    s ? new Date(s + 'T12:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtFLong = (s?: string | null) =>
    s ? new Date(s + 'T12:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'

const PRINT_CSS = `
    @page { size: A4 landscape; margin: 12mm 15mm; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5px; color:#111; }
    .rpt-header { display:flex; justify-content:space-between; align-items:flex-start;
        border-bottom:3px solid #1e3a5f; padding-bottom:8px; margin-bottom:12px; }
    .rpt-header .emp-nombre { font-size:15px; font-weight:900; color:#1e3a5f; text-transform:uppercase; }
    .rpt-header .emp-sub { font-size:9px; color:#666; margin-top:2px; }
    .rpt-header-right { text-align:right; }
    .rpt-titulo  { font-size:13px; font-weight:900; text-transform:uppercase; color:#1e3a5f; letter-spacing:1px; }
    .rpt-periodo { font-size:9.5px; color:#555; margin-top:2px; font-weight:bold; }
    .rpt-gen     { font-size:8px; color:#aaa; margin-top:3px; }
    .filtros-bar { display:flex; gap:16px; flex-wrap:wrap; padding:6px 0; margin-bottom:10px;
        border-bottom:1px solid #e4e9f2; font-size:8.5px; color:#666; }
    .filtros-bar span { font-weight:bold; color:#333; }
    .kpi-row { display:flex; gap:10px; margin-bottom:12px; }
    .kpi-box { flex:1; border:1px solid #c8d0e0; border-radius:4px; padding:6px 10px;
        text-align:center; background:#f8fafd; }
    .kpi-label { font-size:8px; text-transform:uppercase; color:#888; }
    .kpi-val   { font-size:13px; font-weight:900; margin-top:2px; }
    .kpi-blue   { color:#1d4ed8; }
    .kpi-purple { color:#7c3aed; }
    .kpi-slate  { color:#475569; }
    .kpi-main   { color:#0f5099; }
    table { width:100%; border-collapse:collapse; }
    thead tr { background:#1e3a5f; color:#fff; }
    thead th { padding:5px 7px; font-size:8.5px; text-transform:uppercase;
        letter-spacing:0.4px; font-weight:bold; white-space:nowrap; }
    thead th.r { text-align:right; }
    tbody tr.alt { background:#f4f7fc; }
    tbody td { padding:3.5px 7px; border-bottom:1px solid #e4e9f2; font-size:9px; }
    tbody td.r { text-align:right; font-family:'Courier New',monospace; }
    tbody tr.anulada { opacity:0.45; }
    tfoot tr { background:#1e3a5f; color:#fff; }
    tfoot td { padding:5px 7px; font-size:9px; font-weight:bold; }
    tfoot td.r { text-align:right; font-family:'Courier New',monospace; }
    .badge { display:inline-block; padding:1px 5px; border-radius:99px;
        font-size:7.5px; font-weight:800; text-transform:uppercase; }
    .badge-inv   { background:#dbeafe; color:#1d4ed8; }
    .badge-serv  { background:#ede9fe; color:#6d28d9; }
    .badge-cred  { background:#fef3c7; color:#b45309; }
    .badge-cont  { background:#f1f5f9; color:#475569; }
    .badge-act   { background:#dcfce7; color:#15803d; }
    .badge-anu   { background:#fee2e2; color:#b91c1c; }
    .rpt-footer { margin-top:16px; border-top:1px solid #cbd5e0; padding-top:6px;
        display:flex; justify-content:space-between; font-size:8px; color:#94a3b8; }
`

export function ConsultaComprasPage() {
    const { empresa } = useAuth()
    const printRef = useRef<HTMLDivElement>(null)
    const [compras, setCompras]         = useState<Compra[]>([])
    const [proveedores, setProveedores] = useState<Proveedor[]>([])
    const [loading, setLoading]         = useState(false)

    const [desde, setDesde]       = useState(PRIMER_DIA_MES)
    const [hasta, setHasta]       = useState(HOY)
    const [tipo, setTipo]         = useState('')
    const [estado, setEstado]     = useState('')
    const [provId, setProvId]     = useState('')
    const [busqueda, setBusqueda] = useState('')

    const filtersRef = useRef({ desde, hasta, tipo, estado, provId })
    filtersRef.current = { desde, hasta, tipo, estado, provId }

    const [errorMsg, setErrorMsg] = useState('')

    useEffect(() => {
        if (!empresa?.id) return
        proveedorService.listar(empresa.id)
            .then(setProveedores)
            .catch(e => setErrorMsg('Error: ' + (e?.message ?? JSON.stringify(e))))
    }, [empresa?.id])

    useEffect(() => {
        if (!empresa?.id) return
        const eid = empresa.id
        const { desde: d, hasta: h, tipo: t, estado: e, provId: p } = filtersRef.current
        let cancelled = false
        setLoading(true)
        compraService.listar(eid, { tipo: t || undefined, estado: e || undefined, proveedorId: p || undefined, desde: d, hasta: h })
            .then(data => { if (!cancelled) setCompras(data) })
            .catch(err => { if (!cancelled) alert('Error: ' + err.message) })
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [empresa?.id])

    async function buscar() {
        if (!empresa?.id) return
        try {
            setLoading(true)
            const data = await compraService.listar(empresa.id, {
                tipo: tipo || undefined,
                estado: estado || undefined,
                proveedorId: provId || undefined,
                desde, hasta,
            })
            setCompras(data)
        } catch (e: any) { alert('Error: ' + e.message) }
        finally { setLoading(false) }
    }

    const visibles = compras.filter(c => {
        if (!busqueda) return true
        const q = busqueda.toLowerCase()
        return (
            c.numero_factura?.toLowerCase().includes(q) ||
            (c.proveedor as any)?.nombre_empresa?.toLowerCase().includes(q) ||
            (c.proveedor as any)?.ruc?.includes(q)
        )
    })

    const totalActivas    = visibles.filter(c => c.estado === 'ACTIVO').reduce((s, c) => s + c.total, 0)
    const totalIva        = visibles.filter(c => c.estado === 'ACTIVO').reduce((s, c) => s + (c.valor_iva ?? 0), 0)
    const totalInventario = visibles.filter(c => c.tipo_compra === 'INVENTARIO' && c.estado === 'ACTIVO').reduce((s, c) => s + c.total, 0)
    const totalServicio   = visibles.filter(c => c.tipo_compra === 'SERVICIO'   && c.estado === 'ACTIVO').reduce((s, c) => s + c.total, 0)
    const generadoEl      = new Date().toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' } as any)

    const labelProv = provId ? proveedores.find(p => p.id === provId)?.nombre_empresa : ''

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: `Compras_${desde}_${hasta}`,
        pageStyle: PRINT_CSS,
    })

    return (
        <div className="space-y-5">
            {errorMsg && (
                <div className="card px-4 py-3 bg-red-50 border-red-200 text-red-700 text-sm">{errorMsg}</div>
            )}

            <div>
                <h1 className="text-2xl font-bold text-slate-900">Consulta de Compras por Período</h1>
                <p className="text-slate-500 text-sm">Inventario y servicios con filtros por fecha, tipo y proveedor</p>
            </div>

            {/* Filtros */}
            <div className="card p-4 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div><label className="label text-xs">Desde</label>
                        <input type="date" className="input text-sm" value={desde} onChange={e => setDesde(e.target.value)} /></div>
                    <div><label className="label text-xs">Hasta</label>
                        <input type="date" className="input text-sm" value={hasta} onChange={e => setHasta(e.target.value)} /></div>
                    <div><label className="label text-xs">Tipo</label>
                        <select className="input text-sm" value={tipo} onChange={e => setTipo(e.target.value)}>
                            <option value="">Todos</option>
                            <option value="INVENTARIO">Inventario</option>
                            <option value="SERVICIO">Servicio</option>
                        </select></div>
                    <div><label className="label text-xs">Estado</label>
                        <select className="input text-sm" value={estado} onChange={e => setEstado(e.target.value)}>
                            <option value="">Todos</option>
                            <option value="ACTIVO">Activo</option>
                            <option value="ANULADO">Anulado</option>
                        </select></div>
                    <div><label className="label text-xs">Proveedor</label>
                        <select className="input text-sm" value={provId} onChange={e => setProvId(e.target.value)}>
                            <option value="">Todos</option>
                            {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre_empresa}</option>)}
                        </select></div>
                </div>
                <div className="flex gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input className="input pl-9 text-sm" placeholder="Buscar factura, proveedor, RUC..."
                            value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                    </div>
                    <button onClick={buscar} className="btn btn-primary flex items-center gap-2 text-sm">
                        <RefreshCw className="w-4 h-4" /> Consultar
                    </button>
                </div>
            </div>

            <PrintExportBar
                datos={visibles.map(c => ({
                    Fecha:     c.fecha_emision ?? c.fecha_ingreso,
                    Tipo:      c.tipo_compra,
                    Proveedor: (c.proveedor as any)?.nombre_empresa ?? '',
                    RUC:       (c.proveedor as any)?.ruc ?? '',
                    Factura:   c.numero_factura ?? '',
                    Subtotal:  c.subtotal ?? 0,
                    IVA:       c.valor_iva ?? 0,
                    Total:     c.total,
                    FormaPago: c.forma_pago,
                    Estado:    c.estado,
                }))}
                nombreArchivo={`compras_${desde}_${hasta}`}
                onPrint={() => handlePrint()}
            />

            {/* Resumen */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: 'Total compras activas', val: fmt(totalActivas),    color: 'text-primary-700' },
                    { label: 'IVA total',              val: fmt(totalIva),        color: 'text-slate-700'   },
                    { label: 'Total inventario',       val: fmt(totalInventario), color: 'text-blue-700'    },
                    { label: 'Total servicios',        val: fmt(totalServicio),   color: 'text-purple-700'  },
                ].map(s => (
                    <div key={s.label} className="card p-4 text-center">
                        <p className="text-xs text-slate-400 mb-1">{s.label}</p>
                        <p className={`text-xl font-bold ${s.color}`}>{s.val}</p>
                    </div>
                ))}
            </div>

            {/* Tabla */}
            <div className="card overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin" /> Consultando...
                    </div>
                ) : visibles.length === 0 ? (
                    <div className="text-center py-16 text-slate-400">
                        <FileText className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                        <p>No hay compras en el período seleccionado</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b text-xs font-bold text-slate-500 uppercase">
                                <tr>
                                    {['Fecha','Tipo','Proveedor','Factura','Subtotal','IVA','Total','Forma pago','Estado'].map(h => (
                                        <th key={h} className="px-4 py-3 text-left whitespace-nowrap">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {visibles.map(c => {
                                    const TIcon = c.tipo_compra === 'INVENTARIO' ? Package : Wrench
                                    return (
                                        <tr key={c.id} className={cn('hover:bg-slate-50', c.estado === 'ANULADO' && 'opacity-50')}>
                                            <td className="px-4 py-3 whitespace-nowrap text-slate-600 text-xs">{fmtF(c.fecha_emision ?? c.fecha_ingreso)}</td>
                                            <td className="px-4 py-3">
                                                <span className={cn('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium',
                                                    c.tipo_compra === 'INVENTARIO' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700')}>
                                                    <TIcon className="w-3 h-3" />
                                                    {c.tipo_compra === 'INVENTARIO' ? 'Inventario' : 'Servicio'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 max-w-[140px]">
                                                <p className="font-medium text-slate-800 truncate">{(c.proveedor as any)?.nombre_empresa ?? '—'}</p>
                                                <p className="text-xs text-slate-400">{(c.proveedor as any)?.ruc}</p>
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs text-slate-500">{c.numero_factura || '—'}</td>
                                            <td className="px-4 py-3 text-right font-mono text-xs">{fmt(c.subtotal ?? 0)}</td>
                                            <td className="px-4 py-3 text-right font-mono text-xs">{fmt(c.valor_iva ?? 0)}</td>
                                            <td className="px-4 py-3 text-right font-mono font-semibold">{fmt(c.total)}</td>
                                            <td className="px-4 py-3">
                                                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                                                    c.forma_pago === 'CREDITO' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600')}>
                                                    {c.forma_pago === 'CREDITO' ? 'Crédito' : 'Contado'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold',
                                                    c.estado === 'ACTIVO'  ? 'bg-green-100 text-green-700' :
                                                    c.estado === 'ANULADO' ? 'bg-red-100 text-red-600'    : 'bg-slate-100 text-slate-500')}>
                                                    {c.estado}
                                                </span>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                            <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold text-sm">
                                <tr>
                                    <td colSpan={4} className="px-4 py-3 text-xs text-slate-500 uppercase">
                                        {visibles.filter(c => c.estado === 'ACTIVO').length} compras activas
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono">
                                        {fmt(visibles.filter(c=>c.estado==='ACTIVO').reduce((s,c)=>s+(c.subtotal??0),0))}
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono">{fmt(totalIva)}</td>
                                    <td className="px-4 py-3 text-right font-mono text-primary-700">{fmt(totalActivas)}</td>
                                    <td colSpan={2} />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>

            {/* ── ÁREA DE IMPRESIÓN ── */}
            <div className="hidden">
                <div ref={printRef}>
                    <div className="rpt-header">
                        <div>
                            <div className="emp-nombre">{empresa?.nombre ?? 'Empresa'}</div>
                            <div className="emp-sub">RUC: {(empresa as any)?.ruc ?? '—'}</div>
                        </div>
                        <div className="rpt-header-right">
                            <div className="rpt-titulo">Consulta de Compras por Período</div>
                            <div className="rpt-periodo">
                                Período: {fmtFLong(desde)} al {fmtFLong(hasta)}
                            </div>
                            <div className="rpt-gen">Generado: {generadoEl}</div>
                        </div>
                    </div>

                    <div className="filtros-bar">
                        {tipo   && <div>Tipo: <span>{tipo === 'INVENTARIO' ? 'Inventario' : 'Servicio'}</span></div>}
                        {estado && <div>Estado: <span>{estado}</span></div>}
                        {labelProv && <div>Proveedor: <span>{labelProv}</span></div>}
                        <div>Registros: <span>{visibles.length}</span></div>
                    </div>

                    <div className="kpi-row">
                        <div className="kpi-box">
                            <div className="kpi-label">Total compras activas</div>
                            <div className={`kpi-val kpi-main`}>{fmt(totalActivas)}</div>
                        </div>
                        <div className="kpi-box">
                            <div className="kpi-label">IVA total</div>
                            <div className={`kpi-val kpi-slate`}>{fmt(totalIva)}</div>
                        </div>
                        <div className="kpi-box">
                            <div className="kpi-label">Total inventario</div>
                            <div className={`kpi-val kpi-blue`}>{fmt(totalInventario)}</div>
                        </div>
                        <div className="kpi-box">
                            <div className="kpi-label">Total servicios</div>
                            <div className={`kpi-val kpi-purple`}>{fmt(totalServicio)}</div>
                        </div>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th style={{textAlign:'left', width:'72px'}}>Fecha</th>
                                <th style={{textAlign:'left', width:'76px'}}>Tipo</th>
                                <th style={{textAlign:'left'}}>Proveedor</th>
                                <th style={{textAlign:'left', width:'80px'}}>Factura</th>
                                <th className="r" style={{width:'72px'}}>Subtotal</th>
                                <th className="r" style={{width:'60px'}}>IVA</th>
                                <th className="r" style={{width:'72px'}}>Total</th>
                                <th style={{textAlign:'left', width:'64px'}}>F.Pago</th>
                                <th style={{textAlign:'left', width:'60px'}}>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibles.map((c, i) => (
                                <tr key={c.id} className={`${i%2!==0?'alt':''} ${c.estado==='ANULADO'?'anulada':''}`}>
                                    <td>{fmtF(c.fecha_emision ?? c.fecha_ingreso)}</td>
                                    <td>
                                        <span className={c.tipo_compra==='INVENTARIO' ? 'badge badge-inv' : 'badge badge-serv'}>
                                            {c.tipo_compra==='INVENTARIO' ? 'Inventario' : 'Servicio'}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{fontWeight:'600'}}>{(c.proveedor as any)?.nombre_empresa ?? '—'}</div>
                                        <div style={{fontSize:'8px', color:'#888'}}>{(c.proveedor as any)?.ruc}</div>
                                    </td>
                                    <td style={{fontFamily:"'Courier New',monospace", fontSize:'8.5px', color:'#555'}}>{c.numero_factura || '—'}</td>
                                    <td className="r">{fmt(c.subtotal ?? 0)}</td>
                                    <td className="r">{fmt(c.valor_iva ?? 0)}</td>
                                    <td className="r" style={{fontWeight:'bold'}}>{fmt(c.total)}</td>
                                    <td>
                                        <span className={c.forma_pago==='CREDITO' ? 'badge badge-cred' : 'badge badge-cont'}>
                                            {c.forma_pago==='CREDITO' ? 'Crédito' : 'Contado'}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={c.estado==='ACTIVO' ? 'badge badge-act' : 'badge badge-anu'}>
                                            {c.estado}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colSpan={4} style={{fontSize:'8px', color:'#ccd3e0'}}>
                                    {visibles.filter(c=>c.estado==='ACTIVO').length} compras activas · {visibles.length} total registros
                                </td>
                                <td className="r">
                                    {fmt(visibles.filter(c=>c.estado==='ACTIVO').reduce((s,c)=>s+(c.subtotal??0),0))}
                                </td>
                                <td className="r">{fmt(totalIva)}</td>
                                <td className="r" style={{fontSize:'11px'}}>{fmt(totalActivas)}</td>
                                <td colSpan={2}></td>
                            </tr>
                        </tfoot>
                    </table>

                    <div className="rpt-footer">
                        <span>Corina ERP — Finance Suite · Billennium System</span>
                        <span>Documento confidencial — uso exclusivo de {empresa?.nombre ?? 'la empresa'}</span>
                        <span>{generadoEl}</span>
                    </div>
                </div>
            </div>
            {/* ── Fin área de impresión ── */}

        </div>
    )
}
