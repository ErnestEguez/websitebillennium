import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { Users, CreditCard, MessageSquare, Building2, TrendingUp, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import AdminLayout from '../components/AdminLayout';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const AdminDashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/admin/stats`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStats(response.data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    );
  }

  const statCards = [
    { label: 'Usuarios Totales', value: stats?.total_users || 0, icon: Users, color: 'bg-blue-50 text-blue-600' },
    { label: 'Suscripciones Totales', value: stats?.total_subscriptions || 0, icon: CreditCard, color: 'bg-green-50 text-green-600' },
    { label: 'Suscripciones Activas', value: stats?.active_subscriptions || 0, icon: CheckCircle, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Pendientes de Revisión', value: stats?.pending_subscriptions || 0, icon: Clock, color: 'bg-yellow-50 text-yellow-600' },
    { label: 'Mensajes Totales', value: stats?.total_messages || 0, icon: MessageSquare, color: 'bg-purple-50 text-purple-600' },
    { label: 'Mensajes Sin Leer', value: stats?.unread_messages || 0, icon: AlertCircle, color: 'bg-red-50 text-red-600' },
    { label: 'Empresas Registradas', value: stats?.total_companies || 0, icon: Building2, color: 'bg-cyan-50 text-cyan-600' },
  ];

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-600">Resumen general del sistema Billennium</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className="border-slate-200">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-slate-600 mb-1">{stat.label}</p>
                        <p className="text-3xl font-bold text-slate-900">{stat.value}</p>
                      </div>
                      <div className={`w-12 h-12 rounded-xl ${stat.color} flex items-center justify-center`}>
                        <Icon className="h-6 w-6" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {stats?.pending_subscriptions > 0 && (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <Clock className="h-8 w-8 text-yellow-600" />
                <div>
                  <h3 className="font-semibold text-slate-900">Suscripciones pendientes</h3>
                  <p className="text-slate-600">
                    Tienes {stats.pending_subscriptions} suscripción(es) esperando aprobación.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {stats?.unread_messages > 0 && (
          <Card className="border-purple-200 bg-purple-50">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <MessageSquare className="h-8 w-8 text-purple-600" />
                <div>
                  <h3 className="font-semibold text-slate-900">Mensajes sin leer</h3>
                  <p className="text-slate-600">
                    Tienes {stats.unread_messages} mensaje(s) de contacto sin leer.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
