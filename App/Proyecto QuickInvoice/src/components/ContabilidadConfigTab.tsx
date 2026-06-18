import { useState, useEffect, type ReactNode } from 'react'
import { BookOpen, Save, Loader2, AlertCircle, Check } from 'lucide-react'
import { contableConfigService, type CuentaLP } from '../services/contableConfigService'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'

// ─── Definición de conceptos por proceso ─────────────────────────────────────

const VENTAS_CONCEPTOS = [
    { key: 'CARTERA_CLIENTES',    label: 'Cartera / Cuentas por Cobrar' },
    { key: 'VENTAS_BASE_0',       label: 'Ingresos base 0% IVA' },
    { key: 'VENTAS_BASE_GRAVADA', label: 'Ingresos base gravada' },
    { key: 'IVA_COBRADO',         label: 'IVA en ventas (pasivo)' },
    { key: 'DESCUENTOS',          label: 'Descuentos en ventas' },
    { key: 'COSTO_VENTAS',        label: 'Costo de Ventas (fallback si artículo sin cuenta propia)' },
    { key: 'INVENTARIOS',         label: 'Inventarios — reducción por venta (HABER costo de ventas)' },
]

const COMPRAS_CONCEPTOS = [
    { key: 'PROVEEDORES_CXP',  label: 'Proveedores / Cuentas por Pagar' },
    { key: 'INVENTARIO',       label: 'Inventarios' },
    { key: 'GASTO_SERVICIO',   label: 'Gastos / Servicios' },
    { key: 'IVA_PAGADO',       label: 'IVA en compras (activo)' },
    { key: 'RETENCION_FUENTE', label: 'Retención en la fuente' },
]

const COBROS_CONCEPTOS = [
    { key: 'EFECTIVO',     label: 'Efectivo (Caja General)' },
    { key: 'CHEQUE',       label: 'Cheque al día' },
    { key: 'CHEQUE_FECHA', label: 'Cheque a fecha (post-fechado)' },
    { key: 'TARJETA',      label: 'Tarjeta de Crédito / Débito (T/C)' },
    { key: 'BANCO',        label: 'Transferencia — cuenta sin enlace contable (fallback)' },
    { key: 'NC',           label: 'Nota de Crédito / Devoluciones' },
    { key: 'CREDITO',      label: 'Crédito (Cartera CxC)' },
]

const PAGOS_CONCEPTOS = [
    { key: 'EFECTIVO',        label: 'Efectivo (pago en caja a proveedores)' },
    { key: 'TARJETA_CREDITO', label: 'Tarjeta de Crédito (T/C)' },
    { key: 'NOTA_CREDITO',    label: 'Nota de Crédito de proveedor (N/C)' },
    { key: 'OTROS',           label: 'Otros / Cruce contable' },
]

