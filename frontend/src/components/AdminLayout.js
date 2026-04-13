import { useState } from 'react';
import { Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  LayoutDashboard, 
  Users, 
  CreditCard, 
  MessageSquare, 
  Menu, 
  X, 
  LogOut,
  Home,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';

const LOGO_URL = "https://customer-assets.emergentagent.com/job_04fdc029-61d0-4460-bdef-63f93c1202df/artifacts/3p4r9si5_billennium.jpg";

const sidebarLinks = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/suscripciones', label: 'Suscripciones', icon: CreditCard },
  { href: '/admin/usuarios', label: 'Usuarios', icon: Users },
  { href: '/admin/mensajes', label: 'Mensajes', icon: MessageSquare },
];

export const AdminLayout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <Navigate to="/login" replace />;
  }

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200 h-16">
        <div className="flex items-center justify-between h-full px-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 -ml-2"
              data-testid="admin-mobile-menu-btn"
            >
              {sidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
            <img src={LOGO_URL} alt="Billennium" className="h-8 w-8 rounded-full" />
            <span className="font-semibold text-slate-900">Admin</span>
          </div>
          <Link to="/" className="text-slate-600 hover:text-slate-900">
            <Home className="h-5 w-5" />
          </Link>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 transform transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="h-16 flex items-center gap-3 px-6 border-b border-slate-800">
            <img src={LOGO_URL} alt="Billennium" className="h-10 w-10 rounded-full" />
            <div>
              <p className="font-semibold text-white">Billennium</p>
              <p className="text-xs text-slate-400">Panel Admin</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 py-6 px-4 space-y-1">
            {sidebarLinks.map((link) => {
              const Icon = link.icon;
              const isActive = location.pathname === link.href;
              return (
                <Link
                  key={link.href}
                  to={link.href}
                  onClick={() => setSidebarOpen(false)}
                  data-testid={`admin-nav-${link.label.toLowerCase()}`}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{link.label}</span>
                  {isActive && <ChevronRight className="h-4 w-4 ml-auto" />}
                </Link>
              );
            })}
          </nav>

          {/* User Info & Actions */}
          <div className="p-4 border-t border-slate-800">
            <div className="px-4 py-3 mb-2">
              <p className="text-white font-medium truncate">{user.name}</p>
              <p className="text-slate-400 text-sm truncate">{user.email}</p>
            </div>
            <Link
              to="/"
              className="flex items-center gap-3 px-4 py-2 text-slate-400 hover:text-white transition-colors"
            >
              <Home className="h-5 w-5" />
              <span>Ir al Sitio</span>
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-2 text-red-400 hover:text-red-300 transition-colors w-full"
              data-testid="admin-logout-btn"
            >
              <LogOut className="h-5 w-5" />
              <span>Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden fixed inset-0 z-30 bg-black/50"
          />
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="lg:ml-64 min-h-screen pt-16 lg:pt-0">
        <div className="p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
