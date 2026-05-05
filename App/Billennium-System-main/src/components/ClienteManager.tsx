import { useState, useEffect } from 'react';
import { UserPlus, Edit2, Trash2, Search, MapPin } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Cliente } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { PROVINCIAS, PROVINCIAS_CIUDADES } from '../lib/ecuador';

interface FormData {
  ruc: string;
  nombres_completos: string;
  nombre_negocio: string;
  correo: string;
  telefono: string;
  direccion: string;
  provincia: string;
  ciudad: string;
}

const FORM_VACIO: FormData = {
  ruc: '', nombres_completos: '', nombre_negocio: '',
  correo: '', telefono: '', direccion: '', provincia: '', ciudad: '',
};

export function ClienteManager() {
  const { vendedor } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState<FormData>(FORM_VACIO);
  const [capturandoGeo, setCapturandoGeo] = useState(false);

  // Ciudades disponibles según provincia seleccionada
  const ciudadesDisponibles = formData.provincia ? (PROVINCIAS_CIUDADES[formData.provincia] || []) : [];

  useEffect(() => { loadData(); }, []);

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

  const normalizarTelefono = (tel: string): string => {
    if (!tel) return '';
    const n = tel.replace(/\D/g, '');
    if (n.startsWith('09')) return '593' + n.substring(1);
    if (n.startsWith('593')) return n;
    if (n.startsWith('9') && n.length === 9) return '593' + n;
    return n;
  };

  // Captura la ubicación GPS actual del dispositivo (silenciosa)
  const capturarGeolocalizacion = (): Promise<{ lat: number; lng: number } | null> => {
    return new Promise(resolve => {
      if (!navigator.geolocation) { resolve(null); return; }
      setCapturandoGeo(true);
      navigator.geolocation.getCurrentPosition(
        pos => { setCapturandoGeo(false); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
        ()  => { setCapturandoGeo(false); resolve(null); },
        { timeout: 8000, maximumAge: 60000 }
      );
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!vendedor?.empresa_id) throw new Error('No se encontró la empresa del vendedor');

      const telefonoNormalizado = normalizarTelefono(formData.telefono);

      if (editingId) {
        // Actualización — sin cambiar coordenadas existentes
        const { error: updateError } = await supabase
          .from('clientes')
          .update({
            nombres_completos: formData.nombres_completos,
            nombre_negocio:    formData.nombre_negocio || null,
            correo:            formData.correo || null,
            telefono:          telefonoNormalizado || null,
            direccion:         formData.direccion || null,
            provincia:         formData.provincia || null,
            ciudad:            formData.ciudad || null,
          })
          .eq('ruc', editingId);
        if (updateError) throw updateError;
      } else {
        // Creación — capturar geolocalización automáticamente
        const geo = await capturarGeolocalizacion();

        const { error: insertError } = await supabase
          .from('clientes')
          .insert([{
            ruc:               formData.ruc,
            nombres_completos: formData.nombres_completos,
            nombre_negocio:    formData.nombre_negocio || null,
            correo:            formData.correo || null,
            telefono:          telefonoNormalizado || null,
            empresa_id:        vendedor.empresa_id,
            direccion:         formData.direccion || null,
            provincia:         formData.provincia || null,
            ciudad:            formData.ciudad || null,
            latitud:           geo?.lat ?? null,
            longitud:          geo?.lng ?? null,
          }]);
        if (insertError) throw insertError;
      }

      setFormData(FORM_VACIO);
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
      ruc:               cliente.ruc,
      nombres_completos: cliente.nombres_completos,
      nombre_negocio:    cliente.nombre_negocio || '',
      correo:            cliente.correo || '',
      telefono:          cliente.telefono || '',
      direccion:         cliente.direccion || '',
      provincia:         cliente.provincia || '',
      ciudad:            cliente.ciudad || '',
    });
    setEditingId(cliente.ruc);
    setShowForm(true);
  };

  const handleDelete = async (ruc: string) => {
    if (!confirm('¿Está seguro de eliminar este cliente? Esta acción no se puede deshacer.')) return;
    try {
      setLoading(true);
      const { error } = await supabase.from('clientes').delete().eq('ruc', ruc);
      if (error) throw error;
      await loadData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelar = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData(FORM_VACIO);
  };

  const filteredClientes = clientes.filter(c =>
    c.nombres_completos.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.ruc.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Gestión de Clientes</h2>
        <button
          onClick={() => { setShowForm(!showForm); setEditingId(null); setFormData(FORM_VACIO); }}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <UserPlus className="h-5 w-5 mr-2" />
          Nuevo Cliente
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">{error}</div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
          <h3 className="text-lg font-semibold">{editingId ? 'Editar Cliente' : 'Nuevo Cliente'}</h3>

          {/* Datos básicos */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">RUC/Cédula *</label>
              <input type="text" value={formData.ruc}
                onChange={e => setFormData({ ...formData, ruc: e.target.value })}
                disabled={!!editingId}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo *</label>
              <input type="text" value={formData.nombres_completos}
                onChange={e => setFormData({ ...formData, nombres_completos: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del Negocio</label>
              <input type="text" value={formData.nombre_negocio}
                onChange={e => setFormData({ ...formData, nombre_negocio: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Opcional" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Correo</label>
              <input type="email" value={formData.correo}
                onChange={e => setFormData({ ...formData, correo: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
              <input type="text" value={formData.telefono}
                onChange={e => setFormData({ ...formData, telefono: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="0980136389" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dirección</label>
              <input type="text" value={formData.direccion}
                onChange={e => setFormData({ ...formData, direccion: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Calle principal y número" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Provincia</label>
              <select value={formData.provincia}
                onChange={e => setFormData({ ...formData, provincia: e.target.value, ciudad: '' })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                <option value="">Seleccionar provincia</option>
                {PROVINCIAS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad / Cantón</label>
              <select value={formData.ciudad}
                onChange={e => setFormData({ ...formData, ciudad: e.target.value })}
                disabled={!formData.provincia}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100">
                <option value="">Seleccionar ciudad</option>
                {ciudadesDisponibles.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Aviso geolocalización (solo en creación) */}
          {!editingId && (
            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-700">
              <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
              <span>
                {capturandoGeo
                  ? 'Capturando ubicación GPS…'
                  : 'Al guardar se registrará automáticamente la ubicación GPS del dispositivo.'}
              </span>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={handleCancelar}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading || capturandoGeo}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {loading || capturandoGeo ? 'Guardando…' : editingId ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </form>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input type="text" placeholder="Buscar por nombre o RUC..."
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">RUC</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Negocio</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Provincia / Ciudad</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Teléfono</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Geo</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-500">Cargando...</td></tr>
              ) : filteredClientes.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-500">No hay clientes registrados</td></tr>
              ) : filteredClientes.map(c => (
                <tr key={c.ruc} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.ruc}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{c.nombres_completos}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{c.nombre_negocio || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {c.provincia ? `${c.provincia}${c.ciudad ? ` / ${c.ciudad}` : ''}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{c.telefono || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    {c.latitud && c.longitud
                      ? <span title={`${c.latitud?.toFixed(4)}, ${c.longitud?.toFixed(4)}`}><MapPin className="h-4 w-4 text-green-500 mx-auto" /></span>
                      : <span className="text-gray-300 text-xs">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-sm text-center">
                    <div className="flex justify-center gap-2">
                      <button onClick={() => handleEdit(c)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Editar">
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDelete(c.ruc)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title="Eliminar">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
