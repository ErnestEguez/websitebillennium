import { useState, useEffect } from 'react';
import { UserPlus, Edit2, Trash2, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Cliente } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function ClienteManager() {
  const { vendedor } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    ruc: '',
    nombres_completos: '',
    nombre_negocio: '',
    correo: '',
    telefono: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .order('nombres_completos', { ascending: true });

      if (error) throw error;
      setClientes(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const normalizarTelefono = (telefono: string): string => {
    if (!telefono) return '';
    const soloNumeros = telefono.replace(/\D/g, '');
    if (soloNumeros.startsWith('09')) {
      return '593' + soloNumeros.substring(1);
    }
    if (soloNumeros.startsWith('593')) {
      return soloNumeros;
    }
    if (soloNumeros.startsWith('9') && soloNumeros.length === 9) {
      return '593' + soloNumeros;
    }
    return soloNumeros;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!vendedor?.empresa_id) {
        throw new Error('No se encontró la empresa del vendedor');
      }

      const telefonoNormalizado = normalizarTelefono(formData.telefono);

      if (editingId) {
        const { error: updateError } = await supabase
          .from('clientes')
          .update({
            nombres_completos: formData.nombres_completos,
            nombre_negocio: formData.nombre_negocio || null,
            correo: formData.correo || null,
            telefono: telefonoNormalizado || null,
          })
          .eq('ruc', editingId);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('clientes')
          .insert([{
            ruc: formData.ruc,
            nombres_completos: formData.nombres_completos,
            nombre_negocio: formData.nombre_negocio || null,
            correo: formData.correo || null,
            telefono: telefonoNormalizado || null,
            empresa_id: vendedor.empresa_id
          }]);

        if (insertError) throw insertError;
      }

      setFormData({ ruc: '', nombres_completos: '', nombre_negocio: '', correo: '', telefono: '' });
      setShowForm(false);
      setEditingId(null);
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (cliente: Cliente) => {
    setFormData({
      ruc: cliente.ruc,
      nombres_completos: cliente.nombres_completos,
      nombre_negocio: (cliente as any).nombre_negocio || '',
      correo: cliente.correo || '',
      telefono: cliente.telefono || '',
    });
    setEditingId(cliente.ruc);
    setShowForm(true);
  };

  const handleDelete = async (ruc: string) => {
    if (!confirm('¿Está seguro de eliminar este cliente? Esta acción no se puede deshacer.')) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from('clientes')
        .delete()
        .eq('ruc', ruc);

      if (error) throw error;
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredClientes = clientes.filter(cliente =>
    cliente.nombres_completos.toLowerCase().includes(searchTerm.toLowerCase()) ||
    cliente.ruc.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Gestión de Clientes</h2>
        <button
          onClick={() => {
            setShowForm(!showForm);
            setEditingId(null);
            setFormData({ ruc: '', nombres_completos: '', nombre_negocio: '', correo: '', telefono: '' });
          }}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <UserPlus className="h-5 w-5 mr-2" />
          Nuevo Cliente
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold mb-4">
            {editingId ? 'Editar Cliente' : 'Nuevo Cliente'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                RUC/Cédula *
              </label>
              <input
                type="text"
                value={formData.ruc}
                onChange={(e) => setFormData({ ...formData, ruc: e.target.value })}
                disabled={!!editingId}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre Completo *
              </label>
              <input
                type="text"
                value={formData.nombres_completos}
                onChange={(e) => setFormData({ ...formData, nombres_completos: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre del Negocio
              </label>
              <input
                type="text"
                value={formData.nombre_negocio}
                onChange={(e) => setFormData({ ...formData, nombre_negocio: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Opcional"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Correo
              </label>
              <input
                type="email"
                value={formData.correo}
                onChange={(e) => setFormData({ ...formData, correo: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Teléfono (ej: 0980136389)
              </label>
              <input
                type="text"
                value={formData.telefono}
                onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="0980136389"
              />
            </div>
          </div>
          <div className="flex justify-end space-x-3 mt-4">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingId(null);
                setFormData({ ruc: '', nombres_completos: '', nombre_negocio: '', correo: '', telefono: '' });
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Guardando...' : (editingId ? 'Actualizar' : 'Crear')}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por nombre o RUC..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">RUC</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Negocio</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Correo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Teléfono</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    Cargando...
                  </td>
                </tr>
              ) : filteredClientes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    No hay clientes registrados
                  </td>
                </tr>
              ) : (
                filteredClientes.map((cliente) => (
                  <tr key={cliente.ruc} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {cliente.ruc}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {cliente.nombres_completos}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {(cliente as any).nombre_negocio || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {cliente.correo || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {cliente.telefono || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-center">
                      <div className="flex justify-center space-x-2">
                        <button
                          onClick={() => handleEdit(cliente)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(cliente.ruc)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
