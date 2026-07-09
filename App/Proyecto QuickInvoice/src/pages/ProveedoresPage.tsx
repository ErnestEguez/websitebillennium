import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { proveedorService } from '../services/vendorService'
import type { Proveedor } from '../types/vendors'
import { REGIMEN_LABELS } from '../types/vendors'
import { codigoRetencionService, type CodigoRetencion } from '../services/codigoRetencionService'
import {
    Building2, Plus, Edit2, Save, X, Search,
    Phone, Mail, MapPin, AlertCircle,
} from 'lucide-react'

const PROVINCIAS_EC = [
    'Azuay','Bolívar','Cañar','Carchi','Chimborazo','Cotopaxi',
    'El Oro','Esmeraldas','Galápagos','Guayas','Imbabura','Loja',
    'Los Ríos','Manabí','Morona Santiago','Napo','Orellana',
    'Pastaza','Pichincha','Santa Elena','Santo Domingo','Sucumbíos',
    'Tungurahua','Zamora Chinchipe',
]

const PROVEEDOR_VACIO: Partial<Proveedor> = {
    tipo_identificacion: 'RUC',
    tipo_proveedor: 'SOCIEDAD',
    estado: 'ACTIVO',
    condicion_pago: 'CONTADO',
    pais: 'Ecuador',
    contribuyente_especial: false,
    agente_retencion: false,
    tipo_regimen: 'GENERAL',
}

function Badge({ estado }: { estado: string }) {
    const color = estado === 'ACTIVO'
        ? 'bg-green-100 text-green-700'
        : 'bg-slate-100 text-slate-500'
    return (
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>
            {estado}
        </span>
    )
}

