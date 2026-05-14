import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { Loader2 } from 'lucide-react'

const DashboardPage          = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })))
const PlanCuentasPage        = lazy(() => import('./pages/plan-cuentas/PlanCuentasPage').then(m => ({ default: m.PlanCuentasPage })))
const ComprobantesPage       = lazy(() => import('./pages/comprobantes/ComprobantesPage').then(m => ({ default: m.ComprobantesPage })))
const NuevoComprobantePage   = lazy(() => import('./pages/comprobantes/NuevoComprobantePage').then(m => ({ default: m.NuevoComprobantePage })))
const VerComprobantePage     = lazy(() => import('./pages/comprobantes/VerComprobantePage').then(m => ({ default: m.VerComprobantePage })))
const BalanceComprobacionPage = lazy(() => import('./pages/reportes/BalanceComprobacionPage').then(m => ({ default: m.BalanceComprobacionPage })))
const BalanceGeneralPage     = lazy(() => import('./pages/reportes/BalanceGeneralPage').then(m => ({ default: m.BalanceGeneralPage })))
const EstadoResultadosPage   = lazy(() => import('./pages/reportes/EstadoResultadosPage').then(m => ({ default: m.EstadoResultadosPage })))
const EstadoCuentaPage       = lazy(() => import('./pages/reportes/EstadoCuentaPage').then(m => ({ default: m.EstadoCuentaPage })))
const RealVsPresupuestoPage  = lazy(() => import('./pages/reportes/RealVsPresupuestoPage').then(m => ({ default: m.RealVsPresupuestoPage })))
const PresupuestoPage        = lazy(() => import('./pages/presupuesto/PresupuestoPage').then(m => ({ default: m.PresupuestoPage })))
const CierreContablePage     = lazy(() => import('./pages/cierre/CierreContablePage').then(m => ({ default: m.CierreContablePage })))
const IntegracionQIPage      = lazy(() => import('./pages/integracion/IntegracionQIPage').then(m => ({ default: m.IntegracionQIPage })))
const IntegracionSRIPage     = lazy(() => import('./pages/integracion/IntegracionSRIPage').then(m => ({ default: m.IntegracionSRIPage })))
const ConfiguracionPage      = lazy(() => import('./pages/ConfiguracionPage').then(m => ({ default: m.ConfiguracionPage })))
const AdminPage              = lazy(() => import('./pages/admin/AdminPage').then(m => ({ default: m.AdminPage })))

function PageLoader() {
    return (
        <div className="flex items-center justify-center min-h-[300px]">
            <Loader2 className="w-6 h-6 animate-spin text-primary-400" />
        </div>
    )
}

function AppRoutes() {
    return (
        <Suspense fallback={<PageLoader />}>
            <Routes>
                <Route path="/login" element={<LoginPage />} />

                <Route path="/" element={
                    <ProtectedRoute>
                        <Layout><Navigate to="/dashboard" replace /></Layout>
                    </ProtectedRoute>
                } />

                <Route path="/dashboard" element={
                    <ProtectedRoute>
                        <Layout><DashboardPage /></Layout>
                    </ProtectedRoute>
                } />

                <Route path="/plan-cuentas" element={
                    <ProtectedRoute>
                        <Layout><PlanCuentasPage /></Layout>
                    </ProtectedRoute>
                } />

                <Route path="/comprobantes" element={
                    <ProtectedRoute>
                        <Layout><ComprobantesPage /></Layout>
                    </ProtectedRoute>
                } />

                <Route path="/comprobantes/nuevo" element={
                    <ProtectedRoute>
                        <Layout><NuevoComprobantePage /></Layout>
                    </ProtectedRoute>
                } />

                <Route path="/comprobantes/:id" element={
                    <ProtectedRoute>
                        <Layout><VerComprobantePage /></Layout>
                    </ProtectedRoute>
                } />

                <Route path="/reportes/balance-comprobacion" element={
                    <ProtectedRoute>
                        <Layout><BalanceComprobacionPage /></Layout>
                    </ProtectedRoute>
                } />

                <Route path="/reportes/balance-general" element={
                    <ProtectedRoute>
                        <Layout><BalanceGeneralPage /></Layout>
                    </ProtectedRoute>
                } />

                <Route path="/reportes/estado-resultados" element={
                    <ProtectedRoute>
                        <Layout><EstadoResultadosPage /></Layout>
                    </ProtectedRoute>
                } />

                <Route path="/reportes/estado-cuenta" element={
                    <ProtectedRoute>
                        <Layout><EstadoCuentaPage /></Layout>
                    </ProtectedRoute>
                } />

                <Route path="/reportes/real-vs-presupuesto" element={
                    <ProtectedRoute>
                        <Layout><RealVsPresupuestoPage /></Layout>
                    </ProtectedRoute>
                } />

                <Route path="/presupuesto" element={
                    <ProtectedRoute>
                        <Layout><PresupuestoPage /></Layout>
                    </ProtectedRoute>
                } />

                <Route path="/cierre-contable" element={
                    <ProtectedRoute>
                        <Layout><CierreContablePage /></Layout>
                    </ProtectedRoute>
                } />

                <Route path="/integracion-qi" element={
                    <ProtectedRoute>
                        <Layout><IntegracionQIPage /></Layout>
                    </ProtectedRoute>
                } />

                <Route path="/integracion-sri" element={
                    <ProtectedRoute>
                        <Layout><IntegracionSRIPage /></Layout>
                    </ProtectedRoute>
                } />

                <Route path="/configuracion" element={
                    <ProtectedRoute>
                        <Layout><ConfiguracionPage /></Layout>
                    </ProtectedRoute>
                } />

                <Route path="/admin" element={
                    <ProtectedRoute>
                        <Layout><AdminPage /></Layout>
                    </ProtectedRoute>
                } />

                <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
        </Suspense>
    )
}

export default function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <AppRoutes />
            </AuthProvider>
        </BrowserRouter>
    )
}
