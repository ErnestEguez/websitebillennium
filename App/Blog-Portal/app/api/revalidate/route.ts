import { revalidatePath } from 'next/cache';
import { parseBody } from 'next-sanity/webhook';
import { NextRequest, NextResponse } from 'next/server';

// Configurar en Sanity → API → Webhooks:
//   URL:     https://<url-del-proyecto-blog>/api/revalidate
//   Dataset: production
//   Trigger: Create, Update, Delete
//   Filter:  _type == "post"
//   Secret:  el mismo valor que SANITY_REVALIDATE_SECRET (ver .env.example)
//
// next-sanity/webhook valida la firma HMAC que Sanity manda en el header, no
// hace falta comparar el secreto a mano ni exponerlo en la URL.
export async function POST(req: NextRequest) {
  try {
    const { isValidSignature, body } = await parseBody<{ slug?: { current?: string } }>(
      req,
      process.env.SANITY_REVALIDATE_SECRET
    );

    if (!isValidSignature) {
      return NextResponse.json({ message: 'Firma inválida' }, { status: 401 });
    }

    revalidatePath('/');
    const slug = body?.slug?.current;
    if (slug) revalidatePath(`/${slug}`);

    return NextResponse.json({ revalidated: true, slug: slug ?? null, now: Date.now() });
  } catch (err: any) {
    return NextResponse.json({ message: err?.message ?? 'Error revalidando' }, { status: 500 });
  }
}
