import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { empleadosService } from '../../services/nominas/empleadosService'
import { estructuraOrganizativaService } from '../../services/nominas/estructuraOrganizativaService'
import { historialSalariosService } from '../../services/nominas/historialSalariosService'
import type {
    Empleado, SeccionNomina, CargoNomina,
    TipoJornada, TipoNomina, ModoDecimo, ModoFondoReserva,
    TipoContrato, EstadoCivil, HistorialSalario,
} from '../../types/nominas'
import {
    Users, Plus, Edit2, Save, X, UserX, RotateCcw, Loader2,
    Briefcase, CreditCard, ShieldAlert, History, Trash2,
} from 'lucide-react'
import { cn } from '../../lib/utils'

type TabForm = 'personal' | 'laboral' | 'nomina' | 'adicional'

const EMPTY: Omit<Empleado, 'id' | 'empresa_id' | 'created_at' | 'updated_at' | 'activo' | 'seccion' | 'cargo' | 'jefe'> = {
    nombres: '',
    apellidos: '',
    cedula: '',
    fecha_nacimiento: null,
    telefono: null,
    email: null,
    direccion: null,
    foto_url: null,
    estado_civil: null,
    nacionalidad: null,
    ciudad: null,
    seccion_id: null,
    cargo_id: null,
    jefe_inmediato_id: null,
    fecha_ingreso: new Date().toISOString().slice(0, 10),
    fecha_salida: null,
    tipo_jornada: 'completa',
    tipo_nomina: 'mensual',
    tipo_contrato: null,
    sueldo_base: 0,
    afiliado_iess: true,
    decimo_tercero_modo: 'mensualizado',
    decimo_cuarto_modo: 'mensualizado',
    fondo_reserva_modo: 'mensual',
    cargas_familiares: 0,
    banco: null,
    tipo_cuenta: null,
    numero_cuenta: null,
    anticipo_tipo: null,
    anticipo_valor: null,
    contacto_emergencia_nombre: null,
    contacto_emergencia_relacion: null,
    contacto_emergencia_telefono: null,
    observaciones: null,
}

