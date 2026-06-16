import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Lock, Unlock, FileText, RefreshCw, Save, AlertCircle, Play } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { anticipoService } from '../../services/nominas/anticipoService'
import { periodoNominaService } from '../../services/nominas/periodoNominaService'
import type { PeriodoNomina, AnticipoNomina, AnticipoLinea } from '../../types/nominas'
import { cn } from '../../lib/utils'

const round2 = (n: number) => Math.round(n * 100) / 100
const fmt = (n: number) =>
    (n ?? 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function LineaRow({ linea, bloqueado, onChange }: {
    linea:      AnticipoLinea
    bloqueado:  boolean
    onChange:   (id: string, campo: keyof AnticipoLinea, valor: any) => void
}) {
    const emp    = linea.empleado
    const nombre = emp ? `${emp.apellidos}, ${emp.nombres}` : linea.empleado_id

    return (
        <tr className="hover:bg-slate-50 border-b border-slate-100">
            <td className="px-4 py-2 font-medium text-slate-800 text-sm">{nombre}</td>
            <td className="px-2 py-2 text-center">
                {bloqueado ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                        {linea.tipo_calculo === 'porcentaje' ? '%' : '$'}
                    </span>
                ) : (
                    <div className="flex gap-0.5 justify-center">
                        <button
                            onClick={() => onChange(linea.id, 'tipo_calculo', 'porcentaje')}
                            className={cn('px-2 py-0.5 rounded-lg text-xs font-medium transition-colors',
                                linea.tipo_calculo === 'porcentaje'
                                    ? 'bg-primary-100 text-primary-700'
                                    : 'text-slate-400 hover:bg-slate-100'
                            )}>%</button>
                        <button
                            onClick={() => onChange(linea.id, 'tipo_calculo', 'fijo')}
                            className={cn('px-2 py-0.5 rounded-lg text-xs font-medium transition-colors',
                                linea.tipo_calculo === 'fijo'
                                    ? 'bg-primary-100 text-primary-700'
                                    : 'text-slate-400 hover:bg-slate-100'
                            )}>$</button>
                    </div>
                )}
            </td>
            <td className="px-2 py-2 text-right">
                {!bloqueado && linea.tipo_calculo === 'porcentaje' ? (
                    <input
                        type="number" min={0} max={100} step={0.5}
                        value={linea.porcentaje}
                        onChange={e => onChange(linea.id, 'porcentaje', parseFloat(e.target.value) || 0)}
                        className="w-16 text-right border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary-400"
                    />
                ) : (
                    <span className="text-slate-400 text-xs">
                        {linea.tipo_calculo === 'porcentaje' ? `${linea.porcentaje}%` : '—'}
                    </span>
                )}
            </td>
            <td className="px-2 py-2 text-right">
                {!bloqueado && linea.tipo_calculo === 'fijo' ? (
                    <input
                        type="number" min={0} step={0.01}
                        value={linea.monto_anticipo}
                        onChange={e => onChange(linea.id, 'monto_anticipo', parseFloat(e.target.value) || 0)}
                        className="w-24 text-right border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary-400"
                    />
                ) : (
                    <span className="font-mono text-slate-700">{fmt(linea.monto_anticipo)}</span>
                )}
            </td>
            <td className="px-2 py-2">
                {!bloqueado ? (
                    <input type="text" placeholder="Nombre descuento"
                        value={linea.desc1_nombre ?? ''}
                        onChange={e => onChange(linea.id, 'desc1_nombre', e.target.value || null)}
                        className="w-32 border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary-400"
                    />
                ) : (
                    <span className="text-slate-500 text-xs">{linea.desc1_nombre ?? '—'}</span>
                )}
            </td>
            <td className="px-2 py-2 text-right">
                {!bloqueado ? (
                    <input type="number" min={0} step={0.01}
                        value={linea.desc1_monto ?? 0}
                        onChange={e => onChange(linea.id, 'desc1_monto', parseFloat(e.target.value) || 0)}
                        className="w-20 text-right border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary-400"
                    />
                ) : (
                    <span className="font-mono text-slate-500 text-xs">{fmt(linea.desc1_monto ?? 0)}</span>
                )}
            </td>
            <td className="px-2 py-2">
                {!bloqueado ? (
                    <input type="text" placeholder="Nombre descuento"
                        value={linea.desc2_nombre ?? ''}
                        onChange={e => onChange(linea.id, 'desc2_nombre', e.target.value || null)}
                        className="w-32 border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary-400"
                    />
                ) : (
                    <span className="text-slate-500 text-xs">{linea.desc2_nombre ?? '—'}</span>
                )}
            </td>
            <td className="px-2 py-2 text-right">
                {!bloqueado ? (
                    <input type="number" min={0} step={0.01}
                        value={linea.desc2_monto ?? 0}
                        onChange={e => onChange(linea.id, 'desc2_monto', parseFloat(e.target.value) || 0)}
                        className="w-20 text-right border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary-400"
                    />
                ) : (
                    <span className="font-mono text-slate-500 text-xs">{fmt(linea.desc2_monto ?? 0)}</span>
                )}
            </td>
            <td className="px-4 py-2 text-right">
                <span className={cn('font-bold font-mono text-sm',
                    (linea.neto ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-600')}>
                    {fmt(linea.neto ?? 0)}
                </span>
            </td>
        </tr>
    )
}

export function AnticipoNominaPage() {
    const { periodoId } = useParams<{ periodoId: string }>()
    const { empresa }   = useAuth() as any
    const navigate      = useNavigate()

    const [periodo,   setPeriodo]   = useState<PeriodoNomina | null>(null)
    const [anticipo,  setAnticipo]  = useState<AnticipoNomina | null>(null)
    const [lineas,    setLineas]    = useState<AnticipoLinea[]>([])
    const [loading,   setLoading]   = useState(true)
    const [saving,    setSaving]    = useState(false)
    const [liquidando,setLiquidando]= useState(false)
    const [creando,   setCreando]   = useState(false)
    const [dirty,     setDirty]     = useState(false)
    const [error,     setError]     = useState<string | null>(null)
    const [success,   setSuccess]   = useState<string | null>(null)
    const [confirmRegen, setConfirmRegen] = useState(false)
    const [pctDefault, setPctDefault]    = useState(40)

    const bloqueado = anticipo?.estado === 'liquidado'

    useEffect(() => {
        if (empresa?.id && periodoId) cargar()
    }, [empresa?.id, periodoId])

    async function cargar() {
        setLoading(true)
        setError(null)
        try {
            const [per, ant] = await Promise.all([
                periodoNominaService.obtener(periodoId!),
                anticipoService.obtenerPorPeriodo(empresa.id, periodoId!),
            ])
            setPeriodo(per)
            setAnticipo(ant)
            if (ant) {
                setLineas(await anticipoService.obtenerLineas(ant.id))
            } else {
                setLineas([])
            }
            setDirty(false)
        } catch (e: any) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }

    async function handleCrear() {
        if (!periodoId) return
        setCreando(true)
        setError(null)
        try {
            const nombre = `Anticipo Quincena — ${periodo?.nombre ?? periodoId}`
            const ant    = await anticipoService.crear(empresa.id, periodoId, nombre)
            const lins   = await anticipoService.generarLineas(ant.id, empresa.id, pctDefault)
            setAnticipo(ant)
            setLineas(lins)
        } catch (e: any) {
            setError(e.message)
        } finally {
            setCreando(false)
        }
    }

    async function handleRegenerarLineas() {
        if (!anticipo) return
        setCreando(true)
        setError(null)
        try {
            const lins = await anticipoService.generarLineas(anticipo.id, empresa.id, pctDefault)
            setLineas(lins)
            setDirty(false)
            setConfirmRegen(false)
            flash('Líneas regeneradas.')
        } catch (e: any) {
            setError(e.message)
        } finally {
            setCreando(false)
        }
    }

    function updateLinea(id: string, campo: keyof AnticipoLinea, valor: any) {
        setLineas(prev => prev.map(l => {
            if (l.id !== id) return l
            const u = { ...l, [campo]: valor }
            if (campo === 'porcentaje' && u.tipo_calculo === 'porcentaje') {
                u.monto_anticipo = round2((l.empleado?.sueldo_base ?? 0) * (valor as number) / 100)
            }
            if (campo === 'tipo_calculo' && valor === 'porcentaje') {
                u.monto_anticipo = round2((l.empleado?.sueldo_base ?? 0) * u.porcentaje / 100)
            }
            u.neto = round2((u.monto_anticipo ?? 0) - (u.desc1_monto ?? 0) - (u.desc2_monto ?? 0))
            return u
        }))
        setDirty(true)
    }

    async function handleGuardar() {
        setSaving(true)
        setError(null)
        try {
            await anticipoService.guardarLineas(lineas)
            setDirty(false)
            flash('Cambios guardados.')
        } catch (e: any) {
            setError(e.message)
        } finally {
            setSaving(false)
        }
    }

    async function handleLiquidar() {
        if (!anticipo) return
        if (dirty) { setError('Guarda los cambios antes de liquidar.'); return }
        setLiquidando(true)
        setError(null)
        try {
            await anticipoService.liquidarDefinitivo(anticipo.id)
            await cargar()
            flash('Anticipo liquidado definitivamente.')
        } catch (e: any) {
            setError(e.message)
        } finally {
            setLiquidando(false)
        }
    }

    async function handleDeshacer() {
        if (!anticipo) return
        setLiquidando(true)
        setError(null)
        try {
            await anticipoService.deshacerLiquidacion(anticipo.id)
            await cargar()
            flash('Liquidación deshecha. El anticipo volvió a borrador.')
        } catch (e: any) {
            setError(e.message)
        } finally {
            setLiquidando(false)
        }
    }

    function flash(msg: string) {
        setSuccess(msg)
        setTimeout(() => setSuccess(null), 3500)
    }

    if (loading) return (
        <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
    )

    const totalAnticipo = lineas.reduce((s, l) => s + (l.monto_anticipo ?? 0), 0)
    const totalNeto     = lineas.reduce((s, l) => s + (l.neto ?? 0), 0)

    return (
        <div className="space-y-5">
            {/* Cabecera */}
            <div className="flex flex-wrap items-start gap-4">
                <button onClick={() => navigate(`/nominas/rol/${periodoId}`)}
                    className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm font-medium mt-1 transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                    Volver al Rol
                </button>
                <div className="flex-1">
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold text-slate-900">Anticipo de Quincena</h1>
                        {anticipo && (
                            <span className={cn(
                                'px-2.5 py-0.5 rounded-full text-xs font-semibold',
                                bloqueado ? 'bg-green-100 text-green-700' : 'bg-amber-50 text-amber-700'
                            )}>
                                {bloqueado ? 'Liquidado' : 'Borrador'}
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">{periodo?.nombre}</p>
                </div>
                {anticipo && (
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={() => navigate(`/nominas/anticipo-reporte/${anticipo.id}`)}
                            className="flex items-center gap-2 border border-indigo-300 text-indigo-700 hover:bg-indigo-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                        >
                            <FileText className="w-4 h-4" />
                            Reporte
                        </button>
                        {!bloqueado && dirty && (
                            <button onClick={handleGuardar} disabled={saving}
                                className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-60">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Guardar
                            </button>
                        )}
                        {!bloqueado && !dirty && (
                            <button onClick={handleLiquidar} disabled={liquidando}
                                className="flex items-center gap-2 border border-emerald-400 text-emerald-700 hover:bg-emerald-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-60">
                                {liquidando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                                Liquidación Definitiva
                            </button>
                        )}
                        {bloqueado && (
                            <button onClick={handleDeshacer} disabled={liquidando}
                                className="flex items-center gap-2 border border-orange-300 text-orange-700 hover:bg-orange-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-60">
                                {liquidando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                                Deshacer Liquidación
                            </button>
                        )}
                    </div>
                )}
            </div>

            {error && (
                <div className="bg-red-50 text-red-700 border border-red-200 rounded-xl px-4 py-3 text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</span>
                    <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 font-bold ml-4">✕</button>
                </div>
            )}
            {success && (
                <div className="bg-green-50 text-green-700 border border-green-200 rounded-xl px-4 py-3 text-sm font-medium">
                    {success}
                </div>
            )}

            {/* Crear anticipo */}
            {!anticipo && (
                <div className="bg-white rounded-2xl border border-slate-200 p-10 flex flex-col items-center gap-5">
                    <p className="text-slate-500 text-sm">No hay anticipo creado para este período.</p>
                    <div className="flex items-center gap-3">
                        <label className="text-sm font-medium text-slate-700">% por defecto:</label>
                        <input
                            type="number" min={0} max={100} step={1}
                            value={pctDefault}
                            onChange={e => setPctDefault(Number(e.target.value))}
                            className="w-20 border border-slate-300 rounded-xl px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary-400"
                        />
                        <button onClick={handleCrear} disabled={creando}
                            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-60">
                            {creando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                            Generar Anticipo
                        </button>
                    </div>
                </div>
            )}

            {/* Barra de regeneración + tabla */}
            {anticipo && (
                <div className="space-y-3">
                    {!bloqueado && (
                        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 flex-wrap">
                            <span className="text-sm text-slate-600">Regenerar con %:</span>
                            <input
                                type="number" min={0} max={100} step={1}
                                value={pctDefault}
                                onChange={e => setPctDefault(Number(e.target.value))}
                                className="w-20 border border-slate-300 rounded-xl px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary-400"
                            />
                            {confirmRegen ? (
                                <span className="text-sm text-red-700 font-medium flex items-center gap-2">
                                    ¿Confirmar? Se borrarán los ajustes actuales.
                                    <button onClick={handleRegenerarLineas} disabled={creando}
                                        className="text-red-600 underline">Sí, regenerar</button>
                                    <button onClick={() => setConfirmRegen(false)} className="text-slate-500 underline">Cancelar</button>
                                </span>
                            ) : (
                                <button
                                    onClick={() => lineas.length > 0 ? setConfirmRegen(true) : handleRegenerarLineas()}
                                    disabled={creando}
                                    className="flex items-center gap-1.5 border border-slate-300 text-slate-700 hover:bg-slate-100 px-3 py-1.5 rounded-xl text-sm transition-colors disabled:opacity-60">
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    Regenerar
                                </button>
                            )}
                            <span className="text-xs text-slate-400 ml-auto">
                                Regenerar recalcula desde el sueldo base actual de cada empleado.
                            </span>
                        </div>
                    )}

                    <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
                        <table className="w-full text-sm min-w-[900px]">
                            <thead className="bg-slate-50 border-b border-slate-200">
                                <tr>
                                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Empleado</th>
                                    <th className="text-center px-2 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Tipo</th>
                                    <th className="text-right px-2 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">%</th>
                                    <th className="text-right px-2 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Anticipo</th>
                                    <th className="text-left px-2 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Descuento 1</th>
                                    <th className="text-right px-2 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide w-20">Monto</th>
                                    <th className="text-left px-2 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Descuento 2</th>
                                    <th className="text-right px-2 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide w-20">Monto</th>
                                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-600 uppercase tracking-wide">Neto</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lineas.map(linea => (
                                    <LineaRow
                                        key={linea.id}
                                        linea={linea}
                                        bloqueado={bloqueado}
                                        onChange={updateLinea}
                                    />
                                ))}
                                {lineas.length === 0 && (
                                    <tr>
                                        <td colSpan={9} className="px-4 py-8 text-center text-slate-400 text-sm">
                                            No hay líneas. Usa "Regenerar" para cargar empleados.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                            {lineas.length > 0 && (
                                <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                                    <tr>
                                        <td colSpan={3} className="px-4 py-2.5 text-xs font-semibold text-slate-500">
                                            {lineas.length} empleado{lineas.length !== 1 ? 's' : ''}
                                        </td>
                                        <td className="text-right px-2 py-2.5 font-bold text-slate-800">{fmt(totalAnticipo)}</td>
                                        <td colSpan={4} />
                                        <td className="text-right px-4 py-2.5 font-bold text-emerald-700">{fmt(totalNeto)}</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            )}
        </div>
    )
}
