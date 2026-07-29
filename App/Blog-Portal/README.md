# Blog Portal (Next.js + Sanity)

Blog de billenniumsystem.com migrado desde el array hardcodeado en
`frontend/src/pages/Blog.js` (CRA) hacia un CMS headless. Vive en su propio
proyecto Next.js dentro de este mismo repo, desplegado como un proyecto
Vercel independiente, integrado al dominio principal vía **rewrites** — no
toca el resto del Portal (login, planes, dashboard, backend FastAPI).

## Estructura

```
App/Blog-Portal/
├── app/
│   ├── layout.tsx              Header/Footer compartido, metadata base
│   ├── page.tsx                Listado (equivale a /blog)
│   ├── [slug]/page.tsx         Detalle (equivale a /blog/:slug) + SEO/OG
│   └── api/revalidate/         Webhook: Sanity → revalida ISR al publicar
├── components/                 Header, Footer, PostCard, PortableTextRenderer
├── lib/                        Cliente Sanity, queries GROQ, tipos
├── scripts/migrate-existing-posts.mjs   Migración de los 4 artículos actuales
└── vercel.json                  ignoreCommand (mismo patrón que las otras Apps)
```

El Sanity Studio (modelo de contenido y editor) **no vive aquí**: es el proyecto
standalone en `App/studio-blog-billennium/`, hermano de esta carpeta. Este
proyecto solo consume el contenido (`lib/sanity.client.ts` + `next-sanity`).

## Configuración pendiente (a hacer una sola vez)

1. **Crear cuenta/proyecto en [sanity.io](https://www.sanity.io/manage)** (gratis). Anota el **Project ID**.
2. **Crear un dataset** llamado `production` (o el nombre que prefieras).
3. **Generar un token de escritura**: Project → API → Tokens → "Add API token" → permisos "Editor". Se usa solo para el script de migración.
4. Copiar `.env.example` a `.env.local` y llenar `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`, `SANITY_API_READ_TOKEN`.
5. Correr la migración de los 4 artículos existentes:
   ```
   npm install
   npm run migrate:posts
   ```
6. `npm run dev` y entrar a `http://localhost:3000` (listado) para verificar que todo cargó bien. Para el editor, correr `npm run dev` dentro de `App/studio-blog-billennium` (Studio standalone, `http://localhost:3333`).
7. **Desplegar en Vercel como proyecto nuevo** (Root Directory = `App/Blog-Portal`), agregando las mismas env vars de `.env.local` en el dashboard de Vercel, más `SANITY_REVALIDATE_SECRET` (un valor random que tú inventes).
8. Probar el deployment en su URL de Vercel propia (`*.vercel.app`) — **todavía sin tocar el Portal principal**.
9. En Sanity → API → Webhooks: crear un webhook a `https://<url-del-deploy>/api/revalidate`, dataset `production`, filtro `_type == "post"`, y el mismo secreto de `SANITY_REVALIDATE_SECRET`.
10. Validar: editar un artículo en el Studio standalone (`App/studio-blog-billennium`), publicar, y confirmar que el cambio aparece en la URL de Vercel en segundos (sin redeploy).
11. Rewrite activado en el Portal raíz (ver abajo) para que `billenniumsystem.com/blog` sirva desde el deployment de Blog-Portal.

## Rewrite en el Portal raíz

El rewrite está en `frontend/vercel.json` (proyecto `websitebillennium-k4qc`, el que sirve `billenniumsystem.com`), justo antes del catch-all `/(.*) → /index.html` que sirve el CRA:

```json
{
  "source": "/blog",
  "destination": "https://blog-billennium2026.vercel.app/"
},
{
  "source": "/blog/:path*",
  "destination": "https://blog-billennium2026.vercel.app/:path*"
}
```

`https://blog-billennium2026.vercel.app` es la URL de producción del proyecto Vercel de Blog-Portal. Si ese dominio cambia en el futuro (ej. se le asigna un dominio custom o se recrea el proyecto), actualizar las dos ocurrencias en `frontend/vercel.json`.

## Flujo de publicación (para el editor, sin tocar código)

1. Entrar al Sanity Studio standalone (`App/studio-blog-billennium`, local en `http://localhost:3333` o su URL desplegada en `*.sanity.studio`).
2. "Nuevo Artículo de Blog" → llenar título, slug, resumen, fecha, categoría, color, contenido, y los campos de SEO/Open Graph.
3. Publicar.
4. Sanity dispara el webhook → `/api/revalidate` revalida `/` y `/[slug]` → el artículo queda visible en segundos, sin ningún `git push` ni build manual.

## Decisiones deliberadas (para que no se lean como bugs)

- El Header/Footer **no replica el estado de sesión** (login/usuario/admin) — los links de login/registro y el resto de secciones del sitio (`/planes`, `/nosotros`, etc.) son `<a>` con URL absoluta al Portal principal, no `next/link`, para garantizar una navegación de página completa correcta incluso mientras este proyecto se prueba en su propia URL de Vercel antes de activar el rewrite.
- Las páginas usan `revalidate = 3600` como respaldo (por si el webhook falla alguna vez), pero la actualización real esperada es casi instantánea vía el webhook.
