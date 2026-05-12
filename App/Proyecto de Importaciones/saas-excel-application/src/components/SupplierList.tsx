import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Currency {
  id: string;
  descripcion: string;
}

interface Supplier {
  id: string;
  id_empresa: string;
  nombre_empresa: string;
  representante: string;
  pais: string;
  ciudad: string;
  telefono: string;
  correo: string;
  estado: string;
  id_moneda: string;
  monedas?: { descripcion: string };
}

export default function SupplierList() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Supplier>>({});
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      // 1. Obtener la empresa del usuario
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email;
      
      let currentCompanyId = null;
      if (email) {
        const { data: userDb } = await supabase.from('usuarios').select('id_empresa').eq('email', email).maybeSingle();
        currentCompanyId = userDb?.id_empresa || null;
        setCompanyId(currentCompanyId);
      }

      // 2. Obtener monedas globales activas
      const { data: currenciesData } = await supabase
        .from('monedas')
        .select('id, descripcion')
        .eq('estado', 'ACTIVO')
        .order('descripcion');
      setCurrencies(currenciesData || []);

      // 3. Obtener proveedores de esta empresa
      if (currentCompanyId) {
        const { data: suppliersData, error } = await supabase
          .from('proveedores')
          .select('*, monedas(descripcion)')
          .eq('id_empresa', currentCompanyId)
          .order('fecha_creacion', { ascending: false });
        
        if (error) throw error;
        setSuppliers(suppliersData || []);
      }
    } catch (error: any) {
      console.error(error);
      alert('Error cargando datos: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) {
      alert('Error de seguridad: No se pudo identificar a qué empresa pertenece.');
      return;
    }

    try {
      const supplierData = {
        id_empresa: companyId,
        nombre_empresa: formData.nombre_empresa,
        representante: formData.representante,
        pais: formData.pais,
        ciudad: formData.ciudad,
        telefono: formData.telefono,
        correo: formData.correo,
        estado: formData.estado || 'ACTIVO',
        id_moneda: formData.id_moneda
      };

      if (formData.id) {
        const { error } = await supabase.from('proveedores').update(supplierData).eq('id', formData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('proveedores').insert([supplierData]);
        if (error) throw error;
      }

      setIsModalOpen(false);
      setFormData({});
      fetchInitialData();
    } catch (error: any) {
      console.error(error);
      alert('Error guardando proveedor: ' + error.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar este proveedor?')) return;
    try {
      const { error } = await supabase.from('proveedores').delete().eq('id', id);
      if (error) throw error;
      fetchInitialData();
    } catch (error: any) {
      console.error(error);
      alert('Error eliminando proveedor: ' + error.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Catálogo de Proveedores</h2>
        <button
          onClick={() => {
            setFormData({ estado: 'ACTIVO' });
            setIsModalOpen(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Nuevo Proveedor
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-sm font-medium text-slate-600">Empresa / Contacto</th>
                <th className="px-6 py-4 text-sm font-medium text-slate-600">Ubicación</th>
                <th className="px-6 py-4 text-sm font-medium text-slate-600">Moneda</th>
                <th className="px-6 py-4 text-sm font-medium text-slate-600">Estado</th>
                <th className="px-6 py-4 text-sm font-medium text-slate-600 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">Cargando...</td></tr>
              ) : suppliers.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No hay proveedores registrados</td></tr>
              ) : (
                suppliers.map((supplier) => (
                  <tr key={supplier.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-slate-900">{supplier.nombre_empresa}</div>
                      <div className="text-xs text-slate-500">{supplier.representante} • {supplier.correo}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-slate-900">{supplier.pais}</div>
                      <div className="text-xs text-slate-500">{supplier.ciudad}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {supplier.monedas?.descripcion || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${supplier.estado === 'ACTIVO' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {supplier.estado}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-right space-x-3">
                      <button onClick={() => { setFormData(supplier); setIsModalOpen(true); }} className="text-blue-600 hover:text-blue-800">
                        <Edit2 className="w-4 h-4 inline" />
                      </button>
                      <button onClick={() => handleDelete(supplier.id)} className="text-red-600 hover:text-red-800">
                        <Trash2 className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800">
                {formData.id ? 'Editar Proveedor' : 'Nuevo Proveedor'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre de la Empresa *</label>
                  <input
                    type="text"
                    required
                    value={formData.nombre_empresa || ''}
                    onChange={e => setFormData({...formData, nombre_empresa: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Representante Legal</label>
                  <input
                    type="text"
                    value={formData.representante || ''}
                    onChange={e => setFormData({...formData, representante: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Correo Electrónico</label>
                  <input
                    type="email"
                    value={formData.correo || ''}
                    onChange={e => setFormData({...formData, correo: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">País</label>
                  <input
                    type="text"
                    value={formData.pais || ''}
                    onChange={e => setFormData({...formData, pais: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Ciudad</label>
                  <input
                    type="text"
                    value={formData.ciudad || ''}
                    onChange={e => setFormData({...formData, ciudad: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Teléfono</label>
                  <input
                    type="text"
                    value={formData.telefono || ''}
                    onChange={e => setFormData({...formData, telefono: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Moneda de Operación *</label>
                  <select
                    required
                    value={formData.id_moneda || ''}
                    onChange={e => setFormData({...formData, id_moneda: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="">Seleccione una moneda...</option>
                    {currencies.map(c => (
                      <option key={c.id} value={c.id}>{c.descripcion}</option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Estado</label>
                  <select
                    value={formData.estado || 'ACTIVO'}
                    onChange={e => setFormData({...formData, estado: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    <option value="ACTIVO">ACTIVO</option>
                    <option value="INACTIVO">INACTIVO</option>
                  </select>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Guardar Proveedor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
