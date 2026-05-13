import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { OfflineBanner } from './components/OfflineBanner'
import { useOfflineSync } from './hooks/useOfflineSync'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { Dashboard } from './pages/Dashboard'
import { MesaGrid } from './pages/MesaGrid'
import { OrderTake } from './pages/OrderTake'
import { InvoicingPage } from './pages/InvoicingPage'
import { OrdersPage } from './pages/OrdersPage'
import { ProductsPage } from './pages/ProductsPage'
import { ClientsPage } from './pages/ClientsPage'
import { InvoicePrint } from './pages/InvoicePrint'
import { TicketPrint } from './pages/TicketPrint'
import { KitchenOrderPrint } from './pages/KitchenOrderPrint'
import { ConfigurationPage } from './pages/ConfigurationPage'
import { ProveedoresPage } from './pages/ProveedoresPage'
import { InventarioPage } from './pages/InventarioPage'
import { KardexPage } from './pages/KardexPage'
import { CierresPage } from './pages/CierresPage'
import { FacturaDirectaPage } from './pages/FacturaDirectaPage'
import { VendedoresPage } from './pages/VendedoresPage'
import { CarteraCxcPage } from './pages/CarteraCxcPage'
import { ConsultaVentasPage } from './pages/ConsultaVentasPage'
import { ConsultaCarteraClientesPage } from './pages/ConsultaCarteraClientesPage'
import { EstadoCuentaClientePage } from './pages/EstadoCuentaClientePage'
import { AnulacionFacturasPage } from './pages/AnulacionFacturasPage'
import { NotasCreditoPage } from './pages/NotasCreditoPage'
import { NuevaNcPage } from './pages/NuevaNcPage'
import { NcRidePage } from './pages/NcRidePage'
import { DashboardGerencialPage } from './pages/DashboardGerencialPage'
import { ProtectedRoute as RoleProtectedRoute } from './components/ProtectedRoute'

// Monta el sync en background sin afectar el árbol de rutas
function SyncManager() {
  useOfflineSync()
  return null
}

// Componente para proteger rutas (Auth simple)
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  return (
    <div className="min-h-screen flex flex-col">
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      ) : user ? (
        children
      ) : (
        <Navigate to="/login" replace />
      )}
    </div>
  )
}

// Componente para manejar la redirección del Dashboard inicial según rol
function HomeRedirect() {
  const { loading, profile } = useAuth()

  // Oficina va directo al dashboard gerencial como pantalla principal
  if (!loading && profile?.rol === 'oficina') {
    return <Navigate to="/dashboard" replace />
  }

  return (
    <div className="w-full">
      {loading ? (
        <div className="flex items-center justify-center p-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <Dashboard />
      )}
    </div>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <SyncManager />
          <OfflineBanner />
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route path="/" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['oficina', 'admin_plataforma']}>
                  <Layout>
                    <HomeRedirect />
                  </Layout>
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />

            <Route path="/dashboard" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['oficina']}>
                  <Layout>
                    <DashboardGerencialPage />
                  </Layout>
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />

            <Route path="/nueva-factura" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['oficina']}>
                  <Layout>
                    <FacturaDirectaPage />
                  </Layout>
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />

            <Route path="/mesas" element={
              <ProtectedRoute>
                <Layout>
                  <MesaGrid />
                </Layout>
              </ProtectedRoute>
            } />

            <Route path="/mesas/:mesaId/pedido" element={
              <ProtectedRoute>
                <Layout>
                  <OrderTake />
                </Layout>
              </ProtectedRoute>
            } />

            <Route path="/pedidos" element={
              <ProtectedRoute>
                <Layout>
                  <OrdersPage />
                </Layout>
              </ProtectedRoute>
            } />

            <Route path="/productos" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['oficina']}>
                  <Layout>
                    <ProductsPage />
                  </Layout>
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />

            <Route path="/clientes" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['oficina']}>
                  <Layout>
                    <ClientsPage />
                  </Layout>
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />

            <Route path="/facturacion" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['oficina']}>
                  <Layout>
                    <InvoicingPage />
                  </Layout>
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />

            <Route path="/configuracion" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['oficina', 'admin_plataforma']}>
                  <Layout>
                    <ConfigurationPage />
                  </Layout>
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />

            <Route path="/cierres" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['oficina', 'admin_plataforma']}>
                  <Layout>
                    <CierresPage />
                  </Layout>
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />

            <Route path="/proveedores" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['oficina']}>
                  <Layout>
                    <ProveedoresPage />
                  </Layout>
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />

            <Route path="/inventario" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['oficina']}>
                  <Layout>
                    <InventarioPage />
                  </Layout>
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />

            <Route path="/kardex" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['oficina']}>
                  <Layout>
                    <KardexPage />
                  </Layout>
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />

            <Route path="/vendedores" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['oficina']}>
                  <Layout>
                    <VendedoresPage />
                  </Layout>
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />

            <Route path="/cartera-cxc" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['oficina']}>
                  <Layout>
                    <CarteraCxcPage />
                  </Layout>
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />

            <Route path="/comprobante/:id/print" element={
              <ProtectedRoute>
                <InvoicePrint />
              </ProtectedRoute>
            } />

            <Route path="/comprobante/:id/ticket" element={
              <ProtectedRoute>
                <TicketPrint />
              </ProtectedRoute>
            } />

            <Route path="/pedido/:id/kitchen" element={
              <ProtectedRoute>
                <KitchenOrderPrint />
              </ProtectedRoute>
            } />

            <Route path="/consultas/ventas" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['oficina']}>
                  <Layout>
                    <ConsultaVentasPage />
                  </Layout>
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />

            <Route path="/consultas/cartera-clientes" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['oficina']}>
                  <Layout>
                    <ConsultaCarteraClientesPage />
                  </Layout>
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />

            <Route path="/cartera/estado-cuenta" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['oficina']}>
                  <Layout>
                    <EstadoCuentaClientePage />
                  </Layout>
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />

            <Route path="/anulacion-facturas" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['oficina']}>
                  <Layout>
                    <AnulacionFacturasPage />
                  </Layout>
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />

            <Route path="/notas-credito" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['oficina']}>
                  <Layout>
                    <NotasCreditoPage />
                  </Layout>
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />

            <Route path="/notas-credito/nueva" element={
              <ProtectedRoute>
                <RoleProtectedRoute allowedRoles={['oficina']}>
                  <Layout>
                    <NuevaNcPage />
                  </Layout>
                </RoleProtectedRoute>
              </ProtectedRoute>
            } />

            <Route path="/notas-credito/:id/ride" element={<NcRidePage />} />

            {/* Catch all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
