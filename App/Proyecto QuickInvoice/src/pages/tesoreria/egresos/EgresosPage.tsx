import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, FileText, Loader2, X, AlertCircle, Download, Printer } from 'lucide-react'
import { useAuth } from '../../../contexts/AuthContext'
import { egresoService } from '../../../services/finance/egresoService'
import { cn, formatMoneda, formatFecha } from '../../../lib/utils'
import { exportarExcelProfesional } from '../../../lib/excelUtils'
import { imprimirReporte, generarTablaHtml } from '../../../lib/printUtils'
import { htmlComprobanteEgreso, abrirVentanaImpresion } from '../../../lib/comprobantesPrint'
import { FORMA_PAGO_LABELS } from '../../../types/finance'
import type { ComprobanteEgreso } from '../../../types/finance'

export function EgresosPage() {
    const { empresa } = useAuth()

    const hoy = new Date().toISOString().slice(0, 10)
    const ini = hoy.slice(0, 7) + '-01'

    const [lista, setLista]     = useState<ComprobanteEgreso[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError]     = useState('')
    const [desde, setDesde]     = useState(ini)
    const [hasta, setHasta]     = useState(hoy)
    const [estado, setEstado]   = useState('')
    const [busq, setBusq]       = useState('')

    const [modalAnular, setModalAnular] = useState<ComprobanteEgreso | null>(null)
    const [motivo, setMotivo]           = useState('')
    const [anulando, setAnulando]       = useState(false)
    const [imprimiendo, setImprimiendo] = useState<string | null>(null)

    useEffect(() => { if (empresa?.id) cargar() }, [empresa?.id, desde, hasta, estado])

    async function cargar() {
        if (!empresa?.id) return
        setLoading(true)
        try {
            setLista(await egresoService.listar(empresa.id, { desde, hasta, estado: estado || undefined }))
        } catch (e: unknown) { setError(String(e)) }
        finally { setLoading(false) }
    }

    async function confirmarAnular() {
        if (!modalAnular || !motivo.trim()) return
        setAnulando(true)
        try {
            await egresoService.anular(modalAnular.id, motivo, empresa!.id)
            setModalAnular(null); setMotivo('')
            await cargar()
        } catch (e: unknown) { setError(String(e)) }
        finally { setAnulando(false) }
    }

    const filtrados = lista.filter(e =>
        !busq || e.numero.toLowerCase().includes(busq.toLowerCase())
    )

    const total = filtrados.filter(e => e.estado === 'emitido').reduce((s, e) => s + e.monto_total, 0)

    async function imprimirComprobante(egreso: ComprobanteEgreso) {
        setImprimiendo(egreso.id)
        try {
            const { egreso: eg, proveedor, facturas } = await egresoService.obtenerParaImprimir(egreso.id)
            const html = htmlComprobanteEgreso({ empresa, eg, proveedor, facturas })
            abrirVentanaImpresion(html)
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : JSON.stringify(e)
            setError('Error al cargar comprobante: ' + msg)
        } finally {
            setImprimiendo(null)
        }
    }

    function imprimir() {
        const html = generarTablaHtml(
            [
                { label: 'Número',      key: 'numero',    width: '12%' },
                { label: 'Fecha',       key: 'fecha',     width: '9%' },
                { label: 'Forma Pago',  key: 'formaPago', width: '16%' },
                { label: 'Cuenta',      key: 'cuenta',    width: '19%' },
                { label: 'Referencia',  key: 'ref',       width: '12%' },
                { label: 'N° Factura',  key: 'factura',   width: '12%' },
                { label: 'Monto',       key: 'monto',     align: 'right', width: '10%' },
                { label: 'Estado',      key: 'estado',    align: 'center', width: '10%' },
            ],
            filtrados.map(e => ({
                numero:   e.numero,
                fecha:    formatFecha(e.fecha),
                formaPago: FORMA_PAGO_LABELS[e.forma_pago],
                cuenta:   e.cuenta_bancaria?.banco?.nombre ? `${e.cuenta_bancaria.banco.nombre} — ${e.cuenta_bancaria.numero_cuenta}` : '—',
                ref:      e.referencia ?? '—',
                factura:  e.facturas?.length ? e.facturas.join(', ') : '—',
                monto:    formatMoneda(e.monto_total),
                estado:   e.estado,
            })),
            { numero: `${filtrados.filter(e => e.estado === 'emitido').length} emitidos`, monto: formatMoneda(total) }
        )
        imprimirReporte({
            empresa: { nombre: empresa?.nombre ?? '', ruc: empresa?.ruc ?? '' },
            titulo:  'Comprobantes de Egreso',
            periodo: `${desde} al ${hasta}`,
            html,
        })
    }

    function exportarExcel() {
        exportarExcelProfesional({
            empresa: { nombre: empresa?.nombre ?? '', ruc: empresa?.ruc ?? '' },
            titulo:  'Comprobantes de Egreso',
            periodo: `${desde} al ${hasta}`,
            columnas: [
                { key: 'Número',     label: 'Número',      width: 16 },
                { key: 'Fecha',      label: 'Fecha',       width: 12 },
                { key: 'FormaPago',  label: 'Forma Pago',  width: 22 },
                { key: 'Cuenta',     label: 'Cuenta',      width: 28 },
                { key: 'Referencia', label: 'Referencia',  width: 20 },
                { key: 'NFactura',   label: 'N° Factura',  width: 20 },
                { key: 'Concepto',   label: 'Concepto',    width: 32 },
                { key: 'Monto',      label: 'Monto',       width: 12 },
                { key: 'Estado',     label: 'Estado',      width: 10 },
            ],
            filas: filtrados.map(e => ({
                Número:     e.numero,
                Fecha:      formatFecha(e.fecha),
                FormaPago:  FORMA_PAGO_LABELS[e.forma_pago],
                Cuenta:     e.cuenta_bancaria?.banco?.nombre ? `${e.cuenta_bancaria.banco.nombre} — ${e.cuenta_bancaria.numero_cuenta}` : '',
                Referencia: e.referencia ?? '',
                NFactura:   e.facturas?.length ? e.facturas.join(', ') : '',
                Concepto:   e.concepto ?? '',
                Monto:      e.monto_total,
                Estado:     e.estado,
            })),
            nombreArchivo: `Egresos_${empresa?.ruc ?? ''}_${desde}_${hasta}`,
        })
    }

    return (
        <div className="space-y-5 max-w-7xl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Comprobantes de Egreso</h1>
                    <p className="text-slate-500 text-sm mt-0.5">Pagos a proveedores</p>
                </div>
                <Link to="/egresos/nuevo" className="btn btn-primary gap-2">
                    <Plus className="w-4 h-4" />Nuevo egreso
                </Link>
            </div>

            {error && (
                <div className="card px-4 py-3 bg-red-50 border-red-200 text-red-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" /><span className="flex-1">{error}</span>
                    <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
                </div>
            )}

            {/* Filtros */}
            <div className="card p-4">
                <div className="flex flex-wrap gap-3 items-end">
                    <div><label className="label">Desde</label><input className="input" type="date" value={desde} onChange={e => setDesde(e.target.value)} /></div>
                    <div><label className="label">Hasta</label><input className="input" type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></div>
                    <div>
                        <label className="label">Estado</label>
                        <select className="input" value={estado} onChange={e => setEstado(e.target.value)}>
                            <option value="">Todos</option>
                            <option value="emitido">Emitido</option>
                            <option value="anulado">Anulado</option>
                        </select>
                    </div>
                    <div className="flex-1 min-w-[160px]">
                        <label className="label">Buscar número</label>
                        <input className="input" placeholder="EGR-000001..." value={busq} onChange={e => setBusq(e.target.value)} />
                    </div>
                    <button onClick={imprimir} disabled={filtrados.length === 0} className="btn btn-secondary gap-2">
                        <Printer className="w-4 h-4" />Imprimir
                    </button>
                    <button onClick={exportarExcel} disabled={filtrados.length === 0} className="btn btn-secondary gap-2">
                        <Download className="w-4 h-4" />Excel
                    </button>
                </div>
            </div>

            {/* Resumen */}
            <div className="grid grid-cols-3 gap-4">
                <div className="card p-4">
                    <p className="text-xl font-bold text-primary-600">{filtrados.filter(e => e.estado === 'emitido').length}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Egresos emitidos</p>
                </div>
                <div className="card p-4">
                    <p className="text-xl font-bold text-slate-900">{formatMoneda(total)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Total del período</p>
                </div>
                <div className="card p-4">
                    <p className="text-xl font-bold text-red-500">{filtrados.filter(e => e.estado === 'anulado').length}</p>
                    <p className="text-xs text-slate-500 mt-0.5">Anulados</p>
                </div>
            </div>

            {/* Tabla */}
            <div className="card overflow-hidden">
                <div className="bg-slate-700 px-5 py-3 text-white text-sm font-bold flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Egresos ({filtrados.length})
                </div>
                {loading ? (
                    <div className="py-12 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando...</div>
                ) : filtrados.length === 0 ? (
                    <div className="py-12 text-center text-slate-400">
                        <FileText className="w-10 h-10 mx-auto mb-2 opacity-20" />
                        <p>No hay egresos en el período</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                                    <th className="py-2 px-4 text-left">Número</th>
                                    <th className="py-2 px-4 text-left">Fecha</th>
                                    <th className="py-2 px-4 text-left">Forma de pago</th>
                                    <th className="py-2 px-4 text-left">Cuenta bancaria</th>
                                    <th className="py-2 px-4 text-left">Referencia</th>
                                    <th className="py-2 px-4 text-left">N° Factura</th>
                                    <th className="py-2 px-4 text-right">Monto</th>
                                    <th className="py-2 px-4 text-center">Estado</th>
                                    <th className="py-2 px-4 text-center">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtrados.map(e => (
                                    <tr key={e.id} className={cn('border-b border-slate-100 hover:bg-slate-50', e.estado === 'anulado' && 'opacity-50')}>
                                        <td className="py-2.5 px-4 font-mono text-xs font-bold text-primary-700">{e.numero}</td>
                                        <td className="py-2.5 px-4 text-xs text-slate-600">{formatFecha(e.fecha)}</td>
                                        <td className="py-2.5 px-4 text-xs">
                                            <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                                                {FORMA_PAGO_LABELS[e.forma_pago]}
                                            </span>
                                        </td>
                                        <td className="py-2.5 px-4 text-xs text-slate-500 font-mono">
                                            {e.cuenta_bancaria?.banco?.nombre ? `${e.cuenta_bancaria.banco.nombre} — ${e.cuenta_bancaria.numero_cuenta}` : '—'}
                                        </td>
                                        <td className="py-2.5 px-4 text-xs text-slate-500">{e.referencia || '—'}</td>
                                        <td className="py-2.5 px-4 text-xs text-slate-500 font-mono">{e.facturas?.length ? e.facturas.join(', ') : '—'}</td>
                                        <td className="py-2.5 px-4 text-right font-semibold">{formatMoneda(e.monto_total)}</td>
                                        <td className="py-2.5 px-4 text-center">
                                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                                                e.estado === 'emitido' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                            )}>{e.estado}</span>
                                        </td>
                                        <td className="py-2.5 px-4 text-center">
                                            <div className="flex items-center justify-center gap-3">
                                                <button
                                                    onClick={() => imprimirComprobante(e)}
                                                    disabled={imprimiendo === e.id}
                                                    className="text-xs text-primary-600 hover:underline flex items-center gap-1"
                                                    title="Imprimir comprobante"
                                                >
                                                    {imprimiendo === e.id
                                                        ? <Loader2 className="w-3 h-3 animate-spin" />
                                                        : <Printer className="w-3 h-3" />}
                                                    Ver
                                                </button>
                                                {e.estado === 'emitido' && (
                                                    <button onClick={() => { setModalAnular(e); setMotivo('') }}
                                                        className="text-xs text-red-500 hover:text-red-700 hover:underline">
                                                        Anular
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="bg-slate-50 border-t-2 font-semibold">
                                    <td colSpan={6} className="py-2.5 px-4 text-right text-xs text-slate-500 uppercase">Total emitidos</td>
                                    <td className="py-2.5 px-4 text-right">{formatMoneda(total)}</td>
                                    <td colSpan={2} />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal anular */}
            {modalAnular && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="flex items-center justify-between px-6 py-4 border-b">
                            <h2 className="font-bold text-red-700">Anular Egreso {modalAnular.numero}</h2>
                            <button onClick={() => setModalAnular(null)}><X className="w-5 h-5 text-slate-400" /></button>
                        </div>
                        <div className="p-6 space-y-3">
                            <p className="text-sm text-slate-600">Esta acción revertirá el egreso, anulará el movimiento bancario y reabrirá automáticamente las cuentas por pagar afectadas.</p>
                            <div>
                                <label className="label">Motivo de anulación *</label>
                                <textarea className="input resize-none" rows={3} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Describe el motivo..." />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-slate-50 rounded-b-2xl">
                            <button onClick={() => setModalAnular(null)} className="btn btn-secondary">Cancelar</button>
                            <button onClick={confirmarAnular} disabled={anulando || !motivo.trim()} className="btn btn-danger gap-2">
                                {anulando && <Loader2 className="w-4 h-4 animate-spin" />}Confirmar anulación
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}





