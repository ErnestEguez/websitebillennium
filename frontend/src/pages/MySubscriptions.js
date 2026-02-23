import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { Package, Clock, CheckCircle, XCircle, AlertCircle, ArrowRight } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/Layout';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const statusConfig = {
  pending: { label: 'Pendiente', icon: Clock, color: 'bg-yellow-100 text-yellow-800' },
  active: { label: 'Activo', icon: CheckCircle, color: 'bg-green-100 text-green-800' },
  suspended: { label: 'Suspendido', icon: AlertCircle, color: 'bg-orange-100 text-orange-800' },
  cancelled: { label: 'Cancelado', icon: XCircle, color: 'bg-red-100 text-red-800' },
};

export const MySubscriptions = () => {
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user, token } = useAuth();
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

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="py-12 bg-slate-50 min-h-screen">
        <div className="container mx-auto px-4 md:px-8 max-w-5xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="mb-8">
              <h1 className="text-3xl font-bold text-slate-900 mb-2">Mis Suscripciones</h1>
              <p className="text-slate-600">Gestiona tus suscripciones a los productos de Billennium System</p>
            </div>

            {subscriptions.length === 0 ? (
              <Card className="border-slate-200">
                <CardContent className="p-12 text-center">
                  <Package className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                  <h2 className="text-xl font-semibold text-slate-900 mb-2">No tienes suscripciones</h2>
                  <p className="text-slate-600 mb-6">Explora nuestros productos y encuentra el que mejor se adapte a tu negocio.</p>
                  <Link to="/productos">
                    <Button className="bg-blue-600 hover:bg-blue-700" data-testid="btn-ver-productos">
                      Ver Productos
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {subscriptions.map((sub) => {
                  const status = statusConfig[sub.status] || statusConfig.pending;
                  const StatusIcon = status.icon;
                  
                  return (
                    <Card key={sub.id} className="border-slate-200">
                      <CardContent className="p-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                              <Package className="h-6 w-6" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-slate-900">{sub.product_name}</h3>
                              <p className="text-slate-600">Plan: {sub.plan_name}</p>
                              <p className="text-sm text-slate-500">
                                Solicitado: {new Date(sub.created_at).toLocaleDateString('es-EC')}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <Badge className={status.color}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {status.label}
                            </Badge>
                            {sub.is_enabled && (
                              <Badge className="bg-green-500 text-white">Habilitado</Badge>
                            )}
                          </div>
                        </div>
                        
                        {sub.status === 'pending' && (
                          <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                            <p className="text-sm text-yellow-800">
                              Tu solicitud está siendo revisada por un administrador. Te notificaremos cuando sea aprobada.
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            <div className="mt-8 text-center">
              <Link to="/productos">
                <Button variant="outline" data-testid="btn-explorar-mas">
                  Explorar más productos
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </Layout>
  );
};

export default MySubscriptions;
