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

export interface ToolEventScope {
  source: 'scheduled-task' | 'virtual-team' | 'project-chat';
  workspacePath?: string;
  runId?: string;
  taskId?: string;
  taskName?: string;
  teamId?: string;
  teamName?: string;
  projectId?: string;
  projectName?: string;
  projectChatKey?: string;
  channel?: 'guided' | 'team';
  memberId?: string;
  memberName?: string;
  assignmentId?: string;
  assignmentTitle?: string;
}

export interface ToolStartMessage {
  toolId: string;
  toolName: string;
  args: Record<string, any>;
  timestamp: number;
  scope?: ToolEventScope;
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
  scope?: ToolEventScope;
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
  scope?: ToolEventScope;
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
  scope?: ToolEventScope;
}

export interface ToolCompleteMessage {
  toolId: string;
  success: boolean;
  duration: number;
  scope?: ToolEventScope;
}

export interface ToolErrorMessage {
  toolId: string;
  error: string;
  stack?: string;
  scope?: ToolEventScope;
}

export type ToolPermissionMode = 'allow' | 'ask' | 'deny';

export interface ToolPermissionReviewRequest {
  requestId: string;
  toolId: string;
  toolName: string;
  args: Record<string, any>;
  createdAt: number;
  scope?: ToolEventScope;
}

export interface ToolPermissionReviewResponse {
  requestId: string;
  approved: boolean;
  reason?: string;
}

