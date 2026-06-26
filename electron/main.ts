/**
 * Electron Main Process
 * Handles window creation, app lifecycle, and IPC communication
 */

import {
  app,
  BrowserWindow,
  Menu,
  dialog,
  nativeTheme,
} from 'electron';
import * as path from 'path';
import { IpcBridge } from './bridge';
import Store from 'electron-store';
import { registerServiceBridges, type RegisteredServiceBridges } from './services-bridge';

const isDev = process.env.NODE_ENV === 'development';
const shouldOpenDevTools = process.env.ELECTRON_OPEN_DEVTOOLS === '1';
const shouldDisableGpu = process.env.ELECTRON_DISABLE_GPU === '1';
const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';
const isLinux = process.platform === 'linux';

if (shouldDisableGpu) {
  app.commandLine.appendSwitch('disable-gpu');
}

// ============================================================================
// TYPES
// ============================================================================

interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized?: boolean;
}

// ============================================================================
// GLOBALS
// ============================================================================

let mainWindow: BrowserWindow | null = null;
const store = new Store<{ windowState?: WindowState }>();
const ipcBridge = new IpcBridge();
let serviceBridges: RegisteredServiceBridges | null = null;

// ============================================================================
// WINDOW MANAGEMENT
// ============================================================================

/**
 * Load window state from persistent storage
 */
function getWindowState(): WindowState {
  const saved = store.get('windowState');
  const defaultWidth = 1200;
  const defaultHeight = 800;

  if (saved) {
    return saved;
  }

  return {
    width: defaultWidth,
    height: defaultHeight,
  };
}

/**
 * Save window state when it changes
 */
function saveWindowState() {
  if (!mainWindow) return;

  const bounds = mainWindow.getBounds();
  const state: WindowState = {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    isMaximized: mainWindow.isMaximized(),
  };

  store.set('windowState', state);
}

/**
 * Create the main application window
 */
function createWindow() {
  const windowState = getWindowState();

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
    icon: isMac ? undefined : path.join(__dirname, '../electron/resources/icon.ico'),
  });

  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error(`Preload failed: ${preloadPath}`, error);
  });

  if (isDev) {
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    });
  }

  // Restore maximized state
  if (windowState.isMaximized) {
    mainWindow.maximize();
  }

  const rendererFileUrl = `file://${path.join(__dirname, '../dist-renderer/index.html')}`;
  const startUrl = process.env.ELECTRON_RENDERER_URL ?? rendererFileUrl;

  mainWindow.loadURL(startUrl);

  // Open DevTools only when explicitly requested. On some macOS/Electron
  // combinations DevTools startup can crash natively before JS reports errors.
  if (isDev && shouldOpenDevTools) {
    mainWindow.webContents.openDevTools();
  }

  // Save state on close
  mainWindow.on('close', saveWindowState);

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Save state when moving/resizing
  mainWindow.on('move', saveWindowState);
  mainWindow.on('resize', saveWindowState);

  return mainWindow;
}

// ============================================================================
// APP LIFECYCLE
// ============================================================================

/**
 * Initialize app
 */
async function initializeApp() {
  // Setup IPC handlers
  setupIpcHandlers();

  // Create window
  createWindow();

  // Setup menu
  setupMenu();

  // Setup updater (future)
  // setupAutoUpdater();
}

/**
 * App ready
 */
app.on('ready', initializeApp);

/**
 * Quit when all windows are closed
 */
app.on('window-all-closed', () => {
  if (!isMac) {
    app.quit();
  }
});

/**
 * Re-create window when app is activated (macOS)
 */
app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

/**
 * Prevent multiple instances
 */
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ============================================================================
// MENU
// ============================================================================

function setupMenu() {
  const template: any[] = [
    {
      label: isMac ? 'Code Agent' : 'File',
      submenu: [
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('menu:open-settings');
            }
          },
        },
        ...(isMac ? [] : [{ type: 'separator' }]),
        {
          label: isMac ? 'Exit' : 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: 'About Code Agent',
              message: 'Code Agent',
              detail: 'Claude Code desktop application\nVersion 1.0.0',
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ============================================================================
// IPC HANDLERS
// ============================================================================

function setupIpcHandlers() {
  serviceBridges = registerServiceBridges(ipcBridge, {
    getMainWindow: () => mainWindow,
    cwd: process.cwd(),
    isDev,
  });

  // Listen for theme changes
  nativeTheme.on('updated', () => {
    if (mainWindow) {
      mainWindow.webContents.send('theme:changed', {
        isDark: nativeTheme.shouldUseDarkColors,
      });
    }
  });
}

// ============================================================================
// AUTO UPDATE (future implementation)
// ============================================================================

// function setupAutoUpdater() {
//   try {
//     const { autoUpdater } = require('electron-updater');
//
//     autoUpdater.checkForUpdatesAndNotify();
//
//     autoUpdater.on('update-available', () => {
//       dialog.showMessageBox(mainWindow!, {
//         type: 'info',
//         title: 'Update Available',
//         message: 'A new version is available. Download?',
//         buttons: ['Download', 'Later'],
//       }).then(result => {
//         if (result.response === 0) {
//           autoUpdater.downloadUpdate();
//         }
//       });
//     });
//
//     autoUpdater.on('update-downloaded', () => {
//       dialog.showMessageBox(mainWindow!, {
//         type: 'info',
//         title: 'Update Ready',
//         message: 'Update downloaded. Install on quit?',
//         buttons: ['Install', 'Later'],
//       }).then(result => {
//         if (result.response === 0) {
//           autoUpdater.quitAndInstall();
//         }
//       });
//     });
//   } catch (e) {
//     console.error('Auto-update failed:', e);
//   }
// }

// ============================================================================
// UTILS
// ============================================================================

export { ipcBridge, mainWindow };
