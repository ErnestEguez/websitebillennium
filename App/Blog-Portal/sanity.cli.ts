import { defineCliConfig } from 'sanity/cli';
import { apiVersion, dataset, projectId } from './lib/sanity.env';

export default defineCliConfig({
  api: { projectId, dataset },
  // Necesario para "npx sanity deploy" si en algún momento se quiere hostear
  // el Studio en <project>.sanity.studio además de en /studio.
});
