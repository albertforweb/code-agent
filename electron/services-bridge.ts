/**
 * Main-process service registration for Electron IPC.
 */

import { AsyncLocalStorage } from 'async_hooks';
import { app, BrowserWindow, dialog, net, Notification, shell, type OpenDialogOptions } from 'electron';
import { existsSync, type Dirent } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';
import { IpcBridge } from './bridge';
import {
  IPC_CHANNELS,
  type ChatStreamRequest,
  type DesktopPermissionProfile,
  type CommandReviewResponse,
  type FeaturePackageInstallRequest,
  type FileWritePreview,
  type FileWriteReviewResponse,
  type ToolEventScope,
  type ToolPermissionMode,
  type ToolPermissionReviewResponse,
  type ToolExecuteMessage,
  type ToolApprovalResolvedMessage,
  type SelectedContextPath,
  type FileContextReadItem,
  type FileContextReadResult,
} from './types';
import type { FeaturePackageManifest } from '@codeagent/feature-package-sdk';
import {
  installSignedPackageArtifact,
  listInstalledFeaturePackageRuntimes,
  uninstallPackageArtifact,
} from './feature-package-installer';
import {
  activateInstalledFeaturePackageRuntime,
  activateInstalledFeaturePackageRuntimes,
} from './feature-package-runtime-host';
import { CODEAGENT_LOCAL_BASE_URL, LocalModelManager } from './services/local-model-service';
import {
  expandHomePath,
  isPathOutsideWorkspace as isRequestedPathOutsideWorkspace,
} from './services/path-permission';
import { ensureProjectChatWorkspace } from './services/project-workspace-service';
import {
  ToolServiceBridge,
  type BridgeToolDefinition,
  ApiServiceBridge,
  FileSystemServiceBridge,
  AuthServiceBridge,
  AppStateServiceBridge,
  CommandServiceBridge,
  type CommandRunPreview,
  type AutomationNotificationEmitter,
  AutomationServiceBridge,
  type SkillDetail,
  type ScheduledTask,
  type VirtualTeamPermissionMode,
  FinanceServiceBridge,
  LocalHistoryServiceBridge,
  McpServiceBridge,
  WebServiceBridge,
} from './services';

export interface ServiceBridgeOptions {
  getMainWindow: () => BrowserWindow | null;
  cwd?: string;
  isDev?: boolean;
  keytar?: any;
}

export interface RegisteredServiceBridges {
  toolService: ToolServiceBridge;
  apiService: ApiServiceBridge;
  filesService: FileSystemServiceBridge;
  authService: AuthServiceBridge;
  appStateService: AppStateServiceBridge;
  mcpService: McpServiceBridge;
  automationService: AutomationServiceBridge;
  historyService: LocalHistoryServiceBridge;
  localModelService: LocalModelManager;
}

const DEFAULT_CONTEXT_MAX_FILES = 16;
const DEFAULT_CONTEXT_MAX_BYTES = 120_000;
const DEFAULT_CONTEXT_MAX_FILE_BYTES = 24_000;
const CONTEXT_MAX_DIRECTORY_DEPTH = 4;
const CONTEXT_IGNORED_DIRECTORY_NAMES = new Set([
  '.git',
  '.hg',
  '.svn',
  '.next',
  '.turbo',
  '.venv',
  'venv',
  '__pycache__',
  'node_modules',
  'dist',
  'dist-build',
  'build',
  'coverage',
  'target',
  '.idea',
  '.vscode',
]);
const CONTEXT_TEXT_EXTENSIONS = new Set([
  '',
  '.c',
  '.cc',
  '.cpp',
  '.cs',
  '.css',
  '.csv',
  '.go',
  '.graphql',
  '.h',
  '.hpp',
  '.html',
  '.java',
  '.js',
  '.jsx',
  '.json',
  '.kt',
  '.less',
  '.log',
  '.md',
  '.mdx',
  '.mjs',
  '.py',
  '.rb',
  '.rs',
  '.scss',
  '.sh',
  '.sql',
  '.svelte',
  '.swift',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.vue',
  '.xml',
  '.yaml',
  '.yml',
]);

function clampPositiveInteger(value: unknown, fallback: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(parsed), maximum);
}

function resolveDialogDefaultPath(workspacePath: string, defaultPath?: string): string {
  if (typeof defaultPath === 'string' && defaultPath.trim()) {
    return path.isAbsolute(defaultPath)
      ? defaultPath
      : path.resolve(workspacePath, defaultPath);
  }
  return workspacePath;
}

async function describeSelectedContextPath(filePath: string): Promise<SelectedContextPath> {
  const absolutePath = path.resolve(filePath);
  const stats = await fs.stat(absolutePath);
  return {
    path: absolutePath,
    type: stats.isDirectory() ? 'directory' : 'file',
    name: path.basename(absolutePath) || absolutePath,
    size: stats.size,
    modified: stats.mtime.getTime(),
  };
}

function shouldSkipContextDirectory(directoryName: string): boolean {
  return CONTEXT_IGNORED_DIRECTORY_NAMES.has(directoryName) || directoryName.endsWith('.app');
}

function isLikelyTextFilePath(filePath: string): boolean {
  return CONTEXT_TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

async function collectContextFiles(
  rootPath: string,
  remainingSlots: () => number,
  depth = 0,
): Promise<{ files: string[]; omittedCount: number }> {
  if (remainingSlots() <= 0) {
    return { files: [], omittedCount: 1 };
  }
  if (depth > CONTEXT_MAX_DIRECTORY_DEPTH) {
    return { files: [], omittedCount: 1 };
  }

  let entries: Dirent[];
  try {
    entries = await fs.readdir(rootPath, { withFileTypes: true });
  } catch {
    return { files: [], omittedCount: 1 };
  }

  const sortedEntries = entries.sort((left, right) => {
    if (left.isDirectory() !== right.isDirectory()) {
      return left.isDirectory() ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });

  const files: string[] = [];
  let omittedCount = 0;
  for (const entry of sortedEntries) {
    if (remainingSlots() - files.length <= 0) {
      omittedCount += 1;
      continue;
    }
    if (entry.name.startsWith('.') && !['.env', '.gitignore'].includes(entry.name)) {
      omittedCount += 1;
      continue;
    }

    const childPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkipContextDirectory(entry.name)) {
        omittedCount += 1;
        continue;
      }
      const nested = await collectContextFiles(childPath, () => remainingSlots() - files.length, depth + 1);
      files.push(...nested.files);
      omittedCount += nested.omittedCount;
      continue;
    }

    if (!entry.isFile() || !isLikelyTextFilePath(childPath)) {
      omittedCount += 1;
      continue;
    }

    files.push(childPath);
  }

  return { files, omittedCount };
}

async function readContextFile(
  filePath: string,
  sourcePath: string,
  remainingBytes: number,
  maxFileBytes: number,
): Promise<{ item: FileContextReadItem; bytes: number }> {
  const metadata = await describeSelectedContextPath(filePath);
  if (metadata.type !== 'file') {
    return {
      item: {
        ...metadata,
        sourcePath,
        error: 'Skipped because this path is not a file.',
      },
      bytes: 0,
    };
  }

  if (!isLikelyTextFilePath(filePath)) {
    return {
      item: {
        ...metadata,
        sourcePath,
        error: 'Skipped because the file extension is not treated as text context.',
      },
      bytes: 0,
    };
  }

  const bytesToRead = Math.min(metadata.size ?? 0, remainingBytes, maxFileBytes);
  if (bytesToRead <= 0) {
    return {
      item: {
        ...metadata,
        sourcePath,
        truncated: true,
        error: 'Skipped because the attachment context byte limit was reached.',
      },
      bytes: 0,
    };
  }

  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(bytesToRead);
    const { bytesRead } = await handle.read(buffer, 0, bytesToRead, 0);
    const data = buffer.subarray(0, bytesRead);
    if (data.includes(0)) {
      return {
        item: {
          ...metadata,
          sourcePath,
          error: 'Skipped because the file appears to be binary.',
        },
        bytes: 0,
      };
    }

    const content = data.toString('utf8');
    const contentBytes = Buffer.byteLength(content, 'utf8');
    return {
      item: {
        ...metadata,
        sourcePath,
        content,
        truncated: Boolean(metadata.size && metadata.size > bytesRead),
      },
      bytes: contentBytes,
    };
  } finally {
    await handle.close();
  }
}

