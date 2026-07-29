import type { PortableTextBlock } from '@portabletext/react';
import type { SanityImageSource } from '@sanity/image-url/lib/types/types';

export interface PostSummary {
  _id: string;
  title: string;
  slug: string;
  excerpt: string;
  publishedAt: string;
  readTime: number | null;
  category: string;
  color: string;
}

export interface PostFull extends PostSummary {
  body: PortableTextBlock[];
  seoTitle: string | null;
  seoDescription: string | null;
  ogImage: SanityImageSource | null;
}
