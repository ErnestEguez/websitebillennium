// Migra los artículos que hoy viven hardcodeados en
// frontend/src/pages/Blog.js hacia Sanity, preservando slug y fecha
// originales (clave para no perder SEO/enlaces ya compartidos — ver el plan
// acordado). Convierte el mini-Markdown casero (##, ###, -, |tabla|, **, [])
// a Portable Text real.
//
// Uso:
//   cd App/Blog-Portal
//   SANITY_API_READ_TOKEN=xxxx npm run migrate:posts
//
// Requiere NEXT_PUBLIC_SANITY_PROJECT_ID / NEXT_PUBLIC_SANITY_DATASET en
// el entorno (o en .env.local) y un token de Sanity con permiso de escritura
// (Settings → API → Tokens → Editor).

import { createClient } from '@sanity/client';

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production';
const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION || '2025-01-01';
const token = process.env.SANITY_API_READ_TOKEN;

if (!projectId || !token) {
  console.error(
    '[migrate] Faltan credenciales. Define NEXT_PUBLIC_SANITY_PROJECT_ID y SANITY_API_READ_TOKEN antes de correr este script.'
  );
  process.exit(1);
}

const client = createClient({ projectId, dataset, apiVersion, token, useCdn: false });

// ── Los 4 artículos originales, copiados 1:1 desde frontend/src/pages/Blog.js ──
// IMPORTANTE: los "id" de abajo deben coincidir EXACTO con los ids actuales
// (son la URL: /blog/<id>) para no romper enlaces/SEO ya indexado.
const articles = [
  {
    id: 'que-es-ats-ecuador',
    title: 'Qué es el ATS y cómo declararlo paso a paso en Ecuador 2026',
    excerpt:
      'El Anexo Transaccional Simplificado (ATS) es obligatorio para contribuyentes especiales y sociedades en Ecuador. Te explicamos qué es, quién debe presentarlo y cómo generarlo sin errores.',
    date: '2026-05-15',
    readTime: 5,
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

- **Ventas** — todas las facturas emitidas en el período, agrupadas por tipo de comprobante
- **Compras** — todas las facturas de proveedores y comprobantes de retención emitidos
- **Retenciones recibidas** — los comprobantes de retención que te hicieron tus clientes

## Cómo generarlo con LedgerPro

Con **LedgerPro** de Billennium System, el ATS se genera automáticamente:

- Importa tus comprobantes de compra desde el portal del SRI
- Si usas QuickInvoice, tus ventas se sincronizan automáticamente
- Haz clic en **"Generar ATS"** y descarga el XML listo para subir al DIMM del SRI

**Sin digitar. Sin errores manuales. Sin estrés de fin de mes.**

## Errores comunes al declarar el ATS

- **IVA incorrecto**: el monto de IVA reportado no coincide con la base imponible × la tasa vigente
- **Formas de pago**: olvidar reportar la forma de pago cuando la suma de bases supera $500
- **Secuencial duplicado**: dos facturas con el mismo número — por eso el control de secuenciales es crítico

¿Quieres que LedgerPro genere tu ATS automáticamente cada mes? [Prueba 30 días gratis](https://www.billenniumsystem.com/planes).
    `,
  },
  {
    id: 'facturacion-electronica-obligatoria-ecuador',
    title: 'Facturación electrónica obligatoria en Ecuador: todo lo que necesitas saber',
    excerpt:
      'Desde 2023, prácticamente todos los contribuyentes en Ecuador deben emitir comprobantes electrónicos. ¿Ya estás cumpliendo? Te explicamos los requisitos, plazos y cómo hacerlo fácil.',
    date: '2026-05-22',
    readTime: 6,
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

- Generas el comprobante en tu sistema
- El sistema firma digitalmente con tu clave .p12 (firma electrónica)
- Se envía al SRI en línea
- El SRI autoriza con una clave de acceso de 49 dígitos
- El comprobante llega al correo de tu cliente en PDF y XML

## ¿Cuánto cuesta la firma electrónica?

La firma electrónica (.p12) la emite el Banco Central del Ecuador o el Security Data. Cuesta alrededor de $30 y tiene vigencia de 2 años.

## Cómo empezar con QuickInvoice

Con **QuickInvoice** de Billennium System:
- Subes tu firma electrónica (.p12) una sola vez
- Configuras tu empresa con tu RUC
- Empiezas a facturar en minutos

**El primer mes es gratis.** [Ver planes](https://www.billenniumsystem.com/planes)
    `,
  },
  {
    id: 'contadores-herramienta-nube-ecuador',
    title: 'Por qué los contadores ecuatorianos están migrando a herramientas en la nube',
    excerpt:
      'Los contadores que manejan múltiples clientes pierden horas cada mes en tareas manuales que un buen sistema en la nube resuelve en minutos. Aquí te contamos cómo y por qué hacer el cambio.',
    date: '2026-05-29',
    readTime: 4,
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

Con **LedgerPro** conectado a **QuickInvoice**:

- **Las ventas se sincronizan automáticamente** — no hay que digitar
- **Las compras se importan desde el portal SRI** con un clic
- **El ATS se genera en segundos** — sin errores manuales
- **Los estados financieros están disponibles siempre** — el cliente los ve en tiempo real

## La propuesta para contadores de Billennium

Si al menos 3 de tus clientes facturan con **QuickInvoice**, tú usas **LedgerPro gratis**.

Esto significa:
- $0/mes para ti mientras mantengas esa base de clientes
- Toda la contabilidad de tus clientes centralizada
- El ATS de todos tus clientes en un solo lugar
- Más tiempo para hacer crecer tu cartera

**¿Cuántos clientes manejas actualmente?** [Escríbenos y te hacemos una propuesta personalizada](https://www.billenniumsystem.com/contacto).
    `,
  },
  {
    id: 'que-es-quickinvoice-billennium-system',
    title: 'QuickInvoice: el sistema de facturación electrónica que ordena tu negocio',
    excerpt:
      'QuickInvoice, desarrollado por Billennium System, es un sistema de facturación electrónica y gestión empresarial que ayuda a negocios y profesionales a facturar con más orden, menos errores y mayor control.',
    date: '2026-07-28',
    readTime: 6,
    category: 'Software Empresarial',
    color: 'bg-amber-100 text-amber-700',
    content: `
Llevar la facturación y la información de un negocio en hojas de cálculo, correos sueltos y documentos dispersos tiene un costo silencioso: errores, tiempo perdido y falta de control. **QuickInvoice**, el sistema de facturación electrónica y gestión empresarial desarrollado por **Billennium System**, nace precisamente para resolver eso: ayudar a negocios y profesionales a emitir comprobantes, organizar sus operaciones y tener una visión clara de su información, sin procesos manuales que frenen el crecimiento.

## Qué es QuickInvoice y cómo ayuda a tu negocio

QuickInvoice es una plataforma pensada para simplificar los procesos que normalmente consumen más tiempo dentro de una empresa: la emisión de comprobantes electrónicos, la organización de clientes y documentos, y el seguimiento de la operación diaria. En lugar de depender de herramientas separadas que no se comunican entre sí, QuickInvoice centraliza ese trabajo en un solo lugar, ayudando a que el negocio gane en eficiencia y control.

## Una solución para distintos tipos de negocio

QuickInvoice no fue diseñado para una sola industria. Su enfoque es adaptarse a la forma de trabajar de cada cliente, en lugar de obligarlo a cambiar su operación para encajar en el sistema. Por eso es una opción válida para:

- Profesionales independientes
- Pequeñas y medianas empresas
- Distribuidores
- Negocios de servicios
- Empresas comerciales
- Cualquier empresa que necesite más orden en su facturación y seguimiento

## Qué problema resuelve QuickInvoice

Muchas empresas todavía gestionan parte de su información en hojas de cálculo, correos electrónicos y documentos aislados. Esa forma de trabajar suele traer consecuencias concretas:

- Errores en la facturación
- Demoras en la atención al cliente
- Falta de control sobre ventas y documentos
- Dificultad para revisar reportes con claridad
- Riesgos de incumplimiento tributario o administrativo

QuickInvoice busca centralizar ese trabajo en una sola plataforma, para que el día a día del negocio tenga más orden y menos fricción.

## Principales beneficios de QuickInvoice

### 1. Emisión de facturas más rápida
El sistema permite generar comprobantes electrónicos de forma más ágil, reduciendo pasos manuales y haciendo el proceso más simple para quien lo usa.

### 2. Mejor control de la información
Al tener los datos organizados dentro de una sola plataforma, la empresa puede consultar clientes, documentos, ventas y reportes con mayor facilidad.

### 3. Menos errores operativos
Cuando un proceso se automatiza correctamente, se reducen los errores en números, datos de clientes, valores, impuestos o secuencias.

### 4. Acceso desde la nube
Al ser una solución desarrollada por Billennium System, QuickInvoice puede operar como sistema en la nube, lo que facilita trabajar desde distintos lugares y dispositivos, según la configuración del negocio.

### 5. Escalabilidad
Un negocio puede empezar usando funciones básicas y, con el tiempo, crecer hacia una operación más completa, incorporando nuevos módulos o integraciones según lo que necesite.

## Para quién es útil QuickInvoice

QuickInvoice puede ser una buena opción si tu negocio necesita:

- Facturar de forma más ordenada
- Reducir el trabajo manual
- Centralizar clientes y documentos
- Tener reportes más claros
- Prepararse para crecer sin complicarse con sistemas dispersos

También es una alternativa útil para profesionales que buscan un sistema más serio y confiable para manejar su operación diaria.

## Por qué importa que Billennium System esté detrás de QuickInvoice

No solo importa el software, también importa quién lo respalda. QuickInvoice forma parte de una visión más amplia de **Billennium System** enfocada en soluciones tecnológicas para empresas. Eso le da al producto una base más sólida para seguir evolucionando, ofrecer soporte real y continuar sumando funcionalidades con el tiempo.

## Conclusión

QuickInvoice es más que una herramienta para emitir facturas: es una plataforma pensada para ayudar a negocios y profesionales a trabajar con más orden, menos errores y mejor control. Si buscas una solución que unifique procesos y te permita operar con mayor eficiencia, QuickInvoice, de Billennium System, puede ser la alternativa que tu negocio necesita.

**¿Quieres conocer cómo QuickInvoice puede adaptarse a la operación de tu negocio?** [Contáctanos y descubre cómo empezar](https://www.billenniumsystem.com/contacto).
    `,
  },
];

// ── Fallbacks de SEO para los migrados (el operador los puede afinar luego desde Sanity Studio) ──
const seoOverrides = {
  'que-es-ats-ecuador': {
    seoTitle: 'Qué es el ATS en Ecuador y cómo declararlo paso a paso (2026)',
    seoDescription:
      'Guía práctica del Anexo Transaccional Simplificado (ATS): quién debe presentarlo, qué incluye y cómo generarlo sin errores con LedgerPro.',
  },
  'facturacion-electronica-obligatoria-ecuador': {
    seoTitle: 'Facturación electrónica obligatoria en Ecuador: guía completa',
    seoDescription:
      'Requisitos, tipos de comprobantes y plazos de la facturación electrónica en Ecuador. Cómo cumplir fácil con QuickInvoice de Billennium System.',
  },
  'contadores-herramienta-nube-ecuador': {
    seoTitle: 'Por qué los contadores en Ecuador migran a herramientas en la nube',
    seoDescription:
      'Cómo LedgerPro y QuickInvoice ahorran horas mensuales a contadores que manejan múltiples clientes en Ecuador.',
  },
  'que-es-quickinvoice-billennium-system': {
    seoTitle: 'QuickInvoice: sistema de facturación electrónica | Billennium System',
    seoDescription:
      'QuickInvoice, de Billennium System, es un sistema de facturación electrónica y gestión empresarial que reduce errores y centraliza tu operación.',
  },
};

// ── Mini-Markdown → Portable Text ──────────────────────────────────────────

function tokenizeInline(text) {
  const tokens = [];
  let rest = text;
  const pattern = /(\*\*(.+?)\*\*)|(\[([^\]]+)\]\(([^)]+)\))/;
  while (rest.length > 0) {
    const m = rest.match(pattern);
    if (!m) {
      tokens.push({ text: rest });
      break;
    }
    if (m.index > 0) tokens.push({ text: rest.slice(0, m.index) });
    if (m[1]) tokens.push({ text: m[2], bold: true });
    else tokens.push({ text: m[4], href: m[5] });
    rest = rest.slice(m.index + m[0].length);
  }
  return tokens;
}

let keySeq = 0;
const nextKey = (prefix) => `${prefix}${keySeq++}`;

function buildChildren(tokens) {
  const markDefs = [];
  const children = tokens.map((t) => {
    const marks = [];
    if (t.bold) marks.push('strong');
    if (t.href) {
      const key = nextKey('link');
      markDefs.push({ _key: key, _type: 'link', href: t.href });
      marks.push(key);
    }
    return { _type: 'span', _key: nextKey('span'), text: t.text, marks };
  });
  return { children, markDefs };
}

function textBlock(style, text, extra = {}) {
  const { children, markDefs } = buildChildren(tokenizeInline(text));
  return { _type: 'block', _key: nextKey('block'), style, children, markDefs, ...extra };
}

function markdownToPortableText(markdown) {
  const lines = markdown.trim().split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (!line) {
      i++;
      continue;
    }

    if (line.startsWith('## ')) {
      blocks.push(textBlock('h2', line.slice(3)));
      i++;
      continue;
    }
    if (line.startsWith('### ')) {
      blocks.push(textBlock('h3', line.slice(4)));
      i++;
      continue;
    }
    if (line.startsWith('- ')) {
      while (i < lines.length && lines[i].trim().startsWith('- ')) {
        blocks.push(textBlock('normal', lines[i].trim().slice(2), { listItem: 'bullet', level: 1 }));
        i++;
      }
      continue;
    }
    if (line.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const raw = lines[i].trim();
        if (!raw.includes('---')) {
          rows.push(raw.split('|').map((c) => c.trim()).filter((c) => c.length > 0));
        }
        i++;
      }
      blocks.push({ _type: 'table', _key: nextKey('table'), rows: rows.map((cells) => ({ cells })) });
      continue;
    }

    blocks.push(textBlock('normal', line));
    i++;
  }

  return blocks;
}

// ── Ejecutar migración ──────────────────────────────────────────────────────

async function migrate() {
  console.log(`[migrate] Proyecto Sanity: ${projectId} / dataset: ${dataset}`);
  console.log(`[migrate] Migrando ${articles.length} artículos...\n`);

  for (const article of articles) {
    keySeq = 0; // keys únicas por documento, no hace falta que sean globales
    const seo = seoOverrides[article.id] ?? {};
    const doc = {
      _id: `post-${article.id}`, // id determinístico: correr el script 2 veces actualiza, no duplica
      _type: 'post',
      title: article.title,
      slug: { _type: 'slug', current: article.id },
      excerpt: article.excerpt,
      publishedAt: new Date(`${article.date}T12:00:00.000Z`).toISOString(),
      readTime: article.readTime,
      category: article.category,
      color: article.color,
      body: markdownToPortableText(article.content),
      seoTitle: seo.seoTitle ?? article.title,
      seoDescription: seo.seoDescription ?? article.excerpt.slice(0, 160),
    };

    await client.createOrReplace(doc);
    console.log(`[migrate] ✓ ${article.id}`);
  }

  console.log('\n[migrate] Listo. Revisa los 4 artículos en Sanity Studio (/studio) antes de publicar el rewrite.');
  console.log('[migrate] Nota: quedaron como documentos publicados (createOrReplace), no como drafts.');
}

migrate().catch((err) => {
  console.error('[migrate] Error:', err);
  process.exit(1);
});