function createToolId(): string {
  return `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createChatRequestId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createFileWriteReviewId(): string {
  return `write-review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createCommandReviewId(): string {
  return `command-review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createToolPermissionReviewId(): string {
  return `tool-permission-review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type AutomationExecutionScope = {
  source: 'scheduled-task' | 'virtual-team' | 'project-chat' | 'chat';
  permissionMode: VirtualTeamPermissionMode;
  workspacePath: string;
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
};

function sendToRenderer(
  getMainWindow: () => BrowserWindow | null,
  channel: string,
  payload: unknown,
): void {
  const window = getMainWindow();
  if (!window || window.isDestroyed()) {
    return;
  }

  window.webContents.send(channel, payload);
}

export function registerServiceBridges(
  ipcBridge: IpcBridge,
  options: ServiceBridgeOptions,
): RegisteredServiceBridges {
  const workspacePath = resolveWorkspacePath(options.cwd);
  const automationExecutionScope = new AsyncLocalStorage<AutomationExecutionScope>();
  const pendingFileWriteReviews = new Map<string, {
    resolve: () => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  const pendingCommandReviews = new Map<string, {
    resolve: () => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  const pendingToolPermissionReviews = new Map<string, {
    resolve: () => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  const scopedFileServices = new Map<string, FileSystemServiceBridge>();
  const scopedCommandServices = new Map<string, CommandServiceBridge>();
  const computerRootPath = path.parse(workspacePath).root;
  const unrestrictedFileService = new FileSystemServiceBridge(computerRootPath);
  const unrestrictedCommandService = new CommandServiceBridge(computerRootPath);

  function hasFullAccessAutomationScope(): boolean {
    return automationExecutionScope.getStore()?.permissionMode === 'full-access';
  }

  function getScopedWorkspacePath(): string {
    return path.resolve(automationExecutionScope.getStore()?.workspacePath || workspacePath);
  }

  function getProjectIdFromAutomationTeamId(teamId: string | undefined): string | undefined {
    const prefix = 'project-auto-';
    return typeof teamId === 'string' && teamId.startsWith(prefix)
      ? teamId.slice(prefix.length)
      : undefined;
  }

  function getAutomationToolEventScope(): ToolEventScope | undefined {
    const scope = automationExecutionScope.getStore();
    if (!scope) {
      return undefined;
    }

    return {
      source: scope.source,
      workspacePath: path.resolve(scope.workspacePath || workspacePath),
      runId: scope.runId,
      taskId: scope.taskId,
      taskName: scope.taskName,
      teamId: scope.teamId,
      teamName: scope.teamName,
      projectId: scope.projectId ?? getProjectIdFromAutomationTeamId(scope.teamId),
      projectName: scope.projectName,
      projectChatKey: scope.projectChatKey,
      channel: scope.channel,
      memberId: scope.memberId,
      memberName: scope.memberName,
      assignmentId: scope.assignmentId,
      assignmentTitle: scope.assignmentTitle,
    };
  }

  // Keep lifecycle events attached to the run that created the tool. Looking
  // only at the current async scope can misroute a late event after the user
  // switches conversations.
  const toolEventScopes = new Map<string, ToolEventScope | undefined>();

  function getToolEventScope(toolId: string): ToolEventScope | undefined {
    return toolEventScopes.has(toolId)
      ? toolEventScopes.get(toolId)
      : getAutomationToolEventScope();
  }

  async function executeToolWithCapturedScope(
    toolName: string,
    args: Record<string, any>,
    toolId: string,
  ): Promise<any> {
    toolEventScopes.set(toolId, getAutomationToolEventScope());
    try {
      return await toolService.executeToolAndReturn(toolName, args, toolId);
    } finally {
      toolEventScopes.delete(toolId);
    }
  }

  function getScopedFileService(): FileSystemServiceBridge {
    const scopedWorkspacePath = getScopedWorkspacePath();
    if (scopedWorkspacePath === workspacePath) {
      return filesService;
    }

    let service = scopedFileServices.get(scopedWorkspacePath);
    if (!service) {
      service = new FileSystemServiceBridge(scopedWorkspacePath);
      scopedFileServices.set(scopedWorkspacePath, service);
    }
    return service;
  }

  function getScopedCommandService(): CommandServiceBridge {
    const scopedWorkspacePath = getScopedWorkspacePath();
    if (scopedWorkspacePath === workspacePath) {
      return commandService;
    }

    let service = scopedCommandServices.get(scopedWorkspacePath);
    if (!service) {
      service = new CommandServiceBridge(scopedWorkspacePath);
      scopedCommandServices.set(scopedWorkspacePath, service);
    }
    return service;
  }

  function normalizeRequestedPath(requestedPath: string): string {
    return expandHomePath(requestedPath, app.getPath('home'));
  }

  function isPathOutsideWorkspace(requestedPath: string, scopedWorkspacePath = getScopedWorkspacePath()): boolean {
    return isRequestedPathOutsideWorkspace(requestedPath, scopedWorkspacePath, app.getPath('home'));
  }

  async function getDesktopPermissionProfile(): Promise<DesktopPermissionProfile> {
    return normalizeDesktopPermissionProfile((await appStateService.getConfig()).desktopPermissionProfile);
  }

  async function getFileServiceForPath(
    requestedPath: string,
    toolName: string,
    toolId: string,
    requestExternalReview: boolean,
  ): Promise<FileSystemServiceBridge> {
    const profile = await getDesktopPermissionProfile();
    const outsideWorkspace = isPathOutsideWorkspace(requestedPath);
    if (profile === 'full-access' && outsideWorkspace) {
      return unrestrictedFileService;
    }
    if (profile === 'ask' && outsideWorkspace) {
      if (requestExternalReview) {
        const resolvedPath = normalizeRequestedPath(requestedPath);
        await requestToolPermissionReview(toolName, {
          path: path.resolve(resolvedPath),
          reason: 'Access outside the active workspace',
        }, toolId);
      }
      return unrestrictedFileService;
    }
    if (outsideWorkspace) {
      const resolvedPath = path.resolve(normalizeRequestedPath(requestedPath));
      const activeWorkspace = getScopedWorkspacePath();
      throw new Error(
        `Access denied by the ${profile} permission profile: ${resolvedPath} is outside the active workspace ${activeWorkspace}. ` +
        'Select that folder as the workspace or change the permission profile to Ask when needed.',
      );
    }
    return getScopedFileService();
  }

  async function getCommandServiceForArgs(args: Record<string, any>): Promise<CommandServiceBridge> {
    const profile = await getDesktopPermissionProfile();
    const requestedCwd = typeof args.cwd === 'string' && args.cwd.trim() ? args.cwd.trim() : '.';
    const outsideWorkspace = isPathOutsideWorkspace(requestedCwd);
    if ((profile === 'full-access' || profile === 'ask') && outsideWorkspace) {
      return unrestrictedCommandService;
    }
    return getScopedCommandService();
  }

  function requestFileWriteReview(preview: FileWritePreview, toolId: string): Promise<void> {
    if (hasFullAccessAutomationScope()) {
      return Promise.resolve();
    }

    return getDesktopPermissionProfile().then(profile => {
      if (profile === 'trusted-workspace' || profile === 'full-access') {
        return;
      }
      return requestFileWriteReviewDialog(preview, toolId);
    });
  }

  function requestFileWriteReviewDialog(preview: FileWritePreview, toolId: string): Promise<void> {

    const window = options.getMainWindow();
    const requestId = createFileWriteReviewId();
    const payload = {
      ...preview,
      requestId,
      toolId,
      createdAt: Date.now(),
      scope: getToolEventScope(toolId),
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingFileWriteReviews.delete(requestId);
        automationService.expireApprovalRequest(requestId).catch(() => {});
        reject(new Error(`File write review timed out for ${preview.path}`));
      }, 5 * 60 * 1000);

      pendingFileWriteReviews.set(requestId, { resolve, reject, timeout });
      automationService.registerApprovalRequest({
        id: requestId,
        type: 'file-write',
        title: `Review file write: ${preview.path}`,
        summary: preview.exists ? 'Update an existing workspace file' : 'Create a new workspace file',
        details: payload,
      }, {
        approve: () => {
          const pending = pendingFileWriteReviews.get(requestId);
          if (!pending) {
            return;
          }
          pendingFileWriteReviews.delete(requestId);
          clearTimeout(pending.timeout);
          pending.resolve();
        },
        reject: reason => {
          const pending = pendingFileWriteReviews.get(requestId);
          if (!pending) {
            return;
          }
          pendingFileWriteReviews.delete(requestId);
          clearTimeout(pending.timeout);
          pending.reject(new Error(reason || 'File write rejected by user.'));
        },
      }).catch(error => {
        pendingFileWriteReviews.delete(requestId);
        clearTimeout(timeout);
        reject(error);
      });

      if (window && !window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS['tool:fileWriteReview'], payload);
      }
    });
  }

  function requestCommandReview(preview: CommandRunPreview, toolId: string): Promise<void> {
    if (hasFullAccessAutomationScope()) {
      return Promise.resolve();
    }

    return getDesktopPermissionProfile().then(profile => {
      if (profile === 'trusted-workspace' || profile === 'full-access') {
        return;
      }
      return requestCommandReviewDialog(preview, toolId);
    });
  }

  function requestCommandReviewDialog(preview: CommandRunPreview, toolId: string): Promise<void> {

    const window = options.getMainWindow();
    const requestId = createCommandReviewId();
    const payload = {
      ...preview,
      requestId,
      toolId,
      createdAt: Date.now(),
      scope: getToolEventScope(toolId),
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingCommandReviews.delete(requestId);
        automationService.expireApprovalRequest(requestId).catch(() => {});
        reject(new Error(`Command review timed out for ${preview.command}`));
      }, 5 * 60 * 1000);

      pendingCommandReviews.set(requestId, { resolve, reject, timeout });
      automationService.registerApprovalRequest({
        id: requestId,
        type: 'command',
        title: `Review command: ${preview.command}`,
        summary: `Run command in ${preview.cwd || '.'}`,
        details: payload,
      }, {
        approve: () => {
          const pending = pendingCommandReviews.get(requestId);
          if (!pending) {
            return;
          }
          pendingCommandReviews.delete(requestId);
          clearTimeout(pending.timeout);
          pending.resolve();
        },
        reject: reason => {
          const pending = pendingCommandReviews.get(requestId);
          if (!pending) {
            return;
          }
          pendingCommandReviews.delete(requestId);
          clearTimeout(pending.timeout);
          pending.reject(new Error(reason || 'Command rejected by user.'));
        },
      }).catch(error => {
        pendingCommandReviews.delete(requestId);
        clearTimeout(timeout);
        reject(error);
      });

      if (window && !window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS['tool:commandReview'], payload);
      }
    });
  }

  function requestToolPermissionReview(
    toolName: string,
    args: Record<string, any>,
    toolId: string,
  ): Promise<void> {
    if (hasFullAccessAutomationScope()) {
      return Promise.resolve();
    }

    const window = options.getMainWindow();
    const requestId = createToolPermissionReviewId();
    const payload = {
      requestId,
      toolId,
      toolName,
      args,
      createdAt: Date.now(),
      scope: getToolEventScope(toolId),
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingToolPermissionReviews.delete(requestId);
        automationService.expireApprovalRequest(requestId).catch(() => {});
        reject(new Error(`Tool permission review timed out for ${toolName}`));
      }, 5 * 60 * 1000);

      pendingToolPermissionReviews.set(requestId, { resolve, reject, timeout });
      automationService.registerApprovalRequest({
        id: requestId,
        type: 'tool',
        title: `Review tool call: ${toolName}`,
        summary: `Approve or reject ${toolName}`,
        details: payload,
      }, {
        approve: () => {
          const pending = pendingToolPermissionReviews.get(requestId);
          if (!pending) {
            return;
          }
          pendingToolPermissionReviews.delete(requestId);
          clearTimeout(pending.timeout);
          pending.resolve();
        },
        reject: reason => {
          const pending = pendingToolPermissionReviews.get(requestId);
          if (!pending) {
            return;
          }
          pendingToolPermissionReviews.delete(requestId);
          clearTimeout(pending.timeout);
          pending.reject(new Error(reason || 'Tool call rejected by user.'));
        },
      }).catch(error => {
        pendingToolPermissionReviews.delete(requestId);
        clearTimeout(timeout);
        reject(error);
      });

      if (window && !window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS['tool:permissionReview'], payload);
      }
    });
  }

  function normalizePermissionMode(value: unknown): ToolPermissionMode | undefined {
    return value === 'allow' || value === 'ask' || value === 'deny' ? value : undefined;
  }

  function normalizeDesktopPermissionProfile(value: unknown): DesktopPermissionProfile {
    return value === 'ask' || value === 'trusted-workspace' || value === 'full-access'
      ? value
      : 'workspace-only';
  }

  const apiService = new ApiServiceBridge(undefined, workspacePath);
  const filesService = new FileSystemServiceBridge(workspacePath);
  const authService = new AuthServiceBridge(options.keytar);
  const appStateService = new AppStateServiceBridge();
  const mcpService = new McpServiceBridge(workspacePath);
  const commandService = new CommandServiceBridge(workspacePath);
  const automationService = new AutomationServiceBridge(workspacePath);
  const runtimeHostOptions = {
    registerAutomationProvider: (provider: Parameters<AutomationServiceBridge['registerAutomationProvider']>[0], packageId: string) => {
      automationService.registerAutomationProvider(provider, packageId);
    },
  };
  const automationProvidersReady = activateInstalledFeaturePackageRuntimes(runtimeHostOptions);
  automationService.setAutomationProvidersReady(automationProvidersReady);
  const historyService = new LocalHistoryServiceBridge(path.join(app.getPath('userData'), 'history'));
  const electronFetch: typeof fetch = (input, init) => net.fetch(
    input instanceof URL ? input.toString() : input,
    init,
  ) as Promise<Response>;
  const localModelService = new LocalModelManager({
    rootDir: path.join(app.getPath('userData'), 'local-models'),
    fetchImpl: electronFetch,
  });
  const webService = new WebServiceBridge();
  const financeService = new FinanceServiceBridge();
  const toolService = new ToolServiceBridge(
    createBridgeTools({
      apiService,
      filesService,
      appStateService,
      mcpService,
      commandService,
      automationService,
      webService,
      financeService,
      getFileServiceForPath,
      getCommandServiceForArgs,
      normalizeRequestedPath,
      requestFileWriteReview,
      requestCommandReview,
    }),
  );

  const automationNotificationEmitter: AutomationNotificationEmitter = async notification => {
    const createdAt = notification.run.completedAt ?? Date.now();
    await historyService.saveRecord({
      id: `automation-notification-${notification.run.id}-${notification.status}`,
      type: 'project-event',
      workspacePath,
      title: `Scheduled task ${notification.status}: ${notification.task.name}`,
      data: {
        event: 'automation-notification',
        status: notification.status,
        channel: notification.channel,
        taskId: notification.task.id,
        runId: notification.run.id,
        message: notification.message,
      },
      createdAt,
      updatedAt: createdAt,
    });

    if (notification.channel !== 'desktop' || !Notification.isSupported()) {
      return;
    }

    const body = notification.message.replace(/\s+/g, ' ').slice(0, 180);
    new Notification({
      title: `CodeAgent task ${notification.status}`,
      body: body || notification.task.name,
    }).show();
  };

  automationService.setNotificationEmitter(automationNotificationEmitter);
  automationService.setApprovalResolutionEmitter(event => {
    sendToRenderer(options.getMainWindow, IPC_CHANNELS['tool:approvalResolved'], {
      requestId: event.approvalId,
      type: event.type,
      title: event.title,
      approved: event.approved,
      resolvedBy: event.resolvedBy,
      reason: event.reason,
      scope: event.scope as ToolEventScope | undefined,
    } satisfies ToolApprovalResolvedMessage);
  });

  apiService.setAuthTokenProvider(provider => authService.getToken(provider));
  apiService.setAppConfigProvider(() => appStateService.getConfig());
  apiService.setToolProvider(
    () => toolService.getTools(),
    (toolName, args) => executeToolWithCapturedScope(toolName, args, createToolId()),
  );
  apiService.setBootstrapProvider(async () => {
    const [config, tools, mcpServers, mcpTools] = await Promise.all([
      appStateService.getConfig(),
      toolService.getTools(),
      mcpService.listServers(),
      mcpService.listTools(),
    ]);

    return {
      user: {
        authenticated: config.llmProvider === 'openai-compatible' || config.llmProvider === 'codeagent' ||
          Boolean(await authService.getToken(config.llmProvider ?? 'openai-compatible')),
      },
      config,
      workspace: {
        path: workspacePath,
      },
      features: {
        desktopRuntime: true,
        tools: tools.length > 0,
        mcp: mcpServers.length > 0 || mcpTools.length > 0,
        proactive: false,
        buddy: false,
      },
    };
  });

  automationService.setTaskExecutor(async (task, context) => {
    const response = await automationExecutionScope.run({
      source: 'scheduled-task',
      permissionMode: 'supervised',
      workspacePath: context.workspacePath || workspacePath,
      taskId: task.id,
      taskName: task.name,
    }, () => apiService.chat({
      messages: [{
        role: 'user',
        content: buildScheduledTaskPrompt(task, context.enabledSkills, context.workspacePath || workspacePath),
      }],
      enableTools: true,
      maxToolRounds: 8,
    }));

    return {
      content: response.content,
      model: response.model,
      completionRecord: response.completionRecord,
      usage: response.usage,
    };
  });

  automationService.setWorkflowPlannerExecutor(async (workflow, context) => {
    const workflowWorkspacePath = path.resolve(context.workspacePath || workspacePath);
    await fs.mkdir(workflowWorkspacePath, { recursive: true });
    const response = await automationExecutionScope.run({
      source: 'virtual-team',
      permissionMode: 'supervised',
      workspacePath: workflowWorkspacePath,
      teamId: workflow.id,
      teamName: workflow.name,
      projectId: getProjectIdFromAutomationTeamId(workflow.id),
    }, () => apiService.chat({
      messages: [{
        role: 'user',
        content: context.prompt,
      }],
      workflowPlanning: true,
      enableTools: true,
      maxToolRounds: 2,
    }));

    return {
      content: response.content,
      model: response.model,
      usage: response.usage,
    };
  });

  automationService.setWorkflowActorExecutor(async (workflow, actor, context) => {
    const permissionMode = workflow.permissionMode === 'supervised' ? 'supervised' : 'full-access';
    const workflowWorkspacePath = path.resolve(context.workspacePath || workspacePath);
    await fs.mkdir(workflowWorkspacePath, { recursive: true });
    const response = await automationExecutionScope.run({
      source: 'virtual-team',
      permissionMode,
      workspacePath: workflowWorkspacePath,
      teamId: workflow.id,
      teamName: workflow.name,
      projectId: getProjectIdFromAutomationTeamId(workflow.id),
      runId: context.runId,
      memberId: actor.id,
      memberName: actor.name,
      assignmentId: context.assignment.id,
      assignmentTitle: context.assignment.title,
    }, () => apiService.chat({
      messages: [{
        role: 'user',
        content: context.prompt,
      }],
      structuredAgentLoop: true,
      enableTools: true,
      maxToolRounds: 12,
    }));

    return {
      content: response.content,
      model: response.model,
      completionRecord: response.completionRecord,
      usage: response.usage,
    };
  });

  automationService.startScheduler();
  appStateService.getConfig()
    .then(config => config.llmProvider === 'codeagent' && config.model
      ? localModelService.ensureConfigured({
        model: config.model,
        contextTokens: config.contextTokens,
        gpuLayers: config.localGpuLayers,
      })
      : undefined)
    .catch(error => {
      console.warn('Failed to start configured CodeAgent inference:', error);
    });
  automationService.getRemoteControl()
    .then(remote => {
      if (remote.enabled && remote.mode === 'local-network') {
        return automationService.startRemoteControlServer();
      }
      return remote;
    })
    .catch(error => {
      console.warn('Failed to start automation remote control:', error);
    });

  toolService.setStartHandler((toolId: string, toolName: string, args: Record<string, any>) => {
    historyService.saveRecord({
      id: `tool-event-${toolId}`,
      type: 'tool-event',
      workspacePath: getScopedWorkspacePath(),
      title: toolName,
      data: {
        toolId,
        toolName,
        args,
        status: 'running',
        scope: getToolEventScope(toolId),
      },
    }).catch(error => {
      console.warn('Failed to save tool history event:', error);
    });
    sendToRenderer(options.getMainWindow, IPC_CHANNELS['tool:start'], {
      toolId,
      toolName,
      args,
      timestamp: Date.now(),
      scope: getToolEventScope(toolId),
    });
  });

  toolService.setResultHandler((toolId: string, data: any) => {
    historyService.saveRecord({
      id: `tool-event-${toolId}`,
      type: 'tool-event',
      workspacePath: getScopedWorkspacePath(),
      data: {
        toolId,
        result: data,
        status: 'result',
        scope: getToolEventScope(toolId),
      },
    }).catch(error => {
      console.warn('Failed to save tool history event:', error);
    });
    sendToRenderer(options.getMainWindow, IPC_CHANNELS['tool:result'], {
      toolId,
      data,
      timestamp: Date.now(),
      scope: getToolEventScope(toolId),
    });
  });

  toolService.setCompleteHandler((toolId: string, success: boolean, duration: number) => {
    historyService.saveRecord({
      id: `tool-event-${toolId}`,
      type: 'tool-event',
      workspacePath: getScopedWorkspacePath(),
      data: {
        toolId,
        success,
        duration,
        status: success ? 'succeeded' : 'failed',
        scope: getToolEventScope(toolId),
      },
    }).catch(error => {
      console.warn('Failed to save tool history event:', error);
    });
    sendToRenderer(options.getMainWindow, IPC_CHANNELS['tool:complete'], {
      toolId,
      success,
      duration,
      scope: getToolEventScope(toolId),
    });
  });

  toolService.setErrorHandler((toolId: string, error: string, stack?: string) => {
    historyService.saveRecord({
      id: `tool-event-${toolId}`,
      type: 'tool-event',
      workspacePath: getScopedWorkspacePath(),
      data: {
        toolId,
        error,
        stack,
        status: 'failed',
        scope: getToolEventScope(toolId),
      },
    }).catch(saveError => {
      console.warn('Failed to save tool history event:', saveError);
    });
    sendToRenderer(options.getMainWindow, IPC_CHANNELS['tool:error'], {
      toolId,
      error,
      stack,
      scope: getToolEventScope(toolId),
    });
  });

  toolService.setPermissionPolicyProvider(async tool => {
    if (hasFullAccessAutomationScope()) {
      return 'allow';
    }

    const config = await appStateService.getConfig();
    const policies = config.toolPermissionPolicies ?? {};
    return normalizePermissionMode(policies[tool.name]) ?? 'allow';
  });

  toolService.setPermissionReviewHandler((tool, args, context) => {
    return requestToolPermissionReview(tool.name, args, context.toolId);
  });

  ipcBridge.registerToolHandler('execute', async (message: ToolExecuteMessage) => {
    const toolId = message.toolId ?? createToolId();

    executeToolWithCapturedScope(message.toolName, message.args ?? {}, toolId).catch(error => {
      console.error('Tool execution error:', error);
    });

    return { toolId };
  });

  ipcBridge.registerToolHandler('list', async () => {
    return toolService.getTools();
  });

  ipcBridge.registerToolHandler('fileWriteReviewResponse', async (response: FileWriteReviewResponse) => {
    const resolved = await automationService.resolveApprovalRequest(
      response.requestId,
      response.approved,
      response.reason,
      'desktop',
    );
    return resolved;
  });

  ipcBridge.registerToolHandler('commandReviewResponse', async (response: CommandReviewResponse) => {
    const resolved = await automationService.resolveApprovalRequest(
      response.requestId,
      response.approved,
      response.reason,
      'desktop',
    );
    return resolved;
  });

  ipcBridge.registerToolHandler('permissionReviewResponse', async (response: ToolPermissionReviewResponse) => {
    const resolved = await automationService.resolveApprovalRequest(
      response.requestId,
      response.approved,
      response.reason,
      'desktop',
    );
    return resolved;
  });

  ipcBridge.registerApiHandler('chat', async request => {
    return apiService.chat(request);
  });

  ipcBridge.registerApiHandler('chatStream', async (request: ChatStreamRequest) => {
    const requestId = request.requestId ?? createChatRequestId();
    const startTime = Date.now();
    const configuredPermissionProfile = normalizeDesktopPermissionProfile(
      (await appStateService.getConfig()).desktopPermissionProfile,
    );
    const desktopPermissionProfile = request.permissionProfile
      ? normalizeDesktopPermissionProfile(request.permissionProfile)
      : configuredPermissionProfile;
    const authorizedWorkspacePath = typeof request.authorizedWorkspacePath === 'string' && request.authorizedWorkspacePath.trim()
      ? path.resolve(request.authorizedWorkspacePath.trim())
      : undefined;
    const requestedScopePath = request.toolScope?.workspacePath
      ? path.resolve(request.toolScope.workspacePath)
      : undefined;
    if (authorizedWorkspacePath && requestedScopePath && authorizedWorkspacePath !== requestedScopePath) {
      throw new Error(`Chat workspace authorization mismatch: ${authorizedWorkspacePath} does not match ${requestedScopePath}`);
    }
    const effectiveToolScope: ToolEventScope | undefined = request.toolScope
      ? {
          ...request.toolScope,
          workspacePath: requestedScopePath || authorizedWorkspacePath || (
            request.toolScope.source === 'chat'
              ? path.join(app.getPath('userData'), 'chat-workspace')
              : workspacePath
          ),
        }
      : authorizedWorkspacePath
        ? {
            source: 'project-chat',
            workspacePath: authorizedWorkspacePath,
            projectId: `ad-hoc-${requestId}`,
            projectName: path.basename(authorizedWorkspacePath) || authorizedWorkspacePath,
            projectChatKey: `main:${requestId}`,
            channel: 'guided',
          }
        : {
            source: 'chat',
            workspacePath: path.join(app.getPath('userData'), 'chat-workspace'),
          };
    const effectiveRequest: ChatStreamRequest = {
      ...request,
      permissionProfile: desktopPermissionProfile,
      enableTools: request.enableTools !== false,
      toolScope: effectiveToolScope,
    };
    if (process.env.CODEAGENT_DEBUG_CHAT_SCOPE === '1') {
      console.info('[CodeAgent chat scope]', JSON.stringify({
        requestId,
        authorizedWorkspacePath: request.authorizedWorkspacePath ?? null,
        requestedScopePath: request.toolScope?.workspacePath ?? null,
        effectiveWorkspacePath: effectiveToolScope?.workspacePath ?? null,
        toolsEnabled: effectiveRequest.enableTools,
      }));
    }
    const streamScope = effectiveToolScope
      ? {
          source: effectiveToolScope.source,
          permissionMode: desktopPermissionProfile === 'full-access'
            ? 'full-access' as VirtualTeamPermissionMode
            : 'supervised' as VirtualTeamPermissionMode,
          workspacePath: effectiveToolScope.workspacePath || workspacePath,
          runId: effectiveToolScope.runId,
          taskId: effectiveToolScope.taskId,
          taskName: effectiveToolScope.taskName,
          teamId: effectiveToolScope.teamId,
          teamName: effectiveToolScope.teamName,
          projectId: effectiveToolScope.projectId,
          projectName: effectiveToolScope.projectName,
          projectChatKey: effectiveToolScope.projectChatKey,
          channel: effectiveToolScope.channel,
          memberId: effectiveToolScope.memberId,
          memberName: effectiveToolScope.memberName,
          assignmentId: effectiveToolScope.assignmentId,
          assignmentTitle: effectiveToolScope.assignmentTitle,
        }
      : undefined;
    const runStream = async () => {
      if (streamScope?.source === 'project-chat' && streamScope.workspacePath) {
        const resolvedWorkspacePath = path.resolve(streamScope.workspacePath);
        await ensureProjectChatWorkspace(
          resolvedWorkspacePath,
          desktopPermissionProfile,
          () => requestToolPermissionReview('workspace.create', {
            path: resolvedWorkspacePath,
            reason: 'The saved project folder is missing and must be recreated before project work can continue.',
          }, `workspace-create-${requestId}`),
        );
      } else if (streamScope?.source === 'chat' && streamScope.workspacePath) {
        await fs.mkdir(path.resolve(streamScope.workspacePath), { recursive: true });
      }

      return apiService.streamChat(effectiveRequest, {
        onDelta: delta => {
          sendToRenderer(options.getMainWindow, IPC_CHANNELS['api:chatDelta'], {
            requestId,
            delta,
            timestamp: Date.now(),
          });
        },
      });
    };

    (streamScope ? automationExecutionScope.run(streamScope, runStream) : runStream()).then(response => {
      const duration = Date.now() - startTime;
      if (response.performance) {
        const bridgePreparationMs = Math.max(0, duration - response.performance.backendMs);
        const preparation = response.performance.phases.find(phase => phase.phase === 'preparation');
        if (preparation) preparation.durationMs += bridgePreparationMs;
        response.performance.backendMs = duration;
        if (response.performance.firstTokenMs !== undefined) {
          response.performance.firstTokenMs += bridgePreparationMs;
        }
      }
      sendToRenderer(options.getMainWindow, IPC_CHANNELS['api:chatComplete'], {
        requestId,
        response,
        duration,
      });
    }).catch(error => {
      sendToRenderer(options.getMainWindow, IPC_CHANNELS['api:chatError'], {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    });

    return { requestId };
  });

  ipcBridge.registerApiHandler('bootstrap', async () => {
    return apiService.fetchBootstrap();
  });

  ipcBridge.registerLocalModelHandler('search', async request => {
    return localModelService.search(request?.query, request?.limit);
  });
  ipcBridge.registerLocalModelHandler('listFiles', async repository => {
    return localModelService.listFiles(repository);
  });
  ipcBridge.registerLocalModelHandler('download', async request => {
    return localModelService.download(request.repository, request.file);
  });
  ipcBridge.registerLocalModelHandler('listDownloaded', async () => {
    return localModelService.listDownloaded();
  });
  ipcBridge.registerLocalModelHandler('installEngine', async () => {
    return localModelService.installEngine();
  });
  ipcBridge.registerLocalModelHandler('engineInfo', async () => {
    return localModelService.engineInfo();
  });
  ipcBridge.registerLocalModelHandler('start', async request => {
    return localModelService.start(request);
  });
  ipcBridge.registerLocalModelHandler('stop', async () => {
    return localModelService.stop();
  });
  ipcBridge.registerLocalModelHandler('status', async () => {
    return localModelService.status();
  });
  ipcBridge.registerLocalModelHandler('readLog', async tailLines => {
    return localModelService.readLog(tailLines);
  });
  ipcBridge.registerLocalModelHandler('openLog', async () => {
    const log = await localModelService.readLog(1);
    if (!existsSync(log.path)) throw new Error('The llama.cpp log has not been created yet.');
    const error = await shell.openPath(log.path);
    if (error) throw new Error(error);
    return { ok: true, path: log.path };
  });

  ipcBridge.registerFsHandler('read', async request => {
    return filesService.readFile(request.path, request.encoding);
  });

  ipcBridge.registerFsHandler('write', async request => {
    return filesService.writeFile(request.path, request.content, request.encoding);
  });

  ipcBridge.registerFsHandler('list', async request => {
    return filesService.listDirectory(request.path);
  });

  ipcBridge.registerFsHandler('open', async request => {
    const absolutePath = filesService.resolveWorkspacePath(request.path);
    const error = await shell.openPath(absolutePath);
    if (error) {
      throw new Error(error);
    }

    return {
      ok: true,
      path: request.path,
      absolutePath,
    };
  });

  ipcBridge.registerFsHandler('reveal', async request => {
    const absolutePath = filesService.resolveWorkspacePath(request.path);
    shell.showItemInFolder(absolutePath);

    return {
      ok: true,
      path: request.path,
      absolutePath,
    };
  });

  ipcBridge.registerFsHandler('selectFolder', async request => {
    const defaultPath = resolveDialogDefaultPath(workspacePath, request.defaultPath);
    const parentWindow = request.window || options.getMainWindow();
    const dialogOptions: OpenDialogOptions = {
      title: 'Choose chat workspace folder',
      defaultPath,
      properties: ['openDirectory', 'createDirectory'],
    };
    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    return {
      canceled: false,
      path: path.resolve(result.filePaths[0]),
    };
  });

  ipcBridge.registerFsHandler('selectPaths', async request => {
    const defaultPath = resolveDialogDefaultPath(workspacePath, request.defaultPath);
    const parentWindow = request.window || options.getMainWindow();
    const dialogOptions: OpenDialogOptions = {
      title: 'Add files or folders as chat context',
      defaultPath,
      properties: ['openFile', 'openDirectory', 'multiSelections'],
    };
    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const selectedPaths = await Promise.all(
      result.filePaths.map(async filePath => describeSelectedContextPath(filePath)),
    );

    return {
      canceled: false,
      paths: selectedPaths,
    };
  });

  ipcBridge.registerFsHandler('readContext', async request => {
    const requestedPaths = Array.isArray(request.paths) ? request.paths : [];
    const maxFiles = clampPositiveInteger(request.maxFiles, DEFAULT_CONTEXT_MAX_FILES, 64);
    const maxBytes = clampPositiveInteger(request.maxBytes, DEFAULT_CONTEXT_MAX_BYTES, 1_000_000);
    const maxFileBytes = clampPositiveInteger(request.maxFileBytes, DEFAULT_CONTEXT_MAX_FILE_BYTES, 200_000);
    const items: FileContextReadItem[] = [];
    let totalBytes = 0;
    let omittedCount = 0;

    for (const requestedPath of requestedPaths) {
      if (typeof requestedPath !== 'string' || !requestedPath.trim()) {
        omittedCount += 1;
        continue;
      }
      if (items.filter(item => item.type === 'file').length >= maxFiles || totalBytes >= maxBytes) {
        omittedCount += 1;
        continue;
      }

      try {
        const metadata = await describeSelectedContextPath(requestedPath);
        if (metadata.type === 'directory') {
          items.push(metadata);
          const collected = await collectContextFiles(metadata.path, () => maxFiles - items.filter(item => item.type === 'file').length);
          omittedCount += collected.omittedCount;
          for (const filePath of collected.files) {
            if (items.filter(item => item.type === 'file').length >= maxFiles || totalBytes >= maxBytes) {
              omittedCount += 1;
              continue;
            }
            const { item, bytes } = await readContextFile(
              filePath,
              metadata.path,
              maxBytes - totalBytes,
              maxFileBytes,
            );
            items.push(item);
            totalBytes += bytes;
          }
          continue;
        }

        const { item, bytes } = await readContextFile(
          metadata.path,
          metadata.path,
          maxBytes - totalBytes,
          maxFileBytes,
        );
        items.push(item);
        totalBytes += bytes;
      } catch (error) {
        items.push({
          path: path.resolve(requestedPath),
          name: path.basename(requestedPath) || requestedPath,
          type: 'file',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const result: FileContextReadResult = {
      items,
      totalBytes,
      omittedCount,
      truncated: omittedCount > 0 || totalBytes >= maxBytes,
    };
    return result;
  });

  ipcBridge.registerMcpHandler('listServers', async () => {
    return mcpService.listServers();
  });

  ipcBridge.registerMcpHandler('listTools', async () => {
    return mcpService.listTools();
  });

  ipcBridge.registerMcpHandler('refresh', async () => {
    return mcpService.refresh();
  });

  ipcBridge.registerAutomationHandler('listSkills', async () => {
    return automationService.listSkills();
  });

  ipcBridge.registerAutomationHandler('refreshSkills', async () => {
    return automationService.listSkills();
  });

  ipcBridge.registerAutomationHandler('getSkill', async skillId => {
    return automationService.getSkill(String(skillId));
  });

  ipcBridge.registerAutomationHandler('setSkillEnabled', async request => {
    return automationService.setSkillEnabled(String(request.skillId), Boolean(request.enabled));
  });

  ipcBridge.registerAutomationHandler('listTasks', async () => {
    return automationService.listTasks();
  });

  ipcBridge.registerAutomationHandler('listTaskRuns', async taskId => {
    return automationService.listTaskRuns(typeof taskId === 'string' ? taskId : undefined);
  });

  ipcBridge.registerAutomationHandler('saveTask', async task => {
    return automationService.saveTask(task);
  });

  ipcBridge.registerAutomationHandler('setTaskEnabled', async request => {
    return automationService.setTaskEnabled(String(request.taskId), Boolean(request.enabled));
  });

  ipcBridge.registerAutomationHandler('deleteTask', async taskId => {
    return automationService.deleteTask(String(taskId));
  });

  ipcBridge.registerAutomationHandler('runTask', async taskId => {
    const task = await automationService.runTask(String(taskId));
    await historyService.saveRecord({
      id: `automation-run-${task.id}-${task.lastRunAt ?? Date.now()}`,
      type: 'automation-run',
      workspacePath,
      title: task.name,
      data: task,
      createdAt: task.lastRunAt ?? Date.now(),
      updatedAt: task.updatedAt,
    });
    return task;
  });

  ipcBridge.registerAutomationHandler('getSchedulerStatus', async () => {
    return automationService.getSchedulerStatus();
  });

  ipcBridge.registerAutomationHandler('getRemoteControl', async () => {
    return automationService.getRemoteControl();
  });

  ipcBridge.registerAutomationHandler('updateRemoteControl', async update => {
    return automationService.updateRemoteControl(update);
  });

  ipcBridge.registerAutomationHandler('createRemotePairingCode', async deviceName => {
    return automationService.createRemotePairingCode(typeof deviceName === 'string' ? deviceName : undefined);
  });

  ipcBridge.registerAutomationHandler('startRemoteControl', async () => {
    return automationService.updateRemoteControl({ enabled: true, mode: 'local-network' });
  });

  ipcBridge.registerAutomationHandler('stopRemoteControl', async () => {
    return automationService.stopRemoteControlServer();
  });

  ipcBridge.registerAutomationHandler('revokeRemoteDevice', async deviceId => {
    const remote = await automationService.revokeRemoteDevice(String(deviceId));
    await historyService.saveRecord({
      type: 'project-event',
      workspacePath,
      title: 'Remote device revoked',
      data: {
        event: 'remote-device-revoked',
        deviceId: String(deviceId),
      },
    });
    return remote;
  });

  ipcBridge.registerAutomationHandler('listWorkflows', async () => {
    return automationService.listWorkflows();
  });

  ipcBridge.registerAutomationHandler('listWorkflowRuns', async workflowId => {
    return automationService.listWorkflowRuns(typeof workflowId === 'string' ? workflowId : undefined);
  });

  ipcBridge.registerAutomationHandler('saveWorkflow', async workflow => {
    return automationService.saveWorkflow(workflow);
  });

  ipcBridge.registerAutomationHandler('deleteWorkflow', async workflowId => {
    return automationService.deleteWorkflow(String(workflowId));
  });

  ipcBridge.registerAutomationHandler('createDefaultWorkflow', async objective => {
    return automationService.createDefaultWorkflow(typeof objective === 'string' ? objective : undefined);
  });

  ipcBridge.registerAutomationHandler('runWorkflow', async workflowId => {
    const run = await automationService.runWorkflow(String(workflowId));
    await historyService.saveRecord({
      id: `automation-run-${run.id}`,
      type: 'automation-run',
      workspacePath: run.workspacePath ?? workspacePath,
      title: `${run.workflowName} run`,
      data: run,
      createdAt: run.startedAt,
      updatedAt: run.completedAt ?? Date.now(),
    });
    return run;
  });

  // Deprecated IPC adapters for older installed package builds.
  ipcBridge.registerAutomationHandler('listTeams', async () => {
    return automationService.listTeams();
  });

  ipcBridge.registerAutomationHandler('listTeamRuns', async teamId => {
    return automationService.listTeamRuns(typeof teamId === 'string' ? teamId : undefined);
  });

  ipcBridge.registerAutomationHandler('saveTeam', async team => {
    return automationService.saveTeam(team);
  });

  ipcBridge.registerAutomationHandler('deleteTeam', async teamId => {
    return automationService.deleteTeam(String(teamId));
  });

  ipcBridge.registerAutomationHandler('createDefaultTeam', async objective => {
    return automationService.createDefaultTeam(typeof objective === 'string' ? objective : undefined);
  });

  ipcBridge.registerAutomationHandler('runTeam', async teamId => {
    const run = await automationService.runTeam(String(teamId));
    await historyService.saveRecord({
      id: `automation-run-${run.id}`,
      type: 'automation-run',
      workspacePath: run.workspacePath ?? workspacePath,
      title: `${run.workflowName} run`,
      data: run,
      createdAt: run.startedAt,
      updatedAt: run.completedAt ?? Date.now(),
    });
    return run;
  });

  ipcBridge.registerAutomationHandler('exportProjectState', async options => {
    const bundle = await automationService.exportProjectState(options);
    await historyService.saveRecord({
      type: 'project-event',
      workspacePath,
      title: 'Automation project export',
      data: {
        event: 'automation-export',
        includeRuns: options?.includeRuns !== false,
        tasks: bundle.tasks.length,
        teams: bundle.teams.length,
      },
    });
    return bundle;
  });

  ipcBridge.registerAutomationHandler('importProjectState', async bundle => {
    const result = await automationService.importProjectState(bundle);
    await historyService.saveRecord({
      type: 'project-event',
      workspacePath,
      title: 'Automation project import',
      data: {
        event: 'automation-import',
        imported: result.imported,
      },
    });
    return result;
  });

  ipcBridge.registerHistoryHandler('saveRecord', async record => {
    return historyService.saveRecord(record);
  });

  ipcBridge.registerHistoryHandler('getRecord', async id => {
    return historyService.getRecord(String(id));
  });

  ipcBridge.registerHistoryHandler('listRecords', async filter => {
    return historyService.listRecords(filter);
  });

  ipcBridge.registerHistoryHandler('deleteRecord', async id => {
    return historyService.deleteRecord(String(id));
  });

  ipcBridge.registerHistoryHandler('exportRecords', async filter => {
    return historyService.exportRecords(filter);
  });

  ipcBridge.registerHistoryHandler('getStorageInfo', async () => {
    return historyService.getStorageInfo();
  });

  ipcBridge.registerAuthHandler('getToken', async () => {
    return authService.getToken();
  });

  ipcBridge.registerAuthHandler('logout', async () => {
    return authService.logout();
  });

  ipcBridge.registerAuthHandler('setToken', async token => {
    return authService.setToken(token);
  });

  ipcBridge.registerAuthHandler('getPlatformSession', async () => {
    return authService.getPlatformSession();
  });

  ipcBridge.registerAuthHandler('setPlatformSession', async session => {
    return authService.setPlatformSession(session);
  });

  ipcBridge.registerAuthHandler('clearPlatformSession', async () => {
    return authService.clearPlatformSession();
  });

  ipcBridge.registerAppHandler('info', async () => {
    return {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      isDev: options.isDev ?? false,
      workspacePath,
    };
  });

  ipcBridge.registerAppHandler('getConfig', async () => {
    const runtimes = await listInstalledFeaturePackageRuntimes();
    return appStateService.reconcileInstalledFeaturePackages(runtimes);
  });

  ipcBridge.registerAppHandler('setConfig', async config => {
    const current = await appStateService.getConfig();
    const next = { ...current, ...config };
    if (next.llmProvider === 'codeagent') {
      if (!next.model) throw new Error('Select a CodeAgent model before saving.');
      const localModelConfigurationChanged = current.llmProvider !== 'codeagent' ||
        current.model !== next.model ||
        current.contextTokens !== next.contextTokens ||
        current.localGpuLayers !== next.localGpuLayers;
      if (localModelConfigurationChanged) {
        await localModelService.ensureConfigured({
          model: next.model,
          contextTokens: next.contextTokens,
          gpuLayers: next.localGpuLayers,
        });
      }
      config = { ...config, baseUrl: CODEAGENT_LOCAL_BASE_URL };
    } else if (current.llmProvider === 'codeagent') {
      await localModelService.stop();
    }
    const update = await appStateService.setConfig(config);
    apiService.clearBootstrapCache();
    sendToRenderer(options.getMainWindow, IPC_CHANNELS['app:configChanged'], update);
    return update;
  });

  ipcBridge.registerAppHandler('getState', async () => {
    return appStateService.getState();
  });

  ipcBridge.registerAppHandler('setState', async state => {
    const update = await appStateService.setState(state);
    sendToRenderer(options.getMainWindow, IPC_CHANNELS['app:stateChanged'], update);
    return update;
  });

  ipcBridge.registerAppHandler('installFeaturePackage', async (request: FeaturePackageInstallRequest) => {
    if (!request?.manifest || typeof request.manifest !== 'object') {
      throw new Error('Feature package install requires a manifest.');
    }
    const manifest = request.manifest as FeaturePackageManifest;
    if (manifest.distribution?.securityBoundary !== 'signed-local-bundle') {
      throw new Error(`Unsupported feature package security boundary: ${String(manifest.distribution?.securityBoundary || 'missing')}`);
    }
    let result;
    try {
      result = await installSignedPackageArtifact(manifest, request.archivePath, { download: request.download });
    } catch (error) {
      if (!request.download || request.archivePath) {
        throw error;
      }
      // A desktop release can bundle a newer signed runtime before an older
      // platform catalog/artifact has been republished. Prefer the verified
      // bundled archive when the platform download cannot satisfy this
      // manifest instead of leaving the entitled package unusable.
      result = await installSignedPackageArtifact(manifest);
    }
    automationService.unregisterAutomationProvidersForPackage(manifest.id);
    const activated = await activateInstalledFeaturePackageRuntime(manifest.id, runtimeHostOptions);
    if (manifest.entrypoints?.runtime && manifest.supportedShells.includes('desktop') && !activated) {
      throw new Error(`Installed feature package runtime could not be activated: ${manifest.id}`);
    }
    return result;
  });

  ipcBridge.registerAppHandler('uninstallFeaturePackage', async request => {
    if (!request?.manifest || typeof request.manifest !== 'object') {
      throw new Error('Feature package uninstall requires a manifest.');
    }
    const manifest = request.manifest as FeaturePackageManifest;
    const result = await uninstallPackageArtifact(manifest);
    automationService.unregisterAutomationProvidersForPackage(manifest.id);
    return result;
  });

  return {
    toolService,
    apiService,
    filesService,
    authService,
    appStateService,
    mcpService,
    automationService,
    historyService,
    localModelService,
  };
}

function resolveWorkspacePath(value: string | undefined): string {
  const fallback = app.getPath('home');
  const candidate = typeof value === 'string' && value.trim()
    ? path.resolve(value.trim())
    : fallback;

  if (!candidate || candidate === path.parse(candidate).root) {
    return fallback;
  }

  return candidate;
}

function createBridgeTools({
  apiService,
  filesService,
  appStateService,
  mcpService,
  commandService,
  automationService,
  webService,
  financeService,
  getFileServiceForPath,
  getCommandServiceForArgs,
  normalizeRequestedPath,
  requestFileWriteReview,
  requestCommandReview,
}: {
  apiService: ApiServiceBridge;
  filesService: FileSystemServiceBridge;
  appStateService: AppStateServiceBridge;
  mcpService: McpServiceBridge;
  commandService: CommandServiceBridge;
  automationService: AutomationServiceBridge;
  webService: WebServiceBridge;
  financeService: FinanceServiceBridge;
  getFileServiceForPath: (requestedPath: string, toolName: string, toolId: string, requestExternalReview: boolean) => Promise<FileSystemServiceBridge>;
  getCommandServiceForArgs: (args: Record<string, any>) => Promise<CommandServiceBridge>;
  normalizeRequestedPath: (requestedPath: string) => string;
  requestFileWriteReview: (preview: FileWritePreview, toolId: string) => Promise<void>;
  requestCommandReview: (preview: CommandRunPreview, toolId: string) => Promise<void>;
}): BridgeToolDefinition[] {
  const workspacePath = 'the current scoped workspace';

  const tools: BridgeToolDefinition[] = [
    {
      name: 'time.now',
      description: 'Get the current date and time for a requested IANA timezone. Use this for current time/date questions; do not write scripts or files to answer those questions.',
      source: 'bridge',
      readOnly: true,
      inputSchema: {
        type: 'object',
        properties: {
          timezone: {
            type: 'string',
            description: 'IANA timezone such as America/New_York. Defaults to the local system timezone.',
          },
          locale: {
            type: 'string',
            description: 'Optional locale such as en-US.',
          },
        },
      },
      execute: async args => formatCurrentTime(args.timezone as string | undefined, args.locale as string | undefined),
    },
    {
      name: 'web.probe',
      description: 'Check whether an http/https URL can be reached and distinguish network reachability from HTTP route validity. Use this for availability, connectivity, health, or "is this URL reachable" questions. Any returned HTTP status, including 4xx or 5xx, proves the server was reached; routeAvailable and httpOk describe the requested route separately. Read-only.',
      source: 'bridge',
      readOnly: true,
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string' },
        },
        required: ['url'],
      },
      execute: args => webService.probe(args),
    },
    {
      name: 'web.search',
      description: 'Search the public web for current or external facts. This is a discovery tool that returns links/snippets. If the snippets do not directly answer the question, continue with web.fetch or web.research before answering. Read-only.',
      source: 'bridge',
      readOnly: true,
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          maxResults: { type: 'number' },
        },
        required: ['query'],
      },
      execute: args => webService.search(args),
    },
    {
      name: 'web.research',
      description: 'Research a public-web question by searching and fetching readable text from top results in one call. Use this for general current/external questions when a direct structured tool does not exist. Answer from the fetched source text instead of returning only links. Read-only.',
      source: 'bridge',
      readOnly: true,
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          maxResults: { type: 'number' },
          maxCharsPerPage: { type: 'number' },
        },
        required: ['query'],
      },
      execute: args => webService.research(args),
    },
    {
      name: 'web.fetch',
      description: 'Fetch an http/https URL and return its HTTP status and readable content. Use web.probe instead when the question is whether a URL or service is reachable. A returned 4xx or 5xx status still means the server was reached; it does not by itself mean a network failure. Read-only.',
      source: 'bridge',
      readOnly: true,
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string' },
          maxChars: { type: 'number' },
        },
        required: ['url'],
      },
      execute: args => webService.fetchPage(args),
    },
    {
      name: 'finance.quote',
      description: 'Get a structured current/delayed quote for a stock, ETF, index, or Yahoo Finance-compatible symbol. Use this for stock price questions before web.search. Accepts ticker symbols like CSCO or company queries like Cisco. Read-only.',
      source: 'bridge',
      readOnly: true,
      inputSchema: {
        type: 'object',
        properties: {
          symbol: {
            type: 'string',
            description: 'Ticker symbol or company query, for example CSCO or Cisco.',
          },
          query: {
            type: 'string',
            description: 'Alternative company/security search query if no ticker is known.',
          },
        },
      },
      execute: args => financeService.quote(args),
    },
    {
      name: 'bash.run',
      description: `Run one supported non-interactive command in the current workspace (${workspacePath}) by default. An external absolute cwd is governed by the desktop permission profile and may require user approval. Use for inspecting files, running tests, and checking project state. Do not use for simple time/date or public web questions. Shell operators, home-directory shorthand, and destructive commands are blocked.`,
      source: 'bridge',
      readOnly: false,
      customReview: true,
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          cwd: { type: 'string' },
          timeoutMs: { type: 'number' },
        },
        required: ['command'],
      },
      execute: async (args, context) => {
        const scopedCommandService = await getCommandServiceForArgs(args);
        const preview = scopedCommandService.createRunPreview(args);
        await requestCommandReview(preview, context.toolId);
        return scopedCommandService.runCommand(args);
      },
    },
    {
      name: 'fs.read',
      description: `Read a file in the current workspace (${workspacePath}) by default. Use workspace-relative paths for workspace files. External absolute paths and the current user's ~ home shorthand are governed by the desktop permission profile and may require user approval.`,
      source: 'bridge',
      readOnly: true,
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          encoding: { type: 'string' },
        },
        required: ['path'],
      },
      execute: async (args, context) => {
        const requestedPath = normalizeRequestedPath(String(args.path));
        const service = await getFileServiceForPath(requestedPath, 'fs.read', context.toolId, true);
        return service.readFile(requestedPath, args.encoding as BufferEncoding | undefined);
      },
    },
    {
      name: 'fs.write',
      description: `Write a file in the current workspace (${workspacePath}) by default. Use workspace-relative paths for workspace files. External absolute paths and the current user's ~ home shorthand are governed by the desktop permission profile and may require user approval.`,
      source: 'bridge',
      readOnly: false,
      customReview: true,
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
          encoding: { type: 'string' },
        },
        required: ['path', 'content'],
      },
      execute: async (args, context) => {
        if (typeof args.path !== 'string' || !args.path.trim()) {
          throw new Error('fs.write requires a non-empty string path.');
        }
        if (typeof args.content !== 'string') {
          throw new Error('fs.write requires string content.');
        }
        const targetPath = normalizeRequestedPath(args.path);
        const scopedFilesService = await getFileServiceForPath(targetPath, 'fs.write', context.toolId, false);
        const content = args.content;
        const encoding = args.encoding as BufferEncoding | undefined;
        const preview = await scopedFilesService.createWritePreview(targetPath, content, encoding);

        await requestFileWriteReview(preview, context.toolId);

        return scopedFilesService.writeFileWithCheckpoint(targetPath, content, encoding);
      },
    },
    {
      name: 'fs.undoLastWrite',
      description: `Restore the most recent desktop filesystem write checkpoint inside the current workspace (${workspacePath}). Use only when the user explicitly asks to undo the latest write.`,
      source: 'bridge',
      readOnly: false,
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: async (_args, context) => {
        const service = await getFileServiceForPath('.', 'fs.undoLastWrite', context.toolId, false);
        return service.restoreLastWriteCheckpoint();
      },
    },
    {
      name: 'fs.list',
      description: `List a directory in the current workspace (${workspacePath}) by default. Use "." for the current scoped workspace root and workspace-relative paths for its children; do not repeat the workspace folder name as a child path. Pass an external absolute path or the current user's ~ home shorthand exactly when the human explicitly requests that external path; the runtime expands ~ without a shell, then the desktop permission profile will allow access, request approval, or return a scope error. A successful result confirms that the resolved directory exists; an empty entries array means it exists and is empty.`,
      source: 'bridge',
      readOnly: true,
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          offset: { type: 'integer', minimum: 0, description: 'Zero-based entry offset for large directories. Defaults to 0.' },
          limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Maximum entries to return. Defaults to 100 and is capped at 200.' },
        },
        required: ['path'],
      },
      execute: async (args, context) => {
        const requestedPath = normalizeRequestedPath(String(args.path ?? '.'));
        const scopedFileService = await getFileServiceForPath(requestedPath, 'fs.list', context.toolId, true);
        const absolutePath = scopedFileService.resolveWorkspacePath(requestedPath);
        const allEntries = (await scopedFileService.listDirectory(requestedPath))
          .sort((left, right) => left.name.localeCompare(right.name));
        const offset = Math.max(0, Math.floor(Number(args.offset) || 0));
        const limit = Math.min(200, Math.max(1, Math.floor(Number(args.limit) || 100)));
        const entries = allEntries
          .slice(offset, offset + limit)
          .map(entry => ({ name: entry.name, type: entry.type }));
        const returnedCount = entries.length;
        const nextOffset = offset + returnedCount;
        return {
          path: requestedPath,
          absolutePath,
          exists: true,
          empty: allEntries.length === 0,
          totalCount: allEntries.length,
          offset,
          returnedCount,
          omittedCount: Math.max(0, allEntries.length - nextOffset),
          truncated: nextOffset < allEntries.length,
          nextOffset: nextOffset < allEntries.length ? nextOffset : null,
          entries,
        };
      },
    },
    {
      name: 'api.chat',
      description: 'Send a chat request to the configured API client',
      source: 'bridge',
      readOnly: true,
      inputSchema: {
        type: 'object',
        properties: {
          messages: { type: 'array' },
          model: { type: 'string' },
          maxTokens: { type: 'number' },
          temperature: { type: 'number' },
        },
        required: ['messages'],
      },
      execute: args => apiService.chat({
        messages: Array.isArray(args.messages) ? args.messages as any : [],
        model: args.model as string | undefined,
        maxTokens: args.maxTokens as number | undefined,
        temperature: args.temperature as number | undefined,
      }),
    },
    {
      name: 'app.getConfig',
      description: 'Read desktop app configuration',
      source: 'bridge',
      readOnly: true,
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: () => appStateService.getConfig(),
    },
    {
      name: 'automation.listSkills',
      description: 'List local workspace skills discovered from .code-agent/skills and skills directories. Read-only.',
      source: 'bridge',
      readOnly: true,
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: () => automationService.listSkills(),
    },
    {
      name: 'automation.listTasks',
      description: 'List configured scheduled automation tasks for this workspace. Read-only.',
      source: 'bridge',
      readOnly: true,
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: () => automationService.listTasks(),
    },
    {
      name: 'automation.listTaskRuns',
      description: 'List recent scheduled automation task run history. Read-only.',
      source: 'bridge',
      readOnly: true,
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
        },
      },
      execute: args => automationService.listTaskRuns(typeof args.taskId === 'string' ? args.taskId : undefined),
    },
    {
      name: 'automation.schedulerStatus',
      description: 'Read the local scheduled task runtime status. Read-only.',
      source: 'bridge',
      readOnly: true,
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: async () => automationService.getSchedulerStatus(),
    },
    {
      name: 'automation.remoteStatus',
      description: 'Read local remote-control pairing and approval status. Read-only.',
      source: 'bridge',
      readOnly: true,
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: () => automationService.getRemoteControl(),
    },
    {
      name: 'automation.listWorkflows',
      description: 'List package-defined automation workflows configured for this workspace. Read-only.',
      source: 'bridge',
      readOnly: true,
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: () => automationService.listWorkflows(),
    },
    {
      name: 'automation.listWorkflowRuns',
      description: 'List recent automation workflow runs and artifact paths. Read-only.',
      source: 'bridge',
      readOnly: true,
      inputSchema: {
        type: 'object',
        properties: {
          workflowId: { type: 'string' },
        },
      },
      execute: args => automationService.listWorkflowRuns(typeof args.workflowId === 'string' ? args.workflowId : undefined),
    },
    {
      name: 'automation.listTeams',
      description: 'Deprecated alias for automation.listWorkflows. Read-only.',
      source: 'bridge',
      readOnly: true,
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: () => automationService.listTeams(),
    },
    {
      name: 'automation.listTeamRuns',
      description: 'Deprecated alias for automation.listWorkflowRuns. Read-only.',
      source: 'bridge',
      readOnly: true,
      inputSchema: {
        type: 'object',
        properties: {
          teamId: { type: 'string' },
        },
      },
      execute: args => automationService.listTeamRuns(typeof args.teamId === 'string' ? args.teamId : undefined),
    },
    {
      name: 'mcp.listServers',
      description: 'List configured MCP servers, including connection status and unsupported transport errors. Read-only.',
      source: 'bridge',
      readOnly: true,
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: () => mcpService.listServers(),
    },
    {
      name: 'mcp.listTools',
      description: 'List executable tools discovered from connected stdio MCP servers. Read-only.',
      source: 'bridge',
      readOnly: true,
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: () => mcpService.listTools(),
    },
    {
      name: 'mcp.callTool',
      description: 'Call a specific tool on a connected stdio MCP server. Use mcp.listTools first to identify serverName and toolName. Tool safety depends on the MCP server and requested tool.',
      source: 'bridge',
      readOnly: false,
      inputSchema: {
        type: 'object',
        properties: {
          serverName: {
            type: 'string',
            description: 'MCP server name, or scope:name when disambiguation is needed.',
          },
          toolName: {
            type: 'string',
            description: 'Tool name as reported by mcp.listTools.',
          },
          arguments: {
            type: 'object',
            description: 'Arguments to pass to the MCP tool.',
          },
        },
        required: ['serverName', 'toolName'],
      },
      execute: args => mcpService.callTool(
        String(args.serverName ?? ''),
        String(args.toolName ?? args.name ?? ''),
        args.arguments && typeof args.arguments === 'object' && !Array.isArray(args.arguments)
          ? args.arguments as Record<string, any>
          : {},
      ),
    },
  ];

  return tools.map(tool => ({
    ...tool,
    owner: {
      kind: 'core',
      id: 'codeagent-core',
      name: 'CodeAgent',
    },
  }));
}

