import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { supabasePortal } from '../lib/supabasePortal'
import { useAuth } from '../contexts/AuthContext'
import { staffService } from '../services/staffService'
import { sriService } from '../services/sriService'
import { mesaService, type Mesa } from '../services/mesaService'
import type { StaffMember } from '../services/staffService'
import {
    Users, Building2, Save, Plus, Trash2, Edit2, Shield,
    Percent, Image as ImageIcon, Loader2, Grid, Utensils,
    RefreshCcw, X, ArrowLeft, Bomb, Tag, Link2
} from 'lucide-react'
import { categoriaService, type Categoria } from '../services/categoriaService'
import { cn } from '../lib/utils'

export function ConfigurationPage() {
    const { empresa, profile } = useAuth()
    const [activeTab, setActiveTab]         = useState<'empresa' | 'staff' | 'mesas' | 'categorias' | 'plataforma'>('empresa')
    const [platformSubTab, setPlatformSubTab] = useState<'empresas' | 'personal'>('empresas')
    const [loading, setLoading]             = useState(true)
    const [saving, setSaving]               = useState(false)

    // ── Estado empresa (usuario oficina) ─────────────────
    const [companyData, setCompanyData] = useState<any>({
        nombre: '', ruc: '', direccion_matriz: '',
        logo_url: '', config_iva: 15, config_propina: 10
    })

    // ── Staff (mesero / cocina) ───────────────────────────
    const [staff, setStaff]               = useState<StaffMember[]>([])
    const [isStaffModalOpen, setIsStaffModalOpen] = useState(false)
    const [editingStaff, setEditingStaff] = useState<Partial<StaffMember> | null>(null)

    // ── Mesas ─────────────────────────────────────────────
    const [mesas, setMesas]               = useState<Mesa[]>([])
    const [isMesaModalOpen, setIsMesaModalOpen] = useState(false)
    const [editingMesa, setEditingMesa]   = useState<Partial<Mesa> | null>(null)

    // ── Categorías ────────────────────────────────────────
    const [categorias, setCategorias]     = useState<Categoria[]>([])
    const [isCategoriaModalOpen, setIsCategoriaModalOpen] = useState(false)
    const [editingCategoria, setEditingCategoria] = useState<Partial<Categoria> | null>(null)

    // ── Admin: empresas ───────────────────────────────────
    const [allEmpresas, setAllEmpresas]     = useState<any[]>([])
    const [isEmpresaModalOpen, setIsEmpresaModalOpen] = useState(false)
    const [editingEmpresa, setEditingEmpresa] = useState<any>(null)

    // ── Admin: usuarios del portal ────────────────────────
    const [portalUsers, setPortalUsers]       = useState<StaffMember[]>([])   // public.users → dropdown
    const [assignedProfiles, setAssignedProfiles] = useState<StaffMember[]>([]) // facturacion.profiles → tabla
    const [asignacion, setAsignacion]         = useState({ usuario_id: '', empresa_id: '' })
    const [asignandoId, setAsignandoId]       = useState<string | null>(null)
    const [msgAsig, setMsgAsig]               = useState<{ tipo: 'ok' | 'err'; texto: string } | null>(null)

    // ─────────────────────────────────────────────────────
    useEffect(() => {
        if (profile?.rol === 'admin_plataforma') setActiveTab('plataforma')
    }, [profile?.rol])

    useEffect(() => {
        if (profile) loadData()
    }, [profile?.id, empresa?.id])

    // ── Logo upload ───────────────────────────────────────
    async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return
        try {
            setSaving(true)
            const publicUrl = await sriService.uploadLogo(empresa!.id, file)
            setCompanyData({ ...companyData, logo_url: publicUrl })
            // Actualiza logo en facturacion.empresas (portal)
            await supabasePortal.from('empresas').update({ logo_url: publicUrl }).eq('id', empresa!.id)
            alert('Logo subido con éxito')
        } catch (error: any) {
            alert(`Error al subir logo: ${error.message}`)
        } finally {
            setSaving(false)
        }
    }

    // ── Carga de datos ────────────────────────────────────
    async function loadData() {
        const timeout = setTimeout(() => setLoading(false), 10000)
        try {
            setLoading(true)

            if (profile?.rol === 'admin_plataforma') {
                // Empresas: consulta directa a facturacion.empresas + merge config
                const { data: portalEmps } = await supabasePortal
                    .from('empresas').select('*').order('nombre')
                const { data: configs } = await supabase
                    .from('config_empresa').select('*')
                const merged = (portalEmps || []).map((e: any) => {
                    const cfg = (configs || []).find((c: any) => c.empresa_id === e.id)
                    return {
                        ...e,
                        direccion_matriz:          e.direccion,
                        config_iva:                cfg?.config_general?.config_iva     ?? 15,
                        config_propina:            cfg?.config_general?.config_propina  ?? 10,
                        usar_restoflow:            cfg?.usar_restoflow                  ?? false,
                        habilitar_division_cuenta: cfg?.habilitar_division_cuenta       ?? false,
                    }
                })
                setAllEmpresas(merged)

                // Dropdown: todos los usuarios del portal (public.users)
                try {
                    const users = await staffService.getPortalUsers()
                    setPortalUsers(users)
                } catch (e: any) {
                    console.error('[RestoFlow] getPortalUsers error:', e?.message)
                }

                // Tabla: usuarios ya asignados (facturacion.profiles oficina)
                try {
                    const assigned = await staffService.getOficinaUsers()
                    setAssignedProfiles(assigned)
                } catch (e: any) {
                    console.error('[RestoFlow] getOficinaUsers error:', e?.message)
                }
            }

            if (empresa?.id) {
                const [empResult, staffData, mesasData, categoriasData] = await Promise.all([
                    supabase.from('empresas').select('*').eq('id', empresa.id).single(),
                    staffService.getStaffByEmpresa(empresa.id),
                    mesaService.getMesas(),
                    categoriaService.getCategorias(empresa.id),
                ])
                if (empResult.data) setCompanyData(empResult.data)
                setStaff(staffData.filter(s => s.rol !== 'admin_plataforma' && s.id !== profile?.id))
                setMesas(mesasData)
                setCategorias(categoriasData)
            }
        } catch (err) {
            console.error('Error loading config:', err)
        } finally {
            clearTimeout(timeout)
            setLoading(false)
        }
    }

    // ── Guardar empresa (usuario oficina) ─────────────────
    async function handleSaveCompany(e: React.FormEvent) {
        e.preventDefault()
        try {
            setSaving(true)

            // 1. Actualiza campos base en facturacion.empresas (portal)
            await supabasePortal.from('empresas').update({
                nombre:    companyData.nombre,
                ruc:       companyData.ruc,
                direccion: companyData.direccion_matriz,
                logo_url:  companyData.logo_url,
            }).eq('id', empresa!.id)

            // 2. Upsert config RestoFlow en restaurantes.config_empresa
            const { error: cfgErr } = await supabase.from('config_empresa').upsert({
                empresa_id:   empresa!.id,
                usar_restoflow: true,
                config_general: {
                    config_iva:     companyData.config_iva,
                    config_propina: companyData.config_propina,
                },
            }, { onConflict: 'empresa_id' })

            if (cfgErr) throw cfgErr
            alert('Configuración guardada correctamente')
        } catch (error: any) {
            alert(`Error al guardar: ${error.message}`)
        } finally {
            setSaving(false)
        }
    }

    // ── Admin: guardar empresa (crear config RestoFlow o editar) ──
    async function handleSaveEmpresaFull() {
        try {
            setSaving(true)

            if (editingEmpresa?.id) {
                // Editar empresa existente
                // 1. Actualiza campos base (portal)
                const { error: portalErr } = await supabasePortal.from('empresas').update({
                    nombre:    editingEmpresa.nombre,
                    ruc:       editingEmpresa.ruc,
                    direccion: editingEmpresa.direccion_matriz,
                }).eq('id', editingEmpresa.id)
                if (portalErr) throw portalErr

                // 2. Upsert config RestoFlow
                const { error: cfgErr } = await supabase.from('config_empresa').upsert({
                    empresa_id:               editingEmpresa.id,
                    usar_restoflow:           true,
                    habilitar_division_cuenta: editingEmpresa.habilitar_division_cuenta ?? false,
                    config_general: {
                        config_iva:     editingEmpresa.config_iva     ?? 15,
                        config_propina: editingEmpresa.config_propina ?? 10,
                    },
                }, { onConflict: 'empresa_id' })
                if (cfgErr) throw cfgErr
            } else {
                // Nueva empresa: crear en facturacion.empresas y luego activar en RestoFlow
                if (!editingEmpresa?.nombre?.trim() || !editingEmpresa?.ruc?.trim()) {
                    alert('Nombre y RUC son obligatorios')
                    return
                }
                const newId = crypto.randomUUID()
                const { error: empErr } = await supabasePortal.from('empresas').insert({
                    id:           newId,
                    nombre:       editingEmpresa.nombre.trim(),
                    ruc:          editingEmpresa.ruc.trim(),
                    razon_social: editingEmpresa.razon_social?.trim() || editingEmpresa.nombre.trim(),
                    direccion:    editingEmpresa.direccion_matriz?.trim() || null,
                    telefono:     editingEmpresa.telefono?.trim() || null,
                })
                if (empErr) throw empErr

                const { error: cfgErr } = await supabase.from('config_empresa').upsert({
                    empresa_id:               newId,
                    usar_restoflow:           true,
                    habilitar_division_cuenta: editingEmpresa.habilitar_division_cuenta ?? false,
                    config_general: {
                        config_iva:     editingEmpresa.config_iva     ?? 15,
                        config_propina: editingEmpresa.config_propina ?? 10,
                    },
                }, { onConflict: 'empresa_id' })
                if (cfgErr) throw cfgErr
            }

            setIsEmpresaModalOpen(false)
            setEditingEmpresa(null)
            loadData()
            alert('Empresa guardada con éxito')
        } catch (error: any) {
            alert(`Error: ${error.message}`)
        } finally {
            setSaving(false)
        }
    }

    // ── Admin: eliminar empresa ───────────────────────────
    async function handleDeleteEmpresa(id: string) {
        if (!confirm('¿Eliminar esta empresa? Se eliminará del portal y de RestoFlow. Esta acción no se puede deshacer.')) return
        try {
            setSaving(true)
            // Primero eliminar config RestoFlow (FK)
            await supabase.from('config_empresa').delete().eq('empresa_id', id)
            // Luego eliminar de facturacion.empresas
            const { error } = await supabasePortal.from('empresas').delete().eq('id', id)
            if (error) throw error
            loadData()
        } catch (error: any) {
            alert(`Error al eliminar: ${error.message}`)
        } finally {
            setSaving(false)
        }
    }

    // ── Admin: asignar usuario del portal a empresa ───────
    async function handleAsignar() {
        if (!asignacion.usuario_id || !asignacion.empresa_id) {
            setMsgAsig({ tipo: 'err', texto: 'Selecciona un usuario y una empresa' })
            return
        }
        // Validar que el usuario no esté ya asignado a esa empresa
        const alreadyAssigned = assignedProfiles.find(
            u => u.empresa_id === asignacion.empresa_id &&
                 portalUsers.find(p => p.id === asignacion.usuario_id)?.email === u.email
        )
        if (alreadyAssigned) {
            setMsgAsig({ tipo: 'err', texto: 'Este usuario ya está asignado a esa empresa' })
            return
        }
        try {
            setAsignandoId(asignacion.usuario_id)
            setMsgAsig(null)
            await staffService.asignarUsuarioEmpresa(asignacion.usuario_id, asignacion.empresa_id)
            setMsgAsig({ tipo: 'ok', texto: `Usuario asignado correctamente a la empresa` })
            setAsignacion({ usuario_id: '', empresa_id: '' })
            loadData()
        } catch (err: any) {
            setMsgAsig({ tipo: 'err', texto: `Error: ${err.message}` })
        } finally {
            setAsignandoId(null)
        }
    }

    // ── Staff (mesero / cocina) ───────────────────────────
    async function handleSaveStaffMember() {
        try {
            setSaving(true)
            if (!editingStaff?.nombre || !editingStaff?.rol) {
                alert('Nombre y Rol son obligatorios')
                return
            }

            const dataToSave = {
                nombre:     editingStaff.nombre,
                rol:        editingStaff.rol as StaffMember['rol'],
                empresa_id: empresa?.id ?? editingStaff.empresa_id,
                email:      editingStaff.email,
                pin:        editingStaff.pin,
                estado:     editingStaff.estado,
                fecha_baja: editingStaff.fecha_baja,
                motivo_baja: editingStaff.motivo_baja,
            }

            if (!dataToSave.empresa_id) { alert('Empresa no definida'); return }

            if (editingStaff.id) {
                await staffService.updateStaffMember(editingStaff.id, dataToSave)
            } else {
                await staffService.createStaffMember({
                    ...dataToSave,
                    password: (editingStaff as any).password
                })
            }

            setIsStaffModalOpen(false)
            setEditingStaff(null)
            loadData()
        } catch (error: any) {
            alert(`Error al guardar personal: ${error.message}`)
        } finally {
            setSaving(false)
        }
    }

    async function handleDeleteStaff(id: string) {
        if (!confirm('¿Eliminar este miembro del personal?')) return
        try {
            await staffService.deleteStaffMember(id)
            loadData()
        } catch (error: any) {
            alert(`Error al eliminar: ${error.message}`)
        }
    }

    // ── Mesa ──────────────────────────────────────────────
    async function handleResetMesa(mesa: Mesa) {
        if (!confirm(`¿Resetear la Mesa ${mesa.numero}?`)) return
        try { await mesaService.resetMesa(mesa.id); loadData() }
        catch (err: any) { alert(`Error: ${err.message}`) }
    }

    async function handleSaveMesa() {
        try {
            setSaving(true)
            if (!editingMesa?.numero || !editingMesa?.capacidad) { alert('Número y Capacidad son obligatorios'); return }
            if (editingMesa.id) {
                await mesaService.updateMesa(editingMesa.id, editingMesa)
            } else {
                await mesaService.createMesa({ ...editingMesa, empresa_id: empresa!.id, estado: 'libre' } as any)
            }
            setIsMesaModalOpen(false); setEditingMesa(null); loadData()
        } catch (err: any) { alert(`Error: ${err.message}`) }
        finally { setSaving(false) }
    }

    async function handleDeleteMesa(id: string) {
        if (!confirm('¿Eliminar esta mesa?')) return
        try { await mesaService.deleteMesa(id); loadData() }
        catch (err: any) { alert(`Error: ${err.message}`) }
    }

    // ── Categoría ─────────────────────────────────────────
    async function handleSaveCategoria() {
        try {
            setSaving(true)
            if (!editingCategoria?.nombre) { alert('El nombre es obligatorio'); return }
            if (editingCategoria.id) {
                await categoriaService.updateCategoria(editingCategoria.id, editingCategoria)
            } else {
                await categoriaService.createCategoria({ ...editingCategoria, empresa_id: empresa!.id })
            }
            setIsCategoriaModalOpen(false); setEditingCategoria(null); loadData()
        } catch (err: any) { alert(`Error: ${err.message}`) }
        finally { setSaving(false) }
    }

    async function handleDeleteCategoria(id: string) {
        if (!confirm('¿Eliminar esta categoría?')) return
        try { await categoriaService.deleteCategoria(id); loadData() }
        catch (err: any) { alert(`Error: ${err.message}`) }
    }

    // ── Reset nuclear ──────────────────────────────────────
    async function handleNuclearReset(id: string, nombre: string) {
        if (!confirm(`⚠️ ¿Borrar TODO el movimiento de "${nombre}"? Es IRREVERSIBLE.`)) return
        const confirmacion = prompt(`Escribe el nombre de la empresa para confirmar: ${nombre}`)
        if (confirmacion !== nombre) { alert('Confirmación fallida.'); return }
        try {
            setSaving(true)
            const { data, error } = await supabase.rpc('reset_empresa_transaccional', { p_empresa_id: id })
            if (error) throw error
            if (data?.success) { alert(data.message); loadData() }
            else alert(`Error: ${data?.error || 'Desconocido'}`)
        } catch (err: any) { alert(`Error: ${err.message}`) }
        finally { setSaving(false) }
    }

    // ─────────────────────────────────────────────────────
    if (loading) return <div className="p-12 text-center">Cargando configuración...</div>

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Configuración</h1>
                    <p className="text-slate-500">{profile?.rol === 'admin_plataforma' ? 'Administración de Plataforma' : 'Gestiona tu empresa y personal'}</p>
                </div>
                {profile?.rol === 'admin_plataforma' && (
                    <a href="/" className="btn btn-secondary py-2 px-4 text-sm flex items-center gap-2">
                        <ArrowLeft className="w-4 h-4" /> Volver al Dashboard
                    </a>
                )}
            </div>

            {/* Tabs usuario oficina */}
            {profile?.rol !== 'admin_plataforma' && (
                <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
                    {(['empresa', 'staff', 'mesas', 'categorias'] as const).map(tab => {
                        const labels: Record<string, { icon: any; label: string; roles: string[] }> = {
                            empresa:    { icon: Building2, label: 'Empresa',    roles: ['oficina'] },
                            staff:      { icon: Users,     label: 'Personal',   roles: ['oficina'] },
                            mesas:      { icon: Grid,      label: 'Mesas',      roles: ['oficina'] },
                            categorias: { icon: Tag,       label: 'Categorías', roles: ['oficina'] },
                        }
                        const cfg = labels[tab]
                        if (!cfg.roles.includes(profile?.rol ?? '')) return null
                        const Icon = cfg.icon
                        return (
                            <button key={tab} onClick={() => setActiveTab(tab)}
                                className={cn(
                                    "flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all",
                                    activeTab === tab ? "bg-white text-primary-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                                )}>
                                <Icon className="w-4 h-4" />{cfg.label}
                            </button>
                        )
                    })}
                </div>
            )}

            {/* ── TAB: Empresa ─────────────────────────────── */}
            {activeTab === 'empresa' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2">
                        <form onSubmit={handleSaveCompany} className="card p-8 space-y-8">
                            <div className="flex items-center gap-4 pb-4 border-b border-slate-100">
                                <div className="p-3 bg-primary-50 text-primary-600 rounded-2xl"><Building2 className="w-6 h-6" /></div>
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900">Datos Generales</h2>
                                    <p className="text-sm text-slate-500">Información legal y visual del negocio</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Razón Social</label>
                                    <input type="text" className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500"
                                        value={companyData.nombre || ''}
                                        onChange={e => setCompanyData({ ...companyData, nombre: e.target.value })} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">RUC</label>
                                    <input type="text" className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500"
                                        value={companyData.ruc || ''}
                                        onChange={e => setCompanyData({ ...companyData, ruc: e.target.value })} />
                                </div>
                                <div className="md:col-span-2 space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Dirección Matriz</label>
                                    <input type="text" className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500"
                                        value={companyData.direccion_matriz || ''}
                                        onChange={e => setCompanyData({ ...companyData, direccion_matriz: e.target.value })} />
                                </div>
                                <div className="md:col-span-2 space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><ImageIcon className="w-3 h-3" /> Logo</label>
                                    <div className="flex items-center gap-4 p-4 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
                                        {companyData.logo_url
                                            ? <img src={companyData.logo_url} alt="Logo" className="w-20 h-20 object-contain rounded-lg border bg-white" />
                                            : <div className="w-20 h-20 bg-slate-200 rounded-lg flex items-center justify-center text-slate-400"><ImageIcon className="w-8 h-8" /></div>
                                        }
                                        <div className="flex-1">
                                            <p className="text-sm font-bold text-slate-700">Subir nuevo logo</p>
                                            <p className="text-xs text-slate-500 mb-3">Recomendado: PNG fondo transparente</p>
                                            <input type="file" accept="image/*" onChange={handleLogoUpload}
                                                className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-black file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 pt-4 pb-4 border-b border-slate-100">
                                <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl"><Percent className="w-6 h-6" /></div>
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900">Impuestos y Servicios</h2>
                                    <p className="text-sm text-slate-500">Valores aplicados a los pedidos</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">IVA por Defecto (%)</label>
                                    <div className="flex gap-2">
                                        {[0, 8, 15].map(v => (
                                            <button key={v} type="button"
                                                onClick={() => setCompanyData({ ...companyData, config_iva: v })}
                                                className={cn("flex-1 py-2 rounded-lg text-sm font-bold border transition-all",
                                                    companyData.config_iva === v ? "bg-primary-50 border-primary-200 text-primary-600" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300")}>
                                                {v}%
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Propina Sugerida (%)</label>
                                    <input type="number" className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500"
                                        value={companyData.config_propina}
                                        onChange={e => setCompanyData({ ...companyData, config_propina: parseFloat(e.target.value) })} />
                                </div>
                            </div>
                            <div className="pt-4">
                                <button type="submit" disabled={saving}
                                    className="btn btn-primary w-full py-4 text-lg font-black flex items-center justify-center gap-2">
                                    {saving ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Save className="w-6 h-6" /> Guardar Todo</>}
                                </button>
                            </div>
                        </form>
                    </div>
                    <div className="space-y-6">
                        <div className="card p-6 bg-primary-600 text-white">
                            <h3 className="font-bold flex items-center gap-2 mb-4"><Shield className="w-5 h-5 text-primary-200" />Resumen</h3>
                            <div className="space-y-4 text-sm">
                                <div className="flex justify-between border-b border-primary-500 pb-2">
                                    <span className="text-primary-100">IVA</span><span className="font-bold">{companyData.config_iva}%</span>
                                </div>
                                <div className="flex justify-between border-b border-primary-500 pb-2">
                                    <span className="text-primary-100">Propina</span><span className="font-bold">{companyData.config_propina}%</span>
                                </div>
                                <div className="flex justify-between pb-2">
                                    <span className="text-primary-100">RUC</span><span className="font-bold">{companyData.ruc || 'N/D'}</span>
                                </div>
                            </div>
                        </div>
                        {companyData.logo_url && (
                            <div className="card p-6 flex flex-col items-center">
                                <p className="text-xs font-black text-slate-300 uppercase tracking-widest mb-4">Logo</p>
                                <img src={companyData.logo_url} alt="Logo" className="max-h-32 object-contain rounded-xl" />
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── TAB: Staff ───────────────────────────────── */}
            {activeTab === 'staff' && (
                <div className="space-y-6">
                    <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Personal de Servicio</h2>
                            <p className="text-sm text-slate-500">Meseros y personal de cocina</p>
                        </div>
                        <button onClick={() => { setEditingStaff({ rol: 'mesero' }); setIsStaffModalOpen(true) }}
                            className="btn btn-primary py-2 px-4 text-sm flex items-center gap-2">
                            <Plus className="w-4 h-4" /> Nuevo Miembro
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {staff.map(member => (
                            <div key={member.id} className="card p-6 group">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg",
                                            member.rol === 'oficina' ? "bg-primary-100 text-primary-600" : "bg-slate-100 text-slate-600")}>
                                            {(member.nombre || '?')[0]}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-900">{member.nombre}</h3>
                                            <p className="text-xs text-slate-500">{member.rol}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        <button onClick={() => { setEditingStaff(member); setIsStaffModalOpen(true) }} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"><Edit2 className="w-4 h-4" /></button>
                                        <button onClick={() => handleDeleteStaff(member.id)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"><Trash2 className="w-4 h-4" /></button>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {staff.length === 0 && <div className="col-span-full py-12 text-center text-slate-400">No hay personal registrado.</div>}
                    </div>
                </div>
            )}

            {/* ── TAB: Mesas ───────────────────────────────── */}
            {activeTab === 'mesas' && (
                <div className="space-y-6">
                    <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Configuración de Mesas</h2>
                            <p className="text-sm text-slate-500">Distribución de tu restaurante</p>
                        </div>
                        <button onClick={() => { setEditingMesa({ capacidad: 4, estado: 'libre' }); setIsMesaModalOpen(true) }}
                            className="btn btn-primary py-2 px-4 text-sm flex items-center gap-2">
                            <Plus className="w-4 h-4" /> Nueva Mesa
                        </button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                        {mesas.map(mesa => (
                            <div key={mesa.id} className="card p-4 group relative hover:shadow-lg transition-all">
                                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => handleResetMesa(mesa)} title="Resetear" className="p-1.5 hover:bg-slate-100 rounded-lg text-amber-500"><RefreshCcw className="w-3 h-3" /></button>
                                    <button onClick={() => { setEditingMesa(mesa); setIsMesaModalOpen(true) }} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"><Edit2 className="w-3 h-3" /></button>
                                    <button onClick={() => handleDeleteMesa(mesa.id)} className="p-1.5 hover:bg-slate-100 rounded-lg text-red-400"><Trash2 className="w-3 h-3" /></button>
                                </div>
                                <div className="flex flex-col items-center justify-center py-4">
                                    <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mb-3"><Utensils className="w-8 h-8" /></div>
                                    <h3 className="font-bold text-slate-900 text-lg">Mesa {mesa.numero}</h3>
                                    <p className="text-xs text-slate-500 font-medium">{mesa.capacidad} Pers.</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── TAB: Categorías ──────────────────────────── */}
            {activeTab === 'categorias' && (
                <div className="space-y-6">
                    <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Categorías de Productos</h2>
                            <p className="text-sm text-slate-500">Clasificaciones para tu menú e inventario</p>
                        </div>
                        <button onClick={() => { setEditingCategoria({ nombre: '', tipo: 'ALIMENTO' }); setIsCategoriaModalOpen(true) }}
                            className="btn btn-primary py-2 px-4 text-sm flex items-center gap-2">
                            <Plus className="w-4 h-4" /> Nueva Categoría
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {categorias.map(cat => (
                            <div key={cat.id} className="card p-6 group relative hover:shadow-lg transition-all border-l-4 border-l-primary-500">
                                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => { setEditingCategoria(cat); setIsCategoriaModalOpen(true) }} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"><Edit2 className="w-4 h-4" /></button>
                                    <button onClick={() => handleDeleteCategoria(cat.id)} className="p-1.5 hover:bg-slate-100 rounded-lg text-red-400"><Trash2 className="w-4 h-4" /></button>
                                </div>
                                <h3 className="font-bold text-slate-900 text-lg uppercase tracking-tight">{cat.nombre}</h3>
                                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{cat.tipo || 'General'}</p>
                            </div>
                        ))}
                        {categorias.length === 0 && <div className="col-span-full py-12 text-center text-slate-400">No hay categorías registradas.</div>}
                    </div>
                </div>
            )}

            {/* ── TAB: Plataforma (admin) ───────────────────── */}
            {activeTab === 'plataforma' && (
                <div className="space-y-6">
                    {/* Sub-tabs */}
                    <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
                        <button onClick={() => setPlatformSubTab('empresas')}
                            className={cn("flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all",
                                platformSubTab === 'empresas' ? "bg-white text-primary-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                            <Building2 className="w-4 h-4" /> Empresas
                        </button>
                        <button onClick={() => setPlatformSubTab('personal')}
                            className={cn("flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all",
                                platformSubTab === 'personal' ? "bg-white text-primary-600 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                            <Users className="w-4 h-4" /> Personal
                        </button>
                    </div>

                    {/* ─ Sub-tab Empresas ─ */}
                    {platformSubTab === 'empresas' && (
                        <>
                            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900">Gestión de Empresas (SaaS)</h2>
                                    <p className="text-sm text-slate-500">Empresas del portal configuradas para RestoFlow</p>
                                </div>
                                <button
                                    onClick={() => { setEditingEmpresa({ config_iva: 15, config_propina: 10, habilitar_division_cuenta: false }); setIsEmpresaModalOpen(true) }}
                                    className="btn btn-primary py-2 px-4 text-sm flex items-center gap-2">
                                    <Plus className="w-4 h-4" /> Nueva Empresa
                                </button>
                            </div>
                            <div className="card overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead className="bg-slate-50 border-b border-slate-200">
                                            <tr>
                                                {['Empresa', 'RUC', 'Dirección', 'IVA', 'Propina', 'RestoFlow', 'Acciones'].map(h => (
                                                    <th key={h} className="px-6 py-4 text-left text-xs font-black text-slate-500 uppercase tracking-wider">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {allEmpresas.sort((a, b) => a.nombre.localeCompare(b.nombre)).map(emp => (
                                                <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            {emp.logo_url && <img src={emp.logo_url} alt={emp.nombre} className="w-8 h-8 object-contain rounded" />}
                                                            <p className="font-bold text-slate-900">{emp.nombre}</p>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-slate-600">{emp.ruc || 'N/A'}</td>
                                                    <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">{emp.direccion_matriz || 'N/A'}</td>
                                                    <td className="px-6 py-4 text-sm text-slate-600">{emp.config_iva}%</td>
                                                    <td className="px-6 py-4 text-sm text-slate-600">{emp.config_propina}%</td>
                                                    <td className="px-6 py-4">
                                                        <span className={cn("px-2 py-1 text-xs font-bold rounded-full",
                                                            emp.usar_restoflow ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-400")}>
                                                            {emp.usar_restoflow ? 'Activo' : 'Inactivo'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button onClick={() => handleNuclearReset(emp.id, emp.nombre)}
                                                                className="p-2 hover:bg-amber-50 rounded-lg text-slate-400 hover:text-amber-600" title="Reset Nuclear">
                                                                <Bomb className="w-4 h-4" />
                                                            </button>
                                                            <button onClick={() => { setEditingEmpresa(emp); setIsEmpresaModalOpen(true) }}
                                                                className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-primary-600" title="Editar">
                                                                <Edit2 className="w-4 h-4" />
                                                            </button>
                                                            <button onClick={() => handleDeleteEmpresa(emp.id)}
                                                                className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-red-600" title="Desactivar">
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}

                    {/* ─ Sub-tab Personal ─ */}
                    {platformSubTab === 'personal' && (
                        <div className="space-y-8">
                            {/* ── Formulario de asignación ── */}
                            <div className="card p-6 border-2 border-primary-100">
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="p-2 bg-primary-50 text-primary-600 rounded-xl"><Link2 className="w-5 h-5" /></div>
                                    <div>
                                        <h2 className="text-base font-bold text-slate-900">Asignar Usuario a Empresa</h2>
                                        <p className="text-xs text-slate-500">Relaciona un usuario del portal con una empresa de RestoFlow</p>
                                    </div>
                                </div>

                                {msgAsig && (
                                    <div className={cn("flex items-center gap-2 p-3 rounded-xl text-sm mb-4",
                                        msgAsig.tipo === 'ok' ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600")}>
                                        <span>{msgAsig.texto}</span>
                                        <button onClick={() => setMsgAsig(null)} className="ml-auto p-0.5 hover:opacity-60"><X className="w-4 h-4" /></button>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                    <div>
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Usuario del Portal</label>
                                        <select className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm"
                                            value={asignacion.usuario_id}
                                            onChange={e => setAsignacion({ ...asignacion, usuario_id: e.target.value })}>
                                            <option value="">Seleccionar usuario...</option>
                                            {portalUsers.map(u => {
                                                const yaAsignado = assignedProfiles.find(a => a.email === u.email)
                                                return (
                                                    <option key={u.id} value={u.id}>
                                                        {u.nombre || u.email}
                                                        {yaAsignado ? ` — ya asignado a ${allEmpresas.find(e => e.id === yaAsignado.empresa_id)?.nombre || 'una empresa'}` : ''}
                                                    </option>
                                                )
                                            })}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Empresa RestoFlow</label>
                                        <select className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm"
                                            value={asignacion.empresa_id}
                                            onChange={e => setAsignacion({ ...asignacion, empresa_id: e.target.value })}>
                                            <option value="">Seleccionar empresa...</option>
                                            {allEmpresas.map(emp => (
                                                <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <button onClick={handleAsignar}
                                        disabled={!!asignandoId || !asignacion.usuario_id || !asignacion.empresa_id}
                                        className="btn btn-primary py-3 flex items-center justify-center gap-2">
                                        {asignandoId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                                        Asignar
                                    </button>
                                </div>
                            </div>

                            {/* ── Lista de usuarios asignados ── */}
                            <div>
                                <h2 className="text-lg font-bold text-slate-900 mb-4">Usuarios del Portal</h2>
                                <div className="card overflow-hidden">
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead className="bg-slate-50 border-b border-slate-200">
                                                <tr>
                                                    {['Nombre', 'Email', 'Rol', 'Empresa Asignada'].map(h => (
                                                        <th key={h} className="px-6 py-4 text-left text-xs font-black text-slate-500 uppercase tracking-wider">{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {assignedProfiles.map(user => {
                                                    const empAsig = allEmpresas.find(e => e.id === user.empresa_id)
                                                    return (
                                                        <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                                                            <td className="px-6 py-4">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-9 h-9 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center font-black text-sm">
                                                                        {(user.nombre || user.email || '?')[0].toUpperCase()}
                                                                    </div>
                                                                    <span className="font-bold text-slate-900">{user.nombre || '—'}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 text-sm text-slate-600">{user.email || '—'}</td>
                                                            <td className="px-6 py-4">
                                                                <span className="px-2 py-1 text-xs font-bold rounded-full bg-slate-100 text-slate-600">{user.rol}</span>
                                                            </td>
                                                            <td className="px-6 py-4 text-sm">
                                                                {empAsig
                                                                    ? <span className="font-semibold text-emerald-700">{empAsig.nombre}</span>
                                                                    : <span className="text-slate-400 italic">Sin asignar</span>
                                                                }
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                                {assignedProfiles.length === 0 && (
                                                    <tr><td colSpan={4} className="px-6 py-12 text-center text-slate-400">No hay usuarios asignados aún.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ══ MODALES ══════════════════════════════════════ */}

            {/* Modal empresa (admin) */}
            {isEmpresaModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl p-8 space-y-6 my-8">
                        <div className="flex justify-between items-center">
                            <h2 className="text-2xl font-bold">{editingEmpresa?.id ? 'Editar Empresa' : 'Nueva Empresa'}</h2>
                            <button onClick={() => setIsEmpresaModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X className="w-6 h-6" /></button>
                        </div>

                        {/* Si es nuevo: campos para crear empresa */}
                        {!editingEmpresa?.id && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Nombre *</label>
                                        <input type="text" placeholder="Nombre comercial" className="w-full px-4 py-3 rounded-xl border mt-1"
                                            value={editingEmpresa?.nombre || ''}
                                            onChange={e => setEditingEmpresa({ ...editingEmpresa, nombre: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">RUC *</label>
                                        <input type="text" maxLength={13} placeholder="0000000000001" className="w-full px-4 py-3 rounded-xl border mt-1 font-mono"
                                            value={editingEmpresa?.ruc || ''}
                                            onChange={e => setEditingEmpresa({ ...editingEmpresa, ruc: e.target.value })} />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Razón Social</label>
                                    <input type="text" placeholder="Razón social (opcional)" className="w-full px-4 py-3 rounded-xl border mt-1"
                                        value={editingEmpresa?.razon_social || ''}
                                        onChange={e => setEditingEmpresa({ ...editingEmpresa, razon_social: e.target.value })} />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Dirección</label>
                                        <input type="text" placeholder="Dirección principal" className="w-full px-4 py-3 rounded-xl border mt-1"
                                            value={editingEmpresa?.direccion_matriz || ''}
                                            onChange={e => setEditingEmpresa({ ...editingEmpresa, direccion_matriz: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Teléfono</label>
                                        <input type="text" placeholder="0999999999" className="w-full px-4 py-3 rounded-xl border mt-1"
                                            value={editingEmpresa?.telefono || ''}
                                            onChange={e => setEditingEmpresa({ ...editingEmpresa, telefono: e.target.value })} />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Si es edición: mostrar info de empresa */}
                        {editingEmpresa?.id && (
                            <div className="p-4 bg-slate-50 rounded-xl text-sm">
                                <p className="font-bold text-slate-700">{editingEmpresa.nombre}</p>
                                <p className="text-slate-500">RUC: {editingEmpresa.ruc} · {editingEmpresa.direccion_matriz}</p>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">IVA (%)</label>
                                <input type="number" className="w-full px-4 py-3 rounded-xl border mt-1"
                                    value={editingEmpresa?.config_iva ?? 15}
                                    onChange={e => setEditingEmpresa({ ...editingEmpresa, config_iva: parseFloat(e.target.value) })} />
                            </div>
                            <div>
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Propina (%)</label>
                                <input type="number" className="w-full px-4 py-3 rounded-xl border mt-1"
                                    value={editingEmpresa?.config_propina ?? 10}
                                    onChange={e => setEditingEmpresa({ ...editingEmpresa, config_propina: parseFloat(e.target.value) })} />
                            </div>
                        </div>

                        <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Funciones Extra</label>
                                <span className="text-sm font-bold text-slate-700">Dividir Cuentas</span>
                            </div>
                            <button type="button"
                                onClick={() => setEditingEmpresa({ ...editingEmpresa, habilitar_division_cuenta: !editingEmpresa?.habilitar_division_cuenta })}
                                className={cn("w-12 h-6 rounded-full transition-colors relative", editingEmpresa?.habilitar_division_cuenta ? "bg-primary-600" : "bg-slate-300")}>
                                <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all", editingEmpresa?.habilitar_division_cuenta ? "left-7" : "left-1")} />
                            </button>
                        </div>

                        <div className="flex gap-4 pt-4">
                            <button onClick={() => setIsEmpresaModalOpen(false)} className="flex-1 py-4 font-bold border rounded-2xl hover:bg-slate-50">Cancelar</button>
                            <button onClick={handleSaveEmpresaFull} disabled={saving}
                                className="flex-1 py-4 font-bold bg-primary-600 text-white rounded-2xl hover:bg-primary-700 flex items-center justify-center gap-2">
                                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5" /> Guardar</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal staff (mesero / cocina) */}
            {isStaffModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
                        <div className="p-8 border-b border-slate-100">
                            <h2 className="text-xl font-bold">{editingStaff?.id ? 'Editar' : 'Nuevo'} Miembro</h2>
                        </div>
                        <div className="p-8 pt-6 space-y-4 overflow-y-auto flex-1">
                            {empresa?.id ? (
                                <p className="text-xs text-slate-500">Empresa: <strong>{empresa.nombre}</strong></p>
                            ) : (
                                <div>
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Empresa *</label>
                                    <select className="w-full px-4 py-3 rounded-xl border mt-1 bg-white text-sm"
                                        value={editingStaff?.empresa_id || ''}
                                        onChange={e => setEditingStaff({ ...editingStaff, empresa_id: e.target.value })}>
                                        <option value="">Seleccionar empresa...</option>
                                        {allEmpresas.map(emp => (
                                            <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                            <input type="text" placeholder="Nombre" className="w-full px-4 py-3 rounded-xl border"
                                value={editingStaff?.nombre || ''}
                                onChange={e => setEditingStaff({ ...editingStaff, nombre: e.target.value })} />
                            <input type="email" placeholder="Correo Electrónico" className="w-full px-4 py-3 rounded-xl border"
                                value={editingStaff?.email || ''}
                                onChange={e => setEditingStaff({ ...editingStaff, email: e.target.value })} />
                            {!editingStaff?.id && (
                                <input type="password" placeholder="Contraseña Inicial" className="w-full px-4 py-3 rounded-xl border font-mono"
                                    value={(editingStaff as any)?.password || ''}
                                    onChange={e => setEditingStaff({ ...editingStaff, password: e.target.value } as any)} />
                            )}
                            <select className="w-full px-4 py-3 rounded-xl border bg-white"
                                value={editingStaff?.rol || 'mesero'}
                                onChange={e => setEditingStaff({ ...editingStaff, rol: e.target.value as any })}>
                                <option value="mesero">Mesero / Servicio</option>
                                <option value="cocina">Personal de Cocina</option>
                            </select>
                            <select className="w-full px-4 py-3 rounded-xl border bg-white"
                                value={editingStaff?.estado || 'activo'}
                                onChange={e => setEditingStaff({ ...editingStaff, estado: e.target.value as any })}>
                                <option value="activo">Activo</option>
                                <option value="baja">Baja</option>
                            </select>
                            <input type="text" maxLength={4} placeholder="PIN (4 dígitos)" className="w-full px-4 py-3 rounded-xl border font-mono text-center"
                                value={editingStaff?.pin || ''}
                                onChange={e => setEditingStaff({ ...editingStaff, pin: e.target.value.replace(/\D/g, '') })} />
                        </div>
                        <div className="p-8 bg-slate-50 flex gap-4 border-t border-slate-100">
                            <button onClick={() => setIsStaffModalOpen(false)} className="flex-1 py-3 font-bold bg-white border border-slate-200 rounded-xl hover:bg-slate-50">Cancelar</button>
                            <button onClick={handleSaveStaffMember} disabled={saving} className="flex-1 py-3 font-bold bg-primary-600 text-white rounded-xl hover:bg-primary-700">
                                {saving ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Guardar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal mesa */}
            {isMesaModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 space-y-6">
                        <h2 className="text-xl font-bold">{editingMesa?.id ? 'Editar' : 'Nueva'} Mesa</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Número / Nombre</label>
                                <input type="text" placeholder="Ej: 01, Barra 1, VIP..." className="w-full px-4 py-3 rounded-xl border mt-1"
                                    value={editingMesa?.numero || ''}
                                    onChange={e => setEditingMesa({ ...editingMesa, numero: e.target.value })} />
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase">Capacidad</label>
                                <div className="flex gap-2 mt-1">
                                    {[2, 4, 6, 8, 10].map(n => (
                                        <button key={n} type="button" onClick={() => setEditingMesa({ ...editingMesa, capacidad: n })}
                                            className={cn("w-10 h-10 rounded-lg font-bold border flex items-center justify-center transition-all",
                                                editingMesa?.capacidad === n ? "bg-primary-600 text-white border-primary-600" : "bg-white text-slate-500 hover:border-slate-300")}>
                                            {n}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <button onClick={() => setIsMesaModalOpen(false)} className="flex-1 py-3 font-bold border rounded-xl">Cancelar</button>
                            <button onClick={handleSaveMesa} className="flex-1 py-3 font-bold bg-primary-600 text-white rounded-xl">Guardar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal categoría */}
            {isCategoriaModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 space-y-6">
                        <h2 className="text-xl font-bold">{editingCategoria?.id ? 'Editar' : 'Nueva'} Categoría</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Nombre</label>
                                <input type="text" placeholder="Ej: Entradas, Bebidas..." className="w-full px-4 py-3 rounded-xl border mt-1 font-bold"
                                    value={editingCategoria?.nombre || ''}
                                    onChange={e => setEditingCategoria({ ...editingCategoria, nombre: e.target.value })}
                                    autoFocus />
                            </div>
                            <div>
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Tipo</label>
                                <select className="w-full px-4 py-3 rounded-xl border mt-1 bg-white"
                                    value={editingCategoria?.tipo || 'ALIMENTO'}
                                    onChange={e => setEditingCategoria({ ...editingCategoria, tipo: e.target.value })}>
                                    <option value="ALIMENTO">Restaurante / Alimentos</option>
                                    <option value="BEBIDA">Bebidas / Bar</option>
                                    <option value="OTROS">Otros</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <button onClick={() => setIsCategoriaModalOpen(false)} className="flex-1 py-3 font-bold border rounded-xl hover:bg-slate-50">Cancelar</button>
                            <button onClick={handleSaveCategoria} className="flex-1 py-3 font-bold bg-primary-600 text-white rounded-xl hover:bg-primary-700">Guardar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
