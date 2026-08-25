import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { HelpButton } from '../components/help/HelpButton'
import { BuscadorCliente, type ClienteResultado } from '../components/BuscadorCliente'
import {
    facturaEnVivoService,
    type FacturaEnVivoResumen,
    type FacturaEnVivoDetalleInput,
    type FacturaEnVivoPagoInput,
} from '../services/facturaEnVivoService'
import { calcularLinea, calcularTotalesFactura, type DetalleFacturaDirecta, type PagoFactura } from '../services/facturaDirectaService'
import { facturacionService } from '../services/facturacionService'
import { cuentasBancariasService } from '../services/finance/bancosService'
import type { CuentaBancaria } from '../types/finance'
import { lineaService, type Linea } from '../services/lineaService'
import { subcategoriaService, type Subcategoria } from '../services/subcategoriaService'
import { formatCurrency, cn } from '../lib/utils'
import {
    Radio, Plus, Trash2, Loader2, Send, Pencil, X, Package, Search, UserPlus,
} from 'lucide-react'

const NEW_CLIENT_VACIO = { identificacion: '', nombre: '', email: '', telefono: '', direccion: '' }

const DETALLE_VACIO: FacturaEnVivoDetalleInput = {
    producto_id: null,
    nombre_producto: '',
    cantidad: 1,
    precio_unitario: 0,
    descuento: 0,
    iva_porcentaje: 15,
    talla: null,
    color: null,
}

const METODOS_PAGO: { value: PagoFactura['metodo']; label: string }[] = [
    { value: 'efectivo', label: '💵 Efectivo' },
    { value: 'tarjeta', label: '💳 Tarjeta D/C' },
    { value: 'transferencia', label: '🏦 Transferencia' },
    { value: 'credito', label: '📄 Crédito' },
    { value: 'plan_acumulativo', label: '📋 Plan Acumulativo (PA)' },
    { value: 'cheque', label: '✏️ Cheque al día' },
    { value: 'otros', label: '🔄 Otros' },
]

