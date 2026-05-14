import { useEffect, useState } from 'react'
import { Shield, Building2, Users, Plus, Trash2, Loader2, CheckCircle, AlertCircle, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { cn } from '../../lib/utils'
import type { LpEmpresa, LpMoneda } from '../../types/conta'

// ── Tipos ──────────────────────────────────────────────────────────────────

interface QIEmpresa  { id: string; ruc: string; nombre: string }
interface QIUsuario  { id: string; email: string; nombre: string; created_at: string }
interface Asignacion { id: string; user_id: string; empresa_id: string; rol: string; activo: boolean }

const ROLES = [
    { value: 'admin_conta', label: 'Admin Contable' },
    { value: 'contador',    label: 'Contador' },
    { value: 'auxiliar',    label: 'Auxiliar' },
]

// ── Componente ─────────────────────────────────────────────────────────────

export function AdminPage() {
    const { user } = useAuth()

    const ADMIN_EMAILS = ['admin@billenniumsystem.com', 'billenniumsystem@gmail.com', 'admin@billennium.com']
    // Guard: solo admin
    if (!user?.email || !ADMIN_EMAILS.includes(user.email)) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
                <Shield className="w-12 h-12 text-red-300" />
                <h2 className="text-lg font-bold text-slate-900">Acceso restringido</h2>
                <p className="text-slate-500 text-sm">Solo el administrador puede acceder a esta sección.</p>
            </div>
        )
    }

    const [tab, setTab] = useState<'empresas' | 'usuarios'>('empresas')

    // ── Datos ──────────────────────────────────────────────────────────────
    const [qiEmpresas, setQIEmpresas]   = useState<QIEmpresa[]>([])
    const [lpEmpresas, setLPEmpresas]   = useState<LpEmpresa[]>([])
    const [monedas, setMonedas]         = useState<LpMoneda[]>([])
    const [usuarios, setUsuarios]       = useState<QIUsuario[]>([])
    const [asignaciones, setAsignaciones] = useState<Asignacion[]>([])
    const [cargando, setCargando]       = useState(true)
    const [error, setError]             = useState('')

    // ── Modal crear empresa ────────────────────────────────────────────────
    const [showModalEmp, setShowModalEmp] = useState(false)
    const [qiSelId, setQiSelId]           = useState('')
    const [fNombre, setFNombre]           = useState('')
    const [fRazonSocial, setFRazonSocial] = useState('')
    const [fRuc, setFRuc]                 = useState('')
    const [fMonedaId, setFMonedaId]       = useState('')
    const [guardandoEmp, setGuardandoEmp] = useState(false)

    // ── Modal asignar usuario ──────────────────────────────────────────────
    const [showModalUser, setShowModalUser] = useState(false)
    const [asigUserId, setAsigUserId]       = useState('')
    const [asigEmpId, setAsigEmpId]         = useState('')
    const [asigRol, setAsigRol]             = useState('contador')
    const [guardandoUser, setGuardandoUser] = useState(false)

    const [ok, setOk] = useState('')

    // ── Carga inicial ──────────────────────────────────────────────────────

    useEffect(() => { cargarTodo() }, [])

    async function cargarTodo() {
        setCargando(true)
        setError('')
        const [
            { data: qi,   error: e1 },
            { data: lp,   error: e2 },
            { data: mon,  error: e3 },
            { data: usr,  error: e4 },
            { data: asig, error: e5 },
        ] = await Promise.all([
            supabase.rpc('lp_admin_get_qi_empresas'),
            supabase.from('lp_empresas').select('*, moneda:lp_monedas(*)').order('nombre'),
            supabase.from('lp_monedas').select('*').eq('activa', true).order('codigo'),
            supabase.rpc('lp_admin_get_usuarios'),
            supabase.from('lp_usuarios_empresa').select('*'),
        ])
        const err = e1 || e2 || e3 || e4 || e5
        if (err) setError(err.message)
        setQIEmpresas((qi  as any[]) ?? [])
        setLPEmpresas((lp  as any[]) ?? [])
        setMonedas((mon   as any[]) ?? [])
        setUsuarios((usr  as any[]) ?? [])
        setAsignaciones((asig as any[]) ?? [])
        if (!fMonedaId && mon?.length) {
            const usd = (mon as any[]).find(m => m.codigo === 'USD')
            setFMonedaId(usd?.id ?? mon[0].id)
        }
        setCargando(false)
    }

    // ── Al seleccionar empresa QI, pre-llenar formulario ──────────────────

    function onQIEmpresaChange(qiId: string) {
        setQiSelId(qiId)
        const emp = qiEmpresas.find(e => e.id === qiId)
        if (emp) { setFNombre(emp.nombre); setFRazonSocial(emp.nombre); setFRuc(emp.ruc) }
        else     { setFNombre(''); setFRazonSocial(''); setFRuc('') }
    }

    // ── Crear empresa LP ───────────────────────────────────────────────────

    async function crearEmpresa() {
        if (!fNombre || !fRuc || !fMonedaId) return
        setGuardandoEmp(true)
        setError('')
        try {
            const qiEmp   = qiEmpresas.find(e => e.id === qiSelId)
            const nuevaId = crypto.randomUUID()

            const { error: e } = await supabase.from('lp_empresas').insert({
                id:            nuevaId,
                nombre:        fNombre,
                razon_social:  fRazonSocial || fNombre,
                ruc:           fRuc,
                moneda_id:     fMonedaId,
                qi_empresa_id: qiEmp?.id ?? null,
                activa:        true,
            })
            if (e) throw new Error('Error al crear empresa: ' + e.message)

            const { error: e2 } = await supabase.from('lp_usuarios_empresa').insert({
                user_id:    user!.id,
                empresa_id: nuevaId,
                rol:        'admin_conta',
                activo:     true,
            })
            if (e2) throw new Error('Error al asignar admin: ' + e2.message)

            setShowModalEmp(false)
            setFNombre(''); setFRazonSocial(''); setFRuc(''); setQiSelId('')
            flash('Empresa creada correctamente')
            await cargarTodo()
        } catch (err: any) {
            setError(err.message || 'Error desconocido al crear empresa')
        } finally {
            setGuardandoEmp(false)
        }
    }

    // ── Asignar usuario a empresa LP ──────────────────────────────────────

    async function asignarUsuario() {
        if (!asigUserId || !asigEmpId) return
        setGuardandoUser(true)
        // Evitar duplicado
        const existe = asignaciones.find(a => a.user_id === asigUserId && a.empresa_id === asigEmpId)
        if (existe) {
            // Si existe pero inactivo, reactivar
            if (!existe.activo) {
                await supabase.from('lp_usuarios_empresa')
                    .update({ activo: true, rol: asigRol })
                    .eq('id', existe.id)
            } else {
                setError('El usuario ya tiene acceso a esa empresa.')
                setGuardandoUser(false); return
            }
        } else {
            const { error: e } = await supabase.from('lp_usuarios_empresa').insert({
                user_id:    asigUserId,
                empresa_id: asigEmpId,
                rol:        asigRol,
                activo:     true,
            })
            if (e) { setError(e.message); setGuardandoUser(false); return }
        }
        setShowModalUser(false)
        setAsigUserId(''); setAsigEmpId(''); setAsigRol('contador')
        flash('Acceso asignado correctamente')
        await cargarTodo()
        setGuardandoUser(false)
    }

    // ── Quitar acceso ─────────────────────────────────────────────────────

    async function quitarAcceso(asigId: string) {
        const { error: e } = await supabase.from('lp_usuarios_empresa')
            .update({ activo: false })
            .eq('id', asigId)
        if (e) { setError(e.message); return }
        flash('Acceso revocado')
        await cargarTodo()
    }

    function flash(msg: string) { setOk(msg); setTimeout(() => setOk(''), 3000) }

    // ── Helpers ────────────────────────────────────────────────────────────

    function emailDeUsuario(uid: string) {
        return usuarios.find(u => u.id === uid)?.email ?? uid
    }
    function nombreEmpresa(eid: string) {
        return lpEmpresas.find(e => e.id === eid)?.nombre ?? eid
    }
    function asignacionesDeUsuario(uid: string) {
        return asignaciones.filter(a => a.user_id === uid && a.activo)
    }
    function asignacionesDeEmpresa(eid: string) {
        return asignaciones.filter(a => a.empresa_id === eid && a.activo)
    }

    // ── Render ─────────────────────────────────────────────────────────────

    if (cargando) return (
        <div className="flex items-center justify-center py-24 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando panel de administración...
        </div>
    )

    return (
        <div className="space-y-5 max-w-5xl">
            <div className="flex items-center gap-3">
                <Shield className="w-7 h-7 text-primary-600" />
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Administración</h1>
                    <p className="text-slate-500 text-sm">Gestión de empresas y usuarios de Ledger Pro</p>
                </div>
            </div>

            {/* Alertas */}
            {error && (
                <div className="card px-5 py-3 bg-red-50 border-red-200 text-red-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{error}</span>
                    <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
                </div>
            )}
            {ok && (
                <div className="card px-5 py-3 bg-green-50 border-green-200 text-green-700 text-sm flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" /> {ok}
                </div>
            )}

            {/* Tabs */}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm w-fit">
                {([
                    ['empresas', 'Empresas',  Building2],
                    ['usuarios', 'Usuarios',  Users],
                ] as const).map(([id, label, Icon]) => (
                    <button key={id} type="button" onClick={() => setTab(id)}
                        className={cn('flex items-center gap-2 px-5 py-2.5 border-l border-slate-200 first:border-l-0',
                            tab === id ? 'bg-primary-600 text-white font-medium' : 'bg-white text-slate-600 hover:bg-slate-50')}>
                        <Icon className="w-4 h-4" /> {label}
                    </button>
                ))}
            </div>

            {/* ══════════════════════════════ Tab: Empresas ══════════════════════════════ */}
            {tab === 'empresas' && (
                <div className="space-y-4">
                    {/* QI Empresas (referencia) */}
                    <div className="card p-5">
                        <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wide mb-3 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-400 inline-block"></span>
                            Empresas en QuickInvoice ({qiEmpresas.length})
                        </h2>
                        {qiEmpresas.length === 0 ? (
                            <p className="text-slate-400 text-sm">Sin empresas en QuickInvoice.</p>
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-xs text-slate-400 uppercase tracking-wide border-b">
                                        <th className="text-left py-2">Nombre</th>
                                        <th className="text-left py-2">RUC</th>
                                        <th className="text-center py-2">En Ledger Pro</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {qiEmpresas.map(qi => {
                                        const tieneLP = lpEmpresas.some(lp => lp.ruc === qi.ruc)
                                        return (
                                            <tr key={qi.id} className="border-b border-slate-50">
                                                <td className="py-2 text-slate-700 font-medium">{qi.nombre}</td>
                                                <td className="py-2 text-slate-500 font-mono text-xs">{qi.ruc}</td>
                                                <td className="py-2 text-center">
                                                    {tieneLP
                                                        ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✓ Vinculada</span>
                                                        : <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Sin LP</span>
                                                    }
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* LP Empresas */}
                    <div className="card p-5">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wide flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-primary-500 inline-block"></span>
                                Empresas en Ledger Pro ({lpEmpresas.length})
                            </h2>
                            <button onClick={() => setShowModalEmp(true)} className="btn btn-primary gap-2 text-sm">
                                <Plus className="w-4 h-4" /> Nueva empresa LP
                            </button>
                        </div>
                        {lpEmpresas.length === 0 ? (
                            <p className="text-slate-400 text-sm">Sin empresas en Ledger Pro. Crea la primera usando el botón.</p>
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-xs text-slate-400 uppercase tracking-wide border-b">
                                        <th className="text-left py-2">Nombre</th>
                                        <th className="text-left py-2">RUC</th>
                                        <th className="text-left py-2">Moneda</th>
                                        <th className="text-left py-2">Usuarios asignados</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lpEmpresas.map(lp => {
                                        const asigs = asignacionesDeEmpresa(lp.id)
                                        return (
                                            <tr key={lp.id} className="border-b border-slate-50">
                                                <td className="py-2 text-slate-700 font-medium">{lp.nombre}</td>
                                                <td className="py-2 text-slate-500 font-mono text-xs">{lp.ruc}</td>
                                                <td className="py-2 text-slate-500 text-xs">{(lp as any).moneda?.codigo ?? '—'}</td>
                                                <td className="py-2">
                                                    {asigs.length === 0
                                                        ? <span className="text-slate-400 text-xs">Sin usuarios</span>
                                                        : <div className="flex flex-wrap gap-1">
                                                            {asigs.map(a => (
                                                                <span key={a.id} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                                                                    {emailDeUsuario(a.user_id)}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    }
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* ══════════════════════════════ Tab: Usuarios ══════════════════════════════ */}
            {tab === 'usuarios' && (
                <div className="card p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">
                            Usuarios del sistema ({usuarios.length})
                        </h2>
                        <button onClick={() => setShowModalUser(true)} className="btn btn-primary gap-2 text-sm">
                            <Plus className="w-4 h-4" /> Asignar empresa
                        </button>
                    </div>

                    <div className="space-y-3">
                        {usuarios.map(usr => {
                            const asigs = asignacionesDeUsuario(usr.id)
                            return (
                                <div key={usr.id} className="border border-slate-200 rounded-lg p-4">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="font-medium text-slate-800 text-sm">{usr.email}</p>
                                            {usr.nombre !== usr.email && (
                                                <p className="text-xs text-slate-500">{usr.nombre}</p>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => { setAsigUserId(usr.id); setShowModalUser(true) }}
                                            className="btn text-xs gap-1 border border-slate-200 text-slate-600 hover:bg-slate-50 shrink-0">
                                            <Plus className="w-3 h-3" /> Asignar empresa
                                        </button>
                                    </div>

                                    {/* Empresas asignadas */}
                                    {asigs.length === 0 ? (
                                        <p className="text-xs text-slate-400 mt-2">Sin acceso a ninguna empresa LP</p>
                                    ) : (
                                        <div className="mt-3 space-y-1.5">
                                            {asigs.map(a => (
                                                <div key={a.id}
                                                    className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-1.5">
                                                    <div className="flex items-center gap-2">
                                                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                                        <span className="text-xs text-slate-700 font-medium">
                                                            {nombreEmpresa(a.empresa_id)}
                                                        </span>
                                                        <span className="text-xs bg-primary-100 text-primary-700 px-1.5 py-0.5 rounded font-medium">
                                                            {ROLES.find(r => r.value === a.rol)?.label ?? a.rol}
                                                        </span>
                                                    </div>
                                                    <button
                                                        onClick={() => quitarAcceso(a.id)}
                                                        className="text-slate-400 hover:text-red-500 transition-colors"
                                                        title="Quitar acceso">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}

            {/* ══════════════════ Modal: Crear empresa LP ══════════════════ */}
            {showModalEmp && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-slate-900">Nueva empresa en Ledger Pro</h3>
                            <button onClick={() => setShowModalEmp(false)}>
                                <X className="w-5 h-5 text-slate-400 hover:text-slate-600" />
                            </button>
                        </div>

                        {/* Enlazar con empresa QI */}
                        <div>
                            <label className="label">
                                Empresa QuickInvoice (para pre-llenar datos)
                                <span className="text-slate-400 text-xs ml-1">(opcional)</span>
                            </label>
                            <select className="input w-full" value={qiSelId}
                                onChange={e => onQIEmpresaChange(e.target.value)}>
                                <option value="">— Ingresar datos manualmente —</option>
                                {qiEmpresas
                                    .filter(qi => !lpEmpresas.some(lp => lp.ruc === qi.ruc))
                                    .map(qi => (
                                        <option key={qi.id} value={qi.id}>
                                            {qi.nombre} ({qi.ruc})
                                        </option>
                                    ))}
                            </select>
                            {qiSelId && (
                                <p className="text-xs text-green-600 mt-1">
                                    ✓ El RUC coincide — la integración QuickInvoice funcionará automáticamente.
                                </p>
                            )}
                        </div>

                        <div>
                            <label className="label">Nombre comercial <span className="text-red-500">*</span></label>
                            <input className="input w-full" value={fNombre}
                                onChange={e => setFNombre(e.target.value)}
                                placeholder="Ej: Ferre+" />
                        </div>

                        <div>
                            <label className="label">Razón social</label>
                            <input className="input w-full" value={fRazonSocial}
                                onChange={e => setFRazonSocial(e.target.value)}
                                placeholder="Razón social completa" />
                        </div>

                        <div>
                            <label className="label">RUC <span className="text-red-500">*</span></label>
                            <input className="input w-full font-mono" value={fRuc}
                                onChange={e => setFRuc(e.target.value)}
                                placeholder="0000000000001" />
                        </div>

                        <div>
                            <label className="label">Moneda <span className="text-red-500">*</span></label>
                            <select className="input w-full" value={fMonedaId}
                                onChange={e => setFMonedaId(e.target.value)}>
                                <option value="">Seleccionar...</option>
                                {monedas.map(m => (
                                    <option key={m.id} value={m.id}>
                                        {m.codigo} — {m.nombre}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button onClick={crearEmpresa}
                                disabled={guardandoEmp || !fNombre || !fRuc || !fMonedaId}
                                className="btn btn-primary flex-1 gap-2">
                                {guardandoEmp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                                Crear empresa
                            </button>
                            <button onClick={() => setShowModalEmp(false)}
                                className="btn border border-slate-200 text-slate-600">
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════ Modal: Asignar usuario ══════════════════ */}
            {showModalUser && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-slate-900">Asignar usuario a empresa LP</h3>
                            <button onClick={() => { setShowModalUser(false); setAsigUserId('') }}>
                                <X className="w-5 h-5 text-slate-400 hover:text-slate-600" />
                            </button>
                        </div>

                        <div>
                            <label className="label">Usuario <span className="text-red-500">*</span></label>
                            <select className="input w-full" value={asigUserId}
                                onChange={e => setAsigUserId(e.target.value)}>
                                <option value="">Seleccionar usuario...</option>
                                {usuarios.map(u => (
                                    <option key={u.id} value={u.id}>{u.email}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="label">Empresa Ledger Pro <span className="text-red-500">*</span></label>
                            <select className="input w-full" value={asigEmpId}
                                onChange={e => setAsigEmpId(e.target.value)}>
                                <option value="">Seleccionar empresa...</option>
                                {lpEmpresas.map(e => (
                                    <option key={e.id} value={e.id}>{e.nombre} — {e.ruc}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="label">Rol</label>
                            <select className="input w-full" value={asigRol}
                                onChange={e => setAsigRol(e.target.value)}>
                                {ROLES.map(r => (
                                    <option key={r.value} value={r.value}>{r.label}</option>
                                ))}
                            </select>
                        </div>

                        {/* Resumen de accesos actuales del usuario seleccionado */}
                        {asigUserId && asignacionesDeUsuario(asigUserId).length > 0 && (
                            <div className="bg-slate-50 rounded-lg p-3">
                                <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Accesos actuales</p>
                                {asignacionesDeUsuario(asigUserId).map(a => (
                                    <p key={a.id} className="text-xs text-slate-600">
                                        • {nombreEmpresa(a.empresa_id)} —{' '}
                                        {ROLES.find(r => r.value === a.rol)?.label}
                                    </p>
                                ))}
                            </div>
                        )}

                        <div className="flex gap-3 pt-2">
                            <button onClick={asignarUsuario}
                                disabled={guardandoUser || !asigUserId || !asigEmpId}
                                className="btn btn-primary flex-1 gap-2">
                                {guardandoUser ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                                Asignar acceso
                            </button>
                            <button onClick={() => { setShowModalUser(false); setAsigUserId('') }}
                                className="btn border border-slate-200 text-slate-600">
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
