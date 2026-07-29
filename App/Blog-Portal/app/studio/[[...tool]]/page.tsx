'use client';

import { NextStudio } from 'next-sanity/studio';
import config from '../../../sanity.config';

// Studio embebido en /studio — así el editor entra a
// billenniumsystem.com/blog/studio sin necesitar un dominio ni login aparte
// (más allá de su cuenta de Sanity). Si prefieren un editor separado, esto
// también puede hostearse en <project>.sanity.studio con "npx sanity deploy".
export default function StudioPage() {
  return <NextStudio config={config} />;
}
