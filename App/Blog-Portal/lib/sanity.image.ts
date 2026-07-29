import createImageUrlBuilder from '@sanity/image-url';
import type { Image } from 'sanity';
import { dataset, projectId } from './sanity.env';

const builder = projectId ? createImageUrlBuilder({ projectId, dataset }) : null;

export function urlForImage(source?: Image | null) {
  if (!builder || !source) return null;
  return builder.image(source);
}
