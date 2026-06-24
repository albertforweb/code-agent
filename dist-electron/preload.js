"use strict";
/**
 * Preload Script
 * Exposes a safe IPC API to the renderer process
 * Context isolation enabled - no direct Node.js access from renderer
 */
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const IPC_CHANNELS = {
    'tool:execute': 'tool:execute',
    'tool:list': 'tool:list',
    'tool:result': 'tool:result',
    'tool:complete': 'tool:complete',
    'tool:error': 'tool:error',
    'api:chat': 'api:chat',
    'api:chatStream': 'api:chatStream',
    'api:chatDelta': 'api:chatDelta',
    'api:chatComplete': 'api:chatComplete',
    'api:chatError': 'api:chatError',
    'api:fetchBootstrap': 'api:fetchBootstrap',
    'mcp:listServers': 'mcp:listServers',
    'mcp:listTools': 'mcp:listTools',
    'mcp:refresh': 'mcp:refresh',
    'fs:read': 'fs:read',
    'fs:write': 'fs:write',
    'fs:list': 'fs:list',
    'auth:getToken': 'auth:getToken',
    'auth:logout': 'auth:logout',
    'auth:setToken': 'auth:setToken',
    'app:info': 'app:info',
    'app:getConfig': 'app:getConfig',
    'app:setConfig': 'app:setConfig',
    'app:getState': 'app:getState',
    'app:setState': 'app:setState',
    'window:minimize': 'window:minimize',
    'window:maximize': 'window:maximize',
    'window:close': 'window:close',
    'window:devtools': 'window:devtools',
};
/**
 * Safe API exposed to renderer via contextBridge
 * Limited, typed access to main process capabilities
 */
const api = {
    // ============================================================================
    // TOOL API
    // ============================================================================
    tools: {
        execute: (toolName, args) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['tool:execute'], { toolName, args });
        },
        list: () => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['tool:list']);
        },
    },
    // ============================================================================
    // API ENDPOINTS
    // ============================================================================
    api: {
        chat: (request) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['api:chat'], request);
        },
        chatStream: (request) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['api:chatStream'], request);
        },
        fetchBootstrap: () => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['api:fetchBootstrap']);
        },
    },
    // ============================================================================
    // MCP API
    // ============================================================================
    mcp: {
        listServers: () => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['mcp:listServers']);
        },
        listTools: () => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['mcp:listTools']);
        },
        refresh: () => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['mcp:refresh']);
        },
    },
    // ============================================================================
    // FILE SYSTEM API
    // ============================================================================
    fs: {
        read: (path, encoding) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['fs:read'], { path, encoding });
        },
        write: (path, content, encoding) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['fs:write'], { path, content, encoding });
        },
        list: (path) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['fs:list'], { path });
        },
    },
    // ============================================================================
    // AUTHENTICATION API
    // ============================================================================
    auth: {
        getToken: () => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['auth:getToken']);
        },
        logout: () => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['auth:logout']);
        },
        setToken: (token) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['auth:setToken'], token);
        },
    },
    // ============================================================================
    // APP STATE API
    // ============================================================================
    app: {
        info: () => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['app:info']);
        },
        getConfig: () => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['app:getConfig']);
        },
        setConfig: (config) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['app:setConfig'], config);
        },
        getState: () => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['app:getState']);
        },
        setState: (state) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['app:setState'], state);
        },
    },
    // ============================================================================
    // WINDOW API
    // ============================================================================
    window: {
        minimize: () => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['window:minimize']);
        },
        maximize: () => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['window:maximize']);
        },
        close: () => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['window:close']);
        },
        openDevTools: () => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['window:devtools']);
        },
    },
    // ============================================================================
    // EVENT LISTENERS
    // ============================================================================
    onToolResult: (callback) => {
        const handler = (_event, data) => callback(data);
        electron_1.ipcRenderer.on(IPC_CHANNELS['tool:result'], handler);
        return () => electron_1.ipcRenderer.removeListener(IPC_CHANNELS['tool:result'], handler);
    },
    onToolComplete: (callback) => {
        const handler = (_event, data) => callback(data);
        electron_1.ipcRenderer.on(IPC_CHANNELS['tool:complete'], handler);
        return () => electron_1.ipcRenderer.removeListener(IPC_CHANNELS['tool:complete'], handler);
    },
    onToolError: (callback) => {
        const handler = (_event, data) => callback(data);
        electron_1.ipcRenderer.on(IPC_CHANNELS['tool:error'], handler);
        return () => electron_1.ipcRenderer.removeListener(IPC_CHANNELS['tool:error'], handler);
    },
    onChatDelta: (callback) => {
        const handler = (_event, data) => callback(data);
        electron_1.ipcRenderer.on(IPC_CHANNELS['api:chatDelta'], handler);
        return () => electron_1.ipcRenderer.removeListener(IPC_CHANNELS['api:chatDelta'], handler);
    },
    onChatComplete: (callback) => {
        const handler = (_event, data) => callback(data);
        electron_1.ipcRenderer.on(IPC_CHANNELS['api:chatComplete'], handler);
        return () => electron_1.ipcRenderer.removeListener(IPC_CHANNELS['api:chatComplete'], handler);
    },
    onChatError: (callback) => {
        const handler = (_event, data) => callback(data);
        electron_1.ipcRenderer.on(IPC_CHANNELS['api:chatError'], handler);
        return () => electron_1.ipcRenderer.removeListener(IPC_CHANNELS['api:chatError'], handler);
    },
};
/**
 * Expose the safe API to renderer process
 * This is the only way renderer can access Node.js capabilities
 */
electron_1.contextBridge.exposeInMainWorld('api', api);
//# sourceMappingURL=preload.js.map