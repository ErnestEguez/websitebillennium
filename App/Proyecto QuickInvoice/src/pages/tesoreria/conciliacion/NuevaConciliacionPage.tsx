import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
    GitMerge, Loader2, AlertCircle, X, CheckCircle2, Save,
    ArrowLeftRight, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useAuth } from '../../../contexts/AuthContext'
import { conciliacionService } from "../../../services/finance/conciliacionService"
import { cn, formatMoneda, formatFecha, mesNombre } from '../../../lib/utils'
import type { Conciliacion, MovimientoBancario } from '../../../types/finance'

export function NuevaConciliacionPage() {
    const { id } = useParams<{ id: string }>()
    const { empresa } = useAuth()
    const navigate = useNavigate()

    const [conciliacion, setConciliacion] = useState<Conciliacion | null>(null)
    const [movimientos, setMovimientos]   = useState<MovimientoBancario[]>([])
    const [loading, setLoading]           = useState(true)
    const [error, setError]               = useState('')
    const [saldoBanco, setSaldoBanco]     = useState('')
    const [guardandoSaldo, setGuardandoSaldo] = useState(false)
    const [confirmando, setConfirmando]   = useState(false)
    const [expandidos, setExpandidos]     = useState<Set<string>>(new Set())

    const cargar = useCallback(async () => {
        if (!id || !empresa?.id) return
        setLoading(true)
        try {
            const c = await conciliacionService.obtener(id)
            setConciliacion(c)
            setSaldoBanco(c.saldo_segun_banco.toString())
            const mvs = await conciliacionService.movimientosPendientes(
                empresa.id,
                c.cuenta_bancaria_id,
                c.fecha_inicio,
                c.fecha_fin,
            )
            setMovimientos(mvs)
        } catch (e: unknown) { setError(String(e)) }
        finally { setLoading(false) }
    }, [id, empresa?.id])

    useEffect(() => { cargar() }, [cargar])

    async function guardarSaldo() {
        if (!conciliacion) return
        const val = parseFloat(saldoBanco)
        if (isNaN(val)) { setError('Ingresa un saldo válido'); return }
        setGuardandoSaldo(true); setError('')
        try {
            await conciliacionService.actualizarSaldoBanco(conciliacion.id, val)
            setConciliacion(prev => prev ? { ...prev, saldo_segun_banco: val } : prev)
        } catch (e: unknown) { setError(String(e)) }
        finally { setGuardandoSaldo(false) }
    }

    async function toggleConciliado(mv: MovimientoBancario) {
        try {
            await conciliacionService.toggleConciliado(mv.id, !mv.conciliado)
            setMovimientos(prev => prev.map(m =>
                m.id === mv.id ? { ...m, conciliado: !m.conciliado } : m
            ))
        } catch (e: unknown) { setError(String(e)) }
    }

    async function confirmar() {
        if (!conciliacion || !empresa?.id) return
        const saldoLibros = movimientosConciliados.reduce((s, m) =>
            m.sentido === 'credito' ? s + m.monto : s - m.monto, 0)
        if (!confirm(`¿Confirmar conciliación? Diferencia: ${formatMoneda(Math.abs(conciliacion.saldo_segun_banco - saldoLibros))}`)) return
        setConfirmando(true); setError('')
        try {
            await conciliacionService.confirmar(conciliacion.id, saldoLibros)
            navigate('/conciliacion')
        } catch (e: unknown) { setError(String(e)) }
        finally { setConfirmando(false) }
    }

    const conciliados    = movimientos.filter(m => m.conciliado)
    const noConciliados  = movimientos.filter(m => !m.conciliado)

    const movimientosConciliados = conciliados
    const saldoLibros = movimientosConciliados.reduce((s, m) =>
        m.sentido === 'credito' ? s + m.monto : s - m.monto, 0)
    const diferencia = (conciliacion?.saldo_segun_banco ?? 0) - saldoLibros

    if (loading) return (
        <div className="py-24 text-center text-slate-400">
            <Loader2 className="w-7 h-7 animate-spin inline mr-2" />Cargando conciliación...
        </div>
    )

    if (!conciliacion) return (
        <div className="py-24 text-center text-slate-400">
            <AlertCircle className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>Conciliación no encontrada</p>
        </div>
    )

    const confirmada = conciliacion.estado === 'confirmada'

    return (
        <div className="space-y-5 max-w-6xl">
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => navigate('/conciliacion')}
                            className="text-slate-400 hover:text-slate-700 text-sm">← Volver</button>
                        <span className="text-slate-300">|</span>
                        <h1 className="text-2xl font-bold text-slate-900">
                            Conciliación — {mesNombre(conciliacion.periodo_mes)} {conciliacion.periodo_año}
                        </h1>
                    </div>
                    <p className="text-slate-500 text-sm mt-0.5">
                        {conciliacion.cuenta_bancaria?.banco?.nombre} — {conciliacion.cuenta_bancaria?.numero_cuenta}
                    </p>
                </div>
                {!confirmada && (
                    <button onClick={confirmar} disabled={confirmando || Math.abs(diferencia) > 0.01}
                        className="btn btn-primary gap-2 disabled:opacity-50">
                        {confirmando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        Confirmar conciliación
                    </button>
                )}
                {confirmada && (
                    <span className="inline-flex items-center gap-2 text-green-700 bg-green-100 px-4 py-2 rounded-xl font-semibold text-sm">
                        <CheckCircle2 className="w-4 h-4" />Confirmada
                    </span>
                )}
            </div>

            {error && (
                <div className="card px-4 py-3 bg-red-50 border-red-200 text-red-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" /><span className="flex-1">{error}</span>
                    <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
                </div>
            )}

            {/* Resumen */}
            <div className="grid grid-cols-4 gap-4">
                <div className="card p-4">
                    <p className="text-xs text-slate-500 mb-1">Saldo según banco</p>
                    {confirmada ? (
                        <p className="text-xl font-bold text-slate-900">{formatMoneda(conciliacion.saldo_segun_banco)}</p>
                    ) : (
                        <div className="flex gap-2 items-center">
                            <input type="number" step="0.01"
                                className="input text-right text-lg font-bold flex-1"
                                value={saldoBanco}
                                onChange={e => setSaldoBanco(e.target.value)} />
                            <button onClick={guardarSaldo} disabled={guardandoSaldo}
                                className="btn btn-secondary p-2">
                                {guardandoSaldo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            </button>
                        </div>
                    )}
                </div>
                <div className="card p-4">
                    <p className="text-xs text-slate-500 mb-1">Saldo según libros</p>
                    <p className="text-xl font-bold text-slate-900">{formatMoneda(saldoLibros)}</p>
                </div>
                <div className="card p-4">
                    <p className="text-xs text-slate-500 mb-1">Diferencia</p>
                    <p className={cn('text-xl font-bold', Math.abs(diferencia) < 0.01 ? 'text-green-700' : 'text-red-600')}>
                        {formatMoneda(Math.abs(diferencia))}
                    </p>
                </div>
                <div className="card p-4">
                    <p className="text-xs text-slate-500 mb-1">Movimientos</p>
                    <p className="text-xl font-bold text-slate-900">
                        {conciliados.length}<span className="text-sm text-slate-400 font-normal">/{movimientos.length}</span>
                    </p>
                    <p className="text-xs text-slate-500">conciliados</p>
                </div>
            </div>

            {Math.abs(diferencia) < 0.01 && !confirmada && movimientos.length > 0 && (
                <div className="card px-4 py-3 bg-green-50 border-green-200 text-green-700 text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Los saldos cuadran. Puedes confirmar la conciliación.</span>
                </div>
            )}

            {/* Movimientos pendientes */}
            {noConciliados.length > 0 && (
                <div className="card overflow-hidden">
                    <div className="bg-amber-600 px-5 py-3 text-white text-sm font-bold flex items-center gap-2">
                        <ArrowLeftRight className="w-4 h-4" />
                        Movimientos sin conciliar ({noConciliados.length})
                    </div>
                    <MovimientosTable
                        items={noConciliados}
                        onToggle={!confirmada ? toggleConciliado : undefined}
                        confirmada={confirmada}
                    />
                </div>
            )}

            {/* Movimientos conciliados */}
            {conciliados.length > 0 && (
                <div className="card overflow-hidden">
                    <button
                        onClick={() => setExpandidos(prev => {
                            const n = new Set(prev)
                            n.has('conciliados') ? n.delete('conciliados') : n.add('conciliados')
                            return n
                        })}
                        className="w-full bg-slate-700 px-5 py-3 text-white text-sm font-bold flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        Movimientos conciliados ({conciliados.length})
                        {expandidos.has('conciliados') ? <ChevronUp className="w-4 h-4 ml-auto" /> : <ChevronDown className="w-4 h-4 ml-auto" />}
                    </button>
                    {expandidos.has('conciliados') && (
                        <MovimientosTable
                            items={conciliados}
                            onToggle={!confirmada ? toggleConciliado : undefined}
                            confirmada={confirmada}
                        />
                    )}
                </div>
            )}

            {movimientos.length === 0 && (
                <div className="card py-12 text-center text-slate-400">
                    <GitMerge className="w-10 h-10 mx-auto mb-2 opacity-20" />
                    <p>No hay movimientos en el período seleccionado</p>
                </div>
            )}
        </div>
    )
}

function MovimientosTable({
    items,
    onToggle,
    confirmada,
}: {
    items: MovimientoBancario[]
    onToggle?: (m: MovimientoBancario) => void
    confirmada: boolean
}) {
    const TIPO_LABELS: Record<string, string> = {
        deposito: 'Depósito', nota_debito: 'Nota débito', nota_credito: 'Nota crédito',
        comision: 'Comisión', interes: 'Interés', cargo_automatico: 'Cargo automático', otro: 'Otro',
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                        {!confirmada && <th className="py-2 px-4 w-10"></th>}
                        <th className="py-2 px-4 text-left">Fecha</th>
                        <th className="py-2 px-4 text-left">Tipo</th>
                        <th className="py-2 px-4 text-left">Descripción</th>
                        <th className="py-2 px-4 text-left">Origen</th>
                        <th className="py-2 px-4 text-right">Débito</th>
                        <th className="py-2 px-4 text-right">Crédito</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map(m => (
                        <tr key={m.id} className={cn('border-b border-slate-100 hover:bg-slate-50',
                            m.conciliado && 'bg-green-50/30')}>
                            {!confirmada && (
                                <td className="py-2.5 px-4">
                                    <input type="checkbox" className="w-4 h-4 accent-primary-600"
                                        checked={m.conciliado}
                                        onChange={() => onToggle?.(m)} />
                                </td>
                            )}
                            <td className="py-2.5 px-4 text-xs text-slate-500">{formatFecha(m.fecha)}</td>
                            <td className="py-2.5 px-4">
                                <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                                    {TIPO_LABELS[m.tipo] ?? m.tipo}
                                </span>
                            </td>
                            <td className="py-2.5 px-4 text-slate-700">{m.descripcion ?? m.referencia ?? '—'}</td>
                            <td className="py-2.5 px-4 text-xs text-slate-400 capitalize">{m.origen}</td>
                            <td className="py-2.5 px-4 text-right text-red-600">
                                {m.sentido === 'debito' ? formatMoneda(m.monto) : '—'}
                            </td>
                            <td className="py-2.5 px-4 text-right text-green-600">
                                {m.sentido === 'credito' ? formatMoneda(m.monto) : '—'}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}





