import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { proveedorService } from '../../services/vendorService'
import { ncProveedorService } from '../../services/ncProveedorService'
import { ndProveedorService, type NDProveedor } from '../../services/ndProveedorService'
import type { Proveedor } from '../../types/vendors'
import { HelpButton } from '../../components/help/HelpButton'
import { ScanFacturaButton, type FacturaEscaneada } from '../../components/ScanFacturaButton'
import { useIaFeatureEnabled } from '../../hooks/useIaFeatureEnabled'
import { formatCurrency, cn } from '../../lib/utils'
import { format } from 'date-fns'
import {
    ChevronLeft, FilePlus2, Search, X, Loader2, CheckCircle2, AlertCircle, History,
} from 'lucide-react'

const inp = 'w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:ring-2 focus:ring-primary-500 outline-none text-sm bg-white'
const HOY = new Date().toISOString().split('T')[0]

export function NdProveedoresPage() {
    const { empresa, profile } = useAuth()
    const navigate = useNavigate()
    const { enabled: ocrIaHabilitado } = useIaFeatureEnabled('compras')

    const [tab, setTab] = useState<'nueva' | 'historial'>('nueva')

    // ── Form ──────────────────────────────────────────────
    const [proveedores, setProveedores] = useState<Proveedor[]>([])
    const [proveedorId, setProveedorId] = useState('')
    const [numeroNd, setNumeroNd] = useState('')
    const [fechaEmision, setFechaEmision] = useState(HOY)
    const [numeroAutorizacion, setNumeroAutorizacion] = useState('')
    const [baseImponible, setBaseImponible] = useState(0)
    const [iva, setIva] = useState(0)
    const [concepto, setConcepto] = useState('')

    // Factura relacionada (opcional)
    const [searchFactura, setSearchFactura] = useState('')
    const [resultadosFactura, setResultadosFactura] = useState<any[]>([])
    const [buscandoFactura, setBuscandoFactura] = useState(false)
    const [compraSeleccionada, setCompraSeleccionada] = useState<any>(null)

    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState('')
    const [ok, setOk] = useState<NDProveedor | null>(null)

    // ── Historial ─────────────────────────────────────────
    const [historial, setHistorial] = useState<NDProveedor[]>([])
    const [cargandoHistorial, setCargandoHistorial] = useState(false)

    const total = Math.round((baseImponible + iva) * 100) / 100

    useEffect(() => {
        if (!empresa?.id) return
        proveedorService.listar(empresa.id).then(p => setProveedores(p.filter(x => x.estado === 'ACTIVO'))).catch(() => {})
    }, [empresa?.id])

    useEffect(() => {
        if (tab === 'historial' && empresa?.id) cargarHistorial()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, empresa?.id])

    async function cargarHistorial() {
        setCargandoHistorial(true)
        try { setHistorial(await ndProveedorService.listar(empresa!.id)) }
        catch (e: any) { console.error('Error cargando N/D:', e) }
        finally { setCargandoHistorial(false) }
    }

    // ── Buscar factura relacionada (por número, del proveedor elegido) ──
    useEffect(() => {
        if (!searchFactura.trim() || !empresa?.id) { setResultadosFactura([]); return }
        const t = setTimeout(async () => {
            setBuscandoFactura(true)
            try {
                const r = await ncProveedorService.buscarComprasParaNc(empresa.id, searchFactura)
                setResultadosFactura(proveedorId ? r.filter((c: any) => c.proveedor_id === proveedorId) : r)
            } catch (e) { console.error('[ND buscar factura]', e); setResultadosFactura([]) }
            finally { setBuscandoFactura(false) }
        }, 350)
        return () => clearTimeout(t)
    }, [searchFactura, proveedorId, empresa?.id])

    function seleccionarFactura(c: any) {
        setCompraSeleccionada(c)
        if (c.proveedor_id) setProveedorId(c.proveedor_id)
        setSearchFactura('')
        setResultadosFactura([])
    }

    // ── Escanear N/D física ───────────────────────────────
    function handleScanAplicar(data: FacturaEscaneada) {
        if (data.estab && data.pto_emi && data.secuencial) {
            setNumeroNd(`${data.estab}-${data.pto_emi}-${data.secuencial}`)
        }
        if (data.fecha_emision) setFechaEmision(data.fecha_emision)
        if (data.clave_acceso) setNumeroAutorizacion(data.clave_acceso)
        setBaseImponible(data.base_iva ?? data.base_cero ?? 0)
        setIva(data.iva ?? 0)
        if (data.ruc_proveedor) {
            const prov = proveedores.find(p => p.ruc === data.ruc_proveedor)
            if (prov) setProveedorId(prov.id)
        }
    }

    function limpiarForm() {
        setProveedorId(''); setNumeroNd(''); setFechaEmision(HOY); setNumeroAutorizacion('')
        setBaseImponible(0); setIva(0); setConcepto('')
        setCompraSeleccionada(null); setSearchFactura(''); setResultadosFactura([])
        setOk(null); setError('')
    }

    async function guardar() {
        setError('')
        if (!proveedorId) { setError('Selecciona el proveedor.'); return }
        if (!numeroNd.trim()) { setError('Ingresa el número de la N/D.'); return }
        if (!fechaEmision) { setError('Ingresa la fecha de emisión.'); return }
        if (total <= 0) { setError('El total de la N/D debe ser mayor a 0.'); return }
        if (!profile?.id || !empresa?.id) return

        setGuardando(true)
        try {
            const nd = await ndProveedorService.crear({
                empresaId: empresa.id,
                proveedorId,
                compraId: compraSeleccionada?.id ?? null,
                facturaReferencia: compraSeleccionada ? undefined : (searchFactura.trim() || undefined),
                numeroNd: numeroNd.trim(),
                fechaEmision,
                numeroAutorizacion: numeroAutorizacion || undefined,
                baseImponible,
                iva,
                total,
                concepto: concepto || undefined,
                usuarioId: profile.id,
            })
            setOk(nd)
        } catch (e: any) {
            setError(e.message || 'Error al registrar la N/D')
        } finally {
            setGuardando(false)
        }
    }

    const hoyDate = new Date()
    const esMesActual = (fecha: string) => {
        const f = new Date(fecha + 'T12:00:00')
        return f.getFullYear() === hoyDate.getFullYear() && f.getMonth() === hoyDate.getMonth()
    }
    const historialMesActual = historial.filter(n => esMesActual(n.fecha_emision))
    const historialAnterior  = historial.filter(n => !esMesActual(n.fecha_emision))

    function filaHistorial(n: NDProveedor) {
        return (
            <tr key={n.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">{format(new Date(n.fecha_emision + 'T12:00:00'), 'dd/MM/yyyy')}</td>
                <td className="px-4 py-2.5 text-sm text-slate-800">{n.proveedores?.nombre_empresa ?? '—'}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{n.numero_nd}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{n.ingresos_stock?.numero_factura ?? '—'}</td>
                <td className="px-4 py-2.5 text-sm font-bold text-slate-900 text-right">{formatCurrency(n.total)}</td>
                <td className="px-4 py-2.5 text-center">
                    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-bold', n.estado === 'ANULADA' ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700')}>
                        {n.estado}
                    </span>
                </td>
            </tr>
        )
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate('/compras')} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400">
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                            <FilePlus2 className="w-5 h-5 text-amber-500" />
                            Notas de Débito de Proveedor
                        </h1>
                        <p className="text-xs text-slate-500">Aumentan la deuda con el proveedor sobre una factura ya registrada</p>
                    </div>
                </div>
                <HelpButton pageKey="nd-proveedores" />
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
                <button onClick={() => setTab('nueva')}
                    className={cn('flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all',
                        tab === 'nueva' ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                    <FilePlus2 className="w-4 h-4" /> Nueva N/D
                </button>
                <button onClick={() => setTab('historial')}
                    className={cn('flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all',
                        tab === 'historial' ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-500 hover:text-slate-700')}>
                    <History className="w-4 h-4" /> Historial
                </button>
            </div>

            {tab === 'nueva' ? (
                ok ? (
                    <div className="card p-8 space-y-4 text-center">
                        <CheckCircle2 className="w-14 h-14 text-emerald-500 mx-auto" />
                        <h2 className="text-xl font-black text-slate-900">N/D registrada</h2>
                        <p className="text-2xl font-black text-primary-700">{formatCurrency(ok.total)}</p>
                        <p className="text-sm text-slate-500">La deuda con el proveedor ya quedó incrementada.</p>
                        <div className="flex gap-3 justify-center pt-2">
                            <button onClick={limpiarForm} className="btn bg-primary-600 text-white hover:bg-primary-700">
                                Registrar otra N/D
                            </button>
                            <button onClick={() => { setTab('historial'); limpiarForm() }} className="btn border border-slate-200 text-slate-600 hover:bg-slate-50">
                                Ver historial
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="card p-6 space-y-5">
                        {ocrIaHabilitado && (
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Datos de la N/D</p>
                                <ScanFacturaButton onAplicar={handleScanAplicar} empresaId={empresa!.id} />
                            </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Proveedor *</label>
                                <select className={inp} value={proveedorId} onChange={e => setProveedorId(e.target.value)}>
                                    <option value="">Seleccionar...</option>
                                    {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre_empresa} — {p.ruc}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">N° de N/D del proveedor *</label>
                                <input className={inp} value={numeroNd} onChange={e => setNumeroNd(e.target.value)} placeholder="001-001-000000001" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Fecha de emisión *</label>
                                <input type="date" className={inp} value={fechaEmision} onChange={e => setFechaEmision(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Autorización SRI (opcional)</label>
                                <input className={cn(inp, 'font-mono text-xs')} maxLength={49} value={numeroAutorizacion} onChange={e => setNumeroAutorizacion(e.target.value)} />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                                Factura del proveedor a la que aplica
                            </label>
                            {compraSeleccionada ? (
                                <div className="flex items-center justify-between p-3 bg-primary-50 border border-primary-200 rounded-lg">
                                    <div>
                                        <p className="font-mono text-sm font-bold text-slate-900">{compraSeleccionada.numero_factura}</p>
                                        <p className="text-xs text-slate-500">
                                            {compraSeleccionada.proveedor?.nombre_empresa} — Saldo CxP: {formatCurrency(compraSeleccionada.cxp?.[0]?.saldo_pendiente ?? 0)}
                                        </p>
                                    </div>
                                    <button onClick={() => setCompraSeleccionada(null)} className="p-1.5 hover:bg-primary-100 rounded-full">
                                        <X className="w-4 h-4 text-slate-500" />
                                    </button>
                                </div>
                            ) : (
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <input className={cn(inp, 'pl-10')} value={searchFactura} onChange={e => setSearchFactura(e.target.value)}
                                        placeholder="N° de factura del proveedor..." />
                                    {buscandoFactura && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />}
                                    {resultadosFactura.length > 0 && (
                                        <div className="absolute z-10 w-full mt-1 border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100 bg-white shadow-lg max-h-56 overflow-y-auto">
                                            {resultadosFactura.map((c: any) => (
                                                <button key={c.id} onClick={() => seleccionarFactura(c)}
                                                    className="w-full text-left px-4 py-2.5 hover:bg-primary-50 flex items-center justify-between gap-3">
                                                    <div>
                                                        <p className="font-mono text-sm font-bold text-slate-900">{c.numero_factura}</p>
                                                        <p className="text-xs text-slate-500">{c.proveedor?.nombre_empresa}</p>
                                                    </div>
                                                    <span className="text-xs text-slate-400">Saldo: {formatCurrency(c.cxp?.[0]?.saldo_pendiente ?? 0)}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                            <p className="text-[11px] text-slate-400 mt-1">
                                Si la factura ya está en el sistema, aparece en la lista al escribir su número — selecciónala para vincularla directo. Si no aparece (factura no digitada aún), la N/D igual se registra como deuda nueva usando lo que escribas aquí como referencia.
                            </p>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Base imponible</label>
                                <input type="number" step={0.01} min={0} className={cn(inp, 'text-right font-mono')}
                                    value={baseImponible || ''} onChange={e => setBaseImponible(Number(e.target.value) || 0)} />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">IVA</label>
                                <input type="number" step={0.01} min={0} className={cn(inp, 'text-right font-mono')}
                                    value={iva || ''} onChange={e => setIva(Number(e.target.value) || 0)} />
                            </div>
                            <div>
                                <label className="block text-xs text-slate-500 mb-1">Total</label>
                                <div className="px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50 text-right font-mono font-bold text-slate-800">
                                    {formatCurrency(total)}
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Concepto / descripción</label>
                            <input className={inp} value={concepto} onChange={e => setConcepto(e.target.value)} placeholder='Ej: "Ajuste de flete no facturado"' />
                        </div>

                        {error && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-red-700 text-sm">
                                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}
                            </div>
                        )}

                        <div className="flex justify-end pt-2">
                            <button onClick={guardar} disabled={guardando}
                                className="btn bg-primary-600 text-white gap-2 hover:bg-primary-700 active:scale-95 disabled:opacity-50 min-w-44 justify-center">
                                {guardando ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</> : <><FilePlus2 className="w-4 h-4" /> Registrar N/D</>}
                            </button>
                        </div>
                    </div>
                )
            ) : (
                <div className="card overflow-hidden">
                    {cargandoHistorial ? (
                        <div className="py-16 text-center text-slate-400">
                            <Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando historial...
                        </div>
                    ) : historial.length === 0 ? (
                        <div className="py-16 text-center text-slate-400">
                            <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
                            <p className="font-medium">Sin notas de débito registradas</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider font-bold">
                                        <th className="px-4 py-3">Fecha</th>
                                        <th className="px-4 py-3">Proveedor</th>
                                        <th className="px-4 py-3">N/D</th>
                                        <th className="px-4 py-3">Factura relacionada</th>
                                        <th className="px-4 py-3 text-right">Total</th>
                                        <th className="px-4 py-3 text-center">Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 bg-white">
                                    {historialMesActual.length > 0 && (
                                        <>
                                            <tr><td colSpan={6} className="px-4 py-1.5 bg-primary-50 text-[10px] font-black text-primary-700 uppercase tracking-widest">Este mes</td></tr>
                                            {historialMesActual.map(filaHistorial)}
                                        </>
                                    )}
                                    {historialAnterior.length > 0 && (
                                        <>
                                            <tr><td colSpan={6} className="px-4 py-1.5 bg-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-widest">Meses anteriores</td></tr>
                                            {historialAnterior.map(filaHistorial)}
                                        </>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
