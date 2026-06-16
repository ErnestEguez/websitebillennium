import { useEffect, useState, useCallback } from 'react'
import { Loader2, ChevronDown, TrendingUp, TrendingDown, Wallet, AlertCircle } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { empleadosService } from '../../services/nominas/empleadosService'
import { parametrosNominaService } from '../../services/nominas/parametrosNominaService'
import { novedadesNominaService } from '../../services/nominas/novedadesNominaService'
import type { Empleado, ParametrosNomina, NovedadNomina, TipoNovedad } from '../../types/nominas'

const fmt = (n: number) =>
    n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const round2 = (n: number) => Math.round(n * 100) / 100

const TIPO_BADGE: Record<TipoNovedad, { label: string; color: string }> = {
    descuento_variable: { label: 'Variable',  color: 'bg-orange-50 text-orange-700' },
    descuento_fijo:     { label: 'Fijo',      color: 'bg-blue-50 text-blue-700' },
    prestamo_cuota:     { label: 'Préstamo',  color: 'bg-purple-50 text-purple-700' },
    prestamo_plazo:     { label: 'Préstamo',  color: 'bg-indigo-50 text-indigo-700' },
}

interface IngRow {
    concepto: string
    monto: number
    nota?: string
}

interface DescRow {
    concepto: string
    cuota: number
    saldo?: number | null
    tipo?: TipoNovedad | null
}

function computarIngresos(emp: Empleado, params: ParametrosNomina | null): IngRow[] {
    const rows: IngRow[] = [
        { concepto: 'Sueldo Base', monto: emp.sueldo_base },
    ]
    if (emp.decimo_tercero_modo === 'mensualizado') {
        rows.push({
            concepto: 'Décimo Tercero (mensualizado)',
            monto: round2(emp.sueldo_base / 12),
            nota: '1/12 del sueldo',
        })
    }
    if (emp.decimo_cuarto_modo === 'mensualizado' && params) {
        rows.push({
            concepto: 'Décimo Cuarto (mensualizado)',
            monto: round2(params.sbu / 12),
            nota: `1/12 del SBU $${fmt(params.sbu)}`,
        })
    }
    if (emp.fondo_reserva_modo === 'mensual' && params) {
        rows.push({
            concepto: `Fondo de Reserva (${params.fondo_reserva_pct}%)`,
            monto: round2(emp.sueldo_base * params.fondo_reserva_pct / 100),
            nota: 'aplica desde el mes 13',
        })
    }
    return rows
}

function computarDescuentos(
    emp: Empleado,
    params: ParametrosNomina | null,
    novedades: NovedadNomina[]
): DescRow[] {
    const rows: DescRow[] = []

    if (emp.afiliado_iess && params) {
        rows.push({
            concepto: `IESS Personal (${params.aporte_personal_iess_pct}%)`,
            cuota: round2(emp.sueldo_base * params.aporte_personal_iess_pct / 100),
            saldo: null,
            tipo: null,
        })
    }

    for (const nov of novedades) {
        if (!nov.activo) continue
        let cuota = 0
        if (nov.tipo_novedad === 'prestamo_plazo' && nov.saldo_inicial && nov.n_meses) {
            cuota = round2(nov.saldo_inicial / nov.n_meses)
        } else {
            cuota = round2(nov.monto_fijo ?? 0)
        }
        const esPrestamo = nov.tipo_novedad === 'prestamo_cuota' || nov.tipo_novedad === 'prestamo_plazo'
        rows.push({
            concepto: nov.nombre,
            cuota,
            saldo: esPrestamo ? (nov.saldo_pendiente ?? null) : null,
            tipo: nov.tipo_novedad,
        })
    }

    return rows
}

