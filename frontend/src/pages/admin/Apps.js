import { useState } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { Smartphone, FileText, Ship, BookOpen, ExternalLink, Loader2, Lock } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import AdminLayout from '../../components/AdminLayout';

const API = '/api';

const ADMIN_APPS = [
  {
    id: 'sentinel',
    name: 'Pedidos Sentinel',
    description: 'Sistema de toma de pedidos y proformas para equipos de ventas. Gestión de vendedores, empresas, artículos y clientes.',
    icon: Smartphone,
    color: 'bg-blue-50 text-blue-600',
    available: true,
  },
  {
    id: 'facturacion',
    name: 'Facturación Electrónica',
    description: 'Emisión de comprobantes electrónicos SRI. Facturas, notas de crédito, retenciones y guías de remisión.',
    icon: FileText,
    color: 'bg-purple-50 text-purple-600',
    available: false,
  },
  {
    id: 'importaciones',
    name: 'Módulo de Importaciones',
    description: 'Control de órdenes de compra internacionales, seguimiento de embarques y cálculo de costos.',
    icon: Ship,
    color: 'bg-cyan-50 text-cyan-600',
    available: true,
  },
  {
    id: 'conta',
    name: 'LedgerPro Contabilidad',
    description: 'Sistema contable completo con plan de cuentas, asientos, balances y reportes financieros.',
    icon: BookOpen,
    color: 'bg-green-50 text-green-600',
    available: false,
  },
];

export const AdminApps = () => {
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState('');

  const handleEnterApp = async (appId) => {
    setLoading(appId);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API}/admin/apps/${appId}/enter`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      window.open(response.data.url, '_blank');
    } catch (err) {
      const msg = err.response?.data?.detail || 'Error al generar acceso. Intenta de nuevo.';
      setError(msg);
    } finally {
      setLoading(null);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Administrar Aplicaciones</h1>
          <p className="text-slate-600">Accede al panel de administración de cada producto Billennium.</p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-6">
          {ADMIN_APPS.map((app) => {
            const Icon = app.icon;
            return (
              <motion.div
                key={app.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className={`h-full border-slate-200 ${app.available ? 'hover:shadow-lg hover:border-blue-200' : 'opacity-60'} transition-all`}>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className={`w-12 h-12 rounded-xl ${app.color} flex items-center justify-center`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <Badge className={app.available ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}>
                        {app.available ? 'Disponible' : 'Próximamente'}
                      </Badge>
                    </div>

                    <h3 className="text-lg font-semibold text-slate-900 mb-2">{app.name}</h3>
                    <p className="text-sm text-slate-600 mb-6">{app.description}</p>

                    {app.available ? (
                      <Button
                        className="w-full bg-slate-800 hover:bg-slate-700"
                        onClick={() => handleEnterApp(app.id)}
                        disabled={loading === app.id}
                      >
                        {loading === app.id ? (
                          <><Loader2 className="h-4 w-4 animate-spin mr-2" />Abriendo panel...</>
                        ) : (
                          <><ExternalLink className="h-4 w-4 mr-2" />Administrar</>
                        )}
                      </Button>
                    ) : (
                      <Button disabled className="w-full">
                        <Lock className="h-4 w-4 mr-2" />En desarrollo
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminApps;
