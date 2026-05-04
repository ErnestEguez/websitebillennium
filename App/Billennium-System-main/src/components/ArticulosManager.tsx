import { useState, useEffect } from 'react';
import { Package, Search, Edit, Trash2, Building2, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Articulo {
  id: string;
  descripcion: string;
  precio: number;
  costo: number;
  stock: number;
  activo: boolean;
  empresa_id: string;
}

interface Empresa {
  id: string;
  ruc: string;
  nombre_comercial: string;
}

export function ArticulosManager() {
  const { vendedor } = useAuth();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaSeleccionada, setEmpresaSeleccionada] = useState<string>('');
  const [articulos, setArticulos] = useState<Articulo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingArticulos, setLoadingArticulos] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [vaciando, setVaciando] = useState(false);

  useEffect(() => {
    cargarEmpresas();
    if (vendedor?.empresa_id && !vendedor.is_admin) {
      setEmpresaSeleccionada(vendedor.empresa_id);
    }
  }, [vendedor]);

  useEffect(() => {
    if (empresaSeleccionada) {
      cargarArticulos();
    } else {
      setArticulos([]);
    }
  }, [empresaSeleccionada]);

  const cargarEmpresas = async () => {
    try {
      const { data, error } = await supabase
        .from('empresas')
        .select('id, ruc, nombre_comercial')
        .eq('activo', true)
        .order('nombre_comercial');

      if (error) throw error;
      setEmpresas(data || []);
    } catch (err) {
      console.error('Error cargando empresas:', err);
    } finally {
      setLoading(false);
    }
  };

  const cargarArticulos = async () => {
    if (!empresaSeleccionada) return;

    setLoadingArticulos(true);
    try {
      const { data, error } = await supabase
        .from('articulos')
        .select('*')
        .eq('empresa_id', empresaSeleccionada)
        .order('id');

      if (error) throw error;
      setArticulos(data || []);
    } catch (err) {
      console.error('Error cargando artículos:', err);
    } finally {
      setLoadingArticulos(false);
    }
  };

  const vaciarArticulos = async () => {
    if (!empresaSeleccionada) return;

    setVaciando(true);
    try {
      const { error } = await supabase
        .from('articulos')
        .delete()
        .eq('empresa_id', empresaSeleccionada);

      if (error) throw error;

      setArticulos([]);
      alert('Artículos eliminados exitosamente');
    } catch (err) {
      console.error('Error vaciando artículos:', err);
      alert('Error al vaciar artículos: ' + (err as Error).message);
    } finally {
      setVaciando(false);
    }
  };

  const articulosFiltrados = articulos.filter(art =>
    art.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    art.descripcion.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleActivo = async (id: string, activo: boolean) => {
    try {
      const { error } = await supabase
        .from('articulos')
        .update({ activo: !activo })
        .eq('id', id);

      if (error) throw error;
      await cargarArticulos();
    } catch (err) {
      console.error('Error actualizando artículo:', err);
      alert('Error al actualizar el artículo');
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500">
        Cargando...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-sm">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">Gestión de Artículos</h2>
          <p className="text-sm text-gray-600 mt-1">
            Los artículos se sincronizan automáticamente desde el ERP
          </p>
        </div>

        <div className="px-6 py-4 border-b border-gray-200">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Building2 className="inline h-4 w-4 mr-2" />
            Seleccione la Empresa
          </label>
          <select
            value={empresaSeleccionada}
            onChange={(e) => setEmpresaSeleccionada(e.target.value)}
            disabled={!vendedor?.is_admin}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
          >
            <option value="">-- Seleccione una empresa --</option>
            {empresas.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.nombre_comercial} ({emp.ruc})
              </option>
            ))}
          </select>
        </div>

        {empresaSeleccionada && (
          <>
            <div className="px-6 py-4 border-b border-gray-200 flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar por código o descripción..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              {vendedor?.is_admin && (
                <button
                  onClick={vaciarArticulos}
                  disabled={vaciando || articulos.length === 0}
                  className="flex items-center px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {vaciando ? 'Vaciando...' : 'Vaciar Artículos'}
                </button>
              )}
            </div>

            {loadingArticulos ? (
              <div className="text-center py-12 text-gray-500">
                Cargando artículos...
              </div>
            ) : articulosFiltrados.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                {searchTerm ? 'No se encontraron artículos' : 'No hay artículos registrados para esta empresa'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700">Código</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-700">Descripción</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-700">Precio</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-700">Costo</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-700">Stock</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-700">Estado</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-700">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {articulosFiltrados.map((articulo) => (
                      <tr key={articulo.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          <div className="flex items-center">
                            <Package className="h-4 w-4 mr-2 text-gray-400" />
                            {articulo.id}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {articulo.descripcion}
                        </td>
                        <td className="px-6 py-4 text-sm font-medium text-gray-900 text-right">
                          ${articulo.precio.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 text-right">
                          ${articulo.costo.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 text-right">
                          {articulo.stock}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${articulo.activo
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                            }`}>
                            {articulo.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex justify-center space-x-2">
                            <button
                              onClick={() => toggleActivo(articulo.id, articulo.activo)}
                              className={`p-2 rounded-lg transition-colors ${articulo.activo
                                ? 'text-gray-600 hover:bg-gray-100'
                                : 'text-green-600 hover:bg-green-50'
                                }`}
                              title={articulo.activo ? 'Desactivar' : 'Activar'}
                            >
                              {articulo.activo ? (
                                <Trash2 className="h-4 w-4" />
                              ) : (
                                <Edit className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="px-6 py-4 border-t border-gray-200 text-sm text-gray-600">
              Mostrando {articulosFiltrados.length} de {articulos.length} artículos
            </div>
          </>
        )}

        {!empresaSeleccionada && (
          <div className="px-6 py-12 text-center">
            <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Seleccione una empresa para ver sus artículos</p>
          </div>
        )}
      </div>
    </div>
  );
}
