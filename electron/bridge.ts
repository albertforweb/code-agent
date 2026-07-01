/**
 * IPC Bridge
 * Orchestrates communication between main and renderer processes
 */

import { ipcMain, BrowserWindow } from 'electron';
import type {
  ToolExecuteMessage,
  ToolExecuteResponse,
  ToolPermissionReviewResponse,
  CommandReviewResponse,
  FileWriteReviewResponse,
  ChatRequest,
  ChatResponse,
  ChatStreamRequest,
  ChatStreamResponse,
  FileReadRequest,
  FileWriteRequest,
  FileListRequest,
  FilePathRequest,
  FilePathActionResult,
  AppConfig,
  AppInfo,
  AuthToken,
  Tool,
  McpServerInfo,
  McpToolInfo,
  SkillManifest,
  SkillDetail,
  ScheduledTask,
  AutomationRunRecord,
  AutomationSchedulerStatus,
  RemoteControlState,
  VirtualTeamBlueprint,
  VirtualTeamRunRecord,
  AutomationProjectExport,
  AutomationProjectImportResult,
  LocalHistoryRecord,
  LocalHistoryRecordInput,
  LocalHistoryFilter,
  LocalHistoryExport,
  LocalHistoryStorageInfo,
} from './types';
import { IPC_CHANNELS } from './types';

export class IpcBridge {
  private toolHandlers: Map<string, (args: any) => Promise<any>> = new Map();
  private apiHandlers: Map<string, (args: any) => Promise<any>> = new Map();
  private fsHandlers: Map<string, (args: any) => Promise<any>> = new Map();
  private authHandlers: Map<string, (args: any) => Promise<any>> = new Map();
  private appHandlers: Map<string, (args: any) => Promise<any>> = new Map();
  private mcpHandlers: Map<string, (args: any) => Promise<any>> = new Map();
  private automationHandlers: Map<string, (args: any) => Promise<any>> = new Map();
  private historyHandlers: Map<string, (args: any) => Promise<any>> = new Map();

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
    ipcMain.handle(IPC_CHANNELS['tool:fileWriteReviewResponse'], this.handleFileWriteReviewResponse.bind(this));
    ipcMain.handle(IPC_CHANNELS['tool:commandReviewResponse'], this.handleCommandReviewResponse.bind(this));
    ipcMain.handle(IPC_CHANNELS['tool:permissionReviewResponse'], this.handleToolPermissionReviewResponse.bind(this));

    // API channels
    ipcMain.handle(IPC_CHANNELS['api:chat'], this.handleApiChat.bind(this));
    ipcMain.handle(IPC_CHANNELS['api:chatStream'], this.handleApiChatStream.bind(this));
    ipcMain.handle(IPC_CHANNELS['api:fetchBootstrap'], this.handleFetchBootstrap.bind(this));

    // MCP channels
    ipcMain.handle(IPC_CHANNELS['mcp:listServers'], this.handleMcpListServers.bind(this));
    ipcMain.handle(IPC_CHANNELS['mcp:listTools'], this.handleMcpListTools.bind(this));
    ipcMain.handle(IPC_CHANNELS['mcp:refresh'], this.handleMcpRefresh.bind(this));

