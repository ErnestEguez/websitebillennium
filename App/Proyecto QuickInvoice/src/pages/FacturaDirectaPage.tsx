import { useState, useEffect, useRef } from 'react'
import { useReactToPrint } from 'react-to-print'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { facturacionService } from '../services/facturacionService'
import {
    facturaDirectaService,
    calcularLinea,
    calcularTotalesFactura,
    type DetalleFacturaDirecta,
    type PagoFactura
} from '../services/facturaDirectaService'
import { InvoiceTicketPOS } from '../components/InvoiceTicketPOS'
import { formatCurrency, validateIdentificacion } from '../lib/utils'
import {
    Search, UserPlus, Plus, Trash2, X, Save,
    CheckCircle2, Loader2, FilePlus, CreditCard,
    Package, Printer, User, Briefcase, ChevronDown, ChevronUp,
    Layers, RotateCw,
} from 'lucide-react'
import { vendedorService, type Vendedor } from '../services/vendedorService'
import { precioVolumenService } from '../services/precioVolumenService'
import { catalogCacheService } from '../services/catalogCacheService'
import { useNetworkStatus } from '../lib/networkStatus'
import { offlineDb } from '../lib/offlineDb'
import { cn } from '../lib/utils'

// ─────────────────────────────────────────────────────
// TIPOS DE PAGO (incluye Tarjeta D/C)
// ─────────────────────────────────────────────────────
const METODOS_PAGO: { value: PagoFactura['metodo']; label: string }[] = [
    { value: 'efectivo', label: '💵 Efectivo' },
    { value: 'tarjeta', label: '💳 Tarjeta D/C' },
    { value: 'transferencia', label: '🏦 Transferencia' },
    { value: 'credito', label: '📄 Crédito' },
    { value: 'cheque', label: '✏️ Cheque' },
    { value: 'otros', label: '🔄 Otros' },
]

const DETALLE_VACIO: DetalleFacturaDirecta = {
    producto_id: null,
    nombre_producto: '',
    cantidad: 1,
    precio_unitario: 0,
    descuento: 0,
    iva_porcentaje: 15,
    subproducto_id: null,
    factor_conversion: 1,
}

