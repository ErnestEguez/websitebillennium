import { useEffect, useMemo, useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { TrendingUp, Package, DollarSign, Activity } from 'lucide-react';
import { supabase } from '../lib/supabase';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

interface DashboardImport {
  id: string;
  id_proveedor: string | null;
  numero_importacion: string | null;
  fecha_importacion: string | null;
  fecha_creacion: string | null;
  fob_total: number | null;
  estado: string | null;
}

interface ProviderRow {
  id: string;
  nombre_empresa: string;
}

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;
const formatCurrency = (value: number) => new Intl.NumberFormat('es-EC', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(value) || 0);

const getImportDate = (item: DashboardImport) => item.fecha_importacion || item.fecha_creacion || null;
const getImportYear = (item: DashboardImport) => {
  const dateValue = getImportDate(item);
  if (!dateValue) return null;
  const date = new Date(dateValue);
  return Number.isNaN(date.getTime()) ? null : date.getFullYear();
};
const getImportMonth = (item: DashboardImport) => {
  const dateValue = getImportDate(item);
  if (!dateValue) return null;
  const date = new Date(dateValue);
  return Number.isNaN(date.getTime()) ? null : date.getMonth();
};

const StatCard = ({ title, value, sub, icon: Icon, color }: any) => (
  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
    <div className="flex justify-between items-start">
      <div>
        <p className="text-sm text-gray-500 font-medium">{title}</p>
        <h3 className="text-2xl font-bold mt-1">{value}</h3>
        <p className="text-xs text-green-600 mt-1 font-semibold">{sub}</p>
      </div>
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon size={24} className="text-white" />
      </div>
    </div>
  </div>
);

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [importsData, setImportsData] = useState<DashboardImport[]>([]);
  const [providersMap, setProvidersMap] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);

        const { data: { session } } = await supabase.auth.getSession();
        const email = session?.user?.email;
        if (!email) {
          setImportsData([]);
          setProvidersMap({});
          setAvailableYears([new Date().getFullYear()]);
          return;
        }

        const { data: userDb, error: userError } = await supabase
          .from('usuarios')
          .select('id_empresa')
          .eq('email', email)
          .maybeSingle();

        if (userError) throw userError;

        const companyId = userDb?.id_empresa;
        if (!companyId) {
          setImportsData([]);
          setProvidersMap({});
          setAvailableYears([new Date().getFullYear()]);
          return;
        }

        const { data: liquidatedImports, error: importsError } = await supabase
          .from('importaciones')
          .select('id, id_proveedor, numero_importacion, fecha_importacion, fecha_creacion, fob_total, estado')
          .eq('id_empresa', companyId)
          .eq('estado', 'LIQUIDADA')
          .order('fecha_importacion', { ascending: false });

        if (importsError) throw importsError;

        const { data: providersData, error: providersError } = await supabase
          .from('proveedores')
          .select('id, nombre_empresa')
          .eq('id_empresa', companyId);

        if (providersError) throw providersError;

        const normalizedImports = (liquidatedImports || []).map((item) => ({
          ...item,
          fob_total: Number(item.fob_total || 0),
        }));

        const nextYears = Array.from(new Set(normalizedImports
          .map((item) => getImportYear(item))
          .filter((year): year is number => year !== null)))
          .sort((a, b) => b - a);

        setImportsData(normalizedImports);
        setProvidersMap(Object.fromEntries(((providersData || []) as ProviderRow[]).map((provider) => [provider.id, provider.nombre_empresa])));
        setAvailableYears(nextYears.length > 0 ? nextYears : [new Date().getFullYear()]);
        setSelectedYear((currentYear) => {
          if (nextYears.length === 0) return currentYear;
          return nextYears.includes(currentYear) ? currentYear : nextYears[0];
        });
      } catch (error: any) {
        console.error(error);
        alert('Error cargando dashboard: ' + error.message);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const filteredImports = useMemo(
    () => importsData.filter((item) => getImportYear(item) === selectedYear),
    [importsData, selectedYear]
  );

  const totalImports = filteredImports.length;
  const totalFob = round2(filteredImports.reduce((sum, item) => sum + Number(item.fob_total || 0), 0));
  const activeProviders = new Set(filteredImports.map((item) => item.id_proveedor).filter(Boolean)).size;
  const averageFob = totalImports > 0 ? round2(totalFob / totalImports) : 0;

  const monthlyData = useMemo(() => (
    MONTHS.map((name, index) => {
      const monthRows = filteredImports.filter((item) => getImportMonth(item) === index);
      return {
        name,
        importaciones: monthRows.length,
        fob: round2(monthRows.reduce((sum, item) => sum + Number(item.fob_total || 0), 0)),
      };
    })
  ), [filteredImports]);

  const providerData = useMemo(() => {
    const grouped = filteredImports.reduce<Record<string, number>>((acc, item) => {
      const providerName = item.id_proveedor ? providersMap[item.id_proveedor] || 'Proveedor sin nombre' : 'Sin proveedor';
      acc[providerName] = round2((acc[providerName] || 0) + Number(item.fob_total || 0));
      return acc;
    }, {});

    const rows = Object.entries(grouped)
      .map(([name, value]) => ({ name, value: round2(value) }))
      .sort((a, b) => b.value - a.value);

    if (rows.length <= 5) return rows;

    const topRows = rows.slice(0, 5);
    const othersValue = round2(rows.slice(5).reduce((sum, row) => sum + row.value, 0));
    return othersValue > 0 ? [...topRows, { name: 'Otros', value: othersValue }] : topRows;
  }, [filteredImports, providersMap]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 flex items-center justify-center min-h-[320px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Resumen de Importaciones Liquidadas</h2>
          <p className="text-sm text-slate-500">El dashboard considera únicamente importaciones con estado LIQUIDADA.</p>
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor="dashboard-year" className="text-sm font-medium text-slate-600">Año</label>
          <select
            id="dashboard-year"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
          >
            {availableYears.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Importaciones Liquidadas" value={String(totalImports)} sub={`Año ${selectedYear}`} icon={Activity} color="bg-blue-600" />
        <StatCard title="FOB Liquidado" value={formatCurrency(totalFob)} sub={`Solo estado LIQUIDADA`} icon={DollarSign} color="bg-emerald-600" />
        <StatCard title="Proveedores Activos" value={String(activeProviders)} sub={`Con importaciones en ${selectedYear}`} icon={Package} color="bg-amber-600" />
        <StatCard title="FOB Promedio" value={formatCurrency(averageFob)} sub={`Promedio por importación`} icon={TrendingUp} color="bg-indigo-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold mb-4">Importaciones Liquidadas por Mes</h3>
          <div className="h-80">
            {totalImports === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">No hay importaciones liquidadas para el año seleccionado.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis yAxisId="left" allowDecimals={false} />
                  <YAxis yAxisId="right" orientation="right" tickFormatter={(value) => `$${Math.round(Number(value) / 1000)}k`} />
                  <Tooltip formatter={(value: any, name: any) => name === 'FOB Total' ? formatCurrency(Number(value || 0)) : Number(value || 0)} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="importaciones" name="Importaciones" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="right" dataKey="fob" name="FOB Total" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold mb-4">Distribución por Proveedor</h3>
          <div className="h-80 flex items-center justify-center">
            {providerData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">No hay proveedores con importaciones liquidadas para el año seleccionado.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={providerData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                    nameKey="name"
                  >
                    {providerData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => formatCurrency(Number(value || 0))} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
