import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
    LayoutDashboard, BookOpen, FileText, BarChart2,
    Settings, LogOut, ChevronRight, ChevronDown,
    Menu, X, Building2, PiggyBank, TrendingUp, BookMarked, Target,
    Lock, Zap, Shield, ArrowLeft,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { cn } from '../lib/utils'

const ADMIN_EMAILS = ['admin@billenniumsystem.com', 'billenniumsystem@gmail.com', 'admin@billennium.com']

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
            'flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-200 group',
            sub ? 'pl-8 py-2' : '',
            active
                ? 'bg-primary-50 text-primary-700 font-medium'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        )}
    >
        <Icon className={cn(
            'shrink-0',
            sub ? 'w-4 h-4' : 'w-5 h-5',
            active ? 'text-primary-600' : 'text-slate-400 group-hover:text-slate-600'
        )} />
        <span className={sub ? 'text-sm' : ''}>{label}</span>
        {active && !sub && <ChevronRight className="w-4 h-4 ml-auto" />}
    </Link>
)

interface NavGroup {
    type: 'group'
    icon: React.ElementType
    label: string
    children: { to: string; label: string; icon: React.ElementType }[]
}
interface NavLink {
    type?: 'link'
    to: string
    icon: React.ElementType
    label: string
}
type NavItem = NavLink | NavGroup

