import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  UtensilsCrossed, 
  Smartphone, 
  Ship, 
  ShieldCheck, 
  FileText, 
  BarChart3,
  CheckCircle,
  ArrowRight,
  Zap,
  Lock,
  HeadphonesIcon,
  Award
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';

const HERO_IMAGE = "https://customer-assets.emergentagent.com/job_pymes-ecuador/artifacts/rfson65i_BillenniumWeb.jpg";

const products = [
  {
    id: 'restoflow',
    name: 'RestoFlow',
    description: 'Gestión integral de restaurantes con facturación electrónica SRI',
    icon: UtensilsCrossed,
    color: 'from-orange-500 to-red-500',
    bgColor: 'bg-orange-50',
    iconColor: 'text-orange-600',
  },
  {
    id: 'pedidos-sentinel',
    name: 'Pedidos Sentinel',
    description: 'Toma de pedidos móvil enlazada a tu ERP Billennium',
    icon: Smartphone,
    color: 'from-blue-500 to-indigo-500',
    bgColor: 'bg-blue-50',
    iconColor: 'text-blue-600',
  },
  {
    id: 'modulo-importaciones',
    name: 'Importaciones',
    description: 'Control de procesos de importación y costos internacionales',
    icon: Ship,
    color: 'from-cyan-500 to-blue-500',
    bgColor: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
  },
  {
    id: 'lopdp',
    name: 'LOPDP',
    description: 'Cumplimiento de la Ley de Protección de Datos Personales',
    icon: ShieldCheck,
    color: 'from-green-500 to-emerald-500',
    bgColor: 'bg-green-50',
    iconColor: 'text-green-600',
  },
  {
    id: 'facturacion-electronica',
    name: 'Facturación Electrónica',
    description: 'Comprobantes electrónicos cumpliendo normativa SRI',
    icon: FileText,
    color: 'from-purple-500 to-violet-500',
    bgColor: 'bg-purple-50',
    iconColor: 'text-purple-600',
  },
  {
    id: 'dashboard-empresarial',
    name: 'Dashboard Empresarial',
    description: 'Indicadores comerciales y financieros en tiempo real',
    icon: BarChart3,
    color: 'from-pink-500 to-rose-500',
    bgColor: 'bg-pink-50',
    iconColor: 'text-pink-600',
  },
];

