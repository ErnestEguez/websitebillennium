import { useState, useEffect } from 'react';
import { FileText, Plus, List, RefreshCw, Package, LogOut, User, BarChart3 } from 'lucide-react';
import { ProformaForm } from './components/ProformaForm';
import { DocumentosList } from './components/DocumentosList';
import { ArticulosManager } from './components/ArticulosManager';
import { Dashboard } from './components/Dashboard';
import { Login } from './components/Login';
import { AdminPanel } from './components/AdminPanel';
import { OficinaDashboard } from './components/OficinaDashboard';
import { ChatBubble } from './components/ChatBubble';
import { useAuth } from './contexts/AuthContext';
import { supabase } from './lib/supabase';
import type { ProformaCompleta, PedidoCompleto, Empresa } from './lib/supabase';

type Vista = 'nueva-proforma' | 'nueva-pedido' | 'documentos' | 'dashboard' | 'articulos';

function App() {
  const { user, vendedor, loading, signOut } = useAuth();
  const [vistaActual, setVistaActual] = useState<Vista>('nueva-proforma');
  const [refrescarListado, setRefrescarListado] = useState(0);
  const [proformaEditando, setProformaEditando] = useState<ProformaCompleta | null>(null);
  const [empresa, setEmpresa] = useState<Empresa | null>(null);

  useEffect(() => {
    if (vendedor?.empresa_id) {
      cargarEmpresa();
    }
  }, [vendedor]);

  const cargarEmpresa = async () => {
    if (!vendedor?.empresa_id) return;
    const { data } = await supabase
      .from('empresas')
      .select('*')
      .eq('id', vendedor.empresa_id)
      .maybeSingle();
    if (data) setEmpresa(data);
  };

  const handleProformaCreada = () => {
    setProformaEditando(null);
    setVistaActual('documentos');
    setRefrescarListado(prev => prev + 1);
  };

  const handleEditarDocumento = (documento: ProformaCompleta | PedidoCompleto, tipoDoc: 'proforma' | 'pedido') => {
    setProformaEditando(documento as ProformaCompleta);
    setVistaActual(tipoDoc === 'pedido' ? 'nueva-pedido' : 'nueva-proforma');
  };

  const [signedOut, setSignedOut] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    setSignedOut(true);
    setTimeout(() => window.close(), 1200);
  };

  // Pantalla de cierre de sesión — intenta cerrar la pestaña
  if (signedOut) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 text-lg">Sesión cerrada.</p>
          <p className="text-gray-500 text-sm mt-2">Puedes cerrar esta pestaña.</p>
          <button
            onClick={() => window.close()}
            className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            Cerrar pestaña
          </button>
        </div>
      </div>
    );
  }

  // Detectar si hay un magic link en la URL (token SSO del Portal)
  const hasMagicLinkToken = window.location.hash.includes('access_token') ||
    window.location.hash.includes('type=magiclink') ||
    new URLSearchParams(window.location.search).get('token_hash') !== null;

  if (loading || hasMagicLinkToken) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Iniciando sesión desde el Portal...</p>
        </div>
      </div>
    );
  }

  if (!user || !vendedor) {
    return <Login key="login-component" onLoginSuccess={() => { }} />;
  }

  if (vendedor.is_office) {
    return (
      <div className="min-h-screen bg-gray-100 p-4 sm:p-8">
        <OficinaDashboard />
      </div>
    );
  }

  if (vendedor.is_admin) {
    return <AdminPanel />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-3">
              <img
                src="/logo-billennium.png"
                alt="Billennium System"
                className="h-12 w-12 rounded-lg"
              />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Billennium System</h1>
                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    <User className="h-4 w-4 text-gray-600" />
                    <span className="text-sm text-gray-700">{vendedor?.email || user.email}</span>
                  </div>
                  <span className="text-sm text-gray-400">|</span>
                  <span className="text-sm text-gray-600">{vendedor?.nombre}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleSignOut}
                className="flex items-center px-3 py-2 rounded-lg font-medium bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                title="Cerrar sesión"
              >
                <LogOut className="h-5 w-5" />
              </button>
              {empresa?.habilitar_proformas && (
                <button
                  onClick={() => setVistaActual('nueva-proforma')}
                  className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${vistaActual === 'nueva-proforma'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  <Plus className="h-5 w-5 mr-2" />
                  Nueva Proforma
                </button>
              )}
              {empresa?.habilitar_pedidos && (
                <button
                  onClick={() => setVistaActual('nueva-pedido')}
                  className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${vistaActual === 'nueva-pedido'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  <Plus className="h-5 w-5 mr-2" />
                  Nuevo Pedido
                </button>
              )}
              <button
                onClick={() => {
                  setVistaActual('documentos');
                  setRefrescarListado(prev => prev + 1);
                }}
                className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${vistaActual === 'documentos'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
              >
                <List className="h-5 w-5 mr-2" />
                Ver Documentos
              </button>
              <button
                onClick={() => setVistaActual('dashboard')}
                className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${vistaActual === 'dashboard'
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                title="Dashboard"
              >
                <BarChart3 className="h-5 w-5" />
              </button>
              <button
                onClick={() => setVistaActual('articulos')}
                className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${vistaActual === 'articulos'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                title="Artículos"
              >
                <Package className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {vistaActual === 'articulos' ? (
          <ArticulosManager />
        ) : vistaActual === 'dashboard' ? (
          <Dashboard />
        ) : vistaActual === 'nueva-proforma' || vistaActual === 'nueva-pedido' ? (
          <ProformaForm
            tipoDocumento={vistaActual === 'nueva-proforma' ? 'proforma' : 'pedido'}
            onProformaCreada={handleProformaCreada}
            proformaEditando={proformaEditando}
            onCancelarEdicion={() => {
              setProformaEditando(null);
              setVistaActual('documentos');
            }}
          />
        ) : (
          <div className="space-y-6">
            <DocumentosList
              key={`proforma-${refrescarListado}`}
              tipoDocumento="proforma"
              onEditarDocumento={handleEditarDocumento}
              onRefresh={() => setRefrescarListado(prev => prev + 1)}
            />
            <DocumentosList
              key={`pedido-${refrescarListado}`}
              tipoDocumento="pedido"
              onEditarDocumento={handleEditarDocumento}
              onRefresh={() => setRefrescarListado(prev => prev + 1)}
            />
          </div>
        )}
      </div>

      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-center text-sm text-gray-600">
            <RefreshCw className="h-4 w-4 mr-2" />
            Sistema conectado a la nube
          </div>
        </div>
      </footer>
      <ChatBubble />
    </div>
  );
}

export default App;
