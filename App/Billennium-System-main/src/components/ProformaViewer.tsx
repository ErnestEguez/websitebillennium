import { useState, useEffect } from 'react';
import { X, Mail, MessageCircle, Printer, Download, CheckCircle, RotateCcw } from 'lucide-react';
import type { ProformaCompleta, PedidoCompleto, Cliente } from '../lib/supabase';
import { proformaService } from '../lib/proformaService';
import { enviarProformaWhatsApp, enviarProformaEmail, descargarProformaPDF } from '../lib/pdfService';

interface ProformaViewerProps {
  proforma: ProformaCompleta | PedidoCompleto;
  tipoDocumento?: 'proforma' | 'pedido';
  onClose: () => void;
  onEnviarEmail?: (doc: ProformaCompleta | PedidoCompleto) => void;
  onEnviarWhatsApp?: (doc: ProformaCompleta | PedidoCompleto) => void;
  onAutorizar?: (doc: PedidoCompleto) => void;
  onDesautorizar?: (doc: PedidoCompleto) => void;
}

export function ProformaViewer({ proforma, tipoDocumento = 'proforma', onClose, onEnviarEmail, onEnviarWhatsApp, onAutorizar, onDesautorizar }: ProformaViewerProps) {
  const [cliente, setCliente] = useState<Cliente | null>(null);

  useEffect(() => {
    const cargarCliente = async () => {
      try {
        const clienteData = await proformaService.buscarCliente(proforma.ruc_cliente);
        setCliente(clienteData);
      } catch (err) {
        console.error('Error cargando cliente:', err);
      }
    };
    cargarCliente();
  }, [proforma.ruc_cliente]);

  const formatearFecha = (fecha: string) => {
    return new Date(fecha).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const handleImprimir = () => {
    window.print();
  };

  const handleDescargarPDF = async () => {
    try {
      const esPedido = tipoDocumento === 'pedido';
      await descargarProformaPDF(proforma as any, esPedido);
    } catch (err) {
      console.error('Error al descargar PDF:', err);
      alert('Error al generar el PDF');
    }
  };

  const handleEnviarEmail = async () => {
    if (onEnviarEmail) {
      onEnviarEmail(proforma);
    } else {
      try {
        const cliente = await proformaService.buscarCliente(proforma.ruc_cliente);
        await enviarProformaEmail(proforma as ProformaCompleta, cliente, proforma.vendedor || null);
      } catch (err) {
        console.error('Error al enviar por email:', err);
        alert('Error al preparar el envío por email');
      }
    }
  };

  const handleEnviarWhatsApp = async () => {
    if (onEnviarWhatsApp) {
      onEnviarWhatsApp(proforma);
    } else {
      try {
        const cliente = await proformaService.buscarCliente(proforma.ruc_cliente);
        const esPedido = tipoDocumento === 'pedido';
        await enviarProformaWhatsApp(proforma as ProformaCompleta, cliente, proforma.vendedor || null, esPedido);
      } catch (err) {
        console.error('Error al enviar por WhatsApp:', err);
        alert('Error al preparar el envío por WhatsApp');
      }
    }
  };

  const handleAutorizar = () => {
    if (onAutorizar && tipoDocumento === 'pedido') {
      onAutorizar(proforma as PedidoCompleto);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center print:hidden">
        <h2 className="text-xl font-semibold text-gray-800">Detalle de {tipoDocumento === 'proforma' ? 'Proforma' : 'Pedido'}</h2>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleEnviarEmail}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Enviar por email"
          >
            <Mail className="h-5 w-5" />
          </button>
          <button
            onClick={handleEnviarWhatsApp}
            className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
            title="Enviar por WhatsApp"
          >
            <MessageCircle className="h-5 w-5" />
          </button>
          <button
            onClick={handleDescargarPDF}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Descargar PDF"
          >
            <Download className="h-5 w-5" />
          </button>
          <button
            onClick={handleImprimir}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Imprimir"
          >
            <Printer className="h-5 w-5" />
          </button>
          {tipoDocumento === 'pedido' && proforma.estado === 'Pendiente' && onAutorizar && (
            <button
              onClick={handleAutorizar}
              className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
              title="Autorizar pedido"
            >
              <CheckCircle className="h-5 w-5" />
            </button>
          )}
          {tipoDocumento === 'pedido' && proforma.estado === 'Autorizada' && onDesautorizar && (
            <button
              onClick={() => onDesautorizar(proforma as PedidoCompleto)}
              className="p-2 text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
              title="Revertir a Pendiente"
            >
              <RotateCcw className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="p-8 max-w-4xl mx-auto" id="proforma-content">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{tipoDocumento === 'proforma' ? 'PROFORMA' : 'PEDIDO'}</h1>
          <div className="text-lg text-gray-600">{proforma.numero || 'Sin número'}</div>
          {proforma.estado === 'Autorizada' && (
            <div className="mt-2 inline-flex items-center px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
              <CheckCircle className="h-4 w-4 mr-1" />
              Autorizada {proforma.fecha_autorizacion && `el ${new Date(proforma.fecha_autorizacion).toLocaleDateString('es-ES')}`}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <h3 className="text-sm font-semibold text-gray-500 mb-2">CLIENTE</h3>
            <div className="text-gray-900 font-medium">{proforma.nombre_cliente}</div>
            {cliente && (cliente as any).nombre_negocio && (
              <div className="text-gray-700 text-sm">Negocio: {(cliente as any).nombre_negocio}</div>
            )}
            <div className="text-gray-600">RUC: {proforma.ruc_cliente}</div>
          </div>
          <div className="text-right">
            <h3 className="text-sm font-semibold text-gray-500 mb-2">INFORMACIÓN</h3>
            <div className="text-gray-600">
              <div>Fecha: {formatearFecha(proforma.created_at)}</div>
              <div>Vendedor: {proforma.vendedor?.nombre || 'N/A'}</div>
            </div>
          </div>
        </div>

        {(proforma.forma_pago || proforma.observaciones) && (
          <div className="mb-8 bg-amber-50 border-l-4 border-amber-400 p-4 rounded">
            {proforma.forma_pago && (
              <div className="mb-2">
                <span className="font-semibold text-gray-700">Forma de Pago:</span>{' '}
                <span className="text-gray-900">{proforma.forma_pago}</span>
              </div>
            )}
            {proforma.observaciones && (
              <div>
                <span className="font-semibold text-gray-700">Observaciones:</span>{' '}
                <span className="text-gray-900">{proforma.observaciones}</span>
              </div>
            )}
          </div>
        )}

        <div className="mb-8">
          <table className="w-full">
            <thead className="bg-gray-50 border-y border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Descripción</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Cantidad</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Precio Unit.</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700">IVA</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {proforma.detalles?.map((detalle) => (
                <tr key={detalle.id}>
                  <td className="px-4 py-3 text-sm text-gray-900">{detalle.descripcion}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">{(detalle.cantidad || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right">${(detalle.precio || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-center">{(detalle as any).tasa_iva ?? 15}%</td>
                  <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                    ${(detalle.subtotal || 0).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <div className="w-72">
            <div className="flex justify-between py-2 border-t border-gray-200">
              <span className="text-gray-700">Subtotal:</span>
              <span className="font-medium text-gray-900">${(proforma.subtotal || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-gray-700">Impuesto:</span>
              <span className="font-medium text-gray-900">${(proforma.impuesto || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between py-3 border-t-2 border-gray-300">
              <span className="text-lg font-semibold text-gray-900">TOTAL A PAGAR:</span>
              <span className="text-lg font-bold text-blue-600">${(proforma.total || 0).toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-600 text-center">
            Esta proforma tiene una validez de 15 días desde la fecha de emisión
          </p>
        </div>
      </div>
    </div>
  );
}
