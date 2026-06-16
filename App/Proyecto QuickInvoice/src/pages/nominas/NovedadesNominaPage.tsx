import { useEffect, useState, useCallback } from 'react'
import { Loader2, Plus, X, AlertCircle, ToggleLeft, ToggleRight, ChevronDown, Pencil, Check } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { novedadesNominaService } from '../../services/nominas/novedadesNominaService'
import { conceptosNominaService } from '../../services/nominas/conceptosNominaService'
import { supabase } from '../../lib/supabase'
import type { NovedadNomina, TipoNovedad, ConceptoNomina } from '../../types/nominas'
import { cn } from '../../lib/utils'

const nominas = () => supabase.schema('nominas')

const fmt = (n: number) =>
    n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const TIPO_LABELS: Record<TipoNovedad, { label: string; color: string; desc: string }> = {
    descuento_variable: { label: 'Variable',    color: 'bg-orange-50 text-orange-700',   desc: 'Monto varía cada mes' },
    descuento_fijo:     { label: 'Fijo',        color: 'bg-blue-50 text-blue-700',       desc: 'Mismo monto cada período' },
    prestamo_cuota:     { label: 'Préstamo cuota', color: 'bg-purple-50 text-purple-700', desc: 'Cuota fija hasta saldar saldo' },
    prestamo_plazo:     { label: 'Préstamo plazo', color: 'bg-indigo-50 text-indigo-700', desc: 'N cuotas iguales hasta completar' },
}

interface EmpleadoSimple { id: string; nombres: string; apellidos: string }

type FormData = {
    empleado_id: string
    concepto_id: string
    codigo: string
    nombre: string
    tipo_novedad: TipoNovedad
    fecha_inicio: string
    monto_fijo: string
    saldo_inicial: string
    n_meses: string
}

const FORM_INIT: FormData = {
    empleado_id: '',
    concepto_id: '',
    codigo: '',
    nombre: '',
    tipo_novedad: 'descuento_fijo',
    fecha_inicio: new Date().toISOString().slice(0, 10),
    monto_fijo: '',
    saldo_inicial: '',
    n_meses: '',
}

