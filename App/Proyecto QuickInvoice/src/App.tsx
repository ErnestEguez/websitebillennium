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
import { ValorizacionInventarioPage } from './pages/ValorizacionInventarioPage'
import { KardexPage } from './pages/KardexPage'
import { AjusteInventarioPage } from './pages/AjusteInventarioPage'
import { TransferenciaBodegaPage } from './pages/TransferenciaBodegaPage'
import { CodigosRetencionPage } from './pages/CodigosRetencionPage'
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
import { AdminPermisosPage } from './pages/AdminPermisosPage'
import { AdminUserEmpresasPage } from './pages/AdminUserEmpresasPage'
// ── Módulo Cuentas por Pagar (Vendor Management) ─────────────
import { ProveedoresPage as VMProveedoresPage }   from './pages/vendor/ProveedoresPage'
import { ComprasPage }                            from './pages/vendor/ComprasPage'
import { NuevaCompraInventarioPage }              from './pages/vendor/NuevaCompraInventarioPage'
import { NuevaCompraServicioPage }                from './pages/vendor/NuevaCompraServicioPage'
import { OrdenesCompraPage }                      from './pages/vendor/OrdenesCompraPage'
import { NuevaOrdenCompraPage }                   from './pages/vendor/NuevaOrdenCompraPage'
import { CxPPage }                                from './pages/vendor/CxPPage'
import { AjustesPage }                            from './pages/vendor/AjustesPage'
import { ConsultaComprasPage }                    from './pages/vendor/reportes/ConsultaComprasPage'
import { ConsultaCxPPage }                        from './pages/vendor/reportes/ConsultaCxPPage'
import { EstadoCuentaProveedorPage }              from './pages/vendor/reportes/EstadoCuentaProveedorPage'
import { ComprobantesRetencionPage }              from './pages/vendor/ComprobantesRetencionPage'
// ── Módulo Contabilidad (LedgerPro) ──────────────────────────
import { ContabilidadProvider }                   from './contexts/contabilidad/ContabilidadContext'
import { DashboardPage as ContaDashboard }        from './pages/contabilidad/DashboardPage'
import { PlanCuentasPage }                        from './pages/contabilidad/plan-cuentas/PlanCuentasPage'
import { ComprobantesPage }                       from './pages/contabilidad/comprobantes/ComprobantesPage'
import { NuevoComprobantePage }                   from './pages/contabilidad/comprobantes/NuevoComprobantePage'
import { VerComprobantePage }                     from './pages/contabilidad/comprobantes/VerComprobantePage'
import { BalanceComprobacionPage }                from './pages/contabilidad/reportes/BalanceComprobacionPage'
import { BalanceGeneralPage }                     from './pages/contabilidad/reportes/BalanceGeneralPage'
import { EstadoResultadosPage }                   from './pages/contabilidad/reportes/EstadoResultadosPage'
import { EstadoCuentaPage as ContaEstadoCuenta }  from './pages/contabilidad/reportes/EstadoCuentaPage'
import { RealVsPresupuestoPage }                  from './pages/contabilidad/reportes/RealVsPresupuestoPage'
import { PresupuestoPage }                        from './pages/contabilidad/presupuesto/PresupuestoPage'
import { CierreContablePage }                     from './pages/contabilidad/cierre/CierreContablePage'
import { IntegracionQIPage }                      from './pages/contabilidad/integracion/IntegracionQIPage'
import { IntegracionSRIPage }                     from './pages/contabilidad/integracion/IntegracionSRIPage'
import { IntegracionExcelVentasPage }             from './pages/contabilidad/integracion/IntegracionExcelVentasPage'
import { ConsultaComprasPage as ContaCompras }    from './pages/contabilidad/tributario/ConsultaComprasPage'
import { ConsultaRetencionesPage }                from './pages/contabilidad/tributario/ConsultaRetencionesPage'
import { ConsultaNcNdPage }                       from './pages/contabilidad/tributario/ConsultaNcNdPage'
import { AtsPage }                                from './pages/contabilidad/tributario/AtsPage'
import { Formulario104Page }                      from './pages/contabilidad/tributario/Formulario104Page'
import { ConfiguracionPage as ContaConfig }       from './pages/contabilidad/ConfiguracionPage'
import { Formulario104DetallePage }               from './pages/contabilidad/tributario/Formulario104DetallePage'
// ── Módulo Talento Humano y Nóminas ──────────────────────────
import { EstructuraOrganizativaPage }             from './pages/talento/EstructuraOrganizativaPage'
import { ParametrosNominaPage }                   from './pages/nominas/ParametrosNominaPage'
// ── Módulo Tesorería (Finance Suite) ─────────────────────────

import { CuentasBancariasPage }                   from './pages/tesoreria/bancos/CuentasBancariasPage'
import { BancosPage }                             from './pages/tesoreria/bancos/BancosPage'
import { EgresosPage }                            from './pages/tesoreria/egresos/EgresosPage'
import { NuevoEgresoPage }                        from './pages/tesoreria/egresos/NuevoEgresoPage'
import { AnticiposPage as TesoAnticipos }         from './pages/tesoreria/anticipos/AnticiposPage'
import { ChequesPage }                            from './pages/tesoreria/cheques/ChequesPage'
import { ChequesAFechaPage }                      from './pages/tesoreria/cheques/ChequesAFechaPage'
import { MovimientosPage }                        from './pages/tesoreria/movimientos/MovimientosPage'
import { ConciliacionesPage }                     from './pages/tesoreria/conciliacion/ConciliacionesPage'
import { NuevaConciliacionPage }                  from './pages/tesoreria/conciliacion/NuevaConciliacionPage'
import { ConfiguracionPage as TesoConfig }        from './pages/tesoreria/ConfiguracionPage'
import { EstadoCuentaPage as TesoEstadoCuenta }   from './pages/tesoreria/reportes/EstadoCuentaPage'
import { MovimientosPeriodoPage }                 from './pages/tesoreria/reportes/MovimientosPeriodoPage'
import { ChequesAFechaReportePage }               from './pages/tesoreria/reportes/ChequesAFechaReportePage'

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
            <Route path="/reportes/compras" element={<ProtectedRoute><RoleProtectedRoute allowedRoles={['oficina']}><Layout><ConsultaComprasPage /></Layout></RoleProtectedRoute></ProtectedRoute>} />
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
                      <Route path="estructura" element={<EstructuraOrganizativaPage />} />
                      <Route path="*"          element={<Navigate to="/talento/estructura" replace />} />
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
                      <Route path="parametros" element={<ParametrosNominaPage />} />
                      <Route path="*"          element={<Navigate to="/nominas/parametros" replace />} />
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
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
