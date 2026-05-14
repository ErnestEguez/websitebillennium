import { useEffect, useState } from 'react'
import { Plus, Loader2, CheckCircle, Save } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { cn, formatMoneda, mesNombre } from '../../lib/utils'
import type { LpPresupuesto, LpPeriodo, LpCuenta } from '../../types/conta'

type GrillaValores = Record<string, Record<string, number>> // cuentaId → periodoId → valor

export function PresupuestoPage() {
    const { empresaActiva } = useAuth()
    const [año, setAño]                 = useState(new Date().getFullYear())
    const [presupuestos, setPresupuestos] = useState<LpPresupuesto[]>([])
    const [presupuestoId, setPresupuestoId] = useState('')
    const [nombre, setNombre]           = useState('Principal')
    const [periodos, setPeriodos]       = useState<LpPeriodo[]>([])
    const [cuentas, setCuentas]         = useState<LpCuenta[]>([])
    const [grilla, setGrilla]           = useState<GrillaValores>({})
    const [pendientes, setPendientes]   = useState<Set<string>>(new Set()) // claves cuentaId|periodoId con cambios sin guardar
    const [guardando, setGuardando]     = useState(false)
    const [loading, setLoading]         = useState(false)
    const [ok, setOk]                   = useState(false)
    const [creando, setCreando]         = useState(false)

    useEffect(() => {
        if (empresaActiva) { cargarDatos() }
    }, [empresaActiva, año])

    async function cargarDatos() {
        if (!empresaActiva) return
        setLoading(true)

        const [{ data: presuData }, { data: periData }, { data: cuentaData }] = await Promise.all([
            supabase.from('lp_presupuestos')
                .select('*').eq('empresa_id', empresaActiva.id).eq('año', año).order('nombre'),
            supabase.from('lp_periodos')
                .select('*').eq('empresa_id', empresaActiva.id).eq('año', año).order('mes'),
            supabase.from('lp_cuentas')
                .select('id, codigo, nombre, tipo, naturaleza')
                .eq('empresa_id', empresaActiva.id)
                .eq('acepta_movimientos', true)
                .in('tipo', ['ingreso', 'gasto'])
                .order('codigo'),
        ])

        setPresupuestos(presuData ?? [])
        setPeriodos(periData ?? [])
        setCuentas((cuentaData ?? []) as any)

        const primerPresu = presuData?.[0]
        if (primerPresu) {
            setPresupuestoId(primerPresu.id)
            await cargarDetalle(primerPresu.id)
        } else {
            setPresupuestoId('')
            setGrilla({})
        }
        setLoading(false)
    }

    async function cargarDetalle(pId: string) {
        const { data } = await supabase.from('lp_presupuesto_detalle')
            .select('cuenta_id, periodo_id, valor_presupuestado')
            .eq('presupuesto_id', pId)
        const g: GrillaValores = {}
        for (const row of (data ?? []) as any[]) {
            if (!g[row.cuenta_id]) g[row.cuenta_id] = {}
            g[row.cuenta_id][row.periodo_id] = Number(row.valor_presupuestado)
        }
        setGrilla(g)
        setPendientes(new Set())
    }

    async function crearPresupuesto() {
        if (!empresaActiva) return
        setCreando(true)
        const { data, error } = await supabase.from('lp_presupuestos').insert({
            empresa_id: empresaActiva.id,
            año,
            nombre: nombre.trim() || 'Principal',
            estado: 'borrador',
        }).select().single()
        if (!error && data) {
            setPresupuestos(p => [...p, data as LpPresupuesto])
            setPresupuestoId(data.id)
            setGrilla({})
        }
        setCreando(false)
    }

    function onCeldaChange(cuentaId: string, periodoId: string, valor: string) {
        const num = parseFloat(valor.replace(',', '.')) || 0
        setGrilla(g => ({
            ...g,
            [cuentaId]: { ...(g[cuentaId] ?? {}), [periodoId]: num },
        }))
        setPendientes(p => new Set(p).add(`${cuentaId}|${periodoId}`))
    }

    async function guardarTodo() {
        if (!presupuestoId || !empresaActiva) return
        setGuardando(true)

        const upserts = Array.from(pendientes).map(key => {
            const [cuentaId, periodoId] = key.split('|')
            return {
                presupuesto_id:       presupuestoId,
                empresa_id:           empresaActiva.id,
                cuenta_id:            cuentaId,
                periodo_id:           periodoId,
                valor_presupuestado:  grilla[cuentaId]?.[periodoId] ?? 0,
            }
        })

        if (upserts.length > 0) {
            await supabase.from('lp_presupuesto_detalle').upsert(upserts, {
                onConflict: 'presupuesto_id,cuenta_id,periodo_id',
            })
        }

        setPendientes(new Set())
        setGuardando(false)
        setOk(true)
        setTimeout(() => setOk(false), 2000)
    }

    const sym  = empresaActiva?.moneda?.simbolo ?? '$'
    void presupuestos.find(p => p.id === presupuestoId)
    const totalPorPeriodo = (periodoId: string) =>
        cuentas.reduce((s, c) => s + (grilla[c.id]?.[periodoId] ?? 0), 0)
    const totalGeneral = cuentas.reduce((s, c) =>
        s + periodos.reduce((sp, p) => sp + (grilla[c.id]?.[p.id] ?? 0), 0), 0)

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Presupuesto</h1>
                    <p className="text-slate-500 text-sm mt-0.5">Metas por cuenta y período</p>
                </div>
                {presupuestoId && pendientes.size > 0 && (
                    <button onClick={guardarTodo} disabled={guardando} className="btn btn-primary gap-2">
                        {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> :
                         ok        ? <CheckCircle className="w-4 h-4" /> :
                                     <Save className="w-4 h-4" />}
                        Guardar ({pendientes.size} cambios)
                    </button>
                )}
            </div>

            {/* Controles */}
            <div className="card px-5 py-4 flex items-end gap-4 flex-wrap">
                <div>
                    <label className="label">Año</label>
                    <input
                        type="number" className="input w-28"
                        value={año} min={2020} max={2035}
                        onChange={e => setAño(parseInt(e.target.value))}
                    />
                </div>
                {presupuestos.length > 0 && (
                    <div>
                        <label className="label">Presupuesto</label>
                        <select className="input w-48"
                            value={presupuestoId}
                            onChange={async e => {
                                setPresupuestoId(e.target.value)
                                await cargarDetalle(e.target.value)
                            }}
                        >
                            {presupuestos.map(p => (
                                <option key={p.id} value={p.id}>{p.nombre}</option>
                            ))}
                        </select>
                    </div>
                )}
                {presupuestos.length === 0 && (
                    <>
                        <div>
                            <label className="label">Nombre</label>
                            <input className="input w-44" value={nombre}
                                onChange={e => setNombre(e.target.value)} placeholder="Ej: Principal" />
                        </div>
                        <button onClick={crearPresupuesto} disabled={creando} className="btn btn-primary gap-2">
                            {creando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            Crear Presupuesto {año}
                        </button>
                    </>
                )}
                {presupuestos.length > 0 && (
                    <button onClick={crearPresupuesto} disabled={creando} className="btn btn-secondary gap-2 text-sm">
                        {creando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        Nuevo
                    </button>
                )}
            </div>

            {loading && (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
            )}

            {!loading && presupuestoId && periodos.length === 0 && (
                <div className="card p-8 text-center text-slate-400 text-sm">
                    No hay períodos abiertos para el año {año}. Créalos en Configuración.
                </div>
            )}

            {!loading && presupuestoId && cuentas.length === 0 && periodos.length > 0 && (
                <div className="card p-8 text-center text-slate-400 text-sm">
                    No hay cuentas de ingreso/gasto. Importa el plan de cuentas en Plan de Cuentas.
                </div>
            )}

            {/* Grilla presupuesto */}
            {!loading && presupuestoId && cuentas.length > 0 && periodos.length > 0 && (
                <div className="card overflow-auto">
                    <table className="text-xs w-full">
                        <thead>
                            <tr className="bg-slate-700 text-white">
                                <th className="py-3 px-4 text-left sticky left-0 bg-slate-700 z-10 w-16">Código</th>
                                <th className="py-3 px-3 text-left sticky left-16 bg-slate-700 z-10 min-w-48">Cuenta</th>
                                {periodos.map(p => (
                                    <th key={p.id} className="py-3 px-2 text-right min-w-28">
                                        {p.mes ? mesNombre(p.mes).slice(0, 3) : `${p.año}`}
                                    </th>
                                ))}
                                <th className="py-3 px-4 text-right min-w-32">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* Separador por tipo */}
                            {(['ingreso', 'gasto'] as const).map(tipo => {
                                const filas = cuentas.filter(c => c.tipo === tipo)
                                if (!filas.length) return null
                                return [
                                    <tr key={`sep-${tipo}`} className={cn(
                                        'border-t-2 text-xs font-bold uppercase tracking-wide',
                                        tipo === 'ingreso' ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-800'
                                    )}>
                                        <td colSpan={2 + periodos.length + 1} className="py-2 px-4">
                                            {tipo === 'ingreso' ? 'Ingresos' : 'Gastos'}
                                        </td>
                                    </tr>,
                                    ...filas.map(cuenta => {
                                        const totalCuenta = periodos.reduce(
                                            (s, p) => s + (grilla[cuenta.id]?.[p.id] ?? 0), 0)
                                        return (
                                            <tr key={cuenta.id} className="border-b border-slate-100 hover:bg-slate-50">
                                                <td className="py-1.5 px-4 font-mono text-slate-500 sticky left-0 bg-white">{cuenta.codigo}</td>
                                                <td className="py-1.5 px-3 text-slate-700 sticky left-16 bg-white max-w-48 truncate">{cuenta.nombre}</td>
                                                {periodos.map(p => (
                                                    <td key={p.id} className="py-1 px-1 text-right">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="0.01"
                                                            className={cn(
                                                                'w-full text-right text-xs px-2 py-1 rounded border',
                                                                pendientes.has(`${cuenta.id}|${p.id}`)
                                                                    ? 'border-primary-400 bg-primary-50 font-semibold'
                                                                    : 'border-transparent bg-transparent hover:border-slate-300 focus:border-primary-400 focus:bg-white'
                                                            )}
                                                            value={grilla[cuenta.id]?.[p.id] ?? 0}
                                                            onChange={e => onCeldaChange(cuenta.id, p.id, e.target.value)}
                                                        />
                                                    </td>
                                                ))}
                                                <td className="py-1.5 px-4 text-right font-mono font-semibold text-slate-800">
                                                    {formatMoneda(totalCuenta, sym)}
                                                </td>
                                            </tr>
                                        )
                                    }),
                                ]
                            })}
                        </tbody>
                        <tfoot>
                            <tr className="bg-slate-800 text-white font-bold">
                                <td colSpan={2} className="py-3 px-4 text-right text-xs uppercase tracking-wide sticky left-0 bg-slate-800">
                                    Total
                                </td>
                                {periodos.map(p => (
                                    <td key={p.id} className="py-3 px-2 text-right font-mono text-xs">
                                        {formatMoneda(totalPorPeriodo(p.id), sym)}
                                    </td>
                                ))}
                                <td className="py-3 px-4 text-right font-mono">
                                    {formatMoneda(totalGeneral, sym)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}
        </div>
    )
}
