import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import {
    codigoRetencionService,
    type CodigoRetencion,
    type TipoRetencionCodigo,
    type AplicaA,
} from '../services/codigoRetencionService'
import { supabaseContabilidad } from '../lib/supabaseContabilidad'
import type { CuentaLP } from '../services/contableConfigService'
import {
    Plus, Edit2, Search, X, Save, Loader2, BookOpen,
    ToggleLeft, ToggleRight, Download, AlertCircle, Scale,
} from 'lucide-react'

type FiltroTipo = 'TODOS' | 'FUENTE' | 'IVA'
type FiltroEstado = 'ACTIVOS' | 'TODOS'

const TIPO_COLORS: Record<TipoRetencionCodigo, string> = {
    FUENTE: 'bg-blue-50 text-blue-700 border-blue-200',
    IVA:    'bg-purple-50 text-purple-700 border-purple-200',
}

const APLICA_LABELS: Record<AplicaA, string> = {
    TODOS:             'Todos',
    PERSONA_NATURAL:   'P. Natural',
    PERSONA_JURIDICA:  'P. Jurídica',
    ARTESANO:          'Artesano',
}

type FormState = Omit<CodigoRetencion, 'id' | 'empresa_id' | 'created_at' | 'updated_at'>

const EMPTY_FORM: FormState = {
    codigo: '',
    descripcion: '',
    tipo: 'FUENTE',
    porcentaje: 0,
    aplica_a: 'TODOS',
    base_legal: '',
    activo: true,
    cuenta_contable_id: null,
    cuenta_contable_codigo: null,
    cuenta_contable_nombre: null,
}

// Carga cuentas LP directamente sin depender de contableConfigService
async function fetchCuentasLP(): Promise<CuentaLP[]> {
    try {
        const db = supabaseContabilidad as any
        const { data: memberships } = await db
            .from('lp_usuarios_empresa')
            .select('empresa_id')
            .eq('activo', true)
        const lista: Array<{ empresa_id: string }> = memberships ?? []
        if (!lista.length) return []
        const { data } = await db
            .from('lp_cuentas')
            .select('id, codigo, nombre, tipo')
            .eq('empresa_id', lista[0].empresa_id)
            .eq('acepta_movimientos', true)
            .order('codigo')
        return (data ?? []) as CuentaLP[]
    } catch {
        return []
    }
}

