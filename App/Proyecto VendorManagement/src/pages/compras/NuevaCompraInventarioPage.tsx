import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { compraService, proveedorService, retencionService } from '../../services/vendorService'
import { contabilidadService } from '../../services/contabilidadService'
import type { CuentasCompras } from '../../services/contabilidadService'
import { supabase } from '../../lib/supabase'
import type { Proveedor } from '../../types/vendors'
import { TIPO_SUSTENTO_LABELS } from '../../types/vendors'
import { RetencionesEditor } from '../../components/RetencionesEditor'
import type { RetLine } from '../../components/RetencionesEditor'
import {
    ArrowLeft, Plus, Trash2, Save, Package, ChevronDown, ChevronUp,
} from 'lucide-react'

import { cn } from '../../lib/utils'

const HOY = new Date().toISOString().split('T')[0]

interface LineaDetalle {
    producto_id: string
    nombre: string
    cantidad: number
    costo_unitario: number
}

export function NuevaCompraInventarioPage() {
    const { empresa, profile } = useAuth()
    const navigate = useNavigate()

    const [proveedores, setProveedores] = useState<Proveedor[]>([])
    const [productos, setProductos]     = useState<{ id: string; nombre: string }[]>([])
    const [loading, setLoading]         = useState(true)
    const [saving, setSaving]           = useState(false)

    // Cabecera
    const [proveedorId, setProveedorId]     = useState('')
    const [fechaEmision, setFechaEmision]   = useState(HOY)
    const [estab, setEstab]                 = useState('')
    const [ptoEmi, setPtoEmi]               = useState('')
    const [secuencial, setSecuencial]       = useState('')
    const [numeroFactura, setNumeroFactura] = useState('')
    const [claveAcceso, setClaveAcceso]     = useState('')
    const [tipoSustento, setTipoSustento]   = useState<'01'|'02'|'03'|'04'|'05'>('04')
    const [formaPago, setFormaPago]         = useState<'CONTADO'|'CREDITO'>('CONTADO')
    const [fechaVenc, setFechaVenc]         = useState('')
    const [observaciones, setObservaciones] = useState('')

    // Detalle
    const [detalle, setDetalle] = useState<LineaDetalle[]>([])

    // Bases IVA (ingresadas manualmente desde la factura)
    const [baseIva0,  setBaseIva0]  = useState(0)
    const [baseIva5,  setBaseIva5]  = useState(0)
    const [baseIva15, setBaseIva15] = useState(0)
    const [usarIvaManual, setUsarIvaManual] = useState(false)

    // Retenciones (hasta 4, con número único de comprobante)
    const [numeroRetencion, setNumeroRetencion] = useState('')
    const [retenciones, setRetenciones]         = useState<RetLine[]>([])
    const [retSeccion, setRetSeccion]            = useState(false)

    useEffect(() => { if (empresa?.id) load() }, [empresa?.id])

    async function load() {
        try {
            const { data: prodsData } = await supabase
                .from('productos').select('id, nombre').eq('empresa_id', empresa!.id).eq('activo', true).order('nombre')
            const [provs] = await Promise.all([proveedorService.listar(empresa!.id)])
            setProveedores(provs.filter(p => p.estado === 'ACTIVO'))
            setProductos(prodsData ?? [])
        } catch (e: any) { alert('Error al cargar datos: ' + e.message) }
        finally { setLoading(false) }
    }

    useEffect(() => {
        if (estab && ptoEmi && secuencial)
            setNumeroFactura(`${estab.padStart(3,'0')}-${ptoEmi.padStart(3,'0')}-${secuencial.padStart(9,'0')}`)
    }, [estab, ptoEmi, secuencial])

    // Auto-generate retention number when the section opens for the first time
    useEffect(() => {
        if (retSeccion && !numeroRetencion && empresa?.id) {
            retencionService.siguienteNumero(empresa.id).then(setNumeroRetencion).catch(() => {})
        }
    }, [retSeccion, empresa?.id])

    const subtotalLineas = detalle.reduce((s, d) => s + d.cantidad * d.costo_unitario, 0)
    const b0  = usarIvaManual ? baseIva0  : 0
    const b5  = usarIvaManual ? baseIva5  : 0
    const b15 = usarIvaManual ? baseIva15 : subtotalLineas
    const ivaCalc = Math.round((b5 * 0.05 + b15 * 0.15) * 100) / 100
    const total   = subtotalLineas + ivaCalc
    const totalRet = retenciones.reduce((s, r) => s + r.valor, 0)

    function addLinea() {
        setDetalle(prev => [...prev, { producto_id: '', nombre: '', cantidad: 1, costo_unitario: 0 }])
    }
    function updLinea(i: number, campo: keyof LineaDetalle, val: unknown) {
        setDetalle(prev => prev.map((d, j) => {
            if (j !== i) return d
            if (campo === 'producto_id') {
                const prod = productos.find(p => p.id === val)
                return { ...d, producto_id: val as string, nombre: prod?.nombre ?? '' }
            }
            return { ...d, [campo]: val }
        }))
    }
    function removeLinea(i: number) { setDetalle(prev => prev.filter((_, j) => j !== i)) }

    async function handleGuardar() {
        if (!proveedorId)              { alert('Selecciona un proveedor'); return }
        const validas = detalle.filter(d => d.producto_id && d.cantidad > 0 && d.costo_unitario > 0)
        if (!validas.length)           { alert('Agrega al menos un producto válido'); return }
        if (formaPago === 'CREDITO' && !fechaVenc) { alert('Ingresa la fecha de vencimiento'); return }

        try {
            setSaving(true)
            const prov = proveedores.find(p => p.id === proveedorId)
            let fechaVencFinal = fechaVenc
            if (formaPago === 'CREDITO' && !fechaVenc && prov?.dias_credito) {
                const d = new Date(); d.setDate(d.getDate() + prov.dias_credito)
                fechaVencFinal = d.toISOString().split('T')[0]
            }

            const retsParaGuardar = retenciones
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

            await compraService.crearInventario(
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
                    created_by: profile?.id,
                },
                validas.map(d => ({
                    producto_id: d.producto_id,
                    cantidad: d.cantidad,
                    costo_unitario: d.costo_unitario,
                    subtotal: Math.round(d.cantidad * d.costo_unitario * 100) / 100,
                })),
                retsParaGuardar,
            )

            // Asiento contable — fresh config fetch (no stale session)
            let asientoInfo = ''
            try {
                const { data: cfg } = await supabase
                    .from('empresas')
                    .select('usar_contabilidad_compras, config_cuentas_compras')
                    .eq('id', empresa!.id)
                    .maybeSingle()

                if (cfg?.usar_contabilidad_compras && cfg?.config_cuentas_compras) {
                    const ctas = cfg.config_cuentas_compras as unknown as CuentasCompras
                    if (ctas.inventarios && ctas.cuentas_por_pagar && ctas.efectivo) {
                        const retF = retsParaGuardar.filter(r => r.tipo === 'FUENTE').reduce((s, r) => s + r.valor, 0)
                        const retI = retsParaGuardar.filter(r => r.tipo === 'IVA').reduce((s, r) => s + r.valor, 0)
                        await contabilidadService.crearAsientoCompra({
                            empresaId: empresa!.id, fecha: HOY,
                            glosa: `Compra inventario ${numeroFactura || proveedorId.slice(0, 8)}`,
                            subtotal: subtotalLineas, valorIva: ivaCalc,
                            retFuente: retF, retIva: retI, formaPago,
                            tipoCompra: 'INVENTARIO', cuentas: ctas,
                            referencia: numeroFactura || undefined, creadoPor: profile?.id,
                        })
                        asientoInfo = '✓ Asiento contable registrado en LedgerPro.'
                    } else {
                        asientoInfo = '⚠ Contabilidad activa pero faltan cuentas configuradas.'
                    }
                }
            } catch (contabErr: any) {
                asientoInfo = `⚠ Sin asiento contable: ${contabErr.message}`
            }

            if (asientoInfo) alert(asientoInfo)
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
            </div>

            {/* Datos del comprobante */}
            <div className="card p-5 space-y-4">
                <h2 className="font-bold text-slate-700 text-sm uppercase tracking-wider">Datos del comprobante</h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="label">Proveedor <span className="text-red-500">*</span></label>
                        <select className="input" value={proveedorId} onChange={e => {
                            setProveedorId(e.target.value)
                            const prov = proveedores.find(p => p.id === e.target.value)
                            if (prov?.condicion_pago === 'CREDITO') {
                                setFormaPago('CREDITO')
                                if (prov.dias_credito) {
                                    const d = new Date(); d.setDate(d.getDate() + prov.dias_credito)
                                    setFechaVenc(d.toISOString().split('T')[0])
                                }
                            }
                        }}>
                            <option value="">Seleccionar proveedor...</option>
                            {proveedores.map(p => (
                                <option key={p.id} value={p.id}>{p.nombre_empresa} — {p.ruc}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="label">Fecha emisión factura</label>
                        <input type="date" className="input" value={fechaEmision}
                            onChange={e => setFechaEmision(e.target.value)} />
                    </div>
                </div>

                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                    <div><label className="label text-xs">Estab.</label>
                        <input className="input font-mono" maxLength={3} placeholder="001"
                            value={estab} onChange={e => setEstab(e.target.value)} /></div>
                    <div><label className="label text-xs">Pto. Emi.</label>
                        <input className="input font-mono" maxLength={3} placeholder="001"
                            value={ptoEmi} onChange={e => setPtoEmi(e.target.value)} /></div>
                    <div className="col-span-2"><label className="label text-xs">Secuencial</label>
                        <input className="input font-mono" maxLength={9} placeholder="000000001"
                            value={secuencial} onChange={e => setSecuencial(e.target.value)} /></div>
                    <div className="col-span-2"><label className="label text-xs">Nº Factura</label>
                        <input className="input font-mono text-xs" readOnly value={numeroFactura}
                            placeholder="001-001-000000001" /></div>
                </div>

                <div>
                    <label className="label text-xs">Clave de acceso (opcional)</label>
                    <input className="input font-mono text-xs" maxLength={49} value={claveAcceso}
                        onChange={e => setClaveAcceso(e.target.value)} placeholder="49 dígitos SRI" />
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div>
                        <label className="label text-xs">Tipo sustento (ATS)</label>
                        <select className="input text-sm" value={tipoSustento}
                            onChange={e => setTipoSustento(e.target.value as '01'|'02'|'03'|'04'|'05')}>
                            {Object.entries(TIPO_SUSTENTO_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>{k} — {v}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="label text-xs">Forma de pago</label>
                        <select className="input text-sm" value={formaPago}
                            onChange={e => setFormaPago(e.target.value as 'CONTADO'|'CREDITO')}>
                            <option value="CONTADO">Contado</option>
                            <option value="CREDITO">Crédito</option>
                        </select>
                    </div>
                    {formaPago === 'CREDITO' && (
                        <div>
                            <label className="label text-xs">Fecha vencimiento <span className="text-red-500">*</span></label>
                            <input type="date" className="input text-sm" value={fechaVenc}
                                onChange={e => setFechaVenc(e.target.value)} />
                        </div>
                    )}
                </div>

                <div>
                    <label className="label text-xs">Observaciones</label>
                    <input className="input text-sm" value={observaciones}
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

                {detalle.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                        <Package className="w-10 h-10 mx-auto mb-2 text-slate-200" />
                        <p className="text-sm">Agrega los productos de la factura</p>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-xs text-slate-500 border-b">
                                        <th className="text-left py-2 pr-3 font-semibold">Producto</th>
                                        <th className="text-right py-2 px-3 w-24 font-semibold">Cant.</th>
                                        <th className="text-right py-2 px-3 w-28 font-semibold">Costo unit.</th>
                                        <th className="text-right py-2 px-3 w-28 font-semibold">Subtotal</th>
                                        <th className="w-8" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {detalle.map((d, i) => (
                                        <tr key={i}>
                                            <td className="py-2 pr-3">
                                                <select className="input text-sm w-full" value={d.producto_id}
                                                    onChange={e => updLinea(i, 'producto_id', e.target.value)}>
                                                    <option value="">Seleccionar...</option>
                                                    {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                                                </select>
                                            </td>
                                            <td className="py-2 px-3">
                                                <input type="number" min={0} step={0.01}
                                                    className="input text-sm text-right w-full"
                                                    value={d.cantidad || ''}
                                                    onChange={e => updLinea(i, 'cantidad', parseFloat(e.target.value) || 0)} />
                                            </td>
                                            <td className="py-2 px-3">
                                                <input type="number" min={0} step={0.01}
                                                    className="input text-sm text-right w-full"
                                                    value={d.costo_unitario || ''}
                                                    onChange={e => updLinea(i, 'costo_unitario', parseFloat(e.target.value) || 0)} />
                                            </td>
                                            <td className="py-2 px-3 text-right font-mono font-semibold text-slate-800">
                                                ${(d.cantidad * d.costo_unitario).toFixed(2)}
                                            </td>
                                            <td className="py-2 pl-2">
                                                <button onClick={() => removeLinea(i)}
                                                    className="p-1 hover:bg-red-50 rounded text-slate-300 hover:text-red-500">
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
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
                                        <input type="number" step={0.01} className="input text-sm text-right"
                                            value={baseIva0 || ''} onChange={e => setBaseIva0(parseFloat(e.target.value) || 0)} />
                                    </div>
                                    <div>
                                        <label className="label text-xs">Base IVA 5%</label>
                                        <input type="number" step={0.01} className="input text-sm text-right"
                                            value={baseIva5 || ''} onChange={e => setBaseIva5(parseFloat(e.target.value) || 0)} />
                                    </div>
                                    <div>
                                        <label className="label text-xs">Base IVA 15%</label>
                                        <input type="number" step={0.01} className="input text-sm text-right"
                                            value={baseIva15 || ''} onChange={e => setBaseIva15(parseFloat(e.target.value) || 0)} />
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

            {/* Retenciones */}
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
                        />
                    </div>
                )}
            </div>

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

