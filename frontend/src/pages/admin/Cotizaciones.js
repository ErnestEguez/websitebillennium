import { useState, useEffect, Fragment } from 'react';
import axios from 'axios';
import { FileText, Loader2, RefreshCw, DollarSign, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '../../components/ui/dialog';
import AdminLayout from '../../components/AdminLayout';
import { toast } from 'sonner';

const API = '/api';

const ESTADOS = {
  nueva:       { label: 'Nueva',       color: 'bg-blue-100 text-blue-700' },
  contactado:  { label: 'Contactado',  color: 'bg-amber-100 text-amber-700' },
  cerrado:     { label: 'Cerrado',     color: 'bg-emerald-100 text-emerald-700' },
  descartado:  { label: 'Descartado',  color: 'bg-slate-100 text-slate-500' },
};

export const AdminCotizaciones = () => {
  const [cotizaciones, setCotizaciones] = useState([]);
  const [modulos, setModulos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandido, setExpandido] = useState(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [actual, setActual] = useState(null);
  const [monto, setMonto] = useState('');
  const [estado, setEstado] = useState('nueva');
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const [cotRes, modRes] = await Promise.all([
        axios.get(`${API}/admin/cotizaciones`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`${API}/admin/calculadora/modulos`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setCotizaciones(cotRes.data);
      setModulos(modRes.data);
    } catch {
      toast.error('Error cargando cotizaciones');
    } finally {
      setLoading(false);
    }
  };

  const nombreModulo = (id) => modulos.find(m => m.id === id)?.nombre || id;

  const abrirDialog = (c) => {
    setActual(c);
    setMonto(c.monto_mensual_acordado ?? '');
    setEstado(c.estado);
    setDialogOpen(true);
  };

  const guardar = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      const payload = { estado };
      if (monto !== '' && monto !== null) payload.monto_mensual_acordado = parseFloat(monto);
      const { data } = await axios.put(`${API}/admin/cotizaciones/${actual.id}`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setCotizaciones(prev => prev.map(c => c.id === data.id ? data : c));
      toast.success('Cotización actualizada');
      setDialogOpen(false);
    } catch {
      toast.error('Error guardando cambios');
    } finally {
      setSaving(false);
    }
  };

  const contactaVentas = (c) => (c.empresas || []).some(e => e.contacta_ventas);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Cotizaciones</h1>
              <p className="text-slate-500 text-sm">Leads generados desde el cotizador público. Fija aquí el monto mensual final acordado.</p>
            </div>
          </div>
          <button onClick={fetchAll} className="p-2 text-slate-400 hover:text-slate-700 transition-colors" title="Recargar">
            <RefreshCw className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
        ) : cotizaciones.length === 0 ? (
          <Card><CardContent className="py-16 text-center text-slate-400">
            <FileText className="h-10 w-10 opacity-30 mx-auto mb-3" />
            Aún no hay cotizaciones generadas desde el cotizador.
          </CardContent></Card>
        ) : (
          <Card className="border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3 text-left font-semibold text-slate-600">Cliente</th>
                    <th className="px-5 py-3 text-left font-semibold text-slate-600">Contacto</th>
                    <th className="px-5 py-3 text-left font-semibold text-slate-600">Empresas</th>
                    <th className="px-5 py-3 text-right font-semibold text-slate-600">Precio de lista</th>
                    <th className="px-5 py-3 text-right font-semibold text-slate-600">Monto acordado</th>
                    <th className="px-5 py-3 text-center font-semibold text-slate-600">Estado</th>
                    <th className="px-5 py-3 text-right font-semibold text-slate-600">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {cotizaciones.map(c => (
                    <Fragment key={c.id}>
                      <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-4">
                          <button onClick={() => setExpandido(expandido === c.id ? null : c.id)} className="flex items-center gap-1.5 font-medium text-slate-900">
                            {expandido === c.id ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
                            {c.cliente_nombre}
                          </button>
                          {contactaVentas(c) && (
                            <span className="flex items-center gap-1 text-xs text-amber-600 mt-1"><AlertTriangle className="h-3 w-3" /> Volumen alto — revisar</span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-slate-500 text-xs">
                          {c.telefono && <p>{c.telefono}</p>}
                          {c.email && <p>{c.email}</p>}
                        </td>
                        <td className="px-5 py-4 text-slate-600">{(c.empresas || []).length}</td>
                        <td className="px-5 py-4 text-right font-mono text-slate-700">${Number(c.total).toFixed(2)}</td>
                        <td className="px-5 py-4 text-right font-mono font-semibold text-slate-900">
                          {c.monto_mensual_acordado != null ? `$${Number(c.monto_mensual_acordado).toFixed(2)}` : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-5 py-4 text-center">
                          <Badge className={ESTADOS[c.estado]?.color || 'bg-slate-100 text-slate-500'}>{ESTADOS[c.estado]?.label || c.estado}</Badge>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Button size="sm" onClick={() => abrirDialog(c)} className="bg-blue-600 hover:bg-blue-700 gap-1.5">
                            <DollarSign className="h-3.5 w-3.5" /> Fijar monto
                          </Button>
                        </td>
                      </tr>
                      {expandido === c.id && (
                        <tr className="bg-slate-50/60 border-b border-slate-100">
                          <td colSpan={7} className="px-5 py-4">
                            <div className="space-y-3">
                              {c.observaciones && <p className="text-xs text-slate-500"><strong>Observaciones:</strong> {c.observaciones}</p>}
                              {(c.empresas || []).map((e, i) => (
                                <div key={i} className="bg-white border border-slate-200 rounded-lg p-3">
                                  <div className="flex items-center justify-between mb-1">
                                    <p className="font-semibold text-slate-800 text-sm">{e.nombre}</p>
                                    <p className="font-mono text-sm text-slate-700">${Number(e.total_empresa).toFixed(2)}</p>
                                  </div>
                                  <p className="text-xs text-slate-500 mb-1">
                                    Módulos: {(e.modulos || []).map(nombreModulo).join(', ') || 'Ninguno'} · {e.usuarios} usuario(s)
                                    {e.dto_multiempresa_pct > 0 && ` · ${(e.dto_multiempresa_pct * 100).toFixed(0)}% dto. multi-empresa`}
                                  </p>
                                  {(e.recargos_tamano || []).some(r => r.recargo > 0 || r.es_contactar) && (
                                    <p className="text-xs text-slate-400">
                                      {(e.recargos_tamano || []).filter(r => r.recargo > 0 || r.es_contactar).map(r =>
                                        `${r.parametro}: ${r.cantidad}${r.es_contactar ? ' (volumen alto)' : ` (+$${Number(r.recargo).toFixed(2)})`}`
                                      ).join(' · ')}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Fijar monto acordado — {actual?.cliente_nombre}</DialogTitle>
            <DialogDescription>
              Precio de lista: ${actual ? Number(actual.total).toFixed(2) : '0.00'}/mes. Escribe el monto mensual realmente negociado con el cliente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Monto mensual acordado (USD)</label>
              <Input type="number" min={0} step="0.01" value={monto} onChange={e => setMonto(e.target.value)} placeholder="Ej: 65.00" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Estado</label>
              <Select value={estado} onValueChange={setEstado}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ESTADOS).map(([key, v]) => (
                    <SelectItem key={key} value={key}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
              <Button onClick={guardar} disabled={saving} className="bg-blue-600 hover:bg-blue-700 min-w-[110px]">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminCotizaciones;
