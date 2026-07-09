import React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
    LayoutDashboard,
    Package,
    Users,
    FileText,
    Settings,
    LogOut,
    ChevronRight,
    ChevronDown,
    Menu,
    X,
    Truck,
    BarChart3,
    FilePlus,
    ShoppingCart,
    BookOpen,
    UserCheck,
    Wallet,
    Search,
    FileMinus,
    Ban,
    Moon,
    Sun,
    CheckSquare,
    ArrowDownUp,
    UserCog,
    CreditCard,
    FileSearch,
    SlidersHorizontal,
    ArrowLeftRight,
    ClipboardList,
    CalendarDays,
    ListChecks,
    Star,
    GraduationCap,
    Smile,
    Scale,
    Upload,
    User,
    TrendingUp,
    Trash2,
    Receipt,
    Palette,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import type { Modules } from '../contexts/AuthContext'
import { cn } from '../lib/utils'

interface SidebarItemProps {
    to: string
    icon: React.ElementType
    label: string
    active?: boolean
    sub?: boolean
    disabled?: boolean
}

const SidebarItem = ({ to, icon: Icon, label, active, sub, disabled }: SidebarItemProps) => {
    if (disabled) return null  // ocultar completamente cuando no tiene permiso
    return (
        <Link
            to={to}
            className={cn(
                "flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 group",
                sub ? "pl-8 py-2" : "",
                active
                    ? "bg-primary-50 text-primary-700 font-medium"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
        >
            <Icon className={cn("w-5 h-5 shrink-0", sub ? "w-4 h-4" : "", active ? "text-primary-600" : "text-slate-400 group-hover:text-slate-600")} />
            <span className={sub ? "text-sm" : ""}>{label}</span>
            {active && !sub && <ChevronRight className="w-4 h-4 ml-auto" />}
        </Link>
    )
}

import { CierreCajaModal } from './CierreCajaModal'

// Sección expandible de módulo principal
function ModuleSection({ label, icon: Icon, colorClass, isOpen, onToggle, isSidebarOpen, anyActive, children }: {
    label: string
    icon: React.ElementType
    colorClass: string
    isOpen: boolean
    onToggle: () => void
    isSidebarOpen: boolean
    anyActive: boolean
    children: React.ReactNode
}) {
    return (
        <div>
            <button
                onClick={onToggle}
                className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group',
                    anyActive ? 'bg-slate-100 font-semibold text-slate-900' : 'text-slate-700 hover:bg-slate-100'
                )}
            >
                <Icon className={cn('w-5 h-5 shrink-0', colorClass)} />
                {isSidebarOpen && <span className="flex-1 text-left text-sm">{label}</span>}
                {isSidebarOpen && <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform', isOpen && 'rotate-180')} />}
            </button>
            {isOpen && isSidebarOpen && (
                <div className="mt-0.5 ml-2 border-l-2 border-slate-100 pl-1 space-y-0.5">
                    {children}
                </div>
            )}
        </div>
    )
}

// Mapa: prefijo de ruta → campo de permiso
const PERM_RUTAS: [string, string][] = [
    ['/dashboard',                     'perm_dashboard'],
    ['/gerencia',                      'perm_gerencia'],
    ['/clientes/gestion-cartera',      'perm_gestion_cartera'],
    ['/anulacion-facturas',            'perm_anulacion_facturas'],
    ['/notas-credito',                 'perm_notas_credito'],
    ['/cierres',                       'perm_cierres_caja'],
    ['/consultas/ventas',              'perm_consulta_ventas'],
    ['/consultas/ventas-cliente',      'perm_consulta_ventas'],
    ['/clientes',                      'perm_clientes'],
    ['/cartera-cxc',                   'perm_cartera_cxc'],
    ['/consultas/cartera-clientes',    'perm_consulta_cartera'],
    ['/cartera/estado-cuenta',         'perm_estado_cuenta'],
    ['/proveedores',                   'perm_proveedores'],
    ['/compras',                       'perm_compras'],
    ['/cxp',                           'perm_cxp'],
    ['/reportes/compras',              'perm_reportes_cxp'],
    ['/reportes/cxp',                  'perm_reportes_cxp'],
    ['/reportes/estado-cuenta',        'perm_reportes_cxp'],
    ['/teso/cuentas-bancarias',        'perm_bancos'],
    ['/teso/egresos',                  'perm_egresos'],
    ['/teso/anticipos',                'perm_egresos'],
    ['/teso/cheques',                  'perm_cheques'],
    ['/teso/movimientos',              'perm_movimientos_banc'],
    ['/teso/conciliacion',             'perm_conciliacion'],
    ['/teso/cierre-general',           'perm_cierres_caja'],
    ['/conta/plan-cuentas',            'perm_plan_cuentas'],
    ['/conta/diarios',                 'perm_asientos'],
    ['/conta/reportes',                'perm_reportes_cont'],
    ['/conta/presupuesto',             'perm_reportes_cont'],
    ['/conta/cierre',                  'perm_asientos'],
    ['/conta/integracion',             'perm_asientos'],
    ['/conta/tributario',              'perm_tributario'],
    ['/talento/vacantes',              'perm_th_empleados'],
    ['/talento/empleados',             'perm_th_empleados'],
    ['/talento/plantillas-checklist',  'perm_th_empleados'],
    ['/talento/checklists',            'perm_th_empleados'],
    ['/talento/desempeno',             'perm_th_empleados'],
    ['/talento/capacitacion',          'perm_th_empleados'],
    ['/talento/clima',                 'perm_th_empleados'],
    ['/talento/dashboard',             'perm_th_empleados'],
    ['/talento/finiquito',             'perm_th_empleados'],
    ['/talento/',                      'perm_th_estructura'],
    ['/nominas/periodos',              'perm_th_rol_nomina'],
    ['/nominas/rol/',                  'perm_th_rol_nomina'],
    ['/nominas/reportes/',             'perm_th_rol_nomina'],
    ['/nominas/anticipo/',             'perm_th_rol_nomina'],
    ['/nominas/anticipo-reporte/',     'perm_th_rol_nomina'],
    ['/nominas/novedades',             'perm_th_rol_nomina'],
    ['/nominas/capacidad-pago',        'perm_th_rol_nomina'],
    ['/nominas/decimos',               'perm_th_rol_nomina'],
    ['/nominas/vacaciones',            'perm_th_rol_nomina'],
    ['/nominas/cuentas-nomina',        'perm_th_nomina_parametros'],
    ['/nominas/conceptos',             'perm_th_conceptos_nomina'],
    ['/nominas/',                      'perm_th_nomina_parametros'],
]

export function Layout({ children }: { children: React.ReactNode }) {
    const { profile, empresa, empresasDisponibles, modules, permisos, isAdmin, loading: authLoading, signOut, selectEmpresa } = useAuth() as any
    const [showEmpresaDropdown, setShowEmpresaDropdown] = React.useState(false)
    const p = permisos ?? {}
    const navigate = useNavigate()
    // const usaVendor = !!empresa?.usar_vendor_management
    const location = useLocation()
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(true)
    const [isCierreCajaOpen, setIsCierreCajaOpen] = React.useState(false)
    const [darkSidebar, setDarkSidebar] = React.useState(() => localStorage.getItem('qi-dark-sidebar') === 'true')
    const toggleDarkSidebar = () => {
        const next = !darkSidebar
        setDarkSidebar(next)
        localStorage.setItem('qi-dark-sidebar', String(next))
    }
    const [openGroups, setOpenGroups] = React.useState<string[]>([])

    const toggleGroup = (label: string) => {
        setOpenGroups(prev => prev.includes(label) ? prev.filter(g => g !== label) : [...prev, label])
    }

    // Cerrar dropdown de empresa al hacer click fuera
    React.useEffect(() => {
        if (!showEmpresaDropdown) return
        const close = () => setShowEmpresaDropdown(false)
        document.addEventListener('click', close)
        return () => document.removeEventListener('click', close)
    }, [showEmpresaDropdown])

    // Guardia de ruta: si el usuario no tiene permiso, redirige a Nueva Factura
    // (no a /dashboard porque ese también puede estar restringido)
    React.useEffect(() => {
        if (authLoading) return
        const ruta = PERM_RUTAS.find(([path]) => location.pathname.startsWith(path))
        if (ruta && !(p as any)[ruta[1]]) {
            navigate('/nueva-factura', { replace: true })
        }
    }, [location.pathname, permisos, authLoading])

    const mods: Modules = modules ?? { vendor: false, finance: false, ledgerpro: false, talento_humano: false }
    const ROLES_ESPECIALES = ['mesero', 'cocina', 'admin_plataforma']
    const esOficina = profile?.rol && !ROLES_ESPECIALES.includes(profile.rol)

    return (
        <div className="min-h-screen bg-slate-50 flex">
            {/* Sidebar */}
            <aside className={cn(
                "border-r transition-all duration-300 z-30 fixed inset-y-0 left-0",
                darkSidebar ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200",
                isSidebarOpen ? "w-64" : "w-20 lg:w-0 lg:overflow-hidden -translate-x-full lg:translate-x-0"
            )}>
                <div className="flex flex-col h-full">
                    <div className="p-6 flex items-center gap-3 border-b border-slate-100">
                        <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center text-white font-bold">
                            Q
                        </div>
                        {isSidebarOpen && (
                            <span className="text-xl font-bold bg-gradient-to-r from-primary-600 to-primary-800 bg-clip-text text-transparent">
                                QuickInvoice
                            </span>
                        )}
                    </div>

                    <nav className="flex-1 p-3 space-y-1 overflow-y-auto">

                        {/* ── Admin plataforma ─────────────────────────── */}
                        {profile?.rol === 'admin_plataforma' && (
                            <>
                                <SidebarItem to="/" icon={LayoutDashboard} label="Dashboard" active={location.pathname === '/'} />
                                <SidebarItem to="/configuracion" icon={Settings} label="Plataforma" active={location.pathname === '/configuracion'} />
                                <SidebarItem to="/admin/user-empresas" icon={ArrowLeftRight} label="Asignar empresas"  active={location.pathname === '/admin/user-empresas'} />
                                <SidebarItem to="/admin/depuracion"   icon={Trash2}         label="Depuración de Datos" active={location.pathname === '/admin/depuracion'} />
                            </>
                        )}

                        {/* ── MÓDULO 0: Gerencia ───────────────────────── */}
                        {esOficina && (p.perm_gerencia || p.perm_dashboard) && <ModuleSection
                            label="Gerencia"
                            icon={TrendingUp}
                            colorClass="text-violet-600"
                            isOpen={openGroups.includes('gerencia')}
                            onToggle={() => toggleGroup('gerencia')}
                            isSidebarOpen={isSidebarOpen}
                            anyActive={location.pathname === '/dashboard' || location.pathname.startsWith('/gerencia')}
                        >
                            <SidebarItem to="/dashboard"                    icon={LayoutDashboard} label="Dashboard"            active={location.pathname === '/dashboard'} sub disabled={!p.perm_dashboard} />
                            <SidebarItem to="/gerencia/resumen-operacional" icon={BarChart3}        label="Resumen Operacional" active={location.pathname === '/gerencia/resumen-operacional'} sub disabled={!p.perm_gerencia} />
                        </ModuleSection>}

                        {/* ── MÓDULO 1: Facturación ────────────────────── */}
                        {esOficina && <ModuleSection
                            label="Facturación"
                            icon={FileText}
                            colorClass="text-primary-600"
                            isOpen={openGroups.includes('facturacion')}
                            onToggle={() => toggleGroup('facturacion')}
                            isSidebarOpen={isSidebarOpen}
                            anyActive={['/nueva-factura','/proformas','/facturacion','/vendedores','/notas-credito','/anulacion-facturas','/guias-remision','/cierres','/consultas/ventas'].some(p => location.pathname.startsWith(p))}
                        >
                            <SidebarItem to="/nueva-factura"      icon={FilePlus}        label="Nueva Factura"      active={location.pathname === '/nueva-factura'} sub disabled={!p.perm_nueva_factura} />
                            <SidebarItem to="/proformas"          icon={FileText}        label="Proformas"          active={location.pathname.startsWith('/proformas')} sub disabled={!p.perm_nueva_factura} />
                            <SidebarItem to="/facturacion"        icon={FileText}        label="Comprobantes"       active={location.pathname === '/facturacion'} sub disabled={!p.perm_comprobantes} />
                            <SidebarItem to="/notas-credito"      icon={FileMinus}       label="Notas de Crédito"   active={location.pathname === '/notas-credito'} sub disabled={!p.perm_notas_credito} />
                            <SidebarItem to="/anulacion-facturas" icon={Ban}             label="Anulación Facturas" active={location.pathname === '/anulacion-facturas'} sub disabled={!p.perm_anulacion_facturas} />
                            <SidebarItem to="/guias-remision"    icon={Truck}           label="Guías de Remisión"  active={location.pathname.startsWith('/guias-remision')} sub disabled={!p.perm_comprobantes} />
                            <SidebarItem to="/cierres"            icon={BookOpen}        label="Cierres de Caja"    active={location.pathname === '/cierres'} sub disabled={!p.perm_cierres_caja} />
                            <SidebarItem to="/consultas/ventas"         icon={Search}    label="Consulta Ventas"      active={location.pathname === '/consultas/ventas'} sub disabled={!p.perm_consulta_ventas} />
                            <SidebarItem to="/consultas/ventas-cliente" icon={User}      label="Ventas por Cliente"   active={location.pathname === '/consultas/ventas-cliente'} sub disabled={!p.perm_consulta_ventas} />
                            {profile?.rol === 'oficina' && (
                                <button
                                    onClick={() => setIsCierreCajaOpen(true)}
                                    className="flex items-center gap-3 w-full pl-8 pr-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                                >
                                    <div className="w-4 h-4 flex items-center justify-center shrink-0">
                                        <span className="font-mono font-bold text-xs border border-current rounded px-0.5">$$</span>
                                    </div>
                                    {isSidebarOpen && <span>Cerrar Caja</span>}
                                </button>
                            )}
                        </ModuleSection>}

                        {/* ── MÓDULO INVENTARIOS ────────────────────────── */}
                        {esOficina && <ModuleSection
                            label="Módulo Inventarios"
                            icon={Package}
                            colorClass="text-orange-600"
                            isOpen={openGroups.includes('inventario')}
                            onToggle={() => toggleGroup('inventario')}
                            isSidebarOpen={isSidebarOpen}
                            anyActive={['/productos','/compras/ordenes','/compras/nueva-inventario','/preparaciones-pintura','/inventario-valorizado','/kardex','/ajuste-inventario','/transferencia-bodega'].some(p => location.pathname.startsWith(p))}
                        >
                            <SidebarItem to="/productos"               icon={Package}           label="Artículos"             active={location.pathname === '/productos'} sub />
                            <SidebarItem to="/compras/ordenes"          icon={CheckSquare}       label="Órdenes de Compra"     active={location.pathname.startsWith('/compras/ordenes')} sub />
                            <SidebarItem to="/compras/nueva-inventario" icon={ShoppingCart}      label="Compras Inventario"    active={location.pathname === '/compras/nueva-inventario'} sub />
                            <SidebarItem to="/preparaciones-pintura"    icon={Palette}           label="Prep. Pinturas"        active={location.pathname.startsWith('/preparaciones-pintura')} sub />
                            <SidebarItem to="/ajuste-inventario"        icon={SlidersHorizontal} label="Ajuste de Inventario"  active={location.pathname === '/ajuste-inventario'} sub />
                            <SidebarItem to="/transferencia-bodega"     icon={ArrowLeftRight}    label="Transfer. Bodegas"     active={location.pathname === '/transferencia-bodega'} sub />
                            <SidebarItem to="/inventario-valorizado"    icon={BarChart3}         label="Inventario Valorado"   active={location.pathname === '/inventario-valorizado'} sub />
                            <SidebarItem to="/kardex"                   icon={ArrowDownUp}       label="Kardex"                active={location.pathname.startsWith('/kardex')} sub />
                        </ModuleSection>}

                        {/* ── MÓDULO 1b: Manejo de Clientes ────────────── */}
                        {esOficina && <ModuleSection
                            label="Manejo de Clientes"
                            icon={UserCog}
                            colorClass="text-teal-600"
                            isOpen={openGroups.includes('clientes')}
                            onToggle={() => toggleGroup('clientes')}
                            isSidebarOpen={isSidebarOpen}
                            anyActive={['/clientes','/cartera','/consultas/cartera'].some(p => location.pathname.startsWith(p))}
                        >
                            <SidebarItem to="/clientes"                    icon={Users}      label="Clientes"         active={location.pathname === '/clientes'} sub disabled={!p.perm_clientes} />
                            <SidebarItem to="/cartera-cxc"                 icon={CreditCard} label="Cartera / Abonos" active={location.pathname === '/cartera-cxc'} sub disabled={!p.perm_cartera_cxc} />
                            <SidebarItem to="/clientes/gestion-cartera"    icon={ClipboardList} label="Gestión de Cartera" active={location.pathname === '/clientes/gestion-cartera'} sub disabled={!p.perm_gestion_cartera} />
                            <SidebarItem to="/consultas/cartera-clientes"  icon={FileSearch} label="Consulta Cartera" active={location.pathname === '/consultas/cartera-clientes'} sub disabled={!p.perm_consulta_cartera} />
                            <SidebarItem to="/cartera/estado-cuenta"       icon={BarChart3}  label="Estado de Cuenta" active={location.pathname.startsWith('/cartera/estado-cuenta')} sub disabled={!p.perm_estado_cuenta} />
                        </ModuleSection>}

                        {/* ── MÓDULO 2: Cuentas por Pagar ──────────────── */}
                        {esOficina && mods.vendor && <ModuleSection
                            label="Cuentas por Pagar"
                            icon={ShoppingCart}
                            colorClass="text-amber-600"
                            isOpen={openGroups.includes('cxp')}
                            onToggle={() => toggleGroup('cxp')}
                            isSidebarOpen={isSidebarOpen}
                            anyActive={['/proveedores','/compras','/cxp','/reportes/compras','/reportes/cxp','/reportes/estado-cuenta','/ajustes','/retenciones'].some(x => location.pathname.startsWith(x))}
                        >
                            <SidebarItem to="/proveedores" icon={Truck} label="Proveedores" active={location.pathname === '/proveedores'} sub disabled={!p.perm_proveedores} />

                            {/* Compras — subgrupo */}
                            <div>
                                <button onClick={() => toggleGroup('vm-compras')}
                                    className={`w-full flex items-center gap-2 pl-8 pr-3 py-2 rounded-lg text-sm transition-colors ${location.pathname.startsWith('/compras') ? 'text-primary-700 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}>
                                    <ShoppingCart className="w-4 h-4 shrink-0 text-slate-400" />
                                    {isSidebarOpen && <span className="flex-1 text-left">Compras</span>}
                                    {isSidebarOpen && <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${openGroups.includes('vm-compras') ? 'rotate-180' : ''}`} />}
                                </button>
                                {openGroups.includes('vm-compras') && isSidebarOpen && (
                                    <div className="ml-4 border-l border-slate-100 pl-1 space-y-0.5">
                                        <SidebarItem to="/compras"                icon={FileText}  label="Lista de Compras"     active={location.pathname === '/compras'} sub disabled={!p.perm_compras} />
                                        <SidebarItem to="/compras/nueva-servicio" icon={FileText}  label="Compras de Servicios" active={location.pathname === '/compras/nueva-servicio'} sub disabled={!p.perm_compras} />
                                        <SidebarItem to="/retenciones"            icon={UserCheck} label="Retenciones"          active={location.pathname === '/retenciones'} sub disabled={!p.perm_compras} />
                                    </div>
                                )}
                            </div>

                            <SidebarItem to="/cxp" icon={Wallet} label="Cuentas por Pagar" active={location.pathname === '/cxp'} sub disabled={!p.perm_cxp} />

                            {/* Reportes — subgrupo */}
                            <div>
                                <button onClick={() => toggleGroup('vm-reportes')}
                                    className={cn(`w-full flex items-center gap-2 pl-8 pr-3 py-2 rounded-lg text-sm transition-colors`, !p.perm_reportes_cxp ? 'opacity-35 cursor-not-allowed' : location.pathname.startsWith('/reportes') ? 'text-primary-700 font-medium' : 'text-slate-600 hover:bg-slate-100')}>
                                    <BarChart3 className="w-4 h-4 shrink-0 text-slate-400" />
                                    {isSidebarOpen && <span className={cn("flex-1 text-left", !p.perm_reportes_cxp ? 'line-through decoration-slate-300' : '')}>Reportes</span>}
                                    {isSidebarOpen && !(!p.perm_reportes_cxp) && <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${openGroups.includes('vm-reportes') ? 'rotate-180' : ''}`} />}
                                </button>
                                {openGroups.includes('vm-reportes') && isSidebarOpen && p.perm_reportes_cxp && (
                                    <div className="ml-4 border-l border-slate-100 pl-1 space-y-0.5">
                                        <SidebarItem to="/reportes/compras"        icon={FileText}  label="Compras por período"      active={location.pathname === '/reportes/compras'} sub />
                                        <SidebarItem to="/reportes/cxp"            icon={Wallet}    label="Consulta CxP"             active={location.pathname === '/reportes/cxp'} sub />
                                        <SidebarItem to="/reportes/estado-cuenta"  icon={BarChart3} label="Estado de cuenta prov."   active={location.pathname === '/reportes/estado-cuenta'} sub />
                                    </div>
                                )}
                            </div>

                            <SidebarItem to="/ajustes" icon={Settings} label="Ajustes Contables" active={location.pathname === '/ajustes'} sub />
                        </ModuleSection>}

                        {/* ── MÓDULO 3: Tesorería ───────────────────────── */}
                        {esOficina && mods.finance && <ModuleSection
                            label="Tesorería"
                            icon={Wallet}
                            colorClass="text-green-600"
                            isOpen={openGroups.includes('tesoreria')}
                            onToggle={() => toggleGroup('tesoreria')}
                            isSidebarOpen={isSidebarOpen}
                            anyActive={location.pathname.startsWith('/teso/')}
                        >
                            <SidebarItem to="/teso/cuentas-bancarias" icon={Wallet} label="Cuentas Bancarias" active={location.pathname === '/teso/cuentas-bancarias'} sub disabled={!p.perm_bancos} />

                            {/* Pagos */}
                            <div>
                                <button onClick={() => toggleGroup('teso-pagos')}
                                    className={`w-full flex items-center gap-2 pl-8 pr-3 py-2 rounded-lg text-sm transition-colors ${location.pathname.startsWith('/teso/egresos') || location.pathname.startsWith('/teso/anticipos') ? 'text-primary-700 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}>
                                    <FileText className="w-4 h-4 shrink-0 text-slate-400" />
                                    {isSidebarOpen && <span className="flex-1 text-left">Pagos</span>}
                                    {isSidebarOpen && <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${openGroups.includes('teso-pagos') ? 'rotate-180' : ''}`} />}
                                </button>
                                {openGroups.includes('teso-pagos') && isSidebarOpen && (
                                    <div className="ml-4 border-l border-slate-100 pl-1 space-y-0.5">
                                        <SidebarItem to="/teso/egresos"       icon={FileText} label="Comprobantes Egreso" active={location.pathname === '/teso/egresos'} sub disabled={!p.perm_egresos} />
                                        <SidebarItem to="/teso/egresos/nuevo" icon={FilePlus} label="Nuevo Egreso"         active={location.pathname === '/teso/egresos/nuevo'} sub disabled={!p.perm_egresos} />
                                        <SidebarItem to="/teso/anticipos"     icon={Wallet}   label="Cheques / Transf."    active={location.pathname === '/teso/anticipos'} sub disabled={!p.perm_egresos} />
                                    </div>
                                )}
                            </div>

                            <SidebarItem to="/teso/cheques"       icon={CheckSquare} label="Cheques"           active={location.pathname === '/teso/cheques'} sub disabled={!p.perm_cheques} />
                            <SidebarItem to="/teso/cheques-fecha" icon={CheckSquare} label="Cheques a Fecha"    active={location.pathname === '/teso/cheques-fecha'} sub disabled={!p.perm_cheques} />
                            <SidebarItem to="/teso/movimientos"   icon={ArrowDownUp} label="Movimientos Banc."  active={location.pathname === '/teso/movimientos'} sub disabled={!p.perm_movimientos_banc} />
                            <SidebarItem to="/teso/conciliacion"  icon={BarChart3}   label="Conciliación"       active={location.pathname.startsWith('/teso/conciliacion')} sub disabled={!p.perm_conciliacion} />
                            <SidebarItem to="/teso/configuracion" icon={Settings} label="Configuración" active={location.pathname === '/teso/configuracion'} sub />
                            <SidebarItem to="/teso/cierre-general" icon={Wallet} label="Cierre Caja General" active={location.pathname === '/teso/cierre-general'} sub disabled={!p.perm_cierres_caja} />

                            {/* Reportes */}
                            <div>
                                <button onClick={() => toggleGroup('teso-rep')}
                                    className={`w-full flex items-center gap-2 pl-8 pr-3 py-2 rounded-lg text-sm transition-colors ${location.pathname.startsWith('/teso/reportes') ? 'text-primary-700 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}>
                                    <BarChart3 className="w-4 h-4 shrink-0 text-slate-400" />
                                    {isSidebarOpen && <span className="flex-1 text-left">Reportes</span>}
                                    {isSidebarOpen && <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${openGroups.includes('teso-rep') ? 'rotate-180' : ''}`} />}
                                </button>
                                {openGroups.includes('teso-rep') && isSidebarOpen && (
                                    <div className="ml-4 border-l border-slate-100 pl-1 space-y-0.5">
                                        <SidebarItem to="/teso/reportes/estado-cuenta" icon={BarChart3}    label="Estado de Cuenta"       active={location.pathname === '/teso/reportes/estado-cuenta'} sub />
                                        <SidebarItem to="/teso/reportes/movimientos"   icon={ArrowDownUp}  label="Movimientos por Período" active={location.pathname === '/teso/reportes/movimientos'} sub />
                                        <SidebarItem to="/teso/reportes/cheques-fecha" icon={CheckSquare}  label="Cheques a Fecha"        active={location.pathname === '/teso/reportes/cheques-fecha'} sub />
                                    </div>
                                )}
                            </div>
                        </ModuleSection>}

                        {/* ── MÓDULO 4: Contabilidad ────────────────────── */}
                        {esOficina && mods.ledgerpro && <ModuleSection
                            label="Contabilidad"
                            icon={BookOpen}
                            colorClass="text-purple-600"
                            isOpen={openGroups.includes('contabilidad')}
                            onToggle={() => toggleGroup('contabilidad')}
                            isSidebarOpen={isSidebarOpen}
                            anyActive={['/conta/','/lp-'].some(p => location.pathname.includes(p))}
                        >
                            <SidebarItem to="/conta/dashboard"    icon={LayoutDashboard} label="Dashboard"        active={location.pathname === '/conta/dashboard'} sub disabled={!p.perm_asientos} />
                            <SidebarItem to="/conta/plan-cuentas" icon={BookOpen}        label="Plan de Cuentas" active={location.pathname === '/conta/plan-cuentas'} sub disabled={!p.perm_plan_cuentas} />
                            <SidebarItem to="/conta/diarios"      icon={FileText}        label="Diarios"         active={location.pathname === '/conta/diarios'} sub disabled={!p.perm_asientos} />

                            {/* Reportes */}
                            <div>
                                <button onClick={() => toggleGroup('conta-rep')}
                                    className={`w-full flex items-center gap-2 pl-8 pr-3 py-2 rounded-lg text-sm transition-colors ${location.pathname.startsWith('/conta/reportes') ? 'text-primary-700 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}>
                                    <BarChart3 className="w-4 h-4 shrink-0 text-slate-400" />
                                    {isSidebarOpen && <span className="flex-1 text-left">Reportes</span>}
                                    {isSidebarOpen && <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${openGroups.includes('conta-rep') ? 'rotate-180' : ''}`} />}
                                </button>
                                {openGroups.includes('conta-rep') && isSidebarOpen && (
                                    <div className="ml-4 border-l border-slate-100 pl-1 space-y-0.5">
                                        <SidebarItem to="/conta/reportes/balance-comprobacion" icon={BarChart3} label="Bal. Comprobación"    active={location.pathname === '/conta/reportes/balance-comprobacion'} sub disabled={!p.perm_reportes_cont} />
                                        <SidebarItem to="/conta/reportes/balance-general"      icon={Wallet}   label="Situación Financiera" active={location.pathname === '/conta/reportes/balance-general'} sub disabled={!p.perm_reportes_cont} />
                                        <SidebarItem to="/conta/reportes/estado-resultados"    icon={FileText} label="Estado Resultados"    active={location.pathname === '/conta/reportes/estado-resultados'} sub disabled={!p.perm_reportes_cont} />
                                        <SidebarItem to="/conta/reportes/estado-cuenta"        icon={BookOpen} label="Estado de Cuenta"     active={location.pathname === '/conta/reportes/estado-cuenta'} sub disabled={!p.perm_reportes_cont} />
                                        <SidebarItem to="/conta/reportes/real-vs-presupuesto"  icon={BarChart3}label="Real vs Presupuesto"  active={location.pathname === '/conta/reportes/real-vs-presupuesto'} sub disabled={!p.perm_reportes_cont} />
                                    </div>
                                )}
                            </div>

                            <SidebarItem to="/conta/presupuesto" icon={Wallet}   label="Presupuesto"     active={location.pathname === '/conta/presupuesto'} sub disabled={!p.perm_reportes_cont} />
                            <SidebarItem to="/conta/cierre"      icon={Settings} label="Cierre Contable" active={location.pathname === '/conta/cierre'} sub disabled={!p.perm_asientos} />

                            {/* Integración */}
                            <div>
                                <button onClick={() => toggleGroup('conta-int')}
                                    className={`w-full flex items-center gap-2 pl-8 pr-3 py-2 rounded-lg text-sm transition-colors ${location.pathname.startsWith('/conta/integracion') ? 'text-primary-700 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}>
                                    <Search className="w-4 h-4 shrink-0 text-slate-400" />
                                    {isSidebarOpen && <span className="flex-1 text-left">Integración</span>}
                                    {isSidebarOpen && <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${openGroups.includes('conta-int') ? 'rotate-180' : ''}`} />}
                                </button>
                                {openGroups.includes('conta-int') && isSidebarOpen && (
                                    <div className="ml-4 border-l border-slate-100 pl-1 space-y-0.5">
                                        <SidebarItem to="/conta/integracion/qi"    icon={FileText} label="Integración QI"  active={location.pathname === '/conta/integracion/qi'} sub disabled={!p.perm_asientos} />
                                        <SidebarItem to="/conta/integracion/sri"   icon={FileText} label="Integración SRI" active={location.pathname === '/conta/integracion/sri'} sub disabled={!p.perm_asientos} />
                                        <SidebarItem to="/conta/integracion/excel" icon={FileText} label="Excel Ventas"    active={location.pathname === '/conta/integracion/excel'} sub disabled={!p.perm_asientos} />
                                    </div>
                                )}
                            </div>

                            <SidebarItem to="/conta/configuracion" icon={Settings} label="Configuración" active={location.pathname === '/conta/configuracion'} sub />
                        </ModuleSection>}

                        {/* ── MÓDULO 4b: Tributario ────────────────────── */}
                        {esOficina && mods.ledgerpro && p.perm_tributario && <ModuleSection
                            label="Tributario"
                            icon={UserCheck}
                            colorClass="text-amber-600"
                            isOpen={openGroups.includes('tributario')}
                            onToggle={() => toggleGroup('tributario')}
                            isSidebarOpen={isSidebarOpen}
                            anyActive={location.pathname.startsWith('/conta/tributario')}
                        >
                            <SidebarItem to="/conta/tributario/compras"     icon={ShoppingCart} label="Compras SRI"    active={location.pathname === '/conta/tributario/compras'} sub />
                            <SidebarItem to="/conta/tributario/retenciones"     icon={FileText}  label="Retenciones"     active={location.pathname === '/conta/tributario/retenciones'} sub />
                            <SidebarItem to="/conta/tributario/facturas-ventas" icon={Receipt}   label="Facturas Ventas" active={location.pathname === '/conta/tributario/facturas-ventas'} sub />
                            <SidebarItem to="/conta/tributario/nc-nd"           icon={FileMinus} label="N/C y N/D"       active={location.pathname === '/conta/tributario/nc-nd'} sub />
                            <SidebarItem to="/conta/tributario/ats"         icon={FileText}     label="ATS"           active={location.pathname === '/conta/tributario/ats'} sub />
                            <SidebarItem to="/conta/tributario/104"         icon={BarChart3}    label="Form. 104 IVA" active={location.pathname === '/conta/tributario/104'} sub />
                        </ModuleSection>}

                        {/* ── MÓDULO 5: Talento Humano ────────────────────── */}
                        {esOficina && mods.talento_humano && <ModuleSection
                            label="Talento Humano"
                            icon={Users}
                            colorClass="text-indigo-600"
                            isOpen={openGroups.includes('talento')}
                            onToggle={() => toggleGroup('talento')}
                            isSidebarOpen={isSidebarOpen}
                            anyActive={location.pathname.startsWith('/talento/')}
                        >
                            <SidebarItem to="/talento/vacantes"             icon={UserCheck}     label="Reclutamiento"          active={location.pathname.startsWith('/talento/vacantes')} sub disabled={!p.perm_th_empleados} />
                            <SidebarItem to="/talento/empleados"            icon={Users}         label="Empleados"               active={location.pathname === '/talento/empleados'} sub disabled={!p.perm_th_empleados} />
                            <SidebarItem to="/talento/plantillas-checklist" icon={ListChecks}    label="Plantillas Checklist"    active={location.pathname === '/talento/plantillas-checklist'} sub disabled={!p.perm_th_empleados} />
                            <SidebarItem to="/talento/checklists"           icon={ClipboardList} label="Onboarding/Offboarding"  active={location.pathname === '/talento/checklists'} sub disabled={!p.perm_th_empleados} />
                            <SidebarItem to="/talento/desempeno"            icon={Star}          label="Evaluación Desempeño"    active={location.pathname === '/talento/desempeno'} sub disabled={!p.perm_th_empleados} />
                            <SidebarItem to="/talento/capacitacion"         icon={GraduationCap} label="Capacitación"            active={location.pathname === '/talento/capacitacion'} sub disabled={!p.perm_th_empleados} />
                            <SidebarItem to="/talento/clima"                icon={Smile}         label="Clima Organizacional"    active={location.pathname === '/talento/clima'} sub disabled={!p.perm_th_empleados} />
                            <SidebarItem to="/talento/dashboard"            icon={BarChart3}     label="Dashboard Talento"       active={location.pathname === '/talento/dashboard'} sub disabled={!p.perm_th_empleados} />
                            <SidebarItem to="/talento/finiquito"            icon={Scale}         label="Finiquitos"              active={location.pathname.startsWith('/talento/finiquito')} sub disabled={!p.perm_th_empleados} />
                            <SidebarItem to="/talento/estructura"           icon={Users}         label="Estructura Organizativa" active={location.pathname === '/talento/estructura'} sub disabled={!p.perm_th_estructura} />
                        </ModuleSection>}

                        {/* ── MÓDULO 6: Liquidación de Nóminas ────────────── */}
                        {esOficina && mods.talento_humano && <ModuleSection
                            label="Liquidación de Nóminas"
                            icon={Wallet}
                            colorClass="text-cyan-600"
                            isOpen={openGroups.includes('nominas')}
                            onToggle={() => toggleGroup('nominas')}
                            isSidebarOpen={isSidebarOpen}
                            anyActive={location.pathname.startsWith('/nominas/')}
                        >
                            <SidebarItem to="/nominas/periodos"      icon={BookOpen}       label="Períodos / Rol de Pagos"   active={location.pathname.startsWith('/nominas/periodos') || location.pathname.startsWith('/nominas/rol/') || location.pathname.startsWith('/nominas/reportes/')} sub disabled={!p.perm_th_rol_nomina} />
                            <SidebarItem to="/nominas/novedades"     icon={ClipboardList}  label="Novedades / Descuentos"    active={location.pathname === '/nominas/novedades'} sub disabled={!p.perm_th_rol_nomina} />
                            <SidebarItem to="/nominas/capacidad-pago" icon={Wallet}        label="Estado Económico"          active={location.pathname === '/nominas/capacidad-pago'} sub disabled={!p.perm_th_rol_nomina} />
                            <SidebarItem to="/nominas/decimos"       icon={FileText}       label="Liquidación Décimos 13/14" active={location.pathname === '/nominas/decimos'} sub disabled={!p.perm_th_rol_nomina} />
                            <SidebarItem to="/nominas/vacaciones"    icon={CalendarDays}   label="Liquidación Vacaciones"    active={location.pathname === '/nominas/vacaciones'} sub disabled={!p.perm_th_rol_nomina} />
                            <SidebarItem to="/nominas/conceptos"     icon={BookOpen}       label="Conceptos de Nómina"       active={location.pathname === '/nominas/conceptos'}  sub disabled={!p.perm_th_conceptos_nomina} />
                            <SidebarItem to="/nominas/cuentas-nomina" icon={CreditCard}   label="Cuentas Contables"         active={location.pathname === '/nominas/cuentas-nomina'} sub disabled={!p.perm_th_nomina_parametros} />
                            <SidebarItem to="/nominas/parametros"    icon={Settings}       label="Parámetros de Nómina"      active={location.pathname === '/nominas/parametros'} sub disabled={!p.perm_th_nomina_parametros} />
                        </ModuleSection>}

                    </nav>

                    <div className="p-4 border-t border-slate-100 space-y-1">
                        {/* Ajustes — expandible */}
                        <div>
                            <button
                                onClick={() => toggleGroup('ajustes')}
                                className={cn(
                                    'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors',
                                    location.pathname === '/configuracion'
                                        ? 'bg-slate-100 font-semibold text-slate-900'
                                        : darkSidebar ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100'
                                )}
                            >
                                <Settings className="w-5 h-5 shrink-0 text-slate-400" />
                                {isSidebarOpen && <span className="flex-1 text-left text-sm">Ajustes</span>}
                                {isSidebarOpen && <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform', openGroups.includes('ajustes') && 'rotate-180')} />}
                            </button>
                            {openGroups.includes('ajustes') && isSidebarOpen && (
                                <div className="mt-0.5 ml-2 border-l-2 border-slate-100 pl-1 space-y-0.5">
                                    <SidebarItem to="/configuracion"      icon={Settings}  label="Configuración"       active={location.pathname === '/configuracion'} sub />
                                    <SidebarItem to="/retenciones/codigos" icon={BookOpen}  label="Códigos Ret. SRI"    active={location.pathname === '/retenciones/codigos'} sub />
                                    {isAdmin && <SidebarItem to="/ajustes/permisos" icon={UserCog} label="Permisos de usuario" active={location.pathname === '/ajustes/permisos'} sub />}
                                    {esOficina && <SidebarItem to="/vendedores" icon={UserCheck} label="Vendedores" active={location.pathname === '/vendedores'} sub />}
                                    {esOficina && <SidebarItem to="/importar-articulos" icon={Upload} label="Importar Artículos" active={location.pathname === '/importar-articulos'} sub />}
                                    {esOficina && <SidebarItem to="/importar-clientes"  icon={Users}  label="Clientes (Import/Export)" active={location.pathname === '/importar-clientes'} sub />}
                                    <button
                                        onClick={toggleDarkSidebar}
                                        className="flex items-center gap-3 w-full pl-8 pr-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors"
                                    >
                                        {darkSidebar
                                            ? <Sun className="w-4 h-4 text-yellow-400 shrink-0" />
                                            : <Moon className="w-4 h-4 text-slate-400 shrink-0" />}
                                        <span>{darkSidebar ? 'Cambiar a claro' : 'Cambiar a oscuro'}</span>
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Cerrar Sesión */}
                        <button
                            onClick={() => signOut()}
                            className={cn("flex items-center gap-3 w-full px-4 py-3 rounded-lg transition-colors group",
                                darkSidebar ? "text-slate-400 hover:bg-red-900/30 hover:text-red-400" : "text-slate-600 hover:bg-red-50 hover:text-red-600")}
                        >
                            <LogOut className="w-5 h-5 text-slate-400 group-hover:text-red-500" />
                            {isSidebarOpen && <span>Cerrar Sesión</span>}
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className={cn(
                "flex-1 transition-all duration-300",
                isSidebarOpen ? "ml-64" : "ml-0"
            )}>
                {/* Topbar */}
                <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-20">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            className="p-2 hover:bg-slate-100 rounded-md text-slate-600"
                        >
                            {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                        </button>

                        <div className="h-10 w-px bg-slate-200 mx-2" />

                        {/* Business Logo / Empresa Switcher */}
                        <div className="relative">
                            <button
                                onClick={(e) => {
                                    if (empresasDisponibles?.length > 1) {
                                        e.stopPropagation()
                                        setShowEmpresaDropdown(v => !v)
                                    }
                                }}
                                className={cn(
                                    "flex items-center gap-3",
                                    empresasDisponibles?.length > 1 ? "hover:bg-slate-100 rounded-lg px-2 py-1 cursor-pointer transition-colors" : "cursor-default"
                                )}
                            >
                                {empresa?.logo_url ? (
                                    <img src={empresa.logo_url} alt={empresa.nombre} className="h-10 w-auto object-contain" />
                                ) : (
                                    <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center text-primary-600 font-bold">
                                        {empresa?.nombre?.[0] || 'E'}
                                    </div>
                                )}
                                <div className="hidden md:block text-left">
                                    <span className="text-sm font-bold text-slate-700 block">{empresa?.nombre || 'Mi Negocio'}</span>
                                    {empresasDisponibles?.length > 1 && (
                                        <span className="text-[10px] text-primary-600 font-semibold uppercase tracking-wide">Cambiar empresa ▾</span>
                                    )}
                                </div>
                            </button>

                            {showEmpresaDropdown && empresasDisponibles?.length > 1 && (
                                <div className="absolute top-full left-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
                                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase tracking-wide">
                                        Seleccionar empresa
                                    </div>
                                    {(empresasDisponibles as any[]).map((emp: any) => (
                                        <button
                                            key={emp.id}
                                            onClick={async () => {
                                                setShowEmpresaDropdown(false)
                                                await selectEmpresa(emp.id)
                                                navigate('/')
                                            }}
                                            className={cn(
                                                "w-full flex items-center gap-3 px-4 py-3 hover:bg-primary-50 transition-colors text-left",
                                                empresa?.id === emp.id ? "bg-primary-50" : ""
                                            )}
                                        >
                                            {emp.logo_url ? (
                                                <img src={emp.logo_url} alt={emp.nombre} className="w-8 h-8 object-contain rounded shrink-0" />
                                            ) : (
                                                <div className="w-8 h-8 bg-primary-100 rounded flex items-center justify-center text-primary-700 font-bold text-sm shrink-0">
                                                    {emp.nombre[0]}
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-slate-800 truncate">{emp.nombre}</p>
                                                <p className="text-xs text-slate-400">{emp.ruc}</p>
                                            </div>
                                            {empresa?.id === emp.id && (
                                                <span className="w-2 h-2 bg-primary-500 rounded-full shrink-0" />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        {/* Provider Logo */}
                        <div className="flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Powered by</span>
                            <img src="/logos/provider_logo.png" alt="Billennium Sentinel" className="h-8 w-auto grayscale" />
                        </div>

                        <div className="h-8 w-px bg-slate-200" />

                        <div className="flex items-center gap-4 text-right">
                            <div className="flex flex-col">
                                <p className="text-sm font-bold text-slate-900">{profile?.nombre || 'Usuario'}</p>
                                <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">{profile?.rol?.replace('_', ' ')}</p>
                            </div>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold">
                            {profile?.nombre?.[0] || 'U'}
                        </div>
                    </div>
                </header>

                <div className="p-6 max-w-7xl mx-auto">
                    {children}
                </div>
            </main>

            {/* Modals */}
            <CierreCajaModal
                isOpen={isCierreCajaOpen}
                onClose={() => setIsCierreCajaOpen(false)}
            />
        </div>
    )
}
