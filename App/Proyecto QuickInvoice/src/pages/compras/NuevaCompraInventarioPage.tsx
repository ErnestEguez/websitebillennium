import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { compraService, proveedorService } from '../../services/vendorService'
import { inventarioService } from '../../services/inventarioService'
import type { Proveedor, RetencionCompra } from '../../types/vendors'
import { CODIGOS_RETENCION_FUENTE, CODIGOS_RETENCION_IVA, TIPO_SUSTENTO_LABELS } from '../../types/vendors'
import {
    ArrowLeft, Plus, Trash2, Save, Package,
    AlertCircle, ChevronDown, ChevronUp, Info,
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
    const [productos, setProductos] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    // Cabecera
    const [proveedorId, setProveedorId] = useState('')
    const [fechaEmision, setFechaEmision] = useState(HOY)
    const [estab, setEstab]               = useState('')
    const [ptoEmi, setPtoEmi]             = useState('')
    const [secuencial, setSecuencial]     = useState('')
    const [numeroFactura, setNumeroFactura] = useState('')
    const [claveAcceso, setClaveAcceso]   = useState('')
    const [tipoSustento, setTipoSustento] = useState<'01'|'02'|'03'|'04'|'05'>('04')
    const [formaPago, setFormaPago]       = useState<'CONTADO'|'CREDITO'>('CONTADO')
    const [fechaVenc, setFechaVenc]       = useState('')
    const [observaciones, setObservaciones] = useState('')

    // Detalle
    const [detalle, setDetalle] = useState<LineaDetalle[]>([])

    // Impuestos (calculados)
    const [baseIva0, setBaseIva0]   = useState(0)
    const [baseIva15, setBaseIva15] = useState(0)
    const [porcIva, setPorcIva]     = useState<0|15>(15)

    // Retención
    const [tieneRet, setTieneRet]   = useState(false)
    const [retTipo, setRetTipo]     = useState<'FUENTE'|'IVA'>('FUENTE')
    const [retCodigo, setRetCodigo] = useState('')
    const [retDesc, setRetDesc]     = useState('')
    const [retBase, setRetBase]     = useState(0)
    const [retPct, setRetPct]       = useState(0)
    const [retNumero, setRetNumero] = useState('')
    const [retSeccion, setRetSeccion] = useState(false)

    useEffect(() => { if (empresa?.id) load() }, [empresa?.id])

    async function load() {
        try {
            const [provs, prods] = await Promise.all([
                proveedorService.listar(empresa!.id),
                inventarioService.getStockByEmpresa(empresa!.id),
            ])
            setProveedores(provs.filter(p => p.estado === 'ACTIVO'))
            setProductos(prods)
        } catch (e: any) {
            alert('Error al cargar datos: ' + e.message)
        } finally {
            setLoading(false)
        }
    }

    // Autocompletar número de factura al cambiar estab/pto_emi/secuencial
    useEffect(() => {
        if (estab && ptoEmi && secuencial)
            setNumeroFactura(`${estab.padStart(3,'0')}-${ptoEmi.padStart(3,'0')}-${secuencial.padStart(9,'0')}`)
    }, [estab, ptoEmi, secuencial])

    // Calcular totales
    const subtotalLineas = detalle.reduce((s, d) => s + d.cantidad * d.costo_unitario, 0)
    const baseGrav = baseIva15
    const baseNoGrav = baseIva0 || subtotalLineas - baseGrav
    const ivaCalc = Math.round(baseGrav * porcIva) / 100
    const total = subtotalLineas + ivaCalc
    const retValor = Math.round(retBase * retPct) / 100

    function addLinea() {
        setDetalle(prev => [...prev, { producto_id: '', nombre: '', cantidad: 1, costo_unitario: 0 }])
    }
    function updLinea(i: number, campo: keyof LineaDetalle, val: any) {
        setDetalle(prev => {
            const next = [...prev]
            if (campo === 'producto_id') {
                const prod = productos.find(p => p.id === val)
                next[i] = { ...next[i], producto_id: val, nombre: prod?.nombre ?? '' }
            } else {
                next[i] = { ...next[i], [campo]: val }
            }
            return next
        })
    }
    function removeLinea(i: number) {
        setDetalle(prev => prev.filter((_, j) => j !== i))
    }

    function seleccionarCodRet(codigo: string, tipo: 'FUENTE'|'IVA') {
        const lista = tipo === 'FUENTE' ? CODIGOS_RETENCION_FUENTE : CODIGOS_RETENCION_IVA
        const item = lista.find(c => c.codigo === codigo)
        if (item) {
            setRetCodigo(codigo)
            setRetDesc(item.descripcion)
            setRetPct(item.porcentaje)
        }
    }

    async function handleGuardar() {
        if (!proveedorId) { alert('Selecciona un proveedor'); return }
        const validas = detalle.filter(d => d.producto_id && d.cantidad > 0 && d.costo_unitario > 0)
        if (validas.length === 0) { alert('Agrega al menos un producto válido'); return }
        if (formaPago === 'CREDITO' && !fechaVenc) { alert('Ingresa la fecha de vencimiento'); return }

        try {
            setSaving(true)
            const proveedor = proveedores.find(p => p.id === proveedorId)
            const diasCredito = proveedor?.dias_credito

            let fechaVencFinal = fechaVenc
            if (formaPago === 'CREDITO' && !fechaVenc && diasCredito) {
                const d = new Date(fechaEmision)
                d.setDate(d.getDate() + diasCredito)
                fechaVencFinal = d.toISOString().split('T')[0]
            }

            const retencion: Omit<RetencionCompra, 'id' | 'compra_id' | 'created_at'> | undefined =
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

            await compraService.crearInventario(
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
                    base_iva_0: baseNoGrav,
                    base_iva_5: 0,
                    base_iva_15: baseGrav,
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
                    tipo_compra: 'INVENTARIO',
                    created_by: profile?.id,
                },
                validas.map(d => ({
                    producto_id: d.producto_id,
                    cantidad: d.cantidad,
                    costo_unitario: d.costo_unitario,
                    subtotal: Math.round(d.cantidad * d.costo_unitario * 100) / 100,
                })),
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

            {/* ── Sección 1: Proveedor y factura ── */}
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

                {/* Número de factura */}
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                    <div>
                        <label className="label text-xs">Estab.</label>
                        <input className="input font-mono" maxLength={3} placeholder="001"
                            value={estab} onChange={e => setEstab(e.target.value)} />
                    </div>
                    <div>
                        <label className="label text-xs">Pto. Emi.</label>
                        <input className="input font-mono" maxLength={3} placeholder="001"
                            value={ptoEmi} onChange={e => setPtoEmi(e.target.value)} />
                    </div>
                    <div className="col-span-2">
                        <label className="label text-xs">Secuencial</label>
                        <input className="input font-mono" maxLength={9} placeholder="000000001"
                            value={secuencial} onChange={e => setSecuencial(e.target.value)} />
                    </div>
                    <div className="col-span-2">
                        <label className="label text-xs">Nº Factura</label>
                        <input className="input font-mono text-xs" readOnly value={numeroFactura}
                            placeholder="001-001-000000001" />
                    </div>
                </div>

                <div>
                    <label className="label text-xs">Clave de acceso (49 dígitos) — opcional</label>
                    <input className="input font-mono text-xs" maxLength={49} value={claveAcceso}
                        onChange={e => setClaveAcceso(e.target.value)}
                        placeholder="Clave de acceso SRI (opcional)" />
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
                        onChange={e => setObservaciones(e.target.value)}
                        placeholder="Notas internas..." />
                </div>
            </div>

            {/* ── Sección 2: Detalle de productos ── */}
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
                                        <th className="text-right py-2 px-3 w-24 font-semibold">Cantidad</th>
                                        <th className="text-right py-2 px-3 w-28 font-semibold">Costo unit.</th>
                                        <th className="text-right py-2 px-3 w-28 font-semibold">Subtotal</th>
                                        <th className="w-8" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {detalle.map((d, i) => (
                                        <tr key={i} className="group">
                                            <td className="py-2 pr-3">
                                                <select className="input text-sm w-full"
                                                    value={d.producto_id}
                                                    onChange={e => updLinea(i, 'producto_id', e.target.value)}>
                                                    <option value="">Seleccionar...</option>
                                                    {productos.map(p => (
                                                        <option key={p.id} value={p.id}>{p.nombre}</option>
                                                    ))}
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
                            <p className="text-xs font-bold text-slate-500 uppercase">Impuestos</p>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                                <div>
                                    <label className="label text-xs">% IVA gravado</label>
                                    <select className="input text-sm" value={porcIva}
                                        onChange={e => setPorcIva(parseInt(e.target.value) as any)}>
                                        <option value={0}>0% (exento)</option>
                                        <option value={15}>15%</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="label text-xs">Base gravada (IVA {porcIva}%)</label>
                                    <input type="number" step={0.01} className="input text-sm text-right"
                                        value={baseIva15 || subtotalLineas}
                                        onChange={e => setBaseIva15(parseFloat(e.target.value) || 0)} />
                                </div>
                                <div>
                                    <label className="label text-xs">Base IVA 0%</label>
                                    <input type="number" step={0.01} className="input text-sm text-right"
                                        value={baseIva0}
                                        onChange={e => setBaseIva0(parseFloat(e.target.value) || 0)} />
                                </div>
                                <div className="text-right">
                                    <p className="text-xs text-slate-500 mb-1">IVA calculado</p>
                                    <p className="text-lg font-bold text-slate-800">${ivaCalc.toFixed(2)}</p>
                                </div>
                            </div>
                        </div>

                        {/* Total */}
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
                    </>
                )}
            </div>

            {/* ── Sección 3: Retención (colapsable) ── */}
            <div className="card overflow-hidden">
                <button
                    onClick={() => setRetSeccion(v => !v)}
                    className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors"
                >
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-700 text-sm uppercase tracking-wider">Retención en la fuente / IVA</span>
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
                                        <label className="label text-xs">Tipo de retención</label>
                                        <select className="input text-sm" value={retTipo}
                                            onChange={e => { setRetTipo(e.target.value as any); setRetCodigo('') }}>
                                            <option value="FUENTE">Retención en la fuente</option>
                                            <option value="IVA">Retención de IVA</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="label text-xs">Código de retención</label>
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
                                        <label className="label text-xs">% Retención</label>
                                        <input type="number" step={0.01} className="input text-sm text-right"
                                            value={retPct}
                                            onChange={e => setRetPct(parseFloat(e.target.value) || 0)} />
                                    </div>
                                    <div>
                                        <label className="label text-xs">Valor retención</label>
                                        <div className="input bg-slate-50 text-right font-mono font-bold text-slate-800">
                                            ${retValor.toFixed(2)}
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="label text-xs">Nº Comprobante de retención (opcional)</label>
                                    <input className="input text-sm font-mono" value={retNumero}
                                        onChange={e => setRetNumero(e.target.value)}
                                        placeholder="001-001-000000001" />
                                </div>

                                <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-xl">
                                    <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                                    <p className="text-xs text-blue-700">
                                        Si la compra es a crédito, el saldo en CxP se calculará como: <strong>Total factura - Valor retención = ${(total - retValor).toFixed(2)}</strong>
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Botones */}
            <div className="flex justify-end gap-3">
                <button onClick={() => navigate('/compras')} className="btn btn-secondary">
                    Cancelar
                </button>
                <button onClick={handleGuardar} disabled={saving || detalle.length === 0}
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