    // Automation channels
    ipcMain.handle(IPC_CHANNELS['automation:listSkills'], this.handleAutomationListSkills.bind(this));
    ipcMain.handle(IPC_CHANNELS['automation:refreshSkills'], this.handleAutomationRefreshSkills.bind(this));
    ipcMain.handle(IPC_CHANNELS['automation:getSkill'], this.handleAutomationGetSkill.bind(this));
    ipcMain.handle(IPC_CHANNELS['automation:setSkillEnabled'], this.handleAutomationSetSkillEnabled.bind(this));
    ipcMain.handle(IPC_CHANNELS['automation:listTasks'], this.handleAutomationListTasks.bind(this));
    ipcMain.handle(IPC_CHANNELS['automation:listTaskRuns'], this.handleAutomationListTaskRuns.bind(this));
    ipcMain.handle(IPC_CHANNELS['automation:saveTask'], this.handleAutomationSaveTask.bind(this));
    ipcMain.handle(IPC_CHANNELS['automation:setTaskEnabled'], this.handleAutomationSetTaskEnabled.bind(this));
    ipcMain.handle(IPC_CHANNELS['automation:deleteTask'], this.handleAutomationDeleteTask.bind(this));
    ipcMain.handle(IPC_CHANNELS['automation:runTask'], this.handleAutomationRunTask.bind(this));
    ipcMain.handle(IPC_CHANNELS['automation:getSchedulerStatus'], this.handleAutomationGetSchedulerStatus.bind(this));
    ipcMain.handle(IPC_CHANNELS['automation:getRemoteControl'], this.handleAutomationGetRemoteControl.bind(this));
    ipcMain.handle(IPC_CHANNELS['automation:updateRemoteControl'], this.handleAutomationUpdateRemoteControl.bind(this));
    ipcMain.handle(IPC_CHANNELS['automation:createRemotePairingCode'], this.handleAutomationCreateRemotePairingCode.bind(this));
    ipcMain.handle(IPC_CHANNELS['automation:startRemoteControl'], this.handleAutomationStartRemoteControl.bind(this));
    ipcMain.handle(IPC_CHANNELS['automation:stopRemoteControl'], this.handleAutomationStopRemoteControl.bind(this));
    ipcMain.handle(IPC_CHANNELS['automation:listTeams'], this.handleAutomationListTeams.bind(this));
    ipcMain.handle(IPC_CHANNELS['automation:listTeamRuns'], this.handleAutomationListTeamRuns.bind(this));
    ipcMain.handle(IPC_CHANNELS['automation:saveTeam'], this.handleAutomationSaveTeam.bind(this));
    ipcMain.handle(IPC_CHANNELS['automation:deleteTeam'], this.handleAutomationDeleteTeam.bind(this));
    ipcMain.handle(IPC_CHANNELS['automation:createDefaultTeam'], this.handleAutomationCreateDefaultTeam.bind(this));
    ipcMain.handle(IPC_CHANNELS['automation:runTeam'], this.handleAutomationRunTeam.bind(this));
    ipcMain.handle(IPC_CHANNELS['automation:revokeRemoteDevice'], this.handleAutomationRevokeRemoteDevice.bind(this));
    ipcMain.handle(IPC_CHANNELS['automation:exportProjectState'], this.handleAutomationExportProjectState.bind(this));
    ipcMain.handle(IPC_CHANNELS['automation:importProjectState'], this.handleAutomationImportProjectState.bind(this));

    // Local history channels
    ipcMain.handle(IPC_CHANNELS['history:saveRecord'], this.handleHistorySaveRecord.bind(this));
    ipcMain.handle(IPC_CHANNELS['history:getRecord'], this.handleHistoryGetRecord.bind(this));
    ipcMain.handle(IPC_CHANNELS['history:listRecords'], this.handleHistoryListRecords.bind(this));
    ipcMain.handle(IPC_CHANNELS['history:deleteRecord'], this.handleHistoryDeleteRecord.bind(this));
    ipcMain.handle(IPC_CHANNELS['history:exportRecords'], this.handleHistoryExportRecords.bind(this));
    ipcMain.handle(IPC_CHANNELS['history:getStorageInfo'], this.handleHistoryGetStorageInfo.bind(this));

    // File system channels
    ipcMain.handle(IPC_CHANNELS['fs:read'], this.handleFileRead.bind(this));
    ipcMain.handle(IPC_CHANNELS['fs:write'], this.handleFileWrite.bind(this));
    ipcMain.handle(IPC_CHANNELS['fs:list'], this.handleFileList.bind(this));
    ipcMain.handle(IPC_CHANNELS['fs:open'], this.handleFileOpen.bind(this));
    ipcMain.handle(IPC_CHANNELS['fs:reveal'], this.handleFileReveal.bind(this));

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

  private async handleFileWriteReviewResponse(
    _event: any,
    response: FileWriteReviewResponse,
  ): Promise<{ ok: boolean }> {
    const handler = this.toolHandlers.get('fileWriteReviewResponse');
    if (!handler) {
      throw new Error('File write review response handler not configured');
    }
    return handler(response);
  }

