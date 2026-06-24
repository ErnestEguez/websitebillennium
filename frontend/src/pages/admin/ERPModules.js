import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Loader2, RefreshCw, Layers, Plus, Search, X, UserPlus, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Switch } from '../../components/ui/switch';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from '../../components/ui/dialog';
import AdminLayout from '../../components/AdminLayout';
import { toast } from 'sonner';

const API = '/api';

const ModuleSwitch = ({ checked, onChange, disabled, label }) => (
  <div className="flex flex-col items-center gap-1">
    <Switch checked={!!checked} onCheckedChange={onChange} disabled={disabled} />
    <span className="text-[10px] text-slate-400">{checked ? 'ON' : 'OFF'}</span>
  </div>
);

// Searchable selector component
const SearchSelect = ({ label, placeholder, items, value, onChange, renderItem, getKey, getLabel }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!query) return items.slice(0, 50);
    const q = query.toLowerCase();
    return items.filter(i => getLabel(i).toLowerCase().includes(q)).slice(0, 50);
  }, [items, query]);

  const selected = value ? items.find(i => getKey(i) === value) : null;

  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
        >
          <span className={selected ? 'text-slate-900' : 'text-slate-400'}>
            {selected ? getLabel(selected) : placeholder}
          </span>
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
        </button>

        {open && (
          <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
            <div className="p-2 border-b border-slate-100">
              <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 rounded-md">
                <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <input
                  autoFocus
                  className="flex-1 bg-transparent text-sm outline-none text-slate-700 placeholder:text-slate-400"
                  placeholder={`Buscar ${label.toLowerCase()}...`}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
                {query && (
                  <button onClick={() => setQuery('')}>
                    <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
                  </button>
                )}
              </div>
            </div>
            <ul className="max-h-52 overflow-y-auto">
              {filtered.length === 0 ? (
                <li className="px-4 py-3 text-sm text-slate-400 text-center">Sin resultados</li>
              ) : filtered.map(item => (
                <li
                  key={getKey(item)}
                  onClick={() => { onChange(getKey(item)); setOpen(false); setQuery(''); }}
                  className={`px-4 py-2.5 text-sm cursor-pointer hover:bg-blue-50 transition-colors ${
                    getKey(item) === value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'
                  }`}
                >
                  {renderItem ? renderItem(item) : getLabel(item)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export const AdminERPModules = () => {
  const [modules, setModules]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState({});
  const [showForm, setShowForm]   = useState(false);

  // Form state
  const [authUsers, setAuthUsers]   = useState([]);
  const [empresas, setEmpresas]     = useState([]);
  const [formUser, setFormUser]     = useState('');
  const [formEmpresa, setFormEmpresa] = useState('');
  const [formVendor, setFormVendor]     = useState(false);
  const [formFinance, setFormFinance]   = useState(false);
  const [formLedger, setFormLedger]     = useState(false);
  const [formTH, setFormTH]             = useState(false);
  const [formIsAdmin, setFormIsAdmin]   = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [loadingForm, setLoadingForm] = useState(false);

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

  const openForm = async () => {
    setShowForm(true);
    setFormUser(''); setFormEmpresa('');
    setFormVendor(false); setFormFinance(false); setFormLedger(false); setFormTH(false); setFormIsAdmin(false);
    setLoadingForm(true);
    try {
      const token = localStorage.getItem('token');
      const [usersRes, empresasRes] = await Promise.all([
        axios.get(`${API}/admin/erp-users`,    { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API}/admin/erp-empresas`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setAuthUsers(usersRes.data);
      setEmpresas(empresasRes.data);
    } catch {
      toast.error('Error cargando datos del formulario');
    } finally {
      setLoadingForm(false);
    }
  };

  const handleSubmitNew = async () => {
    if (!formUser || !formEmpresa) {
      toast.warning('Selecciona un usuario y una empresa');
      return;
    }
    setSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      await axios.put(
        `${API}/admin/erp-modules/${formUser}/${formEmpresa}`,
        { vendor: formVendor, finance: formFinance, ledgerpro: formLedger, talento_humano: formTH, is_admin: formIsAdmin },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Acceso ERP creado correctamente');
      setShowForm(false);
      fetchModules();
    } catch {
      toast.error('Error al guardar. Verifica que la combinación no exista ya.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (userId, empresaId, field, value) => {
    const key = `${userId}-${empresaId}`;
    setSaving(s => ({ ...s, [key]: true }));
    setModules(prev => prev.map(m =>
      m.user_id === userId && m.empresa_id === empresaId ? { ...m, [field]: value } : m
    ));
    try {
      const token = localStorage.getItem('token');
      const current = modules.find(m => m.user_id === userId && m.empresa_id === empresaId);
      await axios.put(
        `${API}/admin/erp-modules/${userId}/${empresaId}`,
        {
          vendor:         field === 'vendor'         ? value : current.vendor,
          finance:        field === 'finance'        ? value : current.finance,
          ledgerpro:      field === 'ledgerpro'      ? value : current.ledgerpro,
          talento_humano: field === 'talento_humano' ? value : current.talento_humano,
          is_admin:       field === 'is_admin'       ? value : current.is_admin,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success('Módulos actualizados');
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

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Módulos ERP</h1>
              <p className="text-slate-500 text-sm">
                Gestiona acceso a módulos del ERP por usuario y empresa.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchModules}
              className="p-2 text-slate-400 hover:text-slate-700 transition-colors"
              title="Recargar"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
            <Button onClick={openForm} className="bg-blue-600 hover:bg-blue-700 gap-2">
              <UserPlus className="h-4 w-4" />
              Agregar usuario
            </Button>
          </div>
        </div>

        {/* Table */}
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
                    <th className="px-5 py-3 text-center font-semibold text-amber-600">Admin QI</th>
                    <th className="px-5 py-3 text-center font-semibold text-slate-600">Compras / Proveedores</th>
                    <th className="px-5 py-3 text-center font-semibold text-slate-600">Tesorería</th>
                    <th className="px-5 py-3 text-center font-semibold text-slate-600">Contabilidad</th>
                    <th className="px-5 py-3 text-center font-semibold text-slate-600">TH / Nóminas</th>
                  </tr>
                </thead>
                <tbody>
                  {modules.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-16 text-center">
                        <div className="flex flex-col items-center gap-3 text-slate-400">
                          <Layers className="h-10 w-10 opacity-30" />
                          <p className="text-sm">No hay registros aún.</p>
                          <button
                            onClick={openForm}
                            className="text-blue-600 text-sm hover:underline flex items-center gap-1"
                          >
                            <Plus className="h-3.5 w-3.5" /> Agregar el primero
                          </button>
                        </div>
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
                          <div className="flex flex-col items-center gap-1">
                            <Switch
                              checked={!!m.is_admin}
                              onCheckedChange={v => handleToggle(m.user_id, m.empresa_id, 'is_admin', v)}
                              disabled={isSaving}
                              className="data-[state=checked]:bg-amber-500"
                            />
                            <span className="text-[10px] text-amber-500 font-medium">
                              {m.is_admin ? 'ADMIN' : 'OFF'}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center">
                          <ModuleSwitch
                            checked={m.vendor}
                            onChange={v => handleToggle(m.user_id, m.empresa_id, 'vendor', v)}
                            disabled={isSaving}
                          />
                        </td>
                        <td className="px-5 py-4 text-center">
                          <ModuleSwitch
                            checked={m.finance}
                            onChange={v => handleToggle(m.user_id, m.empresa_id, 'finance', v)}
                            disabled={isSaving}
                          />
                        </td>
                        <td className="px-5 py-4 text-center">
                          <ModuleSwitch
                            checked={m.ledgerpro}
                            onChange={v => handleToggle(m.user_id, m.empresa_id, 'ledgerpro', v)}
                            disabled={isSaving}
                          />
                        </td>
                        <td className="px-5 py-4 text-center">
                          <ModuleSwitch
                            checked={m.talento_humano}
                            onChange={v => handleToggle(m.user_id, m.empresa_id, 'talento_humano', v)}
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

      {/* Add User Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-blue-600" />
              Agregar acceso ERP
            </DialogTitle>
            <DialogDescription>
              Selecciona el usuario y la empresa, luego activa los módulos que necesita.
            </DialogDescription>
          </DialogHeader>

          {loadingForm ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : (
            <div className="space-y-5 pt-2">
              {/* User selector */}
              <SearchSelect
                label="Usuario"
                placeholder="Selecciona un usuario..."
                items={authUsers}
                value={formUser}
                onChange={setFormUser}
                getKey={u => u.id}
                getLabel={u => u.email}
                renderItem={u => (
                  <div>
                    <p className="font-medium">{u.email}</p>
                  </div>
                )}
              />

              {/* Empresa selector */}
              <SearchSelect
                label="Empresa"
                placeholder="Selecciona una empresa..."
                items={empresas}
                value={formEmpresa}
                onChange={setFormEmpresa}
                getKey={e => e.id}
                getLabel={e => `${e.nombre} — ${e.ruc}`}
                renderItem={e => (
                  <div>
                    <p className="font-medium">{e.nombre}</p>
                    <p className="text-xs text-slate-400">{e.ruc}</p>
                  </div>
                )}
              />

              {/* Admin QI */}
              <div className="border border-amber-200 bg-amber-50 rounded-xl px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-semibold text-amber-800">Administrador QI</span>
                  <span className="text-xs text-amber-600">(acceso a Ajustes / Permisos)</span>
                </div>
                <Switch
                  checked={formIsAdmin}
                  onCheckedChange={setFormIsAdmin}
                  className="data-[state=checked]:bg-amber-500"
                />
              </div>

              {/* Módulos */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Módulos a habilitar
                  </p>
                </div>
                <div className="divide-y divide-slate-100">
                  {[
                    { key: 'vendor',  label: 'Compras / Proveedores',     val: formVendor,  set: setFormVendor },
                    { key: 'finance', label: 'Tesorería',                  val: formFinance, set: setFormFinance },
                    { key: 'ledger',  label: 'Contabilidad',               val: formLedger,  set: setFormLedger  },
                    { key: 'th',      label: 'Talento Humano / Nóminas',   val: formTH,      set: setFormTH      },
                  ].map(mod => (
                    <div key={mod.key} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-700">{mod.label}</span>
                        {mod.val && (
                          <Badge className="bg-green-100 text-green-700 text-xs">Activo</Badge>
                        )}
                      </div>
                      <Switch checked={mod.val} onCheckedChange={mod.set} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-1">
                <Button variant="outline" onClick={() => setShowForm(false)} disabled={submitting}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleSubmitNew}
                  disabled={submitting || !formUser || !formEmpresa}
                  className="bg-blue-600 hover:bg-blue-700 gap-2 min-w-[120px]"
                >
                  {submitting
                    ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</>
                    : <><Plus className="h-4 w-4" /> Agregar</>
                  }
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminERPModules;
