import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { CheckCircle2, Clock, MessageCircle, Loader2, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';

const API = '/api';

const ESTADO_INFO = {
  nueva:      { label: 'En revisión',  color: 'bg-blue-100 text-blue-700' },
  contactado: { label: 'En conversación', color: 'bg-amber-100 text-amber-700' },
  cerrado:    { label: 'Cerrado',      color: 'bg-emerald-100 text-emerald-700' },
  descartado: { label: 'Descartado',   color: 'bg-slate-100 text-slate-500' },
};

export const Cotizacion = () => {
  const { id } = useParams();
  const [cotizacion, setCotizacion] = useState(null);
  const [modulos, setModulos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [cotRes, cfgRes] = await Promise.all([
          axios.get(`${API}/calculadora/cotizacion/${id}`),
          axios.get(`${API}/calculadora/config`),
        ]);
        setCotizacion(cotRes.data);
        setModulos(cfgRes.data.modulos);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const nombreModulo = (modId) => modulos.find(m => m.id === modId)?.nombre || modId;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error || !cotizacion) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-50 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">No encontramos esta cotización</h2>
        <p className="text-slate-600">Verifica el enlace o contáctanos si crees que es un error.</p>
      </div>
    );
  }

  const acordado = cotizacion.monto_mensual_acordado != null;

  return (
    <div className="min-h-screen bg-slate-50">
      <section className="py-16 bg-gradient-to-br from-slate-900 to-blue-900">
        <div className="container mx-auto px-4 max-w-3xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <p className="text-blue-300 text-sm font-medium mb-2">Cotización para {cotizacion.cliente_nombre}</p>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">Billennium System</h1>
            <Badge className={ESTADO_INFO[cotizacion.estado]?.color || 'bg-slate-100 text-slate-500'}>
              {ESTADO_INFO[cotizacion.estado]?.label || cotizacion.estado}
            </Badge>
          </motion.div>
        </div>
      </section>

      <div className="container mx-auto px-4 max-w-3xl py-10 space-y-6">

        {/* Monto acordado o pendiente */}
        {acordado ? (
          <Card className="border-emerald-200 bg-emerald-50">
            <CardContent className="p-8 text-center space-y-3">
              <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
              <p className="text-slate-600">Monto mensual acordado con nuestro equipo</p>
              <p className="text-4xl font-bold text-slate-900">${Number(cotizacion.monto_mensual_acordado).toFixed(2)}<span className="text-lg font-medium text-slate-500">/mes</span></p>
              <p className="text-sm text-slate-500 max-w-md mx-auto pt-2">
                Este es el valor que se te cobrará mensualmente. Muy pronto podrás registrar tu método de pago
                directamente aquí — mientras tanto, nuestro equipo te contactará para coordinar el pago.
              </p>
              <a href="https://wa.me/593980136389" target="_blank" rel="noopener noreferrer">
                <Button className="bg-[#25D366] hover:bg-[#1ebe5d] gap-2 mt-2">
                  <MessageCircle className="h-4 w-4" /> Escribir por WhatsApp
                </Button>
              </a>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-8 text-center space-y-3">
              <Clock className="h-10 w-10 text-amber-600 mx-auto" />
              <p className="text-slate-700 font-medium">Tu cotización está en revisión</p>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Nuestro equipo está definiendo el monto final acordado. Te contactaremos pronto — mientras tanto,
                aquí abajo puedes ver el detalle de lo que cotizaste (precio de lista, referencial).
              </p>
            </CardContent>
          </Card>
        )}

        {/* Detalle */}
        <Card>
          <CardContent className="p-6 space-y-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Detalle de la cotización</p>
            {cotizacion.empresas.map((e, i) => (
              <div key={i} className="border border-slate-100 rounded-xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-semibold text-slate-800">{e.nombre}</p>
                  <p className="font-mono text-slate-700">${Number(e.total_empresa).toFixed(2)}</p>
                </div>
                <p className="text-xs text-slate-500">
                  Módulos: {(e.modulos || []).map(nombreModulo).join(', ') || 'Ninguno'} · {e.usuarios} usuario(s)
                </p>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-slate-500 text-sm">Precio de lista (referencial)</span>
              <span className="font-semibold text-slate-700">${Number(cotizacion.total).toFixed(2)}/mes</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Cotizacion;
