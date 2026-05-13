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
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
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
type NavItem = NavLink | NavGroup

import { CierreCajaModal } from './CierreCajaModal'

export function Layout({ children }: { children: React.ReactNode }) {
    const { profile, empresa, signOut } = useAuth()
    const location = useLocation()
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(true)
    const [isCierreCajaOpen, setIsCierreCajaOpen] = React.useState(false)
    const [openGroups, setOpenGroups] = React.useState<string[]>(['Consultas'])

    const toggleGroup = (label: string) => {
        setOpenGroups(prev => prev.includes(label) ? prev.filter(g => g !== label) : [...prev, label])
    }

    const navigation: NavItem[] = [
        { to: '/configuracion', icon: Settings, label: 'Plataforma', roles: ['admin_plataforma'] },
        { to: '/', icon: LayoutDashboard, label: 'Dashboard', roles: ['admin_plataforma'] },
        { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['oficina'] },
        { to: '/nueva-factura', icon: FilePlus, label: 'Nueva Factura', roles: ['oficina'] },
        { to: '/facturacion', icon: FileText, label: 'Comprobantes', roles: ['oficina'] },
        { to: '/clientes', icon: Users, label: 'Clientes', roles: ['oficina'] },
        { to: '/productos', icon: Package, label: 'Productos', roles: ['oficina'] },
        { to: '/proveedores', icon: Truck, label: 'Proveedores', roles: ['oficina'] },
        { to: '/inventario', icon: ShoppingCart, label: 'Ingreso de Compras', roles: ['oficina'] },
        { to: '/kardex', icon: BarChart3, label: 'Kardex', roles: ['oficina'] },
        { to: '/vendedores', icon: UserCheck, label: 'Vendedores', roles: ['oficina'] },
        { to: '/cartera-cxc', icon: Wallet, label: 'Cartera CxC', roles: ['oficina'] },
        { to: '/notas-credito', icon: FileMinus, label: 'Notas de Crédito', roles: ['oficina'] },
        { to: '/anulacion-facturas', icon: Ban, label: 'Anulación de Facturas', roles: ['oficina'] },
        { to: '/cierres', icon: BookOpen, label: 'Cierres de Caja', roles: ['oficina'] },
        {
            type: 'group',
            icon: Search,
            label: 'Consultas',
            roles: ['oficina'],
            children: [
                { to: '/consultas/ventas', label: 'Ventas por Período', icon: FileText },
                { to: '/consultas/cartera-clientes', label: 'Deudas Clientes', icon: Wallet },
                { to: '/cartera/estado-cuenta', label: 'Estado de Cuenta', icon: Wallet },
            ]
        },
        { to: '/configuracion', icon: Settings, label: 'Configuración', roles: ['oficina'] },
    ]

    const filteredNav = navigation.filter(item => {
        if (!profile?.rol) return false
        return item.roles.includes(profile.rol)
    })

    return (
        <div className="min-h-screen bg-slate-50 flex">
            {/* Sidebar */}
            <aside className={cn(
                "bg-white border-r border-slate-200 transition-all duration-300 z-30 fixed inset-y-0 left-0",
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

                    <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                        {filteredNav.map((item) => {
                            if ((item as NavGroup).type === 'group') {
                                const group = item as NavGroup
                                const isOpen = openGroups.includes(group.label)
                                const anyChildActive = group.children.some(c => location.pathname === c.to)
                                return (
                                    <div key={group.label}>
                                        <button
                                            onClick={() => toggleGroup(group.label)}
                                            className={cn(
                                                "w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 group",
                                                anyChildActive ? "bg-primary-50 text-primary-700 font-medium" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                                            )}
                                        >
                                            <group.icon className={cn("w-5 h-5 shrink-0", anyChildActive ? "text-primary-600" : "text-slate-400 group-hover:text-slate-600")} />
                                            {isSidebarOpen && <span className="flex-1 text-left">{group.label}</span>}
                                            {isSidebarOpen && <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen ? "rotate-180" : "")} />}
                                        </button>
                                        {isOpen && isSidebarOpen && (
                                            <div className="mt-1 space-y-0.5">
                                                {group.children.map(child => (
                                                    <SidebarItem
                                                        key={child.to}
                                                        to={child.to}
                                                        icon={child.icon}
                                                        label={child.label}
                                                        active={location.pathname === child.to}
                                                        sub
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )
                            }
                            const link = item as NavLink
                            return (
                                <SidebarItem
                                    key={link.to + link.label}
                                    to={link.to}
                                    icon={link.icon}
                                    label={link.label}
                                    active={location.pathname === link.to}
                                />
                            )
                        })}
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
                            onClick={() => signOut()}
                            className="flex items-center gap-3 w-full px-4 py-3 text-slate-600 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors group"
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
