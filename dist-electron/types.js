"use strict";
/**
 * IPC Communication Types
 * Defines all channels and message types for main/renderer communication
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IPC_CHANNELS = void 0;
// ============================================================================
// ALL IPC CHANNELS
// ============================================================================
exports.IPC_CHANNELS = {
    // Tool channels
    'tool:execute': 'tool:execute',
    'tool:list': 'tool:list',
    'tool:result': 'tool:result',
    'tool:complete': 'tool:complete',
    'tool:error': 'tool:error',
    // API channels
    'api:chat': 'api:chat',
    'api:chatStream': 'api:chatStream',
    'api:chatDelta': 'api:chatDelta',
    'api:chatComplete': 'api:chatComplete',
    'api:chatError': 'api:chatError',
    'api:fetchBootstrap': 'api:fetchBootstrap',
    // MCP channels
    'mcp:listServers': 'mcp:listServers',
    'mcp:listTools': 'mcp:listTools',
    'mcp:refresh': 'mcp:refresh',
    // File system channels
    'fs:read': 'fs:read',
    'fs:write': 'fs:write',
    'fs:list': 'fs:list',
    // Auth channels
    'auth:getToken': 'auth:getToken',
    'auth:logout': 'auth:logout',
    'auth:setToken': 'auth:setToken',
    // App state channels
    'app:info': 'app:info',
    'app:getConfig': 'app:getConfig',
    'app:setConfig': 'app:setConfig',
    'app:getState': 'app:getState',
    'app:setState': 'app:setState',
    'app:configChanged': 'app:configChanged',
    'app:stateChanged': 'app:stateChanged',
    // Window channels
    'window:minimize': 'window:minimize',
    'window:maximize': 'window:maximize',
    'window:close': 'window:close',
    'window:devtools': 'window:devtools',
};
//# sourceMappingURL=types.js.map