import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    Plus, FileDown, Eye, AlertCircle, Loader2,
    CheckCircle, Clock, Send, X, RefreshCw,
} from 'lucide-react'
import { supabase } from '../../../lib/supabaseContabilidad'
import { useAuth } from '../../../contexts/contabilidad/ContabilidadContext'
import { cn, formatMoneda, mesNombre } from '../../../lib/utils'

interface Declaracion103 {
    id:               string
    año:              number
    mes:              number
    version_form:     string
    estado:           string
    fecha_generacion: string | null
    fecha_envio:      string | null
    numero_formulario: string | null
    es_sustitutiva:   boolean
    created_at:       string
    // agregado desde join con detalle
    total_retenido:   number
}

const ESTADO_CFG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    borrador:   { label: 'Borrador',   color: 'bg-slate-100 text-slate-600',   icon: Clock },
    revisado:   { label: 'Revisado',   color: 'bg-blue-100 text-blue-700',     icon: Eye },
    enviado:    { label: 'Enviado',    color: 'bg-green-100 text-green-700',   icon: CheckCircle },
    sustitutiva:{ label: 'Sustitutiva',color: 'bg-amber-100 text-amber-700',   icon: RefreshCw },
    anulado:    { label: 'Anulado',    color: 'bg-red-100 text-red-600',       icon: X },
}

