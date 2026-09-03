import { useState } from 'react'
import {
    X, Trash2, AlertTriangle, CheckCircle, Loader2, Lock, ShieldAlert,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { cn, formatCurrency } from '../../lib/utils'

// ============================================================
// Corrige errores de digitación en cartera migrada (origen='MIGRACION')
// sin exponer un botón de eliminar deudas a los usuarios de la
// empresa: hay que escribir usuario/contraseña de una cuenta
// admin_plataforma para desbloquear la lista, y esa verificación pasa
// por la Edge Function admin-mantenimiento-cartera (nunca se guarda
// una sesión de superadmin en este navegador). Al cerrar el modal se
// pierde todo — hay que volver a escribir las credenciales la próxima vez.
// ============================================================

interface FilaCartera {
    id: string
    cliente_nombre: string
    cliente_identificacion: string
    numero_documento_externo: string | null
    fecha_emision: string
    valor_original: number
    saldo: number
    estado: string
    bloqueado: boolean
}

interface Props {
    empresaId: string
    empresaNombre: string
    onClose: () => void
}

export function MantenimientoCarteraModal({ empresaId, empresaNombre, onClose }: Props) {
    const [paso, setPaso] = useState<'login' | 'lista' | 'confirmar' | 'listo'>('login')

    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [cargando, setCargando] = useState(false)
    const [error, setError] = useState('')

    const [filas, setFilas] = useState<FilaCartera[]>([])
    const [seleccion, setSeleccion] = useState<Record<string, boolean>>({})

    const [confirmText, setConfirmText] = useState('')
    const [ejecutando, setEjecutando] = useState(false)
    const [log, setLog] = useState<{ id: string; label: string; ok: boolean; msg: string }[]>([])

    async function ingresar() {
        if (!email.trim() || !password) return
        setCargando(true); setError('')
        try {
            const { data, error: fnError } = await supabase.functions.invoke('admin-mantenimiento-cartera', {
                body: { email: email.trim(), password, empresa_id: empresaId, action: 'listar' },
            })
            if (fnError) throw fnError
            if (data?.error) { setPassword(''); setError(data.error); return }
            setFilas(data.filas ?? [])
            setSeleccion({})
            setPaso('lista')
        } catch (e: any) {
            setPassword('')
            setError(e.message ?? 'Error de conexión')
        } finally {
            setCargando(false)
        }
    }

    function toggle(id: string, bloqueado: boolean) {
        if (bloqueado) return
        setSeleccion(prev => ({ ...prev, [id]: !prev[id] }))
    }

    const seleccionados = filas.filter(f => seleccion[f.id] && !f.bloqueado)
    const confirmacionEsperada = `ELIMINAR ${empresaNombre.toUpperCase()}`
    const confirmacionOk = confirmText.trim().toUpperCase() === confirmacionEsperada

    async function ejecutar() {
        if (seleccionados.length === 0) return
        setEjecutando(true); setLog([]); setError('')
        try {
            const { data, error: fnError } = await supabase.functions.invoke('admin-mantenimiento-cartera', {
                body: {
                    email: email.trim(), password, empresa_id: empresaId,
                    action: 'eliminar', ids: seleccionados.map(f => f.id),
                },
            })
            if (fnError) throw fnError
            if (data?.error) { setError(data.error); return }
            setLog(data.resultados ?? [])
            setPaso('listo')
        } catch (e: any) {
            setError(e.message ?? 'Error de conexión')
        } finally {
            setEjecutando(false)
        }
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between p-5 border-b">
                    <h2 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                        <ShieldAlert className="w-5 h-5 text-amber-600" /> Mantenimiento de Cartera Migrada
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                </div>

                <div className="p-5 space-y-4">
                    {error && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>
                    )}

                    {paso === 'login' && (
                        <>
                            <p className="text-sm text-slate-500">
                                Escribe usuario y contraseña de una cuenta de superadministrador para desbloquear la lista de <strong>{empresaNombre}</strong>.
                                Al cerrar este modal se olvida — hay que volver a escribirlas la próxima vez.
                            </p>
                            <div className="space-y-3">
                                <div>
                                    <label className="label text-xs">Usuario (correo)</label>
                                    <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && ingresar()} autoFocus />
                                </div>
                                <div>
                                    <label className="label text-xs">Contraseña</label>
                                    <input type="password" className="input" value={password} onChange={e => setPassword(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && ingresar()} />
                                </div>
                            </div>
                            <button onClick={ingresar} disabled={cargando || !email.trim() || !password}
                                className="btn btn-primary gap-2 w-full disabled:opacity-50">
                                {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                                Desbloquear
                            </button>
                        </>
                    )}

                    {paso === 'lista' && (
                        <>
                            {filas.length === 0 ? (
                                <div className="py-10 text-center text-slate-400 text-sm">
                                    Sin registros de cartera migrada (origen "Migración") para esta empresa.
                                </div>
                            ) : (
                                <div className="overflow-x-auto rounded-xl border border-slate-200">
                                    <table className="w-full text-xs">
                                        <thead className="bg-slate-50 text-slate-500 uppercase">
                                            <tr>
                                                <th className="px-3 py-2 w-8"></th>
                                                <th className="px-3 py-2 text-left">Cliente</th>
                                                <th className="px-3 py-2 text-left">N° Documento</th>
                                                <th className="px-3 py-2 text-left">Fecha</th>
                                                <th className="px-3 py-2 text-right">Saldo</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filas.map(f => (
                                                <tr key={f.id} className={cn('border-t border-slate-100', f.bloqueado ? 'bg-slate-50 opacity-60' : seleccion[f.id] && 'bg-red-50')}>
                                                    <td className="px-3 py-2 text-center">
                                                        {f.bloqueado ? (
                                                            <span title="Tiene pagos o notas de crédito aplicadas — no se puede eliminar">
                                                                <Lock className="w-3.5 h-3.5 text-slate-300 inline" />
                                                            </span>
                                                        ) : (
                                                            <input type="checkbox" checked={!!seleccion[f.id]} onChange={() => toggle(f.id, f.bloqueado)}
                                                                className="accent-red-600 w-3.5 h-3.5" />
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <div className="font-medium text-slate-700">{f.cliente_nombre}</div>
                                                        <div className="text-slate-400 font-mono">{f.cliente_identificacion}</div>
                                                    </td>
                                                    <td className="px-3 py-2 font-mono">{f.numero_documento_externo ?? '—'}</td>
                                                    <td className="px-3 py-2">{f.fecha_emision}</td>
                                                    <td className="px-3 py-2 text-right font-semibold">{formatCurrency(f.saldo)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            {seleccionados.length > 0 && (
                                <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
                                    <p className="text-sm text-red-700"><strong>{seleccionados.length}</strong> registro(s) seleccionado(s)</p>
                                    <button onClick={() => setPaso('confirmar')}
                                        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold">
                                        Continuar →
                                    </button>
                                </div>
                            )}
                        </>
                    )}

                    {paso === 'confirmar' && (
                        <>
                            <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4">
                                <div className="flex items-start gap-3">
                                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-bold text-red-800">⚠️ Acción irreversible</p>
                                        <p className="text-red-700 text-sm mt-1">
                                            Vas a eliminar <strong>{seleccionados.length}</strong> registro(s) de cartera migrada de <strong>{empresaNombre}</strong>.
                                        </p>
                                        <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                                            {seleccionados.map(f => (
                                                <div key={f.id} className="flex items-center gap-2 text-sm text-red-700">
                                                    <Trash2 className="w-3.5 h-3.5 shrink-0" />
                                                    <span>{f.cliente_nombre} — {f.numero_documento_externo ?? '—'} — {formatCurrency(f.saldo)}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">
                                    Para confirmar, escribe: <span className="font-mono text-red-600 ml-1">{confirmacionEsperada}</span>
                                </label>
                                <input type="text" className="input font-mono" value={confirmText} onChange={e => setConfirmText(e.target.value)} />
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => setPaso('lista')} className="px-4 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">Cancelar</button>
                                <button onClick={ejecutar} disabled={!confirmacionOk || ejecutando}
                                    className="flex items-center gap-2 px-5 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 font-semibold">
                                    {ejecutando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                    {ejecutando ? 'Eliminando...' : 'Ejecutar eliminación'}
                                </button>
                            </div>
                        </>
                    )}

                    {paso === 'listo' && (
                        <>
                            <p className="font-bold text-slate-800 flex items-center gap-2">
                                <CheckCircle className="w-5 h-5 text-emerald-600" /> Limpieza completada
                            </p>
                            <div className="space-y-2">
                                {log.map(l => (
                                    <div key={l.id} className={cn('flex items-center justify-between px-3 py-2 rounded-lg text-sm',
                                        l.ok ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200')}>
                                        <span className="font-medium">{l.label}</span>
                                        <span className={l.ok ? 'text-emerald-700 text-xs' : 'text-red-600 text-xs'}>{l.msg}</span>
                                    </div>
                                ))}
                            </div>
                            <button onClick={onClose} className="btn btn-primary w-full">Cerrar</button>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
