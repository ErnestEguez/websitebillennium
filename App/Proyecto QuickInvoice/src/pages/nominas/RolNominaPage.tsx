import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2, Play, Lock, Unlock, Plus, X, AlertCircle, Clock, RefreshCw, Calendar, FileText, Banknote, ListChecks } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { periodoNominaService } from '../../services/nominas/periodoNominaService'
import { rolNominaService } from '../../services/nominas/rolNominaService'
import { parametrosNominaService } from '../../services/nominas/parametrosNominaService'
import { conceptosNominaService } from '../../services/nominas/conceptosNominaService'
import type { PeriodoNomina, RolCabecera, RolLinea, ConceptoNomina, ParametrosNomina } from '../../types/nominas'
import { cn } from '../../lib/utils'

const fmt = (n: number) =>
    n.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtFecha = (s: string) => {
    const [y, m, d] = s.split('-')
    return `${d}/${m}/${y}`
}

// Conceptos que se ingresan por tiempo (horas o días); el monto se calcula automáticamente
const TIEMPO_CONCEPTO: Record<string, { divisor: number; factor: number; unidad: 'h' | 'd' }> = {
    HRS_EXTRA_50:  { divisor: 240, factor: 1.5,  unidad: 'h' },
    HRS_EXTRA_100: { divisor: 240, factor: 2.0,  unidad: 'h' },
    HRS_NOCT_25:   { divisor: 240, factor: 0.25, unidad: 'h' },
    DIAS_FALTA:    { divisor: 30,  factor: 1.0,  unidad: 'd' },
}

