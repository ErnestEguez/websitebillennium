import { useState, useEffect, useRef } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { HelpButton } from '../components/help/HelpButton'
import { preparacionPinturaService } from '../services/preparacionPinturaService'
import { useFormDraft } from '../hooks/useFormDraft'
import { useReactToPrint } from 'react-to-print'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { facturacionService } from '../services/facturacionService'
import { carteraCxcService, type CarteraCxc } from '../services/carteraCxcService'
import {
    facturaDirectaService,
    calcularLinea,
    calcularTotalesFactura,
    calcularMargenLinea,
    costoLinea,
    getSemaforoRentabilidad,
    DEFAULT_CONFIG_RENTABILIDAD,
    type DetalleFacturaDirecta,
    type PagoFactura,
    type RetencionFactura,
    type ConfigRentabilidad,
} from '../services/facturaDirectaService'
import { RetencionesEditor } from '../components/vendor/RetencionesEditor'
import type { RetLine } from '../components/vendor/RetencionesEditor'
import { codigoRetencionService, type CodigoRetencion } from '../services/codigoRetencionService'
import { InvoiceTicketPOS } from '../components/InvoiceTicketPOS'
import { formatCurrency, validateIdentificacion } from '../lib/utils'
import {
    Search, UserPlus, Plus, Trash2, X, Save,
    CheckCircle2, Loader2, FilePlus, FileText, CreditCard,
    Package, Printer, User, Briefcase, ChevronDown, ChevronUp,
    Layers, RotateCw, PaintBucket, Copy,
} from 'lucide-react'
import { vendedorService, type Vendedor } from '../services/vendedorService'
import { bodegaService } from '../services/bodegaService'
import type { Bodega } from '../types/vendors'
import { puntoEmisionService } from '../services/puntoEmisionService'
import type { PuntoEmision } from '../types/puntosEmision'
import { cuentasBancariasService } from '../services/finance/bancosService'
import type { CuentaBancaria } from '../types/finance'
import { precioVolumenService } from '../services/precioVolumenService'
import { catalogCacheService } from '../services/catalogCacheService'
import { useNetworkStatus } from '../lib/networkStatus'
import { offlineDb } from '../lib/offlineDb'
import { cn } from '../lib/utils'
import { VoiceAssistant, type VoiceResult } from '../components/VoiceAssistant'
import { useIaFeatureEnabled } from '../hooks/useIaFeatureEnabled'

// ─────────────────────────────────────────────────────
// TIPOS DE PAGO (incluye Tarjeta D/C)
// ─────────────────────────────────────────────────────
const METODOS_PAGO: { value: PagoFactura['metodo']; label: string; cfBlocked?: boolean }[] = [
    { value: 'efectivo',     label: '💵 Efectivo' },
    { value: 'tarjeta',      label: '💳 Tarjeta D/C' },
    { value: 'transferencia',label: '🏦 Transferencia' },
    { value: 'credito',      label: '📄 Crédito', cfBlocked: true },
    { value: 'nota_credito', label: '🔖 Nota de Crédito' },
    { value: 'cheque',       label: '✏️ Cheque al día' },
    { value: 'cheque_fecha', label: '📅 Cheque a fecha' },
    { value: 'otros',        label: '🔄 Otros' },
]


