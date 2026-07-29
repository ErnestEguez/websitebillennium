import { createClient, type SanityClient } from '@sanity/client';
import { apiVersion, dataset, isSanityConfigured, projectId, readToken } from './sanity.env';

// Cliente de solo lectura para las páginas públicas (listado y detalle).
// useCdn:true = respuestas cacheadas por el CDN de Sanity (rápido y barato);
// la actualización "en vivo" no depende de esto, depende del ISR de Next.js
// + el webhook de revalidación (ver app/api/revalidate/route.ts).
export const sanityClient: SanityClient | null = isSanityConfigured
  ? createClient({ projectId, dataset, apiVersion, useCdn: true })
  : null;

// Cliente con token, para scripts server-side (migración). Nunca se importa
// desde código que corra en el navegador.
export function getWriteClient(): SanityClient {
  if (!isSanityConfigured) {
    throw new Error('Sanity no está configurado (falta NEXT_PUBLIC_SANITY_PROJECT_ID).');
  }
  if (!readToken) {
    throw new Error('Falta SANITY_API_READ_TOKEN (token con permiso de escritura) en el entorno.');
  }
  return createClient({ projectId, dataset, apiVersion, token: readToken, useCdn: false });
}
