import { useState, useEffect, Fragment } from 'react'
import { supabase } from '../lib/supabase'
import { Building2, Plus, Trash2, Loader2, RefreshCw, UserCheck, ChevronDown, ChevronUp, Save } from 'lucide-react'
import { cn } from '../lib/utils'

interface UsuarioPerfil {
    id: string
    nombre: string
    email: string
    rol: string
    empresa_id: string | null
}

interface EmpresaRow {
    id: string
    nombre: string
    ruc: string
}

interface AsignacionRow {
    user_id: string
    empresa_id: string
    rol: string
    activo: boolean
    created_at: string
    // joined
    usuario_nombre?: string
    usuario_email?: string
    empresa_nombre?: string
}

// usuario_empresas no tiene columna id propia: la clave natural es (user_id, empresa_id)
function pairKey(a: { user_id: string; empresa_id: string }) {
    return `${a.user_id}_${a.empresa_id}`
}

interface ModulosForm {
    vendor: boolean
    finance: boolean
    ledgerpro: boolean
    talento_humano: boolean
    is_admin: boolean
}

const DEFAULT_MODULOS: ModulosForm = { vendor: false, finance: false, ledgerpro: false, talento_humano: false, is_admin: false }

const MODULO_FIELDS: { key: keyof ModulosForm; label: string; short: string }[] = [
    { key: 'vendor',         label: 'Compras / Proveedores (CxP)',    short: 'C' },
    { key: 'finance',        label: 'Tesorería',                       short: 'T' },
    { key: 'ledgerpro',      label: 'Contabilidad',                    short: 'L' },
    { key: 'talento_humano', label: 'Talento Humano y Nóminas',        short: 'TH' },
    { key: 'is_admin',       label: 'Administrador de la empresa',     short: 'A' },
]

const ROLES = ['oficina', 'mesero', 'cocina', 'contador', 'admin']

