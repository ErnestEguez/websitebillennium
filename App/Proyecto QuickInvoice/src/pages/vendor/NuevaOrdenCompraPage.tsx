import { useState, useEffect } from 'react'
import { useFormDraft } from '../../hooks/useFormDraft'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { ocService, proveedorService } from '../../services/vendorService'
import { bodegaService } from '../../services/bodegaService'
import { supabase } from '../../lib/supabase'
import type { Proveedor, EstadoOC, Bodega } from '../../types/vendors'
import { ArrowLeft, Plus, Trash2, Save, Send } from 'lucide-react'
import { cn } from '../../lib/utils'

const inp = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white'
const HOY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' })

interface LineaOC {
    producto_id:         string
    descripcion:         string
    cantidad_solicitada: number
    cantidad_recibida:   number
    costo_unitario:      number
    subtotal:            number
}

interface ProductoOpc { id: string; nombre: string; codigo: string | null; costo_promedio: number | null }

export function NuevaOrdenCompraPage() {
    const { empresa, profile } = useAuth()
    const navigate = useNavigate()
    const { id: ocId } = useParams<{ id?: string }>()
    const modoEdicion = !!ocId

    const [proveedores, setProveedores] = useState<Proveedor[]>([])
    const [productos,   setProductos]   = useState<ProductoOpc[]>([])
    const [bodegas,     setBodegas]     = useState<Bodega[]>([])
    const [loading,     setLoading]     = useState(true)
    const [saving,      setSaving]      = useState(false)

    // Campos cabecera
    const [bodegaId,            setBodegaId]            = useState('')
    const [proveedorId,         setProveedorId]         = useState('')
    const [fechaEmision,        setFechaEmision]        = useState(HOY)
    const [fechaEntrega,        setFechaEntrega]        = useState('')
    const [observaciones,       setObservaciones]       = useState('')
    const [estadoActual,        setEstadoActual]        = useState<EstadoOC>('BORRADOR')
    const [numeroOC,            setNumeroOC]            = useState('')

    // Líneas
    const [lineas, setLineas] = useState<LineaOC[]>([])

    const clearDraft = useFormDraft(
        'draft_nueva_oc',
        () => ({ proveedorId, fechaEmision, fechaEntrega, observaciones, lineas }),
        (d) => {
            if (modoEdicion) return
            if (d.proveedorId) setProveedorId(d.proveedorId)
            if (d.fechaEmision) setFechaEmision(d.fechaEmision)
            if (d.fechaEntrega) setFechaEntrega(d.fechaEntrega)
            if (d.observaciones) setObservaciones(d.observaciones)
            if (d.lineas?.length) setLineas(d.lineas)
        },
        [proveedorId, fechaEmision, fechaEntrega, observaciones, lineas],
    )

    useEffect(() => { if (empresa?.id) cargar() }, [empresa?.id])

    async function cargar() {
        try {
            setLoading(true)
            const [provs, { data: prods }, bods] = await Promise.all([
                proveedorService.listar(empresa!.id),
                supabase.from('productos')
                    .select('id, nombre, codigo, costo_promedio')
                    .eq('empresa_id', empresa!.id)
                    .eq('activo', true)
                    .order('nombre'),
                bodegaService.listar(empresa!.id),
            ])
            setProveedores(provs.filter(p => p.estado === 'ACTIVO'))
            setProductos((prods ?? []) as ProductoOpc[])
            setBodegas(bods)
            if (bods.length > 0 && !bodegaId) {
                const principal = bods.find(b => b.es_principal) ?? bods[0]
                setBodegaId(principal.id)
            }

            if (modoEdicion && ocId) {
                const oc = await ocService.obtener(ocId)
                setProveedorId(oc.proveedor_id ?? '')
                if (oc.bodega_id) setBodegaId(oc.bodega_id)
                setFechaEmision(oc.fecha_emision)
                setFechaEntrega(oc.fecha_entrega_esperada ?? '')
                setObservaciones(oc.observaciones ?? '')
                setEstadoActual(oc.estado)
                setNumeroOC(oc.numero_oc)
                setLineas((oc.detalle ?? []).map(d => ({
                    producto_id:         d.producto_id ?? '',
                    descripcion:         d.descripcion ?? d.producto?.nombre ?? '',
                    cantidad_solicitada: d.cantidad_solicitada,
                    cantidad_recibida:   d.cantidad_recibida,
                    costo_unitario:      d.costo_unitario,
                    subtotal:            d.subtotal,
                })))
            }
        } catch (e: any) {
            alert('Error cargando datos: ' + e.message)
        } finally {
            setLoading(false)
        }
    }

    const total = lineas.reduce((s, l) => s + l.subtotal, 0)

    function addLinea() {
        setLineas(prev => [...prev, {
            producto_id: '', descripcion: '', cantidad_solicitada: 1,
            cantidad_recibida: 0, costo_unitario: 0, subtotal: 0,
        }])
    }

    function updLinea(i: number, campo: keyof LineaOC, val: unknown) {
        setLineas(prev => prev.map((l, j) => {
            if (j !== i) return l
            const updated = { ...l, [campo]: val }
            if (campo === 'producto_id') {
                const prod = productos.find(p => p.id === val)
                updated.descripcion    = prod?.nombre ?? ''
                updated.costo_unitario = prod?.costo_promedio ?? 0
            }
            if (campo === 'cantidad_solicitada' || campo === 'costo_unitario') {
                updated.subtotal = Math.round(
                    (campo === 'cantidad_solicitada' ? (val as number) : updated.cantidad_solicitada) *
                    (campo === 'costo_unitario'      ? (val as number) : updated.costo_unitario) * 100
                ) / 100
            }
            return updated
        }))
    }

    function removeLinea(i: number) { setLineas(prev => prev.filter((_, j) => j !== i)) }

    async function guardar(estado: EstadoOC) {
        if (!proveedorId)    { alert('Selecciona un proveedor'); return }
        if (!lineas.length)  { alert('Agrega al menos un ítem'); return }
        if (lineas.some(l => !l.descripcion || l.cantidad_solicitada <= 0)) {
            alert('Completa descripción y cantidad en todos los ítems'); return
        }

        try {
            setSaving(true)
            const detalle = lineas.map(l => ({
                producto_id:         l.producto_id || undefined,
                descripcion:         l.descripcion,
                cantidad_solicitada: l.cantidad_solicitada,
                cantidad_recibida:   0,
                costo_unitario:      l.costo_unitario,
                subtotal:            l.subtotal,
            }))

            await ocService.crear(
                {
                    empresa_id:             empresa!.id,
                    proveedor_id:           proveedorId || undefined,
                    fecha_emision:          fechaEmision,
                    fecha_entrega_esperada: fechaEntrega || undefined,
                    estado,
                    observaciones:          observaciones || undefined,
                    subtotal:               total,
                    total,
                    bodega_id:              bodegaId || undefined,
                    created_by:             profile?.id,
                },
                detalle,
            )
            clearDraft()
            navigate('/compras/ordenes')
        } catch (e: any) {
            alert('Error al guardar: ' + e.message)
        } finally {
            setSaving(false)
        }
    }

    const soloLectura = modoEdicion && (estadoActual === 'RECIBIDA' || estadoActual === 'ANULADA')

    if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Cargando...</div>

    return (
        <div className="space-y-5 max-w-5xl">
            {/* Header */}
            <div className="flex items-center gap-3">
                <button onClick={() => navigate('/compras/ordenes')}
                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">
                        {modoEdicion ? `Orden de Compra ${numeroOC}` : 'Nueva Orden de Compra'}
                    </h1>
                    <p className="text-slate-500 text-sm">
                        {modoEdicion ? `Estado: ${estadoActual}` : 'Solicitud de compra a proveedor'}
                    </p>
                </div>
            </div>

            {/* Cabecera */}
            <div className="card p-5 space-y-4">
                <h2 className="font-bold text-slate-700 text-sm uppercase tracking-wider">Datos generales</h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="label">Proveedor <span className="text-red-500">*</span></label>
                        <select className={inp} value={proveedorId} disabled={soloLectura}
                            onChange={e => setProveedorId(e.target.value)}>
                            <option value="">Seleccionar proveedor...</option>
                            {proveedores.map(p => (
                                <option key={p.id} value={p.id}>{p.nombre_empresa} — {p.ruc}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="label">Bodega destino <span className="text-red-500">*</span></label>
                        <select className={inp} value={bodegaId} disabled={soloLectura}
                            onChange={e => setBodegaId(e.target.value)}>
                            <option value="">Seleccionar bodega...</option>
                            {bodegas.map(b => (
                                <option key={b.id} value={b.id}>
                                    {b.codigo ? `[${b.codigo}] ` : ''}{b.nombre}{b.es_principal ? ' ★' : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="label">Fecha emisión</label>
                            <input type="date" className={inp} value={fechaEmision} disabled={soloLectura}
                                onChange={e => setFechaEmision(e.target.value)} />
                        </div>
                        <div>
                            <label className="label">Fecha entrega esperada</label>
                            <input type="date" className={inp} value={fechaEntrega} disabled={soloLectura}
                                onChange={e => setFechaEntrega(e.target.value)} />
                        </div>
                    </div>
                </div>

                <div>
                    <label className="label">Observaciones</label>
                    <input className={inp} value={observaciones} disabled={soloLectura}
                        onChange={e => setObservaciones(e.target.value)}
                        placeholder="Condiciones, instrucciones de entrega, etc." />
                </div>
            </div>

            {/* Líneas */}
            <div className="card p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="font-bold text-slate-700 text-sm uppercase tracking-wider">Ítems</h2>
                    {!soloLectura && (
                        <button onClick={addLinea} className="btn btn-primary btn-sm flex items-center gap-1.5">
                            <Plus className="w-4 h-4" /> Agregar ítem
                        </button>
                    )}
                </div>

                {lineas.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm">
                        Agrega los productos o servicios a solicitar
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-xs text-slate-500 border-b">
                                        <th className="text-left py-2 pr-2 font-semibold w-48">Producto</th>
                                        <th className="text-left py-2 px-2 font-semibold">Descripción</th>
                                        <th className="text-right py-2 px-2 font-semibold w-20">Cantidad</th>
                                        <th className="text-right py-2 px-2 font-semibold w-28">Costo unit.</th>
                                        {modoEdicion && <th className="text-right py-2 px-2 font-semibold w-20">Recibido</th>}
                                        <th className="text-right py-2 px-2 font-semibold w-24">Subtotal</th>
                                        {!soloLectura && <th className="w-8" />}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {lineas.map((l, i) => (
                                        <tr key={i}>
                                            <td className="py-2 pr-2">
                                                <select className={cn(inp, 'text-xs')} disabled={soloLectura}
                                                    value={l.producto_id}
                                                    onChange={e => updLinea(i, 'producto_id', e.target.value)}>
                                                    <option value="">Libre / manual</option>
                                                    {productos.map(p => (
                                                        <option key={p.id} value={p.id}>
                                                            {p.codigo ? `[${p.codigo}] ` : ''}{p.nombre}
                                                        </option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className="py-2 px-2">
                                                <input className={inp} disabled={soloLectura}
                                                    value={l.descripcion}
                                                    onChange={e => updLinea(i, 'descripcion', e.target.value)}
                                                    placeholder="Descripción del ítem" />
                                            </td>
                                            <td className="py-2 px-2">
                                                <input type="number" min={0} step={0.01}
                                                    className={cn(inp, 'text-right')} disabled={soloLectura}
                                                    value={l.cantidad_solicitada || ''}
                                                    onChange={e => updLinea(i, 'cantidad_solicitada', parseFloat(e.target.value) || 0)} />
                                            </td>
                                            <td className="py-2 px-2">
                                                <input type="number" min={0} step={0.01}
                                                    className={cn(inp, 'text-right')} disabled={soloLectura}
                                                    value={l.costo_unitario || ''}
                                                    onChange={e => updLinea(i, 'costo_unitario', parseFloat(e.target.value) || 0)} />
                                            </td>
                                            {modoEdicion && (
                                                <td className="py-2 px-2 text-right text-slate-500 font-mono text-xs">
                                                    {l.cantidad_recibida}
                                                </td>
                                            )}
                                            <td className="py-2 px-2 text-right font-mono font-semibold text-slate-800">
                                                ${l.subtotal.toFixed(2)}
                                            </td>
                                            {!soloLectura && (
                                                <td className="py-2 pl-2">
                                                    <button onClick={() => removeLinea(i)}
                                                        className="p-1 hover:bg-red-50 rounded text-slate-300 hover:text-red-500">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-end border-t pt-3">
                            <div className="text-right">
                                <p className="text-xs text-slate-400 uppercase">Total OC</p>
                                <p className="text-2xl font-bold text-primary-700">${total.toFixed(2)}</p>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Acciones */}
            {!soloLectura && (
                <div className="flex justify-end gap-3">
                    <button onClick={() => navigate('/compras/ordenes')} className="btn btn-secondary">
                        Cancelar
                    </button>
                    {!modoEdicion && (
                        <button onClick={() => guardar('BORRADOR')} disabled={saving}
                            className="btn btn-secondary flex items-center gap-2">
                            <Save className="w-4 h-4" /> Guardar borrador
                        </button>
                    )}
                    <button onClick={() => guardar('ENVIADA')} disabled={saving}
                        className={cn('btn btn-primary flex items-center gap-2', saving && 'opacity-50 cursor-not-allowed')}>
                        {saving
                            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Guardando...</>
                            : <><Send className="w-4 h-4" /> {modoEdicion ? 'Actualizar' : 'Emitir OC'}</>
                        }
                    </button>
                </div>
            )}
        </div>
    )
}
