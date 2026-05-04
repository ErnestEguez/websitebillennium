import { useState } from 'react';
import { Building2, Users, LogOut, Settings, UserCheck, FileText, Database, Package, ShoppingCart } from 'lucide-react';
import { EmpresaConfig } from './EmpresaConfig';
import { VendedorManager } from './VendedorManager';
import { ClienteManager } from './ClienteManager';
import { ProformaManager } from './ProformaManager';
import { PedidoManager } from './PedidoManager';
import { ArticulosManager } from './ArticulosManager';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

type AdminView = 'empresas' | 'vendedores' | 'clientes' | 'proformas' | 'pedidos' | 'articulos' | 'respaldo';

export function AdminPanel() {
  const { vendedor, signOut } = useAuth();
  const [currentView, setCurrentView] = useState<AdminView>('empresas');
  const [vaciandoArticulos, setVaciandoArticulos] = useState(false);

  const handleSignOut = async () => {
    await signOut();
  };

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
                <h1 className="text-2xl font-bold text-gray-900">Panel de Administración</h1>
                <p className="text-sm text-gray-600">{vendedor?.nombre || 'Administrador'}</p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleSignOut}
                className="flex items-center px-4 py-2 rounded-lg font-medium bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                title="Cerrar sesión"
              >
                <LogOut className="h-5 w-5 mr-2" />
                Salir
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-xl shadow-sm mb-6">
          <div className="flex border-b border-gray-200 overflow-x-auto">
            <button
              onClick={() => setCurrentView('empresas')}
              className={`flex items-center px-6 py-4 font-medium transition-colors whitespace-nowrap ${currentView === 'empresas'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              <Building2 className="h-5 w-5 mr-2" />
              Empresas
            </button>
            <button
              onClick={() => setCurrentView('vendedores')}
              className={`flex items-center px-6 py-4 font-medium transition-colors whitespace-nowrap ${currentView === 'vendedores'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              <Users className="h-5 w-5 mr-2" />
              Vendedores
            </button>
            <button
              onClick={() => setCurrentView('clientes')}
              className={`flex items-center px-6 py-4 font-medium transition-colors whitespace-nowrap ${currentView === 'clientes'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              <UserCheck className="h-5 w-5 mr-2" />
              Clientes
            </button>
            <button
              onClick={() => setCurrentView('proformas')}
              className={`flex items-center px-6 py-4 font-medium transition-colors whitespace-nowrap ${currentView === 'proformas'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              <FileText className="h-5 w-5 mr-2" />
              Proformas
            </button>
            <button
              onClick={() => setCurrentView('pedidos')}
              className={`flex items-center px-6 py-4 font-medium transition-colors whitespace-nowrap ${currentView === 'pedidos'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              <ShoppingCart className="h-5 w-5 mr-2" />
              Pedidos
            </button>
            <button
              onClick={() => setCurrentView('articulos')}
              className={`flex items-center px-6 py-4 font-medium transition-colors whitespace-nowrap ${currentView === 'articulos'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              <Package className="h-5 w-5 mr-2" />
              Artículos
            </button>
            <button
              onClick={() => setCurrentView('respaldo')}
              className={`flex items-center px-6 py-4 font-medium transition-colors whitespace-nowrap ${currentView === 'respaldo'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
                }`}
            >
              <Database className="h-5 w-5 mr-2" />
              Respaldo
            </button>
          </div>
        </div>

        {currentView === 'empresas' && <EmpresaConfig />}
        {currentView === 'vendedores' && <VendedorManager />}
        {currentView === 'clientes' && <ClienteManager />}
        {currentView === 'proformas' && <ProformaManager />}
        {currentView === 'pedidos' && <PedidoManager />}
        {currentView === 'articulos' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Gestión de Artículos</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Administración de artículos sincronizados desde el ERP
                  </p>
                </div>
                <button
                  onClick={async () => {
                    const confirmacion1 = window.confirm(
                      'ADVERTENCIA: Esta acción eliminará TODOS los artículos de la base de datos.\n\n' +
                      'Esta acción NO se puede deshacer.\n\n' +
                      '¿Está seguro de continuar?'
                    );
                    if (!confirmacion1) return;

                    const confirmacion2 = window.confirm(
                      'ÚLTIMA CONFIRMACIÓN:\n\n' +
                      'Confirme nuevamente que desea eliminar TODOS los artículos.\n\n' +
                      '¿Continuar con la eliminación?'
                    );
                    if (!confirmacion2) return;

                    setVaciandoArticulos(true);
                    try {
                      const { error } = await supabase
                        .from('articulos')
                        .delete()
                        .neq('id', '00000000-0000-0000-0000-000000000000');

                      if (error) throw error;

                      alert('Tabla de artículos vaciada exitosamente.\n\nAhora puede sincronizar desde el ERP.');
                      setCurrentView('articulos');
                    } catch (err) {
                      console.error('Error vaciando tabla:', err);
                      alert('Error al vaciar la tabla de artículos: ' + (err as Error).message);
                    } finally {
                      setVaciandoArticulos(false);
                    }
                  }}
                  disabled={vaciandoArticulos}
                  className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Database className="h-4 w-4 mr-2" />
                  {vaciandoArticulos ? 'Vaciando...' : 'Vaciar Tabla de Artículos'}
                </button>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-yellow-800">
                  <strong>Nota:</strong> Use este botón solo antes de sincronizar artículos desde el ERP.
                  Esta acción eliminará todos los artículos actuales.
                </p>
              </div>
            </div>
            <ArticulosManager />
          </div>
        )}
        {currentView === 'respaldo' && (
          <div className="bg-white rounded-xl shadow-sm p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Respaldo de Base de Datos</h2>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
              <div className="flex items-start">
                <Database className="h-6 w-6 text-yellow-600 mr-3 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-yellow-900 mb-2">Información Importante</h3>
                  <p className="text-sm text-yellow-800">
                    El respaldo de la base de datos se realiza automáticamente en Supabase.
                    Esta aplicación usa Supabase como base de datos PostgreSQL en la nube.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Cómo acceder a los respaldos:</h3>

                <ol className="space-y-4 text-gray-700">
                  <li className="flex items-start">
                    <span className="font-semibold text-blue-600 mr-3">1.</span>
                    <div>
                      <p className="font-medium">Acceda al Panel de Supabase</p>
                      <p className="text-sm text-gray-600 mt-1">
                        Vaya a <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://supabase.com/dashboard</a> e inicie sesión
                      </p>
                    </div>
                  </li>

                  <li className="flex items-start">
                    <span className="font-semibold text-blue-600 mr-3">2.</span>
                    <div>
                      <p className="font-medium">Seleccione su Proyecto</p>
                      <p className="text-sm text-gray-600 mt-1">
                        Busque y seleccione el proyecto de su aplicación de proformas
                      </p>
                    </div>
                  </li>

                  <li className="flex items-start">
                    <span className="font-semibold text-blue-600 mr-3">3.</span>
                    <div>
                      <p className="font-medium">Vaya a la sección de Database</p>
                      <p className="text-sm text-gray-600 mt-1">
                        En el menú lateral izquierdo, haga clic en "Database" y luego en "Backups"
                      </p>
                    </div>
                  </li>

                  <li className="flex items-start">
                    <span className="font-semibold text-blue-600 mr-3">4.</span>
                    <div>
                      <p className="font-medium">Crear o Descargar Respaldo</p>
                      <p className="text-sm text-gray-600 mt-1">
                        Puede crear un respaldo manual haciendo clic en "Create Backup" o descargar respaldos automáticos existentes
                      </p>
                    </div>
                  </li>
                </ol>
              </div>

              <div className="border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Cómo restaurar un respaldo:</h3>

                <ol className="space-y-4 text-gray-700">
                  <li className="flex items-start">
                    <span className="font-semibold text-green-600 mr-3">1.</span>
                    <div>
                      <p className="font-medium">En la sección de Backups</p>
                      <p className="text-sm text-gray-600 mt-1">
                        Localice el respaldo que desea restaurar (se muestran por fecha y hora)
                      </p>
                    </div>
                  </li>

                  <li className="flex items-start">
                    <span className="font-semibold text-green-600 mr-3">2.</span>
                    <div>
                      <p className="font-medium">Haga clic en "Restore"</p>
                      <p className="text-sm text-gray-600 mt-1">
                        Confirme la acción. IMPORTANTE: Esto reemplazará todos los datos actuales con los del respaldo
                      </p>
                    </div>
                  </li>

                  <li className="flex items-start">
                    <span className="font-semibold text-green-600 mr-3">3.</span>
                    <div>
                      <p className="font-medium">Espere a que termine el proceso</p>
                      <p className="text-sm text-gray-600 mt-1">
                        La restauración puede tomar varios minutos dependiendo del tamaño de la base de datos
                      </p>
                    </div>
                  </li>
                </ol>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <h3 className="font-semibold text-blue-900 mb-2">Respaldos Automáticos</h3>
                <p className="text-sm text-blue-800">
                  Supabase crea respaldos automáticos diarios de su base de datos. Los planes gratuitos mantienen respaldos por 7 días.
                  Los planes de pago ofrecen retención más prolongada y respaldos point-in-time.
                </p>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                <h3 className="font-semibold text-red-900 mb-2">Advertencia</h3>
                <p className="text-sm text-red-800">
                  Restaurar un respaldo ELIMINARÁ todos los datos actuales y los reemplazará con los datos del respaldo seleccionado.
                  Esta acción NO se puede deshacer. Asegúrese de crear un respaldo actual antes de restaurar uno antiguo.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-center text-sm text-gray-600">
            <Settings className="h-4 w-4 mr-2" />
            Panel de administración del sistema
          </div>
        </div>
      </footer>
    </div>
  );
}
