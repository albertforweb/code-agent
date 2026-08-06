const { createHash } = require('crypto');
const { readFileSync, writeFileSync } = require('fs');
const path = require('path');
const plist = require('plist');

module.exports = async function finalizePackage(context) {
  if (context.electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  const infoPlistPath = path.join(appPath, 'Contents', 'Info.plist');
  const appAsarPath = path.join(appPath, 'Contents', 'Resources', 'app.asar');
  const infoPlist = plist.parse(readFileSync(infoPlistPath, 'utf8'));
  const hash = createHash('sha256').update(readFileSync(appAsarPath)).digest('hex');

  infoPlist.ElectronAsarIntegrity = {
    ...(infoPlist.ElectronAsarIntegrity ?? {}),
    'Resources/app.asar': {
      algorithm: 'SHA256',
      hash,
    },
  };

  writeFileSync(infoPlistPath, plist.build(infoPlist));
};
