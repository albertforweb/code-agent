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
    // Automation channels
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
    // Local history channels
    'history:saveRecord': 'history:saveRecord',
    'history:getRecord': 'history:getRecord',
    'history:listRecords': 'history:listRecords',
    'history:deleteRecord': 'history:deleteRecord',
    'history:exportRecords': 'history:exportRecords',
    'history:getStorageInfo': 'history:getStorageInfo',
    // File system channels
    'fs:read': 'fs:read',
    'fs:write': 'fs:write',
    'fs:list': 'fs:list',
    'fs:open': 'fs:open',
    'fs:reveal': 'fs:reveal',
    'fs:selectFolder': 'fs:selectFolder',
    'fs:selectPaths': 'fs:selectPaths',
    'fs:readContext': 'fs:readContext',
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
    'app:installFeaturePackage': 'app:installFeaturePackage',
    'app:configChanged': 'app:configChanged',
    'app:stateChanged': 'app:stateChanged',
    // Window channels
    'window:minimize': 'window:minimize',
    'window:maximize': 'window:maximize',
    'window:close': 'window:close',
    'window:devtools': 'window:devtools',
};
//# sourceMappingURL=types.js.map