import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  Heart, 
  Lightbulb, 
  Award, 
  HeadphonesIcon, 
  Eye,
  ArrowRight,
  Building,
  Users,
  Code
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';

const TEAM_IMAGE = "https://images.pexels.com/photos/8117466/pexels-photo-8117466.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940";
const CLOUD_IMAGE = "https://customer-assets.emergentagent.com/job_pymes-ecuador/artifacts/rfson65i_BillenniumWeb.jpg";

const timeline = [
  {
    year: '1981',
    title: 'Los Inicios',
    description: 'Comenzamos desarrollando sistemas de gestión con tecnologías tradicionales, sentando las bases de nuestra experiencia.',
  },
  {
    year: '2000s',
    title: 'Evolución Digital',
    description: 'Migramos a aplicaciones web modernas, adaptándonos a las nuevas tecnologías y necesidades del mercado.',
  },
  {
    year: '2015',
    title: 'Especialización SRI',
    description: 'Nos especializamos en facturación electrónica y cumplimiento normativo ecuatoriano.',
  },
  {
    year: '2020',
    title: 'Era Cloud',
    description: 'Lanzamos nuestra suite SaaS completa: RestoFlow, Sentinel ERP, y soluciones de cumplimiento.',
  },
  {
    year: 'Hoy',
    title: 'Billennium System',
    description: 'Consolidados como referentes en soluciones SaaS para pymes ecuatorianas con tecnología de clase mundial.',
  },
];

const values = [
  {
    icon: Heart,
    title: 'Compromiso con el cliente',
    description: 'Tu éxito es nuestro éxito. Nos involucramos en tu proyecto desde el día uno.',
  },
  {
    icon: Lightbulb,
    title: 'Innovación continua',
    description: 'Siempre buscamos nuevas formas de mejorar nuestros productos y servicios.',
  },
  {
    icon: Award,
    title: 'Calidad sin compromisos',
    description: 'No lanzamos productos hasta que estén realmente listos y probados.',
  },
  {
    icon: HeadphonesIcon,
    title: 'Soporte excepcional',
    description: 'Equipo local disponible cuando lo necesites, hablamos tu idioma.',
  },
  {
    icon: Eye,
    title: 'Transparencia total',
    description: 'Sin letra pequeña. Lo que ves es lo que pagas, sin sorpresas.',
  },
];

const stats = [
  { number: '40+', label: 'Años de experiencia' },
  { number: '500+', label: 'Clientes satisfechos' },
  { number: '6', label: 'Productos SaaS' },
  { number: '24/7', label: 'Soporte disponible' },
];

export const About = () => {
  return (
    <div>
      {/* Hero */}
      <section className="py-20 md:py-28 bg-gradient-to-br from-slate-900 to-blue-900">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
            >
              <span className="inline-block px-4 py-2 rounded-full bg-blue-500/20 text-blue-300 text-sm font-medium mb-6">
                Desde 1981
              </span>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6">
                Sobre Billennium System
              </h1>
              <p className="text-lg text-slate-300 mb-8">
                Somos una empresa de software ecuatoriana especializada en soluciones SaaS para pymes que necesitan controlar mejor su negocio y cumplir con la normativa del SRI y la LOPDP.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              className="hidden lg:block"
            >
              <img
                src={CLOUD_IMAGE}
                alt="Billennium System"
                className="rounded-2xl shadow-2xl"
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 bg-white border-b border-slate-200">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="text-center"
              >
                <p className="text-4xl font-bold text-blue-600 mb-2">{stat.number}</p>
                <p className="text-slate-600">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Story */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <img
                src={TEAM_IMAGE}
                alt="Equipo Billennium"
                className="rounded-2xl shadow-xl"
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Nuestra Historia</h2>
              <div className="space-y-4 text-slate-600">
                <p>
                  Combinamos décadas de experiencia en desarrollo de sistemas de gestión con tecnologías modernas en la nube para ofrecer herramientas simples de usar, pero potentes en resultados.
                </p>
                <p>
                  Desde 1981 hemos trabajado con distintos lenguajes y plataformas, evolucionando desde sistemas tradicionales hasta aplicaciones web y servicios en la nube. Esa trayectoria nos permite entender tanto las necesidades del dueño de negocio como las exigencias técnicas y legales actuales.
                </p>
                <p>
                  Hoy nuestra suite incluye soluciones como RestoFlow para restaurantes, el ERP Billennium-Sentinel, módulos de importaciones, cumplimiento LOPDP y facturación electrónica básica para el SRI. Todo con un enfoque claro: ayudarte a tener más control, menos errores y más tranquilidad en la operación diaria de tu empresa.
                </p>
                <p>
                  Creemos en una relación cercana con cada cliente: te acompañamos en la implementación, configuramos el sistema según tu realidad y te damos soporte continuo para que la tecnología no sea un problema, sino un aliado.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="py-20 bg-slate-50">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Nuestro Recorrido</h2>
          </motion.div>

          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-8 md:left-1/2 top-0 bottom-0 w-0.5 bg-blue-200 transform md:-translate-x-1/2"></div>

            <div className="space-y-12">
              {timeline.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className={`relative flex items-center ${i % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'}`}
                >
                  <div className={`flex-1 ${i % 2 === 0 ? 'md:pr-12 md:text-right' : 'md:pl-12'} pl-20 md:pl-0`}>
                    <Card className="inline-block">
                      <CardContent className="p-6">
                        <span className="text-blue-600 font-bold text-lg">{item.year}</span>
                        <h3 className="text-xl font-semibold text-slate-900 mt-1 mb-2">{item.title}</h3>
                        <p className="text-slate-600">{item.description}</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Timeline dot */}
                  <div className="absolute left-8 md:left-1/2 w-4 h-4 bg-blue-600 rounded-full transform -translate-x-1/2 border-4 border-white shadow"></div>

                  <div className="flex-1 hidden md:block"></div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Nuestros Valores</h2>
            <p className="text-lg text-slate-600">Los principios que guían cada decisión y cada línea de código que escribimos</p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {values.map((value, i) => {
              const Icon = value.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                >
                  <Card className="h-full border-slate-200 hover:shadow-lg transition-shadow">
                    <CardContent className="p-8">
                      <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-6">
                        <Icon className="h-6 w-6" />
                      </div>
                      <h3 className="text-xl font-semibold text-slate-900 mb-2">{value.title}</h3>
                      <p className="text-slate-600">{value.description}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-br from-blue-600 to-blue-800">
        <div className="container mx-auto px-4 md:px-8 max-w-7xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
              ¿Quieres conocernos mejor?
            </h2>
            <p className="text-lg text-blue-100 mb-8 max-w-2xl mx-auto">
              Agenda una llamada y cuéntanos sobre tu negocio. Encontraremos juntos la mejor solución.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link to="/contacto">
                <Button size="lg" className="bg-white text-blue-600 hover:bg-slate-100" data-testid="about-cta-contact">
                  Contactar
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <a href="https://wa.me/593980136389" target="_blank" rel="noopener noreferrer">
                <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10" data-testid="about-cta-whatsapp">
                  WhatsApp
                </Button>
              </a>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default About;