export function FacturaEnVivoPage() {
    const { empresa, profile } = useAuth()
    const navigate = useNavigate()

    const etiquetaLinea = empresa?.etiqueta_campo_linea || 'Talla'
    const etiquetaSubcat = empresa?.etiqueta_campo_subcategoria || 'Color'

    const [vista, setVista] = useState<'lista' | 'form'>('lista')
    const [pendientes, setPendientes] = useState<FacturaEnVivoResumen[]>([])
    const [loadingLista, setLoadingLista] = useState(true)

    const [lineas, setLineas] = useState<Linea[]>([])
    const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([])
    const [cuentasBancarias, setCuentasBancarias] = useState<CuentaBancaria[]>([])

    // ── Formulario ──────────────────────────────────────────────────────
    const [editandoId, setEditandoId] = useState<string | null>(null)
    const [selectedCliente, setSelectedCliente] = useState<ClienteResultado | null>(null)
    const [detalles, setDetalles] = useState<FacturaEnVivoDetalleInput[]>([{ ...DETALLE_VACIO }])
    const [pagos, setPagos] = useState<FacturaEnVivoPagoInput[]>([{ metodo_pago: 'efectivo', valor: 0 }])
    const [observaciones, setObservaciones] = useState('')
    const [guardando, setGuardando] = useState(false)

    // Cliente nuevo (inline, igual que Nueva Factura pero sin la búsqueda SRI)
    const [isClientFormOpen, setIsClientFormOpen] = useState(false)
    const [newClient, setNewClient] = useState(NEW_CLIENT_VACIO)
    const [isSavingClient, setIsSavingClient] = useState(false)

    // Búsqueda de artículos "en vivo" (como en Nueva Factura) — sin botón
    // "Buscar", los resultados aparecen mientras se escribe.
    const [productDropdown, setProductDropdown] = useState<number | null>(null)
    const [searchProducto, setSearchProducto] = useState<Record<number, string>>({})
    const [searchResults, setSearchResults] = useState<any[]>([])
    const [buscandoProducto, setBuscandoProducto] = useState(false)

    const cargarLista = useCallback(async () => {
        if (!empresa?.id) return
        setLoadingLista(true)
        try {
            setPendientes(await facturaEnVivoService.listarPendientes(empresa.id))
        } catch (e: any) {
            alert('Error al cargar pendientes: ' + e.message)
        } finally {
            setLoadingLista(false)
        }
    }, [empresa?.id])

    useEffect(() => { cargarLista() }, [cargarLista])

    useEffect(() => {
        if (!empresa?.id) return
        lineaService.getLineas(empresa.id).catch(() => [] as Linea[]).then(setLineas)
        subcategoriaService.getSubcategorias(empresa.id).catch(() => [] as Subcategoria[]).then(setSubcategorias)
        cuentasBancariasService.listar(empresa.id).catch(() => [] as CuentaBancaria[]).then(setCuentasBancarias)
    }, [empresa?.id])

    // Búsqueda en servidor con debounce — igual que en Nueva Factura, sin
    // botón "Buscar": aparece el desplegable mientras se escribe.
    useEffect(() => {
        if (productDropdown === null || !empresa?.id) { setSearchResults([]); return }
        const texto = (searchProducto[productDropdown] || '').trim()
        if (texto.length < 2) { setSearchResults([]); return }
        const timer = setTimeout(async () => {
            setBuscandoProducto(true)
            try {
                const pattern = '%' + texto.split(/[*]+/).filter(Boolean).join('%') + '%'
                const { data } = await supabase
                    .from('productos')
                    .select('id, codigo, nombre, precio_venta, iva_porcentaje')
                    .eq('empresa_id', empresa!.id)
                    .eq('activo', true)
                    .or(`nombre.ilike.${pattern},codigo.ilike.${pattern}`)
                    .order('nombre')
                    .limit(50)
                setSearchResults(data ?? [])
            } catch { setSearchResults([]) }
            setBuscandoProducto(false)
        }, 300)
        return () => clearTimeout(timer)
    }, [searchProducto, productDropdown, empresa?.id])

    function nuevaFactura() {
        setEditandoId(null)
        setSelectedCliente(null)
        setDetalles([{ ...DETALLE_VACIO }])
        setPagos([{ metodo_pago: 'efectivo', valor: 0 }])
        setObservaciones('')
        setIsClientFormOpen(false)
        setNewClient(NEW_CLIENT_VACIO)
        setSearchProducto({})
        setProductDropdown(null)
        setVista('form')
    }

    async function editar(id: string) {
        try {
            const draft = await facturaEnVivoService.obtener(id)
            setEditandoId(draft.id)
            setSelectedCliente(draft.clientes ?? null)
            const detallesGuardados = (draft.facturas_en_vivo_detalles ?? []).map((d: any) => ({
                producto_id: d.producto_id,
                nombre_producto: d.nombre_producto,
                cantidad: Number(d.cantidad),
                precio_unitario: Number(d.precio_unitario),
                descuento: Number(d.descuento) || 0,
                iva_porcentaje: Number(d.iva_porcentaje) || 0,
                talla: d.talla,
                color: d.color,
            }))
            setDetalles(detallesGuardados.length > 0 ? detallesGuardados : [{ ...DETALLE_VACIO }])
            const pagosGuardados = (draft.facturas_en_vivo_pagos ?? []).map((p: any) => ({
                metodo_pago: p.metodo_pago, valor: Number(p.valor), referencia: p.referencia,
                cuenta_bancaria_id: p.cuenta_bancaria_id, numero_documento: p.numero_documento, observaciones: p.observaciones,
            }))
            setPagos(pagosGuardados.length > 0 ? pagosGuardados : [{ metodo_pago: 'efectivo', valor: 0 }])
            setObservaciones(draft.observaciones ?? '')
            setIsClientFormOpen(false)
            setNewClient(NEW_CLIENT_VACIO)
            setSearchProducto({})
            setProductDropdown(null)
            setVista('form')
        } catch (e: any) {
            alert('Error al cargar el borrador: ' + e.message)
        }
    }

    async function eliminar(id: string, nombreCliente: string) {
        if (!confirm(`¿Eliminar la Factura en Vivo pendiente de ${nombreCliente}? No se puede deshacer.`)) return
        try {
            await facturaEnVivoService.eliminar(id)
            await cargarLista()
        } catch (e: any) {
            alert('Error al eliminar: ' + e.message)
        }
    }

    // ── Líneas de detalle ────────────────────────────────────────────────
    function addLinea() { setDetalles(prev => [...prev, { ...DETALLE_VACIO }]) }
    function removeLinea(idx: number) { setDetalles(prev => prev.filter((_, i) => i !== idx)) }
    function updateLinea(idx: number, campo: keyof FacturaEnVivoDetalleInput, valor: any) {
        setDetalles(prev => prev.map((d, i) => i === idx ? { ...d, [campo]: valor } : d))
    }
    function selectProducto(idx: number, p: any) {
        setDetalles(prev => prev.map((d, i) => i === idx ? {
            ...d,
            producto_id: p.id,
            nombre_producto: p.nombre,
            precio_unitario: p.precio_venta,
            iva_porcentaje: p.iva_porcentaje ?? 15,
        } : d))
        setSearchProducto(prev => ({ ...prev, [idx]: p.nombre }))
        setProductDropdown(null)
    }

    async function handleSaveClient() {
        const id = newClient.identificacion.trim()
        if (!id || !newClient.nombre.trim()) { alert('Identificación y nombre son requeridos'); return }
        setIsSavingClient(true)
        try {
            const created = await facturacionService.createCliente({ ...newClient, empresa_id: empresa!.id })
            setSelectedCliente(created as ClienteResultado)
            setIsClientFormOpen(false)
            setNewClient(NEW_CLIENT_VACIO)
        } catch (e: any) {
            alert('Error al crear cliente: ' + e.message)
        } finally {
            setIsSavingClient(false)
        }
    }

    // ── Pagos ────────────────────────────────────────────────────────────
    function addPago() { setPagos(prev => [...prev, { metodo_pago: 'efectivo', valor: 0 }]) }
    function removePago(idx: number) { setPagos(prev => prev.filter((_, i) => i !== idx)) }
    function updatePago(idx: number, campo: keyof FacturaEnVivoPagoInput, valor: any) {
        setPagos(prev => prev.map((p, i) => i === idx ? { ...p, [campo]: valor } : p))
    }

    const detallesValidos = detalles.filter(d => d.cantidad > 0 && d.precio_unitario > 0)
    const totales = calcularTotalesFactura(detallesValidos as DetalleFacturaDirecta[])
    const totalPagos = pagos.reduce((s, p) => s + (Number(p.valor) || 0), 0)

    async function guardarPendiente() {
        if (detallesValidos.length === 0) { alert('Agrega al menos un artículo con cantidad y precio'); return }
        if (!empresa?.id) return
        setGuardando(true)
        try {
            const input = {
                empresa_id: empresa.id,
                cliente_id: selectedCliente?.id ?? null,
                observaciones: observaciones || null,
                detalles: detallesValidos,
                pagos: pagos.filter(p => p.valor > 0),
                created_by: profile?.id ?? null,
            }
            if (editandoId) {
                await facturaEnVivoService.actualizar(editandoId, input)
            } else {
                await facturaEnVivoService.crear(input)
            }
            setVista('lista')
            await cargarLista()
        } catch (e: any) {
            alert('Error al guardar: ' + e.message)
        } finally {
            setGuardando(false)
        }
    }

    async function guardarYEmitir() {
        if (!selectedCliente) { alert('Selecciona un cliente antes de emitir'); return }
        if (detallesValidos.length === 0) { alert('Agrega al menos un artículo con cantidad y precio'); return }
        if (!empresa?.id) return
        setGuardando(true)
        try {
            const input = {
                empresa_id: empresa.id,
                cliente_id: selectedCliente.id,
                observaciones: observaciones || null,
                detalles: detallesValidos,
                pagos: pagos.filter(p => p.valor > 0),
                created_by: profile?.id ?? null,
            }
            let draftId = editandoId
            if (editandoId) {
                await facturaEnVivoService.actualizar(editandoId, input)
            } else {
                const nuevo = await facturaEnVivoService.crear(input)
                draftId = nuevo.id
            }
            navigate(`/nueva-factura?draft_en_vivo=${draftId}`)
        } catch (e: any) {
            alert('Error al preparar la emisión: ' + e.message)
        } finally {
            setGuardando(false)
        }
    }

    // ── Render: lista ────────────────────────────────────────────────────
    if (vista === 'lista') {
        return (
            <div className="max-w-5xl space-y-6">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-rose-100 flex items-center justify-center">
                        <Radio className="w-6 h-6 text-rose-600" />
                    </div>
                    <div className="flex-1">
                        <h1 className="text-xl font-bold text-slate-900">Facturación en Vivo</h1>
                        <p className="text-sm text-slate-500">Facturas pendientes para venta en vivo (TikTok, redes, etc.)</p>
                    </div>
                    <HelpButton pageKey="facturacion-en-vivo" />
                    <button onClick={nuevaFactura} className="btn btn-primary flex items-center gap-2">
                        <Plus className="w-4 h-4" /> Nueva Factura en Vivo
                    </button>
                </div>

                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    {loadingLista ? (
                        <div className="p-8 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
                        </div>
                    ) : pendientes.length === 0 ? (
                        <div className="p-8 text-center text-slate-400 text-sm">
                            No hay facturas en vivo pendientes. Crea una nueva para empezar a agregar artículos.
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                                <tr>
                                    <th className="text-left py-2 px-3">Cliente</th>
                                    <th className="text-center py-2 px-3">Artículos</th>
                                    <th className="text-right py-2 px-3">Subtotal</th>
                                    <th className="text-left py-2 px-3">Forma de pago</th>
                                    <th className="text-right py-2 px-3">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {pendientes.map(f => (
                                    <tr key={f.id}>
                                        <td className="py-2 px-3">
                                            <p className="font-medium text-slate-800">{f.cliente_nombre}</p>
                                            {f.cliente_identificacion && <p className="text-xs text-slate-400 font-mono">{f.cliente_identificacion}</p>}
                                        </td>
                                        <td className="py-2 px-3 text-center">{f.n_articulos}</td>
                                        <td className="py-2 px-3 text-right font-mono">{formatCurrency(f.subtotal)}</td>
                                        <td className="py-2 px-3 text-slate-500">{f.formas_pago}</td>
                                        <td className="py-2 px-3 text-right whitespace-nowrap">
                                            <button onClick={() => editar(f.id)} title="Editar"
                                                className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-lg">
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => eliminar(f.id, f.cliente_nombre)} title="Eliminar"
                                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => navigate(`/nueva-factura?draft_en_vivo=${f.id}`)} title="Cargar en Nueva Factura para completar el pago y emitir"
                                                className="btn btn-primary btn-sm ml-1.5">
                                                Emitir
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        )
    }

    // ── Render: formulario ───────────────────────────────────────────────
    return (
        <div className="max-w-4xl space-y-6">
            <div className="flex items-center gap-3">
                <button onClick={() => setVista('lista')} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700">
                    <X className="w-5 h-5" />
                </button>
                <div className="flex-1">
                    <h1 className="text-xl font-bold text-slate-900">{editandoId ? 'Editar' : 'Nueva'} Factura en Vivo</h1>
                    <p className="text-sm text-slate-500">Se guarda como pendiente — se emite formalmente desde Nueva Factura.</p>
                </div>
                <HelpButton pageKey="facturacion-en-vivo" />
            </div>

            {/* Cliente */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Cliente</label>
                    {!selectedCliente && (
                        <button onClick={() => setIsClientFormOpen(o => !o)}
                            className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
                            <UserPlus className="w-3.5 h-3.5" /> {isClientFormOpen ? 'Buscar existente' : 'Nuevo cliente'}
                        </button>
                    )}
                </div>
                {selectedCliente ? (
                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div>
                            <p className="font-semibold text-slate-800">{selectedCliente.nombre}</p>
                            <p className="text-xs text-slate-400 font-mono">{selectedCliente.identificacion}</p>
                        </div>
                        <button onClick={() => setSelectedCliente(null)} className="text-slate-400 hover:text-red-500">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                ) : isClientFormOpen ? (
                    <div className="space-y-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="grid grid-cols-2 gap-2">
                            <input type="text" placeholder="Identificación (RUC/cédula)"
                                className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-400"
                                value={newClient.identificacion} onChange={e => setNewClient({ ...newClient, identificacion: e.target.value })} />
                            <input type="text" placeholder="Nombre"
                                className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-400"
                                value={newClient.nombre} onChange={e => setNewClient({ ...newClient, nombre: e.target.value })} />
                            <input type="text" placeholder="Email (opcional)"
                                className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-400"
                                value={newClient.email} onChange={e => setNewClient({ ...newClient, email: e.target.value })} />
                            <input type="text" placeholder="Teléfono (opcional)"
                                className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-400"
                                value={newClient.telefono} onChange={e => setNewClient({ ...newClient, telefono: e.target.value })} />
                        </div>
                        <input type="text" placeholder="Dirección (opcional)"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-400"
                            value={newClient.direccion} onChange={e => setNewClient({ ...newClient, direccion: e.target.value })} />
                        <button onClick={handleSaveClient} disabled={isSavingClient}
                            className="btn btn-primary btn-sm flex items-center gap-2 disabled:opacity-50">
                            {isSavingClient ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Guardar cliente
                        </button>
                    </div>
                ) : (
                    <BuscadorCliente empresaId={empresa?.id ?? ''} onSelect={setSelectedCliente} />
                )}
                <p className="text-xs text-slate-400">Puedes dejarlo sin cliente mientras armas la lista — solo es obligatorio para emitir.</p>
            </div>

            {/* Detalle */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Artículos</label>
                    <button onClick={addLinea} className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
                        <Plus className="w-3.5 h-3.5" /> Agregar línea
                    </button>
                </div>

                <div className="space-y-3">
                    {detalles.map((d, idx) => (
                        <div key={idx} className="border border-slate-100 rounded-xl p-3 bg-slate-50/50 space-y-2">
                            <div className="flex items-start gap-2">
                                <div className="flex-1 relative">
                                    {d.producto_id ? (
                                        <div className="flex items-center justify-between px-3 py-2 bg-white border border-slate-200 rounded-lg">
                                            <span className="text-sm font-medium text-slate-800">{d.nombre_producto}</span>
                                            <button onClick={() => { updateLinea(idx, 'producto_id', null); updateLinea(idx, 'nombre_producto', ''); setSearchProducto(prev => ({ ...prev, [idx]: '' })) }}
                                                className="text-slate-300 hover:text-red-500 text-xs">✕</button>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="relative">
                                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                                                <input type="text"
                                                    placeholder="Escribe código o nombre del artículo…"
                                                    className="w-full pl-8 pr-2 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-primary-400"
                                                    value={searchProducto[idx] ?? ''}
                                                    onChange={e => { setSearchProducto(prev => ({ ...prev, [idx]: e.target.value })); setProductDropdown(idx) }}
                                                    onFocus={() => setProductDropdown(idx)}
                                                    onBlur={() => setTimeout(() => setProductDropdown(null), 200)}
                                                />
                                            </div>
                                            {productDropdown === idx && (searchResults.length > 0 || buscandoProducto) && (
                                                <div className="absolute z-30 left-0 top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-2xl max-h-56 overflow-y-auto">
                                                    {buscandoProducto && (
                                                        <div className="px-4 py-3 text-sm text-slate-400 flex items-center gap-2">
                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando...
                                                        </div>
                                                    )}
                                                    {!buscandoProducto && searchResults.map(p => (
                                                        <button key={p.id} type="button"
                                                            onMouseDown={e => { e.preventDefault(); selectProducto(idx, p) }}
                                                            className="w-full px-4 py-2 text-left hover:bg-primary-50 flex justify-between items-center text-sm border-b border-slate-50 last:border-0">
                                                            <div className="flex-1 min-w-0 mr-2">
                                                                <div className="font-medium text-slate-800 truncate">{p.nombre}</div>
                                                                {p.codigo && <div className="text-[10px] text-slate-400 font-mono">{p.codigo}</div>}
                                                            </div>
                                                            <span className="text-xs font-bold text-primary-700 shrink-0">{formatCurrency(p.precio_venta)}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                                <button onClick={() => removeLinea(idx)} disabled={detalles.length === 1}
                                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-20 shrink-0">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                                <div>
                                    <label className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Cant.</label>
                                    <input type="number" min="0.01" step="0.01"
                                        className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-center outline-none focus:ring-2 focus:ring-primary-400"
                                        value={d.cantidad} onChange={e => updateLinea(idx, 'cantidad', parseFloat(e.target.value) || 0)} />
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Precio</label>
                                    <input type="number" min="0" step="0.01"
                                        className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-right outline-none focus:ring-2 focus:ring-primary-400"
                                        value={d.precio_unitario} onChange={e => updateLinea(idx, 'precio_unitario', parseFloat(e.target.value) || 0)} />
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Dto%</label>
                                    <input type="number" min="0" max="100" step="0.01"
                                        className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-right outline-none focus:ring-2 focus:ring-primary-400"
                                        value={d.descuento} onChange={e => updateLinea(idx, 'descuento', parseFloat(e.target.value) || 0)} />
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">{etiquetaLinea}</label>
                                    <select className="w-full px-1 py-1.5 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-primary-400"
                                        value={d.talla ?? ''} onChange={e => updateLinea(idx, 'talla', e.target.value || null)}>
                                        <option value="">—</option>
                                        {lineas.map(l => <option key={l.id} value={l.nombre}>{l.nombre}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">{etiquetaSubcat}</label>
                                    <select className="w-full px-1 py-1.5 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-primary-400"
                                        value={d.color ?? ''} onChange={e => updateLinea(idx, 'color', e.target.value || null)}>
                                        <option value="">—</option>
                                        {subcategorias.map(s => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5">Subtotal</label>
                                    <div className="px-2 py-1.5 text-sm font-semibold text-slate-700 text-right">
                                        {formatCurrency(calcularLinea(d as DetalleFacturaDirecta).subtotal_neto)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {detallesValidos.length === 0 && (
                    <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <Package className="w-3.5 h-3.5 shrink-0" /> Agrega al menos un artículo con cantidad y precio válidos.
                    </div>
                )}

                <div className="flex justify-end pt-2 border-t border-slate-100">
                    <div className="text-sm space-y-1 text-right">
                        <p className="text-slate-500">Subtotal: <span className="font-semibold text-slate-800">{formatCurrency(totales.subtotal)}</span></p>
                        <p className="text-slate-500">IVA: <span className="font-semibold text-slate-800">{formatCurrency(totales.iva)}</span></p>
                        <p className="text-base font-bold text-slate-900">Total: {formatCurrency(totales.total)}</p>
                    </div>
                </div>
            </div>

            {/* Forma de pago */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
                <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Forma de pago</label>
                    <button onClick={addPago} className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
                        <Plus className="w-3.5 h-3.5" /> Agregar
                    </button>
                </div>
                {pagos.map((p, idx) => (
                    <div key={idx} className="space-y-1.5">
                        <div className="flex items-center gap-2">
                            <select className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white outline-none focus:ring-2 focus:ring-primary-400"
                                value={p.metodo_pago} onChange={e => updatePago(idx, 'metodo_pago', e.target.value)}>
                                {METODOS_PAGO.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                            </select>
                            <input type="number" min="0" step="0.01" placeholder="Valor"
                                className="w-32 px-3 py-2 border border-slate-200 rounded-lg text-sm text-right outline-none focus:ring-2 focus:ring-primary-400"
                                value={p.valor || ''} onChange={e => updatePago(idx, 'valor', parseFloat(e.target.value) || 0)} />
                            <button onClick={() => removePago(idx)} disabled={pagos.length === 1}
                                className="p-2 text-slate-300 hover:text-red-500 disabled:opacity-20">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                        {/* Transferencia: cuenta bancaria destino, N° comprobante y observaciones — igual que en Nueva Factura */}
                        {p.metodo_pago === 'transferencia' && (
                            <div className="pl-1 space-y-1.5">
                                <select
                                    className="w-full px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-xs outline-none focus:ring-2 focus:ring-blue-400 text-blue-900"
                                    value={p.cuenta_bancaria_id ?? ''}
                                    onChange={e => updatePago(idx, 'cuenta_bancaria_id', e.target.value || null)}
                                >
                                    <option value="">🏦 Cuenta bancaria destino…</option>
                                    {cuentasBancarias.map(cb => (
                                        <option key={cb.id} value={cb.id}>{cb.banco?.nombre} — {cb.numero_cuenta}</option>
                                    ))}
                                </select>
                                <div className="grid grid-cols-2 gap-1.5">
                                    <input type="text" placeholder="N° comprobante transferencia"
                                        className="px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-xs outline-none focus:ring-2 focus:ring-blue-400 text-blue-900"
                                        value={p.numero_documento ?? ''} onChange={e => updatePago(idx, 'numero_documento', e.target.value || null)} />
                                    <input type="text" placeholder="Observaciones"
                                        className="px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-xs outline-none focus:ring-2 focus:ring-blue-400 text-blue-900"
                                        value={p.observaciones ?? ''} onChange={e => updatePago(idx, 'observaciones', e.target.value || null)} />
                                </div>
                            </div>
                        )}
                    </div>
                ))}
                {totalPagos > 0 && Math.abs(totalPagos - totales.total) > 0.01 && (
                    <p className={cn('text-xs', totalPagos < totales.total ? 'text-amber-600' : 'text-red-600')}>
                        {totalPagos < totales.total
                            ? `Falta distribuir ${formatCurrency(totales.total - totalPagos)}`
                            : `El pago excede el total por ${formatCurrency(totalPagos - totales.total)}`}
                    </p>
                )}
            </div>

            <div className="space-y-1">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Observaciones (opcional)</label>
                <textarea rows={2} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-primary-400 resize-none"
                    value={observaciones} onChange={e => setObservaciones(e.target.value)} />
            </div>

            <div className="flex items-center justify-end gap-3 pb-6">
                <button onClick={() => setVista('lista')} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">
                    Cancelar
                </button>
                <button onClick={guardarPendiente} disabled={guardando}
                    className="px-4 py-2 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2">
                    {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Guardar como Pendiente
                </button>
                <button onClick={guardarYEmitir} disabled={guardando}
                    className="btn btn-primary flex items-center gap-2 disabled:opacity-50">
                    {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Guardar y Emitir
                </button>
            </div>
        </div>
    )
}
