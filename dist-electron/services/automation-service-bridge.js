"use strict";
/**
 * Service Bridge - Local automation, skills, remote control, and virtual teams.
 *
 * This service is intentionally local-first. It stores project automation state
 * under the workspace and exposes a small durable model that both the desktop
 * app and CLI can build on.
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
exports.AutomationServiceBridge = void 0;
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs/promises"));
const http = __importStar(require("http"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const url_1 = require("url");
const DEFAULT_INTERVAL_MINUTES = 60;
const DEFAULT_RETRY_DELAY_MINUTES = 15;
const DEFAULT_REMOTE_PORT = 32888;
const SCHEDULER_INTERVAL_MS = 30000;
const MAX_RUN_HISTORY = 100;
const MAX_SKILL_CONTEXT_CHARS = 24000;
const MAX_TEAM_ITERATIONS = 5;
const REMOTE_RATE_LIMIT_WINDOW_MS = 60000;
const REMOTE_RATE_LIMIT_MAX_REQUESTS = 120;
const REMOTE_PAIR_RATE_LIMIT_MAX_REQUESTS = 20;
const TOOL_ROUND_LIMIT_MESSAGE = 'Stopped after reaching the desktop tool-call round limit.';
class AutomationServiceBridge {
    constructor(workspacePath = process.cwd()) {
        this.workspacePath = workspacePath;
        this.taskExecutor = null;
        this.teamMemberExecutor = null;
        this.notificationEmitter = null;
        this.schedulerTimer = null;
        this.schedulerRunning = false;
        this.runningTaskIds = new Set();
        this.runningTeamIds = new Set();
        this.remoteServer = null;
        this.remotePort = null;
        this.approvalResolvers = new Map();
        this.remoteRateLimits = new Map();
        this.projectDir = path.join(this.workspacePath, '.code-agent');
        this.legacyStorePath = path.join(this.projectDir, 'automation.json');
        this.projectManifestPath = path.join(this.projectDir, 'project.json');
        this.skillPoliciesPath = path.join(this.projectDir, 'skill-policies.json');
        this.tasksDir = path.join(this.projectDir, 'tasks');
        this.taskRunsDir = path.join(this.projectDir, 'runs', 'tasks');
        this.teamsDir = path.join(this.projectDir, 'teams');
        this.teamRunsDir = path.join(this.projectDir, 'runs', 'teams');
        this.localDir = path.join(this.projectDir, 'local');
        this.remoteControlPath = path.join(this.localDir, 'remote-control.json');
    }
    setTaskExecutor(executor) {
        this.taskExecutor = executor;
    }
    setVirtualTeamMemberExecutor(executor) {
        this.teamMemberExecutor = executor;
    }
    setNotificationEmitter(emitter) {
        this.notificationEmitter = emitter;
    }
    async listSkills() {
        const store = await this.readStore();
        const skillDirs = [
            { dir: path.join(this.workspacePath, '.code-agent', 'skills'), source: 'project' },
            { dir: path.join(this.workspacePath, 'skills'), source: 'workspace' },
        ];
        const discovered = [];
        for (const candidate of skillDirs) {
            discovered.push(...await this.discoverSkillsInDirectory(candidate.dir, candidate.source));
        }
        return discovered
            .map(skill => ({
            ...skill,
            enabled: store.skillPolicies[skill.id]?.enabled ?? true,
            trusted: store.skillPolicies[skill.id]?.trusted ?? false,
        }))
            .sort((left, right) => left.name.localeCompare(right.name));
    }
    async getSkill(skillId) {
        const skills = await this.listSkills();
        const skill = skills.find(candidate => candidate.id === skillId);
        if (!skill) {
            throw new Error(`Skill not found: ${skillId}`);
        }
        const content = await fs.readFile(skill.path, 'utf-8');
        return { ...skill, content };
    }
    async setSkillEnabled(skillId, enabled) {
        const store = await this.readStore();
        store.skillPolicies[skillId] = {
            ...store.skillPolicies[skillId],
            enabled,
        };
        await this.writeStore(store);
        const skill = (await this.listSkills()).find(candidate => candidate.id === skillId);
        if (!skill) {
            throw new Error(`Skill not found: ${skillId}`);
        }
        return skill;
    }
    async getEnabledSkillContext() {
        const skills = (await this.listSkills()).filter(skill => skill.enabled);
        const details = [];
        let remaining = MAX_SKILL_CONTEXT_CHARS;
        for (const skill of skills) {
            if (remaining <= 0) {
                break;
            }
            const content = await fs.readFile(skill.path, 'utf-8');
            const trimmed = content.slice(0, Math.max(0, remaining));
            remaining -= trimmed.length;
            details.push({ ...skill, content: trimmed });
        }
        return details;
    }
    async listTasks() {
        const store = await this.readStore();
        return [...store.tasks].sort((left, right) => left.nextRunAt - right.nextRunAt);
    }
    async listTaskRuns(taskId) {
        const store = await this.readStore();
        return store.taskRuns
            .filter(run => !taskId || run.taskId === taskId)
            .sort((left, right) => right.startedAt - left.startedAt);
    }
    async saveTask(input) {
        const store = await this.readStore();
        const now = Date.now();
        const existing = input.id ? store.tasks.find(task => task.id === input.id) : undefined;
        const intervalMinutes = this.normalizeInterval(input.intervalMinutes ?? existing?.intervalMinutes);
        const nextRunAt = Number(input.nextRunAt ?? existing?.nextRunAt ?? now + intervalMinutes * 60000);
        const task = {
            id: existing?.id ?? input.id ?? this.createId('task'),
            name: String(input.name ?? existing?.name ?? 'Scheduled task').trim() || 'Scheduled task',
            prompt: String(input.prompt ?? existing?.prompt ?? '').trim(),
            intervalMinutes,
            enabled: Boolean(input.enabled ?? existing?.enabled ?? true),
            nextRunAt: Number.isFinite(nextRunAt) ? nextRunAt : now + intervalMinutes * 60000,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
            retryPolicy: this.normalizeRetryPolicy(input.retryPolicy ?? existing?.retryPolicy),
            notificationPolicy: this.normalizeNotificationPolicy(input.notificationPolicy ?? existing?.notificationPolicy),
            missedRunPolicy: this.normalizeMissedRunPolicy(input.missedRunPolicy ?? existing?.missedRunPolicy),
            retryAttempts: Number(existing?.retryAttempts ?? input.retryAttempts ?? 0),
            lastRunAt: existing?.lastRunAt,
            lastStatus: existing?.lastStatus,
            lastResult: existing?.lastResult,
        };
        if (!task.prompt) {
            throw new Error('Scheduled task prompt is required.');
        }
        store.tasks = [
            task,
            ...store.tasks.filter(candidate => candidate.id !== task.id),
        ];
        await this.writeStore(store);
        this.scheduleTickSoon();
        return task;
    }
    async setTaskEnabled(taskId, enabled) {
        const store = await this.readStore();
        const task = store.tasks.find(candidate => candidate.id === taskId);
        if (!task) {
            throw new Error(`Scheduled task not found: ${taskId}`);
        }
        task.enabled = enabled;
        task.updatedAt = Date.now();
        if (enabled && task.nextRunAt < Date.now()) {
            task.nextRunAt = Date.now() + task.intervalMinutes * 60000;
        }
        await this.writeStore(store);
        this.scheduleTickSoon();
        return task;
    }
    async deleteTask(taskId) {
        const store = await this.readStore();
        store.tasks = store.tasks.filter(task => task.id !== taskId);
        store.taskRuns = store.taskRuns.filter(run => run.taskId !== taskId);
        await this.writeStore(store);
        return { ok: true, id: taskId };
    }
    async exportProjectState(options = {}) {
        const store = await this.readStore();
        const includeRuns = options.includeRuns !== false;
        return {
            schemaVersion: 1,
            exportedAt: Date.now(),
            workspacePath: this.workspacePath,
            skillPolicies: store.skillPolicies,
            tasks: store.tasks,
            teams: store.teams,
            taskRuns: includeRuns ? store.taskRuns : undefined,
            teamRuns: includeRuns ? store.teamRuns : undefined,
        };
    }
    async importProjectState(input) {
        if (!input || typeof input !== 'object') {
            throw new Error('Automation import requires a project export object.');
        }
        const store = await this.readStore();
        const skillPolicies = input.skillPolicies && typeof input.skillPolicies === 'object'
            ? input.skillPolicies
            : {};
        const tasks = Array.isArray(input.tasks)
            ? input.tasks.filter(value => this.isScheduledTask(value)).map(task => this.normalizeScheduledTask(task))
            : [];
        const teams = Array.isArray(input.teams)
            ? input.teams.filter(value => this.isVirtualTeam(value)).map(team => this.normalizeVirtualTeam(team))
            : [];
        const taskRuns = Array.isArray(input.taskRuns)
            ? input.taskRuns.filter(value => this.isTaskRun(value))
            : [];
        const teamRuns = Array.isArray(input.teamRuns)
            ? input.teamRuns.filter(value => this.isTeamRun(value))
            : [];
        store.skillPolicies = {
            ...store.skillPolicies,
            ...skillPolicies,
        };
        store.tasks = this.mergeRecords(store.tasks, tasks);
        store.teams = this.mergeRecords(store.teams, teams);
        store.taskRuns = this.mergeRecords(store.taskRuns, taskRuns).slice(0, MAX_RUN_HISTORY);
        store.teamRuns = this.mergeRecords(store.teamRuns, teamRuns).slice(0, MAX_RUN_HISTORY);
        await this.writeStore(store);
        return {
            ok: true,
            imported: {
                skillPolicies: Object.keys(skillPolicies).length,
                tasks: tasks.length,
                teams: teams.length,
                taskRuns: taskRuns.length,
                teamRuns: teamRuns.length,
            },
        };
    }
    async runTask(taskId) {
        return this.executeTask(taskId, 'manual');
    }
    async runDueTasks() {
        const store = await this.readStore();
        const now = Date.now();
        const due = store.tasks.filter(task => task.enabled && task.nextRunAt <= now);
        const results = [];
        for (const task of due) {
            if (this.runningTaskIds.has(task.id)) {
                continue;
            }
            if (this.shouldSkipMissedRun(task, now)) {
                results.push(await this.skipMissedTaskRun(task.id, now));
                continue;
            }
            results.push(await this.executeTask(task.id, 'schedule'));
        }
        return results;
    }
    startScheduler() {
        if (this.schedulerTimer) {
            return;
        }
        this.schedulerTimer = setInterval(() => {
            this.runDueTasks().catch(error => {
                console.warn('Scheduled automation tick failed:', error);
            });
        }, SCHEDULER_INTERVAL_MS);
        this.schedulerTimer.unref?.();
        this.scheduleTickSoon();
    }
    stopScheduler() {
        if (this.schedulerTimer) {
            clearInterval(this.schedulerTimer);
            this.schedulerTimer = null;
        }
    }
    getSchedulerStatus() {
        return {
            running: Boolean(this.schedulerTimer),
            intervalMs: SCHEDULER_INTERVAL_MS,
            runningTaskIds: Array.from(this.runningTaskIds),
        };
    }
    async getRemoteControl() {
        const store = await this.readStore();
        return this.sanitizeRemoteControl(store.remoteControl);
    }
    async updateRemoteControl(update) {
        const store = await this.readStore();
        store.remoteControl = this.normalizeRemoteControl({
            ...store.remoteControl,
            ...update,
            approvedDevices: update.approvedDevices ?? store.remoteControl.approvedDevices,
            pendingApprovals: update.pendingApprovals ?? store.remoteControl.pendingApprovals,
            pendingActions: update.pendingActions ?? store.remoteControl.pendingActions,
            auditLog: this.appendRemoteAudit(store.remoteControl.auditLog, {
                type: 'settings-updated',
                message: 'Remote-control settings were updated from the desktop app.',
            }),
        });
        await this.writeStore(store);
        if (store.remoteControl.enabled && store.remoteControl.mode === 'local-network') {
            return this.startRemoteControlServer();
        }
        if (!store.remoteControl.enabled || store.remoteControl.mode === 'disabled') {
            await this.stopRemoteControlServer();
        }
        return this.sanitizeRemoteControl(store.remoteControl);
    }
    async revokeRemoteDevice(deviceId) {
        const store = await this.readStore();
        const device = store.remoteControl.approvedDevices.find(candidate => candidate.id === deviceId);
        if (!device) {
            throw new Error(`Remote device not found: ${deviceId}`);
        }
        store.remoteControl = this.normalizeRemoteControl({
            ...store.remoteControl,
            approvedDevices: store.remoteControl.approvedDevices.filter(candidate => candidate.id !== deviceId),
            auditLog: this.appendRemoteAudit(store.remoteControl.auditLog, {
                type: 'device-revoked',
                message: `Revoked remote device "${device.name}".`,
                deviceId: device.id,
                deviceName: device.name,
            }),
        });
        await this.writeStore(store);
        return this.sanitizeRemoteControl(store.remoteControl);
    }
    async createRemotePairingCode(deviceName = 'Mobile device') {
        const pairingCode = crypto.randomInt(100000, 1000000).toString();
        const pairingToken = crypto.randomBytes(24).toString('base64url');
        const store = await this.readStore();
        store.remoteControl = this.normalizeRemoteControl({
            ...store.remoteControl,
            enabled: true,
            mode: store.remoteControl.mode === 'disabled' ? 'local-network' : store.remoteControl.mode,
            pairingCode,
            pairingTokenHash: crypto.createHash('sha256').update(pairingToken).digest('hex'),
            pairingExpiresAt: Date.now() + 10 * 60000,
            auditLog: this.appendRemoteAudit(store.remoteControl.auditLog, {
                type: 'pairing-created',
                message: `Created a pairing code for "${deviceName.trim() || 'Mobile device'}".`,
                deviceName: deviceName.trim() || 'Mobile device',
            }),
            pendingApprovals: [
                {
                    id: this.createId('device'),
                    deviceName: deviceName.trim() || 'Mobile device',
                    requestedAt: Date.now(),
                },
                ...store.remoteControl.pendingApprovals,
            ].slice(0, 10),
        });
        await this.writeStore(store);
        return this.startRemoteControlServer();
    }
    async startRemoteControlServer() {
        const store = await this.readStore();
        if (!store.remoteControl.enabled || store.remoteControl.mode !== 'local-network') {
            return this.sanitizeRemoteControl(store.remoteControl);
        }
        if (!this.remoteServer) {
            const startPort = Number(store.remoteControl.serverPort ?? DEFAULT_REMOTE_PORT);
            const { server, port } = await this.listenRemoteServer(startPort);
            this.remoteServer = server;
            this.remotePort = port;
        }
        const port = this.remotePort ?? DEFAULT_REMOTE_PORT;
        store.remoteControl.serverPort = port;
        store.remoteControl.serverUrl = `http://127.0.0.1:${port}`;
        store.remoteControl.localNetworkUrls = this.getLocalNetworkUrls(port);
        store.remoteControl.auditLog = this.appendRemoteAudit(store.remoteControl.auditLog, {
            type: 'server-started',
            message: `Remote-control server is listening on port ${port}.`,
        });
        await this.writeStore(store);
        return this.sanitizeRemoteControl(store.remoteControl);
    }
    async stopRemoteControlServer() {
        if (this.remoteServer) {
            await new Promise(resolve => {
                this.remoteServer?.close(() => resolve());
            });
            this.remoteServer = null;
            this.remotePort = null;
        }
        const store = await this.readStore();
        store.remoteControl = this.normalizeRemoteControl({
            ...store.remoteControl,
            enabled: false,
            mode: 'disabled',
            serverUrl: undefined,
            localNetworkUrls: [],
            auditLog: this.appendRemoteAudit(store.remoteControl.auditLog, {
                type: 'server-stopped',
                message: 'Remote-control server was stopped.',
            }),
        });
        await this.writeStore(store);
        return this.sanitizeRemoteControl(store.remoteControl);
    }
    async registerApprovalRequest(request, resolver) {
        const store = await this.readStore();
        const approval = {
            ...request,
            status: 'pending',
            createdAt: request.createdAt ?? Date.now(),
            expiresAt: request.expiresAt ?? Date.now() + 5 * 60000,
        };
        this.approvalResolvers.set(approval.id, resolver);
        const pendingActions = [
            approval,
            ...(store.remoteControl.pendingActions ?? []).filter(candidate => candidate.id !== approval.id),
        ].slice(0, 50);
        store.remoteControl = this.normalizeRemoteControl({
            ...store.remoteControl,
            pendingActions,
        });
        await this.writeStore(store);
        return approval;
    }
    async resolveApprovalRequest(approvalId, approved, reason, resolvedBy = 'desktop') {
        const store = await this.readStore();
        const actions = store.remoteControl.pendingActions ?? [];
        const approval = actions.find(candidate => candidate.id === approvalId);
        const resolver = this.approvalResolvers.get(approvalId);
        if (!approval && !resolver) {
            return { ok: false };
        }
        const resolvedAction = approval
            ? {
                ...approval,
                status: approved ? 'approved' : 'rejected',
                resolvedAt: Date.now(),
                resolvedBy,
                reason,
            }
            : undefined;
        store.remoteControl = this.normalizeRemoteControl({
            ...store.remoteControl,
            pendingActions: actions.filter(candidate => candidate.id !== approvalId),
            auditLog: this.appendRemoteAudit(store.remoteControl.auditLog, {
                type: approved ? 'approval-approved' : 'approval-rejected',
                message: `${approved ? 'Approved' : 'Rejected'} remote approval "${approval?.title ?? approvalId}".`,
                approvalId,
            }),
        });
        await this.writeStore(store);
        this.approvalResolvers.delete(approvalId);
        if (resolver) {
            if (approved) {
                resolver.approve(resolvedBy);
            }
            else {
                resolver.reject(reason, resolvedBy);
            }
        }
        return { ok: Boolean(resolvedAction || resolver) };
    }
    async expireApprovalRequest(approvalId, reason = 'Approval request expired.') {
        await this.resolveApprovalRequest(approvalId, false, reason, 'system-timeout');
    }
    async listTeams() {
        const store = await this.readStore();
        return [...store.teams].sort((left, right) => right.updatedAt - left.updatedAt);
    }
    async listTeamRuns(teamId) {
        const store = await this.readStore();
        return store.teamRuns
            .filter(run => !teamId || run.teamId === teamId)
            .sort((left, right) => right.startedAt - left.startedAt);
    }
    async saveTeam(input) {
        const store = await this.readStore();
        const now = Date.now();
        const existing = input.id ? store.teams.find(team => team.id === input.id) : undefined;
        const members = Array.isArray(input.members) && input.members.length > 0
            ? input.members
            : existing?.members ?? this.createDefaultMembers();
        const supervisorId = input.supervisorId ?? existing?.supervisorId ?? members[0]?.id ?? 'supervisor';
        const team = {
            id: existing?.id ?? input.id ?? this.createId('team'),
            name: String(input.name ?? existing?.name ?? 'Autonomous project team').trim() || 'Autonomous project team',
            objective: String(input.objective ?? existing?.objective ?? '').trim(),
            workspacePath: this.normalizeWorkspacePath(input.workspacePath ?? existing?.workspacePath),
            permissionMode: this.normalizeTeamPermissionMode(input.permissionMode ?? existing?.permissionMode),
            maxIterations: this.normalizeTeamMaxIterations(input.maxIterations ?? existing?.maxIterations),
            requireQaSignoff: Boolean(input.requireQaSignoff ?? existing?.requireQaSignoff ?? false),
            supervisorId,
            members,
            status: input.status ?? existing?.status ?? 'draft',
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
            lastRunAt: existing?.lastRunAt,
            lastStatus: existing?.lastStatus,
            lastResult: existing?.lastResult,
        };
        if (!team.objective) {
            throw new Error('Team objective is required.');
        }
        store.teams = [
            team,
            ...store.teams.filter(candidate => candidate.id !== team.id),
        ];
        await this.writeStore(store);
        return team;
    }
    async createDefaultTeam(objective = 'Deliver the software project from blueprint to tested implementation.') {
        return this.saveTeam({
            name: 'Default software delivery team',
            objective,
            workspacePath: this.workspacePath,
            permissionMode: 'full-access',
            maxIterations: 1,
            requireQaSignoff: true,
            members: this.createDefaultMembers(),
            supervisorId: 'supervisor',
            status: 'draft',
        });
    }
    async deleteTeam(teamId) {
        const store = await this.readStore();
        store.teams = store.teams.filter(team => team.id !== teamId);
        store.teamRuns = store.teamRuns.filter(run => run.teamId !== teamId);
        await this.writeStore(store);
        return { ok: true, id: teamId };
    }
    async runTeam(teamId) {
        if (this.runningTeamIds.has(teamId)) {
            const running = (await this.listTeamRuns(teamId)).find(run => run.status === 'running');
            if (running) {
                return running;
            }
            throw new Error(`Virtual team is already running: ${teamId}`);
        }
        const store = await this.readStore();
        const team = store.teams.find(candidate => candidate.id === teamId);
        if (!team) {
            throw new Error(`Virtual team not found: ${teamId}`);
        }
        this.runningTeamIds.add(teamId);
        const now = Date.now();
        const maxIterations = this.normalizeTeamMaxIterations(team.maxIterations);
        const run = {
            id: this.createId('team-run'),
            teamId: team.id,
            teamName: team.name,
            objective: team.objective,
            workspacePath: team.workspacePath ?? this.workspacePath,
            status: 'running',
            startedAt: now,
            milestones: this.createTeamRunMilestones(team, maxIterations, now),
            steps: [],
        };
        await this.ensureTeamWorkspaceSeed(team);
        team.status = 'active';
        team.lastRunAt = now;
        team.lastStatus = 'running';
        team.updatedAt = now;
        store.teamRuns = [run, ...store.teamRuns].slice(0, MAX_RUN_HISTORY);
        await this.writeStore(store);
        try {
            const enabledSkills = await this.getEnabledSkillContext();
            for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
                for (const member of team.members) {
                    const stepStartedAt = Date.now();
                    const step = {
                        memberId: member.id,
                        memberName: member.name,
                        role: member.role,
                        iteration,
                        status: 'running',
                        startedAt: stepStartedAt,
                    };
                    this.updateTeamRunMilestone(run, member.id, iteration, {
                        status: 'running',
                        startedAt: stepStartedAt,
                    });
                    run.steps.push(step);
                    await this.upsertTeamRun(run);
                    try {
                        const result = this.teamMemberExecutor
                            ? await this.teamMemberExecutor(team, member, {
                                workspacePath: team.workspacePath ?? this.workspacePath,
                                enabledSkills,
                                previousSteps: run.steps,
                            })
                            : await this.createFallbackTeamStep(team, member, run.steps);
                        this.assertExecutionCompleted(result.content);
                        step.status = 'succeeded';
                        step.completedAt = Date.now();
                        step.output = result.content;
                        this.updateTeamRunMilestone(run, member.id, iteration, {
                            status: 'succeeded',
                            completedAt: step.completedAt,
                            summary: result.content,
                        });
                        await this.upsertTeamRun(run);
                    }
                    catch (error) {
                        step.status = 'failed';
                        step.completedAt = Date.now();
                        step.error = error instanceof Error ? error.message : String(error);
                        this.updateTeamRunMilestone(run, member.id, iteration, {
                            status: 'failed',
                            completedAt: step.completedAt,
                            summary: step.error,
                        });
                        await this.upsertTeamRun(run);
                        throw error;
                    }
                }
            }
            this.assertTeamGovernanceSatisfied(team, run);
            run.status = 'succeeded';
            run.completedAt = Date.now();
            run.summary = this.summarizeTeamRun(run);
            run.artifactPath = await this.writeTeamRunArtifact(run);
            await this.completeTeamRun(team.id, run, 'completed', run.summary);
            return run;
        }
        catch (error) {
            run.status = 'failed';
            run.completedAt = Date.now();
            run.error = error instanceof Error ? error.message : String(error);
            run.artifactPath = await this.writeTeamRunArtifact(run);
            await this.completeTeamRun(team.id, run, 'paused', run.error);
            return run;
        }
        finally {
            this.runningTeamIds.delete(teamId);
        }
    }
    async executeTask(taskId, trigger) {
        if (this.runningTaskIds.has(taskId)) {
            const running = (await this.listTasks()).find(task => task.id === taskId);
            if (!running) {
                throw new Error(`Scheduled task not found: ${taskId}`);
            }
            return running;
        }
        this.runningTaskIds.add(taskId);
        const startedAt = Date.now();
        const runId = this.createId(`task-run-${trigger}`);
        try {
            let store = await this.readStore();
            const task = store.tasks.find(candidate => candidate.id === taskId);
            if (!task) {
                throw new Error(`Scheduled task not found: ${taskId}`);
            }
            const run = {
                id: runId,
                taskId: task.id,
                taskName: task.name,
                status: 'running',
                startedAt,
            };
            task.lastRunAt = startedAt;
            task.lastStatus = 'running';
            task.lastResult = 'Running...';
            task.updatedAt = startedAt;
            store.taskRuns = [run, ...store.taskRuns].slice(0, MAX_RUN_HISTORY);
            await this.writeStore(store);
            try {
                if (!this.taskExecutor) {
                    throw new Error('No automation task executor is configured. Start the desktop app or configure a CLI OpenAI-compatible backend.');
                }
                const result = await this.taskExecutor(task, {
                    workspacePath: this.workspacePath,
                    enabledSkills: await this.getEnabledSkillContext(),
                });
                this.assertExecutionCompleted(result.content);
                const completedAt = Date.now();
                store = await this.readStore();
                const updatedTask = store.tasks.find(candidate => candidate.id === taskId);
                const updatedRun = store.taskRuns.find(candidate => candidate.id === runId);
                if (updatedTask) {
                    updatedTask.lastRunAt = startedAt;
                    updatedTask.lastStatus = 'succeeded';
                    updatedTask.lastResult = result.content;
                    updatedTask.retryAttempts = 0;
                    updatedTask.nextRunAt = completedAt + updatedTask.intervalMinutes * 60000;
                    updatedTask.updatedAt = completedAt;
                }
                if (updatedRun) {
                    updatedRun.status = 'succeeded';
                    updatedRun.completedAt = completedAt;
                    updatedRun.result = result.content;
                    updatedRun.model = result.model;
                    updatedRun.usage = result.usage;
                }
                await this.writeStore(store);
                if (updatedTask && updatedRun) {
                    await this.emitTaskNotification(updatedTask, updatedRun, 'succeeded', result.content);
                }
                return updatedTask ?? task;
            }
            catch (error) {
                const completedAt = Date.now();
                const message = error instanceof Error ? error.message : String(error);
                store = await this.readStore();
                const updatedTask = store.tasks.find(candidate => candidate.id === taskId);
                const updatedRun = store.taskRuns.find(candidate => candidate.id === runId);
                if (updatedTask) {
                    updatedTask.lastRunAt = startedAt;
                    updatedTask.lastStatus = 'failed';
                    updatedTask.lastResult = message;
                    const retryPolicy = this.normalizeRetryPolicy(updatedTask.retryPolicy);
                    const retryAttempts = Number(updatedTask.retryAttempts ?? 0);
                    const shouldRetry = retryPolicy.enabled && retryAttempts < retryPolicy.maxRetries;
                    updatedTask.retryAttempts = shouldRetry ? retryAttempts + 1 : 0;
                    updatedTask.nextRunAt = shouldRetry
                        ? completedAt + retryPolicy.retryDelayMinutes * 60000
                        : completedAt + updatedTask.intervalMinutes * 60000;
                    updatedTask.updatedAt = completedAt;
                }
                if (updatedRun) {
                    updatedRun.status = 'failed';
                    updatedRun.completedAt = completedAt;
                    updatedRun.error = message;
                }
                await this.writeStore(store);
                if (updatedTask && updatedRun) {
                    await this.emitTaskNotification(updatedTask, updatedRun, 'failed', message);
                }
                return updatedTask ?? task;
            }
        }
        finally {
            this.runningTaskIds.delete(taskId);
        }
    }
    shouldSkipMissedRun(task, now) {
        if (this.normalizeMissedRunPolicy(task.missedRunPolicy) !== 'skip') {
            return false;
        }
        const overdueByMs = now - Number(task.nextRunAt);
        return Number.isFinite(overdueByMs) && overdueByMs > SCHEDULER_INTERVAL_MS * 2;
    }
    async skipMissedTaskRun(taskId, now) {
        const store = await this.readStore();
        const task = store.tasks.find(candidate => candidate.id === taskId);
        if (!task) {
            throw new Error(`Scheduled task not found: ${taskId}`);
        }
        const missedAt = Number(task.nextRunAt);
        const message = Number.isFinite(missedAt)
            ? `Missed scheduled run skipped. It was due ${new Date(missedAt).toLocaleString()}.`
            : 'Missed scheduled run skipped.';
        const run = {
            id: this.createId('task-run-skipped'),
            taskId: task.id,
            taskName: task.name,
            status: 'skipped',
            startedAt: now,
            completedAt: now,
            result: message,
        };
        task.lastRunAt = now;
        task.lastStatus = 'skipped';
        task.lastResult = message;
        task.retryAttempts = 0;
        task.nextRunAt = this.computeNextRunAtAfter(missedAt, task.intervalMinutes, now);
        task.updatedAt = now;
        store.taskRuns = [run, ...store.taskRuns].slice(0, MAX_RUN_HISTORY);
        await this.writeStore(store);
        return task;
    }
    scheduleTickSoon() {
        if (!this.schedulerTimer) {
            return;
        }
        setTimeout(() => {
            this.runDueTasks().catch(error => {
                console.warn('Scheduled automation immediate tick failed:', error);
            });
        }, 250).unref?.();
    }
    async listenRemoteServer(startPort) {
        for (let port = startPort; port < startPort + 20; port += 1) {
            const server = http.createServer((request, response) => {
                this.handleRemoteRequest(request, response).catch(error => {
                    this.sendJson(response, 500, {
                        error: error instanceof Error ? error.message : String(error),
                    });
                });
            });
            const listened = await new Promise(resolve => {
                server.once('error', () => {
                    server.close();
                    resolve({ ok: false });
                });
                server.listen(port, '0.0.0.0', () => {
                    resolve({ ok: true, port: server.address().port });
                });
            });
            if (listened.ok) {
                return { server, port: listened.port };
            }
        }
        throw new Error(`Unable to start remote-control server near port ${startPort}`);
    }
    async handleRemoteRequest(request, response) {
        const requestUrl = new url_1.URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
        const pathname = requestUrl.pathname;
        if (!this.checkRemoteRateLimit(request, pathname)) {
            this.sendJson(response, 429, { error: 'Too many remote-control requests. Try again shortly.' });
            return;
        }
        if (request.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
            this.sendHtml(response, this.renderRemoteControlPage());
            return;
        }
        if (request.method === 'GET' && pathname === '/api/status') {
            this.sendJson(response, 200, {
                workspacePath: this.workspacePath,
                remoteControl: await this.getRemoteControl(),
            });
            return;
        }
        if (request.method === 'POST' && pathname === '/api/pair') {
            const body = await this.readJsonBody(request);
            this.sendJson(response, 200, await this.pairRemoteDevice(String(body.code ?? ''), String(body.deviceName ?? 'Phone')));
            return;
        }
        const device = await this.requireRemoteDevice(request);
        if (!device) {
            this.sendJson(response, 401, { error: 'Pair this device first.' });
            return;
        }
        if (request.method === 'GET' && pathname === '/api/tasks') {
            this.sendJson(response, 200, { tasks: await this.listTasks(), runs: await this.listTaskRuns() });
            return;
        }
        const taskRunMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/run$/);
        if (request.method === 'POST' && taskRunMatch) {
            this.sendJson(response, 200, { task: await this.executeTask(taskRunMatch[1], 'remote') });
            return;
        }
        if (request.method === 'GET' && pathname === '/api/teams') {
            this.sendJson(response, 200, { teams: await this.listTeams(), runs: await this.listTeamRuns() });
            return;
        }
        const teamRunMatch = pathname.match(/^\/api\/teams\/([^/]+)\/run$/);
        if (request.method === 'POST' && teamRunMatch) {
            this.sendJson(response, 200, { run: await this.runTeam(teamRunMatch[1]) });
            return;
        }
        if (request.method === 'GET' && pathname === '/api/approvals') {
            const remote = await this.getRemoteControl();
            this.sendJson(response, 200, { approvals: remote.pendingActions ?? [] });
            return;
        }
        const approvalMatch = pathname.match(/^\/api\/approvals\/([^/]+)$/);
        if (request.method === 'POST' && approvalMatch) {
            const body = await this.readJsonBody(request);
            this.sendJson(response, 200, await this.resolveApprovalRequest(approvalMatch[1], Boolean(body.approved), typeof body.reason === 'string' ? body.reason : undefined, device.name));
            return;
        }
        this.sendJson(response, 404, { error: 'Not found' });
    }
    async pairRemoteDevice(code, deviceName) {
        const store = await this.readStore();
        const expectedCode = store.remoteControl.pairingCode;
        if (!expectedCode || expectedCode !== code.trim()) {
            throw new Error('Invalid remote-control pairing code.');
        }
        if (!store.remoteControl.pairingExpiresAt || store.remoteControl.pairingExpiresAt < Date.now()) {
            throw new Error('Remote-control pairing code has expired.');
        }
        const token = crypto.randomBytes(32).toString('base64url');
        const now = Date.now();
        const device = {
            id: this.createId('device'),
            name: deviceName.trim() || 'Phone',
            createdAt: now,
            lastSeenAt: now,
            tokenHash: this.hashToken(token),
        };
        store.remoteControl = this.normalizeRemoteControl({
            ...store.remoteControl,
            pairingCode: undefined,
            pairingTokenHash: undefined,
            pairingExpiresAt: undefined,
            pendingApprovals: [],
            approvedDevices: [
                device,
                ...store.remoteControl.approvedDevices,
            ].slice(0, 20),
            auditLog: this.appendRemoteAudit(store.remoteControl.auditLog, {
                type: 'device-paired',
                message: `Paired remote device "${device.name}".`,
                deviceId: device.id,
                deviceName: device.name,
            }),
        });
        await this.writeStore(store);
        return {
            token,
            device: {
                id: device.id,
                name: device.name,
                createdAt: device.createdAt,
                lastSeenAt: device.lastSeenAt,
            },
            remoteControl: this.sanitizeRemoteControl(store.remoteControl),
        };
    }
    async requireRemoteDevice(request) {
        const authorization = request.headers.authorization ?? '';
        const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : '';
        if (!token) {
            return null;
        }
        const tokenHash = this.hashToken(token);
        const store = await this.readStore();
        const device = store.remoteControl.approvedDevices.find(candidate => candidate.tokenHash === tokenHash);
        if (!device) {
            return null;
        }
        device.lastSeenAt = Date.now();
        await this.writeStore(store);
        return { id: device.id, name: device.name };
    }
    checkRemoteRateLimit(request, pathname) {
        const now = Date.now();
        const authorization = request.headers.authorization ?? '';
        const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : '';
        const address = request.socket.remoteAddress ?? 'unknown';
        const identity = token ? this.hashToken(token).slice(0, 16) : 'anonymous';
        const route = pathname === '/api/pair' ? 'pair' : 'api';
        const limit = route === 'pair'
            ? REMOTE_PAIR_RATE_LIMIT_MAX_REQUESTS
            : REMOTE_RATE_LIMIT_MAX_REQUESTS;
        const key = `${address}:${identity}:${route}`;
        let bucket = this.remoteRateLimits.get(key);
        if (!bucket || bucket.resetAt <= now) {
            bucket = {
                count: 0,
                resetAt: now + REMOTE_RATE_LIMIT_WINDOW_MS,
            };
        }
        bucket.count += 1;
        this.remoteRateLimits.set(key, bucket);
        if (this.remoteRateLimits.size > 1000) {
            for (const [bucketKey, value] of this.remoteRateLimits.entries()) {
                if (value.resetAt <= now) {
                    this.remoteRateLimits.delete(bucketKey);
                }
            }
        }
        return bucket.count <= limit;
    }
    async readJsonBody(request) {
        const chunks = [];
        let size = 0;
        for await (const chunk of request) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            size += buffer.length;
            if (size > 1024 * 1024) {
                throw new Error('Remote request body is too large.');
            }
            chunks.push(buffer);
        }
        const raw = Buffer.concat(chunks).toString('utf-8').trim();
        if (!raw) {
            return {};
        }
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Remote request body must be a JSON object.');
        }
        return parsed;
    }
    sendJson(response, statusCode, payload) {
        response.writeHead(statusCode, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
            'access-control-allow-origin': '*',
        });
        response.end(JSON.stringify(payload, null, 2));
    }
    sendHtml(response, html) {
        response.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
        });
        response.end(html);
    }
    renderRemoteControlPage() {
        return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CodeAgent Remote</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f5f2ed; color: #241f1a; }
    main { max-width: 760px; margin: 0 auto; padding: 20px; }
    section { background: #fffaf3; border: 1px solid #ded6ca; border-radius: 8px; padding: 16px; margin: 14px 0; }
    h1 { font-size: 24px; margin: 0 0 6px; }
    h2 { font-size: 16px; margin: 0 0 12px; }
    input, button { font: inherit; border-radius: 6px; border: 1px solid #c8beb0; padding: 10px; }
    input { width: calc(100% - 22px); margin: 6px 0; background: white; }
    button { background: #2d2a26; color: white; border-color: #2d2a26; margin: 4px 6px 4px 0; }
    button.secondary { background: white; color: #2d2a26; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #f0ebe4; padding: 10px; border-radius: 6px; }
    .muted { color: #6f675d; }
  </style>
</head>
<body>
  <main>
    <h1>CodeAgent Remote</h1>
    <p class="muted" id="workspace">Loading...</p>
    <section id="pairing">
      <h2>Pair Device</h2>
      <input id="deviceName" placeholder="Device name" value="Phone">
      <input id="pairingCode" placeholder="Pairing code">
      <button onclick="pair()">Pair</button>
      <p class="muted">Pairing codes are created from the desktop Automation view.</p>
    </section>
    <section><h2>Pending Approvals</h2><div id="approvals"></div></section>
    <section><h2>Scheduled Tasks</h2><div id="tasks"></div></section>
    <section><h2>Virtual Teams</h2><div id="teams"></div></section>
  </main>
  <script>
    const tokenKey = 'codeAgentRemoteToken';
    const token = () => localStorage.getItem(tokenKey) || '';
    async function api(path, options = {}) {
      const headers = { 'content-type': 'application/json', ...(options.headers || {}) };
      if (token()) headers.authorization = 'Bearer ' + token();
      const response = await fetch(path, { ...options, headers });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || response.statusText);
      return data;
    }
    async function pair() {
      const data = await api('/api/pair', {
        method: 'POST',
        body: JSON.stringify({
          code: document.getElementById('pairingCode').value,
          deviceName: document.getElementById('deviceName').value
        })
      });
      localStorage.setItem(tokenKey, data.token);
      document.getElementById('pairing').style.display = 'none';
      await refresh();
    }
    async function approve(id, approved) {
      await api('/api/approvals/' + encodeURIComponent(id), {
        method: 'POST',
        body: JSON.stringify({ approved })
      });
      await refresh();
    }
    async function runTask(id) {
      await api('/api/tasks/' + encodeURIComponent(id) + '/run', { method: 'POST', body: '{}' });
      await refresh();
    }
    async function runTeam(id) {
      await api('/api/teams/' + encodeURIComponent(id) + '/run', { method: 'POST', body: '{}' });
      await refresh();
    }
    function renderList(target, items, render) {
      document.getElementById(target).innerHTML = items.length ? items.map(render).join('') : '<p class="muted">None</p>';
    }
    async function refresh() {
      const status = await api('/api/status');
      document.getElementById('workspace').textContent = status.workspacePath;
      document.getElementById('pairing').style.display = token() ? 'none' : 'block';
      if (!token()) return;
      const approvals = await api('/api/approvals');
      renderList('approvals', approvals.approvals || [], item =>
        '<article><strong>' + item.title + '</strong><pre>' + JSON.stringify(item.details, null, 2) + '</pre>' +
        '<button onclick="approve(\\'' + item.id + '\\', true)">Approve</button>' +
        '<button class="secondary" onclick="approve(\\'' + item.id + '\\', false)">Reject</button></article>'
      );
      const tasks = await api('/api/tasks');
      renderList('tasks', tasks.tasks || [], task =>
        '<article><strong>' + task.name + '</strong><p>' + task.prompt + '</p><p class="muted">' + (task.lastStatus || 'never run') + '</p>' +
        '<button onclick="runTask(\\'' + task.id + '\\')">Run</button></article>'
      );
      const teams = await api('/api/teams');
      renderList('teams', teams.teams || [], team =>
        '<article><strong>' + team.name + '</strong><p>' + team.objective + '</p><p class="muted">' + team.status + '</p>' +
        '<button onclick="runTeam(\\'' + team.id + '\\')">Run</button></article>'
      );
    }
    refresh().catch(error => {
      document.getElementById('workspace').textContent = error.message;
    });
    setInterval(() => refresh().catch(() => {}), 5000);
  </script>
</body>
</html>`;
    }
    getLocalNetworkUrls(port) {
        const urls = [];
        for (const interfaces of Object.values(os.networkInterfaces())) {
            for (const network of interfaces ?? []) {
                if (network.family === 'IPv4' && !network.internal) {
                    urls.push(`http://${network.address}:${port}`);
                }
            }
        }
        return urls;
    }
    sanitizeRemoteControl(remoteControl) {
        return {
            ...remoteControl,
            pairingTokenHash: undefined,
            approvedDevices: remoteControl.approvedDevices.map(device => ({
                id: device.id,
                name: device.name,
                createdAt: device.createdAt,
                lastSeenAt: device.lastSeenAt,
            })),
            pendingActions: (remoteControl.pendingActions ?? []).filter(action => action.status === 'pending'),
            auditLog: (remoteControl.auditLog ?? []).slice(0, 100),
        };
    }
    hashToken(token) {
        return crypto.createHash('sha256').update(token).digest('hex');
    }
    async createFallbackTeamStep(team, member, previousSteps) {
        const previous = previousSteps
            .filter(step => step.output)
            .map(step => `- ${step.role}: ${step.output}`)
            .join('\n');
        return {
            content: [
                `${member.role} step for "${team.name}"`,
                `Objective: ${team.objective}`,
                `Goal: ${member.goal}`,
                previous ? `Previous team context:\n${previous}` : 'No previous team context.',
                'No LLM executor was configured, so this run produced a deterministic planning artifact only.',
            ].join('\n\n'),
        };
    }
    assertExecutionCompleted(content) {
        if (content.includes(TOOL_ROUND_LIMIT_MESSAGE)) {
            throw new Error(`${TOOL_ROUND_LIMIT_MESSAGE} The automation step did not finish. Increase the desktop tool-call round limit or make the team objective more explicit.`);
        }
    }
    assertTeamGovernanceSatisfied(team, run) {
        if (!team.requireQaSignoff) {
            return;
        }
        const hasQaOrReviewerSignoff = run.steps.some(step => {
            const role = step.role.toLowerCase();
            return step.status === 'succeeded'
                && (role.includes('qa') || role.includes('quality') || role.includes('review') || role.includes('test'));
        });
        if (!hasQaOrReviewerSignoff) {
            throw new Error('Team requires QA/reviewer signoff, but no QA, reviewer, quality, or test role completed successfully.');
        }
    }
    createTeamRunMilestones(team, maxIterations, createdAt) {
        const milestones = [];
        for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
            for (const member of team.members) {
                milestones.push({
                    id: `iteration-${iteration}-${member.id}`,
                    title: `${iteration > 1 ? `Iteration ${iteration}: ` : ''}${member.role} handoff`,
                    ownerRole: member.role,
                    memberId: member.id,
                    memberName: member.name,
                    iteration,
                    status: 'pending',
                    createdAt,
                });
            }
        }
        return milestones;
    }
    updateTeamRunMilestone(run, memberId, iteration, update) {
        const milestone = run.milestones?.find(candidate => (candidate.memberId === memberId && candidate.iteration === iteration));
        if (!milestone) {
            return;
        }
        if (update.status) {
            milestone.status = update.status;
        }
        if (update.startedAt) {
            milestone.startedAt = update.startedAt;
        }
        if (update.completedAt) {
            milestone.completedAt = update.completedAt;
        }
        if (update.summary) {
            milestone.summary = update.summary.replace(/\s+/g, ' ').slice(0, 240);
        }
    }
    async emitTaskNotification(task, run, status, message) {
        const policy = this.normalizeNotificationPolicy(task.notificationPolicy);
        if (policy.channel === 'none') {
            return;
        }
        if (status === 'succeeded' && !policy.onSuccess) {
            return;
        }
        if (status === 'failed' && !policy.onFailure) {
            return;
        }
        if (!this.notificationEmitter) {
            return;
        }
        try {
            await this.notificationEmitter({
                task,
                run,
                status,
                channel: policy.channel,
                message,
            });
        }
        catch (error) {
            console.warn('Automation notification delivery failed:', error);
        }
    }
    summarizeTeamRun(run) {
        const succeeded = run.steps.filter(step => step.status === 'succeeded').length;
        const failed = run.steps.filter(step => step.status === 'failed').length;
        return `Team run ${run.id} completed with ${succeeded} succeeded step(s) and ${failed} failed step(s).`;
    }
    async ensureTeamWorkspaceSeed(team) {
        const runWorkspacePath = this.normalizeWorkspacePath(team.workspacePath) ?? this.workspacePath;
        await fs.mkdir(path.join(runWorkspacePath, '.code-agent'), { recursive: true });
        const blueprint = [
            `# ${team.name}`,
            '',
            '## Objective',
            '',
            team.objective,
            '',
            '## Execution',
            '',
            `- Permission mode: ${team.permissionMode ?? 'full-access'}`,
            `- Supervisor: ${team.supervisorId}`,
            '',
            '## Members',
            '',
            ...team.members.map(member => `- ${member.name} (${member.role}): ${member.goal}`),
            '',
        ].join('\n');
        await fs.writeFile(path.join(runWorkspacePath, '.code-agent', 'team-blueprint.md'), blueprint, 'utf-8');
        const readmePath = path.join(runWorkspacePath, 'README.md');
        try {
            await fs.access(readmePath);
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
            await fs.writeFile(readmePath, [
                `# ${team.name}`,
                '',
                team.objective,
                '',
                'This workspace was initialized by CodeAgent virtual team automation.',
                '',
            ].join('\n'), 'utf-8');
        }
    }
    async writeTeamRunArtifact(run) {
        const runWorkspacePath = this.normalizeWorkspacePath(run.workspacePath) ?? this.workspacePath;
        const artifactDir = path.join(runWorkspacePath, '.code-agent', 'team-runs');
        await fs.mkdir(artifactDir, { recursive: true });
        const artifactPath = path.join(artifactDir, `${run.id}.md`);
        const lines = [
            `# ${run.teamName} Run`,
            '',
            `- Run ID: ${run.id}`,
            `- Team ID: ${run.teamId}`,
            `- Status: ${run.status}`,
            run.workspacePath ? `- Workspace: ${run.workspacePath}` : '',
            `- Started: ${new Date(run.startedAt).toISOString()}`,
            run.completedAt ? `- Completed: ${new Date(run.completedAt).toISOString()}` : '',
            '',
            '## Objective',
            '',
            run.objective,
            '',
            '## Summary',
            '',
            run.summary ?? run.error ?? 'Run in progress.',
            '',
            '## Milestones',
            '',
            ...(run.milestones ?? []).map(milestone => [
                `- [${milestone.status === 'succeeded' ? 'x' : ' '}] ${milestone.title} (${milestone.status})`,
                milestone.summary ? `  - ${milestone.summary}` : '',
            ].filter(Boolean).join('\n')),
            (run.milestones ?? []).length === 0 ? 'No structured milestones recorded.' : '',
            '',
            '## Steps',
            '',
            ...run.steps.flatMap(step => [
                `### ${step.role} - ${step.memberName}`,
                '',
                `Status: ${step.status}`,
                '',
                step.output ?? step.error ?? 'No output.',
                '',
            ]),
        ].filter(Boolean);
        await fs.writeFile(artifactPath, `${lines.join('\n')}\n`, 'utf-8');
        const relative = path.relative(this.workspacePath, artifactPath);
        return relative.startsWith('..') || path.isAbsolute(relative)
            ? artifactPath
            : relative;
    }
    async upsertTeamRun(run) {
        const store = await this.readStore();
        store.teamRuns = [
            run,
            ...store.teamRuns.filter(candidate => candidate.id !== run.id),
        ].slice(0, MAX_RUN_HISTORY);
        await this.writeStore(store);
    }
    async completeTeamRun(teamId, run, status, result) {
        const store = await this.readStore();
        const team = store.teams.find(candidate => candidate.id === teamId);
        if (team) {
            team.status = status;
            team.lastRunAt = run.startedAt;
            team.lastStatus = run.status;
            team.lastResult = result;
            team.updatedAt = Date.now();
        }
        store.teamRuns = [
            run,
            ...store.teamRuns.filter(candidate => candidate.id !== run.id),
        ].slice(0, MAX_RUN_HISTORY);
        await this.writeStore(store);
    }
    async discoverSkillsInDirectory(dir, source) {
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            const manifests = [];
            for (const entry of entries) {
                const entryPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    const skillPath = path.join(entryPath, 'SKILL.md');
                    const manifest = await this.readSkillFile(skillPath, entry.name, source);
                    if (manifest) {
                        manifests.push(manifest);
                    }
                }
                else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
                    const manifest = await this.readSkillFile(entryPath, path.basename(entry.name, '.md'), source);
                    if (manifest) {
                        manifests.push(manifest);
                    }
                }
            }
            return manifests;
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }
    async readSkillFile(skillPath, fallbackName, source) {
        try {
            const content = await fs.readFile(skillPath, 'utf-8');
            const stats = await fs.stat(skillPath);
            const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
            const description = content
                .split('\n')
                .map(line => line.trim())
                .find(line => line && !line.startsWith('#')) ?? '';
            const name = heading || fallbackName;
            return {
                id: this.slug(`${source}-${path.relative(this.workspacePath, skillPath)}`),
                name,
                description,
                path: skillPath,
                source,
                enabled: true,
                updatedAt: stats.mtimeMs,
            };
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return null;
            }
            throw error;
        }
    }
    createDefaultMembers() {
        return [
            {
                id: 'supervisor',
                name: 'Supervisor',
                role: 'Supervisor',
                goal: 'Coordinate the virtual team, split work, review progress, and decide when human approval is needed.',
                tools: ['tasks', 'review', 'approval'],
            },
            {
                id: 'project-manager',
                name: 'Project Manager',
                role: 'Project Manager',
                goal: 'Turn the human blueprint into milestones, risks, and acceptance criteria.',
                tools: ['planning', 'tasks'],
            },
            {
                id: 'developer',
                name: 'Developer',
                role: 'Developer',
                goal: 'Implement scoped changes and keep the workspace buildable.',
                tools: ['filesystem', 'bash', 'git'],
            },
            {
                id: 'qa',
                name: 'QA',
                role: 'QA',
                goal: 'Design and run validation, report defects, and confirm acceptance criteria.',
                tools: ['bash', 'test', 'review'],
            },
        ];
    }
    async readStore() {
        const hasProjectManifest = await this.exists(this.projectManifestPath);
        if (!hasProjectManifest && await this.exists(this.legacyStorePath)) {
            const migrated = await this.readLegacyStore();
            await this.writeStore(migrated);
            return migrated;
        }
        const skillPolicies = await this.readJsonFile(this.skillPoliciesPath, {});
        const tasks = await this.readJsonDirectory(this.tasksDir);
        const taskRuns = await this.readJsonDirectory(this.taskRunsDir);
        const teams = await this.readJsonDirectory(this.teamsDir);
        const teamRuns = await this.readJsonDirectory(this.teamRunsDir);
        const remoteControl = await this.readJsonFile(this.remoteControlPath, undefined);
        return {
            version: 1,
            skillPolicies: skillPolicies && typeof skillPolicies === 'object' ? skillPolicies : {},
            tasks: tasks.filter(this.isScheduledTask).map(task => this.normalizeScheduledTask(task)),
            taskRuns: taskRuns.filter(this.isTaskRun),
            remoteControl: this.normalizeRemoteControl(remoteControl),
            teams: teams.filter(this.isVirtualTeam).map(team => this.normalizeVirtualTeam(team)),
            teamRuns: teamRuns.filter(this.isTeamRun),
        };
    }
    async writeStore(store) {
        await fs.mkdir(this.projectDir, { recursive: true });
        await this.ensureProjectGitignore();
        await this.writeJsonFile(this.projectManifestPath, {
            version: 1,
            workspacePath: this.workspacePath,
            updatedAt: Date.now(),
        });
        await this.writeJsonFile(this.skillPoliciesPath, store.skillPolicies ?? {});
        await this.syncJsonDirectory(this.tasksDir, store.tasks.map(task => this.normalizeScheduledTask(task)), task => task.id);
        await this.syncJsonDirectory(this.taskRunsDir, store.taskRuns, run => run.id);
        await this.syncJsonDirectory(this.teamsDir, store.teams.map(team => this.normalizeVirtualTeam(team)), team => team.id);
        await this.syncJsonDirectory(this.teamRunsDir, store.teamRuns, run => run.id);
        await this.writeJsonFile(this.remoteControlPath, this.normalizeRemoteControl(store.remoteControl));
    }
    createDefaultStore() {
        return {
            version: 1,
            skillPolicies: {},
            tasks: [],
            taskRuns: [],
            remoteControl: this.normalizeRemoteControl(undefined),
            teams: [],
            teamRuns: [],
        };
    }
    async readLegacyStore() {
        try {
            const raw = await fs.readFile(this.legacyStorePath, 'utf-8');
            const parsed = JSON.parse(raw);
            return {
                version: 1,
                skillPolicies: parsed.skillPolicies && typeof parsed.skillPolicies === 'object'
                    ? parsed.skillPolicies
                    : {},
                tasks: Array.isArray(parsed.tasks)
                    ? parsed.tasks.filter(this.isScheduledTask).map(task => this.normalizeScheduledTask(task))
                    : [],
                taskRuns: Array.isArray(parsed.taskRuns) ? parsed.taskRuns.filter(this.isTaskRun) : [],
                remoteControl: this.normalizeRemoteControl(parsed.remoteControl),
                teams: Array.isArray(parsed.teams)
                    ? parsed.teams.filter(this.isVirtualTeam).map(team => this.normalizeVirtualTeam(team))
                    : [],
                teamRuns: Array.isArray(parsed.teamRuns) ? parsed.teamRuns.filter(this.isTeamRun) : [],
            };
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return this.createDefaultStore();
            }
            throw error;
        }
    }
    async exists(filePath) {
        try {
            await fs.access(filePath);
            return true;
        }
        catch {
            return false;
        }
    }
    async readJsonFile(filePath, fallback) {
        try {
            return JSON.parse(await fs.readFile(filePath, 'utf-8'));
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return fallback;
            }
            throw error;
        }
    }
    async writeJsonFile(filePath, data) {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
    }
    async readJsonDirectory(dirPath) {
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            const values = [];
            for (const entry of entries) {
                if (!entry.isFile() || !entry.name.endsWith('.json')) {
                    continue;
                }
                values.push(await this.readJsonFile(path.join(dirPath, entry.name), undefined));
            }
            return values.filter(value => value !== undefined);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }
    async syncJsonDirectory(dirPath, records, getId) {
        await fs.mkdir(dirPath, { recursive: true });
        const expected = new Set();
        for (const record of records) {
            const filename = `${this.safeFilename(getId(record))}.json`;
            expected.add(filename);
            await this.writeJsonFile(path.join(dirPath, filename), record);
        }
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith('.json') && !expected.has(entry.name)) {
                await fs.unlink(path.join(dirPath, entry.name));
            }
        }
    }
    async ensureProjectGitignore() {
        const gitignorePath = path.join(this.projectDir, '.gitignore');
        const required = ['local/', 'history/'];
        let existing = '';
        try {
            existing = await fs.readFile(gitignorePath, 'utf-8');
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }
        const lines = new Set(existing.split(/\r?\n/).filter(Boolean));
        let changed = false;
        for (const line of required) {
            if (!lines.has(line)) {
                lines.add(line);
                changed = true;
            }
        }
        if (changed || !existing) {
            await fs.mkdir(this.projectDir, { recursive: true });
            await fs.writeFile(gitignorePath, `${Array.from(lines).join('\n')}\n`, 'utf-8');
        }
    }
    safeFilename(value) {
        return value.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || this.createId('record');
    }
    mergeRecords(existing, incoming) {
        const records = new Map();
        for (const record of existing) {
            records.set(record.id, record);
        }
        for (const record of incoming) {
            records.set(record.id, record);
        }
        return Array.from(records.values());
    }
    isScheduledTask(value) {
        return Boolean(value && typeof value === 'object' && typeof value.id === 'string');
    }
    isTaskRun(value) {
        return Boolean(value && typeof value === 'object' && typeof value.id === 'string');
    }
    isVirtualTeam(value) {
        return Boolean(value && typeof value === 'object' && typeof value.id === 'string');
    }
    isTeamRun(value) {
        return Boolean(value && typeof value === 'object' && typeof value.id === 'string');
    }
    normalizeRemoteControl(value) {
        const raw = value && typeof value === 'object' ? value : {};
        const mode = raw.mode === 'local-network' || raw.mode === 'relay'
            ? raw.mode
            : raw.enabled
                ? 'local-network'
                : 'disabled';
        return {
            enabled: Boolean(raw.enabled),
            mode,
            serverPort: typeof raw.serverPort === 'number' ? raw.serverPort : undefined,
            serverUrl: typeof raw.serverUrl === 'string' ? raw.serverUrl : undefined,
            localNetworkUrls: Array.isArray(raw.localNetworkUrls) ? raw.localNetworkUrls.map(String) : [],
            pairingCode: typeof raw.pairingCode === 'string' ? raw.pairingCode : undefined,
            pairingTokenHash: typeof raw.pairingTokenHash === 'string' ? raw.pairingTokenHash : undefined,
            pairingExpiresAt: typeof raw.pairingExpiresAt === 'number' ? raw.pairingExpiresAt : undefined,
            approvedDevices: Array.isArray(raw.approvedDevices) ? raw.approvedDevices : [],
            pendingApprovals: Array.isArray(raw.pendingApprovals) ? raw.pendingApprovals : [],
            pendingActions: Array.isArray(raw.pendingActions)
                ? raw.pendingActions.filter(action => action?.status === 'pending' && Number(action.expiresAt ?? 0) > Date.now())
                : [],
            auditLog: Array.isArray(raw.auditLog)
                ? raw.auditLog
                    .filter(event => event && typeof event.id === 'string' && typeof event.message === 'string')
                    .slice(0, 100)
                : [],
        };
    }
    appendRemoteAudit(current, event) {
        return [
            {
                id: this.createId('remote-audit'),
                createdAt: Date.now(),
                ...event,
            },
            ...(current ?? []),
        ].slice(0, 100);
    }
    normalizeInterval(value) {
        const parsed = Number(value ?? DEFAULT_INTERVAL_MINUTES);
        if (!Number.isFinite(parsed) || parsed < 1) {
            return DEFAULT_INTERVAL_MINUTES;
        }
        return Math.min(Math.floor(parsed), 60 * 24 * 30);
    }
    normalizeRetryPolicy(value) {
        const raw = value && typeof value === 'object' ? value : {};
        const maxRetries = Number(raw.maxRetries ?? 0);
        const retryDelayMinutes = Number(raw.retryDelayMinutes ?? DEFAULT_RETRY_DELAY_MINUTES);
        return {
            enabled: Boolean(raw.enabled),
            maxRetries: Number.isFinite(maxRetries) ? Math.min(Math.max(Math.floor(maxRetries), 0), 10) : 0,
            retryDelayMinutes: Number.isFinite(retryDelayMinutes)
                ? Math.min(Math.max(Math.floor(retryDelayMinutes), 1), 60 * 24)
                : DEFAULT_RETRY_DELAY_MINUTES,
        };
    }
    normalizeNotificationPolicy(value) {
        const raw = value && typeof value === 'object' ? value : {};
        const channel = raw.channel === 'desktop' || raw.channel === 'remote' || raw.channel === 'none'
            ? raw.channel
            : 'desktop';
        return {
            onSuccess: Boolean(raw.onSuccess),
            onFailure: raw.onFailure !== false,
            channel,
        };
    }
    normalizeMissedRunPolicy(value) {
        return value === 'skip' ? 'skip' : 'run-once';
    }
    normalizeScheduledTask(task) {
        return {
            ...task,
            intervalMinutes: this.normalizeInterval(task.intervalMinutes),
            retryPolicy: this.normalizeRetryPolicy(task.retryPolicy),
            notificationPolicy: this.normalizeNotificationPolicy(task.notificationPolicy),
            missedRunPolicy: this.normalizeMissedRunPolicy(task.missedRunPolicy),
            retryAttempts: Number.isFinite(Number(task.retryAttempts)) ? Math.max(0, Number(task.retryAttempts)) : 0,
        };
    }
    computeNextRunAtAfter(previousNextRunAt, intervalMinutes, now) {
        const intervalMs = this.normalizeInterval(intervalMinutes) * 60000;
        let nextRunAt = Number.isFinite(previousNextRunAt)
            ? previousNextRunAt
            : now + intervalMs;
        while (nextRunAt <= now) {
            nextRunAt += intervalMs;
        }
        return nextRunAt;
    }
    normalizeWorkspacePath(value) {
        if (typeof value !== 'string' || !value.trim()) {
            return undefined;
        }
        const expanded = value.trim().startsWith('~')
            ? path.join(os.homedir(), value.trim().slice(1))
            : value.trim();
        return path.resolve(expanded);
    }
    normalizeTeamPermissionMode(value) {
        return value === 'supervised' ? 'supervised' : 'full-access';
    }
    normalizeTeamMaxIterations(value) {
        const parsed = Number(value ?? 1);
        if (!Number.isFinite(parsed) || parsed < 1) {
            return 1;
        }
        return Math.min(Math.floor(parsed), MAX_TEAM_ITERATIONS);
    }
    normalizeVirtualTeam(team) {
        return {
            ...team,
            workspacePath: this.normalizeWorkspacePath(team.workspacePath),
            permissionMode: this.normalizeTeamPermissionMode(team.permissionMode),
            maxIterations: this.normalizeTeamMaxIterations(team.maxIterations),
            requireQaSignoff: Boolean(team.requireQaSignoff),
            members: Array.isArray(team.members) && team.members.length > 0
                ? team.members.map(member => ({
                    ...member,
                    tools: Array.isArray(member.tools) ? member.tools.map(String) : [],
                }))
                : this.createDefaultMembers(),
        };
    }
    createId(prefix) {
        return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    }
    slug(value) {
        return value
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || this.createId('skill');
    }
}
exports.AutomationServiceBridge = AutomationServiceBridge;
//# sourceMappingURL=automation-service-bridge.js.map