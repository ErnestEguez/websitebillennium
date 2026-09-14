import { useEffect, useState } from 'react'
import { AlertTriangle, Download, Loader2, Printer, RefreshCw } from 'lucide-react'
import { supabase } from '../../../lib/supabaseContabilidad'
import { useAuth } from '../../../contexts/contabilidad/ContabilidadContext'
import { cn, formatMoneda, mesNombre } from '../../../lib/utils'
import { imprimirReporte, generarTablaHtml } from '../../../lib/printUtils'
import { construirJerarquia, agruparPorCodigoAlterno, type FilaJerarquica } from '../../../lib/contaJerarquia'
import type { LpPeriodo } from '../../../types/conta'

type ModeloCuenta = 'propia' | 'sri' | 'supe'

const MODELO_LABEL: Record<ModeloCuenta, string> = {
    propia: 'Cta. Propia', sri: 'SRI', supe: 'Superintendencia',
}

function Seccion({ titulo, filas, total, sym, headerColor }: {
    titulo: string
    filas: FilaJerarquica[]
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
                        <tr key={f.codigo} className={cn('border-b border-slate-100', f.esSubtotal ? 'bg-slate-50 font-semibold' : 'hover:bg-slate-50')}>
                            <td className="py-2 px-5 font-mono text-xs text-slate-500 w-28">{f.codigo}</td>
                            <td className="py-2 px-3 text-slate-700" style={{ paddingLeft: `${(f.nivel - 1) * 14 + 12}px` }}>{f.nombre}</td>
                            <td className={cn('py-2 px-5 text-right font-mono w-36', f.esSubtotal ? 'text-slate-900' : 'text-slate-800')}>
                                {formatMoneda(f.valores.balance, sym)}
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
    const [modeloCuenta, setModeloCuenta] = useState<ModeloCuenta>('propia')
    const [activos, setActivos] = useState<FilaJerarquica[]>([])
    const [pasivos, setPasivos] = useState<FilaJerarquica[]>([])
    const [patrimonio, setPatrimonio] = useState<FilaJerarquica[]>([])
    const [totalActivos, setTotalActivos] = useState(0)
    const [totalPasivos, setTotalPasivos] = useState(0)
    const [totalPatrimonioCuentas, setTotalPatrimonioCuentas] = useState(0)
    const [utilidad, setUtilidad] = useState(0)
    const [loading, setLoading] = useState(false)
    const [generado, setGenerado] = useState(false)
    const [sinMapear, setSinMapear] = useState<{ codigo: string; nombre: string }[] | null>(null)

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
        setSinMapear(null)

        // Estado de Situación Financiera = saldo ACUMULADO hasta el período seleccionado (no solo ese mes)
        const seleccionado = periodos.find(p => p.id === periodoId)!
        const periodosHasta = periodos
            .filter(p => p.año < seleccionado.año ||
                (p.año === seleccionado.año && ((seleccionado.mes == null) || (p.mes ?? 0) <= (seleccionado.mes ?? 12))))
            .map(p => p.id)

        const [{ data }, { data: todasLasCuentas }] = await Promise.all([
            supabase
                .from('lp_saldos_cuenta')
                .select(`
                    cuenta_id,
                    saldo_inicial_debe,
                    saldo_inicial_haber,
                    movimientos_debe,
                    movimientos_haber,
                    cuenta:lp_cuentas(codigo, nombre, nivel, tipo, naturaleza, acepta_movimientos, codigo_sri, codigo_supe)
                `)
                .eq('empresa_id', empresaActiva.id)
                .in('periodo_id', periodosHasta),
            supabase.from('lp_cuentas').select('codigo, nombre').eq('empresa_id', empresaActiva.id),
        ])

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
            return {
                cuenta_id: r.cuenta_id, codigo: r.cuenta.codigo, nombre: r.cuenta.nombre,
                tipo: r.cuenta.tipo as string, balance,
                codigo_sri: r.cuenta.codigo_sri as string | null,
                codigo_supe: r.cuenta.codigo_supe as string | null,
            }
        })

        const hojasBG = saldos.filter(f => ['activo', 'pasivo', 'patrimonio'].includes(f.tipo) && f.balance > 0)

        const totalIngresos = saldos.filter(f => f.tipo === 'ingreso').reduce((s, f) => s + f.balance, 0)
        const totalGastos   = saldos.filter(f => f.tipo === 'gasto').reduce((s, f) => s + f.balance, 0)
        const utilidadPeriodo = totalIngresos - totalGastos

        function seccion(tipo: string) {
            const hojas = hojasBG.filter(f => f.tipo === tipo)
            if (modeloCuenta === 'propia') {
                return { filas: construirJerarquia(hojas.map(h => ({ codigo: h.codigo, nombre: h.nombre, valores: { balance: h.balance } })), todasLasCuentas ?? []), sinMapear: [] as { codigo: string; nombre: string }[] }
            }
            const codigoField = modeloCuenta === 'sri' ? 'codigo_sri' : 'codigo_supe'
            const r = agruparPorCodigoAlterno(hojas.map(h => ({ codigo: h.codigo, nombre: h.nombre, valores: { balance: h.balance }, codigoAlterno: h[codigoField] })))
            return { filas: r.filas, sinMapear: r.sinMapear }
        }

        const secActivos = seccion('activo')
        const secPasivos = seccion('pasivo')
        const secPatrimonio = seccion('patrimonio')
        const faltantes = [...secActivos.sinMapear, ...secPasivos.sinMapear, ...secPatrimonio.sinMapear]

        if (faltantes.length > 0) {
            setSinMapear(faltantes)
            setLoading(false)
            return
        }

        setActivos(secActivos.filas)
        setPasivos(secPasivos.filas)
        setPatrimonio(secPatrimonio.filas)
        setTotalActivos(hojasBG.filter(f => f.tipo === 'activo').reduce((s, f) => s + f.balance, 0))
        setTotalPasivos(hojasBG.filter(f => f.tipo === 'pasivo').reduce((s, f) => s + f.balance, 0))
        setTotalPatrimonioCuentas(hojasBG.filter(f => f.tipo === 'patrimonio').reduce((s, f) => s + f.balance, 0))
        setUtilidad(utilidadPeriodo)
        setGenerado(true)
        setLoading(false)
    }

    function exportarCSV() {
        const header = 'Tipo,Código,Nombre,Saldo'
        const resultadoLabel = utilidad >= 0 ? 'Utilidad del Período' : 'Pérdida del Período'
        const filaCsv = (tipo: string) => (f: FilaJerarquica) => `${tipo},"${f.codigo}","${f.nombre}",${f.valores.balance}`
        const rows = [
            ...activos.map(filaCsv('Activo')),
            ...pasivos.map(filaCsv('Pasivo')),
            ...patrimonio.map(filaCsv('Patrimonio')),
            `Patrimonio,"—","${resultadoLabel}",${utilidad}`,
        ]
        const csv = [header, ...rows].join('\n')
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = 'balance_general.csv'; a.click()
        URL.revokeObjectURL(url)
    }

    function imprimir() {
        const filaImp = (f: FilaJerarquica) => ({
            codigo: f.esSubtotal ? `<strong>${f.codigo}</strong>` : f.codigo,
            nombre: `${'&nbsp;&nbsp;&nbsp;&nbsp;'.repeat(f.nivel - 1)}${f.esSubtotal ? `<strong>${f.nombre}</strong>` : f.nombre}`,
            saldo: f.esSubtotal ? `<strong>${formatMoneda(f.valores.balance, sym)}</strong>` : formatMoneda(f.valores.balance, sym),
        })
        const cols = [
            { label: 'Código', key: 'codigo', width: '18%' },
            { label: 'Cuenta', key: 'nombre' },
            { label: 'Saldo', key: 'saldo', align: 'right' as const, width: '20%' },
        ]
        const htmlActivos = generarTablaHtml(cols, activos.map(filaImp), { nombre: '<strong>TOTAL ACTIVOS</strong>', saldo: `<strong>${formatMoneda(totalActivos, sym)}</strong>` })
        const htmlPasivos = generarTablaHtml(cols, pasivos.map(filaImp), { nombre: '<strong>TOTAL PASIVOS</strong>', saldo: `<strong>${formatMoneda(totalPasivos, sym)}</strong>` })
        const filasPatrimonio = [
            ...patrimonio.map(filaImp),
            { codigo: '—', nombre: utilidad >= 0 ? 'Utilidad del Período' : 'Pérdida del Período', saldo: formatMoneda(Math.abs(utilidad), sym) },
        ]
        const htmlPatrimonio = generarTablaHtml(cols, filasPatrimonio, { nombre: '<strong>TOTAL PATRIMONIO</strong>', saldo: `<strong>${formatMoneda(totalPatrimonio, sym)}</strong>` })
        const htmlCuadre = `<table><tbody>
            <tr><td>TOTAL ACTIVOS</td><td style="text-align:right">${formatMoneda(totalActivos, sym)}</td></tr>
            <tr><td>TOTAL PASIVOS + PATRIMONIO</td><td style="text-align:right">${formatMoneda(totalPasivoPatrimonio, sym)}</td></tr>
            <tr><td colspan="2" style="text-align:center;font-weight:bold;padding-top:6px">${cuadra ? '✓ El balance cuadra' : '✗ El balance NO cuadra — revisar'}</td></tr>
        </tbody></table>`

        imprimirReporte({
            empresa: { nombre: empresaActiva?.razon_social ?? '', ruc: empresaActiva?.ruc ?? '' },
            titulo: 'Estado de Situación Financiera',
            periodo: `${periodoLabel}${modeloCuenta !== 'propia' ? ` · Modelo: ${MODELO_LABEL[modeloCuenta]}` : ''}`,
            html: htmlActivos,
            subtablas: [
                { titulo: 'Pasivos', html: htmlPasivos },
                { titulo: 'Patrimonio', html: htmlPatrimonio },
                { titulo: 'Verificación', html: htmlCuadre },
            ],
        })
    }

    const sym = empresaActiva?.moneda?.simbolo ?? '$'
    const periodo = periodos.find(p => p.id === periodoId)
    const periodoLabel = periodo ? (periodo.mes ? `${mesNombre(periodo.mes)} ${periodo.año}` : `Año ${periodo.año}`) : ''
    const totalPatrimonio = totalPatrimonioCuentas + utilidad
    const totalPasivoPatrimonio = totalPasivos + totalPatrimonio
    const cuadra = Math.abs(totalActivos - totalPasivoPatrimonio) < 0.01

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Estado de Situación Financiera</h1>
                    {generado && periodo && (
                        <p className="text-slate-500 text-sm mt-0.5">
                            Al {periodoLabel}{modeloCuenta !== 'propia' && ` · Modelo: ${MODELO_LABEL[modeloCuenta]}`}
                        </p>
                    )}
                </div>
                {generado && (
                    <div className="flex gap-2 no-print">
                        <button onClick={imprimir} className="btn btn-secondary gap-2 text-sm">
                            <Printer className="w-4 h-4" /> Imprimir
                        </button>
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
                <div>
                    <label className="label">Modelo de cuenta</label>
                    <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
                        {(['propia', 'sri', 'supe'] as ModeloCuenta[]).map(m => (
                            <button key={m} type="button" onClick={() => setModeloCuenta(m)}
                                className={cn('px-4 py-2', m !== 'propia' && 'border-l border-slate-200',
                                    modeloCuenta === m ? 'bg-primary-600 text-white font-medium' : 'bg-white text-slate-600 hover:bg-slate-50')}>
                                {MODELO_LABEL[m]}
                            </button>
                        ))}
                    </div>
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

            {/* Cuentas sin mapear al modelo SRI / Superintendencia */}
            {sinMapear && (
                <div className="card px-6 py-5 border border-red-200 bg-red-50">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-bold text-red-800">
                                No se puede generar el reporte en modelo {MODELO_LABEL[modeloCuenta]}
                            </p>
                            <p className="text-sm text-red-700 mt-1">
                                Las siguientes cuentas tienen saldo en este período pero no tienen código {modeloCuenta === 'sri' ? 'SRI' : 'de Superintendencia'} asignado.
                                Asígnalo en Plan de Cuentas y vuelve a generar:
                            </p>
                            <ul className="mt-2 space-y-0.5 text-sm text-red-800 font-mono">
                                {sinMapear.map(c => (
                                    <li key={c.codigo}>• {c.codigo} — {c.nombre}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            )}

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
                                        <tr key={f.codigo} className={cn('border-b border-slate-100', f.esSubtotal ? 'bg-slate-50 font-semibold' : 'hover:bg-slate-50')}>
                                            <td className="py-2 px-5 font-mono text-xs text-slate-500 w-28">{f.codigo}</td>
                                            <td className="py-2 px-3 text-slate-700" style={{ paddingLeft: `${(f.nivel - 1) * 14 + 12}px` }}>{f.nombre}</td>
                                            <td className="py-2 px-5 text-right font-mono text-slate-800 w-36">
                                                {formatMoneda(f.valores.balance, sym)}
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
                <div className="card px-6 py-4 no-print">
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
