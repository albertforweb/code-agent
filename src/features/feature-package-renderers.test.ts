import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createFeaturePackageRendererContribution,
  getRegisteredFeaturePackageRendererIds,
  registerFeaturePackageRendererModule,
} from './feature-package-renderers';

test('renderer modules register and resolve only through the SDK contract', () => {
  registerFeaturePackageRendererModule({
    packageId: 'test-package',
    createContribution: () => ({ views: { test: 'view' } }),
  });
  assert.deepEqual(getRegisteredFeaturePackageRendererIds(), ['test-package']);
  assert.deepEqual(createFeaturePackageRendererContribution('test-package', {}), {
    views: { test: 'view' },
  });
});