const benefits = [
  {
    icon: Lock,
    title: 'Seguridad Garantizada',
    description: 'Tus datos protegidos con encriptación de grado bancario y respaldos automáticos diarios.',
  },
  {
    icon: CheckCircle,
    title: 'Cumplimiento SRI y LOPDP',
    description: 'Software actualizado según la normativa ecuatoriana. Facturación electrónica certificada.',
  },
  {
    icon: HeadphonesIcon,
    title: 'Soporte Local',
    description: 'Equipo ecuatoriano disponible para ayudarte. Hablamos tu idioma y entendemos tu negocio.',
  },
  {
    icon: Award,
    title: '40+ Años de Experiencia',
    description: 'Desde 1981 desarrollando software empresarial. Conocemos las necesidades de las pymes.',
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
};

export const Home = () => {
  return (
    <div className="overflow-hidden">
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxwYXRoIGQ9Ik0zNiAxOGMtOS45NDEgMC0xOCA4LjA1OS0xOCAxOHM4LjA1OSAxOCAxOCAxOCAxOC04LjA1OSAxOC0xOC04LjA1OS0xOC0xOC0xOHptMCAzMmMtNy43MzIgMC0xNC02LjI2OC0xNC0xNHM2LjI2OC0xNCAxNC0xNCAxNCA2LjI2OCAxNCAxNC02LjI2OCAxNC0xNCAxNHoiIGZpbGw9IiNmZmYiIG9wYWNpdHk9Ii4xIi8+PC9nPjwvc3ZnPg==')]"></div>
        </div>
        
        <div className="container mx-auto px-4 md:px-8 max-w-7xl relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
            >
              <span className="inline-block px-4 py-2 rounded-full bg-blue-500/20 text-blue-300 text-sm font-medium mb-6">
                Software SaaS para Ecuador
              </span>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
                Digitaliza tu negocio con{' '}
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-400">
                  software confiable
                </span>
              </h1>
              <p className="text-lg text-slate-300 mb-8 max-w-xl">
                Soluciones en la nube para pymes ecuatorianas. Facturación electrónica SRI, gestión de restaurantes, control de importaciones y más. Todo en un solo lugar.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link to="/contacto">
                  <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-6 text-lg rounded-full shadow-lg shadow-blue-500/25" data-testid="hero-cta-demo">
                    Solicitar Demo
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link to="/productos">
                  <Button size="lg" variant="outline" className="border-slate-600 text-white hover:bg-slate-800 px-8 py-6 text-lg rounded-full" data-testid="hero-cta-products">
                    Ver Productos
                  </Button>
                </Link>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="hidden lg:block"
            >
              <div className="relative">
                <div className="absolute -inset-4 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl blur-2xl opacity-20"></div>
                <img
                  src={HERO_IMAGE}
                  alt="Billennium System - Software en la nube"
                  className="relative rounded-2xl shadow-2xl w-full object-cover"
                  style={{ maxHeight: '500px' }}
                />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Products Section */}
      <section className="py-20 md:py-32 bg-white">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="text-sm font-bold uppercase tracking-[0.2em] text-blue-600 mb-4 block">
              Nuestras Soluciones
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 mb-6">
              Todo lo que tu negocio necesita
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Software diseñado para las necesidades reales de las empresas ecuatorianas. Cumplimiento normativo, fácil de usar y siempre actualizado.
            </p>
          </motion.div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {products.map((product) => {
              const Icon = product.icon;
              return (
                <motion.div key={product.id} variants={itemVariants}>
                  <Link to={`/productos/${product.id}`} data-testid={`product-card-${product.id}`}>
                    <Card className="group h-full border-slate-200 hover:border-blue-500/50 hover:shadow-xl transition-all duration-300">
                      <CardContent className="p-8">
                        <div className={`w-14 h-14 rounded-xl ${product.bgColor} ${product.iconColor} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                          <Icon className="h-7 w-7" />
                        </div>
                        <h3 className="text-xl font-semibold text-slate-900 mb-3 group-hover:text-blue-600 transition-colors">
                          {product.name}
                        </h3>
                        <p className="text-slate-600 mb-4">
                          {product.description}
                        </p>
                        <span className="inline-flex items-center text-blue-600 font-medium text-sm group-hover:gap-2 transition-all">
                          Ver más <ArrowRight className="h-4 w-4 ml-1" />
                        </span>
                      </CardContent>
                    </Card>
                  </Link>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 md:py-32 bg-slate-50">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <span className="text-sm font-bold uppercase tracking-[0.2em] text-blue-600 mb-4 block">
              Por qué elegirnos
            </span>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-900 mb-6">
              Tu socio tecnológico de confianza
            </h2>
          </motion.div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid grid-cols-1 md:grid-cols-2 gap-8"
          >
            {benefits.map((benefit, index) => {
              const Icon = benefit.icon;
              return (
                <motion.div key={index} variants={itemVariants}>
                  <Card className="h-full border-slate-200 hover:shadow-lg transition-shadow">
                    <CardContent className="p-8 flex gap-6">
                      <div className="w-14 h-14 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                        <Icon className="h-7 w-7" />
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold text-slate-900 mb-2">
                          {benefit.title}
                        </h3>
                        <p className="text-slate-600">
                          {benefit.description}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 md:py-32 bg-gradient-to-br from-blue-600 to-blue-800">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Zap className="h-16 w-16 text-blue-200 mx-auto mb-6" />
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
              ¿Listo para digitalizar tu negocio?
            </h2>
            <p className="text-lg text-blue-100 mb-8 max-w-2xl mx-auto">
              Agenda una demostración gratuita y descubre cómo nuestro software puede ayudarte a crecer.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link to="/contacto">
                <Button size="lg" className="bg-white text-blue-600 hover:bg-slate-100 px-8 py-6 text-lg rounded-full" data-testid="cta-contact">
                  Agendar Demo
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <a href="https://wa.me/593980136389" target="_blank" rel="noopener noreferrer">
                <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10 px-8 py-6 text-lg rounded-full" data-testid="cta-whatsapp">
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

export default Home;
