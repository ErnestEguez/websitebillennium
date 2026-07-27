import { useEffect, useRef, useState } from 'react'
import { Building2, Plus, Edit2, Archive, ShieldCheck, AlertTriangle, Lock } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { encargadosService } from '../../services/lopdp/encargadosService'
import { politicaPrivacidadService } from '../../services/lopdp/politicaPrivacidadService'
import { ENCARGADO_DIAS_ALERTA_VIGENCIA, type EncargadoTratamiento, type EncargadoTercero } from '../../types/lopdp'
import { EncargadoFormModal } from '../../components/lopdp/EncargadoFormModal'
import { HelpButton } from '../../components/help/HelpButton'

function estaPorVencer(fechaVigencia?: string | null): boolean {
    if (!fechaVigencia) return true // sin fecha = trátalo como alerta también
    const limite = new Date()
    limite.setDate(limite.getDate() + ENCARGADO_DIAS_ALERTA_VIGENCIA)
    return new Date(fechaVigencia) <= limite
}

export function EncargadosPage() {
    const { empresa, user } = useAuth()
    const [encargados, setEncargados] = useState<EncargadoTratamiento[]>([])
    const [fijos, setFijos] = useState<EncargadoTercero[]>([])
    const [loading, setLoading] = useState(true)
    const [modalAbierto, setModalAbierto] = useState(false)
    const [editando, setEditando] = useState<EncargadoTratamiento | undefined>(undefined)
    const [refreshKey, setRefreshKey] = useState(0)

    const mountedRef = useRef(true)
    useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

    useEffect(() => {
        if (!empresa?.id) { setLoading(false); return }
        const eid = empresa.id
        let cancelled = false
        setLoading(true)
        Promise.all([
            encargadosService.listar(eid),
            politicaPrivacidadService.obtener(eid),
        ]).then(([lista, config]) => {
            if (cancelled || !mountedRef.current) return
            setEncargados(lista)
            setFijos((config?.encargados_terceros ?? []).filter(e => e.fijo))
        }).catch(() => {})
          .finally(() => { if (!cancelled && mountedRef.current) setLoading(false) })
        return () => { cancelled = true }
    }, [empresa?.id, refreshKey])

    function abrirNuevo() { setEditando(undefined); setModalAbierto(true) }
    function abrirEditar(e: EncargadoTratamiento) { setEditando(e); setModalAbierto(true) }

    async function handleSave(campos: Partial<EncargadoTratamiento>) {
        if (!empresa?.id || !user?.id) return
        if (editando) {
            await encargadosService.actualizar(editando.id, campos, user.id)
        } else {
            await encargadosService.crear({ ...campos, empresa_id: empresa.id } as any, user.id)
        }
        setRefreshKey(k => k + 1)
    }

    async function handleArchivar(e: EncargadoTratamiento) {
        if (!user?.id) return
        if (!confirm(`¿Archivar "${e.nombre}" como encargado de tratamiento?`)) return
        try {
            await encargadosService.archivar(e.id, user.id)
            setRefreshKey(k => k + 1)
        } catch (err: any) {
            alert('Error: ' + err.message)
        }
    }

    if (loading) return (
        <div className="flex items-center justify-center h-64 text-slate-400">
            Cargando encargados de tratamiento...
        </div>
    )

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Encargados de Tratamiento</h1>
                    <p className="text-slate-500 text-sm">Terceros que procesan datos por cuenta de tu empresa</p>
                </div>
                <div className="flex items-center gap-2">
                    <HelpButton pageKey="lopdp-encargados" />
                    <button onClick={abrirNuevo} className="btn btn-primary flex items-center gap-2">
                        <Plus className="w-4 h-4" /> Nuevo Encargado
                    </button>
                </div>
            </div>

            <div className="space-y-3">
                {fijos.map((f, i) => (
                    <div key={`fijo-${i}`} className="card p-5 bg-slate-50 border-slate-200">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-200 rounded-xl flex items-center justify-center shrink-0">
                                <ShieldCheck className="w-5 h-5 text-slate-500" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="font-bold text-slate-700">{f.nombre}</p>
                                <p className="text-sm text-slate-500">{f.tipo}</p>
                            </div>
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-wide flex items-center gap-1 shrink-0">
                                <Lock className="w-3 h-3" /> Encargado fijo
                            </span>
                        </div>
                    </div>
                ))}

                {encargados.map(e => {
                    const alerta = !e.tiene_contrato_dpa || estaPorVencer(e.fecha_vigencia)
                    return (
                        <div key={e.id} className="card p-5 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-3 min-w-0">
                                    <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                                        <Building2 className="w-5 h-5 text-emerald-600" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-bold text-slate-900">{e.nombre}</p>
                                        <p className="text-sm text-slate-500 mt-0.5">{e.tipo_servicio}</p>
                                        <div className="flex flex-wrap gap-1.5 mt-2 items-center">
                                            <span className={`text-xs px-2 py-0.5 rounded-full ${e.tiene_contrato_dpa ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {e.tiene_contrato_dpa ? 'Con contrato/DPA' : 'Sin contrato/DPA'}
                                            </span>
                                            <span className="text-xs text-slate-400">
                                                Vigencia: {e.fecha_vigencia ?? 'sin registrar'}
                                            </span>
                                            {alerta && (
                                                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                    <AlertTriangle className="w-3 h-3" /> Revisar vigencia
                                                </span>
                                            )}
                                            {e.destruccion_confirmada && (
                                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Destrucción confirmada</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2 shrink-0">
                                    <button onClick={() => abrirEditar(e)} className="text-xs btn btn-secondary py-1.5 px-3">
                                        <Edit2 className="w-3 h-3 mr-1 inline" /> Editar
                                    </button>
                                    <button onClick={() => handleArchivar(e)} className="text-xs px-3 py-1.5 rounded-lg font-medium text-red-600 hover:bg-red-50 transition-colors">
                                        <Archive className="w-3 h-3 mr-1 inline" /> Archivar
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                })}

                {encargados.length === 0 && (
                    <div className="text-center py-16">
                        <Building2 className="w-14 h-14 text-slate-200 mx-auto mb-3" />
                        <p className="text-slate-400">Aún no has registrado encargados de tratamiento propios</p>
                        <button onClick={abrirNuevo} className="btn btn-primary mt-4">Registrar Primer Encargado</button>
                    </div>
                )}
            </div>

            {modalAbierto && (
                <EncargadoFormModal
                    encargado={editando}
                    onSave={handleSave}
                    onClose={() => setModalAbierto(false)}
                />
            )}
        </div>
    )
}