export function FacturaDirectaPage() {
    const { empresa, cajaSesion, profile } = useAuth()
    const { isOnline } = useNetworkStatus()
    const [offlineSaved, setOfflineSaved] = useState(false)

    // Estado: cliente
    const [clientes, setClientes] = useState<any[]>([])
    const [searchCliente, setSearchCliente] = useState('')
    const [selectedCliente, setSelectedCliente] = useState<any>(null)
    const [isClientFormOpen, setIsClientFormOpen] = useState(false)
    const [newClient, setNewClient] = useState({ identificacion: '', nombre: '', email: '', direccion: '', telefono: '' })
    const [isSearchingSRI, setIsSearchingSRI] = useState(false)
    const [isSavingClient, setIsSavingClient] = useState(false)

    // Estado: vendedores
    const [vendedores, setVendedores] = useState<Vendedor[]>([])
    const [selectedVendedorId, setSelectedVendedorId] = useState<string>('')
    const [diasPlazoCredito, setDiasPlazoCredito] = useState<number>(30)

    // Estado: secciones colapsables
    const [clienteCollapsed, setClienteCollapsed] = useState(false)
    const [vendedorCollapsed, setVendedorCollapsed] = useState(false)

    // Estado: productos
    const [productos, setProductos] = useState<any[]>([])
    const [searchProducto, setSearchProducto] = useState<{ [idx: number]: string }>({})
    const [productDropdown, setProductDropdown] = useState<number | null>(null)

    // Estado: detalle
    const [detalles, setDetalles] = useState<DetalleFacturaDirecta[]>([{ ...DETALLE_VACIO }])

    // Estado: pagos + campo "recibido en efectivo"
    const [pagos, setPagos] = useState<PagoFactura[]>([{ metodo: 'efectivo', valor: 0, referencia: '' }])
    const [montoRecibido, setMontoRecibido] = useState<number>(0)

    // Estado: proceso
    const [saving, setSaving] = useState(false)
    const [facturaFinal, setFacturaFinal] = useState<any>(null)
    const printRef = useRef<HTMLDivElement>(null)

    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: `Factura_${facturaFinal?.secuencial || 'QI'}`,
    })

    // ✅ Imprimir automáticamente al tener factura
    useEffect(() => {
        if (facturaFinal) {
            setTimeout(() => handlePrint(), 600)
        }
    }, [facturaFinal])

    useEffect(() => {
        if (empresa?.id) loadData()
    }, [empresa?.id])

    async function loadData() {
        try {
            // Use catalog cache (stale-while-revalidate, works offline)
            const [clientsList, prodList, vendedoresList] = await Promise.all([
                catalogCacheService.getClientes(empresa!.id),
                catalogCacheService.getProductos(empresa!.id),
                isOnline ? vendedorService.getVendedoresActivos(empresa!.id).catch(() => []) : [],
            ])
            setClientes(clientsList)
            setProductos(prodList)
            setVendedores(vendedoresList)

            // Consumidor final: buscar en la lista ya cacheada
            const consumidor = clientsList.find((c: any) => c.identificacion === '9999999999999') ?? null
            if (consumidor) setSelectedCliente(consumidor)
        } catch (e) {
            console.error('Error cargando datos:', e)
        }
    }

    // ─── CLIENTE ──────────────────────────────────────────
    const filteredClientes = clientes.filter(c =>
        c.nombre?.toLowerCase().includes(searchCliente.toLowerCase()) ||
        c.identificacion?.includes(searchCliente)
    )

    const lookupSRI = async () => {
        const id = newClient.identificacion.trim()
        if (!id) return
        const validation = validateIdentificacion(id)
        if (!validation.isValid) {
            const ok = confirm(`La identificación "${id}" no parece válida. ¿Es un Pasaporte?`)
            if (!ok) return
        }
        try {
            setIsSearchingSRI(true)
            const { data, error } = await supabase.functions.invoke('sri-lookup', { body: { identificacion: id } })
            if (error) throw error
            const nombre = data?.nombreCompleto || data?.razonSocial
            if (nombre) setNewClient(prev => ({ ...prev, nombre }))
            else alert('No se encontró datos en el SRI para esta identificación')
        } catch {
            alert('No se pudo consultar el SRI en este momento')
        } finally {
            setIsSearchingSRI(false)
        }
    }

    const handleSaveClient = async () => {
        const id = newClient.identificacion.trim()
        if (!id || !newClient.nombre.trim()) return alert('Identificación y nombre son requeridos')
        try {
            setIsSavingClient(true)
            const created = await facturacionService.createCliente({ ...newClient, empresa_id: empresa!.id })
            // Refresh full catalog cache so the new client is available offline
            const fresh = await catalogCacheService.forceRefreshClientes(empresa!.id).catch(() => null)
            setClientes(fresh ?? (prev => [...prev, created]))
            setSelectedCliente(created)
            setIsClientFormOpen(false)
            setNewClient({ identificacion: '', nombre: '', email: '', direccion: '', telefono: '' })
        } catch {
            alert('Error al guardar cliente')
        } finally {
            setIsSavingClient(false)
        }
    }

    const [refreshingClientes, setRefreshingClientes] = useState(false)
    const handleForceRefreshClientes = async () => {
        if (!empresa?.id || !isOnline) return
        setRefreshingClientes(true)
        try {
            const fresh = await catalogCacheService.forceRefreshClientes(empresa.id)
            setClientes(fresh)
        } catch {
            alert('No se pudo actualizar la lista de clientes')
        } finally {
            setRefreshingClientes(false)
        }
    }

    // ─── DETALLES ─────────────────────────────────────────
    const addLinea = () => setDetalles(prev => [...prev, { ...DETALLE_VACIO }])
    const removeLinea = (idx: number) => setDetalles(prev => prev.filter((_, i) => i !== idx))
    const updateLinea = (idx: number, field: keyof DetalleFacturaDirecta, value: any) => {
        setDetalles(prev => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d))
    }
    const selectProducto = async (idx: number, prod: any) => {
        const subsActivos = (prod.subproductos || []).filter((s: any) => s.estado)
        const tieneSubproductos = subsActivos.length > 0
        const cantidadActual = detalles[idx]?.cantidad || 1

        let precioFinal = prod.precio_venta
        if (!tieneSubproductos && empresa?.id) {
            try {
                const precioVol = await precioVolumenService.resolverPrecio(empresa.id, prod.id, cantidadActual)
                if (precioVol !== null) precioFinal = precioVol
            } catch { /* sin rangos activos, usa precio_venta */ }
        }

        setDetalles(prev => prev.map((d, i) => i === idx ? {
            ...d,
            producto_id: prod.id,
            nombre_producto: tieneSubproductos ? '' : prod.nombre,
            precio_unitario: tieneSubproductos ? 0 : precioFinal,
            iva_porcentaje: prod.iva_porcentaje ?? 15,
            subproducto_id: null,
            factor_conversion: 1,
        } : d))
        setSearchProducto(prev => ({ ...prev, [idx]: prod.nombre }))
        setProductDropdown(null)
    }

    const selectSubproducto = (idx: number, sub: any) => {
        setDetalles(prev => prev.map((d, i) => i === idx ? {
            ...d,
            nombre_producto: sub.nombre,
            precio_unitario: Number(sub.precio_sin_iva),
            subproducto_id: sub.id,
            factor_conversion: Number(sub.factor_conversion),
        } : d))
    }

    // ─── PAGOS ────────────────────────────────────────────
    const addPago = () => setPagos(prev => [...prev, { metodo: 'efectivo', valor: 0, referencia: '' }])
    const removePago = (idx: number) => setPagos(prev => prev.filter((_, i) => i !== idx))
    const updatePago = (idx: number, field: keyof PagoFactura, value: any) =>
        setPagos(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p))

    // ─── TOTALES ──────────────────────────────────────────
    const totales = calcularTotalesFactura(detalles)
    const totalPagado = pagos.reduce((sum, p) => sum + (Number(p.valor) || 0), 0)
    const pendiente = totales.total - totalPagado
    // Vuelto solo aplica si hay pago en efectivo
    const tieneEfectivo = pagos.some(p => p.metodo === 'efectivo')
    const vuelto = tieneEfectivo ? Math.max(0, montoRecibido - totales.total) : 0

    const autoCompletarPago = () => {
        if (pagos.length === 1) {
            setPagos([{ ...pagos[0], valor: totales.total }])
            if (pagos[0].metodo === 'efectivo') setMontoRecibido(totales.total)
        }
    }

    // ─── FACTURAR ─────────────────────────────────────────
    const handleGenerarFactura = async () => {
        if (!selectedCliente) return alert('Seleccione un cliente')
        // Permitir sin caja si está offline (se usará la caja cacheada al sincronizar)
        if (!cajaSesion && isOnline) return alert('No hay una caja abierta. Por favor abra caja primero.')

        const detallesValidos = detalles.filter(d => d.nombre_producto && d.cantidad > 0 && d.precio_unitario > 0)
        if (detallesValidos.length === 0) return alert('Agregue al menos un producto o servicio con cantidad y precio')

        if (totalPagado < totales.total - 0.01) {
            return alert(
                `El monto distribuido en formas de pago (${formatCurrency(totalPagado)}) ` +
                `no cubre el total (${formatCurrency(totales.total)}).\n\n` +
                `Use "Completar pago" o ajuste los valores.`
            )
        }

        // ── Path offline: guardar en cola de sincronización ──────────────────
        if (!isOnline) {
            try {
                setSaving(true)
                await offlineDb.addToQueue({
                    id: crypto.randomUUID(),
                    empresa_id: empresa!.id,
                    tipo: 'FACTURA_DIRECTA',
                    estado: 'pendiente',
                    created_at: new Date().toISOString(),
                    display_cliente: selectedCliente.nombre,
                    display_total: totales.total,
                    payload: {
                        empresa_id: empresa!.id,
                        cliente_id: selectedCliente.id,
                        detalles: detallesValidos,
                        pagos: pagos.filter(p => p.valor > 0),
                        caja_sesion_id: cajaSesion?.id ?? null,
                        vendedor_id: selectedVendedorId || null,
                        dias_plazo_credito: diasPlazoCredito,
                    },
                })
                setOfflineSaved(true)
            } catch (e: any) {
                alert('Error al guardar offline: ' + e.message)
            } finally {
                setSaving(false)
            }
            return
        }

        // ── Path online: flujo normal ─────────────────────────────────────────
        try {
            setSaving(true)
            const factura = await facturaDirectaService.generarFacturaDirecta({
                empresa_id: empresa!.id,
                cliente_id: selectedCliente.id,
                detalles: detallesValidos,
                pagos: pagos.filter(p => p.valor > 0),
                caja_sesion_id: cajaSesion!.id,
                vendedor_id: selectedVendedorId || null,
                dias_plazo_credito: diasPlazoCredito,
            })

            const facturaCompleta = await facturaDirectaService.getComprobanteCompleto(factura.id)
            setFacturaFinal(facturaCompleta)
        } catch (e: any) {
            alert('Error al generar factura: ' + e.message)
        } finally {
            setSaving(false)
        }
    }

    const handleNuevaFactura = () => {
        setFacturaFinal(null)
        setOfflineSaved(false)
        setDetalles([{ ...DETALLE_VACIO }])
        setPagos([{ metodo: 'efectivo', valor: 0, referencia: '' }])
        setMontoRecibido(0)
        setSearchCliente('')
        setSearchProducto({})
        setSelectedVendedorId('')
        setDiasPlazoCredito(30)
        const cf = clientes.find(c => c.identificacion === '9999999999999')
        setSelectedCliente(cf || null)
    }

    // ─── RENDER ───────────────────────────────────────────
    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <FilePlus className="w-7 h-7 text-primary-600" />
                        Nueva Factura
                    </h1>
                    <p className="text-slate-500 text-sm">Facturación electrónica directa de artículos y servicios</p>
                </div>
                {cajaSesion && (
                    <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold border border-emerald-100">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        Caja abierta · {profile?.nombre}
                    </span>
                )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* COLUMNA PRINCIPAL */}
                <div className="xl:col-span-2 space-y-6">

                    {/* ── SECCIÓN CLIENTE ─────────────── */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        {/* Header siempre visible */}
                        <div
                            className="flex items-center justify-between px-5 py-3 cursor-pointer select-none hover:bg-slate-50 transition-colors"
                            onClick={() => !isClientFormOpen && setClienteCollapsed(c => !c)}
                        >
                            <h2 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                                <User className="w-4 h-4 text-primary-500" /> Cliente
                                {clienteCollapsed && selectedCliente && (
                                    <span className="font-semibold text-slate-700 ml-1">
                                        — {selectedCliente.nombre}
                                        <span className="text-slate-400 font-normal ml-1">({selectedCliente.identificacion})</span>
                                    </span>
                                )}
                            </h2>
                            <div className="flex items-center gap-3">
                                {!clienteCollapsed && !isClientFormOpen && isOnline && (
                                    <button
                                        onClick={e => { e.stopPropagation(); handleForceRefreshClientes() }}
                                        disabled={refreshingClientes}
                                        className="text-slate-400 hover:text-primary-600 flex items-center gap-1 text-xs font-bold disabled:opacity-40"
                                        title="Actualizar lista desde servidor"
                                    >
                                        <RotateCw className={cn('w-3.5 h-3.5', refreshingClientes && 'animate-spin')} />
                                    </button>
                                )}
                                {!clienteCollapsed && !isClientFormOpen && (
                                    <button onClick={e => { e.stopPropagation(); setIsClientFormOpen(true) }}
                                        className="text-primary-600 hover:text-primary-700 flex items-center gap-1 text-xs font-bold">
                                        <UserPlus className="w-3.5 h-3.5" /> Nuevo
                                    </button>
                                )}
                                {clienteCollapsed
                                    ? <ChevronDown className="w-4 h-4 text-slate-400" />
                                    : <ChevronUp className="w-4 h-4 text-slate-400" />}
                            </div>
                        </div>

                        {/* Detalles cliente colapsado */}
                        {clienteCollapsed && selectedCliente && (selectedCliente.direccion || selectedCliente.telefono || selectedCliente.email) && (
                            <div className="px-5 pb-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500 border-t border-slate-50">
                                {selectedCliente.direccion && <span>📍 {selectedCliente.direccion}</span>}
                                {selectedCliente.telefono && <span>📞 {selectedCliente.telefono}</span>}
                                {selectedCliente.email && <span>✉️ {selectedCliente.email}</span>}
                            </div>
                        )}

                        {/* Contenido expandido */}
                        {!clienteCollapsed && (
                            <div className="px-5 pb-5 space-y-3 border-t border-slate-50">
                                {isClientFormOpen ? (
                                    <div className="bg-slate-50 rounded-xl border border-primary-100 p-4 space-y-3 mt-3">
                                        <div className="relative">
                                            <input
                                                placeholder="Identificación / RUC / Cédula"
                                                className="w-full px-4 py-2 rounded-lg border border-slate-200 pr-10 text-sm"
                                                value={newClient.identificacion}
                                                onChange={e => setNewClient({ ...newClient, identificacion: e.target.value })}
                                                onBlur={() => { if (newClient.identificacion.length >= 10 && !newClient.nombre) lookupSRI() }}
                                            />
                                            <button type="button" onClick={lookupSRI} disabled={isSearchingSRI}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-primary-600 hover:bg-slate-100"
                                                title="Consultar SRI">
                                                {isSearchingSRI ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                            </button>
                                        </div>
                                        <input placeholder="Nombre / Razón Social *" className="w-full px-4 py-2 rounded-lg border border-slate-200 text-sm"
                                            value={newClient.nombre} onChange={e => setNewClient({ ...newClient, nombre: e.target.value })} />
                                        <div className="grid grid-cols-2 gap-3">
                                            <input placeholder="Email" className="px-4 py-2 rounded-lg border border-slate-200 text-sm"
                                                value={newClient.email} onChange={e => setNewClient({ ...newClient, email: e.target.value })} />
                                            <input placeholder="Teléfono" className="px-4 py-2 rounded-lg border border-slate-200 text-sm"
                                                value={newClient.telefono} onChange={e => setNewClient({ ...newClient, telefono: e.target.value })} />
                                        </div>
                                        <input placeholder="Dirección" className="w-full px-4 py-2 rounded-lg border border-slate-200 text-sm"
                                            value={newClient.direccion} onChange={e => setNewClient({ ...newClient, direccion: e.target.value })} />
                                        <div className="flex gap-2 pt-1">
                                            <button onClick={() => setIsClientFormOpen(false)}
                                                className="flex-1 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold hover:bg-slate-50">Cancelar</button>
                                            <button onClick={handleSaveClient} disabled={isSavingClient}
                                                className="flex-1 py-2 bg-primary-600 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60">
                                                {isSavingClient ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-2 mt-3">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                            <input type="text" placeholder="Buscar por identificación o nombre..."
                                                className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                                                value={searchCliente}
                                                onChange={e => setSearchCliente(e.target.value)} />
                                        </div>
                                        {searchCliente && (
                                            <div className="absolute z-20 w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-2xl max-h-56 overflow-y-auto">
                                                {filteredClientes.map(c => (
                                                    <button key={c.id}
                                                        className="w-full px-4 py-3 text-left hover:bg-slate-50 flex justify-between items-center border-b border-slate-50 last:border-0 text-sm"
                                                        onClick={() => { setSelectedCliente(c); setSearchCliente(''); setClienteCollapsed(true) }}>
                                                        <div>
                                                            <p className="font-bold text-slate-900">{c.nombre}</p>
                                                            <p className="text-xs text-slate-500">{c.identificacion}</p>
                                                        </div>
                                                        <User className="w-4 h-4 text-slate-300" />
                                                    </button>
                                                ))}
                                                {filteredClientes.length === 0 && (
                                                    <div className="px-4 py-3 text-sm text-slate-400">No se encontraron clientes</div>
                                                )}
                                            </div>
                                        )}
                                        {selectedCliente && (
                                            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Seleccionado</p>
                                                        <p className="font-black text-emerald-900 text-sm">{selectedCliente.nombre}</p>
                                                        <p className="text-xs text-emerald-600">{selectedCliente.identificacion}</p>
                                                    </div>
                                                    <button onClick={() => setSelectedCliente(null)} className="text-emerald-400 hover:text-emerald-700 mt-0.5">
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                {(selectedCliente.direccion || selectedCliente.telefono || selectedCliente.email) && (
                                                    <div className="mt-2 pt-2 border-t border-emerald-100 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-emerald-700">
                                                        {selectedCliente.direccion && <span>📍 {selectedCliente.direccion}</span>}
                                                        {selectedCliente.telefono && <span>📞 {selectedCliente.telefono}</span>}
                                                        {selectedCliente.email && <span>✉️ {selectedCliente.email}</span>}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── SECCIÓN VENDEDOR ────────────── */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        <div
                            className="flex items-center justify-between px-5 py-3 cursor-pointer select-none hover:bg-slate-50 transition-colors"
                            onClick={() => setVendedorCollapsed(c => !c)}
                        >
                            <h2 className="font-bold text-slate-900 flex items-center gap-2 text-sm">
                                <Briefcase className="w-4 h-4 text-primary-500" /> Vendedor
                                {vendedorCollapsed && selectedVendedorId && (
                                    <span className="font-semibold text-slate-700 ml-1">
                                        — {vendedores.find(v => v.id === selectedVendedorId)?.nombre || ''}
                                    </span>
                                )}
                            </h2>
                            {vendedorCollapsed ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
                        </div>

                        {!vendedorCollapsed && (
                            <div className="px-5 pb-4 space-y-3 border-t border-slate-50">
                                <div className="pt-3">
                                    <select
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                                        value={selectedVendedorId}
                                        onChange={e => { setSelectedVendedorId(e.target.value); if (e.target.value) setVendedorCollapsed(true) }}
                                    >
                                        <option value="">— Sin vendedor asignado —</option>
                                        {vendedores.map(v => (
                                            <option key={v.id} value={v.id}>
                                                {v.nombre}{v.iniciales ? ` (${v.iniciales})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    {vendedores.length === 0 && (
                                        <p className="text-xs text-slate-400 mt-1">No hay vendedores activos.</p>
                                    )}
                                </div>

                                {/* Plazo de crédito — solo visible cuando hay pago a crédito */}
                                {pagos.some(p => p.metodo === 'credito') && (
                                    <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-xl p-3">
                                        <CreditCard className="w-5 h-5 text-amber-600 shrink-0" />
                                        <label className="text-sm font-bold text-amber-800 whitespace-nowrap">
                                            Plazo crédito
                                        </label>
                                        <select
                                            className="flex-1 px-3 py-2 rounded-lg border border-amber-200 text-sm bg-white outline-none focus:ring-2 focus:ring-amber-400"
                                            value={diasPlazoCredito}
                                            onChange={e => setDiasPlazoCredito(Number(e.target.value))}
                                >
                                            <option value={15}>15 días</option>
                                            <option value={30}>30 días</option>
                                            <option value={45}>45 días</option>
                                            <option value={60}>60 días</option>
                                            <option value={90}>90 días</option>
                                            <option value={120}>120 días</option>
                                        </select>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── SECCIÓN DETALLE ─────────────── */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="font-bold text-slate-900 flex items-center gap-2">
                                <Package className="w-5 h-5 text-primary-500" /> Detalle de Artículos / Servicios
                            </h2>
                            <button onClick={addLinea}
                                className="text-primary-600 hover:text-primary-700 flex items-center gap-1 text-sm font-bold">
                                <Plus className="w-4 h-4" /> Agregar línea
                            </button>
                        </div>

                        {/* Encabezados tabla */}
                        <div className="hidden md:grid grid-cols-12 gap-2 px-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            <div className="col-span-3">Descripción</div>
                            <div className="col-span-2 text-center">Cantidad</div>
                            <div className="col-span-2 text-right">P. Unitario</div>
                            <div className="col-span-1 text-center">Desc%</div>
                            <div className="col-span-2 text-center">IVA%</div>
                            <div className="col-span-1 text-right">Total</div>
                            <div className="col-span-1" />
                        </div>

                        <div className="space-y-3">
                            {detalles.map((det, idx) => {
                                const linea = det.cantidad > 0 && det.precio_unitario > 0 ? calcularLinea(det) : null
                                const filtProd = productos.filter(p =>
                                    p.nombre.toLowerCase().includes((searchProducto[idx] || '').toLowerCase())
                                ).slice(0, 8)

                                return (
                                    <div key={idx} className="relative grid grid-cols-12 gap-2 items-start bg-slate-50 rounded-xl p-3 border border-slate-100 animate-in fade-in">
                                        {/* Descripción */}
                                        <div className="col-span-12 md:col-span-3 relative">
                                            <input
                                                placeholder="Buscar producto o escribir descripción..."
                                                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm bg-white outline-none focus:ring-2 focus:ring-primary-400"
                                                value={searchProducto[idx] !== undefined ? searchProducto[idx] : det.nombre_producto}
                                                onChange={e => {
                                                    setSearchProducto(prev => ({ ...prev, [idx]: e.target.value }))
                                                    updateLinea(idx, 'nombre_producto', e.target.value)
                                                    setProductDropdown(idx)
                                                }}
                                                onFocus={() => {
                                                    // Al enfocar, limpiar búsqueda para mostrar todos los productos
                                                    setSearchProducto(prev => ({ ...prev, [idx]: '' }))
                                                    setProductDropdown(idx)
                                                }}
                                                onBlur={() => setTimeout(() => {
                                                    setProductDropdown(null)
                                                    // Si no se escribió nada, restaurar el nombre del producto seleccionado
                                                    setSearchProducto(prev => {
                                                        const updated = { ...prev }
                                                        delete updated[idx]
                                                        return updated
                                                    })
                                                }, 200)}
                                            />
                                            {productDropdown === idx && filtProd.length > 0 && (
                                                <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                                                    {filtProd.map(p => (
                                                        <button key={p.id} type="button"
                                                            className="w-full px-4 py-2.5 text-left hover:bg-primary-50 flex justify-between items-center text-sm border-b border-slate-50 last:border-0"
                                                            onMouseDown={() => selectProducto(idx, p)}>
                                                            <span className="font-medium text-slate-800">{p.nombre}</span>
                                                            <span className="text-primary-600 font-bold text-xs">{formatCurrency(p.precio_venta)}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {/* Selector de presentación (subproducto) */}
                                        {(() => {
                                            const prod = productos.find(p => p.id === det.producto_id)
                                            const subsActivos = (prod?.subproductos || []).filter((s: any) => s.estado)
                                            if (subsActivos.length === 0) return null
                                            return (
                                                <div className="col-span-12">
                                                    <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                                                        <Layers className="w-4 h-4 text-orange-400 shrink-0" />
                                                        <select
                                                            value={det.subproducto_id || ''}
                                                            onChange={e => {
                                                                const sub = subsActivos.find((s: any) => s.id === e.target.value)
                                                                if (sub) selectSubproducto(idx, sub)
                                                            }}
                                                            className="flex-1 bg-transparent text-sm text-orange-800 font-medium outline-none"
                                                        >
                                                            <option value="">— Seleccione presentación —</option>
                                                            {subsActivos.map((s: any) => (
                                                                <option key={s.id} value={s.id}>
                                                                    {s.nombre} · ${Number(s.precio_sin_iva).toFixed(4)} · factor {Number(s.factor_conversion)}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>
                                            )
                                        })()}

                                        {/* ✅ Cantidad - más grande (col-span-2) */}
                                        <div className="col-span-4 md:col-span-2">
                                            <input type="number" min="0.01" step="0.01"
                                                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-base font-bold text-center bg-white outline-none focus:ring-2 focus:ring-primary-400"
                                                value={det.cantidad}
                                                onChange={async e => {
                                                    const nuevaCantidad = parseFloat(e.target.value) || 0
                                                    updateLinea(idx, 'cantidad', nuevaCantidad)
                                                    if (det.producto_id && !det.subproducto_id && empresa?.id && nuevaCantidad > 0) {
                                                        try {
                                                            const prod = productos.find(p => p.id === det.producto_id)
                                                            const precioVol = await precioVolumenService.resolverPrecio(empresa.id, det.producto_id, nuevaCantidad)
                                                            updateLinea(idx, 'precio_unitario', precioVol !== null ? precioVol : (prod?.precio_venta ?? det.precio_unitario))
                                                        } catch { /* mantener precio actual */ }
                                                    }
                                                }} />
                                        </div>

                                        {/* Precio Unitario */}
                                        <div className="col-span-4 md:col-span-2">
                                            <div className="relative">
                                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                                                <input type="number" min="0" step="0.01"
                                                    className="w-full pl-5 pr-2 py-2.5 rounded-lg border border-slate-200 text-sm text-right bg-white outline-none focus:ring-2 focus:ring-primary-400"
                                                    value={det.precio_unitario}
                                                    onChange={e => updateLinea(idx, 'precio_unitario', parseFloat(e.target.value) || 0)} />
                                            </div>
                                        </div>

                                        {/* Descuento % */}
                                        <div className="col-span-4 md:col-span-1">
                                            <div className="relative">
                                                <input type="number" min="0" max="100" step="0.1"
                                                    className="w-full px-2 py-2.5 rounded-lg border border-slate-200 text-sm text-center bg-white outline-none focus:ring-2 focus:ring-primary-400"
                                                    value={det.descuento}
                                                    onChange={e => updateLinea(idx, 'descuento', parseFloat(e.target.value) || 0)} />
                                                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">%</span>
                                            </div>
                                        </div>

                                        {/* IVA % */}
                                        <div className="col-span-6 md:col-span-2">
                                            <select
                                                className="w-full px-2 py-2.5 rounded-lg border border-slate-200 text-sm text-center bg-white outline-none focus:ring-2 focus:ring-primary-400"
                                                value={det.iva_porcentaje}
                                                onChange={e => updateLinea(idx, 'iva_porcentaje', parseFloat(e.target.value))}>
                                                <option value={0}>0%</option>
                                                <option value={5}>5%</option>
                                                <option value={15}>15%</option>
                                            </select>
                                        </div>

                                        {/* Total Línea */}
                                        <div className="col-span-5 md:col-span-1 flex items-center justify-end">
                                            <span className="font-bold text-slate-900 text-sm">
                                                {linea ? formatCurrency(linea.total) : '$0.00'}
                                            </span>
                                        </div>

                                        {/* Eliminar */}
                                        <div className="col-span-1 flex items-center justify-center">
                                            <button onClick={() => removeLinea(idx)} disabled={detalles.length === 1}
                                                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-20">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        <button onClick={addLinea}
                            className="w-full py-2.5 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 hover:border-primary-300 hover:text-primary-500 text-sm font-bold flex items-center justify-center gap-2 transition-colors">
                            <Plus className="w-4 h-4" />
                            Agregar línea
                        </button>
                    </div>
                </div>

                {/* COLUMNA LATERAL */}
                <div className="space-y-6">
                    {/* ── FORMAS DE PAGO ───────────────── */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="font-bold text-slate-900 flex items-center gap-2">
                                <CreditCard className="w-5 h-5 text-primary-500" /> Formas de Pago
                            </h2>
                            <button onClick={addPago}
                                className="text-primary-600 hover:text-primary-700 flex items-center gap-1 text-sm font-bold">
                                <Plus className="w-4 h-4" /> Agregar
                            </button>
                        </div>

                        <div className="space-y-3">
                            {pagos.map((p, i) => (
                                <div key={i} className="flex gap-2 items-start animate-in fade-in">
                                    <select
                                        className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-primary-400 bg-white"
                                        value={p.metodo}
                                        onChange={e => updatePago(i, 'metodo', e.target.value as PagoFactura['metodo'])}>
                                        {METODOS_PAGO.map(m => (
                                            <option key={m.value} value={m.value}>{m.label}</option>
                                        ))}
                                    </select>
                                    <div className="flex-1 relative">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                                        <input type="number" min="0" step="0.01"
                                            className="w-full pl-6 pr-2 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-primary-400"
                                            value={p.valor}
                                            onChange={e => updatePago(i, 'valor', parseFloat(e.target.value) || 0)} />
                                    </div>
                                    <button onClick={() => removePago(i)} disabled={pagos.length === 1}
                                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-20">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        {/* ✅ Campo Monto Recibido (para calcular vuelto en efectivo) */}
                        {tieneEfectivo && (
                            <div className="border-t border-slate-100 pt-3 space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    Efectivo Recibido del Cliente
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">$</span>
                                    <input
                                        type="number" min="0" step="0.01"
                                        className="w-full pl-7 pr-3 py-2.5 rounded-xl border-2 border-emerald-200 bg-emerald-50 text-emerald-900 font-bold text-lg outline-none focus:border-emerald-400"
                                        placeholder="0.00"
                                        value={montoRecibido || ''}
                                        onChange={e => setMontoRecibido(parseFloat(e.target.value) || 0)}
                                    />
                                </div>
                                {montoRecibido > 0 && (
                                    <div className="flex justify-between text-sm pt-1">
                                        <span className="text-slate-500">Vuelto a entregar:</span>
                                        <span className={cn('font-black text-lg', vuelto >= 0 ? 'text-emerald-600' : 'text-red-500')}>
                                            {formatCurrency(vuelto)}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── TOTALES ───────────────────────── */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
                        <h2 className="font-bold text-slate-900">Resumen</h2>
                        <div className="space-y-2.5 text-sm">
                            <div className="flex justify-between text-slate-600">
                                <span>Subtotal (sin IVA)</span>
                                <span className="font-medium">{formatCurrency(totales.subtotal)}</span>
                            </div>
                            {totales.descuentos > 0 && (
                                <div className="flex justify-between text-red-500">
                                    <span>Descuentos</span>
                                    <span className="font-medium">-{formatCurrency(totales.descuentos)}</span>
                                </div>
                            )}
                            <div className="flex justify-between text-slate-600">
                                <span>IVA</span>
                                <span className="font-medium">{formatCurrency(totales.iva)}</span>
                            </div>
                            <div className="border-t-2 border-slate-100 pt-2.5 flex justify-between items-center">
                                <span className="font-black text-slate-900 text-base">TOTAL</span>
                                <span className="font-black text-primary-600 text-2xl">{formatCurrency(totales.total)}</span>
                            </div>
                        </div>

                        <div className="border-t border-slate-100 pt-3 space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-slate-500">Distribuido</span>
                                <span className={cn('font-bold', totalPagado >= totales.total - 0.01 ? 'text-emerald-600' : 'text-amber-500')}>
                                    {formatCurrency(totalPagado)}
                                </span>
                            </div>
                            {/* ✅ Badge de pendiente/cubierto */}
                            {totales.total > 0 && (
                                <div className={cn(
                                    'flex justify-between rounded-lg px-3 py-2',
                                    Math.abs(pendiente) < 0.01 ? 'bg-emerald-50' : 'bg-amber-50'
                                )}>
                                    <span className={Math.abs(pendiente) < 0.01 ? 'text-emerald-700' : 'text-amber-700'}>
                                        {Math.abs(pendiente) < 0.01 ? '✅ Cubierto' : '⚠ Pendiente'}
                                    </span>
                                    <span className={cn('font-black', Math.abs(pendiente) < 0.01 ? 'text-emerald-700' : 'text-amber-700')}>
                                        {formatCurrency(Math.abs(pendiente))}
                                    </span>
                                </div>
                            )}
                        </div>

                        {totales.total > 0 && Math.abs(pendiente) > 0.01 && (
                            <button onClick={autoCompletarPago}
                                className="w-full text-xs text-primary-600 hover:text-primary-800 font-bold py-1.5 px-3 rounded-lg hover:bg-primary-50 transition-colors border border-primary-100">
                                Completar pago automáticamente
                            </button>
                        )}

                        {/* Botón Facturar */}
                        <button
                            onClick={handleGenerarFactura}
                            disabled={saving || !selectedCliente || totales.total <= 0}
                            className="w-full bg-primary-600 text-white rounded-xl py-4 font-black text-sm hover:bg-primary-700 shadow-xl shadow-primary-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale transition-all active:scale-95 mt-2">
                            {saving ? (
                                <><Loader2 className="w-5 h-5 animate-spin" /> Procesando...</>
                            ) : (
                                <><Save className="w-5 h-5" /> Generar Factura</>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* ── TICKET POS OCULTO PARA IMPRESIÓN ─── */}
            <div className="hidden">
                {facturaFinal && (
                    <div ref={printRef}>
                        <InvoiceTicketPOS factura={facturaFinal} />
                    </div>
                )}
            </div>

            {/* ── MODAL ÉXITO OFFLINE ────────────────────── */}
            {offlineSaved && (
                <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4 z-[60]">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8 space-y-6 animate-in zoom-in-95 duration-300">
                        <div className="text-center space-y-3">
                            <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto">
                                <svg className="w-9 h-9" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                                </svg>
                            </div>
                            <h2 className="text-2xl font-black text-slate-900">Factura guardada offline</h2>
                            <p className="text-slate-500 text-sm">
                                La factura de <strong>{selectedCliente?.nombre}</strong> por <strong>{formatCurrency(totales.total)}</strong> está en cola.<br />
                                Se enviará al SRI automáticamente cuando se restablezca la conexión.
                            </p>
                            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-700 text-xs font-medium">
                                Verás la factura en estado <strong>PENDIENTE</strong> en la sección de Facturación una vez sincronizada.
                            </div>
                        </div>
                        <button
                            onClick={handleNuevaFactura}
                            className="w-full bg-primary-600 text-white py-4 rounded-2xl font-bold hover:bg-primary-700 shadow-xl shadow-primary-200 transition-all"
                        >
                            Nueva Factura
                        </button>
                    </div>
                </div>
            )}

            {/* ── MODAL DE ÉXITO ─────────────────────────── */}
            {facturaFinal && (
                <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4 z-[60] overflow-y-auto">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8 space-y-6 animate-in zoom-in-95 duration-300">
                        <div className="text-center space-y-3">
                            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                                <CheckCircle2 className="w-10 h-10" />
                            </div>
                            <h2 className="text-2xl font-black text-slate-900">¡Factura Generada!</h2>
                            <p className="text-slate-500">
                                Comprobante <strong>{facturaFinal.secuencial}</strong> procesado con éxito.
                            </p>
                            {tieneEfectivo && vuelto > 0 && (
                                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-emerald-800">
                                    <p className="text-sm font-medium">Vuelto a entregar</p>
                                    <p className="text-3xl font-black">{formatCurrency(vuelto)}</p>
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <button onClick={handlePrint}
                                className="flex items-center justify-center gap-2 bg-slate-800 text-white py-4 rounded-2xl font-bold hover:bg-slate-700 transition-all">
                                <Printer className="w-5 h-5" /> Re-imprimir
                            </button>
                            <button onClick={handleNuevaFactura}
                                className="bg-primary-600 text-white py-4 rounded-2xl font-bold hover:bg-primary-700 shadow-xl shadow-primary-200 transition-all">
                                Nueva Factura
                            </button>
                        </div>
                        <p className="text-[10px] text-slate-400 text-center italic">
                            El comprobante POS se imprimió automáticamente. Use "Re-imprimir" si necesita otra copia.
                        </p>
                    </div>
                </div>
            )}
        </div>
    )
}
