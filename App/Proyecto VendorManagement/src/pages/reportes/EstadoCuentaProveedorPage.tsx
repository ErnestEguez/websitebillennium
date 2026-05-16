import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { proveedorService } from '../../services/vendorService'
import type { Proveedor } from '../../types/vendors'
import { FileText, Loader2, Building2 } from 'lucide-react'
import { cn } from '../../lib/utils'

const HOY = new Date().toISOString().split('T')[0]
const PRIMER_DIA_AÑO = `${new Date().getFullYear()}-01-01`
const fmt  = (n: number) => `$${n.toFixed(2)}`
const fmtF = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })

interface MovProveedor {
    fecha: string
    tipo: 'FACTURA' | 'PAGO' | 'RETENCION'
    descripcion: string
    cargo: number      // lo que se debe (factura)
    abono: number      // lo que se pagó/retuvo
    saldo: number
}

export function EstadoCuentaProveedorPage() {
    const { empresa }                = useAuth()
    const [proveedores, setProveedores] = useState<Proveedor[]>([])
    const [provId, setProvId]        = useState('')
    const [desde, setDesde]          = useState(PRIMER_DIA_AÑO)
    const [hasta, setHasta]          = useState(HOY)
    const [movimientos, setMovimientos] = useState<MovProveedor[]>([])
    const [loading, setLoading]      = useState(false)
    const [proveedor, setProveedor]  = useState<Proveedor | null>(null)

    useEffect(() => {
        if (empresa?.id) proveedorService.listar(empresa.id).then(setProveedores)
    }, [empresa?.id])

    async function consultar() {
        if (!provId || !empresa?.id) { alert('Selecciona un proveedor'); return }
        try {
            setLoading(true)
            const prov = proveedores.find(p => p.id === provId)
            setProveedor(prov ?? null)

            // Facturas de compra del proveedor en el período
            const { data: compras } = await supabase
                .from('ingresos_stock')
                .select('id, numero_factura, fecha_emision, fecha_ingreso, total, estado')
                .eq('empresa_id', empresa.id)
                .eq('proveedor_id', provId)
                .gte('fecha_ingreso', desde)
                .lte('fecha_ingreso', hasta)
                .order('fecha_ingreso')

            // Pagos del proveedor en el período
            const { data: pagos } = await supabase
                .from('pagos_proveedores')
                .select('fecha_pago, monto, forma_pago, numero_referencia, cxp_id')
                .eq('empresa_id', empresa.id)
                .eq('proveedor_id', provId)
                .gte('fecha_pago', desde)
                .lte('fecha_pago', hasta)
                .order('fecha_pago')

            // Retenciones
            const { data: retenciones } = await supabase
                .from('retenciones_compras')
                .select('fecha_emision, valor, codigo_retencion, tipo')
                .eq('empresa_id', empresa.id)
                .eq('proveedor_id', provId)
                .gte('fecha_emision', desde)
                .lte('fecha_emision', hasta)
                .eq('estado', 'ACTIVO')
                .order('fecha_emision')

            // Construir movimientos ordenados por fecha
            const movs: MovProveedor[] = []
            let saldo = 0

            const todos: Array<{ fecha: string; item: any; tipo: 'FACTURA'|'PAGO'|'RETENCION' }> = [
                ...(compras ?? []).map(c => ({ fecha: c.fecha_emision ?? c.fecha_ingreso, item: c, tipo: 'FACTURA' as const })),
                ...(pagos ?? []).map(p => ({ fecha: p.fecha_pago, item: p, tipo: 'PAGO' as const })),
                ...(retenciones ?? []).map(r => ({ fecha: r.fecha_emision, item: r, tipo: 'RETENCION' as const })),
            ].sort((a, b) => a.fecha.localeCompare(b.fecha))

            todos.forEach(({ fecha, item, tipo }) => {
                if (tipo === 'FACTURA') {
                    if (item.estado === 'ANULADO') return
                    saldo += item.total
                    movs.push({
                        fecha, tipo,
                        descripcion: `Factura ${item.numero_factura ?? item.id.slice(0, 8)}`,
                        cargo: item.total, abono: 0, saldo,
                    })
                } else if (tipo === 'PAGO') {
                    saldo -= item.monto
                    movs.push({
                        fecha, tipo,
                        descripcion: `Pago ${item.forma_pago}${item.numero_referencia ? ' #' + item.numero_referencia : ''}`,
                        cargo: 0, abono: item.monto, saldo,
                    })
                } else {
                    saldo -= item.valor
                    movs.push({
                        fecha, tipo,
                        descripcion: `Retención ${item.tipo} cód. ${item.codigo_retencion}`,
                        cargo: 0, abono: item.valor, saldo,
                    })
                }
            })

            setMovimientos(movs)
        } catch (e: any) { alert('Error: ' + e.message) }
        finally { setLoading(false) }
    }

    const saldoFinal    = movimientos.length > 0 ? movimientos[movimientos.length - 1].saldo : 0
    const totalCargos   = movimientos.reduce((s, m) => s + m.cargo, 0)
    const totalAbonos   = movimientos.reduce((s, m) => s + m.abono, 0)

    return (
        <div className="space-y-5">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Estado de Cuenta por Proveedor</h1>
                <p className="text-slate-500 text-sm">Historial de facturas, pagos y retenciones</p>
            </div>

            {/* Selector */}
            <div className="card p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-2">
                        <label className="label text-xs">Proveedor <span className="text-red-500">*</span></label>
                        <select className="input text-sm" value={provId} onChange={e => setProvId(e.target.value)}>
                            <option value="">Seleccionar proveedor...</option>
                            {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre_empresa} — {p.ruc}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="label text-xs">Desde</label>
                        <input type="date" className="input text-sm" value={desde} onChange={e => setDesde(e.target.value)} />
                    </div>
                    <div>
                        <label className="label text-xs">Hasta</label>
                        <input type="date" className="input text-sm" value={hasta} onChange={e => setHasta(e.target.value)} />
                    </div>
                </div>
                <button onClick={consultar} className="btn btn-primary text-sm px-6">Generar estado de cuenta</button>
            </div>

            {/* Encabezado del proveedor */}
            {proveedor && movimientos.length > 0 && (
                <div className="card p-5 flex items-start gap-4">
                    <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center shrink-0">
                        <Building2 className="w-6 h-6 text-primary-600" />
                    </div>
                    <div className="flex-1">
                        <p className="font-bold text-lg text-slate-900">{proveedor.nombre_empresa}</p>
                        <p className="text-slate-500 text-sm">RUC: {proveedor.ruc} · {proveedor.ciudad}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-slate-400 mb-1">Período: {fmtF(desde)} — {fmtF(hasta)}</p>
                        <p className="text-xs text-slate-500">Total cargos: <span className="font-mono font-semibold">{fmt(totalCargos)}</span></p>
                        <p className="text-xs text-slate-500">Total abonos: <span className="font-mono font-semibold text-green-700">{fmt(totalAbonos)}</span></p>
                        <p className={cn('text-lg font-bold font-mono mt-1', saldoFinal > 0 ? 'text-amber-700' : 'text-green-700')}>
                            Saldo: {fmt(saldoFinal)}
                        </p>
                    </div>
                </div>
            )}

            {/* Tabla movimientos */}
            {loading ? (
                <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin" /> Consultando...
                </div>
            ) : movimientos.length > 0 ? (
                <div className="card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 border-b text-xs font-bold text-slate-500 uppercase">
                                <tr>
                                    {['Fecha','Tipo','Descripción','Cargo (+)','Abono (-)','Saldo'].map(h => (
                                        <th key={h} className="px-4 py-3 text-left whitespace-nowrap">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {movimientos.map((m, i) => (
                                    <tr key={i} className={cn('hover:bg-slate-50',
                                        m.tipo === 'FACTURA'   && 'bg-amber-50/20',
                                        m.tipo === 'PAGO'      && 'bg-green-50/20',
                                        m.tipo === 'RETENCION' && 'bg-blue-50/20')}>
                                        <td className="px-4 py-3 text-xs whitespace-nowrap text-slate-600">{fmtF(m.fecha)}</td>
                                        <td className="px-4 py-3">
                                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold',
                                                m.tipo === 'FACTURA'   ? 'bg-amber-100 text-amber-700'  :
                                                m.tipo === 'PAGO'      ? 'bg-green-100 text-green-700'  :
                                                                          'bg-blue-100 text-blue-700')}>
                                                {m.tipo}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-slate-700">{m.descripcion}</td>
                                        <td className="px-4 py-3 text-right font-mono text-amber-700 font-medium">
                                            {m.cargo > 0 ? fmt(m.cargo) : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono text-green-700 font-medium">
                                            {m.abono > 0 ? fmt(m.abono) : '—'}
                                        </td>
                                        <td className={cn('px-4 py-3 text-right font-mono font-bold',
                                            m.saldo > 0 ? 'text-slate-900' : 'text-green-700')}>
                                            {fmt(m.saldo)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-slate-50 border-t-2 font-bold">
                                <tr>
                                    <td colSpan={3} className="px-4 py-3 text-xs text-slate-500 uppercase">
                                        {movimientos.length} movimientos
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono text-amber-700">{fmt(totalCargos)}</td>
                                    <td className="px-4 py-3 text-right font-mono text-green-700">{fmt(totalAbonos)}</td>
                                    <td className={cn('px-4 py-3 text-right font-mono text-lg',
                                        saldoFinal > 0 ? 'text-amber-700' : 'text-green-700')}>
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
        </div>
    )
}