const navigation: NavItem[] = [
    { to: '/dashboard',     icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/plan-cuentas',  icon: BookOpen,        label: 'Plan de Cuentas' },
    { to: '/comprobantes',  icon: FileText,        label: 'Diarios' },
    {
        type: 'group',
        icon: BarChart2,
        label: 'Reportes',
        children: [
            { to: '/reportes/balance-comprobacion', label: 'Balance de Comprobación', icon: BarChart2 },
            { to: '/reportes/balance-general',      label: 'Estado de Situación Financiera', icon: TrendingUp },
            { to: '/reportes/estado-resultados',    label: 'Estado de Resultados',    icon: PiggyBank },
            { to: '/reportes/estado-cuenta',          label: 'Estado de Cuenta',        icon: BookMarked },
            { to: '/reportes/real-vs-presupuesto',   label: 'Real vs Presupuesto',     icon: Target },
        ],
    },
    { to: '/presupuesto',      icon: Target,  label: 'Presupuesto' },
    { to: '/cierre-contable',  icon: Lock,    label: 'Cierre Contable' },
    { to: '/integracion-qi',           icon: Zap,          label: 'Integración QI' },
    { to: '/integracion-sri',          icon: FileText,     label: 'Integración SRI' },
    { to: '/integracion-excel-ventas', icon: BookMarked,   label: 'Excel Ventas' },
    { to: '/configuracion',    icon: Settings, label: 'Configuración' },
]

export function Layout({ children }: { children: React.ReactNode }) {
    const { empresaActiva, empresas, setEmpresaActiva, signOut, user } = useAuth()
    const isAdmin = user?.email ? ADMIN_EMAILS.includes(user.email) : false
    const location = useLocation()
    const [isSidebarOpen, setIsSidebarOpen] = React.useState(true)
    const [openGroups, setOpenGroups] = React.useState<string[]>(['Reportes'])
    const [showEmpresaMenu, setShowEmpresaMenu] = React.useState(false)

    const toggleGroup = (label: string) =>
        setOpenGroups(prev => prev.includes(label) ? prev.filter(g => g !== label) : [...prev, label])

    return (
        <div className="min-h-screen bg-slate-50 flex">
            {/* Sidebar */}
            <aside className={cn(
                'bg-white border-r border-slate-200 transition-all duration-300 z-30 fixed inset-y-0 left-0 flex flex-col',
                isSidebarOpen ? 'w-64' : 'w-0 overflow-hidden'
            )}>
                {/* Logo */}
                <div className="p-6 flex items-center gap-3 border-b border-slate-100 shrink-0">
                    <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                        LP
                    </div>
                    <span className="text-xl font-bold bg-gradient-to-r from-primary-600 to-primary-800 bg-clip-text text-transparent whitespace-nowrap">
                        Ledger Pro
                    </span>
                </div>

                {/* Empresa selector */}
                {empresas.length > 1 && (
                    <div className="px-4 py-3 border-b border-slate-100 shrink-0 relative">
                        <button
                            onClick={() => setShowEmpresaMenu(v => !v)}
                            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-left"
                        >
                            <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                            <span className="text-sm font-medium text-slate-700 truncate flex-1">
                                {empresaActiva?.nombre ?? 'Seleccionar empresa'}
                            </span>
                            <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform', showEmpresaMenu && 'rotate-180')} />
                        </button>
                        {showEmpresaMenu && (
                            <div className="absolute left-4 right-4 top-full mt-1 bg-white rounded-lg border border-slate-200 shadow-lg z-50">
                                {empresas.map(e => (
                                    <button
                                        key={e.id}
                                        onClick={() => { setEmpresaActiva(e); setShowEmpresaMenu(false) }}
                                        className={cn(
                                            'w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 first:rounded-t-lg last:rounded-b-lg',
                                            e.id === empresaActiva?.id ? 'font-medium text-primary-700 bg-primary-50' : 'text-slate-700'
                                        )}
                                    >
                                        {e.nombre}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Nav */}
                <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                    {navigation.map((item) => {
                        if ((item as NavGroup).type === 'group') {
                            const group = item as NavGroup
                            const isOpen = openGroups.includes(group.label)
                            const anyActive = group.children.some(c => location.pathname.startsWith(c.to))
                            return (
                                <div key={group.label}>
                                    <button
                                        onClick={() => toggleGroup(group.label)}
                                        className={cn(
                                            'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all group',
                                            anyActive ? 'bg-primary-50 text-primary-700 font-medium' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                        )}
                                    >
                                        <group.icon className={cn('w-5 h-5 shrink-0', anyActive ? 'text-primary-600' : 'text-slate-400 group-hover:text-slate-600')} />
                                        <span className="flex-1 text-left">{group.label}</span>
                                        <ChevronDown className={cn('w-4 h-4 transition-transform', isOpen && 'rotate-180')} />
                                    </button>
                                    {isOpen && (
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
                                key={link.to}
                                to={link.to}
                                icon={link.icon}
                                label={link.label}
                                active={location.pathname === link.to}
                            />
                        )
                    })}
                </nav>

                {/* Footer */}
                <div className="p-4 border-t border-slate-100 shrink-0 space-y-1">
                    {isAdmin && (
                        <SidebarItem
                            to="/admin"
                            icon={Shield}
                            label="Administración"
                            active={location.pathname === '/admin'}
                        />
                    )}
                    {isAdmin ? (
                        <a
                            href={import.meta.env.VITE_PORTAL_URL || 'https://websitebillennium-k4qc-ernesteguezs-projects.vercel.app'}
                            className="flex items-center gap-3 w-full px-4 py-3 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors text-sm font-medium"
                        >
                            <ArrowLeft className="w-5 h-5" />
                            <span>Volver al Portal</span>
                        </a>
                    ) : (
                        <button
                            onClick={signOut}
                            className="flex items-center gap-3 w-full px-4 py-3 text-slate-600 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors group"
                        >
                            <LogOut className="w-5 h-5 text-slate-400 group-hover:text-red-500" />
                            <span>Cerrar Sesión</span>
                        </button>
                    )}
                </div>
            </aside>

            {/* Main */}
            <main className={cn('flex-1 transition-all duration-300', isSidebarOpen ? 'ml-64' : 'ml-0')}>
                {/* Topbar */}
                <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-20">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setIsSidebarOpen(v => !v)}
                            className="p-2 hover:bg-slate-100 rounded-md text-slate-600"
                        >
                            {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                        </button>
                        <div className="h-6 w-px bg-slate-200" />
                        <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-slate-400" />
                            <span className="text-sm font-bold text-slate-700">
                                {empresaActiva?.nombre ?? '—'}
                            </span>
                            {empresaActiva?.moneda && (
                                <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full font-medium">
                                    {empresaActiva.moneda.codigo}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400 font-medium uppercase tracking-widest">
                        Powered by Billennium
                    </div>
                </header>

                <div className="p-6 max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    )
}
