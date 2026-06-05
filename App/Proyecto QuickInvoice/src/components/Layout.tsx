import React from 'react'
import { Link, useLocation } from 'react-router-dom'
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
}

const SidebarItem = ({ to, icon: Icon, label, active, sub }: SidebarItemProps) => (
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

interface NavGroup {
    type: 'group'
    icon: React.ElementType
    label: string
    roles: string[]
    children: { to: string; label: string; icon: React.ElementType }[]
}
interface NavLink {
    type?: 'link'
    to: string
    icon: React.ElementType
    label: string
    roles: string[]
}
type _NavItem = NavLink | NavGroup

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

export function Layout({ children }: { children: React.ReactNode }) {
    const { profile, empresa, modules, signOut } = useAuth() as any
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
    const [openGroups, setOpenGroups] = React.useState<string[]>(() => {
        const p = window.location.pathname
        if (p.startsWith('/conta/')) return ['contabilidad']
        if (p.startsWith('/teso/'))  return ['tesoreria']
        if (['/compras','/cxp','/proveedores','/retenciones'].some(x => p.startsWith(x)))
            return ['cxp']
        return ['facturacion']
    })

    const toggleGroup = (label: string) => {
        setOpenGroups(prev => prev.includes(label) ? prev.filter(g => g !== label) : [...prev, label])
    }

    const mods: Modules = modules ?? { vendor: false, finance: false, ledgerpro: false }
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
                            </>
                        )}

                        {/* ── MÓDULO 1: Facturación / Clientes ─────────── */}
                        {esOficina && <ModuleSection
                            label="Facturación / Clientes"
                            icon={FileText}
                            colorClass="text-primary-600"
                            isOpen={openGroups.includes('facturacion')}
                            onToggle={() => toggleGroup('facturacion')}
                            isSidebarOpen={isSidebarOpen}
                            anyActive={['/dashboard','/nueva-factura','/facturacion','/clientes','/productos','/vendedores','/cartera-cxc','/notas-credito','/anulacion-facturas','/cierres','/consultas','/cartera'].some(p => location.pathname.startsWith(p))}
                        >
                            <SidebarItem to="/dashboard"           icon={LayoutDashboard} label="Dashboard"            active={location.pathname === '/dashboard'} sub />
                            <SidebarItem to="/nueva-factura"       icon={FilePlus}        label="Nueva Factura"        active={location.pathname === '/nueva-factura'} sub />
                            <SidebarItem to="/facturacion"         icon={FileText}        label="Comprobantes"         active={location.pathname === '/facturacion'} sub />
                            <SidebarItem to="/clientes"            icon={Users}           label="Clientes"             active={location.pathname === '/clientes'} sub />
                            <SidebarItem to="/notas-credito"       icon={FileMinus}       label="Notas de Crédito"     active={location.pathname === '/notas-credito'} sub />
                            <SidebarItem to="/anulacion-facturas"  icon={Ban}             label="Anulación Facturas"   active={location.pathname === '/anulacion-facturas'} sub />
                            <SidebarItem to="/cierres"             icon={BookOpen}        label="Cierres de Caja"      active={location.pathname === '/cierres'} sub />
                            <SidebarItem to="/consultas/ventas"    icon={Search}          label="Consulta Ventas"      active={location.pathname.startsWith('/consultas')} sub />
                            <SidebarItem to="/configuracion"       icon={Settings}        label="Configuración"        active={location.pathname === '/configuracion'} sub />
                        </ModuleSection>}

                        {/* ── MÓDULO 2: Cuentas por Pagar ──────────────── */}
                        {esOficina && mods.vendor && <ModuleSection
                            label="Cuentas por Pagar"
                            icon={ShoppingCart}
                            colorClass="text-amber-600"
                            isOpen={openGroups.includes('cxp')}
                            onToggle={() => toggleGroup('cxp')}
                            isSidebarOpen={isSidebarOpen}
                            anyActive={['/proveedores','/compras','/cxp','/reportes/compras','/reportes/cxp','/reportes/estado-cuenta','/ajustes'].some(p => location.pathname.startsWith(p))}
                        >
                            <SidebarItem to="/proveedores" icon={Truck} label="Proveedores" active={location.pathname === '/proveedores'} sub />

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
                                        <SidebarItem to="/compras"                  icon={FileText}  label="Lista de Compras"       active={location.pathname === '/compras'} sub />
                                        <SidebarItem to="/compras/nueva-inventario" icon={Package}   label="Nueva Fact. Inventario" active={location.pathname === '/compras/nueva-inventario'} sub />
                                        <SidebarItem to="/compras/nueva-servicio"   icon={FileText}  label="Nueva Fact. Servicio"   active={location.pathname === '/compras/nueva-servicio'} sub />
                                        <SidebarItem to="/retenciones"              icon={UserCheck} label="Retenciones"            active={location.pathname === '/retenciones'} sub />
                                    </div>
                                )}
                            </div>

                            <SidebarItem to="/cxp" icon={Wallet} label="Cuentas por Pagar" active={location.pathname === '/cxp'} sub />

                            {/* Reportes — subgrupo */}
                            <div>
                                <button onClick={() => toggleGroup('vm-reportes')}
                                    className={`w-full flex items-center gap-2 pl-8 pr-3 py-2 rounded-lg text-sm transition-colors ${location.pathname.startsWith('/reportes') ? 'text-primary-700 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}>
                                    <BarChart3 className="w-4 h-4 shrink-0 text-slate-400" />
                                    {isSidebarOpen && <span className="flex-1 text-left">Reportes</span>}
                                    {isSidebarOpen && <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${openGroups.includes('vm-reportes') ? 'rotate-180' : ''}`} />}
                                </button>
                                {openGroups.includes('vm-reportes') && isSidebarOpen && (
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
                            <SidebarItem to="/teso/cuentas-bancarias" icon={Wallet}        label="Cuentas Bancarias"      active={location.pathname === '/teso/cuentas-bancarias'} sub />

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
                                        <SidebarItem to="/teso/egresos"       icon={FileText}     label="Comprobantes Egreso"  active={location.pathname === '/teso/egresos'} sub />
                                        <SidebarItem to="/teso/egresos/nuevo" icon={FilePlus}     label="Nuevo Egreso"         active={location.pathname === '/teso/egresos/nuevo'} sub />
                                        <SidebarItem to="/teso/anticipos"     icon={Wallet}       label="Cheques / Transf."    active={location.pathname === '/teso/anticipos'} sub />
                                    </div>
                                )}
                            </div>

                            <SidebarItem to="/teso/cheques"       icon={CheckSquare}  label="Cheques"               active={location.pathname === '/teso/cheques'} sub />
                            <SidebarItem to="/teso/cheques-fecha" icon={CheckSquare}  label="Cheques a Fecha"        active={location.pathname === '/teso/cheques-fecha'} sub />
                            <SidebarItem to="/teso/movimientos"   icon={ArrowDownUp}  label="Movimientos Banc."      active={location.pathname === '/teso/movimientos'} sub />
                            <SidebarItem to="/teso/conciliacion"  icon={BarChart3}    label="Conciliación"           active={location.pathname.startsWith('/teso/conciliacion')} sub />
                            <SidebarItem to="/teso/configuracion" icon={Settings}     label="Configuración"          active={location.pathname === '/teso/configuracion'} sub />

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
                            <SidebarItem to="/conta/dashboard"    icon={LayoutDashboard} label="Dashboard"         active={location.pathname === '/conta/dashboard'} sub />
                            <SidebarItem to="/conta/plan-cuentas" icon={BookOpen}        label="Plan de Cuentas"  active={location.pathname === '/conta/plan-cuentas'} sub />
                            <SidebarItem to="/conta/diarios"      icon={FileText}        label="Diarios"          active={location.pathname === '/conta/diarios'} sub />

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
                                        <SidebarItem to="/conta/reportes/balance-comprobacion" icon={BarChart3}    label="Bal. Comprobación"   active={location.pathname === '/conta/reportes/balance-comprobacion'} sub />
                                        <SidebarItem to="/conta/reportes/balance-general"      icon={Wallet}       label="Situación Financiera" active={location.pathname === '/conta/reportes/balance-general'} sub />
                                        <SidebarItem to="/conta/reportes/estado-resultados"    icon={FileText}     label="Estado Resultados"   active={location.pathname === '/conta/reportes/estado-resultados'} sub />
                                        <SidebarItem to="/conta/reportes/estado-cuenta"        icon={BookOpen}     label="Estado de Cuenta"    active={location.pathname === '/conta/reportes/estado-cuenta'} sub />
                                        <SidebarItem to="/conta/reportes/real-vs-presupuesto"  icon={BarChart3}    label="Real vs Presupuesto" active={location.pathname === '/conta/reportes/real-vs-presupuesto'} sub />
                                    </div>
                                )}
                            </div>

                            <SidebarItem to="/conta/presupuesto"     icon={Wallet}    label="Presupuesto"      active={location.pathname === '/conta/presupuesto'} sub />
                            <SidebarItem to="/conta/cierre"          icon={Settings}  label="Cierre Contable"  active={location.pathname === '/conta/cierre'} sub />

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
                                        <SidebarItem to="/conta/integracion/qi"    icon={FileText}  label="Integración QI"    active={location.pathname === '/conta/integracion/qi'} sub />
                                        <SidebarItem to="/conta/integracion/sri"   icon={FileText}  label="Integración SRI"   active={location.pathname === '/conta/integracion/sri'} sub />
                                        <SidebarItem to="/conta/integracion/excel" icon={FileText}  label="Excel Ventas"      active={location.pathname === '/conta/integracion/excel'} sub />
                                    </div>
                                )}
                            </div>

                            {/* Tributario */}
                            <div>
                                <button onClick={() => toggleGroup('conta-trib')}
                                    className={`w-full flex items-center gap-2 pl-8 pr-3 py-2 rounded-lg text-sm transition-colors ${location.pathname.startsWith('/conta/tributario') ? 'text-primary-700 font-medium' : 'text-slate-600 hover:bg-slate-100'}`}>
                                    <UserCheck className="w-4 h-4 shrink-0 text-slate-400" />
                                    {isSidebarOpen && <span className="flex-1 text-left">Tributario</span>}
                                    {isSidebarOpen && <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${openGroups.includes('conta-trib') ? 'rotate-180' : ''}`} />}
                                </button>
                                {openGroups.includes('conta-trib') && isSidebarOpen && (
                                    <div className="ml-4 border-l border-slate-100 pl-1 space-y-0.5">
                                        <SidebarItem to="/conta/tributario/compras"     icon={ShoppingCart} label="Compras SRI"    active={location.pathname === '/conta/tributario/compras'} sub />
                                        <SidebarItem to="/conta/tributario/retenciones" icon={FileText}     label="Retenciones"   active={location.pathname === '/conta/tributario/retenciones'} sub />
                                        <SidebarItem to="/conta/tributario/nc-nd"       icon={FileMinus}    label="N/C y N/D"     active={location.pathname === '/conta/tributario/nc-nd'} sub />
                                        <SidebarItem to="/conta/tributario/ats"         icon={FileText}     label="ATS"           active={location.pathname === '/conta/tributario/ats'} sub />
                                        <SidebarItem to="/conta/tributario/104"         icon={BarChart3}    label="Form. 104 IVA" active={location.pathname === '/conta/tributario/104'} sub />
                                    </div>
                                )}
                            </div>

                            <SidebarItem to="/conta/configuracion" icon={Settings} label="Configuración" active={location.pathname === '/conta/configuracion'} sub />
                        </ModuleSection>}

                    </nav>

                    <div className="p-4 border-t border-slate-100 space-y-2">
                        {profile?.rol === 'oficina' && (
                            <button
                                onClick={() => setIsCierreCajaOpen(true)}
                                className="flex items-center gap-3 w-full px-4 py-3 text-slate-600 hover:bg-slate-100 hover:text-slate-900 rounded-lg transition-colors group"
                            >
                                <div className="w-5 h-5 flex items-center justify-center">
                                    <span className="font-mono font-bold text-xs border border-current rounded px-0.5">$$</span>
                                </div>
                                {isSidebarOpen && <span>Cerrar Caja</span>}
                            </button>
                        )}
                        <button
                            onClick={toggleDarkSidebar}
                            className={cn("flex items-center gap-3 w-full px-4 py-2.5 rounded-lg transition-colors",
                                darkSidebar ? "text-slate-300 hover:bg-slate-700" : "text-slate-500 hover:bg-slate-100")}
                            title="Cambiar tema del menú"
                        >
                            {darkSidebar
                                ? <Sun className="w-5 h-5 text-yellow-400" />
                                : <Moon className="w-5 h-5 text-slate-400" />}
                            {isSidebarOpen && <span className="text-sm">{darkSidebar ? 'Tema claro' : 'Tema oscuro'}</span>}
                        </button>
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

                        {/* Business Logo */}
                        <div className="flex items-center gap-3">
                            {empresa?.logo_url ? (
                                <img src={empresa.logo_url} alt={empresa.nombre} className="h-10 w-auto object-contain" />
                            ) : (
                                <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center text-primary-600 font-bold">
                                    {empresa?.nombre?.[0] || 'E'}
                                </div>
                            )}
                            <span className="text-sm font-bold text-slate-700 hidden md:block">{empresa?.nombre || 'Mi Negocio'}</span>
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
