import { useState, useEffect, useRef } from 'react'
import { useReactToPrint } from 'react-to-print'
import { useAuth } from '../../../contexts/AuthContext'
import { cxpService, proveedorService } from '../../../services/vendorService'
import type { CuentaPorPagar, Proveedor } from '../../../types/vendors'
import { Wallet, AlertCircle, Clock, Loader2 } from 'lucide-react'
import { cn } from '../../../lib/utils'
import { PrintExportBar } from '../../../components/vendor/PrintExportBar'

const HOY = new Date().toISOString().split('T')[0]
const fmt  = (n: number) => `$${n.toFixed(2)}`
const fmtF = (s?: string | null) =>
    s ? new Date(s + 'T12:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtFLong = (s?: string | null) =>
    s ? new Date(s + 'T12:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'

const PRINT_CSS = `
    @page { size: A4 portrait; margin: 14mm 16mm; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5px; color:#111; }
    .rpt-header { display:flex; justify-content:space-between; align-items:flex-start;
        border-bottom:3px solid #1e3a5f; padding-bottom:8px; margin-bottom:12px; }
    .emp-nombre { font-size:15px; font-weight:900; color:#1e3a5f; text-transform:uppercase; }
    .emp-sub    { font-size:9px; color:#666; margin-top:2px; }
    .rpt-header-right { text-align:right; }
    .rpt-titulo  { font-size:13px; font-weight:900; color:#1e3a5f; text-transform:uppercase; letter-spacing:1px; }
    .rpt-corte   { font-size:9.5px; color:#555; font-weight:bold; margin-top:2px; }
    .rpt-gen     { font-size:8px; color:#aaa; margin-top:3px; }
    .filtros-bar { display:flex; gap:14px; flex-wrap:wrap;
        padding:5px 0; margin-bottom:10px;
        border-bottom:1px solid #e4e9f2; font-size:8.5px; color:#666; }
    .filtros-bar span { font-weight:bold; color:#333; }
    .aging-row { display:flex; gap:8px; margin-bottom:12px; }
    .aging-box { flex:1; border-radius:4px; padding:6px 8px; text-align:center; }
    .aging-label { font-size:7.5px; text-transform:uppercase; color:#555; }
    .aging-val   { font-size:12px; font-weight:900; margin-top:2px; font-family:'Courier New',monospace; }
    .ag-green  { background:#f0fdf4; }  .ag-green  .aging-val { color:#15803d; }
    .ag-amber  { background:#fffbeb; }  .ag-amber  .aging-val { color:#b45309; }
    .ag-orange { background:#fff7ed; }  .ag-orange .aging-val { color:#c2410c; }
    .ag-red    { background:#fef2f2; }  .ag-red    .aging-val { color:#b91c1c; }
    .ag-darkred{ background:#fee2e2; }  .ag-darkred .aging-val { color:#991b1b; }
    table { width:100%; border-collapse:collapse; }
    thead tr { background:#1e3a5f; color:#fff; }
    thead th { padding:5px 7px; font-size:8.5px; text-transform:uppercase; letter-spacing:0.4px; font-weight:bold; }
    thead th.r { text-align:right; }
    tbody tr.alt { background:#f4f7fc; }
    tbody tr.venc { background:#fff5f5; }
    tbody td { padding:4px 7px; border-bottom:1px solid #e4e9f2; font-size:9px; }
    tbody td.r { text-align:right; font-family:'Courier New',monospace; }
    tfoot tr { background:#1e3a5f; color:#fff; }
    tfoot td { padding:5px 7px; font-size:9px; font-weight:bold; }
    tfoot td.r { text-align:right; font-family:'Courier New',monospace; }
    .badge { display:inline-block; padding:1px 5px; border-radius:99px;
        font-size:7.5px; font-weight:800; text-transform:uppercase; }
    .badge-pg  { background:#dcfce7; color:#15803d; }
    .badge-pa  { background:#dbeafe; color:#1d4ed8; }
    .badge-vn  { background:#fef3c7; color:#b45309; }
    .badge-ve  { background:#fee2e2; color:#b91c1c; }
    .rpt-footer { margin-top:16px; border-top:1px solid #cbd5e0; padding-top:6px;
        display:flex; justify-content:space-between; font-size:8px; color:#94a3b8; }
`

function diasVenc(fecha: string) {
    return Math.floor((new Date(fecha).getTime() - new Date(HOY).getTime()) / 86400000)
}

export function ConsultaCxPPage() {
    const { empresa }               = useAuth()
    const printRef                  = useRef<HTMLDivElement>(null)
    const [lista, setLista]         = useState<CuentaPorPagar[]>([])
    const [proveedores, setProveedores] = useState<Proveedor[]>([])
    const [loading, setLoading]     = useState(true)
    const [provId, setProvId]       = useState('')
    const [estado, setEstado]       = useState('')

    const generadoEl = new Date().toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' } as any)

    useEffect(() => {
        if (empresa?.id) {
            proveedorService.listar(empresa.id).then(setProveedores)
            load()
        }
    }, [empresa?.id])

    async function load() {
        if (!empresa?.id) return
        try {
            setLoading(true)
            const data = await cxpService.listar(empresa.id, {
                estado:      estado     || undefined,
                proveedorId: provId     || undefined,
            })
            setLista(data)
        } catch (e: any) { alert('Error: ' + e.message) }
        finally { setLoading(false) }
    }

    const pendientes = lista.filter(c => c.estado !== 'PAGADO' && c.estado !== 'ANULADO')
    const vencidas   = pendientes.filter(c => c.fecha_vencimiento < HOY)
    const porVencer7 = pendientes.filter(c => { const d = diasVenc(c.fecha_vencimiento); return d >= 0 && d <= 7 })

    const totalPendiente = pendientes.reduce((s, c) => s + c.saldo_pendiente, 0)
    const totalVencido   = vencidas.reduce((s, c)   => s + c.saldo_pendiente, 0)

    const aging = {
        vigente:    pendientes.filter(c => diasVenc(c.fecha_vencimiento) > 30).reduce((s,c)=>s+c.saldo_pendiente,0),
        por_vencer: pendientes.filter(c => { const d=diasVenc(c.fecha_vencimiento); return d>=0&&d<=30 }).reduce((s,c)=>s+c.saldo_pendiente,0),
        venc_30:    vencidas.filter(c => Math.abs(diasVenc(c.fecha_vencimiento)) <= 30).reduce((s,c)=>s+c.saldo_pendiente,0),
        venc_60:    vencidas.filter(c => { const d=Math.abs(diasVenc(c.fecha_vencimiento)); return d>30&&d<=60 }).reduce((s,c)=>s+c.saldo_pendiente,0),
        venc_90:    vencidas.filter(c => Math.abs(diasVenc(c.fecha_vencimiento)) > 60).reduce((s,c)=>s+c.saldo_pendiente,0),
    }

    const labelProv = provId ? proveedores.find(p => p.id === provId)?.nombre_empresa : ''

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: `CxP_Proveedores_${HOY}`,
        pageStyle: PRINT_CSS,
    })

    return (
        <div className="space-y-5">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Consulta General CxP</h1>
                <p className="text-slate-500 text-sm">Análisis de antigüedad de saldos y vencimientos</p>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: 'Total pendiente',  val: fmt(totalPendiente), icon: Wallet,       color: 'text-amber-700' },
                    { label: 'Total vencido',    val: fmt(totalVencido),   icon: AlertCircle,  color: 'text-red-600'   },
                    { label: 'Vence en 7 días',  val: porVencer7.length,   icon: Clock,        color: 'text-orange-600'},
                    { label: 'Documentos pend.', val: pendientes.length,   icon: Wallet,       color: 'text-slate-700' },
                ].map(k => (
                    <div key={k.label} className="card p-4">
                        <div className="flex items-center gap-2 mb-1">
                            <k.icon className={`w-4 h-4 ${k.color}`} />
                            <p className="text-xs text-slate-500">{k.label}</p>
                        </div>
                        <p className={`text-xl font-bold ${k.color}`}>{k.val}</p>
                    </div>
                ))}
            </div>

            {/* Aging */}
            <div className="card p-5 space-y-3">
                <h2 className="font-bold text-slate-700 text-sm uppercase tracking-wider">Antigüedad de Saldos (Aging)</h2>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {[
                        { label: 'Por vencer (+30d)', val: aging.vigente,    color: 'bg-green-50 text-green-700'   },
                        { label: 'Vence 0-30 días',   val: aging.por_vencer, color: 'bg-amber-50 text-amber-700'  },
                        { label: 'Venc. 1-30 días',   val: aging.venc_30,    color: 'bg-orange-50 text-orange-700' },
                        { label: 'Venc. 31-60 días',  val: aging.venc_60,    color: 'bg-red-50 text-red-600'      },
                        { label: 'Venc. +60 días',    val: aging.venc_90,    color: 'bg-red-100 text-red-800'     },
                    ].map(a => (
                        <div key={a.label} className={`rounded-xl p-4 text-center ${a.color}`}>
                            <p className="text-xs font-medium mb-1 opacity-80">{a.label}</p>
                            <p className="text-lg font-bold font-mono">{fmt(a.val)}</p>
                        </div>
                    ))}
                </div>
            </div>

            <PrintExportBar
                datos={lista.map(c => ({
                    Proveedor:        (c.proveedor as any)?.nombre_empresa ?? '',
                    RUC:              (c.proveedor as any)?.ruc ?? '',
                    Factura:          (c.compra as any)?.numero_factura ?? '',
                    FechaEmision:     c.fecha_emision,
                    FechaVencimiento: c.fecha_vencimiento,
                    MontoOriginal:    c.monto_original,
                    SaldoPendiente:   c.saldo_pendiente,
                    Estado:           c.estado,
                }))}
                nombreArchivo="cxp_proveedores"
                onPrint={() => handlePrint()}
            />

            {/* Filtros */}
            <div className="flex gap-3 flex-wrap">
                <select className="input text-sm max-w-xs" value={provId} onChange={e => setProvId(e.target.value)}>
                    <option value="">Todos los proveedores</option>
                    {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre_empresa}</option>)}
                </select>
                <select className="input text-sm max-w-xs" value={estado} onChange={e => setEstado(e.target.value)}>
                    <option value="">Todos los estados</option>
                    <option value="PENDIENTE">Pendiente</option>
                    <option value="PARCIALMENTE_PAGADO">Parcialmente pagado</option>
                    <option value="PAGADO">Pagado</option>
                </select>
                <button onClick={load} className="btn btn-primary text-sm px-5">Aplicar</button>
            </div>

            {/* Tabla */}
            <div className="card overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin" /> Cargando...
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b text-xs font-bold text-slate-500 uppercase">
                                <tr>
                                    {['Proveedor','Factura','Emisión','Vencimiento','Días','Original','Saldo','Estado'].map(h => (
                                        <th key={h} className="px-4 py-3 text-left whitespace-nowrap">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {lista.map(c => {
                                    const dias    = diasVenc(c.fecha_vencimiento)
                                    const vencida = dias < 0 && c.estado !== 'PAGADO'
                                    return (
                                        <tr key={c.id} className={cn('hover:bg-slate-50', vencida && 'bg-red-50/30')}>
                                            <td className="px-4 py-3 font-medium text-slate-800 max-w-[150px]">
                                                <p className="truncate">{(c.proveedor as any)?.nombre_empresa ?? '—'}</p>
                                                <p className="text-xs text-slate-400">{(c.proveedor as any)?.ruc}</p>
                                            </td>
                                            <td className="px-4 py-3 font-mono text-xs text-slate-500">
                                                {(c.compra as any)?.numero_factura ?? '—'}
                                            </td>
                                            <td className="px-4 py-3 text-xs whitespace-nowrap text-slate-600">{fmtF(c.fecha_emision)}</td>
                                            <td className={cn('px-4 py-3 text-xs whitespace-nowrap font-medium', vencida ? 'text-red-600' : 'text-slate-600')}>
                                                {fmtF(c.fecha_vencimiento)}
                                            </td>
                                            <td className={cn('px-4 py-3 text-center text-xs font-bold',
                                                vencida ? 'text-red-600' : dias <= 7 ? 'text-orange-600' : 'text-green-600')}>
                                                {vencida ? `${Math.abs(dias)}d venc.` : `${dias}d`}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-xs">{fmt(c.monto_original)}</td>
                                            <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">{fmt(c.saldo_pendiente)}</td>
                                            <td className="px-4 py-3">
                                                <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold',
                                                    c.estado === 'PAGADO'               ? 'bg-green-100 text-green-700'  :
                                                    c.estado === 'PARCIALMENTE_PAGADO'  ? 'bg-blue-100 text-blue-700'   :
                                                    vencida                             ? 'bg-red-100 text-red-700'      :
                                                                                          'bg-amber-100 text-amber-700')}>
                                                    {c.estado === 'PARCIALMENTE_PAGADO' ? 'Parcial' : c.estado}
                                                </span>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                            <tfoot className="bg-slate-50 border-t-2 font-bold text-sm">
                                <tr>
                                    <td colSpan={5} className="px-4 py-3 text-xs text-slate-500 uppercase">{lista.length} documentos</td>
                                    <td className="px-4 py-3 text-right font-mono">{fmt(lista.reduce((s,c)=>s+c.monto_original,0))}</td>
                                    <td className="px-4 py-3 text-right font-mono text-amber-700">{fmt(totalPendiente)}</td>
                                    <td />
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
                            <div className="rpt-titulo">Cuentas por Pagar — Aging de Saldos</div>
                            <div className="rpt-corte">Corte al: {fmtFLong(HOY)}</div>
                            <div className="rpt-gen">Generado: {generadoEl}</div>
                        </div>
                    </div>

                    <div className="filtros-bar">
                        {labelProv && <div>Proveedor: <span>{labelProv}</span></div>}
                        {estado    && <div>Estado: <span>{estado}</span></div>}
                        <div>Total documentos: <span>{lista.length}</span></div>
                        <div>Pendientes: <span>{pendientes.length}</span></div>
                        <div>Vencidos: <span>{vencidas.length}</span></div>
                    </div>

                    {/* Aging */}
                    <div className="aging-row">
                        {[
                            { label:'Por vencer (+30d)', val:aging.vigente,    cls:'ag-green'   },
                            { label:'Vence 0-30 días',   val:aging.por_vencer, cls:'ag-amber'   },
                            { label:'Venc. 1-30 días',   val:aging.venc_30,    cls:'ag-orange'  },
                            { label:'Venc. 31-60 días',  val:aging.venc_60,    cls:'ag-red'     },
                            { label:'Venc. +60 días',    val:aging.venc_90,    cls:'ag-darkred' },
                        ].map(a => (
                            <div key={a.label} className={`aging-box ${a.cls}`}>
                                <div className="aging-label">{a.label}</div>
                                <div className="aging-val">{fmt(a.val)}</div>
                            </div>
                        ))}
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th style={{textAlign:'left'}}>Proveedor</th>
                                <th style={{textAlign:'left', width:'76px'}}>Factura</th>
                                <th style={{textAlign:'left', width:'70px'}}>Emisión</th>
                                <th style={{textAlign:'left', width:'72px'}}>Vencimiento</th>
                                <th style={{textAlign:'center', width:'46px'}}>Días</th>
                                <th className="r" style={{width:'74px'}}>Original</th>
                                <th className="r" style={{width:'74px'}}>Saldo</th>
                                <th style={{textAlign:'left', width:'72px'}}>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lista.map((c, i) => {
                                const dias    = diasVenc(c.fecha_vencimiento)
                                const vencida = dias < 0 && c.estado !== 'PAGADO'
                                return (
                                    <tr key={c.id} className={vencida ? 'venc' : i%2!==0 ? 'alt' : ''}>
                                        <td>
                                            <div style={{fontWeight:'600'}}>{(c.proveedor as any)?.nombre_empresa ?? '—'}</div>
                                            <div style={{fontSize:'8px',color:'#888'}}>{(c.proveedor as any)?.ruc}</div>
                                        </td>
                                        <td style={{fontFamily:"'Courier New',monospace",fontSize:'8.5px',color:'#555'}}>
                                            {(c.compra as any)?.numero_factura ?? '—'}
                                        </td>
                                        <td>{fmtF(c.fecha_emision)}</td>
                                        <td style={{color: vencida ? '#b91c1c' : '#111', fontWeight: vencida ? 'bold' : 'normal'}}>
                                            {fmtF(c.fecha_vencimiento)}
                                        </td>
                                        <td style={{textAlign:'center', fontWeight:'bold',
                                            color: vencida ? '#b91c1c' : dias <= 7 ? '#c2410c' : '#15803d'}}>
                                            {vencida ? `${Math.abs(dias)}v` : `${dias}d`}
                                        </td>
                                        <td className="r">{fmt(c.monto_original)}</td>
                                        <td className="r" style={{fontWeight:'bold'}}>{fmt(c.saldo_pendiente)}</td>
                                        <td>
                                            <span className={
                                                c.estado === 'PAGADO'              ? 'badge badge-pg' :
                                                c.estado === 'PARCIALMENTE_PAGADO' ? 'badge badge-pa' :
                                                vencida                            ? 'badge badge-ve' : 'badge badge-vn'
                                            }>
                                                {c.estado === 'PARCIALMENTE_PAGADO' ? 'Parcial' : c.estado}
                                            </span>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colSpan={5} style={{fontSize:'8px',color:'#ccd3e0'}}>
                                    {lista.length} documentos · {pendientes.length} pendientes · {vencidas.length} vencidas
                                </td>
                                <td className="r">{fmt(lista.reduce((s,c)=>s+c.monto_original,0))}</td>
                                <td className="r" style={{fontSize:'11px',color:'#fbbf24'}}>{fmt(totalPendiente)}</td>
                                <td></td>
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
