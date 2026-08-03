import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'cdn.sanity.io' },
    ],
  },
  // Este proyecto vive dentro de un monorepo con otro package-lock.json en la
  // raíz del repo — sin esto, Next.js infiere mal la raíz del workspace.
  outputFileTracingRoot: __dirname,
  // La app se sirve bajo billenniumsystem.com/blog vía rewrite del Portal.
  // basePath hace que Next.js anteponga /blog a TODAS sus rutas internas
  // (<Link href="/[slug]">) y a sus assets (/_next/...) automáticamente —
  // sin esto, esos links y el CSS/JS apuntaban a la raíz del dominio
  // (billenniumsystem.com/[slug] en vez de /blog/[slug]) y el catch-all
  // de la SPA del Portal los interceptaba con un 404.
  basePath: '/blog',
};

export default nextConfig;
