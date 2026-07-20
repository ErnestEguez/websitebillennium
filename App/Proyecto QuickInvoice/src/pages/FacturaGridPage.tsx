import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useFormDraft } from '../hooks/useFormDraft'
import { useReactToPrint } from 'react-to-print'
import { HelpButton } from '../components/help/HelpButton'
import {
    facturaDirectaService,
    calcularLinea,
    calcularTotalesFactura,
    type DetalleFacturaDirecta,
    type PagoFactura,
} from '../services/facturaDirectaService'
import { facturacionService } from '../services/facturacionService'
import { catalogCacheService } from '../services/catalogCacheService'
import { vendedorService, type Vendedor } from '../services/vendedorService'
import { bodegaService } from '../services/bodegaService'
import type { Bodega } from '../types/vendors'
import { precioVolumenService } from '../services/precioVolumenService'
import { BuscadorProducto, type ProductoResultado } from '../components/BuscadorProducto'
import { InvoiceTicketPOS } from '../components/InvoiceTicketPOS'
import { formatCurrency } from '../lib/utils'
import { cn } from '../lib/utils'
import {
    LayoutGrid, Trash2, Save, Loader2, Plus, CreditCard, CheckCircle2,
    Search, User, Printer,
} from 'lucide-react'

/* ─────────────────────────────────────────────────────────────────────────
 * Vista alternativa de Nueva Factura, estilo grid/POS.
 * Reutiliza tal cual (no se tocan sus archivos):
 *   - DetalleFacturaDirecta, calcularLinea, calcularTotalesFactura, PagoFactura
 *     y facturaDirectaService.generarFacturaDirecta/getComprobanteCompleto
 *     (src/services/facturaDirectaService.ts)
 *   - BuscadorProducto (src/components/BuscadorProducto.tsx) — mismo
 *     mecanismo de búsqueda seguro (límite explícito de 50, filtro por
 *     empresa_id) que ya usan Compras de Inventario y Ajuste de Inventario.
 *   - InvoiceTicketPOS para el ticket de impresión.
 * ────────────────────────────────────────────────────────────────────── */

const METODOS_PAGO: { value: PagoFactura['metodo']; label: string; cfBlocked?: boolean }[] = [
    { value: 'efectivo',      label: '💵 Efectivo' },
    { value: 'tarjeta',       label: '💳 Tarjeta D/C' },
    { value: 'transferencia', label: '🏦 Transferencia' },
    { value: 'credito',       label: '📄 Crédito', cfBlocked: true },
    { value: 'nota_credito',  label: '🔖 Nota de Crédito' },
    { value: 'cheque',        label: '✏️ Cheque al día' },
    { value: 'cheque_fecha',  label: '📅 Cheque a fecha' },
    { value: 'otros',         label: '🔄 Otros' },
]

// Orden de columnas editables por fila para la navegación con Enter.
// 'presentacion' solo aplica si el producto tiene subproductos activos.
type ColKey = 'presentacion' | 'pvp' | 'desc' | 'cantidad'

