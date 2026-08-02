import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { compraService, cxpService } from '../../services/vendorService'
import type { Compra, CompraConDetalle } from '../../types/vendors'
import {
    Trash2, AlertTriangle, Search, Loader2, Package, Wrench,
    Calendar, AlertCircle, ShieldAlert, CheckCircle, ArrowLeft, Ban,
} from 'lucide-react'
function fmt(n: number) { return `$${(n ?? 0).toFixed(2)}` }
function fmtFecha(s: string) {
    return new Date(s + 'T12:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function EliminarCompraPage() {
    const { empresa } = useAuth()

    // Búsqueda
    const [busqueda, setBusqueda]   = useState('')
    const [compras, setCompras]     = useState<Compra[]>([])
    const [loadingList, setLoadingList] = useState(false)
    const [errorList, setErrorList] = useState('')

    // Compra seleccionada
    const [detalle, setDetalle]         = useState<CompraConDetalle | null>(null)
    const [loadingDetalle, setLoadingDetalle] = useState(false)
    const [tienePagos, setTienePagos]   = useState(false)
    const [tieneNC, setTieneNC]         = useState(false)
    const [checandoBloqueos, setCheckandoBloqueos] = useState(false)

    // Confirmación
    const [motivo, setMotivo]       = useState('')
    const [confirmText, setConfirmText] = useState('')
    const [eliminando, setEliminando] = useState(false)
    const [resultado, setResultado] = useState<'ok' | string | null>(null)

    useEffect(() => {
        if (!empresa?.id) return
        buscar()
    }, [empresa?.id])

    async function buscar() {
        if (!empresa?.id) return
        setLoadingList(true); setErrorList('')
        try {
            const data = await compraService.listar(empresa.id, {})
            const q = busqueda.trim().toLowerCase()
            setCompras(q
                ? data.filter(c =>
                    c.numero_factura?.toLowerCase().includes(q) ||
                    (c.proveedor as any)?.nombre_empresa?.toLowerCase().includes(q) ||
                    c.id.toLowerCase().includes(q))
                : data)
        } catch (e: any) {
            setErrorList(e.message)
        } finally {
            setLoadingList(false)
        }
    }

    async function seleccionar(c: Compra) {
        setResultado(null); setMotivo(''); setConfirmText('')
        setLoadingDetalle(true); setDetalle(null)
        setTienePagos(false); setTieneNC(false)
        try {
            const d = await compraService.obtenerConDetalle(c.id)
            setDetalle(d)

            setCheckandoBloqueos(true)
            const checks: Promise<any>[] = []
            if (d.cxp) checks.push(cxpService.historialPagos(d.cxp.id).then(p => setTienePagos(p.length > 0)))
            checks.push(
                Promise.resolve(
                    supabase.from('notas_credito_proveedores')
                        .select('id', { count: 'exact', head: true })
                        .eq('compra_id', c.id)
                ).then(({ count }) => setTieneNC((count ?? 0) > 0))
            )
            await Promise.all(checks)
        } catch (e: any) {
            setErrorList(e.message)
        } finally {
            setLoadingDetalle(false)
            setCheckandoBloqueos(false)
        }
    }

    function volver() {
        setDetalle(null); setResultado(null); setMotivo(''); setConfirmText('')
    }

    const bloqueado = tienePagos || tieneNC
    const confirmacionEsperada = detalle ? `ELIMINAR ${detalle.numero_factura ?? detalle.id.slice(0, 8)}` : ''
    const puedeConfirmar = !bloqueado && motivo.trim().length > 0
        && confirmText.trim().toUpperCase() === confirmacionEsperada.toUpperCase()

    async function confirmarEliminacion() {
        if (!detalle || !puedeConfirmar) return
        setEliminando(true); setResultado(null)
        try {
            await compraService.eliminarPermanente(detalle, motivo.trim())
            setResultado('ok')
            setDetalle(null)
            buscar()
        } catch (e: any) {
            setResultado(e.message ?? String(e))
        } finally {
            setEliminando(false)
        }
    }

    return (
        <div className="max-w-3xl space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-red-100 flex items-center justify-center">
                    <ShieldAlert className="w-6 h-6 text-red-600" />
                </div>
                <div>
                    <h1 className="text-xl font-bold text-slate-900">Eliminar Compra</h1>
                    <p className="text-sm text-slate-500">Borrado permanente — reversa kardex, CxP, retenciones y contabilidad. Acción irreversible.</p>
                </div>
            </div>

            {resultado === 'ok' && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm">
                    <CheckCircle className="w-5 h-5 shrink-0" />
                    Compra eliminada correctamente. El kardex, la cuenta por pagar, las retenciones y el asiento contable (si existía) quedaron revertidos.
                </div>
            )}
            {resultado && resultado !== 'ok' && (
                <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <span>No se pudo eliminar: {resultado}</span>
                </div>
            )}

            {!detalle ? (
                <>
                    <div className="card p-4 space-y-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                className="input pl-9 w-full"
                                placeholder="Buscar por factura, proveedor o ID de compra..."
                                value={busqueda}
                                onChange={e => setBusqueda(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && buscar()}
                            />
                        </div>
                        <button onClick={buscar} className="btn btn-secondary text-sm">Buscar</button>
                    </div>

                    <div className="card overflow-hidden">
                        {errorList ? (
                            <div className="flex items-center justify-center py-12 gap-2 text-red-500 text-sm">
                                <AlertCircle className="w-5 h-5" /> {errorList}
                            </div>
                        ) : loadingList ? (
                            <div className="flex items-center justify-center py-12 gap-2 text-slate-400">
                                <Loader2 className="w-5 h-5 animate-spin" /> Cargando...
                            </div>
                        ) : compras.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                <Trash2 className="w-10 h-10 mb-2 text-slate-200" />
                                <p className="text-sm">No se encontraron compras</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
                                {compras.map(c => (
                                    <button
                                        key={c.id}
                                        onClick={() => seleccionar(c)}
                                        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            {c.tipo_compra === 'INVENTARIO'
                                                ? <Package className="w-4 h-4 text-blue-500 shrink-0" />
                                                : <Wrench className="w-4 h-4 text-purple-500 shrink-0" />}
                                            <div className="min-w-0">
                                                <p className="font-medium text-slate-800 truncate">
                                                    {(c.proveedor as any)?.nombre_empresa ?? '—'}
                                                    {c.numero_factura && <span className="font-mono text-xs text-slate-400 ml-2">{c.numero_factura}</span>}
                                                </p>
                                                <p className="text-xs text-slate-400 flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" /> {fmtFecha(c.fecha_emision ?? c.fecha_ingreso)}
                                                    {c.estado !== 'ACTIVO' && <span className="ml-2">· {c.estado}</span>}
                                                </p>
                                            </div>
                                        </div>
                                        <span className="font-mono font-semibold text-slate-700 shrink-0">{fmt(c.total)}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <div className="space-y-4">
                    <button onClick={volver} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
                        <ArrowLeft className="w-4 h-4" /> Volver a la búsqueda
                    </button>

                    {loadingDetalle ? (
                        <div className="flex items-center justify-center py-12 gap-2 text-slate-400">
                            <Loader2 className="w-5 h-5 animate-spin" /> Cargando compra...
                        </div>
                    ) : (
                        <>
                            {/* Resumen de la compra */}
                            <div className="card p-5 space-y-4">
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                                    <div>
                                        <p className="text-xs text-slate-400 uppercase font-semibold mb-0.5">Proveedor</p>
                                        <p className="font-semibold text-slate-800">{(detalle.proveedor as any)?.nombre_empresa ?? '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-400 uppercase font-semibold mb-0.5">Factura</p>
                                        <p className="font-mono text-slate-800">{detalle.numero_factura ?? detalle.id.slice(0, 8)}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-400 uppercase font-semibold mb-0.5">Total</p>
                                        <p className="font-mono font-bold text-primary-700">{fmt(detalle.total)}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div className="bg-slate-50 rounded-lg p-3">
                                        <p className="text-xs text-slate-400 mb-1">
                                            {detalle.tipo_compra === 'INVENTARIO' ? 'Ítems de inventario' : 'Ítems de servicio'}
                                        </p>
                                        <p className="font-semibold text-slate-700">
                                            {detalle.tipo_compra === 'INVENTARIO'
                                                ? (detalle.detalle_ingresos_stock?.length ?? 0)
                                                : (detalle.detalle_servicios?.length ?? 0)} línea(s)
                                        </p>
                                    </div>
                                    <div className="bg-slate-50 rounded-lg p-3">
                                        <p className="text-xs text-slate-400 mb-1">Retenciones</p>
                                        <p className="font-semibold text-slate-700">{detalle.retenciones?.length ?? 0} registrada(s)</p>
                                    </div>
                                </div>

                                {detalle.cxp && (
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
                                        <p className="text-xs font-bold text-amber-700 uppercase mb-2">Cuenta por Pagar</p>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div>
                                                <p className="text-xs text-amber-600">Monto original</p>
                                                <p className="font-mono font-semibold">{fmt(detalle.cxp.monto_original)}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-amber-600">Saldo pendiente</p>
                                                <p className="font-mono font-semibold">{fmt(detalle.cxp.saldo_pendiente)}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-amber-600">Estado</p>
                                                <p className="font-semibold">{detalle.cxp.estado}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {checandoBloqueos ? (
                                <div className="flex items-center gap-2 text-sm text-slate-400 px-1">
                                    <Loader2 className="w-4 h-4 animate-spin" /> Verificando pagos y notas de crédito asociadas...
                                </div>
                            ) : bloqueado ? (
                                <div className="bg-red-50 border-2 border-red-300 rounded-xl p-5">
                                    <div className="flex items-start gap-3">
                                        <Ban className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                                        <div className="space-y-1">
                                            <p className="font-bold text-red-800">No se puede eliminar esta compra</p>
                                            {tienePagos && (
                                                <p className="text-red-700 text-sm">
                                                    La cuenta por pagar ya tiene pagos aplicados. Primero reverse el/los pago(s) desde
                                                    <strong> Tesorería / Egresos</strong> y vuelva a intentarlo.
                                                </p>
                                            )}
                                            {tieneNC && (
                                                <p className="text-red-700 text-sm">
                                                    Existe una nota de crédito de proveedor asociada a esta compra. Debe anularla primero.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="bg-red-50 border-2 border-red-300 rounded-xl p-5">
                                        <div className="flex items-start gap-3">
                                            <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                                            <div>
                                                <p className="font-bold text-red-800 text-lg">⚠️ ACCIÓN IRREVERSIBLE</p>
                                                <p className="text-red-700 text-sm mt-1">
                                                    Se eliminará permanentemente la compra, su detalle, retenciones, la cuenta por pagar (si existe)
                                                    y el asiento contable (si existe). El kardex se recalculará para los productos afectados.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="card p-5 space-y-3">
                                        <div>
                                            <label className="label text-xs">Motivo de la eliminación (obligatorio)</label>
                                            <textarea
                                                className="input w-full text-sm"
                                                rows={2}
                                                value={motivo}
                                                onChange={e => setMotivo(e.target.value)}
                                                placeholder="Ej: compra de prueba de retenciones, error de digitación, etc."
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-slate-700 mb-2">
                                                Para confirmar, escribe exactamente:
                                                <span className="font-mono text-red-600 ml-2">{confirmacionEsperada}</span>
                                            </label>
                                            <input
                                                type="text"
                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-red-400 outline-none font-mono"
                                                placeholder={confirmacionEsperada}
                                                value={confirmText}
                                                onChange={e => setConfirmText(e.target.value)}
                                            />
                                        </div>
                                        <button
                                            onClick={confirmarEliminacion}
                                            disabled={!puedeConfirmar || eliminando}
                                            className="flex items-center gap-2 px-5 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 font-semibold"
                                        >
                                            {eliminando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                            {eliminando ? 'Eliminando...' : 'Eliminar compra permanentemente'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    )
}
