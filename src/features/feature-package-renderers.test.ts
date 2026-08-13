import assert from 'node:assert/strict';
import test from 'node:test';
import { getBundledFeaturePackageRendererIds } from './feature-package-renderers';
import { FEATURE_PACKAGE_MANIFESTS } from './feature-packages';

test('every bundled renderer is declared through an SDK manifest entrypoint', () => {
  const declaredRendererIds = FEATURE_PACKAGE_MANIFESTS
    .filter(manifest => Boolean(manifest.entrypoints?.renderer))
    .map(manifest => manifest.id)
    .sort();
  assert.deepEqual(getBundledFeaturePackageRendererIds(), declaredRendererIds);
});
