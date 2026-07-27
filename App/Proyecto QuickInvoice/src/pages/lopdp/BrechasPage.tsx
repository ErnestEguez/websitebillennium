import { useEffect, useRef, useState } from 'react'
import { AlertOctagon, Plus, Archive, Send, CalendarClock } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { brechasService, generarPlantillaNotificacion } from '../../services/lopdp/brechasService'
import {
    SEVERIDAD_BRECHA_LABELS, ESTADO_NOTIFICACION_LABELS,
    type BrechaSeguridad, type EstadoSolicitud,
} from '../../types/lopdp'
import { BrechaFormModal } from '../../components/lopdp/BrechaFormModal'
import { HelpButton } from '../../components/help/HelpButton'

const HOY = () => new Date().toISOString().slice(0, 10)

const ESTADO_BADGE: Record<EstadoSolicitud, string> = {
    pendiente:               'bg-slate-100 text-slate-600',
    en_proceso:              'bg-blue-100 text-blue-700',
    resuelta_a_tiempo:       'bg-green-100 text-green-700',
    resuelta_fuera_de_plazo: 'bg-amber-100 text-amber-700',
    vencida_sin_resolver:    'bg-red-100 text-red-700',
}

const SEVERIDAD_BADGE: Record<string, string> = {
    bajo: 'bg-slate-100 text-slate-600',
    medio: 'bg-amber-100 text-amber-700',
    alto: 'bg-red-100 text-red-700',
}

