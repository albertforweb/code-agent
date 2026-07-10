/**
 * Service Bridge - Local automation, skills, remote control, and virtual teams.
 *
 * This service is intentionally local-first. It stores project automation state
 * under the workspace and exposes a small durable model that both the desktop
 * app and CLI can build on.
 */

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as http from 'http';
import type { AddressInfo } from 'net';
import * as os from 'os';
import * as path from 'path';
import { URL } from 'url';

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

interface AutomationStore {
  version: 1;
  skillPolicies: Record<string, {
    enabled: boolean;
    trusted?: boolean;
  }>;
  tasks: ScheduledTask[];
  taskRuns: AutomationRunRecord[];
  remoteControl: RemoteControlState;
  teams: VirtualTeamBlueprint[];
  teamRuns: VirtualTeamRunRecord[];
}

interface AutomationProjectManifest {
  version: 1;
  workspacePath: string;
  updatedAt: number;
}

export interface AutomationProjectExport {
  schemaVersion: 1;
  exportedAt: number;
  workspacePath: string;
  skillPolicies: AutomationStore['skillPolicies'];
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

const DEFAULT_INTERVAL_MINUTES = 60;
const DEFAULT_RETRY_DELAY_MINUTES = 15;
const DEFAULT_REMOTE_PORT = 32888;
const SCHEDULER_INTERVAL_MS = 30_000;
const MAX_RUN_HISTORY = 100;
const MAX_SKILL_CONTEXT_CHARS = 24_000;
const MAX_TEAM_ITERATIONS = 5;
const REMOTE_RATE_LIMIT_WINDOW_MS = 60_000;
const REMOTE_RATE_LIMIT_MAX_REQUESTS = 120;
const REMOTE_PAIR_RATE_LIMIT_MAX_REQUESTS = 20;
const TOOL_ROUND_LIMIT_MESSAGE = 'Stopped after reaching the desktop tool-call round limit.';

function normalizeAutomationWorkspacePath(value: string | undefined): string {
  const fallback = os.homedir();
  const raw = typeof value === 'string' && value.trim() ? value.trim() : fallback;
  const expanded = raw.startsWith('~')
    ? path.join(fallback, raw.slice(1))
    : raw;
  const resolved = path.resolve(expanded);

  if (!resolved || resolved === path.parse(resolved).root) {
    return fallback;
  }

  return resolved;
}

export interface AutomationExecutionResult {
  content: string;
  model?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

export type AutomationTaskExecutor = (
  task: ScheduledTask,
  context: {
    workspacePath: string;
    enabledSkills: SkillDetail[];
  },
) => Promise<AutomationExecutionResult>;

export type VirtualTeamPlannerExecutor = (
  team: VirtualTeamBlueprint,
  context: {
    workspacePath: string;
    enabledSkills: SkillDetail[];
  },
) => Promise<AutomationExecutionResult>;

export type AutomationNotificationEmitter = (notification: {
  task: ScheduledTask;
  run: AutomationRunRecord;
  status: 'succeeded' | 'failed';
  channel: AutomationNotificationPolicy['channel'];
  message: string;
}) => Promise<void> | void;

export type VirtualTeamMemberExecutor = (
  team: VirtualTeamBlueprint,
  member: VirtualTeamMember,
  context: {
    runId: string;
    workspacePath: string;
    enabledSkills: SkillDetail[];
    assignment: VirtualTeamAssignmentPlan;
    previousSteps: VirtualTeamRunStep[];
    sharedSteps: VirtualTeamRunStep[];
  },
) => Promise<AutomationExecutionResult>;

type ApprovalResolver = {
  approve: (resolvedBy?: string) => void;
  reject: (reason?: string, resolvedBy?: string) => void;
};

export interface ApprovalResolutionEvent {
  approvalId: string;
  type?: AutomationApprovalRequest['type'];
  title?: string;
  approved: boolean;
  resolvedBy: string;
  reason?: string;
  scope?: Record<string, any>;
}

export class AutomationServiceBridge {
  private readonly projectDir: string;
  private readonly legacyStorePath: string;
  private readonly projectManifestPath: string;
  private readonly skillPoliciesPath: string;
  private readonly tasksDir: string;
  private readonly taskRunsDir: string;
  private readonly teamsDir: string;
  private readonly teamRunsDir: string;
  private readonly localDir: string;
  private readonly remoteControlPath: string;
  private taskExecutor: AutomationTaskExecutor | null = null;
  private teamPlannerExecutor: VirtualTeamPlannerExecutor | null = null;
  private teamMemberExecutor: VirtualTeamMemberExecutor | null = null;
  private notificationEmitter: AutomationNotificationEmitter | null = null;
  private schedulerTimer: NodeJS.Timeout | null = null;
  private schedulerRunning = false;
  private runningTaskIds = new Set<string>();
  private runningTeamIds = new Set<string>();
  private remoteServer: http.Server | null = null;
  private remotePort: number | null = null;
  private approvalResolvers = new Map<string, ApprovalResolver>();
  private remoteRateLimits = new Map<string, { count: number; resetAt: number }>();
  private approvalResolutionEmitter: ((event: ApprovalResolutionEvent) => void) | null = null;

  private readonly workspacePath: string;

