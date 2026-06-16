import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { cuentasNominaService } from '../../services/nominas/cuentasNominaService'
import type { CuentasNomina } from '../../types/nominas'
import { Save, Loader2, BookOpen } from 'lucide-react'

const EMPTY_CUENTAS: CuentasNomina = {
    empresa_id: '',
    cta_sueldos: null,
    cta_horas_extra: null,
    cta_dec_tercero: null,
    cta_dec_cuarto: null,
    cta_fondo_reserva: null,
    cta_iess_patronal: null,
    cta_vacaciones: null,
    cta_sueldos_pagar: null,
    cta_iess_pagar: null,
    cta_prov_dec_tercero: null,
    cta_prov_dec_cuarto: null,
    cta_prov_fondo_reserva: null,
    cta_prov_vacaciones: null,
    cta_anticipos_empleados: null,
}

interface Campo {
    key: keyof CuentasNomina
    label: string
    hint?: string
}

const GASTOS: Campo[] = [
    { key: 'cta_sueldos',       label: 'Gasto Sueldos y Salarios',       hint: 'Ej: 6101.01' },
    { key: 'cta_horas_extra',   label: 'Gasto Horas Extra',              hint: 'Ej: 6101.02' },
    { key: 'cta_dec_tercero',   label: 'Gasto Décimo Tercero',           hint: 'Ej: 6101.04' },
    { key: 'cta_dec_cuarto',    label: 'Gasto Décimo Cuarto',            hint: 'Ej: 6101.05' },
    { key: 'cta_fondo_reserva', label: 'Gasto Fondo de Reserva',        hint: 'Ej: 6101.06' },
    { key: 'cta_iess_patronal', label: 'Gasto Aporte Patronal IESS',    hint: 'Ej: 6101.03' },
    { key: 'cta_vacaciones',    label: 'Gasto Provisión Vacaciones',     hint: 'Ej: 6101.07' },
]

const PASIVOS: Campo[] = [
    { key: 'cta_sueldos_pagar',      label: 'Sueldos por Pagar (neto)',           hint: 'Ej: 2101.01' },
    { key: 'cta_iess_pagar',         label: 'IESS por Pagar (pers. + patron.)',   hint: 'Ej: 2101.02' },
    { key: 'cta_prov_dec_tercero',   label: 'Provisión Décimo Tercero',           hint: 'Ej: 2102.01' },
    { key: 'cta_prov_dec_cuarto',    label: 'Provisión Décimo Cuarto',            hint: 'Ej: 2102.02' },
    { key: 'cta_prov_fondo_reserva', label: 'Provisión Fondo de Reserva',        hint: 'Ej: 2102.03' },
    { key: 'cta_prov_vacaciones',    label: 'Provisión Vacaciones',               hint: 'Ej: 2102.04' },
]

const ACTIVOS: Campo[] = [
    { key: 'cta_anticipos_empleados', label: 'Préstamos / Anticipos a Empleados', hint: 'Ej: 1204.01' },
]

export function CuentasNominaPage() {
    const { empresa } = useAuth() as any
    const [form, setForm]   = useState<CuentasNomina>({ ...EMPTY_CUENTAS })
    const [loading, setLoading] = useState(true)
    const [saving, setSaving]   = useState(false)
    const [success, setSuccess] = useState(false)
    const [error, setError]     = useState<string | null>(null)

    useEffect(() => {
        if (empresa?.id) cargar()
    }, [empresa?.id])

    async function cargar() {
        setLoading(true)
        try {
            const data = await cuentasNominaService.obtener(empresa.id)
            setForm(data ? { ...data } : { ...EMPTY_CUENTAS, empresa_id: empresa.id })
        } catch (e: any) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    function set(key: keyof CuentasNomina, val: string) {
        setForm(f => ({ ...f, [key]: val || null }))
    }

    async function handleSave(e: React.FormEvent) {
        e.preventDefault()
        setSaving(true)
        setSuccess(false)
        setError(null)
        try {
            await cuentasNominaService.guardar({ ...form, empresa_id: empresa.id })
            setSuccess(true)
            setTimeout(() => setSuccess(false), 3000)
        } catch (e: any) {
            setError(e.message)
        } finally {
            setSaving(false)
        }
    }

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
    )

    return (
        <div className="space-y-6 max-w-3xl">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Cuentas Contables de Nómina</h1>
                <p className="text-sm text-slate-500 mt-1">
                    Mapea las cuentas del plan contable para generar los asientos del rol de pagos
                </p>
            </div>

            {error && (
                <div className="bg-red-50 text-red-700 border border-red-200 rounded-xl px-4 py-3 text-sm flex items-center justify-between">
                    <span>{error}</span>
                    <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 font-bold ml-4">✕</button>
                </div>
            )}
            {success && (
                <div className="bg-green-50 text-green-700 border border-green-200 rounded-xl px-4 py-3 text-sm font-medium">
                    Cuentas guardadas correctamente.
                </div>
            )}

            <form onSubmit={handleSave} className="space-y-6">

                {/* Gastos */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="bg-red-50 border-b border-red-100 px-5 py-3 flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-red-600" />
                        <h2 className="text-sm font-bold text-red-700 uppercase tracking-wide">Gastos de Nómina (Débito)</h2>
                    </div>
                    <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {GASTOS.map(({ key, label, hint }) => (
                            <div key={key as string}>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
                                <input
                                    type="text"
                                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-400"
                                    value={(form[key] as string) ?? ''}
                                    onChange={e => set(key, e.target.value)}
                                    placeholder={hint}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Pasivos */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="bg-amber-50 border-b border-amber-100 px-5 py-3 flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-amber-600" />
                        <h2 className="text-sm font-bold text-amber-700 uppercase tracking-wide">Pasivos / Cuentas por Pagar (Crédito)</h2>
                    </div>
                    <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {PASIVOS.map(({ key, label, hint }) => (
                            <div key={key as string}>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
                                <input
                                    type="text"
                                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-400"
                                    value={(form[key] as string) ?? ''}
                                    onChange={e => set(key, e.target.value)}
                                    placeholder={hint}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {/* Activos */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <div className="bg-blue-50 border-b border-blue-100 px-5 py-3 flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-blue-600" />
                        <h2 className="text-sm font-bold text-blue-700 uppercase tracking-wide">Activos (Crédito al descontar préstamos)</h2>
                    </div>
                    <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {ACTIVOS.map(({ key, label, hint }) => (
                            <div key={key as string}>
                                <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
                                <input
                                    type="text"
                                    className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-400"
                                    value={(form[key] as string) ?? ''}
                                    onChange={e => set(key, e.target.value)}
                                    placeholder={hint}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={saving}
                        className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {saving ? 'Guardando...' : 'Guardar Cuentas'}
                    </button>
                </div>
            </form>
        </div>
    )
}
