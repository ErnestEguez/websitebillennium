import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { staffService } from '../services/staffService'
import { sriService } from '../services/sriService'
import { mesaService, type Mesa } from '../services/mesaService'
import type { StaffMember } from '../services/staffService'
import {
    Users,
    Building2,
    Save,
    Plus,
    Trash2,
    Edit2,
    Shield,
    Percent,
    Image as ImageIcon,
    Loader2,
    Grid,
    Utensils,
    RefreshCcw,
    X,
    ArrowLeft,
    Bomb,
    Tag
} from 'lucide-react'
import { categoriaService, type Categoria } from '../services/categoriaService'
import { cn } from '../lib/utils'

export function ConfigurationPage() {
    const { empresa, profile } = useAuth()
    const [activeTab, setActiveTab] = useState<'empresa' | 'staff' | 'mesas' | 'categorias' | 'plataforma'>('empresa')
    const [platformSubTab, setPlatformSubTab] = useState<'empresas' | 'personal'>('empresas')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    // Empresa State
    const [companyData, setCompanyData] = useState<any>({
        nombre: '',
        ruc: '',
        direccion_matriz: '',
        logo_url: '',
        config_iva: 15.0,
        config_propina: 10.0
    })

    // Staff State
    const [staff, setStaff] = useState<StaffMember[]>([])
    const [isStaffModalOpen, setIsStaffModalOpen] = useState(false)
    const [editingStaff, setEditingStaff] = useState<Partial<StaffMember> | null>(null)

    // Mesas State
    const [mesas, setMesas] = useState<Mesa[]>([])
    const [isMesaModalOpen, setIsMesaModalOpen] = useState(false)
    const [editingMesa, setEditingMesa] = useState<Partial<Mesa> | null>(null)

    // Categorias State
    const [categorias, setCategorias] = useState<Categoria[]>([])
    const [isCategoriaModalOpen, setIsCategoriaModalOpen] = useState(false)
    const [editingCategoria, setEditingCategoria] = useState<Partial<Categoria> | null>(null)

    // Plataforma State (Admin)
    const [allEmpresas, setAllEmpresas] = useState<any[]>([])
    const [isEmpresaModalOpen, setIsEmpresaModalOpen] = useState(false)
    const [editingEmpresa, setEditingEmpresa] = useState<any>(null)
    const [oficinaUsers, setOficinaUsers] = useState<StaffMember[]>([])

    useEffect(() => {
        if (profile?.rol === 'admin_plataforma') {
            setActiveTab('plataforma')
        }
    }, [profile?.rol])

    useEffect(() => {
        if (profile) {
            loadData()
        }
    }, [profile?.id, empresa?.id])

    async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]
        if (!file) return

        try {
            setSaving(true)
            const publicUrl = await sriService.uploadLogo(empresa!.id, file)
            setCompanyData({ ...companyData, logo_url: publicUrl })

            // Auto-guardar en DB
            await supabase
                .from('empresas')
                .update({ logo_url: publicUrl })
                .eq('id', empresa!.id)

            alert('Logo subido y actualizado con éxito')
        } catch (error: any) {
            if (error.message?.includes('Bucket not found')) {
                alert('ERROR: No se encontró el bucket "logos" en Supabase. Por favor, crea el bucket manualmente en el panel de Supabase Storage con el nombre "logos" y marca la opción "Public".')
            } else {
                alert(`Error al subir logo: ${error.message}`)
            }
        } finally {
            setSaving(false)
        }
    }

    async function loadData() {
        // Safety timeout for data loading
        const timeout = setTimeout(() => {
            if (loading) {
                console.warn('Configuration data load timed out');
                setLoading(false);
            }
        }, 10000);

        try {
            setLoading(true)

            // Si es plataforma admin, podemos ver todo
            if (profile?.rol === 'admin_plataforma') {
                console.log('Plataforma Mode: Fetching all empresas');
                const { data: emps, error } = await supabase.from('empresas').select('*').order('nombre')
                if (error) throw error;
                setAllEmpresas(emps || [])

                // Load all oficina users - Simplified select to avoid schema cache join issues
                const { data: oficinaData, error: oficinaError } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('rol', 'oficina')
                    .order('nombre')

                if (!oficinaError && oficinaData) {
                    // Enrich with empresa names manually to avoid join issues
                    const enrichedUsers = oficinaData.map(user => ({
                        ...user,
                        empresa: allEmpresas.find(e => e.id === user.empresa_id)
                    }))
                    setOficinaUsers(enrichedUsers)
                } else if (oficinaError) {
                    console.error('Error fetching oficina users:', oficinaError)
                }
            }

            if (empresa?.id) {
                console.log('Company Mode: Fetching data for', empresa.id);
                const [empData, staffData, mesasData, categoriasData] = await Promise.all([
                    supabase.from('empresas').select('*').eq('id', empresa!.id).single(),
                    staffService.getStaffByEmpresa(empresa!.id),
                    mesaService.getMesas(),
                    categoriaService.getCategorias(empresa!.id)
                ])
                if (empData.data) setCompanyData(empData.data)
                // Filter: No mostrar al propio usuario logueado en la lista de personal de servicio 
                // si es rol oficina, para evitar confusiones.
                const filteredStaff = staffData.filter(s =>
                    s.rol !== 'admin_plataforma' &&
                    s.id !== profile?.id
                )
                setStaff(filteredStaff)
                setMesas(mesasData)
                setCategorias(categoriasData)
            }
        } catch (error) {
            console.error('Error loading config:', error)
        } finally {
            clearTimeout(timeout);
            setLoading(false)
        }
    }

    async function handleSaveEmpresaFull() {
        try {
            setSaving(true)
            if (editingEmpresa.id) {
                await supabase.from('empresas').update(editingEmpresa).eq('id', editingEmpresa.id)
            } else {
                await supabase.from('empresas').insert(editingEmpresa)
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

    async function handleSaveCompany(e: React.FormEvent) {
        e.preventDefault()
        try {
            setSaving(true)
            const { error } = await supabase
                .from('empresas')
                .update({
                    nombre: companyData.nombre,
                    ruc: companyData.ruc,
                    direccion_matriz: companyData.direccion_matriz,
                    logo_url: companyData.logo_url,
                    config_iva: companyData.config_iva,
                    config_propina: companyData.config_propina
                })
                .eq('id', empresa!.id)

            if (error) throw error
            alert('Configuración de empresa guardada')
        } catch (error: any) {
            alert(`Error al guardar: ${error.message}`)
        } finally {
            setSaving(false)
        }
    }

    async function handleSaveStaffMember() {
        try {
            setSaving(true)
            if (!editingStaff?.nombre || !editingStaff?.rol) {
                alert('Nombre y Rol son obligatorios')
                return
            }

            // Sanitización EXTREMA: Solo dejar los campos que realmente existen en la tabla 'profiles'
            // Esto evita el error "Could not find column ... in schema cache"
            const dataToSave = {
                nombre: editingStaff.nombre,
                rol: profile?.rol === 'admin_plataforma' ? 'oficina' : editingStaff.rol,
                empresa_id: profile?.rol === 'admin_plataforma' ? editingStaff.empresa_id : empresa?.id,
                email: editingStaff.email,
                pin: editingStaff.pin,
                estado: editingStaff.estado,
                fecha_baja: editingStaff.fecha_baja,
                motivo_baja: editingStaff.motivo_baja
            }

            if (!dataToSave.empresa_id) {
                alert('Debe seleccionar una empresa destino')
                return
            }

            if (editingStaff.id) {
                const { error } = await supabase
                    .from('profiles')
                    .update(dataToSave)
                    .eq('id', editingStaff.id)

                if (error) throw error
            } else {
                await staffService.createStaffMember({
                    ...dataToSave,
                    password: (editingStaff as any).password // Pass password for Auth creation
                })
            }

            setIsStaffModalOpen(false)
            setEditingStaff(null)
            loadData()
        } catch (error: any) {
            console.error('Save staff error:', error)
            alert(`Error al guardar staff: ${error.message}`)
        } finally {
            setSaving(false)
        }
    }

    async function handleDeleteStaff(id: string) {
        if (!confirm('¿Estás seguro de eliminar a este miembro del personal?')) return
        try {
            await staffService.deleteStaffMember(id)
            loadData()
        } catch (error: any) {
            alert(`Error al eliminar: ${error.message}`)
        }
    }

    async function handleResetMesa(mesa: Mesa) {
        if (!confirm(`¿Estás seguro de resetear la Mesa ${mesa.numero}? Se cancelarán pedidos pendientes no facturados.`)) return
        try {
            await mesaService.resetMesa(mesa.id)
            loadData()
        } catch (error: any) {
            alert(`Error al resetear: ${error.message}`)
        }
    }

    async function handleSaveMesa() {
        try {
            setSaving(true)
            if (!editingMesa?.numero || !editingMesa?.capacidad) {
                alert('Número y Capacidad son obligatorios')
                return
            }

            if (editingMesa.id) {
                await mesaService.updateMesa(editingMesa.id, editingMesa)
            } else {
                await mesaService.createMesa({
                    ...editingMesa,
                    empresa_id: empresa!.id,
                    estado: 'libre'
                } as any)
            }

            setIsMesaModalOpen(false)
            setEditingMesa(null)
            loadData()
        } catch (error: any) {
            alert(`Error al guardar mesa: ${error.message}`)
        } finally {
            setSaving(false)
        }
    }

    async function handleDeleteMesa(id: string) {
        if (!confirm('¿Estás seguro de eliminar esta mesa?')) return
        try {
            await mesaService.deleteMesa(id)
            loadData()
        } catch (error: any) {
            alert(`Error al eliminar mesa: ${error.message}`)
        }
    }

    async function handleSaveCategoria() {
        try {
            setSaving(true)
            if (!editingCategoria?.nombre) {
                alert('El nombre es obligatorio')
                return
            }

            if (editingCategoria.id) {
                await categoriaService.updateCategoria(editingCategoria.id, editingCategoria)
            } else {
                await categoriaService.createCategoria({
                    ...editingCategoria,
                    empresa_id: empresa!.id,
                })
            }

            setIsCategoriaModalOpen(false)
            setEditingCategoria(null)
            loadData()
        } catch (error: any) {
            alert(`Error al guardar categoría: ${error.message}`)
        } finally {
            setSaving(false)
        }
    }

    async function handleDeleteCategoria(id: string) {
        if (!confirm('¿Estás seguro de eliminar esta categoría?')) return
        try {
            await categoriaService.deleteCategoria(id)
            loadData()
        } catch (error: any) {
            alert(`Error al eliminar categoría: ${error.message}`)
        }
    }

    async function handleNuclearReset(id: string, nombre: string) {
        if (!confirm(`⚠️ ALERTA NUCLEAR ⚠️\n\n¿Estás seguro de borrar TODO el movimiento transaccional de "${nombre}"?\n\nEsto eliminará pedidos, facturas, kardex e inventario de prueba. Esta acción es IRREVERSIBLE.`)) return

        const confirm2 = prompt(`Para confirmar, escribe el nombre de la empresa: ${nombre}`)
        if (confirm2 !== nombre) {
            alert('Confirmación fallida. El nombre no coincide.')
            return
        }

        try {
            setSaving(true)
            const { data, error } = await supabase.rpc('reset_empresa_transaccional', { p_empresa_id: id })

            if (error) throw error
            if (data?.success) {
                alert(data.message)
                loadData()
            } else {
                alert(`Error: ${data?.error || 'Desconocido'}`)
            }
        } catch (error: any) {
            alert(`Error al resetear: ${error.message}`)
        } finally {
            setSaving(false)
        }
    }

    async function handleDeleteEmpresa(id: string) {
        if (!confirm('¿Estás seguro de desactivar esta empresa? Los usuarios asociados no podrán acceder.')) return
        try {
            setSaving(true)
            // Soft delete - set activo to false
            await supabase
                .from('empresas')
                .update({ activo: false })
                .eq('id', id)
            loadData()
            alert('Empresa desactivada correctamente')
        } catch (error: any) {
            alert(`Error al desactivar empresa: ${error.message}`)
        } finally {
            setSaving(false)
        }
    }

    if (loading) return <div className="p-12 text-center">Cargando configuración...</div>

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Configuración</h1>
                    <p className="text-slate-500">{profile?.rol === 'admin_plataforma' ? 'Administración de Plataforma' : 'Gestiona tu empresa y personal'}</p>
                </div>
                {profile?.rol === 'admin_plataforma' && (
                    <a
                        href="/"
                        className="btn btn-secondary py-2 px-4 text-sm flex items-center gap-2"
                    >
                        <ArrowLeft className="w-4 h-4" /> Volver al Dashboard
                    </a>
                )}
            </div>

            {/* Tabs - Only show for non-platform admins */}
            {profile?.rol !== 'admin_plataforma' && (
                <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
                    <button
                        onClick={() => setActiveTab('empresa')}
                        className={cn(
                            "flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all",
                            activeTab === 'empresa' ? "bg-white text-primary-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        <Building2 className="w-4 h-4" />
                        Empresa
                    </button>
                    <button
                        onClick={() => setActiveTab('staff')}
                        className={cn(
                            "flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all",
                            activeTab === 'staff' ? "bg-white text-primary-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        <Users className="w-4 h-4" />
                        Personal
                    </button>
                    {profile?.rol === 'oficina' && (
                        <button
                            onClick={() => setActiveTab('mesas')}
                            className={cn(
                                "flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all",
                                activeTab === 'mesas' ? "bg-white text-primary-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                            )}
                        >
                            <Grid className="w-4 h-4" />
                            Mesas
                        </button>
                    )}
                    {profile?.rol === 'oficina' && (
                        <button
                            onClick={() => setActiveTab('categorias')}
                            className={cn(
                                "flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all",
                                activeTab === 'categorias' ? "bg-white text-primary-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                            )}
                        >
                            <Tag className="w-4 h-4" />
                            Categorías
                        </button>
                    )}
                </div>
            )}

            {activeTab === 'empresa' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4">
                    <div className="lg:col-span-2">
                        <form onSubmit={handleSaveCompany} className="card p-8 space-y-8">
                            <div className="flex items-center gap-4 pb-4 border-b border-slate-100">
                                <div className="p-3 bg-primary-50 text-primary-600 rounded-2xl">
                                    <Building2 className="w-6 h-6" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900">Datos Generales</h2>
                                    <p className="text-sm text-slate-500">Información legal y visual del negocio</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Razón Social</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500"
                                        value={companyData.nombre}
                                        onChange={e => setCompanyData({ ...companyData, nombre: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">RUC</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500"
                                        value={companyData.ruc}
                                        onChange={e => setCompanyData({ ...companyData, ruc: e.target.value })}
                                    />
                                </div>
                                <div className="md:col-span-2 space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Dirección Matriz</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500"
                                        value={companyData.direccion_matriz}
                                        onChange={e => setCompanyData({ ...companyData, direccion_matriz: e.target.value })}
                                    />
                                </div>
                                <div className="md:col-span-2 space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        <ImageIcon className="w-3 h-3" /> Logo del Negocio
                                    </label>
                                    <div className="flex items-center gap-4 p-4 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
                                        {companyData.logo_url ? (
                                            <img src={companyData.logo_url} alt="Logo" className="w-20 h-20 object-contain rounded-lg border bg-white" />
                                        ) : (
                                            <div className="w-20 h-20 bg-slate-200 rounded-lg flex items-center justify-center text-slate-400">
                                                <ImageIcon className="w-8 h-8" />
                                            </div>
                                        )}
                                        <div className="flex-1">
                                            <p className="text-sm font-bold text-slate-700">Subir nuevo logo</p>
                                            <p className="text-xs text-slate-500 mb-3">Recomendado: PNG fondo transparente</p>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={handleLogoUpload}
                                                className="block w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-black file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 pt-4 pb-4 border-b border-slate-100">
                                <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl">
                                    <Percent className="w-6 h-6" />
                                </div>
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
                                            <button
                                                key={v}
                                                type="button"
                                                onClick={() => setCompanyData({ ...companyData, config_iva: v })}
                                                className={cn(
                                                    "flex-1 py-2 rounded-lg text-sm font-bold border transition-all",
                                                    companyData.config_iva === v
                                                        ? "bg-primary-50 border-primary-200 text-primary-600"
                                                        : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                                                )}
                                            >
                                                {v}%
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Propina Sugerida (%)</label>
                                    <input
                                        type="number"
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500"
                                        value={companyData.config_propina}
                                        onChange={e => setCompanyData({ ...companyData, config_propina: parseFloat(e.target.value) })}
                                    />
                                </div>
                            </div>

                            <div className="pt-4">
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="btn btn-primary w-full py-4 text-lg font-black flex items-center justify-center gap-2"
                                >
                                    {saving ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Save className="w-6 h-6" /> Guardar Todo</>}
                                </button>
                            </div>
                        </form>
                    </div>

                    <div className="space-y-6">
                        <div className="card p-6 bg-primary-600 text-white">
                            <h3 className="font-bold flex items-center gap-2 mb-4">
                                <Shield className="w-5 h-5 text-primary-200" />
                                Resumen
                            </h3>
                            <div className="space-y-4 text-sm">
                                <div className="flex justify-between border-b border-primary-500 pb-2">
                                    <span className="text-primary-100">IVA</span>
                                    <span className="font-bold">{companyData.config_iva}%</span>
                                </div>
                                <div className="flex justify-between border-b border-primary-500 pb-2">
                                    <span className="text-primary-100">Propina</span>
                                    <span className="font-bold">{companyData.config_propina}%</span>
                                </div>
                                <div className="flex justify-between pb-2">
                                    <span className="text-primary-100">RUC</span>
                                    <span className="font-bold">{companyData.ruc || 'N/D'}</span>
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
            ) : activeTab === 'staff' ? (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Personal de Servicio</h2>
                            <p className="text-sm text-slate-500">Administra los meseros y personal de cocina</p>
                        </div>
                        <button
                            onClick={() => {
                                setEditingStaff({ rol: 'mesero' })
                                setIsStaffModalOpen(true)
                            }}
                            className="btn btn-primary py-2 px-4 text-sm flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" /> Nuevo Miembro
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {staff.map(member => (
                            <div key={member.id} className="card p-6 group">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className={cn(
                                            "w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg",
                                            member.rol === 'oficina' ? "bg-primary-100 text-primary-600" : "bg-slate-100 text-slate-600"
                                        )}>
                                            {member.nombre[0]}
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-slate-900">{member.nombre}</h3>
                                            <p className="text-xs text-slate-500">{member.rol}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        <button onClick={() => { setEditingStaff(member); setIsStaffModalOpen(true) }} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400">
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => handleDeleteStaff(member.id)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : activeTab === 'mesas' ? (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Configuración de Mesas</h2>
                            <p className="text-sm text-slate-500">Administra la distribución de tu restaurante</p>
                        </div>
                        <button
                            onClick={() => {
                                setEditingMesa({ capacidad: 4, estado: 'libre' })
                                setIsMesaModalOpen(true)
                            }}
                            className="btn btn-primary py-2 px-4 text-sm flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" /> Nueva Mesa
                        </button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                        {mesas.map(mesa => (
                            <div key={mesa.id} className="card p-4 group relative hover:shadow-lg transition-all">
                                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => handleResetMesa(mesa)}
                                        title="Resetear mesa / Liberar"
                                        className="p-1.5 hover:bg-slate-100 rounded-lg text-amber-500"
                                    >
                                        <RefreshCcw className="w-3 h-3" />
                                    </button>
                                    <button onClick={() => { setEditingMesa(mesa); setIsMesaModalOpen(true) }} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">
                                        <Edit2 className="w-3 h-3" />
                                    </button>
                                    <button onClick={() => handleDeleteMesa(mesa.id)} className="p-1.5 hover:bg-slate-100 rounded-lg text-red-400">
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                                <div className="flex flex-col items-center justify-center py-4">
                                    <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mb-3">
                                        <Utensils className="w-8 h-8" />
                                    </div>
                                    <h3 className="font-bold text-slate-900 text-lg">Mesa {mesa.numero}</h3>
                                    <p className="text-xs text-slate-500 font-medium">{mesa.capacidad} Pers.</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : activeTab === 'categorias' ? (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Categorías de Productos</h2>
                            <p className="text-sm text-slate-500">Administra las clasificaciones para tu menú e inventario</p>
                        </div>
                        <button
                            onClick={() => {
                                setEditingCategoria({ nombre: '', tipo: 'ALIMENTO' })
                                setIsCategoriaModalOpen(true)
                            }}
                            className="btn btn-primary py-2 px-4 text-sm flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" /> Nueva Categoría
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {categorias.map(cat => (
                            <div key={cat.id} className="card p-6 group relative hover:shadow-lg transition-all border-l-4 border-l-primary-500">
                                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => { setEditingCategoria(cat); setIsCategoriaModalOpen(true) }} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400">
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => handleDeleteCategoria(cat.id)} className="p-1.5 hover:bg-slate-100 rounded-lg text-red-400">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="space-y-1">
                                    <h3 className="font-bold text-slate-900 text-lg uppercase tracking-tight">{cat.nombre}</h3>
                                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{cat.tipo || 'General'}</p>
                                </div>
                            </div>
                        ))}
                        {categorias.length === 0 && (
                            <div className="col-span-full py-12 text-center text-slate-400 font-medium">
                                No hay categorías registradas.
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                    {/* Sub-tabs for Platform Admin */}
                    <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit">
                        <button
                            onClick={() => setPlatformSubTab('empresas')}
                            className={cn(
                                "flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all",
                                platformSubTab === 'empresas' ? "bg-white text-primary-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                            )}
                        >
                            <Building2 className="w-4 h-4" />
                            Empresas
                        </button>
                        <button
                            onClick={() => setPlatformSubTab('personal')}
                            className={cn(
                                "flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all",
                                platformSubTab === 'personal' ? "bg-white text-primary-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                            )}
                        >
                            <Users className="w-4 h-4" />
                            Personal
                        </button>
                    </div>

                    {platformSubTab === 'empresas' ? (
                        <>
                            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900">Gestión de Empresas (SaaS)</h2>
                                    <p className="text-sm text-slate-500">Administra todos los negocios registrados en la plataforma</p>
                                </div>
                                <button
                                    onClick={() => {
                                        setEditingEmpresa({
                                            nombre: '',
                                            ruc: '',
                                            direccion_matriz: '',
                                            config_iva: 15,
                                            config_propina: 10,
                                            activo: true
                                        })
                                        setIsEmpresaModalOpen(true)
                                    }}
                                    className="btn btn-primary py-2 px-4 text-sm flex items-center gap-2"
                                >
                                    <Plus className="w-4 h-4" /> Nueva Empresa
                                </button>
                            </div>

                            <div className="card overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead className="bg-slate-50 border-b border-slate-200">
                                            <tr>
                                                <th className="px-6 py-4 text-left text-xs font-black text-slate-500 uppercase tracking-wider">Empresa</th>
                                                <th className="px-6 py-4 text-left text-xs font-black text-slate-500 uppercase tracking-wider">RUC</th>
                                                <th className="px-6 py-4 text-left text-xs font-black text-slate-500 uppercase tracking-wider">Dirección</th>
                                                <th className="px-6 py-4 text-left text-xs font-black text-slate-500 uppercase tracking-wider">IVA</th>
                                                <th className="px-6 py-4 text-left text-xs font-black text-slate-500 uppercase tracking-wider">Propina</th>
                                                <th className="px-6 py-4 text-left text-xs font-black text-slate-500 uppercase tracking-wider">Estado</th>
                                                <th className="px-6 py-4 text-right text-xs font-black text-slate-500 uppercase tracking-wider">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {allEmpresas
                                                .sort((a, b) => {
                                                    // Billennium always first
                                                    if (a.nombre === 'Billennium') return -1
                                                    if (b.nombre === 'Billennium') return 1
                                                    return a.nombre.localeCompare(b.nombre)
                                                })
                                                .map(emp => (
                                                    <tr
                                                        key={emp.id}
                                                        className={cn(
                                                            "hover:bg-slate-50 transition-colors",
                                                            emp.nombre === 'Billennium' && "bg-amber-50/30"
                                                        )}
                                                    >
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-3">
                                                                {emp.logo_url && (
                                                                    <img src={emp.logo_url} alt={emp.nombre} className="w-8 h-8 object-contain rounded" />
                                                                )}
                                                                <div>
                                                                    <p className="font-bold text-slate-900">{emp.nombre}</p>
                                                                    {emp.nombre === 'Billennium' && (
                                                                        <span className="inline-block mt-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-black rounded-full uppercase">
                                                                            Admin Platform
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 text-sm text-slate-600">{emp.ruc || 'N/A'}</td>
                                                        <td className="px-6 py-4 text-sm text-slate-600 max-w-xs truncate">{emp.direccion_matriz || 'N/A'}</td>
                                                        <td className="px-6 py-4 text-sm text-slate-600">{emp.config_iva}%</td>
                                                        <td className="px-6 py-4 text-sm text-slate-600">{emp.config_propina}%</td>
                                                        <td className="px-6 py-4">
                                                            <span className={cn(
                                                                "px-2 py-1 text-xs font-bold rounded-full",
                                                                emp.activo !== false ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                                                            )}>
                                                                {emp.activo !== false ? 'Activo' : 'Inactivo'}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <button
                                                                    onClick={() => handleNuclearReset(emp.id, emp.nombre)}
                                                                    className="p-2 hover:bg-amber-50 rounded-lg text-slate-400 hover:text-amber-600 transition-colors"
                                                                    title="Reset Nuclear (Borrar Pruebas)"
                                                                >
                                                                    <Bomb className="w-4 h-4" />
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        setEditingEmpresa(emp)
                                                                        setIsEmpresaModalOpen(true)
                                                                    }}
                                                                    className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-primary-600 transition-colors"
                                                                    title="Editar"
                                                                >
                                                                    <Edit2 className="w-4 h-4" />
                                                                </button>
                                                                {emp.nombre !== 'Billennium' && (
                                                                    <button
                                                                        onClick={() => handleDeleteEmpresa(emp.id)}
                                                                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-red-600 transition-colors"
                                                                        title="Desactivar"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900">Personal de Oficina</h2>
                                    <p className="text-sm text-slate-500">Administra los usuarios con rol de Oficina para cada empresa</p>
                                </div>
                                <button
                                    onClick={() => {
                                        setEditingStaff({ rol: 'oficina' })
                                        setIsStaffModalOpen(true)
                                    }}
                                    className="btn btn-primary py-2 px-4 text-sm flex items-center gap-2"
                                >
                                    <Plus className="w-4 h-4" /> Nuevo Usuario Oficina
                                </button>
                            </div>

                            <div className="card overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead className="bg-slate-50 border-b border-slate-200">
                                            <tr>
                                                <th className="px-6 py-4 text-left text-xs font-black text-slate-500 uppercase tracking-wider">Nombre</th>
                                                <th className="px-6 py-4 text-left text-xs font-black text-slate-500 uppercase tracking-wider">Email</th>
                                                <th className="px-6 py-4 text-left text-xs font-black text-slate-500 uppercase tracking-wider">Empresa</th>
                                                <th className="px-6 py-4 text-left text-xs font-black text-slate-500 uppercase tracking-wider">Estado</th>
                                                <th className="px-6 py-4 text-right text-xs font-black text-slate-500 uppercase tracking-wider">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {oficinaUsers.map(user => (
                                                <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center font-black">
                                                                {user.nombre?.[0] || 'U'}
                                                            </div>
                                                            <p className="font-bold text-slate-900">{user.nombre || 'Sin nombre'}</p>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-slate-600">{user.email || 'N/A'}</td>
                                                    <td className="px-6 py-4 text-sm text-slate-600">
                                                        {(user as any).empresas?.nombre || 'N/A'}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={cn(
                                                            "px-2 py-1 text-xs font-bold rounded-full",
                                                            user.estado === 'activo' ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                                                        )}>
                                                            {user.estado === 'activo' ? 'Activo' : 'Inactivo'}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button
                                                                onClick={() => {
                                                                    setEditingStaff(user)
                                                                    setIsStaffModalOpen(true)
                                                                }}
                                                                className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-primary-600 transition-colors"
                                                                title="Editar"
                                                            >
                                                                <Edit2 className="w-4 h-4" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteStaff(user.id)}
                                                                className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-red-600 transition-colors"
                                                                title="Eliminar"
                                                            >
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
                </div>
            )}

            {/* Modals */}

            {/* Modals */}
            {
                isEmpresaModalOpen && (
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl p-8 space-y-6 my-8">
                            <div className="flex justify-between items-center">
                                <h2 className="text-2xl font-bold">{editingEmpresa?.id ? 'Editar' : 'Nueva'} Empresa</h2>
                                <button onClick={() => setIsEmpresaModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Nombre Comercial</label>
                                        <input
                                            type="text" placeholder="Nombre de la empresa" className="w-full px-4 py-3 rounded-xl border mt-1"
                                            value={editingEmpresa?.nombre || ''}
                                            onChange={e => setEditingEmpresa({ ...editingEmpresa, nombre: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">RUC</label>
                                        <input
                                            type="text" placeholder="Número de RUC" className="w-full px-4 py-3 rounded-xl border mt-1"
                                            value={editingEmpresa?.ruc || ''}
                                            onChange={e => setEditingEmpresa({ ...editingEmpresa, ruc: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Dirección Matriz</label>
                                        <input
                                            type="text" placeholder="Ciudad, Calle, Edificio..." className="w-full px-4 py-3 rounded-xl border mt-1"
                                            value={editingEmpresa?.direccion_matriz || ''}
                                            onChange={e => setEditingEmpresa({ ...editingEmpresa, direccion_matriz: e.target.value })}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">IVA (%)</label>
                                            <input
                                                type="number" className="w-full px-4 py-3 rounded-xl border mt-1"
                                                value={editingEmpresa?.config_iva || 15}
                                                onChange={e => setEditingEmpresa({ ...editingEmpresa, config_iva: parseFloat(e.target.value) })}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Propina (%)</label>
                                            <input
                                                type="number" className="w-full px-4 py-3 rounded-xl border mt-1"
                                                value={editingEmpresa?.config_propina || 10}
                                                onChange={e => setEditingEmpresa({ ...editingEmpresa, config_propina: parseFloat(e.target.value) })}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <select
                                            className="w-full px-4 py-3 rounded-xl border mt-1 bg-white"
                                            value={editingEmpresa?.activo === false ? 'inactivo' : 'activo'}
                                            onChange={e => setEditingEmpresa({ ...editingEmpresa, activo: e.target.value === 'activo' })}
                                        >
                                            <option value="activo">Activo</option>
                                            <option value="inactivo">No Activo</option>
                                        </select>
                                    </div>

                                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between">
                                        <div>
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Funciones Extra</label>
                                            <span className="text-sm font-bold text-slate-700">Dividir Cuentas</span>
                                        </div>
                                        <button
                                            onClick={() => setEditingEmpresa({ ...editingEmpresa, habilitar_division_cuenta: !editingEmpresa?.habilitar_division_cuenta })}
                                            className={cn(
                                                "w-12 h-6 rounded-full transition-colors relative",
                                                editingEmpresa?.habilitar_division_cuenta ? "bg-primary-600" : "bg-slate-300"
                                            )}
                                        >
                                            <div className={cn(
                                                "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                                                editingEmpresa?.habilitar_division_cuenta ? "left-7" : "left-1"
                                            )} />
                                        </button>
                                    </div>

                                    <div>
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Logo (Upload)</label>
                                        <input
                                            type="file" accept="image/*"
                                            className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 mt-2"
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0]
                                                if (!file || !editingEmpresa?.id) {
                                                    if (!editingEmpresa?.id) alert('Guarde la empresa primero para subir un logo.')
                                                    return
                                                }
                                                try {
                                                    const url = await sriService.uploadLogo(editingEmpresa.id, file)
                                                    setEditingEmpresa({ ...editingEmpresa, logo_url: url })
                                                } catch (err: any) {
                                                    alert('Error al subir logo: ' + err.message)
                                                }
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button onClick={() => setIsEmpresaModalOpen(false)} className="flex-1 py-4 font-bold border rounded-2xl hover:bg-slate-50 transition-colors">Cancelar</button>
                                <button
                                    onClick={handleSaveEmpresaFull}
                                    disabled={saving}
                                    className="flex-1 py-4 font-bold bg-primary-600 text-white rounded-2xl hover:bg-primary-700 transition-colors flex items-center justify-center gap-2"
                                >
                                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5" /> Guardar Empresa</>}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {
                isStaffModalOpen && (
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
                            <div className="p-8 border-b border-slate-100">
                                <h2 className="text-xl font-bold">{editingStaff?.id ? 'Editar' : 'Nuevo'} Miembro</h2>
                            </div>

                            <div className="p-8 pt-6 space-y-6 overflow-y-auto flex-1">
                                {profile?.rol === 'admin_plataforma' ? (
                                    <div className="space-y-4">
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Empresa Destino</label>
                                        <select
                                            className="w-full px-4 py-3 rounded-xl border bg-white"
                                            value={editingStaff?.empresa_id || ''}
                                            onChange={e => setEditingStaff({ ...editingStaff, empresa_id: e.target.value })}
                                        >
                                            <option value="">Seleccione empresa...</option>
                                            {allEmpresas.map(emp => (
                                                <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                                            ))}
                                        </select>
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-500">Empresa: {empresa?.nombre}</p>
                                )}
                                <input
                                    type="text" placeholder="Nombre" className="w-full px-4 py-3 rounded-xl border"
                                    value={editingStaff?.nombre || ''}
                                    onChange={e => setEditingStaff({ ...editingStaff, nombre: e.target.value })}
                                />
                                <input
                                    type="email" placeholder="Correo Electrónico (Usuario)" className="w-full px-4 py-3 rounded-xl border"
                                    value={editingStaff?.email || ''}
                                    onChange={e => setEditingStaff({ ...editingStaff, email: e.target.value })}
                                />
                                {!editingStaff?.id && (
                                    <input
                                        type="password"
                                        placeholder="Contraseña Inicial"
                                        className="w-full px-4 py-3 rounded-xl border font-mono"
                                        value={editingStaff?.password || ''}
                                        onChange={e => setEditingStaff({ ...editingStaff, password: e.target.value })}
                                    />
                                )}
                                {profile?.rol === 'admin_plataforma' ? (
                                    <div className="bg-primary-50 p-4 rounded-xl border border-primary-100 text-xs font-bold text-primary-700 uppercase tracking-widest flex items-center gap-2">
                                        <Shield className="w-4 h-4" /> Rol: Administrador de Oficina
                                    </div>
                                ) : profile?.rol === 'oficina' ? (
                                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                        <Shield className="w-4 h-4" /> Rol: Mesero (Automático)
                                    </div>
                                ) : (
                                    <select
                                        className="w-full px-4 py-3 rounded-xl border bg-white"
                                        value={editingStaff?.rol || 'mesero'}
                                        onChange={e => setEditingStaff({ ...editingStaff, rol: e.target.value as any })}
                                    >
                                        <option value="mesero">Mesero / Servicio</option>
                                        <option value="oficina">Administrador / Oficina</option>
                                        <option value="cocina">Personal de Cocina</option>
                                    </select>
                                )}

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado</label>
                                    <select
                                        className="w-full px-4 py-3 rounded-xl border bg-white"
                                        value={editingStaff?.estado || 'activo'}
                                        onChange={e => setEditingStaff({ ...editingStaff, estado: e.target.value as any })}
                                    >
                                        <option value="activo">Activo</option>
                                        <option value="baja">Baja</option>
                                    </select>
                                </div>

                                {editingStaff?.estado === 'baja' && (
                                    <div className="space-y-4 p-4 bg-red-50 rounded-2xl border border-red-100 animate-in fade-in slide-in-from-top-2">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-red-400 uppercase tracking-widest">Fecha de Baja</label>
                                            <input
                                                type="date"
                                                className="w-full px-4 py-2 rounded-lg border border-red-200 outline-none focus:ring-2 focus:ring-red-500"
                                                value={editingStaff?.fecha_baja || ''}
                                                onChange={e => setEditingStaff({ ...editingStaff, fecha_baja: e.target.value })}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-red-400 uppercase tracking-widest">Motivo de Baja</label>
                                            <textarea
                                                className="w-full px-4 py-2 rounded-lg border border-red-200 outline-none focus:ring-2 focus:ring-red-500 text-sm"
                                                placeholder="Describa el motivo..."
                                                rows={2}
                                                value={editingStaff?.motivo_baja || ''}
                                                onChange={e => setEditingStaff({ ...editingStaff, motivo_baja: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                )}

                                <input
                                    type="text" maxLength={4} placeholder="PIN (4 dígitos)" className="w-full px-4 py-3 rounded-xl border font-mono text-center"
                                    value={editingStaff?.pin || ''}
                                    onChange={e => setEditingStaff({ ...editingStaff, pin: e.target.value.replace(/\D/g, '') })}
                                />
                            </div>

                            <div className="p-8 bg-slate-50 flex gap-4 border-t border-slate-100">
                                <button onClick={() => setIsStaffModalOpen(false)} className="flex-1 py-3 font-bold bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">Cancelar</button>
                                <button onClick={handleSaveStaffMember} className="flex-1 py-3 font-bold bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors">Guardar</button>
                            </div>
                        </div>
                    </div>
                )
            }
            {
                isMesaModalOpen && (
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 space-y-6">
                            <h2 className="text-xl font-bold">{editingMesa?.id ? 'Editar' : 'Nueva'} Mesa</h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase">Número / Nombre</label>
                                    <input
                                        type="text" placeholder="Ej: 01, Barra 1, VIP..." className="w-full px-4 py-3 rounded-xl border mt-1"
                                        value={editingMesa?.numero || ''}
                                        onChange={e => setEditingMesa({ ...editingMesa, numero: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase">Capacidad (Personas)</label>
                                    <div className="flex gap-2 mt-1">
                                        {[2, 4, 6, 8, 10].map(n => (
                                            <button
                                                key={n}
                                                type="button"
                                                onClick={() => setEditingMesa({ ...editingMesa, capacidad: n })}
                                                className={cn(
                                                    "w-10 h-10 rounded-lg font-bold border flex items-center justify-center transition-all",
                                                    editingMesa?.capacidad === n ? "bg-primary-600 text-white border-primary-600" : "bg-white text-slate-500 hover:border-slate-300"
                                                )}
                                            >
                                                {n}
                                            </button>
                                        ))}
                                    </div>
                                    <input
                                        type="number" placeholder="Otra..." className="w-full px-4 py-2 rounded-xl border mt-2 text-sm"
                                        value={editingMesa?.capacidad || ''}
                                        onChange={e => setEditingMesa({ ...editingMesa, capacidad: parseInt(e.target.value) })}
                                    />
                                </div>
                            </div>
                            <div className="flex gap-4 pt-2">
                                <button onClick={() => setIsMesaModalOpen(false)} className="flex-1 py-3 font-bold border rounded-xl">Cancelar</button>
                                <button onClick={handleSaveMesa} className="flex-1 py-3 font-bold bg-primary-600 text-white rounded-xl">Guardar</button>
                            </div>
                        </div>
                    </div>
                )
            }
            {
                isCategoriaModalOpen && (
                    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 space-y-6">
                            <h2 className="text-xl font-bold">{editingCategoria?.id ? 'Editar' : 'Nueva'} Categoría</h2>
                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Nombre de Categoría</label>
                                    <input
                                        type="text" placeholder="Ej: Entradas, Bebidas, Postres..." className="w-full px-4 py-3 rounded-xl border mt-1 font-bold"
                                        value={editingCategoria?.nombre || ''}
                                        onChange={e => setEditingCategoria({ ...editingCategoria, nombre: e.target.value })}
                                        autoFocus
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Tipo</label>
                                    <select
                                        className="w-full px-4 py-3 rounded-xl border mt-1 bg-white"
                                        value={editingCategoria?.tipo || 'ALIMENTO'}
                                        onChange={e => setEditingCategoria({ ...editingCategoria, tipo: e.target.value })}
                                    >
                                        <option value="ALIMENTO">Restaurante / Alimentos</option>
                                        <option value="BEBIDA">Bebidas / Bar</option>
                                        <option value="OTROS">Otros</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex gap-4 pt-2">
                                <button onClick={() => setIsCategoriaModalOpen(false)} className="flex-1 py-3 font-bold border rounded-xl hover:bg-slate-50 transition-colors">Cancelar</button>
                                <button onClick={handleSaveCategoria} className="flex-1 py-3 font-bold bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors">Guardar</button>
                            </div>
                        </div>
                    </div>
                )}
        </div>
    )
}
