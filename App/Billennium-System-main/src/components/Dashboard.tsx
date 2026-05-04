import { useState, useEffect } from 'react';
import { DollarSign, ShoppingCart, TrendingUp, Package, Calendar, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface EstadisticasVentas {
  totalMes: number;
  totalAnio: number;
  cantidadMes: number;
  cantidadAnio: number;
}

interface ArticuloEstadistica {
  descripcion: string;
  cantidad: number;
  total: number;
}

interface ClienteEstadistica {
  nombre: string;
  total: number;
  cantidad: number;
}

export function Dashboard() {
  const { vendedor } = useAuth();
  const [loading, setLoading] = useState(true);
  const [estadisticas, setEstadisticas] = useState<EstadisticasVentas>({
    totalMes: 0,
    totalAnio: 0,
    cantidadMes: 0,
    cantidadAnio: 0
  });
  const [topArticulos, setTopArticulos] = useState<ArticuloEstadistica[]>([]);
  const [topClientes, setTopClientes] = useState<ClienteEstadistica[]>([]);

  useEffect(() => {
    cargarEstadisticas();
  }, [vendedor]);

  const cargarEstadisticas = async () => {
    if (!vendedor?.empresa_id) return;

    try {
      setLoading(true);

      const ahora = new Date();
      const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1).toISOString();
      const inicioAnio = new Date(ahora.getFullYear(), 0, 1).toISOString();

      // Obtener SOLO pedidos autorizados del mes del VENDEDOR
      const { data: pedidosMes, error: errorMes } = await supabase
        .from('pedido_cabecera')
        .select('total')
        .eq('empresa_id', vendedor.empresa_id)
        .eq('vendedor_id', vendedor.id)
        .eq('estado', 'Autorizada')
        .gte('created_at', inicioMes);

      if (errorMes) throw errorMes;

      // Obtener SOLO pedidos autorizados del año del VENDEDOR
      const { data: pedidosAnio, error: errorAnio } = await supabase
        .from('pedido_cabecera')
        .select('total')
        .eq('empresa_id', vendedor.empresa_id)
        .eq('vendedor_id', vendedor.id)
        .eq('estado', 'Autorizada')
        .gte('created_at', inicioAnio);

      if (errorAnio) throw errorAnio;

      const totalMes = pedidosMes?.reduce((sum, p) => sum + Number(p.total || 0), 0) || 0;
      const totalAnio = pedidosAnio?.reduce((sum, p) => sum + Number(p.total || 0), 0) || 0;

      setEstadisticas({
        totalMes,
        totalAnio,
        cantidadMes: pedidosMes?.length || 0,
        cantidadAnio: pedidosAnio?.length || 0
      });

      const { data: detallesAnio } = await supabase
        .from('pedido_detalle')
        .select(`
          descripcion,
          cantidad,
          subtotal,
          pedido_id
        `)
        .eq('empresa_id', vendedor.empresa_id);

      if (detallesAnio) {
        const { data: pedidosAutorizados } = await supabase
          .from('pedido_cabecera')
          .select('id')
          .eq('empresa_id', vendedor.empresa_id)
          .eq('vendedor_id', vendedor.id)
          .eq('estado', 'Autorizada');

        const idsAutorizados = new Set(pedidosAutorizados?.map(p => p.id) || []);

        const detallesFiltrados = detallesAnio.filter(d => idsAutorizados.has(d.pedido_id));

        const articulosMap = new Map<string, { cantidad: number; total: number }>();

        detallesFiltrados.forEach(detalle => {
          const existing = articulosMap.get(detalle.descripcion) || { cantidad: 0, total: 0 };
          articulosMap.set(detalle.descripcion, {
            cantidad: existing.cantidad + Number(detalle.cantidad),
            total: existing.total + Number(detalle.subtotal)
          });
        });

        const articulosArray = Array.from(articulosMap.entries())
          .map(([descripcion, data]) => ({
            descripcion,
            cantidad: data.cantidad,
            total: data.total
          }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 10);

        setTopArticulos(articulosArray);
      }

      const { data: clientesData } = await supabase
        .from('pedido_cabecera')
        .select('nombre_cliente, total')
        .eq('empresa_id', vendedor.empresa_id)
        .eq('vendedor_id', vendedor.id)
        .eq('estado', 'Autorizada')
        .gte('created_at', inicioAnio);

      if (clientesData) {
        const clientesMap = new Map<string, { total: number; cantidad: number }>();

        clientesData.forEach(pedido => {
          const existing = clientesMap.get(pedido.nombre_cliente) || { total: 0, cantidad: 0 };
          clientesMap.set(pedido.nombre_cliente, {
            total: existing.total + Number(pedido.total),
            cantidad: existing.cantidad + 1
          });
        });

        const clientesArray = Array.from(clientesMap.entries())
          .map(([nombre, data]) => ({
            nombre,
            total: data.total,
            cantidad: data.cantidad
          }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 10);

        setTopClientes(clientesArray);
      }
    } catch (err) {
      console.error('Error cargando estadísticas:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-gray-600">Cargando estadísticas...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Dashboard de Ventas</h2>
        <p className="text-sm text-gray-600 mt-1">Estadísticas de pedidos autorizados</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Ventas del Mes</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                ${estadisticas.totalMes.toFixed(2)}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {estadisticas.cantidadMes} pedidos
              </p>
            </div>
            <div className="p-3 bg-blue-50 rounded-full">
              <Calendar className="h-8 w-8 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Ventas del Año</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                ${estadisticas.totalAnio.toFixed(2)}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {estadisticas.cantidadAnio} pedidos
              </p>
            </div>
            <div className="p-3 bg-green-50 rounded-full">
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Ticket Promedio</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                ${estadisticas.cantidadAnio > 0 ? (estadisticas.totalAnio / estadisticas.cantidadAnio).toFixed(2) : '0.00'}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Por pedido
              </p>
            </div>
            <div className="p-3 bg-purple-50 rounded-full">
              <DollarSign className="h-8 w-8 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pedidos Totales</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {estadisticas.cantidadAnio}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Este año
              </p>
            </div>
            <div className="p-3 bg-orange-50 rounded-full">
              <ShoppingCart className="h-8 w-8 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center mb-4">
            <Package className="h-5 w-5 text-gray-600 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">Artículos Más Vendidos</h3>
          </div>
          {topArticulos.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No hay datos disponibles</p>
          ) : (
            <div className="space-y-3">
              {topArticulos.map((articulo, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {articulo.descripcion}
                    </p>
                    <p className="text-xs text-gray-500">
                      Cantidad: {articulo.cantidad.toFixed(2)} unidades
                    </p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-sm font-semibold text-gray-900">
                      ${articulo.total.toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center mb-4">
            <Users className="h-5 w-5 text-gray-600 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">Top Clientes</h3>
          </div>
          {topClientes.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No hay datos disponibles</p>
          ) : (
            <div className="space-y-3">
              {topClientes.map((cliente, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {cliente.nombre}
                    </p>
                    <p className="text-xs text-gray-500">
                      {cliente.cantidad} pedidos
                    </p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="text-sm font-semibold text-gray-900">
                      ${cliente.total.toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
