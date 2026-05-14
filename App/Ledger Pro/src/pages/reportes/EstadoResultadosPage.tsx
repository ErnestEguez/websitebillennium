import { useEffect, useState } from 'react'
import { Download, Loader2, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { cn, formatMoneda, mesNombre } from '../../lib/utils'
import { PrintButton } from '../../components/PrintButton'
import type { LpPeriodo } from '../../types/conta'

type Modo = 'mes' | 'acumulado'

interface FilaER {
    cuenta_id: string; codigo: string; nombre: string; tipo: string; balance: number
}

export function EstadoResultadosPage() {
    const { empresaActiva } = useAuth()
    const [periodos, setPeriodos] = useState<LpPeriodo[]>([])
    const [periodoId, setPeriodoId] = useState('')
    const [modo, setModo] = useState<Modo>('mes')
    const [ingresos, setIngresos] = useState<FilaER[]>([])
    const [gastos, setGastos] = useState<FilaER[]>([])
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
        setLoading(true); setGenerado(false)

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

        // Query 3: datos de las cuentas únicas involucradas (sin joins)
        const cuentaIds = [...new Set((lineas as any[]).map((l: any) => l.cuenta_id))]
        const { data: cuentasData } = await supabase
            .from('lp_cuentas')
            .select('id, codigo, nombre, tipo, naturaleza, acepta_movimientos')
            .in('id', cuentaIds)

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
                    debe:  l.debe  ?? 0,
                    haber: l.haber ?? 0,
                })
            }
        }

        const filas: FilaER[] = Array.from(mapa.values()).map(r => {
            const balance = r.naturaleza === 'deudora'
                ? Math.max(0, r.debe - r.haber)
                : Math.max(0, r.haber - r.debe)
            return { cuenta_id: r.cuenta_id, codigo: r.codigo, nombre: r.nombre, tipo: r.tipo, balance }
        }).filter(f => f.balance > 0).sort((a, b) => a.codigo.localeCompare(b.codigo))

        setIngresos(filas.filter(f => f.tipo === 'ingreso'))
        setGastos(filas.filter(f => f.tipo === 'gasto'))
        setGenerado(true)
        setLoading(false)
    }

    function exportarCSV() {
        const header = 'Tipo,Código,Nombre,Monto'
        const rows = [
            ...ingresos.map(f => `Ingreso,"${f.codigo}","${f.nombre}",${f.balance}`),
            ...gastos.map(f => `Gasto,"${f.codigo}","${f.nombre}",${f.balance}`),
        ]
        const csv = [header, ...rows].join('\n')
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = 'estado_resultados.csv'; a.click()
        URL.revokeObjectURL(url)
    }

    const sym = empresaActiva?.moneda?.simbolo ?? '$'
    const periodo = periodos.find(p => p.id === periodoId)
    const periodoLabel = periodo ? (periodo.mes ? `${mesNombre(periodo.mes)} ${periodo.año}` : `Año ${periodo.año}`) : ''
    const subtitulo = modo === 'acumulado' ? `Acumulado al ${periodoLabel}` : `Período: ${periodoLabel}`
    const totalIngresos = ingresos.reduce((s, f) => s + f.balance, 0)
    const totalGastos   = gastos.reduce((s, f) => s + f.balance, 0)
    const utilidad = totalIngresos - totalGastos
    const esUtilidad = utilidad >= 0

    return (
        <div className="space-y-5 max-w-3xl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Estado de Resultados</h1>
                    {generado && <p className="text-slate-500 text-sm mt-0.5">{subtitulo}</p>}
                </div>
                {generado && (
                    <div className="flex gap-2 no-print">
                        <PrintButton titulo="Estado de Resultados" empresa={empresaActiva?.razon_social} subtitulo={subtitulo} />
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
                <button onClick={generar} disabled={!periodoId || loading} className="btn btn-primary gap-2">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Generar
                </button>
            </div>

            {generado && (
                <div className="card overflow-hidden">
                    {/* Ingresos */}
                    <div className="bg-green-700 px-5 py-3 text-white font-bold text-sm uppercase tracking-wide">Ingresos</div>
                    <table className="w-full text-sm">
                        <tbody>
                            {ingresos.map(f => (
                                <tr key={f.cuenta_id} className="border-b border-slate-100 hover:bg-slate-50">
                                    <td className="py-2.5 px-5 font-mono text-xs text-slate-500 w-28">{f.codigo}</td>
                                    <td className="py-2.5 px-3 text-slate-700">{f.nombre}</td>
                                    <td className="py-2.5 px-5 text-right font-mono text-slate-800 w-36">{formatMoneda(f.balance, sym)}</td>
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
                                <tr key={f.cuenta_id} className="border-b border-slate-100 hover:bg-slate-50">
                                    <td className="py-2.5 px-5 font-mono text-xs text-slate-500 w-28">{f.codigo}</td>
                                    <td className="py-2.5 px-3 text-slate-700">{f.nombre}</td>
                                    <td className="py-2.5 px-5 text-right font-mono text-slate-800 w-36">{formatMoneda(f.balance, sym)}</td>
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
