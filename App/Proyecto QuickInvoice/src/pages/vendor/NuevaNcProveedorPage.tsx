import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useFormDraft } from '../../hooks/useFormDraft'
import { compraService } from '../../services/vendorService'
import { ncProveedorService, type TipoNCProveedor, type NCProveedor } from '../../services/ncProveedorService'
import type { CompraConDetalle } from '../../types/vendors'
import { supabase } from '../../lib/supabase'
import { BuscadorCuentaContable } from '../../components/BuscadorCuentaContable'
import { HelpButton } from '../../components/help/HelpButton'
import { ScanFacturaButton, type FacturaEscaneada } from '../../components/ScanFacturaButton'
import { useIaFeatureEnabled } from '../../hooks/useIaFeatureEnabled'
import { formatCurrency, cn } from '../../lib/utils'
import {
    Search, ChevronRight, ChevronLeft, AlertCircle,
    CheckCircle2, Loader2, FileMinus, X, LogOut, ListFilter, ChevronDown, ChevronUp,
} from 'lucide-react'

type Step = 1 | 2 | 3 | 4

const r2 = (n: number) => Math.round(n * 100) / 100

interface ItemDevolucion {
    id: string
    producto_id: string
    bodega_id: string | null
    nombre: string
    codigo: string
    cantidadFacturada: number
    costoUnitario: number
    maxDisponible: number
    incluir: boolean
    cantidadNC: number
}

interface CxpAlterno {
    id: string
    saldo_pendiente: number
    fecha_vencimiento: string
    compra?: { numero_factura: string | null } | null
}

