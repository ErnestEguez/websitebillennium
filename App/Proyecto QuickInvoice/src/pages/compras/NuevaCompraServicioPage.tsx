import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { compraService, proveedorService } from '../../services/vendorService'
import type { Proveedor, DetalleServicio, RetencionCompra, TipoGasto } from '../../types/vendors'
import {
    CODIGOS_RETENCION_FUENTE, CODIGOS_RETENCION_IVA,
    TIPO_SUSTENTO_LABELS, TIPO_GASTO_LABELS,
} from '../../types/vendors'
import {
    ArrowLeft, Plus, Trash2, Save, Wrench,
    ChevronDown, ChevronUp, Info,
} from 'lucide-react'
import { cn } from '../../lib/utils'

const HOY = new Date().toISOString().split('T')[0]

type LineaServicio = Omit<DetalleServicio, 'id' | 'empresa_id' | 'compra_id'>

export function NuevaCompraServicioPage() {
    const { empresa, profile } = useAuth()
    const navigate = useNavigate()

    const [proveedores, setProveedores] = useState<Proveedor[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    // Cabecera
    const [proveedorId, setProveedorId]   = useState('')
    const [fechaEmision, setFechaEmision] = useState(HOY)
    const [estab, setEstab]               = useState('')
    const [ptoEmi, setPtoEmi]             = useState('')
    const [secuencial, setSecuencial]     = useState('')
    const [numeroFactura, setNumeroFactura] = useState('')
    const [claveAcceso, setClaveAcceso]   = useState('')
    const [tipoSustento, setTipoSustento] = useState<'01'|'02'|'03'|'04'|'05'>('02')
    const [formaPago, setFormaPago]       = useState<'CONTADO'|'CREDITO'>('CONTADO')
    const [fechaVenc, setFechaVenc]       = useState('')
    const [observaciones, setObservaciones] = useState('')

    // Detalle servicios
    const [detalle, setDetalle] = useState<LineaServicio[]>([{
        descripcion: '', cantidad: 1, precio_unitario: 0,
        subtotal: 0, aplica_iva: true, tipo_gasto: 'SERVICIOS', orden: 1,
    }])

    // IVA manual (la factura ya viene con IVA calculado por el proveedor)
    const [baseIva0, setBaseIva0]   = useState(0)
    const [baseIva15, setBaseIva15] = useState(0)
    const [valorIva, setValorIva]   = useState(0)
    const [modoIvaManual, setModoIvaManual] = useState(false)

    // Retención
    const [tieneRet, setTieneRet]     = useState(false)
    const [retTipo, setRetTipo]       = useState<'FUENTE'|'IVA'>('FUENTE')
    const [retCodigo, setRetCodigo]   = useState('')
    const [retDesc, setRetDesc]       = useState('')
    const [retBase, setRetBase]       = useState(0)
    const [retPct, setRetPct]         = useState(0)
    const [retNumero, setRetNumero]   = useState('')
    const [retSeccion, setRetSeccion] = useState(false)

    useEffect(() => { if (empresa?.id) load() }, [empresa?.id])

    async function load() {
        try {
            const provs = await proveedorService.listar(empresa!.id)
            setProveedores(provs.filter(p => p.estado === 'ACTIVO'))
        } catch (e: any) {
            alert('Error: ' + e.message)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (estab && ptoEmi && secuencial)
            setNumeroFactura(`${estab.padStart(3,'0')}-${ptoEmi.padStart(3,'0')}-${secuencial.padStart(9,'0')}`)
    }, [estab, ptoEmi, secuencial])

    const subtotalLineas = detalle.reduce((s, d) => s + d.cantidad * d.precio_unitario, 0)
    const ivaCalc = modoIvaManual ? valorIva : Math.round(subtotalLineas * 0.15 * 100) / 100
    const baseGravCalc = modoIvaManual ? baseIva15 : subtotalLineas
    const total = subtotalLineas + ivaCalc
    const retValor = Math.round(retBase * retPct) / 100

    function addLinea() {
        setDetalle(prev => [...prev, {
            descripcion: '', cantidad: 1, precio_unitario: 0, subtotal: 0,
            aplica_iva: true, tipo_gasto: 'SERVICIOS', orden: prev.length + 1,
        }])
    }
    function updLinea(i: number, campo: keyof LineaServicio, val: any) {
        setDetalle(prev => {
            const next = [...prev]
            next[i] = { ...next[i], [campo]: val }
            next[i].subtotal = next[i].cantidad * next[i].precio_unitario
            return next
        })
    }
    function removeLinea(i: number) {
        setDetalle(prev => prev.filter((_, j) => j !== i))
    }

    function seleccionarCodRet(codigo: string, tipo: 'FUENTE'|'IVA') {
        const lista = tipo === 'FUENTE' ? CODIGOS_RETENCION_FUENTE : CODIGOS_RETENCION_IVA
        const item = lista.find(c => c.codigo === codigo)
        if (item) { setRetCodigo(codigo); setRetDesc(item.descripcion); setRetPct(item.porcentaje) }
    }

    async function handleGuardar() {
        if (!proveedorId) { alert('Selecciona un proveedor'); return }
        const validas = detalle.filter(d => d.descripcion.trim() && d.precio_unitario > 0)
        if (validas.length === 0) { alert('Agrega al menos un servicio con descripción y precio'); return }
        if (formaPago === 'CREDITO' && !fechaVenc) { alert('Ingresa la fecha de vencimiento'); return }

        try {
            setSaving(true)
            const prov = proveedores.find(p => p.id === proveedorId)
            let fechaVencFinal = fechaVenc
            if (formaPago === 'CREDITO' && !fechaVenc && prov?.dias_credito) {
                const d = new Date()
                d.setDate(d.getDate() + prov.dias_credito)
                fechaVencFinal = d.toISOString().split('T')[0]
            }

            const retencion: Omit<RetencionCompra, 'id'|'compra_id'|'created_at'>|undefined =
                tieneRet && retCodigo ? {
                    empresa_id: empresa!.id,
                    proveedor_id: proveedorId,
                    numero_retencion: retNumero || undefined,
                    fecha_emision: HOY,
                    tipo: retTipo,
                    codigo_retencion: retCodigo,
                    descripcion: retDesc,
                    base_imponible: retBase || subtotalLineas,
                    porcentaje: retPct,
                    valor: retValor,
                    estado: 'ACTIVO',
                    origen: 'MANUAL',
                    created_by: profile?.id,
                } : undefined

            await compraService.crearServicio(
                {
                    empresa_id: empresa!.id,
                    proveedor_id: proveedorId,
                    numero_factura: numeroFactura || undefined,
                    fecha_ingreso: HOY,
                    fecha_emision: fechaEmision,
                    estab: estab || undefined,
                    pto_emi: ptoEmi || undefined,
                    secuencial: secuencial || undefined,
                    clave_acceso: claveAcceso || undefined,
                    observaciones: observaciones || undefined,
                    base_iva_0: modoIvaManual ? baseIva0 : 0,
                    base_iva_5: 0,
                    base_iva_15: baseGravCalc,
                    subtotal: subtotalLineas,
                    valor_iva: ivaCalc,
                    total,
                    forma_pago: formaPago,
                    fecha_vencimiento: formaPago === 'CREDITO' ? fechaVencFinal : undefined,
                    tipo_sustento: tipoSustento,
                    tipo_regimen_pago: '01',
                    aplica_convenio_ddi: false,
                    estado: 'ACTIVO',
                    origen: 'MANUAL',
                    tipo_compra: 'SERVICIO',
                    created_by: profile?.id,
                },
                validas.map((d, i) => ({ ...d, orden: i + 1 })),
                retencion,
            )
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
                    <p className="text-slate-500 text-sm">Honorarios, servicios básicos, arrendamientos, etc.</p>
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
                                    const d = new Date()
                                    d.setDate(d.getDate() + prov.dias_credito)
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
                            onChange={e => setTipoSustento(e.target.value as any)}>
                            {Object.entries(TIPO_SUSTENTO_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>{k} — {v}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="label text-xs">Forma de pago</label>
                        <select className="input text-sm" value={formaPago}
                            onChange={e => setFormaPago(e.target.value as any)}>
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

            {/* Detalle de servicios */}
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
                                    placeholder="Ej: Servicio de contabilidad mayo 2026" />
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
                                    value={d.cantidad || ''}
                                    onChange={e => updLinea(i, 'cantidad', parseFloat(e.target.value) || 0)} />
                            </div>
                            <div className="col-span-4 md:col-span-2">
                                <label className="label text-xs">Precio unit.</label>
                                <input type="number" min={0} step={0.01} className="input text-sm text-right"
                                    value={d.precio_unitario || ''}
                                    onChange={e => updLinea(i, 'precio_unitario', parseFloat(e.target.value) || 0)} />
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

                {/* IVA */}
                <div className="border-t pt-4 space-y-3">
                    <div className="flex items-center gap-3">
                        <p className="text-xs font-bold text-slate-500 uppercase">IVA</p>
                        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input type="checkbox" checked={modoIvaManual}
                                onChange={e => setModoIvaManual(e.target.checked)} />
                            Ingresar manualmente (desde la factura)
                        </label>
                    </div>

                    {modoIvaManual ? (
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="label text-xs">Base IVA 0%</label>
                                <input type="number" step={0.01} className="input text-sm text-right"
                                    value={baseIva0} onChange={e => setBaseIva0(parseFloat(e.target.value) || 0)} />
                            </div>
                            <div>
                                <label className="label text-xs">Base IVA 15%</label>
                                <input type="number" step={0.01} className="input text-sm text-right"
                                    value={baseIva15} onChange={e => setBaseIva15(parseFloat(e.target.value) || 0)} />
                            </div>
                            <div>
                                <label className="label text-xs">Valor IVA</label>
                                <input type="number" step={0.01} className="input text-sm text-right"
                                    value={valorIva} onChange={e => setValorIva(parseFloat(e.target.value) || 0)} />
                            </div>
                        </div>
                    ) : (
                        <p className="text-xs text-slate-500">IVA calculado automáticamente al 15% sobre el subtotal: <strong>${ivaCalc.toFixed(2)}</strong></p>
                    )}
                </div>

                <div className="flex justify-between items-center border-t pt-3">
                    <div className="space-y-0.5 text-sm text-slate-500">
                        <p>Subtotal: <span className="font-mono text-slate-700">${subtotalLineas.toFixed(2)}</span></p>
                        <p>IVA: <span className="font-mono text-slate-700">${ivaCalc.toFixed(2)}</span></p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-slate-400">TOTAL FACTURA</p>
                        <p className="text-2xl font-bold text-primary-700">${total.toFixed(2)}</p>
                    </div>
                </div>
            </div>

            {/* Retención */}
            <div className="card overflow-hidden">
                <button onClick={() => setRetSeccion(v => !v)}
                    className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-700 text-sm uppercase tracking-wider">Retención</span>
                        {tieneRet && retCodigo && (
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                                {retCodigo} — {retPct}% — ${retValor.toFixed(2)}
                            </span>
                        )}
                    </div>
                    {retSeccion ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>

                {retSeccion && (
                    <div className="p-5 pt-0 space-y-4 border-t border-slate-100">
                        <label className="flex items-center gap-2 cursor-pointer mt-4">
                            <input type="checkbox" className="w-4 h-4 rounded"
                                checked={tieneRet} onChange={e => setTieneRet(e.target.checked)} />
                            <span className="text-sm font-medium text-slate-700">Esta compra tiene retención</span>
                        </label>

                        {tieneRet && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="label text-xs">Tipo</label>
                                        <select className="input text-sm" value={retTipo}
                                            onChange={e => { setRetTipo(e.target.value as any); setRetCodigo('') }}>
                                            <option value="FUENTE">Retención en la fuente</option>
                                            <option value="IVA">Retención de IVA</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="label text-xs">Código</label>
                                        <select className="input text-sm" value={retCodigo}
                                            onChange={e => seleccionarCodRet(e.target.value, retTipo)}>
                                            <option value="">Seleccionar...</option>
                                            {(retTipo === 'FUENTE' ? CODIGOS_RETENCION_FUENTE : CODIGOS_RETENCION_IVA).map(c => (
                                                <option key={c.codigo} value={c.codigo}>
                                                    {c.codigo} — {c.descripcion.slice(0, 50)} ({c.porcentaje}%)
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <label className="label text-xs">Base imponible</label>
                                        <input type="number" step={0.01} className="input text-sm text-right"
                                            value={retBase || subtotalLineas}
                                            onChange={e => setRetBase(parseFloat(e.target.value) || 0)} />
                                    </div>
                                    <div>
                                        <label className="label text-xs">%</label>
                                        <input type="number" step={0.01} className="input text-sm text-right"
                                            value={retPct} onChange={e => setRetPct(parseFloat(e.target.value) || 0)} />
                                    </div>
                                    <div>
                                        <label className="label text-xs">Valor</label>
                                        <div className="input bg-slate-50 text-right font-mono font-bold">${retValor.toFixed(2)}</div>
                                    </div>
                                </div>

                                <div>
                                    <label className="label text-xs">Nº Comprobante retención (opcional)</label>
                                    <input className="input text-sm font-mono" value={retNumero}
                                        onChange={e => setRetNumero(e.target.value)} placeholder="001-001-000000001" />
                                </div>

                                <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-xl">
                                    <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                                    <p className="text-xs text-blue-700">
                                        CxP a crédito = Total factura - Retención = <strong>${(total - retValor).toFixed(2)}</strong>
                                    </p>
                                </div>
                            </div>
                        )}
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
