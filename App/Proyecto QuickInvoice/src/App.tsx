import React, { Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { OfflineBanner } from './components/OfflineBanner'
import { useOfflineSync } from './hooks/useOfflineSync'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { Dashboard } from './pages/Dashboard'
import { ContabilidadProvider } from './contexts/contabilidad/ContabilidadContext'
import { ProtectedRoute as RoleProtectedRoute } from './components/ProtectedRoute'

// ── Lazy loader helper ────────────────────────────────────────────────────────
// Vite statically analyses import() string literals even inside lambdas.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const lz = (fn: () => Promise<any>, k: string): React.LazyExoticComponent<React.ComponentType<any>> =>
  React.lazy(() => fn().then((m: any) => ({ default: m[k] })))

// ── Core pages ────────────────────────────────────────────────────────────────
const HomePage                     = lz(() => import('./pages/HomePage'), 'HomePage')
const FacturaDirectaPage           = lz(() => import('./pages/FacturaDirectaPage'), 'FacturaDirectaPage')
const ProformaPage                 = lz(() => import('./pages/ProformaPage'), 'ProformaPage')
const PreparacionesPinturaPage     = lz(() => import('./pages/PreparacionesPinturaPage'), 'PreparacionesPinturaPage')
const NuevaPreparacionPinturaPage  = lz(() => import('./pages/NuevaPreparacionPinturaPage'), 'NuevaPreparacionPinturaPage')
const ProductsPage                 = lz(() => import('./pages/ProductsPage'), 'ProductsPage')
const ClientsPage                  = lz(() => import('./pages/ClientsPage'), 'ClientsPage')
const InvoicingPage                = lz(() => import('./pages/InvoicingPage'), 'InvoicingPage')
const ConfigurationPage            = lz(() => import('./pages/ConfigurationPage'), 'ConfigurationPage')
const CierresPage                  = lz(() => import('./pages/CierresPage'), 'CierresPage')
const ProveedoresPage              = lz(() => import('./pages/ProveedoresPage'), 'ProveedoresPage')
const InventarioPage               = lz(() => import('./pages/InventarioPage'), 'InventarioPage')
const ValorizacionInventarioPage   = lz(() => import('./pages/ValorizacionInventarioPage'), 'ValorizacionInventarioPage')
const KardexPage                   = lz(() => import('./pages/KardexPage'), 'KardexPage')
const AjusteInventarioPage         = lz(() => import('./pages/AjusteInventarioPage'), 'AjusteInventarioPage')
const TransferenciaBodegaPage      = lz(() => import('./pages/TransferenciaBodegaPage'), 'TransferenciaBodegaPage')
const CodigosRetencionPage         = lz(() => import('./pages/CodigosRetencionPage'), 'CodigosRetencionPage')
const VendedoresPage               = lz(() => import('./pages/VendedoresPage'), 'VendedoresPage')
const CarteraCxcPage               = lz(() => import('./pages/CarteraCxcPage'), 'CarteraCxcPage')
const ConsultaVentasPage           = lz(() => import('./pages/ConsultaVentasPage'), 'ConsultaVentasPage')
const VentasClientePage            = lz(() => import('./pages/VentasClientePage'), 'VentasClientePage')
const GestionCarteraPage           = lz(() => import('./pages/clientes/GestionCarteraPage'), 'GestionCarteraPage')
const ConsultaCarteraClientesPage  = lz(() => import('./pages/ConsultaCarteraClientesPage'), 'ConsultaCarteraClientesPage')
const EstadoCuentaClientePage      = lz(() => import('./pages/EstadoCuentaClientePage'), 'EstadoCuentaClientePage')
const AnulacionFacturasPage        = lz(() => import('./pages/AnulacionFacturasPage'), 'AnulacionFacturasPage')
const GuiasRemisionPage            = React.lazy(() => import('./pages/GuiasRemisionPage'))
const GuiaRemisionRidePage         = lz(() => import('./pages/GuiaRemisionRidePage'), 'GuiaRemisionRidePage')
const NotasCreditoPage             = lz(() => import('./pages/NotasCreditoPage'), 'NotasCreditoPage')
const NuevaNcPage                  = lz(() => import('./pages/NuevaNcPage'), 'NuevaNcPage')
const NcRidePage                   = lz(() => import('./pages/NcRidePage'), 'NcRidePage')
const DashboardGerencialPage       = lz(() => import('./pages/DashboardGerencialPage'), 'DashboardGerencialPage')
const AdminPermisosPage            = lz(() => import('./pages/AdminPermisosPage'), 'AdminPermisosPage')
const AdminUserEmpresasPage        = lz(() => import('./pages/AdminUserEmpresasPage'), 'AdminUserEmpresasPage')
const AdminDepuracionPage          = lz(() => import('./pages/admin/AdminDepuracionPage'), 'AdminDepuracionPage')
const ImportarClientesPage         = lz(() => import('./pages/ImportarClientesPage'), 'ImportarClientesPage')
const MigrarCarteraPage            = lz(() => import('./pages/MigrarCarteraPage'), 'MigrarCarteraPage')
const ImportarArticulosPage        = lz(() => import('./pages/ImportarArticulosPage'), 'ImportarArticulosPage')
const InvoicePrint                 = lz(() => import('./pages/InvoicePrint'), 'InvoicePrint')
const TicketPrint                  = lz(() => import('./pages/TicketPrint'), 'TicketPrint')
const KitchenOrderPrint            = lz(() => import('./pages/KitchenOrderPrint'), 'KitchenOrderPrint')
const ResumenOperacionalPage       = lz(() => import('./pages/gerencia/ResumenOperacionalPage'), 'ResumenOperacionalPage')
const MesaGrid                     = lz(() => import('./pages/MesaGrid'), 'MesaGrid')
const OrderTake                    = lz(() => import('./pages/OrderTake'), 'OrderTake')
const OrdersPage                   = lz(() => import('./pages/OrdersPage'), 'OrdersPage')

// ── Módulo Cuentas por Pagar (Vendor) ────────────────────────────────────────
const VMProveedoresPage            = lz(() => import('./pages/vendor/ProveedoresPage'), 'ProveedoresPage')
const ComprasPage                  = lz(() => import('./pages/vendor/ComprasPage'), 'ComprasPage')
const NuevaCompraInventarioPage    = lz(() => import('./pages/vendor/NuevaCompraInventarioPage'), 'NuevaCompraInventarioPage')
const NuevaCompraServicioPage      = lz(() => import('./pages/vendor/NuevaCompraServicioPage'), 'NuevaCompraServicioPage')
const OrdenesCompraPage            = lz(() => import('./pages/vendor/OrdenesCompraPage'), 'OrdenesCompraPage')
const NuevaOrdenCompraPage         = lz(() => import('./pages/vendor/NuevaOrdenCompraPage'), 'NuevaOrdenCompraPage')
const CxPPage                      = lz(() => import('./pages/vendor/CxPPage'), 'CxPPage')
const AjustesPage                  = lz(() => import('./pages/vendor/AjustesPage'), 'AjustesPage')
const VendorConsultaComprasPage    = lz(() => import('./pages/vendor/reportes/ConsultaComprasPage'), 'ConsultaComprasPage')
const ConsultaCxPPage              = lz(() => import('./pages/vendor/reportes/ConsultaCxPPage'), 'ConsultaCxPPage')
const EstadoCuentaProveedorPage    = lz(() => import('./pages/vendor/reportes/EstadoCuentaProveedorPage'), 'EstadoCuentaProveedorPage')
const ComprobantesRetencionPage    = lz(() => import('./pages/vendor/ComprobantesRetencionPage'), 'ComprobantesRetencionPage')
const RetencionRidePage            = lz(() => import('./pages/vendor/RetencionRidePage'), 'RetencionRidePage')
const LiquidacionesCompraPage      = lz(() => import('./pages/vendor/LiquidacionesCompraPage'), 'LiquidacionesCompraPage')
const NuevaLiquidacionCompraPage   = lz(() => import('./pages/vendor/NuevaLiquidacionCompraPage'), 'NuevaLiquidacionCompraPage')
const LiquidacionCompraRidePage    = lz(() => import('./pages/vendor/LiquidacionCompraRidePage'), 'LiquidacionCompraRidePage')

// ── Módulo Contabilidad ───────────────────────────────────────────────────────
const ContaDashboard               = lz(() => import('./pages/contabilidad/DashboardPage'), 'DashboardPage')
const PlanCuentasPage              = lz(() => import('./pages/contabilidad/plan-cuentas/PlanCuentasPage'), 'PlanCuentasPage')
const ComprobantesPage             = lz(() => import('./pages/contabilidad/comprobantes/ComprobantesPage'), 'ComprobantesPage')
const NuevoComprobantePage         = lz(() => import('./pages/contabilidad/comprobantes/NuevoComprobantePage'), 'NuevoComprobantePage')
const VerComprobantePage           = lz(() => import('./pages/contabilidad/comprobantes/VerComprobantePage'), 'VerComprobantePage')
const BalanceComprobacionPage      = lz(() => import('./pages/contabilidad/reportes/BalanceComprobacionPage'), 'BalanceComprobacionPage')
const BalanceGeneralPage           = lz(() => import('./pages/contabilidad/reportes/BalanceGeneralPage'), 'BalanceGeneralPage')
const EstadoResultadosPage         = lz(() => import('./pages/contabilidad/reportes/EstadoResultadosPage'), 'EstadoResultadosPage')
const ContaEstadoCuenta            = lz(() => import('./pages/contabilidad/reportes/EstadoCuentaPage'), 'EstadoCuentaPage')
const RealVsPresupuestoPage        = lz(() => import('./pages/contabilidad/reportes/RealVsPresupuestoPage'), 'RealVsPresupuestoPage')
const PresupuestoPage              = lz(() => import('./pages/contabilidad/presupuesto/PresupuestoPage'), 'PresupuestoPage')
const CierreContablePage           = lz(() => import('./pages/contabilidad/cierre/CierreContablePage'), 'CierreContablePage')
const IntegracionQIPage            = lz(() => import('./pages/contabilidad/integracion/IntegracionQIPage'), 'IntegracionQIPage')
const IntegracionSRIPage           = lz(() => import('./pages/contabilidad/integracion/IntegracionSRIPage'), 'IntegracionSRIPage')
const IntegracionExcelVentasPage   = lz(() => import('./pages/contabilidad/integracion/IntegracionExcelVentasPage'), 'IntegracionExcelVentasPage')
const ContaCompras                 = lz(() => import('./pages/contabilidad/tributario/ConsultaComprasPage'), 'ConsultaComprasPage')
const ConsultaRetencionesPage      = lz(() => import('./pages/contabilidad/tributario/ConsultaRetencionesPage'), 'ConsultaRetencionesPage')
const ConsultaFacturasVentasPage   = lz(() => import('./pages/contabilidad/tributario/ConsultaFacturasVentasPage'), 'ConsultaFacturasVentasPage')
const ConsultaNcNdPage             = lz(() => import('./pages/contabilidad/tributario/ConsultaNcNdPage'), 'ConsultaNcNdPage')
const AtsPage                      = lz(() => import('./pages/contabilidad/tributario/AtsPage'), 'AtsPage')
const Formulario104Page            = lz(() => import('./pages/contabilidad/tributario/Formulario104Page'), 'Formulario104Page')
const ContaConfig                  = lz(() => import('./pages/contabilidad/ConfiguracionPage'), 'ConfiguracionPage')
const Formulario104DetallePage     = lz(() => import('./pages/contabilidad/tributario/Formulario104DetallePage'), 'Formulario104DetallePage')

// ── Módulo Talento Humano ─────────────────────────────────────────────────────
const EmpleadosPage                = lz(() => import('./pages/talento/EmpleadosPage'), 'EmpleadosPage')
const VacantesPage                 = lz(() => import('./pages/talento/VacantesPage'), 'VacantesPage')
const PlantillasChecklistPage      = lz(() => import('./pages/talento/PlantillasChecklistPage'), 'PlantillasChecklistPage')
const ChecklistsPage               = lz(() => import('./pages/talento/ChecklistsPage'), 'ChecklistsPage')
const EvaluacionDesempenoPage      = lz(() => import('./pages/talento/EvaluacionDesempenoPage'), 'EvaluacionDesempenoPage')
const CapacitacionPage             = lz(() => import('./pages/talento/CapacitacionPage'), 'CapacitacionPage')
const ClimaPage                    = lz(() => import('./pages/talento/ClimaPage'), 'ClimaPage')
const DashboardTalentoPage         = lz(() => import('./pages/talento/DashboardTalentoPage'), 'DashboardTalentoPage')
const FiniquitoPage                = lz(() => import('./pages/talento/FiniquitoPage'), 'FiniquitoPage')
const EstructuraOrganizativaPage   = lz(() => import('./pages/talento/EstructuraOrganizativaPage'), 'EstructuraOrganizativaPage')

// ── Módulo Nóminas ────────────────────────────────────────────────────────────
const ConceptosNominaPage          = lz(() => import('./pages/nominas/ConceptosNominaPage'), 'ConceptosNominaPage')
const ParametrosNominaPage         = lz(() => import('./pages/nominas/ParametrosNominaPage'), 'ParametrosNominaPage')
const PeriodosNominaPage           = lz(() => import('./pages/nominas/PeriodosNominaPage'), 'PeriodosNominaPage')
const RolNominaPage                = lz(() => import('./pages/nominas/RolNominaPage'), 'RolNominaPage')
const NovedadesNominaPage          = lz(() => import('./pages/nominas/NovedadesNominaPage'), 'NovedadesNominaPage')
const CuentasNominaPage            = lz(() => import('./pages/nominas/CuentasNominaPage'), 'CuentasNominaPage')
const ReportesNominaPage           = lz(() => import('./pages/nominas/ReportesNominaPage'), 'ReportesNominaPage')
const AnticipoNominaPage           = lz(() => import('./pages/nominas/AnticipoNominaPage'), 'AnticipoNominaPage')
const ReporteAnticipoPage          = lz(() => import('./pages/nominas/ReporteAnticipoPage'), 'ReporteAnticipoPage')
const CapacidadPagoPage            = lz(() => import('./pages/nominas/CapacidadPagoPage'), 'CapacidadPagoPage')
const LiquidacionDecimosPage       = lz(() => import('./pages/nominas/LiquidacionDecimosPage'), 'LiquidacionDecimosPage')
const LiquidacionVacacionesPage    = lz(() => import('./pages/nominas/LiquidacionVacacionesPage'), 'LiquidacionVacacionesPage')

// ── Módulo Tesorería ──────────────────────────────────────────────────────────
const CuentasBancariasPage         = lz(() => import('./pages/tesoreria/bancos/CuentasBancariasPage'), 'CuentasBancariasPage')
const BancosPage                   = lz(() => import('./pages/tesoreria/bancos/BancosPage'), 'BancosPage')
const EgresosPage                  = lz(() => import('./pages/tesoreria/egresos/EgresosPage'), 'EgresosPage')
const NuevoEgresoPage              = lz(() => import('./pages/tesoreria/egresos/NuevoEgresoPage'), 'NuevoEgresoPage')
const TesoAnticipos                = lz(() => import('./pages/tesoreria/anticipos/AnticiposPage'), 'AnticiposPage')
const ChequesPage                  = lz(() => import('./pages/tesoreria/cheques/ChequesPage'), 'ChequesPage')
const ChequesAFechaPage            = lz(() => import('./pages/tesoreria/cheques/ChequesAFechaPage'), 'ChequesAFechaPage')
const MovimientosPage              = lz(() => import('./pages/tesoreria/movimientos/MovimientosPage'), 'MovimientosPage')
const ConciliacionesPage           = lz(() => import('./pages/tesoreria/conciliacion/ConciliacionesPage'), 'ConciliacionesPage')
const NuevaConciliacionPage        = lz(() => import('./pages/tesoreria/conciliacion/NuevaConciliacionPage'), 'NuevaConciliacionPage')
const TesoConfig                   = lz(() => import('./pages/tesoreria/ConfiguracionPage'), 'ConfiguracionPage')
const TesoEstadoCuenta             = lz(() => import('./pages/tesoreria/reportes/EstadoCuentaPage'), 'EstadoCuentaPage')
const MovimientosPeriodoPage       = lz(() => import('./pages/tesoreria/reportes/MovimientosPeriodoPage'), 'MovimientosPeriodoPage')
const ChequesAFechaReportePage     = lz(() => import('./pages/tesoreria/reportes/ChequesAFechaReportePage'), 'ChequesAFechaReportePage')
const CierreGeneralPage            = lz(() => import('./pages/tesoreria/CierreGeneralPage'), 'CierreGeneralPage')

// ── Spinner de carga para Suspense ────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
    </div>
  )
}

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

  if (!loading && profile?.rol === 'oficina') {
    return <Navigate to="/home" replace />
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
          <Suspense fallback={<PageLoader />}>
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

              <Route path="/home" element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={['oficina']}>
                    <Layout>
                      <HomePage />
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

              <Route path="/proformas" element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={['oficina']}>
                    <Layout>
                      <ProformaPage />
                    </Layout>
                  </RoleProtectedRoute>
                </ProtectedRoute>
              } />

              <Route path="/preparaciones-pintura" element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={['oficina']}>
                    <Layout>
                      <PreparacionesPinturaPage />
                    </Layout>
                  </RoleProtectedRoute>
                </ProtectedRoute>
              } />

              <Route path="/preparaciones-pintura/nueva" element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={['oficina']}>
                    <Layout>
                      <NuevaPreparacionPinturaPage />
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

              <Route path="/inventario-valorizado" element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={['oficina']}>
                    <Layout>
                      <ValorizacionInventarioPage />
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

              <Route path="/ajuste-inventario" element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={['oficina']}>
                    <Layout>
                      <AjusteInventarioPage />
                    </Layout>
                  </RoleProtectedRoute>
                </ProtectedRoute>
              } />

              <Route path="/transferencia-bodega" element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={['oficina']}>
                    <Layout>
                      <TransferenciaBodegaPage />
                    </Layout>
                  </RoleProtectedRoute>
                </ProtectedRoute>
              } />

              <Route path="/importar-articulos" element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={['oficina']}>
                    <Layout>
                      <ImportarArticulosPage />
                    </Layout>
                  </RoleProtectedRoute>
                </ProtectedRoute>
              } />

              <Route path="/importar-clientes" element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={['oficina']}>
                    <Layout>
                      <ImportarClientesPage />
                    </Layout>
                  </RoleProtectedRoute>
                </ProtectedRoute>
              } />

              <Route path="/migrar-cartera" element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={['oficina']}>
                    <Layout>
                      <MigrarCarteraPage />
                    </Layout>
                  </RoleProtectedRoute>
                </ProtectedRoute>
              } />

              <Route path="/retenciones/codigos" element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={['oficina']}>
                    <Layout>
                      <CodigosRetencionPage />
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

              <Route path="/ajustes/permisos" element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={['oficina']}>
                    <Layout>
                      <AdminPermisosPage />
                    </Layout>
                  </RoleProtectedRoute>
                </ProtectedRoute>
              } />

              <Route path="/admin/user-empresas" element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={['admin_plataforma']}>
                    <Layout>
                      <AdminUserEmpresasPage />
                    </Layout>
                  </RoleProtectedRoute>
                </ProtectedRoute>
              } />

              <Route path="/admin/depuracion" element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={['admin_plataforma']}>
                    <Layout>
                      <AdminDepuracionPage />
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

              <Route path="/gerencia/resumen-operacional" element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={['oficina']}>
                    <Layout>
                      <ResumenOperacionalPage />
                    </Layout>
                  </RoleProtectedRoute>
                </ProtectedRoute>
              } />

              <Route path="/consultas/ventas-cliente" element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={['oficina']}>
                    <Layout>
                      <VentasClientePage />
                    </Layout>
                  </RoleProtectedRoute>
                </ProtectedRoute>
              } />

              <Route path="/clientes/gestion-cartera" element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={['oficina']}>
                    <Layout>
                      <GestionCarteraPage />
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

              <Route path="/guias-remision" element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={['oficina']}>
                    <Layout>
                      <GuiasRemisionPage />
                    </Layout>
                  </RoleProtectedRoute>
                </ProtectedRoute>
              } />

              <Route path="/guias-remision/:id/ride" element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={['oficina']}>
                    <Layout>
                      <GuiaRemisionRidePage />
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

              {/* ── Cuentas por Pagar (Vendor Management) ── */}
              <Route path="/proveedores" element={<ProtectedRoute><RoleProtectedRoute allowedRoles={['oficina']}><Layout><VMProveedoresPage /></Layout></RoleProtectedRoute></ProtectedRoute>} />
              <Route path="/compras" element={<ProtectedRoute><RoleProtectedRoute allowedRoles={['oficina']}><Layout><ComprasPage /></Layout></RoleProtectedRoute></ProtectedRoute>} />
              <Route path="/compras/nueva-inventario" element={<ProtectedRoute><RoleProtectedRoute allowedRoles={['oficina']}><Layout><NuevaCompraInventarioPage /></Layout></RoleProtectedRoute></ProtectedRoute>} />
              <Route path="/compras/nueva-servicio" element={<ProtectedRoute><RoleProtectedRoute allowedRoles={['oficina']}><Layout><NuevaCompraServicioPage /></Layout></RoleProtectedRoute></ProtectedRoute>} />
              <Route path="/compras/ordenes" element={<ProtectedRoute><RoleProtectedRoute allowedRoles={['oficina']}><Layout><OrdenesCompraPage /></Layout></RoleProtectedRoute></ProtectedRoute>} />
              <Route path="/compras/ordenes/nueva" element={<ProtectedRoute><RoleProtectedRoute allowedRoles={['oficina']}><Layout><NuevaOrdenCompraPage /></Layout></RoleProtectedRoute></ProtectedRoute>} />
              <Route path="/compras/ordenes/:id" element={<ProtectedRoute><RoleProtectedRoute allowedRoles={['oficina']}><Layout><NuevaOrdenCompraPage /></Layout></RoleProtectedRoute></ProtectedRoute>} />
              <Route path="/cxp" element={<ProtectedRoute><RoleProtectedRoute allowedRoles={['oficina']}><Layout><CxPPage /></Layout></RoleProtectedRoute></ProtectedRoute>} />
              <Route path="/ajustes" element={<ProtectedRoute><RoleProtectedRoute allowedRoles={['oficina']}><Layout><AjustesPage /></Layout></RoleProtectedRoute></ProtectedRoute>} />
              <Route path="/retenciones" element={<ProtectedRoute><RoleProtectedRoute allowedRoles={['oficina']}><Layout><ComprobantesRetencionPage /></Layout></RoleProtectedRoute></ProtectedRoute>} />
              <Route path="/retenciones/:compra_id/ride" element={<RetencionRidePage />} />
              <Route path="/liquidaciones" element={<ProtectedRoute><RoleProtectedRoute allowedRoles={['oficina']}><Layout><LiquidacionesCompraPage /></Layout></RoleProtectedRoute></ProtectedRoute>} />
              <Route path="/liquidaciones/nueva" element={<ProtectedRoute><RoleProtectedRoute allowedRoles={['oficina']}><Layout><NuevaLiquidacionCompraPage /></Layout></RoleProtectedRoute></ProtectedRoute>} />
              <Route path="/liquidaciones/:id/ride" element={<LiquidacionCompraRidePage />} />
              <Route path="/reportes/compras" element={<ProtectedRoute><RoleProtectedRoute allowedRoles={['oficina']}><Layout><VendorConsultaComprasPage /></Layout></RoleProtectedRoute></ProtectedRoute>} />
              <Route path="/reportes/cxp" element={<ProtectedRoute><RoleProtectedRoute allowedRoles={['oficina']}><Layout><ConsultaCxPPage /></Layout></RoleProtectedRoute></ProtectedRoute>} />
              <Route path="/reportes/estado-cuenta" element={<ProtectedRoute><RoleProtectedRoute allowedRoles={['oficina']}><Layout><EstadoCuentaProveedorPage /></Layout></RoleProtectedRoute></ProtectedRoute>} />

              {/* ── Módulo Tesorería (Finance Suite) ── */}
              <Route path="/teso/*" element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={['oficina']}>
                    <Layout>
                      <Routes>
                        <Route path="cuentas-bancarias"        element={<CuentasBancariasPage />} />
                        <Route path="egresos"                  element={<EgresosPage />} />
                        <Route path="egresos/nuevo"            element={<NuevoEgresoPage />} />
                        <Route path="anticipos"                element={<TesoAnticipos />} />
                        <Route path="cheques"                  element={<ChequesPage />} />
                        <Route path="cheques-fecha"            element={<ChequesAFechaPage />} />
                        <Route path="movimientos"              element={<MovimientosPage />} />
                        <Route path="conciliacion"             element={<ConciliacionesPage />} />
                        <Route path="conciliacion/:id"         element={<NuevaConciliacionPage />} />
                        <Route path="configuracion"            element={<TesoConfig />} />
                        <Route path="bancos"                   element={<BancosPage />} />
                        <Route path="reportes/estado-cuenta"   element={<TesoEstadoCuenta />} />
                        <Route path="reportes/movimientos"     element={<MovimientosPeriodoPage />} />
                        <Route path="reportes/cheques-fecha"   element={<ChequesAFechaReportePage />} />
                        <Route path="cierre-general"           element={<CierreGeneralPage />} />
                        <Route path="*"                        element={<Navigate to="/teso/cuentas-bancarias" replace />} />
                      </Routes>
                    </Layout>
                  </RoleProtectedRoute>
                </ProtectedRoute>
              } />

              {/* ── Módulo Contabilidad (LedgerPro) ── */}
              <Route path="/conta/*" element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={['oficina']}>
                    <ContabilidadProvider>
                      <Layout>
                        <Routes>
                          <Route path="dashboard"                      element={<ContaDashboard />} />
                          <Route path="plan-cuentas"                   element={<PlanCuentasPage />} />
                          <Route path="diarios"                        element={<ComprobantesPage />} />
                          <Route path="diarios/nuevo"                  element={<NuevoComprobantePage />} />
                          <Route path="diarios/:id"                    element={<VerComprobantePage />} />
                          <Route path="reportes/balance-comprobacion"  element={<BalanceComprobacionPage />} />
                          <Route path="reportes/balance-general"       element={<BalanceGeneralPage />} />
                          <Route path="reportes/estado-resultados"     element={<EstadoResultadosPage />} />
                          <Route path="reportes/estado-cuenta"         element={<ContaEstadoCuenta />} />
                          <Route path="reportes/real-vs-presupuesto"   element={<RealVsPresupuestoPage />} />
                          <Route path="presupuesto"                    element={<PresupuestoPage />} />
                          <Route path="cierre"                         element={<CierreContablePage />} />
                          <Route path="integracion/qi"                 element={<IntegracionQIPage />} />
                          <Route path="integracion/sri"                element={<IntegracionSRIPage />} />
                          <Route path="integracion/excel"              element={<IntegracionExcelVentasPage />} />
                          <Route path="tributario/compras"             element={<ContaCompras />} />
                          <Route path="tributario/retenciones"         element={<ConsultaRetencionesPage />} />
                          <Route path="tributario/facturas-ventas"     element={<ConsultaFacturasVentasPage />} />
                          <Route path="tributario/nc-nd"               element={<ConsultaNcNdPage />} />
                          <Route path="tributario/ats"                 element={<AtsPage />} />
                          <Route path="tributario/104"                 element={<Formulario104Page />} />
                          <Route path="tributario/104/:id"             element={<Formulario104DetallePage />} />
                          <Route path="configuracion"                  element={<ContaConfig />} />
                          <Route path="*"                              element={<Navigate to="/conta/dashboard" replace />} />
                        </Routes>
                      </Layout>
                    </ContabilidadProvider>
                  </RoleProtectedRoute>
                </ProtectedRoute>
              } />

              {/* ── Módulo Talento Humano ── */}
              <Route path="/talento/*" element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={['oficina']}>
                    <Layout>
                      <Routes>
                        <Route path="vacantes"              element={<VacantesPage />} />
                        <Route path="empleados"             element={<EmpleadosPage />} />
                        <Route path="plantillas-checklist"  element={<PlantillasChecklistPage />} />
                        <Route path="checklists"            element={<ChecklistsPage />} />
                        <Route path="desempeno"             element={<EvaluacionDesempenoPage />} />
                        <Route path="capacitacion"          element={<CapacitacionPage />} />
                        <Route path="clima"                 element={<ClimaPage />} />
                        <Route path="dashboard"             element={<DashboardTalentoPage />} />
                        <Route path="finiquito"             element={<FiniquitoPage />} />
                        <Route path="estructura"            element={<EstructuraOrganizativaPage />} />
                        <Route path="*"          element={<Navigate to="/talento/empleados" replace />} />
                      </Routes>
                    </Layout>
                  </RoleProtectedRoute>
                </ProtectedRoute>
              } />

              {/* ── Módulo Liquidación de Nóminas ── */}
              <Route path="/nominas/*" element={
                <ProtectedRoute>
                  <RoleProtectedRoute allowedRoles={['oficina']}>
                    <Layout>
                      <Routes>
                        <Route path="periodos"             element={<PeriodosNominaPage />} />
                        <Route path="rol/:periodoId"       element={<RolNominaPage />} />
                        <Route path="reportes/:periodoId"         element={<ReportesNominaPage />} />
                        <Route path="anticipo/:periodoId"         element={<AnticipoNominaPage />} />
                        <Route path="anticipo-reporte/:anticipoId" element={<ReporteAnticipoPage />} />
                        <Route path="novedades"                   element={<NovedadesNominaPage />} />
                        <Route path="capacidad-pago"              element={<CapacidadPagoPage />} />
                        <Route path="decimos"                     element={<LiquidacionDecimosPage />} />
                        <Route path="vacaciones"                  element={<LiquidacionVacacionesPage />} />
                        <Route path="conceptos"            element={<ConceptosNominaPage />} />
                        <Route path="cuentas-nomina"       element={<CuentasNominaPage />} />
                        <Route path="parametros"           element={<ParametrosNominaPage />} />
                        <Route path="*"                    element={<Navigate to="/nominas/periodos" replace />} />
                      </Routes>
                    </Layout>
                  </RoleProtectedRoute>
                </ProtectedRoute>
              } />

              {/* Redirects Finance Suite → /teso/ */}
              <Route path="/egresos"           element={<Navigate to="/teso/egresos" replace />} />
              <Route path="/egresos/nuevo"     element={<Navigate to="/teso/egresos/nuevo" replace />} />
              <Route path="/cuentas-bancarias" element={<Navigate to="/teso/cuentas-bancarias" replace />} />
              <Route path="/anticipos"         element={<Navigate to="/teso/anticipos" replace />} />
              <Route path="/cheques"           element={<Navigate to="/teso/cheques" replace />} />
              <Route path="/cheques/a-fecha"   element={<Navigate to="/teso/cheques-fecha" replace />} />
              <Route path="/movimientos"       element={<Navigate to="/teso/movimientos" replace />} />
              <Route path="/conciliacion"      element={<Navigate to="/teso/conciliacion" replace />} />
              <Route path="/conciliacion/:id"  element={<Navigate to="/teso/conciliacion" replace />} />
              <Route path="/bancos"            element={<Navigate to="/teso/bancos" replace />} />

              {/* Redirects LP-style → /conta/ */}
              <Route path="/comprobantes"             element={<Navigate to="/conta/diarios" replace />} />
              <Route path="/comprobantes/nuevo"       element={<Navigate to="/conta/diarios/nuevo" replace />} />
              <Route path="/comprobantes/:id"         element={<Navigate to="/conta/diarios" replace />} />
              <Route path="/plan-cuentas"             element={<Navigate to="/conta/plan-cuentas" replace />} />
              <Route path="/presupuesto"              element={<Navigate to="/conta/presupuesto" replace />} />
              <Route path="/cierre-contable"          element={<Navigate to="/conta/cierre" replace />} />
              <Route path="/integracion-qi"           element={<Navigate to="/conta/integracion/qi" replace />} />
              <Route path="/integracion-sri"          element={<Navigate to="/conta/integracion/sri" replace />} />
              <Route path="/integracion-excel-ventas" element={<Navigate to="/conta/integracion/excel" replace />} />
              <Route path="/tributario/compras"         element={<Navigate to="/conta/tributario/compras" replace />} />
              <Route path="/tributario/retenciones"     element={<Navigate to="/conta/tributario/retenciones" replace />} />
              <Route path="/tributario/nc-nd"           element={<Navigate to="/conta/tributario/nc-nd" replace />} />
              <Route path="/tributario/ats"             element={<Navigate to="/conta/tributario/ats" replace />} />
              <Route path="/tributario/104"             element={<Navigate to="/conta/tributario/104" replace />} />
              <Route path="/tributario/104/:id"         element={<Navigate to="/conta/tributario/104" replace />} />
              <Route path="/reportes/balance-comprobacion"  element={<Navigate to="/conta/reportes/balance-comprobacion" replace />} />
              <Route path="/reportes/balance-general"       element={<Navigate to="/conta/reportes/balance-general" replace />} />
              <Route path="/reportes/estado-resultados"     element={<Navigate to="/conta/reportes/estado-resultados" replace />} />
              <Route path="/reportes/real-vs-presupuesto"   element={<Navigate to="/conta/reportes/real-vs-presupuesto" replace />} />

              {/* Catch all */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
