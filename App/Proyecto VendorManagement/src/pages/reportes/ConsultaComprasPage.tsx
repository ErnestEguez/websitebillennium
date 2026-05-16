import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { compraService, proveedorService } from '../../services/vendorService'
import type { Compra, Proveedor } from '../../types/vendors'
import { Search, RefreshCw, Loader2, FileText, Package, Wrench } from 'lucide-react'
import { cn } from '../../lib/utils'

const HOY = new Date().toISOString().split('T')[0]
const PRIMER_DIA_MES = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
const fmt = (n: number) => `$${n.toFixed(2)}`
const fmtF = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })

export function ConsultaComprasPage() {
    const { empresa } = useAuth()
    const [compras, setCompras]         = useState<Compra[]>([])
    const [proveedores, setProveedores] = useState<Proveedor[]>([])
    const [loading, setLoading]         = useState(false)

    const [desde, setDesde]         = useState(PRIMER_DIA_MES)
    const [hasta, setHasta]         = useState(HOY)
    const [tipo, setTipo]           = useState('')
    const [estado, setEstado]       = useState('')
    const [provId, setProvId]       = useState('')
    const [busqueda, setBusqueda]   = useState('')

    useEffect(() => { if (empresa?.id) { proveedorService.listar(empresa.id).then(setProveedores) } }, [empresa?.id])
    useEffect(() => { if (empresa?.id) buscar() }, [empresa?.id])

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

    const totalActivas  = visibles.filter(c => c.estado === 'ACTIVO').reduce((s, c) => s + c.total, 0)
    const totalIva      = visibles.filter(c => c.estado === 'ACTIVO').reduce((s, c) => s + (c.valor_iva ?? 0), 0)
    const totalInventario = visibles.filter(c => c.tipo_compra === 'INVENTARIO' && c.estado === 'ACTIVO').reduce((s, c) => s + c.total, 0)
    const totalServicio   = visibles.filter(c => c.tipo_compra === 'SERVICIO'   && c.estado === 'ACTIVO').reduce((s, c) => s + c.total, 0)

    return (
        <div className="space-y-5">
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
                                            <td className="px-4 py-3 font-mono text-xs text-slate-500">
                                                {c.numero_factura || '—'}
                                            </td>
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
                                                    c.estado === 'ACTIVO' ? 'bg-green-100 text-green-700' :
                                                    c.estado === 'ANULADO' ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500')}>
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
                                    <td className="px-4 py-3 text-right font-mono">{fmt(visibles.filter(c=>c.estado==='ACTIVO').reduce((s,c)=>s+(c.subtotal??0),0))}</td>
                                    <td className="px-4 py-3 text-right font-mono">{fmt(totalIva)}</td>
                                    <td className="px-4 py-3 text-right font-mono text-primary-700">{fmt(totalActivas)}</td>
                                    <td colSpan={2} />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