export interface ToolApprovalResolvedMessage {
  requestId: string;
  type?: 'file-write' | 'command' | 'tool';
  title?: string;
  approved: boolean;
  resolvedBy: string;
  reason?: string;
  scope?: ToolEventScope;
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

export type LlmProviderType = 'openai' | 'openai-compatible';

export interface ChatRequest {
  messages: ChatMessage[];
  provider?: LlmProviderType;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  contextTokens?: number;
  enableTools?: boolean;
  maxToolRounds?: number;
  toolScope?: ToolEventScope;
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
  accentColor?: 'blue' | 'teal' | 'violet' | 'graphite' | 'ember';
  language?: string;
  featureProfile?: Record<string, any>;
  featureAccounts?: Record<string, any>;
  platformBaseUrl?: string;
  platformAccessToken?: string;
  platformOrgId?: string;
  platformCatalogSource?: 'local' | 'platform';
  platformCatalogLastSyncedAt?: string;
  platformFeaturePackageCatalog?: Record<string, any>[];
  [key: string]: any;
}

export interface AppInfo {
  version: string;
  platform: NodeJS.Platform;
  arch: string;
  isDev: boolean;
  workspacePath: string;
}

export interface FeaturePackageInstallRequest {
  manifest: Record<string, any>;
  archivePath?: string;
  download?: {
    url: string;
    headers?: Record<string, string>;
  };
}

export interface FeaturePackageInstallResult {
  installedPath: string;
  archivePath: string;
  sha256: string;
  signature: string;
  signingKeyId: string;
  version: string;
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
// AUTOMATION CHANNELS
// ============================================================================

export interface SkillManifest {
  id: string;
  name: string;
  description: string;
  path: string;
  source: 'project' | 'workspace' | 'bundled';
  enabled: boolean;
  trusted?: boolean;
  updatedAt?: number;
}

export interface SkillDetail extends SkillManifest {
  content: string;
}

export interface ScheduledTask {
  id: string;
  name: string;
  prompt: string;
  intervalMinutes: number;
  enabled: boolean;
  nextRunAt: number;
  createdAt: number;
  updatedAt: number;
  retryPolicy?: AutomationRetryPolicy;
  notificationPolicy?: AutomationNotificationPolicy;
  missedRunPolicy?: AutomationMissedRunPolicy;
  retryAttempts?: number;
  lastRunAt?: number;
  lastStatus?: 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';
  lastResult?: string;
}

export interface AutomationRetryPolicy {
  enabled: boolean;
  maxRetries: number;
  retryDelayMinutes: number;
}

export interface AutomationNotificationPolicy {
  onSuccess: boolean;
  onFailure: boolean;
  channel: 'desktop' | 'remote' | 'none';
}

export type AutomationMissedRunPolicy = 'run-once' | 'skip';

export interface AutomationRunRecord {
  id: string;
  taskId: string;
  taskName: string;
  status: 'running' | 'succeeded' | 'failed' | 'skipped';
  startedAt: number;
  completedAt?: number;
  result?: string;
  error?: string;
  model?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface AutomationApprovalRequest {
  id: string;
  type: 'file-write' | 'command' | 'tool';
  title: string;
  summary: string;
  details: Record<string, any>;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  createdAt: number;
  expiresAt: number;
  resolvedAt?: number;
  resolvedBy?: string;
  reason?: string;
}

export interface RemoteControlState {
  enabled: boolean;
  mode: 'disabled' | 'local-network' | 'relay';
  serverPort?: number;
  serverUrl?: string;
  localNetworkUrls?: string[];
  pairingCode?: string;
  pairingTokenHash?: string;
  pairingExpiresAt?: number;
  approvedDevices: Array<{
    id: string;
    name: string;
    createdAt: number;
    lastSeenAt?: number;
  }>;
  pendingApprovals: Array<{
    id: string;
    deviceName: string;
    requestedAt: number;
  }>;
  pendingActions?: AutomationApprovalRequest[];
  auditLog?: RemoteControlAuditEvent[];
}

export interface RemoteControlAuditEvent {
  id: string;
  type:
    | 'pairing-created'
    | 'device-paired'
    | 'device-revoked'
    | 'approval-approved'
    | 'approval-rejected'
    | 'server-started'
    | 'server-stopped'
    | 'settings-updated';
  message: string;
  createdAt: number;
  deviceId?: string;
  deviceName?: string;
  approvalId?: string;
}

export interface VirtualTeamMember {
  id: string;
  name: string;
  role: string;
  goal: string;
  model?: string;
  tools: string[];
}

export type VirtualTeamPermissionMode = 'supervised' | 'full-access';

export interface VirtualTeamBlueprint {
  id: string;
  name: string;
  objective: string;
  workspacePath?: string;
  permissionMode?: VirtualTeamPermissionMode;
  maxIterations?: number;
  requireQaSignoff?: boolean;
  supervisorId: string;
  members: VirtualTeamMember[];
  status: 'draft' | 'active' | 'paused' | 'completed';
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  lastStatus?: 'running' | 'succeeded' | 'failed';
  lastResult?: string;
}

export interface VirtualTeamMilestone {
  id: string;
  title: string;
  ownerRole: string;
  memberId: string;
  memberName: string;
  iteration: number;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  summary?: string;
}

export interface VirtualTeamAssignmentPlan {
  id: string;
  title: string;
  description: string;
  memberId: string;
  memberName: string;
  role: string;
  dependencies: string[];
  parallelGroup: number;
  workspacePath?: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  startedAt?: number;
  completedAt?: number;
  output?: string;
  error?: string;
}

export interface VirtualTeamRunStep {
  memberId: string;
  memberName: string;
  role: string;
  iteration?: number;
  assignmentId?: string;
  assignmentTitle?: string;
  dependencyIds?: string[];
  parallelGroup?: number;
  workspacePath?: string;
  status: 'running' | 'succeeded' | 'failed';
  startedAt: number;
  completedAt?: number;
  output?: string;
  error?: string;
}

export interface VirtualTeamRunRecord {
  id: string;
  teamId: string;
  teamName: string;
  objective: string;
  workspacePath?: string;
  status: 'running' | 'succeeded' | 'failed';
  startedAt: number;
  completedAt?: number;
  artifactPath?: string;
  summary?: string;
  error?: string;
  milestones?: VirtualTeamMilestone[];
  assignments?: VirtualTeamAssignmentPlan[];
  steps: VirtualTeamRunStep[];
}

export interface AutomationSchedulerStatus {
  running: boolean;
  intervalMs: number;
  runningTaskIds: string[];
}

export interface AutomationProjectExport {
  schemaVersion: 1;
  exportedAt: number;
  workspacePath: string;
  skillPolicies: Record<string, { enabled: boolean; trusted?: boolean }>;
  tasks: ScheduledTask[];
  teams: VirtualTeamBlueprint[];
  taskRuns?: AutomationRunRecord[];
  teamRuns?: VirtualTeamRunRecord[];
}

export interface AutomationProjectImportResult {
  ok: true;
  imported: {
    skillPolicies: number;
    tasks: number;
    teams: number;
    taskRuns: number;
    teamRuns: number;
  };
}

// ============================================================================
// LOCAL HISTORY CHANNELS
// ============================================================================

export type LocalHistoryRecordType =
  | 'chat-session'
  | 'tool-event'
  | 'automation-run'
  | 'project-event';

export interface LocalHistoryRecord {
  schemaVersion: 1;
  id: string;
  type: LocalHistoryRecordType;
  workspacePath?: string;
  title?: string;
  data: any;
  createdAt: number;
  updatedAt: number;
}

export interface LocalHistoryRecordInput {
  id?: string;
  type: LocalHistoryRecordType;
  workspacePath?: string;
  title?: string;
  data: any;
  createdAt?: number;
  updatedAt?: number;
}

export interface LocalHistoryFilter {
  type?: LocalHistoryRecordType;
  workspacePath?: string;
  limit?: number;
}

export interface LocalHistoryExport {
  schemaVersion: 1;
  exportedAt: number;
  records: LocalHistoryRecord[];
}

export interface LocalHistoryStorageInfo {
  storagePath: string;
  recordCount: number;
  updatedAt?: number;
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
} as const;

// Type-safe channel names
export type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];
