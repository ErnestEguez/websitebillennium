import React, { useEffect, useState } from 'react'
import { Plus, ChevronRight, ChevronDown, Search, Download, Upload, Edit2, Trash2, X, Loader2 } from 'lucide-react'
import { supabase } from '../../../lib/supabaseContabilidad'
import { useAuth } from '../../../contexts/contabilidad/ContabilidadContext'
import { cn } from '../../../lib/utils'
import type { LpCuenta, LpPlantilla } from '../../../types/conta'

// ── Colores por tipo de cuenta ──────────────────────────────
const TIPO_STYLE: Record<string, { bg: string; text: string; dot: string }> = {
    activo:     { bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-500' },
    pasivo:     { bg: 'bg-red-50',    text: 'text-red-700',    dot: 'bg-red-500' },
    patrimonio: { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
    ingreso:    { bg: 'bg-green-50',  text: 'text-green-700',  dot: 'bg-green-500' },
    gasto:      { bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-500' },
}

// ── Construir árbol desde lista plana ───────────────────────
function buildTree(cuentas: LpCuenta[]): LpCuenta[] {
    const map = new Map<string, LpCuenta>()
    cuentas.forEach(c => map.set(c.id, { ...c, hijos: [] }))
    const roots: LpCuenta[] = []
    map.forEach(c => {
        if (c.cuenta_padre_id) {
            const padre = map.get(c.cuenta_padre_id)
            if (padre) padre.hijos!.push(c)
        } else {
            roots.push(c)
        }
    })
    return roots
}

// ── Fila del árbol ──────────────────────────────────────────
function CuentaFila({
    cuenta, nivel, expanded, onToggle, onEdit, onDelete
}: {
    cuenta: LpCuenta
    nivel: number
    expanded: Set<string>
    onToggle: (id: string) => void
    onEdit: (c: LpCuenta) => void
    onDelete: (c: LpCuenta) => void
}) {
    const tieneHijos = (cuenta.hijos?.length ?? 0) > 0
    const isOpen = expanded.has(cuenta.id)
    const style = TIPO_STYLE[cuenta.tipo]

    return (
        <>
            <tr className={cn('border-b border-slate-100 hover:bg-slate-50 transition-colors', !cuenta.activa && 'opacity-50')}>
                <td className="py-2.5 px-4">
                    <div className="flex items-center gap-1" style={{ paddingLeft: `${nivel * 20}px` }}>
                        {tieneHijos ? (
                            <button onClick={() => onToggle(cuenta.id)} className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-slate-600">
                                {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            </button>
                        ) : (
                            <span className="w-5 h-5 flex items-center justify-center">
                                <span className="w-1.5 h-1.5 bg-slate-300 rounded-full" />
                            </span>
                        )}
                        <span className="font-mono text-sm text-slate-600 mr-2">{cuenta.codigo}</span>
                        <span className={cn('text-sm', tieneHijos ? 'font-semibold text-slate-800' : 'text-slate-700')}>
                            {cuenta.nombre}
                        </span>
                    </div>
                </td>
                <td className="py-2.5 px-4">
                    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full', style.bg, style.text)}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', style.dot)} />
                        {cuenta.tipo}
                    </span>
                </td>
                <td className="py-2.5 px-4 text-xs text-slate-500">{cuenta.naturaleza}</td>
                <td className="py-2.5 px-4 text-center">
                    {cuenta.acepta_movimientos && (
                        <span className="inline-block w-2 h-2 bg-primary-500 rounded-full" title="Acepta movimientos" />
                    )}
                </td>
                <td className="py-2.5 px-4 font-mono text-xs text-slate-400">{cuenta.codigo_sri ?? '—'}</td>
                <td className="py-2.5 px-4">
                    <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => onEdit(cuenta)} className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-md transition-colors">
                            <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {!tieneHijos && (
                            <button onClick={() => onDelete(cuenta)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </td>
            </tr>
            {isOpen && cuenta.hijos?.map(hijo => (
                <CuentaFila
                    key={hijo.id}
                    cuenta={hijo}
                    nivel={nivel + 1}
                    expanded={expanded}
                    onToggle={onToggle}
                    onEdit={onEdit}
                    onDelete={onDelete}
                />
            ))}
        </>
    )
}

// ── Modal Crear/Editar Cuenta ───────────────────────────────
function ModalCuenta({
    cuenta, empresaId, cuentas, onClose, onSaved
}: {
    cuenta: LpCuenta | null
    empresaId: string
    cuentas: LpCuenta[]
    onClose: () => void
    onSaved: () => void
}) {
    const editando = !!cuenta
    const [form, setForm] = useState({
        codigo: cuenta?.codigo ?? '',
        nombre: cuenta?.nombre ?? '',
        tipo: cuenta?.tipo ?? 'activo' as LpCuenta['tipo'],
        naturaleza: cuenta?.naturaleza ?? 'deudora' as LpCuenta['naturaleza'],
        cuenta_padre_id: cuenta?.cuenta_padre_id ?? '',
        acepta_movimientos: cuenta?.acepta_movimientos ?? false,
        codigo_sri: cuenta?.codigo_sri ?? '',
        codigo_supe: cuenta?.codigo_supe ?? '',
        activa: cuenta?.activa ?? true,
    })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Auto-detectar cuenta padre cuando el usuario escribe el código
    React.useEffect(() => {
        if (editando || !form.codigo.includes('.')) return
        const partes = form.codigo.trim().split('.')
        partes.pop()
        const codigoPadre = partes.join('.')
        const padre = cuentas.find(c => c.codigo === codigoPadre)
        if (padre) setForm(f => ({ ...f, cuenta_padre_id: padre.id }))
    }, [form.codigo])

    const cuentasPadre = cuentas.filter(c => !c.acepta_movimientos)

    async function guardar() {
        setSaving(true)
        setError(null)
        const nivel = form.codigo.split('.').length

        const payload = {
            empresa_id: empresaId,
            codigo: form.codigo.trim(),
            nombre: form.nombre.trim(),
            tipo: form.tipo,
            naturaleza: form.naturaleza,
            nivel,
            cuenta_padre_id: form.cuenta_padre_id || null,
            acepta_movimientos: form.acepta_movimientos,
            codigo_sri: form.codigo_sri || null,
            codigo_supe: form.codigo_supe || null,
            activa: form.activa,
        }

        const { error } = editando
            ? await supabase.from('lp_cuentas').update(payload).eq('id', cuenta!.id)
            : await supabase.from('lp_cuentas').insert(payload)

        if (error) { setError(error.message); setSaving(false); return }
        onSaved()
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
                <div className="flex items-center justify-between px-6 py-4 border-b">
                    <h2 className="text-base font-bold text-slate-900">
                        {editando ? 'Editar Cuenta' : 'Nueva Cuenta'}
                    </h2>
                    <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                </div>
                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label">Código *</label>
                            <input className="input font-mono" value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} placeholder="1.01.01.01" />
                        </div>
                        <div>
                            <label className="label">Tipo *</label>
                            <select className="input" value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as LpCuenta['tipo'] }))}>
                                {['activo','pasivo','patrimonio','ingreso','gasto'].map(t => (
                                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="label">Nombre *</label>
                        <input className="input" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre de la cuenta" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label">Naturaleza</label>
                            <select className="input" value={form.naturaleza} onChange={e => setForm(f => ({ ...f, naturaleza: e.target.value as LpCuenta['naturaleza'] }))}>
                                <option value="deudora">Deudora</option>
                                <option value="acreedora">Acreedora</option>
                            </select>
                        </div>
                        <div>
                            <label className="label">Cuenta Padre</label>
                            <select className="input" value={form.cuenta_padre_id} onChange={e => setForm(f => ({ ...f, cuenta_padre_id: e.target.value }))}>
                                <option value="">— Ninguna —</option>
                                {cuentasPadre.map(c => (
                                    <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="label">Código SRI</label>
                            <input className="input" value={form.codigo_sri} onChange={e => setForm(f => ({ ...f, codigo_sri: e.target.value }))} />
                        </div>
                        <div>
                            <label className="label">Código Superintendencia</label>
                            <input className="input" value={form.codigo_supe} onChange={e => setForm(f => ({ ...f, codigo_supe: e.target.value }))} />
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={form.acepta_movimientos} onChange={e => setForm(f => ({ ...f, acepta_movimientos: e.target.checked }))} className="rounded" />
                            <span className="text-sm text-slate-700">Acepta movimientos</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={form.activa} onChange={e => setForm(f => ({ ...f, activa: e.target.checked }))} className="rounded" />
                            <span className="text-sm text-slate-700">Activa</span>
                        </label>
                    </div>
                    {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
                </div>
                <div className="flex justify-end gap-3 px-6 py-4 border-t bg-slate-50 rounded-b-2xl">
                    <button onClick={onClose} className="btn btn-secondary">Cancelar</button>
                    <button onClick={guardar} disabled={saving} className="btn btn-primary">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (editando ? 'Guardar' : 'Crear')}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Página Principal ────────────────────────────────────────
export function PlanCuentasPage() {
    const { empresaActiva } = useAuth()
    const [cuentas, setCuentas] = useState<LpCuenta[]>([])
    const [arbol, setArbol] = useState<LpCuenta[]>([])
    const [loading, setLoading] = useState(true)
    const [busqueda, setBusqueda] = useState('')
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [modalCuenta, setModalCuenta] = useState<LpCuenta | null | undefined>(undefined)
    const [plantillas, setPlantillas] = useState<LpPlantilla[]>([])
    const [importando, setImportando] = useState(false)

    useEffect(() => { if (empresaActiva) cargar() }, [empresaActiva])

    async function cargar() {
        if (!empresaActiva) return
        setLoading(true)
        const { data } = await supabase.from('lp_cuentas')
            .select('*').eq('empresa_id', empresaActiva.id).order('codigo')
        setCuentas(data ?? [])
        setArbol(buildTree(data ?? []))
        setLoading(false)
    }

    async function cargarPlantillas() {
        const { data } = await supabase.from('lp_plantillas').select('*').eq('activa', true)
        setPlantillas(data ?? [])
    }

    async function importarPlantilla(plantillaId: string) {
        if (!empresaActiva) return
        setImportando(true)
        const { data: pcs } = await supabase.from('lp_plantilla_cuentas')
            .select('*').eq('plantilla_id', plantillaId).order('codigo')

        if (!pcs) { setImportando(false); return }

        // Insertar en orden: primero los de nivel más bajo para respetar FKs
        const insertadas = new Map<string, string>() // codigo -> id

        for (const pc of pcs) {
            const padreId = pc.codigo_padre ? insertadas.get(pc.codigo_padre) ?? null : null
            const { data } = await supabase.from('lp_cuentas').insert({
                empresa_id: empresaActiva.id,
                codigo: pc.codigo,
                nombre: pc.nombre,
                nivel: pc.nivel,
                tipo: pc.tipo,
                naturaleza: pc.naturaleza,
                cuenta_padre_id: padreId,
                acepta_movimientos: pc.acepta_movimientos,
                codigo_sri: pc.codigo_sri,
                codigo_supe: pc.codigo_supe,
                plantilla_origen_id: plantillaId,
                activa: true,
            }).select('id').single()

            if (data) insertadas.set(pc.codigo, data.id)
        }

        setImportando(false)
        cargar()
    }

    function toggleExpand(id: string) {
        setExpanded(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }

    function expandirTodo() {
        setExpanded(new Set(cuentas.map(c => c.id)))
    }

    function colapsarTodo() {
        setExpanded(new Set())
    }

    function exportarCSV() {
        const header = 'Código,Nombre,Nivel,Tipo,Naturaleza,Acepta Movimientos,Código SRI'
        const rows = cuentas.map(c =>
            `"${c.codigo}","${c.nombre}",${c.nivel},${c.tipo},${c.naturaleza},${c.acepta_movimientos},${c.codigo_sri ?? ''}`
        )
        const csv = [header, ...rows].join('\n')
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = 'plan_cuentas.csv'; a.click()
        URL.revokeObjectURL(url)
    }

    async function eliminarCuenta(cuenta: LpCuenta) {
        if (!confirm(`¿Eliminar la cuenta ${cuenta.codigo} — ${cuenta.nombre}?`)) return
        await supabase.from('lp_cuentas').delete().eq('id', cuenta.id)
        cargar()
    }

    // Filtrar para búsqueda (lista plana con highlight)
    const filtradas = busqueda
        ? cuentas.filter(c =>
            c.codigo.toLowerCase().includes(busqueda.toLowerCase()) ||
            c.nombre.toLowerCase().includes(busqueda.toLowerCase())
        )
        : null

    const noTieneCuentas = !loading && cuentas.length === 0

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Plan de Cuentas</h1>
                    <p className="text-slate-500 text-sm mt-0.5">{cuentas.length} cuentas registradas</p>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={exportarCSV} className="btn btn-secondary gap-2 text-sm">
                        <Download className="w-4 h-4" /> Exportar
                    </button>
                    {noTieneCuentas && (
                        <button
                            onClick={async () => { await cargarPlantillas(); setModalCuenta(undefined) }}
                            className="btn btn-secondary gap-2 text-sm"
                        >
                            <Upload className="w-4 h-4" /> Importar Plantilla
                        </button>
                    )}
                    <button onClick={() => setModalCuenta(null)} className="btn btn-primary gap-2 text-sm">
                        <Plus className="w-4 h-4" /> Nueva Cuenta
                    </button>
                </div>
            </div>

            {/* Sin cuentas — prompt de importar plantilla */}
            {noTieneCuentas && (
                <div className="card p-10 text-center">
                    <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Upload className="w-8 h-8 text-primary-600" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-900 mb-2">Esta empresa no tiene plan de cuentas</h2>
                    <p className="text-slate-500 text-sm mb-6">Importa la plantilla Ecuador NIIF PYMES para comenzar rápidamente, o crea cuentas manualmente.</p>
                    <button
                        onClick={async () => {
                            await cargarPlantillas()
                            if (plantillas.length === 1) {
                                importarPlantilla(plantillas[0].id)
                            }
                        }}
                        disabled={importando}
                        className="btn btn-primary mx-auto gap-2"
                    >
                        {importando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        Importar Ecuador NIIF PYMES
                    </button>
                </div>
            )}

            {/* Toolbar árbol */}
            {cuentas.length > 0 && (
                <div className="card">
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                className="input pl-9"
                                placeholder="Buscar por código o nombre..."
                                value={busqueda}
                                onChange={e => setBusqueda(e.target.value)}
                            />
                        </div>
                        {!busqueda && (
                            <div className="flex gap-1 ml-auto">
                                <button onClick={expandirTodo} className="btn btn-secondary text-xs py-1.5 px-3">Expandir todo</button>
                                <button onClick={colapsarTodo} className="btn btn-secondary text-xs py-1.5 px-3">Colapsar</button>
                            </div>
                        )}
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50">
                                    <th className="text-left py-2.5 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wide">Código / Nombre</th>
                                    <th className="text-left py-2.5 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wide">Tipo</th>
                                    <th className="text-left py-2.5 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wide">Naturaleza</th>
                                    <th className="text-center py-2.5 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wide">Mov.</th>
                                    <th className="text-left py-2.5 px-4 font-semibold text-slate-600 text-xs uppercase tracking-wide">Cód. SRI</th>
                                    <th className="py-2.5 px-4 w-20" />
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={6} className="py-12 text-center text-slate-400">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                                    </td></tr>
                                ) : filtradas ? (
                                    filtradas.length === 0
                                        ? <tr><td colSpan={6} className="py-8 text-center text-slate-400">Sin resultados para «{busqueda}»</td></tr>
                                        : filtradas.map(c => (
                                            <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                                                <td className="py-2.5 px-4">
                                                    <span className="font-mono text-xs text-slate-500 mr-2">{c.codigo}</span>
                                                    <span className="text-slate-800">{c.nombre}</span>
                                                </td>
                                                <td className="py-2.5 px-4">
                                                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', TIPO_STYLE[c.tipo].bg, TIPO_STYLE[c.tipo].text)}>
                                                        {c.tipo}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-4 text-xs text-slate-500">{c.naturaleza}</td>
                                                <td className="py-2.5 px-4 text-center">
                                                    {c.acepta_movimientos && <span className="w-2 h-2 bg-primary-500 rounded-full inline-block" />}
                                                </td>
                                                <td className="py-2.5 px-4 font-mono text-xs text-slate-400">{c.codigo_sri ?? '—'}</td>
                                                <td className="py-2.5 px-4">
                                                    <button onClick={() => setModalCuenta(c)} className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-md">
                                                        <Edit2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                ) : (
                                    arbol.map(c => (
                                        <CuentaFila
                                            key={c.id}
                                            cuenta={c}
                                            nivel={0}
                                            expanded={expanded}
                                            onToggle={toggleExpand}
                                            onEdit={setModalCuenta}
                                            onDelete={eliminarCuenta}
                                        />
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modal crear/editar */}
            {modalCuenta !== undefined && (
                <ModalCuenta
                    cuenta={modalCuenta}
                    empresaId={empresaActiva!.id}
                    cuentas={cuentas}
                    onClose={() => setModalCuenta(undefined)}
                    onSaved={() => { setModalCuenta(undefined); cargar() }}
                />
            )}
        </div>
    )
}




