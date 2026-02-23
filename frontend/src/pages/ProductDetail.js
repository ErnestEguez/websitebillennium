import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { 
  UtensilsCrossed, 
  Smartphone, 
  Ship, 
  ShieldCheck, 
  FileText, 
  BarChart3,
  Check,
  ArrowRight,
  Users,
  Building,
  HelpCircle,
  ChevronDown
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../components/ui/accordion';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const iconMap = {
  UtensilsCrossed,
  Smartphone,
  Ship,
  ShieldCheck,
  FileText,
  BarChart3,
};

const productExtras = {
  restoflow: {
    image: 'https://customer-assets.emergentagent.com/job_pymes-ecuador/artifacts/3d5ddad3_RestoFlow.jpg',
    problem: 'Los restaurantes pierden dinero por pedidos no registrados, errores de facturación y falta de control sobre el personal.',
    benefits: [
      'Elimina las fugas de dinero: cada consumo queda registrado y debe terminar en factura',
      'Reduce errores humanos en la toma de pedidos con comandas digitales',
      'Control total de tu negocio desde cualquier dispositivo',
      'Cumple con la normativa SRI sin complicaciones'
    ],
    target: 'Restaurantes, cafeterías, bares, food courts y negocios gastronómicos que buscan digitalizar sus operaciones y tener control real de sus ventas.',
    faqs: [
      { q: '¿Puedo dividir la cuenta entre varios clientes?', a: 'Sí, RestoFlow permite dividir la cuenta de manera equitativa o por consumo individual de cada comensal.' },
      { q: '¿Funciona sin internet?', a: 'El sistema requiere conexión a internet para sincronizar en tiempo real, pero tiene modo offline para toma de pedidos que se sincronizan al reconectarse.' },
      { q: '¿Incluye facturación electrónica?', a: 'Sí, todos los planes incluyen facturación electrónica certificada por el SRI.' },
      { q: '¿Puedo tener varios locales?', a: 'Sí, con el plan Corporativo puedes gestionar múltiples empresas y locales desde una sola cuenta.' },
    ]
  },
  sentinel: {
    image: 'https://images.pexels.com/photos/5324991/pexels-photo-5324991.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    problem: 'Los equipos de ventas pierden tiempo con procesos manuales, no tienen visibilidad del inventario actualizado y los pedidos se pierden entre el campo y la oficina.',
    benefits: [
      'Vendedores siempre con catálogo actualizado desde el ERP',
      'Pedidos llegan automáticamente para su procesamiento',
      'Trabaja sin internet y sincroniza al conectarse',
      'Dashboard de ventas para medir el desempeño'
    ],
    target: 'Empresas con equipos de ventas en campo, distribuidoras, mayoristas y negocios que necesitan toma de pedidos móvil conectada a su sistema.',
    faqs: [
      { q: '¿Se integra con mi ERP actual?', a: 'Pedidos Sentinel está diseñado para integrarse con el ERP Billennium-Sentinel. Para otros ERPs podemos evaluar la integración.' },
      { q: '¿Cada vendedor tiene su propia cuenta?', a: 'Sí, cada vendedor tiene su usuario y puede ver su propio dashboard de ventas y comisiones.' },
      { q: '¿Puedo gestionar varias empresas?', a: 'Sí, con los planes Profesional y Corporativo puedes gestionar múltiples empresas desde una sola cuenta.' },
    ]
  },
  'modulo-importaciones': {
    image: 'https://images.pexels.com/photos/1117210/pexels-photo-1117210.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    problem: 'El control de importaciones suele hacerse en hojas de cálculo, perdiendo trazabilidad de costos y dificultando el cálculo real del costo de la mercadería.',
    benefits: [
      'Trazabilidad completa de cada importación',
      'Cálculo automático de costos (flete, aranceles, etc.)',
      'Control de proveedores internacionales',
      'Integración con tu ERP para costeo preciso'
    ],
    target: 'Empresas importadoras, distribuidoras y comercializadoras que necesitan control profesional de sus procesos de importación.',
    faqs: [
      { q: '¿Calcula automáticamente los costos de importación?', a: 'Sí, el sistema permite configurar los diferentes componentes del costo (flete, seguro, aranceles, etc.) y los distribuye automáticamente.' },
      { q: '¿Se integra con el sistema de inventario?', a: 'Sí, al cerrar una importación los productos se integran al inventario con su costo real calculado.' },
    ]
  },
  lopdp: {
    image: 'https://images.unsplash.com/photo-1767972464040-8bfee42d7bed?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MDV8MHwxfHNlYXJjaHw0fHxjeWJlcnNlY3VyaXR5JTIwZGF0YSUyMHByb3RlY3Rpb24lMjBsb2NrfGVufDB8fHx8MTc3MTg1ODY4N3ww&ixlib=rb-4.1.0&q=85',
    problem: 'La LOPDP exige a las empresas cumplir con obligaciones de protección de datos personales, pero muchas no saben por dónde empezar ni cómo documentar su cumplimiento.',
    benefits: [
      'Cumple con la ley sin ser experto en protección de datos',
      'Documentación legal generada automáticamente',
      'Portal para que tus clientes ejerzan sus derechos ARCO',
      'Alertas cuando debes renovar consentimientos'
    ],
    target: 'Cualquier empresa que maneje datos personales de clientes, empleados o proveedores y necesite cumplir con la LOPDP ecuatoriana.',
    faqs: [
      { q: '¿Qué es la LOPDP?', a: 'La Ley Orgánica de Protección de Datos Personales es la normativa ecuatoriana que regula cómo las empresas deben manejar la información personal de sus clientes y empleados.' },
      { q: '¿Mi empresa necesita cumplir con la LOPDP?', a: 'Si tu empresa recopila, almacena o procesa datos personales (nombre, cédula, email, etc.) de personas naturales, debes cumplir con la LOPDP.' },
      { q: '¿Qué son los derechos ARCO?', a: 'Son los derechos de Acceso, Rectificación, Cancelación y Oposición que tienen las personas sobre sus datos personales.' },
    ]
  },
  'facturacion-electronica': {
    image: 'https://images.pexels.com/photos/7873568/pexels-photo-7873568.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    problem: 'Emitir comprobantes electrónicos puede ser complicado si no tienes un sistema que cumpla con todos los requisitos del SRI.',
    benefits: [
      'Emite facturas, notas de crédito y más en segundos',
      'Envío automático al SRI sin intervención manual',
      'Tus clientes reciben sus comprobantes por email',
      'Reportes listos para tus declaraciones'
    ],
    target: 'Pequeñas y medianas empresas que necesitan facturación electrónica sin la complejidad de un sistema ERP completo.',
    faqs: [
      { q: '¿Qué comprobantes puedo emitir?', a: 'Facturas, notas de crédito, notas de débito, retenciones, guías de remisión y liquidaciones de compra.' },
      { q: '¿Necesito certificado digital?', a: 'Sí, necesitas un certificado de firma electrónica vigente emitido por una entidad certificada en Ecuador.' },
      { q: '¿Los comprobantes se envían automáticamente al SRI?', a: 'Sí, el sistema firma, envía y autoriza los comprobantes automáticamente con el SRI.' },
    ]
  },
  'dashboard-empresarial': {
    image: 'https://images.pexels.com/photos/7873568/pexels-photo-7873568.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    problem: 'Los dueños de negocio necesitan información actualizada para tomar decisiones, pero extraer datos del ERP suele ser complicado y tardado.',
    benefits: [
      'Visualiza tus KPIs principales de un vistazo',
      'Información actualizada desde tu ERP',
      'Accede desde cualquier dispositivo',
      'Identifica tendencias y oportunidades'
    ],
    target: 'Gerentes, dueños de negocio y directivos que necesitan información gerencial sin depender del área de sistemas.',
    faqs: [
      { q: '¿De dónde toma los datos?', a: 'El dashboard se conecta a tu ERP Billennium-Sentinel y extrae la información automáticamente.' },
      { q: '¿Puedo personalizar los indicadores?', a: 'Sí, con el plan Profesional puedes configurar los KPIs y reportes según tus necesidades.' },
      { q: '¿Se actualiza en tiempo real?', a: 'Con el plan Profesional los datos se actualizan en tiempo real. El plan Estándar actualiza diariamente.' },
    ]
  },
};

