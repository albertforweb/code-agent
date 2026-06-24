/**
 * IPC Bridge
 * Orchestrates communication between main and renderer processes
 */

import { ipcMain, BrowserWindow } from 'electron';
import type {
  ToolExecuteMessage,
  ToolExecuteResponse,
  ChatRequest,
  ChatResponse,
  FileReadRequest,
  FileWriteRequest,
  FileListRequest,
  AppConfig,
  AppInfo,
  AuthToken,
  Tool,
  McpServerInfo,
  McpToolInfo,
} from './types';
import { IPC_CHANNELS } from './types';

export class IpcBridge {
  private toolHandlers: Map<string, (args: any) => Promise<any>> = new Map();
  private apiHandlers: Map<string, (args: any) => Promise<any>> = new Map();
  private fsHandlers: Map<string, (args: any) => Promise<any>> = new Map();
  private authHandlers: Map<string, (args: any) => Promise<any>> = new Map();
  private appHandlers: Map<string, (args: any) => Promise<any>> = new Map();
  private mcpHandlers: Map<string, (args: any) => Promise<any>> = new Map();

  constructor() {
    this.setupChannelHandlers();
  }

  /**
   * Register all IPC channel handlers
   */
  private setupChannelHandlers() {
    // Tool channels
    ipcMain.handle(IPC_CHANNELS['tool:execute'], this.handleToolExecute.bind(this));
    ipcMain.handle(IPC_CHANNELS['tool:list'], this.handleToolList.bind(this));

    // API channels
    ipcMain.handle(IPC_CHANNELS['api:chat'], this.handleApiChat.bind(this));
    ipcMain.handle(IPC_CHANNELS['api:fetchBootstrap'], this.handleFetchBootstrap.bind(this));

    // MCP channels
    ipcMain.handle(IPC_CHANNELS['mcp:listServers'], this.handleMcpListServers.bind(this));
    ipcMain.handle(IPC_CHANNELS['mcp:listTools'], this.handleMcpListTools.bind(this));
    ipcMain.handle(IPC_CHANNELS['mcp:refresh'], this.handleMcpRefresh.bind(this));

    // File system channels
    ipcMain.handle(IPC_CHANNELS['fs:read'], this.handleFileRead.bind(this));
    ipcMain.handle(IPC_CHANNELS['fs:write'], this.handleFileWrite.bind(this));
    ipcMain.handle(IPC_CHANNELS['fs:list'], this.handleFileList.bind(this));

    // Auth channels
    ipcMain.handle(IPC_CHANNELS['auth:getToken'], this.handleGetToken.bind(this));
    ipcMain.handle(IPC_CHANNELS['auth:logout'], this.handleLogout.bind(this));
    ipcMain.handle(IPC_CHANNELS['auth:setToken'], this.handleSetToken.bind(this));

    // App state channels
    ipcMain.handle(IPC_CHANNELS['app:info'], this.handleGetInfo.bind(this));
    ipcMain.handle(IPC_CHANNELS['app:getConfig'], this.handleGetConfig.bind(this));
    ipcMain.handle(IPC_CHANNELS['app:setConfig'], this.handleSetConfig.bind(this));
    ipcMain.handle(IPC_CHANNELS['app:getState'], this.handleGetState.bind(this));
    ipcMain.handle(IPC_CHANNELS['app:setState'], this.handleSetState.bind(this));

    // Window channels
    ipcMain.handle(IPC_CHANNELS['window:minimize'], this.handleWindowMinimize.bind(this));
    ipcMain.handle(IPC_CHANNELS['window:maximize'], this.handleWindowMaximize.bind(this));
    ipcMain.handle(IPC_CHANNELS['window:close'], this.handleWindowClose.bind(this));
    ipcMain.handle(IPC_CHANNELS['window:devtools'], this.handleWindowDevtools.bind(this));
  }

  // ============================================================================
  // TOOL HANDLERS
  // ============================================================================

  private async handleToolExecute(_event: any, message: ToolExecuteMessage): Promise<ToolExecuteResponse> {
    if (!message?.toolName || typeof message.toolName !== 'string') {
      throw new Error('Invalid tool execution request: toolName is required');
    }

    const handler = this.toolHandlers.get('execute');
    if (!handler) {
      throw new Error('Tool execution handler not configured');
    }
    return handler(message);
  }

  private async handleToolList() {
    const handler = this.toolHandlers.get('list');
    if (!handler) {
      throw new Error('Tool list handler not configured');
    }
    return handler({});
  }

  // ============================================================================
  // API HANDLERS
  // ============================================================================

  private async handleApiChat(event: any, request: ChatRequest): Promise<ChatResponse> {
    const handler = this.apiHandlers.get('chat');
    if (!handler) {
      throw new Error('API handler not configured');
    }
    return handler(request);
  }

  private async handleFetchBootstrap() {
    const handler = this.apiHandlers.get('bootstrap');
    if (!handler) {
      throw new Error('Bootstrap handler not configured');
    }
    return handler({});
  }

  // ============================================================================
  // FILE SYSTEM HANDLERS
  // ============================================================================

  private async handleFileRead(event: any, request: FileReadRequest) {
    const handler = this.fsHandlers.get('read');
    if (!handler) {
      throw new Error('File system handler not configured');
    }
    return handler(request);
  }