export function CodigosRetencionPage() {
    const { empresa } = useAuth()

    const [codigos, setCodigos]       = useState<CodigoRetencion[]>([])
    const [cuentasLP, setCuentasLP]   = useState<CuentaLP[]>([])
    const [loading, setLoading]       = useState(false)
    const [loadingCtas, setLoadingCtas] = useState(true)
    const [seeding, setSeeding]       = useState(false)
    const [saving, setSaving]         = useState(false)
    const [error, setError]           = useState('')
    const [sinLP, setSinLP]           = useState(false)

    const [search, setSearch]             = useState('')
    const [filtroTipo, setFiltroTipo]     = useState<FiltroTipo>('TODOS')
    const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('ACTIVOS')

    const [modalOpen, setModalOpen]     = useState(false)
    const [editando, setEditando]       = useState<CodigoRetencion | null>(null)
    const [form, setForm]               = useState<FormState>(EMPTY_FORM)
    const [modalError, setModalError]   = useState('')

    useEffect(() => {
        if (empresa?.id) {
            cargarCodigos()
            cargarCuentasLP()
        }
    }, [empresa?.id])

    async function cargarCodigos() {
        if (!empresa?.id) return
        setLoading(true)
        setError('')
        try {
            setCodigos(await codigoRetencionService.listar(empresa.id))
        } catch (e: any) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    async function cargarCuentasLP() {
        setLoadingCtas(true)
        const ctas = await fetchCuentasLP()
        setCuentasLP(ctas)
        setSinLP(ctas.length === 0)
        setLoadingCtas(false)
    }

    async function sembrarDefaults() {
        if (!empresa?.id) return
        if (codigos.length > 0) {
            alert('Esta empresa ya tiene códigos de retención configurados.\n\nPara actualizar porcentajes o descripciones cuando el SRI los cambie, usa el botón Editar (✏) de cada código — así no se pierden las cuentas contables que ya asignaste.')
            return
        }
        if (!confirm('¿Cargar el catálogo inicial de códigos SRI Ecuador? Se insertarán todos los códigos base. Los porcentajes que cambie el SRI en el futuro se actualizan manualmente desde esta página.')) return
        setSeeding(true)
        try {
            await codigoRetencionService.sembrarDefaults(empresa.id)
            await cargarCodigos()
        } catch (e: any) {
            setError(e.message)
        } finally {
            setSeeding(false)
        }
    }

    function abrirNuevo() {
        setEditando(null)
        setForm(EMPTY_FORM)
        setModalError('')
        setModalOpen(true)
    }

    function abrirEditar(c: CodigoRetencion) {
        setEditando(c)
        setForm({
            codigo:                 c.codigo,
            descripcion:            c.descripcion,
            tipo:                   c.tipo,
            porcentaje:             c.porcentaje,
            aplica_a:               c.aplica_a,
            base_legal:             c.base_legal ?? '',
            activo:                 c.activo,
            cuenta_contable_id:     c.cuenta_contable_id,
            cuenta_contable_codigo: c.cuenta_contable_codigo,
            cuenta_contable_nombre: c.cuenta_contable_nombre,
        })
        setModalError('')
        setModalOpen(true)
    }

    async function handleGuardar() {
        if (!empresa?.id) return
        if (!form.codigo.trim())      { setModalError('El código SRI es obligatorio'); return }
        if (!form.descripcion.trim()) { setModalError('La descripción es obligatoria'); return }
        setSaving(true)
        setModalError('')
        try {
            const payload = { ...form, base_legal: form.base_legal || null }
            if (editando) {
                await codigoRetencionService.actualizar(editando.id, payload)
            } else {
                await codigoRetencionService.crear({ ...payload, empresa_id: empresa.id })
            }
            setModalOpen(false)
            await cargarCodigos()
        } catch (e: any) {
            setModalError(e.message.includes('unique')
                ? `Ya existe el código ${form.codigo} (${form.tipo})`
                : e.message)
        } finally {
            setSaving(false)
        }
    }

    async function toggleActivo(c: CodigoRetencion) {
        const accion = c.activo ? 'dar de baja' : 'reactivar'
        if (!confirm(`¿Desea ${accion} el código ${c.codigo} — ${c.descripcion}?`)) return
        try {
            await codigoRetencionService.toggleActivo(c.id, !c.activo)
            setCodigos(prev => prev.map(x => x.id === c.id ? { ...x, activo: !c.activo } : x))
        } catch (e: any) {
            setError(e.message)
        }
    }

    function seleccionarCuenta(cuentaId: string) {
        if (!cuentaId) {
            setForm(f => ({ ...f, cuenta_contable_id: null, cuenta_contable_codigo: null, cuenta_contable_nombre: null }))
            return
        }
        const c = cuentasLP.find(x => x.id === cuentaId)
        setForm(f => ({
            ...f,
            cuenta_contable_id:     cuentaId,
            cuenta_contable_codigo: c?.codigo ?? null,
            cuenta_contable_nombre: c?.nombre ?? null,
        }))
    }

    const filtrados = codigos.filter(c => {
        const q = search.toLowerCase()
        const matchSearch = !q
            || c.codigo.toLowerCase().includes(q)
            || c.descripcion.toLowerCase().includes(q)
            || (c.base_legal ?? '').toLowerCase().includes(q)
        return matchSearch
            && (filtroTipo === 'TODOS' || c.tipo === filtroTipo)
            && (filtroEstado === 'TODOS' || c.activo)
    })

    const totalFuente = codigos.filter(c => c.tipo === 'FUENTE' && c.activo).length
    const totalIva    = codigos.filter(c => c.tipo === 'IVA'    && c.activo).length
    const totalBaja   = codigos.filter(c => !c.activo).length
    const conCuenta   = codigos.filter(c => c.cuenta_contable_id).length

    return (
        <div className="space-y-5">

            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Códigos de Retención SRI</h1>
                    <p className="text-slate-500 text-sm">Catálogo vigente Ecuador 2025-2026 · LRTI Art. 45/48 · LIVA Art. 63 · Res. NAC-DGERCGC15-00000284</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button onClick={sembrarDefaults} disabled={seeding || codigos.length > 0}
                        title={codigos.length > 0 ? 'Ya tienes códigos. Actualiza cada uno manualmente con el botón Editar.' : 'Carga el catálogo base para empresas nuevas'}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-emerald-200 text-emerald-700 text-sm font-bold bg-emerald-50 hover:bg-emerald-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                        {seeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        {codigos.length > 0 ? 'Catálogo ya cargado' : 'Cargar catálogo inicial SRI'}
                    </button>
                    <button onClick={abrirNuevo}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-bold hover:bg-primary-700 transition-colors">
                        <Plus className="w-4 h-4" /> Nuevo código
                    </button>
                </div>
            </div>

            {/* Error global */}
            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                    <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
                </div>
            )}

            {/* Aviso sin LedgerPro */}
            {sinLP && !loadingCtas && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm">
                    <BookOpen className="w-4 h-4 shrink-0" />
                    No se encontró plan de cuentas en LedgerPro. Los códigos se guardan igual, pero el mapeo de cuenta contable estará deshabilitado.
                </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: 'Ret. Fuente activos', value: totalFuente, color: 'text-blue-600' },
                    { label: 'Ret. IVA activos',    value: totalIva,    color: 'text-purple-600' },
                    { label: 'Con cuenta LP',       value: conCuenta,   color: 'text-emerald-600' },
                    { label: 'Dados de baja',       value: totalBaja,   color: 'text-slate-400' },
                ].map(s => (
                    <div key={s.label} className="card p-4">
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">{s.label}</p>
                        <p className={`text-2xl font-black mt-1 ${s.color}`}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Filtros */}
            <div className="card p-4 flex flex-wrap gap-3 items-center">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text"
                        placeholder="Buscar código, descripción o norma..."
                        className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-primary-400"
                        value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
                    {(['TODOS', 'FUENTE', 'IVA'] as FiltroTipo[]).map(t => (
                        <button key={t} onClick={() => setFiltroTipo(t)}
                            className={`px-3 py-1.5 font-medium transition-colors ${filtroTipo === t ? 'bg-primary-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                            {t === 'TODOS' ? 'Todos' : t === 'FUENTE' ? 'Fuente (IR)' : 'IVA'}
                        </button>
                    ))}
                </div>
                <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
                    {(['ACTIVOS', 'TODOS'] as FiltroEstado[]).map(e => (
                        <button key={e} onClick={() => setFiltroEstado(e)}
                            className={`px-3 py-1.5 font-medium transition-colors ${filtroEstado === e ? 'bg-primary-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                            {e === 'ACTIVOS' ? 'Solo activos' : 'Todos'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tabla */}
            <div className="card overflow-hidden">
                {loading ? (
                    <div className="py-14 flex items-center justify-center gap-2 text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin" /> Cargando...
                    </div>
                ) : filtrados.length === 0 ? (
                    <div className="py-14 text-center text-slate-400 space-y-2">
                        <p className="font-medium">No hay códigos que coincidan</p>
                        {codigos.length === 0 && (
                            <p className="text-sm">
                                Usa <strong>"Cargar códigos SRI Ecuador"</strong> para importar el catálogo predeterminado.
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-700 text-white text-xs uppercase tracking-wider">
                                    <th className="py-3 px-3 text-left w-16">Tipo</th>
                                    <th className="py-3 px-3 text-left w-16">Código</th>
                                    <th className="py-3 px-3 text-left">Descripción</th>
                                    <th className="py-3 px-3 text-right w-12">Tasa</th>
                                    <th className="py-3 px-3 text-left w-24">Aplica a</th>
                                    <th className="py-3 px-3 text-left w-32">Norma</th>
                                    <th className="py-3 px-3 text-left w-36">Cuenta LP</th>
                                    <th className="py-3 px-3 text-center w-18">Estado</th>
                                    <th className="py-3 px-3 text-right w-18">Acc.</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filtrados.map((c, idx) => (
                                    <tr key={c.id}
                                        className={`transition-colors ${!c.activo ? 'opacity-40' : 'hover:bg-slate-50'} ${idx % 2 ? 'bg-slate-50/30' : ''}`}>
                                        <td className="py-2 px-3">
                                            <span className={`text-xs font-bold px-1.5 py-0.5 rounded border ${TIPO_COLORS[c.tipo]}`}>
                                                {c.tipo}
                                            </span>
                                        </td>
                                        <td className="py-2 px-3 font-mono font-black text-slate-800">{c.codigo}</td>
                                        <td className="py-2 px-3 text-slate-700 text-xs leading-snug">{c.descripcion}</td>
                                        <td className="py-2 px-3 text-right font-mono font-black text-slate-900">{c.porcentaje}%</td>
                                        <td className="py-2 px-3">
                                            {c.aplica_a && c.aplica_a !== 'TODOS'
                                                ? <span className="text-xs text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{APLICA_LABELS[c.aplica_a]}</span>
                                                : <span className="text-xs text-slate-300">Todos</span>}
                                        </td>
                                        <td className="py-2 px-3">
                                            {c.base_legal
                                                ? <span className="flex items-center gap-1 text-xs text-slate-500"><Scale className="w-3 h-3 shrink-0 text-slate-300" />{c.base_legal}</span>
                                                : <span className="text-xs text-slate-200">—</span>}
                                        </td>
                                        <td className="py-2 px-3">
                                            {c.cuenta_contable_id
                                                ? <span className="flex items-center gap-1 text-xs text-purple-700"><BookOpen className="w-3 h-3 shrink-0" /><span className="font-mono font-bold">{c.cuenta_contable_codigo}</span></span>
                                                : <span className="text-xs text-slate-200 italic">Sin mapear</span>}
                                        </td>
                                        <td className="py-2 px-3 text-center">
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${c.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                                                {c.activo ? 'Activo' : 'Baja'}
                                            </span>
                                        </td>
                                        <td className="py-2 px-3">
                                            <div className="flex justify-end gap-1">
                                                <button onClick={() => abrirEditar(c)} title="Editar"
                                                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-primary-600 transition-colors">
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </button>
                                                <button onClick={() => toggleActivo(c)}
                                                    title={c.activo ? 'Dar de baja' : 'Reactivar'}
                                                    className={`p-1.5 rounded-lg transition-colors ${c.activo ? 'hover:bg-red-50 text-slate-400 hover:text-red-600' : 'hover:bg-emerald-50 text-slate-400 hover:text-emerald-600'}`}>
                                                    {c.activo ? <ToggleLeft className="w-4 h-4" /> : <ToggleRight className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal */}
            {modalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">

                        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-slate-900">
                                {editando ? 'Editar código de retención' : 'Nuevo código de retención'}
                            </h2>
                            <button onClick={() => setModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-5 space-y-4">

                            {/* Tipo + Código + Tasa */}
                            <div className="grid grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Tipo</label>
                                    <select className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-primary-400"
                                        value={form.tipo}
                                        onChange={e => setForm(f => ({ ...f, tipo: e.target.value as TipoRetencionCodigo }))}>
                                        <option value="FUENTE">Fuente (IR)</option>
                                        <option value="IVA">IVA</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Código SRI</label>
                                    <input type="text" maxLength={10}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 font-mono font-bold text-sm outline-none focus:ring-2 focus:ring-primary-400"
                                        value={form.codigo}
                                        onChange={e => setForm(f => ({ ...f, codigo: e.target.value.toUpperCase() }))}
                                        placeholder="303" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Tasa %</label>
                                    <input type="number" min={0} max={100} step={0.01}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-right font-bold outline-none focus:ring-2 focus:ring-primary-400"
                                        value={form.porcentaje}
                                        onChange={e => setForm(f => ({ ...f, porcentaje: parseFloat(e.target.value) || 0 }))} />
                                </div>
                            </div>

                            {/* Descripción */}
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Descripción oficial SRI</label>
                                <textarea rows={3}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-primary-400 resize-none"
                                    value={form.descripcion}
                                    onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                                    placeholder="Descripción del concepto de retención..." />
                            </div>

                            {/* Aplica a + Norma legal */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Aplica a</label>
                                    <select className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-primary-400"
                                        value={form.aplica_a ?? 'TODOS'}
                                        onChange={e => setForm(f => ({ ...f, aplica_a: e.target.value as AplicaA }))}>
                                        <option value="TODOS">Todos</option>
                                        <option value="PERSONA_NATURAL">Persona Natural</option>
                                        <option value="PERSONA_JURIDICA">Persona Jurídica</option>
                                        <option value="ARTESANO">Artesano</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Norma legal</label>
                                    <input type="text"
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-primary-400"
                                        value={form.base_legal ?? ''}
                                        onChange={e => setForm(f => ({ ...f, base_legal: e.target.value }))}
                                        placeholder="Art. 45 LRTI" />
                                </div>
                            </div>

                            {/* Cuenta contable LP */}
                            <div className="border-t border-slate-100 pt-4">
                                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
                                    <BookOpen className="w-3.5 h-3.5 text-purple-400" />
                                    Cuenta Contable (LedgerPro)
                                </label>
                                {loadingCtas ? (
                                    <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                                        <Loader2 className="w-4 h-4 animate-spin" /> Cargando cuentas de LedgerPro...
                                    </div>
                                ) : sinLP ? (
                                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">
                                        LedgerPro no encontrado. Configura contabilidad en el módulo Conta.
                                    </p>
                                ) : (
                                    <select
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm outline-none focus:ring-2 focus:ring-purple-400"
                                        value={form.cuenta_contable_id || ''}
                                        onChange={e => seleccionarCuenta(e.target.value)}>
                                        <option value="">— Sin mapear —</option>
                                        {cuentasLP.map(c => (
                                            <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            {/* Error modal */}
                            {modalError && (
                                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    {modalError}
                                </div>
                            )}

                            {/* Botones */}
                            <div className="flex gap-3 pt-1">
                                <button onClick={() => setModalOpen(false)}
                                    className="flex-1 px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors">
                                    Cancelar
                                </button>
                                <button onClick={handleGuardar} disabled={saving}
                                    className="flex-1 bg-primary-600 text-white rounded-lg px-4 py-2 font-bold hover:bg-primary-700 flex items-center justify-center gap-2 disabled:opacity-50">
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Guardar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
