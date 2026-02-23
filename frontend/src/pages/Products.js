import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  UtensilsCrossed, 
  Smartphone, 
  Ship, 
  ShieldCheck, 
  FileText, 
  BarChart3,
  ArrowRight,
  Check
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';

const products = [
  {
    id: 'restoflow',
    name: 'RestoFlow',
    tagline: 'Tecnología que fluye con tu negocio',
    description: 'Software SaaS para gestión integral de restaurantes con facturación electrónica SRI. Control de mesas, comandas a cocina, inventario y más.',
    icon: UtensilsCrossed,
    image: 'https://customer-assets.emergentagent.com/job_pymes-ecuador/artifacts/3d5ddad3_RestoFlow.jpg',
    features: ['Gestión de mesas en tiempo real', 'Comandas automáticas a cocina', 'Facturación electrónica SRI', 'Control de inventario', 'División de cuentas'],
    color: 'from-orange-500 to-red-500',
    bgColor: 'bg-orange-50',
    iconColor: 'text-orange-600',
    priceFrom: 20,
  },
  {
    id: 'pedidos-sentinel',
    name: 'Pedidos Sentinel',
    tagline: 'Tu fuerza de ventas siempre conectada',
    description: 'Aplicación móvil de toma de pedidos enlazada a ERP Billennium. Trabaja offline/online con sincronización automática.',
    icon: Smartphone,
    image: 'https://images.pexels.com/photos/5324991/pexels-photo-5324991.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    features: ['Multi-empresa', 'Trabajo offline/online', 'Sincronización con ERP', 'Generación de proformas PDF', 'Dashboard de ventas'],
    color: 'from-blue-500 to-indigo-500',
    bgColor: 'bg-blue-50',
    iconColor: 'text-blue-600',
    priceFrom: 30,
  },
  {
    id: 'modulo-importaciones',
    name: 'Módulo de Importaciones',
    tagline: 'Controla tus importaciones de principio a fin',
    description: 'Control completo de procesos de importación, costos y órdenes de compra internacionales.',
    icon: Ship,
    image: 'https://images.pexels.com/photos/1117210/pexels-photo-1117210.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    features: ['Control de órdenes de compra', 'Seguimiento de embarques', 'Cálculo de costos', 'Gestión de proveedores', 'Integración con ERP'],
    color: 'from-cyan-500 to-blue-500',
    bgColor: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    priceFrom: 45,
  },
  {
    id: 'lopdp',
    name: 'LOPDP',
    tagline: 'Cumplimiento de datos sin complicaciones',
    description: 'Solución para ayudar a las empresas a cumplir la Ley Orgánica de Protección de Datos Personales en Ecuador.',
    icon: ShieldCheck,
    image: 'https://images.unsplash.com/photo-1767972464040-8bfee42d7bed?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MDV8MHwxfHNlYXJjaHw0fHxjeWJlcnNlY3VyaXR5JTIwZGF0YSUyMHByb3RlY3Rpb24lMjBsb2NrfGVufDB8fHx8MTc3MTg1ODY4N3ww&ixlib=rb-4.1.0&q=85',
    features: ['Inventario de datos personales', 'Gestión de consentimientos', 'Portal de derechos ARCO', 'Alertas de cumplimiento', 'Documentación legal'],
    color: 'from-green-500 to-emerald-500',
    bgColor: 'bg-green-50',
    iconColor: 'text-green-600',
    priceFrom: 35,
  },
  {
    id: 'facturacion-electronica',
    name: 'Facturación Electrónica',
    tagline: 'Factura fácil, cumple seguro',
    description: 'Sistema en la nube para emitir comprobantes electrónicos cumpliendo normativa SRI.',
    icon: FileText,
    image: 'https://images.pexels.com/photos/7873568/pexels-photo-7873568.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    features: ['Facturas electrónicas', 'Notas de crédito/débito', 'Retenciones', 'Guías de remisión', 'Reportes para declaraciones'],
    color: 'from-purple-500 to-violet-500',
    bgColor: 'bg-purple-50',
    iconColor: 'text-purple-600',
    priceFrom: 15,
  },
  {
    id: 'dashboard-empresarial',
    name: 'Dashboard Empresarial',
    tagline: 'Decisiones basadas en datos',
    description: 'Dashboard comercial y financiero para empresas enlazado a su propio ERP.',
    icon: BarChart3,
    image: 'https://images.pexels.com/photos/7873568/pexels-photo-7873568.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940',
    features: ['KPIs en tiempo real', 'Análisis de ventas', 'Control de cartera', 'Indicadores financieros', 'Reportes personalizados'],
    color: 'from-pink-500 to-rose-500',
    bgColor: 'bg-pink-50',
    iconColor: 'text-pink-600',
    priceFrom: 25,
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 }
};

