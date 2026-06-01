import { useEffect, useState } from 'react'
import { supabaseFacturacion as supabase } from '../../lib/supabaseFacturacion'
import { useAuth } from '../../contexts/AuthContext'
import {
    Users, Plus, Loader2, CheckCircle, AlertCircle,
    X, ShieldCheck,
} from 'lucide-react'
import { cn } from '../../lib/utils'

const PORTAL_API = import.meta.env.VITE_PORTAL_URL
    ? `${import.meta.env.VITE_PORTAL_URL}/api`
    : 'https://www.billenniumsystem.com/api'

interface PortalUser { id: string; name: string; email: string; company_name?: string }
interface Empresa     { id: string; nombre: string; ruc: string }
interface Profile     { id: string; nombre: string | null; email: string | null; rol: string; empresa_id: string | null; empresa?: { nombre: string } }

async function portalFetch(path: string, opts?: RequestInit) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Sin sesión activa')
    const res = await fetch(`${PORTAL_API}${path}`, {
        ...opts,
        headers: { 'X-Auth-Token': session.access_token, 'Content-Type': 'application/json', ...opts?.headers },
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.detail || 'Error en el servidor')
    return json
}

export function AdminPage() {
    const { profile } = useAuth()
    const [tab, setTab]               = useState<'usuarios' | 'perfiles'>('usuarios')

    // Usuarios disponibles para asignar
    const [disponibles, setDisponibles] = useState<PortalUser[]>([])
    const [empresas, setEmpresas]       = useState<Empresa[]>([])
    const [cargando, setCargando]       = useState(false)

    // Modal asignar
    const [modal, setModal]             = useState(false)
    const [selUser, setSelUser]         = useState<PortalUser | null>(null)
    const [empId, setEmpId]             = useState('')
    const [rol, setRol]                 = useState('contador')
    const [guardando, setGuardando]     = useState(false)
    const [ok, setOk]                   = useState('')
    const [error, setError]             = useState('')

    // Perfiles actuales
    const [perfiles, setPerfiles]       = useState<Profile[]>([])
    const [cargPerf, setCargPerf]       = useState(false)

    useEffect(() => { cargarDatos() }, [])

    async function cargarDatos() {
        setCargando(true)
        setError('')
        try {
            const [usrs, emps] = await Promise.all([
                portalFetch('/apps/finance/available-users'),
                portalFetch('/apps/finance/empresas'),
            ])
            setDisponibles(usrs)
            setEmpresas(emps)
        } catch (e: any) { setError(e.message) }
        finally { setCargando(false) }
    }

    async function cargarPerfiles() {
        setCargPerf(true)
        const { data } = await supabase
            .from('profiles')
            .select('id, nombre, email, rol, empresa_id, empresa:empresas(nombre)')
            .order('nombre')
        setPerfiles((data ?? []) as unknown as Profile[])
        setCargPerf(false)
    }

    useEffect(() => { if (tab === 'perfiles') cargarPerfiles() }, [tab])

    async function asignar() {
        if (!selUser || !empId) return
        setGuardando(true); setError(''); setOk('')
        try {
            const res = await portalFetch('/apps/finance/users', {
                method: 'POST',
                body: JSON.stringify({ portal_user_id: selUser.id, empresa_id: empId, rol }),
            })
            setOk(res.message)
            setModal(false)
            cargarDatos()
        } catch (e: any) { setError(e.message) }
        finally { setGuardando(false) }
    }

    if (!['admin', 'admin_plataforma', 'superadmin'].includes(profile?.rol ?? '')) {
        return (
            <div className="flex items-center justify-center py-24">
                <div className="text-center space-y-3">
                    <ShieldCheck className="w-12 h-12 text-slate-300 mx-auto" />
                    <p className="text-slate-500">Acceso restringido a administradores.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-5 max-w-5xl">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Administración — Finance Suite</h1>
                <p className="text-slate-500 text-sm mt-0.5">Gestión de accesos y empresas</p>
            </div>

            {error && (
                <div className="card px-4 py-3 bg-red-50 border-red-200 text-red-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" /><span className="flex-1">{error}</span>
                    <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
                </div>
            )}
            {ok && (
                <div className="card px-4 py-3 bg-green-50 border-green-200 text-green-700 text-sm flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />{ok}
                    <button onClick={() => setOk('')} className="ml-auto"><X className="w-4 h-4" /></button>
                </div>
            )}

            {/* Tabs */}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm w-fit">
                {([['usuarios', 'Usuarios pendientes', Users], ['perfiles', 'Perfiles activos', ShieldCheck]] as const).map(([id, label, Icon]) => (
                    <button key={id} onClick={() => setTab(id)}
                        className={cn('flex items-center gap-2 px-5 py-2.5 border-l first:border-0',
                            tab === id ? 'bg-primary-600 text-white font-medium' : 'bg-white text-slate-600 hover:bg-slate-50')}>
                        <Icon className="w-4 h-4" />{label}
                        {id === 'usuarios' && disponibles.length > 0 && (
                            <span className="bg-amber-400 text-white text-xs px-1.5 py-0.5 rounded-full font-bold">
                                {disponibles.length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Usuarios pendientes de asignar */}
            {tab === 'usuarios' && (
                <div className="card overflow-hidden">
                    <div className="bg-slate-700 px-5 py-3 text-white text-sm font-bold flex items-center justify-between">
                        <span>Usuarios con suscripción Finance Suite sin perfil asignado</span>
                        <button onClick={cargarDatos} disabled={cargando}
                            className="text-slate-300 hover:text-white text-xs">
                            {cargando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '↻ Actualizar'}
                        </button>
                    </div>
                    {cargando ? (
                        <div className="py-10 text-center text-slate-400">
                            <Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando usuarios...
                        </div>
                    ) : disponibles.length === 0 ? (
                        <div className="py-10 text-center text-slate-400">
                            <CheckCircle className="w-8 h-8 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">Todos los usuarios tienen perfil asignado.</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                                    <th className="py-2 px-4 text-left">Usuario</th>
                                    <th className="py-2 px-4 text-left">Email</th>
                                    <th className="py-2 px-4 text-left">Empresa Portal</th>
                                    <th className="py-2 px-4 text-center">Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {disponibles.map(u => (
                                    <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                                        <td className="py-3 px-4 font-medium text-slate-800">{u.name}</td>
                                        <td className="py-3 px-4 text-slate-600 text-xs font-mono">{u.email}</td>
                                        <td className="py-3 px-4 text-slate-500 text-xs">{u.company_name || '—'}</td>
                                        <td className="py-3 px-4 text-center">
                                            <button
                                                onClick={() => { setSelUser(u); setEmpId(''); setRol('contador'); setModal(true) }}
                                                className="btn btn-primary text-xs gap-1 py-1.5 px-3"
                                            >
                                                <Plus className="w-3.5 h-3.5" /> Asignar empresa
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Perfiles activos */}
            {tab === 'perfiles' && (
                <div className="card overflow-hidden">
                    <div className="bg-slate-700 px-5 py-3 text-white text-sm font-bold">
                        Perfiles activos en Finance Suite
                    </div>
                    {cargPerf ? (
                        <div className="py-10 text-center text-slate-400">
                            <Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando...
                        </div>
                    ) : perfiles.length === 0 ? (
                        <div className="py-10 text-center text-slate-400">Sin perfiles aún.</div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                                    <th className="py-2 px-4 text-left">Nombre</th>
                                    <th className="py-2 px-4 text-left">Email</th>
                                    <th className="py-2 px-4 text-left">Empresa</th>
                                    <th className="py-2 px-4 text-center">Rol</th>
                                </tr>
                            </thead>
                            <tbody>
                                {perfiles.map(p => (
                                    <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50">
                                        <td className="py-2.5 px-4 font-medium text-slate-800">{p.nombre || '—'}</td>
                                        <td className="py-2.5 px-4 text-xs font-mono text-slate-600">{p.email || '—'}</td>
                                        <td className="py-2.5 px-4 text-slate-600 text-xs">{(p.empresa as any)?.nombre || '—'}</td>
                                        <td className="py-2.5 px-4 text-center">
                                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                                                p.rol === 'admin' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700')}>
                                                {p.rol}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* Modal asignar empresa */}
            {modal && selUser && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-slate-900">Asignar empresa</h3>
                            <button onClick={() => setModal(false)}><X className="w-5 h-5 text-slate-400" /></button>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-3 text-sm">
                            <p className="font-semibold text-slate-800">{selUser.name}</p>
                            <p className="text-slate-500 font-mono text-xs mt-0.5">{selUser.email}</p>
                        </div>
                        <div>
                            <label className="label">Empresa *</label>
                            <select className="input" value={empId} onChange={e => setEmpId(e.target.value)}>
                                <option value="">Seleccionar empresa...</option>
                                {empresas.map(e => (
                                    <option key={e.id} value={e.id}>{e.nombre} — {e.ruc}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="label">Rol</label>
                            <select className="input" value={rol} onChange={e => setRol(e.target.value)}>
                                <option value="contador">Contador</option>
                                <option value="asistente_contable">Asistente Contable</option>
                            </select>
                        </div>
                        {error && <p className="text-red-600 text-xs">{error}</p>}
                        <div className="flex gap-3 pt-1">
                            <button onClick={asignar} disabled={guardando || !empId}
                                className="btn btn-primary flex-1 gap-2">
                                {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                                Crear perfil
                            </button>
                            <button onClick={() => setModal(false)} className="btn border border-slate-200 text-slate-600 px-4">
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
