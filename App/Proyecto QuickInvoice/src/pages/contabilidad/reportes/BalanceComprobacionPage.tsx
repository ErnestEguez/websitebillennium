import { useEffect, useState } from 'react'
import { Download, Loader2, Printer, RefreshCw } from 'lucide-react'
import { supabase } from '../../../lib/supabaseContabilidad'
import { useAuth } from '../../../contexts/contabilidad/ContabilidadContext'
import { cn, formatMoneda, mesNombre } from '../../../lib/utils'
import { imprimirReporte, generarTablaHtml } from '../../../lib/printUtils'
import { construirJerarquia, type FilaJerarquica } from '../../../lib/contaJerarquia'
import type { LpPeriodo } from '../../../types/conta'

type Modo = 'mes' | 'acumulado'

export function BalanceComprobacionPage() {
    const { empresaActiva } = useAuth()
    const [periodos, setPeriodos] = useState<LpPeriodo[]>([])
    const [periodoId, setPeriodoId] = useState('')
    const [modo, setModo] = useState<Modo>('mes')
    const [filas, setFilas] = useState<FilaJerarquica[]>([])
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

        const [{ data }, { data: todasLasCuentas }] = await Promise.all([
            supabase
                .from('lp_saldos_cuenta')
                .select(`cuenta_id, saldo_inicial_debe, saldo_inicial_haber,
                         movimientos_debe, movimientos_haber,
                         cuenta:lp_cuentas(codigo, nombre, nivel, tipo, acepta_movimientos)`)
                .eq('empresa_id', empresaActiva.id)
                .in('periodo_id', ids),
            supabase.from('lp_cuentas').select('codigo, nombre').eq('empresa_id', empresaActiva.id),
        ])

        if (!data) { setLoading(false); return }

        // Agrupar por cuenta cuando son múltiples períodos
        const mapa = new Map<string, any>()
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
                    cuenta_id: r.cuenta_id, codigo: r.cuenta.codigo, nombre: r.cuenta.nombre, tipo: r.cuenta.tipo,
                    saldo_inicial_debe: r.saldo_inicial_debe, saldo_inicial_haber: r.saldo_inicial_haber,
                    movimientos_debe: r.movimientos_debe, movimientos_haber: r.movimientos_haber,
                })
            }
        }

        const hojas = Array.from(mapa.values()).map(f => {
            const saldo_final_debe  = Math.max(0, (f.saldo_inicial_debe  + f.movimientos_debe)  - (f.saldo_inicial_haber + f.movimientos_haber))
            const saldo_final_haber = Math.max(0, (f.saldo_inicial_haber + f.movimientos_haber) - (f.saldo_inicial_debe  + f.movimientos_debe))
            return {
                codigo: f.codigo, nombre: f.nombre, tipo: f.tipo,
                valores: {
                    si_debe: f.saldo_inicial_debe, si_haber: f.saldo_inicial_haber,
                    mov_debe: f.movimientos_debe, mov_haber: f.movimientos_haber,
                    sf_debe: saldo_final_debe, sf_haber: saldo_final_haber,
                },
            }
        })

        const resultado = construirJerarquia(hojas, todasLasCuentas ?? [])
        setFilas(resultado)
        setGenerado(true)
        setLoading(false)
    }

    function exportarCSV() {
        const header = 'Código,Nombre,SI Debe,SI Haber,Mov Debe,Mov Haber,SF Debe,SF Haber'
        const rows = filas.map(f =>
            `"${f.codigo}","${f.nombre}",${f.valores.si_debe},${f.valores.si_haber},${f.valores.mov_debe},${f.valores.mov_haber},${f.valores.sf_debe},${f.valores.sf_haber}`)
        const csv = [header, ...rows].join('\n')
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = 'balance_comprobacion.csv'; a.click()
        URL.revokeObjectURL(url)
    }

    function imprimir() {
        const fmt = (v: number) => v > 0 ? formatMoneda(v, sym) : '—'
        const cols = [
            { label: 'Código', key: 'codigo', width: '12%' },
            { label: 'Nombre', key: 'nombre' },
            { label: 'SI Debe', key: 'si_debe', align: 'right' as const, width: '11%' },
            { label: 'SI Haber', key: 'si_haber', align: 'right' as const, width: '11%' },
            { label: 'Mov. Debe', key: 'mov_debe', align: 'right' as const, width: '11%' },
            { label: 'Mov. Haber', key: 'mov_haber', align: 'right' as const, width: '11%' },
            { label: 'SF Debe', key: 'sf_debe', align: 'right' as const, width: '11%' },
            { label: 'SF Haber', key: 'sf_haber', align: 'right' as const, width: '11%' },
        ]
        const rows = filas.map(f => ({
            codigo: f.esSubtotal ? `<strong>${f.codigo}</strong>` : f.codigo,
            nombre: `${'&nbsp;&nbsp;&nbsp;&nbsp;'.repeat(f.nivel - 1)}${f.esSubtotal ? `<strong>${f.nombre}</strong>` : f.nombre}`,
            si_debe: f.esSubtotal ? `<strong>${fmt(f.valores.si_debe)}</strong>` : fmt(f.valores.si_debe),
            si_haber: f.esSubtotal ? `<strong>${fmt(f.valores.si_haber)}</strong>` : fmt(f.valores.si_haber),
            mov_debe: f.esSubtotal ? `<strong>${fmt(f.valores.mov_debe)}</strong>` : fmt(f.valores.mov_debe),
            mov_haber: f.esSubtotal ? `<strong>${fmt(f.valores.mov_haber)}</strong>` : fmt(f.valores.mov_haber),
            sf_debe: f.esSubtotal ? `<strong>${fmt(f.valores.sf_debe)}</strong>` : fmt(f.valores.sf_debe),
            sf_haber: f.esSubtotal ? `<strong>${fmt(f.valores.sf_haber)}</strong>` : fmt(f.valores.sf_haber),
        }))
        const html = generarTablaHtml(cols, rows, {
            nombre: '<strong>TOTALES</strong>',
            si_debe: `<strong>${formatMoneda(totales.si_debe, sym)}</strong>`,
            si_haber: `<strong>${formatMoneda(totales.si_haber, sym)}</strong>`,
            mov_debe: `<strong>${formatMoneda(totales.mov_debe, sym)}</strong>`,
            mov_haber: `<strong>${formatMoneda(totales.mov_haber, sym)}</strong>`,
            sf_debe: `<strong>${formatMoneda(totales.sf_debe, sym)}</strong>`,
            sf_haber: `<strong>${formatMoneda(totales.sf_haber, sym)}</strong>`,
        })
        imprimirReporte({
            empresa: { nombre: empresaActiva?.razon_social ?? '', ruc: empresaActiva?.ruc ?? '' },
            titulo: 'Balance de Comprobación',
            periodo: subtitulo,
            html,
        })
    }

    const periodo = periodos.find(p => p.id === periodoId)
    const sym = empresaActiva?.moneda?.simbolo ?? '$'
    const periodoLabel = periodo ? (periodo.mes ? `${mesNombre(periodo.mes)} ${periodo.año}` : `Año ${periodo.año}`) : ''
    // Solo se cuentan las hojas para el conteo de cuentas del subtítulo (los subtotales no son "cuentas")
    const subtitulo = generado ? `${modo === 'acumulado' ? `Acumulado al ${periodoLabel}` : periodoLabel} · ${filas.filter(f => !f.esSubtotal).length} cuentas` : ''

    const totales = filas.filter(f => f.nivel === 1).reduce((acc, f) => ({
        si_debe:  acc.si_debe  + f.valores.si_debe,  si_haber:  acc.si_haber  + f.valores.si_haber,
        mov_debe: acc.mov_debe + f.valores.mov_debe, mov_haber: acc.mov_haber + f.valores.mov_haber,
        sf_debe:  acc.sf_debe  + f.valores.sf_debe,  sf_haber:  acc.sf_haber  + f.valores.sf_haber,
    }), { si_debe:0, si_haber:0, mov_debe:0, mov_haber:0, sf_debe:0, sf_haber:0 })

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Balance de Comprobación</h1>
                    {generado && <p className="text-slate-500 text-sm mt-0.5">{subtitulo}</p>}
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
                                    <tr key={f.codigo} className={cn('border-b border-slate-100', f.esSubtotal ? 'bg-slate-50 font-semibold' : 'hover:bg-slate-50')}>
                                        <td className="py-2 px-4 font-mono text-xs text-slate-600">{f.codigo}</td>
                                        <td className="py-2 px-4 text-slate-700" style={{ paddingLeft: `${(f.nivel - 1) * 14 + 16}px` }}>{f.nombre}</td>
                                        <td className="py-2 px-4 text-right font-mono text-slate-600 border-l border-slate-100">{f.valores.si_debe > 0 ? formatMoneda(f.valores.si_debe,sym) : '—'}</td>
                                        <td className="py-2 px-4 text-right font-mono text-slate-600">{f.valores.si_haber > 0 ? formatMoneda(f.valores.si_haber,sym) : '—'}</td>
                                        <td className="py-2 px-4 text-right font-mono text-slate-700 border-l border-slate-100">{f.valores.mov_debe > 0 ? formatMoneda(f.valores.mov_debe,sym) : '—'}</td>
                                        <td className="py-2 px-4 text-right font-mono text-slate-700">{f.valores.mov_haber > 0 ? formatMoneda(f.valores.mov_haber,sym) : '—'}</td>
                                        <td className={cn('py-2 px-4 text-right font-mono font-semibold border-l border-slate-100', f.valores.sf_debe > 0 ? 'text-slate-900' : 'text-slate-300')}>{f.valores.sf_debe > 0 ? formatMoneda(f.valores.sf_debe,sym) : '—'}</td>
                                        <td className={cn('py-2 px-4 text-right font-mono font-semibold', f.valores.sf_haber > 0 ? 'text-slate-900' : 'text-slate-300')}>{f.valores.sf_haber > 0 ? formatMoneda(f.valores.sf_haber,sym) : '—'}</td>
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