export const Products = () => {
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
              Software SaaS para Ecuador
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6">
              Nuestras Soluciones
            </h1>
            <p className="text-lg text-slate-300 max-w-2xl mx-auto">
              Suite completa de software empresarial diseñado para las necesidades de las pymes ecuatorianas. Cumplimiento normativo garantizado.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Products Grid */}
      <section className="py-20 md:py-32 bg-white">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="space-y-16"
          >
            {products.map((product, index) => {
              const Icon = product.icon;
              const isEven = index % 2 === 0;
              
              return (
                <motion.div key={product.id} variants={itemVariants}>
                  <Card className="overflow-hidden border-slate-200 hover:shadow-xl transition-shadow">
                    <CardContent className="p-0">
                      <div className={`grid lg:grid-cols-2 ${isEven ? '' : 'lg:flex-row-reverse'}`}>
                        <div className={`relative h-64 lg:h-auto ${isEven ? '' : 'lg:order-2'}`}>
                          <img
                            src={product.image}
                            alt={product.name}
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                          <div className={`absolute inset-0 bg-gradient-to-br ${product.color} opacity-20`}></div>
                        </div>
                        
                        <div className={`p-8 lg:p-12 ${isEven ? '' : 'lg:order-1'}`}>
                          <div className={`w-14 h-14 rounded-xl ${product.bgColor} ${product.iconColor} flex items-center justify-center mb-6`}>
                            <Icon className="h-7 w-7" />
                          </div>
                          
                          <h2 className="text-2xl lg:text-3xl font-bold text-slate-900 mb-2">
                            {product.name}
                          </h2>
                          <p className="text-blue-600 font-medium mb-4">
                            {product.tagline}
                          </p>
                          <p className="text-slate-600 mb-6">
                            {product.description}
                          </p>
                          
                          <ul className="space-y-2 mb-8">
                            {product.features.map((feature, i) => (
                              <li key={i} className="flex items-center gap-2 text-slate-600">
                                <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                                <span>{feature}</span>
                              </li>
                            ))}
                          </ul>
                          
                          <div className="flex flex-wrap items-center gap-4">
                            <Link to={`/productos/${product.id}`}>
                              <Button className="bg-blue-600 hover:bg-blue-700" data-testid={`btn-ver-${product.id}`}>
                                Ver detalles
                                <ArrowRight className="ml-2 h-4 w-4" />
                              </Button>
                            </Link>
                            <span className="text-slate-500">
                              Desde <span className="text-2xl font-bold text-slate-900">${product.priceFrom}</span>/mes
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-slate-50">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-6">
              ¿No encuentras lo que buscas?
            </h2>
            <p className="text-lg text-slate-600 mb-8 max-w-2xl mx-auto">
              Podemos desarrollar soluciones a medida para tu empresa. Contáctanos y cuéntanos tus necesidades.
            </p>
            <Link to="/contacto">
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700" data-testid="btn-contacto-custom">
                Solicitar Solución Personalizada
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default Products;
