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
import { ventaPaService } from '../services/ventaPaService'
import { facturaEnVivoService } from '../services/facturaEnVivoService'
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
import { formatCurrency } from '../lib/utils'
import {
    Search, UserPlus, Plus, Trash2, X, Save,
    CheckCircle2, Loader2, FilePlus, FileText, CreditCard,
    Package, Printer, User, Briefcase, ChevronDown, ChevronUp,
    Layers, RotateCw, PaintBucket, Copy, Barcode, Pencil, History,
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
    { value: 'plan_acumulativo', label: '📋 Plan Acumulativo (PA)', cfBlocked: true },
    { value: 'nota_credito', label: '🔖 Nota de Crédito' },
    { value: 'cheque',       label: '✏️ Cheque al día' },
    { value: 'cheque_fecha', label: '📅 Cheque a fecha' },
    { value: 'otros',        label: '🔄 Otros' },
]


// Permite usar * como comodín (ej. "Erne*Eg") al buscar cliente por nombre,
// igual que ya funciona en los buscadores de productos.
function calcularVencimiento(dias: number): string {
    const f = new Date()
    f.setDate(f.getDate() + dias)
    return f.toISOString().split('T')[0]
}

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

// Busca en el catálogo ya cargado en el dispositivo (offline u respaldo si
// falla la consulta al servidor). Replica el mismo comportamiento del ILIKE
// con comodines '*' que usa la búsqueda en servidor: cada segmento debe
// aparecer en orden dentro del nombre o código.
function escapeRegExp(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

function filtrarProductosLocal(lista: any[], texto: string): any[] {
    const segmentos = texto.split(/[*]+/).filter(Boolean)
    if (segmentos.length === 0) return []
    const regex = new RegExp(segmentos.map(escapeRegExp).join('.*'), 'i')
    return lista.filter(p => regex.test(p.nombre ?? '') || regex.test(p.codigo ?? '')).slice(0, 50)
}

// ─── Comprobante de venta Plan Acumulativo (80mm, NO es factura electrónica) ─

function escPA(s: string | null | undefined): string {
    if (!s) return ''
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function n2PA(n: number): string { return (n ?? 0).toFixed(2) }

interface DatosVentaPaTicket {
    empresa: { nombre: string; ruc: string; logo_url?: string | null }
    cliente: { nombre: string; identificacion: string }
    vendedorNombre?: string | null
    detalles: DetalleFacturaDirecta[]
    saldoTotalPendiente: number
}

function generarHtml80mmVentaPa(d: DatosVentaPaTicket): string {
    const fecha = new Date().toLocaleString('es-EC')
    const totales = calcularTotalesFactura(d.detalles)
    const filas = d.detalles.filter(x => x.cantidad > 0 && x.precio_unitario > 0).map(det => {
        const l = calcularLinea(det)
        return `
        <tr>
          <td style="padding:2px 0">${escPA(det.nombre_producto)}<br>
            <span style="font-size:8pt;color:#555">${n2PA(det.cantidad)} x $${n2PA(det.precio_unitario)}${det.descuento > 0 ? ` (-${det.descuento}%)` : ''}</span>
          </td>
          <td style="text-align:right;font-weight:bold;white-space:nowrap;padding:2px 0 2px 6px">$${n2PA(l.subtotal_neto)}</td>
        </tr>`
    }).join('')

    const logoHtml = d.empresa.logo_url
        ? `<div class="c" style="margin-bottom:4px"><img src="${escPA(d.empresa.logo_url)}" alt="Logo" style="width:60mm;max-height:35mm;object-fit:contain"></div>`
        : ''

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Comprobante Plan Acumulativo</title>
<style>
  @page{margin:0;size:80mm auto}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Courier New',Courier,monospace;font-size:8pt;color:#000;width:72mm;padding-left:2mm}
  .c{text-align:center}
  .b{font-weight:bold}
  .emp{font-size:10.5pt;font-weight:900;text-align:center}
  .sep{border:none;border-top:1px dashed #000;margin:4px 0}
  table{width:100%;border-collapse:collapse}
  td{vertical-align:top}
  .tot-lbl{width:55%}
  .tot-val{width:45%;text-align:right;font-weight:bold}
  .gran-total td{border-top:1px solid #000;padding-top:3px;font-size:9.5pt;font-weight:900}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style>
</head>
<body>
${logoHtml}
<div class="emp">${escPA(d.empresa.nombre)}</div>
<div class="c" style="font-size:7.5pt">RUC: ${escPA(d.empresa.ruc)}</div>
<hr class="sep">
<div class="c b" style="font-size:9pt">COMPROBANTE DE VENTA</div>
<div class="c b" style="font-size:8pt">PLAN ACUMULATIVO</div>
<div class="c" style="font-size:7.5pt">${escPA(fecha)}</div>
<hr class="sep">
<div><span class="b">Cliente:</span> ${escPA(d.cliente.nombre)}</div>
<div><span class="b">RUC/CI:</span> ${escPA(d.cliente.identificacion)}</div>
${d.vendedorNombre ? `<div><span class="b">Vendedor:</span> ${escPA(d.vendedorNombre)}</div>` : ''}
<hr class="sep">
<table>
  <tbody>
    ${filas || '<tr><td colspan="2" style="text-align:center">Sin ítems</td></tr>'}
  </tbody>
</table>
<hr class="sep">
<table>
  <tr><td class="tot-lbl">Subtotal</td><td class="tot-val">$${n2PA(totales.subtotal)}</td></tr>
  ${totales.descuentos > 0 ? `<tr><td class="tot-lbl">Descuentos</td><td class="tot-val">-$${n2PA(totales.descuentos)}</td></tr>` : ''}
  <tr><td class="tot-lbl">IVA</td><td class="tot-val">$${n2PA(totales.iva)}</td></tr>
  <tr class="gran-total"><td class="tot-lbl">TOTAL VENTA</td><td class="tot-val">$${n2PA(totales.total)}</td></tr>
</table>
<hr class="sep">
<div class="c b" style="font-size:8pt">Saldo total pendiente: $${n2PA(d.saldoTotalPendiente)}</div>
<hr class="sep">
<div class="c" style="font-size:7pt">Este comprobante NO es una factura electrónica.</div>
<div class="c" style="font-size:7pt">Registro interno de Plan Acumulativo — sin validez tributaria.</div>
<div class="c" style="font-size:7pt">Se factura al SRI cuando el cliente cancele el saldo total.</div>
</body>
</html>`
}

function imprimirComprobantePA(d: DatosVentaPaTicket) {
    const html = generarHtml80mmVentaPa(d)
    const win = window.open('', '_blank', 'width=900,height=700')
    if (win) {
        win.document.write(html)
        win.document.close()
        win.focus()
        setTimeout(() => { win.print() }, 450)
    }
}

export function FacturaDirectaPage() {
    const [searchParams] = useSearchParams()
    const navigate = useNavigate()
    const prepId = searchParams.get('prep_id')
    const draftEnVivoId = searchParams.get('draft_en_vivo')
    const { empresa, cajaSesion, profile, permisos, isAdmin } = useAuth()
    const { enabled: vozIaHabilitada } = useIaFeatureEnabled('voz')
    const { isOnline } = useNetworkStatus()
    const [offlineSaved, setOfflineSaved] = useState(false)

    // Estado: cliente
    const [clientes, setClientes] = useState<any[]>([])
    const [searchCliente, setSearchCliente] = useState('')
    const [selectedCliente, setSelectedCliente] = useState<any>(null)
    const [isClientFormOpen, setIsClientFormOpen] = useState(false)
    const [newClient, setNewClient] = useState({ identificacion: '', nombre: '', email: '', direccion: '', telefono: '' })
    // Tipo de documento elegido ANTES de escribir — así se aplica la validación
    // correcta (10 dígitos cédula / 13 RUC) y no se confunden por el número de
    // dígitos; Pasaporte no lleva ninguna validación de formato.
    const [tipoDocNuevoCliente, setTipoDocNuevoCliente] = useState<'CEDULA' | 'RUC' | 'PASAPORTE'>('CEDULA')
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
    // Fecha de vencimiento del crédito — se autocalcula desde diasPlazoCredito
    // pero queda editable directamente; es la que manda y la que se imprime
    // en el ticket como "Vencimiento" en Formas de Pago.
    const [fechaVencimiento, setFechaVencimiento] = useState<string>(() => calcularVencimiento(30))

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
    // Texto que la digitadora está escribiendo en "Precio Unitario" — con IVA
    // incluido, como se transa con el cliente. Mientras existe, manda sobre el
    // valor derivado de det.precio_unitario (que sigue siendo SIN IVA, igual
    // que el resto del sistema); se limpia al salir del campo o al cambiar de
    // producto/cantidad, para no arrastrar un texto viejo.
    const [precioConIvaInput, setPrecioConIvaInput] = useState<Record<number, string>>({})
    // Nivel de precio elegido por línea (1=precio_venta, 2/3/4=precio2..4 del
    // producto). Por defecto 1 — mismo comportamiento de siempre (incluye
    // precio por volumen si aplica). Al elegir 2/3/4 se fija ese precio y
    // deja de recalcularse automáticamente al cambiar la cantidad.
    const [precioNivel, setPrecioNivel] = useState<Record<number, 1 | 2 | 3 | 4>>({})
    // Stock EXACTO consultado en vivo al seleccionar el producto — el catálogo
    // local (productos state) puede estar cacheado/desactualizado, y este
    // valor es solo para que el vendedor sepa cuánto había en ese momento
    // (no participa en ningún cálculo de la factura).
    const [stockLinea, setStockLinea] = useState<Record<number, number | null>>({})
    const [buscando, setBuscando] = useState(false)
    // Modo lector de código de barras — por dispositivo (localStorage, igual
    // que el punto de emisión del dispositivo), apagado por defecto para no
    // cambiar el comportamiento actual en cajas sin lector físico. Encendido:
    // Enter en el buscador (venga de una pistola o tecleado a mano) busca
    // coincidencia EXACTA de código y agrega la línea sola.
    const MODO_ESCANER_KEY = `qi_modo_escaner_${empresa?.id ?? ''}`
    const [modoEscaner, setModoEscanerState] = useState(() => {
        try { return localStorage.getItem(MODO_ESCANER_KEY) === '1' } catch { return false }
    })
    const setModoEscaner = (v: boolean) => {
        setModoEscanerState(v)
        try { localStorage.setItem(MODO_ESCANER_KEY, v ? '1' : '0') } catch { /* localStorage no disponible */ }
    }
    const buscadorRefs = useRef<Record<number, HTMLInputElement | null>>({})

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
            selectedCliente, selectedVendedorId, selectedBodegaId, diasPlazoCredito, fechaVencimiento, detalles, pagos, montoRecibido, esModoServicio,
            retenciones, numeroRetencion, observacionFactura,
        }),
        (d) => {
            if (d.selectedCliente)    setSelectedCliente(d.selectedCliente)
            if (d.selectedVendedorId) setSelectedVendedorId(d.selectedVendedorId)
            if (d.selectedBodegaId)   setSelectedBodegaId(d.selectedBodegaId)
            if (d.diasPlazoCredito)   setDiasPlazoCredito(d.diasPlazoCredito)
            if (d.fechaVencimiento)   setFechaVencimiento(d.fechaVencimiento)
            if (d.detalles?.length)   setDetalles(d.detalles)
            if (d.pagos?.length)      setPagos(d.pagos)
            if (d.montoRecibido)      setMontoRecibido(d.montoRecibido)
            if (d.esModoServicio)     setEsModoServicio(d.esModoServicio)
            if (d.retenciones?.length) { setRetenciones(d.retenciones); setRetSeccion(true) }
            if (d.numeroRetencion)    setNumeroRetencion(d.numeroRetencion)
            if (d.observacionFactura) setObservacionFactura(d.observacionFactura)
        },
        [selectedCliente, selectedVendedorId, selectedBodegaId, diasPlazoCredito, fechaVencimiento, detalles, pagos, montoRecibido, esModoServicio,
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

    // Pre-carga desde un borrador de Facturación en Vivo (?draft_en_vivo=<id>)
    // — trae cliente/detalle/pagos ya guardados para completar el pago y
    // emitir. draftEnVivoActivo queda marcado para, al emitir con éxito,
    // avisarle al borrador cuál fue la factura resultante.
    const [draftEnVivoActivo, setDraftEnVivoActivo] = useState<string | null>(null)
    useEffect(() => {
        if (!draftEnVivoId || !empresa?.id) return
        ;(async () => {
            try {
                const draft = await facturaEnVivoService.obtener(draftEnVivoId)
                if (draft.clientes) setSelectedCliente(draft.clientes)
                const { detalles: detallesDraft, pagos: pagosDraft } = facturaEnVivoService.mapearParaFormulario(draft)
                if (detallesDraft.length > 0) setDetalles(detallesDraft)
                if (pagosDraft.length > 0) setPagos(pagosDraft)
                setDraftEnVivoActivo(draftEnVivoId)
            } catch (e: any) {
                alert('No se pudo cargar la Factura en Vivo pendiente: ' + e.message)
            }
        })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draftEnVivoId, empresa?.id])

    // Búsqueda en servidor con debounce — sin conexión (o si la consulta al
    // servidor falla) busca en el catálogo ya descargado en el dispositivo
    // (catalogCacheService, cargado en loadData), para poder seguir facturando
    // offline en vez de quedarse sin resultados en silencio.
    useEffect(() => {
        if (productDropdown === null || !empresa?.id) { setSearchResults([]); return }
        const texto = (searchProducto[productDropdown] || '').trim()
        if (texto.length < 2) { setSearchResults([]); return }
        const timer = setTimeout(async () => {
            setBuscando(true)
            if (!isOnline) {
                setSearchResults(filtrarProductosLocal(productos, texto))
                setBuscando(false)
                return
            }
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
            } catch {
                setSearchResults(filtrarProductosLocal(productos, texto))
            }
            setBuscando(false)
        }, 300)
        return () => clearTimeout(timer)
    }, [searchProducto, productDropdown, empresa?.id, isOnline, productos])

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
        setEditandoCliente(false)
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

    // ── Mantenimiento en línea del cliente seleccionado ─────
    const [editandoCliente, setEditandoCliente] = useState(false)
    const [clienteEditForm, setClienteEditForm] = useState({ nombre: '', direccion: '', telefono: '', email: '' })
    const [guardandoClienteEdit, setGuardandoClienteEdit] = useState(false)

    function abrirEdicionCliente() {
        if (!selectedCliente) return
        setClienteEditForm({
            nombre: selectedCliente.nombre ?? '',
            direccion: selectedCliente.direccion ?? '',
            telefono: selectedCliente.telefono ?? '',
            email: selectedCliente.email ?? '',
        })
        setEditandoCliente(true)
    }

    async function guardarEdicionCliente() {
        if (!selectedCliente) return
        if (!clienteEditForm.nombre.trim()) return alert('El nombre es obligatorio')
        setGuardandoClienteEdit(true)
        try {
            const actualizado = await facturacionService.updateCliente(selectedCliente.id, {
                nombre: clienteEditForm.nombre.trim(),
                direccion: clienteEditForm.direccion.trim() || null,
                telefono: clienteEditForm.telefono.trim() || null,
                email: clienteEditForm.email.trim() || null,
            } as any)
            setSelectedCliente(actualizado)
            setClientes(prev => prev.map(c => c.id === actualizado.id ? actualizado : c))
            setEditandoCliente(false)
        } catch (e: any) {
            alert('Error al actualizar cliente: ' + e.message)
        } finally {
            setGuardandoClienteEdit(false)
        }
    }

    // ── Historial de ventas de un producto a este cliente ───
    // Solo referencia — para responder "¿ya le habíamos vendido esto más
    // barato antes?" con datos reales, no participa en ningún cálculo.
    const [historialModal, setHistorialModal] = useState<{
        nombreProducto: string
        loading: boolean
        filas: { secuencial: string; fecha: string; cantidad: number; precio_unitario: number }[]
    } | null>(null)

    async function verHistorialVentas(idx: number) {
        const det = detalles[idx]
        if (!det.producto_id || !selectedCliente?.id || !empresa?.id) return
        setHistorialModal({ nombreProducto: det.nombre_producto, loading: true, filas: [] })
        try {
            const { data, error } = await supabase
                .from('comprobante_detalles')
                .select('cantidad, precio_unitario, comprobantes!inner(secuencial, created_at, cliente_id, empresa_id, tipo_comprobante)')
                .eq('producto_id', det.producto_id)
                .eq('comprobantes.cliente_id', selectedCliente.id)
                .eq('comprobantes.empresa_id', empresa.id)
                .eq('comprobantes.tipo_comprobante', 'FACTURA')
                .order('created_at', { foreignTable: 'comprobantes', ascending: false })
                .limit(30)
            if (error) throw error
            setHistorialModal({
                nombreProducto: det.nombre_producto,
                loading: false,
                filas: (data ?? []).map((d: any) => ({
                    secuencial: d.comprobantes?.secuencial ?? '',
                    fecha: d.comprobantes?.created_at ?? '',
                    cantidad: Number(d.cantidad) || 0,
                    precio_unitario: Number(d.precio_unitario) || 0,
                })),
            })
        } catch (e: any) {
            setHistorialModal(null)
            alert('Error al consultar el historial: ' + e.message)
        }
    }

    // Al salir del campo de identificación en "Nuevo Cliente": si ese RUC/cédula
    // ya está grabado, seleccionarlo de una vez y cerrar el formulario — antes
    // el vendedor no se enteraba hasta terminar de llenar todo y presionar
    // Guardar, donde recién salía el error de "ya está grabado".
    const checkClienteExistenteYVolver = (): boolean => {
        const id = newClient.identificacion.trim()
        if (!id) return false
        const existente = clientes.find(c => c.identificacion === id)
        if (!existente) return false
        handleSeleccionarCliente(existente)
        setIsClientFormOpen(false)
        setNewClient({ identificacion: '', nombre: '', email: '', direccion: '', telefono: '' })
        alert(`Este cliente ya estaba grabado como "${existente.nombre}" — se seleccionó automáticamente.`)
        return true
    }

    // Valida el formato según el tipo de documento elegido ANTES de escribir
    // (Cédula/RUC/Pasaporte) — evita que un error de dígitos en cédula/RUC se
    // cuele, y no le aplica ninguna validación a Pasaporte (formato libre).
    function validarPorTipoDoc(id: string): string | null {
        if (tipoDocNuevoCliente === 'PASAPORTE') return null
        if (!/^\d+$/.test(id)) return 'La identificación debe contener solo números.'
        if (tipoDocNuevoCliente === 'CEDULA' && id.length !== 10) {
            return `La Cédula debe tener 10 dígitos (tiene ${id.length}).`
        }
        if (tipoDocNuevoCliente === 'RUC' && id.length !== 13) {
            return `El RUC debe tener 13 dígitos (tiene ${id.length}).`
        }
        return null
    }

    const lookupSRI = async () => {
        const id = newClient.identificacion.trim()
        if (!id || tipoDocNuevoCliente === 'PASAPORTE') return
        const error = validarPorTipoDoc(id)
        if (error) { alert(error); return }
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
        const errorDoc = validarPorTipoDoc(id)
        if (errorDoc) return alert(errorDoc)
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
    // Precio con IVA incluido para mostrar en el campo "Precio Unitario" —
    // det.precio_unitario sigue siendo SIN IVA internamente (igual que el
    // catálogo y el resto del sistema).
    const precioConIvaDeLinea = (d: DetalleFacturaDirecta) =>
        Math.round(d.precio_unitario * (1 + d.iva_porcentaje / 100) * 100) / 100
    const limpiarPrecioRaw = (idx: number) =>
        setPrecioConIvaInput(prev => { if (!(idx in prev)) return prev; const next = { ...prev }; delete next[idx]; return next })
    // Precio de lista de un producto para un nivel dado (1=precio_venta, 2..4=precio2..4).
    const precioDeNivel = (prod: any, nivel: 1 | 2 | 3 | 4): number | null => {
        const campo = nivel === 1 ? 'precio_venta' : `precio${nivel}`
        const v = prod?.[campo]
        return v === null || v === undefined ? null : Number(v)
    }
    // Niveles de precio configurados en el producto (siempre incluye el 1).
    const nivelesDisponibles = (prod: any): (1 | 2 | 3 | 4)[] =>
        ([1, 2, 3, 4] as const).filter(n => n === 1 || precioDeNivel(prod, n) !== null)
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
        setPrecioNivel(prev => { const next = { ...prev }; delete next[idx]; return next })
        setSearchProducto(prev => ({ ...prev, [idx]: prod.nombre }))
        setProductDropdown(null)
        limpiarPrecioRaw(idx)

        // Stock exacto en vivo — el catálogo local puede estar cacheado.
        setStockLinea(prev => { const next = { ...prev }; delete next[idx]; return next })
        if (!tieneSubproductos) {
            Promise.resolve(supabase.from('productos').select('stock').eq('id', prod.id).maybeSingle())
                .then(({ data }) => setStockLinea(prev => ({ ...prev, [idx]: data ? Number(data.stock) : null })))
                .catch(() => {})
        }
    }
    // Cambiar el nivel de precio elegido para una línea — fija precio_unitario
    // al valor de ese nivel y deja de recalcularlo por cantidad/volumen
    // (salvo que vuelva a elegir Precio 1).
    const selectNivelPrecio = (idx: number, prod: any, nivel: 1 | 2 | 3 | 4) => {
        const precio = precioDeNivel(prod, nivel)
        if (precio === null) return
        setPrecioNivel(prev => ({ ...prev, [idx]: nivel }))
        updateLinea(idx, 'precio_unitario', precio)
        limpiarPrecioRaw(idx)
    }

    // Enter en el buscador con Modo escáner activo — el navegador no puede
    // distinguir una pistola de código de barras de alguien tecleando el
    // código a mano y presionando Enter, así que este mismo camino sirve
    // para las dos formas. No depende del buscador difuso con debounce (que
    // puede no haber corrido todavía si el Enter llega muy rápido) — hace su
    // propia consulta. Primero intenta código EXACTO; si no hay nada (ej. el
    // código tiene espacios de más guardados en la BD), cae a una búsqueda
    // por coincidencia parcial y prefiere ahí el que calce exacto con el
    // código tecleado/escaneado.
    const handleScanEnter = async (idx: number) => {
        if (!modoEscaner) return
        const texto = (searchProducto[idx] ?? '').trim()
        if (!texto) return
        setBuscando(true)
        try {
            let candidatos: any[] = []
            if (isOnline && empresa?.id) {
                const { data, error } = await supabase
                    .from('productos')
                    .select('*, subproductos(*)')
                    .eq('empresa_id', empresa.id)
                    .eq('activo', true)
                    .ilike('codigo', texto)
                    .limit(5)
                if (error) console.error('[modoEscaner] error buscando código exacto:', error)
                candidatos = data ?? []
            }
            if (candidatos.length === 0) {
                candidatos = productos.filter((p: any) => p.activo && (p.codigo ?? '').trim().toLowerCase() === texto.toLowerCase())
            }
            if (candidatos.length === 0 && isOnline && empresa?.id) {
                const { data } = await supabase
                    .from('productos')
                    .select('*, subproductos(*)')
                    .eq('empresa_id', empresa.id)
                    .eq('activo', true)
                    .ilike('codigo', `%${texto}%`)
                    .limit(5)
                candidatos = data ?? []
            }

            const prod = candidatos.length === 1
                ? candidatos[0]
                : candidatos.find((p: any) => (p.codigo ?? '').trim().toLowerCase() === texto.toLowerCase()) ?? null

            if (prod) {
                await selectProducto(idx, prod)
                setProductDropdown(null)
                // Si era la última línea, agrega una nueva vacía y enfoca su
                // buscador para poder seguir escaneando sin tocar el mouse.
                if (idx === detalles.length - 1) {
                    addLinea()
                    setTimeout(() => buscadorRefs.current[idx + 1]?.focus(), 50)
                }
            } else if (candidatos.length > 1) {
                // Varios resultados ambiguos, ninguno calza exacto — deja la
                // lista normal abierta para que el usuario elija a mano.
                setSearchResults(candidatos)
                setProductDropdown(idx)
            } else {
                // Sin ningún match: deja el texto tal cual — el mismo aviso
                // rojo que ya existe para "nombre_producto sin producto_id"
                // avisa que ese código no se encontró.
                setDetalles(prev => prev.map((d, i) => i !== idx ? d : { ...d, nombre_producto: texto, producto_id: null }))
            }
        } finally {
            setBuscando(false)
        }
    }

    const selectSubproducto = (idx: number, sub: any) => {
        setDetalles(prev => prev.map((d, i) => i === idx ? {
            ...d,
            nombre_producto: sub.nombre,
            precio_unitario: Number(sub.precio_sin_iva),
            subproducto_id: sub.id,
            factor_conversion: Number(sub.factor_conversion),
        } : d))
        limpiarPrecioRaw(idx)
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

        // Stock en cero/negativo — solo si la empresa lo tiene apagado
        // explícitamente (por defecto permitir_venta_sin_stock es true, igual
        // que el comportamiento de siempre). Solo aplica a productos que
        // manejan stock y que sí vienen del catálogo (no modo Servicio).
        if ((empresa as any)?.permitir_venta_sin_stock === false) {
            for (let i = 0; i < detalles.length; i++) {
                const d = detalles[i]
                if (!(d.nombre_producto && d.cantidad > 0 && d.precio_unitario > 0)) continue
                if (!d.producto_id) continue
                const prod = productos.find(p => p.id === d.producto_id)
                if (!prod?.maneja_stock) continue
                // Preferir el stock exacto consultado en vivo (stockLinea) sobre
                // el catálogo cacheado, mismo criterio que la caja informativa.
                const stockLive = stockLinea[i]
                const stockDisponible = stockLive != null ? stockLive : (Number(prod.stock) || 0)
                if (d.cantidad > stockDisponible) {
                    return alert(
                        `"${d.nombre_producto}" no tiene stock suficiente (disponible: ${stockDisponible}, solicitado: ${d.cantidad}).\n\n` +
                        `Esta empresa tiene apagada la venta con stock en cero (Ajustes → Empresa).`
                    )
                }
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

        // ── Path Plan Acumulativo: NO genera factura electrónica — se acumula
        // en ventas_pa hasta que el cliente cancele el saldo total. No se puede
        // combinar con otras formas de pago en la misma venta.
        const pagosPA = pagos.filter(p => p.metodo === 'plan_acumulativo' && p.valor > 0)
        if (pagosPA.length > 0) {
            const otrosMetodos = pagos.some(p => p.metodo !== 'plan_acumulativo' && p.valor > 0)
            if (otrosMetodos) {
                return alert('Plan Acumulativo no se puede combinar con otras formas de pago en la misma venta.')
            }
            try {
                setSaving(true)
                await ventaPaService.crearVentaPA({
                    empresa_id: empresa!.id,
                    cliente_id: selectedCliente.id,
                    detalles: detallesValidos,
                    bodega_id: selectedBodegaId || null,
                    vendedor_id: selectedVendedorId || null,
                    created_by: profile?.id ?? null,
                })
                const saldoTotalPendiente = await ventaPaService.calcularSaldoPendiente(empresa!.id, selectedCliente.id)
                imprimirComprobantePA({
                    empresa: { nombre: empresa!.nombre, ruc: empresa!.ruc, logo_url: empresa!.logo_url },
                    cliente: { nombre: selectedCliente.nombre, identificacion: selectedCliente.identificacion },
                    vendedorNombre: vendedores.find(v => v.id === selectedVendedorId)?.nombre || null,
                    detalles: detallesValidos,
                    saldoTotalPendiente,
                })
                alert('✅ Venta registrada en Plan Acumulativo (sin factura electrónica todavía). Se factura automáticamente cuando el cliente cancele el saldo total, desde Cuentas por Cobrar → Plan Acumulativo.')
                handleNuevaFactura()
            } catch (e: any) {
                alert('Error al registrar venta en Plan Acumulativo: ' + e.message)
            } finally {
                setSaving(false)
            }
            return
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
                        fecha_vencimiento: fechaVencimiento,
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
                fecha_vencimiento: fechaVencimiento,
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
            // Si esta factura vino de un borrador de Facturación en Vivo, avisarle
            // cuál fue el comprobante resultante (queda como EMITIDA, no se borra).
            if (draftEnVivoActivo) {
                facturaEnVivoService.marcarEmitida(draftEnVivoActivo, factura.id).catch(console.error)
                setDraftEnVivoActivo(null)
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
        setPrecioNivel({})
        setStockLinea({})
        setEditandoCliente(false)
        sessionStorage.removeItem(PREP_IDS_KEY)
        // Mantener vendedor seleccionado entre facturas
        setDiasPlazoCredito(30)
        setFechaVencimiento(calcularVencimiento(30))
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
                                    <button onClick={e => { e.stopPropagation(); setTipoDocNuevoCliente('CEDULA'); setIsClientFormOpen(true) }}
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
                                        {/* Tipo de documento — se elige ANTES de escribir, así se aplica la
                                            validación correcta (10 dígitos Cédula / 13 RUC) y Pasaporte queda
                                            sin ninguna validación de formato. */}
                                        <div className="flex gap-1.5">
                                            {(['CEDULA', 'RUC', 'PASAPORTE'] as const).map(t => (
                                                <button key={t} type="button"
                                                    onClick={() => { setTipoDocNuevoCliente(t); setNewClient({ ...newClient, identificacion: '' }) }}
                                                    className={cn(
                                                        'flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors',
                                                        tipoDocNuevoCliente === t
                                                            ? 'bg-primary-600 text-white border-primary-600'
                                                            : 'bg-white text-slate-500 border-slate-200 hover:border-primary-300'
                                                    )}>
                                                    {t === 'CEDULA' ? 'Cédula' : t === 'RUC' ? 'RUC' : 'Pasaporte'}
                                                </button>
                                            ))}
                                        </div>
                                        <div className="relative">
                                            <input
                                                placeholder={tipoDocNuevoCliente === 'CEDULA' ? 'Cédula (10 dígitos)' : tipoDocNuevoCliente === 'RUC' ? 'RUC (13 dígitos)' : 'Número de pasaporte'}
                                                inputMode={tipoDocNuevoCliente === 'PASAPORTE' ? 'text' : 'numeric'}
                                                maxLength={tipoDocNuevoCliente === 'CEDULA' ? 10 : tipoDocNuevoCliente === 'RUC' ? 13 : undefined}
                                                className="w-full px-4 py-2 rounded-lg border border-slate-200 pr-10 text-sm"
                                                value={newClient.identificacion}
                                                onChange={e => {
                                                    const raw = e.target.value
                                                    const val = tipoDocNuevoCliente === 'PASAPORTE' ? raw : raw.replace(/\D/g, '')
                                                    setNewClient({ ...newClient, identificacion: val })
                                                }}
                                                onBlur={() => {
                                                    const id = newClient.identificacion.trim()
                                                    const largoEsperado = tipoDocNuevoCliente === 'CEDULA' ? 10 : tipoDocNuevoCliente === 'RUC' ? 13 : null
                                                    if (largoEsperado !== null && id.length !== largoEsperado) return
                                                    if (checkClienteExistenteYVolver()) return
                                                    if (!newClient.nombre) lookupSRI()
                                                }}
                                            />
                                            {tipoDocNuevoCliente !== 'PASAPORTE' && (
                                                <button type="button" onClick={lookupSRI} disabled={isSearchingSRI}
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded text-primary-600 hover:bg-slate-100"
                                                    title="Consultar SRI">
                                                    {isSearchingSRI ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                                                </button>
                                            )}
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
                                        {selectedCliente && !editandoCliente && (
                                            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Seleccionado</p>
                                                        <p className="font-black text-emerald-900 text-sm">
                                                            {selectedCliente.nombre} <span className="font-normal text-emerald-600">({selectedCliente.identificacion})</span>
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        {selectedCliente.identificacion !== '9999999999999' && (
                                                            <button onClick={abrirEdicionCliente} className="text-emerald-400 hover:text-emerald-700 mt-0.5 p-1" title="Corregir datos del cliente">
                                                                <Pencil className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                        <button onClick={() => setSelectedCliente(null)} className="text-emerald-400 hover:text-emerald-700 mt-0.5 p-1">
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>
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
                                        {selectedCliente && editandoCliente && (
                                            <div className="bg-white border border-primary-200 rounded-xl p-3 space-y-2">
                                                <p className="text-[10px] font-bold text-primary-600 uppercase tracking-widest">
                                                    Corregir datos — {selectedCliente.identificacion}
                                                </p>
                                                <input placeholder="Nombre / Razón Social *" className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm"
                                                    value={clienteEditForm.nombre} onChange={e => setClienteEditForm({ ...clienteEditForm, nombre: e.target.value })} />
                                                <input placeholder="Dirección" className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-sm"
                                                    value={clienteEditForm.direccion} onChange={e => setClienteEditForm({ ...clienteEditForm, direccion: e.target.value })} />
                                                <div className="grid grid-cols-2 gap-2">
                                                    <input placeholder="Teléfono" className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm"
                                                        value={clienteEditForm.telefono} onChange={e => setClienteEditForm({ ...clienteEditForm, telefono: e.target.value })} />
                                                    <input placeholder="Correo" className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm"
                                                        value={clienteEditForm.email} onChange={e => setClienteEditForm({ ...clienteEditForm, email: e.target.value })} />
                                                </div>
                                                <div className="flex gap-2 pt-1">
                                                    <button onClick={() => setEditandoCliente(false)} className="flex-1 py-1.5 bg-slate-100 rounded-lg text-xs font-bold hover:bg-slate-200">Cancelar</button>
                                                    <button onClick={guardarEdicionCliente} disabled={guardandoClienteEdit}
                                                        className="flex-1 py-1.5 bg-primary-600 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-60">
                                                        {guardandoClienteEdit ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Guardar
                                                    </button>
                                                </div>
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

                                {/* Plazo de crédito — solo visible cuando hay pago a crédito.
                                    La fecha de vencimiento es la que manda (se imprime en el
                                    ticket) — el selector de días solo la autocalcula, pero se
                                    puede corregir directo en el campo de fecha. */}
                                {pagos.some(p => p.metodo === 'credito') && (
                                    <div className="flex flex-wrap items-center gap-3 bg-amber-50 border border-amber-100 rounded-xl p-3">
                                        <CreditCard className="w-5 h-5 text-amber-600 shrink-0" />
                                        <label className="text-sm font-bold text-amber-800 whitespace-nowrap">
                                            Plazo crédito
                                        </label>
                                        <select
                                            className="px-3 py-2 rounded-lg border border-amber-200 text-sm bg-white outline-none focus:ring-2 focus:ring-amber-400"
                                            value={diasPlazoCredito}
                                            onChange={e => {
                                                const dias = Number(e.target.value)
                                                setDiasPlazoCredito(dias)
                                                setFechaVencimiento(calcularVencimiento(dias))
                                            }}
                                >
                                            <option value={15}>15 días</option>
                                            <option value={30}>30 días</option>
                                            <option value={45}>45 días</option>
                                            <option value={60}>60 días</option>
                                            <option value={90}>90 días</option>
                                            <option value={120}>120 días</option>
                                        </select>
                                        <label className="text-sm font-bold text-amber-800 whitespace-nowrap">
                                            Vence
                                        </label>
                                        <input type="date"
                                            className="px-3 py-2 rounded-lg border border-amber-200 text-sm bg-white outline-none focus:ring-2 focus:ring-amber-400"
                                            value={fechaVencimiento}
                                            onChange={e => setFechaVencimiento(e.target.value)} />
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
                                {/* Toggle modo escáner de código de barras */}
                                <label className="flex items-center gap-2 cursor-pointer select-none"
                                    title="Con esto encendido, presionar Enter en el buscador (pistola o tecleado a mano) agrega el producto por código exacto automáticamente.">
                                    <div
                                        onClick={() => setModoEscaner(!modoEscaner)}
                                        className={cn(
                                            'relative w-10 h-5 rounded-full transition-colors duration-200',
                                            modoEscaner ? 'bg-primary-600' : 'bg-slate-300'
                                        )}
                                    >
                                        <span className={cn(
                                            'absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200',
                                            modoEscaner ? 'left-5' : 'left-0.5'
                                        )} />
                                    </div>
                                    <span className="text-sm font-medium text-slate-600 flex items-center gap-1">
                                        <Barcode className="w-3.5 h-3.5" /> Modo lector código de barras
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
                                                        ref={el => { buscadorRefs.current[idx] = el }}
                                                        placeholder={modoEscaner ? 'Escanear o escribir código + Enter...' : 'Buscar: riel*45*luxus ...'}
                                                        autoComplete="off"
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
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter' && modoEscaner) {
                                                                e.preventDefault()
                                                                e.stopPropagation()
                                                                handleScanEnter(idx)
                                                            }
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
                                            {det.producto_id && selectedCliente && selectedCliente.identificacion !== '9999999999999' && (
                                                <button onClick={() => verHistorialVentas(idx)}
                                                    className="p-2 text-slate-300 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors shrink-0 self-start"
                                                    title="Ver historial de ventas de este artículo a este cliente">
                                                    <History className="w-4 h-4" />
                                                </button>
                                            )}
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
                                                    className="no-spinner w-full px-3 py-2 rounded-lg border border-slate-200 text-base font-bold text-center bg-white outline-none focus:ring-2 focus:ring-primary-400"
                                                    value={det.cantidad}
                                                    // La cantidad siempre se digita — sin flechas de +/- y sin que un
                                                    // scroll accidental del mouse (con foco) pueda cambiarla.
                                                    onWheel={e => (e.target as HTMLInputElement).blur()}
                                                    onChange={async e => {
                                                        const nuevaCantidad = parseFloat(e.target.value) || 0
                                                        updateLinea(idx, 'cantidad', nuevaCantidad)
                                                        // Solo recalcula por precio-volumen en Precio 1 (nivel por defecto).
                                                        // Si eligió Precio 2/3/4, ese precio queda fijo sin importar la cantidad.
                                                        const nivelActual = precioNivel[idx] ?? 1
                                                        if (nivelActual === 1 && det.producto_id && !det.subproducto_id && empresa?.id && nuevaCantidad > 0) {
                                                            try {
                                                                const prod = productos.find(p => p.id === det.producto_id)
                                                                const precioVol = await precioVolumenService.resolverPrecio(empresa.id, det.producto_id, nuevaCantidad)
                                                                updateLinea(idx, 'precio_unitario', precioVol !== null ? precioVol : (prod?.precio_venta ?? det.precio_unitario))
                                                                limpiarPrecioRaw(idx)
                                                            } catch { /* mantener precio actual */ }
                                                        }
                                                    }} />
                                            </div>

                                            {/* Precio Unitario — se digita CON IVA incluido (lo que se transa con el
                                                cliente); internamente se guarda sin IVA como el resto del sistema.
                                                Solo el administrador de la empresa puede cambiarlo — el resto ve el
                                                precio del catálogo fijo, sin poder editarlo. */}
                                            <div className="col-span-4 md:col-span-3">
                                                <label className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5 md:hidden">P. Unit. (IVA inc.)</label>
                                                {isAdmin && !esModoServicio && (() => {
                                                    const prod = productos.find(p => p.id === det.producto_id)
                                                    if (!prod || det.subproducto_id) return null
                                                    const niveles = nivelesDisponibles(prod)
                                                    if (niveles.length <= 1) return null
                                                    return (
                                                        <select
                                                            title="Lista de precio"
                                                            value={precioNivel[idx] ?? 1}
                                                            onChange={e => selectNivelPrecio(idx, prod, Number(e.target.value) as 1 | 2 | 3 | 4)}
                                                            className="w-full mb-1 px-1.5 py-1 rounded-md border border-slate-200 text-[11px] bg-white outline-none focus:ring-2 focus:ring-primary-400"
                                                        >
                                                            {niveles.map(n => (
                                                                <option key={n} value={n}>
                                                                    Precio {n} · {formatCurrency(precioDeNivel(prod, n) ?? 0)}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    )
                                                })()}
                                                {isAdmin ? (
                                                    <div className="relative">
                                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                                                        <input type="number" min="0" step="0.01"
                                                            title="Precio con IVA incluido"
                                                            className="w-full pl-5 pr-2 py-2 rounded-lg border border-slate-200 text-sm text-right bg-white outline-none focus:ring-2 focus:ring-primary-400"
                                                            value={precioConIvaInput[idx] ?? (det.precio_unitario > 0 ? precioConIvaDeLinea(det).toFixed(2) : '')}
                                                            onChange={e => {
                                                                const raw = e.target.value
                                                                setPrecioConIvaInput(prev => ({ ...prev, [idx]: raw }))
                                                                const conIva = parseFloat(raw) || 0
                                                                // 4 decimales (igual precisión que precio_unitario en BD) — redondear
                                                                // a centavos aquí acumula error al multiplicar por la cantidad
                                                                // (ver caso: 2.50 con IVA / 1.15 = 2.17 recortado, 4 unidades da
                                                                // $9.98 en vez de $10.00).
                                                                const sinIva = Math.round((conIva / (1 + det.iva_porcentaje / 100)) * 10000) / 10000
                                                                updateLinea(idx, 'precio_unitario', sinIva)
                                                            }}
                                                            onBlur={() => limpiarPrecioRaw(idx)} />
                                                    </div>
                                                ) : (
                                                    <div className="w-full px-3 py-2 rounded-lg border border-slate-100 bg-slate-50 text-sm text-right text-slate-600 font-mono"
                                                        title="Solo el administrador de la empresa puede cambiar el precio">
                                                        {det.precio_unitario > 0 ? formatCurrency(precioConIvaDeLinea(det)) : '—'}
                                                    </div>
                                                )}
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

                                            {/* IVA % — de solo lectura cuando la línea viene del catálogo (si está
                                                mal, se corrige en Artículos, no aquí). En modo Servicio no hay
                                                artículo de donde tomarlo, así que ahí se mantiene editable. */}
                                            <div className="col-span-3 md:col-span-1">
                                                <label className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5 md:hidden">IVA%</label>
                                                {esModoServicio ? (
                                                    <select
                                                        className="w-full px-1 py-2 rounded-lg border border-slate-200 text-xs text-center bg-white outline-none focus:ring-2 focus:ring-primary-400"
                                                        value={det.iva_porcentaje}
                                                        onChange={e => updateLinea(idx, 'iva_porcentaje', parseFloat(e.target.value))}>
                                                        <option value={0}>0%</option>
                                                        <option value={5}>5%</option>
                                                        <option value={15}>15%</option>
                                                    </select>
                                                ) : (
                                                    <div className="w-full px-1 py-2 rounded-lg border border-slate-100 bg-slate-50 text-xs text-center text-slate-600 font-mono"
                                                        title="El IVA se corrige en Artículos, no aquí">
                                                        {det.iva_porcentaje}%
                                                    </div>
                                                )}
                                            </div>

                                            {/* Stock — solo informativo, no participa en ningún cálculo. Se
                                                consulta en vivo al seleccionar el producto (stockLinea), no
                                                del catálogo cacheado, para mostrar el valor exacto y actual. */}
                                            <div className="col-span-3 md:col-span-1">
                                                <label className="text-[10px] text-slate-400 font-bold uppercase block mb-0.5 md:hidden">Stock</label>
                                                <div className="w-full px-1 py-2 rounded-lg border border-slate-100 bg-slate-50 text-xs text-center text-slate-500 font-mono"
                                                    title="Stock del artículo al momento de agregarlo — solo referencia">
                                                    {!det.producto_id
                                                        ? '—'
                                                        : idx in stockLinea
                                                            ? (stockLinea[idx] ?? '—')
                                                            : <Loader2 className="w-3 h-3 animate-spin inline" />}
                                                </div>
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
                                    <div className="flex gap-2 items-center flex-wrap">
                                        <select
                                            className="flex-1 min-w-[190px] px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-primary-400 bg-white"
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
                                        className="no-spinner w-full pl-7 pr-3 py-2.5 rounded-xl border-2 border-emerald-200 bg-emerald-50 text-emerald-900 font-bold text-lg outline-none focus:border-emerald-400"
                                        placeholder="0.00"
                                        value={montoRecibido || ''}
                                        onWheel={e => (e.target as HTMLInputElement).blur()}
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
            {/* Copias automáticas configuradas en Ajustes (Impresión POS) — igual
                patrón que TicketPrint.tsx (reimpresión): un solo handlePrint()
                imprime todas de corrido, con corte de página entre copia y copia
                para que la impresora térmica las separe. */}
            <div className="hidden">
                {facturaFinal && (
                    <div ref={printRef}>
                        {Array.from({ length: Math.max(1, Number(puntoEmisionActivo?.copias_pos_factura) || 1) }).map((_, i, arr) => (
                            <div key={i} className={i < arr.length - 1 ? 'break-after-page' : ''}>
                                <InvoiceTicketPOS
                                    factura={facturaFinal}
                                    montoRecibido={ticketMontoRecibido}
                                    vuelto={ticketVuelto}
                                />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── MODAL HISTORIAL DE VENTAS (producto × cliente) ── */}
            {historialModal && (
                <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-[60]" onClick={() => setHistorialModal(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-slate-100 sticky top-0 bg-white">
                            <div>
                                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5"><History className="w-4 h-4 text-primary-500" /> Historial de ventas</h3>
                                <p className="text-xs text-slate-400 mt-0.5">{historialModal.nombreProducto} — {selectedCliente?.nombre}</p>
                            </div>
                            <button onClick={() => setHistorialModal(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-4">
                            {historialModal.loading ? (
                                <div className="py-8 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando...</div>
                            ) : historialModal.filas.length === 0 ? (
                                <p className="py-8 text-center text-sm text-slate-400">No hay ventas anteriores de este artículo a este cliente.</p>
                            ) : (
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="text-slate-400 text-left border-b border-slate-100">
                                            <th className="pb-1.5 font-bold">No. Factura</th>
                                            <th className="pb-1.5 font-bold text-center">Cant.</th>
                                            <th className="pb-1.5 font-bold text-right">Precio Unit.</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {historialModal.filas.map((f, i) => (
                                            <tr key={i} className="border-b border-slate-50 last:border-0">
                                                <td className="py-1.5 font-mono text-slate-700">
                                                    {f.secuencial}
                                                    <p className="text-[10px] text-slate-400 font-sans">{f.fecha ? new Date(f.fecha).toLocaleDateString('es-EC') : ''}</p>
                                                </td>
                                                <td className="py-1.5 text-center text-slate-600">{f.cantidad}</td>
                                                <td className="py-1.5 text-right font-semibold text-slate-800">{formatCurrency(f.precio_unitario)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}

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
