import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { Toaster } from "./components/ui/sonner";
import Layout from "./components/Layout";

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

// Admin Pages
import AdminDashboard from "./pages/admin/Dashboard";
import AdminSubscriptions from "./pages/admin/Subscriptions";
import AdminUsers from "./pages/admin/Users";
import AdminMessages from "./pages/admin/Messages";
import AdminCompanies from "./pages/admin/Companies";

// Public Page Wrapper
const PublicPage = ({ children }) => (
  <Layout>{children}</Layout>
);

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
          
          {/* Admin Routes */}
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/suscripciones" element={<AdminSubscriptions />} />
          <Route path="/admin/usuarios" element={<AdminUsers />} />
          <Route path="/admin/mensajes" element={<AdminMessages />} />
          <Route path="/admin/empresas" element={<AdminCompanies />} />
        </Routes>
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
