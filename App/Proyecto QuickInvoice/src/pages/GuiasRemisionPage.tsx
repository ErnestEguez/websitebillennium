import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { guiaRemisionService } from '../services/guiaRemisionService'
import type { GuiaRemision, DetalleGuiaRemision, GuiaRemisionInput } from '../services/guiaRemisionService'
import { transportistasService } from '../services/transportistasService'
import type { Transportista } from '../services/transportistasService'
import { catalogCacheService } from '../services/catalogCacheService'
import {
    Truck, Plus, Search, ChevronDown, ChevronUp,
    Loader2, CheckCircle2, AlertCircle, Clock, Download, Send,
    FileText, RefreshCw, X, ChevronRight,
} from 'lucide-react'
import { cn } from '../lib/utils'

// ── helpers ────────────────────────────────────────────────────
function hoyISO() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function fmtFecha(s?: string | null) {
    if (!s) return '—'
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    return m ? `${m[3]}/${m[2]}/${m[1]}` : s
}

const MOTIVOS = ['VENTA', 'DEVOLUCIÓN', 'TRASLADO INTERNO', 'EXPORTACIÓN', 'CONSIGNACIÓN']

const BADGE: Record<string, string> = {
    AUTORIZADO: 'bg-green-100 text-green-700',
    ENVIADO:    'bg-blue-100  text-blue-700',
    PENDIENTE:  'bg-yellow-100 text-yellow-700',
    RECHAZADO:  'bg-red-100   text-red-700',
}
const ICON: Record<string, React.ReactElement> = {
    AUTORIZADO: <CheckCircle2 className="w-3.5 h-3.5" />,
    ENVIADO:    <Send         className="w-3.5 h-3.5" />,
    PENDIENTE:  <Clock        className="w-3.5 h-3.5" />,
    RECHAZADO:  <AlertCircle  className="w-3.5 h-3.5" />,
}

// ── tipos internos del wizard ──────────────────────────────────
interface LineaWizard extends DetalleGuiaRemision { _key: number; _include: boolean }

const PASOS = ['Factura', 'Productos', 'Transportista', 'Destinatario']

