"use strict";
/**
 * Main-process service registration for Electron IPC.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerServiceBridges = registerServiceBridges;
const async_hooks_1 = require("async_hooks");
const electron_1 = require("electron");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const types_1 = require("./types");
const services_1 = require("./services");
function createToolId() {
    return `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function createChatRequestId() {
    return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function createFileWriteReviewId() {
    return `write-review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function createCommandReviewId() {
    return `command-review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function createToolPermissionReviewId() {
    return `tool-permission-review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function sendToRenderer(getMainWindow, channel, payload) {
    const window = getMainWindow();
    if (!window || window.isDestroyed()) {
        return;
    }
    window.webContents.send(channel, payload);
}
function registerServiceBridges(ipcBridge, options) {
    const workspacePath = resolveWorkspacePath(options.cwd);
    const automationExecutionScope = new async_hooks_1.AsyncLocalStorage();
    const pendingFileWriteReviews = new Map();
    const pendingCommandReviews = new Map();
    const pendingToolPermissionReviews = new Map();
    const scopedFileServices = new Map();
    const scopedCommandServices = new Map();
    function hasFullAccessAutomationScope() {
        return automationExecutionScope.getStore()?.permissionMode === 'full-access';
    }
    function getScopedWorkspacePath() {
        return path.resolve(automationExecutionScope.getStore()?.workspacePath || workspacePath);
    }
    function getScopedFileService() {
        const scopedWorkspacePath = getScopedWorkspacePath();
        if (scopedWorkspacePath === workspacePath) {
            return filesService;
        }
        let service = scopedFileServices.get(scopedWorkspacePath);
        if (!service) {
            service = new services_1.FileSystemServiceBridge(scopedWorkspacePath);
            scopedFileServices.set(scopedWorkspacePath, service);
        }
        return service;
    }
    function getScopedCommandService() {
        const scopedWorkspacePath = getScopedWorkspacePath();
        if (scopedWorkspacePath === workspacePath) {
            return commandService;
        }
        let service = scopedCommandServices.get(scopedWorkspacePath);
        if (!service) {
            service = new services_1.CommandServiceBridge(scopedWorkspacePath);
            scopedCommandServices.set(scopedWorkspacePath, service);
        }
        return service;
    }
    function requestFileWriteReview(preview, toolId) {
        if (hasFullAccessAutomationScope()) {
            return Promise.resolve();
        }
        const window = options.getMainWindow();
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
                automationService.expireApprovalRequest(requestId).catch(() => { });
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
                window.webContents.send(types_1.IPC_CHANNELS['tool:fileWriteReview'], payload);
            }
        });
    }
    function requestCommandReview(preview, toolId) {
        if (hasFullAccessAutomationScope()) {
            return Promise.resolve();
        }
        const window = options.getMainWindow();
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
                automationService.expireApprovalRequest(requestId).catch(() => { });
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
                window.webContents.send(types_1.IPC_CHANNELS['tool:commandReview'], payload);
            }
        });
    }
    function requestToolPermissionReview(toolName, args, toolId) {
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
        };
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                pendingToolPermissionReviews.delete(requestId);
                automationService.expireApprovalRequest(requestId).catch(() => { });
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
                window.webContents.send(types_1.IPC_CHANNELS['tool:permissionReview'], payload);
            }
        });
    }
    function normalizePermissionMode(value) {
        return value === 'allow' || value === 'ask' || value === 'deny' ? value : undefined;
    }
    const apiService = new services_1.ApiServiceBridge(undefined, workspacePath);
    const filesService = new services_1.FileSystemServiceBridge(workspacePath);
    const authService = new services_1.AuthServiceBridge(options.keytar);
    const appStateService = new services_1.AppStateServiceBridge();
    const mcpService = new services_1.McpServiceBridge(workspacePath);
    const commandService = new services_1.CommandServiceBridge(workspacePath);
    const automationService = new services_1.AutomationServiceBridge(workspacePath);
    const historyService = new services_1.LocalHistoryServiceBridge(path.join(electron_1.app.getPath('userData'), 'history'));
    const webService = new services_1.WebServiceBridge();
    const financeService = new services_1.FinanceServiceBridge();
    const toolService = new services_1.ToolServiceBridge(createBridgeTools({
        apiService,
        filesService,
        appStateService,
        mcpService,
        commandService,
        automationService,
        webService,
        financeService,
        getScopedFileService,
        getScopedCommandService,
        requestFileWriteReview,
        requestCommandReview,
    }));
    const automationNotificationEmitter = async (notification) => {
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
        if (notification.channel !== 'desktop' || !electron_1.Notification.isSupported()) {
            return;
        }
        const body = notification.message.replace(/\s+/g, ' ').slice(0, 180);
        new electron_1.Notification({
            title: `CodeAgent task ${notification.status}`,
            body: body || notification.task.name,
        }).show();
    };
    automationService.setNotificationEmitter(automationNotificationEmitter);
    automationService.setApprovalResolutionEmitter(event => {
        sendToRenderer(options.getMainWindow, types_1.IPC_CHANNELS['tool:approvalResolved'], {
            requestId: event.approvalId,
            type: event.type,
            title: event.title,
            approved: event.approved,
            resolvedBy: event.resolvedBy,
            reason: event.reason,
        });
    });
    apiService.setAuthTokenProvider(provider => authService.getToken(provider));
    apiService.setAppConfigProvider(() => appStateService.getConfig());
    apiService.setToolProvider(() => toolService.getTools(), (toolName, args) => toolService.executeToolAndReturn(toolName, args, createToolId()));
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
            usage: response.usage,
        };
    });
    automationService.setVirtualTeamMemberExecutor(async (team, member, context) => {
        const permissionMode = team.permissionMode === 'supervised' ? 'supervised' : 'full-access';
        const teamWorkspacePath = path.resolve(context.workspacePath || workspacePath);
        await fs.mkdir(teamWorkspacePath, { recursive: true });
        const response = await automationExecutionScope.run({
            source: 'virtual-team',
            permissionMode,
            workspacePath: teamWorkspacePath,
        }, () => apiService.chat({
            messages: [{
                    role: 'user',
                    content: buildVirtualTeamMemberPrompt(team, member, context.previousSteps, context.enabledSkills, teamWorkspacePath),
                }],
            enableTools: true,
            maxToolRounds: 12,
        }));
        return {
            content: response.content,
            model: response.model,
            usage: response.usage,
        };
    });
    automationService.startScheduler();
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
    toolService.setStartHandler((toolId, toolName, args) => {
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
            },
        }).catch(error => {
            console.warn('Failed to save tool history event:', error);
        });
        sendToRenderer(options.getMainWindow, types_1.IPC_CHANNELS['tool:start'], {
            toolId,
            toolName,
            args,
            timestamp: Date.now(),
        });
    });
    toolService.setResultHandler((toolId, data) => {
        historyService.saveRecord({
            id: `tool-event-${toolId}`,
            type: 'tool-event',
            workspacePath: getScopedWorkspacePath(),
            data: {
                toolId,
                result: data,
                status: 'result',
            },
        }).catch(error => {
            console.warn('Failed to save tool history event:', error);
        });
        sendToRenderer(options.getMainWindow, types_1.IPC_CHANNELS['tool:result'], {
            toolId,
            data,
            timestamp: Date.now(),
        });
    });
    toolService.setCompleteHandler((toolId, success, duration) => {
        historyService.saveRecord({
            id: `tool-event-${toolId}`,
            type: 'tool-event',
            workspacePath: getScopedWorkspacePath(),
            data: {
                toolId,
                success,
                duration,
                status: success ? 'succeeded' : 'failed',
            },
        }).catch(error => {
            console.warn('Failed to save tool history event:', error);
        });
        sendToRenderer(options.getMainWindow, types_1.IPC_CHANNELS['tool:complete'], {
            toolId,
            success,
            duration,
        });
    });
    toolService.setErrorHandler((toolId, error, stack) => {
        historyService.saveRecord({
            id: `tool-event-${toolId}`,
            type: 'tool-event',
            workspacePath: getScopedWorkspacePath(),
            data: {
                toolId,
                error,
                stack,
                status: 'failed',
            },
        }).catch(saveError => {
            console.warn('Failed to save tool history event:', saveError);
        });
        sendToRenderer(options.getMainWindow, types_1.IPC_CHANNELS['tool:error'], {
            toolId,
            error,
            stack,
        });
    });
    toolService.setPermissionPolicyProvider(async (tool) => {
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
    ipcBridge.registerToolHandler('execute', async (message) => {
        const toolId = message.toolId ?? createToolId();
        toolService.executeTool(message.toolName, message.args ?? {}, toolId).catch(error => {
            console.error('Tool execution error:', error);
        });
        return { toolId };
    });
    ipcBridge.registerToolHandler('list', async () => {
        return toolService.getTools();
    });
    ipcBridge.registerToolHandler('fileWriteReviewResponse', async (response) => {
        const resolved = await automationService.resolveApprovalRequest(response.requestId, response.approved, response.reason, 'desktop');
        return resolved;
    });
    ipcBridge.registerToolHandler('commandReviewResponse', async (response) => {
        const resolved = await automationService.resolveApprovalRequest(response.requestId, response.approved, response.reason, 'desktop');
        return resolved;
    });
    ipcBridge.registerToolHandler('permissionReviewResponse', async (response) => {
        const resolved = await automationService.resolveApprovalRequest(response.requestId, response.approved, response.reason, 'desktop');
        return resolved;
    });
    ipcBridge.registerApiHandler('chat', async (request) => {
        return apiService.chat(request);
    });
    ipcBridge.registerApiHandler('chatStream', async (request) => {
        const requestId = request.requestId ?? createChatRequestId();
        const startTime = Date.now();
        apiService.streamChat(request, {
            onDelta: delta => {
                sendToRenderer(options.getMainWindow, types_1.IPC_CHANNELS['api:chatDelta'], {
                    requestId,
                    delta,
                    timestamp: Date.now(),
                });
            },
        }).then(response => {
            sendToRenderer(options.getMainWindow, types_1.IPC_CHANNELS['api:chatComplete'], {
                requestId,
                response,
                duration: Date.now() - startTime,
            });
        }).catch(error => {
            sendToRenderer(options.getMainWindow, types_1.IPC_CHANNELS['api:chatError'], {
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
    ipcBridge.registerFsHandler('read', async (request) => {
        return filesService.readFile(request.path, request.encoding);
    });
    ipcBridge.registerFsHandler('write', async (request) => {
        return filesService.writeFile(request.path, request.content, request.encoding);
    });
    ipcBridge.registerFsHandler('list', async (request) => {
        return filesService.listDirectory(request.path);
    });
    ipcBridge.registerFsHandler('open', async (request) => {
        const absolutePath = filesService.resolveWorkspacePath(request.path);
        const error = await electron_1.shell.openPath(absolutePath);
        if (error) {
            throw new Error(error);
        }
        return {
            ok: true,
            path: request.path,
            absolutePath,
        };
    });
    ipcBridge.registerFsHandler('reveal', async (request) => {
        const absolutePath = filesService.resolveWorkspacePath(request.path);
        electron_1.shell.showItemInFolder(absolutePath);
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
    ipcBridge.registerAutomationHandler('listSkills', async () => {
        return automationService.listSkills();
    });
    ipcBridge.registerAutomationHandler('refreshSkills', async () => {
        return automationService.listSkills();
    });
    ipcBridge.registerAutomationHandler('getSkill', async (skillId) => {
        return automationService.getSkill(String(skillId));
    });
    ipcBridge.registerAutomationHandler('setSkillEnabled', async (request) => {
        return automationService.setSkillEnabled(String(request.skillId), Boolean(request.enabled));
    });
    ipcBridge.registerAutomationHandler('listTasks', async () => {
        return automationService.listTasks();
    });
    ipcBridge.registerAutomationHandler('listTaskRuns', async (taskId) => {
        return automationService.listTaskRuns(typeof taskId === 'string' ? taskId : undefined);
    });
    ipcBridge.registerAutomationHandler('saveTask', async (task) => {
        return automationService.saveTask(task);
    });
    ipcBridge.registerAutomationHandler('setTaskEnabled', async (request) => {
        return automationService.setTaskEnabled(String(request.taskId), Boolean(request.enabled));
    });
    ipcBridge.registerAutomationHandler('deleteTask', async (taskId) => {
        return automationService.deleteTask(String(taskId));
    });
    ipcBridge.registerAutomationHandler('runTask', async (taskId) => {
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
    ipcBridge.registerAutomationHandler('updateRemoteControl', async (update) => {
        return automationService.updateRemoteControl(update);
    });
    ipcBridge.registerAutomationHandler('createRemotePairingCode', async (deviceName) => {
        return automationService.createRemotePairingCode(typeof deviceName === 'string' ? deviceName : undefined);
    });
    ipcBridge.registerAutomationHandler('startRemoteControl', async () => {
        return automationService.updateRemoteControl({ enabled: true, mode: 'local-network' });
    });
    ipcBridge.registerAutomationHandler('stopRemoteControl', async () => {
        return automationService.stopRemoteControlServer();
    });
    ipcBridge.registerAutomationHandler('revokeRemoteDevice', async (deviceId) => {
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
    ipcBridge.registerAutomationHandler('listTeams', async () => {
        return automationService.listTeams();
    });
    ipcBridge.registerAutomationHandler('listTeamRuns', async (teamId) => {
        return automationService.listTeamRuns(typeof teamId === 'string' ? teamId : undefined);
    });
    ipcBridge.registerAutomationHandler('saveTeam', async (team) => {
        return automationService.saveTeam(team);
    });
    ipcBridge.registerAutomationHandler('deleteTeam', async (teamId) => {
        return automationService.deleteTeam(String(teamId));
    });
    ipcBridge.registerAutomationHandler('createDefaultTeam', async (objective) => {
        return automationService.createDefaultTeam(typeof objective === 'string' ? objective : undefined);
    });
    ipcBridge.registerAutomationHandler('runTeam', async (teamId) => {
        const run = await automationService.runTeam(String(teamId));
        await historyService.saveRecord({
            id: `automation-run-${run.id}`,
            type: 'automation-run',
            workspacePath: run.workspacePath ?? workspacePath,
            title: `${run.teamName} run`,
            data: run,
            createdAt: run.startedAt,
            updatedAt: run.completedAt ?? Date.now(),
        });
        return run;
    });
    ipcBridge.registerAutomationHandler('exportProjectState', async (options) => {
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
    ipcBridge.registerAutomationHandler('importProjectState', async (bundle) => {
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
    ipcBridge.registerHistoryHandler('saveRecord', async (record) => {
        return historyService.saveRecord(record);
    });
    ipcBridge.registerHistoryHandler('getRecord', async (id) => {
        return historyService.getRecord(String(id));
    });
    ipcBridge.registerHistoryHandler('listRecords', async (filter) => {
        return historyService.listRecords(filter);
    });
    ipcBridge.registerHistoryHandler('deleteRecord', async (id) => {
        return historyService.deleteRecord(String(id));
    });
    ipcBridge.registerHistoryHandler('exportRecords', async (filter) => {
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
    ipcBridge.registerAuthHandler('setToken', async (token) => {
        return authService.setToken(token);
    });
    ipcBridge.registerAppHandler('info', async () => {
        return {
            version: electron_1.app.getVersion(),
            platform: process.platform,
            arch: process.arch,
            isDev: options.isDev ?? false,
            workspacePath,
        };
    });
    ipcBridge.registerAppHandler('getConfig', async () => {
        return appStateService.getConfig();
    });
    ipcBridge.registerAppHandler('setConfig', async (config) => {
        const update = await appStateService.setConfig(config);
        apiService.clearBootstrapCache();
        sendToRenderer(options.getMainWindow, types_1.IPC_CHANNELS['app:configChanged'], update);
        return update;
    });
    ipcBridge.registerAppHandler('getState', async () => {
        return appStateService.getState();
    });
    ipcBridge.registerAppHandler('setState', async (state) => {
        const update = await appStateService.setState(state);
        sendToRenderer(options.getMainWindow, types_1.IPC_CHANNELS['app:stateChanged'], update);
        return update;
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
    };
}
function resolveWorkspacePath(value) {
    const fallback = electron_1.app.getPath('home');
    const candidate = typeof value === 'string' && value.trim()
        ? path.resolve(value.trim())
        : fallback;
    if (!candidate || candidate === path.parse(candidate).root) {
        return fallback;
    }
    return candidate;
}
function createBridgeTools({ apiService, filesService, appStateService, mcpService, commandService, automationService, webService, financeService, getScopedFileService, getScopedCommandService, requestFileWriteReview, requestCommandReview, }) {
    const workspacePath = 'the current scoped workspace';
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
            execute: async (args) => formatCurrentTime(args.timezone, args.locale),
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
                const scopedCommandService = getScopedCommandService();
                const preview = scopedCommandService.createRunPreview(args);
                await requestCommandReview(preview, context.toolId);
                return scopedCommandService.runCommand(args);
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
            execute: args => getScopedFileService().readFile(String(args.path), args.encoding),
        },
        {
            name: 'fs.write',
            description: `Write a file inside the current workspace (${workspacePath}). Use workspace-relative paths, not home-directory paths.`,
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
                const scopedFilesService = getScopedFileService();
                const targetPath = String(args.path);
                const content = String(args.content ?? '');
                const encoding = args.encoding;
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
            execute: () => getScopedFileService().restoreLastWriteCheckpoint(),
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
            execute: args => getScopedFileService().listDirectory(String(args.path ?? '.')),
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
                messages: Array.isArray(args.messages) ? args.messages : [],
                model: args.model,
                maxTokens: args.maxTokens,
                temperature: args.temperature,
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
            name: 'automation.listTeams',
            description: 'List virtual autonomous team blueprints configured for this workspace. Read-only.',
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
            description: 'List recent virtual team run history and artifact paths. Read-only.',
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
            execute: args => mcpService.callTool(String(args.serverName ?? ''), String(args.toolName ?? args.name ?? ''), args.arguments && typeof args.arguments === 'object' && !Array.isArray(args.arguments)
                ? args.arguments
                : {}),
        },
    ];
}
function formatCurrentTime(timezone, locale = 'en-US') {
    const now = new Date();
    const resolvedTimezone = timezone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    let formatter;
    try {
        formatter = new Intl.DateTimeFormat(locale || 'en-US', {
            timeZone: resolvedTimezone,
            dateStyle: 'full',
            timeStyle: 'long',
        });
    }
    catch (error) {
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
function buildSkillContext(skills) {
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
function buildScheduledTaskPrompt(task, skills, workspacePath) {
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
function buildVirtualTeamMemberPrompt(team, member, previousSteps, skills, workspacePath) {
    const previousContext = previousSteps
        .filter(step => step.status !== 'running' && (step.output || step.error))
        .map(step => [
        `## ${step.iteration ? `Iteration ${step.iteration} - ` : ''}${step.role} - ${step.memberName}`,
        step.output ?? `Error: ${step.error}`,
    ].join('\n'))
        .join('\n\n');
    const permissionInstruction = team.permissionMode === 'supervised'
        ? '- Risky tool calls must go through the normal permission review path.'
        : '- This team run has full-access automation permission. Use tools responsibly and do not pause for approval unless blocked by workspace safety rules or missing information.';
    return [
        'You are participating in a local virtual software delivery team.',
        '',
        `Workspace: ${workspacePath}`,
        `Team: ${team.name}`,
        `Team objective: ${team.objective}`,
        '',
        `Your role: ${member.role}`,
        `Your name: ${member.name}`,
        `Your goal: ${member.goal}`,
        `Available role tool families: ${member.tools.join(', ') || 'default tools'}`,
        '',
        'Enabled workspace skills:',
        buildSkillContext(skills),
        '',
        'Previous team outputs:',
        previousContext || 'No previous team outputs yet.',
        '',
        'Execution rules:',
        '- Stay within your role and produce concrete artifacts or decisions.',
        '- If the objective asks to build or create an app/project, create the needed files in the workspace with fs.write; do not only describe the code.',
        '- Use filesystem, Bash, web, finance, time, or MCP tools only when needed.',
        permissionInstruction,
        '- If this role cannot safely continue without human input, say exactly what approval or information is needed.',
        '- End with a short handoff for the next team member.',
    ].join('\n');
}
//# sourceMappingURL=services-bridge.js.map