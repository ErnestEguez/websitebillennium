import React, { useState, useEffect } from 'react';
import { Plus, Printer, Search, ArrowLeft, Save, Trash2, Edit2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function ImportList() {
  const [view, setView] = useState<'list' | 'form'>('list');
  const [imports, setImports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');

  // Form Catalogs
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [productos, setProductos] = useState<any[]>([]);

  // Form State
  const [header, setHeader] = useState<any>({
    numero_importacion: '',
    id_proveedor: '',
    fecha_importacion: new Date().toISOString().split('T')[0],
    estado: 'BORRADOR',
    tasa_iva: 15,
    valor_seguro: 0,
    valor_flete: 0
  });
  const [details, setDetails] = useState<any[]>([]);
  const [editImportId, setEditImportId] = useState<string | null>(null);

  useEffect(() => {
    if (view === 'list') {
      fetchImports();
    } else {
      fetchFormData();
    }
  }, [view, companyId]);

  const calculatedFobTotal = Math.round(
    details.reduce((sum, row) => sum + (Number(row.cantidad) || 0) * (Number(row.precio_unitario) || 0), 0) * 100
  ) / 100;

  const fetchImports = async () => {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email;
      
      let currentCompanyId = null;
      if (email) {
        const { data: userDb } = await supabase.from('usuarios').select('id_empresa').eq('email', email).maybeSingle();
        currentCompanyId = userDb?.id_empresa || null;
      }
      setCompanyId(currentCompanyId);

      if (!currentCompanyId) {
        setImports([]);
        setCompanyName('');
        return;
      }

      const { data: empresaData } = await supabase.from('empresas').select('nombre').eq('id', currentCompanyId).maybeSingle();
      setCompanyName(empresaData?.nombre || '');

      // Traer cabeceras. (Evitamos JOIN con proveedores por si el foreign key falla en cache local, 
      // mejor lo traemos seguro en dos pasos)
      const { data: importsData, error: importsError } = await supabase
        .from('importaciones')
        .select('*')
        .eq('id_empresa', currentCompanyId)
        .order('fecha_creacion', { ascending: false });
      
      if (importsError) throw importsError;

      const { data: provData } = await supabase.from('proveedores').select('id, nombre_empresa').eq('id_empresa', currentCompanyId);

      const merged = (importsData || []).map(imp => {
        const prov = (provData || []).find(p => p.id === imp.id_proveedor);
        return {
          ...imp,
          nombre_proveedor: prov ? prov.nombre_empresa : 'Desconocido'
        };
      });

      setImports(merged);
    } catch (error: any) {
      console.error(error);
      alert('Error cargando importaciones: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchFormData = async () => {
    try {
      if (!companyId) return;
      
      // Catálogos
      const { data: provData } = await supabase.from('proveedores').select('*').eq('id_empresa', companyId).eq('estado', 'ACTIVO');
      const { data: prodData } = await supabase.from('productos').select('*').eq('id_empresa', companyId).eq('estado', 'ACTIVO');
      const { data: aranData } = await supabase.from('aranceles').select('*');

      setProveedores(provData || []);
      
      // Unir producto con arancel internamente para evitar error de relationship
      const mergedProducts = (prodData || []).map(prod => {
        const arancel = (aranData || []).find(a => a.id === prod.partida_senae);
        return {
          ...prod,
          arancel_codigo: arancel ? arancel.partida : 'Sin Partida',
          arancel_desc: arancel ? arancel.descripcion : 'N/A'
        };
      });
      
      setProductos(mergedProducts);
    } catch (error: any) {
      console.error(error);
      alert('Error cargando catálogos: ' + error.message);
    }
  };

  const handleEdit = async (imp: any) => {
    try {
      setLoading(true);
      setHeader({
        numero_importacion: imp.numero_importacion || '',
        id_proveedor: imp.id_proveedor || '',
        fecha_importacion: imp.fecha_importacion || new Date().toISOString().split('T')[0],
        estado: imp.estado || 'BORRADOR',
        tasa_iva: imp.tasa_iva || 15,
        valor_seguro: imp.seguro || imp.valor_seguro || 0,
        valor_flete: imp.flete || 0
      });
      setEditImportId(imp.id);
      
      const { data: detData, error } = await supabase
        .from('importacion_detalle')
        .select('*')
        .eq('id_importacion', imp.id)
        .order('secuencial', { ascending: true });
        
      if (error) throw error;
      
      setDetails(detData || []);
      setView('form');
    } catch (error: any) {
      alert('Error cargando detalles: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddDetailRow = () => {
    setDetails([
      ...details,
      {
        secuencial: details.length + 1,
        id_producto: '',
        cantidad: 1,
        precio_unitario: 0,
        tasa_margen_ganancia: 0,
        pvp_mercado: 0,
        tasa_incremento_pvp: 0
      }
    ]);
  };

  const handleDetailChange = (index: number, field: string, value: any) => {
    const newDetails = [...details];
    newDetails[index] = { ...newDetails[index], [field]: value };
    setDetails(newDetails);
  };

  const handleRemoveDetail = (index: number) => {
    const newDetails = details.filter((_, i) => i !== index);
    // Renumerar secuencial
    const renumbered = newDetails.map((d, i) => ({ ...d, secuencial: i + 1 }));
    setDetails(renumbered);
  };

  const handlePrint = async (imp: any) => {
    try {
      setLoading(true);

      const { data: detailRows, error: detailError } = await supabase
        .from('importacion_detalle')
        .select('*')
        .eq('id_importacion', imp.id)
        .order('secuencial', { ascending: true });
      if (detailError) throw detailError;

      const { data: prodData, error: prodError } = await supabase
        .from('productos')
        .select('*')
        .eq('id_empresa', imp.id_empresa);
      if (prodError) throw prodError;

      const { data: aranData, error: aranError } = await supabase.from('aranceles').select('*');
      if (aranError) throw aranError;

      const detailHtml = (detailRows || []).map((row: any) => {
        const producto = (prodData || []).find((p: any) => p.id === row.id_producto);
        const arancel = (aranData || []).find((a: any) => a.id === producto?.partida_senae);
        const lineaTotal = ((Number(row.cantidad) || 0) * (Number(row.precio_unitario) || 0)).toFixed(2);

        return `
          <tr>
            <td>${row.secuencial || ''}</td>
            <td>${producto?.codigo || ''}</td>
            <td>${producto?.descripcion || ''}</td>
            <td>${arancel?.partida || ''}</td>
            <td>${arancel?.descripcion || ''}</td>
            <td style="text-align:right;">${Number(row.cantidad || 0).toFixed(2)}</td>
            <td style="text-align:right;">${Number(row.precio_unitario || 0).toFixed(6)}</td>
            <td style="text-align:right;">${Number(row.tasa_margen_ganancia || 0).toFixed(2)}%</td>
            <td style="text-align:right;">${Number(row.pvp_mercado || 0).toFixed(2)}</td>
            <td style="text-align:right;">${Number(row.tasa_incremento_pvp || 0).toFixed(2)}%</td>
            <td style="text-align:right;">${lineaTotal}</td>
          </tr>
        `;
      }).join('');

      const printWindow = window.open('', '_blank', 'width=1200,height=800');
      if (!printWindow) throw new Error('El navegador bloqueó la ventana de impresión.');

      printWindow.document.write(`
        <html>
          <head>
            <title>Importación ${imp.numero_importacion}</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
              h1, h2, h3 { margin: 0; }
              .header { margin-bottom: 24px; }
              .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: 16px; }
              .meta div { padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 6px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
              th, td { border: 1px solid #d1d5db; padding: 8px; vertical-align: top; }
              th { background: #f3f4f6; text-align: left; }
              .totals { margin-top: 20px; display: flex; justify-content: flex-end; }
              .totals-box { width: 320px; border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; }
              .totals-row { display: flex; justify-content: space-between; padding: 6px 0; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>${companyName || 'Empresa'}</h1>
              <h2>Reporte de Importación</h2>
              <div class="meta">
                <div><strong>Número:</strong> ${imp.numero_importacion || ''}</div>
                <div><strong>Proveedor:</strong> ${imp.nombre_proveedor || ''}</div>
                <div><strong>Fecha:</strong> ${imp.fecha_importacion || ''}</div>
                <div><strong>Estado:</strong> ${imp.estado || ''}</div>
                <div><strong>Tasa IVA:</strong> ${Number(imp.tasa_iva || 0).toFixed(2)}%</div>
                <div><strong>Seguro:</strong> $ ${Number(imp.seguro || imp.valor_seguro || 0).toFixed(2)}</div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Código</th>
                  <th>Producto</th>
                  <th>Cód. Arancel</th>
                  <th>Descripción Arancel</th>
                  <th>Cantidad</th>
                  <th>Precio Unitario</th>
                  <th>% Margen</th>
                  <th>PVP Mercado</th>
                  <th>% Inc. PVP</th>
                  <th>Total Línea</th>
                </tr>
              </thead>
              <tbody>${detailHtml}</tbody>
            </table>

            <div class="totals">
              <div class="totals-box">
                <div class="totals-row"><strong>FOB Total</strong><strong>$ ${Number(imp.fob_total || 0).toFixed(2)}</strong></div>
                <div class="totals-row"><span>Valor Seguro</span><span>$ ${Number(imp.seguro || imp.valor_seguro || 0).toFixed(2)}</span></div>
                <div class="totals-row"><span>Tasa IVA</span><span>${Number(imp.tasa_iva || 0).toFixed(2)}%</span></div>
              </div>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    } catch (error: any) {
      console.error(error);
      alert('Error al imprimir: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (!companyId) throw new Error('No se detectó la empresa del usuario.');
      if (!header.id_proveedor) throw new Error('Debe seleccionar un proveedor.');
      if (details.length === 0) throw new Error('Debe agregar al menos un producto a la importación.');

      // Validar detalles
      for (const d of details) {
        if (!d.id_producto) throw new Error('Todas las líneas deben tener un producto seleccionado.');
      }

      setLoading(true);

      const cabeceraData = {
        id_empresa: companyId,
        numero_importacion: header.numero_importacion,
        id_proveedor: header.id_proveedor,
        fecha_importacion: header.fecha_importacion,
        estado: header.estado,
        tasa_iva: header.tasa_iva,
        seguro: header.valor_seguro,
        flete: header.valor_flete,
        fob_total: calculatedFobTotal
      };

      let importId = editImportId;

      if (editImportId) {
        // UPDATE
        const { error: headerError } = await supabase.from('importaciones').update(cabeceraData).eq('id', editImportId);
        if (headerError) throw headerError;
        
        // Delete old details
        const { error: delError } = await supabase.from('importacion_detalle').delete().eq('id_importacion', editImportId);
        if (delError) throw delError;
      } else {
        // INSERT
        const { data: newImport, error: headerError } = await supabase.from('importaciones').insert([cabeceraData]).select().single();
        if (headerError) throw headerError;
        importId = newImport.id;
      }

      // Insertar Detalles
      const detallesToInsert = details.map(d => ({
        id_importacion: importId,
        secuencial: d.secuencial,
        id_producto: d.id_producto,
        cantidad: d.cantidad,
        precio_unitario: d.precio_unitario,
        tasa_margen_ganancia: d.tasa_margen_ganancia,
        pvp_mercado: d.pvp_mercado,
        tasa_incremento_pvp: d.tasa_incremento_pvp
      }));

      const { error: detailError } = await supabase.from('importacion_detalle').insert(detallesToInsert);
      if (detailError) throw detailError;

      alert(editImportId ? 'Importación actualizada exitosamente.' : 'Importación guardada exitosamente.');
      
      // Limpiar y volver a lista
      setHeader({
        numero_importacion: '', id_proveedor: '', fecha_importacion: new Date().toISOString().split('T')[0],
        estado: 'BORRADOR', tasa_iva: 15, valor_seguro: 0, valor_flete: 0
      });
      setDetails([]);
      setEditImportId(null);
      setView('list');

    } catch (error: any) {
      console.error(error);
      alert('Error al guardar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (view === 'form') {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => { setView('list'); setEditImportId(null); }} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
              <ArrowLeft size={20} />
            </button>
            <h2 className="text-2xl font-bold text-gray-800">{editImportId ? 'Editar Importación' : 'Nueva Importación'}</h2>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* CABECERA */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-700 mb-4 border-b pb-2">Datos de Cabecera</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Número Importación</label>
                <input 
                  type="text" required
                  value={header.numero_importacion} onChange={e => setHeader({...header, numero_importacion: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="Ej: IMP-2024-001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor</label>
                <select 
                  required
                  value={header.id_proveedor} onChange={e => setHeader({...header, id_proveedor: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="">-- Seleccionar --</option>
                  {proveedores.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre_empresa}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                <input 
                  type="date" required
                  value={header.fecha_importacion} onChange={e => setHeader({...header, fecha_importacion: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                <select 
                  value={header.estado} onChange={e => setHeader({...header, estado: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="BORRADOR">Borrador</option>
                  <option value="TRANSITO">En Tránsito</option>
                  <option value="LIQUIDADA">Liquidada</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tasa IVA (%)</label>
                <input 
                  type="number" step="0.01" required
                  value={header.tasa_iva} onChange={e => setHeader({...header, tasa_iva: parseFloat(e.target.value)})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor Seguro ($)</label>
                <input 
                  type="number" step="0.01" required
                  value={header.valor_seguro} onChange={e => setHeader({...header, valor_seguro: parseFloat(e.target.value)})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor Flete ($)</label>
                <input 
                  type="number" step="0.01" required
                  value={header.valor_flete} onChange={e => setHeader({...header, valor_flete: parseFloat(e.target.value)})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* DETALLES */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-700">Detalle de Productos</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[1000px]">
                <thead className="bg-white border-b">
                  <tr>
                    <th className="p-3 font-semibold text-gray-600 w-12">#</th>
                    <th className="p-3 font-semibold text-gray-600 w-48">Producto</th>
                    <th className="p-3 font-semibold text-gray-600">Partida Arancelaria SENAE</th>
                    <th className="p-3 font-semibold text-gray-600 w-24">Cant.</th>
                    <th className="p-3 font-semibold text-gray-600 w-28">Precio Unit.</th>
                    <th className="p-3 font-semibold text-gray-600 w-28">% Margen</th>
                    <th className="p-3 font-semibold text-gray-600 w-28">PVP Mer.</th>
                    <th className="p-3 font-semibold text-gray-600 w-28">% Inc PVP</th>
                    <th className="p-3 font-semibold text-gray-600 w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {details.length === 0 ? (
                    <tr><td colSpan={9} className="p-6 text-center text-gray-500 italic">No hay productos agregados. Haga clic en "Agregar Línea".</td></tr>
                  ) : details.map((row, index) => {
                    // Buscar la info del producto seleccionado para mostrar la partida
                    const selectedProd = productos.find(p => p.id === row.id_producto);
                    return (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="p-3 font-medium text-gray-500">{row.secuencial}</td>
                        <td className="p-3">
                          <select 
                            required
                            value={row.id_producto}
                            onChange={(e) => handleDetailChange(index, 'id_producto', e.target.value)}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500 outline-none"
                          >
                            <option value="">-- Producto --</option>
                            {productos.map(p => (
                              <option key={p.id} value={p.id}>{p.codigo} - {p.descripcion}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-3 text-xs text-gray-500 bg-gray-50">
                          {selectedProd ? (
                            <div className="flex flex-col">
                              <span className="font-semibold text-blue-700">{selectedProd.arancel_codigo}</span>
                              <span className="truncate max-w-[200px]" title={selectedProd.arancel_desc}>{selectedProd.arancel_desc}</span>
                            </div>
                          ) : '-'}
                        </td>
                        <td className="p-3">
                          <input type="number" required min="1" step="1" value={row.cantidad} onChange={e => handleDetailChange(index, 'cantidad', parseFloat(e.target.value))} className="w-full px-2 py-1.5 border border-gray-300 rounded-md outline-none" />
                        </td>
                        <td className="p-3">
                          <input type="number" required min="0" step="0.000001" value={row.precio_unitario} onChange={e => handleDetailChange(index, 'precio_unitario', parseFloat(e.target.value))} className="w-full px-2 py-1.5 border border-gray-300 rounded-md outline-none" />
                        </td>
                        <td className="p-3">
                          <input type="number" required min="0" step="0.01" value={row.tasa_margen_ganancia} onChange={e => handleDetailChange(index, 'tasa_margen_ganancia', parseFloat(e.target.value))} className="w-full px-2 py-1.5 border border-gray-300 rounded-md outline-none" />
                        </td>
                        <td className="p-3">
                          <input type="number" required min="0" step="0.01" value={row.pvp_mercado} onChange={e => handleDetailChange(index, 'pvp_mercado', parseFloat(e.target.value))} className="w-full px-2 py-1.5 border border-gray-300 rounded-md outline-none" />
                        </td>
                        <td className="p-3">
                          <input type="number" required min="0" step="0.01" value={row.tasa_incremento_pvp} onChange={e => handleDetailChange(index, 'tasa_incremento_pvp', parseFloat(e.target.value))} className="w-full px-2 py-1.5 border border-gray-300 rounded-md outline-none" />
                        </td>
                        <td className="p-3 text-center">
                          <button type="button" onClick={() => handleRemoveDetail(index)} className="text-red-400 hover:text-red-600 p-1">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col gap-4 pt-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button type="button" onClick={handleAddDetailRow} className="flex items-center gap-2 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium w-fit">
                <Plus size={16} /> Agregar Línea
              </button>
              <div className="px-4 py-2.5 rounded-lg bg-slate-100 text-slate-700 text-sm font-medium">
                FOB Total: <span className="font-bold">$ {calculatedFobTotal.toFixed(2)}</span>
              </div>
            </div>
            <button disabled={loading} type="submit" className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 w-fit">
              <Save size={18} /> {loading ? 'Guardando...' : 'Guardar Importación'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // LIST VIEW
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="flex justify-between items-center">
        <div className="relative w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input 
            type="text" 
            placeholder="Buscar importación..." 
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={() => {
            setHeader({
              numero_importacion: '', id_proveedor: '', fecha_importacion: new Date().toISOString().split('T')[0],
              estado: 'BORRADOR', tasa_iva: 15, valor_seguro: 0, valor_flete: 0
            });
            setDetails([]);
            setEditImportId(null);
            setView('form');
          }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm">
            <Plus size={18} /> Nueva Importación
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full min-w-[920px] text-left">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-6 py-4 font-bold text-gray-600">Número</th>
              <th className="px-6 py-4 font-bold text-gray-600">Proveedor</th>
              <th className="px-6 py-4 font-bold text-gray-600">Fecha</th>
              <th className="px-6 py-4 font-bold text-gray-600">FOB Total</th>
              <th className="px-6 py-4 font-bold text-gray-600">Estado</th>
              <th className="px-6 py-4 font-bold text-gray-600 sticky right-0 bg-gray-50">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {imports.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No hay importaciones registradas.</td></tr>
            ) : imports.map((imp) => (
              <tr key={imp.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 font-medium text-blue-600">{imp.numero_importacion}</td>
                <td className="px-6 py-4 text-gray-700">{imp.nombre_proveedor}</td>
                <td className="px-6 py-4 text-gray-600">{imp.fecha_importacion}</td>
                <td className="px-6 py-4 text-gray-700 font-semibold">$ {Number(imp.fob_total || 0).toFixed(2)}</td>
                <td className="px-6 py-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    imp.estado === 'LIQUIDADA' ? 'bg-green-100 text-green-700' : 
                    imp.estado === 'TRANSITO' ? 'bg-blue-100 text-blue-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {imp.estado}
                  </span>
                </td>
                <td className="px-6 py-4 flex gap-2 sticky right-0 bg-white">
                   <button onClick={() => handleEdit(imp)} className="p-2 text-gray-400 hover:text-blue-600 transition-colors" title="Editar"><Edit2 size={18} /></button>
                   <button onClick={() => handlePrint(imp)} className="p-2 text-gray-400 hover:text-slate-700 transition-colors" title="Imprimir"><Printer size={18} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