export function FacturaGridPage() {
    const { empresa, cajaSesion } = useAuth()

    // ── Cliente ────────────────────────────────────────────────────────────
    const [clientes, setClientes] = useState<any[]>([])
    const [searchCliente, setSearchCliente] = useState('')
    const [selectedCliente, setSelectedCliente] = useState<any>(null)

    // ── Vendedor / Bodega ─────────────────────────────────────────────────
    const [vendedores, setVendedores] = useState<Vendedor[]>([])
    const [selectedVendedorId, setSelectedVendedorId] = useState('')
    const [bodegas, setBodegas] = useState<Bodega[]>([])
    const [selectedBodegaId, setSelectedBodegaId] = useState('')

    // ── Detalle (grid) ─────────────────────────────────────────────────────
    const [detalle, setDetalle] = useState<DetalleFacturaDirecta[]>([])
    // Subproductos activos por producto_id — no viaja en DetalleFacturaDirecta,
    // se guarda aparte porque BuscadorProducto los trae junto al producto.
    const [subsPorProducto, setSubsPorProducto] = useState<Record<string, any[]>>({})

    // ── Pagos ──────────────────────────────────────────────────────────────
    const [pagos, setPagos] = useState<PagoFactura[]>([{ metodo: 'efectivo', valor: 0, referencia: '' }])
    const [montoRecibido, setMontoRecibido] = useState(0)

    // ── Proceso ────────────────────────────────────────────────────────────
    const [saving, setSaving] = useState(false)
    const [facturaFinal, setFacturaFinal] = useState<any>(null)
    const [ticketMontoRecibido, setTicketMontoRecibido] = useState<number | undefined>()
    const [ticketVuelto, setTicketVuelto] = useState<number | undefined>()

    const printRef = useRef<HTMLDivElement>(null)
    const handlePrint = useReactToPrint({
        contentRef: printRef,
        documentTitle: `Factura_${facturaFinal?.secuencial || 'QI'}`,
    })
    useEffect(() => { if (facturaFinal) setTimeout(() => handlePrint(), 600) }, [facturaFinal])

    // ── Draft ──────────────────────────────────────────────────────────────
    const clearDraft = useFormDraft(
        'draft_factura_grid',
        () => ({ selectedCliente, selectedVendedorId, selectedBodegaId, detalle, pagos }),
        (d) => {
            if (d.selectedCliente)    setSelectedCliente(d.selectedCliente)
            if (d.selectedVendedorId) setSelectedVendedorId(d.selectedVendedorId)
            if (d.selectedBodegaId)   setSelectedBodegaId(d.selectedBodegaId)
            if (d.detalle?.length)    setDetalle(d.detalle)
            if (d.pagos?.length)      setPagos(d.pagos)
        },
        [selectedCliente, selectedVendedorId, selectedBodegaId, detalle, pagos],
    )

    useEffect(() => { if (empresa?.id) loadData() }, [empresa?.id])

    async function loadData() {
        try {
            const [clientsList, vendedoresList, bodsList] = await Promise.all([
                catalogCacheService.getClientes(empresa!.id),
                vendedorService.getVendedoresActivos(empresa!.id).catch(() => []),
                bodegaService.listar(empresa!.id).catch(() => []),
            ])
            setClientes(clientsList)
            setVendedores(vendedoresList)
            setBodegas(bodsList)
            if (vendedoresList.length === 1) setSelectedVendedorId(vendedoresList[0].id)
            if (bodsList.length > 0 && !selectedBodegaId) {
                const principal = bodsList.find((b: Bodega) => b.es_principal) ?? bodsList[0]
                setSelectedBodegaId(principal.id)
            }
            const consumidor = await facturacionService.ensureConsumidorFinal(empresa!.id)
            if (consumidor) setSelectedCliente(consumidor)
        } catch (e) {
            console.error('Error cargando datos:', e)
        }
    }

    const filteredClientes = searchCliente
        ? clientes.filter(c =>
            c.nombre?.toLowerCase().includes(searchCliente.toLowerCase()) ||
            c.identificacion?.includes(searchCliente))
        : []

    // ── Selección de producto / presentación ────────────────────────────────
    // Idéntico a selectProducto()/selectSubproducto() en FacturaDirectaPage.tsx:
    // si el producto tiene subproductos activos, la fila espera la presentación;
    // si no, resuelve precio por volumen igual que allá.
    async function agregarFila(p: ProductoResultado) {
        const subsActivos = (p.subproductos ?? []).filter((s: any) => s.estado)
        const tieneSubproductos = subsActivos.length > 0
        if (tieneSubproductos) setSubsPorProducto(prev => ({ ...prev, [p.id]: subsActivos }))

        let precioFinal = p.precio_venta
        if (!tieneSubproductos && empresa?.id) {
            try {
                const precioVol = await precioVolumenService.resolverPrecio(empresa.id, p.id, 1)
                if (precioVol !== null) precioFinal = precioVol
            } catch { /* sin rangos activos, usa precio_venta */ }
        }

        setDetalle(prev => [...prev, {
            producto_id:       p.id,
            nombre_producto:   tieneSubproductos ? '' : p.nombre,
            cantidad:          1,
            precio_unitario:   tieneSubproductos ? 0 : precioFinal,
            descuento:         0,
            iva_porcentaje:    p.iva_porcentaje ?? 15,
            subproducto_id:    null,
            factor_conversion: 1,
        }])
    }

    function seleccionarPresentacion(idx: number, sub: any) {
        setDetalle(prev => prev.map((d, i) => i === idx ? {
            ...d,
            nombre_producto:   sub.nombre,
            precio_unitario:   Number(sub.precio_sin_iva),
            subproducto_id:    sub.id,
            factor_conversion: Number(sub.factor_conversion),
        } : d))
    }

    const updateLinea = (idx: number, field: keyof DetalleFacturaDirecta, value: any) => {
        setDetalle(prev => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d))
    }
    const removeLinea = (idx: number) => setDetalle(prev => prev.filter((_, i) => i !== idx))

    // Cantidad: además de actualizar, recalcula precio por volumen — igual que
    // el onChange de "Cantidad" en FacturaDirectaPage.tsx.
    async function actualizarCantidad(idx: number, nuevaCantidad: number) {
        updateLinea(idx, 'cantidad', nuevaCantidad)
        const d = detalle[idx]
        if (d?.producto_id && !d.subproducto_id && empresa?.id && nuevaCantidad > 0) {
            try {
                const precioVol = await precioVolumenService.resolverPrecio(empresa.id, d.producto_id, nuevaCantidad)
                if (precioVol !== null) updateLinea(idx, 'precio_unitario', precioVol)
            } catch { /* mantener precio actual */ }
        }
    }

    // ── Navegación con teclado (Enter → siguiente celda editable) ───────────
    const cellRefs = useRef<Record<string, HTMLElement | null>>({})
    function refFor(row: number, col: ColKey) {
        return (el: HTMLElement | null) => { cellRefs.current[`${row}-${col}`] = el }
    }
    function columnasFila(idx: number): ColKey[] {
        const d = detalle[idx]
        const tieneSubs = !!d?.producto_id && (subsPorProducto[d.producto_id]?.length ?? 0) > 0
        return tieneSubs ? ['presentacion', 'pvp', 'desc', 'cantidad'] : ['pvp', 'desc', 'cantidad']
    }
    function handleEnter(e: React.KeyboardEvent, row: number, col: ColKey) {
        if (e.key !== 'Enter') return
        e.preventDefault()
        const cols = columnasFila(row)
        const ci = cols.indexOf(col)
        if (ci >= 0 && ci < cols.length - 1) {
            cellRefs.current[`${row}-${cols[ci + 1]}`]?.focus()
        } else {
            const nextCols = columnasFila(row + 1)
            if (nextCols.length > 0) cellRefs.current[`${row + 1}-${nextCols[0]}`]?.focus()
        }
    }

    // ── Pagos ──────────────────────────────────────────────────────────────
    const addPago    = () => setPagos(prev => [...prev, { metodo: 'efectivo', valor: 0, referencia: '' }])
    const removePago = (idx: number) => setPagos(prev => prev.filter((_, i) => i !== idx))
    const updatePago = (idx: number, field: keyof PagoFactura, value: any) =>
        setPagos(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p))

    // ── Totales (reutiliza calcularTotalesFactura tal cual) ────────────────
    const totales = calcularTotalesFactura(detalle)
    const totalPagado = pagos.reduce((s, p) => s + (Number(p.valor) || 0), 0)
    const tieneEfectivo = pagos.some(p => p.metodo === 'efectivo')
    const vuelto = tieneEfectivo ? Math.max(0, montoRecibido - totales.total) : 0

    const autoCompletarPago = () => {
        if (pagos.length === 1) setPagos([{ ...pagos[0], valor: totales.total }])
    }

    // ── Guardar ──────────────────────────────────────────────────────────────
    async function handleGuardar() {
        if (!selectedCliente) return alert('Selecciona un cliente')
        if (!cajaSesion) return alert('No hay una caja abierta. Por favor abra caja primero.')

        const esCF = selectedCliente.identificacion === '9999999999999'
        if (esCF && pagos.some(p => p.metodo === 'credito')) {
            return alert('No se puede facturar a Crédito para Consumidor Final.')
        }

        const detallesValidos = detalle.filter(d => d.nombre_producto && d.cantidad > 0 && d.precio_unitario > 0)
        if (detallesValidos.length === 0) return alert('Agrega al menos un producto')

        if (totalPagado < totales.total - 0.01) {
            return alert(`El monto distribuido en formas de pago (${formatCurrency(totalPagado)}) no cubre el total (${formatCurrency(totales.total)}).`)
        }

        const _efectivoSum = pagos.filter(p => p.metodo === 'efectivo').reduce((s, p) => s + Number(p.valor), 0)
        const _mRecibido = tieneEfectivo ? (montoRecibido > 0 ? montoRecibido : _efectivoSum) : undefined
        const _mVuelto = tieneEfectivo ? Math.max(0, (_mRecibido ?? 0) - totales.total) : undefined

        try {
            setSaving(true)
            const factura = await facturaDirectaService.generarFacturaDirecta({
                empresa_id: empresa!.id,
                cliente_id: selectedCliente.id,
                detalles: detallesValidos,
                pagos: pagos.filter(p => p.valor > 0),
                caja_sesion_id: cajaSesion.id,
                vendedor_id: selectedVendedorId || null,
                dias_plazo_credito: 30,
                bodega_id: selectedBodegaId || null,
            })
            const facturaCompleta = await facturaDirectaService.getComprobanteCompleto(factura.id)
            clearDraft()
            setTicketMontoRecibido(_mRecibido)
            setTicketVuelto(_mVuelto)
            setFacturaFinal(facturaCompleta)
        } catch (e: any) {
            alert('Error al generar factura: ' + e.message)
        } finally {
            setSaving(false)
        }
    }

    function handleNuevaFactura() {
        setFacturaFinal(null)
        setTicketMontoRecibido(undefined)
        setTicketVuelto(undefined)
        setDetalle([])
        setSubsPorProducto({})
        setPagos([{ metodo: 'efectivo', valor: 0, referencia: '' }])
        setMontoRecibido(0)
        const cf = clientes.find(c => c.identificacion === '9999999999999')
        setSelectedCliente(cf || null)
    }

    // ── UI ────────────────────────────────────────────────────────────────
    if (facturaFinal) {
        return (
            <div className="space-y-6 max-w-2xl mx-auto">
                <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center space-y-4">
                    <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
                    <h1 className="text-xl font-bold text-slate-900">Factura generada</h1>
                    <p className="text-slate-500 text-sm">
                        {facturaFinal.secuencial} — {selectedCliente?.nombre}
                    </p>
                    <div className="flex justify-center gap-3 pt-2">
                        <button onClick={() => handlePrint()} className="btn btn-secondary gap-2">
                            <Printer className="w-4 h-4" /> Reimprimir
                        </button>
                        <button onClick={handleNuevaFactura} className="btn btn-primary gap-2">
                            <Plus className="w-4 h-4" /> Nueva Factura
                        </button>
                    </div>
                </div>
                <div className="hidden">
                    <InvoiceTicketPOS ref={printRef} factura={facturaFinal} montoRecibido={ticketMontoRecibido} vuelto={ticketVuelto} />
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <LayoutGrid className="w-7 h-7 text-primary-600" />
                        Nueva Factura — Vista Grid
                    </h1>
                    <p className="text-slate-500 text-sm">Facturación estilo grilla — mismo motor que Nueva Factura</p>
                </div>
                <HelpButton pageKey="factura-directa" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 space-y-4">
                    {/* Cliente */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-2">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5" /> Cliente
                        </label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder={selectedCliente ? `${selectedCliente.nombre} (${selectedCliente.identificacion})` : 'Buscar cliente...'}
                                className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                                value={searchCliente}
                                onChange={e => setSearchCliente(e.target.value)}
                            />
                        </div>
                        {filteredClientes.length > 0 && (
                            <div className="border border-slate-200 rounded-xl max-h-40 overflow-y-auto">
                                {filteredClientes.map(c => (
                                    <button key={c.id} type="button"
                                        onClick={() => { setSelectedCliente(c); setSearchCliente('') }}
                                        className="w-full px-3 py-2 text-left hover:bg-slate-50 text-sm border-b border-slate-50 last:border-0">
                                        <span className="font-semibold">{c.nombre}</span>
                                        <span className="text-slate-400 ml-2 text-xs">{c.identificacion}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Vendedor / Bodega */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Vendedor</label>
                            <select className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white outline-none focus:ring-2 focus:ring-primary-500"
                                value={selectedVendedorId} onChange={e => setSelectedVendedorId(e.target.value)}>
                                <option value="">— Sin vendedor —</option>
                                {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                            </select>
                        </div>
                        {bodegas.length > 0 && (
                            <div>
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Bodega</label>
                                <select className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white outline-none focus:ring-2 focus:ring-primary-500"
                                    value={selectedBodegaId} onChange={e => setSelectedBodegaId(e.target.value)}>
                                    <option value="">— Sin bodega —</option>
                                    {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre}{b.es_principal ? ' ★' : ''}</option>)}
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Buscador para agregar filas */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Agregar artículo</label>
                        <BuscadorProducto
                            empresaId={empresa!.id}
                            conSubproductos
                            placeholder="Código o nombre (Enter para buscar)…"
                            onSelect={(p) => agregarFila(p)}
                        />
                    </div>

                    {/* Grid de líneas */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                                        <th className="text-left px-3 py-2.5 font-semibold">Artículo</th>
                                        <th className="text-left px-3 py-2.5 font-semibold">Presentación</th>
                                        <th className="text-right px-3 py-2.5 font-semibold w-24">PVP</th>
                                        <th className="text-right px-3 py-2.5 font-semibold w-20">Desc%</th>
                                        <th className="text-right px-3 py-2.5 font-semibold w-24">P. Final</th>
                                        <th className="text-right px-3 py-2.5 font-semibold w-20">Cant.</th>
                                        <th className="text-right px-3 py-2.5 font-semibold w-28">Total</th>
                                        <th className="w-8" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {detalle.map((d, idx) => {
                                        const subsActivos = d.producto_id ? (subsPorProducto[d.producto_id] ?? []) : []
                                        const linea = d.cantidad > 0 && d.precio_unitario > 0 ? calcularLinea(d) : null
                                        const precioFinalUnit = linea && d.cantidad > 0 ? linea.subtotal_neto / d.cantidad : 0

                                        return (
                                            <tr key={idx} className="hover:bg-slate-50">
                                                <td className="px-3 py-2 font-medium text-slate-800">{d.nombre_producto || '—'}</td>
                                                <td className="px-3 py-2">
                                                    {subsActivos.length > 0 ? (
                                                        <select
                                                            ref={refFor(idx, 'presentacion') as any}
                                                            onKeyDown={e => handleEnter(e, idx, 'presentacion')}
                                                            className="w-full px-2 py-1.5 rounded-lg border border-orange-200 bg-orange-50 text-xs outline-none focus:ring-2 focus:ring-orange-400"
                                                            value={d.subproducto_id || ''}
                                                            onChange={e => {
                                                                const sub = subsActivos.find((s: any) => s.id === e.target.value)
                                                                if (sub) seleccionarPresentacion(idx, sub)
                                                            }}>
                                                            <option value="">— Elegir —</option>
                                                            {subsActivos.map((s: any) => (
                                                                <option key={s.id} value={s.id}>{s.nombre}</option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <span className="text-slate-300 text-xs">—</span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <input type="number" min="0" step="0.01"
                                                        ref={refFor(idx, 'pvp') as any}
                                                        onKeyDown={e => handleEnter(e, idx, 'pvp')}
                                                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-sm text-right bg-white outline-none focus:ring-2 focus:ring-primary-400"
                                                        value={d.precio_unitario}
                                                        onChange={e => updateLinea(idx, 'precio_unitario', parseFloat(e.target.value) || 0)} />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <input type="number" min="0" max="100" step="0.1"
                                                        ref={refFor(idx, 'desc') as any}
                                                        onKeyDown={e => handleEnter(e, idx, 'desc')}
                                                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-sm text-right bg-white outline-none focus:ring-2 focus:ring-primary-400"
                                                        value={d.descuento}
                                                        onChange={e => updateLinea(idx, 'descuento', parseFloat(e.target.value) || 0)} />
                                                </td>
                                                <td className="px-3 py-2 text-right font-mono text-slate-600">
                                                    {formatCurrency(precioFinalUnit)}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <input type="number" min="0.01" step="0.01"
                                                        ref={refFor(idx, 'cantidad') as any}
                                                        onKeyDown={e => handleEnter(e, idx, 'cantidad')}
                                                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-sm text-right font-bold bg-white outline-none focus:ring-2 focus:ring-primary-400"
                                                        value={d.cantidad}
                                                        onChange={e => actualizarCantidad(idx, parseFloat(e.target.value) || 0)} />
                                                </td>
                                                <td className="px-3 py-2 text-right font-bold text-primary-700">
                                                    {linea ? formatCurrency(linea.total) : '—'}
                                                </td>
                                                <td className="px-2 py-2">
                                                    <button onClick={() => removeLinea(idx)}
                                                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                    {detalle.length === 0 && (
                                        <tr>
                                            <td colSpan={8} className="px-6 py-10 text-center text-slate-400 text-sm">
                                                Usa el buscador de arriba para agregar artículos a la factura.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* COLUMNA LATERAL */}
                <div className="space-y-6">
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="font-bold text-slate-900 flex items-center gap-2">
                                <CreditCard className="w-5 h-5 text-primary-500" /> Formas de Pago
                            </h2>
                            <button onClick={addPago} className="text-primary-600 hover:text-primary-700 flex items-center gap-1 text-sm font-bold">
                                <Plus className="w-4 h-4" /> Agregar
                            </button>
                        </div>
                        <div className="space-y-3">
                            {pagos.map((p, i) => (
                                <div key={i} className="flex gap-2 items-center">
                                    <select
                                        className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-primary-400 bg-white"
                                        value={p.metodo}
                                        onChange={e => updatePago(i, 'metodo', e.target.value as PagoFactura['metodo'])}>
                                        {METODOS_PAGO.filter(m => !m.cfBlocked || selectedCliente?.identificacion !== '9999999999999').map(m => (
                                            <option key={m.value} value={m.value}>{m.label}</option>
                                        ))}
                                    </select>
                                    <input type="number" min="0" step="0.01"
                                        className="w-28 px-2 py-2 rounded-lg border-2 border-primary-200 text-sm font-bold text-right outline-none focus:ring-2 focus:ring-primary-400"
                                        value={p.valor}
                                        onChange={e => {
                                            const val = parseFloat(e.target.value) || 0
                                            updatePago(i, 'valor', val)
                                            if (p.metodo === 'efectivo') setMontoRecibido(val > totales.total ? val : 0)
                                        }} />
                                    <button onClick={() => removePago(i)} disabled={pagos.length === 1}
                                        className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-20">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <button onClick={autoCompletarPago}
                            className="w-full py-2 text-xs font-bold text-primary-600 hover:bg-primary-50 rounded-lg border border-dashed border-primary-200">
                            Completar pago con el total
                        </button>
                        {tieneEfectivo && (
                            <div>
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Efectivo recibido</label>
                                <input type="number" min="0" step="0.01"
                                    className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 text-sm text-right outline-none focus:ring-2 focus:ring-primary-500"
                                    value={montoRecibido || ''}
                                    onChange={e => setMontoRecibido(parseFloat(e.target.value) || 0)} />
                                {vuelto > 0 && <p className="text-xs text-emerald-600 font-bold mt-1">Vuelto: {formatCurrency(vuelto)}</p>}
                            </div>
                        )}
                    </div>

                    {/* Totales */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-2">
                        <div className="flex justify-between text-sm text-slate-500">
                            <span>Subtotal</span><span className="font-mono text-slate-700">{formatCurrency(totales.subtotal)}</span>
                        </div>
                        {totales.descuentos > 0 && (
                            <div className="flex justify-between text-sm text-slate-500">
                                <span>Descuentos</span><span className="font-mono text-amber-600">-{formatCurrency(totales.descuentos)}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-sm text-slate-500">
                            <span>IVA</span><span className="font-mono text-slate-700">{formatCurrency(totales.iva)}</span>
                        </div>
                        <div className="flex justify-between items-center border-t pt-2 mt-2">
                            <span className="font-bold text-slate-900">TOTAL</span>
                            <span className="text-2xl font-bold text-primary-700">{formatCurrency(totales.total)}</span>
                        </div>
                    </div>

                    <button onClick={handleGuardar} disabled={saving || detalle.length === 0}
                        className={cn('btn btn-primary w-full gap-2', (saving || detalle.length === 0) && 'opacity-50 cursor-not-allowed')}>
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {saving ? 'Guardando...' : 'Generar Factura'}
                    </button>
                </div>
            </div>
        </div>
    )
}
