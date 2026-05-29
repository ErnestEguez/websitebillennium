import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
    RefreshCw, Save, FileDown, Send, AlertCircle, CheckCircle,
    Loader2, X, ArrowLeft, Info, Edit2, ChevronDown, ChevronUp,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { cn, formatMoneda, mesNombre } from '../../lib/utils'

// ── Tipos ──────────────────────────────────────────────────────────────────

interface Casillero {
    id?:             string
    casillero:       string
    descripcion:     string
    seccion:         string
    tipo_dato:       string
    obligatorio:     boolean
    orden:           number
    valor_calculado: number
    ajuste_manual:   number
    valor_final:     number
    nota_ajuste:     string
}

interface Declaracion {
    id:               string
    año:              number
    mes:              number
    version_form:     string
    estado:           string
    empresa_id:       string
    es_sustitutiva:   boolean
    fecha_generacion: string | null
    fecha_envio:      string | null
    numero_formulario: string | null
}

const SECCIONES = [
    { key: 'ventas',       label: 'Ventas',                   color: 'bg-blue-700' },
    { key: 'compras',      label: 'Compras / Crédito',        color: 'bg-indigo-700' },
    { key: 'retenciones',  label: 'Retenciones',              color: 'bg-purple-700' },
    { key: 'liquidacion',  label: 'Liquidación',              color: 'bg-emerald-700' },
    { key: 'saldo',        label: 'Saldo y Total a Pagar',    color: 'bg-slate-700' },
]

const SECCIONES_READONLY = new Set(['liquidacion']) // se recalculan solos

// ── Helpers ────────────────────────────────────────────────────────────────

function f2(n: number) { return n.toFixed(2) }

// ── Generador XML (cliente) ────────────────────────────────────────────────

function generarXml(
    decl: Declaracion,
    casilleros: Casillero[],
    empresa: { ruc?: string; razon_social?: string; nombre: string }
): string {
    const campos = casilleros.map(c =>
        `    <casillero numero="${c.casillero}">${f2(c.valor_final)}</casillero>`
    ).join('\n')

    const mesStr = String(decl.mes).padStart(2, '0')

    // Estructura supuesta — ajustar al XSD real del SRI cuando esté disponible
    return `<?xml version="1.0" encoding="UTF-8"?>
<declaracion version="${decl.version_form}">
  <informante>
    <tipoId>R</tipoId>
    <id>${empresa.ruc ?? ''}</id>
    <razonSocial>${(empresa.razon_social ?? empresa.nombre).replace(/&/g,'&amp;').replace(/</g,'&lt;')}</razonSocial>
  </informante>
  <periodo>
    <anio>${decl.año}</anio>
    <mes>${mesStr}</mes>
  </periodo>
  <formIva>
${campos}
  </formIva>
</declaracion>`
}

// ── Componente ─────────────────────────────────────────────────────────────

