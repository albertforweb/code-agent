/**
 * Service Bridge - API Service
 * Bridges LLM provider operations to IPC channels.
 */

import type {
  AppConfig,
  AuthToken,
  BootstrapData,
  ChatMessageContent,
  ChatMessageContentPart,
  ChatRequest,
  ChatResponse,
  LlmProviderType,
  Tool,
} from '../types';

type AuthTokenProvider = (provider?: LlmProviderType) => Promise<AuthToken | null>;
type BootstrapProvider = () => Promise<BootstrapData>;
type AppConfigProvider = () => Promise<AppConfig>;
type ToolProvider = () => Promise<Tool[]>;
type ToolExecutor = (toolName: string, args: Record<string, any>) => Promise<any>;
type ChatStreamHandlers = {
  onDelta?: (delta: string) => void;
};

interface LlmRuntimeConfig {
  provider: LlmProviderType;
  baseUrl: string;
  model: string;
  maxTokens: number;
  contextTokens: number;
  temperature?: number;
  apiKey?: string;
  enableTools: boolean;
  maxToolRounds: number;
  disabledTools: Set<string>;
}

interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAiToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

interface OpenAiToolSet {
  tools: OpenAiToolDefinition[];
  nameMap: Map<string, string>;
}

interface OpenAiChatMessage {
  role: string;
  content?: ChatMessageContent | null;
  tool_call_id?: string;
  tool_calls?: OpenAiToolCall[];
}

type ProjectActionPlanAction =
  | {
      type: 'write_file';
      path: string;
      content: string;
      description?: string;
    }
  | {
      type: 'run_command';
      command: string;
      cwd?: string;
      description?: string;
    };

interface ProjectActionPlan {
  summary?: string;
  actions: ProjectActionPlanAction[];
}

const DEFAULT_MODELS: Record<LlmProviderType, string> = {
  openai: 'gpt-4o-mini',
  'openai-compatible': 'local-model',
};

const DEFAULT_BASE_URLS: Record<LlmProviderType, string> = {
  openai: 'https://api.openai.com/v1',
  'openai-compatible': 'http://127.0.0.1:1234/v1',
};

const DEFAULT_CONTEXT_TOKENS: Record<LlmProviderType, number> = {
  openai: 128_000,
  'openai-compatible': 8_192,
};

const DEFAULT_MAX_TOKENS: Record<LlmProviderType, number> = {
  openai: 4096,
  'openai-compatible': 2048,
};

const DEFAULT_MAX_TOOL_ROUNDS = 4;
const MAX_ALLOWED_TOOL_ROUNDS = 16;
const MAX_RECOVERED_PROJECT_ACTIONS = 8;
const MAX_ACTION_RECOVERY_PROMPT_CHARS = 18_000;

/**
 * API Service Bridge - bridges API operations to IPC.
 */
export class ApiServiceBridge {
  private apiClient: any;
  private workspacePath: string;
  private authTokenProvider: AuthTokenProvider | null = null;
  private appConfigProvider: AppConfigProvider | null = null;
  private bootstrapProvider: BootstrapProvider | null = null;
  private toolProvider: ToolProvider | null = null;
  private toolExecutor: ToolExecutor | null = null;
  private bootstrapData: BootstrapData | null = null;
  private bootstrapFetchTime: number = 0;
  private bootstrapCacheTTL: number = 1000 * 60 * 60; // 1 hour

  constructor(apiClient?: any, workspacePath: string = process.cwd()) {
    this.apiClient = apiClient ?? null;
    this.workspacePath = workspacePath;
  }