  constructor(workspacePath: string = process.cwd()) {
    this.workspacePath = normalizeAutomationWorkspacePath(workspacePath);
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

  setTaskExecutor(executor: AutomationTaskExecutor): void {
    this.taskExecutor = executor;
  }

  setVirtualTeamPlannerExecutor(executor: VirtualTeamPlannerExecutor): void {
    this.teamPlannerExecutor = executor;
  }

  setVirtualTeamMemberExecutor(executor: VirtualTeamMemberExecutor): void {
    this.teamMemberExecutor = executor;
  }

  setNotificationEmitter(emitter: AutomationNotificationEmitter): void {
    this.notificationEmitter = emitter;
  }

  setApprovalResolutionEmitter(emitter: (event: ApprovalResolutionEvent) => void): void {
    this.approvalResolutionEmitter = emitter;
  }

  async listSkills(): Promise<SkillManifest[]> {
    const store = await this.readStore();
    const skillDirs = [
      { dir: path.join(this.workspacePath, '.code-agent', 'skills'), source: 'project' as const },
      { dir: path.join(this.workspacePath, 'skills'), source: 'workspace' as const },
    ];

    const discovered: SkillManifest[] = [];
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

  async getSkill(skillId: string): Promise<SkillDetail> {
    const skills = await this.listSkills();
    const skill = skills.find(candidate => candidate.id === skillId);
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    const content = await fs.readFile(skill.path, 'utf-8');
    return { ...skill, content };
  }

  async setSkillEnabled(skillId: string, enabled: boolean): Promise<SkillManifest> {
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

  async getEnabledSkillContext(): Promise<SkillDetail[]> {
    const skills = (await this.listSkills()).filter(skill => skill.enabled);
    const details: SkillDetail[] = [];
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

  async listTasks(): Promise<ScheduledTask[]> {
    const store = await this.readStore();
    return [...store.tasks].sort((left, right) => left.nextRunAt - right.nextRunAt);
  }

  async listTaskRuns(taskId?: string): Promise<AutomationRunRecord[]> {
    const store = await this.readStore();
    return store.taskRuns
      .filter(run => !taskId || run.taskId === taskId)
      .sort((left, right) => right.startedAt - left.startedAt);
  }

  async saveTask(input: Partial<ScheduledTask>): Promise<ScheduledTask> {
    const store = await this.readStore();
    const now = Date.now();
    const existing = input.id ? store.tasks.find(task => task.id === input.id) : undefined;
    const intervalMinutes = this.normalizeInterval(input.intervalMinutes ?? existing?.intervalMinutes);
    const nextRunAt = Number(input.nextRunAt ?? existing?.nextRunAt ?? now + intervalMinutes * 60_000);

    const task: ScheduledTask = {
      id: existing?.id ?? input.id ?? this.createId('task'),
      name: String(input.name ?? existing?.name ?? 'Scheduled task').trim() || 'Scheduled task',
      prompt: String(input.prompt ?? existing?.prompt ?? '').trim(),
      intervalMinutes,
      enabled: Boolean(input.enabled ?? existing?.enabled ?? true),
      nextRunAt: Number.isFinite(nextRunAt) ? nextRunAt : now + intervalMinutes * 60_000,
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

  async setTaskEnabled(taskId: string, enabled: boolean): Promise<ScheduledTask> {
    const store = await this.readStore();
    const task = store.tasks.find(candidate => candidate.id === taskId);
    if (!task) {
      throw new Error(`Scheduled task not found: ${taskId}`);
    }

    task.enabled = enabled;
    task.updatedAt = Date.now();
    if (enabled && task.nextRunAt < Date.now()) {
      task.nextRunAt = Date.now() + task.intervalMinutes * 60_000;
    }

    await this.writeStore(store);
    this.scheduleTickSoon();
    return task;
  }

  async deleteTask(taskId: string): Promise<{ ok: true; id: string }> {
    const store = await this.readStore();
    store.tasks = store.tasks.filter(task => task.id !== taskId);
    store.taskRuns = store.taskRuns.filter(run => run.taskId !== taskId);
    await this.writeStore(store);
    return { ok: true, id: taskId };
  }

  async exportProjectState(options: { includeRuns?: boolean } = {}): Promise<AutomationProjectExport> {
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

  async importProjectState(input: Partial<AutomationProjectExport>): Promise<AutomationProjectImportResult> {
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

  async runTask(taskId: string): Promise<ScheduledTask> {
    return this.executeTask(taskId, 'manual');
  }

  async runDueTasks(): Promise<ScheduledTask[]> {
    const store = await this.readStore();
    const now = Date.now();
    const due = store.tasks.filter(task => task.enabled && task.nextRunAt <= now);
    const results: ScheduledTask[] = [];

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

  startScheduler(): void {
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

  stopScheduler(): void {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  getSchedulerStatus(): {
    running: boolean;
    intervalMs: number;
    runningTaskIds: string[];
  } {
    return {
      running: Boolean(this.schedulerTimer),
      intervalMs: SCHEDULER_INTERVAL_MS,
      runningTaskIds: Array.from(this.runningTaskIds),
    };
  }

  async getRemoteControl(): Promise<RemoteControlState> {
    const store = await this.readStore();
    return this.sanitizeRemoteControl(store.remoteControl);
  }

  async updateRemoteControl(update: Partial<RemoteControlState>): Promise<RemoteControlState> {
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
    } else if (store.remoteControl.mode === 'relay') {
      await this.closeRemoteControlServer();
    }

    return this.sanitizeRemoteControl(store.remoteControl);
  }

  async configureRemoteRelay(input: {
    brokerUrl: string;
    accountId?: string;
    deviceId?: string;
    relayPublicKey?: string;
    clientKeyId?: string;
    auditCursor?: string;
    tokenRotatesAt?: number;
  }): Promise<RemoteControlState> {
    const brokerUrl = this.normalizeRelayBrokerUrl(input.brokerUrl);
    const store = await this.readStore();
    const now = Date.now();
    const existingRelay = this.normalizeRemoteRelay(store.remoteControl.relay);

    store.remoteControl = this.normalizeRemoteControl({
      ...store.remoteControl,
      relay: {
        ...existingRelay,
        ...input,
        brokerUrl,
        enrollmentStatus: 'enrolled',
        enrolledAt: existingRelay.enrolledAt ?? now,
        disabledAt: undefined,
      },
      auditLog: this.appendRemoteAudit(store.remoteControl.auditLog, {
        type: 'relay-configured',
        message: `Configured managed relay enrollment for ${brokerUrl}.`,
      }),
    });

    await this.writeStore(store);
    return this.sanitizeRemoteControl(store.remoteControl);
  }

  async disableRemoteRelay(): Promise<RemoteControlState> {
    const store = await this.readStore();
    const relay = this.normalizeRemoteRelay(store.remoteControl.relay);
    const wasRelayMode = store.remoteControl.mode === 'relay';

    store.remoteControl = this.normalizeRemoteControl({
      ...store.remoteControl,
      enabled: wasRelayMode ? false : store.remoteControl.enabled,
      mode: wasRelayMode ? 'disabled' : store.remoteControl.mode,
      relay: {
        ...relay,
        enrollmentStatus: 'disabled',
        disabledAt: Date.now(),
      },
      auditLog: this.appendRemoteAudit(store.remoteControl.auditLog, {
        type: 'relay-disabled',
        message: 'Disabled managed relay enrollment.',
      }),
    });

    if (wasRelayMode) {
      await this.closeRemoteControlServer();
    }
    await this.writeStore(store);
    return this.sanitizeRemoteControl(store.remoteControl);
  }

  async revokeRemoteDevice(deviceId: string): Promise<RemoteControlState> {
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

  async createRemotePairingCode(deviceName = 'Mobile device'): Promise<RemoteControlState> {
    const pairingCode = crypto.randomInt(100_000, 1_000_000).toString();
    const pairingToken = crypto.randomBytes(24).toString('base64url');
    const store = await this.readStore();

    store.remoteControl = this.normalizeRemoteControl({
      ...store.remoteControl,
      enabled: true,
      mode: store.remoteControl.mode === 'disabled' ? 'local-network' : store.remoteControl.mode,
      pairingCode,
      pairingTokenHash: crypto.createHash('sha256').update(pairingToken).digest('hex'),
      pairingExpiresAt: Date.now() + 10 * 60_000,
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

  async startRemoteControlServer(): Promise<RemoteControlState> {
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

  async stopRemoteControlServer(): Promise<RemoteControlState> {
    await this.closeRemoteControlServer();

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

  private async closeRemoteControlServer(): Promise<void> {
    if (!this.remoteServer) {
      return;
    }

    await new Promise<void>(resolve => {
      this.remoteServer?.close(() => resolve());
    });
    this.remoteServer = null;
    this.remotePort = null;
  }

  async registerApprovalRequest(
    request: Omit<AutomationApprovalRequest, 'status' | 'createdAt' | 'expiresAt'> & {
      createdAt?: number;
      expiresAt?: number;
    },
    resolver: ApprovalResolver,
  ): Promise<AutomationApprovalRequest> {
    const store = await this.readStore();
    const approval: AutomationApprovalRequest = {
      ...request,
      status: 'pending',
      createdAt: request.createdAt ?? Date.now(),
      expiresAt: request.expiresAt ?? Date.now() + 5 * 60_000,
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

  async resolveApprovalRequest(
    approvalId: string,
    approved: boolean,
    reason?: string,
    resolvedBy = 'desktop',
  ): Promise<{ ok: boolean }> {
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
          status: approved ? 'approved' as const : 'rejected' as const,
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
      } else {
        resolver.reject(reason, resolvedBy);
      }
    }

    if (resolvedBy !== 'desktop') {
      this.approvalResolutionEmitter?.({
        approvalId,
        type: approval?.type,
        title: approval?.title,
        approved,
        resolvedBy,
        reason,
        scope: approval?.details?.scope,
      });
    }

    return { ok: Boolean(resolvedAction || resolver) };
  }

  async expireApprovalRequest(approvalId: string, reason = 'Approval request expired.'): Promise<void> {
    await this.resolveApprovalRequest(approvalId, false, reason, 'system-timeout');
  }

  async listTeams(): Promise<VirtualTeamBlueprint[]> {
    const store = await this.readStore();
    return [...store.teams].sort((left, right) => right.updatedAt - left.updatedAt);
  }

  async listTeamRuns(teamId?: string): Promise<VirtualTeamRunRecord[]> {
    const store = await this.readStore();
    return store.teamRuns
      .filter(run => !teamId || run.teamId === teamId)
      .sort((left, right) => right.startedAt - left.startedAt);
  }

  async saveTeam(input: Partial<VirtualTeamBlueprint>): Promise<VirtualTeamBlueprint> {
    const store = await this.readStore();
    const now = Date.now();
    const existing = input.id ? store.teams.find(team => team.id === input.id) : undefined;
    const members = Array.isArray(input.members) && input.members.length > 0
      ? input.members
      : existing?.members ?? this.createDefaultMembers();
    const supervisorId = input.supervisorId ?? existing?.supervisorId ?? members[0]?.id ?? 'supervisor';

    const team: VirtualTeamBlueprint = {
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

  async createDefaultTeam(objective = 'Deliver the software project from blueprint to tested implementation.'): Promise<VirtualTeamBlueprint> {
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

  async deleteTeam(teamId: string): Promise<{ ok: true; id: string }> {
    const store = await this.readStore();
    store.teams = store.teams.filter(team => team.id !== teamId);
    store.teamRuns = store.teamRuns.filter(run => run.teamId !== teamId);
    await this.writeStore(store);
    return { ok: true, id: teamId };
  }

  async runTeam(teamId: string): Promise<VirtualTeamRunRecord> {
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
    const run: VirtualTeamRunRecord = {
      id: this.createId('team-run'),
      teamId: team.id,
      teamName: team.name,
      objective: team.objective,
      workspacePath: team.workspacePath ?? this.workspacePath,
      status: 'running',
      startedAt: now,
      milestones: [],
      assignments: [],
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
      const assignments = await this.createTeamAssignmentPlan(team, run, enabledSkills, maxIterations);
      run.assignments = assignments;
      run.milestones = this.createTeamRunMilestonesFromAssignments(assignments, now);
      await this.upsertTeamRun(run);
      await this.executeTeamAssignments(team, run, assignments, enabledSkills);

      this.assertTeamGovernanceSatisfied(team, run);
      run.status = 'succeeded';
      run.completedAt = Date.now();
      run.summary = this.summarizeTeamRun(run);
      run.artifactPath = await this.writeTeamRunArtifact(run);
      await this.completeTeamRun(team.id, run, 'completed', run.summary);
      return run;
    } catch (error) {
      run.status = 'failed';
      run.completedAt = Date.now();
      run.error = error instanceof Error ? error.message : String(error);
      run.artifactPath = await this.writeTeamRunArtifact(run);
      await this.completeTeamRun(team.id, run, 'paused', run.error);
      return run;
    } finally {
      this.runningTeamIds.delete(teamId);
    }
  }

  private async createTeamAssignmentPlan(
    team: VirtualTeamBlueprint,
    run: VirtualTeamRunRecord,
    enabledSkills: SkillDetail[],
    maxIterations: number,
  ): Promise<VirtualTeamAssignmentPlan[]> {
    const teamWorkspacePath = this.normalizeWorkspacePath(team.workspacePath) ?? this.workspacePath;

    if (this.teamPlannerExecutor) {
      try {
        const result = await this.teamPlannerExecutor(team, {
          workspacePath: teamWorkspacePath,
          enabledSkills,
        });
        const assignments = this.parseTeamAssignmentPlan(result.content, team);
        if (assignments.length > 0) {
          return this.withAssignmentWorkspaces(team, run, assignments);
        }
      } catch (error) {
        console.warn('Virtual team planner failed; falling back to deterministic assignment plan:', error);
      }
    }

    return this.withAssignmentWorkspaces(team, run, this.createFallbackTeamAssignmentPlan(team, maxIterations));
  }

  private async executeTeamAssignments(
    team: VirtualTeamBlueprint,
    run: VirtualTeamRunRecord,
    assignments: VirtualTeamAssignmentPlan[],
    enabledSkills: SkillDetail[],
  ): Promise<void> {
    const completedAssignmentIds = new Set<string>();
    const pendingAssignmentIds = new Set(assignments.map(assignment => assignment.id));

    while (pendingAssignmentIds.size > 0) {
      const readyAssignments = assignments.filter(assignment => (
        pendingAssignmentIds.has(assignment.id)
        && assignment.dependencies.every(dependencyId => completedAssignmentIds.has(dependencyId))
      ));

      if (readyAssignments.length === 0) {
        throw new Error('Virtual team assignment plan has unresolved or circular dependencies.');
      }

      readyAssignments.forEach(assignment => this.beginTeamAssignment(run, assignment));
      await this.upsertTeamRun(run);

      const results = await Promise.allSettled(
        readyAssignments.map(assignment => this.runTeamAssignment(team, run, assignment, enabledSkills)),
      );
      await this.upsertTeamRun(run);

      const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (failed) {
        throw failed.reason;
      }

      readyAssignments.forEach(assignment => {
        pendingAssignmentIds.delete(assignment.id);
        completedAssignmentIds.add(assignment.id);
      });
    }
  }

  private beginTeamAssignment(run: VirtualTeamRunRecord, assignment: VirtualTeamAssignmentPlan): void {
    const stepStartedAt = Date.now();
    assignment.status = 'running';
    assignment.startedAt = stepStartedAt;
    run.steps.push({
      memberId: assignment.memberId,
      memberName: assignment.memberName,
      role: assignment.role,
      iteration: assignment.parallelGroup,
      assignmentId: assignment.id,
      assignmentTitle: assignment.title,
      dependencyIds: assignment.dependencies,
      parallelGroup: assignment.parallelGroup,
      workspacePath: assignment.workspacePath,
      status: 'running',
      startedAt: stepStartedAt,
    });
    this.updateTeamAssignmentMilestone(run, assignment.id, {
      status: 'running',
      startedAt: stepStartedAt,
    });
  }

  private async runTeamAssignment(
    team: VirtualTeamBlueprint,
    run: VirtualTeamRunRecord,
    assignment: VirtualTeamAssignmentPlan,
    enabledSkills: SkillDetail[],
  ): Promise<void> {
    const step = run.steps.find(candidate => candidate.assignmentId === assignment.id && candidate.status === 'running');
    if (!step) {
      throw new Error(`Virtual team assignment step not found: ${assignment.id}`);
    }

    try {
      const member = this.getAssignmentMember(team, assignment);
      await this.ensureAssignmentWorkspace(team, run, assignment);
      const sharedSteps = run.steps.filter(candidate => candidate.status === 'succeeded');
      const dependencySteps = sharedSteps.filter(candidate => (
        candidate.assignmentId ? assignment.dependencies.includes(candidate.assignmentId) : false
      ));
      const result = this.teamMemberExecutor
        ? await this.teamMemberExecutor(team, member, {
            workspacePath: assignment.workspacePath ?? team.workspacePath ?? this.workspacePath,
            runId: run.id,
            enabledSkills,
            assignment,
            previousSteps: dependencySteps,
            sharedSteps,
          })
        : await this.createFallbackTeamStep(team, member, sharedSteps, assignment);
      this.assertExecutionCompleted(result.content);
      assignment.status = 'succeeded';
      assignment.completedAt = Date.now();
      assignment.output = result.content;
      step.status = 'succeeded';
      step.completedAt = assignment.completedAt;
      step.output = result.content;
      this.updateTeamAssignmentMilestone(run, assignment.id, {
        status: 'succeeded',
        completedAt: step.completedAt,
        summary: result.content,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      assignment.status = 'failed';
      assignment.completedAt = Date.now();
      assignment.error = message;
      step.status = 'failed';
      step.completedAt = assignment.completedAt;
      step.error = message;
      this.updateTeamAssignmentMilestone(run, assignment.id, {
        status: 'failed',
        completedAt: step.completedAt,
        summary: message,
      });
      throw error;
    }
  }

  private parseTeamAssignmentPlan(content: string, team: VirtualTeamBlueprint): VirtualTeamAssignmentPlan[] {
    const parsed = this.parseJsonFromText(content);
    if (!parsed) {
      return [];
    }

    const rawAssignments = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { assignments?: unknown }).assignments)
        ? (parsed as { assignments: unknown[] }).assignments
        : [];
    if (rawAssignments.length === 0) {
      return [];
    }

    const usedIds = new Set<string>();
    const aliases = new Map<string, string>();
    const drafts = rawAssignments
      .map((raw, index) => {
        if (!raw || typeof raw !== 'object') {
          return null;
        }
        const record = raw as Record<string, unknown>;
        const member = this.resolveAssignmentMember(team, record, index);
        const title = this.readString(record.title) || this.readString(record.name) || `${member.role} assignment`;
        const sourceId = this.readString(record.id) || this.readString(record.key) || title;
        const id = this.uniqueAssignmentId(sourceId, usedIds);
        const description = this.readString(record.description)
          || this.readString(record.goal)
          || this.readString(record.prompt)
          || member.goal
          || `Complete the ${title} assignment.`;
        const dependencyValues = this.readStringArray(
          record.dependencies ?? record.dependsOn ?? record.dependencyIds,
        );
        const assignment: VirtualTeamAssignmentPlan = {
          id,
          title,
          description,
          memberId: member.id,
          memberName: member.name,
          role: member.role,
          dependencies: [],
          parallelGroup: 1,
          status: 'pending',
        };
        [sourceId, title, id].forEach(alias => {
          aliases.set(alias, id);
          aliases.set(this.slug(alias), id);
        });
        return { assignment, dependencyValues };
      })
      .filter((value): value is { assignment: VirtualTeamAssignmentPlan; dependencyValues: string[] } => Boolean(value));

    drafts.forEach(draft => {
      draft.assignment.dependencies = [...new Set(draft.dependencyValues
        .map(value => aliases.get(value) ?? aliases.get(this.slug(value)) ?? '')
        .filter(dependencyId => dependencyId && dependencyId !== draft.assignment.id))];
    });

    return this.assignParallelGroups(drafts.map(draft => draft.assignment));
  }

  private parseJsonFromText(content: string): unknown {
    const trimmed = content.trim();
    if (!trimmed) {
      return null;
    }

    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch?.[1]?.trim() ?? trimmed;
    const objectStart = candidate.indexOf('{');
    const objectEnd = candidate.lastIndexOf('}');
    const arrayStart = candidate.indexOf('[');
    const arrayEnd = candidate.lastIndexOf(']');
    const startsWithArray = arrayStart >= 0 && (objectStart < 0 || arrayStart < objectStart);
    const jsonText = startsWithArray && arrayEnd > arrayStart
      ? candidate.slice(arrayStart, arrayEnd + 1)
      : objectStart >= 0 && objectEnd > objectStart
        ? candidate.slice(objectStart, objectEnd + 1)
        : candidate;

    try {
      return JSON.parse(jsonText);
    } catch (error) {
      return null;
    }
  }

  private createFallbackTeamAssignmentPlan(team: VirtualTeamBlueprint, maxIterations: number): VirtualTeamAssignmentPlan[] {
    const members = team.members.length > 0 ? team.members : this.createDefaultMembers();
    const assignments: VirtualTeamAssignmentPlan[] = [];
    const usedIds = new Set<string>();
    let previousIterationDependencyIds: string[] = [];

    for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
      const planningMembers = members.filter(member => this.isPlanningRole(member, team));
      const reviewMembers = members.filter(member => this.isReviewRole(member));
      const deliveryMembers = members.filter(member => (
        !planningMembers.some(candidate => candidate.id === member.id)
        && !reviewMembers.some(candidate => candidate.id === member.id)
      ));
      const planningAssignments = planningMembers.map(member => this.createFallbackAssignment(
        member,
        iteration,
        'Plan work and coordinate execution',
        `Break down the project objective for iteration ${iteration}, clarify dependencies, and identify the handoff expected from each worker.`,
        previousIterationDependencyIds,
        usedIds,
      ));
      const planningIds = planningAssignments.map(assignment => assignment.id);
      const deliveryAssignments = (deliveryMembers.length > 0 ? deliveryMembers : members.filter(member => !this.isReviewRole(member))).map(member => this.createFallbackAssignment(
        member,
        iteration,
        `Deliver ${member.role} work`,
        `Complete the ${member.role} portion of the project objective and publish concrete artifacts or decisions.`,
        [...previousIterationDependencyIds, ...planningIds],
        usedIds,
      ));
      const deliveryIds = deliveryAssignments.map(assignment => assignment.id);
      const reviewAssignments = reviewMembers.map(member => this.createFallbackAssignment(
        member,
        iteration,
        `Review and sign off ${member.role} work`,
        'Review dependent worker outputs, call out risks, and merge or approve only the deliverables that are ready for the shared project workspace.',
        deliveryIds.length > 0 ? deliveryIds : [...previousIterationDependencyIds, ...planningIds],
        usedIds,
      ));

      assignments.push(...planningAssignments, ...deliveryAssignments, ...reviewAssignments);
      previousIterationDependencyIds = (reviewAssignments.length > 0 ? reviewAssignments : deliveryAssignments.length > 0 ? deliveryAssignments : planningAssignments)
        .map(assignment => assignment.id);
    }

    return this.assignParallelGroups(assignments);
  }

  private createFallbackAssignment(
    member: VirtualTeamMember,
    iteration: number,
    title: string,
    description: string,
    dependencies: string[],
    usedIds: Set<string>,
  ): VirtualTeamAssignmentPlan {
    return {
      id: this.uniqueAssignmentId(`iteration-${iteration}-${member.id}-${title}`, usedIds),
      title: iteration > 1 ? `Iteration ${iteration}: ${title}` : title,
      description,
      memberId: member.id,
      memberName: member.name,
      role: member.role,
      dependencies: [...new Set(dependencies)],
      parallelGroup: 1,
      status: 'pending',
    };
  }

  private assignParallelGroups(assignments: VirtualTeamAssignmentPlan[]): VirtualTeamAssignmentPlan[] {
    const validIds = new Set(assignments.map(assignment => assignment.id));
    assignments.forEach(assignment => {
      assignment.dependencies = [...new Set(assignment.dependencies.filter(dependencyId => (
        validIds.has(dependencyId) && dependencyId !== assignment.id
      )))];
    });

    const completed = new Set<string>();
    const pending = new Set(assignments.map(assignment => assignment.id));
    let parallelGroup = 1;

    while (pending.size > 0) {
      const ready = assignments.filter(assignment => (
        pending.has(assignment.id)
        && assignment.dependencies.every(dependencyId => completed.has(dependencyId))
      ));
      if (ready.length === 0) {
        return [];
      }
      ready.forEach(assignment => {
        assignment.parallelGroup = parallelGroup;
        pending.delete(assignment.id);
        completed.add(assignment.id);
      });
      parallelGroup += 1;
    }

    return assignments;
  }

  private withAssignmentWorkspaces(
    team: VirtualTeamBlueprint,
    run: VirtualTeamRunRecord,
    assignments: VirtualTeamAssignmentPlan[],
  ): VirtualTeamAssignmentPlan[] {
    return assignments.map(assignment => ({
      ...assignment,
      workspacePath: this.getAssignmentWorkspacePath(team, run, assignment),
    }));
  }

  private getAssignmentWorkspacePath(
    team: VirtualTeamBlueprint,
    run: VirtualTeamRunRecord,
    assignment: VirtualTeamAssignmentPlan,
  ): string {
    const runWorkspacePath = this.normalizeWorkspacePath(team.workspacePath) ?? this.workspacePath;
    if (assignment.dependencies.length > 0 && this.isReviewOrMergeAssignment(assignment)) {
      return runWorkspacePath;
    }
    return path.join(
      runWorkspacePath,
      '.code-agent',
      'team-runs',
      run.id,
      'workers',
      `${this.slug(assignment.memberName)}-${assignment.id}`,
    );
  }

  private async ensureAssignmentWorkspace(
    team: VirtualTeamBlueprint,
    run: VirtualTeamRunRecord,
    assignment: VirtualTeamAssignmentPlan,
  ): Promise<void> {
    const workspacePath = assignment.workspacePath ?? this.getAssignmentWorkspacePath(team, run, assignment);
    assignment.workspacePath = workspacePath;
    await fs.mkdir(workspacePath, { recursive: true });
    const dependentOutputs = run.steps
      .filter(step => step.assignmentId && assignment.dependencies.includes(step.assignmentId) && (step.output || step.error))
      .map(step => [
        `## ${step.assignmentTitle ?? step.role}`,
        '',
        `- Owner: ${step.memberName} (${step.role})`,
        step.workspacePath ? `- Workspace: ${step.workspacePath}` : '',
        '',
        step.output ?? `Error: ${step.error}`,
      ].filter(Boolean).join('\n'))
      .join('\n\n');
    await fs.writeFile(path.join(workspacePath, 'ASSIGNMENT.md'), [
      `# ${assignment.title}`,
      '',
      `- Assignment ID: ${assignment.id}`,
      `- Team run: ${run.id}`,
      `- Owner: ${assignment.memberName} (${assignment.role})`,
      `- Parallel group: ${assignment.parallelGroup}`,
      `- Dependencies: ${assignment.dependencies.join(', ') || 'none'}`,
      '',
      '## Objective',
      '',
      team.objective,
      '',
      '## Assignment',
      '',
      assignment.description,
      '',
      '## Dependency Outputs',
      '',
      dependentOutputs || 'No dependency outputs yet.',
      '',
    ].join('\n'), 'utf-8');
  }

  private getAssignmentMember(team: VirtualTeamBlueprint, assignment: VirtualTeamAssignmentPlan): VirtualTeamMember {
    return team.members.find(member => member.id === assignment.memberId)
      ?? team.members.find(member => member.name === assignment.memberName)
      ?? team.members[0]
      ?? this.createDefaultMembers()[0];
  }

  private resolveAssignmentMember(team: VirtualTeamBlueprint, record: Record<string, unknown>, index: number): VirtualTeamMember {
    const members = team.members.length > 0 ? team.members : this.createDefaultMembers();
    const memberId = this.readString(record.memberId) || this.readString(record.assigneeId) || this.readString(record.employeeId);
    const memberName = this.readString(record.memberName) || this.readString(record.assignee) || this.readString(record.employee);
    const role = this.readString(record.role) || this.readString(record.ownerRole);
    return members.find(member => member.id === memberId)
      ?? members.find(member => member.name.toLowerCase() === String(memberName ?? '').toLowerCase())
      ?? members.find(member => member.role.toLowerCase() === String(role ?? '').toLowerCase())
      ?? members.find(member => role && member.role.toLowerCase().includes(role.toLowerCase()))
      ?? members[index % members.length];
  }

  private readString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private readStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map(item => this.readString(item)).filter(Boolean);
    }
    if (typeof value === 'string') {
      return value.split(',').map(item => item.trim()).filter(Boolean);
    }
    return [];
  }

  private uniqueAssignmentId(value: string, usedIds: Set<string>): string {
    const base = this.slug(value) || 'assignment';
    let id = base;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    return id;
  }

  private isPlanningRole(member: VirtualTeamMember, team: VirtualTeamBlueprint): boolean {
    const role = member.role.toLowerCase();
    return member.id === team.supervisorId
      || role.includes('supervisor')
      || role.includes('lead')
      || role.includes('manager')
      || role.includes('planner')
      || role.includes('product')
      || role.includes('architect');
  }

  private isReviewRole(member: VirtualTeamMember): boolean {
    const role = member.role.toLowerCase();
    return role.includes('qa')
      || role.includes('quality')
      || role.includes('test')
      || role.includes('review')
      || role.includes('security')
      || role.includes('release');
  }

  private isReviewOrMergeAssignment(assignment: VirtualTeamAssignmentPlan): boolean {
    const text = `${assignment.role} ${assignment.title}`.toLowerCase();
    return text.includes('qa')
      || text.includes('quality')
      || text.includes('test')
      || text.includes('review')
      || text.includes('merge')
      || text.includes('sign off')
      || text.includes('signoff')
      || text.includes('supervisor')
      || text.includes('lead');
  }

  private createTeamRunMilestonesFromAssignments(
    assignments: VirtualTeamAssignmentPlan[],
    createdAt: number,
  ): VirtualTeamMilestone[] {
    return assignments.map(assignment => ({
      id: `assignment-${assignment.id}`,
      title: assignment.title,
      ownerRole: assignment.role,
      memberId: assignment.memberId,
      memberName: assignment.memberName,
      iteration: assignment.parallelGroup,
      status: 'pending',
      createdAt,
    }));
  }

  private updateTeamAssignmentMilestone(
    run: VirtualTeamRunRecord,
    assignmentId: string,
    update: Partial<Pick<VirtualTeamMilestone, 'status' | 'startedAt' | 'completedAt' | 'summary'>>,
  ): void {
    const milestone = run.milestones?.find(candidate => candidate.id === `assignment-${assignmentId}`);
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
      milestone.summary = update.summary;
    }
  }

  private async executeTask(taskId: string, trigger: 'manual' | 'schedule' | 'remote'): Promise<ScheduledTask> {
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

      const run: AutomationRunRecord = {
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
          updatedTask.nextRunAt = completedAt + updatedTask.intervalMinutes * 60_000;
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
      } catch (error) {
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
            ? completedAt + retryPolicy.retryDelayMinutes * 60_000
            : completedAt + updatedTask.intervalMinutes * 60_000;
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
    } finally {
      this.runningTaskIds.delete(taskId);
    }
  }

  private shouldSkipMissedRun(task: ScheduledTask, now: number): boolean {
    if (this.normalizeMissedRunPolicy(task.missedRunPolicy) !== 'skip') {
      return false;
    }

    const overdueByMs = now - Number(task.nextRunAt);
    return Number.isFinite(overdueByMs) && overdueByMs > SCHEDULER_INTERVAL_MS * 2;
  }

  private async skipMissedTaskRun(taskId: string, now: number): Promise<ScheduledTask> {
    const store = await this.readStore();
    const task = store.tasks.find(candidate => candidate.id === taskId);
    if (!task) {
      throw new Error(`Scheduled task not found: ${taskId}`);
    }

    const missedAt = Number(task.nextRunAt);
    const message = Number.isFinite(missedAt)
      ? `Missed scheduled run skipped. It was due ${new Date(missedAt).toLocaleString()}.`
      : 'Missed scheduled run skipped.';
    const run: AutomationRunRecord = {
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

  private scheduleTickSoon(): void {
    if (!this.schedulerTimer) {
      return;
    }

    setTimeout(() => {
      this.runDueTasks().catch(error => {
        console.warn('Scheduled automation immediate tick failed:', error);
      });
    }, 250).unref?.();
  }

  private async listenRemoteServer(startPort: number): Promise<{ server: http.Server; port: number }> {
    for (let port = startPort; port < startPort + 20; port += 1) {
      const server = http.createServer((request, response) => {
        this.handleRemoteRequest(request, response).catch(error => {
          this.sendJson(response, 500, {
            error: error instanceof Error ? error.message : String(error),
          });
        });
      });

      const listened = await new Promise<{ ok: true; port: number } | { ok: false }>(resolve => {
        server.once('error', () => {
          server.close();
          resolve({ ok: false });
        });
        server.listen(port, '0.0.0.0', () => {
          resolve({ ok: true, port: (server.address() as AddressInfo).port });
        });
      });

      if (listened.ok) {
        return { server, port: listened.port };
      }
    }

    throw new Error(`Unable to start remote-control server near port ${startPort}`);
  }

  private async handleRemoteRequest(request: http.IncomingMessage, response: http.ServerResponse): Promise<void> {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
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
      this.sendJson(response, 200, await this.pairRemoteDevice(
        String(body.code ?? ''),
        String(body.deviceName ?? 'Phone'),
      ));
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

    if (request.method === 'GET' && pathname === '/api/devices') {
      const remote = await this.getRemoteControl();
      this.sendJson(response, 200, {
        devices: remote.approvedDevices,
        currentDeviceId: device.id,
        auditLog: remote.auditLog ?? [],
      });
      return;
    }

    const deviceRevokeMatch = pathname.match(/^\/api\/devices\/([^/]+)$/);
    if ((request.method === 'DELETE' || request.method === 'POST') && deviceRevokeMatch) {
      this.sendJson(response, 200, await this.revokeRemoteDeviceFromRemote(
        deviceRevokeMatch[1],
        device,
      ));
      return;
    }

    const approvalMatch = pathname.match(/^\/api\/approvals\/([^/]+)$/);
    if (request.method === 'POST' && approvalMatch) {
      const body = await this.readJsonBody(request);
      this.sendJson(response, 200, await this.resolveApprovalRequest(
        approvalMatch[1],
        Boolean(body.approved),
        typeof body.reason === 'string' ? body.reason : undefined,
        device.name,
      ));
      return;
    }

    this.sendJson(response, 404, { error: 'Not found' });
  }

  private async pairRemoteDevice(code: string, deviceName: string): Promise<{
    token: string;
    device: { id: string; name: string; createdAt: number; lastSeenAt: number };
    remoteControl: RemoteControlState;
  }> {
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

  private async revokeRemoteDeviceFromRemote(
    deviceId: string,
    actor: { id: string; name: string },
  ): Promise<RemoteControlState> {
    const store = await this.readStore();
    const target = store.remoteControl.approvedDevices.find(candidate => candidate.id === deviceId);
    if (!target) {
      throw new Error(`Remote device not found: ${deviceId}`);
    }

    store.remoteControl = this.normalizeRemoteControl({
      ...store.remoteControl,
      approvedDevices: store.remoteControl.approvedDevices.filter(candidate => candidate.id !== deviceId),
      auditLog: this.appendRemoteAudit(store.remoteControl.auditLog, {
        type: 'device-revoked',
        message: `Revoked remote device "${target.name}" from "${actor.name}".`,
        deviceId: target.id,
        deviceName: target.name,
      }),
    });
    await this.writeStore(store);
    return this.sanitizeRemoteControl(store.remoteControl);
  }

  private async requireRemoteDevice(request: http.IncomingMessage): Promise<{ id: string; name: string } | null> {
    const authorization = request.headers.authorization ?? '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : '';
    if (!token) {
      return null;
    }

    const tokenHash = this.hashToken(token);
    const store = await this.readStore();
    const device = store.remoteControl.approvedDevices.find(candidate => (candidate as any).tokenHash === tokenHash);
    if (!device) {
      return null;
    }

    device.lastSeenAt = Date.now();
    await this.writeStore(store);
    return { id: device.id, name: device.name };
  }

  private checkRemoteRateLimit(request: http.IncomingMessage, pathname: string): boolean {
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

  private async readJsonBody(request: http.IncomingMessage): Promise<Record<string, any>> {
    const chunks: Buffer[] = [];
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
    return parsed as Record<string, any>;
  }

  private sendJson(response: http.ServerResponse, statusCode: number, payload: unknown): void {
    response.writeHead(statusCode, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    });
    response.end(JSON.stringify(payload, null, 2));
  }

  private sendHtml(response: http.ServerResponse, html: string): void {
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(html);
  }

  private renderRemoteControlPage(): string {
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

  private getLocalNetworkUrls(port: number): string[] {
    const urls: string[] = [];
    for (const interfaces of Object.values(os.networkInterfaces())) {
      for (const network of interfaces ?? []) {
        if (network.family === 'IPv4' && !network.internal) {
          urls.push(`http://${network.address}:${port}`);
        }
      }
    }
    return urls;
  }

  private sanitizeRemoteControl(remoteControl: RemoteControlState): RemoteControlState {
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

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async createFallbackTeamStep(
    team: VirtualTeamBlueprint,
    member: VirtualTeamMember,
    previousSteps: VirtualTeamRunStep[],
    assignment?: VirtualTeamAssignmentPlan,
  ): Promise<AutomationExecutionResult> {
    const previous = previousSteps
      .filter(step => step.output)
      .map(step => `- ${step.assignmentTitle ?? step.role}: ${step.output}`)
      .join('\n');

    return {
      content: [
        `${member.role} assignment for "${team.name}"`,
        assignment ? `Assignment: ${assignment.title}` : '',
        `Objective: ${team.objective}`,
        `Goal: ${assignment?.description ?? member.goal}`,
        assignment?.workspacePath ? `Workspace: ${assignment.workspacePath}` : '',
        assignment?.dependencies.length ? `Dependencies: ${assignment.dependencies.join(', ')}` : 'Dependencies: none',
        previous ? `Previous team context:\n${previous}` : 'No previous team context.',
        'No LLM executor was configured, so this run produced a deterministic planning artifact only.',
      ].filter(Boolean).join('\n\n'),
    };
  }

  private assertExecutionCompleted(content: string): void {
    if (content.includes(TOOL_ROUND_LIMIT_MESSAGE)) {
      throw new Error(`${TOOL_ROUND_LIMIT_MESSAGE} The automation step did not finish. Increase the desktop tool-call round limit or make the team objective more explicit.`);
    }
  }

  private assertTeamGovernanceSatisfied(team: VirtualTeamBlueprint, run: VirtualTeamRunRecord): void {
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

  private createTeamRunMilestones(
    team: VirtualTeamBlueprint,
    maxIterations: number,
    createdAt: number,
  ): VirtualTeamMilestone[] {
    const milestones: VirtualTeamMilestone[] = [];
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

  private updateTeamRunMilestone(
    run: VirtualTeamRunRecord,
    memberId: string,
    iteration: number,
    update: Partial<Pick<VirtualTeamMilestone, 'status' | 'startedAt' | 'completedAt' | 'summary'>>,
  ): void {
    const milestone = run.milestones?.find(candidate => (
      candidate.memberId === memberId && candidate.iteration === iteration
    ));
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

  private async emitTaskNotification(
    task: ScheduledTask,
    run: AutomationRunRecord,
    status: 'succeeded' | 'failed',
    message: string,
  ): Promise<void> {
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
    } catch (error) {
      console.warn('Automation notification delivery failed:', error);
    }
  }

  private summarizeTeamRun(run: VirtualTeamRunRecord): string {
    const succeeded = run.steps.filter(step => step.status === 'succeeded').length;
    const failed = run.steps.filter(step => step.status === 'failed').length;
    const assignments = run.assignments?.length ?? run.steps.length;
    const parallelGroups = new Set((run.assignments ?? []).map(assignment => assignment.parallelGroup)).size;
    return `Team run ${run.id} completed ${succeeded}/${assignments} assignment(s) with ${failed} failed step(s) across ${parallelGroups || 1} execution group(s).`;
  }

  private async ensureTeamWorkspaceSeed(team: VirtualTeamBlueprint): Promise<void> {
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
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
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

  private async writeTeamRunArtifact(run: VirtualTeamRunRecord): Promise<string> {
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
      '## Assignment Plan',
      '',
      ...(run.assignments ?? []).map(assignment => [
        `- [${assignment.status === 'succeeded' ? 'x' : ' '}] ${assignment.title} (${assignment.status})`,
        `  - Owner: ${assignment.memberName} (${assignment.role})`,
        `  - Parallel group: ${assignment.parallelGroup}`,
        `  - Dependencies: ${assignment.dependencies.join(', ') || 'none'}`,
        assignment.workspacePath ? `  - Workspace: ${assignment.workspacePath}` : '',
      ].filter(Boolean).join('\n')),
      (run.assignments ?? []).length === 0 ? 'No assignment plan recorded.' : '',
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
        `### ${step.assignmentTitle ?? step.role} - ${step.memberName}`,
        '',
        `Status: ${step.status}`,
        step.parallelGroup ? `Parallel group: ${step.parallelGroup}` : '',
        step.dependencyIds?.length ? `Dependencies: ${step.dependencyIds.join(', ')}` : '',
        step.workspacePath ? `Workspace: ${step.workspacePath}` : '',
        '',
        step.output ?? step.error ?? 'No output.',
        '',
      ].filter(Boolean)),
    ].filter(Boolean);

    await fs.writeFile(artifactPath, `${lines.join('\n')}\n`, 'utf-8');
    const relative = path.relative(this.workspacePath, artifactPath);
    return relative.startsWith('..') || path.isAbsolute(relative)
      ? artifactPath
      : relative;
  }

  private async upsertTeamRun(run: VirtualTeamRunRecord): Promise<void> {
    const store = await this.readStore();
    store.teamRuns = [
      run,
      ...store.teamRuns.filter(candidate => candidate.id !== run.id),
    ].slice(0, MAX_RUN_HISTORY);
    await this.writeStore(store);
  }

  private async completeTeamRun(
    teamId: string,
    run: VirtualTeamRunRecord,
    status: VirtualTeamBlueprint['status'],
    result?: string,
  ): Promise<void> {
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

  private async discoverSkillsInDirectory(dir: string, source: SkillManifest['source']): Promise<SkillManifest[]> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const manifests: SkillManifest[] = [];

      for (const entry of entries) {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const skillPath = path.join(entryPath, 'SKILL.md');
          const manifest = await this.readSkillFile(skillPath, entry.name, source);
          if (manifest) {
            manifests.push(manifest);
          }
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
          const manifest = await this.readSkillFile(entryPath, path.basename(entry.name, '.md'), source);
          if (manifest) {
            manifests.push(manifest);
          }
        }
      }

      return manifests;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async readSkillFile(skillPath: string, fallbackName: string, source: SkillManifest['source']): Promise<SkillManifest | null> {
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
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  private createDefaultMembers(): VirtualTeamMember[] {
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

  private async readStore(): Promise<AutomationStore> {
    const hasProjectManifest = await this.exists(this.projectManifestPath);
    if (!hasProjectManifest && await this.exists(this.legacyStorePath)) {
      const migrated = await this.readLegacyStore();
      await this.writeStore(migrated);
      return migrated;
    }

    const skillPolicies = await this.readJsonFile<AutomationStore['skillPolicies']>(this.skillPoliciesPath, {});
    const tasks = await this.readJsonDirectory<ScheduledTask>(this.tasksDir);
    const taskRuns = await this.readJsonDirectory<AutomationRunRecord>(this.taskRunsDir);
    const teams = await this.readJsonDirectory<VirtualTeamBlueprint>(this.teamsDir);
    const teamRuns = await this.readJsonDirectory<VirtualTeamRunRecord>(this.teamRunsDir);
    const remoteControl = await this.readJsonFile<RemoteControlState | undefined>(this.remoteControlPath, undefined);

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

  private async writeStore(store: AutomationStore): Promise<void> {
    await fs.mkdir(this.projectDir, { recursive: true });
    await this.ensureProjectGitignore();
    await this.writeJsonFile<AutomationProjectManifest>(this.projectManifestPath, {
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

  private createDefaultStore(): AutomationStore {
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

  private async readLegacyStore(): Promise<AutomationStore> {
    try {
      const raw = await fs.readFile(this.legacyStorePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<AutomationStore>;
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
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return this.createDefaultStore();
      }
      throw error;
    }
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
    try {
      return JSON.parse(await fs.readFile(filePath, 'utf-8')) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return fallback;
      }
      throw error;
    }
  }

  private async writeJsonFile<T>(filePath: string, data: T): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
  }

  private async readJsonDirectory<T>(dirPath: string): Promise<T[]> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const values: T[] = [];

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) {
          continue;
        }
        values.push(await this.readJsonFile<T>(path.join(dirPath, entry.name), undefined as T));
      }

      return values.filter(value => value !== undefined);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async syncJsonDirectory<T>(
    dirPath: string,
    records: T[],
    getId: (record: T) => string,
  ): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true });
    const expected = new Set<string>();

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

  private async ensureProjectGitignore(): Promise<void> {
    const gitignorePath = path.join(this.projectDir, '.gitignore');
    const required = ['local/', 'history/'];
    let existing = '';
    try {
      existing = await fs.readFile(gitignorePath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
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

  private safeFilename(value: string): string {
    return value.replace(/[^a-zA-Z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '') || this.createId('record');
  }

  private mergeRecords<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
    const records = new Map<string, T>();
    for (const record of existing) {
      records.set(record.id, record);
    }
    for (const record of incoming) {
      records.set(record.id, record);
    }
    return Array.from(records.values());
  }

  private isScheduledTask(value: unknown): value is ScheduledTask {
    return Boolean(value && typeof value === 'object' && typeof (value as ScheduledTask).id === 'string');
  }

  private isTaskRun(value: unknown): value is AutomationRunRecord {
    return Boolean(value && typeof value === 'object' && typeof (value as AutomationRunRecord).id === 'string');
  }

  private isVirtualTeam(value: unknown): value is VirtualTeamBlueprint {
    return Boolean(value && typeof value === 'object' && typeof (value as VirtualTeamBlueprint).id === 'string');
  }

  private isTeamRun(value: unknown): value is VirtualTeamRunRecord {
    return Boolean(value && typeof value === 'object' && typeof (value as VirtualTeamRunRecord).id === 'string');
  }

  private normalizeRemoteControl(value: unknown): RemoteControlState {
    const raw = value && typeof value === 'object' ? value as Partial<RemoteControlState> : {};
    const mode = raw.mode === 'local-network' || raw.mode === 'relay'
      ? raw.mode
      : raw.enabled
        ? 'local-network'
        : 'disabled';

    return {
      enabled: Boolean(raw.enabled),
      mode,
      serverPort: typeof raw.serverPort === 'number' ? raw.serverPort : undefined,
      serverUrl: mode === 'local-network' && typeof raw.serverUrl === 'string' ? raw.serverUrl : undefined,
      localNetworkUrls: mode === 'local-network' && Array.isArray(raw.localNetworkUrls) ? raw.localNetworkUrls.map(String) : [],
      relay: this.normalizeRemoteRelay(raw.relay),
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

  private normalizeRemoteRelay(value: unknown): RemoteRelayConfig {
    const raw = value && typeof value === 'object' ? value as Partial<RemoteRelayConfig> : {};
    const enrollmentStatus = raw.enrollmentStatus === 'enrolled' || raw.enrollmentStatus === 'disabled'
      ? raw.enrollmentStatus
      : raw.brokerUrl
        ? 'enrolled'
        : 'not-configured';

    return {
      enrollmentStatus,
      brokerUrl: this.optionalTrimmedString(raw.brokerUrl),
      accountId: this.optionalTrimmedString(raw.accountId),
      deviceId: this.optionalTrimmedString(raw.deviceId),
      relayPublicKey: this.optionalTrimmedString(raw.relayPublicKey),
      clientKeyId: this.optionalTrimmedString(raw.clientKeyId),
      auditCursor: this.optionalTrimmedString(raw.auditCursor),
      enrolledAt: this.optionalTimestamp(raw.enrolledAt),
      disabledAt: this.optionalTimestamp(raw.disabledAt),
      lastConnectedAt: this.optionalTimestamp(raw.lastConnectedAt),
      tokenRotatesAt: this.optionalTimestamp(raw.tokenRotatesAt),
    };
  }

  private normalizeRelayBrokerUrl(value: string): string {
    const raw = value.trim();
    if (!raw) {
      throw new Error('Relay broker URL is required.');
    }

    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new Error('Relay broker URL must be a valid HTTPS URL.');
    }

    if (parsed.protocol !== 'https:') {
      throw new Error('Relay broker URL must use HTTPS.');
    }

    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  }

  private optionalTrimmedString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : undefined;
  }

  private optionalTimestamp(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  private appendRemoteAudit(
    current: RemoteControlAuditEvent[] | undefined,
    event: Omit<RemoteControlAuditEvent, 'id' | 'createdAt'>,
  ): RemoteControlAuditEvent[] {
    return [
      {
        id: this.createId('remote-audit'),
        createdAt: Date.now(),
        ...event,
      },
      ...(current ?? []),
    ].slice(0, 100);
  }

  private normalizeInterval(value: unknown): number {
    const parsed = Number(value ?? DEFAULT_INTERVAL_MINUTES);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return DEFAULT_INTERVAL_MINUTES;
    }
    return Math.min(Math.floor(parsed), 60 * 24 * 30);
  }

  private normalizeRetryPolicy(value: unknown): AutomationRetryPolicy {
    const raw = value && typeof value === 'object' ? value as Partial<AutomationRetryPolicy> : {};
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

  private normalizeNotificationPolicy(value: unknown): AutomationNotificationPolicy {
    const raw = value && typeof value === 'object' ? value as Partial<AutomationNotificationPolicy> : {};
    const channel = raw.channel === 'desktop' || raw.channel === 'remote' || raw.channel === 'none'
      ? raw.channel
      : 'desktop';
    return {
      onSuccess: Boolean(raw.onSuccess),
      onFailure: raw.onFailure !== false,
      channel,
    };
  }

  private normalizeMissedRunPolicy(value: unknown): AutomationMissedRunPolicy {
    return value === 'skip' ? 'skip' : 'run-once';
  }

  private normalizeScheduledTask(task: ScheduledTask): ScheduledTask {
    return {
      ...task,
      intervalMinutes: this.normalizeInterval(task.intervalMinutes),
      retryPolicy: this.normalizeRetryPolicy(task.retryPolicy),
      notificationPolicy: this.normalizeNotificationPolicy(task.notificationPolicy),
      missedRunPolicy: this.normalizeMissedRunPolicy(task.missedRunPolicy),
      retryAttempts: Number.isFinite(Number(task.retryAttempts)) ? Math.max(0, Number(task.retryAttempts)) : 0,
    };
  }

  private computeNextRunAtAfter(previousNextRunAt: number, intervalMinutes: number, now: number): number {
    const intervalMs = this.normalizeInterval(intervalMinutes) * 60_000;
    let nextRunAt = Number.isFinite(previousNextRunAt)
      ? previousNextRunAt
      : now + intervalMs;

    while (nextRunAt <= now) {
      nextRunAt += intervalMs;
    }

    return nextRunAt;
  }

  private normalizeWorkspacePath(value: unknown): string | undefined {
    if (typeof value !== 'string' || !value.trim()) {
      return undefined;
    }

    return normalizeAutomationWorkspacePath(value);
  }

  private normalizeTeamPermissionMode(value: unknown): VirtualTeamPermissionMode {
    return value === 'supervised' ? 'supervised' : 'full-access';
  }

  private normalizeTeamMaxIterations(value: unknown): number {
    const parsed = Number(value ?? 1);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return 1;
    }
    return Math.min(Math.floor(parsed), MAX_TEAM_ITERATIONS);
  }

  private normalizeVirtualTeam(team: VirtualTeamBlueprint): VirtualTeamBlueprint {
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

  private createId(prefix: string): string {
    return `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  }

  private slug(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || this.createId('skill');
  }
}
