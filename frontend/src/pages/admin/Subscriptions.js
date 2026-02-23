import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { CreditCard, Search, Filter, Plus, Package } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Switch } from '../../components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Checkbox } from '../../components/ui/checkbox';
import { Label } from '../../components/ui/label';
import AdminLayout from '../../components/AdminLayout';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PRODUCTS = [
  { id: 'restoflow', name: 'RestoFlow' },
  { id: 'sentinel', name: 'Pedidos Sentinel' },
  { id: 'importaciones', name: 'Módulo de Importaciones' },
  { id: 'lopdp', name: 'LOPDP' },
  { id: 'facturacion', name: 'Facturación Electrónica' },
  { id: 'dashboard', name: 'Dashboard Empresarial' },
];

const PLANS = {
  restoflow: ['Emprendedor', 'Empresarial', 'Corporativo'],
  sentinel: ['Básico', 'Profesional', 'Corporativo'],
  importaciones: ['Estándar', 'Profesional'],
  lopdp: ['PYME', 'Empresarial'],
  facturacion: ['Básico', 'Profesional', 'Empresarial'],
  dashboard: ['Estándar', 'Profesional'],
};

const statusConfig = {
  pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  active: { label: 'Activo', color: 'bg-green-100 text-green-800' },
  suspended: { label: 'Suspendido', color: 'bg-orange-100 text-orange-800' },
  cancelled: { label: 'Cancelado', color: 'bg-red-100 text-red-800' },
};

export const AdminSubscriptions = () => {
  const [subscriptions, setSubscriptions] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [updating, setUpdating] = useState(null);
  
  // Modal para agregar producto
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('');
  const [addingProduct, setAddingProduct] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('token');
      const [subsRes, usersRes] = await Promise.all([
        axios.get(`${API}/admin/subscriptions`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API}/admin/users`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setSubscriptions(subsRes.data);
      setUsers(usersRes.data.filter(u => u.role !== 'admin'));
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar los datos');
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

  const handleAddProduct = async () => {
    if (!selectedUserId || !selectedProduct || !selectedPlan) {
      toast.error('Completa todos los campos');
      return;
    }

    setAddingProduct(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API}/admin/subscriptions/create`, {
        user_id: selectedUserId,
        product_id: selectedProduct,
        plan_name: selectedPlan
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success('Producto agregado correctamente');
      setShowAddModal(false);
      setSelectedUserId('');
      setSelectedProduct('');
      setSelectedPlan('');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Error al agregar el producto');
    } finally {
      setAddingProduct(false);
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

  // Agrupar suscripciones por usuario
  const subscriptionsByUser = {};
  filteredSubscriptions.forEach(sub => {
    if (!subscriptionsByUser[sub.user_id]) {
      subscriptionsByUser[sub.user_id] = {
        user_name: sub.user_name,
        user_email: sub.user_email,
        company_name: sub.company_name,
        subscriptions: []
      };
    }
    subscriptionsByUser[sub.user_id].subscriptions.push(sub);
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Suscripciones</h1>
            <p className="text-slate-600">Gestiona los productos autorizados para cada usuario</p>
          </div>
          <Button 
            onClick={() => setShowAddModal(true)} 
            className="bg-blue-600 hover:bg-blue-700"
            data-testid="add-product-btn"
          >
            <Plus className="h-4 w-4 mr-2" />
            Agregar Producto a Usuario
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por nombre, email, producto..."
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
            </SelectContent>
          </Select>
        </div>

        {/* Subscriptions by User */}
        {Object.keys(subscriptionsByUser).length === 0 ? (
          <Card className="border-slate-200">
            <CardContent className="p-12 text-center">
              <CreditCard className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-slate-900 mb-2">No hay suscripciones</h2>
              <p className="text-slate-600 mb-4">Agrega productos a los usuarios para que puedan acceder.</p>
              <Button onClick={() => setShowAddModal(true)} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="h-4 w-4 mr-2" />
                Agregar Producto
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {Object.entries(subscriptionsByUser).map(([userId, userData], i) => (
              <motion.div
                key={userId}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className="border-slate-200">
                  <CardContent className="p-6">
                    {/* User Header */}
                    <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
                      <div>
                        <h3 className="font-semibold text-slate-900">{userData.user_name}</h3>
                        <p className="text-sm text-slate-600">{userData.user_email}</p>
                        {userData.company_name && (
                          <p className="text-xs text-slate-500">Empresa: {userData.company_name}</p>
                        )}
                      </div>
                      <Badge variant="outline">{userData.subscriptions.length} producto(s)</Badge>
                    </div>
                    
                    {/* Products */}
                    <div className="space-y-3">
                      {userData.subscriptions.map(sub => {
                        const status = statusConfig[sub.status] || statusConfig.pending;
                        return (
                          <div key={sub.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                            <div className="flex items-center gap-3">
                              <Package className="h-5 w-5 text-slate-400" />
                              <div>
                                <p className="font-medium text-slate-900">{sub.product_name}</p>
                                <p className="text-sm text-slate-500">Plan: {sub.plan_name}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <Badge className={status.color}>{status.label}</Badge>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-slate-600">
                                  {sub.is_enabled ? 'Activo' : 'Inactivo'}
                                </span>
                                <Switch
                                  checked={sub.is_enabled}
                                  onCheckedChange={() => handleToggleEnabled(sub.id, sub.is_enabled)}
                                  disabled={updating === sub.id}
                                  data-testid={`toggle-${sub.id}`}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        {/* Add Product Modal */}
        <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Agregar Producto a Usuario</DialogTitle>
              <DialogDescription>
                Selecciona un usuario y el producto que deseas habilitarle
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Usuario</Label>
                <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                  <SelectTrigger data-testid="select-user">
                    <SelectValue placeholder="Selecciona un usuario" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map(user => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.name} ({user.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Producto</Label>
                <Select value={selectedProduct} onValueChange={(v) => { setSelectedProduct(v); setSelectedPlan(''); }}>
                  <SelectTrigger data-testid="select-product">
                    <SelectValue placeholder="Selecciona un producto" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCTS.map(product => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedProduct && PLANS[selectedProduct] && (
                <div className="space-y-2">
                  <Label>Plan</Label>
                  <Select value={selectedPlan} onValueChange={setSelectedPlan}>
                    <SelectTrigger data-testid="select-plan">
                      <SelectValue placeholder="Selecciona un plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {PLANS[selectedProduct].map(plan => (
                        <SelectItem key={plan} value={plan}>
                          {plan}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setShowAddModal(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleAddProduct} 
                disabled={addingProduct || !selectedUserId || !selectedProduct || !selectedPlan}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="confirm-add-product"
              >
                {addingProduct ? 'Agregando...' : 'Agregar y Habilitar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminSubscriptions;
