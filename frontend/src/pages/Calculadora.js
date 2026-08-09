import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';
import { Calculator, Plus, Trash2, MessageCircle, Mail, RefreshCw, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'sonner';

const API = '/api';

const PARAMETROS = [
  { key: 'clientes',  label: 'Clientes' },
  { key: 'articulos', label: 'Artículos' },
  { key: 'facturas',  label: 'Facturas/mes' },
  { key: 'compras',   label: 'Compras/mes' },
  { key: 'empleados', label: 'Empleados' },
];

const emptyEmpresa = (n) => ({
  id: Date.now() + Math.random(),
  nombre: `Empresa ${n}`,
  mods: {},
  usuarios: 1,
  clientes: 0, articulos: 0, facturas: 0, compras: 0, empleados: 0,
});

function tramoRecargo(tramos, parametro, cantidad) {
  const aplicables = tramos.filter(t => t.parametro === parametro).sort((a, b) => a.orden - b.orden);
  for (const t of aplicables) {
    const pasaDesde = cantidad >= t.desde;
    const pasaHasta = t.hasta === null || t.hasta === undefined || cantidad <= t.hasta;
    if (pasaDesde && pasaHasta) return { recargo: Number(t.recargo), esContactar: !!t.es_contactar };
  }
  return { recargo: 0, esContactar: false };
}

function calcEmpresa(e, config) {
  const precios = Object.fromEntries(config.modulos.map(m => [m.id, Number(m.precio)]));
  const baseModulos = Object.keys(e.mods).filter(k => e.mods[k]).reduce((s, k) => s + (precios[k] || 0), 0);
  const usuarios = Math.max(1, parseInt(e.usuarios) || 1);
  const conUsuarios = baseModulos * (1 + config.recargo_usuario_pct * (usuarios - 1));
  const tamanos = PARAMETROS.map(({ key }) => {
    const cantidad = Math.max(0, parseInt(e[key]) || 0);
    const { recargo, esContactar } = tramoRecargo(config.tramos, key, cantidad);
    return { parametro: key, cantidad, recargo, esContactar };
  });
  const totalRecargoTamano = tamanos.reduce((s, t) => s + t.recargo, 0);
  const contacta = tamanos.some(t => t.esContactar);
  const subtotal = conUsuarios + totalRecargoTamano;
  return { baseModulos, conUsuarios, tamanos, contacta, subtotal, usuarios };
}

function calcResumen(empresas, config) {
  let subtotal = 0, total = 0;
  const detalle = empresas.map((e, i) => {
    const calc = calcEmpresa(e, config);
    const dto = i === 0 ? 0 : config.dtos_multiempresa[Math.min(i, config.dtos_multiempresa.length - 1)];
    const totalEmpresa = calc.subtotal * (1 - dto);
    subtotal += calc.subtotal;
    total += totalEmpresa;
    return { ...calc, nombre: e.nombre, dto, totalEmpresa };
  });
  return { detalle, subtotal, total };
}

export const Calculadora = () => {
  const [config, setConfig] = useState(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [errorConfig, setErrorConfig] = useState(false);

  const [clienteNombre, setClienteNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [observaciones, setObservaciones] = useState('');

  const [empresas, setEmpresas] = useState([emptyEmpresa(1)]);
  const [activaId, setActivaId] = useState(null);

  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [cotizacionId, setCotizacionId] = useState(null);
  const [enviandoCorreo, setEnviandoCorreo] = useState(false);

  useEffect(() => { fetchConfig(); }, []);
  useEffect(() => { if (empresas.length && activaId === null) setActivaId(empresas[0].id); }, [empresas, activaId]);

  const fetchConfig = async () => {
    setLoadingConfig(true);
    setErrorConfig(false);
    try {
      const { data } = await axios.get(`${API}/calculadora/config`);
      setConfig(data);
    } catch (error) {
      console.error('Error cargando calculadora:', error);
      setErrorConfig(true);
    } finally {
      setLoadingConfig(false);
    }
  };

  const resumen = useMemo(() => config ? calcResumen(empresas, config) : null, [empresas, config]);
  const empresaActiva = empresas.find(e => e.id === activaId) || empresas[0];

  const actualizarEmpresa = (id, cambios) => {
    setEmpresas(prev => prev.map(e => e.id === id ? { ...e, ...cambios } : e));
  };

  const toggleModulo = (id, modId) => {
    setEmpresas(prev => prev.map(e => e.id === id ? { ...e, mods: { ...e.mods, [modId]: !e.mods[modId] } } : e));
  };

  const agregarEmpresa = () => {
    const nueva = emptyEmpresa(empresas.length + 1);
    setEmpresas(prev => [...prev, nueva]);
    setActivaId(nueva.id);
  };

  const eliminarEmpresa = (id) => {
    const restantes = empresas.filter(e => e.id !== id);
    setEmpresas(restantes);
    if (activaId === id) setActivaId(restantes[0]?.id ?? null);
  };

  const construirMensaje = () => {
    if (!resumen) return '';
    let msg = `Cotización Corina ERP — Billennium System\nCliente: ${clienteNombre || '(sin nombre)'}\n${'─'.repeat(32)}\n\n`;
    resumen.detalle.forEach(d => {
      const nombresModulos = config.modulos.filter(m => empresas.find(e => e.nombre === d.nombre)?.mods[m.id]).map(m => m.nombre).join(', ') || 'Sin módulos';
      msg += `${d.nombre}:\n  Módulos: ${nombresModulos}\n  Usuarios: ${d.usuarios}\n  Subtotal: $${d.totalEmpresa.toFixed(2)}${d.dto > 0 ? ` (${(d.dto * 100).toFixed(0)}% dto.)` : ''}\n`;
      if (d.contacta) msg += `  ⚠ Volumen alto en algún parámetro — requiere propuesta a medida\n`;
      msg += '\n';
    });
    if (observaciones) msg += `Observaciones:\n${observaciones}\n\n`;
    msg += `${'─'.repeat(32)}\nTOTAL MENSUAL ESTIMADO: $${resumen.total.toFixed(2)}\n(precio de lista, sujeto a confirmación de nuestro equipo)`;
    return msg;
  };

  const enviarCotizacion = async () => {
    if (!clienteNombre.trim()) { toast.warning('Ingresa el nombre del cliente'); return; }
    setEnviando(true);
    try {
      const { data } = await axios.post(`${API}/calculadora/cotizacion`, {
        cliente_nombre: clienteNombre,
        telefono: telefono || null,
        email: email || null,
        observaciones: observaciones || null,
        empresas: empresas.map(e => ({
          nombre: e.nombre,
          modulos: Object.keys(e.mods).filter(k => e.mods[k]),
          usuarios: Math.max(1, parseInt(e.usuarios) || 1),
          clientes: Math.max(0, parseInt(e.clientes) || 0),
          articulos: Math.max(0, parseInt(e.articulos) || 0),
          facturas: Math.max(0, parseInt(e.facturas) || 0),
          compras: Math.max(0, parseInt(e.compras) || 0),
          empleados: Math.max(0, parseInt(e.empleados) || 0),
        })),
      });
      setCotizacionId(data.id);
      setEnviado(true);
      toast.success('¡Cotización enviada! Nuestro equipo te contactará.');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No se pudo enviar la cotización');
    } finally {
      setEnviando(false);
    }
  };

  const enviarWhatsApp = () => {
    let tel = telefono.trim().replace(/\D/g, '');
    if (!tel) { toast.warning('Ingresa el WhatsApp del cliente'); return; }
    if (tel.startsWith('0')) tel = tel.substring(1);
    window.open(`https://wa.me/593${tel}?text=${encodeURIComponent(construirMensaje())}`, '_blank');
  };

  const enviarCorreo = async () => {
    if (!email.trim()) { toast.warning('Ingresa el email del cliente'); return; }
    if (!cotizacionId) { toast.error('Falta guardar la cotización primero'); return; }
    setEnviandoCorreo(true);
    try {
      const { data } = await axios.post(`${API}/calculadora/cotizacion/enviar-email`, { cotizacion_id: cotizacionId, destino: email });
      console.log('[cotizacion email_id]', data.email_id);
      toast.success(`Correo enviado a ${email} (id: ${data.email_id || 'sin id'})`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'No se pudo enviar el correo');
    } finally {
      setEnviandoCorreo(false);
    }
  };

  if (loadingConfig) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    );
  }

  if (errorConfig || !config) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-50 text-center">
        <h2 className="text-2xl font-bold text-slate-900 mb-3">Problema de conexión</h2>
        <p className="text-slate-600 mb-6">No pudimos cargar la calculadora. Intenta de nuevo.</p>
        <Button onClick={fetchConfig} className="bg-blue-600 hover:bg-blue-700">Reintentar</Button>
      </div>
    );
  }

  return (
    <div>
      {/* Hero */}
      <section className="py-16 md:py-20 bg-gradient-to-br from-slate-900 to-blue-900">
        <div className="container mx-auto px-4 md:px-8 max-w-5xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <Badge className="bg-blue-500/20 text-blue-200 border-blue-400/30 mb-4">Cotizador interactivo</Badge>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-3 flex items-center gap-3">
              <Calculator className="h-8 w-8 text-blue-300" /> Arme usted mismo su plan ERP
            </h1>
            <p className="text-slate-300 text-lg max-w-2xl">
              Seleccione los módulos, usuarios y volumen de operación de su empresa para ver un precio mensual estimado.
              El valor final de contrato siempre lo confirma nuestro equipo.
            </p>
          </motion.div>
        </div>
      </section>

      <div className="container mx-auto px-4 md:px-8 max-w-5xl py-10 space-y-6">

        {enviado ? (
          <Card className="border-emerald-200 bg-emerald-50">
            <CardContent className="p-8 text-center space-y-4">
              <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
              <h2 className="text-xl font-bold text-slate-900">¡Listo! Recibimos tu cotización</h2>
              <p className="text-slate-600">Nuestro equipo la revisará y te contactará para confirmar el precio final.</p>

              <div className="max-w-sm mx-auto text-left space-y-3 pt-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">WhatsApp para enviar copia</label>
                  <Input placeholder="Ej: 0991234567" value={telefono} onChange={e => setTelefono(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500">Email para enviar copia</label>
                  <Input type="email" placeholder="correo@cliente.com" value={email} onChange={e => setEmail(e.target.value)} />
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-3 pt-2">
                <Button onClick={enviarWhatsApp} disabled={!telefono.trim()} className="bg-[#25D366] hover:bg-[#1ebe5d] gap-2 disabled:opacity-40">
                  <MessageCircle className="h-4 w-4" /> Enviar copia por WhatsApp
                </Button>
                <Button onClick={enviarCorreo} disabled={!email.trim() || enviandoCorreo} variant="outline" className="gap-2 disabled:opacity-40">
                  {enviandoCorreo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Enviar copia por Email
                </Button>
              </div>
              <Button variant="ghost" onClick={() => { setEnviado(false); }}>Hacer otra cotización</Button>
            </CardContent>
          </Card>
        ) : (
        <>
        {/* Datos del cliente */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Datos de contacto</p>
            <div className="grid md:grid-cols-3 gap-4">
              <Input placeholder="Nombre del cliente o empresa" value={clienteNombre} onChange={e => setClienteNombre(e.target.value)} />
              <Input placeholder="WhatsApp (ej: 0991234567)" value={telefono} onChange={e => setTelefono(e.target.value)} />
              <Input type="email" placeholder="correo@cliente.com" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <Textarea placeholder="Observaciones, condiciones especiales, acuerdos..." value={observaciones} onChange={e => setObservaciones(e.target.value)} rows={3} />
          </CardContent>
        </Card>

        {/* Tabs empresas */}
        <div className="flex flex-wrap gap-2 items-center">
          {empresas.map(e => (
            <button key={e.id} onClick={() => setActivaId(e.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${e.id === activaId ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'}`}>
              {e.nombre}
            </button>
          ))}
          <button onClick={agregarEmpresa} className="px-3 py-2 rounded-lg text-sm border border-dashed border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center gap-1">
            <Plus className="h-3.5 w-3.5" /> Agregar empresa
          </button>
        </div>

        {empresaActiva && (
          <Card>
            <CardContent className="p-6 space-y-5">
              <div className="flex items-center gap-3">
                <Input className="font-semibold text-base flex-1" value={empresaActiva.nombre}
                  onChange={e => actualizarEmpresa(empresaActiva.id, { nombre: e.target.value })} />
                {empresas.length > 1 && (
                  <Button variant="outline" size="sm" className="text-red-600 border-red-200 hover:bg-red-50 gap-1" onClick={() => eliminarEmpresa(empresaActiva.id)}>
                    <Trash2 className="h-3.5 w-3.5" /> Eliminar
                  </Button>
                )}
              </div>

              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Módulos</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                  {config.modulos.map(m => {
                    const sel = !!empresaActiva.mods[m.id];
                    return (
                      <button key={m.id} onClick={() => toggleModulo(empresaActiva.id, m.id)}
                        className={`flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 text-center transition-colors ${sel ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-slate-50 hover:border-blue-300'}`}>
                        <span className="text-sm font-semibold">{m.nombre}</span>
                        <span className={`text-xs ${sel ? 'text-blue-100' : 'text-slate-500'}`}>${m.precio}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="text-sm font-semibold text-slate-700">Usuarios:</label>
                <Input type="number" min={1} max={99} className="w-24 text-center" value={empresaActiva.usuarios}
                  onChange={e => actualizarEmpresa(empresaActiva.id, { usuarios: Math.max(1, parseInt(e.target.value) || 1) })} />
                <span className="text-xs text-slate-500">+{(config.recargo_usuario_pct * 100).toFixed(0)}% por cada usuario adicional</span>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Tamaño de la operación</p>
                <div className="grid sm:grid-cols-2 md:grid-cols-5 gap-3">
                  {PARAMETROS.map(({ key, label }) => {
                    const cantidad = Math.max(0, parseInt(empresaActiva[key]) || 0);
                    const { recargo, esContactar } = tramoRecargo(config.tramos, key, cantidad);
                    return (
                      <div key={key} className="space-y-1">
                        <label className="text-xs font-medium text-slate-600">{label}</label>
                        <Input type="number" min={0} value={empresaActiva[key]}
                          onChange={e => actualizarEmpresa(empresaActiva.id, { [key]: Math.max(0, parseInt(e.target.value) || 0) })} />
                        {esContactar ? (
                          <p className="text-[11px] text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Volumen alto</p>
                        ) : recargo > 0 ? (
                          <p className="text-[11px] text-slate-500">+${recargo.toFixed(2)}</p>
                        ) : (
                          <p className="text-[11px] text-slate-300">Incluido</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Resumen */}
        {resumen && (
          <Card>
            <CardContent className="p-6 space-y-3">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Resumen de cotización</p>
              {resumen.detalle.map((d, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-700">{d.nombre}</span>
                    {d.dto > 0 && <Badge className="bg-emerald-100 text-emerald-700 text-xs">{(d.dto * 100).toFixed(0)}% dto.</Badge>}
                    {d.contacta && <Badge className="bg-amber-100 text-amber-700 text-xs flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Volumen alto</Badge>}
                  </div>
                  <span className="font-semibold text-slate-900">${d.totalEmpresa.toFixed(2)}</span>
                </div>
              ))}

              {resumen.detalle.some(d => d.contacta) && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Detectamos volumen alto de operación en al menos una empresa. El precio mostrado es referencial — nuestro equipo preparará una propuesta a medida.</span>
                </div>
              )}

              <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-slate-900 to-blue-900 mt-2">
                <span className="text-white/80 font-medium">Total mensual estimado</span>
                <span className="text-white text-2xl font-bold">${resumen.total.toFixed(2)}</span>
              </div>

              <div className="flex flex-wrap gap-3 pt-2">
                <Button onClick={enviarCotizacion} disabled={enviando} className="bg-blue-600 hover:bg-blue-700 gap-2 flex-1 min-w-[200px]">
                  {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Enviar cotización
                </Button>
                <Button variant="outline" onClick={() => window.location.reload()} className="gap-2">
                  <RefreshCw className="h-4 w-4" /> Reiniciar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        </>
        )}
      </div>
    </div>
  );
};

export default Calculadora;
