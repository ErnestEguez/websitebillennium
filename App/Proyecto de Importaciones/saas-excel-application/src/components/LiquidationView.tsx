import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Search, FileText, Save, FileSpreadsheet, FileDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';

interface PendingImport {
  id: string;
  id_empresa: string;
  id_proveedor: string;
  numero_importacion: string;
  fecha_importacion: string;
  estado: string;
  tasa_iva: number;
  seguro?: number;
  valor_seguro?: number;
  flete?: number;
  fob_total?: number;
  nombre_proveedor?: string;
}

interface LiquidationHeader extends PendingImport {
  total_gastos_generales: number;
  total_seguro: number;
  total_flete: number;
}

interface LiquidationRow {
  detailId: string;
  idProducto: string;
  secuencial: number;
  arancel: string;
  codigo: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  fob: number;
  pesoPct: number;
  distribucionGastos: number;
  seguro: number;
  flete: number;
  valorCif: number;
  fodinfa: number;
  adValorem: number;
  baseIva: number;
  iva: number;
  totalGastos: number;
  costoTotal: number;
  costoUnitario: number;
  gastoPct: number;
  margenGanancia: number;
  precioVentaCalculado: number;
  pvpMercado: number;
  ventaTotalSinIva: number;
  utilidadImportacion: number;
  proyeccionVentas: number;
  proyeccionUtilidad: number;
  ventaConIvaMayorista: number;
  incrementoPvp: number;
  ventaConIvaMinorista: number;
}

const round2 = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const round6 = (value: number) => Math.round((Number(value) + Number.EPSILON) * 1000000) / 1000000;
const format2 = (value: number) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const format6 = (value: number) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 6, maximumFractionDigits: 6 });

