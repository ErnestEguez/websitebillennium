import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { Check, ArrowRight, Zap, Shield, RefreshCw, HeadphonesIcon } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const saasAdvantages = [
  {
    icon: Zap,
    title: 'Siempre Actualizado',
    description: 'Actualizaciones automáticas sin costo adicional. Siempre tendrás la última versión.',
  },
  {
    icon: Shield,
    title: 'Sin Infraestructura',
    description: 'No necesitas servidores propios. Nosotros nos encargamos de todo.',
  },
  {
    icon: RefreshCw,
    title: 'Costo Predecible',
    description: 'Paga solo lo que usas. Sin sorpresas ni inversiones iniciales grandes.',
  },
  {
    icon: HeadphonesIcon,
    title: 'Soporte Incluido',
    description: 'Equipo de soporte local disponible para ayudarte cuando lo necesites.',
  },
];

export const Planes = () => {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState('restoflow');
  const [subscribing, setSubscribing] = useState(false);
  const { user, token } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const response = await axios.get(`${API}/products`);
      setProducts(response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async (productId, planName) => {
    if (!user) {
      toast.info('Debes iniciar sesión para suscribirte');
      navigate('/login', { state: { from: '/planes' } });
      return;
    }

    setSubscribing(true);
    try {
      await axios.post(`${API}/subscriptions`, {
        product_id: productId,
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

  const currentProduct = products.find(p => p.id === selectedProduct);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Hero */}
      <section className="py-20 md:py-28 bg-gradient-to-br from-slate-900 to-blue-900">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <span className="inline-block px-4 py-2 rounded-full bg-blue-500/20 text-blue-300 text-sm font-medium mb-6">
              Precios transparentes
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6">
              Planes y Precios
            </h1>
            <p className="text-lg text-slate-300 max-w-2xl mx-auto">
              Elige el producto y el plan que mejor se adapte a las necesidades de tu negocio. Todos incluyen soporte y actualizaciones.
            </p>
          </motion.div>
        </div>
      </section>

      {/* SaaS Advantages */}
      <section className="py-16 bg-white border-b border-slate-200">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {saasAdvantages.map((advantage, i) => {
              const Icon = advantage.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="text-center"
                >
                  <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="font-semibold text-slate-900 mb-2">{advantage.title}</h3>
                  <p className="text-sm text-slate-600">{advantage.description}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing Tables */}
      <section className="py-20 bg-slate-50">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <Tabs value={selectedProduct} onValueChange={setSelectedProduct} className="w-full">
            <TabsList className="flex flex-wrap justify-center gap-2 mb-12 bg-transparent h-auto">
              {products.map((product) => (
                <TabsTrigger
                  key={product.id}
                  value={product.id}
                  className="px-6 py-3 rounded-full data-[state=active]:bg-blue-600 data-[state=active]:text-white bg-white border border-slate-200"
                  data-testid={`tab-${product.id}`}
                >
                  {product.name}
                </TabsTrigger>
              ))}
            </TabsList>

            {products.map((product) => (
              <TabsContent key={product.id} value={product.id}>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center mb-12"
                >
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">{product.name}</h2>
                  <p className="text-slate-600">{product.description}</p>
                </motion.div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
                  {product.plans.map((plan, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
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
                            onClick={() => handleSubscribe(product.id, plan.name)}
                            disabled={subscribing}
                            data-testid={`subscribe-${product.id}-${plan.name.toLowerCase().replace(' ', '-')}`}
                          >
                            {subscribing ? 'Procesando...' : 'Comenzar Ahora'}
                          </Button>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>

          <p className="text-center text-slate-500 mt-12 text-sm max-w-2xl mx-auto">
            ¿Necesitas algo específico? Podemos crear un plan personalizado para tu empresa con más usuarios, locales o integraciones especiales.{' '}
            <Link to="/contacto" className="text-blue-600 hover:underline">Contáctanos</Link>.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl font-bold text-slate-900 mb-6">
              ¿No estás seguro qué plan elegir?
            </h2>
            <p className="text-lg text-slate-600 mb-8 max-w-2xl mx-auto">
              Agenda una llamada con nuestro equipo y te ayudaremos a encontrar la mejor solución para tu negocio.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link to="/contacto">
                <Button size="lg" className="bg-blue-600 hover:bg-blue-700" data-testid="btn-agendar-llamada">
                  Agendar Llamada
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <a href="https://wa.me/593980136389" target="_blank" rel="noopener noreferrer">
                <Button size="lg" variant="outline" data-testid="btn-whatsapp-planes">
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

export default Planes;
