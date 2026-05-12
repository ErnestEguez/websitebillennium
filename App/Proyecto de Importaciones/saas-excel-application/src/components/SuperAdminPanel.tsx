import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Building2, Users, Plus, Edit2, Trash2, Shield, FileText } from 'lucide-react';

export default function SuperAdminPanel() {
  const [activeTab, setActiveTab] = useState<'companies' | 'users' | 'tariffs'>('companies');
  // El tab de usuarios es solo lectura — la creación/gestión de usuarios se hace desde el Portal Billennium
  
  // States for Companies
  const [companies, setCompanies] = useState<any[]>([]);
  const [isCompanyModalOpen, setCompanyModalOpen] = useState(false);
  
  // States for Users
  const [users, setUsers] = useState<any[]>([]);
  const [isUserModalOpen, setUserModalOpen] = useState(false);

  // States for Tariffs
  const [tariffs, setTariffs] = useState<any[]>([]);
  const [isTariffModalOpen, setTariffModalOpen] = useState(false);

  // Form states
  const [formData, setFormData] = useState<any>({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: companiesData, error: cError } = await supabase.from('empresas').select('*');
      const { data: usersData, error: uError } = await supabase.from('usuarios').select('*');
      const { data: tariffsData, error: tError } = await supabase.from('aranceles').select('*').order('partida', { ascending: true });
      
      if (cError) throw cError;
      if (uError) throw uError;
      if (tError) throw tError;
      
      setCompanies(companiesData || []);
      setUsers(usersData || []);
      setTariffs(tariffsData || []);
    } catch (error: any) {
      console.error(error);
      alert('Error cargando datos de Supabase: ' + error.message);
    }
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (formData.id) {
        const { error } = await supabase.from('empresas').update(formData).eq('id', formData.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('empresas').insert([formData]);
        if (error) throw error;
      }
      setCompanyModalOpen(false);
      setFormData({});
      fetchData();
    } catch (error: any) {
      console.error(error);
      alert('Error guardando empresa: ' + error.message);
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (formData.id) {
        const { error } = await supabase.from('usuarios').update(formData).eq('id', formData.id);
        if (error) throw error;
      } else {
        // En una app real de Supabase, deberías usar supabase.auth.signUp() aquí si quieres que puedan iniciar sesión.
        // Por ahora lo insertamos en la tabla 'usuarios' según la estructura actual.
        const { error } = await supabase.from('usuarios').insert([formData]);
        if (error) throw error;
      }
      setUserModalOpen(false);
      setFormData({});
      fetchData();
    } catch (error: any) {
      console.error(error);
      alert('Error guardando usuario: ' + error.message);
    }
  };

  const deleteCompany = async (id: string) => {
    if (confirm('¿Eliminar empresa?')) {
      try {
        const { error } = await supabase.from('empresas').delete().eq('id', id);
        if (error) throw error;
        fetchData();
      } catch (error: any) {
        console.error(error);
        alert('Error eliminando empresa: ' + error.message);
      }
    }
  };

  const deleteUser = async (id: string) => {
    if (confirm('¿Eliminar usuario?')) {
      try {
        const { error } = await supabase.from('usuarios').delete().eq('id', id);
        if (error) throw error;
        fetchData();
      } catch (error: any) {
        console.error(error);
        alert('Error eliminando usuario: ' + error.message);
      }
    }
  };

  const handleSaveTariff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { id, ...rest } = formData;
      const payload = {
        ...rest,
        advalorem: Number(rest.advalorem || 0),
        fodinfa: Number(rest.fodinfa || 0),
        ice: Number(rest.ice || 0),
        iva: Number(rest.iva || 0),
        fecha_actualizacion: new Date().toISOString(),
      };

      if (id) {
        const { error } = await supabase.from('aranceles').update(payload).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('aranceles').insert([payload]);
        if (error) throw error;
      }

      setTariffModalOpen(false);
      setFormData({});
      fetchData();
    } catch (error: any) {
      console.error(error);
      alert('Error guardando arancel: ' + error.message);
    }
  };

  const deleteTariff = async (id: string) => {
    if (confirm('¿Eliminar arancel?')) {
      try {
        const { error } = await supabase.from('aranceles').delete().eq('id', id);
        if (error) throw error;
        fetchData();
      } catch (error: any) {
        console.error(error);
        alert('Error eliminando arancel: ' + error.message);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center">
          <Shield className="mr-3 text-red-500" /> Panel SuperAdmin
        </h2>
        <div className="flex bg-slate-200 rounded-lg p-1 flex-wrap gap-1">
          <button
            onClick={() => setActiveTab('companies')}
            className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${activeTab === 'companies' ? 'bg-white shadow text-blue-600' : 'text-slate-600 hover:text-slate-900'}`}
          >
            <Building2 size={16} className="inline mr-2" /> Empresas
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${activeTab === 'users' ? 'bg-white shadow text-blue-600' : 'text-slate-600 hover:text-slate-900'}`}
          >
            <Users size={16} className="inline mr-2" /> Usuarios
          </button>
          <button
            onClick={() => setActiveTab('tariffs')}
            className={`px-4 py-2 rounded-md font-medium text-sm transition-colors ${activeTab === 'tariffs' ? 'bg-white shadow text-blue-600' : 'text-slate-600 hover:text-slate-900'}`}
          >
            <FileText size={16} className="inline mr-2" /> Aranceles
          </button>
        </div>
      </div>

      {activeTab === 'companies' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <h3 className="font-semibold text-slate-700">Gestión de Empresas</h3>
            <button 
              onClick={() => { setFormData({}); setCompanyModalOpen(true); }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center"
            >
              <Plus size={16} className="mr-2" /> Nueva Empresa
            </button>
          </div>
          <table className="w-full text-sm text-left text-slate-500">
            <thead className="text-xs text-slate-700 uppercase bg-slate-50">
              <tr>
                <th className="px-6 py-3">RUC</th>
                <th className="px-6 py-3">Nombre</th>
                <th className="px-6 py-3">Plan</th>
                <th className="px-6 py-3">Estado</th>
                <th className="px-6 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <tr key={company.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium text-slate-900">{company.ruc}</td>
                  <td className="px-6 py-4">{company.nombre}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
                      {company.plan_suscripcion}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${company.estado === 'ACTIVO' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {company.estado || 'ACTIVO'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => { setFormData(company); setCompanyModalOpen(true); }} className="text-blue-600 hover:text-blue-800 mr-3"><Edit2 size={16} /></button>
                    <button onClick={() => deleteCompany(company.id)} className="text-red-600 hover:text-red-800"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <div>
              <h3 className="font-semibold text-slate-700">Accesos por empresa</h3>
              <p className="text-xs text-slate-500 mt-0.5">El email debe coincidir exactamente con el correo registrado en el Portal Billennium</p>
            </div>
            <button
              onClick={() => { setFormData({ rol: 'USUARIO' }); setUserModalOpen(true); }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center"
            >
              <Plus size={16} className="mr-2" /> Dar Acceso
            </button>
          </div>
          <table className="w-full text-sm text-left text-slate-500">
            <thead className="text-xs text-slate-700 uppercase bg-slate-50">
              <tr>
                <th className="px-6 py-3">Nombre</th>
                <th className="px-6 py-3">Email</th>
                <th className="px-6 py-3">Rol</th>
                <th className="px-6 py-3">Empresa</th>
                <th className="px-6 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-6 py-4 font-medium text-slate-900">{u.nombre}</td>
                  <td className="px-6 py-4">{u.email}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-md text-xs font-medium">
                      {u.rol}
                    </span>
                  </td>
                  <td className="px-6 py-4">{companies.find(c => c.id === u.id_empresa)?.nombre || 'N/A'}</td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => { setFormData(u); setUserModalOpen(true); }} className="text-blue-600 hover:text-blue-800 mr-3"><Edit2 size={16} /></button>
                    <button onClick={() => deleteUser(u.id)} className="text-red-600 hover:text-red-800"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'tariffs' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <h3 className="font-semibold text-slate-700">Gestión Global de Aranceles</h3>
            <button 
              onClick={() => { setFormData({ advalorem: 0, fodinfa: 0.5, ice: 0, iva: 15 }); setTariffModalOpen(true); }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center"
            >
              <Plus size={16} className="mr-2" /> Nuevo Arancel
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-slate-500 min-w-[980px]">
              <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                <tr>
                  <th className="px-6 py-3">Partida</th>
                  <th className="px-6 py-3">Descripción</th>
                  <th className="px-6 py-3">Advalorem %</th>
                  <th className="px-6 py-3">Fodinfa %</th>
                  <th className="px-6 py-3">ICE %</th>
                  <th className="px-6 py-3">IVA %</th>
                  <th className="px-6 py-3">Actualizado</th>
                  <th className="px-6 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {tariffs.map((tariff) => (
                  <tr key={tariff.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-6 py-4 font-medium text-slate-900">{tariff.partida}</td>
                    <td className="px-6 py-4">{tariff.descripcion}</td>
                    <td className="px-6 py-4">{Number(tariff.advalorem || 0).toFixed(2)}</td>
                    <td className="px-6 py-4">{Number(tariff.fodinfa || 0).toFixed(2)}</td>
                    <td className="px-6 py-4">{Number(tariff.ice || 0).toFixed(2)}</td>
                    <td className="px-6 py-4">{Number(tariff.iva || 0).toFixed(2)}</td>
                    <td className="px-6 py-4">{tariff.fecha_actualizacion ? new Date(tariff.fecha_actualizacion).toLocaleDateString() : 'N/A'}</td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => { setFormData(tariff); setTariffModalOpen(true); }} className="text-blue-600 hover:text-blue-800 mr-3"><Edit2 size={16} /></button>
                      <button onClick={() => deleteTariff(tariff.id)} className="text-red-600 hover:text-red-800"><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Empresa */}
      {isCompanyModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-4">{formData.id ? 'Editar Empresa' : 'Nueva Empresa'}</h3>
            <form onSubmit={handleSaveCompany} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">RUC</label>
                <input required type="text" value={formData.ruc || ''} onChange={e => setFormData({...formData, ruc: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 border p-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Nombre de la Empresa</label>
                <input required type="text" value={formData.nombre || ''} onChange={e => setFormData({...formData, nombre: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 border p-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Plan</label>
                <select value={formData.plan_suscripcion || 'BASIC'} onChange={e => setFormData({...formData, plan_suscripcion: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 border p-2 text-sm">
                  <option value="BASIC">Basic</option>
                  <option value="PRO">Pro</option>
                  <option value="ENTERPRISE">Enterprise</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setCompanyModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-medium">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Acceso de Usuario */}
      {isUserModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-1">{formData.id ? 'Editar Acceso' : 'Dar Acceso a Importaciones'}</h3>
            <p className="text-xs text-slate-500 mb-4">El email debe ser exactamente el mismo que usa el usuario para ingresar al Portal Billennium. No se crea contraseña — el acceso es via el Portal.</p>
            <form onSubmit={handleSaveUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Nombre completo</label>
                <input required type="text" value={formData.nombre || ''} onChange={e => setFormData({...formData, nombre: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 border p-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Email (del Portal Billennium)</label>
                <input required type="email" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 border p-2 text-sm" placeholder="correo@empresa.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Empresa</label>
                <select required value={formData.id_empresa || ''} onChange={e => setFormData({...formData, id_empresa: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 border p-2 text-sm">
                  <option value="">Seleccione una empresa</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Rol</label>
                <select value={formData.rol || 'USUARIO'} onChange={e => setFormData({...formData, rol: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 border p-2 text-sm">
                  <option value="ADMIN_EMPRESA">Administrador de Empresa</option>
                  <option value="USUARIO">Usuario Regular</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => { setUserModalOpen(false); setFormData({}); }} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-medium">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Arancel */}
      {isTariffModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6">
            <h3 className="text-lg font-bold mb-4">{formData.id ? 'Editar Arancel' : 'Nuevo Arancel'}</h3>
            <form onSubmit={handleSaveTariff} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Partida</label>
                  <input required type="text" value={formData.partida || ''} onChange={e => setFormData({...formData, partida: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 border p-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">IVA %</label>
                  <input required type="number" step="0.01" value={formData.iva ?? 15} onChange={e => setFormData({...formData, iva: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 border p-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Descripción</label>
                <textarea required value={formData.descripcion || ''} onChange={e => setFormData({...formData, descripcion: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 border p-2 text-sm min-h-[96px]" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Advalorem %</label>
                  <input required type="number" step="0.01" value={formData.advalorem ?? 0} onChange={e => setFormData({...formData, advalorem: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 border p-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Fodinfa %</label>
                  <input required type="number" step="0.01" value={formData.fodinfa ?? 0.5} onChange={e => setFormData({...formData, fodinfa: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 border p-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">ICE %</label>
                  <input required type="number" step="0.01" value={formData.ice ?? 0} onChange={e => setFormData({...formData, ice: e.target.value})} className="mt-1 block w-full rounded-md border-slate-300 border p-2 text-sm" />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setTariffModalOpen(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg text-sm font-medium">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg text-sm font-medium">Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
