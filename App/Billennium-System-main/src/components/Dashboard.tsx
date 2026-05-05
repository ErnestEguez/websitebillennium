import { useState, useEffect } from 'react';
import { DollarSign, ShoppingCart, TrendingUp, Package, Calendar, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type TipoPeriodo = 'mes' | 'anio' | 'custom';

interface EstadisticasVentas {
  totalPrincipal: number;
  cantidadPrincipal: number;
  totalAnio: number;
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

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function getRango(tipo: TipoPeriodo, mes: number, anio: number): { inicio: string; fin: string; label: string } {
  const ahora = new Date();
  if (tipo === 'mes') {
    const m = ahora.getMonth();
    const a = ahora.getFullYear();
    return {
      inicio: new Date(a, m, 1).toISOString(),
      fin:    new Date(a, m + 1, 0, 23, 59, 59).toISOString(),
      label:  `${MESES[m]} ${a}`,
    };
  }
  if (tipo === 'anio') {
    const a = ahora.getFullYear();
    return {
      inicio: new Date(a, 0, 1).toISOString(),
      fin:    new Date(a, 11, 31, 23, 59, 59).toISOString(),
      label:  `Año ${a}`,
    };
  }
  // custom
  return {
    inicio: new Date(anio, mes, 1).toISOString(),
    fin:    new Date(anio, mes + 1, 0, 23, 59, 59).toISOString(),
    label:  `${MESES[mes]} ${anio}`,
  };
}

export function Dashboard() {
  const { vendedor } = useAuth();
  const [loading, setLoading] = useState(true);
  const [tipoPeriodo, setTipoPeriodo] = useState<TipoPeriodo>('mes');
  const [mesCustom, setMesCustom] = useState(new Date().getMonth());
  const [anioCustom, setAnioCustom] = useState(new Date().getFullYear());
  const [estadisticas, setEstadisticas] = useState<EstadisticasVentas>({
    totalPrincipal: 0, cantidadPrincipal: 0, totalAnio: 0, cantidadAnio: 0,
  });
  const [topArticulos, setTopArticulos] = useState<ArticuloEstadistica[]>([]);
  const [topClientes, setTopClientes] = useState<ClienteEstadistica[]>([]);

  useEffect(() => {
    cargarEstadisticas();
  }, [vendedor, tipoPeriodo, mesCustom, anioCustom]);

  const rango = getRango(tipoPeriodo, mesCustom, anioCustom);
  const rangoAnio = getRango('anio', 0, new Date().getFullYear());

  const cargarEstadisticas = async () => {
    if (!vendedor?.empresa_id) return;
    try {
      setLoading(true);

      // Pedidos del período seleccionado
      const { data: pedidosPeriodo } = await supabase
        .from('pedido_cabecera')
        .select('total')
        .eq('empresa_id', vendedor.empresa_id)
        .eq('vendedor_id', vendedor.id)
        .eq('estado', 'Autorizada')
        .gte('created_at', rango.inicio)
        .lte('created_at', rango.fin);

      // Pedidos del año para métricas anuales
      const { data: pedidosAnio } = await supabase
        .from('pedido_cabecera')
        .select('total')
        .eq('empresa_id', vendedor.empresa_id)
        .eq('vendedor_id', vendedor.id)
        .eq('estado', 'Autorizada')
        .gte('created_at', rangoAnio.inicio)
        .lte('created_at', rangoAnio.fin);

      setEstadisticas({
        totalPrincipal:    pedidosPeriodo?.reduce((s, p) => s + Number(p.total || 0), 0) || 0,
        cantidadPrincipal: pedidosPeriodo?.length || 0,
        totalAnio:    pedidosAnio?.reduce((s, p) => s + Number(p.total || 0), 0) || 0,
        cantidadAnio: pedidosAnio?.length || 0,
      });

      // Top artículos del período
      const { data: pedidosIds } = await supabase
        .from('pedido_cabecera')
        .select('id')
        .eq('empresa_id', vendedor.empresa_id)
        .eq('vendedor_id', vendedor.id)
        .eq('estado', 'Autorizada')
        .gte('created_at', rango.inicio)
        .lte('created_at', rango.fin);

      const ids = pedidosIds?.map(p => p.id) || [];

      if (ids.length > 0) {
        const { data: detalles } = await supabase
          .from('pedido_detalle')
          .select('descripcion, cantidad, subtotal, pedido_id')
          .eq('empresa_id', vendedor.empresa_id)
          .in('pedido_id', ids);

        if (detalles) {
          const artMap = new Map<string, { cantidad: number; total: number }>();
          detalles.forEach(d => {
            const ex = artMap.get(d.descripcion) || { cantidad: 0, total: 0 };
            artMap.set(d.descripcion, {
              cantidad: ex.cantidad + Number(d.cantidad),
              total:    ex.total + Number(d.subtotal),
            });
          });
          setTopArticulos(
            Array.from(artMap.entries())
              .map(([descripcion, v]) => ({ descripcion, ...v }))
              .sort((a, b) => b.total - a.total)
              .slice(0, 10)
          );
        }

        // Top clientes del período
        const { data: clientesData } = await supabase
          .from('pedido_cabecera')
          .select('nombre_cliente, total')
          .eq('empresa_id', vendedor.empresa_id)
          .eq('vendedor_id', vendedor.id)
          .eq('estado', 'Autorizada')
          .gte('created_at', rango.inicio)
          .lte('created_at', rango.fin);

        if (clientesData) {
          const cliMap = new Map<string, { total: number; cantidad: number }>();
          clientesData.forEach(p => {
            const ex = cliMap.get(p.nombre_cliente) || { total: 0, cantidad: 0 };
            cliMap.set(p.nombre_cliente, { total: ex.total + Number(p.total), cantidad: ex.cantidad + 1 });
          });
          setTopClientes(
            Array.from(cliMap.entries())
              .map(([nombre, v]) => ({ nombre, ...v }))
              .sort((a, b) => b.total - a.total)
              .slice(0, 10)
          );
        }
      } else {
        setTopArticulos([]);
        setTopClientes([]);
      }
    } catch (err) {
      console.error('Error cargando estadísticas:', err);
    } finally {
      setLoading(false);
    }
  };

  // Navegar mes anterior/siguiente en modo custom
  const mesAnterior = () => {
    if (mesCustom === 0) { setMesCustom(11); setAnioCustom(a => a - 1); }
    else setMesCustom(m => m - 1);
    setTipoPeriodo('custom');
  };
  const mesSiguiente = () => {
    const ahora = new Date();
    const esHoy = anioCustom === ahora.getFullYear() && mesCustom === ahora.getMonth();
    if (esHoy) return;
    if (mesCustom === 11) { setMesCustom(0); setAnioCustom(a => a + 1); }
    else setMesCustom(m => m + 1);
    setTipoPeriodo('custom');
  };

  const labelPrincipal = tipoPeriodo === 'mes' ? 'Ventas del Mes' : tipoPeriodo === 'anio' ? 'Ventas del Año' : `Ventas ${rango.label}`;

  return (
    <div className="space-y-6">
      {/* Encabezado + selector de período */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard de Ventas</h2>
          <p className="text-sm text-gray-600 mt-1">Pedidos autorizados · {rango.label}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Botones rápidos */}
          <button
            onClick={() => setTipoPeriodo('mes')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tipoPeriodo === 'mes' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            Mes actual
          </button>
          <button
            onClick={() => setTipoPeriodo('anio')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${tipoPeriodo === 'anio' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            Año actual
          </button>

          {/* Navegador de mes personalizado */}
          <div className="flex items-center gap-1 bg-white border border-gray-300 rounded-lg overflow-hidden">
            <button onClick={mesAnterior} className="p-1.5 hover:bg-gray-100 text-gray-600" title="Mes anterior">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex gap-1 px-1">
              <select
                value={mesCustom}
                onChange={e => { setMesCustom(Number(e.target.value)); setTipoPeriodo('custom'); }}
                className="text-sm text-gray-700 bg-transparent border-none focus:ring-0 py-1 cursor-pointer"
              >
                {MESES.map((m, i) => <option key={i} value={i}>{m.slice(0,3)}</option>)}
              </select>
              <select
                value={anioCustom}
                onChange={e => { setAnioCustom(Number(e.target.value)); setTipoPeriodo('custom'); }}
                className="text-sm text-gray-700 bg-transparent border-none focus:ring-0 py-1 cursor-pointer"
              >
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 4 + i).map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <button
              onClick={mesSiguiente}
              className="p-1.5 hover:bg-gray-100 text-gray-600 disabled:opacity-30"
              disabled={anioCustom === new Date().getFullYear() && mesCustom === new Date().getMonth()}
              title="Mes siguiente"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12 text-gray-500">Cargando estadísticas...</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{labelPrincipal}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">${estadisticas.totalPrincipal.toFixed(2)}</p>
                  <p className="text-sm text-gray-500 mt-1">{estadisticas.cantidadPrincipal} pedidos</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-full"><Calendar className="h-8 w-8 text-blue-600" /></div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Ventas del Año</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">${estadisticas.totalAnio.toFixed(2)}</p>
                  <p className="text-sm text-gray-500 mt-1">{estadisticas.cantidadAnio} pedidos</p>
                </div>
                <div className="p-3 bg-green-50 rounded-full"><TrendingUp className="h-8 w-8 text-green-600" /></div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Ticket Promedio</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">
                    ${estadisticas.cantidadAnio > 0 ? (estadisticas.totalAnio / estadisticas.cantidadAnio).toFixed(2) : '0.00'}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">Por pedido (año)</p>
                </div>
                <div className="p-3 bg-purple-50 rounded-full"><DollarSign className="h-8 w-8 text-purple-600" /></div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Pedidos Totales</p>
                  <p className="text-3xl font-bold text-gray-900 mt-2">{estadisticas.cantidadAnio}</p>
                  <p className="text-sm text-gray-500 mt-1">Este año</p>
                </div>
                <div className="p-3 bg-orange-50 rounded-full"><ShoppingCart className="h-8 w-8 text-orange-600" /></div>
              </div>
            </div>
          </div>

          {/* Top Artículos y Clientes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center mb-4">
                <Package className="h-5 w-5 text-gray-600 mr-2" />
                <h3 className="text-lg font-semibold text-gray-900">Artículos Más Vendidos</h3>
                <span className="ml-auto text-xs text-gray-400">{rango.label}</span>
              </div>
              {topArticulos.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No hay datos para este período</p>
              ) : (
                <div className="space-y-3">
                  {topArticulos.map((art, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{art.descripcion}</p>
                        <p className="text-xs text-gray-500">Cantidad: {art.cantidad.toFixed(2)}</p>
                      </div>
                      <p className="text-sm font-semibold text-gray-900 ml-4">${art.total.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center mb-4">
                <Users className="h-5 w-5 text-gray-600 mr-2" />
                <h3 className="text-lg font-semibold text-gray-900">Top Clientes</h3>
                <span className="ml-auto text-xs text-gray-400">{rango.label}</span>
              </div>
              {topClientes.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No hay datos para este período</p>
              ) : (
                <div className="space-y-3">
                  {topClientes.map((cli, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{cli.nombre}</p>
                        <p className="text-xs text-gray-500">{cli.cantidad} pedidos</p>
                      </div>
                      <p className="text-sm font-semibold text-gray-900 ml-4">${cli.total.toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
