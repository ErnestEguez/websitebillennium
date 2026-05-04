import { useState, useEffect } from 'react';
import { FileText, Mail, MessageCircle, Eye, Download, Filter, Edit, Trash2 } from 'lucide-react';
import { proformaService } from '../lib/proformaService';
import type { ProformaCompleta } from '../lib/supabase';
import { ProformaViewer } from './ProformaViewer';
import { enviarProformaWhatsApp, enviarProformaEmail, descargarProformaPDF } from '../lib/pdfService';
import { useAuth } from '../contexts/AuthContext';

type FiltroEstado = 'todas' | 'pendientes' | 'transmitidas';

interface ProformaListProps {
  onEditarProforma?: (proforma: ProformaCompleta) => void;
}

export function ProformaList({ onEditarProforma }: ProformaListProps = {}) {
  const { vendedor } = useAuth();
  const [proformas, setProformas] = useState<ProformaCompleta[]>([]);
  const [loading, setLoading] = useState(true);
  const [proformaSeleccionada, setProformaSeleccionada] = useState<ProformaCompleta | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todas');

  useEffect(() => {
    cargarProformas();
  }, [vendedor]);

  const cargarProformas = async () => {
    try {
      const empresaId = vendedor?.empresa_id || undefined;
      const data = await proformaService.getProformas(50, empresaId);
      setProformas(data);
    } catch (err) {
      console.error('Error cargando proformas:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatearFecha = (fecha: string) => {
    return new Date(fecha).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleEnviarEmail = async (proforma: ProformaCompleta) => {
    try {
      const proformaCompleta = await proformaService.getProforma(proforma.id);
      if (!proformaCompleta) {
        alert('Error al cargar la proforma');
        return;
      }

      const cliente = await proformaService.buscarCliente(proformaCompleta.ruc_cliente);
      await enviarProformaEmail(proformaCompleta, cliente, proformaCompleta.vendedor || null);
    } catch (err) {
      console.error('Error al enviar por email:', err);
      alert('Error al preparar el envío por email');
    }
  };

  const handleEnviarWhatsApp = async (proforma: ProformaCompleta) => {
    try {
      const proformaCompleta = await proformaService.getProforma(proforma.id);
      if (!proformaCompleta) {
        alert('Error al cargar la proforma');
        return;
      }

      const cliente = await proformaService.buscarCliente(proformaCompleta.ruc_cliente);
      await enviarProformaWhatsApp(proformaCompleta, cliente, proformaCompleta.vendedor || null);
    } catch (err) {
      console.error('Error al enviar por WhatsApp:', err);
      alert('Error al preparar el envío por WhatsApp');
    }
  };

  const handleEliminarProforma = async (proforma: ProformaCompleta) => {
    if (!confirm(`¿Está seguro de eliminar la proforma ${proforma.numero}? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      setLoading(true);
      await proformaService.deleteProforma(proforma.id);
      await cargarProformas();
    } catch (err) {
      console.error('Error al eliminar proforma:', err);
      alert('Error al eliminar la proforma');
    } finally {
      setLoading(false);
    }
  };

  const proformasFiltradas = proformas.filter((proforma) => {
    if (filtroEstado === 'todas') return true;
    if (filtroEstado === 'pendientes') return !proforma.sincronizada;
    if (filtroEstado === 'transmitidas') return proforma.sincronizada;
    return true;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-gray-600">Cargando proformas...</div>
      </div>
    );
  }

  if (proformaSeleccionada) {
    return (
      <ProformaViewer
        proforma={proformaSeleccionada}
        onClose={() => setProformaSeleccionada(null)}
        onEnviarEmail={handleEnviarEmail}
        onEnviarWhatsApp={handleEnviarWhatsApp}
      />
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-800">Proformas Recientes</h2>

          <div className="flex items-center space-x-2">
            <Filter className="h-5 w-5 text-gray-500" />
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setFiltroEstado('todas')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  filtroEstado === 'todas'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Todas
              </button>
              <button
                onClick={() => setFiltroEstado('pendientes')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  filtroEstado === 'pendientes'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Pendientes
              </button>
              <button
                onClick={() => setFiltroEstado('transmitidas')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  filtroEstado === 'transmitidas'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Transmitidas
              </button>
            </div>
          </div>
        </div>
      </div>

      {proformasFiltradas.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No hay proformas registradas
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700">Número</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700">Cliente</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700">Vendedor</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-700">Total</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700">Fecha</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-700">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {proformasFiltradas.map((proforma) => (
                <tr key={proforma.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    <div className="flex items-center">
                      <FileText className="h-4 w-4 mr-2 text-gray-400" />
                      {proforma.numero || 'Sin número'}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{proforma.nombre_cliente}</div>
                    <div className="text-sm text-gray-500">{proforma.ruc_cliente}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {proforma.vendedor?.nombre || 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 text-right">
                    ${proforma.total.toFixed(2)}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      proforma.sincronizada
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {proforma.sincronizada ? 'Sincronizada' : 'Pendiente'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {formatearFecha(proforma.created_at)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-center space-x-2">
                      <button
                        onClick={() => setProformaSeleccionada(proforma)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Ver detalles"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      {onEditarProforma && (
                        <button
                          onClick={() => onEditarProforma(proforma)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Editar proforma"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => descargarProformaPDF(proforma)}
                        className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                        title="Descargar PDF"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleEnviarEmail(proforma)}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Enviar por email"
                      >
                        <Mail className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleEnviarWhatsApp(proforma)}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        title="Enviar por WhatsApp"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleEliminarProforma(proforma)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Eliminar proforma"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
