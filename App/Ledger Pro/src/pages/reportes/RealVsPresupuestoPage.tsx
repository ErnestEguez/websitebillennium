import { useEffect, useState } from 'react'
import { Download, Loader2, RefreshCw } from 'lucide-react'
import { PrintButton } from '../../components/PrintButton'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { cn, formatMoneda, mesNombre } from '../../lib/utils'
import type { LpPeriodo, LpPresupuesto } from '../../types/conta'

interface FilaRVP {
    cuenta_id: string
    codigo: string
    nombre: string
    tipo: string
    presupuesto: number
    real: number
}

export function RealVsPresupuestoPage() {
    const { empresaActiva } = useAuth()
    const [periodos, setPeriodos]         = useState<LpPeriodo[]>([])
    const [presupuestos, setPresupuestos] = useState<LpPresupuesto[]>([])
    const [periodoId, setPeriodoId]       = useState('')
    const [presupuestoId, setPresupuestoId] = useState('')
    const [filas, setFilas]               = useState<FilaRVP[]>([])
    const [loading, setLoading]           = useState(false)
    const [generado, setGenerado]         = useState(false)

    useEffect(() => { if (empresaActiva) cargarFiltros() }, [empresaActiva])

    async function cargarFiltros() {
        if (!empresaActiva) return
        const [{ data: peri }, { data: presu }] = await Promise.all([
            supabase.from('lp_periodos')
                .select('*').eq('empresa_id', empresaActiva.id).order('año').order('mes'),
            supabase.from('lp_presupuestos')
                .select('*').eq('empresa_id', empresaActiva.id).order('año').order('nombre'),
        ])
        setPeriodos(peri ?? [])
        setPresupuestos(presu ?? [])
        if (peri?.length) setPeriodoId(peri[peri.length - 1].id)
        if (presu?.length) setPresupuestoId(presu[presu.length - 1].id)
    }

    async function generar() {
        if (!empresaActiva || !periodoId || !presupuestoId) return
        setLoading(true)
        setGenerado(false)

        // Real: saldos del período
        const { data: saldos } = await supabase
            .from('lp_saldos_cuenta')
            .select(`
                cuenta_id,
                saldo_inicial_debe, saldo_inicial_haber,
                movimientos_debe, movimientos_haber,
                cuenta:lp_cuentas(codigo, nombre, tipo, naturaleza, acepta_movimientos)
            `)
            .eq('empresa_id', empresaActiva.id)
            .eq('periodo_id', periodoId)

        // Presupuesto del período
        const { data: detalle } = await supabase
            .from('lp_presupuesto_detalle')
            .select('cuenta_id, valor_presupuestado')
            .eq('presupuesto_id', presupuestoId)
            .eq('periodo_id', periodoId)

        const mapPresu: Record<string, number> = {}
        for (const d of (detalle ?? []) as any[]) {
            mapPresu[d.cuenta_id] = Number(d.valor_presupuestado)
        }

        // Unir: cuentas con ingreso/gasto que tienen presupuesto O real
        const cuentasConDatos = new Set<string>([
            ...(saldos ?? []).filter((s: any) => ['ingreso', 'gasto'].includes(s.cuenta?.tipo)).map((s: any) => s.cuenta_id),
            ...Object.keys(mapPresu),
        ])

        const mapSaldos: Record<string, any> = {}
        for (const s of (saldos ?? []) as any[]) {
            mapSaldos[s.cuenta_id] = s
        }

        // Para cuentas que están en presupuesto pero no en saldos, necesitamos la info de la cuenta
        const cuentasSinSaldo = [...cuentasConDatos].filter(id => !mapSaldos[id])
        let extraCuentas: any[] = []
        if (cuentasSinSaldo.length > 0) {
            const { data: ec } = await supabase.from('lp_cuentas')
                .select('id, codigo, nombre, tipo, naturaleza')
                .in('id', cuentasSinSaldo)
            extraCuentas = ec ?? []
        }

        const resultado: FilaRVP[] = []
        for (const cuentaId of cuentasConDatos) {
            const s = mapSaldos[cuentaId]
            const cuenta = s?.cuenta ?? extraCuentas.find(c => c.id === cuentaId)
            if (!cuenta || !['ingreso', 'gasto'].includes(cuenta.tipo)) continue
            if (!cuenta.acepta_movimientos && !s) continue

            let real = 0
            if (s) {
                const totalDebe  = s.saldo_inicial_debe  + s.movimientos_debe
                const totalHaber = s.saldo_inicial_haber + s.movimientos_haber
                const saldoDebe  = Math.max(0, totalDebe  - totalHaber)
                const saldoHaber = Math.max(0, totalHaber - totalDebe)
                real = cuenta.naturaleza === 'deudora' ? saldoDebe : saldoHaber
            }

            resultado.push({
                cuenta_id:   cuentaId,
                codigo:      cuenta.codigo,
                nombre:      cuenta.nombre,
                tipo:        cuenta.tipo,
                presupuesto: mapPresu[cuentaId] ?? 0,
                real,
            })
        }

        resultado.sort((a, b) => a.codigo.localeCompare(b.codigo))
        setFilas(resultado)
        setGenerado(true)
        setLoading(false)
    }

    function exportarCSV() {
        const header = 'Tipo,Código,Nombre,Presupuesto,Real,Variación,% Cumplimiento'
        const rows = filas.map(f => {
            const variacion = f.real - f.presupuesto
            const pct = f.presupuesto !== 0 ? ((f.real / f.presupuesto) * 100).toFixed(1) : '—'
            return `${f.tipo},"${f.codigo}","${f.nombre}",${f.presupuesto},${f.real},${variacion},${pct}`
        })
        const csv = ['sep=,', header, ...rows].join('\n')
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = 'real_vs_presupuesto.csv'; a.click()
        URL.revokeObjectURL(url)
    }

    const sym      = empresaActiva?.moneda?.simbolo ?? '$'
    const periodo  = periodos.find(p => p.id === periodoId)
    const ingresos = filas.filter(f => f.tipo === 'ingreso')
    const gastos   = filas.filter(f => f.tipo === 'gasto')

    const totales = (lista: FilaRVP[]) => ({
        presupuesto: lista.reduce((s, f) => s + f.presupuesto, 0),
        real:        lista.reduce((s, f) => s + f.real, 0),
    })

    function FilaTabla({ f }: { f: FilaRVP }) {
        const variacion = f.real - f.presupuesto
        const pct = f.presupuesto !== 0 ? (f.real / f.presupuesto) * 100 : null
        const cumple = pct !== null && pct >= 80
        return (
            <tr className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2.5 px-4 font-mono text-xs text-slate-500 w-24">{f.codigo}</td>
                <td className="py-2.5 px-3 text-slate-700">{f.nombre}</td>
                <td className="py-2.5 px-4 text-right font-mono text-slate-600 w-32">{formatMoneda(f.presupuesto, sym)}</td>
                <td className="py-2.5 px-4 text-right font-mono text-slate-800 w-32">{formatMoneda(f.real, sym)}</td>
                <td className={cn('py-2.5 px-4 text-right font-mono w-32', variacion >= 0 ? 'text-green-700' : 'text-red-700')}>
                    {variacion >= 0 ? '+' : ''}{formatMoneda(variacion, sym)}
                </td>
                <td className="py-2.5 px-4 w-32">
                    {pct !== null ? (
                        <div className="flex items-center gap-2">
                            <div className="flex-1 bg-slate-200 rounded-full h-1.5">
                                <div className={cn('h-1.5 rounded-full', cumple ? 'bg-green-500' : 'bg-red-400')}
                                    style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                            <span className={cn('text-xs font-medium w-10 text-right', cumple ? 'text-green-700' : 'text-red-700')}>
                                {pct.toFixed(0)}%
                            </span>
                        </div>
                    ) : (
                        <span className="text-xs text-slate-400">—</span>
                    )}
                </td>
            </tr>
        )
    }

    function SeccionRVP({ titulo, lista, headerColor }: { titulo: string; lista: FilaRVP[]; headerColor: string }) {
        const tot = totales(lista)
        const pct = tot.presupuesto !== 0 ? (tot.real / tot.presupuesto) * 100 : null
        return (
            <div className="card overflow-hidden">
                <div className={cn('px-5 py-3 text-white font-bold text-sm uppercase tracking-wide', headerColor)}>
                    {titulo}
                </div>
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-slate-50 border-b text-xs text-slate-600 uppercase tracking-wide">
                            <th className="py-2 px-4 text-left w-24">Código</th>
                            <th className="py-2 px-3 text-left">Cuenta</th>
                            <th className="py-2 px-4 text-right w-32">Presupuesto</th>
                            <th className="py-2 px-4 text-right w-32">Real</th>
                            <th className="py-2 px-4 text-right w-32">Variación</th>
                            <th className="py-2 px-4 w-32">Cumplimiento</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lista.map(f => <FilaTabla key={f.cuenta_id} f={f} />)}
                        {lista.length === 0 && (
                            <tr><td colSpan={6} className="py-6 text-center text-slate-400 text-xs">Sin datos</td></tr>
                        )}
                    </tbody>
                    <tfoot>
                        <tr className="bg-slate-100 border-t-2 border-slate-300 font-bold text-sm">
                            <td colSpan={2} className="py-3 px-4 text-right text-xs uppercase tracking-wide text-slate-600">Total {titulo}</td>
                            <td className="py-3 px-4 text-right font-mono text-slate-600">{formatMoneda(tot.presupuesto, sym)}</td>
                            <td className="py-3 px-4 text-right font-mono text-slate-900">{formatMoneda(tot.real, sym)}</td>
                            <td className={cn('py-3 px-4 text-right font-mono', tot.real - tot.presupuesto >= 0 ? 'text-green-700' : 'text-red-700')}>
                                {tot.real - tot.presupuesto >= 0 ? '+' : ''}{formatMoneda(tot.real - tot.presupuesto, sym)}
                            </td>
                            <td className="py-3 px-4 text-sm font-medium text-right">
                                {pct !== null ? `${pct.toFixed(1)}%` : '—'}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        )
    }

    return (
        <div className="space-y-5 max-w-6xl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Real vs Presupuesto</h1>
                    {generado && periodo && (
                        <p className="text-slate-500 text-sm mt-0.5">
                            {periodo.mes ? `${mesNombre(periodo.mes)} ${periodo.año}` : `Año ${periodo.año}`}
                        </p>
                    )}
                </div>
                {generado && (
                    <div className="flex gap-2 no-print">
                        <PrintButton
                            titulo="Real vs Presupuesto"
                            empresa={empresaActiva?.razon_social}
                            subtitulo={periodo ? (periodo.mes ? `${mesNombre(periodo.mes)} ${periodo.año}` : `Año ${periodo.año}`) : undefined}
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
                <div>
                    <label className="label">Presupuesto</label>
                    <select className="input w-52" value={presupuestoId} onChange={e => setPresupuestoId(e.target.value)}>
                        <option value="">Seleccionar presupuesto...</option>
                        {presupuestos.map(p => (
                            <option key={p.id} value={p.id}>{p.nombre} — {p.año}</option>
                        ))}
                    </select>
                </div>
                <button
                    onClick={generar}
                    disabled={!periodoId || !presupuestoId || loading}
                    className="btn btn-primary gap-2"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Generar
                </button>
                {presupuestos.length === 0 && (
                    <p className="text-sm text-amber-600">No hay presupuestos. Crea uno en la sección Presupuesto.</p>
                )}
            </div>

            {generado && (
                <>
                    <SeccionRVP titulo="Ingresos" lista={ingresos} headerColor="bg-green-700" />
                    <SeccionRVP titulo="Gastos"   lista={gastos}   headerColor="bg-amber-700" />
                </>
            )}
        </div>
    )
}
