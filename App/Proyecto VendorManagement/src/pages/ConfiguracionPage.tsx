import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { contabilidadService, CAMPOS_CUENTAS } from '../services/contabilidadService'
import type { CuentasCompras } from '../services/contabilidadService'
import { Settings, Save, Loader2, BookOpen, ShoppingCart, AlertTriangle } from 'lucide-react'
import { cn } from '../lib/utils'

const EMPTY_CUENTAS: CuentasCompras = {
    inventarios: '', gastos_servicios: '', iva_compras: '',
    cuentas_por_pagar: '', efectivo: '', ret_fuente: '', ret_iva: '',
}

export function ConfiguracionPage() {
    const { empresa, profile } = useAuth()
    const navigate = useNavigate()
    const [saving, setSaving]         = useState(false)
    const [loading, setLoading]       = useState(true)

    // Only admin_plataforma can access this page
    useEffect(() => {
        if (profile && profile.rol !== 'admin_plataforma') {
            navigate('/', { replace: true })
        }
    }, [profile])
    const [loadingCuentas, setLoadingCuentas] = useState(false)

    const [usarContabilidad, setUsarContabilidad] = useState(false)
    const [usarVendor, setUsarVendor]             = useState(false)
    const [cuentas, setCuentas]                   = useState<CuentasCompras>(EMPTY_CUENTAS)
    const [listaCuentas, setListaCuentas]         = useState<{ id: string; codigo: string; nombre: string }[]>([])
    const [migNecesaria, setMigNecesaria]         = useState(false)

    useEffect(() => {
        if (!empresa?.id) return
        supabase
            .from('empresas')
            .select('usar_contabilidad_compras, usar_vendor_management, config_cuentas_compras')
            .eq('id', empresa.id)
            .single()
            .then(({ data, error }) => {
                if (error) {
                    if (error.code === '42703') setMigNecesaria(true)
                } else if (data) {
                    setUsarContabilidad(!!data.usar_contabilidad_compras)
                    setUsarVendor(!!data.usar_vendor_management)
                    if (data.config_cuentas_compras) setCuentas({ ...EMPTY_CUENTAS, ...data.config_cuentas_compras })
                }
            })
            .finally(() => setLoading(false))
    }, [empresa?.id])

    useEffect(() => {
        if (!usarContabilidad || !empresa?.id || listaCuentas.length > 0) return
        setLoadingCuentas(true)
        contabilidadService.listarCuentas(empresa.id)
            .then(data => setListaCuentas(data))
            .catch(() => {})
            .finally(() => setLoadingCuentas(false))
    }, [usarContabilidad, empresa?.id])

    async function guardar() {
        if (!empresa?.id) return
        try {
            setSaving(true)
            const payload: Record<string, unknown> = {
                usar_vendor_management:    usarVendor,
                usar_contabilidad_compras: usarContabilidad,
                config_cuentas_compras:    usarContabilidad ? cuentas : null,
            }
            const { error } = await supabase.from('empresas').update(payload).eq('id', empresa.id)
            if (error) {
                if (error.code === '42703') {
                    setMigNecesaria(true)
                    alert('Primero ejecuta la migración SQL en Supabase. Ver instrucciones abajo.')
                } else {
                    throw error
                }
            } else {
                alert('Configuración guardada correctamente.')
            }
        } catch (e: any) {
            alert('Error: ' + e.message)
        } finally {
            setSaving(false)
        }
    }

    if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Cargando...</div>

    return (
        <div className="max-w-2xl space-y-6">
            <div className="flex items-center gap-3">
                <div className="p-3 bg-primary-50 text-primary-600 rounded-2xl">
                    <Settings className="w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Configuración</h1>
                    <p className="text-slate-500 text-sm">Módulos y cuentas contables — solo visible para administradores</p>
                </div>
            </div>

            {/* Aviso migración pendiente */}
            {migNecesaria && (
                <div className="card p-4 border-amber-200 bg-amber-50 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-sm">
                        <p className="font-bold text-amber-800">Migración SQL pendiente</p>
                        <p className="text-amber-700 mt-1">Ejecuta en Supabase → SQL Editor:</p>
                        <pre className="mt-2 bg-amber-100 rounded p-2 text-xs font-mono whitespace-pre-wrap">
{`ALTER TABLE facturacion.empresas
  ADD COLUMN IF NOT EXISTS usar_contabilidad_compras BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS config_cuentas_compras JSONB DEFAULT '{}';`}
                        </pre>
                    </div>
                </div>
            )}

            {/* ── Módulos ───────────────────────────────────────── */}
            <div className="card p-6 space-y-5">
                <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest">Módulos</h2>

                {/* Switch 1: Integración con QuickInvoice */}
                <label className="flex items-start justify-between gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors">
                    <div className="flex items-start gap-3">
                        <ShoppingCart className="w-5 h-5 text-slate-500 mt-0.5 shrink-0" />
                        <div>
                            <p className="text-sm font-bold text-slate-800">Reemplazar módulos de compras de QuickInvoice</p>
                            <p className="text-xs text-slate-500 mt-0.5">
                                <span className="font-semibold text-green-700">ON</span> → oculta "Proveedores" e "Ingreso de Compras" del menú de QuickInvoice (se gestiona aquí).<br />
                                <span className="font-semibold text-slate-500">OFF</span> → QuickInvoice mantiene sus propios módulos.
                            </p>
                        </div>
                    </div>
                    <div className={cn('relative shrink-0 mt-0.5 w-11 h-6 rounded-full transition-colors cursor-pointer', usarVendor ? 'bg-primary-600' : 'bg-slate-200')}
                        onClick={() => setUsarVendor(v => !v)}>
                        <div className={cn('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', usarVendor && 'translate-x-5')} />
                    </div>
                </label>

                {/* Switch 2: Contabilizar compras */}
                <label className="flex items-start justify-between gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors">
                    <div className="flex items-start gap-3">
                        <BookOpen className="w-5 h-5 text-slate-500 mt-0.5 shrink-0" />
                        <div>
                            <p className="text-sm font-bold text-slate-800">Contabilizar compras automáticamente en LedgerPro</p>
                            <p className="text-xs text-slate-500 mt-0.5">
                                <span className="font-semibold text-green-700">ON</span> → genera asientos contables al registrar facturas de compra y pagos.<br />
                                <span className="font-semibold text-slate-500">OFF</span> → solo impacta inventario y CxP, sin asientos contables.
                            </p>
                        </div>
                    </div>
                    <div className={cn('relative shrink-0 mt-0.5 w-11 h-6 rounded-full transition-colors cursor-pointer', usarContabilidad ? 'bg-primary-600' : 'bg-slate-200')}
                        onClick={() => setUsarContabilidad(v => !v)}>
                        <div className={cn('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', usarContabilidad && 'translate-x-5')} />
                    </div>
                </label>
            </div>

            {/* ── Cuentas contables (solo visible si contabilidad ON) ── */}
            {usarContabilidad && (
                <div className="card p-6 space-y-4">
                    <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
                        <BookOpen className="w-4 h-4" />
                        Cuentas Contables para Compras
                    </h2>
                    <p className="text-xs text-slate-500">
                        Selecciona las cuentas del plan contable (LedgerPro) que se usarán al generar asientos de compras y pagos.
                    </p>

                    {loadingCuentas ? (
                        <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
                            <Loader2 className="w-4 h-4 animate-spin" /> Cargando cuentas de LedgerPro...
                        </div>
                    ) : listaCuentas.length === 0 ? (
                        <div className="text-sm text-amber-700 bg-amber-50 p-3 rounded-lg flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            No se encontraron cuentas contables. Verifica que LedgerPro esté configurado y tenga plan de cuentas para esta empresa.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {CAMPOS_CUENTAS.map(({ key, label }) => (
                                <div key={key}>
                                    <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
                                    <select
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                                        value={cuentas[key] || ''}
                                        onChange={e => setCuentas(prev => ({ ...prev, [key]: e.target.value }))}
                                    >
                                        <option value="">— seleccionar cuenta —</option>
                                        {listaCuentas.map(c => (
                                            <option key={c.id} value={c.id}>
                                                {c.codigo} — {c.nombre}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="flex justify-end">
                <button onClick={guardar} disabled={saving}
                    className="btn btn-primary flex items-center gap-2 px-8">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Guardar configuración
                </button>
            </div>
        </div>
    )
}
