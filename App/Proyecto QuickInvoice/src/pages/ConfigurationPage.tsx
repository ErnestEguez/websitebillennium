import { useState, useEffect } from 'react'
import { HelpButton } from '../components/help/HelpButton'
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
    Tag,
    BookOpen,
    Warehouse,
    Star,
    PowerOff,
    Printer,
    AlignLeft,
    FolderTree,
    Download,
    Copy,
    CheckCheck,
} from 'lucide-react'
import { ContabilidadConfigTab } from '../components/ContabilidadConfigTab'
import { TalentoNominasConfigTab } from '../components/TalentoNominasConfigTab'
import { categoriaService, type Categoria } from '../services/categoriaService'
import { lineaService, type Linea } from '../services/lineaService'
import { subcategoriaService, type Subcategoria } from '../services/subcategoriaService'
import { bodegaService } from '../services/bodegaService'
import { puntoEmisionService } from '../services/puntoEmisionService'
import type { Bodega } from '../types/vendors'
import type { PuntoEmision } from '../types/puntosEmision'
import { cn } from '../lib/utils'
import { getPuntoEmisionDispositivo, setPuntoEmisionDispositivo } from '../lib/dispositivoPuntoEmision'
import { auditService } from '../services/auditoria/auditService'
import { ConfigImpresionTicketModal } from '../components/ConfigImpresionTicketModal'

// ── Campo verificador de código de artículo para preparaciones ───────────────
function PrepPinturaCodeField({
    value,
    empresaId,
    onChange,
}: { value: string; empresaId: string; onChange: (v: string) => void }) {
    const [verifying, setVerifying] = useState(false)
    const [found, setFound] = useState<string | null>(null)
    const [notFound, setNotFound] = useState(false)

    async function verify() {
        if (!value.trim() || !empresaId) return
        setVerifying(true)
        setFound(null)
        setNotFound(false)
        const { data } = await supabase
            .from('productos')
            .select('nombre, iva_porcentaje')
            .eq('empresa_id', empresaId)
            .ilike('codigo', value.trim())
            .eq('activo', true)
            .maybeSingle()
        setVerifying(false)
        if (data) setFound(`${data.nombre} (IVA ${data.iva_porcentaje}%)`)
        else setNotFound(true)
    }

    return (
        <div className="space-y-2">
            <div className="flex gap-2">
                <input
                    type="text"
                    placeholder="Ej: PREP-PINTURA"
                    className="flex-1 px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500 uppercase"
                    value={value}
                    onChange={e => { onChange(e.target.value.toUpperCase()); setFound(null); setNotFound(false) }}
                />
                <button
                    type="button"
                    onClick={verify}
                    disabled={verifying || !value.trim()}
                    className="px-4 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-sm transition-colors disabled:opacity-50"
                >
                    {verifying ? 'Verificando…' : 'Verificar'}
                </button>
            </div>
            {found && (
                <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                    <span>✓</span> {found}
                </p>
            )}
            {notFound && (
                <p className="text-xs text-red-500 font-semibold">
                    No se encontró ningún artículo activo con ese código. Créalo primero en el catálogo.
                </p>
            )}
        </div>
    )
}

