import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Package,
  Ship,
  Calculator,
  LogOut,
  Menu,
  X,
  Users,
  ShieldAlert,
  Receipt,
  RefreshCw
} from 'lucide-react';
import { supabase } from './lib/supabase';
import Dashboard from './components/Dashboard';
import ImportList from './components/ImportList';
import LiquidationView from './components/LiquidationView';
import ProductList from './components/ProductList';
import CurrencyList from './components/CurrencyList';
import SupplierList from './components/SupplierList';
import ExpenseList from './components/ExpenseList';
import Login from './components/Login';
import SuperAdminPanel from './components/SuperAdminPanel';

const SUPERADMIN_EMAIL = 'admin@billennium.com';

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        // Token inválido (resto del proyecto Supabase anterior) — limpiar y pedir login
        supabase.auth.signOut();
        setSession(null);
      } else {
        setSession(session);
      }
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
  };

  const handleMockLogin = (mockUser: any) => {
    setSession({ user: mockUser });
  };

  // Detectar si hay un magic link en la URL (token SSO del Portal)
  const hasMagicLinkToken =
    window.location.hash.includes('access_token') ||
    window.location.hash.includes('type=magiclink') ||
    new URLSearchParams(window.location.search).get('token_hash') !== null;

  if (loading || hasMagicLinkToken) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600 text-lg">Iniciando sesión desde el Portal...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <Login onLogin={handleMockLogin} />;
  }

  const userEmail = session.user?.email;
  const isSuperAdmin = session.user?.role === 'SUPERADMIN' || userEmail === SUPERADMIN_EMAIL;

  const navItems = isSuperAdmin ? [
    { id: 'superadmin', icon: ShieldAlert, label: 'Panel SuperAdmin' },
  ] : [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'imports', icon: Ship, label: 'Importaciones' },
    { id: 'liquidacion', icon: Calculator, label: 'Liquidación' },
    { id: 'products', icon: Package, label: 'Productos' },
    { id: 'suppliers', icon: Users, label: 'Proveedores' },
    { id: 'currencies', icon: Calculator, label: 'Monedas' },
    { id: 'expenses', icon: Receipt, label: 'Gastos' },
  ];

  const renderContent = () => {
    if (isSuperAdmin) return <SuperAdminPanel />;

    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'imports': return <ImportList />;
      case 'liquidacion': return <LiquidationView />;
      case 'products': return <ProductList />;
      case 'suppliers': return <SupplierList />;
      case 'currencies': return <CurrencyList />;
      case 'expenses': return <ExpenseList />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className={`bg-slate-900 text-white transition-all duration-300 ${isSidebarOpen ? 'w-64' : 'w-20'} flex flex-col`}>
        <div className="p-4 flex items-center justify-between border-b border-slate-700">
          {isSidebarOpen && <span className="font-bold text-xl tracking-tight text-blue-400">ImportCloud</span>}
          <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="p-1 hover:bg-slate-800 rounded">
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 mt-4">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center p-4 transition-colors ${activeTab === item.id ? 'bg-blue-600' : 'hover:bg-slate-800'}`}
            >
              <item.icon size={20} className={isSidebarOpen ? 'mr-3' : 'mx-auto'} />
              {isSidebarOpen && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-700">
          <div className={`flex items-center ${isSidebarOpen ? '' : 'justify-center'}`}>
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-xs font-bold">
              {userEmail ? userEmail.substring(0, 2).toUpperCase() : 'US'}
            </div>
            {isSidebarOpen && (
              <div className="ml-3 overflow-hidden">
                <p className="text-sm font-medium truncate">{userEmail}</p>
                <p className="text-xs text-slate-400">{isSuperAdmin ? 'SuperAdmin' : 'Empresa'}</p>
              </div>
            )}
          </div>
          <button onClick={handleLogout} className="w-full mt-4 flex items-center text-slate-400 hover:text-white transition-colors">
            <LogOut size={18} className={isSidebarOpen ? 'mr-2' : 'mx-auto'} />
            {isSidebarOpen && <span>Cerrar Sesión</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <header className="bg-white border-b px-8 py-4 flex justify-between items-center sticky top-0 z-10">
          <h1 className="text-2xl font-bold text-slate-800">{navItems.find((item) => item.id === activeTab)?.label || activeTab}</h1>
          <div className="flex gap-4">
            <div className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">Plan PRO</div>
          </div>
        </header>

        <div className="p-8">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}
