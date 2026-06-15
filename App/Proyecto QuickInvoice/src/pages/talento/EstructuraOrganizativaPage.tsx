import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { estructuraOrganizativaService } from '../../services/nominas/estructuraOrganizativaService'
import type { SeccionNomina, CargoNomina } from '../../types/nominas'
import { Building2, Briefcase, Plus, Edit2, Save, X, UserX, RotateCcw } from 'lucide-react'

export function EstructuraOrganizativaPage() {
    const { empresa } = useAuth()
    const [secciones, setSecciones] = useState<SeccionNomina[]>([])
    const [cargos, setCargos] = useState<CargoNomina[]>([])
    const [loading, setLoading] = useState(true)

    const [seccionModalOpen, setSeccionModalOpen] = useState(false)
    const [editingSeccion, setEditingSeccion] = useState<Partial<SeccionNomina> | null>(null)
    const [savingSeccion, setSavingSeccion] = useState(false)

    const [cargoModalOpen, setCargoModalOpen] = useState(false)
    const [editingCargo, setEditingCargo] = useState<Partial<CargoNomina> | null>(null)
    const [savingCargo, setSavingCargo] = useState(false)

    useEffect(() => {
        if (empresa?.id) loadData()
    }, [empresa?.id])

    async function loadData() {
        try {
            setLoading(true)
            const [secs, cars] = await Promise.all([
                estructuraOrganizativaService.listarSeccionesTodas(empresa!.id),
                estructuraOrganizativaService.listarCargosTodas(empresa!.id),
            ])
            setSecciones(secs)
            setCargos(cars)
        } catch (e) {
            console.error(e)
            alert('Error al cargar la estructura organizativa')
        } finally {
            setLoading(false)
        }
    }

    // ── Secciones ─────────────────────────────────────────────

    async function handleSaveSeccion() {
        if (!editingSeccion?.nombre?.trim()) {
            alert('El nombre es obligatorio')
            return
        }
        try {
            setSavingSeccion(true)
            if (editingSeccion.id) {
                await estructuraOrganizativaService.actualizarSeccion(editingSeccion.id, {
                    nombre: editingSeccion.nombre,
                    descripcion: editingSeccion.descripcion ?? null,
                })
            } else {
                await estructuraOrganizativaService.crearSeccion({
                    empresa_id: empresa!.id,
                    nombre: editingSeccion.nombre,
                    descripcion: editingSeccion.descripcion ?? null,
                })
            }
            await loadData()
            setSeccionModalOpen(false)
            setEditingSeccion(null)
        } catch (e: any) {
            alert(`Error al guardar: ${e.message}`)
        } finally {
            setSavingSeccion(false)
        }
    }

    async function handleToggleSeccion(s: SeccionNomina) {
        try {
            if (s.activo) {
                if (!confirm(`¿Dar de baja la sección "${s.nombre}"?`)) return
                await estructuraOrganizativaService.desactivarSeccion(s.id)
            } else {
                await estructuraOrganizativaService.actualizarSeccion(s.id, { activo: true })
            }
            await loadData()
        } catch (e: any) {
            alert(`Error: ${e.message}`)
        }
    }

    // ── Cargos ────────────────────────────────────────────────

    async function handleSaveCargo() {
        if (!editingCargo?.nombre?.trim()) {
            alert('El nombre es obligatorio')
            return
        }
        try {
            setSavingCargo(true)
            if (editingCargo.id) {
                await estructuraOrganizativaService.actualizarCargo(editingCargo.id, {
                    nombre: editingCargo.nombre,
                    descripcion: editingCargo.descripcion ?? null,
                    seccion_id: editingCargo.seccion_id ?? null,
                })
            } else {
                await estructuraOrganizativaService.crearCargo({
                    empresa_id: empresa!.id,
                    nombre: editingCargo.nombre,
                    descripcion: editingCargo.descripcion ?? null,
                    seccion_id: editingCargo.seccion_id ?? null,
                })
            }
            await loadData()
            setCargoModalOpen(false)
            setEditingCargo(null)
        } catch (e: any) {
            alert(`Error al guardar: ${e.message}`)
        } finally {
            setSavingCargo(false)
        }
    }

    async function handleToggleCargo(c: CargoNomina) {
        try {
            if (c.activo) {
                if (!confirm(`¿Dar de baja el cargo "${c.nombre}"?`)) return
                await estructuraOrganizativaService.desactivarCargo(c.id)
            } else {
                await estructuraOrganizativaService.actualizarCargo(c.id, { activo: true })
            }
            await loadData()
        } catch (e: any) {
            alert(`Error: ${e.message}`)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-slate-500">Cargando estructura organizativa...</div>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold text-slate-900">Estructura Organizativa</h1>
                <p className="text-slate-600 mt-1">Secciones (departamentos) y cargos para Talento Humano y Nóminas</p>
            </div>

            {/* Secciones */}
            <div className="card overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-indigo-600" />
                        <h2 className="text-lg font-semibold text-slate-900">Secciones</h2>
                    </div>
                    <button
                        onClick={() => { setEditingSeccion({}); setSeccionModalOpen(true) }}
                        className="btn btn-primary flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Nueva Sección
                    </button>
                </div>
                <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Nombre</th>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Descripción</th>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
                            <th className="px-6 py-3" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {secciones.map(s => (
                            <tr key={s.id} className={`hover:bg-slate-50 ${!s.activo ? 'opacity-50' : ''}`}>
                                <td className="px-6 py-4 font-medium text-slate-900">{s.nombre}</td>
                                <td className="px-6 py-4 text-slate-600">{s.descripcion || '—'}</td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        s.activo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                    }`}>
                                        {s.activo ? 'Activa' : 'Baja'}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex gap-1 justify-end">
                                        <button
                                            onClick={() => { setEditingSeccion(s); setSeccionModalOpen(true) }}
                                            className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-primary-600"
                                            title="Editar"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleToggleSeccion(s)}
                                            className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-red-600"
                                            title={s.activo ? 'Dar de baja' : 'Reactivar'}
                                        >
                                            {s.activo ? <UserX className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {secciones.length === 0 && (
                    <div className="text-center py-12">
                        <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500">No hay secciones registradas</p>
                        <button
                            onClick={() => { setEditingSeccion({}); setSeccionModalOpen(true) }}
                            className="btn btn-primary mt-4"
                        >
                            Crear primera sección
                        </button>
                    </div>
                )}
            </div>

            {/* Cargos */}
            <div className="card overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                    <div className="flex items-center gap-2">
                        <Briefcase className="w-5 h-5 text-indigo-600" />
                        <h2 className="text-lg font-semibold text-slate-900">Cargos</h2>
                    </div>
                    <button
                        onClick={() => { setEditingCargo({}); setCargoModalOpen(true) }}
                        className="btn btn-primary flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Nuevo Cargo
                    </button>
                </div>
                <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Nombre</th>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Sección</th>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Descripción</th>
                            <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
                            <th className="px-6 py-3" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {cargos.map(c => (
                            <tr key={c.id} className={`hover:bg-slate-50 ${!c.activo ? 'opacity-50' : ''}`}>
                                <td className="px-6 py-4 font-medium text-slate-900">{c.nombre}</td>
                                <td className="px-6 py-4 text-slate-600">{c.seccion?.nombre || '—'}</td>
                                <td className="px-6 py-4 text-slate-600">{c.descripcion || '—'}</td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        c.activo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                    }`}>
                                        {c.activo ? 'Activo' : 'Baja'}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex gap-1 justify-end">
                                        <button
                                            onClick={() => { setEditingCargo(c); setCargoModalOpen(true) }}
                                            className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-primary-600"
                                            title="Editar"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleToggleCargo(c)}
                                            className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-red-600"
                                            title={c.activo ? 'Dar de baja' : 'Reactivar'}
                                        >
                                            {c.activo ? <UserX className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {cargos.length === 0 && (
                    <div className="text-center py-12">
                        <Briefcase className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500">No hay cargos registrados</p>
                        <button
                            onClick={() => { setEditingCargo({}); setCargoModalOpen(true) }}
                            className="btn btn-primary mt-4"
                        >
                            Crear primer cargo
                        </button>
                    </div>
                )}
            </div>

            {/* Modal Sección */}
            {seccionModalOpen && editingSeccion !== null && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                            <h2 className="text-xl font-bold text-slate-900">
                                {editingSeccion.id ? 'Editar Sección' : 'Nueva Sección'}
                            </h2>
                            <button onClick={() => { setSeccionModalOpen(false); setEditingSeccion(null) }} className="p-2 hover:bg-slate-100 rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Nombre <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={editingSeccion.nombre || ''}
                                    onChange={e => setEditingSeccion({ ...editingSeccion, nombre: e.target.value })}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    placeholder="Administrativo, Operativo, Ventas..."
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
                                <input
                                    type="text"
                                    value={editingSeccion.descripcion || ''}
                                    onChange={e => setEditingSeccion({ ...editingSeccion, descripcion: e.target.value })}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    placeholder="Opcional"
                                />
                            </div>
                        </div>

                        <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
                            <button
                                onClick={() => { setSeccionModalOpen(false); setEditingSeccion(null) }}
                                className="btn btn-secondary"
                                disabled={savingSeccion}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveSeccion}
                                className="btn btn-primary flex items-center gap-2"
                                disabled={savingSeccion}
                            >
                                {savingSeccion ? (
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <Save className="w-4 h-4" />
                                )}
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Cargo */}
            {cargoModalOpen && editingCargo !== null && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
                        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                            <h2 className="text-xl font-bold text-slate-900">
                                {editingCargo.id ? 'Editar Cargo' : 'Nuevo Cargo'}
                            </h2>
                            <button onClick={() => { setCargoModalOpen(false); setEditingCargo(null) }} className="p-2 hover:bg-slate-100 rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    Nombre <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={editingCargo.nombre || ''}
                                    onChange={e => setEditingCargo({ ...editingCargo, nombre: e.target.value })}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    placeholder="Contador, Gerente, Analista..."
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Sección</label>
                                <select
                                    value={editingCargo.seccion_id || ''}
                                    onChange={e => setEditingCargo({ ...editingCargo, seccion_id: e.target.value || null })}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                >
                                    <option value="">Sin sección</option>
                                    {secciones.filter(s => s.activo).map(s => (
                                        <option key={s.id} value={s.id}>{s.nombre}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
                                <input
                                    type="text"
                                    value={editingCargo.descripcion || ''}
                                    onChange={e => setEditingCargo({ ...editingCargo, descripcion: e.target.value })}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    placeholder="Opcional"
                                />
                            </div>
                        </div>

                        <div className="p-6 border-t border-slate-200 flex gap-3 justify-end">
                            <button
                                onClick={() => { setCargoModalOpen(false); setEditingCargo(null) }}
                                className="btn btn-secondary"
                                disabled={savingCargo}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveCargo}
                                className="btn btn-primary flex items-center gap-2"
                                disabled={savingCargo}
                            >
                                {savingCargo ? (
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <Save className="w-4 h-4" />
                                )}
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
