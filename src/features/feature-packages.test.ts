import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FEATURE_PACKAGE_MANIFESTS,
  resolveFeaturePackages,
} from './feature-packages.js';

test('an installed older runtime is reported as update available without legacy artifact metadata', () => {
  const catalogPackage = FEATURE_PACKAGE_MANIFESTS.find(manifest => manifest.id === 'software-developer');
  assert.ok(catalogPackage, 'software-developer must be present in the generated catalog');

  const resolution = resolveFeaturePackages('desktop', {
    accountStatus: 'signed-in',
    accountId: 'account-1',
    email: 'admin@example.com',
    accountTier: 'paid',
    subscriptionStatus: 'active',
    purchasedPackageIds: ['software-developer'],
    installedPackageIds: ['software-developer'],
    packageInstallRecords: [{
      packageId: 'software-developer',
      artifactId: '',
      version: '1.0.0',
      state: 'installed',
      installedPath: '/tmp/software-developer/1.0.0',
    }],
  });

  const resolvedPackage = resolution.packages.find(entry => entry.manifest.id === 'software-developer');
  assert.ok(resolvedPackage);
  assert.equal(resolvedPackage.manifest.version, catalogPackage.version);
  assert.equal(resolvedPackage.installState, 'update-available');
  assert.match(resolvedPackage.installReason, /version 1\.0\.0 is installed/i);
  assert.match(resolvedPackage.installReason, new RegExp(`version ${catalogPackage.version} is available`, 'i'));
});
