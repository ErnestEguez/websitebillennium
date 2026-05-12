import { useState, useEffect, useRef } from 'react';
import { Search, Plus, Edit2, Trash2, X, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Product {
  id: string;
  codigo: string;
  descripcion: string;
  costo: number;
  precio: number;
  partida_senae?: string;
  arancel_detalle?: string;
}

interface Arancel {
  id: string;
  partida: string;
  descripcion: string;
}

export default function ProductList() {
  const [products, setProducts] = useState<Product[]>([]);
  const [aranceles, setAranceles] = useState<Arancel[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<Partial<Product>>({});
  const [companyId, setCompanyId] = useState<string | null>(null);
  
  // Estados para el buscador de partidas SENAE
  const [searchArancel, setSearchArancel] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchProducts();
    fetchAranceles();
    
    // Cierra la lista desplegable si se hace clic afuera
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchAranceles = async () => {
    try {
      const { data, error } = await supabase.from('aranceles').select('id, partida, descripcion').order('partida');
      if (error) throw error;
      setAranceles(data || []);
    } catch (error) {
      console.error('Error cargando aranceles:', error);
    }
  };

  const fetchProducts = async () => {
    try {
      setLoading(true);
      
      // Obtener el usuario actual y su empresa
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email;
      
      let currentCompanyId = null;
      if (email) {
        // Usamos maybeSingle() para que no rompa la aplicación si el usuario no tiene empresa
        const { data: userDb } = await supabase.from('usuarios').select('id_empresa').eq('email', email).maybeSingle();
        currentCompanyId = userDb?.id_empresa || null;
      }
      setCompanyId(currentCompanyId);

      // Cargar solo los productos de esta empresa
      let query = supabase.from('productos').select('*').order('fecha_creacion', { ascending: false });
      if (currentCompanyId) {
        query = query.eq('id_empresa', currentCompanyId);
      }

      const { data: prodData, error } = await query;
      if (error) throw error;

      // Traer los aranceles para hacer el cruce manual y evitar el error de "relationship" de Supabase
      const { data: arancelesData } = await supabase.from('aranceles').select('id, partida, descripcion');
      
      const mapped = (prodData || []).map(d => {
        const arancelRelacionado = arancelesData?.find(a => a.id === d.partida_senae);
        return {
          id: d.id,
          codigo: d.codigo || '',
          descripcion: d.descripcion || '',
          costo: d.costo || 0,
          precio: d.precio || 0,
          partida_senae: d.partida_senae || undefined,
          arancel_detalle: arancelRelacionado ? `${arancelRelacionado.partida} - ${arancelRelacionado.descripcion}` : 'Sin partida'
        };
      });
      setProducts(mapped);
    } catch (error: any) {
      console.error(error);
      alert('Error cargando productos: ' + error.message);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) {
      alert('Error: No se ha detectado la empresa. Refresque la página.');
      return;
    }
    if (!formData.partida_senae) {
      alert('Error: Debe seleccionar una partida SENAE de la lista desplegable.');
      return;
    }

    const isNew = !editingProduct;
    const prodData = {
      id_empresa: companyId,
      codigo: formData.codigo,
      descripcion: formData.descripcion,
      costo: formData.costo,
      precio: formData.precio,
      partida_senae: formData.partida_senae || null
    };

    try {
      if (isNew) {
        const { error } = await supabase.from('productos').insert([prodData]);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('productos').update(prodData).eq('id', editingProduct?.id);
        if (error) throw error;
      }
      fetchProducts();
      setIsModalOpen(false);
    } catch (error: any) {
      console.error(error);
      alert('Error al guardar: ' + error.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar producto?')) return;
    try {
      const { error } = await supabase.from('productos').delete().eq('id', id);
      if (error) throw error;
      fetchProducts();
    } catch (error: any) {
      console.error(error);
      alert('Error eliminando: ' + error.message);
    }
  };

  const openModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData(product);
      setSearchArancel(product.arancel_detalle && product.arancel_detalle !== 'Sin partida' ? product.arancel_detalle : '');
    } else {
      setEditingProduct(null);
      setFormData({ codigo: '', descripcion: '', costo: 0, precio: 0, partida_senae: '' });
      setSearchArancel('');
    }
    setIsDropdownOpen(false);
    setIsModalOpen(true);
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="relative w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Buscar por código o nombre..." 
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button onClick={() => openModal()} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          <Plus size={18} /> Nuevo Producto
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-6 py-4 font-bold text-gray-600">Código</th>
              <th className="px-6 py-4 font-bold text-gray-600">Nombre</th>
              <th className="px-6 py-4 font-bold text-gray-600">Partida SENAE</th>
              <th className="px-6 py-4 font-bold text-gray-600">Costo Base</th>
              <th className="px-6 py-4 font-bold text-gray-600">Margen</th>
              <th className="px-6 py-4 font-bold text-gray-600 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-500">Cargando productos...</td></tr>
            ) : (
              products.map((prod) => (
                <tr key={prod.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-mono text-sm">{prod.codigo}</td>
                  <td className="px-6 py-4 font-medium">{prod.descripcion}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className="flex items-center gap-1 text-blue-600">
                      {prod.arancel_detalle}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-bold">${prod.costo.toLocaleString()}</td>
                  <td className="px-6 py-4 text-emerald-600 font-bold">
                    {prod.costo > 0 ? Math.round((prod.precio/prod.costo - 1) * 100) : 0}%
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button onClick={() => openModal(prod)} className="p-2 text-gray-500 hover:text-blue-600 transition-colors">
                      <Edit2 size={18} />
                    </button>
                    <button onClick={() => handleDelete(prod.id)} className="p-2 text-gray-500 hover:text-red-600 transition-colors">
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold">{editingProduct ? 'Editar Producto' : 'Nuevo Producto'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
                <input required type="text" value={formData.codigo || ''} onChange={e => setFormData({...formData, codigo: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre / Descripción</label>
                <input required type="text" value={formData.descripcion || ''} onChange={e => setFormData({...formData, descripcion: e.target.value})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Partida SENAE</label>
                <div className="relative" ref={dropdownRef}>
                  <div className="flex items-center border rounded-lg focus-within:ring-2 focus-within:ring-blue-500 bg-white">
                    <Search className="w-5 h-5 ml-3 text-gray-400" />
                    <input 
                      type="text" 
                      placeholder="🔍 Escriba código o nombre de la partida..." 
                      value={searchArancel}
                      onChange={e => {
                        setSearchArancel(e.target.value);
                        setIsDropdownOpen(true);
                        if (!e.target.value) setFormData({...formData, partida_senae: undefined});
                      }}
                      onFocus={() => setIsDropdownOpen(true)}
                      className="w-full px-3 py-2 outline-none bg-transparent"
                    />
                    <ChevronDown className="w-5 h-5 mr-3 text-gray-400 cursor-pointer" onClick={() => setIsDropdownOpen(!isDropdownOpen)} />
                  </div>
                  
                  {isDropdownOpen && (
                    <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                      {aranceles.filter(a => a.partida.toLowerCase().includes(searchArancel.toLowerCase()) || a.descripcion.toLowerCase().includes(searchArancel.toLowerCase())).length > 0 ? (
                        aranceles.filter(a => a.partida.toLowerCase().includes(searchArancel.toLowerCase()) || a.descripcion.toLowerCase().includes(searchArancel.toLowerCase())).map(a => (
                          <div 
                            key={a.id} 
                            onClick={() => {
                              setFormData({...formData, partida_senae: a.id});
                              setSearchArancel(`${a.partida} - ${a.descripcion}`);
                              setIsDropdownOpen(false);
                            }}
                            className="px-4 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b last:border-b-0"
                          >
                            <span className="font-bold text-blue-600">{a.partida}</span> - {a.descripcion}
                          </div>
                        ))
                      ) : (
                        <div className="px-4 py-3 text-sm text-gray-500 text-center">No se encontraron partidas</div>
                      )}
                    </div>
                  )}
                </div>
                {!formData.partida_senae && <p className="text-xs text-red-500 mt-1">Seleccione una partida de la lista.</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Costo Base ($)</label>
                  <input required type="number" step="0.01" value={formData.costo || ''} onChange={e => setFormData({...formData, costo: Number(e.target.value)})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Precio Venta ($)</label>
                  <input required type="number" step="0.01" value={formData.precio || ''} onChange={e => setFormData({...formData, precio: Number(e.target.value)})} className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  Guardar Producto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
