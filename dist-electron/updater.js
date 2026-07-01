"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupAutoUpdater = setupAutoUpdater;
const electron_1 = require("electron");
const electron_updater_1 = require("electron-updater");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
function setupAutoUpdater(options) {
    let checking = false;
    let downloaded = false;
    let manualCheckInProgress = false;
    function getUpdateConfigPath() {
        return path_1.default.join(process.resourcesPath, 'app-update.yml');
    }
    function canCheckForUpdates() {
        return !options.isDev && electron_1.app.isPackaged && (0, fs_1.existsSync)(getUpdateConfigPath());
    }
    function getWindow() {
        const window = options.getMainWindow();
        return window && !window.isDestroyed() ? window : undefined;
    }
    async function showMessage(title, message) {
        const window = getWindow();
        await electron_1.dialog.showMessageBox(window, {
            type: 'info',
            title,
            message,
        });
    }
    async function showError(message) {
        const window = getWindow();
        await electron_1.dialog.showMessageBox(window, {
            type: 'error',
            title: 'Update Check Failed',
            message,
        });
    }
    async function checkForUpdates(manual = false) {
        if (!canCheckForUpdates()) {
            if (manual) {
                const reason = options.isDev || !electron_1.app.isPackaged
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
            await electron_updater_1.autoUpdater.checkForUpdates();
        }
        catch (error) {
            manualCheckInProgress = false;
            if (manual) {
                await showError(error instanceof Error ? error.message : String(error));
            }
            else {
                console.warn('Auto-update check failed:', error);
            }
        }
        finally {
            checking = false;
        }
    }
    electron_updater_1.autoUpdater.autoDownload = false;
    electron_updater_1.autoUpdater.autoInstallOnAppQuit = true;
    electron_updater_1.autoUpdater.allowPrerelease = electron_1.app.getVersion().includes('-');
    electron_updater_1.autoUpdater.on('update-available', async (info) => {
        manualCheckInProgress = false;
        const window = getWindow();
        const result = await electron_1.dialog.showMessageBox(window, {
            type: 'info',
            title: 'Update Available',
            message: `CodeAgent ${info.version} is available.`,
            detail: 'Download it now? It will be installed after download confirmation.',
            buttons: ['Download', 'Later'],
            defaultId: 0,
            cancelId: 1,
        });
        if (result.response === 0) {
            await electron_updater_1.autoUpdater.downloadUpdate();
        }
    });
    electron_updater_1.autoUpdater.on('update-not-available', async () => {
        if (manualCheckInProgress) {
            manualCheckInProgress = false;
            await showMessage('No Update Found', 'CodeAgent is up to date.');
        }
    });
    electron_updater_1.autoUpdater.on('update-downloaded', async (info) => {
        downloaded = true;
        const window = getWindow();
        const result = await electron_1.dialog.showMessageBox(window, {
            type: 'info',
            title: 'Update Ready',
            message: `CodeAgent ${info.version} has been downloaded.`,
            detail: 'Restart now to install the update?',
            buttons: ['Restart and Install', 'Later'],
            defaultId: 0,
            cancelId: 1,
        });
        if (result.response === 0) {
            electron_updater_1.autoUpdater.quitAndInstall();
        }
    });
    electron_updater_1.autoUpdater.on('error', error => {
        console.warn('Auto-updater error:', error);
    });
    if (canCheckForUpdates()) {
        setTimeout(() => {
            checkForUpdates(false).catch(error => {
                console.warn('Startup update check failed:', error);
            });
        }, 10000).unref?.();
    }
    return { checkForUpdates, canCheckForUpdates };
}
//# sourceMappingURL=updater.js.map