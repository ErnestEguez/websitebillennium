import { useEffect, useState } from 'react'
import { Download, Loader2, RefreshCw } from 'lucide-react'
import { supabase } from '../../../lib/supabaseContabilidad'
import { useAuth } from '../../../contexts/contabilidad/ContabilidadContext'
import { cn, formatMoneda, mesNombre } from '../../../lib/utils'
import { PrintButton } from '../../../components/contabilidad/PrintButton'
import type { LpPeriodo } from '../../../types/conta'

interface FilaBG {
    cuenta_id: string
    codigo: string
    nombre: string
    nivel: number
    tipo: string
    balance: number
}

function Seccion({ titulo, filas, total, sym, headerColor }: {
    titulo: string
    filas: FilaBG[]
    total: number
    sym: string
    headerColor: string
}) {
    return (
        <div className="card overflow-hidden">
            <div className={cn('px-5 py-3 text-white font-bold text-sm uppercase tracking-wide', headerColor)}>
                {titulo}
            </div>
            <table className="w-full text-sm">
                <tbody>
                    {filas.map(f => (
                        <tr key={f.cuenta_id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-2 px-5 font-mono text-xs text-slate-500 w-28">{f.codigo}</td>
                            <td className="py-2 px-3 text-slate-700">{f.nombre}</td>
                            <td className="py-2 px-5 text-right font-mono text-slate-800 w-36">
                                {formatMoneda(f.balance, sym)}
                            </td>
                        </tr>
                    ))}
                    {filas.length === 0 && (
                        <tr>
                            <td colSpan={3} className="py-4 text-center text-slate-400 text-xs">
                                Sin movimientos en este período
                            </td>
                        </tr>
                    )}
                </tbody>
                <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold">
                        <td colSpan={2} className="py-3 px-5 text-right text-xs uppercase tracking-wide text-slate-600">
                            Total {titulo}
                        </td>
                        <td className="py-3 px-5 text-right font-mono text-slate-900">
                            {formatMoneda(total, sym)}
                        </td>
                    </tr>
                </tfoot>
            </table>
        </div>
    )
}

export function BalanceGeneralPage() {
    const { empresaActiva } = useAuth()
    const [periodos, setPeriodos] = useState<LpPeriodo[]>([])
    const [periodoId, setPeriodoId] = useState('')
    const [activos, setActivos] = useState<FilaBG[]>([])
    const [pasivos, setPasivos] = useState<FilaBG[]>([])
    const [patrimonio, setPatrimonio] = useState<FilaBG[]>([])
    const [utilidad, setUtilidad] = useState(0)
    const [loading, setLoading] = useState(false)
    const [generado, setGenerado] = useState(false)

    useEffect(() => { if (empresaActiva) cargarPeriodos() }, [empresaActiva])

    async function cargarPeriodos() {
        if (!empresaActiva) return
        const { data } = await supabase.from('lp_periodos')
            .select('*').eq('empresa_id', empresaActiva.id).order('año').order('mes')
        setPeriodos(data ?? [])
        if (data?.length) setPeriodoId(data[data.length - 1].id)
    }

    async function generar() {
        if (!empresaActiva || !periodoId) return
        setLoading(true)
        setGenerado(false)

        // Estado de Situación Financiera = saldo ACUMULADO hasta el período seleccionado (no solo ese mes)
        const seleccionado = periodos.find(p => p.id === periodoId)!
        const periodosHasta = periodos
            .filter(p => p.año < seleccionado.año ||
                (p.año === seleccionado.año && ((seleccionado.mes == null) || (p.mes ?? 0) <= (seleccionado.mes ?? 12))))
            .map(p => p.id)

        const { data } = await supabase
            .from('lp_saldos_cuenta')
            .select(`
                cuenta_id,
                saldo_inicial_debe,
                saldo_inicial_haber,
                movimientos_debe,
                movimientos_haber,
                cuenta:lp_cuentas(codigo, nombre, nivel, tipo, naturaleza, acepta_movimientos)
            `)
            .eq('empresa_id', empresaActiva.id)
            .in('periodo_id', periodosHasta)

        if (!data) { setLoading(false); return }

        // Agrupar por cuenta_id y sumar todos los períodos
        const agrupado = new Map<string, any>()
        for (const r of data as any[]) {
            if (!r.cuenta?.acepta_movimientos) continue
            const ex = agrupado.get(r.cuenta_id)
            if (ex) {
                ex.saldo_inicial_debe  += r.saldo_inicial_debe
                ex.saldo_inicial_haber += r.saldo_inicial_haber
                ex.movimientos_debe    += r.movimientos_debe
                ex.movimientos_haber   += r.movimientos_haber
            } else {
                agrupado.set(r.cuenta_id, {
                    cuenta_id: r.cuenta_id, cuenta: r.cuenta,
                    saldo_inicial_debe: r.saldo_inicial_debe,
                    saldo_inicial_haber: r.saldo_inicial_haber,
                    movimientos_debe: r.movimientos_debe,
                    movimientos_haber: r.movimientos_haber,
                })
            }
        }

        const saldos = Array.from(agrupado.values()).map(r => {
            const totalDebe  = r.saldo_inicial_debe  + r.movimientos_debe
            const totalHaber = r.saldo_inicial_haber + r.movimientos_haber
            const saldoDebe  = Math.max(0, totalDebe  - totalHaber)
            const saldoHaber = Math.max(0, totalHaber - totalDebe)
            const balance = r.cuenta.naturaleza === 'deudora' ? saldoDebe : saldoHaber
            return { cuenta_id: r.cuenta_id, codigo: r.cuenta.codigo, nombre: r.cuenta.nombre,
                     nivel: r.cuenta.nivel, tipo: r.cuenta.tipo as string, balance }
        })

        const filasBG = saldos
            .filter(f => ['activo', 'pasivo', 'patrimonio'].includes(f.tipo) && f.balance > 0)
            .sort((a, b) => a.codigo.localeCompare(b.codigo))

        const totalIngresos = saldos.filter(f => f.tipo === 'ingreso').reduce((s, f) => s + f.balance, 0)
        const totalGastos   = saldos.filter(f => f.tipo === 'gasto').reduce((s, f) => s + f.balance, 0)

        setActivos(filasBG.filter(f => f.tipo === 'activo'))
        setPasivos(filasBG.filter(f => f.tipo === 'pasivo'))
        setPatrimonio(filasBG.filter(f => f.tipo === 'patrimonio'))
        setUtilidad(totalIngresos - totalGastos)
        setGenerado(true)
        setLoading(false)
    }

    function exportarCSV() {
        const header = 'Tipo,Código,Nombre,Saldo'
        const resultadoLabel = utilidad >= 0 ? 'Utilidad del Período' : 'Pérdida del Período'
        const rows = [
            ...activos.map(f => `Activo,"${f.codigo}","${f.nombre}",${f.balance}`),
            ...pasivos.map(f => `Pasivo,"${f.codigo}","${f.nombre}",${f.balance}`),
            ...patrimonio.map(f => `Patrimonio,"${f.codigo}","${f.nombre}",${f.balance}`),
            `Patrimonio,"—","${resultadoLabel}",${utilidad}`,
        ]
        const csv = [header, ...rows].join('\n')
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = 'balance_general.csv'; a.click()
        URL.revokeObjectURL(url)
    }

    const sym = empresaActiva?.moneda?.simbolo ?? '$'
    const periodo = periodos.find(p => p.id === periodoId)
    const totalActivos    = activos.reduce((s, f) => s + f.balance, 0)
    const totalPasivos    = pasivos.reduce((s, f) => s + f.balance, 0)
    const totalPatrimonio = patrimonio.reduce((s, f) => s + f.balance, 0) + utilidad
    const totalPasivoPatrimonio = totalPasivos + totalPatrimonio
    const cuadra = Math.abs(totalActivos - totalPasivoPatrimonio) < 0.01

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Estado de Situación Financiera</h1>
                    {generado && periodo && (
                        <p className="text-slate-500 text-sm mt-0.5">
                            Al {periodo.mes ? `${mesNombre(periodo.mes)} ${periodo.año}` : `Año ${periodo.año}`}
                        </p>
                    )}
                </div>
                {generado && (
                    <div className="flex gap-2 no-print">
                        <PrintButton
                            titulo="Estado de Situación Financiera"
                            empresa={empresaActiva?.razon_social}
                            subtitulo={periodo ? `Al ${periodo.mes ? `${mesNombre(periodo.mes)} ${periodo.año}` : `Año ${periodo.año}`}` : undefined}
                        />
                        <button onClick={exportarCSV} className="btn btn-secondary gap-2 text-sm">
                            <Download className="w-4 h-4" /> Exportar CSV
                        </button>
                    </div>
                )}
            </div>

            {/* Filtros */}
            <div className="card px-5 py-4 flex items-end gap-4 flex-wrap no-print">
                <div>
                    <label className="label">Período</label>
                    <select className="input w-52" value={periodoId} onChange={e => setPeriodoId(e.target.value)}>
                        <option value="">Seleccionar período...</option>
                        {periodos.map(p => (
                            <option key={p.id} value={p.id}>
                                {p.mes ? `${mesNombre(p.mes)} ${p.año}` : `Año ${p.año}`} — {p.estado}
                            </option>
                        ))}
                    </select>
                </div>
                <button
                    onClick={generar}
                    disabled={!periodoId || loading}
                    className="btn btn-primary gap-2"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Generar
                </button>
            </div>

            {/* Dos columnas: Activos | Pasivos + Patrimonio */}
            {generado && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                    <Seccion titulo="Activos" filas={activos} total={totalActivos} sym={sym} headerColor="bg-blue-700" />
                    <div className="space-y-4">
                        <Seccion titulo="Pasivos" filas={pasivos} total={totalPasivos} sym={sym} headerColor="bg-red-700" />
                        {/* Patrimonio incluye cuentas patrimoniales + resultado del período */}
                        <div className="card overflow-hidden">
                            <div className="bg-purple-700 px-5 py-3 text-white font-bold text-sm uppercase tracking-wide">
                                Patrimonio
                            </div>
                            <table className="w-full text-sm">
                                <tbody>
                                    {patrimonio.map(f => (
                                        <tr key={f.cuenta_id} className="border-b border-slate-100 hover:bg-slate-50">
                                            <td className="py-2 px-5 font-mono text-xs text-slate-500 w-28">{f.codigo}</td>
                                            <td className="py-2 px-3 text-slate-700">{f.nombre}</td>
                                            <td className="py-2 px-5 text-right font-mono text-slate-800 w-36">
                                                {formatMoneda(f.balance, sym)}
                                            </td>
                                        </tr>
                                    ))}
                                    {/* Resultado del período — siempre visible */}
                                    {utilidad !== 0 && (
                                        <tr className={cn(
                                            'border-b border-slate-100',
                                            utilidad > 0 ? 'bg-green-50' : 'bg-red-50'
                                        )}>
                                            <td className="py-2 px-5 font-mono text-xs text-slate-400 w-28">—</td>
                                            <td className={cn('py-2 px-3 font-medium text-xs', utilidad > 0 ? 'text-green-700' : 'text-red-700')}>
                                                {utilidad > 0 ? 'Utilidad del Período' : 'Pérdida del Período'}
                                            </td>
                                            <td className={cn('py-2 px-5 text-right font-mono font-semibold w-36', utilidad > 0 ? 'text-green-800' : 'text-red-800')}>
                                                {utilidad > 0
                                                    ? formatMoneda(utilidad, sym)
                                                    : `(${formatMoneda(Math.abs(utilidad), sym)})`
                                                }
                                            </td>
                                        </tr>
                                    )}
                                    {patrimonio.length === 0 && utilidad === 0 && (
                                        <tr>
                                            <td colSpan={3} className="py-4 text-center text-slate-400 text-xs">
                                                Sin movimientos en este período
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold">
                                        <td colSpan={2} className="py-3 px-5 text-right text-xs uppercase tracking-wide text-slate-600">
                                            Total Patrimonio
                                        </td>
                                        <td className="py-3 px-5 text-right font-mono text-slate-900">
                                            {formatMoneda(totalPatrimonio, sym)}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Verificación de cuadre */}
            {generado && (
                <div className="card px-6 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-8 text-sm">
                            <div>
                                <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Total Activos</p>
                                <p className="font-bold text-slate-900 text-lg font-mono">{formatMoneda(totalActivos, sym)}</p>
                            </div>
                            <span className="text-slate-300 text-2xl font-light">=</span>
                            <div>
                                <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Pasivos + Patrimonio</p>
                                <p className="font-bold text-slate-900 text-lg font-mono">{formatMoneda(totalPasivoPatrimonio, sym)}</p>
                            </div>
                        </div>
                        <span className={cn(
                            'font-bold text-sm px-4 py-2 rounded-lg',
                            cuadra ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        )}>
                            {cuadra ? '✓ Balance cuadra' : '✗ Balance no cuadra'}
                        </span>
                    </div>
                </div>
            )}

            {generado && activos.length === 0 && pasivos.length === 0 && patrimonio.length === 0 && (
                <div className="card p-10 text-center text-slate-400">
                    <p>No hay saldos para este período.</p>
                    <p className="text-xs mt-2">Confirma comprobantes para que aparezcan aquí.</p>
                </div>
            )}
        </div>
    )
}