  private async handleFileWrite(event: any, request: FileWriteRequest) {
    const handler = this.fsHandlers.get('write');
    if (!handler) {
      throw new Error('File system handler not configured');
    }
    return handler(request);
  }

  private async handleFileList(event: any, request: FileListRequest) {
    const handler = this.fsHandlers.get('list');
    if (!handler) {
      throw new Error('File system handler not configured');
    }
    return handler(request);
  }

  // ============================================================================
  // AUTH HANDLERS
  // ============================================================================

  private async handleGetToken() {
    const handler = this.authHandlers.get('getToken');
    if (!handler) {
      throw new Error('Auth handler not configured');
    }
    return handler({});
  }

  private async handleLogout() {
    const handler = this.authHandlers.get('logout');
    if (!handler) {
      throw new Error('Auth handler not configured');
    }
    return handler({});
  }

  private async handleSetToken(event: any, token: AuthToken) {
    const handler = this.authHandlers.get('setToken');
    if (!handler) {
      throw new Error('Auth handler not configured');
    }
    return handler(token);
  }

  // ============================================================================
  // APP STATE HANDLERS
  // ============================================================================

  private async handleGetInfo(): Promise<AppInfo> {
    const handler = this.appHandlers.get('info');
    if (!handler) {
      throw new Error('App info handler not configured');
    }
    return handler({});
  }

  // ============================================================================
  // MCP HANDLERS
  // ============================================================================

  private async handleMcpListServers(): Promise<McpServerInfo[]> {
    const handler = this.mcpHandlers.get('listServers');
    if (!handler) {
      throw new Error('MCP server list handler not configured');
    }
    return handler({});
  }

  private async handleMcpListTools(): Promise<McpToolInfo[]> {
    const handler = this.mcpHandlers.get('listTools');
    if (!handler) {
      throw new Error('MCP tool list handler not configured');
    }
    return handler({});
  }

  private async handleMcpRefresh(): Promise<McpServerInfo[]> {
    const handler = this.mcpHandlers.get('refresh');
    if (!handler) {
      throw new Error('MCP refresh handler not configured');
    }
    return handler({});
  }

  private async handleGetConfig() {
    const handler = this.appHandlers.get('getConfig');
    if (!handler) {
      throw new Error('App handler not configured');
    }
    return handler({});
  }

  private async handleSetConfig(event: any, config: AppConfig) {
    const handler = this.appHandlers.get('setConfig');
    if (!handler) {
      throw new Error('App handler not configured');
    }
    return handler(config);
  }

  private async handleGetState() {
    const handler = this.appHandlers.get('getState');
    if (!handler) {
      throw new Error('App handler not configured');
    }
    return handler({});
  }

  private async handleSetState(event: any, state: any) {
    const handler = this.appHandlers.get('setState');
    if (!handler) {
      throw new Error('App handler not configured');
    }
    return handler(state);
  }

  // ============================================================================
  // WINDOW HANDLERS
  // ============================================================================

  private async handleWindowMinimize() {
    const window = BrowserWindow.getFocusedWindow();
    if (window) {
      window.minimize();
    }
  }

  private async handleWindowMaximize() {
    const window = BrowserWindow.getFocusedWindow();
    if (window) {
      if (window.isMaximized()) {
        window.unmaximize();
      } else {
        window.maximize();
      }
    }
  }

  private async handleWindowClose() {
    const window = BrowserWindow.getFocusedWindow();
    if (window) {
      window.close();
    }
  }

  private async handleWindowDevtools() {
    const window = BrowserWindow.getFocusedWindow();
    if (window) {
      window.webContents.openDevTools();
    }
  }

  // ============================================================================
  // HANDLER REGISTRATION
  // ============================================================================

  registerToolHandler(operation: string, handler: (args: any) => Promise<any>) {
    this.toolHandlers.set(operation, handler);
  }

  registerApiHandler(apiName: string, handler: (args: any) => Promise<any>) {
    this.apiHandlers.set(apiName, handler);
  }

  registerFsHandler(operation: string, handler: (args: any) => Promise<any>) {
    this.fsHandlers.set(operation, handler);
  }

  registerMcpHandler(operation: string, handler: (args: any) => Promise<any>) {
    this.mcpHandlers.set(operation, handler);
  }

  registerAuthHandler(operation: string, handler: (args: any) => Promise<any>) {
    this.authHandlers.set(operation, handler);
  }

  registerAppHandler(operation: string, handler: (args: any) => Promise<any>) {
    this.appHandlers.set(operation, handler);
  }

  // ============================================================================
  // EMIT EVENTS TO RENDERER
  // ============================================================================

  emitToolResult(event: any, toolId: string, data: any) {
    const window = BrowserWindow.getFocusedWindow();
    if (window) {
      window.webContents.send(IPC_CHANNELS['tool:result'], { toolId, data });
    }
  }

  emitToolComplete(event: any, toolId: string, success: boolean, duration: number) {
    const window = BrowserWindow.getFocusedWindow();
    if (window) {
      window.webContents.send(IPC_CHANNELS['tool:complete'], { toolId, success, duration });
    }
  }

  emitToolError(event: any, toolId: string, error: string) {
    const window = BrowserWindow.getFocusedWindow();
    if (window) {
      window.webContents.send(IPC_CHANNELS['tool:error'], { toolId, error });
    }
  }
}
