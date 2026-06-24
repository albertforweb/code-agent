/**
 * Preload Script
 * Exposes a safe IPC API to the renderer process
 * Context isolation enabled - no direct Node.js access from renderer
 */

import { contextBridge, ipcRenderer } from 'electron';
import type {
  Tool,
  ToolExecuteMessage,
  ChatRequest,
  ChatResponse,
  FileReadRequest,
  FileEntry,
  AuthToken,
  AppConfig,
  BootstrapData,
} from './types';
import { IPC_CHANNELS } from './types';

/**
 * Safe API exposed to renderer via contextBridge
 * Limited, typed access to main process capabilities
 */
const api = {
  // ============================================================================
  // TOOL API
  // ============================================================================
  tools: {
    execute: (toolName: string, args: Record<string, any>): Promise<any> => {
      return ipcRenderer.invoke(IPC_CHANNELS['tool:execute'], { toolName, args } as ToolExecuteMessage);
    },

    list: (): Promise<Tool[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS['tool:list']);
    },
  },

  // ============================================================================
  // API ENDPOINTS
  // ============================================================================
  api: {
    chat: (request: ChatRequest): Promise<ChatResponse> => {
      return ipcRenderer.invoke(IPC_CHANNELS['api:chat'], request);
    },

    fetchBootstrap: (): Promise<BootstrapData> => {
      return ipcRenderer.invoke(IPC_CHANNELS['api:fetchBootstrap']);
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
      return ipcRenderer.invoke(IPC_CHANNELS['fs:write'], { path, content, encoding } as FileReadRequest);
    },

    list: (path: string): Promise<FileEntry[]> => {
      return ipcRenderer.invoke(IPC_CHANNELS['fs:list'], { path } as FileReadRequest);
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
