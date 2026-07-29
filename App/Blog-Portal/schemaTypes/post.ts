import { defineField, defineType } from 'sanity';

// Mismas categorías/colores que ya usaba el array hardcodeado en el CRA
// (frontend/src/pages/Blog.js) — así los 4 artículos migrados no necesitan
// inventar valores nuevos.
const CATEGORIAS = [
  { title: 'Tributación', value: 'Tributación' },
  { title: 'Facturación SRI', value: 'Facturación SRI' },
  { title: 'Contabilidad', value: 'Contabilidad' },
  { title: 'Software Empresarial', value: 'Software Empresarial' },
];

const COLORES = [
  { title: 'Azul', value: 'bg-blue-100 text-blue-700' },
  { title: 'Verde', value: 'bg-emerald-100 text-emerald-700' },
  { title: 'Violeta', value: 'bg-violet-100 text-violet-700' },
  { title: 'Ámbar', value: 'bg-amber-100 text-amber-700' },
];

export const postType = defineType({
  name: 'post',
  title: 'Artículo de Blog',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Título',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug (URL)',
      type: 'slug',
      description:
        'Define la URL final: billenniumsystem.com/blog/ESTE-VALOR. Al migrar un artículo existente, debe coincidir EXACTAMENTE con el id actual para no romper enlaces ya compartidos ni el SEO.',
      options: { source: 'title', maxLength: 96 },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'excerpt',
      title: 'Resumen (se muestra en el listado)',
      type: 'text',
      rows: 3,
      validation: (Rule) => Rule.required().max(300),
    }),
    defineField({
      name: 'publishedAt',
      title: 'Fecha de publicación',
      type: 'datetime',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'readTime',
      title: 'Tiempo de lectura (minutos)',
      type: 'number',
      description: 'Déjalo vacío y se calcula automáticamente a partir del contenido.',
    }),
    defineField({
      name: 'category',
      title: 'Categoría',
      type: 'string',
      options: { list: CATEGORIAS, layout: 'dropdown' },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'color',
      title: 'Color del badge',
      type: 'string',
      options: { list: COLORES },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'body',
      title: 'Contenido',
      type: 'array',
      of: [
        { type: 'block' },
        { type: 'image', options: { hotspot: true } },
        { type: 'table' },
      ],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'seoTitle',
      title: 'SEO — Title tag',
      type: 'string',
      description: 'Si lo dejas vacío, se usa el Título de arriba.',
      validation: (Rule) => Rule.max(70),
    }),
    defineField({
      name: 'seoDescription',
      title: 'SEO — Meta description',
      type: 'text',
      rows: 2,
      description: 'Si lo dejas vacío, se usa el Resumen. Máximo ~160 caracteres para que Google no la corte.',
      validation: (Rule) => Rule.max(160),
    }),
    defineField({
      name: 'ogImage',
      title: 'Imagen para redes sociales (Open Graph)',
      type: 'image',
      description: 'Se muestra al compartir el link en WhatsApp, Facebook, Twitter/X, LinkedIn. Ideal 1200x630px.',
      options: { hotspot: true },
    }),
  ],
  preview: {
    select: { title: 'title', subtitle: 'category', media: 'ogImage' },
  },
});
