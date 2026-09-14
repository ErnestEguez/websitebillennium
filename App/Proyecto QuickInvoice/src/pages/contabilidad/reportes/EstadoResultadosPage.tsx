import { useEffect, useState } from 'react'
import { AlertTriangle, Download, Loader2, Printer, RefreshCw } from 'lucide-react'
import { supabase } from '../../../lib/supabaseContabilidad'
import { useAuth } from '../../../contexts/contabilidad/ContabilidadContext'
import { cn, formatMoneda, mesNombre } from '../../../lib/utils'
import { imprimirReporte, generarTablaHtml } from '../../../lib/printUtils'
import { construirJerarquia, agruparPorCodigoAlterno, type FilaJerarquica } from '../../../lib/contaJerarquia'
import type { LpPeriodo } from '../../../types/conta'

type Modo = 'mes' | 'acumulado'
type ModeloCuenta = 'propia' | 'sri' | 'supe'

const MODELO_LABEL: Record<ModeloCuenta, string> = {
    propia: 'Cta. Propia', sri: 'SRI', supe: 'Superintendencia',
}

interface HojaER {
    cuenta_id: string; codigo: string; nombre: string; tipo: string; balance: number
    codigo_sri: string | null; codigo_supe: string | null
}

export function EstadoResultadosPage() {
    const { empresaActiva } = useAuth()
    const [periodos, setPeriodos] = useState<LpPeriodo[]>([])
    const [periodoId, setPeriodoId] = useState('')
    const [modo, setModo] = useState<Modo>('mes')
    const [modeloCuenta, setModeloCuenta] = useState<ModeloCuenta>('propia')
    const [ingresos, setIngresos] = useState<FilaJerarquica[]>([])
    const [gastos, setGastos] = useState<FilaJerarquica[]>([])
    const [totalIngresos, setTotalIngresos] = useState(0)
    const [totalGastos, setTotalGastos] = useState(0)
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

    function periodosHasta(selId: string): string[] {
        const sel = periodos.find(p => p.id === selId)
        if (!sel) return [selId]
        return periodos
            .filter(p => p.año < sel.año ||
                (p.año === sel.año && ((sel.mes == null) || (p.mes ?? 0) <= (sel.mes ?? 12))))
            .map(p => p.id)
    }

    async function generar() {
        if (!empresaActiva || !periodoId) return
        setLoading(true); setGenerado(false); setSinMapear(null)

        const ids = modo === 'acumulado' ? periodosHasta(periodoId) : [periodoId]

        // Query 1: IDs de comprobantes (sin joins)
        const { data: comps } = await supabase
            .from('lp_comprobantes')
            .select('id')
            .eq('empresa_id', empresaActiva.id)
            .in('periodo_id', ids)
            .neq('estado', 'anulado')

        const compIds = (comps ?? []).map((c: any) => c.id)
        if (!compIds.length) {
            setIngresos([]); setGastos([])
            setGenerado(true); setLoading(false)
            return
        }

        // Query 2: líneas de esos comprobantes (sin joins)
        const { data: lineas } = await supabase
            .from('lp_comprobante_lineas')
            .select('cuenta_id, debe, haber')
            .eq('empresa_id', empresaActiva.id)
            .in('comprobante_id', compIds)

        if (!lineas?.length) {
            setIngresos([]); setGastos([])
            setGenerado(true); setLoading(false)
            return
        }

        // Query 3: datos de las cuentas únicas involucradas + todo el plan (para jerarquía)
        const cuentaIds = [...new Set((lineas as any[]).map((l: any) => l.cuenta_id))]
        const [{ data: cuentasData }, { data: todasLasCuentas }] = await Promise.all([
            supabase.from('lp_cuentas')
                .select('id, codigo, nombre, tipo, naturaleza, acepta_movimientos, codigo_sri, codigo_supe')
                .in('id', cuentaIds),
            supabase.from('lp_cuentas').select('codigo, nombre').eq('empresa_id', empresaActiva.id),
        ])

        const mapaCuentas = new Map((cuentasData ?? []).map((c: any) => [c.id, c]))

        // Agregar en JS
        const mapa = new Map<string, any>()
        for (const l of lineas as any[]) {
            const cuenta = mapaCuentas.get(l.cuenta_id)
            if (!cuenta?.acepta_movimientos || !['ingreso', 'gasto'].includes(cuenta.tipo)) continue
            const ex = mapa.get(l.cuenta_id)
            if (ex) {
                ex.debe  += l.debe  ?? 0
                ex.haber += l.haber ?? 0
            } else {
                mapa.set(l.cuenta_id, {
                    cuenta_id:  l.cuenta_id,
                    codigo:     cuenta.codigo,
                    nombre:     cuenta.nombre,
                    tipo:       cuenta.tipo,
                    naturaleza: cuenta.naturaleza,
                    codigo_sri: cuenta.codigo_sri,
                    codigo_supe: cuenta.codigo_supe,
                    debe:  l.debe  ?? 0,
                    haber: l.haber ?? 0,
                })
            }
        }

        const hojas: HojaER[] = Array.from(mapa.values()).map(r => {
            const balance = r.naturaleza === 'deudora'
                ? Math.max(0, r.debe - r.haber)
                : Math.max(0, r.haber - r.debe)
            return { cuenta_id: r.cuenta_id, codigo: r.codigo, nombre: r.nombre, tipo: r.tipo, balance, codigo_sri: r.codigo_sri, codigo_supe: r.codigo_supe }
        }).filter(f => f.balance > 0)

        function seccion(tipo: string) {
            const hs = hojas.filter(f => f.tipo === tipo)
            if (modeloCuenta === 'propia') {
                return { filas: construirJerarquia(hs.map(h => ({ codigo: h.codigo, nombre: h.nombre, valores: { balance: h.balance } })), todasLasCuentas ?? []), sinMapear: [] as { codigo: string; nombre: string }[] }
            }
            const codigoField = modeloCuenta === 'sri' ? 'codigo_sri' : 'codigo_supe'
            const r = agruparPorCodigoAlterno(hs.map(h => ({ codigo: h.codigo, nombre: h.nombre, valores: { balance: h.balance }, codigoAlterno: h[codigoField] })))
            return { filas: r.filas, sinMapear: r.sinMapear }
        }

        const secIngresos = seccion('ingreso')
        const secGastos = seccion('gasto')
        const faltantes = [...secIngresos.sinMapear, ...secGastos.sinMapear]

        if (faltantes.length > 0) {
            setSinMapear(faltantes)
            setLoading(false)
            return
        }

        setIngresos(secIngresos.filas)
        setGastos(secGastos.filas)
        setTotalIngresos(hojas.filter(f => f.tipo === 'ingreso').reduce((s, f) => s + f.balance, 0))
        setTotalGastos(hojas.filter(f => f.tipo === 'gasto').reduce((s, f) => s + f.balance, 0))
        setGenerado(true)
        setLoading(false)
    }

    function exportarCSV() {
        const header = 'Tipo,Código,Nombre,Monto'
        const rows = [
            ...ingresos.map(f => `Ingreso,"${f.codigo}","${f.nombre}",${f.valores.balance}`),
            ...gastos.map(f => `Gasto,"${f.codigo}","${f.nombre}",${f.valores.balance}`),
        ]
        const csv = [header, ...rows].join('\n')
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = 'estado_resultados.csv'; a.click()
        URL.revokeObjectURL(url)
    }

    function imprimir() {
        const filaImp = (f: FilaJerarquica) => ({
            codigo: f.esSubtotal ? `<strong>${f.codigo}</strong>` : f.codigo,
            nombre: `${'&nbsp;&nbsp;&nbsp;&nbsp;'.repeat(f.nivel - 1)}${f.esSubtotal ? `<strong>${f.nombre}</strong>` : f.nombre}`,
            monto: f.esSubtotal ? `<strong>${formatMoneda(f.valores.balance, sym)}</strong>` : formatMoneda(f.valores.balance, sym),
        })
        const cols = [
            { label: 'Código', key: 'codigo', width: '18%' },
            { label: 'Cuenta', key: 'nombre' },
            { label: 'Monto', key: 'monto', align: 'right' as const, width: '20%' },
        ]
        const htmlIngresos = generarTablaHtml(cols, ingresos.map(filaImp), { nombre: '<strong>TOTAL INGRESOS</strong>', monto: `<strong>${formatMoneda(totalIngresos, sym)}</strong>` })
        const htmlGastos = generarTablaHtml(cols, gastos.map(filaImp), { nombre: '<strong>TOTAL GASTOS</strong>', monto: `<strong>${formatMoneda(totalGastos, sym)}</strong>` })
        const htmlResultado = `<table><tbody>
            <tr style="background:${esUtilidad ? '#e8f5e9' : '#fdecea'}"><td style="font-weight:bold;font-size:12px">${esUtilidad ? 'UTILIDAD DEL PERÍODO' : 'PÉRDIDA DEL PERÍODO'}</td><td style="text-align:right;font-weight:bold;font-size:12px">${formatMoneda(Math.abs(utilidad), sym)}</td></tr>
        </tbody></table>`

        imprimirReporte({
            empresa: { nombre: empresaActiva?.razon_social ?? '', ruc: empresaActiva?.ruc ?? '' },
            titulo: 'Estado de Resultados',
            periodo: `${subtitulo}${modeloCuenta !== 'propia' ? ` · Modelo: ${MODELO_LABEL[modeloCuenta]}` : ''}`,
            html: htmlIngresos,
            subtablas: [
                { titulo: '(-) Gastos', html: htmlGastos },
                { titulo: 'Resultado', html: htmlResultado },
            ],
        })
    }

    const sym = empresaActiva?.moneda?.simbolo ?? '$'
    const periodo = periodos.find(p => p.id === periodoId)
    const periodoLabel = periodo ? (periodo.mes ? `${mesNombre(periodo.mes)} ${periodo.año}` : `Año ${periodo.año}`) : ''
    const subtitulo = modo === 'acumulado' ? `Acumulado al ${periodoLabel}` : `Período: ${periodoLabel}`
    const utilidad = totalIngresos - totalGastos
    const esUtilidad = utilidad >= 0

    return (
        <div className="space-y-5 max-w-3xl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Estado de Resultados</h1>
                    {generado && <p className="text-slate-500 text-sm mt-0.5">{subtitulo}{modeloCuenta !== 'propia' && ` · Modelo: ${MODELO_LABEL[modeloCuenta]}`}</p>}
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
                    <label className="label">Vista</label>
                    <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
                        {(['mes','acumulado'] as Modo[]).map(m => (
                            <button key={m} type="button" onClick={() => setModo(m)}
                                className={cn('px-4 py-2', m !== 'mes' && 'border-l border-slate-200',
                                    modo === m ? 'bg-primary-600 text-white font-medium' : 'bg-white text-slate-600 hover:bg-slate-50')}>
                                {m === 'mes' ? 'Mes' : 'Acumulado'}
                            </button>
                        ))}
                    </div>
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
                <button onClick={generar} disabled={!periodoId || loading} className="btn btn-primary gap-2">
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

            {generado && (
                <div className="card overflow-hidden">
                    {/* Ingresos */}
                    <div className="bg-green-700 px-5 py-3 text-white font-bold text-sm uppercase tracking-wide">Ingresos</div>
                    <table className="w-full text-sm">
                        <tbody>
                            {ingresos.map(f => (
                                <tr key={f.codigo} className={cn('border-b border-slate-100', f.esSubtotal ? 'bg-slate-50 font-semibold' : 'hover:bg-slate-50')}>
                                    <td className="py-2.5 px-5 font-mono text-xs text-slate-500 w-28">{f.codigo}</td>
                                    <td className="py-2.5 px-3 text-slate-700" style={{ paddingLeft: `${(f.nivel - 1) * 14 + 12}px` }}>{f.nombre}</td>
                                    <td className="py-2.5 px-5 text-right font-mono text-slate-800 w-36">{formatMoneda(f.valores.balance, sym)}</td>
                                </tr>
                            ))}
                            {ingresos.length === 0 && (
                                <tr><td colSpan={3} className="py-4 text-center text-slate-400 text-xs">Sin ingresos en este período</td></tr>
                            )}
                        </tbody>
                        <tfoot>
                            <tr className="bg-green-50 border-t-2 border-green-200 font-bold">
                                <td colSpan={2} className="py-3 px-5 text-right text-xs uppercase tracking-wide text-green-800">Total Ingresos</td>
                                <td className="py-3 px-5 text-right font-mono text-green-900">{formatMoneda(totalIngresos, sym)}</td>
                            </tr>
                        </tfoot>
                    </table>

                    {/* Gastos */}
                    <div className="bg-amber-700 px-5 py-3 text-white font-bold text-sm uppercase tracking-wide border-t border-slate-200">(-) Gastos</div>
                    <table className="w-full text-sm">
                        <tbody>
                            {gastos.map(f => (
                                <tr key={f.codigo} className={cn('border-b border-slate-100', f.esSubtotal ? 'bg-slate-50 font-semibold' : 'hover:bg-slate-50')}>
                                    <td className="py-2.5 px-5 font-mono text-xs text-slate-500 w-28">{f.codigo}</td>
                                    <td className="py-2.5 px-3 text-slate-700" style={{ paddingLeft: `${(f.nivel - 1) * 14 + 12}px` }}>{f.nombre}</td>
                                    <td className="py-2.5 px-5 text-right font-mono text-slate-800 w-36">{formatMoneda(f.valores.balance, sym)}</td>
                                </tr>
                            ))}
                            {gastos.length === 0 && (
                                <tr><td colSpan={3} className="py-4 text-center text-slate-400 text-xs">Sin gastos en este período</td></tr>
                            )}
                        </tbody>
                        <tfoot>
                            <tr className="bg-amber-50 border-t-2 border-amber-200 font-bold">
                                <td colSpan={2} className="py-3 px-5 text-right text-xs uppercase tracking-wide text-amber-800">Total Gastos</td>
                                <td className="py-3 px-5 text-right font-mono text-amber-900">{formatMoneda(totalGastos, sym)}</td>
                            </tr>
                        </tfoot>
                    </table>

                    {/* Resultado */}
                    <div className={cn('px-5 py-5 border-t-4', esUtilidad ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50')}>
                        <div className="flex items-center justify-between">
                            <p className={cn('text-sm font-bold uppercase tracking-widest', esUtilidad ? 'text-green-700' : 'text-red-700')}>
                                {esUtilidad ? '✓ Utilidad del Período' : '✗ Pérdida del Período'}
                            </p>
                            <p className={cn('text-2xl font-bold font-mono', esUtilidad ? 'text-green-800' : 'text-red-800')}>
                                {formatMoneda(Math.abs(utilidad), sym)}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {generado && ingresos.length === 0 && gastos.length === 0 && (
                <div className="card p-10 text-center text-slate-400">
                    <p>No hay ingresos ni gastos para este criterio.</p>
                    <p className="text-xs mt-2">Confirma comprobantes para que aparezcan aquí.</p>
                </div>
            )}
        </div>
    )
}
