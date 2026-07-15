import { AppStateServiceBridge } from '../../electron/services/app-state-service-bridge.js';
import {
  type VirtualTeamBlueprint,
  type VirtualTeamMember,
  type VirtualTeamPermissionMode,
} from '../../electron/services/automation-service-bridge.js';
import { createAutomationService } from './automation.js';
import * as os from 'os';
import * as path from 'path';
import { tryParseShellCommand, type ParseEntry } from '../../utils/bash/shellQuote.js';

type SoftwareProjectMode = 'guided' | 'autonomous';
type SoftwareProjectStatus = 'idea' | 'planning' | 'active' | 'stopped' | 'blocked' | 'done';

interface SoftwareProjectPlan {
  id: string;
  name: string;
  mode: SoftwareProjectMode;
  status: SoftwareProjectStatus;
  idea: string;
  goals: string;
  artifacts: string[];
  workspacePath?: string;
  supervisorRole: string;
  teamRoles: string[];
  supervisorEmployeeId: string;
  assignedEmployeeIds: string[];
  assignedTeamIds: string[];
  permissionMode: VirtualTeamPermissionMode;
  createdAt: number;
  updatedAt: number;
}

interface PersistedSoftwareProjectsState {
  activeProjectId: string;
  projects: SoftwareProjectPlan[];
}

interface VirtualRoleDefinition {
  id: string;
  title: string;
  responsibilities: string[];
  defaultGoal: string;
  defaultTools: string[];
  canSupervise: boolean;
  createdAt: number;
  updatedAt: number;
}

interface VirtualEmployeeProfile {
  id: string;
  name: string;
  roleId: string;
  role: string;
  model: string;
  status: 'idle' | 'working' | 'approval';
  permissions: string[];
  currentTask: string;
  createdAt: number;
  updatedAt: number;
}

interface ProjectTeamDefinition {
  id: string;
  name: string;
  mission: string;
  supervisorEmployeeId: string;
  memberEmployeeIds: string[];
  createdAt: number;
  updatedAt: number;
}

interface ProjectGeneratedOutput {
  id: string;
  projectId: string;
  path: string;
  absolutePath: string;
  summary: string;
  kind?: string;
  createdAt: number;
  updatedAt: number;
}

const DESKTOP_PROJECTS_STATE_KEY = 'desktopSoftwareProjects';
const DESKTOP_ROLES_STATE_KEY = 'desktopVirtualRoles';
const DESKTOP_EMPLOYEES_STATE_KEY = 'desktopVirtualEmployees';
const DESKTOP_PROJECT_TEAMS_STATE_KEY = 'desktopProjectTeams';
const DESKTOP_PROJECT_CHATS_STATE_KEY = 'desktopProjectChats';
const DESKTOP_PROJECT_OUTPUTS_STATE_KEY = 'desktopProjectOutputs';

const DEFAULT_PROJECT_ARTIFACTS = [
  'Product brief',
  'Requirements',
  'Architecture plan',
  'Implementation plan',
  'Task backlog',
  'Test plan',
];

const DEFAULT_AUTONOMOUS_ROLES = [
  'Supervisor',
  'Product Manager',
  'Architect',
  'Developer',
  'QA Reviewer',
];

const DEFAULT_EMPLOYEE_PERMISSIONS = [
  'Read workspace',
  'Write code',
  'Run tests',
];

const DEFAULT_ROLE_BLUEPRINTS = [
  {
    id: 'role-supervisor',
    title: 'Supervisor',
    responsibilities: [
      'Own project execution on behalf of the human',
      'Assign work to employees',
      'Approve or reject risky actions according to project permission mode',
      'Keep deliverables aligned to goals and acceptance criteria',
    ],
    defaultGoal: 'Coordinate the team, remove blockers, and keep project execution aligned to the human goal.',
    defaultTools: ['fs.read', 'bash.run'],
    canSupervise: true,
  },
  {
    id: 'role-product-manager',
    title: 'Product Manager',
    responsibilities: [
      'Clarify users, scope, success criteria, and acceptance tests',
      'Turn ideas into prioritized requirements and backlog items',
      'Identify missing business or workflow decisions',
    ],
    defaultGoal: 'Convert the human idea into crisp requirements, user flows, and acceptance criteria.',
    defaultTools: ['fs.read'],
    canSupervise: false,
  },
  {
    id: 'role-architect',
    title: 'Architect',
    responsibilities: [
      'Design system structure and technical boundaries',
      'Identify integration risks and implementation sequencing',
      'Review architecture changes before implementation fans out',
    ],
    defaultGoal: 'Design the technical approach and keep implementation choices coherent with the existing codebase.',
    defaultTools: ['fs.read', 'bash.run'],
    canSupervise: false,
  },
  {
    id: 'role-developer',
    title: 'Developer',
    responsibilities: [
      'Implement scoped code changes',
      'Update or add tests for changed behavior',
      'Report blockers and hand off work for review',
    ],
    defaultGoal: 'Implement the assigned project tasks with focused, tested code changes.',
    defaultTools: ['fs.read', 'fs.write', 'bash.run'],
    canSupervise: false,
  },
  {
    id: 'role-qa-reviewer',
    title: 'QA Reviewer',
    responsibilities: [
      'Plan verification coverage',
      'Run checks and capture failures',
      'Validate deliverables against acceptance criteria',
    ],
    defaultGoal: 'Verify the project deliverables and call out gaps before the project is marked complete.',
    defaultTools: ['fs.read', 'bash.run'],
    canSupervise: false,
  },
];

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

type ProjectStudioSlashScope = 'project' | 'team' | 'employee' | 'people' | 'role';

type ParsedProjectStudioArgs = {
  positionals: string[];
  options: Record<string, string | boolean | undefined>;
};

