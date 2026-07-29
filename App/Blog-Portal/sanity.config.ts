'use client';

import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { visionTool } from '@sanity/vision';
import { schemaTypes } from './schemaTypes';
import { apiVersion, dataset, projectId } from './lib/sanity.env';

export default defineConfig({
  basePath: '/studio',
  projectId,
  dataset,
  schema: { types: schemaTypes },
  plugins: [
    structureTool(),
    // Vision permite probar queries GROQ a mano desde el propio Studio — útil
    // para depurar sin salir del navegador.
    visionTool({ defaultApiVersion: apiVersion }),
  ],
});