export default function LiquidationView() {
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<'save' | 'excel' | 'csv' | 'restore' | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [search, setSearch] = useState('');
  const [imports, setImports] = useState<PendingImport[]>([]);
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [statusFilter, setStatusFilter] = useState<'pending' | 'liquidated'>('pending');
  const [header, setHeader] = useState<LiquidationHeader | null>(null);
  const [baseRows, setBaseRows] = useState<any[]>([]);

  const rows = useMemo<LiquidationRow[]>(() => {
    if (!header || baseRows.length === 0) return [];
    
    const totalFobRaw = baseRows.reduce((sum, row) => sum + row.fobRaw, 0);
    const totalFobBase = Number(header.fob_total || 0) > 0 ? Number(header.fob_total || 0) : totalFobRaw;

    return baseRows.map((row) => {
        const fob = round2(row.fobRaw);
        const pesoPct = totalFobBase > 0 ? round2((fob / totalFobBase) * 100) : 0;
        const pesoFactor = pesoPct / 100;
        const distribucionGastos = round2((header.total_gastos_generales + header.total_flete) * pesoFactor);
        const seguro = round2(header.total_seguro * pesoFactor);
        const flete = round2(header.total_flete * pesoFactor);
        const valorCif = round2(fob + seguro + flete);
        const fodinfa = round2(valorCif * 0.005);
        const adValorem = round2(valorCif * (row.adValoremPct / 100));
        const baseIva = round2(valorCif + fodinfa + adValorem);
        const iva = round2(baseIva * (header.tasa_iva / 100));
        const totalGastos = round2(distribucionGastos + seguro + flete + fodinfa + adValorem);
        const costoTotal = round2(fob + totalGastos);
        const costoUnitario = row.cantidad > 0 ? round6(costoTotal / row.cantidad) : 0;
        const gastoPct = row.precioUnitario > 0 ? round2(((costoUnitario / row.precioUnitario) - 1) * 100) : 0;
        const precioVentaCalculado = round6(costoUnitario * (1 + (row.margenGanancia / 100)));
        const ventaTotalSinIva = round2(row.cantidad * precioVentaCalculado);
        const utilidadImportacion = round2(ventaTotalSinIva - costoTotal);
        const proyeccionVentas = round2(row.pvpMercado * row.cantidad);
        const proyeccionUtilidad = round2(proyeccionVentas - costoTotal);
        const ventaConIvaMayorista = round6(precioVentaCalculado * (1 + (header.tasa_iva / 100)));
        const ventaConIvaMinorista = round6(ventaConIvaMayorista * (1 + (row.incrementoPvp / 100)));

        return {
          detailId: row.detailId,
          idProducto: row.idProducto,
          secuencial: row.secuencial,
          arancel: row.arancel,
          codigo: row.codigo,
          descripcion: row.descripcion,
          cantidad: row.cantidad,
          precioUnitario: round6(row.precioUnitario),
          fob,
          pesoPct,
          distribucionGastos,
          seguro,
          flete,
          valorCif,
          fodinfa,
          adValorem,
          baseIva,
          iva,
          totalGastos,
          costoTotal,
          costoUnitario,
          gastoPct,
          margenGanancia: round2(row.margenGanancia),
          precioVentaCalculado,
          pvpMercado: round6(row.pvpMercado),
          ventaTotalSinIva,
          utilidadImportacion,
          proyeccionVentas,
          proyeccionUtilidad,
          ventaConIvaMayorista,
          incrementoPvp: round2(row.incrementoPvp),
          ventaConIvaMinorista
        };
    });
  }, [header, baseRows]);

  useEffect(() => {
    fetchImports();
  }, [statusFilter]);

  const fetchImports = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email;

      let currentCompanyId: string | null = null;
      if (email) {
        const { data: userDb } = await supabase
          .from('usuarios')
          .select('id_empresa')
          .eq('email', email)
          .maybeSingle();
        currentCompanyId = userDb?.id_empresa || null;
      }

      if (!currentCompanyId) {
        setImports([]);
        setCompanyName('');
        return;
      }

      const { data: empresaData } = await supabase
        .from('empresas')
        .select('nombre')
        .eq('id', currentCompanyId)
        .maybeSingle();
      setCompanyName(empresaData?.nombre || '');

      let importsQuery = supabase
        .from('importaciones')
        .select('*')
        .eq('id_empresa', currentCompanyId)
        .order('fecha_creacion', { ascending: false });

      importsQuery = statusFilter === 'liquidated'
        ? importsQuery.eq('estado', 'LIQUIDADA')
        : importsQuery.neq('estado', 'LIQUIDADA');

      const { data: importsData, error: importsError } = await importsQuery;

      if (importsError) throw importsError;

      const { data: proveedoresData, error: proveedoresError } = await supabase
        .from('proveedores')
        .select('id, nombre_empresa')
        .eq('id_empresa', currentCompanyId);

      if (proveedoresError) throw proveedoresError;

      const merged = (importsData || []).map((imp: any) => {
        const proveedor = (proveedoresData || []).find((prov: any) => prov.id === imp.id_proveedor);
        return {
          ...imp,
          nombre_proveedor: proveedor?.nombre_empresa || 'Sin proveedor'
        };
      });

      setImports(merged);
    } catch (error: any) {
      console.error(error);
      alert('Error cargando importaciones pendientes: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const openLiquidation = async (imp: PendingImport) => {
    try {
      setLoading(true);

      const { data: detailsData, error: detailsError } = await supabase
        .from('importacion_detalle')
        .select('*')
        .eq('id_importacion', imp.id)
        .order('secuencial', { ascending: true });

      if (detailsError) throw detailsError;

      const detailRows = detailsData || [];
      const productIds = [...new Set(detailRows.map((row: any) => row.id_producto).filter(Boolean))];

      let productosData: any[] = [];
      if (productIds.length > 0) {
        const { data, error } = await supabase
          .from('productos')
          .select('*')
          .in('id', productIds);
        if (error) throw error;
        productosData = data || [];
      }

      const arancelIds = [...new Set(productosData.map((prod: any) => prod.partida_senae).filter(Boolean))];

      let arancelesData: any[] = [];
      if (arancelIds.length > 0) {
        const { data, error } = await supabase
          .from('aranceles')
          .select('*')
          .in('id', arancelIds);
        if (error) throw error;
        arancelesData = data || [];
      }

      const { data: gastosData, error: gastosError } = await supabase
        .from('gastos')
        .select('valor_gasto')
        .eq('id_importacion', imp.id);

      if (gastosError) throw gastosError;

      const totalGastosGenerales = round2((gastosData || []).reduce((sum: number, gasto: any) => sum + Number(gasto.valor_gasto || 0), 0));
      const totalSeguro = round2(Number(imp.seguro ?? imp.valor_seguro ?? 0));
      const totalFlete = round2(Number(imp.flete ?? 0));

      const productsMap = new Map(productosData.map((prod: any) => [prod.id, prod]));
      const arancelesMap = new Map(arancelesData.map((arancel: any) => [arancel.id, arancel]));

      const baseRows = detailRows.map((row: any) => {
        const producto = productsMap.get(row.id_producto);
        const arancel = producto?.partida_senae ? arancelesMap.get(producto.partida_senae) : null;
        const cantidad = Number(row.cantidad || 0);
        const precioUnitario = Number(row.precio_unitario || 0);
        const fobRaw = cantidad * precioUnitario;

        return {
          detailId: String(row.id || ''),
          idProducto: String(row.id_producto || ''),
          secuencial: Number(row.secuencial || 0),
          arancel: arancel?.partida || '',
          codigo: producto?.codigo || '',
          descripcion: producto?.descripcion || '',
          cantidad,
          precioUnitario,
          fobRaw,
          adValoremPct: Number(arancel?.advalorem || 0),
          margenGanancia: Number(row.tasa_margen_ganancia || 0),
          pvpMercado: Number(row.pvp_mercado || 0),
          incrementoPvp: Number(row.tasa_incremento_pvp || 0)
        };
      });

      setHeader({
        ...imp,
        total_gastos_generales: totalGastosGenerales,
        total_seguro: totalSeguro,
        total_flete: totalFlete
      });
      setBaseRows(baseRows);
      setView('detail');
    } catch (error: any) {
      console.error(error);
      alert('Error cargando la liquidación: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredImports = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return imports;
    return imports.filter((imp) =>
      String(imp.numero_importacion || '').toLowerCase().includes(term) ||
      String(imp.nombre_proveedor || '').toLowerCase().includes(term) ||
      String(imp.estado || '').toLowerCase().includes(term)
    );
  }, [imports, search]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => ({
        cantidad: acc.cantidad + row.cantidad,
        fob: acc.fob + row.fob,
        distribucionGastos: acc.distribucionGastos + row.distribucionGastos,
        seguro: acc.seguro + row.seguro,
        flete: acc.flete + row.flete,
        valorCif: acc.valorCif + row.valorCif,
        fodinfa: acc.fodinfa + row.fodinfa,
        adValorem: acc.adValorem + row.adValorem,
        baseIva: acc.baseIva + row.baseIva,
        iva: acc.iva + row.iva,
        totalGastos: acc.totalGastos + row.totalGastos,
        costoTotal: acc.costoTotal + row.costoTotal,
        ventaTotalSinIva: acc.ventaTotalSinIva + row.ventaTotalSinIva,
        utilidadImportacion: acc.utilidadImportacion + row.utilidadImportacion,
        proyeccionVentas: acc.proyeccionVentas + row.proyeccionVentas,
        proyeccionUtilidad: acc.proyeccionUtilidad + row.proyeccionUtilidad
      }),
      {
        cantidad: 0,
        fob: 0,
        distribucionGastos: 0,
        seguro: 0,
        flete: 0,
        valorCif: 0,
        fodinfa: 0,
        adValorem: 0,
        baseIva: 0,
        iva: 0,
        totalGastos: 0,
        costoTotal: 0,
        ventaTotalSinIva: 0,
        utilidadImportacion: 0,
        proyeccionVentas: 0,
        proyeccionUtilidad: 0
      }
    );
  }, [rows]);

  const buildExportMatrix = () => {
    const detailHeaders = [
      'Arancel', 'Código', 'Descripción', 'Cantidad', 'P. Unitario', 'FOB', 'Peso % FOB',
      'Distrib. Gastos', 'Seguro', 'Flete', 'Valor CIF', 'Fodinfa', 'Ad Valorem',
      'Base IVA', 'IVA', 'Total Gastos', 'Costo Total', 'Costo Unitario', 'Gast %',
      '% Margen', 'Precio Venta Calculado', 'PVP Mercado USD', 'Venta Total Sin IVA',
      'Utilidad Importación', 'Proyección Ventas', 'Proyección Utilidad',
      'Venta c/ IVA Mayorista', 'Incremento PVP', 'Venta c/ IVA Minorista'
    ];

    const detailRows = rows.map((row) => ([
      row.arancel,
      row.codigo,
      row.descripcion,
      row.cantidad,
      row.precioUnitario,
      row.fob,
      row.pesoPct,
      row.distribucionGastos,
      row.seguro,
      row.flete,
      row.valorCif,
      row.fodinfa,
      row.adValorem,
      row.baseIva,
      row.iva,
      row.totalGastos,
      row.costoTotal,
      row.costoUnitario,
      row.gastoPct,
      row.margenGanancia,
      row.precioVentaCalculado,
      row.pvpMercado,
      row.ventaTotalSinIva,
      row.utilidadImportacion,
      row.proyeccionVentas,
      row.proyeccionUtilidad,
      row.ventaConIvaMayorista,
      row.incrementoPvp,
      row.ventaConIvaMinorista
    ]));

    const totalsRow = [
      'Totales', '', '', totals.cantidad, '', totals.fob, '', totals.distribucionGastos,
      totals.seguro, totals.flete, totals.valorCif, totals.fodinfa, totals.adValorem,
      totals.baseIva, totals.iva, totals.totalGastos, totals.costoTotal, '', '', '', '', '',
      totals.ventaTotalSinIva, totals.utilidadImportacion, totals.proyeccionVentas,
      totals.proyeccionUtilidad, '', '', ''
    ];

    return [
      ['Empresa', companyName || ''],
      ['Importación', header?.numero_importacion || ''],
      ['Proveedor', header?.nombre_proveedor || ''],
      ['Fecha', header?.fecha_importacion || ''],
      ['Estado', header?.estado || ''],
      ['Tasa IVA', Number(header?.tasa_iva || 0)],
      ['FOB Total', Number(header?.fob_total || 0)],
      ['Seguro', Number(header?.total_seguro || 0)],
      ['Flete', Number(header?.total_flete || 0)],
      ['Gastos Generales', Number(header?.total_gastos_generales || 0)],
      [],
      detailHeaders,
      ...detailRows,
      totalsRow
    ];
  };

  const handleSaveLiquidation = async () => {
    if (!header || rows.length === 0) {
      alert('No hay datos de liquidación para grabar.');
      return;
    }

    try {
      setActionLoading('save');

      const detailUpdates = rows.map((row) => {
        if (!row.detailId) {
          throw new Error(`La fila secuencial ${row.secuencial} no tiene identificador de detalle.`);
        }

        return supabase
          .from('importacion_detalle')
          .update({
            fob: row.fob,
            peso_pct: row.pesoPct,
            distribucion_gastos: row.distribucionGastos,
            seguro: row.seguro,
            flete: row.flete,
            cif: row.valorCif,
            fodinfa: row.fodinfa,
            advalorem: row.adValorem,
            base_iva: row.baseIva,
            iva: row.iva,
            total_gastos: row.totalGastos,
            costo_total: row.costoTotal,
            costo_unitario: row.costoUnitario,
            gasto_pct: row.gastoPct,
            tasa_margen_ganancia: row.margenGanancia,
            precio_venta_calculado: row.precioVentaCalculado,
            pvp_mercado: row.pvpMercado,
            venta_total_sin_iva: row.ventaTotalSinIva,
            utilidad_importacion: row.utilidadImportacion,
            proyeccion_ventas: row.proyeccionVentas,
            proyeccion_utilidad: row.proyeccionUtilidad,
            venta_con_iva_mayorista: row.ventaConIvaMayorista,
            tasa_incremento_pvp: row.incrementoPvp,
            venta_con_iva_minorista: row.ventaConIvaMinorista
          })
          .eq('id', row.detailId);
      });

      const detailResults = await Promise.all(detailUpdates);
      const detailError = detailResults.find((result) => result.error)?.error;
      if (detailError) throw detailError;

      const { error: headerError } = await supabase
        .from('importaciones')
        .update({ estado: 'LIQUIDADA', flete: header.total_flete })
        .eq('id', header.id);

      if (headerError) throw headerError;

      alert('Liquidación grabada correctamente.');
      setHeader(null);
      setBaseRows([]);
      setView('list');
      await fetchImports();
    } catch (error: any) {
      console.error(error);
      alert('Error al grabar la liquidación: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleExportCsv = () => {
    if (!header || rows.length === 0) {
      alert('No hay datos para exportar.');
      return;
    }

    try {
      setActionLoading('csv');
      const matrix = buildExportMatrix();
      const csv = matrix
        .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `liquidacion_${header.numero_importacion || 'importacion'}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setActionLoading(null);
    }
  };

  const handleExportExcel = () => {
    if (!header || rows.length === 0) {
      alert('No hay datos para exportar.');
      return;
    }

    try {
      setActionLoading('excel');
      const worksheet = XLSX.utils.aoa_to_sheet(buildExportMatrix());
      worksheet['!cols'] = [
        { wch: 18 }, { wch: 16 }, { wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
        { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 18 },
        { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 14 }, { wch: 18 }
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Liquidacion');
      XLSX.writeFile(workbook, `liquidacion_${header.numero_importacion || 'importacion'}.xlsx`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestoreToDraft = async () => {
    if (!header) {
      alert('No hay una liquidación seleccionada.');
      return;
    }

    try {
      setActionLoading('restore');
      const { error } = await supabase
        .from('importaciones')
        .update({ estado: 'BORRADOR' })
        .eq('id', header.id);

      if (error) throw error;

      alert('La importación fue restablecida a BORRADOR.');
      setHeader(null);
      setBaseRows([]);
      setStatusFilter('pending');
      setView('list');
      await fetchImports();
    } catch (error: any) {
      console.error(error);
      alert('Error al restablecer la importación: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  }

  if (view === 'list') {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Liquidación</h2>
            <p className="text-sm text-slate-500">
              {statusFilter === 'pending'
                ? 'Seleccione una importación pendiente para visualizar su liquidación.'
                : 'Consulte importaciones liquidadas o restablézcalas a borrador si aún faltan datos.'}
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
            <div className="inline-flex rounded-xl border border-slate-300 p-1 bg-white w-full md:w-auto">
              <button
                type="button"
                onClick={() => setStatusFilter('pending')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${statusFilter === 'pending' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                Pendientes
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('liquidated')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${statusFilter === 'liquidated' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                Liquidadas
              </button>
            </div>
            <div className="relative w-full md:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar importación o proveedor..."
                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 font-bold text-slate-600">Número</th>
                  <th className="px-6 py-4 font-bold text-slate-600">Proveedor</th>
                  <th className="px-6 py-4 font-bold text-slate-600">Fecha</th>
                  <th className="px-6 py-4 font-bold text-slate-600">Estado</th>
                  <th className="px-6 py-4 font-bold text-slate-600 text-right">FOB Total</th>
                  <th className="px-6 py-4 font-bold text-slate-600 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredImports.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-slate-500">
                      {statusFilter === 'pending'
                        ? 'No hay importaciones pendientes de liquidación.'
                        : 'No hay importaciones liquidadas para consultar.'}
                    </td>
                  </tr>
                ) : (
                  filteredImports.map((imp) => (
                    <tr key={imp.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 font-semibold text-blue-600">{imp.numero_importacion}</td>
                      <td className="px-6 py-4 text-slate-700">{imp.nombre_proveedor}</td>
                      <td className="px-6 py-4 text-slate-600">{imp.fecha_importacion}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          imp.estado === 'TRANSITO' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {imp.estado}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-slate-700">$ {format2(Number(imp.fob_total || 0))}</td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => openLiquidation(imp)}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                          <FileText size={16} /> Entrar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <button
            type="button"
            onClick={() => setView('list')}
            className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-2"
          >
            <ArrowLeft size={18} /> Volver al listado
          </button>
          <h2 className="text-2xl font-bold text-slate-800">Liquidación de Importación</h2>
          <p className="text-sm text-slate-500">{companyName || 'Empresa'}{header?.numero_importacion ? ` · Importación ${header.numero_importacion}` : ''}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {header?.estado === 'LIQUIDADA' && (
            <button
              type="button"
              onClick={handleRestoreToDraft}
              disabled={actionLoading !== null}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-60"
            >
              <ArrowLeft size={16} /> {actionLoading === 'restore' ? 'Restableciendo...' : 'Restablecer a BORRADOR'}
            </button>
          )}
          <button
            type="button"
            onClick={handleSaveLiquidation}
            disabled={actionLoading !== null}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-60"
          >
            <Save size={16} /> {actionLoading === 'save' ? 'Grabando...' : 'Grabar'}
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={actionLoading !== null}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            <FileSpreadsheet size={16} /> {actionLoading === 'excel' ? 'Exportando...' : 'Exportar a Excel'}
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={actionLoading !== null}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-60"
          >
            <FileDown size={16} /> {actionLoading === 'csv' ? 'Exportando...' : 'Exportar a CSV'}
          </button>
        </div>
      </div>

      {header && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Número Importación</label>
              <input value={header.numero_importacion || ''} readOnly className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-slate-50" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Proveedor</label>
              <input value={header.nombre_proveedor || ''} readOnly className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-slate-50" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Fecha Importación</label>
              <input value={header.fecha_importacion || ''} readOnly className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-slate-50" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Estado</label>
              <input value={header.estado || ''} readOnly className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-slate-50" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tasa IVA</label>
              <input value={`${format2(Number(header.tasa_iva || 0))}%`} readOnly className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-slate-50" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Valor Seguro</label>
              <input value={`$ ${format2(header.total_seguro)}`} readOnly className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-slate-50" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Flete</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold">$</span>
                <input 
                  type="number" 
                  step="0.01" 
                  value={header.total_flete} 
                  onChange={(e) => setHeader({ ...header, total_flete: Number(e.target.value) || 0 })}
                  className="w-full pl-7 pr-3 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500 outline-none hover:bg-slate-50 transition-colors" 
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Gastos Generales</label>
              <input value={`$ ${format2(header.total_gastos_generales)}`} readOnly className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-slate-50" />
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[2500px] text-xs text-left border-collapse">
            <thead className="bg-[#2f64b3] text-white">
              <tr>
                <th className="px-3 py-3 font-bold border border-blue-400">Arancel</th>
                <th className="px-3 py-3 font-bold border border-blue-400">Código</th>
                <th className="px-3 py-3 font-bold border border-blue-400 min-w-[220px]">Descripción</th>
                <th className="px-3 py-3 font-bold border border-blue-400 text-right">Cant.</th>
                <th className="px-3 py-3 font-bold border border-blue-400 text-right">P. Unitario</th>
                <th className="px-3 py-3 font-bold border border-blue-400 text-right">FOB</th>
                <th className="px-3 py-3 font-bold border border-blue-400 text-right">Peso % FOB</th>
                <th className="px-3 py-3 font-bold border border-blue-400 text-right">Distrib. Gastos</th>
                <th className="px-3 py-3 font-bold border border-blue-400 text-right">Seguro</th>
                <th className="px-3 py-3 font-bold border border-blue-400 text-right">Flete</th>
                <th className="px-3 py-3 font-bold border border-blue-400 text-right">Valor CIF</th>
                <th className="px-3 py-3 font-bold border border-blue-400 text-right">Fodinfa</th>
                <th className="px-3 py-3 font-bold border border-blue-400 text-right">Ad Valorem</th>
                <th className="px-3 py-3 font-bold border border-blue-400 text-right">Base IVA</th>
                <th className="px-3 py-3 font-bold border border-blue-400 text-right">IVA</th>
                <th className="px-3 py-3 font-bold border border-blue-400 text-right">Total Gastos</th>
                <th className="px-3 py-3 font-bold border border-blue-400 text-right">Costo Total</th>
                <th className="px-3 py-3 font-bold border border-blue-400 text-right">Costo Unitario</th>
                <th className="px-3 py-3 font-bold border border-blue-400 text-right">Gast %</th>
                <th className="px-3 py-3 font-bold border border-blue-400 text-right bg-[#e5893c]">% Margen</th>
                <th className="px-3 py-3 font-bold border border-blue-400 text-right">Precio Venta Calculado</th>
                <th className="px-3 py-3 font-bold border border-blue-400 text-right bg-[#e5893c]">PVP Mercado USD</th>
                <th className="px-3 py-3 font-bold border border-blue-400 text-right">Venta Total Sin IVA</th>
                <th className="px-3 py-3 font-bold border border-blue-400 text-right">Utilidad Importación</th>
                <th className="px-3 py-3 font-bold border border-blue-400 text-right">Proyección Ventas</th>
                <th className="px-3 py-3 font-bold border border-blue-400 text-right">Proyección Utilidad</th>
                <th className="px-3 py-3 font-bold border border-blue-400 text-right">Venta c/ IVA Mayorista</th>
                <th className="px-3 py-3 font-bold border border-blue-400 text-right bg-[#e5893c]">Incremento PVP</th>
                <th className="px-3 py-3 font-bold border border-blue-400 text-right">Venta c/ IVA Minorista</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={29} className="px-6 py-10 text-center text-slate-500">No hay detalles para liquidar.</td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <tr key={`${row.secuencial}-${index}`} className="odd:bg-white even:bg-slate-50/50 hover:bg-blue-50/40">
                    <td className="px-3 py-2 border border-slate-200">{row.arancel}</td>
                    <td className="px-3 py-2 border border-slate-200">{row.codigo}</td>
                    <td className="px-3 py-2 border border-slate-200">{row.descripcion}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right">{format2(row.cantidad)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right">{format6(row.precioUnitario)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right text-blue-700 font-semibold">{format2(row.fob)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right">{format2(row.pesoPct)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right">{format2(row.distribucionGastos)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right">{format2(row.seguro)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right">{format2(row.flete)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right">{format2(row.valorCif)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right">{format2(row.fodinfa)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right">{format2(row.adValorem)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right">{format2(row.baseIva)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right">{format2(row.iva)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right font-semibold">{format2(row.totalGastos)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right font-semibold text-slate-800">{format2(row.costoTotal)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right text-blue-700">{format6(row.costoUnitario)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right text-red-600">{format2(row.gastoPct)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right bg-[#fde0c4]">{format2(row.margenGanancia)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right">{format6(row.precioVentaCalculado)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right bg-[#fde0c4]">{format6(row.pvpMercado)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right">{format2(row.ventaTotalSinIva)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right">{format2(row.utilidadImportacion)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right bg-[#fff176]">{format2(row.proyeccionVentas)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right bg-[#ffd54f]">{format2(row.proyeccionUtilidad)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right">{format6(row.ventaConIvaMayorista)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right bg-[#fde0c4]">{format2(row.incrementoPvp)}</td>
                    <td className="px-3 py-2 border border-slate-200 text-right">{format6(row.ventaConIvaMinorista)}</td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="bg-slate-100 font-bold text-slate-800">
              <tr>
                <td colSpan={3} className="px-3 py-3 border border-slate-300 text-right">Totales</td>
                <td className="px-3 py-3 border border-slate-300 text-right">{format2(totals.cantidad)}</td>
                <td className="px-3 py-3 border border-slate-300"></td>
                <td className="px-3 py-3 border border-slate-300 text-right text-blue-700">{format2(totals.fob)}</td>
                <td className="px-3 py-3 border border-slate-300"></td>
                <td className="px-3 py-3 border border-slate-300 text-right">{format2(totals.distribucionGastos)}</td>
                <td className="px-3 py-3 border border-slate-300 text-right">{format2(totals.seguro)}</td>
                <td className="px-3 py-3 border border-slate-300 text-right">{format2(totals.flete)}</td>
                <td className="px-3 py-3 border border-slate-300 text-right">{format2(totals.valorCif)}</td>
                <td className="px-3 py-3 border border-slate-300 text-right">{format2(totals.fodinfa)}</td>
                <td className="px-3 py-3 border border-slate-300 text-right">{format2(totals.adValorem)}</td>
                <td className="px-3 py-3 border border-slate-300 text-right">{format2(totals.baseIva)}</td>
                <td className="px-3 py-3 border border-slate-300 text-right">{format2(totals.iva)}</td>
                <td className="px-3 py-3 border border-slate-300 text-right">{format2(totals.totalGastos)}</td>
                <td className="px-3 py-3 border border-slate-300 text-right">{format2(totals.costoTotal)}</td>
                <td className="px-3 py-3 border border-slate-300"></td>
                <td className="px-3 py-3 border border-slate-300"></td>
                <td className="px-3 py-3 border border-slate-300 bg-[#fde0c4]"></td>
                <td className="px-3 py-3 border border-slate-300"></td>
                <td className="px-3 py-3 border border-slate-300 bg-[#fde0c4]"></td>
                <td className="px-3 py-3 border border-slate-300 text-right">{format2(totals.ventaTotalSinIva)}</td>
                <td className="px-3 py-3 border border-slate-300 text-right">{format2(totals.utilidadImportacion)}</td>
                <td className="px-3 py-3 border border-slate-300 text-right bg-[#fff176]">{format2(totals.proyeccionVentas)}</td>
                <td className="px-3 py-3 border border-slate-300 text-right bg-[#ffd54f]">{format2(totals.proyeccionUtilidad)}</td>
                <td className="px-3 py-3 border border-slate-300"></td>
                <td className="px-3 py-3 border border-slate-300 bg-[#fde0c4]"></td>
                <td className="px-3 py-3 border border-slate-300"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
