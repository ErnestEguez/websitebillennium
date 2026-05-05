import { useState, useEffect } from 'react';
import { Search, MapPin, X, ExternalLink, Phone, Mail, Building2, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Cliente } from '../lib/supabase';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

export function ConsultaClientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null);

  useEffect(() => {
    supabase
      .from('clientes')
      .select('*')
      .order('nombres_completos', { ascending: true })
      .then(({ data, error }) => {
        if (!error) setClientes(data || []);
        setLoading(false);
      });
  }, []);

  const filtrados = clientes.filter(c => {
    const q = searchTerm.toLowerCase();
    return (
      c.nombres_completos.toLowerCase().includes(q) ||
      c.ruc.includes(q) ||
      (c.nombre_negocio || '').toLowerCase().includes(q) ||
      (c.provincia || '').toLowerCase().includes(q) ||
      (c.ciudad || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Consulta de Clientes</h2>
        <span className="text-sm text-gray-500">{filtrados.length} de {clientes.length} clientes</span>
      </div>

      {/* Buscador */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por nombre, cédula, negocio, provincia o ciudad..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          autoFocus
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="flex gap-4">
        {/* Tabla */}
        <div className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${clienteSeleccionado ? 'flex-1' : 'w-full'}`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Cédula / RUC</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Nombre</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Negocio</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Provincia</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Ciudad</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wide">GPS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-500">Cargando clientes...</td></tr>
                ) : filtrados.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-500">No se encontraron clientes</td></tr>
                ) : filtrados.map(c => (
                  <tr
                    key={c.ruc}
                    onClick={() => setClienteSeleccionado(clienteSeleccionado?.ruc === c.ruc ? null : c)}
                    className={`cursor-pointer transition-colors ${
                      clienteSeleccionado?.ruc === c.ruc
                        ? 'bg-blue-50 border-l-4 border-l-blue-500'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className="px-4 py-3 text-sm font-mono text-gray-700">{c.ruc}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.nombres_completos}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{c.nombre_negocio || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{c.provincia || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{c.ciudad || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      {c.latitud && c.longitud
                        ? <MapPin className="h-4 w-4 text-green-500 mx-auto" title="Tiene ubicación GPS" />
                        : <span className="text-gray-200 text-xs">—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Panel de detalle */}
        {clienteSeleccionado && (
          <div className="w-96 shrink-0 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
            {/* Header panel */}
            <div className="flex items-start justify-between p-4 border-b border-gray-100 bg-gray-50">
              <div className="min-w-0">
                <h3 className="font-semibold text-gray-900 truncate">{clienteSeleccionado.nombres_completos}</h3>
                <p className="text-xs text-gray-500 font-mono mt-0.5">{clienteSeleccionado.ruc}</p>
              </div>
              <button
                onClick={() => setClienteSeleccionado(null)}
                className="ml-2 p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Info */}
            <div className="p-4 space-y-3 flex-1 overflow-y-auto">
              {clienteSeleccionado.nombre_negocio && (
                <div className="flex items-start gap-2 text-sm">
                  <Building2 className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
                  <span className="text-gray-700">{clienteSeleccionado.nombre_negocio}</span>
                </div>
              )}
              {clienteSeleccionado.telefono && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="text-gray-700">{clienteSeleccionado.telefono}</span>
                </div>
              )}
              {clienteSeleccionado.correo && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="text-gray-700 truncate">{clienteSeleccionado.correo}</span>
                </div>
              )}

              {/* Ubicación */}
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Ubicación</p>
                <div className="space-y-1.5 text-sm">
                  {clienteSeleccionado.provincia && (
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 text-gray-400" />
                      <span className="text-gray-700">
                        {clienteSeleccionado.provincia}
                        {clienteSeleccionado.ciudad ? ` / ${clienteSeleccionado.ciudad}` : ''}
                      </span>
                    </div>
                  )}
                  {clienteSeleccionado.direccion && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-3.5 w-3.5 text-gray-400 mt-0.5 shrink-0" />
                      <span className="text-gray-700">{clienteSeleccionado.direccion}</span>
                    </div>
                  )}
                  {!clienteSeleccionado.provincia && !clienteSeleccionado.direccion && (
                    <p className="text-gray-400 text-xs italic">Sin datos de ubicación</p>
                  )}
                </div>
              </div>

              {/* Mapa GPS */}
              {clienteSeleccionado.latitud && clienteSeleccionado.longitud ? (
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-green-500" />
                      GPS registrado
                    </p>
                    <a
                      href={`https://www.google.com/maps?q=${clienteSeleccionado.latitud},${clienteSeleccionado.longitud}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      onClick={e => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3 w-3" />
                      Google Maps
                    </a>
                  </div>
                  <div className="rounded-lg overflow-hidden border border-gray-200" style={{ height: 220 }}>
                    <MapContainer
                      center={[clienteSeleccionado.latitud, clienteSeleccionado.longitud]}
                      zoom={16}
                      style={{ height: '100%', width: '100%' }}
                      scrollWheelZoom={false}
                    >
                      <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />
                      <Marker position={[clienteSeleccionado.latitud, clienteSeleccionado.longitud]}>
                        <Popup>
                          <strong>{clienteSeleccionado.nombres_completos}</strong>
                          {clienteSeleccionado.direccion && <><br />{clienteSeleccionado.direccion}</>}
                        </Popup>
                      </Marker>
                    </MapContainer>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {clienteSeleccionado.latitud.toFixed(6)}, {clienteSeleccionado.longitud.toFixed(6)}
                  </p>
                </div>
              ) : (
                <div className="pt-2 border-t border-gray-100">
                  <p className="text-xs text-gray-400 italic flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    Sin coordenadas GPS
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
