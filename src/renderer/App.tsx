/**
 * Main Application Component
 * Entry point for the Electron renderer UI
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import semver from 'semver';
import { createSoftwareDeveloperRendererViews } from '../../../code-agent-packages/software-developer/src/renderer';
import { getDefaultTeamGoal, getDefaultTeamTools } from '../../../code-agent-packages/software-developer/src/project-defaults';
import hljs from 'highlight.js/lib/common';
import styles from './App.module.css';
import {
  ipcClient,
  type AppConfig,
  type AppInfo,
  type ChatMessage,
  type ChatMessageContentPart,
  type ChatPerformanceMetrics,
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
  type DesktopPermissionProfile,
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
  type HuggingFaceModel,
  type HuggingFaceModelFile,
  type LocalModelRecord,
  type LocalInferenceStatus,
  type PlatformAuthSession,
} from './ipc-client';
import {
  BASE_FEATURE_PACKAGE_ID,
  FEATURE_PACKAGE_MANIFESTS,
  getFeaturePackageExtensions,
  getFeatureOwnerPackageId,
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
type ChatToolActivityStatus = 'waiting-approval' | 'running' | 'succeeded' | 'failed' | 'rejected';
type AppView = string;
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
  | 'general'
  | 'chat-history'
  | 'model'
  | 'packages'
  | 'io-debug'
  | 'tools-permissions'
  | 'workspace'
  | 'sessions'
  | 'advanced';
type AppSkinAccent = 'blue' | 'teal' | 'violet' | 'graphite' | 'ember';
type LocalModelPreparationPhase = 'idle' | 'resolving' | 'downloading' | 'starting' | 'ready' | 'error';
interface LocalModelPreparation {
  phase: LocalModelPreparationPhase;
  model?: string;
  detail?: string;
  logPath?: string;
  logContent?: string;
}
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
  | 'sidebar'
  | 'shield'
  | 'sliders'
  | 'sparkles'
  | 'stop'
  | 'table'
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
type DesktopNavigationItem = NavigationChildItem<string> & {
  packageId: string;
  route: string;
  parentRoute?: string;
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
  activity?: ChatToolActivity;
  performance?: ChatPerformanceMetrics & {
    endToEndMs?: number;
    uiDeliveryMs?: number;
  };
}

interface ChatToolActivity {
  toolId: string;
  toolName: string;
  args: Record<string, any>;
  status: ChatToolActivityStatus;
  startedAt: number;
  completedAt?: number;
  duration?: number;
  result?: unknown;
  error?: string;
  approval?: {
    required: boolean;
    decision?: 'approved' | 'rejected';
    resolvedAt?: number;
    resolvedBy?: string;
  };
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
  | { scope: 'main'; sessionId: string; messageId: string }
  | { scope: 'project'; projectChatKey: string; projectId: string; messageId: string };

interface PersistedChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  workspacePath?: string;
  toolWorkspacePath?: string;
  contextAttachments?: ChatContextAttachment[];
  executionMode?: ChatExecutionMode;
  permissionProfile?: DesktopPermissionProfile;
  messages: UiMessage[];
}

interface PersistedSessionsState {
  currentSessionId: string;
  sessions: PersistedChatSession[];
}

type SoftwareProjectMode = 'guided' | 'autonomous';
type ChatExecutionMode = 'chat' | 'agent';
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
  platformDeveloperMode: boolean;
  platformBaseUrl: string;
  platformOrgId: string;
  llmProvider: LlmProviderType;
  baseUrl: string;
  model: string;
  fallbackModel: string;
  temperature: number;
  maxTokens: number;
  contextTokens: number;
  localEnginePath: string;
  localGpuLayers: string;
  enableLlmTools: boolean;
  desktopPermissionProfile: DesktopPermissionProfile;
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

interface PackageOperationError {
  packageId: string;
  packageName: string;
  productSku: string;
  version: string;
  phase: string;
  message: string;
  occurredAt: string;
}

const DEFAULT_PROVIDER: LlmProviderType = 'codeagent';
const MAX_TOOL_ACTIVITIES = 20;
const MAX_PERSISTED_MESSAGES = 80;
const MAX_PROJECT_CHAT_CONTEXT_MESSAGES = 10;
const MAX_PROJECT_CHAT_CONTEXT_CHARACTERS = 10_000;
const MAX_PROJECT_CHAT_MESSAGE_CHARACTERS = 4_000;
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
const DESKTOP_PERMISSION_PROFILES: Array<{
  value: DesktopPermissionProfile;
  title: string;
  description: string;
  badge?: string;
  danger?: boolean;
}> = [
  {
    value: 'workspace-only',
    title: 'Workspace only',
    description: 'Read and edit files only inside the selected workspace. Commands and writes require review.',
  },
  {
    value: 'ask',
    title: 'Ask when needed',
    description: 'Use the workspace by default and request approval before accessing an external path.',
    badge: 'Recommended',
  },
  {
    value: 'trusted-workspace',
    title: 'Trusted workspace',
    description: 'Read, edit, and run approved commands inside the workspace without repeated reviews. External paths remain blocked.',
  },
  {
    value: 'full-access',
    title: 'Full computer access',
    description: 'Access any path allowed to your OS account and run supported commands without CodeAgent approval prompts.',
    badge: 'High risk',
    danger: true,
  },
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
  codeagent: {
    label: 'CodeAgent',
    model: 'Qwen/Qwen3-4B-GGUF',
    baseUrl: 'http://127.0.0.1:14321/v1',
    maxTokens: 2048,
    contextTokens: 8192,
    enableLlmTools: true,
  },
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
    case 'sidebar':
      return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /><path d="M6 8h.01" /><path d="M6 12h.01" /></svg>;
    case 'shield':
      return <svg {...common}><path d="M12 3 20 6v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6z" /><path d="m9 12 2 2 4-5" /></svg>;
    case 'sliders':
      return <svg {...common}><path d="M4 6h10" /><path d="M18 6h2" /><path d="M4 12h2" /><path d="M10 12h10" /><path d="M4 18h12" /><path d="M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></svg>;
    case 'sparkles':
      return <svg {...common}><path d="M12 3 14 9l6 3-6 3-2 6-2-6-6-3 6-3z" /><path d="M5 3v4" /><path d="M3 5h4" /></svg>;
    case 'stop':
      return <svg {...common}><rect x="6" y="6" width="12" height="12" rx="2" /></svg>;
    case 'table':
      return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /><path d="M3 14h18" /><path d="M9 4v16" /></svg>;
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
  { command: '/sessions', description: 'List saved desktop sessions' },
  { command: '/config', description: 'Show persisted desktop configuration' },
  { command: '/tools', description: 'List built-in and discovered tools', featureId: 'developer-tools' },
  { command: '/mcp', description: 'Refresh and list MCP servers and tools', featureId: 'mcp' },
  { command: '/clear', description: 'Clear the visible chat' },
];
const SETTINGS_MENU: Array<NavigationChildItem<SettingsSectionId>> = [
  { id: 'account', title: 'Account', description: 'Login, subscription, billing', icon: 'user' },
  { id: 'general', title: 'General', description: 'Appearance and run defaults', icon: 'settings' },
  { id: 'chat-history', title: 'Chat history', description: 'Manage saved conversations', icon: 'history' },
  { id: 'model', title: 'Model', description: 'Provider, inference, and tokens', icon: 'sparkles' },
  { id: 'packages', title: 'Store', description: 'Browse, purchase, and manage packages', icon: 'puzzle' },
  { id: 'io-debug', title: 'Output & Debug', description: 'Formats, traces, and logs', icon: 'code', featureId: 'developer-settings' },
  { id: 'workspace', title: 'Prompts & Directories', description: 'System prompts, MCP, and directories', icon: 'folder', featureId: 'developer-settings' },
  { id: 'sessions', title: 'Sessions & Integrations', description: 'Resume, IDE, and browser', icon: 'rotate', featureId: 'developer-settings' },
  { id: 'advanced', title: 'Advanced Compatibility', description: 'Channels and agent metadata', icon: 'sliders', featureId: 'developer-settings' },
];
const SYSTEM_SETTINGS_SECTION_IDS = new Set<SettingsSectionId>([
  'general',
  'chat-history',
  'model',
  'packages',
]);
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

function normalizeMessageSenderTitle(role: MessageRole, value: unknown): string | undefined {
  const title = typeof value === 'string' ? value.trim() : '';
  if (role !== 'assistant') return title || undefined;
  if (!title) return 'CodeAgent';

  const looksLikeLegacyModelIdentity = title.includes(' / ') ||
    title.includes('/') ||
    /^(?:gpt|claude|gemini|llama|mistral|qwen|deepseek|codellama|phi)[-_.\d]/i.test(title);
  return looksLikeLegacyModelIdentity ? 'CodeAgent' : title;
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
    title: normalizeMessageSenderTitle(role, message.title),
    usage: message.usage && typeof message.usage === 'object'
      ? {
        inputTokens: Number((message.usage as UiMessage['usage'])?.inputTokens ?? 0),
        outputTokens: Number((message.usage as UiMessage['usage'])?.outputTokens ?? 0),
      }
      : undefined,
    imageAttachments: sanitizeImageAttachments(message.imageAttachments),
    activity: sanitizeChatToolActivity(message.activity),
    performance: sanitizeChatPerformance(message.performance),
  };
}

function sanitizeChatPerformance(value: unknown): UiMessage['performance'] {
  if (!value || typeof value !== 'object') return undefined;
  const metric = value as Partial<UiMessage['performance']>;
  const validPhases = new Set(['preparation', 'tool-selection', 'tool-execution', 'answer-generation']);
  const phases = Array.isArray(metric.phases)
    ? metric.phases.flatMap(item => {
      if (!item || typeof item !== 'object') return [];
      const phase = item as ChatPerformanceMetrics['phases'][number];
      if (!validPhases.has(phase.phase) || !Number.isFinite(Number(phase.durationMs))) return [];
      return [{
        phase: phase.phase,
        durationMs: Math.max(0, Number(phase.durationMs)),
        count: Number.isFinite(Number(phase.count)) ? Math.max(0, Number(phase.count)) : undefined,
      }];
    })
    : [];
  const backendMs = Number(metric.backendMs);
  if (!Number.isFinite(backendMs)) return undefined;
  return {
    backendMs: Math.max(0, backendMs),
    firstTokenMs: Number.isFinite(Number(metric.firstTokenMs)) ? Math.max(0, Number(metric.firstTokenMs)) : undefined,
    toolRounds: Math.max(0, Number(metric.toolRounds) || 0),
    toolCalls: Math.max(0, Number(metric.toolCalls) || 0),
    phases,
    endToEndMs: Number.isFinite(Number(metric.endToEndMs)) ? Math.max(0, Number(metric.endToEndMs)) : undefined,
    uiDeliveryMs: Number.isFinite(Number(metric.uiDeliveryMs)) ? Math.max(0, Number(metric.uiDeliveryMs)) : undefined,
  };
}

function sanitizeChatToolActivity(value: unknown): ChatToolActivity | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const activity = value as Partial<ChatToolActivity>;
  const validStatuses: ChatToolActivityStatus[] = ['waiting-approval', 'running', 'succeeded', 'failed', 'rejected'];
  if (typeof activity.toolId !== 'string' || typeof activity.toolName !== 'string' || !validStatuses.includes(activity.status as ChatToolActivityStatus)) {
    return undefined;
  }

  return {
    toolId: activity.toolId,
    toolName: activity.toolName,
    args: activity.args && typeof activity.args === 'object' ? activity.args : {},
    status: activity.status as ChatToolActivityStatus,
    startedAt: Number.isFinite(Number(activity.startedAt)) ? Number(activity.startedAt) : Date.now(),
    completedAt: Number.isFinite(Number(activity.completedAt)) ? Number(activity.completedAt) : undefined,
    duration: Number.isFinite(Number(activity.duration)) ? Number(activity.duration) : undefined,
    result: activity.result,
    error: typeof activity.error === 'string' ? activity.error : undefined,
    approval: activity.approval && typeof activity.approval === 'object'
      ? {
        required: Boolean(activity.approval.required),
        decision: activity.approval.decision === 'approved' || activity.approval.decision === 'rejected'
          ? activity.approval.decision
          : undefined,
        resolvedAt: Number.isFinite(Number(activity.approval.resolvedAt))
          ? Number(activity.approval.resolvedAt)
          : undefined,
        resolvedBy: typeof activity.approval.resolvedBy === 'string' ? activity.approval.resolvedBy : undefined,
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
  executionMode?: ChatExecutionMode | null,
  permissionProfile?: DesktopPermissionProfile | null,
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
    executionMode: executionMode ?? undefined,
    permissionProfile: permissionProfile ?? undefined,
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
    executionMode: raw.executionMode === 'chat' || raw.executionMode === 'agent'
      ? raw.executionMode
      : undefined,
    permissionProfile: DESKTOP_PERMISSION_PROFILES.some(profile => profile.value === raw.permissionProfile)
      ? raw.permissionProfile
      : undefined,
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

function isReviewForProjectChat(
  review: { scope?: ToolEventScope },
  projectId: string,
  channel: ProjectChatChannel,
): boolean {
  if (review.scope?.source !== 'project-chat') return false;
  const projectChatKey = getProjectChatKey(projectId, channel);
  return review.scope.projectChatKey === projectChatKey
    || (review.scope.projectId === projectId && (review.scope.channel ?? 'guided') === channel);
}

function isMainChatReview(review: { scope?: ToolEventScope }): boolean {
  return review.scope?.source !== 'project-chat';
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
  const configuredPlatformBaseUrl = typeof config?.platformBaseUrl === 'string'
    ? normalizePlatformBaseUrl(config.platformBaseUrl)
    : '';
  const platformDeveloperMode = typeof config?.platformDeveloperMode === 'boolean'
    ? config.platformDeveloperMode
    : isLocalPlatformUrl(configuredPlatformBaseUrl);

  return {
    apiKey: '',
    accountEmail: featureProfile.email,
    accountDisplayName: featureProfile.accountStatus === 'signed-in' ? featureProfile.displayName : '',
    accountPassword: '',
    accountResetToken: '',
    platformDeveloperMode,
    platformBaseUrl: platformDeveloperMode
      ? configuredPlatformBaseUrl || DEVELOPMENT_PLATFORM_BASE_URL
      : PRODUCTION_PLATFORM_BASE_URL,
    platformOrgId: typeof config?.platformOrgId === 'string' ? config.platformOrgId : '',
    llmProvider,
    baseUrl: llmProvider === 'codeagent' ? providerDefault.baseUrl : (config?.baseUrl || providerDefault.baseUrl),
    model: config?.model || providerDefault.model,
    fallbackModel: readCliOption(config, 'fallbackModel'),
    temperature: Number(config?.temperature ?? 0.7),
    maxTokens: Number(config?.maxTokens ?? providerDefault.maxTokens),
    contextTokens: Number(config?.contextTokens ?? providerDefault.contextTokens),
    localEnginePath: typeof config?.localEnginePath === 'string' ? config.localEnginePath : '',
    localGpuLayers: typeof config?.localGpuLayers === 'number' ? String(config.localGpuLayers) : '',
    enableLlmTools: Boolean(config?.enableLlmTools ?? providerDefault.enableLlmTools),
    desktopPermissionProfile: config?.desktopPermissionProfile ?? 'workspace-only',
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

const PRODUCTION_PLATFORM_BASE_URL = 'https://app.crovyn.com';
const DEVELOPMENT_PLATFORM_BASE_URL = 'http://127.0.0.1:18080';

function isLocalPlatformUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return false;
  }
}

function getEffectivePlatformBaseUrl(draft: SettingsDraft): string {
  return draft.platformDeveloperMode
    ? normalizePlatformBaseUrl(draft.platformBaseUrl)
    : PRODUCTION_PLATFORM_BASE_URL;
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
  const baseUrl = getEffectivePlatformBaseUrl(draft);
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
  const baseUrl = getEffectivePlatformBaseUrl(draft);
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
  const baseUrl = getEffectivePlatformBaseUrl(draft);
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
  const baseUrl = getEffectivePlatformBaseUrl(draft);
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
  const platformCatalog = normalizePlatformFeatureCatalog(config.platformFeaturePackageCatalog);
  if (!platformCatalog) {
    return undefined;
  }

  // Commerce and entitlement still come from agent-platform, while the app
  // bundle is authoritative for a newer runtime that it can install locally.
  // This lets a desktop release offer an updated package before a stale
  // platform catalog has been republished, without granting any entitlement.
  const merged = platformCatalog.map(platformManifest => {
    const bundledManifest = FEATURE_PACKAGE_MANIFESTS.find(candidate => candidate.id === platformManifest.id);
    const platformVersion = semver.valid(platformManifest.version);
    const bundledVersion = bundledManifest ? semver.valid(bundledManifest.version) : null;
    if (!bundledManifest || !platformVersion || !bundledVersion || !semver.gt(bundledVersion, platformVersion)) {
      return platformManifest;
    }
    return {
      ...platformManifest,
      ...bundledManifest,
      pricing: platformManifest.pricing,
      entitlement: platformManifest.entitlement,
    };
  });
  const knownIds = new Set(merged.map(manifest => manifest.id));
  return [
    ...merged,
    ...FEATURE_PACKAGE_MANIFESTS.filter(manifest => !knownIds.has(manifest.id)),
  ];
}

async function createPlatformPaymentMethod(
  baseUrl: string,
  token: string,
  orgId: string,
  holderFallback: string,
  draft: PurchaseDraft,
): Promise<{ method_id?: string; id?: string }> {
  const expiry = parseCardExpiry(draft.expiry);
  if (!expiry) {
    throw new Error('Enter a valid future expiration date as MM/YY or MM/YYYY.');
  }
  const digits = draft.cardNumber.replace(/\D/g, '');
  return readPlatformJson(baseUrl, '/billing/payment-methods', token, {
    method: 'POST',
    body: JSON.stringify({
      ...(orgId.trim() ? { org_id: orgId.trim() } : {}),
      method_type: 'card',
      brand: getCardBrand(digits),
      last4: digits.slice(-4),
      holder_name: draft.nameOnCard.trim() || holderFallback,
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

function getPackageAvailableVersion(manifest: FeaturePackageManifest): string {
  return manifest.distribution.artifact.version || manifest.version;
}

function getInstalledPackageVersion(
  profile: Required<FeatureEntitlementProfile>,
  packageId: string,
): string | undefined {
  return [...profile.packageInstallRecords]
    .reverse()
    .find(record => record.packageId === packageId && (
      record.state === 'installed' || record.state === 'update-available'
    ))?.version;
}

function getPackageVersionLabel(
  manifest: FeaturePackageManifest,
  profile: Required<FeatureEntitlementProfile>,
  installState: FeaturePackageInstallState,
): string {
  const availableVersion = getPackageAvailableVersion(manifest);
  const installedVersion = getInstalledPackageVersion(profile, manifest.id);
  if (installState === 'update-available' && installedVersion) {
    return `v${installedVersion} installed · v${availableVersion} available`;
  }
  if (installedVersion) {
    return `Version ${installedVersion}`;
  }
  return `Version ${availableVersion}`;
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

function createUninstalledProfile(
  profile: Required<FeatureEntitlementProfile>,
  packageId: string,
): FeatureEntitlementProfile {
  return {
    ...profile,
    installedPackageIds: profile.installedPackageIds.filter(id => id !== packageId),
    packageInstallRecords: profile.packageInstallRecords.filter(record => record.packageId !== packageId),
    updatedAt: new Date().toISOString(),
  };
}

function mergeLocalPackageInstallState(
  remoteProfile: Required<FeatureEntitlementProfile>,
  localProfile: Required<FeatureEntitlementProfile>,
): FeatureEntitlementProfile {
  return {
    ...remoteProfile,
    installedPackageIds: [...localProfile.installedPackageIds],
    packageInstallRecords: [...localProfile.packageInstallRecords],
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

function getChatToolActivityAction(toolName: string): string {
  const normalized = toolName.toLowerCase();
  if (normalized === 'fs.list' || normalized === 'fs_list') return 'List directory';
  if (normalized === 'fs.read' || normalized === 'fs_read') return 'Read file';
  if (normalized === 'fs.write' || normalized === 'fs_write') return 'Write file';
  if (normalized === 'bash.run' || normalized === 'bash_run') return 'Run command';
  if (normalized.includes('search')) return 'Search';
  return toolName.replace(/[._-]+/g, ' ').replace(/^\w/, character => character.toUpperCase());
}

function getChatToolActivityTarget(activity: ChatToolActivity): string {
  const args = activity.args || {};
  const value = args.path ?? args.command ?? args.cwd ?? args.query ?? args.pattern ?? args.url;
  if (typeof value === 'string' && value.trim()) return truncateText(value.trim(), 120);
  return '';
}

function getChatToolActivityStatusLabel(status: ChatToolActivityStatus): string {
  if (status === 'waiting-approval') return 'Waiting for approval';
  if (status === 'running') return 'Running';
  if (status === 'succeeded') return 'Completed';
  if (status === 'rejected') return 'Not approved';
  return 'Failed';
}

function formatChatToolActivityCopy(activity: ChatToolActivity): string {
  const target = getChatToolActivityTarget(activity);
  const lines = [
    `${getChatToolActivityAction(activity.toolName)}${target ? `: ${target}` : ''}`,
    `Status: ${getChatToolActivityStatusLabel(activity.status)}`,
    `Tool: ${activity.toolName}`,
    `Arguments: ${formatJson(activity.args)}`,
  ];
  if (activity.result !== undefined) lines.push(`Result: ${formatJson(activity.result)}`);
  if (activity.error) lines.push(`Error: ${activity.error}`);
  return lines.join('\n');
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

function isCoreTool(tool: Tool): boolean {
  return tool.owner?.kind === 'core' || (!tool.owner && tool.source === 'bridge');
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
  return 'Project chat output';
}

function isAutomationScopedToolEvent(data: { scope?: ToolEventScope }): boolean {
  return data.scope?.source === 'scheduled-task' || data.scope?.source === 'virtual-team';
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

function toDesktopNavigationItem(
  entry: ReturnType<typeof getFeaturePackageExtensions>[number],
): DesktopNavigationItem | null {
  const extension = entry.extension;
  const route = extension.childRoute || extension.route;
  if (!route) {
    return null;
  }
  return {
    id: route,
    packageId: entry.packageId,
    route,
    parentRoute: extension.parentRoute,
    title: extension.title,
    description: extension.description || '',
    icon: (extension.icon || 'puzzle') as IconName,
    featureId: extension.featureId,
  };
}

function getDesktopPrimaryNavigation(resolution: FeaturePackageResolution): DesktopNavigationItem[] {
  return getFeaturePackageExtensions(resolution, 'desktop.primary-nav')
    .map(toDesktopNavigationItem)
    .filter((item): item is DesktopNavigationItem => Boolean(item));
}

function getDesktopChildNavigation(
  resolution: FeaturePackageResolution,
  parentRoute: string,
): DesktopNavigationItem[] {
  return getFeaturePackageExtensions(resolution, 'desktop.child-route')
    .filter(entry => entry.extension.parentRoute === parentRoute)
    .map(toDesktopNavigationItem)
    .filter((item): item is DesktopNavigationItem => Boolean(item));
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
      : 'You are supporting a standard project chat. Treat the human message as project-scoped product/software direction.',
    formatProjectPrompt(project, employees, roles, projectTeams),
    channel === 'guided'
      ? 'Use the project details above to infer intent and continue work. Avoid generic intake questions unless they are strictly necessary to unblock the next step.'
      : 'Use the project details above as the team operating context.',
  ].join('\n\n');

  const eligibleHistory = messages
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .filter(message => message.content.trim() && !message.content.startsWith('Project chat is ready for'));
  const history: ChatMessage[] = [];
  let remainingCharacters = MAX_PROJECT_CHAT_CONTEXT_CHARACTERS;

  for (const message of eligibleHistory.slice(-MAX_PROJECT_CHAT_CONTEXT_MESSAGES).reverse()) {
    if (remainingCharacters <= 0) break;
    const compactedContent = compactProjectChatHistoryContent(
      message.content,
      Math.min(MAX_PROJECT_CHAT_MESSAGE_CHARACTERS, remainingCharacters),
    );
    history.unshift({
      role: message.role as 'user' | 'assistant',
      content: compactedContent,
    });
    remainingCharacters -= compactedContent.length;
  }

  return [
    { role: 'system', content: projectContext },
    ...history,
    { role: 'user', content: nextUserMessage },
  ];
}

function compactProjectChatHistoryContent(content: string, limit: number): string {
  if (content.length <= limit) return content;
  const marker = '\n\n[Earlier response shortened for context]\n\n';
  const usable = Math.max(0, limit - marker.length);
  const leadingLength = Math.ceil(usable * 0.7);
  const trailingLength = usable - leadingLength;
  return `${content.slice(0, leadingLength)}${marker}${content.slice(-trailingLength)}`;
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

const { ProjectsView, ToolsView, AutomationView, HistoryView } = createSoftwareDeveloperRendererViews({
  AUTOMATION_PERMISSION_TOOLS,
  DEFAULT_AUTONOMOUS_ROLES,
  DEFAULT_EMPLOYEE_PERMISSIONS,
  DEFAULT_PROJECT_ARTIFACTS,
  PROJECT_LIST_PAGE_SIZE,
  TOOL_PERMISSION_OPTIONS,
  Icon,
  InlineApprovalQueue,
  MessageItem,
  RecordViewToggle,
  ToolActivityPanel,
  createDefaultProjectTeams,
  createProjectReadyMessages,
  createProjectTeamId,
  createSoftwareProjectDraft,
  createVirtualEmployeeProfile,
  createVirtualRoleDefinition,
  formatFileSize,
  formatImageAttachmentSummary,
  formatProjectOutputSource,
  formatProjectStatus,
  getDefaultRoleId,
  getEmployeeRoleDefinition,
  getHistoryRecordSummary,
  getHistoryRecordTitle,
  getHistoryRecordTypeLabel,
  getPathBasename,
  getProjectAssignedEmployees,
  getProjectAutomationTeamId,
  getProjectChatKey,
  getProjectStaffingEmployees,
  getProjectSupervisor,
  getProjectTeams,
  getProviderDefault,
  getRoleDefinitionById,
  getTeamMembers,
  getTeamSupervisor,
  getToolPermissionPolicy,
  getToolResultPath,
  groupMessagesByAssistantRun,
  groupToolsByCategory,
  isProjectToolActivity,
  isReviewForProjectChat,
  isSupervisorEmployee,
  isToolExposedToModel,
  joinWorkspacePath,
  normalizeStringList,
  normalizeToolNameList,
  readCliOption,
  styles,
  summarizeProjectGoals,
  summarizeToolResult,
});

class FeatureViewErrorBoundary extends React.Component<
  { children: React.ReactNode; viewKey: string; viewLabel: string },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: unknown): { error: Error } {
    return {
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`Feature view ${this.props.viewKey} failed`, error, info);
  }

  componentDidUpdate(previousProps: Readonly<{ viewKey: string }>) {
    if (previousProps.viewKey !== this.props.viewKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <section className={styles.detailView} aria-label={`${this.props.viewLabel} unavailable`}>
        <section className={styles.detailPanel}>
          <h3>{this.props.viewLabel} could not be displayed</h3>
          <p className={styles.mutedText}>
            The Software Developer package encountered a renderer error. You can switch to another section and try again.
          </p>
          <pre className={styles.codeBlock}><code>{this.state.error.message}</code></pre>
        </section>
      </section>
    );
  }
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
  const [chatExecutionModeOverride, setChatExecutionModeOverride] = useState<ChatExecutionMode | null>(null);
  const [chatPermissionProfileOverride, setChatPermissionProfileOverride] = useState<DesktopPermissionProfile | null>(null);
  const [composerMenu, setComposerMenu] = useState<'mode' | 'permission' | null>(null);
  const [pendingChatPermissionProfile, setPendingChatPermissionProfile] = useState<DesktopPermissionProfile | null>(null);
  const [sessionSearch, setSessionSearch] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>(() => createSettingsDraft(null));
  const [settingsMessage, setSettingsMessage] = useState('');
  const [localModelPreparation, setLocalModelPreparation] = useState<LocalModelPreparation>({ phase: 'idle' });
  const [toolRouterMessage, setToolRouterMessage] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSyncingPlatform, setIsSyncingPlatform] = useState(false);
  const [purchasePackageId, setPurchasePackageId] = useState<string | null>(null);
  const [purchaseDraft, setPurchaseDraft] = useState<PurchaseDraft>(() => ({ ...EMPTY_PURCHASE_DRAFT }));
  const [paymentMethodDialogOpen, setPaymentMethodDialogOpen] = useState(false);
  const [packageOperationError, setPackageOperationError] = useState<PackageOperationError | null>(null);
  const [activeView, setActiveView] = useState<AppView>('chat');
  const [activeProjectsSection, setActiveProjectsSection] = useState<ProjectsSectionId>('studio');
  const [activeToolsSection, setActiveToolsSection] = useState<ToolsSectionId>('mcp');
  const [activeAutomationSection, setActiveAutomationSection] = useState<AutomationSectionId>('tasks');
  const [activeHistorySection, setActiveHistorySection] = useState<HistorySectionId>('overview');
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSectionId>('account');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readStoredSidebarCollapsed());
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const developmentPlatformSessionRef = useRef<Partial<AppConfig> | null>(null);

  const effectiveChatExecutionMode: ChatExecutionMode = chatExecutionModeOverride
    ?? (appConfig?.enableLlmTools === false ? 'chat' : 'agent');
  const effectiveChatPermissionProfile: DesktopPermissionProfile = chatPermissionProfileOverride
    ?? appConfig?.desktopPermissionProfile
    ?? 'workspace-only';

  const messageListRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const streamMessageIds = useRef<Map<string, ChatStreamTarget>>(new Map());
  const chatRequestStartedAtRef = useRef<Map<string, number>>(new Map());
  const toolActivityNamesRef = useRef<Map<string, string>>(new Map());
  const approvalRequestToolIdsRef = useRef<Map<string, string>>(new Map());
  const currentSessionIdRef = useRef(currentSessionId);
  const hasHydratedSessionsRef = useRef(false);
  const hasHydratedProjectsRef = useRef(false);
  const hasHydratedRolesRef = useRef(false);
  const hasHydratedEmployeesRef = useRef(false);
  const hasHydratedProjectTeamsRef = useRef(false);
  const hasHydratedProjectChatsRef = useRef(false);
  const hasHydratedProjectOutputsRef = useRef(false);
  const chatToolWorkspacePathRef = useRef('');

  currentSessionIdRef.current = currentSessionId;

  function applyChatToolWorkspacePath(nextPath: string) {
    const normalizedPath = nextPath.trim();
    chatToolWorkspacePathRef.current = normalizedPath;
    setChatToolWorkspacePath(normalizedPath);
  }

  function applyChatExecutionSettings(session?: PersistedChatSession) {
    setChatExecutionModeOverride(session?.executionMode ?? null);
    setChatPermissionProfileOverride(session?.permissionProfile ?? null);
    setPendingChatPermissionProfile(null);
    setComposerMenu(null);
  }

  function withDevelopmentPlatformSession(config: AppConfig): AppConfig {
    return developmentPlatformSessionRef.current
      ? { ...config, ...developmentPlatformSessionRef.current }
      : config;
  }

  function updateDevelopmentPlatformSession(
    update: Partial<AppConfig>,
    baseConfig: AppConfig = appConfig ?? {},
  ): AppConfig {
    developmentPlatformSessionRef.current = {
      ...(developmentPlatformSessionRef.current ?? {}),
      ...update,
    };
    const merged = withDevelopmentPlatformSession(baseConfig);
    setAppConfig(merged);
    return merged;
  }

  function platformSessionFromConfig(config: AppConfig | null): PlatformAuthSession | null {
    const accessToken = typeof config?.platformAccessToken === 'string' ? config.platformAccessToken.trim() : '';
    const baseUrl = normalizePlatformBaseUrl(String(config?.platformBaseUrl || ''));
    if (!accessToken || !baseUrl) return null;
    return {
      accessToken,
      baseUrl,
      orgId: String(config?.platformOrgId || '').trim() || undefined,
      developerMode: config?.platformDeveloperMode === true,
    };
  }

  async function restorePlatformSessionOverlay(config: AppConfig): Promise<AppConfig> {
    const session = platformSessionFromConfig(appConfig)
      ?? await ipcClient.auth.getPlatformSession().catch(() => null);
    if (!session) return withDevelopmentPlatformSession(config);
    return {
      ...config,
      platformDeveloperMode: session.developerMode === true,
      platformBaseUrl: session.baseUrl,
      platformOrgId: session.orgId || config.platformOrgId || '',
      platformAccessToken: session.accessToken,
    };
  }

  async function commitAuthenticatedPlatformConfig(
    nextConfig: Partial<AppConfig>,
    session: PlatformAuthSession,
    persistSession = true,
  ): Promise<AppConfig> {
    if (persistSession) await ipcClient.auth.setPlatformSession(session);
    const inMemoryConfig: Partial<AppConfig> = {
      ...nextConfig,
      platformBaseUrl: session.baseUrl,
      platformDeveloperMode: session.developerMode === true,
      platformAccessToken: session.accessToken,
      platformOrgId: session.orgId || nextConfig.platformOrgId,
    };
    if (session.developerMode) {
      // This can run in the same startup closure that just hydrated config.
      // React state updates are asynchronous, so `appConfig` may still be the
      // pre-hydration null value. Merge the session overlay onto persistent
      // storage directly to retain appearance, model, permissions, and every
      // other saved preference across restart.
      const persistedConfig = await ipcClient.app.getConfig();
      return updateDevelopmentPlatformSession(inMemoryConfig, persistedConfig);
    }

    await ipcClient.app.setConfig({
      ...nextConfig,
      platformBaseUrl: session.baseUrl,
      platformDeveloperMode: false,
      platformAccessToken: '',
      platformOrgId: session.orgId || nextConfig.platformOrgId,
    });
    return {
      ...(await ipcClient.app.getConfig()),
      platformAccessToken: session.accessToken,
    };
  }

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
    return getDesktopPrimaryNavigation(featureResolution);
  }, [featureResolution]);

  useEffect(() => {
    void initializeApp();
  }, []);

  useEffect(() => {
    const activeRouteIsAvailable = availablePrimaryNav.some(item => item.route === activeView) ||
      getFeaturePackageExtensions(featureResolution, 'desktop.child-route').some(entry => (
        entry.extension.route === activeView || entry.extension.parentRoute === activeView
      ));
    if (!activeRouteIsAvailable) {
      setActiveView('chat');
    }
  }, [activeView, availablePrimaryNav, featureResolution]);

  useEffect(() => {
    try {
      window.localStorage?.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(sidebarCollapsed));
    } catch {
      // Non-critical preference persistence.
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!mobileNavigationOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileNavigationOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileNavigationOpen]);

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

        updateMainChatSessionMessages(target.sessionId, current => current.map(message => (
          message.id === target.messageId
            ? { ...message, content: `${message.content}${data.delta}` }
            : message
        )));
      }));

      removers.push(ipcClient.onChatComplete(data => {
        const target = streamMessageIds.current.get(data.requestId);
        streamMessageIds.current.delete(data.requestId);
        const requestStartedAt = chatRequestStartedAtRef.current.get(data.requestId);
        chatRequestStartedAtRef.current.delete(data.requestId);
        const endToEndMs = requestStartedAt === undefined ? data.duration : Date.now() - requestStartedAt;
        const backendPerformance = data.response.performance;
        const performance = backendPerformance
          ? {
            ...backendPerformance,
            endToEndMs,
            uiDeliveryMs: Math.max(0, endToEndMs - backendPerformance.backendMs),
          }
          : undefined;

        if (target?.scope === 'project') {
          setProjectChatMessages(current => updateProjectChatMessage(
            current,
            target.projectChatKey,
            target.messageId,
            message => ({
              ...message,
              content: data.response.content || message.content || 'No response content.',
              status: 'sent',
              usage: data.response.usage,
              performance,
            }),
          ));
          setProjectChatSendingKeys(current => {
            const next = new Set(current);
            next.delete(target.projectChatKey);
            return next;
          });
        } else if (target?.scope === 'main') {
          updateMainChatSessionMessages(target.sessionId, current => current.map(message => (
            message.id === target.messageId
              ? {
                ...message,
                content: data.response.content || message.content || 'No response content.',
                status: 'sent',
                usage: data.response.usage,
                performance,
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
        chatRequestStartedAtRef.current.delete(data.requestId);

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
          updateMainChatSessionMessages(target.sessionId, current => current.map(message => (
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
        if (!isAutomationScopedToolEvent(data)) {
          upsertChatToolActivity(data.toolId, {
            toolName: data.toolName,
            args: data.args || {},
            status: 'running',
            startedAt: data.timestamp,
          }, data.scope);
        }
      }));

      removers.push(ipcClient.onToolResult(data => {
        recordToolResult(data);
        if (!isAutomationScopedToolEvent(data)) {
          upsertChatToolActivity(data.toolId, { result: data.data }, data.scope);
        }
      }));

      removers.push(ipcClient.onToolComplete(data => {
        recordToolComplete(data);
        if (!isAutomationScopedToolEvent(data)) {
          upsertChatToolActivity(data.toolId, {
            status: data.success ? 'succeeded' : 'failed',
            duration: data.duration,
            completedAt: Date.now(),
          }, data.scope);
        }
      }));

      removers.push(ipcClient.onToolError(data => {
        recordToolError(data);
        if (!isAutomationScopedToolEvent(data)) {
          upsertChatToolActivity(data.toolId, {
            status: 'failed',
            error: formatDesktopError(data.error),
            completedAt: Date.now(),
          }, data.scope);
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
        approvalRequestToolIdsRef.current.set(data.requestId, data.toolId);
        setFileWriteReviews(current => [
          ...current.filter(review => review.requestId !== data.requestId),
          data,
        ]);
        setStatus('Approval needed');
        if (data.scope?.source !== 'project-chat') setActiveView('chat');
        if (!isAutomationScopedToolEvent(data)) {
          upsertChatToolActivity(data.toolId, {
            status: 'waiting-approval',
            approval: { required: true },
          }, data.scope);
        }
      }));

      removers.push(ipcClient.onCommandReview(data => {
        approvalRequestToolIdsRef.current.set(data.requestId, data.toolId);
        setCommandReviews(current => [
          ...current.filter(review => review.requestId !== data.requestId),
          data,
        ]);
        setStatus('Approval needed');
        if (data.scope?.source !== 'project-chat') setActiveView('chat');
        if (!isAutomationScopedToolEvent(data)) {
          upsertChatToolActivity(data.toolId, {
            status: 'waiting-approval',
            approval: { required: true },
          }, data.scope);
        }
      }));

      removers.push(ipcClient.onToolPermissionReview(data => {
        approvalRequestToolIdsRef.current.set(data.requestId, data.toolId);
        setToolPermissionReviews(current => [
          ...current.filter(review => review.requestId !== data.requestId),
          data,
        ]);
        setStatus('Approval needed');
        if (data.scope?.source !== 'project-chat') setActiveView('chat');
        if (!isAutomationScopedToolEvent(data)) {
          upsertChatToolActivity(data.toolId, {
            toolName: data.toolName,
            args: data.args || {},
            status: 'waiting-approval',
            startedAt: data.createdAt,
            approval: { required: true },
          }, data.scope);
        }
      }));

      removers.push(ipcClient.onToolApprovalResolved(data => {
        const toolId = approvalRequestToolIdsRef.current.get(data.requestId);
        approvalRequestToolIdsRef.current.delete(data.requestId);
        if (toolId && !isAutomationScopedToolEvent(data)) {
          upsertChatToolActivity(toolId, {
            status: data.approved ? 'running' : 'rejected',
            completedAt: data.approved ? undefined : Date.now(),
            approval: {
              required: true,
              decision: data.approved ? 'approved' : 'rejected',
              resolvedAt: Date.now(),
              resolvedBy: data.resolvedBy,
            },
          }, data.scope);
        }
        setFileWriteReviews(current => current.filter(review => review.requestId !== data.requestId));
        setCommandReviews(current => current.filter(review => review.requestId !== data.requestId));
        setToolPermissionReviews(current => current.filter(review => review.requestId !== data.requestId));
        setStatus('Ready');
        inputRef.current?.focus();
      }));

      removers.push(ipcClient.onConfigChanged(data => {
        const config = withDevelopmentPlatformSession(data.config);
        setAppConfig(config);
        setSettingsDraft(current => ({
          ...createSettingsDraft(config),
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
          chatExecutionModeOverride,
          chatPermissionProfileOverride,
        ),
      );
    });
  }, [messages, currentSessionId, appInfo?.workspacePath, chatToolWorkspacePath, chatContextAttachments, chatExecutionModeOverride, chatPermissionProfileOverride]);

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
      async function optionalStartupValue<T>(label: string, request: Promise<T>, fallback: T): Promise<T> {
        try {
          return await request;
        } catch (error) {
          console.warn(`Failed to load optional startup resource (${label}):`, error);
          return fallback;
        }
      }

      // Appearance and model preferences are part of the critical startup
      // path. Hydrate them before loading history, tools, and automation so a
      // slow optional service cannot leave the renderer showing defaults.
      const config = await ipcClient.app.getConfig();
      setAppConfig(config);
      setSettingsDraft(createSettingsDraft(config));

      const [info, storedPlatformSession] = await Promise.all([
        ipcClient.app.info(),
        optionalStartupValue('platform session', ipcClient.auth.getPlatformSession(), null),
      ]);

      const legacySession = !storedPlatformSession ? platformSessionFromConfig(config) : null;
      const restoredPlatformSession = storedPlatformSession ?? legacySession;
      if (legacySession) await ipcClient.auth.setPlatformSession(legacySession);

      const effectiveConfig: AppConfig = restoredPlatformSession
        ? {
            ...config,
            platformDeveloperMode: restoredPlatformSession.developerMode === true,
            platformBaseUrl: restoredPlatformSession.baseUrl,
            platformOrgId: restoredPlatformSession.orgId || config.platformOrgId || '',
            platformAccessToken: restoredPlatformSession.accessToken,
          }
        : {
            ...config,
            platformDeveloperMode: false,
            platformBaseUrl: PRODUCTION_PLATFORM_BASE_URL,
            platformOrgId: '',
            platformAccessToken: '',
            platformCatalogSource: 'local',
            platformFeaturePackageCatalog: [],
            featureProfile: normalizeFeatureProfile(null),
          };

      setAppInfo(info);
      setAppConfig(effectiveConfig);
      setSettingsDraft(createSettingsDraft(effectiveConfig));

      const [
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
        optionalStartupValue('application state', ipcClient.app.getState(), {}),
        optionalStartupValue('tools', ipcClient.tools.list(), []),
        optionalStartupValue('MCP servers', ipcClient.mcp.listServers(), []),
        optionalStartupValue('MCP tools', ipcClient.mcp.listTools(), []),
        optionalStartupValue('skills', ipcClient.automation.listSkills(), []),
        optionalStartupValue('scheduled tasks', ipcClient.automation.listTasks(), []),
        optionalStartupValue('task runs', ipcClient.automation.listTaskRuns(), []),
        optionalStartupValue('remote control', ipcClient.automation.getRemoteControl(), EMPTY_REMOTE_CONTROL),
        optionalStartupValue('virtual teams', ipcClient.automation.listTeams(), []),
        optionalStartupValue('team runs', ipcClient.automation.listTeamRuns(), []),
        optionalStartupValue('scheduler', ipcClient.automation.getSchedulerStatus(), EMPTY_SCHEDULER_STATUS),
        optionalStartupValue('chat history', ipcClient.history.listRecords({ type: 'chat-session', limit: MAX_RECENT_SESSIONS }), []),
        optionalStartupValue('history records', ipcClient.history.listRecords({ limit: 500 }), []),
        optionalStartupValue('history storage', ipcClient.history.getStorageInfo(), EMPTY_HISTORY_STORAGE),
      ]);
      if (config.platformAccessToken || config.platformDeveloperMode) {
        void ipcClient.app.setConfig({
          platformDeveloperMode: false,
          platformBaseUrl: restoredPlatformSession?.developerMode
            ? PRODUCTION_PLATFORM_BASE_URL
            : restoredPlatformSession?.baseUrl || PRODUCTION_PLATFORM_BASE_URL,
          platformOrgId: restoredPlatformSession?.developerMode ? '' : restoredPlatformSession?.orgId || '',
          platformAccessToken: '',
          ...(!restoredPlatformSession
            ? {
                platformCatalogSource: 'local' as const,
                platformFeaturePackageCatalog: [],
                featureProfile: normalizeFeatureProfile(null),
              }
            : {}),
        });
      }

      setAppState(state);
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
      applyChatToolWorkspacePath(activeSession?.toolWorkspacePath ?? '');
      setChatContextAttachments(activeSession?.contextAttachments ?? []);
      applyChatExecutionSettings(activeSession);
      hasHydratedSessionsRef.current = true;
      hasHydratedProjectsRef.current = true;
      hasHydratedRolesRef.current = true;
      hasHydratedEmployeesRef.current = true;
      hasHydratedProjectTeamsRef.current = true;
      hasHydratedProjectChatsRef.current = true;
      hasHydratedProjectOutputsRef.current = true;
      setStatus('Ready');
      void syncPlatformStateFromConfig(effectiveConfig, { reason: 'startup', silent: true });
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

  function updateMainChatSessionMessages(
    sessionId: string,
    update: (messages: UiMessage[]) => UiMessage[],
  ) {
    if (currentSessionIdRef.current === sessionId) {
      setMessages(update);
      return;
    }

    setSessions(current => current.map(session => {
      if (session.id !== sessionId) {
        return session;
      }
      const nextMessages = update(session.messages).slice(-MAX_PERSISTED_MESSAGES);
      return {
        ...session,
        messages: nextMessages,
        title: getSessionTitle(nextMessages),
        updatedAt: Date.now(),
      };
    }));
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
            chatExecutionModeOverride,
            chatPermissionProfileOverride,
          ),
        )
        : current;
      return upsertSession(withCurrent, nextSession);
    });
    setCurrentSessionId(nextSession.id);
    setMessages(nextSession.messages);
    applyChatToolWorkspacePath(nextSession.toolWorkspacePath ?? '');
    setChatContextAttachments(nextSession.contextAttachments ?? []);
    applyChatExecutionSettings(nextSession);
    setChatImageAttachments([]);
    setInput('');
    setStatus('Ready');
    setActiveView('chat');
    setMobileNavigationOpen(false);
    inputRef.current?.focus();
  }

  function loadSession(sessionId: string) {
    const session = sessions.find(candidate => candidate.id === sessionId);
    if (!session) {
      return;
    }

    setCurrentSessionId(session.id);
    setMessages(sanitizeMessages(session.messages));
    applyChatToolWorkspacePath(session.toolWorkspacePath ?? '');
    setChatContextAttachments(session.contextAttachments ?? []);
    applyChatExecutionSettings(session);
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
      providerId: getFeatureOwnerPackageId(featureResolution, 'automation'),
      providerConfig: { requireQaSignoff: false },
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

  function upsertChatToolActivity(
    toolId: string,
    update: Partial<ChatToolActivity>,
    scope?: ToolEventScope,
  ) {
    const updateMessages = (current: UiMessage[]): UiMessage[] => {
      const existingIndex = current.findIndex(message => message.activity?.toolId === toolId);
      const existing = existingIndex >= 0 ? current[existingIndex].activity : undefined;
      const activity: ChatToolActivity = {
        toolId,
        toolName: update.toolName || existing?.toolName || toolActivityNamesRef.current.get(toolId) || 'Tool',
        args: update.args || existing?.args || {},
        status: update.status || existing?.status || 'running',
        startedAt: update.startedAt || existing?.startedAt || Date.now(),
        ...existing,
        ...update,
      };

      if (existingIndex >= 0) {
        return current.map((message, index) => index === existingIndex ? {
          ...message,
          activity,
          content: formatChatToolActivityCopy(activity),
          status: activity.status === 'failed' || activity.status === 'rejected' ? 'failed' as const : 'sent' as const,
        } : message);
      }

      return [...current, createMessage('tool', formatChatToolActivityCopy(activity), {
        id: `tool-activity-${toolId}`,
        title: 'Activity',
        activity,
        status: activity.status === 'failed' || activity.status === 'rejected' ? 'failed' : 'sent',
      })];
    };

    const scopedProjectChatKey = scope?.projectChatKey
      ?? (scope?.projectId ? getProjectChatKey(scope.projectId, scope.channel ?? 'guided') : undefined);
    const mainSessionId = scopedProjectChatKey?.startsWith('main:')
      ? scopedProjectChatKey.slice('main:'.length)
      : undefined;
    if (mainSessionId) {
      updateMainChatSessionMessages(mainSessionId, updateMessages);
      return;
    }

    const projectChatKey = scope?.source === 'project-chat'
      ? scopedProjectChatKey
      : undefined;
    if (projectChatKey) {
      setProjectChatMessages(current => ({
        ...current,
        [projectChatKey]: updateMessages(current[projectChatKey] ?? []),
      }));
      return;
    }

    setMessages(updateMessages);
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

    const appearanceUpdate: Partial<AppConfig> = {};
    if (Object.prototype.hasOwnProperty.call(update, 'theme') && update.theme) {
      appearanceUpdate.theme = update.theme;
    }
    if (Object.prototype.hasOwnProperty.call(update, 'accentColor') && update.accentColor) {
      appearanceUpdate.accentColor = update.accentColor;
    }
    if (Object.keys(appearanceUpdate).length === 0) return;

    setAppConfig(current => ({ ...(current ?? {}), ...appearanceUpdate }));
    ipcClient.app.setConfig(appearanceUpdate)
      .then(() => {
        setSettingsMessage('Appearance saved');
        setStatus('Ready');
      })
      .catch(async error => {
        const persistedConfig = await ipcClient.app.getConfig().catch(() => null);
        if (persistedConfig) {
          const config = withDevelopmentPlatformSession(persistedConfig);
          setAppConfig(config);
          setSettingsDraft(current => ({
            ...current,
            theme: config.theme || 'system',
            accentColor: getSkinAccent(config.accentColor),
          }));
        }
        setSettingsMessage(error instanceof Error ? error.message : String(error));
        setStatus('Appearance settings error');
      });
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

  async function deleteChatSession(sessionId: string) {
    setSettingsMessage('');
    try {
      const recordId = `${CHAT_SESSION_HISTORY_ID_PREFIX}${sessionId}`;
      const deletedRecord = historyRecords.find(record => record.id === recordId);
      await ipcClient.history.deleteRecord(recordId);
      const removed = removeDeletedChatSession(recordId, deletedRecord);
      setHistoryRecords(current => current.filter(record => record.id !== recordId));
      setSettingsMessage(removed ? 'Chat deleted.' : 'The chat was already removed.');
    } catch (error) {
      setSettingsMessage(formatDesktopError(error));
    }
  }

  async function deleteAllChatSessions() {
    setSettingsMessage('');
    try {
      const recordIds = new Set([
        ...sessions.map(session => `${CHAT_SESSION_HISTORY_ID_PREFIX}${session.id}`),
        ...historyRecords.filter(record => record.type === 'chat-session').map(record => record.id),
      ]);
      await Promise.all(Array.from(recordIds, recordId => ipcClient.history.deleteRecord(recordId)));

      const nextSession = createEmptySession(appInfo?.workspacePath);
      setSessions([nextSession]);
      setCurrentSessionId(nextSession.id);
      setMessages(nextSession.messages);
      applyChatToolWorkspacePath('');
      setChatContextAttachments([]);
      applyChatExecutionSettings(nextSession);
      setChatImageAttachments([]);
      setInput('');
      setHistoryRecords(current => current.filter(record => record.type !== 'chat-session'));
      setSettingsMessage('All saved chats were deleted. Workspace files were not changed.');
      setStatus('Ready');
    } catch (error) {
      setSettingsMessage(formatDesktopError(error));
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
      applyChatToolWorkspacePath(nextActiveSession.toolWorkspacePath ?? '');
      setChatContextAttachments(nextActiveSession.contextAttachments ?? []);
      applyChatExecutionSettings(nextActiveSession);
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
    applyChatToolWorkspacePath(session.toolWorkspacePath ?? '');
    setChatContextAttachments(session.contextAttachments ?? []);
    applyChatExecutionSettings(session);
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

      applyChatToolWorkspacePath(normalizeWorkspacePath(result.path));
      setStatus('Working folder set');
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
    applyChatToolWorkspacePath('');
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

  function applyToolPermissionPreset(
    preset: 'allow-all' | 'ask-mutating' | 'deny-mutating',
    targetTools: Tool[] = tools,
  ) {
    const toolPermissionPolicies: Record<string, ToolPermissionMode> = {
      ...(appConfig?.toolPermissionPolicies ?? {}),
    };
    for (const tool of targetTools) {
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
        title: 'CodeAgent',
        status: 'sending',
      });

      streamMessageIds.current.set(requestId, {
        scope: 'main',
        sessionId: currentSessionId,
        messageId: assistantMessage.id,
      });
      chatRequestStartedAtRef.current.set(requestId, Date.now());
      appendMessage(assistantMessage);
      const persistedWorkspacePath = sessions.find(session => session.id === currentSessionId)?.toolWorkspacePath ?? '';
      const scopedWorkspacePath = (
        chatToolWorkspacePathRef.current ||
        chatToolWorkspacePath ||
        persistedWorkspacePath
      ).trim();
      const chatToolScope: ToolEventScope = {
        source: 'chat',
        workspacePath: scopedWorkspacePath || undefined,
        projectId: `ad-hoc-${currentSessionId}`,
        projectName: scopedWorkspacePath ? getPathBasename(scopedWorkspacePath) : 'Chat',
        projectChatKey: `main:${currentSessionId}`,
        channel: 'guided',
      };
      // Keep the agent loop available even when no folder is selected. The main
      // process owns the permission boundary and returns a grounded denial for
      // out-of-scope filesystem calls. Disabling tools here lets the model guess.
      const chatToolsEnabled = effectiveChatExecutionMode === 'agent';

      await ipcClient.api.chatStream({
        requestId,
        authorizedWorkspacePath: scopedWorkspacePath || undefined,
        messages: getChatMessages(messages, requestContent),
        provider: activeProvider,
        baseUrl: appConfig?.baseUrl || activeProviderDefault.baseUrl,
        model: appConfig?.model || activeProviderDefault.model,
        maxTokens: Number(appConfig?.maxTokens ?? activeProviderDefault.maxTokens),
        contextTokens: Number(appConfig?.contextTokens ?? activeProviderDefault.contextTokens),
        enableTools: chatToolsEnabled,
        maxToolRounds: chatToolsEnabled ? 12 : 0,
        permissionProfile: effectiveChatPermissionProfile,
        toolScope: chatToolScope,
        temperature: Number(appConfig?.temperature ?? 0.7),
      });
    } catch (error) {
      if (pendingStreamRequestId) {
        streamMessageIds.current.delete(pendingStreamRequestId);
        chatRequestStartedAtRef.current.delete(pendingStreamRequestId);
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
      title: channel === 'team' ? 'Project Team' : 'CodeAgent',
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
    chatRequestStartedAtRef.current.set(requestId, Date.now());
    setStatus('Streaming');

    try {
      const authorizedWorkspacePath = project.workspacePath ?? appInfo?.workspacePath ?? workspacePath;
      await ipcClient.api.chatStream({
        requestId,
        structuredAgentLoop: true,
        authorizedWorkspacePath,
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
          runId: requestId,
          workspacePath: authorizedWorkspacePath,
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
        permissionProfile: project.permissionMode === 'full-access' ? 'full-access' : 'ask',
        temperature: Number(appConfig?.temperature ?? 0.7),
      });
    } catch (error) {
      streamMessageIds.current.delete(requestId);
      chatRequestStartedAtRef.current.delete(requestId);
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

  function clearComposerInput() {
    setInput('');
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
      upsertChatToolActivity(review.toolId, {
        status: approved ? 'running' : 'rejected',
        completedAt: approved ? undefined : Date.now(),
        error: approved ? undefined : 'Permission was not granted.',
      });
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
      upsertChatToolActivity(review.toolId, {
        status: approved ? 'running' : 'rejected',
        completedAt: approved ? undefined : Date.now(),
        error: approved ? undefined : 'Permission was not granted.',
      });
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
      upsertChatToolActivity(review.toolId, {
        toolName: review.toolName,
        args: review.args || {},
        status: approved ? 'running' : 'rejected',
        completedAt: approved ? undefined : Date.now(),
        error: approved ? undefined : 'Permission was not granted.',
      });
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

  async function saveSettings(event?: React.FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (settingsDraft.desktopPermissionProfile === 'full-access' && appConfig?.desktopPermissionProfile !== 'full-access') {
      const confirmed = window.confirm(
        'Enable full computer access? CodeAgent will be able to access any file allowed to your OS account and run supported commands without CodeAgent approval prompts.',
      );
      if (!confirmed) {
        setSettingsMessage('Full access was not enabled.');
        return;
      }
    }
    const shouldPrepareLocalModel = activeSettingsSection === 'model' && settingsDraft.llmProvider === 'codeagent';
    setIsSavingSettings(true);
    setSettingsMessage(shouldPrepareLocalModel
      ? 'Preparing the selected model and starting CodeAgent inference…'
      : '');

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
        localEnginePath: settingsDraft.llmProvider === 'codeagent' ? '' : settingsDraft.localEnginePath.trim(),
        localGpuLayers: settingsDraft.localGpuLayers.trim() ? Number(settingsDraft.localGpuLayers) : undefined,
        enableLlmTools: settingsDraft.enableLlmTools,
        desktopPermissionProfile: settingsDraft.desktopPermissionProfile,
        theme: settingsDraft.theme,
        accentColor: settingsDraft.accentColor,
        memoryEnabled: settingsDraft.memoryEnabled,
        pluginsEnabled: settingsDraft.pluginsEnabled,
        autoUpdate: settingsDraft.autoUpdate,
        cliOptions: buildCliOptions(settingsDraft),
        ...(developmentPlatformSessionRef.current
          ? {}
          : {
              featureProfile: nextFeatureProfile,
              featureAccounts: writeProfileToAccountStore(appConfig, nextFeatureProfile),
            }),
      };

      if (shouldPrepareLocalModel) {
        if (!settingsDraft.model) throw new Error('Select a CodeAgent model before saving.');
        setLocalModelPreparation({ phase: 'resolving', model: settingsDraft.model, detail: 'Checking whether the selected model is available locally…' });
        const downloaded = await ipcClient.localModels.listDownloaded();
        const available = downloaded.some(model => model.repository === settingsDraft.model || model.id === settingsDraft.model);
        if (!available) {
          setLocalModelPreparation({ phase: 'downloading', model: settingsDraft.model, detail: 'Downloading and verifying the recommended GGUF quantization from Hugging Face…' });
          await ipcClient.localModels.download(settingsDraft.model);
        }
        setLocalModelPreparation({ phase: 'starting', model: settingsDraft.model, detail: 'Loading the model into llama.cpp and waiting for the inference API to become healthy…' });
        const localStatus = await ipcClient.localModels.start({
          model: settingsDraft.model,
          contextTokens: Number(settingsDraft.contextTokens),
          gpuLayers: settingsDraft.localGpuLayers.trim() ? Number(settingsDraft.localGpuLayers) : undefined,
        });
        setLocalModelPreparation({
          phase: 'ready',
          model: settingsDraft.model,
          detail: `Ready at ${localStatus.baseUrl}`,
          logPath: localStatus.logPath,
        });
      } else if (settingsDraft.llmProvider !== 'codeagent') {
        setLocalModelPreparation({ phase: 'idle' });
      }

      await ipcClient.app.setConfig(nextConfig);

      if (settingsDraft.llmProvider !== 'codeagent' && settingsDraft.apiKey.trim()) {
        await ipcClient.auth.setToken({
          accessToken: settingsDraft.apiKey.trim(),
          provider: settingsDraft.llmProvider,
        });
      }

      const config = withDevelopmentPlatformSession(await ipcClient.app.getConfig());
      setAppConfig(config);
      setSettingsDraft({ ...createSettingsDraft(config), apiKey: '' });
      setSettingsMessage('Saved');
      setStatus('Ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (shouldPrepareLocalModel) {
        const log = await ipcClient.localModels.readLog(100).catch(() => ({ path: '', content: '' }));
        setLocalModelPreparation({
          phase: 'error',
          model: settingsDraft.model,
          detail: message,
          logPath: log.path,
          logContent: log.content,
        });
        setSettingsMessage('The selected model could not be prepared. Review the details below.');
      } else {
        setSettingsMessage(message);
      }
      setStatus('Settings error');
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function openLocalModelLog() {
    try {
      await ipcClient.localModels.openLog();
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : String(error));
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
    // Persistent config deliberately strips plaintext platform tokens. Keep
    // the authenticated session as an in-memory overlay after changing local
    // package state so an Uninstall -> Install/Update sequence does not fall
    // back to developer-local archive discovery.
    const config = await restorePlatformSessionOverlay(await ipcClient.app.getConfig());
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
      const profile = mergeLocalPackageInstallState(
        normalizeFeatureProfile(platformProfile.profile),
        currentProfile,
      );
      const syncedOrgId = platformProfile.org_id || platformCatalog.org_id || platformOrgId;
      const syncedAt = new Date().toISOString();
      const nextConfig: Partial<AppConfig> = {
        platformBaseUrl,
        platformOrgId: syncedOrgId,
        platformCatalogSource: 'platform',
        platformCatalogLastSyncedAt: syncedAt,
        platformFeaturePackageCatalog: platformCatalog.packages,
        featureProfile: profile,
        featureAccounts: writeProfileToAccountStore(configSnapshot, profile),
      };
      const config = await commitAuthenticatedPlatformConfig(nextConfig, {
        accessToken: platformToken,
        baseUrl: platformBaseUrl,
        orgId: syncedOrgId,
        developerMode: configSnapshot?.platformDeveloperMode === true,
      });
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
      const invalidSession = /Platform API 401\b/.test(message);
      if (invalidSession) {
        await ipcClient.auth.clearPlatformSession();
        developmentPlatformSessionRef.current = null;
        const guestProfile = normalizeFeatureProfile(null);
        await ipcClient.app.setConfig({
          platformAccessToken: '',
          platformDeveloperMode: false,
          platformBaseUrl: PRODUCTION_PLATFORM_BASE_URL,
          platformOrgId: '',
          platformCatalogSource: 'local',
          platformFeaturePackageCatalog: [],
          featureProfile: guestProfile,
        });
        const guestConfig = await ipcClient.app.getConfig();
        setAppConfig(guestConfig);
        setSettingsDraft(current => ({
          ...createSettingsDraft(guestConfig),
          apiKey: current.apiKey,
        }));
        if (!options.silent) setSettingsMessage('Your platform session expired or was revoked. Sign in again.');
      }
      if (options.silent) {
        console.warn('Platform startup sync failed:', error);
        setStatus('Ready');
      } else if (!invalidSession) {
        setSettingsMessage(message);
        setStatus('Platform sync error');
      } else {
        setStatus('Platform session expired');
      }
      return false;
    } finally {
      setIsSyncingPlatform(false);
    }
  }

  async function handlePlatformSync() {
    await syncPlatformStateFromConfig(appConfig, { reason: 'manual' });
  }

  async function handlePlatformDeveloperModeChange(checked: boolean) {
    if (checked) {
      updateSettingsDraft({
        platformDeveloperMode: true,
        platformBaseUrl: DEVELOPMENT_PLATFORM_BASE_URL,
        platformOrgId: '',
      });
      setSettingsMessage('Developer connection settings apply only to this window. If you sign in, that authenticated session is restored securely until it expires or you sign out.');
      return;
    }

    await ipcClient.auth.clearPlatformSession();
    developmentPlatformSessionRef.current = null;
    const persistedConfig = await ipcClient.app.getConfig();
    const config: AppConfig = {
      ...persistedConfig,
      platformDeveloperMode: false,
      platformBaseUrl: PRODUCTION_PLATFORM_BASE_URL,
      platformOrgId: '',
      platformAccessToken: '',
      platformCatalogSource: 'local',
      platformFeaturePackageCatalog: [],
      featureProfile: normalizeFeatureProfile(null),
    };
    setAppConfig(config);
    setSettingsDraft(current => ({
      ...current,
      platformDeveloperMode: false,
      platformBaseUrl: PRODUCTION_PLATFORM_BASE_URL,
      platformOrgId: '',
      accountPassword: '',
      accountResetToken: '',
    }));
    setSettingsMessage('Developer mode disabled. Authentication now uses the managed platform.');
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
        const platformBaseUrl = getEffectivePlatformBaseUrl(settingsDraft);
        const platformOrgId = settingsDraft.platformOrgId.trim() ||
          login.session?.org_id ||
          login.workspace?.organization?.org_id ||
          '';
        const platformCatalog = await fetchPlatformFeatureCatalog(platformBaseUrl, login.access_token, platformOrgId);
        const platformProfile = await fetchPlatformFeatureProfile(platformBaseUrl, login.access_token, platformOrgId);
        const profile = normalizeFeatureProfile(platformProfile.profile);
        const syncedOrgId = platformProfile.org_id || platformCatalog.org_id || platformOrgId;
        const nextConfig: Partial<AppConfig> = {
          platformBaseUrl,
          platformDeveloperMode: settingsDraft.platformDeveloperMode,
          platformOrgId: syncedOrgId,
          platformCatalogSource: 'platform',
          platformCatalogLastSyncedAt: new Date().toISOString(),
          platformFeaturePackageCatalog: platformCatalog.packages,
          featureProfile: profile,
          featureAccounts: writeProfileToAccountStore(appConfig, profile),
        };
        const config = await commitAuthenticatedPlatformConfig(nextConfig, {
          accessToken: login.access_token,
          baseUrl: platformBaseUrl,
          orgId: syncedOrgId,
          developerMode: settingsDraft.platformDeveloperMode,
        });
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
      const platformBaseUrl = getEffectivePlatformBaseUrl(settingsDraft);
      const platformOrgId = registration.session?.org_id ||
        registration.workspace?.organization?.org_id ||
        settingsDraft.platformOrgId.trim() ||
        '';
      const platformCatalog = await fetchPlatformFeatureCatalog(platformBaseUrl, registration.access_token, platformOrgId);
      const platformProfile = await fetchPlatformFeatureProfile(platformBaseUrl, registration.access_token, platformOrgId);
      const profile = normalizeFeatureProfile(platformProfile.profile);
      const syncedOrgId = platformProfile.org_id || platformCatalog.org_id || platformOrgId;
      const nextConfig: Partial<AppConfig> = {
        platformBaseUrl,
        platformDeveloperMode: settingsDraft.platformDeveloperMode,
        platformOrgId: syncedOrgId,
        platformCatalogSource: 'platform',
        platformCatalogLastSyncedAt: new Date().toISOString(),
        platformFeaturePackageCatalog: platformCatalog.packages,
        featureProfile: profile,
        featureAccounts: writeProfileToAccountStore(appConfig, profile),
      };
      const config = await commitAuthenticatedPlatformConfig(nextConfig, {
        accessToken: registration.access_token,
        baseUrl: platformBaseUrl,
        orgId: syncedOrgId,
        developerMode: settingsDraft.platformDeveloperMode,
      });
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
    await ipcClient.auth.clearPlatformSession();
    setPurchasePackageId(null);
    if (appConfig?.platformDeveloperMode) {
      const config = updateDevelopmentPlatformSession({
        platformAccessToken: '',
        platformCatalogSource: 'local',
        platformFeaturePackageCatalog: [],
        featureProfile: nextProfile,
      });
      setSettingsDraft(current => ({
        ...createSettingsDraft(config),
        apiKey: current.apiKey,
        accountPassword: '',
      }));
      setSettingsMessage('Signed out. Developer connection settings remain active for this window.');
      setStatus('Ready');
      return;
    }
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

  async function handleFeaturePackageAction(
    packageId: string,
    action: 'default' | 'update' | 'uninstall' = 'default',
  ) {
    const packageEntry = featureResolution.packages.find(entry => entry.manifest.id === packageId);
    if (!packageEntry) {
      setSettingsMessage(`Unknown feature package: ${packageId}`);
      return;
    }

    const isEntitled = packageEntry.state === 'available' || packageEntry.state === 'trial';
    const profile = getFeatureProfileFromConfig(appConfig);

    if (packageEntry.manifest.id === BASE_FEATURE_PACKAGE_ID) {
      return;
    }

    if (action === 'uninstall') {
      if (!isPackageRuntimeAvailable(packageEntry.installState)) {
        setSettingsMessage(`${packageEntry.manifest.displayName} is not installed on this device.`);
        return;
      }
      if (!window.confirm(`Uninstall ${packageEntry.manifest.displayName} from this device? Your purchase will remain in your account.`)) {
        return;
      }
      try {
        setStatus('Uninstalling package');
        setSettingsMessage(`Uninstalling ${packageEntry.manifest.displayName} from this device...`);
        await ipcClient.app.uninstallFeaturePackage({ manifest: packageEntry.manifest as unknown as Record<string, any> });
        await persistFeatureProfile(
          createUninstalledProfile(profile, packageEntry.manifest.id),
          `${packageEntry.manifest.displayName} was uninstalled from this device. Your purchase is still owned.`,
        );
        setPackageOperationError(null);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        setSettingsMessage(`Couldn’t uninstall ${packageEntry.manifest.displayName}.`);
        setPackageOperationError({
          packageId: packageEntry.manifest.id,
          packageName: packageEntry.manifest.displayName,
          productSku: packageEntry.manifest.productSku,
          version: packageEntry.manifest.version,
          phase: 'Local package removal',
          message: errorMessage,
          occurredAt: new Date().toISOString(),
        });
        setStatus('Package uninstall error');
      }
      return;
    }

    if (isEntitled && (action === 'update' || !isPackageRuntimeAvailable(packageEntry.installState))) {
      setPackageOperationError(null);
      const storedPlatformSession = await ipcClient.auth.getPlatformSession().catch(() => null);
      const platformBaseUrl = normalizePlatformBaseUrl(String(
        storedPlatformSession?.baseUrl || appConfig?.platformBaseUrl || '',
      ));
      const platformToken = storedPlatformSession?.accessToken
        || (typeof appConfig?.platformAccessToken === 'string' ? appConfig.platformAccessToken : '');
      if (platformBaseUrl && platformToken) {
        try {
          setSettingsMessage(`${action === 'update' ? 'Downloading the latest' : 'Installing and verifying'} ${packageEntry.manifest.displayName}...`);
          setStatus(action === 'update' ? 'Updating package' : 'Installing package');
          const platformOrgId = String(storedPlatformSession?.orgId || appConfig?.platformOrgId || profile.accountId || '');
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
          const installedProfile = createInstalledProfile(normalizeFeatureProfile(result.profile), packageEntry.manifest, localInstall);
          const nextConfig: Partial<AppConfig> = {
            featureProfile: installedProfile,
            featureAccounts: writeProfileToAccountStore(appConfig, installedProfile),
            platformOrgId: result.org_id || appConfig?.platformOrgId,
            platformCatalogSource: 'platform',
            platformCatalogLastSyncedAt: new Date().toISOString(),
          };
          const config = await commitAuthenticatedPlatformConfig(nextConfig, {
            accessToken: platformToken,
            baseUrl: platformBaseUrl,
            orgId: result.org_id || platformOrgId,
            developerMode: appConfig?.platformDeveloperMode === true,
          }, false);
          setAppConfig(config);
          setSettingsDraft(current => ({
            ...createSettingsDraft(config),
            apiKey: current.apiKey,
            accountPassword: '',
          }));
          setSettingsMessage(`${packageEntry.manifest.displayName} ${action === 'update' ? 'was updated' : 'was installed'}, verified, and activated.`);
          setPackageOperationError(null);
          setStatus('Ready');
          return;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          setSettingsMessage(`Couldn’t install ${packageEntry.manifest.displayName}. Open the error details in Store.`);
          setPackageOperationError({
            packageId: packageEntry.manifest.id,
            packageName: packageEntry.manifest.displayName,
            productSku: packageEntry.manifest.productSku,
            version: packageEntry.manifest.version,
            phase: 'Platform download, verification, and installation',
            message: errorMessage,
            occurredAt: new Date().toISOString(),
          });
          setStatus('Platform install error');
          return;
        }
      }

      if (packageEntry.manifest.distribution.securityBoundary === 'signed-local-bundle'
        && appConfig?.platformCatalogSource === 'platform') {
        const errorMessage = 'Your package purchase is still owned, but the secure platform session is unavailable. Sign in again, then choose Install.';
        setSettingsMessage(`Couldn’t install ${packageEntry.manifest.displayName}. ${errorMessage}`);
        setPackageOperationError({
          packageId: packageEntry.manifest.id,
          packageName: packageEntry.manifest.displayName,
          productSku: packageEntry.manifest.productSku,
          version: packageEntry.manifest.version,
          phase: 'Platform authentication',
          message: errorMessage,
          occurredAt: new Date().toISOString(),
        });
        setStatus('Platform sign-in required');
        return;
      }
      try {
        setSettingsMessage(`${action === 'update' ? 'Reinstalling the latest' : 'Installing and verifying'} ${packageEntry.manifest.displayName}...`);
        setStatus(action === 'update' ? 'Updating package' : 'Installing package');
        const localInstall = packageEntry.manifest.distribution.securityBoundary === 'signed-local-bundle'
          ? await ipcClient.app.installFeaturePackage({ manifest: packageEntry.manifest as unknown as Record<string, any> })
          : undefined;
        const nextProfile = createInstalledProfile(profile, packageEntry.manifest, localInstall);
        await persistFeatureProfile(
          nextProfile,
          localInstall
            ? `${packageEntry.manifest.displayName} ${action === 'update' ? 'updated' : 'verified and installed'} locally and activated.`
            : `${packageEntry.manifest.displayName} installed locally. ${packageEntry.manifest.distribution.notes}`,
        );
        setPackageOperationError(null);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        setSettingsMessage(`Couldn’t install ${packageEntry.manifest.displayName}. Open the error details in Store.`);
        setPackageOperationError({
          packageId: packageEntry.manifest.id,
          packageName: packageEntry.manifest.displayName,
          productSku: packageEntry.manifest.productSku,
          version: packageEntry.manifest.version,
          phase: 'Local verification and installation',
          message: errorMessage,
          occurredAt: new Date().toISOString(),
        });
        setStatus('Package install error');
      }
      return;
    }

    if (isEntitled) {
      const packageWorkspace = getDesktopPrimaryNavigation(featureResolution)
        .find(item => item.packageId === packageEntry.manifest.id);
      if (packageWorkspace && isPackageRuntimeAvailable(packageEntry.installState)) {
        setSettingsMessage('');
        openPrimaryNavigationItem(packageWorkspace);
        return;
      }
      setSettingsMessage(`${packageEntry.manifest.displayName} is installed but does not expose an app workspace.`);
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
        await createPlatformPaymentMethod(
          platformBaseUrl,
          platformToken,
          orgId,
          featureResolution.profile.displayName || selectedPurchasePackage.displayName,
          purchaseDraft,
        );
        const result = await purchasePlatformPackage(platformBaseUrl, platformToken, orgId, selectedPurchasePackage.id);
        setPurchasePackageId(null);
        setPurchaseDraft({ ...EMPTY_PURCHASE_DRAFT });
        const nextConfig: Partial<AppConfig> = {
          featureProfile: result.profile,
          featureAccounts: writeProfileToAccountStore(appConfig, result.profile),
          platformOrgId: result.org_id || appConfig?.platformOrgId,
          platformCatalogSource: 'platform',
          platformCatalogLastSyncedAt: new Date().toISOString(),
        };
        const config = await commitAuthenticatedPlatformConfig(nextConfig, {
          accessToken: platformToken,
          baseUrl: platformBaseUrl,
          orgId: result.org_id || orgId,
          developerMode: appConfig?.platformDeveloperMode === true,
        }, false);
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

  function openPaymentMethodDialog() {
    setPurchaseDraft({
      ...EMPTY_PURCHASE_DRAFT,
      nameOnCard: featureResolution.profile.displayName || '',
    });
    setSettingsMessage('');
    setPaymentMethodDialogOpen(true);
  }

  async function addAccountPaymentMethod(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validatePurchaseDraft(purchaseDraft);
    if (validationError) {
      setSettingsMessage(validationError);
      return;
    }
    const profile = getFeatureProfileFromConfig(appConfig);
    if (profile.accountStatus !== 'signed-in') {
      setPaymentMethodDialogOpen(false);
      setSettingsMessage('Sign in before adding a payment method.');
      return;
    }
    const platformBaseUrl = normalizePlatformBaseUrl(String(appConfig?.platformBaseUrl || ''));
    const platformToken = typeof appConfig?.platformAccessToken === 'string' ? appConfig.platformAccessToken : '';
    try {
      setIsSavingSettings(true);
      if (platformBaseUrl && platformToken) {
        const orgId = String(appConfig?.platformOrgId || (profile as any).platform?.orgId || '');
        await createPlatformPaymentMethod(
          platformBaseUrl,
          platformToken,
          orgId,
          profile.displayName || profile.email || 'CodeAgent User',
          purchaseDraft,
        );
        await syncPlatformStateFromConfig(appConfig, { reason: 'manual', silent: true });
        setSettingsMessage('Payment method added and set as the default.');
      } else {
        const digits = purchaseDraft.cardNumber.replace(/\D/g, '');
        const expiry = parseCardExpiry(purchaseDraft.expiry)!;
        const paymentMethod: AccountPaymentMethod = {
          id: createLocalRecordId('pm'),
          type: 'card',
          brand: getCardBrand(digits),
          last4: digits.slice(-4),
          expMonth: expiry.expMonth,
          expYear: expiry.expYear,
          createdAt: new Date().toISOString(),
        };
        await persistFeatureProfile(
          { ...profile, paymentMethods: [...profile.paymentMethods, paymentMethod], updatedAt: new Date().toISOString() },
          'Payment method added for this local account.',
        );
      }
      setPaymentMethodDialogOpen(false);
      setPurchaseDraft({ ...EMPTY_PURCHASE_DRAFT });
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function removeAccountPaymentMethod(methodId: string) {
    const profile = getFeatureProfileFromConfig(appConfig);
    const method = profile.paymentMethods.find(item => item.id === methodId);
    if (!method || !window.confirm(`Remove ${method.brand} ending ${method.last4}?`)) return;
    const platformBaseUrl = normalizePlatformBaseUrl(String(appConfig?.platformBaseUrl || ''));
    const platformToken = typeof appConfig?.platformAccessToken === 'string' ? appConfig.platformAccessToken : '';
    try {
      setIsSavingSettings(true);
      if (platformBaseUrl && platformToken) {
        await readPlatformJson(platformBaseUrl, `/billing/payment-methods/${encodeURIComponent(methodId)}`, platformToken, { method: 'DELETE' });
        await syncPlatformStateFromConfig(appConfig, { reason: 'manual', silent: true });
        setSettingsMessage('Payment method removed.');
      } else {
        if (profile.purchases.some(purchase => purchase.paymentMethodId === methodId)) {
          throw new Error('This payment method is attached to purchase history and cannot be removed.');
        }
        await persistFeatureProfile(
          { ...profile, paymentMethods: profile.paymentMethods.filter(item => item.id !== methodId), updatedAt: new Date().toISOString() },
          'Payment method removed from this local account.',
        );
      }
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function setDefaultAccountPaymentMethod(methodId: string) {
    const profile = getFeatureProfileFromConfig(appConfig);
    const method = profile.paymentMethods.find(item => item.id === methodId);
    if (!method) return;
    const platformBaseUrl = normalizePlatformBaseUrl(String(appConfig?.platformBaseUrl || ''));
    const platformToken = typeof appConfig?.platformAccessToken === 'string' ? appConfig.platformAccessToken : '';
    try {
      setIsSavingSettings(true);
      if (platformBaseUrl && platformToken) {
        await readPlatformJson(
          platformBaseUrl,
          `/billing/payment-methods/${encodeURIComponent(methodId)}/default`,
          platformToken,
          { method: 'POST' },
        );
        await syncPlatformStateFromConfig(appConfig, { reason: 'manual', silent: true });
        setSettingsMessage(`${method.brand} ending ${method.last4} is now the default payment method.`);
      } else {
        const reordered = [method, ...profile.paymentMethods.filter(item => item.id !== methodId)];
        await persistFeatureProfile(
          { ...profile, paymentMethods: reordered, updatedAt: new Date().toISOString() },
          `${method.brand} ending ${method.last4} is now the default payment method.`,
        );
      }
    } catch (error) {
      setSettingsMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSavingSettings(false);
    }
  }

  function openPrimaryView(view: AppView) {
    if (view === 'settings') {
      setSettingsMessage('');
    } else if (view === 'history') {
      setHistoryMessage('');
    }
    setActiveView(view);
    setMobileNavigationOpen(false);
  }

  function openPrimaryNavigationItem(item: DesktopNavigationItem) {
    if (item.route === 'settings') {
      openChildRoute('settings', 'general');
      return;
    }
    if (item.route === 'chat') {
      openPrimaryView('chat');
      return;
    }
    if (item.packageId === BASE_FEATURE_PACKAGE_ID) {
      openChildRoute(item.route, item.route);
      return;
    }
    const firstGroup = getDesktopChildNavigation(featureResolution, item.route)[0];
    if (firstGroup) {
      openPackageNavigationGroup(firstGroup);
    }
  }

  function isPrimaryNavigationItemActive(item: DesktopNavigationItem): boolean {
    if (item.route === 'settings') {
      return activeView === 'settings' && SYSTEM_SETTINGS_SECTION_IDS.has(activeSettingsSection);
    }
    if (item.route === 'chat') {
      return activeView === 'chat';
    }
    if (item.packageId === BASE_FEATURE_PACKAGE_ID) {
      return activeView === item.route;
    }
    return activePackageWorkspace?.id === item.id;
  }

  function getActiveChildMenu(): Array<NavigationChildItem<string>> {
    if (activeView === 'settings') {
      return filterNavigationItems(SETTINGS_MENU, featureResolution).filter(item => SYSTEM_SETTINGS_SECTION_IDS.has(item.id));
    }
    return [];
  }

  function openPackageNavigationGroup(group: DesktopNavigationItem) {
    const firstPage = getDesktopChildNavigation(featureResolution, group.route)[0];
    openChildRoute(group.route, firstPage?.id || group.id);
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
    setMobileNavigationOpen(false);
  }

  const statusLabel = isSending ? 'Working' : status;
  const activeProvider = appConfig?.llmProvider || DEFAULT_PROVIDER;
  const activeProviderDefault = getProviderDefault(activeProvider);
  const activeProviderLabel = activeProviderDefault.label;
  const mainFileWriteReviews = fileWriteReviews.filter(isMainChatReview);
  const mainCommandReviews = commandReviews.filter(isMainChatReview);
  const mainToolPermissionReviews = toolPermissionReviews.filter(isMainChatReview);
  const activeSession = sessions.find(session => session.id === currentSessionId);
  const conversationTitle = activeSession?.title || getSessionTitle(messages);
  const recentSessions = sortSessions(sessions.filter(isMeaningfulChatSession));
  const visibleRecentSessions = recentSessions.filter(session => matchesSessionSearch(session, sessionSearch));
  const exposedBridgeToolCount = tools.filter(tool => isToolExposedToModel(tool, appConfig)).length;
  const sidebarAccountProfile = featureResolution.profile;
  const sidebarAccountSignedIn = sidebarAccountProfile.accountStatus === 'signed-in';
  const sidebarAccountName = sidebarAccountSignedIn
    ? sidebarAccountProfile.displayName || sidebarAccountProfile.email || 'CodeAgent account'
    : 'Guest account';
  const sidebarAccountInitials = sidebarAccountName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'CA';
  const packageWorkspaceNavigation = availablePrimaryNav.filter(item => item.packageId !== BASE_FEATURE_PACKAGE_ID);
  const packageWorkspaceGroups = packageWorkspaceNavigation.flatMap(workspace => (
    getDesktopChildNavigation(featureResolution, workspace.route)
  ));
  const activePackageGroup = packageWorkspaceGroups.find(group => {
    if (group.route !== activeView) {
      return false;
    }
    if (group.route !== 'settings') {
      return true;
    }
    return getDesktopChildNavigation(featureResolution, group.route)
      .some(page => page.id === activeSettingsSection);
  }) ?? null;
  const activePackageWorkspace = activePackageGroup
    ? packageWorkspaceNavigation.find(workspace => workspace.route === activePackageGroup.parentRoute) ?? null
    : null;
  const activePackagePageMenu = activePackageGroup
    ? getDesktopChildNavigation(featureResolution, activePackageGroup.route)
    : [];
  const commandSuggestions = filterDesktopCommands(input, availableDesktopCommands);
  const showCommandPalette = activeView === 'chat' && commandSuggestions.length > 0 && !isSending;
  const selectedPurchasePackage = purchasePackageId
    ? featureResolution.packages.find(entry => entry.manifest.id === purchasePackageId)?.manifest ?? null
    : null;
  const activeSettingsMenuItem = SETTINGS_MENU.find(item => item.id === activeSettingsSection) ?? SETTINGS_MENU[0];
  const activeChildMenu = getActiveChildMenu();
  const activeChildId = getActiveChildId();
  const activePackagePage = activePackagePageMenu.find(item => item.id === activeChildId) ?? activePackageGroup;
  const viewTitle = activeView === 'chat'
    ? conversationTitle
    : activePackagePage?.title || activeSettingsMenuItem.title;
  const viewSubtitle = activeView === 'chat'
    ? appConfig?.model || activeProviderDefault.model
    : activePackagePage?.description || activeSettingsMenuItem.description;
  const skinStyle = getSkinStyle(appConfig?.accentColor);
  const projectNotificationClassName = getProjectNoticeClassName(projectActionMessage);
  const narrowNavigation = viewportSize.width <= 820;
  const navigationCollapsed = narrowNavigation ? !mobileNavigationOpen : sidebarCollapsed;

  return (
    <div className={`${styles.container} ${navigationCollapsed ? styles.containerCollapsed : ''} ${narrowNavigation ? styles.containerNarrow : ''}`} style={skinStyle}>
      <aside className={`${styles.navSidebar} ${navigationCollapsed ? styles.navSidebarCollapsed : ''}`} aria-label="Navigation">
        <div className={styles.brandBlock}>
          <span className={styles.brandMark}><Icon name="bot" size={17} /></span>
          <div>
            <strong>CodeAgent</strong>
            <span>{activeProviderLabel}</span>
          </div>
        </div>

        <button className={styles.newChatButton} type="button" title="New chat" onClick={startNewChat}>
          <span className={styles.navGlyph}><Icon name="plus" size={14} /></span>
          <span className={styles.navLabel}>New chat</span>
        </button>

        <nav className={styles.navList} aria-label="Primary">
          {availablePrimaryNav.map(item => {
            const workspaceGroups = getDesktopChildNavigation(featureResolution, item.route);
            const isPackageWorkspace = item.packageId !== BASE_FEATURE_PACKAGE_ID;
            const itemIsActive = isPrimaryNavigationItemActive(item);
            return <div className={styles.navGroup} key={item.id}>
              <button
                className={itemIsActive ? styles.navItemActive : styles.navItem}
                type="button"
                title={item.description}
                aria-expanded={isPackageWorkspace ? itemIsActive : undefined}
                onClick={() => openPrimaryNavigationItem(item)}
              >
                <span className={styles.navGlyph}><Icon name={item.icon} size={14} /></span>
                <span className={styles.navLabel}>{item.title}</span>
              </button>

              {isPackageWorkspace && itemIsActive && workspaceGroups.length > 0 && (
                <div className={styles.navSubList} aria-label={`${item.title} areas`}>
                  {workspaceGroups.map(group => (
                    <button
                      className={activePackageGroup?.id === group.id ? styles.navChildItemActive : styles.navChildItem}
                      type="button"
                      key={group.id}
                      title={`${group.title}: ${group.description}`}
                      onClick={() => openPackageNavigationGroup(group)}
                    >
                      <span className={styles.navChildGlyph}><Icon name={group.icon} size={13} /></span>
                      <span className={styles.navChildLabel}>
                        <strong>{group.title}</strong>
                        <span>{group.description}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {!isPackageWorkspace && itemIsActive && activeChildMenu.length > 0 && (
                <div className={styles.navSubList} aria-label={`${item.title} sections`}>
                  {activeChildMenu.map(child => (
                    <button
                      className={child.id === activeChildId ? styles.navChildItemActive : styles.navChildItem}
                      type="button"
                      key={child.id}
                      title={`${child.title}: ${child.description}`}
                      onClick={() => openChildRoute(item.route as AppView, child.id)}
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
          })}
        </nav>

        {!activePackageWorkspace && <section className={styles.recentSection}>
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
        </section>}

        <div className={styles.sidebarBottom}>
          <button
            className={activeView === 'settings' && activeSettingsSection === 'account'
              ? styles.sidebarAccountButtonActive
              : styles.sidebarAccountButton}
            type="button"
            title={sidebarAccountSignedIn ? sidebarAccountName : 'Open account settings'}
            onClick={() => openChildRoute('settings', 'account')}
          >
            <span className={styles.sidebarAccountAvatar} aria-hidden="true">
              {sidebarAccountSignedIn ? sidebarAccountInitials : <Icon name="user" size={14} />}
            </span>
            <div>
              <strong>{sidebarAccountName}</strong>
              <span>{sidebarAccountSignedIn ? formatAccountTier(sidebarAccountProfile) : 'Sign in or create an account'}</span>
            </div>
          </button>
        </div>
      </aside>

      {narrowNavigation && mobileNavigationOpen && (
        <button
          className={styles.mobileNavBackdrop}
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileNavigationOpen(false)}
        />
      )}

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
          <div className={styles.headerLeading}>
            <button
              className={styles.headerNavButton}
              type="button"
              title={navigationCollapsed ? 'Open navigation' : 'Close navigation'}
              aria-label={navigationCollapsed ? 'Open navigation' : 'Close navigation'}
              aria-pressed={navigationCollapsed}
              onClick={() => {
                if (narrowNavigation) {
                  setMobileNavigationOpen(value => !value);
                } else {
                  setSidebarCollapsed(value => !value);
                }
              }}
            >
              <Icon name="sidebar" size={17} />
            </button>
            <div className={styles.headerTitle}>
              <h1>{viewTitle}</h1>
              <span className={styles.subtitle}>
                {viewSubtitle}
              </span>
            </div>
          </div>
        </header>

        <div className={styles.workspaceFrame}>
          <div className={styles.workspaceColumn}>
            {activePackageWorkspace && activePackageGroup && (
              <div className={styles.developerPageNavigation}>
                <nav className={styles.pageTabs} aria-label={`${activePackageGroup.title} pages`}>
                  {activePackagePageMenu.map(child => (
                    <button
                      className={child.id === activeChildId ? styles.pageTabActive : styles.pageTab}
                      type="button"
                      key={child.id}
                      title={child.description}
                      onClick={() => openChildRoute(activePackageGroup.route as AppView, child.id)}
                    >
                      <Icon name={child.icon} size={13} />
                      <span>{child.title}</span>
                    </button>
                  ))}
                </nav>
              </div>
            )}

        <main className={`${styles.workspace} ${activeView !== 'chat' ? styles.workspaceDetail : ''} ${activeView === 'settings' ? styles.workspaceSettings : ''}`}>
          {activeView === 'chat' && (
            <section className={styles.chatPanel} aria-label="Chat">
              <div className={styles.messageList} ref={messageListRef}>
                {groupMessagesByAssistantRun(messages).map(({ message, activities }) => (
                  <MessageItem
                    key={message.id}
                    message={message}
                    activities={activities}
                    copied={copiedMessageId === message.id}
                    onCopy={() => copyMessage(message)}
                  />
                ))}
                <InlineApprovalQueue
                  fileWriteReviews={mainFileWriteReviews}
                  commandReviews={mainCommandReviews}
                  toolPermissionReviews={mainToolPermissionReviews}
                  onResolveFileWrite={resolveFileWriteReview}
                  onResolveCommand={resolveCommandReview}
                  onResolveToolPermission={resolveToolPermissionReview}
                />
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
                    <div className={styles.composerContextActions}>
                      {chatToolWorkspacePath ? (
                        <details className={styles.composerFolderMenu}>
                          <summary title={chatToolWorkspacePath}>
                            <Icon name="folder-open" size={13} />
                            <strong>{getPathBasename(chatToolWorkspacePath)}</strong>
                            <span className={styles.composerFolderChevron}><Icon name="chevron-right" size={12} /></span>
                          </summary>
                          <div className={styles.composerFolderMenuPopover}>
                            <span title={chatToolWorkspacePath}>{chatToolWorkspacePath}</span>
                            <button type="button" onClick={chooseChatToolWorkspaceFolder} disabled={isSending}>
                              <Icon name="folder-open" size={13} />
                              Change folder
                            </button>
                            <button type="button" onClick={clearChatToolWorkspaceFolder} disabled={isSending}>
                              <Icon name="x" size={13} />
                              Clear folder
                            </button>
                          </div>
                        </details>
                      ) : (
                        <button
                          className={styles.composerContextChip}
                          type="button"
                          onClick={chooseChatToolWorkspaceFolder}
                          disabled={isSending}
                          title="Choose a working folder"
                        >
                          <Icon name="folder-open" size={13} />
                          Set folder
                        </button>
                      )}
                      <button
                        className={styles.composerContextChip}
                        type="button"
                        onClick={chooseChatContextAttachments}
                        disabled={isSending}
                        title="Add files or folders as read-only chat context"
                      >
                        <Icon name="plus" size={13} />
                        Add context
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
                  placeholder="Ask CodeAgent…"
                  rows={1}
                  disabled={isSending}
                  aria-label="Message"
                />
                <div className={styles.composerToolbar}>
                  <div className={styles.composerMeta} aria-label="Chat execution settings">
                    <div className={styles.composerSettingMenu}>
                      <button
                        className={styles.composerSettingTrigger}
                        type="button"
                        aria-haspopup="menu"
                        aria-expanded={composerMenu === 'mode'}
                        onClick={() => {
                          setPendingChatPermissionProfile(null);
                          setComposerMenu(current => current === 'mode' ? null : 'mode');
                        }}
                        disabled={isSending}
                        title={`Mode: ${effectiveChatExecutionMode === 'agent' ? 'Agent can use tools and the working folder' : 'Chat answers without tools'}`}
                      >
                        <Icon name={effectiveChatExecutionMode === 'agent' ? 'bot' : 'chat'} size={13} />
                        <span>{effectiveChatExecutionMode === 'agent' ? 'Agent' : 'Chat'}</span>
                        <Icon name="chevron-right" size={11} />
                      </button>
                      {composerMenu === 'mode' && (
                        <div className={styles.composerSettingPopover} role="menu" aria-label="Choose chat mode">
                          <strong>Mode for this chat</strong>
                          <button
                            type="button"
                            role="menuitemradio"
                            aria-checked={effectiveChatExecutionMode === 'chat'}
                            onClick={() => {
                              setChatExecutionModeOverride('chat');
                              setComposerMenu(null);
                            }}
                          >
                            <Icon name="chat" size={15} />
                            <span><b>Chat</b><small>Answer without running tools.</small></span>
                            {effectiveChatExecutionMode === 'chat' && <Icon name="check" size={14} />}
                          </button>
                          <button
                            type="button"
                            role="menuitemradio"
                            aria-checked={effectiveChatExecutionMode === 'agent'}
                            onClick={() => {
                              setChatExecutionModeOverride('agent');
                              setComposerMenu(null);
                            }}
                          >
                            <Icon name="bot" size={15} />
                            <span><b>Agent</b><small>Use tools and work in the selected folder.</small></span>
                            {effectiveChatExecutionMode === 'agent' && <Icon name="check" size={14} />}
                          </button>
                          <div className={styles.composerSettingFooter}>
                            <button type="button" onClick={() => {
                              setChatExecutionModeOverride(null);
                              setComposerMenu(null);
                            }}>Use default</button>
                            <button type="button" onClick={() => {
                              setComposerMenu(null);
                              openChildRoute('settings', 'model');
                            }}>Manage default</button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className={styles.composerSettingMenu}>
                      <button
                        className={`${styles.composerSettingTrigger} ${effectiveChatPermissionProfile === 'full-access' ? styles.composerSettingTriggerDanger : ''}`}
                        type="button"
                        aria-haspopup="menu"
                        aria-expanded={composerMenu === 'permission'}
                        onClick={() => {
                          setPendingChatPermissionProfile(null);
                          setComposerMenu(current => current === 'permission' ? null : 'permission');
                        }}
                        disabled={isSending || effectiveChatExecutionMode === 'chat'}
                        title={effectiveChatExecutionMode === 'chat'
                          ? 'Permissions are inactive in Chat mode because tools are disabled'
                          : `Permissions: ${DESKTOP_PERMISSION_PROFILES.find(profile => profile.value === effectiveChatPermissionProfile)?.description}`}
                      >
                        <Icon name="lock" size={13} />
                        <span>{DESKTOP_PERMISSION_PROFILES.find(profile => profile.value === effectiveChatPermissionProfile)?.title}</span>
                        <Icon name="chevron-right" size={11} />
                      </button>
                      {composerMenu === 'permission' && (
                        <div className={`${styles.composerSettingPopover} ${styles.composerPermissionPopover}`} role="menu" aria-label="Choose permission level">
                          <strong>Permissions for this chat</strong>
                          <small className={styles.composerSettingWorkspace} title={chatToolWorkspacePath || 'No working folder selected'}>
                            {chatToolWorkspacePath ? `Working folder: ${chatToolWorkspacePath}` : 'No working folder selected'}
                          </small>
                          {DESKTOP_PERMISSION_PROFILES.map(profile => (
                            <button
                              type="button"
                              role="menuitemradio"
                              aria-checked={effectiveChatPermissionProfile === profile.value}
                              className={profile.danger ? styles.composerSettingDangerOption : undefined}
                              key={profile.value}
                              onClick={() => {
                                if (profile.danger) {
                                  setPendingChatPermissionProfile(profile.value);
                                  return;
                                }
                                setChatPermissionProfileOverride(profile.value);
                                setComposerMenu(null);
                              }}
                            >
                              <Icon name={profile.danger ? 'lock' : 'check'} size={15} />
                              <span><b>{profile.title}</b><small>{profile.description}</small></span>
                              {effectiveChatPermissionProfile === profile.value && <Icon name="check" size={14} />}
                            </button>
                          ))}
                          {pendingChatPermissionProfile === 'full-access' && (
                            <div className={styles.composerPermissionConfirm} role="alert">
                              <strong>Allow full computer access?</strong>
                              <span>CodeAgent may access any path available to your OS account and run supported commands without approval.</span>
                              <div>
                                <button type="button" onClick={() => setPendingChatPermissionProfile(null)}>Cancel</button>
                                <button type="button" onClick={() => {
                                  setChatPermissionProfileOverride('full-access');
                                  setPendingChatPermissionProfile(null);
                                  setComposerMenu(null);
                                }}>Use full access</button>
                              </div>
                            </div>
                          )}
                          <div className={styles.composerSettingFooter}>
                            <button type="button" onClick={() => {
                              setChatPermissionProfileOverride(null);
                              setPendingChatPermissionProfile(null);
                              setComposerMenu(null);
                            }}>Use default</button>
                            <button type="button" onClick={() => {
                              setComposerMenu(null);
                              openChildRoute('settings', 'general');
                            }}>Manage default</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className={styles.composerActions}>
                    {(input || chatImageAttachments.length > 0) && (
                      <button
                        className={styles.composerClearButton}
                        type="button"
                        onClick={clearComposerInput}
                        disabled={isSending}
                        title="Clear the draft message and pasted images"
                      >
                        Clear input
                      </button>
                    )}
                    <button className={styles.primaryButton} type="submit" disabled={isSending || (!input.trim() && chatImageAttachments.length === 0)} title="Send message (Command+Enter)">
                      <Icon name="send" size={14} />
                      Send
                      <kbd>⌘↵</kbd>
                    </button>
                  </div>
                </div>
              </form>
            </section>
          )}

          {activeView === 'projects' && (
            <FeatureViewErrorBoundary viewKey={`projects:${activeProjectsSection}`} viewLabel="Projects">
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
              fileWriteReviews={fileWriteReviews}
              commandReviews={commandReviews}
              toolPermissionReviews={toolPermissionReviews}
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
              onResolveFileWrite={resolveFileWriteReview}
              onResolveCommand={resolveCommandReview}
              onResolveToolPermission={resolveToolPermissionReview}
                onChangeSection={setActiveProjectsSection}
              />
            </FeatureViewErrorBoundary>
          )}

          {activeView === 'tools' && (
            <FeatureViewErrorBoundary viewKey={`tools:${activeToolsSection}`} viewLabel="Tools">
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
            </FeatureViewErrorBoundary>
          )}

          {activeView === 'automation' && (
            <FeatureViewErrorBoundary viewKey={`automation:${activeAutomationSection}`} viewLabel="Automation">
              <AutomationView
              providerId={getFeatureOwnerPackageId(featureResolution, 'automation')}
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
            </FeatureViewErrorBoundary>
          )}

          {activeView === 'history' && (
            <FeatureViewErrorBoundary viewKey={`history:${activeHistorySection}`} viewLabel="History">
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
            </FeatureViewErrorBoundary>
          )}

          {activeView === 'settings' && (
            <SettingsView
              activeSection={activeSettingsSection}
              draft={settingsDraft}
              tools={tools}
              sessions={sessions}
              currentSessionId={currentSessionId}
              appConfig={appConfig}
              message={settingsMessage}
              saving={isSavingSettings}
              localModelPreparation={localModelPreparation}
              featureResolution={featureResolution}
              onChange={updateSettingsDraft}
              onSetToolPermission={updateToolPermissionPolicy}
              onApplyToolPermissionPreset={preset => applyToolPermissionPreset(preset, tools.filter(isCoreTool))}
              onClearToken={clearToken}
              onAccountLogin={handleAccountLogin}
              onAccountRegister={handleAccountRegister}
              onAccountForgotPassword={handleAccountForgotPassword}
              onAccountResetPassword={handleAccountResetPassword}
              onAccountLogout={handleAccountLogout}
              onPlatformSync={handlePlatformSync}
              canSyncPlatform={canSyncPlatform}
              platformSyncing={isSyncingPlatform}
              onDeveloperModeChange={checked => void handlePlatformDeveloperModeChange(checked)}
              onPackageAction={handleFeaturePackageAction}
              packageOperationError={packageOperationError}
              onDismissPackageOperationError={() => setPackageOperationError(null)}
              onAddPaymentMethod={openPaymentMethodDialog}
              onSetDefaultPaymentMethod={methodId => void setDefaultAccountPaymentMethod(methodId)}
              onRemovePaymentMethod={methodId => void removeAccountPaymentMethod(methodId)}
              onOpenChat={loadSession}
              onDeleteChat={sessionId => void deleteChatSession(sessionId)}
              onDeleteAllChats={() => void deleteAllChatSessions()}
              onSubmit={saveSettings}
              onRetryLocalModel={() => void saveSettings()}
              onOpenLocalModelLog={() => void openLocalModelLog()}
            />
          )}
        </main>
          </div>
        </div>

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
                setActiveToolsSection('mcp');
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
          {hasShellFeature(featureResolution, 'project-history') && (
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

      {paymentMethodDialogOpen && (
        <PaymentMethodDialog
          draft={purchaseDraft}
          message={settingsMessage}
          busy={isSavingSettings}
          onChange={update => setPurchaseDraft(current => ({ ...current, ...update }))}
          onSubmit={addAccountPaymentMethod}
          onCancel={() => {
            setPaymentMethodDialogOpen(false);
            setPurchaseDraft({ ...EMPTY_PURCHASE_DRAFT });
            setSettingsMessage('');
          }}
        />
      )}
    </div>
  );
}

function FileWriteReviewCard({
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
      <section className={styles.inlineReviewCard} role="group" aria-labelledby={`file-write-review-title-${review.requestId}`}>
        <div className={styles.dialogHeader}>
          <div>
            <h3 id={`file-write-review-title-${review.requestId}`}>Review File Write</h3>
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
  );
}

function CommandReviewCard({
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
      <section className={styles.inlineReviewCard} role="group" aria-labelledby={`command-review-title-${review.requestId}`}>
        <div className={styles.dialogHeader}>
          <div>
            <h3 id={`command-review-title-${review.requestId}`}>Review Command</h3>
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
  );
}

function ToolPermissionReviewCard({
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
  const isWorkspaceCreation = review.toolName === 'workspace.create';
  return (
      <section className={styles.inlineReviewCard} role="group" aria-labelledby={`tool-permission-review-title-${review.requestId}`}>
        <div className={styles.dialogHeader}>
          <div>
            <h3 id={`tool-permission-review-title-${review.requestId}`}>
              {isWorkspaceCreation ? 'Recreate Project Folder' : 'Review Tool Call'}
            </h3>
            <p className={styles.reviewSubtitle}>
              {isWorkspaceCreation
                ? 'The saved project folder is missing and is required to continue.'
                : 'Desktop permission policy requires approval'}
              {queuedCount > 1 ? ` · ${queuedCount - 1} more pending` : ''}
            </p>
          </div>
          <span className={styles.reviewBadge}>Approval required</span>
        </div>

        <dl className={styles.reviewMeta}>
          <div>
            <dt>{isWorkspaceCreation ? 'Action' : 'Tool'}</dt>
            <dd title={review.toolName}>{isWorkspaceCreation ? 'Create project workspace' : review.toolName}</dd>
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
          <span className={styles.settingsMessage}>
            {isWorkspaceCreation
              ? 'No project files will be created until you approve this folder.'
              : 'The tool call is blocked until you approve it.'}
          </span>
          <div className={styles.dialogActions}>
            <button className={styles.dangerButton} type="button" onClick={onReject}>
              <Icon name="x" size={14} />
              {isWorkspaceCreation ? 'Cancel' : 'Reject'}
            </button>
            <button className={styles.primaryButton} type="button" onClick={onApprove}>
              <Icon name="check" size={14} />
              {isWorkspaceCreation ? 'Recreate Folder' : 'Approve Tool'}
            </button>
          </div>
        </div>
      </section>
  );
}

function InlineApprovalQueue({
  fileWriteReviews,
  commandReviews,
  toolPermissionReviews,
  onResolveFileWrite,
  onResolveCommand,
  onResolveToolPermission,
}: {
  fileWriteReviews: FileWriteReviewRequest[];
  commandReviews: CommandReviewRequest[];
  toolPermissionReviews: ToolPermissionReviewRequest[];
  onResolveFileWrite: (review: FileWriteReviewRequest, approved: boolean) => void;
  onResolveCommand: (review: CommandReviewRequest, approved: boolean) => void;
  onResolveToolPermission: (review: ToolPermissionReviewRequest, approved: boolean) => void;
}) {
  const queuedCount = fileWriteReviews.length + commandReviews.length + toolPermissionReviews.length;
  if (queuedCount === 0) return null;

  return (
    <aside className={styles.inlineApprovalQueue} aria-label="Approvals required">
      <div className={styles.inlineApprovalQueueHeader}>
        <span><Icon name="activity" size={14} /> Approval required</span>
        <strong>{queuedCount} pending</strong>
      </div>
      {fileWriteReviews.map(review => (
        <FileWriteReviewCard
          key={review.requestId}
          review={review}
          queuedCount={queuedCount}
          onApprove={() => onResolveFileWrite(review, true)}
          onReject={() => onResolveFileWrite(review, false)}
        />
      ))}
      {commandReviews.map(review => (
        <CommandReviewCard
          key={review.requestId}
          review={review}
          queuedCount={queuedCount}
          onApprove={() => onResolveCommand(review, true)}
          onReject={() => onResolveCommand(review, false)}
        />
      ))}
      {toolPermissionReviews.map(review => (
        <ToolPermissionReviewCard
          key={review.requestId}
          review={review}
          queuedCount={queuedCount}
          onApprove={() => onResolveToolPermission(review, true)}
          onReject={() => onResolveToolPermission(review, false)}
        />
      ))}
    </aside>
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

interface AssistantRunMessage {
  message: UiMessage;
  activities: ChatToolActivity[];
}

function groupMessagesByAssistantRun(messages: UiMessage[]): AssistantRunMessage[] {
  const grouped: AssistantRunMessage[] = [];
  let activeAssistantIndex = -1;

  for (const message of messages) {
    if (message.activity && activeAssistantIndex >= 0) {
      grouped[activeAssistantIndex].activities.push(message.activity);
      continue;
    }

    grouped.push({ message, activities: [] });

    if (message.role === 'assistant') {
      activeAssistantIndex = grouped.length - 1;
    } else if (message.role === 'user' || message.role === 'error') {
      activeAssistantIndex = -1;
    }
  }

  return grouped;
}

function MessageItem({
  message,
  activities = [],
  copied,
  onCopy,
}: {
  message: UiMessage;
  activities?: ChatToolActivity[];
  copied: boolean;
  onCopy: () => void;
}) {
  if (message.activity) {
    return <ChatToolActivityItem activity={message.activity} />;
  }

  const roleClass = styles[`message_${message.role}` as keyof typeof styles] || '';
  const senderLabel = message.title || (message.role === 'assistant' ? 'CodeAgent' : message.role);

  return (
    <article className={`${styles.message} ${roleClass}`}>
      <div className={styles.messageHeader}>
        <div>
          <span className={styles.messageRole}>{senderLabel}</span>
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
      {message.usage && !message.performance && activities.length === 0 && (
        <div className={styles.messageMeta}>
          {message.usage.inputTokens} input tokens / {message.usage.outputTokens} output tokens
        </div>
      )}
      {(message.performance || activities.length > 0) && (
        <AssistantActivityDetails
          activities={activities}
          performance={message.performance}
          usage={message.usage}
        />
      )}
    </article>
  );
}

function AssistantActivityDetails({
  activities,
  performance,
  usage,
}: {
  activities: ChatToolActivity[];
  performance?: UiMessage['performance'];
  usage?: UiMessage['usage'];
}) {
  const hasPendingActivity = activities.some(activity => activity.status === 'waiting-approval' || activity.status === 'running');
  const hasFailedActivity = activities.some(activity => activity.status === 'failed' || activity.status === 'rejected');
  const needsAttention = hasPendingActivity || hasFailedActivity;
  const previousNeedsAttention = useRef(needsAttention);
  const [open, setOpen] = useState(needsAttention);
  const totalMs = performance?.endToEndMs
    ?? performance?.backendMs
    ?? activities.reduce((sum, activity) => sum + (activity.duration ?? 0), 0);
  const statusLabel = activities.some(activity => activity.status === 'waiting-approval')
    ? 'Approval needed'
    : activities.some(activity => activity.status === 'running')
      ? 'Running'
      : hasFailedActivity
        ? 'Needs attention'
        : 'Completed';
  const activitySummary = [
    activities.length > 0 ? `${activities.length} ${activities.length === 1 ? 'tool' : 'tools'}` : null,
    totalMs > 0 ? formatActivityDuration(totalMs) : null,
    statusLabel,
  ].filter(Boolean).join(' · ');

  useEffect(() => {
    if (needsAttention) {
      setOpen(true);
    } else if (previousNeedsAttention.current) {
      setOpen(false);
    }
    previousNeedsAttention.current = needsAttention;
  }, [needsAttention]);

  return (
    <details
      className={`${styles.assistantActivity} ${hasFailedActivity ? styles.assistantActivityAttention : ''}`}
      open={open}
      onToggle={event => setOpen(event.currentTarget.open)}
    >
      <summary>
        <span className={styles.assistantActivityTitle}>
          <Icon name={hasFailedActivity ? 'x' : hasPendingActivity ? 'activity' : 'check'} size={13} />
          Activity
        </span>
        <span>{activitySummary}</span>
      </summary>
      <div className={styles.assistantActivityBody}>
        {performance && <ChatPerformanceDetails performance={performance} />}
        {usage && (
          <div className={styles.assistantActivityUsage}>
            <span>Tokens</span>
            <strong>{usage.inputTokens} in / {usage.outputTokens} out</strong>
          </div>
        )}
        {activities.length > 0 && (
          <div className={styles.assistantActivityTools}>
            {activities.map(activity => (
              <ChatToolActivityItem activity={activity} key={activity.toolId} />
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

function ChatPerformanceDetails({ performance }: { performance: NonNullable<UiMessage['performance']> }) {
  const totalMs = performance.endToEndMs ?? performance.backendMs;
  const phases = [
    ...performance.phases,
    ...(performance.uiDeliveryMs !== undefined && performance.uiDeliveryMs > 0
      ? [{ phase: 'ui-delivery' as const, durationMs: performance.uiDeliveryMs, count: undefined }]
      : []),
  ];

  return (
    <section className={styles.messagePerformance} aria-label="Performance">
      <h4>Performance</h4>
      <div className={styles.messagePerformanceGrid}>
        <div>
          <span>End to end</span>
          <strong>{formatActivityDuration(totalMs)}</strong>
        </div>
        {performance.firstTokenMs !== undefined && (
          <div>
            <span>First answer content</span>
            <strong>{formatActivityDuration(performance.firstTokenMs)}</strong>
          </div>
        )}
        {phases.map((phase, index) => (
          <div key={`${phase.phase}-${index}`}>
            <span>
              {formatChatPerformancePhase(phase.phase)}
              {phase.count ? ` · ${phase.count} ${phase.count === 1 ? 'step' : 'steps'}` : ''}
            </span>
            <strong>{formatActivityDuration(phase.durationMs)}</strong>
          </div>
        ))}
      </div>
      {performance.toolCalls > 0 && (
        <p className={styles.messagePerformanceNote}>
          Tool execution includes any time spent waiting for approval. {performance.toolCalls} tool {performance.toolCalls === 1 ? 'call' : 'calls'} across {performance.toolRounds} model {performance.toolRounds === 1 ? 'round' : 'rounds'}.
        </p>
      )}
    </section>
  );
}

function formatChatPerformancePhase(phase: ChatPerformanceMetrics['phases'][number]['phase'] | 'ui-delivery'): string {
  return {
    preparation: 'Request preparation',
    'tool-selection': 'Model tool selection',
    'tool-execution': 'Tool execution / approval',
    'answer-generation': 'Answer generation',
    'ui-delivery': 'IPC and UI delivery',
  }[phase];
}

function ChatToolActivityItem({ activity }: { activity: ChatToolActivity }) {
  const action = getChatToolActivityAction(activity.toolName);
  const target = getChatToolActivityTarget(activity);
  const statusLabel = getChatToolActivityStatusLabel(activity.status);
  const resultSummary = activity.result !== undefined ? summarizeToolResult(activity.result) : '';
  const isPending = activity.status === 'waiting-approval' || activity.status === 'running';
  const isFailure = activity.status === 'failed' || activity.status === 'rejected';

  return (
    <article className={`${styles.chatToolActivity} ${styles[`chatToolActivity_${activity.status}` as keyof typeof styles] || ''}`}>
      <div className={styles.chatToolActivityRow}>
        <span className={styles.chatToolActivityIcon} aria-hidden="true">
          <Icon name={isPending ? 'activity' : isFailure ? 'x' : 'check'} size={14} />
        </span>
        <div className={styles.chatToolActivitySummary}>
          <strong>{action}</strong>
          {target && <span title={target}>{target}</span>}
        </div>
        <span className={styles.chatToolActivityStatus}>{statusLabel}</span>
        {activity.duration !== undefined && (
          <span className={styles.chatToolActivityDuration}>{formatActivityDuration(activity.duration)}</span>
        )}
      </div>
      {(resultSummary || activity.error) && (
        <p className={`${styles.chatToolActivityOutcome} ${isFailure ? styles.chatToolActivityOutcomeError : ''}`}>
          {activity.error || resultSummary}
        </p>
      )}
      <details className={styles.chatToolActivityDetails}>
        <summary>Details</summary>
        <dl>
          <div><dt>Tool</dt><dd>{activity.toolName}</dd></div>
          <div><dt>Tool ID</dt><dd>{activity.toolId}</dd></div>
          {activity.approval?.required && (
            <div>
              <dt>Approval</dt>
              <dd>
                {activity.approval.decision === 'approved'
                  ? `Approved${activity.approval.resolvedBy ? ` by ${activity.approval.resolvedBy}` : ''}`
                  : activity.approval.decision === 'rejected'
                    ? `Rejected${activity.approval.resolvedBy ? ` by ${activity.approval.resolvedBy}` : ''}`
                    : 'Required'}
              </dd>
            </div>
          )}
          <div><dt>Started</dt><dd>{new Date(activity.startedAt).toLocaleTimeString()}</dd></div>
          {activity.completedAt && <div><dt>Finished</dt><dd>{new Date(activity.completedAt).toLocaleTimeString()}</dd></div>}
        </dl>
        <h4>Arguments</h4>
        <pre>{formatJson(activity.args)}</pre>
        {activity.result !== undefined && <><h4>Result</h4><pre>{formatJson(activity.result)}</pre></>}
        {activity.error && <><h4>Error</h4><pre>{activity.error}</pre></>}
      </details>
    </article>
  );
}

function formatActivityDuration(duration: number): string {
  if (duration < 1000) return `${duration} ms`;
  return `${(duration / 1000).toFixed(duration < 10000 ? 1 : 0)} s`;
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

function SettingsSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className={styles.settingsSection}>
      {title && <h3>{title}</h3>}
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
  message,
  onDeveloperModeChange,
  onAddPaymentMethod,
  onSetDefaultPaymentMethod,
  onRemovePaymentMethod,
  paymentBusy,
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
  message: string;
  onDeveloperModeChange: (checked: boolean) => void;
  onAddPaymentMethod: () => void;
  onSetDefaultPaymentMethod: (methodId: string) => void;
  onRemovePaymentMethod: (methodId: string) => void;
  paymentBusy: boolean;
}) {
  const profile = resolution.profile;
  const isSignedIn = profile.accountStatus === 'signed-in';
  const [authMode, setAuthMode] = useState<'sign-in' | 'register' | 'recover'>('sign-in');
  const accountName = profile.displayName || profile.email || 'CodeAgent user';
  const accountInitials = accountName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'CA';

  return (
    <SettingsSection>
      <article className={styles.accountHero}>
        <div className={styles.accountAvatar} aria-hidden="true">
          {isSignedIn ? accountInitials : <Icon name="user" size={24} />}
        </div>
        <div className={styles.accountHeroBody}>
          <span>{isSignedIn ? 'Signed-in account' : 'Guest account'}</span>
          <strong>{isSignedIn ? accountName : 'You’re using CodeAgent as a guest'}</strong>
          <p>
            {isSignedIn
              ? profile.email
              : 'Sign in to sync your chats, manage purchases, and use your account across devices.'}
          </p>
        </div>
        <span className={styles.accountPlanBadge}>{formatAccountTier(profile)}</span>
        {isSignedIn && (
          <div className={styles.accountHeroActions}>
            <button className={styles.secondaryButton} type="button" onClick={onSync} disabled={!canSync || syncing}>
              <Icon name="refresh" size={14} />
              {syncing ? 'Syncing' : 'Sync account'}
            </button>
            <button className={styles.textButton} type="button" onClick={onLogout}>Sign out</button>
          </div>
        )}
      </article>

      {message && (
        <div className={styles.accountInlineMessage} role="status" aria-live="polite">
          <span>{message}</span>
        </div>
      )}

      {!isSignedIn && (
        <div className={styles.accountGuestGrid}>
          <section className={styles.accountAuthCard} aria-labelledby="account-auth-title">
            <div className={styles.accountAuthHeader}>
              <strong id="account-auth-title">
                {authMode === 'sign-in' ? 'Welcome back' : authMode === 'register' ? 'Create your account' : 'Reset your password'}
              </strong>
              <span>
                {authMode === 'sign-in'
                  ? 'Use your CodeAgent account to continue.'
                  : authMode === 'register'
                    ? 'Create an account to sync your workspace and purchases.'
                    : 'Request a reset token, then choose a new password.'}
              </span>
            </div>

            <div className={styles.accountAuthFields} role="tabpanel">
              {authMode === 'register' && (
                <TextSetting
                  label="Display name"
                  value={draft.accountDisplayName}
                  placeholder="How you’ll appear in CodeAgent"
                  onChange={value => onChange({ accountDisplayName: value })}
                />
              )}
              <TextSetting
                label="Email"
                type="email"
                value={draft.accountEmail}
                placeholder="you@example.com"
                onChange={value => onChange({ accountEmail: value })}
              />
              {authMode !== 'recover' && (
                <TextSetting
                  label="Password"
                  type="password"
                  value={draft.accountPassword}
                  placeholder={authMode === 'register' ? 'At least 8 characters' : 'Enter your password'}
                  onChange={value => onChange({ accountPassword: value })}
                />
              )}
              {authMode === 'recover' && (
                <>
                  <TextSetting
                    label="Reset token"
                    value={draft.accountResetToken}
                    placeholder="Paste the token from your reset email"
                    onChange={value => onChange({ accountResetToken: value })}
                  />
                  <TextSetting
                    label="New password"
                    type="password"
                    value={draft.accountPassword}
                    placeholder="At least 8 characters"
                    onChange={value => onChange({ accountPassword: value })}
                  />
                </>
              )}
            </div>

            <div className={styles.accountAuthActions}>
              {authMode === 'sign-in' && (
                <>
                  <button className={styles.primaryButton} type="button" onClick={onLogin}>
                    <Icon name="user" size={14} />
                    Sign in
                  </button>
                  <button className={styles.textButton} type="button" onClick={() => setAuthMode('recover')}>
                    Forgot password?
                  </button>
                  <button className={styles.textButton} type="button" onClick={() => setAuthMode('register')}>
                    Sign up
                  </button>
                </>
              )}
              {authMode === 'register' && (
                <>
                  <button className={styles.primaryButton} type="button" onClick={onRegister}>
                    <Icon name="plus" size={14} />
                    Create account
                  </button>
                  <button className={styles.textButton} type="button" onClick={() => setAuthMode('sign-in')}>
                    Back to sign in
                  </button>
                </>
              )}
              {authMode === 'recover' && (
                <>
                  {draft.accountResetToken.trim() ? (
                    <>
                      <button className={styles.primaryButton} type="button" onClick={onResetPassword}>
                        <Icon name="refresh" size={14} />
                        Reset password
                      </button>
                      <button className={styles.secondaryButton} type="button" onClick={onForgotPassword}>
                        Resend email
                      </button>
                    </>
                  ) : (
                    <button className={styles.primaryButton} type="button" onClick={onForgotPassword}>
                      <Icon name="send" size={14} />
                      Send reset email
                    </button>
                  )}
                  <button className={styles.textButton} type="button" onClick={() => setAuthMode('sign-in')}>
                    Back to sign in
                  </button>
                </>
              )}
            </div>
          </section>

          <aside className={styles.accountBenefitsCard} aria-label="Free account benefits">
            <span>Included with a free account</span>
            <strong>Keep your work connected</strong>
            <ul>
              <li><Icon name="check" size={15} />Sync account settings and purchases</li>
              <li><Icon name="check" size={15} />Access CodeAgent from multiple devices</li>
              <li><Icon name="check" size={15} />Add feature packages when you need them</li>
            </ul>
            <p>No credit card required.</p>
          </aside>
        </div>
      )}

      {isSignedIn && (
        <section className={styles.accountBillingSection} aria-labelledby="payment-methods-title">
          <div className={styles.accountShelfHeader}>
            <div>
              <strong id="payment-methods-title">Payment methods</strong>
              <span>Payment details used for Store purchases and subscriptions.</span>
            </div>
            <button className={styles.secondaryButton} type="button" onClick={onAddPaymentMethod} disabled={paymentBusy}>
              <Icon name="plus" size={14} />
              Add payment method
            </button>
          </div>
          {profile.paymentMethods.length > 0 ? (
            <div className={styles.paymentSummaryList}>
              {profile.paymentMethods.map((method, index) => (
                <div key={method.id}>
                  <Icon name="credit-card" size={14} />
                  <span>
                    <strong>{method.brand} ending {method.last4} {index === 0 && <em>Default</em>}</strong>
                    <small>Expires {method.expMonth.toString().padStart(2, '0')}/{String(method.expYear).slice(-2)}</small>
                  </span>
                  <span className={styles.paymentMethodActions}>
                    {index > 0 && (
                      <button className={styles.textButton} type="button" onClick={() => onSetDefaultPaymentMethod(method.id)} disabled={paymentBusy}>
                        Make default
                      </button>
                    )}
                    <button className={styles.textButton} type="button" onClick={() => onRemovePaymentMethod(method.id)} disabled={paymentBusy}>
                      Remove
                    </button>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.accountEmptyState}>
              No payment methods are saved. A payment method can be added during checkout in the Store.
            </div>
          )}
        </section>
      )}

      <details className={styles.accountAdvanced}>
        <summary>
          <span>
            <Icon name="settings" size={15} />
            Advanced connection
          </span>
          <small>Developer and workspace settings</small>
        </summary>
        <div className={styles.accountAdvancedBody}>
          <div className={styles.accountDeveloperMode}>
            <ToggleSetting
              label="Developer mode"
              checked={draft.platformDeveloperMode}
              onChange={onDeveloperModeChange}
            />
            <span>
              {draft.platformDeveloperMode
                ? 'Authentication is using a temporary backend for this window.'
                : 'Authentication uses the managed CodeAgent platform.'}
            </span>
          </div>
          <div className={styles.settingsGrid}>
            {draft.platformDeveloperMode && (
              <TextSetting
                label="Development platform URL"
                value={draft.platformBaseUrl}
                placeholder={DEVELOPMENT_PLATFORM_BASE_URL}
                onChange={value => onChange({ platformBaseUrl: value })}
              />
            )}
            <TextSetting
              label="Workspace or organization ID"
              value={draft.platformOrgId}
              placeholder="Optional"
              onChange={value => onChange({ platformOrgId: value })}
            />
          </div>
        </div>
      </details>
    </SettingsSection>
  );
}

function FeaturePackagesSection({
  resolution,
  onPackageAction,
  operationError,
  onDismissOperationError,
  onSync,
  canSync,
  syncing,
}: {
  resolution: FeaturePackageResolution;
  onPackageAction: (packageId: string, action?: 'default' | 'update' | 'uninstall') => void;
  operationError: PackageOperationError | null;
  onDismissOperationError: () => void;
  onSync: () => void;
  canSync: boolean;
  syncing: boolean;
}) {
  const profile = resolution.profile;
  const ownedPackages = getOwnedPackageEntries(resolution);
  const isSignedIn = profile.accountStatus === 'signed-in';
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogFilter, setCatalogFilter] = useState<'all' | 'free' | 'paid'>('all');
  const [catalogView, setCatalogView] = useState<'icon' | 'card' | 'table'>('icon');
  const openablePackageIds = new Set(
    getDesktopPrimaryNavigation(resolution).map(item => item.packageId),
  );
  const normalizedQuery = catalogQuery.trim().toLowerCase();
  const visiblePackages = resolution.packages.filter(entry => {
    const isPaid = entry.manifest.pricing.amountCents > 0;
    if (catalogFilter === 'free' && isPaid) return false;
    if (catalogFilter === 'paid' && !isPaid) return false;
    if (!normalizedQuery) return true;
    return [
      entry.manifest.displayName,
      entry.manifest.description,
      entry.manifest.domain,
      ...entry.manifest.features.map(feature => feature.title),
    ].some(value => value.toLowerCase().includes(normalizedQuery));
  });
  const catalogItems = visiblePackages.map(entry => {
    const isEntitled = entry.state === 'available' || entry.state === 'trial';
    const isUsable = isEntitled && isPackageRuntimeAvailable(entry.installState);
    const hasUpdate = entry.installState === 'update-available';
    const isOwned = ownedPackages.some(owned => owned.manifest.id === entry.manifest.id);
    const isBundledCore = entry.manifest.id === BASE_FEATURE_PACKAGE_ID;
    const canOpen = !isBundledCore && isUsable && openablePackageIds.has(entry.manifest.id);
    return {
      entry,
      isEntitled,
      isUsable,
      hasUpdate,
      isOwned,
      isBundledCore,
      canOpen,
      actionLabel: isBundledCore
        ? null
        : hasUpdate
          ? 'Update'
          : canOpen
            ? 'Open'
            : isUsable
              ? null
              : isEntitled
                ? 'Install'
                : 'Purchase',
      statusLabel: isBundledCore
        ? 'Included with CodeAgent'
        : isOwned
        ? `Owned · ${getPackageInstallStateLabel(entry.installState)}`
        : isEntitled && !isUsable
          ? getPackageInstallStateLabel(entry.installState)
          : getPackageStateLabel(entry.state),
      purchase: getLatestPurchaseForPackage(profile, entry.manifest.id),
    };
  });
  const operationDiagnostics = operationError
    ? [
        `Package: ${operationError.packageName}`,
        `Package ID: ${operationError.packageId}`,
        `SKU: ${operationError.productSku}`,
        `Version: ${operationError.version}`,
        `Phase: ${operationError.phase}`,
        `Time: ${operationError.occurredAt}`,
        '',
        operationError.message,
      ].join('\n')
    : '';
  return (
    <SettingsSection>
      <div className={styles.packageStoreHeader}>
        <div>
          <strong>Discover capabilities for CodeAgent</strong>
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

      {operationError && (
        <section className={styles.packageInstallError} role="alert" aria-labelledby="package-install-error-title">
          <div className={styles.packageInstallErrorHeader}>
            <span className={styles.packageInstallErrorIcon}><Icon name="x" size={16} /></span>
            <div>
              <strong id="package-install-error-title">Package operation failed for {operationError.packageName}</strong>
              <span>{operationError.phase}</span>
            </div>
            <div className={styles.packageInstallErrorActions}>
              <button className={styles.secondaryButton} type="button" onClick={() => onPackageAction(operationError.packageId)}>
                <Icon name="refresh" size={14} />Retry
              </button>
              <button className={styles.textButton} type="button" onClick={onDismissOperationError}>Dismiss</button>
            </div>
          </div>
          <details open>
            <summary>Technical details</summary>
            <pre>{operationDiagnostics}</pre>
            <button className={styles.secondaryButton} type="button" onClick={() => void navigator.clipboard.writeText(operationDiagnostics)}>
              <Icon name="file" size={14} />Copy details
            </button>
          </details>
        </section>
      )}

      {ownedPackages.length > 0 && (
        <div className={styles.packageStoreOwnedShelf}>
          <div className={styles.accountShelfHeader}>
            <div>
              <strong>Your packages</strong>
              <span>These purchases belong to your account. Install their runtime on each device where you want to use them.</span>
            </div>
            <span>{formatPackageCount(ownedPackages.length)} owned</span>
          </div>
          <div className={styles.packageStoreOwnedList}>
            {ownedPackages.map(entry => {
              const purchase = getLatestPurchaseForPackage(profile, entry.manifest.id);
              const isInstalled = isPackageRuntimeAvailable(entry.installState);
              const hasUpdate = entry.installState === 'update-available';
              const canOpen = isInstalled && openablePackageIds.has(entry.manifest.id);
              const primaryActionLabel = hasUpdate ? 'Update' : !isInstalled ? 'Install' : canOpen ? 'Open' : null;
              const versionLabel = getPackageVersionLabel(entry.manifest, profile, entry.installState);
              return (
                <div className={styles.packageStoreOwnedItem} key={entry.manifest.id}>
                  <div className={styles.packageStoreIcon} aria-hidden="true">
                    {getPackageInitials(entry.manifest.displayName)}
                  </div>
                  <div className={styles.packageStoreOwnedBody}>
                    <strong>{entry.manifest.displayName}</strong>
                    <span>{getPackagePriceLabel(entry.manifest)} · {versionLabel} · Purchased {formatPackageDate(purchase?.purchasedAt)}</span>
                  </div>
                  <span className={isInstalled ? styles.packageStateAvailable : styles.packageStatePending}>
                    {getPackageInstallStateLabel(entry.installState)}
                  </span>
                  <div className={styles.packageStoreOwnedActions}>
                    {primaryActionLabel && (
                      <button
                        className={hasUpdate || !isInstalled ? styles.primaryButton : styles.secondaryButton}
                        type="button"
                        onClick={() => onPackageAction(
                          entry.manifest.id,
                          hasUpdate ? 'update' : 'default',
                        )}
                      >
                        <Icon name={hasUpdate ? 'refresh' : isInstalled ? 'external' : 'download'} size={14} />
                        {primaryActionLabel}
                      </button>
                    )}
                    {isInstalled && (
                      <button
                        className={styles.textButton}
                        type="button"
                        onClick={() => onPackageAction(entry.manifest.id, 'uninstall')}
                      >
                        Uninstall
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className={styles.packageBillingNote}>
            Need billing help? Self-service subscription changes and refunds aren’t available in this desktop build.
          </p>
        </div>
      )}

      <div className={styles.packageStoreCatalogHeader}>
        <div>
          <strong>Catalog</strong>
          <span>{formatPackageCount(visiblePackages.length)} shown</span>
        </div>
        <div className={styles.packageStoreToolbar}>
          <label className={styles.packageStoreSearch}>
            <Icon name="search" size={14} />
            <input
              type="search"
              value={catalogQuery}
              placeholder="Search packages and features"
              aria-label="Search store packages"
              onChange={event => setCatalogQuery(event.target.value)}
            />
          </label>
          <div className={styles.segmentedControl} aria-label="Filter store catalog">
            {(['all', 'free', 'paid'] as const).map(filter => (
              <button
                className={catalogFilter === filter ? `${styles.segmentedControlButton} ${styles.segmentedControlButtonActive}` : styles.segmentedControlButton}
                type="button"
                aria-pressed={catalogFilter === filter}
                onClick={() => setCatalogFilter(filter)}
                key={filter}
              >
                {filter[0].toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>
          <div className={styles.segmentedControl} aria-label="Choose catalog view">
            {([
              { id: 'icon', label: 'Icon view', icon: 'list' },
              { id: 'card', label: 'Card view', icon: 'grid' },
              { id: 'table', label: 'Table view', icon: 'table' },
            ] as const).map(view => (
              <button
                className={catalogView === view.id ? `${styles.segmentedControlButton} ${styles.segmentedControlButtonActive}` : styles.segmentedControlButton}
                type="button"
                title={view.label}
                aria-label={view.label}
                aria-pressed={catalogView === view.id}
                onClick={() => setCatalogView(view.id)}
                key={view.id}
              >
                <Icon name={view.icon} size={14} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {catalogView === 'icon' && (
        <div className={styles.packageStoreIconList}>
          {catalogItems.map(({ entry, hasUpdate, actionLabel, statusLabel }) => (
            <article className={styles.packageStoreIconRow} key={entry.manifest.id}>
              <div className={styles.packageStoreIcon} aria-hidden="true">
                {getPackageInitials(entry.manifest.displayName)}
              </div>
              <div className={styles.packageStoreIconBody}>
                <strong>{entry.manifest.displayName}</strong>
                <span title={entry.manifest.description}>{entry.manifest.description}</span>
              </div>
              <div className={styles.packageStoreIconAction}>
                {actionLabel && (
                  <button
                    className={styles.packageStorePillAction}
                    type="button"
                    onClick={() => onPackageAction(entry.manifest.id, hasUpdate ? 'update' : 'default')}
                  >
                    {actionLabel}
                  </button>
                )}
                <small title={statusLabel}>
                  {actionLabel === 'Purchase'
                    ? `${getPackagePriceLabel(entry.manifest)} · v${getPackageAvailableVersion(entry.manifest)}`
                    : `${statusLabel} · ${getPackageVersionLabel(entry.manifest, profile, entry.installState)}`}
                </small>
              </div>
            </article>
          ))}
        </div>
      )}

      {catalogView === 'card' && (
        <div className={styles.packageStoreGrid}>
        {catalogItems.map(({ entry, isUsable, hasUpdate, isOwned, actionLabel, statusLabel, purchase }) => (
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
                <span className={isUsable ? styles.packageStateAvailable : isOwned ? styles.packageStatePending : styles.packageStateLocked}>
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
                  <dt>Version</dt>
                  <dd>{getPackageVersionLabel(entry.manifest, profile, entry.installState)}</dd>
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
                {actionLabel && (
                  <button
                    className={`${isUsable ? styles.secondaryButton : styles.primaryButton} ${styles.packageStoreAction}`}
                    type="button"
                    onClick={() => onPackageAction(entry.manifest.id, hasUpdate ? 'update' : 'default')}
                  >
                    {actionLabel}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {catalogView === 'table' && (
        <div className={styles.packageStoreTableWrap}>
          <table className={styles.packageStoreTable}>
            <caption className={styles.visuallyHidden}>Store package catalog</caption>
            <thead>
              <tr>
                <th scope="col">Package</th>
                <th scope="col">Tier</th>
                <th scope="col">Price</th>
                <th scope="col">Version</th>
                <th scope="col">Runtime</th>
                <th scope="col">Status</th>
                <th scope="col"><span className={styles.visuallyHidden}>Action</span></th>
              </tr>
            </thead>
            <tbody>
              {catalogItems.map(({ entry, isUsable, hasUpdate, isOwned, actionLabel, statusLabel }) => (
                <tr key={entry.manifest.id}>
                  <td>
                    <div className={styles.packageStoreTableIdentity}>
                      <div className={styles.packageStoreIcon} aria-hidden="true">
                        {getPackageInitials(entry.manifest.displayName)}
                      </div>
                      <div>
                        <strong>{entry.manifest.displayName}</strong>
                        <span>{entry.manifest.domain}</span>
                      </div>
                    </div>
                  </td>
                  <td>{entry.manifest.tier}</td>
                  <td>{getPackagePriceLabel(entry.manifest)}</td>
                  <td>{getPackageVersionLabel(entry.manifest, profile, entry.installState)}</td>
                  <td>{getPackageInstallStateLabel(entry.installState)}</td>
                  <td>
                    <span className={isUsable ? styles.packageStateAvailable : isOwned ? styles.packageStatePending : styles.packageStateLocked}>
                      {statusLabel}
                    </span>
                  </td>
                  <td>
                    {actionLabel && (
                      <button
                        className={isUsable ? styles.secondaryButton : styles.primaryButton}
                        type="button"
                        onClick={() => onPackageAction(entry.manifest.id, hasUpdate ? 'update' : 'default')}
                      >
                        {actionLabel}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {visiblePackages.length === 0 && (
        <div className={styles.accountEmptyState}>
          No packages match this search and filter. Try a different term or select All.
        </div>
      )}
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

function PaymentMethodDialog({
  draft,
  message,
  busy,
  onChange,
  onSubmit,
  onCancel,
}: {
  draft: PurchaseDraft;
  message: string;
  busy: boolean;
  onChange: (update: Partial<PurchaseDraft>) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <div className={styles.dialogBackdrop} role="presentation">
      <form className={`${styles.reviewDialog} ${styles.purchaseDialog}`} role="dialog" aria-modal="true" aria-labelledby="payment-method-title" onSubmit={onSubmit}>
        <div className={styles.dialogHeader}>
          <div>
            <h2 id="payment-method-title">Add payment method</h2>
            <p className={styles.reviewSubtitle}>This card will become the default for future Store purchases.</p>
          </div>
          <span className={styles.reviewBadge}>Credit card</span>
        </div>
        <div className={styles.paymentFormGrid}>
          <TextSetting label="Name on card" value={draft.nameOnCard} onChange={value => onChange({ nameOnCard: value })} />
          <TextSetting label="Card number" value={draft.cardNumber} onChange={value => onChange({ cardNumber: value })} />
          <TextSetting label="Expiration" value={draft.expiry} placeholder="MM/YY" onChange={value => onChange({ expiry: value })} />
          <TextSetting label="CVC" type="password" value={draft.cvc} onChange={value => onChange({ cvc: value })} />
          <TextSetting label="ZIP or postal code" value={draft.postalCode} onChange={value => onChange({ postalCode: value })} className={styles.fieldWide} />
        </div>
        <p className={styles.mutedText}>Only the card brand, last four digits, and expiration are retained by this development flow. Full card numbers and security codes are not stored.</p>
        <div className={styles.dialogFooter}>
          <span className={styles.settingsMessage}>{message}</span>
          <div className={styles.dialogActions}>
            <button className={styles.secondaryButton} type="button" onClick={onCancel} disabled={busy}>Cancel</button>
            <button className={styles.primaryButton} type="submit" disabled={busy}>
              <Icon name="plus" size={14} />
              {busy ? 'Adding' : 'Add card'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`;
}

function LocalInferenceSettings({
  enginePath,
  gpuLayers,
  contextTokens,
  onEnginePathChange,
  onGpuLayersChange,
  onSelect,
}: {
  enginePath: string;
  gpuLayers: string;
  contextTokens: number;
  onEnginePathChange: (value: string) => void;
  onGpuLayersChange: (value: string) => void;
  onSelect: (model: string, status: LocalInferenceStatus) => void;
}) {
  const [query, setQuery] = useState('code instruct');
  const [results, setResults] = useState<HuggingFaceModel[]>([]);
  const [selectedRepository, setSelectedRepository] = useState('');
  const [files, setFiles] = useState<HuggingFaceModelFile[]>([]);
  const [downloaded, setDownloaded] = useState<LocalModelRecord[]>([]);
  const [status, setStatus] = useState<LocalInferenceStatus | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function refreshLocal() {
    const [models, engineStatus] = await Promise.all([
      ipcClient.localModels.listDownloaded(),
      ipcClient.localModels.status(),
    ]);
    setDownloaded(models);
    setStatus(engineStatus);
  }

  async function runAction(action: () => Promise<void>) {
    setBusy(true);
    setMessage('');
    try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); }
  }

  useEffect(() => {
    refreshLocal().catch(error => setMessage(error instanceof Error ? error.message : String(error)));
  }, []);

  return (
    <div className={styles.localInferencePanel}>
      <h4>CodeAgent local inference</h4>
      <p className={styles.mutedText}>Search and download GGUF models from Hugging Face, then run the selected model with a managed llama.cpp server.</p>
      <div className={styles.settingsGrid}>
        <TextSetting label="Hugging Face search" value={query} onChange={setQuery} />
        <TextSetting label="llama.cpp executable (optional)" value={enginePath} onChange={onEnginePathChange} placeholder="llama-server or llama from PATH" />
        <TextSetting label="GPU layers (optional)" type="number" value={gpuLayers} onChange={onGpuLayersChange} />
      </div>
      <div className={styles.settingsActionRow}>
        <button className={styles.secondaryButton} type="button" disabled={busy} onClick={() => runAction(async () => {
          setMessage('Downloading and verifying llama.cpp…');
          const engine = await ipcClient.localModels.installEngine();
          if (engine.path) onEnginePathChange(engine.path);
          setMessage(`llama.cpp ${engine.version || ''} is ready.`);
        })}>Install engine</button>
        <button className={styles.secondaryButton} type="button" disabled={busy} onClick={() => runAction(async () => setResults(await ipcClient.localModels.search(query, 20)))}>
          Search Hugging Face
        </button>
        <button className={styles.secondaryButton} type="button" disabled={busy} onClick={() => runAction(refreshLocal)}>Refresh local models</button>
        {status?.running && <button className={styles.secondaryButton} type="button" disabled={busy} onClick={() => runAction(async () => { setStatus(await ipcClient.localModels.stop()); setMessage('Local inference stopped.'); })}>Stop engine</button>}
      </div>
      {status && <p className={styles.mutedText}>Engine: {status.running ? `${status.healthy ? 'ready' : 'starting'} · ${status.model} · ${status.baseUrl}` : 'stopped'} · log: {status.logPath}</p>}
      {message && <p className={styles.settingsMessage}>{message}</p>}
      {results.length > 0 && (
        <div className={styles.localModelList}>
          {results.map(model => (
            <button key={model.id} className={styles.localModelRow} type="button" disabled={busy} onClick={() => runAction(async () => {
              setSelectedRepository(model.id);
              setFiles(await ipcClient.localModels.listFiles(model.id));
            })}>
              <strong>{model.id}</strong><span>{model.downloads.toLocaleString()} downloads · {model.likes.toLocaleString()} likes</span>
            </button>
          ))}
        </div>
      )}
      {selectedRepository && files.length > 0 && (
        <div className={styles.localModelList}>
          <p className={styles.mutedText}>Choose a quantization from {selectedRepository}:</p>
          {files.map(file => (
            <button key={file.name} className={styles.localModelRow} type="button" disabled={busy} onClick={() => runAction(async () => {
              setMessage(`Downloading ${file.name}…`);
              await ipcClient.localModels.download(selectedRepository, file.name);
              await refreshLocal();
              setMessage(`Downloaded ${file.name}.`);
            })}>
              <strong>{file.name}</strong><span>{file.quantization || 'GGUF'} · {file.size ? formatBytes(file.size) : 'size unavailable'}</span>
            </button>
          ))}
        </div>
      )}
      {downloaded.length > 0 && (
        <div className={styles.localModelList}>
          <p className={styles.mutedText}>Downloaded models:</p>
          {downloaded.map(model => (
            <div key={model.id} className={styles.localModelRow}>
              <div><strong>{model.file}</strong><span>{model.repository} · {formatBytes(model.size)}</span></div>
              <button className={styles.secondaryButton} type="button" disabled={busy || status?.running === true} onClick={() => runAction(async () => {
                const nextStatus = await ipcClient.localModels.start({
                  model: model.id,
                  enginePath: enginePath.trim() || undefined,
                  contextTokens,
                  gpuLayers: gpuLayers.trim() ? Number(gpuLayers) : undefined,
                });
                setStatus(nextStatus);
                onSelect(model.id, nextStatus);
                setMessage(`Local inference is ready with ${model.file}. Save settings to use it for desktop chat.`);
              })}>Run & select</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ModelPickerOption {
  value: string;
  name: string;
  label: string;
  source: string;
  size?: number;
  quantization?: string;
  license?: string;
  downloads?: number;
  likes?: number;
  lastModified?: string;
  pipelineTag?: string;
  tags: string[];
}

function CodeAgentModelSetting({ value, disabled = false, onChange }: { value: string; disabled?: boolean; onChange: (value: string) => void }) {
  const [models, setModels] = useState<HuggingFaceModel[]>([]);
  const [localModels, setLocalModels] = useState<LocalModelRecord[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const catalogRequest = useRef(0);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  async function refreshCatalog() {
    const request = ++catalogRequest.current;
    setLoading(true);
    setError('');
    try {
      const [available, results] = await Promise.all([
        ipcClient.localModels.listDownloaded(),
        ipcClient.localModels.search('', 50),
      ]);
      if (request !== catalogRequest.current) return;
      setLocalModels(available);
      setModels(results.filter(model => {
        const task = model.pipelineTag?.toLowerCase();
        if (task && !['text-generation', 'text2text-generation', 'conversational'].includes(task)) return false;
        const tags = model.tags.map(tag => tag.toLowerCase());
        return !tags.some(tag => ['diffusers', 'automatic-speech-recognition', 'text-to-video', 'feature-extraction'].includes(tag));
      }));
      if (!value) onChange(available.find(model => model.source === 'bundled')?.repository || results[0]?.id || '');
    } catch (cause) {
      if (request !== catalogRequest.current) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      const available = await ipcClient.localModels.listDownloaded().catch(() => []);
      if (request === catalogRequest.current) setLocalModels(available);
    } finally {
      if (request === catalogRequest.current) setLoading(false);
    }
  }

  useEffect(() => {
    refreshCatalog();
    const handleOnline = () => refreshCatalog();
    window.addEventListener('online', handleOnline);
    return () => {
      catalogRequest.current += 1;
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const uniqueLocalModels = localModels.filter((model, index) => localModels.findIndex(candidate => candidate.repository === model.repository) === index);
  const localRepositories = new Set(uniqueLocalModels.map(model => model.repository));
  const options: ModelPickerOption[] = [
    ...uniqueLocalModels.map(model => {
      const catalogModel = models.find(candidate => candidate.id === model.repository);
      return {
        value: model.repository,
        name: model.displayName || model.repository,
        label: model.source === 'bundled'
          ? `${model.displayName || model.repository} · included · ${model.quantization || 'GGUF'}`
          : `${model.repository} · downloaded · ${model.quantization || 'GGUF'}`,
        source: model.source || 'downloaded',
        size: model.size,
        quantization: model.quantization,
        license: model.license,
        downloads: catalogModel?.downloads,
        likes: catalogModel?.likes,
        lastModified: model.source === 'downloaded' ? model.downloadedAt : catalogModel?.lastModified,
        pipelineTag: catalogModel?.pipelineTag || 'text-generation',
        tags: catalogModel?.tags || [],
      };
    }),
    ...(value && !localRepositories.has(value) && !models.some(model => model.id === value) ? [{
      value,
      name: value,
      label: value,
      source: 'catalog',
      downloads: undefined,
      likes: undefined,
      lastModified: undefined,
      pipelineTag: undefined,
      tags: [] as string[],
    }] : []),
    ...models.filter(model => !localRepositories.has(model.id)).map(model => ({
      value: model.id,
      name: model.id,
      label: `${model.id} · ${model.downloads.toLocaleString()} downloads`,
      source: 'catalog',
      downloads: model.downloads,
      likes: model.likes,
      lastModified: model.lastModified,
      pipelineTag: model.pipelineTag,
      tags: model.tags,
      license: model.tags.find(tag => tag.toLowerCase().startsWith('license:'))?.slice('license:'.length),
    })),
  ];
  const selected = options.find(option => option.value === value);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleOptions = normalizedQuery
    ? options.filter(option => `${option.name} ${option.pipelineTag || ''} ${option.tags.join(' ')}`.toLowerCase().includes(normalizedQuery))
    : options;

  function selectModel(model: string) {
    if (disabled) return;
    onChange(model);
    setOpen(false);
    setQuery('');
  }

  return (
    <div className={styles.modelCatalogSetting}>
      <label className={styles.field}>
        <span>Model</span>
        <div className={styles.modelPicker} ref={pickerRef}>
          <button
            id="codeagent-model-picker"
            className={styles.modelPickerTrigger}
            type="button"
            aria-haspopup="listbox"
            aria-expanded={open}
            disabled={disabled}
            onClick={() => setOpen(current => !current)}
          >
            <span>
              <strong>{selected?.name || (loading ? 'Loading model catalog…' : 'Choose a model')}</strong>
              {selected && <small>{selected.source === 'bundled' ? 'Included offline model' : selected.source === 'downloaded' ? 'Downloaded model' : `${selected.downloads?.toLocaleString() || 0} downloads`}</small>}
            </span>
            <Icon name={open ? 'chevron-left' : 'chevron-right'} size={15} />
          </button>
          {open && (
            <div className={styles.modelPickerPanel} role="listbox" aria-label="CodeAgent models">
              <div className={styles.modelPickerSearch}>
                <Icon name="search" size={14} />
                <input
                  autoFocus
                  value={query}
                  placeholder="Search models, tasks, or tags"
                  onChange={event => setQuery(event.target.value)}
                />
              </div>
              <div className={styles.modelPickerResults}>
                {visibleOptions.map(option => {
                  const usefulTags = option.tags
                    .filter(tag => !['gguf', option.pipelineTag].includes(tag.toLowerCase()))
                    .slice(0, 4);
                  return (
                    <button
                      className={`${styles.modelPickerCard} ${option.value === value ? styles.modelPickerCardSelected : ''}`}
                      type="button"
                      role="option"
                      aria-selected={option.value === value}
                      key={`${option.source}:${option.value}`}
                      onClick={() => selectModel(option.value)}
                    >
                      <span className={styles.modelPickerCardHeader}>
                        <strong>{option.name}</strong>
                        <em>{option.source === 'bundled' ? 'Included' : option.source === 'downloaded' ? 'Downloaded' : 'Hugging Face'}</em>
                      </span>
                      <span className={styles.modelPickerMetadata}>
                        {option.pipelineTag && <span><b>Task</b>{option.pipelineTag}</span>}
                        {option.quantization && <span><b>Quantization</b>{option.quantization}</span>}
                        {option.size !== undefined && <span><b>Size</b>{formatBytes(option.size)}</span>}
                        {option.license && <span><b>License</b>{option.license}</span>}
                        {option.downloads !== undefined && <span><b>Downloads</b>{option.downloads.toLocaleString()}</span>}
                        {option.likes !== undefined && <span><b>Likes</b>{option.likes.toLocaleString()}</span>}
                        {option.lastModified && <span><b>{option.source === 'catalog' ? 'Updated' : 'Available since'}</b>{new Date(option.lastModified).toLocaleDateString()}</span>}
                      </span>
                      {usefulTags.length > 0 && <span className={styles.modelPickerTags}>{usefulTags.map(tag => <i key={tag}>{tag}</i>)}</span>}
                    </button>
                  );
                })}
                {visibleOptions.length === 0 && <p className={styles.modelPickerEmpty}>No models match “{query}”.</p>}
              </div>
            </div>
          )}
        </div>
      </label>
      <div className={styles.modelCatalogFooter}>
        <span>{loading ? 'Loading Hugging Face catalog…' : `${models.length} online model${models.length === 1 ? '' : 's'} available`}</span>
        <button className={styles.secondaryButton} type="button" disabled={loading || disabled} onClick={refreshCatalog}>
          <Icon name="refresh" size={13} />
          Refresh
        </button>
      </div>
      {error && <p className={styles.settingsMessage}>Hugging Face catalog unavailable; included and downloaded models remain available. {error}</p>}
    </div>
  );
}

function LocalModelPreparationPanel({
  preparation,
  busy,
  onRetry,
  onOpenLog,
}: {
  preparation: LocalModelPreparation;
  busy: boolean;
  onRetry: () => void;
  onOpenLog: () => void;
}) {
  if (preparation.phase === 'idle') return null;
  const failed = preparation.phase === 'error';
  const ready = preparation.phase === 'ready';
  const title = failed
    ? 'Model could not be loaded'
    : ready
      ? 'Local inference is ready'
      : preparation.phase === 'downloading'
        ? 'Downloading model'
        : preparation.phase === 'starting'
          ? 'Starting local inference'
          : 'Preparing model';
  return (
    <div className={`${styles.modelPreparationPanel} ${failed ? styles.modelPreparationError : ready ? styles.modelPreparationReady : ''}`} role={failed ? 'alert' : 'status'}>
      <div className={styles.modelPreparationHeader}>
        <span className={styles.modelPreparationIcon}>{ready ? <Icon name="check" size={16} /> : failed ? <Icon name="x" size={16} /> : <span className={styles.modelPreparationSpinner} />}</span>
        <div>
          <strong>{title}</strong>
          {preparation.model && <span>{preparation.model}</span>}
        </div>
      </div>
      {preparation.detail && <p>{preparation.detail}</p>}
      {preparation.logContent && (
        <details className={styles.modelLogDetails} open>
          <summary>Recent llama.cpp output</summary>
          <pre>{preparation.logContent}</pre>
        </details>
      )}
      {(failed || preparation.logPath) && (
        <div className={styles.modelPreparationActions}>
          {failed && <button className={styles.primaryButton} type="button" disabled={busy} onClick={onRetry}><Icon name="refresh" size={14} />Retry</button>}
          {failed && <button className={styles.secondaryButton} type="button" onClick={() => document.getElementById('codeagent-model-picker')?.click()}><Icon name="database" size={14} />Choose another model</button>}
          {preparation.logPath && <button className={styles.secondaryButton} type="button" onClick={onOpenLog}><Icon name="external" size={14} />Open log</button>}
        </div>
      )}
    </div>
  );
}

function SettingsView({
  activeSection,
  draft,
  tools,
  sessions,
  currentSessionId,
  appConfig,
  message,
  saving,
  localModelPreparation,
  featureResolution,
  onChange,
  onSetToolPermission,
  onApplyToolPermissionPreset,
  onClearToken,
  onAccountLogin,
  onAccountRegister,
  onAccountForgotPassword,
  onAccountResetPassword,
  onAccountLogout,
  onPlatformSync,
  canSyncPlatform,
  platformSyncing,
  onDeveloperModeChange,
  onPackageAction,
  packageOperationError,
  onDismissPackageOperationError,
  onAddPaymentMethod,
  onSetDefaultPaymentMethod,
  onRemovePaymentMethod,
  onOpenChat,
  onDeleteChat,
  onDeleteAllChats,
  onSubmit,
  onRetryLocalModel,
  onOpenLocalModelLog,
}: {
  activeSection: SettingsSectionId;
  draft: SettingsDraft;
  tools: Tool[];
  sessions: PersistedChatSession[];
  currentSessionId: string;
  appConfig: AppConfig | null;
  message: string;
  saving: boolean;
  localModelPreparation: LocalModelPreparation;
  featureResolution: FeaturePackageResolution;
  onChange: (update: Partial<SettingsDraft>) => void;
  onSetToolPermission: (toolName: string, permission: ToolPermissionMode) => void;
  onApplyToolPermissionPreset: (preset: 'allow-all' | 'ask-mutating' | 'deny-mutating') => void;
  onClearToken: () => void;
  onAccountLogin: () => void;
  onAccountRegister: () => void;
  onAccountForgotPassword: () => void;
  onAccountResetPassword: () => void;
  onAccountLogout: () => void;
  onPlatformSync: () => void;
  canSyncPlatform: boolean;
  platformSyncing: boolean;
  onDeveloperModeChange: (checked: boolean) => void;
  onPackageAction: (packageId: string) => void;
  packageOperationError: PackageOperationError | null;
  onDismissPackageOperationError: () => void;
  onAddPaymentMethod: () => void;
  onSetDefaultPaymentMethod: (methodId: string) => void;
  onRemovePaymentMethod: (methodId: string) => void;
  onOpenChat: (sessionId: string) => void;
  onDeleteChat: (sessionId: string) => void;
  onDeleteAllChats: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onRetryLocalModel: () => void;
  onOpenLocalModelLog: () => void;
}) {
  const coreTools = tools.filter(isCoreTool);
  const coreToolGroups = groupToolsByCategory(coreTools);
  const corePolicyCounts = coreTools.reduce<Record<ToolPermissionMode, number>>(
    (counts, tool) => {
      counts[getToolPermissionPolicy(tool, appConfig)] += 1;
      return counts;
    },
    { allow: 0, ask: 0, deny: 0 },
  );
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
            message={message}
            onDeveloperModeChange={onDeveloperModeChange}
            onAddPaymentMethod={onAddPaymentMethod}
            onSetDefaultPaymentMethod={onSetDefaultPaymentMethod}
            onRemovePaymentMethod={onRemovePaymentMethod}
            paymentBusy={saving}
          />
        )}

        {activeSection === 'general' && (
        <SettingsSection>
          <div className={styles.settingsGrid}>
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
            <TextSetting label="Max turns" type="number" value={draft.maxTurns} onChange={value => onChange({ maxTurns: value })} />
            <TextSetting label="Max budget USD" type="number" value={draft.maxBudgetUsd} onChange={value => onChange({ maxBudgetUsd: value })} />
            <TextSetting label="Task budget" type="number" value={draft.taskBudget} onChange={value => onChange({ taskBudget: value })} />
            <TextSetting label="Workload" value={draft.workload} onChange={value => onChange({ workload: value })} />
          </div>
          <div className={styles.toggleGrid}>
            <ToggleSetting label="Auto-update" checked={draft.autoUpdate} onChange={checked => onChange({ autoUpdate: checked })} />
            <ToggleSetting label="Proactive" checked={draft.proactive} onChange={checked => onChange({ proactive: checked })} />
          </div>
          <section className={styles.permissionProfileSection} aria-labelledby="permission-profile-title">
            <div className={styles.permissionProfileHeader}>
              <div>
                <h3 id="permission-profile-title">Permissions</h3>
                <p>Choose how broadly CodeAgent can access files and run tools.</p>
              </div>
            </div>
            <fieldset className={styles.permissionProfileList}>
              <legend className={styles.visuallyHidden}>Desktop permission level</legend>
              {DESKTOP_PERMISSION_PROFILES.map(profile => {
                const selected = draft.desktopPermissionProfile === profile.value;
                return (
                  <label
                    className={`${styles.permissionProfileOption} ${selected ? styles.permissionProfileOptionSelected : ''} ${profile.danger ? styles.permissionProfileOptionDanger : ''}`}
                    key={profile.value}
                  >
                    <input
                      type="radio"
                      name="desktop-permission-profile"
                      value={profile.value}
                      checked={selected}
                      onChange={() => onChange({ desktopPermissionProfile: profile.value })}
                    />
                    <span className={styles.permissionProfileBody}>
                      <span className={styles.permissionProfileTitle}>
                        <strong>{profile.title}</strong>
                        {profile.badge && <small>{profile.badge}</small>}
                      </span>
                      <span>{profile.description}</span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
            {draft.desktopPermissionProfile === 'full-access' && (
              <div className={styles.permissionProfileWarning} role="alert">
                Full access increases the risk of unintended changes or data exposure. Operating-system protections still apply.
              </div>
            )}
            <div className={styles.coreToolPermissions}>
              <div className={styles.coreToolPermissionsHeader}>
                <div>
                  <h4>Built-in tools</h4>
                  <p>Fine-tune CodeAgent's own tools. Package-provided tools are managed separately by their app.</p>
                </div>
                <span className={styles.coreToolCount}>{coreTools.length} tools</span>
              </div>
              <div className={styles.coreToolPolicySummary} aria-label="Built-in tool permission summary">
                <span><strong>{corePolicyCounts.allow}</strong> allowed</span>
                <span><strong>{corePolicyCounts.ask}</strong> ask</span>
                <span><strong>{corePolicyCounts.deny}</strong> denied</span>
              </div>
              <div className={styles.coreToolPresetActions}>
                <button className={styles.secondaryButton} type="button" onClick={() => onApplyToolPermissionPreset('allow-all')}>Allow all</button>
                <button className={styles.secondaryButton} type="button" onClick={() => onApplyToolPermissionPreset('ask-mutating')}>Ask before changes</button>
                <button className={styles.secondaryButton} type="button" onClick={() => onApplyToolPermissionPreset('deny-mutating')}>Deny changes</button>
              </div>
              <details className={styles.coreToolDetails}>
                <summary>Configure individual tools</summary>
                <div className={styles.coreToolGroups}>
                  {coreToolGroups.map(group => (
                    <section className={styles.coreToolGroup} key={group.id}>
                      <h5>{group.label}</h5>
                      {group.tools.map(tool => (
                        <div className={styles.coreToolRow} key={tool.name}>
                          <div className={styles.coreToolIdentity}>
                            <strong>{tool.name}</strong>
                            <span>{tool.readOnly ? 'Read-only' : 'Can make changes'}</span>
                            <p>{tool.description}</p>
                          </div>
                          <label>
                            <span className={styles.visuallyHidden}>Permission for {tool.name}</span>
                            <select
                              value={getToolPermissionPolicy(tool, appConfig)}
                              onChange={event => onSetToolPermission(tool.name, event.target.value as ToolPermissionMode)}
                            >
                              {TOOL_PERMISSION_OPTIONS.map(option => (
                                <option value={option.value} key={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                      ))}
                    </section>
                  ))}
                  {coreTools.length === 0 && <p className={styles.mutedText}>No built-in tools are currently available.</p>}
                </div>
              </details>
            </div>
          </section>
        </SettingsSection>
        )}

        {activeSection === 'chat-history' && (
          <ChatHistorySettingsSection
            sessions={sessions}
            currentSessionId={currentSessionId}
            message={message}
            onOpenChat={onOpenChat}
            onDeleteChat={onDeleteChat}
            onDeleteAllChats={onDeleteAllChats}
          />
        )}

        {activeSection === 'model' && (
        <SettingsSection>
          <div className={styles.settingsGrid}>
            <SelectSetting
              label="LLM backend"
              value={draft.llmProvider}
              options={providerOptions}
              onChange={changeProvider}
            />
            {draft.llmProvider !== 'codeagent' && <TextSetting
              label={draft.llmProvider === 'openai-compatible' ? 'API key (optional)' : 'API key'}
              type="password"
              value={draft.apiKey}
              onChange={value => onChange({ apiKey: value })}
            />}
            <TextSetting
              label="Base URL"
              value={draft.baseUrl}
              onChange={value => onChange({ baseUrl: value })}
            />
            {draft.llmProvider === 'codeagent'
              ? <CodeAgentModelSetting value={draft.model} disabled={saving} onChange={value => onChange({ model: value })} />
              : <TextSetting label="Model" value={draft.model} onChange={value => onChange({ model: value })} />}
            <TextSetting label="Fallback model" value={draft.fallbackModel} onChange={value => onChange({ fallbackModel: value })} />
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
            <TextSetting label="Beta headers" value={draft.betas} onChange={value => onChange({ betas: value })} />
          </div>
          <div className={styles.toggleGrid}>
            <ToggleSetting label="Model tool calls" checked={draft.enableLlmTools} onChange={checked => onChange({ enableLlmTools: checked })} />
          </div>
          {draft.llmProvider === 'codeagent' && (
            <LocalModelPreparationPanel
              preparation={localModelPreparation}
              busy={saving}
              onRetry={onRetryLocalModel}
              onOpenLog={onOpenLocalModelLog}
            />
          )}
        </SettingsSection>
        )}

        {activeSection === 'packages' && (
          <FeaturePackagesSection
            resolution={featureResolution}
            onPackageAction={onPackageAction}
            operationError={packageOperationError}
            onDismissOperationError={onDismissPackageOperationError}
            onSync={onPlatformSync}
            canSync={canSyncPlatform}
            syncing={platformSyncing}
          />
        )}

        {activeSection === 'io-debug' && (
        <SettingsSection>
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
        <SettingsSection>
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
        <SettingsSection>
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
        <SettingsSection>
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
          </div>
        </SettingsSection>
        )}

        {activeSection === 'advanced' && (
        <SettingsSection>
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

        {activeSection !== 'account' && activeSection !== 'packages' && activeSection !== 'chat-history' && <div className={styles.dialogFooter}>
          <span className={styles.settingsMessage}>{message}</span>
          <div className={styles.dialogActions}>
            {activeSection === 'model' && (
              <button className={styles.dangerButton} type="button" onClick={onClearToken}>
                <Icon name="key" size={14} />
                Clear LLM API keys
              </button>
            )}
            <button className={styles.primaryButton} type="submit" disabled={saving}>
              <Icon name="save" size={14} />
              {saving ? 'Saving' : 'Save'}
            </button>
          </div>
        </div>}
      </form>
    </section>
  );
}

function ChatHistorySettingsSection({
  sessions,
  currentSessionId,
  message,
  onOpenChat,
  onDeleteChat,
  onDeleteAllChats,
}: {
  sessions: PersistedChatSession[];
  currentSessionId: string;
  message: string;
  onOpenChat: (sessionId: string) => void;
  onDeleteChat: (sessionId: string) => void;
  onDeleteAllChats: () => void;
}) {
  const [query, setQuery] = useState('');
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const savedSessions = sortSessions(sessions.filter(isMeaningfulChatSession));
  const visibleSessions = savedSessions.filter(session => matchesSessionSearch(session, query));

  function confirmSingleDelete(sessionId: string) {
    onDeleteChat(sessionId);
    setDeleteSessionId(null);
  }

  function confirmAllDeletes() {
    onDeleteAllChats();
    setConfirmDeleteAll(false);
    setDeleteSessionId(null);
  }

  return (
    <SettingsSection>
      <div className={styles.chatHistorySummary}>
        <div>
          <strong>{savedSessions.length} saved {savedSessions.length === 1 ? 'chat' : 'chats'}</strong>
          <span>Stored locally on this device. Deleting chats does not delete workspace files.</span>
        </div>
        <button
          className={styles.dangerButton}
          type="button"
          disabled={savedSessions.length === 0}
          onClick={() => setConfirmDeleteAll(true)}
        >
          <Icon name="trash" size={14} />
          Delete all chats
        </button>
      </div>

      {confirmDeleteAll && (
        <div className={styles.chatHistoryDeleteAll} role="alert">
          <div>
            <strong>Delete all {savedSessions.length} saved chats?</strong>
            <span>This cannot be undone. Attached workspace files and account data will remain unchanged.</span>
          </div>
          <div className={styles.toolRouterActions}>
            <button className={styles.dangerButton} type="button" onClick={confirmAllDeletes}>Delete all</button>
            <button className={styles.secondaryButton} type="button" onClick={() => setConfirmDeleteAll(false)}>Cancel</button>
          </div>
        </div>
      )}

      {message && <p className={styles.inlineSuccess}>{message}</p>}

      <div className={styles.chatHistoryControls}>
        <label>
          <Icon name="search" size={14} />
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search saved chats"
            aria-label="Search saved chats"
          />
        </label>
        <span>{visibleSessions.length} shown</span>
      </div>

      <div className={styles.chatHistoryList}>
        {visibleSessions.map(session => {
          const deleting = deleteSessionId === session.id;
          return (
            <article
              className={`${styles.chatHistoryRow} ${session.id === currentSessionId ? styles.chatHistoryRowActive : ''}`}
              key={session.id}
            >
              <div className={styles.chatHistoryIdentity}>
                <strong>{session.title}</strong>
                <span>
                  {session.messages.length} messages · Updated {formatRelativeTime(session.updatedAt)}
                  {session.toolWorkspacePath ? ` · ${session.toolWorkspacePath}` : ''}
                </span>
              </div>
              {deleting ? (
                <div className={styles.chatHistoryDeleteConfirm}>
                  <span>Delete this chat?</span>
                  <button className={styles.dangerButton} type="button" onClick={() => confirmSingleDelete(session.id)}>Delete</button>
                  <button className={styles.secondaryButton} type="button" onClick={() => setDeleteSessionId(null)}>Cancel</button>
                </div>
              ) : (
                <div className={styles.toolRouterActions}>
                  <button className={styles.secondaryButton} type="button" onClick={() => onOpenChat(session.id)}>
                    <Icon name="chat" size={14} />
                    Open
                  </button>
                  <button className={styles.dangerButton} type="button" onClick={() => setDeleteSessionId(session.id)}>
                    <Icon name="trash" size={14} />
                    Delete
                  </button>
                </div>
              )}
            </article>
          );
        })}
        {visibleSessions.length === 0 && (
          <div className={styles.chatHistoryEmpty}>
            <Icon name="chat" size={20} />
            <strong>{query.trim() ? 'No matching chats' : 'No saved chats'}</strong>
            <span>{query.trim() ? 'Try a different search.' : 'New conversations will appear here after you send a message.'}</span>
          </div>
        )}
      </div>
    </SettingsSection>
  );
}
