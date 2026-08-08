import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, Clock, ArrowRight, BookOpen } from 'lucide-react';

const articles = [
  {
    id: 'que-es-ats-ecuador',
    title: 'Qué es el ATS y cómo declararlo paso a paso en Ecuador 2026',
    excerpt: 'El Anexo Transaccional Simplificado (ATS) es obligatorio para contribuyentes especiales y sociedades en Ecuador. Te explicamos qué es, quién debe presentarlo y cómo generarlo sin errores.',
    date: '2026-05-15',
    readTime: '5 min',
    category: 'Tributación',
    color: 'bg-blue-100 text-blue-700',
    content: `
## Qué es el ATS (Anexo Transaccional Simplificado)

El **ATS** es un reporte mensual que deben presentar al SRI los contribuyentes especiales, las sociedades y los contribuyentes que el SRI designe. Contiene el detalle de todas las compras, ventas y retenciones del período.

**¿Quiénes deben presentar el ATS?**
- Contribuyentes especiales
- Sociedades (compañías, cooperativas, fundaciones)
- Personas naturales obligadas a llevar contabilidad
- Quienes el SRI designe expresamente

**¿Cuándo se presenta?**
Se presenta mensualmente, hasta el día del mes siguiente según el noveno dígito del RUC.

## Qué información contiene el ATS

El ATS incluye tres secciones principales:

1. **Ventas** — todas las facturas emitidas en el período, agrupadas por tipo de comprobante
2. **Compras** — todas las facturas de proveedores y comprobantes de retención emitidos
3. **Retenciones recibidas** — los comprobantes de retención que te hicieron tus clientes

## Cómo generarlo con LedgerPro

Con **LedgerPro** de Billennium System, el ATS se genera automáticamente:

1. Importa tus comprobantes de compra desde el portal del SRI
2. Si usas Corina ERP, tus ventas se sincronizan automáticamente
3. Haz clic en **"Generar ATS"** y descarga el XML listo para subir al DIMM del SRI

**Sin digitar. Sin errores manuales. Sin estrés de fin de mes.**

## Errores comunes al declarar el ATS

- **IVA incorrecto**: el monto de IVA reportado no coincide con la base imponible × la tasa vigente
- **Formas de pago**: olvidar reportar la forma de pago cuando la suma de bases supera $500
- **Secuencial duplicado**: dos facturas con el mismo número — por eso el control de secuenciales es crítico

¿Quieres que LedgerPro genere tu ATS automáticamente cada mes? [Prueba 30 días gratis](/planes).
    `
  },
  {
    id: 'facturacion-electronica-obligatoria-ecuador',
    title: 'Facturación electrónica obligatoria en Ecuador: todo lo que necesitas saber',
    excerpt: 'Desde 2023, prácticamente todos los contribuyentes en Ecuador deben emitir comprobantes electrónicos. ¿Ya estás cumpliendo? Te explicamos los requisitos, plazos y cómo hacerlo fácil.',
    date: '2026-05-22',
    readTime: '6 min',
    category: 'Facturación SRI',
    color: 'bg-emerald-100 text-emerald-700',
    content: `
## La facturación electrónica es obligatoria en Ecuador

El **SRI** exige que todos los contribuyentes emitan comprobantes electrónicos: facturas, notas de crédito, notas de débito, retenciones y guías de remisión.

**¿Qué pasa si no cumples?**
- Multas del SRI
- Clausura del establecimiento
- No puedes deducir gastos sin comprobante válido

## Tipos de comprobantes electrónicos

| Comprobante | Cuándo usarlo |
|---|---|
| **Factura** | Venta de bienes o servicios |
| **Nota de crédito** | Devoluciones o descuentos post-factura |
| **Nota de débito** | Cargos adicionales sobre una factura |
| **Retención** | Cuando eres agente de retención |
| **Guía de remisión** | Traslado de mercancía |

## Cómo funciona el proceso

1. Generas el comprobante en tu sistema
2. El sistema firma digitalmente con tu clave .p12 (firma electrónica)
3. Se envía al SRI en línea
4. El SRI autoriza con una clave de acceso de 49 dígitos
5. El comprobante llega al correo de tu cliente en PDF y XML

## ¿Cuánto cuesta la firma electrónica?

La firma electrónica (.p12) la emite el Banco Central del Ecuador o el Security Data. Cuesta alrededor de $30 y tiene vigencia de 2 años.

## Cómo empezar con Corina ERP

Con **Corina ERP** de Billennium System:
- Subes tu firma electrónica (.p12) una sola vez
- Configuras tu empresa con tu RUC
- Empiezas a facturar en minutos

**El primer mes es gratis.** [Ver planes](/planes)
    `
  },
  {
    id: 'contadores-herramienta-nube-ecuador',
    title: 'Por qué los contadores ecuatorianos están migrando a herramientas en la nube',
    excerpt: 'Los contadores que manejan múltiples clientes pierden horas cada mes en tareas manuales que un buen sistema en la nube resuelve en minutos. Aquí te contamos cómo y por qué hacer el cambio.',
    date: '2026-05-29',
    readTime: '4 min',
    category: 'Contabilidad',
    color: 'bg-violet-100 text-violet-700',
    content: `
## El problema del contador con muchos clientes

Si manejas la contabilidad de 10 o más clientes, probablemente conoces este ciclo mensual:

- Recopilar facturas físicas o en PDF de cada cliente
- Digitar compras en el sistema
- Generar el ATS uno por uno
- Verificar que cuadren con las declaraciones

Esto puede consumir 2-3 días de trabajo por cliente al mes.

## Cómo la nube cambia el juego

Con **LedgerPro** conectado a **Corina ERP**:

1. **Las ventas se sincronizan automáticamente** — no hay que digitar
2. **Las compras se importan desde el portal SRI** con un clic
3. **El ATS se genera en segundos** — sin errores manuales
4. **Los estados financieros están disponibles siempre** — el cliente los ve en tiempo real

## La propuesta para contadores de Billennium

Si al menos 3 de tus clientes facturan con **Corina ERP**, tú usas **LedgerPro gratis**.

Esto significa:
- $0/mes para ti mientras mantengas esa base de clientes
- Toda la contabilidad de tus clientes centralizada
- El ATS de todos tus clientes en un solo lugar
- Más tiempo para hacer crecer tu cartera

**¿Cuántos clientes manejas actualmente?** [Escríbenos y te hacemos una propuesta personalizada](/contacto).
    `
  },
  {
    id: 'que-es-quickinvoice-billennium-system',
    title: 'Corina ERP: el sistema de facturación electrónica que ordena tu negocio',
    excerpt: 'Corina ERP, desarrollado por Billennium System, es un sistema de facturación electrónica y gestión empresarial que ayuda a negocios y profesionales a facturar con más orden, menos errores y mayor control.',
    date: '2026-07-28',
    readTime: '6 min',
    category: 'Software Empresarial',
    color: 'bg-amber-100 text-amber-700',
    content: `
Llevar la facturación y la información de un negocio en hojas de cálculo, correos sueltos y documentos dispersos tiene un costo silencioso: errores, tiempo perdido y falta de control. **Corina ERP**, el sistema de facturación electrónica y gestión empresarial desarrollado por **Billennium System**, nace precisamente para resolver eso: ayudar a negocios y profesionales a emitir comprobantes, organizar sus operaciones y tener una visión clara de su información, sin procesos manuales que frenen el crecimiento.

## Qué es Corina ERP y cómo ayuda a tu negocio

Corina ERP es una plataforma pensada para simplificar los procesos que normalmente consumen más tiempo dentro de una empresa: la emisión de comprobantes electrónicos, la organización de clientes y documentos, y el seguimiento de la operación diaria. En lugar de depender de herramientas separadas que no se comunican entre sí, Corina ERP centraliza ese trabajo en un solo lugar, ayudando a que el negocio gane en eficiencia y control.

## Una solución para distintos tipos de negocio

Corina ERP no fue diseñado para una sola industria. Su enfoque es adaptarse a la forma de trabajar de cada cliente, en lugar de obligarlo a cambiar su operación para encajar en el sistema. Por eso es una opción válida para:

- Profesionales independientes
- Pequeñas y medianas empresas
- Distribuidores
- Negocios de servicios
- Empresas comerciales
- Cualquier empresa que necesite más orden en su facturación y seguimiento

## Qué problema resuelve Corina ERP

Muchas empresas todavía gestionan parte de su información en hojas de cálculo, correos electrónicos y documentos aislados. Esa forma de trabajar suele traer consecuencias concretas:

- Errores en la facturación
- Demoras en la atención al cliente
- Falta de control sobre ventas y documentos
- Dificultad para revisar reportes con claridad
- Riesgos de incumplimiento tributario o administrativo

Corina ERP busca centralizar ese trabajo en una sola plataforma, para que el día a día del negocio tenga más orden y menos fricción.

## Principales beneficios de Corina ERP

### 1. Emisión de facturas más rápida
El sistema permite generar comprobantes electrónicos de forma más ágil, reduciendo pasos manuales y haciendo el proceso más simple para quien lo usa.

### 2. Mejor control de la información
Al tener los datos organizados dentro de una sola plataforma, la empresa puede consultar clientes, documentos, ventas y reportes con mayor facilidad.

### 3. Menos errores operativos
Cuando un proceso se automatiza correctamente, se reducen los errores en números, datos de clientes, valores, impuestos o secuencias.

### 4. Acceso desde la nube
Al ser una solución desarrollada por Billennium System, Corina ERP puede operar como sistema en la nube, lo que facilita trabajar desde distintos lugares y dispositivos, según la configuración del negocio.

### 5. Escalabilidad
Un negocio puede empezar usando funciones básicas y, con el tiempo, crecer hacia una operación más completa, incorporando nuevos módulos o integraciones según lo que necesite.

## Para quién es útil Corina ERP

Corina ERP puede ser una buena opción si tu negocio necesita:

- Facturar de forma más ordenada
- Reducir el trabajo manual
- Centralizar clientes y documentos
- Tener reportes más claros
- Prepararse para crecer sin complicarse con sistemas dispersos

También es una alternativa útil para profesionales que buscan un sistema más serio y confiable para manejar su operación diaria.

## Por qué importa que Billennium System esté detrás de Corina ERP

No solo importa el software, también importa quién lo respalda. Corina ERP forma parte de una visión más amplia de **Billennium System** enfocada en soluciones tecnológicas para empresas. Eso le da al producto una base más sólida para seguir evolucionando, ofrecer soporte real y continuar sumando funcionalidades con el tiempo.

## Conclusión

Corina ERP es más que una herramienta para emitir facturas: es una plataforma pensada para ayudar a negocios y profesionales a trabajar con más orden, menos errores y mejor control. Si buscas una solución que unifique procesos y te permita operar con mayor eficiencia, Corina ERP, de Billennium System, puede ser la alternativa que tu negocio necesita.

**¿Quieres conocer cómo Corina ERP puede adaptarse a la operación de tu negocio?** [Contáctanos y descubre cómo empezar](/contacto).
    `
  }
];