export function ProveedoresPage() {
    const { empresa } = useAuth()
    const [proveedores, setProveedores] = useState<Proveedor[]>([])
    const [loading, setLoading] = useState(true)
    const [busqueda, setBusqueda] = useState('')
    const [filtroEstado, setFiltroEstado] = useState<'TODOS' | 'ACTIVO' | 'INACTIVO'>('ACTIVO')
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editando, setEditando] = useState<Partial<Proveedor>>(PROVEEDOR_VACIO)
    const [tabForm, setTabForm] = useState<'basico' | 'tributario' | 'pago'>('basico')
    const [saving, setSaving] = useState(false)
    const [codsRet, setCodsRet] = useState<CodigoRetencion[]>([])

    useEffect(() => { if (empresa?.id) load() }, [empresa?.id])
    useEffect(() => {
        if (!empresa?.id) return
        codigoRetencionService.listar(empresa.id).then(async (lista) => {
            if (lista.length === 0) {
                await codigoRetencionService.sembrarDefaults(empresa!.id)
                const seeded = await codigoRetencionService.listar(empresa!.id)
                setCodsRet(seeded)
            } else {
                setCodsRet(lista)
            }
        }).catch((err) => {
            console.error('Error cargando códigos de retención:', err?.message || err)
            setCodsRet([])
        })
    }, [empresa?.id])

    async function load() {
        try {
            setLoading(true)
            const data = await proveedorService.listar(empresa!.id)
            setProveedores(data)
        } catch (e: any) {
            alert('Error al cargar proveedores: ' + e.message)
        } finally {
            setLoading(false)
        }
    }

    function abrirNuevo() {
        setEditando({ ...PROVEEDOR_VACIO, empresa_id: empresa!.id })
        setTabForm('basico')
        setIsModalOpen(true)
    }

    function abrirEditar(p: Proveedor) {
        setEditando(p)
        setTabForm('basico')
        setIsModalOpen(true)
    }

    async function handleSave() {
        if (!editando.ruc || !editando.nombre_empresa) {
            alert('RUC y Nombre de Empresa son obligatorios')
            return
        }
        try {
            setSaving(true)
            if (editando.id) {
                await proveedorService.actualizar(editando.id, editando)
            } else {
                await proveedorService.crear({
                    ...editando,
                    empresa_id: empresa!.id,
                } as Omit<Proveedor, 'id' | 'created_at' | 'updated_at'>)
            }
            await load()
            setIsModalOpen(false)
        } catch (e: any) {
            alert('Error al guardar: ' + e.message)
        } finally {
            setSaving(false)
        }
    }

    async function handleDesactivar(p: Proveedor) {
        const accion = p.estado === 'ACTIVO' ? 'desactivar' : 'activar'
        if (!confirm(`¿Deseas ${accion} el proveedor "${p.nombre_empresa}"?`)) return
        try {
            await proveedorService.actualizar(p.id, {
                estado: p.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO'
            })
            await load()
        } catch (e: any) {
            alert('Error: ' + e.message)
        }
    }

    const visibles = proveedores.filter(p => {
        const matchEstado = filtroEstado === 'TODOS' || p.estado === filtroEstado
        const q = busqueda.toLowerCase()
        const matchQ = !q || p.nombre_empresa.toLowerCase().includes(q) || p.ruc.includes(q)
        return matchEstado && matchQ
    })

    const set = (campo: keyof Proveedor, val: any) =>
        setEditando(prev => ({ ...prev, [campo]: val }))

    if (loading) return (
        <div className="flex items-center justify-center h-64 text-slate-400">
            Cargando proveedores...
        </div>
    )

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Proveedores</h1>
                    <p className="text-slate-500 text-sm">{proveedores.filter(p => p.estado === 'ACTIVO').length} activos</p>
                </div>
                <button onClick={abrirNuevo} className="btn btn-primary flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Nuevo Proveedor
                </button>
            </div>

            {/* Filtros */}
            <div className="flex gap-3 flex-wrap">
                <div className="relative flex-1 min-w-60">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                        className="input pl-9 w-full"
                        placeholder="Buscar por nombre o RUC..."
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                    />
                </div>
                <div className="flex border border-slate-200 rounded-xl overflow-hidden text-sm">
                    {(['ACTIVO','TODOS','INACTIVO'] as const).map(f => (
                        <button key={f}
                            onClick={() => setFiltroEstado(f)}
                            className={`px-4 py-2 font-medium transition-colors ${
                                filtroEstado === f
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            {f === 'TODOS' ? 'Todos' : f === 'ACTIVO' ? 'Activos' : 'Inactivos'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {visibles.map(p => (
                    <div key={p.id} className={`card p-5 hover:shadow-md transition-shadow ${p.estado === 'INACTIVO' ? 'opacity-60' : ''}`}>
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center shrink-0">
                                    <Building2 className="w-5 h-5 text-primary-600" />
                                </div>
                                <div className="min-w-0">
                                    <p className="font-bold text-slate-900 truncate">{p.nombre_empresa}</p>
                                    <p className="text-xs text-slate-500">{p.tipo_identificacion}: {p.ruc}</p>
                                </div>
                            </div>
                            <Badge estado={p.estado ?? 'ACTIVO'} />
                        </div>

                        <div className="space-y-1.5 text-xs text-slate-600 mb-3">
                            {p.telefono && (
                                <div className="flex items-center gap-1.5">
                                    <Phone className="w-3 h-3 text-slate-400" /> {p.telefono}
                                </div>
                            )}
                            {p.correo && (
                                <div className="flex items-center gap-1.5">
                                    <Mail className="w-3 h-3 text-slate-400" /> {p.correo}
                                </div>
                            )}
                            {p.ciudad && (
                                <div className="flex items-center gap-1.5">
                                    <MapPin className="w-3 h-3 text-slate-400" /> {p.ciudad}{p.provincia ? `, ${p.provincia}` : ''}
                                </div>
                            )}
                        </div>

                        <div className="flex gap-1.5 flex-wrap mb-3">
                            <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                                {p.tipo_proveedor === 'PERSONA_NATURAL' ? 'Persona Natural' : 'Sociedad'}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                                p.condicion_pago === 'CREDITO'
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-blue-100 text-blue-700'
                            }`}>
                                {p.condicion_pago === 'CREDITO' ? `Crédito ${p.dias_credito ?? ''}d` : 'Contado'}
                            </span>
                            {p.contribuyente_especial && (
                                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                                    Contrib. Especial
                                </span>
                            )}
                        </div>

                        <div className="flex gap-2 pt-3 border-t border-slate-100">
                            <button
                                onClick={() => abrirEditar(p)}
                                className="flex-1 text-xs btn btn-secondary py-1.5"
                            >
                                <Edit2 className="w-3 h-3 mr-1 inline" /> Editar
                            </button>
                            <button
                                onClick={() => handleDesactivar(p)}
                                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                                    p.estado === 'ACTIVO'
                                        ? 'text-red-600 hover:bg-red-50'
                                        : 'text-green-600 hover:bg-green-50'
                                }`}
                            >
                                {p.estado === 'ACTIVO' ? 'Desactivar' : 'Activar'}
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {visibles.length === 0 && (
                <div className="text-center py-16">
                    <Building2 className="w-14 h-14 text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-400">
                        {busqueda ? 'Sin resultados para tu búsqueda' : 'No hay proveedores registrados'}
                    </p>
                    {!busqueda && (
                        <button onClick={abrirNuevo} className="btn btn-primary mt-4">
                            Crear Primer Proveedor
                        </button>
                    )}
                </div>
            )}

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">

                        {/* Header modal */}
                        <div className="flex items-center justify-between p-6 border-b border-slate-100">
                            <h2 className="text-xl font-bold text-slate-900">
                                {editando.id ? 'Editar Proveedor' : 'Nuevo Proveedor'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-slate-100 px-6">
                            {([
                                { id: 'basico',     label: 'Datos básicos' },
                                { id: 'tributario', label: 'Tributario / SRI' },
                                { id: 'pago',       label: 'Condiciones de pago' },
                            ] as const).map(t => (
                                <button key={t.id}
                                    onClick={() => setTabForm(t.id)}
                                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                                        tabForm === t.id
                                            ? 'border-primary-600 text-primary-700'
                                            : 'border-transparent text-slate-500 hover:text-slate-700'
                                    }`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4">

                            {/* ── TAB: Datos básicos ── */}
                            {tabForm === 'basico' && (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="label">Tipo de ID <span className="text-red-500">*</span></label>
                                            <select className="input" value={editando.tipo_identificacion ?? 'RUC'}
                                                onChange={e => set('tipo_identificacion', e.target.value)}>
                                                <option value="RUC">RUC</option>
                                                <option value="CEDULA">Cédula</option>
                                                <option value="PASAPORTE">Pasaporte</option>
                                                <option value="EXTERIOR">Exterior</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="label">Número <span className="text-red-500">*</span></label>
                                            <input className="input" maxLength={13}
                                                value={editando.ruc ?? ''}
                                                onChange={e => set('ruc', e.target.value)}
                                                placeholder="1234567890001" />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="label">Tipo de proveedor</label>
                                            <select className="input" value={editando.tipo_proveedor ?? 'SOCIEDAD'}
                                                onChange={e => set('tipo_proveedor', e.target.value)}>
                                                <option value="SOCIEDAD">Sociedad</option>
                                                <option value="PERSONA_NATURAL">Persona Natural</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="label">Estado</label>
                                            <select className="input" value={editando.estado ?? 'ACTIVO'}
                                                onChange={e => set('estado', e.target.value)}>
                                                <option value="ACTIVO">Activo</option>
                                                <option value="INACTIVO">Inactivo</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="label">Razón social / Nombre <span className="text-red-500">*</span></label>
                                        <input className="input" value={editando.nombre_empresa ?? ''}
                                            onChange={e => set('nombre_empresa', e.target.value)}
                                            placeholder="DISTRIBUIDORA XYZ S.A." />
                                    </div>

                                    <div>
                                        <label className="label">Nombre del encargado / contacto</label>
                                        <input className="input" value={editando.nombre_encargado ?? ''}
                                            onChange={e => set('nombre_encargado', e.target.value)}
                                            placeholder="Juan Pérez" />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="label">Teléfono</label>
                                            <input className="input" value={editando.telefono ?? ''}
                                                onChange={e => set('telefono', e.target.value)}
                                                placeholder="0999999999" />
                                        </div>
                                        <div>
                                            <label className="label">Email</label>
                                            <input className="input" type="email" value={editando.correo ?? ''}
                                                onChange={e => set('correo', e.target.value)}
                                                placeholder="contacto@proveedor.com" />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="label">Dirección</label>
                                        <input className="input" value={editando.direccion ?? ''}
                                            onChange={e => set('direccion', e.target.value)}
                                            placeholder="Av. Principal 123" />
                                    </div>

                                    <div className="grid grid-cols-3 gap-4">
                                        <div>
                                            <label className="label">Ciudad</label>
                                            <input className="input" value={editando.ciudad ?? ''}
                                                onChange={e => set('ciudad', e.target.value)}
                                                placeholder="Guayaquil" />
                                        </div>
                                        <div>
                                            <label className="label">Provincia</label>
                                            <select className="input" value={editando.provincia ?? ''}
                                                onChange={e => set('provincia', e.target.value)}>
                                                <option value="">Seleccionar...</option>
                                                {PROVINCIAS_EC.map(pr => (
                                                    <option key={pr} value={pr}>{pr}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="label">País</label>
                                            <input className="input" value={editando.pais ?? 'Ecuador'}
                                                onChange={e => set('pais', e.target.value)} />
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* ── TAB: Tributario ── */}
                            {tabForm === 'tributario' && (
                                <>
                                    <div>
                                        <label className="label">Régimen tributario</label>
                                        <select className="input" value={editando.tipo_regimen ?? 'GENERAL'}
                                            onChange={e => set('tipo_regimen', e.target.value)}>
                                            {Object.entries(REGIMEN_LABELS).map(([k, v]) => (
                                                <option key={k} value={k}>{v}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="space-y-3 pt-2">
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input type="checkbox"
                                                className="w-4 h-4 rounded border-slate-300 text-primary-600"
                                                checked={!!editando.contribuyente_especial}
                                                onChange={e => set('contribuyente_especial', e.target.checked)} />
                                            <div>
                                                <p className="text-sm font-medium text-slate-700">Contribuyente especial</p>
                                                <p className="text-xs text-slate-400">Designado por el SRI como contribuyente especial</p>
                                            </div>
                                        </label>

                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input type="checkbox"
                                                className="w-4 h-4 rounded border-slate-300 text-primary-600"
                                                checked={!!editando.agente_retencion}
                                                onChange={e => set('agente_retencion', e.target.checked)} />
                                            <div>
                                                <p className="text-sm font-medium text-slate-700">Agente de retención</p>
                                                <p className="text-xs text-slate-400">Está obligado a retener impuestos en la fuente</p>
                                            </div>
                                        </label>
                                    </div>

                                    {/* Retenciones automáticas predeterminadas */}
                                    <div className="border-t border-slate-100 pt-4 space-y-3">
                                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Retenciones automáticas (predeterminadas)</p>
                                        <p className="text-[11px] text-slate-400">Se sugieren automáticamente al registrar compras de este proveedor.</p>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="label text-xs">Ret. Fuente — Código SRI</label>
                                                <select className="input text-sm"
                                                    value={editando.ret_fuente_codigo ?? ''}
                                                    onChange={e => {
                                                        const cod = codsRet.find(c => c.codigo === e.target.value && c.tipo === 'FUENTE')
                                                        set('ret_fuente_codigo', e.target.value || null)
                                                        set('ret_fuente_porcentaje', cod?.porcentaje ?? null)
                                                    }}>
                                                    <option value="">— Sin retención —</option>
                                                    {codsRet.filter(c => c.tipo === 'FUENTE' && c.activo).map(c => (
                                                        <option key={c.id} value={c.codigo}>{c.codigo} — {c.porcentaje}% — {c.descripcion.slice(0, 50)}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="label text-xs">Ret. IVA — Código SRI</label>
                                                <select className="input text-sm"
                                                    value={editando.ret_iva_codigo ?? ''}
                                                    onChange={e => {
                                                        const cod = codsRet.find(c => c.codigo === e.target.value && c.tipo === 'IVA')
                                                        set('ret_iva_codigo', e.target.value || null)
                                                        set('ret_iva_porcentaje', cod?.porcentaje ?? null)
                                                    }}>
                                                    <option value="">— Sin retención —</option>
                                                    {codsRet.filter(c => c.tipo === 'IVA' && c.activo).map(c => (
                                                        <option key={c.id} value={c.codigo}>{c.codigo} — {c.porcentaje}% — {c.descripcion.slice(0, 50)}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 flex gap-3">
                                        <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                                        <p className="text-xs text-blue-700">
                                            Esta información se utiliza para la generación del ATS y para determinar si corresponde aplicar retenciones al momento de la compra.
                                        </p>
                                    </div>
                                </>
                            )}

                            {/* ── TAB: Condiciones de pago ── */}
                            {tabForm === 'pago' && (
                                <>
                                    <div>
                                        <label className="label">Condición de pago predeterminada</label>
                                        <div className="flex gap-3">
                                            {(['CONTADO', 'CREDITO'] as const).map(c => (
                                                <button key={c} type="button"
                                                    onClick={() => set('condicion_pago', c)}
                                                    className={`flex-1 py-3 rounded-xl border-2 font-medium text-sm transition-colors ${
                                                        editando.condicion_pago === c
                                                            ? 'border-primary-600 bg-primary-50 text-primary-700'
                                                            : 'border-slate-200 text-slate-500 hover:border-slate-300'
                                                    }`}
                                                >
                                                    {c === 'CONTADO' ? '💵 Contado' : '📅 Crédito'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {editando.condicion_pago === 'CREDITO' && (
                                        <div>
                                            <label className="label">Días de crédito</label>
                                            <input className="input max-w-xs" type="number" min={1} max={365}
                                                value={editando.dias_credito ?? ''}
                                                onChange={e => set('dias_credito', parseInt(e.target.value) || null)}
                                                placeholder="30" />
                                            <p className="text-xs text-slate-400 mt-1">
                                                Días estándar para el vencimiento de facturas a crédito de este proveedor
                                            </p>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="flex gap-3 justify-end p-6 border-t border-slate-100">
                            {tabForm !== 'basico' && (
                                <button className="btn btn-secondary"
                                    onClick={() => setTabForm(tabForm === 'pago' ? 'tributario' : 'basico')}>
                                    ← Anterior
                                </button>
                            )}
                            {tabForm !== 'pago' ? (
                                <button className="btn btn-secondary"
                                    onClick={() => setTabForm(tabForm === 'basico' ? 'tributario' : 'pago')}>
                                    Siguiente →
                                </button>
                            ) : null}
                            <button onClick={handleSave} disabled={saving} className="btn btn-primary flex items-center gap-2">
                                {saving
                                    ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Guardando...</>
                                    : <><Save className="w-4 h-4" /> Guardar</>
                                }
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
