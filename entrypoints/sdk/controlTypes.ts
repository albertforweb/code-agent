/**
 * SDK Control Types - Internal Protocol Types
 * 
 * These are stub implementations for internal SDK control protocol types.
 * Real implementations will be filled in as needed.
 */

// Stub type for control requests
export interface SDKControlRequest {
  type: string;
  [key: string]: any;
}

// Stub type for control responses
export interface SDKControlResponse {
  type: string;
  success?: boolean;
  error?: string;
  [key: string]: any;
}

// Stub success result type
export interface SDKResultSuccess {
  ok: true;
  value?: any;
}

// Stub error result type
export interface SDKResultError {
  ok: false;
  error: string;
}

export type SDKResult = SDKResultSuccess | SDKResultError;

// Additional control message types
export interface SDKControlInitializeRequest extends SDKControlRequest {
  type: 'initialize';
}

export interface SDKControlInitializeResponse extends SDKControlResponse {
  type: 'initialize';
}

export interface SDKControlMcpSetServersResponse extends SDKControlResponse {
  type: 'mcp:setServers';
}

export interface SDKControlReloadPluginsResponse extends SDKControlResponse {
  type: 'reloadPlugins';
}

export interface StdoutMessage {
  type: 'stdout';
  content: string;
}

export interface SDKPartialAssistantMessage {
  type: 'assistant';
  content?: string;
  [key: string]: any;
}

// Re-export types needed by other modules
export type { SDKControlRequest as SDKMessage };