// Permite usar * como comodín (ej. "Erne*Eg") al buscar cliente por nombre,
// igual que ya funciona en los buscadores de productos.
function coincideComodin(texto: string, patron: string): boolean {
    if (!patron) return true
    if (!patron.includes('*')) return texto.toLowerCase().includes(patron.toLowerCase())
    const escapado = patron.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')
    try { return new RegExp(escapado, 'i').test(texto) } catch { return false }
}

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
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const prepId = searchParams.get('prep_id')
    const { empresa, cajaSesion, profile, permisos } = useAuth()
    const { enabled: vozIaHabilitada } = useIaFeatureEnabled('voz')
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
    // Alerta de cartera pendiente (vencida / por vencer) del cliente seleccionado
    const [alertaDeuda, setAlertaDeuda] = useState<{ vencida: CarteraCxc[]; porVencer: CarteraCxc[] } | null>(null)

    // Cargar factura anterior como plantilla — solo para llenado rápido
    // (clientes que compran lo mismo varias veces). El número de la
    // factura vieja NUNCA se usa para grabar: generarFacturaDirecta()
    // siempre calcula el secuencial nuevo real al guardar, sin importar
    // qué se haya cargado en pantalla.
    const [numeroPlantilla, setNumeroPlantilla] = useState('')
    const [cargandoPlantilla, setCargandoPlantilla] = useState(false)

    // Estado: vendedores
    const [vendedores, setVendedores] = useState<Vendedor[]>([])
    const [selectedVendedorId, setSelectedVendedorId] = useState<string>('')
    const [diasPlazoCredito, setDiasPlazoCredito] = useState<number>(30)

    // Estado: bodegas
    const [bodegas, setBodegas] = useState<Bodega[]>([])
    const [selectedBodegaId, setSelectedBodegaId] = useState<string>('')

    // Estado: punto de emisión activo en este dispositivo (serie SRI con la que se factura)
    const [puntoEmisionActivo, setPuntoEmisionActivo] = useState<PuntoEmision | null>(null)

    // Estado: secciones colapsables
    const [clienteCollapsed, setClienteCollapsed] = useState(false)
    const [vendedorCollapsed, setVendedorCollapsed] = useState(false)

    // Estado: productos
    const [productos, setProductos] = useState<any[]>([])
    const [searchProducto, setSearchProducto] = useState<{ [idx: number]: string }>({})
    const [productDropdown, setProductDropdown] = useState<number | null>(null)
    const [searchResults, setSearchResults] = useState<any[]>([])
    const [buscando, setBuscando] = useState(false)

    // Estado: detalle
    const [detalles, setDetalles] = useState<DetalleFacturaDirecta[]>([{ ...DETALLE_VACIO }])
    const [esModoServicio, setEsModoServicio] = useState(false)

    // Estado: pagos + campo "recibido en efectivo"
    const [pagos, setPagos] = useState<PagoFactura[]>([{ metodo: 'efectivo', valor: 0, referencia: '' }])
    const [montoRecibido, setMontoRecibido] = useState<number>(0)
    const [cuentasBancarias, setCuentasBancarias] = useState<CuentaBancaria[]>([])
    const [notasCredito, setNotasCredito] = useState<any[]>([])

    // Estado: retenciones que el CLIENTE le practica a la empresa (inverso de
    // retenciones a proveedores) + observación libre del comprobante
    const [retSeccion, setRetSeccion]           = useState(false)
    const [numeroRetencion, setNumeroRetencion] = useState('')
    const [retenciones, setRetenciones]         = useState<RetLine[]>([])
    const [codigosRet, setCodigosRet]           = useState<CodigoRetencion[]>([])
    const [observacionFactura, setObservacionFactura] = useState('')

    // Estado: proceso
    const [saving, setSaving] = useState(false)
    const [facturaFinal, setFacturaFinal] = useState<any>(null)
    // Capturados en el momento exacto del save para evitar condición de carrera con el ticket
    const [ticketMontoRecibido, setTicketMontoRecibido] = useState<number | undefined>()
    const [ticketVuelto, setTicketVuelto] = useState<number | undefined>()

    // ── Draft ────────────────────────────────────────────────────
    const clearDraft = useFormDraft(
        'draft_factura_directa',
        () => ({
            selectedCliente, selectedVendedorId, selectedBodegaId, diasPlazoCredito, detalles, pagos, montoRecibido, esModoServicio,
            retenciones, numeroRetencion, observacionFactura,
        }),
        (d) => {
            if (d.selectedCliente)    setSelectedCliente(d.selectedCliente)
            if (d.selectedVendedorId) setSelectedVendedorId(d.selectedVendedorId)
            if (d.selectedBodegaId)   setSelectedBodegaId(d.selectedBodegaId)
            if (d.diasPlazoCredito)   setDiasPlazoCredito(d.diasPlazoCredito)
            if (d.detalles?.length)   setDetalles(d.detalles)
            if (d.pagos?.length)      setPagos(d.pagos)
            if (d.montoRecibido)      setMontoRecibido(d.montoRecibido)
            if (d.esModoServicio)     setEsModoServicio(d.esModoServicio)
            if (d.retenciones?.length) { setRetenciones(d.retenciones); setRetSeccion(true) }
            if (d.numeroRetencion)    setNumeroRetencion(d.numeroRetencion)
            if (d.observacionFactura) setObservacionFactura(d.observacionFactura)
        },
        [selectedCliente, selectedVendedorId, selectedBodegaId, diasPlazoCredito, detalles, pagos, montoRecibido, esModoServicio,
            retenciones, numeroRetencion, observacionFactura],
    )
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

    // Pre-carga desde preparación de pintura — carga TODOS los preps acumulados
    const PREP_IDS_KEY = `qi_prep_ids_${empresa?.id ?? ''}`
    useEffect(() => {
        if (!prepId || !empresa?.id) return
        ;(async () => {
            try {
                // Acumular el nuevo prep_id
                const stored: string[] = JSON.parse(sessionStorage.getItem(PREP_IDS_KEY) || '[]')
                const allIds = stored.includes(prepId) ? stored : [...stored, prepId]
                sessionStorage.setItem(PREP_IDS_KEY, JSON.stringify(allIds))

                // Cargar TODOS los preps acumulados (incluyendo los de sesiones anteriores)
                const prepDetalles: DetalleFacturaDirecta[] = []
                for (const pid of allIds) {
                    const prep = await preparacionPinturaService.getCompleta(pid)
                    const { data: prod } = await supabase
                        .from('productos')
                        .select('id, nombre, iva_porcentaje')
                        .eq('empresa_id', empresa!.id)
                        .ilike('codigo', prep.codigo_producto)
                        .eq('activo', true)
                        .maybeSingle()
                    prepDetalles.push({
                        producto_id:       prod?.id ?? null,
                        nombre_producto:   prep.descripcion,
                        cantidad:          1,
                        precio_unitario:   prep.precio_sin_iva ?? 0,
                        descuento:         0,
                        iva_porcentaje:    prep.iva_porcentaje,
                        subproducto_id:    null,
                        factor_conversion: 1,
                    })
                }

                // Reemplazar líneas: poner todos los preps primero, conservar líneas manuales
                setDetalles(prev => {
                    const prepNombres = new Set(prepDetalles.map(d => d.nombre_producto))
                    const manuales = prev.filter(d =>
                        (d.producto_id || d.nombre_producto.trim()) &&
                        !prepNombres.has(d.nombre_producto)
                    )
                    return [...prepDetalles, ...manuales]
                })
            } catch (e) {
                console.error('Error cargando preparación:', e)
            }
        })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prepId, empresa?.id])

    // Búsqueda en servidor con debounce
    useEffect(() => {
        if (productDropdown === null || !empresa?.id) { setSearchResults([]); return }
        const texto = (searchProducto[productDropdown] || '').trim()
        if (texto.length < 2) { setSearchResults([]); return }
        const timer = setTimeout(async () => {
            setBuscando(true)
            try {
                const pattern = '%' + texto.split(/[*]+/).filter(Boolean).join('%') + '%'
                const { data } = await supabase
                    .from('productos')
                    .select('*, subproductos(*)')
                    .eq('empresa_id', empresa!.id)
                    .eq('activo', true)
                    .or(`nombre.ilike.${pattern},codigo.ilike.${pattern}`)
                    .order('nombre')
                    .limit(50)
                setSearchResults(data ?? [])
            } catch { setSearchResults([]) }
            setBuscando(false)
        }, 300)
        return () => clearTimeout(timer)
    }, [searchProducto, productDropdown, empresa?.id])

    async function loadData() {
        try {
            // Use catalog cache (stale-while-revalidate, works offline)
            const [clientsList, prodList, vendedoresList, cuentasBanc, bodsList, puntoEmision, codigosRetList] = await Promise.all([
                catalogCacheService.getClientes(empresa!.id),
                catalogCacheService.getProductos(empresa!.id),
                isOnline ? vendedorService.getVendedoresActivos(empresa!.id).catch(() => []) : [],
                isOnline ? cuentasBancariasService.listar(empresa!.id).catch(() => []) : [],
                isOnline ? bodegaService.listar(empresa!.id).catch(() => []) : [],
                isOnline ? puntoEmisionService.resolverParaDispositivo(empresa!.id).catch(() => null) : null,
                isOnline ? codigoRetencionService.listar(empresa!.id).catch(() => []) : [],
            ])
            setClientes(clientsList)
            setProductos(prodList)
            setVendedores(vendedoresList)
            setCuentasBancarias(cuentasBanc.filter((c: CuentaBancaria) => c.estado === 'activa'))
            setBodegas(bodsList)
            setPuntoEmisionActivo(puntoEmision)
            setCodigosRet(codigosRetList.filter((c: CodigoRetencion) => c.activo))
            if (vendedoresList.length === 1) setSelectedVendedorId(vendedoresList[0].id)
            if (bodsList.length > 0 && !selectedBodegaId) {
                const principal = bodsList.find((b: Bodega) => b.es_principal) ?? bodsList[0]
                setSelectedBodegaId(principal.id)
            }

            // Consumidor final: garantizar que exista (lo crea automáticamente si fue eliminado)
            const consumidor = isOnline
                ? await facturacionService.ensureConsumidorFinal(empresa!.id)
                : (clientsList.find((c: any) => c.identificacion === '9999999999999') ?? null)
            if (consumidor) setSelectedCliente(consumidor)
        } catch (e) {
            console.error('Error cargando datos:', e)
        }
    }

    // Cargar N/C disponibles cuando cambia el cliente
    useEffect(() => {
        if (!selectedCliente?.id || !empresa?.id) { setNotasCredito([]); return }
        const q = supabase
            .from('notas_credito')
            .select('id, secuencial, saldo_nc, created_at')
            .eq('empresa_id', empresa.id)
            .eq('cliente_id', selectedCliente.id)
            .gt('saldo_nc', 0)
            .eq('estado_sri', 'AUTORIZADO')
            .order('created_at', { ascending: false })
        Promise.resolve(q)
            .then(({ data }) => setNotasCredito(data ?? []))
            .catch(() => setNotasCredito([]))
    }, [selectedCliente?.id, empresa?.id])

    // ─── CLIENTE ──────────────────────────────────────────
    const filteredClientes = clientes.filter(c =>
        coincideComodin(c.nombre ?? '', searchCliente) ||
        c.identificacion?.includes(searchCliente)
    )

    // Al elegir cliente del buscador: seleccionarlo y revisar si tiene cartera
    // vencida o por vencer (próximos 30 días) para alertar antes de facturar.
    // Consumidor Final queda excluido (no se le lleva cartera individual).
    const handleSeleccionarCliente = async (c: any) => {
        setSelectedCliente(c)
        setSearchCliente('')
        setClienteCollapsed(true)
        if (!empresa?.id || c.identificacion === '9999999999999') return
        try {
            const cartera = await carteraCxcService.getCarteraActivaPorCliente(empresa.id, c.id)
            const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
            const limite = new Date(hoy); limite.setDate(limite.getDate() + 30)
            const vencida = cartera.filter(x => x.fecha_vencimiento && new Date(x.fecha_vencimiento) < hoy)
            const porVencer = cartera.filter(x => x.fecha_vencimiento
                && new Date(x.fecha_vencimiento) >= hoy && new Date(x.fecha_vencimiento) <= limite)
            setAlertaDeuda(vencida.length || porVencer.length ? { vencida, porVencer } : null)
        } catch (e) {
            console.error('Error consultando cartera CxC del cliente:', e)
        }
    }

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
        } catch (err: any) {
            if (err?.code === '23505') {
                const { data: existente } = await supabase
                    .from('clientes').select('nombre')
                    .eq('empresa_id', empresa!.id).eq('identificacion', id)
                    .maybeSingle()
                alert(existente?.nombre
                    ? `Ese cliente ya está grabado como "${existente.nombre}".`
                    : 'Ese cliente ya está grabado.')
            } else {
                alert('Error al guardar cliente' + (err?.message ? `: ${err.message}` : ''))
            }
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

    // ─── CARGAR FACTURA ANTERIOR COMO PLANTILLA ────────────
    async function handleCargarPlantilla() {
        const partes = numeroPlantilla.trim().split('-')
        if (partes.length !== 3 || partes.some(p => !/^\d+$/.test(p))) {
            alert('Formato inválido. Escribe establecimiento-puntoEmisión-secuencial, ej: 001-002-1515')
            return
        }
        const secuencialFormateado = `${partes[0].padStart(3, '0')}-${partes[1].padStart(3, '0')}-${partes[2].padStart(9, '0')}`

        setCargandoPlantilla(true)
        try {
            const { data: comp, error } = await supabase
                .from('comprobantes')
                .select('*, clientes(*), comprobante_detalles(*), comprobante_pagos(*)')
                .eq('empresa_id', empresa!.id)
                .eq('tipo_comprobante', 'FACTURA')
                .eq('secuencial', secuencialFormateado)
                .maybeSingle()
            if (error) throw error
            if (!comp) { alert(`No se encontró ninguna factura con el número ${secuencialFormateado}.`); return }

            if (comp.clientes) setSelectedCliente(comp.clientes)

            const lineasCargadas: DetalleFacturaDirecta[] = (comp.comprobante_detalles ?? []).map((d: any) => {
                const prod = productos.find(p => p.id === d.producto_id)
                const sub = d.subproducto_id ? prod?.subproductos?.find((s: any) => s.id === d.subproducto_id) : null
                return {
                    producto_id: d.producto_id,
                    nombre_producto: d.nombre_producto,
                    cantidad: Number(d.cantidad) || 1,
                    precio_unitario: Number(d.precio_unitario) || 0,
                    descuento: Number(d.descuento) || 0,
                    iva_porcentaje: Number(d.iva_porcentaje ?? 15),
                    subproducto_id: d.subproducto_id ?? null,
                    factor_conversion: sub ? Number(sub.factor_conversion) : 1,
                    costo_promedio: prod?.costo_promedio ?? 0,
                }
            })
            if (lineasCargadas.length > 0) setDetalles(lineasCargadas)

            const pagosCargados: PagoFactura[] = (comp.comprobante_pagos ?? []).map((p: any) => ({
                metodo: p.metodo_pago,
                valor: Number(p.valor) || 0,
                referencia: p.referencia ?? '',
            }))
            if (pagosCargados.length > 0) setPagos(pagosCargados)

            setNumeroPlantilla('')
            alert(`Factura ${secuencialFormateado} cargada. Revisa los datos — al presionar "Generar Factura" se le asignará el siguiente número correcto de la serie, no este.`)
        } catch (e: any) {
            alert('Error al buscar la factura: ' + e.message)
        } finally {
            setCargandoPlantilla(false)
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
            costo_promedio: prod.costo_promedio ?? 0,
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
    const configRentabilidad: ConfigRentabilidad = (empresa as any)?.config_rentabilidad ?? DEFAULT_CONFIG_RENTABILIDAD
    const costoTotalFactura = detalles.reduce((sum, d) => sum + costoLinea(d), 0)
    const margenFacturaPct = totales.subtotal > 0 ? ((totales.subtotal - costoTotalFactura) / totales.subtotal) * 100 : null
    const semaforoFactura = configRentabilidad.activo && margenFacturaPct !== null
        ? getSemaforoRentabilidad(margenFacturaPct, configRentabilidad.umbrales)
        : null
    const totalRetenciones = retenciones.reduce((sum, r) => sum + (Number(r.valor) || 0), 0)
    // La retención rebaja lo que hay que cubrir con efectivo/tarjeta/crédito/etc.
    const totalPagado = pagos.reduce((sum, p) => sum + (Number(p.valor) || 0), 0) + totalRetenciones
    const pendiente = totales.total - totalPagado

    // Mantiene la base de las retenciones sincronizada con el subtotal/IVA
    // reales de la factura mientras se editan los productos (mismo patrón
    // que el lado de compras).
    useEffect(() => {
        if (retenciones.length === 0) return
        setRetenciones(prev => prev.map(r => {
            const base = r.tipo === 'FUENTE' ? totales.subtotal : totales.iva
            return { ...r, base, valor: Math.round(base * r.pct / 100 * 100) / 100 }
        }))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [totales.subtotal, totales.iva])
    // Vuelto solo aplica si hay pago en efectivo. Se compara el "Efectivo
    // Recibido" contra la PORCIÓN en efectivo de la factura, no contra el
    // total completo — si el pago está combinado (ej. $30 tarjeta + $20
    // efectivo), el cliente puede dar $25 en efectivo y esperar $5 de
    // vuelto, no comparar $25 contra los $50 totales (que nunca da vuelto).
    const tieneEfectivo = pagos.some(p => p.metodo === 'efectivo')
    const montoEfectivo = pagos.filter(p => p.metodo === 'efectivo').reduce((sum, p) => sum + (Number(p.valor) || 0), 0)
    const vuelto = tieneEfectivo ? Math.max(0, montoRecibido - montoEfectivo) : 0

    const autoCompletarPago = () => {
        if (pagos.length === 1) {
            setPagos([{ ...pagos[0], valor: totales.total }])
            // No auto-llenar "Efectivo Recibido" — el cajero ingresa cuánto recibió si es diferente al total
        }
    }

    // ─── FACTURAR ─────────────────────────────────────────
    const handleGenerarFactura = async () => {
        if (!selectedCliente) return alert('Seleccione un cliente')
        // Permitir sin caja si está offline (se usará la caja cacheada al sincronizar)
        if (!cajaSesion && isOnline) return alert('No hay una caja abierta. Por favor abra caja primero.')

        const esCF = selectedCliente.identificacion === '9999999999999'

        // Bloquear crédito para Consumidor Final
        if (esCF && pagos.some(p => p.metodo === 'credito')) {
            return alert('No se puede facturar a Crédito para Consumidor Final. Cambie la forma de pago.')
        }

        // Bloquear tope consumidor final
        const topeEmpresa = (empresa as any)?.tope_consumidor_final
        if (esCF && topeEmpresa && totales.total > topeEmpresa) {
            return alert(
                `El total ${formatCurrency(totales.total)} supera el tope de Consumidor Final ` +
                `(${formatCurrency(topeEmpresa)}).\n\nSolicite la identificación del cliente.`
            )
        }

        const detallesValidos = detalles.filter(d => d.nombre_producto && d.cantidad > 0 && d.precio_unitario > 0)
        if (detallesValidos.length === 0) return alert('Agregue al menos un producto o servicio con cantidad y precio')

        // Fuera de modo Servicio, todos los ítems deben venir del catálogo
        if (!esModoServicio) {
            const sinCatalogo = detallesValidos.find(d => !d.producto_id)
            if (sinCatalogo) {
                return alert(
                    `"${sinCatalogo.nombre_producto}" no está seleccionado del catálogo de artículos.\n\n` +
                    `Busque y seleccione el artículo de la lista desplegable.\n` +
                    `Si necesita facturar un servicio sin artículo, active el modo "Servicio".`
                )
            }
        }

        // Validar N/C: no exceder saldo disponible
        for (const p of pagos.filter(pg => pg.metodo === 'nota_credito' && pg.nota_credito_id)) {
            const nc = notasCredito.find(n => n.id === p.nota_credito_id)
            if (nc && p.valor > nc.saldo_nc) {
                return alert(`El monto de N/C (${formatCurrency(p.valor)}) supera el saldo disponible (${formatCurrency(nc.saldo_nc)}).`)
            }
        }

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
                        observaciones: observacionFactura || undefined,
                        retenciones: retenciones.filter(r => r.valor > 0) as RetencionFactura[],
                        numero_retencion: numeroRetencion || undefined,
                        created_by: profile?.id ?? null,
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
        // Capturar monto recibido y vuelto ANTES del save (estado puede cambiar después)
        const _efectivoSum = pagos.filter(p => p.metodo === 'efectivo').reduce((s, p) => s + Number(p.valor), 0)
        const _tieneEfectivo = pagos.some(p => p.metodo === 'efectivo')
        const _mRecibido = _tieneEfectivo ? (montoRecibido > 0 ? montoRecibido : _efectivoSum) : undefined
        // Contra la porción en efectivo (_efectivoSum), no el total de la
        // factura — igual que el `vuelto` en pantalla (ver arriba).
        const _mVuelto = _tieneEfectivo ? Math.max(0, (_mRecibido ?? 0) - _efectivoSum) : undefined

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
                bodega_id: selectedBodegaId || null,
                observaciones: observacionFactura || undefined,
                retenciones: retenciones.filter(r => r.valor > 0) as RetencionFactura[],
                numero_retencion: numeroRetencion || undefined,
                created_by: profile?.id ?? null,
            })

            const facturaCompleta = await facturaDirectaService.getComprobanteCompleto(factura.id)
            clearDraft()
            setTicketMontoRecibido(_mRecibido)
            setTicketVuelto(_mVuelto)
            setFacturaFinal(facturaCompleta)
            // Vincular todos los preparados acumulados en esta factura
            const prepIds: string[] = JSON.parse(sessionStorage.getItem(PREP_IDS_KEY) || '[]')
            sessionStorage.removeItem(PREP_IDS_KEY)
            for (const pid of prepIds) {
                preparacionPinturaService.vincularComprobante(pid, factura.id).catch(console.error)
            }
        } catch (e: any) {
            alert('Error al generar factura: ' + e.message)
        } finally {
            setSaving(false)
        }
    }

    const handleNuevaFactura = () => {
        setFacturaFinal(null)
        setTicketMontoRecibido(undefined)
        setTicketVuelto(undefined)
        setOfflineSaved(false)
        setDetalles([{ ...DETALLE_VACIO }])
        setPagos([{ metodo: 'efectivo', valor: 0, referencia: '' }])
        setMontoRecibido(0)
        setRetenciones([])
        setNumeroRetencion('')
        setRetSeccion(false)
        setObservacionFactura('')
        setSearchCliente('')
        setSearchProducto({})
        sessionStorage.removeItem(PREP_IDS_KEY)
        // Mantener vendedor seleccionado entre facturas
        setDiasPlazoCredito(30)
        const cf = clientes.find(c => c.identificacion === '9999999999999')
        setSelectedCliente(cf || null)
    }

    // ─── MODO SERVICIO ────────────────────────────────────
    function toggleModoServicio(activar: boolean) {
        if (activar && detalles.some(d => d.producto_id)) {
            if (!window.confirm('Al cambiar a modo Servicios se limpiarán las líneas actuales. ¿Continuar?')) return
        }
        setEsModoServicio(activar)
        setDetalles([{ ...DETALLE_VACIO, producto_id: null }])
        setSearchProducto({})
    }

    // ─── VOICE ASSISTANT ──────────────────────────────────
    function handleVoiceApply(result: VoiceResult) {
        // Auto-activar modo según tipo detectado por voz
        if (result.tipo === 'servicios') setEsModoServicio(true)
        else if (result.tipo === 'inventario') setEsModoServicio(false)

        // Pre-llenar cliente
        if (result.cliente.existe && result.cliente.id) {
            const c = clientes.find(x => x.id === result.cliente.id)
            if (c) setSelectedCliente(c)
        } else if (!result.cliente.existe && result.cliente.nombre) {
            setNewClient({
                identificacion: result.cliente.identificacion ?? '',
                nombre:         result.cliente.nombre,
                email:          '',
                direccion:      '',
                telefono:       '',
            })
            setIsClientFormOpen(true)
        }

        // Pre-llenar ítem (solo servicios; inventario requiere selección manual)
        if (result.tipo === 'servicios' && result.item.nombre) {
            if (result.item.existe && result.item.id) {
                // Producto existente
                const prod = productos.find(p => p.id === result.item.id)
                if (prod) {
                    setDetalles([{
                        producto_id: prod.id,
                        nombre_producto: prod.nombre,
                        cantidad: result.item.cantidad || 1,
                        precio_unitario: result.item.precio_unitario || prod.precio_venta,
                        descuento: 0,
                        iva_porcentaje: result.item.iva_porcentaje ?? prod.iva_porcentaje ?? 15,
                        subproducto_id: null,
                        factor_conversion: 1,
                    }])
                }
            } else {
                // Servicio libre (no está en el catálogo)
                setDetalles([{
                    producto_id: null,
                    nombre_producto: result.item.nombre,
                    cantidad: result.item.cantidad || 1,
                    precio_unitario: result.item.precio_unitario || 0,
                    descuento: 0,
                    iva_porcentaje: result.item.iva_porcentaje ?? 15,
                    subproducto_id: null,
                    factor_conversion: 1,
                }])
            }
        }
    }

    // ─── RENDER ───────────────────────────────────────────
    return (
        <>
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <FilePlus className="w-7 h-7 text-primary-600" />
                        Nueva Factura
                    </h1>
                    <p className="text-slate-500 text-sm">Facturación electrónica directa de artículos y servicios</p>
                </div>
                <div className="flex items-center gap-2 self-start">
                    <HelpButton pageKey="factura-directa" />
                </div>

                {/* ── Selector Factura / Proforma ── */}
                <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit self-start md:self-auto">
                    <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-white shadow text-primary-700 cursor-default">
                        <FilePlus className="w-4 h-4" />
                        Factura
                    </button>
                    <Link
                        to="/proformas"
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-slate-500 hover:text-slate-700 hover:bg-white/60 transition-colors"
                    >
                        <FileText className="w-4 h-4" />
                        Proforma
                    </Link>
                </div>
                <div className="flex flex-col items-start md:items-end gap-2">
                    {cajaSesion && (
                        <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold border border-emerald-100">
                            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                            Caja abierta · {profile?.nombre}
                        </span>
                    )}
                    {puntoEmisionActivo && (
                        <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-bold border border-indigo-100"
                            title={puntoEmisionActivo.nombre}>
                            <Printer className="w-3.5 h-3.5" />
                            Serie {puntoEmisionActivo.establecimiento}-{puntoEmisionActivo.punto_emision}
                        </span>
                    )}
                </div>
            </div>

            {/* ── CARGAR FACTURA ANTERIOR COMO PLANTILLA ── */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-slate-700 shrink-0">
                        <Copy className="w-4 h-4 text-primary-500" />
                        Repetir factura anterior
                    </div>
                    <input
                        type="text"
                        value={numeroPlantilla}
                        onChange={e => setNumeroPlantilla(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCargarPlantilla() } }}
                        placeholder="001-002-1515"
                        className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono outline-none focus:ring-2 focus:ring-primary-400"
                    />
                    <button
                        onClick={handleCargarPlantilla}
                        disabled={cargandoPlantilla || !numeroPlantilla.trim()}
                        className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 shrink-0"
                    >
                        {cargandoPlantilla ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        Cargar
                    </button>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                    Trae cliente, detalle y forma de pago de una factura ya emitida, para clientes que compran lo mismo seguido — no repite el número, la nueva factura sale con la siguiente serie correcta.
                </p>
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
                                            <input data-sentinel="search-cliente-factura" type="text" placeholder="Buscar por identificación o nombre..."
                                                className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                                                value={searchCliente}
                                                onChange={e => setSearchCliente(e.target.value)} />
                                        </div>
                                        {searchCliente && (
                                            <div className="absolute z-20 w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-2xl max-h-56 overflow-y-auto">
                                                {filteredClientes.map(c => (
                                                    <button key={c.id}
                                                        className="w-full px-4 py-3 text-left hover:bg-slate-50 flex justify-between items-center border-b border-slate-50 last:border-0 text-sm"
                                                        onClick={() => handleSeleccionarCliente(c)}>
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

                                {/* Bodega de despacho */}
                                {bodegas.length > 0 && (
                                    <div>
                                        <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Bodega de despacho</label>
                                        <select
                                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                                            value={selectedBodegaId}
                                            onChange={e => setSelectedBodegaId(e.target.value)}
                                        >
                                            <option value="">— Sin bodega específica —</option>
                                            {bodegas.map(b => (
                                                <option key={b.id} value={b.id}>
                                                    {b.codigo ? `[${b.codigo}] ` : ''}{b.nombre}{b.es_principal ? ' ★' : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}

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
                        <div className="flex items-center justify-between flex-wrap gap-3">
                            <h2 className="font-bold text-slate-900 flex items-center gap-2">
                                <Package className="w-5 h-5 text-primary-500" />
                                {esModoServicio ? 'Detalle de Servicios' : 'Detalle de Artículos / Servicios'}
                            </h2>
                            <div className="flex items-center gap-4">
                                {/* Toggle modo servicio */}
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <div
                                        onClick={() => toggleModoServicio(!esModoServicio)}
                                        className={cn(
                                            'relative w-10 h-5 rounded-full transition-colors duration-200',
                                            esModoServicio ? 'bg-primary-600' : 'bg-slate-300'
                                        )}
                                    >
                                        <span className={cn(
                                            'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200',
                                            esModoServicio ? 'left-5' : 'left-0.5'
                                        )} />
                                    </div>
                                    <span className="text-sm font-medium text-slate-600">
                                        Factura de Servicios
                                    </span>
                                </label>
                                <button onClick={addLinea}
                                    className="text-primary-600 hover:text-primary-700 flex items-center gap-1 text-sm font-bold">
                                    <Plus className="w-4 h-4" /> Agregar línea
                                </button>
                                {permisos.perm_preparaciones_pintura && (
                                    <button onClick={() => navigate('/preparaciones-pintura/nueva?origen=factura')}
                                        className="text-violet-600 hover:text-violet-700 p-1.5 -m-1.5 rounded-lg hover:bg-violet-50 transition-colors"
                                        title="Preparar Pintura">
                                        <PaintBucket className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Encabezados numéricos — se muestran inline con cada línea */}

                        <div className="space-y-3">
                            {detalles.map((det, idx) => {
                                const linea = det.cantidad > 0 && det.precio_unitario > 0 ? calcularLinea(det) : null
                                const margenLinea = configRentabilidad.activo && linea ? calcularMargenLinea(det) : null
                                const semaforoLinea = margenLinea ? getSemaforoRentabilidad(margenLinea.margenPct, configRentabilidad.umbrales) : null
                                const filtProd = productDropdown === idx ? searchResults : []

                                return (
                                    <div key={idx} className="bg-slate-50 rounded-xl p-3 border border-slate-100 animate-in fade-in space-y-2">
                                        {/* FILA 1: Descripción / Buscador — ancho completo */}
                                        <div className="relative flex gap-2">
                                            <div className="flex-1 relative">
                                                {esModoServicio ? (
                                                    <textarea
                                                        placeholder="Descripción del servicio prestado..."
                                                        rows={2}
                                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white outline-none focus:ring-2 focus:ring-primary-400 resize-y"
                                                        value={det.nombre_producto}
                                                        onChange={e => updateLinea(idx, 'nombre_producto', e.target.value)}
                                                    />
                                                ) : (
                                                    <>
                                                    <input
                                                        placeholder="Buscar: riel*45*luxus ..."
                                                        className={`w-full px-3 py-2 rounded-lg border text-sm bg-white outline-none focus:ring-2 ${
                                                            det.nombre_producto && !det.producto_id
                                                                ? 'border-red-400 focus:ring-red-400 bg-red-50'
                                                                : det.producto_id
                                                                    ? 'border-emerald-300 focus:ring-primary-400'
                                                                    : 'border-slate-200 focus:ring-primary-400'
                                                        }`}
                                                        value={searchProducto[idx] !== undefined ? searchProducto[idx] : det.nombre_producto}
                                                        onChange={e => {
                                                            setSearchProducto(prev => ({ ...prev, [idx]: e.target.value }))
                                                            // Resetear producto_id al escribir manualmente
                                                            setDetalles(prev => prev.map((d, i) => i !== idx ? d : {
                                                                ...d,
                                                                nombre_producto: e.target.value,
                                                                producto_id: null,
                                                            }))
                                                            setProductDropdown(idx)
                                                        }}
                                                        onFocus={() => {
                                                            setSearchProducto(prev => ({ ...prev, [idx]: '' }))
                                                            setProductDropdown(idx)
                                                        }}
                                                        onBlur={() => setTimeout(() => {
                                                            setProductDropdown(null)
                                                            setSearchProducto(prev => {
                                                                const updated = { ...prev }
                                                                delete updated[idx]
                                                                return updated
                                                            })
                                                        }, 250)}
                                                    />
                                                    {productDropdown === idx && buscando && (
                                                        <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-sm text-slate-400 flex items-center gap-2">
                                                            <Loader2 className="w-4 h-4 animate-spin" /> Buscando...
                                                        </div>
                                                    )}
                                                    {productDropdown === idx && !buscando && filtProd.length > 0 && (
                                                        <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-80 overflow-y-auto">
                                                            <div className="sticky top-0 bg-slate-50 px-3 py-1 text-[10px] text-slate-400 font-bold border-b">
                                                                {filtProd.length} resultado{filtProd.length !== 1 ? 's' : ''}
                                                            </div>
                                                            {filtProd.map(p => (
                                                                <button key={p.id} type="button"
                                                                    className="w-full px-4 py-2 text-left hover:bg-primary-50 flex justify-between items-center text-sm border-b border-slate-50 last:border-0"
                                                                    onMouseDown={e => { e.preventDefault(); selectProducto(idx, p); setProductDropdown(null) }}>
                                                                    <div className="flex-1 min-w-0 mr-3">
                                                                        <div className="font-medium text-slate-800">{p.nombre}</div>
                                                                        {p.codigo && <div className="text-xs text-slate-400 font-mono">{p.codigo}</div>}
                                                                    </div>
                                                                    <span className="flex flex-col items-end shrink-0">
                                                                        <span className="text-primary-600 font-bold text-xs">{formatCurrency(p.precio_venta)} <span className="font-normal text-slate-400">sin IVA</span></span>
                                                                        <span className="text-slate-600 text-xs">{formatCurrency(p.precio_venta * (1 + (p.iva_porcentaje ?? 0) / 100))} <span className="text-slate-400">con IVA</span></span>
                                                                        <span className="text-slate-500 text-xs">Stock: {p.stock ?? 0}</span>
                                                                    </span>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                    </>
                                                )}
                                            </div>
                                            <button onClick={() => removeLinea(idx)} disabled={detalles.length === 1}
                                                className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-20 shrink-0 self-start">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>

                                        {/* Selector de presentación (subproducto) */}
                                        {!esModoServicio && (() => {
                                            const prod = productos.find(p => p.id === det.producto_id)
                                            const subsActivos = (prod?.subproductos || []).filter((s: any) => s.estado)
                                            if (subsActivos.length === 0) return null
                                            return (
                                                <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5">
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
                                            )
                                        })()}

                                        {/* FILA 2: Cantidad | Precio | Desc% | IVA% | Total */}
                                        <div className="grid grid-cols-12 gap-2 items-center">
                                            {/* Cantidad */}
                                            <div className="col-span-4 md:col-span-3">
                                                <label className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5 md:hidden">Cantidad</label>
                                                <input type="number" min="0.01" step="0.01"
                                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-base font-bold text-center bg-white outline-none focus:ring-2 focus:ring-primary-400"
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
                                            <div className="col-span-4 md:col-span-3">
                                                <label className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5 md:hidden">P. Unit.</label>
                                                <div className="relative">
                                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                                                    <input type="number" min="0" step="0.01"
                                                        className="w-full pl-5 pr-2 py-2 rounded-lg border border-slate-200 text-sm text-right bg-white outline-none focus:ring-2 focus:ring-primary-400"
                                                        value={det.precio_unitario}
                                                        onChange={e => updateLinea(idx, 'precio_unitario', parseFloat(e.target.value) || 0)} />
                                                </div>
                                            </div>

                                            {/* Descuento % */}
                                            <div className="col-span-4 md:col-span-2">
                                                <label className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5 md:hidden">Desc%</label>
                                                <div className="relative">
                                                    <input type="number" min="0" max="100" step="0.1"
                                                        className="w-full px-2 py-2 rounded-lg border border-slate-200 text-sm text-center bg-white outline-none focus:ring-2 focus:ring-primary-400"
                                                        value={det.descuento}
                                                        onChange={e => updateLinea(idx, 'descuento', parseFloat(e.target.value) || 0)} />
                                                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">%</span>
                                                </div>
                                            </div>

                                            {/* IVA % */}
                                            <div className="col-span-6 md:col-span-2">
                                                <label className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5 md:hidden">IVA%</label>
                                                <select
                                                    className="w-full px-2 py-2 rounded-lg border border-slate-200 text-sm text-center bg-white outline-none focus:ring-2 focus:ring-primary-400"
                                                    value={det.iva_porcentaje}
                                                    onChange={e => updateLinea(idx, 'iva_porcentaje', parseFloat(e.target.value))}>
                                                    <option value={0}>0%</option>
                                                    <option value={5}>5%</option>
                                                    <option value={15}>15%</option>
                                                </select>
                                            </div>

                                            {/* Total línea */}
                                            <div className="col-span-6 md:col-span-2 flex flex-col items-end justify-center gap-0.5">
                                                <span className="text-sm font-bold text-primary-700">
                                                    {linea ? formatCurrency(linea.total) : '—'}
                                                </span>
                                                {semaforoLinea && (
                                                    <span
                                                        className="text-[10px] font-bold whitespace-nowrap"
                                                        title={semaforoLinea.label}
                                                    >
                                                        {semaforoLinea.emoji}
                                                        {configRentabilidad.mostrarTasa && ` ${margenLinea!.margenPct.toFixed(1)}%`}
                                                    </span>
                                                )}
                                            </div>
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
                    <div data-sentinel="seccion-pagos-factura" className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
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
                                <div key={i} className="space-y-1.5 animate-in fade-in">
                                    <div className="flex gap-2 items-center">
                                        <select
                                            className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-primary-400 bg-white"
                                            value={p.metodo}
                                            onChange={e => {
                                                updatePago(i, 'metodo', e.target.value as PagoFactura['metodo'])
                                                if (e.target.value !== 'nota_credito') updatePago(i, 'nota_credito_id', null)
                                            }}>
                                            {METODOS_PAGO.filter(m => !m.cfBlocked || selectedCliente?.identificacion !== '9999999999999').map(m => (
                                                <option key={m.value} value={m.value}>{m.label}</option>
                                            ))}
                                        </select>
                                        <div className="relative w-[calc(10rem+2cm)]">
                                            <input type="number" min="0" step="0.01"
                                                className="w-full pl-2 pr-2 py-2.5 rounded-lg border-2 border-primary-200 text-sm font-bold outline-none focus:ring-2 focus:ring-primary-400 text-right"
                                                value={p.valor}
                                                onChange={e => {
                                                    const val = parseFloat(e.target.value) || 0
                                                    updatePago(i, 'valor', val)
                                                    // Sincronizar "Efectivo Recibido" solo cuando el pago es 100% efectivo
                                                    // (un único método) — si está combinado con otros métodos, no pisar
                                                    // lo que el cajero ya escribió ahí manualmente.
                                                    if (p.metodo === 'efectivo' && pagos.length === 1) {
                                                        setMontoRecibido(val > totales.total ? val : 0)
                                                    }
                                                }} />
                                        </div>
                                        <button onClick={() => removePago(i)} disabled={pagos.length === 1}
                                            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-20">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                    {/* Cuenta bancaria destino — solo transferencia */}
                                    {p.metodo === 'transferencia' && (
                                        <select
                                            className="w-full px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 text-xs outline-none focus:ring-2 focus:ring-blue-400 text-blue-900"
                                            value={p.cuenta_bancaria_id ?? ''}
                                            onChange={e => {
                                                const cb = cuentasBancarias.find(c => c.id === e.target.value)
                                                const label = cb ? `${cb.banco?.nombre ?? ''} — ${cb.numero_cuenta}` : ''
                                                updatePago(i, 'cuenta_bancaria_id', e.target.value || null)
                                                updatePago(i, 'cuenta_bancaria_contable_id', cb?.cuenta_contable_id ?? null)
                                                updatePago(i, 'referencia', label || p.referencia || '')
                                            }}
                                        >
                                            <option value="">🏦 Cuenta bancaria destino…</option>
                                            {cuentasBancarias.map(cb => (
                                                <option key={cb.id} value={cb.id}>
                                                    {cb.banco?.nombre} — {cb.numero_cuenta}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    {/* Referencia / N° cheque */}
                                    {(p.metodo === 'cheque' || p.metodo === 'cheque_fecha' || p.metodo === 'tarjeta') && (
                                        <input type="text"
                                            placeholder={p.metodo === 'tarjeta' ? 'Últimos 4 dígitos…' : 'N° de cheque…'}
                                            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:ring-2 focus:ring-primary-400 bg-white"
                                            value={p.referencia ?? ''}
                                            onChange={e => updatePago(i, 'referencia', e.target.value)}
                                        />
                                    )}
                                    {/* Transferencia: N° de comprobante y observaciones */}
                                    {p.metodo === 'transferencia' && (
                                        <div className="grid grid-cols-2 gap-1.5">
                                            <input type="text"
                                                placeholder="N° comprobante transferencia"
                                                className="px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-xs outline-none focus:ring-2 focus:ring-blue-400 text-blue-900"
                                                value={p.numero_documento ?? ''}
                                                onChange={e => updatePago(i, 'numero_documento', e.target.value || null)}
                                            />
                                            <input type="text"
                                                placeholder="Observaciones"
                                                className="px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-xs outline-none focus:ring-2 focus:ring-blue-400 text-blue-900"
                                                value={p.observaciones ?? ''}
                                                onChange={e => updatePago(i, 'observaciones', e.target.value || null)}
                                            />
                                        </div>
                                    )}
                                    {/* Nota de Crédito: selector de NC disponibles */}
                                    {p.metodo === 'nota_credito' && (
                                        <div className="space-y-1">
                                            <select
                                                className="w-full px-3 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-xs outline-none focus:ring-2 focus:ring-violet-400 text-violet-900"
                                                value={p.nota_credito_id ?? ''}
                                                onChange={e => {
                                                    const nc = notasCredito.find(n => n.id === e.target.value)
                                                    setPagos(prev => prev.map((pg, j) => {
                                                        if (j !== i) return pg
                                                        if (!nc) return { ...pg, nota_credito_id: null }
                                                        const otrosPagos = prev.reduce((s, p2, k) => k !== i ? s + Number(p2.valor || 0) : s, 0)
                                                        const restante = Math.max(0, totales.total - otrosPagos)
                                                        return {
                                                            ...pg,
                                                            nota_credito_id: nc.id,
                                                            valor: Math.round(Math.min(nc.saldo_nc, restante || nc.saldo_nc) * 100) / 100,
                                                        }
                                                    }))
                                                }}
                                            >
                                                <option value="">🔖 Seleccionar N/C…</option>
                                                {notasCredito.map(nc => (
                                                    <option key={nc.id} value={nc.id}>
                                                        {nc.secuencial} — Saldo: {formatCurrency(nc.saldo_nc)}
                                                    </option>
                                                ))}
                                            </select>
                                            {notasCredito.length === 0 && (
                                                <p className="text-[10px] text-violet-500">No hay Notas de Crédito con saldo disponible para este cliente.</p>
                                            )}
                                        </div>
                                    )}
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

                    {/* ── OBSERVACIÓN ───────────────────── */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-2">
                        <h2 className="font-bold text-slate-900 text-sm">Observación</h2>
                        <textarea
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-primary-400 resize-none"
                            rows={2}
                            maxLength={500}
                            placeholder="Nota libre — se imprime en el ticket y en el RIDE"
                            value={observacionFactura}
                            onChange={e => setObservacionFactura(e.target.value)}
                        />
                    </div>

                    {/* ── RETENCIONES DEL CLIENTE ───────── */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        <button onClick={() => setRetSeccion(v => !v)}
                            className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors">
                            <div className="flex items-center gap-2">
                                <h2 className="font-bold text-slate-900 text-sm">Retenciones del cliente</h2>
                                {totalRetenciones > 0 && (
                                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                                        {retenciones.filter(r => r.valor > 0).length} ret. — {formatCurrency(totalRetenciones)}
                                    </span>
                                )}
                            </div>
                            {retSeccion ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </button>
                        {retSeccion && (
                            <div className="p-6 pt-0 border-t border-slate-100">
                                <p className="text-xs text-slate-400 mb-2">
                                    Si el cliente no trae los datos de la retención en el momento, deja esta sección vacía — el valor quedará como Crédito y se podrá bajar después desde Cartera cuando llegue el comprobante físico.
                                </p>
                                <RetencionesEditor
                                    numeroRetencion={numeroRetencion}
                                    onChangeNumero={setNumeroRetencion}
                                    retenciones={retenciones}
                                    onChange={setRetenciones}
                                    baseDefault={totales.subtotal}
                                    baseIva={totales.iva}
                                    codigos={codigosRet}
                                />
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
                            {semaforoFactura && (
                                <div className="flex justify-between items-center bg-slate-50 rounded-lg px-3 py-2">
                                    <span className="text-slate-500 text-xs font-bold">Rentabilidad de la factura</span>
                                    <span className="font-bold text-xs" title={semaforoFactura.label}>
                                        {semaforoFactura.emoji} {semaforoFactura.label}
                                        {configRentabilidad.mostrarTasa && margenFacturaPct !== null && ` (${margenFacturaPct.toFixed(1)}%)`}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="border-t border-slate-100 pt-3 space-y-2 text-sm">
                            {totalRetenciones > 0 && (
                                <div className="flex justify-between text-amber-700">
                                    <span>Retenciones del cliente</span>
                                    <span className="font-medium">-{formatCurrency(totalRetenciones)}</span>
                                </div>
                            )}
                            <div className="flex justify-between">
                                <span className="text-slate-500">Distribuido (pagos + retenciones)</span>
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

                        {/* Punto de emisión que se va a usar — visible justo antes de
                            confirmar, para que el cajero pueda verificarlo antes de facturar. */}
                        {puntoEmisionActivo && (
                            <div className="flex items-center justify-center gap-2 text-xs font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg py-2">
                                <Printer className="w-3.5 h-3.5" />
                                Se facturará con: {puntoEmisionActivo.establecimiento}-{puntoEmisionActivo.punto_emision} · {puntoEmisionActivo.nombre}
                            </div>
                        )}

                        {/* Botón Facturar */}
                        <button
                            data-sentinel="btn-generar-factura"
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
                        <InvoiceTicketPOS
                            factura={facturaFinal}
                            montoRecibido={ticketMontoRecibido}
                            vuelto={ticketVuelto}
                        />
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

            {/* ── MODAL ALERTA DE CARTERA PENDIENTE ──────── */}
            {alertaDeuda && (
                <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4 z-[60] overflow-y-auto">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8 space-y-5 animate-in zoom-in-95 duration-300">
                        <div className="text-center space-y-2">
                            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
                                <svg className="w-9 h-9" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                                </svg>
                            </div>
                            <h2 className="text-xl font-black text-slate-900">Cliente con cartera pendiente</h2>
                            <p className="text-slate-500 text-sm">
                                <strong>{selectedCliente?.nombre}</strong> tiene facturas pendientes de cobro.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                                <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest">Vencida</p>
                                <p className="text-xl font-black text-red-700">
                                    {formatCurrency(alertaDeuda.vencida.reduce((s, c) => s + Number(c.saldo), 0))}
                                </p>
                            </div>
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Por vencer (30 días)</p>
                                <p className="text-xl font-black text-amber-700">
                                    {formatCurrency(alertaDeuda.porVencer.reduce((s, c) => s + Number(c.saldo), 0))}
                                </p>
                            </div>
                        </div>

                        <div className="max-h-52 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-50">
                            {[...alertaDeuda.vencida, ...alertaDeuda.porVencer].map(c => (
                                <div key={c.id} className="flex items-center justify-between px-4 py-2 text-sm">
                                    <div>
                                        <p className="font-bold text-slate-800">Fact. {c.comprobantes?.secuencial || '—'}</p>
                                        <p className="text-xs text-slate-400">Vence {c.fecha_vencimiento}</p>
                                    </div>
                                    <p className={cn('font-bold', c.fecha_vencimiento && new Date(c.fecha_vencimiento) < new Date() ? 'text-red-600' : 'text-amber-600')}>
                                        {formatCurrency(Number(c.saldo))}
                                    </p>
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => { setSelectedCliente(null); setAlertaDeuda(null) }}
                                className="py-3 bg-white border border-slate-200 rounded-2xl font-bold text-slate-600 hover:bg-slate-50">
                                Cancelar
                            </button>
                            <button onClick={() => setAlertaDeuda(null)}
                                className="py-3 bg-primary-600 text-white rounded-2xl font-bold hover:bg-primary-700">
                                Continuar de todas formas
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* Asistente de voz flotante */}
        {vozIaHabilitada && (
            <VoiceAssistant
                clientes={clientes}
                servicios={productos}
                onApply={handleVoiceApply}
                empresaId={empresa!.id}
            />
        )}
        </>
    )
}
