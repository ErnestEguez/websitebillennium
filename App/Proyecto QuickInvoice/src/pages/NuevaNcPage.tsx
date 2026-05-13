import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ncService } from '../services/ncService'
import type { ComprobanteParaNC, NCDetalle, NotaCredito } from '../services/ncService'
import { kardexService } from '../services/kardexService'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatCurrency, cn } from '../lib/utils'
import { format } from 'date-fns'
import {
    Search, ChevronRight, ChevronLeft, AlertCircle,
    CheckCircle2, Loader2, Printer, FileMinus, X, FileText,
} from 'lucide-react'

type Step = 1 | 2 | 3 | 4  // 4 = éxito

const MOTIVOS_SRI = [
    { value: '01', label: '01 — Devolución y anulación de bienes', tipo: 'DEVOLUCION' },
    { value: '03', label: '03 — Rebaja o descuento',               tipo: 'DESCUENTO'  },
    { value: '04', label: '04 — Corrección en el valor',           tipo: 'CORRECCION' },
] as const

interface ItemNC {
    detalle: ComprobanteParaNC['comprobante_detalles'][0]
    cantidadNC: number
    incluir: boolean
    maxDisponible: number   // cantidad facturada − ya devuelta en NCs previas
}

const r2 = (n: number) => Math.round(n * 100) / 100

function calcularDetallesNC(items: ItemNC[]): NCDetalle[] {
    return items
        .filter(i => i.incluir && i.cantidadNC > 0)
        .map(i => {
            const cantidad        = r2(i.cantidadNC)
            const precioUnit      = r2(Number(i.detalle.precio_unitario))
            const descPct         = Number(i.detalle.descuento || 0)
            const subtotal        = r2(precioUnit * cantidad * (1 - descPct / 100))
            const iva_porcentaje  = Number(i.detalle.iva_porcentaje || 0)
            const iva_valor       = r2(subtotal * iva_porcentaje / 100)
            const total_linea     = r2(subtotal + iva_valor)
            return {
                producto_id:     i.detalle.producto_id,
                nombre_producto: i.detalle.nombre_producto,
                cantidad,
                precio_unitario: precioUnit,
                descuento:       descPct,
                subtotal,
                iva_porcentaje,
                iva_valor,
                total_linea,
            } as NCDetalle
        })
}

