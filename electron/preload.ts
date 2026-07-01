/**
 * Preload Script
 * Exposes a safe IPC API to the renderer process
 * Context isolation enabled - no direct Node.js access from renderer
 */

import { contextBridge, ipcRenderer } from 'electron';
import type {
  Tool,
  ToolExecuteMessage,
  ToolExecuteResponse,
  ToolStartMessage,
  ToolPermissionReviewRequest,
  ToolPermissionReviewResponse,
  CommandReviewRequest,
  CommandReviewResponse,
  FileWriteReviewRequest,
  FileWriteReviewResponse,
  ChatRequest,
  ChatResponse,
  ChatStreamRequest,
  ChatStreamResponse,
  FileReadRequest,
  FileWriteRequest,
  FileListRequest,
  FilePathRequest,
  FilePathActionResult,
  FileEntry,
  AuthToken,
  AppConfig,
  AppInfo,
  AppConfigChangedMessage,
  AppStateChangedMessage,
  BootstrapData,
  McpServerInfo,
  McpToolInfo,
  SkillManifest,
  SkillDetail,
  ScheduledTask,
  AutomationRunRecord,
  AutomationSchedulerStatus,
  RemoteControlState,
  VirtualTeamBlueprint,
  VirtualTeamRunRecord,
  AutomationProjectExport,
  AutomationProjectImportResult,
  LocalHistoryRecord,
  LocalHistoryRecordInput,
  LocalHistoryFilter,
  LocalHistoryExport,
  LocalHistoryStorageInfo,
  ChatDeltaMessage,
  ChatCompleteMessage,
  ChatErrorMessage,
} from './types';

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
  'auth:getToken': 'auth:getToken',
  'auth:logout': 'auth:logout',
  'auth:setToken': 'auth:setToken',
  'app:info': 'app:info',
  'app:getConfig': 'app:getConfig',
  'app:setConfig': 'app:setConfig',
  'app:getState': 'app:getState',
  'app:setState': 'app:setState',
  'app:configChanged': 'app:configChanged',
  'app:stateChanged': 'app:stateChanged',
  'window:minimize': 'window:minimize',
  'window:maximize': 'window:maximize',
  'window:close': 'window:close',
  'window:devtools': 'window:devtools',
  'menu:open-settings': 'menu:open-settings',
} as const;

/**
 * Safe API exposed to renderer via contextBridge
 * Limited, typed access to main process capabilities
 */
