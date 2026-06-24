/**
 * Main-process service registration for Electron IPC.
 */

import { app, BrowserWindow } from 'electron';
import { IpcBridge } from './bridge';
import { IPC_CHANNELS, type ChatStreamRequest, type ToolExecuteMessage } from './types';
import {
  ToolServiceBridge,
  type BridgeToolDefinition,
  ApiServiceBridge,
  FileSystemServiceBridge,
  AuthServiceBridge,
  AppStateServiceBridge,
  McpServiceBridge,
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
  const apiService = new ApiServiceBridge();
  const filesService = new FileSystemServiceBridge(options.cwd ?? process.cwd());
  const authService = new AuthServiceBridge(options.keytar);
  const appStateService = new AppStateServiceBridge();
  const mcpService = new McpServiceBridge(options.cwd ?? process.cwd());
  const toolService = new ToolServiceBridge(
    createBridgeTools({
      apiService,
      filesService,
      appStateService,
      mcpService,
    }),
  );

  apiService.setAuthTokenProvider(provider => authService.getToken(provider));
  apiService.setAppConfigProvider(() => appStateService.getConfig());
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
      features: {
        tools: tools.length > 0,
        mcp: mcpServers.length > 0 || mcpTools.length > 0,
        proactive: false,
        buddy: false,
      },
    };
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
    };
  });

  ipcBridge.registerAppHandler('getConfig', async () => {
    return appStateService.getConfig();
  });

  ipcBridge.registerAppHandler('setConfig', async config => {
    return appStateService.setConfig(config);
  });

  ipcBridge.registerAppHandler('getState', async () => {
    return appStateService.getState();
  });

  ipcBridge.registerAppHandler('setState', async state => {
    return appStateService.setState(state);
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
}: {
  apiService: ApiServiceBridge;
  filesService: FileSystemServiceBridge;
  appStateService: AppStateServiceBridge;
  mcpService: McpServiceBridge;
}): BridgeToolDefinition[] {
  return [
    {
      name: 'fs.read',
      description: 'Read a workspace file',
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
      description: 'Write a workspace file',
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
      execute: args => filesService.writeFile(
        String(args.path),
        String(args.content ?? ''),
        args.encoding as BufferEncoding | undefined,
      ),
    },
    {
      name: 'fs.list',
      description: 'List a workspace directory',
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
      description: 'List configured MCP servers',
      source: 'bridge',
      readOnly: true,
      inputSchema: {
        type: 'object',
        properties: {},
      },
      execute: () => mcpService.listServers(),
    },
  ];
}
