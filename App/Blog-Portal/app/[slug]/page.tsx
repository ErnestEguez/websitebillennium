import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, Calendar, Clock } from 'lucide-react';
import { getAllPosts, getAllSlugs, getPostBySlug } from '../../lib/queries';
import { urlForImage } from '../../lib/sanity.image';
import { PortableTextRenderer } from '../../components/PortableTextRenderer';

export const revalidate = 3600; // fallback si el webhook de Sanity falla

interface Props {
  params: Promise<{ slug: string }>;
}

// Pre-genera todas las páginas conocidas en build time; los artículos nuevos
// publicados después se generan on-demand en el primer request (ISR) y
// quedan cacheados desde ahí.
export async function generateStaticParams() {
  const slugs = await getAllSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return {};

  const title = post.seoTitle || post.title;
  const description = post.seoDescription || post.excerpt;
  const ogImageUrl = urlForImage(post.ogImage)?.width(1200).height(630).url();

  return {
    title,
    description,
    alternates: { canonical: `/${post.slug}` },
    openGraph: {
      title,
      description,
      type: 'article',
      publishedTime: post.publishedAt,
      url: `/${post.slug}`,
      images: ogImageUrl ? [{ url: ogImageUrl, width: 1200, height: 630 }] : undefined,
    },
    twitter: {
      card: ogImageUrl ? 'summary_large_image' : 'summary',
      title,
      description,
      images: ogImageUrl ? [ogImageUrl] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  const otherPosts = (await getAllPosts()).filter((p) => p.slug !== slug).slice(0, 2);

  return (
    <div className="min-h-screen bg-slate-50 py-12">
      <div className="container mx-auto px-4 max-w-3xl">
        <Link href="/" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-700 mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Volver al blog
        </Link>

        <article className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-8 md:p-12">
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <span className={`text-xs font-semibold px-3 py-1 rounded-full ${post.color}`}>{post.category}</span>
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Calendar className="w-3.5 h-3.5" />
                {new Date(post.publishedAt).toLocaleDateString('es-EC', { year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
              {post.readTime && (
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Clock className="w-3.5 h-3.5" />
                  {post.readTime} min de lectura
                </span>
              )}
            </div>

            <h1 className="text-3xl md:text-4xl font-bold text-slate-900 leading-tight mb-6">{post.title}</h1>

            <p className="text-lg text-slate-500 border-l-4 border-blue-500 pl-4 mb-8 italic">{post.excerpt}</p>

            <PortableTextRenderer value={post.body} />
          </div>
        </article>

        <div className="mt-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl p-8 text-white text-center">
          <h3 className="text-xl font-bold mb-2">¿Listo para simplificar tu facturación y contabilidad?</h3>
          <p className="text-blue-100 mb-5 text-sm">30 días gratis · Sin tarjeta de crédito · Cancela cuando quieras</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <a
              href="https://www.billenniumsystem.com/planes"
              className="bg-white text-blue-600 font-bold px-6 py-2.5 rounded-full hover:bg-blue-50 transition-colors text-sm"
            >
              Ver planes y precios
            </a>
            <a
              href="https://www.billenniumsystem.com/contacto"
              className="border border-white/40 text-white font-medium px-6 py-2.5 rounded-full hover:bg-white/10 transition-colors text-sm"
            >
              Hablar con nosotros
            </a>
          </div>
        </div>

        {otherPosts.length > 0 && (
          <div className="mt-10">
            <h3 className="text-lg font-bold text-slate-700 mb-4">También te puede interesar</h3>
            <div className="grid md:grid-cols-2 gap-4">
              {otherPosts.map((p) => (
                <Link
                  key={p._id}
                  href={`/${p.slug}`}
                  className="bg-white rounded-xl border border-slate-100 p-5 hover:shadow-md transition-shadow group"
                >
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${p.color} mb-2 inline-block`}>
                    {p.category}
                  </span>
                  <p className="text-sm font-semibold text-slate-800 leading-snug group-hover:text-blue-600 transition-colors mb-1">
                    {p.title}
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
}