export default function GuiasRemisionPage() {
    const { empresa } = useAuth()
    const navigate    = useNavigate()

    // ── listado ────────────────────────────────────────────────
    const [guias,    setGuias]    = useState<GuiaRemision[]>([])
    const [loading,  setLoading]  = useState(false)
    const [desde,    setDesde]    = useState(hoyISO())
    const [hasta,    setHasta]    = useState(hoyISO())
    const [estado,   setEstado]   = useState('TODOS')
    const [busqueda, setBusqueda] = useState('')
    const [expanded, setExpanded] = useState<string | null>(null)
    const [actionLoad, setActionLoad] = useState<string | null>(null)

    // ── wizard ─────────────────────────────────────────────────
    const [showWizard, setShowWizard] = useState(false)
    const [paso,       setPaso]       = useState(0)
    const [saving,     setSaving]     = useState(false)
    const [wizardErr,  setWizardErr]  = useState('')

    // Paso 1 — factura
    const [numFactura,    setNumFactura]    = useState('')
    const [facturaLoad,   setFacturaLoad]   = useState(false)
    const [facturaData,   setFacturaData]   = useState<any | null>(null)

    // Paso 2 — productos
    const [lineas, setLineas] = useState<LineaWizard[]>([])

    // Paso 3 — transportista
    const [transportistas, setTransportistas] = useState<Transportista[]>([])
    const [transpId,       setTranspId]       = useState('')
    const [transpNombre,   setTranspNombre]   = useState('')
    const [transpId2,      setTranspId2]      = useState('')   // identificación
    const [transpTipo,     setTranspTipo]     = useState('05')
    const [placa,          setPlaca]          = useState('')
    const [fechaIni,       setFechaIni]       = useState(hoyISO())
    const [fechaFin,       setFechaFin]       = useState(hoyISO())
    const [motivo,         setMotivo]         = useState('VENTA')
    const [ruta,           setRuta]           = useState('')
    const [dirSalida,      setDirSalida]      = useState('')
    const [showNuevoTransp, setShowNuevoTransp] = useState(false)

    // Paso 4 — destinatario
    const [clientes,       setClientes]       = useState<any[]>([])
    const [destBusq,       setDestBusq]       = useState('')
    const [destManual,     setDestManual]     = useState(false)
    const [destClienteId,  setDestClienteId]  = useState('')
    const [destNombre,     setDestNombre]     = useState('')
    const [destId,         setDestId]         = useState('')
    const [destDir,        setDestDir]        = useState('')

    // ── cargar guías ───────────────────────────────────────────
    const cargar = useCallback(async () => {
        if (!empresa) return
        setLoading(true)
        try {
            const data = await guiaRemisionService.listar(empresa.id, {
                desde, hasta, estado, busqueda
            })
            setGuias(data)
        } catch (e: any) {
            console.error(e)
        } finally {
            setLoading(false)
        }
    }, [empresa, desde, hasta, estado, busqueda])

    useEffect(() => { cargar() }, [cargar])

    // ── KPIs ───────────────────────────────────────────────────
    const kpiTotal      = guias.length
    const kpiAut        = guias.filter(g => g.estado_sri === 'AUTORIZADO').length
    const kpiPend       = guias.filter(g => g.estado_sri === 'PENDIENTE').length
    const kpiRech       = guias.filter(g => g.estado_sri === 'RECHAZADO').length

    // ── acciones tarjeta ───────────────────────────────────────
    async function autorizar(id: string) {
        setActionLoad(id + '-aut')
        const r = await guiaRemisionService.reenviar(id)
        if (r.success) await cargar()
        else alert('Error: ' + r.message)
        setActionLoad(null)
    }

    async function reintentar(id: string) {
        setActionLoad(id + '-ret')
        const r = await guiaRemisionService.reenviar(id)
        if (r.success) await cargar()
        else alert('Error: ' + r.message)
        setActionLoad(null)
    }

    function descargarXml(g: GuiaRemision) {
        if (!g.xml_firmado) { alert('XML no disponible'); return }
        const blob = new Blob([g.xml_firmado], { type: 'application/xml' })
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
        a.download = `GR_${g.secuencial}.xml`; a.click()
    }

    // ── wizard helpers ──────────────────────────────────────────
    function abrirWizard() {
        setPaso(0); setNumFactura(''); setFacturaData(null); setLineas([])
        setTranspId(''); setTranspNombre(''); setTranspId2(''); setTranspTipo('05')
        setPlaca(''); setFechaIni(hoyISO()); setFechaFin(hoyISO())
        setMotivo('VENTA'); setRuta(''); setDirSalida('')
        setDestBusq(''); setDestManual(false); setDestClienteId('')
        setDestNombre(''); setDestId(''); setDestDir('')
        setWizardErr(''); setShowNuevoTransp(false); setShowWizard(true)
    }

    async function buscarFactura() {
        if (!empresa || !numFactura.trim()) return
        setFacturaLoad(true); setWizardErr('')
        try {
            const { data } = await supabase
                .from('comprobantes')
                .select('*, clientes(*), comprobante_detalles(*)')
                .eq('empresa_id', empresa.id)
                .eq('secuencial', numFactura.trim())
                .maybeSingle()
            if (!data) { setWizardErr('Factura no encontrada'); setFacturaLoad(false); return }
            setFacturaData(data)
            const ls: LineaWizard[] = (data.comprobante_detalles || []).map((d: any, i: number) => ({
                _key:           i,
                _include:       true,
                producto_id:    d.producto_id || null,
                codigo:         d.productos?.codigo || '',
                descripcion:    d.nombre_producto || '',
                cantidad:       Number(d.cantidad),
                precio_unitario: Number(d.precio_unitario),
                total:          Number(d.subtotal),
            }))
            setLineas(ls)
            // Auto-completar destinatario con el cliente de la factura
            const cl = data.clientes
            if (cl) {
                setDestClienteId(cl.id); setDestNombre(cl.nombre || ''); setDestId(cl.identificacion || ''); setDestDir(cl.direccion || '')
            }
        } catch (e: any) {
            setWizardErr(e.message)
        } finally {
            setFacturaLoad(false)
        }
    }

    async function iniciarPaso3() {
        if (!empresa) return
        try {
            const ts = await transportistasService.listar(empresa.id)
            setTransportistas(ts)
        } catch { /* tabla puede no existir aún */ }
        try {
            const { data: emp } = await supabase.from('empresas').select('direccion').eq('id', empresa.id).single()
            setDirSalida(emp?.direccion || '')
        } catch { /* ignorar */ }
    }

    async function iniciarPaso4() {
        if (!empresa) return
        const cl = await catalogCacheService.getClientes(empresa.id)
        setClientes(cl)
    }

    function seleccionarTransportista(t: Transportista) {
        setTranspId(t.id); setTranspNombre(t.nombre)
        setTranspId2(t.identificacion); setTranspTipo(t.tipo_identificacion)
        setPlaca(t.placa)
    }

    function seleccionarCliente(c: any) {
        setDestClienteId(c.id); setDestNombre(c.nombre)
        setDestId(c.identificacion || ''); setDestDir(c.direccion || '')
        setDestBusq('')
    }

    const clientesFiltrados = destBusq.length >= 2
        ? clientes.filter(c =>
            c.nombre?.toLowerCase().includes(destBusq.toLowerCase()) ||
            c.identificacion?.includes(destBusq)
          ).slice(0, 10)
        : []

    async function avanzar() {
        setWizardErr('')
        if (paso === 0) {
            if (!facturaData) { setWizardErr('Busque y cargue una factura primero'); return }
            setPaso(1)
        } else if (paso === 1) {
            if (!lineas.some(l => l._include)) { setWizardErr('Seleccione al menos un producto'); return }
            await iniciarPaso3(); setPaso(2)
        } else if (paso === 2) {
            if (!transpNombre || !transpId2 || !placa) { setWizardErr('Complete los datos del transportista'); return }
            await iniciarPaso4(); setPaso(3)
        } else if (paso === 3) {
            await generarGuia()
        }
    }

    async function guardarNuevoTransportista() {
        if (!empresa || !transpNombre || !transpId2 || !placa) {
            setWizardErr('Complete todos los campos del transportista'); return
        }
        try {
            const t = await transportistasService.crear({
                empresa_id: empresa.id, nombre: transpNombre,
                tipo_identificacion: transpTipo, identificacion: transpId2,
                placa, activo: true,
            })
            setTransportistas(prev => [...prev, t])
            seleccionarTransportista(t)
            setShowNuevoTransp(false)
        } catch (e: any) { setWizardErr(e.message) }
    }

    async function generarGuia() {
        if (!empresa || !facturaData) return
        if (!destNombre || !destId || !destDir) { setWizardErr('Complete los datos del destinatario'); return }
        setSaving(true); setWizardErr('')
        try {
            const detalesOk = lineas.filter(l => l._include).map(l => ({
                producto_id:     l.producto_id,
                codigo:          l.codigo,
                descripcion:     l.descripcion,
                cantidad:        l.cantidad,
                precio_unitario: l.precio_unitario,
                total:           l.total,
            }))

            const input: GuiaRemisionInput = {
                empresa_id:                   empresa.id,
                comprobante_id:               facturaData.id,
                doc_sustento_numero:          facturaData.secuencial,
                doc_sustento_autorizacion:    facturaData.autorizacion_numero || null,
                doc_sustento_fecha:           facturaData.created_at?.split('T')[0] || null,
                transportista_id:             transpId || null,
                transportista_nombre:         transpNombre,
                transportista_identificacion: transpId2,
                transportista_tipo_id:        transpTipo,
                placa,
                fecha_ini_transporte:         fechaIni,
                fecha_fin_transporte:         fechaFin,
                dir_salida:                   dirSalida,
                motivo_traslado:              motivo,
                ruta:                         ruta || null,
                cliente_id:                   destClienteId || null,
                destinatario_nombre:          destNombre,
                destinatario_identificacion:  destId,
                destinatario_direccion:       destDir,
                detalles:                     detalesOk,
            }

            await guiaRemisionService.crearGuia(input)
            setShowWizard(false)
            await cargar()
        } catch (e: any) {
            setWizardErr(e.message)
        } finally {
            setSaving(false)
        }
    }

    // ── render ─────────────────────────────────────────────────
    return (
        <div className="p-4 space-y-4 max-w-6xl mx-auto">

            {/* Encabezado */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Truck className="w-6 h-6 text-teal-600" />
                    <h1 className="text-xl font-bold text-slate-800">Guías de Remisión</h1>
                </div>
                <button
                    onClick={abrirWizard}
                    className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-3 py-1.5 rounded-lg"
                >
                    <Plus className="w-4 h-4" /> Nueva Guía
                </button>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: 'Total',       val: kpiTotal, cls: 'text-slate-700'  },
                    { label: 'Autorizadas', val: kpiAut,   cls: 'text-green-700'  },
                    { label: 'Pendientes',  val: kpiPend,  cls: 'text-yellow-700' },
                    { label: 'Rechazadas',  val: kpiRech,  cls: 'text-red-700'    },
                ].map(k => (
                    <div key={k.label} className="bg-white rounded-lg border border-slate-200 p-3 text-center">
                        <p className={`text-2xl font-bold ${k.cls}`}>{k.val}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{k.label}</p>
                    </div>
                ))}
            </div>

            {/* Filtros */}
            <div className="bg-white rounded-lg border border-slate-200 p-3 flex flex-wrap gap-3 items-end">
                <div>
                    <label className="block text-xs text-slate-500 mb-1">Desde</label>
                    <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
                        className="border border-slate-300 rounded px-2 py-1 text-sm" />
                </div>
                <div>
                    <label className="block text-xs text-slate-500 mb-1">Hasta</label>
                    <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
                        className="border border-slate-300 rounded px-2 py-1 text-sm" />
                </div>
                <div>
                    <label className="block text-xs text-slate-500 mb-1">Estado</label>
                    <select value={estado} onChange={e => setEstado(e.target.value)}
                        className="border border-slate-300 rounded px-2 py-1 text-sm">
                        <option value="TODOS">Todos</option>
                        <option value="AUTORIZADO">Autorizado</option>
                        <option value="PENDIENTE">Pendiente</option>
                        <option value="ENVIADO">Enviado</option>
                        <option value="RECHAZADO">Rechazado</option>
                    </select>
                </div>
                <div className="flex-1 min-w-[180px]">
                    <label className="block text-xs text-slate-500 mb-1">Buscar</label>
                    <div className="relative">
                        <Search className="absolute left-2 top-1.5 w-3.5 h-3.5 text-slate-400" />
                        <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
                            placeholder="Secuencial, destinatario, placa..."
                            className="border border-slate-300 rounded pl-7 pr-2 py-1 text-sm w-full" />
                    </div>
                </div>
                <button onClick={cargar} className="flex items-center gap-1 bg-teal-600 text-white text-sm px-3 py-1.5 rounded-lg hover:bg-teal-700">
                    <RefreshCw className="w-3.5 h-3.5" /> Actualizar
                </button>
            </div>

            {/* Listado */}
            {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-teal-500" /></div>
            ) : guias.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                    <Truck className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p>No hay guías de remisión en el período seleccionado</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {guias.map(g => {
                        const isExp = expanded === g.id
                        const est   = g.estado_sri || 'PENDIENTE'
                        const isAuth = est === 'AUTORIZADO'
                        return (
                            <div key={g.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                                {/* Cabecera tarjeta */}
                                <div className="flex items-center gap-2 px-3 py-2.5">
                                    {/* Info principal clickeable */}
                                    <button
                                        onClick={() => setExpanded(isExp ? null : g.id)}
                                        className="flex items-center gap-2 flex-1 text-left min-w-0"
                                    >
                                        <span className={cn('flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full shrink-0', BADGE[est] ?? 'bg-slate-100 text-slate-600')}>
                                            {ICON[est]} {est}
                                        </span>
                                        <span className="font-mono text-xs font-bold text-slate-700 shrink-0">{g.secuencial}</span>
                                        <span className="text-xs text-slate-500 truncate">{g.destinatario_nombre}</span>
                                        <span className="text-xs text-slate-400 shrink-0 hidden sm:block">{fmtFecha(g.fecha_emision)}</span>
                                        <span className="text-xs bg-slate-100 px-1.5 py-0.5 rounded font-mono shrink-0">{g.placa}</span>
                                    </button>

                                    {/* Botones siempre visibles */}
                                    <div className="flex items-center gap-1 shrink-0">
                                        {!isAuth && (
                                            <button
                                                onClick={() => autorizar(g.id)}
                                                disabled={actionLoad === g.id + '-aut'}
                                                className="flex items-center gap-1 text-xs bg-teal-600 hover:bg-teal-700 text-white px-2 py-1 rounded"
                                                title="Autorizar"
                                            >
                                                {actionLoad === g.id + '-aut' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                                                <span className="hidden sm:inline">Autorizar</span>
                                            </button>
                                        )}
                                        <button
                                            onClick={() => descargarXml(g)}
                                            disabled={!g.xml_firmado}
                                            className="flex items-center gap-1 text-xs border border-slate-300 hover:bg-slate-50 px-2 py-1 rounded disabled:opacity-40"
                                            title="Descargar XML"
                                        >
                                            <Download className="w-3 h-3" />
                                            <span className="hidden sm:inline">XML</span>
                                        </button>
                                        <button
                                            onClick={() => navigate(`/guias-remision/${g.id}/ride`)}
                                            className="flex items-center gap-1 text-xs border border-slate-300 hover:bg-slate-50 px-2 py-1 rounded"
                                            title="Ver RIDE"
                                        >
                                            <FileText className="w-3 h-3" />
                                            <span className="hidden sm:inline">RIDE</span>
                                        </button>
                                        {est === 'RECHAZADO' && (
                                            <button
                                                onClick={() => reintentar(g.id)}
                                                disabled={actionLoad === g.id + '-ret'}
                                                className="flex items-center gap-1 text-xs border border-orange-300 text-orange-600 hover:bg-orange-50 px-2 py-1 rounded"
                                                title="Reintentar"
                                            >
                                                {actionLoad === g.id + '-ret' ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                                <span className="hidden sm:inline">Reintentar</span>
                                            </button>
                                        )}
                                        <button onClick={() => setExpanded(isExp ? null : g.id)} className="p-1 text-slate-400 hover:text-slate-600">
                                            {isExp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </div>

                                {/* Panel expandible */}
                                {isExp && (
                                    <div className="border-t border-slate-100 px-3 py-2.5 bg-slate-50 space-y-2 text-xs text-slate-600">
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1">
                                            <div><span className="font-medium">Transportista:</span> {g.transportista_nombre}</div>
                                            <div><span className="font-medium">CI/RUC:</span> {g.transportista_identificacion}</div>
                                            <div><span className="font-medium">Placa:</span> {g.placa}</div>
                                            <div><span className="font-medium">Inicio:</span> {fmtFecha(g.fecha_ini_transporte)}</div>
                                            <div><span className="font-medium">Fin:</span> {fmtFecha(g.fecha_fin_transporte)}</div>
                                            <div><span className="font-medium">Motivo:</span> {g.motivo_traslado}</div>
                                            {g.ruta && <div><span className="font-medium">Ruta:</span> {g.ruta}</div>}
                                            <div><span className="font-medium">Doc. sustento:</span> {g.doc_sustento_numero}</div>
                                            {g.autorizacion_numero && <div className="col-span-2"><span className="font-medium">Autorización:</span> {g.autorizacion_numero}</div>}
                                        </div>
                                        {g.observaciones_sri && g.observaciones_sri !== 'OK' && (
                                            <div className="bg-red-50 border border-red-200 rounded px-2 py-1 text-red-700 text-xs">
                                                {g.observaciones_sri}
                                            </div>
                                        )}
                                        {(g.guia_remision_detalles ?? []).length > 0 && (
                                            <table className="w-full text-xs border-collapse">
                                                <thead>
                                                    <tr className="bg-slate-200 text-slate-600">
                                                        <th className="text-left px-2 py-1">Descripción</th>
                                                        <th className="text-right px-2 py-1">Cantidad</th>
                                                        <th className="text-right px-2 py-1">P. Unit.</th>
                                                        <th className="text-right px-2 py-1">Total</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(g.guia_remision_detalles ?? []).map((d: any, i: number) => (
                                                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                                            <td className="px-2 py-1">{d.descripcion}</td>
                                                            <td className="px-2 py-1 text-right">{Number(d.cantidad).toFixed(2)}</td>
                                                            <td className="px-2 py-1 text-right">{Number(d.precio_unitario).toFixed(4)}</td>
                                                            <td className="px-2 py-1 text-right font-medium">${Number(d.total).toFixed(2)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* ── WIZARD MODAL ── */}
            {showWizard && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                        {/* Header wizard */}
                        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200">
                            <div className="flex items-center gap-2">
                                <Truck className="w-5 h-5 text-teal-600" />
                                <span className="font-bold text-slate-700">Nueva Guía de Remisión</span>
                            </div>
                            <button onClick={() => setShowWizard(false)} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Steps indicator */}
                        <div className="flex px-5 py-2 gap-1 border-b border-slate-100">
                            {PASOS.map((p, i) => (
                                <div key={p} className="flex items-center gap-1">
                                    <div className={cn(
                                        'w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold',
                                        i < paso  ? 'bg-teal-600 text-white' :
                                        i === paso ? 'bg-teal-100 text-teal-700 ring-2 ring-teal-500' :
                                                     'bg-slate-100 text-slate-400'
                                    )}>{i + 1}</div>
                                    <span className={cn('text-xs hidden sm:block', i === paso ? 'text-teal-700 font-medium' : 'text-slate-400')}>{p}</span>
                                    {i < PASOS.length - 1 && <ChevronRight className="w-3 h-3 text-slate-300" />}
                                </div>
                            ))}
                        </div>

                        {/* Contenido pasos */}
                        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">

                            {/* ── PASO 0: Factura ── */}
                            {paso === 0 && (
                                <div className="space-y-3">
                                    <p className="text-sm text-slate-600">Ingrese el número completo de la factura de origen.</p>
                                    <div className="flex gap-2">
                                        <input
                                            value={numFactura}
                                            onChange={e => setNumFactura(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && buscarFactura()}
                                            placeholder="001-001-000000001"
                                            className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono"
                                        />
                                        <button onClick={buscarFactura} disabled={facturaLoad}
                                            className="flex items-center gap-1.5 bg-teal-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-teal-700 disabled:opacity-60">
                                            {facturaLoad ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                            Buscar
                                        </button>
                                    </div>
                                    {facturaData && (
                                        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                                            <div className="font-medium text-green-800">{facturaData.clientes?.nombre || 'Sin cliente'}</div>
                                            <div className="text-green-600 text-xs mt-0.5">
                                                Factura {facturaData.secuencial} · {facturaData.comprobante_detalles?.length} productos · ${Number(facturaData.total).toFixed(2)}
                                            </div>
                                            <div className="text-green-600 text-xs">
                                                Estado SRI: {facturaData.estado_sri} · Auth: {facturaData.autorizacion_numero ? facturaData.autorizacion_numero.substring(0, 15) + '...' : 'Sin autorización'}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── PASO 1: Productos ── */}
                            {paso === 1 && (
                                <div className="space-y-2">
                                    <p className="text-sm text-slate-600">Marque los productos que se van a transportar y ajuste la cantidad si es necesario.</p>
                                    <table className="w-full text-xs border-collapse">
                                        <thead>
                                            <tr className="bg-slate-100">
                                                <th className="p-2 w-8">
                                                    <input type="checkbox"
                                                        checked={lineas.every(l => l._include)}
                                                        onChange={e => setLineas(prev => prev.map(l => ({ ...l, _include: e.target.checked })))} />
                                                </th>
                                                <th className="text-left p-2">Descripción</th>
                                                <th className="text-right p-2 w-24">Cantidad</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {lineas.map((l, i) => (
                                                <tr key={l._key} className={l._include ? '' : 'opacity-40'}>
                                                    <td className="p-2 text-center">
                                                        <input type="checkbox" checked={l._include}
                                                            onChange={e => setLineas(prev => prev.map((x, xi) => xi === i ? { ...x, _include: e.target.checked } : x))} />
                                                    </td>
                                                    <td className="p-2">{l.descripcion}</td>
                                                    <td className="p-2">
                                                        <input type="number" min="0.01" step="0.01" value={l.cantidad}
                                                            onChange={e => setLineas(prev => prev.map((x, xi) => xi === i
                                                                ? { ...x, cantidad: parseFloat(e.target.value) || 0 }
                                                                : x))}
                                                            className="w-full border border-slate-300 rounded px-1 py-0.5 text-right text-xs" />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* ── PASO 2: Transportista ── */}
                            {paso === 2 && (
                                <div className="space-y-3">
                                    {/* Catálogo */}
                                    {!showNuevoTransp && transportistas.length > 0 && (
                                        <div>
                                            <label className="block text-xs font-medium text-slate-600 mb-1">Seleccionar del catálogo</label>
                                            <div className="space-y-1 max-h-36 overflow-y-auto">
                                                {transportistas.map(t => (
                                                    <button key={t.id} onClick={() => seleccionarTransportista(t)}
                                                        className={cn('w-full text-left px-3 py-2 rounded-lg border text-sm',
                                                            transpId === t.id ? 'border-teal-500 bg-teal-50' : 'border-slate-200 hover:border-slate-300'
                                                        )}>
                                                        <span className="font-medium">{t.nombre}</span>
                                                        <span className="text-slate-500 ml-2 text-xs">CI/RUC: {t.identificacion} · Placa: {t.placa}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <button onClick={() => setShowNuevoTransp(!showNuevoTransp)}
                                        className="text-xs text-teal-600 hover:underline">
                                        {showNuevoTransp ? '← Volver al catálogo' : '+ Ingresar nuevo transportista'}
                                    </button>

                                    {/* Formulario nuevo/manual */}
                                    {(showNuevoTransp || transportistas.length === 0) && (
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="col-span-2">
                                                <label className="block text-xs text-slate-500 mb-1">Nombre / Razón Social</label>
                                                <input value={transpNombre} onChange={e => setTranspNombre(e.target.value)}
                                                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-500 mb-1">Tipo ID</label>
                                                <select value={transpTipo} onChange={e => setTranspTipo(e.target.value)}
                                                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm">
                                                    <option value="04">RUC</option>
                                                    <option value="05">Cédula</option>
                                                    <option value="06">Pasaporte</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-500 mb-1">Identificación</label>
                                                <input value={transpId2} onChange={e => setTranspId2(e.target.value)}
                                                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-slate-500 mb-1">Placa</label>
                                                <input value={placa} onChange={e => setPlaca(e.target.value.toUpperCase())}
                                                    placeholder="ABC-1234"
                                                    className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm font-mono" />
                                            </div>
                                            <div className="flex items-end">
                                                <button onClick={guardarNuevoTransportista}
                                                    className="bg-teal-600 text-white text-xs px-3 py-1.5 rounded hover:bg-teal-700">
                                                    Guardar en catálogo
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Datos de transporte */}
                                    <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-100">
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">Fecha inicio transporte</label>
                                            <input type="date" value={fechaIni} onChange={e => setFechaIni(e.target.value)}
                                                className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">Fecha fin transporte</label>
                                            <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)}
                                                className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">Motivo de traslado</label>
                                            <select value={motivo} onChange={e => setMotivo(e.target.value)}
                                                className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm">
                                                {MOTIVOS.map(m => <option key={m}>{m}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">Ruta (opcional)</label>
                                            <input value={ruta} onChange={e => setRuta(e.target.value)}
                                                placeholder="Ej: QUITO - GUAYAQUIL"
                                                className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="block text-xs text-slate-500 mb-1">Dirección de salida</label>
                                            <input value={dirSalida} onChange={e => setDirSalida(e.target.value)}
                                                className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── PASO 3: Destinatario ── */}
                            {paso === 3 && (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-3">
                                        <label className="text-sm font-medium text-slate-700">Destinatario</label>
                                        <button onClick={() => setDestManual(!destManual)}
                                            className="text-xs text-teal-600 hover:underline">
                                            {destManual ? 'Buscar en clientes' : 'Ingresar manualmente'}
                                        </button>
                                    </div>

                                    {!destManual ? (
                                        <div className="space-y-2">
                                            <div className="relative">
                                                <Search className="absolute left-2 top-2 w-4 h-4 text-slate-400" />
                                                <input value={destBusq} onChange={e => setDestBusq(e.target.value)}
                                                    placeholder="Buscar cliente por nombre o CI/RUC..."
                                                    className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm" />
                                            </div>
                                            {clientesFiltrados.length > 0 && (
                                                <div className="border border-slate-200 rounded-lg max-h-40 overflow-y-auto">
                                                    {clientesFiltrados.map(c => (
                                                        <button key={c.id} onClick={() => seleccionarCliente(c)}
                                                            className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-0 text-sm">
                                                            <span className="font-medium">{c.nombre}</span>
                                                            <span className="text-slate-500 ml-2 text-xs">{c.identificacion}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            {destNombre && (
                                                <div className="bg-teal-50 border border-teal-200 rounded-lg p-2 text-sm">
                                                    <span className="font-medium text-teal-800">{destNombre}</span>
                                                    <span className="text-teal-600 ml-2 text-xs">{destId}</span>
                                                </div>
                                            )}
                                        </div>
                                    ) : null}

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="col-span-2">
                                            <label className="block text-xs text-slate-500 mb-1">Nombre / Razón Social</label>
                                            <input value={destNombre} onChange={e => setDestNombre(e.target.value)}
                                                className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">CI / RUC</label>
                                            <input value={destId} onChange={e => setDestId(e.target.value)}
                                                className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-slate-500 mb-1">Dirección de destino</label>
                                            <input value={destDir} onChange={e => setDestDir(e.target.value)}
                                                className="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Error wizard */}
                            {wizardErr && (
                                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                                    <AlertCircle className="w-4 h-4 shrink-0" /> {wizardErr}
                                </div>
                            )}
                        </div>

                        {/* Footer wizard */}
                        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200">
                            <button
                                onClick={() => paso === 0 ? setShowWizard(false) : setPaso(p => p - 1)}
                                className="text-sm text-slate-600 hover:text-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
                            >
                                {paso === 0 ? 'Cancelar' : '← Anterior'}
                            </button>
                            <button
                                onClick={avanzar}
                                disabled={saving}
                                className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-1.5 rounded-lg disabled:opacity-60"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                {paso === 3 ? 'Generar Guía' : 'Siguiente →'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
