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
const services_bridge_1 = require("./services-bridge");
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
let serviceBridges = null;
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
            sandbox: true,
            nodeIntegration: false,
        },
        icon: isMac ? undefined : path.join(__dirname, '../electron/resources/icon.ico'),
    });
    // Restore maximized state
    if (windowState.isMaximized) {
        mainWindow.maximize();
    }
    const rendererFileUrl = `file://${path.join(__dirname, '../dist-renderer/index.html')}`;
    const startUrl = process.env.ELECTRON_RENDERER_URL ?? rendererFileUrl;
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
    serviceBridges = (0, services_bridge_1.registerServiceBridges)(ipcBridge, {
        getMainWindow: () => mainWindow,
        cwd: process.cwd(),
        isDev,
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