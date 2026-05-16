import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { compraService, proveedorService, retencionService } from '../../services/vendorService'
import { contabilidadService } from '../../services/contabilidadService'
import type { CuentasCompras } from '../../services/contabilidadService'
import type { Proveedor, DetalleServicio, TipoGasto } from '../../types/vendors'
import { TIPO_SUSTENTO_LABELS, TIPO_GASTO_LABELS } from '../../types/vendors'
import { RetencionesEditor } from '../../components/RetencionesEditor'
import type { RetLine } from '../../components/RetencionesEditor'
import {
    ArrowLeft, Plus, Trash2, Save, ChevronDown, ChevronUp,
} from 'lucide-react'
import { cn } from '../../lib/utils'

const HOY = new Date().toISOString().split('T')[0]

type LineaServicio = Omit<DetalleServicio, 'id' | 'empresa_id' | 'compra_id'>

export function NuevaCompraServicioPage() {
    const { empresa, profile } = useAuth()
    const navigate = useNavigate()

    const [proveedores, setProveedores] = useState<Proveedor[]>([])
    const [loading, setLoading]         = useState(true)
    const [saving, setSaving]           = useState(false)

    const [proveedorId, setProveedorId]     = useState('')
    const [fechaEmision, setFechaEmision]   = useState(HOY)
    const [estab, setEstab]                 = useState('')
    const [ptoEmi, setPtoEmi]               = useState('')
    const [secuencial, setSecuencial]       = useState('')
    const [numeroFactura, setNumeroFactura] = useState('')
    const [claveAcceso, setClaveAcceso]     = useState('')
    const [tipoSustento, setTipoSustento]   = useState<'01'|'02'|'03'|'04'|'05'>('02')
    const [formaPago, setFormaPago]         = useState<'CONTADO'|'CREDITO'>('CONTADO')
    const [fechaVenc, setFechaVenc]         = useState('')
    const [observaciones, setObservaciones] = useState('')

    const [detalle, setDetalle] = useState<LineaServicio[]>([{
        descripcion: '', cantidad: 1, precio_unitario: 0,
        subtotal: 0, aplica_iva: true, tipo_gasto: 'SERVICIOS', orden: 1,
    }])

    const [baseIva0,  setBaseIva0]           = useState(0)
    const [baseIva5,  setBaseIva5]           = useState(0)
    const [baseIva15, setBaseIva15]          = useState(0)
    const [valorIvaManual, setValorIvaManual] = useState(0)
    const [modoIvaManual, setModoIvaManual]   = useState(false)

    const [numeroRetencion, setNumeroRetencion] = useState('')
    const [retenciones, setRetenciones]         = useState<RetLine[]>([])
    const [retSeccion, setRetSeccion]            = useState(false)

    useEffect(() => { if (empresa?.id) load() }, [empresa?.id])

    async function load() {
        try {
            const provs = await proveedorService.listar(empresa!.id)
            setProveedores(provs.filter(p => p.estado === 'ACTIVO'))
        } catch (e: any) { alert('Error: ' + e.message) }
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

    const subtotalLineas = detalle.reduce((s, d) => s + d.cantidad * d.precio_unitario, 0)
    const ivaCalc = modoIvaManual
        ? valorIvaManual
        : Math.round((baseIva5 * 0.05 + subtotalLineas * 0.15) * 100) / 100
    const b0  = modoIvaManual ? baseIva0  : 0
    const b5  = modoIvaManual ? baseIva5  : 0
    const b15 = modoIvaManual ? baseIva15 : subtotalLineas
    const total    = subtotalLineas + ivaCalc
    const totalRet = retenciones.reduce((s, r) => s + r.valor, 0)

    function addLinea() {
        setDetalle(prev => [...prev, {
            descripcion: '', cantidad: 1, precio_unitario: 0,
            subtotal: 0, aplica_iva: true, tipo_gasto: 'SERVICIOS', orden: prev.length + 1,
        }])
    }
    function updLinea(i: number, campo: keyof LineaServicio, val: unknown) {
        setDetalle(prev => prev.map((d, j) => {
            if (j !== i) return d
            const updated = { ...d, [campo]: val }
            updated.subtotal = updated.cantidad * updated.precio_unitario
            return updated
        }))
    }
    function removeLinea(i: number) { setDetalle(prev => prev.filter((_, j) => j !== i)) }

    async function handleGuardar() {
        if (!proveedorId) { alert('Selecciona un proveedor'); return }
        const validas = detalle.filter(d => d.descripcion.trim() && d.precio_unitario > 0)
        if (!validas.length) { alert('Agrega al menos un servicio con descripción y precio'); return }
        if (formaPago === 'CREDITO' && !fechaVenc) { alert('Ingresa la fecha de vencimiento'); return }
        try {
            setSaving(true)
            const prov = proveedores.find(p => p.id === proveedorId)
            let fechaVencFinal = fechaVenc
            if (formaPago === 'CREDITO' && !fechaVenc && prov?.dias_credito) {
                const d = new Date(); d.setDate(d.getDate() + prov.dias_credito)
                fechaVencFinal = d.toISOString().split('T')[0]
            }
            const retsParaGuardar = retenciones.filter(r => r.codigo && r.valor > 0).map(r => ({
                empresa_id: empresa!.id, proveedor_id: proveedorId,
                numero_retencion: numeroRetencion || undefined,
                fecha_emision: HOY, tipo: r.tipo,
                codigo_retencion: r.codigo, descripcion: r.descripcion,
                base_imponible: r.base, porcentaje: r.pct, valor: r.valor,
                estado: 'ACTIVO' as const, origen: 'MANUAL' as const,
                created_by: profile?.id,
            }))
            await compraService.crearServicio(
                {
                    empresa_id: empresa!.id, proveedor_id: proveedorId,
                    numero_factura: numeroFactura || undefined,
                    fecha_ingreso: HOY, fecha_emision: fechaEmision,
                    estab: estab || undefined, pto_emi: ptoEmi || undefined,
                    secuencial: secuencial || undefined, clave_acceso: claveAcceso || undefined,
                    observaciones: observaciones || undefined,
                    base_iva_0: b0, base_iva_5: b5, base_iva_15: b15,
                    subtotal: subtotalLineas, valor_iva: ivaCalc, total,
                    forma_pago: formaPago,
                    fecha_vencimiento: formaPago === 'CREDITO' ? fechaVencFinal : undefined,
                    tipo_sustento: tipoSustento, tipo_regimen_pago: '01', aplica_convenio_ddi: false,
                    estado: 'ACTIVO', origen: 'MANUAL', tipo_compra: 'SERVICIO', created_by: profile?.id,
                },
                validas.map((d, i) => ({ ...d, orden: i + 1 })),
                retsParaGuardar,
            )

            // Asiento contable (no-fatal si falla)
            if (empresa!.usar_contabilidad_compras && empresa!.config_cuentas_compras) {
                const ctas = empresa!.config_cuentas_compras as unknown as CuentasCompras
                if (ctas.gastos_servicios && ctas.cuentas_por_pagar && ctas.efectivo) {
                    const retF = retsParaGuardar.filter(r => r.tipo === 'FUENTE').reduce((s, r) => s + r.valor, 0)
                    const retI = retsParaGuardar.filter(r => r.tipo === 'IVA').reduce((s, r) => s + r.valor, 0)
                    contabilidadService.crearAsientoCompra({
                        empresaId: empresa!.id,
                        fecha: HOY,
                        glosa: `Compra servicio ${numeroFactura || proveedorId.slice(0, 8)}`,
                        subtotal: subtotalLineas,
                        valorIva: ivaCalc,
                        retFuente: retF,
                        retIva: retI,
                        formaPago,
                        tipoCompra: 'SERVICIO',
                        cuentas: ctas,
                        referencia: numeroFactura || undefined,
                        creadoPor: profile?.id,
                    }).catch(err => console.warn('Asiento contable no creado:', err.message))
                }
            }

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
            <div className="flex items-center gap-3">
                <button onClick={() => navigate('/compras')}
                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Nueva Compra de Servicio</h1>
                    <p className="text-slate-500 text-sm">Honorarios, arrend., servicios básicos, etc.</p>
                </div>
            </div>

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
                            {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre_empresa} — {p.ruc}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="label">Fecha emisión</label>
                        <input type="date" className="input" value={fechaEmision}
                            onChange={e => setFechaEmision(e.target.value)} />
                    </div>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                    <div><label className="label text-xs">Estab.</label>
                        <input className="input font-mono" maxLength={3} placeholder="001" value={estab} onChange={e => setEstab(e.target.value)} /></div>
                    <div><label className="label text-xs">Pto. Emi.</label>
                        <input className="input font-mono" maxLength={3} placeholder="001" value={ptoEmi} onChange={e => setPtoEmi(e.target.value)} /></div>
                    <div className="col-span-2"><label className="label text-xs">Secuencial</label>
                        <input className="input font-mono" maxLength={9} placeholder="000000001" value={secuencial} onChange={e => setSecuencial(e.target.value)} /></div>
                    <div className="col-span-2"><label className="label text-xs">Nº Factura</label>
                        <input className="input font-mono text-xs" readOnly value={numeroFactura} placeholder="001-001-000000001" /></div>
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

            <div className="card p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="font-bold text-slate-700 text-sm uppercase tracking-wider">Detalle de servicios</h2>
                    <button onClick={addLinea} className="btn btn-primary btn-sm flex items-center gap-1.5">
                        <Plus className="w-4 h-4" /> Agregar línea
                    </button>
                </div>
                <div className="space-y-3">
                    {detalle.map((d, i) => (
                        <div key={i} className="grid grid-cols-12 gap-2 items-start p-3 bg-slate-50 rounded-xl">
                            <div className="col-span-12 md:col-span-4">
                                <label className="label text-xs">Descripción <span className="text-red-500">*</span></label>
                                <input className="input text-sm" value={d.descripcion}
                                    onChange={e => updLinea(i, 'descripcion', e.target.value)}
                                    placeholder="Ej: Honorarios contables mayo 2026" />
                            </div>
                            <div className="col-span-4 md:col-span-2">
                                <label className="label text-xs">Tipo gasto</label>
                                <select className="input text-xs" value={d.tipo_gasto}
                                    onChange={e => updLinea(i, 'tipo_gasto', e.target.value as TipoGasto)}>
                                    {Object.entries(TIPO_GASTO_LABELS).map(([k, v]) => (
                                        <option key={k} value={k}>{v}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="col-span-4 md:col-span-2">
                                <label className="label text-xs">Cant.</label>
                                <input type="number" min={0} step={0.01} className="input text-sm text-right"
                                    value={d.cantidad || ''} onChange={e => updLinea(i, 'cantidad', parseFloat(e.target.value) || 0)} />
                            </div>
                            <div className="col-span-4 md:col-span-2">
                                <label className="label text-xs">Precio unit.</label>
                                <input type="number" min={0} step={0.01} className="input text-sm text-right"
                                    value={d.precio_unitario || ''} onChange={e => updLinea(i, 'precio_unitario', parseFloat(e.target.value) || 0)} />
                            </div>
                            <div className="col-span-10 md:col-span-1 flex flex-col">
                                <label className="label text-xs">Subtotal</label>
                                <div className="input bg-white text-right font-mono text-sm font-bold">
                                    ${(d.cantidad * d.precio_unitario).toFixed(2)}
                                </div>
                            </div>
                            <div className="col-span-2 md:col-span-1 flex items-end pb-0.5">
                                <button onClick={() => removeLinea(i)}
                                    className="p-2 hover:bg-red-50 rounded-lg text-slate-300 hover:text-red-500 w-full flex justify-center">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="border-t pt-4 space-y-3">
                    <div className="flex items-center gap-3">
                        <p className="text-xs font-bold text-slate-500 uppercase">IVA</p>
                        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input type="checkbox" checked={modoIvaManual} onChange={e => setModoIvaManual(e.target.checked)} />
                            Ingresar bases manualmente
                        </label>
                    </div>
                    {modoIvaManual ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div><label className="label text-xs">Base IVA 0%</label>
                                <input type="number" step={0.01} className="input text-sm text-right"
                                    value={baseIva0 || ''} onChange={e => setBaseIva0(parseFloat(e.target.value) || 0)} /></div>
                            <div><label className="label text-xs">Base IVA 5%</label>
                                <input type="number" step={0.01} className="input text-sm text-right"
                                    value={baseIva5 || ''} onChange={e => setBaseIva5(parseFloat(e.target.value) || 0)} /></div>
                            <div><label className="label text-xs">Base IVA 15%</label>
                                <input type="number" step={0.01} className="input text-sm text-right"
                                    value={baseIva15 || ''} onChange={e => setBaseIva15(parseFloat(e.target.value) || 0)} /></div>
                            <div><label className="label text-xs">Valor IVA</label>
                                <input type="number" step={0.01} className="input text-sm text-right"
                                    value={valorIvaManual || ''} onChange={e => setValorIvaManual(parseFloat(e.target.value) || 0)} /></div>
                        </div>
                    ) : (
                        <p className="text-xs text-slate-500">IVA automático al 15%: <strong>${ivaCalc.toFixed(2)}</strong></p>
                    )}
                </div>

                <div className="flex justify-between items-center border-t pt-3">
                    <div className="space-y-0.5 text-sm text-slate-500">
                        <p>Subtotal: <span className="font-mono text-slate-700">${subtotalLineas.toFixed(2)}</span></p>
                        <p>IVA: <span className="font-mono text-slate-700">${ivaCalc.toFixed(2)}</span></p>
                        {totalRet > 0 && <p>Total retenciones: <span className="font-mono text-amber-700">-${totalRet.toFixed(2)}</span></p>}
                        {formaPago === 'CREDITO' && totalRet > 0 && (
                            <p className="font-semibold">CxP: <span className="font-mono">${Math.max(total - totalRet, 0).toFixed(2)}</span></p>
                        )}
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-slate-400">TOTAL FACTURA</p>
                        <p className="text-2xl font-bold text-primary-700">${total.toFixed(2)}</p>
                    </div>
                </div>
            </div>

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
                <button onClick={handleGuardar} disabled={saving}
                    className={cn('btn btn-primary flex items-center gap-2', saving && 'opacity-60')}>
                    {saving
                        ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Guardando...</>
                        : <><Save className="w-4 h-4" /> Registrar servicio</>
                    }
                </button>
            </div>
        </div>
    )
}
