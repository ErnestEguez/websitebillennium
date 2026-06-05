import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Ban, Loader2, AlertCircle, Edit2, Save, Plus, Trash2, Search, X } from 'lucide-react'
import { supabase } from '../../../lib/supabaseContabilidad'
import { useAuth } from '../../../contexts/contabilidad/ContabilidadContext'
import { cn, formatMoneda, formatFecha } from '../../../lib/utils'
import type { LpComprobante, LpComprobanteLinea, LpCuenta, LineaForm } from '../../../types/conta'

const ESTADO_STYLE = {
    borrador:   { bg: 'bg-slate-100',  text: 'text-slate-600',  label: 'Borrador' },
    confirmado: { bg: 'bg-green-100',  text: 'text-green-700',  label: 'Confirmado' },
    anulado:    { bg: 'bg-red-100',    text: 'text-red-700',    label: 'Anulado' },
}

function SelectorCuenta({ cuentas, value, onChange }: {
    cuentas: LpCuenta[]
    value: string
    onChange: (id: string) => void
}) {
    const [open, setOpen] = useState(false)
    const [q, setQ] = useState('')
    const cuenta = cuentas.find(c => c.id === value)
    const filtradas = cuentas
        .filter(c => c.acepta_movimientos)
        .filter(c => !q || c.codigo.includes(q) || c.nombre.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 30)

    return (
        <div className="relative">
            <button type="button" onClick={() => setOpen(true)}
                className={cn('w-full text-left input text-sm', !value && 'text-slate-400')}>
                {cuenta ? `${cuenta.codigo} — ${cuenta.nombre}` : 'Seleccionar cuenta...'}
            </button>
            {open && (
                <div className="absolute left-0 top-full mt-1 w-96 bg-white rounded-xl border border-slate-200 shadow-xl z-50">
                    <div className="p-2 border-b flex items-center gap-2">
                        <Search className="w-4 h-4 text-slate-400 shrink-0" />
                        <input autoFocus className="flex-1 text-sm outline-none"
                            placeholder="Buscar..." value={q} onChange={e => setQ(e.target.value)} />
                        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                        {filtradas.map(c => (
                            <button key={c.id} type="button"
                                onClick={() => { onChange(c.id); setOpen(false); setQ('') }}
                                className="w-full text-left px-4 py-2.5 hover:bg-primary-50 flex items-center gap-3 text-sm">
                                <span className="font-mono text-xs text-slate-500 w-28 shrink-0">{c.codigo}</span>
                                <span className="text-slate-700 truncate">{c.nombre}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

export function VerComprobantePage() {
    const { id } = useParams<{ id: string }>()
    const { empresaActiva } = useAuth()
    const navigate = useNavigate()

    const [comp, setComp] = useState<LpComprobante | null>(null)
    const [lineas, setLineas] = useState<LpComprobanteLinea[]>([])
    const [cuentas, setCuentas] = useState<LpCuenta[]>([])
    const [loading, setLoading] = useState(true)
    const [editando, setEditando] = useState(false)
    const [guardando, setGuardando] = useState(false)
    const [accionando, setAccionando] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Campos editables
    const [glosa, setGlosa] = useState('')
    const [fecha, setFecha] = useState('')
    const [lineasEdit, setLineasEdit] = useState<LineaForm[]>([])

    useEffect(() => { if (id && empresaActiva) cargar() }, [id, empresaActiva])

    async function cargar() {
        if (!id || !empresaActiva) return
        setLoading(true)

        const [compRes, lineasRes, cuentasRes] = await Promise.all([
            supabase.from('lp_comprobantes')
                .select('*, tipo_comprobante:lp_tipos_comprobante(codigo, nombre)')
                .eq('id', id)
                .eq('empresa_id', empresaActiva.id)
                .single(),
            supabase.from('lp_comprobante_lineas')
                .select('*, cuenta:lp_cuentas(codigo, nombre)')
                .eq('comprobante_id', id)
                .order('orden'),
            supabase.from('lp_cuentas')
                .select('*')
                .eq('empresa_id', empresaActiva.id)
                .eq('activa', true)
                .order('codigo'),
        ])

        if (compRes.data) {
            setComp(compRes.data as any)
            setGlosa(compRes.data.glosa)
            setFecha(compRes.data.fecha)
        }
        if (lineasRes.data) {
            setLineas(lineasRes.data as any)
            setLineasEdit(lineasRes.data.map((l: any, i: number) => ({
                cuenta_id: l.cuenta_id,
                descripcion: l.descripcion ?? '',
                debe: l.debe > 0 ? String(l.debe) : '',
                haber: l.haber > 0 ? String(l.haber) : '',
                orden: i,
            })))
        }
        setCuentas(cuentasRes.data ?? [])
        setLoading(false)
    }

    async function guardarEdicion() {
        if (!comp || !empresaActiva) return
        const lineasValidas = lineasEdit.filter(l => l.cuenta_id && (parseFloat(l.debe) > 0 || parseFloat(l.haber) > 0))
        if (lineasValidas.length < 2) { setError('El asiento debe tener al menos 2 líneas.'); return }
        const totalDebe = lineasValidas.reduce((s, l) => s + (parseFloat(l.debe) || 0), 0)
        const totalHaber = lineasValidas.reduce((s, l) => s + (parseFloat(l.haber) || 0), 0)
        if (Math.abs(totalDebe - totalHaber) >= 0.01) { setError(`El asiento no cuadra. Diferencia: ${Math.abs(totalDebe - totalHaber).toFixed(2)}`); return }

        setGuardando(true)
        setError(null)

        await supabase.from('lp_comprobantes').update({
            glosa: glosa.trim(), fecha, total_debe: totalDebe, total_haber: totalHaber,
            updated_at: new Date().toISOString(),
        }).eq('id', comp.id)

        await supabase.from('lp_comprobante_lineas').delete().eq('comprobante_id', comp.id)

        await supabase.from('lp_comprobante_lineas').insert(
            lineasValidas.map((l, i) => ({
                comprobante_id: comp.id,
                empresa_id: empresaActiva.id,
                cuenta_id: l.cuenta_id,
                descripcion: l.descripcion || null,
                debe: parseFloat(l.debe) || 0,
                haber: parseFloat(l.haber) || 0,
                orden: i,
            }))
        )

        setGuardando(false)
        setEditando(false)
        cargar()
    }

    async function confirmar() {
        if (!comp) return
        setAccionando(true)
        await supabase.from('lp_comprobantes')
            .update({ estado: 'confirmado', updated_at: new Date().toISOString() })
            .eq('id', comp.id)
        await supabase.rpc('lp_actualizar_saldos', { p_comprobante_id: comp.id, p_operacion: 'sumar' })
        setAccionando(false)
        cargar()
    }

    async function anular() {
        if (!comp || !confirm('¿Anular este comprobante?')) return
        setAccionando(true)
        await supabase.from('lp_comprobantes')
            .update({ estado: 'anulado', updated_at: new Date().toISOString() })
            .eq('id', comp.id)
        if (comp.estado === 'confirmado') {
            await supabase.rpc('lp_actualizar_saldos', { p_comprobante_id: comp.id, p_operacion: 'restar' })
        }
        setAccionando(false)
        cargar()
    }

    const sym = empresaActiva?.moneda?.simbolo ?? '$'
    const totalDebe = lineasEdit.reduce((s, l) => s + (parseFloat(l.debe) || 0), 0)
    const totalHaber = lineasEdit.reduce((s, l) => s + (parseFloat(l.haber) || 0), 0)
    const cuadra = Math.abs(totalDebe - totalHaber) < 0.01 && totalDebe > 0

    if (loading) return (
        <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
    )

    if (!comp) return (
        <div className="card p-10 text-center text-slate-400">
            Comprobante no encontrado.
            <Link to="/comprobantes" className="block mt-2 text-primary-600 hover:underline text-sm">
                Volver a Diarios
            </Link>
        </div>
    )

    const est = ESTADO_STYLE[comp.estado]

    return (
        <div className="space-y-5 max-w-5xl">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate('/comprobantes')}
                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-600">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-xl font-bold text-slate-900 font-mono">{comp.numero}</h1>
                            <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full', est.bg, est.text)}>
                                {est.label}
                            </span>
                        </div>
                        <p className="text-slate-500 text-sm mt-0.5">
                            {(comp as any).tipo_comprobante?.nombre} · {formatFecha(comp.fecha)}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {comp.estado === 'borrador' && !editando && (
                        <button onClick={() => setEditando(true)}
                            className="btn btn-secondary gap-2 text-sm">
                            <Edit2 className="w-4 h-4" /> Editar
                        </button>
                    )}
                    {comp.estado === 'borrador' && !editando && (
                        <button onClick={confirmar} disabled={accionando}
                            className="btn btn-primary gap-2 text-sm">
                            {accionando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                            Confirmar
                        </button>
                    )}
                    {comp.estado !== 'anulado' && !editando && (
                        <button onClick={anular} disabled={accionando}
                            className="btn btn-secondary gap-2 text-sm text-red-600 hover:bg-red-50 hover:border-red-200">
                            <Ban className="w-4 h-4" /> Anular
                        </button>
                    )}
                    {editando && (
                        <>
                            <button onClick={() => { setEditando(false); setError(null) }}
                                className="btn btn-secondary text-sm">Cancelar</button>
                            <button onClick={guardarEdicion} disabled={guardando || !cuadra}
                                className="btn btn-primary gap-2 text-sm">
                                {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Guardar cambios
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Cabecera */}
            <div className="card p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Fecha</p>
                    {editando
                        ? <input type="date" className="input text-sm" value={fecha} onChange={e => setFecha(e.target.value)} />
                        : <p className="font-medium text-slate-800">{formatFecha(comp.fecha)}</p>
                    }
                </div>
                <div className="col-span-2 md:col-span-3">
                    <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Glosa</p>
                    {editando
                        ? <input className="input text-sm" value={glosa} onChange={e => setGlosa(e.target.value)} />
                        : <p className="font-medium text-slate-800">{comp.glosa}</p>
                    }
                </div>
            </div>

            {/* Nota para confirmados */}
            {comp.estado === 'confirmado' && (
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>Los comprobantes confirmados no se pueden editar. Para corregirlo: <strong>anúlalo</strong> y crea un nuevo asiento con los datos correctos.</p>
                </div>
            )}

            {/* Líneas */}
            <div className="card overflow-hidden">
                {editando && (
                    <div className="flex items-center justify-between px-5 py-3 border-b bg-amber-50">
                        <p className="text-sm font-medium text-amber-800">Modo edición — modifica las líneas del asiento</p>
                        <button type="button"
                            onClick={() => setLineasEdit(prev => [...prev, { cuenta_id: '', descripcion: '', debe: '', haber: '', orden: prev.length }])}
                            className="btn btn-secondary gap-1.5 text-xs py-1.5">
                            <Plus className="w-3.5 h-3.5" /> Agregar línea
                        </button>
                    </div>
                )}
                <table className="w-full text-sm">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-left py-2.5 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wide">Cuenta</th>
                            <th className="text-left py-2.5 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wide">Descripción</th>
                            <th className="text-right py-2.5 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wide w-32">Debe</th>
                            <th className="text-right py-2.5 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wide w-32">Haber</th>
                            {editando && <th className="w-10" />}
                        </tr>
                    </thead>
                    <tbody>
                        {editando ? lineasEdit.map((l, idx) => (
                            <tr key={idx} className="border-b border-slate-100">
                                <td className="py-2 px-4 w-72">
                                    <SelectorCuenta cuentas={cuentas} value={l.cuenta_id}
                                        onChange={id => setLineasEdit(prev => prev.map((x, i) => i === idx ? { ...x, cuenta_id: id } : x))} />
                                </td>
                                <td className="py-2 px-4">
                                    <input className="input text-sm" placeholder="Descripción opcional"
                                        value={l.descripcion}
                                        onChange={e => setLineasEdit(prev => prev.map((x, i) => i === idx ? { ...x, descripcion: e.target.value } : x))} />
                                </td>
                                <td className="py-2 px-4">
                                    <input type="number" min="0" step="0.01" className="input text-right font-mono" placeholder="0.00"
                                        value={l.debe}
                                        onChange={e => setLineasEdit(prev => prev.map((x, i) => i === idx ? { ...x, debe: e.target.value, haber: e.target.value ? '' : x.haber } : x))}
                                        onFocus={e => e.target.select()} />
                                </td>
                                <td className="py-2 px-4">
                                    <input type="number" min="0" step="0.01" className="input text-right font-mono" placeholder="0.00"
                                        value={l.haber}
                                        onChange={e => setLineasEdit(prev => prev.map((x, i) => i === idx ? { ...x, haber: e.target.value, debe: e.target.value ? '' : x.debe } : x))}
                                        onFocus={e => e.target.select()} />
                                </td>
                                <td className="py-2 px-2">
                                    {lineasEdit.length > 2 && (
                                        <button type="button" onClick={() => setLineasEdit(prev => prev.filter((_, i) => i !== idx))}
                                            className="p-1 text-slate-300 hover:text-red-500">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        )) : lineas.map(l => (
                            <tr key={l.id} className="border-b border-slate-100">
                                <td className="py-2.5 px-4">
                                    <span className="font-mono text-xs text-slate-500 mr-2">{(l as any).cuenta?.codigo}</span>
                                    <span className="text-slate-700">{(l as any).cuenta?.nombre}</span>
                                </td>
                                <td className="py-2.5 px-4 text-slate-500 text-xs">{l.descripcion ?? '—'}</td>
                                <td className="py-2.5 px-4 text-right font-mono text-slate-800">
                                    {l.debe > 0 ? formatMoneda(l.debe, sym) : '—'}
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono text-slate-800">
                                    {l.haber > 0 ? formatMoneda(l.haber, sym) : '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold">
                        <tr>
                            <td colSpan={editando ? 2 : 2} className="py-3 px-4 text-right text-xs uppercase tracking-wide text-slate-600">
                                TOTALES
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-900">
                                {formatMoneda(editando ? totalDebe : comp.total_debe, sym)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-900">
                                {formatMoneda(editando ? totalHaber : comp.total_haber, sym)}
                            </td>
                            {editando && <td />}
                        </tr>
                    </tfoot>
                </table>

                {editando && (
                    <div className="px-5 py-3 border-t bg-slate-50">
                        {cuadra
                            ? <p className="text-sm text-green-700 font-medium flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Asiento cuadrado</p>
                            : <p className="text-sm text-red-600 font-medium flex items-center gap-2"><AlertCircle className="w-4 h-4" /> Diferencia: {formatMoneda(Math.abs(totalDebe - totalHaber), sym)}</p>
                        }
                    </div>
                )}
            </div>

            {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
            )}
        </div>
    )
}




