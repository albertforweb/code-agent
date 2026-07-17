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
    'tool:start': 'tool:start',
    'tool:result': 'tool:result',
    'tool:complete': 'tool:complete',
    'tool:error': 'tool:error',
    'tool:fileWriteReview': 'tool:fileWriteReview',
    'tool:fileWriteReviewResponse': 'tool:fileWriteReviewResponse',
    'tool:commandReview': 'tool:commandReview',
    'tool:commandReviewResponse': 'tool:commandReviewResponse',
    'tool:permissionReview': 'tool:permissionReview',
    'tool:permissionReviewResponse': 'tool:permissionReviewResponse',
    'tool:approvalResolved': 'tool:approvalResolved',
    'api:chat': 'api:chat',
    'api:chatStream': 'api:chatStream',
    'api:chatDelta': 'api:chatDelta',
    'api:chatComplete': 'api:chatComplete',
    'api:chatError': 'api:chatError',
    'api:fetchBootstrap': 'api:fetchBootstrap',
    'mcp:listServers': 'mcp:listServers',
    'mcp:listTools': 'mcp:listTools',
    'mcp:refresh': 'mcp:refresh',
    'automation:listSkills': 'automation:listSkills',
    'automation:refreshSkills': 'automation:refreshSkills',
    'automation:getSkill': 'automation:getSkill',
    'automation:setSkillEnabled': 'automation:setSkillEnabled',
    'automation:listTasks': 'automation:listTasks',
    'automation:listTaskRuns': 'automation:listTaskRuns',
    'automation:saveTask': 'automation:saveTask',
    'automation:setTaskEnabled': 'automation:setTaskEnabled',
    'automation:deleteTask': 'automation:deleteTask',
    'automation:runTask': 'automation:runTask',
    'automation:getSchedulerStatus': 'automation:getSchedulerStatus',
    'automation:getRemoteControl': 'automation:getRemoteControl',
    'automation:updateRemoteControl': 'automation:updateRemoteControl',
    'automation:createRemotePairingCode': 'automation:createRemotePairingCode',
    'automation:startRemoteControl': 'automation:startRemoteControl',
    'automation:stopRemoteControl': 'automation:stopRemoteControl',
    'automation:listTeams': 'automation:listTeams',
    'automation:listTeamRuns': 'automation:listTeamRuns',
    'automation:saveTeam': 'automation:saveTeam',
    'automation:deleteTeam': 'automation:deleteTeam',
    'automation:createDefaultTeam': 'automation:createDefaultTeam',
    'automation:runTeam': 'automation:runTeam',
    'automation:revokeRemoteDevice': 'automation:revokeRemoteDevice',
    'automation:exportProjectState': 'automation:exportProjectState',
    'automation:importProjectState': 'automation:importProjectState',
    'history:saveRecord': 'history:saveRecord',
    'history:getRecord': 'history:getRecord',
    'history:listRecords': 'history:listRecords',
    'history:deleteRecord': 'history:deleteRecord',
    'history:exportRecords': 'history:exportRecords',
    'history:getStorageInfo': 'history:getStorageInfo',
    'fs:read': 'fs:read',
    'fs:write': 'fs:write',
    'fs:list': 'fs:list',
    'fs:open': 'fs:open',
    'fs:reveal': 'fs:reveal',
    'fs:selectFolder': 'fs:selectFolder',
    'fs:selectPaths': 'fs:selectPaths',
    'fs:readContext': 'fs:readContext',
    'auth:getToken': 'auth:getToken',
    'auth:logout': 'auth:logout',
    'auth:setToken': 'auth:setToken',
    'app:info': 'app:info',
    'app:getConfig': 'app:getConfig',
    'app:setConfig': 'app:setConfig',
    'app:getState': 'app:getState',
    'app:setState': 'app:setState',
    'app:installFeaturePackage': 'app:installFeaturePackage',
    'app:configChanged': 'app:configChanged',
    'app:stateChanged': 'app:stateChanged',
    'window:minimize': 'window:minimize',
    'window:maximize': 'window:maximize',
    'window:close': 'window:close',
    'window:devtools': 'window:devtools',
    'menu:open-settings': 'menu:open-settings',
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
        respondToFileWriteReview: (response) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['tool:fileWriteReviewResponse'], response);
        },
        respondToCommandReview: (response) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['tool:commandReviewResponse'], response);
        },
        respondToToolPermissionReview: (response) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['tool:permissionReviewResponse'], response);
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
    // AUTOMATION API
    // ============================================================================
    automation: {
        listSkills: () => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['automation:listSkills']);
        },
        refreshSkills: () => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['automation:refreshSkills']);
        },
        getSkill: (skillId) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['automation:getSkill'], skillId);
        },
        setSkillEnabled: (skillId, enabled) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['automation:setSkillEnabled'], { skillId, enabled });
        },
        listTasks: () => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['automation:listTasks']);
        },
        listTaskRuns: (taskId) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['automation:listTaskRuns'], taskId);
        },
        saveTask: (task) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['automation:saveTask'], task);
        },
        setTaskEnabled: (taskId, enabled) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['automation:setTaskEnabled'], { taskId, enabled });
        },
        deleteTask: (taskId) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['automation:deleteTask'], taskId);
        },
        runTask: (taskId) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['automation:runTask'], taskId);
        },
        getSchedulerStatus: () => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['automation:getSchedulerStatus']);
        },
        getRemoteControl: () => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['automation:getRemoteControl']);
        },
        updateRemoteControl: (update) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['automation:updateRemoteControl'], update);
        },
        createRemotePairingCode: (deviceName) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['automation:createRemotePairingCode'], deviceName);
        },
        startRemoteControl: () => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['automation:startRemoteControl']);
        },
        stopRemoteControl: () => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['automation:stopRemoteControl']);
        },
        listTeams: () => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['automation:listTeams']);
        },
        listTeamRuns: (teamId) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['automation:listTeamRuns'], teamId);
        },
        saveTeam: (team) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['automation:saveTeam'], team);
        },
        deleteTeam: (teamId) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['automation:deleteTeam'], teamId);
        },
        createDefaultTeam: (objective) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['automation:createDefaultTeam'], objective);
        },
        runTeam: (teamId) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['automation:runTeam'], teamId);
        },
        revokeRemoteDevice: (deviceId) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['automation:revokeRemoteDevice'], deviceId);
        },
        exportProjectState: (options) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['automation:exportProjectState'], options);
        },
        importProjectState: (bundle) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['automation:importProjectState'], bundle);
        },
    },
    // ============================================================================
    // LOCAL HISTORY API
    // ============================================================================
    history: {
        saveRecord: (record) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['history:saveRecord'], record);
        },
        getRecord: (id) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['history:getRecord'], id);
        },
        listRecords: (filter) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['history:listRecords'], filter);
        },
        deleteRecord: (id) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['history:deleteRecord'], id);
        },
        exportRecords: (filter) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['history:exportRecords'], filter);
        },
        getStorageInfo: () => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['history:getStorageInfo']);
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
        open: (path) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['fs:open'], { path });
        },
        reveal: (path) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['fs:reveal'], { path });
        },
        selectFolder: (defaultPath) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['fs:selectFolder'], { defaultPath });
        },
        selectPaths: (defaultPath) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['fs:selectPaths'], { defaultPath });
        },
        readContext: (request) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['fs:readContext'], request);
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
        installFeaturePackage: (request) => {
            return electron_1.ipcRenderer.invoke(IPC_CHANNELS['app:installFeaturePackage'], request);
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
    onToolStart: (callback) => {
        const handler = (_event, data) => callback(data);
        electron_1.ipcRenderer.on(IPC_CHANNELS['tool:start'], handler);
        return () => electron_1.ipcRenderer.removeListener(IPC_CHANNELS['tool:start'], handler);
    },
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
    onFileWriteReview: (callback) => {
        const handler = (_event, data) => callback(data);
        electron_1.ipcRenderer.on(IPC_CHANNELS['tool:fileWriteReview'], handler);
        return () => electron_1.ipcRenderer.removeListener(IPC_CHANNELS['tool:fileWriteReview'], handler);
    },
    onCommandReview: (callback) => {
        const handler = (_event, data) => callback(data);
        electron_1.ipcRenderer.on(IPC_CHANNELS['tool:commandReview'], handler);
        return () => electron_1.ipcRenderer.removeListener(IPC_CHANNELS['tool:commandReview'], handler);
    },
    onToolPermissionReview: (callback) => {
        const handler = (_event, data) => callback(data);
        electron_1.ipcRenderer.on(IPC_CHANNELS['tool:permissionReview'], handler);
        return () => electron_1.ipcRenderer.removeListener(IPC_CHANNELS['tool:permissionReview'], handler);
    },
    onToolApprovalResolved: (callback) => {
        const handler = (_event, data) => callback(data);
        electron_1.ipcRenderer.on(IPC_CHANNELS['tool:approvalResolved'], handler);
        return () => electron_1.ipcRenderer.removeListener(IPC_CHANNELS['tool:approvalResolved'], handler);
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
    onConfigChanged: (callback) => {
        const handler = (_event, data) => callback(data);
        electron_1.ipcRenderer.on(IPC_CHANNELS['app:configChanged'], handler);
        return () => electron_1.ipcRenderer.removeListener(IPC_CHANNELS['app:configChanged'], handler);
    },
    onStateChanged: (callback) => {
        const handler = (_event, data) => callback(data);
        electron_1.ipcRenderer.on(IPC_CHANNELS['app:stateChanged'], handler);
        return () => electron_1.ipcRenderer.removeListener(IPC_CHANNELS['app:stateChanged'], handler);
    },
    onMenuOpenSettings: (callback) => {
        const handler = () => callback();
        electron_1.ipcRenderer.on(IPC_CHANNELS['menu:open-settings'], handler);
        return () => electron_1.ipcRenderer.removeListener(IPC_CHANNELS['menu:open-settings'], handler);
    },
};
/**
 * Expose the safe API to renderer process
 * This is the only way renderer can access Node.js capabilities
 */
electron_1.contextBridge.exposeInMainWorld('api', api);
//# sourceMappingURL=preload.js.map