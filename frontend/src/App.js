import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { Toaster } from "./components/ui/sonner";
import Layout from "./components/Layout";
import { useAuth } from "./context/AuthContext";

// Public Pages
import Home from "./pages/Home";
import Products from "./pages/Products";
import ProductDetail from "./pages/ProductDetail";
import Planes from "./pages/Planes";
import About from "./pages/About";
import Contact from "./pages/Contact";
import Login from "./pages/Login";
import Register from "./pages/Register";
import MySubscriptions from "./pages/MySubscriptions";
import UserDashboard from "./pages/UserDashboard";
import NotFound from "./pages/NotFound";

// Admin Pages
import AdminDashboard from "./pages/admin/Dashboard";
import AdminSubscriptions from "./pages/admin/Subscriptions";
import AdminUsers from "./pages/admin/Users";
import AdminMessages from "./pages/admin/Messages";

// Public Page Wrapper
const PublicPage = ({ children }) => (
  <Layout>{children}</Layout>
);

// Protected Admin Route
const AdminRoute = ({ children }) => {
  const { user, loading, isAdmin } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }
  if (!user || !isAdmin) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<PublicPage><Home /></PublicPage>} />
          <Route path="/productos" element={<PublicPage><Products /></PublicPage>} />
          <Route path="/productos/:slug" element={<PublicPage><ProductDetail /></PublicPage>} />
          <Route path="/planes" element={<PublicPage><Planes /></PublicPage>} />
          <Route path="/nosotros" element={<PublicPage><About /></PublicPage>} />
          <Route path="/contacto" element={<PublicPage><Contact /></PublicPage>} />

          {/* Auth Routes (no layout) */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* User Routes */}
          <Route path="/mis-suscripciones" element={<MySubscriptions />} />
          <Route path="/mis-aplicaciones" element={<UserDashboard />} />

          {/* Admin Routes — protegidas */}
          <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
          <Route path="/admin/suscripciones" element={<AdminRoute><AdminSubscriptions /></AdminRoute>} />
          <Route path="/admin/usuarios" element={<AdminRoute><AdminUsers /></AdminRoute>} />
          <Route path="/admin/mensajes" element={<AdminRoute><AdminMessages /></AdminRoute>} />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
