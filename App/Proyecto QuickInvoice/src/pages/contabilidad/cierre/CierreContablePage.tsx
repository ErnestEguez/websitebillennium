import { useEffect, useState } from 'react'
import { HelpButton } from '../../../components/help/HelpButton'
import { Lock, Loader2, CheckCircle, AlertTriangle, ArrowRight, FileText, RefreshCw } from 'lucide-react'
import { supabase } from '../../../lib/supabaseContabilidad'
import { useAuth } from '../../../contexts/contabilidad/ContabilidadContext'
import { cn, formatMoneda, mesNombre } from '../../../lib/utils'
import type { LpPeriodo } from '../../../types/conta'

interface FilaCierre {
    cuenta_id: string
    codigo: string
    nombre: string
    tipo: string
    naturaleza: 'deudora' | 'acreedora'
    balance: number
}

type Fase = 'inicio' | 'preview' | 'cierre_ok' | 'completado'

export function CierreContablePage() {
    const { empresaActiva } = useAuth()
    const [periodos, setPeriodos]                 = useState<LpPeriodo[]>([])
    const [periodoId, setPeriodoId]               = useState('')
    const [cuentaResultadoId, setCuentaResultadoId] = useState('')
    const [cuentasPatrimonio, setCuentasPatrimonio] = useState<{ id: string; codigo: string; nombre: string }[]>([])
    const [preview, setPreview]                   = useState<FilaCierre[]>([])
    const [utilidad, setUtilidad]                 = useState(0)
    const [loading, setLoading]                   = useState(false)
    const [ejecutando, setEjecutando]             = useState(false)
    const [fase, setFase]                         = useState<Fase>('inicio')
    const [periodoNuevoId, setPeriodoNuevoId]     = useState('')
    const [periodosAbiertos, setPeriodosAbiertos] = useState<LpPeriodo[]>([])
    const [error, setError]                       = useState('')

    useEffect(() => { if (empresaActiva) cargarDatos() }, [empresaActiva])

    async function cargarDatos() {
        if (!empresaActiva) return
        const [{ data: peri }, { data: cuentas }] = await Promise.all([
            supabase.from('lp_periodos')
                .select('*').eq('empresa_id', empresaActiva.id).order('año').order('mes'),
            supabase.from('lp_cuentas')
                .select('id, codigo, nombre')
                .eq('empresa_id', empresaActiva.id)
                .eq('tipo', 'patrimonio')
                .eq('acepta_movimientos', true)
                .order('codigo'),
        ])
        const todos = peri ?? []
        setPeriodos(todos)
        setCuentasPatrimonio(cuentas ?? [])
        const abiertos = todos.filter(p => p.estado === 'abierto')
        if (abiertos.length > 0) setPeriodoId(abiertos[0].id)
        const autoResultado = (cuentas ?? []).find(c =>
            /resultado|utilidad|ganancia|p[eé]rdida/i.test(c.nombre)
        )
        if (autoResultado) setCuentaResultadoId(autoResultado.id)
    }

    async function previsualizarCierre() {
        if (!empresaActiva || !periodoId || !cuentaResultadoId) return
        setLoading(true); setError(''); setPreview([])

        const { data: comps } = await supabase
            .from('lp_comprobantes')
            .select('id')
            .eq('empresa_id', empresaActiva.id)
            .eq('periodo_id', periodoId)
            .eq('estado', 'confirmado')

        const compIds = (comps ?? []).map((c: any) => c.id)
        if (!compIds.length) {
            setError('No hay comprobantes confirmados en este período. Confirma los diarios antes de cerrar.')
            setLoading(false); return
        }

        const { data: lineas } = await supabase
            .from('lp_comprobante_lineas')
            .select('cuenta_id, debe, haber, cuenta:lp_cuentas(codigo, nombre, tipo, naturaleza, acepta_movimientos)')
            .eq('empresa_id', empresaActiva.id)
            .in('comprobante_id', compIds)

        const mapa = new Map<string, any>()
        for (const l of (lineas ?? []) as any[]) {
            if (!l.cuenta?.acepta_movimientos) continue
            const ex = mapa.get(l.cuenta_id)
            if (ex) {
                ex.debe  += l.debe  ?? 0
                ex.haber += l.haber ?? 0
            } else {
                mapa.set(l.cuenta_id, { cuenta_id: l.cuenta_id, cuenta: l.cuenta, debe: l.debe ?? 0, haber: l.haber ?? 0 })
            }
        }

        const ingresosGastos: FilaCierre[] = Array.from(mapa.values())
            .filter(f => ['ingreso', 'gasto'].includes(f.cuenta.tipo))
            .map(f => ({
                cuenta_id: f.cuenta_id,
                codigo: f.cuenta.codigo,
                nombre: f.cuenta.nombre,
                tipo: f.cuenta.tipo,
                naturaleza: f.cuenta.naturaleza,
                balance: f.cuenta.naturaleza === 'deudora'
                    ? Math.max(0, f.debe - f.haber)
                    : Math.max(0, f.haber - f.debe),
            }))
            .filter(f => f.balance > 0.001)
            .sort((a, b) => a.codigo.localeCompare(b.codigo))

        const totalIngresos = ingresosGastos.filter(f => f.tipo === 'ingreso').reduce((s, f) => s + f.balance, 0)
        const totalGastos   = ingresosGastos.filter(f => f.tipo === 'gasto').reduce((s, f) => s + f.balance, 0)

        setPreview(ingresosGastos)
        setUtilidad(totalIngresos - totalGastos)
        setFase('preview')
        setLoading(false)
    }

    async function ejecutarCierre() {
        if (!empresaActiva || !periodoId || !cuentaResultadoId) return
        setEjecutando(true); setError('')

        const periodo = periodos.find(p => p.id === periodoId)!
        const { data: tc } = await supabase
            .from('lp_tipos_comprobante')
            .select('id')
            .eq('naturaleza', 'diario')
            .limit(1)
            .maybeSingle()

        if (!tc) { setError('No se encontró tipo comprobante Diario.'); setEjecutando(false); return }

        // Construir líneas del asiento de cierre
        const lineasComp: any[] = []
        for (const f of preview.filter(r => r.tipo === 'ingreso')) {
            lineasComp.push({ empresa_id: empresaActiva.id, cuenta_id: f.cuenta_id, debe: f.balance, haber: 0, descripcion: 'Cierre ingreso', orden: lineasComp.length + 1 })
        }
        for (const f of preview.filter(r => r.tipo === 'gasto')) {
            lineasComp.push({ empresa_id: empresaActiva.id, cuenta_id: f.cuenta_id, debe: 0, haber: f.balance, descripcion: 'Cierre gasto', orden: lineasComp.length + 1 })
        }
        if (Math.abs(utilidad) > 0.001) {
            if (utilidad > 0) {
                lineasComp.push({ empresa_id: empresaActiva.id, cuenta_id: cuentaResultadoId, debe: 0, haber: utilidad, descripcion: 'Utilidad del período', orden: lineasComp.length + 1 })
            } else {
                lineasComp.push({ empresa_id: empresaActiva.id, cuenta_id: cuentaResultadoId, debe: Math.abs(utilidad), haber: 0, descripcion: 'Pérdida del período', orden: lineasComp.length + 1 })
            }
        }

        const totalDebe  = lineasComp.reduce((s, l) => s + l.debe, 0)
        const totalHaber = lineasComp.reduce((s, l) => s + l.haber, 0)
        const mesLabel   = periodo.mes ? String(periodo.mes).padStart(2, '0') : '00'

        const { data: comp, error: errComp } = await supabase.from('lp_comprobantes').insert({
            empresa_id: empresaActiva.id,
            periodo_id: periodoId,
            tipo_comprobante_id: tc.id,
            numero: `CC-${periodo.año}${mesLabel}`,
            secuencial: 0,
            fecha: new Date().toISOString().slice(0, 10),
            glosa: `Asiento de cierre — ${periodo.mes ? mesNombre(periodo.mes) + ' ' : ''}${periodo.año}`,
            estado: 'confirmado',
            total_debe: totalDebe,
            total_haber: totalHaber,
            origen: 'cierre',
        }).select('id').single()

        if (errComp || !comp) { setError(`Error al crear asiento de cierre: ${errComp?.message}`); setEjecutando(false); return }

        await supabase.from('lp_comprobante_lineas').insert(lineasComp.map(l => ({ ...l, comprobante_id: comp.id })))

        await supabase.from('lp_periodos').update({
            estado: 'cerrado',
            fecha_cierre: new Date().toISOString().slice(0, 10),
        }).eq('id', periodoId)

        const { data: nuevos } = await supabase.from('lp_periodos')
            .select('*').eq('empresa_id', empresaActiva.id).order('año').order('mes')
        const actualizados = nuevos ?? []
        setPeriodos(actualizados)
        setPeriodosAbiertos(actualizados.filter(p => p.estado === 'abierto'))

        setFase('cierre_ok')
        setEjecutando(false)
    }

    async function ejecutarApertura() {
        if (!empresaActiva || !periodoNuevoId) return
        setEjecutando(true); setError('')

        // Todos los comprobantes del período cerrado (incluye el asiento de cierre)
        const { data: comps } = await supabase
            .from('lp_comprobantes')
            .select('id')
            .eq('empresa_id', empresaActiva.id)
            .eq('periodo_id', periodoId)
            .neq('estado', 'anulado')

        const compIds = (comps ?? []).map((c: any) => c.id)
        const { data: lineas } = await supabase
            .from('lp_comprobante_lineas')
            .select('cuenta_id, debe, haber, cuenta:lp_cuentas(tipo, naturaleza, acepta_movimientos)')
            .eq('empresa_id', empresaActiva.id)
            .in('comprobante_id', compIds)

        // Saldos finales de cuentas de balance
        const mapa = new Map<string, any>()
        for (const l of (lineas ?? []) as any[]) {
            if (!l.cuenta?.acepta_movimientos || !['activo', 'pasivo', 'patrimonio'].includes(l.cuenta.tipo)) continue
            const ex = mapa.get(l.cuenta_id)
            if (ex) {
                ex.debe  += l.debe  ?? 0
                ex.haber += l.haber ?? 0
            } else {
                mapa.set(l.cuenta_id, { cuenta_id: l.cuenta_id, naturaleza: l.cuenta.naturaleza, debe: l.debe ?? 0, haber: l.haber ?? 0 })
            }
        }

        const lineasAp: any[] = []
        for (const f of Array.from(mapa.values())) {
            const balance = f.naturaleza === 'deudora' ? f.debe - f.haber : f.haber - f.debe
            if (Math.abs(balance) < 0.001) continue
            lineasAp.push(f.naturaleza === 'deudora'
                ? { empresa_id: empresaActiva.id, cuenta_id: f.cuenta_id, debe: balance, haber: 0, descripcion: 'Apertura', orden: lineasAp.length + 1 }
                : { empresa_id: empresaActiva.id, cuenta_id: f.cuenta_id, debe: 0, haber: balance, descripcion: 'Apertura', orden: lineasAp.length + 1 }
            )
        }

        const periodoAp = periodos.find(p => p.id === periodoNuevoId)!
        const { data: tc } = await supabase.from('lp_tipos_comprobante').select('id').eq('naturaleza', 'diario').limit(1).maybeSingle()
        if (!tc) { setError('No se encontró tipo comprobante Diario.'); setEjecutando(false); return }

        const totalDebe  = lineasAp.reduce((s: number, l: any) => s + l.debe, 0)
        const totalHaber = lineasAp.reduce((s: number, l: any) => s + l.haber, 0)
        const mesLabel   = periodoAp.mes ? String(periodoAp.mes).padStart(2, '0') : '00'

        const { data: compAp, error: errAp } = await supabase.from('lp_comprobantes').insert({
            empresa_id: empresaActiva.id,
            periodo_id: periodoNuevoId,
            tipo_comprobante_id: tc.id,
            numero: `CA-${periodoAp.año}${mesLabel}`,
            secuencial: 0,
            fecha: periodoAp.fecha_apertura,
            glosa: `Asiento de apertura — ${periodoAp.mes ? mesNombre(periodoAp.mes) + ' ' : ''}${periodoAp.año}`,
            estado: 'confirmado',
            total_debe: totalDebe,
            total_haber: totalHaber,
            origen: 'apertura',
        }).select('id').single()

        if (errAp || !compAp) { setError(`Error al crear asiento de apertura: ${errAp?.message}`); setEjecutando(false); return }

        await supabase.from('lp_comprobante_lineas').insert(lineasAp.map((l: any) => ({ ...l, comprobante_id: compAp.id })))

        setFase('completado')
        setEjecutando(false)
    }

    const sym = empresaActiva?.moneda?.simbolo ?? '$'
    const periodoSel = periodos.find(p => p.id === periodoId)
    const ingresosSel = preview.filter(f => f.tipo === 'ingreso')
    const gastosSel   = preview.filter(f => f.tipo === 'gasto')
    const totalDebeComp = ingresosSel.reduce((s, f) => s + f.balance, 0) + (utilidad < 0 ? Math.abs(utilidad) : 0)
    const totalHaberComp = gastosSel.reduce((s, f) => s + f.balance, 0) + (utilidad > 0 ? utilidad : 0)

    return (
        <div className="space-y-6 max-w-4xl">
            <div>
                <div className="flex items-start justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Cierre Contable</h1>
                        <p className="text-slate-500 text-sm mt-0.5">
                            Zerifica cuentas de resultado, cierra el período y genera el asiento de apertura del siguiente
                        </p>
                    </div>
                    <HelpButton pageKey="cierre-contable" />
                </div>
            </div>

            {fase === 'completado' ? (
                <div className="card p-12 text-center">
                    <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-green-700 mb-2">Proceso de cierre completado</h2>
                    <p className="text-slate-500 text-sm">El período fue cerrado y el asiento de apertura generado correctamente.</p>
                </div>
            ) : (
                <>
                    {/* Paso 1 — Selección */}
                    <div className="card p-5 space-y-4">
                        <h2 className="font-semibold text-slate-800 text-sm uppercase tracking-wide flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-primary-600 text-white text-xs flex items-center justify-center font-bold">1</span>
                            Seleccionar período a cerrar
                        </h2>
                        <div className="flex items-end gap-4 flex-wrap">
                            <div>
                                <label className="label">Período</label>
                                <select
                                    className="input w-56"
                                    value={periodoId}
                                    onChange={e => { setPeriodoId(e.target.value); setFase('inicio'); setPreview([]) }}
                                >
                                    <option value="">Seleccionar...</option>
                                    {periodos.filter(p => p.estado === 'abierto').map(p => (
                                        <option key={p.id} value={p.id}>
                                            {p.mes ? `${mesNombre(p.mes)} ${p.año}` : `Año ${p.año}`}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="label">Cuenta "Resultado del Ejercicio"</label>
                                <select
                                    className="input w-80"
                                    value={cuentaResultadoId}
                                    onChange={e => setCuentaResultadoId(e.target.value)}
                                >
                                    <option value="">Seleccionar cuenta de patrimonio...</option>
                                    {cuentasPatrimonio.map(c => (
                                        <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>
                                    ))}
                                </select>
                            </div>
                            <button
                                onClick={previsualizarCierre}
                                disabled={!periodoId || !cuentaResultadoId || loading || fase === 'cierre_ok'}
                                className="btn btn-primary gap-2"
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                Previsualizar
                            </button>
                        </div>
                        {error && (
                            <p className="text-red-600 text-sm flex items-center gap-1.5">
                                <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
                            </p>
                        )}
                    </div>

                    {/* Preview del asiento */}
                    {(fase === 'preview' || fase === 'cierre_ok') && preview.length > 0 && (
                        <div className="card overflow-hidden">
                            <div className="bg-slate-700 px-5 py-3 text-white font-bold text-sm uppercase tracking-wide flex items-center gap-2">
                                <FileText className="w-4 h-4" />
                                Asiento de Cierre
                                {periodoSel && (
                                    <span className="ml-2 font-normal text-slate-300 text-xs">
                                        {periodoSel.mes ? `${mesNombre(periodoSel.mes)} ${periodoSel.año}` : `Año ${periodoSel.año}`}
                                    </span>
                                )}
                            </div>
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                                        <th className="py-2 px-5 text-left">Cuenta</th>
                                        <th className="py-2 px-5 text-right w-36">Debe</th>
                                        <th className="py-2 px-5 text-right w-36">Haber</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ingresosSel.map(f => (
                                        <tr key={f.cuenta_id} className="border-b border-slate-100 hover:bg-slate-50">
                                            <td className="py-2.5 px-5 text-slate-700">
                                                <span className="font-mono text-xs text-slate-400 mr-2">{f.codigo}</span>
                                                {f.nombre}
                                                <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">ingreso</span>
                                            </td>
                                            <td className="py-2.5 px-5 text-right font-mono text-slate-800">{formatMoneda(f.balance, sym)}</td>
                                            <td className="py-2.5 px-5 text-right text-slate-300">—</td>
                                        </tr>
                                    ))}
                                    {gastosSel.map(f => (
                                        <tr key={f.cuenta_id} className="border-b border-slate-100 hover:bg-slate-50">
                                            <td className="py-2.5 px-5 text-slate-700">
                                                <span className="font-mono text-xs text-slate-400 mr-2">{f.codigo}</span>
                                                {f.nombre}
                                                <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">gasto</span>
                                            </td>
                                            <td className="py-2.5 px-5 text-right text-slate-300">—</td>
                                            <td className="py-2.5 px-5 text-right font-mono text-slate-800">{formatMoneda(f.balance, sym)}</td>
                                        </tr>
                                    ))}
                                    {Math.abs(utilidad) > 0.001 && (
                                        <tr className={cn('border-b', utilidad > 0 ? 'bg-green-50' : 'bg-red-50')}>
                                            <td className="py-2.5 px-5">
                                                <span className={cn('font-semibold text-sm', utilidad > 0 ? 'text-green-700' : 'text-red-700')}>
                                                    {utilidad > 0 ? '✓ Utilidad del Período' : '✗ Pérdida del Período'}
                                                </span>
                                                <span className="ml-2 text-xs text-slate-500">
                                                    → {cuentasPatrimonio.find(c => c.id === cuentaResultadoId)?.nombre}
                                                </span>
                                            </td>
                                            <td className={cn('py-2.5 px-5 text-right font-mono font-bold', utilidad < 0 ? 'text-red-700' : 'text-slate-300')}>
                                                {utilidad < 0 ? formatMoneda(Math.abs(utilidad), sym) : '—'}
                                            </td>
                                            <td className={cn('py-2.5 px-5 text-right font-mono font-bold', utilidad > 0 ? 'text-green-700' : 'text-slate-300')}>
                                                {utilidad > 0 ? formatMoneda(utilidad, sym) : '—'}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                                <tfoot>
                                    <tr className="bg-slate-800 text-white font-bold">
                                        <td className="py-3 px-5 text-right text-xs uppercase tracking-wide">Totales</td>
                                        <td className="py-3 px-5 text-right font-mono">{formatMoneda(totalDebeComp, sym)}</td>
                                        <td className="py-3 px-5 text-right font-mono">{formatMoneda(totalHaberComp, sym)}</td>
                                    </tr>
                                </tfoot>
                            </table>

                            {fase === 'preview' && (
                                <div className="px-5 py-4 bg-amber-50 border-t border-amber-200 flex items-center justify-between gap-4">
                                    <p className="text-sm text-amber-800">
                                        <strong>Esta acción es irreversible.</strong> Se confirmará el asiento y el período quedará <strong>cerrado</strong>.
                                    </p>
                                    <button
                                        onClick={ejecutarCierre}
                                        disabled={ejecutando}
                                        className="btn btn-primary gap-2 shrink-0"
                                    >
                                        {ejecutando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                                        Ejecutar Cierre
                                    </button>
                                </div>
                            )}

                            {fase === 'cierre_ok' && (
                                <div className="px-5 py-3 bg-green-50 border-t border-green-200 flex items-center gap-3">
                                    <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                                    <p className="text-sm text-green-800 font-medium">
                                        Asiento de cierre registrado. Período marcado como <strong>cerrado</strong>.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Paso 2 — Apertura */}
                    {fase === 'cierre_ok' && (
                        <div className="card p-5 space-y-4">
                            <h2 className="font-semibold text-slate-800 text-sm uppercase tracking-wide flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-primary-600 text-white text-xs flex items-center justify-center font-bold">2</span>
                                Asiento de Apertura del período siguiente
                            </h2>
                            <p className="text-sm text-slate-500">
                                Genera el asiento de apertura con los saldos finales del balance de situación financiera. Requiere que el período destino ya esté creado en Configuración.
                            </p>
                            <div className="flex items-end gap-4 flex-wrap">
                                <div>
                                    <label className="label">Período destino</label>
                                    <select
                                        className="input w-56"
                                        value={periodoNuevoId}
                                        onChange={e => setPeriodoNuevoId(e.target.value)}
                                    >
                                        <option value="">Seleccionar período abierto...</option>
                                        {periodosAbiertos.map(p => (
                                            <option key={p.id} value={p.id}>
                                                {p.mes ? `${mesNombre(p.mes)} ${p.año}` : `Año ${p.año}`}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <button
                                    onClick={ejecutarApertura}
                                    disabled={!periodoNuevoId || ejecutando}
                                    className="btn btn-primary gap-2"
                                >
                                    {ejecutando ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                                    Generar Apertura
                                </button>
                                <button
                                    onClick={() => setFase('completado')}
                                    className="btn btn-secondary text-sm"
                                >
                                    Omitir por ahora
                                </button>
                            </div>
                            {periodosAbiertos.length === 0 && (
                                <p className="text-sm text-amber-600 flex items-center gap-1.5">
                                    <AlertTriangle className="w-4 h-4 shrink-0" />
                                    No hay períodos abiertos. Crea el próximo período en Configuración primero.
                                </p>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    )
}