function formatCurrentTime(timezone?: string, locale = 'en-US'): {
  timezone: string;
  locale: string;
  iso: string;
  unixMs: number;
  formatted: string;
} {
  const now = new Date();
  const resolvedTimezone = timezone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat(locale || 'en-US', {
      timeZone: resolvedTimezone,
      dateStyle: 'full',
      timeStyle: 'long',
    });
  } catch (error) {
    throw new Error(`Invalid timezone or locale: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    timezone: resolvedTimezone,
    locale: locale || 'en-US',
    iso: now.toISOString(),
    unixMs: now.getTime(),
    formatted: formatter.format(now),
  };
}

function buildSkillContext(skills: SkillDetail[]): string {
  if (skills.length === 0) {
    return 'No enabled workspace skills are currently available.';
  }

  return skills.map(skill => [
    `## ${skill.name}`,
    `Source: ${skill.source}`,
    `Path: ${skill.path}`,
    skill.description ? `Description: ${skill.description}` : '',
    '',
    skill.content,
  ].filter(Boolean).join('\n')).join('\n\n---\n\n');
}

function buildScheduledTaskPrompt(task: ScheduledTask, skills: SkillDetail[], workspacePath: string): string {
  return [
    'You are running a scheduled CodeAgent automation task.',
    '',
    `Workspace: ${workspacePath}`,
    `Task name: ${task.name}`,
    `Task id: ${task.id}`,
    `Interval minutes: ${task.intervalMinutes}`,
    '',
    'Enabled workspace skills:',
    buildSkillContext(skills),
    '',
    'Task prompt:',
    task.prompt,
    '',
    'Execution rules:',
    '- Use read-only tools first when possible.',
    '- Use file writes, Bash, or MCP tools only when they are necessary for this task.',
    '- If a risky action needs approval, request it through the normal tool flow and wait.',
    '- Finish with a concise run summary, files changed, commands run, and any follow-up needed.',
  ].join('\n');
}