export function Formulario103Page() {
    const { empresaActiva } = useAuth()
    const navigate = useNavigate()

    const [año, setAño]               = useState(new Date().getFullYear())
    const [declaraciones, setDeclaraciones] = useState<Declaracion103[]>([])
    const [cargando, setCargando]     = useState(false)
    const [error, setError]           = useState('')
    const [creando, setCreando]       = useState(false)

    useEffect(() => {
        if (empresaActiva) cargar()
    }, [empresaActiva, año])

    async function cargar() {
        if (!empresaActiva) return
        setCargando(true)
        setError('')

        const { data, error: er } = await supabase
            .from('lp_rf_103')
            .select(`
                id, año, mes, version_form, estado,
                fecha_generacion, fecha_envio, numero_formulario,
                es_sustitutiva, created_at,
                lp_rf_103_detalle(casillero, valor_final)
            `)
            .eq('empresa_id', empresaActiva.id)
            .eq('año', año)
            .order('mes', { ascending: false })

        if (er) { setError(er.message); setCargando(false); return }

        const rows: Declaracion103[] = (data ?? []).map((d: any) => {
            const det: { casillero: string; valor_final: number }[] = d.lp_rf_103_detalle ?? []
            return {
                ...d,
                total_retenido: det.find(x => x.casillero === '499')?.valor_final ?? 0,
            }
        })

        setDeclaraciones(rows)
        setCargando(false)
    }

    async function nuevaDeclaracion(mes: number) {
        if (!empresaActiva) return
        setCreando(true)
        setError('')
        const { data, error: er } = await supabase
            .from('lp_rf_103')
            .insert({
                empresa_id:   empresaActiva.id,
                año,
                mes,
                version_form: 'v2026',
                estado:       'borrador',
            })
            .select('id')
            .single()

        if (er) { setError(er.message); setCreando(false); return }
        setCreando(false)
        navigate(`/tributario/103/${data.id}`)
    }

    // Meses que ya tienen declaración
    const mesesConDecl = new Set(declaraciones.map(d => d.mes))
    // Meses disponibles para crear (del 1 al mes actual si es el año actual, o todos si es año pasado)
    const mesLimite = año === new Date().getFullYear() ? new Date().getMonth() + 1 : 12
    const mesesDisponibles = Array.from({ length: mesLimite }, (_, i) => i + 1)
        .filter(m => !mesesConDecl.has(m))

    if (!empresaActiva && !cargando) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                <AlertCircle className="w-12 h-12 text-amber-400" />
                <h2 className="text-lg font-bold text-slate-800">Empresa contable no configurada</h2>
                <p className="text-slate-500 text-sm max-w-sm">
                    Debes configurar tu empresa en LedgerPro antes de usar el módulo contable.
                </p>
                <button onClick={() => window.location.href = '/conta/configuracion'}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium">
                    Ir a Configuración Contable
                </button>
            </div>
        )
    }

    return (
        <div className="space-y-5 max-w-5xl">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Formulario 103 — Retención en la Fuente</h1>
                    <p className="text-slate-500 text-sm mt-0.5">
                        Declaración mensual de retenciones del Impuesto a la Renta ante el SRI
                    </p>
                </div>
                <div className="flex gap-3 items-center">
                    <select
                        className="input"
                        value={año}
                        onChange={e => setAño(+e.target.value)}
                    >
                        {[2023, 2024, 2025, 2026, 2027].map(y =>
                            <option key={y} value={y}>{y}</option>
                        )}
                    </select>
                </div>
            </div>

            {error && (
                <div className="card px-5 py-3 bg-red-50 border-red-200 text-red-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{error}</span>
                    <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
                </div>
            )}

            {/* Lista de declaraciones del año */}
            <div className="card overflow-hidden">
                <div className="bg-slate-700 px-5 py-3 text-white font-bold text-sm flex items-center justify-between">
                    <span>Declaraciones {año} — {empresaActiva?.razon_social ?? empresaActiva?.nombre}</span>
                    {cargando && <Loader2 className="w-4 h-4 animate-spin" />}
                </div>

                {declaraciones.length === 0 && !cargando ? (
                    <div className="py-12 text-center text-slate-400">
                        <FileDown className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">No hay declaraciones para {año}.</p>
                        <p className="text-xs mt-1">Crea la primera usando el botón de abajo.</p>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                                <th className="py-2 px-4 text-left">Período</th>
                                <th className="py-2 px-4 text-left">Estado</th>
                                <th className="py-2 px-4 text-right">Total retenido</th>
                                <th className="py-2 px-4 text-left">Generado</th>
                                <th className="py-2 px-4 text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {declaraciones.map(d => {
                                const cfg = ESTADO_CFG[d.estado] ?? ESTADO_CFG.borrador
                                const Icon = cfg.icon
                                return (
                                    <tr key={d.id} className="border-b border-slate-100 hover:bg-slate-50">
                                        <td className="py-3 px-4 font-medium">
                                            {mesNombre(d.mes)} {d.año}
                                            {d.es_sustitutiva && (
                                                <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                                                    Sustitutiva
                                                </span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className={cn('inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium', cfg.color)}>
                                                <Icon className="w-3 h-3" />
                                                {cfg.label}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-right font-semibold">
                                            {d.total_retenido > 0
                                                ? <span className="text-purple-700">{formatMoneda(d.total_retenido)}</span>
                                                : <span className="text-slate-400">—</span>}
                                        </td>
                                        <td className="py-3 px-4 text-xs text-slate-500">
                                            {d.fecha_generacion
                                                ? new Date(d.fecha_generacion).toLocaleDateString('es-EC')
                                                : '—'}
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <div className="flex items-center justify-center gap-1">
                                                <button
                                                    onClick={() => navigate(`/tributario/103/${d.id}`)}
                                                    className="btn text-xs border border-slate-200 text-slate-600 hover:bg-slate-50 gap-1 py-1 px-3"
                                                >
                                                    <Eye className="w-3.5 h-3.5" /> Ver
                                                </button>
                                                {d.estado === 'enviado' && (
                                                    <button
                                                        onClick={() => nuevaDeclaracion(d.mes)}
                                                        disabled={creando}
                                                        className="btn text-xs border border-amber-200 text-amber-700 hover:bg-amber-50 gap-1 py-1 px-3"
                                                        title="Crear declaración sustitutiva"
                                                    >
                                                        <RefreshCw className="w-3.5 h-3.5" /> Sustit.
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Crear nueva declaración */}
            {mesesDisponibles.length > 0 && (
                <div className="card p-5">
                    <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                        <Plus className="w-4 h-4 text-primary-600" />
                        Nueva declaración — {año}
                    </p>
                    <div className="flex flex-wrap gap-2">
                        {mesesDisponibles.map(m => (
                            <button
                                key={m}
                                onClick={() => nuevaDeclaracion(m)}
                                disabled={creando}
                                className="btn border border-primary-200 text-primary-700 hover:bg-primary-50 text-sm py-2 px-4 gap-1"
                            >
                                {creando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                                {mesNombre(m)}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Info */}
            <div className="text-xs text-slate-400 flex items-center gap-2">
                <Send className="w-3.5 h-3.5" />
                Los valores se calculan automáticamente desde las retenciones registradas en compras (QuickInvoice).
                Cubre únicamente retención en la fuente de IR sobre pagos a residentes locales — no incluye pagos al
                exterior, dividendos, loterías ni banano. Puedes ajustar casilleros manualmente antes de generar el XML.
            </div>
        </div>
    )
}