function createId(prefix: string, seed = prefix): string {
  const slug = seed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || prefix;
  return `${prefix}-${slug}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeStringList(values: unknown, fallback: string[]): string[] {
  const candidates = Array.isArray(values)
    ? values
    : typeof values === 'string'
      ? values.split(/[\n,]/)
      : [];
  const normalized = candidates
    .map(value => String(value ?? '').trim())
    .filter(Boolean);
  return normalized.length > 0 ? Array.from(new Set(normalized)) : [...fallback];
}

function normalizeStatus(value: unknown, fallback: SoftwareProjectStatus = 'idea'): SoftwareProjectStatus {
  return value === 'planning' || value === 'active' || value === 'stopped' || value === 'blocked' || value === 'done' || value === 'idea'
    ? value
    : fallback;
}

function normalizeMode(value: unknown, fallback: SoftwareProjectMode = 'guided'): SoftwareProjectMode {
  return value === 'autonomous' || value === 'guided' ? value : fallback;
}

function normalizePermissionMode(value: unknown, fallback: VirtualTeamPermissionMode = 'supervised'): VirtualTeamPermissionMode {
  return value === 'full-access' || value === 'supervised' ? value : fallback;
}

function getDefaultRoleId(role: string): string {
  const normalized = role.toLowerCase();
  if (normalized.includes('supervisor') || normalized.includes('lead') || normalized.includes('owner')) {
    return 'role-supervisor';
  }
  if (normalized.includes('product') || normalized.includes('manager')) {
    return 'role-product-manager';
  }
  if (normalized.includes('architect')) {
    return 'role-architect';
  }
  if (normalized.includes('qa') || normalized.includes('review') || normalized.includes('test')) {
    return 'role-qa-reviewer';
  }
  return 'role-developer';
}

function getDefaultTeamGoal(role: string): string {
  const normalizedRole = role.toLowerCase();
  if (normalizedRole.includes('supervisor')) {
    return 'Coordinate the team, keep work aligned to the project objective, and decide the next handoff.';
  }
  if (normalizedRole.includes('manager')) {
    return 'Break the objective into milestones, clarify acceptance criteria, and identify sequencing risks.';
  }
  if (normalizedRole.includes('qa') || normalizedRole.includes('test')) {
    return 'Validate the implementation plan, propose tests, and call out release blockers.';
  }
  if (normalizedRole.includes('review')) {
    return 'Review the work for correctness, maintainability, security, and missing verification.';
  }
  return 'Implement the assigned work, use tools conservatively, and report concrete results.';
}

function getDefaultTeamTools(role: string): string[] {
  const normalizedRole = role.toLowerCase();
  if (normalizedRole.includes('supervisor') || normalizedRole.includes('manager')) {
    return ['automation.listTeams', 'automation.listTeamRuns', 'fs.read'];
  }
  if (normalizedRole.includes('qa') || normalizedRole.includes('test')) {
    return ['fs.read', 'bash.run'];
  }
  return ['fs.read', 'fs.write', 'bash.run'];
}

function createDefaultVirtualRoles(): VirtualRoleDefinition[] {
  const now = Date.now();
  return DEFAULT_ROLE_BLUEPRINTS.map(role => ({
    ...role,
    responsibilities: [...role.responsibilities],
    defaultTools: [...role.defaultTools],
    createdAt: now,
    updatedAt: now,
  }));
}

function createVirtualRole(title = 'Developer'): VirtualRoleDefinition {
  const now = Date.now();
  const defaultRole = createDefaultVirtualRoles().find(role => role.id === getDefaultRoleId(title));
  return {
    id: createId('role', title),
    title,
    responsibilities: defaultRole?.responsibilities ? [...defaultRole.responsibilities] : ['Deliver assigned project responsibilities.'],
    defaultGoal: defaultRole?.defaultGoal ?? getDefaultTeamGoal(title),
    defaultTools: defaultRole?.defaultTools ? [...defaultRole.defaultTools] : getDefaultTeamTools(title),
    canSupervise: Boolean(defaultRole?.canSupervise),
    createdAt: now,
    updatedAt: now,
  };
}

function sanitizeVirtualRole(value: unknown): VirtualRoleDefinition | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Partial<VirtualRoleDefinition>;
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'Contributor';
  const now = Date.now();
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : createId('role', title),
    title,
    responsibilities: normalizeStringList(raw.responsibilities, ['Deliver assigned project responsibilities.']),
    defaultGoal: typeof raw.defaultGoal === 'string' && raw.defaultGoal.trim()
      ? raw.defaultGoal.trim()
      : getDefaultTeamGoal(title),
    defaultTools: normalizeStringList(raw.defaultTools, getDefaultTeamTools(title)),
    canSupervise: Boolean(raw.canSupervise),
    createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : now,
    updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : now,
  };
}

function restoreVirtualRolesFromState(state: Record<string, any>): VirtualRoleDefinition[] {
  const raw = state?.[DESKTOP_ROLES_STATE_KEY];
  const restored = raw && typeof raw === 'object' && Array.isArray(raw.roles)
    ? raw.roles
      .map((role: unknown) => sanitizeVirtualRole(role))
      .filter((role: VirtualRoleDefinition | null): role is VirtualRoleDefinition => Boolean(role))
    : [];
  const defaults = createDefaultVirtualRoles();
  return [
    ...restored,
    ...defaults.filter(defaultRole => !restored.some(role => role.id === defaultRole.id)),
  ].sort((left, right) => Number(right.canSupervise) - Number(left.canSupervise) || left.title.localeCompare(right.title));
}

function createVirtualEmployee(role = 'Developer', roleId = getDefaultRoleId(role)): VirtualEmployeeProfile {
  const now = Date.now();
  const permissions = role.toLowerCase().includes('supervisor')
    ? ['Approve actions', 'Assign team', 'Full workspace access', 'Manage budget']
    : role.toLowerCase().includes('qa')
      ? ['Read workspace', 'Run tests', 'File issues']
      : [...DEFAULT_EMPLOYEE_PERMISSIONS];

  return {
    id: createId('employee', role),
    name: role,
    roleId,
    role,
    model: 'OpenAI-compatible default',
    status: 'idle',
    permissions,
    currentTask: 'No active task',
    createdAt: now,
    updatedAt: now,
  };
}

function createDefaultVirtualEmployees(): VirtualEmployeeProfile[] {
  return [
    { ...createVirtualEmployee('Supervisor', 'role-supervisor'), id: 'employee-supervisor', name: 'Supervisor' },
    { ...createVirtualEmployee('Product Manager', 'role-product-manager'), id: 'employee-product-manager', name: 'Product Manager' },
    { ...createVirtualEmployee('Architect', 'role-architect'), id: 'employee-architect', name: 'Architect' },
    { ...createVirtualEmployee('Developer', 'role-developer'), id: 'employee-developer', name: 'Developer' },
    { ...createVirtualEmployee('QA Reviewer', 'role-qa-reviewer'), id: 'employee-qa-reviewer', name: 'QA Reviewer' },
  ];
}

function sanitizeVirtualEmployee(value: unknown): VirtualEmployeeProfile | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Partial<VirtualEmployeeProfile>;
  const now = Date.now();
  const status = raw.status === 'working' || raw.status === 'approval' ? raw.status : 'idle';
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : createId('employee', raw.name ?? raw.role ?? 'employee'),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Employee',
    roleId: typeof raw.roleId === 'string' && raw.roleId.trim()
      ? raw.roleId.trim()
      : getDefaultRoleId(typeof raw.role === 'string' ? raw.role : 'Developer'),
    role: typeof raw.role === 'string' && raw.role.trim() ? raw.role.trim() : 'Contributor',
    model: typeof raw.model === 'string' && raw.model.trim() ? raw.model.trim() : 'OpenAI-compatible default',
    status,
    permissions: normalizeStringList(raw.permissions, DEFAULT_EMPLOYEE_PERMISSIONS),
    currentTask: typeof raw.currentTask === 'string' && raw.currentTask.trim() ? raw.currentTask.trim() : 'No active task',
    createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : now,
    updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : now,
  };
}

function restoreVirtualEmployeesFromState(state: Record<string, any>): VirtualEmployeeProfile[] {
  const raw = state?.[DESKTOP_EMPLOYEES_STATE_KEY];
  const restored = raw && typeof raw === 'object' && Array.isArray(raw.employees)
    ? raw.employees
      .map((employee: unknown) => sanitizeVirtualEmployee(employee))
      .filter((employee: VirtualEmployeeProfile | null): employee is VirtualEmployeeProfile => Boolean(employee))
    : [];
  return restored.length > 0 ? restored : createDefaultVirtualEmployees();
}

function createDefaultProjectTeams(): ProjectTeamDefinition[] {
  const now = Date.now();
  return [
    {
      id: 'project-team-core-delivery',
      name: 'Core Delivery Team',
      mission: 'Own implementation tasks, integration changes, and project deliverable assembly.',
      supervisorEmployeeId: 'employee-supervisor',
      memberEmployeeIds: ['employee-architect', 'employee-developer'],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'project-team-review-qa',
      name: 'Review And QA Team',
      mission: 'Validate quality gates, review implementation risk, and produce verification evidence.',
      supervisorEmployeeId: 'employee-supervisor',
      memberEmployeeIds: ['employee-product-manager', 'employee-qa-reviewer'],
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function sanitizeProjectTeam(value: unknown): ProjectTeamDefinition | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Partial<ProjectTeamDefinition>;
  const now = Date.now();
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Project team';
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : createId('project-team', name),
    name,
    mission: typeof raw.mission === 'string' && raw.mission.trim()
      ? raw.mission.trim()
      : 'Deliver a scoped portion of the project mission.',
    supervisorEmployeeId: typeof raw.supervisorEmployeeId === 'string' && raw.supervisorEmployeeId.trim()
      ? raw.supervisorEmployeeId.trim()
      : 'employee-supervisor',
    memberEmployeeIds: normalizeStringList(raw.memberEmployeeIds, []),
    createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : now,
    updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : now,
  };
}

function restoreProjectTeamsFromState(state: Record<string, any>): ProjectTeamDefinition[] {
  const raw = state?.[DESKTOP_PROJECT_TEAMS_STATE_KEY];
  const restored = raw && typeof raw === 'object' && Array.isArray(raw.teams)
    ? raw.teams
      .map((team: unknown) => sanitizeProjectTeam(team))
      .filter((team: ProjectTeamDefinition | null): team is ProjectTeamDefinition => Boolean(team))
    : [];
  const defaults = createDefaultProjectTeams();
  return [
    ...restored,
    ...defaults.filter(defaultTeam => !restored.some(team => team.id === defaultTeam.id)),
  ].sort((left, right) => right.updatedAt - left.updatedAt);
}

function createSoftwareProjectDraft(workspacePath = process.cwd()): SoftwareProjectPlan {
  const now = Date.now();
  return {
    id: createId('project', 'software-project'),
    name: 'New software project',
    mode: 'guided',
    status: 'idea',
    idea: '',
    goals: '',
    artifacts: [...DEFAULT_PROJECT_ARTIFACTS],
    workspacePath,
    supervisorRole: 'Supervisor',
    teamRoles: [...DEFAULT_AUTONOMOUS_ROLES],
    supervisorEmployeeId: 'employee-supervisor',
    assignedEmployeeIds: [
      'employee-product-manager',
      'employee-architect',
      'employee-developer',
      'employee-qa-reviewer',
    ],
    assignedTeamIds: [],
    permissionMode: 'supervised',
    createdAt: now,
    updatedAt: now,
  };
}

function sanitizeSoftwareProjectPlan(value: unknown, workspacePath = process.cwd()): SoftwareProjectPlan | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Partial<SoftwareProjectPlan>;
  const now = Date.now();
  const mode = normalizeMode(raw.mode);
  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : createId('project', raw.name ?? 'project'),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Untitled software project',
    mode,
    status: normalizeStatus(raw.status),
    idea: typeof raw.idea === 'string' ? raw.idea : '',
    goals: typeof raw.goals === 'string' ? raw.goals : '',
    artifacts: normalizeStringList(raw.artifacts, DEFAULT_PROJECT_ARTIFACTS),
    workspacePath: typeof raw.workspacePath === 'string' && raw.workspacePath.trim() ? raw.workspacePath : workspacePath,
    supervisorRole: typeof raw.supervisorRole === 'string' && raw.supervisorRole.trim() ? raw.supervisorRole.trim() : 'Supervisor',
    teamRoles: normalizeStringList(raw.teamRoles, DEFAULT_AUTONOMOUS_ROLES),
    supervisorEmployeeId: typeof raw.supervisorEmployeeId === 'string' && raw.supervisorEmployeeId.trim()
      ? raw.supervisorEmployeeId
      : 'employee-supervisor',
    assignedEmployeeIds: normalizeStringList(raw.assignedEmployeeIds, [
      'employee-product-manager',
      'employee-architect',
      'employee-developer',
      'employee-qa-reviewer',
    ]),
    assignedTeamIds: normalizeStringList(raw.assignedTeamIds, []),
    permissionMode: normalizePermissionMode(raw.permissionMode),
    createdAt: Number.isFinite(Number(raw.createdAt)) ? Number(raw.createdAt) : now,
    updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : now,
  };
}

function restoreSoftwareProjectsFromState(state: Record<string, any>, workspacePath = process.cwd()): PersistedSoftwareProjectsState {
  const raw = state?.[DESKTOP_PROJECTS_STATE_KEY];
  const restoredProjects = raw && typeof raw === 'object' && Array.isArray(raw.projects)
    ? raw.projects
      .map((project: unknown) => sanitizeSoftwareProjectPlan(project, workspacePath))
      .filter((project: SoftwareProjectPlan | null): project is SoftwareProjectPlan => Boolean(project))
    : [];
  const projects = sortSoftwareProjects(restoredProjects);
  const requestedActiveId = raw && typeof raw === 'object' && typeof raw.activeProjectId === 'string'
    ? raw.activeProjectId
    : '';
  return {
    activeProjectId: projects.some(project => project.id === requestedActiveId)
      ? requestedActiveId
      : projects[0]?.id ?? '',
    projects,
  };
}

function sortSoftwareProjects(projects: SoftwareProjectPlan[]): SoftwareProjectPlan[] {
  const seen = new Set<string>();
  return projects
    .filter(project => {
      if (!project.id || seen.has(project.id)) {
        return false;
      }
      seen.add(project.id);
      return true;
    })
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

function upsertById<T extends { id: string; updatedAt: number }>(records: T[], record: T): T[] {
  return [
    record,
    ...records.filter(candidate => candidate.id !== record.id),
  ].sort((left, right) => right.updatedAt - left.updatedAt);
}

async function readStudioState(): Promise<{
  service: AppStateServiceBridge;
  rawState: Record<string, any>;
  projectsState: PersistedSoftwareProjectsState;
  roles: VirtualRoleDefinition[];
  employees: VirtualEmployeeProfile[];
  teams: ProjectTeamDefinition[];
  chats: Record<string, any[]>;
  outputs: Record<string, ProjectGeneratedOutput[]>;
}> {
  const service = new AppStateServiceBridge({ storeCwd: getDesktopAppStateStoreCwd() });
  const rawState = await service.getState();
  return {
    service,
    rawState,
    projectsState: restoreSoftwareProjectsFromState(rawState, process.cwd()),
    roles: restoreVirtualRolesFromState(rawState),
    employees: restoreVirtualEmployeesFromState(rawState),
    teams: restoreProjectTeamsFromState(rawState),
    chats: restoreProjectChatsFromState(rawState),
    outputs: restoreProjectOutputsFromState(rawState),
  };
}

function getDesktopAppStateStoreCwd(): string {
  const override = process.env.CODE_AGENT_DESKTOP_STORE_DIR || process.env.CODEAGENT_DESKTOP_STORE_DIR;
  if (override?.trim()) {
    return path.resolve(override);
  }

  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'CodeAgent');
  }

  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'CodeAgent');
  }

  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'CodeAgent');
}

function restoreProjectChatsFromState(state: Record<string, any>): Record<string, any[]> {
  const raw = state?.[DESKTOP_PROJECT_CHATS_STATE_KEY];
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  return Object.entries(raw).reduce<Record<string, any[]>>((restored, [key, value]) => {
    restored[key] = Array.isArray(value) ? value : [];
    return restored;
  }, {});
}

function restoreProjectOutputsFromState(state: Record<string, any>): Record<string, ProjectGeneratedOutput[]> {
  const raw = state?.[DESKTOP_PROJECT_OUTPUTS_STATE_KEY];
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  return Object.entries(raw).reduce<Record<string, ProjectGeneratedOutput[]>>((restored, [projectId, value]) => {
    restored[projectId] = Array.isArray(value)
      ? value.filter(output => output && typeof output === 'object') as ProjectGeneratedOutput[]
      : [];
    return restored;
  }, {});
}

async function writeStudioState(input: {
  service: AppStateServiceBridge;
  projectsState?: PersistedSoftwareProjectsState;
  roles?: VirtualRoleDefinition[];
  employees?: VirtualEmployeeProfile[];
  teams?: ProjectTeamDefinition[];
  chats?: Record<string, any[]>;
  outputs?: Record<string, ProjectGeneratedOutput[]>;
}): Promise<void> {
  const nextState: Record<string, unknown> = {};
  if (input.projectsState) {
    nextState[DESKTOP_PROJECTS_STATE_KEY] = input.projectsState;
  }
  if (input.roles) {
    nextState[DESKTOP_ROLES_STATE_KEY] = { roles: input.roles };
  }
  if (input.employees) {
    nextState[DESKTOP_EMPLOYEES_STATE_KEY] = { employees: input.employees };
  }
  if (input.teams) {
    nextState[DESKTOP_PROJECT_TEAMS_STATE_KEY] = { teams: input.teams };
  }
  if (input.chats) {
    nextState[DESKTOP_PROJECT_CHATS_STATE_KEY] = input.chats;
  }
  if (input.outputs) {
    nextState[DESKTOP_PROJECT_OUTPUTS_STATE_KEY] = input.outputs;
  }

  await input.service.setState(nextState);
}

function findProject(projects: SoftwareProjectPlan[], idOrName: string): SoftwareProjectPlan {
  const project = projects.find(candidate => candidate.id === idOrName)
    ?? projects.find(candidate => candidate.name.toLowerCase() === idOrName.toLowerCase());
  if (!project) {
    throw new Error(`Project not found: ${idOrName}`);
  }
  return project;
}

function getRoleById(roles: VirtualRoleDefinition[], roleId?: string, roleName?: string): VirtualRoleDefinition | undefined {
  return roles.find(role => role.id === roleId)
    ?? roles.find(role => role.title.toLowerCase() === String(roleName ?? '').toLowerCase())
    ?? roles.find(role => role.id === getDefaultRoleId(String(roleName ?? 'Developer')));
}

function isSupervisorEmployee(employee: VirtualEmployeeProfile, roles: VirtualRoleDefinition[]): boolean {
  const role = getRoleById(roles, employee.roleId, employee.role);
  return Boolean(role?.canSupervise || employee.role.toLowerCase().includes('supervisor') || employee.name.toLowerCase().includes('supervisor'));
}

function getProjectSupervisor(
  project: SoftwareProjectPlan,
  employees: VirtualEmployeeProfile[],
  roles: VirtualRoleDefinition[],
): VirtualEmployeeProfile | undefined {
  return employees.find(employee => employee.id === project.supervisorEmployeeId)
    ?? employees.find(employee => isSupervisorEmployee(employee, roles))
    ?? employees[0];
}

function getProjectAssignedEmployees(
  project: SoftwareProjectPlan,
  employees: VirtualEmployeeProfile[],
  roles: VirtualRoleDefinition[],
): VirtualEmployeeProfile[] {
  const supervisor = getProjectSupervisor(project, employees, roles);
  return project.assignedEmployeeIds
    .map(id => employees.find(employee => employee.id === id))
    .filter((employee: VirtualEmployeeProfile | undefined): employee is VirtualEmployeeProfile => Boolean(employee))
    .filter(employee => employee.id !== supervisor?.id);
}

function getProjectTeams(project: SoftwareProjectPlan, teams: ProjectTeamDefinition[]): ProjectTeamDefinition[] {
  return project.assignedTeamIds
    .map(id => teams.find(team => team.id === id))
    .filter((team: ProjectTeamDefinition | undefined): team is ProjectTeamDefinition => Boolean(team));
}

function getTeamSupervisor(team: ProjectTeamDefinition, employees: VirtualEmployeeProfile[]): VirtualEmployeeProfile | undefined {
  return employees.find(employee => employee.id === team.supervisorEmployeeId);
}

function getTeamMembers(team: ProjectTeamDefinition, employees: VirtualEmployeeProfile[]): VirtualEmployeeProfile[] {
  return team.memberEmployeeIds
    .map(id => employees.find(employee => employee.id === id))
    .filter((employee: VirtualEmployeeProfile | undefined): employee is VirtualEmployeeProfile => Boolean(employee));
}

function uniqueEmployees(employees: VirtualEmployeeProfile[]): VirtualEmployeeProfile[] {
  const seen = new Set<string>();
  return employees.filter(employee => {
    if (seen.has(employee.id)) {
      return false;
    }
    seen.add(employee.id);
    return true;
  });
}

function getProjectStaffingEmployees(
  project: SoftwareProjectPlan,
  employees: VirtualEmployeeProfile[],
  roles: VirtualRoleDefinition[],
  teams: ProjectTeamDefinition[],
): VirtualEmployeeProfile[] {
  const supervisor = getProjectSupervisor(project, employees, roles);
  return uniqueEmployees([
    ...(supervisor ? [supervisor] : []),
    ...getProjectTeams(project, teams).flatMap(team => [
      getTeamSupervisor(team, employees),
      ...getTeamMembers(team, employees),
    ].filter((employee): employee is VirtualEmployeeProfile => Boolean(employee))),
    ...getProjectAssignedEmployees(project, employees, roles),
  ]);
}

function formatProjectPrompt(
  project: SoftwareProjectPlan,
  employees: VirtualEmployeeProfile[] = [],
  roles: VirtualRoleDefinition[] = [],
  teams: ProjectTeamDefinition[] = [],
): string {
  const lines = [
    `Project name: ${project.name}`,
    `Project mode: ${project.mode === 'autonomous' ? 'autonomous project' : 'guided human/app collaboration'}`,
    '',
    'Human idea:',
    project.idea.trim() || 'The idea still needs to be captured.',
    '',
    'Goals:',
    project.goals.trim() || 'Help clarify goals, users, scope, and success criteria.',
    '',
    `Expected software artifacts: ${project.artifacts.join(', ')}`,
    '',
  ];

  if (project.mode === 'autonomous') {
    const supervisor = getProjectSupervisor(project, employees, roles);
    const assignedEmployees = getProjectAssignedEmployees(project, employees, roles);
    const assignedTeams = getProjectTeams(project, teams);
    const employeeLines = [supervisor, ...assignedEmployees]
      .filter((employee): employee is VirtualEmployeeProfile => Boolean(employee))
      .map(employee => {
        const role = getRoleById(roles, employee.roleId, employee.role);
        const responsibilities = role?.responsibilities?.length
          ? role.responsibilities.join('; ')
          : employee.permissions.join('; ');
        return `- ${employee.name}: ${role?.title ?? employee.role}. Responsibilities: ${responsibilities}`;
      });
    const teamLines = assignedTeams.map(team => {
      const teamSupervisor = getTeamSupervisor(team, employees);
      const teamMembers = getTeamMembers(team, employees);
      return `- ${team.name}: ${team.mission} Supervisor: ${teamSupervisor?.name ?? 'Unassigned'}. Members: ${teamMembers.map(member => member.name).join(', ') || 'none'}`;
    });
    lines.push(
      `Supervisor role: ${project.supervisorRole}`,
      `Assigned roles: ${project.teamRoles.join(', ')}`,
      `Supervisor employee ID: ${project.supervisorEmployeeId || 'not assigned'}`,
      `Assigned team IDs: ${project.assignedTeamIds.join(', ') || 'none'}`,
      `Assigned employee IDs: ${project.assignedEmployeeIds.join(', ') || 'not assigned'}`,
      '',
      'Assigned teams and scoped missions:',
      ...(teamLines.length > 0 ? teamLines : ['- No teams assigned.']),
      '',
      'Assigned employees and role responsibilities:',
      ...(employeeLines.length > 0 ? employeeLines : ['- No employees assigned.']),
      '',
      `Execution mode: ${project.permissionMode === 'full-access' ? 'supervisor acts on behalf of the human with full permission' : 'supervised approvals for risky actions'}`,
      '',
      'Start by turning the idea into a delivery blueprint, then identify the first safe implementation milestone for the virtual team.',
    );
  } else {
    lines.push(
      'Work with me directly using the project brief above as accepted context.',
      'Do not ask for details that are already covered by the idea, goals, or expected artifacts.',
      'When the human asks to start work, infer reasonable defaults from the project brief, state assumptions briefly, and begin producing the next concrete artifact or implementation step.',
      'Ask clarifying questions only when a missing decision blocks meaningful progress; keep those questions minimal and specific.',
    );
  }

  return lines.join('\n');
}

function getProjectAutomationTeamId(projectId: string): string {
  return `project-auto-${projectId}`;
}

function createProjectAutomationTeam(
  project: SoftwareProjectPlan,
  employees: VirtualEmployeeProfile[],
  roles: VirtualRoleDefinition[],
  projectTeams: ProjectTeamDefinition[],
): Partial<VirtualTeamBlueprint> {
  const supervisor = getProjectSupervisor(project, employees, roles);
  const staffing = getProjectStaffingEmployees(project, employees, roles, projectTeams);
  const fallbackEmployees = staffing.length > 0 ? staffing : createDefaultVirtualEmployees();
  const members: VirtualTeamMember[] = fallbackEmployees.map(employee => {
    const role = getRoleById(roles, employee.roleId, employee.role);
    const roleTitle = role?.title ?? employee.role;
    return {
      id: employee.id,
      name: employee.name,
      role: roleTitle,
      goal: employee.currentTask && employee.currentTask !== 'No active task'
        ? employee.currentTask
        : role?.defaultGoal || `Contribute ${roleTitle} work for "${project.name}".`,
      model: employee.model,
      tools: role?.defaultTools ?? getDefaultTeamTools(roleTitle),
    };
  });

  return {
    id: getProjectAutomationTeamId(project.id),
    name: `${project.name} autonomous team`,
    objective: formatProjectPrompt(project, employees, roles, projectTeams),
    workspacePath: project.workspacePath ?? process.cwd(),
    permissionMode: project.permissionMode,
    maxIterations: 1,
    requireQaSignoff: true,
    supervisorId: supervisor?.id ?? members[0]?.id ?? 'employee-supervisor',
    members,
    status: 'draft',
  };
}

export async function projectListHandler(options: { mode?: string; status?: string }): Promise<void> {
  const { projectsState } = await readStudioState();
  const projects = projectsState.projects.filter(project => (
    (!options.mode || project.mode === options.mode)
    && (!options.status || project.status === options.status)
  ));
  printJson({ activeProjectId: projectsState.activeProjectId, projects });
}

export async function projectShowHandler(projectId: string): Promise<void> {
  const studio = await readStudioState();
  const project = findProject(studio.projectsState.projects, projectId);
  printJson({
    project,
    prompt: formatProjectPrompt(project, studio.employees, studio.roles, studio.teams),
    deliverables: studio.outputs[project.id] ?? [],
  });
}

export async function projectContextHandler(projectId: string): Promise<void> {
  const studio = await readStudioState();
  const project = findProject(studio.projectsState.projects, projectId);
  process.stdout.write(`${formatProjectPrompt(project, studio.employees, studio.roles, studio.teams)}\n`);
}

export async function projectCreateHandler(options: {
  mode?: string;
  name?: string;
  idea?: string;
  goals?: string;
  artifacts?: string;
  workspace?: string;
  supervisor?: string;
  employees?: string;
  teams?: string;
  permissionMode?: string;
}): Promise<void> {
  if (!options.name?.trim()) {
    throw new Error('project create requires --name');
  }

  const studio = await readStudioState();
  const now = Date.now();
  const project = sanitizeSoftwareProjectPlan({
    ...createSoftwareProjectDraft(options.workspace || process.cwd()),
    name: options.name,
    mode: normalizeMode(options.mode),
    idea: options.idea ?? '',
    goals: options.goals ?? '',
    artifacts: normalizeStringList(options.artifacts, DEFAULT_PROJECT_ARTIFACTS),
    workspacePath: options.workspace || process.cwd(),
    supervisorEmployeeId: options.supervisor || 'employee-supervisor',
    assignedEmployeeIds: normalizeStringList(options.employees, [
      'employee-product-manager',
      'employee-architect',
      'employee-developer',
      'employee-qa-reviewer',
    ]),
    assignedTeamIds: normalizeStringList(options.teams, []),
    permissionMode: normalizePermissionMode(options.permissionMode),
    createdAt: now,
    updatedAt: now,
  })!;

  const projects = upsertById(studio.projectsState.projects, project);
  await writeStudioState({
    service: studio.service,
    projectsState: {
      activeProjectId: project.id,
      projects,
    },
  });
  printJson(project);
}

export async function projectUpdateHandler(projectId: string, options: {
  mode?: string;
  status?: string;
  name?: string;
  idea?: string;
  goals?: string;
  artifacts?: string;
  workspace?: string;
  supervisor?: string;
  employees?: string;
  teams?: string;
  permissionMode?: string;
}): Promise<void> {
  const studio = await readStudioState();
  const existing = findProject(studio.projectsState.projects, projectId);
  const project = sanitizeSoftwareProjectPlan({
    ...existing,
    mode: options.mode ? normalizeMode(options.mode, existing.mode) : existing.mode,
    status: options.status ? normalizeStatus(options.status, existing.status) : existing.status,
    name: options.name ?? existing.name,
    idea: options.idea ?? existing.idea,
    goals: options.goals ?? existing.goals,
    artifacts: options.artifacts === undefined ? existing.artifacts : normalizeStringList(options.artifacts, DEFAULT_PROJECT_ARTIFACTS),
    workspacePath: options.workspace ?? existing.workspacePath,
    supervisorEmployeeId: options.supervisor ?? existing.supervisorEmployeeId,
    assignedEmployeeIds: options.employees === undefined ? existing.assignedEmployeeIds : normalizeStringList(options.employees, []),
    assignedTeamIds: options.teams === undefined ? existing.assignedTeamIds : normalizeStringList(options.teams, []),
    permissionMode: options.permissionMode ? normalizePermissionMode(options.permissionMode, existing.permissionMode) : existing.permissionMode,
    updatedAt: Date.now(),
  })!;

  const projects = upsertById(studio.projectsState.projects, project);
  await writeStudioState({
    service: studio.service,
    projectsState: {
      activeProjectId: studio.projectsState.activeProjectId || project.id,
      projects,
    },
  });
  printJson(project);
}

export async function projectDeleteHandler(projectId: string): Promise<void> {
  const studio = await readStudioState();
  const project = findProject(studio.projectsState.projects, projectId);
  const projects = studio.projectsState.projects.filter(candidate => candidate.id !== project.id);
  const chats = Object.entries(studio.chats).reduce<Record<string, any[]>>((next, [key, value]) => {
    if (!key.startsWith(`${project.id}:`)) {
      next[key] = value;
    }
    return next;
  }, {});
  const outputs = { ...studio.outputs };
  delete outputs[project.id];

  await writeStudioState({
    service: studio.service,
    projectsState: {
      activeProjectId: studio.projectsState.activeProjectId === project.id ? projects[0]?.id ?? '' : studio.projectsState.activeProjectId,
      projects,
    },
    chats,
    outputs,
  });
  printJson({ ok: true, id: project.id });
}

export async function projectStartHandler(projectId: string): Promise<void> {
  const studio = await readStudioState();
  const project = findProject(studio.projectsState.projects, projectId);
  if (project.mode !== 'autonomous') {
    throw new Error('Only autonomous projects can be started from the project lifecycle command. Use project context for guided projects.');
  }

  const runningProject = { ...project, status: 'active' as SoftwareProjectStatus, updatedAt: Date.now() };
  await writeStudioState({
    service: studio.service,
    projectsState: {
      activeProjectId: runningProject.id,
      projects: upsertById(studio.projectsState.projects, runningProject),
    },
  });

  const automation = createAutomationService();
  const team = await automation.saveTeam(createProjectAutomationTeam(runningProject, studio.employees, studio.roles, studio.teams));
  const run = await automation.runTeam(team.id);
  const completedProject = {
    ...runningProject,
    status: run.status === 'succeeded' ? 'done' as SoftwareProjectStatus : 'blocked' as SoftwareProjectStatus,
    updatedAt: Date.now(),
  };
  await writeStudioState({
    service: studio.service,
    projectsState: {
      activeProjectId: completedProject.id,
      projects: upsertById(studio.projectsState.projects, completedProject),
    },
  });

  printJson({ project: completedProject, team, run });
}

export async function projectStatusHandler(projectId: string, status: string): Promise<void> {
  await projectUpdateHandler(projectId, { status });
}

export async function projectRunsHandler(projectId: string): Promise<void> {
  const studio = await readStudioState();
  const project = findProject(studio.projectsState.projects, projectId);
  const automation = createAutomationService();
  printJson(await automation.listTeamRuns(getProjectAutomationTeamId(project.id)));
}

export async function projectDeliverablesHandler(projectId: string): Promise<void> {
  const studio = await readStudioState();
  const project = findProject(studio.projectsState.projects, projectId);
  const automation = createAutomationService();
  const teamRuns = await automation.listTeamRuns(getProjectAutomationTeamId(project.id));
  printJson({
    projectId: project.id,
    generatedOutputs: studio.outputs[project.id] ?? [],
    runArtifacts: teamRuns
      .filter(run => run.artifactPath)
      .map(run => ({
        runId: run.id,
        status: run.status,
        artifactPath: run.artifactPath,
        summary: run.summary ?? run.error,
        completedAt: run.completedAt,
      })),
  });
}

export async function roleListHandler(): Promise<void> {
  printJson((await readStudioState()).roles);
}

export async function roleCreateHandler(options: {
  title?: string;
  responsibilities?: string;
  goal?: string;
  tools?: string;
  supervisor?: boolean;
}): Promise<void> {
  if (!options.title?.trim()) {
    throw new Error('project role create requires --title');
  }
  const studio = await readStudioState();
  const now = Date.now();
  const role = {
    ...createVirtualRole(options.title),
    responsibilities: options.responsibilities ? normalizeStringList(options.responsibilities, []) : createVirtualRole(options.title).responsibilities,
    defaultGoal: options.goal ?? createVirtualRole(options.title).defaultGoal,
    defaultTools: options.tools ? normalizeStringList(options.tools, []) : createVirtualRole(options.title).defaultTools,
    canSupervise: Boolean(options.supervisor),
    createdAt: now,
    updatedAt: now,
  };
  const roles = upsertById(studio.roles, role);
  await writeStudioState({ service: studio.service, roles });
  printJson(role);
}

export async function roleUpdateHandler(roleId: string, options: {
  title?: string;
  responsibilities?: string;
  goal?: string;
  tools?: string;
  supervisor?: boolean;
  noSupervisor?: boolean;
}): Promise<void> {
  const studio = await readStudioState();
  const existing = studio.roles.find(role => role.id === roleId || role.title.toLowerCase() === roleId.toLowerCase());
  if (!existing) {
    throw new Error(`Role not found: ${roleId}`);
  }
  const role = {
    ...existing,
    title: options.title ?? existing.title,
    responsibilities: options.responsibilities === undefined ? existing.responsibilities : normalizeStringList(options.responsibilities, []),
    defaultGoal: options.goal ?? existing.defaultGoal,
    defaultTools: options.tools === undefined ? existing.defaultTools : normalizeStringList(options.tools, []),
    canSupervise: options.noSupervisor ? false : options.supervisor ? true : existing.canSupervise,
    updatedAt: Date.now(),
  };
  const roles = upsertById(studio.roles, role);
  await writeStudioState({ service: studio.service, roles });
  printJson(role);
}

export async function roleDeleteHandler(roleId: string): Promise<void> {
  const studio = await readStudioState();
  const role = studio.roles.find(candidate => candidate.id === roleId || candidate.title.toLowerCase() === roleId.toLowerCase());
  if (!role) {
    throw new Error(`Role not found: ${roleId}`);
  }
  const roles = studio.roles.filter(candidate => candidate.id !== role.id);
  await writeStudioState({ service: studio.service, roles });
  printJson({ ok: true, id: role.id });
}

export async function employeeListHandler(): Promise<void> {
  printJson((await readStudioState()).employees);
}

export async function employeeCreateHandler(options: {
  name?: string;
  role?: string;
  roleId?: string;
  model?: string;
  permissions?: string;
  task?: string;
}): Promise<void> {
  if (!options.name?.trim()) {
    throw new Error('project employee create requires --name');
  }
  const studio = await readStudioState();
  const role = getRoleById(studio.roles, options.roleId, options.role ?? 'Developer');
  const now = Date.now();
  const employee = {
    ...createVirtualEmployee(role?.title ?? options.role ?? 'Developer', role?.id ?? options.roleId),
    name: options.name,
    roleId: role?.id ?? options.roleId ?? getDefaultRoleId(options.role ?? 'Developer'),
    role: role?.title ?? options.role ?? 'Developer',
    model: options.model ?? 'OpenAI-compatible default',
    permissions: options.permissions ? normalizeStringList(options.permissions, []) : DEFAULT_EMPLOYEE_PERMISSIONS,
    currentTask: options.task ?? 'No active task',
    createdAt: now,
    updatedAt: now,
  };
  const employees = upsertById(studio.employees, employee);
  await writeStudioState({ service: studio.service, employees });
  printJson(employee);
}

export async function employeeUpdateHandler(employeeId: string, options: {
  name?: string;
  role?: string;
  roleId?: string;
  model?: string;
  permissions?: string;
  task?: string;
  status?: string;
}): Promise<void> {
  const studio = await readStudioState();
  const existing = studio.employees.find(employee => employee.id === employeeId || employee.name.toLowerCase() === employeeId.toLowerCase());
  if (!existing) {
    throw new Error(`Employee not found: ${employeeId}`);
  }
  const role = getRoleById(studio.roles, options.roleId ?? existing.roleId, options.role ?? existing.role);
  const status = options.status === 'working' || options.status === 'approval' || options.status === 'idle'
    ? options.status
    : existing.status;
  const employee = {
    ...existing,
    name: options.name ?? existing.name,
    roleId: role?.id ?? existing.roleId,
    role: role?.title ?? options.role ?? existing.role,
    model: options.model ?? existing.model,
    permissions: options.permissions === undefined ? existing.permissions : normalizeStringList(options.permissions, []),
    currentTask: options.task ?? existing.currentTask,
    status,
    updatedAt: Date.now(),
  };
  const employees = upsertById(studio.employees, employee);
  await writeStudioState({ service: studio.service, employees });
  printJson(employee);
}

export async function employeeDeleteHandler(employeeId: string): Promise<void> {
  const studio = await readStudioState();
  const employee = studio.employees.find(candidate => candidate.id === employeeId || candidate.name.toLowerCase() === employeeId.toLowerCase());
  if (!employee) {
    throw new Error(`Employee not found: ${employeeId}`);
  }
  const employees = studio.employees.filter(candidate => candidate.id !== employee.id);
  await writeStudioState({ service: studio.service, employees });
  printJson({ ok: true, id: employee.id });
}

export async function projectTeamListHandler(): Promise<void> {
  printJson((await readStudioState()).teams);
}

export async function projectTeamCreateHandler(options: {
  name?: string;
  mission?: string;
  supervisor?: string;
  members?: string;
}): Promise<void> {
  if (!options.name?.trim()) {
    throw new Error('project team create requires --name');
  }
  const studio = await readStudioState();
  const now = Date.now();
  const team = sanitizeProjectTeam({
    id: createId('project-team', options.name),
    name: options.name,
    mission: options.mission ?? 'Deliver a scoped portion of the project mission.',
    supervisorEmployeeId: options.supervisor ?? 'employee-supervisor',
    memberEmployeeIds: normalizeStringList(options.members, []),
    createdAt: now,
    updatedAt: now,
  })!;
  const teams = upsertById(studio.teams, team);
  await writeStudioState({ service: studio.service, teams });
  printJson(team);
}

export async function projectTeamUpdateHandler(teamId: string, options: {
  name?: string;
  mission?: string;
  supervisor?: string;
  members?: string;
}): Promise<void> {
  const studio = await readStudioState();
  const existing = studio.teams.find(team => team.id === teamId || team.name.toLowerCase() === teamId.toLowerCase());
  if (!existing) {
    throw new Error(`Project team not found: ${teamId}`);
  }
  const team = sanitizeProjectTeam({
    ...existing,
    name: options.name ?? existing.name,
    mission: options.mission ?? existing.mission,
    supervisorEmployeeId: options.supervisor ?? existing.supervisorEmployeeId,
    memberEmployeeIds: options.members === undefined ? existing.memberEmployeeIds : normalizeStringList(options.members, []),
    updatedAt: Date.now(),
  })!;
  const teams = upsertById(studio.teams, team);
  await writeStudioState({ service: studio.service, teams });
  printJson(team);
}

export async function projectTeamDeleteHandler(teamId: string): Promise<void> {
  const studio = await readStudioState();
  const team = studio.teams.find(candidate => candidate.id === teamId || candidate.name.toLowerCase() === teamId.toLowerCase());
  if (!team) {
    throw new Error(`Project team not found: ${teamId}`);
  }
  const teams = studio.teams.filter(candidate => candidate.id !== team.id);
  await writeStudioState({ service: studio.service, teams });
  printJson({ ok: true, id: team.id });
}

export async function runProjectStudioCommand(
  args: string,
  scope: ProjectStudioSlashScope = 'project',
): Promise<string> {
  const tokens = parseProjectStudioSlashTokens(args, scope);
  if (tokens.length === 0 || tokens.some(isHelpToken)) {
    return getProjectStudioSlashHelp();
  }

  const output = await captureProjectStudioOutput(async () => {
    await routeProjectStudioSlashTokens(tokens);
  });
  return output.trim() || 'Project Studio command completed.';
}

function parseProjectStudioSlashTokens(args: string, scope: ProjectStudioSlashScope): string[] {
  const parsed = tryParseShellCommand(args.trim());
  if (!parsed.success) {
    throw new Error(`Unable to parse Project Studio command: ${parsed.error}`);
  }

  const tokens = parsed.tokens.map(projectStudioParseEntryToString);
  if (scope === 'project') {
    return tokens;
  }

  return [scope === 'people' ? 'employee' : scope, ...tokens];
}

function projectStudioParseEntryToString(entry: ParseEntry): string {
  if (typeof entry === 'string') {
    return entry;
  }

  if (entry && typeof entry === 'object' && 'pattern' in entry && typeof entry.pattern === 'string') {
    return entry.pattern;
  }

  throw new Error(`Unsupported Project Studio command token: ${JSON.stringify(entry)}`);
}

function isHelpToken(token: string): boolean {
  return token === 'help' || token === '--help' || token === '-h';
}

async function captureProjectStudioOutput(callback: () => Promise<void>): Promise<string> {
  const originalWrite = process.stdout.write;
  let output = '';

  process.stdout.write = ((chunk: string | Uint8Array, ...args: any[]) => {
    output += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    const callbackArg = args.find(arg => typeof arg === 'function');
    if (callbackArg) {
      callbackArg();
    }
    return true;
  }) as typeof process.stdout.write;

  try {
    await callback();
  } finally {
    process.stdout.write = originalWrite;
  }

  return output;
}

async function routeProjectStudioSlashTokens(tokens: string[]): Promise<void> {
  const [command = 'list', ...rest] = tokens;
  switch (command) {
    case 'list': {
      const parsed = parseProjectStudioArgs(rest);
      await projectListHandler(parsed.options as any);
      return;
    }
    case 'show': {
      await projectShowHandler(requireProjectStudioArgument(rest[0], 'project show requires a project id or name'));
      return;
    }
    case 'context': {
      await projectContextHandler(requireProjectStudioArgument(rest[0], 'project context requires a project id or name'));
      return;
    }
    case 'create': {
      const parsed = parseProjectStudioArgs(rest);
      await projectCreateHandler(parsed.options as any);
      return;
    }
    case 'update': {
      const projectId = requireProjectStudioArgument(rest[0], 'project update requires a project id or name');
      const parsed = parseProjectStudioArgs(rest.slice(1));
      await projectUpdateHandler(projectId, parsed.options as any);
      return;
    }
    case 'delete':
    case 'rm': {
      await projectDeleteHandler(requireProjectStudioArgument(rest[0], 'project delete requires a project id or name'));
      return;
    }
    case 'start':
    case 'rerun':
    case 're-run': {
      await projectStartHandler(requireProjectStudioArgument(rest[0], 'project start requires a project id or name'));
      return;
    }
    case 'status': {
      const projectId = requireProjectStudioArgument(rest[0], 'project status requires a project id or name');
      const status = requireProjectStudioArgument(rest[1], 'project status requires a status value');
      await projectStatusHandler(projectId, status);
      return;
    }
    case 'runs': {
      await projectRunsHandler(requireProjectStudioArgument(rest[0], 'project runs requires a project id or name'));
      return;
    }
    case 'deliverables':
    case 'deliveries': {
      await projectDeliverablesHandler(requireProjectStudioArgument(rest[0], 'project deliverables requires a project id or name'));
      return;
    }
    case 'role':
    case 'roles': {
      await routeProjectStudioRoleSlashTokens(rest);
      return;
    }
    case 'employee':
    case 'employees':
    case 'people': {
      await routeProjectStudioEmployeeSlashTokens(rest);
      return;
    }
    case 'team':
    case 'teams': {
      await routeProjectStudioTeamSlashTokens(rest);
      return;
    }
    default:
      throw new Error(`Unknown Project Studio command: ${command}\n\n${getProjectStudioSlashHelp()}`);
  }
}

async function routeProjectStudioRoleSlashTokens(tokens: string[]): Promise<void> {
  const [command = 'list', ...rest] = tokens;
  switch (command) {
    case 'list':
      await roleListHandler();
      return;
    case 'create': {
      const parsed = parseProjectStudioArgs(rest);
      await roleCreateHandler(parsed.options as any);
      return;
    }
    case 'update': {
      const roleId = requireProjectStudioArgument(rest[0], 'role update requires a role id or title');
      const parsed = parseProjectStudioArgs(rest.slice(1));
      await roleUpdateHandler(roleId, parsed.options as any);
      return;
    }
    case 'delete':
    case 'rm':
      await roleDeleteHandler(requireProjectStudioArgument(rest[0], 'role delete requires a role id or title'));
      return;
    default:
      throw new Error(`Unknown Project Studio role command: ${command}`);
  }
}

async function routeProjectStudioEmployeeSlashTokens(tokens: string[]): Promise<void> {
  const [command = 'list', ...rest] = tokens;
  switch (command) {
    case 'list':
      await employeeListHandler();
      return;
    case 'create': {
      const parsed = parseProjectStudioArgs(rest);
      await employeeCreateHandler(parsed.options as any);
      return;
    }
    case 'update': {
      const employeeId = requireProjectStudioArgument(rest[0], 'employee update requires an employee id or name');
      const parsed = parseProjectStudioArgs(rest.slice(1));
      await employeeUpdateHandler(employeeId, parsed.options as any);
      return;
    }
    case 'delete':
    case 'rm':
      await employeeDeleteHandler(requireProjectStudioArgument(rest[0], 'employee delete requires an employee id or name'));
      return;
    default:
      throw new Error(`Unknown Project Studio employee command: ${command}`);
  }
}

async function routeProjectStudioTeamSlashTokens(tokens: string[]): Promise<void> {
  const [command = 'list', ...rest] = tokens;
  switch (command) {
    case 'list':
      await projectTeamListHandler();
      return;
    case 'create': {
      const parsed = parseProjectStudioArgs(rest);
      await projectTeamCreateHandler(parsed.options as any);
      return;
    }
    case 'update': {
      const teamId = requireProjectStudioArgument(rest[0], 'team update requires a team id or name');
      const parsed = parseProjectStudioArgs(rest.slice(1));
      await projectTeamUpdateHandler(teamId, parsed.options as any);
      return;
    }
    case 'delete':
    case 'rm':
      await projectTeamDeleteHandler(requireProjectStudioArgument(rest[0], 'team delete requires a team id or name'));
      return;
    default:
      throw new Error(`Unknown Project Studio team command: ${command}`);
  }
}

function parseProjectStudioArgs(args: string[]): ParsedProjectStudioArgs {
  const positionals: string[] = [];
  const options: ParsedProjectStudioArgs['options'] = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    const [rawKey, inlineValue] = arg.slice(2).split(/=(.*)/s, 2);
    if (!rawKey) {
      continue;
    }

    if (rawKey.startsWith('no-')) {
      const positiveKey = toProjectStudioOptionKey(rawKey.slice(3));
      options[positiveKey] = false;
      options[`no${positiveKey.charAt(0).toUpperCase()}${positiveKey.slice(1)}`] = true;
      continue;
    }

    const key = toProjectStudioOptionKey(rawKey);
    if (inlineValue !== undefined) {
      options[key] = inlineValue;
      continue;
    }

    const next = args[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      options[key] = next;
      index += 1;
    } else {
      options[key] = true;
    }
  }

  return { positionals, options };
}

function toProjectStudioOptionKey(raw: string): string {
  return raw.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function requireProjectStudioArgument(value: string | undefined, message: string): string {
  if (!value?.trim()) {
    throw new Error(message);
  }
  return value;
}

function getProjectStudioSlashHelp(): string {
  return [
    'Project Studio slash commands:',
    '  /project list [--mode guided|autonomous] [--status idea|planning|active|stopped|blocked|done]',
    '  /project show <id-or-name>',
    '  /project context <id-or-name>',
    '  /project create --name <name> [--mode guided|autonomous] [--idea <text>] [--goals <text>] [--workspace <dir>]',
    '  /project update <id-or-name> [--name <name>] [--status <status>] [--employees <ids>] [--teams <ids>]',
    '  /project start <id-or-name>',
    '  /project runs <id-or-name>',
    '  /project deliverables <id-or-name>',
    '  /project role list|create|update|delete ...',
    '  /project employee list|create|update|delete ...',
    '  /project team list|create|update|delete ...',
    '',
    'Shortcuts:',
    '  /role list',
    '  /employee list',
    '  /people list',
    '  /team list',
  ].join('\n');
}
