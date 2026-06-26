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

export interface ToolExecuteResponse {
  toolId: string;
}

export interface ToolStartMessage {
  toolId: string;
  toolName: string;
  args: Record<string, any>;
  timestamp: number;
}

export interface FileWritePreview {
  path: string;
  absolutePath: string;
  exists: boolean;
  previousSizeBytes: number;
  nextSizeBytes: number;
  diff: string;
}

export interface FileWriteReviewRequest extends FileWritePreview {
  requestId: string;
  toolId: string;
  createdAt: number;
}

export interface FileWriteReviewResponse {
  requestId: string;
  approved: boolean;
  reason?: string;
}

export interface CommandReviewRequest {
  requestId: string;
  toolId: string;
  command: string;
  argv: string[];
  cwd: string;
  absoluteCwd: string;
  timeoutMs: number;
  createdAt: number;
}

export interface CommandReviewResponse {
  requestId: string;
  approved: boolean;
  reason?: string;
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

export type ToolPermissionMode = 'allow' | 'ask' | 'deny';

export interface ToolPermissionReviewRequest {
  requestId: string;
  toolId: string;
  toolName: string;
  args: Record<string, any>;
  createdAt: number;
}

export interface ToolPermissionReviewResponse {
  requestId: string;
  approved: boolean;
  reason?: string;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  source?: 'bridge' | 'mcp' | 'cli';
  readOnly?: boolean;
  category?: string;
}

export interface McpServerInfo {
  name: string;
  type: string;
  scope?: string;
  status: 'configured' | 'connected' | 'error';
  command?: string;
  args?: string[];
  url?: string;
  error?: string;
}

export interface McpToolInfo extends Tool {
  serverName: string;
  serverScope?: string;
  serverKey?: string;
  toolName: string;
}

// ============================================================================
// API CHANNELS
// ============================================================================

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type LlmProviderType = 'anthropic' | 'openai' | 'openai-compatible';

export interface ChatRequest {
  messages: ChatMessage[];
  provider?: LlmProviderType;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  contextTokens?: number;
  enableTools?: boolean;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface ChatStreamRequest extends ChatRequest {
  requestId?: string;
}

export interface ChatStreamResponse {
  requestId: string;
}

export interface ChatDeltaMessage {
  requestId: string;
  delta: string;
  timestamp: number;
}

export interface ChatCompleteMessage {
  requestId: string;
  response: ChatResponse;
  duration: number;
}

export interface ChatErrorMessage {
  requestId: string;
  error: string;
  stack?: string;
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

export interface FilePathRequest {
  path: string;
}

export interface FilePathActionResult {
  ok: true;
  path: string;
  absolutePath: string;
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
  provider?: LlmProviderType;
  expiresAt?: number;
  refreshToken?: string;
}

// ============================================================================
// APP STATE CHANNELS
// ============================================================================

export interface AppConfig {
  apiKey?: string;
  llmProvider?: LlmProviderType;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  contextTokens?: number;
  enableLlmTools?: boolean;
  disabledLlmTools?: string[];
  toolPermissionPolicies?: Record<string, ToolPermissionMode>;
  theme?: 'light' | 'dark' | 'system';
  language?: string;
  [key: string]: any;
}

export interface AppInfo {
  version: string;
  platform: NodeJS.Platform;
  arch: string;
  isDev: boolean;
  workspacePath: string;
}

export interface AppConfigChangedMessage {
  config: AppConfig;
  version: number;
  updatedAt: number;
}

export interface AppStateChangedMessage {
  state: Record<string, any>;
  version: number;
  updatedAt: number;
}

// ============================================================================
// ALL IPC CHANNELS
// ============================================================================

export const IPC_CHANNELS = {
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
  'fs:open': 'fs:open',
  'fs:reveal': 'fs:reveal',

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
} as const;

// Type-safe channel names
export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
