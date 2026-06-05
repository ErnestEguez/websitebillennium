import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { GitMerge, Plus, Loader2, AlertCircle, X, CheckCircle2, Clock } from 'lucide-react'
import { useAuth } from '../../../contexts/AuthContext'
import { conciliacionService } from "../../../services/finance/conciliacionService"
import { cuentasBancariasService } from '../../../services/finance/bancosService'
import { cn, formatFecha, formatMoneda, mesNombre } from '../../../lib/utils'
import type { Conciliacion, CuentaBancaria } from '../../../types/finance'

export function ConciliacionesPage() {
    const { empresa } = useAuth()
    const navigate = useNavigate()

    const [lista, setLista]     = useState<Conciliacion[]>([])
    const [cuentas, setCuentas] = useState<CuentaBancaria[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError]     = useState('')
    const [cuentaFiltro, setCuentaFiltro] = useState('')

    const [modal, setModal]   = useState(false)
    const [saving, setSaving] = useState(false)
    const [form, setForm]     = useState({
        cuenta_bancaria_id: '',
        periodo_año: new Date().getFullYear(),
        periodo_mes: new Date().getMonth() + 1,
    })

    useEffect(() => {
        if (!empresa?.id) { setLoading(false); return }
        Promise.all([
            conciliacionService.listar(empresa.id),
            cuentasBancariasService.listar(empresa.id),
        ]).then(([c, b]) => {
            setLista(c)
            setCuentas(b.filter(x => x.estado === 'activa' && x.participa_conciliacion))
        }).catch(() => {}).finally(() => setLoading(false))
    }, [empresa?.id])

    async function recargar() {
        if (!empresa?.id) return
        setLista(await conciliacionService.listar(empresa.id, cuentaFiltro || undefined))
    }

    useEffect(() => { if (empresa?.id) recargar() }, [cuentaFiltro])

    async function crear() {
        if (!form.cuenta_bancaria_id) { setError('Selecciona una cuenta bancaria'); return }
        setSaving(true); setError('')
        const primerDia = `${form.periodo_año}-${String(form.periodo_mes).padStart(2, '0')}-01`
        const ultimoDia = new Date(form.periodo_año, form.periodo_mes, 0).toISOString().slice(0, 10)
        try {
            const c = await conciliacionService.crear({
                empresa_id:         empresa!.id,
                cuenta_bancaria_id: form.cuenta_bancaria_id,
                periodo_año:        form.periodo_año,
                periodo_mes:        form.periodo_mes,
                fecha_inicio:       primerDia,
                fecha_fin:          ultimoDia,
                saldo_segun_banco:  0,
                saldo_segun_libros: 0,
                estado:             'borrador',
                notas:              null,
                created_by:         null,
            })
            setModal(false)
            navigate(`/conciliacion/${c.id}`)
        } catch (e: unknown) { setError(String(e)) }
        finally { setSaving(false) }
    }

    const meses = Array.from({ length: 12 }, (_, i) => i + 1)
    const años  = [new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1]

    return (
        <div className="space-y-5 max-w-6xl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Conciliación Bancaria</h1>
                    <p className="text-slate-500 text-sm mt-0.5">{lista.length} conciliación{lista.length !== 1 ? 'es' : ''}</p>
                </div>
                <button onClick={() => { setModal(true); setError('') }} className="btn btn-primary gap-2">
                    <Plus className="w-4 h-4" />Nueva conciliación
                </button>
            </div>

            {error && !modal && (
                <div className="card px-4 py-3 bg-red-50 border-red-200 text-red-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" /><span className="flex-1">{error}</span>
                    <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
                </div>
            )}

            <div className="card p-4 flex gap-3">
                <div>
                    <label className="label">Cuenta bancaria</label>
                    <select className="input" value={cuentaFiltro} onChange={e => setCuentaFiltro(e.target.value)}>
                        <option value="">Todas</option>
                        {cuentas.map(c => <option key={c.id} value={c.id}>{c.banco?.nombre} — {c.numero_cuenta}</option>)}
                    </select>
                </div>
            </div>

            <div className="card overflow-hidden">
                <div className="bg-slate-700 px-5 py-3 text-white text-sm font-bold flex items-center gap-2">
                    <GitMerge className="w-4 h-4" />Conciliaciones ({lista.length})
                </div>
                {loading ? (
                    <div className="py-12 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando...</div>
                ) : lista.length === 0 ? (
                    <div className="py-12 text-center text-slate-400">
                        <GitMerge className="w-10 h-10 mx-auto mb-2 opacity-20" />
                        <p>No hay conciliaciones registradas</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                                    <th className="py-2 px-4 text-left">Cuenta</th>
                                    <th className="py-2 px-4 text-left">Período</th>
                                    <th className="py-2 px-4 text-left">Fechas</th>
                                    <th className="py-2 px-4 text-right">Saldo Banco</th>
                                    <th className="py-2 px-4 text-right">Saldo Libros</th>
                                    <th className="py-2 px-4 text-center">Diferencia</th>
                                    <th className="py-2 px-4 text-center">Estado</th>
                                    <th className="py-2 px-4 text-center">Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lista.map(c => {
                                    const dif = c.saldo_segun_banco - c.saldo_segun_libros
                                    return (
                                        <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                                            <td className="py-2.5 px-4">
                                                <p className="font-semibold text-slate-800">{c.cuenta_bancaria?.banco?.nombre}</p>
                                                <p className="text-xs font-mono text-slate-500">{c.cuenta_bancaria?.numero_cuenta}</p>
                                            </td>
                                            <td className="py-2.5 px-4 font-semibold">
                                                {mesNombre(c.periodo_mes)} {c.periodo_año}
                                            </td>
                                            <td className="py-2.5 px-4 text-xs text-slate-500">
                                                {formatFecha(c.fecha_inicio)} — {formatFecha(c.fecha_fin)}
                                            </td>
                                            <td className="py-2.5 px-4 text-right">{formatMoneda(c.saldo_segun_banco)}</td>
                                            <td className="py-2.5 px-4 text-right">{formatMoneda(c.saldo_segun_libros)}</td>
                                            <td className="py-2.5 px-4 text-center">
                                                <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full',
                                                    Math.abs(dif) < 0.01 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                                                    {formatMoneda(Math.abs(dif))}
                                                </span>
                                            </td>
                                            <td className="py-2.5 px-4 text-center">
                                                {c.estado === 'confirmada' ? (
                                                    <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                                                        <CheckCircle2 className="w-3 h-3" />Confirmada
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                                                        <Clock className="w-3 h-3" />Borrador
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-2.5 px-4 text-center">
                                                <button onClick={() => navigate(`/conciliacion/${c.id}`)}
                                                    className="text-xs text-primary-600 hover:underline font-semibold">
                                                    {c.estado === 'confirmada' ? 'Ver' : 'Abrir'}
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {modal && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="flex items-center justify-between px-6 py-4 border-b">
                            <h2 className="font-bold text-slate-900">Nueva Conciliación</h2>
                            <button onClick={() => setModal(false)}><X className="w-5 h-5 text-slate-400" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            {error && <p className="text-red-600 text-sm">{error}</p>}
                            <div>
                                <label className="label">Cuenta bancaria *</label>
                                <select className="input" value={form.cuenta_bancaria_id}
                                    onChange={e => setForm(f => ({ ...f, cuenta_bancaria_id: e.target.value }))}>
                                    <option value="">Seleccionar...</option>
                                    {cuentas.map(c => (
                                        <option key={c.id} value={c.id}>{c.banco?.nombre} — {c.numero_cuenta}</option>
                                    ))}
                                </select>
                                {cuentas.length === 0 && (
                                    <p className="text-xs text-amber-600 mt-1">No hay cuentas activas con conciliación habilitada.</p>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="label">Año *</label>
                                    <select className="input" value={form.periodo_año}
                                        onChange={e => setForm(f => ({ ...f, periodo_año: parseInt(e.target.value) }))}>
                                        {años.map(a => <option key={a} value={a}>{a}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="label">Mes *</label>
                                    <select className="input" value={form.periodo_mes}
                                        onChange={e => setForm(f => ({ ...f, periodo_mes: parseInt(e.target.value) }))}>
                                        {meses.map(m => <option key={m} value={m}>{mesNombre(m)}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t bg-slate-50 rounded-b-2xl">
                            <button onClick={() => setModal(false)} className="btn btn-secondary">Cancelar</button>
                            <button onClick={crear} disabled={saving} className="btn btn-primary gap-2">
                                {saving && <Loader2 className="w-4 h-4 animate-spin" />}Crear conciliación
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}





