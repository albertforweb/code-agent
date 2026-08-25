import type { FeaturePackageRendererModule } from '@codeagent/feature-package-sdk';
import { registerFeaturePackageRendererModule } from './feature-package-renderers';

interface RendererSource {
  packageId: string;
  version: string;
  source: string;
}

interface RendererApi {
  app?: {
    listFeaturePackageRenderers?: () => Promise<RendererSource[]>;
  };
}

export async function loadInstalledFeaturePackageRenderers(react: unknown): Promise<string[]> {
  const api = (window as Window & { api?: RendererApi }).api;
  if (!api?.app?.listFeaturePackageRenderers) return [];

  Object.assign(globalThis, { __CODEAGENT_FEATURE_PACKAGE_REACT__: react });
  const loaded: string[] = [];
  for (const renderer of await api.app.listFeaturePackageRenderers()) {
    const blobUrl = URL.createObjectURL(new Blob([renderer.source], { type: 'text/javascript' }));
    try {
      const imported = await import(blobUrl) as { default?: FeaturePackageRendererModule };
      const module = imported.default;
      if (!module || module.packageId !== renderer.packageId) {
        throw new Error(`Renderer module identity does not match installed package ${renderer.packageId}.`);
      }
      registerFeaturePackageRendererModule(module);
      loaded.push(module.packageId);
    } finally {
      URL.revokeObjectURL(blobUrl);
    }
  }
  return loaded.sort();
}
