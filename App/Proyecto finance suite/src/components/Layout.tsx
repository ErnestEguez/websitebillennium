import React from 'react'
import { Link, useLocation, Navigate } from 'react-router-dom'
import {
    LayoutDashboard, Landmark, CreditCard, FileText,
    CheckSquare, ArrowDownUp, ArrowRightLeft,
    BarChart2, Settings, Menu, X, ChevronDown,
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
    { to: '/',                  icon: LayoutDashboard, label: 'Dashboard'          },
    { to: '/bancos',            icon: Landmark,        label: 'Bancos'             },
    { to: '/cuentas-bancarias', icon: CreditCard,      label: 'Cuentas Bancarias'  },
    {
        type: 'group', icon: FileText, label: 'Pagos',
        children: [
            { to: '/egresos',        label: 'Comprobantes de Egreso', icon: FileText       },
            { to: '/egresos/nuevo',  label: 'Nuevo Egreso',           icon: FileText       },
            { to: '/anticipos',      label: 'Anticipos Proveedores',  icon: ArrowRightLeft },
        ],
    },
    { to: '/cheques',           icon: CheckSquare,     label: 'Cheques'            },
    { to: '/cheques/a-fecha',   icon: CheckSquare,     label: 'Cheques a Fecha'    },
    { to: '/movimientos',       icon: ArrowDownUp,     label: 'Movimientos Banc.'  },
    { to: '/conciliacion',      icon: BarChart2,       label: 'Conciliación Banc.' },
    {
        type: 'group', icon: BarChart2, label: 'Reportes',
        children: [
            { to: '/reportes/estado-cuenta', label: 'Estado de Cuenta',      icon: BarChart2 },
            { to: '/reportes/movimientos',   label: 'Movimientos por Período',icon: ArrowDownUp },
            { to: '/reportes/cheques-fecha', label: 'Cheques a Fecha',        icon: CheckSquare },
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
        </Link>
    )
}

const PORTAL_URL = import.meta.env.VITE_PORTAL_URL || 'https://websitebillennium-k4qc-ernesteguezs-projects.vercel.app'

function closeApp() {
    window.close()
    setTimeout(() => { window.location.replace(PORTAL_URL) }, 300)
}

export function Layout({ children }: { children: React.ReactNode }) {
    const { empresa, profile } = useAuth()
    const location  = useLocation()
    const [sidebarOpen, setSidebarOpen] = React.useState(true)
    const [openGroups, setOpenGroups]   = React.useState<string[]>(['Pagos'])

    const isAdmin = profile !== null && profile.rol === 'admin_plataforma'

    if (isAdmin && location.pathname !== '/configuracion') {
        return <Navigate to="/configuracion" replace />
    }

    const navigation = isAdmin ? NAV_ADMIN : NAV_USER

    const toggleGroup = (label: string) =>
        setOpenGroups(prev => prev.includes(label) ? prev.filter(g => g !== label) : [...prev, label])

    const displayName    = profile?.nombre || profile?.email?.split('@')[0] || '—'
    const displayInitial = (profile?.nombre || profile?.email || 'U')[0].toUpperCase()
    const rolLabel       = profile?.rol?.replace('_', ' ') ?? ''

    return (
        <div className="min-h-screen bg-slate-50 flex">
            {/* Sidebar */}
            <aside className={cn(
                'bg-white border-r border-slate-200 transition-all duration-300 z-30 fixed inset-y-0 left-0 flex flex-col',
                sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'
            )}>
                {/* Logo */}
                <div className="p-5 flex items-center gap-3 border-b border-slate-100 shrink-0">
                    <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0">
                        FS
                    </div>
                    <div>
                        <span className="text-base font-bold text-primary-700 whitespace-nowrap">Finance Suite</span>
                        {isAdmin && (
                            <span className="block text-[10px] font-black text-primary-500 uppercase tracking-widest">
                                — Admin —
                            </span>
                        )}
                    </div>
                </div>

                {/* Nav */}
                <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                    {navigation.map(item => {
                        if ((item as NavGroup).type === 'group') {
                            const g = item as NavGroup
                            const isOpen = openGroups.includes(g.label)
                            const anyActive = g.children.some(c => location.pathname === c.to)
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
                <div className="p-4 border-t border-slate-100 space-y-2 shrink-0">
                    <div className="flex items-center gap-2 px-2 py-1">
                        <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-xs shrink-0">
                            {displayInitial}
                        </div>
                        <div className="overflow-hidden min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate">{displayName}</p>
                            <p className="text-[10px] text-slate-400 uppercase font-bold truncate">{rolLabel}</p>
                        </div>
                    </div>
                    <button
                        onClick={closeApp}
                        className="flex items-center gap-2 w-full px-3 py-2 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors text-sm"
                    >
                        <X className="w-4 h-4" />
                        Cerrar
                    </button>
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
                        <span className="text-sm font-bold text-slate-700">{empresa?.nombre ?? '—'}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        {isAdmin && (
                            <span className="text-xs font-black text-primary-600 bg-primary-50 px-3 py-1 rounded-full uppercase tracking-widest">
                                Admin
                            </span>
                        )}
                        <div className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-sm">
                            {displayInitial}
                        </div>
                        <span className="text-sm font-semibold text-slate-700">{displayName}</span>
                    </div>
                </header>

                <div className="p-6 max-w-7xl mx-auto">{children}</div>
            </main>
        </div>
    )
}
