/**
 * Main Application Component
 * Entry point for the Electron renderer UI
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import hljs from 'highlight.js/lib/common';
import styles from './App.module.css';
import {
  ipcClient,
  type AppConfig,
  type AppInfo,
  type ChatMessage,
  type CommandReviewRequest,
  type FileEntry,
  type FileWriteReviewRequest,
  type ToolCompleteMessage,
  type ToolErrorMessage,
  type ToolResultMessage,
  type ToolStartMessage,
  type ToolPermissionMode,
  type ToolPermissionReviewRequest,
  type LlmProviderType,
  type AutomationProjectExport,
  type LocalHistoryRecord,
  type LocalHistoryRecordType,
  type LocalHistoryStorageInfo,
  type McpServerInfo,
  type McpToolInfo,
  type AutomationRunRecord,
  type AutomationSchedulerStatus,
  type RemoteControlState,
  type ScheduledTask,
  type SkillManifest,
  type Tool,
  type VirtualTeamBlueprint,
  type VirtualTeamMember,
  type VirtualTeamPermissionMode,
  type VirtualTeamRunRecord,
} from './ipc-client';

type MessageRole = 'assistant' | 'user' | 'system' | 'tool' | 'error';
type MessageStatus = 'sent' | 'sending' | 'failed';
type ToolActivityStatus = 'running' | 'succeeded' | 'failed';
type AppView = 'chat' | 'projects' | 'tools' | 'automation' | 'history' | 'settings';
type ProjectsSectionId = 'overview' | 'files' | 'session' | 'runtime';
type ToolsSectionId = 'bridge' | 'mcp' | 'command' | 'activity' | 'plugins';
type AutomationSectionId = 'skills' | 'tasks' | 'remote' | 'team' | 'permissions';
type HistorySectionId = 'overview' | 'chats' | 'tools' | 'automation' | 'events' | 'export';
type SettingsSectionId =
  | 'model'
  | 'io-debug'
  | 'tools-permissions'
  | 'workspace'
  | 'sessions'
  | 'advanced';
type NavigationChildItem<T extends string> = {
  id: T;
  title: string;
  description: string;
};

interface UiMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  status?: MessageStatus;
  title?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

interface PersistedChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  workspacePath?: string;
  messages: UiMessage[];
}

interface PersistedSessionsState {
  currentSessionId: string;
  sessions: PersistedChatSession[];
}

interface DesktopCommand {
  command: string;
  description: string;
}

interface ToolActivity {
  id: string;
  toolName: string;
  args: Record<string, any>;
  status: ToolActivityStatus;
  startedAt: number;
  completedAt?: number;
  duration?: number;
  resultPreview?: string;
  result?: unknown;
  error?: string;
}

interface AnsiSegment {
  text: string;
  style: {
    color?: string;
    fontWeight?: 700;
    opacity?: number;
  };
}

interface SettingsDraft {
  apiKey: string;
  llmProvider: LlmProviderType;
  baseUrl: string;
  model: string;
  fallbackModel: string;
  temperature: number;
  maxTokens: number;
  contextTokens: number;
  enableLlmTools: boolean;
  theme: 'light' | 'dark' | 'system';
  memoryEnabled: boolean;
  pluginsEnabled: boolean;
  autoUpdate: boolean;
  outputFormat: 'text' | 'json' | 'stream-json';
  inputFormat: 'text' | 'stream-json';
  printMode: boolean;
  includeHookEvents: boolean;
  includePartialMessages: boolean;
  replayUserMessages: boolean;
  jsonSchema: string;
  debugEnabled: boolean;
  debugFilter: string;
  debugToStderr: boolean;
  debugFile: string;
  verbose: boolean;
  mcpDebug: boolean;
  bareMode: boolean;
  startupMode: 'none' | 'init' | 'init-only' | 'maintenance';
  thinkingMode: 'adaptive' | 'enabled' | 'disabled';
  effort: 'low' | 'medium' | 'high' | 'max';
  maxThinkingTokens: string;
  maxTurns: string;
  maxBudgetUsd: string;
  taskBudget: string;
  workload: string;
  betas: string;
  agent: string;
  allowedTools: string;
  selectedTools: string;
  disallowedTools: string;
  permissionMode: string;
  permissionPromptTool: string;
  dangerouslySkipPermissions: boolean;
  allowDangerouslySkipPermissions: boolean;
  systemPrompt: string;
  systemPromptFile: string;
  appendSystemPrompt: string;
  appendSystemPromptFile: string;
  mcpConfig: string;
  strictMcpConfig: boolean;
  settingsSource: string;
  settingSources: string;
  addDirs: string;
  pluginDirs: string;
  agentsJson: string;
  disableSlashCommands: boolean;
  chromeIntegration: 'default' | 'enabled' | 'disabled';
  ideAutoConnect: boolean;
  continueSession: boolean;
  resumeSession: string;
  fromPr: string;
  forkSession: boolean;
  noSessionPersistence: boolean;
  resumeSessionAt: string;
  rewindFilesMessageId: string;
  sessionId: string;
  sessionName: string;
  prefill: string;
  deepLinkOrigin: boolean;
  deepLinkRepo: string;
  deepLinkLastFetch: string;
  worktree: string;
  tmuxMode: 'off' | 'default' | 'classic';
  advisorModel: string;
  proactive: boolean;
  fileSpecs: string;
  messagingSocketPath: string;
  briefMode: boolean;
  assistantMode: boolean;
  channelServers: string;
  developmentChannelServers: string;
  agentId: string;
  agentName: string;
  teamName: string;
  agentColor: string;
  planModeRequired: boolean;
  parentSessionId: string;
  teammateMode: 'auto' | 'tmux' | 'in-process';
  agentType: string;
  sdkUrl: string;
  teleportSession: string;
  remoteDescription: string;
  remoteControlName: string;
  hardFail: boolean;
}

const DEFAULT_PROVIDER: LlmProviderType = 'openai-compatible';
const MAX_TOOL_ACTIVITIES = 20;
const MAX_PERSISTED_MESSAGES = 80;
const MAX_RECENT_SESSIONS = 12;
const DESKTOP_SESSIONS_STATE_KEY = 'desktopSessions';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'codeAgentSidebarCollapsed';
const TOOL_PERMISSION_OPTIONS: Array<{ value: ToolPermissionMode; label: string }> = [
  { value: 'allow', label: 'Allow' },
  { value: 'ask', label: 'Ask' },
  { value: 'deny', label: 'Deny' },
];
const TOOL_CATEGORY_ORDER = ['core', 'research', 'connectors', 'mcp', 'api', 'other'] as const;
type ToolCategoryId = typeof TOOL_CATEGORY_ORDER[number];
const TOOL_CATEGORY_LABELS: Record<ToolCategoryId, string> = {
  core: 'Core workspace',
  research: 'Research',
  connectors: 'Connector examples',
  mcp: 'MCP adapters',
  api: 'API bridge',
  other: 'Other',
};
const EMPTY_REMOTE_CONTROL: RemoteControlState = {
  enabled: false,
  mode: 'disabled',
  localNetworkUrls: [],
  approvedDevices: [],
  pendingApprovals: [],
  pendingActions: [],
  auditLog: [],
};
const EMPTY_SCHEDULER_STATUS: AutomationSchedulerStatus = {
  running: false,
  intervalMs: 30_000,
  runningTaskIds: [],
};
const EMPTY_HISTORY_STORAGE: LocalHistoryStorageInfo = {
  storagePath: '',
  recordCount: 0,
};
const PROVIDER_DEFAULTS: Record<LlmProviderType, {
  label: string;
  model: string;
  baseUrl: string;
  maxTokens: number;
  contextTokens: number;
  enableLlmTools: boolean;
}> = {
  openai: {
    label: 'OpenAI',
    model: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1',
    maxTokens: 4096,
    contextTokens: 128000,
    enableLlmTools: false,
  },
  'openai-compatible': {
    label: 'OpenAI-compatible / LM Studio',
    model: 'local-model',
    baseUrl: 'http://127.0.0.1:1234/v1',
    maxTokens: 2048,
    contextTokens: 8192,
    enableLlmTools: false,
  },
};

function getProviderDefault(provider: LlmProviderType) {
  return PROVIDER_DEFAULTS[provider] ?? PROVIDER_DEFAULTS[DEFAULT_PROVIDER];
}

function readStoredSidebarCollapsed(): boolean {
  try {
    return window.localStorage?.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

const PERMISSION_MODES = ['default', 'acceptEdits', 'plan', 'bypassPermissions', 'auto'];
const SETTING_SOURCE_OPTIONS = ['user', 'project', 'local'];
const DESKTOP_COMMANDS: DesktopCommand[] = [
  { command: '/help', description: 'Show desktop commands' },
  { command: '/status', description: 'Show provider, runtime, tools, and MCP status' },
  { command: '/pwd', description: 'Show the current desktop workspace root' },
  { command: '/workspace', description: 'Show the current desktop workspace root' },
  { command: '/login', description: 'Open Settings for provider credentials' },
  { command: '/login lmstudio', description: 'Open Settings with LM Studio defaults' },
  { command: '/settings', description: 'Open Settings' },
  { command: '/tools', description: 'List bridge and MCP tools' },
  { command: '/mcp', description: 'Refresh and list MCP servers/tools' },
  { command: '/automation', description: 'Open skills, scheduled tasks, remote control, and virtual teams' },
  { command: '/skills', description: 'Open local skills and automation extensions' },
  { command: '/tasks', description: 'Open scheduled automation tasks' },
  { command: '/remote', description: 'Open remote-control setup' },
  { command: '/team', description: 'Open virtual team blueprints' },
  { command: '/history', description: 'Open local history and export records' },
  { command: '/sessions', description: 'List saved desktop sessions' },
  { command: '/config', description: 'Show persisted desktop configuration' },
  { command: '/run <tool> <json>', description: 'Run a bridge tool manually' },
  { command: '/clear', description: 'Clear the visible chat' },
];
const PRIMARY_NAV: Array<{
  id: AppView;
  label: string;
  description: string;
  glyph: string;
}> = [
  { id: 'chat', label: 'Chats', description: 'Conversation workspace', glyph: 'C' },
  { id: 'projects', label: 'Projects', description: 'Workspace files and project state', glyph: 'P' },
  { id: 'tools', label: 'Tools', description: 'Bridge tools, MCP, and activity', glyph: 'T' },
  { id: 'automation', label: 'Automation', description: 'Skills, tasks, remote control, teams', glyph: 'A' },
  { id: 'history', label: 'History', description: 'Chats, tool activity, exports, audit', glyph: 'H' },
  { id: 'settings', label: 'Settings', description: 'Model, tools, workspace, sessions', glyph: 'S' },
];
const PROJECTS_MENU: Array<NavigationChildItem<ProjectsSectionId>> = [
  { id: 'overview', title: 'Overview', description: 'Workspace and model context' },
  { id: 'files', title: 'Files', description: 'Browse, open, and reveal files' },
  { id: 'session', title: 'Session', description: 'Current chat and token usage' },
  { id: 'runtime', title: 'Runtime', description: 'App, platform, MCP state' },
];
const TOOLS_MENU: Array<NavigationChildItem<ToolsSectionId>> = [
  { id: 'bridge', title: 'Bridge Tools', description: 'Exposure and permissions' },
  { id: 'mcp', title: 'MCP Registry', description: 'Servers and executable tools' },
  { id: 'command', title: 'Command Runner', description: 'Approved workspace commands' },
  { id: 'activity', title: 'Activity', description: 'Tool-call timeline' },
  { id: 'plugins', title: 'Plugins & Skills', description: 'Configured extension paths' },
];
const SETTINGS_MENU: Array<NavigationChildItem<SettingsSectionId>> = [
  { id: 'model', title: 'Model', description: 'Provider, tokens, theme' },
  { id: 'io-debug', title: 'Output & Debug', description: 'Formats, traces, logs' },
  { id: 'tools-permissions', title: 'Tools & Permissions', description: 'Agent tools and safety' },
  { id: 'workspace', title: 'Workspace Context', description: 'Prompts, MCP, directories' },
  { id: 'sessions', title: 'Sessions & Integrations', description: 'Resume, IDE, browser' },
  { id: 'advanced', title: 'Advanced Compatibility', description: 'Channels and agent metadata' },
];
const AUTOMATION_MENU: Array<NavigationChildItem<AutomationSectionId>> = [
  { id: 'skills', title: 'Skills', description: 'Workspace extensions' },
  { id: 'tasks', title: 'Scheduled Tasks', description: 'Recurring runs and history' },
  { id: 'remote', title: 'Remote Control', description: 'Phone pairing and approvals' },
  { id: 'team', title: 'Virtual Team', description: 'Members, roles, workspaces' },
  { id: 'permissions', title: 'Permissions', description: 'Unattended execution policy' },
];
const HISTORY_MENU: Array<NavigationChildItem<HistorySectionId>> = [
  { id: 'overview', title: 'Overview', description: 'Storage and record counts' },
  { id: 'chats', title: 'Chats', description: 'Saved conversations' },
  { id: 'tools', title: 'Tool Events', description: 'Tool-call audit records' },
  { id: 'automation', title: 'Automation Runs', description: 'Task and team run history' },
  { id: 'events', title: 'Project Events', description: 'Imports, exports, and audit events' },
  { id: 'export', title: 'Export', description: 'Download or copy local history' },
];
const AUTOMATION_PERMISSION_TOOLS = [
  'bash.run',
  'fs.write',
  'fs.undoLastWrite',
  'mcp.callTool',
] as const;
const ANSI_COLORS: Record<number, string> = {
  30: '#1f2937',
  31: '#b91c1c',
  32: '#15803d',
  33: '#a16207',
  34: '#1d4ed8',
  35: '#a21caf',
  36: '#0e7490',
  37: '#f3f4f6',
  90: '#6b7280',
  91: '#ef4444',
  92: '#22c55e',
  93: '#eab308',
  94: '#3b82f6',
  95: '#d946ef',
  96: '#06b6d4',
  97: '#ffffff',
};

function readCliOption(config: AppConfig | null, key: string, fallback = ''): string {
  const value = config?.cliOptions?.[key];
  return value === undefined || value === null ? fallback : String(value);
}

function readCliBoolean(config: AppConfig | null, key: string, fallback = false): boolean {
  const value = config?.cliOptions?.[key];
  return value === undefined || value === null ? fallback : Boolean(value);
}

function readCliChoice<T extends string>(config: AppConfig | null, key: string, fallback: T, choices: readonly T[]): T {
  const value = readCliOption(config, key, fallback);
  return choices.includes(value as T) ? value as T : fallback;
}

function createMessage(
  role: MessageRole,
  content: string,
  overrides: Partial<UiMessage> = {},
): UiMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: Date.now(),
    ...overrides,
  };
}

function createReadyMessages(): UiMessage[] {
  return [createMessage('assistant', 'Ready.', { title: 'CodeAgent' })];
}

function createSessionId(): string {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getSessionTitle(messages: UiMessage[]): string {
  const firstUserMessage = messages.find(message => message.role === 'user' && message.content.trim());
  return firstUserMessage ? formatSidebarLabel(firstUserMessage.content, 56) : 'New chat';
}

function sanitizeMessage(value: unknown): UiMessage | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const message = value as Partial<UiMessage>;
  const role = message.role;
  if (role !== 'assistant' && role !== 'user' && role !== 'system' && role !== 'tool' && role !== 'error') {
    return null;
  }

  return {
    id: typeof message.id === 'string' ? message.id : `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content: typeof message.content === 'string' ? message.content : '',
    createdAt: Number.isFinite(Number(message.createdAt)) ? Number(message.createdAt) : Date.now(),
    status: message.status === 'sending' || message.status === 'failed' || message.status === 'sent'
      ? message.status
      : undefined,
    title: typeof message.title === 'string' ? message.title : undefined,
    usage: message.usage && typeof message.usage === 'object'
      ? {
        inputTokens: Number((message.usage as UiMessage['usage'])?.inputTokens ?? 0),
        outputTokens: Number((message.usage as UiMessage['usage'])?.outputTokens ?? 0),
      }
      : undefined,
  };
}

function sanitizeMessages(messages: unknown): UiMessage[] {
  if (!Array.isArray(messages)) {
    return createReadyMessages();
  }

  const normalized = messages
    .map(sanitizeMessage)
    .filter((message): message is UiMessage => Boolean(message))
    .slice(-MAX_PERSISTED_MESSAGES)
    .map(message => message.status === 'sending' ? { ...message, status: 'sent' as MessageStatus } : message);

  return normalized.length > 0 ? normalized : createReadyMessages();
}

function createSessionSnapshot(
  id: string,
  messages: UiMessage[],
  workspacePath?: string,
  previous?: PersistedChatSession,
): PersistedChatSession {
  const sanitizedMessages = sanitizeMessages(messages);
  return {
    id,
    title: getSessionTitle(sanitizedMessages),
    createdAt: previous?.createdAt ?? sanitizedMessages[0]?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    workspacePath,
    messages: sanitizedMessages,
  };
}

function sortSessions(sessions: PersistedChatSession[]): PersistedChatSession[] {
  const seen = new Set<string>();
  return sessions
    .filter(session => {
      if (!session.id || seen.has(session.id)) {
        return false;
      }
      seen.add(session.id);
      return true;
    })
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_RECENT_SESSIONS);
}

function upsertSession(sessions: PersistedChatSession[], session: PersistedChatSession): PersistedChatSession[] {
  return sortSessions([
    session,
    ...sessions.filter(candidate => candidate.id !== session.id),
  ]);
}

function createEmptySession(workspacePath?: string): PersistedChatSession {
  const id = createSessionId();
  return createSessionSnapshot(id, createReadyMessages(), workspacePath);
}

function sanitizeSession(value: unknown, workspacePath?: string): PersistedChatSession | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Partial<PersistedChatSession>;
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id : createSessionId();
  const messages = sanitizeMessages(raw.messages);

  return {
    id,
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : getSessionTitle(messages),
    createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : messages[0]?.createdAt ?? Date.now(),
    updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : Date.now(),
    workspacePath: typeof raw.workspacePath === 'string' ? raw.workspacePath : workspacePath,
    messages,
  };
}

function restoreSessionsFromState(state: Record<string, any>, workspacePath?: string): PersistedSessionsState {
  const raw = state?.[DESKTOP_SESSIONS_STATE_KEY];
  const restoredSessions = raw && typeof raw === 'object' && Array.isArray(raw.sessions)
    ? raw.sessions
      .map((session: unknown) => sanitizeSession(session, workspacePath))
      .filter((session: PersistedChatSession | null): session is PersistedChatSession => Boolean(session))
    : [];

  const sessions = sortSessions(restoredSessions);
  if (sessions.length === 0) {
    const emptySession = createEmptySession(workspacePath);
    return {
      currentSessionId: emptySession.id,
      sessions: [emptySession],
    };
  }

  const requestedCurrentId = raw && typeof raw === 'object' && typeof raw.currentSessionId === 'string'
    ? raw.currentSessionId
    : '';
  const currentSessionId = sessions.some(session => session.id === requestedCurrentId)
    ? requestedCurrentId
    : sessions[0].id;

  return {
    currentSessionId,
    sessions,
  };
}

function restoreSessionsFromHistory(
  records: LocalHistoryRecord[],
  workspacePath?: string,
): PersistedSessionsState | null {
  const sessions = sortSessions(records
    .map(record => {
      const payload = record.data && typeof record.data === 'object'
        ? (record.data as { session?: unknown })
        : {};
      return sanitizeSession(payload.session ?? record.data, workspacePath);
    })
    .filter((session: PersistedChatSession | null): session is PersistedChatSession => Boolean(session)));

  if (sessions.length === 0) {
    return null;
  }

  return {
    currentSessionId: sessions[0].id,
    sessions,
  };
}

function createSettingsDraft(config: AppConfig | null): SettingsDraft {
  const llmProvider = config?.llmProvider || DEFAULT_PROVIDER;
  const providerDefault = getProviderDefault(llmProvider);

  return {
    apiKey: '',
    llmProvider,
    baseUrl: config?.baseUrl || providerDefault.baseUrl,
    model: config?.model || providerDefault.model,
    fallbackModel: readCliOption(config, 'fallbackModel'),
    temperature: Number(config?.temperature ?? 0.7),
    maxTokens: Number(config?.maxTokens ?? providerDefault.maxTokens),
    contextTokens: Number(config?.contextTokens ?? providerDefault.contextTokens),
    enableLlmTools: Boolean(config?.enableLlmTools ?? providerDefault.enableLlmTools),
    theme: config?.theme || 'system',
    memoryEnabled: Boolean(config?.memoryEnabled ?? true),
    pluginsEnabled: Boolean(config?.pluginsEnabled ?? true),
    autoUpdate: Boolean(config?.autoUpdate ?? false),
    outputFormat: readCliChoice(config, 'outputFormat', 'text', ['text', 'json', 'stream-json']),
    inputFormat: readCliChoice(config, 'inputFormat', 'text', ['text', 'stream-json']),
    printMode: readCliBoolean(config, 'printMode'),
    includeHookEvents: readCliBoolean(config, 'includeHookEvents'),
    includePartialMessages: readCliBoolean(config, 'includePartialMessages'),
    replayUserMessages: readCliBoolean(config, 'replayUserMessages'),
    jsonSchema: readCliOption(config, 'jsonSchema'),
    debugEnabled: readCliBoolean(config, 'debugEnabled'),
    debugFilter: readCliOption(config, 'debugFilter'),
    debugToStderr: readCliBoolean(config, 'debugToStderr'),
    debugFile: readCliOption(config, 'debugFile'),
    verbose: readCliBoolean(config, 'verbose'),
    mcpDebug: readCliBoolean(config, 'mcpDebug'),
    bareMode: readCliBoolean(config, 'bareMode'),
    startupMode: readCliChoice(config, 'startupMode', 'none', ['none', 'init', 'init-only', 'maintenance']),
    thinkingMode: readCliChoice(config, 'thinkingMode', 'adaptive', ['adaptive', 'enabled', 'disabled']),
    effort: readCliChoice(config, 'effort', 'medium', ['low', 'medium', 'high', 'max']),
    maxThinkingTokens: readCliOption(config, 'maxThinkingTokens'),
    maxTurns: readCliOption(config, 'maxTurns'),
    maxBudgetUsd: readCliOption(config, 'maxBudgetUsd'),
    taskBudget: readCliOption(config, 'taskBudget'),
    workload: readCliOption(config, 'workload'),
    betas: readCliOption(config, 'betas'),
    agent: readCliOption(config, 'agent'),
    allowedTools: readCliOption(config, 'allowedTools'),
    selectedTools: readCliOption(config, 'selectedTools', 'default'),
    disallowedTools: readCliOption(config, 'disallowedTools'),
    permissionMode: readCliOption(config, 'permissionMode', 'default'),
    permissionPromptTool: readCliOption(config, 'permissionPromptTool'),
    dangerouslySkipPermissions: readCliBoolean(config, 'dangerouslySkipPermissions'),
    allowDangerouslySkipPermissions: readCliBoolean(config, 'allowDangerouslySkipPermissions'),
    systemPrompt: readCliOption(config, 'systemPrompt'),
    systemPromptFile: readCliOption(config, 'systemPromptFile'),
    appendSystemPrompt: readCliOption(config, 'appendSystemPrompt'),
    appendSystemPromptFile: readCliOption(config, 'appendSystemPromptFile'),
    mcpConfig: readCliOption(config, 'mcpConfig'),
    strictMcpConfig: readCliBoolean(config, 'strictMcpConfig'),
    settingsSource: readCliOption(config, 'settingsSource'),
    settingSources: readCliOption(config, 'settingSources', 'user,project,local'),
    addDirs: readCliOption(config, 'addDirs'),
    pluginDirs: readCliOption(config, 'pluginDirs'),
    agentsJson: readCliOption(config, 'agentsJson'),
    disableSlashCommands: readCliBoolean(config, 'disableSlashCommands'),
    chromeIntegration: readCliChoice(config, 'chromeIntegration', 'default', ['default', 'enabled', 'disabled']),
    ideAutoConnect: readCliBoolean(config, 'ideAutoConnect'),
    continueSession: readCliBoolean(config, 'continueSession'),
    resumeSession: readCliOption(config, 'resumeSession'),
    fromPr: readCliOption(config, 'fromPr'),
    forkSession: readCliBoolean(config, 'forkSession'),
    noSessionPersistence: readCliBoolean(config, 'noSessionPersistence'),
    resumeSessionAt: readCliOption(config, 'resumeSessionAt'),
    rewindFilesMessageId: readCliOption(config, 'rewindFilesMessageId'),
    sessionId: readCliOption(config, 'sessionId'),
    sessionName: readCliOption(config, 'sessionName'),
    prefill: readCliOption(config, 'prefill'),
    deepLinkOrigin: readCliBoolean(config, 'deepLinkOrigin'),
    deepLinkRepo: readCliOption(config, 'deepLinkRepo'),
    deepLinkLastFetch: readCliOption(config, 'deepLinkLastFetch'),
    worktree: readCliOption(config, 'worktree'),
    tmuxMode: readCliChoice(config, 'tmuxMode', 'off', ['off', 'default', 'classic']),
    advisorModel: readCliOption(config, 'advisorModel'),
    proactive: readCliBoolean(config, 'proactive'),
    fileSpecs: readCliOption(config, 'fileSpecs'),
    messagingSocketPath: readCliOption(config, 'messagingSocketPath'),
    briefMode: readCliBoolean(config, 'briefMode'),
    assistantMode: readCliBoolean(config, 'assistantMode'),
    channelServers: readCliOption(config, 'channelServers'),
    developmentChannelServers: readCliOption(config, 'developmentChannelServers'),
    agentId: readCliOption(config, 'agentId'),
    agentName: readCliOption(config, 'agentName'),
    teamName: readCliOption(config, 'teamName'),
    agentColor: readCliOption(config, 'agentColor'),
    planModeRequired: readCliBoolean(config, 'planModeRequired'),
    parentSessionId: readCliOption(config, 'parentSessionId'),
    teammateMode: readCliChoice(config, 'teammateMode', 'auto', ['auto', 'tmux', 'in-process']),
    agentType: readCliOption(config, 'agentType'),
    sdkUrl: readCliOption(config, 'sdkUrl'),
    teleportSession: readCliOption(config, 'teleportSession'),
    remoteDescription: readCliOption(config, 'remoteDescription'),
    remoteControlName: readCliOption(config, 'remoteControlName'),
    hardFail: readCliBoolean(config, 'hardFail'),
  };
}

function buildCliOptions(draft: SettingsDraft): Record<string, unknown> {
  return {
    fallbackModel: draft.fallbackModel,
    outputFormat: draft.outputFormat,
    inputFormat: draft.inputFormat,
    printMode: draft.printMode,
    includeHookEvents: draft.includeHookEvents,
    includePartialMessages: draft.includePartialMessages,
    replayUserMessages: draft.replayUserMessages,
    jsonSchema: draft.jsonSchema,
    debugEnabled: draft.debugEnabled,
    debugFilter: draft.debugFilter,
    debugToStderr: draft.debugToStderr,
    debugFile: draft.debugFile,
    verbose: draft.verbose,
    mcpDebug: draft.mcpDebug,
    bareMode: draft.bareMode,
    startupMode: draft.startupMode,
    thinkingMode: draft.thinkingMode,
    effort: draft.effort,
    maxThinkingTokens: draft.maxThinkingTokens,
    maxTurns: draft.maxTurns,
    maxBudgetUsd: draft.maxBudgetUsd,
    taskBudget: draft.taskBudget,
    workload: draft.workload,
    betas: draft.betas,
    agent: draft.agent,
    allowedTools: draft.allowedTools,
    selectedTools: draft.selectedTools,
    disallowedTools: draft.disallowedTools,
    permissionMode: draft.permissionMode,
    permissionPromptTool: draft.permissionPromptTool,
    dangerouslySkipPermissions: draft.dangerouslySkipPermissions,
    allowDangerouslySkipPermissions: draft.allowDangerouslySkipPermissions,
    systemPrompt: draft.systemPrompt,
    systemPromptFile: draft.systemPromptFile,
    appendSystemPrompt: draft.appendSystemPrompt,
    appendSystemPromptFile: draft.appendSystemPromptFile,
    mcpConfig: draft.mcpConfig,
    strictMcpConfig: draft.strictMcpConfig,
    settingsSource: draft.settingsSource,
    settingSources: draft.settingSources,
    addDirs: draft.addDirs,
    pluginDirs: draft.pluginDirs,
    agentsJson: draft.agentsJson,
    disableSlashCommands: draft.disableSlashCommands,
    chromeIntegration: draft.chromeIntegration,
    ideAutoConnect: draft.ideAutoConnect,
    continueSession: draft.continueSession,
    resumeSession: draft.resumeSession,
    fromPr: draft.fromPr,
    forkSession: draft.forkSession,
    noSessionPersistence: draft.noSessionPersistence,
    resumeSessionAt: draft.resumeSessionAt,
    rewindFilesMessageId: draft.rewindFilesMessageId,
    sessionId: draft.sessionId,
    sessionName: draft.sessionName,
    prefill: draft.prefill,
    deepLinkOrigin: draft.deepLinkOrigin,
    deepLinkRepo: draft.deepLinkRepo,
    deepLinkLastFetch: draft.deepLinkLastFetch,
    worktree: draft.worktree,
    tmuxMode: draft.tmuxMode,
    advisorModel: draft.advisorModel,
    proactive: draft.proactive,
    fileSpecs: draft.fileSpecs,
    messagingSocketPath: draft.messagingSocketPath,
    briefMode: draft.briefMode,
    assistantMode: draft.assistantMode,
    channelServers: draft.channelServers,
    developmentChannelServers: draft.developmentChannelServers,
    agentId: draft.agentId,
    agentName: draft.agentName,
    teamName: draft.teamName,
    agentColor: draft.agentColor,
    planModeRequired: draft.planModeRequired,
    parentSessionId: draft.parentSessionId,
    teammateMode: draft.teammateMode,
    agentType: draft.agentType,
    sdkUrl: draft.sdkUrl,
    teleportSession: draft.teleportSession,
    remoteDescription: draft.remoteDescription,
    remoteControlName: draft.remoteControlName,
    hardFail: draft.hardFail,
  };
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function truncateText(value: string, maxLength = 220): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1)}...`;
}

function summarizeToolValue(value: unknown): string {
  if (value === undefined) {
    return 'ok';
  }

  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof value === 'string') {
    return value.length > 80
      ? `${value.length} chars`
      : `"${value}"`;
  }

  if (Array.isArray(value)) {
    return `${value.length} items`;
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    return keys.length > 0 ? `{${keys.slice(0, 4).join(', ')}}` : '{}';
  }

  return typeof value;
}

function summarizeToolArgs(args: Record<string, any>): string {
  const entries = Object.entries(args || {});
  if (entries.length === 0) {
    return 'No arguments';
  }

  return truncateText(entries
    .map(([key, value]) => `${key}: ${summarizeToolValue(value)}`)
    .join(', '), 180);
}

function summarizeToolResult(data: unknown): string {
  if (data === undefined) {
    return 'ok';
  }

  const compact = typeof data === 'string'
    ? data.replace(/\s+/g, ' ').trim()
    : formatJson(data).replace(/\s+/g, ' ').trim();

  return truncateText(compact || 'ok', 220);
}

function formatSidebarLabel(content: string, maxLength = 42): string {
  const normalized = content.replace(/\s+/g, ' ').trim();
  return truncateText(normalized || 'Untitled chat', maxLength);
}

function formatRelativeTime(timestamp: number): string {
  const deltaMs = Math.max(0, Date.now() - timestamp);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (deltaMs < minute) {
    return 'just now';
  }

  if (deltaMs < hour) {
    const minutes = Math.max(1, Math.round(deltaMs / minute));
    return `${minutes}m ago`;
  }

  if (deltaMs < day) {
    const hours = Math.max(1, Math.round(deltaMs / hour));
    return `${hours}h ago`;
  }

  const days = Math.max(1, Math.round(deltaMs / day));
  return `${days}d ago`;
}

function getHistoryRecordTypeLabel(type: LocalHistoryRecordType): string {
  switch (type) {
    case 'chat-session':
      return 'Chat';
    case 'tool-event':
      return 'Tool';
    case 'automation-run':
      return 'Automation';
    case 'project-event':
      return 'Project';
    default:
      return type;
  }
}

function getHistoryRecordTitle(record: LocalHistoryRecord): string {
  if (record.title) {
    return record.title;
  }

  if (record.type === 'chat-session') {
    const session = (record.data as { session?: PersistedChatSession } | undefined)?.session;
    return session?.title ?? 'Chat session';
  }

  if (record.type === 'tool-event') {
    const data = record.data as { toolName?: string; toolId?: string } | undefined;
    return data?.toolName ?? data?.toolId ?? 'Tool event';
  }

  if (record.type === 'automation-run') {
    const data = record.data as { name?: string; teamName?: string; taskName?: string } | undefined;
    return data?.teamName ?? data?.taskName ?? data?.name ?? 'Automation run';
  }

  return 'Project event';
}

function getHistoryRecordSummary(record: LocalHistoryRecord): string {
  const data = record.data && typeof record.data === 'object'
    ? record.data as Record<string, any>
    : {};

  if (record.type === 'chat-session') {
    const session = data.session as PersistedChatSession | undefined;
    return session
      ? `${session.messages.length} messages / updated ${formatRelativeTime(session.updatedAt)}`
      : 'Saved conversation';
  }

  if (record.type === 'tool-event') {
    const status = data.status ?? (data.success === false ? 'failed' : data.success === true ? 'succeeded' : 'recorded');
    return `${data.toolName ?? data.toolId ?? 'Tool'} / ${status}`;
  }

  if (record.type === 'automation-run') {
    const status = data.status ?? data.lastStatus ?? 'recorded';
    return data.summary ?? data.lastResult ?? data.error ?? `Automation status: ${status}`;
  }

  return data.event ? String(data.event) : 'Project event';
}

function normalizeWorkspacePath(value: string): string {
  const normalized = value
    .replace(/\\/g, '/')
    .split('/')
    .filter(part => part && part !== '.')
    .join('/');

  return normalized || '.';
}

function joinWorkspacePath(parent: string, child: string): string {
  return normalizeWorkspacePath(`${parent === '.' ? '' : parent}/${child}`);
}

function getWorkspaceParentPath(value: string): string {
  const normalized = normalizeWorkspacePath(value);
  if (normalized === '.') {
    return '.';
  }

  const parts = normalized.split('/');
  parts.pop();
  return parts.length > 0 ? parts.join('/') : '.';
}

function sortFileEntries(entries: FileEntry[]): FileEntry[] {
  return [...entries].sort((left, right) => {
    if (left.type !== right.type) {
      return left.type === 'directory' ? -1 : 1;
    }

    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
  });
}

function formatFileSize(size?: number): string {
  if (typeof size !== 'number' || !Number.isFinite(size)) {
    return '';
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeToolNameList(value: unknown): string[] {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];

  return Array.from(new Set(
    rawValues
      .map(item => String(item).trim())
      .filter(Boolean),
  )).sort((left, right) => left.localeCompare(right));
}

function getDisabledModelToolSet(config: AppConfig | null): Set<string> {
  return new Set(normalizeToolNameList(config?.disabledLlmTools));
}

function isToolExposedToModel(tool: Tool, config: AppConfig | null): boolean {
  return !getDisabledModelToolSet(config).has(tool.name);
}

function getToolPermissionPolicy(tool: Tool, config: AppConfig | null): ToolPermissionMode {
  const configured = config?.toolPermissionPolicies?.[tool.name];
  return configured === 'allow' || configured === 'ask' || configured === 'deny'
    ? configured
    : 'allow';
}

function getToolCategory(tool: Tool): ToolCategoryId {
  if (tool.name.startsWith('fs.') || tool.name.startsWith('bash.') || tool.name.startsWith('time.')) {
    return 'core';
  }

  if (tool.name.startsWith('web.')) {
    return 'research';
  }

  if (tool.name.startsWith('finance.') || tool.name.startsWith('automation.')) {
    return 'connectors';
  }

  if (tool.name.startsWith('mcp.')) {
    return 'mcp';
  }

  if (tool.name.startsWith('api.') || tool.name.startsWith('app.')) {
    return 'api';
  }

  return 'other';
}

function groupToolsByCategory(tools: Tool[]): Array<{ id: ToolCategoryId; label: string; tools: Tool[] }> {
  return TOOL_CATEGORY_ORDER
    .map(id => ({
      id,
      label: TOOL_CATEGORY_LABELS[id],
      tools: tools.filter(tool => getToolCategory(tool) === id),
    }))
    .filter(group => group.tools.length > 0);
}

function getToolResultPath(activity: ToolActivity): string | null {
  if (!activity.toolName.startsWith('fs.') || !activity.result || typeof activity.result !== 'object') {
    return null;
  }

  const pathValue = (activity.result as { path?: unknown }).path;
  return typeof pathValue === 'string' && pathValue.trim() ? pathValue : null;
}

function matchesSessionSearch(session: PersistedChatSession, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const haystack = [
    session.title,
    session.workspacePath ?? '',
    ...session.messages.map(message => `${message.title ?? ''} ${message.content}`),
  ].join('\n').toLowerCase();

  return haystack.includes(normalizedQuery);
}

function filterDesktopCommands(input: string): DesktopCommand[] {
  if (!input.startsWith('/')) {
    return [];
  }

  const query = input.trim().toLowerCase();
  return DESKTOP_COMMANDS
    .filter(command => {
      if (!query || query === '/') {
        return true;
      }

      return command.command.toLowerCase().startsWith(query) ||
        command.description.toLowerCase().includes(query.slice(1));
    })
    .slice(0, 8);
}

function formatDesktopError(rawError: unknown): string {
  const message = rawError instanceof Error ? rawError.message : String(rawError ?? '');
  const lower = message.toLowerCase();

  if (
    lower.includes('fetch failed') ||
    lower.includes('econnrefused') ||
    lower.includes('failed to fetch') ||
    lower.includes('connect econnrefused')
  ) {
    return [
      'The configured LLM endpoint is not reachable.',
      'Check that LM Studio or your OpenAI-compatible server is running, then verify Settings -> Model base URL and model ID.',
      `Details: ${message}`,
    ].join('\n');
  }

  if (
    lower.includes('context length') ||
    lower.includes('context size') ||
    lower.includes('n_ctx') ||
    lower.includes('exceeds the available context') ||
    lower.includes('tokens to keep')
  ) {
    return [
      'The model context window is too small for this request.',
      'Increase the model context length in LM Studio, reduce enabled tools in Tools, or lower Settings -> Model context tokens.',
      `Details: ${message}`,
    ].join('\n');
  }

  if (
    lower.includes('misformatted') ||
    lower.includes('malformed') ||
    lower.includes('tool arguments must be a json object') ||
    lower.includes("must contain a 'content' field")
  ) {
    return [
      'The model or backend returned a malformed tool/chat payload.',
      'Try the request again with fewer enabled tools. If this repeats with a local model, try a stronger tool-calling model or disable model tool calls.',
      `Details: ${message}`,
    ].join('\n');
  }

  if (
    lower.includes('home-directory paths are not supported') ||
    lower.includes('path traversal not allowed') ||
    lower.includes('unsupported paths')
  ) {
    return [
      'The requested path is outside the desktop workspace policy.',
      'Use a workspace-relative path from the Projects view, or move the file into the current workspace.',
      `Details: ${message}`,
    ].join('\n');
  }

  return message;
}

function parseToolCommand(input: string): { toolName: string; args: Record<string, any> } | null {
  const match = input.match(/^\/run\s+(\S+)(?:\s+([\s\S]+))?$/);
  if (!match) {
    return null;
  }

  const [, toolName, rawArgs] = match;
  if (!rawArgs?.trim()) {
    return { toolName, args: {} };
  }

  const parsed = JSON.parse(rawArgs);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Tool arguments must be a JSON object');
  }

  return { toolName, args: parsed as Record<string, any> };
}

function getChatMessages(messages: UiMessage[], nextUserMessage: string): ChatMessage[] {
  const history = messages
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .map(message => ({
      role: message.role as 'user' | 'assistant',
      content: message.content,
    }));

  return [...history, { role: 'user', content: nextUserMessage }];
}

function parseAnsiText(text: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  const pattern = /\x1b\[([0-9;]*)m/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let style: AnsiSegment['style'] = {};

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), style: { ...style } });
    }

    style = applyAnsiCodes(style, match[1]);
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), style: { ...style } });
  }

  return segments.length > 0 ? segments : [{ text, style: {} }];
}

function applyAnsiCodes(style: AnsiSegment['style'], rawCodes: string): AnsiSegment['style'] {
  const codes = rawCodes === '' ? [0] : rawCodes.split(';').map(code => Number(code));
  let next = { ...style };

  for (const code of codes) {
    if (code === 0) {
      next = {};
    } else if (code === 1) {
      next.fontWeight = 700;
    } else if (code === 2) {
      next.opacity = 0.72;
    } else if (code === 22) {
      delete next.fontWeight;
      delete next.opacity;
    } else if (code === 39) {
      delete next.color;
    } else if (ANSI_COLORS[code]) {
      next.color = ANSI_COLORS[code];
    }
  }

  return next;
}

function renderAnsiText(text: string): React.ReactNode {
  return parseAnsiText(text).map((segment, index) => (
    <span style={segment.style} key={`${index}-${segment.text.slice(0, 8)}`}>
      {segment.text}
    </span>
  ));
}

export function App() {
  const [status, setStatus] = useState('Initializing');
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [appState, setAppState] = useState<Record<string, any>>({});
  const [viewportSize, setViewportSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const [tools, setTools] = useState<Tool[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([]);
  const [mcpTools, setMcpTools] = useState<McpToolInfo[]>([]);
  const [skills, setSkills] = useState<SkillManifest[]>([]);
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([]);
  const [taskRuns, setTaskRuns] = useState<AutomationRunRecord[]>([]);
  const [remoteControl, setRemoteControl] = useState<RemoteControlState>(EMPTY_REMOTE_CONTROL);
  const [virtualTeams, setVirtualTeams] = useState<VirtualTeamBlueprint[]>([]);
  const [teamRuns, setTeamRuns] = useState<VirtualTeamRunRecord[]>([]);
  const [runningTeamIds, setRunningTeamIds] = useState<Set<string>>(() => new Set());
  const runningTeamIdsRef = useRef<Set<string>>(new Set());
  const [schedulerStatus, setSchedulerStatus] = useState<AutomationSchedulerStatus>(EMPTY_SCHEDULER_STATUS);
  const [automationMessage, setAutomationMessage] = useState('');
  const [historyRecords, setHistoryRecords] = useState<LocalHistoryRecord[]>([]);
  const [historyStorageInfo, setHistoryStorageInfo] = useState<LocalHistoryStorageInfo>(EMPTY_HISTORY_STORAGE);
  const [historyMessage, setHistoryMessage] = useState('');
  const [historyExportText, setHistoryExportText] = useState('');
  const [automationExportText, setAutomationExportText] = useState('');
  const [automationImportText, setAutomationImportText] = useState('');
  const [workspacePath, setWorkspacePath] = useState('.');
  const [workspaceEntries, setWorkspaceEntries] = useState<FileEntry[]>([]);
  const [workspaceBrowserError, setWorkspaceBrowserError] = useState('');
  const [workspaceActionMessage, setWorkspaceActionMessage] = useState('');
  const [isLoadingWorkspaceEntries, setIsLoadingWorkspaceEntries] = useState(false);
  const [toolActivities, setToolActivities] = useState<ToolActivity[]>([]);
  const [fileWriteReviews, setFileWriteReviews] = useState<FileWriteReviewRequest[]>([]);
  const [commandReviews, setCommandReviews] = useState<CommandReviewRequest[]>([]);
  const [toolPermissionReviews, setToolPermissionReviews] = useState<ToolPermissionReviewRequest[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState(() => createSessionId());
  const [sessions, setSessions] = useState<PersistedChatSession[]>([]);
  const [messages, setMessages] = useState<UiMessage[]>(() => createReadyMessages());
  const [input, setInput] = useState('');
  const [sessionSearch, setSessionSearch] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>(() => createSettingsDraft(null));
  const [settingsMessage, setSettingsMessage] = useState('');
  const [toolRouterMessage, setToolRouterMessage] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [activeView, setActiveView] = useState<AppView>('chat');
  const [activeProjectsSection, setActiveProjectsSection] = useState<ProjectsSectionId>('overview');
  const [activeToolsSection, setActiveToolsSection] = useState<ToolsSectionId>('bridge');
  const [activeAutomationSection, setActiveAutomationSection] = useState<AutomationSectionId>('tasks');
  const [activeHistorySection, setActiveHistorySection] = useState<HistorySectionId>('overview');
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSectionId>('model');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readStoredSidebarCollapsed());

  const messageListRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const streamMessageIds = useRef<Map<string, string>>(new Map());
  const hasHydratedSessionsRef = useRef(false);

  const tokenUsage = useMemo(() => {
    return messages.reduce(
      (totals, message) => ({
        inputTokens: totals.inputTokens + (message.usage?.inputTokens ?? 0),
        outputTokens: totals.outputTokens + (message.usage?.outputTokens ?? 0),
      }),
      { inputTokens: 0, outputTokens: 0 },
    );
  }, [messages]);

  useEffect(() => {
    initializeApp();
  }, []);

  useEffect(() => {
    try {
      window.localStorage?.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(sidebarCollapsed));
    } catch {
      // Non-critical preference persistence.
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    const handleResize = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const removers: Array<() => void> = [];

    try {
      removers.push(ipcClient.onChatDelta(data => {
        const messageId = streamMessageIds.current.get(data.requestId);
        if (!messageId) {
          return;
        }

        setMessages(current => current.map(message => (
          message.id === messageId
            ? { ...message, content: `${message.content}${data.delta}` }
            : message
        )));
      }));

      removers.push(ipcClient.onChatComplete(data => {
        const messageId = streamMessageIds.current.get(data.requestId);
        streamMessageIds.current.delete(data.requestId);

        if (messageId) {
          setMessages(current => current.map(message => (
            message.id === messageId
              ? {
                ...message,
                content: data.response.content || message.content || 'No response content.',
                status: 'sent',
                title: data.response.model,
                usage: data.response.usage,
              }
              : message
          )));
        }

        setIsSending(false);
        setStatus('Ready');
        inputRef.current?.focus();
      }));

      removers.push(ipcClient.onChatError(data => {
        const messageId = streamMessageIds.current.get(data.requestId);
        streamMessageIds.current.delete(data.requestId);

        if (messageId) {
          setMessages(current => current.map(message => (
            message.id === messageId
              ? { ...message, content: formatDesktopError(data.error), status: 'failed', title: 'Request failed', role: 'error' }
              : message
          )));
        } else {
          appendMessage(createMessage('error', formatDesktopError(data.error), {
            title: 'Request failed',
            status: 'failed',
          }));
        }

        setIsSending(false);
        setStatus('Error');
        inputRef.current?.focus();
      }));

      removers.push(ipcClient.onToolStart(data => {
        recordToolStart(data);
      }));

      removers.push(ipcClient.onToolResult(data => {
        recordToolResult(data);
        appendMessage(createMessage('tool', `\`\`\`json\n${formatJson(data.data)}\n\`\`\``, {
          title: `Tool result ${data.toolId}`,
        }));
      }));

      removers.push(ipcClient.onToolComplete(data => {
        recordToolComplete(data);
        appendMessage(createMessage('tool', `${data.success ? 'Completed' : 'Failed'} in ${data.duration} ms`, {
          title: `Tool ${data.toolId}`,
        }));
      }));

      removers.push(ipcClient.onToolError(data => {
        recordToolError(data);
        appendMessage(createMessage('error', formatDesktopError(data.error), {
          title: `Tool error ${data.toolId}`,
          status: 'failed',
        }));
      }));

      removers.push(ipcClient.onFileWriteReview(data => {
        setFileWriteReviews(current => [
          ...current.filter(review => review.requestId !== data.requestId),
          data,
        ]);
        setStatus('Approval needed');
        appendMessage(createMessage('system', `Review requested for ${data.path}`, {
          title: 'File write approval',
        }));
      }));

      removers.push(ipcClient.onCommandReview(data => {
        setCommandReviews(current => [
          ...current.filter(review => review.requestId !== data.requestId),
          data,
        ]);
        setStatus('Approval needed');
        appendMessage(createMessage('system', `Review requested for command: ${data.command}`, {
          title: 'Command approval',
        }));
      }));

      removers.push(ipcClient.onToolPermissionReview(data => {
        setToolPermissionReviews(current => [
          ...current.filter(review => review.requestId !== data.requestId),
          data,
        ]);
        setStatus('Approval needed');
        appendMessage(createMessage('system', `Review requested for tool: ${data.toolName}`, {
          title: 'Tool permission',
        }));
      }));

      removers.push(ipcClient.onConfigChanged(data => {
        setAppConfig(data.config);
        setSettingsDraft(current => ({
          ...createSettingsDraft(data.config),
          apiKey: current.apiKey,
        }));
      }));

      removers.push(ipcClient.onStateChanged(data => {
        setAppState(data.state);
      }));

      removers.push(ipcClient.onMenuOpenSettings(() => {
        setSettingsMessage('');
        setActiveView('settings');
      }));
    } catch (error) {
      setStatus('Startup error');
      appendMessage(createMessage('error', error instanceof Error ? error.message : String(error), {
        title: 'IPC unavailable',
        status: 'failed',
      }));
    }

    return () => {
      for (const remove of removers) {
        remove();
      }
    };
  }, []);

  useEffect(() => {
    messageListRef.current?.scrollTo({
      top: messageListRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, isSending]);

  useEffect(() => {
    if (!hasHydratedSessionsRef.current || !currentSessionId) {
      return;
    }

    setSessions(current => {
      const previous = current.find(session => session.id === currentSessionId);
      return upsertSession(
        current,
        createSessionSnapshot(currentSessionId, messages, appInfo?.workspacePath, previous),
      );
    });
  }, [messages, currentSessionId, appInfo?.workspacePath]);

  useEffect(() => {
    if (!hasHydratedSessionsRef.current || sessions.length === 0 || !currentSessionId) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const activeSession = sessions.find(session => session.id === currentSessionId);
      ipcClient.app.setState({
        [DESKTOP_SESSIONS_STATE_KEY]: {
          currentSessionId,
          sessions,
        },
      }).catch(error => {
        console.warn('Failed to persist desktop session state:', error);
      });

      if (activeSession) {
        ipcClient.history.saveRecord({
          id: `chat-session-${activeSession.id}`,
          type: 'chat-session',
          workspacePath: activeSession.workspacePath ?? appInfo?.workspacePath,
          title: activeSession.title,
          data: {
            currentSessionId,
            session: activeSession,
          },
          createdAt: activeSession.createdAt,
          updatedAt: activeSession.updatedAt,
        }).catch(error => {
          console.warn('Failed to persist desktop session history:', error);
        });
      }
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [sessions, currentSessionId, appInfo?.workspacePath]);

  useEffect(() => {
    const theme = appConfig?.theme || 'system';
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    document.body.classList.toggle('dark', theme === 'dark' || (theme === 'system' && prefersDark));
  }, [appConfig?.theme]);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [input]);

  useEffect(() => {
    if (activeView === 'projects' && workspaceEntries.length === 0 && !isLoadingWorkspaceEntries) {
      loadWorkspaceDirectory(workspacePath);
    }
  }, [activeView]);

  async function initializeApp() {
    try {
      const [
        info,
        config,
        state,
        bridgeTools,
        servers,
        discoveredMcpTools,
        discoveredSkills,
        tasks,
        runs,
        remote,
        teams,
        teamRunHistory,
        scheduler,
        historySessions,
        allHistoryRecords,
        storageInfo,
      ] = await Promise.all([
        ipcClient.app.info(),
        ipcClient.app.getConfig(),
        ipcClient.app.getState(),
        ipcClient.tools.list(),
        ipcClient.mcp.listServers(),
        ipcClient.mcp.listTools(),
        ipcClient.automation.listSkills(),
        ipcClient.automation.listTasks(),
        ipcClient.automation.listTaskRuns(),
        ipcClient.automation.getRemoteControl(),
        ipcClient.automation.listTeams(),
        ipcClient.automation.listTeamRuns(),
        ipcClient.automation.getSchedulerStatus(),
        ipcClient.history.listRecords({ type: 'chat-session', limit: MAX_RECENT_SESSIONS }),
        ipcClient.history.listRecords({ limit: 500 }),
        ipcClient.history.getStorageInfo(),
      ]);

      setAppInfo(info);
      setAppConfig(config);
      setAppState(state);
      setSettingsDraft(createSettingsDraft(config));
      setTools(bridgeTools);
      setMcpServers(servers);
      setMcpTools(discoveredMcpTools);
      setSkills(discoveredSkills);
      setScheduledTasks(tasks);
      setTaskRuns(runs);
      setRemoteControl(remote);
      setVirtualTeams(teams);
      setTeamRuns(teamRunHistory);
      setSchedulerStatus(scheduler);
      setHistoryRecords(allHistoryRecords);
      setHistoryStorageInfo(storageInfo);
      const hasLegacySessions = Boolean(state?.[DESKTOP_SESSIONS_STATE_KEY]);
      const restoredSessions = hasLegacySessions
        ? restoreSessionsFromState(state, info.workspacePath)
        : restoreSessionsFromHistory(historySessions, info.workspacePath)
          ?? restoreSessionsFromState(state, info.workspacePath);
      const activeSession = restoredSessions.sessions.find(session => session.id === restoredSessions.currentSessionId)
        ?? restoredSessions.sessions[0];
      setSessions(restoredSessions.sessions);
      setCurrentSessionId(restoredSessions.currentSessionId);
      setMessages(activeSession?.messages ?? createReadyMessages());
      hasHydratedSessionsRef.current = true;
      setStatus('Ready');
    } catch (error) {
      console.error('Failed to initialize app:', error);
      hasHydratedSessionsRef.current = true;
      setStatus('Startup error');
      appendMessage(createMessage('error', formatDesktopError(error), {
        title: 'Startup error',
        status: 'failed',
      }));
    }
  }

  function appendMessage(message: UiMessage) {
    setMessages(current => [...current, message]);
  }

  function startNewChat() {
    const nextSession = createEmptySession(appInfo?.workspacePath);
    setSessions(current => {
      const previous = current.find(session => session.id === currentSessionId);
      const withCurrent = currentSessionId
        ? upsertSession(current, createSessionSnapshot(currentSessionId, messages, appInfo?.workspacePath, previous))
        : current;
      return upsertSession(withCurrent, nextSession);
    });
    setCurrentSessionId(nextSession.id);
    setMessages(nextSession.messages);
    setInput('');
    setStatus('Ready');
    setActiveView('chat');
    inputRef.current?.focus();
  }

  function loadSession(sessionId: string) {
    const session = sessions.find(candidate => candidate.id === sessionId);
    if (!session) {
      return;
    }

    setCurrentSessionId(session.id);
    setMessages(sanitizeMessages(session.messages));
    setInput('');
    setStatus('Ready');
    setActiveView('chat');
    inputRef.current?.focus();
  }

  function recordToolStart(data: ToolStartMessage) {
    const activity: ToolActivity = {
      id: data.toolId,
      toolName: data.toolName,
      args: data.args || {},
      status: 'running',
      startedAt: data.timestamp,
    };

    setToolActivities(current => [
      activity,
      ...current.filter(activity => activity.id !== data.toolId),
    ].slice(0, MAX_TOOL_ACTIVITIES));
  }

  function updateToolActivity(
    toolId: string,
    update: Partial<ToolActivity>,
    fallbackName = 'Tool',
  ) {
    setToolActivities(current => {
      const existing = current.find(activity => activity.id === toolId);
      const updatedActivity: ToolActivity = {
        id: toolId,
        toolName: existing?.toolName || fallbackName,
        args: existing?.args || {},
        status: existing?.status || 'running',
        startedAt: existing?.startedAt || Date.now(),
        ...existing,
        ...update,
      };

      return [
        updatedActivity,
        ...current.filter(activity => activity.id !== toolId),
      ].slice(0, MAX_TOOL_ACTIVITIES);
    });
  }

  function recordToolResult(data: ToolResultMessage) {
    updateToolActivity(data.toolId, {
      resultPreview: summarizeToolResult(data.data),
      result: data.data,
    });
  }

  function recordToolComplete(data: ToolCompleteMessage) {
    updateToolActivity(data.toolId, {
      status: data.success ? 'succeeded' : 'failed',
      duration: data.duration,
      completedAt: Date.now(),
    });
  }

  function recordToolError(data: ToolErrorMessage) {
    updateToolActivity(data.toolId, {
      status: 'failed',
      error: data.error,
      completedAt: Date.now(),
    });
  }

  function updateSettingsDraft(update: Partial<SettingsDraft>) {
    setSettingsDraft(current => ({ ...current, ...update }));
  }

  async function refreshBridgeData() {
    const [bridgeTools, servers, discoveredMcpTools] = await Promise.all([
      ipcClient.tools.list(),
      ipcClient.mcp.refresh(),
      ipcClient.mcp.listTools(),
    ]);

    setTools(bridgeTools);
    setMcpServers(servers);
    setMcpTools(discoveredMcpTools);

    return { bridgeTools, servers, discoveredMcpTools };
  }

  async function refreshAutomationData() {
    const [discoveredSkills, tasks, runs, remote, teams, teamRunHistory, scheduler] = await Promise.all([
      ipcClient.automation.refreshSkills(),
      ipcClient.automation.listTasks(),
      ipcClient.automation.listTaskRuns(),
      ipcClient.automation.getRemoteControl(),
      ipcClient.automation.listTeams(),
      ipcClient.automation.listTeamRuns(),
      ipcClient.automation.getSchedulerStatus(),
    ]);

    setSkills(discoveredSkills);
    setScheduledTasks(tasks);
    setTaskRuns(runs);
    setRemoteControl(remote);
    setVirtualTeams(teams);
    setTeamRuns(teamRunHistory);
    setSchedulerStatus(scheduler);
    return { discoveredSkills, tasks, runs, remote, teams, teamRunHistory, scheduler };
  }

  async function refreshHistoryData() {
    const [records, storageInfo] = await Promise.all([
      ipcClient.history.listRecords({ limit: 500 }),
      ipcClient.history.getStorageInfo(),
    ]);
    setHistoryRecords(records);
    setHistoryStorageInfo(storageInfo);
    return { records, storageInfo };
  }

  async function deleteHistoryRecord(recordId: string) {
    setHistoryMessage('');
    try {
      await ipcClient.history.deleteRecord(recordId);
      await refreshHistoryData();
      setHistoryMessage('Deleted history record.');
    } catch (error) {
      setHistoryMessage(formatDesktopError(error));
    }
  }

  async function restoreChatFromHistory(record: LocalHistoryRecord) {
    const restored = restoreSessionsFromHistory([record], appInfo?.workspacePath);
    const session = restored?.sessions[0];
    if (!session) {
      setHistoryMessage('This history record does not contain a restorable chat session.');
      return;
    }

    setSessions(current => upsertSession(current, session));
    setCurrentSessionId(session.id);
    setMessages(session.messages);
    setActiveView('chat');
    setHistoryMessage(`Restored chat "${session.title}".`);
  }

  async function exportHistoryRecords(type?: LocalHistoryRecordType) {
    setHistoryMessage('');
    try {
      const exported = await ipcClient.history.exportRecords({ type, limit: 1000 });
      setHistoryExportText(JSON.stringify(exported, null, 2));
      setHistoryMessage(`Exported ${exported.records.length} history record(s).`);
    } catch (error) {
      setHistoryMessage(formatDesktopError(error));
    }
  }

  async function exportAutomationProject(includeRuns: boolean) {
    setAutomationMessage('');
    try {
      const bundle = await ipcClient.automation.exportProjectState({ includeRuns });
      setAutomationExportText(JSON.stringify(bundle, null, 2));
      await refreshHistoryData();
      setAutomationMessage(`Exported ${bundle.tasks.length} task(s) and ${bundle.teams.length} team(s).`);
    } catch (error) {
      setAutomationMessage(formatDesktopError(error));
    }
  }

  async function importAutomationProject() {
    setAutomationMessage('');
    try {
      const bundle = JSON.parse(automationImportText) as Partial<AutomationProjectExport>;
      const result = await ipcClient.automation.importProjectState(bundle);
      await refreshAutomationData();
      await refreshHistoryData();
      setAutomationMessage(`Imported ${result.imported.tasks} task(s), ${result.imported.teams} team(s), and ${result.imported.skillPolicies} skill policy entry(ies).`);
    } catch (error) {
      setAutomationMessage(formatDesktopError(error));
    }
  }

  async function saveScheduledTask(task: Partial<ScheduledTask>) {
    setAutomationMessage('');
    try {
      const saved = await ipcClient.automation.saveTask(task);
      await refreshAutomationData();
      setAutomationMessage(`Saved scheduled task "${saved.name}".`);
    } catch (error) {
      setAutomationMessage(formatDesktopError(error));
    }
  }

  async function runScheduledTask(taskId: string) {
    setAutomationMessage('');
    try {
      const task = await ipcClient.automation.runTask(taskId);
      await refreshAutomationData();
      setAutomationMessage(`Ran scheduled task "${task.name}" with status ${task.lastStatus ?? 'unknown'}.`);
    } catch (error) {
      setAutomationMessage(formatDesktopError(error));
    }
  }

  async function deleteScheduledTask(taskId: string) {
    setAutomationMessage('');
    try {
      await ipcClient.automation.deleteTask(taskId);
      await refreshAutomationData();
      setAutomationMessage('Deleted scheduled task.');
    } catch (error) {
      setAutomationMessage(formatDesktopError(error));
    }
  }

  async function updateRemoteControl(update: Partial<RemoteControlState>) {
    setAutomationMessage('');
    try {
      const remote = await ipcClient.automation.updateRemoteControl(update);
      await refreshAutomationData();
      setAutomationMessage('Updated remote control settings.');
    } catch (error) {
      setAutomationMessage(formatDesktopError(error));
    }
  }

  async function createRemotePairingCode(deviceName?: string) {
    setAutomationMessage('');
    try {
      const remote = await ipcClient.automation.createRemotePairingCode(deviceName);
      await refreshAutomationData();
      setAutomationMessage('Created a remote-control pairing code.');
    } catch (error) {
      setAutomationMessage(formatDesktopError(error));
    }
  }

  async function revokeRemoteDevice(deviceId: string) {
    setAutomationMessage('');
    try {
      const remote = await ipcClient.automation.revokeRemoteDevice(deviceId);
      setRemoteControl(remote);
      await refreshAutomationData();
      await refreshHistoryData();
      setAutomationMessage('Revoked remote device.');
    } catch (error) {
      setAutomationMessage(formatDesktopError(error));
    }
  }

  async function createDefaultVirtualTeam(objective: string) {
    setAutomationMessage('');
    try {
      const team = await ipcClient.automation.createDefaultTeam(objective);
      await refreshAutomationData();
      setAutomationMessage(`Created virtual team "${team.name}".`);
    } catch (error) {
      setAutomationMessage(formatDesktopError(error));
    }
  }

  async function saveVirtualTeam(team: Partial<VirtualTeamBlueprint>) {
    setAutomationMessage('');
    try {
      const saved = await ipcClient.automation.saveTeam(team);
      await refreshAutomationData();
      setAutomationMessage(`Saved virtual team "${saved.name}".`);
    } catch (error) {
      setAutomationMessage(formatDesktopError(error));
    }
  }

  async function deleteVirtualTeam(teamId: string) {
    setAutomationMessage('');
    try {
      await ipcClient.automation.deleteTeam(teamId);
      await refreshAutomationData();
      setAutomationMessage('Deleted virtual team.');
    } catch (error) {
      setAutomationMessage(formatDesktopError(error));
    }
  }

  async function setSkillEnabled(skillId: string, enabled: boolean) {
    setAutomationMessage('');
    try {
      const skill = await ipcClient.automation.setSkillEnabled(skillId, enabled);
      await refreshAutomationData();
      setAutomationMessage(`${enabled ? 'Enabled' : 'Disabled'} skill "${skill.name}".`);
    } catch (error) {
      setAutomationMessage(formatDesktopError(error));
    }
  }

  async function setScheduledTaskEnabled(taskId: string, enabled: boolean) {
    setAutomationMessage('');
    try {
      const task = await ipcClient.automation.setTaskEnabled(taskId, enabled);
      await refreshAutomationData();
      setAutomationMessage(`${enabled ? 'Enabled' : 'Disabled'} scheduled task "${task.name}".`);
    } catch (error) {
      setAutomationMessage(formatDesktopError(error));
    }
  }

  async function runVirtualTeam(teamId: string) {
    if (runningTeamIdsRef.current.has(teamId)) {
      return;
    }

    setAutomationMessage('');
    runningTeamIdsRef.current.add(teamId);
    setRunningTeamIds(current => new Set(current).add(teamId));
    try {
      const run = await ipcClient.automation.runTeam(teamId);
      await refreshAutomationData();
      setAutomationMessage(`Virtual team run ${run.status}: ${run.summary ?? run.error ?? run.id}`);
    } catch (error) {
      setAutomationMessage(formatDesktopError(error));
    } finally {
      runningTeamIdsRef.current.delete(teamId);
      setRunningTeamIds(current => {
        const next = new Set(current);
        next.delete(teamId);
        return next;
      });
    }
  }

  async function loadWorkspaceDirectory(nextPath = workspacePath) {
    const normalizedPath = normalizeWorkspacePath(nextPath);
    setIsLoadingWorkspaceEntries(true);
    setWorkspaceBrowserError('');

    try {
      const entries = await ipcClient.fs.list(normalizedPath);
      setWorkspacePath(normalizedPath);
      setWorkspaceEntries(sortFileEntries(entries));
    } catch (error) {
      setWorkspaceBrowserError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoadingWorkspaceEntries(false);
    }
  }

  function openWorkspaceEntry(entry: FileEntry) {
    if (entry.type !== 'directory') {
      return;
    }

    loadWorkspaceDirectory(joinWorkspacePath(workspacePath, entry.name));
  }

  function goToWorkspaceParent() {
    loadWorkspaceDirectory(getWorkspaceParentPath(workspacePath));
  }

  async function openWorkspacePath(targetPath: string) {
    setWorkspaceBrowserError('');
    setWorkspaceActionMessage('');

    try {
      const result = await ipcClient.fs.open(normalizeWorkspacePath(targetPath));
      setWorkspaceActionMessage(`Opened ${result.path}`);
    } catch (error) {
      setWorkspaceBrowserError(error instanceof Error ? error.message : String(error));
    }
  }

  async function revealWorkspacePath(targetPath: string) {
    setWorkspaceBrowserError('');
    setWorkspaceActionMessage('');

    try {
      const result = await ipcClient.fs.reveal(normalizeWorkspacePath(targetPath));
      setWorkspaceActionMessage(`Revealed ${result.path}`);
    } catch (error) {
      setWorkspaceBrowserError(error instanceof Error ? error.message : String(error));
    }
  }

  async function updateDisabledModelTools(nextDisabledTools: string[], message: string) {
    const disabledLlmTools = normalizeToolNameList(nextDisabledTools);
    setAppConfig(current => ({
      ...(current ?? {}),
      disabledLlmTools,
    }));
    setToolRouterMessage(message);

    try {
      await ipcClient.app.setConfig({ disabledLlmTools });
    } catch (error) {
      setToolRouterMessage(error instanceof Error ? error.message : String(error));
      setStatus('Tool routing error');
    }
  }

  function setModelToolExposure(toolName: string, exposed: boolean) {
    const disabled = getDisabledModelToolSet(appConfig);
    if (exposed) {
      disabled.delete(toolName);
    } else {
      disabled.add(toolName);
    }

    updateDisabledModelTools(
      Array.from(disabled),
      `${toolName} ${exposed ? 'exposed to' : 'hidden from'} model tool calls.`,
    );
  }

  function applyToolRouterPreset(preset: 'all' | 'read-only' | 'mutating-off') {
    if (preset === 'all') {
      updateDisabledModelTools([], 'All bridge tools are exposed to model tool calls.');
      return;
    }

    const disabled = tools
      .filter(tool => preset === 'read-only' ? !tool.readOnly : !tool.readOnly)
      .map(tool => tool.name);

    updateDisabledModelTools(
      disabled,
      preset === 'read-only'
        ? 'Only read-only bridge tools are exposed to model tool calls.'
        : 'Workspace-changing bridge tools are hidden from model tool calls.',
    );
  }

  async function updateToolPermissionPolicy(toolName: string, permission: ToolPermissionMode) {
    const toolPermissionPolicies = {
      ...(appConfig?.toolPermissionPolicies ?? {}),
      [toolName]: permission,
    };

    setAppConfig(current => ({
      ...(current ?? {}),
      toolPermissionPolicies,
    }));
    setToolRouterMessage(`${toolName} permission policy set to ${permission}.`);

    try {
      await ipcClient.app.setConfig({ toolPermissionPolicies });
    } catch (error) {
      setToolRouterMessage(error instanceof Error ? error.message : String(error));
      setStatus('Permission policy error');
    }
  }

  function applyToolPermissionPreset(preset: 'allow-all' | 'ask-mutating' | 'deny-mutating') {
    const toolPermissionPolicies: Record<string, ToolPermissionMode> = {};
    for (const tool of tools) {
      if (preset === 'allow-all') {
        toolPermissionPolicies[tool.name] = 'allow';
      } else if (tool.readOnly) {
        toolPermissionPolicies[tool.name] = 'allow';
      } else {
        toolPermissionPolicies[tool.name] = preset === 'ask-mutating' ? 'ask' : 'deny';
      }
    }

    setAppConfig(current => ({
      ...(current ?? {}),
      toolPermissionPolicies,
    }));
    setToolRouterMessage(
      preset === 'allow-all'
        ? 'All bridge tools are allowed by desktop permission policy.'
        : preset === 'ask-mutating'
          ? 'Read-only tools are allowed and workspace-changing tools require approval.'
          : 'Read-only tools are allowed and workspace-changing tools are denied.',
    );

    ipcClient.app.setConfig({ toolPermissionPolicies }).catch(error => {
      setToolRouterMessage(error instanceof Error ? error.message : String(error));
      setStatus('Permission policy error');
    });
  }

  async function runWorkspaceCommand(command: string, cwd = '.') {
    const trimmedCommand = command.trim();
    if (!trimmedCommand) {
      appendMessage(createMessage('error', 'Enter a command to run.', {
        title: 'Command error',
        status: 'failed',
      }));
      return;
    }

    try {
      const { toolId } = await ipcClient.tools.execute('bash.run', {
        command: trimmedCommand,
        cwd: cwd.trim() || '.',
      });
      appendMessage(createMessage('tool', `Started workspace command: ${trimmedCommand}`, {
        title: `Tool ${toolId}`,
      }));
      setStatus('Approval needed');
    } catch (error) {
      appendMessage(createMessage('error', formatDesktopError(error), {
        title: 'Command error',
        status: 'failed',
      }));
      setStatus('Error');
    }
  }

  async function submitPrompt() {
    const prompt = input.trim();
    if (!prompt || isSending) {
      return;
    }

    setInput('');
    setIsSending(true);

    const userMessage = createMessage('user', prompt);
    setMessages(current => [...current, userMessage]);
    let pendingStreamRequestId: string | null = null;

    try {
      if (await handleCommand(prompt)) {
        setStatus('Ready');
        return;
      }

      setStatus('Streaming');
      const requestId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      pendingStreamRequestId = requestId;
      const activeProvider = appConfig?.llmProvider || DEFAULT_PROVIDER;
      const activeProviderDefault = getProviderDefault(activeProvider);
      const assistantMessage = createMessage('assistant', '', {
        title: `${activeProviderDefault.label} / ${appConfig?.model || activeProviderDefault.model}`,
        status: 'sending',
      });

      streamMessageIds.current.set(requestId, assistantMessage.id);
      appendMessage(assistantMessage);

      await ipcClient.api.chatStream({
        requestId,
        messages: getChatMessages(messages, prompt),
        provider: activeProvider,
        baseUrl: appConfig?.baseUrl || activeProviderDefault.baseUrl,
        model: appConfig?.model || activeProviderDefault.model,
        maxTokens: Number(appConfig?.maxTokens ?? activeProviderDefault.maxTokens),
        contextTokens: Number(appConfig?.contextTokens ?? activeProviderDefault.contextTokens),
        enableTools: Boolean(appConfig?.enableLlmTools ?? activeProviderDefault.enableLlmTools),
        temperature: Number(appConfig?.temperature ?? 0.7),
      });
    } catch (error) {
      if (pendingStreamRequestId) {
        streamMessageIds.current.delete(pendingStreamRequestId);
      }

      const message = formatDesktopError(error);
      appendMessage(createMessage('error', message, {
        title: 'Request failed',
        status: 'failed',
      }));
      setStatus('Error');
    } finally {
      if (!streamMessageIds.current.size) {
        setIsSending(false);
        inputRef.current?.focus();
      }
    }
  }

  async function handleCommand(prompt: string): Promise<boolean> {
    if (!prompt.startsWith('/')) {
      return false;
    }

    if (prompt === '/help' || prompt === '/?') {
      appendMessage(createMessage('system', formatHelp(), { title: 'Desktop commands' }));
      return true;
    }

    if (prompt === '/status') {
      appendMessage(createMessage('system', formatStatus(), { title: 'Status' }));
      return true;
    }

    if (prompt === '/pwd' || prompt === '/workspace') {
      appendMessage(createMessage('system', appInfo?.workspacePath || 'Workspace path is unavailable.', {
        title: 'Workspace',
      }));
      return true;
    }

    if (prompt === '/login' || prompt === '/settings') {
      setSettingsMessage(prompt === '/login'
        ? 'Select an LLM backend and save credentials or local endpoint settings.'
        : '');
      setActiveSettingsSection('model');
      setActiveView('settings');
      appendMessage(createMessage('system', 'Opened Settings.', { title: prompt.slice(1) }));
      return true;
    }

    if (prompt === '/login lmstudio' || prompt === '/login local') {
      const localDefault = getProviderDefault('openai-compatible');
      updateSettingsDraft({
        llmProvider: 'openai-compatible',
        baseUrl: localDefault.baseUrl,
        model: localDefault.model,
        maxTokens: localDefault.maxTokens,
        contextTokens: localDefault.contextTokens,
        enableLlmTools: localDefault.enableLlmTools,
        apiKey: '',
      });
      setSettingsMessage('Configured draft for LM Studio. Set the model ID, then Save.');
      setActiveSettingsSection('model');
      setActiveView('settings');
      appendMessage(createMessage('system', 'Opened Settings with LM Studio defaults.', { title: 'login' }));
      return true;
    }

    if (prompt === '/clear') {
      clearChat();
      return true;
    }

    if (prompt === '/sessions') {
      appendMessage(createMessage('system', formatSessions(sessions, currentSessionId), { title: 'Sessions' }));
      return true;
    }

    if (prompt === '/history') {
      await refreshHistoryData();
      setActiveHistorySection('overview');
      setActiveView('history');
      appendMessage(createMessage('system', 'Opened History.', { title: 'History' }));
      return true;
    }

    if (prompt === '/tools') {
      setActiveToolsSection('bridge');
      appendMessage(createMessage('system', formatTools(tools, mcpTools), { title: 'Tools' }));
      return true;
    }

    if (prompt === '/automation' || prompt === '/skills' || prompt === '/tasks' || prompt === '/remote' || prompt === '/team') {
      await refreshAutomationData();
      if (prompt === '/skills') {
        setActiveAutomationSection('skills');
      } else if (prompt === '/tasks') {
        setActiveAutomationSection('tasks');
      } else if (prompt === '/remote') {
        setActiveAutomationSection('remote');
      } else if (prompt === '/team') {
        setActiveAutomationSection('team');
      }
      setActiveView('automation');
      appendMessage(createMessage('system', 'Opened Automation.', { title: prompt.slice(1) }));
      return true;
    }

    if (prompt === '/mcp') {
      const { servers, discoveredMcpTools } = await refreshBridgeData();
      setActiveToolsSection('mcp');
      setActiveView('tools');
      appendMessage(createMessage('system', formatMcpStatus(servers, discoveredMcpTools), { title: 'MCP' }));
      return true;
    }

    if (prompt === '/config') {
      appendMessage(createMessage('system', `\`\`\`json\n${formatJson(appConfig)}\n\`\`\``, {
        title: 'Configuration',
      }));
      return true;
    }

    const toolCommand = parseToolCommand(prompt);
    if (toolCommand) {
      const { toolId } = await ipcClient.tools.execute(toolCommand.toolName, toolCommand.args);
      appendMessage(createMessage('tool', `Started ${toolCommand.toolName}`, {
        title: `Tool ${toolId}`,
      }));
      return true;
    }

    appendMessage(createMessage('error', `Unknown command: ${prompt}`, {
      title: 'Command error',
      status: 'failed',
    }));
    return true;
  }

  function formatHelp(): string {
    return DESKTOP_COMMANDS
      .map(command => `${command.command} - ${command.description}`)
      .join('\n');
  }

  function formatStatus(): string {
    const config = appConfig;
    const provider = config?.llmProvider || DEFAULT_PROVIDER;
    const providerDefault = getProviderDefault(provider);
    const lines = [
      `Provider: ${providerDefault.label}`,
      `Model: ${config?.model || providerDefault.model}`,
      `Base URL: ${config?.baseUrl || providerDefault.baseUrl || '(provider default)'}`,
      `Max tokens: ${config?.maxTokens ?? providerDefault.maxTokens}`,
      `Context tokens: ${config?.contextTokens ?? providerDefault.contextTokens}`,
      `Model tool calls: ${config?.enableLlmTools ? 'enabled' : 'disabled'}`,
      `Workspace: ${appInfo?.workspacePath || 'unknown'}`,
      `Bridge tools: ${tools.length}`,
      `Bridge tools exposed to model: ${tools.filter(tool => isToolExposedToModel(tool, config)).length}`,
      `Bridge tools hidden from model: ${getDisabledModelToolSet(config).size}`,
      `MCP servers: ${mcpServers.length}`,
      `MCP tools: ${mcpTools.length}`,
      `Runtime: ${appInfo ? `${appInfo.version} on ${appInfo.platform} ${appInfo.arch}` : 'unknown'}`,
      `Messages: ${messages.length}`,
      `Saved sessions: ${sessions.length}`,
    ];

    if (provider === 'openai-compatible' && !config?.enableLlmTools) {
      lines.push('Local tool schemas are off by default to protect 8k-context LM Studio models.');
    }

    return lines.join('\n');
  }

  function formatTools(availableTools: Tool[], availableMcpTools: McpToolInfo[]): string {
    const sections: string[] = [];

    if (availableTools.length > 0) {
      sections.push([
        'Bridge tools:',
        ...availableTools.map(tool => {
          const exposure = isToolExposedToModel(tool, appConfig) ? 'model-exposed' : 'model-hidden';
          return `- ${tool.name}${tool.readOnly ? ' (read-only)' : ''} [${exposure}]: ${tool.description}`;
        }),
      ].join('\n'));
    } else {
      sections.push('Bridge tools: none');
    }

    if (availableMcpTools.length > 0) {
      sections.push([
        'MCP tools:',
        ...availableMcpTools.map(tool => `- ${tool.serverName}.${tool.toolName}: ${tool.description}`),
      ].join('\n'));
    } else {
      sections.push('MCP tools: none');
    }

    return sections.join('\n\n');
  }

  function formatMcpServers(servers: McpServerInfo[]): string {
    if (servers.length === 0) {
      return 'No MCP servers are configured.';
    }

    return servers
      .map(server => `- ${server.name} [${server.scope ?? 'unknown'}]: ${server.status} (${server.type})`)
      .join('\n');
  }

  function formatMcpStatus(servers: McpServerInfo[], availableMcpTools: McpToolInfo[]): string {
    const serverText = formatMcpServers(servers);
    const toolText = availableMcpTools.length > 0
      ? availableMcpTools.map(tool => `- ${tool.serverName}.${tool.toolName}: ${tool.description}`).join('\n')
      : 'No MCP tools are discovered.';

    return `${serverText}\n\n${toolText}`;
  }

  function formatSessions(availableSessions: PersistedChatSession[], activeSessionId: string): string {
    if (availableSessions.length === 0) {
      return 'No saved sessions.';
    }

    return sortSessions(availableSessions)
      .map(session => {
        const marker = session.id === activeSessionId ? '*' : '-';
        return `${marker} ${session.title} (${session.messages.length} messages, updated ${formatRelativeTime(session.updatedAt)})`;
      })
      .join('\n');
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitPrompt();
    }
  }

  async function copyMessage(message: UiMessage) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      window.setTimeout(() => setCopiedMessageId(null), 1500);
    } catch (error) {
      appendMessage(createMessage('error', error instanceof Error ? error.message : String(error), {
        title: 'Copy failed',
        status: 'failed',
      }));
    }
  }

  function clearChat() {
    setMessages(createReadyMessages());
    setStatus('Ready');
    inputRef.current?.focus();
  }

  async function resolveFileWriteReview(review: FileWriteReviewRequest, approved: boolean) {
    try {
      await ipcClient.tools.respondToFileWriteReview({
        requestId: review.requestId,
        approved,
        reason: approved ? undefined : 'Rejected in desktop review',
      });

      setFileWriteReviews(current => current.filter(item => item.requestId !== review.requestId));
      appendMessage(createMessage('system', `${approved ? 'Approved' : 'Rejected'} write to ${review.path}.`, {
        title: 'File write review',
      }));
      setStatus('Ready');
      inputRef.current?.focus();
    } catch (error) {
      appendMessage(createMessage('error', error instanceof Error ? error.message : String(error), {
        title: 'Review response failed',
        status: 'failed',
      }));
      setStatus('Error');
    }
  }

  async function resolveCommandReview(review: CommandReviewRequest, approved: boolean) {
    try {
      await ipcClient.tools.respondToCommandReview({
        requestId: review.requestId,
        approved,
        reason: approved ? undefined : 'Rejected in desktop review',
      });

      setCommandReviews(current => current.filter(item => item.requestId !== review.requestId));
      appendMessage(createMessage('system', `${approved ? 'Approved' : 'Rejected'} command: ${review.command}`, {
        title: 'Command review',
      }));
      setStatus('Ready');
      inputRef.current?.focus();
    } catch (error) {
      appendMessage(createMessage('error', error instanceof Error ? error.message : String(error), {
        title: 'Review response failed',
        status: 'failed',
      }));
      setStatus('Error');
    }
  }

  async function resolveToolPermissionReview(review: ToolPermissionReviewRequest, approved: boolean) {
    try {
      await ipcClient.tools.respondToToolPermissionReview({
        requestId: review.requestId,
        approved,
        reason: approved ? undefined : 'Rejected in desktop permission review',
      });

      setToolPermissionReviews(current => current.filter(item => item.requestId !== review.requestId));
      appendMessage(createMessage('system', `${approved ? 'Approved' : 'Rejected'} tool call: ${review.toolName}.`, {
        title: 'Tool permission',
      }));
      setStatus('Ready');
      inputRef.current?.focus();
    } catch (error) {
      appendMessage(createMessage('error', error instanceof Error ? error.message : String(error), {
        title: 'Permission response failed',
        status: 'failed',
      }));
      setStatus('Error');
    }
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingSettings(true);
    setSettingsMessage('');

    try {
      const nextConfig: Partial<AppConfig> = {
        llmProvider: settingsDraft.llmProvider,
        baseUrl: settingsDraft.baseUrl,
        model: settingsDraft.model,
        temperature: Number(settingsDraft.temperature),
        maxTokens: Number(settingsDraft.maxTokens),
        contextTokens: Number(settingsDraft.contextTokens),
        enableLlmTools: settingsDraft.enableLlmTools,
        theme: settingsDraft.theme,
        memoryEnabled: settingsDraft.memoryEnabled,
        pluginsEnabled: settingsDraft.pluginsEnabled,
        autoUpdate: settingsDraft.autoUpdate,
        cliOptions: buildCliOptions(settingsDraft),
      };

      await ipcClient.app.setConfig(nextConfig);

      if (settingsDraft.apiKey.trim()) {
        await ipcClient.auth.setToken({
          accessToken: settingsDraft.apiKey.trim(),
          provider: settingsDraft.llmProvider,
        });
      }

      const config = await ipcClient.app.getConfig();
      setAppConfig(config);
      setSettingsDraft({ ...createSettingsDraft(config), apiKey: '' });
      setSettingsMessage('Saved');
      setStatus('Ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSettingsMessage(message);
      setStatus('Settings error');
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function clearToken() {
    await ipcClient.auth.logout();
    updateSettingsDraft({ apiKey: '' });
    setSettingsMessage('Authentication cleared');
  }

  function openPrimaryView(view: AppView) {
    if (view === 'settings') {
      setSettingsMessage('');
    } else if (view === 'history') {
      setHistoryMessage('');
    }
    setActiveView(view);
  }

  function getActiveChildMenu(): Array<NavigationChildItem<string>> {
    if (activeView === 'projects') {
      return PROJECTS_MENU;
    }
    if (activeView === 'tools') {
      return TOOLS_MENU;
    }
    if (activeView === 'automation') {
      return AUTOMATION_MENU;
    }
    if (activeView === 'history') {
      return HISTORY_MENU;
    }
    if (activeView === 'settings') {
      return SETTINGS_MENU;
    }
    return [];
  }

  function getActiveChildId(): string {
    if (activeView === 'projects') {
      return activeProjectsSection;
    }
    if (activeView === 'tools') {
      return activeToolsSection;
    }
    if (activeView === 'automation') {
      return activeAutomationSection;
    }
    if (activeView === 'history') {
      return activeHistorySection;
    }
    if (activeView === 'settings') {
      return activeSettingsSection;
    }
    return '';
  }

  function openChildRoute(view: AppView, childId: string) {
    if (view === 'projects') {
      setActiveProjectsSection(childId as ProjectsSectionId);
    } else if (view === 'tools') {
      setActiveToolsSection(childId as ToolsSectionId);
    } else if (view === 'automation') {
      setActiveAutomationSection(childId as AutomationSectionId);
    } else if (view === 'history') {
      setActiveHistorySection(childId as HistorySectionId);
      setHistoryMessage('');
    } else if (view === 'settings') {
      setActiveSettingsSection(childId as SettingsSectionId);
      setSettingsMessage('');
    }
    setActiveView(view);
  }

  const statusLabel = isSending ? 'Working' : status;
  const activeProvider = appConfig?.llmProvider || DEFAULT_PROVIDER;
  const activeProviderDefault = getProviderDefault(activeProvider);
  const activeProviderLabel = activeProviderDefault.label;
  const activeFileWriteReview = fileWriteReviews[0] ?? null;
  const activeCommandReview = commandReviews[0] ?? null;
  const activeToolPermissionReview = toolPermissionReviews[0] ?? null;
  const activeSession = sessions.find(session => session.id === currentSessionId);
  const conversationTitle = activeSession?.title || getSessionTitle(messages);
  const recentSessions = sortSessions(sessions);
  const visibleRecentSessions = recentSessions.filter(session => matchesSessionSearch(session, sessionSearch));
  const exposedBridgeToolCount = tools.filter(tool => isToolExposedToModel(tool, appConfig)).length;
  const commandSuggestions = filterDesktopCommands(input);
  const showCommandPalette = activeView === 'chat' && commandSuggestions.length > 0 && !isSending;
  const activeProjectsMenuItem = PROJECTS_MENU.find(item => item.id === activeProjectsSection) ?? PROJECTS_MENU[0];
  const activeToolsMenuItem = TOOLS_MENU.find(item => item.id === activeToolsSection) ?? TOOLS_MENU[0];
  const activeAutomationMenuItem = AUTOMATION_MENU.find(item => item.id === activeAutomationSection) ?? AUTOMATION_MENU[1];
  const activeHistoryMenuItem = HISTORY_MENU.find(item => item.id === activeHistorySection) ?? HISTORY_MENU[0];
  const activeSettingsMenuItem = SETTINGS_MENU.find(item => item.id === activeSettingsSection) ?? SETTINGS_MENU[0];
  const activeChildMenu = getActiveChildMenu();
  const activeChildId = getActiveChildId();
  const viewTitle = activeView === 'chat'
    ? conversationTitle
    : activeView === 'projects'
      ? activeProjectsMenuItem.title
      : activeView === 'tools'
        ? activeToolsMenuItem.title
        : activeView === 'automation'
          ? activeAutomationMenuItem.title
          : activeView === 'history'
            ? activeHistoryMenuItem.title
            : activeSettingsMenuItem.title;
  const viewSubtitle = activeView === 'chat'
    ? appConfig?.model || activeProviderDefault.model
    : activeView === 'projects'
      ? activeProjectsMenuItem.description
      : activeView === 'tools'
        ? activeToolsMenuItem.description
        : activeView === 'automation'
          ? activeAutomationMenuItem.description
          : activeView === 'history'
            ? activeHistoryMenuItem.description
            : activeSettingsMenuItem.description;

  return (
    <div className={`${styles.container} ${sidebarCollapsed ? styles.containerCollapsed : ''}`}>
      <aside className={`${styles.navSidebar} ${sidebarCollapsed ? styles.navSidebarCollapsed : ''}`} aria-label="Navigation">
        <div className={styles.brandBlock}>
          <span className={styles.brandMark}>*</span>
          <div>
            <strong>CodeAgent</strong>
            <span>{activeProviderLabel}</span>
          </div>
          <button
            className={styles.navCollapseButton}
            type="button"
            title={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            onClick={() => setSidebarCollapsed(value => !value)}
          >
            {sidebarCollapsed ? '>' : '<'}
          </button>
        </div>

        <button className={styles.newChatButton} type="button" title="New chat" onClick={startNewChat}>
          <span className={styles.navGlyph}>+</span>
          <span className={styles.navLabel}>New chat</span>
        </button>

        <nav className={styles.navList} aria-label="Primary">
          {PRIMARY_NAV.map(item => (
            <div className={styles.navGroup} key={item.id}>
              <button
                className={activeView === item.id ? styles.navItemActive : styles.navItem}
                type="button"
                title={item.description}
                onClick={() => openPrimaryView(item.id)}
              >
                <span className={styles.navGlyph}>{item.glyph}</span>
                <span className={styles.navLabel}>{item.label}</span>
              </button>

              {activeView === item.id && activeChildMenu.length > 0 && (
                <div className={styles.navSubList} aria-label={`${item.label} sections`}>
                  {activeChildMenu.map(child => (
                    <button
                      className={child.id === activeChildId ? styles.navChildItemActive : styles.navChildItem}
                      type="button"
                      key={child.id}
                      title={`${child.title}: ${child.description}`}
                      onClick={() => openChildRoute(item.id, child.id)}
                    >
                      <span className={styles.navChildGlyph}>{child.title.charAt(0)}</span>
                      <span className={styles.navChildLabel}>
                        <strong>{child.title}</strong>
                        <span>{child.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>

        <section className={styles.recentSection}>
          <h2>Recents</h2>
          <input
            className={styles.sessionSearchInput}
            type="search"
            value={sessionSearch}
            onChange={event => setSessionSearch(event.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
          />
          <div className={styles.recentList}>
            {visibleRecentSessions.length === 0 && (
              <button className={styles.recentItemActive} type="button" onClick={() => openPrimaryView('chat')}>
                <span className={styles.recentTitle}>{sessionSearch.trim() ? 'No matches' : 'New conversation'}</span>
              </button>
            )}
            {visibleRecentSessions.map(session => (
              <button
                className={session.id === currentSessionId ? styles.recentItemActive : styles.recentItem}
                type="button"
                key={session.id}
                title={session.title}
                onClick={() => loadSession(session.id)}
              >
                <span className={styles.recentTitle}>{formatSidebarLabel(session.title)}</span>
                <span className={styles.recentMeta}>
                  {session.messages.length} messages · {formatRelativeTime(session.updatedAt)}
                </span>
              </button>
            ))}
          </div>
        </section>

        <div className={styles.sidebarBottom}>
          <div className={styles.sidebarFooter} title={statusLabel}>
            <span className={`${styles.statusDot} ${isSending ? styles.statusDotBusy : ''}`} />
            <div>
              <strong>{statusLabel}</strong>
              <span>{appConfig?.enableLlmTools ? `${exposedBridgeToolCount} tools exposed` : 'Chat mode'}</span>
            </div>
          </div>
        </div>
      </aside>

      <div className={styles.appShell}>
        <header className={styles.header}>
          <div className={styles.headerTitle}>
            <h1>{viewTitle}</h1>
            <span className={styles.subtitle}>
              {viewSubtitle}
            </span>
          </div>
        </header>

        <main className={`${styles.workspace} ${activeView !== 'chat' ? styles.workspaceDetail : ''}`}>
          {activeView === 'chat' && (
            <section className={styles.chatPanel} aria-label="Chat">
              <div className={styles.messageList} ref={messageListRef}>
                {messages.map(message => (
                  <MessageItem
                    key={message.id}
                    message={message}
                    copied={copiedMessageId === message.id}
                    onCopy={() => copyMessage(message)}
                  />
                ))}
                {isSending && (
                  <div className={styles.typingIndicator} role="status">
                    <span />
                    <span />
                    <span />
                  </div>
                )}
              </div>

              <form className={styles.composer} onSubmit={event => {
                event.preventDefault();
                submitPrompt();
              }}>
                {showCommandPalette && (
                  <div className={styles.commandPalette} role="listbox" aria-label="Desktop commands">
                    {commandSuggestions.map(command => (
                      <button
                        className={styles.commandPaletteItem}
                        type="button"
                        key={command.command}
                        onClick={() => {
                          setInput(command.command.includes('<') ? command.command.split(' ')[0] : command.command);
                          inputRef.current?.focus();
                        }}
                      >
                        <strong>{command.command}</strong>
                        <span>{command.description}</span>
                      </button>
                    ))}
                  </div>
                )}
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={event => setInput(event.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Reply to CodeAgent..."
                  rows={1}
                  disabled={isSending}
                  aria-label="Message"
                />
                <div className={styles.composerActions}>
                  <button className={styles.secondaryButton} type="button" onClick={clearChat} title="Clear chat">
                    Clear
                  </button>
                  <button className={styles.primaryButton} type="submit" disabled={isSending || !input.trim()} title="Send message">
                    Send
                  </button>
                </div>
              </form>
            </section>
          )}

          {activeView === 'projects' && (
            <ProjectsView
              activeSection={activeProjectsSection}
              appInfo={appInfo}
              appConfig={appConfig}
              appState={appState}
              activeProviderLabel={activeProviderLabel}
              activeProviderDefault={activeProviderDefault}
              viewportSize={viewportSize}
              tokenUsage={tokenUsage}
              currentSessionTitle={conversationTitle}
              sessionCount={sessions.length}
              workspacePath={workspacePath}
              workspaceEntries={workspaceEntries}
              workspaceBrowserError={workspaceBrowserError}
              workspaceActionMessage={workspaceActionMessage}
              isLoadingWorkspaceEntries={isLoadingWorkspaceEntries}
              onOpenWorkspaceEntry={openWorkspaceEntry}
              onOpenWorkspacePath={openWorkspacePath}
              onRevealWorkspacePath={revealWorkspacePath}
              onGoToWorkspaceParent={goToWorkspaceParent}
              onRefreshWorkspace={() => loadWorkspaceDirectory(workspacePath)}
              mcpServers={mcpServers}
              mcpTools={mcpTools}
            />
          )}

          {activeView === 'tools' && (
            <ToolsView
              activeSection={activeToolsSection}
              tools={tools}
              mcpTools={mcpTools}
              mcpServers={mcpServers}
              appConfig={appConfig}
              routerMessage={toolRouterMessage}
              toolActivities={toolActivities}
              onToggleModelTool={setModelToolExposure}
              onApplyToolPreset={applyToolRouterPreset}
              onSetToolPermission={updateToolPermissionPolicy}
              onApplyPermissionPreset={applyToolPermissionPreset}
              onRunCommand={runWorkspaceCommand}
              onOpenWorkspacePath={openWorkspacePath}
              onRevealWorkspacePath={revealWorkspacePath}
              onRefresh={refreshBridgeData}
              onClearActivities={() => setToolActivities([])}
            />
          )}

          {activeView === 'automation' && (
            <AutomationView
              activeSection={activeAutomationSection}
              skills={skills}
              tasks={scheduledTasks}
              taskRuns={taskRuns}
              schedulerStatus={schedulerStatus}
              remoteControl={remoteControl}
              teams={virtualTeams}
              teamRuns={teamRuns}
              runningTeamIds={runningTeamIds}
              appConfig={appConfig}
              workspacePath={appInfo?.workspacePath ?? workspacePath}
              message={automationMessage}
              exportText={automationExportText}
              importText={automationImportText}
              onRefresh={refreshAutomationData}
              onSetSkillEnabled={setSkillEnabled}
              onExportProject={exportAutomationProject}
              onImportTextChange={setAutomationImportText}
              onImportProject={importAutomationProject}
              onSaveTask={saveScheduledTask}
              onRunTask={runScheduledTask}
              onSetTaskEnabled={setScheduledTaskEnabled}
              onDeleteTask={deleteScheduledTask}
              onUpdateRemoteControl={updateRemoteControl}
              onCreatePairingCode={createRemotePairingCode}
              onRevokeRemoteDevice={revokeRemoteDevice}
              onCreateDefaultTeam={createDefaultVirtualTeam}
              onSaveTeam={saveVirtualTeam}
              onRunTeam={runVirtualTeam}
              onDeleteTeam={deleteVirtualTeam}
              onSetToolPermission={(toolName, mode) => {
                void updateToolPermissionPolicy(toolName, mode);
                setAutomationMessage(`${toolName} permission policy set to ${mode}.`);
              }}
              onApplyPermissionPreset={preset => {
                applyToolPermissionPreset(preset);
                setAutomationMessage(
                  preset === 'allow-all'
                    ? 'All bridge tools are allowed for unattended automation.'
                    : preset === 'ask-mutating'
                      ? 'Read-only tools are allowed and mutating tools require approval.'
                      : 'Read-only tools are allowed and mutating tools are denied.',
                );
              }}
            />
          )}

          {activeView === 'history' && (
            <HistoryView
              activeSection={activeHistorySection}
              records={historyRecords}
              storageInfo={historyStorageInfo}
              message={historyMessage}
              exportText={historyExportText}
              onRefresh={refreshHistoryData}
              onDeleteRecord={deleteHistoryRecord}
              onRestoreChat={restoreChatFromHistory}
              onExportRecords={exportHistoryRecords}
            />
          )}

          {activeView === 'settings' && (
            <SettingsView
              activeSection={activeSettingsSection}
              draft={settingsDraft}
              message={settingsMessage}
              saving={isSavingSettings}
              onChange={updateSettingsDraft}
              onClearToken={clearToken}
              onSubmit={saveSettings}
            />
          )}
        </main>

        <footer className={styles.footer}>
          <button className={styles.statusPane} type="button" onClick={() => setActiveView('chat')}>
            <span>Status</span>
            <strong>{statusLabel}</strong>
          </button>
          <button
            className={styles.statusPane}
            type="button"
            onClick={() => {
              setActiveProjectsSection('files');
              setActiveView('projects');
            }}
          >
            <span>Workspace</span>
            <strong title={appInfo?.workspacePath || undefined}>{appInfo?.workspacePath ? formatSidebarLabel(appInfo.workspacePath, 34) : 'Unknown'}</strong>
          </button>
          <button
            className={styles.statusPane}
            type="button"
            onClick={() => {
              setActiveToolsSection('bridge');
              setActiveView('tools');
            }}
          >
            <span>Tools</span>
            <strong>{exposedBridgeToolCount}/{tools.length} bridge / {mcpTools.length} MCP</strong>
          </button>
          <button
            className={styles.statusPane}
            type="button"
            onClick={() => {
              setActiveAutomationSection('tasks');
              setActiveView('automation');
            }}
          >
            <span>Automation</span>
            <strong>{scheduledTasks.length} tasks / {virtualTeams.length} teams</strong>
          </button>
          <button
            className={styles.statusPane}
            type="button"
            onClick={() => {
              setActiveHistorySection('overview');
              setActiveView('history');
            }}
          >
            <span>History</span>
            <strong>{historyStorageInfo.recordCount} records</strong>
          </button>
          <span className={styles.statusPaneStatic}>
            <span>Tokens</span>
            <strong>{tokenUsage.inputTokens} in / {tokenUsage.outputTokens} out</strong>
          </span>
          <span className={styles.statusPaneStatic}>
            <span>Mode</span>
            <strong>{appConfig?.enableLlmTools ? 'Agent' : 'Chat'}</strong>
          </span>
        </footer>
      </div>

      {activeFileWriteReview && (
        <FileWriteReviewDialog
          review={activeFileWriteReview}
          queuedCount={fileWriteReviews.length}
          onApprove={() => resolveFileWriteReview(activeFileWriteReview, true)}
          onReject={() => resolveFileWriteReview(activeFileWriteReview, false)}
        />
      )}

      {activeCommandReview && (
        <CommandReviewDialog
          review={activeCommandReview}
          queuedCount={commandReviews.length}
          onApprove={() => resolveCommandReview(activeCommandReview, true)}
          onReject={() => resolveCommandReview(activeCommandReview, false)}
        />
      )}

      {activeToolPermissionReview && (
        <ToolPermissionReviewDialog
          review={activeToolPermissionReview}
          queuedCount={toolPermissionReviews.length}
          onApprove={() => resolveToolPermissionReview(activeToolPermissionReview, true)}
          onReject={() => resolveToolPermissionReview(activeToolPermissionReview, false)}
        />
      )}
    </div>
  );
}

function ProjectsView({
  activeSection,
  appInfo,
  appConfig,
  appState,
  activeProviderLabel,
  activeProviderDefault,
  viewportSize,
  tokenUsage,
  currentSessionTitle,
  sessionCount,
  workspacePath,
  workspaceEntries,
  workspaceBrowserError,
  workspaceActionMessage,
  isLoadingWorkspaceEntries,
  onOpenWorkspaceEntry,
  onOpenWorkspacePath,
  onRevealWorkspacePath,
  onGoToWorkspaceParent,
  onRefreshWorkspace,
  mcpServers,
  mcpTools,
}: {
  activeSection: ProjectsSectionId;
  appInfo: AppInfo | null;
  appConfig: AppConfig | null;
  appState: Record<string, any>;
  activeProviderLabel: string;
  activeProviderDefault: ReturnType<typeof getProviderDefault>;
  viewportSize: { width: number; height: number };
  tokenUsage: { inputTokens: number; outputTokens: number };
  currentSessionTitle: string;
  sessionCount: number;
  workspacePath: string;
  workspaceEntries: FileEntry[];
  workspaceBrowserError: string;
  workspaceActionMessage: string;
  isLoadingWorkspaceEntries: boolean;
  onOpenWorkspaceEntry: (entry: FileEntry) => void;
  onOpenWorkspacePath: (path: string) => void;
  onRevealWorkspacePath: (path: string) => void;
  onGoToWorkspaceParent: () => void;
  onRefreshWorkspace: () => void;
  mcpServers: McpServerInfo[];
  mcpTools: McpToolInfo[];
}) {
  const activeMenuItem = PROJECTS_MENU.find(item => item.id === activeSection) ?? PROJECTS_MENU[0];
  const workspaceTitle = appInfo?.workspacePath?.split('/').filter(Boolean).pop() || 'Workspace';

  return (
    <section className={styles.detailView} aria-label="Projects">
      <div className={styles.detailToolbar}>
        <div>
          <span className={styles.detailEyebrow}>Projects</span>
          <h2>{activeMenuItem.title}</h2>
          <p className={styles.settingsPageSubtitle}>{activeMenuItem.description}</p>
        </div>
      </div>

      {activeSection === 'overview' && (
        <>
          <div className={styles.detailHero}>
            <span className={styles.detailEyebrow}>Current workspace</span>
            <h2>{workspaceTitle}</h2>
            <p title={appInfo?.workspacePath || undefined}>{appInfo?.workspacePath || 'Workspace path unavailable'}</p>
          </div>

          <div className={styles.detailGrid}>
            <section className={styles.detailPanel}>
              <h3>Model</h3>
              <dl className={styles.detailList}>
                <div>
                  <dt>Provider</dt>
                  <dd>{activeProviderLabel}</dd>
                </div>
                <div>
                  <dt>Model</dt>
                  <dd>{appConfig?.model || activeProviderDefault.model}</dd>
                </div>
                <div>
                  <dt>Base URL</dt>
                  <dd>{appConfig?.baseUrl || activeProviderDefault.baseUrl || 'Provider default'}</dd>
                </div>
                <div>
                  <dt>Context</dt>
                  <dd>{appConfig?.contextTokens ?? activeProviderDefault.contextTokens}</dd>
                </div>
              </dl>
            </section>

            <section className={styles.detailPanel}>
              <h3>Workspace State</h3>
              <dl className={styles.detailList}>
                <div>
                  <dt>Tool calls</dt>
                  <dd>{appConfig?.enableLlmTools ? 'Enabled' : 'Disabled'}</dd>
                </div>
                <div>
                  <dt>MCP servers</dt>
                  <dd>{mcpServers.length}</dd>
                </div>
                <div>
                  <dt>MCP tools</dt>
                  <dd>{mcpTools.length}</dd>
                </div>
                <div>
                  <dt>State keys</dt>
                  <dd>{Object.keys(appState).length}</dd>
                </div>
              </dl>
            </section>
          </div>
        </>
      )}

      {activeSection === 'files' && (
        <section className={styles.detailPanel}>
          <div className={styles.panelHeader}>
            <div>
              <h3>Files</h3>
              <span title={appInfo?.workspacePath || undefined}>
                {workspacePath === '.' ? appInfo?.workspacePath || '.' : workspacePath}
              </span>
            </div>
            <div className={styles.panelActions}>
              <button className={styles.secondaryButton} type="button" onClick={onGoToWorkspaceParent} disabled={workspacePath === '.' || isLoadingWorkspaceEntries}>
                Up
              </button>
              <button className={styles.secondaryButton} type="button" onClick={onRefreshWorkspace} disabled={isLoadingWorkspaceEntries}>
                Refresh
              </button>
            </div>
          </div>

          {workspaceBrowserError && (
            <span className={styles.inlineError}>{workspaceBrowserError}</span>
          )}
          {workspaceActionMessage && !workspaceBrowserError && (
            <span className={styles.inlineSuccess}>{workspaceActionMessage}</span>
          )}

          <div className={styles.fileBrowser} aria-label="Workspace files">
            {isLoadingWorkspaceEntries && (
              <span className={styles.mutedText}>Loading files...</span>
            )}

            {!isLoadingWorkspaceEntries && workspaceEntries.length === 0 && !workspaceBrowserError && (
              <span className={styles.mutedText}>No files in this directory</span>
            )}

            {!isLoadingWorkspaceEntries && workspaceEntries.map(entry => {
              const entryPath = joinWorkspacePath(workspacePath, entry.name);

              return (
                <div
                  className={entry.type === 'directory' ? styles.fileEntryDirectory : styles.fileEntry}
                  key={`${entry.type}-${entry.name}`}
                  title={entry.name}
                >
                  <button
                    className={styles.fileEntryMain}
                    type="button"
                    onClick={() => entry.type === 'directory' ? onOpenWorkspaceEntry(entry) : onOpenWorkspacePath(entryPath)}
                  >
                    <span>{entry.type === 'directory' ? 'Folder' : 'File'}</span>
                    <strong>{entry.name}</strong>
                    <em>{entry.type === 'directory' ? 'Directory' : formatFileSize(entry.size)}</em>
                  </button>
                  <div className={styles.fileEntryActions}>
                    <button className={styles.textButton} type="button" onClick={() => onOpenWorkspacePath(entryPath)}>
                      Open
                    </button>
                    <button className={styles.textButton} type="button" onClick={() => onRevealWorkspacePath(entryPath)}>
                      Reveal
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {activeSection === 'session' && (
        <section className={styles.detailPanel}>
          <h3>Session</h3>
          <dl className={styles.detailList}>
            <div>
              <dt>Current</dt>
              <dd title={currentSessionTitle}>{currentSessionTitle}</dd>
            </div>
            <div>
              <dt>Saved chats</dt>
              <dd>{sessionCount}</dd>
            </div>
            <div>
              <dt>Input tokens</dt>
              <dd>{tokenUsage.inputTokens}</dd>
            </div>
            <div>
              <dt>Output tokens</dt>
              <dd>{tokenUsage.outputTokens}</dd>
            </div>
          </dl>
        </section>
      )}

      {activeSection === 'runtime' && (
        <section className={styles.detailPanel}>
          <h3>Runtime</h3>
          <dl className={styles.detailList}>
            <div>
              <dt>App</dt>
              <dd>{appInfo ? `${appInfo.platform} ${appInfo.arch}` : 'Unknown'}</dd>
            </div>
            <div>
              <dt>Mode</dt>
              <dd>{appInfo?.isDev ? 'Development' : 'Production'}</dd>
            </div>
            <div>
              <dt>Viewport</dt>
              <dd>{viewportSize.width} x {viewportSize.height}</dd>
            </div>
            <div>
              <dt>State keys</dt>
              <dd>{Object.keys(appState).length}</dd>
            </div>
            <div>
              <dt>MCP servers</dt>
              <dd>{mcpServers.length}</dd>
            </div>
            <div>
              <dt>MCP tools</dt>
              <dd>{mcpTools.length}</dd>
            </div>
          </dl>
        </section>
      )}
    </section>
  );
}

function ToolsView({
  activeSection,
  tools,
  mcpTools,
  mcpServers,
  appConfig,
  routerMessage,
  toolActivities,
  onToggleModelTool,
  onApplyToolPreset,
  onSetToolPermission,
  onApplyPermissionPreset,
  onRunCommand,
  onOpenWorkspacePath,
  onRevealWorkspacePath,
  onRefresh,
  onClearActivities,
}: {
  activeSection: ToolsSectionId;
  tools: Tool[];
  mcpTools: McpToolInfo[];
  mcpServers: McpServerInfo[];
  appConfig: AppConfig | null;
  routerMessage: string;
  toolActivities: ToolActivity[];
  onToggleModelTool: (toolName: string, exposed: boolean) => void;
  onApplyToolPreset: (preset: 'all' | 'read-only' | 'mutating-off') => void;
  onSetToolPermission: (toolName: string, permission: ToolPermissionMode) => void;
  onApplyPermissionPreset: (preset: 'allow-all' | 'ask-mutating' | 'deny-mutating') => void;
  onRunCommand: (command: string, cwd?: string) => void;
  onOpenWorkspacePath: (targetPath: string) => void;
  onRevealWorkspacePath: (targetPath: string) => void;
  onRefresh: () => void;
  onClearActivities: () => void;
}) {
  const exposedToolCount = tools.filter(tool => isToolExposedToModel(tool, appConfig)).length;
  const toolGroups = groupToolsByCategory(tools);
  const policyCounts = tools.reduce<Record<ToolPermissionMode, number>>(
    (counts, tool) => {
      counts[getToolPermissionPolicy(tool, appConfig)] += 1;
      return counts;
    },
    { allow: 0, ask: 0, deny: 0 },
  );
  const activeMenuItem = TOOLS_MENU.find(item => item.id === activeSection) ?? TOOLS_MENU[0];

  return (
    <section className={styles.detailView} aria-label="Tools">
      <div className={styles.detailToolbar}>
        <div>
          <span className={styles.detailEyebrow}>Agent capabilities</span>
          <h2>{activeMenuItem.title}</h2>
          <p className={styles.settingsPageSubtitle}>{activeMenuItem.description}</p>
        </div>
        {(activeSection === 'bridge' || activeSection === 'mcp') && (
          <button className={styles.secondaryButton} type="button" onClick={onRefresh}>
            Refresh
          </button>
        )}
      </div>

      {activeSection === 'bridge' && (
        <section className={styles.detailPanel}>
          <h3>Bridge Tools</h3>
          <div className={styles.toolRouterSummary}>
            <div>
              <span>Model exposure</span>
              <strong>{exposedToolCount} / {tools.length}</strong>
            </div>
            <div>
              <span>Tool calls</span>
              <strong>{appConfig?.enableLlmTools ? 'Enabled' : 'Disabled'}</strong>
            </div>
            <div>
              <span>Ask policy</span>
              <strong>{policyCounts.ask}</strong>
            </div>
            <div>
              <span>Denied</span>
              <strong>{policyCounts.deny}</strong>
            </div>
          </div>
          <div className={styles.toolRouterActions}>
            <button className={styles.secondaryButton} type="button" onClick={() => onApplyToolPreset('all')}>
              Expose all
            </button>
            <button className={styles.secondaryButton} type="button" onClick={() => onApplyToolPreset('read-only')}>
              Read-only only
            </button>
            <button className={styles.secondaryButton} type="button" onClick={() => onApplyToolPreset('mutating-off')}>
              Hide mutating
            </button>
            <button className={styles.secondaryButton} type="button" onClick={() => onApplyPermissionPreset('allow-all')}>
              Allow all
            </button>
            <button className={styles.secondaryButton} type="button" onClick={() => onApplyPermissionPreset('ask-mutating')}>
              Ask mutating
            </button>
            <button className={styles.secondaryButton} type="button" onClick={() => onApplyPermissionPreset('deny-mutating')}>
              Deny mutating
            </button>
          </div>
          {routerMessage && <span className={styles.toolRouterMessage}>{routerMessage}</span>}
          <div className={styles.toolCatalog}>
            {toolGroups.map(group => (
              <section className={styles.toolCatalogGroup} key={group.id}>
                <h4>{group.label}</h4>
                {group.tools.map(tool => {
                  const exposed = isToolExposedToModel(tool, appConfig);
                  const permission = getToolPermissionPolicy(tool, appConfig);

                  return (
                    <article className={styles.toolCatalogItem} key={tool.name}>
                      <div>
                        <strong>{tool.name}</strong>
                        <span>{tool.readOnly ? 'Read-only' : 'Can change workspace'}</span>
                      </div>
                      <p>{tool.description}</p>
                      <div className={styles.toolExposureRow}>
                        <span>{exposed ? 'Exposed to model' : 'Hidden from model'}</span>
                        <button
                          className={exposed ? styles.toolExposureButton : styles.toolExposureButtonOff}
                          type="button"
                          onClick={() => onToggleModelTool(tool.name, !exposed)}
                        >
                          {exposed ? 'Hide' : 'Expose'}
                        </button>
                      </div>
                      <label className={styles.toolPermissionRow}>
                        <span>Permission</span>
                        <select
                          value={permission}
                          onChange={event => onSetToolPermission(tool.name, event.target.value as ToolPermissionMode)}
                        >
                          {TOOL_PERMISSION_OPTIONS.map(option => (
                            <option value={option.value} key={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                    </article>
                  );
                })}
              </section>
            ))}
            {tools.length === 0 && <span className={styles.mutedText}>No bridge tools available</span>}
          </div>
        </section>
      )}

      {activeSection === 'mcp' && (
        <section className={styles.detailPanel}>
          <h3>MCP Registry</h3>
          <dl className={styles.detailList}>
            <div>
              <dt>Servers</dt>
              <dd>{mcpServers.length}</dd>
            </div>
            <div>
              <dt>Tools</dt>
              <dd>{mcpTools.length}</dd>
            </div>
            <div>
              <dt>Execution policy</dt>
              <dd>{getToolPermissionPolicy({ name: 'mcp.callTool', description: '', inputSchema: {} }, appConfig)}</dd>
            </div>
          </dl>

          <div className={styles.toolCatalog}>
            {mcpServers.map(server => (
              <article className={styles.toolCatalogItem} key={`${server.scope ?? 'unknown'}-${server.name}`}>
                <div>
                  <strong>{server.name}</strong>
                  <span className={[
                    styles.toolStatusBadge,
                    server.status === 'connected' ? styles.toolStatusConnected : '',
                    server.status === 'error' ? styles.toolStatusError : '',
                  ].filter(Boolean).join(' ')}
                  >
                    {server.status}
                  </span>
                </div>
                <p>
                  {server.type}
                  {server.scope ? ` / ${server.scope}` : ''}
                  {server.error ? ` / ${server.error}` : ''}
                </p>
              </article>
            ))}
            {mcpServers.length === 0 && <span className={styles.mutedText}>No MCP servers configured</span>}
          </div>

          <div className={styles.tagList}>
            {mcpTools.map(tool => (
              <span className={styles.tag} key={`${tool.serverKey ?? tool.serverName}-${tool.toolName}`}>
                {tool.serverScope ? `${tool.serverScope}:` : ''}{tool.serverName}.{tool.toolName}
              </span>
            ))}
            {mcpTools.length === 0 && <span className={styles.mutedText}>No executable stdio MCP tools discovered yet</span>}
          </div>
        </section>
      )}

      {activeSection === 'command' && (
        <RunCommandPanel onRunCommand={onRunCommand} />
      )}

      {activeSection === 'activity' && (
        <ToolActivityPanel
          activities={toolActivities}
          onClear={onClearActivities}
          onOpenWorkspacePath={onOpenWorkspacePath}
          onRevealWorkspacePath={onRevealWorkspacePath}
        />
      )}

      {activeSection === 'plugins' && (
        <PluginSkillPanel appConfig={appConfig} />
      )}
    </section>
  );
}

function HistoryView({
  activeSection,
  records,
  storageInfo,
  message,
  exportText,
  onRefresh,
  onDeleteRecord,
  onRestoreChat,
  onExportRecords,
}: {
  activeSection: HistorySectionId;
  records: LocalHistoryRecord[];
  storageInfo: LocalHistoryStorageInfo;
  message: string;
  exportText: string;
  onRefresh: () => void;
  onDeleteRecord: (recordId: string) => void;
  onRestoreChat: (record: LocalHistoryRecord) => void;
  onExportRecords: (type?: LocalHistoryRecordType) => void;
}) {
  const activeMenuItem = HISTORY_MENU.find(item => item.id === activeSection) ?? HISTORY_MENU[0];
  const chatRecords = records.filter(record => record.type === 'chat-session');
  const toolRecords = records.filter(record => record.type === 'tool-event');
  const automationRecords = records.filter(record => record.type === 'automation-run');
  const projectEventRecords = records.filter(record => record.type === 'project-event');
  const visibleRecords = activeSection === 'chats'
    ? chatRecords
    : activeSection === 'tools'
      ? toolRecords
      : activeSection === 'automation'
        ? automationRecords
        : activeSection === 'events'
          ? projectEventRecords
          : records;

  async function copyExportText() {
    if (exportText) {
      await navigator.clipboard.writeText(exportText);
    }
  }

  function downloadExportText() {
    if (!exportText) {
      return;
    }

    const blob = new Blob([exportText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `code-agent-history-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className={styles.settingsView} aria-label="History">
      <div className={`${styles.settingsDialog} ${styles.settingsPageForm}`} role="region" aria-labelledby="history-title">
        <div className={styles.dialogHeader}>
          <div>
            <h2 id="history-title">History</h2>
            <p className={styles.settingsPageSubtitle}>Browse local chat, tool, automation, and project-event records stored outside shareable project files.</p>
          </div>
          <button className={styles.secondaryButton} type="button" onClick={onRefresh}>
            Refresh
          </button>
        </div>

        <div className={styles.settingsContent}>
          <div className={styles.settingsContentHeader}>
            <span className={styles.detailEyebrow}>Local history store</span>
            <h3>{activeMenuItem.title}</h3>
            <p>{activeMenuItem.description}</p>
          </div>

          {message && <p className={styles.inlineSuccess}>{message}</p>}

          {activeSection === 'overview' && (
            <>
              <SettingsSection title="Storage">
                <dl className={styles.detailList}>
                  <div>
                    <dt>Records</dt>
                    <dd>{storageInfo.recordCount}</dd>
                  </div>
                  <div>
                    <dt>Chats</dt>
                    <dd>{chatRecords.length}</dd>
                  </div>
                  <div>
                    <dt>Tool events</dt>
                    <dd>{toolRecords.length}</dd>
                  </div>
                  <div>
                    <dt>Automation</dt>
                    <dd>{automationRecords.length}</dd>
                  </div>
                  <div>
                    <dt>Project events</dt>
                    <dd>{projectEventRecords.length}</dd>
                  </div>
                </dl>
                <p className={styles.mutedText} title={storageInfo.storagePath}>Storage path: {storageInfo.storagePath || 'Unavailable'}</p>
              </SettingsSection>
              <HistoryRecordList
                records={records.slice(0, 12)}
                onDeleteRecord={onDeleteRecord}
                onRestoreChat={onRestoreChat}
              />
            </>
          )}

          {(activeSection === 'chats' || activeSection === 'tools' || activeSection === 'automation' || activeSection === 'events') && (
            <HistoryRecordList
              records={visibleRecords}
              onDeleteRecord={onDeleteRecord}
              onRestoreChat={onRestoreChat}
            />
          )}

          {activeSection === 'export' && (
            <>
              <SettingsSection title="Export History">
                <p className={styles.mutedText}>Exports are local JSON snapshots. They do not include provider API keys.</p>
                <div className={styles.toolRouterActions}>
                  <button className={styles.secondaryButton} type="button" onClick={() => onExportRecords()}>
                    Export All
                  </button>
                  <button className={styles.secondaryButton} type="button" onClick={() => onExportRecords('chat-session')}>
                    Export Chats
                  </button>
                  <button className={styles.secondaryButton} type="button" onClick={() => onExportRecords('tool-event')}>
                    Export Tool Events
                  </button>
                  <button className={styles.secondaryButton} type="button" onClick={() => onExportRecords('automation-run')}>
                    Export Automation
                  </button>
                  <button className={styles.secondaryButton} type="button" onClick={() => onExportRecords('project-event')}>
                    Export Project Events
                  </button>
                </div>
              </SettingsSection>

              <SettingsSection title="Export Data">
                <textarea value={exportText} readOnly rows={14} placeholder="Choose an export option above." />
                <div className={styles.toolRouterActions}>
                  <button className={styles.secondaryButton} type="button" disabled={!exportText} onClick={copyExportText}>
                    Copy JSON
                  </button>
                  <button className={styles.secondaryButton} type="button" disabled={!exportText} onClick={downloadExportText}>
                    Download JSON
                  </button>
                </div>
              </SettingsSection>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function HistoryRecordList({
  records,
  onDeleteRecord,
  onRestoreChat,
}: {
  records: LocalHistoryRecord[];
  onDeleteRecord: (recordId: string) => void;
  onRestoreChat: (record: LocalHistoryRecord) => void;
}) {
  return (
    <SettingsSection title="Records">
      <div className={styles.toolCatalog}>
        {records.map(record => (
          <article className={styles.toolCatalogItem} key={record.id}>
            <div>
              <strong>{getHistoryRecordTitle(record)}</strong>
              <span>{getHistoryRecordTypeLabel(record.type)}</span>
            </div>
            <p>{getHistoryRecordSummary(record)}</p>
            <p>{new Date(record.updatedAt).toLocaleString()}</p>
            {record.workspacePath && <p title={record.workspacePath}>Workspace: {record.workspacePath}</p>}
            <div className={styles.toolRouterActions}>
              {record.type === 'chat-session' && (
                <button className={styles.secondaryButton} type="button" onClick={() => onRestoreChat(record)}>
                  Restore Chat
                </button>
              )}
              <button className={styles.dangerButton} type="button" onClick={() => onDeleteRecord(record.id)}>
                Delete
              </button>
            </div>
          </article>
        ))}
        {records.length === 0 && <span className={styles.mutedText}>No history records in this section.</span>}
      </div>
    </SettingsSection>
  );
}

function createAutomationDraftId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getDefaultTeamGoal(role: string): string {
  const normalizedRole = role.toLowerCase();
  if (normalizedRole.includes('supervisor')) {
    return 'Coordinate the team, keep work aligned to the project objective, and decide the next handoff.';
  }
  if (normalizedRole.includes('manager')) {
    return 'Break the objective into milestones, clarify acceptance criteria, and identify sequencing risks.';
  }
  if (normalizedRole.includes('qa') || normalizedRole.includes('test')) {
    return 'Validate the implementation plan, propose tests, and call out release blockers.';
  }
  if (normalizedRole.includes('review')) {
    return 'Review the work for correctness, maintainability, security, and missing verification.';
  }
  return 'Implement the assigned work, use tools conservatively, and report concrete results.';
}

function getDefaultTeamTools(role: string): string[] {
  const normalizedRole = role.toLowerCase();
  if (normalizedRole.includes('supervisor') || normalizedRole.includes('manager')) {
    return ['automation.listTeams', 'automation.listTeamRuns', 'fs.read'];
  }
  if (normalizedRole.includes('qa') || normalizedRole.includes('test')) {
    return ['fs.read', 'bash.run'];
  }
  return ['fs.read', 'fs.write', 'bash.run'];
}

function createVirtualTeamMemberDraft(role = 'Developer'): VirtualTeamMember {
  return {
    id: createAutomationDraftId('member'),
    name: role,
    role,
    goal: getDefaultTeamGoal(role),
    tools: getDefaultTeamTools(role),
  };
}

function createVirtualTeamDraft(workspacePath: string): VirtualTeamBlueprint {
  const members = [
    createVirtualTeamMemberDraft('Supervisor'),
    createVirtualTeamMemberDraft('Project Manager'),
    createVirtualTeamMemberDraft('Developer'),
    createVirtualTeamMemberDraft('QA'),
  ];
  const now = Date.now();

  return {
    id: createAutomationDraftId('team'),
    name: 'Autonomous project team',
    objective: 'Build and validate the software project from the human blueprint.',
    workspacePath,
    permissionMode: 'full-access',
    maxIterations: 1,
    requireQaSignoff: true,
    supervisorId: members[0].id,
    members,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
}

function cloneVirtualTeamForDraft(team: VirtualTeamBlueprint, workspacePath: string): VirtualTeamBlueprint {
  const members = team.members.map(member => ({
    ...member,
    tools: [...member.tools],
  }));
  const supervisorId = members.some(member => member.id === team.supervisorId)
    ? team.supervisorId
    : members[0]?.id ?? '';

  return {
    ...team,
    workspacePath: team.workspacePath ?? workspacePath,
    permissionMode: team.permissionMode ?? 'full-access',
    maxIterations: team.maxIterations ?? 1,
    requireQaSignoff: Boolean(team.requireQaSignoff),
    supervisorId,
    members,
  };
}

function getTeamPermissionLabel(mode?: VirtualTeamPermissionMode): string {
  return mode === 'supervised' ? 'Supervised' : 'Full access';
}

function formatTeamTools(tools: string[]): string {
  return tools.join(', ');
}

function createPermissionTool(toolName: string): Tool {
  const readOnly = !['bash.run', 'fs.write', 'fs.undoLastWrite', 'mcp.callTool'].includes(toolName);
  return {
    name: toolName,
    description: '',
    inputSchema: {},
    readOnly,
  };
}

function AutomationView({
  activeSection,
  skills,
  tasks,
  taskRuns,
  schedulerStatus,
  remoteControl,
  teams,
  teamRuns,
  runningTeamIds,
  appConfig,
  workspacePath,
  message,
  exportText,
  importText,
  onRefresh,
  onSetSkillEnabled,
  onExportProject,
  onImportTextChange,
  onImportProject,
  onSaveTask,
  onRunTask,
  onSetTaskEnabled,
  onDeleteTask,
  onUpdateRemoteControl,
  onCreatePairingCode,
  onRevokeRemoteDevice,
  onCreateDefaultTeam,
  onSaveTeam,
  onRunTeam,
  onDeleteTeam,
  onSetToolPermission,
  onApplyPermissionPreset,
}: {
  activeSection: AutomationSectionId;
  skills: SkillManifest[];
  tasks: ScheduledTask[];
  taskRuns: AutomationRunRecord[];
  schedulerStatus: AutomationSchedulerStatus;
  remoteControl: RemoteControlState;
  teams: VirtualTeamBlueprint[];
  teamRuns: VirtualTeamRunRecord[];
  runningTeamIds: Set<string>;
  appConfig: AppConfig | null;
  workspacePath: string;
  message: string;
  exportText: string;
  importText: string;
  onRefresh: () => void;
  onSetSkillEnabled: (skillId: string, enabled: boolean) => void;
  onExportProject: (includeRuns: boolean) => void;
  onImportTextChange: (value: string) => void;
  onImportProject: () => void;
  onSaveTask: (task: Partial<ScheduledTask>) => void;
  onRunTask: (taskId: string) => void;
  onSetTaskEnabled: (taskId: string, enabled: boolean) => void;
  onDeleteTask: (taskId: string) => void;
  onUpdateRemoteControl: (update: Partial<RemoteControlState>) => void;
  onCreatePairingCode: (deviceName?: string) => void;
  onRevokeRemoteDevice: (deviceId: string) => void;
  onCreateDefaultTeam: (objective: string) => void;
  onSaveTeam: (team: Partial<VirtualTeamBlueprint>) => void;
  onRunTeam: (teamId: string) => void;
  onDeleteTeam: (teamId: string) => void;
  onSetToolPermission: (toolName: string, mode: ToolPermissionMode) => void;
  onApplyPermissionPreset: (preset: 'allow-all' | 'ask-mutating' | 'deny-mutating') => void;
}) {
  const [taskName, setTaskName] = useState('Daily project check');
  const [taskPrompt, setTaskPrompt] = useState('Summarize git status, failing tests, and next actions for this workspace.');
  const [taskInterval, setTaskInterval] = useState(1440);
  const [taskRetryEnabled, setTaskRetryEnabled] = useState(false);
  const [taskMaxRetries, setTaskMaxRetries] = useState(1);
  const [taskRetryDelay, setTaskRetryDelay] = useState(15);
  const [taskNotifySuccess, setTaskNotifySuccess] = useState(false);
  const [taskNotifyFailure, setTaskNotifyFailure] = useState(true);
  const [taskNotificationChannel, setTaskNotificationChannel] = useState<'desktop' | 'remote' | 'none'>('desktop');
  const [taskMissedRunPolicy, setTaskMissedRunPolicy] = useState<'run-once' | 'skip'>('run-once');
  const [deviceName, setDeviceName] = useState('Phone');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [teamDraft, setTeamDraft] = useState<VirtualTeamBlueprint>(() => createVirtualTeamDraft(workspacePath));
  const activeMenuItem = AUTOMATION_MENU.find(item => item.id === activeSection) ?? AUTOMATION_MENU[0];
  const selectedTeam = teams.find(team => team.id === selectedTeamId);
  const recentTeamRuns = selectedTeamId
    ? teamRuns.filter(run => run.teamId === selectedTeamId)
    : teamRuns;

  useEffect(() => {
    if (!selectedTeamId && teams[0]) {
      setSelectedTeamId(teams[0].id);
      setTeamDraft(cloneVirtualTeamForDraft(teams[0], workspacePath));
    }
  }, [selectedTeamId, teams, workspacePath]);

  function startNewTeamDraft() {
    const draft = createVirtualTeamDraft(workspacePath);
    setSelectedTeamId('');
    setTeamDraft(draft);
  }

  function selectTeam(team: VirtualTeamBlueprint) {
    setSelectedTeamId(team.id);
    setTeamDraft(cloneVirtualTeamForDraft(team, workspacePath));
  }

  function updateTeamDraft(update: Partial<VirtualTeamBlueprint>) {
    setTeamDraft(current => ({
      ...current,
      ...update,
      updatedAt: Date.now(),
    }));
  }

  function updateTeamMember(index: number, update: Partial<VirtualTeamMember>) {
    setTeamDraft(current => {
      const members = current.members.map((member, memberIndex) => (
        memberIndex === index ? { ...member, ...update } : member
      ));
      const supervisorId = members.some(member => member.id === current.supervisorId)
        ? current.supervisorId
        : members[0]?.id ?? '';

      return {
        ...current,
        members,
        supervisorId,
        updatedAt: Date.now(),
      };
    });
  }

  function addTeamMember(role = 'Developer') {
    setTeamDraft(current => {
      const member = createVirtualTeamMemberDraft(role);
      return {
        ...current,
        members: [...current.members, member],
        supervisorId: current.supervisorId || member.id,
        updatedAt: Date.now(),
      };
    });
  }

  function deleteTeamMember(memberId: string) {
    setTeamDraft(current => {
      const members = current.members.filter(member => member.id !== memberId);
      return {
        ...current,
        members,
        supervisorId: current.supervisorId === memberId ? members[0]?.id ?? '' : current.supervisorId,
        updatedAt: Date.now(),
      };
    });
  }

  function saveTeamDraft() {
    onSaveTeam({
      ...teamDraft,
      permissionMode: teamDraft.permissionMode ?? 'full-access',
      maxIterations: Math.max(1, Math.min(5, Math.floor(Number(teamDraft.maxIterations ?? 1) || 1))),
      requireQaSignoff: Boolean(teamDraft.requireQaSignoff),
      members: teamDraft.members.map(member => ({
        ...member,
        name: member.name.trim() || member.role.trim() || 'Team member',
        role: member.role.trim() || 'Contributor',
        goal: member.goal.trim() || getDefaultTeamGoal(member.role),
        tools: normalizeToolNameList(member.tools),
      })),
    });
  }

  async function copyAutomationExportText() {
    if (exportText) {
      await navigator.clipboard.writeText(exportText);
    }
  }

  function downloadAutomationExportText() {
    if (!exportText) {
      return;
    }

    const blob = new Blob([exportText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `code-agent-automation-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className={styles.settingsView} aria-label="Automation">
      <div className={`${styles.settingsDialog} ${styles.settingsPageForm}`} role="region" aria-labelledby="automation-title">
        <div className={styles.dialogHeader}>
          <div>
            <h2 id="automation-title">Automation</h2>
            <p className={styles.settingsPageSubtitle}>Manage skills, scheduled work, remote approvals, virtual teams, and unattended execution policy.</p>
          </div>
          <button className={styles.secondaryButton} type="button" onClick={onRefresh}>
            Refresh
          </button>
        </div>

        <div className={styles.settingsContent}>
            <div className={styles.settingsContentHeader}>
              <span className={styles.detailEyebrow}>Local automation platform</span>
              <h3>{activeMenuItem.title}</h3>
              <p>{activeMenuItem.description}</p>
            </div>

            {message && <p className={styles.inlineSuccess}>{message}</p>}

            {activeSection === 'skills' && (
              <>
                <SettingsSection title="Workspace Skills">
                  <p className={styles.mutedText}>Workspace skills are discovered from `.code-agent/skills` and `skills`.</p>
                  <div className={styles.toolCatalog}>
                    {skills.map(skill => (
                      <article className={styles.toolCatalogItem} key={skill.id}>
                        <div>
                          <strong>{skill.name}</strong>
                          <span>{skill.enabled ? 'Enabled' : 'Disabled'} / {skill.source}</span>
                        </div>
                        <p>{skill.description || 'No description provided.'}</p>
                        <p title={skill.path}>{skill.path}</p>
                        <div className={styles.toolRouterActions}>
                          <button className={styles.secondaryButton} type="button" onClick={() => onSetSkillEnabled(skill.id, !skill.enabled)}>
                            {skill.enabled ? 'Disable' : 'Enable'}
                          </button>
                        </div>
                      </article>
                    ))}
                    {skills.length === 0 && <span className={styles.mutedText}>No workspace skills found yet.</span>}
                  </div>
                </SettingsSection>

                <SettingsSection title="Shareable Project Bundle">
                  <p className={styles.mutedText}>Export tasks, teams, and skill policies for this workspace. Local remote devices, API keys, and pairing secrets are not included.</p>
                  <div className={styles.toolRouterActions}>
                    <button className={styles.secondaryButton} type="button" onClick={() => onExportProject(false)}>
                      Export Config
                    </button>
                    <button className={styles.secondaryButton} type="button" onClick={() => onExportProject(true)}>
                      Export With Runs
                    </button>
                    <button className={styles.secondaryButton} type="button" disabled={!exportText} onClick={copyAutomationExportText}>
                      Copy Export
                    </button>
                    <button className={styles.secondaryButton} type="button" disabled={!exportText} onClick={downloadAutomationExportText}>
                      Download Export
                    </button>
                    <button className={styles.primaryButton} type="button" onClick={onImportProject} disabled={!importText.trim()}>
                      Import JSON
                    </button>
                  </div>
                  <div className={styles.settingsGrid}>
                    <label className={`${styles.field} ${styles.fieldWide}`}>
                      <span>Export JSON</span>
                      <textarea value={exportText} readOnly rows={8} placeholder="Exported automation JSON appears here." />
                    </label>
                    <label className={`${styles.field} ${styles.fieldWide}`}>
                      <span>Import JSON</span>
                      <textarea value={importText} onChange={event => onImportTextChange(event.target.value)} rows={8} placeholder="Paste a CodeAgent automation export JSON object." />
                    </label>
                  </div>
                </SettingsSection>
              </>
            )}

            {activeSection === 'tasks' && (
              <>
                <SettingsSection title="Scheduler">
                  <dl className={styles.detailList}>
                    <div>
                      <dt>Status</dt>
                      <dd>{schedulerStatus.running ? 'Running' : 'Stopped'}</dd>
                    </div>
                    <div>
                      <dt>Tick</dt>
                      <dd>{Math.round(schedulerStatus.intervalMs / 1000)}s</dd>
                    </div>
                    <div>
                      <dt>Active tasks</dt>
                      <dd>{schedulerStatus.runningTaskIds.length}</dd>
                    </div>
                  </dl>
                  <p className={styles.mutedText}>Scheduled tasks use the bridge tool permission policy below. Virtual teams can also be set to full access in the Team Editor when trusted autonomous work should not pause for approvals.</p>
                </SettingsSection>

                <SettingsSection title="Create Task">
                  <div className={styles.settingsGrid}>
                    <label className={styles.field}>
                      <span>Name</span>
                      <input value={taskName} onChange={event => setTaskName(event.target.value)} />
                    </label>
                    <label className={styles.field}>
                      <span>Interval minutes</span>
                      <input
                        type="number"
                        min={1}
                        value={taskInterval}
                        onChange={event => setTaskInterval(Math.max(1, Number(event.target.value) || 1))}
                      />
                    </label>
                    <label className={`${styles.field} ${styles.fieldWide}`}>
                      <span>Prompt</span>
                      <textarea value={taskPrompt} onChange={event => setTaskPrompt(event.target.value)} rows={4} />
                    </label>
                    <label className={styles.field}>
                      <span>Retry failed runs</span>
                      <select value={taskRetryEnabled ? 'enabled' : 'disabled'} onChange={event => setTaskRetryEnabled(event.target.value === 'enabled')}>
                        <option value="disabled">Disabled</option>
                        <option value="enabled">Enabled</option>
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>Max retries</span>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={taskMaxRetries}
                        onChange={event => setTaskMaxRetries(Math.max(0, Math.min(10, Number(event.target.value) || 0)))}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Retry delay minutes</span>
                      <input
                        type="number"
                        min={1}
                        max={1440}
                        value={taskRetryDelay}
                        onChange={event => setTaskRetryDelay(Math.max(1, Math.min(1440, Number(event.target.value) || 1)))}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Notify on success</span>
                      <select value={taskNotifySuccess ? 'yes' : 'no'} onChange={event => setTaskNotifySuccess(event.target.value === 'yes')}>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>Notify on failure</span>
                      <select value={taskNotifyFailure ? 'yes' : 'no'} onChange={event => setTaskNotifyFailure(event.target.value === 'yes')}>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>Notification channel</span>
                      <select value={taskNotificationChannel} onChange={event => setTaskNotificationChannel(event.target.value as 'desktop' | 'remote' | 'none')}>
                        <option value="desktop">Desktop</option>
                        <option value="remote">Remote</option>
                        <option value="none">None</option>
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>Missed runs</span>
                      <select value={taskMissedRunPolicy} onChange={event => setTaskMissedRunPolicy(event.target.value as 'run-once' | 'skip')}>
                        <option value="run-once">Run once after restart</option>
                        <option value="skip">Skip and resume schedule</option>
                      </select>
                    </label>
                  </div>
                  <div className={styles.toolRouterActions}>
                    <button
                      className={styles.primaryButton}
                      type="button"
                      onClick={() => onSaveTask({
                        name: taskName,
                        prompt: taskPrompt,
                        intervalMinutes: taskInterval,
                        enabled: true,
                        retryPolicy: {
                          enabled: taskRetryEnabled,
                          maxRetries: taskMaxRetries,
                          retryDelayMinutes: taskRetryDelay,
                        },
                        notificationPolicy: {
                          onSuccess: taskNotifySuccess,
                          onFailure: taskNotifyFailure,
                          channel: taskNotificationChannel,
                        },
                        missedRunPolicy: taskMissedRunPolicy,
                      })}
                    >
                      Save Task
                    </button>
                  </div>
                </SettingsSection>

                <SettingsSection title="Configured Tasks">
                  <div className={styles.toolCatalog}>
                    {tasks.map(task => (
                      <article className={styles.toolCatalogItem} key={task.id}>
                        <div>
                          <strong>{task.name}</strong>
                          <span>{task.enabled ? 'Enabled' : 'Disabled'}</span>
                        </div>
                        <p>{task.prompt}</p>
                        <p>Every {task.intervalMinutes} min / next {new Date(task.nextRunAt).toLocaleString()}</p>
                        <p>Status: {task.lastStatus ?? 'never run'}</p>
                        <p>Retry: {task.retryPolicy?.enabled ? `${task.retryAttempts ?? 0}/${task.retryPolicy.maxRetries} after ${task.retryPolicy.retryDelayMinutes} min` : 'disabled'}</p>
                        <p>Notify: {task.notificationPolicy?.channel ?? 'desktop'} / success {task.notificationPolicy?.onSuccess ? 'on' : 'off'} / failure {task.notificationPolicy?.onFailure !== false ? 'on' : 'off'}</p>
                        <p>Missed runs: {task.missedRunPolicy === 'skip' ? 'skip and resume schedule' : 'run once after restart'}</p>
                        {task.lastResult && <p>{task.lastResult}</p>}
                        <div className={styles.toolRouterActions}>
                          <button className={styles.secondaryButton} type="button" onClick={() => onRunTask(task.id)}>
                            Run Now
                          </button>
                          <button className={styles.secondaryButton} type="button" onClick={() => onSetTaskEnabled(task.id, !task.enabled)}>
                            {task.enabled ? 'Disable' : 'Enable'}
                          </button>
                          <button className={styles.dangerButton} type="button" onClick={() => onDeleteTask(task.id)}>
                            Delete
                          </button>
                        </div>
                      </article>
                    ))}
                    {tasks.length === 0 && <span className={styles.mutedText}>No scheduled tasks configured.</span>}
                  </div>
                </SettingsSection>

                <SettingsSection title="Recent Task Runs">
                  <div className={styles.toolCatalog}>
                    {taskRuns.slice(0, 8).map(run => (
                      <article className={styles.toolCatalogItem} key={run.id}>
                        <div>
                          <strong>{run.taskName}</strong>
                          <span>{run.status}</span>
                        </div>
                        <p>{run.result ?? run.error ?? 'Running...'}</p>
                        <p>{new Date(run.startedAt).toLocaleString()}</p>
                      </article>
                    ))}
                    {taskRuns.length === 0 && <span className={styles.mutedText}>No task runs yet.</span>}
                  </div>
                </SettingsSection>
              </>
            )}

            {activeSection === 'remote' && (
              <>
                <SettingsSection title="Remote Access">
                  <dl className={styles.detailList}>
                    <div>
                      <dt>Status</dt>
                      <dd>{remoteControl.enabled ? 'Enabled' : 'Disabled'}</dd>
                    </div>
                    <div>
                      <dt>Mode</dt>
                      <dd>{remoteControl.mode}</dd>
                    </div>
                    <div>
                      <dt>Devices</dt>
                      <dd>{remoteControl.approvedDevices.length}</dd>
                    </div>
                    <div>
                      <dt>Pending approvals</dt>
                      <dd>{remoteControl.pendingActions?.length ?? 0}</dd>
                    </div>
                  </dl>
                  <div className={styles.settingsGrid}>
                    <label className={styles.field}>
                      <span>Device name</span>
                      <input value={deviceName} onChange={event => setDeviceName(event.target.value)} />
                    </label>
                  </div>
                  <div className={styles.toolRouterActions}>
                    <button className={styles.secondaryButton} type="button" onClick={() => onUpdateRemoteControl({ enabled: !remoteControl.enabled, mode: remoteControl.enabled ? 'disabled' : 'local-network' })}>
                      {remoteControl.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button className={styles.primaryButton} type="button" onClick={() => onCreatePairingCode(deviceName)}>
                      Pair Device
                    </button>
                  </div>
                </SettingsSection>

                {remoteControl.pairingCode && (
                  <SettingsSection title="Pairing Code">
                    <div className={styles.pairingCode}>
                      <span>Pairing code</span>
                      <strong>{remoteControl.pairingCode}</strong>
                      {remoteControl.pairingExpiresAt && <em>Expires {new Date(remoteControl.pairingExpiresAt).toLocaleTimeString()}</em>}
                    </div>
                  </SettingsSection>
                )}

                {(remoteControl.serverUrl || (remoteControl.localNetworkUrls?.length ?? 0) > 0) && (
                  <SettingsSection title="Remote URL">
                    <div className={styles.pairingCode}>
                      <span>Remote URL</span>
                      <strong>{remoteControl.localNetworkUrls?.[0] ?? remoteControl.serverUrl}</strong>
                      {remoteControl.serverUrl && <em>{remoteControl.serverUrl}</em>}
                    </div>
                  </SettingsSection>
                )}

                <SettingsSection title="Approved Devices">
                  <div className={styles.toolCatalog}>
                    {remoteControl.approvedDevices.map(device => (
                      <article className={styles.toolCatalogItem} key={device.id}>
                        <div>
                          <strong>{device.name}</strong>
                          <span>{device.lastSeenAt ? 'Seen recently' : 'Paired'}</span>
                        </div>
                        <p>Paired {new Date(device.createdAt).toLocaleString()}</p>
                        {device.lastSeenAt && <p>Last seen {new Date(device.lastSeenAt).toLocaleString()}</p>}
                        <div className={styles.toolRouterActions}>
                          <button className={styles.dangerButton} type="button" onClick={() => onRevokeRemoteDevice(device.id)}>
                            Revoke
                          </button>
                        </div>
                      </article>
                    ))}
                    {remoteControl.approvedDevices.length === 0 && <span className={styles.mutedText}>No approved remote devices.</span>}
                  </div>
                </SettingsSection>

                <SettingsSection title="Remote Audit Log">
                  <div className={styles.toolCatalog}>
                    {(remoteControl.auditLog ?? []).slice(0, 12).map(event => (
                      <article className={styles.toolCatalogItem} key={event.id}>
                        <div>
                          <strong>{event.message}</strong>
                          <span>{event.type}</span>
                        </div>
                        <p>{new Date(event.createdAt).toLocaleString()}</p>
                        {event.deviceName && <p>Device: {event.deviceName}</p>}
                      </article>
                    ))}
                    {(remoteControl.auditLog ?? []).length === 0 && <span className={styles.mutedText}>No remote-control audit events yet.</span>}
                  </div>
                </SettingsSection>
              </>
            )}

            {activeSection === 'team' && (
              <>
                <SettingsSection title="Team Blueprints">
                  <div className={styles.toolRouterActions}>
                    <button className={styles.secondaryButton} type="button" onClick={startNewTeamDraft}>
                      New Team
                    </button>
                    <button className={styles.secondaryButton} type="button" onClick={() => onCreateDefaultTeam(teamDraft.objective)}>
                      Add Default Template
                    </button>
                  </div>
                  <div className={styles.toolCatalog}>
                    {teams.map(team => {
                      const teamIsRunning = runningTeamIds.has(team.id) || team.lastStatus === 'running';
                      return (
                        <article className={team.id === selectedTeamId ? `${styles.toolCatalogItem} ${styles.toolCatalogItemSelected}` : styles.toolCatalogItem} key={team.id}>
                          <div>
                            <strong>{team.name}</strong>
                            <span>{teamIsRunning ? 'running' : team.status}</span>
                          </div>
                          <p>{team.objective}</p>
                          <p title={team.workspacePath ?? workspacePath}>Workspace: {team.workspacePath ?? workspacePath}</p>
                          <p>Permissions: {getTeamPermissionLabel(team.permissionMode)}</p>
                          <p>Governance: {team.maxIterations ?? 1} iteration(s) / QA {team.requireQaSignoff ? 'required' : 'optional'}</p>
                          <div className={styles.tagList}>
                            {team.members.map(member => (
                              <span className={styles.tag} key={member.id}>{member.role}</span>
                            ))}
                          </div>
                          {team.lastResult && <p>{team.lastResult}</p>}
                          <div className={styles.toolRouterActions}>
                            <button className={styles.secondaryButton} type="button" onClick={() => selectTeam(team)} disabled={teamIsRunning}>
                              Edit
                            </button>
                            <button className={styles.secondaryButton} type="button" onClick={() => onRunTeam(team.id)} disabled={teamIsRunning}>
                              {teamIsRunning ? 'Running...' : 'Run Team'}
                            </button>
                            <button className={styles.dangerButton} type="button" onClick={() => onDeleteTeam(team.id)} disabled={teamIsRunning}>
                              Delete
                            </button>
                          </div>
                        </article>
                      );
                    })}
                    {teams.length === 0 && <span className={styles.mutedText}>No virtual team blueprints configured.</span>}
                  </div>
                </SettingsSection>

                <SettingsSection title="Team Editor">
                  <div className={styles.settingsGrid}>
                    <label className={styles.field}>
                      <span>Team name</span>
                      <input value={teamDraft.name} onChange={event => updateTeamDraft({ name: event.target.value })} />
                    </label>
                    <label className={styles.field}>
                      <span>Supervisor</span>
                      <select value={teamDraft.supervisorId} onChange={event => updateTeamDraft({ supervisorId: event.target.value })}>
                        {teamDraft.members.map(member => (
                          <option value={member.id} key={member.id}>{member.name || member.role}</option>
                        ))}
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>Execution permissions</span>
                      <select
                        value={teamDraft.permissionMode ?? 'full-access'}
                        onChange={event => updateTeamDraft({ permissionMode: event.target.value as VirtualTeamPermissionMode })}
                      >
                        <option value="full-access">Full access, no approval popups</option>
                        <option value="supervised">Supervised, ask for risky tools</option>
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>Max iterations</span>
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={teamDraft.maxIterations ?? 1}
                        onChange={event => updateTeamDraft({
                          maxIterations: Math.max(1, Math.min(5, Math.floor(Number(event.target.value) || 1))),
                        })}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>QA/reviewer signoff</span>
                      <select
                        value={teamDraft.requireQaSignoff ? 'required' : 'optional'}
                        onChange={event => updateTeamDraft({ requireQaSignoff: event.target.value === 'required' })}
                      >
                        <option value="required">Required before success</option>
                        <option value="optional">Optional</option>
                      </select>
                    </label>
                    <label className={`${styles.field} ${styles.fieldWide}`}>
                      <span>Project objective</span>
                      <textarea value={teamDraft.objective} onChange={event => updateTeamDraft({ objective: event.target.value })} rows={4} />
                    </label>
                    <label className={`${styles.field} ${styles.fieldWide}`}>
                      <span>Team workspace path</span>
                      <input value={teamDraft.workspacePath ?? workspacePath} onChange={event => updateTeamDraft({ workspacePath: event.target.value })} />
                    </label>
                  </div>

                  <div className={styles.toolRouterActions}>
                    <button className={styles.secondaryButton} type="button" onClick={() => addTeamMember('Developer')}>
                      Add Developer
                    </button>
                    <button className={styles.secondaryButton} type="button" onClick={() => addTeamMember('QA')}>
                      Add QA
                    </button>
                    <button className={styles.secondaryButton} type="button" onClick={() => addTeamMember('Reviewer')}>
                      Add Reviewer
                    </button>
                    <button className={styles.primaryButton} type="button" onClick={saveTeamDraft}>
                      Save Team
                    </button>
                  </div>

                  <div className={styles.toolCatalog}>
                    {teamDraft.members.map((member, index) => (
                      <article className={styles.toolCatalogItem} key={member.id}>
                        <div>
                          <strong>{member.name || member.role || 'Team member'}</strong>
                          <span>{member.id === teamDraft.supervisorId ? 'Supervisor' : 'Member'}</span>
                        </div>
                        <div className={styles.settingsGrid}>
                          <label className={styles.field}>
                            <span>Name</span>
                            <input value={member.name} onChange={event => updateTeamMember(index, { name: event.target.value })} />
                          </label>
                          <label className={styles.field}>
                            <span>Role</span>
                            <input value={member.role} onChange={event => updateTeamMember(index, { role: event.target.value })} />
                          </label>
                          <label className={`${styles.field} ${styles.fieldWide}`}>
                            <span>Goal</span>
                            <textarea value={member.goal} onChange={event => updateTeamMember(index, { goal: event.target.value })} rows={3} />
                          </label>
                          <label className={styles.field}>
                            <span>Model override</span>
                            <input value={member.model ?? ''} onChange={event => updateTeamMember(index, { model: event.target.value || undefined })} />
                          </label>
                          <label className={styles.field}>
                            <span>Tools</span>
                            <input value={formatTeamTools(member.tools)} onChange={event => updateTeamMember(index, { tools: normalizeToolNameList(event.target.value) })} />
                          </label>
                        </div>
                        <div className={styles.toolRouterActions}>
                          <button className={styles.secondaryButton} type="button" onClick={() => updateTeamDraft({ supervisorId: member.id })}>
                            Make Supervisor
                          </button>
                          <button className={styles.dangerButton} type="button" onClick={() => deleteTeamMember(member.id)} disabled={teamDraft.members.length <= 1}>
                            Delete Member
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </SettingsSection>

                <SettingsSection title="Team Communication">
                  <p className={styles.mutedText}>
                    {selectedTeam ? `Showing runs for ${selectedTeam.name}.` : 'Showing recent runs across all teams.'}
                  </p>
                  <div className={styles.toolCatalog}>
                    {recentTeamRuns.slice(0, 6).map(run => (
                      <article className={styles.toolCatalogItem} key={run.id}>
                        <div>
                          <strong>{run.teamName}</strong>
                          <span>{run.status}</span>
                        </div>
                        <p>{run.summary ?? run.error ?? 'Running...'}</p>
                        <p title={run.workspacePath ?? workspacePath}>Workspace: {run.workspacePath ?? workspacePath}</p>
                        {run.artifactPath && <p title={run.artifactPath}>Artifact: {run.artifactPath}</p>}
                        {(run.milestones?.length ?? 0) > 0 && (
                          <div className={styles.teamTranscript}>
                            {run.milestones?.map(milestone => (
                              <section className={styles.teamTranscriptStep} key={`${run.id}-${milestone.id}`}>
                                <div>
                                  <strong>{milestone.title}</strong>
                                  <span>{milestone.status}</span>
                                </div>
                                {milestone.summary && <p>{milestone.summary}</p>}
                              </section>
                            ))}
                          </div>
                        )}
                        <div className={styles.teamTranscript}>
                          {run.steps.map((step, index) => (
                            <section className={styles.teamTranscriptStep} key={`${run.id}-${step.memberId}-${index}`}>
                              <div>
                                <strong>{step.iteration ? `Iteration ${step.iteration} / ` : ''}{step.role} / {step.memberName}</strong>
                                <span>{step.status}</span>
                              </div>
                              <p>{step.output ?? step.error ?? 'Waiting for output.'}</p>
                            </section>
                          ))}
                          {run.steps.length === 0 && <span className={styles.mutedText}>No team messages yet.</span>}
                        </div>
                        <p>{run.steps.length} step(s) / {new Date(run.startedAt).toLocaleString()}</p>
                      </article>
                    ))}
                    {recentTeamRuns.length === 0 && <span className={styles.mutedText}>No team runs yet.</span>}
                  </div>
                </SettingsSection>
              </>
            )}

            {activeSection === 'permissions' && (
              <>
                <SettingsSection title="Unattended Execution Policy">
                  <p className={styles.mutedText}>Scheduled tasks and supervised virtual teams use these desktop tool policies. Full-access virtual teams skip approval popups but still stay inside workspace and command safety boundaries.</p>
                  <div className={styles.toolRouterActions}>
                    <button className={styles.secondaryButton} type="button" onClick={() => onApplyPermissionPreset('allow-all')}>
                      Allow All Tools
                    </button>
                    <button className={styles.secondaryButton} type="button" onClick={() => onApplyPermissionPreset('ask-mutating')}>
                      Ask Before Changes
                    </button>
                    <button className={styles.dangerButton} type="button" onClick={() => onApplyPermissionPreset('deny-mutating')}>
                      Deny Mutating Tools
                    </button>
                  </div>
                </SettingsSection>

                <SettingsSection title="Key Automation Tools">
                  <div className={styles.toolCatalog}>
                    {AUTOMATION_PERMISSION_TOOLS.map(toolName => {
                      const permission = getToolPermissionPolicy(createPermissionTool(toolName), appConfig);
                      return (
                        <label className={styles.toolPermissionRow} key={toolName}>
                          <span>{toolName}</span>
                          <select value={permission} onChange={event => onSetToolPermission(toolName, event.target.value as ToolPermissionMode)}>
                            <option value="allow">Allow</option>
                            <option value="ask">Ask</option>
                            <option value="deny">Deny</option>
                          </select>
                        </label>
                      );
                    })}
                  </div>
                </SettingsSection>
              </>
            )}
        </div>
      </div>
    </section>
  );
}

function RunCommandPanel({
  onRunCommand,
}: {
  onRunCommand: (command: string, cwd?: string) => void;
}) {
  const [command, setCommand] = useState('');
  const [cwd, setCwd] = useState('.');
  const helperCommands = [
    { label: 'Git status', command: 'git status --short --branch' },
    { label: 'Git diff', command: 'git diff --stat' },
    { label: 'Branch', command: 'git branch --show-current' },
    { label: 'NPM scripts', command: 'npm run' },
    { label: 'Dev servers', command: 'lsof -iTCP -sTCP:LISTEN -P -n' },
  ];

  return (
    <section className={styles.detailPanel}>
      <h3>Run Command</h3>
      <p className={styles.mutedText}>Commands run through `bash.run`, stay inside the workspace, and require approval before execution.</p>
      <div className={styles.commandRunner}>
        <label className={styles.field}>
          <span>Command</span>
          <input value={command} onChange={event => setCommand(event.target.value)} placeholder="npm test" />
        </label>
        <label className={styles.field}>
          <span>Working directory</span>
          <input value={cwd} onChange={event => setCwd(event.target.value)} placeholder="." />
        </label>
        <button className={styles.primaryButton} type="button" onClick={() => onRunCommand(command, cwd)}>
          Review Run
        </button>
      </div>
      <div className={styles.toolRouterActions}>
        {helperCommands.map(helper => (
          <button
            className={styles.secondaryButton}
            type="button"
            key={helper.label}
            onClick={() => setCommand(helper.command)}
          >
            {helper.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function PluginSkillPanel({ appConfig }: { appConfig: AppConfig | null }) {
  const pluginDirs = readCliOption(appConfig, 'pluginDirs') || 'Default plugin paths';
  const agentsJson = readCliOption(appConfig, 'agentsJson') || 'Not configured';
  const mcpConfig = readCliOption(appConfig, 'mcpConfig') || 'Default MCP config';

  return (
    <section className={styles.detailPanel}>
      <h3>Plugins & Skills</h3>
      <dl className={styles.detailList}>
        <div>
          <dt>Plugin dirs</dt>
          <dd title={pluginDirs}>{pluginDirs}</dd>
        </div>
        <div>
          <dt>Agents JSON</dt>
          <dd title={agentsJson}>{agentsJson}</dd>
        </div>
        <div>
          <dt>MCP config</dt>
          <dd title={mcpConfig}>{mcpConfig}</dd>
        </div>
      </dl>
      <p className={styles.mutedText}>Manage plugin, skill, and MCP paths from Settings. Executable local MCP tools appear in the registry above.</p>
    </section>
  );
}

function FileWriteReviewDialog({
  review,
  queuedCount,
  onApprove,
  onReject,
}: {
  review: FileWriteReviewRequest;
  queuedCount: number;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className={styles.dialogBackdrop} role="presentation">
      <section className={styles.reviewDialog} role="dialog" aria-modal="true" aria-labelledby="file-write-review-title">
        <div className={styles.dialogHeader}>
          <div>
            <h2 id="file-write-review-title">Review File Write</h2>
            <p className={styles.reviewSubtitle}>
              {review.exists ? 'Update existing file' : 'Create new file'}
              {queuedCount > 1 ? ` · ${queuedCount - 1} more pending` : ''}
            </p>
          </div>
          <span className={styles.reviewBadge}>Approval required</span>
        </div>

        <dl className={styles.reviewMeta}>
          <div>
            <dt>Path</dt>
            <dd title={review.absolutePath}>{review.path}</dd>
          </div>
          <div>
            <dt>Full path</dt>
            <dd title={review.absolutePath}>{review.absolutePath}</dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>{review.previousSizeBytes} {'->'} {review.nextSizeBytes} bytes</dd>
          </div>
        </dl>

        <pre className={styles.diffBlock} aria-label="Proposed file diff">
          {renderDiff(review.diff)}
        </pre>

        <div className={styles.dialogFooter}>
          <span className={styles.settingsMessage}>The file is not written until you approve this review.</span>
          <div className={styles.dialogActions}>
            <button className={styles.dangerButton} type="button" onClick={onReject}>
              Reject
            </button>
            <button className={styles.primaryButton} type="button" onClick={onApprove}>
              Approve Write
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function CommandReviewDialog({
  review,
  queuedCount,
  onApprove,
  onReject,
}: {
  review: CommandReviewRequest;
  queuedCount: number;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className={styles.dialogBackdrop} role="presentation">
      <section className={styles.reviewDialog} role="dialog" aria-modal="true" aria-labelledby="command-review-title">
        <div className={styles.dialogHeader}>
          <div>
            <h2 id="command-review-title">Review Command</h2>
            <p className={styles.reviewSubtitle}>
              Non-interactive workspace command
              {queuedCount > 1 ? ` · ${queuedCount - 1} more pending` : ''}
            </p>
          </div>
          <span className={styles.reviewBadge}>Approval required</span>
        </div>

        <dl className={styles.reviewMeta}>
          <div>
            <dt>Command</dt>
            <dd title={review.command}>{review.command}</dd>
          </div>
          <div>
            <dt>Working dir</dt>
            <dd title={review.absoluteCwd}>{review.cwd}</dd>
          </div>
          <div>
            <dt>Timeout</dt>
            <dd>{review.timeoutMs} ms</dd>
          </div>
        </dl>

        <pre className={styles.commandBlock} aria-label="Parsed command arguments">
          {formatJson({
            argv: review.argv,
            cwd: review.absoluteCwd,
          })}
        </pre>

        <div className={styles.dialogFooter}>
          <span className={styles.settingsMessage}>The command is not executed until you approve this review.</span>
          <div className={styles.dialogActions}>
            <button className={styles.dangerButton} type="button" onClick={onReject}>
              Reject
            </button>
            <button className={styles.primaryButton} type="button" onClick={onApprove}>
              Approve Run
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function ToolPermissionReviewDialog({
  review,
  queuedCount,
  onApprove,
  onReject,
}: {
  review: ToolPermissionReviewRequest;
  queuedCount: number;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className={styles.dialogBackdrop} role="presentation">
      <section className={styles.reviewDialog} role="dialog" aria-modal="true" aria-labelledby="tool-permission-review-title">
        <div className={styles.dialogHeader}>
          <div>
            <h2 id="tool-permission-review-title">Review Tool Call</h2>
            <p className={styles.reviewSubtitle}>
              Desktop permission policy requires approval
              {queuedCount > 1 ? ` · ${queuedCount - 1} more pending` : ''}
            </p>
          </div>
          <span className={styles.reviewBadge}>Approval required</span>
        </div>

        <dl className={styles.reviewMeta}>
          <div>
            <dt>Tool</dt>
            <dd title={review.toolName}>{review.toolName}</dd>
          </div>
          <div>
            <dt>Requested</dt>
            <dd>{new Date(review.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</dd>
          </div>
        </dl>

        <pre className={styles.commandBlock} aria-label="Tool arguments">
          {formatJson(review.args)}
        </pre>

        <div className={styles.dialogFooter}>
          <span className={styles.settingsMessage}>The tool call is blocked until you approve it.</span>
          <div className={styles.dialogActions}>
            <button className={styles.dangerButton} type="button" onClick={onReject}>
              Reject
            </button>
            <button className={styles.primaryButton} type="button" onClick={onApprove}>
              Approve Tool
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function renderDiff(diff: string): React.ReactNode {
  if (!diff.trim()) {
    return <span className={styles.diffMeta}>No textual changes.</span>;
  }

  return diff.split('\n').map((line, index) => {
    let className = styles.diffMeta;
    if (line.startsWith('+') && !line.startsWith('+++')) {
      className = styles.diffAdded;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      className = styles.diffRemoved;
    } else if (line.startsWith('@@') || line.startsWith('---') || line.startsWith('+++')) {
      className = styles.diffHeaderLine;
    }

    return (
      <span className={className} key={`${index}-${line.slice(0, 12)}`}>
        {line || ' '}
        {'\n'}
      </span>
    );
  });
}

function ToolActivityPanel({
  activities,
  onClear,
  onOpenWorkspacePath,
  onRevealWorkspacePath,
}: {
  activities: ToolActivity[];
  onClear: () => void;
  onOpenWorkspacePath: (targetPath: string) => void;
  onRevealWorkspacePath: (targetPath: string) => void;
}) {
  return (
    <section className={styles.panelSection}>
      <div className={styles.panelHeader}>
        <h2>Tool activity</h2>
        <button className={styles.textButton} type="button" onClick={onClear} disabled={activities.length === 0}>
          Clear
        </button>
      </div>
      <div className={styles.toolActivityList}>
        {activities.length === 0 && (
          <span className={styles.mutedText}>No tool calls yet</span>
        )}
        {activities.map(activity => {
          const filePath = getToolResultPath(activity);

          return (
            <article className={styles.toolActivityItem} key={activity.id}>
              <div className={styles.toolActivityHeader}>
                <span className={styles.toolName}>{activity.toolName}</span>
                <span className={`${styles.toolStatus} ${styles[`toolStatus_${activity.status}` as keyof typeof styles] || ''}`}>
                  {activity.status}
                </span>
              </div>
              <div className={styles.toolActivityMeta}>
                <span>{new Date(activity.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                {activity.duration !== undefined && <span>{activity.duration} ms</span>}
              </div>
              <p className={styles.toolActivityText}>{summarizeToolArgs(activity.args)}</p>
              {activity.resultPreview && (
                <p className={styles.toolActivityResult}>{activity.resultPreview}</p>
              )}
              {filePath && activity.status === 'succeeded' && (
                <div className={styles.toolActivityActions}>
                  <span title={filePath}>{filePath}</span>
                  <button className={styles.textButton} type="button" onClick={() => onOpenWorkspacePath(filePath)}>
                    Open
                  </button>
                  <button className={styles.textButton} type="button" onClick={() => onRevealWorkspacePath(filePath)}>
                    Reveal
                  </button>
                </div>
              )}
              {activity.error && (
                <p className={styles.toolActivityError}>{activity.error}</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function MessageItem({
  message,
  copied,
  onCopy,
}: {
  message: UiMessage;
  copied: boolean;
  onCopy: () => void;
}) {
  const roleClass = styles[`message_${message.role}` as keyof typeof styles] || '';

  return (
    <article className={`${styles.message} ${roleClass}`}>
      <div className={styles.messageHeader}>
        <div>
          <span className={styles.messageRole}>{message.title || message.role}</span>
          <time>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
        </div>
        <button className={styles.textButton} type="button" onClick={onCopy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className={styles.messageContent}>{renderMessageContent(message.content)}</div>
      {message.usage && (
        <div className={styles.messageMeta}>
          {message.usage.inputTokens} input tokens / {message.usage.outputTokens} output tokens
        </div>
      )}
    </article>
  );
}

function renderMessageContent(content: string): React.ReactNode {
  const blocks: React.ReactNode[] = [];
  const fencePattern = /```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fencePattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      blocks.push(renderTextBlock(content.slice(lastIndex, match.index), `text-${lastIndex}`));
    }

    const language = match[1];
    const code = match[2].replace(/\n$/, '');
    blocks.push(renderCodeBlock(code, language, `code-${match.index}`));
    lastIndex = fencePattern.lastIndex;
  }

  if (lastIndex < content.length) {
    blocks.push(renderTextBlock(content.slice(lastIndex), `text-${lastIndex}`));
  }

  return blocks.length > 0 ? blocks : renderTextBlock(content, 'text-empty');
}

function renderTextBlock(text: string, key: string): React.ReactNode {
  if (!text) {
    return null;
  }

  return (
    <p className={styles.textBlock} key={key}>
      {renderAnsiText(text)}
    </p>
  );
}

function renderCodeBlock(code: string, language: string | undefined, key: string): React.ReactNode {
  let highlighted = '';
  try {
    highlighted = language
      ? hljs.highlight(code, { language, ignoreIllegals: true }).value
      : hljs.highlightAuto(code).value;
  } catch {
    highlighted = hljs.highlightAuto(code).value;
  }

  return (
    <pre className={styles.codeBlock} key={key}>
      <code dangerouslySetInnerHTML={{ __html: highlighted }} />
    </pre>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.settingsSection}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function TextSetting({
  label,
  value,
  onChange,
  type = 'text',
  className = '',
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  className?: string;
}) {
  return (
    <label className={`${styles.field} ${className}`}>
      <span>{label}</span>
      <input type={type} value={value} onChange={event => onChange(event.target.value)} autoComplete="off" />
    </label>
  );
}

function TextAreaSetting({
  label,
  value,
  onChange,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={`${styles.field} ${className}`}>
      <span>{label}</span>
      <textarea value={value} onChange={event => onChange(event.target.value)} rows={3} />
    </label>
  );
}

function SelectSetting<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <select value={value} onChange={event => onChange(event.target.value as T)}>
        {options.map(option => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleSetting({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={styles.toggleField}>
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function updateCsvValue(value: string, entry: string, enabled: boolean): string {
  const entries = value.split(',').map(item => item.trim()).filter(Boolean);
  const next = new Set(entries);
  if (enabled) {
    next.add(entry);
  } else {
    next.delete(entry);
  }
  return Array.from(next).join(',');
}

function SettingsView({
  activeSection,
  draft,
  message,
  saving,
  onChange,
  onClearToken,
  onSubmit,
}: {
  activeSection: SettingsSectionId;
  draft: SettingsDraft;
  message: string;
  saving: boolean;
  onChange: (update: Partial<SettingsDraft>) => void;
  onClearToken: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const selectedSources = new Set(draft.settingSources.split(',').map(source => source.trim()).filter(Boolean));
  const providerOptions = Object.entries(PROVIDER_DEFAULTS).map(([value, option]) => ({
    value: value as LlmProviderType,
    label: option.label,
  }));
  const activeMenuItem = SETTINGS_MENU.find(item => item.id === activeSection) ?? SETTINGS_MENU[0];

  function changeProvider(provider: LlmProviderType) {
    const providerDefault = getProviderDefault(provider);
    onChange({
      llmProvider: provider,
      baseUrl: providerDefault.baseUrl,
      model: providerDefault.model,
      maxTokens: providerDefault.maxTokens,
      contextTokens: providerDefault.contextTokens,
      enableLlmTools: providerDefault.enableLlmTools,
      apiKey: '',
    });
  }

  return (
    <section className={styles.settingsView} aria-label="Settings">
      <form className={`${styles.settingsDialog} ${styles.settingsPageForm}`} onSubmit={onSubmit} aria-labelledby="settings-title">
        <div className={styles.dialogHeader}>
          <div>
            <h2 id="settings-title">Settings</h2>
            <p className={styles.settingsPageSubtitle}>Configure model backends, agent tools, workspace context, and desktop compatibility options.</p>
          </div>
        </div>

        <div className={styles.settingsContent}>
            <div className={styles.settingsContentHeader}>
              <span className={styles.detailEyebrow}>Settings</span>
              <h3>{activeMenuItem.title}</h3>
              <p>{activeMenuItem.description}</p>
            </div>

        {activeSection === 'model' && (
        <SettingsSection title="Model">
          <div className={styles.settingsGrid}>
            <SelectSetting
              label="LLM backend"
              value={draft.llmProvider}
              options={providerOptions}
              onChange={changeProvider}
            />
            <TextSetting
              label={draft.llmProvider === 'openai-compatible' ? 'API key (optional)' : 'API key'}
              type="password"
              value={draft.apiKey}
              onChange={value => onChange({ apiKey: value })}
            />
            <TextSetting
              label="Base URL"
              value={draft.baseUrl}
              onChange={value => onChange({ baseUrl: value })}
            />
            <TextSetting
              label="Model"
              value={draft.model}
              onChange={value => onChange({ model: value })}
            />
            <TextSetting label="Fallback model" value={draft.fallbackModel} onChange={value => onChange({ fallbackModel: value })} />
            <SelectSetting
              label="Theme"
              value={draft.theme}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
              onChange={value => onChange({ theme: value })}
            />
            <TextSetting
              label="Temperature"
              type="number"
              value={draft.temperature}
              onChange={value => onChange({ temperature: Number(value) })}
            />
            <TextSetting
              label="Max tokens"
              type="number"
              value={draft.maxTokens}
              onChange={value => onChange({ maxTokens: Number(value) })}
            />
            <TextSetting
              label="Context tokens"
              type="number"
              value={draft.contextTokens}
              onChange={value => onChange({ contextTokens: Number(value) })}
            />
            <SelectSetting
              label="Thinking"
              value={draft.thinkingMode}
              options={[
                { value: 'adaptive', label: 'Adaptive' },
                { value: 'enabled', label: 'Enabled' },
                { value: 'disabled', label: 'Disabled' },
              ]}
              onChange={value => onChange({ thinkingMode: value })}
            />
            <SelectSetting
              label="Effort"
              value={draft.effort}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
                { value: 'max', label: 'Max' },
              ]}
              onChange={value => onChange({ effort: value })}
            />
            <TextSetting label="Max thinking tokens" type="number" value={draft.maxThinkingTokens} onChange={value => onChange({ maxThinkingTokens: value })} />
            <TextSetting label="Max turns" type="number" value={draft.maxTurns} onChange={value => onChange({ maxTurns: value })} />
            <TextSetting label="Max budget USD" type="number" value={draft.maxBudgetUsd} onChange={value => onChange({ maxBudgetUsd: value })} />
            <TextSetting label="Task budget" type="number" value={draft.taskBudget} onChange={value => onChange({ taskBudget: value })} />
            <TextSetting label="Workload" value={draft.workload} onChange={value => onChange({ workload: value })} />
            <TextSetting label="Beta headers" value={draft.betas} onChange={value => onChange({ betas: value })} />
          </div>
          <div className={styles.toggleGrid}>
            <ToggleSetting label="Model tool calls" checked={draft.enableLlmTools} onChange={checked => onChange({ enableLlmTools: checked })} />
          </div>
        </SettingsSection>
        )}

        {activeSection === 'io-debug' && (
        <SettingsSection title="Output And Debug">
          <div className={styles.settingsGrid}>
            <SelectSetting
              label="Output format"
              value={draft.outputFormat}
              options={[
                { value: 'text', label: 'Text' },
                { value: 'json', label: 'JSON' },
                { value: 'stream-json', label: 'Stream JSON' },
              ]}
              onChange={value => onChange({ outputFormat: value })}
            />
            <SelectSetting
              label="Input format"
              value={draft.inputFormat}
              options={[
                { value: 'text', label: 'Text' },
                { value: 'stream-json', label: 'Stream JSON' },
              ]}
              onChange={value => onChange({ inputFormat: value })}
            />
            <TextSetting label="Debug filter" value={draft.debugFilter} onChange={value => onChange({ debugFilter: value })} />
            <TextSetting label="Debug file" value={draft.debugFile} onChange={value => onChange({ debugFile: value })} />
            <TextAreaSetting label="JSON schema" value={draft.jsonSchema} onChange={value => onChange({ jsonSchema: value })} className={styles.fieldWide} />
          </div>
          <div className={styles.toggleGrid}>
            <ToggleSetting label="Print mode" checked={draft.printMode} onChange={checked => onChange({ printMode: checked })} />
            <ToggleSetting label="Include hook events" checked={draft.includeHookEvents} onChange={checked => onChange({ includeHookEvents: checked })} />
            <ToggleSetting label="Include partial messages" checked={draft.includePartialMessages} onChange={checked => onChange({ includePartialMessages: checked })} />
            <ToggleSetting label="Replay user messages" checked={draft.replayUserMessages} onChange={checked => onChange({ replayUserMessages: checked })} />
            <ToggleSetting label="Debug" checked={draft.debugEnabled} onChange={checked => onChange({ debugEnabled: checked })} />
            <ToggleSetting label="Debug to stderr" checked={draft.debugToStderr} onChange={checked => onChange({ debugToStderr: checked })} />
            <ToggleSetting label="Verbose" checked={draft.verbose} onChange={checked => onChange({ verbose: checked })} />
            <ToggleSetting label="MCP debug" checked={draft.mcpDebug} onChange={checked => onChange({ mcpDebug: checked })} />
            <ToggleSetting label="Bare mode" checked={draft.bareMode} onChange={checked => onChange({ bareMode: checked })} />
          </div>
        </SettingsSection>
        )}

        {activeSection === 'tools-permissions' && (
        <SettingsSection title="Tools And Permissions">
          <div className={styles.settingsGrid}>
            <SelectSetting
              label="Startup mode"
              value={draft.startupMode}
              options={[
                { value: 'none', label: 'None' },
                { value: 'init', label: 'Init' },
                { value: 'init-only', label: 'Init only' },
                { value: 'maintenance', label: 'Maintenance' },
              ]}
              onChange={value => onChange({ startupMode: value })}
            />
            <label className={styles.field}>
              <span>Permission mode</span>
              <select value={draft.permissionMode} onChange={event => onChange({ permissionMode: event.target.value })}>
                {PERMISSION_MODES.map(mode => (
                  <option value={mode} key={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </label>
            <TextSetting label="Permission prompt tool" value={draft.permissionPromptTool} onChange={value => onChange({ permissionPromptTool: value })} />
            <TextSetting label="Agent" value={draft.agent} onChange={value => onChange({ agent: value })} />
            <TextAreaSetting label="Allowed tools" value={draft.allowedTools} onChange={value => onChange({ allowedTools: value })} />
            <TextAreaSetting label="Selected tools" value={draft.selectedTools} onChange={value => onChange({ selectedTools: value })} />
            <TextAreaSetting label="Disallowed tools" value={draft.disallowedTools} onChange={value => onChange({ disallowedTools: value })} />
          </div>
          <div className={styles.toggleGrid}>
            <ToggleSetting label="Memory" checked={draft.memoryEnabled} onChange={checked => onChange({ memoryEnabled: checked })} />
            <ToggleSetting label="Plugins" checked={draft.pluginsEnabled} onChange={checked => onChange({ pluginsEnabled: checked })} />
            <ToggleSetting label="Disable slash commands" checked={draft.disableSlashCommands} onChange={checked => onChange({ disableSlashCommands: checked })} />
            <ToggleSetting label="Skip permissions" checked={draft.dangerouslySkipPermissions} onChange={checked => onChange({ dangerouslySkipPermissions: checked })} />
            <ToggleSetting label="Allow skip permissions" checked={draft.allowDangerouslySkipPermissions} onChange={checked => onChange({ allowDangerouslySkipPermissions: checked })} />
          </div>
        </SettingsSection>
        )}

        {activeSection === 'workspace' && (
        <SettingsSection title="Workspace Context">
          <div className={styles.settingsGrid}>
            <TextAreaSetting label="System prompt" value={draft.systemPrompt} onChange={value => onChange({ systemPrompt: value })} />
            <TextAreaSetting label="Append system prompt" value={draft.appendSystemPrompt} onChange={value => onChange({ appendSystemPrompt: value })} />
            <TextSetting label="System prompt file" value={draft.systemPromptFile} onChange={value => onChange({ systemPromptFile: value })} />
            <TextSetting label="Append prompt file" value={draft.appendSystemPromptFile} onChange={value => onChange({ appendSystemPromptFile: value })} />
            <TextAreaSetting label="MCP config" value={draft.mcpConfig} onChange={value => onChange({ mcpConfig: value })} />
            <TextSetting label="Settings file or JSON" value={draft.settingsSource} onChange={value => onChange({ settingsSource: value })} />
            <TextAreaSetting label="Additional directories" value={draft.addDirs} onChange={value => onChange({ addDirs: value })} />
            <TextAreaSetting label="Plugin directories" value={draft.pluginDirs} onChange={value => onChange({ pluginDirs: value })} />
            <TextAreaSetting label="Agents JSON" value={draft.agentsJson} onChange={value => onChange({ agentsJson: value })} className={styles.fieldWide} />
          </div>
          <div className={styles.checkboxGroup}>
            {SETTING_SOURCE_OPTIONS.map(source => (
              <ToggleSetting
                key={source}
                label={`${source} settings`}
                checked={selectedSources.has(source)}
                onChange={checked => onChange({ settingSources: updateCsvValue(draft.settingSources, source, checked) })}
              />
            ))}
            <ToggleSetting label="Strict MCP config" checked={draft.strictMcpConfig} onChange={checked => onChange({ strictMcpConfig: checked })} />
          </div>
        </SettingsSection>
        )}

        {activeSection === 'sessions' && (
        <SettingsSection title="Sessions And Integrations">
          <div className={styles.settingsGrid}>
            <TextSetting label="Resume session" value={draft.resumeSession} onChange={value => onChange({ resumeSession: value })} />
            <TextSetting label="From PR" value={draft.fromPr} onChange={value => onChange({ fromPr: value })} />
            <TextSetting label="Resume at message" value={draft.resumeSessionAt} onChange={value => onChange({ resumeSessionAt: value })} />
            <TextSetting label="Rewind files message" value={draft.rewindFilesMessageId} onChange={value => onChange({ rewindFilesMessageId: value })} />
            <TextSetting label="Session ID" value={draft.sessionId} onChange={value => onChange({ sessionId: value })} />
            <TextSetting label="Session name" value={draft.sessionName} onChange={value => onChange({ sessionName: value })} />
            <TextSetting label="Prefill" value={draft.prefill} onChange={value => onChange({ prefill: value })} />
            <TextSetting label="Deep link repo" value={draft.deepLinkRepo} onChange={value => onChange({ deepLinkRepo: value })} />
            <TextSetting label="Deep link fetch ms" type="number" value={draft.deepLinkLastFetch} onChange={value => onChange({ deepLinkLastFetch: value })} />
            <TextSetting label="Worktree" value={draft.worktree} onChange={value => onChange({ worktree: value })} />
            <SelectSetting
              label="Tmux"
              value={draft.tmuxMode}
              options={[
                { value: 'off', label: 'Off' },
                { value: 'default', label: 'Default' },
                { value: 'classic', label: 'Classic' },
              ]}
              onChange={value => onChange({ tmuxMode: value })}
            />
            <SelectSetting
              label="Chrome"
              value={draft.chromeIntegration}
              options={[
                { value: 'default', label: 'Default' },
                { value: 'enabled', label: 'Enabled' },
                { value: 'disabled', label: 'Disabled' },
              ]}
              onChange={value => onChange({ chromeIntegration: value })}
            />
            <TextSetting label="Advisor model" value={draft.advisorModel} onChange={value => onChange({ advisorModel: value })} />
            <TextAreaSetting label="File specs" value={draft.fileSpecs} onChange={value => onChange({ fileSpecs: value })} className={styles.fieldWide} />
          </div>
          <div className={styles.toggleGrid}>
            <ToggleSetting label="Continue latest" checked={draft.continueSession} onChange={checked => onChange({ continueSession: checked })} />
            <ToggleSetting label="Fork session" checked={draft.forkSession} onChange={checked => onChange({ forkSession: checked })} />
            <ToggleSetting label="No session persistence" checked={draft.noSessionPersistence} onChange={checked => onChange({ noSessionPersistence: checked })} />
            <ToggleSetting label="Deep link origin" checked={draft.deepLinkOrigin} onChange={checked => onChange({ deepLinkOrigin: checked })} />
            <ToggleSetting label="IDE auto-connect" checked={draft.ideAutoConnect} onChange={checked => onChange({ ideAutoConnect: checked })} />
            <ToggleSetting label="Auto-update" checked={draft.autoUpdate} onChange={checked => onChange({ autoUpdate: checked })} />
            <ToggleSetting label="Proactive" checked={draft.proactive} onChange={checked => onChange({ proactive: checked })} />
          </div>
        </SettingsSection>
        )}

        {activeSection === 'advanced' && (
        <SettingsSection title="Advanced Compatibility">
          <div className={styles.settingsGrid}>
            <TextSetting label="Messaging socket path" value={draft.messagingSocketPath} onChange={value => onChange({ messagingSocketPath: value })} />
            <TextAreaSetting label="Channel servers" value={draft.channelServers} onChange={value => onChange({ channelServers: value })} />
            <TextAreaSetting label="Development channels" value={draft.developmentChannelServers} onChange={value => onChange({ developmentChannelServers: value })} />
            <TextSetting label="Agent ID" value={draft.agentId} onChange={value => onChange({ agentId: value })} />
            <TextSetting label="Agent name" value={draft.agentName} onChange={value => onChange({ agentName: value })} />
            <TextSetting label="Team name" value={draft.teamName} onChange={value => onChange({ teamName: value })} />
            <TextSetting label="Agent color" value={draft.agentColor} onChange={value => onChange({ agentColor: value })} />
            <TextSetting label="Parent session ID" value={draft.parentSessionId} onChange={value => onChange({ parentSessionId: value })} />
            <SelectSetting
              label="Teammate mode"
              value={draft.teammateMode}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'tmux', label: 'Tmux' },
                { value: 'in-process', label: 'In process' },
              ]}
              onChange={value => onChange({ teammateMode: value })}
            />
            <TextSetting label="Agent type" value={draft.agentType} onChange={value => onChange({ agentType: value })} />
            <TextSetting label="SDK URL" value={draft.sdkUrl} onChange={value => onChange({ sdkUrl: value })} />
            <TextSetting label="Teleport session" value={draft.teleportSession} onChange={value => onChange({ teleportSession: value })} />
            <TextSetting label="Remote description" value={draft.remoteDescription} onChange={value => onChange({ remoteDescription: value })} />
            <TextSetting label="Remote control name" value={draft.remoteControlName} onChange={value => onChange({ remoteControlName: value })} />
          </div>
          <div className={styles.toggleGrid}>
            <ToggleSetting label="Brief mode" checked={draft.briefMode} onChange={checked => onChange({ briefMode: checked })} />
            <ToggleSetting label="Assistant mode" checked={draft.assistantMode} onChange={checked => onChange({ assistantMode: checked })} />
            <ToggleSetting label="Plan mode required" checked={draft.planModeRequired} onChange={checked => onChange({ planModeRequired: checked })} />
            <ToggleSetting label="Hard fail" checked={draft.hardFail} onChange={checked => onChange({ hardFail: checked })} />
          </div>
        </SettingsSection>
        )}
        </div>

        <div className={styles.dialogFooter}>
          <span className={styles.settingsMessage}>{message}</span>
          <div className={styles.dialogActions}>
            <button className={styles.dangerButton} type="button" onClick={onClearToken}>
              Clear auth
            </button>
            <button className={styles.primaryButton} type="submit" disabled={saving}>
              {saving ? 'Saving' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
