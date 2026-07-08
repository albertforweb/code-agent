/**
 * Service Bridge - API Service
 * Bridges LLM provider operations to IPC channels.
 */

import type {
  AppConfig,
  AuthToken,
  BootstrapData,
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
  content?: string | null;
  tool_call_id?: string;
  tool_calls?: OpenAiToolCall[];
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
  private buildSystemPrompt(): string {
    return `You are CodeAgent, a powerful AI assistant for software development.

You have access to multiple tools and can execute code, analyze files, and help with various programming tasks.

Current workspace root: ${this.workspacePath}

All desktop file tools are scoped to this workspace root. Use workspace-relative paths when calling file tools. When asked for a full file path, combine the workspace root with the relative path that was used. Do not invent generic paths such as /workspace.

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
        return {
          content: message.content ?? '',
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
      await this.appendToolResults(messages, toolCalls, toolSet);
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
      await this.appendToolResults(messages, result.toolCalls, toolSet);
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
  ): Promise<void> {
    if (!this.toolExecutor) {
      throw new Error('Desktop tool executor is not configured');
    }

    for (const toolCall of toolCalls) {
      const requestedName = toolCall.function.name;
      const toolName = toolSet.nameMap.get(requestedName) ?? requestedName;
      const args = this.parseToolArguments(toolCall.function.arguments);

      try {
        const result = await this.toolExecutor(toolName, args);
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
      { role: 'system', content: this.buildSystemPrompt() },
      ...request.messages.map(message => ({
        role: message.role,
        content: message.content,
      })),
    ];
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
