import { useEffect, useState } from 'react'
import { Download, Loader2, RefreshCw } from 'lucide-react'
import { PrintButton } from '../../../components/contabilidad/PrintButton'
import { supabase } from '../../../lib/supabaseContabilidad'
import { useAuth } from '../../../contexts/contabilidad/ContabilidadContext'
import { cn, formatMoneda, mesNombre } from '../../../lib/utils'
import type { LpPeriodo } from '../../../types/conta'

interface CuentaOpc {
    id: string
    codigo: string
    nombre: string
    naturaleza: string
}

interface Movimiento {
    fecha: string
    tipo: string
    numero: string
    descripcion: string
    debe: number
    haber: number
    saldo: number
}

type Modo = 'mes' | 'acumulado'

export function EstadoCuentaPage() {
    const { empresaActiva } = useAuth()
    const [periodos, setPeriodos]     = useState<LpPeriodo[]>([])
    const [cuentas, setCuentas]       = useState<CuentaOpc[]>([])
    const [periodoId, setPeriodoId]   = useState('')
    const [cuentaId, setCuentaId]     = useState('')
    const [modo, setModo]             = useState<Modo>('mes')
    const [busqueda, setBusqueda]     = useState('')
    const [movimientos, setMovimientos] = useState<Movimiento[]>([])
    const [saldoInicial, setSaldoInicial] = useState(0)
    const [, setNaturaleza] = useState<'deudora' | 'acreedora'>('deudora')
    const [loading, setLoading]       = useState(false)
    const [generado, setGenerado]     = useState(false)

    useEffect(() => { if (empresaActiva) { cargarPeriodos(); cargarCuentas() } }, [empresaActiva])

    async function cargarPeriodos() {
        if (!empresaActiva) return
        const { data } = await supabase.from('lp_periodos')
            .select('*').eq('empresa_id', empresaActiva.id).order('año').order('mes')
        setPeriodos(data ?? [])
        if (data?.length) setPeriodoId(data[data.length - 1].id)
    }

    async function cargarCuentas() {
        if (!empresaActiva) return
        const { data } = await supabase.from('lp_cuentas')
            .select('id, codigo, nombre, naturaleza')
            .eq('empresa_id', empresaActiva.id)
            .eq('acepta_movimientos', true)
            .order('codigo')
        setCuentas(data ?? [])
    }

    const cuentasFiltradas = cuentas.filter(c =>
        c.codigo.includes(busqueda) || c.nombre.toLowerCase().includes(busqueda.toLowerCase())
    )

    function periodosHasta(selId: string): string[] {
        const sel = periodos.find(p => p.id === selId)
        if (!sel) return [selId]
        return periodos
            .filter(p => p.año < sel.año ||
                (p.año === sel.año && ((sel.mes == null) || (p.mes ?? 0) <= (sel.mes ?? 12))))
            .map(p => p.id)
    }

    async function generar() {
        if (!empresaActiva || !periodoId || !cuentaId) return
        setLoading(true); setGenerado(false)

        const ids = modo === 'acumulado' ? periodosHasta(periodoId) : [periodoId]

        // Query 1: naturaleza de la cuenta (sin joins)
        const { data: cuentaData } = await supabase
            .from('lp_cuentas').select('naturaleza').eq('id', cuentaId).maybeSingle()
        const nat: 'deudora' | 'acreedora' = (cuentaData as any)?.naturaleza ?? 'deudora'
        setNaturaleza(nat)

        // Query 2: saldo inicial (solo modo mes, sin joins)
        let si = 0
        if (modo === 'mes') {
            const { data: saldoData } = await supabase
                .from('lp_saldos_cuenta')
                .select('saldo_inicial_debe, saldo_inicial_haber')
                .eq('empresa_id', empresaActiva.id)
                .eq('periodo_id', periodoId)
                .eq('cuenta_id', cuentaId)
                .maybeSingle()
            const siDebe  = saldoData?.saldo_inicial_debe  ?? 0
            const siHaber = saldoData?.saldo_inicial_haber ?? 0
            si = nat === 'deudora' ? siDebe - siHaber : siHaber - siDebe
        }
        setSaldoInicial(si)

        // Query 3: comprobantes (sin joins)
        const { data: comps } = await supabase
            .from('lp_comprobantes')
            .select('id, fecha, glosa, numero, tipo_comprobante_id')
            .eq('empresa_id', empresaActiva.id)
            .in('periodo_id', ids)
            .neq('estado', 'anulado')
            .order('fecha')

        const compsList = (comps ?? []) as any[]
        const compMap: Record<string, any> = {}
        const compOrder: string[] = []
        for (const c of compsList) { compMap[c.id] = c; compOrder.push(c.id) }

        // Query 4: tipos de comprobante (sin joins)
        const tipoIds = [...new Set(compsList.map((c: any) => c.tipo_comprobante_id).filter(Boolean))]
        const tipoMap: Record<string, string> = {}
        if (tipoIds.length) {
            const { data: tipos } = await supabase
                .from('lp_tipos_comprobante').select('id, codigo').in('id', tipoIds)
            for (const t of (tipos ?? []) as any[]) tipoMap[t.id] = t.codigo
        }

        // Query 5: líneas de esa cuenta en esos comprobantes (sin joins)
        const mvts: Movimiento[] = []
        let saldoCorriente = si

        if (compOrder.length > 0) {
            const { data: lineasData } = await supabase
                .from('lp_comprobante_lineas')
                .select('debe, haber, descripcion, comprobante_id')
                .eq('empresa_id', empresaActiva.id)
                .eq('cuenta_id', cuentaId)
                .in('comprobante_id', compOrder)

            const lineasPorComp: Record<string, any[]> = {}
            for (const l of (lineasData ?? []) as any[]) {
                if (!lineasPorComp[l.comprobante_id]) lineasPorComp[l.comprobante_id] = []
                lineasPorComp[l.comprobante_id].push(l)
            }

            for (const compId of compOrder) {
                const comp = compMap[compId]
                for (const linea of (lineasPorComp[compId] ?? [])) {
                    const debe  = linea.debe  ?? 0
                    const haber = linea.haber ?? 0
                    saldoCorriente += nat === 'deudora' ? (debe - haber) : (haber - debe)
                    mvts.push({
                        fecha: comp.fecha,
                        tipo: tipoMap[comp.tipo_comprobante_id] ?? '—',
                        numero: comp.numero ?? '',
                        descripcion: linea.descripcion || comp.glosa || '',
                        debe, haber, saldo: saldoCorriente,
                    })
                }
            }
        }

        setMovimientos(mvts)
        setGenerado(true)
        setLoading(false)
    }

    function exportarCSV() {
        const cuenta = cuentas.find(c => c.id === cuentaId)
        const header = `Cuenta: ${cuenta?.codigo} - ${cuenta?.nombre}`
        const cols   = 'Fecha,Tipo,N°,Descripción,Debe,Haber,Saldo'
        const filaInicial = `,,,"Saldo Inicial",,, ${saldoInicial}`
        const rows = movimientos.map(m =>
            `${m.fecha},${m.tipo},${m.numero},"${m.descripcion}",${m.debe},${m.haber},${m.saldo}`
        )
        const csv = [header, cols, filaInicial, ...rows].join('\n')
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
        const url  = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `estado_cuenta_${cuenta?.codigo ?? ''}.csv`; a.click()
        URL.revokeObjectURL(url)
    }

    const sym     = empresaActiva?.moneda?.simbolo ?? '$'
    const periodo = periodos.find(p => p.id === periodoId)
    const cuenta  = cuentas.find(c => c.id === cuentaId)
    const saldoFinal = movimientos.length > 0
        ? movimientos[movimientos.length - 1].saldo
        : saldoInicial

    return (
        <div className="space-y-5 max-w-5xl">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Estado de Cuenta</h1>
                    {generado && cuenta && periodo && (
                        <p className="text-slate-500 text-sm mt-0.5">
                            {cuenta.codigo} — {cuenta.nombre} &nbsp;·&nbsp;
                            {modo === 'acumulado'
                                ? `Acumulado al ${periodo.mes ? `${mesNombre(periodo.mes)} ${periodo.año}` : `Año ${periodo.año}`}`
                                : (periodo.mes ? `${mesNombre(periodo.mes)} ${periodo.año}` : `Año ${periodo.año}`)
                            }
                        </p>
                    )}
                </div>
                {generado && (
                    <div className="flex gap-2 no-print">
                        <PrintButton
                            titulo="Estado de Cuenta"
                            empresa={empresaActiva?.razon_social}
                            subtitulo={cuenta && periodo
                                ? `${cuenta.codigo} — ${cuenta.nombre} · ${modo === 'acumulado' ? `Acumulado al ` : ''}${periodo.mes ? `${mesNombre(periodo.mes)} ${periodo.año}` : `Año ${periodo.año}`}`
                                : undefined}
                        />
                        <button onClick={exportarCSV} className="btn btn-secondary gap-2 text-sm">
                            <Download className="w-4 h-4" /> Exportar CSV
                        </button>
                    </div>
                )}
            </div>

            {/* Filtros */}
            <div className="card px-5 py-4 flex items-end gap-4 flex-wrap no-print">
                {/* Búsqueda de cuenta */}
                <div className="flex-1 min-w-60">
                    <label className="label">Cuenta</label>
                    <input
                        className="input w-full mb-1"
                        placeholder="Buscar por código o nombre..."
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                    />
                    <select
                        className="input w-full"
                        value={cuentaId}
                        onChange={e => setCuentaId(e.target.value)}
                        size={cuentasFiltradas.length > 6 ? 6 : Math.max(cuentasFiltradas.length, 1)}
                    >
                        {cuentasFiltradas.length === 0 && (
                            <option value="" disabled>Sin resultados</option>
                        )}
                        {cuentasFiltradas.map(c => (
                            <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>
                        ))}
                    </select>
                </div>

                {/* Período */}
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
                        {(['mes', 'acumulado'] as Modo[]).map(m => (
                            <button key={m} type="button" onClick={() => setModo(m)}
                                className={cn('px-4 py-2', m !== 'mes' && 'border-l border-slate-200',
                                    modo === m ? 'bg-primary-600 text-white font-medium' : 'bg-white text-slate-600 hover:bg-slate-50')}>
                                {m === 'mes' ? 'Mes' : 'Acumulado'}
                            </button>
                        ))}
                    </div>
                </div>

                <button
                    onClick={generar}
                    disabled={!periodoId || !cuentaId || loading}
                    className="btn btn-primary gap-2"
                >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Generar
                </button>
            </div>

            {/* Tabla de movimientos */}
            {generado && (
                <div className="card overflow-hidden">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-700 text-white text-xs uppercase tracking-wide">
                                <th className="py-3 px-4 text-left w-28">Fecha</th>
                                <th className="py-3 px-3 text-left w-16">Tipo</th>
                                <th className="py-3 px-3 text-left w-24">N°</th>
                                <th className="py-3 px-3 text-left">Descripción</th>
                                <th className="py-3 px-4 text-right w-32">Debe</th>
                                <th className="py-3 px-4 text-right w-32">Haber</th>
                                <th className="py-3 px-4 text-right w-36">Saldo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Fila de saldo inicial */}
                            <tr className="bg-blue-50 border-b border-blue-100">
                                <td className="py-2.5 px-4 text-xs text-slate-400">—</td>
                                <td colSpan={3} className="py-2.5 px-3 text-xs font-semibold text-blue-700 uppercase tracking-wide">
                                    Saldo Inicial del Período
                                </td>
                                <td className="py-2.5 px-4 text-right"></td>
                                <td className="py-2.5 px-4 text-right"></td>
                                <td className="py-2.5 px-4 text-right font-mono font-semibold text-blue-800">
                                    {formatMoneda(saldoInicial, sym)}
                                </td>
                            </tr>

                            {movimientos.map((m, i) => (
                                <tr key={i} className={cn(
                                    'border-b border-slate-100 hover:bg-slate-50',
                                    i % 2 === 0 ? '' : 'bg-slate-50/40'
                                )}>
                                    <td className="py-2.5 px-4 font-mono text-xs text-slate-500">{m.fecha}</td>
                                    <td className="py-2.5 px-3 text-xs text-slate-500 uppercase">{m.tipo}</td>
                                    <td className="py-2.5 px-3 font-mono text-xs text-slate-600">{m.numero}</td>
                                    <td className="py-2.5 px-3 text-slate-700 max-w-xs truncate">{m.descripcion}</td>
                                    <td className="py-2.5 px-4 text-right font-mono text-slate-800">
                                        {m.debe > 0 ? formatMoneda(m.debe, sym) : ''}
                                    </td>
                                    <td className="py-2.5 px-4 text-right font-mono text-slate-800">
                                        {m.haber > 0 ? formatMoneda(m.haber, sym) : ''}
                                    </td>
                                    <td className={cn(
                                        'py-2.5 px-4 text-right font-mono font-semibold',
                                        m.saldo >= 0 ? 'text-slate-900' : 'text-red-600'
                                    )}>
                                        {m.saldo >= 0
                                            ? formatMoneda(m.saldo, sym)
                                            : `(${formatMoneda(Math.abs(m.saldo), sym)})`
                                        }
                                    </td>
                                </tr>
                            ))}

                            {movimientos.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                                        Sin movimientos confirmados en este período para esta cuenta.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot>
                            <tr className="bg-slate-800 text-white font-bold">
                                <td colSpan={4} className="py-3 px-4 text-xs uppercase tracking-wide text-right">
                                    Saldo Final
                                </td>
                                <td className="py-3 px-4 text-right font-mono text-sm">
                                    {formatMoneda(movimientos.reduce((s, m) => s + m.debe, 0), sym)}
                                </td>
                                <td className="py-3 px-4 text-right font-mono text-sm">
                                    {formatMoneda(movimientos.reduce((s, m) => s + m.haber, 0), sym)}
                                </td>
                                <td className={cn(
                                    'py-3 px-4 text-right font-mono text-sm',
                                    saldoFinal < 0 ? 'text-red-300' : 'text-white'
                                )}>
                                    {saldoFinal >= 0
                                        ? formatMoneda(saldoFinal, sym)
                                        : `(${formatMoneda(Math.abs(saldoFinal), sym)})`
                                    }
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </div>
    )
}





