/**
 * Main-process service registration for Electron IPC.
 */

import { app, BrowserWindow, shell } from 'electron';
import { IpcBridge } from './bridge';
import {
  IPC_CHANNELS,
  type ChatStreamRequest,
  type CommandReviewResponse,
  type FileWritePreview,
  type FileWriteReviewResponse,
  type ToolPermissionMode,
  type ToolPermissionReviewResponse,
  type ToolExecuteMessage,
} from './types';
import {
  ToolServiceBridge,
  type BridgeToolDefinition,
  ApiServiceBridge,
  FileSystemServiceBridge,
  AuthServiceBridge,
  AppStateServiceBridge,
  CommandServiceBridge,
  type CommandRunPreview,
  FinanceServiceBridge,
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
  const workspacePath = options.cwd ?? process.cwd();
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

  function requestFileWriteReview(preview: FileWritePreview, toolId: string): Promise<void> {
    const window = options.getMainWindow();
    if (!window || window.isDestroyed()) {
      throw new Error('File write review requires an active desktop window.');
    }

    const requestId = createFileWriteReviewId();
    const payload = {
      ...preview,
      requestId,
      toolId,
      createdAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingFileWriteReviews.delete(requestId);
        reject(new Error(`File write review timed out for ${preview.path}`));
      }, 5 * 60 * 1000);

      pendingFileWriteReviews.set(requestId, { resolve, reject, timeout });
      window.webContents.send(IPC_CHANNELS['tool:fileWriteReview'], payload);
    });
  }

  function requestCommandReview(preview: CommandRunPreview, toolId: string): Promise<void> {
    const window = options.getMainWindow();
    if (!window || window.isDestroyed()) {
      throw new Error('Command review requires an active desktop window.');
    }

    const requestId = createCommandReviewId();
    const payload = {
      ...preview,
      requestId,
      toolId,
      createdAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingCommandReviews.delete(requestId);
        reject(new Error(`Command review timed out for ${preview.command}`));
      }, 5 * 60 * 1000);

      pendingCommandReviews.set(requestId, { resolve, reject, timeout });
      window.webContents.send(IPC_CHANNELS['tool:commandReview'], payload);
    });
  }

  function requestToolPermissionReview(
    toolName: string,
    args: Record<string, any>,
    toolId: string,
  ): Promise<void> {
    const window = options.getMainWindow();
    if (!window || window.isDestroyed()) {
      throw new Error('Tool permission review requires an active desktop window.');
    }

    const requestId = createToolPermissionReviewId();
    const payload = {
      requestId,
      toolId,
      toolName,
      args,
      createdAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingToolPermissionReviews.delete(requestId);
        reject(new Error(`Tool permission review timed out for ${toolName}`));
      }, 5 * 60 * 1000);

      pendingToolPermissionReviews.set(requestId, { resolve, reject, timeout });
      window.webContents.send(IPC_CHANNELS['tool:permissionReview'], payload);
    });
  }

  function normalizePermissionMode(value: unknown): ToolPermissionMode | undefined {
    return value === 'allow' || value === 'ask' || value === 'deny' ? value : undefined;
  }

  const apiService = new ApiServiceBridge(undefined, workspacePath);
  const filesService = new FileSystemServiceBridge(workspacePath);
  const authService = new AuthServiceBridge(options.keytar);
  const appStateService = new AppStateServiceBridge();
  const mcpService = new McpServiceBridge(workspacePath);
  const commandService = new CommandServiceBridge(workspacePath);
  const webService = new WebServiceBridge();
  const financeService = new FinanceServiceBridge();
  const toolService = new ToolServiceBridge(
    createBridgeTools({
      apiService,
      filesService,
      appStateService,
      mcpService,
      commandService,
      webService,
      financeService,
      requestFileWriteReview,
      requestCommandReview,
    }),
  );

  apiService.setAuthTokenProvider(provider => authService.getToken(provider));
  apiService.setAppConfigProvider(() => appStateService.getConfig());
  apiService.setToolProvider(
    () => toolService.getTools(),
    (toolName, args) => toolService.executeToolAndReturn(toolName, args, createToolId()),
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
        authenticated: config.llmProvider === 'openai-compatible' ||
          Boolean(await authService.getToken(config.llmProvider ?? 'anthropic')),
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

  toolService.setStartHandler((toolId: string, toolName: string, args: Record<string, any>) => {
    sendToRenderer(options.getMainWindow, IPC_CHANNELS['tool:start'], {
      toolId,
      toolName,
      args,
      timestamp: Date.now(),
    });
  });

  toolService.setResultHandler((toolId: string, data: any) => {
    sendToRenderer(options.getMainWindow, IPC_CHANNELS['tool:result'], {
      toolId,
      data,
      timestamp: Date.now(),
    });
  });

  toolService.setCompleteHandler((toolId: string, success: boolean, duration: number) => {
    sendToRenderer(options.getMainWindow, IPC_CHANNELS['tool:complete'], {
      toolId,
      success,
      duration,
    });
  });

  toolService.setErrorHandler((toolId: string, error: string, stack?: string) => {
    sendToRenderer(options.getMainWindow, IPC_CHANNELS['tool:error'], {
      toolId,
      error,
      stack,
    });
  });

  toolService.setPermissionPolicyProvider(async tool => {
    const config = await appStateService.getConfig();
    const policies = config.toolPermissionPolicies ?? {};
    return normalizePermissionMode(policies[tool.name]) ?? 'allow';
  });

  toolService.setPermissionReviewHandler((tool, args, context) => {
    return requestToolPermissionReview(tool.name, args, context.toolId);
  });

  ipcBridge.registerToolHandler('execute', async (message: ToolExecuteMessage) => {
    const toolId = message.toolId ?? createToolId();

    toolService.executeTool(message.toolName, message.args ?? {}, toolId).catch(error => {
      console.error('Tool execution error:', error);
    });

    return { toolId };
  });

  ipcBridge.registerToolHandler('list', async () => {
    return toolService.getTools();
  });

  ipcBridge.registerToolHandler('fileWriteReviewResponse', async (response: FileWriteReviewResponse) => {
    const pending = pendingFileWriteReviews.get(response.requestId);
    if (!pending) {
      return { ok: false };
    }

    pendingFileWriteReviews.delete(response.requestId);
    clearTimeout(pending.timeout);

    if (response.approved) {
      pending.resolve();
    } else {
      pending.reject(new Error(response.reason || 'File write rejected by user.'));
    }

    return { ok: true };
  });

  ipcBridge.registerToolHandler('commandReviewResponse', async (response: CommandReviewResponse) => {
    const pending = pendingCommandReviews.get(response.requestId);
    if (!pending) {
      return { ok: false };
    }

    pendingCommandReviews.delete(response.requestId);
    clearTimeout(pending.timeout);

    if (response.approved) {
      pending.resolve();
    } else {
      pending.reject(new Error(response.reason || 'Command rejected by user.'));
    }

    return { ok: true };
  });

  ipcBridge.registerToolHandler('permissionReviewResponse', async (response: ToolPermissionReviewResponse) => {
    const pending = pendingToolPermissionReviews.get(response.requestId);
    if (!pending) {
      return { ok: false };
    }

    pendingToolPermissionReviews.delete(response.requestId);
    clearTimeout(pending.timeout);

    if (response.approved) {
      pending.resolve();
    } else {
      pending.reject(new Error(response.reason || 'Tool call rejected by user.'));
    }

    return { ok: true };
  });

  ipcBridge.registerApiHandler('chat', async request => {
    return apiService.chat(request);
  });

  ipcBridge.registerApiHandler('chatStream', async (request: ChatStreamRequest) => {
    const requestId = request.requestId ?? createChatRequestId();
    const startTime = Date.now();

    apiService.streamChat(request, {
      onDelta: delta => {
        sendToRenderer(options.getMainWindow, IPC_CHANNELS['api:chatDelta'], {
          requestId,
          delta,
          timestamp: Date.now(),
        });
      },
    }).then(response => {
      sendToRenderer(options.getMainWindow, IPC_CHANNELS['api:chatComplete'], {
        requestId,
        response,
        duration: Date.now() - startTime,
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

  ipcBridge.registerMcpHandler('listServers', async () => {
    return mcpService.listServers();
  });

  ipcBridge.registerMcpHandler('listTools', async () => {
    return mcpService.listTools();
  });

  ipcBridge.registerMcpHandler('refresh', async () => {
    return mcpService.refresh();
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
    return appStateService.getConfig();
  });

  ipcBridge.registerAppHandler('setConfig', async config => {
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

  return {
    toolService,
    apiService,
    filesService,
    authService,
    appStateService,
    mcpService,
  };
}

function createBridgeTools({
  apiService,
  filesService,
  appStateService,
  mcpService,
  commandService,
  webService,
  financeService,
  requestFileWriteReview,
  requestCommandReview,
}: {
  apiService: ApiServiceBridge;
  filesService: FileSystemServiceBridge;
  appStateService: AppStateServiceBridge;
  mcpService: McpServiceBridge;
  commandService: CommandServiceBridge;
  webService: WebServiceBridge;
  financeService: FinanceServiceBridge;
  requestFileWriteReview: (preview: FileWritePreview, toolId: string) => Promise<void>;
  requestCommandReview: (preview: CommandRunPreview, toolId: string) => Promise<void>;
}): BridgeToolDefinition[] {
  const workspacePath = filesService.getBasePath();

  return [
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
      description: 'Fetch a public http/https URL and return readable text. Use after web.search when page details are needed, or use web.research to combine search and fetch. Read-only.',
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
      description: `Run one approved non-interactive command inside the current workspace (${workspacePath}). Use for inspecting files, running tests, and checking project state. Do not use for simple time/date or public web questions. Shell operators, home-directory cwd paths, and destructive commands are blocked.`,
      source: 'bridge',
      readOnly: false,
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
        const preview = commandService.createRunPreview(args);
        await requestCommandReview(preview, context.toolId);
        return commandService.runCommand(args);
      },
    },
    {
      name: 'fs.read',
      description: `Read a file inside the current workspace (${workspacePath}). Use workspace-relative paths, not home-directory paths.`,
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
      execute: args => filesService.readFile(String(args.path), args.encoding as BufferEncoding | undefined),
    },
    {
      name: 'fs.write',
      description: `Write a file inside the current workspace (${workspacePath}). Use workspace-relative paths, not home-directory paths.`,
      source: 'bridge',
      readOnly: false,
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
        const targetPath = String(args.path);
        const content = String(args.content ?? '');
        const encoding = args.encoding as BufferEncoding | undefined;
        const preview = await filesService.createWritePreview(targetPath, content, encoding);

        await requestFileWriteReview(preview, context.toolId);

        return filesService.writeFileWithCheckpoint(targetPath, content, encoding);
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
      execute: () => filesService.restoreLastWriteCheckpoint(),
    },
    {
      name: 'fs.list',
      description: `List a directory inside the current workspace (${workspacePath}). Use workspace-relative paths, not home-directory paths.`,
      source: 'bridge',
      readOnly: true,
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
      },
      execute: args => filesService.listDirectory(String(args.path ?? '.')),
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
