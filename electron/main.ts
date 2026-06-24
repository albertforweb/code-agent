/**
 * Electron Main Process
 * Handles window creation, app lifecycle, and IPC communication
 */

import {
  app,
  BrowserWindow,
  Menu,
  ipcMain,
  dialog,
  nativeTheme,
} from 'electron';
import * as path from 'path';
import { IpcBridge } from './bridge';
import Store from 'electron-store';
import {
  ToolServiceBridge,
  ApiServiceBridge,
  FileSystemServiceBridge,
  AuthServiceBridge,
  AppStateServiceBridge,
} from './services';

const isDev = process.env.NODE_ENV === 'development';
const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';
const isLinux = process.platform === 'linux';

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

// Service bridges
let toolService: ToolServiceBridge;
let apiService: ApiServiceBridge;
let filesService: FileSystemServiceBridge;
let authService: AuthServiceBridge;
let appStateService: AppStateServiceBridge;

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
      enableRemoteModule: false,
      sandbox: true,
      nodeIntegration: false,
    },
    icon: isMac ? undefined : path.join(__dirname, '../electron/resources/icon.ico'),
  });

  // Restore maximized state
  if (windowState.isMaximized) {
    mainWindow.maximize();
  }

  // Load the app
  const startUrl = isDev
    ? 'http://localhost:3000' // Dev server
    : `file://${path.join(__dirname, '../dist-renderer/index.html')}`; // Production

  mainWindow.loadURL(startUrl);

  // Open dev tools in development
  if (isDev) {
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
  // Initialize service bridges
  toolService = new ToolServiceBridge();
  apiService = new ApiServiceBridge();
  filesService = new FileSystemServiceBridge(process.cwd());
  authService = new AuthServiceBridge();
  appStateService = new AppStateServiceBridge();

  // Setup result handlers for tool service
  toolService.setResultHandler((toolId: string, data: any) => {
    if (mainWindow) {
      mainWindow.webContents.send('tool:result', { toolId, data });
    }
  });

  toolService.setCompleteHandler((toolId: string, success: boolean, duration: number) => {
    if (mainWindow) {
      mainWindow.webContents.send('tool:complete', { toolId, success, duration });
    }
  });

  toolService.setErrorHandler((toolId: string, error: string, stack?: string) => {
    if (mainWindow) {
      mainWindow.webContents.send('tool:error', { toolId, error, stack });
    }
  });

  // Register tool handlers
  ipcBridge.registerToolHandler('execute', async (args: any) => {
    const { toolName, args: toolArgs } = args;
    const toolId = `tool-${Date.now()}`;
    
    // Execute tool asynchronously (non-blocking)
    toolService.executeTool(toolName, toolArgs, toolId).catch(error => {
      console.error(`Tool execution error: ${error}`);
    });

    return { toolId };
  });

  ipcBridge.registerToolHandler('list', async () => {
    return toolService.getTools();
  });

  // Register API handlers
  ipcBridge.registerApiHandler('chat', async (request: any) => {
    return apiService.chat(request);
  });

  ipcBridge.registerApiHandler('bootstrap', async () => {
    return apiService.fetchBootstrap();
  });

  // Register file system handlers
  ipcBridge.registerFsHandler('read', async (request: any) => {
    return filesService.readFile(request.path, request.encoding);
  });

  ipcBridge.registerFsHandler('write', async (request: any) => {
    return filesService.writeFile(request.path, request.content, request.encoding);
  });

  ipcBridge.registerFsHandler('list', async (request: any) => {
    return filesService.listDirectory(request.path);
  });

  // Register auth handlers
  ipcBridge.registerAuthHandler('getToken', async () => {
    return authService.getToken();
  });

  ipcBridge.registerAuthHandler('logout', async () => {
    return authService.logout();
  });

  ipcBridge.registerAuthHandler('setToken', async (token: any) => {
    return authService.setToken(token);
  });

  // Register app state handlers
  ipcBridge.registerAppHandler('getConfig', async () => {
    return appStateService.getConfig();
  });

  ipcBridge.registerAppHandler('setConfig', async (config: any) => {
    return appStateService.setConfig(config);
  });

  ipcBridge.registerAppHandler('getState', async () => {
    return appStateService.getState();
  });

  ipcBridge.registerAppHandler('setState', async (state: any) => {
    return appStateService.setState(state);
  });

  // Example: Simple echo handler
  ipcMain.handle('ping', () => {
    return 'pong';
  });

  // Example: Get app info
  ipcMain.handle('app:info', () => {
    return {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      isDev,
    };
  });

  // Example: Toggle theme
  ipcMain.handle('theme:toggle', () => {
    const isDark = nativeTheme.shouldUseDarkColors;
    return { isDark };
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
