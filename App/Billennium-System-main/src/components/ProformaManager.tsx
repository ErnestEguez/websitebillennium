import { useState } from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function ProformaManager() {
  const { vendedor } = useAuth();
  const [periodo, setPeriodo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [proformasCount, setProformasCount] = useState(0);

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
    setProformasCount(0);

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
        .from('proforma_cabecera')
        .select('id', { count: 'exact', head: false })
        .eq('empresa_id', vendedor.empresa_id)
        .gte('created_at', startDate)
        .lte('created_at', endDate + 'T23:59:59');

      if (countError) throw countError;

      const count = data?.length || 0;
      setProformasCount(count);

      if (count === 0) {
        setError(`No se encontraron proformas para el periodo ${periodo}`);
      } else {
        setShowConfirm(true);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProformas = async () => {
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

      const { data: proformas, error: selectError } = await supabase
        .from('proforma_cabecera')
        .select('id')
        .eq('empresa_id', vendedor.empresa_id)
        .gte('created_at', startDate)
        .lte('created_at', endDate + 'T23:59:59');

      if (selectError) throw selectError;

      if (!proformas || proformas.length === 0) {
        setError('No se encontraron proformas para eliminar');
        return;
      }

      const proformaIds = proformas.map(p => p.id);

      const { error: deleteDetallesError } = await supabase
        .from('proforma_detalle')
        .delete()
        .in('proforma_id', proformaIds);

      if (deleteDetallesError) throw deleteDetallesError;

      const { error: deleteCabeceraError } = await supabase
        .from('proforma_cabecera')
        .delete()
        .in('id', proformaIds);

      if (deleteCabeceraError) throw deleteCabeceraError;

      setSuccess(`Se eliminaron ${proformas.length} proformas del periodo ${periodo} exitosamente`);
      setPeriodo('');
      setConfirmText('');
      setShowConfirm(false);
      setProformasCount(0);
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
        <h2 className="text-2xl font-bold text-gray-900">Gestión de Proformas</h2>
        <p className="text-sm text-gray-600 mt-1">Eliminar proformas por periodo</p>
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

      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Periodo (AAAAMM)
            </label>
            <div className="flex space-x-3">
              <input
                type="text"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value.replace(/\D/g, '').substring(0, 6))}
                placeholder="202504"
                maxLength={6}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleCheckPeriodo}
                disabled={loading || periodo.length !== 6}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Verificando...' : 'Verificar'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Ejemplo: 202504 para eliminar todas las proformas de Abril 2025
            </p>
          </div>

          {showConfirm && proformasCount > 0 && (
            <div className="mt-6 p-4 bg-yellow-50 border-2 border-yellow-400 rounded-lg">
              <div className="flex items-start mb-4">
                <AlertTriangle className="h-6 w-6 text-yellow-600 mr-3 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-yellow-900">¡Advertencia!</h3>
                  <p className="text-sm text-yellow-800 mt-1">
                    Se encontraron <strong>{proformasCount}</strong> proformas del periodo{' '}
                    <strong>{getMesNombre(periodo.substring(4, 6))} {periodo.substring(0, 4)}</strong>
                  </p>
                  <p className="text-sm text-yellow-800 mt-2">
                    Esta acción <strong>NO SE PUEDE DESHACER</strong>. Se eliminarán todas las proformas
                    y sus detalles de forma permanente.
                  </p>
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Para confirmar, escriba <span className="font-bold text-red-600">ELIMINAR</span>
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="Escriba ELIMINAR"
                  className="w-full px-4 py-2 border-2 border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                />
              </div>

              <div className="flex justify-end space-x-3 mt-4">
                <button
                  onClick={() => {
                    setShowConfirm(false);
                    setConfirmText('');
                    setProformasCount(0);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteProformas}
                  disabled={loading || confirmText !== 'ELIMINAR'}
                  className="flex items-center px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Trash2 className="h-5 w-5 mr-2" />
                  {loading ? 'Eliminando...' : 'Eliminar Proformas'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">Notas importantes:</h3>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>Solo se eliminarán proformas de su empresa</li>
          <li>La eliminación incluye todos los detalles de las proformas</li>
          <li>Esta acción no afecta a clientes, artículos ni vendedores</li>
          <li>Recomendamos hacer una copia de seguridad antes de eliminar</li>
        </ul>
      </div>
    </div>
  );
}
