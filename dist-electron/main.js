"use strict";
/**
 * Electron Main Process
 * Handles window creation, app lifecycle, and IPC communication
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mainWindow = exports.ipcBridge = void 0;
const electron_1 = require("electron");
const path = __importStar(require("path"));
const bridge_1 = require("./bridge");
const electron_store_1 = __importDefault(require("electron-store"));
const services_1 = require("./services");
const isDev = process.env.NODE_ENV === 'development';
const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';
const isLinux = process.platform === 'linux';
// ============================================================================
// GLOBALS
// ============================================================================
let mainWindow = null;
exports.mainWindow = mainWindow;
const store = new electron_store_1.default();
const ipcBridge = new bridge_1.IpcBridge();
exports.ipcBridge = ipcBridge;
// Service bridges
let toolService;
let apiService;
let filesService;
let authService;
let appStateService;
// ============================================================================
// WINDOW MANAGEMENT
// ============================================================================
/**
 * Load window state from persistent storage
 */
function getWindowState() {
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
    if (!mainWindow)
        return;
    const bounds = mainWindow.getBounds();
    const state = {
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
    exports.mainWindow = mainWindow = new electron_1.BrowserWindow({
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
        exports.mainWindow = mainWindow = null;
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
electron_1.app.on('ready', initializeApp);
/**
 * Quit when all windows are closed
 */
electron_1.app.on('window-all-closed', () => {
    if (!isMac) {
        electron_1.app.quit();
    }
});
/**
 * Re-create window when app is activated (macOS)
 */
electron_1.app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
/**
 * Prevent multiple instances
 */
const gotTheLock = electron_1.app.requestSingleInstanceLock();
if (!gotTheLock) {
    electron_1.app.quit();
}
else {
    electron_1.app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized())
                mainWindow.restore();
            mainWindow.focus();
        }
    });
}
// ============================================================================
// MENU
// ============================================================================
function setupMenu() {
    const template = [
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
                        electron_1.app.quit();
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
                        electron_1.dialog.showMessageBox(mainWindow, {
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
    const menu = electron_1.Menu.buildFromTemplate(template);
    electron_1.Menu.setApplicationMenu(menu);
}
// ============================================================================
// IPC HANDLERS
// ============================================================================
function setupIpcHandlers() {
    // Initialize service bridges
    toolService = new services_1.ToolServiceBridge();
    apiService = new services_1.ApiServiceBridge();
    filesService = new services_1.FileSystemServiceBridge(process.cwd());
    authService = new services_1.AuthServiceBridge();
    appStateService = new services_1.AppStateServiceBridge();
    // Setup result handlers for tool service
    toolService.setResultHandler((toolId, data) => {
        if (mainWindow) {
            mainWindow.webContents.send('tool:result', { toolId, data });
        }
    });
    toolService.setCompleteHandler((toolId, success, duration) => {
        if (mainWindow) {
            mainWindow.webContents.send('tool:complete', { toolId, success, duration });
        }
    });
    toolService.setErrorHandler((toolId, error, stack) => {
        if (mainWindow) {
            mainWindow.webContents.send('tool:error', { toolId, error, stack });
        }
    });
    // Register tool handlers
    ipcBridge.registerToolHandler('execute', async (args) => {
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
    ipcBridge.registerApiHandler('chat', async (request) => {
        return apiService.chat(request);
    });
    ipcBridge.registerApiHandler('bootstrap', async () => {
        return apiService.fetchBootstrap();
    });
    // Register file system handlers
    ipcBridge.registerFsHandler('read', async (request) => {
        return filesService.readFile(request.path, request.encoding);
    });
    ipcBridge.registerFsHandler('write', async (request) => {
        return filesService.writeFile(request.path, request.content, request.encoding);
    });
    ipcBridge.registerFsHandler('list', async (request) => {
        return filesService.listDirectory(request.path);
    });
    // Register auth handlers
    ipcBridge.registerAuthHandler('getToken', async () => {
        return authService.getToken();
    });
    ipcBridge.registerAuthHandler('logout', async () => {
        return authService.logout();
    });
    ipcBridge.registerAuthHandler('setToken', async (token) => {
        return authService.setToken(token);
    });
    // Register app state handlers
    ipcBridge.registerAppHandler('getConfig', async () => {
        return appStateService.getConfig();
    });
    ipcBridge.registerAppHandler('setConfig', async (config) => {
        return appStateService.setConfig(config);
    });
    ipcBridge.registerAppHandler('getState', async () => {
        return appStateService.getState();
    });
    ipcBridge.registerAppHandler('setState', async (state) => {
        return appStateService.setState(state);
    });
    // Example: Simple echo handler
    electron_1.ipcMain.handle('ping', () => {
        return 'pong';
    });
    // Example: Get app info
    electron_1.ipcMain.handle('app:info', () => {
        return {
            version: electron_1.app.getVersion(),
            platform: process.platform,
            arch: process.arch,
            isDev,
        };
    });
    // Example: Toggle theme
    electron_1.ipcMain.handle('theme:toggle', () => {
        const isDark = electron_1.nativeTheme.shouldUseDarkColors;
        return { isDark };
    });
    // Listen for theme changes
    electron_1.nativeTheme.on('updated', () => {
        if (mainWindow) {
            mainWindow.webContents.send('theme:changed', {
                isDark: electron_1.nativeTheme.shouldUseDarkColors,
            });
        }
    });
}
//# sourceMappingURL=main.js.map