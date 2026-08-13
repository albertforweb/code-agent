import type {
  FeaturePackageRendererContribution,
  FeaturePackageRendererHost,
  FeaturePackageRendererModule,
  FeaturePackageRendererView,
} from '@codeagent/feature-package-sdk';
import { EXTERNAL_FEATURE_PACKAGE_RENDERER_MODULES } from './package-renderers/generated';

const modulesByPackageId = new Map<string, FeaturePackageRendererModule>(
  EXTERNAL_FEATURE_PACKAGE_RENDERER_MODULES.map(module => [module.packageId, module]),
);

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

export function getBundledFeaturePackageRendererIds(): string[] {
  return [...modulesByPackageId.keys()].sort();
}
