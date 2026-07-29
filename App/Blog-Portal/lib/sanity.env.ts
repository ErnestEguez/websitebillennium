// Centraliza la lectura de env vars de Sanity. Con fallback seguro para que
// `next build`/`next dev` no truene antes de tener credenciales reales — en
// ese caso el cliente simplemente no traerá datos (ver sanity.client.ts).
export const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || '';
export const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production';
export const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION || '2025-01-01';

// Solo se usa en el servidor (migración, webhook de revalidación): permite
// escribir/leer contenido en draft. Nunca debe exponerse con NEXT_PUBLIC_.
export const readToken = process.env.SANITY_API_READ_TOKEN;

export const isSanityConfigured = Boolean(projectId);

if (!isSanityConfigured && process.env.NODE_ENV !== 'test') {
  // Aviso visible en logs de build/dev — no rompe el build.
  console.warn(
    '[sanity] NEXT_PUBLIC_SANITY_PROJECT_ID no está configurado. El blog se ' +
    'renderizará vacío hasta que se agreguen las credenciales reales (ver .env.example).'
  );
}