export function AdminUserEmpresasPage() {
    const [usuarios, setUsuarios] = useState<UsuarioPerfil[]>([])
    const [empresas, setEmpresas] = useState<EmpresaRow[]>([])
    const [asignaciones, setAsignaciones] = useState<AsignacionRow[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    // Formulario nueva asignación
    const [form, setForm] = useState({ user_id: '', empresa_id: '', rol: 'oficina' })
    const [showForm, setShowForm] = useState(false)

    // Módulos por (usuario, empresa)
    const [modulosPorPar, setModulosPorPar] = useState<Record<string, ModulosForm>>({})
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [modulosForm, setModulosForm] = useState<Record<string, ModulosForm>>({})
    const [savingModulos, setSavingModulos] = useState<string | null>(null)

    useEffect(() => { fetchAll() }, [])

    async function fetchAll() {
        setLoading(true)
        try {
            const [{ data: perfiles }, { data: emps }, { data: asigs }, { data: mods }] = await Promise.all([
                supabase.from('profiles').select('id, nombre, email, rol, empresa_id').order('nombre'),
                supabase.from('empresas').select('id, nombre, ruc').order('nombre'),
                supabase.from('usuario_empresas').select('*').order('created_at', { ascending: false }),
                supabase.from('user_modules').select('*'),
            ])

            const usuariosData: UsuarioPerfil[] = (perfiles || []).map((p: any) => ({
                id: p.id, nombre: p.nombre || p.email, email: p.email, rol: p.rol, empresa_id: p.empresa_id ?? null,
            }))
            const empresasData: EmpresaRow[] = (emps || []).map((e: any) => ({
                id: e.id, nombre: e.nombre, ruc: e.ruc,
            }))

            const asigEnriquecidas: AsignacionRow[] = (asigs || []).map((a: any) => ({
                ...a,
                usuario_nombre: usuariosData.find(u => u.id === a.user_id)?.nombre || a.user_id,
                usuario_email:  usuariosData.find(u => u.id === a.user_id)?.email || '',
                empresa_nombre: empresasData.find(e => e.id === a.empresa_id)?.nombre || a.empresa_id,
            }))

            const modulosPorParData: Record<string, ModulosForm> = {}
            ;(mods || []).forEach((m: any) => {
                modulosPorParData[`${m.user_id}_${m.empresa_id}`] = {
                    vendor: !!m.vendor, finance: !!m.finance, ledgerpro: !!m.ledgerpro, talento_humano: !!m.talento_humano, is_admin: !!m.is_admin,
                }
            })

            setUsuarios(usuariosData)
            setEmpresas(empresasData)
            setAsignaciones(asigEnriquecidas)
            setModulosPorPar(modulosPorParData)
        } catch (err: any) {
            alert('Error cargando datos: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    async function handleGuardar() {
        if (!form.user_id || !form.empresa_id) {
            alert('Seleccione usuario y empresa')
            return
        }
        const existe = asignaciones.find(a => a.user_id === form.user_id && a.empresa_id === form.empresa_id)
        if (existe) {
            alert('Esta asignación ya existe')
            return
        }
        setSaving(true)
        try {
            const rows = [{
                user_id: form.user_id,
                empresa_id: form.empresa_id,
                rol: form.rol,
                activo: true,
            }]

            // Si es la primera asignación de este usuario y su empresa actual
            // (profiles.empresa_id) es distinta, la agregamos también para
            // que no pierda acceso a ella (ver fallback en AuthContext).
            const tieneAsignaciones = asignaciones.some(a => a.user_id === form.user_id)
            const usuario = usuarios.find(u => u.id === form.user_id)
            if (!tieneAsignaciones && usuario?.empresa_id && usuario.empresa_id !== form.empresa_id) {
                rows.push({
                    user_id: form.user_id,
                    empresa_id: usuario.empresa_id,
                    rol: usuario.rol,
                    activo: true,
                })
            }

            const { error } = await supabase.from('usuario_empresas').insert(rows)
            if (error) throw error
            setForm({ user_id: '', empresa_id: '', rol: 'oficina' })
            setShowForm(false)
            await fetchAll()
        } catch (err: any) {
            alert('Error guardando asignación: ' + err.message)
        } finally {
            setSaving(false)
        }
    }

    async function toggleActivo(asig: AsignacionRow) {
        try {
            const { error } = await supabase
                .from('usuario_empresas')
                .update({ activo: !asig.activo })
                .eq('user_id', asig.user_id)
                .eq('empresa_id', asig.empresa_id)
            if (error) throw error
            await fetchAll()
        } catch (err: any) {
            alert('Error actualizando: ' + err.message)
        }
    }

    async function handleEliminar(asig: AsignacionRow) {
        if (!confirm('¿Eliminar esta asignación?')) return
        try {
            const { error } = await supabase
                .from('usuario_empresas')
                .delete()
                .eq('user_id', asig.user_id)
                .eq('empresa_id', asig.empresa_id)
            if (error) throw error
            await fetchAll()
        } catch (err: any) {
            alert('Error eliminando: ' + err.message)
        }
    }

    function toggleModulos(asig: AsignacionRow) {
        const key = pairKey(asig)
        if (expandedId === key) {
            setExpandedId(null)
            return
        }
        setModulosForm(prev => ({ ...prev, [key]: prev[key] ?? modulosPorPar[key] ?? { ...DEFAULT_MODULOS } }))
        setExpandedId(key)
    }

    function updateModulo(key: string, field: keyof ModulosForm, value: boolean) {
        setModulosForm(prev => ({
            ...prev,
            [key]: { ...(prev[key] ?? DEFAULT_MODULOS), [field]: value },
        }))
    }

    async function guardarModulos(asig: AsignacionRow) {
        const key = pairKey(asig)
        const form = modulosForm[key] ?? DEFAULT_MODULOS
        setSavingModulos(key)
        try {
            const { data: existing, error: selError } = await supabase
                .from('user_modules')
                .select('user_id')
                .eq('user_id', asig.user_id)
                .eq('empresa_id', asig.empresa_id)
                .maybeSingle()
            if (selError) throw selError

            if (existing) {
                const { error } = await supabase
                    .from('user_modules')
                    .update({ ...form, updated_at: new Date().toISOString() })
                    .eq('user_id', asig.user_id)
                    .eq('empresa_id', asig.empresa_id)
                if (error) throw error
            } else {
                const { error } = await supabase
                    .from('user_modules')
                    .insert({ user_id: asig.user_id, empresa_id: asig.empresa_id, ...form })
                if (error) throw error
            }

            setModulosPorPar(prev => ({ ...prev, [key]: form }))
            setExpandedId(null)
        } catch (err: any) {
            alert('Error guardando módulos: ' + err.message)
        } finally {
            setSavingModulos(null)
        }
    }

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
    )

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Building2 className="w-7 h-7 text-primary-600" />
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Asignación Usuario → Empresa</h1>
                        <p className="text-sm text-slate-500">Controla a qué empresas puede acceder cada usuario</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={fetchAll} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
                        <RefreshCw className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setShowForm(v => !v)}
                        className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Nueva asignación
                    </button>
                </div>
            </div>

            {/* Formulario nueva asignación */}
            {showForm && (
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                    <h2 className="text-sm font-bold text-slate-700 mb-4">Nueva asignación</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Usuario</label>
                            <select
                                value={form.user_id}
                                onChange={e => setForm(f => ({ ...f, user_id: e.target.value }))}
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                            >
                                <option value="">Seleccionar usuario...</option>
                                {usuarios.filter(u => u.rol !== 'admin_plataforma').map(u => (
                                    <option key={u.id} value={u.id}>{u.nombre} — {u.email}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Empresa</label>
                            <select
                                value={form.empresa_id}
                                onChange={e => setForm(f => ({ ...f, empresa_id: e.target.value }))}
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                            >
                                <option value="">Seleccionar empresa...</option>
                                {empresas.map(e => (
                                    <option key={e.id} value={e.id}>{e.nombre} ({e.ruc})</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Rol</label>
                            <select
                                value={form.rol}
                                onChange={e => setForm(f => ({ ...f, rol: e.target.value }))}
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                            >
                                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-3 mt-4">
                        <button
                            onClick={handleGuardar}
                            disabled={saving}
                            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                            Guardar
                        </button>
                        <button
                            onClick={() => setShowForm(false)}
                            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* Tabla de asignaciones */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-bold uppercase tracking-wide">
                            <th className="px-4 py-3 text-left">Usuario</th>
                            <th className="px-4 py-3 text-left">Empresa</th>
                            <th className="px-4 py-3 text-left">Rol</th>
                            <th className="px-4 py-3 text-center">Estado</th>
                            <th className="px-4 py-3 text-center">Módulos</th>
                            <th className="px-4 py-3 text-center">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {asignaciones.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                                    No hay asignaciones. Crea la primera con el botón "Nueva asignación".
                                </td>
                            </tr>
                        )}
                        {asignaciones.map(a => (
                            <Fragment key={pairKey(a)}>
                            <tr className="hover:bg-slate-50 transition-colors">
                                <td className="px-4 py-3">
                                    <p className="font-semibold text-slate-800">{a.usuario_nombre}</p>
                                    <p className="text-xs text-slate-400">{a.usuario_email}</p>
                                </td>
                                <td className="px-4 py-3">
                                    <p className="font-semibold text-slate-800">{a.empresa_nombre}</p>
                                </td>
                                <td className="px-4 py-3">
                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-medium">
                                        {a.rol}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <button
                                        onClick={() => toggleActivo(a)}
                                        className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                                            a.activo
                                                ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                        }`}
                                    >
                                        {a.activo ? 'Activo' : 'Inactivo'}
                                    </button>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <button
                                        onClick={() => toggleModulos(a)}
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 hover:border-primary-300 transition-colors"
                                        title="Configurar módulos"
                                    >
                                        {MODULO_FIELDS.map(m => {
                                            const activo = modulosPorPar[`${a.user_id}_${a.empresa_id}`]?.[m.key]
                                            return (
                                                <span key={m.key} className={cn(
                                                    'w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold',
                                                    activo ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-400'
                                                )}>
                                                    {m.short}
                                                </span>
                                            )
                                        })}
                                        {expandedId === pairKey(a) ? <ChevronUp className="w-4 h-4 text-slate-400 ml-1" /> : <ChevronDown className="w-4 h-4 text-slate-400 ml-1" />}
                                    </button>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <button
                                        onClick={() => handleEliminar(a)}
                                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        title="Eliminar asignación"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                            {expandedId === pairKey(a) && (
                                <tr className="bg-slate-50">
                                    <td colSpan={6} className="px-4 py-4">
                                        <div className="flex flex-wrap items-center gap-4">
                                            {MODULO_FIELDS.map(m => (
                                                <label key={m.key} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={modulosForm[pairKey(a)]?.[m.key] ?? false}
                                                        onChange={e => updateModulo(pairKey(a), m.key, e.target.checked)}
                                                        className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                                                    />
                                                    {m.label}
                                                </label>
                                            ))}
                                            <button
                                                onClick={() => guardarModulos(a)}
                                                disabled={savingModulos === pairKey(a)}
                                                className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-60 ml-auto"
                                            >
                                                {savingModulos === pairKey(a) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                                Guardar módulos
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )}
                            </Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
