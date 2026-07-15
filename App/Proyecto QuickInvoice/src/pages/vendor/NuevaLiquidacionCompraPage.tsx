import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useFormDraft } from '../../hooks/useFormDraft'
import { supabase } from '../../lib/supabase'
import { liquidacionCompraService } from '../../services/liquidacionCompraService'
import { contabilidadService, type CuentasCompras } from '../../services/contabilidadService'
import { proveedorService } from '../../services/vendorService'
import { puntoEmisionService } from '../../services/puntoEmisionService'
import type { PuntoEmision } from '../../types/puntosEmision'
import type { Proveedor } from '../../types/vendors'
import type {
    TipoBeneficiario,
    TipoRetencionLC,
} from '../../types/liquidacionCompra'
import { codigoRetencionService, type CodigoRetencion } from '../../services/codigoRetencionService'
import {
    TIPO_BENEFICIARIO_LABELS,
    LIMITES_LC,
} from '../../types/liquidacionCompra'
import { TIPO_SUSTENTO_LABELS, TIPO_GASTO_LABELS } from '../../types/vendors'
import {
    ArrowLeft, Plus, Trash2, Save, Info, AlertTriangle,
    ChevronDown, ChevronUp, Loader2, CheckCircle,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { HelpButton } from '../../components/help/HelpButton'

const inp = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white'

const HOY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' })
function fechaMasDias(dias: number) {
    const d = new Date()
    d.setDate(d.getDate() + dias)
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' })
}
const r2 = (n: number) => Math.round(n * 100) / 100

// ── Tipos locales ──────────────────────────────────────────────
interface LineaDet {
    descripcion: string
    cantidad: number
    precio_unitario: number
    descuento: number
    aplica_iva: boolean
    subtotal: number
    tipo_gasto: string
    cuenta_contable_id: string | null
}

interface LineaRet {
    tipo: TipoRetencionLC
    codigo_retencion: string
    descripcion: string
    base_imponible: number
    porcentaje: number
    valor: number
    cuenta_contable_id: string | null
}

function detalleVacio(): LineaDet {
    return { descripcion: '', cantidad: 1, precio_unitario: 0, descuento: 0, aplica_iva: true, subtotal: 0, tipo_gasto: 'SERVICIOS', cuenta_contable_id: null }
}

// ── Componente principal ───────────────────────────────────────
export function NuevaLiquidacionCompraPage() {
    const { empresa, profile } = useAuth()
    const navigate = useNavigate()

    const [puntosEmision, setPuntosEmision] = useState<PuntoEmision[]>([])
    const [proveedores, setProveedores]     = useState<Proveedor[]>([])
    const [loading, setLoading]             = useState(true)
    const [saving, setSaving]               = useState(false)
    const [saved, setSaved]                 = useState(false)
    const [errorMsg, setErrorMsg]           = useState('')
    const [limiteAlert, setLimiteAlert]     = useState('')

    // ── Datos del comprobante ──────────────────────────────────
    const [puntoEmisionId, setPuntoEmisionId] = useState('')
    const [fechaEmision, setFechaEmision]     = useState(HOY)
    const [tipoSustento, setTipoSustento]     = useState<string>('02')
    const [formaPago, setFormaPago]           = useState<'CONTADO' | 'CREDITO'>('CONTADO')
    const [fechaVenc, setFechaVenc]           = useState(fechaMasDias(30))
    const [observaciones, setObservaciones]   = useState('')

    // ── Beneficiario ───────────────────────────────────────────
    const [modoBenef, setModoBenef]             = useState<'CATALOGO' | 'MANUAL'>('MANUAL')
    const [proveedorId, setProveedorId]         = useState('')
    const [tipoId, setTipoId]                   = useState<TipoBeneficiario>('CEDULA')
    const [identificacion, setIdentificacion]   = useState('')
    const [nombre, setNombre]                   = useState('')
    const [direccion, setDireccion]             = useState('')
    const [email, setEmail]                     = useState('')

    // ── Detalle ────────────────────────────────────────────────
    const [detalle, setDetalle] = useState<LineaDet[]>([detalleVacio()])

    // ── Retenciones ────────────────────────────────────────────
    const [retSeccion, setRetSeccion] = useState(false)
    const [retenciones, setRetenciones] = useState<LineaRet[]>([])

    // ── Contabilidad ───────────────────────────────────────────
    const [todasCuentas, setTodasCuentas] = useState<{ id: string; codigo: string; nombre: string; tipo: string }[]>([])
    const cuentasGasto  = todasCuentas.filter(c => c.tipo === 'gasto')
    const [codigosRet, setCodigosRet] = useState<CodigoRetencion[]>([])
    const [configCuentas, setConfigCuentas] = useState<Record<string, string>>({})

    // ── Carga inicial ──────────────────────────────────────────
    useEffect(() => {
        if (!empresa) return
        Promise.all([
            puntoEmisionService.listar(empresa.id),
            proveedorService.listar(empresa.id),
            codigoRetencionService.listar(empresa.id),
        ]).then(([pts, provs, codigos]) => {
            setPuntosEmision(pts)
            setProveedores(provs)
            setCodigosRet(codigos.filter(c => c.activo))
            if (pts.length > 0) setPuntoEmisionId(pts[0].id)
        }).catch(e => setErrorMsg(e.message))
          .finally(() => setLoading(false))
    }, [empresa])

    // ── Cargar todas las cuentas LP (gasto + activo) ───────────
    useEffect(() => {
        if (!empresa?.id || todasCuentas.length > 0) return
        contabilidadService.listarCuentas(empresa.ruc ?? undefined)
            .then(data => setTodasCuentas(data))
            .catch(() => {})
    }, [empresa?.id])

    // ── Cargar config de cuentas compras directo desde DB ──────
    // AuthContext puede tener datos obsoletos si el usuario guardó en Ajustes
    // sin refrescar la sesión; leemos la fuente de verdad aquí.
    useEffect(() => {
        if (!empresa?.id) return
        void (async () => {
            const { data } = await supabase
                .from('empresas')
                .select('config_cuentas_compras')
                .eq('id', empresa.id)
                .single()
            if (data?.config_cuentas_compras && typeof data.config_cuentas_compras === 'object')
                setConfigCuentas(data.config_cuentas_compras as Record<string, string>)
        })()
    }, [empresa?.id])

    // ── Draft ──────────────────────────────────────────────────
    const clearDraft = useFormDraft(
        'draft_lc_nueva',
        () => ({
            puntoEmisionId, fechaEmision, tipoSustento, formaPago, fechaVenc,
            observaciones, modoBenef, proveedorId, tipoId, identificacion,
            nombre, direccion, email, detalle, retSeccion, retenciones,
        }),
        (d) => {
            if (d.puntoEmisionId)  setPuntoEmisionId(d.puntoEmisionId)
            if (d.fechaEmision)    setFechaEmision(d.fechaEmision)
            if (d.tipoSustento)    setTipoSustento(d.tipoSustento)
            if (d.formaPago)       setFormaPago(d.formaPago)
            if (d.fechaVenc)       setFechaVenc(d.fechaVenc)
            if (d.observaciones)   setObservaciones(d.observaciones)
            if (d.modoBenef)       setModoBenef(d.modoBenef)
            if (d.proveedorId)     setProveedorId(d.proveedorId)
            if (d.tipoId)          setTipoId(d.tipoId)
            if (d.identificacion)  setIdentificacion(d.identificacion)
            if (d.nombre)          setNombre(d.nombre)
            if (d.direccion)       setDireccion(d.direccion)
            if (d.email)           setEmail(d.email)
            if (d.detalle?.length) setDetalle(d.detalle)
            if (d.retSeccion)      setRetSeccion(d.retSeccion)
            if (d.retenciones?.length) setRetenciones(d.retenciones)
        },
        [
            puntoEmisionId, fechaEmision, tipoSustento, formaPago, fechaVenc,
            observaciones, modoBenef, proveedorId, tipoId, identificacion,
            nombre, direccion, email, detalle, retSeccion, retenciones,
        ],
    )

    // ── Cálculos ───────────────────────────────────────────────
    const base0   = r2(detalle.filter(d => !d.aplica_iva).reduce((s, d) => s + d.subtotal, 0))
    const base15  = r2(detalle.filter(d => d.aplica_iva).reduce((s, d) => s + d.subtotal, 0))
    const subtotal = r2(base0 + base15)
    const valorIva = r2(base15 * 0.15)
    const total    = r2(subtotal + valorIva)
    const totalRet = r2(retenciones.reduce((s, r) => s + r.valor, 0))
    const netoPagar = r2(total - totalRet)

    // ── Proveedor seleccionado del catálogo ────────────────────
    const proveedorSel = proveedores.find(p => p.id === proveedorId)
    useEffect(() => {
        if (modoBenef === 'CATALOGO' && proveedorSel) {
            setTipoId(proveedorSel.tipo_identificacion as TipoBeneficiario)
            setIdentificacion(proveedorSel.ruc)
            setNombre(proveedorSel.nombre_empresa)
            setDireccion(proveedorSel.direccion ?? '')
            setEmail(proveedorSel.correo ?? '')
        }
    }, [proveedorId, modoBenef])

    // ── Detalle helpers ────────────────────────────────────────
    function actualizarLinea(idx: number, campo: keyof LineaDet, valor: unknown) {
        setDetalle(prev => {
            const copia = [...prev]
            const lin   = { ...copia[idx], [campo]: valor } as LineaDet
            lin.subtotal = r2(lin.cantidad * lin.precio_unitario * (1 - lin.descuento / 100))
            copia[idx] = lin
            return copia
        })
    }

    function agregarLinea() {
        setDetalle(prev => [...prev, detalleVacio()])
    }

    function eliminarLinea(idx: number) {
        setDetalle(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev)
    }

    // ── Retenciones helpers ────────────────────────────────────
    function agregarRetencion(tipo: TipoRetencionLC) {
        const tipoServicio = tipo === 'IR' ? 'FUENTE' : 'IVA'
        const baseAuto = tipo === 'IR' ? subtotal : valorIva
        const def = codigosRet.find(c => c.tipo === tipoServicio && c.activo)
        if (!def) return
        setRetenciones(prev => [...prev, {
            tipo,
            codigo_retencion: def.codigo,
            descripcion: def.descripcion,
            base_imponible: baseAuto,
            porcentaje: def.porcentaje,
            valor: r2(baseAuto * def.porcentaje / 100),
            cuenta_contable_id: def.cuenta_contable_id ?? null,
        }])
    }

    function actualizarRetencion(idx: number, campo: keyof LineaRet, valor: unknown) {
        setRetenciones(prev => {
            const copia = [...prev]
            const lin   = { ...copia[idx], [campo]: valor } as LineaRet
            if (campo === 'codigo_retencion') {
                const tipoServicio = lin.tipo === 'IR' ? 'FUENTE' : 'IVA'
                const catEntry = codigosRet.find(c => c.codigo === valor && c.tipo === tipoServicio)
                if (catEntry) {
                    lin.descripcion        = catEntry.descripcion
                    lin.porcentaje         = catEntry.porcentaje
                    lin.cuenta_contable_id = catEntry.cuenta_contable_id ?? null
                }
            }
            lin.valor = r2(lin.base_imponible * lin.porcentaje / 100)
            copia[idx] = lin
            return copia
        })
    }

    function eliminarRetencion(idx: number) {
        setRetenciones(prev => prev.filter((_, i) => i !== idx))
    }

    // ── Verificar límites antes de guardar ─────────────────────
    async function verificarLimites(): Promise<boolean> {
        if (!empresa || !identificacion) return true
        try {
            const r = await liquidacionCompraService.verificarLimites(empresa.id, identificacion, total)
            if (r.alertaBeneficiario || r.alertaTotal) {
                const msgs: string[] = []
                if (r.alertaBeneficiario)
                    msgs.push(`Límite por beneficiario: $${r.porBeneficiario.toFixed(2)} / $${LIMITES_LC.POR_BENEFICIARIO_ANIO.toLocaleString()} anuales`)
                if (r.alertaTotal)
                    msgs.push(`Límite total LC: $${r.totalAnio.toFixed(2)} / $${LIMITES_LC.TOTAL_ANIO.toLocaleString()} anuales`)
                setLimiteAlert(msgs.join('\n'))
            }
        } catch { /* ignorar en verificación */ }
        return true
    }

    // ── Guardar ────────────────────────────────────────────────
    async function handleGuardar(autorizar = false) {
        if (!empresa || !profile) return

        // Validaciones básicas
        if (!puntoEmisionId) { setErrorMsg('Seleccione un punto de emisión.'); return }
        if (!identificacion.trim()) { setErrorMsg('La identificación del beneficiario es obligatoria.'); return }
        if (!nombre.trim()) { setErrorMsg('El nombre del beneficiario es obligatorio.'); return }
        if (detalle.every(d => d.subtotal === 0)) { setErrorMsg('Ingrese al menos un ítem con valor mayor a 0.'); return }

        setErrorMsg('')
        setSaving(true)
        await verificarLimites()

        try {
            const lc = await liquidacionCompraService.crear({
                empresa_id:                  empresa.id,
                punto_emision_id:            puntoEmisionId,
                proveedor_id:                modoBenef === 'CATALOGO' ? (proveedorId || null) : null,
                beneficiario_tipo_id:        tipoId,
                beneficiario_identificacion: identificacion,
                beneficiario_nombre:         nombre,
                beneficiario_direccion:      direccion || null,
                beneficiario_email:          email || null,
                fecha_emision:               fechaEmision,
                tipo_sustento:               tipoSustento,
                tipo_regimen_pago:           '01',
                aplica_convenio_ddi:         false,
                forma_pago:                  formaPago,
                fecha_vencimiento:           formaPago === 'CREDITO' ? fechaVenc : null,
                observaciones:               observaciones || null,
                detalles:                    detalle.filter(d => d.subtotal > 0).map((d, i) => ({
                    descripcion:        d.descripcion,
                    cantidad:           d.cantidad,
                    precio_unitario:    d.precio_unitario,
                    descuento:          d.descuento,
                    aplica_iva:         d.aplica_iva,
                    subtotal:           d.subtotal,
                    tipo_gasto:         d.tipo_gasto,
                    cuenta_contable_id: d.cuenta_contable_id,
                    orden:              i + 1,
                })),
                retenciones: empresa.es_agente_retencion ? retenciones : [],
                created_by: profile.id,
            })

            // ── Asiento contable automático ────────────────────
            let contabError = ''
            try {
                const cfg = configCuentas
                const cuentas: CuentasCompras = {
                    inventarios:       cfg.inventarios       ?? '',
                    gastos_servicios:  cfg.gastos_servicios  ?? '',
                    iva_compras:       cfg.iva_compras        ?? '',
                    cuentas_por_pagar: cfg.cuentas_por_pagar ?? '',
                    efectivo:          cfg.efectivo           ?? '',
                    ret_fuente:        cfg.ret_fuente         ?? '',
                    ret_iva:           cfg.ret_iva            ?? '',
                }
                // Validar cuentas mínimas
                const cuentaHaber = formaPago === 'CREDITO' ? cuentas.cuentas_por_pagar : cuentas.efectivo
                const tieneMin  = !!cuentaHaber
                const hayDebit  = detalle.filter(d => d.subtotal > 0).some(d => d.cuenta_contable_id)

                if (!tieneMin) {
                    contabError = 'Configure la cuenta Cuentas por Pagar (o Efectivo) en Compras → Ajustes'
                    throw new Error(contabError)
                }
                if (!hayDebit) {
                    contabError = 'Asigne una cuenta contable a las líneas de detalle (columna "Cuenta contable" en el formulario)'
                    throw new Error(contabError)
                }

                const numLC = `${lc.establecimiento}-${lc.punto_emision}-${lc.secuencial}`
                const retsActivas = empresa.es_agente_retencion ? retenciones : []

                if (retsActivas.length > 0 && retsActivas.some(r => !r.cuenta_contable_id)) {
                    const sinCuenta = retsActivas.filter(r => !r.cuenta_contable_id).map(r => r.codigo_retencion).join(', ')
                    contabError = `Código(s) de retención sin cuenta contable: ${sinCuenta}. Configúrala en Retenciones → Códigos de Retención.`
                    throw new Error(contabError)
                }

                const retIR  = retsActivas.filter(r => r.tipo === 'IR').reduce((s, r) => s + r.valor, 0)
                const retIVA = retsActivas.filter(r => r.tipo === 'IVA').reduce((s, r) => s + r.valor, 0)
                await contabilidadService.crearAsientoCompra({
                    empresaId:     empresa.id,
                    portalRuc:     empresa.ruc ?? '',
                    fecha:         fechaEmision,
                    glosa:         `LC ${numLC} — ${nombre}`,
                    subtotal,
                    valorIva,
                    retFuente:     r2(retIR),
                    retIva:        r2(retIVA),
                    formaPago,
                    tipoCompra:    'SERVICIO',
                    cuentas,
                    referencia:    lc.id,
                    lineasServicio: detalle.filter(d => d.subtotal > 0).map(d => ({
                        descripcion:        d.descripcion,
                        subtotal:           d.subtotal,
                        cuenta_contable_id: d.cuenta_contable_id,
                    })),
                    lineasRetencion: retsActivas.map(r => ({
                        tipo:               r.tipo,
                        valor:              r.valor,
                        cuenta_contable_id: r.cuenta_contable_id,
                    })),
                })
            } catch (err: any) {
                if (!contabError) contabError = err?.message ?? String(err)
                console.error('[asientoLC]', contabError)
                setErrorMsg(`LC guardada. ⚠ Asiento contable NO generado: ${contabError}`)
            }

            if (autorizar) {
                try {
                    await liquidacionCompraService.autorizar(lc.id)
                } catch (e: any) {
                    setErrorMsg(`LC guardada pero error al autorizar: ${e.message}`)
                    setSaving(false)
                    setSaved(true)
                    clearDraft()
                    setTimeout(() => navigate('/liquidaciones'), 3000)
                    return
                }

                // Autorizar retención automáticamente si aplica
                const retsParaAutorizar = empresa.es_agente_retencion ? retenciones : []
                if (retsParaAutorizar.length > 0) {
                    try {
                        const { data: retData } = await supabase.functions.invoke('sri-retencion', {
                            body: { liquidacion_id: lc.id, empresa_id: empresa.id },
                        })
                        if (!retData?.authorized) {
                            setErrorMsg(`LC autorizada. ⚠ Retención: ${retData?.message || retData?.error || 'No autorizada aún'}`)
                        }
                    } catch (retErr: any) {
                        setErrorMsg(`LC autorizada. ⚠ Error al autorizar retención: ${retErr.message}`)
                    }
                }
            }

            clearDraft()
            setSaved(true)
            // Si hubo error contable, dar 8 s para que el usuario lea el mensaje
            setTimeout(() => navigate('/liquidaciones'), contabError ? 8000 : 1200)
        } catch (e: any) {
            setErrorMsg(e.message)
        } finally {
            setSaving(false)
        }
    }

    // ── Render ─────────────────────────────────────────────────
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh] gap-2 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin" /> Cargando…
            </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-16">
            {/* Breadcrumb + título */}
            <div>
                <button onClick={() => navigate('/liquidaciones')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary-600 mb-2">
                    <ArrowLeft className="w-4 h-4" /> Liquidaciones de Compra
                </button>
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Nueva Liquidación de Compra</h1>
                        <p className="text-sm text-slate-500 mt-0.5">Comprobante electrónico codDoc=03 · SRI Ecuador</p>
                    </div>
                    <HelpButton pageKey="nueva-lc" />
                </div>
            </div>

            {/* Alerta límites SRI */}
            {limiteAlert && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-sm text-amber-800">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold mb-1">Advertencia: límites anuales SRI para LC</p>
                        <pre className="whitespace-pre-wrap font-sans">{limiteAlert}</pre>
                    </div>
                </div>
            )}

            {/* ── Sección 1: Punto de emisión y fechas ── */}
            <div className="card p-6 space-y-4">
                <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Datos del Comprobante</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Punto de Emisión *</label>
                        <select value={puntoEmisionId} onChange={e => setPuntoEmisionId(e.target.value)} className={inp}>
                            <option value="">— Seleccionar —</option>
                            {puntosEmision.map(pe => (
                                <option key={pe.id} value={pe.id}>
                                    {pe.establecimiento}-{pe.punto_emision} · {pe.nombre}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Fecha de Emisión *</label>
                        <input type="date" value={fechaEmision} onChange={e => setFechaEmision(e.target.value)} className={inp} />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Tipo de Sustento *</label>
                        <select value={tipoSustento} onChange={e => setTipoSustento(e.target.value)} className={inp}>
                            {(Object.entries(TIPO_SUSTENTO_LABELS) as [string, string][]).map(([k, v]) => (
                                <option key={k} value={k}>{k} — {v}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Forma de Pago *</label>
                        <select value={formaPago} onChange={e => setFormaPago(e.target.value as 'CONTADO' | 'CREDITO')} className={inp}>
                            <option value="CONTADO">Contado</option>
                            <option value="CREDITO">Crédito</option>
                        </select>
                    </div>
                    {formaPago === 'CREDITO' && (
                        <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">Fecha de Vencimiento</label>
                            <input type="date" value={fechaVenc} onChange={e => setFechaVenc(e.target.value)} className={inp} />
                        </div>
                    )}
                    <div className={formaPago === 'CREDITO' ? '' : 'sm:col-span-2'}>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Observaciones</label>
                        <input type="text" value={observaciones} onChange={e => setObservaciones(e.target.value)}
                            placeholder="Observaciones internas (opcional)" className={inp} />
                    </div>
                </div>
            </div>

            {/* ── Sección 2: Beneficiario ── */}
            <div className="card p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Beneficiario</h2>
                    <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
                        {(['MANUAL', 'CATALOGO'] as const).map(m => (
                            <button key={m} onClick={() => setModoBenef(m)}
                                className={cn('px-3 py-1 rounded-md text-xs font-medium transition-colors',
                                    modoBenef === m ? 'bg-white shadow text-primary-700' : 'text-slate-500 hover:text-slate-700')}>
                                {m === 'MANUAL' ? 'Ingresar manualmente' : 'Del catálogo'}
                            </button>
                        ))}
                    </div>
                </div>

                {modoBenef === 'CATALOGO' && (
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Proveedor del catálogo</label>
                        <select value={proveedorId} onChange={e => setProveedorId(e.target.value)} className={inp}>
                            <option value="">— Seleccionar proveedor —</option>
                            {proveedores.filter(p => p.estado === 'ACTIVO').map(p => (
                                <option key={p.id} value={p.id}>{p.nombre_empresa} · {p.ruc}</option>
                            ))}
                        </select>
                        <p className="text-xs text-slate-400 mt-1">Los datos se completarán automáticamente. Puede editarlos abajo.</p>
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Tipo de Identificación *</label>
                        <select value={tipoId} onChange={e => setTipoId(e.target.value as TipoBeneficiario)} className={inp}>
                            {(Object.entries(TIPO_BENEFICIARIO_LABELS) as [TipoBeneficiario, string][]).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Número de Identificación *</label>
                        <input type="text" value={identificacion} onChange={e => setIdentificacion(e.target.value)}
                            placeholder="Cédula, pasaporte…" className={inp} />
                    </div>
                    <div className="sm:col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-1">Nombres y Apellidos *</label>
                        <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
                            placeholder="Nombres completos del beneficiario" className={inp} />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Dirección</label>
                        <input type="text" value={direccion} onChange={e => setDireccion(e.target.value)}
                            placeholder="Dirección del beneficiario" className={inp} />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Correo electrónico</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                            placeholder="para envío del RIDE (opcional)" className={inp} />
                    </div>
                </div>
            </div>

            {/* ── Sección 3: Detalle ── */}
            <div className="card overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Detalle de Bienes / Servicios</h2>
                    <button onClick={agregarLinea} className="flex items-center gap-1.5 text-xs text-primary-600 font-medium hover:text-primary-800">
                        <Plus className="w-3.5 h-3.5" /> Agregar línea
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="text-left px-3 py-2.5 text-xs text-slate-500 font-semibold min-w-[200px]">Descripción</th>
                                <th className="text-left px-3 py-2.5 text-xs text-slate-500 font-semibold w-32">Tipo gasto</th>
                                {cuentasGasto.length > 0 && (
                                    <th className="text-left px-3 py-2.5 text-xs text-slate-500 font-semibold min-w-[180px]">Cuenta contable</th>
                                )}
                                <th className="text-right px-3 py-2.5 text-xs text-slate-500 font-semibold w-20">Cant.</th>
                                <th className="text-right px-3 py-2.5 text-xs text-slate-500 font-semibold w-28">Precio U.</th>
                                <th className="text-right px-3 py-2.5 text-xs text-slate-500 font-semibold w-20">Desc.%</th>
                                <th className="text-center px-3 py-2.5 text-xs text-slate-500 font-semibold w-16">IVA</th>
                                <th className="text-right px-3 py-2.5 text-xs text-slate-500 font-semibold w-28">Subtotal</th>
                                <th className="w-8" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {detalle.map((lin, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/50">
                                    <td className="px-3 py-2">
                                        <input
                                            value={lin.descripcion}
                                            onChange={e => actualizarLinea(idx, 'descripcion', e.target.value)}
                                            placeholder="Descripción del bien o servicio"
                                            className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm focus:ring-1 focus:ring-primary-500 outline-none"
                                        />
                                    </td>
                                    <td className="px-3 py-2">
                                        <select value={lin.tipo_gasto} onChange={e => actualizarLinea(idx, 'tipo_gasto', e.target.value)}
                                            className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm focus:ring-1 focus:ring-primary-500 outline-none">
                                            {(Object.entries(TIPO_GASTO_LABELS) as [string, string][]).map(([k, v]) => (
                                                <option key={k} value={k}>{v}</option>
                                            ))}
                                        </select>
                                    </td>
                                    {cuentasGasto.length > 0 && (
                                        <td className="px-3 py-2">
                                            <select
                                                value={lin.cuenta_contable_id || ''}
                                                onChange={e => actualizarLinea(idx, 'cuenta_contable_id', e.target.value || null)}
                                                className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-xs focus:ring-1 focus:ring-primary-500 outline-none"
                                            >
                                                <option value="">— seleccionar cuenta de gasto —</option>
                                                {cuentasGasto.map(c => (
                                                    <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>
                                                ))}
                                            </select>
                                        </td>
                                    )}
                                    <td className="px-3 py-2">
                                        <input type="number" min="0.001" step="0.001"
                                            value={lin.cantidad}
                                            onChange={e => actualizarLinea(idx, 'cantidad', parseFloat(e.target.value) || 0)}
                                            className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm text-right focus:ring-1 focus:ring-primary-500 outline-none"
                                        />
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="relative">
                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                                            <input type="number" min="0" step="0.01"
                                                value={lin.precio_unitario}
                                                onChange={e => actualizarLinea(idx, 'precio_unitario', parseFloat(e.target.value) || 0)}
                                                className="w-full border border-slate-200 rounded-md pl-5 pr-2 py-1.5 text-sm text-right focus:ring-1 focus:ring-primary-500 outline-none"
                                            />
                                        </div>
                                    </td>
                                    <td className="px-3 py-2">
                                        <input type="number" min="0" max="100" step="0.01"
                                            value={lin.descuento}
                                            onChange={e => actualizarLinea(idx, 'descuento', parseFloat(e.target.value) || 0)}
                                            className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm text-right focus:ring-1 focus:ring-primary-500 outline-none"
                                        />
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                        <button
                                            onClick={() => actualizarLinea(idx, 'aplica_iva', !lin.aplica_iva)}
                                            className={cn('w-10 h-6 rounded-full transition-colors', lin.aplica_iva ? 'bg-green-500' : 'bg-slate-200')}
                                        >
                                            <span className={cn('block w-4 h-4 bg-white rounded-full shadow transition-transform mx-1', lin.aplica_iva ? 'translate-x-4' : 'translate-x-0')} />
                                        </button>
                                    </td>
                                    <td className="px-3 py-2 text-right font-medium text-slate-800">
                                        ${lin.subtotal.toFixed(2)}
                                    </td>
                                    <td className="px-3 py-2">
                                        <button onClick={() => eliminarLinea(idx)} disabled={detalle.length === 1}
                                            className="p-1 hover:bg-red-50 rounded text-slate-300 hover:text-red-500 disabled:opacity-25">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Sección 4: Retenciones (solo si es agente) ── */}
            {empresa?.es_agente_retencion ? (
                <div className="card overflow-hidden">
                    <button
                        onClick={() => setRetSeccion(v => !v)}
                        className="w-full flex items-center justify-between px-6 py-4 border-b border-slate-100 hover:bg-slate-50"
                    >
                        <div className="flex items-center gap-2">
                            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Retenciones</h2>
                            {retenciones.length > 0 && (
                                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                                    {retenciones.length} · Total: ${totalRet.toFixed(2)}
                                </span>
                            )}
                        </div>
                        {retSeccion ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </button>

                    {retSeccion && (
                        <div className="p-6 space-y-4">
                            <div className="flex gap-2">
                                <button onClick={() => agregarRetencion('IR')}
                                    className="px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 flex items-center gap-1">
                                    <Plus className="w-3 h-3" /> Ret. IR
                                </button>
                                {valorIva > 0 && (
                                    <button onClick={() => agregarRetencion('IVA')}
                                        className="px-3 py-1.5 text-xs font-medium bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 flex items-center gap-1">
                                        <Plus className="w-3 h-3" /> Ret. IVA
                                    </button>
                                )}
                            </div>

                            {retenciones.length > 0 && (
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="text-left px-3 py-2 text-xs text-slate-500 font-semibold w-20">Tipo</th>
                                            <th className="text-left px-3 py-2 text-xs text-slate-500 font-semibold">Código / Concepto</th>
                                            <th className="text-right px-3 py-2 text-xs text-slate-500 font-semibold w-28">Base Imp.</th>
                                            <th className="text-right px-3 py-2 text-xs text-slate-500 font-semibold w-20">%</th>
                                            <th className="text-right px-3 py-2 text-xs text-slate-500 font-semibold w-28">Valor</th>
                                            <th className="w-8" />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {retenciones.map((r, idx) => {
                                            const tipoSrv = r.tipo === 'IR' ? 'FUENTE' : 'IVA'
                                            const codigosDropdown = codigosRet.filter(c => c.tipo === tipoSrv && c.activo)
                                            return (
                                                <tr key={idx}>
                                                    <td className="px-3 py-2">
                                                        <span className={cn('text-xs px-2 py-0.5 rounded font-medium', r.tipo === 'IR' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700')}>
                                                            {r.tipo}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <select
                                                            value={r.codigo_retencion}
                                                            onChange={e => actualizarRetencion(idx, 'codigo_retencion', e.target.value)}
                                                            className="w-full border border-slate-200 rounded-md px-2 py-1.5 text-sm focus:ring-1 focus:ring-primary-500 outline-none"
                                                        >
                                                            {codigosDropdown.map(c => (
                                                                <option key={c.codigo} value={c.codigo}>
                                                                    {c.codigo} — {c.porcentaje}% — {c.descripcion.slice(0, 50)}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <div className="relative">
                                                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">$</span>
                                                            <input type="number" min="0" step="0.01"
                                                                value={r.base_imponible}
                                                                onChange={e => actualizarRetencion(idx, 'base_imponible', parseFloat(e.target.value) || 0)}
                                                                className="w-full border border-slate-200 rounded-md pl-5 pr-2 py-1.5 text-sm text-right focus:ring-1 focus:ring-primary-500 outline-none"
                                                            />
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <div className="relative">
                                                            <input type="number" min="0" max="100" step="0.5"
                                                                value={r.porcentaje}
                                                                onChange={e => actualizarRetencion(idx, 'porcentaje', parseFloat(e.target.value) || 0)}
                                                                className="w-full border border-slate-200 rounded-md px-2 pr-5 py-1.5 text-sm text-right focus:ring-1 focus:ring-primary-500 outline-none"
                                                            />
                                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">%</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-2 text-right font-semibold text-amber-700">
                                                        ${r.valor.toFixed(2)}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <button onClick={() => eliminarRetencion(idx)}
                                                            className="p-1 hover:bg-red-50 rounded text-slate-300 hover:text-red-500">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            )}

                            {retenciones.length === 0 && (
                                <p className="text-sm text-slate-400 text-center py-4">
                                    Agregue retenciones de IR e IVA según corresponda.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                <div className="card p-4 flex items-start gap-3 bg-slate-50 border border-slate-200">
                    <Info className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                    <p className="text-sm text-slate-500">
                        Su empresa no está configurada como Agente de Retención. Si fue designado por el SRI, actívelo en{' '}
                        <a href="/configuracion" className="text-primary-600 font-semibold hover:underline">
                            Ajustes → Empresa
                        </a>.
                    </p>
                </div>
            )}

            {/* ── Sección 5: Totales ── */}
            <div className="card p-6">
                <div className="max-w-xs ml-auto space-y-2 text-sm">
                    <div className="flex justify-between text-slate-600">
                        <span>Base IVA 0%</span><span>${base0.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                        <span>Base IVA 15%</span><span>${base15.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                        <span>Subtotal</span><span>${subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                        <span>IVA 15%</span><span>${valorIva.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-900 text-base border-t border-slate-200 pt-2">
                        <span>Total Factura</span><span>${total.toFixed(2)}</span>
                    </div>
                    {totalRet > 0 && (
                        <>
                            <div className="flex justify-between text-amber-700">
                                <span>Total Retenciones</span><span>-${totalRet.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between font-bold text-green-700 text-base border-t border-slate-200 pt-2">
                                <span>Neto a Pagar</span><span>${netoPagar.toFixed(2)}</span>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ── Errores y acciones ── */}
            {errorMsg && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {errorMsg}
                </div>
            )}

            {saved && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" /> ¡Liquidación guardada! Redirigiendo…
                </div>
            )}

            <div className="flex flex-wrap gap-3 justify-end">
                <button onClick={() => navigate('/liquidaciones')}
                    className="px-4 py-2 text-sm font-medium text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50">
                    Cancelar
                </button>
                <button
                    onClick={() => handleGuardar(false)}
                    disabled={saving || saved}
                    className="btn-secondary flex items-center gap-2"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Guardar borrador
                </button>
                <button
                    onClick={() => handleGuardar(true)}
                    disabled={saving || saved}
                    className="btn-primary flex items-center gap-2"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    Guardar y Autorizar SRI
                </button>
            </div>
        </div>
    )
}
