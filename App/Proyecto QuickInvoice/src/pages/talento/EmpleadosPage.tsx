import { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { empleadosService } from '../../services/nominas/empleadosService'
import { estructuraOrganizativaService } from '../../services/nominas/estructuraOrganizativaService'
import type { Empleado, SeccionNomina, CargoNomina, TipoJornada, TipoNomina, ModoDecimo, ModoFondoReserva } from '../../types/nominas'
import { Users, Plus, Edit2, Save, X, UserX, RotateCcw, Loader2, Briefcase, CreditCard } from 'lucide-react'
import { cn } from '../../lib/utils'

type TabForm = 'personal' | 'laboral' | 'nomina'

const EMPTY: Omit<Empleado, 'id' | 'empresa_id' | 'created_at' | 'updated_at' | 'activo' | 'seccion' | 'cargo' | 'jefe'> = {
    nombres: '',
    apellidos: '',
    cedula: '',
    fecha_nacimiento: null,
    telefono: null,
    email: null,
    direccion: null,
    seccion_id: null,
    cargo_id: null,
    jefe_inmediato_id: null,
    fecha_ingreso: new Date().toISOString().slice(0, 10),
    fecha_salida: null,
    tipo_jornada: 'completa',
    tipo_nomina: 'mensual',
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
}

export function EmpleadosPage() {
    const { empresa } = useAuth()
    const [empleados, setEmpleados] = useState<Empleado[]>([])
    const [secciones, setSecciones] = useState<SeccionNomina[]>([])
    const [cargos, setCargos] = useState<CargoNomina[]>([])
    const [loading, setLoading] = useState(true)

    const [modalOpen, setModalOpen] = useState(false)
    const [editando, setEditando] = useState<(typeof EMPTY) & { id?: string }>({ ...EMPTY })
    const [saving, setSaving] = useState(false)
    const [tab, setTab] = useState<TabForm>('personal')

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
        setTab('personal')
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
            seccion_id: emp.seccion_id ?? null,
            cargo_id: emp.cargo_id ?? null,
            jefe_inmediato_id: emp.jefe_inmediato_id ?? null,
            fecha_ingreso: emp.fecha_ingreso,
            fecha_salida: emp.fecha_salida ?? null,
            tipo_jornada: emp.tipo_jornada,
            tipo_nomina: emp.tipo_nomina,
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
        })
        setTab('personal')
        setModalOpen(true)
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
            const payload = {
                empresa_id: empresa!.id,
                nombres: editando.nombres.trim(),
                apellidos: editando.apellidos.trim(),
                cedula: editando.cedula.trim(),
                fecha_nacimiento: editando.fecha_nacimiento || null,
                telefono: editando.telefono || null,
                email: editando.email || null,
                direccion: editando.direccion || null,
                seccion_id: editando.seccion_id || null,
                cargo_id: editando.cargo_id || null,
                jefe_inmediato_id: editando.jefe_inmediato_id || null,
                fecha_ingreso: editando.fecha_ingreso,
                fecha_salida: editando.fecha_salida || null,
                tipo_jornada: editando.tipo_jornada,
                tipo_nomina: editando.tipo_nomina,
                sueldo_base: Number(editando.sueldo_base) || 0,
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
            }
            if (editando.id) {
                await empleadosService.actualizarEmpleado(editando.id, payload)
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

    const nombresCompletos = (e: Empleado) => `${e.apellidos} ${e.nombres}`

    // Solo empleados activos como opciones de jefe (excluyendo el que se está editando)
    const opcionesJefe = empleados.filter(e => e.activo && e.id !== editando.id)

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
        )
    }

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
                            {([
                                { key: 'personal', label: 'Datos Personales', icon: Users },
                                { key: 'laboral',  label: 'Datos Laborales',  icon: Briefcase },
                                { key: 'nomina',   label: 'Parámetros Nómina', icon: CreditCard },
                            ] as { key: TabForm; label: string; icon: any }[]).map(t => (
                                <button key={t.key} onClick={() => setTab(t.key)}
                                    className={cn('flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors',
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
                                    <div>
                                        <label className="block text-xs font-semibold text-slate-600 mb-1">Dirección</label>
                                        <input className="input w-full" value={editando.direccion ?? ''}
                                            onChange={e => setEditando(v => ({ ...v, direccion: e.target.value || null }))}
                                            placeholder="Calle, número, ciudad" />
                                    </div>
                                </>
                            )}

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
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de jornada</label>
                                            <select className="input w-full" value={editando.tipo_jornada}
                                                onChange={e => setEditando(v => ({ ...v, tipo_jornada: e.target.value as TipoJornada }))}>
                                                <option value="completa">Tiempo completo</option>
                                                <option value="parcial">Tiempo parcial</option>
                                            </select>
                                        </div>
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
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-600 mb-1">Sueldo base (USD)</label>
                                            <input type="number" step="0.01" min="0" className="input w-full"
                                                value={editando.sueldo_base}
                                                onChange={e => setEditando(v => ({ ...v, sueldo_base: parseFloat(e.target.value) || 0 }))} />
                                        </div>
                                        <div className="flex items-end pb-1">
                                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                                <input type="checkbox" className="w-4 h-4 rounded accent-indigo-600"
                                                    checked={editando.afiliado_iess}
                                                    onChange={e => setEditando(v => ({ ...v, afiliado_iess: e.target.checked }))} />
                                                <span className="text-sm font-medium text-slate-700">Afiliado al IESS</span>
                                            </label>
                                        </div>
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
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
                            <div className="flex gap-1">
                                {(['personal', 'laboral', 'nomina'] as TabForm[]).map((t, i) => (
                                    <div key={t} className={cn('w-2 h-2 rounded-full transition-colors', tab === t ? 'bg-indigo-600' : 'bg-slate-300')}
                                        title={['Personales', 'Laborales', 'Nómina'][i]} />
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
