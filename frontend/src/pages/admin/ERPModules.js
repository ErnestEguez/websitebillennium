import { useState, useEffect } from 'react';
import axios from 'axios';
import { Loader2, RefreshCw, Layers } from 'lucide-react';
import { Card } from '../../components/ui/card';
import { Switch } from '../../components/ui/switch';
import AdminLayout from '../../components/AdminLayout';
import { toast } from 'sonner';

const API = '/api';

export const AdminERPModules = () => {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});

  useEffect(() => { fetchModules(); }, []);

  const fetchModules = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const { data } = await axios.get(`${API}/admin/erp-modules`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setModules(data);
    } catch {
      toast.error('Error cargando módulos ERP');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (userId, empresaId, field, value) => {
    const key = `${userId}-${empresaId}`;
    setSaving(s => ({ ...s, [key]: true }));

    // Optimistic update
    setModules(prev => prev.map(m =>
      m.user_id === userId && m.empresa_id === empresaId
        ? { ...m, [field]: value }
        : m
    ));

    try {
      const token = localStorage.getItem('token');
      const current = modules.find(m => m.user_id === userId && m.empresa_id === empresaId);
      await axios.put(
        `${API}/admin/erp-modules/${userId}/${empresaId}`,
        {
          vendor:    field === 'vendor'    ? value : current.vendor,
          finance:   field === 'finance'   ? value : current.finance,
          ledgerpro: field === 'ledgerpro' ? value : current.ledgerpro,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Módulos guardados');
    } catch {
      toast.error('Error guardando cambios');
      fetchModules();
    } finally {
      setSaving(s => ({ ...s, [key]: false }));
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Módulos ERP</h1>
              <p className="text-slate-500 text-sm">
                Activa Compras/Proveedores, Tesorería y Contabilidad por usuario.
              </p>
            </div>
          </div>
          <button
            onClick={fetchModules}
            className="p-2 text-slate-400 hover:text-slate-700 transition-colors"
            title="Recargar"
          >
            <RefreshCw className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : (
          <Card className="border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3 text-left font-semibold text-slate-600">Usuario</th>
                    <th className="px-5 py-3 text-left font-semibold text-slate-600">Empresa</th>
                    <th className="px-5 py-3 text-center font-semibold text-slate-600">Compras / Proveedores</th>
                    <th className="px-5 py-3 text-center font-semibold text-slate-600">Tesorería</th>
                    <th className="px-5 py-3 text-center font-semibold text-slate-600">Contabilidad</th>
                  </tr>
                </thead>
                <tbody>
                  {modules.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-slate-400">
                        No hay registros en la tabla de módulos.
                      </td>
                    </tr>
                  ) : modules.map((m) => {
                    const key = `${m.user_id}-${m.empresa_id}`;
                    const isSaving = saving[key];
                    return (
                      <tr key={key} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-4">
                          <p className="font-medium text-slate-900">{m.email}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-slate-700 font-medium">{m.empresa_nombre}</p>
                          {m.empresa_ruc && (
                            <p className="text-xs text-slate-400 mt-0.5">{m.empresa_ruc}</p>
                          )}
                        </td>
                        <td className="px-5 py-4 text-center">
                          <Switch
                            checked={!!m.vendor}
                            onCheckedChange={v => handleToggle(m.user_id, m.empresa_id, 'vendor', v)}
                            disabled={isSaving}
                          />
                        </td>
                        <td className="px-5 py-4 text-center">
                          <Switch
                            checked={!!m.finance}
                            onCheckedChange={v => handleToggle(m.user_id, m.empresa_id, 'finance', v)}
                            disabled={isSaving}
                          />
                        </td>
                        <td className="px-5 py-4 text-center">
                          <Switch
                            checked={!!m.ledgerpro}
                            onCheckedChange={v => handleToggle(m.user_id, m.empresa_id, 'ledgerpro', v)}
                            disabled={isSaving}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminERPModules;
