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
    Image as ImageIcon,
    Loader2,
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

                // ── Cargar empresa (SIEMPRE, independiente) ──
                try {
                    const { data: empData, error: empError } = await supabase
                        .from('empresas')
                        .select('*')
                        .eq('id', empresa!.id)
                        .single()
                    if (empError) console.error('Error cargando empresa:', empError)
                    if (empData) setCompanyData(empData)
                } catch (e) {
                    console.error('Error cargando empresa:', e)
                }

                // ── Cargar staff (independiente) ──
                try {
                    const staffData = await staffService.getStaffByEmpresa(empresa!.id)
                    const filteredStaff = staffData.filter(s =>
                        s.rol !== 'admin_plataforma' &&
                        s.id !== profile?.id
                    )
                    setStaff(filteredStaff)
                } catch (e) {
                    console.error('Error cargando staff:', e)
                }

                // ── Cargar mesas (independiente) ──
                try {
                    const mesasData = await mesaService.getMesas()
                    setMesas(mesasData)
                } catch (e) {
                    console.error('Error cargando mesas:', e)
                }

                // ── Cargar categorías (independiente, con fallback) ──
                try {
                    const categoriasData = await categoriaService.getCategorias(empresa!.id)
                    setCategorias(categoriasData)
                } catch (e) {
                    console.error('Error cargando categorías:', e)
                    // Fallback: intentar sin filtro de activo
                    try {
                        const { data } = await supabase
                            .from('categorias')
                            .select('*')
                            .eq('empresa_id', empresa!.id)
                            .order('nombre')
                        setCategorias(data || [])
                    } catch (e2) {
                        console.error('Error en fallback categorías:', e2)
                        setCategorias([])
                    }
                }
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

            // ✅ Solo campos que existen en la tabla empresas del schema real
            const payload: Record<string, any> = {
                nombre: editingEmpresa.nombre || '',
                ruc: editingEmpresa.ruc || '',
                direccion: editingEmpresa.direccion || '',
                telefono: editingEmpresa.telefono || null,
                logo_url: editingEmpresa.logo_url || null,
                config_sri: {
                    ambiente: editingEmpresa.config_sri?.ambiente || 'PRUEBAS',
                    establecimiento: editingEmpresa.config_sri?.establecimiento || '001',
                    punto_emision: editingEmpresa.config_sri?.punto_emision || '001',
                    secuencial_inicio: editingEmpresa.config_sri?.secuencial_inicio || 1,
                    firma_path: editingEmpresa.config_sri?.firma_path || null,
                    firma_url: editingEmpresa.config_sri?.firma_url || null,
                    firma_password: editingEmpresa.config_sri?.firma_password || null,
                    mail_user: editingEmpresa.config_sri?.mail_user || null,
                    obligado_contabilidad: editingEmpresa.config_sri?.obligado_contabilidad || 'NO',
                }
            }

            let error
            if (editingEmpresa.id) {
                const result = await supabase.from('empresas').update(payload).eq('id', editingEmpresa.id)
                error = result.error
            } else {
                const result = await supabase.from('empresas').insert(payload)
                error = result.error
            }

            if (error) throw error

            setIsEmpresaModalOpen(false)
            setEditingEmpresa(null)
            loadData()
            alert('Empresa guardada con éxito')
        } catch (error: any) {
            console.error('Error saving empresa:', error)
            alert(`Error al guardar empresa: ${error.message}`)
        } finally {
            setSaving(false)
        }
    }

    async function handleSaveCompany(e: React.FormEvent) {
        e.preventDefault()
        try {
            setSaving(true)
            // ✅ Solo campos que existen en la tabla empresas
            const { error } = await supabase
                .from('empresas')
                .update({
                    nombre: companyData.nombre,
                    ruc: companyData.ruc,
                    direccion: companyData.direccion || companyData.direccion_matriz || '',
                    telefono: companyData.telefono || null,
                    logo_url: companyData.logo_url || null,
                    config_sri: companyData.config_sri || {}
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
            if (!editingCategoria?.nombre?.trim()) {
                alert('El nombre es obligatorio')
                return
            }

            if (editingCategoria.id) {
                // Al editar: solo actualizar campos editables, nunca tocar 'activo'
                const { id, empresa_id, created_at, activo, ...updates } = editingCategoria as any
                await categoriaService.updateCategoria(editingCategoria.id, updates)
            } else {
                await categoriaService.createCategoria({
                    nombre: editingCategoria.nombre,
                    descripcion: editingCategoria.descripcion || '',
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

    async function handleBajaCategoria(id: string, nombre: string) {
        if (!confirm(`¿Está seguro de dar de baja la categoría "${nombre}"? No se eliminará, quedará inactiva.`)) return
        try {
            await categoriaService.darBajaCategoria(id)
            loadData()
        } catch (error: any) {
            // Si la columna activo no existe aún en BD, fallback a delete
            if (error.message?.includes('column') || error.message?.includes('activo')) {
                if (confirm('La columna "activo" no existe en la BD. ¿Desea eliminar permanentemente?')) {
                    await categoriaService.deleteCategoria(id)
                    loadData()
                }
            } else {
                alert(`Error al dar de baja: ${error.message}`)
            }
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
                        onClick={() => setActiveTab('categorias')}
                        className={cn(
                            "flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all",
                            activeTab === 'categorias' ? "bg-white text-primary-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        <Tag className="w-4 h-4" />
                        Categorías
                    </button>
                </div>
            )}

            {activeTab === 'empresa' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4">
                    <div className="lg:col-span-2">
                        <form onSubmit={handleSaveCompany} className="card p-8 space-y-6">
                            {/* Encabezado */}
                            <div className="flex items-center gap-4 pb-4 border-b border-slate-100">
                                <div className="p-3 bg-primary-50 text-primary-600 rounded-2xl">
                                    <Building2 className="w-6 h-6" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-slate-900">Datos de la Empresa</h2>
                                    <p className="text-sm text-slate-500">Información legal y de contacto</p>
                                </div>
                            </div>

                            {/* Campos principales */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Razón Social</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500"
                                        value={companyData.nombre || ''}
                                        onChange={e => setCompanyData({ ...companyData, nombre: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                        RUC
                                        <span className="normal-case font-normal text-[10px] bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full">No modificable</span>
                                    </label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 rounded-xl border border-slate-100 bg-slate-50 text-slate-500 cursor-not-allowed font-mono"
                                        value={companyData.ruc || ''}
                                        readOnly
                                        tabIndex={-1}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Dirección</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500"
                                        value={companyData.direccion || ''}
                                        onChange={e => setCompanyData({ ...companyData, direccion: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Teléfono</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500"
                                        value={companyData.telefono || ''}
                                        onChange={e => setCompanyData({ ...companyData, telefono: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* Logo */}
                            <div className="space-y-2">
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

                            {/* Configuración SRI */}
                            <div className="border-t border-slate-100 pt-6 space-y-4">
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                    <Shield className="w-4 h-4 text-primary-500" />
                                    Configuración SRI / Facturación Electrónica
                                </h3>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Establecimiento</label>
                                        <input
                                            type="text" maxLength={3} placeholder="001"
                                            className="w-full px-4 py-3 rounded-xl border font-mono"
                                            value={companyData.config_sri?.establecimiento || ''}
                                            onChange={e => setCompanyData({ ...companyData, config_sri: { ...(companyData.config_sri || {}), establecimiento: e.target.value } })}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Punto Emisión</label>
                                        <input
                                            type="text" maxLength={3} placeholder="001"
                                            className="w-full px-4 py-3 rounded-xl border font-mono"
                                            value={companyData.config_sri?.punto_emision || ''}
                                            onChange={e => setCompanyData({ ...companyData, config_sri: { ...(companyData.config_sri || {}), punto_emision: e.target.value } })}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Ambiente</label>
                                        <select
                                            className="w-full px-4 py-3 rounded-xl border bg-white font-bold text-sm"
                                            value={companyData.config_sri?.ambiente || 'PRUEBAS'}
                                            onChange={e => setCompanyData({ ...companyData, config_sri: { ...(companyData.config_sri || {}), ambiente: e.target.value } })}
                                        >
                                            <option value="PRUEBAS">PRUEBAS</option>
                                            <option value="PRODUCCION">PRODUCCIÓN</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Secuencial Inicial Facturas</label>
                                        <input
                                            type="number" min={1} placeholder="1"
                                            className="w-full px-4 py-3 rounded-xl border font-mono"
                                            value={companyData.config_sri?.secuencial_inicio || 1}
                                            onChange={e => setCompanyData({ ...companyData, config_sri: { ...(companyData.config_sri || {}), secuencial_inicio: parseInt(e.target.value) || 1 } })}
                                        />
                                        <p className="text-[11px] text-slate-400">Número desde el cual inicia la secuencia si no hay facturas previas</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                            Firma (.p12)
                                            {companyData.config_sri?.firma_path && (
                                                <span className="ml-2 text-emerald-600 normal-case font-normal text-[11px]">
                                                    ✅ {companyData.config_sri.firma_path}
                                                </span>
                                            )}
                                        </label>
                                        <input
                                            type="file" accept=".p12"
                                            className="w-full text-xs file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-black file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0]
                                                if (!file) return
                                                try {
                                                    const path = await sriService.uploadFirma(empresa!.id, file)
                                                    setCompanyData({ ...companyData, config_sri: { ...(companyData.config_sri || {}), firma_path: path, firma_url: path } })
                                                    alert(`✅ Firma "${file.name}" subida correctamente`)
                                                } catch (err: any) {
                                                    alert('Error al subir firma: ' + err.message)
                                                }
                                            }}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Contraseña Firma</label>
                                        <input
                                            type="password" placeholder="••••••••"
                                            className="w-full px-4 py-3 rounded-xl border"
                                            value={companyData.config_sri?.firma_password || ''}
                                            onChange={e => setCompanyData({ ...companyData, config_sri: { ...(companyData.config_sri || {}), firma_password: e.target.value } })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="pt-2">
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="btn btn-primary w-full py-4 text-lg font-black flex items-center justify-center gap-2"
                                >
                                    {saving ? <Loader2 className="w-6 h-6 animate-spin" /> : <><Save className="w-6 h-6" /> Guardar Configuración</>}
                                </button>
                            </div>
                        </form>
                    </div>

                    <div className="space-y-6">
                        <div className="card p-6 bg-primary-600 text-white">
                            <h3 className="font-bold flex items-center gap-2 mb-4">
                                <Shield className="w-5 h-5 text-primary-200" />
                                Datos Actuales
                            </h3>
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between border-b border-primary-500 pb-2">
                                    <span className="text-primary-100">RUC</span>
                                    <span className="font-bold font-mono">{companyData.ruc || 'N/D'}</span>
                                </div>
                                <div className="flex justify-between border-b border-primary-500 pb-2">
                                    <span className="text-primary-100">Ambiente SRI</span>
                                    <span className={`font-bold ${companyData.config_sri?.ambiente === 'PRODUCCION' ? 'text-emerald-300' : 'text-amber-300'}`}>
                                        {companyData.config_sri?.ambiente || 'PRUEBAS'}
                                    </span>
                                </div>
                                <div className="flex justify-between pb-2">
                                    <span className="text-primary-100">Serie</span>
                                    <span className="font-bold font-mono">
                                        {companyData.config_sri?.establecimiento || '---'}-{companyData.config_sri?.punto_emision || '---'}
                                    </span>
                                </div>
                                <div className="flex justify-between pb-2">
                                    <span className="text-primary-100">Firma</span>
                                    <span className="font-bold text-xs">
                                        {companyData.config_sri?.firma_path ? '✅ Configurada' : '⚠ Sin firma'}
                                    </span>
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
                                setEditingCategoria({ nombre: '' })
                                setIsCategoriaModalOpen(true)
                            }}
                            className="btn btn-primary py-2 px-4 text-sm flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" /> Nueva Categoría
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {categorias.map(cat => (
                            <div key={cat.id} className={cn(
                                "card p-6 group relative hover:shadow-lg transition-all border-l-4",
                                cat.activo === false ? "border-l-slate-300 opacity-60" : "border-l-primary-500"
                            )}>
                                {/* Botones de acción */}
                                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        title="Editar"
                                        onClick={() => { setEditingCategoria(cat); setIsCategoriaModalOpen(true) }}
                                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-primary-600"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    {cat.activo !== false && (
                                        <button
                                            title="Dar de baja (inactivar)"
                                            onClick={() => handleBajaCategoria(cat.id, cat.nombre)}
                                            className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                                {/* Contenido */}
                                <div className="space-y-2 pt-1">
                                    <div className="flex items-start justify-between gap-2">
                                        <h3 className="font-bold text-slate-900 text-base uppercase tracking-tight leading-tight">{cat.nombre}</h3>
                                        {cat.activo === false && (
                                            <span className="shrink-0 text-[9px] font-black bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full uppercase">Inactiva</span>
                                        )}
                                    </div>
                                    {cat.descripcion && (
                                        <p className="text-xs text-slate-400 mt-1 line-clamp-2">{cat.descripcion}</p>
                                    )}
                                </div>
                            </div>
                        ))}
                        {categorias.length === 0 && (
                            <div className="col-span-full py-16 text-center">
                                <Tag className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                                <p className="text-slate-400 font-medium">No hay categorías registradas.</p>
                                <p className="text-slate-300 text-sm mt-1">Crea la primera categoría con el botón de arriba.</p>
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
                                            email: '',
                                            telefono: '',
                                            config_iva: 15,
                                            config_propina: 10,
                                            activo: true,
                                            config_sri: {
                                                ambiente: 'PRUEBAS',
                                                establecimiento: '001',
                                                punto_emision: '001',
                                                secuencial_inicio: 1
                                            }
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

                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Dirección</label>
                                        <input
                                            type="text" placeholder="Ciudad, calle, número..." className="w-full px-4 py-3 rounded-xl border mt-1"
                                            value={editingEmpresa?.direccion || ''}
                                            onChange={e => setEditingEmpresa({ ...editingEmpresa, direccion: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Teléfono</label>
                                        <input
                                            type="text" placeholder="+593 99 999 9999" className="w-full px-4 py-3 rounded-xl border mt-1"
                                            value={editingEmpresa?.telefono || ''}
                                            onChange={e => setEditingEmpresa({ ...editingEmpresa, telefono: e.target.value })}
                                        />
                                    </div>
                                </div>

                                {/* Logo Upload */}
                                <div>
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Logo (imagen)</label>
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


                            {/* ── SECCIÓN CONFIGURACIÓN SRI ──────────────── */}
                            <div className="border-t border-slate-100 pt-6 space-y-4">
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                    <span className="w-2 h-2 bg-primary-500 rounded-full" />
                                    Configuración SRI / Facturación Electrónica
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Establecimiento</label>
                                        <input
                                            type="text" maxLength={3} placeholder="001"
                                            className="w-full px-4 py-3 rounded-xl border mt-1 font-mono"
                                            value={editingEmpresa?.config_sri?.establecimiento || ''}
                                            onChange={e => setEditingEmpresa({
                                                ...editingEmpresa,
                                                config_sri: { ...(editingEmpresa?.config_sri || {}), establecimiento: e.target.value }
                                            })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Punto Emisión</label>
                                        <input
                                            type="text" maxLength={3} placeholder="001"
                                            className="w-full px-4 py-3 rounded-xl border mt-1 font-mono"
                                            value={editingEmpresa?.config_sri?.punto_emision || ''}
                                            onChange={e => setEditingEmpresa({
                                                ...editingEmpresa,
                                                config_sri: { ...(editingEmpresa?.config_sri || {}), punto_emision: e.target.value }
                                            })}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Ambiente</label>
                                        <select
                                            className="w-full px-4 py-3 rounded-xl border mt-1 bg-white font-bold text-sm"
                                            value={editingEmpresa?.config_sri?.ambiente || 'PRUEBAS'}
                                            onChange={e => setEditingEmpresa({
                                                ...editingEmpresa,
                                                config_sri: { ...(editingEmpresa?.config_sri || {}), ambiente: e.target.value }
                                            })}
                                        >
                                            <option value="PRUEBAS">PRUEBAS</option>
                                            <option value="PRODUCCION">PRODUCCIÓN</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Secuencial Inicial Facturas</label>
                                        <input
                                            type="number" min={1} placeholder="1"
                                            className="w-full px-4 py-3 rounded-xl border mt-1 font-mono"
                                            value={editingEmpresa?.config_sri?.secuencial_inicio || 1}
                                            onChange={e => setEditingEmpresa({
                                                ...editingEmpresa,
                                                config_sri: { ...(editingEmpresa?.config_sri || {}), secuencial_inicio: parseInt(e.target.value) || 1 }
                                            })}
                                        />
                                        <p className="text-[11px] text-slate-400 mt-1">Número desde el cual inicia la secuencia si no hay facturas previas</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                            Firma Electrónica (.p12)
                                            {editingEmpresa?.config_sri?.firma_path && (
                                                <span className="ml-2 text-emerald-600 normal-case font-normal">
                                                    ✅ {editingEmpresa.config_sri.firma_path}
                                                </span>
                                            )}
                                        </label>
                                        <input
                                            type="file" accept=".p12"
                                            className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-black file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 mt-1 cursor-pointer"
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0]
                                                if (!file) return
                                                try {
                                                    const path = await sriService.uploadFirma(editingEmpresa?.id || 'new', file)
                                                    setEditingEmpresa({
                                                        ...editingEmpresa,
                                                        config_sri: {
                                                            ...(editingEmpresa?.config_sri || {}),
                                                            firma_path: path,
                                                            firma_url: path
                                                        }
                                                    })
                                                    alert(`✅ Firma "${file.name}" subida correctamente`)
                                                } catch (err: any) {
                                                    alert('Error al subir firma: ' + err.message)
                                                }
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Contraseña de la Firma</label>
                                        <input
                                            type="password" placeholder="••••••••"
                                            className="w-full px-4 py-3 rounded-xl border mt-1"
                                            value={editingEmpresa?.config_sri?.firma_password || ''}
                                            onChange={e => setEditingEmpresa({
                                                ...editingEmpresa,
                                                config_sri: { ...(editingEmpresa?.config_sri || {}), firma_password: e.target.value }
                                            })}
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
                    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 space-y-5 animate-in zoom-in-95 duration-200">
                            {/* Header */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-primary-50 text-primary-600 rounded-xl">
                                        <Tag className="w-5 h-5" />
                                    </div>
                                    <h2 className="text-xl font-bold text-slate-900">
                                        {editingCategoria?.id ? 'Editar Categoría' : 'Nueva Categoría'}
                                    </h2>
                                </div>
                                <button
                                    onClick={() => { setIsCategoriaModalOpen(false); setEditingCategoria(null) }}
                                    className="p-2 hover:bg-slate-100 rounded-full text-slate-400"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Campos */}
                            <div className="space-y-4">
                                {/* Nombre */}
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                        Nombre de Categoría *
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Ej: Herramientas, Materiales, Servicios..."
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500 font-bold text-slate-900"
                                        value={editingCategoria?.nombre || ''}
                                        onChange={e => setEditingCategoria({ ...editingCategoria, nombre: e.target.value })}
                                        autoFocus
                                    />
                                </div>

                                {/* Descripción */}
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                        Descripción <span className="normal-case font-normal text-slate-300">(opcional)</span>
                                    </label>
                                    <textarea
                                        rows={2}
                                        placeholder="Breve descripción de esta categoría..."
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500 text-sm resize-none"
                                        value={editingCategoria?.descripcion || ''}
                                        onChange={e => setEditingCategoria({ ...editingCategoria, descripcion: e.target.value })}
                                    />
                                </div>

                                {/* Si es edición, mostrar estado actual */}
                                {editingCategoria?.id && (
                                    <div className={cn(
                                        'flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold',
                                        editingCategoria.activo === false
                                            ? 'bg-red-50 text-red-600 border border-red-100'
                                            : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                    )}>
                                        <span className={cn(
                                            'w-2 h-2 rounded-full',
                                            editingCategoria.activo === false ? 'bg-red-400' : 'bg-emerald-400'
                                        )} />
                                        Estado: {editingCategoria.activo === false ? 'Inactiva (dada de baja)' : 'Activa'}
                                    </div>
                                )}
                            </div>

                            {/* Botones */}
                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => { setIsCategoriaModalOpen(false); setEditingCategoria(null) }}
                                    className="flex-1 py-3 font-bold border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-slate-600"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSaveCategoria}
                                    disabled={saving || !editingCategoria?.nombre?.trim()}
                                    className="flex-1 py-3 font-bold bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                                >
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Guardar
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    )
}
