import { useState, useEffect } from 'react';
import { FileText, Mail, MessageCircle, Eye, Download, Filter, Edit, Trash2, CheckCircle, ArrowRight, RotateCcw } from 'lucide-react';
import { proformaService } from '../lib/proformaService';
import { pedidoService } from '../lib/pedidoService';
import type { ProformaCompleta, PedidoCompleto } from '../lib/supabase';
import { ProformaViewer } from './ProformaViewer';
import { enviarProformaWhatsApp, enviarProformaEmail, descargarProformaPDF } from '../lib/pdfService';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

type TipoDocumento = 'proforma' | 'pedido';
type FiltroEstado = 'todas' | 'pendientes' | 'autorizadas' | 'sincronizadas';

interface DocumentosListProps {
  tipoDocumento: TipoDocumento;
  onEditarDocumento?: (documento: ProformaCompleta | PedidoCompleto, tipo: TipoDocumento) => void;
  onRefresh?: () => void;
}

export function DocumentosList({ tipoDocumento, onEditarDocumento, onRefresh }: DocumentosListProps) {
  const { vendedor } = useAuth();
  const [documentos, setDocumentos] = useState<(ProformaCompleta | PedidoCompleto)[]>([]);
  const [loading, setLoading] = useState(true);
  const [documentoSeleccionado, setDocumentoSeleccionado] = useState<ProformaCompleta | PedidoCompleto | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('todas');

  useEffect(() => {
    cargarDocumentos();
  }, [vendedor, tipoDocumento]);

  const cargarDocumentos = async () => {
    try {
      setLoading(true);
      const empresaId = vendedor?.empresa_id || undefined;
      console.log(`[DocumentosList] Cargando ${tipoDocumento}, empresaId:`, empresaId, 'vendedor:', vendedor);

      if (tipoDocumento === 'proforma') {
        let query = supabase
          .from('proforma_cabecera')
          .select(`
            *,
            vendedor:vendedores!proforma_cabecera_vendedor_id_fkey(id, nombre, email, telefono),
            detalles:proforma_detalle(*)
          `);

        // if (empresaId) query = query.eq('empresa_id', empresaId);
        // if (vendedor && !vendedor.is_admin) query = query.eq('vendedor_id', vendedor.id);

        const { data, error } = await query
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;
        setDocumentos(data || []);
      } else {
        let query = supabase
          .from('pedido_cabecera')
          .select(`
            *,
            vendedor:vendedores!pedido_cabecera_vendedor_id_fkey(*)
          `);

        // if (empresaId) query = query.eq('empresa_id', empresaId);
        // if (vendedor && !vendedor.is_admin) query = query.eq('vendedor_id', vendedor.id);

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;

        const pedidosConDetalles = await Promise.all(
          (data || []).map(async (pedido: any) => {
            const { data: detalles } = await supabase
              .from('pedido_detalle')
              .select('*')
              .eq('pedido_id', pedido.id);
            return { ...pedido, detalles: detalles || [] };
          })
        );
        setDocumentos(pedidosConDetalles);
      }
    } catch (err) {
      console.error('Error cargando documentos:', err);
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

  const handleEnviarEmail = async (documento: ProformaCompleta | PedidoCompleto) => {
    try {
      const cliente = await proformaService.buscarCliente(documento.ruc_cliente);
      const esPedido = tipoDocumento === 'pedido';
      await enviarProformaEmail(documento as ProformaCompleta, cliente, documento.vendedor || null, esPedido);
    } catch (err) {
      console.error('Error al enviar por email:', err);
      alert('Error al preparar el envío por email');
    }
  };

  const handleEnviarWhatsApp = async (documento: ProformaCompleta | PedidoCompleto) => {
    try {
      const cliente = await proformaService.buscarCliente(documento.ruc_cliente);
      const esPedido = tipoDocumento === 'pedido';
      await enviarProformaWhatsApp(documento as ProformaCompleta, cliente, documento.vendedor || null, esPedido);
    } catch (err) {
      console.error('Error al enviar por WhatsApp:', err);
      alert('Error al preparar el envío por WhatsApp');
    }
  };

  const handleAutorizar = async (documento: PedidoCompleto) => {
    if (!confirm(`¿Autorizar el pedido ${documento.numero}?`)) {
      return;
    }

    try {
      setLoading(true);
      await pedidoService.autorizarPedido(documento.id, vendedor?.id || '');
      if (onRefresh) onRefresh();
      await cargarDocumentos();
    } catch (err) {
      console.error('Error al autorizar pedido:', err);
      alert('Error al autorizar el pedido');
    } finally {
      setLoading(false);
    }
  };

  const handleDesautorizar = async (documento: PedidoCompleto) => {
    if (!confirm(`¿Revertir a Pendiente el pedido ${documento.numero}? Se eliminará la autorización actual.`)) {
      return;
    }

    try {
      setLoading(true);
      await pedidoService.desautorizarPedido(documento.id);
      if (onRefresh) onRefresh();
      await cargarDocumentos();
    } catch (err) {
      console.error('Error al revertir pedido:', err);
      alert('Error al revertir el pedido a Pendiente');
    } finally {
      setLoading(false);
    }
  };

  const handleEliminarDocumento = async (documento: ProformaCompleta | PedidoCompleto) => {
    const tipo = tipoDocumento === 'proforma' ? 'proforma' : 'pedido';
    if (!confirm(`¿Está seguro de eliminar ${tipo} ${documento.numero}? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      setLoading(true);
      if (tipoDocumento === 'proforma') {
        await proformaService.deleteProforma(documento.id);
      } else {
        await pedidoService.deletePedido(documento.id);
      }
      if (onRefresh) onRefresh();
      await cargarDocumentos();
    } catch (err) {
      console.error('Error al eliminar:', err);
      alert(`Error al eliminar ${tipo}`);
    } finally {
      setLoading(false);
    }
  };

  const handleConvertirAPedido = async (proforma: ProformaCompleta) => {
    if (!confirm(`¿Convertir la proforma ${proforma.numero} a pedido?`)) {
      return;
    }

    try {
      setLoading(true);
      await proformaService.convertirProformaAPedido(proforma.id);
      alert(`Proforma convertida a pedido exitosamente`);
      if (onRefresh) onRefresh();
      await cargarDocumentos();
    } catch (err) {
      console.error('Error al convertir:', err);
      alert('Error al convertir proforma a pedido');
    } finally {
      setLoading(false);
    }
  };

  const documentosFiltrados = documentos.filter((doc) => {
    if (filtroEstado === 'todas') return true;
    if (filtroEstado === 'pendientes') return doc.estado === 'Pendiente';
    if (filtroEstado === 'autorizadas') return doc.estado === 'Autorizada';
    if (filtroEstado === 'sincronizadas') return doc.sincronizada;
    return true;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-gray-600">Cargando {tipoDocumento === 'proforma' ? 'proformas' : 'pedidos'}...</div>
      </div>
    );
  }

  if (documentoSeleccionado) {
    return (
      <ProformaViewer
        proforma={documentoSeleccionado as ProformaCompleta}
        tipoDocumento={tipoDocumento}
        onClose={() => setDocumentoSeleccionado(null)}
        onEnviarEmail={handleEnviarEmail}
        onEnviarWhatsApp={handleEnviarWhatsApp}
        onAutorizar={tipoDocumento === 'pedido' ? handleAutorizar : undefined}
        onDesautorizar={tipoDocumento === 'pedido' ? handleDesautorizar : undefined}
      />
    );
  }

  const titulo = tipoDocumento === 'proforma' ? 'Proformas' : 'Pedidos';

  return (
    <div className="bg-white rounded-lg shadow-sm">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-800">{titulo} Recientes</h2>

          <div className="flex items-center space-x-2">
            <Filter className="h-5 w-5 text-gray-500" />
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setFiltroEstado('todas')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${filtroEstado === 'todas'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                Todas
              </button>
              <button
                onClick={() => setFiltroEstado('pendientes')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${filtroEstado === 'pendientes'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                Pendientes
              </button>
              <button
                onClick={() => setFiltroEstado('autorizadas')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${filtroEstado === 'autorizadas'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                Autorizadas
              </button>
              <button
                onClick={() => setFiltroEstado('sincronizadas')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${filtroEstado === 'sincronizadas'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                Sincronizadas
              </button>
            </div>
          </div>
        </div>
      </div>

      {documentosFiltrados.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No hay {titulo.toLowerCase()} registrados
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
              {documentosFiltrados.map((doc) => (
                <tr key={doc.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    <div className="flex items-center">
                      <FileText className="h-4 w-4 mr-2 text-gray-400" />
                      {doc.numero || 'Sin número'}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{doc.nombre_cliente}</div>
                    <div className="text-sm text-gray-500">{doc.ruc_cliente}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {doc.vendedor?.nombre || 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 text-right">
                    ${(doc.total || 0).toFixed(2)}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${doc.estado === 'Autorizada'
                      ? 'bg-green-100 text-green-800'
                      : doc.sincronizada
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-yellow-100 text-yellow-800'
                      }`}>
                      {doc.estado === 'Autorizada' ? 'Autorizada' : doc.sincronizada ? 'Sincronizada' : 'Pendiente'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {formatearFecha(doc.created_at)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-center space-x-2">
                      <button
                        onClick={() => setDocumentoSeleccionado(doc)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Ver detalles"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      {onEditarDocumento && (
                        <button
                          onClick={() => onEditarDocumento(doc, tipoDocumento)}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => descargarProformaPDF(doc as ProformaCompleta, tipoDocumento === 'pedido')}
                        className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                        title="Descargar PDF"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleEnviarEmail(doc)}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Enviar por email"
                      >
                        <Mail className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleEnviarWhatsApp(doc)}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        title="Enviar por WhatsApp"
                      >
                        <MessageCircle className="h-4 w-4" />
                      </button>
                      {tipoDocumento === 'proforma' && (
                        <button
                          onClick={() => handleConvertirAPedido(doc as ProformaCompleta)}
                          className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                          title="Convertir a pedido"
                        >
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      )}
                      {tipoDocumento === 'pedido' && doc.estado === 'Pendiente' && (
                        <button
                          onClick={() => handleAutorizar(doc as PedidoCompleto)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Autorizar pedido"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </button>
                      )}
                      {tipoDocumento === 'pedido' && doc.estado === 'Autorizada' && (
                        <button
                          onClick={() => handleDesautorizar(doc as PedidoCompleto)}
                          className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                          title="Revertir a Pendiente"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => handleEliminarDocumento(doc)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Eliminar"
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
