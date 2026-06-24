/**
 * IPC Communication Types
 * Defines all channels and message types for main/renderer communication
 */

// ============================================================================
// TOOL CHANNELS
// ============================================================================

export interface ToolExecuteMessage {
  toolName: string;
  args: Record<string, any>;
  toolId?: string;
}

export interface ToolResultMessage {
  toolId: string;
  data: any;
  timestamp: number;
}

export interface ToolCompleteMessage {
  toolId: string;
  success: boolean;
  duration: number;
}

export interface ToolErrorMessage {
  toolId: string;
  error: string;
  stack?: string;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

// ============================================================================
// API CHANNELS
// ============================================================================

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface BootstrapData {
  user: any;
  config: any;
  features: Record<string, boolean>;
}

// ============================================================================
// FILE SYSTEM CHANNELS
// ============================================================================

export interface FileReadRequest {
  path: string;
  encoding?: string;
}

export interface FileWriteRequest {
  path: string;
  content: string;
  encoding?: string;
}

export interface FileListRequest {
  path: string;
}

export interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: number;
}

// ============================================================================
// AUTHENTICATION CHANNELS
// ============================================================================

export interface AuthToken {
  accessToken: string;
  expiresAt?: number;
  refreshToken?: string;
}

// ============================================================================
// APP STATE CHANNELS
// ============================================================================

export interface AppConfig {
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  theme?: 'light' | 'dark' | 'system';
  language?: string;
  [key: string]: any;
}

// ============================================================================
// ALL IPC CHANNELS
// ============================================================================

export const IPC_CHANNELS = {
  // Tool channels
  'tool:execute': 'tool:execute',
  'tool:list': 'tool:list',
  'tool:result': 'tool:result',
  'tool:complete': 'tool:complete',
  'tool:error': 'tool:error',

  // API channels
  'api:chat': 'api:chat',
  'api:fetchBootstrap': 'api:fetchBootstrap',

  // File system channels
  'fs:read': 'fs:read',
  'fs:write': 'fs:write',
  'fs:list': 'fs:list',

  // Auth channels
  'auth:getToken': 'auth:getToken',
  'auth:logout': 'auth:logout',
  'auth:setToken': 'auth:setToken',

  // App state channels
  'app:getConfig': 'app:getConfig',
  'app:setConfig': 'app:setConfig',
  'app:getState': 'app:getState',
  'app:setState': 'app:setState',

  // Window channels
  'window:minimize': 'window:minimize',
  'window:maximize': 'window:maximize',
  'window:close': 'window:close',
  'window:devtools': 'window:devtools',
} as const;

// Type-safe channel names
export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
