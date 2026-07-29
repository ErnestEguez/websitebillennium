import type { PortableTextBlock } from '@portabletext/react';
import type { Image } from 'sanity';

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
  ogImage: Image | null;
}