const NOMINA_CONCEPTOS = [
    // Gastos de personal
    { key: 'GASTO_SUELDOS',           label: 'Gasto sueldos y salarios' },
    { key: 'GASTO_IESS_PATRONAL',     label: 'Gasto IESS patronal (11.15%)' },
    { key: 'GASTO_D13',               label: 'Gasto / Provisión décimo tercero' },
    { key: 'GASTO_D14',               label: 'Gasto / Provisión décimo cuarto' },
    { key: 'GASTO_VACACIONES',        label: 'Gasto / Provisión vacaciones' },
    { key: 'GASTO_FONDOS_RESERVA',    label: 'Gasto / Provisión fondos de reserva' },
    { key: 'GASTO_INDEMNIZACION',     label: 'Gasto indemnización / desahucio / bonificación' },
    // Pasivos — por pagar
    { key: 'REMUNERACIONES_X_PAGAR',  label: 'Remuneraciones por pagar (neto empleados)' },
    { key: 'IESS_PERSONAL_X_PAGAR',   label: 'IESS personal por pagar (9.45%)' },
    { key: 'IESS_PATRONAL_X_PAGAR',   label: 'IESS patronal por pagar (11.15%)' },
    { key: 'IR_X_PAGAR',              label: 'Retención IR trabajadores por pagar' },
    // Activos y provisiones
    { key: 'ANTICIPOS_EMPLEADOS',     label: 'Anticipos a empleados (activo corriente)' },
    { key: 'PRESTAMOS_EMPLEADOS',     label: 'Préstamos a empleados / novedades (activo)' },
    { key: 'PROVISION_D13',           label: 'Provisión acumulada décimo tercero' },
    { key: 'PROVISION_D14',           label: 'Provisión acumulada décimo cuarto' },
    { key: 'PROVISION_VACACIONES',    label: 'Provisión acumulada vacaciones' },
    { key: 'PROVISION_FONDOS_RESERVA',label: 'Provisión acumulada fondos de reserva' },
    // Pagos
    { key: 'BANCO_PAGO_NOMINA',       label: 'Banco para pagos de nómina (transferencias)' },
]

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface MapeoVal {
    cuenta_id: string | null
    cuenta_codigo: string | null
    cuenta_nombre: string | null
}
type MapeoMap = Record<string, MapeoVal>  // key = "PROCESO:CONCEPTO"

// ─── Componente principal ─────────────────────────────────────────────────────

