import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Save, Receipt } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Expense {
  id: string;
  id_empresa: string;
  id_importacion?: string;
  descripcion_gasto: string;
  valor_gasto: number;
  estado: string;
  fecha_creacion: string;
  importaciones?: { numero_importacion: string };
}

export default function ExpenseList() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [imports, setImports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Expense>>({});
  const [companyId, setCompanyId] = useState<string | null>(null);

  useEffect(() => {
    fetchExpensesAndImports();
  }, []);

  const fetchExpensesAndImports = async () => {
    try {
      setLoading(true);
      
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email;
      
      let currentCompanyId = null;
      if (email) {
        const { data: userDb } = await supabase.from('usuarios').select('id_empresa').eq('email', email).maybeSingle();
        currentCompanyId = userDb?.id_empresa || null;
      }
      setCompanyId(currentCompanyId);

      if (!currentCompanyId) {
        setExpenses([]);
        setImports([]);
        setLoading(false);
        return;
      }

      // Traer gastos con el cruce a importaciones
      const { data: expensesData, error: expensesError } = await supabase
        .from('gastos')
        .select('*, importaciones(numero_importacion)')
        .eq('id_empresa', currentCompanyId)
        .order('fecha_creacion', { ascending: false });

      if (expensesError) throw expensesError;
      setExpenses(expensesData || []);

      // Traer lista de importaciones activas para el menú desplegable
      const { data: importsData, error: importsError } = await supabase
        .from('importaciones')
        .select('id, numero_importacion, fecha_importacion')
        .eq('id_empresa', currentCompanyId)
        .order('fecha_creacion', { ascending: false });

      if (!importsError && importsData) {
        setImports(importsData);
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
      alert('Error: No se ha detectado la empresa del usuario.');
      return;
    }

    if (!formData.id_importacion) {
      alert('Por favor seleccione una Importación.');
      return;
    }

    try {
      const expenseData = {
        id_empresa: companyId,
        id_importacion: formData.id_importacion,
        descripcion_gasto: formData.descripcion_gasto,
        valor_gasto: formData.valor_gasto || 0,
        estado: formData.estado || 'ACTIVO'
      };

      if (formData.id) {
        const { error } = await supabase.from('gastos').update(expenseData).eq('id', formData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('gastos').insert([expenseData]);
        if (error) throw error;
      }

      setIsModalOpen(false);
      setFormData({});
      fetchExpensesAndImports();
    } catch (error: any) {
      console.error(error);
      alert('Error guardando gasto: ' + error.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar este gasto?')) return;
    try {
      const { error } = await supabase.from('gastos').delete().eq('id', id);
      if (error) throw error;
      fetchExpensesAndImports();
    } catch (error: any) {
      console.error(error);
      alert('Error eliminando gasto: ' + error.message);
    }
  };

  const openModal = (expense?: Expense) => {
    if (expense) {
      setFormData(expense);
    } else {
      setFormData({ estado: 'ACTIVO', valor_gasto: 0 });
    }
    setIsModalOpen(true);
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Receipt className="text-blue-600" />
          Gastos
        </h2>
        <button
          onClick={() => openModal()}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 transition-colors"
        >
          <Plus size={20} />
          Nuevo Gasto
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                <th className="p-4">Importación</th>
                <th className="p-4">Descripción del Gasto</th>
                <th className="p-4 text-right">Valor</th>
                <th className="p-4">Estado</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    No hay gastos registrados.
                  </td>
                </tr>
              ) : (
                expenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 font-semibold text-blue-600">
                      #{expense.importaciones?.numero_importacion || 'S/N'}
                    </td>
                    <td className="p-4 font-medium text-slate-800">{expense.descripcion_gasto}</td>
                    <td className="p-4 text-right">${Number(expense.valor_gasto).toFixed(2)}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        expense.estado === 'ACTIVO' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {expense.estado}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex justify-center gap-2">
                        <button onClick={() => openModal(expense)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar">
                          <Edit2 size={18} />
                        </button>
                        <button onClick={() => handleDelete(expense.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar">
                          <Trash2 size={18} />
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

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="text-lg font-bold text-slate-800">
                {formData.id ? 'Editar Gasto' : 'Nuevo Gasto'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Importación *</label>
                <select
                  required
                  value={formData.id_importacion || ''}
                  onChange={(e) => setFormData({ ...formData, id_importacion: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                >
                  <option value="">Seleccione una importación...</option>
                  {imports.map((imp) => (
                    <option key={imp.id} value={imp.id}>
                      #{imp.numero_importacion} - {new Date(imp.fecha_importacion).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Descripción del Gasto *</label>
                <input
                  type="text"
                  required
                  value={formData.descripcion_gasto || ''}
                  onChange={(e) => setFormData({ ...formData, descripcion_gasto: e.target.value })}
                  className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Ej: Agente de Aduanas, Bodegaje..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Valor *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-slate-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={formData.valor_gasto || ''}
                      onChange={(e) => setFormData({ ...formData, valor_gasto: parseFloat(e.target.value) })}
                      className="w-full pl-8 p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Estado</label>
                  <select
                    value={formData.estado || 'ACTIVO'}
                    onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    <option value="ACTIVO">Activo</option>
                    <option value="INACTIVO">Inactivo</option>
                  </select>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Save size={20} />
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