export function EmpleadosPage() {
    const { empresa } = useAuth() as any
    const [empleados, setEmpleados] = useState<Empleado[]>([])
    const [secciones, setSecciones] = useState<SeccionNomina[]>([])
    const [cargos, setCargos] = useState<CargoNomina[]>([])
    const [loading, setLoading] = useState(true)

    const [modalOpen, setModalOpen] = useState(false)
    const [editando, setEditando] = useState<(typeof EMPTY) & { id?: string }>({ ...EMPTY })
    const [saving, setSaving] = useState(false)
    const [tab, setTab] = useState<TabForm>('personal')

    // Historial salarial
    const [historial, setHistorial] = useState<HistorialSalario[]>([])
    const [historialLoading, setHistorialLoading] = useState(false)
    const sueldoOriginalRef = useRef<number>(0)
    const [motivoCambio, setMotivoCambio] = useState('')

    useEffect(() => {
        if (empresa?.id) loadData()
    }, [empresa?.id])

    async function loadData() {
        try {
            setLoading(true)
            const [emps, secs, cars] = await Promise.all([
                empleadosService.listarEmpleadosTodos(empresa!.id),
                estructuraOrganizativaService.listarSecciones(empresa!.id),
                estructuraOrganizativaService.listarCargos(empresa!.id),
            ])
            setEmpleados(emps)
            setSecciones(secs)
            setCargos(cars)
        } catch (e) {
            console.error(e)
            alert('Error al cargar empleados')
        } finally {
            setLoading(false)
        }
    }

    function abrirNuevo() {
        setEditando({ ...EMPTY })
        setHistorial([])
        setMotivoCambio('')
        setTab('personal')
        sueldoOriginalRef.current = 0
        setModalOpen(true)
    }

    function abrirEditar(emp: Empleado) {
        setEditando({
            id: emp.id,
            nombres: emp.nombres,
            apellidos: emp.apellidos,
            cedula: emp.cedula,
            fecha_nacimiento: emp.fecha_nacimiento ?? null,
            telefono: emp.telefono ?? null,
            email: emp.email ?? null,
            direccion: emp.direccion ?? null,
            foto_url: emp.foto_url ?? null,
            estado_civil: emp.estado_civil ?? null,
            nacionalidad: emp.nacionalidad ?? null,
            ciudad: emp.ciudad ?? null,
            seccion_id: emp.seccion_id ?? null,
            cargo_id: emp.cargo_id ?? null,
            jefe_inmediato_id: emp.jefe_inmediato_id ?? null,
            fecha_ingreso: emp.fecha_ingreso,
            fecha_salida: emp.fecha_salida ?? null,
            tipo_jornada: emp.tipo_jornada,
            tipo_nomina: emp.tipo_nomina,
            tipo_contrato: emp.tipo_contrato ?? null,
            sueldo_base: emp.sueldo_base,
            afiliado_iess: emp.afiliado_iess,
            decimo_tercero_modo: emp.decimo_tercero_modo,
            decimo_cuarto_modo: emp.decimo_cuarto_modo,
            fondo_reserva_modo: emp.fondo_reserva_modo,
            cargas_familiares: emp.cargas_familiares,
            banco: emp.banco ?? null,
            tipo_cuenta: emp.tipo_cuenta ?? null,
            numero_cuenta: emp.numero_cuenta ?? null,
            anticipo_tipo: emp.anticipo_tipo ?? null,
            anticipo_valor: emp.anticipo_valor ?? null,
            contacto_emergencia_nombre: emp.contacto_emergencia_nombre ?? null,
            contacto_emergencia_relacion: emp.contacto_emergencia_relacion ?? null,
            contacto_emergencia_telefono: emp.contacto_emergencia_telefono ?? null,
            observaciones: emp.observaciones ?? null,
        })
        sueldoOriginalRef.current = emp.sueldo_base
        setMotivoCambio('')
        setTab('personal')
        setModalOpen(true)
        // Cargar historial salarial en paralelo
        setHistorial([])
        setHistorialLoading(true)
        historialSalariosService.listar(emp.id)
            .then(h => setHistorial(h))
            .catch(console.error)
            .finally(() => setHistorialLoading(false))
    }

    async function handleSave() {
        if (!editando.nombres.trim() || !editando.apellidos.trim()) {
            alert('Nombres y apellidos son obligatorios')
            setTab('personal')
            return
        }
        if (!editando.cedula.trim()) {
            alert('La cédula es obligatoria')
            setTab('personal')
            return
        }
        if (!editando.fecha_ingreso) {
            alert('La fecha de ingreso es obligatoria')
            setTab('laboral')
            return
        }
        try {
            setSaving(true)
            const sueldoNuevo = Number(editando.sueldo_base) || 0
            const payload = {
                empresa_id: empresa!.id,
                nombres: editando.nombres.trim(),
                apellidos: editando.apellidos.trim(),
                cedula: editando.cedula.trim(),
                fecha_nacimiento: editando.fecha_nacimiento || null,
                telefono: editando.telefono || null,
                email: editando.email || null,
                direccion: editando.direccion || null,
                foto_url: editando.foto_url || null,
                estado_civil: editando.estado_civil || null,
                nacionalidad: editando.nacionalidad || null,
                ciudad: editando.ciudad || null,
                seccion_id: editando.seccion_id || null,
                cargo_id: editando.cargo_id || null,
                jefe_inmediato_id: editando.jefe_inmediato_id || null,
                fecha_ingreso: editando.fecha_ingreso,
                fecha_salida: editando.fecha_salida || null,
                tipo_jornada: editando.tipo_jornada,
                tipo_nomina: editando.tipo_nomina,
                tipo_contrato: editando.tipo_contrato || null,
                sueldo_base: sueldoNuevo,
                afiliado_iess: editando.afiliado_iess,
                decimo_tercero_modo: editando.decimo_tercero_modo,
                decimo_cuarto_modo: editando.decimo_cuarto_modo,
                fondo_reserva_modo: editando.fondo_reserva_modo,
                cargas_familiares: Number(editando.cargas_familiares) || 0,
                banco: editando.banco || null,
                tipo_cuenta: editando.tipo_cuenta || null,
                numero_cuenta: editando.numero_cuenta || null,
                anticipo_tipo: editando.anticipo_tipo || null,
                anticipo_valor: editando.anticipo_valor != null ? Number(editando.anticipo_valor) || null : null,
                contacto_emergencia_nombre: editando.contacto_emergencia_nombre || null,
                contacto_emergencia_relacion: editando.contacto_emergencia_relacion || null,
                contacto_emergencia_telefono: editando.contacto_emergencia_telefono || null,
                observaciones: editando.observaciones || null,
            }
            if (editando.id) {
                await empleadosService.actualizarEmpleado(editando.id, payload)
                // Registrar cambio salarial si el sueldo fue modificado
                if (sueldoNuevo !== sueldoOriginalRef.current) {
                    await historialSalariosService.crear({
                        empresa_id: empresa!.id,
                        empleado_id: editando.id,
                        fecha: new Date().toISOString().slice(0, 10),
                        sueldo_anterior: sueldoOriginalRef.current,
                        sueldo_nuevo: sueldoNuevo,
                        motivo: motivoCambio.trim() || null,
                    })
                }
            } else {
                await empleadosService.crearEmpleado(payload)
            }
            setModalOpen(false)
            await loadData()
        } catch (e: any) {
            alert(`Error al guardar: ${e.message}`)
        } finally {
            setSaving(false)
        }
    }

    async function handleToggle(emp: Empleado) {
        try {
            if (emp.activo) {
                await empleadosService.desactivarEmpleado(emp.id)
            } else {
                await empleadosService.actualizarEmpleado(emp.id, { activo: true })
            }
            await loadData()
        } catch (e: any) {
            alert(`Error: ${e.message}`)
        }
    }

    async function handleEliminarHistorial(id: string) {
        if (!confirm('¿Eliminar este registro del historial?')) return
        try {
            await historialSalariosService.eliminar(id)
            setHistorial(h => h.filter(x => x.id !== id))
        } catch (e: any) {
            alert(`Error: ${e.message}`)
        }
    }

    const nombresCompletos = (e: Empleado) => `${e.apellidos} ${e.nombres}`
    const sueldoCambio = editando.id && Number(editando.sueldo_base) !== sueldoOriginalRef.current

    const opcionesJefe = empleados.filter(e => e.activo && e.id !== editando.id)

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
        )
    }

    const TABS: { key: TabForm; label: string; icon: any }[] = [
        { key: 'personal',  label: 'Personal',  icon: Users },
        { key: 'laboral',   label: 'Laboral',   icon: Briefcase },
        { key: 'nomina',    label: 'Nómina',    icon: CreditCard },
        { key: 'adicional', label: '+ Info',    icon: ShieldAlert },
    ]

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900">Empleados</h1>
                    <p className="text-slate-600 mt-1">Maestro de colaboradores de la empresa</p>
                </div>
                <button onClick={abrirNuevo} className="btn btn-primary flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Nuevo Empleado
                </button>
            </div>

            <div className="card overflow-hidden">
                {empleados.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                        <Users className="w-12 h-12 mb-4 opacity-40" />
                        <p className="font-semibold mb-2">Sin empleados registrados</p>
                        <button onClick={abrirNuevo} className="btn btn-primary mt-2 flex items-center gap-2">
                            <Plus className="w-4 h-4" /> Registrar primer empleado
                        </button>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-slate-50 border-b border-slate-200">
                            <tr>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">Nombre</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">Cédula</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">Cargo</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">Sección</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">Tipo nómina</th>
                                <th className="text-left px-4 py-3 font-semibold text-slate-600">Estado</th>
                                <th className="px-4 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {empleados.map(emp => (
                                <tr key={emp.id} className={cn('hover:bg-slate-50 transition-colors', !emp.activo && 'opacity-50')}>
                                    <td className="px-4 py-3 font-medium text-slate-900">{nombresCompletos(emp)}</td>
                                    <td className="px-4 py-3 text-slate-600">{emp.cedula}</td>
                                    <td className="px-4 py-3 text-slate-600">{emp.cargo?.nombre ?? '—'}</td>
                                    <td className="px-4 py-3 text-slate-600">{emp.seccion?.nombre ?? '—'}</td>
                                    <td className="px-4 py-3 text-slate-500 capitalize">{emp.tipo_nomina.replace('_', ' ')}</td>
                                    <td className="px-4 py-3">
                                        <span className={cn('px-2 py-0.5 rounded-full text-xs font-semibold', emp.activo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500')}>
                                            {emp.activo ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2 justify-end">
                                            <button onClick={() => abrirEditar(emp)} title="Editar"
                                                className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors">
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleToggle(emp)} title={emp.activo ? 'Dar de baja' : 'Reactivar'}
                                                className={cn('p-1.5 rounded-lg transition-colors', emp.activo
                                                    ? 'text-slate-400 hover:text-red-500 hover:bg-red-50'
                                                    : 'text-slate-400 hover:text-green-600 hover:bg-green-50')}>
                                                {emp.activo ? <UserX className="w-4 h-4" /> : <RotateCcw className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* ── Modal ── */}
            {modalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">

                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <h2 className="text-lg font-bold text-slate-900">
                                {editando.id ? 'Editar Empleado' : 'Nuevo Empleado'}
                            </h2>
                            <button onClick={() => setModalOpen(false)} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-slate-200 px-6 pt-2 gap-1">
                            {TABS.map(t => (
                                <button key={t.key} onClick={() => setTab(t.key)}
                                    className={cn('flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors',
                                        tab === t.key
                                            ? 'border-indigo-600 text-indigo-600'
                                            : 'border-transparent text-slate-500 hover:text-slate-700')}>
                                    <t.icon className="w-3.5 h-3.5" />
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        {/* Body */}
                        <div className="overflow-y-auto px-6 py-5 space-y-4 flex-1">

                            {/* ── Tab: PERSONAL ── */}
                            {tab === 'personal' && (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Apellidos *</label>
                                            <input className="input w-full" value={editando.apellidos}
                                                onChange={e => setEditando(v => ({ ...v, apellidos: e.target.value }))}
                                                placeholder="Ej: Pérez García" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Nombres *</label>
                                            <input className="input w-full" value={editando.nombres}
                                                onChange={e => setEditando(v => ({ ...v, nombres: e.target.value }))}
                                                placeholder="Ej: Juan Carlos" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Cédula *</label>
                                            <input className="input w-full" value={editando.cedula}
                                                onChange={e => setEditando(v => ({ ...v, cedula: e.target.value }))}
                                                placeholder="1712345678" maxLength={13} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha de nacimiento</label>
                                            <input type="date" className="input w-full" value={editando.fecha_nacimiento ?? ''}
                                                onChange={e => setEditando(v => ({ ...v, fecha_nacimiento: e.target.value || null }))} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Estado civil</label>
                                            <select className="input w-full" value={editando.estado_civil ?? ''}
                                                onChange={e => setEditando(v => ({ ...v, estado_civil: (e.target.value as EstadoCivil) || null }))}>
                                                <option value="">—</option>
                                                <option value="soltero">Soltero/a</option>
                                                <option value="casado">Casado/a</option>
                                                <option value="union_libre">Unión libre</option>
                                                <option value="divorciado">Divorciado/a</option>
                                                <option value="viudo">Viudo/a</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Nacionalidad</label>
                                            <input className="input w-full" value={editando.nacionalidad ?? ''}
                                                onChange={e => setEditando(v => ({ ...v, nacionalidad: e.target.value || null }))}
                                                placeholder="Ecuatoriana" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Teléfono</label>
                                            <input className="input w-full" value={editando.telefono ?? ''}
                                                onChange={e => setEditando(v => ({ ...v, telefono: e.target.value || null }))}
                                                placeholder="0991234567" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
                                            <input type="email" className="input w-full" value={editando.email ?? ''}
                                                onChange={e => setEditando(v => ({ ...v, email: e.target.value || null }))}
                                                placeholder="empleado@empresa.com" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Ciudad</label>
                                            <input className="input w-full" value={editando.ciudad ?? ''}
                                                onChange={e => setEditando(v => ({ ...v, ciudad: e.target.value || null }))}
                                                placeholder="Quito" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Dirección</label>
                                            <input className="input w-full" value={editando.direccion ?? ''}
                                                onChange={e => setEditando(v => ({ ...v, direccion: e.target.value || null }))}
                                                placeholder="Calle y número" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1">URL de foto (opcional)</label>
                                        <input className="input w-full" value={editando.foto_url ?? ''}
                                            onChange={e => setEditando(v => ({ ...v, foto_url: e.target.value || null }))}
                                            placeholder="https://..." />
                                        {editando.foto_url && (
                                            <img src={editando.foto_url} alt="Foto empleado"
                                                className="mt-2 w-16 h-16 rounded-full object-cover border border-slate-200"
                                                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                                        )}
                                    </div>
                                </>
                            )}

                            {/* ── Tab: LABORAL ── */}
                            {tab === 'laboral' && (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Sección / Departamento</label>
                                            <select className="input w-full" value={editando.seccion_id ?? ''}
                                                onChange={e => setEditando(v => ({ ...v, seccion_id: e.target.value || null }))}>
                                                <option value="">— Sin sección —</option>
                                                {secciones.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Cargo / Puesto</label>
                                            <select className="input w-full" value={editando.cargo_id ?? ''}
                                                onChange={e => setEditando(v => ({ ...v, cargo_id: e.target.value || null }))}>
                                                <option value="">— Sin cargo —</option>
                                                {cargos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1">Jefe inmediato</label>
                                        <select className="input w-full" value={editando.jefe_inmediato_id ?? ''}
                                            onChange={e => setEditando(v => ({ ...v, jefe_inmediato_id: e.target.value || null }))}>
                                            <option value="">— Sin jefe —</option>
                                            {opcionesJefe.map(j => (
                                                <option key={j.id} value={j.id}>{j.apellidos} {j.nombres}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de contrato</label>
                                            <select className="input w-full" value={editando.tipo_contrato ?? ''}
                                                onChange={e => setEditando(v => ({ ...v, tipo_contrato: (e.target.value as TipoContrato) || null }))}>
                                                <option value="">—</option>
                                                <option value="indefinido">Indefinido</option>
                                                <option value="plazo_fijo">Plazo fijo</option>
                                                <option value="prueba">A prueba</option>
                                                <option value="honorarios">Honorarios profesionales</option>
                                                <option value="servicios">Servicios ocasionales</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de jornada</label>
                                            <select className="input w-full" value={editando.tipo_jornada}
                                                onChange={e => setEditando(v => ({ ...v, tipo_jornada: e.target.value as TipoJornada }))}>
                                                <option value="completa">Tiempo completo</option>
                                                <option value="parcial">Tiempo parcial</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha de ingreso *</label>
                                            <input type="date" className="input w-full" value={editando.fecha_ingreso}
                                                onChange={e => setEditando(v => ({ ...v, fecha_ingreso: e.target.value }))} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha de salida</label>
                                            <input type="date" className="input w-full" value={editando.fecha_salida ?? ''}
                                                onChange={e => setEditando(v => ({ ...v, fecha_salida: e.target.value || null }))} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de nómina</label>
                                            <select className="input w-full" value={editando.tipo_nomina}
                                                onChange={e => setEditando(v => ({ ...v, tipo_nomina: e.target.value as TipoNomina }))}>
                                                <option value="mensual">Mensual</option>
                                                <option value="quincenal">Quincenal</option>
                                                <option value="quincenal_y_mensual">Quincenal y mensual</option>
                                                <option value="por_hora">Por hora</option>
                                                <option value="destajo">Por destajo</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Sueldo base (USD)</label>
                                            <input type="number" step="0.01" min="0" className="input w-full"
                                                value={editando.sueldo_base}
                                                onChange={e => setEditando(v => ({ ...v, sueldo_base: parseFloat(e.target.value) || 0 }))} />
                                        </div>
                                    </div>

                                    {/* Indicador de cambio salarial + motivo */}
                                    {sueldoCambio && (
                                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                                            <p className="text-xs font-semibold text-amber-700 flex items-center gap-1.5">
                                                <History className="w-3.5 h-3.5" />
                                                Cambio de sueldo detectado: ${sueldoOriginalRef.current.toFixed(2)} → ${(Number(editando.sueldo_base) || 0).toFixed(2)}
                                            </p>
                                            <div>
                                                <label className="block text-xs font-semibold text-amber-700 mb-1">Motivo del cambio (opcional)</label>
                                                <input className="input w-full text-sm" value={motivoCambio}
                                                    onChange={e => setMotivoCambio(e.target.value)}
                                                    placeholder="Ej: Aumento anual, Cambio de cargo, etc." />
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex items-center pt-1">
                                        <label className="flex items-center gap-2 cursor-pointer select-none">
                                            <input type="checkbox" className="w-4 h-4 rounded accent-indigo-600"
                                                checked={editando.afiliado_iess}
                                                onChange={e => setEditando(v => ({ ...v, afiliado_iess: e.target.checked }))} />
                                            <span className="text-sm font-medium text-slate-700">Afiliado al IESS</span>
                                        </label>
                                    </div>

                                    <div className="border-t border-slate-100 pt-4">
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Datos bancarios</p>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-600 mb-1">Banco</label>
                                                <input className="input w-full" value={editando.banco ?? ''}
                                                    onChange={e => setEditando(v => ({ ...v, banco: e.target.value || null }))}
                                                    placeholder="Ej: Pichincha" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de cuenta</label>
                                                <select className="input w-full" value={editando.tipo_cuenta ?? ''}
                                                    onChange={e => setEditando(v => ({ ...v, tipo_cuenta: e.target.value || null }))}>
                                                    <option value="">—</option>
                                                    <option value="ahorros">Ahorros</option>
                                                    <option value="corriente">Corriente</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-600 mb-1">Número de cuenta</label>
                                                <input className="input w-full" value={editando.numero_cuenta ?? ''}
                                                    onChange={e => setEditando(v => ({ ...v, numero_cuenta: e.target.value || null }))}
                                                    placeholder="2200123456" />
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* ── Tab: NÓMINA ── */}
                            {tab === 'nomina' && (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Décimo tercero</label>
                                            <select className="input w-full" value={editando.decimo_tercero_modo}
                                                onChange={e => setEditando(v => ({ ...v, decimo_tercero_modo: e.target.value as ModoDecimo }))}>
                                                <option value="mensualizado">Mensualizado (en el rol)</option>
                                                <option value="acumulado">Acumulado (pago en diciembre)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Décimo cuarto</label>
                                            <select className="input w-full" value={editando.decimo_cuarto_modo}
                                                onChange={e => setEditando(v => ({ ...v, decimo_cuarto_modo: e.target.value as ModoDecimo }))}>
                                                <option value="mensualizado">Mensualizado (en el rol)</option>
                                                <option value="acumulado">Acumulado (pago en agosto/marzo)</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1">Fondo de reserva (desde mes 13)</label>
                                        <select className="input w-full" value={editando.fondo_reserva_modo}
                                            onChange={e => setEditando(v => ({ ...v, fondo_reserva_modo: e.target.value as ModoFondoReserva }))}>
                                            <option value="mensual">Pago mensual en el rol (8.33%)</option>
                                            <option value="acumulado_iess">Acumulado en IESS</option>
                                            <option value="no_aplica">No aplica (menos de 1 año)</option>
                                        </select>
                                    </div>
                                    <div className="max-w-[50%]">
                                        <label className="block text-xs font-semibold text-slate-600 mb-1">Cargas familiares (Impuesto a la Renta)</label>
                                        <input type="number" min="0" max="20" step="1" className="input w-full"
                                            value={editando.cargas_familiares}
                                            onChange={e => setEditando(v => ({ ...v, cargas_familiares: parseInt(e.target.value) || 0 }))} />
                                        <p className="text-xs text-slate-400 mt-1">Número de cargas familiares reconocidas para la tabla de impuesto a la renta.</p>
                                    </div>

                                    {/* Anticipo de Quincena */}
                                    <div className="border-t border-slate-100 pt-4">
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Anticipo de Quincena</p>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de anticipo</label>
                                                <select className="input w-full"
                                                    value={editando.anticipo_tipo ?? ''}
                                                    onChange={e => setEditando(v => ({
                                                        ...v,
                                                        anticipo_tipo: (e.target.value as 'porcentaje' | 'fijo') || null,
                                                        anticipo_valor: null,
                                                    }))}>
                                                    <option value="">— Sin configurar (usa default 40%) —</option>
                                                    <option value="porcentaje">Porcentaje del sueldo</option>
                                                    <option value="fijo">Valor fijo</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-600 mb-1">
                                                    {editando.anticipo_tipo === 'fijo' ? 'Valor fijo ($)' : editando.anticipo_tipo === 'porcentaje' ? 'Porcentaje (%)' : 'Valor / %'}
                                                </label>
                                                <input
                                                    type="number" min="0"
                                                    step={editando.anticipo_tipo === 'porcentaje' ? '1' : '0.01'}
                                                    className="input w-full"
                                                    value={editando.anticipo_valor ?? ''}
                                                    onChange={e => setEditando(v => ({ ...v, anticipo_valor: parseFloat(e.target.value) || null }))}
                                                    placeholder={editando.anticipo_tipo === 'porcentaje' ? 'Ej: 40' : editando.anticipo_tipo === 'fijo' ? 'Ej: 200.00' : '—'}
                                                    disabled={!editando.anticipo_tipo}
                                                />
                                            </div>
                                        </div>
                                        {editando.anticipo_tipo && editando.anticipo_valor ? (
                                            <p className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 mt-2">
                                                {editando.anticipo_tipo === 'porcentaje'
                                                    ? `Anticipo: ${editando.anticipo_valor}% del sueldo = $${(Math.round((editando.sueldo_base * editando.anticipo_valor / 100) * 100) / 100).toFixed(2)}`
                                                    : `Anticipo fijo: $${(editando.anticipo_valor ?? 0).toFixed(2)}`
                                                }
                                            </p>
                                        ) : (
                                            <p className="text-xs text-slate-400 mt-2">Sin configurar: se usará el default de la empresa al generar el anticipo.</p>
                                        )}
                                    </div>
                                </>
                            )}

                            {/* ── Tab: ADICIONAL ── */}
                            {tab === 'adicional' && (
                                <>
                                    {/* Contacto de emergencia */}
                                    <div>
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Contacto de emergencia</p>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre completo</label>
                                                <input className="input w-full" value={editando.contacto_emergencia_nombre ?? ''}
                                                    onChange={e => setEditando(v => ({ ...v, contacto_emergencia_nombre: e.target.value || null }))}
                                                    placeholder="Ej: María López" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-600 mb-1">Relación</label>
                                                <input className="input w-full" value={editando.contacto_emergencia_relacion ?? ''}
                                                    onChange={e => setEditando(v => ({ ...v, contacto_emergencia_relacion: e.target.value || null }))}
                                                    placeholder="Ej: Cónyuge, Madre, Hermano" />
                                            </div>
                                        </div>
                                        <div className="mt-3 max-w-[50%]">
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Teléfono de contacto</label>
                                            <input className="input w-full" value={editando.contacto_emergencia_telefono ?? ''}
                                                onChange={e => setEditando(v => ({ ...v, contacto_emergencia_telefono: e.target.value || null }))}
                                                placeholder="0991234567" />
                                        </div>
                                    </div>

                                    {/* Observaciones */}
                                    <div className="border-t border-slate-100 pt-4">
                                        <label className="block text-xs font-semibold text-slate-600 mb-1">Observaciones generales</label>
                                        <textarea className="input w-full resize-none" rows={3}
                                            value={editando.observaciones ?? ''}
                                            onChange={e => setEditando(v => ({ ...v, observaciones: e.target.value || null }))}
                                            placeholder="Notas internas sobre el empleado..." />
                                    </div>

                                    {/* Historial salarial — solo al editar */}
                                    {editando.id && (
                                        <div className="border-t border-slate-100 pt-4">
                                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                                <History className="w-3.5 h-3.5" />
                                                Historial de cambios salariales
                                            </p>
                                            {historialLoading ? (
                                                <div className="flex items-center gap-2 text-slate-400 text-sm">
                                                    <Loader2 className="w-4 h-4 animate-spin" />Cargando...
                                                </div>
                                            ) : historial.length === 0 ? (
                                                <p className="text-sm text-slate-400">Sin registros de cambios salariales.</p>
                                            ) : (
                                                <table className="w-full text-xs">
                                                    <thead>
                                                        <tr className="text-slate-500 border-b border-slate-100">
                                                            <th className="text-left py-1.5 pr-3">Fecha</th>
                                                            <th className="text-right py-1.5 pr-3">Anterior</th>
                                                            <th className="text-right py-1.5 pr-3">Nuevo</th>
                                                            <th className="text-left py-1.5">Motivo</th>
                                                            <th className="py-1.5 w-8" />
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-50">
                                                        {historial.map(h => (
                                                            <tr key={h.id} className="hover:bg-slate-50">
                                                                <td className="py-1.5 pr-3 text-slate-600">{h.fecha}</td>
                                                                <td className="py-1.5 pr-3 text-right text-slate-500">${h.sueldo_anterior.toFixed(2)}</td>
                                                                <td className="py-1.5 pr-3 text-right font-semibold text-slate-800">${h.sueldo_nuevo.toFixed(2)}</td>
                                                                <td className="py-1.5 text-slate-500 truncate max-w-[120px]">{h.motivo ?? '—'}</td>
                                                                <td className="py-1.5 text-right">
                                                                    <button onClick={() => handleEliminarHistorial(h.id)}
                                                                        className="p-1 text-slate-300 hover:text-red-400 transition-colors">
                                                                        <Trash2 className="w-3.5 h-3.5" />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
                            <div className="flex gap-1">
                                {TABS.map(t => (
                                    <div key={t.key}
                                        className={cn('w-2 h-2 rounded-full transition-colors cursor-pointer', tab === t.key ? 'bg-indigo-600' : 'bg-slate-300')}
                                        onClick={() => setTab(t.key)}
                                        title={t.label} />
                                ))}
                            </div>
                            <div className="flex gap-3">
                                <button onClick={() => setModalOpen(false)}
                                    className="btn btn-secondary flex items-center gap-2">
                                    <X className="w-4 h-4" /> Cancelar
                                </button>
                                <button onClick={handleSave} disabled={saving}
                                    className="btn btn-primary flex items-center gap-2">
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    {saving ? 'Guardando...' : 'Guardar'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
