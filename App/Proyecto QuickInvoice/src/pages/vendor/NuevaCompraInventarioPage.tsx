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
import { TIPO_SUSTENTO_LABELS } from '../../types/vendors'
import { RetencionesEditor } from '../../components/vendor/RetencionesEditor'
import type { RetLine } from '../../components/vendor/RetencionesEditor'
import { geminiService } from '../../services/geminiService'
import { productoService } from '../../services/productoService'
import type { Categoria } from '../../services/productoService'
import type { TipoProveedor } from '../../types/vendors'
import {
    ArrowLeft, Plus, Trash2, Save, Package, ChevronDown, ChevronUp, CheckSquare,
    ScanLine, Upload, Loader2, Info,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { BuscadorProducto, type ProductoResultado } from '../../components/BuscadorProducto'

const inp = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white'

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
    iva_porcentaje?: number
    status?: LineaStatus
    categoria_sugerida?: string
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
    const navigate = useNavigate()
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [proveedores, setProveedores] = useState<Proveedor[]>([])
    const [productosSimple, setProductosSimple] = useState<{ id: string; nombre: string }[]>([])
    const [productosCompletos, setProductosCompletos] = useState<{ id: string; codigo: string | null; nombre: string }[]>([])
    const [categorias, setCategorias] = useState<Categoria[]>([])
    const [bodegas, setBodegas]       = useState<Bodega[]>([])
    const [loading, setLoading]       = useState(true)
    const [saving, setSaving]         = useState(false)
    const [ocrLoading, setOcrLoading] = useState(false)

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
    const [formaPago, setFormaPago]         = useState<'CONTADO'|'CREDITO'>('CREDITO')
    const [fechaVenc, setFechaVenc]         = useState(fechaMasDias(30))
    const [observaciones, setObservaciones] = useState('')

    // Detalle
    const [detalle, setDetalle] = useState<LineaDetalle[]>([])

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
            claveAcceso, tipoSustento, formaPago, fechaVenc, observaciones,
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
            claveAcceso, tipoSustento, formaPago, fechaVenc, observaciones,
            detalle, usarIvaManual, baseIva0, baseIva5, baseIva15,
            numeroRetencion, retenciones, retSeccion, ocVinculada,
        ],
    )

    useEffect(() => { if (empresa?.id) load() }, [empresa?.id])

    async function load() {
        try {
            const { data: prodsData } = await supabase
                .from('productos').select('id, codigo, nombre')
                .eq('empresa_id', empresa!.id).eq('activo', true).order('nombre')
            const [provs, ocs, bods, cats, codigos] = await Promise.all([
                proveedorService.listar(empresa!.id),
                ocService.listar(empresa!.id),
                bodegaService.listar(empresa!.id),
                productoService.getCategorias(empresa!.id),
                codigoRetencionService.listar(empresa!.id),
            ])
            setOrdenesCompra(ocs.filter(o => o.estado === 'ENVIADA' || o.estado === 'PARCIALMENTE_RECIBIDA'))
            setProveedores(provs.filter(p => p.estado === 'ACTIVO'))
            setCodigosRet(codigos.filter(c => c.activo))
            setProductosCompletos(prodsData ?? [])
            setProductosSimple((prodsData ?? []).map(p => ({ id: p.id, nombre: p.nombre })))
            setCategorias(cats ?? [])
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
                base64, mimeType, categorias.map(c => c.nombre),
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

            // ── Validar detalle contra catálogo ───────────────────────────
            const lineasValidadas: LineaDetalle[] = ocr.detalle.map(item => {
                const normStr = (s: string) => (s ?? '').toLowerCase().trim()
                const codNorm = normStr(item.codigo)

                // 1. Coincidencia exacta por código
                const byCode = productosCompletos.find(p =>
                    p.codigo && normStr(p.codigo) === codNorm && codNorm.length > 0,
                )
                if (byCode) return {
                    producto_id:     byCode.id,
                    codigo:          item.codigo,
                    nombre:          byCode.nombre,
                    cantidad:        item.cantidad,
                    costo_unitario:  item.precio_unitario,
                    iva_porcentaje:  item.iva_porcentaje,
                    status:          'found' as LineaStatus,
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
                    costo_unitario:   item.precio_unitario,
                    iva_porcentaje:   item.iva_porcentaje,
                    status:           'by_description' as LineaStatus,
                    categoria_sugerida: item.categoria_sugerida,
                }

                // 3. Producto nuevo
                return {
                    producto_id:      '',
                    codigo:           item.codigo,
                    nombre:           item.descripcion,
                    cantidad:         item.cantidad,
                    costo_unitario:   item.precio_unitario,
                    iva_porcentaje:   item.iva_porcentaje,
                    status:           'new' as LineaStatus,
                    categoria_sugerida: item.categoria_sugerida,
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
                `✅ Factura analizada: ${lineasValidadas.length} producto(s)`,
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
    const subtotalLineas = detalle.reduce((s, d) => s + d.cantidad * d.costo_unitario, 0)
    const b0  = usarIvaManual ? baseIva0  : 0
    const b5  = usarIvaManual ? baseIva5  : 0
    const b15 = usarIvaManual ? baseIva15 : subtotalLineas
    const ivaCalc = Math.round((b5 * 0.05 + b15 * 0.15) * 100) / 100
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
        setter(parseFloat(rawInputs[key] ?? '') || 0)
        setRawInputs(prev => { const next = { ...prev }; delete next[key]; return next })
    }

    function addLinea() {
        setDetalle(prev => [...prev, { producto_id: '', codigo: '', nombre: '', cantidad: 1, costo_unitario: 0 }])
    }

    function updLinea(i: number, campo: keyof LineaDetalle, val: unknown) {
        setDetalle(prev => prev.map((d, j) => {
            if (j !== i) return d
            if (campo === 'producto_id') {
                const prod = productosSimple.find(p => p.id === val)
                return { ...d, producto_id: val as string, nombre: prod?.nombre ?? '' }
            }
            return { ...d, [campo]: val }
        }))
    }

    function removeLinea(i: number) { setDetalle(prev => prev.filter((_, j) => j !== i)) }

    // ── Guardar ───────────────────────────────────────────────────────────────
    async function handleGuardar() {
        if (!proveedorId) { alert('Selecciona un proveedor'); return }
        if (formaPago === 'CREDITO' && !fechaVenc) { alert('Ingresa la fecha de vencimiento'); return }

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

                    // Elegir categoría: usar la sugerida por la IA, o la primera disponible
                    let catId = catsLocal[0]?.id ?? null
                    if (d.categoria_sugerida && catsLocal.length > 0) {
                        const matched = catsLocal.find(c =>
                            c.nombre.toLowerCase().includes(d.categoria_sugerida!.toLowerCase()) ||
                            d.categoria_sugerida!.toLowerCase().includes(c.nombre.toLowerCase()),
                        )
                        if (matched) catId = matched.id
                    }

                    if (!catId) continue  // sin categoría no se puede crear

                    const newProd = await productoService.createProducto({
                        empresa_id:     empresa!.id,
                        codigo:         d.codigo || null,
                        nombre:         d.nombre,
                        descripcion:    d.nombre,
                        precio_venta:   Math.round(d.costo_unitario * 1.3 * 100) / 100,
                        categoria_id:   catId,
                        iva_porcentaje: d.iva_porcentaje ?? 15,
                        maneja_stock:   true,
                        costo_promedio: d.costo_unitario,
                        activo:         true,
                    } as any)

                    lineasFinales[i] = { ...d, producto_id: newProd.id }
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
                    tipo_sustento: tipoSustento, tipo_regimen_pago: '01',
                    aplica_convenio_ddi: false,
                    estado: 'ACTIVO', origen: 'MANUAL', tipo_compra: 'INVENTARIO',
                    orden_compra_id: ocVinculada || undefined,
                    bodega_id: bodegaId || undefined,
                    created_by: profile?.id,
                },
                validas.map(d => ({
                    producto_id:    d.producto_id,
                    cantidad:       d.cantidad,
                    costo_unitario: d.costo_unitario,
                    subtotal:       Math.round(d.cantidad * d.costo_unitario * 100) / 100,
                })),
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

            {/* ── OCR: cargar factura ───────────────────────────────────────────── */}
            <div className="card p-4 border-2 border-dashed border-primary-200 bg-primary-50">
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
            </div>

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

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
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
                    <button onClick={addLinea} className="btn btn-primary btn-sm flex items-center gap-1.5">
                        <Plus className="w-4 h-4" /> Agregar
                    </button>
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
                                    <tr className="text-xs text-slate-500 border-b">
                                        <th className="w-3 py-2" />
                                        <th className="text-left py-2 pr-2 w-28 font-semibold">Código</th>
                                        <th className="text-left py-2 pr-3 font-semibold">Producto</th>
                                        <th className="text-right py-2 px-3 w-24 font-semibold">Cant.</th>
                                        <th className="text-right py-2 px-3 w-28 font-semibold">Costo unit.</th>
                                        <th className="text-right py-2 px-3 w-28 font-semibold">Subtotal</th>
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
                                                <td className="py-2 pr-2">
                                                    <input
                                                        className={cn('w-full border border-slate-200 rounded px-2 py-1.5 text-xs font-mono bg-transparent focus:bg-white focus:border-primary-400 outline-none', textColor)}
                                                        value={d.codigo || ''}
                                                        onChange={e => updLinea(i, 'codigo', e.target.value)}
                                                        placeholder="COD"
                                                    />
                                                </td>

                                                {/* Producto */}
                                                <td className="py-2 pr-3 relative" style={{ minWidth: 260 }}>
                                                    {isOcr ? (
                                                        <input
                                                            className={cn('w-full border border-slate-200 rounded px-2 py-1.5 text-sm bg-transparent focus:bg-white focus:border-primary-400 outline-none font-medium', textColor)}
                                                            value={d.nombre}
                                                            onChange={e => updLinea(i, 'nombre', e.target.value)}
                                                        />
                                                    ) : d.producto_id ? (
                                                        <div className="flex items-center gap-1">
                                                            <span className="flex-1 text-sm bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 truncate">{d.nombre || d.producto_id}</span>
                                                            <button type="button" onClick={() => updLinea(i, 'producto_id', '')}
                                                                className="text-slate-400 hover:text-red-500 text-xs px-1">✕</button>
                                                        </div>
                                                    ) : (
                                                        <BuscadorProducto
                                                            empresaId={empresa!.id}
                                                            placeholder="Buscar (Enter o Buscar)…"
                                                            onSelect={(p: ProductoResultado) => {
                                                                setDetalle(prev => prev.map((d2, j) => j !== i ? d2
                                                                    : { ...d2, producto_id: p.id, nombre: p.nombre, codigo: p.codigo ?? '' }))
                                                            }}
                                                        />
                                                    )}
                                                </td>

                                                {/* Cantidad */}
                                                <td className="py-2 px-3">
                                                    <input type="text" inputMode="decimal"
                                                        className={cn(inp, 'text-sm text-right')}
                                                        value={numVal(`cant_${i}`, d.cantidad)}
                                                        onChange={e => numChange(`cant_${i}`, e.target.value, v => updLinea(i, 'cantidad', v))}
                                                        onBlur={() => numBlur(`cant_${i}`, v => updLinea(i, 'cantidad', v))} />
                                                </td>

                                                {/* Costo */}
                                                <td className="py-2 px-3">
                                                    <input type="text" inputMode="decimal"
                                                        className={cn(inp, 'text-sm text-right')}
                                                        value={numVal(`costo_${i}`, d.costo_unitario)}
                                                        onChange={e => numChange(`costo_${i}`, e.target.value, v => updLinea(i, 'costo_unitario', v))}
                                                        onBlur={() => numBlur(`costo_${i}`, v => updLinea(i, 'costo_unitario', v))} />
                                                </td>

                                                {/* Subtotal */}
                                                <td className="py-2 px-3 text-right font-mono font-semibold text-slate-800">
                                                    ${(d.cantidad * d.costo_unitario).toFixed(2)}
                                                </td>

                                                {/* Eliminar */}
                                                <td className="py-2 pl-2">
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

                        {/* Totales */}
                        <div className="flex justify-between items-center border-t pt-3">
                            <div className="space-y-0.5 text-sm text-slate-500">
                                <p>Subtotal: <span className="font-mono text-slate-700">${subtotalLineas.toFixed(2)}</span></p>
                                <p>IVA: <span className="font-mono text-slate-700">${ivaCalc.toFixed(2)}</span></p>
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