export function NuevaNcProveedorPage() {
    const { empresa, profile } = useAuth()
    const navigate = useNavigate()
    const { enabled: ocrIaHabilitado } = useIaFeatureEnabled('compras')

    // ── Step 1: buscar compra origen
    const [step, setStep] = useState<Step>(1)
    const [searchText, setSearchText] = useState('')
    const [resultados, setResultados] = useState<any[]>([])
    const [buscando, setBuscando] = useState(false)
    const [compra, setCompra] = useState<CompraConDetalle | null>(null)

    // ── Step 2: tipo + datos
    const [tipo, setTipo] = useState<TipoNCProveedor>('DEVOLUCION_MERCADERIA')
    const [numeroNc, setNumeroNc] = useState('')
    const [autorizacionNc, setAutorizacionNc] = useState('')
    const [fechaNc, setFechaNc] = useState(new Date().toISOString().split('T')[0])
    const [observacion, setObservacion] = useState('')
    // Documento modificado — respaldo manual solo si la compra vinculada no
    // tiene clave_acceso real (proveedor sin factura electrónica). El SRI
    // exige este dato para declarar la N/C en el ATS.
    const [docModTipo, setDocModTipo] = useState<'01' | '03'>('01')
    const [docModNumero, setDocModNumero] = useState('')
    const [docModAutorizacion, setDocModAutorizacion] = useState('')
    const [items, setItems] = useState<ItemDevolucion[]>([])
    const [baseIva0, setBaseIva0] = useState(0)
    const [baseIva5, setBaseIva5] = useState(0)
    const [baseIva15, setBaseIva15] = useState(0)
    const [cuentaContraId, setCuentaContraId] = useState<string | null>(null)

    // ── CxP destino
    const [aplicarMismaFactura, setAplicarMismaFactura] = useState(true)
    const [cxpAlternas, setCxpAlternas] = useState<CxpAlterno[]>([])
    const [cxpDestinoId, setCxpDestinoId] = useState<string | null>(null)

    const [errStep, setErrStep] = useState('')
    const [procesando, setProcesando] = useState(false)
    const [ncCreada, setNcCreada] = useState<any>(null)

    // ── Ver N/C ya registradas (sin salir de esta pantalla) ─
    const [mostrarListado, setMostrarListado] = useState(false)
    const [listado, setListado] = useState<NCProveedor[]>([])
    const [cargandoListado, setCargandoListado] = useState(false)
    const [busquedaListado, setBusquedaListado] = useState('')

    // ── Draft — evita perder la digitación al salir a otra área del ERP ────────
    const clearDraft = useFormDraft(
        'draft_nc_proveedor',
        () => ({ step, compra, tipo, numeroNc, autorizacionNc, fechaNc, observacion, items, baseIva0, baseIva5, baseIva15, cuentaContraId, aplicarMismaFactura, cxpDestinoId }),
        (d) => {
            if (!d.compra) return
            if (d.compra) setCompra(d.compra)
            if (d.tipo) setTipo(d.tipo)
            if (d.numeroNc) setNumeroNc(d.numeroNc)
            if (d.autorizacionNc) setAutorizacionNc(d.autorizacionNc)
            if (d.fechaNc) setFechaNc(d.fechaNc)
            if (d.observacion) setObservacion(d.observacion)
            if (d.items?.length) setItems(d.items)
            if (d.baseIva0) setBaseIva0(d.baseIva0)
            if (d.baseIva5) setBaseIva5(d.baseIva5)
            if (d.baseIva15) setBaseIva15(d.baseIva15)
            if (d.cuentaContraId) setCuentaContraId(d.cuentaContraId)
            if (typeof d.aplicarMismaFactura === 'boolean') setAplicarMismaFactura(d.aplicarMismaFactura)
            if (d.cxpDestinoId) setCxpDestinoId(d.cxpDestinoId)
            if (d.step && d.step < 4) setStep(d.step)
        },
        [step, compra, tipo, numeroNc, autorizacionNc, fechaNc, observacion, items, baseIva0, baseIva5, baseIva15, cuentaContraId, aplicarMismaFactura, cxpDestinoId],
    )

    function finalizarSinGrabar() {
        if (!confirm('¿Salir sin guardar esta Nota de Crédito? Se perderá lo digitado.')) return
        clearDraft()
        navigate('/compras/notas-credito')
    }

    async function toggleListado() {
        const abrir = !mostrarListado
        setMostrarListado(abrir)
        if (abrir && empresa?.id) {
            setCargandoListado(true)
            try { setListado(await ncProveedorService.listar(empresa.id)) }
            finally { setCargandoListado(false) }
        }
    }

    const listadoFiltrado = listado.filter(nc => {
        if (!busquedaListado.trim()) return true
        const b = busquedaListado.toLowerCase()
        return (
            (nc.numero_nc ?? '').toLowerCase().includes(b) ||
            nc.proveedor?.nombre_empresa?.toLowerCase().includes(b) ||
            nc.compra?.numero_factura?.toLowerCase().includes(b)
        )
    })

    // ─── Buscar compras ────────────────────────────────────
    useEffect(() => {
        if (!searchText.trim() || !empresa?.id) { setResultados([]); return }
        const t = setTimeout(async () => {
            setBuscando(true)
            try { setResultados(await ncProveedorService.buscarComprasParaNc(empresa.id, searchText)) }
            catch (e) { console.error('[NC proveedor buscar]', e); setResultados([]) }
            finally { setBuscando(false) }
        }, 350)
        return () => clearTimeout(t)
    }, [searchText, empresa?.id])

    // ─── Seleccionar compra origen ─────────────────────────
    async function seleccionarCompra(c: any) {
        const full = await compraService.obtenerConDetalle(c.id)
        setCompra(full)

        if (full.tipo_compra === 'INVENTARIO' && full.detalle_ingresos_stock?.length) {
            const devueltas = await ncProveedorService.getCantidadesDevueltas(full.id)
            setItems(full.detalle_ingresos_stock.map(d => {
                const yaDevuelta = devueltas[d.id!] || 0
                const maxDisponible = r2(Math.max(0, d.cantidad - yaDevuelta))
                return {
                    id: d.id!,
                    producto_id: d.producto_id,
                    bodega_id: d.bodega_id ?? full.bodega_id ?? null,
                    nombre: d.producto?.nombre ?? '',
                    codigo: d.producto?.codigo ?? '',
                    cantidadFacturada: d.cantidad,
                    costoUnitario: d.costo_unitario,
                    maxDisponible,
                    incluir: false,
                    cantidadNC: 0,
                }
            }))
        } else {
            setItems([])
            setTipo('NC_VALOR')
        }

        // Otras CxP pendientes del mismo proveedor (excluyendo la de esta compra)
        if (full.proveedor_id) {
            const { data } = await supabase
                .from('cuentas_por_pagar')
                .select('id, saldo_pendiente, fecha_vencimiento, compra:ingresos_stock(numero_factura)')
                .eq('proveedor_id', full.proveedor_id)
                .in('estado', ['PENDIENTE', 'PARCIALMENTE_PAGADO'])
                .neq('compra_id', full.id)
                .order('fecha_vencimiento')
            setCxpAlternas((data ?? []) as any)
        }

        setAplicarMismaFactura(true)
        setCxpDestinoId(null)
        setSearchText('')
        setResultados([])
        setStep(2)
    }

    // ─── Totales calculados ────────────────────────────────
    const subtotalItems = r2(items.filter(i => i.incluir).reduce((s, i) => s + i.cantidadNC * i.costoUnitario, 0))
    const valorIva = r2(baseIva5 * 0.05 + baseIva15 * 0.15)
    const total = r2(baseIva0 + baseIva5 + baseIva15 + valorIva)

    // Prefill de bases cuando cambian los ítems seleccionados (heurística: tarifa dominante de la compra)
    useEffect(() => {
        if (tipo !== 'DEVOLUCION_MERCADERIA' || !compra) return
        if (subtotalItems <= 0) { setBaseIva0(0); setBaseIva5(0); setBaseIva15(0); return }
        if (compra.base_iva_15 > 0) { setBaseIva15(subtotalItems); setBaseIva5(0); setBaseIva0(0) }
        else if (compra.base_iva_5 > 0) { setBaseIva5(subtotalItems); setBaseIva15(0); setBaseIva0(0) }
        else { setBaseIva0(subtotalItems); setBaseIva5(0); setBaseIva15(0) }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subtotalItems, tipo])

    const saldoOrigen = compra?.cxp?.saldo_pendiente ?? 0
    const necesitaOtraFactura = total > saldoOrigen + 0.001

    // Aplica los datos leídos del PDF/foto de la N/C física del proveedor.
    // El proveedor y la factura origen ya están fijados por el Paso 1 — acá
    // solo se completan los datos propios del documento de N/C.
    function handleScanAplicar(data: FacturaEscaneada) {
        if (data.estab && data.pto_emi && data.secuencial) {
            setNumeroNc(`${data.estab}-${data.pto_emi}-${data.secuencial}`)
        }
        if (data.fecha_emision) setFechaNc(data.fecha_emision)
        if (data.clave_acceso) setAutorizacionNc(data.clave_acceso)
        if (tipo === 'NC_VALOR') {
            setBaseIva0(data.base_cero ?? 0)
            setBaseIva15(data.base_iva ?? 0)
        }
    }

    function validarStep2(): boolean {
        if (!fechaNc) { setErrStep('Ingresa la fecha de la N/C.'); return false }
        if (tipo === 'DEVOLUCION_MERCADERIA') {
            if (!items.some(i => i.incluir && i.cantidadNC > 0)) {
                setErrStep('Selecciona al menos un producto a devolver.'); return false
            }
            for (const i of items.filter(i => i.incluir)) {
                if (i.cantidadNC <= 0 || i.cantidadNC > i.maxDisponible) {
                    setErrStep(`"${i.nombre}": cantidad inválida (máx. ${i.maxDisponible}).`); return false
                }
            }
        }
        if (total <= 0.001) { setErrStep('El total de la N/C debe ser mayor a 0.'); return false }
        if (necesitaOtraFactura && aplicarMismaFactura) {
            setErrStep('La factura origen no tiene saldo suficiente. Elige otra factura del proveedor para aplicar el excedente, o continúa sin aplicar a CxP.')
            return false
        }
        if (!aplicarMismaFactura && necesitaOtraFactura && !cxpDestinoId) {
            setErrStep('Elige una factura del proveedor para aplicar el valor de la N/C (o deja "sin aplicar a CxP").')
            return false
        }
        if (!compra?.clave_acceso) {
            const partes = docModNumero.trim().replace(/\s/g, '').split('-')
            if (partes.length !== 3 || !docModAutorizacion.trim()) {
                setErrStep('La compra vinculada no tiene una autorización SRI real — completa el documento que modifica esta N/C (número completo est-ptoemi-secuencial y autorización) para poder declararla en el ATS.')
                return false
            }
        }
        setErrStep('')
        return true
    }

    async function confirmar() {
        if (!compra || !empresa || !profile?.id) return
        setProcesando(true)
        setErrStep('')
        try {
            const sinClaveReal = !compra.clave_acceso
            const docModPartes = sinClaveReal ? docModNumero.trim().replace(/\s/g, '').split('-') : []
            const nc = await ncProveedorService.crear({
                empresaId: empresa.id,
                proveedorId: compra.proveedor_id!,
                compraId: compra.id,
                tipo,
                numeroNc: numeroNc || undefined,
                autorizacionNc: autorizacionNc || undefined,
                fechaNc,
                observacion: observacion || undefined,
                aplicarMismaFactura,
                cxpDestinoId: aplicarMismaFactura ? null : cxpDestinoId,
                baseIva0, baseIva5, baseIva15,
                valorIva, total,
                cuentaContraId: tipo === 'NC_VALOR' ? cuentaContraId : null,
                docModTipo: sinClaveReal ? docModTipo : undefined,
                docModEstablecimiento: sinClaveReal ? docModPartes[0]?.padStart(3, '0') : undefined,
                docModPuntoEmision: sinClaveReal ? docModPartes[1]?.padStart(3, '0') : undefined,
                docModSecuencial: sinClaveReal ? docModPartes[2] : undefined,
                docModAutorizacion: sinClaveReal ? docModAutorizacion.trim() : undefined,
                detalle: tipo === 'DEVOLUCION_MERCADERIA'
                    ? items.filter(i => i.incluir && i.cantidadNC > 0).map(i => ({
                        detalleIngresoId: i.id,
                        productoId: i.producto_id,
                        bodegaId: i.bodega_id,
                        cantidad: i.cantidadNC,
                        costoUnitario: i.costoUnitario,
                        subtotal: r2(i.cantidadNC * i.costoUnitario),
                    }))
                    : undefined,
                usuarioId: profile.id,
                portalRuc: (empresa as any)?.ruc ?? '',
                proveedorNombre: compra.proveedor?.nombre_empresa ?? '',
            })
            clearDraft()
            setNcCreada(nc)
            setStep(4)
        } catch (e: any) {
            setErrStep(e.message || 'Error al crear la nota de crédito')
        } finally {
            setProcesando(false)
        }
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate('/compras/notas-credito')} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400">
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                            <FileMinus className="w-5 h-5 text-orange-500" />
                            Nueva Nota de Crédito de Proveedor
                        </h1>
                        <p className="text-xs text-slate-500">Pasos: Factura origen → Datos de la N/C → Confirmar</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <HelpButton pageKey="nc-proveedores" />
                    <button onClick={toggleListado} className="btn border border-slate-200 text-slate-600 gap-2 hover:bg-slate-50 text-sm">
                        <ListFilter className="w-4 h-4" /> Ver N/C Registradas
                        {mostrarListado ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                    {step !== 4 && (
                        <button onClick={finalizarSinGrabar} className="btn border border-red-200 text-red-600 gap-2 hover:bg-red-50 text-sm">
                            <LogOut className="w-4 h-4" /> Finalizar Sin Grabar
                        </button>
                    )}
                </div>
            </div>

            {mostrarListado && (
                <div className="card p-4 space-y-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar por N° N/C, proveedor o factura..."
                            className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                            value={busquedaListado}
                            onChange={e => setBusquedaListado(e.target.value)}
                        />
                    </div>
                    {cargandoListado ? (
                        <div className="py-6 text-center text-slate-400 text-sm">
                            <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Cargando...
                        </div>
                    ) : listadoFiltrado.length === 0 ? (
                        <p className="py-4 text-center text-sm text-slate-400">Sin notas de crédito registradas.</p>
                    ) : (
                        <div className="max-h-64 overflow-y-auto border border-slate-100 rounded-lg divide-y divide-slate-100">
                            {listadoFiltrado.map(nc => (
                                <div key={nc.id} className="px-3 py-2 flex items-center justify-between text-sm">
                                    <div>
                                        <span className="font-mono text-xs text-slate-600">{nc.numero_nc || nc.id.slice(0, 8)}</span>
                                        <span className="mx-2 text-slate-300">·</span>
                                        <span className="text-slate-700">{nc.proveedor?.nombre_empresa}</span>
                                        <span className="mx-2 text-slate-300">·</span>
                                        <span className="text-xs text-slate-400">{nc.tipo === 'DEVOLUCION_MERCADERIA' ? 'Devolución' : 'Valor'}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium', nc.estado === 'ACTIVA' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600')}>
                                            {nc.estado}
                                        </span>
                                        <span className="font-mono font-semibold">{formatCurrency(nc.total)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="flex items-center gap-2">
                {[1, 2, 3].map(s => (
                    <div key={s} className="flex items-center gap-2">
                        <div className={cn(
                            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-black',
                            step >= s ? 'bg-primary-600 text-white' : 'bg-slate-200 text-slate-400'
                        )}>{s}</div>
                        <span className={cn('text-xs font-medium hidden sm:block', step >= s ? 'text-primary-700' : 'text-slate-400')}>
                            {s === 1 ? 'Factura origen' : s === 2 ? 'Datos N/C' : 'Confirmar'}
                        </span>
                        {s < 3 && <ChevronRight className="w-4 h-4 text-slate-300" />}
                    </div>
                ))}
            </div>

            {/* ── STEP 1 ── */}
            {step === 1 && (
                <div className="card p-6 space-y-4">
                    <h2 className="font-bold text-slate-900">Seleccionar Factura de Compra Origen</h2>
                    <p className="text-sm text-slate-500">Busca por número de factura.</p>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Ej: 001-005-000000123..."
                            className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500"
                            value={searchText}
                            onChange={e => setSearchText(e.target.value)}
                            autoFocus
                        />
                        {buscando && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />}
                    </div>

                    {resultados.length > 0 && (
                        <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
                            {resultados.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => seleccionarCompra(c)}
                                    className="w-full text-left px-4 py-3 hover:bg-primary-50 transition-colors flex items-center justify-between gap-4"
                                >
                                    <div>
                                        <p className="font-mono text-sm font-bold text-slate-900">{c.numero_factura}</p>
                                        <p className="text-xs text-slate-500">{c.proveedor?.nombre_empresa} — {c.fecha_emision}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="font-bold text-slate-900">{formatCurrency(c.total)}</p>
                                        <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-bold">
                                            Saldo CxP: {formatCurrency(c.cxp?.[0]?.saldo_pendiente ?? 0)}
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                    {searchText.length > 2 && !buscando && resultados.length === 0 && (
                        <p className="text-sm text-slate-400 text-center py-4">Sin resultados para "{searchText}"</p>
                    )}
                </div>
            )}

            {/* ── STEP 2 ── */}
            {step === 2 && compra && (
                <div className="space-y-4">
                    <div className="card p-4 bg-slate-50 border border-slate-200 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">Factura Origen</p>
                            <p className="font-mono font-bold text-slate-900">{compra.numero_factura}</p>
                            <p className="text-sm text-slate-600">{compra.proveedor?.nombre_empresa}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-slate-500">Saldo pendiente</p>
                            <p className="text-xl font-black text-slate-900">{formatCurrency(saldoOrigen)}</p>
                        </div>
                        <button onClick={() => { setStep(1); setCompra(null) }} className="p-2 hover:bg-slate-200 rounded-full ml-2">
                            <X className="w-4 h-4 text-slate-400" />
                        </button>
                    </div>

                    <div className="card p-6 space-y-5">
                        {ocrIaHabilitado && (
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Datos de la N/C</p>
                                <ScanFacturaButton onAplicar={handleScanAplicar} empresaId={empresa!.id} />
                            </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Tipo de N/C *</label>
                                <select
                                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white disabled:bg-slate-50"
                                    value={tipo}
                                    disabled={compra.tipo_compra !== 'INVENTARIO'}
                                    onChange={e => setTipo(e.target.value as TipoNCProveedor)}
                                >
                                    <option value="DEVOLUCION_MERCADERIA">Devolución de Mercadería</option>
                                    <option value="NC_VALOR">N/C Valor (descuento, sin devolución)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Fecha de la N/C *</label>
                                <input type="date" className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                                    value={fechaNc} onChange={e => setFechaNc(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">N° de N/C del proveedor</label>
                                <input type="text" className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                                    value={numeroNc} onChange={e => setNumeroNc(e.target.value)} placeholder="001-002-000000123" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Autorización SRI (opcional)</label>
                                <input type="text" className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                                    value={autorizacionNc} onChange={e => setAutorizacionNc(e.target.value)} />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Observación</label>
                                <input type="text" className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                                    value={observacion} onChange={e => setObservacion(e.target.value)} placeholder='Ej: "Cliente desiste"' />
                            </div>
                        </div>

                        {!compra.clave_acceso && (
                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
                                <p className="text-xs font-bold text-amber-700 uppercase tracking-widest">
                                    Documento que modifica (obligatorio para el ATS)
                                </p>
                                <p className="text-[11px] text-amber-700">
                                    La factura vinculada ({compra.numero_factura}) no tiene una autorización SRI real — el SRI igual exige declarar qué documento modifica esta N/C en el Anexo Transaccional.
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-xs text-slate-500 mb-1">Tipo de documento</label>
                                        <select className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white"
                                            value={docModTipo} onChange={e => setDocModTipo(e.target.value as '01' | '03')}>
                                            <option value="01">Factura</option>
                                            <option value="03">Liquidación de Compra</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-slate-500 mb-1">Número completo (est-ptoemi-secuencial)</label>
                                        <input className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none text-sm font-mono text-xs"
                                            value={docModNumero} onChange={e => setDocModNumero(e.target.value)} placeholder="001-001-000012345" />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-slate-500 mb-1">Autorización SRI (clave de acceso)</label>
                                        <input className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none text-sm font-mono text-xs"
                                            maxLength={49} value={docModAutorizacion} onChange={e => setDocModAutorizacion(e.target.value)} />
                                    </div>
                                </div>
                            </div>
                        )}

                        {tipo === 'DEVOLUCION_MERCADERIA' && (
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Productos a devolver</p>
                                <div className="border border-slate-200 rounded-lg overflow-hidden">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                                                <th className="px-4 py-3 w-8"></th>
                                                <th className="px-4 py-3">Producto</th>
                                                <th className="px-4 py-3 text-right">Cant. Facturada</th>
                                                <th className="px-4 py-3 text-right">Costo Unit.</th>
                                                <th className="px-4 py-3 text-right w-36">Cant. a Devolver</th>
                                                <th className="px-4 py-3 text-right">Subtotal</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 bg-white">
                                            {items.map((item, idx) => {
                                                const agotado = item.maxDisponible <= 0
                                                return (
                                                    <tr key={item.id} className={cn(agotado ? 'opacity-40 bg-slate-50' : item.incluir ? 'bg-primary-50/40' : '')}>
                                                        <td className="px-4 py-3">
                                                            <input type="checkbox" checked={item.incluir} disabled={agotado}
                                                                onChange={e => {
                                                                    const next = [...items]
                                                                    next[idx] = { ...item, incluir: e.target.checked, cantidadNC: e.target.checked ? item.maxDisponible : 0 }
                                                                    setItems(next)
                                                                }}
                                                                className="w-4 h-4 accent-primary-600" />
                                                        </td>
                                                        <td className="px-4 py-3 text-sm font-medium text-slate-900">
                                                            {item.nombre}
                                                            {agotado && <span className="ml-1.5 text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded">ya devuelto</span>}
                                                        </td>
                                                        <td className="px-4 py-3 text-sm text-right text-slate-600">{item.cantidadFacturada}</td>
                                                        <td className="px-4 py-3 text-sm text-right text-slate-600 font-mono">{formatCurrency(item.costoUnitario)}</td>
                                                        <td className="px-4 py-3 text-right">
                                                            {agotado ? <span className="text-xs text-slate-400">—</span> : (
                                                                <div className="flex flex-col items-end gap-0.5">
                                                                    <input type="number" min={0} max={item.maxDisponible} step={0.01}
                                                                        disabled={!item.incluir}
                                                                        value={item.cantidadNC === 0 && !item.incluir ? '' : item.cantidadNC}
                                                                        onChange={e => {
                                                                            const v = Math.min(Math.max(0, Number(e.target.value)), item.maxDisponible)
                                                                            const next = [...items]
                                                                            next[idx] = { ...item, cantidadNC: v }
                                                                            setItems(next)
                                                                        }}
                                                                        className={cn('w-24 px-2 py-1 text-right border rounded focus:ring-2 focus:ring-primary-500 outline-none text-sm font-mono',
                                                                            item.incluir ? 'border-primary-300 bg-white' : 'border-slate-200 opacity-40')} />
                                                                    <span className="text-[10px] text-slate-400">máx: {item.maxDisponible}</span>
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-sm font-bold text-slate-900">
                                                            {item.incluir && item.cantidadNC > 0 ? formatCurrency(r2(item.cantidadNC * item.costoUnitario)) : '—'}
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Bases e IVA de la N/C</p>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-xs text-slate-500 mb-1">Base Cero</label>
                                    <input type="number" step={0.01} min={0} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-right font-mono text-sm outline-none focus:ring-2 focus:ring-primary-500"
                                        value={baseIva0} onChange={e => setBaseIva0(Number(e.target.value) || 0)} />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-500 mb-1">Base IVA 5%</label>
                                    <input type="number" step={0.01} min={0} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-right font-mono text-sm outline-none focus:ring-2 focus:ring-primary-500"
                                        value={baseIva5} onChange={e => setBaseIva5(Number(e.target.value) || 0)} />
                                </div>
                                <div>
                                    <label className="block text-xs text-slate-500 mb-1">Base IVA 15%</label>
                                    <input type="number" step={0.01} min={0} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-right font-mono text-sm outline-none focus:ring-2 focus:ring-primary-500"
                                        value={baseIva15} onChange={e => setBaseIva15(Number(e.target.value) || 0)} />
                                </div>
                            </div>
                            <div className="flex justify-end mt-3">
                                <div className="w-64 space-y-1 text-sm">
                                    <div className="flex justify-between text-slate-600">
                                        <span>IVA:</span><span className="font-mono">{formatCurrency(valorIva)}</span>
                                    </div>
                                    <div className="flex justify-between font-black text-slate-900 text-base border-t pt-1 mt-1">
                                        <span>TOTAL N/C:</span><span className="font-mono">{formatCurrency(total)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {tipo === 'NC_VALOR' && (
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                                    Cuenta contable (opcional — si no eliges, se usa "Pagos: Nota de Crédito de Proveedor")
                                </label>
                                <BuscadorCuentaContable
                                    portalRuc={(empresa as any)?.ruc}
                                    value={cuentaContraId}
                                    onChange={c => setCuentaContraId(c?.id ?? null)}
                                />
                            </div>
                        )}

                        {necesitaOtraFactura && (
                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
                                <p className="text-sm text-amber-800 flex items-start gap-2">
                                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                    La factura origen no tiene saldo suficiente ({formatCurrency(saldoOrigen)}) para el total de esta N/C ({formatCurrency(total)}). Elige otra factura del proveedor para aplicar el valor, o continúa sin aplicar a CxP.
                                </p>
                                <select
                                    className="w-full px-3 py-2 rounded-lg border border-amber-300 bg-white text-sm outline-none focus:ring-2 focus:ring-amber-400"
                                    value={aplicarMismaFactura ? '' : (cxpDestinoId ?? 'ninguna')}
                                    onChange={e => {
                                        if (e.target.value === '') { setAplicarMismaFactura(true); setCxpDestinoId(null) }
                                        else if (e.target.value === 'ninguna') { setAplicarMismaFactura(false); setCxpDestinoId(null) }
                                        else { setAplicarMismaFactura(false); setCxpDestinoId(e.target.value) }
                                    }}
                                >
                                    <option value="">Aplicar solo hasta el saldo de esta factura</option>
                                    <option value="ninguna">No aplicar a ninguna CxP (solo registrar)</option>
                                    {cxpAlternas.map(c => (
                                        <option key={c.id} value={c.id}>
                                            {c.compra?.numero_factura ?? c.id.slice(0, 8)} — Saldo: {formatCurrency(c.saldo_pendiente)}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {errStep && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-red-700 text-sm">
                                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{errStep}
                            </div>
                        )}

                        <div className="flex justify-between pt-2">
                            <button onClick={() => setStep(1)} className="btn border border-slate-200 text-slate-600 gap-2 hover:bg-slate-50">
                                <ChevronLeft className="w-4 h-4" /> Anterior
                            </button>
                            <button onClick={() => { if (validarStep2()) setStep(3) }} className="btn bg-primary-600 text-white gap-2 hover:bg-primary-700 active:scale-95">
                                Revisar y Confirmar <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── STEP 3 ── */}
            {step === 3 && compra && (
                <div className="card p-6 space-y-6">
                    <h2 className="font-bold text-slate-900 text-lg">Confirmar Nota de Crédito de Proveedor</h2>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="p-4 bg-slate-50 rounded-xl space-y-1">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Factura Origen</p>
                            <p className="font-mono font-bold">{compra.numero_factura}</p>
                            <p className="text-slate-600">{compra.proveedor?.nombre_empresa}</p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-xl space-y-1">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Tipo</p>
                            <p className="font-bold">{tipo === 'DEVOLUCION_MERCADERIA' ? 'Devolución de Mercadería' : 'N/C Valor'}</p>
                            <p className="text-slate-600">{observacion || '—'}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div className="p-3 bg-slate-50 rounded-lg"><p className="text-xs text-slate-400">Base 0%</p><p className="font-mono font-bold">{formatCurrency(baseIva0)}</p></div>
                        <div className="p-3 bg-slate-50 rounded-lg"><p className="text-xs text-slate-400">Base 5%</p><p className="font-mono font-bold">{formatCurrency(baseIva5)}</p></div>
                        <div className="p-3 bg-slate-50 rounded-lg"><p className="text-xs text-slate-400">Base 15%</p><p className="font-mono font-bold">{formatCurrency(baseIva15)}</p></div>
                        <div className="p-3 bg-slate-50 rounded-lg"><p className="text-xs text-slate-400">IVA</p><p className="font-mono font-bold">{formatCurrency(valorIva)}</p></div>
                    </div>

                    <div className="p-4 bg-primary-50 rounded-xl flex justify-between items-center">
                        <span className="font-bold text-slate-700">TOTAL NOTA DE CRÉDITO</span>
                        <span className="font-mono font-black text-xl text-primary-700">{formatCurrency(total)}</span>
                    </div>

                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-sm">
                        {aplicarMismaFactura
                            ? `Se aplicará ${formatCurrency(Math.min(total, saldoOrigen))} al saldo de la factura ${compra.numero_factura}.`
                            : cxpDestinoId
                                ? 'Se aplicará al saldo de la factura alternativa seleccionada.'
                                : 'No se aplicará a ninguna Cuenta por Pagar (solo se registrará el documento y, si aplica, el movimiento de Kardex).'}
                    </div>

                    {errStep && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-red-700 text-sm">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{errStep}
                        </div>
                    )}

                    <div className="flex justify-between">
                        <button onClick={() => setStep(2)} disabled={procesando} className="btn border border-slate-200 text-slate-600 gap-2 hover:bg-slate-50 disabled:opacity-40">
                            <ChevronLeft className="w-4 h-4" /> Anterior
                        </button>
                        <button onClick={confirmar} disabled={procesando} className="btn bg-primary-600 text-white gap-2 hover:bg-primary-700 active:scale-95 disabled:opacity-50 min-w-40 justify-center">
                            {procesando ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : <><CheckCircle2 className="w-4 h-4" /> Registrar N/C</>}
                        </button>
                    </div>
                </div>
            )}

            {/* ── STEP 4 ── */}
            {step === 4 && ncCreada && (
                <div className="card p-8 space-y-6 text-center">
                    <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
                    <h2 className="text-2xl font-black text-slate-900">Nota de Crédito registrada</h2>
                    <p className="text-2xl font-black text-primary-700">{formatCurrency(ncCreada.total)}</p>
                    <div className="flex gap-3 justify-center flex-wrap pt-2">
                        <button onClick={() => navigate('/compras/notas-credito')} className="btn bg-primary-600 text-white gap-2 hover:bg-primary-700">
                            Ver todas las N/C
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
