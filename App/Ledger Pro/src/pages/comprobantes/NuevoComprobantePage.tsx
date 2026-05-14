import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Trash2, Loader2, AlertCircle, CheckCircle2, Search, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { cn, formatMoneda } from '../../lib/utils'
import type { LpCuenta, LpPeriodo, LpTipoComprobante, LineaForm } from '../../types/conta'

const LINEA_VACIA: LineaForm = { cuenta_id: '', descripcion: '', debe: '', haber: '', orden: 0 }

// ── Selector de cuenta con búsqueda ────────────────────────
function SelectorCuenta({
    cuentas, value, onChange
}: { cuentas: LpCuenta[]; value: string; onChange: (id: string, cuenta: LpCuenta) => void }) {
    const [open, setOpen] = useState(false)
    const [q, setQ] = useState('')
    const cuenta = cuentas.find(c => c.id === value)

    const filtradas = cuentas
        .filter(c => c.acepta_movimientos)
        .filter(c => !q || c.codigo.includes(q) || c.nombre.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 30)

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={cn('w-full text-left input text-sm', !value && 'text-slate-400')}
            >
                {cuenta ? `${cuenta.codigo} — ${cuenta.nombre}` : 'Seleccionar cuenta...'}
            </button>
            {open && (
                <div className="absolute left-0 top-full mt-1 w-96 bg-white rounded-xl border border-slate-200 shadow-xl z-50">
                    <div className="p-2 border-b flex items-center gap-2">
                        <Search className="w-4 h-4 text-slate-400 shrink-0" />
                        <input
                            autoFocus
                            className="flex-1 text-sm outline-none"
                            placeholder="Buscar código o nombre..."
                            value={q}
                            onChange={e => setQ(e.target.value)}
                        />
                        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                        {filtradas.length === 0
                            ? <p className="text-sm text-slate-400 text-center py-4">Sin resultados</p>
                            : filtradas.map(c => (
                                <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => { onChange(c.id, c); setOpen(false); setQ('') }}
                                    className="w-full text-left px-4 py-2.5 hover:bg-primary-50 flex items-center gap-3 text-sm"
                                >
                                    <span className="font-mono text-xs text-slate-500 w-28 shrink-0">{c.codigo}</span>
                                    <span className="text-slate-700 truncate">{c.nombre}</span>
                                </button>
                            ))
                        }
                    </div>
                </div>
            )}
        </div>
    )
}