const api = {
  // ============================================================================
  // TOOL API
  // ============================================================================
  tools: {
    execute: (toolName: string, args: Record<string, any>): Promise<ToolExecuteResponse> => {
      return ipcRenderer.invoke(IPC_CHANNELS['tool:execute'], { toolName, args } as ToolExecuteMessage);
    },

    list: (): Promise<Tool[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS['tool:list']);
    },

    respondToFileWriteReview: (response: FileWriteReviewResponse): Promise<{ ok: boolean }> => {
      return ipcRenderer.invoke(IPC_CHANNELS['tool:fileWriteReviewResponse'], response);
    },

    respondToCommandReview: (response: CommandReviewResponse): Promise<{ ok: boolean }> => {
      return ipcRenderer.invoke(IPC_CHANNELS['tool:commandReviewResponse'], response);
    },

    respondToToolPermissionReview: (response: ToolPermissionReviewResponse): Promise<{ ok: boolean }> => {
      return ipcRenderer.invoke(IPC_CHANNELS['tool:permissionReviewResponse'], response);
    },
  },

  // ============================================================================
  // API ENDPOINTS
  // ============================================================================
  api: {
    chat: (request: ChatRequest): Promise<ChatResponse> => {
      return ipcRenderer.invoke(IPC_CHANNELS['api:chat'], request);
    },

    chatStream: (request: ChatStreamRequest): Promise<ChatStreamResponse> => {
      return ipcRenderer.invoke(IPC_CHANNELS['api:chatStream'], request);
    },

    fetchBootstrap: (): Promise<BootstrapData> => {
      return ipcRenderer.invoke(IPC_CHANNELS['api:fetchBootstrap']);
    },
  },

  // ============================================================================
  // MCP API
  // ============================================================================
  mcp: {
    listServers: (): Promise<McpServerInfo[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS['mcp:listServers']);
    },

    listTools: (): Promise<McpToolInfo[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS['mcp:listTools']);
    },

    refresh: (): Promise<McpServerInfo[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS['mcp:refresh']);
    },
  },

  // ============================================================================
  // AUTOMATION API
  // ============================================================================
  automation: {
    listSkills: (): Promise<SkillManifest[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS['automation:listSkills']);
    },

    refreshSkills: (): Promise<SkillManifest[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS['automation:refreshSkills']);
    },

    getSkill: (skillId: string): Promise<SkillDetail> => {
      return ipcRenderer.invoke(IPC_CHANNELS['automation:getSkill'], skillId);
    },

    setSkillEnabled: (skillId: string, enabled: boolean): Promise<SkillManifest> => {
      return ipcRenderer.invoke(IPC_CHANNELS['automation:setSkillEnabled'], { skillId, enabled });
    },

    listTasks: (): Promise<ScheduledTask[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS['automation:listTasks']);
    },

    listTaskRuns: (taskId?: string): Promise<AutomationRunRecord[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS['automation:listTaskRuns'], taskId);
    },

    saveTask: (task: Partial<ScheduledTask>): Promise<ScheduledTask> => {
      return ipcRenderer.invoke(IPC_CHANNELS['automation:saveTask'], task);
    },

    setTaskEnabled: (taskId: string, enabled: boolean): Promise<ScheduledTask> => {
      return ipcRenderer.invoke(IPC_CHANNELS['automation:setTaskEnabled'], { taskId, enabled });
    },

    deleteTask: (taskId: string): Promise<{ ok: true; id: string }> => {
      return ipcRenderer.invoke(IPC_CHANNELS['automation:deleteTask'], taskId);
    },

    runTask: (taskId: string): Promise<ScheduledTask> => {
      return ipcRenderer.invoke(IPC_CHANNELS['automation:runTask'], taskId);
    },

    getSchedulerStatus: (): Promise<AutomationSchedulerStatus> => {
      return ipcRenderer.invoke(IPC_CHANNELS['automation:getSchedulerStatus']);
    },

    getRemoteControl: (): Promise<RemoteControlState> => {
      return ipcRenderer.invoke(IPC_CHANNELS['automation:getRemoteControl']);
    },

    updateRemoteControl: (update: Partial<RemoteControlState>): Promise<RemoteControlState> => {
      return ipcRenderer.invoke(IPC_CHANNELS['automation:updateRemoteControl'], update);
    },

    createRemotePairingCode: (deviceName?: string): Promise<RemoteControlState> => {
      return ipcRenderer.invoke(IPC_CHANNELS['automation:createRemotePairingCode'], deviceName);
    },

    startRemoteControl: (): Promise<RemoteControlState> => {
      return ipcRenderer.invoke(IPC_CHANNELS['automation:startRemoteControl']);
    },

    stopRemoteControl: (): Promise<RemoteControlState> => {
      return ipcRenderer.invoke(IPC_CHANNELS['automation:stopRemoteControl']);
    },

    listTeams: (): Promise<VirtualTeamBlueprint[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS['automation:listTeams']);
    },

    listTeamRuns: (teamId?: string): Promise<VirtualTeamRunRecord[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS['automation:listTeamRuns'], teamId);
    },

    saveTeam: (team: Partial<VirtualTeamBlueprint>): Promise<VirtualTeamBlueprint> => {
      return ipcRenderer.invoke(IPC_CHANNELS['automation:saveTeam'], team);
    },

    deleteTeam: (teamId: string): Promise<{ ok: true; id: string }> => {
      return ipcRenderer.invoke(IPC_CHANNELS['automation:deleteTeam'], teamId);
    },

    createDefaultTeam: (objective?: string): Promise<VirtualTeamBlueprint> => {
      return ipcRenderer.invoke(IPC_CHANNELS['automation:createDefaultTeam'], objective);
    },

    runTeam: (teamId: string): Promise<VirtualTeamRunRecord> => {
      return ipcRenderer.invoke(IPC_CHANNELS['automation:runTeam'], teamId);
    },

    revokeRemoteDevice: (deviceId: string): Promise<RemoteControlState> => {
      return ipcRenderer.invoke(IPC_CHANNELS['automation:revokeRemoteDevice'], deviceId);
    },

    exportProjectState: (options?: { includeRuns?: boolean }): Promise<AutomationProjectExport> => {
      return ipcRenderer.invoke(IPC_CHANNELS['automation:exportProjectState'], options);
    },

    importProjectState: (bundle: Partial<AutomationProjectExport>): Promise<AutomationProjectImportResult> => {
      return ipcRenderer.invoke(IPC_CHANNELS['automation:importProjectState'], bundle);
    },
  },

  // ============================================================================
  // LOCAL HISTORY API
  // ============================================================================
  history: {
    saveRecord: (record: LocalHistoryRecordInput): Promise<LocalHistoryRecord> => {
      return ipcRenderer.invoke(IPC_CHANNELS['history:saveRecord'], record);
    },

    getRecord: (id: string): Promise<LocalHistoryRecord> => {
      return ipcRenderer.invoke(IPC_CHANNELS['history:getRecord'], id);
    },

    listRecords: (filter?: LocalHistoryFilter): Promise<LocalHistoryRecord[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS['history:listRecords'], filter);
    },

    deleteRecord: (id: string): Promise<{ ok: true; id: string }> => {
      return ipcRenderer.invoke(IPC_CHANNELS['history:deleteRecord'], id);
    },

    exportRecords: (filter?: LocalHistoryFilter): Promise<LocalHistoryExport> => {
      return ipcRenderer.invoke(IPC_CHANNELS['history:exportRecords'], filter);
    },

    getStorageInfo: (): Promise<LocalHistoryStorageInfo> => {
      return ipcRenderer.invoke(IPC_CHANNELS['history:getStorageInfo']);
    },
  },

  // ============================================================================
  // FILE SYSTEM API
  // ============================================================================
  fs: {
    read: (path: string, encoding?: string): Promise<string> => {
      return ipcRenderer.invoke(IPC_CHANNELS['fs:read'], { path, encoding } as FileReadRequest);
    },

    write: (path: string, content: string, encoding?: string): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS['fs:write'], { path, content, encoding } as FileWriteRequest);
    },

    list: (path: string): Promise<FileEntry[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS['fs:list'], { path } as FileListRequest);
    },

    open: (path: string): Promise<FilePathActionResult> => {
      return ipcRenderer.invoke(IPC_CHANNELS['fs:open'], { path } as FilePathRequest);
    },

    reveal: (path: string): Promise<FilePathActionResult> => {
      return ipcRenderer.invoke(IPC_CHANNELS['fs:reveal'], { path } as FilePathRequest);
    },
  },

  // ============================================================================
  // AUTHENTICATION API
  // ============================================================================
  auth: {
    getToken: (): Promise<AuthToken | null> => {
      return ipcRenderer.invoke(IPC_CHANNELS['auth:getToken']);
    },

    logout: (): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS['auth:logout']);
    },

    setToken: (token: AuthToken): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS['auth:setToken'], token);
    },
  },

  // ============================================================================
  // APP STATE API
  // ============================================================================
  app: {
    info: (): Promise<AppInfo> => {
      return ipcRenderer.invoke(IPC_CHANNELS['app:info']);
    },

    getConfig: (): Promise<AppConfig> => {
      return ipcRenderer.invoke(IPC_CHANNELS['app:getConfig']);
    },

    setConfig: (config: Partial<AppConfig>): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS['app:setConfig'], config);
    },

    getState: (): Promise<any> => {
      return ipcRenderer.invoke(IPC_CHANNELS['app:getState']);
    },

    setState: (state: any): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS['app:setState'], state);
    },
  },

  // ============================================================================
  // WINDOW API
  // ============================================================================
  window: {
    minimize: (): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS['window:minimize']);
    },

    maximize: (): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS['window:maximize']);
    },

    close: (): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS['window:close']);
    },

    openDevTools: (): Promise<void> => {
      return ipcRenderer.invoke(IPC_CHANNELS['window:devtools']);
    },
  },

  // ============================================================================
  // EVENT LISTENERS
  // ============================================================================
  onToolStart: (callback: (data: ToolStartMessage) => void): (() => void) => {
    const handler = (_event: any, data: ToolStartMessage) => callback(data);
    ipcRenderer.on(IPC_CHANNELS['tool:start'], handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['tool:start'], handler);
  },

  onToolResult: (callback: (data: any) => void): (() => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on(IPC_CHANNELS['tool:result'], handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['tool:result'], handler);
  },

  onToolComplete: (callback: (data: any) => void): (() => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on(IPC_CHANNELS['tool:complete'], handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['tool:complete'], handler);
  },

  onToolError: (callback: (data: any) => void): (() => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on(IPC_CHANNELS['tool:error'], handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['tool:error'], handler);
  },

  onFileWriteReview: (callback: (data: FileWriteReviewRequest) => void): (() => void) => {
    const handler = (_event: any, data: FileWriteReviewRequest) => callback(data);
    ipcRenderer.on(IPC_CHANNELS['tool:fileWriteReview'], handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['tool:fileWriteReview'], handler);
  },

  onCommandReview: (callback: (data: CommandReviewRequest) => void): (() => void) => {
    const handler = (_event: any, data: CommandReviewRequest) => callback(data);
    ipcRenderer.on(IPC_CHANNELS['tool:commandReview'], handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['tool:commandReview'], handler);
  },

  onToolPermissionReview: (callback: (data: ToolPermissionReviewRequest) => void): (() => void) => {
    const handler = (_event: any, data: ToolPermissionReviewRequest) => callback(data);
    ipcRenderer.on(IPC_CHANNELS['tool:permissionReview'], handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['tool:permissionReview'], handler);
  },

  onChatDelta: (callback: (data: ChatDeltaMessage) => void): (() => void) => {
    const handler = (_event: any, data: ChatDeltaMessage) => callback(data);
    ipcRenderer.on(IPC_CHANNELS['api:chatDelta'], handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['api:chatDelta'], handler);
  },

  onChatComplete: (callback: (data: ChatCompleteMessage) => void): (() => void) => {
    const handler = (_event: any, data: ChatCompleteMessage) => callback(data);
    ipcRenderer.on(IPC_CHANNELS['api:chatComplete'], handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['api:chatComplete'], handler);
  },

  onChatError: (callback: (data: ChatErrorMessage) => void): (() => void) => {
    const handler = (_event: any, data: ChatErrorMessage) => callback(data);
    ipcRenderer.on(IPC_CHANNELS['api:chatError'], handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['api:chatError'], handler);
  },

  onConfigChanged: (callback: (data: AppConfigChangedMessage) => void): (() => void) => {
    const handler = (_event: any, data: AppConfigChangedMessage) => callback(data);
    ipcRenderer.on(IPC_CHANNELS['app:configChanged'], handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['app:configChanged'], handler);
  },

  onStateChanged: (callback: (data: AppStateChangedMessage) => void): (() => void) => {
    const handler = (_event: any, data: AppStateChangedMessage) => callback(data);
    ipcRenderer.on(IPC_CHANNELS['app:stateChanged'], handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['app:stateChanged'], handler);
  },

  onMenuOpenSettings: (callback: () => void): (() => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC_CHANNELS['menu:open-settings'], handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS['menu:open-settings'], handler);
  },
};

/**
 * Expose the safe API to renderer process
 * This is the only way renderer can access Node.js capabilities
 */
contextBridge.exposeInMainWorld('api', api);

/**
 * TypeScript type definitions for window.api
 * Can be imported in renderer with: import type { ElectronAPI } from '../preload'
 */
declare global {
  interface Window {
    api: typeof api;
  }
}

export type ElectronAPI = typeof api;
