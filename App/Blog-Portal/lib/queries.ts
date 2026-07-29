import { sanityClient } from './sanity.client';
import type { PostFull, PostSummary } from './types';

const SUMMARY_PROJECTION = `{
  _id,
  title,
  "slug": slug.current,
  excerpt,
  publishedAt,
  readTime,
  category,
  color
}`;

const FULL_PROJECTION = `{
  ${SUMMARY_PROJECTION.slice(1, -1)},
  body,
  seoTitle,
  seoDescription,
  ogImage
}`;

// Todas las funciones devuelven [] / null si Sanity no está configurado
// todavía (ver lib/sanity.env.ts) — así el sitio no truena mientras se
// completa la migración, solo muestra un blog vacío.

export async function getAllPosts(): Promise<PostSummary[]> {
  if (!sanityClient) return [];
  return sanityClient.fetch(
    `*[_type == "post" && defined(slug.current)] | order(publishedAt desc) ${SUMMARY_PROJECTION}`,
    {},
    { next: { revalidate: 3600, tags: ['post'] } }
  );
}

export async function getAllSlugs(): Promise<string[]> {
  if (!sanityClient) return [];
  return sanityClient.fetch(`*[_type == "post" && defined(slug.current)].slug.current`);
}

export async function getPostBySlug(slug: string): Promise<PostFull | null> {
  if (!sanityClient) return null;
  return sanityClient.fetch(
    `*[_type == "post" && slug.current == $slug][0] ${FULL_PROJECTION}`,
    { slug },
    { next: { revalidate: 3600, tags: [`post:${slug}`] } }
  );
}