  /**
   * Send a chat message and get response.
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const config = await this.resolveRuntimeConfig(request);

    try {
      return this.chatOpenAiCompatible(request, config);
    } catch (error) {
      throw new Error(`API Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Send a chat message and stream text deltas while collecting the final response.
   */
  async streamChat(request: ChatRequest, handlers: ChatStreamHandlers = {}): Promise<ChatResponse> {
    const config = await this.resolveRuntimeConfig(request);

    try {
      return this.streamOpenAiCompatible(request, config, handlers);
    } catch (error) {
      throw new Error(`API Stream Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Fetch bootstrap data (user info, features, config).
   */
  async fetchBootstrap(): Promise<BootstrapData> {
    const now = Date.now();
    if (this.bootstrapData && now - this.bootstrapFetchTime < this.bootstrapCacheTTL) {
      return this.bootstrapData;
    }

    try {
      const data = this.bootstrapProvider
        ? await this.bootstrapProvider()
        : await this.buildLocalBootstrapData();

      this.bootstrapData = data;
      this.bootstrapFetchTime = now;

      return data;
    } catch (error) {
      throw new Error(`Bootstrap Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Build system prompt for CodeAgent.
   */
  private buildSystemPrompt(request: ChatRequest): string {
    const toolScope = request.toolScope;
    const activeWorkspacePath = toolScope?.workspacePath || this.workspacePath;
    const projectWorkspaceGuidance = toolScope?.source === 'project-chat'
      ? [
          '',
          'Project workspace context:',
          `- This is a ${toolScope.channel === 'team' ? 'team' : 'guided'} project chat${toolScope.projectName ? ` for "${toolScope.projectName}"` : ''}.`,
          `- The active project workspace root is: ${activeWorkspacePath}`,
          '- Desktop file and command tools are scoped to this project workspace for this request, even if individual tool descriptions mention the app workspace.',
          '- Use workspace-relative paths when reading, writing, or running commands.',
          '- If the human asks you to start, build, implement, create, scaffold, or prototype the project, take concrete workspace actions with tools. Do not only describe code.',
          '- The project workspace may be empty or not exist yet; file writes will create parent directories as needed.',
          '- After creating or changing files, summarize the generated paths so the project Deliverables panel can show them.',
        ].join('\n')
      : '';

    return `You are CodeAgent, a powerful AI assistant for software development.

You have access to multiple tools and can execute code, analyze files, and help with various programming tasks.

Current workspace root: ${activeWorkspacePath}

All desktop file tools are scoped to this workspace root. Use workspace-relative paths when calling file tools. When asked for a full file path, combine the workspace root with the relative path that was used. Do not invent generic paths such as /workspace.
${projectWorkspaceGuidance}

Tool use policy:
- For current time or date questions, use time.now. Do not create scripts or files to answer time/date questions.
- For stock, ETF, index, crypto, or market price questions, use finance.quote first. Answer with the returned price, currency, symbol, exchange, change, and market timestamp when available. Mention that quotes may be delayed and are informational only.
- For current public facts, external documentation, product facts, news, policies, schedules, or other external questions without a structured tool, use web.research. If you use web.search and the snippets do not directly answer the question, continue with web.fetch or web.research before answering. Do not answer with only a list of links unless the user explicitly asks for links.
- If configured MCP tools may be relevant, use mcp.listTools to inspect executable MCP tools, then use mcp.callTool with the reported serverName and toolName. Do not assume an MCP server is executable until it appears in mcp.listTools.
- Use fs.write only when the user explicitly asks to create or modify files.
- Use bash.run for workspace inspection, tests, builds, and simple non-interactive commands. Do not use bash.run for simple time/date or web lookup questions.
- Keep tool calls focused and prefer read-only tools before tools that modify the workspace.

Always be helpful, thorough, and provide clear explanations.`;
  }

  /**
   * Set API client (for dependency injection).
   */
  setApiClient(client: any): void {
    this.apiClient = client;
  }

  setAuthTokenProvider(provider: AuthTokenProvider): void {
    this.authTokenProvider = provider;
    this.apiClient = null;
  }

  setAppConfigProvider(provider: AppConfigProvider): void {
    this.appConfigProvider = provider;
    this.apiClient = null;
    this.clearBootstrapCache();
  }

  setBootstrapProvider(provider: BootstrapProvider): void {
    this.bootstrapProvider = provider;
    this.clearBootstrapCache();
  }

  setWorkspacePath(workspacePath: string): void {
    this.workspacePath = workspacePath;
  }

  setToolProvider(provider: ToolProvider, executor: ToolExecutor): void {
    this.toolProvider = provider;
    this.toolExecutor = executor;
  }

  /**
   * Clear bootstrap cache.
   */
  clearBootstrapCache(): void {
    this.bootstrapData = null;
    this.bootstrapFetchTime = 0;
  }

  /**
   * Check if API is configured.
   */
  isConfigured(): boolean {
    return true;
  }

  /**
   * Get API configuration status.
   */
  getStatus() {
    return {
      configured: this.isConfigured(),
      bootstrapCached: !!this.bootstrapData,
      cacheAge: this.bootstrapData ? Date.now() - this.bootstrapFetchTime : null,
    };
  }

  private async chatOpenAiCompatible(
    request: ChatRequest,
    config: LlmRuntimeConfig,
  ): Promise<ChatResponse> {
    const messages = this.toOpenAiMessages(request);
    const toolSet = await this.getOpenAiToolSet(config);
    let inputTokens = 0;
    let outputTokens = 0;
    let lastModel = config.model;
    let toolExecutionCount = 0;

    for (let round = 0; round <= config.maxToolRounds; round += 1) {
      const response = await fetch(this.getOpenAiChatCompletionsUrl(config.baseUrl), {
        method: 'POST',
        headers: this.getOpenAiHeaders(config),
        body: JSON.stringify(this.buildOpenAiPayload(config, messages, false, toolSet)),
      });

      if (!response.ok) {
        throw new Error(await this.formatOpenAiError(response));
      }

      const data = await response.json() as any;
      const message = data.choices?.[0]?.message ?? {};
      const toolCalls = this.normalizeOpenAiToolCalls(message.tool_calls);
      lastModel = data.model || config.model;
      inputTokens += Number(data.usage?.prompt_tokens ?? 0);
      outputTokens += Number(data.usage?.completion_tokens ?? 0);

      if (!toolCalls.length) {
        const recovery = await this.recoverProjectActionsIfNeeded(
          request,
          config,
          messages,
          message.content ?? '',
          toolSet,
          toolExecutionCount,
        );
        const content = `${message.content ?? ''}${recovery.suffix}`;
        return {
          content,
          model: lastModel,
          usage: { inputTokens, outputTokens },
        };
      }

      if (round === config.maxToolRounds) {
        return {
          content: 'Stopped after reaching the desktop tool-call round limit.',
          model: lastModel,
          usage: { inputTokens, outputTokens },
        };
      }

      messages.push({
        role: 'assistant',
        content: message.content || null,
        tool_calls: toolCalls,
      });
      toolExecutionCount += await this.appendToolResults(messages, toolCalls, toolSet);
    }

    return {
      content: '',
      model: lastModel,
      usage: { inputTokens, outputTokens },
    };
  }

  private async streamOpenAiCompatible(
    request: ChatRequest,
    config: LlmRuntimeConfig,
    handlers: ChatStreamHandlers,
  ): Promise<ChatResponse> {
    const messages = this.toOpenAiMessages(request);
    const toolSet = await this.getOpenAiToolSet(config);
    let content = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let lastModel = config.model;
    let toolExecutionCount = 0;

    for (let round = 0; round <= config.maxToolRounds; round += 1) {
      const response = await fetch(this.getOpenAiChatCompletionsUrl(config.baseUrl), {
        method: 'POST',
        headers: this.getOpenAiHeaders(config),
        body: JSON.stringify(this.buildOpenAiPayload(config, messages, true, toolSet)),
      });

      if (!response.ok) {
        throw new Error(await this.formatOpenAiError(response));
      }

      if (!response.body) {
        throw new Error('Streaming response did not include a response body');
      }

      const result = await this.readOpenAiStream(response, handlers);
      content += result.content;
      inputTokens += result.inputTokens;
      outputTokens += result.outputTokens;
      lastModel = result.model || lastModel;

      if (!result.toolCalls.length) {
        const recovery = await this.recoverProjectActionsIfNeeded(
          request,
          config,
          messages,
          content,
          toolSet,
          toolExecutionCount,
        );
        if (recovery.suffix) {
          content += recovery.suffix;
          handlers.onDelta?.(recovery.suffix);
        }
        return {
          content,
          model: lastModel,
          usage: {
            inputTokens,
            outputTokens,
          },
        };
      }

      if (round === config.maxToolRounds) {
        const limitMessage = '\n\nStopped after reaching the desktop tool-call round limit.';
        content += limitMessage;
        handlers.onDelta?.(limitMessage);
        break;
      }

      messages.push({
        role: 'assistant',
        content: result.assistantContent || null,
        tool_calls: result.toolCalls,
      });
      toolExecutionCount += await this.appendToolResults(messages, result.toolCalls, toolSet);
    }

    return {
      content,
      model: lastModel,
      usage: {
        inputTokens,
        outputTokens,
      },
    };
  }

  private async readOpenAiStream(
    response: Response,
    handlers: ChatStreamHandlers,
  ): Promise<{
    content: string;
    assistantContent: string;
    toolCalls: OpenAiToolCall[];
    inputTokens: number;
    outputTokens: number;
    model?: string;
  }> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const toolCallsByIndex = new Map<number, OpenAiToolCall>();
    let buffer = '';
    let content = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let model: string | undefined;

    const processParsed = (parsed: any | '[DONE]') => {
      if (!parsed || parsed === '[DONE]') {
        return;
      }

      model = parsed.model || model;
      inputTokens = Number(parsed.usage?.prompt_tokens ?? inputTokens);
      outputTokens = Number(parsed.usage?.completion_tokens ?? outputTokens);

      const choice = parsed.choices?.[0];
      const delta = choice?.delta ?? {};
      const textDelta = delta.content ?? '';
      if (textDelta) {
        content += textDelta;
        handlers.onDelta?.(textDelta);
      }

      this.mergeOpenAiToolCallDeltas(toolCallsByIndex, delta.tool_calls);
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        processParsed(this.parseOpenAiStreamLine(line));
      }
    }

    if (buffer.trim()) {
      processParsed(this.parseOpenAiStreamLine(buffer));
    }

    return {
      content,
      assistantContent: content,
      toolCalls: Array.from(toolCallsByIndex.values()).filter(call => call.id && call.function.name),
      inputTokens,
      outputTokens,
      model,
    };
  }

  private async resolveRuntimeConfig(request: ChatRequest): Promise<LlmRuntimeConfig> {
    const appConfig = await this.appConfigProvider?.();
    const provider = this.normalizeProvider(request.provider || appConfig?.llmProvider);
    const token = await this.authTokenProvider?.(provider);
    const baseUrl = request.baseUrl || appConfig?.baseUrl || this.getDefaultBaseUrl(provider);
    const contextTokens = this.resolveContextTokens(provider, request.contextTokens ?? appConfig?.contextTokens);
    const maxTokens = this.resolveMaxTokens(
      provider,
      request.maxTokens ?? appConfig?.maxTokens,
      contextTokens,
    );

    const apiKey = token?.accessToken || this.getEnvironmentApiKey(provider);
    if (provider !== 'openai-compatible' && !apiKey) {
      throw new Error(`API client not initialized: configure an API key for ${this.getProviderLabel(provider)} first`);
    }

    return {
      provider,
      baseUrl,
      model: request.model || appConfig?.model || DEFAULT_MODELS[provider],
      maxTokens,
      contextTokens,
      temperature: request.temperature ?? appConfig?.temperature,
      apiKey,
      enableTools: this.shouldEnableTools(provider, request.enableTools ?? appConfig?.enableLlmTools),
      maxToolRounds: this.resolveMaxToolRounds(request.maxToolRounds ?? appConfig?.maxToolRounds),
      disabledTools: this.normalizeToolNameSet(appConfig?.disabledLlmTools),
    };
  }

  private resolveMaxToolRounds(value: unknown): number {
    const parsed = Number(value ?? DEFAULT_MAX_TOOL_ROUNDS);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return DEFAULT_MAX_TOOL_ROUNDS;
    }

    return Math.min(Math.floor(parsed), MAX_ALLOWED_TOOL_ROUNDS);
  }

