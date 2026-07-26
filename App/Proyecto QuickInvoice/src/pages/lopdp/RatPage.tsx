import { useEffect, useRef, useState } from 'react'
import { ShieldCheck, Plus, Edit2, Archive, Search, Printer, Download } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { actividadesTratamientoService } from '../../services/lopdp/actividadesTratamientoService'
import { BASE_LEGAL_LABELS, type ActividadTratamiento } from '../../types/lopdp'
import { RatFormModal } from '../../components/lopdp/RatFormModal'
import { HelpButton } from '../../components/help/HelpButton'
import { imprimirReporteRAT } from '../../services/lopdp/ratReporte'
import { exportarExcelProfesional } from '../../lib/excelUtils'

export function RatPage() {
    const { empresa, user } = useAuth()
    const [actividades, setActividades] = useState<ActividadTratamiento[]>([])
    const [loading, setLoading] = useState(true)
    const [busqueda, setBusqueda] = useState('')
    const [modalAbierto, setModalAbierto] = useState(false)
    const [editando, setEditando] = useState<ActividadTratamiento | undefined>(undefined)
    const [refreshKey, setRefreshKey] = useState(0)

    const mountedRef = useRef(true)
    useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false } }, [])

    useEffect(() => {
        if (!empresa?.id) { setLoading(false); return }
        const eid = empresa.id
        let cancelled = false
        setLoading(true)
        actividadesTratamientoService.listar(eid)
            .then(data => { if (!cancelled && mountedRef.current) setActividades(data) })
            .catch(() => {})
            .finally(() => { if (!cancelled && mountedRef.current) setLoading(false) })
        return () => { cancelled = true }
    }, [empresa?.id, refreshKey])

    function abrirNuevo() {
        setEditando(undefined)
        setModalAbierto(true)
    }

    function abrirEditar(a: ActividadTratamiento) {
        setEditando(a)
        setModalAbierto(true)
    }

    async function handleSave(campos: Partial<ActividadTratamiento>) {
        if (!empresa?.id || !user?.id) return
        if (editando) {
            await actividadesTratamientoService.actualizar(editando.id, campos, user.id)
        } else {
            await actividadesTratamientoService.crear(
                { ...campos, empresa_id: empresa.id } as any,
                user.id
            )
        }
        setRefreshKey(k => k + 1)
    }

    async function handleArchivar(a: ActividadTratamiento) {
        if (!user?.id) return
        if (!confirm(`¿Archivar la actividad "${a.nombre}"? Seguirá disponible en el historial de cumplimiento.`)) return
        try {
            await actividadesTratamientoService.archivar(a.id, user.id)
            setRefreshKey(k => k + 1)
        } catch (e: any) {
            alert('Error: ' + e.message)
        }
    }

    const visibles = actividades.filter(a => {
        const q = busqueda.toLowerCase()
        if (!q) return true
        return a.nombre.toLowerCase().includes(q) || a.finalidad.toLowerCase().includes(q)
    })

    function handleImprimir() {
        imprimirReporteRAT({ nombre: empresa?.nombre ?? '', ruc: empresa?.ruc ?? '' }, visibles)
    }

    function handleExportarExcel() {
        exportarExcelProfesional({
            empresa:  { nombre: empresa?.nombre ?? '', ruc: empresa?.ruc ?? '' },
            titulo:   'Registro de Actividades de Tratamiento (RAT)',
            nombreArchivo: 'rat_actividades_tratamiento',
            columnas: [
                { key: 'nombre',       label: 'Actividad',                              width: 26 },
                { key: 'finalidad',    label: 'Finalidad',                              width: 34 },
                { key: 'categorias',   label: 'Categorías de datos',                    width: 26 },
                { key: 'titulares',    label: 'Categorías de titulares',                width: 24 },
                { key: 'baseLegal',    label: 'Base legal (Art. 7 LOPDP)',              width: 26 },
                { key: 'retencion',    label: 'Plazo de retención',                     width: 26 },
                { key: 'terceros',     label: 'Transferencia a terceros',               width: 30 },
                { key: 'internacional', label: 'Transferencia internacional',           width: 24 },
                { key: 'medidas',      label: 'Medidas de seguridad',                   width: 30 },
            ],
            filas: visibles.map(a => ({
                nombre:        a.nombre,
                finalidad:     a.finalidad,
                categorias:    a.categorias_datos?.join(', ') ?? '',
                titulares:     a.categoria_titulares?.join(', ') ?? '',
                baseLegal:     BASE_LEGAL_LABELS[a.base_legal] ?? a.base_legal,
                retencion:     a.plazo_retencion,
                terceros:      a.hay_transferencia_terceros ? (a.terceros_detalle || 'Sí') : 'No aplica',
                internacional: a.transferencia_internacional ? (a.pais_transferencia || 'Sí') : 'No aplica',
                medidas:       a.medidas_seguridad ?? '',
            })),
        })
    }

    if (loading) return (
        <div className="flex items-center justify-center h-64 text-slate-400">
            Cargando registro de actividades de tratamiento...
        </div>
    )

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Registro de Actividades de Tratamiento (RAT)</h1>
                    <p className="text-slate-500 text-sm">{actividades.length} actividades registradas · Art. 38 Reglamento LOPDP</p>
                </div>
                <div className="flex items-center gap-2">
                    <HelpButton pageKey="lopdp-rat" />
                    <button onClick={abrirNuevo} className="btn btn-primary flex items-center gap-2">
                        <Plus className="w-4 h-4" /> Nueva Actividad
                    </button>
                </div>
            </div>

            {/* Filtros + export */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="relative flex-1 min-w-60">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        className="input pl-9 w-full"
                        placeholder="Buscar por nombre o finalidad..."
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={handleExportarExcel} className="btn btn-secondary flex items-center gap-2 text-sm py-1.5 px-3" title="Exportar a Excel">
                        <Download className="w-4 h-4 text-green-600" /> Excel
                    </button>
                    <button onClick={handleImprimir} className="btn btn-secondary flex items-center gap-2 text-sm py-1.5 px-3" title="Generar reporte formal">
                        <Printer className="w-4 h-4 text-slate-500" /> Reporte RAT
                    </button>
                </div>
            </div>

            {/* Listado */}
            <div className="space-y-3">
                {visibles.map(a => (
                    <div key={a.id} className="card p-5 hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3 min-w-0">
                                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                                </div>
                                <div className="min-w-0">
                                    <p className="font-bold text-slate-900">{a.nombre}</p>
                                    <p className="text-sm text-slate-500 mt-0.5">{a.finalidad}</p>
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                                            {BASE_LEGAL_LABELS[a.base_legal]}
                                        </span>
                                        {a.categorias_datos?.map(c => (
                                            <span key={c} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{c}</span>
                                        ))}
                                        {a.hay_transferencia_terceros && (
                                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Transferencia a terceros</span>
                                        )}
                                        {a.transferencia_internacional && (
                                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Transferencia internacional</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                                <button onClick={() => abrirEditar(a)} className="text-xs btn btn-secondary py-1.5 px-3">
                                    <Edit2 className="w-3 h-3 mr-1 inline" /> Editar
                                </button>
                                <button onClick={() => handleArchivar(a)} className="text-xs px-3 py-1.5 rounded-lg font-medium text-red-600 hover:bg-red-50 transition-colors">
                                    <Archive className="w-3 h-3 mr-1 inline" /> Archivar
                                </button>
                            </div>
                        </div>
                    </div>
                ))}

                {visibles.length === 0 && (
                    <div className="text-center py-16">
                        <ShieldCheck className="w-14 h-14 text-slate-200 mx-auto mb-3" />
                        <p className="text-slate-400">
                            {busqueda ? 'Sin resultados para tu búsqueda' : 'Aún no hay actividades de tratamiento registradas'}
                        </p>
                        {!busqueda && (
                            <button onClick={abrirNuevo} className="btn btn-primary mt-4">
                                Registrar Primera Actividad
                            </button>
                        )}
                    </div>
                )}
            </div>

            {modalAbierto && (
                <RatFormModal
                    actividad={editando}
                    onSave={handleSave}
                    onClose={() => setModalAbierto(false)}
                />
            )}
        </div>
    )
}