export function BrechasPage() {
    const { empresa, user } = useAuth()
    const [brechas, setBrechas] = useState<BrechaSeguridad[]>([])
    const [loading, setLoading] = useState(true)
    const [modalAbierto, setModalAbierto] = useState(false)
    const [refreshKey, setRefreshKey] = useState(0)

    const [modalNotificar, setModalNotificar] = useState<{ brecha: BrechaSeguridad; tipo: 'spdp' | 'titulares' } | null>(null)
    const [textoNotificacion, setTextoNotificacion] = useState('')
    const [notificando, setNotificando] = useState(false)

    const mountedRef = useRef(true)
    useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

    useEffect(() => {
        if (!empresa?.id) { setLoading(false); return }
        const eid = empresa.id
        let cancelled = false
        setLoading(true)
        brechasService.listar(eid)
            .then(data => { if (!cancelled && mountedRef.current) setBrechas(data) })
            .catch(() => {})
            .finally(() => { if (!cancelled && mountedRef.current) setLoading(false) })
        return () => { cancelled = true }
    }, [empresa?.id, refreshKey])

    async function handleSave(campos: Partial<BrechaSeguridad>) {
        if (!empresa?.id || !user?.id) return
        await brechasService.crear({ ...campos, empresa_id: empresa.id } as any, user.id)
        setRefreshKey(k => k + 1)
    }

    async function handleArchivar(b: BrechaSeguridad) {
        if (!user?.id) return
        if (!confirm('¿Archivar este incidente? Queda en el historial de cumplimiento.')) return
        try {
            await brechasService.archivar(b.id, user.id)
            setRefreshKey(k => k + 1)
        } catch (e: any) {
            alert('Error: ' + e.message)
        }
    }

    function abrirNotificar(brecha: BrechaSeguridad, tipo: 'spdp' | 'titulares') {
        setTextoNotificacion(brecha.plantilla_notificacion || generarPlantillaNotificacion({
            empresaNombre: empresa?.nombre ?? '',
            descripcion: brecha.descripcion,
            fechaDeteccion: brecha.fecha_deteccion,
            alcanceEstimado: brecha.alcance_titulares_estimado,
            severidad: brecha.severidad,
        }))
        setModalNotificar({ brecha, tipo })
    }

    async function confirmarNotificar() {
        if (!modalNotificar || !user?.id) return
        setNotificando(true)
        try {
            if (modalNotificar.tipo === 'spdp') {
                await brechasService.marcarNotificadoSpdp(modalNotificar.brecha.id, user.id, textoNotificacion)
            } else {
                await brechasService.marcarNotificadoTitulares(modalNotificar.brecha.id, user.id, textoNotificacion)
            }
            setModalNotificar(null)
            setRefreshKey(k => k + 1)
        } catch (e: any) {
            alert('Error: ' + e.message)
        } finally {
            setNotificando(false)
        }
    }

    const hoy = HOY()

    if (loading) return (
        <div className="flex items-center justify-center h-64 text-slate-400">
            Cargando brechas de seguridad...
        </div>
    )

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Brechas de Seguridad</h1>
                    <p className="text-slate-500 text-sm">{brechas.length} incidente(s) registrado(s) · Art. 44-46 Reglamento LOPDP</p>
                </div>
                <div className="flex items-center gap-2">
                    <HelpButton pageKey="lopdp-brechas" />
                    <button onClick={() => setModalAbierto(true)} className="btn btn-primary flex items-center gap-2">
                        <Plus className="w-4 h-4" /> Registrar Incidente
                    </button>
                </div>
            </div>

            <div className="space-y-3">
                {brechas.map(b => {
                    const spdpAbierto = ['pendiente', 'en_proceso'].includes(b.estado_spdp)
                    const titularesAbierto = b.severidad === 'alto' && ['pendiente', 'en_proceso'].includes(b.estado_titulares ?? 'pendiente')
                    return (
                        <div key={b.id} className="card p-5 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3 min-w-0">
                                    <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
                                        <AlertOctagon className="w-5 h-5 text-red-600" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-bold text-slate-900">{b.descripcion}</p>
                                        <p className="text-sm text-slate-500 mt-0.5">Detectado: {b.fecha_deteccion}{b.alcance_titulares_estimado ? ` · ~${b.alcance_titulares_estimado} titular(es)` : ''}</p>
                                        <div className="flex flex-wrap gap-1.5 mt-2 items-center">
                                            <span className={`text-xs px-2 py-0.5 rounded-full ${SEVERIDAD_BADGE[b.severidad]}`}>
                                                Riesgo {SEVERIDAD_BRECHA_LABELS[b.severidad]}
                                            </span>
                                            <span className={`text-xs px-2 py-0.5 rounded-full ${ESTADO_BADGE[b.estado_spdp]}`}>
                                                SPDP: {ESTADO_NOTIFICACION_LABELS[b.estado_spdp]}
                                            </span>
                                            {b.severidad === 'alto' && (
                                                <span className={`text-xs px-2 py-0.5 rounded-full ${ESTADO_BADGE[b.estado_titulares ?? 'pendiente']}`}>
                                                    Titulares: {ESTADO_NOTIFICACION_LABELS[b.estado_titulares ?? 'pendiente']}
                                                </span>
                                            )}
                                            <span className="text-xs text-slate-400 flex items-center gap-1">
                                                <CalendarClock className="w-3 h-3" /> Plazo SPDP: {b.plazo_spdp}
                                                {b.plazo_titulares && ` · Plazo titulares: ${b.plazo_titulares}`}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2 shrink-0 flex-wrap justify-end">
                                    {spdpAbierto && (
                                        <button onClick={() => abrirNotificar(b, 'spdp')} className="text-xs px-3 py-1.5 rounded-lg font-medium text-green-600 hover:bg-green-50 transition-colors">
                                            <Send className="w-3 h-3 mr-1 inline" /> Notificar SPDP
                                        </button>
                                    )}
                                    {titularesAbierto && (
                                        <button onClick={() => abrirNotificar(b, 'titulares')} className="text-xs px-3 py-1.5 rounded-lg font-medium text-purple-600 hover:bg-purple-50 transition-colors">
                                            <Send className="w-3 h-3 mr-1 inline" /> Notificar Titulares
                                        </button>
                                    )}
                                    <button onClick={() => handleArchivar(b)} className="text-xs px-3 py-1.5 rounded-lg font-medium text-red-600 hover:bg-red-50 transition-colors">
                                        <Archive className="w-3 h-3 mr-1 inline" /> Archivar
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                })}

                {brechas.length === 0 && (
                    <div className="text-center py-16">
                        <AlertOctagon className="w-14 h-14 text-slate-200 mx-auto mb-3" />
                        <p className="text-slate-400">No hay incidentes registrados — ojalá siga así</p>
                        <button onClick={() => setModalAbierto(true)} className="btn btn-primary mt-4">Registrar Incidente</button>
                    </div>
                )}
            </div>

            {modalAbierto && (
                <BrechaFormModal onSave={handleSave} onClose={() => setModalAbierto(false)} />
            )}

            {modalNotificar && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
                        <h3 className="font-bold text-slate-900">
                            Notificar a {modalNotificar.tipo === 'spdp' ? 'la Superintendencia (SPDP)' : 'los titulares afectados'}
                        </h3>
                        <p className="text-xs text-slate-500">
                            Este texto es una plantilla sugerida — revísala y edítala antes de enviarla. El sistema no envía nada automáticamente, solo registra que ya la notificaste hoy ({hoy}).
                        </p>
                        <textarea className="input font-mono text-xs" rows={12}
                            value={textoNotificacion}
                            onChange={e => setTextoNotificacion(e.target.value)} />
                        <div className="flex gap-3 justify-end pt-2">
                            <button className="btn btn-secondary" onClick={() => setModalNotificar(null)}>Cancelar</button>
                            <button className="btn btn-primary" disabled={notificando} onClick={confirmarNotificar}>
                                {notificando ? 'Guardando...' : 'Confirmar que ya se notificó'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
