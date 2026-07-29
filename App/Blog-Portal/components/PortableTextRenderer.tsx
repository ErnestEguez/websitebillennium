import { PortableText, type PortableTextComponents } from '@portabletext/react';
import type { PortableTextBlock } from '@portabletext/react';
import Image from 'next/image';
import { urlForImage } from '../lib/sanity.image';

// Mismos estilos que usaba el mini-parser Markdown casero de BlogPost.js
// (frontend/src/pages/BlogPost.js), pero ahora sobre Portable Text real —
// soporta cualquier formato que el editor use en Sanity, no un subconjunto
// fijo de sintaxis.
const components: PortableTextComponents = {
  block: {
    h2: ({ children }) => <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">{children}</h2>,
    h3: ({ children }) => <h3 className="text-xl font-bold text-slate-800 mt-6 mb-3">{children}</h3>,
    normal: ({ children }) => <p className="text-slate-600 leading-relaxed mb-4">{children}</p>,
  },
  list: {
    bullet: ({ children }) => <ul className="list-disc list-inside space-y-1 mb-4 text-slate-600">{children}</ul>,
    number: ({ children }) => <ol className="list-decimal list-inside space-y-1 mb-4 text-slate-600">{children}</ol>,
  },
  marks: {
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    link: ({ children, value }) => (
      <a href={value?.href} className="text-blue-600 hover:underline font-medium">
        {children}
      </a>
    ),
  },
  types: {
    image: ({ value }) => {
      const url = urlForImage(value)?.width(800).url();
      if (!url) return null;
      return (
        <div className="mb-6">
          <Image src={url} alt={value.alt || ''} width={800} height={450} className="rounded-xl w-full h-auto" />
        </div>
      );
    },
    table: ({ value }) => {
      const rows: { cells?: string[] }[] = value?.rows ?? [];
      if (rows.length === 0) return null;
      const [header, ...body] = rows;
      return (
        <div className="overflow-x-auto mb-6">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50">
                {(header?.cells ?? []).map((cell, i) => (
                  <th key={i} className="border border-slate-200 px-4 py-2 text-left font-semibold text-slate-700">
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  {(row.cells ?? []).map((cell, j) => (
                    <td key={j} className="border border-slate-200 px-4 py-2 text-slate-600">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    },
  },
};

export function PortableTextRenderer({ value }: { value: PortableTextBlock[] }) {
  return (
    <div className="prose-content">
      <PortableText value={value} components={components} />
    </div>
  );
}
