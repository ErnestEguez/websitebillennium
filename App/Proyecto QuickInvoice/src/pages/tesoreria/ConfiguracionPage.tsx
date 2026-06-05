import { useEffect, useState } from 'react'
import { Settings, Loader2, AlertCircle, X, CheckCircle2, Save } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { configuracionService } from '../../services/finance/bancosService'
import type { ConfiguracionEmpresa } from '../../types/finance'

export function ConfiguracionPage() {
    const { empresa, user } = useAuth()

    const [config, setConfig]   = useState<ConfiguracionEmpresa | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving]   = useState(false)
    const [error, setError]     = useState('')
    const [ok, setOk]           = useState(false)

    const [form, setForm] = useState({
        enlace_contable:         false,
        prefijo_egreso:          'EGR',
        tipo_secuencia_egreso:   'anual' as 'mensual' | 'anual',
        consideracion_cheques:   'emision' as 'emision' | 'cobro',
    })

    useEffect(() => {
        if (!empresa?.id) { setLoading(false); return }
        configuracionService.obtener(empresa.id)
            .then(c => {
                if (c) {
                    setConfig(c)
                    setForm({
                        enlace_contable:       c.enlace_contable,
                        prefijo_egreso:        c.prefijo_egreso,
                        tipo_secuencia_egreso: c.tipo_secuencia_egreso ?? 'anual',
                        consideracion_cheques: c.consideracion_cheques ?? 'emision',
                    })
                }
            })
            .catch(() => {})
            .finally(() => setLoading(false))
    }, [empresa?.id])

    async function guardar() {
        if (!empresa?.id) return
        setSaving(true); setError(''); setOk(false)
        try {
            const result = await configuracionService.upsert(empresa.id, {
                enlace_contable:          form.enlace_contable,
                cuenta_banco_defecto_id:  config?.cuenta_banco_defecto_id ?? null,
                cuenta_cxp_defecto_id:    config?.cuenta_cxp_defecto_id ?? null,
                cuenta_ret_fuente_id:     config?.cuenta_ret_fuente_id ?? null,
                cuenta_ret_iva_id:        config?.cuenta_ret_iva_id ?? null,
                prefijo_egreso:           form.prefijo_egreso || 'EGR',
                siguiente_numero_egreso:  config?.siguiente_numero_egreso ?? 1,
                tipo_secuencia_egreso:    form.tipo_secuencia_egreso,
                consideracion_cheques:    form.consideracion_cheques,
            })
            setConfig(result)
            setOk(true)
            setTimeout(() => setOk(false), 3000)
        } catch (e: unknown) { setError(String(e)) }
        finally { setSaving(false) }
    }

    if (loading) return (
        <div className="py-24 text-center text-slate-400">
            <Loader2 className="w-7 h-7 animate-spin inline mr-2" />Cargando configuración...
        </div>
    )

    return (
        <div className="space-y-5 max-w-2xl">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Configuración Finance Suite</h1>
                <p className="text-slate-500 text-sm mt-0.5">Parámetros de la empresa para el módulo financiero</p>
            </div>

            {error && (
                <div className="card px-4 py-3 bg-red-50 border-red-200 text-red-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" /><span className="flex-1">{error}</span>
                    <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
                </div>
            )}

            {ok && (
                <div className="card px-4 py-3 bg-green-50 border-green-200 text-green-700 text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />Configuración guardada correctamente
                </div>
            )}

            <div className="card divide-y">
                {/* Empresa info */}
                <div className="p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <Settings className="w-4 h-4 text-slate-500" />
                        <h2 className="font-semibold text-slate-800">Información de empresa</h2>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <p className="text-slate-500 text-xs mb-1">Empresa</p>
                            <p className="font-semibold">{empresa?.nombre ?? '—'}</p>
                        </div>
                        <div>
                            <p className="text-slate-500 text-xs mb-1">RUC</p>
                            <p className="font-mono font-semibold">{empresa?.ruc ?? '—'}</p>
                        </div>
                        <div>
                            <p className="text-slate-500 text-xs mb-1">Usuario activo</p>
                            <p className="font-semibold">{user?.email ?? '—'}</p>
                        </div>
                        <div>
                            <p className="text-slate-500 text-xs mb-1">Siguiente N° egreso</p>
                            <p className="font-mono font-semibold text-primary-700">
                                {form.prefijo_egreso}-{String(config?.siguiente_numero_egreso ?? 1).padStart(6, '0')}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Numeración */}
                <div className="p-5">
                    <h2 className="font-semibold text-slate-800 mb-4">Numeración de documentos</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="label">Prefijo comprobante de egreso</label>
                            <input className="input w-40 font-mono uppercase"
                                value={form.prefijo_egreso}
                                onChange={e => setForm(f => ({ ...f, prefijo_egreso: e.target.value.toUpperCase() }))}
                                maxLength={5}
                                placeholder="EGR" />
                        </div>
                        <div>
                            <label className="label">Secuencia de numeración</label>
                            <div className="flex gap-4 mt-1">
                                {(['anual', 'mensual'] as const).map(op => (
                                    <label key={op} className="flex items-center gap-2 cursor-pointer">
                                        <input type="radio" className="accent-primary-600"
                                            checked={form.tipo_secuencia_egreso === op}
                                            onChange={() => setForm(f => ({ ...f, tipo_secuencia_egreso: op }))} />
                                        <span className="text-sm text-slate-700 capitalize">{op}</span>
                                    </label>
                                ))}
                            </div>
                            <p className="text-xs text-slate-400 mt-2">
                                Ejemplo: <span className="font-mono font-bold">
                                    {form.prefijo_egreso || 'EGR'}-{
                                        form.tipo_secuencia_egreso === 'mensual'
                                            ? `${new Date().getFullYear()}${String(new Date().getMonth()+1).padStart(2,'0')}`
                                            : new Date().getFullYear()
                                    }-000001
                                </span>
                            </p>
                        </div>
                    </div>
                </div>

                {/* Cheques — consideración bancaria */}
                <div className="p-5">
                    <h2 className="font-semibold text-slate-800 mb-1">Consideración de cheques al día</h2>
                    <p className="text-xs text-slate-500 mb-4">
                        Define cuándo un cheque regular (no post-fechado) afecta el saldo bancario. Los post-fechados siempre se consideran al cobro.
                    </p>
                    <div className="flex gap-6">
                        {([
                            { v: 'emision', label: 'En la emisión', desc: 'El saldo baja al generar el egreso' },
                            { v: 'cobro',   label: 'Al cobro',      desc: 'Solo baja al marcarlo cobrado en ChequesAFecha' },
                        ] as const).map(op => (
                            <label key={op.v} className="flex items-start gap-3 cursor-pointer group">
                                <input type="radio" className="accent-primary-600 mt-0.5"
                                    checked={form.consideracion_cheques === op.v}
                                    onChange={() => setForm(f => ({ ...f, consideracion_cheques: op.v }))} />
                                <div>
                                    <p className="text-sm font-medium text-slate-800 group-hover:text-primary-700">{op.label}</p>
                                    <p className="text-xs text-slate-400">{op.desc}</p>
                                </div>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Enlace contable */}
                <div className="p-5">
                    <h2 className="font-semibold text-slate-800 mb-1">Integración contable</h2>
                    <p className="text-xs text-slate-500 mb-4">
                        Activa el enlace con el módulo de contabilidad (LedgerPro) para generar asientos automáticos.
                    </p>
                    <label className="flex items-start gap-3 cursor-pointer group">
                        <div className="relative mt-0.5">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={form.enlace_contable}
                                onChange={e => setForm(f => ({ ...f, enlace_contable: e.target.checked }))} />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:ring-2 peer-focus:ring-primary-400 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                        </div>
                        <div>
                            <p className="font-medium text-slate-800 group-hover:text-primary-700">
                                Enlace contable activo
                            </p>
                            <p className="text-xs text-slate-500">
                                Al activar, cada pago de egreso generará automáticamente un comprobante contable en LedgerPro.
                            </p>
                        </div>
                    </label>
                    {form.enlace_contable && (
                        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                            Asegúrate de tener configurado el plan de cuentas en LedgerPro antes de activar esta opción.
                        </div>
                    )}
                </div>
            </div>

            <div className="flex justify-end">
                <button onClick={guardar} disabled={saving} className="btn btn-primary gap-2">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Guardar configuración
                </button>
            </div>
        </div>
    )
}




