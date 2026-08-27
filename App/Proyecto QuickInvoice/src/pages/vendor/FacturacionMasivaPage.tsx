import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import {
    facturacionMasivaService,
    type FilaFacturacionMasiva, type ResumenLote,
} from '../../services/facturacionMasivaService'
import {
    FileStack, AlertTriangle, Loader2, CheckCircle, XCircle,
    ShieldAlert, Download, RefreshCw,
} from 'lucide-react'
import { cn } from '../../lib/utils'

function fmt(n: number) { return `$${(n ?? 0).toFixed(2)}` }
const HOY = new Date().toISOString().split('T')[0]

export function FacturacionMasivaPage() {
    const { empresa, profile, user } = useAuth()

    const [glosaGeneral, setGlosaGeneral]           = useState('')
    const [diasVencimiento, setDiasVencimiento]     = useState(2)
    const [fechaVencExplicita, setFechaVencExplicita] = useState('')
    const [tasaIvaGeneral, setTasaIvaGeneral]       = useState(15)
    const [fechaEmision, setFechaEmision]           = useState(HOY)

    const [filas, setFilas]         = useState<FilaFacturacionMasiva[]>([])
    const [loading, setLoading]     = useState(true)
    const [error, setError]         = useState('')

    const [validado, setValidado]       = useState(false)
    const [erroresValidacion, setErroresValidacion] = useState<{ clienteId: string; nombre: string; error: string }[]>([])

    const [paso, setPaso]           = useState<'config' | 'confirm' | 'progreso' | 'resumen'>('config')
    const [confirmText, setConfirmText] = useState('')
    const [progreso, setProgreso]   = useState({ actual: 0, total: 0, nombre: '' })
    const [resumen, setResumen]     = useState<ResumenLote | null>(null)
    const [errorProceso, setErrorProceso] = useState('')

    useEffect(() => { if (empresa?.id) cargar() }, [empresa?.id])

    // La tasa de IVA general de la cabecera se propaga a TODAS las filas —
    // igual que la fecha de vencimiento, que ya se recalcula sola en la
    // grilla. Si el usuario ya editó una fila a mano, un cambio posterior
    // en la cabecera la vuelve a igualar (mismo criterio que la fecha, que
    // tampoco "recuerda" ediciones puntuales).
    useEffect(() => {
        setFilas(prev => {
            if (!prev.length) return prev
            setValidado(false)
            return prev.map(f => ({ ...f, tasaIva: tasaIvaGeneral }))
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tasaIvaGeneral])

    async function cargar() {
        if (!empresa?.id) return
        setLoading(true); setError(''); setValidado(false); setPaso('config'); setResumen(null)
        try {
            const clientes = await facturacionMasivaService.listarClientesFacturables(empresa.id)
            setFilas(clientes.map(cliente => ({
                cliente,
                marcado: !cliente.bloqueo_credito,
                valor: Number(cliente.valor_facturar) || 0,
                tasaIva: cliente.tasa_iva ?? tasaIvaGeneral,
                glosa: glosaGeneral,
            })))
        } catch (e: any) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    function aplicarGlosaATodos() {
        setFilas(prev => prev.map(f => ({ ...f, glosa: glosaGeneral })))
    }

    // Cada fila arranca con la tasa guardada en el cliente (clientes.tasa_iva),
    // que pisa a la general aunque sea 0 — el efecto de arriba solo repropaga
    // la general cuando el SELECT realmente cambia de valor, así que si ya
    // estaba en 15% (el default) y los clientes tienen 0% guardado de antes,
    // no hay forma de forzarlo sin este botón explícito.
    function aplicarTasaIvaATodos() {
        setValidado(false)
        setFilas(prev => prev.map(f => ({ ...f, tasaIva: tasaIvaGeneral })))
    }

    function actualizarFila(clienteId: string, cambios: Partial<FilaFacturacionMasiva>) {
        setValidado(false)
        setFilas(prev => prev.map(f => f.cliente.id === clienteId ? { ...f, ...cambios } : f))
    }

    const seleccionadas = useMemo(() => filas.filter(f => f.marcado), [filas])
    const totalesPreview = useMemo(() => {
        let subtotal = 0, iva = 0
        for (const f of seleccionadas) {
            subtotal += f.valor
            iva += f.valor * (f.tasaIva / 100)
        }
        return { subtotal, iva, total: subtotal + iva }
    }, [seleccionadas])

    function validar() {
        const errores: { clienteId: string; nombre: string; error: string }[] = []
        for (const fila of seleccionadas) {
            const r = facturacionMasivaService.validarFila(fila)
            if (!r.ok) errores.push({ clienteId: fila.cliente.id, nombre: fila.cliente.nombre, error: r.error! })
        }
        setErroresValidacion(errores)
        setValidado(errores.length === 0)
    }

    const mesFacturado = fechaEmision.slice(0, 7) // YYYY-MM
    const confirmacionEsperada = `FACTURAR ${mesFacturado}`

    async function confirmarFacturacion() {
        if (!empresa?.id) return
        setPaso('progreso'); setErrorProceso('')
        setProgreso({ actual: 0, total: seleccionadas.length, nombre: '' })
        try {
            // Lo crítico es generar las facturas — una vez que esto termina,
            // el resumen SIEMPRE se muestra, pase lo que pase con el log.
            const res = await facturacionMasivaService.ejecutarLote(
                filas,
                {
                    empresaId: empresa.id,
                    diasVencimiento,
                    fechaVencimientoExplicita: fechaVencExplicita || null,
                    createdBy: profile?.id ?? user?.id ?? null,
                },
                (actual, total, nombre) => setProgreso({ actual, total, nombre }),
            )
            setResumen(res)
            setPaso('resumen')

            // El log de auditoría es best-effort: si falla (ej. falta correr
            // la migración), nunca debe ocultar el resumen que el usuario ya
            // ganó — solo se avisa aparte, sin bloquear nada.
            try {
                await facturacionMasivaService.guardarLog(
                    empresa.id, user?.id ?? null, mesFacturado, res,
                    filas.length - seleccionadas.length,
                )
            } catch (logErr: any) {
                console.error('[facturacion_masiva_log] no se pudo guardar:', logErr)
                setErrorProceso(`Las facturas se generaron correctamente, pero no se pudo guardar el log de auditoría: ${logErr.message ?? logErr}`)
            }
        } catch (e: any) {
            setErrorProceso(e.message ?? String(e))
            setPaso('config')
        }
    }

    async function descargarPdf() {
        if (!resumen || !empresa) return
        const { jsPDF } = await import('jspdf')
        const autoTable = (await import('jspdf-autotable')).default
        const doc = new jsPDF()

        doc.setFontSize(14)
        doc.text(empresa.nombre || 'Empresa', 14, 16)
        doc.setFontSize(11)
        doc.text('Facturación Masiva de Clientes', 14, 23)
        doc.setFontSize(9)
        doc.text(`Mes facturado: ${mesFacturado}  ·  Generado: ${new Date().toLocaleString('es-EC')}`, 14, 29)

        autoTable(doc, {
            startY: 34,
            head: [['Factura', 'Cliente', 'RUC/CI', 'Glosa', 'Valor', 'IVA', 'Total', 'Estado']],
            body: resumen.resultados.map(r => [
                r.secuencial ?? '—',
                r.clienteNombre,
                r.identificacion,
                r.glosa,
                fmt(r.valor),
                fmt(r.iva),
                fmt(r.total),
                r.ok ? (r.estadoSri ?? 'AUTORIZADO') : `ERROR: ${r.error ?? ''}`,
            ]),
            styles: { fontSize: 7 },
            headStyles: { fillColor: [30, 64, 175] },
            foot: [['', '', '', 'TOTALES', fmt(resumen.subtotalSinIva), fmt(resumen.totalIva15 + resumen.totalIva0), fmt(resumen.totalGeneral), '']],
        })

        doc.save(`facturacion-masiva-${mesFacturado}.pdf`)
    }

    if (loading) {
        return <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary-600" /></div>
    }

    return (
        <div className="max-w-6xl space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-primary-100 flex items-center justify-center">
                    <FileStack className="w-6 h-6 text-primary-600" />
                </div>
                <div className="flex-1">
                    <h1 className="text-xl font-bold text-slate-900">Facturación Masiva de Clientes</h1>
                    <p className="text-sm text-slate-500">Genera facturas electrónicas a todos los clientes seleccionados en un solo lote.</p>
                </div>
                <button onClick={cargar} className="p-2 text-slate-400 hover:text-slate-700" title="Recargar clientes">
                    <RefreshCw className="w-5 h-5" />
                </button>
            </div>

            {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
            {errorProceso && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{errorProceso}</div>}

            {paso === 'progreso' && (
                <div className="card p-8 flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-primary-600" />
                    <p className="font-semibold text-slate-700">
                        Facturando {progreso.actual}/{progreso.total} — {progreso.nombre}
                    </p>
                    <div className="w-full max-w-md bg-slate-100 rounded-full h-2.5">
                        <div className="bg-primary-600 h-2.5 rounded-full transition-all"
                            style={{ width: `${progreso.total ? (progreso.actual / progreso.total) * 100 : 0}%` }} />
                    </div>
                    <p className="text-xs text-slate-400">No cierres esta pestaña hasta que termine.</p>
                </div>
            )}

            {paso === 'resumen' && resumen && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-green-700 font-semibold">
                        <CheckCircle className="w-5 h-5" /> Proceso terminado
                    </div>
                    <div className="card overflow-hidden">
                        <table className="w-full text-sm">
                            <tbody className="divide-y divide-slate-100">
                                {[
                                    ['Clientes seleccionados', resumen.clientesSeleccionados],
                                    ['Clientes facturados', resumen.clientesFacturados],
                                    ['— pendientes de autorización SRI', resumen.clientesPendientesAutorizacion],
                                    ['Facturas con error', resumen.clientesConError],
                                    ['Subtotal sin IVA', fmt(resumen.subtotalSinIva)],
                                    ['IVA 15%', fmt(resumen.totalIva15)],
                                    ['IVA 0%', fmt(resumen.totalIva0)],
                                    ['Total general', fmt(resumen.totalGeneral)],
                                ].map(([label, val]) => (
                                    <tr key={label as string}>
                                        <td className="px-4 py-2.5 text-slate-500">{label}</td>
                                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-800">{val}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {resumen.clientesPendientesAutorizacion > 0 && (
                        <div className="card p-4 bg-amber-50 border border-amber-200 text-sm text-amber-800">
                            {resumen.clientesPendientesAutorizacion} factura(s) quedaron generadas pero aún sin autorización del SRI —
                            el sistema las reintenta automáticamente cada 15 minutos, no requieren acción manual salvo que sigan
                            pendientes tras un par de horas.
                        </div>
                    )}

                    {resumen.clientesConError > 0 && (
                        <div className="card p-4 bg-red-50 border border-red-200 space-y-1">
                            <p className="text-xs font-bold text-red-700 uppercase">Clientes con error</p>
                            {resumen.resultados.filter(r => !r.ok).map(r => (
                                <p key={r.clienteId} className="text-sm text-red-700">
                                    <strong>{r.clienteNombre}</strong>: {r.error}
                                </p>
                            ))}
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button onClick={descargarPdf} className="btn btn-primary flex items-center gap-2 text-sm">
                            <Download className="w-4 h-4" /> Descargar PDF
                        </button>
                        <button onClick={cargar} className="btn btn-secondary text-sm">Nueva corrida</button>
                    </div>
                </div>
            )}

            {paso === 'config' && (
                <>
                    <div className="card p-5 space-y-4">
                        <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wider">Configuración del lote</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-3">
                                <label className="label text-xs">Glosa general</label>
                                <div className="flex gap-2">
                                    <input className="input flex-1" value={glosaGeneral}
                                        onChange={e => setGlosaGeneral(e.target.value)}
                                        placeholder="Ej: Servicio de alojamiento y soporte — agosto 2026" />
                                    <button onClick={aplicarGlosaATodos} className="btn btn-secondary text-xs whitespace-nowrap">Aplicar a todos</button>
                                </div>
                            </div>
                            <div>
                                <label className="label text-xs">Fecha de emisión</label>
                                <input type="date" className="input" value={fechaEmision} onChange={e => setFechaEmision(e.target.value)} />
                            </div>
                            <div>
                                <label className="label text-xs">Días de vencimiento</label>
                                <input type="number" min={0} className="input" value={diasVencimiento}
                                    onChange={e => setDiasVencimiento(Number(e.target.value))} disabled={!!fechaVencExplicita} />
                            </div>
                            <div>
                                <label className="label text-xs">Fecha de vencimiento explícita (opcional)</label>
                                <input type="date" className="input" value={fechaVencExplicita}
                                    onChange={e => setFechaVencExplicita(e.target.value)} />
                            </div>
                            <div>
                                <label className="label text-xs">Tasa de IVA general</label>
                                <div className="flex gap-2">
                                    <select className="input flex-1" value={tasaIvaGeneral} onChange={e => setTasaIvaGeneral(Number(e.target.value))}>
                                        <option value={15}>15%</option>
                                        <option value={0}>0%</option>
                                    </select>
                                    <button onClick={aplicarTasaIvaATodos} className="btn btn-secondary text-xs whitespace-nowrap">Aplicar a todos</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="card overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                            <h2 className="font-semibold text-slate-700 text-sm">Clientes ({filas.length})</h2>
                            <p className="text-sm text-slate-500">
                                {seleccionadas.length} seleccionados · Subtotal {fmt(totalesPreview.subtotal)} · IVA {fmt(totalesPreview.iva)} · Total <strong>{fmt(totalesPreview.total)}</strong>
                            </p>
                        </div>
                        <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                                    <tr>
                                        {['', 'Cliente', 'RUC/CI', 'Valor', 'IVA %', 'Total', 'Glosa', 'Vence', ''].map(h => (
                                            <th key={h} className="px-3 py-2 text-left text-xs font-bold text-slate-500 uppercase whitespace-nowrap">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filas.map(fila => {
                                        const iva = fila.valor * (fila.tasaIva / 100)
                                        const total = fila.valor + iva
                                        const err = erroresValidacion.find(e => e.clienteId === fila.cliente.id)
                                        return (
                                            <tr key={fila.cliente.id} className={cn(!fila.marcado && 'opacity-50', err && 'bg-red-50')}>
                                                <td className="px-3 py-2">
                                                    <input type="checkbox" checked={fila.marcado}
                                                        onChange={e => actualizarFila(fila.cliente.id, { marcado: e.target.checked })} />
                                                </td>
                                                <td className="px-3 py-2 max-w-[180px]">
                                                    <p className="font-medium text-slate-800 truncate">{fila.cliente.nombre}</p>
                                                    {fila.cliente.bloqueo_credito && (
                                                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 bg-amber-100 px-1.5 rounded-full">
                                                            <ShieldAlert className="w-3 h-3" /> Suspendido por pago
                                                        </span>
                                                    )}
                                                    {err && <p className="text-[10px] text-red-600 mt-0.5">{err.error}</p>}
                                                </td>
                                                <td className="px-3 py-2 font-mono text-xs text-slate-500 whitespace-nowrap">{fila.cliente.identificacion}</td>
                                                <td className="px-3 py-2">
                                                    <input type="number" step="0.01" className="input input-sm w-24" value={fila.valor}
                                                        onChange={e => actualizarFila(fila.cliente.id, { valor: Number(e.target.value) })} />
                                                </td>
                                                <td className="px-3 py-2">
                                                    <select className="input input-sm w-20" value={fila.tasaIva}
                                                        onChange={e => actualizarFila(fila.cliente.id, { tasaIva: Number(e.target.value) })}>
                                                        <option value={15}>15%</option>
                                                        <option value={0}>0%</option>
                                                    </select>
                                                </td>
                                                <td className="px-3 py-2 font-mono font-semibold text-slate-800 whitespace-nowrap">{fmt(total)}</td>
                                                <td className="px-3 py-2 min-w-[200px]">
                                                    <input className="input input-sm w-full" value={fila.glosa}
                                                        onChange={e => actualizarFila(fila.cliente.id, { glosa: e.target.value })} />
                                                </td>
                                                <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
                                                    {fechaVencExplicita || new Date(Date.now() + diasVencimiento * 86400000).toISOString().split('T')[0]}
                                                </td>
                                                <td className="px-3 py-2">
                                                    {err ? <XCircle className="w-4 h-4 text-red-500" /> : validado && fila.marcado ? <CheckCircle className="w-4 h-4 text-green-500" /> : null}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button onClick={validar} disabled={seleccionadas.length === 0} className="btn btn-secondary text-sm disabled:opacity-40">
                            Validar
                        </button>
                        <button
                            onClick={() => setPaso('confirm')}
                            disabled={!validado || seleccionadas.length === 0}
                            className="btn btn-primary text-sm disabled:opacity-40"
                        >
                            Facturar {seleccionadas.length} cliente(s)
                        </button>
                        {erroresValidacion.length > 0 && (
                            <span className="text-sm text-red-600">{erroresValidacion.length} cliente(s) con error — revisa la grilla</span>
                        )}
                    </div>
                </>
            )}

            {paso === 'confirm' && (
                <div className="space-y-4">
                    <div className="bg-red-50 border-2 border-red-300 rounded-xl p-5">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-bold text-red-800 text-lg">Vas a generar {seleccionadas.length} facturas electrónicas reales</p>
                                <p className="text-red-700 text-sm mt-1">
                                    Se enviarán al SRI y se notificará a cada cliente por correo. Total a facturar: <strong>{fmt(totalesPreview.total)}</strong>.
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="card p-5 space-y-3">
                        <label className="block text-sm font-semibold text-slate-700 mb-1">
                            Para confirmar, escribe exactamente: <span className="font-mono text-red-600 ml-1">{confirmacionEsperada}</span>
                        </label>
                        <input
                            type="text"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-red-400 outline-none font-mono"
                            placeholder={confirmacionEsperada}
                            value={confirmText}
                            onChange={e => setConfirmText(e.target.value)}
                        />
                        <div className="flex gap-3">
                            <button onClick={() => setPaso('config')} className="btn btn-secondary text-sm">Cancelar</button>
                            <button
                                onClick={confirmarFacturacion}
                                disabled={confirmText.trim().toUpperCase() !== confirmacionEsperada.toUpperCase()}
                                className="flex items-center gap-2 px-5 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 font-semibold"
                            >
                                <FileStack className="w-4 h-4" /> Facturar ahora
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
