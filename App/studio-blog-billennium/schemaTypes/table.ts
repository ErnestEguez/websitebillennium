import { defineField, defineType } from 'sanity';

// Tipo custom simple para tablas dentro del contenido — Portable Text no
// trae tablas de fábrica. Necesario porque uno de los artículos migrados
// ("Facturación electrónica obligatoria...") tiene una tabla de comprobantes.
export const tableType = defineType({
  name: 'table',
  title: 'Tabla',
  type: 'object',
  fields: [
    defineField({
      name: 'rows',
      title: 'Filas',
      type: 'array',
      of: [
        {
          type: 'object',
          name: 'row',
          fields: [
            defineField({
              name: 'cells',
              title: 'Celdas',
              type: 'array',
              of: [{ type: 'string' }],
            }),
          ],
        },
      ],
    }),
  ],
  preview: {
    select: { rows: 'rows' },
    prepare({ rows }: { rows?: unknown[] }) {
      return { title: `Tabla (${rows?.length ?? 0} filas)` };
    },
  },
});
