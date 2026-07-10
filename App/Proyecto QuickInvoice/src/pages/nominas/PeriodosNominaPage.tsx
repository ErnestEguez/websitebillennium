import React, { useEffect, useState } from 'react'
import { HelpButton } from '../../components/help/HelpButton'
import { useNavigate } from 'react-router-dom'
import { Plus, Loader2, Calendar, Lock, Trash2, Eye, RefreshCw } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { periodoNominaService } from '../../services/nominas/periodoNominaService'
import type { PeriodoNomina, TipoPeriodo } from '../../types/nominas'
import { cn } from '../../lib/utils'

const fmt = (n: number) =>
    n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtFecha = (s: string) => {
    const [y, m, d] = s.split('-')
    return `${d}/${m}/${y}`
}

interface Form {
    nombre: string
    tipo_nomina: TipoPeriodo
    fecha_inicio: string
    fecha_fin: string
}

const FORM_INICIAL: Form = {
    nombre: '',
    tipo_nomina: 'mensual',
    fecha_inicio: '',
    fecha_fin: '',
}

export function PeriodosNominaPage() {
    const { empresa } = useAuth() as any
    const navigate = useNavigate()

    const [periodos, setPeriodos]   = useState<PeriodoNomina[]>([])
    const [loading, setLoading]     = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [form, setForm]           = useState<Form>(FORM_INICIAL)
    const [saving, setSaving]       = useState(false)
    const [error, setError]         = useState<string | null>(null)
    const [confirmId, setConfirmId] = useState<string | null>(null)
    const [confirmAction, setConfirmAction] = useState<'cerrar' | 'eliminar' | null>(null)

    useEffect(() => { if (empresa?.id) cargar() }, [empresa?.id])

    async function cargar() {
        setLoading(true)
        try {
            const data = await periodoNominaService.listar(empresa.id)
            setPeriodos(data)
        } catch (e: any) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    async function handleCrear(e: React.FormEvent) {
        e.preventDefault()
        if (!form.nombre.trim() || !form.fecha_inicio || !form.fecha_fin) return
        setSaving(true)
        try {
            await periodoNominaService.crear({ empresa_id: empresa.id, ...form })
            setShowModal(false)
            setForm(FORM_INICIAL)
            await cargar()
        } catch (e: any) {
            setError(e.message)
        } finally {
            setSaving(false)
        }
    }

    async function handleCerrar(id: string) {
        try {
            await periodoNominaService.cerrar(id)
            await cargar()
        } catch (e: any) {
            setError(e.message)
        } finally {
            setConfirmId(null)
            setConfirmAction(null)
        }
    }

    async function handleEliminar(id: string) {
        try {
            const count = await periodoNominaService.contarCabeceras(id)
            if (count > 0) { setError('No se puede eliminar un período con rol generado.'); return }
            await periodoNominaService.eliminar(id)
            await cargar()
        } catch (e: any) {
            setError(e.message)
        } finally {
            setConfirmId(null)
            setConfirmAction(null)
        }
    }

    function confirmar(id: string, accion: 'cerrar' | 'eliminar') {
        setConfirmId(id)
        setConfirmAction(accion)
    }

    return (
        <div className="space-y-6">
            {/* Cabecera */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Períodos de Nómina</h1>
                    <p className="text-sm text-slate-500 mt-1">Crea y gestiona los períodos de liquidación</p>
                </div>
                <div className="flex gap-2">
                    <HelpButton pageKey="periodos-nomina" />
                    <button onClick={cargar} className="p-2 text-slate-400 hover:text-slate-700 transition-colors">
                        <RefreshCw className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => { setShowModal(true); setError(null) }}
                        className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Nuevo Período
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 text-red-700 border border-red-200 rounded-xl px-4 py-3 text-sm flex items-center justify-between">
                    <span>{error}</span>
                    <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 font-bold ml-4">✕</button>
                </div>
            )}

            {/* Tabla */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                {loading ? (
                    <div className="flex justify-center py-16">
                        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                    </div>
                ) : periodos.length === 0 ? (
                    <div className="flex flex-col items-center py-20 text-slate-400">
                        <Calendar className="w-12 h-12 mb-3 opacity-40" />
                        <p className="font-semibold">Sin períodos creados</p>
                        <p className="text-sm mt-1">Crea el primer período para generar el rol de pagos</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Período</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Tipo</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Fechas</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Ingresos</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Descuentos</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Neto</th>
                                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado</th>
                                <th className="px-4 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {periodos.map(p => (
                                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-5 py-3.5">
                                        <span className="font-semibold text-slate-800 text-sm">{p.nombre}</span>
                                    </td>
                                    <td className="px-4 py-3.5">
                                        <span className={cn(
                                            'px-2 py-0.5 rounded-full text-xs font-medium',
                                            p.tipo_nomina === 'mensual'
                                                ? 'bg-blue-50 text-blue-700'
                                                : 'bg-purple-50 text-purple-700'
                                        )}>
                                            {p.tipo_nomina === 'mensual' ? 'Mensual' : 'Quincenal'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3.5 text-sm text-slate-600">
                                        {fmtFecha(p.fecha_inicio)} – {fmtFecha(p.fecha_fin)}
                                    </td>
                                    <td className="px-4 py-3.5 text-right text-sm text-emerald-700 font-medium">
                                        ${fmt(p.total_ingresos)}
                                    </td>
                                    <td className="px-4 py-3.5 text-right text-sm text-red-600 font-medium">
                                        ${fmt(p.total_descuentos)}
                                    </td>
                                    <td className="px-4 py-3.5 text-right text-sm font-bold text-slate-900">
                                        ${fmt(p.total_neto)}
                                    </td>
                                    <td className="px-4 py-3.5 text-center">
                                        <span className={cn(
                                            'px-2.5 py-0.5 rounded-full text-xs font-semibold',
                                            p.estado === 'liquidado'
                                                ? 'bg-green-100 text-green-700'
                                                : p.estado === 'cerrado'
                                                    ? 'bg-slate-100 text-slate-500'
                                                    : 'bg-amber-50 text-amber-700'
                                        )}>
                                            {p.estado === 'liquidado' ? 'Liquidado' : p.estado === 'cerrado' ? 'Cerrado' : 'Borrador'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3.5">
                                        <div className="flex items-center gap-1 justify-end">
                                            <button
                                                onClick={() => navigate(`/nominas/rol/${p.id}`)}
                                                className="p-1.5 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                                                title="Ver Rol"
                                            >
                                                <Eye className="w-4 h-4" />
                                            </button>
                                            {p.estado === 'borrador' && (
                                                <>
                                                    <button
                                                        onClick={() => confirmar(p.id, 'cerrar')}
                                                        className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors"
                                                        title="Cerrar período"
                                                    >
                                                        <Lock className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => confirmar(p.id, 'eliminar')}
                                                        className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="Eliminar"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Modal nuevo período */}
            {showModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-slate-900">Nuevo Período de Nómina</h2>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 text-xl font-bold">✕</button>
                        </div>
                        <form onSubmit={handleCrear} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del período *</label>
                                <input
                                    type="text"
                                    value={form.nombre}
                                    onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                                    placeholder="ej: Junio 2026 Mensual"
                                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de nómina *</label>
                                <div className="grid grid-cols-2 gap-3">
                                    {(['mensual', 'quincenal'] as TipoPeriodo[]).map(t => (
                                        <label
                                            key={t}
                                            className={cn(
                                                'flex items-center gap-2 border rounded-xl px-4 py-3 cursor-pointer transition-colors',
                                                form.tipo_nomina === t
                                                    ? 'border-primary-400 bg-primary-50'
                                                    : 'border-slate-200 hover:border-slate-300'
                                            )}
                                        >
                                            <input
                                                type="radio"
                                                name="tipo_nomina"
                                                value={t}
                                                checked={form.tipo_nomina === t}
                                                onChange={() => setForm(f => ({ ...f, tipo_nomina: t }))}
                                                className="accent-primary-600"
                                            />
                                            <span className="text-sm font-medium capitalize">{t === 'mensual' ? 'Mensual' : 'Quincenal'}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Fecha inicio *</label>
                                    <input
                                        type="date"
                                        value={form.fecha_inicio}
                                        onChange={e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))}
                                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Fecha fin *</label>
                                    <input
                                        type="date"
                                        value={form.fecha_fin}
                                        onChange={e => setForm(f => ({ ...f, fecha_fin: e.target.value }))}
                                        className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                                        required
                                    />
                                </div>
                            </div>
                            {error && <p className="text-sm text-red-600">{error}</p>}
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => setShowModal(false)}
                                    className="flex-1 border border-slate-300 text-slate-700 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 transition-colors">
                                    Cancelar
                                </button>
                                <button type="submit" disabled={saving}
                                    className="flex-1 bg-primary-600 hover:bg-primary-700 text-white rounded-xl py-2.5 text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Crear Período
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Diálogo de confirmación */}
            {confirmId && confirmAction && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center space-y-4">
                        <div className={cn('w-12 h-12 rounded-full flex items-center justify-center mx-auto',
                            confirmAction === 'eliminar' ? 'bg-red-100' : 'bg-amber-100')}>
                            {confirmAction === 'eliminar'
                                ? <Trash2 className="w-6 h-6 text-red-600" />
                                : <Lock className="w-6 h-6 text-amber-600" />}
                        </div>
                        <p className="font-semibold text-slate-800">
                            {confirmAction === 'cerrar'
                                ? '¿Cerrar este período?'
                                : '¿Eliminar este período?'}
                        </p>
                        <p className="text-sm text-slate-500">
                            {confirmAction === 'cerrar'
                                ? 'El período se bloqueará y no podrá editarse.'
                                : 'Esta acción no se puede deshacer.'}
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => { setConfirmId(null); setConfirmAction(null) }}
                                className="flex-1 border border-slate-300 rounded-xl py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                                Cancelar
                            </button>
                            <button
                                onClick={() => confirmAction === 'cerrar' ? handleCerrar(confirmId) : handleEliminar(confirmId)}
                                className={cn('flex-1 rounded-xl py-2 text-sm font-medium text-white transition-colors',
                                    confirmAction === 'eliminar' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700')}>
                                {confirmAction === 'cerrar' ? 'Sí, cerrar' : 'Sí, eliminar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
