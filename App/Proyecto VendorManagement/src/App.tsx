import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { DashboardPage }              from './pages/DashboardPage'
import { ProveedoresPage }            from './pages/ProveedoresPage'
import { ComprasPage }                from './pages/compras/ComprasPage'
import { NuevaCompraInventarioPage }  from './pages/compras/NuevaCompraInventarioPage'
import { NuevaCompraServicioPage }    from './pages/compras/NuevaCompraServicioPage'
import { CxPPage }                    from './pages/CxPPage'
import { ConsultaComprasPage }        from './pages/reportes/ConsultaComprasPage'
import { ConsultaCxPPage }            from './pages/reportes/ConsultaCxPPage'
import { EstadoCuentaProveedorPage }  from './pages/reportes/EstadoCuentaProveedorPage'
import { ComprobantesRetencionPage }  from './pages/ComprobantesRetencionPage'
import { ConfiguracionPage }          from './pages/ConfiguracionPage'

function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <Routes>
                    <Route path="/" element={
                        <ProtectedRoute><Layout><DashboardPage /></Layout></ProtectedRoute>
                    } />
                    <Route path="/proveedores" element={
                        <ProtectedRoute><Layout><ProveedoresPage /></Layout></ProtectedRoute>
                    } />
                    <Route path="/compras" element={
                        <ProtectedRoute><Layout><ComprasPage /></Layout></ProtectedRoute>
                    } />
                    <Route path="/compras/nueva-inventario" element={
                        <ProtectedRoute><Layout><NuevaCompraInventarioPage /></Layout></ProtectedRoute>
                    } />
                    <Route path="/compras/nueva-servicio" element={
                        <ProtectedRoute><Layout><NuevaCompraServicioPage /></Layout></ProtectedRoute>
                    } />
                    <Route path="/cxp" element={
                        <ProtectedRoute><Layout><CxPPage /></Layout></ProtectedRoute>
                    } />
                    <Route path="/comprobantes-retencion" element={
                        <ProtectedRoute><Layout><ComprobantesRetencionPage /></Layout></ProtectedRoute>
                    } />
                    <Route path="/reportes/compras" element={
                        <ProtectedRoute><Layout><ConsultaComprasPage /></Layout></ProtectedRoute>
                    } />
                    <Route path="/reportes/cxp" element={
                        <ProtectedRoute><Layout><ConsultaCxPPage /></Layout></ProtectedRoute>
                    } />
                    <Route path="/reportes/estado-cuenta" element={
                        <ProtectedRoute><Layout><EstadoCuentaProveedorPage /></Layout></ProtectedRoute>
                    } />
                    <Route path="/configuracion" element={
                        <ProtectedRoute><Layout><ConfiguracionPage /></Layout></ProtectedRoute>
                    } />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </AuthProvider>
        </BrowserRouter>
    )
}

export default App
