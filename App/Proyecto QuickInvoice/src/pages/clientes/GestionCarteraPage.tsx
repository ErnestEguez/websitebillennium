import { useState, useEffect, useCallback, useRef } from 'react'
import { useReactToPrint } from 'react-to-print'
import {
    Search, RefreshCw, Download, Printer, Phone, Mail, MessageCircle,
    ClipboardList, X, Save, Loader2,
    Users, BarChart3, Info,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { formatMoneda } from '../../lib/utils'
import { cn } from '../../lib/utils'
import {
    carteraGestionService,
    generarLinkWA,
    CANAL_LABEL, ESTADO_LABEL,
    type FilaCartera, type GestionHistorial, type KPIsCartera,
    type CanalGestion, type EstadoGestion, type CarteraConfig,
} from '../../services/carteraGestionService'

// ─── helpers ─────────────────────────────────────────────────────────────────

function hoy() { return new Date().toISOString().split('T')[0] }

function fmtFecha(iso: string | null) {
    if (!iso) return '—'
    return new Date(iso + 'T12:00:00').toLocaleDateString('es-EC', { day:'2-digit', month:'2-digit', year:'numeric' })
}

const SEMAFORO_COLORES = {
    verde:    { dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
    amarillo: { dot: 'bg-amber-400',   text: 'text-amber-700',   bg: 'bg-amber-50'   },
    rojo:     { dot: 'bg-red-500',     text: 'text-red-700',     bg: 'bg-red-50'     },
    negro:    { dot: 'bg-gray-700',    text: 'text-gray-700',    bg: 'bg-gray-100'   },
}

const SCORE_COLORES: Record<string, { badge: string }> = {
    buen_pagador: { badge: 'bg-emerald-100 text-emerald-700' },
    irregular:    { badge: 'bg-amber-100 text-amber-700'     },
    alto_riesgo:  { badge: 'bg-red-100 text-red-700'         },
    incobrable:   { badge: 'bg-gray-100 text-gray-700'       },
}

const SCORE_LABEL: Record<string, string> = {
    buen_pagador: 'Buen pagador', irregular: 'Irregular',
    alto_riesgo: 'Alto riesgo', incobrable: 'Incobrable',
}

// ─── Semáforo Badge ───────────────────────────────────────────────────────────

function SemaforoBadge({ s, dias }: { s: FilaCartera['semaforo']; dias: number }) {
    const c = SEMAFORO_COLORES[s]
    return (
        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold', c.bg, c.text)}>
            <span className={cn('w-2 h-2 rounded-full', c.dot)} />
            {dias > 0 ? `${dias}d` : dias < 0 ? `${Math.abs(dias)}d` : 'Hoy'}
        </span>
    )
}

// ─── Drawer de Gestión ───────────────────────────────────────────────────────

interface DrawerGestionProps {
    fila: FilaCartera
    empresaId: string
    userId: string
    userName: string
    config: CarteraConfig
    empresaNombre: string
    onClose: () => void
    onSaved: () => void
}

function DrawerGestion({ fila, empresaId, userId, userName, config, empresaNombre, onClose, onSaved }: DrawerGestionProps) {
    const [gestiones, setGestiones] = useState<GestionHistorial[]>([])
    const [loading, setLoading]     = useState(true)
    const [saving, setSaving]       = useState(false)
    const [err, setErr]             = useState('')
    const [tab, setTab]             = useState<'historial' | 'nueva'>('historial')

    // form nueva gestión
    const [canal, setCanal]               = useState<CanalGestion>('llamada')
    const [obs, setObs]                   = useState('')
    const [estado, setEstado]             = useState<EstadoGestion>('en_negociacion')
    const [proxGest, setProxGest]         = useState('')
    const [tienePromesa, setTienePromesa] = useState(false)
    const [promFecha, setPromFecha]       = useState('')
    const [promMonto, setPromMonto]       = useState('')
    const [scoreBadge, setScoreBadge]     = useState<{score:number;clasificacion:string}|null>(null)
    const [nivelWA, setNivelWA]           = useState<'1'|'2'|'judicial'>('1')
    const printRef = useRef<HTMLDivElement>(null)
    const handlePrint = useReactToPrint({ contentRef: printRef, documentTitle: `Carta_${fila.secuencial}` })

    useEffect(() => {
        carteraGestionService.getGestiones(fila.id).then(g => { setGestiones(g); setLoading(false) })
        carteraGestionService.recalcularScore(empresaId, fila.cliente_id)
            .then(r => setScoreBadge(r)).catch(() => {})
    }, [fila.id])

    async function handleGuardar() {
        if (!obs.trim()) { setErr('Ingrese una observación'); return }
        setSaving(true); setErr('')
        try {
            await carteraGestionService.registrarGestion({
                cartera_id: fila.id, empresa_id: empresaId,
                usuario_id: userId, usuario_nombre: userName,
                fecha_gestion: hoy(), canal, observacion: obs.trim(),
                estado_gestion: estado, proxima_gestion: proxGest || null,
                promesa_fecha: tienePromesa ? promFecha || null : null,
                promesa_monto: tienePromesa ? parseFloat(promMonto) || null : null,
            })
            const gs = await carteraGestionService.getGestiones(fila.id)
            setGestiones(gs); setTab('historial'); setObs(''); setTienePromesa(false)
            onSaved()
        } catch (e: any) { setErr(e.message) } finally { setSaving(false) }
    }

    const plantillaWA = nivelWA === '1' ? config.plantilla_wa_1 : nivelWA === '2' ? config.plantilla_wa_2 : config.plantilla_wa_judicial
    const waLink = generarLinkWA(fila.cliente_telefono, plantillaWA, {
        nombre: fila.cliente_nombre, factura: fila.secuencial,
        monto: formatMoneda(fila.saldo), vencimiento: fmtFecha(fila.fecha_vencimiento),
        dias: String(fila.dias), telefono_empresa: '',
    })

    return (
        <div className="fixed inset-0 z-40 flex justify-end">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="relative w-full max-w-2xl bg-white h-full flex flex-col shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b bg-slate-50 flex-shrink-0">
                    <div>
                        <h2 className="font-bold text-slate-900 text-lg">{fila.cliente_nombre}</h2>
                        <p className="text-sm text-slate-500">Fac. {fila.secuencial} · Saldo: <span className="font-semibold text-red-600">{formatMoneda(fila.saldo)}</span></p>
                    </div>
                    <div className="flex items-center gap-2">
                        {scoreBadge && (
                            <span className={cn('text-xs px-2 py-1 rounded-full font-semibold', SCORE_COLORES[scoreBadge.clasificacion]?.badge)}>
                                Score {scoreBadge.score} · {SCORE_LABEL[scoreBadge.clasificacion]}
                            </span>
                        )}
                        <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg">
                            <X className="w-5 h-5 text-slate-500" />
                        </button>
                    </div>
                </div>

                {/* Info rápida */}
                <div className="grid grid-cols-3 gap-0 border-b flex-shrink-0 text-xs">
                    {[
                        { label: 'Vencimiento', value: fmtFecha(fila.fecha_vencimiento) },
                        { label: 'Días vencida', value: fila.dias > 0 ? `${fila.dias} días` : 'Por vencer' },
                        { label: 'Valor original', value: formatMoneda(fila.valor_original) },
                    ].map(x => (
                        <div key={x.label} className="px-4 py-2.5 border-r last:border-r-0">
                            <p className="text-slate-400 uppercase tracking-wide" style={{fontSize:'10px'}}>{x.label}</p>
                            <p className="font-semibold text-slate-700 mt-0.5">{x.value}</p>
                        </div>
                    ))}
                </div>

                {/* Acciones rápidas */}
                <div className="flex gap-2 px-4 py-3 border-b bg-slate-50 flex-shrink-0 flex-wrap">
                    {/* WhatsApp */}
                    <div className="flex items-center gap-1">
                        <select value={nivelWA} onChange={e => setNivelWA(e.target.value as any)}
                            className="text-xs px-2 py-1.5 border border-slate-200 rounded-l-lg bg-white">
                            <option value="1">1er Aviso</option>
                            <option value="2">2do Aviso</option>
                            <option value="judicial">Prejudicial</option>
                        </select>
                        {waLink
                            ? <a href={waLink} target="_blank" rel="noreferrer"
                                className="flex items-center gap-1 text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-r-lg hover:bg-emerald-700">
                                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                              </a>
                            : <span className="text-xs px-3 py-1.5 bg-slate-200 text-slate-400 rounded-r-lg">Sin teléfono</span>
                        }
                    </div>
                    {fila.cliente_email && (
                        <a href={`mailto:${fila.cliente_email}?subject=Estado de Cuenta — Factura ${fila.secuencial}&body=Estimado/a ${fila.cliente_nombre},%0D%0A%0D%0ASaldo pendiente: ${formatMoneda(fila.saldo)}%0D%0AFecha vencimiento: ${fmtFecha(fila.fecha_vencimiento)}`}
                            className="flex items-center gap-1 text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50">
                            <Mail className="w-3.5 h-3.5" /> Email
                        </a>
                    )}
                    <button onClick={() => handlePrint()}
                        className="flex items-center gap-1 text-xs px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50">
                        <Printer className="w-3.5 h-3.5" /> Carta
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b flex-shrink-0">
                    {[['historial', 'Historial'], ['nueva', 'Nueva Gestión']].map(([key, label]) => (
                        <button key={key} onClick={() => setTab(key as any)}
                            className={cn('px-5 py-2.5 text-sm font-medium border-b-2 transition-colors',
                                tab === key ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-700')}>
                            {label}
                        </button>
                    ))}
                </div>

                {/* Contenido */}
                <div className="flex-1 overflow-y-auto">
                    {/* Tab: Historial */}
                    {tab === 'historial' && (
                        <div className="p-5">
                            {loading && <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>}
                            {!loading && gestiones.length === 0 && (
                                <div className="text-center py-12 text-slate-400">
                                    <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                    <p>Sin gestiones registradas.<br/>Haz click en "Nueva Gestión" para comenzar.</p>
                                </div>
                            )}
                            <div className="space-y-3">
                                {gestiones.map((g, i) => (
                                    <div key={g.id} className="relative pl-6">
                                        {i < gestiones.length - 1 && (
                                            <div className="absolute left-2 top-5 bottom-0 w-0.5 bg-slate-200" />
                                        )}
                                        <div className="absolute left-0 top-1.5 w-4 h-4 rounded-full bg-primary-100 border-2 border-primary-400 flex-shrink-0" />
                                        <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200">
                                            <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-slate-500">{fmtFecha(g.fecha_gestion)}</span>
                                                    <span className="text-xs px-2 py-0.5 bg-slate-200 text-slate-600 rounded-full">{CANAL_LABEL[g.canal]}</span>
                                                </div>
                                                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', {
                                                    'bg-slate-100 text-slate-600': g.estado_gestion === 'sin_gestionar',
                                                    'bg-blue-100 text-blue-700':   g.estado_gestion === 'en_negociacion',
                                                    'bg-amber-100 text-amber-700': g.estado_gestion === 'promesa_pago',
                                                    'bg-emerald-100 text-emerald-700': g.estado_gestion === 'acuerdo_pago',
                                                    'bg-red-100 text-red-700':     g.estado_gestion === 'incobrable',
                                                    'bg-purple-100 text-purple-700': g.estado_gestion === 'pagada',
                                                })}>
                                                    {ESTADO_LABEL[g.estado_gestion]}
                                                </span>
                                            </div>
                                            {g.observacion && <p className="text-sm text-slate-700">{g.observacion}</p>}
                                            {g.promesa_fecha && (
                                                <p className="text-xs text-amber-600 mt-1">
                                                    💰 Promesa {formatMoneda(g.promesa_monto ?? 0)} para {fmtFecha(g.promesa_fecha)}
                                                    {g.promesa_cumplida !== null && (
                                                        <span className={cn('ml-2', g.promesa_cumplida ? 'text-emerald-600' : 'text-red-500')}>
                                                            {g.promesa_cumplida ? '✓ Cumplida' : '✗ Incumplida'}
                                                        </span>
                                                    )}
                                                </p>
                                            )}
                                            {g.proxima_gestion && (
                                                <p className="text-xs text-blue-600 mt-1">
                                                    📅 Próxima gestión: {fmtFecha(g.proxima_gestion)}
                                                </p>
                                            )}
                                            <p className="text-xs text-slate-400 mt-1.5">{g.usuario_nombre ?? '—'}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Tab: Nueva Gestión */}
                    {tab === 'nueva' && (
                        <div className="p-5 space-y-4">
                            {/* Canal */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1.5">Canal de contacto</label>
                                <div className="flex flex-wrap gap-2">
                                    {(Object.entries(CANAL_LABEL) as [CanalGestion, string][]).map(([k, l]) => (
                                        <button key={k} onClick={() => setCanal(k)}
                                            className={cn('px-3 py-1.5 text-xs rounded-lg border transition-colors',
                                                canal === k ? 'bg-primary-600 text-white border-primary-600' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
                                            {l}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Estado */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Estado resultante</label>
                                <select value={estado} onChange={e => setEstado(e.target.value as EstadoGestion)}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none">
                                    {(Object.entries(ESTADO_LABEL) as [EstadoGestion, string][]).map(([k, l]) => (
                                        <option key={k} value={k}>{l}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Observación */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Observación *</label>
                                <textarea rows={3} value={obs} onChange={e => setObs(e.target.value)}
                                    placeholder="Detalle de la gestión realizada..."
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-primary-500 outline-none" />
                            </div>

                            {/* Próxima gestión */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 mb-1">Próxima fecha de seguimiento</label>
                                <input type="date" value={proxGest} onChange={e => setProxGest(e.target.value)}
                                    min={hoy()}
                                    className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                            </div>

                            {/* Promesa de pago */}
                            <div className="border border-amber-200 rounded-xl p-4 bg-amber-50">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="checkbox" checked={tienePromesa} onChange={e => setTienePromesa(e.target.checked)} />
                                    <span className="text-sm font-medium text-amber-800">¿Hubo promesa de pago?</span>
                                </label>
                                {tienePromesa && (
                                    <div className="mt-3 grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs text-amber-700 mb-1">Fecha de pago comprometida</label>
                                            <input type="date" value={promFecha} onChange={e => setPromFecha(e.target.value)} min={hoy()}
                                                className="w-full px-2 py-1.5 border border-amber-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 outline-none bg-white" />
                                        </div>
                                        <div>
                                            <label className="block text-xs text-amber-700 mb-1">Monto comprometido</label>
                                            <input type="number" step="0.01" value={promMonto} onChange={e => setPromMonto(e.target.value)}
                                                placeholder={String(fila.saldo)}
                                                className="w-full px-2 py-1.5 border border-amber-200 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 outline-none bg-white" />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {err && <p className="text-red-600 text-sm">{err}</p>}

                            <button onClick={handleGuardar} disabled={saving}
                                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 font-medium">
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Guardar Gestión
                            </button>
                        </div>
                    )}
                </div>

                {/* Carta imprimible */}
                <div className="hidden print:block" ref={printRef}>
                    <style>{`@media print{body{font-family:Arial;font-size:10px}h1{font-size:16px}h2{font-size:13px}}`}</style>
                    <p style={{textAlign:'right'}}>{fmtFecha(hoy())}</p>
                    <h1>{empresaNombre}</h1>
                    <br/>
                    <p><strong>Señor/a:</strong> {fila.cliente_nombre}</p>
                    <p><strong>RUC/CI:</strong> {fila.cliente_identificacion}</p>
                    <br/>
                    <h2>NOTIFICACIÓN DE SALDO PENDIENTE</h2>
                    <br/>
                    <p>Por medio de la presente, nos dirigimos a usted para informarle que registra en nuestros libros contables un saldo pendiente de pago por la suma de <strong>{formatMoneda(fila.saldo)}</strong> correspondiente a la Factura N° <strong>{fila.secuencial}</strong>, con fecha de emisión {fmtFecha(fila.fecha_emision)} y vencimiento el {fmtFecha(fila.fecha_vencimiento)}, con <strong>{fila.dias} días de vencida</strong>.</p>
                    <br/>
                    <p>Por tal motivo, le solicitamos muy comedidamente se acerque a nuestras instalaciones o se comunique con nosotros para regularizar su obligación pendiente a la brevedad posible.</p>
                    <br/>
                    <p>En caso de haber realizado el pago, le rogamos hacer caso omiso del presente aviso.</p>
                    <br/><br/><br/>
                    <p>________________________</p>
                    <p><strong>{config.plantilla_carta_firma}</strong></p>
                    <p>{empresaNombre}</p>
                </div>
            </div>
        </div>
    )
}

// ─── KPI Cards ───────────────────────────────────────────────────────────────

function KPICard({ label, value, color, tooltip }: {
    label: string; value: string; color: string; tooltip?: string
}) {
    const [showTip, setShowTip] = useState(false)
    return (
        <div className="bg-white rounded-xl border border-slate-200 p-4 relative">
            <div className="flex items-center justify-between mb-1">
                <span className={cn('text-xs font-semibold uppercase tracking-wide', color)}>{label}</span>
                {tooltip && (
                    <button onMouseEnter={() => setShowTip(true)} onMouseLeave={() => setShowTip(false)}
                        className="text-slate-300 hover:text-slate-500">
                        <Info className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>
            <p className={cn('text-2xl font-bold font-mono', color)}>{value}</p>
            {showTip && tooltip && (
                <div className="absolute top-full left-0 mt-1 z-10 w-64 text-xs bg-slate-800 text-white p-2.5 rounded-xl shadow-xl">
                    {tooltip}
                </div>
            )}
        </div>
    )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export function GestionCarteraPage() {
    const { empresa, user, profile } = useAuth()

    // Filtros
    const [fechaCorte, setFechaCorte]     = useState(hoy())
    const [vendedorId, setVendedorId]     = useState('')
    const [vendedores, setVendedores]     = useState<{id:string;nombre:string}[]>([])
    const [estadoFiltro, setEstadoFiltro] = useState<'todas'|'vencidas'|'por_vencer'>('todas')
    const [antigFiltro]                   = useState<'normal'|'mayor1anio'|'todas'>('todas')
    const [clienteQ, setClienteQ]         = useState('')
    const [tabAntiguedad, setTabAntiguedad] = useState<'todas'|'normal'|'mayor1anio'>('todas')

    // Datos
    const [filas, setFilas]       = useState<FilaCartera[]>([])
    const [kpis, setKpis]         = useState<KPIsCartera | null>(null)
    const [config, setConfig]     = useState<CarteraConfig | null>(null)
    const [loading, setLoading]   = useState(false)

    // UI
    const [drawerFila, setDrawerFila]   = useState<FilaCartera | null>(null)
    const [agingLoading, setAgingLoading] = useState(false)
    const printRef = useRef<HTMLDivElement>(null)
    const handlePrint = useReactToPrint({ contentRef: printRef, documentTitle: `Cartera_${fechaCorte}` })

    useEffect(() => {
        if (!empresa?.id) return
        supabase.from('vendedores').select('id, nombre').eq('empresa_id', empresa.id).eq('estado', 'activo').order('nombre')
            .then(({ data }) => setVendedores(data ?? []))
        carteraGestionService.getConfig(empresa.id).then(c => setConfig(c))
    }, [empresa?.id])

    const consultar = useCallback(async () => {
        if (!empresa?.id) return
        setLoading(true)
        try {
            const [fs, ks] = await Promise.all([
                carteraGestionService.getCartera(empresa.id, {
                    fechaCorte, vendedorId: vendedorId || undefined,
                    clienteQ: clienteQ || undefined,
                    estado: estadoFiltro, antiguedad: antigFiltro,
                }),
                carteraGestionService.getKPIs(empresa.id, fechaCorte),
            ])
            setFilas(fs); setKpis(ks)
        } finally { setLoading(false) }
    }, [empresa?.id, fechaCorte, vendedorId, clienteQ, estadoFiltro, antigFiltro])

    useEffect(() => { consultar() }, [])

    // Filtro de tab antigüedad
    const filasFiltradas = filas.filter(f => {
        if (tabAntiguedad === 'normal')      return f.dias <= 365
        if (tabAntiguedad === 'mayor1anio')  return f.dias > 365
        return true
    })

    async function exportarAging() {
        if (!empresa?.id) return
        setAgingLoading(true)
        try {
            const rows = await carteraGestionService.getAgingData(empresa.id, fechaCorte)
            carteraGestionService.exportarAgingExcel(rows, (empresa as any).nombre ?? '', fechaCorte)
        } finally { setAgingLoading(false) }
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <Users className="w-6 h-6 text-primary-600" /> Gestión de Cartera
                    </h1>
                    <p className="text-slate-500 text-sm mt-0.5">Control de cuentas por cobrar y cobros</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                    <button onClick={exportarAging} disabled={agingLoading}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">
                        {agingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4" />} Aging
                    </button>
                    <button onClick={() => carteraGestionService.exportarCarteraExcel(filasFiltradas, (empresa as any)?.nombre ?? '', fechaCorte)}
                        disabled={filasFiltradas.length === 0}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40">
                        <Download className="w-4 h-4" /> Excel
                    </button>
                    <button onClick={() => handlePrint()} disabled={filasFiltradas.length === 0}
                        className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40">
                        <Printer className="w-4 h-4" /> Imprimir
                    </button>
                </div>
            </div>

            {/* Filtros */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                    {/* Buscador cliente */}
                    <div className="md:col-span-2 relative">
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Cliente</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input type="text" placeholder="Nombre, RUC o cédula..."
                                value={clienteQ} onChange={e => setClienteQ(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                        </div>
                    </div>
                    {/* Vendedor */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Vendedor</label>
                        <select value={vendedorId} onChange={e => setVendedorId(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none">
                            <option value="">Todos</option>
                            {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                        </select>
                    </div>
                    {/* Estado */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Estado</label>
                        <select value={estadoFiltro} onChange={e => setEstadoFiltro(e.target.value as any)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-primary-500 outline-none">
                            <option value="todas">Todas</option>
                            <option value="vencidas">Vencidas</option>
                            <option value="por_vencer">Por Vencer</option>
                        </select>
                    </div>
                    {/* Fecha de corte */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Fecha de corte</label>
                        <input type="date" value={fechaCorte} onChange={e => setFechaCorte(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                    </div>
                    <button onClick={consultar} disabled={loading}
                        className="flex items-center justify-center gap-2 py-2 px-4 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        Buscar
                    </button>
                </div>
            </div>

            {/* KPIs */}
            {kpis && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <KPICard label="Total Cartera" value={formatMoneda(kpis.total_cartera)} color="text-primary-700" />
                    <KPICard label="Vencido" value={formatMoneda(kpis.total_vencido)} color="text-red-700" />
                    <KPICard label="Por Vencer" value={formatMoneda(kpis.total_por_vencer)} color="text-emerald-700" />
                    <KPICard label="Clientes mora" value={String(kpis.clientes_mora)} color="text-amber-700" />
                    <KPICard label="Prom. días mora" value={`${kpis.promedio_dias_mora}d`} color="text-orange-700" />
                    <KPICard label="Rotación cartera" value={`${kpis.rotacion_dias}d`} color="text-violet-700"
                        tooltip={`Rotación de cartera: cuántos días en promedio tarda en cobrar sus ventas. Calculado como (CxC pendiente ÷ ventas últimos 30 días) × 30. Menor es mejor.`} />
                </div>
            )}

            {/* Tabs antigüedad */}
            <div className="flex gap-1 border-b border-slate-200">
                {([['todas','Toda la cartera'],['normal','0 – 365 días'],['mayor1anio','Más de 1 año']] as [string,string][]).map(([k,l]) => (
                    <button key={k} onClick={() => setTabAntiguedad(k as any)}
                        className={cn('px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                            tabAntiguedad === k ? 'border-primary-600 text-primary-700' : 'border-transparent text-slate-500 hover:text-slate-700')}>
                        {l}
                        <span className="ml-2 text-xs text-slate-400">
                            ({k === 'todas' ? filas.length : k === 'normal' ? filas.filter(f=>f.dias<=365).length : filas.filter(f=>f.dias>365).length})
                        </span>
                    </button>
                ))}
            </div>

            {/* Tabla */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-xs uppercase text-slate-500 border-b border-slate-200">
                            <tr>
                                <th className="w-4 px-3 py-3"></th>
                                <th className="px-4 py-3 text-left">No. Factura</th>
                                <th className="px-4 py-3 text-left">Cliente</th>
                                <th className="px-4 py-3 text-left">Teléfono</th>
                                <th className="px-4 py-3 text-left">Emisión</th>
                                <th className="px-4 py-3 text-left">Vencimiento</th>
                                <th className="px-4 py-3 text-center">Días</th>
                                <th className="px-4 py-3 text-right">Saldo</th>
                                <th className="px-4 py-3 text-left">Estado gestión</th>
                                <th className="px-4 py-3 text-left">Próx. gestión</th>
                                <th className="px-4 py-3 text-left">Score</th>
                                <th className="px-4 py-3 text-left">Vendedor</th>
                                <th className="px-4 py-3 text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {loading && (
                                <tr><td colSpan={13} className="py-12 text-center text-slate-400">
                                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Cargando...
                                </td></tr>
                            )}
                            {!loading && filasFiltradas.length === 0 && (
                                <tr><td colSpan={13} className="py-12 text-center text-slate-400">
                                    <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                    Sin cartera pendiente con los filtros seleccionados.
                                </td></tr>
                            )}
                            {filasFiltradas.map(f => {
                                const sc = SEMAFORO_COLORES[f.semaforo]
                                return (
                                    <tr key={f.id} className={cn('hover:bg-slate-50', f.bloqueo_credito && 'opacity-60')}>
                                        <td className="px-3 py-3">
                                            <div className={cn('w-3 h-3 rounded-full mx-auto', sc.dot)} title={f.semaforo} />
                                        </td>
                                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{f.secuencial}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-medium text-slate-800 max-w-[140px] truncate">{f.cliente_nombre}</span>
                                                {f.bloqueo_credito && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-semibold">🚫</span>}
                                            </div>
                                            <p className="text-xs text-slate-400">{f.cliente_identificacion}</p>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-slate-500">
                                            {f.cliente_telefono
                                                ? <a href={`tel:${f.cliente_telefono}`} className="hover:text-primary-600 flex items-center gap-1">
                                                    <Phone className="w-3 h-3" />{f.cliente_telefono}
                                                  </a>
                                                : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-slate-500">{fmtFecha(f.fecha_emision)}</td>
                                        <td className="px-4 py-3 text-xs text-slate-500">{fmtFecha(f.fecha_vencimiento)}</td>
                                        <td className="px-4 py-3 text-center">
                                            <SemaforoBadge s={f.semaforo} dias={f.dias} />
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                                            {formatMoneda(f.saldo)}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', {
                                                'bg-slate-100 text-slate-600': f.estado_gestion === 'sin_gestionar',
                                                'bg-blue-100 text-blue-700':   f.estado_gestion === 'en_negociacion',
                                                'bg-amber-100 text-amber-700': f.estado_gestion === 'promesa_pago',
                                                'bg-emerald-100 text-emerald-700': f.estado_gestion === 'acuerdo_pago',
                                                'bg-red-100 text-red-700':     f.estado_gestion === 'incobrable',
                                            })}>
                                                {ESTADO_LABEL[f.estado_gestion]}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-slate-500">
                                            {f.proxima_gestion ? fmtFecha(f.proxima_gestion) : '—'}
                                        </td>
                                        <td className="px-4 py-3">
                                            {f.score !== null
                                                ? <span className={cn('text-xs px-2 py-0.5 rounded-full font-semibold',
                                                    f.score >= 80 ? 'bg-emerald-100 text-emerald-700'
                                                    : f.score >= 50 ? 'bg-amber-100 text-amber-700'
                                                    : f.score >= 20 ? 'bg-red-100 text-red-700'
                                                    : 'bg-gray-100 text-gray-700'
                                                  )}>
                                                    {f.score}
                                                  </span>
                                                : <span className="text-xs text-slate-300">—</span>
                                            }
                                        </td>
                                        <td className="px-4 py-3 text-xs text-slate-500">{f.vendedor_nombre ?? '—'}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1 justify-center">
                                                <button onClick={() => setDrawerFila(f)}
                                                    title="Registrar gestión"
                                                    className="p-1.5 hover:bg-primary-100 hover:text-primary-700 rounded-lg text-slate-400 transition-colors">
                                                    <ClipboardList className="w-4 h-4" />
                                                </button>
                                                {f.cliente_telefono && config && (
                                                    <a href={generarLinkWA(f.cliente_telefono, config.plantilla_wa_1, {
                                                        nombre: f.cliente_nombre, factura: f.secuencial,
                                                        monto: formatMoneda(f.saldo), vencimiento: fmtFecha(f.fecha_vencimiento),
                                                        dias: String(f.dias), telefono_empresa: '',
                                                    }) ?? '#'} target="_blank" rel="noreferrer"
                                                        title="WhatsApp"
                                                        className="p-1.5 hover:bg-emerald-100 hover:text-emerald-700 rounded-lg text-slate-400 transition-colors">
                                                        <MessageCircle className="w-4 h-4" />
                                                    </a>
                                                )}
                                                {f.cliente_email && (
                                                    <a href={`mailto:${f.cliente_email}`} title="Email"
                                                        className="p-1.5 hover:bg-blue-100 hover:text-blue-700 rounded-lg text-slate-400 transition-colors">
                                                        <Mail className="w-4 h-4" />
                                                    </a>
                                                )}
                                                {f.cliente_telefono && (
                                                    <a href={`tel:${f.cliente_telefono}`} title="Llamar"
                                                        className="p-1.5 hover:bg-violet-100 hover:text-violet-700 rounded-lg text-slate-400 transition-colors">
                                                        <Phone className="w-4 h-4" />
                                                    </a>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                        {filasFiltradas.length > 0 && (
                            <tfoot className="bg-slate-100 border-t-2 border-slate-300 font-bold text-sm">
                                <tr>
                                    <td colSpan={7} className="px-4 py-3 text-right text-slate-600">
                                        {filasFiltradas.length} documento(s)
                                    </td>
                                    <td className="px-4 py-3 text-right font-mono text-red-700">
                                        {formatMoneda(filasFiltradas.reduce((s,f)=>s+f.saldo,0))}
                                    </td>
                                    <td colSpan={5}></td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>

            {/* Drawer de gestión */}
            {drawerFila && config && (
                <DrawerGestion
                    fila={drawerFila}
                    empresaId={empresa!.id}
                    userId={user!.id}
                    userName={profile?.nombre || user?.email || ''}
                    config={config}
                    empresaNombre={(empresa as any)?.nombre ?? ''}
                    onClose={() => setDrawerFila(null)}
                    onSaved={() => consultar()}
                />
            )}

            {/* Zona de impresión */}
            <div className="hidden print:block" ref={printRef}>
                <style>{`@media print{body{font-family:Arial;font-size:9px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:3px 6px}th{background:#f0f0f0;font-weight:bold}}`}</style>
                <h1 style={{fontSize:'15px'}}>{(empresa as any)?.nombre}</h1>
                <p><strong>CARTERA PENDIENTE</strong> — Fecha de corte: {fmtFecha(fechaCorte)}</p>
                <br/>
                <table>
                    <thead><tr><th>Factura</th><th>Cliente</th><th>Vencimiento</th><th>Días</th><th style={{textAlign:'right'}}>Saldo</th><th>Estado Gestión</th><th>Próx. Gestión</th></tr></thead>
                    <tbody>
                        {filasFiltradas.map(f=>(
                            <tr key={f.id}>
                                <td>{f.secuencial}</td>
                                <td>{f.cliente_nombre}</td>
                                <td>{fmtFecha(f.fecha_vencimiento)}</td>
                                <td style={{textAlign:'center'}}>{f.dias}</td>
                                <td style={{textAlign:'right',fontWeight:'bold'}}>{formatMoneda(f.saldo)}</td>
                                <td>{ESTADO_LABEL[f.estado_gestion]}</td>
                                <td>{f.proxima_gestion ? fmtFecha(f.proxima_gestion) : '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr><td colSpan={4} style={{textAlign:'right',fontWeight:'bold'}}>TOTAL</td>
                            <td style={{textAlign:'right',fontWeight:'bold'}}>{formatMoneda(filasFiltradas.reduce((s,f)=>s+f.saldo,0))}</td>
                            <td colSpan={2}></td></tr>
                    </tfoot>
                </table>
            </div>
        </div>
    )
}
