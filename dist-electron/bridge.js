"use strict";
/**
 * IPC Bridge
 * Orchestrates communication between main and renderer processes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IpcBridge = void 0;
const electron_1 = require("electron");
const types_1 = require("./types");
class IpcBridge {
    constructor() {
        this.toolHandlers = new Map();
        this.apiHandlers = new Map();
        this.fsHandlers = new Map();
        this.authHandlers = new Map();
        this.appHandlers = new Map();
        this.mcpHandlers = new Map();
        this.setupChannelHandlers();
    }
    /**
     * Register all IPC channel handlers
     */
    setupChannelHandlers() {
        // Tool channels
        electron_1.ipcMain.handle(types_1.IPC_CHANNELS['tool:execute'], this.handleToolExecute.bind(this));
        electron_1.ipcMain.handle(types_1.IPC_CHANNELS['tool:list'], this.handleToolList.bind(this));
        electron_1.ipcMain.handle(types_1.IPC_CHANNELS['tool:fileWriteReviewResponse'], this.handleFileWriteReviewResponse.bind(this));
        electron_1.ipcMain.handle(types_1.IPC_CHANNELS['tool:commandReviewResponse'], this.handleCommandReviewResponse.bind(this));
        electron_1.ipcMain.handle(types_1.IPC_CHANNELS['tool:permissionReviewResponse'], this.handleToolPermissionReviewResponse.bind(this));
        // API channels
        electron_1.ipcMain.handle(types_1.IPC_CHANNELS['api:chat'], this.handleApiChat.bind(this));
        electron_1.ipcMain.handle(types_1.IPC_CHANNELS['api:chatStream'], this.handleApiChatStream.bind(this));
        electron_1.ipcMain.handle(types_1.IPC_CHANNELS['api:fetchBootstrap'], this.handleFetchBootstrap.bind(this));
        // MCP channels
        electron_1.ipcMain.handle(types_1.IPC_CHANNELS['mcp:listServers'], this.handleMcpListServers.bind(this));
        electron_1.ipcMain.handle(types_1.IPC_CHANNELS['mcp:listTools'], this.handleMcpListTools.bind(this));
        electron_1.ipcMain.handle(types_1.IPC_CHANNELS['mcp:refresh'], this.handleMcpRefresh.bind(this));
        // File system channels
        electron_1.ipcMain.handle(types_1.IPC_CHANNELS['fs:read'], this.handleFileRead.bind(this));
        electron_1.ipcMain.handle(types_1.IPC_CHANNELS['fs:write'], this.handleFileWrite.bind(this));
        electron_1.ipcMain.handle(types_1.IPC_CHANNELS['fs:list'], this.handleFileList.bind(this));
        electron_1.ipcMain.handle(types_1.IPC_CHANNELS['fs:open'], this.handleFileOpen.bind(this));
        electron_1.ipcMain.handle(types_1.IPC_CHANNELS['fs:reveal'], this.handleFileReveal.bind(this));
        // Auth channels
        electron_1.ipcMain.handle(types_1.IPC_CHANNELS['auth:getToken'], this.handleGetToken.bind(this));
        electron_1.ipcMain.handle(types_1.IPC_CHANNELS['auth:logout'], this.handleLogout.bind(this));
        electron_1.ipcMain.handle(types_1.IPC_CHANNELS['auth:setToken'], this.handleSetToken.bind(this));
        // App state channels
        electron_1.ipcMain.handle(types_1.IPC_CHANNELS['app:info'], this.handleGetInfo.bind(this));
        electron_1.ipcMain.handle(types_1.IPC_CHANNELS['app:getConfig'], this.handleGetConfig.bind(this));
        electron_1.ipcMain.handle(types_1.IPC_CHANNELS['app:setConfig'], this.handleSetConfig.bind(this));
        electron_1.ipcMain.handle(types_1.IPC_CHANNELS['app:getState'], this.handleGetState.bind(this));
        electron_1.ipcMain.handle(types_1.IPC_CHANNELS['app:setState'], this.handleSetState.bind(this));
        // Window channels
        electron_1.ipcMain.handle(types_1.IPC_CHANNELS['window:minimize'], this.handleWindowMinimize.bind(this));
        electron_1.ipcMain.handle(types_1.IPC_CHANNELS['window:maximize'], this.handleWindowMaximize.bind(this));
        electron_1.ipcMain.handle(types_1.IPC_CHANNELS['window:close'], this.handleWindowClose.bind(this));
        electron_1.ipcMain.handle(types_1.IPC_CHANNELS['window:devtools'], this.handleWindowDevtools.bind(this));
    }
    // ============================================================================
    // TOOL HANDLERS
    // ============================================================================
    async handleToolExecute(_event, message) {
        if (!message?.toolName || typeof message.toolName !== 'string') {
            throw new Error('Invalid tool execution request: toolName is required');
        }
        const handler = this.toolHandlers.get('execute');
        if (!handler) {
            throw new Error('Tool execution handler not configured');
        }
        return handler(message);
    }
    async handleToolList() {
        const handler = this.toolHandlers.get('list');
        if (!handler) {
            throw new Error('Tool list handler not configured');
        }
        return handler({});
    }
    async handleFileWriteReviewResponse(_event, response) {
        const handler = this.toolHandlers.get('fileWriteReviewResponse');
        if (!handler) {
            throw new Error('File write review response handler not configured');
        }
        return handler(response);
    }
    async handleCommandReviewResponse(_event, response) {
        const handler = this.toolHandlers.get('commandReviewResponse');
        if (!handler) {
            throw new Error('Command review response handler not configured');
        }
        return handler(response);
    }
    async handleToolPermissionReviewResponse(_event, response) {
        const handler = this.toolHandlers.get('permissionReviewResponse');
        if (!handler) {
            throw new Error('Tool permission review response handler not configured');
        }
        return handler(response);
    }
    // ============================================================================
    // API HANDLERS
    // ============================================================================
    async handleApiChat(event, request) {
        const handler = this.apiHandlers.get('chat');
        if (!handler) {
            throw new Error('API handler not configured');
        }
        return handler(request);
    }
    async handleApiChatStream(event, request) {
        const handler = this.apiHandlers.get('chatStream');
        if (!handler) {
            throw new Error('API stream handler not configured');
        }
        return handler(request);
    }
    async handleFetchBootstrap() {
        const handler = this.apiHandlers.get('bootstrap');
        if (!handler) {
            throw new Error('Bootstrap handler not configured');
        }
        return handler({});
    }
    // ============================================================================
    // FILE SYSTEM HANDLERS
    // ============================================================================
    async handleFileRead(event, request) {
        const handler = this.fsHandlers.get('read');
        if (!handler) {
            throw new Error('File system handler not configured');
        }
        return handler(request);
    }
    async handleFileWrite(event, request) {
        const handler = this.fsHandlers.get('write');
        if (!handler) {
            throw new Error('File system handler not configured');
        }
        return handler(request);
    }
    async handleFileList(event, request) {
        const handler = this.fsHandlers.get('list');
        if (!handler) {
            throw new Error('File system handler not configured');
        }
        return handler(request);
    }
    async handleFileOpen(event, request) {
        const handler = this.fsHandlers.get('open');
        if (!handler) {
            throw new Error('File open handler not configured');
        }
        return handler(request);
    }
    async handleFileReveal(event, request) {
        const handler = this.fsHandlers.get('reveal');
        if (!handler) {
            throw new Error('File reveal handler not configured');
        }
        return handler(request);
    }
    // ============================================================================
    // AUTH HANDLERS
    // ============================================================================
    async handleGetToken() {
        const handler = this.authHandlers.get('getToken');
        if (!handler) {
            throw new Error('Auth handler not configured');
        }
        return handler({});
    }
    async handleLogout() {
        const handler = this.authHandlers.get('logout');
        if (!handler) {
            throw new Error('Auth handler not configured');
        }
        return handler({});
    }
    async handleSetToken(event, token) {
        const handler = this.authHandlers.get('setToken');
        if (!handler) {
            throw new Error('Auth handler not configured');
        }
        return handler(token);
    }
    // ============================================================================
    // APP STATE HANDLERS
    // ============================================================================
    async handleGetInfo() {
        const handler = this.appHandlers.get('info');
        if (!handler) {
            throw new Error('App info handler not configured');
        }
        return handler({});
    }
    // ============================================================================
    // MCP HANDLERS
    // ============================================================================
    async handleMcpListServers() {
        const handler = this.mcpHandlers.get('listServers');
        if (!handler) {
            throw new Error('MCP server list handler not configured');
        }
        return handler({});
    }
    async handleMcpListTools() {
        const handler = this.mcpHandlers.get('listTools');
        if (!handler) {
            throw new Error('MCP tool list handler not configured');
        }
        return handler({});
    }
    async handleMcpRefresh() {
        const handler = this.mcpHandlers.get('refresh');
        if (!handler) {
            throw new Error('MCP refresh handler not configured');
        }
        return handler({});
    }
    async handleGetConfig() {
        const handler = this.appHandlers.get('getConfig');
        if (!handler) {
            throw new Error('App handler not configured');
        }
        return handler({});
    }
    async handleSetConfig(event, config) {
        const handler = this.appHandlers.get('setConfig');
        if (!handler) {
            throw new Error('App handler not configured');
        }
        return handler(config);
    }
    async handleGetState() {
        const handler = this.appHandlers.get('getState');
        if (!handler) {
            throw new Error('App handler not configured');
        }
        return handler({});
    }
    async handleSetState(event, state) {
        const handler = this.appHandlers.get('setState');
        if (!handler) {
            throw new Error('App handler not configured');
        }
        return handler(state);
    }
    // ============================================================================
    // WINDOW HANDLERS
    // ============================================================================
    async handleWindowMinimize() {
        const window = electron_1.BrowserWindow.getFocusedWindow();
        if (window) {
            window.minimize();
        }
    }
    async handleWindowMaximize() {
        const window = electron_1.BrowserWindow.getFocusedWindow();
        if (window) {
            if (window.isMaximized()) {
                window.unmaximize();
            }
            else {
                window.maximize();
            }
        }
    }
    async handleWindowClose() {
        const window = electron_1.BrowserWindow.getFocusedWindow();
        if (window) {
            window.close();
        }
    }
    async handleWindowDevtools() {
        const window = electron_1.BrowserWindow.getFocusedWindow();
        if (window) {
            window.webContents.openDevTools();
        }
    }
    // ============================================================================
    // HANDLER REGISTRATION
    // ============================================================================
    registerToolHandler(operation, handler) {
        this.toolHandlers.set(operation, handler);
    }
    registerApiHandler(apiName, handler) {
        this.apiHandlers.set(apiName, handler);
    }
    registerFsHandler(operation, handler) {
        this.fsHandlers.set(operation, handler);
    }
    registerMcpHandler(operation, handler) {
        this.mcpHandlers.set(operation, handler);
    }
    registerAuthHandler(operation, handler) {
        this.authHandlers.set(operation, handler);
    }
    registerAppHandler(operation, handler) {
        this.appHandlers.set(operation, handler);
    }
    // ============================================================================
    // EMIT EVENTS TO RENDERER
    // ============================================================================
    emitToolResult(event, toolId, data) {
        const window = electron_1.BrowserWindow.getFocusedWindow();
        if (window) {
            window.webContents.send(types_1.IPC_CHANNELS['tool:result'], { toolId, data });
        }
    }
    emitToolComplete(event, toolId, success, duration) {
        const window = electron_1.BrowserWindow.getFocusedWindow();
        if (window) {
            window.webContents.send(types_1.IPC_CHANNELS['tool:complete'], { toolId, success, duration });
        }
    }
    emitToolError(event, toolId, error) {
        const window = electron_1.BrowserWindow.getFocusedWindow();
        if (window) {
            window.webContents.send(types_1.IPC_CHANNELS['tool:error'], { toolId, error });
        }
    }
}
exports.IpcBridge = IpcBridge;
//# sourceMappingURL=bridge.js.map