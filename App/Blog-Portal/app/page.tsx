import Link from 'next/link';
import { Calendar, Clock, ArrowRight, BookOpen } from 'lucide-react';
import { getAllPosts } from '../lib/queries';

export const revalidate = 3600; // fallback si el webhook de Sanity falla por algún motivo

export default async function BlogIndexPage() {
  const posts = await getAllPosts();

  return (
    <div className="min-h-screen bg-slate-50 py-16">
      <div className="container mx-auto px-4 max-w-5xl">
        <div className="text-center mb-12">
          <span className="inline-block px-4 py-2 rounded-full bg-blue-100 text-blue-700 text-sm font-medium mb-4">
            Blog
          </span>
          <h1 className="text-4xl font-bold text-slate-900 mb-4">Guías y recursos para tu negocio</h1>
          <p className="text-lg text-slate-500 max-w-2xl mx-auto">
            Facturación electrónica, contabilidad y tecnología para pymes ecuatorianas. Todo lo que necesitas saber
            para cumplir con el SRI y hacer crecer tu empresa.
          </p>
        </div>

        {posts.length === 0 ? (
          <p className="text-center text-slate-400 py-12">
            Aún no hay artículos publicados. (Si esto es inesperado, revisa que las credenciales de Sanity estén
            configuradas y que haya al menos un post publicado.)
          </p>
        ) : (
          <div className="grid gap-8">
            {posts.map((post) => (
              <article
                key={post._id}
                className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="p-8">
                  <div className="flex items-center gap-3 mb-4">
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full ${post.color}`}>
                      {post.category}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-slate-400">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(post.publishedAt).toLocaleDateString('es-EC', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </span>
                    {post.readTime && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Clock className="w-3.5 h-3.5" />
                        {post.readTime} min de lectura
                      </span>
                    )}
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-3 leading-snug">{post.title}</h2>
                  <p className="text-slate-500 mb-6 leading-relaxed">{post.excerpt}</p>
                  <Link
                    href={`/${post.slug}`}
                    className="inline-flex items-center gap-2 text-blue-600 font-semibold hover:text-blue-700 transition-colors"
                  >
                    Leer artículo <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}

        <div className="mt-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl p-8 text-white text-center">
          <BookOpen className="w-10 h-10 mx-auto mb-4 opacity-80" />
          <h3 className="text-2xl font-bold mb-2">¿Tienes dudas sobre facturación o contabilidad?</h3>
          <p className="text-blue-100 mb-6">Escríbenos y te ayudamos sin costo.</p>
          <a
            href="https://www.billenniumsystem.com/contacto"
            className="inline-flex items-center gap-2 bg-white text-blue-600 font-bold px-6 py-3 rounded-full hover:bg-blue-50 transition-colors"
          >
            Contactar ahora <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