export function RolNominaPage() {
    const { periodoId } = useParams<{ periodoId: string }>()
    const { empresa } = useAuth() as any
    const navigate = useNavigate()

    const [periodo, setPeriodo]         = useState<PeriodoNomina | null>(null)
    const [cabeceras, setCabeceras]     = useState<RolCabecera[]>([])
    const [params, setParams]           = useState<ParametrosNomina | null>(null)
    const [diasMap, setDiasMap]         = useState<Map<string, number>>(new Map())
    const [loading, setLoading]         = useState(true)
    const [generando, setGenerando]     = useState(false)
    const [cerrando, setCerrando]       = useState(false)
    const [sincronizando, setSincronizando] = useState(false)
    const [error, setError]             = useState<string | null>(null)

    // Modal de edición de líneas
    const [editCab, setEditCab]         = useState<RolCabecera | null>(null)
    const [editLineas, setEditLineas]   = useState<RolLinea[]>([])
    const [loadingLineas, setLoadingLineas] = useState(false)
    const [saving, setSaving]           = useState(false)

    // Catálogo para agregar conceptos
    const [catalogo, setCatalogo]       = useState<ConceptoNomina[]>([])
    const [showAdd, setShowAdd]         = useState(false)

    // Confirmación cierre / deshacer
    const [confirmCierre,   setConfirmCierre]   = useState(false)
    const [confirmDeshacer, setConfirmDeshacer] = useState(false)
    const [deshaciendo, setDeshaciendo]         = useState(false)

    const cargar = useCallback(async () => {
        if (!periodoId || !empresa?.id) return
        setLoading(true)
        setError(null)
        try {
            const [per, cabs, par] = await Promise.all([
                periodoNominaService.obtener(periodoId),
                rolNominaService.listarCabeceras(periodoId),
                parametrosNominaService.obtener(empresa.id),
            ])
            setPeriodo(per)
            setCabeceras(cabs)
            setParams(par)

            // Cargar horas de DIAS_FALTA para mostrar días trabajados en la tabla
            if (cabs.length > 0) {
                const cabIds = cabs.map(c => c.id)
                const { data: faltas } = await supabase.schema('nominas')
                    .from('rol_lineas')
                    .select('cabecera_id, horas')
                    .in('cabecera_id', cabIds)
                    .eq('codigo', 'DIAS_FALTA')
                const m = new Map<string, number>()
                for (const f of (faltas ?? [])) m.set(f.cabecera_id, f.horas ?? 0)
                setDiasMap(m)
            }
        } catch (e: any) {
            setError(e.message)
        } finally {
            setLoading(false)
        }
    }, [periodoId, empresa?.id])

    useEffect(() => { cargar() }, [cargar])

    async function handleGenerar() {
        if (!periodoId || !empresa?.id) return
        setGenerando(true)
        setError(null)
        try {
            await rolNominaService.generarRol(periodoId, empresa.id)
            await cargar()
        } catch (e: any) {
            setError(e.message)
        } finally {
            setGenerando(false)
        }
    }

    async function handleSincronizar() {
        if (!periodoId || !empresa?.id) return
        setSincronizando(true)
        setError(null)
        try {
            const result = await rolNominaService.sincronizarNovedades(periodoId, empresa.id)
            if (result.novedades === 0 && result.actualizados === 0) {
                setError('No hay novedades pendientes ni cambios en empleados.')
            } else {
                await cargar()
            }
        } catch (e: any) {
            setError(e.message)
        } finally {
            setSincronizando(false)
        }
    }

    async function handleLiquidar() {
        if (!periodoId) return
        setCerrando(true)
        try {
            await rolNominaService.liquidarPeriodo(periodoId)
            await cargar()
        } catch (e: any) {
            setError(e.message)
        } finally {
            setCerrando(false)
            setConfirmCierre(false)
        }
    }

    async function handleDeshacer() {
        if (!periodoId) return
        setDeshaciendo(true)
        try {
            await rolNominaService.deshacerLiquidacion(periodoId)
            await cargar()
        } catch (e: any) {
            setError(e.message)
        } finally {
            setDeshaciendo(false)
            setConfirmDeshacer(false)
        }
    }

    async function abrirModal(cab: RolCabecera) {
        setEditCab(cab)
        setLoadingLineas(true)
        setShowAdd(false)
        try {
            const [lineas, cat] = await Promise.all([
                rolNominaService.listarLineas(cab.id),
                conceptosNominaService.listarConceptos(empresa.id),
            ])
            setEditLineas(lineas)
            setCatalogo(cat)
        } catch (e: any) {
            setError(e.message)
            setEditCab(null)
        } finally {
            setLoadingLineas(false)
        }
    }

    function cerrarModal() {
        setEditCab(null)
        setEditLineas([])
        setShowAdd(false)
    }

    const iess_pct = params?.aporte_personal_iess_pct ?? 9.45

    function recalcularIess(lineas: RolLinea[]): RolLinea[] {
        const baseIess = lineas
            .filter(l => l.tipo === 'ingreso' && (l.concepto?.afecta_iess ?? false))
            .reduce((s, l) => s + l.monto, 0)
        return lineas.map(l =>
            l.codigo === 'IESS_PERS' && l.es_calculado
                ? { ...l, monto: Math.round(baseIess * iess_pct) / 100 }
                : l
        )
    }

    function handleMontoChange(lineaId: string, valor: string) {
        const monto = parseFloat(valor) || 0
        setEditLineas(prev => {
            const updated = prev.map(l => l.id === lineaId ? { ...l, monto } : l)
            return recalcularIess(updated)
        })
    }

    function handleTiempoChange(lineaId: string, valorStr: string) {
        const cantidad = parseFloat(valorStr) || 0
        setEditLineas(prev => {
            const updated = prev.map(l => {
                if (l.id !== lineaId) return l
                const tc = TIEMPO_CONCEPTO[l.codigo]
                if (!tc) return l
                const sueldo = editCab?.sueldo_base ?? 0
                const monto  = Math.round((sueldo / tc.divisor) * tc.factor * cantidad * 100) / 100
                return { ...l, horas: cantidad, monto }
            })
            return recalcularIess(updated)
        })
    }

    async function handleAgregarConcepto(concepto: ConceptoNomina) {
        if (!editCab || !empresa?.id) return
        setShowAdd(false)
        try {
            const nueva = await rolNominaService.agregarLinea(editCab.id, empresa.id, concepto)
            setEditLineas(prev => [...prev, nueva].sort((a, b) => a.orden - b.orden))
        } catch (e: any) {
            setError(e.message)
        }
    }

    async function handleGuardar() {
        if (!editCab || !periodoId) return
        setSaving(true)
        try {
            await rolNominaService.actualizarLineas(editCab, editLineas, periodoId)
            cerrarModal()
            await cargar()
        } catch (e: any) {
            setError(e.message)
        } finally {
            setSaving(false)
        }
    }

    // Días trabajados desde la tabla principal (usa diasMap cargado en cargar())
    function getDiasTrabajados(cab: RolCabecera): number {
        const base = periodo?.tipo_nomina === 'mensual' ? 30 : 15
        return Math.max(0, base - (diasMap.get(cab.id) ?? 0))
    }

    // Días trabajados en el modal (usa editLineas en tiempo real)
    const diasFaltaModal = editLineas.find(l => l.codigo === 'DIAS_FALTA')?.horas ?? 0
    const baseModal      = periodo?.tipo_nomina === 'mensual' ? 30 : 15
    const diasTrabajadosModal = Math.max(0, baseModal - diasFaltaModal)

    // Conceptos del catálogo no presentes aún en el rol del empleado
    const codigosEnRol = new Set(editLineas.map(l => l.codigo))
    const conceptosDisponibles = catalogo.filter(c => !c.aplica_siempre && !codigosEnRol.has(c.codigo))

    // Totales del modal
    const modalIngresos   = editLineas.filter(l => l.tipo === 'ingreso').reduce((s, l) => s + l.monto, 0)
    const modalDescuentos = editLineas.filter(l => l.tipo === 'descuento').reduce((s, l) => s + l.monto, 0)
    const modalNeto       = modalIngresos - modalDescuentos

    if (loading) return (
        <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
    )

    if (!periodo) return (
        <div className="text-center py-20 text-slate-400">Período no encontrado.</div>
    )

    return (
        <div className="space-y-6">
            {/* Cabecera */}
            <div className="flex flex-wrap items-start gap-4">
                <button onClick={() => navigate('/nominas/periodos')}
                    className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm font-medium transition-colors mt-1">
                    <ArrowLeft className="w-4 h-4" />
                    Períodos
                </button>
                <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                        <h1 className="text-2xl font-bold text-slate-900">{periodo.nombre}</h1>
                        <span className={cn(
                            'px-2.5 py-0.5 rounded-full text-xs font-semibold',
                            periodo.estado === 'liquidado'
                                ? 'bg-green-100 text-green-700'
                                : periodo.estado === 'cerrado'
                                    ? 'bg-slate-100 text-slate-500'
                                    : 'bg-amber-50 text-amber-700'
                        )}>
                            {periodo.estado === 'liquidado' ? 'Liquidado' : periodo.estado === 'cerrado' ? 'Cerrado' : 'Borrador'}
                        </span>
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">
                        {fmtFecha(periodo.fecha_inicio)} – {fmtFecha(periodo.fecha_fin)} ·{' '}
                        {periodo.tipo_nomina === 'mensual' ? 'Mensual' : 'Quincenal'}
                    </p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button
                        onClick={() => navigate(`/nominas/anticipo/${periodoId}`)}
                        className="flex items-center gap-2 border border-violet-300 text-violet-700 hover:bg-violet-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                    >
                        <Banknote className="w-4 h-4" />
                        Anticipo
                    </button>
                    {cabeceras.length > 0 && (
                        <button
                            onClick={() => navigate(`/nominas/reportes/${periodoId}`)}
                            className="flex items-center gap-2 border border-indigo-300 text-indigo-700 hover:bg-indigo-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                        >
                            <FileText className="w-4 h-4" />
                            Reportes
                        </button>
                    )}
                    {periodo.estado === 'borrador' && cabeceras.length > 0 && (
                        <>
                            <button
                                onClick={handleSincronizar}
                                disabled={sincronizando}
                                className="flex items-center gap-2 border border-cyan-300 text-cyan-700 hover:bg-cyan-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-60"
                                title="Agrega al rol las novedades creadas después de generar el rol"
                            >
                                {sincronizando
                                    ? <Loader2 className="w-4 h-4 animate-spin" />
                                    : <RefreshCw className="w-4 h-4" />}
                                Aplicar Novedades
                            </button>
                            <button
                                onClick={() => setConfirmCierre(true)}
                                className="flex items-center gap-2 border border-emerald-400 text-emerald-700 hover:bg-emerald-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                            >
                                <Lock className="w-4 h-4" />
                                Liquidación Definitiva
                            </button>
                        </>
                    )}
                    {periodo.estado === 'liquidado' && (
                        <>
                            <button
                                onClick={() => navigate('/nominas/novedades')}
                                className="flex items-center gap-2 border border-slate-300 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                                title="Ver estado de préstamos y novedades"
                            >
                                <ListChecks className="w-4 h-4" />
                                Ver Novedades
                            </button>
                            <button
                                onClick={() => setConfirmDeshacer(true)}
                                className="flex items-center gap-2 border border-orange-300 text-orange-700 hover:bg-orange-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                            >
                                <Unlock className="w-4 h-4" />
                                Deshacer Liquidación
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Resumen de totales */}
            {cabeceras.length > 0 && (
                <div className="grid grid-cols-3 gap-4">
                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
                        <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wide">Total Ingresos</p>
                        <p className="text-2xl font-bold text-emerald-700 mt-1">${fmt(periodo.total_ingresos)}</p>
                    </div>
                    <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
                        <p className="text-xs text-red-500 font-semibold uppercase tracking-wide">Total Descuentos</p>
                        <p className="text-2xl font-bold text-red-600 mt-1">${fmt(periodo.total_descuentos)}</p>
                    </div>
                    <div className="bg-primary-50 border border-primary-100 rounded-2xl p-4">
                        <p className="text-xs text-primary-600 font-semibold uppercase tracking-wide">Neto a Pagar</p>
                        <p className="text-2xl font-bold text-primary-700 mt-1">${fmt(periodo.total_neto)}</p>
                    </div>
                </div>
            )}

            {error && (
                <div className="bg-red-50 text-red-700 border border-red-200 rounded-xl px-4 py-3 text-sm flex items-center justify-between">
                    <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>
                    <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 font-bold ml-4">✕</button>
                </div>
            )}

            {/* Estado: sin rol generado */}
            {cabeceras.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl flex flex-col items-center py-20 gap-4">
                    <div className="w-16 h-16 bg-primary-50 rounded-full flex items-center justify-center">
                        <Play className="w-8 h-8 text-primary-600" />
                    </div>
                    <div className="text-center">
                        <p className="font-semibold text-slate-800">El rol aún no ha sido generado</p>
                        <p className="text-sm text-slate-500 mt-1">Haz clic en "Generar Rol" para calcular automáticamente la nómina de todos los empleados activos</p>
                    </div>
                    <button
                        onClick={handleGenerar}
                        disabled={generando}
                        className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-xl font-semibold transition-colors disabled:opacity-60"
                    >
                        {generando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                        {generando ? 'Generando...' : 'Generar Rol'}
                    </button>
                </div>
            ) : (
                /* Tabla de empleados */
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Empleado</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Cargo</th>
                                <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Días</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Sueldo Base</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Ingresos</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Descuentos</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Neto</th>
                                <th className="px-4 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {cabeceras.map(cab => (
                                <tr key={cab.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-5 py-3.5 text-sm font-medium text-slate-800">
                                        {cab.empleado?.apellidos}, {cab.empleado?.nombres}
                                    </td>
                                    <td className="px-4 py-3.5 text-sm text-slate-500">
                                        {cab.empleado?.cargo?.nombre ?? '—'}
                                    </td>
                                    <td className="px-3 py-3.5 text-center text-sm font-semibold text-slate-700">
                                        {getDiasTrabajados(cab)}
                                    </td>
                                    <td className="px-4 py-3.5 text-right text-sm text-slate-700">
                                        ${fmt(cab.sueldo_base)}
                                    </td>
                                    <td className="px-4 py-3.5 text-right text-sm text-emerald-700 font-medium">
                                        ${fmt(cab.total_ingresos)}
                                    </td>
                                    <td className="px-4 py-3.5 text-right text-sm text-red-600 font-medium">
                                        ${fmt(cab.total_descuentos)}
                                    </td>
                                    <td className="px-4 py-3.5 text-right text-sm font-bold text-slate-900">
                                        ${fmt(cab.neto)}
                                    </td>
                                    <td className="px-4 py-3.5">
                                        {periodo.estado === 'borrador' && (
                                            <button
                                                onClick={() => abrirModal(cab)}
                                                className="text-xs px-3 py-1.5 bg-primary-50 text-primary-700 hover:bg-primary-100 rounded-lg font-medium transition-colors"
                                            >
                                                Detalle
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ── Modal Rol Individual ── */}
            {editCab && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                        {/* Header modal */}
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                            <div>
                                <h2 className="text-lg font-bold text-slate-900">
                                    {editCab.empleado?.apellidos}, {editCab.empleado?.nombres}
                                </h2>
                                <p className="text-sm text-slate-500">{editCab.empleado?.cargo?.nombre ?? ''}</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-center">
                                    <p className="text-xs text-slate-400 uppercase tracking-wide">Días Trabajados</p>
                                    <p className={cn(
                                        'text-2xl font-bold',
                                        diasTrabajadosModal < baseModal ? 'text-amber-600' : 'text-emerald-600'
                                    )}>
                                        {diasTrabajadosModal}
                                        <span className="text-sm font-normal text-slate-400"> / {baseModal}</span>
                                    </p>
                                </div>
                                <button onClick={cerrarModal} className="text-slate-400 hover:text-slate-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Body modal */}
                        <div className="flex-1 overflow-y-auto p-6">
                            {loadingLineas ? (
                                <div className="flex justify-center py-10">
                                    <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {/* Ingresos */}
                                    <div>
                                        <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-2">Ingresos</p>
                                        <div className="border border-slate-100 rounded-xl overflow-hidden">
                                            {editLineas.filter(l => l.tipo === 'ingreso').length === 0
                                                ? <p className="text-sm text-slate-400 py-3 px-4">Sin ingresos</p>
                                                : editLineas.filter(l => l.tipo === 'ingreso').map(linea => (
                                                    <LineaRow
                                                        key={linea.id}
                                                        linea={linea}
                                                        onChange={handleMontoChange}
                                                        onTiempoChange={handleTiempoChange}
                                                    />
                                                ))}
                                        </div>
                                    </div>

                                    {/* Descuentos */}
                                    <div>
                                        <p className="text-xs font-bold text-red-600 uppercase tracking-wider mb-2">Descuentos</p>
                                        <div className="border border-slate-100 rounded-xl overflow-hidden">
                                            {editLineas.filter(l => l.tipo === 'descuento').length === 0
                                                ? <p className="text-sm text-slate-400 py-3 px-4">Sin descuentos</p>
                                                : editLineas.filter(l => l.tipo === 'descuento').map(linea => (
                                                    <LineaRow
                                                        key={linea.id}
                                                        linea={linea}
                                                        onChange={handleMontoChange}
                                                        onTiempoChange={handleTiempoChange}
                                                    />
                                                ))}
                                        </div>
                                    </div>

                                    {/* Agregar concepto */}
                                    <div className="relative">
                                        <button
                                            onClick={() => setShowAdd(v => !v)}
                                            className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-800 font-medium"
                                        >
                                            <Plus className="w-4 h-4" />
                                            Agregar concepto
                                        </button>
                                        {showAdd && conceptosDisponibles.length > 0 && (
                                            <div className="absolute top-8 left-0 bg-white border border-slate-200 rounded-xl shadow-xl z-10 w-72 max-h-56 overflow-y-auto">
                                                {conceptosDisponibles.map(c => (
                                                    <button
                                                        key={c.id}
                                                        onClick={() => handleAgregarConcepto(c)}
                                                        className="w-full text-left px-4 py-2.5 hover:bg-primary-50 transition-colors flex items-center justify-between gap-2"
                                                    >
                                                        <div>
                                                            <p className="text-sm font-medium text-slate-800">{c.nombre}</p>
                                                            <p className="text-xs text-slate-400">{c.codigo}</p>
                                                        </div>
                                                        <span className={cn('text-xs px-1.5 py-0.5 rounded-full',
                                                            c.tipo === 'ingreso' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')}>
                                                            {c.tipo}
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {showAdd && conceptosDisponibles.length === 0 && (
                                            <div className="absolute top-8 left-0 bg-white border border-slate-200 rounded-xl shadow-xl z-10 w-64 p-4 text-sm text-slate-400 text-center">
                                                No hay conceptos adicionales disponibles
                                            </div>
                                        )}
                                    </div>

                                    {/* Totales */}
                                    <div className="bg-slate-50 rounded-xl p-4 space-y-1.5">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-600">Total Ingresos</span>
                                            <span className="text-emerald-700 font-semibold">${fmt(modalIngresos)}</span>
                                        </div>
                                        <div className="flex justify-between text-sm">
                                            <span className="text-slate-600">Total Descuentos</span>
                                            <span className="text-red-600 font-semibold">${fmt(modalDescuentos)}</span>
                                        </div>
                                        <div className="flex justify-between text-base font-bold border-t border-slate-200 pt-1.5 mt-1.5">
                                            <span className="text-slate-800">Neto a Recibir</span>
                                            <span className="text-primary-700">${fmt(modalNeto)}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Footer modal */}
                        <div className="px-6 py-4 border-t border-slate-100 flex gap-3 shrink-0">
                            <button onClick={cerrarModal}
                                className="flex-1 border border-slate-300 text-slate-700 rounded-xl py-2.5 text-sm font-medium hover:bg-slate-50 transition-colors">
                                Cancelar
                            </button>
                            <button
                                onClick={handleGuardar}
                                disabled={saving || loadingLineas}
                                className="flex-1 bg-primary-600 hover:bg-primary-700 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                            >
                                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                Guardar cambios
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmación deshacer liquidación */}
            {confirmDeshacer && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center space-y-4">
                        <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
                            <Unlock className="w-6 h-6 text-orange-600" />
                        </div>
                        <p className="font-semibold text-slate-800">¿Deshacer la Liquidación?</p>
                        <p className="text-sm text-slate-500">
                            El período volverá a estado <strong>Borrador</strong> para que puedas revisarlo.{' '}
                            <span className="text-orange-700 font-medium">
                                Atención: los saldos de préstamos ya descontados NO se revierten.
                            </span>{' '}
                            Si vuelves a liquidar, los préstamos se descontarán nuevamente.
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmDeshacer(false)}
                                className="flex-1 border border-slate-300 rounded-xl py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                                Cancelar
                            </button>
                            <button
                                onClick={handleDeshacer}
                                disabled={deshaciendo}
                                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-xl py-2 text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                            >
                                {deshaciendo && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Sí, deshacer
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmación cierre */}
            {confirmCierre && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center space-y-4">
                        <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                            <Lock className="w-6 h-6 text-emerald-600" />
                        </div>
                        <p className="font-semibold text-slate-800">¿Liquidación Definitiva del Período?</p>
                        <p className="text-sm text-slate-500">
                            Se actualizarán los saldos de préstamos, se borrarán los montos de descuentos variables
                            y el rol quedará bloqueado. Esta acción no se puede deshacer.
                        </p>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmCierre(false)}
                                className="flex-1 border border-slate-300 rounded-xl py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                                Cancelar
                            </button>
                            <button
                                onClick={handleLiquidar}
                                disabled={cerrando}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl py-2 text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                            >
                                {cerrando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Sí, liquidar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// Fila de una línea editable
function LineaRow({
    linea,
    onChange,
    onTiempoChange,
}: {
    linea: RolLinea
    onChange: (id: string, v: string) => void
    onTiempoChange: (id: string, v: string) => void
}) {
    const tc = TIEMPO_CONCEPTO[linea.codigo] ?? null

    return (
        <div className="flex items-center px-4 py-2.5 border-b border-slate-50 last:border-0 gap-3">
            <div className="flex-1 min-w-0">
                <span className="text-xs font-mono text-slate-400 mr-2">{linea.codigo}</span>
                <span className="text-sm text-slate-700">{linea.nombre}</span>
                {linea.novedad_id && (
                    <span className="ml-2 text-[10px] bg-cyan-50 text-cyan-600 px-1.5 py-0.5 rounded-full font-semibold">novedad</span>
                )}
            </div>

            {tc ? (
                // Concepto por tiempo (horas o días) → monto calculado automáticamente
                <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1">
                        {tc.unidad === 'h'
                            ? <Clock className="w-3.5 h-3.5 text-slate-400" />
                            : <Calendar className="w-3.5 h-3.5 text-slate-400" />}
                        <input
                            type="number"
                            min="0"
                            step={tc.unidad === 'h' ? '0.5' : '1'}
                            value={linea.horas == null || linea.horas === 0 ? '' : linea.horas}
                            placeholder="0"
                            onChange={e => onTiempoChange(linea.id, e.target.value)}
                            className="w-16 text-right border border-slate-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                        />
                        <span className="text-xs text-slate-400">{tc.unidad}</span>
                    </div>
                    <span className="text-xs text-slate-400">=</span>
                    <span className="text-sm font-semibold text-slate-700 min-w-[72px] text-right">
                        ${linea.monto.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                </div>
            ) : linea.es_calculado ? (
                // Calculado automáticamente
                <div className="flex items-center gap-1 shrink-0">
                    <span className="text-sm font-semibold text-slate-700 min-w-[80px] text-right">
                        ${linea.monto.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-xs text-slate-300 ml-1" title="Calculado automáticamente">🔒</span>
                </div>
            ) : (
                // Monto editable manualmente
                <div className="flex items-center gap-1 shrink-0">
                    <span className="text-slate-400 text-sm">$</span>
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={linea.monto === 0 ? '' : linea.monto}
                        placeholder="0.00"
                        onChange={e => onChange(linea.id, e.target.value)}
                        className="w-28 text-right border border-slate-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                    />
                </div>
            )}
        </div>
    )
}
