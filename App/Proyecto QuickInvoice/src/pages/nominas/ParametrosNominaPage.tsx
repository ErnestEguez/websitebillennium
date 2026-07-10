import { useState, useEffect } from 'react'
import { HelpButton } from '../../components/help/HelpButton'
import { useAuth } from '../../contexts/AuthContext'
import { parametrosNominaService } from '../../services/nominas/parametrosNominaService'
import type { ParametrosNomina } from '../../types/nominas'
import { Settings, Save, CheckCircle2 } from 'lucide-react'

const VALORES_DEFECTO: Omit<ParametrosNomina, 'empresa_id' | 'updated_at'> = {
    sbu: 482,
    aporte_personal_iess_pct: 9.45,
    aporte_patronal_iess_pct: 12.15,
    fondo_reserva_pct: 8.33,
}

export function ParametrosNominaPage() {
    const { empresa } = useAuth()
    const [valores, setValores] = useState<Omit<ParametrosNomina, 'empresa_id' | 'updated_at'>>(VALORES_DEFECTO)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)

    useEffect(() => {
        if (empresa?.id) loadData()
    }, [empresa?.id])

    async function loadData() {
        try {
            setLoading(true)
            const data = await parametrosNominaService.obtener(empresa!.id)
            if (data) {
                setValores({
                    sbu: data.sbu,
                    aporte_personal_iess_pct: data.aporte_personal_iess_pct,
                    aporte_patronal_iess_pct: data.aporte_patronal_iess_pct,
                    fondo_reserva_pct: data.fondo_reserva_pct,
                })
            }
        } catch (e) {
            console.error(e)
            alert('Error al cargar los parámetros de nómina')
        } finally {
            setLoading(false)
        }
    }

    async function handleSave() {
        try {
            setSaving(true)
            setSaved(false)
            await parametrosNominaService.guardar(empresa!.id, valores)
            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
        } catch (e: any) {
            alert(`Error al guardar: ${e.message}`)
        } finally {
            setSaving(false)
        }
    }

    function setCampo(campo: keyof typeof valores, valor: string) {
        const num = parseFloat(valor)
        setValores(v => ({ ...v, [campo]: isNaN(num) ? 0 : num }))
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-slate-500">Cargando parámetros de nómina...</div>
            </div>
        )
    }

    return (
        <div className="space-y-6 max-w-2xl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Parámetros de Nómina</h1>
                    <p className="text-slate-600 mt-1">Configuración general para el cálculo del rol de pagos</p>
                </div>
                <HelpButton pageKey="parametros-nomina" />
            </div>

            <div className="card overflow-hidden">
                <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-200">
                    <Settings className="w-5 h-5 text-cyan-600" />
                    <h2 className="text-lg font-semibold text-slate-900">Ecuador — Valores generales</h2>
                </div>

                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Salario Básico Unificado (SBU)
                        </label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={valores.sbu}
                                onChange={e => setCampo('sbu', e.target.value)}
                                className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            />
                        </div>
                        <p className="text-xs text-slate-500 mt-1">Usado como referencia para décimos, fondos de reserva y validación del sueldo mínimo.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Aporte personal IESS</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max="100"
                                    value={valores.aporte_personal_iess_pct}
                                    onChange={e => setCampo('aporte_personal_iess_pct', e.target.value)}
                                    className="w-full pl-4 pr-8 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">%</span>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Aporte patronal IESS</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max="100"
                                    value={valores.aporte_patronal_iess_pct}
                                    onChange={e => setCampo('aporte_patronal_iess_pct', e.target.value)}
                                    className="w-full pl-4 pr-8 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">%</span>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Fondo de reserva</label>
                        <div className="relative max-w-[50%]">
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                max="100"
                                value={valores.fondo_reserva_pct}
                                onChange={e => setCampo('fondo_reserva_pct', e.target.value)}
                                className="w-full pl-4 pr-8 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                            />
                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">%</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">Aplica a partir del mes 13 de relación laboral continua.</p>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-slate-200 flex items-center gap-3 justify-end">
                    {saved && (
                        <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                            <CheckCircle2 className="w-4 h-4" />
                            Guardado
                        </span>
                    )}
                    <button
                        onClick={handleSave}
                        className="btn btn-primary flex items-center gap-2"
                        disabled={saving}
                    >
                        {saving ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                            <Save className="w-4 h-4" />
                        )}
                        Guardar
                    </button>
                </div>
            </div>
        </div>
    )
}