export const Blog = () => {
  return (
    <div className="min-h-screen bg-slate-50 py-16">
      <div className="container mx-auto px-4 max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <span className="inline-block px-4 py-2 rounded-full bg-blue-100 text-blue-700 text-sm font-medium mb-4">
            Blog
          </span>
          <h1 className="text-4xl font-bold text-slate-900 mb-4">
            Guías y recursos para tu negocio
          </h1>
          <p className="text-lg text-slate-500 max-w-2xl mx-auto">
            Facturación electrónica, contabilidad y tecnología para pymes ecuatorianas. Todo lo que necesitas saber para cumplir con el SRI y hacer crecer tu empresa.
          </p>
        </motion.div>

        <div className="grid gap-8">
          {articles.map((art, i) => (
            <motion.article
              key={art.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-shadow"
            >
              <div className="p-8">
                <div className="flex items-center gap-3 mb-4">
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full ${art.color}`}>
                    {art.category}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(art.date).toLocaleDateString('es-EC', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-slate-400">
                    <Clock className="w-3.5 h-3.5" />
                    {art.readTime} de lectura
                  </span>
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-3 leading-snug">
                  {art.title}
                </h2>
                <p className="text-slate-500 mb-6 leading-relaxed">
                  {art.excerpt}
                </p>
                <Link
                  to={`/blog/${art.id}`}
                  className="inline-flex items-center gap-2 text-blue-600 font-semibold hover:text-blue-700 transition-colors"
                >
                  Leer artículo <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </motion.article>
          ))}
        </div>

        <div className="mt-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl p-8 text-white text-center">
          <BookOpen className="w-10 h-10 mx-auto mb-4 opacity-80" />
          <h3 className="text-2xl font-bold mb-2">¿Tienes dudas sobre facturación o contabilidad?</h3>
          <p className="text-blue-100 mb-6">Escríbenos y te ayudamos sin costo.</p>
          <Link
            to="/contacto"
            className="inline-flex items-center gap-2 bg-white text-blue-600 font-bold px-6 py-3 rounded-full hover:bg-blue-50 transition-colors"
          >
            Contactar ahora <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
};

export { articles };
