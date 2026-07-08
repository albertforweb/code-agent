import {
  AutomationServiceBridge,
  type SkillDetail,
  type ScheduledTask,
  type VirtualTeamBlueprint,
  type VirtualTeamMember,
  type VirtualTeamRunRecord,
} from '../../electron/services/automation-service-bridge.js';

function getService(): AutomationServiceBridge {
  const service = new AutomationServiceBridge(process.cwd());
  configureCliExecutors(service);
  return service;
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export async function automationSkillsHandler(): Promise<void> {
  printJson(await getService().listSkills());
}

export async function automationSkillEnableHandler(skillId: string, enabled: boolean): Promise<void> {
  printJson(await getService().setSkillEnabled(skillId, enabled));
}

export async function automationTasksHandler(): Promise<void> {
  printJson(await getService().listTasks());
}

export async function automationTaskRunsHandler(taskId?: string): Promise<void> {
  printJson(await getService().listTaskRuns(taskId));
}

export async function automationTaskAddHandler(options: {
  name?: string;
  prompt?: string;
  interval?: string;
}): Promise<void> {
  const prompt = options.prompt?.trim();
  if (!prompt) {
    throw new Error('automation task add requires --prompt');
  }

  printJson(await getService().saveTask({
    name: options.name || 'Scheduled task',
    prompt,
    intervalMinutes: Number(options.interval ?? 60),
    enabled: true,
  }));
}

export async function automationTaskRunHandler(taskId: string): Promise<void> {
  printJson(await getService().runTask(taskId));
}

export async function automationTaskEnableHandler(taskId: string, enabled: boolean): Promise<void> {
  printJson(await getService().setTaskEnabled(taskId, enabled));
}

export async function automationTaskDeleteHandler(taskId: string): Promise<void> {
  printJson(await getService().deleteTask(taskId));
}

export async function automationRemoteStatusHandler(): Promise<void> {
  printJson(await getService().getRemoteControl());
}

export async function automationRemotePairHandler(options: { device?: string }): Promise<void> {
  printJson(await getService().createRemotePairingCode(options.device));
}

export async function automationRemoteServeHandler(): Promise<void> {
  const service = getService();
  const remote = await service.updateRemoteControl({ enabled: true, mode: 'local-network' });
  printJson(remote);
  process.stdout.write('\nRemote control server is running. Press Ctrl+C to stop.\n');
  await new Promise<void>(() => {});
}

export async function automationRemoteRelayStatusHandler(): Promise<void> {
  printJson((await getService().getRemoteControl()).relay ?? { enrollmentStatus: 'not-configured' });
}

export async function automationRemoteRelayConfigureHandler(options: {
  brokerUrl?: string;
  accountId?: string;
  deviceId?: string;
  relayPublicKey?: string;
  clientKeyId?: string;
  auditCursor?: string;
  tokenRotatesAt?: string;
}): Promise<void> {
  if (!options.brokerUrl?.trim()) {
    throw new Error('automation remote relay configure requires --broker-url');
  }

  const tokenRotatesAt = options.tokenRotatesAt
    ? Date.parse(options.tokenRotatesAt)
    : undefined;
  if (options.tokenRotatesAt && !Number.isFinite(tokenRotatesAt)) {
    throw new Error('automation remote relay configure --token-rotates-at must be an ISO timestamp or parseable date.');
  }

  printJson(await getService().configureRemoteRelay({
    brokerUrl: options.brokerUrl,
    accountId: options.accountId,
    deviceId: options.deviceId,
    relayPublicKey: options.relayPublicKey,
    clientKeyId: options.clientKeyId,
    auditCursor: options.auditCursor,
    tokenRotatesAt,
  }));
}

export async function automationRemoteRelayDisableHandler(): Promise<void> {
  printJson(await getService().disableRemoteRelay());
}

export async function automationTeamsHandler(): Promise<void> {
  printJson(await getService().listTeams());
}

export async function automationTeamRunsHandler(teamId?: string): Promise<void> {
  printJson(await getService().listTeamRuns(teamId));
}

export async function automationTeamCreateDefaultHandler(options: { objective?: string }): Promise<void> {
  printJson(await getService().createDefaultTeam(options.objective));
}

export async function automationTeamRunHandler(teamId: string): Promise<void> {
  printJson(await getService().runTeam(teamId));
}

export async function automationTeamDeleteHandler(teamId: string): Promise<void> {
  printJson(await getService().deleteTeam(teamId));
}

function configureCliExecutors(service: AutomationServiceBridge): void {
  service.setTaskExecutor(async (task, context) => {
    const response = await runOpenAiCompatiblePrompt(buildCliScheduledTaskPrompt(task, context.enabledSkills));
    return { content: response.content, model: response.model, usage: response.usage };
  });

  service.setVirtualTeamMemberExecutor(async (team, member, context) => {
    const response = await runOpenAiCompatiblePrompt(buildCliTeamMemberPrompt(team, member, context.previousSteps, context.enabledSkills));
    return { content: response.content, model: response.model, usage: response.usage };
  });
}

function buildCliScheduledTaskPrompt(task: ScheduledTask, skills: SkillDetail[]): string {
  return [
    'You are running a scheduled CodeAgent CLI automation task.',
    `Task: ${task.name}`,
    `Prompt: ${task.prompt}`,
    '',
    'Enabled skills:',
    formatSkillContext(skills),
    '',
    'Return a concise automation run summary.',
  ].join('\n');
}

function buildCliTeamMemberPrompt(
  team: VirtualTeamBlueprint,
  member: VirtualTeamMember,
  previousSteps: VirtualTeamRunRecord['steps'],
  skills: SkillDetail[],
): string {
  return [
    'You are a member of a local virtual software team running from the CodeAgent CLI.',
    `Team objective: ${team.objective}`,
    `Role: ${member.role}`,
    `Goal: ${member.goal}`,
    '',
    'Previous steps:',
    previousSteps
      .filter(step => step.output || step.error)
      .map(step => `${step.role}: ${step.output ?? step.error}`)
      .join('\n') || 'None',
    '',
    'Enabled skills:',
    formatSkillContext(skills),
    '',
    'Return concrete output for your role and a short handoff.',
  ].join('\n');
}

function formatSkillContext(skills: SkillDetail[]): string {
  if (skills.length === 0) {
    return 'No enabled workspace skills.';
  }

  return skills.map(skill => [
    `# ${skill.name}`,
    skill.description,
    skill.content.slice(0, 4000),
  ].filter(Boolean).join('\n')).join('\n\n---\n\n');
}

async function runOpenAiCompatiblePrompt(prompt: string): Promise<{
  content: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}> {
  const baseUrl = (
    process.env.CODE_AGENT_BASE_URL ||
    process.env.CODE_AGENT_LLM_BASE_URL ||
    process.env.OPENAI_COMPATIBLE_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    ''
  ).replace(/\/$/, '');
  const model =
    process.env.CODE_AGENT_MODEL ||
    process.env.OPENAI_COMPATIBLE_MODEL ||
    process.env.OPENAI_MODEL ||
    'local-model';
  const apiKey =
    process.env.CODE_AGENT_API_KEY ||
    process.env.OPENAI_COMPATIBLE_API_KEY ||
    process.env.OPENAI_API_KEY ||
    'local';

  if (!baseUrl) {
    throw new Error('CLI automation execution requires CODE_AGENT_BASE_URL, CODE_AGENT_LLM_BASE_URL, OPENAI_COMPATIBLE_BASE_URL, or OPENAI_BASE_URL.');
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are CodeAgent running a local automation task. Be concise and actionable.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: Number(process.env.CODE_AGENT_MAX_OUTPUT_TOKENS || 2048),
      temperature: Number(process.env.CODE_AGENT_TEMPERATURE || 0.7),
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI-compatible automation request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json() as any;
  return {
    content: data.choices?.[0]?.message?.content ?? '',
    model: data.model ?? model,
    usage: {
      inputTokens: Number(data.usage?.prompt_tokens ?? 0),
      outputTokens: Number(data.usage?.completion_tokens ?? 0),
    },
  };
}
