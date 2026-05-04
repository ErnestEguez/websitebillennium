import { useState, useEffect } from 'react';
import { Building2, Save, Copy, Check, Plus, Trash2, Upload, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { Empresa } from '../lib/supabase';

export function EmpresaConfig() {
  const { vendedor } = useAuth();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaSeleccionada, setEmpresaSeleccionada] = useState<Empresa | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [modoNueva, setModoNueva] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    cargarEmpresas();
  }, []);

  const cargarEmpresas = async () => {
    try {
      const { data, error } = await supabase
        .from('empresas')
        .select('*')
        .order('nombre_comercial');

      if (error) throw error;
      setEmpresas(data || []);

      // Si hay empresas y no hay una seleccionada, seleccionar la del vendedor o la primera
      if (data && data.length > 0 && !empresaSeleccionada) {
        const empresaDelVendedor = data.find(e => e.id === vendedor?.empresa_id);
        setEmpresaSeleccionada(empresaDelVendedor || data[0]);
      }
    } catch (err) {
      console.error('Error cargando empresas:', err);
      setError('Error al cargar las empresas');
    } finally {
      setLoading(false);
    }
  };

  const handleNuevaEmpresa = () => {
    setModoNueva(true);
    setEmpresaSeleccionada({
      id: '',
      ruc: '',
      nombre_comercial: '',
      representante_legal: '',
      direccion: '',
      telefonos: '',
      correos: '',
      logo_url: null,
      habilitar_proformas: true,
      habilitar_pedidos: true,
      activo: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    setError('');
    setSuccess('');
  };

  const handleSeleccionarEmpresa = (empresa: Empresa) => {
    setModoNueva(false);
    setEmpresaSeleccionada(empresa);
    setError('');
    setSuccess('');
  };

  const handleEliminarEmpresa = async (empresaId: string, nombreEmpresa: string) => {
    if (!confirm(`¿Está seguro de eliminar la empresa "${nombreEmpresa}"? Esta acción es permanente.`)) return;

    try {
      setError('');
      setSaving(true);

      const [proformasRes, vendedoresRes, articulosRes] = await Promise.all([
        supabase.from('proformas').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
        supabase.from('vendedores').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
        supabase.from('articulos').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
      ]);

      const hasProformas = (proformasRes.count ?? 0) > 0;
      const hasVendedores = (vendedoresRes.count ?? 0) > 0;
      const hasArticulos = (articulosRes.count ?? 0) > 0;

      if (hasProformas || hasVendedores || hasArticulos) {
        const reasons = [];
        if (hasProformas) reasons.push('proformas');
        if (hasVendedores) reasons.push('vendedores');
        if (hasArticulos) reasons.push('artículos');

        setError(`No se puede eliminar la empresa porque tiene ${reasons.join(', ')} asociados.`);
        return;
      }

      const { error: deleteError } = await supabase
        .from('empresas')
        .delete()
        .eq('id', empresaId);

      if (deleteError) throw deleteError;

      setSuccess('Empresa eliminada correctamente');
      await cargarEmpresas();
      setEmpresaSeleccionada(null);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Error al eliminar: ' + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empresaSeleccionada) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      if (modoNueva) {
        const { data, error } = await supabase
          .from('empresas')
          .insert({
            ruc: empresaSeleccionada.ruc,
            nombre_comercial: empresaSeleccionada.nombre_comercial,
            representante_legal: empresaSeleccionada.representante_legal,
            direccion: empresaSeleccionada.direccion,
            telefonos: empresaSeleccionada.telefonos,
            correos: empresaSeleccionada.correos,
            logo_url: empresaSeleccionada.logo_url || null,
            habilitar_proformas: empresaSeleccionada.habilitar_proformas,
            habilitar_pedidos: empresaSeleccionada.habilitar_pedidos,
          })
          .select()
          .single();

        if (error) throw error;

        setSuccess('Empresa creada correctamente');
        setModoNueva(false);
        await cargarEmpresas();
        setEmpresaSeleccionada(data);
      } else {
        const { error } = await supabase
          .from('empresas')
          .update({
            ruc: empresaSeleccionada.ruc,
            nombre_comercial: empresaSeleccionada.nombre_comercial,
            representante_legal: empresaSeleccionada.representante_legal,
            direccion: empresaSeleccionada.direccion,
            telefonos: empresaSeleccionada.telefonos,
            correos: empresaSeleccionada.correos,
            logo_url: empresaSeleccionada.logo_url || null,
            habilitar_proformas: empresaSeleccionada.habilitar_proformas,
            habilitar_pedidos: empresaSeleccionada.habilitar_pedidos,
          })
          .eq('id', empresaSeleccionada.id);

        if (error) throw error;

        setSuccess('Empresa actualizada correctamente');
        await cargarEmpresas();
      }

      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Error al guardar: ' + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const copiarId = async () => {
    if (!empresaSeleccionada?.id) return;
    try {
      await navigator.clipboard.writeText(empresaSeleccionada.id);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch (err) {
      console.error('Error copiando ID:', err);
    }
  };

  const handleUploadLogo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!empresaSeleccionada || !event.target.files || event.target.files.length === 0) return;

    const file = event.target.files[0];

    if (file.size > 5 * 1024 * 1024) {
      setError('El archivo es muy grande. Máximo 5MB.');
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Tipo de archivo no permitido. Use JPG, PNG, GIF o WEBP.');
      return;
    }

    setUploadingLogo(true);
    setError('');

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${empresaSeleccionada.id || 'temp'}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      if (empresaSeleccionada.logo_url) {
        const oldPath = empresaSeleccionada.logo_url.split('/').pop();
        if (oldPath) {
          await supabase.storage.from('empresa-logos').remove([oldPath]);
        }
      }

      const { error: uploadError } = await supabase.storage
        .from('empresa-logos')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('empresa-logos')
        .getPublicUrl(filePath);

      setEmpresaSeleccionada({ ...empresaSeleccionada, logo_url: publicUrl });
      setSuccess('Logo subido correctamente. Recuerde guardar los cambios.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError('Error al subir el logo: ' + (err as Error).message);
    } finally {
      setUploadingLogo(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-600">Cargando...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Lista de empresas */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Empresas</h3>
              <button
                onClick={handleNuevaEmpresa}
                className="flex items-center px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                title="Nueva Empresa"
              >
                <Plus className="h-4 w-4 mr-1" />
                Nueva
              </button>
            </div>

            <div className="space-y-2">
              {empresas.map((emp) => (
                <div
                  key={emp.id}
                  className={`relative group rounded-lg transition-colors ${
                    empresaSeleccionada?.id === emp.id && !modoNueva
                      ? 'bg-blue-100 border-2 border-blue-500'
                      : 'bg-gray-50 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <button
                    onClick={() => handleSeleccionarEmpresa(emp)}
                    className={`w-full text-left px-3 py-2 pr-10 ${
                      empresaSeleccionada?.id === emp.id && !modoNueva
                        ? 'text-blue-900'
                        : 'text-gray-700'
                    }`}
                  >
                    <div className="font-medium text-sm truncate">{emp.nombre_comercial}</div>
                    <div className="text-xs text-gray-500 truncate">{emp.ruc}</div>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEliminarEmpresa(emp.id, emp.nombre_comercial);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-red-600 hover:text-red-800 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Eliminar empresa"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}

              {empresas.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-4">
                  No hay empresas registradas
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Formulario de empresa */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center mb-6">
              <Building2 className="h-8 w-8 text-blue-600 mr-3" />
              <h2 className="text-2xl font-bold text-gray-900">
                {modoNueva ? 'Nueva Empresa' : 'Editar Empresa'}
              </h2>
            </div>

            {empresaSeleccionada && !modoNueva && empresaSeleccionada.id && (
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <label className="block text-sm font-medium text-blue-900 mb-2">
                  ID de Empresa (UUID) - Para sincronización VB6
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-4 py-2 bg-white border border-blue-300 rounded font-mono text-sm text-blue-800 break-all">
                    {empresaSeleccionada.id}
                  </code>
                  <button
                    onClick={copiarId}
                    className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                    title="Copiar ID"
                  >
                    {copiado ? (
                      <><Check className="h-4 w-4 mr-2" /> Copiado</>
                    ) : (
                      <><Copy className="h-4 w-4 mr-2" /> Copiar</>
                    )}
                  </button>
                </div>
                <p className="text-xs text-blue-700 mt-2">
                  Use este ID en su aplicación VB6 para asociar los artículos a esta empresa
                </p>
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-600">{success}</p>
              </div>
            )}

            {!empresaSeleccionada ? (
              <div className="text-center py-12">
                <Building2 className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 mb-4">Seleccione una empresa o cree una nueva</p>
                <button
                  onClick={handleNuevaEmpresa}
                  className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Plus className="h-5 w-5 mr-2" />
                  Nueva Empresa
                </button>
              </div>
            ) : (
              <form onSubmit={handleGuardar} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label htmlFor="ruc" className="block text-sm font-medium text-gray-700 mb-2">
                      RUC
                    </label>
                    <input
                      id="ruc"
                      type="text"
                      value={empresaSeleccionada.ruc}
                      onChange={(e) => setEmpresaSeleccionada({ ...empresaSeleccionada, ruc: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="nombre_comercial" className="block text-sm font-medium text-gray-700 mb-2">
                      Nombre Comercial
                    </label>
                    <input
                      id="nombre_comercial"
                      type="text"
                      value={empresaSeleccionada.nombre_comercial}
                      onChange={(e) => setEmpresaSeleccionada({ ...empresaSeleccionada, nombre_comercial: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="representante_legal" className="block text-sm font-medium text-gray-700 mb-2">
                      Representante Legal
                    </label>
                    <input
                      id="representante_legal"
                      type="text"
                      value={empresaSeleccionada.representante_legal}
                      onChange={(e) => setEmpresaSeleccionada({ ...empresaSeleccionada, representante_legal: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="telefonos" className="block text-sm font-medium text-gray-700 mb-2">
                      Teléfonos
                    </label>
                    <input
                      id="telefonos"
                      type="text"
                      value={empresaSeleccionada.telefonos}
                      onChange={(e) => setEmpresaSeleccionada({ ...empresaSeleccionada, telefonos: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="correos" className="block text-sm font-medium text-gray-700 mb-2">
                      Correos Electrónicos
                    </label>
                    <input
                      id="correos"
                      type="text"
                      value={empresaSeleccionada.correos}
                      onChange={(e) => setEmpresaSeleccionada({ ...empresaSeleccionada, correos: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Logo de la Empresa
                    </label>

                    <div className="flex items-start gap-4">
                      {empresaSeleccionada.logo_url && (
                        <div className="flex-shrink-0">
                          <img
                            src={empresaSeleccionada.logo_url}
                            alt="Logo actual"
                            className="h-20 w-auto object-contain border border-gray-200 rounded-lg p-2 bg-white"
                          />
                        </div>
                      )}

                      <div className="flex-1">
                        <label
                          htmlFor="logo-upload"
                          className={`flex items-center justify-center px-4 py-3 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                            uploadingLogo
                              ? 'border-gray-300 bg-gray-50'
                              : 'border-blue-300 hover:border-blue-400 bg-blue-50 hover:bg-blue-100'
                          }`}
                        >
                          {uploadingLogo ? (
                            <>
                              <Upload className="h-5 w-5 text-gray-400 mr-2 animate-pulse" />
                              <span className="text-sm text-gray-600">Subiendo...</span>
                            </>
                          ) : (
                            <>
                              <ImageIcon className="h-5 w-5 text-blue-600 mr-2" />
                              <span className="text-sm font-medium text-blue-600">
                                {empresaSeleccionada.logo_url ? 'Cambiar logo' : 'Subir logo'}
                              </span>
                            </>
                          )}
                        </label>
                        <input
                          id="logo-upload"
                          type="file"
                          accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                          onChange={handleUploadLogo}
                          disabled={uploadingLogo}
                          className="hidden"
                        />
                        <p className="text-xs text-gray-500 mt-2">
                          JPG, PNG, GIF o WEBP. Máximo 5MB.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-2">
                    <label htmlFor="direccion" className="block text-sm font-medium text-gray-700 mb-2">
                      Dirección
                    </label>
                    <textarea
                      id="direccion"
                      value={empresaSeleccionada.direccion}
                      onChange={(e) => setEmpresaSeleccionada({ ...empresaSeleccionada, direccion: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows={3}
                      required
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Módulos Habilitados
                    </label>
                    <div className="flex gap-6">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={empresaSeleccionada.habilitar_proformas}
                          onChange={(e) => setEmpresaSeleccionada({ ...empresaSeleccionada, habilitar_proformas: e.target.checked })}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">Habilitar Proformas</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={empresaSeleccionada.habilitar_pedidos}
                          onChange={(e) => setEmpresaSeleccionada({ ...empresaSeleccionada, habilitar_pedidos: e.target.checked })}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">Habilitar Pedidos</span>
                      </label>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Seleccione qué módulos estarán disponibles para esta empresa
                    </p>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400 disabled:cursor-not-allowed"
                  >
                    <Save className="h-5 w-5 mr-2" />
                    {saving ? 'Guardando...' : modoNueva ? 'Crear Empresa' : 'Guardar Cambios'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
