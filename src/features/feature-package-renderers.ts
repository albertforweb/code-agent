import type {
  FeaturePackageRendererContribution,
  FeaturePackageRendererHost,
  FeaturePackageRendererModule,
  FeaturePackageRendererView,
} from '@codeagent/feature-package-sdk';
const modulesByPackageId = new Map<string, FeaturePackageRendererModule>();

export function registerFeaturePackageRendererModule(module: FeaturePackageRendererModule): void {
  if (!module.packageId || typeof module.createContribution !== 'function') {
    throw new Error('Feature package renderer does not implement the SDK renderer contract.');
  }
  modulesByPackageId.set(module.packageId, module);
}

export function createFeaturePackageRendererContribution(
  packageId: string | undefined,
  host: FeaturePackageRendererHost,
): FeaturePackageRendererContribution | undefined {
  if (!packageId) return undefined;
  return modulesByPackageId.get(packageId)?.createContribution(host);
}

export function getFeaturePackageRendererView(
  contribution: FeaturePackageRendererContribution | undefined,
  viewId: string,
): FeaturePackageRendererView | undefined {
  return contribution?.views[viewId];
}

export function getRegisteredFeaturePackageRendererIds(): string[] {
  return [...modulesByPackageId.keys()].sort();
}
