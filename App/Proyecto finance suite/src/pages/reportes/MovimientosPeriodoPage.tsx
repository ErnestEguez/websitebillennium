import { useState, useEffect } from 'react'
import { BarChart3, Loader2, AlertCircle, X, Download, Search } from 'lucide-react'
import * as XLSX from 'xlsx'
import { useAuth } from '../../contexts/AuthContext'
import { cuentasBancariasService } from '../../services/bancosService'
import { movimientoService } from '../../services/movimientoService'
import { cn, formatMoneda, formatFecha } from '../../lib/utils'
import type { CuentaBancaria, MovimientoBancario, TipoMovimiento } from '../../types/finance'

const TIPO_LABELS: Record<TipoMovimiento, string> = {
    deposito: 'Depósito', nota_debito: 'Nota débito', nota_credito: 'Nota crédito',
    comision: 'Comisión', interes: 'Interés', cargo_automatico: 'Cargo automático', otro: 'Otro',
}

type ResumenTipo = { tipo: string; creditos: number; debitos: number; cantidad: number }

export function MovimientosPeriodoPage() {
    const { empresa } = useAuth()

    const [cuentas, setCuentas]     = useState<CuentaBancaria[]>([])
    const [cuentaId, setCuentaId]   = useState('')
    const [desde, setDesde]         = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10))
    const [hasta, setHasta]         = useState(new Date().toISOString().slice(0, 10))
    const [movimientos, setMovimientos] = useState<MovimientoBancario[]>([])
    const [loading, setLoading]     = useState(false)
    const [error, setError]         = useState('')
    const [buscado, setBuscado]     = useState(false)

    useEffect(() => {
        if (!empresa?.id) return
        cuentasBancariasService.listar(empresa.id)
            .then(c => setCuentas(c.filter(x => x.estado === 'activa')))
            .catch(() => {})
    }, [empresa?.id])

    async function buscar() {
        if (!empresa?.id) return
        setLoading(true); setError(''); setBuscado(false)
        try {
            const mvs = await movimientoService.listar(empresa.id, {
                cuentaId:  cuentaId || undefined,
                desde,
                hasta,
            })
            setMovimientos(mvs.filter(m => m.estado === 'activo'))
            setBuscado(true)
        } catch (e: unknown) { setError(String(e)) }
        finally { setLoading(false) }
    }

    const totalCreditos = movimientos.filter(m => m.sentido === 'credito').reduce((s, m) => s + m.monto, 0)
    const totalDebitos  = movimientos.filter(m => m.sentido === 'debito').reduce((s, m) => s + m.monto, 0)
    const neto          = totalCreditos - totalDebitos

    const resumenPorTipo: ResumenTipo[] = Object.entries(TIPO_LABELS).map(([tipo, label]) => {
        const items = movimientos.filter(m => m.tipo === tipo)
        return {
            tipo: label,
            creditos: items.filter(m => m.sentido === 'credito').reduce((s, m) => s + m.monto, 0),
            debitos:  items.filter(m => m.sentido === 'debito').reduce((s, m) => s + m.monto, 0),
            cantidad: items.length,
        }
    }).filter(r => r.cantidad > 0)

    function exportar() {
        const filas = movimientos.map(m => ({
            'Fecha':         m.fecha,
            'Cuenta':        (m.cuenta_bancaria?.banco?.nombre ?? '') + ' ' + (m.cuenta_bancaria?.numero_cuenta ?? ''),
            'Tipo':          TIPO_LABELS[m.tipo as TipoMovimiento] ?? m.tipo,
            'Descripción':   m.descripcion ?? m.referencia ?? '',
            'Origen':        m.origen,
            'Sentido':       m.sentido === 'credito' ? 'Crédito' : 'Débito',
            'Monto':         m.monto,
            'Conciliado':    m.conciliado ? 'Sí' : 'No',
        }))
        const wsMov = XLSX.utils.json_to_sheet(filas)
        const wsRes = XLSX.utils.json_to_sheet(resumenPorTipo.map(r => ({
            'Tipo': r.tipo, 'Créditos': r.creditos, 'Débitos': r.debitos, 'Cantidad': r.cantidad,
        })))
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, wsMov, 'Movimientos')
        XLSX.utils.book_append_sheet(wb, wsRes, 'Resumen por Tipo')
        XLSX.writeFile(wb, `Movimientos_${empresa?.ruc ?? ''}_${desde}_${hasta}.xlsx`)
    }

    return (
        <div className="space-y-5 max-w-6xl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Movimientos por Período</h1>
                    <p className="text-slate-500 text-sm mt-0.5">Resumen y detalle de movimientos bancarios</p>
                </div>
                {buscado && movimientos.length > 0 && (
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

            <div className="card p-4 flex flex-wrap gap-4 items-end">
                <div>
                    <label className="label">Cuenta bancaria</label>
                    <select className="input" value={cuentaId} onChange={e => setCuentaId(e.target.value)}>
                        <option value="">Todas las cuentas</option>
                        {cuentas.map(c => (
                            <option key={c.id} value={c.id}>{c.banco?.nombre} — {c.numero_cuenta}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="label">Desde</label>
                    <input type="date" className="input" value={desde} onChange={e => setDesde(e.target.value)} />
                </div>
                <div>
                    <label className="label">Hasta</label>
                    <input type="date" className="input" value={hasta} onChange={e => setHasta(e.target.value)} />
                </div>
                <button onClick={buscar} disabled={loading} className="btn btn-primary gap-2">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Consultar
                </button>
            </div>

            {buscado && (
                <>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="card p-4">
                            <p className="text-xs text-slate-500">Total créditos</p>
                            <p className="text-xl font-bold text-green-700">{formatMoneda(totalCreditos)}</p>
                            <p className="text-xs text-slate-400 mt-1">{movimientos.filter(m => m.sentido === 'credito').length} movimientos</p>
                        </div>
                        <div className="card p-4">
                            <p className="text-xs text-slate-500">Total débitos</p>
                            <p className="text-xl font-bold text-red-600">{formatMoneda(totalDebitos)}</p>
                            <p className="text-xs text-slate-400 mt-1">{movimientos.filter(m => m.sentido === 'debito').length} movimientos</p>
                        </div>
                        <div className="card p-4">
                            <p className="text-xs text-slate-500">Neto del período</p>
                            <p className={cn('text-xl font-bold', neto >= 0 ? 'text-green-700' : 'text-red-600')}>
                                {formatMoneda(neto)}
                            </p>
                            <p className="text-xs text-slate-400 mt-1">{movimientos.length} total</p>
                        </div>
                    </div>

                    {resumenPorTipo.length > 0 && (
                        <div className="card overflow-hidden">
                            <div className="bg-primary-700 px-5 py-3 text-white text-sm font-bold flex items-center gap-2">
                                <BarChart3 className="w-4 h-4" />Resumen por tipo
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                                            <th className="py-2 px-4 text-left">Tipo</th>
                                            <th className="py-2 px-4 text-right">Cantidad</th>
                                            <th className="py-2 px-4 text-right">Créditos</th>
                                            <th className="py-2 px-4 text-right">Débitos</th>
                                            <th className="py-2 px-4 text-right">Neto</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {resumenPorTipo.map(r => (
                                            <tr key={r.tipo} className="border-b border-slate-100 hover:bg-slate-50">
                                                <td className="py-2.5 px-4 font-semibold">{r.tipo}</td>
                                                <td className="py-2.5 px-4 text-right text-slate-500">{r.cantidad}</td>
                                                <td className="py-2.5 px-4 text-right text-green-600">{r.creditos > 0 ? formatMoneda(r.creditos) : '—'}</td>
                                                <td className="py-2.5 px-4 text-right text-red-600">{r.debitos > 0 ? formatMoneda(r.debitos) : '—'}</td>
                                                <td className={cn('py-2.5 px-4 text-right font-bold',
                                                    r.creditos - r.debitos >= 0 ? 'text-green-700' : 'text-red-600')}>
                                                    {formatMoneda(r.creditos - r.debitos)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <div className="card overflow-hidden">
                        <div className="bg-slate-700 px-5 py-3 text-white text-sm font-bold flex items-center gap-2">
                            <BarChart3 className="w-4 h-4" />Detalle ({movimientos.length})
                        </div>
                        {movimientos.length === 0 ? (
                            <div className="py-12 text-center text-slate-400">
                                <BarChart3 className="w-10 h-10 mx-auto mb-2 opacity-20" />
                                <p>No hay movimientos en el período seleccionado</p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                                            <th className="py-2 px-4 text-left">Fecha</th>
                                            <th className="py-2 px-4 text-left">Cuenta</th>
                                            <th className="py-2 px-4 text-left">Tipo</th>
                                            <th className="py-2 px-4 text-left">Descripción</th>
                                            <th className="py-2 px-4 text-right">Débito</th>
                                            <th className="py-2 px-4 text-right">Crédito</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {movimientos.map(m => (
                                            <tr key={m.id} className="border-b border-slate-100 hover:bg-slate-50">
                                                <td className="py-2.5 px-4 text-xs text-slate-500">{formatFecha(m.fecha)}</td>
                                                <td className="py-2.5 px-4 text-xs text-slate-500">
                                                    {m.cuenta_bancaria?.banco?.nombre}<br />
                                                    <span className="font-mono">{m.cuenta_bancaria?.numero_cuenta}</span>
                                                </td>
                                                <td className="py-2.5 px-4">
                                                    <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                                                        {TIPO_LABELS[m.tipo as TipoMovimiento] ?? m.tipo}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-4 text-slate-700 max-w-xs truncate">
                                                    {m.descripcion ?? m.referencia ?? '—'}
                                                </td>
                                                <td className="py-2.5 px-4 text-right text-red-600 font-semibold">
                                                    {m.sentido === 'debito' ? formatMoneda(m.monto) : '—'}
                                                </td>
                                                <td className="py-2.5 px-4 text-right text-green-600 font-semibold">
                                                    {m.sentido === 'credito' ? formatMoneda(m.monto) : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}
