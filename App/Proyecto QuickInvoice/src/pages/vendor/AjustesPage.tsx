import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { contabilidadService } from '../../services/contabilidadService'
import { SlidersHorizontal, Save, Loader2, AlertTriangle, BookOpen, Info } from 'lucide-react'

// Base accounts to map (no VendorManagement switch — that's admin-only)
const CUENTAS_BASE = [
    { key: 'inventarios',       label: 'Inventarios / Mercaderías',        hint: 'Activo — para compras de inventario' },
    { key: 'iva_compras',       label: 'IVA Crédito Fiscal (Compras)',      hint: 'Activo — IVA que la empresa puede recuperar' },
    { key: 'cuentas_por_pagar', label: 'Cuentas por Pagar Proveedores',     hint: 'Pasivo — saldo a crédito con proveedores' },
    { key: 'efectivo',          label: 'Efectivo / Banco',                  hint: 'Activo — pagos al contado' },
    { key: 'ret_fuente',        label: 'Retenciones en la Fuente x Pagar', hint: 'Pasivo — retenciones emitidas al proveedor' },
    { key: 'ret_iva',           label: 'Retenciones de IVA x Pagar',       hint: 'Pasivo — retenciones IVA emitidas al proveedor' },
]

export function AjustesPage() {
    const { empresa, refreshEmpresa } = useAuth()
    const [loading, setLoading]   = useState(true)
    const [saving, setSaving]     = useState(false)
    const [cuentas, setCuentas]   = useState<Record<string, string>>({})
    const [lista, setLista]       = useState<{ id: string; codigo: string; nombre: string; tipo: string }[]>([])
    const [loadingLista, setLoadingLista] = useState(false)
    const [habilitado, setHabilitado]     = useState(false)
    const [migFalta, setMigFalta]         = useState(false)

    useEffect(() => {
        if (!empresa?.id) { setLoading(false); return }
        Promise.resolve(
            supabase
                .from('empresas')
                .select('usar_contabilidad_compras, config_cuentas_compras')
                .eq('id', empresa.id)
                .single()
        ).then(({ data, error }) => {
            if (error?.code === '42703') { setMigFalta(true); return }
            if (data) {
                setHabilitado(!!data.usar_contabilidad_compras)
                if (data.config_cuentas_compras)
                    setCuentas(data.config_cuentas_compras as Record<string, string>)
            }
        }).finally(() => setLoading(false))
    }, [empresa?.id])

    useEffect(() => {
        if (!habilitado || !empresa?.id || lista.length > 0) return
        setLoadingLista(true)
        contabilidadService.listarCuentas(empresa.ruc ?? undefined)
            .then(d => setLista(d))
            .catch(() => {})
            .finally(() => setLoadingLista(false))
    }, [habilitado, empresa?.id])

    async function guardar() {
        if (!empresa?.id) return
        try {
            setSaving(true)
            const { error } = await supabase
                .from('empresas')
                .update({ config_cuentas_compras: cuentas })
                .eq('id', empresa.id)
            if (error) throw error
            await refreshEmpresa()
            alert('Plantilla de cuentas guardada.')
        } catch (e: any) { alert('Error: ' + e.message) }
        finally { setSaving(false) }
    }

    if (loading) return (
        <div className="flex items-center justify-center h-64 gap-2 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin" /> Cargando ajustes...
        </div>
    )

    return (
        <div className="max-w-2xl space-y-6">
            <div className="flex items-center gap-3">
                <div className="p-3 bg-primary-50 text-primary-600 rounded-2xl">
                    <SlidersHorizontal className="w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Ajustes de Contabilidad</h1>
                    <p className="text-slate-500 text-sm">Plantilla base de cuentas para compras — configurable por el contador</p>
                </div>
            </div>

            {migFalta && (
                <div className="card p-4 bg-amber-50 border-amber-200 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-800">
                        <p className="font-bold">Migración SQL pendiente</p>
                        <pre className="mt-2 bg-amber-100 rounded p-2 text-xs font-mono whitespace-pre-wrap">{`ALTER TABLE facturacion.empresas
  ADD COLUMN IF NOT EXISTS usar_contabilidad_compras BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS config_cuentas_compras JSONB DEFAULT '{}';`}</pre>
                    </div>
                </div>
            )}

            {!habilitado && !migFalta && (
                <div className="card p-5 flex items-start gap-3 text-slate-500 text-sm">
                    <Info className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                    La integración contable no está activada para esta empresa.
                    El administrador debe activar el switch "Cuenta contable por ítem en Compra de Servicios"
                    en Ajustes ▸ Configuración ▸ Contabilidad.
                </div>
            )}

            {habilitado && (
                <>
                    <div className="card p-6 space-y-2">
                        <div className="flex items-center gap-2 mb-4">
                            <BookOpen className="w-4 h-4 text-primary-600" />
                            <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest">
                                Plantilla base de cuentas
                            </h2>
                        </div>
                        <p className="text-xs text-slate-500 mb-5">
                            Estas cuentas se usan como base al generar asientos. Para compras de servicio, cada línea puede
                            tener su propia cuenta de gasto (columna "Cuenta de gasto" en el formulario de compra).
                        </p>

                        {loadingLista ? (
                            <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
                                <Loader2 className="w-4 h-4 animate-spin" /> Cargando plan de cuentas...
                            </div>
                        ) : lista.length === 0 ? (
                            <div className="text-sm text-amber-700 bg-amber-50 p-3 rounded-lg flex gap-2">
                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                Sin cuentas en LedgerPro. Configura el plan de cuentas primero.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {CUENTAS_BASE.map(({ key, label, hint }) => (
                                    <div key={key}>
                                        <label className="block text-xs font-semibold text-slate-700 mb-0.5">{label}</label>
                                        <p className="text-[11px] text-slate-400 mb-1">{hint}</p>
                                        <select
                                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                                            value={cuentas[key] || ''}
                                            onChange={e => setCuentas(prev => ({ ...prev, [key]: e.target.value }))}
                                        >
                                            <option value="">— seleccionar cuenta —</option>
                                            {lista.map(c => (
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

                    <div className="card p-4 bg-blue-50 border-blue-100 text-xs text-blue-700 space-y-1">
                        <p className="font-bold">¿Cómo funciona la contabilización automática?</p>
                        <p><span className="font-semibold">Compra inventario:</span> DR Inventarios + DR IVA / CR CxP (crédito) o Efectivo (contado) + CR Retenciones</p>
                        <p><span className="font-semibold">Compra servicio:</span> DR Cuenta de gasto por línea + DR IVA / CR CxP o Efectivo + CR Retenciones</p>
                        <p><span className="font-semibold">Pago proveedor:</span> DR CxP Proveedores / CR Efectivo</p>
                    </div>

                    <div className="flex justify-end">
                        <button onClick={guardar} disabled={saving}
                            className="btn btn-primary flex items-center gap-2 px-8">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            Guardar plantilla
                        </button>
                    </div>
                </>
            )}
        </div>
    )
}