export function Formulario104DetallePage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { empresaActiva } = useAuth()

    const [decl, setDecl]             = useState<Declaracion | null>(null)
    const [casilleros, setCasilleros] = useState<Casillero[]>([])
    const [cargando, setCargando]     = useState(true)
    const [calculando, setCalculando] = useState(false)
    const [guardando, setGuardando]   = useState(false)
    const [error, setError]           = useState('')
    const [ok, setOk]                 = useState('')

    // Ajuste en edición
    const [editId, setEditId]         = useState<string | null>(null)
    const [editVal, setEditVal]       = useState('')
    const [editNota, setEditNota]     = useState('')

    // Secciones colapsadas
    const [collapsed, setCollapsed]   = useState<Set<string>>(new Set())

    useEffect(() => {
        if (id && empresaActiva) cargarDeclaracion()
    }, [id, empresaActiva])

    async function cargarDeclaracion() {
        if (!id) return
        setCargando(true)
        setError('')

        // 1. Cabecera
        const { data: dData, error: dErr } = await supabase
            .from('lp_iva_104')
            .select('*')
            .eq('id', id)
            .single()
        if (dErr || !dData) { setError(dErr?.message ?? 'No encontrado'); setCargando(false); return }
        setDecl(dData as Declaracion)

        // 2. Mapeo de casilleros + detalle guardado
        const { data: mapeo } = await supabase
            .from('lp_iva_104_mapeo_xml')
            .select('casillero, descripcion, seccion, tipo_dato, obligatorio, orden')
            .eq('version_form', dData.version_form)
            .eq('activo', true)
            .order('orden')

        const { data: detalles } = await supabase
            .from('lp_iva_104_detalle')
            .select('*')
            .eq('declaracion_id', id)

        const detalleMap: Record<string, any> = {}
        ;(detalles ?? []).forEach((d: any) => { detalleMap[d.casillero] = d })

        const filas: Casillero[] = (mapeo ?? []).map((m: any) => ({
            ...m,
            id:              detalleMap[m.casillero]?.id,
            valor_calculado: detalleMap[m.casillero]?.valor_calculado ?? 0,
            ajuste_manual:   detalleMap[m.casillero]?.ajuste_manual   ?? 0,
            valor_final:     detalleMap[m.casillero]?.valor_final      ?? 0,
            nota_ajuste:     detalleMap[m.casillero]?.nota_ajuste      ?? '',
        }))

        setCasilleros(filas)
        setCargando(false)
    }

    // ── Recalcular desde Supabase RPC ──────────────────────────────────────

    async function recalcular() {
        if (!decl || !empresaActiva) return
        setCalculando(true)
        setError('')

        const { data: calc, error: er } = await supabase
            .rpc('lp_calcular_104', {
                p_empresa_id: empresaActiva.id,
                p_año:        decl.año,
                p_mes:        decl.mes,
            })

        if (er) { setError(er.message); setCalculando(false); return }

        const calculados = calc as Record<string, number>

        // Upsert solo valor_calculado — ajuste_manual queda intacto en DB
        const rows = casilleros.map(c => ({
            declaracion_id:  id,
            empresa_id:      decl.empresa_id,
            casillero:       c.casillero,
            valor_calculado: calculados[c.casillero] ?? 0,
        }))

        const { error: uErr } = await supabase
            .from('lp_iva_104_detalle')
            .upsert(rows, { onConflict: 'declaracion_id,casillero' })

        if (uErr) { setError(uErr.message); setCalculando(false); return }

        // Actualizar fecha_generacion en cabecera
        await supabase.from('lp_iva_104')
            .update({ fecha_generacion: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq('id', id)

        // Log
        await supabase.from('lp_iva_104_log').insert({
            declaracion_id: id, empresa_id: decl.empresa_id,
            accion: 'calcular', resultado: 'ok',
            mensaje: `Recalculado ${decl.año}/${decl.mes}`,
        })

        setOk('Casilleros recalculados correctamente.')
        setCalculando(false)
        await cargarDeclaracion()
    }

    // ── Guardar ajuste manual ──────────────────────────────────────────────

    async function guardarAjuste(casillero: string) {
        if (!decl) return
        const ajuste = parseFloat(editVal) || 0
        setGuardando(true)

        const { error: er } = await supabase
            .from('lp_iva_104_detalle')
            .update({ ajuste_manual: ajuste, nota_ajuste: editNota, updated_at: new Date().toISOString() })
            .eq('declaracion_id', id)
            .eq('casillero', casillero)

        if (er) { setError(er.message); setGuardando(false); return }

        await supabase.from('lp_iva_104_log').insert({
            declaracion_id: id, empresa_id: decl.empresa_id,
            accion: 'ajustar', resultado: 'ok',
            mensaje: `Casillero ${casillero} ajustado a ${ajuste}`,
        })

        setEditId(null)
        setGuardando(false)
        await cargarDeclaracion()
    }

    // ── Cambiar estado ─────────────────────────────────────────────────────

    async function cambiarEstado(nuevoEstado: string) {
        if (!decl) return
        const campos: Record<string, any> = { estado: nuevoEstado, updated_at: new Date().toISOString() }
        if (nuevoEstado === 'enviado') campos.fecha_envio = new Date().toISOString()

        await supabase.from('lp_iva_104').update(campos).eq('id', id)
        await supabase.from('lp_iva_104_log').insert({
            declaracion_id: id, empresa_id: decl.empresa_id,
            accion: 'marcar_enviado', resultado: 'ok',
            mensaje: `Estado cambiado a ${nuevoEstado}`,
        })
        await cargarDeclaracion()
        setOk(`Declaración marcada como ${nuevoEstado}.`)
    }

    // ── Generar XML ────────────────────────────────────────────────────────

    async function descargarXml() {
        if (!decl || !empresaActiva) return

        const casValidos = casilleros.filter(c => c.valor_final !== 0 || c.obligatorio)
        const xml = generarXml(decl, casValidos, empresaActiva as any)

        const blob = new Blob([xml], { type: 'application/xml;charset=utf-8;' })
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a')
        const nombre = `F104_${empresaActiva.ruc ?? 'RUC'}_${decl.año}${String(decl.mes).padStart(2,'0')}.xml`
        a.href = url; a.download = nombre; a.click()
        URL.revokeObjectURL(url)

        await supabase.from('lp_iva_104_log').insert({
            declaracion_id: id, empresa_id: decl.empresa_id,
            accion: 'generar_xml', resultado: 'ok', archivo_nombre: nombre,
        })
        setOk(`XML generado: ${nombre}`)
    }

    // ── Render ─────────────────────────────────────────────────────────────

    if (cargando) return (
        <div className="flex items-center justify-center min-h-[400px] text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando declaración...
        </div>
    )

    if (!decl) return (
        <div className="text-center py-20 text-slate-400">Declaración no encontrada.</div>
    )

    const enviado = decl.estado === 'enviado' || decl.estado === 'anulado'
    const ivaPagar   = casilleros.find(c => c.casillero === '699')?.valor_final ?? 0
    const creditoSig = casilleros.find(c => c.casillero === '700')?.valor_final ?? 0

    return (
        <div className="space-y-5 max-w-4xl">
            {/* Header */}
            <div className="flex items-center gap-3 flex-wrap">
                <button onClick={() => navigate('/tributario/104')}
                    className="text-slate-400 hover:text-slate-700 p-1">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="flex-1">
                    <h1 className="text-2xl font-bold text-slate-900">
                        Formulario 104 — {mesNombre(decl.mes)} {decl.año}
                        {decl.es_sustitutiva && <span className="ml-2 text-sm bg-amber-100 text-amber-700 px-2 py-0.5 rounded">Sustitutiva</span>}
                    </h1>
                    <p className="text-slate-500 text-sm mt-0.5">
                        {empresaActiva?.razon_social ?? empresaActiva?.nombre} — RUC: {empresaActiva?.ruc ?? '—'}
                    </p>
                </div>
                {/* Resumen rápido */}
                <div className="flex gap-3">
                    {ivaPagar > 0 && (
                        <div className="card px-4 py-2 bg-red-50 border-red-200 text-center">
                            <p className="text-xs text-red-500">IVA a pagar</p>
                            <p className="font-bold text-red-700">{formatMoneda(ivaPagar)}</p>
                        </div>
                    )}
                    {creditoSig > 0 && (
                        <div className="card px-4 py-2 bg-emerald-50 border-emerald-200 text-center">
                            <p className="text-xs text-emerald-600">Crédito sig. período</p>
                            <p className="font-bold text-emerald-700">{formatMoneda(creditoSig)}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Alertas */}
            {error && (
                <div className="card px-5 py-3 bg-red-50 border-red-200 text-red-700 text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{error}</span>
                    <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
                </div>
            )}
            {ok && (
                <div className="card px-5 py-3 bg-green-50 border-green-200 text-green-700 text-sm flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" /> {ok}
                    <button onClick={() => setOk('')} className="ml-auto"><X className="w-4 h-4" /></button>
                </div>
            )}

            {/* Barra de acciones */}
            <div className="card p-4 flex flex-wrap gap-3 items-center">
                <button onClick={recalcular} disabled={calculando || enviado}
                    className="btn border border-blue-200 text-blue-700 hover:bg-blue-50 gap-2 disabled:opacity-40">
                    {calculando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Recalcular
                </button>
                <button onClick={descargarXml} disabled={casilleros.length === 0}
                    className="btn border border-slate-200 text-slate-700 hover:bg-slate-50 gap-2">
                    <FileDown className="w-4 h-4" /> Descargar XML
                </button>
                <div className="flex-1" />
                {decl.estado === 'borrador' && (
                    <button onClick={() => cambiarEstado('revisado')}
                        className="btn border border-indigo-200 text-indigo-700 hover:bg-indigo-50 gap-2">
                        <CheckCircle className="w-4 h-4" /> Marcar revisado
                    </button>
                )}
                {(decl.estado === 'borrador' || decl.estado === 'revisado') && (
                    <button onClick={() => cambiarEstado('enviado')}
                        className="btn btn-primary gap-2">
                        <Send className="w-4 h-4" /> Marcar enviado
                    </button>
                )}
                {decl.estado === 'enviado' && (
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                        Enviado {decl.fecha_envio ? new Date(decl.fecha_envio).toLocaleDateString('es-EC') : ''}
                    </span>
                )}
            </div>

            {/* Casilleros por sección */}
            {SECCIONES.map(sec => {
                const filas = casilleros.filter(c => c.seccion === sec.key)
                if (filas.length === 0) return null
                const isCollapsed = collapsed.has(sec.key)

                return (
                    <div key={sec.key} className="card overflow-hidden">
                        <button
                            className={`w-full px-5 py-3 text-white font-bold text-sm flex items-center justify-between ${sec.color}`}
                            onClick={() => setCollapsed(prev => {
                                const s = new Set(prev)
                                s.has(sec.key) ? s.delete(sec.key) : s.add(sec.key)
                                return s
                            })}
                        >
                            <span>{sec.label}</span>
                            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                        </button>

                        {!isCollapsed && (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-slate-50 border-b text-xs text-slate-500 uppercase tracking-wide">
                                        <th className="py-2 px-4 text-left w-16">Casill.</th>
                                        <th className="py-2 px-4 text-left">Descripción</th>
                                        <th className="py-2 px-4 text-right w-32">Calculado</th>
                                        <th className="py-2 px-4 text-right w-28">Ajuste</th>
                                        <th className="py-2 px-4 text-right w-32 font-semibold text-slate-700">Total</th>
                                        {!enviado && !SECCIONES_READONLY.has(sec.key) && (
                                            <th className="py-2 px-3 w-10" />
                                        )}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filas.map(c => {
                                        const isEditing = editId === c.casillero
                                        return (
                                            <tr key={c.casillero}
                                                className={cn('border-b border-slate-100',
                                                    c.obligatorio ? 'bg-white' : 'bg-white hover:bg-slate-50',
                                                    c.valor_final !== 0 ? '' : 'text-slate-400'
                                                )}>
                                                <td className="py-2.5 px-4 font-mono text-xs font-semibold text-slate-600">
                                                    {c.casillero}
                                                    {c.obligatorio && <span className="text-red-400 ml-0.5">*</span>}
                                                </td>
                                                <td className="py-2.5 px-4 text-xs text-slate-600">{c.descripcion}</td>
                                                <td className="py-2.5 px-4 text-right text-xs font-mono">
                                                    {formatMoneda(c.valor_calculado)}
                                                </td>
                                                <td className="py-2.5 px-4 text-right text-xs font-mono">
                                                    {isEditing ? (
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={editVal}
                                                            onChange={e => setEditVal(e.target.value)}
                                                            className="input text-right text-xs py-1 w-28 font-mono"
                                                            autoFocus
                                                        />
                                                    ) : (
                                                        <span className={c.ajuste_manual !== 0 ? 'text-amber-600 font-semibold' : ''}>
                                                            {c.ajuste_manual !== 0 ? formatMoneda(c.ajuste_manual) : '—'}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-4 text-right font-semibold text-sm font-mono">
                                                    {formatMoneda(c.valor_final)}
                                                </td>
                                                {!enviado && !SECCIONES_READONLY.has(sec.key) && (
                                                    <td className="py-2.5 px-3">
                                                        {isEditing ? (
                                                            <div className="flex gap-1">
                                                                <button onClick={() => guardarAjuste(c.casillero)}
                                                                    disabled={guardando}
                                                                    className="text-emerald-600 hover:text-emerald-700 p-1">
                                                                    {guardando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                                                </button>
                                                                <button onClick={() => setEditId(null)}
                                                                    className="text-slate-400 hover:text-slate-600 p-1">
                                                                    <X className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                onClick={() => {
                                                                    setEditId(c.casillero)
                                                                    setEditVal(String(c.ajuste_manual))
                                                                    setEditNota(c.nota_ajuste)
                                                                }}
                                                                className="text-slate-300 hover:text-primary-600 p-1"
                                                                title="Ajuste manual">
                                                                <Edit2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </td>
                                                )}
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                )
            })}

            {/* Nota ajustes */}
            {!enviado && (
                <div className="card p-4 bg-amber-50 border-amber-200 text-xs text-amber-700 flex gap-3">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                        <strong>Ajustes manuales:</strong> haz clic en el lápiz de cualquier casillero para ingresar un ajuste.
                        El valor final = calculado + ajuste. Los ajustes <strong>no se pierden</strong> al recalcular.
                        Las secciones de Liquidación se recalculan automáticamente.
                    </div>
                </div>
            )}
        </div>
    )
}