export function NuevaNcPage() {
    const { empresa, profile } = useAuth()
    const navigate = useNavigate()


    // ── Step 1: buscar factura
    const [step, setStep] = useState<Step>(1)
    const [searchText, setSearchText] = useState('')
    const [resultados, setResultados] = useState<any[]>([])
    const [buscando, setBuscando] = useState(false)
    const [facturaSeleccionada, setFacturaSeleccionada] = useState<ComprobanteParaNC | null>(null)
    const [errValidacion, setErrValidacion] = useState('')

    // ── Step 2: motivo + ítems
    const [motivoSri, setMotivoSri] = useState<'01' | '03' | '04'>('01')
    const [motivoDesc, setMotivoDesc] = useState('')
    const [items, setItems] = useState<ItemNC[]>([])

    const [errStep2, setErrStep2] = useState('')

    // ── Step 3: confirmación / procesamiento
    const [procesando, setProcesando] = useState(false)
    const [errProceso, setErrProceso] = useState('')

    // ── Step 4: resultado
    const [ncCreada, setNcCreada] = useState<NotaCredito | null>(null)
    const [aplicando, setAplicando] = useState(false)
    const [aplicacionMsg, setAplicacionMsg] = useState('')

    // ─── Buscar facturas ───────────────────────────────────
    useEffect(() => {
        if (!searchText.trim() || !empresa?.id) { setResultados([]); return }
        const t = setTimeout(async () => {
            setBuscando(true)
            try { setResultados(await ncService.buscarComprobantesParaNC(empresa.id, searchText)) }
            catch { setResultados([]) }
            finally { setBuscando(false) }
        }, 350)
        return () => clearTimeout(t)
    }, [searchText, empresa?.id])

    // ─── Seleccionar factura ───────────────────────────────
    async function seleccionarFactura(f: any) {
        setErrValidacion('')
        // Restricciones
        if (f.estado_sri !== 'AUTORIZADO') {
            setErrValidacion('Solo se puede emitir NC sobre facturas AUTORIZADAS por el SRI.')
            return
        }
        if (f.estado_sistema === 'ANULADA') {
            setErrValidacion('No se puede emitir NC sobre una factura ANULADA.')
            return
        }
        if (f.clientes?.identificacion === '9999999999999') {
            setErrValidacion('No se puede emitir NC para Consumidor Final (sin identificación).')
            return
        }

        const [full, devueltas] = await Promise.all([
            ncService.getComprobanteParaNC(f.id),
            ncService.getCantidadesDevueltas(f.id),
        ])
        setFacturaSeleccionada(full)
        setItems(full.comprobante_detalles.map(d => {
            const yaDevuelta  = Number(devueltas[d.producto_id || ''] || 0)
            const maxDisponible = r2(Math.max(0, Number(d.cantidad) - yaDevuelta))
            return { detalle: d, cantidadNC: 0, incluir: false, maxDisponible }
        }))
        setSearchText('')
        setResultados([])
        setStep(2)
    }

    // ─── Validar Step 2 ────────────────────────────────────
    function validarStep2(): boolean {
        if (!motivoDesc.trim()) { setErrStep2('Ingresa una descripción del motivo.'); return false }
        const detallesNC = calcularDetallesNC(items)
        if (detallesNC.length === 0) { setErrStep2('Selecciona al menos un ítem con cantidad > 0.'); return false }
        for (const i of items.filter(x => x.incluir)) {
            if (i.cantidadNC <= 0) {
                setErrStep2(`Ingresa la cantidad a devolver para "${i.detalle.nombre_producto}".`)
                return false
            }
            if (i.cantidadNC > i.maxDisponible) {
                setErrStep2(`"${i.detalle.nombre_producto}": solo puedes devolver ${i.maxDisponible} unidad(es) (ya se devolvieron ${r2(Number(i.detalle.cantidad) - i.maxDisponible)}).`)
                return false
            }
        }
        setErrStep2('')
        return true
    }

    // ─── Confirmar y procesar ──────────────────────────────
    async function confirmarNC() {
        if (!facturaSeleccionada || !empresa || !profile?.id) return
        setProcesando(true)
        setErrProceso('')

        try {
            const detallesNC = calcularDetallesNC(items)
            const motivoObj = MOTIVOS_SRI.find(m => m.value === motivoSri)!

            // Obtener config empresa
            const { data: emp } = await supabase
                .from('empresas')
                .select('ruc, config_sri')
                .eq('id', empresa.id)
                .single()
            const configSri = (emp as any)?.config_sri || {}

            // 1. Crear NC en BD
            const nc = await ncService.crearNotaCredito({
                empresaId:           empresa.id,
                empresaRuc:          (emp as any)?.ruc || '',
                empresaAmbiente:     configSri.ambiente || 'PRUEBAS',
                establecimiento:     configSri.establecimiento || '001',
                puntoEmision:        configSri.punto_emision || '001',
                comprobanteOrigenId: facturaSeleccionada.id,
                clienteId:           facturaSeleccionada.clientes.id,
                vendedorId:          null,
                tipoNc:              motivoObj.tipo as any,
                motivoSri,
                motivoDescripcion:   motivoDesc,
                detalles:            detallesNC,
                usuarioId:           profile.id,
            })

            // 2. Enviar al SRI
            const resultado = await ncService.procesarNC(nc.id)

            // 3. Si autorizada y es devolución → actualizar inventario
            if (resultado.authorized && motivoSri === '01') {
                for (const det of detallesNC) {
                    if (det.producto_id) {
                        try {
                            await kardexService.registrarMovimiento({
                                empresa_id:           empresa.id,
                                producto_id:          det.producto_id,
                                tipo_movimiento:      'ENTRADA',
                                motivo:               'DEVOLUCION_NC',
                                documento_referencia: nc.secuencial,
                                cantidad:             det.cantidad,
                                costo_unitario:       det.precio_unitario,
                            })
                        } catch (kErr) {
                            console.error('Kardex NC error:', kErr)
                        }
                    }
                }
            }

            setNcCreada({
                ...nc,
                estado_sri:          resultado.estado_sri as any,
                autorizacion_numero: resultado.autorizacion_numero || null,
                observaciones_sri:   resultado.message || null,
            })
            setStep(4)

        } catch (e: any) {
            setErrProceso(e.message || 'Error al procesar la nota de crédito')
        } finally {
            setProcesando(false)
        }
    }

    // ─── Aplicar NC a cartera ──────────────────────────────
    async function aplicarACartera() {
        if (!ncCreada || !empresa || !profile?.id || !facturaSeleccionada) return
        setAplicando(true)
        try {
            const monto = await ncService.aplicarNCaCartera(
                ncCreada.id,
                empresa.id,
                facturaSeleccionada.clientes.id,
                facturaSeleccionada.id,
                profile.id
            )
            setAplicacionMsg(`NC aplicada correctamente a cartera. Monto abonado: ${formatCurrency(monto)}`)
        } catch (e: any) {
            setAplicacionMsg(`Error al aplicar: ${e.message}`)
        } finally {
            setAplicando(false)
        }
    }

    // ─── Imprimir ticket 80mm ──────────────────────────────
    function imprimirTicket() {
        if (!ncCreada || !facturaSeleccionada) return
        const ncDetalles = calcularDetallesNC(items)
        const subSinIva  = r2(ncDetalles.reduce((s, d) => s + d.subtotal, 0))
        const ivaTotal   = r2(ncDetalles.reduce((s, d) => s + d.iva_valor, 0))
        const totalNc    = r2(subSinIva + ivaTotal)

        const lineas = ncDetalles.map(d =>
            `<div class="row"><span>${d.cantidad} ${d.nombre_producto.substring(0, 22)}</span><span>${formatCurrency(d.total_linea)}</span></div>`
        ).join('')

        const w = window.open('', '_blank', 'width=320,height=700')!
        w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>NC ${ncCreada.secuencial}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{width:72mm;padding:3mm;font-family:monospace;font-size:10px;}
h1{text-align:center;font-size:12px;margin-bottom:2px;}
h2{text-align:center;font-size:11px;border:1px solid #000;padding:2px;margin-bottom:4px;}
.row{display:flex;justify-content:space-between;margin:1px 0;}
.row span:first-child{flex:1;margin-right:4px;}
.row span:last-child{white-space:nowrap;}
.hr{border-top:1px dashed #000;margin:4px 0;}
.center{text-align:center;}
.bold{font-weight:bold;}
</style></head><body>
<h1>${(empresa?.nombre || 'EMPRESA').toUpperCase()}</h1>
<div class="center" style="font-size:9px">RUC: ${(empresa as any)?.ruc || ''}</div>
<div class="hr"></div>
<h2>NOTA DE CRÉDITO</h2>
<div class="row bold"><span>NC:</span><span>${ncCreada.secuencial}</span></div>
<div class="row"><span>Factura:</span><span>${facturaSeleccionada.secuencial}</span></div>
<div class="row"><span>Cliente:</span><span>${facturaSeleccionada.clientes.nombre.substring(0, 20)}</span></div>
<div class="row"><span>Motivo:</span><span>${(MOTIVOS_SRI.find(m => m.value === motivoSri)?.label || '').substring(0, 20)}</span></div>
<div class="hr"></div>
${lineas}
<div class="hr"></div>
<div class="row"><span>Subtotal s/IVA:</span><span>${formatCurrency(subSinIva)}</span></div>
<div class="row"><span>IVA:</span><span>${formatCurrency(ivaTotal)}</span></div>
<div class="hr"></div>
<div class="row bold" style="font-size:12px"><span>TOTAL NC:</span><span>${formatCurrency(totalNc)}</span></div>
<div class="hr"></div>
<div class="center" style="font-size:8px;word-break:break-all">${ncCreada.autorizacion_numero || ncCreada.estado_sri}</div>
<div class="center" style="margin-top:3px">${format(new Date(), 'dd/MM/yyyy HH:mm')}</div>
</body></html>`)
        w.document.close()
        w.focus()
        setTimeout(() => { w.print(); w.close() }, 300)
    }

    // ─── Totales de la NC ──────────────────────────────────
    const detallesNC = calcularDetallesNC(items)
    const totalSinIva = r2(detallesNC.reduce((s, d) => s + d.subtotal, 0))
    const totalIva    = r2(detallesNC.reduce((s, d) => s + d.iva_valor, 0))
    const totalNC     = r2(totalSinIva + totalIva)

    // ── RENDER ─────────────────────────────────────────────
    return (
        <div className="max-w-4xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <button onClick={() => navigate('/notas-credito')} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400">
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <div>
                    <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                        <FileMinus className="w-5 h-5 text-orange-500" />
                        Nueva Nota de Crédito
                    </h1>
                    <p className="text-xs text-slate-500">Pasos: Seleccionar factura → Motivo e ítems → Confirmar</p>
                </div>
            </div>

            {/* Indicador de pasos */}
            <div className="flex items-center gap-2">
                {[1, 2, 3].map(s => (
                    <div key={s} className="flex items-center gap-2">
                        <div className={cn(
                            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-black',
                            step >= s ? 'bg-primary-600 text-white' : 'bg-slate-200 text-slate-400'
                        )}>{s}</div>
                        <span className={cn('text-xs font-medium hidden sm:block', step >= s ? 'text-primary-700' : 'text-slate-400')}>
                            {s === 1 ? 'Factura origen' : s === 2 ? 'Motivo e ítems' : 'Confirmar'}
                        </span>
                        {s < 3 && <ChevronRight className="w-4 h-4 text-slate-300" />}
                    </div>
                ))}
            </div>

            {/* ── STEP 1: Buscar factura ── */}
            {step === 1 && (
                <div className="card p-6 space-y-4">
                    <h2 className="font-bold text-slate-900">Seleccionar Factura de Origen</h2>
                    <p className="text-sm text-slate-500">Busca por secuencial o nombre del cliente. Solo facturas AUTORIZADAS.</p>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Ej: 001-005-000000123 o nombre del cliente..."
                            className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500"
                            value={searchText}
                            onChange={e => setSearchText(e.target.value)}
                            autoFocus
                        />
                        {buscando && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />}
                    </div>

                    {errValidacion && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-red-700 text-sm">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            {errValidacion}
                        </div>
                    )}

                    {resultados.length > 0 && (
                        <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
                            {resultados.map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => seleccionarFactura(f)}
                                    className="w-full text-left px-4 py-3 hover:bg-primary-50 transition-colors flex items-center justify-between gap-4"
                                >
                                    <div>
                                        <p className="font-mono text-sm font-bold text-slate-900">{f.secuencial}</p>
                                        <p className="text-xs text-slate-500">{f.clientes?.nombre} — {format(new Date(f.created_at), 'dd/MM/yyyy')}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="font-bold text-slate-900">{formatCurrency(f.total)}</p>
                                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">{f.estado_sri}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {facturaSeleccionada === null && searchText.length > 2 && !buscando && resultados.length === 0 && (
                        <p className="text-sm text-slate-400 text-center py-4">Sin resultados para "{searchText}"</p>
                    )}
                </div>
            )}

            {/* ── STEP 2: Motivo e ítems ── */}
            {step === 2 && facturaSeleccionada && (
                <div className="space-y-4">
                    {/* Resumen factura origen */}
                    <div className="card p-4 bg-slate-50 border border-slate-200 flex items-center justify-between">
                        <div>
                            <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">Factura Origen</p>
                            <p className="font-mono font-bold text-slate-900">{facturaSeleccionada.secuencial}</p>
                            <p className="text-sm text-slate-600">{facturaSeleccionada.clientes.nombre} — {facturaSeleccionada.clientes.identificacion}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs text-slate-500">Total factura</p>
                            <p className="text-xl font-black text-slate-900">{formatCurrency(facturaSeleccionada.total)}</p>
                        </div>
                        <button onClick={() => { setStep(1); setFacturaSeleccionada(null) }} className="p-2 hover:bg-slate-200 rounded-full ml-2">
                            <X className="w-4 h-4 text-slate-400" />
                        </button>
                    </div>

                    <div className="card p-6 space-y-5">
                        {/* Motivo SRI */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                                    Motivo SRI *
                                </label>
                                <select
                                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white"
                                    value={motivoSri}
                                    onChange={e => setMotivoSri(e.target.value as any)}
                                >
                                    {MOTIVOS_SRI.map(m => (
                                        <option key={m.value} value={m.value}>{m.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                                    Descripción del motivo *
                                </label>
                                <input
                                    type="text"
                                    placeholder="Describe el motivo en detalle..."
                                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none text-sm"
                                    value={motivoDesc}
                                    onChange={e => setMotivoDesc(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Ítems */}
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                                Selecciona ítems a devolver / ajustar
                            </p>
                            <div className="border border-slate-200 rounded-lg overflow-hidden">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                                            <th className="px-4 py-3 w-8"></th>
                                            <th className="px-4 py-3">Producto</th>
                                            <th className="px-4 py-3 text-right">Cant. Facturada</th>
                                            <th className="px-4 py-3 text-right">P.Unit S/IVA</th>
                                            <th className="px-4 py-3 text-right w-36">Cant. NC</th>
                                            <th className="px-4 py-3 text-right">Subtotal NC</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                        {items.map((item, idx) => {
                                            const cantNC      = item.cantidadNC
                                            const agotado     = item.maxDisponible <= 0
                                            const sub         = r2(item.detalle.precio_unitario * cantNC * (1 - (item.detalle.descuento || 0) / 100))
                                            const iva         = r2(sub * (item.detalle.iva_porcentaje || 0) / 100)
                                            const esParcial   = item.incluir && cantNC > 0 && cantNC < item.maxDisponible
                                            const yaDevuelta  = r2(Number(item.detalle.cantidad) - item.maxDisponible)
                                            return (
                                                <tr key={item.detalle.id} className={cn(
                                                    agotado ? 'opacity-40 bg-slate-50' : item.incluir ? 'bg-primary-50/40' : ''
                                                )}>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={item.incluir}
                                                            disabled={agotado}
                                                            onChange={e => {
                                                                const next = [...items]
                                                                next[idx] = { ...item, incluir: e.target.checked, cantidadNC: e.target.checked ? item.maxDisponible : 0 }
                                                                setItems(next)
                                                            }}
                                                            className="w-4 h-4 accent-primary-600"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 text-sm font-medium text-slate-900">
                                                        {item.detalle.nombre_producto}
                                                        {item.detalle.iva_porcentaje > 0 &&
                                                            <span className="ml-1.5 text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">IVA {item.detalle.iva_porcentaje}%</span>}
                                                        {agotado && <span className="ml-1.5 text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded">ya devuelto</span>}
                                                        {!agotado && yaDevuelta > 0 && <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded">dev. parcial: {yaDevuelta}</span>}
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-right text-slate-600">
                                                        {item.detalle.cantidad}
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-right text-slate-600 font-mono">
                                                        {formatCurrency(item.detalle.precio_unitario)}
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        {agotado ? (
                                                            <span className="text-xs text-slate-400">—</span>
                                                        ) : (
                                                            <div className="flex flex-col items-end gap-0.5">
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    max={item.maxDisponible}
                                                                    step={0.01}
                                                                    disabled={!item.incluir}
                                                                    value={item.cantidadNC === 0 && !item.incluir ? '' : item.cantidadNC}
                                                                    onChange={e => {
                                                                        const raw = Number(e.target.value)
                                                                        const v = Math.min(Math.max(0, raw), item.maxDisponible)
                                                                        const next = [...items]
                                                                        next[idx] = { ...item, cantidadNC: v }
                                                                        setItems(next)
                                                                    }}
                                                                    className={cn(
                                                                        'w-24 px-2 py-1 text-right border rounded focus:ring-2 focus:ring-primary-500 outline-none text-sm font-mono',
                                                                        item.incluir ? 'border-primary-300 bg-white' : 'border-slate-200 opacity-40',
                                                                        esParcial ? 'border-amber-400 bg-amber-50' : ''
                                                                    )}
                                                                />
                                                                <span className="text-[10px] text-slate-400">máx: {item.maxDisponible}</span>
                                                                {esParcial && <span className="text-[10px] text-amber-600 font-semibold">parcial</span>}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-sm font-bold text-slate-900">
                                                        {item.incluir && cantNC > 0 ? formatCurrency(r2(sub + iva)) : '—'}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Totales NC */}
                        {detallesNC.length > 0 && (
                            <div className="flex justify-end">
                                <div className="w-64 space-y-1 text-sm">
                                    <div className="flex justify-between text-slate-600">
                                        <span>Subtotal sin IVA:</span>
                                        <span className="font-mono">{formatCurrency(totalSinIva)}</span>
                                    </div>
                                    <div className="flex justify-between text-slate-600">
                                        <span>IVA:</span>
                                        <span className="font-mono">{formatCurrency(totalIva)}</span>
                                    </div>
                                    <div className="flex justify-between font-black text-slate-900 text-base border-t pt-1 mt-1">
                                        <span>TOTAL NC:</span>
                                        <span className="font-mono">{formatCurrency(totalNC)}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {errStep2 && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-red-700 text-sm">
                                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                {errStep2}
                            </div>
                        )}

                        <div className="flex justify-between pt-2">
                            <button onClick={() => setStep(1)} className="btn border border-slate-200 text-slate-600 gap-2 hover:bg-slate-50">
                                <ChevronLeft className="w-4 h-4" /> Anterior
                            </button>
                            <button
                                onClick={() => { if (validarStep2()) setStep(3) }}
                                className="btn bg-primary-600 text-white gap-2 hover:bg-primary-700 active:scale-95"
                            >
                                Revisar y Confirmar <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── STEP 3: Confirmar ── */}
            {step === 3 && facturaSeleccionada && (
                <div className="card p-6 space-y-6">
                    <h2 className="font-bold text-slate-900 text-lg">Confirmar Nota de Crédito</h2>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="p-4 bg-slate-50 rounded-xl space-y-1">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Factura Origen</p>
                            <p className="font-mono font-bold">{facturaSeleccionada.secuencial}</p>
                            <p className="text-slate-600">{facturaSeleccionada.clientes.nombre}</p>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-xl space-y-1">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Motivo</p>
                            <p className="font-bold">{MOTIVOS_SRI.find(m => m.value === motivoSri)?.label}</p>
                            <p className="text-slate-600">{motivoDesc}</p>
                        </div>
                    </div>

                    {/* Detalles NC */}
                    <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
                        <thead>
                            <tr className="bg-slate-50 text-slate-500 text-xs uppercase font-bold">
                                <th className="px-4 py-2 text-left">Producto</th>
                                <th className="px-4 py-2 text-right">Cant.</th>
                                <th className="px-4 py-2 text-right">P.Unit</th>
                                <th className="px-4 py-2 text-right">Subtotal</th>
                                <th className="px-4 py-2 text-right">IVA</th>
                                <th className="px-4 py-2 text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {detallesNC.map((d, i) => (
                                <tr key={i}>
                                    <td className="px-4 py-2 font-medium">{d.nombre_producto}</td>
                                    <td className="px-4 py-2 text-right">{d.cantidad}</td>
                                    <td className="px-4 py-2 text-right font-mono">{formatCurrency(d.precio_unitario)}</td>
                                    <td className="px-4 py-2 text-right font-mono">{formatCurrency(d.subtotal)}</td>
                                    <td className="px-4 py-2 text-right font-mono">{formatCurrency(d.iva_valor)}</td>
                                    <td className="px-4 py-2 text-right font-mono font-bold">{formatCurrency(d.total_linea)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr className="bg-primary-50 font-black">
                                <td colSpan={5} className="px-4 py-2 text-right text-slate-700">TOTAL NOTA DE CRÉDITO:</td>
                                <td className="px-4 py-2 text-right text-primary-700 font-mono text-base">{formatCurrency(totalNC)}</td>
                            </tr>
                        </tfoot>
                    </table>

                    {errProceso && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-red-700 text-sm">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            {errProceso}
                        </div>
                    )}

                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>Al confirmar se enviará la NC al SRI para su autorización. Esta acción no se puede deshacer.</span>
                    </div>

                    <div className="flex justify-between">
                        <button
                            onClick={() => setStep(2)}
                            disabled={procesando}
                            className="btn border border-slate-200 text-slate-600 gap-2 hover:bg-slate-50 disabled:opacity-40"
                        >
                            <ChevronLeft className="w-4 h-4" /> Anterior
                        </button>
                        <button
                            onClick={confirmarNC}
                            disabled={procesando}
                            className="btn bg-primary-600 text-white gap-2 hover:bg-primary-700 active:scale-95 disabled:opacity-50 min-w-40 justify-center"
                        >
                            {procesando
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Procesando SRI...</>
                                : <><CheckCircle2 className="w-4 h-4" /> Emitir Nota de Crédito</>
                            }
                        </button>
                    </div>
                </div>
            )}

            {/* ── STEP 4: Resultado ── */}
            {step === 4 && ncCreada && (
                <div className="card p-8 space-y-6">
                    {/* Estado */}
                    <div className="text-center">
                        {ncCreada.estado_sri === 'AUTORIZADO' ? (
                            <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
                        ) : (
                            <AlertCircle className="w-16 h-16 text-orange-500 mx-auto" />
                        )}
                        <h2 className="text-2xl font-black text-slate-900 mt-3">
                            {ncCreada.estado_sri === 'AUTORIZADO' ? '¡Nota de Crédito Autorizada!' : `NC en estado: ${ncCreada.estado_sri}`}
                        </h2>
                        <p className="font-mono text-slate-500 mt-1">{ncCreada.secuencial}</p>
                        {ncCreada.autorizacion_numero && (
                            <p className="text-xs text-slate-400 font-mono mt-2 break-all">Autorización: {ncCreada.autorizacion_numero}</p>
                        )}
                        <p className="text-2xl font-black text-primary-700 mt-3">{formatCurrency(ncCreada.total)}</p>
                    </div>

                    {/* Mensaje SRI — siempre visible si no es AUTORIZADO */}
                    {ncCreada.estado_sri !== 'AUTORIZADO' && (
                        <div className="p-4 bg-red-50 border border-red-300 rounded-xl space-y-2">
                            <p className="font-bold text-red-800 flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                Respuesta del SRI — revisar y corregir:
                            </p>
                            <p className="font-mono text-xs text-red-700 break-all bg-red-100 rounded p-2">
                                {ncCreada.observaciones_sri || 'Sin detalle disponible. Revisa los logs de Supabase Functions.'}
                            </p>
                        </div>
                    )}

                    {/* Aplicar a cartera */}
                    {ncCreada.estado_sri === 'AUTORIZADO' && !aplicacionMsg && (
                        <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800 space-y-3">
                            <p className="font-bold">¿Deseas aplicar esta NC a la cartera del cliente?</p>
                            <p>Se abonará {formatCurrency(ncCreada.saldo_nc)} a las facturas pendientes del cliente (FIFO).</p>
                            <button
                                onClick={aplicarACartera}
                                disabled={aplicando}
                                className="btn bg-blue-600 text-white gap-2 hover:bg-blue-700 disabled:opacity-50 mx-auto"
                            >
                                {aplicando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                {aplicando ? 'Aplicando...' : 'Aplicar a Cartera CxC'}
                            </button>
                        </div>
                    )}

                    {aplicacionMsg && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 text-sm">
                            {aplicacionMsg}
                        </div>
                    )}

                    {/* Botones de acción */}
                    <div className="flex gap-3 justify-center flex-wrap pt-2">
                        <button
                            onClick={imprimirTicket}
                            className="btn border border-slate-200 text-slate-600 gap-2 hover:bg-slate-50"
                            title="Comprobante provisional para el cliente"
                        >
                            <Printer className="w-4 h-4" />
                            Ticket 80mm
                        </button>
                        <button
                            onClick={() => window.open(`/notas-credito/${ncCreada.id}/ride`, '_blank')}
                            className="btn border border-orange-300 text-orange-700 gap-2 hover:bg-orange-50"
                            title="Representación impresa oficial (RIDE) formato A4"
                        >
                            <FileText className="w-4 h-4" />
                            RIDE A4
                        </button>
                        <button
                            onClick={() => ncService.descargarXmlNC(ncCreada.id, ncCreada.secuencial)}
                            disabled={!ncCreada.xml_firmado}
                            className="btn border border-slate-200 text-slate-600 gap-2 hover:bg-slate-50 disabled:opacity-40"
                            title={ncCreada.xml_firmado ? 'Descargar XML firmado' : 'XML no disponible aún'}
                        >
                            Descargar XML
                        </button>
                        <button
                            onClick={() => navigate('/notas-credito')}
                            className="btn bg-primary-600 text-white gap-2 hover:bg-primary-700"
                        >
                            Ver todas las NC
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
