/**
 * Main Application Component
 * Entry point for the Electron renderer UI
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import hljs from 'highlight.js/lib/common';
import styles from './App.module.css';
import {
  ipcClient,
  type AppConfig,
  type AppInfo,
  type ChatMessage,
  type LlmProviderType,
  type McpServerInfo,
  type McpToolInfo,
  type Tool,
} from './ipc-client';

type MessageRole = 'assistant' | 'user' | 'system' | 'tool' | 'error';
type MessageStatus = 'sent' | 'sending' | 'failed';

interface UiMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  status?: MessageStatus;
  title?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

interface AnsiSegment {
  text: string;
  style: {
    color?: string;
    fontWeight?: 700;
    opacity?: number;
  };
}

interface SettingsDraft {
  apiKey: string;
  llmProvider: LlmProviderType;
  baseUrl: string;
  model: string;
  fallbackModel: string;
  temperature: number;
  maxTokens: number;
  theme: 'light' | 'dark' | 'system';
  memoryEnabled: boolean;
  pluginsEnabled: boolean;
  autoUpdate: boolean;
  outputFormat: 'text' | 'json' | 'stream-json';
  inputFormat: 'text' | 'stream-json';
  printMode: boolean;
  includeHookEvents: boolean;
  includePartialMessages: boolean;
  replayUserMessages: boolean;
  jsonSchema: string;
  debugEnabled: boolean;
  debugFilter: string;
  debugToStderr: boolean;
  debugFile: string;
  verbose: boolean;
  mcpDebug: boolean;
  bareMode: boolean;
  startupMode: 'none' | 'init' | 'init-only' | 'maintenance';
  thinkingMode: 'adaptive' | 'enabled' | 'disabled';
  effort: 'low' | 'medium' | 'high' | 'max';
  maxThinkingTokens: string;
  maxTurns: string;
  maxBudgetUsd: string;
  taskBudget: string;
  workload: string;
  betas: string;
  agent: string;
  allowedTools: string;
  selectedTools: string;
  disallowedTools: string;
  permissionMode: string;
  permissionPromptTool: string;
  dangerouslySkipPermissions: boolean;
  allowDangerouslySkipPermissions: boolean;
  systemPrompt: string;
  systemPromptFile: string;
  appendSystemPrompt: string;
  appendSystemPromptFile: string;
  mcpConfig: string;
  strictMcpConfig: boolean;
  settingsSource: string;
  settingSources: string;
  addDirs: string;
  pluginDirs: string;
  agentsJson: string;
  disableSlashCommands: boolean;
  chromeIntegration: 'default' | 'enabled' | 'disabled';
  ideAutoConnect: boolean;
  continueSession: boolean;
  resumeSession: string;
  fromPr: string;
  forkSession: boolean;
  noSessionPersistence: boolean;
  resumeSessionAt: string;
  rewindFilesMessageId: string;
  sessionId: string;
  sessionName: string;
  prefill: string;
  deepLinkOrigin: boolean;
  deepLinkRepo: string;
  deepLinkLastFetch: string;
  worktree: string;
  tmuxMode: 'off' | 'default' | 'classic';
  advisorModel: string;
  proactive: boolean;
  fileSpecs: string;
  messagingSocketPath: string;
  briefMode: boolean;
  assistantMode: boolean;
  channelServers: string;
  developmentChannelServers: string;
  agentId: string;
  agentName: string;
  teamName: string;
  agentColor: string;
  planModeRequired: boolean;
  parentSessionId: string;
  teammateMode: 'auto' | 'tmux' | 'in-process';
  agentType: string;
  sdkUrl: string;
  teleportSession: string;
  remoteDescription: string;
  remoteControlName: string;
  hardFail: boolean;
}

const DEFAULT_PROVIDER: LlmProviderType = 'anthropic';
const PROVIDER_DEFAULTS: Record<LlmProviderType, { label: string; model: string; baseUrl: string }> = {
  anthropic: {
    label: 'Anthropic',
    model: 'claude-3-5-sonnet-20241022',
    baseUrl: '',
  },
  openai: {
    label: 'OpenAI',
    model: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1',
  },
  'openai-compatible': {
    label: 'OpenAI-compatible / LM Studio',
    model: 'local-model',
    baseUrl: 'http://127.0.0.1:1234/v1',
  },
};

function getProviderDefault(provider: LlmProviderType) {
  return PROVIDER_DEFAULTS[provider] ?? PROVIDER_DEFAULTS[DEFAULT_PROVIDER];
}

const PERMISSION_MODES = ['default', 'acceptEdits', 'plan', 'bypassPermissions', 'auto'];
const SETTING_SOURCE_OPTIONS = ['user', 'project', 'local'];
const ANSI_COLORS: Record<number, string> = {
  30: '#1f2937',
  31: '#b91c1c',
  32: '#15803d',
  33: '#a16207',
  34: '#1d4ed8',
  35: '#a21caf',
  36: '#0e7490',
  37: '#f3f4f6',
  90: '#6b7280',
  91: '#ef4444',
  92: '#22c55e',
  93: '#eab308',
  94: '#3b82f6',
  95: '#d946ef',
  96: '#06b6d4',
  97: '#ffffff',
};

function readCliOption(config: AppConfig | null, key: string, fallback = ''): string {
  const value = config?.cliOptions?.[key];
  return value === undefined || value === null ? fallback : String(value);
}

function readCliBoolean(config: AppConfig | null, key: string, fallback = false): boolean {
  const value = config?.cliOptions?.[key];
  return value === undefined || value === null ? fallback : Boolean(value);
}

function readCliChoice<T extends string>(config: AppConfig | null, key: string, fallback: T, choices: readonly T[]): T {
  const value = readCliOption(config, key, fallback);
  return choices.includes(value as T) ? value as T : fallback;
}

function createMessage(
  role: MessageRole,
  content: string,
  overrides: Partial<UiMessage> = {},
): UiMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: Date.now(),
    ...overrides,
  };
}

function createSettingsDraft(config: AppConfig | null): SettingsDraft {
  const llmProvider = config?.llmProvider || DEFAULT_PROVIDER;
  const providerDefault = getProviderDefault(llmProvider);

  return {
    apiKey: '',
    llmProvider,
    baseUrl: config?.baseUrl || providerDefault.baseUrl,
    model: config?.model || providerDefault.model,
    fallbackModel: readCliOption(config, 'fallbackModel'),
    temperature: Number(config?.temperature ?? 0.7),
    maxTokens: Number(config?.maxTokens ?? 4096),
    theme: config?.theme || 'system',
    memoryEnabled: Boolean(config?.memoryEnabled ?? true),
    pluginsEnabled: Boolean(config?.pluginsEnabled ?? true),
    autoUpdate: Boolean(config?.autoUpdate ?? false),
    outputFormat: readCliChoice(config, 'outputFormat', 'text', ['text', 'json', 'stream-json']),
    inputFormat: readCliChoice(config, 'inputFormat', 'text', ['text', 'stream-json']),
    printMode: readCliBoolean(config, 'printMode'),
    includeHookEvents: readCliBoolean(config, 'includeHookEvents'),
    includePartialMessages: readCliBoolean(config, 'includePartialMessages'),
    replayUserMessages: readCliBoolean(config, 'replayUserMessages'),
    jsonSchema: readCliOption(config, 'jsonSchema'),
    debugEnabled: readCliBoolean(config, 'debugEnabled'),
    debugFilter: readCliOption(config, 'debugFilter'),
    debugToStderr: readCliBoolean(config, 'debugToStderr'),
    debugFile: readCliOption(config, 'debugFile'),
    verbose: readCliBoolean(config, 'verbose'),
    mcpDebug: readCliBoolean(config, 'mcpDebug'),
    bareMode: readCliBoolean(config, 'bareMode'),
    startupMode: readCliChoice(config, 'startupMode', 'none', ['none', 'init', 'init-only', 'maintenance']),
    thinkingMode: readCliChoice(config, 'thinkingMode', 'adaptive', ['adaptive', 'enabled', 'disabled']),
    effort: readCliChoice(config, 'effort', 'medium', ['low', 'medium', 'high', 'max']),
    maxThinkingTokens: readCliOption(config, 'maxThinkingTokens'),
    maxTurns: readCliOption(config, 'maxTurns'),
    maxBudgetUsd: readCliOption(config, 'maxBudgetUsd'),
    taskBudget: readCliOption(config, 'taskBudget'),
    workload: readCliOption(config, 'workload'),
    betas: readCliOption(config, 'betas'),
    agent: readCliOption(config, 'agent'),
    allowedTools: readCliOption(config, 'allowedTools'),
    selectedTools: readCliOption(config, 'selectedTools', 'default'),
    disallowedTools: readCliOption(config, 'disallowedTools'),
    permissionMode: readCliOption(config, 'permissionMode', 'default'),
    permissionPromptTool: readCliOption(config, 'permissionPromptTool'),
    dangerouslySkipPermissions: readCliBoolean(config, 'dangerouslySkipPermissions'),
    allowDangerouslySkipPermissions: readCliBoolean(config, 'allowDangerouslySkipPermissions'),
    systemPrompt: readCliOption(config, 'systemPrompt'),
    systemPromptFile: readCliOption(config, 'systemPromptFile'),
    appendSystemPrompt: readCliOption(config, 'appendSystemPrompt'),
    appendSystemPromptFile: readCliOption(config, 'appendSystemPromptFile'),
    mcpConfig: readCliOption(config, 'mcpConfig'),
    strictMcpConfig: readCliBoolean(config, 'strictMcpConfig'),
    settingsSource: readCliOption(config, 'settingsSource'),
    settingSources: readCliOption(config, 'settingSources', 'user,project,local'),
    addDirs: readCliOption(config, 'addDirs'),
    pluginDirs: readCliOption(config, 'pluginDirs'),
    agentsJson: readCliOption(config, 'agentsJson'),
    disableSlashCommands: readCliBoolean(config, 'disableSlashCommands'),
    chromeIntegration: readCliChoice(config, 'chromeIntegration', 'default', ['default', 'enabled', 'disabled']),
    ideAutoConnect: readCliBoolean(config, 'ideAutoConnect'),
    continueSession: readCliBoolean(config, 'continueSession'),
    resumeSession: readCliOption(config, 'resumeSession'),
    fromPr: readCliOption(config, 'fromPr'),
    forkSession: readCliBoolean(config, 'forkSession'),
    noSessionPersistence: readCliBoolean(config, 'noSessionPersistence'),
    resumeSessionAt: readCliOption(config, 'resumeSessionAt'),
    rewindFilesMessageId: readCliOption(config, 'rewindFilesMessageId'),
    sessionId: readCliOption(config, 'sessionId'),
    sessionName: readCliOption(config, 'sessionName'),
    prefill: readCliOption(config, 'prefill'),
    deepLinkOrigin: readCliBoolean(config, 'deepLinkOrigin'),
    deepLinkRepo: readCliOption(config, 'deepLinkRepo'),
    deepLinkLastFetch: readCliOption(config, 'deepLinkLastFetch'),
    worktree: readCliOption(config, 'worktree'),
    tmuxMode: readCliChoice(config, 'tmuxMode', 'off', ['off', 'default', 'classic']),
    advisorModel: readCliOption(config, 'advisorModel'),
    proactive: readCliBoolean(config, 'proactive'),
    fileSpecs: readCliOption(config, 'fileSpecs'),
    messagingSocketPath: readCliOption(config, 'messagingSocketPath'),
    briefMode: readCliBoolean(config, 'briefMode'),
    assistantMode: readCliBoolean(config, 'assistantMode'),
    channelServers: readCliOption(config, 'channelServers'),
    developmentChannelServers: readCliOption(config, 'developmentChannelServers'),
    agentId: readCliOption(config, 'agentId'),
    agentName: readCliOption(config, 'agentName'),
    teamName: readCliOption(config, 'teamName'),
    agentColor: readCliOption(config, 'agentColor'),
    planModeRequired: readCliBoolean(config, 'planModeRequired'),
    parentSessionId: readCliOption(config, 'parentSessionId'),
    teammateMode: readCliChoice(config, 'teammateMode', 'auto', ['auto', 'tmux', 'in-process']),
    agentType: readCliOption(config, 'agentType'),
    sdkUrl: readCliOption(config, 'sdkUrl'),
    teleportSession: readCliOption(config, 'teleportSession'),
    remoteDescription: readCliOption(config, 'remoteDescription'),
    remoteControlName: readCliOption(config, 'remoteControlName'),
    hardFail: readCliBoolean(config, 'hardFail'),
  };
}

function buildCliOptions(draft: SettingsDraft): Record<string, unknown> {
  return {
    fallbackModel: draft.fallbackModel,
    outputFormat: draft.outputFormat,
    inputFormat: draft.inputFormat,
    printMode: draft.printMode,
    includeHookEvents: draft.includeHookEvents,
    includePartialMessages: draft.includePartialMessages,
    replayUserMessages: draft.replayUserMessages,
    jsonSchema: draft.jsonSchema,
    debugEnabled: draft.debugEnabled,
    debugFilter: draft.debugFilter,
    debugToStderr: draft.debugToStderr,
    debugFile: draft.debugFile,
    verbose: draft.verbose,
    mcpDebug: draft.mcpDebug,
    bareMode: draft.bareMode,
    startupMode: draft.startupMode,
    thinkingMode: draft.thinkingMode,
    effort: draft.effort,
    maxThinkingTokens: draft.maxThinkingTokens,
    maxTurns: draft.maxTurns,
    maxBudgetUsd: draft.maxBudgetUsd,
    taskBudget: draft.taskBudget,
    workload: draft.workload,
    betas: draft.betas,
    agent: draft.agent,
    allowedTools: draft.allowedTools,
    selectedTools: draft.selectedTools,
    disallowedTools: draft.disallowedTools,
    permissionMode: draft.permissionMode,
    permissionPromptTool: draft.permissionPromptTool,
    dangerouslySkipPermissions: draft.dangerouslySkipPermissions,
    allowDangerouslySkipPermissions: draft.allowDangerouslySkipPermissions,
    systemPrompt: draft.systemPrompt,
    systemPromptFile: draft.systemPromptFile,
    appendSystemPrompt: draft.appendSystemPrompt,
    appendSystemPromptFile: draft.appendSystemPromptFile,
    mcpConfig: draft.mcpConfig,
    strictMcpConfig: draft.strictMcpConfig,
    settingsSource: draft.settingsSource,
    settingSources: draft.settingSources,
    addDirs: draft.addDirs,
    pluginDirs: draft.pluginDirs,
    agentsJson: draft.agentsJson,
    disableSlashCommands: draft.disableSlashCommands,
    chromeIntegration: draft.chromeIntegration,
    ideAutoConnect: draft.ideAutoConnect,
    continueSession: draft.continueSession,
    resumeSession: draft.resumeSession,
    fromPr: draft.fromPr,
    forkSession: draft.forkSession,
    noSessionPersistence: draft.noSessionPersistence,
    resumeSessionAt: draft.resumeSessionAt,
    rewindFilesMessageId: draft.rewindFilesMessageId,
    sessionId: draft.sessionId,
    sessionName: draft.sessionName,
    prefill: draft.prefill,
    deepLinkOrigin: draft.deepLinkOrigin,
    deepLinkRepo: draft.deepLinkRepo,
    deepLinkLastFetch: draft.deepLinkLastFetch,
    worktree: draft.worktree,
    tmuxMode: draft.tmuxMode,
    advisorModel: draft.advisorModel,
    proactive: draft.proactive,
    fileSpecs: draft.fileSpecs,
    messagingSocketPath: draft.messagingSocketPath,
    briefMode: draft.briefMode,
    assistantMode: draft.assistantMode,
    channelServers: draft.channelServers,
    developmentChannelServers: draft.developmentChannelServers,
    agentId: draft.agentId,
    agentName: draft.agentName,
    teamName: draft.teamName,
    agentColor: draft.agentColor,
    planModeRequired: draft.planModeRequired,
    parentSessionId: draft.parentSessionId,
    teammateMode: draft.teammateMode,
    agentType: draft.agentType,
    sdkUrl: draft.sdkUrl,
    teleportSession: draft.teleportSession,
    remoteDescription: draft.remoteDescription,
    remoteControlName: draft.remoteControlName,
    hardFail: draft.hardFail,
  };
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function parseToolCommand(input: string): { toolName: string; args: Record<string, any> } | null {
  const match = input.match(/^\/run\s+(\S+)(?:\s+([\s\S]+))?$/);
  if (!match) {
    return null;
  }

  const [, toolName, rawArgs] = match;
  if (!rawArgs?.trim()) {
    return { toolName, args: {} };
  }

  const parsed = JSON.parse(rawArgs);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Tool arguments must be a JSON object');
  }

  return { toolName, args: parsed as Record<string, any> };
}

function getChatMessages(messages: UiMessage[], nextUserMessage: string): ChatMessage[] {
  const history = messages
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .map(message => ({
      role: message.role as 'user' | 'assistant',
      content: message.content,
    }));

  return [...history, { role: 'user', content: nextUserMessage }];
}

function parseAnsiText(text: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  const pattern = /\x1b\[([0-9;]*)m/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let style: AnsiSegment['style'] = {};

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), style: { ...style } });
    }

    style = applyAnsiCodes(style, match[1]);
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), style: { ...style } });
  }

  return segments.length > 0 ? segments : [{ text, style: {} }];
}

function applyAnsiCodes(style: AnsiSegment['style'], rawCodes: string): AnsiSegment['style'] {
  const codes = rawCodes === '' ? [0] : rawCodes.split(';').map(code => Number(code));
  let next = { ...style };

  for (const code of codes) {
    if (code === 0) {
      next = {};
    } else if (code === 1) {
      next.fontWeight = 700;
    } else if (code === 2) {
      next.opacity = 0.72;
    } else if (code === 22) {
      delete next.fontWeight;
      delete next.opacity;
    } else if (code === 39) {
      delete next.color;
    } else if (ANSI_COLORS[code]) {
      next.color = ANSI_COLORS[code];
    }
  }

  return next;
}

function renderAnsiText(text: string): React.ReactNode {
  return parseAnsiText(text).map((segment, index) => (
    <span style={segment.style} key={`${index}-${segment.text.slice(0, 8)}`}>
      {segment.text}
    </span>
  ));
}

export function App() {
  const [status, setStatus] = useState('Initializing');
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [appState, setAppState] = useState<Record<string, any>>({});
  const [viewportSize, setViewportSize] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const [tools, setTools] = useState<Tool[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([]);
  const [mcpTools, setMcpTools] = useState<McpToolInfo[]>([]);
  const [messages, setMessages] = useState<UiMessage[]>([
    createMessage('assistant', 'Ready.', { title: 'Code Agent' }),
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>(() => createSettingsDraft(null));
  const [settingsMessage, setSettingsMessage] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const messageListRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const streamMessageIds = useRef<Map<string, string>>(new Map());

  const tokenUsage = useMemo(() => {
    return messages.reduce(
      (totals, message) => ({
        inputTokens: totals.inputTokens + (message.usage?.inputTokens ?? 0),
        outputTokens: totals.outputTokens + (message.usage?.outputTokens ?? 0),
      }),
      { inputTokens: 0, outputTokens: 0 },
    );
  }, [messages]);

  useEffect(() => {
    initializeApp();
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const removers: Array<() => void> = [];

    try {
      removers.push(ipcClient.onChatDelta(data => {
        const messageId = streamMessageIds.current.get(data.requestId);
        if (!messageId) {
          return;
        }

        setMessages(current => current.map(message => (
          message.id === messageId
            ? { ...message, content: `${message.content}${data.delta}` }
            : message
        )));
      }));

      removers.push(ipcClient.onChatComplete(data => {
        const messageId = streamMessageIds.current.get(data.requestId);
        streamMessageIds.current.delete(data.requestId);

        if (messageId) {
          setMessages(current => current.map(message => (
            message.id === messageId
              ? {
                ...message,
                content: data.response.content || message.content || 'No response content.',
                status: 'sent',
                title: data.response.model,
                usage: data.response.usage,
              }
              : message
          )));
        }

        setIsSending(false);
        setStatus('Ready');
        inputRef.current?.focus();
      }));

      removers.push(ipcClient.onChatError(data => {
        const messageId = streamMessageIds.current.get(data.requestId);
        streamMessageIds.current.delete(data.requestId);

        if (messageId) {
          setMessages(current => current.map(message => (
            message.id === messageId
              ? { ...message, content: data.error, status: 'failed', title: 'Request failed', role: 'error' }
              : message
          )));
        } else {
          appendMessage(createMessage('error', data.error, {
            title: 'Request failed',
            status: 'failed',
          }));
        }

        setIsSending(false);
        setStatus('Error');
        inputRef.current?.focus();
      }));

      removers.push(ipcClient.onToolResult(data => {
        appendMessage(createMessage('tool', `\`\`\`json\n${formatJson(data.data)}\n\`\`\``, {
          title: `Tool result ${data.toolId}`,
        }));
      }));

      removers.push(ipcClient.onToolComplete(data => {
        appendMessage(createMessage('tool', `${data.success ? 'Completed' : 'Failed'} in ${data.duration} ms`, {
          title: `Tool ${data.toolId}`,
        }));
      }));

      removers.push(ipcClient.onToolError(data => {
        appendMessage(createMessage('error', data.error, {
          title: `Tool error ${data.toolId}`,
          status: 'failed',
        }));
      }));

      removers.push(ipcClient.onConfigChanged(data => {
        setAppConfig(data.config);
      }));

      removers.push(ipcClient.onStateChanged(data => {
        setAppState(data.state);
      }));
    } catch (error) {
      setStatus('Startup error');
      appendMessage(createMessage('error', error instanceof Error ? error.message : String(error), {
        title: 'IPC unavailable',
        status: 'failed',
      }));
    }

    return () => {
      for (const remove of removers) {
        remove();
      }
    };
  }, []);

  useEffect(() => {
    messageListRef.current?.scrollTo({
      top: messageListRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, isSending]);

  useEffect(() => {
    const theme = appConfig?.theme || 'system';
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    document.body.classList.toggle('dark', theme === 'dark' || (theme === 'system' && prefersDark));
  }, [appConfig?.theme]);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [input]);

  async function initializeApp() {
    try {
      const [info, config, state, bridgeTools, servers, discoveredMcpTools] = await Promise.all([
        ipcClient.app.info(),
        ipcClient.app.getConfig(),
        ipcClient.app.getState(),
        ipcClient.tools.list(),
        ipcClient.mcp.listServers(),
        ipcClient.mcp.listTools(),
      ]);

      setAppInfo(info);
      setAppConfig(config);
      setAppState(state);
      setSettingsDraft(createSettingsDraft(config));
      setTools(bridgeTools);
      setMcpServers(servers);
      setMcpTools(discoveredMcpTools);
      setStatus('Ready');
    } catch (error) {
      console.error('Failed to initialize app:', error);
      setStatus('Startup error');
      appendMessage(createMessage('error', error instanceof Error ? error.message : String(error), {
        title: 'Startup error',
        status: 'failed',
      }));
    }
  }

  function appendMessage(message: UiMessage) {
    setMessages(current => [...current, message]);
  }

  function updateSettingsDraft(update: Partial<SettingsDraft>) {
    setSettingsDraft(current => ({ ...current, ...update }));
  }

  async function refreshBridgeData() {
    const [bridgeTools, servers, discoveredMcpTools] = await Promise.all([
      ipcClient.tools.list(),
      ipcClient.mcp.refresh(),
      ipcClient.mcp.listTools(),
    ]);

    setTools(bridgeTools);
    setMcpServers(servers);
    setMcpTools(discoveredMcpTools);

    return { bridgeTools, servers, discoveredMcpTools };
  }

  async function submitPrompt() {
    const prompt = input.trim();
    if (!prompt || isSending) {
      return;
    }

    setInput('');
    setIsSending(true);

    const userMessage = createMessage('user', prompt);
    setMessages(current => [...current, userMessage]);
    let pendingStreamRequestId: string | null = null;

    try {
      if (await handleCommand(prompt)) {
        setStatus('Ready');
        return;
      }

      setStatus('Streaming');
      const requestId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      pendingStreamRequestId = requestId;
      const activeProvider = appConfig?.llmProvider || DEFAULT_PROVIDER;
      const activeProviderDefault = getProviderDefault(activeProvider);
      const assistantMessage = createMessage('assistant', '', {
        title: `${PROVIDER_DEFAULTS[activeProvider].label} / ${appConfig?.model || activeProviderDefault.model}`,
        status: 'sending',
      });

      streamMessageIds.current.set(requestId, assistantMessage.id);
      appendMessage(assistantMessage);

      await ipcClient.api.chatStream({
        requestId,
        messages: getChatMessages(messages, prompt),
        provider: activeProvider,
        baseUrl: appConfig?.baseUrl || activeProviderDefault.baseUrl,
        model: appConfig?.model || activeProviderDefault.model,
        maxTokens: Number(appConfig?.maxTokens ?? 4096),
        temperature: Number(appConfig?.temperature ?? 0.7),
      });
    } catch (error) {
      if (pendingStreamRequestId) {
        streamMessageIds.current.delete(pendingStreamRequestId);
      }

      const message = error instanceof Error ? error.message : String(error);
      appendMessage(createMessage('error', message, {
        title: 'Request failed',
        status: 'failed',
      }));
      setStatus('Error');
    } finally {
      if (!streamMessageIds.current.size) {
        setIsSending(false);
        inputRef.current?.focus();
      }
    }
  }

  async function handleCommand(prompt: string): Promise<boolean> {
    if (!prompt.startsWith('/')) {
      return false;
    }

    if (prompt === '/clear') {
      setMessages([createMessage('assistant', 'Ready.', { title: 'Code Agent' })]);
      return true;
    }

    if (prompt === '/tools') {
      appendMessage(createMessage('system', formatTools(tools), { title: 'Bridge tools' }));
      return true;
    }

    if (prompt === '/mcp') {
      const { servers } = await refreshBridgeData();
      appendMessage(createMessage('system', formatMcpServers(servers), { title: 'MCP servers' }));
      return true;
    }

    if (prompt === '/config') {
      appendMessage(createMessage('system', `\`\`\`json\n${formatJson(appConfig)}\n\`\`\``, {
        title: 'Configuration',
      }));
      return true;
    }

    const toolCommand = parseToolCommand(prompt);
    if (toolCommand) {
      const { toolId } = await ipcClient.tools.execute(toolCommand.toolName, toolCommand.args);
      appendMessage(createMessage('tool', `Started ${toolCommand.toolName}`, {
        title: `Tool ${toolId}`,
      }));
      return true;
    }

    appendMessage(createMessage('error', `Unknown command: ${prompt}`, {
      title: 'Command error',
      status: 'failed',
    }));
    return true;
  }

  function formatTools(availableTools: Tool[]): string {
    if (availableTools.length === 0) {
      return 'No bridge tools are available.';
    }

    return availableTools
      .map(tool => `- ${tool.name}${tool.readOnly ? ' (read-only)' : ''}: ${tool.description}`)
      .join('\n');
  }

  function formatMcpServers(servers: McpServerInfo[]): string {
    if (servers.length === 0) {
      return 'No MCP servers are configured.';
    }

    return servers
      .map(server => `- ${server.name} [${server.scope ?? 'unknown'}]: ${server.status} (${server.type})`)
      .join('\n');
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitPrompt();
    }
  }

  async function copyMessage(message: UiMessage) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      window.setTimeout(() => setCopiedMessageId(null), 1500);
    } catch (error) {
      appendMessage(createMessage('error', error instanceof Error ? error.message : String(error), {
        title: 'Copy failed',
        status: 'failed',
      }));
    }
  }

  function clearChat() {
    setMessages([createMessage('assistant', 'Ready.', { title: 'Code Agent' })]);
    setStatus('Ready');
    inputRef.current?.focus();
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingSettings(true);
    setSettingsMessage('');

    try {
      const nextConfig: Partial<AppConfig> = {
        llmProvider: settingsDraft.llmProvider,
        baseUrl: settingsDraft.baseUrl,
        model: settingsDraft.model,
        temperature: Number(settingsDraft.temperature),
        maxTokens: Number(settingsDraft.maxTokens),
        theme: settingsDraft.theme,
        memoryEnabled: settingsDraft.memoryEnabled,
        pluginsEnabled: settingsDraft.pluginsEnabled,
        autoUpdate: settingsDraft.autoUpdate,
        cliOptions: buildCliOptions(settingsDraft),
      };

      await ipcClient.app.setConfig(nextConfig);

      if (settingsDraft.apiKey.trim()) {
        await ipcClient.auth.setToken({
          accessToken: settingsDraft.apiKey.trim(),
          provider: settingsDraft.llmProvider,
        });
      }

      const config = await ipcClient.app.getConfig();
      setAppConfig(config);
      setSettingsDraft({ ...createSettingsDraft(config), apiKey: '' });
      setSettingsMessage('Saved');
      setStatus('Ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSettingsMessage(message);
      setStatus('Settings error');
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function clearToken() {
    await ipcClient.auth.logout();
    updateSettingsDraft({ apiKey: '' });
    setSettingsMessage('Authentication cleared');
  }

  const statusLabel = isSending ? 'Working' : status;
  const activeProvider = appConfig?.llmProvider || DEFAULT_PROVIDER;
  const activeProviderDefault = getProviderDefault(activeProvider);
  const activeProviderLabel = PROVIDER_DEFAULTS[activeProvider].label;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Code Agent</h1>
          <span className={styles.subtitle}>
            {activeProviderLabel} / {appConfig?.model || activeProviderDefault.model}
          </span>
        </div>
        <div className={styles.headerActions}>
          <span className={`${styles.status} ${isSending ? styles.statusBusy : ''}`}>{statusLabel}</span>
          <button className={styles.secondaryButton} type="button" onClick={() => setIsSettingsOpen(true)}>
            Settings
          </button>
        </div>
      </header>

      <main className={styles.workspace}>
        <section className={styles.chatPanel} aria-label="Chat">
          <div className={styles.messageList} ref={messageListRef}>
            {messages.map(message => (
              <MessageItem
                key={message.id}
                message={message}
                copied={copiedMessageId === message.id}
                onCopy={() => copyMessage(message)}
              />
            ))}
            {isSending && (
              <div className={styles.typingIndicator} role="status">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>

          <form className={styles.composer} onSubmit={event => {
            event.preventDefault();
            submitPrompt();
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={event => setInput(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Ask Code Agent"
              rows={1}
              disabled={isSending}
              aria-label="Message"
            />
            <div className={styles.composerActions}>
              <button className={styles.secondaryButton} type="button" onClick={clearChat}>
                Clear
              </button>
              <button className={styles.primaryButton} type="submit" disabled={isSending || !input.trim()}>
                Send
              </button>
            </div>
          </form>
        </section>

        <aside className={styles.sidePanel} aria-label="Workspace status">
          <section className={styles.panelSection}>
            <div className={styles.panelHeader}>
              <h2>Session</h2>
              <button className={styles.textButton} type="button" onClick={refreshBridgeData}>
                Refresh
              </button>
            </div>
            <dl className={styles.statsList}>
              <div>
                <dt>Bridge tools</dt>
                <dd>{tools.length}</dd>
              </div>
              <div>
                <dt>MCP servers</dt>
                <dd>{mcpServers.length}</dd>
              </div>
              <div>
                <dt>MCP tools</dt>
                <dd>{mcpTools.length}</dd>
              </div>
              <div>
                <dt>Tokens</dt>
                <dd>{tokenUsage.inputTokens + tokenUsage.outputTokens}</dd>
              </div>
              <div>
                <dt>State keys</dt>
                <dd>{Object.keys(appState).length}</dd>
              </div>
            </dl>
          </section>

          <section className={styles.panelSection}>
            <h2>Tools</h2>
            <div className={styles.tagList}>
              {tools.slice(0, 8).map(tool => (
                <span className={styles.tag} key={tool.name}>
                  {tool.name}
                </span>
              ))}
              {tools.length === 0 && <span className={styles.mutedText}>None</span>}
            </div>
          </section>

          <section className={styles.panelSection}>
            <h2>Runtime</h2>
            <dl className={styles.runtimeList}>
              <div>
                <dt>Version</dt>
                <dd>{appInfo?.version || 'Unknown'}</dd>
              </div>
              <div>
                <dt>Platform</dt>
                <dd>{appInfo ? `${appInfo.platform} ${appInfo.arch}` : 'Unknown'}</dd>
              </div>
              <div>
                <dt>Viewport</dt>
                <dd>{viewportSize.width} x {viewportSize.height}</dd>
              </div>
              <div>
                <dt>Theme</dt>
                <dd>{appConfig?.theme || 'system'}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </main>

      <footer className={styles.footer}>
        <span>{statusLabel}</span>
        <span>{messages.length} messages</span>
        <span>{tokenUsage.inputTokens} in / {tokenUsage.outputTokens} out</span>
      </footer>

      {isSettingsOpen && (
        <SettingsDialog
          draft={settingsDraft}
          message={settingsMessage}
          saving={isSavingSettings}
          tools={tools}
          mcpServers={mcpServers}
          onChange={updateSettingsDraft}
          onClose={() => setIsSettingsOpen(false)}
          onClearToken={clearToken}
          onSubmit={saveSettings}
        />
      )}
    </div>
  );
}

function MessageItem({
  message,
  copied,
  onCopy,
}: {
  message: UiMessage;
  copied: boolean;
  onCopy: () => void;
}) {
  const roleClass = styles[`message_${message.role}` as keyof typeof styles] || '';

  return (
    <article className={`${styles.message} ${roleClass}`}>
      <div className={styles.messageHeader}>
        <div>
          <span className={styles.messageRole}>{message.title || message.role}</span>
          <time>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
        </div>
        <button className={styles.textButton} type="button" onClick={onCopy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className={styles.messageContent}>{renderMessageContent(message.content)}</div>
      {message.usage && (
        <div className={styles.messageMeta}>
          {message.usage.inputTokens} input tokens / {message.usage.outputTokens} output tokens
        </div>
      )}
    </article>
  );
}

function renderMessageContent(content: string): React.ReactNode {
  const blocks: React.ReactNode[] = [];
  const fencePattern = /```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fencePattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      blocks.push(renderTextBlock(content.slice(lastIndex, match.index), `text-${lastIndex}`));
    }

    const language = match[1];
    const code = match[2].replace(/\n$/, '');
    blocks.push(renderCodeBlock(code, language, `code-${match.index}`));
    lastIndex = fencePattern.lastIndex;
  }

  if (lastIndex < content.length) {
    blocks.push(renderTextBlock(content.slice(lastIndex), `text-${lastIndex}`));
  }

  return blocks.length > 0 ? blocks : renderTextBlock(content, 'text-empty');
}

function renderTextBlock(text: string, key: string): React.ReactNode {
  if (!text) {
    return null;
  }

  return (
    <p className={styles.textBlock} key={key}>
      {renderAnsiText(text)}
    </p>
  );
}

function renderCodeBlock(code: string, language: string | undefined, key: string): React.ReactNode {
  let highlighted = '';
  try {
    highlighted = language
      ? hljs.highlight(code, { language, ignoreIllegals: true }).value
      : hljs.highlightAuto(code).value;
  } catch {
    highlighted = hljs.highlightAuto(code).value;
  }

  return (
    <pre className={styles.codeBlock} key={key}>
      <code dangerouslySetInnerHTML={{ __html: highlighted }} />
    </pre>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.settingsSection}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function TextSetting({
  label,
  value,
  onChange,
  type = 'text',
  className = '',
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  className?: string;
}) {
  return (
    <label className={`${styles.field} ${className}`}>
      <span>{label}</span>
      <input type={type} value={value} onChange={event => onChange(event.target.value)} autoComplete="off" />
    </label>
  );
}

function TextAreaSetting({
  label,
  value,
  onChange,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={`${styles.field} ${className}`}>
      <span>{label}</span>
      <textarea value={value} onChange={event => onChange(event.target.value)} rows={3} />
    </label>
  );
}

function SelectSetting<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      <select value={value} onChange={event => onChange(event.target.value as T)}>
        {options.map(option => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function ToggleSetting({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={styles.toggleField}>
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function updateCsvValue(value: string, entry: string, enabled: boolean): string {
  const entries = value.split(',').map(item => item.trim()).filter(Boolean);
  const next = new Set(entries);
  if (enabled) {
    next.add(entry);
  } else {
    next.delete(entry);
  }
  return Array.from(next).join(',');
}

function SettingsDialog({
  draft,
  message,
  saving,
  tools,
  mcpServers,
  onChange,
  onClose,
  onClearToken,
  onSubmit,
}: {
  draft: SettingsDraft;
  message: string;
  saving: boolean;
  tools: Tool[];
  mcpServers: McpServerInfo[];
  onChange: (update: Partial<SettingsDraft>) => void;
  onClose: () => void;
  onClearToken: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const selectedSources = new Set(draft.settingSources.split(',').map(source => source.trim()).filter(Boolean));
  const providerOptions = Object.entries(PROVIDER_DEFAULTS).map(([value, option]) => ({
    value: value as LlmProviderType,
    label: option.label,
  }));

  function changeProvider(provider: LlmProviderType) {
    const providerDefault = getProviderDefault(provider);
    onChange({
      llmProvider: provider,
      baseUrl: providerDefault.baseUrl,
      model: providerDefault.model,
      apiKey: '',
    });
  }

  return (
    <div className={styles.dialogBackdrop} role="presentation">
      <form className={styles.settingsDialog} onSubmit={onSubmit} role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className={styles.dialogHeader}>
          <h2 id="settings-title">Settings</h2>
          <button className={styles.textButton} type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <SettingsSection title="Model">
          <div className={styles.settingsGrid}>
            <SelectSetting
              label="LLM backend"
              value={draft.llmProvider}
              options={providerOptions}
              onChange={changeProvider}
            />
            <TextSetting
              label={draft.llmProvider === 'openai-compatible' ? 'API key (optional)' : 'API key'}
              type="password"
              value={draft.apiKey}
              onChange={value => onChange({ apiKey: value })}
            />
            <TextSetting
              label="Base URL"
              value={draft.baseUrl}
              onChange={value => onChange({ baseUrl: value })}
            />
            <TextSetting
              label="Model"
              value={draft.model}
              onChange={value => onChange({ model: value })}
            />
            <TextSetting label="Fallback model" value={draft.fallbackModel} onChange={value => onChange({ fallbackModel: value })} />
            <SelectSetting
              label="Theme"
              value={draft.theme}
              options={[
                { value: 'system', label: 'System' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
              onChange={value => onChange({ theme: value })}
            />
            <TextSetting
              label="Temperature"
              type="number"
              value={draft.temperature}
              onChange={value => onChange({ temperature: Number(value) })}
            />
            <TextSetting
              label="Max tokens"
              type="number"
              value={draft.maxTokens}
              onChange={value => onChange({ maxTokens: Number(value) })}
            />
            <SelectSetting
              label="Thinking"
              value={draft.thinkingMode}
              options={[
                { value: 'adaptive', label: 'Adaptive' },
                { value: 'enabled', label: 'Enabled' },
                { value: 'disabled', label: 'Disabled' },
              ]}
              onChange={value => onChange({ thinkingMode: value })}
            />
            <SelectSetting
              label="Effort"
              value={draft.effort}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
                { value: 'max', label: 'Max' },
              ]}
              onChange={value => onChange({ effort: value })}
            />
            <TextSetting label="Max thinking tokens" type="number" value={draft.maxThinkingTokens} onChange={value => onChange({ maxThinkingTokens: value })} />
            <TextSetting label="Max turns" type="number" value={draft.maxTurns} onChange={value => onChange({ maxTurns: value })} />
            <TextSetting label="Max budget USD" type="number" value={draft.maxBudgetUsd} onChange={value => onChange({ maxBudgetUsd: value })} />
            <TextSetting label="Task budget" type="number" value={draft.taskBudget} onChange={value => onChange({ taskBudget: value })} />
            <TextSetting label="Workload" value={draft.workload} onChange={value => onChange({ workload: value })} />
            <TextSetting label="Beta headers" value={draft.betas} onChange={value => onChange({ betas: value })} />
          </div>
        </SettingsSection>

        <SettingsSection title="Output And Debug">
          <div className={styles.settingsGrid}>
            <SelectSetting
              label="Output format"
              value={draft.outputFormat}
              options={[
                { value: 'text', label: 'Text' },
                { value: 'json', label: 'JSON' },
                { value: 'stream-json', label: 'Stream JSON' },
              ]}
              onChange={value => onChange({ outputFormat: value })}
            />
            <SelectSetting
              label="Input format"
              value={draft.inputFormat}
              options={[
                { value: 'text', label: 'Text' },
                { value: 'stream-json', label: 'Stream JSON' },
              ]}
              onChange={value => onChange({ inputFormat: value })}
            />
            <TextSetting label="Debug filter" value={draft.debugFilter} onChange={value => onChange({ debugFilter: value })} />
            <TextSetting label="Debug file" value={draft.debugFile} onChange={value => onChange({ debugFile: value })} />
            <TextAreaSetting label="JSON schema" value={draft.jsonSchema} onChange={value => onChange({ jsonSchema: value })} className={styles.fieldWide} />
          </div>
          <div className={styles.toggleGrid}>
            <ToggleSetting label="Print mode" checked={draft.printMode} onChange={checked => onChange({ printMode: checked })} />
            <ToggleSetting label="Include hook events" checked={draft.includeHookEvents} onChange={checked => onChange({ includeHookEvents: checked })} />
            <ToggleSetting label="Include partial messages" checked={draft.includePartialMessages} onChange={checked => onChange({ includePartialMessages: checked })} />
            <ToggleSetting label="Replay user messages" checked={draft.replayUserMessages} onChange={checked => onChange({ replayUserMessages: checked })} />
            <ToggleSetting label="Debug" checked={draft.debugEnabled} onChange={checked => onChange({ debugEnabled: checked })} />
            <ToggleSetting label="Debug to stderr" checked={draft.debugToStderr} onChange={checked => onChange({ debugToStderr: checked })} />
            <ToggleSetting label="Verbose" checked={draft.verbose} onChange={checked => onChange({ verbose: checked })} />
            <ToggleSetting label="MCP debug" checked={draft.mcpDebug} onChange={checked => onChange({ mcpDebug: checked })} />
            <ToggleSetting label="Bare mode" checked={draft.bareMode} onChange={checked => onChange({ bareMode: checked })} />
          </div>
        </SettingsSection>

        <SettingsSection title="Tools And Permissions">
          <div className={styles.settingsGrid}>
            <SelectSetting
              label="Startup mode"
              value={draft.startupMode}
              options={[
                { value: 'none', label: 'None' },
                { value: 'init', label: 'Init' },
                { value: 'init-only', label: 'Init only' },
                { value: 'maintenance', label: 'Maintenance' },
              ]}
              onChange={value => onChange({ startupMode: value })}
            />
            <label className={styles.field}>
              <span>Permission mode</span>
              <select value={draft.permissionMode} onChange={event => onChange({ permissionMode: event.target.value })}>
                {PERMISSION_MODES.map(mode => (
                  <option value={mode} key={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </label>
            <TextSetting label="Permission prompt tool" value={draft.permissionPromptTool} onChange={value => onChange({ permissionPromptTool: value })} />
            <TextSetting label="Agent" value={draft.agent} onChange={value => onChange({ agent: value })} />
            <TextAreaSetting label="Allowed tools" value={draft.allowedTools} onChange={value => onChange({ allowedTools: value })} />
            <TextAreaSetting label="Selected tools" value={draft.selectedTools} onChange={value => onChange({ selectedTools: value })} />
            <TextAreaSetting label="Disallowed tools" value={draft.disallowedTools} onChange={value => onChange({ disallowedTools: value })} />
          </div>
          <div className={styles.toggleGrid}>
            <ToggleSetting label="Memory" checked={draft.memoryEnabled} onChange={checked => onChange({ memoryEnabled: checked })} />
            <ToggleSetting label="Plugins" checked={draft.pluginsEnabled} onChange={checked => onChange({ pluginsEnabled: checked })} />
            <ToggleSetting label="Disable slash commands" checked={draft.disableSlashCommands} onChange={checked => onChange({ disableSlashCommands: checked })} />
            <ToggleSetting label="Skip permissions" checked={draft.dangerouslySkipPermissions} onChange={checked => onChange({ dangerouslySkipPermissions: checked })} />
            <ToggleSetting label="Allow skip permissions" checked={draft.allowDangerouslySkipPermissions} onChange={checked => onChange({ allowDangerouslySkipPermissions: checked })} />
          </div>
        </SettingsSection>

        <SettingsSection title="Workspace Context">
          <div className={styles.settingsGrid}>
            <TextAreaSetting label="System prompt" value={draft.systemPrompt} onChange={value => onChange({ systemPrompt: value })} />
            <TextAreaSetting label="Append system prompt" value={draft.appendSystemPrompt} onChange={value => onChange({ appendSystemPrompt: value })} />
            <TextSetting label="System prompt file" value={draft.systemPromptFile} onChange={value => onChange({ systemPromptFile: value })} />
            <TextSetting label="Append prompt file" value={draft.appendSystemPromptFile} onChange={value => onChange({ appendSystemPromptFile: value })} />
            <TextAreaSetting label="MCP config" value={draft.mcpConfig} onChange={value => onChange({ mcpConfig: value })} />
            <TextSetting label="Settings file or JSON" value={draft.settingsSource} onChange={value => onChange({ settingsSource: value })} />
            <TextAreaSetting label="Additional directories" value={draft.addDirs} onChange={value => onChange({ addDirs: value })} />
            <TextAreaSetting label="Plugin directories" value={draft.pluginDirs} onChange={value => onChange({ pluginDirs: value })} />
            <TextAreaSetting label="Agents JSON" value={draft.agentsJson} onChange={value => onChange({ agentsJson: value })} className={styles.fieldWide} />
          </div>
          <div className={styles.checkboxGroup}>
            {SETTING_SOURCE_OPTIONS.map(source => (
              <ToggleSetting
                key={source}
                label={`${source} settings`}
                checked={selectedSources.has(source)}
                onChange={checked => onChange({ settingSources: updateCsvValue(draft.settingSources, source, checked) })}
              />
            ))}
            <ToggleSetting label="Strict MCP config" checked={draft.strictMcpConfig} onChange={checked => onChange({ strictMcpConfig: checked })} />
          </div>
        </SettingsSection>

        <SettingsSection title="Sessions And Integrations">
          <div className={styles.settingsGrid}>
            <TextSetting label="Resume session" value={draft.resumeSession} onChange={value => onChange({ resumeSession: value })} />
            <TextSetting label="From PR" value={draft.fromPr} onChange={value => onChange({ fromPr: value })} />
            <TextSetting label="Resume at message" value={draft.resumeSessionAt} onChange={value => onChange({ resumeSessionAt: value })} />
            <TextSetting label="Rewind files message" value={draft.rewindFilesMessageId} onChange={value => onChange({ rewindFilesMessageId: value })} />
            <TextSetting label="Session ID" value={draft.sessionId} onChange={value => onChange({ sessionId: value })} />
            <TextSetting label="Session name" value={draft.sessionName} onChange={value => onChange({ sessionName: value })} />
            <TextSetting label="Prefill" value={draft.prefill} onChange={value => onChange({ prefill: value })} />
            <TextSetting label="Deep link repo" value={draft.deepLinkRepo} onChange={value => onChange({ deepLinkRepo: value })} />
            <TextSetting label="Deep link fetch ms" type="number" value={draft.deepLinkLastFetch} onChange={value => onChange({ deepLinkLastFetch: value })} />
            <TextSetting label="Worktree" value={draft.worktree} onChange={value => onChange({ worktree: value })} />
            <SelectSetting
              label="Tmux"
              value={draft.tmuxMode}
              options={[
                { value: 'off', label: 'Off' },
                { value: 'default', label: 'Default' },
                { value: 'classic', label: 'Classic' },
              ]}
              onChange={value => onChange({ tmuxMode: value })}
            />
            <SelectSetting
              label="Chrome"
              value={draft.chromeIntegration}
              options={[
                { value: 'default', label: 'Default' },
                { value: 'enabled', label: 'Enabled' },
                { value: 'disabled', label: 'Disabled' },
              ]}
              onChange={value => onChange({ chromeIntegration: value })}
            />
            <TextSetting label="Advisor model" value={draft.advisorModel} onChange={value => onChange({ advisorModel: value })} />
            <TextAreaSetting label="File specs" value={draft.fileSpecs} onChange={value => onChange({ fileSpecs: value })} className={styles.fieldWide} />
          </div>
          <div className={styles.toggleGrid}>
            <ToggleSetting label="Continue latest" checked={draft.continueSession} onChange={checked => onChange({ continueSession: checked })} />
            <ToggleSetting label="Fork session" checked={draft.forkSession} onChange={checked => onChange({ forkSession: checked })} />
            <ToggleSetting label="No session persistence" checked={draft.noSessionPersistence} onChange={checked => onChange({ noSessionPersistence: checked })} />
            <ToggleSetting label="Deep link origin" checked={draft.deepLinkOrigin} onChange={checked => onChange({ deepLinkOrigin: checked })} />
            <ToggleSetting label="IDE auto-connect" checked={draft.ideAutoConnect} onChange={checked => onChange({ ideAutoConnect: checked })} />
            <ToggleSetting label="Auto-update" checked={draft.autoUpdate} onChange={checked => onChange({ autoUpdate: checked })} />
            <ToggleSetting label="Proactive" checked={draft.proactive} onChange={checked => onChange({ proactive: checked })} />
          </div>
        </SettingsSection>

        <SettingsSection title="Advanced Compatibility">
          <div className={styles.settingsGrid}>
            <TextSetting label="Messaging socket path" value={draft.messagingSocketPath} onChange={value => onChange({ messagingSocketPath: value })} />
            <TextAreaSetting label="Channel servers" value={draft.channelServers} onChange={value => onChange({ channelServers: value })} />
            <TextAreaSetting label="Development channels" value={draft.developmentChannelServers} onChange={value => onChange({ developmentChannelServers: value })} />
            <TextSetting label="Agent ID" value={draft.agentId} onChange={value => onChange({ agentId: value })} />
            <TextSetting label="Agent name" value={draft.agentName} onChange={value => onChange({ agentName: value })} />
            <TextSetting label="Team name" value={draft.teamName} onChange={value => onChange({ teamName: value })} />
            <TextSetting label="Agent color" value={draft.agentColor} onChange={value => onChange({ agentColor: value })} />
            <TextSetting label="Parent session ID" value={draft.parentSessionId} onChange={value => onChange({ parentSessionId: value })} />
            <SelectSetting
              label="Teammate mode"
              value={draft.teammateMode}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'tmux', label: 'Tmux' },
                { value: 'in-process', label: 'In process' },
              ]}
              onChange={value => onChange({ teammateMode: value })}
            />
            <TextSetting label="Agent type" value={draft.agentType} onChange={value => onChange({ agentType: value })} />
            <TextSetting label="SDK URL" value={draft.sdkUrl} onChange={value => onChange({ sdkUrl: value })} />
            <TextSetting label="Teleport session" value={draft.teleportSession} onChange={value => onChange({ teleportSession: value })} />
            <TextSetting label="Remote description" value={draft.remoteDescription} onChange={value => onChange({ remoteDescription: value })} />
            <TextSetting label="Remote control name" value={draft.remoteControlName} onChange={value => onChange({ remoteControlName: value })} />
          </div>
          <div className={styles.toggleGrid}>
            <ToggleSetting label="Brief mode" checked={draft.briefMode} onChange={checked => onChange({ briefMode: checked })} />
            <ToggleSetting label="Assistant mode" checked={draft.assistantMode} onChange={checked => onChange({ assistantMode: checked })} />
            <ToggleSetting label="Plan mode required" checked={draft.planModeRequired} onChange={checked => onChange({ planModeRequired: checked })} />
            <ToggleSetting label="Hard fail" checked={draft.hardFail} onChange={checked => onChange({ hardFail: checked })} />
          </div>
        </SettingsSection>

        <div className={styles.settingsSummary}>
          <section>
            <h3>Bridge tools</h3>
            <p>{tools.length}</p>
          </section>
          <section>
            <h3>MCP servers</h3>
            <p>{mcpServers.length}</p>
          </section>
        </div>

        <div className={styles.dialogFooter}>
          <span className={styles.settingsMessage}>{message}</span>
          <div className={styles.dialogActions}>
            <button className={styles.dangerButton} type="button" onClick={onClearToken}>
              Clear auth
            </button>
            <button className={styles.secondaryButton} type="button" onClick={onClose}>
              Cancel
            </button>
            <button className={styles.primaryButton} type="submit" disabled={saving}>
              {saving ? 'Saving' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