export function ContabilidadConfigTab() {
    const { empresa, refreshEmpresa } = useAuth()
    const [enLinea, setEnLinea]     = useState(false)
    const [ctaPorServicio, setCtaPorServicio] = useState(false)
    const [mapeos, setMapeos]       = useState<MapeoMap>({})
    const [cuentas, setCuentas]     = useState<CuentaLP[]>([])
    const [loading, setLoading]     = useState(true)
    const [saving, setSaving]       = useState(false)
    const [saved, setSaved]         = useState(false)
    const [sinLedger, setSinLedger] = useState(false)
    const [error, setError]         = useState('')

    useEffect(() => {
        if (!empresa?.id) return
        load()
    }, [empresa?.id])

    async function load() {
        setLoading(true)
        setError('')
        try {
            const [config, mapaDB, cuentasLP] = await Promise.all([
                contableConfigService.getConfig(empresa!.id),
                contableConfigService.getMapeos(empresa!.id),
                contableConfigService.getCuentas((empresa as any)?.ruc),
            ])
            setEnLinea(config?.contabilidad_en_linea ?? false)
            setCtaPorServicio(!!empresa?.usar_contabilidad_compras)

            const map: MapeoMap = {}
            for (const m of mapaDB) {
                map[`${m.proceso}:${m.concepto}`] = {
                    cuenta_id:     m.cuenta_id,
                    cuenta_codigo: m.cuenta_codigo,
                    cuenta_nombre: m.cuenta_nombre,
                }
            }
            setMapeos(map)
            setCuentas(cuentasLP)
            if (cuentasLP.length === 0) setSinLedger(true)
        } catch (e: any) {
            setError(e.message || 'Error al cargar configuración')
        } finally {
            setLoading(false)
        }
    }

    function setMapeo(proceso: string, concepto: string, cuentaId: string) {
        const cuenta = cuentas.find(c => c.id === cuentaId)
        setMapeos(prev => ({
            ...prev,
            [`${proceso}:${concepto}`]: {
                cuenta_id:     cuentaId || null,
                cuenta_codigo: cuenta?.codigo || null,
                cuenta_nombre: cuenta?.nombre || null,
            },
        }))
    }

    async function handleSave() {
        if (!empresa?.id) return
        setSaving(true)
        setSaved(false)
        setError('')
        try {
            await contableConfigService.saveConfig(empresa.id, enLinea)

            const { error: errEmpresa } = await supabase
                .from('empresas')
                .update({ usar_contabilidad_compras: ctaPorServicio })
                .eq('id', empresa.id)
            if (errEmpresa) throw errEmpresa
            await refreshEmpresa()

            const rows = Object.entries(mapeos).map(([key, val]) => {
                const [proceso, concepto] = key.split(':')
                return { proceso, concepto, ...val }
            })
            await contableConfigService.saveMapeos(empresa.id, rows)
            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
        } catch (e: any) {
            setError(e.message || 'Error al guardar')
        } finally {
            setSaving(false)
        }
    }

    if (loading) return (
        <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
        </div>
    )

    return (
        <div className="max-w-5xl space-y-6 animate-in fade-in slide-in-from-bottom-4">

            {/* Toggle contabilización */}
            <div className="card p-6 space-y-4">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-purple-500" />
                    Modo de Contabilización
                </h3>
                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                        <p className="text-sm font-bold text-slate-800">Contabilización en Línea</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {enLinea
                                ? 'El asiento contable se genera automáticamente al guardar cada factura o compra.'
                                : 'Los asientos se generan en lote mediante el proceso contable batch.'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setEnLinea(v => !v)}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors shrink-0 ${
                            enLinea ? 'bg-purple-600' : 'bg-slate-300'
                        }`}
                    >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                            enLinea ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                    </button>
                </div>
                {enLinea && (
                    <p className="text-xs text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                        ⚡ Modo en línea activo — asegúrate de completar el mapeo de cuentas a continuación.
                    </p>
                )}

                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
                    <div>
                        <p className="text-sm font-bold text-slate-800">Cuenta contable por ítem en Compra de Servicios</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {ctaPorServicio
                                ? 'Cada línea de "Compra de Servicios" permite elegir su propia cuenta de gasto. El asiento genera un débito por cada cuenta usada.'
                                : 'Todas las líneas de "Compra de Servicios" se contabilizan con la cuenta "Gastos / Servicios" mapeada abajo, en Compras a Proveedores.'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setCtaPorServicio(v => !v)}
                        className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors shrink-0 ${
                            ctaPorServicio ? 'bg-purple-600' : 'bg-slate-300'
                        }`}
                    >
                        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
                            ctaPorServicio ? 'translate-x-6' : 'translate-x-1'
                        }`} />
                    </button>
                </div>
            </div>

            {/* Aviso sin LedgerPro */}
            {sinLedger && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-bold">Plan de Cuentas no disponible</p>
                        <p className="text-xs mt-0.5">
                            No se encontraron cuentas en LedgerPro. Configura tu plan de cuentas en el módulo de Contabilidad
                            para poder hacer el mapeo. El toggle sí se guardará.
                        </p>
                    </div>
                </div>
            )}

            {/* Mapeo de cuentas */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <MapeoCard
                    titulo="Ventas a Clientes"
                    proceso="VENTAS"
                    conceptos={VENTAS_CONCEPTOS}
                    cuentas={cuentas}
                    mapeos={mapeos}
                    onChange={setMapeo}
                />
                <MapeoCard
                    titulo="Compras a Proveedores"
                    proceso="COMPRAS"
                    conceptos={COMPRAS_CONCEPTOS}
                    cuentas={cuentas}
                    mapeos={mapeos}
                    onChange={setMapeo}
                />
            </div>

            {/* Cobros / Formas de pago */}
            <MapeoCard
                titulo="Cobros — Cuentas por Forma de Pago"
                proceso="COBROS"
                conceptos={COBROS_CONCEPTOS}
                cuentas={cuentas}
                mapeos={mapeos}
                onChange={setMapeo}
            />

            {/* Nómina */}
            <MapeoCard
                titulo="Nómina — Roles, Anticipos, Provisiones y Finiquitos"
                descripcion="Cuentas para los asientos automáticos de nómina. Actívalo con Contabilización en Línea. Cada concepto del rol también puede tener su propia cuenta asignada en Nómina → Conceptos."
                proceso="NOMINA"
                conceptos={NOMINA_CONCEPTOS}
                cuentas={cuentas}
                mapeos={mapeos}
                onChange={setMapeo}
            />

            {/* Pagos a proveedores (egresos) */}
            <MapeoCard
                titulo="Pagos a Proveedores — Cuentas por Forma de Pago"
                descripcion="Cheque y Transferencia no se mapean aquí: usan la cuenta contable que ya configuraste por cada cuenta bancaria en Tesorería → Bancos → Cuentas Bancarias. Mapea aquí solo las formas de pago que no pasan por una cuenta bancaria."
                proceso="PAGOS"
                conceptos={PAGOS_CONCEPTOS}
                cuentas={cuentas}
                mapeos={mapeos}
                onChange={setMapeo}
                extra={
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                <span className={`inline-block w-1.5 h-1.5 rounded-full ${mapeos['COMPRAS:PROVEEDORES_CXP']?.cuenta_id ? 'bg-green-400' : 'bg-slate-300'}`} />
                                Proveedores / Cuentas por Pagar (pasivo)
                            </p>
                            <p className="text-sm text-slate-700 mt-0.5">
                                {mapeos['COMPRAS:PROVEEDORES_CXP']?.cuenta_id
                                    ? `${mapeos['COMPRAS:PROVEEDORES_CXP'].cuenta_codigo} — ${mapeos['COMPRAS:PROVEEDORES_CXP'].cuenta_nombre}`
                                    : '— Sin mapear —'}
                            </p>
                        </div>
                        <span className="text-xs text-slate-400 text-right shrink-0">
                            Se usa para abonar/cancelar la deuda en cada egreso.<br />Se configura arriba, en "Compras a Proveedores".
                        </span>
                    </div>
                }
            />

            {/* Error */}
            {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                </div>
            )}

            {/* Botón guardar */}
            <button
                onClick={handleSave}
                disabled={saving}
                className="btn btn-primary w-full py-4 text-lg font-black flex items-center justify-center gap-2"
            >
                {saving
                    ? <><Loader2 className="w-5 h-5 animate-spin" /> Guardando...</>
                    : saved
                    ? <><Check className="w-5 h-5" /> Configuración guardada</>
                    : <><Save className="w-5 h-5" /> Guardar Configuración Contable</>
                }
            </button>
        </div>
    )
}

// ─── Sub-componente: tarjeta de mapeo por proceso ─────────────────────────────

function MapeoCard({
    titulo, descripcion, extra, proceso, conceptos, cuentas, mapeos, onChange,
}: {
    titulo: string
    descripcion?: string
    extra?: ReactNode
    proceso: string
    conceptos: { key: string; label: string }[]
    cuentas: CuentaLP[]
    mapeos: MapeoMap
    onChange: (proceso: string, concepto: string, cuentaId: string) => void
}) {
    return (
        <div className="card p-6 space-y-4">
            <div className="border-b border-slate-100 pb-3 space-y-1">
                <h4 className="font-bold text-slate-900 text-sm">{titulo}</h4>
                {descripcion && (
                    <p className="text-xs text-slate-500 leading-relaxed">{descripcion}</p>
                )}
            </div>
            {extra}
            <div className="space-y-3">
                {conceptos.map(c => {
                    const val = mapeos[`${proceso}:${c.key}`]
                    const mapeado = !!val?.cuenta_id
                    return (
                        <div key={c.key} className="space-y-1">
                            <label className="flex items-center gap-1.5 text-xs font-black text-slate-400 uppercase tracking-widest">
                                <span className={`inline-block w-1.5 h-1.5 rounded-full ${mapeado ? 'bg-green-400' : 'bg-slate-300'}`} />
                                {c.label}
                            </label>
                            <select
                                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white outline-none focus:ring-2 focus:ring-purple-400"
                                value={val?.cuenta_id || ''}
                                onChange={e => onChange(proceso, c.key, e.target.value)}
                                disabled={cuentas.length === 0}
                            >
                                <option value="">— Sin mapear —</option>
                                {cuentas.map(ct => (
                                    <option key={ct.id} value={ct.id}>
                                        {ct.codigo} — {ct.nombre}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