  private buildOpenAiPayload(
    config: LlmRuntimeConfig,
    messages: OpenAiChatMessage[],
    stream: boolean,
    toolSet: OpenAiToolSet,
  ): Record<string, any> {
    const payload: Record<string, any> = {
      model: config.model,
      messages,
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      stream,
    };

    if (config.enableTools && toolSet.tools.length > 0) {
      payload.tools = toolSet.tools;
      payload.tool_choice = 'auto';
    }

    return Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== undefined),
    );
  }

  private async getOpenAiToolSet(config: LlmRuntimeConfig): Promise<OpenAiToolSet> {
    if (!config.enableTools || !this.toolProvider) {
      return { tools: [], nameMap: new Map() };
    }

    const nameMap = new Map<string, string>();
    const usedNames = new Set<string>();
    const bridgeTools = (await this.toolProvider())
      .filter(tool => !config.disabledTools.has(tool.name));
    const tools = bridgeTools.map(tool => {
      const safeName = this.toOpenAiToolName(tool.name, usedNames);
      nameMap.set(safeName, tool.name);

      return {
        type: 'function' as const,
        function: {
          name: safeName,
          description: tool.description || `Run ${tool.name}`,
          parameters: this.normalizeToolInputSchema(tool.inputSchema),
        },
      };
    });

    return { tools, nameMap };
  }

  private async appendToolResults(
    messages: OpenAiChatMessage[],
    toolCalls: OpenAiToolCall[],
    toolSet: OpenAiToolSet,
  ): Promise<number> {
    if (!this.toolExecutor) {
      throw new Error('Desktop tool executor is not configured');
    }

    let executedCount = 0;
    for (const toolCall of toolCalls) {
      const requestedName = toolCall.function.name;
      const toolName = toolSet.nameMap.get(requestedName) ?? requestedName;
      const args = this.parseToolArguments(toolCall.function.arguments);

      try {
        const result = await this.toolExecutor(toolName, args);
        executedCount += 1;
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: this.stringifyToolResult(result),
        });
      } catch (error) {
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: this.stringifyToolResult({
            error: error instanceof Error ? error.message : String(error),
          }),
        });
      }
    }

    return executedCount;
  }

  private async recoverProjectActionsIfNeeded(
    request: ChatRequest,
    config: LlmRuntimeConfig,
    messages: OpenAiChatMessage[],
    assistantContent: string,
    toolSet: OpenAiToolSet,
    toolExecutionCount: number,
  ): Promise<{ suffix: string }> {
    if (!this.shouldRecoverProjectActions(request, config, assistantContent, toolSet, toolExecutionCount)) {
      return { suffix: '' };
    }

    try {
      const plan = await this.requestProjectActionPlan(request, config, messages, assistantContent);
      const actions = this.normalizeProjectActionPlan(plan).slice(0, MAX_RECOVERED_PROJECT_ACTIONS);
      if (!actions.length) {
        return {
          suffix: this.hasActionableProjectText(assistantContent)
            ? '\n\nNo executable workspace actions were produced by the action recovery pass.'
            : '',
        };
      }

      const execution = await this.executeProjectActionPlan(actions);
      return { suffix: this.formatProjectActionRecoverySuffix(execution.executed, execution.failed) };
    } catch (error) {
      if (!this.hasActionableProjectText(assistantContent)) {
        return { suffix: '' };
      }

      const message = error instanceof Error ? error.message : String(error);
      return {
        suffix: `\n\nWorkspace action recovery did not run: ${message}`,
      };
    }
  }

  private shouldRecoverProjectActions(
    request: ChatRequest,
    config: LlmRuntimeConfig,
    assistantContent: string,
    toolSet: OpenAiToolSet,
    toolExecutionCount: number,
  ): boolean {
    if (request.toolScope?.source !== 'project-chat' || !config.enableTools || toolExecutionCount > 0 || !this.toolExecutor) {
      return false;
    }

    if (!assistantContent.trim()) {
      return false;
    }

    const availableTools = new Set(Array.from(toolSet.nameMap.values()));
    return availableTools.has('fs.write') && this.hasActionableProjectText(assistantContent);
  }

  private hasActionableProjectText(content: string): boolean {
    const normalized = content.toLowerCase();
    return [
      'mkdir',
      'touch ',
      'create ',
      'write ',
      'file',
      'requirements.txt',
      'package.json',
      'main.py',
      'app.py',
      'index.html',
      '```',
    ].some(marker => normalized.includes(marker));
  }

  private async requestProjectActionPlan(
    request: ChatRequest,
    config: LlmRuntimeConfig,
    messages: OpenAiChatMessage[],
    assistantContent: string,
  ): Promise<ProjectActionPlan> {
    const activeWorkspacePath = request.toolScope?.workspacePath || this.workspacePath;
    const recentMessages = messages
      .slice(-8)
      .map(message => `${message.role.toUpperCase()}:\n${this.chatContentToText(message.content)}`)
      .join('\n\n')
      .slice(-MAX_ACTION_RECOVERY_PROMPT_CHARS);
    const plannerMessages: OpenAiChatMessage[] = [
      {
        role: 'system',
        content: [
          'You are CodeAgent action recovery. Convert a project-chat assistant response into safe workspace actions.',
          'Output only valid JSON. Do not include markdown fences or commentary.',
          'Schema: {"summary":"short summary","actions":[{"type":"write_file","path":"relative/path","content":"file contents","description":"why"},{"type":"run_command","command":"single command","cwd":"relative/path","description":"why"}]}',
          'Prefer write_file actions with real useful starter contents. Do not output empty placeholder files.',
          'Do not include mkdir, cd, or touch actions. Parent directories are created automatically by write_file.',
          'Only use paths relative to the active project workspace. Never use absolute paths, "~", "..", or paths outside the workspace.',
          'Use run_command only when it is necessary after file creation. Commands must be single non-interactive commands without shell operators.',
          `Active project workspace root: ${activeWorkspacePath}`,
          `Maximum actions: ${MAX_RECOVERED_PROJECT_ACTIONS}`,
          'If no workspace mutation is clearly needed, output {"summary":"No action needed","actions":[]}.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          'Recent project-chat context:',
          recentMessages,
          '',
          'Assistant response to convert:',
          assistantContent,
        ].join('\n'),
      },
    ];
    const plannerConfig: LlmRuntimeConfig = {
      ...config,
      enableTools: false,
      maxToolRounds: 0,
      maxTokens: Math.max(2048, Math.min(config.maxTokens, 8192)),
      temperature: 0.1,
    };
    const response = await fetch(this.getOpenAiChatCompletionsUrl(config.baseUrl), {
      method: 'POST',
      headers: this.getOpenAiHeaders(config),
      body: JSON.stringify(this.buildOpenAiPayload(plannerConfig, plannerMessages, false, { tools: [], nameMap: new Map() })),
    });

    if (!response.ok) {
      throw new Error(await this.formatOpenAiError(response));
    }

    const data = await response.json() as any;
    const rawContent = String(data.choices?.[0]?.message?.content ?? '');
    return this.parseProjectActionPlan(rawContent);
  }

  private parseProjectActionPlan(content: string): ProjectActionPlan {
    const stripped = content
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();
    const jsonText = stripped.startsWith('{')
      ? stripped
      : stripped.slice(stripped.indexOf('{'), stripped.lastIndexOf('}') + 1);

    if (!jsonText.trim()) {
      throw new Error('The action recovery model did not return JSON.');
    }

    const parsed = JSON.parse(jsonText) as Partial<ProjectActionPlan>;
    return {
      summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
      actions: Array.isArray(parsed.actions) ? parsed.actions as ProjectActionPlanAction[] : [],
    };
  }

  private normalizeProjectActionPlan(plan: ProjectActionPlan): ProjectActionPlanAction[] {
    return plan.actions
      .map(action => this.normalizeProjectAction(action))
      .filter((action: ProjectActionPlanAction | null): action is ProjectActionPlanAction => Boolean(action));
  }

  private normalizeProjectAction(action: ProjectActionPlanAction): ProjectActionPlanAction | null {
    if (!action || typeof action !== 'object') {
      return null;
    }

    if (action.type === 'write_file') {
      const targetPath = this.normalizeWorkspaceRelativePath(action.path);
      const content = typeof action.content === 'string' ? action.content : '';
      if (!targetPath || !content.trim()) {
        return null;
      }

      return {
        type: 'write_file',
        path: targetPath,
        content,
        description: typeof action.description === 'string' ? action.description : undefined,
      };
    }

    if (action.type === 'run_command') {
      const command = typeof action.command === 'string' ? action.command.trim() : '';
      const cwd = this.normalizeWorkspaceRelativePath(action.cwd || '.');
      if (!command || !cwd) {
        return null;
      }

      return {
        type: 'run_command',
        command,
        cwd,
        description: typeof action.description === 'string' ? action.description : undefined,
      };
    }

    return null;
  }

  private normalizeWorkspaceRelativePath(value: unknown): string | null {
    const rawPath = typeof value === 'string' && value.trim() ? value.trim() : '.';
    if (rawPath === '~' || rawPath.startsWith('~/') || rawPath.startsWith('/')) {
      return null;
    }

    const normalized = rawPath.replace(/\\/g, '/').replace(/^\.\/+/, '') || '.';
    if (normalized.split('/').some(part => part === '..')) {
      return null;
    }

    return normalized;
  }

  private async executeProjectActionPlan(
    actions: ProjectActionPlanAction[],
  ): Promise<{
    executed: string[];
    failed: string[];
  }> {
    if (!this.toolExecutor) {
      throw new Error('Desktop tool executor is not configured.');
    }

    const executed: string[] = [];
    const failed: string[] = [];

    for (const action of actions) {
      try {
        if (action.type === 'write_file') {
          await this.toolExecutor('fs.write', {
            path: action.path,
            content: action.content,
          });
          executed.push(`wrote ${action.path}`);
        } else {
          await this.toolExecutor('bash.run', {
            command: action.command,
            cwd: action.cwd || '.',
          });
          executed.push(`ran ${action.command}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failed.push(`${action.type === 'write_file' ? action.path : action.command}: ${message}`);
      }
    }

    return { executed, failed };
  }

  private formatProjectActionRecoverySuffix(executed: string[], failed: string[]): string {
    const lines: string[] = [];
    if (executed.length > 0) {
      lines.push('', 'Workspace actions executed:');
      for (const item of executed) {
        lines.push(`- ${item}`);
      }
    }

    if (failed.length > 0) {
      lines.push('', 'Workspace actions that need attention:');
      for (const item of failed) {
        lines.push(`- ${item}`);
      }
    }

    return lines.length > 0 ? `\n${lines.join('\n')}` : '';
  }

  private normalizeOpenAiToolCalls(value: unknown): OpenAiToolCall[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter(call => call?.function?.name)
      .map(call => ({
        id: String(call.id || `tool-call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
        type: 'function' as const,
        function: {
          name: String(call.function.name),
          arguments: typeof call.function.arguments === 'string' ? call.function.arguments : '{}',
        },
      }));
  }

  private mergeOpenAiToolCallDeltas(
    toolCallsByIndex: Map<number, OpenAiToolCall>,
    deltas: unknown,
  ): void {
    if (!Array.isArray(deltas)) {
      return;
    }

    for (const delta of deltas) {
      const index = Number(delta?.index ?? toolCallsByIndex.size);
      const current = toolCallsByIndex.get(index) ?? {
        id: '',
        type: 'function' as const,
        function: {
          name: '',
          arguments: '',
        },
      };

      if (delta.id) {
        current.id = String(delta.id);
      }

      if (delta.function?.name) {
        current.function.name += String(delta.function.name);
      }

      if (delta.function?.arguments) {
        current.function.arguments += String(delta.function.arguments);
      }

      toolCallsByIndex.set(index, current);
    }
  }

  private parseToolArguments(rawArguments: string): Record<string, any> {
    if (!rawArguments.trim()) {
      return {};
    }

    try {
      const parsed = JSON.parse(rawArguments);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Fall through to a raw argument payload for models that stream malformed JSON.
    }

    return { input: rawArguments };
  }

  private stringifyToolResult(result: unknown): string {
    if (result === undefined) {
      return JSON.stringify({ ok: true });
    }

    if (result === null) {
      return 'null';
    }

    if (typeof result === 'string') {
      return result;
    }

    try {
      return JSON.stringify(result) ?? String(result);
    } catch {
      return String(result);
    }
  }

  private toOpenAiToolName(name: string, usedNames: Set<string>): string {
    const baseName = name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'tool';
    let safeName = baseName;
    let suffix = 2;

    while (usedNames.has(safeName)) {
      const suffixText = `_${suffix}`;
      safeName = `${baseName.slice(0, Math.max(1, 64 - suffixText.length))}${suffixText}`;
      suffix += 1;
    }

    usedNames.add(safeName);
    return safeName;
  }

  private normalizeToolInputSchema(schema: Record<string, any> | undefined): Record<string, any> {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
      return { type: 'object', properties: {} };
    }

    return schema;
  }

  private normalizeToolNameSet(value: unknown): Set<string> {
    if (Array.isArray(value)) {
      return new Set(value.map(item => String(item).trim()).filter(Boolean));
    }

    if (typeof value === 'string') {
      return new Set(value.split(',').map(item => item.trim()).filter(Boolean));
    }

    return new Set();
  }

  private resolveContextTokens(provider: LlmProviderType, value: unknown): number {
    const parsed = Number(value ?? DEFAULT_CONTEXT_TOKENS[provider]);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return DEFAULT_CONTEXT_TOKENS[provider];
    }

    return Math.floor(parsed);
  }

  private resolveMaxTokens(provider: LlmProviderType, value: unknown, contextTokens: number): number {
    const parsed = Number(value ?? DEFAULT_MAX_TOKENS[provider]);
    const fallback = DEFAULT_MAX_TOKENS[provider];
    const maxTokens = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
    return Math.max(1, Math.min(maxTokens, contextTokens));
  }

  private shouldEnableTools(provider: LlmProviderType, value: unknown): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
    }

    return provider !== 'openai-compatible';
  }

  private toOpenAiMessages(request: ChatRequest): OpenAiChatMessage[] {
    return [
      { role: 'system', content: this.buildSystemPrompt(request) },
      ...request.messages.map(message => ({
        role: message.role,
        content: this.normalizeChatMessageContent(message.content),
      })),
    ];
  }

  private normalizeChatMessageContent(content: ChatMessageContent): ChatMessageContent {
    if (typeof content === 'string') {
      return content;
    }

    if (!Array.isArray(content)) {
      return String(content ?? '');
    }

    const parts = content
      .map(part => this.normalizeChatContentPart(part))
      .filter((part): part is ChatMessageContentPart => Boolean(part));

    return parts.length > 0 ? parts : '';
  }

  private normalizeChatContentPart(part: unknown): ChatMessageContentPart | null {
    if (!part || typeof part !== 'object') {
      return null;
    }

    const raw = part as Partial<ChatMessageContentPart>;
    if (raw.type === 'text') {
      const text = typeof raw.text === 'string' ? raw.text : '';
      return text ? { type: 'text', text } : null;
    }

    if (raw.type === 'image_url') {
      const imageUrl = (raw as { image_url?: { url?: unknown; detail?: unknown } }).image_url;
      const url = typeof imageUrl?.url === 'string' ? imageUrl.url : '';
      if (!url) {
        return null;
      }
      const detail = imageUrl?.detail === 'low' || imageUrl?.detail === 'high' || imageUrl?.detail === 'auto'
        ? imageUrl.detail
        : 'auto';
      return {
        type: 'image_url',
        image_url: {
          url,
          detail,
        },
      };
    }

    return null;
  }

  private chatContentToText(content: ChatMessageContent | null | undefined): string {
    if (!content) {
      return '';
    }
    if (typeof content === 'string') {
      return content;
    }
    if (!Array.isArray(content)) {
      return String(content);
    }

    return content
      .map(part => {
        if (part.type === 'text') {
          return part.text;
        }
        if (part.type === 'image_url') {
          return '[attached image]';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n\n');
  }

  private getOpenAiHeaders(config: LlmRuntimeConfig): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.apiKey) {
      headers.Authorization = `Bearer ${config.apiKey}`;
    }

    return headers;
  }

  private getOpenAiChatCompletionsUrl(baseUrl: string): string {
    const normalizedBaseUrl = baseUrl || DEFAULT_BASE_URLS['openai-compatible'];
    if (normalizedBaseUrl.endsWith('/chat/completions')) {
      return normalizedBaseUrl;
    }

    return `${normalizedBaseUrl.replace(/\/+$/, '')}/chat/completions`;
  }

  private parseOpenAiStreamLine(line: string): any | '[DONE]' | null {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(':')) {
      return null;
    }

    const payload = trimmed.startsWith('data:')
      ? trimmed.slice('data:'.length).trim()
      : trimmed;

    if (!payload || payload === '[DONE]') {
      return payload === '[DONE]' ? '[DONE]' : null;
    }

    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  }

  private async formatOpenAiError(response: Response): Promise<string> {
    return this.formatProviderError(response);
  }

  private async formatProviderError(response: Response): Promise<string> {
    const text = await response.text();
    if (!text) {
      return `${response.status} ${response.statusText}`;
    }

    try {
      const data = JSON.parse(text);
      return data.error?.message || text;
    } catch {
      return text;
    }
  }

  private getDefaultBaseUrl(provider: LlmProviderType): string {
    if (provider === 'openai-compatible') {
      return process.env.OPENAI_COMPATIBLE_BASE_URL ||
        DEFAULT_BASE_URLS[provider];
    }

    return DEFAULT_BASE_URLS[provider];
  }

  private getEnvironmentApiKey(provider: LlmProviderType): string | undefined {
    if (provider === 'openai') {
      return process.env.OPENAI_API_KEY;
    }

    return process.env.OPENAI_COMPATIBLE_API_KEY;
  }

  private getProviderLabel(provider: LlmProviderType): string {
    if (provider === 'openai-compatible') {
      return 'OpenAI-compatible';
    }

    return 'OpenAI';
  }

  private async buildLocalBootstrapData(): Promise<BootstrapData> {
    const config = await this.appConfigProvider?.();
    const provider = this.normalizeProvider(config?.llmProvider);
    const token = await this.authTokenProvider?.(provider);

    return {
      user: {
        authenticated: provider === 'openai-compatible' || Boolean(token?.accessToken || this.getEnvironmentApiKey(provider)),
      },
      config: {
        llmProvider: provider,
        baseUrl: config?.baseUrl || this.getDefaultBaseUrl(provider),
        model: config?.model || DEFAULT_MODELS[provider],
        temperature: config?.temperature ?? 0.7,
        maxTokens: config?.maxTokens ?? DEFAULT_MAX_TOKENS[provider],
        contextTokens: config?.contextTokens ?? DEFAULT_CONTEXT_TOKENS[provider],
        enableLlmTools: Boolean(config?.enableLlmTools),
      },
      features: {
        tools: true,
        mcp: true,
        proactive: false,
        buddy: false,
      },
    };
  }

  private normalizeProvider(value: unknown): LlmProviderType {
    return value === 'openai' ? 'openai' : 'openai-compatible';
  }
}
