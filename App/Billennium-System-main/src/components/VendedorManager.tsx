import { useState, useEffect } from 'react';
import { Edit, Check, X, Info, UserPlus, Loader2 } from 'lucide-react';
import { supabase, Vendedor, Empresa } from '../lib/supabase';

interface PortalUser {
  id: string;
  name: string;
  email: string;
  company_name: string | null;
}

// Producción: usa proxy Vercel mismo origen (/portal-api → billenniumsystem.com/api)
// Desarrollo: usa localhost:8000/api directamente
const PORTAL_API_BASE = import.meta.env.VITE_PORTAL_API_URL
  ? `${import.meta.env.VITE_PORTAL_API_URL}/api`
  : '/portal-api';

export function VendedorManager() {
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Estado edición catálogo
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    nombre: '', email: '', telefono: '', empresa_id: '', codven_erp: '', is_office: false,
  });

  // Estado modal "Añadir desde Portal"
  const [showPortalModal, setShowPortalModal] = useState(false);
  const [portalUsers, setPortalUsers] = useState<PortalUser[]>([]);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [portalError, setPortalError] = useState('');
  const [creatingVendedor, setCreatingVendedor] = useState(false);
  const [createdResult, setCreatedResult] = useState<{ message: string; temp_password?: string; note?: string } | null>(null);
  const [portalForm, setPortalForm] = useState({
    selectedUserId: '', empresa_id: '', codven_erp: '', is_office: false,
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      const { data: eData, error: eErr } = await supabase.from('empresas').select('*').order('nombre_comercial');
      if (eErr) setError('Error al cargar empresas: ' + eErr.message);
      else setEmpresas(eData || []);

      const { data: vData, error: vErr } = await supabase.from('vendedores').select('*').eq('is_admin', false).order('nombre');
      if (vErr) setError(prev => prev ? prev + ' | ' + vErr.message : 'Error al cargar vendedores: ' + vErr.message);
      else setVendedores(vData || []);
    } catch (err: any) {
      setError('Error inesperado: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Edición de datos de catálogo ──────────────────────────────

  const normalizarTelefono = (tel: string) => {
    if (!tel) return '';
    const n = tel.replace(/\D/g, '');
    if (n.startsWith('09')) return '593' + n.substring(1);
    if (n.startsWith('593')) return n;
    if (n.startsWith('9') && n.length === 9) return '593' + n;
    return n;
  };

  const handleEdit = (v: Vendedor) => {
    setFormData({ nombre: v.nombre, email: v.email || '', telefono: v.telefono || '', empresa_id: v.empresa_id || '', codven_erp: v.codven_erp?.toString() || '', is_office: v.is_office || false });
    setEditingId(v.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setLoading(true);
    setError('');
    try {
      const { error: updateError } = await supabase.from('vendedores').update({
        nombre: formData.nombre,
        telefono: normalizarTelefono(formData.telefono),
        empresa_id: formData.empresa_id,
        codven_erp: formData.codven_erp.trim() ? parseInt(formData.codven_erp) : null,
        is_office: formData.is_office,
      }).eq('id', editingId);
      if (updateError) throw updateError;
      setShowForm(false);
      setEditingId(null);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({ nombre: '', email: '', telefono: '', empresa_id: '', codven_erp: '', is_office: false });
    setShowForm(false);
    setEditingId(null);
    setError('');
  };

  // ── Modal "Añadir desde Portal" ───────────────────────────────

  const openPortalModal = async () => {
    setShowPortalModal(true);
    setPortalError('');
    setCreatedResult(null);
    setPortalForm({ selectedUserId: '', empresa_id: '', codven_erp: '', is_office: false });
    setLoadingPortal(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sin sesión activa en App Pedidos');

      const res = await fetch(`${PORTAL_API_BASE}/apps/sentinel/available-users`, {
        headers: { 'X-Auth-Token': session.access_token },
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Error al obtener usuarios del Portal');
      }

      const users: PortalUser[] = await res.json();
      setPortalUsers(users);
    } catch (err: any) {
      setPortalError(err.message);
    } finally {
      setLoadingPortal(false);
    }
  };

  const handleCreateFromPortal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!portalForm.selectedUserId || !portalForm.empresa_id) return;

    setCreatingVendedor(true);
    setPortalError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Sin sesión activa');

      const res = await fetch(`${PORTAL_API_BASE}/apps/sentinel/vendedores`, {
        method: 'POST',
        headers: {
          'X-Auth-Token': session.access_token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          portal_user_id: portalForm.selectedUserId,
          empresa_id: portalForm.empresa_id,
          codven_erp: portalForm.codven_erp.trim() ? parseInt(portalForm.codven_erp) : null,
          is_office: portalForm.is_office,
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.detail || 'Error al crear vendedor');

      setCreatedResult(result);
      await loadData();
    } catch (err: any) {
      setPortalError(err.message);
    } finally {
      setCreatingVendedor(false);
    }
  };

  const closePortalModal = () => {
    setShowPortalModal(false);
    setPortalUsers([]);
    setPortalError('');
    setCreatedResult(null);
  };

  // ── Render ────────────────────────────────────────────────────

  if (loading && vendedores.length === 0) {
    return <div className="text-center py-8">Cargando vendedores...</div>;
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gray-900">Vendedores</h2>
        {!showForm && (
          <button
            onClick={openPortalModal}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <UserPlus className="h-5 w-5 mr-2" />
            Añadir desde Portal
          </button>
        )}
      </div>

      {/* Aviso */}
      <div className="mb-6 flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-blue-800">Usuarios gestionados desde el Portal Billennium</p>
          <p className="text-sm text-blue-700 mt-0.5">
            Usa "Añadir desde Portal" para dar acceso a usuarios que ya tienen suscripción activa de Pedidos Sentinel.
            Aquí puedes editar datos de catálogo: empresa, teléfono, código ERP y rol de oficina.
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Formulario edición catálogo */}
      {showForm && editingId && (
        <form onSubmit={handleSubmit} className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-semibold mb-4">Editar datos del vendedor</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
              <input type="text" required value={formData.nombre} onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email (solo lectura)</label>
              <input type="email" disabled value={formData.email}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
              <input type="tel" value={formData.telefono} onChange={e => setFormData({ ...formData, telefono: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Código ERP</label>
              <input type="number" value={formData.codven_erp} onChange={e => setFormData({ ...formData, codven_erp: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Ej: 101" />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
              <select required value={formData.empresa_id} onChange={e => setFormData({ ...formData, empresa_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                <option value="">Seleccione una empresa</option>
                {empresas.map(emp => <option key={emp.id} value={emp.id}>{emp.nombre_comercial} - {emp.ruc}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="flex items-center space-x-3 cursor-pointer p-3 bg-white border border-gray-200 rounded-lg">
                <input type="checkbox" checked={formData.is_office} onChange={e => setFormData({ ...formData, is_office: e.target.checked })}
                  className="h-5 w-5 text-blue-600 rounded border-gray-300" />
                <div>
                  <span className="text-sm font-semibold text-gray-900">¿Es usuario de Oficina Central?</span>
                  <p className="text-xs text-gray-500">Puede supervisar pedidos de su empresa</p>
                </div>
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={loading}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50">
              <Check className="h-5 w-5 mr-2" />Guardar cambios
            </button>
            <button type="button" onClick={handleCancel}
              className="flex items-center px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
              <X className="h-5 w-5 mr-2" />Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Tabla */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Nombre</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Email</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Teléfono</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Cod. ERP</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Rol</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Empresa</th>
              <th className="text-right py-3 px-4 font-semibold text-gray-700">Editar</th>
            </tr>
          </thead>
          <tbody>
            {vendedores.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-8 text-gray-500">
                No hay vendedores. Usa "Añadir desde Portal" para crear el primero.
              </td></tr>
            ) : (
              vendedores.map(v => {
                const empresa = empresas.find(e => e.id === v.empresa_id);
                return (
                  <tr key={v.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">{v.nombre}</td>
                    <td className="py-3 px-4 text-gray-600">{v.email}</td>
                    <td className="py-3 px-4">{v.telefono || '-'}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {v.codven_erp || '-'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${v.is_office ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-800'}`}>
                        {v.is_office ? 'Oficina' : 'Vendedor'}
                      </span>
                    </td>
                    <td className="py-3 px-4">{empresa?.nombre_comercial || '-'}</td>
                    <td className="py-3 px-4 text-right">
                      <button onClick={() => handleEdit(v)} className="text-blue-600 hover:text-blue-800" title="Editar datos">
                        <Edit className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal "Añadir desde Portal" */}
      {showPortalModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex justify-between items-center p-6 border-b">
              <h3 className="text-xl font-bold text-gray-900">Añadir vendedor desde Portal</h3>
              <button onClick={closePortalModal} className="text-gray-400 hover:text-gray-600"><X className="h-6 w-6" /></button>
            </div>

            <div className="p-6">
              {/* Resultado exitoso */}
              {createdResult ? (
                <div className="space-y-4">
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <p className="font-semibold text-green-800">{createdResult.message}</p>
                    <p className="text-sm text-green-700 mt-1">
                      El usuario podrá acceder a la app desde el Portal Billennium usando su cuenta habitual.
                    </p>
                  </div>
                  <button onClick={closePortalModal}
                    className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Cerrar
                  </button>
                </div>
              ) : (
                <>
                  {/* Cargando usuarios */}
                  {loadingPortal ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                      <span className="ml-3 text-gray-600">Cargando usuarios del Portal...</span>
                    </div>
                  ) : portalError ? (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-600">{portalError}</p>
                    </div>
                  ) : portalUsers.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <p className="font-medium">No hay usuarios disponibles</p>
                      <p className="text-sm mt-1">Todos los usuarios con suscripción Sentinel activa ya tienen acceso, o no hay suscripciones activas.</p>
                    </div>
                  ) : (
                    <form onSubmit={handleCreateFromPortal} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Usuario del Portal ({portalUsers.length} disponible{portalUsers.length !== 1 ? 's' : ''})
                        </label>
                        <select required value={portalForm.selectedUserId}
                          onChange={e => setPortalForm({ ...portalForm, selectedUserId: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                          <option value="">Seleccionar usuario...</option>
                          {portalUsers.map(u => (
                            <option key={u.id} value={u.id}>
                              {u.name} — {u.email}{u.company_name ? ` (${u.company_name})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Empresa en App Pedidos</label>
                        <select required value={portalForm.empresa_id}
                          onChange={e => setPortalForm({ ...portalForm, empresa_id: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                          <option value="">Seleccionar empresa...</option>
                          {empresas.map(emp => (
                            <option key={emp.id} value={emp.id}>{emp.nombre_comercial} - {emp.ruc}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Código ERP (opcional)</label>
                        <input type="number" value={portalForm.codven_erp}
                          onChange={e => setPortalForm({ ...portalForm, codven_erp: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          placeholder="Ej: 101" />
                      </div>

                      <label className="flex items-center space-x-3 cursor-pointer p-3 bg-gray-50 border border-gray-200 rounded-lg">
                        <input type="checkbox" checked={portalForm.is_office}
                          onChange={e => setPortalForm({ ...portalForm, is_office: e.target.checked })}
                          className="h-5 w-5 text-blue-600 rounded border-gray-300" />
                        <div>
                          <span className="text-sm font-semibold text-gray-900">¿Es usuario de Oficina Central?</span>
                          <p className="text-xs text-gray-500">Puede supervisar pedidos de su empresa</p>
                        </div>
                      </label>

                      {portalError && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                          <p className="text-sm text-red-600">{portalError}</p>
                        </div>
                      )}

                      <div className="flex gap-2 pt-2">
                        <button type="submit" disabled={creatingVendedor}
                          className="flex-1 flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                          {creatingVendedor ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creando acceso...</> : 'Crear acceso'}
                        </button>
                        <button type="button" onClick={closePortalModal}
                          className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
                          Cancelar
                        </button>
                      </div>
                    </form>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
