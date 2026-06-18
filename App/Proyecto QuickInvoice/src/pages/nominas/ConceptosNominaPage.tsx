import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { conceptosNominaService } from '../../services/nominas/conceptosNominaService'
import { contableConfigService, type CuentaLP } from '../../services/contableConfigService'
import type { ConceptoNomina, TipoConcepto, FormulaConcepto } from '../../types/nominas'
import { BookOpen, Plus, Edit2, Save, X, UserX, RotateCcw, Loader2, Download } from 'lucide-react'
import { cn } from '../../lib/utils'

const EMPTY: Omit<ConceptoNomina, 'id' | 'empresa_id' | 'created_at' | 'updated_at' | 'activo' | 'es_legal'> = {
    codigo: '',
    nombre: '',
    tipo: 'ingreso',
    formula: 'fijo',
    valor_predeterminado: null,
    afecta_iess: false,
    afecta_renta: false,
    aplica_siempre: false,
    orden: 99,
    cuenta_contable: null,
}

const LABELS_FORMULA: Record<FormulaConcepto, string> = {
    calculado: 'Calculado (sistema)',
    fijo: 'Monto fijo',
    porcentaje_sueldo: '% del sueldo base',
    porcentaje_sbu: '% del SBU',
}

export function ConceptosNominaPage() {
    const { empresa } = useAuth()
    const [conceptos, setConceptos] = useState<ConceptoNomina[]>([])
    const [loading, setLoading] = useState(true)
    const [sembrando, setSembrando] = useState(false)

    const [cuentasLP, setCuentasLP] = useState<CuentaLP[]>([])
    const [filtroCuenta, setFiltroCuenta] = useState('')

    const [modalOpen, setModalOpen] = useState(false)
    const [editando, setEditando] = useState<(typeof EMPTY) & { id?: string; es_legal?: boolean }>({ ...EMPTY })
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (empresa?.id) loadData()
    }, [empresa?.id])

    async function loadData() {
        try {
            setLoading(true)
            const [data, ctasLP] = await Promise.all([
                conceptosNominaService.listarConceptosTodos(empresa!.id),
                contableConfigService.getCuentas((empresa as any).ruc).catch(() => [] as CuentaLP[]),
            ])
            setConceptos(data)
            setCuentasLP(ctasLP)
        } catch (e) {
            console.error(e)
            alert('Error al cargar conceptos')
        } finally {
            setLoading(false)
        }
    }

    async function handleSembrar() {
        try {
            setSembrando(true)
            await conceptosNominaService.sembrarEstandares(empresa!.id)
            await loadData()
        } catch (e: any) {
            alert(`Error al cargar estándares: ${e.message}`)
        } finally {
            setSembrando(false)
        }
    }

    function abrirNuevo() {
        setEditando({ ...EMPTY })
        setFiltroCuenta('')
        setModalOpen(true)
    }

    function abrirEditar(c: ConceptoNomina) {
        setEditando({
            id: c.id,
            es_legal: c.es_legal,
            codigo: c.codigo,
            nombre: c.nombre,
            tipo: c.tipo,
            formula: c.formula,
            valor_predeterminado: c.valor_predeterminado ?? null,
            afecta_iess: c.afecta_iess,
            afecta_renta: c.afecta_renta,
            aplica_siempre: c.aplica_siempre,
            orden: c.orden,
            cuenta_contable: c.cuenta_contable ?? null,
        })
        setFiltroCuenta('')
        setModalOpen(true)
    }

    async function handleSave() {
        if (!editando.codigo.trim() || !editando.nombre.trim()) {
            alert('Código y nombre son obligatorios')
            return
        }
        try {
            setSaving(true)
            const payload = {
                empresa_id: empresa!.id,
                codigo: editando.codigo.trim().toUpperCase(),
                nombre: editando.nombre.trim(),
                tipo: editando.tipo,
                formula: editando.formula,
                valor_predeterminado: editando.formula !== 'calculado' ? (Number(editando.valor_predeterminado) || null) : null,
                afecta_iess: editando.afecta_iess,
                afecta_renta: editando.afecta_renta,
                aplica_siempre: editando.aplica_siempre,
                orden: Number(editando.orden) || 99,
                cuenta_contable: editando.cuenta_contable?.trim() || null,
            }
            if (editando.id) {
                await conceptosNominaService.actualizarConcepto(editando.id, payload)
            } else {
                await conceptosNominaService.crearConcepto({ ...payload, es_legal: false })
            }
            setModalOpen(false)
            await loadData()
        } catch (e: any) {
            alert(`Error al guardar: ${e.message}`)
        } finally {
            setSaving(false)
        }
    }

    async function handleToggle(c: ConceptoNomina) {
        try {
            if (c.activo) {
                await conceptosNominaService.desactivarConcepto(c.id)
            } else {
                await conceptosNominaService.actualizarConcepto(c.id, { activo: true })
            }
            await loadData()
        } catch (e: any) {
            alert(`Error: ${e.message}`)
        }
    }

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-500" />
        </div>
    )

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Conceptos de Nómina</h1>
                    <p className="text-slate-600 mt-1">Catálogo de rubros de ingreso y descuento para el rol de pagos</p>
                </div>
                <div className="flex gap-3">
                    {conceptos.length === 0 && (
                        <button onClick={handleSembrar} disabled={sembrando}
                            className="btn btn-secondary flex items-center gap-2">
                            {sembrando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            Cargar estándares Ecuador
                        </button>
                    )}
                    <button onClick={abrirNuevo} className="btn btn-primary flex items-center gap-2">
                        <Plus className="w-4 h-4" /> Nuevo Concepto
                    </button>
                </div>
            </div>

            <div className="card overflow-hidden">
                {conceptos.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                        <BookOpen className="w-12 h-12 mb-4 opacity-40" />
                        <p className="font-semibold mb-2">Sin conceptos de nómina</p>
                        <p className="text-sm mb-4">Carga los conceptos estándar de Ecuador o crea los tuyos.</p>
                        <button onClick={handleSembrar} disabled={sembrando}
                            className="btn btn-primary flex items-center gap-2">
                            {sembrando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            Cargar estándares Ecuador
                        </button>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">Código</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">Nombre</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">Tipo</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">Fórmula</th>
                                <th className="text-center px-4 py-3 font-semibold text-slate-600">IESS</th>
                                <th className="text-center px-4 py-3 font-semibold text-slate-600">IR</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">Estado</th>
                                <th className="px-4 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {conceptos.map(c => (
                                <tr key={c.id} className={cn('hover:bg-slate-50 transition-colors', !c.activo && 'opacity-50')}>
                                    <td className="px-4 py-3 font-mono text-xs font-bold text-slate-700">{c.codigo}</td>
                                    <td className="px-4 py-3 font-medium text-slate-900">
                                        {c.nombre}
                                        {c.es_legal && <span className="ml-2 text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded font-semibold">Ley</span>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', c.tipo === 'ingreso' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700')}>
                                            {c.tipo === 'ingreso' ? '+ Ingreso' : '− Descuento'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-500 text-xs">{LABELS_FORMULA[c.formula]}{c.valor_predeterminado != null ? ` (${c.valor_predeterminado})` : ''}</td>
                                    <td className="px-4 py-3 text-center text-slate-400">{c.afecta_iess ? '✓' : '—'}</td>
                                    <td className="px-4 py-3 text-center text-slate-400">{c.afecta_renta ? '✓' : '—'}</td>
                                    <td className="px-4 py-3">
                                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', c.activo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500')}>
                                            {c.activo ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2 justify-end">
                                            <button onClick={() => abrirEditar(c)} title="Editar"
                                                className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-600 hover:bg-cyan-50 transition-colors">
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => !c.es_legal && handleToggle(c)}
                                                disabled={c.es_legal}
                                                title={c.es_legal ? 'Concepto de ley — no puede darse de baja' : c.activo ? 'Dar de baja' : 'Reactivar'}
                                                className={cn('p-1.5 rounded-lg transition-colors', c.es_legal
                                                    ? 'text-slate-200 cursor-not-allowed'
                                                    : c.activo
                                                        ? 'text-slate-400 hover:text-red-500 hover:bg-red-50'
                                                        : 'text-slate-400 hover:text-green-600 hover:bg-green-50')}>
                                                {c.activo ? <UserX className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ── Modal ── */}
            {modalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <h2 className="text-lg font-bold text-slate-900">
                                {editando.id ? 'Editar Concepto' : 'Nuevo Concepto'}
                            </h2>
                            <button onClick={() => setModalOpen(false)}
                                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="px-6 py-5 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Código *</label>
                                    <input className="input w-full font-mono uppercase"
                                        value={editando.codigo}
                                        onChange={e => setEditando(v => ({ ...v, codigo: e.target.value.toUpperCase() }))}
                                        placeholder="BONO_ANTIG"
                                        disabled={!!editando.es_legal} />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo</label>
                                    <select className="input w-full" value={editando.tipo}
                                        onChange={e => setEditando(v => ({ ...v, tipo: e.target.value as TipoConcepto }))}
                                        disabled={!!editando.es_legal}>
                                        <option value="ingreso">Ingreso (+)</option>
                                        <option value="descuento">Descuento (−)</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre *</label>
                                <input className="input w-full" value={editando.nombre}
                                    onChange={e => setEditando(v => ({ ...v, nombre: e.target.value }))}
                                    placeholder="Ej: Bono de Antigüedad" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">Fórmula</label>
                                    <select className="input w-full" value={editando.formula}
                                        onChange={e => setEditando(v => ({ ...v, formula: e.target.value as FormulaConcepto }))}
                                        disabled={!!editando.es_legal}>
                                        <option value="calculado">Calculado (sistema)</option>
                                        <option value="fijo">Monto fijo</option>
                                        <option value="porcentaje_sueldo">% del sueldo base</option>
                                        <option value="porcentaje_sbu">% del SBU</option>
                                    </select>
                                </div>
                                {editando.formula !== 'calculado' && (
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1">
                                            {editando.formula === 'fijo' ? 'Monto (USD)' : 'Porcentaje (%)'}
                                        </label>
                                        <input type="number" step="0.01" min="0" className="input w-full"
                                            value={editando.valor_predeterminado ?? ''}
                                            onChange={e => setEditando(v => ({ ...v, valor_predeterminado: e.target.value ? parseFloat(e.target.value) : null }))}
                                            placeholder={editando.formula === 'fijo' ? '50.00' : '8.33'} />
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-4 pt-1">
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input type="checkbox" className="w-4 h-4 rounded accent-cyan-600"
                                        checked={editando.afecta_iess}
                                        onChange={e => setEditando(v => ({ ...v, afecta_iess: e.target.checked }))} />
                                    <span className="text-sm text-slate-700">Afecta base IESS</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input type="checkbox" className="w-4 h-4 rounded accent-cyan-600"
                                        checked={editando.afecta_renta}
                                        onChange={e => setEditando(v => ({ ...v, afecta_renta: e.target.checked }))} />
                                    <span className="text-sm text-slate-700">Afecta base IR</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer select-none">
                                    <input type="checkbox" className="w-4 h-4 rounded accent-cyan-600"
                                        checked={editando.aplica_siempre}
                                        onChange={e => setEditando(v => ({ ...v, aplica_siempre: e.target.checked }))} />
                                    <span className="text-sm text-slate-700">Aplica en todo rol</span>
                                </label>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Orden en papeleta</label>
                                <input type="number" min="1" step="1" className="input w-full"
                                    value={editando.orden}
                                    onChange={e => setEditando(v => ({ ...v, orden: parseInt(e.target.value) || 99 }))} />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">Cuenta contable</label>
                                {cuentasLP.length > 0 ? (
                                    <div className="space-y-1">
                                        <input
                                            type="text"
                                            className="input w-full text-xs"
                                            placeholder="Filtrar por código o nombre..."
                                            value={filtroCuenta}
                                            onChange={e => setFiltroCuenta(e.target.value)}
                                        />
                                        <select
                                            className="input w-full text-xs font-mono"
                                            value={editando.cuenta_contable ?? ''}
                                            onChange={e => setEditando(v => ({ ...v, cuenta_contable: e.target.value || null }))}
                                        >
                                            <option value="">— Sin asignar —</option>
                                            {cuentasLP
                                                .filter(ct => !filtroCuenta.trim() ||
                                                    ct.codigo.toLowerCase().includes(filtroCuenta.toLowerCase()) ||
                                                    ct.nombre.toLowerCase().includes(filtroCuenta.toLowerCase()))
                                                .map(ct => (
                                                    <option key={ct.id} value={ct.codigo}>{ct.codigo} — {ct.nombre}</option>
                                                ))}
                                        </select>
                                    </div>
                                ) : (
                                    <input type="text" className="input w-full font-mono"
                                        value={editando.cuenta_contable ?? ''}
                                        onChange={e => setEditando(v => ({ ...v, cuenta_contable: e.target.value || null }))}
                                        placeholder="ej: 6101.01" />
                                )}
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
                            <button onClick={() => setModalOpen(false)}
                                className="btn btn-secondary flex items-center gap-2">
                                <X className="w-4 h-4" /> Cancelar
                            </button>
                            <button onClick={handleSave} disabled={saving}
                                className="btn btn-primary flex items-center gap-2">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                {saving ? 'Guardando...' : 'Guardar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
