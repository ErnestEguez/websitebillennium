import React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
    ShoppingCart, Truck, LayoutDashboard, LogOut, ArrowLeft,
    ChevronRight, ChevronDown, Menu, X,
    Building2, Package, Wrench, FileText, Wallet, BarChart2, Receipt, Settings,
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { cn } from '../lib/utils'

interface NavLink { type?: 'link'; to: string; icon: React.ElementType; label: string }
interface NavGroup {
    type: 'group'; icon: React.ElementType; label: string
    children: { to: string; label: string; icon: React.ElementType }[]
}
type NavItem = NavLink | NavGroup

const NAV_USER: NavItem[] = [
    { to: '/',          icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/proveedores', icon: Truck,          label: 'Proveedores' },
    {
        type: 'group', icon: ShoppingCart, label: 'Compras',
        children: [
            { to: '/compras',                  label: 'Lista de Compras',    icon: FileText  },
            { to: '/compras/nueva-inventario', label: 'Nueva — Inventario',  icon: Package   },
            { to: '/compras/nueva-servicio',   label: 'Nueva — Servicio',    icon: Wrench    },
        ],
    },
    { to: '/cxp',                    icon: Wallet,   label: 'Cuentas por Pagar'      },
    { to: '/comprobantes-retencion', icon: Receipt,  label: 'Comprobantes Retención'  },
    {
        type: 'group', icon: BarChart2, label: 'Reportes',
        children: [
            { to: '/reportes/compras',       label: 'Compras por período',    icon: FileText  },
            { to: '/reportes/cxp',           label: 'Consulta CxP',           icon: Wallet    },
            { to: '/reportes/estado-cuenta', label: 'Estado de cuenta prov.', icon: BarChart2 },
        ],
    },
]

const NAV_ADMIN: NavItem[] = [
    { to: '/configuracion', icon: Settings, label: 'Configuración' },
]

function SidebarItem({ to, icon: Icon, label, active, sub }: {
    to: string; icon: React.ElementType; label: string; active?: boolean; sub?: boolean
}) {
    return (
        <Link to={to} className={cn(
            'flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all group',
            sub ? 'pl-8 py-2' : '',
            active
                ? 'bg-primary-50 text-primary-700 font-medium'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        )}>
            <Icon className={cn('shrink-0', sub ? 'w-4 h-4' : 'w-5 h-5',
                active ? 'text-primary-600' : 'text-slate-400 group-hover:text-slate-600')} />
            <span className={sub ? 'text-sm' : ''}>{label}</span>
            {active && !sub && <ChevronRight className="w-4 h-4 ml-auto" />}
        </Link>
    )
}

export function Layout({ children }: { children: React.ReactNode }) {
    const { empresa, profile, signOut } = useAuth()
    const location  = useLocation()
    const navigate  = useNavigate()
    const [sidebarOpen, setSidebarOpen] = React.useState(true)
    const [openGroups, setOpenGroups]   = React.useState<string[]>(['Compras'])

    const isAdmin = profile?.rol === 'admin_plataforma'
    const PORTAL_URL = import.meta.env.VITE_PORTAL_URL || 'https://websitebillennium-k4qc-ernesteguezs-projects.vercel.app'

    // Admin: redirect to /configuracion if not already there
    React.useEffect(() => {
        if (isAdmin && location.pathname !== '/configuracion') {
            navigate('/configuracion', { replace: true })
        }
    }, [isAdmin, location.pathname])

    const navigation = isAdmin ? NAV_ADMIN : NAV_USER

    const toggleGroup = (label: string) =>
        setOpenGroups(prev => prev.includes(label) ? prev.filter(g => g !== label) : [...prev, label])

    // Display name: nombre → email → first part of user id
    const displayName = profile?.nombre || profile?.email?.split('@')[0] || 'Usuario'
    const displayInitial = displayName[0]?.toUpperCase() ?? 'U'

    return (
        <div className="min-h-screen bg-slate-50 flex">
            {/* Sidebar */}
            <aside className={cn(
                'bg-white border-r border-slate-200 transition-all duration-300 z-30 fixed inset-y-0 left-0 flex flex-col',
                sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'
            )}>
                {/* Logo */}
                <div className="p-6 flex items-center gap-3 border-b border-slate-100 shrink-0">
                    <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                        GC
                    </div>
                    <div>
                        <span className="text-lg font-bold bg-gradient-to-r from-primary-600 to-primary-800 bg-clip-text text-transparent whitespace-nowrap">
                            Gestión Compras
                        </span>
                        {isAdmin && (
                            <span className="block text-[10px] font-black text-primary-500 uppercase tracking-widest">Admin</span>
                        )}
                    </div>
                </div>

                {/* Nav */}
                <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                    {navigation.map(item => {
                        if ((item as NavGroup).type === 'group') {
                            const g = item as NavGroup
                            const isOpen = openGroups.includes(g.label)
                            const anyActive = g.children.some(c => location.pathname.startsWith(c.to) && c.to !== '/')
                            return (
                                <div key={g.label}>
                                    <button onClick={() => toggleGroup(g.label)}
                                        className={cn('w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all group',
                                            anyActive ? 'bg-primary-50 text-primary-700 font-medium' : 'text-slate-600 hover:bg-slate-100')}>
                                        <g.icon className={cn('w-5 h-5 shrink-0', anyActive ? 'text-primary-600' : 'text-slate-400 group-hover:text-slate-600')} />
                                        <span className="flex-1 text-left">{g.label}</span>
                                        <ChevronDown className={cn('w-4 h-4 transition-transform', isOpen && 'rotate-180')} />
                                    </button>
                                    {isOpen && (
                                        <div className="mt-1 space-y-0.5">
                                            {g.children.map(c => (
                                                <SidebarItem key={c.to} to={c.to} icon={c.icon} label={c.label}
                                                    active={location.pathname === c.to} sub />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )
                        }
                        const l = item as NavLink
                        return (
                            <SidebarItem key={l.to} to={l.to} icon={l.icon} label={l.label}
                                active={location.pathname === l.to} />
                        )
                    })}
                </nav>

                {/* Footer */}
                <div className="p-4 border-t border-slate-100 space-y-1 shrink-0">
                    {/* User info */}
                    <div className="flex items-center gap-2 px-3 py-2 mb-1">
                        <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-xs shrink-0">
                            {displayInitial}
                        </div>
                        <div className="overflow-hidden">
                            <p className="text-xs font-semibold text-slate-700 truncate">{displayName}</p>
                            <p className="text-[10px] text-slate-400 uppercase font-bold">{profile?.rol?.replace('_', ' ')}</p>
                        </div>
                    </div>

                    {isAdmin ? (
                        /* Admin: navigate back to Portal without signing out */
                        <a href={PORTAL_URL}
                            className="flex items-center gap-3 w-full px-4 py-2.5 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors group text-sm font-medium">
                            <ArrowLeft className="w-4 h-4" />
                            <span>Volver al Portal</span>
                        </a>
                    ) : (
                        <button onClick={signOut}
                            className="flex items-center gap-3 w-full px-4 py-2.5 text-slate-600 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors group">
                            <LogOut className="w-5 h-5 text-slate-400 group-hover:text-red-500" />
                            <span className="text-sm">Cerrar Sesión</span>
                        </button>
                    )}
                </div>
            </aside>

            {/* Main */}
            <main className={cn('flex-1 transition-all duration-300', sidebarOpen ? 'ml-64' : 'ml-0')}>
                {/* Topbar */}
                <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-20">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setSidebarOpen(v => !v)}
                            className="p-2 hover:bg-slate-100 rounded-md text-slate-600">
                            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                        </button>
                        <div className="h-6 w-px bg-slate-200" />
                        <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-slate-400" />
                            <span className="text-sm font-bold text-slate-700">{empresa?.nombre ?? '—'}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {isAdmin && (
                            <span className="text-xs font-black text-primary-600 bg-primary-50 px-3 py-1 rounded-full uppercase tracking-widest">
                                Admin
                            </span>
                        )}
                        <span className="text-xs text-slate-400 font-medium uppercase tracking-widest hidden md:block">
                            Powered by Billennium
                        </span>
                        <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-sm">
                            {displayInitial}
                        </div>
                        <span className="text-sm font-medium text-slate-700 hidden md:block">{displayName}</span>
                    </div>
                </header>

                <div className="p-6 max-w-7xl mx-auto">{children}</div>
            </main>
        </div>
    )
}
