import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { proveedorService } from '../services/vendorService'
import type { Proveedor } from '../types/vendors'
import {
    FileText, Search, ChevronDown, ChevronUp,
    Loader2, CheckCircle2, AlertCircle, Clock,
} from 'lucide-react'
import { cn } from '../lib/utils'
import { PrintExportBar } from '../components/PrintExportBar'

const HOY = new Date().toISOString().split('T')[0]
const PRIMER_DIA_MES = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
const fmt  = (n: number) => `$${n.toFixed(2)}`
const fmtF = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })

interface RetencionDocumento {
    compra_id:           string
    numero_retencion:    string | null
    proveedor_id:        string
    proveedor_nombre:    string
    proveedor_ruc:       string
    factura_numero:      string | null
    fecha_emision:       string
    lineas: {
        tipo:             string
        codigo_retencion: string
        descripcion:      string
        base_imponible:   number
        porcentaje:       number
        valor:            number
    }[]
    total:               number
    estado:              string
    origen:              string
    numero_autorizacion: string | null
}

export function ComprobantesRetencionPage() {
    const { empresa }           = useAuth()
    const [docs, setDocs]       = useState<RetencionDocumento[]>([])
    const [proveedores, setProveedores] = useState<Proveedor[]>([])
    const [loading, setLoading] = useState(true)
    const [expandido, setExpandido] = useState<string | null>(null)
    const [busqueda, setBusqueda]   = useState('')
    const [desde, setDesde]         = useState(PRIMER_DIA_MES)
    const [hasta, setHasta]         = useState(HOY)
    const [provId, setProvId]       = useState('')

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
            let q = supabase
                .from('retenciones_compras')
                .select(`
                    compra_id,
                    numero_retencion,
                    proveedor_id,
                    fecha_emision,
                    tipo,
                    codigo_retencion,
                    descripcion,
                    base_imponible,
                    porcentaje,
                    valor,
                    estado,
                    origen,
                    numero_autorizacion,
                    compra:ingresos_stock(numero_factura),
                    proveedor:proveedores(nombre_empresa, ruc)
                `)
                .eq('empresa_id', empresa.id)
                .gte('fecha_emision', desde)
                .lte('fecha_emision', hasta)
                .order('fecha_emision', { ascending: false })

            if (provId) q = q.eq('proveedor_id', provId)

            const { data, error } = await q
            if (error) throw error

            // Agrupar por (compra_id + numero_retencion)
            const mapa = new Map<string, RetencionDocumento>()
            ;(data ?? []).forEach((r: any) => {
                const clave = `${r.compra_id}|${r.numero_retencion ?? 'sin_numero'}`
                if (!mapa.has(clave)) {
                    mapa.set(clave, {
                        compra_id:          r.compra_id,
                        numero_retencion:   r.numero_retencion,
                        proveedor_id:       r.proveedor_id,
                        proveedor_nombre:   r.proveedor?.nombre_empresa ?? '—',
                        proveedor_ruc:      r.proveedor?.ruc ?? '',
                        factura_numero:     r.compra?.numero_factura ?? null,
                        fecha_emision:      r.fecha_emision,
                        lineas:             [],
                        total:              0,
                        estado:             r.estado,
                        origen:             r.origen,
                        numero_autorizacion: r.numero_autorizacion,
                    })
                }
                const doc = mapa.get(clave)!
                doc.lineas.push({
                    tipo:             r.tipo,
                    codigo_retencion: r.codigo_retencion,
                    descripcion:      r.descripcion ?? '',
                    base_imponible:   r.base_imponible,
                    porcentaje:       r.porcentaje,
                    valor:            r.valor,
                })
                doc.total += r.valor
            })
            setDocs(Array.from(mapa.values()))
        } catch (e: any) { alert('Error: ' + e.message) }
        finally { setLoading(false) }
    }

    const visibles = docs.filter(d => {
        if (!busqueda) return true
        const q = busqueda.toLowerCase()
        return (
            d.proveedor_nombre.toLowerCase().includes(q) ||
            d.proveedor_ruc.includes(q) ||
            d.numero_retencion?.toLowerCase().includes(q) ||
            d.factura_numero?.toLowerCase().includes(q)
        )
    })

    const totalRetenido  = visibles.filter(d => d.estado === 'ACTIVO').reduce((s, d) => s + d.total, 0)
    const ctdElectronica = visibles.filter(d => d.origen === 'SRI').length
    const ctdManual      = visibles.filter(d => d.origen === 'MANUAL').length

    return (
        <div className="space-y-5">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Comprobantes de Retención</h1>
                <p className="text-slate-500 text-sm">Retenciones emitidas a proveedores</p>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: 'Total retenido',    val: fmt(totalRetenido), color: 'text-amber-700' },
                    { label: 'Documentos',        val: visibles.length,    color: 'text-slate-700' },
                    { label: 'Manuales',          val: ctdManual,          color: 'text-slate-600' },
                    { label: 'Electrónicas (SRI)',val: ctdElectronica,     color: 'text-green-700' },
                ].map(k => (
                    <div key={k.label} className="card p-4 text-center">
                        <p className="text-xs text-slate-400 mb-1">{k.label}</p>
                        <p className={`text-xl font-bold ${k.color}`}>{k.val}</p>
                    </div>
                ))}
            </div>

            {/* Filtros */}
            <div className="card p-4 space-y-3 no-print">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div><label className="label text-xs">Desde</label>
                        <input type="date" className="input text-sm" value={desde} onChange={e => setDesde(e.target.value)} /></div>
                    <div><label className="label text-xs">Hasta</label>
                        <input type="date" className="input text-sm" value={hasta} onChange={e => setHasta(e.target.value)} /></div>
                    <div><label className="label text-xs">Proveedor</label>
                        <select className="input text-sm" value={provId} onChange={e => setProvId(e.target.value)}>
                            <option value="">Todos</option>
                            {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre_empresa}</option>)}
                        </select></div>
                    <div className="flex items-end">
                        <button onClick={load} className="btn btn-primary text-sm w-full">Buscar</button>
                    </div>
                </div>
                <div className="flex gap-3">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input className="input pl-9 text-sm" placeholder="Buscar proveedor, RUC, nº retención..."
                            value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                    </div>
                    <PrintExportBar
                        datos={visibles.map(d => ({
                            Fecha:           d.fecha_emision,
                            NroRetencion:    d.numero_retencion ?? '',
                            Proveedor:       d.proveedor_nombre,
                            RUC:             d.proveedor_ruc,
                            FacturaRelacion: d.factura_numero ?? '',
                            TotalRetenido:   d.total,
                            Origen:          d.origen,
                            Estado:          d.estado,
                        }))}
                        nombreArchivo="comprobantes_retencion"
                    />
                </div>
            </div>

            {/* Lista de comprobantes */}
            {loading ? (
                <div className="flex items-center justify-center py-16 gap-2 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin" /> Cargando...
                </div>
            ) : visibles.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                    <FileText className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                    <p>No hay comprobantes de retención en este período</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {visibles.map((doc, idx) => {
                        const clave    = `${doc.compra_id}|${doc.numero_retencion}`
                        const abierto  = expandido === clave
                        const esElect  = doc.origen === 'SRI'

                        return (
                            <div key={idx} className="card overflow-hidden">
                                {/* Cabecera del documento */}
                                <button
                                    onClick={() => setExpandido(abierto ? null : clave)}
                                    className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors text-left"
                                >
                                    {/* Ícono estado */}
                                    <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                                        esElect ? 'bg-green-100' : 'bg-amber-100')}>
                                        {esElect
                                            ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                                            : <Clock className="w-5 h-5 text-amber-600" />
                                        }
                                    </div>

                                    {/* Info principal */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-bold text-slate-900">
                                                {doc.numero_retencion
                                                    ? <span className="font-mono">{doc.numero_retencion}</span>
                                                    : <span className="text-slate-400 italic">Sin número</span>
                                                }
                                            </span>
                                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold',
                                                esElect ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700')}>
                                                {esElect ? 'Electrónica SRI' : 'Manual'}
                                            </span>
                                            {doc.estado === 'ANULADO' && (
                                                <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-600">
                                                    ANULADA
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-slate-600 mt-0.5 truncate">
                                            {doc.proveedor_nombre}
                                            <span className="text-slate-400 ml-2 text-xs">{doc.proveedor_ruc}</span>
                                        </p>
                                        {doc.factura_numero && (
                                            <p className="text-xs text-slate-400 font-mono">
                                                Fact. relacionada: {doc.factura_numero}
                                            </p>
                                        )}
                                    </div>

                                    <div className="text-right shrink-0">
                                        <p className="text-xs text-slate-400">{fmtF(doc.fecha_emision)}</p>
                                        <p className="font-bold text-amber-700 font-mono">{fmt(doc.total)}</p>
                                        <p className="text-xs text-slate-400">{doc.lineas.length} línea(s)</p>
                                    </div>

                                    {abierto
                                        ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                                        : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                                    }
                                </button>

                                {/* Detalle expandido */}
                                {abierto && (
                                    <div className="border-t border-slate-100 p-4 space-y-3 bg-slate-50/50">
                                        {/* Info SRI si es electrónica */}
                                        {esElect && doc.numero_autorizacion && (
                                            <div className="flex items-center gap-2 p-3 bg-green-50 rounded-xl text-xs">
                                                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                                                <div>
                                                    <p className="font-semibold text-green-800">Autorizada por SRI</p>
                                                    <p className="font-mono text-green-700 break-all">{doc.numero_autorizacion}</p>
                                                </div>
                                            </div>
                                        )}
                                        {!esElect && (
                                            <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-xl text-xs text-amber-700">
                                                <AlertCircle className="w-4 h-4 shrink-0" />
                                                <p>Retención manual — pendiente de autorización electrónica SRI</p>
                                            </div>
                                        )}

                                        {/* Tabla de líneas */}
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="text-slate-500 border-b font-semibold">
                                                    <th className="text-left py-2 pr-3">Tipo</th>
                                                    <th className="text-left py-2 pr-3">Código</th>
                                                    <th className="text-left py-2 pr-3 max-w-xs">Descripción</th>
                                                    <th className="text-right py-2 px-3">Base</th>
                                                    <th className="text-right py-2 px-3">%</th>
                                                    <th className="text-right py-2 pl-3">Valor</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {doc.lineas.map((l, li) => (
                                                    <tr key={li}>
                                                        <td className="py-2 pr-3">
                                                            <span className={cn('px-2 py-0.5 rounded-full font-semibold',
                                                                l.tipo === 'FUENTE' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700')}>
                                                                {l.tipo}
                                                            </span>
                                                        </td>
                                                        <td className="py-2 pr-3 font-mono font-bold">{l.codigo_retencion}</td>
                                                        <td className="py-2 pr-3 text-slate-600 max-w-xs truncate" title={l.descripcion}>
                                                            {l.descripcion}
                                                        </td>
                                                        <td className="py-2 px-3 text-right font-mono">{fmt(l.base_imponible)}</td>
                                                        <td className="py-2 px-3 text-right font-mono">{l.porcentaje}%</td>
                                                        <td className="py-2 pl-3 text-right font-mono font-bold text-amber-700">{fmt(l.valor)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot className="border-t-2 font-bold">
                                                <tr>
                                                    <td colSpan={5} className="py-2 text-right text-slate-600">Total retenido:</td>
                                                    <td className="py-2 pl-3 text-right font-mono text-amber-800">{fmt(doc.total)}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
