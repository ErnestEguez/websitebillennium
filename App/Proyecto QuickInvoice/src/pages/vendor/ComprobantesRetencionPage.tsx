import { useState, useEffect, useRef } from 'react'
import { useReactToPrint } from 'react-to-print'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { proveedorService } from '../../services/vendorService'
import type { Proveedor } from '../../types/vendors'
import {
    FileText, Search, ChevronDown, ChevronUp,
    Loader2, CheckCircle2, AlertCircle, Clock, Download, Send, X,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { PrintExportBar } from '../../components/vendor/PrintExportBar'

const HOY = new Date().toISOString().split('T')[0]
const PRIMER_DIA_MES = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
const fmt  = (n: number) => `$${n.toFixed(2)}`
const fmtF = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })

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
    .rpt-periodo { font-size:9.5px; color:#555; font-weight:bold; margin-top:2px; }
    .rpt-gen     { font-size:8px; color:#aaa; margin-top:3px; }
    .filtros-bar { display:flex; gap:14px; flex-wrap:wrap;
        padding:5px 0; margin-bottom:10px;
        border-bottom:1px solid #e4e9f2; font-size:8.5px; color:#666; }
    .filtros-bar span { font-weight:bold; color:#333; }
    table { width:100%; border-collapse:collapse; }
    thead tr { background:#1e3a5f; color:#fff; }
    thead th { padding:5px 7px; font-size:8.5px; text-transform:uppercase; letter-spacing:0.4px; font-weight:bold; }
    thead th.r { text-align:right; }
    tbody tr.alt { background:#f4f7fc; }
    tbody tr.anu { opacity:0.4; }
    tbody td { padding:4px 7px; border-bottom:1px solid #e4e9f2; font-size:9px; vertical-align:top; }
    tbody td.r { text-align:right; font-family:'Courier New',monospace; }
    .lineas-table { width:100%; border-collapse:collapse; margin-top:3px; }
    .lineas-table td { padding:2px 0; font-size:8px; border:none; color:#555; }
    .lineas-table td.r { text-align:right; font-family:'Courier New',monospace; }
    tfoot tr { background:#1e3a5f; color:#fff; }
    tfoot td { padding:5px 7px; font-size:9px; font-weight:bold; }
    tfoot td.r { text-align:right; font-family:'Courier New',monospace; }
    .badge { display:inline-block; padding:1px 5px; border-radius:99px;
        font-size:7.5px; font-weight:800; text-transform:uppercase; }
    .badge-aut { background:#dcfce7; color:#15803d; }
    .badge-env { background:#dbeafe; color:#1d4ed8; }
    .badge-pen { background:#fef3c7; color:#b45309; }
    .badge-rec { background:#fee2e2; color:#b91c1c; }
    .rpt-footer { margin-top:16px; border-top:1px solid #cbd5e0; padding-top:6px;
        display:flex; justify-content:space-between; font-size:8px; color:#94a3b8; }
`

type EstadoSri = 'NO_FIRMADA' | 'ENVIADO' | 'AUTORIZADO' | 'RECHAZADO' | null

interface RetencionDocumento {
    compra_id:            string
    numero_retencion:     string | null
    proveedor_id:         string
    proveedor_nombre:     string
    proveedor_ruc:        string
    factura_numero:       string | null
    fecha_emision:        string
    lineas: {
        tipo:             string
        codigo_retencion: string
        descripcion:      string
        base_imponible:   number
        porcentaje:       number
        valor:            number
    }[]
    total:                number
    estado:               string
    origen:               string
    numero_autorizacion:  string | null
    fecha_autorizacion:   string | null
    estado_sri:           EstadoSri
    clave_acceso:         string | null
    xml_firmado:          string | null
    observaciones_sri:    string | null
}

const SRI_BADGE: Record<NonNullable<EstadoSri>, { cls: string; label: string }> = {
    NO_FIRMADA: { cls: 'bg-amber-100 text-amber-700',  label: 'Pendiente SRI'  },
    ENVIADO:    { cls: 'bg-blue-100 text-blue-700',    label: 'Enviada SRI'    },
    AUTORIZADO: { cls: 'bg-green-100 text-green-700',  label: 'Autorizada SRI' },
    RECHAZADO:  { cls: 'bg-red-100 text-red-600',      label: 'Rechazada SRI'  },
}

export function ComprobantesRetencionPage() {
    const { empresa }                 = useAuth()
    const printRef                    = useRef<HTMLDivElement>(null)
    const [docs, setDocs]             = useState<RetencionDocumento[]>([])
    const [proveedores, setProveedores] = useState<Proveedor[]>([])
    const [loading, setLoading]       = useState(true)
    const [expandido, setExpandido]   = useState<string | null>(null)
    const [busqueda, setBusqueda]     = useState('')
    const [desde, setDesde]           = useState(PRIMER_DIA_MES)
    const [hasta, setHasta]           = useState(HOY)
    const [provId, setProvId]         = useState('')
    const [sriLoading, setSriLoading] = useState<string | null>(null)
    const [sriMsg, setSriMsg]         = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null)
    const mountedRef = useRef(true)
    useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

    const generadoEl = new Date().toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' } as any)

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: `Retenciones_${desde}_${hasta}`,
        pageStyle: PRINT_CSS,
    })

    useEffect(() => {
        if (empresa?.id) {
            proveedorService.listar(empresa.id).then(setProveedores).catch(() => {})
            load()
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
                    fecha_autorizacion,
                    estado_sri,
                    clave_acceso,
                    xml_firmado,
                    observaciones_sri,
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

            const mapa = new Map<string, RetencionDocumento>()
            ;(data ?? []).forEach((r: any) => {
                const clave = `${r.compra_id}|${r.numero_retencion ?? 'sin_numero'}`
                if (!mapa.has(clave)) {
                    mapa.set(clave, {
                        compra_id:           r.compra_id,
                        numero_retencion:    r.numero_retencion,
                        proveedor_id:        r.proveedor_id,
                        proveedor_nombre:    r.proveedor?.nombre_empresa ?? '—',
                        proveedor_ruc:       r.proveedor?.ruc ?? '',
                        factura_numero:      r.compra?.numero_factura ?? null,
                        fecha_emision:       r.fecha_emision,
                        lineas:              [],
                        total:               0,
                        estado:              r.estado,
                        origen:              r.origen,
                        numero_autorizacion: r.numero_autorizacion,
                        fecha_autorizacion:  r.fecha_autorizacion,
                        estado_sri:          r.estado_sri as EstadoSri,
                        clave_acceso:        r.clave_acceso,
                        xml_firmado:         r.xml_firmado,
                        observaciones_sri:   r.observaciones_sri,
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
            if (mountedRef.current) setDocs(Array.from(mapa.values()))
        } catch (e: any) {
            if (mountedRef.current)
                setSriMsg({ tipo: 'err', texto: 'Error al cargar: ' + e.message })
        } finally {
            if (mountedRef.current) setLoading(false)
        }
    }

    async function autorizarSRI(doc: RetencionDocumento) {
        if (!empresa?.id) return
        setSriLoading(doc.compra_id)
        setSriMsg(null)
        try {
            const { data, error } = await supabase.functions.invoke('sri-retencion', {
                body: { compra_id: doc.compra_id, empresa_id: empresa.id },
            })
            if (error) throw new Error(error.message || 'Error al invocar función')
            if (!data?.success) throw new Error(data?.error || 'Error en función SRI')

            if (mountedRef.current) {
                const msg = data.authorized
                    ? `✓ Autorizada por SRI — Nº ${data.numero_autorizacion ?? ''}`
                    : `SRI respondió: ${data.message || data.estado_sri}`
                setSriMsg({ tipo: data.authorized ? 'ok' : 'err', texto: msg })
                await load()
            }
        } catch (e: any) {
            if (mountedRef.current)
                setSriMsg({ tipo: 'err', texto: 'Error: ' + e.message })
        } finally {
            if (mountedRef.current) setSriLoading(null)
        }
    }

    function descargarXml(doc: RetencionDocumento) {
        if (!doc.xml_firmado) return
        const blob = new Blob([doc.xml_firmado], { type: 'application/xml' })
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a')
        a.href     = url
        a.download = `RET-${doc.numero_retencion ?? doc.compra_id}.xml`
        a.click()
        URL.revokeObjectURL(url)
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

    const totalRetenido   = visibles.filter(d => d.estado === 'ACTIVO').reduce((s, d) => s + d.total, 0)
    const ctdAutorizadas  = visibles.filter(d => d.estado_sri === 'AUTORIZADO').length
    const ctdPendientes   = visibles.filter(d => d.estado !== 'ANULADO' && d.estado_sri !== 'AUTORIZADO').length

    return (
        <div className="space-y-5">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Comprobantes de Retención</h1>
                <p className="text-slate-500 text-sm">Retenciones emitidas a proveedores</p>
            </div>

            {/* Banner SRI */}
            {sriMsg && (
                <div className={cn(
                    'flex items-start gap-3 p-4 rounded-xl text-sm',
                    sriMsg.tipo === 'ok'
                        ? 'bg-green-50 border border-green-200 text-green-800'
                        : 'bg-red-50 border border-red-200 text-red-800'
                )}>
                    {sriMsg.tipo === 'ok'
                        ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                        : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    }
                    <p className="flex-1">{sriMsg.texto}</p>
                    <button onClick={() => setSriMsg(null)} className="p-0.5 hover:opacity-60">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: 'Total retenido',      val: fmt(totalRetenido), color: 'text-amber-700' },
                    { label: 'Documentos',           val: visibles.length,    color: 'text-slate-700' },
                    { label: 'Autorizadas SRI',      val: ctdAutorizadas,     color: 'text-green-700' },
                    { label: 'Pendientes de firma',  val: ctdPendientes,      color: 'text-amber-600' },
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
                            EstadoSRI:       d.estado_sri ?? 'NO_FIRMADA',
                            Autorizacion:    d.numero_autorizacion ?? '',
                        }))}
                        nombreArchivo="comprobantes_retencion"
                        onPrint={() => handlePrint()}
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
                        const clave     = `${doc.compra_id}|${doc.numero_retencion}`
                        const abierto   = expandido === clave
                        const sriBadge  = SRI_BADGE[doc.estado_sri ?? 'NO_FIRMADA']
                        const autorizado = doc.estado_sri === 'AUTORIZADO'
                        const procesando = sriLoading === doc.compra_id

                        return (
                            <div key={idx} className="card overflow-hidden">
                                {/* Cabecera */}
                                <button
                                    onClick={() => setExpandido(abierto ? null : clave)}
                                    className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors text-left"
                                >
                                    <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
                                        autorizado ? 'bg-green-100' : 'bg-amber-100')}>
                                        {autorizado
                                            ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                                            : <Clock className="w-5 h-5 text-amber-600" />
                                        }
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-bold text-slate-900">
                                                {doc.numero_retencion
                                                    ? <span className="font-mono">{doc.numero_retencion}</span>
                                                    : <span className="text-slate-400 italic">Sin número</span>
                                                }
                                            </span>
                                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold', sriBadge.cls)}>
                                                {sriBadge.label}
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

                                        {/* Estado SRI */}
                                        {autorizado ? (
                                            <div className="flex items-start gap-2 p-3 bg-green-50 rounded-xl text-xs">
                                                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-semibold text-green-800">Autorizada por SRI</p>
                                                    {doc.numero_autorizacion && (
                                                        <p className="font-mono text-green-700 break-all mt-0.5">
                                                            Nº {doc.numero_autorizacion}
                                                        </p>
                                                    )}
                                                    {doc.fecha_autorizacion && (
                                                        <p className="text-green-600 mt-0.5">
                                                            {new Date(doc.fecha_autorizacion).toLocaleString('es-EC')}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        ) : doc.estado_sri === 'RECHAZADO' ? (
                                            <div className="flex items-start gap-2 p-3 bg-red-50 rounded-xl text-xs text-red-700">
                                                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                                <div>
                                                    <p className="font-semibold">Rechazada por SRI</p>
                                                    {doc.observaciones_sri && (
                                                        <p className="mt-0.5 break-words">{doc.observaciones_sri}</p>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-xl text-xs text-amber-700">
                                                <AlertCircle className="w-4 h-4 shrink-0" />
                                                <p className="flex-1">
                                                    {doc.estado_sri === 'ENVIADO'
                                                        ? 'Enviada al SRI — pendiente de autorización'
                                                        : 'Pendiente de firma electrónica SRI'
                                                    }
                                                </p>
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

                                        {/* Acciones SRI */}
                                        {doc.estado !== 'ANULADO' && (
                                            <div className="flex gap-2 pt-1">
                                                {!autorizado && (
                                                    <button
                                                        onClick={() => autorizarSRI(doc)}
                                                        disabled={procesando}
                                                        className="btn btn-primary text-xs flex items-center gap-1.5"
                                                    >
                                                        {procesando
                                                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Procesando...</>
                                                            : <><Send className="w-3.5 h-3.5" /> Autorizar SRI</>
                                                        }
                                                    </button>
                                                )}
                                                {doc.xml_firmado && (
                                                    <button
                                                        onClick={() => descargarXml(doc)}
                                                        className="btn btn-secondary text-xs flex items-center gap-1.5"
                                                    >
                                                        <Download className="w-3.5 h-3.5" /> Descargar XML
                                                    </button>
                                                )}
                                                <Link
                                                    to={`/retenciones/${doc.compra_id}/ride`}
                                                    className="btn btn-secondary text-xs flex items-center gap-1.5"
                                                >
                                                    <FileText className="w-3.5 h-3.5" /> Ver RIDE
                                                </Link>
                                                {doc.estado_sri === 'RECHAZADO' && (
                                                    <button
                                                        onClick={() => autorizarSRI(doc)}
                                                        disabled={procesando}
                                                        className="btn btn-secondary text-xs flex items-center gap-1.5"
                                                    >
                                                        {procesando
                                                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Reintentando...</>
                                                            : <><Send className="w-3.5 h-3.5" /> Reintentar SRI</>
                                                        }
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* ── ÁREA DE IMPRESIÓN ── */}
            <div className="hidden">
                <div ref={printRef}>
                    <div className="rpt-header">
                        <div>
                            <div className="emp-nombre">{empresa?.nombre ?? 'Empresa'}</div>
                            <div className="emp-sub">RUC: {(empresa as any)?.ruc ?? '—'}</div>
                        </div>
                        <div className="rpt-header-right">
                            <div className="rpt-titulo">Comprobantes de Retención</div>
                            <div className="rpt-periodo">
                                Período: {fmtF(desde)} al {fmtF(hasta)}
                            </div>
                            <div className="rpt-gen">Generado: {generadoEl}</div>
                        </div>
                    </div>

                    <div className="filtros-bar">
                        {provId && <div>Proveedor: <span>{proveedores.find(p=>p.id===provId)?.nombre_empresa ?? provId}</span></div>}
                        <div>Registros: <span>{visibles.length}</span></div>
                        <div>Total retenido: <span>{fmt(visibles.filter(d=>d.estado==='ACTIVO').reduce((s,d)=>s+d.total,0))}</span></div>
                        <div>Autorizadas SRI: <span>{visibles.filter(d=>d.estado_sri==='AUTORIZADO').length}</span></div>
                    </div>

                    <table>
                        <thead>
                            <tr>
                                <th style={{textAlign:'left', width:'68px'}}>Fecha</th>
                                <th style={{textAlign:'left', width:'90px'}}>Nº Retención</th>
                                <th style={{textAlign:'left'}}>Proveedor</th>
                                <th style={{textAlign:'left', width:'80px'}}>Fact. Rel.</th>
                                <th style={{textAlign:'left', width:'80px'}}>Estado SRI</th>
                                <th className="r" style={{width:'70px'}}>Total</th>
                                <th style={{textAlign:'left', width:'60px'}}>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibles.map((d, i) => (
                                <tr key={i} className={`${i%2!==0?'alt':''} ${d.estado==='ANULADO'?'anu':''}`}>
                                    <td>{fmtF(d.fecha_emision)}</td>
                                    <td style={{fontFamily:"'Courier New',monospace", fontSize:'8.5px'}}>
                                        {d.numero_retencion ?? '—'}
                                    </td>
                                    <td>
                                        <div style={{fontWeight:'600'}}>{d.proveedor_nombre}</div>
                                        <div style={{fontSize:'8px',color:'#888'}}>{d.proveedor_ruc}</div>
                                        {d.lineas.length > 0 && (
                                            <table className="lineas-table">
                                                <tbody>
                                                    {d.lineas.map((l, li) => (
                                                        <tr key={li}>
                                                            <td style={{width:'36px',color:'#6d28d9',fontWeight:'bold'}}>{l.codigo_retencion}</td>
                                                            <td style={{width:'34px'}}>{l.tipo}</td>
                                                            <td>{l.descripcion}</td>
                                                            <td className="r" style={{width:'52px'}}>{fmt(l.base_imponible)} × {l.porcentaje}%</td>
                                                            <td className="r" style={{width:'50px',fontWeight:'bold',color:'#b45309'}}>{fmt(l.valor)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </td>
                                    <td style={{fontFamily:"'Courier New',monospace",fontSize:'8.5px',color:'#555'}}>
                                        {d.factura_numero ?? '—'}
                                    </td>
                                    <td>
                                        <span className={
                                            d.estado_sri === 'AUTORIZADO' ? 'badge badge-aut' :
                                            d.estado_sri === 'ENVIADO'    ? 'badge badge-env' :
                                            d.estado_sri === 'RECHAZADO'  ? 'badge badge-rec' : 'badge badge-pen'
                                        }>
                                            {d.estado_sri === 'AUTORIZADO' ? 'Autorizada' :
                                             d.estado_sri === 'ENVIADO'    ? 'Enviada'    :
                                             d.estado_sri === 'RECHAZADO'  ? 'Rechazada'  : 'Pendiente'}
                                        </span>
                                    </td>
                                    <td className="r" style={{fontWeight:'bold',color:'#b45309'}}>{fmt(d.total)}</td>
                                    <td>
                                        <span className={d.estado==='ACTIVO' ? 'badge badge-aut' : 'badge badge-rec'}>
                                            {d.estado}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colSpan={5} style={{fontSize:'8px',color:'#ccd3e0'}}>
                                    {visibles.length} comprobantes · {visibles.filter(d=>d.estado_sri==='AUTORIZADO').length} autorizadas SRI
                                </td>
                                <td className="r" style={{fontSize:'11px',color:'#fbbf24'}}>
                                    {fmt(visibles.filter(d=>d.estado==='ACTIVO').reduce((s,d)=>s+d.total,0))}
                                </td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>

                    <div className="rpt-footer">
                        <span>QuickInvoice — Finance Suite · Billennium System</span>
                        <span>Documento confidencial — uso exclusivo de {empresa?.nombre ?? 'la empresa'}</span>
                        <span>{generadoEl}</span>
                    </div>
                </div>
            </div>
            {/* ── Fin área de impresión ── */}

        </div>
    )
}

