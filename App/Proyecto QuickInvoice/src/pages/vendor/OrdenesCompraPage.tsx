import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { ocService } from '../../services/vendorService'
import type { OrdenCompra, EstadoOC } from '../../types/vendors'
import { Plus, FileText, Ban, ChevronRight, RefreshCw } from 'lucide-react'
import { cn } from '../../lib/utils'

const ESTADOS: { valor: EstadoOC | 'TODOS'; label: string; color: string }[] = [
    { valor: 'TODOS',                 label: 'Todas',       color: '' },
    { valor: 'BORRADOR',              label: 'Borrador',    color: 'bg-slate-100 text-slate-600' },
    { valor: 'ENVIADA',               label: 'Enviada',     color: 'bg-blue-100 text-blue-700' },
    { valor: 'PARCIALMENTE_RECIBIDA', label: 'Parcial',     color: 'bg-amber-100 text-amber-700' },
    { valor: 'RECIBIDA',              label: 'Recibida',    color: 'bg-green-100 text-green-700' },
    { valor: 'ANULADA',               label: 'Anulada',     color: 'bg-red-100 text-red-600' },
]

function EstadoBadge({ estado }: { estado: EstadoOC }) {
    const cfg = ESTADOS.find(e => e.valor === estado)
    return (
        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', cfg?.color ?? 'bg-slate-100 text-slate-500')}>
            {cfg?.label ?? estado}
        </span>
    )
}

export function OrdenesCompraPage() {
    const { empresa } = useAuth()
    const navigate    = useNavigate()

    const [ordenes,  setOrdenes]  = useState<OrdenCompra[]>([])
    const [loading,  setLoading]  = useState(true)
    const [filtro,   setFiltro]   = useState<EstadoOC | 'TODOS'>('TODOS')

    useEffect(() => { if (empresa?.id) cargar() }, [empresa?.id])

    async function cargar() {
        try {
            setLoading(true)
            const data = await ocService.listar(empresa!.id)
            setOrdenes(data)
        } catch (e: any) {
            alert('Error al cargar órdenes: ' + e.message)
        } finally {
            setLoading(false)
        }
    }

    async function handleAnular(id: string, num: string) {
        if (!confirm(`¿Anular la orden ${num}? Esta acción no se puede deshacer.`)) return
        try {
            await ocService.anular(id)
            cargar()
        } catch (e: any) {
            alert('Error al anular: ' + e.message)
        }
    }

    const filtradas = filtro === 'TODOS' ? ordenes : ordenes.filter(o => o.estado === filtro)

    return (
        <div className="space-y-5 max-w-6xl">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Órdenes de Compra</h1>
                    <p className="text-slate-500 text-sm">Gestión de OC a proveedores</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={cargar} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                    <button onClick={() => navigate('/compras/ordenes/nueva')}
                        className="btn btn-primary flex items-center gap-2">
                        <Plus className="w-4 h-4" /> Nueva OC
                    </button>
                </div>
            </div>

            {/* Filtro estado */}
            <div className="flex flex-wrap gap-2">
                {ESTADOS.map(e => (
                    <button key={e.valor}
                        onClick={() => setFiltro(e.valor)}
                        className={cn(
                            'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border',
                            filtro === e.valor
                                ? 'bg-primary-600 text-white border-primary-600'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-primary-400'
                        )}>
                        {e.label}
                        <span className="ml-1.5 text-xs opacity-70">
                            ({e.valor === 'TODOS' ? ordenes.length : ordenes.filter(o => o.estado === e.valor).length})
                        </span>
                    </button>
                ))}
            </div>

            {/* Tabla */}
            <div className="card overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center h-48 text-slate-400">Cargando...</div>
                ) : filtradas.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 text-slate-400 gap-2">
                        <FileText className="w-10 h-10 text-slate-200" />
                        <p className="text-sm">No hay órdenes de compra</p>
                        <button onClick={() => navigate('/compras/ordenes/nueva')}
                            className="btn btn-primary btn-sm mt-2">
                            <Plus className="w-3.5 h-3.5 mr-1" /> Nueva OC
                        </button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wider">
                                    <th className="px-5 py-3 text-left font-medium">Nº OC</th>
                                    <th className="px-5 py-3 text-left font-medium">Proveedor</th>
                                    <th className="px-5 py-3 text-left font-medium">F. Emisión</th>
                                    <th className="px-5 py-3 text-left font-medium">F. Entrega</th>
                                    <th className="px-5 py-3 text-left font-medium">Estado</th>
                                    <th className="px-5 py-3 text-right font-medium">Total</th>
                                    <th className="px-5 py-3 w-24" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filtradas.map(oc => (
                                    <tr key={oc.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-5 py-3 font-mono font-bold text-primary-700">{oc.numero_oc}</td>
                                        <td className="px-5 py-3 text-slate-700">{(oc.proveedor as any)?.nombre_empresa ?? '—'}</td>
                                        <td className="px-5 py-3 text-slate-500">{oc.fecha_emision}</td>
                                        <td className="px-5 py-3 text-slate-500">{oc.fecha_entrega_esperada ?? '—'}</td>
                                        <td className="px-5 py-3"><EstadoBadge estado={oc.estado} /></td>
                                        <td className="px-5 py-3 text-right font-mono font-semibold text-slate-800">
                                            ${Number(oc.total).toFixed(2)}
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center justify-end gap-1">
                                                <button
                                                    onClick={() => navigate(`/compras/ordenes/${oc.id}`)}
                                                    className="p-1.5 hover:bg-primary-50 rounded text-slate-400 hover:text-primary-600"
                                                    title="Ver / Editar">
                                                    <ChevronRight className="w-4 h-4" />
                                                </button>
                                                {oc.estado !== 'ANULADA' && oc.estado !== 'RECIBIDA' && (
                                                    <button
                                                        onClick={() => handleAnular(oc.id, oc.numero_oc)}
                                                        className="p-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-500"
                                                        title="Anular">
                                                        <Ban className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
