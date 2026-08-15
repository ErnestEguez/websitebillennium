import { useState, useEffect, useRef } from 'react'
import { HelpButton } from '../../components/help/HelpButton'
import { useFormDraft } from '../../hooks/useFormDraft'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { compraService, proveedorService, retencionService, ocService } from '../../services/vendorService'
import { codigoRetencionService, type CodigoRetencion } from '../../services/codigoRetencionService'
import { bodegaService } from '../../services/bodegaService'
import type { OrdenCompra, Bodega } from '../../types/vendors'
import { contableConfigService } from '../../services/contableConfigService'
import { contabilidadComprasService } from '../../services/contabilidadComprasService'
import { supabase } from '../../lib/supabase'
import type { Proveedor } from '../../types/vendors'
import { TIPO_SUSTENTO_LABELS, TIPO_DOCUMENTO_SRI_LABELS, type TipoDocumentoSri } from '../../types/vendors'
import { RetencionesEditor } from '../../components/vendor/RetencionesEditor'
import type { RetLine } from '../../components/vendor/RetencionesEditor'
import { geminiService } from '../../services/geminiService'
import { useIaFeatureEnabled } from '../../hooks/useIaFeatureEnabled'
import { productoService } from '../../services/productoService'
import type { Categoria } from '../../services/productoService'
import { unidadService, type Unidad } from '../../services/unidadService'
import type { TipoProveedor } from '../../types/vendors'
import {
    ArrowLeft, Plus, Trash2, Save, Package, ChevronDown, ChevronUp, CheckSquare,
    ScanLine, Upload, Loader2, Info,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { BuscadorProducto, type ProductoResultado } from '../../components/BuscadorProducto'

const inp = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white'
// Variante compacta para la tabla de detalle de compras (más columnas, letra chica)
const inpSm = 'w-full border border-slate-300 rounded-lg px-1.5 py-1 text-xs focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white'

const HOY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' })

function fechaMasDias(dias: number) {
    const d = new Date()
    d.setDate(d.getDate() + dias)
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' })
}

type LineaStatus = 'found' | 'by_description' | 'new'

interface LineaDetalle {
    producto_id: string
    codigo: string
    nombre: string
    cantidad: number
    costo_unitario: number
    descuento_porcentaje?: number
    descuento_valor?: number  // descuento directo en $ — mutuamente excluyente con descuento_porcentaje
    iva_porcentaje?: number
    status?: LineaStatus
    categoria_sugerida?: string
    // Unidad/Categoría — solo editables cuando status === 'new' (producto no
    // existe aún en el catálogo). Para productos existentes se muestran de
    // solo lectura, tomadas del producto real (productosCompletos).
    unidad_id?: string | null
    categoria_id?: string | null
}

// Descuento y subtotal neto de una línea (costo_unitario es el precio bruto de factura).
// descuento_valor (directo en $) y descuento_porcentaje son mutuamente excluyentes:
// si hay valor directo, tiene prioridad sobre el %.
function lineaNeta(d: LineaDetalle) {
    const bruto = d.cantidad * d.costo_unitario
    const valorDirecto = d.descuento_valor ?? 0
    const montoDescuento = valorDirecto > 0
        ? Math.min(Math.round(valorDirecto * 100) / 100, bruto)
        : Math.round(bruto * (d.descuento_porcentaje ?? 0) / 100 * 100) / 100
    return { bruto, montoDescuento, neto: bruto - montoDescuento }
}

// Similitud por palabras para matching de descripción
function wordSimilarity(a: string, b: string): number {
    const words = (s: string) => s.toLowerCase().trim().split(/\s+/).filter(w => w.length > 2)
    const wa = words(a); const wb = words(b)
    if (!wa.length || !wb.length) return 0
    const matches = wa.filter(w => wb.some(ww => ww.includes(w) || w.includes(ww)))
    return matches.length / Math.max(wa.length, wb.length)
}

export function NuevaCompraInventarioPage() {
    const { empresa, profile } = useAuth()
    const { enabled: ocrIaHabilitado } = useIaFeatureEnabled('compras')
    const navigate = useNavigate()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [proveedores, setProveedores] = useState<Proveedor[]>([])
    const [productosSimple, setProductosSimple] = useState<{ id: string; nombre: string }[]>([])
    const [productosCompletos, setProductosCompletos] = useState<{ id: string; codigo: string | null; nombre: string; unidad_id: string | null; categoria_id: string | null }[]>([])
    const [categorias, setCategorias] = useState<Categoria[]>([])
    const [unidades, setUnidades] = useState<Unidad[]>([])
    const [bodegas, setBodegas]       = useState<Bodega[]>([])
    const [loading, setLoading]       = useState(true)
    const [saving, setSaving]         = useState(false)
    const [ocrLoading, setOcrLoading] = useState(false)
    // "Sin Detalle": al escanear, solo trae cabecera/totales del PDF, sin
    // llenar las líneas de producto — para facturas donde no importa el
    // detalle o para no crear productos nuevos por error.
    const [ocrSinDetalle, setOcrSinDetalle] = useState(false)

    // Cabecera
    const [bodegaId, setBodegaId]           = useState('')
    const [proveedorId, setProveedorId]     = useState('')
    const [fechaEmision, setFechaEmision]   = useState(HOY)
    const [estab, setEstab]                 = useState('')
    const [ptoEmi, setPtoEmi]               = useState('')
    const [secuencial, setSecuencial]       = useState('')
    const [numeroFactura, setNumeroFactura] = useState('')
    const [claveAcceso, setClaveAcceso]     = useState('')
    const [tipoSustento, setTipoSustento]   = useState<'01'|'02'|'03'|'04'|'05'>('04')
    const [tipoDocumentoSri, setTipoDocumentoSri] = useState<TipoDocumentoSri>('01')
    const [formaPago, setFormaPago]         = useState<'CONTADO'|'CREDITO'>('CREDITO')
    const [fechaVenc, setFechaVenc]         = useState(fechaMasDias(30))
    const [observaciones, setObservaciones] = useState('')

    // Detalle
    const [detalle, setDetalle] = useState<LineaDetalle[]>([])

    // Descuento total de factura (cuando el proveedor no da % por línea) —
    // solo se usa para distribuirlo entre las líneas, no se guarda aparte.
    const [descuentoTotalFactura, setDescuentoTotalFactura] = useState(0)

    // Bases IVA
    const [baseIva0,  setBaseIva0]  = useState(0)
    const [baseIva5,  setBaseIva5]  = useState(0)
    const [baseIva15, setBaseIva15] = useState(0)
    const [usarIvaManual, setUsarIvaManual] = useState(false)
    // Estado raw para inputs decimales (evita que el punto se pierda al re-renderizar)
    const [rawInputs, setRawInputs] = useState<Record<string, string>>({})

    // Retenciones
    const [numeroRetencion, setNumeroRetencion] = useState('')
    const [retenciones, setRetenciones]         = useState<RetLine[]>([])
    const [retSeccion, setRetSeccion]            = useState(false)

    const [codigosRet, setCodigosRet] = useState<CodigoRetencion[]>([])

    // Orden de compra vinculada
    const [ordenesCompra, setOrdenesCompra] = useState<OrdenCompra[]>([])
    const [ocVinculada,   setOcVinculada]   = useState('')

    // ── Draft ──────────────────────────────────────────────────────────────────
    const clearDraft = useFormDraft(
        'draft_compra_inventario',
        () => ({
            proveedorId, fechaEmision, estab, ptoEmi, secuencial,
            claveAcceso, tipoSustento, tipoDocumentoSri, formaPago, fechaVenc, observaciones,
            detalle, usarIvaManual, baseIva0, baseIva5, baseIva15,
            numeroRetencion, retenciones, retSeccion, ocVinculada,
        }),
        (d) => {
            if (d.proveedorId)    setProveedorId(d.proveedorId)
            if (d.fechaEmision)   setFechaEmision(d.fechaEmision)
            if (d.estab)          setEstab(d.estab)
            if (d.ptoEmi)         setPtoEmi(d.ptoEmi)
            if (d.secuencial)     setSecuencial(d.secuencial)
            if (d.claveAcceso)    setClaveAcceso(d.claveAcceso)
            if (d.tipoSustento)   setTipoSustento(d.tipoSustento)
            if (d.tipoDocumentoSri) setTipoDocumentoSri(d.tipoDocumentoSri)
            if (d.formaPago)      setFormaPago(d.formaPago)
            if (d.fechaVenc)      setFechaVenc(d.fechaVenc)
            if (d.observaciones)  setObservaciones(d.observaciones)
            if (d.detalle?.length)       setDetalle(d.detalle)
            if (d.usarIvaManual)  setUsarIvaManual(d.usarIvaManual)
            if (d.baseIva0)       setBaseIva0(d.baseIva0)
            if (d.baseIva5)       setBaseIva5(d.baseIva5)
            if (d.baseIva15)      setBaseIva15(d.baseIva15)
            if (d.numeroRetencion) setNumeroRetencion(d.numeroRetencion)
            if (d.retenciones?.length)   setRetenciones(d.retenciones)
            if (d.retSeccion)     setRetSeccion(d.retSeccion)
            if (d.ocVinculada)    setOcVinculada(d.ocVinculada)
        },
        [
            proveedorId, fechaEmision, estab, ptoEmi, secuencial,
            claveAcceso, tipoSustento, tipoDocumentoSri, formaPago, fechaVenc, observaciones,
            detalle, usarIvaManual, baseIva0, baseIva5, baseIva15,
            numeroRetencion, retenciones, retSeccion, ocVinculada,
        ],
    )

    useEffect(() => { if (empresa?.id) load() }, [empresa?.id])

    async function load() {
        try {
            const { data: prodsData } = await supabase
                .from('productos').select('id, codigo, nombre, unidad_id, categoria_id')
                .eq('empresa_id', empresa!.id).eq('activo', true).order('nombre')
            const [provs, ocs, bods, cats, unids, codigos] = await Promise.all([
                proveedorService.listar(empresa!.id),
                ocService.listar(empresa!.id),
                bodegaService.listar(empresa!.id),
                productoService.getCategorias(empresa!.id),
                unidadService.getUnidades(empresa!.id),
                codigoRetencionService.listar(empresa!.id),
            ])
            setOrdenesCompra(ocs.filter(o => o.estado === 'ENVIADA' || o.estado === 'PARCIALMENTE_RECIBIDA'))
            setProveedores(provs.filter(p => p.estado === 'ACTIVO'))
            setCodigosRet(codigos.filter(c => c.activo))
            setProductosCompletos(prodsData ?? [])
            setProductosSimple((prodsData ?? []).map(p => ({ id: p.id, nombre: p.nombre })))
            setCategorias(cats ?? [])
            setUnidades(unids ?? [])
            setBodegas(bods)
            if (bods.length > 0 && !bodegaId) {
                const principal = bods.find(b => b.es_principal) ?? bods[0]
                setBodegaId(principal.id)
            }
        } catch (e: any) { alert('Error al cargar datos: ' + e.message) }
        finally { setLoading(false) }
    }

    useEffect(() => {
        if (estab && ptoEmi && secuencial)
            setNumeroFactura(`${estab.padStart(3,'0')}-${ptoEmi.padStart(3,'0')}-${secuencial.padStart(9,'0')}`)
    }, [estab, ptoEmi, secuencial])

    useEffect(() => {
        if (retSeccion && !numeroRetencion && empresa?.id) {
            retencionService.siguienteNumero(empresa.id).then(setNumeroRetencion).catch(() => {})
        }
    }, [retSeccion, empresa?.id])

    async function vincularOC(ocId: string) {
        setOcVinculada(ocId)
        if (!ocId) return
        try {
            const oc = await ocService.obtener(ocId)
            if (oc.proveedor_id) setProveedorId(oc.proveedor_id)
            if (oc.detalle?.length) {
                setDetalle(oc.detalle.map(d => ({
                    producto_id:  d.producto_id ?? '',
                    codigo:       '',
                    nombre:       d.descripcion ?? d.producto?.nombre ?? '',
                    cantidad:     d.cantidad_solicitada - d.cantidad_recibida,
                    costo_unitario: d.costo_unitario,
                })).filter(d => d.cantidad > 0))
            }
        } catch { /* OC sin detalle cargado */ }
    }

    // ── OCR: analizar factura PDF/imagen ─────────────────────────────────────
    async function handleOcrFile(file: File) {
        try {
            setOcrLoading(true)

            // Convertir a base64
            const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader()
                reader.onload  = () => resolve((reader.result as string).split(',')[1])
                reader.onerror = reject
                reader.readAsDataURL(file)
            })

            const mimeType = file.type || (file.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg')

            const ocr = await geminiService.analizarFacturaCompra(
                base64, mimeType, categorias.map(c => c.nombre), empresa!.id,
            )

            // ── Llenar cabecera ────────────────────────────────────────────
            if (ocr.fecha_emision) setFechaEmision(ocr.fecha_emision)
            if (ocr.estab)         setEstab(ocr.estab)
            if (ocr.pto_emi)       setPtoEmi(ocr.pto_emi)
            if (ocr.secuencial)    setSecuencial(ocr.secuencial)
            if (ocr.clave_acceso)  setClaveAcceso(ocr.clave_acceso)
            if (ocr.valor_iva > 0 || ocr.base_iva_0 > 0) {
                setUsarIvaManual(true)
                setBaseIva0(ocr.base_iva_0 ?? 0)
                setBaseIva15(ocr.base_iva_15 ?? 0)
            }

            // ── Proveedor: buscar por RUC o crear automáticamente ─────────
            let proveedorResueltoId = ''
            const rucOcr = (ocr.proveedor_ruc ?? '').trim()
            if (rucOcr) {
                const existente = proveedores.find(p => p.ruc === rucOcr)
                if (existente) {
                    proveedorResueltoId = existente.id
                } else {
                    // Determinar tipo de proveedor por 3er dígito del RUC ecuatoriano
                    // 0-5 → persona natural; 6-9 → sociedad/entidad pública
                    const tercer = parseInt(rucOcr[2] ?? '9', 10)
                    const tipoProveedor: TipoProveedor = tercer <= 5 ? 'PERSONA_NATURAL' : 'SOCIEDAD'

                    const nuevoProv = await proveedorService.crear({
                        empresa_id:              empresa!.id,
                        ruc:                     rucOcr,
                        nombre_empresa:          ocr.proveedor_nombre ?? 'Sin nombre',
                        direccion:               ocr.proveedor_direccion ?? undefined,
                        telefono:                ocr.proveedor_telefono  ?? undefined,
                        correo:                  ocr.proveedor_correo    ?? undefined,
                        tipo_identificacion:     'RUC',
                        tipo_proveedor:          tipoProveedor,
                        estado:                  'ACTIVO',
                        condicion_pago:          'CONTADO',
                        pais:                    'Ecuador',
                        contribuyente_especial:  ocr.proveedor_contribuyente_especial ?? false,
                        agente_retencion:        false,
                        tipo_regimen:            'GENERAL',
                    })
                    // Actualizar lista local para que el select lo muestre
                    setProveedores(prev => [...prev, nuevoProv])
                    proveedorResueltoId = nuevoProv.id
                }
            }
            if (proveedorResueltoId) setProveedorId(proveedorResueltoId)

            // Categoría por nombre sugerido de la IA — o la primera disponible
            function resolverCategoriaSugerida(sugerida?: string): string | null {
                if (sugerida && categorias.length > 0) {
                    const matched = categorias.find(c =>
                        c.nombre.toLowerCase().includes(sugerida.toLowerCase()) ||
                        sugerida.toLowerCase().includes(c.nombre.toLowerCase()),
                    )
                    if (matched) return matched.id
                }
                return categorias[0]?.id ?? null
            }

            // ── Validar detalle contra catálogo ───────────────────────────
            // "Sin Detalle": se queda solo con la cabecera/totales ya cargados
            // arriba (incluye usarIvaManual + baseIva0/5/15 si el PDF traía
            // el IVA), sin tocar las líneas de producto.
            const lineasValidadas: LineaDetalle[] = ocrSinDetalle ? [] : ocr.detalle.map(item => {
                const normStr = (s: string) => (s ?? '').toLowerCase().trim()
                const codNorm = normStr(item.codigo)

                // El "Precio Total" de línea que trae el PDF es más confiable que el
                // "Precio Unitario" (en facturas con columnas extra, ej. "Detalle
                // Adicional", la IA a veces confunde esa columna con el precio
                // unitario). Si el total de línea viene, se deriva el costo unitario
                // desde ahí (total ÷ cantidad) para que la compra SIEMPRE cuadre
                // exactamente con el total del documento original.
                const costoUnitario = (item.subtotal > 0 && item.cantidad > 0)
                    ? Math.round((item.subtotal / item.cantidad) * 10000) / 10000
                    : item.precio_unitario

                // 1. Coincidencia exacta por código
                const byCode = productosCompletos.find(p =>
                    p.codigo && normStr(p.codigo) === codNorm && codNorm.length > 0,
                )
                if (byCode) return {
                    producto_id:     byCode.id,
                    codigo:          item.codigo,
                    nombre:          byCode.nombre,
                    cantidad:        item.cantidad,
                    costo_unitario:  costoUnitario,
                    iva_porcentaje:  item.iva_porcentaje,
                    status:          'found' as LineaStatus,
                    unidad_id:       byCode.unidad_id,
                    categoria_id:    byCode.categoria_id,
                }

                // 2. Coincidencia por similitud de descripción (> 65%)
                const byDesc = productosCompletos
                    .map(p => ({ p, sim: wordSimilarity(p.nombre, item.descripcion) }))
                    .filter(x => x.sim >= 0.65)
                    .sort((a, b) => b.sim - a.sim)[0]
                if (byDesc) return {
                    producto_id:      byDesc.p.id,
                    codigo:           item.codigo,
                    nombre:           byDesc.p.nombre,
                    cantidad:         item.cantidad,
                    costo_unitario:   costoUnitario,
                    iva_porcentaje:   item.iva_porcentaje,
                    status:           'by_description' as LineaStatus,
                    categoria_sugerida: item.categoria_sugerida,
                    unidad_id:        byDesc.p.unidad_id,
                    categoria_id:     byDesc.p.categoria_id,
                }

                // 3. Producto nuevo — precargar categoría sugerida por la IA y la
                // unidad "UND" por defecto; ambas quedan editables en la fila.
                return {
                    producto_id:      '',
                    codigo:           item.codigo,
                    nombre:           item.descripcion,
                    cantidad:         item.cantidad,
                    costo_unitario:   costoUnitario,
                    iva_porcentaje:   item.iva_porcentaje,
                    status:           'new' as LineaStatus,
                    categoria_sugerida: item.categoria_sugerida,
                    unidad_id:        unidades.find(u => u.codigo === 'UND')?.id ?? unidades[0]?.id ?? null,
                    categoria_id:     resolverCategoriaSugerida(item.categoria_sugerida),
                }
            })

            setDetalle(lineasValidadas)

            // Resetear file input para permitir re-carga del mismo archivo
            if (fileInputRef.current) fileInputRef.current.value = ''

            const nFound  = lineasValidadas.filter(l => l.status === 'found').length
            const nByDesc = lineasValidadas.filter(l => l.status === 'by_description').length
            const nNew    = lineasValidadas.filter(l => l.status === 'new').length

            const provExistente = rucOcr && proveedores.find(p => p.ruc === rucOcr)
            const provCreado    = rucOcr && !provExistente && proveedorResueltoId

            const parts = [
                ocrSinDetalle
                    ? '✅ Factura analizada: solo cabecera y totales (Sin Detalle activado)'
                    : `✅ Factura analizada: ${lineasValidadas.length} producto(s)`,
                provCreado    ? `🏢 Proveedor nuevo creado: ${ocr.proveedor_nombre} (${rucOcr})` : null,
                provExistente ? `🏢 Proveedor encontrado: ${provExistente.nombre_empresa}` : null,
                nFound  > 0 ? `● ${nFound} producto(s) encontrado(s) por código` : null,
                nByDesc > 0 ? `🔵 ${nByDesc} encontrado(s) por descripción — verifica` : null,
                nNew    > 0 ? `🔴 ${nNew} producto(s) nuevo(s) — se crearán al guardar` : null,
            ].filter(Boolean).join('\n')
            alert(parts)

        } catch (e: any) {
            alert('Error al analizar la factura: ' + e.message)
        } finally {
            setOcrLoading(false)
        }
    }

    // ── Cálculos ──────────────────────────────────────────────────────────────
    const subtotalLineas = Math.round(detalle.reduce((s, d) => s + lineaNeta(d).neto, 0) * 100) / 100

    // Base por tasa: suma el neto de cada línea según SU PROPIA tasa (iva_porcentaje,
    // igual que se guarda por línea al final) — no se asume 15% para todo. Así el
    // desglose y los totales reflejan lo ingresado desde el primer producto, sin
    // necesidad de tocar el checklist de "Ingresar bases manualmente".
    const baseLineasEnTasa = (pct: number) =>
        Math.round(detalle.reduce((s, d) => s + ((d.iva_porcentaje ?? 15) === pct ? lineaNeta(d).neto : 0), 0) * 100) / 100

    const b0  = usarIvaManual ? baseIva0  : baseLineasEnTasa(0)
    const b5  = usarIvaManual ? baseIva5  : baseLineasEnTasa(5)
    const b15 = usarIvaManual ? baseIva15 : baseLineasEnTasa(15)
    const ivaCalc = Math.round((b5 * 0.05 + b15 * 0.15) * 100) / 100
    // Desglose para mostrar en pantalla (ayuda a cuadrar contra la factura del proveedor).
    const iva5  = Math.round(b5  * 0.05 * 100) / 100
    const iva15 = Math.round(b15 * 0.15 * 100) / 100
    const total   = subtotalLineas + ivaCalc
    const totalRet = retenciones.reduce((s, r) => s + r.valor, 0)

    useEffect(() => {
        if (retenciones.length === 0) return
        setRetenciones(prev => prev.map(r => {
            if (!r.codigo || r.pct <= 0) return r
            const base  = r.tipo === 'FUENTE' ? subtotalLineas : ivaCalc
            const valor = Math.round(base * r.pct / 100 * 100) / 100
            return { ...r, base, valor }
        }))
    }, [subtotalLineas, ivaCalc])

    const hasOcrLines = detalle.some(d => d.status !== undefined)
    const nNew = detalle.filter(d => d.status === 'new').length

    // ── Funciones de detalle ──────────────────────────────────────────────────
    // Helpers para inputs decimales controlados
    function numVal(key: string, n: number): string | number {
        return key in rawInputs ? rawInputs[key] : (n === 0 ? '' : n)
    }
    function numChange(key: string, val: string, setter: (n: number) => void) {
        if (!/^\d*\.?\d*$/.test(val) && val !== '') return
        setRawInputs(prev => ({ ...prev, [key]: val }))
        const n = parseFloat(val)
        if (!isNaN(n)) setter(n)
    }
    function numBlur(key: string, setter: (n: number) => void) {
        // Si el usuario solo enfocó el campo y salió sin escribir nada
        // (rawInputs[key] nunca se creó), no tocar el valor existente —
        // antes esto lo reseteaba a 0 y "borraba" lo cargado desde el PDF.
        if (key in rawInputs) {
            setter(parseFloat(rawInputs[key]) || 0)
            setRawInputs(prev => { const next = { ...prev }; delete next[key]; return next })
        }
    }

    function addLinea() {
        setDetalle(prev => [...prev, { producto_id: '', codigo: '', nombre: '', cantidad: 1, costo_unitario: 0, descuento_porcentaje: 0 }])
    }

    // Reparte el descuento total de la factura como el mismo % en cada línea
    // (para proveedores que solo dan el descuento global, no por producto).
    function distribuirDescuentoTotal() {
        if (descuentoTotalFactura <= 0) { alert('Ingresa el valor del descuento total de la factura.'); return }
        const brutoTotal = detalle.reduce((s, d) => s + lineaNeta(d).bruto, 0)
        if (brutoTotal <= 0) { alert('Agrega productos con cantidad y costo unitario antes de distribuir el descuento.'); return }
        if (descuentoTotalFactura > brutoTotal) { alert('El descuento total no puede ser mayor al subtotal de los productos.'); return }
        const pct = Math.round((descuentoTotalFactura / brutoTotal) * 100 * 10000) / 10000
        setDetalle(prev => prev.map(d => ({ ...d, descuento_porcentaje: pct, descuento_valor: 0 })))
    }

    function updLinea(i: number, campo: keyof LineaDetalle, val: unknown) {
        setDetalle(prev => prev.map((d, j) => {
            if (j !== i) return d
            if (campo === 'producto_id') {
                const prod = productosSimple.find(p => p.id === val)
                return { ...d, producto_id: val as string, nombre: prod?.nombre ?? '' }
            }
            // Descuento por % y descuento directo en $ son mutuamente excluyentes:
            // al ingresar uno, se limpia el otro.
            if (campo === 'descuento_porcentaje') {
                return { ...d, descuento_porcentaje: val as number, descuento_valor: 0 }
            }
            if (campo === 'descuento_valor') {
                return { ...d, descuento_valor: val as number, descuento_porcentaje: 0 }
            }
            return { ...d, [campo]: val }
        }))
    }

    function removeLinea(i: number) { setDetalle(prev => prev.filter((_, j) => j !== i)) }

    // Segunda forma de digitar una línea: Cantidad + Total (en vez de
    // Cantidad + Costo Unitario) — se despeja el costo unitario hacia atrás
    // con mínimo 4 decimales, respetando el descuento de línea ya ingresado
    // (directo en $ o %), para que el subtotal resultante cuadre exacto con
    // el total que escribió el usuario. Ambas formas conviven: esta solo
    // cambia costo_unitario, el resto de la fila sigue igual.
    function setCostoDesdeTotal(i: number, totalNeto: number) {
        setDetalle(prev => prev.map((d, j) => {
            if (j !== i || d.cantidad <= 0) return d
            const valDesc = d.descuento_valor ?? 0
            const pctDesc = d.descuento_porcentaje ?? 0
            const bruto = valDesc > 0
                ? totalNeto + valDesc
                : pctDesc > 0 ? totalNeto / (1 - pctDesc / 100) : totalNeto
            return { ...d, costo_unitario: Math.round((bruto / d.cantidad) * 10000) / 10000 }
        }))
    }

    // ── Guardar ───────────────────────────────────────────────────────────────
    async function handleGuardar() {
        if (!proveedorId) { alert('Selecciona un proveedor'); return }
        if (formaPago === 'CREDITO' && !fechaVenc) { alert('Ingresa la fecha de vencimiento'); return }

        if (numeroFactura || claveAcceso) {
            const duplicado = await compraService.verificarDuplicado(empresa!.id, claveAcceso || undefined, numeroFactura || undefined, proveedorId)
            if (duplicado) {
                alert(`Ya existe una compra registrada con este número de factura para este proveedor (${numeroFactura || 'clave de acceso'}). Verifica en el listado de Compras — si es un error de digitación, corrígelo antes de guardar.`)
                return
            }
        }

        const retsValidas = retenciones.filter(r => r.codigo && r.valor > 0)
        if (retsValidas.length > 0) {
            const totalRetConfirm = retsValidas.reduce((s, r) => s + r.valor, 0)
            const cxpFinal = Math.max(total - totalRetConfirm, 0)
            const lineas = retsValidas.map(r =>
                `  • Ret. ${r.tipo} ${r.codigo} (${r.pct}%): base $${r.base.toFixed(2)} → $${r.valor.toFixed(2)}`
            ).join('\n')
            const ok = window.confirm(
                `Se registrará el comprobante de retención No. ${numeroRetencion || '(sin número)'}\n\n` +
                lineas + '\n\n' +
                `Total retenciones: $${totalRetConfirm.toFixed(2)}\n` +
                `Valor a Cuentas por Pagar: $${cxpFinal.toFixed(2)}\n\n` +
                `¿Confirmar el registro?`
            )
            if (!ok) return
        }

        try {
            setSaving(true)

            // 1. Auto-crear productos nuevos (rojo)
            const lineasFinales = [...detalle]
            const newItems = lineasFinales.filter(d => d.status === 'new' && !d.producto_id)

            if (newItems.length > 0) {
                const catsLocal = categorias.length > 0
                    ? categorias
                    : (await productoService.getCategorias(empresa!.id) ?? [])
                if (!categorias.length && catsLocal.length) setCategorias(catsLocal)

                for (let i = 0; i < lineasFinales.length; i++) {
                    const d = lineasFinales[i]
                    if (d.status !== 'new' || d.producto_id) continue

                    // Elegir categoría: la que quedó seleccionada en la fila (editable por
                    // el usuario), o si no hay, la sugerida por la IA, o la primera disponible
                    let catId = d.categoria_id ?? null
                    if (!catId && d.categoria_sugerida && catsLocal.length > 0) {
                        const matched = catsLocal.find(c =>
                            c.nombre.toLowerCase().includes(d.categoria_sugerida!.toLowerCase()) ||
                            d.categoria_sugerida!.toLowerCase().includes(c.nombre.toLowerCase()),
                        )
                        catId = matched?.id ?? null
                    }
                    if (!catId) catId = catsLocal[0]?.id ?? null

                    if (!catId) continue  // sin categoría no se puede crear

                    // Costo neto (post-descuento) — base real para sugerir precio y costo promedio
                    const costoUnitNeto = d.cantidad > 0 ? lineaNeta(d).neto / d.cantidad : d.costo_unitario

                    const newProd = await productoService.createProducto({
                        empresa_id:     empresa!.id,
                        codigo:         d.codigo || null,
                        nombre:         d.nombre,
                        descripcion:    d.nombre,
                        precio_venta:   Math.round(costoUnitNeto * 1.3 * 100) / 100,
                        categoria_id:   catId,
                        unidad_id:      d.unidad_id ?? null,
                        iva_porcentaje: d.iva_porcentaje ?? 15,
                        maneja_stock:   true,
                        costo_promedio: costoUnitNeto,
                        activo:         true,
                    } as any)

                    lineasFinales[i] = { ...d, producto_id: newProd.id }
                }
            }

            // 2. Si el usuario cambió Unidad/Categoría de un producto YA EXISTENTE
            //    en esta misma compra, reflejarlo en el catálogo (productos).
            for (const d of lineasFinales) {
                if (!d.producto_id || d.status === 'new') continue  // 'new' ya se creó con lo elegido
                const original = productosCompletos.find(p => p.id === d.producto_id)
                if (!original) continue
                const cambios: { unidad_id?: string | null; categoria_id?: string } = {}
                if (d.unidad_id !== undefined && d.unidad_id !== original.unidad_id) cambios.unidad_id = d.unidad_id
                // categoria_id no es nullable en el catálogo — solo actualizar si eligió una real
                if (d.categoria_id && d.categoria_id !== original.categoria_id) cambios.categoria_id = d.categoria_id
                if (Object.keys(cambios).length > 0) {
                    try { await productoService.updateProducto(d.producto_id, cambios) }
                    catch (e) { console.error('No se pudo actualizar la clasificación del producto', d.producto_id, e) }
                }
            }

            const validas = lineasFinales.filter(d => d.producto_id && d.cantidad > 0 && d.costo_unitario > 0)
            if (!validas.length) { alert('Agrega al menos un producto válido'); return }

            const prov = proveedores.find(p => p.id === proveedorId)
            let fechaVencFinal = fechaVenc
            if (formaPago === 'CREDITO' && !fechaVenc && prov?.dias_credito) {
                const dd = new Date(); dd.setDate(dd.getDate() + prov.dias_credito)
                fechaVencFinal = dd.toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' })
            }

            // Auto-completar base=0 con los totales actuales (cuando la ret viene del proveedor)
            const retsConBase = retenciones.map(r => {
                if (r.base > 0 || !r.codigo) return r
                const base  = r.tipo === 'FUENTE' ? subtotalLineas : ivaCalc
                const valor = Math.round(base * r.pct / 100 * 100) / 100
                return { ...r, base, valor }
            })

            const retsParaGuardar = retsConBase
                .filter(r => r.codigo && r.valor > 0)
                .map(r => ({
                    empresa_id:       empresa!.id,
                    proveedor_id:     proveedorId,
                    numero_retencion: numeroRetencion || undefined,
                    fecha_emision:    HOY,
                    tipo:             r.tipo,
                    codigo_retencion: r.codigo,
                    descripcion:      r.descripcion,
                    base_imponible:   r.base,
                    porcentaje:       r.pct,
                    valor:            r.valor,
                    estado:           'ACTIVO' as const,
                    origen:           'MANUAL' as const,
                    created_by:       profile?.id,
                }))

            const compraGuardada = await compraService.crearInventario(
                {
                    empresa_id: empresa!.id, proveedor_id: proveedorId,
                    numero_factura: numeroFactura || undefined,
                    fecha_ingreso: HOY, fecha_emision: fechaEmision,
                    estab: estab || undefined, pto_emi: ptoEmi || undefined,
                    secuencial: secuencial || undefined,
                    clave_acceso: claveAcceso || undefined,
                    observaciones: observaciones || undefined,
                    base_iva_0: b0, base_iva_5: b5, base_iva_15: b15,
                    subtotal: subtotalLineas, valor_iva: ivaCalc, total,
                    forma_pago: formaPago,
                    fecha_vencimiento: formaPago === 'CREDITO' ? fechaVencFinal : undefined,
                    tipo_sustento: tipoSustento, tipo_documento_sri: tipoDocumentoSri, tipo_regimen_pago: '01',
                    aplica_convenio_ddi: false,
                    estado: 'ACTIVO', origen: 'MANUAL', tipo_compra: 'INVENTARIO',
                    orden_compra_id: ocVinculada || undefined,
                    bodega_id: bodegaId || undefined,
                    created_by: profile?.id,
                },
                validas.map(d => {
                    const { montoDescuento, neto } = lineaNeta(d)
                    return {
                        producto_id:    d.producto_id,
                        cantidad:       d.cantidad,
                        costo_unitario: d.costo_unitario,
                        descuento:      montoDescuento,
                        subtotal:       Math.round(neto * 100) / 100,
                    }
                }),
                retsParaGuardar,
            )

            if (compraGuardada?.cxpError) {
                alert(`⚠️ Compra guardada, pero la cuenta por pagar NO se creó:\n${compraGuardada.cxpError}\n\nLa factura no aparecerá en Tesorería → Egresos.\nContacte al administrador para revisar los permisos de la base de datos.`)
            }

            // Asiento contable automático
            try {
                const contaConfig = await contableConfigService.getConfig(empresa!.id)
                if (contaConfig?.contabilidad_en_linea) {
                    await contabilidadComprasService.crearAsientoCompra({
                        empresaId:       empresa!.id,
                        portalRuc:       empresa!.ruc ?? '',
                        fecha:           HOY,
                        numeroFactura:   numeroFactura || secuencial || '—',
                        proveedorNombre: prov?.nombre_empresa ?? proveedorId.slice(0, 12),
                        subtotal:        subtotalLineas,
                        valorIva:        ivaCalc,
                        retenciones:     retsParaGuardar.map(r => ({ tipo: r.tipo, codigo: r.codigo_retencion, valor: r.valor })),
                        tipoCompra:      'INVENTARIO',
                        compraId:        compraGuardada?.id,
                    })
                }
            } catch (contabErr: any) {
                console.error('[asientoCompra] Error:', contabErr)
                alert(`⚠️ Compra guardada correctamente.\nEl asiento contable no se generó:\n${contabErr?.message ?? contabErr}`)
            }

            // Auto-autorizar retención electrónica en background (no bloquea la navegación)
            if (retsParaGuardar.length > 0 && compraGuardada?.id) {
                supabase.functions.invoke('sri-retencion', {
                    body: { compra_id: compraGuardada.id, empresa_id: empresa!.id }
                }).catch(err => console.error('[sri-retencion] Auto-autorización error:', err))
            }

            clearDraft()
            navigate('/compras')
        } catch (e: any) {
            alert('Error al guardar: ' + e.message)
        } finally {
            setSaving(false)
        }
    }

    if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Cargando...</div>

    return (
        <div className="space-y-5 max-w-5xl">
            {/* Header */}
            <div className="flex items-center gap-3">
                <button onClick={() => navigate('/compras')}
                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Nueva Compra de Inventario</h1>
                    <p className="text-slate-500 text-sm">Factura de proveedor con ingreso al kardex</p>
                </div>
                <HelpButton pageKey="compras-inventario" />
            </div>

            {/* ── OCR: cargar factura (solo si Billennium habilitó esta IA) ───────── */}
            {ocrIaHabilitado && (
                <div className="card p-4 border-2 border-dashed border-primary-200 bg-primary-50 space-y-3">
                    <div className="flex items-center gap-4">
                        <ScanLine className="w-8 h-8 text-primary-400 shrink-0" />
                        <div className="flex-1">
                            <p className="font-semibold text-primary-700 text-sm">Cargar factura del proveedor (PDF o imagen)</p>
                            <p className="text-xs text-primary-500 mt-0.5">
                                Gemini AI extrae cabecera y detalle automáticamente — revisa y corrige antes de guardar
                            </p>
                        </div>
                        <label className={cn(
                            'btn btn-primary btn-sm flex items-center gap-2 cursor-pointer',
                            ocrLoading && 'opacity-60 cursor-not-allowed pointer-events-none',
                        )}>
                            {ocrLoading
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Analizando...</>
                                : <><Upload className="w-4 h-4" /> Cargar factura</>
                            }
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,image/*"
                                className="hidden"
                                disabled={ocrLoading}
                                onChange={e => { const f = e.target.files?.[0]; if (f) handleOcrFile(f) }}
                            />
                        </label>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-medium text-primary-700 cursor-pointer select-none">
                        <input type="checkbox" checked={ocrSinDetalle} onChange={e => setOcrSinDetalle(e.target.checked)}
                            className="rounded border-primary-300 text-primary-600 focus:ring-primary-400" />
                        Sin Detalle — solo traer cabecera y totales, sin llenar las líneas de producto
                    </label>
                </div>
            )}

            {/* Vincular Orden de Compra */}
            {ordenesCompra.length > 0 && (
                <div className="card p-4 flex items-center gap-3 bg-amber-50 border border-amber-200">
                    <CheckSquare className="w-4 h-4 text-amber-600 shrink-0" />
                    <label className="text-sm font-medium text-amber-800 whitespace-nowrap">Vincular OC:</label>
                    <select className="flex-1 border border-amber-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-amber-400 outline-none"
                        value={ocVinculada} onChange={e => vincularOC(e.target.value)}>
                        <option value="">— Sin orden de compra —</option>
                        {ordenesCompra.map(oc => (
                            <option key={oc.id} value={oc.id}>
                                {oc.numero_oc} — {(oc.proveedor as any)?.nombre_empresa ?? 'Sin proveedor'}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* Datos del comprobante */}
            <div className="card p-5 space-y-4">
                <h2 className="font-bold text-slate-700 text-sm uppercase tracking-wider">Datos del comprobante</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="label">Proveedor <span className="text-red-500">*</span></label>
                        <select className={inp} value={proveedorId} onChange={e => {
                            setProveedorId(e.target.value)
                            const prov = proveedores.find(p => p.id === e.target.value)
                            if (prov?.condicion_pago === 'CREDITO') {
                                setFormaPago('CREDITO')
                                if (prov.dias_credito) {
                                    const d = new Date(); d.setDate(d.getDate() + prov.dias_credito)
                                    setFechaVenc(d.toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' }))
                                }
                            }
                            // Auto-retenciones del proveedor — porcentaje/descripción siempre desde codigos_retencion
                            const autoRets: RetLine[] = []
                            if (prov?.ret_fuente_codigo) {
                                const cat = codigosRet.find(c => c.codigo === prov.ret_fuente_codigo && c.tipo === 'FUENTE')
                                if (cat) autoRets.push({ tipo: 'FUENTE', codigo: cat.codigo, descripcion: cat.descripcion, base: 0, pct: cat.porcentaje, valor: 0 })
                            }
                            if (prov?.ret_iva_codigo) {
                                const cat = codigosRet.find(c => c.codigo === prov.ret_iva_codigo && c.tipo === 'IVA')
                                if (cat) autoRets.push({ tipo: 'IVA', codigo: cat.codigo, descripcion: cat.descripcion, base: 0, pct: cat.porcentaje, valor: 0 })
                            }
                            if (autoRets.length > 0) {
                                const retsCalculadas = autoRets.map(r => {
                                    const base  = r.tipo === 'FUENTE' ? subtotalLineas : ivaCalc
                                    const valor = Math.round(base * r.pct / 100 * 100) / 100
                                    return { ...r, base, valor }
                                })
                                setRetenciones(retsCalculadas)
                                setRetSeccion(true)
                            }
                        }}>
                            <option value="">Seleccionar proveedor...</option>
                            {proveedores.map(p => (
                                <option key={p.id} value={p.id}>{p.nombre_empresa} — {p.ruc}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="label">Bodega destino <span className="text-red-500">*</span></label>
                        <select className={inp} value={bodegaId} onChange={e => setBodegaId(e.target.value)}>
                            <option value="">Seleccionar bodega...</option>
                            {bodegas.map(b => (
                                <option key={b.id} value={b.id}>
                                    {b.codigo ? `[${b.codigo}] ` : ''}{b.nombre}{b.es_principal ? ' ★' : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="label">Fecha emisión factura</label>
                        <input type="date" className={inp} value={fechaEmision}
                            onChange={e => setFechaEmision(e.target.value)} />
                    </div>
                </div>

                <div className="flex flex-wrap gap-3 items-end">
                    <div className="w-20">
                        <label className="label text-xs">Estab.</label>
                        <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-primary-500 outline-none"
                            maxLength={3} placeholder="001" value={estab} onChange={e => setEstab(e.target.value)} />
                    </div>
                    <div className="w-20">
                        <label className="label text-xs">Pto. Emi.</label>
                        <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-primary-500 outline-none"
                            maxLength={3} placeholder="001" value={ptoEmi} onChange={e => setPtoEmi(e.target.value)} />
                    </div>
                    <div className="w-36">
                        <label className="label text-xs">Secuencial</label>
                        <input className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-primary-500 outline-none"
                            maxLength={9} placeholder="000000001" value={secuencial} onChange={e => setSecuencial(e.target.value)} />
                    </div>
                    <div className="flex-1 min-w-[180px]">
                        <label className="label text-xs">Nº Factura (auto)</label>
                        <input className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono bg-slate-50 text-slate-500"
                            readOnly value={numeroFactura} placeholder="001-001-000000001" />
                    </div>
                </div>

                <div>
                    <label className="label text-xs">Clave de acceso (opcional)</label>
                    <input className={cn(inp, 'font-mono text-xs')} maxLength={49} value={claveAcceso}
                        onChange={e => setClaveAcceso(e.target.value)} placeholder="49 dígitos SRI" />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <label className="label text-xs">Tipo de documento (SRI)</label>
                        <select className={inp} value={tipoDocumentoSri}
                            onChange={e => setTipoDocumentoSri(e.target.value as TipoDocumentoSri)}>
                            {Object.entries(TIPO_DOCUMENTO_SRI_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>{k} — {v}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="label text-xs">Tipo sustento (ATS)</label>
                        <select className={inp} value={tipoSustento}
                            onChange={e => setTipoSustento(e.target.value as '01'|'02'|'03'|'04'|'05')}>
                            {Object.entries(TIPO_SUSTENTO_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>{k} — {v}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="label text-xs">Forma de pago</label>
                        <select className={inp} value={formaPago}
                            onChange={e => setFormaPago(e.target.value as 'CONTADO'|'CREDITO')}>
                            <option value="CONTADO">Contado</option>
                            <option value="CREDITO">Crédito</option>
                        </select>
                    </div>
                    {formaPago === 'CREDITO' && (
                        <div>
                            <label className="label text-xs">Fecha vencimiento <span className="text-red-500">*</span></label>
                            <input type="date" className={inp} value={fechaVenc}
                                onChange={e => setFechaVenc(e.target.value)} />
                        </div>
                    )}
                </div>

                <div>
                    <label className="label text-xs">Observaciones</label>
                    <input className={inp} value={observaciones}
                        onChange={e => setObservaciones(e.target.value)} placeholder="Notas internas..." />
                </div>
            </div>

            {/* Productos */}
            <div className="card p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="font-bold text-slate-700 text-sm uppercase tracking-wider">Productos</h2>
                    <div className="flex items-center gap-2">
                        {detalle.length > 0 && (
                            <button
                                onClick={() => { if (confirm(`¿Vaciar las ${detalle.length} línea(s) de detalle? Esta acción no se puede deshacer.`)) setDetalle([]) }}
                                className="btn btn-sm flex items-center gap-1.5 border border-red-200 text-red-600 hover:bg-red-50">
                                <Trash2 className="w-4 h-4" /> Vaciar detalle
                            </button>
                        )}
                        <button onClick={addLinea} className="btn btn-primary btn-sm flex items-center gap-1.5">
                            <Plus className="w-4 h-4" /> Agregar
                        </button>
                    </div>
                </div>

                {/* Leyenda de colores — solo cuando hay líneas OCR */}
                {hasOcrLines && (
                    <div className="flex flex-wrap items-center gap-4 text-xs bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5">
                        <span className="font-semibold text-slate-500 uppercase tracking-wider">Nomenclatura:</span>
                        <span className="flex items-center gap-1.5 text-slate-700">
                            <span className="w-2.5 h-2.5 rounded-full bg-slate-400 shrink-0" />
                            Código encontrado en catálogo
                        </span>
                        <span className="flex items-center gap-1.5 text-blue-700">
                            <span className="w-2.5 h-2.5 rounded-full bg-blue-400 shrink-0" />
                            Encontrado por descripción — verifica
                        </span>
                        <span className="flex items-center gap-1.5 text-red-600">
                            <span className="w-2.5 h-2.5 rounded-full bg-red-400 shrink-0" />
                            Producto nuevo — se creará automáticamente al guardar
                        </span>
                    </div>
                )}

                {detalle.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                        <Package className="w-10 h-10 mx-auto mb-2 text-slate-200" />
                        <p className="text-sm">Carga una factura con el botón de arriba o agrega productos manualmente</p>
                    </div>
                ) : (
                    <>
                        <div className="overflow-visible">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-[11px] text-slate-500 border-b">
                                        <th className="w-3 py-1.5" />
                                        <th className="text-left py-1.5 pr-2 w-24 font-semibold">Código</th>
                                        <th className="text-left py-1.5 pr-2 font-semibold">Producto</th>
                                        <th className="text-left py-1.5 px-2 w-20 font-semibold">Unidad</th>
                                        <th className="text-left py-1.5 px-2 w-28 font-semibold">Categoría</th>
                                        <th className="text-right py-1.5 px-2 w-16 font-semibold">Cant.</th>
                                        <th className="text-right py-1.5 px-2 w-20 font-semibold" title="Precio unitario">Costo</th>
                                        <th className="text-right py-1.5 px-2 w-16 font-semibold">Dsc. %</th>
                                        <th className="text-right py-1.5 px-2 w-20 font-semibold">Dsc. $</th>
                                        <th className="text-right py-1.5 px-2 w-24 font-semibold" title="También editable: escribe el total de la línea y se calcula el costo unitario">Subtotal / Total</th>
                                        <th className="w-8" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {detalle.map((d, i) => {
                                        const isOcr = d.status !== undefined
                                        const textColor = d.status === 'found' ? 'text-slate-900'
                                            : d.status === 'by_description' ? 'text-blue-700'
                                            : d.status === 'new' ? 'text-red-600'
                                            : 'text-slate-900'
                                        const rowBg = d.status === 'new' ? 'bg-red-50'
                                            : d.status === 'by_description' ? 'bg-blue-50/40'
                                            : ''
                                        const dotColor = d.status === 'found' ? 'bg-slate-400'
                                            : d.status === 'by_description' ? 'bg-blue-400'
                                            : d.status === 'new' ? 'bg-red-400'
                                            : 'bg-transparent'

                                        return (
                                            <tr key={i} className={rowBg}>
                                                {/* Indicador de estado */}
                                                <td className="py-2 pr-1">
                                                    <span className={cn('block w-2 h-2 rounded-full mx-auto', dotColor)} />
                                                </td>

                                                {/* Código */}
                                                <td className="py-1.5 pr-2">
                                                    <input
                                                        className={cn('w-full border border-slate-200 rounded px-1.5 py-1 text-[11px] font-mono bg-transparent focus:bg-white focus:border-primary-400 outline-none', textColor)}
                                                        value={d.codigo || ''}
                                                        onChange={e => updLinea(i, 'codigo', e.target.value)}
                                                        placeholder="COD"
                                                    />
                                                </td>

                                                {/* Producto */}
                                                <td className="py-1.5 pr-2 relative" style={{ minWidth: 200 }}>
                                                    {isOcr && d.status !== 'new' ? (
                                                        <input
                                                            className={cn('w-full border border-slate-200 rounded px-1.5 py-1 text-xs bg-transparent focus:bg-white focus:border-primary-400 outline-none font-medium', textColor)}
                                                            value={d.nombre}
                                                            onChange={e => updLinea(i, 'nombre', e.target.value)}
                                                        />
                                                    ) : d.producto_id ? (
                                                        <div className="flex items-center gap-1">
                                                            <span className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-1.5 py-1 truncate">{d.nombre || d.producto_id}</span>
                                                            <button type="button" onClick={() => updLinea(i, 'producto_id', '')}
                                                                className="text-slate-400 hover:text-red-500 text-xs px-1">✕</button>
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-1">
                                                            {/* Línea roja del PDF sin match — el texto se conserva como
                                                                pista para buscar el producto real que sí existe. */}
                                                            {d.status === 'new' && d.nombre && (
                                                                <p className="text-[10px] text-red-500 italic truncate" title={d.nombre}>
                                                                    PDF: {d.nombre}
                                                                </p>
                                                            )}
                                                            <BuscadorProducto
                                                                empresaId={empresa!.id}
                                                                placeholder="Buscar (Enter o Buscar)…"
                                                                onSelect={(p: ProductoResultado) => {
                                                                    setDetalle(prev => prev.map((d2, j) => j !== i ? d2
                                                                        : { ...d2, producto_id: p.id, nombre: p.nombre, codigo: p.codigo ?? '', unidad_id: p.unidad_id ?? null, categoria_id: p.categoria_id ?? null, status: 'found' as LineaStatus }))
                                                                }}
                                                            />
                                                        </div>
                                                    )}
                                                </td>

                                                {/* Unidad — editable si hay producto identificado (nuevo o existente) */}
                                                <td className="py-1.5 px-2">
                                                    {(d.status === 'new' || d.producto_id) ? (
                                                        <select className={inpSm}
                                                            value={d.unidad_id ?? ''}
                                                            onChange={e => updLinea(i, 'unidad_id', e.target.value || null)}>
                                                            <option value="">—</option>
                                                            {unidades.map(u => <option key={u.id} value={u.id}>{u.codigo}</option>)}
                                                        </select>
                                                    ) : (
                                                        <span className="text-[11px] text-slate-300">—</span>
                                                    )}
                                                </td>

                                                {/* Categoría — editable si hay producto identificado (nuevo o existente) */}
                                                <td className="py-1.5 px-2">
                                                    {(d.status === 'new' || d.producto_id) ? (
                                                        <select className={inpSm}
                                                            value={d.categoria_id ?? ''}
                                                            onChange={e => updLinea(i, 'categoria_id', e.target.value || null)}>
                                                            <option value="">—</option>
                                                            {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                                        </select>
                                                    ) : (
                                                        <span className="text-[11px] text-slate-300">—</span>
                                                    )}
                                                </td>

                                                {/* Cantidad */}
                                                <td className="py-1.5 px-2">
                                                    <input type="text" inputMode="decimal"
                                                        className={cn(inpSm, 'text-right')}
                                                        value={numVal(`cant_${i}`, d.cantidad)}
                                                        onFocus={e => e.target.select()}
                                                        onChange={e => numChange(`cant_${i}`, e.target.value, v => updLinea(i, 'cantidad', v))}
                                                        onBlur={() => numBlur(`cant_${i}`, v => updLinea(i, 'cantidad', v))} />
                                                </td>

                                                {/* Costo */}
                                                <td className="py-1.5 px-2">
                                                    <input type="text" inputMode="decimal"
                                                        className={cn(inpSm, 'text-right')}
                                                        value={numVal(`costo_${i}`, d.costo_unitario)}
                                                        onFocus={e => e.target.select()}
                                                        onChange={e => numChange(`costo_${i}`, e.target.value, v => updLinea(i, 'costo_unitario', v))}
                                                        onBlur={() => numBlur(`costo_${i}`, v => updLinea(i, 'costo_unitario', v))} />
                                                </td>

                                                {/* Descuento % — deshabilitado si ya hay descuento directo en $ */}
                                                <td className="py-1.5 px-2">
                                                    <input type="text" inputMode="decimal"
                                                        disabled={(d.descuento_valor ?? 0) > 0}
                                                        title={(d.descuento_valor ?? 0) > 0 ? 'Ya hay un descuento directo en $ para esta línea' : undefined}
                                                        className={cn(inpSm, 'text-right', (d.descuento_valor ?? 0) > 0 && 'opacity-40 pointer-events-none')}
                                                        value={numVal(`desc_${i}`, d.descuento_porcentaje ?? 0)}
                                                        onChange={e => numChange(`desc_${i}`, e.target.value, v => updLinea(i, 'descuento_porcentaje', Math.min(v, 100)))}
                                                        onBlur={() => numBlur(`desc_${i}`, v => updLinea(i, 'descuento_porcentaje', Math.min(v, 100)))} />
                                                </td>

                                                {/* Descuento directo en $ — deshabilitado si ya hay % */}
                                                <td className="py-1.5 px-2">
                                                    <input type="text" inputMode="decimal"
                                                        disabled={(d.descuento_porcentaje ?? 0) > 0}
                                                        title={(d.descuento_porcentaje ?? 0) > 0 ? 'Ya hay un % de descuento para esta línea' : undefined}
                                                        className={cn(inpSm, 'text-right', (d.descuento_porcentaje ?? 0) > 0 && 'opacity-40 pointer-events-none')}
                                                        value={numVal(`descval_${i}`, d.descuento_valor ?? 0)}
                                                        onChange={e => numChange(`descval_${i}`, e.target.value, v => updLinea(i, 'descuento_valor', Math.max(v, 0)))}
                                                        onBlur={() => numBlur(`descval_${i}`, v => updLinea(i, 'descuento_valor', Math.max(v, 0)))} />
                                                </td>

                                                {/* Subtotal (neto de descuento) — también editable: escribir el TOTAL
                                                    de la línea calcula el costo unitario hacia atrás (mín. 4 decimales),
                                                    para cuando el proveedor solo da el total y no el precio unitario. */}
                                                <td className="py-1.5 px-2 text-right font-mono">
                                                    {((d.descuento_porcentaje ?? 0) > 0 || (d.descuento_valor ?? 0) > 0) && (
                                                        <div className="text-[9px] text-slate-400 line-through leading-tight">
                                                            ${lineaNeta(d).bruto.toFixed(2)}
                                                        </div>
                                                    )}
                                                    <input type="text" inputMode="decimal"
                                                        title="Escribe el TOTAL de la línea para calcular el precio unitario automáticamente"
                                                        className={cn(inpSm, 'text-right font-semibold text-slate-800')}
                                                        value={numVal(`total_${i}`, Math.round(lineaNeta(d).neto * 10000) / 10000)}
                                                        onFocus={e => e.target.select()}
                                                        onChange={e => numChange(`total_${i}`, e.target.value, v => setCostoDesdeTotal(i, v))}
                                                        onBlur={() => numBlur(`total_${i}`, v => setCostoDesdeTotal(i, v))} />
                                                </td>

                                                {/* Eliminar */}
                                                <td className="py-1.5 pl-2">
                                                    <button onClick={() => removeLinea(i)}
                                                        className="p-1 hover:bg-red-50 rounded text-slate-300 hover:text-red-500">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Aviso productos nuevos */}
                        {nNew > 0 && (
                            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                                <strong>{nNew} producto(s) nuevo(s)</strong> se crearán automáticamente en el catálogo al guardar esta compra.
                                Puedes editar el nombre y código antes de guardar.
                            </div>
                        )}

                        {/* Descuento global de factura — cuando el proveedor solo da el total, no por línea */}
                        <div className="border-t pt-4">
                            <p className="text-xs font-bold text-slate-500 uppercase mb-2">Descuento global de factura (opcional)</p>
                            <div className="flex flex-wrap items-end gap-3">
                                <div className="w-40">
                                    <label className="label text-xs">Descuento total $</label>
                                    <input type="text" inputMode="decimal" className={cn(inp, 'text-right')}
                                        value={numVal('descTotal', descuentoTotalFactura)}
                                        onChange={e => numChange('descTotal', e.target.value, setDescuentoTotalFactura)}
                                        onBlur={() => numBlur('descTotal', setDescuentoTotalFactura)} />
                                </div>
                                <button type="button" onClick={distribuirDescuentoTotal}
                                    className="btn btn-secondary btn-sm">
                                    Distribuir entre líneas
                                </button>
                                <p className="text-xs text-slate-400 max-w-sm">
                                    Úsalo cuando la factura del proveedor solo indica el descuento total (no por producto): aplica el mismo % a todas las líneas actuales.
                                </p>
                            </div>
                        </div>

                        {/* IVA */}
                        <div className="border-t pt-4 space-y-3">
                            <div className="flex items-center gap-3">
                                <p className="text-xs font-bold text-slate-500 uppercase">Impuestos</p>
                                <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                                    <input type="checkbox" checked={usarIvaManual}
                                        onChange={e => setUsarIvaManual(e.target.checked)} />
                                    Ingresar bases manualmente (desde la factura)
                                </label>
                            </div>

                            {usarIvaManual ? (
                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <label className="label text-xs">Base IVA 0%</label>
                                        <input type="text" inputMode="decimal" className={cn(inp, 'text-right')}
                                            value={numVal('iva0', baseIva0)}
                                            onChange={e => numChange('iva0', e.target.value, setBaseIva0)}
                                            onBlur={() => numBlur('iva0', setBaseIva0)} />
                                    </div>
                                    <div>
                                        <label className="label text-xs">Base IVA 5%</label>
                                        <input type="text" inputMode="decimal" className={cn(inp, 'text-right')}
                                            value={numVal('iva5', baseIva5)}
                                            onChange={e => numChange('iva5', e.target.value, setBaseIva5)}
                                            onBlur={() => numBlur('iva5', setBaseIva5)} />
                                    </div>
                                    <div>
                                        <label className="label text-xs">Base IVA 15%</label>
                                        <input type="text" inputMode="decimal" className={cn(inp, 'text-right')}
                                            value={numVal('iva15', baseIva15)}
                                            onChange={e => numChange('iva15', e.target.value, setBaseIva15)}
                                            onBlur={() => numBlur('iva15', setBaseIva15)} />
                                    </div>
                                </div>
                            ) : (
                                <p className="text-xs text-slate-500">
                                    IVA calculado al 15% sobre el subtotal de productos: <strong>${ivaCalc.toFixed(2)}</strong>
                                </p>
                            )}
                        </div>

                        {/* Totales — siempre visibles y desglosados por tasa desde la primera línea, sin depender del checklist de IMPUESTOS */}
                        <div className="flex justify-between items-start border-t pt-3">
                            <div className="space-y-0.5 text-sm text-slate-500">
                                <p>Base 0%: <span className="font-mono text-slate-700">${b0.toFixed(2)}</span></p>
                                <p>Base 5%: <span className="font-mono text-slate-700">${b5.toFixed(2)}</span> &nbsp;IVA 5%: <span className="font-mono text-slate-700">${iva5.toFixed(2)}</span></p>
                                <p>Base 15%: <span className="font-mono text-slate-700">${b15.toFixed(2)}</span> &nbsp;IVA 15%: <span className="font-mono text-slate-700">${iva15.toFixed(2)}</span></p>
                                <p className="pt-1 mt-1 border-t border-slate-100">Subtotal: <span className="font-mono text-slate-700">${subtotalLineas.toFixed(2)}</span> &nbsp;IVA total: <span className="font-mono text-slate-700">${ivaCalc.toFixed(2)}</span></p>
                                {totalRet > 0 && <p>Total retenciones: <span className="font-mono text-amber-700">-${totalRet.toFixed(2)}</span></p>}
                                {formaPago === 'CREDITO' && totalRet > 0 && (
                                    <p className="font-semibold text-slate-600">CxP a crédito: <span className="font-mono">${Math.max(total - totalRet, 0).toFixed(2)}</span></p>
                                )}
                            </div>
                            <div className="text-right">
                                <p className="text-xs text-slate-400">TOTAL FACTURA</p>
                                <p className="text-2xl font-bold text-primary-700">${total.toFixed(2)}</p>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Retenciones — visible solo si la empresa es agente de retención */}
            {empresa?.es_agente_retencion ? (
                <div className="card overflow-hidden">
                    <button onClick={() => setRetSeccion(v => !v)}
                        className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-700 text-sm uppercase tracking-wider">Retenciones</span>
                            {retenciones.filter(r => r.valor > 0).length > 0 && (
                                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                                    {retenciones.filter(r => r.valor > 0).length} ret. — ${totalRet.toFixed(2)}
                                </span>
                            )}
                        </div>
                        {retSeccion ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </button>

                    {retSeccion && (
                        <div className="p-5 pt-0 border-t border-slate-100">
                            <RetencionesEditor
                                numeroRetencion={numeroRetencion}
                                onChangeNumero={setNumeroRetencion}
                                retenciones={retenciones}
                                onChange={setRetenciones}
                                baseDefault={subtotalLineas}
                                baseIva={ivaCalc}
                                codigos={codigosRet}
                            />
                        </div>
                    )}
                </div>
            ) : (
                <div className="card p-4 flex items-start gap-3 bg-slate-50 border border-slate-200">
                    <Info className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-slate-500">
                        Su empresa no está configurada como Agente de Retención.{' '}
                        Si fue designado por el SRI, actívelo en{' '}
                        <a href="/configuracion" className="text-primary-600 font-semibold hover:underline">
                            Ajustes → Empresa
                        </a>.
                    </p>
                </div>
            )}

            <div className="flex justify-end gap-3">
                <button onClick={() => navigate('/compras')} className="btn btn-secondary">Cancelar</button>
                <button onClick={handleGuardar}
                    disabled={saving || detalle.length === 0}
                    className={cn('btn btn-primary flex items-center gap-2',
                        (saving || detalle.length === 0) && 'opacity-50 cursor-not-allowed')}>
                    {saving
                        ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Guardando...</>
                        : <><Save className="w-4 h-4" /> Registrar compra</>
                    }
                </button>
            </div>
        </div>
    )
}