export function ConfigurationPage() {
    const { empresa, profile } = useAuth()
    const [activeTab, setActiveTab] = useState<'empresa' | 'staff' | 'mesas' | 'categorias' | 'lineas' | 'subcategorias' | 'bodegas' | 'puntos_emision' | 'plataforma' | 'contabilidad' | 'talento_nominas'>('empresa')
    const [platformSubTab, setPlatformSubTab]   = useState<'empresas' | 'personal'>('empresas')
    const [mensajePlataforma, setMensajePlataforma] = useState('')
    const [savingMsg, setSavingMsg]               = useState(false)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [copiado, setCopiado] = useState(false)

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

    // Líneas State
    const [lineas, setLineas] = useState<Linea[]>([])
    const [isLineaModalOpen, setIsLineaModalOpen] = useState(false)
    const [editingLinea, setEditingLinea] = useState<Partial<Linea> | null>(null)

    // SubCategorías State
    const [subcategorias, setSubcategorias] = useState<Subcategoria[]>([])
    const [isSubcategoriaModalOpen, setIsSubcategoriaModalOpen] = useState(false)
    const [editingSubcategoria, setEditingSubcategoria] = useState<Partial<Subcategoria> | null>(null)

    // Bodegas State
    const [bodegas, setBodegas] = useState<Bodega[]>([])
    const [isBodegaModalOpen, setIsBodegaModalOpen] = useState(false)
    const [editingBodega, setEditingBodega] = useState<Partial<Bodega> | null>(null)

    // Puntos de Emisión State
    const [puntosEmision, setPuntosEmision] = useState<PuntoEmision[]>([])
    const [isPuntoEmisionModalOpen, setIsPuntoEmisionModalOpen] = useState(false)
    const [editingPuntoEmision, setEditingPuntoEmision] = useState<Partial<PuntoEmision> | null>(null)
    const [dispositivoPeId, setDispositivoPeId] = useState<string | null>(null)

    const [isImpresionModalOpen, setIsImpresionModalOpen] = useState(false)

    // Plataforma State (Admin)
    const [allEmpresas, setAllEmpresas] = useState<any[]>([])
    const [isEmpresaModalOpen, setIsEmpresaModalOpen] = useState(false)
    const [editingEmpresa, setEditingEmpresa] = useState<any>(null)
    const [oficinaUsers, setOficinaUsers] = useState<StaffMember[]>([])
    const [isSSOModalOpen, setIsSSOModalOpen] = useState(false)
    const [ssoForm, setSSOForm] = useState({ email: '', nombre: '', rol: 'oficina', empresa_id: '' })
    const [ssoLoading, setSSOLoading] = useState(false)

    useEffect(() => {
        if (profile?.rol === 'admin_plataforma') {
            setActiveTab('plataforma')
            // Cargar mensaje del sistema
            supabase.from('mensajes_plataforma').select('mensaje').eq('id', 1).maybeSingle()
                .then(({ data }) => { if (data) setMensajePlataforma(data.mensaje ?? '') })
        }
    }, [profile?.rol])

    async function guardarMensajePlataforma() {
        setSavingMsg(true)
        const { error } = await supabase
            .from('mensajes_plataforma')
            .update({ mensaje: mensajePlataforma, updated_at: new Date().toISOString() })
            .eq('id', 1)
        if (error) alert('Error al guardar mensaje: ' + error.message)
        setSavingMsg(false)
    }

    useEffect(() => {
        if (profile) {
            loadData()
        }
    }, [profile?.id, empresa?.id])

    useEffect(() => {
        if (empresa?.id) {
            setDispositivoPeId(getPuntoEmisionDispositivo(empresa.id))
        }
    }, [empresa?.id])

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

                // ── Cargar líneas ──
                try {
                    const lineasData = await lineaService.getLineas(empresa!.id, true)
                    setLineas(lineasData)
                } catch (e) {
                    console.error('Error cargando líneas:', e)
                    setLineas([])
                }

                // ── Cargar subcategorías ──
                try {
                    const subcatsData = await subcategoriaService.getSubcategorias(empresa!.id, true)
                    setSubcategorias(subcatsData)
                } catch (e) {
                    console.error('Error cargando subcategorías:', e)
                    setSubcategorias([])
                }

                // ── Cargar bodegas ──
                try {
                    const bodegasData = await bodegaService.listarTodas(empresa!.id)
                    setBodegas(bodegasData)
                } catch (e) {
                    console.error('Error cargando bodegas:', e)
                    setBodegas([])
                }

                // ── Cargar puntos de emisión ──
                try {
                    const puntosData = await puntoEmisionService.listarTodas(empresa!.id)
                    setPuntosEmision(puntosData)
                } catch (e) {
                    console.error('Error cargando puntos de emisión:', e)
                    setPuntosEmision([])
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

            // Snapshot ANTES de guardar — solo para detectar si cambiaron
            // credenciales sensibles (nunca se guarda el valor en texto plano
            // en el log de auditoría, solo la bandera de que cambió).
            let configSriAntes: Record<string, any> | null = null
            if (editingEmpresa.id) {
                const { data: empresaAntes } = await supabase
                    .from('empresas').select('config_sri').eq('id', editingEmpresa.id).single()
                configSriAntes = empresaAntes?.config_sri ?? null
            }

            // ✅ Solo campos que existen en la tabla empresas del schema real
            const payload: Record<string, any> = {
                nombre: editingEmpresa.nombre || '',
                ruc: editingEmpresa.ruc || '',
                direccion: editingEmpresa.direccion || '',
                telefono: editingEmpresa.telefono || null,
                logo_url: editingEmpresa.logo_url || null,
                usar_vendor_management: !!editingEmpresa.usar_vendor_management,
                config_sri: {
                    // Preserva TODOS los campos existentes (mail_host, mail_port, mail_pass,
                    // mail_ssl, mail_cc, y cualquier campo futuro que este formulario no
                    // gestione explícitamente) — antes se reconstruía el objeto desde cero
                    // con una lista fija de campos, borrando silenciosamente el resto.
                    ...(editingEmpresa.config_sri || {}),
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
            let empresaId: string | undefined = editingEmpresa.id
            if (editingEmpresa.id) {
                const result = await supabase.from('empresas').update(payload).eq('id', editingEmpresa.id)
                error = result.error
            } else {
                const result = await supabase.from('empresas').insert(payload).select('id').single()
                error = result.error
                empresaId = result.data?.id
            }

            if (error) throw error

            // LOPDP: upsert del flag junto con el resto del guardado — mismo
            // botón "Guardar Empresa", sin un paso separado. Vive en su propio
            // schema (lopdp.empresas_config), no en facturacion.empresas.
            if (empresaId) {
                const { error: lopdpError } = await supabase
                    .schema('lopdp')
                    .from('empresas_config')
                    .upsert({ empresa_id: empresaId, lopdp_enabled: !!editingEmpresa.lopdp_enabled })
                if (lopdpError) throw lopdpError
            }

            // Sesión única: upsert del flag junto con el resto del guardado,
            // mismo botón "Guardar Empresa". Vive en facturacion.sesion_unica_config
            // (schema default del cliente, sin .schema()).
            if (empresaId) {
                const { error: sesionUnicaError } = await supabase
                    .from('sesion_unica_config')
                    .upsert({ empresa_id: empresaId, enabled: !!editingEmpresa.sesion_unica_enabled })
                if (sesionUnicaError) throw sesionUnicaError
            }

            // Funciones de IA (Gemini): cada una se autoriza por separado, apagadas
            // por defecto — solo admin_plataforma puede activarlas por empresa.
            if (empresaId) {
                const { error: iaError } = await supabase
                    .from('ia_features_config')
                    .upsert({
                        empresa_id: empresaId,
                        compras_enabled: !!editingEmpresa.ia_compras_enabled,
                        voz_enabled: !!editingEmpresa.ia_voz_enabled,
                        cv_enabled: !!editingEmpresa.ia_cv_enabled,
                    })
                if (iaError) throw iaError
            }

            // Facturación Masiva: apagada por defecto, solo admin_plataforma
            // puede activarla por empresa (mismo patrón que arriba).
            if (empresaId) {
                const { error: facturacionMasivaError } = await supabase
                    .from('facturacion_masiva_config')
                    .upsert({ empresa_id: empresaId, enabled: !!editingEmpresa.facturacion_masiva_enabled })
                if (facturacionMasivaError) throw facturacionMasivaError
            }

            if (empresaId) {
                const cambios: Record<string, { antes: unknown; despues: unknown }> = {}
                if ((configSriAntes?.firma_password || null) !== (payload.config_sri.firma_password || null)) {
                    cambios.firma_password = { antes: configSriAntes?.firma_password ? 'configurada' : 'vacía', despues: payload.config_sri.firma_password ? 'configurada' : 'vacía' }
                }
                if ((configSriAntes?.mail_pass || null) !== (payload.config_sri.mail_pass || null)) {
                    cambios.mail_pass = { antes: configSriAntes?.mail_pass ? 'configurada' : 'vacía', despues: payload.config_sri.mail_pass ? 'configurada' : 'vacía' }
                }
                auditService.logEvent({
                    empresaId,
                    modulo: 'configuracion',
                    accion: 'actualizar',
                    entidad: 'empresa',
                    entidadId: empresaId,
                    resumen: `Cambio de configuración de empresa — ${payload.nombre}`,
                    cambios: Object.keys(cambios).length > 0 ? cambios : undefined,
                    detalle: {
                        lopdp_enabled: !!editingEmpresa.lopdp_enabled,
                        sesion_unica_enabled: !!editingEmpresa.sesion_unica_enabled,
                        ia_compras_enabled: !!editingEmpresa.ia_compras_enabled,
                        ia_voz_enabled: !!editingEmpresa.ia_voz_enabled,
                        ia_cv_enabled: !!editingEmpresa.ia_cv_enabled,
                        facturacion_masiva_enabled: !!editingEmpresa.facturacion_masiva_enabled,
                    },
                    nivel: 'compliance',
                })
            }

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

            const { data: empresaAntes } = await supabase
                .from('empresas').select('config_sri').eq('id', empresa!.id).single()
            const configSriAntes = empresaAntes?.config_sri ?? null
            const configSriNuevo = companyData.config_sri || {}

            const { error } = await supabase
                .from('empresas')
                .update({
                    nombre: companyData.nombre,
                    ruc: companyData.ruc,
                    direccion: companyData.direccion || companyData.direccion_matriz || '',
                    telefono: companyData.telefono || null,
                    logo_url: companyData.logo_url || null,
                    config_sri: configSriNuevo,
                    usar_vendor_management: companyData.usar_vendor_management ?? false,
                    tope_consumidor_final: companyData.tope_consumidor_final ?? null,
                    glosa_factura: companyData.glosa_factura || null,
                    codigo_prep_pintura: companyData.codigo_prep_pintura || null,
                    // Configuración tributaria — agente de retención
                    es_agente_retencion: companyData.es_agente_retencion ?? false,
                    numero_resolucion_retencion: companyData.es_agente_retencion
                        ? (companyData.numero_resolucion_retencion || null)
                        : null,
                    fecha_inicio_retencion: companyData.es_agente_retencion
                        ? (companyData.fecha_inicio_retencion || null)
                        : null,
                })
                .eq('id', empresa!.id)
            if (error) throw error

            const cambios: Record<string, { antes: unknown; despues: unknown }> = {}
            if ((configSriAntes?.firma_password || null) !== (configSriNuevo.firma_password || null)) {
                cambios.firma_password = { antes: configSriAntes?.firma_password ? 'configurada' : 'vacía', despues: configSriNuevo.firma_password ? 'configurada' : 'vacía' }
            }
            if ((configSriAntes?.mail_pass || null) !== (configSriNuevo.mail_pass || null)) {
                cambios.mail_pass = { antes: configSriAntes?.mail_pass ? 'configurada' : 'vacía', despues: configSriNuevo.mail_pass ? 'configurada' : 'vacía' }
            }
            auditService.logEvent({
                empresaId: empresa!.id,
                modulo: 'configuracion',
                accion: 'actualizar',
                entidad: 'empresa',
                entidadId: empresa!.id,
                resumen: `Cambio de configuración de empresa — ${companyData.nombre}`,
                cambios: Object.keys(cambios).length > 0 ? cambios : undefined,
                nivel: 'compliance',
            })

            alert('Configuración de empresa guardada correctamente')
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

    async function handleDarAccesoPortal() {
        if (!ssoForm.email || !ssoForm.nombre || !ssoForm.empresa_id) {
            alert('Email, nombre y empresa son obligatorios')
            return
        }
        setSSOLoading(true)
        try {
            const { data, error } = await supabase.rpc('dar_acceso_portal', {
                p_email:      ssoForm.email.trim().toLowerCase(),
                p_empresa_id: ssoForm.empresa_id,
                p_nombre:     ssoForm.nombre,
                p_rol:        ssoForm.rol,
            })
            if (error) throw error
            if (!data.ok) throw new Error(data.error)
            alert(`Acceso concedido correctamente a ${ssoForm.email}`)
            setIsSSOModalOpen(false)
            setSSOForm({ email: '', nombre: '', rol: 'oficina', empresa_id: '' })
            loadData()
        } catch (err: any) {
            alert(`Error: ${err.message}`)
        } finally {
            setSSOLoading(false)
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

    async function handleSaveBodega() {
        try {
            setSaving(true)
            if (!editingBodega?.nombre?.trim()) {
                alert('El nombre de la bodega es obligatorio')
                return
            }

            if (editingBodega.id) {
                // Si se marca como principal, desmarcar la anterior
                if (editingBodega.es_principal) {
                    await supabase
                        .from('bodegas')
                        .update({ es_principal: false })
                        .eq('empresa_id', empresa!.id)
                        .neq('id', editingBodega.id)
                }
                const { id, empresa_id, created_at, updated_at, ...updates } = editingBodega as any
                await bodegaService.actualizar(editingBodega.id, updates)
            } else {
                // Si la nueva es principal, desmarcar la anterior
                if (editingBodega.es_principal) {
                    await supabase
                        .from('bodegas')
                        .update({ es_principal: false })
                        .eq('empresa_id', empresa!.id)
                }
                await bodegaService.crear({
                    nombre: editingBodega.nombre!,
                    codigo: editingBodega.codigo || undefined,
                    descripcion: editingBodega.descripcion || undefined,
                    direccion: editingBodega.direccion || undefined,
                    es_principal: editingBodega.es_principal ?? false,
                    activo: true,
                    empresa_id: empresa!.id,
                })
            }

            setIsBodegaModalOpen(false)
            setEditingBodega(null)
            loadData()
        } catch (error: any) {
            alert(`Error al guardar bodega: ${error.message}`)
        } finally {
            setSaving(false)
        }
    }

    async function handleBajaBodega(id: string, nombre: string, esPrincipal: boolean) {
        if (esPrincipal) {
            alert('No se puede dar de baja la bodega principal. Primero asigna otra bodega como principal.')
            return
        }
        if (!confirm(`¿Está seguro de dar de baja la bodega "${nombre}"? No se eliminará, quedará inactiva.`)) return
        try {
            await bodegaService.desactivar(id)
            loadData()
        } catch (error: any) {
            alert(`Error al dar de baja: ${error.message}`)
        }
    }

    async function handleSavePuntoEmision() {
        try {
            setSaving(true)
            if (!editingPuntoEmision?.nombre?.trim()) {
                alert('El nombre del punto de emisión es obligatorio')
                return
            }
            const est = (editingPuntoEmision?.establecimiento || '').trim()
            const pto = (editingPuntoEmision?.punto_emision || '').trim()
            if (!/^\d{3}$/.test(est) || !/^\d{3}$/.test(pto)) {
                alert('Establecimiento y Punto de Emisión deben ser códigos de 3 dígitos (ej: 001)')
                return
            }

            if (editingPuntoEmision.id) {
                // Si se marca como principal, desmarcar el anterior
                if (editingPuntoEmision.es_principal) {
                    await supabase
                        .from('puntos_emision')
                        .update({ es_principal: false })
                        .eq('empresa_id', empresa!.id)
                        .neq('id', editingPuntoEmision.id)
                }
                // IMPORTANTE: nunca pasar secuenciales al actualizar general —
                // los secuenciales solo los modifica qi_next_secuencial_punto (RPC atómica)
                // o la acción explícita "Cambiar secuencial" de abajo.
                const { id, empresa_id, created_at, updated_at, secuenciales, ...updates } = editingPuntoEmision as any
                void secuenciales  // excluido intencionalmente
                await puntoEmisionService.actualizar(editingPuntoEmision.id, { ...updates, establecimiento: est, punto_emision: pto })
            } else {
                // Si el nuevo es principal, desmarcar el anterior
                if (editingPuntoEmision.es_principal) {
                    await supabase
                        .from('puntos_emision')
                        .update({ es_principal: false })
                        .eq('empresa_id', empresa!.id)
                }
                await puntoEmisionService.crear({
                    empresa_id: empresa!.id,
                    establecimiento: est,
                    punto_emision: pto,
                    nombre: editingPuntoEmision.nombre!,
                    direccion: editingPuntoEmision.direccion || undefined,
                    descripcion: editingPuntoEmision.descripcion || undefined,
                    bodega_id: editingPuntoEmision.bodega_id || undefined,
                    es_principal: editingPuntoEmision.es_principal ?? false,
                    activo: true,
                })
            }

            setIsPuntoEmisionModalOpen(false)
            setEditingPuntoEmision(null)
            loadData()
        } catch (error: any) {
            alert(`Error al guardar punto de emisión: ${error.message}`)
        } finally {
            setSaving(false)
        }
    }

    async function handleBajaPuntoEmision(id: string, nombre: string, esPrincipal: boolean) {
        if (esPrincipal) {
            alert('No se puede dar de baja el punto de emisión principal. Primero asigna otro como principal.')
            return
        }
        if (!confirm(`¿Está seguro de dar de baja el punto de emisión "${nombre}"? No se eliminará, quedará inactivo.`)) return
        try {
            await puntoEmisionService.desactivar(id)
            loadData()
        } catch (error: any) {
            alert(`Error al dar de baja: ${error.message}`)
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

    async function handleSaveLinea() {
        try {
            setSaving(true)
            if (!editingLinea?.nombre?.trim()) {
                alert('El nombre es obligatorio')
                return
            }
            if (editingLinea.id) {
                const { id, empresa_id, created_at, activo, ...updates } = editingLinea as any
                await lineaService.updateLinea(editingLinea.id, updates)
            } else {
                await lineaService.createLinea({
                    nombre: editingLinea.nombre,
                    descripcion: editingLinea.descripcion || '',
                    empresa_id: empresa!.id,
                })
            }
            setIsLineaModalOpen(false)
            setEditingLinea(null)
            loadData()
        } catch (error: any) {
            alert(`Error al guardar línea: ${error.message}`)
        } finally {
            setSaving(false)
        }
    }

    async function handleBajaLinea(id: string, nombre: string) {
        if (!confirm(`¿Dar de baja la línea "${nombre}"?`)) return
        try {
            await lineaService.darBajaLinea(id)
            loadData()
        } catch (error: any) {
            alert(`Error al dar de baja: ${error.message}`)
        }
    }

    async function handleSaveSubcategoria() {
        try {
            setSaving(true)
            if (!editingSubcategoria?.nombre?.trim()) {
                alert('El nombre es obligatorio')
                return
            }
            if (editingSubcategoria.id) {
                const { id, empresa_id, created_at, activo, ...updates } = editingSubcategoria as any
                await subcategoriaService.updateSubcategoria(editingSubcategoria.id, updates)
            } else {
                await subcategoriaService.createSubcategoria({
                    nombre: editingSubcategoria.nombre,
                    descripcion: editingSubcategoria.descripcion || '',
                    empresa_id: empresa!.id,
                })
            }
            setIsSubcategoriaModalOpen(false)
            setEditingSubcategoria(null)
            loadData()
        } catch (error: any) {
            alert(`Error al guardar subcategoría: ${error.message}`)
        } finally {
            setSaving(false)
        }
    }

    async function handleBajaSubcategoria(id: string, nombre: string) {
        if (!confirm(`¿Dar de baja la subcategoría "${nombre}"?`)) return
        try {
            await subcategoriaService.darBajaSubcategoria(id)
            loadData()
        } catch (error: any) {
            alert(`Error al dar de baja: ${error.message}`)
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
                <div className="flex items-center gap-2">
                    <HelpButton pageKey="configuracion" />
                    {profile?.rol === 'admin_plataforma' && (
                        <a
                            href="/"
                            className="btn btn-secondary py-2 px-4 text-sm flex items-center gap-2"
                        >
                            <ArrowLeft className="w-4 h-4" /> Volver al Dashboard
                        </a>
                    )}
                </div>
            </div>

            {/* Tabs - Only show for non-platform admins */}
            {profile?.rol !== 'admin_plataforma' && (
                <div className="flex gap-1 p-1 bg-slate-100 rounded-xl w-fit flex-wrap">
                    <button
                        data-sentinel="tab-empresa"
                        onClick={() => setActiveTab('empresa')}
                        className={cn(
                            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all",
                            activeTab === 'empresa' ? "bg-white text-primary-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        <Building2 className="w-4 h-4" />
                        Empresa
                    </button>
                    <button
                        onClick={() => setActiveTab('categorias')}
                        className={cn(
                            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all",
                            activeTab === 'categorias' ? "bg-white text-primary-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        <Tag className="w-4 h-4" />
                        Categorías
                    </button>
                    <button
                        onClick={() => setActiveTab('lineas')}
                        className={cn(
                            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all",
                            activeTab === 'lineas' ? "bg-white text-teal-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        <AlignLeft className="w-4 h-4" />
                        Líneas
                    </button>
                    <button
                        onClick={() => setActiveTab('subcategorias')}
                        className={cn(
                            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all",
                            activeTab === 'subcategorias' ? "bg-white text-orange-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        <FolderTree className="w-4 h-4" />
                        SubCategorías
                    </button>
                    <button
                        onClick={() => setActiveTab('bodegas')}
                        className={cn(
                            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all",
                            activeTab === 'bodegas' ? "bg-white text-amber-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        <Warehouse className="w-4 h-4" />
                        Bodegas
                    </button>
                    <button
                        onClick={() => setActiveTab('puntos_emision')}
                        className={cn(
                            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all",
                            activeTab === 'puntos_emision' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        <Printer className="w-4 h-4" />
                        Puntos de Emisión
                    </button>
                    <button
                        onClick={() => setActiveTab('contabilidad')}
                        className={cn(
                            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all",
                            activeTab === 'contabilidad' ? "bg-white text-purple-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        <BookOpen className="w-4 h-4" />
                        Contabilidad
                    </button>
                    <button
                        onClick={() => setActiveTab('talento_nominas')}
                        className={cn(
                            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all",
                            activeTab === 'talento_nominas' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                        )}
                    >
                        <Users className="w-4 h-4" />
                        Talento / Nóminas
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
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                        Tope Consumidor Final
                                        <span className="ml-2 normal-case font-normal text-[10px] text-slate-400">máx $ a facturar sin RUC/cédula</span>
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        placeholder="Ej: 50.00"
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500"
                                        value={companyData.tope_consumidor_final ?? ''}
                                        onChange={e => setCompanyData({ ...companyData, tope_consumidor_final: e.target.value ? parseFloat(e.target.value) : null })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                    Glosa / Mensaje en Facturas
                                    <span className="ml-2 normal-case font-normal text-[10px] text-slate-400">aparece en el pie de todas las facturas</span>
                                </label>
                                <textarea
                                    rows={3}
                                    maxLength={400}
                                    placeholder="Ej: Gracias por su compra. No se aceptan devoluciones."
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                                    value={companyData.glosa_factura || ''}
                                    onChange={e => setCompanyData({ ...companyData, glosa_factura: e.target.value })}
                                />
                            </div>

                            {/* Código artículo preparación de pinturas */}
                            <div className="space-y-1">
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <Tag className="w-3 h-3" /> Código Artículo — Preparación de Pinturas
                                    <span className="normal-case font-normal text-[10px] text-slate-400">el artículo debe existir previamente en el catálogo</span>
                                </label>
                                <PrepPinturaCodeField
                                    value={companyData.codigo_prep_pintura || ''}
                                    empresaId={empresa?.id || ''}
                                    onChange={v => setCompanyData({ ...companyData, codigo_prep_pintura: v })}
                                />
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
                                    <div data-sentinel="tab-firma" className="space-y-1">
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

                            {/* Configuración Tributaria */}
                            <div className="border-t border-slate-100 pt-6 space-y-4">
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                    <Shield className="w-4 h-4 text-amber-500" />
                                    Configuración Tributaria
                                </h3>

                                {/* Toggle agente de retención */}
                                <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
                                    <div>
                                        <p className="font-semibold text-slate-800 text-sm">¿Es Agente de Retención?</p>
                                        <p className="text-xs text-slate-500 mt-0.5">Designado por el SRI para emitir comprobantes de retención</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const nuevoValor = !companyData.es_agente_retencion
                                            if (!nuevoValor && companyData.es_agente_retencion) {
                                                if (!window.confirm('¿Está seguro? Esto desactivará las validaciones de retención en compras.')) return
                                            }
                                            setCompanyData({ ...companyData, es_agente_retencion: nuevoValor })
                                        }}
                                        className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${companyData.es_agente_retencion ? 'bg-primary-600' : 'bg-slate-200'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${companyData.es_agente_retencion ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </div>

                                {/* Campos adicionales — visibles solo cuando está activo */}
                                {companyData.es_agente_retencion && (
                                    <div className="space-y-4 p-4 bg-amber-50 rounded-xl border border-amber-100">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                                    N° Resolución SRI
                                                    <span className="ml-2 normal-case font-normal text-[10px] text-slate-400">opcional — referencial</span>
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="Ej: NAC-DNCRASC23-00000001"
                                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                                                    value={companyData.numero_resolucion_retencion || ''}
                                                    onChange={e => setCompanyData({ ...companyData, numero_resolucion_retencion: e.target.value })}
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                                    Vigente desde
                                                    <span className="ml-2 normal-case font-normal text-[10px] text-slate-400">opcional</span>
                                                </label>
                                                <input
                                                    type="date"
                                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                                                    value={companyData.fecha_inicio_retencion || ''}
                                                    onChange={e => setCompanyData({ ...companyData, fecha_inicio_retencion: e.target.value })}
                                                />
                                            </div>
                                        </div>
                                        <p className="text-xs text-amber-700 flex items-start gap-2">
                                            <span className="text-base leading-none">⚠️</span>
                                            <span>Al activar esta opción, el sistema exigirá retenciones en compras de inventario y servicios.</span>
                                        </p>
                                    </div>
                                )}
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

                        {/* ── Impresora Térmica 80mm ── */}
                        <div className="card p-6 space-y-4">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                                <Printer className="w-4 h-4 text-primary-500" />
                                Impresora Térmica 80mm — Impresión Directa
                            </h3>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                Para que Chrome imprima <strong>directamente a la térmica sin mostrar el diálogo</strong>,
                                abre la aplicación con el flag <code className="bg-slate-100 px-1 rounded font-mono">--kiosk-printing</code> y
                                configura la impresora 80mm como predeterminada en Windows.
                            </p>

                            <ol className="text-xs text-slate-600 space-y-2 list-decimal list-inside">
                                <li>En Windows, ve a <strong>Impresoras y escáneres</strong> → selecciona tu impresora 80mm → <strong>Establecer como predeterminada</strong></li>
                                <li>Descarga el acceso directo (botón abajo) y guárdalo en el escritorio</li>
                                <li>Abre QuickInvoice siempre usando ese acceso directo — Chrome imprimirá directo sin diálogo</li>
                            </ol>

                            <div className="bg-slate-50 rounded-xl p-3">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Comando Chrome</p>
                                <code className="text-xs text-slate-700 font-mono break-all">
                                    chrome.exe --kiosk-printing --app={window.location.origin}
                                </code>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => {
                                        const url = window.location.origin
                                        const bat = [
                                            '@echo off',
                                            'title QuickInvoice — Impresion Directa',
                                            '',
                                            'SET CHROME1="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"',
                                            'SET CHROME2="C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"',
                                            `SET APP_URL=${url}`,
                                            '',
                                            'IF EXIST %CHROME1% (',
                                            '    start "" %CHROME1% --kiosk-printing --app=%APP_URL%',
                                            '    GOTO :fin',
                                            ')',
                                            'IF EXIST %CHROME2% (',
                                            '    start "" %CHROME2% --kiosk-printing --app=%APP_URL%',
                                            '    GOTO :fin',
                                            ')',
                                            '',
                                            'echo Chrome no encontrado. Abrir manualmente con --kiosk-printing',
                                            'pause',
                                            ':fin',
                                        ].join('\r\n')
                                        const blob = new Blob([bat], { type: 'text/plain' })
                                        const a = document.createElement('a')
                                        a.href = URL.createObjectURL(blob)
                                        a.download = 'QuickInvoice_ImpresionDirecta.bat'
                                        a.click()
                                        URL.revokeObjectURL(a.href)
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-700 transition-colors"
                                >
                                    <Download className="w-3.5 h-3.5" /> Descargar .bat
                                </button>

                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(
                                            `chrome.exe --kiosk-printing --app=${window.location.origin}`
                                        ).then(() => {
                                            setCopiado(true)
                                            setTimeout(() => setCopiado(false), 2000)
                                        })
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors"
                                >
                                    {copiado
                                        ? <><CheckCheck className="w-3.5 h-3.5 text-emerald-600" /> Copiado</>
                                        : <><Copy className="w-3.5 h-3.5" /> Copiar comando</>
                                    }
                                </button>
                            </div>

                            <div className="pt-3 border-t border-slate-100">
                                <p className="text-xs text-slate-500 mb-2">
                                    Si el ticket sale descentrado, cortado o con márgenes incorrectos en esta impresora, ajusta el ancho de papel y los márgenes aquí:
                                </p>
                                <button
                                    onClick={() => setIsImpresionModalOpen(true)}
                                    className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-xl text-xs font-bold hover:bg-primary-700 transition-colors"
                                >
                                    <Printer className="w-3.5 h-3.5" /> Configurar márgenes y ancho de ticket
                                </button>
                            </div>
                        </div>
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
            ) : activeTab === 'lineas' ? (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Líneas de Producto</h2>
                            <p className="text-sm text-slate-500">Agrupa productos por línea comercial (ej: Lácteos, Bebidas, Limpieza)</p>
                        </div>
                        <button
                            onClick={() => { setEditingLinea({ nombre: '', descripcion: '' }); setIsLineaModalOpen(true) }}
                            className="btn btn-primary py-2 px-4 text-sm flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" /> Nueva Línea
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {lineas.map(lin => (
                            <div key={lin.id} className={cn(
                                "card p-6 group relative hover:shadow-lg transition-all border-l-4",
                                lin.activo === false ? "border-l-slate-300 opacity-60" : "border-l-teal-500"
                            )}>
                                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button title="Editar" onClick={() => { setEditingLinea(lin); setIsLineaModalOpen(true) }}
                                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-teal-600">
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    {lin.activo !== false && (
                                        <button title="Dar de baja" onClick={() => handleBajaLinea(lin.id, lin.nombre)}
                                            className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                                <div className="space-y-2 pt-1">
                                    <div className="flex items-start justify-between gap-2">
                                        <h3 className="font-bold text-slate-900 text-base uppercase tracking-tight leading-tight">{lin.nombre}</h3>
                                        {lin.activo === false && (
                                            <span className="shrink-0 text-[9px] font-black bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full uppercase">Inactiva</span>
                                        )}
                                    </div>
                                    {lin.descripcion && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{lin.descripcion}</p>}
                                </div>
                            </div>
                        ))}
                        {lineas.length === 0 && (
                            <div className="col-span-full py-16 text-center">
                                <AlignLeft className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                                <p className="text-slate-400 font-medium">No hay líneas registradas.</p>
                                <p className="text-slate-300 text-sm mt-1">Crea la primera línea con el botón de arriba.</p>
                            </div>
                        )}
                    </div>
                    {/* Modal Línea */}
                    {isLineaModalOpen && (
                        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                                    <h2 className="text-lg font-bold text-slate-900">{editingLinea?.id ? 'Editar Línea' : 'Nueva Línea'}</h2>
                                    <button onClick={() => { setIsLineaModalOpen(false); setEditingLinea(null) }} className="p-2 hover:bg-slate-100 rounded-full"><X className="w-5 h-5" /></button>
                                </div>
                                <div className="p-6 space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Nombre *</label>
                                        <input type="text" className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-teal-500"
                                            value={editingLinea?.nombre || ''}
                                            onChange={e => setEditingLinea(p => ({ ...p, nombre: e.target.value }))}
                                            autoFocus />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Descripción</label>
                                        <textarea className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-teal-500 resize-none h-20"
                                            value={editingLinea?.descripcion || ''}
                                            onChange={e => setEditingLinea(p => ({ ...p, descripcion: e.target.value }))} />
                                    </div>
                                    <div className="flex gap-3 pt-2">
                                        <button onClick={() => { setIsLineaModalOpen(false); setEditingLinea(null) }}
                                            className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50">Cancelar</button>
                                        <button onClick={handleSaveLinea} disabled={saving}
                                            className="flex-1 bg-teal-600 text-white rounded-xl px-4 py-2 font-bold hover:bg-teal-700 flex items-center justify-center gap-2 disabled:opacity-50">
                                            <Save className="w-4 h-4" />{saving ? 'Guardando...' : 'Guardar'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ) : activeTab === 'subcategorias' ? (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">SubCategorías de Producto</h2>
                            <p className="text-sm text-slate-500">Clasificación secundaria de productos (ej: Quesos Frescos, Refrescos, Detergentes)</p>
                        </div>
                        <button
                            onClick={() => { setEditingSubcategoria({ nombre: '', descripcion: '' }); setIsSubcategoriaModalOpen(true) }}
                            className="btn btn-primary py-2 px-4 text-sm flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" /> Nueva SubCategoría
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {subcategorias.map(sub => (
                            <div key={sub.id} className={cn(
                                "card p-6 group relative hover:shadow-lg transition-all border-l-4",
                                sub.activo === false ? "border-l-slate-300 opacity-60" : "border-l-orange-500"
                            )}>
                                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button title="Editar" onClick={() => { setEditingSubcategoria(sub); setIsSubcategoriaModalOpen(true) }}
                                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-orange-600">
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    {sub.activo !== false && (
                                        <button title="Dar de baja" onClick={() => handleBajaSubcategoria(sub.id, sub.nombre)}
                                            className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                                <div className="space-y-2 pt-1">
                                    <div className="flex items-start justify-between gap-2">
                                        <h3 className="font-bold text-slate-900 text-base uppercase tracking-tight leading-tight">{sub.nombre}</h3>
                                        {sub.activo === false && (
                                            <span className="shrink-0 text-[9px] font-black bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full uppercase">Inactiva</span>
                                        )}
                                    </div>
                                    {sub.descripcion && <p className="text-xs text-slate-400 mt-1 line-clamp-2">{sub.descripcion}</p>}
                                </div>
                            </div>
                        ))}
                        {subcategorias.length === 0 && (
                            <div className="col-span-full py-16 text-center">
                                <FolderTree className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                                <p className="text-slate-400 font-medium">No hay subcategorías registradas.</p>
                                <p className="text-slate-300 text-sm mt-1">Crea la primera subcategoría con el botón de arriba.</p>
                            </div>
                        )}
                    </div>
                    {/* Modal SubCategoría */}
                    {isSubcategoriaModalOpen && (
                        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                                    <h2 className="text-lg font-bold text-slate-900">{editingSubcategoria?.id ? 'Editar SubCategoría' : 'Nueva SubCategoría'}</h2>
                                    <button onClick={() => { setIsSubcategoriaModalOpen(false); setEditingSubcategoria(null) }} className="p-2 hover:bg-slate-100 rounded-full"><X className="w-5 h-5" /></button>
                                </div>
                                <div className="p-6 space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Nombre *</label>
                                        <input type="text" className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-orange-500"
                                            value={editingSubcategoria?.nombre || ''}
                                            onChange={e => setEditingSubcategoria(p => ({ ...p, nombre: e.target.value }))}
                                            autoFocus />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Descripción</label>
                                        <textarea className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-orange-500 resize-none h-20"
                                            value={editingSubcategoria?.descripcion || ''}
                                            onChange={e => setEditingSubcategoria(p => ({ ...p, descripcion: e.target.value }))} />
                                    </div>
                                    <div className="flex gap-3 pt-2">
                                        <button onClick={() => { setIsSubcategoriaModalOpen(false); setEditingSubcategoria(null) }}
                                            className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50">Cancelar</button>
                                        <button onClick={handleSaveSubcategoria} disabled={saving}
                                            className="flex-1 bg-orange-500 text-white rounded-xl px-4 py-2 font-bold hover:bg-orange-600 flex items-center justify-center gap-2 disabled:opacity-50">
                                            <Save className="w-4 h-4" />{saving ? 'Guardando...' : 'Guardar'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ) : activeTab === 'bodegas' ? (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Bodegas / Almacenes</h2>
                            <p className="text-sm text-slate-500">Gestiona los puntos de almacenamiento de inventario</p>
                        </div>
                        <button
                            onClick={() => {
                                setEditingBodega({ nombre: '', codigo: '', descripcion: '', direccion: '', es_principal: false, activo: true })
                                setIsBodegaModalOpen(true)
                            }}
                            className="btn btn-primary py-2 px-4 text-sm flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" /> Nueva Bodega
                        </button>
                    </div>

                    <div className="card overflow-hidden">
                        {bodegas.length === 0 ? (
                            <div className="py-16 text-center">
                                <Warehouse className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                                <p className="text-slate-400 font-medium">No hay bodegas registradas.</p>
                                <p className="text-slate-300 text-sm mt-1">Crea la primera bodega con el botón de arriba.</p>
                            </div>
                        ) : (
                            <table className="w-full text-sm">
                                <thead className="bg-slate-700 text-white">
                                    <tr>
                                        <th className="py-3 px-4 text-left text-xs font-bold uppercase tracking-wider">Nombre</th>
                                        <th className="py-3 px-4 text-left text-xs font-bold uppercase tracking-wider">Código</th>
                                        <th className="py-3 px-4 text-left text-xs font-bold uppercase tracking-wider">Dirección</th>
                                        <th className="py-3 px-4 text-center text-xs font-bold uppercase tracking-wider">Principal</th>
                                        <th className="py-3 px-4 text-center text-xs font-bold uppercase tracking-wider">Estado</th>
                                        <th className="py-3 px-4 text-center text-xs font-bold uppercase tracking-wider">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {bodegas.map((bod, idx) => (
                                        <tr key={bod.id} className={cn(
                                            'hover:bg-slate-50 transition-colors',
                                            !bod.activo && 'opacity-50',
                                            idx % 2 === 0 ? '' : 'bg-slate-50/40',
                                        )}>
                                            <td className="py-3 px-4 font-semibold text-slate-900">
                                                {bod.nombre}
                                                {bod.descripcion && (
                                                    <p className="text-xs text-slate-400 font-normal mt-0.5">{bod.descripcion}</p>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 font-mono text-slate-600">
                                                {bod.codigo || <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="py-3 px-4 text-slate-500 text-xs">
                                                {bod.direccion || <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                {bod.es_principal ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                                                        <Star className="w-3 h-3" /> Principal
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-300 text-xs">—</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                {bod.activo ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                                                        Activa
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-bold">
                                                        Inactiva
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <button
                                                        title="Editar"
                                                        onClick={() => { setEditingBodega({ ...bod }); setIsBodegaModalOpen(true) }}
                                                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-primary-600 transition-colors"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    {bod.activo && !bod.es_principal && (
                                                        <button
                                                            title="Dar de baja"
                                                            onClick={() => handleBajaBodega(bod.id, bod.nombre, bod.es_principal)}
                                                            className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                                                        >
                                                            <PowerOff className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    {bod.es_principal && (
                                                        <span title="La bodega principal no puede darse de baja" className="p-1.5 text-slate-200 cursor-not-allowed">
                                                            <PowerOff className="w-4 h-4" />
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                    <p className="text-xs text-slate-400">
                        Las bodegas dadas de baja no aparecen en los formularios de compras y ventas, pero se conservan en el historial de movimientos.
                    </p>
                </div>
            ) : activeTab === 'puntos_emision' ? (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                    <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                        <div>
                            <h2 className="text-lg font-bold text-slate-900">Puntos de Emisión SRI</h2>
                            <p className="text-sm text-slate-500">Establecimientos y puntos de emisión para la facturación electrónica</p>
                        </div>
                        <button
                            onClick={() => {
                                setEditingPuntoEmision({ establecimiento: '001', punto_emision: '001', nombre: '', direccion: '', descripcion: '', bodega_id: null, es_principal: puntosEmision.length === 0, activo: true })
                                setIsPuntoEmisionModalOpen(true)
                            }}
                            className="btn btn-primary py-2 px-4 text-sm flex items-center gap-2"
                        >
                            <Plus className="w-4 h-4" /> Nuevo Punto de Emisión
                        </button>
                    </div>

                    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-5 flex items-center justify-between gap-4 flex-wrap">
                        <div>
                            <p className="text-sm font-bold text-indigo-900 flex items-center gap-2">
                                <Printer className="w-4 h-4" /> Punto de emisión de este dispositivo
                            </p>
                            <p className="text-xs text-indigo-500 mt-0.5">
                                Define con qué serie SRI factura ESTA máquina (Factura Directa y Notas de Crédito). Solo afecta a este navegador.
                            </p>
                        </div>
                        <select
                            className="px-4 py-2.5 rounded-xl border border-indigo-200 bg-white text-sm font-bold text-indigo-900 outline-none focus:ring-2 focus:ring-indigo-400"
                            value={dispositivoPeId ?? ''}
                            onChange={e => {
                                const val = e.target.value || null
                                setDispositivoPeId(val)
                                setPuntoEmisionDispositivo(empresa!.id, val)
                            }}
                        >
                            <option value="">
                                Usar el Principal {(() => {
                                    const principal = puntosEmision.find(p => p.es_principal)
                                    return principal ? `(${principal.establecimiento}-${principal.punto_emision})` : ''
                                })()}
                            </option>
                            {puntosEmision.filter(pe => pe.activo && !pe.es_principal).map(pe => (
                                <option key={pe.id} value={pe.id}>
                                    {pe.establecimiento}-{pe.punto_emision} · {pe.nombre}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="card overflow-hidden">
                        {puntosEmision.length === 0 ? (
                            <div className="py-16 text-center">
                                <Printer className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                                <p className="text-slate-400 font-medium">No hay puntos de emisión registrados.</p>
                                <p className="text-slate-300 text-sm mt-1">Crea el primero con el botón de arriba.</p>
                            </div>
                        ) : (
                            <table className="w-full text-sm">
                                <thead className="bg-slate-700 text-white">
                                    <tr>
                                        <th className="py-3 px-4 text-left text-xs font-bold uppercase tracking-wider">Serie</th>
                                        <th className="py-3 px-4 text-left text-xs font-bold uppercase tracking-wider">Nombre</th>
                                        <th className="py-3 px-4 text-left text-xs font-bold uppercase tracking-wider">Dirección</th>
                                        <th className="py-3 px-4 text-left text-xs font-bold uppercase tracking-wider">Bodega</th>
                                        <th className="py-3 px-4 text-center text-xs font-bold uppercase tracking-wider">Sec. Factura</th>
                                        <th className="py-3 px-4 text-center text-xs font-bold uppercase tracking-wider">Sec. Nota Crédito</th>
                                        <th className="py-3 px-4 text-center text-xs font-bold uppercase tracking-wider">Principal</th>
                                        <th className="py-3 px-4 text-center text-xs font-bold uppercase tracking-wider">Estado</th>
                                        <th className="py-3 px-4 text-center text-xs font-bold uppercase tracking-wider">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {puntosEmision.map((pe, idx) => (
                                        <tr key={pe.id} className={cn(
                                            'hover:bg-slate-50 transition-colors',
                                            !pe.activo && 'opacity-50',
                                            idx % 2 === 0 ? '' : 'bg-slate-50/40',
                                        )}>
                                            <td className="py-3 px-4 font-mono font-semibold text-slate-900">
                                                {pe.establecimiento}-{pe.punto_emision}
                                            </td>
                                            <td className="py-3 px-4 font-semibold text-slate-900">
                                                {pe.nombre}
                                                {pe.descripcion && (
                                                    <p className="text-xs text-slate-400 font-normal mt-0.5">{pe.descripcion}</p>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-slate-500 text-xs">
                                                {pe.direccion || <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="py-3 px-4 text-slate-500 text-xs">
                                                {bodegas.find(b => b.id === pe.bodega_id)?.nombre || <span className="text-slate-300">—</span>}
                                            </td>
                                            <td className="py-3 px-4 text-center font-mono text-slate-600">
                                                {pe.secuenciales?.FACTURA ?? 0}
                                            </td>
                                            <td className="py-3 px-4 text-center font-mono text-slate-600">
                                                {pe.secuenciales?.NOTA_CREDITO ?? 0}
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                {pe.es_principal ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                                                        <Star className="w-3 h-3" /> Principal
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-300 text-xs">—</span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                {pe.activo ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">
                                                        Activo
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs font-bold">
                                                        Inactivo
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <button
                                                        title="Editar"
                                                        onClick={() => { setEditingPuntoEmision({ ...pe }); setIsPuntoEmisionModalOpen(true) }}
                                                        className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-primary-600 transition-colors"
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                    {pe.activo && !pe.es_principal && (
                                                        <button
                                                            title="Dar de baja"
                                                            onClick={() => handleBajaPuntoEmision(pe.id, pe.nombre, pe.es_principal)}
                                                            className="p-1.5 hover:bg-red-50 rounded-lg text-slate-400 hover:text-red-500 transition-colors"
                                                        >
                                                            <PowerOff className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    {pe.es_principal && (
                                                        <span title="El punto de emisión principal no puede darse de baja" className="p-1.5 text-slate-200 cursor-not-allowed">
                                                            <PowerOff className="w-4 h-4" />
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                    <p className="text-xs text-slate-400">
                        El punto de emisión "Principal" es el que usa hoy la facturación. Vincular un punto de emisión a una bodega permite
                        que, en el futuro, cada local físico facture con su propia serie SRI.
                    </p>
                </div>
            ) : activeTab === 'contabilidad' ? (
                <ContabilidadConfigTab />
            ) : activeTab === 'talento_nominas' ? (
                <TalentoNominasConfigTab />
            ) : (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                    {/* ── Mensaje del Sistema ────────────────────────── */}
                    <div className="bg-white rounded-xl border border-slate-200 p-5">
                        <h3 className="font-semibold text-slate-800 mb-1 flex items-center gap-2">
                            📢 Mensaje del Sistema
                        </h3>
                        <p className="text-xs text-slate-400 mb-3">
                            Este mensaje se mostrará a <strong>todos los usuarios</strong> al abrir la aplicación.
                            Si lo deja vacío, no aparece ningún aviso y la pantalla de inicio muestra solo la imagen.
                        </p>
                        <textarea
                            rows={4}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none resize-none"
                            placeholder="Ej: Estimados usuarios, el SRI estará en mantenimiento desde el 5 de julio 20:00 hasta el 6 de julio 06:00..."
                            value={mensajePlataforma}
                            onChange={e => setMensajePlataforma(e.target.value)}
                        />
                        <div className="flex justify-between items-center mt-2">
                            <p className="text-xs text-slate-400">{mensajePlataforma.length} caracteres</p>
                            <div className="flex gap-2">
                                <button onClick={() => setMensajePlataforma('')}
                                    className="px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 rounded-lg">
                                    Limpiar
                                </button>
                                <button onClick={guardarMensajePlataforma} disabled={savingMsg}
                                    className="flex items-center gap-2 px-4 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                                    {savingMsg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    Guardar mensaje
                                </button>
                            </div>
                        </div>
                    </div>

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
                                                                    onClick={async () => {
                                                                        setEditingEmpresa(emp)
                                                                        setIsEmpresaModalOpen(true)
                                                                        // LOPDP: no es columna de facturacion.empresas — se lee
                                                                        // aparte desde su propio schema y se fusiona al estado.
                                                                        try {
                                                                            const { data } = await supabase
                                                                                .schema('lopdp')
                                                                                .from('empresas_config')
                                                                                .select('lopdp_enabled')
                                                                                .eq('empresa_id', emp.id)
                                                                                .maybeSingle()
                                                                            setEditingEmpresa((prev: any) =>
                                                                                prev ? { ...prev, lopdp_enabled: !!data?.lopdp_enabled } : prev
                                                                            )
                                                                        } catch {
                                                                            // si falla, queda destildado por defecto
                                                                        }
                                                                        try {
                                                                            const { data: suData } = await supabase
                                                                                .from('sesion_unica_config')
                                                                                .select('enabled')
                                                                                .eq('empresa_id', emp.id)
                                                                                .maybeSingle()
                                                                            setEditingEmpresa((prev: any) =>
                                                                                prev ? { ...prev, sesion_unica_enabled: !!suData?.enabled } : prev
                                                                            )
                                                                        } catch {
                                                                            // si falla, queda destildado por defecto
                                                                        }
                                                                        try {
                                                                            const { data: iaData } = await supabase
                                                                                .from('ia_features_config')
                                                                                .select('compras_enabled, voz_enabled, cv_enabled')
                                                                                .eq('empresa_id', emp.id)
                                                                                .maybeSingle()
                                                                            setEditingEmpresa((prev: any) => prev ? {
                                                                                ...prev,
                                                                                ia_compras_enabled: !!iaData?.compras_enabled,
                                                                                ia_voz_enabled: !!iaData?.voz_enabled,
                                                                                ia_cv_enabled: !!iaData?.cv_enabled,
                                                                            } : prev)
                                                                        } catch {
                                                                            // si falla, quedan destildadas por defecto
                                                                        }
                                                                        try {
                                                                            const { data: fmData } = await supabase
                                                                                .from('facturacion_masiva_config')
                                                                                .select('enabled')
                                                                                .eq('empresa_id', emp.id)
                                                                                .maybeSingle()
                                                                            setEditingEmpresa((prev: any) =>
                                                                                prev ? { ...prev, facturacion_masiva_enabled: !!fmData?.enabled } : prev
                                                                            )
                                                                        } catch {
                                                                            // si falla, queda destildado por defecto
                                                                        }
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
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            setSSOForm({ email: '', nombre: '', rol: 'oficina', empresa_id: allEmpresas[0]?.id || '' })
                                            setIsSSOModalOpen(true)
                                        }}
                                        className="btn btn-secondary py-2 px-4 text-sm flex items-center gap-2"
                                    >
                                        <Shield className="w-4 h-4" /> Dar Acceso via Portal
                                    </button>
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

            {/* Modal: Dar Acceso via Portal */}
            {isSSOModalOpen && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 space-y-5">
                        <div className="flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">Dar Acceso via Portal</h2>
                                <p className="text-sm text-slate-500 mt-1">El usuario debe haber ingresado al Portal Billennium al menos una vez.</p>
                            </div>
                            <button onClick={() => setIsSSOModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Email (del Portal Billennium)</label>
                                <input
                                    type="email"
                                    value={ssoForm.email}
                                    onChange={e => setSSOForm({ ...ssoForm, email: e.target.value })}
                                    placeholder="usuario@empresa.com"
                                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre completo</label>
                                <input
                                    type="text"
                                    value={ssoForm.nombre}
                                    onChange={e => setSSOForm({ ...ssoForm, nombre: e.target.value })}
                                    placeholder="Nombre del usuario"
                                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Empresa</label>
                                <select
                                    value={ssoForm.empresa_id}
                                    onChange={e => setSSOForm({ ...ssoForm, empresa_id: e.target.value })}
                                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                >
                                    <option value="">Seleccione empresa</option>
                                    {allEmpresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">Rol</label>
                                <select
                                    value={ssoForm.rol}
                                    onChange={e => setSSOForm({ ...ssoForm, rol: e.target.value })}
                                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                >
                                    <option value="oficina">Oficina</option>
                                    <option value="mesero">Mesero</option>
                                    <option value="cocina">Cocina</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button onClick={() => setIsSSOModalOpen(false)} className="flex-1 btn btn-secondary py-2.5">Cancelar</button>
                            <button
                                onClick={handleDarAccesoPortal}
                                disabled={ssoLoading}
                                className="flex-1 btn btn-primary py-2.5 flex items-center justify-center gap-2"
                            >
                                {ssoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                                {ssoLoading ? 'Procesando...' : 'Dar Acceso'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modals */}
            {/* Modals */}
            {isEmpresaModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-start justify-center p-4 z-50 overflow-y-auto">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-6 flex flex-col">

                        {/* ── Cabecera fija ── */}
                        <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100 sticky top-0 bg-white rounded-t-3xl z-10">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 bg-primary-100 rounded-xl flex items-center justify-center">
                                    <Building2 className="w-5 h-5 text-primary-600" />
                                </div>
                                <h2 className="text-xl font-bold text-slate-900">
                                    {editingEmpresa?.id ? 'Editar Empresa' : 'Nueva Empresa'}
                                </h2>
                            </div>
                            <button onClick={() => setIsEmpresaModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* ── Contenido scrollable ── */}
                        <div className="px-8 py-6 space-y-6">

                            {/* Sección 1: Identificación */}
                            <div className="space-y-4">
                                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Datos de la empresa</p>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Nombre Comercial *</label>
                                    <input
                                        type="text"
                                        placeholder="Nombre con el que opera la empresa"
                                        autoFocus
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500 text-slate-900 font-medium"
                                        value={editingEmpresa?.nombre || ''}
                                        onChange={e => setEditingEmpresa({ ...editingEmpresa, nombre: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">RUC *</label>
                                    <input
                                        type="text"
                                        placeholder="Número de RUC (13 dígitos)"
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500 font-mono"
                                        value={editingEmpresa?.ruc || ''}
                                        onChange={e => setEditingEmpresa({ ...editingEmpresa, ruc: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Dirección</label>
                                        <input
                                            type="text"
                                            placeholder="Ciudad, calle, número..."
                                            className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500"
                                            value={editingEmpresa?.direccion || ''}
                                            onChange={e => setEditingEmpresa({ ...editingEmpresa, direccion: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Teléfono</label>
                                        <input
                                            type="text"
                                            placeholder="+593 99 999 9999"
                                            className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500"
                                            value={editingEmpresa?.telefono || ''}
                                            onChange={e => setEditingEmpresa({ ...editingEmpresa, telefono: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Logo (imagen)</label>
                                    <input
                                        type="file" accept="image/*"
                                        className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
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

                            {/* Sección 2: Configuración SRI */}
                            <div className="border-t border-slate-100 pt-6 space-y-4">
                                <p className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <Shield className="w-3.5 h-3.5 text-primary-500" />
                                    Configuración SRI / Facturación Electrónica
                                </p>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Establecimiento</label>
                                        <input
                                            type="text" maxLength={3} placeholder="001"
                                            className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500 font-mono text-center"
                                            value={editingEmpresa?.config_sri?.establecimiento || ''}
                                            onChange={e => setEditingEmpresa({ ...editingEmpresa, config_sri: { ...(editingEmpresa?.config_sri || {}), establecimiento: e.target.value } })}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Punto Emisión</label>
                                        <input
                                            type="text" maxLength={3} placeholder="001"
                                            className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500 font-mono text-center"
                                            value={editingEmpresa?.config_sri?.punto_emision || ''}
                                            onChange={e => setEditingEmpresa({ ...editingEmpresa, config_sri: { ...(editingEmpresa?.config_sri || {}), punto_emision: e.target.value } })}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Ambiente</label>
                                        <select
                                            className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500 bg-white font-semibold text-sm"
                                            value={editingEmpresa?.config_sri?.ambiente || 'PRUEBAS'}
                                            onChange={e => setEditingEmpresa({ ...editingEmpresa, config_sri: { ...(editingEmpresa?.config_sri || {}), ambiente: e.target.value } })}
                                        >
                                            <option value="PRUEBAS">PRUEBAS</option>
                                            <option value="PRODUCCION">PRODUCCIÓN</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Secuencial inicial facturas</label>
                                        <input
                                            type="number" min={1} placeholder="1"
                                            className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500 font-mono"
                                            value={editingEmpresa?.config_sri?.secuencial_inicio || 1}
                                            onChange={e => setEditingEmpresa({ ...editingEmpresa, config_sri: { ...(editingEmpresa?.config_sri || {}), secuencial_inicio: parseInt(e.target.value) || 1 } })}
                                        />
                                        <p className="text-[11px] text-slate-400">Número inicial si no hay facturas previas</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                                            Firma Electrónica (.p12)
                                            {editingEmpresa?.config_sri?.firma_path && (
                                                <span className="ml-2 text-emerald-600 normal-case font-normal text-[11px]">
                                                    ✅ {editingEmpresa.config_sri.firma_path}
                                                </span>
                                            )}
                                        </label>
                                        <input
                                            type="file" accept=".p12"
                                            className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 cursor-pointer"
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0]
                                                if (!file) return
                                                try {
                                                    const path = await sriService.uploadFirma(editingEmpresa?.id || 'new', file)
                                                    setEditingEmpresa({ ...editingEmpresa, config_sri: { ...(editingEmpresa?.config_sri || {}), firma_path: path, firma_url: path } })
                                                    alert(`✅ Firma "${file.name}" subida correctamente`)
                                                } catch (err: any) {
                                                    alert('Error al subir firma: ' + err.message)
                                                }
                                            }}
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Contraseña de la firma</label>
                                        <input
                                            type="password" placeholder="••••••••"
                                            className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-primary-500"
                                            value={editingEmpresa?.config_sri?.firma_password || ''}
                                            onChange={e => setEditingEmpresa({ ...editingEmpresa, config_sri: { ...(editingEmpresa?.config_sri || {}), firma_password: e.target.value } })}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Sección 3: Módulos */}
                            <div className="border-t border-slate-100 pt-6 space-y-3">
                                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Módulos integrados</p>
                                <label className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors">
                                    <div>
                                        <p className="text-sm font-bold text-slate-800">Gestión de Compras (VendorManagement)</p>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            Oculta Proveedores e Ingreso de Compras del menú — se gestiona desde la app de Compras.
                                        </p>
                                    </div>
                                    <input
                                        type="checkbox"
                                        className="w-5 h-5 ml-4 shrink-0 rounded border-slate-300 text-primary-600"
                                        checked={!!editingEmpresa?.usar_vendor_management}
                                        onChange={e => setEditingEmpresa({ ...editingEmpresa, usar_vendor_management: e.target.checked })}
                                    />
                                </label>
                                <label className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors">
                                    <div>
                                        <p className="text-sm font-bold text-slate-800">Módulo LOPDP (Protección de Datos Personales)</p>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            Habilita el RAT, Solicitudes ARCO-POL, Política de Privacidad y el resto del módulo LOPDP para esta empresa.
                                        </p>
                                    </div>
                                    <input
                                        type="checkbox"
                                        className="w-5 h-5 ml-4 shrink-0 rounded border-slate-300 text-primary-600"
                                        checked={!!editingEmpresa?.lopdp_enabled}
                                        onChange={e => setEditingEmpresa({ ...editingEmpresa, lopdp_enabled: e.target.checked })}
                                    />
                                </label>
                                <label className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors">
                                    <div>
                                        <p className="text-sm font-bold text-slate-800">Sesión única por usuario</p>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            Al iniciar sesión desde otro dispositivo, cierra automáticamente cualquier
                                            sesión anterior de ese mismo usuario en todo QuickInvoice.
                                        </p>
                                    </div>
                                    <input
                                        type="checkbox"
                                        className="w-5 h-5 ml-4 shrink-0 rounded border-slate-300 text-primary-600"
                                        checked={!!editingEmpresa?.sesion_unica_enabled}
                                        onChange={e => setEditingEmpresa({ ...editingEmpresa, sesion_unica_enabled: e.target.checked })}
                                    />
                                </label>
                                <label className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors">
                                    <div>
                                        <p className="text-sm font-bold text-slate-800">IA — OCR de facturas de compra (Gemini)</p>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            Permite leer automáticamente facturas de proveedor (PDF/imagen) en Compra Inventario y Compra Servicio.
                                        </p>
                                    </div>
                                    <input
                                        type="checkbox"
                                        className="w-5 h-5 ml-4 shrink-0 rounded border-slate-300 text-primary-600"
                                        checked={!!editingEmpresa?.ia_compras_enabled}
                                        onChange={e => setEditingEmpresa({ ...editingEmpresa, ia_compras_enabled: e.target.checked })}
                                    />
                                </label>
                                <label className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors">
                                    <div>
                                        <p className="text-sm font-bold text-slate-800">IA — Asistente de voz (Gemini)</p>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            Habilita el asistente de voz para crear facturas por comando de voz en Nueva Factura.
                                        </p>
                                    </div>
                                    <input
                                        type="checkbox"
                                        className="w-5 h-5 ml-4 shrink-0 rounded border-slate-300 text-primary-600"
                                        checked={!!editingEmpresa?.ia_voz_enabled}
                                        onChange={e => setEditingEmpresa({ ...editingEmpresa, ia_voz_enabled: e.target.checked })}
                                    />
                                </label>
                                <label className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors">
                                    <div>
                                        <p className="text-sm font-bold text-slate-800">IA — Screening de CV (Gemini)</p>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            Habilita la evaluación automática de hojas de vida en Talento Humano → Vacantes.
                                        </p>
                                    </div>
                                    <input
                                        type="checkbox"
                                        className="w-5 h-5 ml-4 shrink-0 rounded border-slate-300 text-primary-600"
                                        checked={!!editingEmpresa?.ia_cv_enabled}
                                        onChange={e => setEditingEmpresa({ ...editingEmpresa, ia_cv_enabled: e.target.checked })}
                                    />
                                </label>
                                <label className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors">
                                    <div>
                                        <p className="text-sm font-bold text-slate-800">Facturación Masiva de Clientes</p>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            Habilita el proceso mensual de facturación electrónica en lote a todos los clientes activos.
                                        </p>
                                    </div>
                                    <input
                                        type="checkbox"
                                        className="w-5 h-5 ml-4 shrink-0 rounded border-slate-300 text-primary-600"
                                        checked={!!editingEmpresa?.facturacion_masiva_enabled}
                                        onChange={e => setEditingEmpresa({ ...editingEmpresa, facturacion_masiva_enabled: e.target.checked })}
                                    />
                                </label>
                            </div>
                        </div>

                        {/* ── Pie fijo ── */}
                        <div className="flex gap-3 px-8 py-5 border-t border-slate-100 bg-slate-50 rounded-b-3xl sticky bottom-0">
                            <button
                                onClick={() => setIsEmpresaModalOpen(false)}
                                className="flex-1 py-3 font-bold border border-slate-200 bg-white rounded-xl hover:bg-slate-50 transition-colors text-slate-600"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveEmpresaFull}
                                disabled={saving}
                                className="flex-1 py-3 font-bold bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                            >
                                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Save className="w-5 h-5" /> Guardar Empresa</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}


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
            {/* ── Modal Bodega ──────────────────────────────────────── */}
            {isBodegaModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8 space-y-5 animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                                    <Warehouse className="w-5 h-5" />
                                </div>
                                <h2 className="text-xl font-bold text-slate-900">
                                    {editingBodega?.id ? 'Editar Bodega' : 'Nueva Bodega'}
                                </h2>
                            </div>
                            <button
                                onClick={() => { setIsBodegaModalOpen(false); setEditingBodega(null) }}
                                className="p-2 hover:bg-slate-100 rounded-full text-slate-400"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Campos */}
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2 space-y-1">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                        Nombre de la Bodega *
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Ej: Bodega Principal, Almacén Externo..."
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-amber-400 font-bold text-slate-900"
                                        value={editingBodega?.nombre || ''}
                                        onChange={e => setEditingBodega({ ...editingBodega, nombre: e.target.value })}
                                        autoFocus
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                        Código <span className="normal-case font-normal text-slate-300">(opcional)</span>
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Ej: BOD1, ALM-EXT..."
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-amber-400 font-mono text-slate-900"
                                        value={editingBodega?.codigo || ''}
                                        onChange={e => setEditingBodega({ ...editingBodega, codigo: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                        Dirección <span className="normal-case font-normal text-slate-300">(opcional)</span>
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Dirección física..."
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-amber-400 text-slate-900"
                                        value={editingBodega?.direccion || ''}
                                        onChange={e => setEditingBodega({ ...editingBodega, direccion: e.target.value })}
                                    />
                                </div>
                                <div className="col-span-2 space-y-1">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                        Descripción <span className="normal-case font-normal text-slate-300">(opcional)</span>
                                    </label>
                                    <textarea
                                        rows={2}
                                        placeholder="Descripción de esta bodega..."
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-amber-400 text-sm resize-none"
                                        value={editingBodega?.descripcion || ''}
                                        onChange={e => setEditingBodega({ ...editingBodega, descripcion: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* Bodega principal */}
                            <div className={cn(
                                'flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors',
                                editingBodega?.es_principal
                                    ? 'bg-amber-50 border-amber-200'
                                    : 'bg-slate-50 border-slate-200 hover:border-amber-200'
                            )}
                                onClick={() => setEditingBodega({ ...editingBodega, es_principal: !editingBodega?.es_principal })}
                            >
                                <button
                                    type="button"
                                    className={cn(
                                        'relative inline-flex h-6 w-10 items-center rounded-full transition-colors shrink-0',
                                        editingBodega?.es_principal ? 'bg-amber-500' : 'bg-slate-300'
                                    )}
                                >
                                    <span className={cn(
                                        'inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform',
                                        editingBodega?.es_principal ? 'translate-x-5' : 'translate-x-1'
                                    )} />
                                </button>
                                <div>
                                    <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                                        <Star className="w-3.5 h-3.5 text-amber-500" />
                                        Bodega principal
                                    </p>
                                    <p className="text-xs text-slate-400">Se pre-selecciona automáticamente en compras, ventas y órdenes de compra</p>
                                </div>
                            </div>

                            {/* Estado — solo al editar */}
                            {editingBodega?.id && (
                                <div className={cn(
                                    'flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold border',
                                    editingBodega.activo === false
                                        ? 'bg-red-50 text-red-600 border-red-100'
                                        : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                )}>
                                    <span className={cn('w-2 h-2 rounded-full', editingBodega.activo === false ? 'bg-red-400' : 'bg-emerald-400')} />
                                    Estado: {editingBodega.activo === false ? 'Inactiva (dada de baja)' : 'Activa'}
                                </div>
                            )}
                        </div>

                        {/* Botones */}
                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={() => { setIsBodegaModalOpen(false); setEditingBodega(null) }}
                                className="flex-1 py-3 font-bold border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-slate-600"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveBodega}
                                disabled={saving || !editingBodega?.nombre?.trim()}
                                className="flex-1 py-3 font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal Punto de Emisión ───────────────────────────── */}
            {isPuntoEmisionModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="flex items-center justify-between p-8 pb-4 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                                    <Printer className="w-5 h-5" />
                                </div>
                                <h2 className="text-xl font-bold text-slate-900">
                                    {editingPuntoEmision?.id ? 'Editar Punto de Emisión' : 'Nuevo Punto de Emisión'}
                                </h2>
                            </div>
                            <button
                                onClick={() => { setIsPuntoEmisionModalOpen(false); setEditingPuntoEmision(null) }}
                                className="p-2 hover:bg-slate-100 rounded-full text-slate-400"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Campos */}
                        <div className="space-y-4 overflow-y-auto flex-1 px-8 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                        Establecimiento *
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="001"
                                        maxLength={3}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-400 font-mono font-bold text-slate-900"
                                        value={editingPuntoEmision?.establecimiento || ''}
                                        onChange={e => setEditingPuntoEmision({ ...editingPuntoEmision, establecimiento: e.target.value.replace(/\D/g, '') })}
                                        autoFocus
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                        Punto de Emisión *
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="001"
                                        maxLength={3}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-400 font-mono font-bold text-slate-900"
                                        value={editingPuntoEmision?.punto_emision || ''}
                                        onChange={e => setEditingPuntoEmision({ ...editingPuntoEmision, punto_emision: e.target.value.replace(/\D/g, '') })}
                                    />
                                </div>
                                <div className="col-span-2 space-y-1">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                        Nombre *
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Ej: Principal, Sucursal Norte..."
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-400 font-bold text-slate-900"
                                        value={editingPuntoEmision?.nombre || ''}
                                        onChange={e => setEditingPuntoEmision({ ...editingPuntoEmision, nombre: e.target.value })}
                                    />
                                </div>
                                <div className="col-span-2 space-y-1">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                        Dirección <span className="normal-case font-normal text-slate-300">(opcional)</span>
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Dirección física del punto de emisión..."
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-400 text-slate-900"
                                        value={editingPuntoEmision?.direccion || ''}
                                        onChange={e => setEditingPuntoEmision({ ...editingPuntoEmision, direccion: e.target.value })}
                                    />
                                </div>
                                <div className="col-span-2 space-y-1">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                        Descripción <span className="normal-case font-normal text-slate-300">(opcional)</span>
                                    </label>
                                    <textarea
                                        rows={2}
                                        placeholder="Notas sobre este punto de emisión..."
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-400 text-sm resize-none"
                                        value={editingPuntoEmision?.descripcion || ''}
                                        onChange={e => setEditingPuntoEmision({ ...editingPuntoEmision, descripcion: e.target.value })}
                                    />
                                </div>
                                <div className="col-span-2 space-y-1">
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                        Bodega vinculada <span className="normal-case font-normal text-slate-300">(opcional)</span>
                                    </label>
                                    <select
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-400 text-slate-900"
                                        value={editingPuntoEmision?.bodega_id || ''}
                                        onChange={e => setEditingPuntoEmision({ ...editingPuntoEmision, bodega_id: e.target.value || null })}
                                    >
                                        <option value="">Ninguna</option>
                                        {bodegas.map(b => (
                                            <option key={b.id} value={b.id}>{b.nombre}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Punto de emisión principal */}
                            <div className={cn(
                                'flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors',
                                editingPuntoEmision?.es_principal
                                    ? 'bg-amber-50 border-amber-200'
                                    : 'bg-slate-50 border-slate-200 hover:border-amber-200'
                            )}
                                onClick={() => setEditingPuntoEmision({ ...editingPuntoEmision, es_principal: !editingPuntoEmision?.es_principal })}
                            >
                                <button
                                    type="button"
                                    className={cn(
                                        'relative inline-flex h-6 w-10 items-center rounded-full transition-colors shrink-0',
                                        editingPuntoEmision?.es_principal ? 'bg-amber-500' : 'bg-slate-300'
                                    )}
                                >
                                    <span className={cn(
                                        'inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform',
                                        editingPuntoEmision?.es_principal ? 'translate-x-5' : 'translate-x-1'
                                    )} />
                                </button>
                                <div>
                                    <p className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                                        <Star className="w-3.5 h-3.5 text-amber-500" />
                                        Punto de emisión principal
                                    </p>
                                    <p className="text-xs text-slate-400">Es el que usa hoy la facturación electrónica de esta empresa</p>
                                </div>
                            </div>

                            {/* Secuencial + Estado — solo al editar */}
                            {editingPuntoEmision?.id && (
                                <div className="space-y-2">
                                    <div>
                                        <label className="label">Secuencial actual (Factura)</label>
                                        <div className="flex items-center gap-3">
                                            <div className="flex-1 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-mono text-lg font-bold text-slate-700">
                                                {editingPuntoEmision.secuenciales?.FACTURA ?? 0}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    const actual = editingPuntoEmision.secuenciales?.FACTURA ?? 0
                                                    const nuevo = window.prompt(
                                                        `Secuencial actual: ${actual}\n\nIngresa el ÚLTIMO número emitido (la próxima factura será ese número + 1).\n⚠️ Solo cambiar si hay un error real de numeración.`,
                                                        String(actual)
                                                    )
                                                    if (nuevo === null) return
                                                    const n = parseInt(nuevo, 10)
                                                    if (isNaN(n) || n < 0) { alert('Número inválido'); return }
                                                    if (!window.confirm(`¿Confirmas cambiar el secuencial a ${n}?\nLa próxima factura será la #${n + 1}.`)) return
                                                    const { error } = await supabase
                                                        .from('puntos_emision')
                                                        .update({ secuenciales: { ...editingPuntoEmision.secuenciales, FACTURA: n }, updated_at: new Date().toISOString() })
                                                        .eq('id', editingPuntoEmision.id!)
                                                    if (error) { alert('Error: ' + error.message); return }
                                                    setEditingPuntoEmision((prev: any) => ({ ...prev, secuenciales: { ...(prev?.secuenciales || {}), FACTURA: n } }))
                                                    alert(`✓ Secuencial actualizado a ${n}. Próxima factura: #${n + 1}`)
                                                }}
                                                className="px-4 py-3 text-sm font-semibold border border-amber-300 bg-amber-50 text-amber-700 rounded-xl hover:bg-amber-100 transition-colors whitespace-nowrap"
                                            >
                                                Cambiar secuencial
                                            </button>
                                        </div>
                                        <p className="text-xs text-slate-400 mt-1">Próxima factura = este número + 1. <span className="text-amber-600 font-medium">Solo cambiar si hay error de numeración.</span></p>
                                    </div>

                                    {/* Nota de Crédito */}
                                    <div>
                                        <label className="label">Secuencial actual (Nota de Crédito)</label>
                                        <div className="flex items-center gap-3">
                                            <div className="flex-1 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-mono text-lg font-bold text-slate-700">
                                                {editingPuntoEmision.secuenciales?.NOTA_CREDITO ?? 0}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    const actual = editingPuntoEmision.secuenciales?.NOTA_CREDITO ?? 0
                                                    const nuevo = window.prompt(
                                                        `Secuencial NC actual: ${actual}\n\nIngresa el ÚLTIMO número de NC emitida (la próxima NC será ese número + 1).`,
                                                        String(actual)
                                                    )
                                                    if (nuevo === null) return
                                                    const n = parseInt(nuevo, 10)
                                                    if (isNaN(n) || n < 0) { alert('Número inválido'); return }
                                                    if (!window.confirm(`¿Confirmas cambiar el secuencial NC a ${n}?\nLa próxima Nota de Crédito será la #${n + 1}.`)) return
                                                    const { error } = await supabase
                                                        .from('puntos_emision')
                                                        .update({ secuenciales: { ...editingPuntoEmision.secuenciales, NOTA_CREDITO: n }, updated_at: new Date().toISOString() })
                                                        .eq('id', editingPuntoEmision.id!)
                                                    if (error) { alert('Error: ' + error.message); return }
                                                    setEditingPuntoEmision((prev: any) => ({ ...prev, secuenciales: { ...(prev?.secuenciales || {}), NOTA_CREDITO: n } }))
                                                    alert(`✓ Secuencial NC actualizado a ${n}. Próxima NC: #${n + 1}`)
                                                }}
                                                className="px-4 py-3 text-sm font-semibold border border-amber-300 bg-amber-50 text-amber-700 rounded-xl hover:bg-amber-100 transition-colors whitespace-nowrap"
                                            >
                                                Cambiar secuencial NC
                                            </button>
                                        </div>
                                        <p className="text-xs text-slate-400 mt-1">Próxima NC = este número + 1.</p>
                                    </div>

                                    <div className={cn(
                                        'flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-bold border',
                                        editingPuntoEmision.activo === false
                                            ? 'bg-red-50 text-red-600 border-red-100'
                                            : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                    )}>
                                        <span className={cn('w-2 h-2 rounded-full', editingPuntoEmision.activo === false ? 'bg-red-400' : 'bg-emerald-400')} />
                                        Estado: {editingPuntoEmision.activo === false ? 'Inactivo (dado de baja)' : 'Activo'}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Botones */}
                        <div className="flex gap-3 p-8 pt-4 border-t border-slate-100">
                            <button
                                onClick={() => { setIsPuntoEmisionModalOpen(false); setEditingPuntoEmision(null) }}
                                className="flex-1 py-3 font-bold border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-slate-600"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSavePuntoEmision}
                                disabled={saving || !editingPuntoEmision?.nombre?.trim()}
                                className="flex-1 py-3 font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal Categoría ──────────────────────────────────── */}
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

            {isImpresionModalOpen && empresa?.id && (
                <ConfigImpresionTicketModal
                    empresaId={empresa.id}
                    empresaNombre={empresa.nombre}
                    onClose={() => setIsImpresionModalOpen(false)}
                />
            )}
        </div >
    )
}
