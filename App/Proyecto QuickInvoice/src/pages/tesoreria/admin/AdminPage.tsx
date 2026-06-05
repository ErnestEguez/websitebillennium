import { useEffect, useState } from 'react'
import { supabaseFacturacion as supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import {
    Users, Loader2, CheckCircle, AlertCircle,
    X, ShieldCheck, UserPlus, Building2,
} from 'lucide-react'
import { cn } from '../../../lib/utils'

interface Empresa  { id: string; nombre: string; ruc: string }
interface Profile  { id: string; nombre: string | null; email: string | null; rol: string; empresa_id: string | null; empresa?: { nombre: string } }

const ROLES = [
    { value: 'contador',           label: 'Contador' },
    { value: 'asistente_contable', label: 'Asistente Contable' },
]

export function AdminPage() {
    const { profile } = useAuth()

    const [tab, setTab]           = useState<'vincular' | 'perfiles'>('vincular')
    const [empresas, setEmpresas] = useState<Empresa[]>([])
    const [perfiles, setPerfiles] = useState<Profile[]>([])
    const [cargando, setCargando] = useState(false)
    const [error, setError]       = useState('')
    const [ok, setOk]             = useState('')

    // Formulario vincular usuario
    const [email, setEmail]       = useState('')
    const [nombre, setNombre]     = useState('')
    const [empId, setEmpId]       = useState('')
    const [rol, setRol]           = useState('contador')
    const [guardando, setGuardando] = useState(false)

    const isAdmin = ['admin', 'admin_plataforma', 'superadmin'].includes(profile?.rol ?? '')

    useEffect(() => {
        cargarEmpresas()
    }, [])

    useEffect(() => {
        if (tab === 'perfiles') cargarPerfiles()
    }, [tab])

    async function cargarEmpresas() {
        const { data } = await supabase
            .from('empresas')
            .select('id, nombre, ruc')
            .order('nombre')
        setEmpresas(data ?? [])
    }

    async function cargarPerfiles() {
        setCargando(true)
        const { data } = await supabase
            .from('profiles')
            .select('id, nombre, email, rol, empresa_id, empresa:empresas(nombre)')
            .order('nombre')
        setPerfiles((data ?? []) as unknown as Profile[])
        setCargando(false)
    }

    async function vincularUsuario(e: React.FormEvent) {
        e.preventDefault()
        if (!email.trim()) { setError('El email es obligatorio'); return }
        if (!nombre.trim()) { setError('El nombre es obligatorio'); return }
        if (!empId)         { setError('Selecciona una empresa'); return }

        setGuardando(true); setError(''); setOk('')
        try {
            const { data, error: rpcErr } = await supabase.rpc('dar_acceso_portal', {
                p_email:      email.trim().toLowerCase(),
                p_empresa_id: empId,
                p_nombre:     nombre.trim(),
                p_rol:        rol,
            })
            if (rpcErr) throw rpcErr
            if (!(data as any)?.ok) throw new Error((data as any)?.error ?? 'Error desconocido')

            setOk(`Acceso creado correctamente para ${email}`)
            setEmail(''); setNombre(''); setEmpId(''); setRol('contador')
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : (err as any)?.message ?? JSON.stringify(err)
            setError(msg)
        } finally {
            setGuardando(false)
        }
    }

    if (!isAdmin) {
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
        <div className="space-y-5 max-w-4xl">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Administración — Finance Suite</h1>
                <p className="text-slate-500 text-sm mt-0.5">Gestión de accesos y usuarios</p>
            </div>

            {/* Alertas */}
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
                {([
                    ['vincular', 'Vincular usuario', UserPlus],
                    ['perfiles', 'Usuarios activos', Users],
                ] as const).map(([id, label, Icon]) => (
                    <button key={id} onClick={() => setTab(id)}
                        className={cn('flex items-center gap-2 px-5 py-2.5 border-l first:border-0',
                            tab === id ? 'bg-primary-600 text-white font-medium' : 'bg-white text-slate-600 hover:bg-slate-50')}>
                        <Icon className="w-4 h-4" />{label}
                    </button>
                ))}
            </div>

            {/* ── Tab: Vincular usuario ── */}
            {tab === 'vincular' && (
                <div className="card p-6 max-w-lg">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
                            <UserPlus className="w-5 h-5 text-primary-600" />
                        </div>
                        <div>
                            <h2 className="font-bold text-slate-900">Vincular usuario a empresa</h2>
                            <p className="text-xs text-slate-500 mt-0.5">El usuario debe estar registrado en el portal Billennium System</p>
                        </div>
                    </div>

                    <form onSubmit={vincularUsuario} className="space-y-4">
                        <div>
                            <label className="label">Email del usuario *</label>
                            <input
                                className="input"
                                type="email"
                                placeholder="usuario@empresa.com"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="label">Nombre completo *</label>
                            <input
                                className="input"
                                placeholder="Nombre del usuario"
                                value={nombre}
                                onChange={e => setNombre(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="label flex items-center gap-1.5">
                                <Building2 className="w-3.5 h-3.5" />Empresa *
                            </label>
                            <select className="input" value={empId} onChange={e => setEmpId(e.target.value)}>
                                <option value="">Seleccionar empresa...</option>
                                {empresas.map(emp => (
                                    <option key={emp.id} value={emp.id}>
                                        {emp.nombre} — {emp.ruc}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="label">Rol</label>
                            <select className="input" value={rol} onChange={e => setRol(e.target.value)}>
                                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                        </div>
                        <button
                            type="submit"
                            disabled={guardando || !email || !nombre || !empId}
                            className="btn btn-primary w-full gap-2 disabled:opacity-50"
                        >
                            {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                            Crear acceso
                        </button>
                    </form>
                </div>
            )}

            {/* ── Tab: Usuarios activos ── */}
            {tab === 'perfiles' && (
                <div className="card overflow-hidden">
                    <div className="bg-slate-700 px-5 py-3 text-white text-sm font-bold flex items-center justify-between">
                        <span>Usuarios con acceso a Finance Suite</span>
                        <button onClick={cargarPerfiles} disabled={cargando}
                            className="text-slate-300 hover:text-white text-xs">
                            {cargando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : '↻ Actualizar'}
                        </button>
                    </div>
                    {cargando ? (
                        <div className="py-10 text-center text-slate-400">
                            <Loader2 className="w-5 h-5 animate-spin inline mr-2" />Cargando...
                        </div>
                    ) : perfiles.length === 0 ? (
                        <div className="py-10 text-center text-slate-400">Sin usuarios configurados aún.</div>
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
                                        <td className="py-2.5 px-4 text-xs text-slate-600">{(p.empresa as any)?.nombre || '—'}</td>
                                        <td className="py-2.5 px-4 text-center">
                                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium',
                                                p.rol === 'admin_plataforma' ? 'bg-red-100 text-red-700' :
                                                p.rol === 'contador'         ? 'bg-blue-100 text-blue-700' :
                                                                               'bg-slate-100 text-slate-600')}>
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
        </div>
    )
}





