import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { 
  UtensilsCrossed, 
  Smartphone, 
  Ship, 
  ShieldCheck, 
  FileText, 
  BarChart3,
  ExternalLink,
  Lock,
  LogOut,
  User
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../context/AuthContext';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const LOGO_URL = "https://customer-assets.emergentagent.com/job_04fdc029-61d0-4460-bdef-63f93c1202df/artifacts/3p4r9si5_billennium.jpg";

const productConfig = {
  restoflow: {
    name: 'RestoFlow',
    icon: UtensilsCrossed,
    color: 'bg-orange-50 text-orange-600',
    url: 'https://pedidosbillennium.vercel.app/',
    description: 'Gestión integral de restaurantes'
  },
  sentinel: {
    name: 'Pedidos Sentinel',
    icon: Smartphone,
    color: 'bg-blue-50 text-blue-600',
    url: 'https://pedidosbillennium.vercel.app/',
    description: 'Toma de pedidos móvil'
  },
  importaciones: {
    name: 'Módulo de Importaciones',
    icon: Ship,
    color: 'bg-cyan-50 text-cyan-600',
    url: null,
    description: 'Control de importaciones'
  },
  lopdp: {
    name: 'LOPDP',
    icon: ShieldCheck,
    color: 'bg-green-50 text-green-600',
    url: null,
    description: 'Protección de datos personales'
  },
  facturacion: {
    name: 'Facturación Electrónica',
    icon: FileText,
    color: 'bg-purple-50 text-purple-600',
    url: null,
    description: 'Comprobantes electrónicos SRI'
  },
  dashboard: {
    name: 'Dashboard Empresarial',
    icon: BarChart3,
    color: 'bg-pink-50 text-pink-600',
    url: null,
    description: 'Indicadores en tiempo real'
  },
};

export const UserDashboard = () => {
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    fetchSubscriptions();
  }, [user]);

  const fetchSubscriptions = async () => {
    try {
      const response = await axios.get(`${API}/subscriptions/my`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSubscriptions(response.data);
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  // Get enabled products
  const enabledProducts = subscriptions
    .filter(sub => sub.is_enabled && sub.status === 'active')
    .map(sub => sub.product_id);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <div className="flex items-center justify-between h-20">
            <div className="flex items-center gap-3">
              <img src={LOGO_URL} alt="Billennium" className="h-12 w-12 object-contain" />
              <span className="font-bold text-xl text-slate-900">Mis Aplicaciones</span>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2 text-slate-600">
                <User className="h-4 w-4" />
                <span>{user?.name}</span>
              </div>
              <Button variant="outline" onClick={handleLogout} data-testid="user-logout-btn">
                <LogOut className="h-4 w-4 mr-2" />
                Salir
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 md:px-8 max-w-7xl py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">
              Bienvenido, {user?.name}
            </h1>
            <p className="text-slate-600">
              Accede a tus aplicaciones autorizadas
            </p>
          </div>

          {enabledProducts.length === 0 ? (
            <Card className="border-slate-200">
              <CardContent className="p-12 text-center">
                <Lock className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-slate-900 mb-2">
                  Sin aplicaciones autorizadas
                </h2>
                <p className="text-slate-600 mb-6">
                  Aún no tienes aplicaciones habilitadas. Si ya solicitaste una suscripción, 
                  espera a que un administrador la apruebe.
                </p>
                <p className="text-sm text-slate-500">
                  ¿Necesitas ayuda? Contáctanos por WhatsApp: +593 98 013 6389
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {enabledProducts.map((productId) => {
                const config = productConfig[productId];
                if (!config) return null;
                
                const Icon = config.icon;
                const hasUrl = !!config.url;
                
                return (
                  <motion.div
                    key={productId}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileHover={{ scale: 1.02 }}
                  >
                    <Card className={`h-full border-slate-200 ${hasUrl ? 'hover:shadow-xl hover:border-blue-300' : 'opacity-75'} transition-all`}>
                      <CardContent className="p-8">
                        <div className={`w-14 h-14 rounded-xl ${config.color} flex items-center justify-center mb-6`}>
                          <Icon className="h-7 w-7" />
                        </div>
                        
                        <h3 className="text-xl font-semibold text-slate-900 mb-2">
                          {config.name}
                        </h3>
                        <p className="text-slate-600 mb-6">
                          {config.description}
                        </p>
                        
                        {hasUrl ? (
                          <a href={config.url} target="_blank" rel="noopener noreferrer">
                            <Button className="w-full bg-blue-600 hover:bg-blue-700" data-testid={`access-${productId}`}>
                              Acceder
                              <ExternalLink className="h-4 w-4 ml-2" />
                            </Button>
                          </a>
                        ) : (
                          <Button disabled className="w-full" data-testid={`access-${productId}`}>
                            Próximamente
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Pending Subscriptions */}
          {subscriptions.filter(s => s.status === 'pending').length > 0 && (
            <div className="mt-12">
              <h2 className="text-xl font-semibold text-slate-900 mb-4">Solicitudes Pendientes</h2>
              <div className="space-y-3">
                {subscriptions.filter(s => s.status === 'pending').map(sub => (
                  <Card key={sub.id} className="border-yellow-200 bg-yellow-50">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-slate-900">{sub.product_name}</p>
                        <p className="text-sm text-slate-600">Plan: {sub.plan_name}</p>
                      </div>
                      <Badge className="bg-yellow-500 text-white">Pendiente</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
};

export default UserDashboard;
