import { app, BrowserWindow, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import { existsSync } from 'fs';
import path from 'path';

export interface AutoUpdaterController {
  checkForUpdates: (manual?: boolean) => Promise<void>;
  canCheckForUpdates: () => boolean;
}

export interface AutoUpdaterOptions {
  getMainWindow: () => BrowserWindow | null;
  isDev: boolean;
}

export function setupAutoUpdater(options: AutoUpdaterOptions): AutoUpdaterController {
  let checking = false;
  let downloaded = false;
  let manualCheckInProgress = false;

  function getUpdateConfigPath(): string {
    return path.join(process.resourcesPath, 'app-update.yml');
  }

  function canCheckForUpdates(): boolean {
    return !options.isDev && app.isPackaged && existsSync(getUpdateConfigPath());
  }

  function getWindow(): BrowserWindow | undefined {
    const window = options.getMainWindow();
    return window && !window.isDestroyed() ? window : undefined;
  }

  async function showMessage(title: string, message: string): Promise<void> {
    const window = getWindow();
    await dialog.showMessageBox(window, {
      type: 'info',
      title,
      message,
    });
  }

  async function showError(message: string): Promise<void> {
    const window = getWindow();
    await dialog.showMessageBox(window, {
      type: 'error',
      title: 'Update Check Failed',
      message,
    });
  }

  async function checkForUpdates(manual = false): Promise<void> {
    if (!canCheckForUpdates()) {
      if (manual) {
        const reason =
          options.isDev || !app.isPackaged
            ? 'Auto-update checks are only available in packaged release builds.'
            : 'This packaged app does not include update metadata. Build a release installer with publish configuration to enable update checks.';
        await showMessage('Updates Unavailable', reason);
      }
      return;
    }

    if (checking || downloaded) {
      if (manual) {
        await showMessage('Update Check', checking ? 'Already checking for updates.' : 'An update is already downloaded.');
      }
      return;
    }

    checking = true;
    manualCheckInProgress = manual;
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      manualCheckInProgress = false;
      if (manual) {
        await showError(error instanceof Error ? error.message : String(error));
      } else {
        console.warn('Auto-update check failed:', error);
      }
    } finally {
      checking = false;
    }
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = app.getVersion().includes('-');

  autoUpdater.on('update-available', async info => {
    manualCheckInProgress = false;
    const window = getWindow();
    const result = await dialog.showMessageBox(window, {
      type: 'info',
      title: 'Update Available',
      message: `CodeAgent ${info.version} is available.`,
      detail: 'Download it now? It will be installed after download confirmation.',
      buttons: ['Download', 'Later'],
      defaultId: 0,
      cancelId: 1,
    });

    if (result.response === 0) {
      await autoUpdater.downloadUpdate();
    }
  });

  autoUpdater.on('update-not-available', async () => {
    if (manualCheckInProgress) {
      manualCheckInProgress = false;
      await showMessage('No Update Found', 'CodeAgent is up to date.');
    }
  });

  autoUpdater.on('update-downloaded', async info => {
    downloaded = true;
    const window = getWindow();
    const result = await dialog.showMessageBox(window, {
      type: 'info',
      title: 'Update Ready',
      message: `CodeAgent ${info.version} has been downloaded.`,
      detail: 'Restart now to install the update?',
      buttons: ['Restart and Install', 'Later'],
      defaultId: 0,
      cancelId: 1,
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on('error', error => {
    console.warn('Auto-updater error:', error);
  });

  if (canCheckForUpdates()) {
    setTimeout(() => {
      checkForUpdates(false).catch(error => {
        console.warn('Startup update check failed:', error);
      });
    }, 10_000).unref?.();
  }

  return { checkForUpdates, canCheckForUpdates };
}
