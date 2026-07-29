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
  // La app se sirve bajo billenniumsystem.com/blog vía rewrite del Portal,
  // pero internamente sus propias rutas son "/" y "/[slug]" (ver README).
};

export default nextConfig;
