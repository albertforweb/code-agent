/**
 * Service Bridge - Local automation, skills, remote control, and package workflows.
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
import type { FeaturePackageAutomationProvider } from '@codeagent/feature-package-sdk';

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

/** Generic actor in a package-defined automation workflow. */
export interface AutomationWorkflowActor {
  id: string;
  name: string;
  role: string;
  goal: string;
  model?: string;
  tools: string[];
}

export type AutomationWorkflowPermissionMode = 'supervised' | 'full-access';

/** Package-neutral workflow envelope persisted by the core automation runtime. */
export interface AutomationWorkflow {
  id: string;
  providerId?: string;
  name: string;
  objective: string;
  workspacePath?: string;
  permissionMode?: AutomationWorkflowPermissionMode;
  maxIterations?: number;
  providerConfig?: Record<string, unknown>;
  supervisorId: string;
  members: AutomationWorkflowActor[];
  status: 'draft' | 'active' | 'paused' | 'completed';
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  lastStatus?: 'running' | 'succeeded' | 'failed';
  lastResult?: string;
}

export interface AutomationWorkflowMilestone {
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

export interface AutomationWorkflowAssignment {
  id: string;
  title: string;
  description: string;
  memberId: string;
  memberName: string;
  role: string;
  dependencies: string[];
  parallelGroup: number;
  kind?: string;
  workspaceMode?: 'isolated' | 'shared';
  requiresArtifact?: boolean;
  requiresNonDocumentationArtifact?: boolean;
  goalIds?: string[];
  acceptanceCriteria?: string[];
  expectedArtifacts?: string[];
  producedArtifacts?: string[];
  workspacePath?: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  startedAt?: number;
  completedAt?: number;
  output?: string;
  error?: string;
}

export interface AutomationWorkflowRunStep {
  memberId: string;
  memberName: string;
  role: string;
  iteration?: number;
  assignmentId?: string;
  assignmentTitle?: string;
  dependencyIds?: string[];
  parallelGroup?: number;
  workspacePath?: string;
  producedArtifacts?: string[];
  status: 'running' | 'succeeded' | 'failed';
  startedAt: number;
  completedAt?: number;
  output?: string;
  error?: string;
}

export interface AutomationWorkflowRun {
  id: string;
  workflowId: string;
  workflowName: string;
  /** Legacy persisted/IPC aliases. */
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
  milestones?: AutomationWorkflowMilestone[];
  assignments?: AutomationWorkflowAssignment[];
  steps: AutomationWorkflowRunStep[];
}

// Legacy aliases keep the persisted desktop/IPC schema compatible while the
// public framework uses package-neutral workflow terminology.
export type VirtualTeamMember = AutomationWorkflowActor;
export type VirtualTeamPermissionMode = AutomationWorkflowPermissionMode;
export type VirtualTeamBlueprint = AutomationWorkflow;
export type VirtualTeamMilestone = AutomationWorkflowMilestone;
export type VirtualTeamAssignmentPlan = AutomationWorkflowAssignment;
export type VirtualTeamRunStep = AutomationWorkflowRunStep;
export type VirtualTeamRunRecord = AutomationWorkflowRun;

interface AutomationStore {
  version: 1;
  skillPolicies: Record<string, {
    enabled: boolean;
    trusted?: boolean;
  }>;
  tasks: ScheduledTask[];
  taskRuns: AutomationRunRecord[];
  remoteControl: RemoteControlState;
  workflows: AutomationWorkflow[];
  workflowRuns: AutomationWorkflowRun[];
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
  workflows: AutomationWorkflow[];
  /** @deprecated Import compatibility for exports created before workflow providers. */
  teams?: VirtualTeamBlueprint[];
  taskRuns?: AutomationRunRecord[];
  workflowRuns?: AutomationWorkflowRun[];
  /** @deprecated Import compatibility for exports created before workflow providers. */
  teamRuns?: VirtualTeamRunRecord[];
}

export interface AutomationProjectImportResult {
  ok: true;
  imported: {
    skillPolicies: number;
    tasks: number;
    workflows: number;
    /** @deprecated Compatibility count for callers using the old result shape. */
    teams: number;
    taskRuns: number;
    workflowRuns: number;
    /** @deprecated Compatibility count for callers using the old result shape. */
    teamRuns: number;
  };
}

const DEFAULT_INTERVAL_MINUTES = 60;
const DEFAULT_RETRY_DELAY_MINUTES = 15;
const DEFAULT_REMOTE_PORT = 32888;
const SCHEDULER_INTERVAL_MS = 30_000;
const MAX_RUN_HISTORY = 100;
const MAX_SKILL_CONTEXT_CHARS = 24_000;
const MAX_WORKFLOW_ITERATIONS = 5;
const MAX_ASSIGNMENT_ARTIFACT_ATTEMPTS = 3;
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
  completionRecord?: Record<string, unknown>;
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

export type AutomationWorkflowPlannerExecutor = (
  workflow: AutomationWorkflow,
  context: {
    workspacePath: string;
    enabledSkills: SkillDetail[];
    attempt: number;
    maxAttempts: number;
    validationFailure?: string;
    prompt: string;
  },
) => Promise<AutomationExecutionResult>;

export type AutomationNotificationEmitter = (notification: {
  task: ScheduledTask;
  run: AutomationRunRecord;
  status: 'succeeded' | 'failed';
  channel: AutomationNotificationPolicy['channel'];
  message: string;
}) => Promise<void> | void;

export type AutomationWorkflowActorExecutor = (
  workflow: AutomationWorkflow,
  actor: AutomationWorkflowActor,
  context: {
    runId: string;
    workspacePath: string;
    enabledSkills: SkillDetail[];
    assignment: AutomationWorkflowAssignment;
    previousSteps: AutomationWorkflowRunStep[];
    sharedSteps: AutomationWorkflowRunStep[];
    attempt: number;
    maxAttempts: number;
    verificationFailure?: string;
    prompt: string;
  },
) => Promise<AutomationExecutionResult>;

export type VirtualTeamPlannerExecutor = AutomationWorkflowPlannerExecutor;
export type VirtualTeamMemberExecutor = AutomationWorkflowActorExecutor;

class AssignmentArtifactVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssignmentArtifactVerificationError';
  }
}

class IncompleteAutomationExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IncompleteAutomationExecutionError';
  }
}

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
  private readonly workflowsDir: string;
  private readonly workflowRunsDir: string;
  private readonly legacyTeamsDir: string;
  private readonly legacyTeamRunsDir: string;
  private readonly localDir: string;
  private readonly remoteControlPath: string;
  private taskExecutor: AutomationTaskExecutor | null = null;
  private workflowPlannerExecutor: AutomationWorkflowPlannerExecutor | null = null;
  private workflowActorExecutor: AutomationWorkflowActorExecutor | null = null;
  private readonly automationProviders = new Map<string, FeaturePackageAutomationProvider>();
  private readonly automationProviderOwners = new Map<string, string>();
  private automationProvidersReady: Promise<void> = Promise.resolve();
  private notificationEmitter: AutomationNotificationEmitter | null = null;
  private schedulerTimer: NodeJS.Timeout | null = null;
  private schedulerRunning = false;
  private runningTaskIds = new Set<string>();
  private runningWorkflowIds = new Set<string>();
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
    this.workflowsDir = path.join(this.projectDir, 'workflows');
    this.workflowRunsDir = path.join(this.projectDir, 'runs', 'workflows');
    this.legacyTeamsDir = path.join(this.projectDir, 'teams');
    this.legacyTeamRunsDir = path.join(this.projectDir, 'runs', 'teams');
    this.localDir = path.join(this.projectDir, 'local');
    this.remoteControlPath = path.join(this.localDir, 'remote-control.json');
  }

  setTaskExecutor(executor: AutomationTaskExecutor): void {
    this.taskExecutor = executor;
  }

  setVirtualTeamPlannerExecutor(executor: VirtualTeamPlannerExecutor): void {
    this.setWorkflowPlannerExecutor(executor);
  }

  setVirtualTeamMemberExecutor(executor: VirtualTeamMemberExecutor): void {
    this.setWorkflowActorExecutor(executor);
  }

  setWorkflowPlannerExecutor(executor: AutomationWorkflowPlannerExecutor): void {
    this.workflowPlannerExecutor = executor;
  }

  setWorkflowActorExecutor(executor: AutomationWorkflowActorExecutor): void {
    this.workflowActorExecutor = executor;
  }

  registerAutomationProvider(provider: FeaturePackageAutomationProvider, packageId = provider.id): void {
    if (!provider?.id?.trim()) {
      throw new Error('Automation provider id is required.');
    }
    this.automationProviders.set(provider.id, provider);
    this.automationProviderOwners.set(provider.id, packageId);
  }

  unregisterAutomationProvidersForPackage(packageId: string): void {
    for (const [providerId, ownerPackageId] of this.automationProviderOwners) {
      if (ownerPackageId === packageId) {
        this.automationProviders.delete(providerId);
        this.automationProviderOwners.delete(providerId);
      }
    }
  }

  setAutomationProvidersReady(ready: Promise<unknown>): void {
    this.automationProvidersReady = ready.then(() => undefined);
  }

  private resolveAutomationProvider(workflow: AutomationWorkflow): FeaturePackageAutomationProvider {
    if (workflow.providerId) {
      const provider = this.automationProviders.get(workflow.providerId);
      if (!provider) {
        throw new Error(`Automation provider is not installed or active: ${workflow.providerId}`);
      }
      return provider;
    }

    if (this.automationProviders.size === 1) {
      return this.automationProviders.values().next().value as FeaturePackageAutomationProvider;
    }

    throw new Error(this.automationProviders.size === 0
      ? 'No installed package provides this automation workflow.'
      : `Workflow ${workflow.id} does not identify which package owns it.`);
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
      workflows: store.workflows,
      taskRuns: includeRuns ? store.taskRuns : undefined,
      workflowRuns: includeRuns ? store.workflowRuns : undefined,
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
    const workflowsInput = Array.isArray(input.workflows) ? input.workflows : input.teams;
    const workflows = Array.isArray(workflowsInput)
      ? workflowsInput.filter(value => this.isWorkflow(value)).map(workflow => this.normalizeLegacyWorkflow(workflow))
      : [];
    const taskRuns = Array.isArray(input.taskRuns)
      ? input.taskRuns.filter(value => this.isTaskRun(value))
      : [];
    const workflowRunsInput = Array.isArray(input.workflowRuns) ? input.workflowRuns : input.teamRuns;
    const workflowRuns = Array.isArray(workflowRunsInput)
      ? workflowRunsInput
        .filter(value => this.isWorkflowRun(value))
        .map(run => this.normalizeLegacyWorkflowRun(run))
      : [];

    store.skillPolicies = {
      ...store.skillPolicies,
      ...skillPolicies,
    };
    store.tasks = this.mergeRecords(store.tasks, tasks);
    store.workflows = this.mergeRecords(store.workflows, workflows);
    store.taskRuns = this.mergeRecords(store.taskRuns, taskRuns).slice(0, MAX_RUN_HISTORY);
    store.workflowRuns = this.mergeRecords(store.workflowRuns, workflowRuns).slice(0, MAX_RUN_HISTORY);
    await this.writeStore(store);

    return {
      ok: true,
      imported: {
        skillPolicies: Object.keys(skillPolicies).length,
        tasks: tasks.length,
        workflows: workflows.length,
        teams: workflows.length,
        taskRuns: taskRuns.length,
        workflowRuns: workflowRuns.length,
        teamRuns: workflowRuns.length,
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

  async listWorkflows(): Promise<AutomationWorkflow[]> {
    const store = await this.readStore();
    return [...store.workflows].sort((left, right) => right.updatedAt - left.updatedAt);
  }

  async listWorkflowRuns(workflowId?: string): Promise<AutomationWorkflowRun[]> {
    const store = await this.readStore();
    return store.workflowRuns
      .filter(run => !workflowId || run.workflowId === workflowId || run.teamId === workflowId)
      .sort((left, right) => right.startedAt - left.startedAt);
  }

  async saveWorkflow(input: Partial<AutomationWorkflow>): Promise<AutomationWorkflow> {
    await this.automationProvidersReady;
    const store = await this.readStore();
    const now = Date.now();
    const existing = input.id ? store.workflows.find(workflow => workflow.id === input.id) : undefined;
    const members = Array.isArray(input.members) && input.members.length > 0
      ? input.members
      : existing?.members ?? [];
    if (members.length === 0) {
      throw new Error('Workflow actors are required. Create the workflow through an installed automation provider or supply actors explicitly.');
    }
    const supervisorId = input.supervisorId ?? existing?.supervisorId ?? members[0]?.id ?? 'supervisor';

    const workflow: AutomationWorkflow = {
      id: existing?.id ?? input.id ?? this.createId('workflow'),
      providerId: input.providerId ?? existing?.providerId,
      name: String(input.name ?? existing?.name ?? 'Automation workflow').trim() || 'Automation workflow',
      objective: String(input.objective ?? existing?.objective ?? '').trim(),
      workspacePath: this.normalizeWorkspacePath(input.workspacePath ?? existing?.workspacePath),
      permissionMode: this.normalizeWorkflowPermissionMode(input.permissionMode ?? existing?.permissionMode),
      maxIterations: this.normalizeWorkflowMaxIterations(input.maxIterations ?? existing?.maxIterations),
      providerConfig: this.normalizeProviderConfig(input.providerConfig ?? existing?.providerConfig),
      supervisorId,
      members,
      status: input.status ?? existing?.status ?? 'draft',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      lastRunAt: existing?.lastRunAt,
      lastStatus: existing?.lastStatus,
      lastResult: existing?.lastResult,
    };

    if (!workflow.objective) {
      throw new Error('Workflow objective is required.');
    }

    store.workflows = [
      workflow,
      ...store.workflows.filter(candidate => candidate.id !== workflow.id),
    ];
    await this.writeStore(store);
    return workflow;
  }

  /**
   * Compatibility facade for the legacy team-shaped IPC schema. The host creates
   * a package-neutral workflow; the selected package supplies its domain model.
   */
  async createDefaultWorkflow(objective = 'Complete the configured workflow.'): Promise<AutomationWorkflow> {
    await this.automationProvidersReady;
    const providers = [...this.automationProviders.values()].filter(provider => (
      provider.createDefaultWorkflow || provider.createDefaultTeam
    ));
    if (providers.length !== 1) {
      throw new Error(providers.length === 0
        ? 'No installed package provides an automation workflow template.'
        : 'Multiple packages provide automation workflow templates; specify a provider when creating the workflow.');
    }
    const provider = providers[0]!;
    const createWorkflow = provider.createDefaultWorkflow ?? provider.createDefaultTeam;
    if (!createWorkflow) {
      throw new Error(`Automation provider ${provider.id} does not provide a workflow template.`);
    }
    return this.saveWorkflow({
      ...createWorkflow(objective, this.workspacePath),
      providerId: provider.id,
      objective,
      status: 'draft',
    });
  }

  async deleteWorkflow(workflowId: string): Promise<{ ok: true; id: string }> {
    const store = await this.readStore();
    store.workflows = store.workflows.filter(workflow => workflow.id !== workflowId);
    store.workflowRuns = store.workflowRuns.filter(run => run.workflowId !== workflowId && run.teamId !== workflowId);
    await this.writeStore(store);
    return { ok: true, id: workflowId };
  }

  async runWorkflow(workflowId: string): Promise<AutomationWorkflowRun> {
    await this.automationProvidersReady;
    if (this.runningWorkflowIds.has(workflowId)) {
      const running = (await this.listWorkflowRuns(workflowId)).find(run => run.status === 'running');
      if (running) {
        return running;
      }
      throw new Error(`Automation workflow is already running: ${workflowId}`);
    }

    const store = await this.readStore();
    const workflow = store.workflows.find(candidate => candidate.id === workflowId);
    if (!workflow) {
      throw new Error(`Automation workflow not found: ${workflowId}`);
    }
    const provider = this.resolveAutomationProvider(workflow);

    this.runningWorkflowIds.add(workflowId);
    const now = Date.now();
    const maxIterations = this.normalizeWorkflowMaxIterations(workflow.maxIterations);
    const run: AutomationWorkflowRun = {
      id: this.createId('workflow-run'),
      workflowId: workflow.id,
      workflowName: workflow.name,
      teamId: workflow.id,
      teamName: workflow.name,
      objective: workflow.objective,
      workspacePath: workflow.workspacePath ?? this.workspacePath,
      status: 'running',
      startedAt: now,
      milestones: [],
      assignments: [],
      steps: [],
    };

    await this.prepareWorkflowWorkspace(provider, workflow, run);

    workflow.status = 'active';
    workflow.lastRunAt = now;
    workflow.lastStatus = 'running';
    workflow.updatedAt = now;
    store.workflowRuns = [run, ...store.workflowRuns].slice(0, MAX_RUN_HISTORY);
    await this.writeStore(store);

    try {
      const enabledSkills = await this.getEnabledSkillContext();
      const assignments = await this.createWorkflowPlan(provider, workflow, run, enabledSkills, maxIterations);
      run.assignments = assignments;
      run.milestones = this.createWorkflowMilestones(assignments, now);
      await this.upsertWorkflowRun(run);
      await this.executeWorkflowPlan(workflow, run, assignments, enabledSkills);

      const completionFailure = await provider.validateCompletedRun?.(workflow, run);
      if (completionFailure) {
        throw new Error(completionFailure);
      }
      run.status = 'succeeded';
      run.completedAt = Date.now();
      run.summary = this.summarizeWorkflowRun(run);
      run.artifactPath = await this.writeWorkflowRunArtifact(run);
      await this.completeWorkflowRun(workflow.id, run, 'completed', run.summary);
      return run;
    } catch (error) {
      run.status = 'failed';
      run.completedAt = Date.now();
      run.error = error instanceof Error ? error.message : String(error);
      run.artifactPath = await this.writeWorkflowRunArtifact(run);
      await this.completeWorkflowRun(workflow.id, run, 'paused', run.error);
      return run;
    } finally {
      this.runningWorkflowIds.delete(workflowId);
    }
  }

  // Legacy IPC adapters. Persisted fields retain their historical names until a
  // versioned data migration can be shipped without breaking installed clients.
  async listTeams(): Promise<VirtualTeamBlueprint[]> { return this.listWorkflows(); }
  async listTeamRuns(teamId?: string): Promise<VirtualTeamRunRecord[]> { return this.listWorkflowRuns(teamId); }
  async saveTeam(input: Partial<VirtualTeamBlueprint>): Promise<VirtualTeamBlueprint> { return this.saveWorkflow(input); }
  async createDefaultTeam(objective?: string): Promise<VirtualTeamBlueprint> { return this.createDefaultWorkflow(objective); }
  async deleteTeam(teamId: string): Promise<{ ok: true; id: string }> { return this.deleteWorkflow(teamId); }
  async runTeam(teamId: string): Promise<VirtualTeamRunRecord> { return this.runWorkflow(teamId); }

  private async createWorkflowPlan(
    provider: FeaturePackageAutomationProvider,
    workflow: AutomationWorkflow,
    run: AutomationWorkflowRun,
    enabledSkills: SkillDetail[],
    maxIterations: number,
  ): Promise<AutomationWorkflowAssignment[]> {
    const workflowWorkspacePath = this.normalizeWorkspacePath(workflow.workspacePath) ?? this.workspacePath;
    let planningFailure: string | undefined;

    if (this.workflowPlannerExecutor) {
      const maxPlanAttempts = 3;
      for (let attempt = 1; attempt <= maxPlanAttempts; attempt += 1) {
        try {
          const result = await this.workflowPlannerExecutor(workflow, {
            workspacePath: workflowWorkspacePath,
            enabledSkills,
            attempt,
            maxAttempts: maxPlanAttempts,
            validationFailure: planningFailure,
            prompt: provider.buildPlannerPrompt(workflow, {
              workspacePath: workflowWorkspacePath,
              enabledSkills,
              attempt,
              maxAttempts: maxPlanAttempts,
              validationFailure: planningFailure,
            }),
          });
          this.assertExecutionCompleted(result.content);
          // Parsing and validation are domain policy owned by the installed package.
          // The core only schedules the returned package-neutral workflow graph.
          const assignments = provider.parseAssignmentPlan(result.content, workflow) as AutomationWorkflowAssignment[];
          planningFailure = provider.validateAssignmentPlan(workflow, assignments);
          if (!planningFailure) {
            const normalized = this.assignParallelGroups(assignments);
            if (normalized.length > 0) {
              return this.withAssignmentWorkspaces(workflow, run, normalized);
            }
            planningFailure = 'The plan contains circular or unresolved dependencies.';
          }
        } catch (error) {
          planningFailure = error instanceof Error ? error.message : String(error);
        }
      }
      console.warn(`Automation provider ${provider.id} did not produce a valid plan:`, planningFailure);
    }
    const fallback = provider.createFallbackAssignmentPlan?.(workflow, maxIterations) as AutomationWorkflowAssignment[] | undefined;
    if (!fallback?.length) {
      throw new Error([
        `Automation provider ${provider.id} could not produce an execution plan.`,
        planningFailure ? `Last planning error: ${planningFailure}` : '',
      ].filter(Boolean).join(' '));
    }
    const validationFailure = provider.validateAssignmentPlan(workflow, fallback);
    if (validationFailure) {
      throw new Error(`Automation provider ${provider.id} fallback plan is invalid: ${validationFailure}`);
    }
    return this.withAssignmentWorkspaces(workflow, run, this.assignParallelGroups(fallback));
  }

  private async executeWorkflowPlan(
    workflow: AutomationWorkflow,
    run: AutomationWorkflowRun,
    assignments: AutomationWorkflowAssignment[],
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
        throw new Error('Automation workflow plan has unresolved or circular dependencies.');
      }

      readyAssignments.forEach(assignment => this.beginWorkflowAssignment(run, assignment));
      await this.upsertWorkflowRun(run);

      const results = await Promise.allSettled(
        readyAssignments.map(assignment => this.runWorkflowAssignment(workflow, run, assignment, enabledSkills)),
      );
      await this.upsertWorkflowRun(run);

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

  private beginWorkflowAssignment(run: AutomationWorkflowRun, assignment: AutomationWorkflowAssignment): void {
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
    this.updateWorkflowMilestone(run, assignment.id, {
      status: 'running',
      startedAt: stepStartedAt,
    });
  }

  private async runWorkflowAssignment(
    workflow: AutomationWorkflow,
    run: AutomationWorkflowRun,
    assignment: AutomationWorkflowAssignment,
    enabledSkills: SkillDetail[],
  ): Promise<void> {
    const provider = this.resolveAutomationProvider(workflow);
    const step = run.steps.find(candidate => candidate.assignmentId === assignment.id && candidate.status === 'running');
    if (!step) {
      throw new Error(`Automation workflow step not found: ${assignment.id}`);
    }

    try {
      const member = this.getAssignmentMember(workflow, assignment);
      const sharedSteps = run.steps.filter(candidate => candidate.status === 'succeeded');
      const dependencySteps = sharedSteps.filter(candidate => (
        candidate.assignmentId ? assignment.dependencies.includes(candidate.assignmentId) : false
      ));
      await this.prepareAssignmentWorkspace(provider, workflow, run, assignment, dependencySteps);
      const usesSharedWorkspace = this.isSharedAssignmentWorkspace(workflow, assignment);
      const internalArtifactPaths = provider.internalArtifactPaths?.({
        workspacePath: assignment.workspacePath!,
        assignment,
      }) ?? [];
      const beforeArtifacts = usesSharedWorkspace
        ? new Map<string, string>()
        : await this.snapshotWorkspaceArtifacts(
            assignment.workspacePath!,
            internalArtifactPaths,
            assignment.expectedArtifacts,
          );
      let result: AutomationExecutionResult | undefined;
      let producedArtifacts: string[] = [];
      let verificationFailure: string | undefined;
      const maxAttempts = usesSharedWorkspace || !this.assignmentRequiresArtifact(assignment)
        ? 1
        : MAX_ASSIGNMENT_ARTIFACT_ATTEMPTS;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        if (!this.workflowActorExecutor) {
          throw new Error('No automation member executor is configured. The host cannot complete package automation work without an executor.');
        }
        result = await this.workflowActorExecutor(workflow, member, {
              workspacePath: assignment.workspacePath ?? workflow.workspacePath ?? this.workspacePath,
              runId: run.id,
              enabledSkills,
              assignment,
              previousSteps: dependencySteps,
              sharedSteps,
              attempt,
              maxAttempts,
              verificationFailure,
              prompt: provider.buildMemberPrompt(workflow, member, {
                workspacePath: assignment.workspacePath ?? workflow.workspacePath ?? this.workspacePath,
                runId: run.id,
                enabledSkills,
                assignment,
                previousSteps: dependencySteps,
                sharedSteps,
                attempt,
                maxAttempts,
                verificationFailure,
              }),
            });
        try {
          this.assertExecutionCompleted(result.content);
          producedArtifacts = usesSharedWorkspace
            ? []
            : await this.collectProducedArtifacts(provider, assignment, beforeArtifacts);
          const providerFailure = await provider.validateAssignmentCompletion?.(
            workflow,
            run,
            assignment,
            {
              workspacePath: assignment.workspacePath ?? workflow.workspacePath ?? this.workspacePath,
              output: result.content,
              completionRecord: result.completionRecord,
              producedArtifacts,
              dependencyOutputs: dependencySteps,
            },
          );
          if (providerFailure) {
            throw new AssignmentArtifactVerificationError(providerFailure);
          }
          verificationFailure = undefined;
          break;
        } catch (error) {
          const recoverable = error instanceof AssignmentArtifactVerificationError
            || error instanceof IncompleteAutomationExecutionError;
          if (!recoverable || attempt >= maxAttempts) {
            throw error;
          }
          verificationFailure = error.message;
          await this.removeRejectedPlaceholderArtifacts(assignment.workspacePath!);
        }
      }
      if (!result || verificationFailure) {
        throw new Error(verificationFailure ?? `Assignment "${assignment.title}" did not return a result.`);
      }
      if (!usesSharedWorkspace) {
        await this.promoteAssignmentArtifacts(workflow, assignment, beforeArtifacts, producedArtifacts);
      }
      assignment.producedArtifacts = producedArtifacts;
      assignment.status = 'succeeded';
      assignment.completedAt = Date.now();
      assignment.output = result.content;
      step.status = 'succeeded';
      step.completedAt = assignment.completedAt;
      step.output = result.content;
      step.producedArtifacts = producedArtifacts;
      this.updateWorkflowMilestone(run, assignment.id, {
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
      this.updateWorkflowMilestone(run, assignment.id, {
        status: 'failed',
        completedAt: step.completedAt,
        summary: message,
      });
      throw error;
    }
  }

  private assignParallelGroups(assignments: AutomationWorkflowAssignment[]): AutomationWorkflowAssignment[] {
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
    workflow: AutomationWorkflow,
    run: AutomationWorkflowRun,
    assignments: AutomationWorkflowAssignment[],
  ): AutomationWorkflowAssignment[] {
    return assignments.map(assignment => ({
      ...assignment,
      workspacePath: this.getAssignmentWorkspacePath(workflow, run, assignment),
    }));
  }

  private getAssignmentWorkspacePath(
    workflow: AutomationWorkflow,
    run: AutomationWorkflowRun,
    assignment: AutomationWorkflowAssignment,
  ): string {
    const runWorkspacePath = this.normalizeWorkspacePath(workflow.workspacePath) ?? this.workspacePath;
    if (assignment.workspaceMode === 'shared') {
      return runWorkspacePath;
    }
    return path.join(
      runWorkspacePath,
      '.code-agent',
      'workflow-runs',
      run.id,
      'workers',
      `${this.slug(assignment.memberName)}-${assignment.id}`,
    );
  }

  private isSharedAssignmentWorkspace(workflow: AutomationWorkflow, assignment: AutomationWorkflowAssignment): boolean {
    const workflowWorkspacePath = this.normalizeWorkspacePath(workflow.workspacePath) ?? this.workspacePath;
    return path.resolve(assignment.workspacePath ?? '') === path.resolve(workflowWorkspacePath);
  }

  private async prepareAssignmentWorkspace(
    provider: FeaturePackageAutomationProvider,
    workflow: AutomationWorkflow,
    run: AutomationWorkflowRun,
    assignment: AutomationWorkflowAssignment,
    dependencySteps: AutomationWorkflowRunStep[],
  ): Promise<void> {
    const workspacePath = assignment.workspacePath ?? this.getAssignmentWorkspacePath(workflow, run, assignment);
    assignment.workspacePath = workspacePath;
    await fs.mkdir(workspacePath, { recursive: true });
    const isSharedWorkspace = this.isSharedAssignmentWorkspace(workflow, assignment);
    if (!isSharedWorkspace) {
      await this.seedPrivateAssignmentWorkspace(workflow, workspacePath);
    }
    await provider.prepareAssignment?.(workflow, run, assignment, {
      workspacePath,
      dependencyOutputs: dependencySteps,
    });
  }

  private async seedPrivateAssignmentWorkspace(workflow: AutomationWorkflow, workspacePath: string): Promise<void> {
    const workflowWorkspace = this.normalizeWorkspacePath(workflow.workspacePath) ?? this.workspacePath;
    await this.copyWorkspaceTree(workflowWorkspace, workspacePath);
  }

  private async copyWorkspaceTree(sourceRoot: string, destinationRoot: string): Promise<void> {
    const ignoredDirectories = new Set([
      '.code-agent', '.git', 'node_modules', 'dist', 'build', 'coverage', '.venv', 'venv',
      '__pycache__', '.pytest_cache', '.mypy_cache', '.gradle', 'target',
    ]);
    const visit = async (sourceDir: string, destinationDir: string): Promise<void> => {
      await fs.mkdir(destinationDir, { recursive: true });
      const entries = await fs.readdir(sourceDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
          continue;
        }
        const sourcePath = path.join(sourceDir, entry.name);
        const destinationPath = path.join(destinationDir, entry.name);
        if (entry.isDirectory()) {
          await visit(sourcePath, destinationPath);
        } else if (entry.isFile()) {
          await fs.copyFile(sourcePath, destinationPath);
        }
      }
    };
    await visit(sourceRoot, destinationRoot);
  }

  private async snapshotWorkspaceArtifacts(
    workspacePath: string,
    internalArtifactPaths: Iterable<string> = [],
    expectedArtifactPaths: Iterable<string> = [],
  ): Promise<Map<string, string>> {
    const snapshot = new Map<string, string>();
    const ignoredFiles = new Set(
      [...internalArtifactPaths].map(file => path.normalize(file).replace(/^\.([/\\])/, '')),
    );
    const ignoredDirectories = new Set([
      '.code-agent', '.git', 'node_modules', 'dist', 'build', 'coverage', '.venv', 'venv',
      '__pycache__', '.pytest_cache', '.mypy_cache', '.gradle', 'target',
    ]);
    const visit = async (directory: string): Promise<void> => {
      const entries = await fs.readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
          continue;
        }
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          await visit(absolutePath);
        } else if (entry.isFile()) {
          const relativePath = path.relative(workspacePath, absolutePath);
          if (ignoredFiles.has(relativePath)) {
            continue;
          }
          const content = await fs.readFile(absolutePath);
          snapshot.set(relativePath, crypto.createHash('sha256').update(content).digest('hex'));
        }
      }
    };
    await visit(workspacePath);

    // Large generated directories are intentionally skipped during the general
    // scan, but a package may explicitly declare a deliverable inside one of
    // them (for example build/app.zip). Always inspect those exact paths so the
    // verifier does not reject an artifact merely because of its directory.
    for (const expectedArtifactPath of expectedArtifactPaths) {
      const relativePath = path.normalize(expectedArtifactPath).replace(/^\.([/\\])/, '');
      const absolutePath = path.resolve(workspacePath, relativePath);
      const relativeToWorkspace = path.relative(path.resolve(workspacePath), absolutePath);
      if (!relativePath || relativeToWorkspace.startsWith('..') || path.isAbsolute(relativeToWorkspace)) {
        throw new Error(`Assignment declared an unsafe expected artifact path: ${expectedArtifactPath}`);
      }
      if (ignoredFiles.has(relativePath)) {
        continue;
      }
      try {
        const stat = await fs.stat(absolutePath);
        if (!stat.isFile()) {
          continue;
        }
        const content = await fs.readFile(absolutePath);
        snapshot.set(relativePath, crypto.createHash('sha256').update(content).digest('hex'));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    }
    return snapshot;
  }

  private async collectProducedArtifacts(
    provider: FeaturePackageAutomationProvider,
    assignment: AutomationWorkflowAssignment,
    beforeArtifacts: Map<string, string>,
  ): Promise<string[]> {
    const internalArtifactPaths = provider.internalArtifactPaths?.({
      workspacePath: assignment.workspacePath!,
      assignment,
    }) ?? [];
    const afterArtifacts = await this.snapshotWorkspaceArtifacts(
      assignment.workspacePath!,
      internalArtifactPaths,
      assignment.expectedArtifacts,
    );
    const producedArtifacts = [...afterArtifacts.entries()]
      .filter(([relativePath, digest]) => beforeArtifacts.get(relativePath) !== digest)
      .map(([relativePath]) => relativePath)
      .sort();

    if (this.assignmentRequiresArtifact(assignment) && producedArtifacts.length === 0) {
      throw new AssignmentArtifactVerificationError(`Assignment "${assignment.title}" reported completion but produced no verifiable files. Narrative output does not complete artifact-producing work.`);
    }

    if (assignment.requiresNonDocumentationArtifact && !producedArtifacts.some(file => !this.isDocumentationArtifact(file))) {
      throw new AssignmentArtifactVerificationError(`Artifact assignment "${assignment.title}" produced no required non-documentation artifact. Documentation alone does not satisfy this assignment.`);
    }

    const missingExpected = (assignment.expectedArtifacts ?? []).filter(expected => {
      const normalized = path.normalize(expected).replace(/^\.([/\\])/, '');
      return !afterArtifacts.has(normalized);
    });
    if (missingExpected.length > 0) {
      throw new AssignmentArtifactVerificationError(`Assignment "${assignment.title}" is missing expected artifact(s): ${missingExpected.join(', ')}`);
    }
    const placeholderArtifacts: string[] = [];
    for (const relativePath of producedArtifacts) {
      if (await this.isPlaceholderArtifact(assignment.workspacePath!, relativePath)) {
        placeholderArtifacts.push(relativePath);
      }
    }
    if (placeholderArtifacts.length > 0) {
      throw new AssignmentArtifactVerificationError(
        `Assignment "${assignment.title}" produced placeholder artifact(s) instead of usable content: ${placeholderArtifacts.join(', ')}`,
      );
    }
    return producedArtifacts;
  }

  private async promoteAssignmentArtifacts(
    workflow: AutomationWorkflow,
    assignment: AutomationWorkflowAssignment,
    beforeArtifacts: Map<string, string>,
    producedArtifacts: string[],
  ): Promise<void> {
    const projectWorkspace = this.normalizeWorkspacePath(workflow.workspacePath) ?? this.workspacePath;
    for (const relativePath of producedArtifacts) {
      const sourcePath = path.resolve(assignment.workspacePath!, relativePath);
      const destinationPath = path.resolve(projectWorkspace, relativePath);
      if (!destinationPath.startsWith(`${path.resolve(projectWorkspace)}${path.sep}`)) {
        throw new Error(`Assignment produced an unsafe artifact path: ${relativePath}`);
      }
      try {
        const current = await fs.readFile(destinationPath);
        const currentDigest = crypto.createHash('sha256').update(current).digest('hex');
        const baselineDigest = beforeArtifacts.get(relativePath);
        if (!baselineDigest || currentDigest !== baselineDigest) {
          throw new Error(`Artifact promotion conflict for ${relativePath}; another assignment changed the project copy.`);
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
      await fs.mkdir(path.dirname(destinationPath), { recursive: true });
      await fs.copyFile(sourcePath, destinationPath);
    }
  }

  private assignmentRequiresArtifact(assignment: AutomationWorkflowAssignment): boolean {
    return assignment.requiresArtifact === true;
  }

  private isDocumentationArtifact(relativePath: string): boolean {
    return ['.md', '.txt', '.rst', '.adoc'].includes(path.extname(relativePath).toLowerCase());
  }

  private async isPlaceholderArtifact(workspacePath: string, relativePath: string): Promise<boolean> {
    const textExtensions = new Set([
      '.adoc', '.css', '.csv', '.html', '.htm', '.ini', '.js', '.json', '.jsx', '.md', '.mjs',
      '.py', '.rst', '.sh', '.toml', '.ts', '.tsx', '.txt', '.xml', '.yaml', '.yml',
    ]);
    if (!textExtensions.has(path.extname(relativePath).toLowerCase())) {
      return false;
    }
    const content = await fs.readFile(path.resolve(workspacePath, relativePath), 'utf8');
    const normalized = content.trim();
    return /^\[content omitted after successful tool execution;\s*\d+\s+characters\]$/i.test(normalized)
      || /^\[(?:content|code|implementation) omitted\]$/i.test(normalized);
  }

  /** Remove transcript metadata accidentally materialized as a whole file. */
  private async removeRejectedPlaceholderArtifacts(workspacePath: string): Promise<void> {
    const artifacts = await this.snapshotWorkspaceArtifacts(workspacePath, []);
    for (const relativePath of artifacts.keys()) {
      if (await this.isPlaceholderArtifact(workspacePath, relativePath)) {
        await fs.unlink(path.resolve(workspacePath, relativePath));
      }
    }
  }

  private getAssignmentMember(workflow: AutomationWorkflow, assignment: AutomationWorkflowAssignment): AutomationWorkflowActor {
    return workflow.members.find(actor => actor.id === assignment.memberId)
      ?? workflow.members.find(actor => actor.name === assignment.memberName)
      ?? workflow.members[0]
      ?? (() => { throw new Error(`Workflow ${workflow.id} has no actors.`); })();
  }

  private createWorkflowMilestones(
    assignments: AutomationWorkflowAssignment[],
    createdAt: number,
  ): AutomationWorkflowMilestone[] {
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

  private updateWorkflowMilestone(
    run: AutomationWorkflowRun,
    assignmentId: string,
    update: Partial<Pick<AutomationWorkflowMilestone, 'status' | 'startedAt' | 'completedAt' | 'summary'>>,
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

    if (request.method === 'GET' && pathname === '/api/workflows') {
      this.sendJson(response, 200, {
        workflows: await this.listWorkflows(),
        runs: await this.listWorkflowRuns(),
      });
      return;
    }

    const workflowRunMatch = pathname.match(/^\/api\/workflows\/([^/]+)\/run$/);
    if (request.method === 'POST' && workflowRunMatch) {
      this.sendJson(response, 200, { run: await this.runWorkflow(workflowRunMatch[1]) });
      return;
    }

    // Deprecated HTTP aliases retained for paired clients from older builds.
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
    <section><h2>Workflows</h2><div id="workflows"></div></section>
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
    async function runWorkflow(id) {
      await api('/api/workflows/' + encodeURIComponent(id) + '/run', { method: 'POST', body: '{}' });
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
      const workflows = await api('/api/workflows');
      renderList('workflows', workflows.workflows || [], workflow =>
        '<article><strong>' + workflow.name + '</strong><p>' + workflow.objective + '</p><p class="muted">' + workflow.status + '</p>' +
        '<button onclick="runWorkflow(\\'' + workflow.id + '\\')">Run</button></article>'
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

  private assertExecutionCompleted(content: string): void {
    if (content.includes(TOOL_ROUND_LIMIT_MESSAGE)) {
      throw new Error(`${TOOL_ROUND_LIMIT_MESSAGE} The automation step did not finish. Increase the desktop tool-call round limit or make the workflow objective more explicit.`);
    }
    const normalized = content.toLowerCase();
    if (
      normalized.includes('the model did not produce a valid, verifiable completion')
      || normalized.includes("couldn’t complete that request because the required tool access was not available")
      || normalized.includes("couldn't complete that request because the required tool access was not available")
      || normalized.includes('i could not complete the requested project action')
    ) {
      throw new IncompleteAutomationExecutionError(`Automation worker reported an incomplete outcome: ${content.trim()}`);
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

  private summarizeWorkflowRun(run: AutomationWorkflowRun): string {
    const succeeded = run.steps.filter(step => step.status === 'succeeded').length;
    const failed = run.steps.filter(step => step.status === 'failed').length;
    const assignments = run.assignments?.length ?? run.steps.length;
    const parallelGroups = new Set((run.assignments ?? []).map(assignment => assignment.parallelGroup)).size;
    return `Workflow run ${run.id} completed ${succeeded}/${assignments} assignment(s) with ${failed} failed step(s) across ${parallelGroups || 1} execution group(s).`;
  }

  private async prepareWorkflowWorkspace(
    provider: FeaturePackageAutomationProvider,
    workflow: AutomationWorkflow,
    run: AutomationWorkflowRun,
  ): Promise<void> {
    const runWorkspacePath = this.normalizeWorkspacePath(workflow.workspacePath) ?? this.workspacePath;
    await fs.mkdir(path.join(runWorkspacePath, '.code-agent'), { recursive: true });
    await provider.prepareRun?.(workflow, run, { workspacePath: runWorkspacePath });
  }

  private async writeWorkflowRunArtifact(run: AutomationWorkflowRun): Promise<string> {
    const runWorkspacePath = this.normalizeWorkspacePath(run.workspacePath) ?? this.workspacePath;
    const artifactDir = path.join(runWorkspacePath, '.code-agent', 'workflow-runs');
    await fs.mkdir(artifactDir, { recursive: true });
    const artifactPath = path.join(artifactDir, `${run.id}.md`);
    const lines = [
      `# ${run.workflowName} Run`,
      '',
      `- Run ID: ${run.id}`,
      `- Workflow ID: ${run.workflowId}`,
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
        assignment.producedArtifacts?.length ? `  - Produced: ${assignment.producedArtifacts.join(', ')}` : '',
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
        step.producedArtifacts?.length ? `Produced artifacts: ${step.producedArtifacts.join(', ')}` : '',
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

  private async upsertWorkflowRun(run: AutomationWorkflowRun): Promise<void> {
    const store = await this.readStore();
    store.workflowRuns = [
      run,
      ...store.workflowRuns.filter(candidate => candidate.id !== run.id),
    ].slice(0, MAX_RUN_HISTORY);
    await this.writeStore(store);
  }

  private async completeWorkflowRun(
    workflowId: string,
    run: AutomationWorkflowRun,
    status: AutomationWorkflow['status'],
    result?: string,
  ): Promise<void> {
    const store = await this.readStore();
    const workflow = store.workflows.find(candidate => candidate.id === workflowId);
    if (workflow) {
      workflow.status = status;
      workflow.lastRunAt = run.startedAt;
      workflow.lastStatus = run.status;
      workflow.lastResult = result;
      workflow.updatedAt = Date.now();
    }
    store.workflowRuns = [
      run,
      ...store.workflowRuns.filter(candidate => candidate.id !== run.id),
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
    const workflows = await this.readJsonDirectory<AutomationWorkflow>(this.workflowsDir);
    const legacyTeams = await this.readJsonDirectory<VirtualTeamBlueprint>(this.legacyTeamsDir);
    const workflowRuns = await this.readJsonDirectory<AutomationWorkflowRun>(this.workflowRunsDir);
    const legacyTeamRuns = await this.readJsonDirectory<VirtualTeamRunRecord>(this.legacyTeamRunsDir);
    const remoteControl = await this.readJsonFile<RemoteControlState | undefined>(this.remoteControlPath, undefined);

    return {
      version: 1,
      skillPolicies: skillPolicies && typeof skillPolicies === 'object' ? skillPolicies : {},
      tasks: tasks.filter(this.isScheduledTask).map(task => this.normalizeScheduledTask(task)),
      taskRuns: taskRuns.filter(this.isTaskRun),
      remoteControl: this.normalizeRemoteControl(remoteControl),
      workflows: this.mergeRecords(
        legacyTeams.filter(this.isWorkflow).map(workflow => this.normalizeLegacyWorkflow(workflow)),
        workflows.filter(this.isWorkflow).map(workflow => this.normalizeLegacyWorkflow(workflow)),
      ),
      workflowRuns: this.mergeRecords(
        legacyTeamRuns.filter(this.isWorkflowRun).map(run => this.normalizeLegacyWorkflowRun(run)),
        workflowRuns.filter(this.isWorkflowRun).map(run => this.normalizeLegacyWorkflowRun(run)),
      ),
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
    await this.syncJsonDirectory(this.workflowsDir, store.workflows.map(workflow => this.normalizeLegacyWorkflow(workflow)), workflow => workflow.id);
    await this.syncJsonDirectory(this.workflowRunsDir, store.workflowRuns, run => run.id);
    await this.writeJsonFile(this.remoteControlPath, this.normalizeRemoteControl(store.remoteControl));
  }

  private createDefaultStore(): AutomationStore {
    return {
      version: 1,
      skillPolicies: {},
      tasks: [],
      taskRuns: [],
      remoteControl: this.normalizeRemoteControl(undefined),
      workflows: [],
      workflowRuns: [],
    };
  }

  private async readLegacyStore(): Promise<AutomationStore> {
    try {
      const raw = await fs.readFile(this.legacyStorePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<AutomationStore> & {
        teams?: VirtualTeamBlueprint[];
        teamRuns?: VirtualTeamRunRecord[];
      };
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
        workflows: Array.isArray(parsed.workflows ?? parsed.teams)
          ? (parsed.workflows ?? parsed.teams)!.filter(this.isWorkflow).map(workflow => this.normalizeLegacyWorkflow(workflow))
          : [],
        workflowRuns: Array.isArray(parsed.workflowRuns ?? parsed.teamRuns)
          ? (parsed.workflowRuns ?? parsed.teamRuns)!
            .filter(this.isWorkflowRun)
            .map(run => this.normalizeLegacyWorkflowRun(run))
          : [],
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

  private isWorkflow(value: unknown): value is AutomationWorkflow {
    return Boolean(value && typeof value === 'object' && typeof (value as AutomationWorkflow).id === 'string');
  }

  private isWorkflowRun(value: unknown): value is AutomationWorkflowRun {
    return Boolean(value && typeof value === 'object' && typeof (value as AutomationWorkflowRun).id === 'string');
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

  private normalizeWorkflowPermissionMode(value: unknown): AutomationWorkflowPermissionMode {
    return value === 'supervised' ? 'supervised' : 'full-access';
  }

  private normalizeWorkflowMaxIterations(value: unknown): number {
    const parsed = Number(value ?? 1);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return 1;
    }
    return Math.min(Math.floor(parsed), MAX_WORKFLOW_ITERATIONS);
  }

  private normalizeProviderConfig(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    return { ...(value as Record<string, unknown>) };
  }

  private normalizeLegacyWorkflow(team: VirtualTeamBlueprint): VirtualTeamBlueprint {
    return {
      ...team,
      workspacePath: this.normalizeWorkspacePath(team.workspacePath),
      permissionMode: this.normalizeWorkflowPermissionMode(team.permissionMode),
      maxIterations: this.normalizeWorkflowMaxIterations(team.maxIterations),
      providerConfig: this.normalizeProviderConfig(team.providerConfig),
      members: Array.isArray(team.members)
        ? team.members.map(member => ({
            ...member,
            tools: Array.isArray(member.tools) ? member.tools.map(String) : [],
          }))
        : [],
    };
  }

  private normalizeLegacyWorkflowRun(run: VirtualTeamRunRecord): VirtualTeamRunRecord {
    const workflowId = typeof run.workflowId === 'string' && run.workflowId.trim()
      ? run.workflowId
      : run.teamId;
    const workflowName = typeof run.workflowName === 'string' && run.workflowName.trim()
      ? run.workflowName
      : run.teamName;

    return {
      ...run,
      workflowId,
      workflowName,
      teamId: typeof run.teamId === 'string' && run.teamId.trim() ? run.teamId : workflowId,
      teamName: typeof run.teamName === 'string' && run.teamName.trim() ? run.teamName : workflowName,
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
