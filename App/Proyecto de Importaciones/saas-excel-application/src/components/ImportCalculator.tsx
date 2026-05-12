import { useState } from 'react';
import { Save, Plus, Trash2, Download } from 'lucide-react';

interface Item {
  id: string;
  description: string;
  quantity: number;
  unitFob: number;
  weightFob: number; // Peso para distribución proporcional (en el excel suele ser Peso o Costo FOB)
  advaloremPct: number;
  fodinfaPct: number;
  ivaPct: number;
}

export default function ImportCalculator() {
  const [items, setItems] = useState<Item[]>([
    { id: '1', description: 'LAPTOP DELL XPS', quantity: 10, unitFob: 1200, weightFob: 20, advaloremPct: 5, fodinfaPct: 0.5, ivaPct: 15 },
    { id: '2', description: 'MONITOR LG 27"', quantity: 20, unitFob: 250, weightFob: 10, advaloremPct: 15, fodinfaPct: 0.5, ivaPct: 15 },
  ]);

  const [expenses, setExpenses] = useState({
    freight: 1500,
    insurance: 450,
    others: 200
  });

  const addItem = () => {
    setItems([...items, { 
      id: Math.random().toString(), 
      description: '', 
      quantity: 1, 
      unitFob: 0, 
      weightFob: 1, 
      advaloremPct: 0, 
      fodinfaPct: 0.5, 
      ivaPct: 15 
    }]);
  };

  const removeItem = (id: string) => {
    setItems(items.filter(i => i.id !== id));
  };

  const updateItem = (id: string, field: keyof Item, value: any) => {
    setItems(items.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  // Cálculos
  const totalFob = items.reduce((acc, i) => acc + (i.quantity * i.unitFob), 0);
  const totalWeightFob = items.reduce((acc, i) => acc + (i.quantity * i.weightFob), 0);
  const totalCif = totalFob + expenses.freight + expenses.insurance;

  const calculatedItems = items.map(item => {
    const itemTotalFob = item.quantity * item.unitFob;
    const itemWeightFob = item.quantity * item.weightFob;
    
    // Distribución proporcional de Gastos (Flete + Seguro + Otros) basado en Peso FOB
    const weightPct = itemWeightFob / totalWeightFob;
    const itemFreight = expenses.freight * weightPct;
    const itemInsurance = expenses.insurance * weightPct;
    const itemOthers = expenses.others * weightPct;
    
    const itemCif = itemTotalFob + itemFreight + itemInsurance;
    
    const advalorem = itemCif * (item.advaloremPct / 100);
    const fodinfa = itemCif * (item.fodinfaPct / 100);
    
    // Base imponible IVA = CIF + Advalorem + Fodinfa + ICE (simplificado)
    const baseIva = itemCif + advalorem + fodinfa;
    const iva = baseIva * (item.ivaPct / 100);
    
    const totalCost = itemCif + advalorem + fodinfa + itemOthers; // IVA no suele ser costo si es recuperable
    const unitCost = totalCost / item.quantity;

    return {
      ...item,
      itemCif,
      advalorem,
      fodinfa,
      iva,
      totalCost,
      unitCost
    };
  });

  const grandTotalCost = calculatedItems.reduce((acc, i) => acc + i.totalCost, 0);

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
        <div className="flex gap-4">
           <div>
             <label className="block text-xs font-bold text-gray-500 uppercase">Flete Total</label>
             <input type="number" value={expenses.freight} onChange={e => setExpenses({...expenses, freight: Number(e.target.value)})} className="mt-1 border rounded px-2 py-1 w-32" />
           </div>
           <div>
             <label className="block text-xs font-bold text-gray-500 uppercase">Seguro</label>
             <input type="number" value={expenses.insurance} onChange={e => setExpenses({...expenses, insurance: Number(e.target.value)})} className="mt-1 border rounded px-2 py-1 w-32" />
           </div>
           <div>
             <label className="block text-xs font-bold text-gray-500 uppercase">Otros Gastos</label>
             <input type="number" value={expenses.others} onChange={e => setExpenses({...expenses, others: Number(e.target.value)})} className="mt-1 border rounded px-2 py-1 w-32" />
           </div>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors">
            <Download size={18} /> Exportar CSV
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <Save size={18} /> Guardar Liquidación
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-4 py-3 font-bold text-gray-600">Producto</th>
              <th className="px-4 py-3 font-bold text-gray-600 w-20">Cant.</th>
              <th className="px-4 py-3 font-bold text-gray-600 w-32">FOB Unit.</th>
              <th className="px-4 py-3 font-bold text-gray-600 w-24">CIF</th>
              <th className="px-4 py-3 font-bold text-gray-600 w-24">Adval.</th>
              <th className="px-4 py-3 font-bold text-gray-600 w-24">Fodinfa</th>
              <th className="px-4 py-3 font-bold text-gray-600 w-24">IVA</th>
              <th className="px-4 py-3 font-bold text-gray-600 w-32">Costo Total</th>
              <th className="px-4 py-3 font-bold text-gray-600 w-32">Costo Unit.</th>
              <th className="px-4 py-3 font-bold text-gray-600 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {calculatedItems.map((item) => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-4 py-2">
                  <input 
                    type="text" 
                    value={item.description} 
                    onChange={e => updateItem(item.id, 'description', e.target.value)}
                    className="w-full bg-transparent border-b border-transparent focus:border-blue-300 focus:outline-none"
                    placeholder="Descripción..."
                  />
                </td>
                <td className="px-4 py-2 text-center">
                  <input 
                    type="number" 
                    value={item.quantity} 
                    onChange={e => updateItem(item.id, 'quantity', Number(e.target.value))}
                    className="w-full bg-transparent text-center"
                  />
                </td>
                <td className="px-4 py-2">
                   <input 
                    type="number" 
                    value={item.unitFob} 
                    onChange={e => updateItem(item.id, 'unitFob', Number(e.target.value))}
                    className="w-full bg-transparent"
                  />
                </td>
                <td className="px-4 py-2 font-medium">${item.itemCif.toFixed(2)}</td>
                <td className="px-4 py-2">${item.advalorem.toFixed(2)}</td>
                <td className="px-4 py-2">${item.fodinfa.toFixed(2)}</td>
                <td className="px-4 py-2 text-gray-500">${item.iva.toFixed(2)}</td>
                <td className="px-4 py-2 font-bold text-emerald-600">${item.totalCost.toFixed(2)}</td>
                <td className="px-4 py-2 font-bold text-blue-600">${item.unitCost.toFixed(2)}</td>
                <td className="px-4 py-2 text-right">
                  <button onClick={() => removeItem(item.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16}/></button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 font-bold border-t-2 border-gray-200">
            <tr>
              <td colSpan={2} className="px-4 py-3 text-right">TOTALES</td>
              <td className="px-4 py-3 text-blue-700">${totalFob.toFixed(2)}</td>
              <td className="px-4 py-3">${totalCif.toFixed(2)}</td>
              <td className="px-4 py-3"></td>
              <td className="px-4 py-3"></td>
              <td className="px-4 py-3"></td>
              <td className="px-4 py-3 text-emerald-700">${grandTotalCost.toFixed(2)}</td>
              <td colSpan={2} className="px-4 py-3"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex justify-center">
        <button onClick={addItem} className="flex items-center gap-2 px-6 py-2 border-2 border-dashed border-gray-300 text-gray-500 rounded-lg hover:border-blue-400 hover:text-blue-500 transition-all">
          <Plus size={18} /> Añadir Producto
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-blue-600 text-white p-6 rounded-xl shadow-md">
          <p className="text-blue-100 text-sm font-semibold uppercase tracking-wider">Total FOB de Factura</p>
          <h2 className="text-3xl font-bold mt-1">${totalFob.toLocaleString()}</h2>
        </div>
        <div className="bg-slate-800 text-white p-6 rounded-xl shadow-md">
          <p className="text-slate-400 text-sm font-semibold uppercase tracking-wider">Total Gastos (CFR/CIF)</p>
          <h2 className="text-3xl font-bold mt-1">${(totalCif - totalFob).toLocaleString()}</h2>
        </div>
        <div className="bg-emerald-600 text-white p-6 rounded-xl shadow-md">
          <p className="text-emerald-100 text-sm font-semibold uppercase tracking-wider">Costo Liquidado Total</p>
          <h2 className="text-3xl font-bold mt-1">${grandTotalCost.toLocaleString()}</h2>
        </div>
      </div>
    </div>
  );
}
