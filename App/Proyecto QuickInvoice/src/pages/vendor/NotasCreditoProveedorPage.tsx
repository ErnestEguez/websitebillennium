import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { ncProveedorService, type NCProveedor } from '../../services/ncProveedorService'
import { formatCurrency, cn } from '../../lib/utils'
import { FileMinus, Plus, Search, Ban, Loader2, AlertCircle, X } from 'lucide-react'

const ESTADO_BADGE: Record<string, string> = {
    ACTIVA: 'bg-green-100 text-green-700',
    ANULADA: 'bg-red-100 text-red-600',
}

const TIPO_LABEL: Record<string, string> = {
    DEVOLUCION_MERCADERIA: 'Devolución Mercadería',
    NC_VALOR: 'N/C Valor',
}

export function NotasCreditoProveedorPage() {
    const { empresa, profile } = useAuth()
    const navigate = useNavigate()

    const [ncs, setNcs] = useState<NCProveedor[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [busqueda, setBusqueda] = useState('')
    const [filtroTipo, setFiltroTipo] = useState('')
    const [filtroEstado, setFiltroEstado] = useState('')
    const [anulando, setAnulando] = useState<string | null>(null)

    const cargar = useCallback(async () => {
        if (!empresa?.id) return
        setLoading(true); setError('')
        try {
            const data = await ncProveedorService.listar(empresa.id, {
                tipo: filtroTipo || undefined,
                estado: filtroEstado || undefined,
            })
            setNcs(data)
        } catch (e: any) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }, [empresa?.id, filtroTipo, filtroEstado])

    useEffect(() => { cargar() }, [cargar])

    async function handleAnular(nc: NCProveedor) {
        const motivo = prompt(`Motivo de anulación para N/C ${nc.numero_nc ?? nc.id.slice(0, 8)}:`)
        if (!motivo?.trim()) return
        try {
            setAnulando(nc.id)
            await ncProveedorService.anular(nc.id, motivo, profile!.id)
            await cargar()
        } catch (e: any) {
            alert('Error al anular: ' + e.message)
        } finally {
            setAnulando(null)
        }
    }

    const visibles = ncs.filter(nc => {
        if (!busqueda) return true
        const q = busqueda.toLowerCase()
        return (
            nc.numero_nc?.toLowerCase().includes(q) ||
            nc.proveedor?.nombre_empresa?.toLowerCase().includes(q) ||
            nc.compra?.numero_factura?.toLowerCase().includes(q)
        )
    })

    const totalActivas = visibles.filter(n => n.estado === 'ACTIVA').reduce((s, n) => s + n.total, 0)

    return (
        <div className="space-y-5 max-w-6xl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <FileMinus className="w-6 h-6 text-orange-500" />
                        Notas de Crédito de Proveedores
                    </h1>
                    <p className="text-slate-500 text-sm mt-0.5">Devoluciones de mercadería y ajustes de valor recibidos de proveedores</p>
                </div>
                <button onClick={() => navigate('/compras/notas-credito/nueva')} className="btn bg-primary-600 text-white gap-2 hover:bg-primary-700">
                    <Plus className="w-4 h-4" /> Nueva N/C
                </button>
            </div>

            {error && (
                <div className="card px-5 py-3 bg-red-50 border-red-200 text-red-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{error}</span>
                    <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
                </div>
            )}

            <div className="card p-5">
                <div className="flex flex-wrap gap-4 items-end">
                    <div className="flex-1 min-w-[200px]">
                        <label className="label">Buscar</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input className="input pl-9" placeholder="N° N/C, proveedor, factura..."
                                value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                        </div>
                    </div>
                    <div>
                        <label className="label">Tipo</label>
                        <select className="input" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
                            <option value="">Todos</option>
                            <option value="DEVOLUCION_MERCADERIA">Devolución Mercadería</option>
                            <option value="NC_VALOR">N/C Valor</option>
                        </select>
                    </div>
                    <div>
                        <label className="label">Estado</label>
                        <select className="input" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
                            <option value="">Todos</option>
                            <option value="ACTIVA">Activa</option>
                            <option value="ANULADA">Anulada</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="card p-4">
                    <p className="text-xl font-bold text-slate-800">{visibles.length}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Total N/C</p>
                </div>
                <div className="card p-4">
                    <p className="text-xl font-bold text-emerald-600">{visibles.filter(n => n.estado === 'ACTIVA').length}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Activas</p>
                </div>
                <div className="card p-4">
                    <p className="text-xl font-bold text-primary-600">{formatCurrency(totalActivas)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Valor total activas</p>
                </div>
            </div>

            <div className="card overflow-hidden">
                {loading ? (
                    <div className="py-12 text-center text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando...
                    </div>
                ) : visibles.length === 0 ? (
                    <div className="py-12 text-center text-slate-400">
                        <FileMinus className="w-10 h-10 mx-auto mb-2 opacity-20" />
                        <p>Sin notas de crédito registradas.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                                    <th className="py-2 px-3 text-left">N° N/C</th>
                                    <th className="py-2 px-3 text-left">Proveedor</th>
                                    <th className="py-2 px-3 text-left">Factura Origen</th>
                                    <th className="py-2 px-3 text-left">Tipo</th>
                                    <th className="py-2 px-3 text-left">Fecha</th>
                                    <th className="py-2 px-3 text-right">Total</th>
                                    <th className="py-2 px-3 text-center">Estado</th>
                                    <th className="py-2 px-3 text-center w-16"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibles.map(nc => (
                                    <tr key={nc.id} className="border-b border-slate-100 hover:bg-slate-50">
                                        <td className="py-2 px-3 font-mono text-xs text-slate-700">{nc.numero_nc || '—'}</td>
                                        <td className="py-2 px-3">
                                            <div className="font-medium text-slate-700 text-xs">{nc.proveedor?.nombre_empresa}</div>
                                            <div className="text-slate-400 text-xs font-mono">{nc.proveedor?.ruc}</div>
                                        </td>
                                        <td className="py-2 px-3 font-mono text-xs text-slate-600">{nc.compra?.numero_factura || '—'}</td>
                                        <td className="py-2 px-3 text-xs text-slate-600">{TIPO_LABEL[nc.tipo]}</td>
                                        <td className="py-2 px-3 text-xs text-slate-500">{nc.fecha_nc}</td>
                                        <td className="py-2 px-3 text-right font-semibold text-xs">{formatCurrency(nc.total)}</td>
                                        <td className="py-2 px-3 text-center">
                                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', ESTADO_BADGE[nc.estado])}>
                                                {nc.estado}
                                            </span>
                                        </td>
                                        <td className="py-2 px-3 text-center">
                                            {nc.estado === 'ACTIVA' && (
                                                <button onClick={() => handleAnular(nc)} disabled={anulando === nc.id}
                                                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                                                    title="Anular">
                                                    {anulando === nc.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                                                </button>
                                            )}
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
