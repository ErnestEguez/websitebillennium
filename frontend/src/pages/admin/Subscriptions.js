import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { CreditCard, Check, X, Clock, Search, Filter } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import AdminLayout from '../components/AdminLayout';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const statusConfig = {
  pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  active: { label: 'Activo', color: 'bg-green-100 text-green-800' },
  suspended: { label: 'Suspendido', color: 'bg-orange-100 text-orange-800' },
  cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800' },
};

export const AdminSubscriptions = () => {
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [updating, setUpdating] = useState(null);

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const fetchSubscriptions = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/admin/subscriptions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSubscriptions(response.data);
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
      toast.error('Error al cargar las suscripciones');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEnabled = async (subscriptionId, currentEnabled) => {
    setUpdating(subscriptionId);
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API}/admin/subscriptions/${subscriptionId}`, {
        is_enabled: !currentEnabled
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setSubscriptions(subs => subs.map(s => 
        s.id === subscriptionId 
          ? { ...s, is_enabled: !currentEnabled, status: !currentEnabled ? 'active' : 'suspended' }
          : s
      ));
      
      toast.success(`Suscripción ${!currentEnabled ? 'habilitada' : 'deshabilitada'}`);
    } catch (error) {
      toast.error('Error al actualizar la suscripción');
    } finally {
      setUpdating(null);
    }
  };

  const filteredSubscriptions = subscriptions.filter(sub => {
    const matchesSearch = 
      sub.user_name?.toLowerCase().includes(search.toLowerCase()) ||
      sub.user_email?.toLowerCase().includes(search.toLowerCase()) ||
      sub.product_name?.toLowerCase().includes(search.toLowerCase()) ||
      sub.company_name?.toLowerCase().includes(search.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || sub.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Suscripciones</h1>
          <p className="text-slate-600">Gestiona las suscripciones de los usuarios a los productos</p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por nombre, email, producto o empresa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
              data-testid="subscriptions-search"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48" data-testid="subscriptions-status-filter">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filtrar por estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending">Pendientes</SelectItem>
              <SelectItem value="active">Activos</SelectItem>
              <SelectItem value="suspended">Suspendidos</SelectItem>
              <SelectItem value="cancelled">Cancelados</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Subscriptions List */}
        {filteredSubscriptions.length === 0 ? (
          <Card className="border-slate-200">
            <CardContent className="p-12 text-center">
              <CreditCard className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-slate-900 mb-2">No hay suscripciones</h2>
              <p className="text-slate-600">No se encontraron suscripciones con los filtros aplicados.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredSubscriptions.map((sub, i) => {
              const status = statusConfig[sub.status] || statusConfig.pending;
              
              return (
                <motion.div
                  key={sub.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <Card className="border-slate-200 hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex-1 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                          <div>
                            <p className="text-xs text-slate-500 uppercase tracking-wider">Usuario</p>
                            <p className="font-semibold text-slate-900">{sub.user_name}</p>
                            <p className="text-sm text-slate-600">{sub.user_email}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 uppercase tracking-wider">Empresa</p>
                            <p className="text-slate-900">{sub.company_name || 'No especificada'}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 uppercase tracking-wider">Producto</p>
                            <p className="font-semibold text-slate-900">{sub.product_name}</p>
                            <p className="text-sm text-slate-600">Plan: {sub.plan_name}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500 uppercase tracking-wider">Fecha</p>
                            <p className="text-slate-900">
                              {new Date(sub.created_at).toLocaleDateString('es-EC')}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <Badge className={status.color}>{status.label}</Badge>
                          
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-600">
                              {sub.is_enabled ? 'Habilitado' : 'Deshabilitado'}
                            </span>
                            <Switch
                              checked={sub.is_enabled}
                              onCheckedChange={() => handleToggleEnabled(sub.id, sub.is_enabled)}
                              disabled={updating === sub.id}
                              data-testid={`toggle-subscription-${sub.id}`}
                            />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminSubscriptions;
