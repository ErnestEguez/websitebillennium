import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { Building2, Search, Plus, Settings, Check, X } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Checkbox } from '../components/ui/checkbox';
import AdminLayout from '../components/AdminLayout';
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

export const AdminCompanies = () => {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingCompany, setEditingCompany] = useState(null);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/admin/companies`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCompanies(response.data);
    } catch (error) {
      console.error('Error fetching companies:', error);
      toast.error('Error al cargar las empresas');
    } finally {
      setLoading(false);
    }
  };

  const handleEditProducts = (company) => {
    setEditingCompany(company);
    setSelectedProducts(company.enabled_products || []);
  };

  const handleProductToggle = (productId) => {
    setSelectedProducts(prev => 
      prev.includes(productId)
        ? prev.filter(p => p !== productId)
        : [...prev, productId]
    );
  };

  const handleSaveProducts = async () => {
    if (!editingCompany) return;
    
    setUpdating(true);
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API}/admin/companies/${editingCompany.id}`, {
        enabled_products: selectedProducts
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setCompanies(comps => comps.map(c => 
        c.id === editingCompany.id ? { ...c, enabled_products: selectedProducts } : c
      ));
      
      toast.success('Productos actualizados correctamente');
      setEditingCompany(null);
    } catch (error) {
      toast.error('Error al actualizar los productos');
    } finally {
      setUpdating(false);
    }
  };

  const handleToggleActive = async (companyId, currentActive) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API}/admin/companies/${companyId}`, {
        is_active: !currentActive
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setCompanies(comps => comps.map(c => 
        c.id === companyId ? { ...c, is_active: !currentActive } : c
      ));
      
      toast.success(`Empresa ${!currentActive ? 'activada' : 'desactivada'}`);
    } catch (error) {
      toast.error('Error al actualizar la empresa');
    }
  };

  const filteredCompanies = companies.filter(company => 
    company.name?.toLowerCase().includes(search.toLowerCase()) ||
    company.email?.toLowerCase().includes(search.toLowerCase()) ||
    company.ruc?.toLowerCase().includes(search.toLowerCase())
  );

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
          <h1 className="text-2xl font-bold text-slate-900">Empresas</h1>
          <p className="text-slate-600">Gestiona las empresas y sus productos autorizados</p>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar por nombre, email o RUC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
            data-testid="companies-search"
          />
        </div>

        {/* Companies List */}
        {filteredCompanies.length === 0 ? (
          <Card className="border-slate-200">
            <CardContent className="p-12 text-center">
              <Building2 className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-slate-900 mb-2">No hay empresas</h2>
              <p className="text-slate-600">
                Las empresas se crean cuando los usuarios registran su información de empresa.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredCompanies.map((company, i) => (
              <motion.div
                key={company.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <Card className="border-slate-200 hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-cyan-50 text-cyan-600 flex items-center justify-center">
                          <Building2 className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{company.name}</p>
                          <p className="text-sm text-slate-600">{company.email}</p>
                          {company.ruc && (
                            <p className="text-xs text-slate-500">RUC: {company.ruc}</p>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex flex-wrap gap-1">
                          {company.enabled_products?.length > 0 ? (
                            company.enabled_products.map(productId => {
                              const product = PRODUCTS.find(p => p.id === productId);
                              return product ? (
                                <Badge key={productId} variant="secondary" className="text-xs">
                                  {product.name}
                                </Badge>
                              ) : null;
                            })
                          ) : (
                            <Badge variant="outline" className="text-xs text-slate-500">
                              Sin productos asignados
                            </Badge>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={company.is_active}
                            onCheckedChange={() => handleToggleActive(company.id, company.is_active)}
                            data-testid={`toggle-company-${company.id}`}
                          />
                          <span className="text-sm text-slate-600">
                            {company.is_active ? 'Activa' : 'Inactiva'}
                          </span>
                        </div>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditProducts(company)}
                          data-testid={`edit-products-${company.id}`}
                        >
                          <Settings className="h-4 w-4 mr-1" />
                          Productos
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        {/* Edit Products Dialog */}
        <Dialog open={!!editingCompany} onOpenChange={() => setEditingCompany(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Productos Autorizados</DialogTitle>
              <DialogDescription>
                Selecciona los productos que puede usar {editingCompany?.name}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              {PRODUCTS.map((product) => (
                <div key={product.id} className="flex items-center space-x-3">
                  <Checkbox
                    id={product.id}
                    checked={selectedProducts.includes(product.id)}
                    onCheckedChange={() => handleProductToggle(product.id)}
                    data-testid={`product-checkbox-${product.id}`}
                  />
                  <Label htmlFor={product.id} className="cursor-pointer">
                    {product.name}
                  </Label>
                </div>
              ))}
            </div>
            
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setEditingCompany(null)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleSaveProducts} 
                disabled={updating}
                className="bg-blue-600 hover:bg-blue-700"
                data-testid="save-products-btn"
              >
                {updating ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminCompanies;
