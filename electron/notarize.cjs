const path = require('path');
const { execFileSync } = require('child_process');
const { notarize } = require('@electron/notarize');
const { signAsync } = require('@electron/osx-sign');

function verifySignature(appPath) {
  try {
    execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], {
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

function findSigningIdentity() {
  if (process.env.CSC_NAME) {
    return process.env.CSC_NAME;
  }

  try {
    const identities = execFileSync(
      'security',
      ['find-identity', '-v', '-p', 'codesigning'],
      { encoding: 'utf8' },
    );
    const names = [...identities.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    return names.find((name) => name.startsWith('Developer ID Application:'))
      ?? names.find((name) => name.startsWith('Apple Development:'))
      ?? null;
  } catch {
    return null;
  }
}

async function ensureValidSignature(appPath) {
  if (verifySignature(appPath)) {
    return;
  }

  const identity = findSigningIdentity();
  if (!identity) {
    throw new Error(`macOS package has an invalid signature and no signing identity is available: ${appPath}`);
  }

  console.log(`Repairing incomplete macOS bundle signature with ${identity}.`);
  await signAsync({
    app: appPath,
    identity,
    platform: 'darwin',
    type: identity.startsWith('Developer ID Application:') ? 'distribution' : 'development',
    preAutoEntitlements: false,
    optionsForFile: () => ({
      entitlements: path.join(__dirname, 'entitlements.mac.plist'),
      hardenedRuntime: true,
    }),
  });

  if (!verifySignature(appPath)) {
    throw new Error(`macOS package signature remained invalid after repair: ${appPath}`);
  }
}

module.exports = async function notarizeMacBuild(context) {
  if (context.electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  // electron-builder can leave the outer app ad-hoc signed after an afterPack
  // hook updates Info.plist. Refuse to ship that partial bundle and repair it
  // with the same local signing identity before notarization or verification.
  await ensureValidSignature(appPath);

  const {
    APPLE_ID,
    APPLE_APP_SPECIFIC_PASSWORD,
    APPLE_TEAM_ID,
  } = process.env;

  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.log('Skipping macOS notarization: Apple notarization credentials are not configured.');
    return;
  }

  await notarize({
    appBundleId: context.packager.appInfo.appId,
    appPath,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
    teamId: APPLE_TEAM_ID,
  });
};