export function NuevoComprobantePage() {
    const { empresaActiva, user } = useAuth()
    const navigate = useNavigate()

    const [tipos, setTipos] = useState<LpTipoComprobante[]>([])
    const [periodos, setPeriodos] = useState<LpPeriodo[]>([])
    const [cuentas, setCuentas] = useState<LpCuenta[]>([])

    const [tipoId, setTipoId] = useState('')
    const [periodoId, setPeriodoId] = useState('')
    const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10))
    const [glosa, setGlosa] = useState('')
    const [lineas, setLineas] = useState<LineaForm[]>([
        { ...LINEA_VACIA, orden: 0 },
        { ...LINEA_VACIA, orden: 1 },
    ])
    const [guardando, setGuardando] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => { if (empresaActiva) cargarCatalogos() }, [empresaActiva])

    async function cargarCatalogos() {
        if (!empresaActiva) return
        const [tiposRes, periodosRes, cuentasRes] = await Promise.all([
            supabase.from('lp_tipos_comprobante').select('*').eq('activo', true).order('codigo'),
            supabase.from('lp_periodos').select('*')
                .eq('empresa_id', empresaActiva.id).eq('estado', 'abierto').order('año').order('mes'),
            supabase.from('lp_cuentas').select('*')
                .eq('empresa_id', empresaActiva.id).eq('activa', true).order('codigo'),
        ])
        setTipos(tiposRes.data ?? [])
        setPeriodos(periodosRes.data ?? [])
        setCuentas(cuentasRes.data ?? [])
        if (tiposRes.data?.[0]) setTipoId(tiposRes.data.find(t => t.codigo === 'CD')?.id ?? tiposRes.data[0].id)
        if (periodosRes.data?.[0]) setPeriodoId(periodosRes.data[periodosRes.data.length - 1]?.id ?? '')
    }

    const totalDebe = lineas.reduce((s, l) => s + (parseFloat(l.debe) || 0), 0)
    const totalHaber = lineas.reduce((s, l) => s + (parseFloat(l.haber) || 0), 0)
    const diferencia = Math.abs(totalDebe - totalHaber)
    const cuadra = diferencia < 0.01 && totalDebe > 0

    function actualizarLinea(idx: number, campo: keyof LineaForm, valor: string) {
        setLineas(prev => prev.map((l, i) => i === idx ? { ...l, [campo]: valor } : l))
    }

    function setLineasCuenta(idx: number, id: string, cuenta: LpCuenta) {
        setLineas(prev => prev.map((l, i) => i === idx ? { ...l, cuenta_id: id, _cuenta: cuenta } : l))
    }

    function agregarLinea() {
        setLineas(prev => [...prev, { ...LINEA_VACIA, orden: prev.length }])
    }

    function quitarLinea(idx: number) {
        setLineas(prev => prev.filter((_, i) => i !== idx))
    }

    async function guardar(confirmar: boolean) {
        if (!empresaActiva || !tipoId || !periodoId) { setError('Completa todos los campos obligatorios.'); return }
        if (!glosa.trim()) { setError('La glosa es obligatoria.'); return }
        const lineasValidas = lineas.filter(l => l.cuenta_id && (parseFloat(l.debe) > 0 || parseFloat(l.haber) > 0))
        if (lineasValidas.length < 2) { setError('El asiento debe tener al menos 2 líneas.'); return }
        if (!cuadra) { setError(`El asiento no cuadra. Diferencia: ${diferencia.toFixed(2)}`); return }

        setGuardando(true)
        setError(null)

        const periodo = periodos.find(p => p.id === periodoId)!
        const tipo = tipos.find(t => t.id === tipoId)!
        const { data: numData } = await supabase
            .rpc('lp_generar_numero_comprobante', {
                p_empresa_id: empresaActiva.id,
                p_tipo_codigo: tipo.codigo,
                p_año: periodo.año,
                p_mes: periodo.mes ?? 1,
            })

        const { data: comp, error: compErr } = await supabase
            .from('lp_comprobantes')
            .insert({
                empresa_id: empresaActiva.id,
                periodo_id: periodoId,
                tipo_comprobante_id: tipoId,
                numero: numData as string,
                secuencial: 1,
                fecha,
                glosa: glosa.trim(),
                estado: confirmar ? 'confirmado' : 'borrador',
                total_debe: totalDebe,
                total_haber: totalHaber,
                moneda_id: empresaActiva.moneda_id,
                origen: 'manual',
                created_by: user?.id,
            })
            .select('id')
            .single()

        if (compErr || !comp) { setError(compErr?.message ?? 'Error al guardar'); setGuardando(false); return }

        const { error: linErr } = await supabase.from('lp_comprobante_lineas').insert(
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

        if (linErr) { setError(linErr.message); setGuardando(false); return }

        if (confirmar) {
            await supabase.rpc('lp_actualizar_saldos', {
                p_comprobante_id: comp.id, p_operacion: 'sumar'
            })
        }

        navigate('/comprobantes')
    }

    const sym = empresaActiva?.moneda?.simbolo ?? '$'

    return (
        <div className="space-y-5 max-w-5xl">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Nuevo Asiento Contable</h1>
                <p className="text-slate-500 text-sm mt-0.5">Ingresa la cabecera y las líneas del comprobante</p>
            </div>

            {/* Cabecera */}
            <div className="card p-6">
                <h2 className="text-sm font-semibold text-slate-700 mb-4 uppercase tracking-wide">Cabecera</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <label className="label">Tipo de comprobante *</label>
                        <select className="input" value={tipoId} onChange={e => setTipoId(e.target.value)}>
                            <option value="">Seleccionar...</option>
                            {tipos.map(t => <option key={t.id} value={t.id}>{t.codigo} — {t.nombre}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="label">Período *</label>
                        <select className="input" value={periodoId} onChange={e => setPeriodoId(e.target.value)}>
                            <option value="">Seleccionar...</option>
                            {periodos.map(p => (
                                <option key={p.id} value={p.id}>
                                    {p.mes ? `${String(p.mes).padStart(2,'0')}/${p.año}` : p.año} — {p.estado}
                                </option>
                            ))}
                        </select>
                        {periodos.length === 0 && (
                            <p className="text-xs text-amber-600 mt-1">No hay períodos abiertos. Crea uno primero.</p>
                        )}
                    </div>
                    <div>
                        <label className="label">Fecha *</label>
                        <input type="date" className="input" value={fecha} onChange={e => setFecha(e.target.value)} />
                    </div>
                    <div className="col-span-2 md:col-span-1">
                        <label className="label">Moneda</label>
                        <input className="input bg-slate-50" readOnly value={empresaActiva?.moneda?.nombre ?? '—'} />
                    </div>
                </div>
                <div className="mt-4">
                    <label className="label">Glosa / Descripción *</label>
                    <input className="input" value={glosa} onChange={e => setGlosa(e.target.value)} placeholder="Descripción del asiento contable..." />
                </div>
            </div>

            {/* Líneas */}
            <div className="card overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b">
                    <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Líneas del Asiento</h2>
                    <button type="button" onClick={agregarLinea} className="btn btn-secondary gap-1.5 text-xs py-1.5">
                        <Plus className="w-3.5 h-3.5" /> Agregar línea
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                                <th className="text-left py-2 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wide w-64">Cuenta</th>
                                <th className="text-left py-2 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wide">Descripción</th>
                                <th className="text-right py-2 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wide w-36">Debe</th>
                                <th className="text-right py-2 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wide w-36">Haber</th>
                                <th className="w-10" />
                            </tr>
                        </thead>
                        <tbody>
                            {lineas.map((linea, idx) => (
                                <tr key={idx} className="border-b border-slate-100">
                                    <td className="py-2 px-4">
                                        <SelectorCuenta
                                            cuentas={cuentas}
                                            value={linea.cuenta_id}
                                            onChange={(id, c) => setLineasCuenta(idx, id, c)}
                                        />
                                    </td>
                                    <td className="py-2 px-4">
                                        <input
                                            className="input text-sm"
                                            placeholder="Descripción opcional"
                                            value={linea.descripcion}
                                            onChange={e => actualizarLinea(idx, 'descripcion', e.target.value)}
                                        />
                                    </td>
                                    <td className="py-2 px-4">
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            className="input text-right font-mono"
                                            placeholder="0.00"
                                            value={linea.debe}
                                            onChange={e => actualizarLinea(idx, 'debe', e.target.value)}
                                            onFocus={e => e.target.select()}
                                        />
                                    </td>
                                    <td className="py-2 px-4">
                                        <input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            className="input text-right font-mono"
                                            placeholder="0.00"
                                            value={linea.haber}
                                            onChange={e => actualizarLinea(idx, 'haber', e.target.value)}
                                            onFocus={e => e.target.select()}
                                        />
                                    </td>
                                    <td className="py-2 px-2">
                                        {lineas.length > 2 && (
                                            <button type="button" onClick={() => quitarLinea(idx)} className="p-1 text-slate-300 hover:text-red-500">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                            <tr>
                                <td colSpan={2} className="py-3 px-4 text-right text-sm font-semibold text-slate-700">TOTALES</td>
                                <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">{formatMoneda(totalDebe, sym)}</td>
                                <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">{formatMoneda(totalHaber, sym)}</td>
                                <td />
                            </tr>
                            <tr>
                                <td colSpan={3} className="py-2 px-4 text-right text-xs text-slate-500">Diferencia</td>
                                <td className={cn('py-2 px-4 text-right font-mono text-sm font-semibold', cuadra ? 'text-green-600' : 'text-red-600')}>
                                    {formatMoneda(diferencia, sym)}
                                </td>
                                <td />
                            </tr>
                        </tfoot>
                    </table>
                </div>

                {/* Estado del asiento */}
                <div className="px-6 py-3 border-t bg-slate-50">
                    {cuadra ? (
                        <div className="flex items-center gap-2 text-green-700 text-sm font-medium">
                            <CheckCircle2 className="w-4 h-4" /> Asiento cuadrado — listo para confirmar
                        </div>
                    ) : totalDebe > 0 || totalHaber > 0 ? (
                        <div className="flex items-center gap-2 text-red-600 text-sm font-medium">
                            <AlertCircle className="w-4 h-4" /> El asiento no cuadra. Diferencia: {formatMoneda(diferencia, sym)}
                        </div>
                    ) : null}
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
            )}

            {/* Botones */}
            <div className="flex items-center gap-3 justify-end">
                <button onClick={() => navigate('/comprobantes')} className="btn btn-secondary">Cancelar</button>
                <button onClick={() => guardar(false)} disabled={guardando} className="btn btn-secondary gap-2">
                    {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Guardar borrador
                </button>
                <button onClick={() => guardar(true)} disabled={guardando || !cuadra} className="btn btn-primary gap-2">
                    {guardando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    Confirmar asiento
                </button>
            </div>
        </div>
    )
}
