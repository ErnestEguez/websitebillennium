import { useState, useEffect } from 'react'
import { CheckSquare, Loader2, AlertCircle, X, Download, Clock, CheckCircle2 } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useAuth } from '../../contexts/AuthContext'
import { cuentasBancariasService } from '../../services/bancosService'
import { chequeService } from '../../services/chequeService'
import { cn, formatMoneda, formatFecha } from '../../lib/utils'
import type { Cheque, CuentaBancaria } from '../../types/finance'

export function ChequesAFechaReportePage() {
    const { empresa } = useAuth()

    const [cuentas, setCuentas]   = useState<CuentaBancaria[]>([])
    const [lista, setLista]       = useState<Cheque[]>([])
    const [cuentaId, setCuentaId] = useState('')
    const [loading, setLoading]   = useState(true)
    const [error, setError]       = useState('')

    const hoy = new Date().toISOString().slice(0, 10)
    const proximos30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    useEffect(() => {
        if (!empresa?.id) { setLoading(false); return }
        Promise.all([
            chequeService.listar(empresa.id, { soloPostfechados: false }),
            cuentasBancariasService.listar(empresa.id),
        ]).then(([c, b]) => {
            setLista(c)
            setCuentas(b)
        }).catch(() => {}).finally(() => setLoading(false))
    }, [empresa?.id])

    const filtrados = lista.filter(c =>
        c.es_postfechado && (!cuentaId || c.cuenta_bancaria_id === cuentaId)
    )

    const vencidos       = filtrados.filter(c => c.estado !== 'cobrado' && c.estado !== 'anulado' && c.fecha_cobro && c.fecha_cobro <= hoy)
    const proxVencer     = filtrados.filter(c => c.estado !== 'cobrado' && c.estado !== 'anulado' && c.fecha_cobro && c.fecha_cobro > hoy && c.fecha_cobro <= proximos30)
    const futuros        = filtrados.filter(c => c.estado !== 'cobrado' && c.estado !== 'anulado' && c.fecha_cobro && c.fecha_cobro > proximos30)
    const cobrados       = filtrados.filter(c => c.estado === 'cobrado')
    const anulados       = filtrados.filter(c => c.estado === 'anulado')

    const pendientes     = filtrados.filter(c => c.estado !== 'cobrado' && c.estado !== 'anulado')
    const totalPendiente = pendientes.reduce((s, c) => s + c.monto, 0)
    const totalCobrado   = cobrados.reduce((s, c) => s + c.monto, 0)

    function exportar() {
        const filas = filtrados.map(c => ({
            'N° Cheque':      c.numero_cheque,
            'Cuenta':         (c.cuenta_bancaria?.banco?.nombre ?? '') + ' ' + (c.cuenta_bancaria?.numero_cuenta ?? ''),
            'Beneficiario':   c.beneficiario,
            'Fecha Emisión':  c.fecha_emision,
            'Fecha Cobro':    c.fecha_cobro ?? '',
            'Monto':          c.monto,
            'Estado':         c.estado,
            'Fecha Cobro Real': c.fecha_cobro_real ?? '',
            'Vencido':        c.fecha_cobro && c.fecha_cobro <= hoy && c.estado !== 'cobrado' ? 'Sí' : 'No',
        }))
        const ws = XLSX.utils.json_to_sheet(filas)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Cheques a Fecha')
        XLSX.writeFile(wb, `ChequesAFechaReporte_${empresa?.ruc ?? ''}.xlsx`)
    }

    return (
        <div className="space-y-5 max-w-6xl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Reporte: Cheques a Fecha</h1>
                    <p className="text-slate-500 text-sm mt-0.5">Historial completo de cheques post-fechados</p>
                </div>
                {filtrados.length > 0 && (
                    <button onClick={exportar} className="btn btn-secondary gap-2">
                        <Download className="w-4 h-4" />Excel
                    </button>
                )}
            </div>

            {error && (
                <div className="card px-4 py-3 bg-red-50 border-red-200 text-red-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" /><span className="flex-1">{error}</span>
                    <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
                </div>
            )}

            <div className="card p-4 flex gap-3">
                <div>
                    <label className="label">Cuenta bancaria</label>
                    <select className="input" value={cuentaId} onChange={e => setCuentaId(e.target.value)}>
                        <option value="">Todas</option>
                        {cuentas.map(c => <option key={c.id} value={c.id}>{c.banco?.nombre} — {c.numero_cuenta}</option>)}
                    </select>
                </div>
            </div>

            {loading ? (
                <div className="py-12 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando...</div>
            ) : (
                <>
                    <div className="grid grid-cols-4 gap-4">
                        <div className="card p-4 border-l-4 border-red-500">
                            <p className="text-xl font-bold text-red-600">{vencidos.length}</p>
                            <p className="text-xs text-slate-500">Vencidos (sin cobrar)</p>
                            <p className="text-sm font-semibold text-red-700 mt-1">{formatMoneda(vencidos.reduce((s, c) => s + c.monto, 0))}</p>
                        </div>
                        <div className="card p-4 border-l-4 border-amber-500">
                            <p className="text-xl font-bold text-amber-600">{proxVencer.length}</p>
                            <p className="text-xs text-slate-500">Vencen en 30 días</p>
                            <p className="text-sm font-semibold text-amber-700 mt-1">{formatMoneda(proxVencer.reduce((s, c) => s + c.monto, 0))}</p>
                        </div>
                        <div className="card p-4 border-l-4 border-primary-500">
                            <p className="text-xl font-bold text-primary-600">{pendientes.length}</p>
                            <p className="text-xs text-slate-500">Total pendiente</p>
                            <p className="text-sm font-semibold text-primary-700 mt-1">{formatMoneda(totalPendiente)}</p>
                        </div>
                        <div className="card p-4 border-l-4 border-green-500">
                            <p className="text-xl font-bold text-green-600">{cobrados.length}</p>
                            <p className="text-xs text-slate-500">Cobrados</p>
                            <p className="text-sm font-semibold text-green-700 mt-1">{formatMoneda(totalCobrado)}</p>
                        </div>
                    </div>

                    {vencidos.length > 0 && (
                        <Seccion titulo="Vencidos" color="bg-red-600" icono={<Clock className="w-4 h-4" />} items={vencidos} />
                    )}
                    {proxVencer.length > 0 && (
                        <Seccion titulo="Próximos 30 días" color="bg-amber-600" icono={<Clock className="w-4 h-4" />} items={proxVencer} />
                    )}
                    {futuros.length > 0 && (
                        <Seccion titulo="Futuros" color="bg-slate-700" icono={<CheckSquare className="w-4 h-4" />} items={futuros} />
                    )}
                    {cobrados.length > 0 && (
                        <Seccion titulo="Cobrados" color="bg-green-700" icono={<CheckCircle2 className="w-4 h-4" />} items={cobrados} />
                    )}
                    {anulados.length > 0 && (
                        <Seccion titulo="Anulados" color="bg-slate-500" icono={<X className="w-4 h-4" />} items={anulados} />
                    )}

                    {filtrados.length === 0 && (
                        <div className="card py-12 text-center text-slate-400">
                            <CheckSquare className="w-10 h-10 mx-auto mb-2 opacity-20" />
                            <p>No hay cheques post-fechados registrados</p>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

function Seccion({ titulo, color, icono, items }: {
    titulo: string
    color: string
    icono: React.ReactNode
    items: Cheque[]
}) {
    const hoy = new Date().toISOString().slice(0, 10)
    const ESTADO_BADGE: Record<string, string> = {
        emitido:     'bg-blue-100 text-blue-700',
        cobrado:     'bg-green-100 text-green-700',
        anulado:     'bg-red-100 text-red-700',
        en_transito: 'bg-amber-100 text-amber-700',
    }

    return (
        <div className="card overflow-hidden">
            <div className={cn('px-5 py-3 text-white text-sm font-bold flex items-center gap-2', color)}>
                {icono}{titulo} ({items.length}) — {formatMoneda(items.reduce((s, c) => s + c.monto, 0))}
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                            <th className="py-2 px-4 text-left">N° Cheque</th>
                            <th className="py-2 px-4 text-left">Cuenta</th>
                            <th className="py-2 px-4 text-left">Beneficiario</th>
                            <th className="py-2 px-4 text-left">F. Emisión</th>
                            <th className="py-2 px-4 text-left">F. Cobro Pactada</th>
                            <th className="py-2 px-4 text-left">F. Cobro Real</th>
                            <th className="py-2 px-4 text-right">Monto</th>
                            <th className="py-2 px-4 text-center">Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map(c => (
                            <tr key={c.id} className={cn('border-b border-slate-100 hover:bg-slate-50',
                                c.estado === 'anulado' && 'opacity-50',
                                c.fecha_cobro && c.fecha_cobro <= hoy && c.estado !== 'cobrado' && 'bg-red-50/30'
                            )}>
                                <td className="py-2.5 px-4 font-mono text-xs font-bold">{c.numero_cheque}</td>
                                <td className="py-2.5 px-4 text-xs text-slate-500">
                                    {c.cuenta_bancaria?.banco?.nombre}<br />
                                    <span className="font-mono">{c.cuenta_bancaria?.numero_cuenta}</span>
                                </td>
                                <td className="py-2.5 px-4 text-sm">{c.beneficiario}</td>
                                <td className="py-2.5 px-4 text-xs text-slate-500">{formatFecha(c.fecha_emision)}</td>
                                <td className="py-2.5 px-4 text-xs font-semibold text-amber-700">
                                    {c.fecha_cobro ? formatFecha(c.fecha_cobro) : '—'}
                                </td>
                                <td className="py-2.5 px-4 text-xs text-green-700">
                                    {c.fecha_cobro_real ? formatFecha(c.fecha_cobro_real) : '—'}
                                </td>
                                <td className="py-2.5 px-4 text-right font-bold">{formatMoneda(c.monto)}</td>
                                <td className="py-2.5 px-4 text-center">
                                    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                                        ESTADO_BADGE[c.estado] || 'bg-slate-100 text-slate-500')}>
                                        {c.estado}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
