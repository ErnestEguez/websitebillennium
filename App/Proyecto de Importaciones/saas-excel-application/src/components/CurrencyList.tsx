import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Save } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Currency {
  id: string;
  descripcion: string;
  tipo_cambio: number;
  estado: string;
  fecha_creacion: string;
}

export default function CurrencyList() {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Currency>>({});

  useEffect(() => {
    fetchCurrencies();
  }, []);

  const fetchCurrencies = async () => {
    try {
      setLoading(true);
      // Al ser global, no filtramos por id_empresa
      const { data, error } = await supabase
        .from('monedas')
        .select('*')
        .order('fecha_creacion', { ascending: false });

      if (error) throw error;
      setCurrencies(data || []);
    } catch (error: any) {
      console.error(error);
      alert('Error cargando monedas: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const currencyData = {
        descripcion: formData.descripcion,
        tipo_cambio: formData.tipo_cambio,
        estado: formData.estado || 'ACTIVO'
      };

      if (formData.id) {
        const { error } = await supabase.from('monedas').update(currencyData).eq('id', formData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('monedas').insert([currencyData]);
        if (error) throw error;
      }

      setIsModalOpen(false);
      setFormData({});
      fetchCurrencies();
    } catch (error: any) {
      console.error(error);
      alert('Error guardando moneda: ' + error.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar esta moneda?')) return;
    try {
      const { error } = await supabase.from('monedas').delete().eq('id', id);
      if (error) throw error;
      fetchCurrencies();
    } catch (error: any) {
      console.error(error);
      alert('Error eliminando moneda: ' + error.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Catálogo de Monedas (Global)</h2>
        <button
          onClick={() => {
            setFormData({ estado: 'ACTIVO', tipo_cambio: 1.0000 });
            setIsModalOpen(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Nueva Moneda
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-sm font-medium text-slate-600">Descripción</th>
                <th className="px-6 py-4 text-sm font-medium text-slate-600">Tipo de Cambio</th>
                <th className="px-6 py-4 text-sm font-medium text-slate-600">Estado</th>
                <th className="px-6 py-4 text-sm font-medium text-slate-600 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">Cargando...</td></tr>
              ) : currencies.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">No hay monedas registradas</td></tr>
              ) : (
                currencies.map((currency) => (
                  <tr key={currency.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{currency.descripcion}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{Number(currency.tipo_cambio).toFixed(4)}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${currency.estado === 'ACTIVO' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {currency.estado}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-right space-x-3">
                      <button onClick={() => { setFormData(currency); setIsModalOpen(true); }} className="text-blue-600 hover:text-blue-800">
                        <Edit2 className="w-4 h-4 inline" />
                      </button>
                      <button onClick={() => handleDelete(currency.id)} className="text-red-600 hover:text-red-800">
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800">
                {formData.id ? 'Editar Moneda' : 'Nueva Moneda'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Descripción (Ej: Dólar, Euro)</label>
                <input
                  type="text"
                  required
                  value={formData.descripcion || ''}
                  onChange={e => setFormData({...formData, descripcion: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Cambio (Respecto al Dólar)</label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  value={formData.tipo_cambio || ''}
                  onChange={e => setFormData({...formData, tipo_cambio: parseFloat(e.target.value)})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Estado</label>
                <select
                  value={formData.estado || 'ACTIVO'}
                  onChange={e => setFormData({...formData, estado: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="ACTIVO">ACTIVO</option>
                  <option value="INACTIVO">INACTIVO</option>
                </select>
              </div>

              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
