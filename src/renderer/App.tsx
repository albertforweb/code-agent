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
  type ChatMessageContentPart,
  type CommandReviewRequest,
  type FileContextReadItem,
  type FileContextReadResult,
  type FileEntry,
  type FileWriteReviewRequest,
  type FeaturePackageInstallRequest,
  type FeaturePackageInstallResult,
  type SelectedContextPath,
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
  type ToolEventScope,
  type VirtualTeamBlueprint,
  type VirtualTeamMember,
  type VirtualTeamPermissionMode,
  type VirtualTeamRunRecord,
} from './ipc-client';
import {
  SOFTWARE_DEVELOPER_FEATURE_PACKAGE_ID,
  getFeaturePackageExtensions,
  getFeaturePackageSummary,
  isFeatureAvailable,
  isPackageRuntimeAvailable,
  normalizeFeatureProfile,
  resolveFeaturePackages,
  type AccountPaymentMethod,
  type AccountPurchaseRecord,
  type FeatureEntitlementProfile,
  type FeaturePackageInstallRecord,
  type FeaturePackageInstallState,
  type FeaturePackageManifest,
  type FeaturePackageResolution,
} from '../features/feature-packages';

type MessageRole = 'assistant' | 'user' | 'system' | 'tool' | 'error';
type MessageStatus = 'sent' | 'sending' | 'failed';
type ToolActivityStatus = 'running' | 'succeeded' | 'failed';
type AppView = 'chat' | 'projects' | 'tools' | 'automation' | 'history' | 'settings';
type RecordViewMode = 'table' | 'cards';
type ProjectsSectionId =
  | 'studio'
  | 'new'
  | 'roles'
  | 'employees'
  | 'teams'
  | 'guided'
  | 'autonomous'
  | 'insights'
  | 'execution'
  | 'artifacts'
  | 'timeline'
  | 'governance'
  | 'board'
  | 'chat'
  | 'deliverables'
  | 'context'
  | 'overview'
  | 'files'
  | 'session'
  | 'runtime';
type ProjectEditorPanelId =
  | 'project'
  | 'project-chat'
  | 'project-org'
  | 'project-execution'
  | 'project-board'
  | 'project-team-chat'
  | 'project-deliverables'
  | 'role'
  | 'employee'
  | 'employee-profile'
  | 'team'
  | 'delete';
type AutomationEditorPanelId = 'task' | 'team' | 'delete';
type ProjectDeleteKind = 'project' | 'role' | 'employee' | 'team';
type AutomationDeleteKind = 'task' | 'team' | 'device';
interface DeleteTarget<TKind extends string> {
  kind: TKind;
  id: string;
  name: string;
  detail: string;
  impact: string[];
}
type ToolsSectionId = 'bridge' | 'mcp' | 'command' | 'activity' | 'plugins';
type AutomationSectionId = 'skills' | 'tasks' | 'remote' | 'team' | 'permissions';
type HistorySectionId = 'overview' | 'chats' | 'tools' | 'automation' | 'events' | 'export';
type SettingsSectionId =
  | 'account'
  | 'model'
  | 'packages'
  | 'io-debug'
  | 'tools-permissions'
  | 'workspace'
  | 'sessions'
  | 'advanced';
type AppSkinAccent = 'blue' | 'teal' | 'violet' | 'graphite' | 'ember';
type IconName =
  | 'activity'
  | 'archive'
  | 'arrow-left'
  | 'arrow-right'
  | 'bar-chart'
  | 'board'
  | 'bot'
  | 'briefcase'
  | 'calendar'
  | 'chat'
  | 'check'
  | 'chevron-left'
  | 'chevron-right'
  | 'code'
  | 'credit-card'
  | 'database'
  | 'download'
  | 'edit'
  | 'external'
  | 'file'
  | 'folder'
  | 'folder-open'
  | 'history'
  | 'key'
  | 'grid'
  | 'lock'
  | 'list'
  | 'message'
  | 'network'
  | 'pause'
  | 'phone'
  | 'play'
  | 'plug'
  | 'plus'
  | 'puzzle'
  | 'refresh'
  | 'rotate'
  | 'save'
  | 'search'
  | 'send'
  | 'settings'
  | 'shield'
  | 'sliders'
  | 'sparkles'
  | 'stop'
  | 'terminal'
  | 'trash'
  | 'user'
  | 'users'
  | 'wrench'
  | 'x';
type NavigationChildItem<T extends string> = {
  id: T;
  title: string;
  description: string;
  icon: IconName;
  featureId?: string;
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
  imageAttachments?: UiImageAttachment[];
}

interface ChatContextAttachment {
  path: string;
  type: 'file' | 'directory';
  name: string;
  size?: number;
  modified?: number;
}

interface UiImageAttachment {
  id: string;
  name: string;
  mediaType: string;
  size: number;
  width?: number;
  height?: number;
  dataUrl?: string;
}

interface ChatImageAttachment extends UiImageAttachment {
  dataUrl: string;
}

type ChatStreamTarget =
  | { scope: 'main'; messageId: string }
  | { scope: 'project'; projectChatKey: string; projectId: string; messageId: string };

interface PersistedChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  workspacePath?: string;
  toolWorkspacePath?: string;
  contextAttachments?: ChatContextAttachment[];
  messages: UiMessage[];
}

interface PersistedSessionsState {
  currentSessionId: string;
  sessions: PersistedChatSession[];
}

type SoftwareProjectMode = 'guided' | 'autonomous';
type SoftwareProjectStatus = 'idea' | 'planning' | 'active' | 'stopped' | 'blocked' | 'done';

interface SoftwareProjectPlan {
  id: string;
  name: string;
  mode: SoftwareProjectMode;
  status: SoftwareProjectStatus;
  idea: string;
  goals: string;
  artifacts: string[];
  workspacePath?: string;
  supervisorRole: string;
  teamRoles: string[];
  supervisorEmployeeId: string;
  assignedEmployeeIds: string[];
  assignedTeamIds: string[];
  permissionMode: VirtualTeamPermissionMode;
  createdAt: number;
  updatedAt: number;
}

interface PersistedSoftwareProjectsState {
  activeProjectId: string;
  projects: SoftwareProjectPlan[];
}

interface VirtualRoleDefinition {
  id: string;
  title: string;
  responsibilities: string[];
  defaultGoal: string;
  defaultTools: string[];
  canSupervise: boolean;
  createdAt: number;
  updatedAt: number;
}

interface VirtualEmployeeProfile {
  id: string;
  name: string;
  roleId: string;
  role: string;
  model: string;
  status: 'idle' | 'working' | 'approval';
  permissions: string[];
  currentTask: string;
  createdAt: number;
  updatedAt: number;
}

interface ProjectTeamDefinition {
  id: string;
  name: string;
  mission: string;
  supervisorEmployeeId: string;
  memberEmployeeIds: string[];
  createdAt: number;
  updatedAt: number;
}

interface DesktopCommand {
  command: string;
  description: string;
  featureId?: string;
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
  scope?: ToolEventScope;
}

interface ProjectGeneratedOutput {
  id: string;
  projectId: string;
  path: string;
  absolutePath?: string;
  toolName: string;
  source: 'guided-chat' | 'team-chat' | 'automation' | 'tool';
  summary?: string;
  createdAt: number;
  updatedAt: number;
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
  accountEmail: string;
  accountDisplayName: string;
  accountPassword: string;
  accountResetToken: string;
  platformBaseUrl: string;
  platformOrgId: string;
  llmProvider: LlmProviderType;
  baseUrl: string;
  model: string;
  fallbackModel: string;
  temperature: number;
  maxTokens: number;
  contextTokens: number;
  enableLlmTools: boolean;
  theme: 'light' | 'dark' | 'system';
  accentColor: AppSkinAccent;
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

interface PurchaseDraft {
  nameOnCard: string;
  cardNumber: string;
  expiry: string;
  cvc: string;
  postalCode: string;
}

const DEFAULT_PROVIDER: LlmProviderType = 'openai-compatible';
const MAX_TOOL_ACTIVITIES = 20;
const MAX_PERSISTED_MESSAGES = 80;
const MAX_RECENT_SESSIONS = 12;
const CHAT_CONTEXT_MAX_FILES = 16;
const CHAT_CONTEXT_MAX_BYTES = 120_000;
const CHAT_CONTEXT_MAX_FILE_BYTES = 24_000;
const CHAT_IMAGE_MAX_COUNT = 4;
const CHAT_IMAGE_MAX_EDGE = 1536;
const CHAT_IMAGE_MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const CHAT_IMAGE_JPEG_QUALITY = 0.86;
const DESKTOP_SESSIONS_STATE_KEY = 'desktopSessions';
const DESKTOP_PROJECTS_STATE_KEY = 'desktopSoftwareProjects';
const DESKTOP_ROLES_STATE_KEY = 'desktopVirtualRoles';
const DESKTOP_EMPLOYEES_STATE_KEY = 'desktopVirtualEmployees';
const DESKTOP_PROJECT_TEAMS_STATE_KEY = 'desktopProjectTeams';
const DESKTOP_PROJECT_CHATS_STATE_KEY = 'desktopProjectChats';
const DESKTOP_PROJECT_OUTPUTS_STATE_KEY = 'desktopProjectOutputs';
const CHAT_SESSION_HISTORY_ID_PREFIX = 'chat-session-';
const SIDEBAR_COLLAPSED_STORAGE_KEY = 'codeAgentSidebarCollapsed';
const EMPTY_PURCHASE_DRAFT: PurchaseDraft = {
  nameOnCard: '',
  cardNumber: '',
  expiry: '',
  cvc: '',
  postalCode: '',
};
const SKIN_ACCENTS: Record<AppSkinAccent, {
  label: string;
  primary: string;
  primaryDark: string;
  primarySoft: string;
  primaryBorder: string;
  rgb: string;
}> = {
  blue: {
    label: 'Blue',
    primary: '#2563eb',
    primaryDark: '#1d4ed8',
    primarySoft: '#eff6ff',
    primaryBorder: '#bfdbfe',
    rgb: '37, 99, 235',
  },
  teal: {
    label: 'Teal',
    primary: '#0f766e',
    primaryDark: '#115e59',
    primarySoft: '#ecfdf5',
    primaryBorder: '#99f6e4',
    rgb: '15, 118, 110',
  },
  violet: {
    label: 'Violet',
    primary: '#7c3aed',
    primaryDark: '#6d28d9',
    primarySoft: '#f5f3ff',
    primaryBorder: '#ddd6fe',
    rgb: '124, 58, 237',
  },
  graphite: {
    label: 'Graphite',
    primary: '#475569',
    primaryDark: '#334155',
    primarySoft: '#f1f5f9',
    primaryBorder: '#cbd5e1',
    rgb: '71, 85, 105',
  },
  ember: {
    label: 'Ember',
    primary: '#c15f3c',
    primaryDark: '#9d482c',
    primarySoft: '#fff7ef',
    primaryBorder: '#f0c9b8',
    rgb: '193, 95, 60',
  },
};
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
    label: 'OpenAI-compatible',
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

function getSkinAccent(value: unknown): AppSkinAccent {
  return typeof value === 'string' && value in SKIN_ACCENTS ? value as AppSkinAccent : 'blue';
}

function getSkinStyle(value: unknown): React.CSSProperties {
  const accent = SKIN_ACCENTS[getSkinAccent(value)];
  return {
    '--color-primary': accent.primary,
    '--color-primary-dark': accent.primaryDark,
    '--color-primary-soft': accent.primarySoft,
    '--color-primary-border': accent.primaryBorder,
    '--color-primary-rgb': accent.rgb,
  } as React.CSSProperties;
}

function Icon({
  name,
  className = styles.icon,
  size = 16,
}: {
  name: IconName;
  className?: string;
  size?: number;
}) {
  const common = {
    className,
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
  };

  switch (name) {
    case 'activity':
      return <svg {...common}><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>;
    case 'archive':
      return <svg {...common}><path d="M4 7h16" /><path d="M5 7l1 13h12l1-13" /><path d="M8 4h8l1 3H7z" /><path d="M10 12h4" /></svg>;
    case 'arrow-left':
      return <svg {...common}><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>;
    case 'arrow-right':
      return <svg {...common}><path d="M5 12h14" /><path d="M12 5l7 7-7 7" /></svg>;
    case 'bar-chart':
      return <svg {...common}><path d="M4 19V5" /><path d="M4 19h16" /><path d="M8 16V9" /><path d="M12 16V6" /><path d="M16 16v-4" /></svg>;
    case 'board':
      return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /><path d="M15 4v16" /><path d="M5 8h2" /><path d="M11 12h2" /><path d="M17 9h2" /></svg>;
    case 'bot':
      return <svg {...common}><rect x="5" y="8" width="14" height="11" rx="3" /><path d="M12 8V4" /><path d="M8 4h8" /><path d="M9 13h.01" /><path d="M15 13h.01" /><path d="M9 17h6" /></svg>;
    case 'briefcase':
      return <svg {...common}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5h6v2" /><path d="M3 12h18" /></svg>;
    case 'calendar':
      return <svg {...common}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4" /><path d="M16 3v4" /><path d="M4 10h16" /></svg>;
    case 'chat':
      return <svg {...common}><path d="M5 6h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H9l-5 4v-4H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" /></svg>;
    case 'check':
      return <svg {...common}><path d="M20 6 9 17l-5-5" /></svg>;
    case 'chevron-left':
      return <svg {...common}><path d="M15 18 9 12l6-6" /></svg>;
    case 'chevron-right':
      return <svg {...common}><path d="m9 18 6-6-6-6" /></svg>;
    case 'code':
      return <svg {...common}><path d="m8 9-4 3 4 3" /><path d="m16 9 4 3-4 3" /><path d="m14 5-4 14" /></svg>;
    case 'credit-card':
      return <svg {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /><path d="M7 15h4" /><path d="M15 15h2" /></svg>;
    case 'database':
      return <svg {...common}><ellipse cx="12" cy="5" rx="7" ry="3" /><path d="M5 5v14c0 1.7 3.1 3 7 3s7-1.3 7-3V5" /><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" /></svg>;
    case 'download':
      return <svg {...common}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>;
    case 'edit':
      return <svg {...common}><path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4z" /><path d="m13 7 4 4" /></svg>;
    case 'external':
      return <svg {...common}><path d="M14 4h6v6" /><path d="m10 14 10-10" /><path d="M20 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5" /></svg>;
    case 'file':
      return <svg {...common}><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v5h5" /></svg>;
    case 'folder':
      return <svg {...common}><path d="M3 7h7l2 2h9v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>;
    case 'folder-open':
      return <svg {...common}><path d="M3 8h7l2 2h9" /><path d="M4 20h14l3-9H6z" /></svg>;
    case 'grid':
      return <svg {...common}><rect x="4" y="4" width="7" height="7" rx="1" /><rect x="13" y="4" width="7" height="7" rx="1" /><rect x="4" y="13" width="7" height="7" rx="1" /><rect x="13" y="13" width="7" height="7" rx="1" /></svg>;
    case 'history':
      return <svg {...common}><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v6h6" /><path d="M12 7v6l4 2" /></svg>;
    case 'key':
      return <svg {...common}><circle cx="8" cy="15" r="4" /><path d="m11 12 8-8" /><path d="m16 7 2 2" /><path d="m14 9 2 2" /></svg>;
    case 'lock':
      return <svg {...common}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
    case 'list':
      return <svg {...common}><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /></svg>;
    case 'message':
      return <svg {...common}><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /></svg>;
    case 'network':
      return <svg {...common}><circle cx="12" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" /><path d="M12 7v4" /><path d="M12 11 5 17" /><path d="m12 11 7 6" /></svg>;
    case 'pause':
      return <svg {...common}><path d="M8 5v14" /><path d="M16 5v14" /></svg>;
    case 'phone':
      return <svg {...common}><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></svg>;
    case 'play':
      return <svg {...common}><path d="m8 5 12 7-12 7z" /></svg>;
    case 'plug':
      return <svg {...common}><path d="M8 2v6" /><path d="M16 2v6" /><path d="M7 8h10v4a5 5 0 0 1-10 0z" /><path d="M12 17v5" /></svg>;
    case 'plus':
      return <svg {...common}><path d="M12 5v14" /><path d="M5 12h14" /></svg>;
    case 'puzzle':
      return <svg {...common}><path d="M9 3h6v4a2 2 0 1 0 0 4v4h-4a2 2 0 1 1-4 0H3V9h4a2 2 0 1 0 2-2z" /></svg>;
    case 'refresh':
      return <svg {...common}><path d="M20 6v6h-6" /><path d="M4 18v-6h6" /><path d="M19 12a7 7 0 0 0-12-5" /><path d="M5 12a7 7 0 0 0 12 5" /></svg>;
    case 'rotate':
      return <svg {...common}><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" /></svg>;
    case 'save':
      return <svg {...common}><path d="M5 3h12l2 2v16H5z" /><path d="M8 3v6h8" /><path d="M8 21v-7h8v7" /></svg>;
    case 'search':
      return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
    case 'send':
      return <svg {...common}><path d="M22 2 11 13" /><path d="m22 2-7 20-4-9-9-4z" /></svg>;
    case 'settings':
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a8 8 0 0 0 .1-6l2-1.5-2-3.4-2.4 1a8 8 0 0 0-5.2-3L11.5 0h-4l-.4 2.9a8 8 0 0 0-5.2 3l-2.4-1-2 3.4L.5 9.8a8 8 0 0 0 .1 6l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 5.2 3l.4 2.9h4l.4-2.9a8 8 0 0 0 5.2-3l2.4 1 2-3.4z" transform="scale(.88) translate(2 1)" /></svg>;
    case 'shield':
      return <svg {...common}><path d="M12 3 20 6v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6z" /><path d="m9 12 2 2 4-5" /></svg>;
    case 'sliders':
      return <svg {...common}><path d="M4 6h10" /><path d="M18 6h2" /><path d="M4 12h2" /><path d="M10 12h10" /><path d="M4 18h12" /><path d="M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>;
    case 'sparkles':
      return <svg {...common}><path d="M12 3 14 9l6 3-6 3-2 6-2-6-6-3 6-3z" /><path d="M5 3v4" /><path d="M3 5h4" /></svg>;
    case 'stop':
      return <svg {...common}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>;
    case 'terminal':
      return <svg {...common}><path d="m4 7 5 5-5 5" /><path d="M12 19h8" /></svg>;
    case 'trash':
      return <svg {...common}><path d="M4 7h16" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M6 7l1 14h10l1-14" /><path d="M9 7V4h6v3" /></svg>;
    case 'user':
      return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
    case 'users':
      return <svg {...common}><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2" /><path d="M3 21a6 6 0 0 1 12 0" /><path d="M14 18a5 5 0 0 1 7 3" /></svg>;
    case 'wrench':
      return <svg {...common}><path d="M14.7 6.3a4 4 0 0 0-5 5L3 18l3 3 6.7-6.7a4 4 0 0 0 5-5l-2.8 2.8-2.1-2.1z" /></svg>;
    case 'x':
      return <svg {...common}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>;
    default:
      return <svg {...common}><circle cx="12" cy="12" r="8" /></svg>;
  }
}

function RecordViewToggle({
  view,
  onChange,
  label,
}: {
  view: RecordViewMode;
  onChange: React.Dispatch<React.SetStateAction<RecordViewMode>>;
  label: string;
}) {
  return (
    <div className={styles.segmentedControl} aria-label={label}>
      <button
        className={view === 'table' ? `${styles.segmentedControlButton} ${styles.segmentedControlButtonActive}` : styles.segmentedControlButton}
        type="button"
        onClick={() => onChange('table')}
        aria-pressed={view === 'table'}
        title="Show records as a table"
      >
        <Icon name="list" size={14} />
        Table
      </button>
      <button
        className={view === 'cards' ? `${styles.segmentedControlButton} ${styles.segmentedControlButtonActive}` : styles.segmentedControlButton}
        type="button"
        onClick={() => onChange('cards')}
        aria-pressed={view === 'cards'}
        title="Show records as cards"
      >
        <Icon name="grid" size={14} />
        Cards
      </button>
    </div>
  );
}

function getProjectNoticeClassName(message: string): string {
  const normalized = message.toLowerCase();
  if (
    normalized.includes('error') ||
    normalized.includes('failed') ||
    normalized.includes('blocked') ||
    normalized.includes('rejected')
  ) {
    return `${styles.projectNotice} ${styles.projectNoticeError}`;
  }
  if (
    normalized.includes('stopped') ||
    normalized.includes('deleted') ||
    normalized.includes('removed') ||
    normalized.includes('approval')
  ) {
    return `${styles.projectNotice} ${styles.projectNoticeWarning}`;
  }
  return `${styles.projectNotice} ${styles.projectNoticeSuccess}`;
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
const PROJECT_LIST_PAGE_SIZE = 10;
const DESKTOP_COMMANDS: DesktopCommand[] = [
  { command: '/help', description: 'Show desktop commands' },
  { command: '/status', description: 'Show provider, runtime, tools, and MCP status' },
  { command: '/pwd', description: 'Show the current desktop workspace root' },
  { command: '/workspace', description: 'Show the current desktop workspace root' },
  { command: '/login', description: 'Open account sign-in settings' },
  { command: '/login local', description: 'Open Settings with OpenAI-compatible defaults' },
  { command: '/account', description: 'Open account and subscription settings' },
  { command: '/settings', description: 'Open Settings' },
  { command: '/tools', description: 'List bridge and MCP tools', featureId: 'developer-tools' },
  { command: '/mcp', description: 'Refresh and list MCP servers/tools', featureId: 'mcp' },
  { command: '/automation', description: 'Open skills, scheduled tasks, remote control, and automation permissions', featureId: 'automation' },
  { command: '/skills', description: 'Open local skills and automation extensions', featureId: 'automation' },
  { command: '/tasks', description: 'Open scheduled automation tasks', featureId: 'automation' },
  { command: '/remote', description: 'Open remote-control setup', featureId: 'automation' },
  { command: '/team', description: 'Open project teams', featureId: 'project-studio' },
  { command: '/history', description: 'Open local history and export records', featureId: 'developer-history' },
  { command: '/sessions', description: 'List saved desktop sessions' },
  { command: '/config', description: 'Show persisted desktop configuration' },
  { command: '/run <tool> <json>', description: 'Run a bridge tool manually', featureId: 'developer-tools' },
  { command: '/clear', description: 'Clear the visible chat' },
];
const PRIMARY_NAV: Array<{
  id: AppView;
  label: string;
  description: string;
  icon: IconName;
  featureId?: string;
}> = [
  { id: 'chat', label: 'Chats', description: 'Conversation workspace', icon: 'chat' },
  { id: 'projects', label: 'Projects', description: 'Ideas, guided builds, and autonomous teams', icon: 'briefcase', featureId: 'project-studio' },
  { id: 'tools', label: 'Tools', description: 'Bridge tools, MCP, and activity', icon: 'wrench', featureId: 'developer-tools' },
  { id: 'automation', label: 'Automation', description: 'Skills, tasks, remote control, and permissions', icon: 'bot', featureId: 'automation' },
  { id: 'history', label: 'History', description: 'Chats, tool activity, exports, audit', icon: 'history', featureId: 'developer-history' },
  { id: 'settings', label: 'Settings', description: 'Model, tools, workspace, sessions', icon: 'settings' },
];
const PROJECTS_MENU: Array<NavigationChildItem<ProjectsSectionId>> = [
  { id: 'studio', title: 'Project Studio', description: 'Create software from ideas or autonomous teams', icon: 'board', featureId: 'project-studio' },
  { id: 'roles', title: 'Roles', description: 'Responsibilities, default goals, and tool scope', icon: 'shield', featureId: 'project-studio' },
  { id: 'employees', title: 'Employees', description: 'Create employees, roles, models, and permission scope', icon: 'users', featureId: 'project-studio' },
  { id: 'teams', title: 'Teams', description: 'Scoped missions, supervisors, and members', icon: 'network', featureId: 'project-studio' },
];
const TOOLS_MENU: Array<NavigationChildItem<ToolsSectionId>> = [
  { id: 'bridge', title: 'Bridge Tools', description: 'Exposure and permissions', icon: 'plug', featureId: 'developer-tools' },
  { id: 'mcp', title: 'MCP Registry', description: 'Servers and executable tools', icon: 'database', featureId: 'mcp' },
  { id: 'command', title: 'Command Runner', description: 'Approved workspace commands', icon: 'terminal', featureId: 'developer-tools' },
  { id: 'activity', title: 'Activity', description: 'Tool-call timeline', icon: 'activity', featureId: 'developer-tools' },
  { id: 'plugins', title: 'Plugins & Skills', description: 'Configured extension paths', icon: 'puzzle', featureId: 'developer-settings' },
];
const SETTINGS_MENU: Array<NavigationChildItem<SettingsSectionId>> = [
  { id: 'account', title: 'Account', description: 'Login, subscription, billing', icon: 'user' },
  { id: 'model', title: 'Model', description: 'Provider, tokens, theme', icon: 'sparkles' },
  { id: 'packages', title: 'Packages', description: 'Feature packages and entitlements', icon: 'puzzle' },
  { id: 'io-debug', title: 'Output & Debug', description: 'Formats, traces, logs', icon: 'code', featureId: 'developer-settings' },
  { id: 'tools-permissions', title: 'Tools & Permissions', description: 'Agent tools and safety', icon: 'lock', featureId: 'developer-settings' },
  { id: 'workspace', title: 'Prompts & Directories', description: 'System prompts, MCP, directories', icon: 'folder', featureId: 'developer-settings' },
  { id: 'sessions', title: 'Sessions & Integrations', description: 'Resume, IDE, browser', icon: 'rotate', featureId: 'developer-settings' },
  { id: 'advanced', title: 'Advanced Compatibility', description: 'Channels and agent metadata', icon: 'sliders', featureId: 'developer-settings' },
];
const AUTOMATION_MENU: Array<NavigationChildItem<AutomationSectionId>> = [
  { id: 'skills', title: 'Skills', description: 'Workspace extensions', icon: 'sparkles', featureId: 'automation' },
  { id: 'tasks', title: 'Scheduled Tasks', description: 'Recurring runs and history', icon: 'calendar', featureId: 'automation' },
  { id: 'remote', title: 'Remote Control', description: 'Phone pairing and approvals', icon: 'phone', featureId: 'automation' },
  { id: 'permissions', title: 'Permissions', description: 'Unattended execution policy', icon: 'shield', featureId: 'automation' },
];
const HISTORY_MENU: Array<NavigationChildItem<HistorySectionId>> = [
  { id: 'overview', title: 'Overview', description: 'Storage and record counts', icon: 'bar-chart', featureId: 'developer-history' },
  { id: 'chats', title: 'Chats', description: 'Saved conversations', icon: 'chat', featureId: 'developer-history' },
  { id: 'tools', title: 'Tool Events', description: 'Tool-call audit records', icon: 'wrench', featureId: 'developer-history' },
  { id: 'automation', title: 'Automation Runs', description: 'Task and team run history', icon: 'bot', featureId: 'developer-history' },
  { id: 'events', title: 'Project Events', description: 'Imports, exports, and audit events', icon: 'activity', featureId: 'developer-history' },
  { id: 'export', title: 'Export', description: 'Download or copy local history', icon: 'download', featureId: 'developer-history' },
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
  if (firstUserMessage) {
    return formatSidebarLabel(firstUserMessage.content, 56);
  }
  const firstImageMessage = messages.find(message => message.role === 'user' && (message.imageAttachments?.length ?? 0) > 0);
  return firstImageMessage ? 'Image chat' : 'New chat';
}

function sanitizeImageAttachments(value: unknown, includeDataUrl = false): UiImageAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(item => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const raw = item as Partial<UiImageAttachment>;
      const mediaType = typeof raw.mediaType === 'string' && raw.mediaType.startsWith('image/')
        ? raw.mediaType
        : 'image/png';
      const attachment: UiImageAttachment = {
        id: typeof raw.id === 'string' && raw.id.trim()
          ? raw.id.trim()
          : `image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Pasted image',
        mediaType,
        size: Number.isFinite(Number(raw.size)) ? Number(raw.size) : 0,
        width: Number.isFinite(Number(raw.width)) ? Number(raw.width) : undefined,
        height: Number.isFinite(Number(raw.height)) ? Number(raw.height) : undefined,
      };

      if (includeDataUrl && typeof raw.dataUrl === 'string' && raw.dataUrl.startsWith('data:image/')) {
        attachment.dataUrl = raw.dataUrl;
      }

      return attachment;
    })
    .filter((item): item is UiImageAttachment => Boolean(item))
    .slice(0, CHAT_IMAGE_MAX_COUNT);
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
    imageAttachments: sanitizeImageAttachments(message.imageAttachments),
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

function normalizeContextAttachment(value: unknown): ChatContextAttachment | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Partial<ChatContextAttachment>;
  const pathValue = typeof raw.path === 'string' && raw.path.trim() ? raw.path.trim() : '';
  if (!pathValue) {
    return null;
  }

  const type = raw.type === 'directory' ? 'directory' : 'file';
  return {
    path: pathValue,
    type,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : getPathBasename(pathValue),
    size: Number.isFinite(Number(raw.size)) ? Number(raw.size) : undefined,
    modified: Number.isFinite(Number(raw.modified)) ? Number(raw.modified) : undefined,
  };
}

function sanitizeContextAttachments(value: unknown): ChatContextAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const attachments: ChatContextAttachment[] = [];
  for (const attachment of value) {
    const normalized = normalizeContextAttachment(attachment);
    if (!normalized) {
      continue;
    }
    const key = normalized.path.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    attachments.push(normalized);
  }

  return attachments.slice(0, 24);
}

function mergeContextAttachments(
  current: ChatContextAttachment[],
  selected: SelectedContextPath[],
): ChatContextAttachment[] {
  return sanitizeContextAttachments([...current, ...selected]);
}

function formatContextItemHeader(item: FileContextReadItem): string {
  const details = [
    item.sourcePath && item.sourcePath !== item.path ? `from ${item.sourcePath}` : '',
    item.truncated ? 'truncated' : '',
    item.error ? `error: ${item.error}` : '',
  ].filter(Boolean);
  return details.length > 0 ? `${item.path} (${details.join(', ')})` : item.path;
}

function formatAttachedContext(result: FileContextReadResult): string {
  const sections = result.items.map(item => {
    if (item.type === 'directory' && !item.content && !item.error) {
      return `Directory attachment: ${item.path}`;
    }

    const header = formatContextItemHeader(item);
    if (item.error && !item.content) {
      return `File attachment: ${header}`;
    }

    return [
      `File attachment: ${header}`,
      '```',
      item.content ?? '',
      '```',
    ].join('\n');
  });

  if (result.omittedCount > 0) {
    sections.push(`Attachment reader omitted ${result.omittedCount} file(s) or folder entries because of limits, unsupported file types, or unreadable paths.`);
  }

  if (sections.length === 0) {
    return '';
  }

  return [
    'Attached read-only chat context:',
    'Use this context to answer the human message. Do not modify these paths unless the human explicitly asks for changes.',
    ...sections,
  ].join('\n\n');
}

function createSessionSnapshot(
  id: string,
  messages: UiMessage[],
  workspacePath?: string,
  previous?: PersistedChatSession,
  toolWorkspacePath?: string | null,
  contextAttachments: ChatContextAttachment[] = [],
): PersistedChatSession {
  const sanitizedMessages = sanitizeMessages(messages);
  const normalizedToolWorkspacePath = typeof toolWorkspacePath === 'string' && toolWorkspacePath.trim()
    ? toolWorkspacePath.trim()
    : undefined;
  const normalizedContextAttachments = sanitizeContextAttachments(contextAttachments);
  return {
    id,
    title: getSessionTitle(sanitizedMessages),
    createdAt: previous?.createdAt ?? sanitizedMessages[0]?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
    workspacePath,
    toolWorkspacePath: normalizedToolWorkspacePath,
    contextAttachments: normalizedContextAttachments.length > 0 ? normalizedContextAttachments : undefined,
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

function isMeaningfulChatSession(session: PersistedChatSession): boolean {
  return session.messages.some(message => message.role === 'user' && message.content.trim());
}

function getChatSessionIdFromHistoryRecord(recordId: string, record?: LocalHistoryRecord): string {
  if (record && record.type !== 'chat-session') {
    return '';
  }

  const session = record?.data && typeof record.data === 'object'
    ? (record.data as { session?: Partial<PersistedChatSession> }).session
    : undefined;
  if (typeof session?.id === 'string' && session.id.trim()) {
    return session.id;
  }

  return recordId.startsWith(CHAT_SESSION_HISTORY_ID_PREFIX)
    ? recordId.slice(CHAT_SESSION_HISTORY_ID_PREFIX.length)
    : '';
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
    toolWorkspacePath: typeof raw.toolWorkspacePath === 'string' && raw.toolWorkspacePath.trim()
      ? raw.toolWorkspacePath.trim()
      : undefined,
    contextAttachments: sanitizeContextAttachments(raw.contextAttachments),
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

type ProjectChatChannel = 'guided' | 'team';

function getProjectChatKey(projectId: string, channel: ProjectChatChannel): string {
  return `${projectId}:${channel}`;
}

function getProjectAutomationTeamId(projectId: string): string {
  return `project-auto-${projectId}`;
}

function createProjectReadyMessages(project: SoftwareProjectPlan, channel: ProjectChatChannel): UiMessage[] {
  return [
    createMessage('assistant', channel === 'team'
      ? `Team chat is ready for "${project.name}". Send direction to the supervisor or team here.`
      : `Project chat is ready for "${project.name}". Send project-specific instructions here.`, {
      title: channel === 'team' ? 'Project Team' : 'CodeAgent',
    }),
  ];
}

function restoreProjectChatsFromState(state: Record<string, any>): Record<string, UiMessage[]> {
  const raw = state?.[DESKTOP_PROJECT_CHATS_STATE_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  return Object.entries(raw).reduce<Record<string, UiMessage[]>>((restored, [key, value]) => {
    if (key.trim()) {
      restored[key] = sanitizeMessages(value);
    }
    return restored;
  }, {});
}

function serializeProjectChats(projectChats: Record<string, UiMessage[]>): Record<string, UiMessage[]> {
  return Object.entries(projectChats).reduce<Record<string, UiMessage[]>>((serialized, [key, messages]) => {
    if (key.trim()) {
      serialized[key] = sanitizeMessages(messages);
    }
    return serialized;
  }, {});
}

function sanitizeProjectGeneratedOutput(value: unknown): ProjectGeneratedOutput | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Partial<ProjectGeneratedOutput>;
  if (!raw.projectId || !raw.path) {
    return null;
  }

  const createdAt = Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : Date.now();
  const source = raw.source === 'team-chat' || raw.source === 'automation' || raw.source === 'tool'
    ? raw.source
    : 'guided-chat';

  return {
    id: typeof raw.id === 'string' && raw.id.trim()
      ? raw.id
      : `${raw.projectId}:${raw.path}`,
    projectId: String(raw.projectId),
    path: String(raw.path),
    absolutePath: typeof raw.absolutePath === 'string' && raw.absolutePath.trim() ? raw.absolutePath : undefined,
    toolName: typeof raw.toolName === 'string' && raw.toolName.trim() ? raw.toolName : 'fs.write',
    source,
    summary: typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary : undefined,
    createdAt,
    updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : createdAt,
  };
}

function restoreProjectOutputsFromState(state: Record<string, any>): Record<string, ProjectGeneratedOutput[]> {
  const raw = state?.[DESKTOP_PROJECT_OUTPUTS_STATE_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  return Object.entries(raw).reduce<Record<string, ProjectGeneratedOutput[]>>((restored, [projectId, value]) => {
    if (!Array.isArray(value)) {
      return restored;
    }

    const outputs = value
      .map(item => sanitizeProjectGeneratedOutput({ ...(typeof item === 'object' && item ? item : {}), projectId }))
      .filter((output: ProjectGeneratedOutput | null): output is ProjectGeneratedOutput => Boolean(output))
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, 120);

    if (outputs.length > 0) {
      restored[projectId] = outputs;
    }

    return restored;
  }, {});
}

function serializeProjectOutputs(outputs: Record<string, ProjectGeneratedOutput[]>): Record<string, ProjectGeneratedOutput[]> {
  return Object.entries(outputs).reduce<Record<string, ProjectGeneratedOutput[]>>((serialized, [projectId, projectOutputs]) => {
    const sanitized = projectOutputs
      .map(output => sanitizeProjectGeneratedOutput({ ...output, projectId }))
      .filter((output: ProjectGeneratedOutput | null): output is ProjectGeneratedOutput => Boolean(output))
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .slice(0, 120);

    if (sanitized.length > 0) {
      serialized[projectId] = sanitized;
    }

    return serialized;
  }, {});
}

const DEFAULT_PROJECT_ARTIFACTS = [
  'Product brief',
  'Requirements',
  'Architecture plan',
  'Implementation plan',
  'Task backlog',
  'Test plan',
];

const DEFAULT_AUTONOMOUS_ROLES = [
  'Supervisor',
  'Product Manager',
  'Architect',
  'Developer',
  'QA Reviewer',
];

const DEFAULT_EMPLOYEE_PERMISSIONS = [
  'Read workspace',
  'Write code',
  'Run tests',
];

const DEFAULT_ROLE_BLUEPRINTS = [
  {
    id: 'role-supervisor',
    title: 'Supervisor',
    responsibilities: [
      'Own project execution on behalf of the human',
      'Assign work to employees',
      'Approve or reject risky actions according to project permission mode',
      'Keep deliverables aligned to goals and acceptance criteria',
    ],
    defaultGoal: 'Coordinate the team, remove blockers, and keep project execution aligned to the human goal.',
    defaultTools: ['fs.read', 'bash.run'],
    canSupervise: true,
  },
  {
    id: 'role-product-manager',
    title: 'Product Manager',
    responsibilities: [
      'Clarify users, scope, success criteria, and acceptance tests',
      'Turn ideas into prioritized requirements and backlog items',
      'Identify missing business or workflow decisions',
    ],
    defaultGoal: 'Convert the human idea into crisp requirements, user flows, and acceptance criteria.',
    defaultTools: ['fs.read'],
    canSupervise: false,
  },
  {
    id: 'role-architect',
    title: 'Architect',
    responsibilities: [
      'Design system structure and technical boundaries',
      'Identify integration risks and implementation sequencing',
      'Review architecture changes before implementation fans out',
    ],
    defaultGoal: 'Design the technical approach and keep implementation choices coherent with the existing codebase.',
    defaultTools: ['fs.read', 'bash.run'],
    canSupervise: false,
  },
  {
    id: 'role-developer',
    title: 'Developer',
    responsibilities: [
      'Implement scoped code changes',
      'Update or add tests for changed behavior',
      'Report blockers and hand off work for review',
    ],
    defaultGoal: 'Implement the assigned project tasks with focused, tested code changes.',
    defaultTools: ['fs.read', 'fs.write', 'bash.run'],
    canSupervise: false,
  },
  {
    id: 'role-qa-reviewer',
    title: 'QA Reviewer',
    responsibilities: [
      'Plan verification coverage',
      'Run checks and capture failures',
      'Validate deliverables against acceptance criteria',
    ],
    defaultGoal: 'Verify the project deliverables and call out gaps before the project is marked complete.',
    defaultTools: ['fs.read', 'bash.run'],
    canSupervise: false,
  },
];

function createRoleDefinitionId(title = 'role'): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'role';
  return `role-${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function getDefaultRoleId(role: string): string {
  const normalized = role.toLowerCase();
  if (normalized.includes('supervisor') || normalized.includes('lead') || normalized.includes('owner')) {
    return 'role-supervisor';
  }
  if (normalized.includes('product') || normalized.includes('manager')) {
    return 'role-product-manager';
  }
  if (normalized.includes('architect')) {
    return 'role-architect';
  }
  if (normalized.includes('qa') || normalized.includes('review') || normalized.includes('test')) {
    return 'role-qa-reviewer';
  }
  return 'role-developer';
}

function createDefaultVirtualRoles(): VirtualRoleDefinition[] {
  const now = Date.now();
  return DEFAULT_ROLE_BLUEPRINTS.map(role => ({
    ...role,
    responsibilities: [...role.responsibilities],
    defaultTools: [...role.defaultTools],
    createdAt: now,
    updatedAt: now,
  }));
}

function createVirtualRoleDefinition(title = 'Developer'): VirtualRoleDefinition {
  const now = Date.now();
  const defaultRole = createDefaultVirtualRoles().find(role => role.id === getDefaultRoleId(title));
  return {
    id: createRoleDefinitionId(title),
    title,
    responsibilities: defaultRole?.responsibilities ? [...defaultRole.responsibilities] : ['Deliver assigned project responsibilities.'],
    defaultGoal: defaultRole?.defaultGoal ?? getDefaultTeamGoal(title),
    defaultTools: defaultRole?.defaultTools ? [...defaultRole.defaultTools] : getDefaultTeamTools(title),
    canSupervise: Boolean(defaultRole?.canSupervise),
    createdAt: now,
    updatedAt: now,
  };
}

function sanitizeVirtualRole(value: unknown): VirtualRoleDefinition | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Partial<VirtualRoleDefinition>;
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'Contributor';
  const now = Date.now();
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : createRoleDefinitionId(title),
    title,
    responsibilities: normalizeStringList(raw.responsibilities, ['Deliver assigned project responsibilities.']),
    defaultGoal: typeof raw.defaultGoal === 'string' && raw.defaultGoal.trim()
      ? raw.defaultGoal.trim()
      : getDefaultTeamGoal(title),
    defaultTools: normalizeStringList(raw.defaultTools, getDefaultTeamTools(title)),
    canSupervise: Boolean(raw.canSupervise),
    createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : now,
    updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : now,
  };
}

function restoreVirtualRolesFromState(state: Record<string, any>): VirtualRoleDefinition[] {
  const raw = state?.[DESKTOP_ROLES_STATE_KEY];
  const restored = raw && typeof raw === 'object' && Array.isArray(raw.roles)
    ? raw.roles
      .map((role: unknown) => sanitizeVirtualRole(role))
      .filter((role: VirtualRoleDefinition | null): role is VirtualRoleDefinition => Boolean(role))
    : [];
  const defaults = createDefaultVirtualRoles();
  const merged = [
    ...restored,
    ...defaults.filter(defaultRole => !restored.some(role => role.id === defaultRole.id)),
  ];

  return merged.sort((left, right) => Number(right.canSupervise) - Number(left.canSupervise) || left.title.localeCompare(right.title));
}

function upsertVirtualRole(
  roles: VirtualRoleDefinition[],
  role: VirtualRoleDefinition,
): VirtualRoleDefinition[] {
  return [
    role,
    ...roles.filter(candidate => candidate.id !== role.id),
  ].sort((left, right) => Number(right.canSupervise) - Number(left.canSupervise) || left.title.localeCompare(right.title));
}

function getRoleDefinitionById(
  roles: VirtualRoleDefinition[],
  roleId?: string,
  roleName?: string,
): VirtualRoleDefinition | undefined {
  return roles.find(role => role.id === roleId)
    ?? roles.find(role => role.title.toLowerCase() === String(roleName ?? '').toLowerCase())
    ?? roles.find(role => role.id === getDefaultRoleId(String(roleName ?? 'Developer')));
}

function createEmployeeId(): string {
  return `employee-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createVirtualEmployeeProfile(role = 'Developer', roleId = getDefaultRoleId(role)): VirtualEmployeeProfile {
  const now = Date.now();
  const permissions = role.toLowerCase().includes('supervisor')
    ? ['Approve actions', 'Assign team', 'Full workspace access', 'Manage budget']
    : role.toLowerCase().includes('qa')
      ? ['Read workspace', 'Run tests', 'File issues']
      : [...DEFAULT_EMPLOYEE_PERMISSIONS];

  return {
    id: createEmployeeId(),
    name: role,
    roleId,
    role,
    model: 'OpenAI-compatible default',
    status: 'idle',
    permissions,
    currentTask: 'No active task',
    createdAt: now,
    updatedAt: now,
  };
}

function createDefaultVirtualEmployees(): VirtualEmployeeProfile[] {
  return [
    { ...createVirtualEmployeeProfile('Supervisor', 'role-supervisor'), id: 'employee-supervisor', name: 'Supervisor' },
    { ...createVirtualEmployeeProfile('Product Manager', 'role-product-manager'), id: 'employee-product-manager', name: 'Product Manager' },
    { ...createVirtualEmployeeProfile('Architect', 'role-architect'), id: 'employee-architect', name: 'Architect' },
    { ...createVirtualEmployeeProfile('Developer', 'role-developer'), id: 'employee-developer', name: 'Developer' },
    { ...createVirtualEmployeeProfile('QA Reviewer', 'role-qa-reviewer'), id: 'employee-qa-reviewer', name: 'QA Reviewer' },
  ];
}

function sanitizeVirtualEmployee(value: unknown): VirtualEmployeeProfile | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Partial<VirtualEmployeeProfile>;
  const now = Date.now();
  const status = raw.status === 'working' || raw.status === 'approval' ? raw.status : 'idle';

  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : createEmployeeId(),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Employee',
    roleId: typeof raw.roleId === 'string' && raw.roleId.trim()
      ? raw.roleId.trim()
      : getDefaultRoleId(typeof raw.role === 'string' ? raw.role : 'Developer'),
    role: typeof raw.role === 'string' && raw.role.trim() ? raw.role.trim() : 'Contributor',
    model: typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim() : 'OpenAI-compatible default',
    status,
    permissions: normalizeStringList(raw.permissions, DEFAULT_EMPLOYEE_PERMISSIONS),
    currentTask: typeof raw.currentTask === 'string' && raw.currentTask.trim() ? raw.currentTask.trim() : 'No active task',
    createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : now,
    updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : now,
  };
}

function restoreVirtualEmployeesFromState(state: Record<string, any>): VirtualEmployeeProfile[] {
  const raw = state?.[DESKTOP_EMPLOYEES_STATE_KEY];
  const restored = raw && typeof raw === 'object' && Array.isArray(raw.employees)
    ? raw.employees
      .map((employee: unknown) => sanitizeVirtualEmployee(employee))
      .filter((employee: VirtualEmployeeProfile | null): employee is VirtualEmployeeProfile => Boolean(employee))
    : [];

  return restored.length > 0 ? restored : createDefaultVirtualEmployees();
}

function upsertVirtualEmployee(
  employees: VirtualEmployeeProfile[],
  employee: VirtualEmployeeProfile,
): VirtualEmployeeProfile[] {
  return [
    employee,
    ...employees.filter(candidate => candidate.id !== employee.id),
  ].sort((left, right) => right.updatedAt - left.updatedAt);
}

function getEmployeeRoleDefinition(
  employee: VirtualEmployeeProfile,
  roles: VirtualRoleDefinition[],
): VirtualRoleDefinition | undefined {
  return getRoleDefinitionById(roles, employee.roleId, employee.role);
}

function isSupervisorEmployee(employee: VirtualEmployeeProfile, roles: VirtualRoleDefinition[] = []): boolean {
  const role = getEmployeeRoleDefinition(employee, roles);
  return Boolean(role?.canSupervise)
    || /supervisor|lead|manager|owner/i.test(`${employee.role} ${employee.permissions.join(' ')}`);
}

function getProjectSupervisor(
  project: SoftwareProjectPlan,
  employees: VirtualEmployeeProfile[],
  roles: VirtualRoleDefinition[] = [],
): VirtualEmployeeProfile | undefined {
  return employees.find(employee => employee.id === project.supervisorEmployeeId)
    ?? employees.find(employee => isSupervisorEmployee(employee, roles))
    ?? employees[0];
}

function getProjectAssignedEmployees(
  project: SoftwareProjectPlan,
  employees: VirtualEmployeeProfile[],
  roles: VirtualRoleDefinition[] = [],
): VirtualEmployeeProfile[] {
  const selected = project.assignedEmployeeIds
    .map(id => employees.find(employee => employee.id === id))
    .filter((employee: VirtualEmployeeProfile | undefined): employee is VirtualEmployeeProfile => Boolean(employee));

  if (selected.length > 0) {
    return selected;
  }

  const supervisor = getProjectSupervisor(project, employees, roles);
  return employees.filter(employee => employee.id !== supervisor?.id).slice(0, 4);
}

function getProjectStaffingEmployees(
  project: SoftwareProjectPlan,
  employees: VirtualEmployeeProfile[],
  roles: VirtualRoleDefinition[],
  teams: ProjectTeamDefinition[],
): VirtualEmployeeProfile[] {
  const supervisor = getProjectSupervisor(project, employees, roles);
  const assignedTeams = getProjectTeams(project, teams);
  const teamEmployees = assignedTeams.flatMap(team => [
    getTeamSupervisor(team, employees),
    ...getTeamMembers(team, employees),
  ]).filter((employee): employee is VirtualEmployeeProfile => Boolean(employee));
  return uniqueEmployees([
    ...(supervisor ? [supervisor] : []),
    ...teamEmployees,
    ...getProjectAssignedEmployees(project, employees, roles),
  ]);
}

function createProjectPlanId(): string {
  return `project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createSoftwareProjectDraft(workspacePath?: string): SoftwareProjectPlan {
  const now = Date.now();
  return {
    id: createProjectPlanId(),
    name: 'New software project',
    mode: 'guided',
    status: 'idea',
    idea: '',
    goals: '',
    artifacts: [...DEFAULT_PROJECT_ARTIFACTS],
    workspacePath,
    supervisorRole: 'Supervisor',
    teamRoles: [...DEFAULT_AUTONOMOUS_ROLES],
    supervisorEmployeeId: 'employee-supervisor',
    assignedEmployeeIds: [
      'employee-product-manager',
      'employee-architect',
      'employee-developer',
      'employee-qa-reviewer',
    ],
    assignedTeamIds: [],
    permissionMode: 'supervised',
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeStringList(values: unknown, fallback: string[]): string[] {
  if (!Array.isArray(values)) {
    return [...fallback];
  }

  const normalized = values
    .map(value => String(value ?? '').trim())
    .filter(Boolean);

  return normalized.length > 0 ? Array.from(new Set(normalized)) : [...fallback];
}

function createProjectTeamId(name = 'team'): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'team';
  return `project-team-${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function createDefaultProjectTeams(): ProjectTeamDefinition[] {
  const now = Date.now();
  return [
    {
      id: 'project-team-core-delivery',
      name: 'Core Delivery Team',
      mission: 'Own implementation tasks, integration changes, and project deliverable assembly.',
      supervisorEmployeeId: 'employee-supervisor',
      memberEmployeeIds: ['employee-architect', 'employee-developer'],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'project-team-review-qa',
      name: 'Review And QA Team',
      mission: 'Validate quality gates, review implementation risk, and produce verification evidence.',
      supervisorEmployeeId: 'employee-supervisor',
      memberEmployeeIds: ['employee-product-manager', 'employee-qa-reviewer'],
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function sanitizeProjectTeam(value: unknown): ProjectTeamDefinition | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Partial<ProjectTeamDefinition>;
  const now = Date.now();
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Project team';

  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : createProjectTeamId(name),
    name,
    mission: typeof raw.mission === 'string' && raw.mission.trim()
      ? raw.mission.trim()
      : 'Deliver a scoped portion of the project mission.',
    supervisorEmployeeId: typeof raw.supervisorEmployeeId === 'string' && raw.supervisorEmployeeId.trim()
      ? raw.supervisorEmployeeId.trim()
      : 'employee-supervisor',
    memberEmployeeIds: normalizeStringList(raw.memberEmployeeIds, []),
    createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : now,
    updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : now,
  };
}

function restoreProjectTeamsFromState(state: Record<string, any>): ProjectTeamDefinition[] {
  const raw = state?.[DESKTOP_PROJECT_TEAMS_STATE_KEY];
  const restored = raw && typeof raw === 'object' && Array.isArray(raw.teams)
    ? raw.teams
      .map((team: unknown) => sanitizeProjectTeam(team))
      .filter((team: ProjectTeamDefinition | null): team is ProjectTeamDefinition => Boolean(team))
    : [];
  const defaults = createDefaultProjectTeams();
  const merged = [
    ...restored,
    ...defaults.filter(defaultTeam => !restored.some(team => team.id === defaultTeam.id)),
  ];

  return merged.sort((left, right) => right.updatedAt - left.updatedAt);
}

function upsertProjectTeam(
  teams: ProjectTeamDefinition[],
  team: ProjectTeamDefinition,
): ProjectTeamDefinition[] {
  return [
    team,
    ...teams.filter(candidate => candidate.id !== team.id),
  ].sort((left, right) => right.updatedAt - left.updatedAt);
}

function getProjectTeams(
  project: SoftwareProjectPlan,
  teams: ProjectTeamDefinition[],
): ProjectTeamDefinition[] {
  return project.assignedTeamIds
    .map(id => teams.find(team => team.id === id))
    .filter((team: ProjectTeamDefinition | undefined): team is ProjectTeamDefinition => Boolean(team));
}

function getTeamSupervisor(
  team: ProjectTeamDefinition,
  employees: VirtualEmployeeProfile[],
): VirtualEmployeeProfile | undefined {
  return employees.find(employee => employee.id === team.supervisorEmployeeId);
}

function getTeamMembers(
  team: ProjectTeamDefinition,
  employees: VirtualEmployeeProfile[],
): VirtualEmployeeProfile[] {
  return team.memberEmployeeIds
    .map(id => employees.find(employee => employee.id === id))
    .filter((employee: VirtualEmployeeProfile | undefined): employee is VirtualEmployeeProfile => Boolean(employee));
}

function uniqueEmployees(employees: VirtualEmployeeProfile[]): VirtualEmployeeProfile[] {
  const seen = new Set<string>();
  return employees.filter(employee => {
    if (seen.has(employee.id)) {
      return false;
    }
    seen.add(employee.id);
    return true;
  });
}

function sanitizeSoftwareProjectPlan(value: unknown, workspacePath?: string): SoftwareProjectPlan | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Partial<SoftwareProjectPlan>;
  const mode: SoftwareProjectMode = raw.mode === 'autonomous' ? 'autonomous' : 'guided';
  const status: SoftwareProjectStatus =
    raw.status === 'planning' ||
    raw.status === 'active' ||
    raw.status === 'stopped' ||
    raw.status === 'blocked' ||
    raw.status === 'done'
      ? raw.status
      : 'idea';
  const now = Date.now();

  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : createProjectPlanId(),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Untitled software project',
    mode,
    status,
    idea: typeof raw.idea === 'string' ? raw.idea : '',
    goals: typeof raw.goals === 'string' ? raw.goals : '',
    artifacts: normalizeStringList(raw.artifacts, DEFAULT_PROJECT_ARTIFACTS),
    workspacePath: typeof raw.workspacePath === 'string' && raw.workspacePath.trim()
      ? raw.workspacePath
      : workspacePath,
    supervisorRole: typeof raw.supervisorRole === 'string' && raw.supervisorRole.trim()
      ? raw.supervisorRole.trim()
      : 'Supervisor',
    teamRoles: normalizeStringList(raw.teamRoles, DEFAULT_AUTONOMOUS_ROLES),
    supervisorEmployeeId: typeof raw.supervisorEmployeeId === 'string' && raw.supervisorEmployeeId.trim()
      ? raw.supervisorEmployeeId
      : 'employee-supervisor',
    assignedEmployeeIds: normalizeStringList(raw.assignedEmployeeIds, [
      'employee-product-manager',
      'employee-architect',
      'employee-developer',
      'employee-qa-reviewer',
    ]),
    assignedTeamIds: normalizeStringList(raw.assignedTeamIds, []),
    permissionMode: raw.permissionMode === 'full-access' ? 'full-access' : 'supervised',
    createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : now,
    updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : now,
  };
}

function sortSoftwareProjects(projects: SoftwareProjectPlan[]): SoftwareProjectPlan[] {
  const seen = new Set<string>();
  return projects
    .filter(project => {
      if (!project.id || seen.has(project.id)) {
        return false;
      }
      seen.add(project.id);
      return true;
    })
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

function upsertSoftwareProjectPlan(
  projects: SoftwareProjectPlan[],
  project: SoftwareProjectPlan,
): SoftwareProjectPlan[] {
  return sortSoftwareProjects([
    project,
    ...projects.filter(candidate => candidate.id !== project.id),
  ]);
}

function restoreSoftwareProjectsFromState(
  state: Record<string, any>,
  workspacePath?: string,
): PersistedSoftwareProjectsState {
  const raw = state?.[DESKTOP_PROJECTS_STATE_KEY];
  const restoredProjects = raw && typeof raw === 'object' && Array.isArray(raw.projects)
    ? raw.projects
      .map((project: unknown) => sanitizeSoftwareProjectPlan(project, workspacePath))
      .filter((project: SoftwareProjectPlan | null): project is SoftwareProjectPlan => Boolean(project))
    : [];
  const projects = sortSoftwareProjects(restoredProjects);
  const requestedActiveId = raw && typeof raw === 'object' && typeof raw.activeProjectId === 'string'
    ? raw.activeProjectId
    : '';

  return {
    activeProjectId: projects.some(project => project.id === requestedActiveId)
      ? requestedActiveId
      : projects[0]?.id ?? '',
    projects,
  };
}

function formatProjectPrompt(
  project: SoftwareProjectPlan,
  employees: VirtualEmployeeProfile[] = [],
  roles: VirtualRoleDefinition[] = [],
  teams: ProjectTeamDefinition[] = [],
): string {
  const lines = [
    `Project name: ${project.name}`,
    `Project mode: ${project.mode === 'autonomous' ? 'autonomous project' : 'guided human/app collaboration'}`,
    '',
    'Human idea:',
    project.idea.trim() || 'The idea still needs to be captured.',
    '',
    'Goals:',
    project.goals.trim() || 'Help clarify goals, users, scope, and success criteria.',
    '',
    `Expected software artifacts: ${project.artifacts.join(', ')}`,
    '',
  ];

  if (project.mode === 'autonomous') {
    const supervisor = getProjectSupervisor(project, employees, roles);
    const assignedEmployees = getProjectAssignedEmployees(project, employees, roles);
    const assignedTeams = getProjectTeams(project, teams);
    const employeeLines = [supervisor, ...assignedEmployees]
      .filter((employee): employee is VirtualEmployeeProfile => Boolean(employee))
      .map(employee => {
        const role = getEmployeeRoleDefinition(employee, roles);
        const responsibilities = role?.responsibilities?.length
          ? role.responsibilities.join('; ')
          : employee.permissions.join('; ');
        return `- ${employee.name}: ${role?.title ?? employee.role}. Responsibilities: ${responsibilities}`;
      });
    const teamLines = assignedTeams.map(team => {
      const teamSupervisor = getTeamSupervisor(team, employees);
      const teamMembers = getTeamMembers(team, employees);
      return `- ${team.name}: ${team.mission} Supervisor: ${teamSupervisor?.name ?? 'Unassigned'}. Members: ${teamMembers.map(member => member.name).join(', ') || 'none'}`;
    });
    lines.push(
      `Supervisor role: ${project.supervisorRole}`,
      `Assigned roles: ${project.teamRoles.join(', ')}`,
      `Supervisor employee ID: ${project.supervisorEmployeeId || 'not assigned'}`,
      `Assigned team IDs: ${project.assignedTeamIds.join(', ') || 'none'}`,
      `Assigned employee IDs: ${project.assignedEmployeeIds.join(', ') || 'not assigned'}`,
      '',
      'Assigned teams and scoped missions:',
      ...(teamLines.length > 0 ? teamLines : ['- No teams assigned.']),
      '',
      'Assigned employees and role responsibilities:',
      ...(employeeLines.length > 0 ? employeeLines : ['- No employees assigned.']),
      '',
      `Execution mode: ${project.permissionMode === 'full-access' ? 'supervisor acts on behalf of the human with full permission' : 'supervised approvals for risky actions'}`,
      '',
      'Start by turning the idea into a delivery blueprint, then identify the first safe implementation milestone for the virtual team.',
    );
  } else {
    lines.push(
      'Work with me directly using the project brief above as accepted context.',
      'Do not ask for details that are already covered by the idea, goals, or expected artifacts.',
      'When the human asks to start work, infer reasonable defaults from the project brief, state assumptions briefly, and begin producing the next concrete artifact or implementation step.',
      'Ask clarifying questions only when a missing decision blocks meaningful progress; keep those questions minimal and specific.',
    );
  }

  return lines.join('\n');
}

function summarizeProjectGoals(project: SoftwareProjectPlan): string {
  const text = project.goals.trim() || project.idea.trim();
  return text ? formatSidebarLabel(text, 120) : 'No goals captured yet.';
}

function formatProjectStatus(status: SoftwareProjectStatus): string {
  switch (status) {
    case 'idea':
      return 'Idea';
    case 'planning':
      return 'Planning';
    case 'active':
      return 'Running';
    case 'stopped':
      return 'Stopped';
    case 'blocked':
      return 'Blocked';
    case 'done':
      return 'Done';
  }
}

function createSettingsDraft(config: AppConfig | null): SettingsDraft {
  const llmProvider = config?.llmProvider || DEFAULT_PROVIDER;
  const providerDefault = getProviderDefault(llmProvider);
  const featureProfile = normalizeFeatureProfile(config?.featureProfile as FeatureEntitlementProfile | undefined);

  return {
    apiKey: '',
    accountEmail: featureProfile.email,
    accountDisplayName: featureProfile.accountStatus === 'signed-in' ? featureProfile.displayName : '',
    accountPassword: '',
    accountResetToken: '',
    platformBaseUrl: typeof config?.platformBaseUrl === 'string' ? config.platformBaseUrl : 'http://127.0.0.1:8000',
    platformOrgId: typeof config?.platformOrgId === 'string' ? config.platformOrgId : '',
    llmProvider,
    baseUrl: config?.baseUrl || providerDefault.baseUrl,
    model: config?.model || providerDefault.model,
    fallbackModel: readCliOption(config, 'fallbackModel'),
    temperature: Number(config?.temperature ?? 0.7),
    maxTokens: Number(config?.maxTokens ?? providerDefault.maxTokens),
    contextTokens: Number(config?.contextTokens ?? providerDefault.contextTokens),
    enableLlmTools: Boolean(config?.enableLlmTools ?? providerDefault.enableLlmTools),
    theme: config?.theme || 'system',
    accentColor: getSkinAccent(config?.accentColor),
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

function getFeatureProfileFromConfig(config: AppConfig | null): Required<FeatureEntitlementProfile> {
  return normalizeFeatureProfile(config?.featureProfile as FeatureEntitlementProfile | undefined);
}

function getFeatureAccountStore(config: AppConfig | null): Record<string, FeatureEntitlementProfile> {
  const raw = config?.featureAccounts;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).flatMap(([key, value]) => {
    if (!key || !value || typeof value !== 'object' || Array.isArray(value)) {
      return [];
    }
    return [[key, normalizeFeatureProfile(value as FeatureEntitlementProfile)]];
  }));
}

function getAccountStoreKey(email: string): string {
  return createLocalAccountId(email);
}

function getStoredAccountProfile(config: AppConfig | null, email: string): Required<FeatureEntitlementProfile> | null {
  const normalizedEmail = email.trim().toLowerCase();
  const accountStore = getFeatureAccountStore(config);
  const accountId = getAccountStoreKey(normalizedEmail);
  const stored = accountStore[accountId] ?? accountStore[normalizedEmail];
  return stored ? normalizeFeatureProfile(stored) : null;
}

function writeProfileToAccountStore(
  config: AppConfig | null,
  profile: FeatureEntitlementProfile,
): Record<string, FeatureEntitlementProfile> {
  const accountStore = getFeatureAccountStore(config);
  const normalizedProfile = normalizeFeatureProfile(profile);
  if (normalizedProfile.accountStatus !== 'signed-in' || !normalizedProfile.email) {
    return accountStore;
  }

  const accountId = normalizedProfile.accountId || getAccountStoreKey(normalizedProfile.email);
  const storedProfile = {
    ...normalizedProfile,
    accountId,
    email: normalizedProfile.email.trim().toLowerCase(),
  };
  return {
    ...accountStore,
    [accountId]: storedProfile,
    [storedProfile.email]: storedProfile,
  };
}

function buildSettingsFeatureProfile(
  current: Required<FeatureEntitlementProfile>,
  draft: SettingsDraft,
): FeatureEntitlementProfile {
  if (current.accountStatus !== 'signed-in') {
    return current;
  }

  return {
    ...current,
    email: draft.accountEmail.trim(),
    displayName: draft.accountDisplayName.trim() || draft.accountEmail.trim(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizePlatformBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function platformOrgQuery(orgId: string): string {
  const trimmed = orgId.trim();
  return trimmed ? `?org_id=${encodeURIComponent(trimmed)}` : '';
}

async function readPlatformJson<T>(
  baseUrl: string,
  path: string,
  token?: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${normalizePlatformBaseUrl(baseUrl)}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) as any : {};
  if (!response.ok) {
    const detail = typeof payload?.detail === 'string' ? payload.detail : response.statusText;
    throw new Error(`Platform API ${response.status}: ${detail}`);
  }
  return payload as T;
}

interface PlatformLoginResponse {
  access_token: string;
  session?: {
    org_id?: string;
    email?: string;
    name?: string;
  };
  workspace?: {
    organization?: {
      org_id?: string;
    };
  };
}

interface PlatformRegisterResponse extends PlatformLoginResponse {}

interface PlatformForgotPasswordResponse {
  accepted: boolean;
  message?: string;
  reset_token?: string;
  expires_at?: string;
}

interface PlatformResetPasswordResponse {
  reset: boolean;
  email?: string;
  org_id?: string;
}

interface PlatformProfileResponse {
  org_id?: string;
  profile: FeatureEntitlementProfile;
}

interface PlatformCatalogResponse {
  org_id?: string;
  catalog_source?: string;
  packages: FeaturePackageManifest[];
}

interface PlatformPackageActionResponse {
  org_id?: string;
  profile: FeatureEntitlementProfile;
  order?: Record<string, unknown>;
  install?: Record<string, unknown>;
}

async function loginToPlatform(draft: SettingsDraft): Promise<PlatformLoginResponse> {
  const baseUrl = normalizePlatformBaseUrl(draft.platformBaseUrl);
  if (!baseUrl) {
    throw new Error('Enter the agent-platform base URL.');
  }
  return readPlatformJson<PlatformLoginResponse>(baseUrl, '/auth/login', undefined, {
    method: 'POST',
    body: JSON.stringify({
      email: draft.accountEmail.trim(),
      password: draft.accountPassword,
      ...(draft.platformOrgId.trim() ? { org_id: draft.platformOrgId.trim(), realm: 'tenant' } : {}),
    }),
  });
}

function getPlatformWorkspaceName(draft: SettingsDraft): string {
  const explicitWorkspace = draft.platformOrgId.trim();
  if (explicitWorkspace) {
    return explicitWorkspace;
  }
  const displayName = draft.accountDisplayName.trim();
  if (displayName) {
    return `${displayName} Workspace`;
  }
  const emailPrefix = draft.accountEmail.trim().split('@')[0]?.replace(/[._-]+/g, ' ').trim();
  return emailPrefix ? `${emailPrefix} Workspace` : 'CodeAgent Workspace';
}

async function registerWithPlatform(draft: SettingsDraft): Promise<PlatformRegisterResponse> {
  const baseUrl = normalizePlatformBaseUrl(draft.platformBaseUrl);
  if (!baseUrl) {
    throw new Error('Enter the agent-platform base URL.');
  }
  const email = draft.accountEmail.trim();
  const displayName = draft.accountDisplayName.trim() || email;
  return readPlatformJson<PlatformRegisterResponse>(baseUrl, '/auth/register', undefined, {
    method: 'POST',
    body: JSON.stringify({
      workspace_name: getPlatformWorkspaceName(draft),
      name: displayName,
      email,
      password: draft.accountPassword,
    }),
  });
}

async function requestPlatformPasswordReset(draft: SettingsDraft): Promise<PlatformForgotPasswordResponse> {
  const baseUrl = normalizePlatformBaseUrl(draft.platformBaseUrl);
  if (!baseUrl) {
    throw new Error('Enter the agent-platform base URL.');
  }
  return readPlatformJson<PlatformForgotPasswordResponse>(baseUrl, '/auth/forgot-password', undefined, {
    method: 'POST',
    body: JSON.stringify({
      email: draft.accountEmail.trim(),
      ...(draft.platformOrgId.trim() ? { org_id: draft.platformOrgId.trim() } : {}),
    }),
  });
}

async function resetPlatformPassword(draft: SettingsDraft): Promise<PlatformResetPasswordResponse> {
  const baseUrl = normalizePlatformBaseUrl(draft.platformBaseUrl);
  if (!baseUrl) {
    throw new Error('Enter the agent-platform base URL.');
  }
  return readPlatformJson<PlatformResetPasswordResponse>(baseUrl, '/auth/reset-password', undefined, {
    method: 'POST',
    body: JSON.stringify({
      token: draft.accountResetToken.trim(),
      password: draft.accountPassword,
    }),
  });
}

async function fetchPlatformFeatureProfile(
  baseUrl: string,
  token: string,
  orgId: string,
): Promise<PlatformProfileResponse> {
  return readPlatformJson<PlatformProfileResponse>(baseUrl, `/code-agent/profile${platformOrgQuery(orgId)}`, token);
}

async function fetchPlatformFeatureCatalog(
  baseUrl: string,
  token: string,
  orgId: string,
): Promise<PlatformCatalogResponse> {
  return readPlatformJson<PlatformCatalogResponse>(baseUrl, `/code-agent/catalog${platformOrgQuery(orgId)}`, token);
}

function normalizePlatformFeatureCatalog(value: unknown): FeaturePackageManifest[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const manifests = value.flatMap(item => {
    if (!item || typeof item !== 'object') {
      return [];
    }
    const manifest = item as Partial<FeaturePackageManifest>;
    if (
      typeof manifest.id !== 'string' ||
      typeof manifest.productSku !== 'string' ||
      typeof manifest.displayName !== 'string' ||
      !manifest.distribution ||
      !Array.isArray(manifest.supportedShells) ||
      !Array.isArray(manifest.features)
    ) {
      return [];
    }
    return [manifest as FeaturePackageManifest];
  });
  return manifests.length > 0 ? manifests : undefined;
}

function getFeaturePackageCatalogFromConfig(config: AppConfig | null): FeaturePackageManifest[] | undefined {
  if (config?.platformCatalogSource !== 'platform') {
    return undefined;
  }
  return normalizePlatformFeatureCatalog(config.platformFeaturePackageCatalog);
}

async function createPlatformPaymentMethod(
  baseUrl: string,
  token: string,
  orgId: string,
  manifest: FeaturePackageManifest,
  draft: PurchaseDraft,
): Promise<void> {
  const expiry = parseCardExpiry(draft.expiry);
  if (!expiry) {
    throw new Error('Enter a valid future expiration date as MM/YY or MM/YYYY.');
  }
  const digits = draft.cardNumber.replace(/\D/g, '');
  await readPlatformJson(baseUrl, '/billing/payment-methods', token, {
    method: 'POST',
    body: JSON.stringify({
      ...(orgId.trim() ? { org_id: orgId.trim() } : {}),
      method_type: 'card',
      brand: getCardBrand(digits),
      last4: digits.slice(-4),
      holder_name: draft.nameOnCard.trim() || manifest.displayName,
      exp_month: expiry.expMonth,
      exp_year: expiry.expYear,
      make_default: true,
    }),
  });
}

async function purchasePlatformPackage(
  baseUrl: string,
  token: string,
  orgId: string,
  packageId: string,
): Promise<PlatformPackageActionResponse> {
  return readPlatformJson<PlatformPackageActionResponse>(baseUrl, `/code-agent/packages/${encodeURIComponent(packageId)}/purchase`, token, {
    method: 'POST',
    body: JSON.stringify({
      ...(orgId.trim() ? { org_id: orgId.trim() } : {}),
    }),
  });
}

async function installPlatformPackage(
  baseUrl: string,
  token: string,
  orgId: string,
  manifest: FeaturePackageManifest,
  localInstall?: FeaturePackageInstallResult,
): Promise<PlatformPackageActionResponse> {
  return readPlatformJson<PlatformPackageActionResponse>(baseUrl, `/code-agent/packages/${encodeURIComponent(manifest.id)}/install`, token, {
    method: 'POST',
    body: JSON.stringify({
      ...(orgId.trim() ? { org_id: orgId.trim() } : {}),
      version: localInstall?.version ?? manifest.distribution.artifact.version,
      installed_path: localInstall?.installedPath ?? manifest.distribution.artifact.bundlePath,
      sha256: localInstall?.sha256 ?? manifest.distribution.artifact.sha256,
      signature: localInstall?.signature ?? manifest.distribution.artifact.signature,
    }),
  });
}

function createPlatformPackageDownloadRequest(
  baseUrl: string,
  token: string,
  orgId: string,
  manifest: FeaturePackageManifest,
): FeaturePackageInstallRequest['download'] {
  const artifact = manifest.distribution.artifact as FeaturePackageManifest['distribution']['artifact'] & {
    downloadUrl?: string;
  };
  const normalizedBaseUrl = normalizePlatformBaseUrl(baseUrl);
  const rawUrl = typeof artifact.downloadUrl === 'string' ? artifact.downloadUrl.trim() : '';
  const url = /^https?:\/\//i.test(rawUrl)
    ? rawUrl
    : rawUrl.startsWith('/')
      ? `${normalizedBaseUrl}${rawUrl}`
      : `${normalizedBaseUrl}/code-agent/packages/${encodeURIComponent(manifest.id)}/artifact`;
  const parsed = new URL(url);
  const normalizedOrgId = orgId.trim();
  if (normalizedOrgId && !parsed.searchParams.has('org_id')) {
    parsed.searchParams.set('org_id', normalizedOrgId);
  }
  return {
    url: parsed.toString(),
    headers: {
      Authorization: `Bearer ${token}`,
    },
  };
}

function createLocalAccountId(email: string): string {
  const normalized = email.trim().toLowerCase();
  let hash = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    hash = ((hash << 5) - hash + normalized.charCodeAt(index)) | 0;
  }
  return `acct_${Math.abs(hash).toString(36)}`;
}

function createLocalRecordId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function getPackagePriceLabel(manifest: FeaturePackageManifest): string {
  return manifest.pricing.label || formatMoney(manifest.pricing.amountCents, manifest.pricing.currency, manifest.pricing.interval);
}

function getPackageDistributionLabel(manifest: FeaturePackageManifest): string {
  switch (manifest.distribution.mode) {
    case 'bundled':
      return 'Bundled with app';
    case 'installable':
      return manifest.distribution.installRequired ? 'Install after purchase' : 'Installable catalog item';
    case 'remote-service':
      return 'Remote service';
    default:
      return manifest.distribution.mode;
  }
}

function getPackageSecurityLabel(manifest: FeaturePackageManifest): string {
  switch (manifest.distribution.securityBoundary) {
    case 'none-client-bundled':
      return 'Client-side only';
    case 'signed-local-bundle':
      return 'Signed package';
    case 'server-enforced':
      return 'Server enforced';
    default:
      return manifest.distribution.securityBoundary;
  }
}

function formatMoney(amountCents: number, currency: string, interval?: string): string {
  if (amountCents <= 0) {
    return 'Free';
  }
  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amountCents / 100);
  return interval && interval !== 'one-time' ? `${amount}/${interval}` : amount;
}

function formatAccountTier(profile: Required<FeatureEntitlementProfile>): string {
  if (profile.accountStatus !== 'signed-in') {
    return 'Guest';
  }
  if (profile.accountTier === 'enterprise') {
    return 'Enterprise';
  }
  return profile.accountTier === 'paid' ? 'Paid subscriber' : 'Free account';
}

type FeaturePackageCatalogEntry = FeaturePackageResolution['packages'][number];

function getPackageInitials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return 'PK';
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return words.slice(0, 2).map(word => word[0]).join('').toUpperCase();
}

function formatPackageCount(count: number): string {
  return `${count} package${count === 1 ? '' : 's'}`;
}

function formatPackageDate(value?: string): string {
  if (!value) {
    return 'Not recorded';
  }
  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    return 'Not recorded';
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(time));
}

function getLatestPurchaseForPackage(
  profile: Required<FeatureEntitlementProfile>,
  packageId: string,
): AccountPurchaseRecord | undefined {
  for (let index = profile.purchases.length - 1; index >= 0; index -= 1) {
    if (profile.purchases[index].packageId === packageId) {
      return profile.purchases[index];
    }
  }
  return undefined;
}

function getOwnedPackageEntries(resolution: FeaturePackageResolution): FeaturePackageCatalogEntry[] {
  const profile = resolution.profile;
  const ownedPackageIds = new Set<string>();
  for (const packageId of profile.purchasedPackageIds) {
    ownedPackageIds.add(packageId);
  }
  for (const packageId of profile.enterprisePackageIds) {
    ownedPackageIds.add(packageId);
  }
  for (const packageId of profile.trialPackageIds) {
    ownedPackageIds.add(packageId);
  }
  for (const purchase of profile.purchases) {
    if (purchase.status === 'paid' || purchase.status === 'trial') {
      ownedPackageIds.add(purchase.packageId);
    }
  }

  return resolution.packages.filter(entry => (
    entry.manifest.tier !== 'free' &&
    ownedPackageIds.has(entry.manifest.id)
  ));
}

function getPackageOwnershipLabel(
  profile: Required<FeatureEntitlementProfile>,
  entry: FeaturePackageCatalogEntry,
  purchase?: AccountPurchaseRecord,
): string {
  const packageId = entry.manifest.id;
  if (profile.disabledPackageIds.includes(packageId)) {
    return 'Disabled';
  }
  if (profile.expiredPackageIds.includes(packageId)) {
    return 'Expired';
  }
  if (purchase?.status === 'refunded') {
    return 'Refunded';
  }
  if (purchase?.status === 'failed') {
    return 'Payment failed';
  }
  if (profile.enterprisePackageIds.includes(packageId)) {
    return 'Enterprise entitlement';
  }
  if (profile.trialPackageIds.includes(packageId) || purchase?.status === 'trial') {
    return 'Trial';
  }
  if (profile.purchasedPackageIds.includes(packageId) || purchase?.status === 'paid') {
    if (profile.subscriptionStatus === 'past-due') {
      return 'Past due';
    }
    if (profile.subscriptionStatus === 'canceled') {
      return 'Canceled';
    }
    return 'Active subscription';
  }
  return getPackageStateLabel(entry.state);
}

function getPackageDisplayName(
  resolution: FeaturePackageResolution,
  packageId: string,
  fallback: string,
): string {
  return resolution.packages.find(entry => entry.manifest.id === packageId)?.manifest.displayName ?? fallback;
}

function getCardBrand(cardNumber: string): string {
  const digits = cardNumber.replace(/\D/g, '');
  if (/^4/.test(digits)) return 'Visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'American Express';
  if (/^6(?:011|5)/.test(digits)) return 'Discover';
  return 'Card';
}

function parseCardExpiry(expiry: string): { expMonth: number; expYear: number } | null {
  const trimmed = expiry.trim();
  const match = trimmed.match(/^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/)
    ?? trimmed.match(/^(\d{1,2})\s*\/\s*\d{1,2}\s*\/\s*(\d{4})$/);
  if (!match) {
    return null;
  }
  const expMonth = Number(match[1]);
  const rawYear = Number(match[2]);
  const expYear = rawYear < 100 ? 2000 + rawYear : rawYear;
  if (expMonth < 1 || expMonth > 12) {
    return null;
  }
  const now = new Date();
  const expiresAt = new Date(expYear, expMonth, 1);
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return expiresAt <= currentMonth ? null : { expMonth, expYear };
}

function validateCardNumber(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 12 || digits.length > 19) {
    return false;
  }
  let sum = 0;
  let shouldDouble = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function validatePurchaseDraft(draft: PurchaseDraft): string | null {
  if (!draft.nameOnCard.trim()) {
    return 'Name on card is required.';
  }
  if (!validateCardNumber(draft.cardNumber)) {
    return 'Enter a valid credit card number.';
  }
  if (!parseCardExpiry(draft.expiry)) {
    return 'Enter a valid future expiration date as MM/YY or MM/YYYY.';
  }
  if (!/^\d{3,4}$/.test(draft.cvc.trim())) {
    return 'Enter a valid card security code.';
  }
  if (!draft.postalCode.trim()) {
    return 'Billing ZIP or postal code is required.';
  }
  return null;
}

function createPurchasedProfile(
  profile: Required<FeatureEntitlementProfile>,
  manifest: FeaturePackageManifest,
  draft: PurchaseDraft,
): FeatureEntitlementProfile {
  const now = new Date().toISOString();
  const digits = draft.cardNumber.replace(/\D/g, '');
  const expiry = parseCardExpiry(draft.expiry);
  const paymentMethod: AccountPaymentMethod = {
    id: createLocalRecordId('pm'),
    type: 'card',
    brand: getCardBrand(digits),
    last4: digits.slice(-4),
    expMonth: expiry?.expMonth ?? 0,
    expYear: expiry?.expYear ?? 0,
    createdAt: now,
  };
  const purchase: AccountPurchaseRecord = {
    id: createLocalRecordId('pur'),
    packageId: manifest.id,
    productSku: manifest.productSku,
    amountCents: manifest.pricing.amountCents,
    currency: manifest.pricing.currency,
    paymentMethodId: paymentMethod.id,
    status: 'paid',
    purchasedAt: now,
  };
  const purchasedPackageIds = Array.from(new Set([...profile.purchasedPackageIds, manifest.id]));

  return {
    ...profile,
    accountTier: manifest.tier === 'enterprise' ? 'enterprise' : 'paid',
    subscriptionStatus: manifest.tier === 'enterprise' ? 'enterprise' : 'active',
    purchasedPackageIds,
    localDeveloperOverride: false,
    paymentMethods: [...profile.paymentMethods, paymentMethod],
    purchases: [...profile.purchases, purchase],
    updatedAt: now,
  };
}

function createInstalledProfile(
  profile: Required<FeatureEntitlementProfile>,
  manifest: FeaturePackageManifest,
  localInstall?: FeaturePackageInstallResult,
): FeatureEntitlementProfile {
  const now = new Date().toISOString();
  const artifact = manifest.distribution.artifact;
  const installRecord: FeaturePackageInstallRecord = {
    packageId: manifest.id,
    artifactId: artifact.artifactId,
    version: localInstall?.version ?? artifact.version,
    state: 'installed',
    installedAt: now,
    ...(localInstall?.installedPath || artifact.installedPath || artifact.bundlePath ? { installedPath: localInstall?.installedPath || artifact.installedPath || artifact.bundlePath } : {}),
    ...(localInstall?.sha256 || artifact.sha256 ? { sha256: localInstall?.sha256 || artifact.sha256 } : {}),
    ...(localInstall?.signature || artifact.signature ? { signature: localInstall?.signature || artifact.signature } : {}),
  };

  return {
    ...profile,
    installedPackageIds: Array.from(new Set([...profile.installedPackageIds, manifest.id])),
    packageInstallRecords: [...profile.packageInstallRecords, installRecord],
    updatedAt: now,
  };
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
  const trimmed = value.trim();
  const isAbsolute = trimmed.startsWith('/');
  const normalized = trimmed
    .replace(/\\/g, '/')
    .split('/')
    .filter(part => part && part !== '.')
    .join('/');

  if (!normalized) {
    return isAbsolute ? '/' : '.';
  }

  return isAbsolute ? `/${normalized}` : normalized;
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

function getPathBasename(value: string): string {
  const normalized = normalizeWorkspacePath(value);
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || normalized;
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

function getDataUrlByteSize(dataUrl: string): number {
  const base64 = dataUrl.split(',')[1] ?? '';
  return Math.ceil(base64.length * 0.75);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read pasted image'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      result ? resolve(result) : reject(new Error('Pasted image did not produce a data URL'));
    };
    reader.readAsDataURL(file);
  });
}

function loadImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Pasted image could not be decoded'));
    image.src = dataUrl;
  });
}

function getResizedImageDimensions(width: number, height: number): { width: number; height: number } {
  const maxEdge = Math.max(width, height);
  if (!maxEdge || maxEdge <= CHAT_IMAGE_MAX_EDGE) {
    return { width, height };
  }

  const scale = CHAT_IMAGE_MAX_EDGE / maxEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function createChatImageAttachment(file: File): Promise<ChatImageAttachment> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`${file.name || 'Pasted file'} is not an image.`);
  }
  if (file.size > CHAT_IMAGE_MAX_SOURCE_BYTES) {
    throw new Error(`${file.name || 'Pasted image'} is larger than ${formatFileSize(CHAT_IMAGE_MAX_SOURCE_BYTES)}.`);
  }

  const originalDataUrl = await readFileAsDataUrl(file);
  const image = await loadImageElement(originalDataUrl);
  const dimensions = getResizedImageDimensions(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const shouldResize = dimensions.width !== (image.naturalWidth || image.width)
    || dimensions.height !== (image.naturalHeight || image.height)
    || getDataUrlByteSize(originalDataUrl) > 1_500_000;

  let dataUrl = originalDataUrl;
  let mediaType = file.type || 'image/png';
  if (shouldResize) {
    const canvas = document.createElement('canvas');
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not prepare pasted image for upload.');
    }
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, dimensions.width, dimensions.height);
    context.drawImage(image, 0, 0, dimensions.width, dimensions.height);
    dataUrl = canvas.toDataURL('image/jpeg', CHAT_IMAGE_JPEG_QUALITY);
    mediaType = 'image/jpeg';
  }

  return {
    id: `image-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name || `Pasted image ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    mediaType,
    size: getDataUrlByteSize(dataUrl),
    width: dimensions.width,
    height: dimensions.height,
    dataUrl,
  };
}

function formatImageAttachmentSummary(images: UiImageAttachment[]): string {
  if (images.length === 0) {
    return '';
  }

  return images
    .map(image => {
      const dimensions = image.width && image.height ? `${image.width}x${image.height}` : '';
      const size = formatFileSize(image.size);
      return [image.name, dimensions, size].filter(Boolean).join(' · ');
    })
    .join(', ');
}

function buildMultimodalChatContent(prompt: string, images: ChatImageAttachment[]): string | ChatMessageContentPart[] {
  if (images.length === 0) {
    return prompt;
  }

  return [
    {
      type: 'text' as const,
      text: prompt,
    },
    ...images.map(image => ({
      type: 'image_url' as const,
      image_url: {
        url: image.dataUrl,
        detail: 'auto' as const,
      },
    })),
  ];
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
  return getToolResultDataPath(activity.toolName, activity.result);
}

function getToolResultDataPath(toolName: string, result: unknown): string | null {
  if (toolName !== 'fs.write' || !result || typeof result !== 'object') {
    return null;
  }

  const pathValue = (result as { path?: unknown }).path;
  return typeof pathValue === 'string' && pathValue.trim() ? pathValue : null;
}

function formatProjectOutputSource(source: ProjectGeneratedOutput['source']): string {
  if (source === 'automation') {
    return 'Autonomous output';
  }
  if (source === 'team-chat') {
    return 'Team chat output';
  }
  if (source === 'tool') {
    return 'Tool output';
  }
  return 'Guided chat output';
}

function isAutomationScopedToolEvent(data: { scope?: ToolEventScope }): boolean {
  return data.scope?.source === 'scheduled-task' || data.scope?.source === 'virtual-team' || data.scope?.source === 'project-chat';
}

function isProjectToolActivity(activity: ToolActivity, projectId: string, automationTeamId: string): boolean {
  return activity.scope?.projectId === projectId || activity.scope?.teamId === automationTeamId;
}

function matchesSessionSearch(session: PersistedChatSession, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const haystack = [
    session.title,
    session.workspacePath ?? '',
    ...session.messages.map(message => `${message.title ?? ''} ${message.content} ${(message.imageAttachments ?? []).map(image => image.name).join(' ')}`),
  ].join('\n').toLowerCase();

  return haystack.includes(normalizedQuery);
}

function hasShellFeature(resolution: FeaturePackageResolution, featureId?: string): boolean {
  return !featureId || isFeatureAvailable(resolution, featureId);
}

function filterNavigationItems<T extends string>(
  items: Array<NavigationChildItem<T>>,
  resolution: FeaturePackageResolution,
): Array<NavigationChildItem<T>> {
  return items.filter(item => hasShellFeature(resolution, item.featureId));
}

function getAvailableDesktopCommands(resolution: FeaturePackageResolution): DesktopCommand[] {
  const commandsByName = new Map<string, DesktopCommand>();
  for (const command of DESKTOP_COMMANDS.filter(item => hasShellFeature(resolution, item.featureId))) {
    commandsByName.set(command.command, command);
  }

  for (const entry of getFeaturePackageExtensions(resolution, 'desktop.slash-command')) {
    const extension = entry.extension;
    const commandNames = [extension.command, ...(extension.commandAliases ?? [])].filter((command): command is string => Boolean(command));
    for (const command of commandNames) {
      if (commandsByName.has(command)) {
        continue;
      }
      commandsByName.set(command, {
        command,
        description: extension.description || extension.title,
        featureId: extension.featureId,
      });
    }
  }

  return [...commandsByName.values()];
}

function findDesktopCommandForPrompt(prompt: string, commands: DesktopCommand[]): DesktopCommand | undefined {
  const normalizedPrompt = prompt.trim().toLowerCase();
  return [...commands]
    .sort((left, right) => right.command.length - left.command.length)
    .find(command => {
      const normalizedCommand = command.command.toLowerCase();
      const commandPrefix = normalizedCommand.split(/\s+/)[0];
      if (normalizedCommand.includes('<')) {
        return normalizedPrompt === commandPrefix || normalizedPrompt.startsWith(`${commandPrefix} `);
      }
      return normalizedPrompt === normalizedCommand;
    });
}

function filterDesktopCommands(input: string, availableCommands: DesktopCommand[]): DesktopCommand[] {
  if (!input.startsWith('/')) {
    return [];
  }

  const query = input.trim().toLowerCase();
  return availableCommands
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
      'Check that your OpenAI-compatible server is running, then verify Settings -> Model base URL and model ID.',
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
      'Increase the model context length on your provider, reduce enabled tools in Tools, or lower Settings -> Model context tokens.',
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

function getChatMessages(messages: UiMessage[], nextUserMessage: string | ChatMessageContentPart[]): ChatMessage[] {
  const history = messages
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .map(message => ({
      role: message.role as 'user' | 'assistant',
      content: message.content,
    }));

  return [...history, { role: 'user', content: nextUserMessage }];
}

function updateProjectChatMessage(
  chats: Record<string, UiMessage[]>,
  projectChatKey: string,
  messageId: string,
  update: (message: UiMessage) => UiMessage,
): Record<string, UiMessage[]> {
  const messages = chats[projectChatKey] ?? [];
  return {
    ...chats,
    [projectChatKey]: messages.map(message => (
      message.id === messageId ? update(message) : message
    )),
  };
}

function getProjectChatRequestMessages(
  messages: UiMessage[],
  project: SoftwareProjectPlan,
  channel: ProjectChatChannel,
  nextUserMessage: string,
  employees: VirtualEmployeeProfile[],
  roles: VirtualRoleDefinition[],
  projectTeams: ProjectTeamDefinition[],
): ChatMessage[] {
  const projectContext = [
    channel === 'team'
      ? 'You are supporting an autonomous project team chat. Treat the human message as direction to the supervisor/team.'
      : 'You are supporting a guided project chat. Treat the human message as project-scoped product/software direction.',
    formatProjectPrompt(project, employees, roles, projectTeams),
    channel === 'guided'
      ? 'Use the project details above to infer intent and continue work. Avoid generic intake questions unless they are strictly necessary to unblock the next step.'
      : 'Use the project details above as the team operating context.',
    `Human message:\n${nextUserMessage}`,
  ].join('\n\n');

  const history = messages
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .map(message => ({
      role: message.role as 'user' | 'assistant',
      content: message.content,
    }));

  return [...history, { role: 'user', content: projectContext }];
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
  const [softwareProjects, setSoftwareProjects] = useState<SoftwareProjectPlan[]>([]);
  const softwareProjectsRef = useRef<SoftwareProjectPlan[]>([]);
  const [activeSoftwareProjectId, setActiveSoftwareProjectId] = useState('');
  const [runningProjectIds, setRunningProjectIds] = useState<Set<string>>(() => new Set());
  const runningProjectIdsRef = useRef<Set<string>>(new Set());
  const stoppedProjectIdsRef = useRef<Set<string>>(new Set());
  const [virtualRoles, setVirtualRoles] = useState<VirtualRoleDefinition[]>([]);
  const [virtualEmployees, setVirtualEmployees] = useState<VirtualEmployeeProfile[]>([]);
  const [projectTeams, setProjectTeams] = useState<ProjectTeamDefinition[]>([]);
  const [projectChatMessages, setProjectChatMessages] = useState<Record<string, UiMessage[]>>({});
  const [projectGeneratedOutputs, setProjectGeneratedOutputs] = useState<Record<string, ProjectGeneratedOutput[]>>({});
  const [projectChatSendingKeys, setProjectChatSendingKeys] = useState<Set<string>>(() => new Set());
  const [projectActionMessage, setProjectActionMessage] = useState('');
  const [messages, setMessages] = useState<UiMessage[]>(() => createReadyMessages());
  const [input, setInput] = useState('');
  const [chatToolWorkspacePath, setChatToolWorkspacePath] = useState('');
  const [chatContextAttachments, setChatContextAttachments] = useState<ChatContextAttachment[]>([]);
  const [chatImageAttachments, setChatImageAttachments] = useState<ChatImageAttachment[]>([]);
  const [sessionSearch, setSessionSearch] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>(() => createSettingsDraft(null));
  const [settingsMessage, setSettingsMessage] = useState('');
  const [toolRouterMessage, setToolRouterMessage] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSyncingPlatform, setIsSyncingPlatform] = useState(false);
  const [purchasePackageId, setPurchasePackageId] = useState<string | null>(null);
  const [purchaseDraft, setPurchaseDraft] = useState<PurchaseDraft>(() => ({ ...EMPTY_PURCHASE_DRAFT }));
  const [activeView, setActiveView] = useState<AppView>('chat');
  const [activeProjectsSection, setActiveProjectsSection] = useState<ProjectsSectionId>('studio');
  const [activeToolsSection, setActiveToolsSection] = useState<ToolsSectionId>('bridge');
  const [activeAutomationSection, setActiveAutomationSection] = useState<AutomationSectionId>('tasks');
  const [activeHistorySection, setActiveHistorySection] = useState<HistorySectionId>('overview');
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSectionId>('account');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readStoredSidebarCollapsed());

  const messageListRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const streamMessageIds = useRef<Map<string, ChatStreamTarget>>(new Map());
  const toolActivityNamesRef = useRef<Map<string, string>>(new Map());
  const hasHydratedSessionsRef = useRef(false);
  const hasHydratedProjectsRef = useRef(false);
  const hasHydratedRolesRef = useRef(false);
  const hasHydratedEmployeesRef = useRef(false);
  const hasHydratedProjectTeamsRef = useRef(false);
  const hasHydratedProjectChatsRef = useRef(false);
  const hasHydratedProjectOutputsRef = useRef(false);

  const tokenUsage = useMemo(() => {
    return messages.reduce(
      (totals, message) => ({
        inputTokens: totals.inputTokens + (message.usage?.inputTokens ?? 0),
        outputTokens: totals.outputTokens + (message.usage?.outputTokens ?? 0),
      }),
      { inputTokens: 0, outputTokens: 0 },
    );
  }, [messages]);
  const featureResolution = useMemo(() => {
    return resolveFeaturePackages(
      'desktop',
      getFeatureProfileFromConfig(appConfig),
      getFeaturePackageCatalogFromConfig(appConfig),
    );
  }, [appConfig]);
  const canSyncPlatform = useMemo(() => {
    const platformBaseUrl = normalizePlatformBaseUrl(String(appConfig?.platformBaseUrl || ''));
    const platformToken = typeof appConfig?.platformAccessToken === 'string' ? appConfig.platformAccessToken.trim() : '';
    return Boolean(platformBaseUrl && platformToken);
  }, [appConfig]);
  const availableDesktopCommands = useMemo(() => {
    return getAvailableDesktopCommands(featureResolution);
  }, [featureResolution]);
  const availablePrimaryNav = useMemo(() => {
    return PRIMARY_NAV.filter(item => hasShellFeature(featureResolution, item.featureId));
  }, [featureResolution]);

  useEffect(() => {
    initializeApp();
  }, []);

  useEffect(() => {
    const activeNavItem = PRIMARY_NAV.find(item => item.id === activeView);
    if (activeNavItem && !hasShellFeature(featureResolution, activeNavItem.featureId)) {
      setActiveView('chat');
    }
  }, [activeView, featureResolution]);

  useEffect(() => {
    try {
      window.localStorage?.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(sidebarCollapsed));
    } catch {
      // Non-critical preference persistence.
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    softwareProjectsRef.current = softwareProjects;
  }, [softwareProjects]);

  useEffect(() => {
    if (!hasHydratedProjectsRef.current) {
      return;
    }

    setSoftwareProjects(current => {
      let changed = false;
      const nextProjects = current.map(project => {
        if (project.mode !== 'autonomous') {
          return project;
        }

        if (project.status === 'stopped') {
          return project;
        }

        const automationTeamId = getProjectAutomationTeamId(project.id);
        const latestRun = teamRuns
          .filter(run => run.teamId === automationTeamId)
          .sort((left, right) => right.startedAt - left.startedAt)[0];
        const nextStatus: SoftwareProjectStatus = runningProjectIds.has(project.id) || latestRun?.status === 'running'
          ? 'active'
          : latestRun?.status === 'succeeded'
            ? 'done'
            : latestRun?.status === 'failed'
              ? 'blocked'
              : project.status;

        if (nextStatus === project.status) {
          return project;
        }

        changed = true;
        return { ...project, status: nextStatus, updatedAt: Date.now() };
      });

      return changed ? nextProjects : current;
    });
  }, [teamRuns, runningProjectIds]);

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
        const target = streamMessageIds.current.get(data.requestId);
        if (!target) {
          return;
        }

        if (target.scope === 'project') {
          setProjectChatMessages(current => updateProjectChatMessage(
            current,
            target.projectChatKey,
            target.messageId,
            message => ({ ...message, content: `${message.content}${data.delta}` }),
          ));
          return;
        }

        setMessages(current => current.map(message => (
          message.id === target.messageId
            ? { ...message, content: `${message.content}${data.delta}` }
            : message
        )));
      }));

      removers.push(ipcClient.onChatComplete(data => {
        const target = streamMessageIds.current.get(data.requestId);
        streamMessageIds.current.delete(data.requestId);

        if (target?.scope === 'project') {
          setProjectChatMessages(current => updateProjectChatMessage(
            current,
            target.projectChatKey,
            target.messageId,
            message => ({
              ...message,
              content: data.response.content || message.content || 'No response content.',
              status: 'sent',
              title: data.response.model,
              usage: data.response.usage,
            }),
          ));
          setProjectChatSendingKeys(current => {
            const next = new Set(current);
            next.delete(target.projectChatKey);
            return next;
          });
        } else if (target?.scope === 'main') {
          setMessages(current => current.map(message => (
            message.id === target.messageId
              ? {
                ...message,
                content: data.response.content || message.content || 'No response content.',
                status: 'sent',
                title: data.response.model,
                usage: data.response.usage,
              }
              : message
          )));
          setIsSending(false);
        }

        setStatus('Ready');
        if (target?.scope === 'main') {
          inputRef.current?.focus();
        }
      }));

      removers.push(ipcClient.onChatError(data => {
        const target = streamMessageIds.current.get(data.requestId);
        streamMessageIds.current.delete(data.requestId);

        if (target?.scope === 'project') {
          setProjectChatMessages(current => updateProjectChatMessage(
            current,
            target.projectChatKey,
            target.messageId,
            message => ({ ...message, content: formatDesktopError(data.error), status: 'failed', title: 'Request failed', role: 'error' }),
          ));
          setProjectChatSendingKeys(current => {
            const next = new Set(current);
            next.delete(target.projectChatKey);
            return next;
          });
        } else if (target?.scope === 'main') {
          setMessages(current => current.map(message => (
            message.id === target.messageId
              ? { ...message, content: formatDesktopError(data.error), status: 'failed', title: 'Request failed', role: 'error' }
              : message
          )));
        } else {
          appendMessage(createMessage('error', formatDesktopError(data.error), {
            title: 'Request failed',
            status: 'failed',
          }));
        }

        if (target?.scope !== 'project') {
          setIsSending(false);
        }
        setStatus('Error');
        if (target?.scope !== 'project') {
          inputRef.current?.focus();
        }
      }));

      removers.push(ipcClient.onToolStart(data => {
        recordToolStart(data);
      }));

      removers.push(ipcClient.onToolResult(data => {
        recordToolResult(data);
        if (!isAutomationScopedToolEvent(data)) {
          appendMessage(createMessage('tool', `\`\`\`json\n${formatJson(data.data)}\n\`\`\``, {
            title: `Tool result ${data.toolId}`,
          }));
        }
      }));

      removers.push(ipcClient.onToolComplete(data => {
        recordToolComplete(data);
        if (!isAutomationScopedToolEvent(data)) {
          appendMessage(createMessage('tool', `${data.success ? 'Completed' : 'Failed'} in ${data.duration} ms`, {
            title: `Tool ${data.toolId}`,
          }));
        }
      }));

      removers.push(ipcClient.onToolError(data => {
        recordToolError(data);
        if (!isAutomationScopedToolEvent(data)) {
          appendMessage(createMessage('error', formatDesktopError(data.error), {
            title: `Tool error ${data.toolId}`,
            status: 'failed',
          }));
        } else if ((data.scope?.source === 'virtual-team' || data.scope?.source === 'project-chat') && data.scope.projectId) {
          const project = softwareProjectsRef.current.find(candidate => candidate.id === data.scope?.projectId);
          if (project) {
            appendProjectChatMessages(project, data.scope.source === 'project-chat' ? data.scope.channel ?? 'guided' : 'team', [
              createMessage('error', formatDesktopError(data.error), {
                title: data.scope.assignmentTitle ?? `Tool error ${data.toolId}`,
                status: 'failed',
              }),
            ]);
          }
        }
      }));

      removers.push(ipcClient.onFileWriteReview(data => {
        setFileWriteReviews(current => [
          ...current.filter(review => review.requestId !== data.requestId),
          data,
        ]);
        setStatus('Approval needed');
        if (!isAutomationScopedToolEvent(data)) {
          appendMessage(createMessage('system', `Review requested for ${data.path}`, {
            title: 'File write approval',
          }));
        }
      }));

      removers.push(ipcClient.onCommandReview(data => {
        setCommandReviews(current => [
          ...current.filter(review => review.requestId !== data.requestId),
          data,
        ]);
        setStatus('Approval needed');
        if (!isAutomationScopedToolEvent(data)) {
          appendMessage(createMessage('system', `Review requested for command: ${data.command}`, {
            title: 'Command approval',
          }));
        }
      }));

      removers.push(ipcClient.onToolPermissionReview(data => {
        setToolPermissionReviews(current => [
          ...current.filter(review => review.requestId !== data.requestId),
          data,
        ]);
        setStatus('Approval needed');
        if (!isAutomationScopedToolEvent(data)) {
          appendMessage(createMessage('system', `Review requested for tool: ${data.toolName}`, {
            title: 'Tool permission',
          }));
        }
      }));

      removers.push(ipcClient.onToolApprovalResolved(data => {
        setFileWriteReviews(current => current.filter(review => review.requestId !== data.requestId));
        setCommandReviews(current => current.filter(review => review.requestId !== data.requestId));
        setToolPermissionReviews(current => current.filter(review => review.requestId !== data.requestId));
        setStatus('Ready');
        if (!isAutomationScopedToolEvent(data)) {
          appendMessage(createMessage('system', `${data.approved ? 'Approved' : 'Rejected'} by ${data.resolvedBy}: ${data.title ?? data.requestId}`, {
            title: 'Remote approval resolved',
          }));
        }
        inputRef.current?.focus();
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
        createSessionSnapshot(
          currentSessionId,
          messages,
          appInfo?.workspacePath,
          previous,
          chatToolWorkspacePath || null,
          chatContextAttachments,
        ),
      );
    });
  }, [messages, currentSessionId, appInfo?.workspacePath, chatToolWorkspacePath, chatContextAttachments]);

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

      if (activeSession && isMeaningfulChatSession(activeSession)) {
        ipcClient.history.saveRecord({
          id: `${CHAT_SESSION_HISTORY_ID_PREFIX}${activeSession.id}`,
          type: 'chat-session',
          workspacePath: activeSession.toolWorkspacePath ?? activeSession.workspacePath ?? appInfo?.workspacePath,
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
    if (!hasHydratedProjectsRef.current || !hasHydratedRolesRef.current || !hasHydratedEmployeesRef.current || !hasHydratedProjectTeamsRef.current || !hasHydratedProjectChatsRef.current || !hasHydratedProjectOutputsRef.current) {
      return;
    }

    const timeout = window.setTimeout(() => {
      ipcClient.app.setState({
        [DESKTOP_PROJECTS_STATE_KEY]: {
          activeProjectId: activeSoftwareProjectId,
          projects: softwareProjects,
        },
        [DESKTOP_ROLES_STATE_KEY]: {
          roles: virtualRoles,
        },
        [DESKTOP_EMPLOYEES_STATE_KEY]: {
          employees: virtualEmployees,
        },
        [DESKTOP_PROJECT_TEAMS_STATE_KEY]: {
          teams: projectTeams,
        },
        [DESKTOP_PROJECT_CHATS_STATE_KEY]: serializeProjectChats(projectChatMessages),
        [DESKTOP_PROJECT_OUTPUTS_STATE_KEY]: serializeProjectOutputs(projectGeneratedOutputs),
      }).catch(error => {
        console.warn('Failed to persist desktop project state:', error);
      });
    }, 500);

    return () => window.clearTimeout(timeout);
  }, [softwareProjects, activeSoftwareProjectId, virtualRoles, virtualEmployees, projectTeams, projectChatMessages, projectGeneratedOutputs]);

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
      const restoredProjects = restoreSoftwareProjectsFromState(state, info.workspacePath);
      const restoredRoles = restoreVirtualRolesFromState(state);
      const restoredEmployees = restoreVirtualEmployeesFromState(state);
      const restoredProjectTeams = restoreProjectTeamsFromState(state);
      const restoredProjectChats = restoreProjectChatsFromState(state);
      const restoredProjectOutputs = restoreProjectOutputsFromState(state);
      setSoftwareProjects(restoredProjects.projects);
      setActiveSoftwareProjectId(restoredProjects.activeProjectId);
      setVirtualRoles(restoredRoles);
      setVirtualEmployees(restoredEmployees);
      setProjectTeams(restoredProjectTeams);
      setProjectChatMessages(restoredProjectChats);
      setProjectGeneratedOutputs(restoredProjectOutputs);
      setSessions(restoredSessions.sessions);
      setCurrentSessionId(restoredSessions.currentSessionId);
      setMessages(activeSession?.messages ?? createReadyMessages());
      setChatToolWorkspacePath(activeSession?.toolWorkspacePath ?? '');
      setChatContextAttachments(activeSession?.contextAttachments ?? []);
      hasHydratedSessionsRef.current = true;
      hasHydratedProjectsRef.current = true;
      hasHydratedRolesRef.current = true;
      hasHydratedEmployeesRef.current = true;
      hasHydratedProjectTeamsRef.current = true;
      hasHydratedProjectChatsRef.current = true;
      hasHydratedProjectOutputsRef.current = true;
      setStatus('Ready');
      void syncPlatformStateFromConfig(config, { reason: 'startup', silent: true });
    } catch (error) {
      console.error('Failed to initialize app:', error);
      hasHydratedSessionsRef.current = true;
      hasHydratedProjectsRef.current = true;
      hasHydratedRolesRef.current = true;
      hasHydratedEmployeesRef.current = true;
      hasHydratedProjectTeamsRef.current = true;
      hasHydratedProjectChatsRef.current = true;
      hasHydratedProjectOutputsRef.current = true;
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
        ? upsertSession(
          current,
          createSessionSnapshot(
            currentSessionId,
            messages,
            appInfo?.workspacePath,
            previous,
            chatToolWorkspacePath || null,
            chatContextAttachments,
          ),
        )
        : current;
      return upsertSession(withCurrent, nextSession);
    });
    setCurrentSessionId(nextSession.id);
    setMessages(nextSession.messages);
    setChatToolWorkspacePath(nextSession.toolWorkspacePath ?? '');
    setChatContextAttachments(nextSession.contextAttachments ?? []);
    setChatImageAttachments([]);
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
    setChatToolWorkspacePath(session.toolWorkspacePath ?? '');
    setChatContextAttachments(session.contextAttachments ?? []);
    setChatImageAttachments([]);
    setInput('');
    setStatus('Ready');
    setActiveView('chat');
    inputRef.current?.focus();
  }

  function saveSoftwareProjectPlan(project: SoftwareProjectPlan) {
    const availableSupervisor = virtualEmployees.find(employee => employee.id === project.supervisorEmployeeId)
      ?? virtualEmployees.find(employee => isSupervisorEmployee(employee, virtualRoles))
      ?? virtualEmployees[0];
    const assignedEmployeeIds = normalizeStringList(
      project.assignedEmployeeIds,
      virtualEmployees
        .filter(employee => employee.id !== availableSupervisor?.id)
        .slice(0, 4)
        .map(employee => employee.id),
    ).filter(id => id !== availableSupervisor?.id);
    const assignedTeamIds = normalizeStringList(project.assignedTeamIds, [])
      .filter(id => projectTeams.some(team => team.id === id));
    const sanitized = sanitizeSoftwareProjectPlan({
      ...project,
      name: project.name.trim() || 'Untitled software project',
      idea: project.idea.trim(),
      goals: project.goals.trim(),
      artifacts: normalizeStringList(project.artifacts, DEFAULT_PROJECT_ARTIFACTS),
      teamRoles: normalizeStringList(project.teamRoles, DEFAULT_AUTONOMOUS_ROLES),
      supervisorEmployeeId: availableSupervisor?.id ?? project.supervisorEmployeeId,
      supervisorRole: availableSupervisor
        ? getEmployeeRoleDefinition(availableSupervisor, virtualRoles)?.title ?? availableSupervisor.role
        : project.supervisorRole,
      assignedEmployeeIds,
      assignedTeamIds,
      workspacePath: project.workspacePath || appInfo?.workspacePath,
      updatedAt: Date.now(),
    }, appInfo?.workspacePath);

    if (!sanitized) {
      setProjectActionMessage('Project could not be saved.');
      return;
    }

    setSoftwareProjects(current => upsertSoftwareProjectPlan(current, sanitized));
    setActiveSoftwareProjectId(sanitized.id);
    setProjectActionMessage(`Saved project "${sanitized.name}".`);
  }

  function saveVirtualRoleDefinition(role: VirtualRoleDefinition) {
    const sanitized = sanitizeVirtualRole({
      ...role,
      title: role.title.trim() || 'Contributor',
      responsibilities: normalizeStringList(role.responsibilities, ['Deliver assigned project responsibilities.']),
      defaultTools: normalizeStringList(role.defaultTools, getDefaultTeamTools(role.title)),
      updatedAt: Date.now(),
    });

    if (!sanitized) {
      setProjectActionMessage('Role could not be saved.');
      return;
    }

    setVirtualRoles(current => upsertVirtualRole(current, sanitized));
    setVirtualEmployees(current => current.map(employee => (
      employee.roleId === sanitized.id
        ? { ...employee, role: sanitized.title, updatedAt: Date.now() }
        : employee
    )));
    setSoftwareProjects(current => current.map(project => {
      const supervisor = virtualEmployees.find(employee => employee.id === project.supervisorEmployeeId);
      const assignedEmployees = virtualEmployees.filter(employee => project.assignedEmployeeIds.includes(employee.id));
      const assignedTeams = getProjectTeams(project, projectTeams);
      const nextRoles = upsertVirtualRole(virtualRoles, sanitized);
      return {
        ...project,
        supervisorRole: supervisor
          ? getEmployeeRoleDefinition(
              supervisor.roleId === sanitized.id ? { ...supervisor, role: sanitized.title } : supervisor,
              nextRoles,
            )?.title ?? project.supervisorRole
          : project.supervisorRole,
        teamRoles: [
          ...assignedTeams.map(team => team.name),
          ...assignedEmployees.map(employee => (
            getEmployeeRoleDefinition(
              employee.roleId === sanitized.id ? { ...employee, role: sanitized.title } : employee,
              nextRoles,
            )?.title ?? employee.role
          )),
        ],
        updatedAt: Date.now(),
      };
    }));
    setProjectActionMessage(`Saved role "${sanitized.title}".`);
  }

  function deleteVirtualRoleDefinition(roleId: string) {
    const remainingRoles = virtualRoles.filter(role => role.id !== roleId);
    const fallback = remainingRoles.find(role => role.id === 'role-developer')
      ?? remainingRoles[0]
      ?? createVirtualRoleDefinition('Developer');
    const nextRoles = remainingRoles.length > 0 ? remainingRoles : [fallback];
    const nextEmployees = virtualEmployees.map(employee => (
      employee.roleId === roleId
        ? { ...employee, roleId: fallback.id, role: fallback.title, updatedAt: Date.now() }
        : employee
    ));

    setVirtualRoles(nextRoles);
    setVirtualEmployees(nextEmployees);
    setSoftwareProjects(current => current.map(project => {
      const supervisor = nextEmployees.find(employee => employee.id === project.supervisorEmployeeId);
      const assignedEmployees = nextEmployees.filter(employee => project.assignedEmployeeIds.includes(employee.id));
      const assignedTeams = getProjectTeams(project, projectTeams);
      return {
        ...project,
        supervisorRole: supervisor ? getEmployeeRoleDefinition(supervisor, nextRoles)?.title ?? supervisor.role : project.supervisorRole,
        teamRoles: [
          ...assignedTeams.map(team => team.name),
          ...assignedEmployees.map(employee => getEmployeeRoleDefinition(employee, nextRoles)?.title ?? employee.role),
        ],
        updatedAt: Date.now(),
      };
    }));
    setProjectActionMessage('Deleted role and reassigned affected employees.');
  }

  function saveVirtualEmployeeProfile(employee: VirtualEmployeeProfile) {
    const role = getRoleDefinitionById(virtualRoles, employee.roleId, employee.role);
    const sanitized = sanitizeVirtualEmployee({
      ...employee,
      name: employee.name.trim() || 'Employee',
      roleId: role?.id ?? employee.roleId,
      role: role?.title ?? (employee.role.trim() || 'Contributor'),
      permissions: normalizeStringList(employee.permissions, DEFAULT_EMPLOYEE_PERMISSIONS),
      updatedAt: Date.now(),
    });

    if (!sanitized) {
      setProjectActionMessage('Employee could not be saved.');
      return;
    }

    setVirtualEmployees(current => upsertVirtualEmployee(current, sanitized));
    setSoftwareProjects(current => current.map(project => {
      if (project.supervisorEmployeeId !== sanitized.id && !project.assignedEmployeeIds.includes(sanitized.id)) {
        return project;
      }
      const nextAssignedEmployees = virtualEmployees
        .map(employee => employee.id === sanitized.id ? sanitized : employee)
        .filter(employee => project.assignedEmployeeIds.includes(employee.id));
      const assignedTeams = getProjectTeams(project, projectTeams);
      return {
        ...project,
        supervisorRole: project.supervisorEmployeeId === sanitized.id
          ? getEmployeeRoleDefinition(sanitized, virtualRoles)?.title ?? sanitized.role
          : project.supervisorRole,
        teamRoles: [
          ...assignedTeams.map(team => team.name),
          ...nextAssignedEmployees.map(employee => getEmployeeRoleDefinition(employee, virtualRoles)?.title ?? employee.role),
        ],
        updatedAt: Date.now(),
      };
    }));
    setProjectActionMessage(`Saved employee "${sanitized.name}".`);
  }

  function saveProjectTeamDefinition(team: ProjectTeamDefinition) {
    const supervisor = virtualEmployees.find(employee => employee.id === team.supervisorEmployeeId)
      ?? virtualEmployees.find(employee => isSupervisorEmployee(employee, virtualRoles))
      ?? virtualEmployees[0];
    const sanitized = sanitizeProjectTeam({
      ...team,
      name: team.name.trim() || 'Project team',
      mission: team.mission.trim() || 'Deliver a scoped portion of the project mission.',
      supervisorEmployeeId: supervisor?.id ?? team.supervisorEmployeeId,
      memberEmployeeIds: normalizeStringList(team.memberEmployeeIds, [])
        .filter(id => id !== supervisor?.id && virtualEmployees.some(employee => employee.id === id)),
      updatedAt: Date.now(),
    });

    if (!sanitized) {
      setProjectActionMessage('Team could not be saved.');
      return;
    }

    setProjectTeams(current => upsertProjectTeam(current, sanitized));
    setSoftwareProjects(current => current.map(project => {
      if (!project.assignedTeamIds.includes(sanitized.id)) {
        return project;
      }
      const nextTeams = upsertProjectTeam(projectTeams, sanitized);
      const assignedTeams = getProjectTeams(project, nextTeams);
      const assignedEmployees = virtualEmployees.filter(employee => project.assignedEmployeeIds.includes(employee.id));
      return {
        ...project,
        teamRoles: [
          ...assignedTeams.map(team => team.name),
          ...assignedEmployees.map(employee => getEmployeeRoleDefinition(employee, virtualRoles)?.title ?? employee.role),
        ],
        updatedAt: Date.now(),
      };
    }));
    setProjectActionMessage(`Saved team "${sanitized.name}".`);
  }

  function deleteProjectTeamDefinition(teamId: string) {
    const deletedTeam = projectTeams.find(team => team.id === teamId);
    setProjectTeams(current => current.filter(team => team.id !== teamId));
    setSoftwareProjects(current => current.map(project => (
      project.assignedTeamIds.includes(teamId)
        ? {
            ...project,
            assignedTeamIds: project.assignedTeamIds.filter(id => id !== teamId),
            teamRoles: deletedTeam ? project.teamRoles.filter(role => role !== deletedTeam.name) : project.teamRoles,
            updatedAt: Date.now(),
          }
        : project
    )));
    setProjectActionMessage('Deleted team.');
  }

  function deleteVirtualEmployeeProfile(employeeId: string) {
    setVirtualEmployees(current => current.filter(employee => employee.id !== employeeId));
    setProjectTeams(current => current.map(team => {
      if (team.supervisorEmployeeId === employeeId) {
        const replacement = virtualEmployees.find(employee => employee.id !== employeeId && isSupervisorEmployee(employee, virtualRoles))
          ?? virtualEmployees.find(employee => employee.id !== employeeId);
        return {
          ...team,
          supervisorEmployeeId: replacement?.id ?? '',
          memberEmployeeIds: team.memberEmployeeIds.filter(id => id !== employeeId && id !== replacement?.id),
          updatedAt: Date.now(),
        };
      }
      return {
        ...team,
        memberEmployeeIds: team.memberEmployeeIds.filter(id => id !== employeeId),
        updatedAt: Date.now(),
      };
    }));
    setSoftwareProjects(current => current.map(project => {
      const assignedTeams = getProjectTeams(project, projectTeams);
      const remainingAssignedEmployees = virtualEmployees
        .filter(employee => employee.id !== employeeId && project.assignedEmployeeIds.includes(employee.id));
      if (project.supervisorEmployeeId === employeeId) {
        const replacement = virtualEmployees.find(employee => employee.id !== employeeId && isSupervisorEmployee(employee, virtualRoles))
          ?? virtualEmployees.find(employee => employee.id !== employeeId);
        return {
          ...project,
          supervisorEmployeeId: replacement?.id ?? '',
          supervisorRole: replacement
            ? getEmployeeRoleDefinition(replacement, virtualRoles)?.title ?? replacement.role
            : 'Supervisor',
          assignedEmployeeIds: project.assignedEmployeeIds.filter(id => id !== employeeId),
          teamRoles: [
            ...assignedTeams.map(team => team.name),
            ...remainingAssignedEmployees.map(employee => getEmployeeRoleDefinition(employee, virtualRoles)?.title ?? employee.role),
          ],
          updatedAt: Date.now(),
        };
      }
      return {
        ...project,
        assignedEmployeeIds: project.assignedEmployeeIds.filter(id => id !== employeeId),
        teamRoles: [
          ...assignedTeams.map(team => team.name),
          ...remainingAssignedEmployees.map(employee => getEmployeeRoleDefinition(employee, virtualRoles)?.title ?? employee.role),
        ],
        updatedAt: Date.now(),
      };
    }));
    setProjectActionMessage('Deleted employee.');
  }

  function deleteSoftwareProjectPlan(projectId: string) {
    setSoftwareProjects(current => {
      const next = current.filter(project => project.id !== projectId);
      if (activeSoftwareProjectId === projectId) {
        setActiveSoftwareProjectId(next[0]?.id ?? '');
      }
      return next;
    });
    setProjectChatMessages(current => Object.entries(current).reduce<Record<string, UiMessage[]>>((next, [key, messages]) => {
      if (!key.startsWith(`${projectId}:`)) {
        next[key] = messages;
      }
      return next;
    }, {}));
    setProjectGeneratedOutputs(current => Object.entries(current).reduce<Record<string, ProjectGeneratedOutput[]>>((next, [key, outputs]) => {
      if (key !== projectId) {
        next[key] = outputs;
      }
      return next;
    }, {}));
    setProjectActionMessage('Deleted project.');
  }

  function appendProjectChatMessages(project: SoftwareProjectPlan, channel: ProjectChatChannel, nextMessages: UiMessage[]) {
    const projectChatKey = getProjectChatKey(project.id, channel);
    setProjectChatMessages(current => ({
      ...current,
      [projectChatKey]: [
        ...(current[projectChatKey] ?? createProjectReadyMessages(project, channel)),
        ...nextMessages,
      ].slice(-MAX_PERSISTED_MESSAGES),
    }));
  }

  function recordProjectGeneratedOutput(data: ToolResultMessage, toolName: string) {
    const projectId = data.scope?.projectId;
    if (!projectId) {
      return;
    }

    const pathValue = getToolResultDataPath(toolName, data.data);
    if (!pathValue) {
      return;
    }

    const absolutePath = data.data && typeof data.data === 'object' && typeof (data.data as { absolutePath?: unknown }).absolutePath === 'string'
      ? String((data.data as { absolutePath?: unknown }).absolutePath)
      : undefined;
    const now = data.timestamp || Date.now();
    const source: ProjectGeneratedOutput['source'] = data.scope.source === 'virtual-team'
      ? 'automation'
      : data.scope.source === 'project-chat'
        ? data.scope.channel === 'team' ? 'team-chat' : 'guided-chat'
        : 'tool';
    const output: ProjectGeneratedOutput = {
      id: `${projectId}:${absolutePath || pathValue}`,
      projectId,
      path: pathValue,
      absolutePath,
      toolName,
      source,
      summary: summarizeToolResult(data.data),
      createdAt: now,
      updatedAt: now,
    };

    setProjectGeneratedOutputs(current => {
      const existing = current[projectId] ?? [];
      const nextOutputs = [
        output,
        ...existing.filter(candidate => (
          candidate.id !== output.id &&
          candidate.path !== output.path &&
          (!candidate.absolutePath || !output.absolutePath || candidate.absolutePath !== output.absolutePath)
        )),
      ]
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, 120);

      return {
        ...current,
        [projectId]: nextOutputs,
      };
    });
  }

  function createProjectAutomationTeam(project: SoftwareProjectPlan): Partial<VirtualTeamBlueprint> {
    const supervisor = getProjectSupervisor(project, virtualEmployees, virtualRoles);
    const staffing = getProjectStaffingEmployees(project, virtualEmployees, virtualRoles, projectTeams);
    const members = uniqueEmployees([
      ...(supervisor ? [supervisor] : []),
      ...staffing,
    ]).map((employee): VirtualTeamMember => {
      const role = getEmployeeRoleDefinition(employee, virtualRoles);
      const roleTitle = role?.title ?? employee.role;
      return {
        id: employee.id,
        name: employee.name,
        role: roleTitle,
        goal: employee.currentTask || role?.defaultGoal || `Contribute ${roleTitle} work for "${project.name}".`,
        model: employee.model || undefined,
        tools: normalizeStringList(role?.defaultTools ?? employee.permissions, ['filesystem', 'bash', 'review']),
      };
    });

    return {
      id: getProjectAutomationTeamId(project.id),
      name: `${project.name} autonomous team`,
      objective: formatProjectPrompt(project, virtualEmployees, virtualRoles, projectTeams),
      workspacePath: project.workspacePath ?? workspacePath,
      permissionMode: project.permissionMode,
      maxIterations: 1,
      requireQaSignoff: false,
      supervisorId: supervisor?.id ?? members[0]?.id ?? 'supervisor',
      members,
      status: 'active',
    };
  }

  async function saveProjectEvent(project: SoftwareProjectPlan, event: string, title: string, data: Record<string, any> = {}) {
    try {
      await ipcClient.history.saveRecord({
        id: `project-${project.id}-${event}-${Date.now()}`,
        type: 'project-event',
        workspacePath: project.workspacePath ?? workspacePath,
        title,
        data: {
          event,
          projectId: project.id,
          projectName: project.name,
          ...data,
        },
      });
      await refreshHistoryData();
    } catch (error) {
      console.warn('Failed to save project event:', error);
    }
  }

  async function startAutonomousProjectRun(project: SoftwareProjectPlan) {
    if (runningProjectIdsRef.current.has(project.id)) {
      return;
    }

    stoppedProjectIdsRef.current.delete(project.id);
    const automationTeamId = getProjectAutomationTeamId(project.id);
    runningProjectIdsRef.current.add(project.id);
    setRunningProjectIds(current => new Set(current).add(project.id));
    setRunningTeamIds(current => new Set(current).add(automationTeamId));

    appendProjectChatMessages(project, 'team', [
      createMessage('system', `Started autonomous project "${project.name}".`, {
        title: 'Project Lifecycle',
      }),
      createMessage('assistant', 'I am launching the assigned team and will report execution progress here.', {
        title: getProjectSupervisor(project, virtualEmployees, virtualRoles)?.name ?? 'Supervisor',
      }),
    ]);
    setProjectActionMessage(`Started autonomous project "${project.name}".`);
    await saveProjectEvent(project, 'project-started', `Started autonomous project: ${project.name}`, {
      status: 'active',
      automationTeamId,
    });

    try {
      const team = await ipcClient.automation.saveTeam(createProjectAutomationTeam(project));
      await refreshAutomationData();
      const runPromise = ipcClient.automation.runTeam(team.id);
      const pollTimer = window.setInterval(() => {
        void refreshAutomationData();
      }, 2_000);
      const run = await runPromise.finally(() => {
        window.clearInterval(pollTimer);
      });
      await refreshAutomationData();
      await refreshHistoryData();

      if (run.status === 'running') {
        if (isAutonomousProjectStopped(project.id)) {
          return;
        }

        appendProjectChatMessages(project, 'team', [
          createMessage('system', `Automation run ${run.id} is already running.`, {
            title: 'Automation',
          }),
        ]);
        setProjectActionMessage(`Autonomous project "${project.name}" is running.`);
        await saveProjectEvent(project, 'project-run-running', `${project.name}: running`, {
          status: 'active',
          automationTeamId: team.id,
          runId: run.id,
          runStatus: run.status,
        });
        return;
      }

      if (isAutonomousProjectStopped(project.id)) {
        await saveProjectEvent(project, 'project-run-finished-while-stopped', `${project.name}: run finished while stopped`, {
          status: 'stopped',
          automationTeamId: team.id,
          runId: run.id,
          runStatus: run.status,
          summary: run.summary,
          error: run.error,
          artifactPath: run.artifactPath,
        });
        return;
      }

      const succeeded = run.status === 'succeeded';
      const nextStatus: SoftwareProjectStatus = succeeded ? 'done' : 'blocked';
      setSoftwareProjects(current => current.map(candidate => (
        candidate.id === project.id
          ? { ...candidate, status: nextStatus, updatedAt: Date.now() }
          : candidate
      )));

      appendProjectChatMessages(project, 'team', [
        createMessage(succeeded ? 'assistant' : 'error', run.summary ?? run.error ?? `Automation run ${run.status}.`, {
          title: succeeded ? 'Run Complete' : 'Run Failed',
          status: succeeded ? 'sent' : 'failed',
        }),
      ]);
      setProjectActionMessage(`Autonomous project "${project.name}" ${succeeded ? 'completed' : 'blocked'}.`);
      await saveProjectEvent(project, succeeded ? 'project-completed' : 'project-blocked', `${project.name}: ${succeeded ? 'completed' : 'blocked'}`, {
        status: nextStatus,
        automationTeamId: team.id,
        runId: run.id,
        runStatus: run.status,
        summary: run.summary,
        error: run.error,
        artifactPath: run.artifactPath,
      });
    } catch (error) {
      const message = formatDesktopError(error);
      if (isAutonomousProjectStopped(project.id)) {
        await saveProjectEvent(project, 'project-run-error-while-stopped', `${project.name}: run error while stopped`, {
          status: 'stopped',
          automationTeamId,
          error: message,
        });
        return;
      }

      setSoftwareProjects(current => current.map(candidate => (
        candidate.id === project.id
          ? { ...candidate, status: 'blocked', updatedAt: Date.now() }
          : candidate
      )));
      appendProjectChatMessages(project, 'team', [
        createMessage('error', message, {
          title: 'Run Failed',
          status: 'failed',
        }),
      ]);
      setProjectActionMessage(message);
      await saveProjectEvent(project, 'project-blocked', `${project.name}: blocked`, {
        status: 'blocked',
        automationTeamId,
        error: message,
      });
    } finally {
      runningProjectIdsRef.current.delete(project.id);
      setRunningProjectIds(current => {
        const next = new Set(current);
        next.delete(project.id);
        return next;
      });
      setRunningTeamIds(current => {
        const next = new Set(current);
        next.delete(automationTeamId);
        return next;
      });
    }
  }

  function isAutonomousProjectStopped(projectId: string): boolean {
    return stoppedProjectIdsRef.current.has(projectId)
      || softwareProjectsRef.current.find(candidate => candidate.id === projectId)?.status === 'stopped';
  }

  function markSoftwareProjectStatus(projectId: string, status: SoftwareProjectStatus) {
    const project = softwareProjects.find(candidate => candidate.id === projectId);
    if (!project) {
      return;
    }

    if (project.mode === 'autonomous') {
      if (status === 'stopped') {
        stoppedProjectIdsRef.current.add(project.id);
        const automationTeamId = getProjectAutomationTeamId(project.id);
        runningProjectIdsRef.current.delete(project.id);
        setRunningProjectIds(current => {
          const next = new Set(current);
          next.delete(project.id);
          return next;
        });
        setRunningTeamIds(current => {
          const next = new Set(current);
          next.delete(automationTeamId);
          return next;
        });
      } else {
        stoppedProjectIdsRef.current.delete(project.id);
      }
    }

    setSoftwareProjects(current => current.map(project => (
      project.id === projectId
        ? { ...project, status, updatedAt: Date.now() }
        : project
    )));

    if (project.mode === 'autonomous' && status === 'active') {
      void startAutonomousProjectRun({ ...project, status, updatedAt: Date.now() });
      return;
    }

    appendProjectChatMessages(project, project.mode === 'autonomous' ? 'team' : 'guided', [
      createMessage('system', `Set "${project.name}" to ${formatProjectStatus(status).toLowerCase()}.`, {
        title: 'Project Lifecycle',
      }),
    ]);
    void saveProjectEvent(project, `project-${status}`, `${project.name}: ${formatProjectStatus(status)}`, {
      status,
    });
    setProjectActionMessage(`Set "${project.name}" to ${formatProjectStatus(status).toLowerCase()}.`);
  }

  function recordToolStart(data: ToolStartMessage) {
    toolActivityNamesRef.current.set(data.toolId, data.toolName);
    const activity: ToolActivity = {
      id: data.toolId,
      toolName: data.toolName,
      args: data.args || {},
      status: 'running',
      startedAt: data.timestamp,
      scope: data.scope,
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
    recordProjectGeneratedOutput(data, toolActivityNamesRef.current.get(data.toolId) ?? 'Tool');
    updateToolActivity(data.toolId, {
      resultPreview: summarizeToolResult(data.data),
      result: data.data,
      scope: data.scope,
    });
  }

  function recordToolComplete(data: ToolCompleteMessage) {
    toolActivityNamesRef.current.delete(data.toolId);
    updateToolActivity(data.toolId, {
      status: data.success ? 'succeeded' : 'failed',
      duration: data.duration,
      completedAt: Date.now(),
      scope: data.scope,
    });
  }

  function recordToolError(data: ToolErrorMessage) {
    toolActivityNamesRef.current.delete(data.toolId);
    updateToolActivity(data.toolId, {
      status: 'failed',
      error: data.error,
      completedAt: Date.now(),
      scope: data.scope,
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
    const deletedRecord = historyRecords.find(record => record.id === recordId);
    try {
      await ipcClient.history.deleteRecord(recordId);
      const removedFromRecents = removeDeletedChatSession(recordId, deletedRecord);
      await refreshHistoryData();
      setHistoryMessage(removedFromRecents
        ? 'Deleted chat history and removed it from Recents.'
        : 'Deleted history record.');
    } catch (error) {
      setHistoryMessage(formatDesktopError(error));
    }
  }

  function removeDeletedChatSession(recordId: string, record?: LocalHistoryRecord): boolean {
    const deletedSessionId = getChatSessionIdFromHistoryRecord(recordId, record);
    if (!deletedSessionId || !sessions.some(session => session.id === deletedSessionId)) {
      return false;
    }

    const remainingSessions = sortSessions(sessions.filter(session => session.id !== deletedSessionId));
    const nextSessions = remainingSessions.length > 0
      ? remainingSessions
      : [createEmptySession(appInfo?.workspacePath)];
    const shouldSwitchActiveSession = currentSessionId === deletedSessionId
      || !nextSessions.some(session => session.id === currentSessionId);
    const nextActiveSession = shouldSwitchActiveSession
      ? nextSessions[0]
      : sessions.find(session => session.id === currentSessionId);

    setSessions(nextSessions);
    if (shouldSwitchActiveSession && nextActiveSession) {
      setCurrentSessionId(nextActiveSession.id);
      setMessages(nextActiveSession.messages);
      setChatToolWorkspacePath(nextActiveSession.toolWorkspacePath ?? '');
      setChatContextAttachments(nextActiveSession.contextAttachments ?? []);
      setChatImageAttachments([]);
      setInput('');
      setStatus('Ready');
    }

    return true;
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
    setChatToolWorkspacePath(session.toolWorkspacePath ?? '');
    setChatContextAttachments(session.contextAttachments ?? []);
    setChatImageAttachments([]);
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

  async function chooseChatToolWorkspaceFolder() {
    try {
      const result = await ipcClient.fs.selectFolder(chatToolWorkspacePath || appInfo?.workspacePath || undefined);
      if (result.canceled || !result.path) {
        return;
      }

      setChatToolWorkspacePath(normalizeWorkspacePath(result.path));
      setStatus('Guided project folder set');
      inputRef.current?.focus();
    } catch (error) {
      appendMessage(createMessage('error', formatDesktopError(error), {
        title: 'Folder selection failed',
        status: 'failed',
      }));
      setStatus('Error');
    }
  }

  function clearChatToolWorkspaceFolder() {
    setChatToolWorkspacePath('');
    setStatus('Chat only');
    inputRef.current?.focus();
  }

  async function chooseChatContextAttachments() {
    try {
      const result = await ipcClient.fs.selectPaths(chatToolWorkspacePath || appInfo?.workspacePath || undefined);
      if (result.canceled || !result.paths || result.paths.length === 0) {
        return;
      }

      setChatContextAttachments(current => mergeContextAttachments(current, result.paths ?? []));
      setStatus(`Added ${result.paths.length} context item${result.paths.length === 1 ? '' : 's'}`);
      inputRef.current?.focus();
    } catch (error) {
      appendMessage(createMessage('error', formatDesktopError(error), {
        title: 'Context selection failed',
        status: 'failed',
      }));
      setStatus('Error');
    }
  }

  function removeChatContextAttachment(attachmentPath: string) {
    setChatContextAttachments(current => current.filter(attachment => attachment.path !== attachmentPath));
    setStatus('Context removed');
    inputRef.current?.focus();
  }

  function clearChatContextAttachments() {
    setChatContextAttachments([]);
    setStatus('Context cleared');
    inputRef.current?.focus();
  }

  async function buildAttachedContextPrompt(): Promise<string> {
    if (chatContextAttachments.length === 0) {
      return '';
    }

    const result = await ipcClient.fs.readContext({
      paths: chatContextAttachments.map(attachment => attachment.path),
      maxFiles: CHAT_CONTEXT_MAX_FILES,
      maxBytes: CHAT_CONTEXT_MAX_BYTES,
      maxFileBytes: CHAT_CONTEXT_MAX_FILE_BYTES,
    });

    return formatAttachedContext(result);
  }

  async function addChatImages(files: File[]) {
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      return;
    }

    const availableSlots = CHAT_IMAGE_MAX_COUNT - chatImageAttachments.length;
    if (availableSlots <= 0) {
      setStatus(`Image limit reached (${CHAT_IMAGE_MAX_COUNT})`);
      return;
    }

    try {
      const nextImages = await Promise.all(imageFiles.slice(0, availableSlots).map(file => createChatImageAttachment(file)));
      setChatImageAttachments(current => [...current, ...nextImages].slice(0, CHAT_IMAGE_MAX_COUNT));
      const skipped = imageFiles.length - nextImages.length;
      setStatus(skipped > 0
        ? `Added ${nextImages.length} image(s), skipped ${skipped} over the limit`
        : `Added ${nextImages.length} image${nextImages.length === 1 ? '' : 's'}`);
      inputRef.current?.focus();
    } catch (error) {
      appendMessage(createMessage('error', formatDesktopError(error), {
        title: 'Image paste failed',
        status: 'failed',
      }));
      setStatus('Error');
    }
  }

  function handleComposerPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files)
      .filter(file => file.type.startsWith('image/'));
    const itemFiles = Array.from(event.clipboardData.items)
      .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    const imageFiles = [...files, ...itemFiles].filter((file, index, all) => (
      all.findIndex(candidate => candidate.name === file.name && candidate.size === file.size && candidate.type === file.type) === index
    ));

    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    void addChatImages(imageFiles);
  }

  function removeChatImageAttachment(imageId: string) {
    setChatImageAttachments(current => current.filter(image => image.id !== imageId));
    setStatus('Image removed');
    inputRef.current?.focus();
  }

  function clearChatImageAttachments() {
    setChatImageAttachments([]);
    setStatus('Images cleared');
    inputRef.current?.focus();
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
    const imagesForRequest = [...chatImageAttachments];
    if ((!prompt && imagesForRequest.length === 0) || isSending) {
      return;
    }

    const displayPrompt = prompt || `Please analyze the attached image${imagesForRequest.length === 1 ? '' : 's'}.`;
    setInput('');
    setChatImageAttachments([]);
    setIsSending(true);

    const userMessage = createMessage('user', displayPrompt, {
      imageAttachments: imagesForRequest,
    });
    setMessages(current => [...current, userMessage]);
    let pendingStreamRequestId: string | null = null;

    try {
      if (imagesForRequest.length === 0 && await handleCommand(prompt)) {
        setStatus('Ready');
        return;
      }

      setStatus('Streaming');
      const attachedContextPrompt = await buildAttachedContextPrompt();
      const requestPrompt = attachedContextPrompt
        ? `${attachedContextPrompt}\n\nHuman message:\n${displayPrompt}`
        : displayPrompt;
      const requestContent = buildMultimodalChatContent(requestPrompt, imagesForRequest);
      const requestId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      pendingStreamRequestId = requestId;
      const activeProvider = appConfig?.llmProvider || DEFAULT_PROVIDER;
      const activeProviderDefault = getProviderDefault(activeProvider);
      const assistantMessage = createMessage('assistant', '', {
        title: `${activeProviderDefault.label} / ${appConfig?.model || activeProviderDefault.model}`,
        status: 'sending',
      });

      streamMessageIds.current.set(requestId, { scope: 'main', messageId: assistantMessage.id });
      appendMessage(assistantMessage);
      const scopedWorkspacePath = chatToolWorkspacePath.trim();
      const chatToolScope: ToolEventScope | undefined = scopedWorkspacePath
        ? {
          source: 'project-chat',
          workspacePath: scopedWorkspacePath,
          projectId: `ad-hoc-${currentSessionId}`,
          projectName: getPathBasename(scopedWorkspacePath),
          projectChatKey: `main:${currentSessionId}`,
          channel: 'guided',
        }
        : undefined;

      await ipcClient.api.chatStream({
        requestId,
        messages: getChatMessages(messages, requestContent),
        provider: activeProvider,
        baseUrl: appConfig?.baseUrl || activeProviderDefault.baseUrl,
        model: appConfig?.model || activeProviderDefault.model,
        maxTokens: Number(appConfig?.maxTokens ?? activeProviderDefault.maxTokens),
        contextTokens: Number(appConfig?.contextTokens ?? activeProviderDefault.contextTokens),
        enableTools: Boolean(chatToolScope),
        maxToolRounds: chatToolScope ? 12 : 0,
        toolScope: chatToolScope,
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
      if (!pendingStreamRequestId || !streamMessageIds.current.has(pendingStreamRequestId)) {
        setIsSending(false);
        inputRef.current?.focus();
      }
    }
  }

  async function submitProjectPrompt(project: SoftwareProjectPlan, channel: ProjectChatChannel, prompt: string) {
    const trimmedPrompt = prompt.trim();
    const projectChatKey = getProjectChatKey(project.id, channel);
    if (!trimmedPrompt || projectChatSendingKeys.has(projectChatKey)) {
      return;
    }

    const currentMessages = projectChatMessages[projectChatKey] ?? createProjectReadyMessages(project, channel);
    const userMessage = createMessage('user', trimmedPrompt, { title: 'Human' });
    const activeProvider = appConfig?.llmProvider || DEFAULT_PROVIDER;
    const activeProviderDefault = getProviderDefault(activeProvider);
    const assistantMessage = createMessage('assistant', '', {
      title: `${activeProviderDefault.label} / ${appConfig?.model || activeProviderDefault.model}`,
      status: 'sending',
    });
    const requestId = `project-chat-${project.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    setProjectChatMessages(current => ({
      ...current,
      [projectChatKey]: [
        ...(current[projectChatKey] ?? createProjectReadyMessages(project, channel)),
        userMessage,
        assistantMessage,
      ].slice(-MAX_PERSISTED_MESSAGES),
    }));
    setProjectChatSendingKeys(current => new Set(current).add(projectChatKey));
    streamMessageIds.current.set(requestId, {
      scope: 'project',
      projectChatKey,
      projectId: project.id,
      messageId: assistantMessage.id,
    });
    setStatus('Streaming');

    try {
      await ipcClient.api.chatStream({
        requestId,
        messages: getProjectChatRequestMessages(
          currentMessages,
          project,
          channel,
          trimmedPrompt,
          virtualEmployees,
          virtualRoles,
          projectTeams,
        ),
        provider: activeProvider,
        toolScope: {
          source: 'project-chat',
          workspacePath: project.workspacePath ?? appInfo?.workspacePath ?? workspacePath,
          projectId: project.id,
          projectName: project.name,
          projectChatKey,
          channel,
        },
        baseUrl: appConfig?.baseUrl || activeProviderDefault.baseUrl,
        model: appConfig?.model || activeProviderDefault.model,
        maxTokens: Number(appConfig?.maxTokens ?? activeProviderDefault.maxTokens),
        contextTokens: Number(appConfig?.contextTokens ?? activeProviderDefault.contextTokens),
        enableTools: true,
        maxToolRounds: 12,
        temperature: Number(appConfig?.temperature ?? 0.7),
      });
    } catch (error) {
      streamMessageIds.current.delete(requestId);
      setProjectChatMessages(current => updateProjectChatMessage(
        current,
        projectChatKey,
        assistantMessage.id,
        message => ({
          ...message,
          role: 'error',
          title: 'Request failed',
          status: 'failed',
          content: formatDesktopError(error),
        }),
      ));
      setProjectChatSendingKeys(current => {
        const next = new Set(current);
        next.delete(projectChatKey);
        return next;
      });
      setStatus('Error');
    }
  }

  async function handleCommand(prompt: string): Promise<boolean> {
    if (!prompt.startsWith('/')) {
      return false;
    }

    const requestedCommand = findDesktopCommandForPrompt(prompt, DESKTOP_COMMANDS);
    if (requestedCommand?.featureId && !hasShellFeature(featureResolution, requestedCommand.featureId)) {
      appendMessage(createMessage('error', [
        `Command ${requestedCommand.command} is not available for the current feature profile.`,
        getFeaturePackageSummary(featureResolution),
      ].join('\n\n'), {
        title: 'Feature package locked',
        status: 'failed',
      }));
      return true;
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
      appendMessage(createMessage('system', [
        `Chat working folder: ${chatToolWorkspacePath || 'not set (chat-only)'}`,
        `App workspace: ${appInfo?.workspacePath || 'unavailable'}`,
      ].join('\n'), {
        title: 'Workspace',
      }));
      return true;
    }

    if (prompt === '/login' || prompt === '/account' || prompt === '/settings') {
      setSettingsMessage(prompt === '/settings'
        ? ''
        : 'Sign in to sync subscription and feature package entitlements.');
      setActiveSettingsSection('account');
      setActiveView('settings');
      appendMessage(createMessage('system', 'Opened Settings.', { title: prompt.slice(1) }));
      return true;
    }

    if (prompt === '/login local') {
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
      setSettingsMessage('Configured draft for an OpenAI-compatible backend. Set the model ID, then Save.');
      setActiveSettingsSection('model');
      setActiveView('settings');
      appendMessage(createMessage('system', 'Opened Settings with OpenAI-compatible defaults.', { title: 'login' }));
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

    if (prompt === '/team') {
      setActiveView('projects');
      setActiveProjectsSection('teams');
      appendMessage(createMessage('system', 'Opened Project Teams.', { title: 'team' }));
      return true;
    }

    if (prompt === '/automation' || prompt === '/skills' || prompt === '/tasks' || prompt === '/remote') {
      await refreshAutomationData();
      if (prompt === '/skills') {
        setActiveAutomationSection('skills');
      } else if (prompt === '/tasks') {
        setActiveAutomationSection('tasks');
      } else if (prompt === '/remote') {
        setActiveAutomationSection('remote');
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
    return availableDesktopCommands
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
      `Chat working folder: ${chatToolWorkspacePath || 'not set (chat-only)'}`,
      `Attached context: ${chatContextAttachments.length}`,
      `Pending pasted images: ${chatImageAttachments.length}`,
      `Workspace: ${appInfo?.workspacePath || 'unknown'}`,
      `Bridge tools: ${tools.length}`,
      `Bridge tools exposed to model: ${tools.filter(tool => isToolExposedToModel(tool, config)).length}`,
      `Bridge tools hidden from model: ${getDisabledModelToolSet(config).size}`,
      `MCP servers: ${mcpServers.length}`,
      `MCP tools: ${mcpTools.length}`,
      `Feature packages: ${featureResolution.packages.map(entry => `${entry.manifest.id}:${entry.state}`).join(', ')}`,
      `Runtime: ${appInfo ? `${appInfo.version} on ${appInfo.platform} ${appInfo.arch}` : 'unknown'}`,
      `Messages: ${messages.length}`,
      `Saved sessions: ${sessions.length}`,
    ];

    if (provider === 'openai-compatible' && !config?.enableLlmTools) {
      lines.push('Local tool schemas are off by default to protect small-context local models.');
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
        const folder = session.toolWorkspacePath ? `, folder ${session.toolWorkspacePath}` : '';
        const attachments = session.contextAttachments?.length ? `, ${session.contextAttachments.length} context item(s)` : '';
        return `${marker} ${session.title} (${session.messages.length} messages${folder}${attachments}, updated ${formatRelativeTime(session.updatedAt)})`;
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
      const imageSummary = formatImageAttachmentSummary(message.imageAttachments ?? []);
      await navigator.clipboard.writeText(imageSummary ? `${message.content}\n\nAttached images: ${imageSummary}` : message.content);
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
    setChatImageAttachments([]);
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
      const currentFeatureProfile = getFeatureProfileFromConfig(appConfig);
      const nextFeatureProfile = buildSettingsFeatureProfile(currentFeatureProfile, settingsDraft);
      const nextConfig: Partial<AppConfig> = {
        llmProvider: settingsDraft.llmProvider,
        baseUrl: settingsDraft.baseUrl,
        model: settingsDraft.model,
        temperature: Number(settingsDraft.temperature),
        maxTokens: Number(settingsDraft.maxTokens),
        contextTokens: Number(settingsDraft.contextTokens),
        enableLlmTools: settingsDraft.enableLlmTools,
        theme: settingsDraft.theme,
        accentColor: settingsDraft.accentColor,
        memoryEnabled: settingsDraft.memoryEnabled,
        pluginsEnabled: settingsDraft.pluginsEnabled,
        autoUpdate: settingsDraft.autoUpdate,
        cliOptions: buildCliOptions(settingsDraft),
        platformBaseUrl: normalizePlatformBaseUrl(settingsDraft.platformBaseUrl),
        platformOrgId: settingsDraft.platformOrgId.trim(),
        featureProfile: nextFeatureProfile,
        featureAccounts: writeProfileToAccountStore(appConfig, nextFeatureProfile),
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

  async function persistFeatureProfile(profile: FeatureEntitlementProfile, message: string) {
    await ipcClient.app.setConfig({
      featureProfile: profile,
      featureAccounts: writeProfileToAccountStore(appConfig, profile),
    });
    const config = await ipcClient.app.getConfig();
    setAppConfig(config);
    setSettingsDraft(current => ({
      ...createSettingsDraft(config),
      apiKey: current.apiKey,
    }));
    setSettingsMessage(message);
    setStatus('Ready');
  }

  async function syncPlatformStateFromConfig(
    configSnapshot: AppConfig | null,
    options: { reason: 'startup' | 'manual'; silent?: boolean },
  ): Promise<boolean> {
    const platformBaseUrl = normalizePlatformBaseUrl(String(configSnapshot?.platformBaseUrl || ''));
    const platformToken = typeof configSnapshot?.platformAccessToken === 'string'
      ? configSnapshot.platformAccessToken.trim()
      : '';
    const currentProfile = getFeatureProfileFromConfig(configSnapshot);
    const profilePlatform = (currentProfile as FeatureEntitlementProfile & { platform?: { orgId?: string } }).platform;
    const platformOrgId = String(configSnapshot?.platformOrgId || profilePlatform?.orgId || '').trim();

    if (!platformBaseUrl || !platformToken) {
      if (!options.silent) {
        setSettingsMessage('Sign in through agent-platform before syncing.');
      }
      return false;
    }

    if (!options.silent) {
      setSettingsMessage('Syncing account and packages from agent-platform...');
    }
    setIsSyncingPlatform(true);
    setStatus('Syncing platform');

    try {
      const [platformCatalog, platformProfile] = await Promise.all([
        fetchPlatformFeatureCatalog(platformBaseUrl, platformToken, platformOrgId),
        fetchPlatformFeatureProfile(platformBaseUrl, platformToken, platformOrgId),
      ]);
      const profile = normalizeFeatureProfile(platformProfile.profile);
      const syncedOrgId = platformProfile.org_id || platformCatalog.org_id || platformOrgId;
      const syncedAt = new Date().toISOString();
      await ipcClient.app.setConfig({
        platformBaseUrl,
        platformAccessToken: platformToken,
        platformOrgId: syncedOrgId,
        platformCatalogSource: 'platform',
        platformCatalogLastSyncedAt: syncedAt,
        platformFeaturePackageCatalog: platformCatalog.packages,
        featureProfile: profile,
        featureAccounts: writeProfileToAccountStore(configSnapshot, profile),
      });
      const config = await ipcClient.app.getConfig();
      setAppConfig(config);
      setSettingsDraft(current => ({
        ...createSettingsDraft(config),
        apiKey: current.apiKey,
        accountPassword: current.accountPassword,
      }));
      if (!options.silent) {
        setSettingsMessage(`Synced ${platformCatalog.packages.length} package${platformCatalog.packages.length === 1 ? '' : 's'} from agent-platform.`);
      }
      setStatus('Ready');
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (options.silent) {
        console.warn('Platform startup sync failed:', error);
        setStatus('Ready');
      } else {
        setSettingsMessage(message);
        setStatus('Platform sync error');
      }
      return false;
    } finally {
      setIsSyncingPlatform(false);
    }
  }

  async function handlePlatformSync() {
    await syncPlatformStateFromConfig(appConfig, { reason: 'manual' });
  }

  async function handleAccountLogin() {
    const email = settingsDraft.accountEmail.trim();
    if (!isValidEmail(email)) {
      setSettingsMessage('Enter a valid email address to sign in.');
      return;
    }

    if (settingsDraft.accountPassword.trim()) {
      try {
        const login = await loginToPlatform(settingsDraft);
        const platformBaseUrl = normalizePlatformBaseUrl(settingsDraft.platformBaseUrl);
        const platformOrgId = settingsDraft.platformOrgId.trim() ||
          login.session?.org_id ||
          login.workspace?.organization?.org_id ||
          '';
        const platformCatalog = await fetchPlatformFeatureCatalog(platformBaseUrl, login.access_token, platformOrgId);
        const platformProfile = await fetchPlatformFeatureProfile(platformBaseUrl, login.access_token, platformOrgId);
        const profile = normalizeFeatureProfile(platformProfile.profile);
        const nextConfig: Partial<AppConfig> = {
          platformBaseUrl,
          platformAccessToken: login.access_token,
          platformOrgId: platformProfile.org_id || platformCatalog.org_id || platformOrgId,
          platformCatalogSource: 'platform',
          platformCatalogLastSyncedAt: new Date().toISOString(),
          platformFeaturePackageCatalog: platformCatalog.packages,
          featureProfile: profile,
          featureAccounts: writeProfileToAccountStore(appConfig, profile),
        };
        await ipcClient.app.setConfig(nextConfig);
        const config = await ipcClient.app.getConfig();
        setAppConfig(config);
        setSettingsDraft(current => ({
          ...createSettingsDraft(config),
          apiKey: current.apiKey,
          accountPassword: '',
        }));
        setSettingsMessage(`Signed in through agent-platform as ${profile.email || email}. Catalog: ${platformCatalog.packages.length} package${platformCatalog.packages.length === 1 ? '' : 's'} from ${platformCatalog.catalog_source || 'platform'}.`);
        setStatus('Ready');
        return;
      } catch (error) {
        setSettingsMessage(error instanceof Error ? error.message : String(error));
        setStatus('Platform login error');
        return;
      }
    }

    const currentProfile = getFeatureProfileFromConfig(appConfig);
    const storedProfile = getStoredAccountProfile(appConfig, email);
    const displayName = settingsDraft.accountDisplayName.trim() || storedProfile?.displayName || email;
    const restoredProfile = storedProfile ?? currentProfile;
    const accountId = storedProfile?.accountId || getAccountStoreKey(email);
    const nextProfile: FeatureEntitlementProfile = {
      ...restoredProfile,
      accountStatus: 'signed-in',
      accountId,
      email: email.toLowerCase(),
      displayName,
      accountTier: storedProfile?.accountTier ?? 'free',
      subscriptionStatus: storedProfile?.subscriptionStatus ?? 'free',
      localDeveloperOverride: false,
      updatedAt: new Date().toISOString(),
    };

    const packageCount = normalizeFeatureProfile(nextProfile).purchasedPackageIds.length;
    await persistFeatureProfile(
      nextProfile,
      packageCount > 0
        ? `Signed in as ${email}. Restored ${packageCount} purchased package${packageCount === 1 ? '' : 's'}.`
        : `Signed in as ${email}. Free tier is active.`,
    );
  }

  async function handleAccountRegister() {
    const email = settingsDraft.accountEmail.trim();
    if (!isValidEmail(email)) {
      setSettingsMessage('Enter a valid email address before creating an account.');
      return;
    }
    if (settingsDraft.accountPassword.length < 8) {
      setSettingsMessage('Enter a platform password with at least 8 characters.');
      return;
    }

    try {
      setSettingsMessage('Creating account in agent-platform...');
      setStatus('Creating account');
      const registration = await registerWithPlatform(settingsDraft);
      const platformBaseUrl = normalizePlatformBaseUrl(settingsDraft.platformBaseUrl);
      const platformOrgId = registration.session?.org_id ||
        registration.workspace?.organization?.org_id ||
        settingsDraft.platformOrgId.trim() ||
        '';
      const platformCatalog = await fetchPlatformFeatureCatalog(platformBaseUrl, registration.access_token, platformOrgId);
      const platformProfile = await fetchPlatformFeatureProfile(platformBaseUrl, registration.access_token, platformOrgId);
      const profile = normalizeFeatureProfile(platformProfile.profile);
      await ipcClient.app.setConfig({
        platformBaseUrl,
        platformAccessToken: registration.access_token,
        platformOrgId: platformProfile.org_id || platformCatalog.org_id || platformOrgId,
        platformCatalogSource: 'platform',
        platformCatalogLastSyncedAt: new Date().toISOString(),
        platformFeaturePackageCatalog: platformCatalog.packages,
        featureProfile: profile,
        featureAccounts: writeProfileToAccountStore(appConfig, profile),
      });
      const config = await ipcClient.app.getConfig();
      setAppConfig(config);
      setSettingsDraft(current => ({
        ...createSettingsDraft(config),
        apiKey: current.apiKey,
        accountPassword: '',
      }));
      setSettingsMessage(`Created agent-platform account for ${profile.email || email}. Catalog: ${platformCatalog.packages.length} package${platformCatalog.packages.length === 1 ? '' : 's'}.`);
      setStatus('Ready');
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : String(error));
      setStatus('Platform registration error');
    }
  }

  async function handleAccountForgotPassword() {
    const email = settingsDraft.accountEmail.trim();
    if (!isValidEmail(email)) {
      setSettingsMessage('Enter the email address for your platform account.');
      return;
    }

    try {
      setSettingsMessage('Requesting password reset from agent-platform...');
      setStatus('Requesting password reset');
      const reset = await requestPlatformPasswordReset(settingsDraft);
      if (reset.reset_token) {
        setSettingsDraft(current => ({
          ...current,
          accountResetToken: reset.reset_token || '',
        }));
        setSettingsMessage(`Reset token issued for local development. It expires at ${reset.expires_at || 'the platform configured expiry'}. Enter a new password and choose Reset password.`);
      } else {
        setSettingsMessage(reset.message || 'If the account exists, a reset link has been issued.');
      }
      setStatus('Ready');
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : String(error));
      setStatus('Password reset request error');
    }
  }

  async function handleAccountResetPassword() {
    if (!settingsDraft.accountResetToken.trim()) {
      setSettingsMessage('Enter the reset token from the platform recovery email or development response.');
      return;
    }
    if (settingsDraft.accountPassword.length < 8) {
      setSettingsMessage('Enter a new platform password with at least 8 characters.');
      return;
    }

    try {
      setSettingsMessage('Resetting platform password...');
      setStatus('Resetting password');
      const reset = await resetPlatformPassword(settingsDraft);
      setSettingsDraft(current => ({
        ...current,
        accountEmail: reset.email || current.accountEmail,
        accountPassword: '',
        accountResetToken: '',
      }));
      setSettingsMessage('Password reset. Sign in with the new password.');
      setStatus('Ready');
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : String(error));
      setStatus('Password reset error');
    }
  }

  async function handleAccountLogout() {
    const nextProfile = normalizeFeatureProfile(null);
    await ipcClient.auth.logout();
    setPurchasePackageId(null);
    await ipcClient.app.setConfig({
      featureProfile: nextProfile,
      featureAccounts: getFeatureAccountStore(appConfig),
      platformAccessToken: '',
      platformCatalogSource: 'local',
      platformFeaturePackageCatalog: [],
    });
    const config = await ipcClient.app.getConfig();
    setAppConfig(config);
    setSettingsDraft(current => ({
      ...createSettingsDraft(config),
      apiKey: current.apiKey,
      accountPassword: '',
    }));
    setSettingsMessage('Signed out. Guest free tier is active.');
    setStatus('Ready');
  }

  async function handleFeaturePackageAction(packageId: string) {
    const packageEntry = featureResolution.packages.find(entry => entry.manifest.id === packageId);
    if (!packageEntry) {
      setSettingsMessage(`Unknown feature package: ${packageId}`);
      return;
    }

    const isEntitled = packageEntry.state === 'available' || packageEntry.state === 'trial';
    if (isEntitled && !isPackageRuntimeAvailable(packageEntry.installState)) {
      const profile = getFeatureProfileFromConfig(appConfig);
      const platformBaseUrl = normalizePlatformBaseUrl(String(appConfig?.platformBaseUrl || ''));
      const platformToken = typeof appConfig?.platformAccessToken === 'string' ? appConfig.platformAccessToken : '';
      if (platformBaseUrl && platformToken) {
        try {
          setSettingsMessage(`Installing and verifying ${packageEntry.manifest.displayName}...`);
          setStatus('Installing package');
          const platformOrgId = String(appConfig?.platformOrgId || profile.accountId || '');
          const localInstall = packageEntry.manifest.distribution.securityBoundary === 'signed-local-bundle'
            ? await ipcClient.app.installFeaturePackage({
                manifest: packageEntry.manifest as unknown as Record<string, any>,
                download: createPlatformPackageDownloadRequest(platformBaseUrl, platformToken, platformOrgId, packageEntry.manifest),
              })
            : undefined;
          const result = await installPlatformPackage(
            platformBaseUrl,
            platformToken,
            platformOrgId,
            packageEntry.manifest,
            localInstall,
          );
          await ipcClient.app.setConfig({
            featureProfile: result.profile,
            featureAccounts: writeProfileToAccountStore(appConfig, result.profile),
            platformOrgId: result.org_id || appConfig?.platformOrgId,
            platformCatalogSource: 'platform',
            platformCatalogLastSyncedAt: new Date().toISOString(),
          });
          const config = await ipcClient.app.getConfig();
          setAppConfig(config);
          setSettingsDraft(current => ({
            ...createSettingsDraft(config),
            apiKey: current.apiKey,
            accountPassword: '',
          }));
          setSettingsMessage(
            localInstall
              ? `${packageEntry.manifest.displayName} verified and installed through agent-platform.`
              : `${packageEntry.manifest.displayName} installed through agent-platform.`,
          );
          setStatus('Ready');
          return;
        } catch (error) {
          setSettingsMessage(error instanceof Error ? error.message : String(error));
          setStatus('Platform install error');
          return;
        }
      }
      try {
        setSettingsMessage(`Installing and verifying ${packageEntry.manifest.displayName}...`);
        setStatus('Installing package');
        const localInstall = packageEntry.manifest.distribution.securityBoundary === 'signed-local-bundle'
          ? await ipcClient.app.installFeaturePackage({ manifest: packageEntry.manifest as unknown as Record<string, any> })
          : undefined;
        const nextProfile = createInstalledProfile(profile, packageEntry.manifest, localInstall);
        await persistFeatureProfile(
          nextProfile,
          localInstall
            ? `${packageEntry.manifest.displayName} verified and installed locally. ${packageEntry.manifest.distribution.notes}`
            : `${packageEntry.manifest.displayName} installed locally. ${packageEntry.manifest.distribution.notes}`,
        );
      } catch (error) {
        setSettingsMessage(error instanceof Error ? error.message : String(error));
        setStatus('Package install error');
      }
      return;
    }

    if (isEntitled) {
      setSettingsMessage(`${packageEntry.manifest.displayName} is ${packageEntry.state} and ${packageEntry.installState}. SKU: ${packageEntry.manifest.productSku}.`);
      return;
    }

    if (featureResolution.profile.accountStatus !== 'signed-in') {
      setActiveSettingsSection('account');
      setSettingsMessage('Sign in before purchasing feature packages.');
      return;
    }

    setPurchasePackageId(packageEntry.manifest.id);
    setPurchaseDraft({
      ...EMPTY_PURCHASE_DRAFT,
      nameOnCard: featureResolution.profile.displayName || '',
    });
    setSettingsMessage('');
  }

  async function completePackagePurchase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPurchasePackage) {
      setSettingsMessage('Select a package before checkout.');
      return;
    }

    const error = validatePurchaseDraft(purchaseDraft);
    if (error) {
      setSettingsMessage(error);
      return;
    }

    const profile = getFeatureProfileFromConfig(appConfig);
    if (profile.accountStatus !== 'signed-in') {
      setSettingsMessage('Sign in before purchasing feature packages.');
      setActiveSettingsSection('account');
      setPurchasePackageId(null);
      return;
    }

    const platformBaseUrl = normalizePlatformBaseUrl(String(appConfig?.platformBaseUrl || ''));
    const platformToken = typeof appConfig?.platformAccessToken === 'string' ? appConfig.platformAccessToken : '';
    if (platformBaseUrl && platformToken) {
      try {
        const orgId = String(appConfig?.platformOrgId || (profile as any).platform?.orgId || '');
        await createPlatformPaymentMethod(platformBaseUrl, platformToken, orgId, selectedPurchasePackage, purchaseDraft);
        const result = await purchasePlatformPackage(platformBaseUrl, platformToken, orgId, selectedPurchasePackage.id);
        setPurchasePackageId(null);
        setPurchaseDraft({ ...EMPTY_PURCHASE_DRAFT });
        await ipcClient.app.setConfig({
          featureProfile: result.profile,
          featureAccounts: writeProfileToAccountStore(appConfig, result.profile),
          platformOrgId: result.org_id || appConfig?.platformOrgId,
          platformCatalogSource: 'platform',
          platformCatalogLastSyncedAt: new Date().toISOString(),
        });
        const config = await ipcClient.app.getConfig();
        setAppConfig(config);
        setSettingsDraft(current => ({
          ...createSettingsDraft(config),
          apiKey: current.apiKey,
          accountPassword: '',
        }));
        setSettingsMessage(
          selectedPurchasePackage.distribution.installRequired
            ? `${selectedPurchasePackage.displayName} purchased through agent-platform. Install the package to enable its features.`
            : `${selectedPurchasePackage.displayName} purchased through agent-platform.`,
        );
        setStatus('Ready');
        return;
      } catch (error) {
        setSettingsMessage(error instanceof Error ? error.message : String(error));
        setStatus('Platform purchase error');
        return;
      }
    }

    const nextProfile = createPurchasedProfile(profile, selectedPurchasePackage, purchaseDraft);
    const last4 = purchaseDraft.cardNumber.replace(/\D/g, '').slice(-4);
    setPurchasePackageId(null);
    setPurchaseDraft({ ...EMPTY_PURCHASE_DRAFT });
    await persistFeatureProfile(
      nextProfile,
      selectedPurchasePackage.distribution.installRequired
        ? `${selectedPurchasePackage.displayName} purchased with ${getCardBrand(purchaseDraft.cardNumber)} ending ${last4}. Install the package to enable its features.`
        : `${selectedPurchasePackage.displayName} purchased with ${getCardBrand(purchaseDraft.cardNumber)} ending ${last4}.`,
    );
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
      return filterNavigationItems(PROJECTS_MENU, featureResolution);
    }
    if (activeView === 'tools') {
      return filterNavigationItems(TOOLS_MENU, featureResolution);
    }
    if (activeView === 'automation') {
      return filterNavigationItems(AUTOMATION_MENU, featureResolution);
    }
    if (activeView === 'history') {
      return filterNavigationItems(HISTORY_MENU, featureResolution);
    }
    if (activeView === 'settings') {
      return filterNavigationItems(SETTINGS_MENU, featureResolution);
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
  const recentSessions = sortSessions(sessions.filter(isMeaningfulChatSession));
  const visibleRecentSessions = recentSessions.filter(session => matchesSessionSearch(session, sessionSearch));
  const exposedBridgeToolCount = tools.filter(tool => isToolExposedToModel(tool, appConfig)).length;
  const commandSuggestions = filterDesktopCommands(input, availableDesktopCommands);
  const showCommandPalette = activeView === 'chat' && commandSuggestions.length > 0 && !isSending;
  const selectedPurchasePackage = purchasePackageId
    ? featureResolution.packages.find(entry => entry.manifest.id === purchasePackageId)?.manifest ?? null
    : null;
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
  const skinStyle = getSkinStyle(appConfig?.accentColor);
  const projectNotificationClassName = getProjectNoticeClassName(projectActionMessage);

  return (
    <div className={`${styles.container} ${sidebarCollapsed ? styles.containerCollapsed : ''}`} style={skinStyle}>
      <aside className={`${styles.navSidebar} ${sidebarCollapsed ? styles.navSidebarCollapsed : ''}`} aria-label="Navigation">
        <div className={styles.brandBlock}>
          <span className={styles.brandMark}><Icon name="bot" size={17} /></span>
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
            <Icon name={sidebarCollapsed ? 'chevron-right' : 'chevron-left'} size={15} />
          </button>
        </div>

        <button className={styles.newChatButton} type="button" title="New chat" onClick={startNewChat}>
          <span className={styles.navGlyph}><Icon name="plus" size={14} /></span>
          <span className={styles.navLabel}>New chat</span>
        </button>

        <nav className={styles.navList} aria-label="Primary">
          {availablePrimaryNav.map(item => (
            <div className={styles.navGroup} key={item.id}>
              <button
                className={activeView === item.id ? styles.navItemActive : styles.navItem}
                type="button"
                title={item.description}
                onClick={() => openPrimaryView(item.id)}
              >
                <span className={styles.navGlyph}><Icon name={item.icon} size={14} /></span>
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
                      <span className={styles.navChildGlyph}><Icon name={child.icon} size={13} /></span>
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
        {projectActionMessage && (
          <div className={projectNotificationClassName} role="status">
            <div className={styles.projectNoticeContent}>
              <strong>Project update</strong>
              <span>{projectActionMessage}</span>
            </div>
            <button
              className={styles.projectNoticeClose}
              type="button"
              title="Dismiss notification"
              aria-label="Dismiss project notification"
              onClick={() => setProjectActionMessage('')}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        )}
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
                <div className={styles.composerContextPanel}>
                  <div className={styles.composerContextBar}>
                    <div className={styles.composerContextStatus} title={chatToolWorkspacePath || 'No folder selected'}>
                      <Icon name={chatToolWorkspacePath ? 'folder-open' : 'message'} size={14} />
                      <span>{chatToolWorkspacePath ? 'Guided project folder' : 'Chat only'}</span>
                      <strong>{chatToolWorkspacePath ? chatToolWorkspacePath : 'No local folder selected'}</strong>
                    </div>
                    <div className={styles.composerContextActions}>
                      <button
                        className={styles.textButton}
                        type="button"
                        onClick={chooseChatContextAttachments}
                        disabled={isSending}
                        title="Add files or folders as read-only chat context"
                      >
                        <Icon name="plus" size={13} />
                        Add context
                      </button>
                      {chatToolWorkspacePath && (
                        <button
                          className={styles.textButton}
                          type="button"
                          onClick={clearChatToolWorkspaceFolder}
                          disabled={isSending}
                          title="Return this chat to chat-only mode"
                        >
                          <Icon name="x" size={13} />
                          Clear folder
                        </button>
                      )}
                      <button
                        className={styles.textButton}
                        type="button"
                        onClick={chooseChatToolWorkspaceFolder}
                        disabled={isSending}
                        title={chatToolWorkspacePath ? 'Change working folder' : 'Choose a working folder'}
                      >
                        <Icon name="folder-open" size={13} />
                        {chatToolWorkspacePath ? 'Change folder' : 'Set folder'}
                      </button>
                    </div>
                  </div>
                  {chatContextAttachments.length > 0 && (
                    <div className={styles.composerAttachmentList} aria-label="Attached chat context">
                      {chatContextAttachments.map(attachment => (
                        <button
                          key={attachment.path}
                          className={styles.composerAttachmentChip}
                          type="button"
                          onClick={() => removeChatContextAttachment(attachment.path)}
                          disabled={isSending}
                          title={`Remove ${attachment.path}`}
                        >
                          <Icon name={attachment.type === 'directory' ? 'folder' : 'file'} size={13} />
                          <span>{attachment.name}</span>
                          <em>{attachment.type === 'directory' ? 'Folder' : formatFileSize(attachment.size)}</em>
                          <Icon name="x" size={12} />
                        </button>
                      ))}
                      <button
                        className={styles.textButton}
                        type="button"
                        onClick={clearChatContextAttachments}
                        disabled={isSending}
                        title="Remove all attached context"
                      >
                        Clear context
                      </button>
                    </div>
                  )}
                  {chatImageAttachments.length > 0 && (
                    <div className={styles.composerImageList} aria-label="Pasted images">
                      {chatImageAttachments.map(image => (
                        <button
                          key={image.id}
                          className={styles.composerImageChip}
                          type="button"
                          onClick={() => removeChatImageAttachment(image.id)}
                          disabled={isSending}
                          title={`Remove ${image.name}`}
                        >
                          <img src={image.dataUrl} alt="" />
                          <span>{image.name}</span>
                          <em>{[image.width && image.height ? `${image.width}x${image.height}` : '', formatFileSize(image.size)].filter(Boolean).join(' · ')}</em>
                          <Icon name="x" size={12} />
                        </button>
                      ))}
                      <button
                        className={styles.textButton}
                        type="button"
                        onClick={clearChatImageAttachments}
                        disabled={isSending}
                        title="Remove all pasted images"
                      >
                        Clear images
                      </button>
                    </div>
                  )}
                </div>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={event => setInput(event.target.value)}
                  onKeyDown={handleInputKeyDown}
                  onPaste={handleComposerPaste}
                  placeholder="Reply to CodeAgent or paste an image..."
                  rows={1}
                  disabled={isSending}
                  aria-label="Message"
                />
                <div className={styles.composerActions}>
                  <button className={styles.secondaryButton} type="button" onClick={clearChat} title="Clear chat">
                    <Icon name="x" size={14} />
                    Clear
                  </button>
                  <button className={styles.primaryButton} type="submit" disabled={isSending || (!input.trim() && chatImageAttachments.length === 0)} title="Send message">
                    <Icon name="send" size={14} />
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
              toolActivities={toolActivities}
              teamRuns={teamRuns}
              runningProjectIds={runningProjectIds}
              currentSessionTitle={conversationTitle}
              sessionCount={sessions.length}
              projects={softwareProjects}
              activeProjectId={activeSoftwareProjectId}
              roles={virtualRoles}
              employees={virtualEmployees}
              projectTeams={projectTeams}
              projectChatMessages={projectChatMessages}
              projectGeneratedOutputs={projectGeneratedOutputs}
              projectChatSendingKeys={projectChatSendingKeys}
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
              onSaveProject={saveSoftwareProjectPlan}
              onSaveRole={saveVirtualRoleDefinition}
              onDeleteRole={deleteVirtualRoleDefinition}
              onSaveEmployee={saveVirtualEmployeeProfile}
              onDeleteEmployee={deleteVirtualEmployeeProfile}
              onSaveTeam={saveProjectTeamDefinition}
              onDeleteTeam={deleteProjectTeamDefinition}
              onSelectProject={setActiveSoftwareProjectId}
              onSetProjectStatus={markSoftwareProjectStatus}
              onDeleteProject={deleteSoftwareProjectPlan}
              onSendProjectChat={submitProjectPrompt}
              onChangeSection={setActiveProjectsSection}
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
              roles={virtualRoles}
              employees={virtualEmployees}
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
              featureResolution={featureResolution}
              onChange={updateSettingsDraft}
              onClearToken={clearToken}
              onAccountLogin={handleAccountLogin}
              onAccountRegister={handleAccountRegister}
              onAccountForgotPassword={handleAccountForgotPassword}
              onAccountResetPassword={handleAccountResetPassword}
              onAccountLogout={handleAccountLogout}
              onPlatformSync={handlePlatformSync}
              canSyncPlatform={canSyncPlatform}
              platformSyncing={isSyncingPlatform}
              onPackageAction={handleFeaturePackageAction}
              onSubmit={saveSettings}
            />
          )}
        </main>

        <footer className={styles.footer}>
          <button className={styles.statusPane} type="button" onClick={() => setActiveView('chat')}>
            <span>Status</span>
            <strong>{statusLabel}</strong>
          </button>
          {hasShellFeature(featureResolution, 'project-studio') && (
            <button
              className={styles.statusPane}
              type="button"
              onClick={() => {
                setActiveProjectsSection('studio');
                setActiveView('projects');
              }}
            >
              <span>Workspace</span>
              <strong title={appInfo?.workspacePath || undefined}>{appInfo?.workspacePath ? formatSidebarLabel(appInfo.workspacePath, 34) : 'Unknown'}</strong>
            </button>
          )}
          {hasShellFeature(featureResolution, 'developer-tools') && (
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
          )}
          {hasShellFeature(featureResolution, 'automation') && (
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
          )}
          {hasShellFeature(featureResolution, 'developer-history') && (
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
          )}
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

      {selectedPurchasePackage && (
        <PackagePurchaseDialog
          manifest={selectedPurchasePackage}
          profile={featureResolution.profile}
          draft={purchaseDraft}
          message={settingsMessage}
          onChange={update => setPurchaseDraft(current => ({ ...current, ...update }))}
          onSubmit={completePackagePurchase}
          onCancel={() => {
            setPurchasePackageId(null);
            setPurchaseDraft({ ...EMPTY_PURCHASE_DRAFT });
            setSettingsMessage('');
          }}
        />
      )}
    </div>
  );
}

function WorkbenchEditorPanel({
  title,
  subtitle,
  children,
  footer,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <aside className={wide ? `${styles.workbenchEditorPanel} ${styles.workbenchEditorPanelWide}` : styles.workbenchEditorPanel} aria-label={title}>
      <div className={styles.workbenchEditorHeader}>
        <div>
          <h3>{title}</h3>
          {subtitle && <span>{subtitle}</span>}
        </div>
        <button className={styles.secondaryButton} type="button" onClick={onClose} title="Close this panel">
          <Icon name="x" size={14} />
          Close
        </button>
      </div>
      <div className={styles.workbenchEditorBody}>
        {children}
      </div>
      {footer && (
        <div className={styles.workbenchEditorFooter}>
          {footer}
        </div>
      )}
    </aside>
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
  toolActivities,
  teamRuns,
  runningProjectIds,
  currentSessionTitle,
  sessionCount,
  projects,
  activeProjectId,
  roles,
  employees,
  projectTeams,
  projectChatMessages,
  projectGeneratedOutputs,
  projectChatSendingKeys,
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
  onSaveProject,
  onSaveRole,
  onDeleteRole,
  onSaveEmployee,
  onDeleteEmployee,
  onSaveTeam,
  onDeleteTeam,
  onSelectProject,
  onSetProjectStatus,
  onDeleteProject,
  onSendProjectChat,
  onChangeSection,
}: {
  activeSection: ProjectsSectionId;
  appInfo: AppInfo | null;
  appConfig: AppConfig | null;
  appState: Record<string, any>;
  activeProviderLabel: string;
  activeProviderDefault: ReturnType<typeof getProviderDefault>;
  viewportSize: { width: number; height: number };
  tokenUsage: { inputTokens: number; outputTokens: number };
  toolActivities: ToolActivity[];
  teamRuns: VirtualTeamRunRecord[];
  runningProjectIds: Set<string>;
  currentSessionTitle: string;
  sessionCount: number;
  projects: SoftwareProjectPlan[];
  activeProjectId: string;
  roles: VirtualRoleDefinition[];
  employees: VirtualEmployeeProfile[];
  projectTeams: ProjectTeamDefinition[];
  projectChatMessages: Record<string, UiMessage[]>;
  projectGeneratedOutputs: Record<string, ProjectGeneratedOutput[]>;
  projectChatSendingKeys: Set<string>;
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
  onSaveProject: (project: SoftwareProjectPlan) => void;
  onSaveRole: (role: VirtualRoleDefinition) => void;
  onDeleteRole: (roleId: string) => void;
  onSaveEmployee: (employee: VirtualEmployeeProfile) => void;
  onDeleteEmployee: (employeeId: string) => void;
  onSaveTeam: (team: ProjectTeamDefinition) => void;
  onDeleteTeam: (teamId: string) => void;
  onSelectProject: (projectId: string) => void;
  onSetProjectStatus: (projectId: string, status: SoftwareProjectStatus) => void;
  onDeleteProject: (projectId: string) => void;
  onSendProjectChat: (project: SoftwareProjectPlan, channel: ProjectChatChannel, prompt: string) => void;
  onChangeSection: (section: ProjectsSectionId) => void;
}) {
  const visibleActiveSection = PROJECTS_MENU.some(item => item.id === activeSection)
    ? activeSection
    : 'studio';
  const workspaceTitle = appInfo?.workspacePath?.split('/').filter(Boolean).pop() || 'Workspace';
  const selectedProject = projects.find(project => project.id === activeProjectId) ?? projects[0];
  const guidedProjects = projects.filter(project => project.mode === 'guided');
  const autonomousProjects = projects.filter(project => project.mode === 'autonomous');
  const selectedAutonomousProject = autonomousProjects.find(project => project.id === activeProjectId) ?? autonomousProjects[0];
  const selectedAutonomousSupervisor = selectedAutonomousProject ? getProjectSupervisor(selectedAutonomousProject, employees, roles) : employees.find(employee => isSupervisorEmployee(employee, roles));
  const selectedAutonomousTeams = selectedAutonomousProject ? getProjectTeams(selectedAutonomousProject, projectTeams) : [];
  const selectedAutonomousDirectEmployees = selectedAutonomousProject ? getProjectAssignedEmployees(selectedAutonomousProject, employees, roles) : [];
  const selectedAutonomousStaff = selectedAutonomousProject
    ? getProjectStaffingEmployees(selectedAutonomousProject, employees, roles, projectTeams)
    : employees.filter(employee => employee.id !== selectedAutonomousSupervisor?.id);
  function getProjectLatestRun(project: SoftwareProjectPlan): VirtualTeamRunRecord | undefined {
    if (project.mode !== 'autonomous') {
      return undefined;
    }

    const automationTeamId = getProjectAutomationTeamId(project.id);
    return teamRuns
      .filter(run => run.teamId === automationTeamId)
      .sort((left, right) => right.startedAt - left.startedAt)[0];
  }

  function getProjectEffectiveStatus(project: SoftwareProjectPlan): SoftwareProjectStatus {
    if (project.status === 'stopped') {
      return 'stopped';
    }

    const latestRun = getProjectLatestRun(project);
    if (project.mode === 'autonomous' && (runningProjectIds.has(project.id) || latestRun?.status === 'running')) {
      return 'active';
    }
    if (latestRun?.status === 'succeeded') {
      return 'done';
    }
    if (latestRun?.status === 'failed') {
      return 'blocked';
    }
    return project.status;
  }

  const activeProjects = projects.filter(project => getProjectEffectiveStatus(project) === 'active');
  const staffedProjectCount = projects.filter(project => (
    project.mode === 'guided'
      ? project.assignedEmployeeIds.length > 0
      : Boolean(project.supervisorEmployeeId || project.assignedEmployeeIds.length > 0 || project.assignedTeamIds.length > 0)
  )).length;
  const deliverableCount = projects.reduce((total, project) => total + project.artifacts.length, 0);
  const projectModeMetrics = [
    { label: 'Guided', value: guidedProjects.length, className: styles.projectMetricGuided },
    { label: 'Autonomous', value: autonomousProjects.length, className: styles.projectMetricAutonomous },
  ];
  const projectStatusMetrics = ([
    ['Active', 'active', styles.projectMetricActive],
    ['Planning', 'planning', styles.projectMetricPlanning],
    ['Blocked', 'blocked', styles.projectMetricBlocked],
    ['Stopped', 'stopped', styles.projectMetricStopped],
    ['Done', 'done', styles.projectMetricDone],
    ['Idea', 'idea', styles.projectMetricIdea],
  ] as Array<[string, SoftwareProjectStatus, string]>).map(([label, status, className]) => ({
    label,
    value: projects.filter(project => getProjectEffectiveStatus(project) === status).length,
    className,
  }));
  const projectStaffingMetrics = [
    { label: 'Staffed', value: staffedProjectCount, className: styles.projectMetricStaffed },
    { label: 'Needs staffing', value: Math.max(0, projects.length - staffedProjectCount), className: styles.projectMetricNeedsStaffing },
  ];
  const [draft, setDraft] = useState<SoftwareProjectPlan>(() => createSoftwareProjectDraft(appInfo?.workspacePath));
  const [roleDraft, setRoleDraft] = useState<VirtualRoleDefinition>(() => createVirtualRoleDefinition('Developer'));
  const [employeeDraft, setEmployeeDraft] = useState<VirtualEmployeeProfile>(() => createVirtualEmployeeProfile('Developer'));
  const [teamDraft, setTeamDraft] = useState<ProjectTeamDefinition>(() => createDefaultProjectTeams()[0]);
  const [profileEmployeeId, setProfileEmployeeId] = useState('');
  const [projectEditorPanel, setProjectEditorPanel] = useState<ProjectEditorPanelId | null>(null);
  const [projectDeleteTarget, setProjectDeleteTarget] = useState<DeleteTarget<ProjectDeleteKind> | null>(null);
  const [projectActionProjectId, setProjectActionProjectId] = useState('');
  const [projectChatDrafts, setProjectChatDrafts] = useState<Record<string, string>>({});
  const [activityRunSelections, setActivityRunSelections] = useState<Record<string, string>>({});
  const [copiedProjectMessageId, setCopiedProjectMessageId] = useState<string | null>(null);
  const [projectPortfolioView, setProjectPortfolioView] = useState<RecordViewMode>('table');
  const [roleListView, setRoleListView] = useState<RecordViewMode>('table');
  const [employeeListView, setEmployeeListView] = useState<RecordViewMode>('table');
  const [teamListView, setTeamListView] = useState<RecordViewMode>('table');
  const [projectPage, setProjectPage] = useState(1);
  const projectPageCount = Math.max(1, Math.ceil(projects.length / PROJECT_LIST_PAGE_SIZE));
  const normalizedProjectPage = Math.min(projectPage, projectPageCount);
  const projectPageStartIndex = (normalizedProjectPage - 1) * PROJECT_LIST_PAGE_SIZE;
  const visibleProjects = projects.slice(projectPageStartIndex, projectPageStartIndex + PROJECT_LIST_PAGE_SIZE);
  const projectPageFirstRecord = projects.length === 0 ? 0 : projectPageStartIndex + 1;
  const projectPageLastRecord = Math.min(projectPageStartIndex + PROJECT_LIST_PAGE_SIZE, projects.length);
  const projectChatTranscriptRef = useRef<HTMLDivElement | null>(null);
  const profileEmployee = employees.find(employee => employee.id === profileEmployeeId);
  const projectActionProject = projects.find(project => project.id === projectActionProjectId)
    ?? selectedProject;
  const projectWidePanels: ProjectEditorPanelId[] = [
    'project-chat',
    'project-org',
    'project-execution',
    'project-board',
    'project-team-chat',
    'project-deliverables',
  ];
  const projectRailOpen = Boolean(projectEditorPanel);
  const projectRailWide = Boolean(projectEditorPanel && projectWidePanels.includes(projectEditorPanel));

  useEffect(() => {
    setProjectPage(current => Math.min(Math.max(1, current), Math.max(1, Math.ceil(projects.length / PROJECT_LIST_PAGE_SIZE))));
  }, [projects.length]);

  useEffect(() => {
    if (projectEditorPanel !== 'project-chat' && projectEditorPanel !== 'project-team-chat') {
      return;
    }

    const transcript = projectChatTranscriptRef.current;
    if (transcript) {
      transcript.scrollTop = transcript.scrollHeight;
    }
  }, [projectEditorPanel, projectActionProjectId, projectChatMessages, projectChatSendingKeys]);

  function startDraft(mode: SoftwareProjectMode) {
    const supervisor = employees.find(employee => isSupervisorEmployee(employee, roles)) ?? employees[0];
    setDraft({
      ...createSoftwareProjectDraft(appInfo?.workspacePath),
      mode,
      permissionMode: mode === 'autonomous' ? 'full-access' : 'supervised',
      supervisorEmployeeId: supervisor?.id ?? '',
      supervisorRole: supervisor ? getEmployeeRoleDefinition(supervisor, roles)?.title ?? supervisor.role : 'Supervisor',
      assignedEmployeeIds: mode === 'autonomous'
        ? []
        : employees
          .filter(employee => employee.id !== supervisor?.id)
          .slice(0, 4)
          .map(employee => employee.id),
      assignedTeamIds: mode === 'autonomous' ? projectTeams.slice(0, 2).map(team => team.id) : [],
      teamRoles: mode === 'autonomous'
        ? projectTeams.slice(0, 2).map(team => team.name)
        : employees
          .filter(employee => employee.id !== supervisor?.id)
          .slice(0, 4)
          .map(employee => getEmployeeRoleDefinition(employee, roles)?.title ?? employee.role),
    });
    setProfileEmployeeId('');
    setProjectDeleteTarget(null);
    setProjectActionProjectId('');
    setProjectEditorPanel('project');
  }

  function editProject(project: SoftwareProjectPlan) {
    setDraft({
      ...project,
      artifacts: [...project.artifacts],
      teamRoles: [...project.teamRoles],
      assignedTeamIds: [...project.assignedTeamIds],
      assignedEmployeeIds: [...project.assignedEmployeeIds],
    });
    onSelectProject(project.id);
    setProfileEmployeeId('');
    setProjectDeleteTarget(null);
    setProjectActionProjectId(project.id);
    setProjectEditorPanel('project');
  }

  function updateDraft(update: Partial<SoftwareProjectPlan>) {
    setDraft(current => ({
      ...current,
      ...update,
      updatedAt: Date.now(),
    }));
  }

  function saveDraft(): SoftwareProjectPlan {
    const supervisor = employees.find(employee => employee.id === draft.supervisorEmployeeId);
    const assignedEmployees = employees.filter(employee => draft.assignedEmployeeIds.includes(employee.id));
    const assignedTeams = projectTeams.filter(team => draft.assignedTeamIds.includes(team.id));
    const next = {
      ...draft,
      name: draft.name.trim() || 'Untitled software project',
      workspacePath: draft.workspacePath || appInfo?.workspacePath,
      artifacts: normalizeStringList(draft.artifacts, DEFAULT_PROJECT_ARTIFACTS),
      supervisorRole: supervisor
        ? getEmployeeRoleDefinition(supervisor, roles)?.title ?? supervisor.role
        : draft.supervisorRole,
      assignedTeamIds: assignedTeams.map(team => team.id),
      teamRoles: assignedEmployees.length > 0 || assignedTeams.length > 0
        ? [
            ...assignedTeams.map(team => team.name),
            ...assignedEmployees.map(employee => getEmployeeRoleDefinition(employee, roles)?.title ?? employee.role),
          ]
        : normalizeStringList(draft.teamRoles, DEFAULT_AUTONOMOUS_ROLES),
      updatedAt: Date.now(),
    };
    onSaveProject(next);
    setDraft(next);
    return next;
  }

  function saveDraftAndViewOrganization() {
    const project = saveDraft();
    onSelectProject(project.id);
    setProjectActionProjectId(project.id);
    setProjectEditorPanel(project.mode === 'autonomous' ? 'project-org' : 'project-chat');
  }

  function saveDraftAndOpenProjectChat() {
    const project = saveDraft();
    onSelectProject(project.id);
    setProjectActionProjectId(project.id);
    setProjectEditorPanel('project-chat');
  }

  function closeProjectEditorPanel() {
    setProjectEditorPanel(null);
    setProfileEmployeeId('');
    setProjectDeleteTarget(null);
    setProjectActionProjectId('');
  }

  function openProjectDeleteConfirmation(target: DeleteTarget<ProjectDeleteKind>) {
    setProfileEmployeeId('');
    setProjectActionProjectId(target.kind === 'project' ? target.id : '');
    setProjectDeleteTarget(target);
    setProjectEditorPanel('delete');
  }

  function openProjectActionPanel(project: SoftwareProjectPlan, panel: ProjectEditorPanelId) {
    onSelectProject(project.id);
    setProfileEmployeeId('');
    setProjectDeleteTarget(null);
    setProjectActionProjectId(project.id);
    setProjectEditorPanel(panel);
  }

  function confirmProjectDelete() {
    if (!projectDeleteTarget) {
      return;
    }

    if (projectDeleteTarget.kind === 'project') {
      onDeleteProject(projectDeleteTarget.id);
    } else if (projectDeleteTarget.kind === 'role') {
      onDeleteRole(projectDeleteTarget.id);
    } else if (projectDeleteTarget.kind === 'employee') {
      onDeleteEmployee(projectDeleteTarget.id);
    } else if (projectDeleteTarget.kind === 'team') {
      onDeleteTeam(projectDeleteTarget.id);
    }

    closeProjectEditorPanel();
  }

  function openNewRoleEditor() {
    setRoleDraft(createVirtualRoleDefinition('Developer'));
    setProjectDeleteTarget(null);
    setProjectEditorPanel('role');
  }

  function openRoleEditor(role: VirtualRoleDefinition) {
    setRoleDraft({
      ...role,
      responsibilities: [...role.responsibilities],
      defaultTools: [...role.defaultTools],
    });
    setProjectDeleteTarget(null);
    setProjectEditorPanel('role');
  }

  function openNewEmployeeEditor() {
    setEmployeeDraft(createVirtualEmployeeProfile('Developer'));
    setProjectDeleteTarget(null);
    setProjectEditorPanel('employee');
  }

  function openEmployeeEditor(employee: VirtualEmployeeProfile) {
    setEmployeeDraft({
      ...employee,
      permissions: [...employee.permissions],
    });
    setProjectDeleteTarget(null);
    setProjectEditorPanel('employee');
  }

  function openEmployeeProfile(employeeId: string) {
    setProjectDeleteTarget(null);
    setProfileEmployeeId(employeeId);
    setProjectEditorPanel('employee-profile');
  }

  function openNewProjectTeamEditor() {
    setTeamDraft({
      ...createDefaultProjectTeams()[0],
      id: createProjectTeamId('Project team'),
      name: 'New Project Team',
      memberEmployeeIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setProjectDeleteTarget(null);
    setProjectEditorPanel('team');
  }

  function openProjectTeamEditor(team: ProjectTeamDefinition) {
    setTeamDraft({
      ...team,
      memberEmployeeIds: [...team.memberEmployeeIds],
    });
    setProjectDeleteTarget(null);
    setProjectEditorPanel('team');
  }

  function saveRoleDraft() {
    onSaveRole({
      ...roleDraft,
      title: roleDraft.title.trim() || 'Contributor',
      responsibilities: normalizeStringList(roleDraft.responsibilities, ['Deliver assigned project responsibilities.']),
      defaultGoal: roleDraft.defaultGoal.trim() || getDefaultTeamGoal(roleDraft.title),
      defaultTools: normalizeStringList(roleDraft.defaultTools, getDefaultTeamTools(roleDraft.title)),
      updatedAt: Date.now(),
    });
    setRoleDraft(createVirtualRoleDefinition('Developer'));
    closeProjectEditorPanel();
  }

  function selectEmployeeRole(roleId: string) {
    const role = getRoleDefinitionById(roles, roleId);
    setEmployeeDraft(current => ({
      ...current,
      roleId,
      role: role?.title ?? current.role,
      updatedAt: Date.now(),
    }));
  }

  function saveEmployeeDraft() {
    const role = getRoleDefinitionById(roles, employeeDraft.roleId, employeeDraft.role);
    onSaveEmployee({
      ...employeeDraft,
      name: employeeDraft.name.trim() || role?.title || employeeDraft.role.trim() || 'Employee',
      roleId: role?.id ?? employeeDraft.roleId,
      role: role?.title ?? (employeeDraft.role.trim() || 'Contributor'),
      permissions: normalizeStringList(employeeDraft.permissions, DEFAULT_EMPLOYEE_PERMISSIONS),
      updatedAt: Date.now(),
    });
    setEmployeeDraft(createVirtualEmployeeProfile('Developer'));
    closeProjectEditorPanel();
  }

  function saveTeamDraft() {
    onSaveTeam({
      ...teamDraft,
      name: teamDraft.name.trim() || 'Project team',
      mission: teamDraft.mission.trim() || 'Deliver a scoped portion of the project mission.',
      memberEmployeeIds: normalizeStringList(teamDraft.memberEmployeeIds, []),
      updatedAt: Date.now(),
    });
    setTeamDraft({
      ...createDefaultProjectTeams()[0],
      id: createProjectTeamId('Project team'),
      name: 'New Project Team',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    closeProjectEditorPanel();
  }

  function selectTeamSupervisor(employeeId: string) {
    setTeamDraft(current => ({
      ...current,
      supervisorEmployeeId: employeeId,
      memberEmployeeIds: current.memberEmployeeIds.filter(id => id !== employeeId),
      updatedAt: Date.now(),
    }));
  }

  function toggleTeamMember(employeeId: string) {
    setTeamDraft(current => {
      const members = new Set(current.memberEmployeeIds);
      if (members.has(employeeId)) {
        members.delete(employeeId);
      } else {
        members.add(employeeId);
      }
      members.delete(current.supervisorEmployeeId);
      return {
        ...current,
        memberEmployeeIds: Array.from(members),
        updatedAt: Date.now(),
      };
    });
  }

  function toggleDraftEmployee(employeeId: string) {
    setDraft(current => {
      const assigned = new Set(current.assignedEmployeeIds);
      if (assigned.has(employeeId)) {
        assigned.delete(employeeId);
      } else {
        assigned.add(employeeId);
      }
      assigned.delete(current.supervisorEmployeeId);
      const assignedEmployees = employees.filter(employee => assigned.has(employee.id));
      const assignedTeams = projectTeams.filter(team => current.assignedTeamIds.includes(team.id));
      return {
        ...current,
        assignedEmployeeIds: assignedEmployees.map(employee => employee.id),
        teamRoles: [
          ...assignedTeams.map(team => team.name),
          ...assignedEmployees.map(employee => getEmployeeRoleDefinition(employee, roles)?.title ?? employee.role),
        ],
        updatedAt: Date.now(),
      };
    });
  }

  function selectDraftSupervisor(employeeId: string) {
    const supervisor = employees.find(employee => employee.id === employeeId);
    updateDraft({
      supervisorEmployeeId: employeeId,
      supervisorRole: supervisor ? getEmployeeRoleDefinition(supervisor, roles)?.title ?? supervisor.role : 'Supervisor',
      assignedEmployeeIds: draft.assignedEmployeeIds.filter(id => id !== employeeId),
    });
  }

  function toggleDraftTeam(teamId: string) {
    setDraft(current => {
      const assigned = new Set(current.assignedTeamIds);
      if (assigned.has(teamId)) {
        assigned.delete(teamId);
      } else {
        assigned.add(teamId);
      }
      const assignedTeams = projectTeams.filter(team => assigned.has(team.id));
      return {
        ...current,
        assignedTeamIds: assignedTeams.map(team => team.id),
        teamRoles: [
          ...assignedTeams.map(team => team.name),
          ...employees
            .filter(employee => current.assignedEmployeeIds.includes(employee.id))
            .map(employee => getEmployeeRoleDefinition(employee, roles)?.title ?? employee.role),
        ],
        updatedAt: Date.now(),
      };
    });
  }

  function buildProjectDeleteTarget(project: SoftwareProjectPlan): DeleteTarget<ProjectDeleteKind> {
    return {
      kind: 'project',
      id: project.id,
      name: project.name,
      detail: 'Delete this saved software project from Project Studio.',
      impact: [
        `${formatProjectStatus(getProjectEffectiveStatus(project))} ${project.mode} project record will be removed.`,
        `${project.artifacts.length} planned artifact entry(ies) and project staffing selections will be removed from the local project list.`,
      ],
    };
  }

  function buildRoleDeleteTarget(role: VirtualRoleDefinition): DeleteTarget<ProjectDeleteKind> {
    const affectedEmployees = employees.filter(employee => (
      employee.roleId === role.id || employee.role.toLowerCase() === role.title.toLowerCase()
    ));
    return {
      kind: 'role',
      id: role.id,
      name: role.title,
      detail: 'Delete this role definition from the shared project role library.',
      impact: [
        `${affectedEmployees.length} employee profile(s) currently reference this role and will be normalized by the existing delete handler.`,
        `${role.responsibilities.length} responsibility entry(ies) and ${role.defaultTools.length} default tool entry(ies) will be removed.`,
      ],
    };
  }

  function buildEmployeeDeleteTarget(employee: VirtualEmployeeProfile): DeleteTarget<ProjectDeleteKind> {
    const assignedProjects = projects.filter(project => (
      project.supervisorEmployeeId === employee.id || project.assignedEmployeeIds.includes(employee.id)
    ));
    const assignedTeams = projectTeams.filter(team => (
      team.supervisorEmployeeId === employee.id || team.memberEmployeeIds.includes(employee.id)
    ));
    return {
      kind: 'employee',
      id: employee.id,
      name: employee.name,
      detail: 'Delete this employee profile from the shared staffing pool.',
      impact: [
        `${assignedProjects.length} project(s) reference this employee directly or as supervisor.`,
        `${assignedTeams.length} project team(s) reference this employee as supervisor or member.`,
      ],
    };
  }

  function buildProjectTeamDeleteTarget(team: ProjectTeamDefinition): DeleteTarget<ProjectDeleteKind> {
    const assignedProjects = projects.filter(project => project.assignedTeamIds.includes(team.id));
    return {
      kind: 'team',
      id: team.id,
      name: team.name,
      detail: 'Delete this reusable project team.',
      impact: [
        `${assignedProjects.length} project(s) currently assign this team.`,
        `${team.memberEmployeeIds.length} member assignment(s) and the team mission will be removed.`,
      ],
    };
  }

  function renderRoleRow(role: VirtualRoleDefinition) {
    const assignedEmployees = employees.filter(employee => (
      employee.roleId === role.id || employee.role.toLowerCase() === role.title.toLowerCase()
    ));
    const summary = `${role.responsibilities.length} responsibilities / ${role.defaultTools.length} tools`;
    return (
      <article className={styles.workbenchRecordRow} key={role.id}>
        <div className={styles.workbenchRecordPrimary}>
          <strong>{role.title}</strong>
          <span>{assignedEmployees.length} employee profile(s)</span>
        </div>
        <span className={styles.workbenchRecordCell}>
          {role.canSupervise ? 'Supervisor-capable' : 'Contributor'}
        </span>
        <span className={styles.workbenchRecordCell} title={role.defaultGoal}>
          {role.defaultGoal}
        </span>
        <span className={styles.workbenchRecordCell}>
          {summary}
        </span>
        <div className={styles.workbenchRecordActions}>
          <button className={styles.secondaryButton} type="button" onClick={() => openRoleEditor(role)} title={`Edit role ${role.title}`}>
            <Icon name="edit" size={14} />
            Edit
          </button>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => openProjectDeleteConfirmation(buildRoleDeleteTarget(role))}
            disabled={roles.length <= 1}
            title={`Delete role ${role.title}`}
          >
            <Icon name="trash" size={14} />
            Delete
          </button>
        </div>
      </article>
    );
  }

  function renderRoleCard(role: VirtualRoleDefinition) {
    const assignedEmployees = employees.filter(employee => (
      employee.roleId === role.id || employee.role.toLowerCase() === role.title.toLowerCase()
    ));
    const summary = `${role.responsibilities.length} responsibilities / ${role.defaultTools.length} tools`;

    return (
      <article className={styles.projectCard} key={role.id}>
        <div className={styles.projectCardHeader}>
          <div>
            <strong>{role.title}</strong>
            <span>{assignedEmployees.length} employee profile(s)</span>
          </div>
        </div>
        <p title={role.defaultGoal}>{role.defaultGoal}</p>
        <dl className={styles.projectCardMeta}>
          <div>
            <dt>Scope</dt>
            <dd>{role.canSupervise ? 'Supervisor-capable' : 'Contributor'}</dd>
          </div>
          <div>
            <dt>Definition</dt>
            <dd>{summary}</dd>
          </div>
        </dl>
        <div className={styles.projectChipList}>
          {role.responsibilities.slice(0, 4).map(responsibility => (
            <span className={styles.projectChip} key={responsibility}>{responsibility}</span>
          ))}
          {role.responsibilities.length > 4 && <span className={styles.projectChip}>+{role.responsibilities.length - 4}</span>}
        </div>
        <div className={styles.projectCardActions}>
          <button className={styles.secondaryButton} type="button" onClick={() => openRoleEditor(role)} title={`Edit role ${role.title}`}>
            <Icon name="edit" size={14} />
            Edit
          </button>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => openProjectDeleteConfirmation(buildRoleDeleteTarget(role))}
            disabled={roles.length <= 1}
            title={`Delete role ${role.title}`}
          >
            <Icon name="trash" size={14} />
            Delete
          </button>
        </div>
      </article>
    );
  }

  function renderEmployeeRow(employee: VirtualEmployeeProfile) {
    const role = getEmployeeRoleDefinition(employee, roles);
    const teamsForEmployee = projectTeams.filter(team => (
      team.supervisorEmployeeId === employee.id || team.memberEmployeeIds.includes(employee.id)
    ));
    const projectsForEmployee = projects.filter(project => (
      project.supervisorEmployeeId === employee.id ||
      project.assignedEmployeeIds.includes(employee.id) ||
      getProjectTeams(project, projectTeams).some(team => (
        team.supervisorEmployeeId === employee.id || team.memberEmployeeIds.includes(employee.id)
      ))
    ));
    const activeWork = employee.currentTask || role?.defaultGoal || 'No current task';

    return (
      <article className={styles.workbenchRecordRow} key={employee.id}>
        <div className={styles.workbenchRecordPrimary}>
          <strong>{employee.name}</strong>
          <span>{projectsForEmployee.length} project(s) / {teamsForEmployee.length} team(s)</span>
        </div>
        <span className={styles.workbenchRecordCell} title={role?.title ?? employee.role}>
          {role?.title ?? employee.role}
        </span>
        <span className={styles.workbenchRecordCell}>
          {employee.status} / {employee.model}
        </span>
        <span className={styles.workbenchRecordCell} title={activeWork}>
          {activeWork}
        </span>
        <div className={`${styles.workbenchRecordActions} ${styles.workbenchRecordActionsWide}`}>
          <button className={styles.secondaryButton} type="button" onClick={() => openEmployeeProfile(employee.id)} title={`View profile for ${employee.name}`}>
            <Icon name="user" size={14} />
            Profile
          </button>
          <button className={styles.secondaryButton} type="button" onClick={() => openEmployeeEditor(employee)} title={`Edit employee ${employee.name}`}>
            <Icon name="edit" size={14} />
            Edit
          </button>
          <button className={styles.secondaryButton} type="button" onClick={() => openProjectDeleteConfirmation(buildEmployeeDeleteTarget(employee))} title={`Delete employee ${employee.name}`}>
            <Icon name="trash" size={14} />
            Delete
          </button>
        </div>
      </article>
    );
  }

  function renderEmployeeCard(employee: VirtualEmployeeProfile, options: { compact?: boolean } = {}) {
    const role = getEmployeeRoleDefinition(employee, roles);
    return (
      <article className={styles.employeeCard} key={employee.id}>
        <div className={styles.employeeCardHeader}>
          <span className={styles.employeeAvatar}>{employee.name.slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>{employee.name}</strong>
            <span>{role?.title ?? employee.role} / {employee.status}</span>
          </div>
        </div>
        {!options.compact && <p>{role?.defaultGoal ?? employee.currentTask}</p>}
        <div className={styles.projectChipList}>
          {(role?.responsibilities ?? employee.permissions).slice(0, 4).map(responsibility => (
            <span className={styles.projectChip} key={responsibility}>{responsibility}</span>
          ))}
        </div>
      </article>
    );
  }

  function renderEmployeeManagementCard(employee: VirtualEmployeeProfile) {
    const role = getEmployeeRoleDefinition(employee, roles);
    const teamsForEmployee = projectTeams.filter(team => (
      team.supervisorEmployeeId === employee.id || team.memberEmployeeIds.includes(employee.id)
    ));
    const projectsForEmployee = projects.filter(project => (
      project.supervisorEmployeeId === employee.id ||
      project.assignedEmployeeIds.includes(employee.id) ||
      getProjectTeams(project, projectTeams).some(team => (
        team.supervisorEmployeeId === employee.id || team.memberEmployeeIds.includes(employee.id)
      ))
    ));
    const activeWork = employee.currentTask || role?.defaultGoal || 'No current task';

    return (
      <article className={styles.projectCard} key={employee.id}>
        <div className={styles.employeeCardHeader}>
          <span className={styles.employeeAvatar}>{employee.name.slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>{employee.name}</strong>
            <span>{role?.title ?? employee.role} / {employee.status}</span>
          </div>
        </div>
        <p title={activeWork}>{activeWork}</p>
        <dl className={styles.projectCardMeta}>
          <div>
            <dt>Assignments</dt>
            <dd>{projectsForEmployee.length} project(s), {teamsForEmployee.length} team(s)</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{employee.model}</dd>
          </div>
        </dl>
        <div className={styles.projectChipList}>
          {(role?.responsibilities ?? employee.permissions).slice(0, 4).map(responsibility => (
            <span className={styles.projectChip} key={responsibility}>{responsibility}</span>
          ))}
        </div>
        <div className={styles.projectCardActions}>
          <button className={styles.secondaryButton} type="button" onClick={() => openEmployeeProfile(employee.id)} title={`View profile for ${employee.name}`}>
            <Icon name="user" size={14} />
            Profile
          </button>
          <button className={styles.secondaryButton} type="button" onClick={() => openEmployeeEditor(employee)} title={`Edit employee ${employee.name}`}>
            <Icon name="edit" size={14} />
            Edit
          </button>
          <button className={styles.secondaryButton} type="button" onClick={() => openProjectDeleteConfirmation(buildEmployeeDeleteTarget(employee))} title={`Delete employee ${employee.name}`}>
            <Icon name="trash" size={14} />
            Delete
          </button>
        </div>
      </article>
    );
  }

  function renderEmployeeProfile(employee: VirtualEmployeeProfile) {
    const role = getEmployeeRoleDefinition(employee, roles);
    const teamsForEmployee = projectTeams.filter(team => (
      team.supervisorEmployeeId === employee.id || team.memberEmployeeIds.includes(employee.id)
    ));
    const projectsForEmployee = projects.filter(project => (
      project.supervisorEmployeeId === employee.id ||
      project.assignedEmployeeIds.includes(employee.id) ||
      getProjectTeams(project, projectTeams).some(team => (
        team.supervisorEmployeeId === employee.id || team.memberEmployeeIds.includes(employee.id)
      ))
    ));

    return (
      <>
        <dl className={styles.detailList}>
          <div>
            <dt>Model</dt>
            <dd>{employee.model}</dd>
          </div>
          <div>
            <dt>Teams</dt>
            <dd>{teamsForEmployee.length}</dd>
          </div>
          <div>
            <dt>Projects</dt>
            <dd>{projectsForEmployee.length}</dd>
          </div>
          <div>
            <dt>Current task</dt>
            <dd>{employee.currentTask}</dd>
          </div>
        </dl>
        <div className={styles.projectChipList}>
          {(role?.responsibilities ?? employee.permissions).map(item => (
            <span className={styles.projectChip} key={item}>{item}</span>
          ))}
        </div>
      </>
    );
  }

  function renderProjectTeamRow(team: ProjectTeamDefinition) {
    const supervisor = getTeamSupervisor(team, employees);
    const members = getTeamMembers(team, employees);
    const assignedProjects = projects.filter(project => project.assignedTeamIds.includes(team.id));

    return (
      <article className={styles.workbenchRecordRow} key={team.id}>
        <div className={styles.workbenchRecordPrimary}>
          <strong>{team.name}</strong>
          <span>{assignedProjects.length} assigned project(s)</span>
        </div>
        <span className={styles.workbenchRecordCell} title={supervisor?.name ?? 'Unassigned'}>
          {supervisor?.name ?? 'Unassigned'}
        </span>
        <span className={styles.workbenchRecordCell}>
          {members.length} member(s)
        </span>
        <span className={styles.workbenchRecordCell} title={team.mission}>
          {team.mission}
        </span>
        <div className={styles.workbenchRecordActions}>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => openProjectTeamEditor(team)}
            title={`Edit team ${team.name}`}
          >
            <Icon name="edit" size={14} />
            Edit
          </button>
          <button className={styles.secondaryButton} type="button" onClick={() => openProjectDeleteConfirmation(buildProjectTeamDeleteTarget(team))} title={`Delete team ${team.name}`}>
            <Icon name="trash" size={14} />
            Delete
          </button>
        </div>
      </article>
    );
  }

  function renderProjectTeamCard(team: ProjectTeamDefinition, options: { compact?: boolean } = {}) {
    const supervisor = getTeamSupervisor(team, employees);
    const members = getTeamMembers(team, employees);
    return (
      <article className={styles.employeeCard} key={team.id}>
        <div className={styles.employeeCardHeader}>
          <span className={styles.employeeAvatar}>{team.name.slice(0, 2).toUpperCase()}</span>
          <div>
            <strong>{team.name}</strong>
            <span>Supervisor: {supervisor?.name ?? 'Unassigned'}</span>
          </div>
        </div>
        <p>{team.mission}</p>
        <div className={styles.projectChipList}>
          {members.slice(0, options.compact ? 3 : 6).map(member => (
            <span className={styles.projectChip} key={member.id}>{member.name}</span>
          ))}
          {members.length === 0 && <span className={styles.projectChip}>No members</span>}
        </div>
      </article>
    );
  }

  function renderProjectTeamManagementCard(team: ProjectTeamDefinition) {
    const supervisor = getTeamSupervisor(team, employees);
    const members = getTeamMembers(team, employees);
    const assignedProjects = projects.filter(project => project.assignedTeamIds.includes(team.id));

    return (
      <article className={styles.projectCard} key={team.id}>
        <div className={styles.projectCardHeader}>
          <div>
            <strong>{team.name}</strong>
            <span>{assignedProjects.length} assigned project(s)</span>
          </div>
        </div>
        <p title={team.mission}>{team.mission}</p>
        <dl className={styles.projectCardMeta}>
          <div>
            <dt>Supervisor</dt>
            <dd>{supervisor?.name ?? 'Unassigned'}</dd>
          </div>
          <div>
            <dt>Members</dt>
            <dd>{members.length} member(s)</dd>
          </div>
        </dl>
        <div className={styles.projectChipList}>
          {members.slice(0, 6).map(member => (
            <span className={styles.projectChip} key={member.id}>{member.name}</span>
          ))}
          {members.length === 0 && <span className={styles.projectChip}>No members</span>}
        </div>
        <div className={styles.projectCardActions}>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => openProjectTeamEditor(team)}
            title={`Edit team ${team.name}`}
          >
            <Icon name="edit" size={14} />
            Edit
          </button>
          <button className={styles.secondaryButton} type="button" onClick={() => openProjectDeleteConfirmation(buildProjectTeamDeleteTarget(team))} title={`Delete team ${team.name}`}>
            <Icon name="trash" size={14} />
            Delete
          </button>
        </div>
      </article>
    );
  }

  function getBoardTasks(project: SoftwareProjectPlan) {
    const latestRun = getProjectLatestRun(project);
    const assignmentTasks = (latestRun?.assignments ?? []).map(assignment => ({
      title: assignment.title,
      status: assignment.status === 'pending'
        ? 'todo'
        : assignment.status === 'running'
          ? 'doing'
          : assignment.status === 'failed'
            ? 'review'
            : 'done',
      employee: employees.find(employee => employee.id === assignment.memberId),
      detail: [
        assignment.description,
        assignment.dependencies.length > 0 ? `Depends on: ${assignment.dependencies.join(', ')}` : '',
        assignment.workspacePath ? `Workspace: ${assignment.workspacePath}` : '',
      ].filter(Boolean).join('\n'),
    }));
    if (assignmentTasks.length > 0) {
      return assignmentTasks;
    }

    const stepTasks = (latestRun?.steps ?? []).map(step => ({
      title: step.assignmentTitle ?? `${step.role} work`,
      status: step.status === 'running' ? 'doing' : step.status === 'failed' ? 'review' : 'done',
      employee: employees.find(employee => employee.id === step.memberId),
      detail: [
        step.dependencyIds?.length ? `Depends on: ${step.dependencyIds.join(', ')}` : '',
        step.workspacePath ? `Workspace: ${step.workspacePath}` : '',
      ].filter(Boolean).join('\n'),
    }));
    if (stepTasks.length > 0) {
      return stepTasks;
    }

    const assigned = getProjectStaffingEmployees(project, employees, roles, projectTeams)
      .filter(employee => employee.id !== project.supervisorEmployeeId);
    const supervisor = getProjectSupervisor(project, employees, roles);
    const employeePool = assigned.length > 0 ? assigned : employees;
    const effectiveStatus = getProjectEffectiveStatus(project);
    const baseTasks = [
      { title: 'Clarify requirements and acceptance criteria', status: 'done', employee: supervisor },
      ...project.artifacts.map((artifact, index) => ({
        title: `Produce ${artifact}`,
        status: effectiveStatus === 'done' ? 'done' : index === 0 ? 'doing' : index === 1 ? 'review' : 'todo',
        employee: employeePool[index % Math.max(employeePool.length, 1)],
      })),
      { title: 'Final integration and release notes', status: effectiveStatus === 'done' ? 'done' : 'todo', employee: supervisor },
    ];

    return baseTasks;
  }

  function renderTaskBoard(project: SoftwareProjectPlan) {
    const tasks = getBoardTasks(project);
    const columns = [
      { id: 'todo', title: 'Todo' },
      { id: 'doing', title: 'Doing' },
      { id: 'review', title: 'Review' },
      { id: 'done', title: 'Done' },
    ];

    return (
      <div className={styles.projectBoard}>
        {columns.map(column => {
          const columnTasks = tasks.filter(task => task.status === column.id);
          return (
            <section className={styles.projectBoardColumn} key={column.id}>
              <div className={styles.projectBoardColumnHeader}>
                <strong>{column.title}</strong>
                <span>{columnTasks.length}</span>
              </div>
              {columnTasks.map(task => (
                <article className={styles.projectTaskCard} key={`${column.id}-${task.title}`}>
                  <strong>{task.title}</strong>
                  <span>
                    {task.employee?.name ?? 'Unassigned'} / {task.employee ? getEmployeeRoleDefinition(task.employee, roles)?.title ?? task.employee.role : 'Contributor'}
                  </span>
                  {'detail' in task && typeof task.detail === 'string' && task.detail && <span>{task.detail}</span>}
                </article>
              ))}
            </section>
          );
        })}
      </div>
    );
  }

  function renderTeamChat(project: SoftwareProjectPlan) {
    const supervisor = getProjectSupervisor(project, employees, roles);
    const assignedTeams = getProjectTeams(project, projectTeams);
    const assigned = getProjectStaffingEmployees(project, employees, roles, projectTeams)
      .filter(employee => employee.id !== supervisor?.id);
    const chatEmployees = [supervisor, ...assigned].filter((employee): employee is VirtualEmployeeProfile => Boolean(employee));
    const messages = [
      { author: supervisor, text: `I will coordinate "${project.name}" and keep work aligned to the project goal.` },
      ...assignedTeams.slice(0, 3).map(team => ({
        author: getTeamSupervisor(team, employees) ?? supervisor,
        text: `Team "${team.name}" is responsible for: ${team.mission}`,
      })),
      ...assigned.slice(0, 4).map((employee, index) => ({
        author: employee,
        text: index === 0
          ? `I am taking the first implementation task and will report blockers here.`
          : index === 1
            ? `I will review architecture and integration risks before code changes fan out.`
            : index === 2
              ? `I will prepare verification coverage for the planned deliverables.`
              : `I am available for the next queued task.`,
      })),
    ];

    return (
      <div className={styles.projectChatList}>
        {messages.map((message, index) => (
          <article className={styles.projectChatMessage} key={`${message.author?.id ?? 'system'}-${index}`}>
            <span className={styles.employeeAvatar}>{message.author?.name.slice(0, 2).toUpperCase() ?? 'CA'}</span>
            <div>
              <strong>{message.author?.name ?? 'CodeAgent'}</strong>
              <p>{message.text}</p>
            </div>
          </article>
        ))}
        {chatEmployees.length === 0 && <span className={styles.mutedText}>Assign employees to start team chat.</span>}
      </div>
    );
  }

  function renderDeliverables(project: SoftwareProjectPlan) {
    const latestRun = getProjectLatestRun(project);
    const effectiveStatus = getProjectEffectiveStatus(project);
    const projectRootPath = project.workspacePath ?? appInfo?.workspacePath ?? workspacePath;
    const projectAutomationTeamId = getProjectAutomationTeamId(project.id);
    function resolveDeliverablePath(targetPath: string): string {
      if (!targetPath.trim()) {
        return projectRootPath;
      }
      return targetPath.startsWith('/')
        ? targetPath
        : joinWorkspacePath(projectRootPath, targetPath);
    }
    function getExpectedArtifactPath(artifact: string, index: number): string {
      const slug = artifact.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `artifact-${index + 1}`;
      return `artifacts/${slug}.md`;
    }
    function renderDeliverableActions(targetPath: string, label = 'Open') {
      const resolvedPath = resolveDeliverablePath(targetPath);
      return (
        <div className={styles.projectDeliverableActions}>
          <button className={styles.textButton} type="button" onClick={() => onOpenWorkspacePath(resolvedPath)} title={`Open ${resolvedPath}`}>
            <Icon name="external" size={13} />
            {label}
          </button>
          <button className={styles.textButton} type="button" onClick={() => onRevealWorkspacePath(resolvedPath)} title={`Reveal ${resolvedPath}`}>
            <Icon name="folder-open" size={13} />
            Reveal
          </button>
        </div>
      );
    }
    const assignmentOutputs = (latestRun?.assignments ?? [])
      .filter(assignment => assignment.output || assignment.error || assignment.workspacePath)
      .map(assignment => ({
        title: assignment.title,
        status: assignment.status === 'succeeded' ? 'Completed' : assignment.status === 'failed' ? 'Needs review' : assignment.status === 'running' ? 'Running' : 'Pending',
        workspacePath: assignment.workspacePath,
        detail: [
          `${assignment.memberName} / ${assignment.role}`,
          assignment.workspacePath ? `Workspace: ${assignment.workspacePath}` : '',
          assignment.output ? assignment.output.slice(0, 240) : assignment.error ? assignment.error.slice(0, 240) : '',
        ].filter(Boolean).join('\n'),
      }));
    const activityOutputs = toolActivities
      .filter(activity => activity.status === 'succeeded' && isProjectToolActivity(activity, project.id, projectAutomationTeamId))
      .map((activity): ProjectGeneratedOutput | null => {
        const outputPath = getToolResultPath(activity);
        if (!outputPath) {
          return null;
        }

        const absolutePath = activity.result && typeof activity.result === 'object' && typeof (activity.result as { absolutePath?: unknown }).absolutePath === 'string'
          ? String((activity.result as { absolutePath?: unknown }).absolutePath)
          : undefined;

        return {
          id: `${project.id}:${absolutePath || outputPath}`,
          projectId: project.id,
          path: outputPath,
          absolutePath,
          toolName: activity.toolName,
          source: activity.scope?.source === 'virtual-team'
            ? 'automation'
            : activity.scope?.channel === 'team' ? 'team-chat' : 'guided-chat',
          summary: activity.resultPreview,
          createdAt: activity.startedAt,
          updatedAt: activity.completedAt ?? activity.startedAt,
        };
      })
      .filter((output: ProjectGeneratedOutput | null): output is ProjectGeneratedOutput => Boolean(output));
    const generatedOutputs = [
      ...(projectGeneratedOutputs[project.id] ?? []),
      ...activityOutputs,
    ].reduce<ProjectGeneratedOutput[]>((outputs, output) => {
      if (!outputs.some(candidate => (
        candidate.id === output.id ||
        candidate.path === output.path ||
        Boolean(candidate.absolutePath && output.absolutePath && candidate.absolutePath === output.absolutePath)
      ))) {
        outputs.push(output);
      }
      return outputs;
    }, []).sort((left, right) => right.updatedAt - left.updatedAt);

    return (
      <div className={styles.projectDeliverables}>
        {generatedOutputs.length > 0 && (
          <div className={styles.projectDeliverableGroupHeader}>
            <strong>Generated files</strong>
            <span>{generatedOutputs.length} tracked output{generatedOutputs.length === 1 ? '' : 's'}</span>
          </div>
        )}
        {generatedOutputs.map(output => (
          <article className={styles.projectDeliverableCard} key={`generated-${output.id}`}>
            <div>
              <strong title={output.absolutePath ?? output.path}>{output.path}</strong>
              <span>{formatProjectOutputSource(output.source)}</span>
            </div>
            <p>{output.summary || `${output.toolName} at ${new Date(output.updatedAt).toLocaleString()}`}</p>
            {renderDeliverableActions(output.absolutePath ?? output.path, 'Open file')}
          </article>
        ))}
        {latestRun?.artifactPath && (
          <article className={styles.projectDeliverableCard}>
            <div>
              <strong>Automation run artifact</strong>
              <span>{latestRun.status === 'succeeded' ? 'Completed' : latestRun.status}</span>
            </div>
            <p>{latestRun.artifactPath}</p>
            {renderDeliverableActions(latestRun.artifactPath, 'Open artifact')}
          </article>
        )}
        {project.artifacts.map((artifact, index) => (
          <article className={styles.projectDeliverableCard} key={artifact}>
            <div>
              <strong>{artifact}</strong>
              <span>{effectiveStatus === 'done' ? 'Completed' : index < 2 ? 'Draft planned' : 'Queued'}</span>
            </div>
            <p>{effectiveStatus === 'done'
              ? latestRun?.summary ?? 'Completed by the latest autonomous project run.'
              : index < 2 ? 'Ready to be produced by the assigned team.' : 'Will be generated after upstream work completes.'}</p>
            {effectiveStatus === 'done' && renderDeliverableActions(getExpectedArtifactPath(artifact, index), 'Open expected file')}
          </article>
        ))}
        {assignmentOutputs.map(output => (
          <article className={styles.projectDeliverableCard} key={`assignment-${output.title}`}>
            <div>
              <strong>{output.title}</strong>
              <span>{output.status}</span>
            </div>
            <p>{output.detail}</p>
            {output.workspacePath && renderDeliverableActions(output.workspacePath, 'Open workspace')}
          </article>
        ))}
        {project.artifacts.length === 0 && generatedOutputs.length === 0 && assignmentOutputs.length === 0 && !latestRun?.artifactPath && (
          <span className={styles.mutedText}>No deliverables or run artifacts recorded yet.</span>
        )}
      </div>
    );
  }

  function getProjectPanelMessages(project: SoftwareProjectPlan, channel: ProjectChatChannel): UiMessage[] {
    const projectChatKey = getProjectChatKey(project.id, channel);
    return projectChatMessages[projectChatKey] ?? createProjectReadyMessages(project, channel);
  }

  function updateProjectChatDraft(project: SoftwareProjectPlan, channel: ProjectChatChannel, value: string) {
    const projectChatKey = getProjectChatKey(project.id, channel);
    setProjectChatDrafts(current => ({
      ...current,
      [projectChatKey]: value,
    }));
  }

  function submitProjectChatDraft(project: SoftwareProjectPlan, channel: ProjectChatChannel) {
    const projectChatKey = getProjectChatKey(project.id, channel);
    const draftValue = projectChatDrafts[projectChatKey] ?? '';
    if (!draftValue.trim() || projectChatSendingKeys.has(projectChatKey)) {
      return;
    }

    setProjectChatDrafts(current => ({
      ...current,
      [projectChatKey]: '',
    }));
    onSendProjectChat(project, channel, draftValue);
  }

  function handleProjectChatKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>,
    project: SoftwareProjectPlan,
    channel: ProjectChatChannel,
  ) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitProjectChatDraft(project, channel);
    }
  }

  async function copyProjectMessage(message: UiMessage) {
    try {
      const imageSummary = formatImageAttachmentSummary(message.imageAttachments ?? []);
      await navigator.clipboard.writeText(imageSummary ? `${message.content}\n\nAttached images: ${imageSummary}` : message.content);
      setCopiedProjectMessageId(message.id);
      window.setTimeout(() => setCopiedProjectMessageId(null), 1500);
    } catch {
      // Copy feedback is non-critical in the project side panel.
    }
  }

  function renderProjectChatSurface(project: SoftwareProjectPlan, channel: ProjectChatChannel) {
    const projectChatKey = getProjectChatKey(project.id, channel);
    const panelMessages = getProjectPanelMessages(project, channel);
    const draftValue = projectChatDrafts[projectChatKey] ?? '';
    const isProjectSending = projectChatSendingKeys.has(projectChatKey);

    return (
      <section className={styles.projectChatSurface}>
        <div className={styles.projectChatTranscript} ref={projectChatTranscriptRef}>
          {panelMessages.map(message => (
            <MessageItem
              key={message.id}
              message={message}
              copied={copiedProjectMessageId === message.id}
              onCopy={() => copyProjectMessage(message)}
            />
          ))}
          {isProjectSending && (
            <div className={styles.typingIndicator} role="status">
              <span />
              <span />
              <span />
            </div>
          )}
        </div>
        <form className={styles.projectChatComposer} onSubmit={event => {
          event.preventDefault();
          submitProjectChatDraft(project, channel);
        }}>
          <textarea
            value={draftValue}
            onChange={event => updateProjectChatDraft(project, channel, event.target.value)}
            onKeyDown={event => handleProjectChatKeyDown(event, project, channel)}
            placeholder={channel === 'team' ? 'Send direction to the supervisor or team...' : 'Reply in this project...'}
            rows={3}
            disabled={isProjectSending}
            aria-label={channel === 'team' ? 'Team chat message' : 'Project chat message'}
          />
          <div className={styles.composerActions}>
            <button
              className={styles.secondaryButton}
              type="button"
              onClick={() => updateProjectChatDraft(project, channel, '')}
              disabled={!draftValue || isProjectSending}
              title="Clear the draft message"
            >
              <Icon name="x" size={14} />
              Clear
            </button>
            <button className={styles.primaryButton} type="submit" disabled={isProjectSending || !draftValue.trim()} title="Send this project message">
              <Icon name="send" size={14} />
              Send
            </button>
          </div>
        </form>
      </section>
    );
  }

  function renderAutonomousProjectSelector() {
    if (autonomousProjects.length === 0) {
      return <span className={styles.mutedText}>Create an autonomous project before using this view.</span>;
    }

    return (
      <label className={styles.field}>
        <span>Autonomous project</span>
        <select value={selectedAutonomousProject?.id ?? ''} onChange={event => onSelectProject(event.target.value)}>
          {autonomousProjects.map(project => (
            <option value={project.id} key={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
    );
  }

  function renderProjectSelector() {
    if (projects.length === 0) {
      return <span className={styles.mutedText}>Create a project before using this view.</span>;
    }

    return (
      <label className={styles.field}>
        <span>Project</span>
        <select value={selectedProject?.id ?? ''} onChange={event => onSelectProject(event.target.value)}>
          {projects.map(project => (
            <option value={project.id} key={project.id}>
              {project.name} / {project.mode === 'autonomous' ? 'autonomous' : 'guided'}
            </option>
          ))}
        </select>
      </label>
    );
  }

  function renderProjectInsights(project: SoftwareProjectPlan) {
    const assignedTeams = getProjectTeams(project, projectTeams);
    const supervisor = getProjectSupervisor(project, employees, roles);
    const assignedStaff = getProjectStaffingEmployees(project, employees, roles, projectTeams);
    const effectiveStatus = getProjectEffectiveStatus(project);
    const risks = [
      !project.goals.trim()
        ? { title: 'Goals missing', detail: 'Project goals are empty or underspecified.', level: 'Risk' }
        : null,
      project.mode === 'autonomous' && !supervisor
        ? { title: 'Supervisor missing', detail: 'Autonomous execution needs a supervisor employee.', level: 'Risk' }
        : null,
      project.mode === 'autonomous' && assignedTeams.length === 0 && project.assignedEmployeeIds.length === 0
        ? { title: 'No staffing assigned', detail: 'Assign at least one team or direct employee.', level: 'Risk' }
        : null,
      project.artifacts.length < 3
        ? { title: 'Artifact scope thin', detail: 'Expected deliverables may not cover requirements, design, and verification.', level: 'Watch' }
        : null,
      effectiveStatus === 'blocked'
        ? { title: 'Project blocked', detail: 'Resume requires resolving the active blocker.', level: 'Risk' }
        : null,
    ].filter((item): item is { title: string; detail: string; level: string } => Boolean(item));
    const signals = [
      { title: 'Staffing', detail: `${assignedTeams.length} team(s), ${assignedStaff.length} total employee(s)` },
      { title: 'Delivery shape', detail: `${project.artifacts.length} artifact(s), ${getBoardTasks(project).length} planned task(s)` },
      { title: 'Execution posture', detail: project.permissionMode === 'full-access' ? 'Supervisor has full project permission' : 'Risky actions require approval' },
    ];

    return (
      <div className={styles.detailGrid}>
        <section className={styles.detailPanel}>
          <h3>Risk Signals</h3>
          <div className={styles.projectDeliverables}>
            {risks.map(risk => (
              <article className={styles.projectDeliverableCard} key={risk.title}>
                <div>
                  <strong>{risk.title}</strong>
                  <span>{risk.level}</span>
                </div>
                <p>{risk.detail}</p>
              </article>
            ))}
            {risks.length === 0 && <span className={styles.mutedText}>No immediate project risks detected.</span>}
          </div>
        </section>
        <section className={styles.detailPanel}>
          <h3>Operational Signals</h3>
          <div className={styles.projectDeliverables}>
            {signals.map(signal => (
              <article className={styles.projectDeliverableCard} key={signal.title}>
                <div>
                  <strong>{signal.title}</strong>
                  <span>{formatProjectStatus(effectiveStatus)}</span>
                </div>
                <p>{signal.detail}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    );
  }

  function renderExecutionConsole(project: SoftwareProjectPlan) {
    const projectSupervisor = getProjectSupervisor(project, employees, roles);
    const projectAutomationTeamId = getProjectAutomationTeamId(project.id);
    const projectRunRecords = teamRuns
      .filter(run => run.teamId === projectAutomationTeamId)
      .sort((left, right) => right.startedAt - left.startedAt);
    const latestRun = projectRunRecords[0];
    const selectedRunId = activityRunSelections[project.id] ?? '';
    const selectedRun = selectedRunId
      ? projectRunRecords.find(run => run.id === selectedRunId)
      : undefined;
    const visibleRun = selectedRun ?? latestRun;
    const allProjectToolActivities = toolActivities.filter(activity => isProjectToolActivity(activity, project.id, projectAutomationTeamId));
    const projectToolActivities = visibleRun
      ? allProjectToolActivities.filter(activity => activity.scope?.runId === visibleRun.id)
      : allProjectToolActivities;
    const effectiveStatus = getProjectEffectiveStatus(project);
    const isProjectRunning = effectiveStatus === 'active';
    type ActivityTimelineEntry = {
      id: string;
      timestamp: number;
      employee: string;
      title: string;
      summary: string;
      status: string;
    };
    const activityEntries: ActivityTimelineEntry[] = [];
    const pushActivity = (entry: ActivityTimelineEntry | null | undefined) => {
      if (entry) {
        activityEntries.push(entry);
      }
    };

    if (!visibleRun) {
      pushActivity({
        id: `project-ready-${project.id}`,
        timestamp: project.updatedAt,
        employee: 'Project Studio',
        title: 'Project ready',
        summary: `${project.mode === 'autonomous' ? 'Autonomous' : 'Guided'} project is ${formatProjectStatus(effectiveStatus)} and has not started an automation run yet.`,
        status: effectiveStatus,
      });
    }
    if (!visibleRun && projectSupervisor) {
      pushActivity({
        id: `project-supervisor-${project.id}`,
        timestamp: project.updatedAt,
        employee: projectSupervisor.name,
        title: 'Supervisor assigned',
        summary: `${getEmployeeRoleDefinition(projectSupervisor, roles)?.title ?? projectSupervisor.role} owns project coordination.`,
        status: 'ready',
      });
    }

    for (const run of visibleRun ? [visibleRun] : []) {
      pushActivity({
        id: `${run.id}-started`,
        timestamp: run.startedAt,
        employee: run.teamName,
        title: 'Automation run started',
        summary: `${run.objective.slice(0, 180)}${run.objective.length > 180 ? '...' : ''}`,
        status: run.status === 'running' ? 'running' : 'ready',
      });

      for (const assignment of run.assignments ?? []) {
        pushActivity(assignment.startedAt ? {
          id: `${run.id}-${assignment.id}-started`,
          timestamp: assignment.startedAt,
          employee: assignment.memberName,
          title: assignment.title,
          summary: [
            assignment.description,
            assignment.dependencies.length > 0 ? `Depends on ${assignment.dependencies.join(', ')}` : 'No blocking dependencies',
            `Parallel group ${assignment.parallelGroup}`,
          ].join(' / '),
          status: 'running',
        } : null);
        pushActivity(assignment.completedAt ? {
          id: `${run.id}-${assignment.id}-completed`,
          timestamp: assignment.completedAt,
          employee: assignment.memberName,
          title: `${assignment.title} ${assignment.status === 'succeeded' ? 'completed' : 'finished'}`,
          summary: assignment.output?.slice(0, 220) ?? assignment.error?.slice(0, 220) ?? assignment.workspacePath ?? 'Assignment finished.',
          status: assignment.status,
        } : null);
      }

      if (!run.assignments?.length) {
        for (const step of run.steps) {
          pushActivity({
            id: `${run.id}-${step.memberId}-${step.startedAt}-started`,
            timestamp: step.startedAt,
            employee: step.memberName,
            title: step.assignmentTitle ?? `${step.role} work started`,
            summary: step.dependencyIds?.length ? `Depends on ${step.dependencyIds.join(', ')}` : step.workspacePath ?? 'Worker started.',
            status: 'running',
          });
          pushActivity(step.completedAt ? {
            id: `${run.id}-${step.memberId}-${step.completedAt}-completed`,
            timestamp: step.completedAt,
            employee: step.memberName,
            title: step.assignmentTitle ? `${step.assignmentTitle} completed` : `${step.role} work completed`,
            summary: step.output?.slice(0, 220) ?? step.error?.slice(0, 220) ?? 'Worker finished.',
            status: step.status,
          } : null);
        }
      }

      pushActivity(run.completedAt ? {
        id: `${run.id}-completed`,
        timestamp: run.completedAt,
        employee: run.teamName,
        title: `Automation run ${run.status}`,
        summary: run.summary ?? run.error ?? run.artifactPath ?? `Run ${run.status}.`,
        status: run.status,
      } : null);
    }

    for (const activity of projectToolActivities) {
      pushActivity({
        id: `${activity.id}-tool-start`,
        timestamp: activity.startedAt,
        employee: activity.scope?.memberName ?? activity.scope?.teamName ?? 'Automation',
        title: `Tool call: ${activity.toolName}`,
        summary: activity.scope?.assignmentTitle
          ? `${activity.scope.assignmentTitle} / ${summarizeToolResult(activity.args)}`
          : summarizeToolResult(activity.args),
        status: activity.status === 'running' ? 'running' : 'ready',
      });
      pushActivity(activity.completedAt ? {
        id: `${activity.id}-tool-complete`,
        timestamp: activity.completedAt,
        employee: activity.scope?.memberName ?? activity.scope?.teamName ?? 'Automation',
        title: `Tool ${activity.status}`,
        summary: activity.error ?? activity.resultPreview ?? `${activity.toolName} finished${activity.duration ? ` in ${activity.duration} ms` : ''}.`,
        status: activity.status,
      } : null);
    }

    if (isProjectRunning && !visibleRun) {
      pushActivity({
        id: `project-${project.id}-starting`,
        timestamp: Date.now(),
        employee: projectSupervisor?.name ?? 'Supervisor',
        title: 'Automation run starting',
        summary: 'The project run has been requested and the planner is preparing assignments.',
        status: 'running',
      });
    }

    const timelineEntries = activityEntries
      .sort((left, right) => left.timestamp - right.timestamp)
      .slice(-160);

    return (
      <section className={styles.detailPanel}>
        <div className={styles.panelHeader}>
          <div>
            <h3>Activity Timeline</h3>
            <span>
              {visibleRun
                ? `${visibleRun.id === latestRun?.id ? 'Current run' : 'Past run'}: ${visibleRun.status} / ${projectToolActivities.length} tool call(s)`
                : 'No automation run yet'}
            </span>
          </div>
          {projectRunRecords.length > 0 && (
            <label className={styles.activityRunPicker}>
              <span>Run</span>
              <select
                value={visibleRun?.id ?? ''}
                onChange={event => setActivityRunSelections(current => ({
                  ...current,
                  [project.id]: event.target.value,
                }))}
              >
                {projectRunRecords.map((run, index) => (
                  <option value={run.id} key={run.id}>
                    {index === 0 ? 'Current' : 'Past'} / {run.status} / {new Date(run.startedAt).toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className={styles.projectTimeline}>
          {timelineEntries.map(entry => (
            <article className={styles.projectTimelineItem} key={entry.id}>
              <div className={styles.projectTimelineMarker} />
              <div className={styles.projectTimelineContent}>
                <div className={styles.projectTimelineContentHeader}>
                  <strong>{entry.title}</strong>
                  <time dateTime={new Date(entry.timestamp).toISOString()}>
                    {new Date(entry.timestamp).toLocaleString()}
                  </time>
                </div>
                <span>{entry.employee}</span>
                <p>{entry.summary}</p>
                <em>{entry.status}</em>
              </div>
            </article>
          ))}
          {timelineEntries.length === 0 && (
            <span className={styles.mutedText}>
              {isProjectRunning ? 'Automation run is starting.' : 'No activity recorded for this project yet.'}
            </span>
          )}
        </div>
      </section>
    );
  }

  function renderArtifactsExplorer(project: SoftwareProjectPlan) {
    return (
      <section className={styles.detailPanel}>
        <h3>Artifact Explorer</h3>
        <div className={styles.projectDeliverables}>
          {project.artifacts.map((artifact, index) => {
            const slug = artifact.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `artifact-${index + 1}`;
            return (
              <article className={styles.projectDeliverableCard} key={artifact}>
                <div>
                  <strong>{artifact}</strong>
                  <span>{index < 2 ? 'Planned' : 'Queued'}</span>
                </div>
                <p>{`artifacts/${slug}.md`}</p>
              </article>
            );
          })}
          {project.artifacts.length === 0 && <span className={styles.mutedText}>No artifacts defined.</span>}
        </div>
      </section>
    );
  }

  function renderProjectTimeline(project: SoftwareProjectPlan) {
    const tasks = getBoardTasks(project);
    return (
      <section className={styles.detailPanel}>
        <h3>Timeline</h3>
        <div className={styles.projectDeliverables}>
          {tasks.map((task, index) => (
            <article className={styles.projectDeliverableCard} key={`${task.title}-${index}`}>
              <div>
                <strong>{task.title}</strong>
                <span>{task.status}</span>
              </div>
              <p>{task.employee ? `${task.employee.name} / ${getEmployeeRoleDefinition(task.employee, roles)?.title ?? task.employee.role}` : 'Unassigned'}</p>
            </article>
          ))}
        </div>
      </section>
    );
  }

  function renderGovernance(project: SoftwareProjectPlan) {
    const projectSupervisor = getProjectSupervisor(project, employees, roles);
    return (
      <div className={styles.detailGrid}>
        <section className={styles.detailPanel}>
          <h3>Approval Policy</h3>
          <dl className={styles.detailList}>
            <div>
              <dt>Mode</dt>
              <dd>{project.permissionMode === 'full-access' ? 'Full supervisor permission' : 'Supervised approvals'}</dd>
            </div>
            <div>
              <dt>Supervisor</dt>
              <dd>{projectSupervisor?.name ?? 'Unassigned'}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{formatProjectStatus(getProjectEffectiveStatus(project))}</dd>
            </div>
          </dl>
        </section>
        <section className={styles.detailPanel}>
          <h3>Tool Posture</h3>
          <dl className={styles.detailList}>
            <div>
              <dt>Provider</dt>
              <dd>{activeProviderLabel}</dd>
            </div>
            <div>
              <dt>MCP tools</dt>
              <dd>{mcpTools.length}</dd>
            </div>
            <div>
              <dt>MCP servers</dt>
              <dd>{mcpServers.length}</dd>
            </div>
          </dl>
        </section>
      </div>
    );
  }

  function renderProjectFormFields() {
    return (
      <div className={styles.settingsGrid}>
        <label className={styles.field}>
          <span>Project name</span>
          <input value={draft.name} onChange={event => updateDraft({ name: event.target.value })} />
        </label>
        <label className={styles.field}>
          <span>Project type</span>
          <select
            value={draft.mode}
            onChange={event => {
              const mode = event.target.value as SoftwareProjectMode;
              updateDraft({
                mode,
                permissionMode: mode === 'autonomous' ? 'full-access' : 'supervised',
              });
            }}
          >
            <option value="guided">Guided human/app project</option>
            <option value="autonomous">Autonomous project</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>Status</span>
          <select value={draft.status} onChange={event => updateDraft({ status: event.target.value as SoftwareProjectStatus })}>
            <option value="idea">Idea</option>
            <option value="planning">Planning</option>
            <option value="active">Running</option>
            <option value="stopped">Stopped</option>
            <option value="blocked">Blocked</option>
            <option value="done">Done</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>Workspace path</span>
          <input value={draft.workspacePath ?? appInfo?.workspacePath ?? ''} onChange={event => updateDraft({ workspacePath: event.target.value })} />
        </label>
        <label className={`${styles.field} ${styles.fieldWide}`}>
          <span>Idea</span>
          <textarea value={draft.idea} onChange={event => updateDraft({ idea: event.target.value })} rows={4} />
        </label>
        <label className={`${styles.field} ${styles.fieldWide}`}>
          <span>Goals</span>
          <textarea value={draft.goals} onChange={event => updateDraft({ goals: event.target.value })} rows={4} />
        </label>
        <label className={`${styles.field} ${styles.fieldWide}`}>
          <span>Software artifacts</span>
          <textarea
            value={draft.artifacts.join('\n')}
            onChange={event => updateDraft({ artifacts: normalizeStringList(event.target.value.split('\n'), DEFAULT_PROJECT_ARTIFACTS) })}
            rows={6}
          />
        </label>
        {draft.mode === 'autonomous' && (
          <>
            <label className={styles.field}>
              <span>Supervisor employee</span>
              <select value={draft.supervisorEmployeeId} onChange={event => selectDraftSupervisor(event.target.value)}>
                {employees.map(employee => (
                  <option value={employee.id} key={employee.id}>
                    {employee.name} / {getEmployeeRoleDefinition(employee, roles)?.title ?? employee.role}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Execution permissions</span>
              <select value={draft.permissionMode} onChange={event => updateDraft({ permissionMode: event.target.value as VirtualTeamPermissionMode })}>
                <option value="full-access">Full access supervisor</option>
                <option value="supervised">Ask for risky actions</option>
              </select>
            </label>
            <div className={`${styles.field} ${styles.fieldWide}`}>
              <span>Assigned teams</span>
              <div className={styles.employeeAssignGrid}>
                {projectTeams.map(team => (
                  <label className={styles.employeeAssignOption} key={team.id}>
                    <input
                      type="checkbox"
                      checked={draft.assignedTeamIds.includes(team.id)}
                      onChange={() => toggleDraftTeam(team.id)}
                    />
                    <span>{team.name}</span>
                    <em>{team.mission}</em>
                  </label>
                ))}
                {projectTeams.length === 0 && <span className={styles.mutedText}>Create teams before assigning them to a project.</span>}
              </div>
            </div>
            <div className={`${styles.field} ${styles.fieldWide}`}>
              <span>Direct employees</span>
              <div className={styles.employeeAssignGrid}>
                {employees
                  .filter(employee => employee.id !== draft.supervisorEmployeeId)
                  .map(employee => (
                    <label className={styles.employeeAssignOption} key={employee.id}>
                      <input
                        type="checkbox"
                        checked={draft.assignedEmployeeIds.includes(employee.id)}
                        onChange={() => toggleDraftEmployee(employee.id)}
                      />
                      <span>{employee.name}</span>
                      <em>{getEmployeeRoleDefinition(employee, roles)?.title ?? employee.role}</em>
                    </label>
                  ))}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  function saveProjectDraftAndClose() {
    const project = saveDraft();
    onSelectProject(project.id);
    closeProjectEditorPanel();
  }

  function saveProjectDraftAndOpenPrimaryAction() {
    const project = saveDraft();
    onSelectProject(project.id);
    setProjectActionProjectId(project.id);
    setProjectEditorPanel(project.mode === 'autonomous' ? 'project-org' : 'project-chat');
  }

  function renderProjectFormPanel() {
    return (
      <WorkbenchEditorPanel
        title={projects.some(project => project.id === draft.id) ? 'Edit Project' : 'New Project'}
        subtitle={draft.mode === 'autonomous' ? 'Autonomous staffing, permissions, and deliverables' : 'Guided idea, goals, and deliverables'}
        onClose={closeProjectEditorPanel}
        footer={(
          <div className={styles.toolRouterActions}>
            <button className={styles.primaryButton} type="button" onClick={saveProjectDraftAndClose} title="Save this project and close the panel">
              <Icon name="save" size={14} />
              Save Project
            </button>
            <button className={styles.secondaryButton} type="button" onClick={saveProjectDraftAndOpenPrimaryAction} title={draft.mode === 'autonomous' ? 'Save this project and open its team view' : 'Save this project and open its chat'}>
              <Icon name={draft.mode === 'autonomous' ? 'network' : 'chat'} size={14} />
              {draft.mode === 'autonomous' ? 'Save And View Team' : 'Save And Open Chat'}
            </button>
          </div>
        )}
      >
        {renderProjectFormFields()}
      </WorkbenchEditorPanel>
    );
  }

  function renderProjectDeleteConfirmation() {
    if (!projectDeleteTarget) {
      return null;
    }

    return (
      <WorkbenchEditorPanel
        title={`Delete ${projectDeleteTarget.kind}`}
        subtitle={projectDeleteTarget.name}
        onClose={closeProjectEditorPanel}
        footer={(
          <div className={styles.toolRouterActions}>
            <button className={styles.dangerButton} type="button" onClick={confirmProjectDelete} title={`Confirm deletion of ${projectDeleteTarget.name}`}>
              <Icon name="trash" size={14} />
              Confirm Delete
            </button>
            <button className={styles.secondaryButton} type="button" onClick={closeProjectEditorPanel} title="Cancel deletion and close the panel">
              <Icon name="x" size={14} />
              Cancel
            </button>
          </div>
        )}
      >
        <section className={styles.deleteConfirmation}>
          <strong>{projectDeleteTarget.detail}</strong>
          <span>This action updates local Project Studio state immediately.</span>
          <ul>
            {projectDeleteTarget.impact.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </WorkbenchEditorPanel>
    );
  }

  function renderGuidedProjectChat(project: SoftwareProjectPlan) {
    return (
      <div className={styles.projectRailChatBody}>
        <p className={styles.mutedText}>{summarizeProjectGoals(project)}</p>
        {renderProjectChatSurface(project, 'guided')}
      </div>
    );
  }

  function renderProjectOrganization(project: SoftwareProjectPlan) {
    const supervisor = getProjectSupervisor(project, employees, roles);
    const assignedTeams = getProjectTeams(project, projectTeams);
    const directEmployees = getProjectAssignedEmployees(project, employees, roles);

    return (
      <>
        <section className={styles.detailPanel}>
          <div className={styles.panelHeader}>
            <div>
              <h3>Team Organization</h3>
              <span>{project.name}</span>
            </div>
            <button className={styles.secondaryButton} type="button" onClick={() => editProject(project)} title="Edit project staffing and team assignments">
              Edit Members
            </button>
          </div>
          <p className={styles.mutedText}>{summarizeProjectGoals(project)}</p>
          <div className={styles.projectTeamDiagram}>
            {supervisor ? (
              <div className={styles.projectSupervisorNode}>
                <span>Supervisor acting for human</span>
                <strong>{supervisor.name}</strong>
                <em>{getEmployeeRoleDefinition(supervisor, roles)?.title ?? supervisor.role} / {project.permissionMode === 'full-access' ? 'Full permission' : 'Supervised'}</em>
              </div>
            ) : (
              <span className={styles.mutedText}>No supervisor assigned.</span>
            )}
            <div className={styles.employeeGrid}>
              {assignedTeams.map(team => renderProjectTeamCard(team, { compact: true }))}
              {assignedTeams.length === 0 && <span className={styles.mutedText}>No teams assigned to this project.</span>}
            </div>
            <div className={styles.projectSupervisorRow}>
              <span>Direct employees</span>
              <strong>{directEmployees.length}</strong>
              <em>Assigned outside teams</em>
            </div>
            <div className={styles.employeeGrid}>
              {directEmployees.map(employee => renderEmployeeCard(employee, { compact: true }))}
              {directEmployees.length === 0 && <span className={styles.mutedText}>No direct employees assigned outside teams.</span>}
            </div>
          </div>
        </section>
      </>
    );
  }

  function renderProjectActionPanel() {
    const project = projectActionProject;
    if (!project) {
      return null;
    }

    if (projectEditorPanel === 'project-chat') {
      return (
        <WorkbenchEditorPanel title="Project Chat" subtitle={project.name} onClose={closeProjectEditorPanel} wide>
          {renderGuidedProjectChat(project)}
        </WorkbenchEditorPanel>
      );
    }

    if (projectEditorPanel === 'project-org') {
      return (
        <WorkbenchEditorPanel title="Team Organization" subtitle={project.name} onClose={closeProjectEditorPanel} wide>
          {renderProjectOrganization(project)}
        </WorkbenchEditorPanel>
      );
    }

    if (projectEditorPanel === 'project-board') {
      return (
        <WorkbenchEditorPanel title="Task Board" subtitle={project.name} onClose={closeProjectEditorPanel} wide>
          {renderTaskBoard(project)}
        </WorkbenchEditorPanel>
      );
    }

    if (projectEditorPanel === 'project-execution') {
      return (
        <WorkbenchEditorPanel title="Activity" subtitle={project.name} onClose={closeProjectEditorPanel} wide>
          {renderExecutionConsole(project)}
        </WorkbenchEditorPanel>
      );
    }

    if (projectEditorPanel === 'project-team-chat') {
      return (
        <WorkbenchEditorPanel title="Team Chat" subtitle={project.name} onClose={closeProjectEditorPanel} wide>
          <div className={styles.projectRailChatBody}>
            <p className={styles.mutedText}>{summarizeProjectGoals(project)}</p>
            {renderProjectChatSurface(project, 'team')}
          </div>
        </WorkbenchEditorPanel>
      );
    }

    if (projectEditorPanel === 'project-deliverables') {
      return (
        <WorkbenchEditorPanel title="Deliverables" subtitle={project.name} onClose={closeProjectEditorPanel} wide>
          {renderDeliverables(project)}
        </WorkbenchEditorPanel>
      );
    }

    return null;
  }

  function getLifecycleButton(project: SoftwareProjectPlan, showLabel = false) {
    if (project.mode !== 'autonomous') {
      return null;
    }
    const effectiveStatus = getProjectEffectiveStatus(project);
    const buttonClassName = showLabel ? styles.secondaryButton : `${styles.secondaryButton} ${styles.projectIconButton}`;
    const iconSize = showLabel ? 14 : 15;

    const renderLifecycleButton = (status: SoftwareProjectStatus, icon: IconName, label: string, title: string) => (
      <button className={buttonClassName} type="button" onClick={() => onSetProjectStatus(project.id, status)} title={title} aria-label={title}>
        <Icon name={icon} size={iconSize} />
        {showLabel && label}
      </button>
    );

    if (runningProjectIds.has(project.id)) {
      return renderLifecycleButton('stopped', 'stop', 'Stop', 'Stop this running autonomous project');
    }

    if (effectiveStatus === 'active') {
      return renderLifecycleButton('stopped', 'stop', 'Stop', 'Stop this autonomous project');
    }

    if (effectiveStatus === 'stopped') {
      return renderLifecycleButton('active', 'play', 'Resume', 'Resume this autonomous project');
    }

    if (effectiveStatus === 'blocked') {
      return renderLifecycleButton('active', 'rotate', 'Retry', 'Retry this blocked autonomous project');
    }

    if (effectiveStatus === 'done') {
      return renderLifecycleButton('active', 'rotate', 'Re-run', 'Run this completed autonomous project again');
    }

    if (effectiveStatus === 'idea' || effectiveStatus === 'planning') {
      return renderLifecycleButton('active', 'play', 'Start', 'Start this autonomous project');
    }

    return null;
  }

  function renderProjectPortfolioActions(project: SoftwareProjectPlan, variant: 'compact' | 'expanded') {
    const showLabel = variant === 'expanded';
    const buttonClassName = showLabel ? styles.secondaryButton : `${styles.secondaryButton} ${styles.projectIconButton}`;
    const iconSize = showLabel ? 14 : 15;
    const actionsClassName = showLabel
      ? styles.projectCardActions
      : `${styles.workbenchRecordActions} ${styles.projectRecordActions}`;

    const renderActionButton = (
      panel: ProjectEditorPanelId,
      icon: IconName,
      label: string,
      title: string,
    ) => (
      <button className={buttonClassName} type="button" onClick={() => openProjectActionPanel(project, panel)} title={title} aria-label={title}>
        <Icon name={icon} size={iconSize} />
        {showLabel && label}
      </button>
    );

    return (
      <div className={actionsClassName}>
        {project.mode === 'guided' ? (
          <>
            {renderActionButton('project-chat', 'chat', 'Chat', 'Open this guided project chat')}
            {renderActionButton('project-deliverables', 'archive', 'Deliverables', 'View project deliverables')}
          </>
        ) : (
          <>
            {getLifecycleButton(project, showLabel)}
            {renderActionButton('project-org', 'network', 'Team', 'View team organization for this project')}
            {renderActionButton('project-board', 'board', 'Board', 'Open this project task board')}
            {renderActionButton('project-execution', 'activity', 'Activity', 'Open this project activity')}
            {renderActionButton('project-team-chat', 'message', 'Team Chat', 'Open this autonomous team chat')}
            {renderActionButton('project-deliverables', 'archive', 'Deliverables', 'View project deliverables')}
          </>
        )}
        <button className={buttonClassName} type="button" onClick={() => editProject(project)} title="Edit this project" aria-label="Edit this project">
          <Icon name="edit" size={iconSize} />
          {showLabel && 'Edit'}
        </button>
        <button className={buttonClassName} type="button" onClick={() => openProjectDeleteConfirmation(buildProjectDeleteTarget(project))} title="Delete this project" aria-label="Delete this project">
          <Icon name="trash" size={iconSize} />
          {showLabel && 'Delete'}
        </button>
      </div>
    );
  }

  function renderProjectRow(project: SoftwareProjectPlan) {
    const assignedTeams = getProjectTeams(project, projectTeams);
    const assignedStaff = getProjectStaffingEmployees(project, employees, roles, projectTeams);
    const effectiveStatus = getProjectEffectiveStatus(project);

    return (
      <article className={`${styles.workbenchRecordRow} ${styles.projectRecordRow} ${getProjectStatusRowClassName(effectiveStatus)}`} key={project.id}>
        <div className={styles.workbenchRecordPrimary}>
          <strong>{project.name}</strong>
          <span>{project.mode === 'autonomous' ? 'Autonomous' : 'Guided'} / {formatProjectStatus(effectiveStatus)}</span>
        </div>
        <span className={styles.workbenchRecordCell} title={summarizeProjectGoals(project)}>
          {summarizeProjectGoals(project)}
        </span>
        <span className={styles.workbenchRecordCell}>
          {project.mode === 'autonomous'
            ? `${assignedTeams.length} team(s), ${assignedStaff.length} employee(s)`
            : `${project.artifacts.length} deliverable(s)`}
        </span>
        <span className={styles.workbenchRecordCell} title={project.workspacePath ?? appInfo?.workspacePath ?? undefined}>
          {project.workspacePath ?? workspaceTitle}
        </span>
        {renderProjectPortfolioActions(project, 'compact')}
      </article>
    );
  }

  function renderProjectCard(project: SoftwareProjectPlan, action: 'chat' | 'organization') {
    const effectiveStatus = getProjectEffectiveStatus(project);
    const cardClassName = [
      styles.projectCard,
      getProjectStatusCardClassName(effectiveStatus),
      project.id === selectedProject?.id ? styles.projectCardSelected : '',
    ].filter(Boolean).join(' ');
    return (
      <article className={cardClassName} key={project.id}>
        <div className={styles.projectCardHeader}>
          <div>
            <strong>{project.name}</strong>
            <span>{project.mode === 'autonomous' ? 'Autonomous project' : 'Guided build'} / {formatProjectStatus(effectiveStatus)}</span>
          </div>
          <button className={styles.textButton} type="button" onClick={() => editProject(project)} title="Edit this project">
            <Icon name="edit" size={13} />
            Edit
          </button>
        </div>
        <p>{summarizeProjectGoals(project)}</p>
        <div className={styles.projectChipList}>
          {project.artifacts.slice(0, 4).map(artifact => (
            <span className={styles.projectChip} key={artifact}>{artifact}</span>
          ))}
          {project.artifacts.length > 4 && <span className={styles.projectChip}>+{project.artifacts.length - 4}</span>}
        </div>
        {project.mode === 'autonomous' && (
          <div className={styles.projectSupervisorRow}>
            <span>Supervisor</span>
            <strong>{project.supervisorRole}</strong>
            <em>{project.permissionMode === 'full-access' ? 'Full permission' : 'Supervised'}</em>
          </div>
        )}
        <div className={styles.toolRouterActions}>
          <button
            className={styles.secondaryButton}
            type="button"
            title={action === 'organization' ? 'View this project team' : 'Open this project chat'}
            onClick={() => {
              if (action === 'organization') {
                openProjectActionPanel(project, 'project-org');
                return;
              }
              openProjectActionPanel(project, 'project-chat');
            }}
          >
            <Icon name={action === 'organization' ? 'network' : 'chat'} size={14} />
            {action === 'organization' ? 'Team' : 'Open Chat'}
          </button>
          <button className={styles.secondaryButton} type="button" onClick={() => onSelectProject(project.id)} title="Select this project">
            <Icon name="check" size={14} />
            Select
          </button>
          <button className={styles.secondaryButton} type="button" onClick={() => openProjectDeleteConfirmation(buildProjectDeleteTarget(project))} title="Delete this project">
            <Icon name="trash" size={14} />
            Delete
          </button>
        </div>
      </article>
    );
  }

  function renderProjectPortfolioCard(project: SoftwareProjectPlan) {
    const assignedTeams = getProjectTeams(project, projectTeams);
    const assignedStaff = getProjectStaffingEmployees(project, employees, roles, projectTeams);
    const effectiveStatus = getProjectEffectiveStatus(project);
    const workspace = project.workspacePath ?? workspaceTitle;
    const cardClassName = [
      styles.projectCard,
      styles.projectPortfolioCard,
      getProjectStatusCardClassName(effectiveStatus),
      project.id === selectedProject?.id ? styles.projectCardSelected : '',
    ].filter(Boolean).join(' ');

    return (
      <article className={cardClassName} key={project.id}>
        <div className={styles.projectCardHeader}>
          <div>
            <strong>{project.name}</strong>
            <span>{project.mode === 'autonomous' ? 'Autonomous project' : 'Guided project'} / {formatProjectStatus(effectiveStatus)}</span>
          </div>
          <span className={`${styles.projectStatusBadge} ${getProjectStatusBadgeClassName(effectiveStatus)}`}>{formatProjectStatus(effectiveStatus)}</span>
        </div>
        <p title={summarizeProjectGoals(project)}>{summarizeProjectGoals(project)}</p>
        <dl className={styles.projectCardMeta}>
          <div>
            <dt>Scope</dt>
            <dd>
              {project.mode === 'autonomous'
                ? `${assignedTeams.length} team(s), ${assignedStaff.length} employee(s)`
                : `${project.artifacts.length} deliverable(s)`}
            </dd>
          </div>
          <div>
            <dt>Workspace</dt>
            <dd title={workspace}>{workspace}</dd>
          </div>
        </dl>
        <div className={styles.projectChipList}>
          {project.artifacts.slice(0, 4).map(artifact => (
            <span className={styles.projectChip} key={artifact}>{artifact}</span>
          ))}
          {project.artifacts.length > 4 && <span className={styles.projectChip}>+{project.artifacts.length - 4}</span>}
        </div>
        {renderProjectPortfolioActions(project, 'expanded')}
      </article>
    );
  }

  function renderProjectMetricBar(segments: Array<{ label: string; value: number; className: string }>, total: number) {
    const visibleSegments = segments.filter(segment => segment.value > 0);

    return (
      <div className={styles.projectMetricChart}>
        <div className={styles.projectMetricBar} aria-label="Project metric distribution">
          {visibleSegments.length > 0 ? visibleSegments.map(segment => {
            const width = total > 0 ? Math.max(8, (segment.value / total) * 100) : 0;
            return (
              <span
                className={`${styles.projectMetricSegment} ${segment.className}`}
                key={segment.label}
                style={{ width: `${width}%` }}
                title={`${segment.label}: ${segment.value}`}
              />
            );
          }) : <span className={styles.projectMetricEmpty}>No data</span>}
        </div>
        <div className={styles.projectMetricLegend}>
          {segments.map(segment => (
            <span key={segment.label}>
              <i className={segment.className} />
              {segment.label}: {segment.value}
            </span>
          ))}
        </div>
      </div>
    );
  }

  function getProjectStatusRowClassName(status: SoftwareProjectStatus): string {
    if (status === 'active') {
      return styles.projectRecordRowActive;
    }
    if (status === 'planning') {
      return styles.projectRecordRowPlanning;
    }
    if (status === 'blocked') {
      return styles.projectRecordRowBlocked;
    }
    if (status === 'stopped') {
      return styles.projectRecordRowStopped;
    }
    if (status === 'done') {
      return styles.projectRecordRowDone;
    }
    return styles.projectRecordRowIdea;
  }

  function getProjectStatusCardClassName(status: SoftwareProjectStatus): string {
    if (status === 'active') {
      return styles.projectStatusCardActive;
    }
    if (status === 'planning') {
      return styles.projectStatusCardPlanning;
    }
    if (status === 'blocked') {
      return styles.projectStatusCardBlocked;
    }
    if (status === 'stopped') {
      return styles.projectStatusCardStopped;
    }
    if (status === 'done') {
      return styles.projectStatusCardDone;
    }
    return styles.projectStatusCardIdea;
  }

  function getProjectStatusBadgeClassName(status: SoftwareProjectStatus): string {
    if (status === 'active') {
      return styles.projectStatusBadgeActive;
    }
    if (status === 'planning') {
      return styles.projectStatusBadgePlanning;
    }
    if (status === 'blocked') {
      return styles.projectStatusBadgeBlocked;
    }
    if (status === 'stopped') {
      return styles.projectStatusBadgeStopped;
    }
    if (status === 'done') {
      return styles.projectStatusBadgeDone;
    }
    return styles.projectStatusBadgeIdea;
  }

  function renderProjectPagination() {
    if (projects.length <= PROJECT_LIST_PAGE_SIZE) {
      return null;
    }

    return (
      <div className={styles.projectPager}>
        <span>
          Showing {projectPageFirstRecord}-{projectPageLastRecord} of {projects.length}
        </span>
        <div className={styles.projectPagerControls}>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => setProjectPage(page => Math.max(1, page - 1))}
            disabled={normalizedProjectPage <= 1}
            title="Previous project page"
          >
            <Icon name="chevron-left" size={14} />
            Previous
          </button>
          <strong>Page {normalizedProjectPage} / {projectPageCount}</strong>
          <button
            className={styles.secondaryButton}
            type="button"
            onClick={() => setProjectPage(page => Math.min(projectPageCount, page + 1))}
            disabled={normalizedProjectPage >= projectPageCount}
            title="Next project page"
          >
            Next
            <Icon name="chevron-right" size={14} />
          </button>
        </div>
      </div>
    );
  }

  const projectDetailViewClassName = projectRailOpen
    ? `${styles.detailView} ${styles.detailViewWithRail} ${projectRailWide ? styles.detailViewWithWideRail : ''}`
    : styles.detailView;

  return (
    <section className={projectDetailViewClassName} aria-label="Projects">
      {projectEditorPanel === 'project' && renderProjectFormPanel()}
      {projectEditorPanel === 'delete' && renderProjectDeleteConfirmation()}
      {renderProjectActionPanel()}

      {visibleActiveSection === 'studio' && (
        <>
          <div className={styles.detailHero}>
            <span className={styles.detailEyebrow}>Current workspace</span>
            <h2>Turn ideas into software projects</h2>
            <p title={appInfo?.workspacePath || undefined}>{appInfo?.workspacePath || 'Workspace path unavailable'}</p>
          </div>

          <div className={styles.detailGrid}>
            <section className={styles.detailPanel}>
              <h3>Project Portfolio</h3>
              <div className={styles.projectMetricHeadline}>
                <strong>{projects.length}</strong>
                <span>Total project(s)</span>
              </div>
              {renderProjectMetricBar(projectModeMetrics, projects.length)}
              <p className={styles.mutedText}>Use project row actions to open chat, team, board, or deliverables.</p>
            </section>
            <section className={styles.detailPanel}>
              <h3>Project Status</h3>
              <div className={styles.projectMetricHeadline}>
                <strong>{activeProjects.length}</strong>
                <span>Active project(s)</span>
              </div>
              {renderProjectMetricBar(projectStatusMetrics, projects.length)}
              <p className={styles.mutedText}>
                Multiple autonomous projects can run at once; the table below is the source of project navigation.
              </p>
            </section>
            <section className={styles.detailPanel}>
              <h3>Project Staffing</h3>
              <div className={styles.projectMetricHeadline}>
                <strong>{employees.length}</strong>
                <span>Employee profile(s)</span>
              </div>
              {renderProjectMetricBar(projectStaffingMetrics, projects.length)}
              <dl className={styles.detailList}>
                <div>
                  <dt>Roles</dt>
                  <dd>{roles.length}</dd>
                </div>
                <div>
                  <dt>Teams</dt>
                  <dd>{projectTeams.length}</dd>
                </div>
                <div>
                  <dt>Deliverables</dt>
                  <dd>{deliverableCount}</dd>
                </div>
              </dl>
            </section>
          </div>

          <section className={styles.detailPanel}>
            <div className={styles.panelHeader}>
              <div>
                <h3>Projects</h3>
                <span>{projects.length} saved project(s)</span>
              </div>
              <div className={styles.panelActions}>
                <RecordViewToggle view={projectPortfolioView} onChange={setProjectPortfolioView} label="Project list view" />
                <button className={styles.primaryButton} type="button" onClick={() => startDraft('guided')} title="Create a human-guided project">
                  <Icon name="chat" size={14} />
                  New Guided
                </button>
                <button className={styles.secondaryButton} type="button" onClick={() => startDraft('autonomous')} title="Create an autonomous project">
                  <Icon name="bot" size={14} />
                  New Autonomous
                </button>
              </div>
            </div>
              <div className={styles.projectStatusLegend} aria-label="Project status color legend">
                {projectStatusMetrics.map(segment => (
                  <span key={segment.label} title={`${segment.label}: ${segment.value} project(s)`}>
                    <i className={segment.className} />
                    {segment.label}
                  </span>
                ))}
              </div>
              {projectPortfolioView === 'table' ? (
                <div className={`${styles.workbenchRecordList} ${styles.projectRecordList}`}>
                  <div className={`${styles.workbenchRecordRow} ${styles.workbenchRecordHeader} ${styles.projectRecordRow}`}>
                    <span>Project</span>
                    <span>Goal</span>
                    <span>Scope</span>
                    <span>Workspace</span>
                    <span>Actions</span>
                  </div>
                  {visibleProjects.map(project => renderProjectRow(project))}
                  {projects.length === 0 && <span className={styles.workbenchEmptyState}>No software projects created yet.</span>}
                </div>
              ) : (
                <div className={styles.projectPortfolioGrid}>
                  {visibleProjects.map(project => renderProjectPortfolioCard(project))}
                  {projects.length === 0 && <span className={styles.workbenchEmptyState}>No software projects created yet.</span>}
                </div>
              )}
              {renderProjectPagination()}
          </section>
        </>
      )}

      {visibleActiveSection === 'roles' && (
        <div className={styles.workbenchSplit}>
          <section className={`${styles.detailPanel} ${styles.workbenchMain}`}>
            <div className={styles.panelHeader}>
              <div>
                <h3>Roles</h3>
                <span>{roles.length} project role definition(s)</span>
              </div>
              <div className={styles.panelActions}>
                <RecordViewToggle view={roleListView} onChange={setRoleListView} label="Role list view" />
                <button className={styles.primaryButton} type="button" onClick={openNewRoleEditor} title="Create a new role definition">
                  <Icon name="plus" size={14} />
                  New Role
                </button>
              </div>
            </div>
            {roleListView === 'table' ? (
              <div className={styles.workbenchRecordList}>
                <div className={`${styles.workbenchRecordRow} ${styles.workbenchRecordHeader}`}>
                  <span>Role</span>
                  <span>Scope</span>
                  <span>Default goal</span>
                  <span>Definition</span>
                  <span>Actions</span>
                </div>
                {roles.map(role => renderRoleRow(role))}
                {roles.length === 0 && <span className={styles.mutedText}>No roles configured.</span>}
              </div>
            ) : (
              <div className={styles.recordCardGrid}>
                {roles.map(role => renderRoleCard(role))}
                {roles.length === 0 && <span className={styles.workbenchEmptyState}>No roles configured.</span>}
              </div>
            )}
          </section>

          {projectEditorPanel === 'role' && (
            <WorkbenchEditorPanel
              title={roles.some(role => role.id === roleDraft.id) ? 'Edit Role' : 'New Role'}
              subtitle="Responsibilities, default goal, and tool expectations"
              onClose={closeProjectEditorPanel}
              footer={(
                <div className={styles.toolRouterActions}>
                  <button className={styles.primaryButton} type="button" onClick={saveRoleDraft} title="Save this role definition">
                    <Icon name="save" size={14} />
                    Save Role
                  </button>
                  <button className={styles.secondaryButton} type="button" onClick={openNewRoleEditor} title="Reset the form for a new role">
                    <Icon name="rotate" size={14} />
                    Reset New
                  </button>
                </div>
              )}
            >
              <div className={styles.settingsGrid}>
                <label className={styles.field}>
                  <span>Role title</span>
                  <input value={roleDraft.title} onChange={event => setRoleDraft(current => ({ ...current, title: event.target.value, updatedAt: Date.now() }))} />
                </label>
                <label className={styles.field}>
                  <span>Can supervise</span>
                  <select value={roleDraft.canSupervise ? 'yes' : 'no'} onChange={event => setRoleDraft(current => ({ ...current, canSupervise: event.target.value === 'yes', updatedAt: Date.now() }))}>
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </label>
                <label className={`${styles.field} ${styles.fieldWide}`}>
                  <span>Default goal</span>
                  <textarea value={roleDraft.defaultGoal} onChange={event => setRoleDraft(current => ({ ...current, defaultGoal: event.target.value, updatedAt: Date.now() }))} rows={3} />
                </label>
                <label className={`${styles.field} ${styles.fieldWide}`}>
                  <span>Responsibilities</span>
                  <textarea
                    value={roleDraft.responsibilities.join('\n')}
                    onChange={event => setRoleDraft(current => ({
                      ...current,
                      responsibilities: normalizeStringList(event.target.value.split('\n'), ['Deliver assigned project responsibilities.']),
                      updatedAt: Date.now(),
                    }))}
                    rows={7}
                  />
                </label>
                <label className={`${styles.field} ${styles.fieldWide}`}>
                  <span>Default tools</span>
                  <textarea
                    value={roleDraft.defaultTools.join('\n')}
                    onChange={event => setRoleDraft(current => ({
                      ...current,
                      defaultTools: normalizeStringList(event.target.value.split('\n'), getDefaultTeamTools(current.title)),
                      updatedAt: Date.now(),
                    }))}
                    rows={4}
                  />
                </label>
              </div>
            </WorkbenchEditorPanel>
          )}
        </div>
      )}

      {visibleActiveSection === 'employees' && (
        <div className={styles.workbenchSplit}>
          <section className={`${styles.detailPanel} ${styles.workbenchMain}`}>
            <div className={styles.panelHeader}>
              <div>
                <h3>Employees</h3>
                <span>{employees.length} reusable employee profile(s)</span>
              </div>
              <div className={styles.panelActions}>
                <RecordViewToggle view={employeeListView} onChange={setEmployeeListView} label="Employee list view" />
                <button className={styles.primaryButton} type="button" onClick={openNewEmployeeEditor} title="Create a new employee profile">
                  <Icon name="plus" size={14} />
                  New Employee
                </button>
              </div>
            </div>
            {employeeListView === 'table' ? (
              <div className={styles.workbenchRecordList}>
                <div className={`${styles.workbenchRecordRow} ${styles.workbenchRecordHeader}`}>
                  <span>Employee</span>
                  <span>Role</span>
                  <span>Status</span>
                  <span>Current work</span>
                  <span>Actions</span>
                </div>
                {employees.map(employee => renderEmployeeRow(employee))}
                {employees.length === 0 && <span className={styles.workbenchEmptyState}>No employees configured.</span>}
              </div>
            ) : (
              <div className={styles.recordCardGrid}>
                {employees.map(employee => renderEmployeeManagementCard(employee))}
                {employees.length === 0 && <span className={styles.workbenchEmptyState}>No employees configured.</span>}
              </div>
            )}
          </section>

          {projectEditorPanel === 'employee-profile' && profileEmployee && (
            <WorkbenchEditorPanel
              title={profileEmployee.name}
              subtitle={`${getEmployeeRoleDefinition(profileEmployee, roles)?.title ?? profileEmployee.role} / ${profileEmployee.status}`}
              onClose={closeProjectEditorPanel}
            >
              {renderEmployeeProfile(profileEmployee)}
            </WorkbenchEditorPanel>
          )}

          {projectEditorPanel === 'employee' && (
            <WorkbenchEditorPanel
              title={employees.some(employee => employee.id === employeeDraft.id) ? 'Edit Employee' : 'New Employee'}
              subtitle="Role, model, permissions, and current assignment"
              onClose={closeProjectEditorPanel}
              footer={(
                <div className={styles.toolRouterActions}>
                  <button className={styles.primaryButton} type="button" onClick={saveEmployeeDraft} title="Save this employee profile">
                    <Icon name="save" size={14} />
                    Save Employee
                  </button>
                  <button className={styles.secondaryButton} type="button" onClick={openNewEmployeeEditor} title="Reset the form for a new employee">
                    <Icon name="rotate" size={14} />
                    Reset New
                  </button>
                </div>
              )}
            >
              <div className={styles.settingsGrid}>
                <label className={styles.field}>
                  <span>Name</span>
                  <input value={employeeDraft.name} onChange={event => setEmployeeDraft(current => ({ ...current, name: event.target.value, updatedAt: Date.now() }))} />
                </label>
                <label className={styles.field}>
                  <span>Role</span>
                  <select value={employeeDraft.roleId || getDefaultRoleId(employeeDraft.role)} onChange={event => selectEmployeeRole(event.target.value)}>
                    {roles.map(role => (
                      <option value={role.id} key={role.id}>
                        {role.title}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Model</span>
                  <input value={employeeDraft.model} onChange={event => setEmployeeDraft(current => ({ ...current, model: event.target.value, updatedAt: Date.now() }))} />
                </label>
                <label className={styles.field}>
                  <span>Status</span>
                  <select value={employeeDraft.status} onChange={event => setEmployeeDraft(current => ({ ...current, status: event.target.value as VirtualEmployeeProfile['status'], updatedAt: Date.now() }))}>
                    <option value="idle">Idle</option>
                    <option value="working">Working</option>
                    <option value="approval">Needs approval</option>
                  </select>
                </label>
                <label className={`${styles.field} ${styles.fieldWide}`}>
                  <span>Current task</span>
                  <input value={employeeDraft.currentTask} onChange={event => setEmployeeDraft(current => ({ ...current, currentTask: event.target.value, updatedAt: Date.now() }))} />
                </label>
                <label className={`${styles.field} ${styles.fieldWide}`}>
                  <span>Permissions</span>
                  <textarea
                    value={employeeDraft.permissions.join('\n')}
                    onChange={event => setEmployeeDraft(current => ({
                      ...current,
                      permissions: normalizeStringList(event.target.value.split('\n'), DEFAULT_EMPLOYEE_PERMISSIONS),
                      updatedAt: Date.now(),
                    }))}
                    rows={5}
                  />
                </label>
              </div>
            </WorkbenchEditorPanel>
          )}
        </div>
      )}

      {visibleActiveSection === 'teams' && (
        <div className={styles.workbenchSplit}>
          <section className={`${styles.detailPanel} ${styles.workbenchMain}`}>
            <div className={styles.panelHeader}>
              <div>
                <h3>Teams</h3>
                <span>{projectTeams.length} reusable project team(s)</span>
              </div>
              <div className={styles.panelActions}>
                <RecordViewToggle view={teamListView} onChange={setTeamListView} label="Team list view" />
                <button className={styles.primaryButton} type="button" onClick={openNewProjectTeamEditor} title="Create a new reusable team">
                  <Icon name="plus" size={14} />
                  New Team
                </button>
              </div>
            </div>
            {teamListView === 'table' ? (
              <div className={styles.workbenchRecordList}>
                <div className={`${styles.workbenchRecordRow} ${styles.workbenchRecordHeader}`}>
                  <span>Team</span>
                  <span>Supervisor</span>
                  <span>Members</span>
                  <span>Mission</span>
                  <span>Actions</span>
                </div>
                {projectTeams.map(team => renderProjectTeamRow(team))}
                {projectTeams.length === 0 && <span className={styles.workbenchEmptyState}>No project teams configured.</span>}
              </div>
            ) : (
              <div className={styles.recordCardGrid}>
                {projectTeams.map(team => renderProjectTeamManagementCard(team))}
                {projectTeams.length === 0 && <span className={styles.workbenchEmptyState}>No project teams configured.</span>}
              </div>
            )}
          </section>

          {projectEditorPanel === 'team' && (
            <WorkbenchEditorPanel
              title={projectTeams.some(team => team.id === teamDraft.id) ? 'Edit Team' : 'New Team'}
              subtitle="Mission, supervisor, and members"
              onClose={closeProjectEditorPanel}
              footer={(
                <div className={styles.toolRouterActions}>
                  <button className={styles.primaryButton} type="button" onClick={saveTeamDraft} title="Save this reusable team">
                    <Icon name="save" size={14} />
                    Save Team
                  </button>
                  <button className={styles.secondaryButton} type="button" onClick={openNewProjectTeamEditor} title="Reset the form for a new team">
                    <Icon name="rotate" size={14} />
                    Reset New
                  </button>
                </div>
              )}
            >
              <div className={styles.settingsGrid}>
                <label className={styles.field}>
                  <span>Team name</span>
                  <input value={teamDraft.name} onChange={event => setTeamDraft(current => ({ ...current, name: event.target.value, updatedAt: Date.now() }))} />
                </label>
                <label className={styles.field}>
                  <span>Supervisor</span>
                  <select value={teamDraft.supervisorEmployeeId} onChange={event => selectTeamSupervisor(event.target.value)}>
                    {employees.map(employee => (
                      <option value={employee.id} key={employee.id}>
                        {employee.name} / {getEmployeeRoleDefinition(employee, roles)?.title ?? employee.role}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`${styles.field} ${styles.fieldWide}`}>
                  <span>Mission</span>
                  <textarea value={teamDraft.mission} onChange={event => setTeamDraft(current => ({ ...current, mission: event.target.value, updatedAt: Date.now() }))} rows={4} />
                </label>
                <div className={`${styles.field} ${styles.fieldWide}`}>
                  <span>Members</span>
                  <div className={styles.employeeAssignGrid}>
                    {employees
                      .filter(employee => employee.id !== teamDraft.supervisorEmployeeId)
                      .map(employee => (
                        <label className={styles.employeeAssignOption} key={employee.id}>
                          <input
                            type="checkbox"
                            checked={teamDraft.memberEmployeeIds.includes(employee.id)}
                            onChange={() => toggleTeamMember(employee.id)}
                          />
                          <span>{employee.name}</span>
                          <em>{getEmployeeRoleDefinition(employee, roles)?.title ?? employee.role}</em>
                        </label>
                      ))}
                  </div>
                </div>
              </div>
            </WorkbenchEditorPanel>
          )}
        </div>
      )}

      {visibleActiveSection === 'new' && (
        <section className={styles.detailPanel}>
          <div className={styles.panelHeader}>
            <div>
              <h3>Project Definition</h3>
              <span>{draft.mode === 'autonomous' ? 'Autonomous project' : 'Guided project chat'}</span>
            </div>
          </div>

          <div className={styles.settingsGrid}>
            <label className={styles.field}>
              <span>Project name</span>
              <input value={draft.name} onChange={event => updateDraft({ name: event.target.value })} />
            </label>
            <label className={styles.field}>
              <span>Project type</span>
              <select
                value={draft.mode}
                onChange={event => {
                  const mode = event.target.value as SoftwareProjectMode;
                  updateDraft({
                    mode,
                    permissionMode: mode === 'autonomous' ? 'full-access' : 'supervised',
                  });
                }}
              >
                <option value="guided">Guided human/app project</option>
                <option value="autonomous">Autonomous project</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>Status</span>
              <select value={draft.status} onChange={event => updateDraft({ status: event.target.value as SoftwareProjectStatus })}>
                <option value="idea">Idea</option>
                <option value="planning">Planning</option>
                <option value="active">Running</option>
                <option value="stopped">Stopped</option>
                <option value="blocked">Blocked</option>
                <option value="done">Done</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>Workspace path</span>
              <input value={draft.workspacePath ?? appInfo?.workspacePath ?? ''} onChange={event => updateDraft({ workspacePath: event.target.value })} />
            </label>
            <label className={`${styles.field} ${styles.fieldWide}`}>
              <span>Idea</span>
              <textarea value={draft.idea} onChange={event => updateDraft({ idea: event.target.value })} rows={4} />
            </label>
            <label className={`${styles.field} ${styles.fieldWide}`}>
              <span>Goals</span>
              <textarea value={draft.goals} onChange={event => updateDraft({ goals: event.target.value })} rows={4} />
            </label>
            <label className={`${styles.field} ${styles.fieldWide}`}>
              <span>Software artifacts</span>
              <textarea
                value={draft.artifacts.join('\n')}
                onChange={event => updateDraft({ artifacts: normalizeStringList(event.target.value.split('\n'), DEFAULT_PROJECT_ARTIFACTS) })}
                rows={6}
              />
            </label>
            {draft.mode === 'autonomous' && (
              <>
                <label className={styles.field}>
                  <span>Supervisor employee</span>
                  <select value={draft.supervisorEmployeeId} onChange={event => selectDraftSupervisor(event.target.value)}>
                    {employees.map(employee => (
                      <option value={employee.id} key={employee.id}>
                        {employee.name} / {getEmployeeRoleDefinition(employee, roles)?.title ?? employee.role}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Execution permissions</span>
                  <select value={draft.permissionMode} onChange={event => updateDraft({ permissionMode: event.target.value as VirtualTeamPermissionMode })}>
                    <option value="full-access">Full access supervisor</option>
                    <option value="supervised">Ask for risky actions</option>
                  </select>
                </label>
                <div className={`${styles.field} ${styles.fieldWide}`}>
                  <span>Assigned teams</span>
                  <div className={styles.employeeAssignGrid}>
                    {projectTeams.map(team => (
                      <label className={styles.employeeAssignOption} key={team.id}>
                        <input
                          type="checkbox"
                          checked={draft.assignedTeamIds.includes(team.id)}
                          onChange={() => toggleDraftTeam(team.id)}
                        />
                        <span>{team.name}</span>
                        <em>{team.mission}</em>
                      </label>
                    ))}
                    {projectTeams.length === 0 && <span className={styles.mutedText}>Create teams before assigning them to a project.</span>}
                  </div>
                </div>
                <div className={`${styles.field} ${styles.fieldWide}`}>
                  <span>Direct employees</span>
                  <div className={styles.employeeAssignGrid}>
                    {employees
                      .filter(employee => employee.id !== draft.supervisorEmployeeId)
                      .map(employee => (
                        <label className={styles.employeeAssignOption} key={employee.id}>
                          <input
                            type="checkbox"
                            checked={draft.assignedEmployeeIds.includes(employee.id)}
                            onChange={() => toggleDraftEmployee(employee.id)}
                          />
                          <span>{employee.name}</span>
                          <em>{getEmployeeRoleDefinition(employee, roles)?.title ?? employee.role}</em>
                        </label>
                      ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className={styles.toolRouterActions}>
            <button className={styles.primaryButton} type="button" onClick={saveDraft} title="Save this project">
              <Icon name="save" size={14} />
              Save Project
            </button>
            {draft.mode === 'autonomous' ? (
              <button className={styles.secondaryButton} type="button" onClick={saveDraftAndViewOrganization} title="Save this autonomous project and view its team organization">
                <Icon name="network" size={14} />
                Save And View Team
              </button>
            ) : (
              <button className={styles.secondaryButton} type="button" onClick={saveDraftAndOpenProjectChat} title="Save this guided project and open chat">
                <Icon name="chat" size={14} />
                Save And Open Chat
              </button>
            )}
          </div>
        </section>
      )}

      {visibleActiveSection === 'guided' && (
        <section className={styles.detailPanel}>
          <h3>Guided Builds</h3>
          <div className={styles.projectList}>
            {guidedProjects.map(project => renderProjectCard(project, 'chat'))}
            {guidedProjects.length === 0 && <span className={styles.mutedText}>No guided projects yet.</span>}
          </div>
        </section>
      )}

      {visibleActiveSection === 'autonomous' && (
        <>
          <section className={styles.detailPanel}>
            <div className={styles.panelHeader}>
              <div>
                <h3>Selected Autonomous Project</h3>
                <span>{selectedAutonomousProject?.name ?? 'No autonomous project selected'}</span>
              </div>
            </div>
            {renderAutonomousProjectSelector()}
          </section>
          <section className={styles.detailPanel}>
            <div className={styles.panelHeader}>
              <div>
                <h3>Autonomous Project Organization</h3>
                <span>{selectedAutonomousProject?.name ?? 'Select or create an autonomous project'}</span>
              </div>
              {selectedAutonomousProject && (
                <div className={styles.panelActions}>
                  <button className={styles.secondaryButton} type="button" onClick={() => editProject(selectedAutonomousProject)} title="Edit project staffing and team assignments">
                    <Icon name="users" size={14} />
                    Edit Project Members
                  </button>
                </div>
              )}
            </div>
            {selectedAutonomousProject ? (
              <>
                <p className={styles.mutedText}>{summarizeProjectGoals(selectedAutonomousProject)}</p>
                <div className={styles.projectTeamDiagram}>
                  {selectedAutonomousSupervisor ? (
                    <div className={styles.projectSupervisorNode}>
                      <span>Supervisor acting for human</span>
                      <strong>{selectedAutonomousSupervisor.name}</strong>
                      <em>{selectedAutonomousSupervisor.role} / {selectedAutonomousProject.permissionMode === 'full-access' ? 'Full permission' : 'Supervised'}</em>
                    </div>
                  ) : (
                    <span className={styles.mutedText}>No supervisor assigned.</span>
                  )}
                  <div className={styles.employeeGrid}>
                    {selectedAutonomousTeams.map(team => renderProjectTeamCard(team, { compact: true }))}
                    {selectedAutonomousTeams.length === 0 && <span className={styles.mutedText}>No teams assigned to this project.</span>}
                  </div>
                  <div className={styles.projectSupervisorRow}>
                    <span>Direct employees</span>
                    <strong>{selectedAutonomousDirectEmployees.length}</strong>
                    <em>Assigned outside teams</em>
                  </div>
                  <div className={styles.employeeGrid}>
                    {selectedAutonomousDirectEmployees.map(employee => renderEmployeeCard(employee, { compact: true }))}
                    {selectedAutonomousDirectEmployees.length === 0 && <span className={styles.mutedText}>No direct employees assigned outside teams.</span>}
                  </div>
                </div>
                <div className={styles.toolRouterActions}>
                  <button className={styles.secondaryButton} type="button" onClick={() => onChangeSection('board')} title="Open the task board for this autonomous project">
                    <Icon name="board" size={14} />
                    Task Board
                  </button>
                  <button className={styles.secondaryButton} type="button" onClick={() => onChangeSection('chat')} title="Open team chat for this autonomous project">
                    <Icon name="message" size={14} />
                    Team Chat
                  </button>
                  <button className={styles.secondaryButton} type="button" onClick={() => onChangeSection('deliverables')} title="View deliverables for this autonomous project">
                    <Icon name="archive" size={14} />
                    Deliverables
                  </button>
                </div>
              </>
            ) : (
              <span className={styles.mutedText}>No autonomous project yet.</span>
            )}
          </section>
          <section className={styles.detailPanel}>
            <h3>Autonomous Projects</h3>
            <div className={styles.projectList}>
              {autonomousProjects.map(project => renderProjectCard(project, 'organization'))}
              {autonomousProjects.length === 0 && <span className={styles.mutedText}>No autonomous projects yet.</span>}
            </div>
          </section>
        </>
      )}

      {visibleActiveSection === 'insights' && (
        <>
          <section className={styles.detailPanel}>
            <div className={styles.panelHeader}>
              <div>
                <h3>Selected Project</h3>
                <span>{selectedProject?.name ?? 'No project selected'}</span>
              </div>
            </div>
            {renderProjectSelector()}
          </section>
          {selectedProject ? renderProjectInsights(selectedProject) : <span className={styles.mutedText}>Select a project to see insights.</span>}
        </>
      )}

      {visibleActiveSection === 'execution' && (
        <>
          <section className={styles.detailPanel}>
            <div className={styles.panelHeader}>
              <div>
                <h3>Selected Project</h3>
                <span>{selectedProject?.name ?? 'No project selected'}</span>
              </div>
            </div>
            {renderProjectSelector()}
          </section>
          {selectedProject ? renderExecutionConsole(selectedProject) : <span className={styles.mutedText}>Select a project to see execution state.</span>}
        </>
      )}

      {visibleActiveSection === 'artifacts' && (
        <>
          <section className={styles.detailPanel}>
            <div className={styles.panelHeader}>
              <div>
                <h3>Selected Project</h3>
                <span>{selectedProject?.name ?? 'No project selected'}</span>
              </div>
            </div>
            {renderProjectSelector()}
          </section>
          {selectedProject ? renderArtifactsExplorer(selectedProject) : <span className={styles.mutedText}>Select a project to see artifacts.</span>}
        </>
      )}

      {visibleActiveSection === 'timeline' && (
        <>
          <section className={styles.detailPanel}>
            <div className={styles.panelHeader}>
              <div>
                <h3>Selected Project</h3>
                <span>{selectedProject?.name ?? 'No project selected'}</span>
              </div>
            </div>
            {renderProjectSelector()}
          </section>
          {selectedProject ? renderProjectTimeline(selectedProject) : <span className={styles.mutedText}>Select a project to see timeline.</span>}
        </>
      )}

      {visibleActiveSection === 'governance' && (
        <>
          <section className={styles.detailPanel}>
            <div className={styles.panelHeader}>
              <div>
                <h3>Selected Project</h3>
                <span>{selectedProject?.name ?? 'No project selected'}</span>
              </div>
            </div>
            {renderProjectSelector()}
          </section>
          {selectedProject ? renderGovernance(selectedProject) : <span className={styles.mutedText}>Select a project to see governance.</span>}
        </>
      )}

      {visibleActiveSection === 'board' && (
        <section className={styles.detailPanel}>
          <div className={styles.panelHeader}>
            <div>
              <h3>Task Board</h3>
              <span>{selectedAutonomousProject?.name ?? 'No autonomous project selected'}</span>
            </div>
          </div>
          {renderAutonomousProjectSelector()}
          {selectedAutonomousProject ? renderTaskBoard(selectedAutonomousProject) : <span className={styles.mutedText}>Select an autonomous project to see its task board.</span>}
        </section>
      )}

      {visibleActiveSection === 'chat' && (
        <section className={styles.detailPanel}>
          <div className={styles.panelHeader}>
            <div>
              <h3>Team Chat</h3>
              <span>{selectedAutonomousProject?.name ?? 'No autonomous project selected'}</span>
            </div>
          </div>
          {renderAutonomousProjectSelector()}
          {selectedAutonomousProject ? renderTeamChat(selectedAutonomousProject) : <span className={styles.mutedText}>Select an autonomous project to see employee chat.</span>}
        </section>
      )}

      {visibleActiveSection === 'deliverables' && (
        <section className={styles.detailPanel}>
          <div className={styles.panelHeader}>
            <div>
              <h3>Deliverables</h3>
              <span>{selectedAutonomousProject?.name ?? 'No autonomous project selected'}</span>
            </div>
          </div>
          {renderAutonomousProjectSelector()}
          {selectedAutonomousProject ? renderDeliverables(selectedAutonomousProject) : <span className={styles.mutedText}>Select an autonomous project to see deliverables.</span>}
        </section>
      )}

      {visibleActiveSection === 'context' && (
        <>
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
                  <Icon name="arrow-left" size={14} />
                  Up
                </button>
                <button className={styles.secondaryButton} type="button" onClick={onRefreshWorkspace} disabled={isLoadingWorkspaceEntries}>
                  <Icon name="refresh" size={14} />
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
                      <span><Icon name={entry.type === 'directory' ? 'folder' : 'file'} size={13} />{entry.type === 'directory' ? 'Folder' : 'File'}</span>
                      <strong>{entry.name}</strong>
                      <em>{entry.type === 'directory' ? 'Directory' : formatFileSize(entry.size)}</em>
                    </button>
                    <div className={styles.fileEntryActions}>
                      <button className={styles.textButton} type="button" onClick={() => onOpenWorkspacePath(entryPath)}>
                        <Icon name="external" size={13} />
                        Open
                      </button>
                      <button className={styles.textButton} type="button" onClick={() => onRevealWorkspacePath(entryPath)}>
                        <Icon name="folder-open" size={13} />
                        Reveal
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

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
          </div>
        </>
      )}

      {visibleActiveSection === 'overview' && (
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

      {visibleActiveSection === 'files' && (
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
                <Icon name="arrow-left" size={14} />
                Up
              </button>
              <button className={styles.secondaryButton} type="button" onClick={onRefreshWorkspace} disabled={isLoadingWorkspaceEntries}>
                <Icon name="refresh" size={14} />
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
                    <span><Icon name={entry.type === 'directory' ? 'folder' : 'file'} size={13} />{entry.type === 'directory' ? 'Folder' : 'File'}</span>
                    <strong>{entry.name}</strong>
                    <em>{entry.type === 'directory' ? 'Directory' : formatFileSize(entry.size)}</em>
                  </button>
                  <div className={styles.fileEntryActions}>
                    <button className={styles.textButton} type="button" onClick={() => onOpenWorkspacePath(entryPath)}>
                      <Icon name="external" size={13} />
                      Open
                    </button>
                    <button className={styles.textButton} type="button" onClick={() => onRevealWorkspacePath(entryPath)}>
                      <Icon name="folder-open" size={13} />
                      Reveal
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {visibleActiveSection === 'session' && (
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

      {visibleActiveSection === 'runtime' && (
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
  return (
    <section className={styles.detailView} aria-label="Tools">
      {(activeSection === 'bridge' || activeSection === 'mcp') && (
        <div className={styles.pageActionBar}>
          <button className={styles.secondaryButton} type="button" onClick={onRefresh}>
            <Icon name="refresh" size={14} />
            Refresh
          </button>
        </div>
      )}

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
              <Icon name="check" size={14} />
              Expose all
            </button>
            <button className={styles.secondaryButton} type="button" onClick={() => onApplyToolPreset('read-only')}>
              <Icon name="shield" size={14} />
              Read-only only
            </button>
            <button className={styles.secondaryButton} type="button" onClick={() => onApplyToolPreset('mutating-off')}>
              <Icon name="x" size={14} />
              Hide mutating
            </button>
            <button className={styles.secondaryButton} type="button" onClick={() => onApplyPermissionPreset('allow-all')}>
              <Icon name="check" size={14} />
              Allow all
            </button>
            <button className={styles.secondaryButton} type="button" onClick={() => onApplyPermissionPreset('ask-mutating')}>
              <Icon name="shield" size={14} />
              Ask mutating
            </button>
            <button className={styles.secondaryButton} type="button" onClick={() => onApplyPermissionPreset('deny-mutating')}>
              <Icon name="lock" size={14} />
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
                          <Icon name={exposed ? 'x' : 'check'} size={13} />
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
  const [historyDeleteTarget, setHistoryDeleteTarget] = useState<DeleteTarget<'record'> | null>(null);

  function openHistoryDeleteConfirmation(record: LocalHistoryRecord) {
    setHistoryDeleteTarget({
      kind: 'record',
      id: record.id,
      name: getHistoryRecordTitle(record),
      detail: 'Delete this local history record.',
      impact: [
        `${getHistoryRecordTypeLabel(record.type)} record will be removed from local history storage.`,
        record.workspacePath ? `Workspace: ${record.workspacePath}` : 'This does not delete workspace files or project artifacts.',
      ],
    });
  }

  function closeHistoryDeleteConfirmation() {
    setHistoryDeleteTarget(null);
  }

  function confirmHistoryDelete() {
    if (!historyDeleteTarget) {
      return;
    }
    onDeleteRecord(historyDeleteTarget.id);
    closeHistoryDeleteConfirmation();
  }

  function renderHistoryDeleteConfirmation() {
    if (!historyDeleteTarget) {
      return null;
    }

    return (
      <WorkbenchEditorPanel
        title="Delete record"
        subtitle={historyDeleteTarget.name}
        onClose={closeHistoryDeleteConfirmation}
        footer={(
          <div className={styles.toolRouterActions}>
            <button className={styles.dangerButton} type="button" onClick={confirmHistoryDelete}>
              <Icon name="trash" size={14} />
              Confirm Delete
            </button>
            <button className={styles.secondaryButton} type="button" onClick={closeHistoryDeleteConfirmation}>
              <Icon name="x" size={14} />
              Cancel
            </button>
          </div>
        )}
      >
        <section className={styles.deleteConfirmation}>
          <strong>{historyDeleteTarget.detail}</strong>
          <span>This action updates local History state immediately.</span>
          <ul>
            {historyDeleteTarget.impact.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </WorkbenchEditorPanel>
    );
  }

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
      <div className={`${styles.settingsDialog} ${styles.settingsPageForm}`} role="region" aria-label="History">
        <div className={historyDeleteTarget ? `${styles.settingsContent} ${styles.workbenchSplitWithRail}` : styles.settingsContent}>
          <div className={styles.pageActionBar}>
            <button className={styles.secondaryButton} type="button" onClick={onRefresh}>
              <Icon name="refresh" size={14} />
              Refresh
            </button>
          </div>

          {message && <p className={styles.inlineSuccess}>{message}</p>}
          {historyDeleteTarget && renderHistoryDeleteConfirmation()}

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
                onRequestDeleteRecord={openHistoryDeleteConfirmation}
                onRestoreChat={onRestoreChat}
              />
            </>
          )}

          {(activeSection === 'chats' || activeSection === 'tools' || activeSection === 'automation' || activeSection === 'events') && (
            <HistoryRecordList
              records={visibleRecords}
              onRequestDeleteRecord={openHistoryDeleteConfirmation}
              onRestoreChat={onRestoreChat}
            />
          )}

          {activeSection === 'export' && (
            <>
              <SettingsSection title="Export History">
                <p className={styles.mutedText}>Exports are local JSON snapshots. They do not include provider API keys.</p>
                <div className={styles.toolRouterActions}>
                  <button className={styles.secondaryButton} type="button" onClick={() => onExportRecords()}>
                    <Icon name="download" size={14} />
                    Export All
                  </button>
                  <button className={styles.secondaryButton} type="button" onClick={() => onExportRecords('chat-session')}>
                    <Icon name="chat" size={14} />
                    Export Chats
                  </button>
                  <button className={styles.secondaryButton} type="button" onClick={() => onExportRecords('tool-event')}>
                    <Icon name="wrench" size={14} />
                    Export Tool Events
                  </button>
                  <button className={styles.secondaryButton} type="button" onClick={() => onExportRecords('automation-run')}>
                    <Icon name="bot" size={14} />
                    Export Automation
                  </button>
                  <button className={styles.secondaryButton} type="button" onClick={() => onExportRecords('project-event')}>
                    <Icon name="activity" size={14} />
                    Export Project Events
                  </button>
                </div>
              </SettingsSection>

              <SettingsSection title="Export Data">
                <textarea value={exportText} readOnly rows={14} placeholder="Choose an export option above." />
                <div className={styles.toolRouterActions}>
                  <button className={styles.secondaryButton} type="button" disabled={!exportText} onClick={copyExportText}>
                    <Icon name="file" size={14} />
                    Copy JSON
                  </button>
                  <button className={styles.secondaryButton} type="button" disabled={!exportText} onClick={downloadExportText}>
                    <Icon name="download" size={14} />
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
  onRequestDeleteRecord,
  onRestoreChat,
}: {
  records: LocalHistoryRecord[];
  onRequestDeleteRecord: (record: LocalHistoryRecord) => void;
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
                  <Icon name="rotate" size={14} />
                  Restore Chat
                </button>
              )}
              <button className={styles.dangerButton} type="button" onClick={() => onRequestDeleteRecord(record)}>
                <Icon name="trash" size={14} />
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
  roles,
  employees,
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
  roles: VirtualRoleDefinition[];
  employees: VirtualEmployeeProfile[];
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
  const [taskDraftId, setTaskDraftId] = useState('');
  const [taskEnabled, setTaskEnabled] = useState(true);
  const [deviceName, setDeviceName] = useState('Phone');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedSharedEmployeeId, setSelectedSharedEmployeeId] = useState('');
  const [teamDraft, setTeamDraft] = useState<VirtualTeamBlueprint>(() => createVirtualTeamDraft(workspacePath));
  const [automationEditorPanel, setAutomationEditorPanel] = useState<AutomationEditorPanelId | null>(null);
  const [automationDeleteTarget, setAutomationDeleteTarget] = useState<DeleteTarget<AutomationDeleteKind> | null>(null);
  const [scheduledTaskView, setScheduledTaskView] = useState<RecordViewMode>('table');
  const selectedTeam = teams.find(team => team.id === selectedTeamId);
  const recentTeamRuns = selectedTeamId
    ? teamRuns.filter(run => run.teamId === selectedTeamId)
    : teamRuns;
  const taskRailOpen = automationEditorPanel === 'task' || (automationEditorPanel === 'delete' && automationDeleteTarget?.kind === 'task');
  const teamRailOpen = automationEditorPanel === 'team' || (automationEditorPanel === 'delete' && automationDeleteTarget?.kind === 'team');

  useEffect(() => {
    if (!selectedTeamId && teams[0]) {
      setSelectedTeamId(teams[0].id);
      setTeamDraft(cloneVirtualTeamForDraft(teams[0], workspacePath));
    }
  }, [selectedTeamId, teams, workspacePath]);

  function closeAutomationEditorPanel() {
    setAutomationEditorPanel(null);
    setAutomationDeleteTarget(null);
  }

  function openAutomationDeleteConfirmation(target: DeleteTarget<AutomationDeleteKind>) {
    setAutomationDeleteTarget(target);
    setAutomationEditorPanel('delete');
  }

  function confirmAutomationDelete() {
    if (!automationDeleteTarget) {
      return;
    }

    if (automationDeleteTarget.kind === 'task') {
      onDeleteTask(automationDeleteTarget.id);
    } else if (automationDeleteTarget.kind === 'team') {
      onDeleteTeam(automationDeleteTarget.id);
    } else if (automationDeleteTarget.kind === 'device') {
      onRevokeRemoteDevice(automationDeleteTarget.id);
    }

    closeAutomationEditorPanel();
  }

  function openNewTaskEditor() {
    setAutomationDeleteTarget(null);
    setTaskDraftId('');
    setTaskName('Daily project check');
    setTaskPrompt('Summarize git status, failing tests, and next actions for this workspace.');
    setTaskInterval(1440);
    setTaskRetryEnabled(false);
    setTaskMaxRetries(1);
    setTaskRetryDelay(15);
    setTaskNotifySuccess(false);
    setTaskNotifyFailure(true);
    setTaskNotificationChannel('desktop');
    setTaskMissedRunPolicy('run-once');
    setTaskEnabled(true);
    setAutomationEditorPanel('task');
  }

  function openTaskEditor(task: ScheduledTask) {
    setAutomationDeleteTarget(null);
    setTaskDraftId(task.id);
    setTaskName(task.name);
    setTaskPrompt(task.prompt);
    setTaskInterval(task.intervalMinutes);
    setTaskRetryEnabled(Boolean(task.retryPolicy?.enabled));
    setTaskMaxRetries(task.retryPolicy?.maxRetries ?? 1);
    setTaskRetryDelay(task.retryPolicy?.retryDelayMinutes ?? 15);
    setTaskNotifySuccess(Boolean(task.notificationPolicy?.onSuccess));
    setTaskNotifyFailure(task.notificationPolicy?.onFailure !== false);
    setTaskNotificationChannel(task.notificationPolicy?.channel ?? 'desktop');
    setTaskMissedRunPolicy(task.missedRunPolicy ?? 'run-once');
    setTaskEnabled(task.enabled);
    setAutomationEditorPanel('task');
  }

  function saveTaskDraft() {
    onSaveTask({
      id: taskDraftId || undefined,
      name: taskName,
      prompt: taskPrompt,
      intervalMinutes: taskInterval,
      enabled: taskEnabled,
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
    });
    closeAutomationEditorPanel();
  }

  function startNewTeamDraft() {
    const draft = createVirtualTeamDraft(workspacePath);
    setSelectedTeamId('');
    setTeamDraft(draft);
    setAutomationDeleteTarget(null);
    setAutomationEditorPanel('team');
  }

  function selectTeam(team: VirtualTeamBlueprint) {
    setSelectedTeamId(team.id);
    setTeamDraft(cloneVirtualTeamForDraft(team, workspacePath));
    setAutomationDeleteTarget(null);
    setAutomationEditorPanel('team');
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

  function addSharedEmployeeToTeam(employeeId: string) {
    const employee = employees.find(candidate => candidate.id === employeeId);
    if (!employee) {
      return;
    }

    const role = getEmployeeRoleDefinition(employee, roles);
    const member: VirtualTeamMember = {
      id: `member-${employee.id}`,
      name: employee.name,
      role: role?.title ?? employee.role,
      goal: role?.defaultGoal ?? getDefaultTeamGoal(employee.role),
      tools: role?.defaultTools ?? getDefaultTeamTools(employee.role),
    };

    setTeamDraft(current => {
      const members = [
        member,
        ...current.members.filter(candidate => candidate.id !== member.id),
      ];
      return {
        ...current,
        members,
        supervisorId: current.supervisorId || (role?.canSupervise ? member.id : members[0]?.id ?? ''),
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
    closeAutomationEditorPanel();
  }

  function buildScheduledTaskDeleteTarget(task: ScheduledTask): DeleteTarget<AutomationDeleteKind> {
    return {
      kind: 'task',
      id: task.id,
      name: task.name,
      detail: 'Delete this scheduled automation task.',
      impact: [
        `The ${task.enabled ? 'enabled' : 'disabled'} schedule running every ${task.intervalMinutes} minute(s) will be removed.`,
        'Existing task run history remains visible until history retention removes it.',
      ],
    };
  }

  function buildAutomationTeamDeleteTarget(team: VirtualTeamBlueprint): DeleteTarget<AutomationDeleteKind> {
    return {
      kind: 'team',
      id: team.id,
      name: team.name,
      detail: 'Delete this automation team blueprint.',
      impact: [
        `${team.members.length} virtual team member definition(s) will be removed from this blueprint.`,
        'Existing team run records are not deleted by this action.',
      ],
    };
  }

  function buildRemoteDeviceDeleteTarget(device: RemoteControlState['approvedDevices'][number]): DeleteTarget<AutomationDeleteKind> {
    return {
      kind: 'device',
      id: device.id,
      name: device.name,
      detail: 'Revoke this approved remote-control device.',
      impact: [
        'The device token will no longer be accepted for remote approvals.',
        device.lastSeenAt
          ? `Last seen ${new Date(device.lastSeenAt).toLocaleString()}.`
          : `Paired ${new Date(device.createdAt).toLocaleString()}.`,
      ],
    };
  }

  function getScheduledTaskPolicyLabels(task: ScheduledTask) {
    const retryLabel = task.retryPolicy?.enabled
      ? `${task.retryAttempts ?? 0}/${task.retryPolicy.maxRetries} retry`
      : 'Retry off';
    const notifyLabel = `${task.notificationPolicy?.channel ?? 'desktop'} notifications`;

    return { retryLabel, notifyLabel };
  }

  function renderScheduledTaskRow(task: ScheduledTask) {
    const { retryLabel, notifyLabel } = getScheduledTaskPolicyLabels(task);

    return (
      <article className={styles.workbenchRecordRow} key={task.id}>
        <div className={styles.workbenchRecordPrimary}>
          <strong>{task.name}</strong>
          <span>{task.enabled ? 'Enabled' : 'Disabled'} / {task.lastStatus ?? 'never run'}</span>
        </div>
        <span className={styles.workbenchRecordCell}>
          Every {task.intervalMinutes} min
        </span>
        <span className={styles.workbenchRecordCell} title={new Date(task.nextRunAt).toLocaleString()}>
          Next {new Date(task.nextRunAt).toLocaleString()}
        </span>
        <span className={styles.workbenchRecordCell} title={`${task.prompt} / ${retryLabel} / ${notifyLabel}`}>
          {retryLabel} / {notifyLabel}
        </span>
        <div className={`${styles.workbenchRecordActions} ${styles.workbenchRecordActionsWide}`}>
          <button className={styles.secondaryButton} type="button" onClick={() => openTaskEditor(task)}>
            <Icon name="edit" size={14} />
            Edit
          </button>
          <button className={styles.secondaryButton} type="button" onClick={() => onRunTask(task.id)}>
            <Icon name="play" size={14} />
            Run Now
          </button>
          <button className={styles.secondaryButton} type="button" onClick={() => onSetTaskEnabled(task.id, !task.enabled)}>
            <Icon name={task.enabled ? 'pause' : 'play'} size={14} />
            {task.enabled ? 'Disable' : 'Enable'}
          </button>
          <button className={styles.secondaryButton} type="button" onClick={() => openAutomationDeleteConfirmation(buildScheduledTaskDeleteTarget(task))}>
            <Icon name="trash" size={14} />
            Delete
          </button>
        </div>
      </article>
    );
  }

  function renderScheduledTaskCard(task: ScheduledTask) {
    const { retryLabel, notifyLabel } = getScheduledTaskPolicyLabels(task);

    return (
      <article className={styles.projectCard} key={task.id}>
        <div className={styles.projectCardHeader}>
          <div>
            <strong>{task.name}</strong>
            <span>{task.enabled ? 'Enabled' : 'Disabled'} / {task.lastStatus ?? 'never run'}</span>
          </div>
        </div>
        <p title={task.prompt}>{task.prompt}</p>
        <dl className={styles.projectCardMeta}>
          <div>
            <dt>Cadence</dt>
            <dd>Every {task.intervalMinutes} min</dd>
          </div>
          <div>
            <dt>Next Run</dt>
            <dd title={new Date(task.nextRunAt).toLocaleString()}>{new Date(task.nextRunAt).toLocaleString()}</dd>
          </div>
        </dl>
        <div className={styles.projectChipList}>
          <span className={styles.projectChip}>{retryLabel}</span>
          <span className={styles.projectChip}>{notifyLabel}</span>
          <span className={styles.projectChip}>{task.missedRunPolicy ?? 'run-once'}</span>
        </div>
        <div className={styles.projectCardActions}>
          <button className={styles.secondaryButton} type="button" onClick={() => openTaskEditor(task)}>
            <Icon name="edit" size={14} />
            Edit
          </button>
          <button className={styles.secondaryButton} type="button" onClick={() => onRunTask(task.id)}>
            <Icon name="play" size={14} />
            Run Now
          </button>
          <button className={styles.secondaryButton} type="button" onClick={() => onSetTaskEnabled(task.id, !task.enabled)}>
            <Icon name={task.enabled ? 'pause' : 'play'} size={14} />
            {task.enabled ? 'Disable' : 'Enable'}
          </button>
          <button className={styles.secondaryButton} type="button" onClick={() => openAutomationDeleteConfirmation(buildScheduledTaskDeleteTarget(task))}>
            <Icon name="trash" size={14} />
            Delete
          </button>
        </div>
      </article>
    );
  }

  function renderAutomationTeamRow(team: VirtualTeamBlueprint) {
    const teamIsRunning = runningTeamIds.has(team.id) || team.lastStatus === 'running';
    const status = teamIsRunning ? 'running' : team.status;
    const governance = `${team.maxIterations ?? 1} iteration(s) / QA ${team.requireQaSignoff ? 'required' : 'optional'}`;
    const rowClassName = team.id === selectedTeamId
      ? `${styles.workbenchRecordRow} ${styles.workbenchRecordRowSelected}`
      : styles.workbenchRecordRow;

    return (
      <article className={rowClassName} key={team.id}>
        <div className={styles.workbenchRecordPrimary}>
          <strong>{team.name}</strong>
          <span title={team.workspacePath ?? workspacePath}>{team.workspacePath ?? workspacePath}</span>
        </div>
        <span className={styles.workbenchRecordCell}>
          {status} / {getTeamPermissionLabel(team.permissionMode)}
        </span>
        <span className={styles.workbenchRecordCell}>
          {team.members.length} member(s) / {governance}
        </span>
        <span className={styles.workbenchRecordCell} title={`${team.objective}${team.lastResult ? ` / ${team.lastResult}` : ''}`}>
          {team.objective}
        </span>
        <div className={`${styles.workbenchRecordActions} ${styles.workbenchRecordActionsWide}`}>
          <button className={styles.secondaryButton} type="button" onClick={() => selectTeam(team)} disabled={teamIsRunning}>
            <Icon name="edit" size={14} />
            Edit
          </button>
          <button className={styles.secondaryButton} type="button" onClick={() => onRunTeam(team.id)} disabled={teamIsRunning}>
            <Icon name={teamIsRunning ? 'activity' : 'play'} size={14} />
            {teamIsRunning ? 'Running...' : 'Run Team'}
          </button>
          <button
            className={styles.dangerButton}
            type="button"
            onClick={() => openAutomationDeleteConfirmation(buildAutomationTeamDeleteTarget(team))}
            disabled={teamIsRunning}
          >
            <Icon name="trash" size={14} />
            Delete
          </button>
        </div>
      </article>
    );
  }

  function renderAutomationDeleteConfirmation() {
    if (!automationDeleteTarget) {
      return null;
    }

    return (
      <WorkbenchEditorPanel
        title={`Delete ${automationDeleteTarget.kind}`}
        subtitle={automationDeleteTarget.name}
        onClose={closeAutomationEditorPanel}
        footer={(
          <div className={styles.toolRouterActions}>
            <button className={styles.dangerButton} type="button" onClick={confirmAutomationDelete}>
              <Icon name="trash" size={14} />
              Confirm Delete
            </button>
            <button className={styles.secondaryButton} type="button" onClick={closeAutomationEditorPanel}>
              <Icon name="x" size={14} />
              Cancel
            </button>
          </div>
        )}
      >
        <section className={styles.deleteConfirmation}>
          <strong>{automationDeleteTarget.detail}</strong>
          <span>This action updates local Automation state immediately.</span>
          <ul>
            {automationDeleteTarget.impact.map(item => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </WorkbenchEditorPanel>
    );
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
      <div className={`${styles.settingsDialog} ${styles.settingsPageForm}`} role="region" aria-label="Automation">
        <div className={styles.settingsContent}>
          <div className={styles.pageActionBar}>
            <button className={styles.secondaryButton} type="button" onClick={onRefresh}>
              <Icon name="refresh" size={14} />
              Refresh
            </button>
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
                            <Icon name={skill.enabled ? 'pause' : 'play'} size={14} />
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
                      <Icon name="download" size={14} />
                      Export Config
                    </button>
                    <button className={styles.secondaryButton} type="button" onClick={() => onExportProject(true)}>
                      <Icon name="archive" size={14} />
                      Export With Runs
                    </button>
                    <button className={styles.secondaryButton} type="button" disabled={!exportText} onClick={copyAutomationExportText}>
                      <Icon name="file" size={14} />
                      Copy Export
                    </button>
                    <button className={styles.secondaryButton} type="button" disabled={!exportText} onClick={downloadAutomationExportText}>
                      <Icon name="download" size={14} />
                      Download Export
                    </button>
                    <button className={styles.primaryButton} type="button" onClick={onImportProject} disabled={!importText.trim()}>
                      <Icon name="folder-open" size={14} />
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
              <div className={taskRailOpen ? `${styles.workbenchSplit} ${styles.workbenchSplitWithRail}` : styles.workbenchSplit}>
                <div className={styles.workbenchMainStack}>
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
                  <p className={styles.mutedText}>Scheduled tasks use the bridge tool permission policy below. Virtual teams can also be set to full access in the team panel when trusted autonomous work should not pause for approvals.</p>
                  <div className={styles.toolRouterActions}>
                    <button className={styles.primaryButton} type="button" onClick={openNewTaskEditor}>
                      New Task
                    </button>
                  </div>
                </SettingsSection>

                  <SettingsSection title="Configured Tasks">
                    <div className={styles.recordSectionToolbar}>
                      <RecordViewToggle view={scheduledTaskView} onChange={setScheduledTaskView} label="Scheduled task list view" />
                    </div>
                    {scheduledTaskView === 'table' ? (
                      <div className={styles.workbenchRecordList}>
                        <div className={`${styles.workbenchRecordRow} ${styles.workbenchRecordHeader}`}>
                          <span>Task</span>
                          <span>Cadence</span>
                          <span>Next run</span>
                          <span>Policy</span>
                          <span>Actions</span>
                        </div>
                        {tasks.map(task => renderScheduledTaskRow(task))}
                        {tasks.length === 0 && <span className={styles.workbenchEmptyState}>No scheduled tasks configured.</span>}
                      </div>
                    ) : (
                      <div className={styles.recordCardGrid}>
                        {tasks.map(task => renderScheduledTaskCard(task))}
                        {tasks.length === 0 && <span className={styles.workbenchEmptyState}>No scheduled tasks configured.</span>}
                      </div>
                    )}
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
                </div>

                {automationEditorPanel === 'task' && (
                  <WorkbenchEditorPanel
                    title={taskDraftId ? 'Edit Scheduled Task' : 'New Scheduled Task'}
                    subtitle="Prompt, cadence, retries, notifications, and missed-run handling"
                    onClose={closeAutomationEditorPanel}
                    footer={(
                      <div className={styles.toolRouterActions}>
                        <button className={styles.primaryButton} type="button" onClick={saveTaskDraft}>
                          <Icon name="save" size={14} />
                          Save Task
                        </button>
                        <button className={styles.secondaryButton} type="button" onClick={openNewTaskEditor}>
                          <Icon name="rotate" size={14} />
                          Reset New
                        </button>
                      </div>
                    )}
                  >
                    <div className={styles.settingsGrid}>
                      <label className={styles.field}>
                        <span>Name</span>
                        <input value={taskName} onChange={event => setTaskName(event.target.value)} />
                      </label>
                      <label className={styles.field}>
                        <span>Enabled</span>
                        <select value={taskEnabled ? 'yes' : 'no'} onChange={event => setTaskEnabled(event.target.value === 'yes')}>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
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
                  </WorkbenchEditorPanel>
                )}
                {automationEditorPanel === 'delete' && automationDeleteTarget?.kind === 'task' && renderAutomationDeleteConfirmation()}
              </div>
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
                      <Icon name={remoteControl.enabled ? 'pause' : 'play'} size={14} />
                      {remoteControl.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button className={styles.primaryButton} type="button" onClick={() => onCreatePairingCode(deviceName)}>
                      <Icon name="phone" size={14} />
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

                <SettingsSection title="Managed Relay">
                  <dl className={styles.detailList}>
                    <div>
                      <dt>Status</dt>
                      <dd>{remoteControl.relay?.enrollmentStatus ?? 'not-configured'}</dd>
                    </div>
                    <div>
                      <dt>Broker</dt>
                      <dd>{remoteControl.relay?.brokerUrl ?? 'Not configured'}</dd>
                    </div>
                    <div>
                      <dt>Account</dt>
                      <dd>{remoteControl.relay?.accountId ?? 'Not configured'}</dd>
                    </div>
                    <div>
                      <dt>Device</dt>
                      <dd>{remoteControl.relay?.deviceId ?? 'Not configured'}</dd>
                    </div>
                  </dl>
                  <p className={styles.mutedText}>Off-network relay control stays disabled until the managed relay implements identity, encryption, token rotation, audit propagation, and emergency revocation.</p>
                </SettingsSection>

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
                          <button className={styles.dangerButton} type="button" onClick={() => openAutomationDeleteConfirmation(buildRemoteDeviceDeleteTarget(device))}>
                            <Icon name="trash" size={14} />
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
                {automationEditorPanel === 'delete' && automationDeleteTarget?.kind === 'device' && renderAutomationDeleteConfirmation()}
              </>
            )}

            {activeSection === 'permissions' && (
              <>
                <SettingsSection title="Unattended Execution Policy">
                  <p className={styles.mutedText}>Scheduled tasks and supervised virtual teams use these desktop tool policies. Full-access virtual teams skip approval popups but still stay inside workspace and command safety boundaries.</p>
                  <div className={styles.toolRouterActions}>
                    <button className={styles.secondaryButton} type="button" onClick={() => onApplyPermissionPreset('allow-all')}>
                      <Icon name="check" size={14} />
                      Allow All Tools
                    </button>
                    <button className={styles.secondaryButton} type="button" onClick={() => onApplyPermissionPreset('ask-mutating')}>
                      <Icon name="shield" size={14} />
                      Ask Before Changes
                    </button>
                    <button className={styles.dangerButton} type="button" onClick={() => onApplyPermissionPreset('deny-mutating')}>
                      <Icon name="lock" size={14} />
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
          <Icon name="terminal" size={14} />
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
            <Icon name="terminal" size={14} />
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
              <Icon name="x" size={14} />
              Reject
            </button>
            <button className={styles.primaryButton} type="button" onClick={onApprove}>
              <Icon name="check" size={14} />
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
              <Icon name="x" size={14} />
              Reject
            </button>
            <button className={styles.primaryButton} type="button" onClick={onApprove}>
              <Icon name="check" size={14} />
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
              <Icon name="x" size={14} />
              Reject
            </button>
            <button className={styles.primaryButton} type="button" onClick={onApprove}>
              <Icon name="check" size={14} />
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
          <Icon name="x" size={13} />
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
                    <Icon name="external" size={13} />
                    Open
                  </button>
                  <button className={styles.textButton} type="button" onClick={() => onRevealWorkspacePath(filePath)}>
                    <Icon name="folder-open" size={13} />
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
          <Icon name={copied ? 'check' : 'file'} size={13} />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className={styles.messageContent}>
        {message.role === 'tool' ? renderToolMessageContent(message) : renderMessageContent(message.content)}
        {(message.imageAttachments?.length ?? 0) > 0 && renderMessageImages(message.imageAttachments ?? [])}
      </div>
      {message.usage && (
        <div className={styles.messageMeta}>
          {message.usage.inputTokens} input tokens / {message.usage.outputTokens} output tokens
        </div>
      )}
    </article>
  );
}

function renderMessageImages(images: UiImageAttachment[]): React.ReactNode {
  return (
    <div className={styles.messageImageGrid}>
      {images.map(image => (
        <figure className={styles.messageImageItem} key={image.id}>
          {image.dataUrl ? (
            <img src={image.dataUrl} alt={image.name} />
          ) : (
            <div className={styles.messageImagePlaceholder}>
              <Icon name="file" size={18} />
            </div>
          )}
          <figcaption>{[image.name, image.width && image.height ? `${image.width}x${image.height}` : '', formatFileSize(image.size)].filter(Boolean).join(' · ')}</figcaption>
        </figure>
      ))}
    </div>
  );
}

function renderToolMessageContent(message: UiMessage): React.ReactNode {
  const trimmed = message.content.trim();
  const isJsonResult = trimmed.startsWith('```json');

  if (!isJsonResult) {
    return renderMessageContent(message.content);
  }

  return (
    <div className={styles.toolTrace}>
      <p className={styles.toolTraceSummary}>Tool result captured. Expand details only when debugging.</p>
      <details className={styles.toolTraceDetails}>
        <summary>Details</summary>
        {renderMessageContent(message.content)}
      </details>
    </div>
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
  placeholder,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  className?: string;
  placeholder?: string;
}) {
  return (
    <label className={`${styles.field} ${className}`}>
      <span>{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} autoComplete="off" />
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

function getPackageStateLabel(state: string): string {
  switch (state) {
    case 'available':
      return 'Available';
    case 'trial':
      return 'Trial';
    case 'locked':
      return 'Purchase required';
    case 'expired':
      return 'Expired';
    case 'unsupported':
      return 'Unsupported';
    case 'disabled':
      return 'Disabled';
    default:
      return state;
  }
}

function getPackageInstallStateLabel(state: FeaturePackageInstallState): string {
  switch (state) {
    case 'bundled':
      return 'Bundled';
    case 'not-owned':
      return 'Not owned';
    case 'owned-not-installed':
      return 'Install required';
    case 'installed':
      return 'Installed';
    case 'update-available':
      return 'Update available';
    case 'install-failed':
      return 'Install failed';
    case 'remote-service':
      return 'Remote service';
    default:
      return state;
  }
}

function AccountSettingsSection({
  resolution,
  draft,
  onChange,
  onLogin,
  onRegister,
  onForgotPassword,
  onResetPassword,
  onLogout,
  onSync,
  canSync,
  syncing,
}: {
  resolution: FeaturePackageResolution;
  draft: SettingsDraft;
  onChange: (update: Partial<SettingsDraft>) => void;
  onLogin: () => void;
  onRegister: () => void;
  onForgotPassword: () => void;
  onResetPassword: () => void;
  onLogout: () => void;
  onSync: () => void;
  canSync: boolean;
  syncing: boolean;
}) {
  const profile = resolution.profile;
  const isSignedIn = profile.accountStatus === 'signed-in';
  const latestPurchase = profile.purchases[profile.purchases.length - 1];
  const ownedPackages = getOwnedPackageEntries(resolution);
  const ownedPackageNames = ownedPackages.map(entry => entry.manifest.displayName).join(', ');
  return (
    <SettingsSection title="Account">
      <div className={styles.accountOverviewGrid}>
        <article className={styles.accountSummaryCard}>
          <span>Current session</span>
          <strong>{formatAccountTier(profile)}</strong>
          <p>
            {isSignedIn
              ? `${profile.displayName || profile.email} is signed in.`
              : 'You are using CodeAgent as a guest with the free base package.'}
          </p>
        </article>
        <article className={styles.accountSummaryCard}>
          <span>Feature packages</span>
          <strong>{ownedPackages.length > 0 ? formatPackageCount(ownedPackages.length) : 'No paid packages'}</strong>
          <p>
            {isSignedIn
              ? ownedPackageNames || 'No purchased packages are attached to this account yet.'
              : 'Sign in to purchase paid packages.'}
          </p>
        </article>
        <article className={styles.accountSummaryCard}>
          <span>Payment</span>
          <strong>{profile.paymentMethods.length > 0 ? `${profile.paymentMethods.length} card${profile.paymentMethods.length === 1 ? '' : 's'}` : 'No card'}</strong>
          <p>
            {latestPurchase
              ? `Last purchase: ${getPackageDisplayName(resolution, latestPurchase.packageId, latestPurchase.productSku)}`
              : 'Credit card checkout is available from package cards.'}
          </p>
        </article>
      </div>

      <div className={styles.accountPackageShelf}>
        <div className={styles.accountShelfHeader}>
          <div>
            <strong>Purchased packages</strong>
            <span>{isSignedIn ? 'Packages and subscriptions attached to this account.' : 'Sign in to view purchases for this account.'}</span>
          </div>
          <span>{isSignedIn ? profile.subscriptionStatus : 'guest'}</span>
        </div>
        {ownedPackages.length > 0 ? (
          <div className={styles.accountPackageList}>
            {ownedPackages.map(entry => {
              const purchase = getLatestPurchaseForPackage(profile, entry.manifest.id);
              const paymentMethod = profile.paymentMethods.find(method => method.id === purchase?.paymentMethodId);
              return (
                <article className={styles.accountPackageItem} key={entry.manifest.id}>
                  <div className={styles.packageStoreIcon} aria-hidden="true">
                    {getPackageInitials(entry.manifest.displayName)}
                  </div>
                  <div className={styles.accountPackageBody}>
                    <strong>{entry.manifest.displayName}</strong>
                    <span>{entry.manifest.productSku}</span>
                    <p>{entry.manifest.description}</p>
                  </div>
                  <dl className={styles.accountPackageMeta}>
                    <div>
                      <dt>Status</dt>
                      <dd>{getPackageOwnershipLabel(profile, entry, purchase)}</dd>
                    </div>
                    <div>
                      <dt>Price</dt>
                      <dd>{getPackagePriceLabel(entry.manifest)}</dd>
                    </div>
                    <div>
                      <dt>Runtime</dt>
                      <dd>{getPackageInstallStateLabel(entry.installState)}</dd>
                    </div>
                    <div>
                      <dt>Purchased</dt>
                      <dd>{formatPackageDate(purchase?.purchasedAt)}</dd>
                    </div>
                    {paymentMethod && (
                      <div>
                        <dt>Payment</dt>
                        <dd>{paymentMethod.brand} ending {paymentMethod.last4}</dd>
                      </div>
                    )}
                  </dl>
                </article>
              );
            })}
          </div>
        ) : (
          <div className={styles.accountEmptyState}>
            {isSignedIn
              ? 'No paid packages have been purchased for this account yet.'
              : 'Guest sessions include only the free base package.'}
          </div>
        )}
      </div>

      <div className={styles.settingsGrid}>
        <TextSetting
          label="Platform URL"
          value={draft.platformBaseUrl}
          onChange={value => onChange({ platformBaseUrl: value })}
        />
        <TextSetting
          label="Workspace or org ID"
          value={draft.platformOrgId}
          placeholder="optional"
          onChange={value => onChange({ platformOrgId: value })}
        />
        <TextSetting
          label="Email"
          type="email"
          value={draft.accountEmail}
          onChange={value => onChange({ accountEmail: value })}
        />
        <TextSetting
          label="Display name"
          value={draft.accountDisplayName}
          onChange={value => onChange({ accountDisplayName: value })}
        />
        <TextSetting
          label="Platform password"
          type="password"
          value={draft.accountPassword}
          placeholder="required for platform login or reset"
          onChange={value => onChange({ accountPassword: value })}
          className={styles.fieldWide}
        />
        {!isSignedIn && (
          <TextSetting
            label="Reset token"
            value={draft.accountResetToken}
            placeholder="from reset email"
            onChange={value => onChange({ accountResetToken: value })}
            className={styles.fieldWide}
          />
        )}
      </div>

      <div className={styles.dialogActions}>
        {isSignedIn ? (
          <button className={styles.dangerButton} type="button" onClick={onLogout}>
            <Icon name="key" size={14} />
            Sign out
          </button>
        ) : (
          <>
            <button className={styles.primaryButton} type="button" onClick={onLogin}>
              <Icon name="user" size={14} />
              Sign in
            </button>
            <button className={styles.secondaryButton} type="button" onClick={onRegister}>
              <Icon name="plus" size={14} />
              Create account
            </button>
            <button className={styles.secondaryButton} type="button" onClick={onForgotPassword}>
              <Icon name="key" size={14} />
              Send reset
            </button>
            <button className={styles.secondaryButton} type="button" onClick={onResetPassword}>
              <Icon name="refresh" size={14} />
              Reset password
            </button>
          </>
        )}
        {isSignedIn && (
          <button className={styles.secondaryButton} type="button" onClick={onSync} disabled={!canSync || syncing}>
            <Icon name="refresh" size={14} />
            {syncing ? 'Syncing' : 'Sync'}
          </button>
        )}
        <button className={styles.secondaryButton} type="button" onClick={() => onChange({ accountEmail: '', accountDisplayName: '' })}>
          <Icon name="x" size={14} />
          Clear
        </button>
      </div>

      {profile.paymentMethods.length > 0 && (
        <div className={styles.paymentSummaryList}>
          {profile.paymentMethods.map(method => (
            <div key={method.id}>
              <Icon name="credit-card" size={14} />
              <span>{method.brand} ending {method.last4}</span>
              <strong>{method.expMonth.toString().padStart(2, '0')}/{String(method.expYear).slice(-2)}</strong>
            </div>
          ))}
        </div>
      )}
    </SettingsSection>
  );
}

function FeaturePackagesSection({
  resolution,
  onPackageAction,
  onSync,
  canSync,
  syncing,
}: {
  resolution: FeaturePackageResolution;
  onPackageAction: (packageId: string) => void;
  onSync: () => void;
  canSync: boolean;
  syncing: boolean;
}) {
  const profile = resolution.profile;
  const ownedPackages = getOwnedPackageEntries(resolution);
  const isSignedIn = profile.accountStatus === 'signed-in';
  return (
    <SettingsSection title="Feature Packages">
      <div className={styles.packageStoreHeader}>
        <div>
          <span>CodeAgent Store</span>
          <strong>Feature packages for every shell</strong>
          <p>
            {isSignedIn
              ? `${profile.email || profile.displayName} · ${ownedPackages.length > 0 ? `${formatPackageCount(ownedPackages.length)} purchased` : 'No paid packages purchased'}`
              : 'Guest free tier. Sign in before purchasing paid feature packages.'}
          </p>
        </div>
        <dl className={styles.packageStoreSummary}>
          <div>
            <dt>Account</dt>
            <dd>{formatAccountTier(profile)}</dd>
          </div>
          <div>
            <dt>Owned</dt>
            <dd>{ownedPackages.length}</dd>
          </div>
          <div>
            <dt>Catalog</dt>
            <dd>{resolution.packages.length}</dd>
          </div>
        </dl>
        {isSignedIn && (
          <button className={styles.secondaryButton} type="button" onClick={onSync} disabled={!canSync || syncing}>
            <Icon name="refresh" size={14} />
            {syncing ? 'Syncing' : 'Sync'}
          </button>
        )}
      </div>

      {ownedPackages.length > 0 && (
        <div className={styles.packageStoreOwnedShelf}>
          <div className={styles.accountShelfHeader}>
            <div>
              <strong>Purchased</strong>
              <span>Available to this signed-in account after runtime installation.</span>
            </div>
          </div>
          <div className={styles.packageStoreOwnedList}>
            {ownedPackages.map(entry => {
              const purchase = getLatestPurchaseForPackage(profile, entry.manifest.id);
              return (
                <div className={styles.packageStoreOwnedItem} key={entry.manifest.id}>
                  <div className={styles.packageStoreIcon} aria-hidden="true">
                    {getPackageInitials(entry.manifest.displayName)}
                  </div>
                  <div>
                    <strong>{entry.manifest.displayName}</strong>
                    <span>{getPackageOwnershipLabel(profile, entry, purchase)} · {getPackageInstallStateLabel(entry.installState)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className={styles.packageStoreGrid}>
        {resolution.packages.map(entry => {
          const isEntitled = entry.state === 'available' || entry.state === 'trial';
          const isUsable = isEntitled && isPackageRuntimeAvailable(entry.installState);
          const actionLabel = isUsable
            ? 'Manage'
            : isEntitled
              ? 'Install'
            : profile.accountStatus === 'signed-in'
              ? 'Purchase'
              : 'Sign in';
          const statusLabel = isEntitled && !isUsable ? getPackageInstallStateLabel(entry.installState) : getPackageStateLabel(entry.state);
          const purchase = getLatestPurchaseForPackage(profile, entry.manifest.id);
          return (
            <article className={styles.packageStoreCard} key={entry.manifest.id}>
              <div className={styles.packageStoreTopline}>
                <div className={styles.packageStoreIdentity}>
                  <div className={styles.packageStoreIcon} aria-hidden="true">
                    {getPackageInitials(entry.manifest.displayName)}
                  </div>
                  <div>
                    <strong>{entry.manifest.displayName}</strong>
                    <span>{entry.manifest.domain}</span>
                  </div>
                </div>
                <span className={isUsable ? styles.packageStateAvailable : styles.packageStateLocked}>
                  {statusLabel}
                </span>
              </div>

              <p className={styles.packageStoreDescription}>{entry.manifest.description}</p>

              <div className={styles.packageStoreFeatures}>
                {entry.manifest.features.map(feature => (
                  <span key={feature.id}>{feature.title}</span>
                ))}
              </div>

              <dl className={styles.packageStoreMeta}>
                <div>
                  <dt>Price</dt>
                  <dd>{getPackagePriceLabel(entry.manifest)}</dd>
                </div>
                <div>
                  <dt>Tier</dt>
                  <dd>{entry.manifest.tier}</dd>
                </div>
                <div>
                  <dt>Runtime</dt>
                  <dd>{getPackageInstallStateLabel(entry.installState)}</dd>
                </div>
                <div>
                  <dt>Purchase</dt>
                  <dd>{purchase ? formatPackageDate(purchase.purchasedAt) : 'Not purchased'}</dd>
                </div>
                <div>
                  <dt>Distribution</dt>
                  <dd>{getPackageDistributionLabel(entry.manifest)}</dd>
                </div>
                <div>
                  <dt>Protection</dt>
                  <dd>{getPackageSecurityLabel(entry.manifest)}</dd>
                </div>
                <div>
                  <dt>Shells</dt>
                  <dd>{entry.manifest.supportedShells.join(', ')}</dd>
                </div>
              </dl>

              <div className={styles.packageStoreFooter}>
                <span>{entry.reason} {entry.installReason}</span>
                <button
                  className={`${isUsable ? styles.secondaryButton : styles.primaryButton} ${styles.packageStoreAction}`}
                  type="button"
                  onClick={() => onPackageAction(entry.manifest.id)}
                >
                  {actionLabel}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </SettingsSection>
  );
}

function PackagePurchaseDialog({
  manifest,
  profile,
  draft,
  message,
  onChange,
  onSubmit,
  onCancel,
}: {
  manifest: FeaturePackageManifest;
  profile: Required<FeatureEntitlementProfile>;
  draft: PurchaseDraft;
  message: string;
  onChange: (update: Partial<PurchaseDraft>) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <div className={styles.dialogBackdrop} role="presentation">
      <form className={`${styles.reviewDialog} ${styles.purchaseDialog}`} role="dialog" aria-modal="true" aria-labelledby="package-purchase-title" onSubmit={onSubmit}>
        <div className={styles.dialogHeader}>
          <div>
            <h2 id="package-purchase-title">Purchase {manifest.displayName}</h2>
            <p className={styles.reviewSubtitle}>
              {profile.email} · {getPackagePriceLabel(manifest)} · {manifest.productSku}
            </p>
          </div>
          <span className={styles.reviewBadge}>Credit card</span>
        </div>

        <dl className={styles.reviewMeta}>
          <div>
            <dt>Package</dt>
            <dd title={manifest.description}>{manifest.displayName}</dd>
          </div>
          <div>
            <dt>Includes</dt>
            <dd title={manifest.features.map(feature => feature.title).join(', ')}>
              {manifest.features.map(feature => feature.title).join(', ')}
            </dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{formatMoney(manifest.pricing.amountCents, manifest.pricing.currency, manifest.pricing.interval)}</dd>
          </div>
          <div>
            <dt>Install</dt>
            <dd>{getPackageDistributionLabel(manifest)}</dd>
          </div>
        </dl>

        <div className={styles.paymentFormGrid}>
          <TextSetting
            label="Name on card"
            value={draft.nameOnCard}
            onChange={value => onChange({ nameOnCard: value })}
          />
          <TextSetting
            label="Card number"
            value={draft.cardNumber}
            onChange={value => onChange({ cardNumber: value })}
          />
          <TextSetting
            label="Expiration"
            value={draft.expiry}
            placeholder="MM/YY or MM/YYYY"
            onChange={value => onChange({ expiry: value })}
          />
          <TextSetting
            label="CVC"
            type="password"
            value={draft.cvc}
            onChange={value => onChange({ cvc: value })}
          />
          <TextSetting
            label="ZIP or postal code"
            value={draft.postalCode}
            onChange={value => onChange({ postalCode: value })}
            className={styles.fieldWide}
          />
        </div>

        <p className={styles.mutedText}>
          Use MM/YY or MM/YYYY for expiration. Full dates such as 12/1/2028 are accepted as month/year. Card data is used only for this local checkout flow. The app stores the card brand, last four digits, expiration, and purchase receipt, not the full card number or CVC. Paid runtime packages must be installed after purchase before their features are enabled.
        </p>

        <div className={styles.dialogFooter}>
          <span className={styles.settingsMessage}>{message}</span>
          <div className={styles.dialogActions}>
            <button className={styles.secondaryButton} type="button" onClick={onCancel}>
              <Icon name="x" size={14} />
              Cancel
            </button>
            <button className={styles.primaryButton} type="submit">
              <Icon name="credit-card" size={14} />
              Pay {getPackagePriceLabel(manifest)}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function SettingsView({
  activeSection,
  draft,
  message,
  saving,
  featureResolution,
  onChange,
  onClearToken,
  onAccountLogin,
  onAccountRegister,
  onAccountForgotPassword,
  onAccountResetPassword,
  onAccountLogout,
  onPlatformSync,
  canSyncPlatform,
  platformSyncing,
  onPackageAction,
  onSubmit,
}: {
  activeSection: SettingsSectionId;
  draft: SettingsDraft;
  message: string;
  saving: boolean;
  featureResolution: FeaturePackageResolution;
  onChange: (update: Partial<SettingsDraft>) => void;
  onClearToken: () => void;
  onAccountLogin: () => void;
  onAccountRegister: () => void;
  onAccountForgotPassword: () => void;
  onAccountResetPassword: () => void;
  onAccountLogout: () => void;
  onPlatformSync: () => void;
  canSyncPlatform: boolean;
  platformSyncing: boolean;
  onPackageAction: (packageId: string) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const selectedSources = new Set(draft.settingSources.split(',').map(source => source.trim()).filter(Boolean));
  const providerOptions = Object.entries(PROVIDER_DEFAULTS).map(([value, option]) => ({
    value: value as LlmProviderType,
    label: option.label,
  }));
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
      <form className={`${styles.settingsDialog} ${styles.settingsPageForm}`} onSubmit={onSubmit} aria-label="Settings">
        <div className={styles.settingsContent}>
        {activeSection === 'account' && (
          <AccountSettingsSection
            resolution={featureResolution}
            draft={draft}
            onChange={onChange}
            onLogin={onAccountLogin}
            onRegister={onAccountRegister}
            onForgotPassword={onAccountForgotPassword}
            onResetPassword={onAccountResetPassword}
            onLogout={onAccountLogout}
            onSync={onPlatformSync}
            canSync={canSyncPlatform}
            syncing={platformSyncing}
          />
        )}

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
            <SelectSetting
              label="Skin accent"
              value={draft.accentColor}
              options={Object.entries(SKIN_ACCENTS).map(([value, accent]) => ({
                value,
                label: accent.label,
              }))}
              onChange={value => onChange({ accentColor: getSkinAccent(value) })}
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

        {activeSection === 'packages' && (
          <FeaturePackagesSection
            resolution={featureResolution}
            onPackageAction={onPackageAction}
            onSync={onPlatformSync}
            canSync={canSyncPlatform}
            syncing={platformSyncing}
          />
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
        <SettingsSection title="Prompts & Directories">
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
              <Icon name="key" size={14} />
              Clear auth
            </button>
            <button className={styles.primaryButton} type="submit" disabled={saving}>
              <Icon name="save" size={14} />
              {saving ? 'Saving' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
