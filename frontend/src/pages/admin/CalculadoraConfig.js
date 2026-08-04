import { useState, useEffect } from 'react';
import axios from 'axios';
import { Sliders, Loader2, RefreshCw, Plus, Trash2, Save, Layers, Settings2 } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Switch } from '../../components/ui/switch';
import AdminLayout from '../../components/AdminLayout';
import { toast } from 'sonner';

const API = '/api';

const PARAM_LABELS = {
  clientes: 'Clientes', articulos: 'Artículos', facturas: 'Facturas/mes', compras: 'Compras/mes', empleados: 'Empleados',
};

export const AdminCalculadoraConfig = () => {
  const [modulos, setModulos] = useState([]);
  const [tramos, setTramos] = useState([]);
  const [configGlobal, setConfigGlobal] = useState({ recargo_usuario_pct: 0.20, dtos_multiempresa: [0, 0.15, 0.20, 0.25] });
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [nuevoModulo, setNuevoModulo] = useState({ nombre: '', precio: '', orden: '' });
  const [creando, setCreando] = useState(false);

  const token = () => localStorage.getItem('token');
  const auth = () => ({ headers: { Authorization: `Bearer ${token()}` } });

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [modRes, tramosRes, cfgRes] = await Promise.all([
        axios.get(`${API}/admin/calculadora/modulos`, auth()),
        axios.get(`${API}/admin/calculadora/tramos`, auth()),
        axios.get(`${API}/calculadora/config`),
      ]);
      setModulos(modRes.data);
      setTramos(tramosRes.data);
      setConfigGlobal({ recargo_usuario_pct: cfgRes.data.recargo_usuario_pct, dtos_multiempresa: cfgRes.data.dtos_multiempresa });
    } catch {
      toast.error('Error cargando configuración de la calculadora');
    } finally {
      setLoading(false);
    }
  };

  const actualizarModuloLocal = (id, campo, valor) => {
    setModulos(prev => prev.map(m => m.id === id ? { ...m, [campo]: valor } : m));
  };

  const guardarModulo = async (m) => {
    setSavingId(m.id);
    try {
      await axios.put(`${API}/admin/calculadora/modulos/${m.id}`, {
        nombre: m.nombre, precio: parseFloat(m.precio) || 0, orden: parseInt(m.orden) || 0, activo: m.activo,
      }, auth());
      toast.success(`${m.nombre} actualizado`);
    } catch {
      toast.error('Error guardando módulo');
    } finally {
      setSavingId(null);
    }
  };

  const eliminarModulo = async (id) => {
    if (!window.confirm('¿Eliminar este módulo de la calculadora?')) return;
    try {
      await axios.delete(`${API}/admin/calculadora/modulos/${id}`, auth());
      setModulos(prev => prev.filter(m => m.id !== id));
      toast.success('Módulo eliminado');
    } catch {
      toast.error('Error eliminando módulo');
    }
  };

  const crearModulo = async () => {
    if (!nuevoModulo.nombre.trim()) { toast.warning('Ingresa el nombre del módulo'); return; }
    setCreando(true);
    try {
      const { data } = await axios.post(`${API}/admin/calculadora/modulos`, {
        nombre: nuevoModulo.nombre, precio: parseFloat(nuevoModulo.precio) || 0, orden: parseInt(nuevoModulo.orden) || modulos.length + 1,
      }, auth());
      setModulos(prev => [...prev, data]);
      setNuevoModulo({ nombre: '', precio: '', orden: '' });
      toast.success('Módulo agregado');
    } catch {
      toast.error('Error creando módulo');
    } finally {
      setCreando(false);
    }
  };

  const actualizarTramoLocal = (id, campo, valor) => {
    setTramos(prev => prev.map(t => t.id === id ? { ...t, [campo]: valor } : t));
  };

  const guardarTramo = async (t) => {
    setSavingId(t.id);
    try {
      await axios.put(`${API}/admin/calculadora/tramos/${t.id}`, {
        desde: parseInt(t.desde) || 0,
        hasta: t.hasta === '' || t.hasta === null ? null : parseInt(t.hasta),
        recargo: parseFloat(t.recargo) || 0,
      }, auth());
      toast.success('Tramo actualizado');
    } catch {
      toast.error('Error guardando tramo');
    } finally {
      setSavingId(null);
    }
  };

  const guardarConfigGlobal = async () => {
    setSavingConfig(true);
    try {
      await axios.put(`${API}/admin/calculadora/config`, configGlobal, auth());
      toast.success('Configuración global actualizada');
    } catch {
      toast.error('Error guardando configuración');
    } finally {
      setSavingConfig(false);
    }
  };

  const tramosPorParametro = Object.keys(PARAM_LABELS).map(p => ({
    parametro: p, filas: tramos.filter(t => t.parametro === p).sort((a, b) => a.orden - b.orden),
  }));

  if (loading) {
    return <AdminLayout><div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div></AdminLayout>;
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Configuración de la Calculadora</h1>
              <p className="text-slate-500 text-sm">Precios de módulos y tramos de volumen que usa el cotizador público.</p>
            </div>
          </div>
          <button onClick={fetchAll} className="p-2 text-slate-400 hover:text-slate-700 transition-colors" title="Recargar">
            <RefreshCw className="h-5 w-5" />
          </button>
        </div>

        {/* Config global */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-slate-400" />
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Parámetros globales</p>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Recargo por usuario adicional (%)</label>
                <Input type="number" min={0} max={100} step="1"
                  value={Math.round(configGlobal.recargo_usuario_pct * 100)}
                  onChange={e => setConfigGlobal(c => ({ ...c, recargo_usuario_pct: (parseFloat(e.target.value) || 0) / 100 }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Descuento automático por empresa adicional (%)</label>
                <div className="flex gap-2">
                  {configGlobal.dtos_multiempresa.map((v, i) => (
                    <Input key={i} type="number" min={0} max={100} step="1" className="text-center"
                      value={Math.round(v * 100)}
                      onChange={e => setConfigGlobal(c => {
                        const arr = [...c.dtos_multiempresa]; arr[i] = (parseFloat(e.target.value) || 0) / 100;
                        return { ...c, dtos_multiempresa: arr };
                      })} />
                  ))}
                </div>
                <p className="text-xs text-slate-400">1ra empresa, 2da, 3ra, 4ta+ en la misma cotización</p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button size="sm" onClick={guardarConfigGlobal} disabled={savingConfig} className="bg-blue-600 hover:bg-blue-700 gap-1.5">
                {savingConfig ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Módulos */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-slate-400" />
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Módulos y precio mensual</p>
            </div>
            <div className="space-y-2">
              {modulos.sort((a, b) => a.orden - b.orden).map(m => (
                <div key={m.id} className="grid grid-cols-12 gap-2 items-center border border-slate-100 rounded-lg p-2">
                  <Input className="col-span-4" value={m.nombre} onChange={e => actualizarModuloLocal(m.id, 'nombre', e.target.value)} />
                  <div className="col-span-2 flex items-center gap-1">
                    <span className="text-slate-400 text-sm">$</span>
                    <Input type="number" step="0.01" value={m.precio} onChange={e => actualizarModuloLocal(m.id, 'precio', e.target.value)} />
                  </div>
                  <Input className="col-span-2" type="number" value={m.orden} onChange={e => actualizarModuloLocal(m.id, 'orden', e.target.value)}
                    title="Orden de visualización" />
                  <div className="col-span-2 flex items-center justify-center gap-1.5">
                    <Switch checked={m.activo} onCheckedChange={v => actualizarModuloLocal(m.id, 'activo', v)} />
                    <span className="text-xs text-slate-400">{m.activo ? 'Activo' : 'Oculto'}</span>
                  </div>
                  <div className="col-span-2 flex justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => guardarModulo(m)} disabled={savingId === m.id}>
                      {savingId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => eliminarModulo(m.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-12 gap-2 items-center pt-2 border-t border-slate-100">
              <Input className="col-span-4" placeholder="Nombre módulo nuevo" value={nuevoModulo.nombre}
                onChange={e => setNuevoModulo(n => ({ ...n, nombre: e.target.value }))} />
              <Input className="col-span-2" type="number" step="0.01" placeholder="Precio" value={nuevoModulo.precio}
                onChange={e => setNuevoModulo(n => ({ ...n, precio: e.target.value }))} />
              <Input className="col-span-2" type="number" placeholder="Orden" value={nuevoModulo.orden}
                onChange={e => setNuevoModulo(n => ({ ...n, orden: e.target.value }))} />
              <div className="col-span-4 flex justify-end">
                <Button size="sm" onClick={crearModulo} disabled={creando} className="bg-blue-600 hover:bg-blue-700 gap-1.5">
                  {creando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Agregar módulo
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tramos por parámetro */}
        {tramosPorParametro.map(({ parametro, filas }) => (
          <Card key={parametro}>
            <CardContent className="p-6 space-y-3">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tramos — {PARAM_LABELS[parametro]}</p>
              <div className="space-y-2">
                {filas.map(t => (
                  <div key={t.id} className="grid grid-cols-12 gap-2 items-center border border-slate-100 rounded-lg p-2">
                    <div className="col-span-3 flex items-center gap-1">
                      <span className="text-xs text-slate-400">Desde</span>
                      <Input type="number" value={t.desde} onChange={e => actualizarTramoLocal(t.id, 'desde', e.target.value)} />
                    </div>
                    <div className="col-span-3 flex items-center gap-1">
                      <span className="text-xs text-slate-400">Hasta</span>
                      <Input type="number" value={t.hasta ?? ''} placeholder={t.es_contactar ? 'Sin tope' : ''}
                        disabled={t.es_contactar}
                        onChange={e => actualizarTramoLocal(t.id, 'hasta', e.target.value)} />
                    </div>
                    <div className="col-span-3 flex items-center gap-1">
                      <span className="text-xs text-slate-400">Recargo $</span>
                      <Input type="number" step="0.01" value={t.recargo} disabled={t.es_contactar}
                        onChange={e => actualizarTramoLocal(t.id, 'recargo', e.target.value)} />
                    </div>
                    <div className="col-span-2 text-xs text-center">
                      {t.es_contactar ? <span className="text-amber-600 font-medium">Contactar ventas</span> : <span className="text-slate-300">Recargo</span>}
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button size="sm" variant="outline" onClick={() => guardarTramo(t)} disabled={savingId === t.id}>
                        {savingId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AdminLayout>
  );
};

export default AdminCalculadoraConfig;
