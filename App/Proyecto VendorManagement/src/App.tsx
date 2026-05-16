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
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </AuthProvider>
        </BrowserRouter>
    )
}

export default App
