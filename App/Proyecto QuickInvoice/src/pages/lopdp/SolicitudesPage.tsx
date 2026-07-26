import { useEffect, useRef, useState } from 'react'
import {
    UserCog, Plus, Edit2, Archive, Search, AlertTriangle, Clock,
    CheckCircle2, Download, CalendarClock,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { solicitudesService } from '../../services/lopdp/solicitudesService'
import {
    TIPO_SOLICITUD_LABELS, ESTADO_SOLICITUD_LABELS,
    type SolicitudTitular, type EstadoSolicitud,
} from '../../types/lopdp'
import { SolicitudFormModal } from '../../components/lopdp/SolicitudFormModal'
import { HelpButton } from '../../components/help/HelpButton'

const HOY = () => new Date().toISOString().slice(0, 10)

const ESTADO_BADGE: Record<EstadoSolicitud, string> = {
    pendiente:               'bg-slate-100 text-slate-600',
    en_proceso:              'bg-blue-100 text-blue-700',
    resuelta_a_tiempo:       'bg-green-100 text-green-700',
    resuelta_fuera_de_plazo: 'bg-amber-100 text-amber-700',
    vencida_sin_resolver:    'bg-red-100 text-red-700',
}

function descargarArchivo(nombre: string, contenido: string, tipo: string) {
    const blob = new Blob([contenido], { type: tipo })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nombre
    a.click()
    URL.revokeObjectURL(url)
}

export function SolicitudesPage() {
    const { empresa, user } = useAuth()
    const [solicitudes, setSolicitudes] = useState<SolicitudTitular[]>([])
    const [loading, setLoading] = useState(true)
    const [busqueda, setBusqueda] = useState('')
    const [filtroEstado, setFiltroEstado] = useState<'TODOS' | EstadoSolicitud>('TODOS')

    const [modalAbierto, setModalAbierto] = useState(false)
    const [editando, setEditando] = useState<SolicitudTitular | undefined>(undefined)

    const [modalResolver, setModalResolver] = useState<SolicitudTitular | null>(null)
    const [respuesta, setRespuesta] = useState('')
    const [resolviendo, setResolviendo] = useState(false)

    const [modalProrroga, setModalProrroga] = useState<SolicitudTitular | null>(null)
    const [motivoProrroga, setMotivoProrroga] = useState('')
    const [aplicandoProrroga, setAplicandoProrroga] = useState(false)

    const [refreshKey, setRefreshKey] = useState(0)

    const mountedRef = useRef(true)
    useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

    useEffect(() => {
        if (!empresa?.id) { setLoading(false); return }
        const eid = empresa.id
        let cancelled = false
        setLoading(true)
        solicitudesService.listar(eid)
            .then(data => { if (!cancelled && mountedRef.current) setSolicitudes(data) })
            .catch(() => {})
            .finally(() => { if (!cancelled && mountedRef.current) setLoading(false) })
        return () => { cancelled = true }
    }, [empresa?.id, refreshKey])

    function abrirNuevo() {
        setEditando(undefined)
        setModalAbierto(true)
    }

    function abrirEditar(s: SolicitudTitular) {
        setEditando(s)
        setModalAbierto(true)
    }

    async function handleSave(campos: Partial<SolicitudTitular>) {
        if (!empresa?.id || !user?.id) return
        if (editando) {
            await solicitudesService.actualizar(editando.id, campos, user.id)
        } else {
            await solicitudesService.crear(
                { ...campos, empresa_id: empresa.id } as any,
                user.id
            )
        }
        setRefreshKey(k => k + 1)
    }

    async function handleArchivar(s: SolicitudTitular) {
        if (!user?.id) return
        if (!confirm(`¿Archivar la solicitud de "${s.nombre_titular}"? Queda en el historial de cumplimiento.`)) return
        try {
            await solicitudesService.archivar(s.id, user.id)
            setRefreshKey(k => k + 1)
        } catch (e: any) {
            alert('Error: ' + e.message)
        }
    }

    async function confirmarResolver() {
        if (!modalResolver || !respuesta.trim() || !user?.id) return
        setResolviendo(true)
        try {
            await solicitudesService.marcarResuelta(modalResolver.id, respuesta, user.id)
            setModalResolver(null); setRespuesta('')
            setRefreshKey(k => k + 1)
        } catch (e: any) {
            alert('Error: ' + e.message)
        } finally {
            setResolviendo(false)
        }
    }

    async function confirmarProrroga() {
        if (!modalProrroga || !motivoProrroga.trim() || !user?.id) return
        setAplicandoProrroga(true)
        try {
            await solicitudesService.aplicarProrroga(modalProrroga.id, motivoProrroga, user.id)
            setModalProrroga(null); setMotivoProrroga('')
            setRefreshKey(k => k + 1)
        } catch (e: any) {
            alert('Error: ' + e.message)
        } finally {
            setAplicandoProrroga(false)
        }
    }

    async function handleExportarTitular(s: SolicitudTitular, formato: 'json' | 'csv') {
        if (!empresa?.id) return
        const core = await solicitudesService.buscarDatosCoreDelTitular(empresa.id, s.identificacion_titular ?? '')
        const paquete = {
            solicitud: {
                tipo: TIPO_SOLICITUD_LABELS[s.tipo_solicitud],
                nombre_titular: s.nombre_titular,
                identificacion_titular: s.identificacion_titular,
                email_titular: s.email_titular,
                telefono_titular: s.telefono_titular,
                descripcion: s.descripcion,
                fecha_recepcion: s.fecha_recepcion,
            },
            datos_como_cliente: core.cliente,
            datos_como_proveedor: core.proveedor,
            datos_como_empleado: core.empleado,
        }
        const nombreBase = `titular_${(s.identificacion_titular || s.nombre_titular).replace(/\s+/g, '_')}`

        if (formato === 'json') {
            descargarArchivo(`${nombreBase}.json`, JSON.stringify(paquete, null, 2), 'application/json;charset=utf-8;')
        } else {
            const filas: string[] = ['Sección,Campo,Valor']
            const agregarSeccion = (seccion: string, obj: Record<string, unknown> | null) => {
                if (!obj) { filas.push(`${seccion},(sin datos),`); return }
                Object.entries(obj).forEach(([k, v]) => {
                    const valor = (v ?? '').toString().replace(/"/g, '""')
                    filas.push(`${seccion},${k},"${valor}"`)
                })
            }
            agregarSeccion('Solicitud', paquete.solicitud)
            agregarSeccion('Como cliente', core.cliente)
            agregarSeccion('Como proveedor', core.proveedor)
            agregarSeccion('Como empleado', core.empleado)
            descargarArchivo(`${nombreBase}.csv`, filas.join('\n'), 'text/csv;charset=utf-8;')
        }
    }

    const visibles = solicitudes.filter(s => {
        const matchEstado = filtroEstado === 'TODOS' || s.estado === filtroEstado
        const q = busqueda.toLowerCase()
        const matchQ = !q || s.nombre_titular.toLowerCase().includes(q) || (s.identificacion_titular ?? '').includes(q)
        return matchEstado && matchQ
    })

    const hoy = HOY()
    const porVencer = solicitudes.filter(s =>
        ['pendiente', 'en_proceso'].includes(s.estado) && s.fecha_alerta <= hoy && s.fecha_limite_vigente >= hoy
    ).length
    const vencidas = solicitudes.filter(s => s.estado === 'vencida_sin_resolver').length
    const abiertas = solicitudes.filter(s => ['pendiente', 'en_proceso'].includes(s.estado)).length

    if (loading) return (
        <div className="flex items-center justify-center h-64 text-slate-400">
            Cargando solicitudes ARCO-POL...
        </div>
    )

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Solicitudes ARCO-POL</h1>
                    <p className="text-slate-500 text-sm">{solicitudes.length} solicitudes registradas · Arts. 11-24 LOPDP</p>
                </div>
                <div className="flex items-center gap-2">
                    <HelpButton pageKey="lopdp-solicitudes" />
                    <button onClick={abrirNuevo} className="btn btn-primary flex items-center gap-2">
                        <Plus className="w-4 h-4" /> Nueva Solicitud
                    </button>
                </div>
            </div>

            {/* Indicadores */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="card p-4 flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center shrink-0">
                        <Clock className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-slate-900">{abiertas}</p>
                        <p className="text-xs text-slate-500">Abiertas (pendiente/en proceso)</p>
                    </div>
                </div>
                <div className="card p-4 flex items-center gap-3">
                    <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-slate-900">{porVencer}</p>
                        <p className="text-xs text-slate-500">Por vencer (≤3 días hábiles)</p>
                    </div>
                </div>
                <div className="card p-4 flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-slate-900">{vencidas}</p>
                        <p className="text-xs text-slate-500">Vencidas sin resolver</p>
                    </div>
                </div>
            </div>

            {/* Filtros */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="relative flex-1 min-w-60">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        className="input pl-9 w-full"
                        placeholder="Buscar por nombre o identificación..."
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                    />
                </div>
                <select className="input max-w-xs" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value as any)}>
                    <option value="TODOS">Todos los estados</option>
                    {Object.entries(ESTADO_SOLICITUD_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                    ))}
                </select>
            </div>

            {/* Listado */}
            <div className="space-y-3">
                {visibles.map(s => {
                    const alertaPorVencer = ['pendiente', 'en_proceso'].includes(s.estado) && s.fecha_alerta <= hoy && s.fecha_limite_vigente >= hoy
                    return (
                        <div key={s.id} className="card p-5 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3 min-w-0">
                                    <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                                        <UserCog className="w-5 h-5 text-emerald-600" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-bold text-slate-900">{s.nombre_titular}</p>
                                        <p className="text-sm text-slate-500 mt-0.5">{s.descripcion}</p>
                                        <div className="flex flex-wrap gap-1.5 mt-2 items-center">
                                            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                                                {TIPO_SOLICITUD_LABELS[s.tipo_solicitud]}
                                            </span>
                                            <span className={`text-xs px-2 py-0.5 rounded-full ${ESTADO_BADGE[s.estado]}`}>
                                                {ESTADO_SOLICITUD_LABELS[s.estado]}
                                            </span>
                                            {s.prorroga_aplicada && (
                                                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Con prórroga</span>
                                            )}
                                            {alertaPorVencer && (
                                                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                    <AlertTriangle className="w-3 h-3" /> Por vencer
                                                </span>
                                            )}
                                            <span className="text-xs text-slate-400 flex items-center gap-1">
                                                <CalendarClock className="w-3 h-3" /> Límite: {s.fecha_limite_vigente}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                                    {['pendiente', 'en_proceso'].includes(s.estado) && (
                                        <>
                                            <button onClick={() => setModalResolver(s)} className="text-xs px-3 py-1.5 rounded-lg font-medium text-green-600 hover:bg-green-50 transition-colors">
                                                <CheckCircle2 className="w-3 h-3 mr-1 inline" /> Resolver
                                            </button>
                                            {!s.prorroga_aplicada && (
                                                <button onClick={() => setModalProrroga(s)} className="text-xs px-3 py-1.5 rounded-lg font-medium text-purple-600 hover:bg-purple-50 transition-colors">
                                                    <Clock className="w-3 h-3 mr-1 inline" /> Prórroga
                                                </button>
                                            )}
                                        </>
                                    )}
                                    <button onClick={() => handleExportarTitular(s, 'json')} className="text-xs btn btn-secondary py-1.5 px-3">
                                        <Download className="w-3 h-3 mr-1 inline" /> JSON
                                    </button>
                                    <button onClick={() => handleExportarTitular(s, 'csv')} className="text-xs btn btn-secondary py-1.5 px-3">
                                        <Download className="w-3 h-3 mr-1 inline" /> CSV
                                    </button>
                                    <button onClick={() => abrirEditar(s)} className="text-xs btn btn-secondary py-1.5 px-3">
                                        <Edit2 className="w-3 h-3 mr-1 inline" /> Editar
                                    </button>
                                    <button onClick={() => handleArchivar(s)} className="text-xs px-3 py-1.5 rounded-lg font-medium text-red-600 hover:bg-red-50 transition-colors">
                                        <Archive className="w-3 h-3 mr-1 inline" /> Archivar
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                })}

                {visibles.length === 0 && (
                    <div className="text-center py-16">
                        <UserCog className="w-14 h-14 text-slate-200 mx-auto mb-3" />
                        <p className="text-slate-400">
                            {busqueda ? 'Sin resultados para tu búsqueda' : 'Aún no hay solicitudes registradas'}
                        </p>
                        {!busqueda && (
                            <button onClick={abrirNuevo} className="btn btn-primary mt-4">
                                Registrar Primera Solicitud
                            </button>
                        )}
                    </div>
                )}
            </div>

            {modalAbierto && (
                <SolicitudFormModal
                    solicitud={editando}
                    onSave={handleSave}
                    onClose={() => setModalAbierto(false)}
                />
            )}

            {/* Modal: marcar como resuelta */}
            {modalResolver && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
                        <h3 className="font-bold text-slate-900">Marcar como resuelta</h3>
                        <p className="text-sm text-slate-500">{modalResolver.nombre_titular} — {TIPO_SOLICITUD_LABELS[modalResolver.tipo_solicitud]}</p>
                        <div>
                            <label className="label">Respuesta entregada al titular <span className="text-red-500">*</span></label>
                            <textarea className="input" rows={4} value={respuesta}
                                onChange={e => setRespuesta(e.target.value)}
                                placeholder="Describe qué se le respondió o entregó al titular" />
                        </div>
                        <p className="text-xs text-slate-400">
                            La fecha de hoy queda como fecha de resolución. El sistema determinará automáticamente si fue "a tiempo" o "fuera de plazo" comparando contra la fecha límite vigente ({modalResolver.fecha_limite_vigente}).
                        </p>
                        <div className="flex gap-3 justify-end pt-2">
                            <button className="btn btn-secondary" onClick={() => { setModalResolver(null); setRespuesta('') }}>Cancelar</button>
                            <button className="btn btn-primary" disabled={resolviendo || !respuesta.trim()} onClick={confirmarResolver}>
                                {resolviendo ? 'Guardando...' : 'Confirmar resolución'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: aplicar prórroga */}
            {modalProrroga && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
                        <h3 className="font-bold text-slate-900">Aplicar prórroga de 10 días hábiles</h3>
                        <p className="text-sm text-slate-500">{modalProrroga.nombre_titular} — {TIPO_SOLICITUD_LABELS[modalProrroga.tipo_solicitud]}</p>
                        <div>
                            <label className="label">Motivo de la prórroga <span className="text-red-500">*</span></label>
                            <textarea className="input" rows={3} value={motivoProrroga}
                                onChange={e => setMotivoProrroga(e.target.value)}
                                placeholder="¿Por qué se necesita más tiempo para resolver esta solicitud?" />
                        </div>
                        <p className="text-xs text-slate-400">
                            La nueva fecha límite pasará de {modalProrroga.fecha_limite} a {modalProrroga.fecha_limite_prorroga}.
                        </p>
                        <div className="flex gap-3 justify-end pt-2">
                            <button className="btn btn-secondary" onClick={() => { setModalProrroga(null); setMotivoProrroga('') }}>Cancelar</button>
                            <button className="btn btn-primary" disabled={aplicandoProrroga || !motivoProrroga.trim()} onClick={confirmarProrroga}>
                                {aplicandoProrroga ? 'Guardando...' : 'Aplicar prórroga'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
