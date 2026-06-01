import { useParams, Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Calendar, Clock, ArrowRight } from 'lucide-react';
import { articles } from './Blog';

// Renderizador simple de markdown a JSX
function MarkdownContent({ text }) {
  const lines = text.trim().split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line) { i++; continue; }

    if (line.startsWith('## ')) {
      elements.push(<h2 key={i} className="text-2xl font-bold text-slate-900 mt-8 mb-4">{line.slice(3)}</h2>);
    } else if (line.startsWith('### ')) {
      elements.push(<h3 key={i} className="text-xl font-bold text-slate-800 mt-6 mb-3">{line.slice(4)}</h3>);
    } else if (line.startsWith('- ')) {
      // Collect list items
      const items = [];
      while (i < lines.length && lines[i].trim().startsWith('- ')) {
        items.push(lines[i].trim().slice(2));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="list-disc list-inside space-y-1 mb-4 text-slate-600">
          {items.map((item, j) => (
            <li key={j} dangerouslySetInnerHTML={{ __html: formatInline(item) }} />
          ))}
        </ul>
      );
      continue;
    } else if (line.startsWith('| ')) {
      // Table
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        if (!lines[i].includes('---')) rows.push(lines[i]);
        i++;
      }
      const headers = rows[0].split('|').filter(c => c.trim()).map(c => c.trim());
      const bodyRows = rows.slice(1);
      elements.push(
        <div key={`table-${i}`} className="overflow-x-auto mb-6">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50">
                {headers.map((h, j) => (
                  <th key={j} className="border border-slate-200 px-4 py-2 text-left font-semibold text-slate-700"
                    dangerouslySetInnerHTML={{ __html: formatInline(h) }} />
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, j) => (
                <tr key={j} className="hover:bg-slate-50">
                  {row.split('|').filter(c => c.trim()).map((cell, k) => (
                    <td key={k} className="border border-slate-200 px-4 py-2 text-slate-600"
                      dangerouslySetInnerHTML={{ __html: formatInline(cell.trim()) }} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    } else {
      elements.push(
        <p key={i} className="text-slate-600 leading-relaxed mb-4"
          dangerouslySetInnerHTML={{ __html: formatInline(line) }} />
      );
    }
    i++;
  }
  return <>{elements}</>;
}

function formatInline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-600 hover:underline font-medium">$1</a>');
}

export const BlogPost = () => {
  const { id } = useParams();
  const article = articles.find(a => a.id === id);

  if (!article) return <Navigate to="/blog" replace />;

  const otherArticles = articles.filter(a => a.id !== id).slice(0, 2);

  return (
    <div className="min-h-screen bg-slate-50 py-12">
      <div className="container mx-auto px-4 max-w-3xl">

        {/* Back */}
        <Link to="/blog" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-700 mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Volver al blog
        </Link>

        <motion.article
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden"
        >
          <div className="p-8 md:p-12">
            {/* Meta */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <span className={`text-xs font-semibold px-3 py-1 rounded-full ${article.color}`}>
                {article.category}
              </span>
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Calendar className="w-3.5 h-3.5" />
                {new Date(article.date).toLocaleDateString('es-EC', { year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Clock className="w-3.5 h-3.5" />
                {article.readTime} de lectura
              </span>
            </div>

            {/* Title */}
            <h1 className="text-3xl md:text-4xl font-bold text-slate-900 leading-tight mb-6">
              {article.title}
            </h1>

            {/* Excerpt highlight */}
            <p className="text-lg text-slate-500 border-l-4 border-blue-500 pl-4 mb-8 italic">
              {article.excerpt}
            </p>

            {/* Content */}
            <div className="prose-content">
              <MarkdownContent text={article.content} />
            </div>
          </div>
        </motion.article>

        {/* CTA */}
        <div className="mt-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl p-8 text-white text-center">
          <h3 className="text-xl font-bold mb-2">¿Listo para simplificar tu facturación y contabilidad?</h3>
          <p className="text-blue-100 mb-5 text-sm">30 días gratis · Sin tarjeta de crédito · Cancela cuando quieras</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <Link to="/planes" className="bg-white text-blue-600 font-bold px-6 py-2.5 rounded-full hover:bg-blue-50 transition-colors text-sm">
              Ver planes y precios
            </Link>
            <Link to="/contacto" className="border border-white/40 text-white font-medium px-6 py-2.5 rounded-full hover:bg-white/10 transition-colors text-sm">
              Hablar con nosotros
            </Link>
          </div>
        </div>

        {/* Other articles */}
        {otherArticles.length > 0 && (
          <div className="mt-10">
            <h3 className="text-lg font-bold text-slate-700 mb-4">También te puede interesar</h3>
            <div className="grid md:grid-cols-2 gap-4">
              {otherArticles.map(a => (
                <Link key={a.id} to={`/blog/${a.id}`}
                  className="bg-white rounded-xl border border-slate-100 p-5 hover:shadow-md transition-shadow group">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${a.color} mb-2 inline-block`}>
                    {a.category}
                  </span>
                  <p className="text-sm font-semibold text-slate-800 leading-snug group-hover:text-blue-600 transition-colors mb-1">
                    {a.title}
                  </p>
                  <span className="text-xs text-blue-600 flex items-center gap-1 mt-2">
                    Leer <ArrowRight className="w-3 h-3" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
