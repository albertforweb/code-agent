export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  source?: 'bridge' | 'mcp' | 'cli';
  readOnly?: boolean;
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

export interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: number;
}

export interface FilePathActionResult {
  ok: true;
  path: string;
  absolutePath: string;
}

export interface AuthToken {
  accessToken: string;
  provider?: LlmProviderType;
  expiresAt?: number;
  refreshToken?: string;
}

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
  platform: string;
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

export interface BootstrapData {
  user: any;
  config: any;
  features: Record<string, boolean>;
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
  relay?: RemoteRelayConfig;
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

export interface RemoteRelayConfig {
  enrollmentStatus: 'not-configured' | 'enrolled' | 'disabled';
  brokerUrl?: string;
  accountId?: string;
  deviceId?: string;
  relayPublicKey?: string;
  clientKeyId?: string;
  auditCursor?: string;
  enrolledAt?: number;
  disabledAt?: number;
  lastConnectedAt?: number;
  tokenRotatesAt?: number;
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
    | 'settings-updated'
    | 'relay-configured'
    | 'relay-disabled';
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

export interface ElectronRendererApi {
  tools: {
    execute(toolName: string, args: Record<string, any>): Promise<ToolExecuteResponse>;
    list(): Promise<Tool[]>;
    respondToFileWriteReview(response: FileWriteReviewResponse): Promise<{ ok: boolean }>;
    respondToCommandReview(response: CommandReviewResponse): Promise<{ ok: boolean }>;
    respondToToolPermissionReview(response: ToolPermissionReviewResponse): Promise<{ ok: boolean }>;
  };
  api: {
    chat(request: ChatRequest): Promise<ChatResponse>;
    chatStream(request: ChatStreamRequest): Promise<ChatStreamResponse>;
    fetchBootstrap(): Promise<BootstrapData>;
  };
  mcp: {
    listServers(): Promise<McpServerInfo[]>;
    listTools(): Promise<McpToolInfo[]>;
    refresh(): Promise<McpServerInfo[]>;
  };
  automation: {
    listSkills(): Promise<SkillManifest[]>;
    refreshSkills(): Promise<SkillManifest[]>;
    getSkill(skillId: string): Promise<SkillDetail>;
    setSkillEnabled(skillId: string, enabled: boolean): Promise<SkillManifest>;
    listTasks(): Promise<ScheduledTask[]>;
    listTaskRuns(taskId?: string): Promise<AutomationRunRecord[]>;
    saveTask(task: Partial<ScheduledTask>): Promise<ScheduledTask>;
    setTaskEnabled(taskId: string, enabled: boolean): Promise<ScheduledTask>;
    deleteTask(taskId: string): Promise<{ ok: true; id: string }>;
    runTask(taskId: string): Promise<ScheduledTask>;
    getSchedulerStatus(): Promise<AutomationSchedulerStatus>;
    getRemoteControl(): Promise<RemoteControlState>;
    updateRemoteControl(update: Partial<RemoteControlState>): Promise<RemoteControlState>;
    createRemotePairingCode(deviceName?: string): Promise<RemoteControlState>;
    startRemoteControl(): Promise<RemoteControlState>;
    stopRemoteControl(): Promise<RemoteControlState>;
    listTeams(): Promise<VirtualTeamBlueprint[]>;
    listTeamRuns(teamId?: string): Promise<VirtualTeamRunRecord[]>;
    saveTeam(team: Partial<VirtualTeamBlueprint>): Promise<VirtualTeamBlueprint>;
    deleteTeam(teamId: string): Promise<{ ok: true; id: string }>;
    createDefaultTeam(objective?: string): Promise<VirtualTeamBlueprint>;
    runTeam(teamId: string): Promise<VirtualTeamRunRecord>;
    revokeRemoteDevice(deviceId: string): Promise<RemoteControlState>;
    exportProjectState(options?: { includeRuns?: boolean }): Promise<AutomationProjectExport>;
    importProjectState(bundle: Partial<AutomationProjectExport>): Promise<AutomationProjectImportResult>;
  };
  history: {
    saveRecord(record: LocalHistoryRecordInput): Promise<LocalHistoryRecord>;
    getRecord(id: string): Promise<LocalHistoryRecord>;
    listRecords(filter?: LocalHistoryFilter): Promise<LocalHistoryRecord[]>;
    deleteRecord(id: string): Promise<{ ok: true; id: string }>;
    exportRecords(filter?: LocalHistoryFilter): Promise<LocalHistoryExport>;
    getStorageInfo(): Promise<LocalHistoryStorageInfo>;
  };
  fs: {
    read(path: string, encoding?: string): Promise<string>;
    write(path: string, content: string, encoding?: string): Promise<void>;
    list(path: string): Promise<FileEntry[]>;
    open(path: string): Promise<FilePathActionResult>;
    reveal(path: string): Promise<FilePathActionResult>;
  };
  auth: {
    getToken(): Promise<AuthToken | null>;
    logout(): Promise<void>;
    setToken(token: AuthToken): Promise<void>;
  };
  app: {
    info(): Promise<AppInfo>;
    getConfig(): Promise<AppConfig>;
    setConfig(config: Partial<AppConfig>): Promise<void>;
    getState(): Promise<any>;
    setState(state: any): Promise<void>;
    installFeaturePackage(request: FeaturePackageInstallRequest): Promise<FeaturePackageInstallResult>;
  };
  window: {
    minimize(): Promise<void>;
    maximize(): Promise<void>;
    close(): Promise<void>;
    openDevTools(): Promise<void>;
  };
  onToolResult(callback: (data: ToolResultMessage) => void): () => void;
  onToolStart(callback: (data: ToolStartMessage) => void): () => void;
  onToolComplete(callback: (data: ToolCompleteMessage) => void): () => void;
  onToolError(callback: (data: ToolErrorMessage) => void): () => void;
  onToolPermissionReview(callback: (data: ToolPermissionReviewRequest) => void): () => void;
  onToolApprovalResolved(callback: (data: ToolApprovalResolvedMessage) => void): () => void;
  onFileWriteReview(callback: (data: FileWriteReviewRequest) => void): () => void;
  onCommandReview(callback: (data: CommandReviewRequest) => void): () => void;
  onChatDelta(callback: (data: ChatDeltaMessage) => void): () => void;
  onChatComplete(callback: (data: ChatCompleteMessage) => void): () => void;
  onChatError(callback: (data: ChatErrorMessage) => void): () => void;
  onConfigChanged(callback: (data: AppConfigChangedMessage) => void): () => void;
  onStateChanged(callback: (data: AppStateChangedMessage) => void): () => void;
  onMenuOpenSettings(callback: () => void): () => void;
}

declare global {
  interface Window {
    api?: ElectronRendererApi;
  }
}

function getApi(): ElectronRendererApi {
  if (!window.api) {
    throw new Error('Electron preload API is unavailable');
  }

  return window.api;
}

export const ipcClient: ElectronRendererApi = {
  tools: {
    execute: (toolName, args) => getApi().tools.execute(toolName, args),
    list: () => getApi().tools.list(),
    respondToFileWriteReview: response => getApi().tools.respondToFileWriteReview(response),
    respondToCommandReview: response => getApi().tools.respondToCommandReview(response),
    respondToToolPermissionReview: response => getApi().tools.respondToToolPermissionReview(response),
  },
  api: {
    chat: request => getApi().api.chat(request),
    chatStream: request => getApi().api.chatStream(request),
    fetchBootstrap: () => getApi().api.fetchBootstrap(),
  },
  mcp: {
    listServers: () => getApi().mcp.listServers(),
    listTools: () => getApi().mcp.listTools(),
    refresh: () => getApi().mcp.refresh(),
  },
  automation: {
    listSkills: () => getApi().automation.listSkills(),
    refreshSkills: () => getApi().automation.refreshSkills(),
    getSkill: skillId => getApi().automation.getSkill(skillId),
    setSkillEnabled: (skillId, enabled) => getApi().automation.setSkillEnabled(skillId, enabled),
    listTasks: () => getApi().automation.listTasks(),
    listTaskRuns: taskId => getApi().automation.listTaskRuns(taskId),
    saveTask: task => getApi().automation.saveTask(task),
    setTaskEnabled: (taskId, enabled) => getApi().automation.setTaskEnabled(taskId, enabled),
    deleteTask: taskId => getApi().automation.deleteTask(taskId),
    runTask: taskId => getApi().automation.runTask(taskId),
    getSchedulerStatus: () => getApi().automation.getSchedulerStatus(),
    getRemoteControl: () => getApi().automation.getRemoteControl(),
    updateRemoteControl: update => getApi().automation.updateRemoteControl(update),
    createRemotePairingCode: deviceName => getApi().automation.createRemotePairingCode(deviceName),
    startRemoteControl: () => getApi().automation.startRemoteControl(),
    stopRemoteControl: () => getApi().automation.stopRemoteControl(),
    listTeams: () => getApi().automation.listTeams(),
    listTeamRuns: teamId => getApi().automation.listTeamRuns(teamId),
    saveTeam: team => getApi().automation.saveTeam(team),
    deleteTeam: teamId => getApi().automation.deleteTeam(teamId),
    createDefaultTeam: objective => getApi().automation.createDefaultTeam(objective),
    runTeam: teamId => getApi().automation.runTeam(teamId),
    revokeRemoteDevice: deviceId => getApi().automation.revokeRemoteDevice(deviceId),
    exportProjectState: options => getApi().automation.exportProjectState(options),
    importProjectState: bundle => getApi().automation.importProjectState(bundle),
  },
  history: {
    saveRecord: record => getApi().history.saveRecord(record),
    getRecord: id => getApi().history.getRecord(id),
    listRecords: filter => getApi().history.listRecords(filter),
    deleteRecord: id => getApi().history.deleteRecord(id),
    exportRecords: filter => getApi().history.exportRecords(filter),
    getStorageInfo: () => getApi().history.getStorageInfo(),
  },
  fs: {
    read: (path, encoding) => getApi().fs.read(path, encoding),
    write: (path, content, encoding) => getApi().fs.write(path, content, encoding),
    list: path => getApi().fs.list(path),
    open: path => getApi().fs.open(path),
    reveal: path => getApi().fs.reveal(path),
  },
  auth: {
    getToken: () => getApi().auth.getToken(),
    logout: () => getApi().auth.logout(),
    setToken: token => getApi().auth.setToken(token),
  },
  app: {
    info: () => getApi().app.info(),
    getConfig: () => getApi().app.getConfig(),
    setConfig: config => getApi().app.setConfig(config),
    getState: () => getApi().app.getState(),
    setState: state => getApi().app.setState(state),
    installFeaturePackage: request => getApi().app.installFeaturePackage(request),
  },
  window: {
    minimize: () => getApi().window.minimize(),
    maximize: () => getApi().window.maximize(),
    close: () => getApi().window.close(),
    openDevTools: () => getApi().window.openDevTools(),
  },
  onToolStart: callback => getApi().onToolStart(callback),
  onToolResult: callback => getApi().onToolResult(callback),
  onToolComplete: callback => getApi().onToolComplete(callback),
  onToolError: callback => getApi().onToolError(callback),
  onToolPermissionReview: callback => getApi().onToolPermissionReview(callback),
  onToolApprovalResolved: callback => getApi().onToolApprovalResolved(callback),
  onFileWriteReview: callback => getApi().onFileWriteReview(callback),
  onCommandReview: callback => getApi().onCommandReview(callback),
  onChatDelta: callback => getApi().onChatDelta(callback),
  onChatComplete: callback => getApi().onChatComplete(callback),
  onChatError: callback => getApi().onChatError(callback),
  onConfigChanged: callback => getApi().onConfigChanged(callback),
  onStateChanged: callback => getApi().onStateChanged(callback),
  onMenuOpenSettings: callback => getApi().onMenuOpenSettings(callback),
};
