import { useState, useEffect } from 'react';
import { Search, Plus, Trash2, DollarSign, TrendingUp, Loader2, Save, Eye, EyeOff, MapPin } from 'lucide-react';
import { proformaService, calcularUtilidad } from '../lib/proformaService';
import { pedidoService } from '../lib/pedidoService';
import type { Vendedor, Articulo, Cliente, ProformaCompleta, Empresa } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { aiService, AiSuggestion } from '../lib/aiService';
import { Sparkles, ShoppingBag } from 'lucide-react';
import { PROVINCIAS, PROVINCIAS_CIUDADES } from '../lib/ecuador';

interface DetalleItem {
  articulo_id: string;
  descripcion: string;
  cantidad: number;
  precio: number;
  costo: number;
  tasa_iva: number;
}

interface ProformaFormProps {
  tipoDocumento?: 'proforma' | 'pedido';
  onProformaCreada: () => void;
  proformaEditando?: ProformaCompleta | null;
  onCancelarEdicion?: () => void;
}

export function ProformaForm({ tipoDocumento = 'proforma', onProformaCreada, proformaEditando, onCancelarEdicion }: ProformaFormProps) {
  const { vendedor } = useAuth();
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [articulos, setArticulos] = useState<Articulo[]>([]);
  const [busquedaArticulo, setBusquedaArticulo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [empresa, setEmpresa] = useState<Empresa | null>(null);

  const [rucCliente, setRucCliente] = useState('');
  const [nombreCliente, setNombreCliente] = useState('');
  const [nombreNegocio, setNombreNegocio] = useState('');
  const [correoCliente, setCorreoCliente] = useState('');
  const [telefonoCliente, setTelefonoCliente] = useState('');
  const [clienteEncontrado, setClienteEncontrado] = useState<Cliente | null>(null);
  const [direccionCliente, setDireccionCliente] = useState('');
  const [provinciaCliente, setProvinciaCliente] = useState('');
  const [ciudadCliente, setCiudadCliente] = useState('');
  const [buscandoCliente, setBuscandoCliente] = useState(false);
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [clientesSugeridos, setClientesSugeridos] = useState<Cliente[]>([]);
  const [vendedorId, setVendedorId] = useState('');
  const [formaPago, setFormaPago] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [detalles, setDetalles] = useState<DetalleItem[]>([]);
  const [sugerenciasAi, setSugerenciasAi] = useState<AiSuggestion[]>([]);
  const [cargandoAi, setCargandoAi] = useState(false);
  const [capturandoGeo, setCapturandoGeo] = useState(false);
  const [geoCapturada, setGeoCapturada] = useState<{ lat: number; lng: number } | null>(null);
  const [showUtilidad, setShowUtilidad] = useState<boolean>(() => {
    return localStorage.getItem('pedidos_showUtilidad') !== 'false';
  });

  const capturarGeolocalizacion = (): Promise<{ lat: number; lng: number } | null> => {
    return new Promise(resolve => {
      if (!navigator.geolocation) { resolve(null); return; }
      setCapturandoGeo(true);
      navigator.geolocation.getCurrentPosition(
        pos => { setCapturandoGeo(false); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
        ()  => { setCapturandoGeo(false); resolve(null); },
        { timeout: 10000, maximumAge: 0 }
      );
    });
  };

  const handleCapturarGeoManual = async () => {
    const geo = await capturarGeolocalizacion();
    if (geo) {
      setGeoCapturada(geo);
    } else {
      alert('No se pudo obtener la ubicación. Verifica que el GPS esté activo y el navegador tenga permiso.');
    }
  };

  const toggleUtilidad = () => {
    const next = !showUtilidad;
    setShowUtilidad(next);
    localStorage.setItem('pedidos_showUtilidad', String(next));
  };

  useEffect(() => {
    cargarVendedores();
    if (proformaEditando) {
      setRucCliente(proformaEditando.ruc_cliente);
      setNombreCliente(proformaEditando.nombre_cliente);
      setVendedorId(proformaEditando.vendedor_id);
      setFormaPago(proformaEditando.forma_pago || '');
      setObservaciones(proformaEditando.observaciones || '');
      setDetalles(proformaEditando.detalles?.map(d => ({
        articulo_id: d.articulo_id,
        descripcion: d.descripcion,
        cantidad: d.cantidad,
        precio: d.precio,
        costo: d.costo,
        tasa_iva: (d as any).tasa_iva ?? 15
      })) || []);
      buscarClientePorRuc(proformaEditando.ruc_cliente);
    } else if (vendedor) {
      setVendedorId(vendedor.id);
    }
  }, [proformaEditando, vendedor]);

  useEffect(() => {
    if (vendedor?.empresa_id) {
      cargarEmpresa(vendedor.empresa_id);
    }
  }, [vendedor]);

  useEffect(() => {
    if (busquedaArticulo.length >= 2) {
      cargarArticulos();
    }
  }, [busquedaArticulo]);

  const cargarVendedores = async () => {
    try {
      const service = tipoDocumento === 'pedido' ? pedidoService : proformaService;
      const data = await service.getVendedores();
      setVendedores(data);
    } catch (err) {
      console.error('Error cargando vendedores:', err);
    }
  };

  const cargarEmpresa = async (empresaId: string) => {
    try {
      const { data, error } = await supabase
        .from('empresas')
        .select('*')
        .eq('id', empresaId)
        .maybeSingle();

      if (error) throw error;
      setEmpresa(data);
    } catch (err) {
      console.error('Error cargando empresa:', err);
    }
  };

  const cargarArticulos = async () => {
    try {
      const empresaId = vendedor?.empresa_id || undefined;
      const service = tipoDocumento === 'pedido' ? pedidoService : proformaService;
      const data = await service.getArticulos(busquedaArticulo, empresaId);
      setArticulos(data);
    } catch (err) {
      console.error('Error cargando artículos:', err);
    }
  };

  const buscarClientePorRuc = async (ruc: string) => {
    if (ruc.length < 10) {
      setClienteEncontrado(null);
      setNombreCliente('');
      setCorreoCliente('');
      setTelefonoCliente('');
      setDireccionCliente('');
      setProvinciaCliente('');
      setCiudadCliente('');
      return;
    }

    setBuscandoCliente(true);
    try {
      const service = tipoDocumento === 'pedido' ? pedidoService : proformaService;
      const cliente = await service.buscarCliente(ruc);
      if (cliente) {
        setClienteEncontrado(cliente);
        setRucCliente(cliente.ruc);
        setNombreCliente(cliente.nombres_completos);
        setNombreNegocio((cliente as any).nombre_negocio || '');
        setCorreoCliente(cliente.correo || '');
        setTelefonoCliente(cliente.telefono || '');
        setDireccionCliente(cliente.direccion || '');
        setProvinciaCliente(cliente.provincia || '');
        setCiudadCliente(cliente.ciudad || '');
      } else {
        setClienteEncontrado(null);
        setNombreCliente('');
        setNombreNegocio('');
        setCorreoCliente('');
        setTelefonoCliente('');
        setDireccionCliente('');
        setProvinciaCliente('');
        setCiudadCliente('');
      }
    } catch (err) {
      console.error('Error buscando cliente:', err);
    } finally {
      setBuscandoCliente(false);
    }
  };

  const buscarClientes = async (termino: string) => {
    if (termino.length < 2) {
      setClientesSugeridos([]);
      return;
    }

    try {
      const service = tipoDocumento === 'pedido' ? pedidoService : proformaService;
      const clientes = await service.buscarClientes(termino);
      setClientesSugeridos(clientes);
    } catch (err) {
      console.error('Error buscando clientes:', err);
      setClientesSugeridos([]);
    }
  };

  const seleccionarCliente = (cliente: Cliente) => {
    setClienteEncontrado(cliente);
    setRucCliente(cliente.ruc);
    setNombreCliente(cliente.nombres_completos);
    setNombreNegocio((cliente as any).nombre_negocio || '');
    setCorreoCliente(cliente.correo || '');
    setTelefonoCliente(cliente.telefono || '');
    setDireccionCliente(cliente.direccion || '');
    setProvinciaCliente(cliente.provincia || '');
    setCiudadCliente(cliente.ciudad || '');
    setBusquedaCliente('');
    setClientesSugeridos([]);
  };

  const handleRucChange = (ruc: string) => {
    setRucCliente(ruc);
    if (ruc.length >= 10) {
      buscarClientePorRuc(ruc);
    } else {
      setClienteEncontrado(null);
      setNombreCliente('');
      setNombreNegocio('');
      setCorreoCliente('');
      setTelefonoCliente('');
      setDireccionCliente('');
      setProvinciaCliente('');
      setCiudadCliente('');
    }
  };

  const agregarArticulo = (articulo: Articulo) => {
    const existe = detalles.find(d => d.articulo_id === articulo.id);
    if (existe) {
      setError('Este artículo ya está agregado');
      setTimeout(() => setError(''), 3000);
      return;
    }

    setDetalles([...detalles, {
      articulo_id: articulo.id,
      descripcion: articulo.descripcion,
      cantidad: 1,
      precio: articulo.precio,
      costo: articulo.costo,
      tasa_iva: (articulo as any).tasa_iva ?? 15
    }]);

    setBusquedaArticulo('');
    setArticulos([]);
    obtenerSugerencias(articulo.id, articulo.descripcion);
  };

  const obtenerSugerencias = async (id: string, descripcion: string) => {
    if (!vendedor?.empresa_id) return;
    setCargandoAi(true);
    try {
      const suggestions = await aiService.getProductSuggestions(
        [{ id, descripcion }],
        vendedor.empresa_id
      );
      setSugerenciasAi(suggestions);
    } catch (err) {
      console.error('Error al obtener sugerencias IA:', err);
    } finally {
      setCargandoAi(false);
    }
  };

  const actualizarDetalle = (index: number, campo: keyof DetalleItem, valor: string | number) => {
    const nuevosDetalles = [...detalles];
    nuevosDetalles[index] = { ...nuevosDetalles[index], [campo]: valor };
    setDetalles(nuevosDetalles);
  };

  const eliminarDetalle = (index: number) => {
    setDetalles(detalles.filter((_, i) => i !== index));
  };

  const calcularSubtotal = (item: DetalleItem) => {
    return item.cantidad * item.precio;
  };

  const calcularSubtotal2 = () => {
    return detalles.reduce((sum, item) => sum + calcularSubtotal(item), 0);
  };

  const calcularImpuesto = () => {
    return detalles.reduce((sum, item) => sum + (item.cantidad * item.precio * (item.tasa_iva / 100)), 0);
  };

  const calcularTotal = () => {
    return calcularSubtotal2() + calcularImpuesto();
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

    if (loading) return;

    setError('');

    if (!rucCliente || !nombreCliente || !vendedorId) {
      setError('Complete todos los campos del cliente y vendedor');
      return;
    }

    if (detalles.length === 0) {
      setError('Agregue al menos un artículo');
      return;
    }

    setLoading(true);
    try {
      if (!vendedor?.empresa_id) {
        throw new Error('No se encontró la empresa del vendedor');
      }

      const telefonoNormalizado = normalizarTelefono(telefonoCliente);

      const service = tipoDocumento === 'pedido' ? pedidoService : proformaService;

      if (!clienteEncontrado) {
        // Usar GPS ya capturado manualmente, o intentar captura automática
        const geo = geoCapturada ?? await capturarGeolocalizacion();
        await service.createCliente({
          ruc: rucCliente,
          nombres_completos: nombreCliente,
          nombre_negocio: nombreNegocio || null,
          correo: correoCliente || null,
          telefono: telefonoNormalizado || null,
          direccion: direccionCliente || null,
          provincia: provinciaCliente || null,
          ciudad: ciudadCliente || null,
          latitud: geo?.lat ?? null,
          longitud: geo?.lng ?? null,
        });
      } else {
        await service.updateCliente(rucCliente, {
          nombres_completos: nombreCliente,
          nombre_negocio: nombreNegocio || null,
          correo: correoCliente || null,
          telefono: telefonoNormalizado || null,
          direccion: direccionCliente || null,
          provincia: provinciaCliente || null,
          ciudad: ciudadCliente || null,
        });
      }

      if (proformaEditando) {
        if (tipoDocumento === 'pedido') {
          await pedidoService.updatePedido(
            proformaEditando.id,
            rucCliente,
            nombreCliente,
            vendedorId,
            vendedor.empresa_id,
            detalles,
            formaPago,
            observaciones
          );
        } else {
          await proformaService.updateProforma(
            proformaEditando.id,
            rucCliente,
            nombreCliente,
            vendedorId,
            vendedor.empresa_id,
            detalles,
            formaPago,
            observaciones
          );
        }
      } else {
        if (tipoDocumento === 'pedido') {
          await pedidoService.createPedido(
            rucCliente,
            nombreCliente,
            vendedorId,
            vendedor.empresa_id,
            detalles,
            formaPago,
            observaciones,
            vendedor?.codven_erp
          );
        } else {
          await proformaService.createProforma(
            rucCliente,
            nombreCliente,
            vendedorId,
            vendedor.empresa_id,
            detalles,
            formaPago,
            observaciones,
            vendedor?.codven_erp
          );
        }
      }

      setRucCliente('');
      setNombreCliente('');
      setNombreNegocio('');
      setCorreoCliente('');
      setTelefonoCliente('');
      setDireccionCliente('');
      setProvinciaCliente('');
      setCiudadCliente('');
      setGeoCapturada(null);
      setClienteEncontrado(null);
      setVendedorId('');
      setFormaPago('');
      setObservaciones('');
      setDetalles([]);

      onProformaCreada();
    } catch (err) {
      const tipoDoc = tipoDocumento === 'pedido' ? 'pedido' : 'proforma';
      setError(`Error al ${proformaEditando ? 'actualizar' : 'crear'} ${tipoDoc}: ` + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {proformaEditando && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-blue-900">
              Editando {tipoDocumento === 'pedido' ? 'Pedido' : 'Proforma'} #{proformaEditando.numero || 'Sin número'}
            </h2>
            <p className="text-sm text-blue-700">Modifica los campos necesarios y guarda los cambios</p>
          </div>
          {onCancelarEdicion && (
            <button
              type="button"
              onClick={onCancelarEdicion}
              className="px-4 py-2 bg-white text-blue-700 border border-blue-300 rounded-lg hover:bg-blue-50"
            >
              Cancelar
            </button>
          )}
        </div>
      )}

      {vendedor && vendedor.empresa_id && empresa && (
        <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-5">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-blue-900">{empresa.nombre_comercial}</h3>
              <p className="text-lg font-semibold text-blue-700">{vendedor.nombre}</p>
              <p className="text-sm text-blue-600">Vendedor</p>
            </div>
            {empresa.logo_url && (
              <img
                src={empresa.logo_url}
                alt={empresa.nombre_comercial}
                className="h-16 w-auto object-contain"
              />
            )}
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm p-6">
        <h2 className="text-xl font-semibold mb-4 text-gray-800">Datos del Cliente</h2>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Buscar Cliente (por nombre, negocio o RUC)
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={busquedaCliente}
              onChange={(e) => {
                setBusquedaCliente(e.target.value);
                buscarClientes(e.target.value);
              }}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Buscar cliente existente..."
            />
            {clientesSugeridos.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {clientesSugeridos.map((cliente) => (
                  <div
                    key={cliente.ruc}
                    onClick={() => seleccionarCliente(cliente)}
                    className="px-4 py-2 hover:bg-blue-50 cursor-pointer border-b last:border-b-0"
                  >
                    <div className="font-medium text-gray-900">{cliente.nombres_completos}</div>
                    {(cliente as any).nombre_negocio && (
                      <div className="text-sm text-gray-600">{(cliente as any).nombre_negocio}</div>
                    )}
                    <div className="text-xs text-gray-500">RUC: {cliente.ruc}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              RUC / Cédula Cliente
            </label>
            <div className="relative">
              <input
                type="text"
                value={rucCliente}
                onChange={(e) => handleRucChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Ej: 1234567890001"
                required
              />
              {buscandoCliente && (
                <Loader2 className="absolute right-3 top-2.5 h-5 w-5 text-blue-500 animate-spin" />
              )}
            </div>
            {clienteEncontrado && (
              <p className="mt-1 text-xs text-green-600">Cliente encontrado en base de datos</p>
            )}
            {rucCliente.length >= 10 && !clienteEncontrado && !buscandoCliente && (
              <p className="mt-1 text-xs text-blue-600">Cliente nuevo - se creará automáticamente</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombres Completos
            </label>
            <input
              type="text"
              value={nombreCliente}
              onChange={(e) => setNombreCliente(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Nombre completo o razón social"
              required
              disabled={!!clienteEncontrado}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre del Negocio
            </label>
            <input
              type="text"
              value={nombreNegocio}
              onChange={(e) => setNombreNegocio(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Nombre del negocio (opcional)"
              disabled={!!clienteEncontrado}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Correo Electrónico
            </label>
            <input
              type="email"
              value={correoCliente}
              onChange={(e) => setCorreoCliente(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="cliente@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Teléfono
            </label>
            <input
              type="tel"
              value={telefonoCliente}
              onChange={(e) => setTelefonoCliente(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Ej: 099-1234567"
            />
          </div>

          {/* Ubicación — editable para cliente nuevo, read-only para existente */}
          <div className="md:col-span-2">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
                <MapPin className="h-4 w-4 text-blue-500" />
                Ubicación
                {clienteEncontrado && (
                  <span className="text-xs text-gray-400 font-normal">(solo lectura)</span>
                )}
              </div>
              {/* Botón GPS solo para cliente nuevo */}
              {!clienteEncontrado && rucCliente.length >= 10 && (
                <button
                  type="button"
                  onClick={handleCapturarGeoManual}
                  disabled={capturandoGeo}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                    geoCapturada
                      ? 'bg-green-50 text-green-700 border-green-200'
                      : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                  } disabled:opacity-50`}
                >
                  {capturandoGeo ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Capturando…</>
                  ) : geoCapturada ? (
                    <><MapPin className="h-3.5 w-3.5" /> GPS capturado ✓</>
                  ) : (
                    <><MapPin className="h-3.5 w-3.5" /> Capturar mi ubicación</>
                  )}
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Provincia</label>
                {clienteEncontrado ? (
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 min-h-[38px]">
                    {provinciaCliente || <span className="text-gray-400">—</span>}
                  </div>
                ) : (
                  <select
                    value={provinciaCliente}
                    onChange={e => { setProvinciaCliente(e.target.value); setCiudadCliente(''); }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    <option value="">Seleccionar...</option>
                    {PROVINCIAS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Ciudad / Cantón</label>
                {clienteEncontrado ? (
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 min-h-[38px]">
                    {ciudadCliente || <span className="text-gray-400">—</span>}
                  </div>
                ) : (
                  <select
                    value={ciudadCliente}
                    onChange={e => setCiudadCliente(e.target.value)}
                    disabled={!provinciaCliente}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm disabled:bg-gray-100"
                  >
                    <option value="">Seleccionar...</option>
                    {(PROVINCIAS_CIUDADES[provinciaCliente] || []).map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Dirección</label>
                {clienteEncontrado ? (
                  <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 min-h-[38px]">
                    {direccionCliente || <span className="text-gray-400">—</span>}
                  </div>
                ) : (
                  <input
                    type="text"
                    value={direccionCliente}
                    onChange={e => setDireccionCliente(e.target.value)}
                    placeholder="Calle y número"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Forma de Pago
            </label>
            <input
              type="text"
              value={formaPago}
              onChange={(e) => setFormaPago(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Ej: Contado, Crédito 30 días, Transferencia, etc."
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Observaciones
            </label>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Observaciones adicionales..."
              rows={3}
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Vendedor
            </label>
            <input
              type="text"
              value={vendedor?.nombre || ''}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700"
              disabled
              readOnly
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Artículos</h2>
          <button
            type="button"
            onClick={toggleUtilidad}
            title={showUtilidad ? 'Ocultar columna Utilidad' : 'Mostrar columna Utilidad'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              showUtilidad
                ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200'
            }`}
          >
            {showUtilidad ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            Utilidad
          </button>
        </div>

        <div className="mb-4 relative">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
            <input
              type="text"
              value={busquedaArticulo}
              onChange={(e) => setBusquedaArticulo(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Buscar artículo por descripción..."
            />
          </div>

          {articulos.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {articulos.map(articulo => (
                <button
                  key={articulo.id}
                  type="button"
                  onClick={() => agregarArticulo(articulo)}
                  className="w-full px-4 py-2 text-left hover:bg-blue-50 border-b border-gray-100 last:border-b-0"
                >
                  <div className="font-medium text-gray-900">{articulo.descripcion}</div>
                  <div className="text-sm text-gray-600">
                    Código: {articulo.id} | Precio: ${articulo.precio.toFixed(2)} | Stock: {articulo.stock} | IVA: {(articulo as any).tasa_iva ?? 15}%
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sugerencias IA */}
        {(sugerenciasAi.length > 0 || cargandoAi) && (
          <div className="mb-6 p-4 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-100 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center text-indigo-700">
                <Sparkles className="h-5 w-5 mr-2 animate-pulse" />
                <h3 className="font-semibold text-sm">Sugerencias de la IA</h3>
              </div>
              {cargandoAi && <Loader2 className="h-4 w-4 text-indigo-500 animate-spin" />}
            </div>
            <div className="flex flex-wrap gap-3">
              {sugerenciasAi.map((sug) => (
                <button
                  key={sug.articulo_id}
                  type="button"
                  onClick={async () => {
                    const { data } = await supabase
                      .from('articulos')
                      .select('*')
                      .eq('id', sug.articulo_id)
                      .single();
                    if (data) agregarArticulo(data);
                    setSugerenciasAi(prev => prev.filter(s => s.articulo_id !== sug.articulo_id));
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-indigo-600 hover:text-white text-indigo-800 rounded-lg border border-indigo-200 shadow-sm transition-all group"
                  title={sug.motivo}
                >
                  <ShoppingBag className="h-4 w-4 opacity-70 group-hover:scale-110 transition-transform" />
                  <span className="text-sm font-medium">{sug.descripcion}</span>
                  <span className="text-xs opacity-80">${sug.precio.toFixed(2)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {detalles.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Artículo</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Cant.</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Precio</th>
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Costo</th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-700">IVA</th>
                  {showUtilidad && <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Utilidad</th>}
                  <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Subtotal</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {detalles.map((detalle, index) => {
                  const utilidad = calcularUtilidad(detalle.precio, detalle.costo);
                  const subtotal = calcularSubtotal(detalle);

                  return (
                    <tr key={detalle.articulo_id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-sm text-gray-900">{detalle.descripcion}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={detalle.cantidad}
                          onChange={(e) => actualizarDetalle(index, 'cantidad', parseFloat(e.target.value) || 0)}
                          className="w-20 px-2 py-1 text-right border border-gray-300 rounded text-sm"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="relative">
                          <DollarSign className="absolute left-1 top-1 h-4 w-4 text-gray-400" />
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={detalle.precio}
                            onChange={(e) => actualizarDetalle(index, 'precio', parseFloat(e.target.value) || 0)}
                            className="w-24 pl-6 pr-2 py-1 text-right border border-gray-300 rounded text-sm"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-sm text-gray-600">
                        ${detalle.costo.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 text-center text-sm text-gray-600">
                        {detalle.tasa_iva}%
                      </td>
                      {showUtilidad && (
                        <td className="px-3 py-2 text-right">
                          <span className={`inline-flex items-center text-sm font-medium ${utilidad > 0 ? 'text-green-600' : utilidad < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                            <TrendingUp className="h-4 w-4 mr-1" />
                            {utilidad.toFixed(1)}%
                          </span>
                        </td>
                      )}
                      <td className="px-3 py-2 text-right text-sm font-medium text-gray-900">
                        ${subtotal.toFixed(2)}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => eliminarDetalle(index)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            Busque y agregue artículos al {tipoDocumento === 'pedido' ? 'pedido' : 'proforma'}
          </div>
        )}

        {detalles.length > 0 && (
          <div className="mt-4 flex justify-end">
            <div className="bg-gray-50 rounded-lg px-6 py-4 min-w-[280px]">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal:</span>
                  <span className="font-medium text-gray-900">${calcularSubtotal2().toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Impuesto:</span>
                  <span className="font-medium text-gray-900">${calcularImpuesto().toFixed(2)}</span>
                </div>
                <div className="border-t border-gray-300 pt-2 flex justify-between">
                  <span className="text-lg font-semibold text-gray-900">Total a Pagar:</span>
                  <span className="text-2xl font-bold text-blue-600">${calcularTotal().toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-4">
        {capturandoGeo && (
          <span className="flex items-center gap-1.5 text-sm text-blue-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Capturando ubicación GPS…
          </span>
        )}
        {!clienteEncontrado && !capturandoGeo && rucCliente.length >= 10 && !geoCapturada && (
          <span className="flex items-center gap-1.5 text-xs text-gray-400">
            <MapPin className="h-3.5 w-3.5" />
            Sin GPS — se intentará capturar al guardar
          </span>
        )}
        <button
          type="submit"
          disabled={loading || capturandoGeo}
          className="flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {proformaEditando ? <Save className="h-5 w-5 mr-2" /> : <Plus className="h-5 w-5 mr-2" />}
          {capturandoGeo ? 'Capturando GPS…' : loading ? 'Guardando...' : (proformaEditando ? 'Guardar Cambios' : tipoDocumento === 'pedido' ? 'Crear Pedido' : 'Crear Proforma')}
        </button>
      </div>
    </form>
  );
}
