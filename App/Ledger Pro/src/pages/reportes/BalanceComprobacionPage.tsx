import { useEffect, useState } from 'react'
import { Download, Loader2, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { cn, formatMoneda, mesNombre } from '../../lib/utils'
import { PrintButton } from '../../components/PrintButton'
import type { LpPeriodo } from '../../types/conta'

type Modo = 'mes' | 'acumulado'

interface FilaBalance {
    cuenta_id: string; codigo: string; nombre: string; nivel: number; tipo: string
    saldo_inicial_debe: number; saldo_inicial_haber: number
    movimientos_debe: number; movimientos_haber: number
    saldo_final_debe: number; saldo_final_haber: number
}

export function BalanceComprobacionPage() {
    const { empresaActiva } = useAuth()
    const [periodos, setPeriodos] = useState<LpPeriodo[]>([])
    const [periodoId, setPeriodoId] = useState('')
    const [modo, setModo] = useState<Modo>('mes')
    const [filas, setFilas] = useState<FilaBalance[]>([])
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

    // Devuelve los IDs de períodos hasta (e incluyendo) el seleccionado
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

        const { data } = await supabase
            .from('lp_saldos_cuenta')
            .select(`cuenta_id, saldo_inicial_debe, saldo_inicial_haber,
                     movimientos_debe, movimientos_haber,
                     cuenta:lp_cuentas(codigo, nombre, nivel, tipo, acepta_movimientos)`)
            .eq('empresa_id', empresaActiva.id)
            .in('periodo_id', ids)

        if (!data) { setLoading(false); return }

        // Agrupar por cuenta cuando son múltiples períodos
        const mapa = new Map<string, FilaBalance>()
        for (const r of data as any[]) {
            if (!r.cuenta?.acepta_movimientos) continue
            const ex = mapa.get(r.cuenta_id)
            if (ex) {
                ex.saldo_inicial_debe  += r.saldo_inicial_debe
                ex.saldo_inicial_haber += r.saldo_inicial_haber
                ex.movimientos_debe    += r.movimientos_debe
                ex.movimientos_haber   += r.movimientos_haber
            } else {
                mapa.set(r.cuenta_id, {
                    cuenta_id: r.cuenta_id, codigo: r.cuenta.codigo,
                    nombre: r.cuenta.nombre, nivel: r.cuenta.nivel, tipo: r.cuenta.tipo,
                    saldo_inicial_debe: r.saldo_inicial_debe, saldo_inicial_haber: r.saldo_inicial_haber,
                    movimientos_debe: r.movimientos_debe, movimientos_haber: r.movimientos_haber,
                    saldo_final_debe: 0, saldo_final_haber: 0,
                })
            }
        }

        const resultado: FilaBalance[] = Array.from(mapa.values()).map(f => ({
            ...f,
            saldo_final_debe:  Math.max(0, (f.saldo_inicial_debe  + f.movimientos_debe)  - (f.saldo_inicial_haber + f.movimientos_haber)),
            saldo_final_haber: Math.max(0, (f.saldo_inicial_haber + f.movimientos_haber) - (f.saldo_inicial_debe  + f.movimientos_debe)),
        })).sort((a, b) => a.codigo.localeCompare(b.codigo))

        setFilas(resultado)
        setGenerado(true)
        setLoading(false)
    }

    function exportarCSV() {
        const header = 'Código,Nombre,Tipo,SI Debe,SI Haber,Mov Debe,Mov Haber,SF Debe,SF Haber'
        const rows = filas.map(f =>
            `"${f.codigo}","${f.nombre}",${f.tipo},${f.saldo_inicial_debe},${f.saldo_inicial_haber},${f.movimientos_debe},${f.movimientos_haber},${f.saldo_final_debe},${f.saldo_final_haber}`)
        const csv = [header, ...rows].join('\n')
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = 'balance_comprobacion.csv'; a.click()
        URL.revokeObjectURL(url)
    }

    const periodo = periodos.find(p => p.id === periodoId)
    const sym = empresaActiva?.moneda?.simbolo ?? '$'
    const periodoLabel = periodo ? (periodo.mes ? `${mesNombre(periodo.mes)} ${periodo.año}` : `Año ${periodo.año}`) : ''
    const subtitulo = generado ? `${modo === 'acumulado' ? `Acumulado al ${periodoLabel}` : periodoLabel} · ${filas.length} cuentas` : ''

    const totales = filas.reduce((acc, f) => ({
        si_debe:  acc.si_debe  + f.saldo_inicial_debe,  si_haber:  acc.si_haber  + f.saldo_inicial_haber,
        mov_debe: acc.mov_debe + f.movimientos_debe,     mov_haber: acc.mov_haber + f.movimientos_haber,
        sf_debe:  acc.sf_debe  + f.saldo_final_debe,     sf_haber:  acc.sf_haber  + f.saldo_final_haber,
    }), { si_debe:0, si_haber:0, mov_debe:0, mov_haber:0, sf_debe:0, sf_haber:0 })

    const TIPO_COLOR: Record<string, string> = {
        activo:'text-blue-600', pasivo:'text-red-600',
        patrimonio:'text-purple-600', ingreso:'text-green-600', gasto:'text-amber-600',
    }

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Balance de Comprobación</h1>
                    {generado && <p className="text-slate-500 text-sm mt-0.5">{subtitulo}</p>}
                </div>
                {generado && (
                    <div className="flex gap-2 no-print">
                        <PrintButton titulo="Balance de Comprobación" empresa={empresaActiva?.razon_social} subtitulo={subtitulo} />
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
                {/* Toggle Mes / Acumulado */}
                <div>
                    <label className="label">Vista</label>
                    <div className="flex rounded-lg border border-slate-200 overflow-hidden text-sm">
                        {(['mes','acumulado'] as Modo[]).map(m => (
                            <button key={m} type="button" onClick={() => setModo(m)}
                                className={cn('px-4 py-2 capitalize', m !== 'mes' && 'border-l border-slate-200',
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
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-700 text-white">
                                    <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide" rowSpan={2}>Código</th>
                                    <th className="text-left py-3 px-4 text-xs font-semibold uppercase tracking-wide" rowSpan={2}>Nombre de la Cuenta</th>
                                    <th className="text-center py-2 px-4 text-xs font-semibold uppercase tracking-wide border-l border-slate-600" colSpan={2}>Saldo Inicial</th>
                                    <th className="text-center py-2 px-4 text-xs font-semibold uppercase tracking-wide border-l border-slate-600" colSpan={2}>Movimientos</th>
                                    <th className="text-center py-2 px-4 text-xs font-semibold uppercase tracking-wide border-l border-slate-600" colSpan={2}>Saldo Final</th>
                                </tr>
                                <tr className="bg-slate-600 text-white">
                                    {['Debe','Haber','Debe','Haber','Debe','Haber'].map((h,i) => (
                                        <th key={i} className={cn('py-2 px-4 text-right text-xs font-semibold uppercase tracking-wide', i%2===0 && 'border-l border-slate-500')}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filas.map(f => (
                                    <tr key={f.cuenta_id} className="border-b border-slate-100 hover:bg-slate-50">
                                        <td className={cn('py-2 px-4 font-mono text-xs', TIPO_COLOR[f.tipo])}>{f.codigo}</td>
                                        <td className="py-2 px-4 text-slate-700">{f.nombre}</td>
                                        <td className="py-2 px-4 text-right font-mono text-slate-600 border-l border-slate-100">{f.saldo_inicial_debe > 0 ? formatMoneda(f.saldo_inicial_debe,sym) : '—'}</td>
                                        <td className="py-2 px-4 text-right font-mono text-slate-600">{f.saldo_inicial_haber > 0 ? formatMoneda(f.saldo_inicial_haber,sym) : '—'}</td>
                                        <td className="py-2 px-4 text-right font-mono text-slate-700 border-l border-slate-100">{f.movimientos_debe > 0 ? formatMoneda(f.movimientos_debe,sym) : '—'}</td>
                                        <td className="py-2 px-4 text-right font-mono text-slate-700">{f.movimientos_haber > 0 ? formatMoneda(f.movimientos_haber,sym) : '—'}</td>
                                        <td className={cn('py-2 px-4 text-right font-mono font-semibold border-l border-slate-100', f.saldo_final_debe > 0 ? 'text-slate-900' : 'text-slate-300')}>{f.saldo_final_debe > 0 ? formatMoneda(f.saldo_final_debe,sym) : '—'}</td>
                                        <td className={cn('py-2 px-4 text-right font-mono font-semibold', f.saldo_final_haber > 0 ? 'text-slate-900' : 'text-slate-300')}>{f.saldo_final_haber > 0 ? formatMoneda(f.saldo_final_haber,sym) : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="bg-slate-800 text-white font-bold">
                                    <td colSpan={2} className="py-3 px-4 text-right text-xs uppercase tracking-wide">TOTALES</td>
                                    {[totales.si_debe,totales.si_haber,totales.mov_debe,totales.mov_haber,totales.sf_debe,totales.sf_haber].map((v,i) => (
                                        <td key={i} className={cn('py-3 px-4 text-right font-mono', i%2===0 && 'border-l border-slate-600')}>{formatMoneda(v,sym)}</td>
                                    ))}
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                    <div className="flex items-center justify-end gap-6 px-6 py-3 bg-slate-50 border-t text-xs">
                        {[['SI',totales.si_debe,totales.si_haber],['Movimientos',totales.mov_debe,totales.mov_haber],['SF',totales.sf_debe,totales.sf_haber]].map(([label,d,h]) => (
                            <span key={label as string} className={cn('font-semibold', Math.abs((d as number)-(h as number))<0.01 ? 'text-green-600' : 'text-red-600')}>
                                {label}: {Math.abs((d as number)-(h as number))<0.01 ? '✓ Cuadra' : '✗ No cuadra'}
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {generado && filas.length === 0 && (
                <div className="card p-10 text-center text-slate-400">
                    <p>No hay movimientos contabilizados para este criterio.</p>
                </div>
            )}
        </div>
    )
}
