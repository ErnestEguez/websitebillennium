import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { cxpService, proveedorService } from '../../services/vendorService'
import type { CuentaPorPagar, Proveedor } from '../../types/vendors'
import { Wallet, AlertCircle, Clock, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import { PrintExportBar } from '../../components/PrintExportBar'
import { ReportPrintHeader } from '../../components/ReportPrintHeader'

const HOY = new Date().toISOString().split('T')[0]
const fmt = (n: number) => `$${n.toFixed(2)}`
const fmtF = (s?: string | null) => s ? new Date(s + 'T12:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

function diasVenc(fecha: string) {
    const diff = Math.floor((new Date(fecha).getTime() - new Date(HOY).getTime()) / 86400000)
    return diff
}

export function ConsultaCxPPage() {
    const { empresa }           = useAuth()
    const [lista, setLista]     = useState<CuentaPorPagar[]>([])
    const [proveedores, setProveedores] = useState<Proveedor[]>([])
    const [loading, setLoading] = useState(true)
    const [provId, setProvId]   = useState('')
    const [estado, setEstado]   = useState('')

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
                estado: estado || undefined,
                proveedorId: provId || undefined,
            })
            setLista(data)
        } catch (e: any) { alert('Error: ' + e.message) }
        finally { setLoading(false) }
    }

    const pendientes = lista.filter(c => c.estado !== 'PAGADO' && c.estado !== 'ANULADO')
    const vencidas   = pendientes.filter(c => c.fecha_vencimiento < HOY)
    const porVencer7 = pendientes.filter(c => {
        const d = diasVenc(c.fecha_vencimiento)
        return d >= 0 && d <= 7
    })

    const totalPendiente = pendientes.reduce((s, c) => s + c.saldo_pendiente, 0)
    const totalVencido   = vencidas.reduce((s, c) => s + c.saldo_pendiente, 0)

    // Aging (antigüedad de saldos)
    const aging = {
        vigente:     pendientes.filter(c => diasVenc(c.fecha_vencimiento) > 30).reduce((s,c)=>s+c.saldo_pendiente,0),
        por_vencer:  pendientes.filter(c => { const d=diasVenc(c.fecha_vencimiento); return d>=0&&d<=30 }).reduce((s,c)=>s+c.saldo_pendiente,0),
        vencido_30:  vencidas.filter(c => { const d=Math.abs(diasVenc(c.fecha_vencimiento)); return d<=30 }).reduce((s,c)=>s+c.saldo_pendiente,0),
        vencido_60:  vencidas.filter(c => { const d=Math.abs(diasVenc(c.fecha_vencimiento)); return d>30&&d<=60 }).reduce((s,c)=>s+c.saldo_pendiente,0),
        vencido_90:  vencidas.filter(c => { const d=Math.abs(diasVenc(c.fecha_vencimiento)); return d>60 }).reduce((s,c)=>s+c.saldo_pendiente,0),
    }

    return (
        <div className="space-y-5">
            <ReportPrintHeader
                titulo="Cuentas por Pagar — Aging de Saldos"
                filtros={[
                    { label: 'Corte', valor: fmtF(HOY) },
                    ...(estado ? [{ label: 'Estado', valor: estado }] : []),
                    ...(provId ? [{ label: 'Proveedor', valor: proveedores.find(p => p.id === provId)?.nombre_empresa ?? provId }] : []),
                ]}
            />

            <div className="no-print">
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
                        { label: 'Por vencer (+30d)', val: aging.vigente,    color: 'bg-green-50 text-green-700'  },
                        { label: 'Vence 0-30 días',   val: aging.por_vencer, color: 'bg-amber-50 text-amber-700' },
                        { label: 'Venc. 1-30 días',   val: aging.vencido_30, color: 'bg-orange-50 text-orange-700'},
                        { label: 'Venc. 31-60 días',  val: aging.vencido_60, color: 'bg-red-50 text-red-600'     },
                        { label: 'Venc. +60 días',    val: aging.vencido_90, color: 'bg-red-100 text-red-800'    },
                    ].map(a => (
                        <div key={a.label} className={`rounded-xl p-4 text-center ${a.color}`}>
                            <p className="text-xs font-medium mb-1 opacity-80">{a.label}</p>
                            <p className="text-lg font-bold font-mono">{fmt(a.val)}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="no-print"><PrintExportBar
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
            /></div>

            {/* Filtros */}
            <div className="flex gap-3 flex-wrap no-print">
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
                                    const dias   = diasVenc(c.fecha_vencimiento)
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
                                                {vencida ? `${Math.abs(dias)}d venc.` : dias <= 7 ? `${dias}d` : `${dias}d`}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono text-xs">{fmt(c.monto_original)}</td>
                                            <td className="px-4 py-3 text-right font-mono font-semibold text-slate-900">{fmt(c.saldo_pendiente)}</td>
                                            <td className="px-4 py-3">
                                                <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold',
                                                    c.estado === 'PAGADO' ? 'bg-green-100 text-green-700' :
                                                    c.estado === 'PARCIALMENTE_PAGADO' ? 'bg-blue-100 text-blue-700' :
                                                    vencida ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>
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
        </div>
    )
}