export function CapacidadPagoPage() {
    const { empresa } = useAuth() as any

    const [empleados, setEmpleados] = useState<Empleado[]>([])
    const [params, setParams]       = useState<ParametrosNomina | null>(null)
    const [loading, setLoading]     = useState(true)
    const [error, setError]         = useState<string | null>(null)

    const [empId, setEmpId]               = useState('')
    const [novedades, setNovedades]       = useState<NovedadNomina[]>([])
    const [loadingNov, setLoadingNov]     = useState(false)

    const cargarBase = useCallback(async () => {
        if (!empresa?.id) return
        setLoading(true)
        try {
            const [emps, par] = await Promise.all([
                empleadosService.listarEmpleados(empresa.id),
                parametrosNominaService.obtener(empresa.id),
            ])
            setEmpleados(emps)
            setParams(par)
        } catch (e: any) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }, [empresa?.id])

    useEffect(() => { cargarBase() }, [cargarBase])

    useEffect(() => {
        if (!empId || !empresa?.id) { setNovedades([]); return }
        setLoadingNov(true)
        novedadesNominaService.listar(empresa.id)
            .then(all => setNovedades(all.filter(n => n.empleado_id === empId)))
            .catch(e => setError(e.message))
            .finally(() => setLoadingNov(false))
    }, [empId, empresa?.id])

    const emp = empleados.find(e => e.id === empId) ?? null
    const ingresos   = emp ? computarIngresos(emp, params) : []
    const descuentos = emp ? computarDescuentos(emp, params, novedades) : []

    const totalIngresos   = round2(ingresos.reduce((s, r) => s + r.monto, 0))
    const totalDescuentos = round2(descuentos.reduce((s, r) => s + r.cuota, 0))
    const neto            = round2(totalIngresos - totalDescuentos)

    const totalSaldoPrestamos = round2(descuentos.filter(d => d.saldo != null).reduce((s, d) => s + (d.saldo ?? 0), 0))

    if (loading) return (
        <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
    )

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Estado Económico del Empleado</h1>
                <p className="text-sm text-slate-500 mt-0.5">
                    Ingresos, descuentos y capacidad de pago — útil para evaluar préstamos y anticipos
                </p>
            </div>

            {error && (
                <div className="bg-red-50 text-red-700 border border-red-200 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />{error}
                </div>
            )}

            {/* Selector de empleado */}
            <div className="relative max-w-sm">
                <select
                    value={empId}
                    onChange={e => setEmpId(e.target.value)}
                    className="w-full appearance-none border border-slate-200 rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 bg-white font-medium"
                >
                    <option value="">— Seleccionar empleado —</option>
                    {empleados.map(e => (
                        <option key={e.id} value={e.id}>{e.apellidos}, {e.nombres}</option>
                    ))}
                </select>
                <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>

            {loadingNov && (
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> Cargando novedades…
                </div>
            )}

            {emp && !loadingNov && (
                <>
                    {/* Ficha del empleado */}
                    <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 flex flex-wrap gap-6">
                        <div>
                            <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Empleado</p>
                            <p className="text-base font-bold text-slate-900 mt-0.5">{emp.apellidos}, {emp.nombres}</p>
                            <p className="text-sm text-slate-500">{emp.cargo?.nombre ?? '—'} · {emp.seccion?.nombre ?? '—'}</p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Sueldo Base</p>
                            <p className="text-xl font-bold text-slate-800 mt-0.5">${fmt(emp.sueldo_base)}</p>
                        </div>
                        <div>
                            <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Tipo nómina</p>
                            <p className="text-sm font-medium text-slate-700 mt-0.5 capitalize">{emp.tipo_nomina.replace('_', ' ')}</p>
                        </div>
                        {emp.afiliado_iess && (
                            <div>
                                <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">IESS</p>
                                <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-semibold mt-0.5 inline-block">Afiliado</span>
                            </div>
                        )}
                        {totalSaldoPrestamos > 0 && (
                            <div>
                                <p className="text-xs text-slate-400 uppercase tracking-wide font-semibold">Saldo total préstamos</p>
                                <p className="text-base font-bold text-purple-700 mt-0.5">${fmt(totalSaldoPrestamos)}</p>
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        {/* ── Ingresos ── */}
                        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                            <div className="flex items-center gap-2 px-5 py-3 bg-emerald-50 border-b border-emerald-100">
                                <TrendingUp className="w-4 h-4 text-emerald-600" />
                                <span className="text-sm font-bold text-emerald-700 uppercase tracking-wide">Ingresos Mensuales</span>
                            </div>
                            <div className="divide-y divide-slate-50">
                                {ingresos.map((row, i) => (
                                    <div key={i} className="flex items-center justify-between px-5 py-3">
                                        <div>
                                            <p className="text-sm font-medium text-slate-800">{row.concepto}</p>
                                            {row.nota && <p className="text-xs text-slate-400">{row.nota}</p>}
                                        </div>
                                        <span className="text-sm font-semibold text-emerald-700 font-mono">
                                            ${fmt(row.monto)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                            <div className="flex items-center justify-between px-5 py-3.5 bg-emerald-50 border-t border-emerald-100">
                                <span className="text-sm font-bold text-emerald-800">Total Ingresos</span>
                                <span className="text-lg font-bold text-emerald-800 font-mono">${fmt(totalIngresos)}</span>
                            </div>
                        </div>

                        {/* ── Descuentos ── */}
                        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                            <div className="flex items-center gap-2 px-5 py-3 bg-red-50 border-b border-red-100">
                                <TrendingDown className="w-4 h-4 text-red-600" />
                                <span className="text-sm font-bold text-red-700 uppercase tracking-wide">Descuentos Mensuales</span>
                            </div>
                            {descuentos.length === 0 ? (
                                <p className="text-sm text-slate-400 px-5 py-6 text-center">Sin descuentos configurados</p>
                            ) : (
                                <div className="divide-y divide-slate-50">
                                    {descuentos.map((row, i) => (
                                        <div key={i} className="flex items-center justify-between px-5 py-3 gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm font-medium text-slate-800 truncate">{row.concepto}</p>
                                                    {row.tipo && (
                                                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold shrink-0 ${TIPO_BADGE[row.tipo].color}`}>
                                                            {TIPO_BADGE[row.tipo].label}
                                                        </span>
                                                    )}
                                                </div>
                                                {row.saldo != null && (
                                                    <p className="text-xs text-purple-600 mt-0.5">
                                                        Saldo pendiente: <strong>${fmt(row.saldo)}</strong>
                                                    </p>
                                                )}
                                            </div>
                                            <div className="text-right shrink-0">
                                                <span className="text-sm font-semibold text-red-700 font-mono">
                                                    ${fmt(row.cuota)}
                                                </span>
                                                {row.saldo != null && (
                                                    <p className="text-[10px] text-slate-400">cuota mensual</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <div className="flex items-center justify-between px-5 py-3.5 bg-red-50 border-t border-red-100">
                                <span className="text-sm font-bold text-red-800">Total Descuentos</span>
                                <span className="text-lg font-bold text-red-800 font-mono">${fmt(totalDescuentos)}</span>
                            </div>
                        </div>
                    </div>

                    {/* ── Neto ── */}
                    <div className={`rounded-2xl p-5 border ${neto >= 0 ? 'bg-primary-50 border-primary-200' : 'bg-red-100 border-red-300'}`}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${neto >= 0 ? 'bg-primary-100' : 'bg-red-200'}`}>
                                    <Wallet className={`w-5 h-5 ${neto >= 0 ? 'text-primary-700' : 'text-red-700'}`} />
                                </div>
                                <div>
                                    <p className={`text-sm font-bold uppercase tracking-wide ${neto >= 0 ? 'text-primary-700' : 'text-red-700'}`}>
                                        Neto Estimado a Recibir
                                    </p>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        {neto >= 0
                                            ? 'Capacidad de pago disponible para nuevos compromisos'
                                            : 'Los descuentos superan los ingresos — revisar antes de aprobar nuevos créditos'
                                        }
                                    </p>
                                </div>
                            </div>
                            <span className={`text-3xl font-bold font-mono ${neto >= 0 ? 'text-primary-800' : 'text-red-800'}`}>
                                ${fmt(neto)}
                            </span>
                        </div>

                        {/* Barra de carga */}
                        {totalIngresos > 0 && (
                            <div className="mt-4">
                                <div className="flex justify-between text-xs text-slate-500 mb-1">
                                    <span>Carga de descuentos</span>
                                    <span>{Math.min(100, Math.round(totalDescuentos / totalIngresos * 100))}% del ingreso</span>
                                </div>
                                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all ${
                                            totalDescuentos / totalIngresos > 0.7 ? 'bg-red-500' :
                                            totalDescuentos / totalIngresos > 0.5 ? 'bg-amber-400' : 'bg-emerald-500'
                                        }`}
                                        style={{ width: `${Math.min(100, Math.round(totalDescuentos / totalIngresos * 100))}%` }}
                                    />
                                </div>
                                <div className="flex justify-between text-xs mt-1">
                                    <span className="text-emerald-600">Ingresos: ${fmt(totalIngresos)}</span>
                                    <span className="text-red-600">Descuentos: ${fmt(totalDescuentos)}</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {totalSaldoPrestamos > 0 && (
                        <div className="bg-purple-50 border border-purple-200 rounded-xl px-5 py-3.5 flex items-center justify-between">
                            <div>
                                <p className="text-sm font-semibold text-purple-800">Total saldo pendiente en préstamos</p>
                                <p className="text-xs text-purple-600 mt-0.5">Suma de todos los saldos de créditos activos</p>
                            </div>
                            <span className="text-xl font-bold text-purple-800 font-mono">${fmt(totalSaldoPrestamos)}</span>
                        </div>
                    )}
                </>
            )}

            {!emp && !loading && (
                <div className="flex flex-col items-center py-16 gap-3 bg-white border border-slate-200 rounded-2xl">
                    <Wallet className="w-12 h-12 text-slate-200" />
                    <p className="text-slate-400 text-sm">Selecciona un empleado para ver su estado económico</p>
                </div>
            )}
        </div>
    )
}