  private async handleCommandReviewResponse(
    _event: any,
    response: CommandReviewResponse,
  ): Promise<{ ok: boolean }> {
    const handler = this.toolHandlers.get('commandReviewResponse');
    if (!handler) {
      throw new Error('Command review response handler not configured');
    }
    return handler(response);
  }

  private async handleToolPermissionReviewResponse(
    _event: any,
    response: ToolPermissionReviewResponse,
  ): Promise<{ ok: boolean }> {
    const handler = this.toolHandlers.get('permissionReviewResponse');
    if (!handler) {
      throw new Error('Tool permission review response handler not configured');
    }
    return handler(response);
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

  private async handleApiChatStream(
    event: any,
    request: ChatStreamRequest,
  ): Promise<ChatStreamResponse> {
    const handler = this.apiHandlers.get('chatStream');
    if (!handler) {
      throw new Error('API stream handler not configured');
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

  private async handleFileOpen(event: any, request: FilePathRequest): Promise<FilePathActionResult> {
    const handler = this.fsHandlers.get('open');
    if (!handler) {
      throw new Error('File open handler not configured');
    }
    return handler(request);
  }

  private async handleFileReveal(event: any, request: FilePathRequest): Promise<FilePathActionResult> {
    const handler = this.fsHandlers.get('reveal');
    if (!handler) {
      throw new Error('File reveal handler not configured');
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

  // ============================================================================
  // AUTOMATION HANDLERS
  // ============================================================================

  private async handleAutomationListSkills(): Promise<SkillManifest[]> {
    return this.getAutomationHandler('listSkills')({});
  }

  private async handleAutomationRefreshSkills(): Promise<SkillManifest[]> {
    return this.getAutomationHandler('refreshSkills')({});
  }

  private async handleAutomationGetSkill(_event: any, skillId: string): Promise<SkillDetail> {
    return this.getAutomationHandler('getSkill')(skillId);
  }

  private async handleAutomationSetSkillEnabled(
    _event: any,
    request: { skillId: string; enabled: boolean },
  ): Promise<SkillManifest> {
    return this.getAutomationHandler('setSkillEnabled')(request);
  }

  private async handleAutomationListTasks(): Promise<ScheduledTask[]> {
    return this.getAutomationHandler('listTasks')({});
  }

  private async handleAutomationListTaskRuns(_event: any, taskId?: string): Promise<AutomationRunRecord[]> {
    return this.getAutomationHandler('listTaskRuns')(taskId);
  }

  private async handleAutomationSaveTask(_event: any, task: Partial<ScheduledTask>): Promise<ScheduledTask> {
    return this.getAutomationHandler('saveTask')(task);
  }

  private async handleAutomationSetTaskEnabled(
    _event: any,
    request: { taskId: string; enabled: boolean },
  ): Promise<ScheduledTask> {
    return this.getAutomationHandler('setTaskEnabled')(request);
  }

  private async handleAutomationDeleteTask(_event: any, taskId: string): Promise<{ ok: true; id: string }> {
    return this.getAutomationHandler('deleteTask')(taskId);
  }

  private async handleAutomationRunTask(_event: any, taskId: string): Promise<ScheduledTask> {
    return this.getAutomationHandler('runTask')(taskId);
  }

  private async handleAutomationGetSchedulerStatus(): Promise<AutomationSchedulerStatus> {
    return this.getAutomationHandler('getSchedulerStatus')({});
  }

  private async handleAutomationGetRemoteControl(): Promise<RemoteControlState> {
    return this.getAutomationHandler('getRemoteControl')({});
  }

  private async handleAutomationUpdateRemoteControl(
    _event: any,
    update: Partial<RemoteControlState>,
  ): Promise<RemoteControlState> {
    return this.getAutomationHandler('updateRemoteControl')(update);
  }

  private async handleAutomationCreateRemotePairingCode(_event: any, deviceName?: string): Promise<RemoteControlState> {
    return this.getAutomationHandler('createRemotePairingCode')(deviceName);
  }

  private async handleAutomationStartRemoteControl(): Promise<RemoteControlState> {
    return this.getAutomationHandler('startRemoteControl')({});
  }

  private async handleAutomationStopRemoteControl(): Promise<RemoteControlState> {
    return this.getAutomationHandler('stopRemoteControl')({});
  }

  private async handleAutomationRevokeRemoteDevice(_event: any, deviceId: string): Promise<RemoteControlState> {
    return this.getAutomationHandler('revokeRemoteDevice')(deviceId);
  }

  private async handleAutomationListTeams(): Promise<VirtualTeamBlueprint[]> {
    return this.getAutomationHandler('listTeams')({});
  }

  private async handleAutomationListTeamRuns(_event: any, teamId?: string): Promise<VirtualTeamRunRecord[]> {
    return this.getAutomationHandler('listTeamRuns')(teamId);
  }

  private async handleAutomationSaveTeam(
    _event: any,
    team: Partial<VirtualTeamBlueprint>,
  ): Promise<VirtualTeamBlueprint> {
    return this.getAutomationHandler('saveTeam')(team);
  }

  private async handleAutomationDeleteTeam(_event: any, teamId: string): Promise<{ ok: true; id: string }> {
    return this.getAutomationHandler('deleteTeam')(teamId);
  }

  private async handleAutomationCreateDefaultTeam(_event: any, objective?: string): Promise<VirtualTeamBlueprint> {
    return this.getAutomationHandler('createDefaultTeam')(objective);
  }

  private async handleAutomationRunTeam(_event: any, teamId: string): Promise<VirtualTeamRunRecord> {
    return this.getAutomationHandler('runTeam')(teamId);
  }

  private async handleAutomationExportProjectState(
    _event: any,
    options?: { includeRuns?: boolean },
  ): Promise<AutomationProjectExport> {
    return this.getAutomationHandler('exportProjectState')(options ?? {});
  }

  private async handleAutomationImportProjectState(
    _event: any,
    bundle: Partial<AutomationProjectExport>,
  ): Promise<AutomationProjectImportResult> {
    return this.getAutomationHandler('importProjectState')(bundle);
  }

  private getAutomationHandler(operation: string): (args: any) => Promise<any> {
    const handler = this.automationHandlers.get(operation);
    if (!handler) {
      throw new Error(`Automation handler not configured: ${operation}`);
    }
    return handler;
  }

  // ============================================================================
  // LOCAL HISTORY HANDLERS
  // ============================================================================

  private async handleHistorySaveRecord(
    _event: any,
    record: LocalHistoryRecordInput,
  ): Promise<LocalHistoryRecord> {
    return this.getHistoryHandler('saveRecord')(record);
  }

  private async handleHistoryGetRecord(_event: any, id: string): Promise<LocalHistoryRecord> {
    return this.getHistoryHandler('getRecord')(id);
  }

  private async handleHistoryListRecords(
    _event: any,
    filter?: LocalHistoryFilter,
  ): Promise<LocalHistoryRecord[]> {
    return this.getHistoryHandler('listRecords')(filter ?? {});
  }

  private async handleHistoryDeleteRecord(_event: any, id: string): Promise<{ ok: true; id: string }> {
    return this.getHistoryHandler('deleteRecord')(id);
  }

  private async handleHistoryExportRecords(
    _event: any,
    filter?: LocalHistoryFilter,
  ): Promise<LocalHistoryExport> {
    return this.getHistoryHandler('exportRecords')(filter ?? {});
  }

  private async handleHistoryGetStorageInfo(): Promise<LocalHistoryStorageInfo> {
    return this.getHistoryHandler('getStorageInfo')({});
  }

  private getHistoryHandler(operation: string): (args: any) => Promise<any> {
    const handler = this.historyHandlers.get(operation);
    if (!handler) {
      throw new Error(`Local history handler not configured: ${operation}`);
    }
    return handler;
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

  registerAutomationHandler(operation: string, handler: (args: any) => Promise<any>) {
    this.automationHandlers.set(operation, handler);
  }

  registerHistoryHandler(operation: string, handler: (args: any) => Promise<any>) {
    this.historyHandlers.set(operation, handler);
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
