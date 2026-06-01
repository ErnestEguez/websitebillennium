import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider }         from './contexts/AuthContext'
import { ProtectedRoute }       from './components/ProtectedRoute'
import { Layout }               from './components/Layout'
import { DashboardPage }        from './pages/DashboardPage'
import { BancosPage }           from './pages/bancos/BancosPage'
import { CuentasBancariasPage } from './pages/bancos/CuentasBancariasPage'
import { EgresosPage }          from './pages/egresos/EgresosPage'
import { NuevoEgresoPage }      from './pages/egresos/NuevoEgresoPage'
import { ChequesPage }          from './pages/cheques/ChequesPage'
import { ChequesAFechaPage }    from './pages/cheques/ChequesAFechaPage'
import { MovimientosPage }      from './pages/movimientos/MovimientosPage'
import { AnticiposPage }        from './pages/anticipos/AnticiposPage'
import { ConciliacionesPage }   from './pages/conciliacion/ConciliacionesPage'
import { NuevaConciliacionPage }from './pages/conciliacion/NuevaConciliacionPage'
import { EstadoCuentaPage }     from './pages/reportes/EstadoCuentaPage'
import { MovimientosPeriodoPage }from './pages/reportes/MovimientosPeriodoPage'
import { ChequesAFechaReportePage } from './pages/reportes/ChequesAFechaReportePage'
import { ConfiguracionPage }    from './pages/ConfiguracionPage'
import { AdminPage }            from './pages/admin/AdminPage'

function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <Routes>
                    <Route path="/" element={
                        <ProtectedRoute><Layout><DashboardPage /></Layout></ProtectedRoute>
                    } />
                    <Route path="/bancos" element={
                        <ProtectedRoute><Layout><BancosPage /></Layout></ProtectedRoute>
                    } />
                    <Route path="/cuentas-bancarias" element={
                        <ProtectedRoute><Layout><CuentasBancariasPage /></Layout></ProtectedRoute>
                    } />
                    <Route path="/egresos" element={
                        <ProtectedRoute><Layout><EgresosPage /></Layout></ProtectedRoute>
                    } />
                    <Route path="/egresos/nuevo" element={
                        <ProtectedRoute><Layout><NuevoEgresoPage /></Layout></ProtectedRoute>
                    } />
                    <Route path="/cheques" element={
                        <ProtectedRoute><Layout><ChequesPage /></Layout></ProtectedRoute>
                    } />
                    <Route path="/cheques/a-fecha" element={
                        <ProtectedRoute><Layout><ChequesAFechaPage /></Layout></ProtectedRoute>
                    } />
                    <Route path="/movimientos" element={
                        <ProtectedRoute><Layout><MovimientosPage /></Layout></ProtectedRoute>
                    } />
                    <Route path="/anticipos" element={
                        <ProtectedRoute><Layout><AnticiposPage /></Layout></ProtectedRoute>
                    } />
                    <Route path="/conciliacion" element={
                        <ProtectedRoute><Layout><ConciliacionesPage /></Layout></ProtectedRoute>
                    } />
                    <Route path="/conciliacion/:id" element={
                        <ProtectedRoute><Layout><NuevaConciliacionPage /></Layout></ProtectedRoute>
                    } />
                    <Route path="/reportes/estado-cuenta" element={
                        <ProtectedRoute><Layout><EstadoCuentaPage /></Layout></ProtectedRoute>
                    } />
                    <Route path="/reportes/movimientos" element={
                        <ProtectedRoute><Layout><MovimientosPeriodoPage /></Layout></ProtectedRoute>
                    } />
                    <Route path="/reportes/cheques-fecha" element={
                        <ProtectedRoute><Layout><ChequesAFechaReportePage /></Layout></ProtectedRoute>
                    } />
                    <Route path="/configuracion" element={
                        <ProtectedRoute><Layout><ConfiguracionPage /></Layout></ProtectedRoute>
                    } />
                    <Route path="/admin" element={
                        <ProtectedRoute><Layout><AdminPage /></Layout></ProtectedRoute>
                    } />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </AuthProvider>
        </BrowserRouter>
    )
}

export default App