export function NovedadesNominaPage() {
    const { empresa } = useAuth() as any

    const [novedades, setNovedades]     = useState<NovedadNomina[]>([])
    const [empleados, setEmpleados]     = useState<EmpleadoSimple[]>([])
    const [conceptos, setConceptos]     = useState<ConceptoNomina[]>([])
    const [loading, setLoading]         = useState(true)
    const [error, setError]             = useState<string | null>(null)

    // Filtro por empleado
    const [filtroEmp, setFiltroEmp]     = useState('')

    // Modal
    const [showModal, setShowModal]     = useState(false)
    const [form, setForm]               = useState<FormData>(FORM_INIT)
    const [saving, setSaving]           = useState(false)
    const [formError, setFormError]     = useState<string | null>(null)

    // Confirm desactivar
    const [confirmId, setConfirmId]     = useState<string | null>(null)
    const [desactivando, setDesactivando] = useState(false)

    // Edición inline de monto para descuento_variable
    const [editMontoId, setEditMontoId]   = useState<string | null>(null)
    const [editMontoVal, setEditMontoVal] = useState('')
    const [savingMonto, setSavingMonto]   = useState(false)

    const cargar = useCallback(async () => {
        if (!empresa?.id) return
        setLoading(true)
        setError(null)
        try {
            const [novs, emps, cons] = await Promise.all([
                novedadesNominaService.listar(empresa.id),
                nominas()
                    .from('empleados')
                    .select('id, nombres, apellidos')
                    .eq('empresa_id', empresa.id)
                    .eq('activo', true)
                    .order('apellidos'),
                conceptosNominaService.listarConceptos(empresa.id),
            ])
            setNovedades(novs)
            setEmpleados((emps.data ?? []) as EmpleadoSimple[])
            setConceptos((cons as ConceptoNomina[]).filter(c => c.tipo === 'descuento'))
        } catch (e: any) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }, [empresa?.id])

    useEffect(() => { cargar() }, [cargar])

    function abrirModal() {
        setForm(FORM_INIT)
        setFormError(null)
        setShowModal(true)
    }

    function cerrarModal() {
        setShowModal(false)
        setFormError(null)
    }

    function setField(field: keyof FormData, value: string) {
        setForm(prev => {
            const next = { ...prev, [field]: value }
            // Al seleccionar concepto, autocompletar código y nombre
            if (field === 'concepto_id') {
                const c = conceptos.find(x => x.id === value)
                if (c) { next.codigo = c.codigo; next.nombre = c.nombre }
                else   { next.codigo = ''; next.nombre = '' }
            }
            return next
        })
    }

    // Cuota calculada para prestamo_plazo
    const cuotaCalculada = (() => {
        const si = parseFloat(form.saldo_inicial)
        const nm = parseInt(form.n_meses)
        if (form.tipo_novedad === 'prestamo_plazo' && si > 0 && nm > 0) {
            return Math.round(si / nm * 100) / 100
        }
        return null
    })()

    async function handleGuardar() {
        setFormError(null)
        if (!form.empleado_id) { setFormError('Selecciona un empleado'); return }
        if (!form.concepto_id) { setFormError('Selecciona un concepto'); return }
        if (!form.fecha_inicio) { setFormError('Ingresa la fecha de inicio'); return }

        if (form.tipo_novedad === 'descuento_fijo' && !parseFloat(form.monto_fijo)) {
            setFormError('Ingresa el monto fijo'); return
        }
        if (form.tipo_novedad === 'prestamo_cuota') {
            if (!parseFloat(form.saldo_inicial)) { setFormError('Ingresa el saldo inicial del préstamo'); return }
            if (!parseFloat(form.monto_fijo))    { setFormError('Ingresa la cuota mensual'); return }
        }
        if (form.tipo_novedad === 'prestamo_plazo') {
            if (!parseFloat(form.saldo_inicial)) { setFormError('Ingresa el saldo inicial del préstamo'); return }
            if (!parseInt(form.n_meses))         { setFormError('Ingresa el número de cuotas'); return }
        }

        setSaving(true)
        try {
            const payload: Parameters<typeof novedadesNominaService.crear>[0] = {
                empresa_id:   empresa.id,
                empleado_id:  form.empleado_id,
                concepto_id:  form.concepto_id || null,
                codigo:       form.codigo,
                nombre:       form.nombre,
                tipo_novedad: form.tipo_novedad,
                fecha_inicio: form.fecha_inicio,
                monto_fijo:   ['descuento_fijo','prestamo_cuota','descuento_variable'].includes(form.tipo_novedad)
                                ? parseFloat(form.monto_fijo) || null
                                : null,
                saldo_inicial:   ['prestamo_cuota','prestamo_plazo'].includes(form.tipo_novedad)
                                ? parseFloat(form.saldo_inicial) || null
                                : null,
                saldo_pendiente: ['prestamo_cuota','prestamo_plazo'].includes(form.tipo_novedad)
                                ? parseFloat(form.saldo_inicial) || null
                                : null,
                n_meses: form.tipo_novedad === 'prestamo_plazo'
                                ? parseInt(form.n_meses) || null
                                : null,
            }
            await novedadesNominaService.crear(payload)
            cerrarModal()
            await cargar()
        } catch (e: any) {
            setFormError(e.message)
        } finally {
            setSaving(false)
        }
    }

    async function handleSaveMonto(novId: string) {
        setSavingMonto(true)
        try {
            await novedadesNominaService.actualizar(novId, { monto_fijo: parseFloat(editMontoVal) || 0 })
            setEditMontoId(null)
            await cargar()
        } catch (e: any) {
            setError(e.message)
        } finally {
            setSavingMonto(false)
        }
    }

    async function handleDesactivar() {
        if (!confirmId) return
        setDesactivando(true)
        try {
            await novedadesNominaService.desactivar(confirmId)
            setConfirmId(null)
            await cargar()
        } catch (e: any) {
            setError(e.message)
        } finally {
            setDesactivando(false)
        }
    }

    const listaFiltrada = novedades.filter(n =>
        !filtroEmp || n.empleado_id === filtroEmp
    )

    if (loading) return (
        <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
    )

    return (
        <div className="space-y-6">
            {/* Cabecera */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Novedades / Descuentos</h1>
                    <p className="text-sm text-slate-500 mt-0.5">Descuentos fijos y préstamos que se aplican automáticamente en cada rol</p>
                </div>
                <button
                    onClick={abrirModal}
                    className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    Nueva Novedad
                </button>
            </div>

            {error && (
                <div className="bg-red-50 text-red-700 border border-red-200 rounded-xl px-4 py-3 text-sm flex items-center justify-between">
                    <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>
                    <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 font-bold ml-4">✕</button>
                </div>
            )}

            {/* Filtro por empleado */}
            <div className="flex items-center gap-3">
                <div className="relative w-64">
                    <select
                        value={filtroEmp}
                        onChange={e => setFiltroEmp(e.target.value)}
                        className="w-full appearance-none border border-slate-200 rounded-xl px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 bg-white"
                    >
                        <option value="">Todos los empleados</option>
                        {empleados.map(e => (
                            <option key={e.id} value={e.id}>{e.apellidos}, {e.nombres}</option>
                        ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
                <span className="text-sm text-slate-400">{listaFiltrada.length} registro{listaFiltrada.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Tabla */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                {listaFiltrada.length === 0 ? (
                    <div className="flex flex-col items-center py-16 gap-3">
                        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center">
                            <Plus className="w-6 h-6 text-slate-400" />
                        </div>
                        <p className="text-slate-500 text-sm">No hay novedades registradas</p>
                        <button onClick={abrirModal} className="text-primary-600 text-sm font-medium hover:underline">
                            Registrar primera novedad
                        </button>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Empleado</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Concepto</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Monto/Cuota</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Saldo</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Desde</th>
                                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                                <th className="px-4 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {listaFiltrada.map(nov => {
                                const tipo = TIPO_LABELS[nov.tipo_novedad]
                                const esPrestamo = nov.tipo_novedad === 'prestamo_cuota' || nov.tipo_novedad === 'prestamo_plazo'
                                const pct = esPrestamo && nov.saldo_inicial
                                    ? Math.max(0, Math.round(((nov.saldo_inicial - (nov.saldo_pendiente ?? 0)) / nov.saldo_inicial) * 100))
                                    : null

                                return (
                                    <tr key={nov.id} className={cn('hover:bg-slate-50 transition-colors', !nov.activo && 'opacity-50')}>
                                        <td className="px-5 py-3.5 text-sm font-medium text-slate-800">
                                            {nov.empleado?.apellidos}, {nov.empleado?.nombres}
                                        </td>
                                        <td className="px-4 py-3.5">
                                            <p className="text-sm text-slate-700">{nov.nombre}</p>
                                            <p className="text-xs text-slate-400 font-mono">{nov.codigo}</p>
                                        </td>
                                        <td className="px-4 py-3.5">
                                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold', tipo.color)}>
                                                {tipo.label}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3.5 text-right text-sm">
                                            {nov.tipo_novedad === 'descuento_variable' ? (
                                                editMontoId === nov.id ? (
                                                    <div className="flex items-center justify-end gap-1">
                                                        <span className="text-slate-400 text-xs">$</span>
                                                        <input
                                                            type="number" min="0" step="0.01"
                                                            value={editMontoVal}
                                                            onChange={e => setEditMontoVal(e.target.value)}
                                                            onKeyDown={e => { if (e.key === 'Enter') handleSaveMonto(nov.id); if (e.key === 'Escape') setEditMontoId(null) }}
                                                            autoFocus
                                                            className="w-24 text-right border border-primary-300 rounded-lg px-2 py-0.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                                                        />
                                                        <button onClick={() => handleSaveMonto(nov.id)} disabled={savingMonto} className="text-emerald-600 hover:text-emerald-800 disabled:opacity-40">
                                                            {savingMonto ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                                        </button>
                                                        <button onClick={() => setEditMontoId(null)} className="text-slate-400 hover:text-slate-600">
                                                            <X className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => { setEditMontoId(nov.id); setEditMontoVal(String(nov.monto_fijo ?? '')) }}
                                                        className="flex items-center justify-end gap-1.5 w-full group text-slate-700 hover:text-primary-700 transition-colors"
                                                        title="Clic para actualizar el monto de este período"
                                                    >
                                                        <span>{nov.monto_fijo != null && nov.monto_fijo > 0 ? `$${fmt(nov.monto_fijo)}` : <span className="text-slate-400 italic text-xs">sin monto</span>}</span>
                                                        <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
                                                    </button>
                                                )
                                            ) : (
                                                <span className="text-slate-700">{nov.monto_fijo != null ? `$${fmt(nov.monto_fijo)}` : '—'}</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3.5 text-right">
                                            {esPrestamo ? (
                                                <div className="flex flex-col items-end gap-1">
                                                    <span className="text-sm font-medium text-slate-700">
                                                        ${fmt(nov.saldo_pendiente ?? 0)}
                                                    </span>
                                                    {pct !== null && (
                                                        <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                            <div
                                                                className="h-full bg-primary-400 rounded-full"
                                                                style={{ width: `${pct}%` }}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-sm text-slate-400">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3.5 text-sm text-slate-500">
                                            {nov.fecha_inicio.split('-').reverse().join('/')}
                                        </td>
                                        <td className="px-4 py-3.5 text-center">
                                            {nov.activo
                                                ? <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">Activo</span>
                                                : <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-semibold">Inactivo</span>
                                            }
                                        </td>
                                        <td className="px-4 py-3.5 text-right">
                                            {nov.activo && (
                                                <button
                                                    onClick={() => setConfirmId(nov.id)}
                                                    className="text-xs text-slate-400 hover:text-red-600 transition-colors"
                                                    title="Desactivar novedad"
                                                >
                                                    <ToggleRight className="w-4 h-4" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ── Modal Nueva Novedad ── */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                            <h2 className="text-lg font-bold text-slate-900">Nueva Novedad</h2>
                            <button onClick={cerrarModal} className="text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            {formError && (
                                <div className="bg-red-50 text-red-700 border border-red-200 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 shrink-0" />{formError}
                                </div>
                            )}

                            {/* Empleado */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Empleado</label>
                                <div className="relative">
                                    <select
                                        value={form.empleado_id}
                                        onChange={e => setField('empleado_id', e.target.value)}
                                        className="w-full appearance-none border border-slate-200 rounded-xl px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                                    >
                                        <option value="">Seleccionar empleado...</option>
                                        {empleados.map(e => (
                                            <option key={e.id} value={e.id}>{e.apellidos}, {e.nombres}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                                </div>
                            </div>

                            {/* Concepto */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Concepto de descuento</label>
                                <div className="relative">
                                    <select
                                        value={form.concepto_id}
                                        onChange={e => setField('concepto_id', e.target.value)}
                                        className="w-full appearance-none border border-slate-200 rounded-xl px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                                    >
                                        <option value="">Seleccionar concepto...</option>
                                        {conceptos.map(c => (
                                            <option key={c.id} value={c.id}>{c.nombre} ({c.codigo})</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
                                </div>
                            </div>

                            {/* Tipo de novedad */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de novedad</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {(Object.entries(TIPO_LABELS) as [TipoNovedad, typeof TIPO_LABELS[TipoNovedad]][]).map(([tipo, info]) => (
                                        <label
                                            key={tipo}
                                            className={cn(
                                                'flex flex-col gap-0.5 border rounded-xl p-3 cursor-pointer transition-all',
                                                form.tipo_novedad === tipo
                                                    ? 'border-primary-400 bg-primary-50'
                                                    : 'border-slate-200 hover:border-slate-300'
                                            )}
                                        >
                                            <input
                                                type="radio"
                                                name="tipo_novedad"
                                                value={tipo}
                                                checked={form.tipo_novedad === tipo}
                                                onChange={() => setField('tipo_novedad', tipo)}
                                                className="sr-only"
                                            />
                                            <span className={cn('text-xs font-bold px-1.5 py-0.5 rounded-full self-start', info.color)}>
                                                {info.label}
                                            </span>
                                            <span className="text-xs text-slate-500">{info.desc}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Fecha inicio */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Aplicar desde</label>
                                <input
                                    type="date"
                                    value={form.fecha_inicio}
                                    onChange={e => setField('fecha_inicio', e.target.value)}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                                />
                            </div>

                            {/* Campos condicionales según tipo */}
                            {form.tipo_novedad === 'descuento_fijo' && (
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Monto fijo a descontar</label>
                                    <div className="flex items-center gap-1">
                                        <span className="text-slate-400 text-sm pl-1">$</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={form.monto_fijo}
                                            onChange={e => setField('monto_fijo', e.target.value)}
                                            placeholder="0.00"
                                            className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                                        />
                                    </div>
                                </div>
                            )}

                            {form.tipo_novedad === 'prestamo_cuota' && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Saldo total del préstamo</label>
                                        <div className="flex items-center gap-1">
                                            <span className="text-slate-400 text-sm pl-1">$</span>
                                            <input
                                                type="number" min="0" step="0.01"
                                                value={form.saldo_inicial}
                                                onChange={e => setField('saldo_inicial', e.target.value)}
                                                placeholder="0.00"
                                                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Cuota mensual a descontar</label>
                                        <div className="flex items-center gap-1">
                                            <span className="text-slate-400 text-sm pl-1">$</span>
                                            <input
                                                type="number" min="0" step="0.01"
                                                value={form.monto_fijo}
                                                onChange={e => setField('monto_fijo', e.target.value)}
                                                placeholder="0.00"
                                                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                                            />
                                        </div>
                                    </div>
                                </>
                            )}

                            {form.tipo_novedad === 'prestamo_plazo' && (
                                <>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Saldo total del préstamo</label>
                                        <div className="flex items-center gap-1">
                                            <span className="text-slate-400 text-sm pl-1">$</span>
                                            <input
                                                type="number" min="0" step="0.01"
                                                value={form.saldo_inicial}
                                                onChange={e => setField('saldo_inicial', e.target.value)}
                                                placeholder="0.00"
                                                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Número de cuotas (meses)</label>
                                        <input
                                            type="number" min="1" step="1"
                                            value={form.n_meses}
                                            onChange={e => setField('n_meses', e.target.value)}
                                            placeholder="Ej: 12"
                                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                                        />
                                    </div>
                                    {cuotaCalculada !== null && (
                                        <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3">
                                            <p className="text-xs text-indigo-600 font-semibold">Cuota mensual calculada</p>
                                            <p className="text-xl font-bold text-indigo-700 mt-0.5">${fmt(cuotaCalculada)}</p>
                                        </div>
                                    )}
                                </>
                            )}

                            {form.tipo_novedad === 'descuento_variable' && (
                                <div className="space-y-2">
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">
                                            Monto para este período
                                        </label>
                                        <div className="flex items-center gap-1">
                                            <span className="text-slate-400 text-sm pl-1">$</span>
                                            <input
                                                type="number" min="0" step="0.01"
                                                value={form.monto_fijo}
                                                onChange={e => setField('monto_fijo', e.target.value)}
                                                placeholder="0.00"
                                                className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                                            />
                                        </div>
                                    </div>
                                    <p className="text-xs text-orange-600 bg-orange-50 border border-orange-100 rounded-lg px-3 py-2">
                                        Puedes actualizar este monto cada mes desde la tabla de novedades antes de generar el rol.
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-4 border-t border-slate-100 flex gap-3 shrink-0">
                            <button onClick={cerrarModal}
                                className="flex-1 border border-slate-300 text-slate-700 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 transition-colors">
                                Cancelar
                            </button>
                            <button
                                onClick={handleGuardar}
                                disabled={saving}
                                className="flex-1 bg-primary-600 hover:bg-primary-700 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                            >
                                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                Guardar Novedad
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirm desactivar */}
            {confirmId && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center space-y-4">
                        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                            <ToggleLeft className="w-6 h-6 text-red-600" />
                        </div>
                        <p className="font-semibold text-slate-800">¿Desactivar esta novedad?</p>
                        <p className="text-sm text-slate-500">
                            Ya no se incluirá en los próximos roles. Los períodos ya generados no se ven afectados.
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmId(null)}
                                className="flex-1 border border-slate-300 rounded-xl py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                                Cancelar
                            </button>
                            <button
                                onClick={handleDesactivar}
                                disabled={desactivando}
                                className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-xl py-2 text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                            >
                                {desactivando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Desactivar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
