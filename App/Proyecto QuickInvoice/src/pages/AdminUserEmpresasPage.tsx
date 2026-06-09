import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { supabaseContabilidad } from '../lib/supabaseContabilidad'
import { Building2, Plus, Trash2, Loader2, RefreshCw, UserCheck } from 'lucide-react'

interface UsuarioPerfil {
    id: string
    nombre: string
    email: string
    rol: string
}

interface EmpresaRow {
    id: string
    nombre: string
    ruc: string
}

interface AsignacionRow {
    id: string
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

    useEffect(() => { fetchAll() }, [])

    async function fetchAll() {
        setLoading(true)
        try {
            const [{ data: perfiles }, { data: emps }, { data: asigs }] = await Promise.all([
                supabase.from('profiles').select('id, nombre, email, rol').order('nombre'),
                supabase.from('empresas').select('id, nombre, ruc').order('nombre'),
                supabaseContabilidad.from('lp_usuarios_empresa').select('*').order('created_at', { ascending: false }),
            ])

            const usuariosData: UsuarioPerfil[] = (perfiles || []).map((p: any) => ({
                id: p.id, nombre: p.nombre || p.email, email: p.email, rol: p.rol,
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

            setUsuarios(usuariosData)
            setEmpresas(empresasData)
            setAsignaciones(asigEnriquecidas)
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
            const { error } = await supabaseContabilidad.from('lp_usuarios_empresa').insert({
                user_id: form.user_id,
                empresa_id: form.empresa_id,
                rol: form.rol,
                activo: true,
            })
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
            const { error } = await supabaseContabilidad
                .from('lp_usuarios_empresa')
                .update({ activo: !asig.activo })
                .eq('id', asig.id)
            if (error) throw error
            await fetchAll()
        } catch (err: any) {
            alert('Error actualizando: ' + err.message)
        }
    }

    async function handleEliminar(id: string) {
        if (!confirm('¿Eliminar esta asignación?')) return
        try {
            const { error } = await supabaseContabilidad
                .from('lp_usuarios_empresa')
                .delete()
                .eq('id', id)
            if (error) throw error
            await fetchAll()
        } catch (err: any) {
            alert('Error eliminando: ' + err.message)
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
                            <th className="px-4 py-3 text-center">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {asignaciones.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                                    No hay asignaciones. Crea la primera con el botón "Nueva asignación".
                                </td>
                            </tr>
                        )}
                        {asignaciones.map(a => (
                            <tr key={a.id} className="hover:bg-slate-50 transition-colors">
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
                                        onClick={() => handleEliminar(a.id)}
                                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        title="Eliminar asignación"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