export const ProductDetail = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    fetchProduct();
  }, [slug]);

  const fetchProduct = async () => {
    try {
      const response = await axios.get(`${API}/products/${slug}`);
      setProduct(response.data);
    } catch (error) {
      console.error('Error fetching product:', error);
      navigate('/productos');
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (planName) => {
    if (!user) {
      toast.info('Debes iniciar sesión para suscribirte');
      navigate('/login', { state: { from: `/productos/${slug}` } });
      return;
    }

    setSubscribing(true);
    try {
      await axios.post(`${API}/subscriptions`, {
        product_id: product.id,
        plan_name: planName,
        billing_cycle: 'monthly'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success('¡Solicitud enviada! Un administrador revisará tu suscripción.');
      navigate('/mis-suscripciones');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Error al procesar la suscripción');
    } finally {
      setSubscribing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!product) return null;

  const extras = productExtras[product.slug] || productExtras[product.id] || {};
  const Icon = iconMap[product.icon] || FileText;

  return (
    <div>
      {/* Hero */}
      <section className="relative py-20 md:py-28 bg-gradient-to-br from-slate-900 to-blue-900 overflow-hidden">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <Badge variant="secondary" className="bg-blue-500/20 text-blue-300 border-0">
                  Software SaaS
                </Badge>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-4">
                {product.name}
              </h1>
              <p className="text-xl text-slate-300 mb-8">
                {product.description}
              </p>
              <div className="flex flex-wrap gap-4">
                <a href="#planes">
                  <Button size="lg" className="bg-blue-600 hover:bg-blue-700" data-testid="btn-ver-planes">
                    Ver Planes
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </a>
                <Link to="/contacto">
                  <Button size="lg" variant="outline" className="border-slate-600 text-white hover:bg-slate-800" data-testid="btn-solicitar-demo">
                    Solicitar Demo
                  </Button>
                </Link>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              className="hidden lg:block"
            >
              <div className="relative">
                <div className="absolute -inset-4 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl blur-2xl opacity-20"></div>
                <img
                  src={extras.image}
                  alt={product.name}
                  className="relative rounded-2xl shadow-2xl w-full"
                />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Problem & Benefits */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <div className="grid lg:grid-cols-2 gap-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-2xl font-bold text-slate-900 mb-4">El Problema</h2>
              <p className="text-lg text-slate-600 leading-relaxed">
                {extras.problem}
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              <h2 className="text-2xl font-bold text-slate-900 mb-4">Beneficios</h2>
              <ul className="space-y-3">
                {extras.benefits?.map((benefit, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <Check className="h-6 w-6 text-green-500 flex-shrink-0 mt-0.5" />
                    <span className="text-slate-600">{benefit}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-slate-50">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Funcionalidades Principales</h2>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {product.features.map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className="h-full border-slate-200">
                  <CardContent className="p-6 flex items-start gap-4">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                      <Check className="h-5 w-5" />
                    </div>
                    <span className="text-slate-700 font-medium">{feature}</span>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Target Audience */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <div className="max-w-3xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-6">
                <Users className="h-8 w-8" />
              </div>
              <h2 className="text-3xl font-bold text-slate-900 mb-4">¿Para quién es {product.name}?</h2>
              <p className="text-lg text-slate-600">
                {extras.target}
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="planes" className="py-20 bg-slate-50 scroll-mt-20">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Planes y Precios</h2>
            <p className="text-lg text-slate-600">Elige el plan que mejor se adapte a tu negocio</p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {product.plans.map((plan, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <Card className={`h-full ${plan.popular ? 'border-2 border-blue-500 shadow-xl relative' : 'border-slate-200'}`}>
                  {plan.popular && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <Badge className="bg-blue-600 text-white">Más Popular</Badge>
                    </div>
                  )}
                  <CardHeader className="text-center pb-2">
                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="text-center mb-6">
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <span className="text-slate-400 line-through text-lg">${plan.price_before}</span>
                        <Badge variant="destructive" className="bg-red-500">-50%</Badge>
                      </div>
                      <div className="flex items-baseline justify-center">
                        <span className="text-4xl font-bold text-slate-900">${plan.price_now}</span>
                        <span className="text-slate-500 ml-1">/{plan.billing}</span>
                      </div>
                    </div>

                    <ul className="space-y-3 mb-8">
                      {plan.features.map((feature, j) => (
                        <li key={j} className="flex items-start gap-2 text-sm">
                          <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                          <span className="text-slate-600">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      className={`w-full ${plan.popular ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                      variant={plan.popular ? 'default' : 'outline'}
                      onClick={() => handleSubscribe(plan.name)}
                      disabled={subscribing}
                      data-testid={`btn-subscribe-${plan.name.toLowerCase()}`}
                    >
                      {subscribing ? 'Procesando...' : 'Comenzar Ahora'}
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <p className="text-center text-slate-500 mt-8 text-sm">
            Si necesitas algo específico (más locales, integración con otros sistemas, desarrollo a medida), podemos armar un plan personalizado para tu empresa.
          </p>
        </div>
      </section>

      {/* FAQs */}
      {extras.faqs && extras.faqs.length > 0 && (
        <section className="py-20 bg-white">
          <div className="container mx-auto px-4 md:px-8 max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-6">
                <HelpCircle className="h-8 w-8" />
              </div>
              <h2 className="text-3xl font-bold text-slate-900">Preguntas Frecuentes</h2>
            </motion.div>

            <Accordion type="single" collapsible className="w-full">
              {extras.faqs.map((faq, i) => (
                <AccordionItem key={i} value={`item-${i}`}>
                  <AccordionTrigger className="text-left text-slate-900 hover:text-blue-600">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-slate-600">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="py-20 bg-gradient-to-br from-blue-600 to-blue-800">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
              ¿Listo para empezar con {product.name}?
            </h2>
            <p className="text-lg text-blue-100 mb-8 max-w-2xl mx-auto">
              Agenda una demostración gratuita y descubre cómo podemos ayudarte.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link to="/contacto">
                <Button size="lg" className="bg-white text-blue-600 hover:bg-slate-100" data-testid="cta-final-demo">
                  Solicitar Demo
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <a href="https://wa.me/593980136389" target="_blank" rel="noopener noreferrer">
                <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10" data-testid="cta-final-whatsapp">
                  Escribir por WhatsApp
                </Button>
              </a>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default ProductDetail;
