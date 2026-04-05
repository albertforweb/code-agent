/**
 * SDK Types - Stub Implementations
 * 
 * These are temporary stub implementations to allow compilation.
 * They will be properly implemented based on actual usage patterns.
 */

// Hook Event Type
export type HookEvent = string;

// Model Usage Type
export interface ModelUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

// SDK Status Type
export type SDKStatus = 'idle' | 'running' | 'paused' | 'stopped';

// Model Info Type
export interface ModelInfo {
  id: string;
  name?: string;
  provider?: string;
}

// SDK User Message Type
export interface SDKUserMessage {
  type: 'user';
  content: string | any[];
}

// SDK User Message Replay Type
export interface SDKUserMessageReplay {
  type: 'replay';
  originalIndex: number;
}

// Permission Result Type
export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

// MCP Server Config Type
export interface McpServerConfigForProcessTransport {
  type: 'process';
  command: string;
  args?: string[];
}

// MCP Server Status Type
export type McpServerStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

// Rewind Files Result Type
export interface RewindFilesResult {
  rewound: string[];
  failed?: string[];
}

// Hook Events constant
export const HOOK_EVENTS = [
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'Notification',
  'UserPromptSubmit',
  'SessionStart',
  'SessionEnd',
  'Stop',
  'StopFailure',
  'SubagentStart',
  'SubagentStop',
  'PreCompact',
  'PostCompact',
  'PermissionRequest',
  'PermissionDenied',
  'Setup',
  'TeammateIdle',
  'TaskCreated',
  'TaskCompleted',
  'Elicitation',
  'ElicitationResult',
  'ConfigChange',
  'WorktreeCreate',
  'WorktreeRemove',
  'InstructionsLoaded',
];
