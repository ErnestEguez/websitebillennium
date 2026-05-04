import { useState } from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function PedidoManager() {
  const { vendedor } = useAuth();
  const [periodo, setPeriodo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [pedidosCount, setPedidosCount] = useState(0);

  const validarPeriodo = (valor: string): boolean => {
    if (valor.length !== 6) return false;
    const year = parseInt(valor.substring(0, 4));
    const month = parseInt(valor.substring(4, 6));
    return year >= 2020 && year <= 2099 && month >= 1 && month <= 12;
  };

  const handleCheckPeriodo = async () => {
    setError('');
    setSuccess('');
    setShowConfirm(false);
    setPedidosCount(0);

    if (!validarPeriodo(periodo)) {
      setError('Formato inválido. Use AAAAMM (ejemplo: 202504 para abril 2025)');
      return;
    }

    setLoading(true);
    try {
      if (!vendedor?.empresa_id) {
        throw new Error('No se encontró la empresa del vendedor');
      }

      const year = parseInt(periodo.substring(0, 4));
      const month = parseInt(periodo.substring(4, 6));
      const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
      // Calcular el último día del mes correctamente
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${month.toString().padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;

      const { data, error: countError } = await supabase
        .from('pedido_cabecera')
        .select('id', { count: 'exact', head: false })
        .eq('empresa_id', vendedor.empresa_id)
        .gte('created_at', startDate)
        .lte('created_at', endDate + 'T23:59:59');

      if (countError) throw countError;

      const count = data?.length || 0;
      setPedidosCount(count);

      if (count === 0) {
        setError(`No se encontraron pedidos para el periodo ${periodo}`);
      } else {
        setShowConfirm(true);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePedidos = async () => {
    if (confirmText !== 'ELIMINAR') {
      setError('Debe escribir "ELIMINAR" para confirmar');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (!vendedor?.empresa_id) {
        throw new Error('No se encontró la empresa del vendedor');
      }

      const year = parseInt(periodo.substring(0, 4));
      const month = parseInt(periodo.substring(4, 6));
      const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
      // Calcular el último día del mes correctamente
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${month.toString().padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;

      const { data: pedidos, error: selectError } = await supabase
        .from('pedido_cabecera')
        .select('id')
        .eq('empresa_id', vendedor.empresa_id)
        .gte('created_at', startDate)
        .lte('created_at', endDate + 'T23:59:59');

      if (selectError) throw selectError;

      if (!pedidos || pedidos.length === 0) {
        setError('No se encontraron pedidos para eliminar');
        return;
      }

      const pedidoIds = pedidos.map(p => p.id);

      const { error: deleteDetallesError } = await supabase
        .from('pedido_detalle')
        .delete()
        .in('pedido_id', pedidoIds);

      if (deleteDetallesError) throw deleteDetallesError;

      const { error: deleteCabeceraError } = await supabase
        .from('pedido_cabecera')
        .delete()
        .in('id', pedidoIds);

      if (deleteCabeceraError) throw deleteCabeceraError;

      setSuccess(`Se eliminaron ${pedidos.length} pedidos del periodo ${periodo} exitosamente`);
      setPeriodo('');
      setConfirmText('');
      setShowConfirm(false);
      setPedidosCount(0);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getMesNombre = (mes: string): string => {
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return meses[parseInt(mes) - 1] || '';
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Gestión de Pedidos</h2>
        <p className="text-sm text-gray-600 mt-1">Eliminar pedidos por periodo</p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-start">
          <AlertTriangle className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          {success}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Periodo (AAAAMM)
            </label>
            <input
              type="text"
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              placeholder="202504"
              maxLength={6}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-sm text-gray-500 mt-1">
              Ejemplo: 202504 para abril de 2025
            </p>
          </div>

          <button
            onClick={handleCheckPeriodo}
            disabled={loading || periodo.length !== 6}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Verificando...' : 'Verificar Periodo'}
          </button>

          {showConfirm && (
            <div className="mt-6 p-4 bg-yellow-50 border-2 border-yellow-400 rounded-lg">
              <div className="flex items-start mb-4">
                <AlertTriangle className="h-6 w-6 text-yellow-600 mr-2 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-yellow-900">¡Atención!</h3>
                  <p className="text-yellow-800 mt-1">
                    Se encontraron <strong>{pedidosCount}</strong> pedidos en{' '}
                    {getMesNombre(periodo.substring(4, 6))} {periodo.substring(0, 4)}.
                  </p>
                  <p className="text-yellow-800 mt-2 font-medium">
                    Esta acción es IRREVERSIBLE y eliminará todos estos pedidos permanentemente.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Escriba "ELIMINAR" para confirmar:
                  </label>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="ELIMINAR"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                  />
                </div>

                <button
                  onClick={handleDeletePedidos}
                  disabled={loading || confirmText !== 'ELIMINAR'}
                  className="w-full bg-red-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  <Trash2 className="h-5 w-5 mr-2" />
                  {loading ? 'Eliminando...' : 'Eliminar Pedidos'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
