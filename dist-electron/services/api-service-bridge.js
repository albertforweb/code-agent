"use strict";
/**
 * Service Bridge - API Service
 * Bridges LLM provider operations to IPC channels.
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
exports.ApiServiceBridge = void 0;
const path = __importStar(require("node:path"));
const FINISH_PROJECT_TURN = 'codeagent.finish_project_turn';
const DEFAULT_MODELS = {
    codeagent: 'Qwen/Qwen3-4B-GGUF',
    openai: 'gpt-4o-mini',
    'openai-compatible': 'local-model',
};
const DEFAULT_BASE_URLS = {
    codeagent: 'http://127.0.0.1:14321/v1',
    openai: 'https://api.openai.com/v1',
    'openai-compatible': 'http://127.0.0.1:1234/v1',
};
const DEFAULT_CONTEXT_TOKENS = {
    codeagent: 8192,
    openai: 128000,
    'openai-compatible': 8192,
};
const DEFAULT_MAX_TOKENS = {
    codeagent: 2048,
    openai: 4096,
    'openai-compatible': 2048,
};
const DEFAULT_MAX_TOOL_ROUNDS = 4;
const MAX_ALLOWED_TOOL_ROUNDS = 16;
const LEGACY_LIGHTWEIGHT_MODEL = 'Qwen/Qwen2.5-Coder-0.5B-Instruct-GGUF';
const SEARCH_TOOLS = '__codeagent.search-tools';
const IMMEDIATE_TOOL_NAMES = new Set([
    'time.now',
    'web.research',
    'finance.quote',
    'bash.run',
    'fs.read',
    'fs.write',
    'fs.list',
]);
/**
 * API Service Bridge - bridges API operations to IPC.
 */
class ApiServiceBridge {
    constructor(apiClient, workspacePath = process.cwd()) {
        this.authTokenProvider = null;
        this.appConfigProvider = null;
        this.bootstrapProvider = null;
        this.toolProvider = null;
        this.toolExecutor = null;
        this.bootstrapData = null;
        this.bootstrapFetchTime = 0;
        this.bootstrapCacheTTL = 1000 * 60 * 60; // 1 hour
        this.apiClient = apiClient ?? null;
        this.workspacePath = workspacePath;
    }
    /**
     * Send a chat message and get response.
     */
    async chat(request) {
        const config = await this.resolveRuntimeConfig(request);
        try {
            return this.chatOpenAiCompatible(request, config);
        }
        catch (error) {
            throw new Error(`API Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Send a chat message and stream text deltas while collecting the final response.
     */
    async streamChat(request, handlers = {}) {
        const startedAt = Date.now();
        const config = await this.resolveRuntimeConfig(request);
        const runtimeConfigMs = Date.now() - startedAt;
        try {
            return this.streamOpenAiCompatible(request, config, handlers, startedAt, runtimeConfigMs);
        }
        catch (error) {
            throw new Error(`API Stream Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Fetch bootstrap data (user info, features, config).
     */
    async fetchBootstrap() {
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
        }
        catch (error) {
            throw new Error(`Bootstrap Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * Build system prompt for CodeAgent.
     */
    buildSystemPrompt(request) {
        const toolScope = request.toolScope;
        const activeWorkspacePath = toolScope?.workspacePath || this.workspacePath;
        const permissionProfile = request.permissionProfile ?? 'workspace-only';
        const permissionGuidance = {
            'workspace-only': 'File and command access is limited to the active workspace. External paths are blocked.',
            ask: 'File and command access defaults to the active workspace. External paths may be used only after the desktop asks for and receives approval.',
            'trusted-workspace': 'The active workspace is trusted for supported file and command operations without repeated CodeAgent reviews. External paths are blocked.',
            'full-access': 'Full computer access is enabled. Supported tools may access any path allowed to the current operating-system user without CodeAgent approval prompts.',
        }[permissionProfile];
        const projectWorkspaceGuidance = toolScope?.source === 'project-chat'
            ? [
                '',
                'Project workspace context:',
                `- This is a ${toolScope.channel === 'team' ? 'team' : 'guided'} project chat${toolScope.projectName ? ` for "${toolScope.projectName}"` : ''}.`,
                `- The active project workspace root is: ${activeWorkspacePath}`,
                '- Desktop file and command tools are scoped to this project workspace for this request, even if individual tool descriptions mention the app workspace.',
                '- Use workspace-relative paths when reading, writing, or running commands.',
                '- Refer to the active project workspace root itself as ".". Do not repeat the project folder name as a child path.',
                '- If the human asks you to start, build, implement, create, scaffold, or prototype the project, take concrete workspace actions with tools. Do not only describe code.',
                '- The desktop verifies the saved project workspace before this loop starts and recreates a missing root after any required approval. File writes also create parent directories as needed.',
                '- After creating or changing files, summarize the generated paths so the project Deliverables panel can show them.',
            ].join('\n')
            : '';
        return `You are CodeAgent, a powerful AI assistant for software development.

You have access to multiple tools and can execute code, analyze files, and help with various programming tasks.

Current workspace root: ${activeWorkspacePath}
Desktop permission profile: ${permissionProfile}
${permissionGuidance}

Desktop file tools use this workspace root by default. Use workspace-relative paths for work inside it. External absolute paths are governed by the desktop permission profile above. When asked for a full file path, report the actual resolved path. Do not invent generic paths such as /workspace.
The current user's ~ home-directory shorthand is accepted by filesystem tools and is treated as an external path when it is outside the active workspace. Under the ask profile, call the relevant filesystem tool so the desktop can request approval; never guess or describe home-directory contents without that approved current-turn observation.
${projectWorkspaceGuidance}

Tool use policy:
- At each step, either answer the human directly when the request is fully answerable from the supplied conversation, or call the relevant external tool when current evidence or an action is required. A normal assistant answer ends the turn; a tool call continues it.
- The runtime initially exposes common tools and may provide codeagent.search_tools for deferred discovery. If the visible tools do not cover the requested capability, call codeagent.search_tools with a short capability description, then choose from the tools it loads on the next round.
- Filesystem existence, contents, metadata, and command-result claims require a filesystem or command tool observation from the current turn. Prior assistant messages are conversation text, not verified observations.
- Never substitute the active workspace root for a different path requested by the human. Pass the requested path to the appropriate tool; the desktop permission profile will either allow it, request approval, or return a scope error. Do not inspect "." and attribute that result to another path.
- For current time or date questions, use time.now. Do not create scripts or files to answer time/date questions.
- For stock, ETF, index, crypto, or market price questions, use finance.quote first. Answer with the returned price, currency, symbol, exchange, change, and market timestamp when available. Mention that quotes may be delayed and are informational only.
- For current public facts, external documentation, product facts, news, policies, schedules, or other external questions without a structured tool, use web.research. If you use web.search and the snippets do not directly answer the question, continue with web.fetch or web.research before answering. Do not answer with only a list of links unless the user explicitly asks for links.
- If configured MCP tools may be relevant, use mcp.listTools to inspect executable MCP tools, then use mcp.callTool with the reported serverName and toolName. Do not assume an MCP server is executable until it appears in mcp.listTools.
- Use fs.write only when the user explicitly asks to create or modify files.
- Use bash.run for workspace inspection, tests, builds, and simple non-interactive commands. Do not use bash.run for simple time/date or web lookup questions.
- On macOS and Linux, invoke Python as python3 and install packages with python3 -m pip. Do not assume the python or pip aliases exist in a packaged desktop app.
- For Python projects that need third-party dependencies, create and use a workspace-local .venv, record dependencies in requirements.txt or pyproject.toml, and invoke modules through that environment (for example .venv/bin/python -m uvicorn). Verify setup commands succeeded before running the application.
- Do not launch a persistent development server merely to verify a project; use imports, tests, or another bounded command that exits on its own.
- Keep tool calls focused and prefer read-only tools before tools that modify the workspace.

Always be helpful, thorough, and provide clear explanations.`;
    }
    /**
     * Set API client (for dependency injection).
     */
    setApiClient(client) {
        this.apiClient = client;
    }
    setAuthTokenProvider(provider) {
        this.authTokenProvider = provider;
        this.apiClient = null;
    }
    setAppConfigProvider(provider) {
        this.appConfigProvider = provider;
        this.apiClient = null;
        this.clearBootstrapCache();
    }
    setBootstrapProvider(provider) {
        this.bootstrapProvider = provider;
        this.clearBootstrapCache();
    }
    setWorkspacePath(workspacePath) {
        this.workspacePath = workspacePath;
    }
    setToolProvider(provider, executor) {
        this.toolProvider = provider;
        this.toolExecutor = executor;
    }
    /**
     * Clear bootstrap cache.
     */
    clearBootstrapCache() {
        this.bootstrapData = null;
        this.bootstrapFetchTime = 0;
    }
    /**
     * Check if API is configured.
     */
    isConfigured() {
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
    async chatOpenAiCompatible(request, config) {
        const scopeViolation = this.getProjectScopeViolation(request);
        if (scopeViolation) {
            return {
                content: this.formatProjectScopeViolation(scopeViolation.requestedPath, scopeViolation.workspacePath),
                model: config.model,
                usage: { inputTokens: 0, outputTokens: 0 },
            };
        }
        const messages = this.toOpenAiMessages(request);
        const toolSet = await this.getOpenAiToolSet(config);
        let inputTokens = 0;
        let outputTokens = 0;
        let lastModel = config.model;
        const planning = await this.runModelToolLoop(config, messages, toolSet, request.structuredAgentLoop === true);
        inputTokens += planning.inputTokens;
        outputTokens += planning.outputTokens;
        lastModel = planning.model || lastModel;
        if (this.shouldRenderVerifiedToolResults(config, messages)) {
            return {
                content: this.resolveGroundedAnswer('', messages),
                model: lastModel,
                usage: { inputTokens, outputTokens },
            };
        }
        if (planning.content !== undefined) {
            return {
                content: this.resolveGroundedAnswer(planning.content, messages),
                model: lastModel,
                usage: { inputTokens, outputTokens },
            };
        }
        const answerMessages = this.buildGroundedAnswerMessages(messages);
        const response = await fetch(this.getOpenAiChatCompletionsUrl(config.baseUrl), {
            method: 'POST',
            headers: this.getOpenAiHeaders(config),
            body: JSON.stringify(this.buildOpenAiPayload(config, answerMessages, false, { tools: [], nameMap: new Map(), toolsByName: new Map(), deferredTools: [], usedNames: new Set() })),
        });
        if (!response.ok) {
            throw new Error(await this.formatOpenAiError(response));
        }
        const data = await response.json();
        const message = data.choices?.[0]?.message ?? {};
        inputTokens += Number(data.usage?.prompt_tokens ?? 0);
        outputTokens += Number(data.usage?.completion_tokens ?? 0);
        return {
            content: this.resolveGroundedAnswer(String(message.content ?? ''), messages),
            model: data.model || lastModel,
            usage: { inputTokens, outputTokens },
        };
    }
    async streamOpenAiCompatible(request, config, handlers, startedAt, runtimeConfigMs) {
        let firstTokenAt;
        const observedHandlers = {
            onDelta: delta => {
                if (delta && firstTokenAt === undefined)
                    firstTokenAt = Date.now();
                handlers.onDelta?.(delta);
            },
        };
        const preparationStartedAt = Date.now();
        const scopeViolation = this.getProjectScopeViolation(request);
        if (scopeViolation) {
            const content = this.formatProjectScopeViolation(scopeViolation.requestedPath, scopeViolation.workspacePath);
            observedHandlers.onDelta?.(content);
            const backendMs = Date.now() - startedAt;
            return {
                content,
                model: config.model,
                usage: { inputTokens: 0, outputTokens: 0 },
                performance: {
                    backendMs,
                    firstTokenMs: firstTokenAt === undefined ? undefined : firstTokenAt - startedAt,
                    toolRounds: 0,
                    toolCalls: 0,
                    phases: [{ phase: 'preparation', durationMs: backendMs }],
                },
            };
        }
        const messages = this.toOpenAiMessages(request);
        const toolSet = await this.getOpenAiToolSet(config);
        const preparationMs = runtimeConfigMs + (Date.now() - preparationStartedAt);
        let content = '';
        let inputTokens = 0;
        let outputTokens = 0;
        let lastModel = config.model;
        const planning = await this.runModelToolLoop(config, messages, toolSet, request.structuredAgentLoop === true);
        inputTokens += planning.inputTokens;
        outputTokens += planning.outputTokens;
        lastModel = planning.model || lastModel;
        if (this.shouldRenderVerifiedToolResults(config, messages)) {
            content = this.resolveGroundedAnswer('', messages);
            observedHandlers.onDelta?.(content);
            const backendMs = Date.now() - startedAt;
            return {
                content,
                model: lastModel,
                usage: { inputTokens, outputTokens },
                performance: this.buildPerformanceMetrics(backendMs, firstTokenAt, startedAt, preparationMs, planning),
            };
        }
        if (planning.content !== undefined) {
            content = this.resolveGroundedAnswer(planning.content, messages);
            observedHandlers.onDelta?.(content);
            const backendMs = Date.now() - startedAt;
            return {
                content,
                model: lastModel,
                usage: { inputTokens, outputTokens },
                performance: this.buildPerformanceMetrics(backendMs, firstTokenAt, startedAt, preparationMs, planning),
            };
        }
        const answerMessages = this.buildGroundedAnswerMessages(messages);
        const answerStartedAt = Date.now();
        const response = await fetch(this.getOpenAiChatCompletionsUrl(config.baseUrl), {
            method: 'POST',
            headers: this.getOpenAiHeaders(config),
            body: JSON.stringify(this.buildOpenAiPayload(config, answerMessages, true, { tools: [], nameMap: new Map(), toolsByName: new Map(), deferredTools: [], usedNames: new Set() })),
        });
        if (!response.ok) {
            throw new Error(await this.formatOpenAiError(response));
        }
        if (!response.body) {
            throw new Error('Streaming response did not include a response body');
        }
        const bufferGroundedAnswer = messages.some(message => message.role === 'tool');
        const result = await this.readOpenAiStream(response, bufferGroundedAnswer ? {} : observedHandlers);
        content += this.resolveGroundedAnswer(result.content, messages);
        if (bufferGroundedAnswer) {
            observedHandlers.onDelta?.(content);
        }
        const answerGenerationMs = Date.now() - answerStartedAt;
        inputTokens += result.inputTokens;
        outputTokens += result.outputTokens;
        lastModel = result.model || lastModel;
        const backendMs = Date.now() - startedAt;
        return {
            content,
            model: lastModel,
            usage: {
                inputTokens,
                outputTokens,
            },
            performance: this.buildPerformanceMetrics(backendMs, firstTokenAt, startedAt, preparationMs, planning, answerGenerationMs),
        };
    }
    buildPerformanceMetrics(backendMs, firstTokenAt, startedAt, preparationMs, planning, answerGenerationMs) {
        return {
            backendMs,
            firstTokenMs: firstTokenAt === undefined ? undefined : firstTokenAt - startedAt,
            toolRounds: planning.toolRounds,
            toolCalls: planning.toolCalls,
            phases: [
                { phase: 'preparation', durationMs: preparationMs },
                ...(planning.toolRounds > 0
                    ? [{ phase: 'tool-selection', durationMs: planning.selectionMs, count: planning.toolRounds }]
                    : []),
                ...(planning.toolCalls > 0
                    ? [{ phase: 'tool-execution', durationMs: planning.executionMs, count: planning.toolCalls }]
                    : []),
                ...(answerGenerationMs !== undefined
                    ? [{ phase: 'answer-generation', durationMs: answerGenerationMs }]
                    : []),
            ],
        };
    }
    async readOpenAiStream(response, handlers) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const toolCallsByIndex = new Map();
        let buffer = '';
        let content = '';
        let inputTokens = 0;
        let outputTokens = 0;
        let model;
        const processParsed = (parsed) => {
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
    async resolveRuntimeConfig(request) {
        const appConfig = await this.appConfigProvider?.();
        const provider = this.normalizeProvider(request.provider || appConfig?.llmProvider);
        const token = await this.authTokenProvider?.(provider);
        const baseUrl = request.baseUrl || appConfig?.baseUrl || this.getDefaultBaseUrl(provider);
        const contextTokens = this.resolveContextTokens(provider, request.contextTokens ?? appConfig?.contextTokens);
        const maxTokens = this.resolveMaxTokens(provider, request.maxTokens ?? appConfig?.maxTokens, contextTokens);
        const apiKey = token?.accessToken || this.getEnvironmentApiKey(provider);
        if (provider === 'openai' && !apiKey) {
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
    resolveMaxToolRounds(value) {
        const parsed = Number(value ?? DEFAULT_MAX_TOOL_ROUNDS);
        if (!Number.isFinite(parsed) || parsed < 0) {
            return DEFAULT_MAX_TOOL_ROUNDS;
        }
        return Math.min(Math.floor(parsed), MAX_ALLOWED_TOOL_ROUNDS);
    }
    buildOpenAiPayload(config, messages, stream, toolSet, toolChoice = 'auto', overrides = {}) {
        const payload = {
            model: config.model,
            messages,
            max_tokens: overrides.maxTokens ?? config.maxTokens,
            temperature: overrides.temperature ?? config.temperature,
            stream,
        };
        // Qwen3's thinking mode is valuable for difficult answers but wasteful for
        // the constrained function-selection pass. llama.cpp accepts these template
        // arguments on its OpenAI-compatible endpoint and omits hidden reasoning.
        if (overrides.disableThinking && config.provider === 'codeagent') {
            payload.chat_template_kwargs = { enable_thinking: false };
        }
        if (config.enableTools && toolSet.tools.length > 0) {
            payload.tools = toolSet.tools;
            payload.tool_choice = toolChoice;
        }
        return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
    }
    async getOpenAiToolSet(config) {
        if (!config.enableTools || !this.toolProvider) {
            return { tools: [], nameMap: new Map(), toolsByName: new Map(), deferredTools: [], usedNames: new Set() };
        }
        const nameMap = new Map();
        const usedNames = new Set();
        const bridgeTools = (await this.toolProvider())
            .filter(tool => !config.disabledTools.has(tool.name));
        const toolsByName = new Map(bridgeTools.map(tool => [tool.name, tool]));
        const immediateTools = bridgeTools.filter(tool => IMMEDIATE_TOOL_NAMES.has(tool.name));
        const deferredTools = bridgeTools.filter(tool => !IMMEDIATE_TOOL_NAMES.has(tool.name));
        const tools = [];
        for (const tool of immediateTools) {
            this.addToolDefinition(tools, nameMap, usedNames, tool);
        }
        if (deferredTools.length > 0) {
            const searchName = this.toOpenAiToolName('codeagent.search_tools', usedNames);
            nameMap.set(searchName, SEARCH_TOOLS);
            tools.push({
                type: 'function',
                function: {
                    name: searchName,
                    description: 'Search for additional desktop tools that are not loaded in the current tool set. Use this when the visible tools do not cover the requested operation, including MCP, automation, app configuration, specialized web access, or extension-provided capabilities.',
                    parameters: {
                        type: 'object',
                        properties: {
                            query: {
                                type: 'string',
                                description: 'Describe the capability needed, not the final answer.',
                            },
                            limit: {
                                type: 'integer',
                                minimum: 1,
                                maximum: 8,
                                description: 'Maximum matching tools to load. Defaults to 5.',
                            },
                        },
                        required: ['query'],
                        additionalProperties: false,
                    },
                },
            });
        }
        return { tools, nameMap, toolsByName, deferredTools, usedNames };
    }
    addStructuredProjectFinishTool(toolSet) {
        if (Array.from(toolSet.nameMap.values()).includes(FINISH_PROJECT_TURN))
            return;
        const safeName = this.toOpenAiToolName(FINISH_PROJECT_TURN, toolSet.usedNames);
        toolSet.nameMap.set(safeName, FINISH_PROJECT_TURN);
        toolSet.tools.push({
            type: 'function',
            function: {
                name: safeName,
                description: [
                    'Finish the current project-agent turn with a user-facing response.',
                    'Call this only when no further real tool is needed.',
                    'Set requestRequiresWorkspaceChanges=true when the latest human asks to create, implement, fix, run, continue, or complete project work, OR gives a short confirmation such as "yes", "proceed", or "go ahead" to workspace work proposed in the preceding conversation.',
                    'A plan, promise, explanation of the next step, or inspection of an empty workspace does not complete such a request. The runtime verifies that a mutating tool actually succeeded.',
                ].join(' '),
                parameters: {
                    type: 'object',
                    properties: {
                        requestRequiresWorkspaceChanges: {
                            type: 'boolean',
                            description: 'Whether satisfying the latest human request requires concrete project workspace changes or commands.',
                        },
                        outcome: {
                            type: 'string',
                            enum: ['answered', 'completed', 'blocked'],
                            description: 'answered for information, completed after requested work, blocked only after a real tool or permission failure.',
                        },
                        response: {
                            type: 'string',
                            description: 'The concise final response shown to the human. Never claim work was done unless tool observations prove it.',
                        },
                    },
                    required: ['requestRequiresWorkspaceChanges', 'outcome', 'response'],
                    additionalProperties: false,
                },
            },
        });
    }
    addToolDefinition(tools, nameMap, usedNames, tool) {
        if (Array.from(nameMap.values()).includes(tool.name))
            return;
        const safeName = this.toOpenAiToolName(tool.name, usedNames);
        nameMap.set(safeName, tool.name);
        tools.push({
            type: 'function',
            function: {
                name: safeName,
                description: tool.description || `Run ${tool.name}`,
                parameters: this.normalizeToolInputSchema(tool.inputSchema),
            },
        });
    }
    discoverDeferredTools(toolSet, query, requestedLimit) {
        const limit = Math.min(8, Math.max(1, Math.floor(Number(requestedLimit) || 5)));
        const queryTerms = this.getToolSearchTerms(query);
        const ranked = toolSet.deferredTools
            .map((tool, index) => {
            const namespace = tool.name.split('.')[0];
            const nameTerms = this.getToolSearchTerms(tool.name.replace(/[._-]+/g, ' '));
            const descriptionTerms = this.getToolSearchTerms(tool.description || '');
            const score = Array.from(queryTerms).reduce((total, term) => (total +
                (nameTerms.has(term) ? 8 : 0) +
                (descriptionTerms.has(term) ? 2 : 0) +
                (namespace === term ? 12 : 0)), 0);
            return { tool, score, index };
        })
            .sort((left, right) => right.score - left.score || left.index - right.index);
        const matches = ranked.filter(candidate => candidate.score > 0);
        return (matches.length > 0 ? matches : ranked).slice(0, limit).map(candidate => candidate.tool);
    }
    getToolSearchTerms(value) {
        return new Set(value.toLowerCase().match(/[a-z0-9]+/g) ?? []);
    }
    async requestModelToolDecision(config, messages, toolSet, structuredAgentLoop = false, executionRequired = false) {
        if (!config.enableTools || !this.toolExecutor || toolSet.tools.length === 0) {
            return { toolCalls: [], content: '', inputTokens: 0, outputTokens: 0 };
        }
        const response = await fetch(this.getOpenAiChatCompletionsUrl(config.baseUrl), {
            method: 'POST',
            headers: this.getOpenAiHeaders(config),
            body: JSON.stringify(this.buildOpenAiPayload(config, messages, false, toolSet, structuredAgentLoop ? 'required' : 'auto', {
                maxTokens: Math.min(config.maxTokens, structuredAgentLoop ? (executionRequired ? 1024 : 512) : 256),
                temperature: 0,
                disableThinking: true,
            })),
        });
        if (!response.ok) {
            throw new Error(await this.formatOpenAiError(response));
        }
        const data = await response.json();
        const message = data.choices?.[0]?.message ?? {};
        return {
            toolCalls: this.normalizeModelToolDecision(message),
            content: typeof message.content === 'string' ? message.content : '',
            inputTokens: Number(data.usage?.prompt_tokens ?? 0),
            outputTokens: Number(data.usage?.completion_tokens ?? 0),
            model: data.model || config.model,
        };
    }
    async runModelToolLoop(config, messages, toolSet, structuredAgentLoop = false) {
        // A request without usable tools does not need a separate structured
        // tool-selection pass. Continue directly to the normal answer request.
        if (!config.enableTools || toolSet.tools.length === 0 || !this.toolExecutor) {
            return { inputTokens: 0, outputTokens: 0, selectionMs: 0, executionMs: 0, toolRounds: 0, toolCalls: 0 };
        }
        if (structuredAgentLoop) {
            this.addStructuredProjectFinishTool(toolSet);
            messages.push({
                role: 'system',
                content: [
                    'PROJECT AGENT COMPLETION PROTOCOL:',
                    'For each round, call a real tool or codeagent.finish_project_turn. Do not return unstructured prose.',
                    'If the human requests project work or confirms previously proposed work, take concrete tool actions now.',
                    'Do not call the finish function with a promise such as "I will proceed" or "the next step is".',
                    'Use "." only when a tool expects the active project directory (for example fs.list or bash.run cwd). For fs.write, path must name a file such as "main.py" or "src/app.py"; never pass "." as the file path.',
                    'If the workspace is empty, create the required project files with fs.write or an appropriate write-capable tool.',
                ].join('\n'),
            });
        }
        let inputTokens = 0;
        let outputTokens = 0;
        let model;
        const executedCallSignatures = new Set();
        let madeStructuredDecision = false;
        let producedToolObservation = false;
        let selectionMs = 0;
        let executionMs = 0;
        let toolRounds = 0;
        let toolCalls = 0;
        let recoverableErrorRetryRequested = false;
        let successfulMutations = 0;
        let observedToolFailure = false;
        let executionRequired = false;
        let roundLimit = this.isLimitedStarterModel(config)
            ? Math.min(config.maxToolRounds, 1)
            : config.maxToolRounds;
        for (let round = 0; round < roundLimit; round += 1) {
            const selectionStartedAt = Date.now();
            const decision = await this.requestModelToolDecision(config, messages, toolSet, structuredAgentLoop, executionRequired);
            selectionMs += Date.now() - selectionStartedAt;
            toolRounds += 1;
            inputTokens += decision.inputTokens;
            outputTokens += decision.outputTokens;
            model = decision.model || model;
            if (decision.toolCalls.length === 0) {
                const directAnswer = decision.content.trim();
                if (structuredAgentLoop) {
                    messages.push({
                        role: 'system',
                        content: [
                            'Protocol correction: unstructured prose cannot finish a project-agent turn.',
                            'Call a real tool to perform the work, or call codeagent.finish_project_turn with an accurate structured outcome.',
                        ].join('\n'),
                    });
                    continue;
                }
                if (!recoverableErrorRetryRequested && this.hasRecoverableToolError(messages)) {
                    recoverableErrorRetryRequested = true;
                    messages.push({
                        role: 'system',
                        content: [
                            'The preceding tool call failed with a recoverable path error.',
                            'Do not end the turn by merely reporting that error.',
                            'Correct the tool arguments and try again. In a project chat, use "." for the active project workspace root rather than repeating its folder name.',
                        ].join('\n'),
                    });
                    continue;
                }
                if (directAnswer) {
                    return { inputTokens, outputTokens, model, content: directAnswer, selectionMs, executionMs, toolRounds, toolCalls };
                }
                if (!madeStructuredDecision) {
                    messages.push({
                        role: 'system',
                        content: [
                            'Your preceding output was empty or unusable.',
                            'Answer the latest human request directly, or make a native function call when current evidence or an action is required.',
                        ].join('\n'),
                    });
                    continue;
                }
                break;
            }
            const finishCall = decision.toolCalls.find(candidate => ((toolSet.nameMap.get(candidate.function.name) ?? candidate.function.name) === FINISH_PROJECT_TURN));
            const executableCalls = decision.toolCalls.filter(candidate => ((toolSet.nameMap.get(candidate.function.name) ?? candidate.function.name) !== FINISH_PROJECT_TURN));
            if (structuredAgentLoop && finishCall && executableCalls.length === 0) {
                madeStructuredDecision = true;
                const finish = this.parseToolArguments(finishCall.function.arguments);
                const response = typeof finish.response === 'string' ? finish.response.trim() : '';
                const requiresChanges = finish.requestRequiresWorkspaceChanges === true;
                const outcome = String(finish.outcome ?? '');
                if (!recoverableErrorRetryRequested && this.hasRecoverableToolError(messages)) {
                    recoverableErrorRetryRequested = true;
                    executionRequired = true;
                    messages.push({
                        role: 'system',
                        content: [
                            'The preceding tool failed because its path arguments were recoverably invalid. Do not finish or report this as unavailable tool access.',
                            'Correct the arguments and retry now.',
                            'Use "." for a directory-list root, but fs.write must name a file such as "main.py", "requirements.txt", or "src/app.py". Never use "." as the fs.write path.',
                        ].join('\n'),
                    });
                    continue;
                }
                if (requiresChanges && successfulMutations === 0) {
                    executionRequired = true;
                    messages.push({
                        role: 'system',
                        content: [
                            'Completion rejected: this request requires workspace action, but no mutating tool has succeeded in this turn.',
                            'Do the work now with fs.write, bash.run, or another appropriate write-capable tool. Do not merely restate the plan.',
                        ].join('\n'),
                    });
                    continue;
                }
                if (outcome === 'blocked' && !observedToolFailure) {
                    messages.push({
                        role: 'system',
                        content: 'A blocked outcome requires evidence from an attempted tool or permission failure. Try the appropriate tool now.',
                    });
                    continue;
                }
                if (response) {
                    return { inputTokens, outputTokens, model, content: response, selectionMs, executionMs, toolRounds, toolCalls };
                }
                messages.push({
                    role: 'system',
                    content: 'The finish response was empty. Continue with a real tool or provide a non-empty structured final response.',
                });
                continue;
            }
            if (executableCalls.length === 0) {
                messages.push({
                    role: 'system',
                    content: 'Choose a real tool or provide a valid codeagent.finish_project_turn call.',
                });
                continue;
            }
            const call = executableCalls[0];
            madeStructuredDecision = true;
            const signature = `${call.function.name}:${call.function.arguments}`;
            if (executedCallSignatures.has(signature)) {
                break;
            }
            executedCallSignatures.add(signature);
            messages.push({
                role: 'assistant',
                content: null,
                tool_calls: executableCalls,
            });
            const executionStartedAt = Date.now();
            const execution = await this.appendToolResults(messages, executableCalls, toolSet);
            executionMs += Date.now() - executionStartedAt;
            toolCalls += executableCalls.length;
            successfulMutations += execution.successfulMutations;
            executionRequired || (executionRequired = execution.successfulMutations > 0);
            observedToolFailure || (observedToolFailure = execution.failedCount > 0);
            producedToolObservation = true;
            if (structuredAgentLoop && execution.failedCount > 0 && !recoverableErrorRetryRequested && this.hasRecoverableCommandError(messages)) {
                recoverableErrorRetryRequested = true;
                executionRequired = true;
                messages.push({
                    role: 'system',
                    content: [
                        'The preceding tool failed with a recoverable command, dependency, or path error.',
                        'Inspect the actual error, correct the setup or arguments, and retry now instead of ending the turn.',
                        'For a missing Python command or module, use python3, create a workspace-local .venv when dependencies are required, install the declared dependencies, and run modules through that environment.',
                    ].join('\n'),
                });
                if (round + 1 >= roundLimit && roundLimit < MAX_ALLOWED_TOOL_ROUNDS) {
                    // Dependency recovery commonly needs setup, verification, and a
                    // structured finish response. Preserve those corrective rounds even
                    // when the original action used its normal budget.
                    roundLimit = Math.min(MAX_ALLOWED_TOOL_ROUNDS, roundLimit + 3);
                }
            }
        }
        return {
            inputTokens,
            outputTokens,
            model,
            selectionMs,
            executionMs,
            toolRounds,
            toolCalls,
            content: madeStructuredDecision || producedToolObservation
                ? structuredAgentLoop
                    ? 'I could not complete the requested project action because the model did not produce a valid, verifiable completion after the available agent rounds.'
                    : undefined
                : 'The model did not produce a valid structured tool decision for this turn.',
        };
    }
    isLimitedStarterModel(config) {
        return config.provider === 'codeagent' && config.model === LEGACY_LIGHTWEIGHT_MODEL;
    }
    hasRecoverableToolError(messages) {
        const latestToolMessage = [...messages].reverse().find(message => message.role === 'tool');
        if (!latestToolMessage) {
            return false;
        }
        try {
            const result = JSON.parse(this.chatContentToText(latestToolMessage.content));
            const error = [
                typeof result.error === 'string' ? result.error : '',
                result.ok === false && typeof result.stderr === 'string' ? result.stderr : '',
            ].filter(Boolean).join('\n');
            return /(?:directory|file|executable) not found:|EISDIR|ENOENT|illegal operation on a directory|no module named|not recognized as an internal or external command/i.test(error);
        }
        catch {
            return false;
        }
    }
    hasRecoverableCommandError(messages) {
        const latestToolMessage = [...messages].reverse().find(message => message.role === 'tool');
        if (!latestToolMessage) {
            return false;
        }
        try {
            const result = JSON.parse(this.chatContentToText(latestToolMessage.content));
            const error = [
                typeof result.error === 'string' ? result.error : '',
                result.ok === false && typeof result.stderr === 'string' ? result.stderr : '',
            ].filter(Boolean).join('\n');
            return /executable not found:|ENOENT|no module named|not recognized as an internal or external command/i.test(error);
        }
        catch {
            return false;
        }
    }
    shouldRenderVerifiedToolResults(config, messages) {
        // Only the legacy starter model needs a deterministic rendering fallback.
        // Capable agent models must receive tool observations back through the loop
        // so they can decide whether to call another tool or synthesize the answer.
        // Bypassing on a tool type alone loses the human's intent: an fs.list call
        // may support a directory listing, an implementation assessment, a build,
        // or many other tasks.
        return this.isLimitedStarterModel(config) && messages.some(message => message.role === 'tool');
    }
    buildGroundedAnswerMessages(messages) {
        const callsById = new Map();
        for (const message of messages) {
            for (const call of message.tool_calls ?? []) {
                callsById.set(call.id, call);
            }
        }
        const observations = messages
            .filter(message => message.role === 'tool')
            .map(message => {
            const call = message.tool_call_id ? callsById.get(message.tool_call_id) : undefined;
            return [
                `Tool: ${call?.function.name || 'unknown'}`,
                `Arguments: ${call?.function.arguments || '{}'}`,
                `Result: ${this.chatContentToText(message.content)}`,
            ].join('\n');
        });
        const conversationMessages = messages.filter(message => message.role !== 'tool' && !message.tool_calls?.length);
        const answerPolicy = [
            'The tool-selection and execution stage is complete for this turn.',
            'Answer the latest human request now in plain natural language, grounded only in the conversation and actual tool observations.',
            'Do not emit JSON tool decisions, function calls, or commands for the human to run.',
            'Do not say that you will inspect or perform something later.',
            'Distinguish the existence of a container such as a directory from whether it contains any entries.',
            'A successful directory-list observation with zero entries proves that the directory exists and is empty; a missing or inaccessible directory would produce an error observation.',
            'Attribute a filesystem result only to the exact resolved path reported by the tool. Never describe a different requested path using an observation from the workspace root or another location.',
            'Do not speculate about permissions, failures, or possible causes unless a tool observation explicitly reports them.',
        ].join('\n');
        if (observations.length === 0) {
            return [...conversationMessages, { role: 'system', content: answerPolicy }];
        }
        return [
            ...conversationMessages,
            { role: 'system', content: answerPolicy },
            {
                role: 'user',
                content: [
                    'The agent runtime produced these verified tool observations for my preceding request:',
                    '',
                    observations.join('\n\n'),
                    '',
                    'Answer my preceding request using these observations. Report the observed results directly.',
                ].join('\n'),
            },
        ];
    }
    resolveGroundedAnswer(content, messages) {
        const observations = messages.filter(message => message.role === 'tool');
        const normalized = content.trim();
        const leakedInternalPolicy = normalized.includes('The tool-selection and execution stage is complete for this turn.');
        if (observations.length === 0) {
            return leakedInternalPolicy
                ? 'The model did not produce a usable answer, and no verified tool result was available for this turn.'
                : content;
        }
        const observationErrors = observations.flatMap(message => {
            try {
                const result = JSON.parse(this.chatContentToText(message.content));
                return typeof result.error === 'string' && result.error.trim() ? [result.error.trim()] : [];
            }
            catch {
                return [];
            }
        });
        if (observationErrors.length === observations.length) {
            return [
                'I couldn’t complete that request because the required tool access was not available.',
                '',
                ...observationErrors.map(error => `- ${error}`),
            ].join('\n');
        }
        const emittedToolDecision = this.normalizeModelToolDecision({ content: normalized }).length > 0;
        if (normalized && !leakedInternalPolicy && !emittedToolDecision) {
            return content;
        }
        const directoryListings = observations.map(message => {
            const resultText = this.chatContentToText(message.content);
            try {
                const result = JSON.parse(resultText);
                if (typeof result.absolutePath === 'string' &&
                    typeof result.totalCount === 'number' &&
                    Array.isArray(result.entries)) {
                    return this.formatVerifiedToolResult(resultText);
                }
            }
            catch {
                // Non-directory observations use the generic tool-result presentation below.
            }
            return null;
        });
        if (directoryListings.length > 0 && directoryListings.every(Boolean)) {
            return directoryListings.join('\n\n');
        }
        const callsById = new Map();
        for (const message of messages) {
            for (const call of message.tool_calls ?? []) {
                callsById.set(call.id, call);
            }
        }
        const rendered = observations.map(message => {
            const call = message.tool_call_id ? callsById.get(message.tool_call_id) : undefined;
            const toolName = call?.function.name || 'tool';
            const args = call?.function.arguments || '{}';
            const result = this.formatVerifiedToolResult(this.chatContentToText(message.content));
            return `- **${toolName}** ${args}\n\n  ${result}`;
        });
        return [
            'Verified tool result:',
            '',
            ...rendered,
        ].join('\n');
    }
    formatVerifiedToolResult(content) {
        try {
            const value = JSON.parse(content);
            if (Array.isArray(value)) {
                if (value.length === 0) {
                    return 'No items were returned.';
                }
                return value.map(item => {
                    if (item && typeof item === 'object' && 'name' in item) {
                        const record = item;
                        const suffix = record.type === 'directory' ? '/' : '';
                        return `- ${String(record.name)}${suffix}`;
                    }
                    return `- ${this.stringifyToolResult(item)}`;
                }).join('\n  ');
            }
            if (value && typeof value === 'object') {
                const record = value;
                if (typeof record.absolutePath === 'string' &&
                    typeof record.totalCount === 'number' &&
                    Array.isArray(record.entries)) {
                    const entries = record.entries;
                    const totalCount = Math.max(0, Math.floor(record.totalCount));
                    if (totalCount === 0) {
                        return `\`${record.absolutePath}\` exists and is empty.`;
                    }
                    const lines = entries.map(entry => {
                        const suffix = entry.type === 'directory' ? '/' : '';
                        return `- ${String(entry.name)}${suffix}`;
                    });
                    const omittedCount = typeof record.omittedCount === 'number'
                        ? Math.max(0, Math.floor(record.omittedCount))
                        : Math.max(0, totalCount - entries.length);
                    return [
                        `\`${record.absolutePath}\` exists and contains ${totalCount} top-level entries.`,
                        '',
                        ...lines,
                        ...(omittedCount > 0
                            ? ['', `${omittedCount} additional ${omittedCount === 1 ? 'entry was' : 'entries were'} not included in this page.`]
                            : []),
                    ].join('\n');
                }
            }
            return this.stringifyToolResult(value);
        }
        catch {
            return content;
        }
    }
    normalizeModelToolDecision(message) {
        const nativeCalls = this.normalizeOpenAiToolCalls(message?.tool_calls);
        if (nativeCalls.length > 0) {
            return nativeCalls;
        }
        const content = typeof message?.content === 'string' ? message.content.trim() : '';
        if (!content) {
            return [];
        }
        const jsonObject = this.extractFirstJsonObject(content);
        if (!jsonObject) {
            return [];
        }
        try {
            const decision = JSON.parse(jsonObject);
            if (typeof decision.name !== 'string' || !decision.name.trim()) {
                return [];
            }
            return [{
                    id: `tool-decision-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                    type: 'function',
                    function: {
                        name: decision.name.trim(),
                        arguments: typeof decision.arguments === 'string'
                            ? decision.arguments
                            : JSON.stringify(decision.arguments ?? {}),
                    },
                }];
        }
        catch {
            return [];
        }
    }
    extractFirstJsonObject(content) {
        const start = content.indexOf('{');
        if (start < 0) {
            return null;
        }
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let index = start; index < content.length; index += 1) {
            const character = content[index];
            if (inString) {
                if (escaped) {
                    escaped = false;
                }
                else if (character === '\\') {
                    escaped = true;
                }
                else if (character === '"') {
                    inString = false;
                }
                continue;
            }
            if (character === '"') {
                inString = true;
            }
            else if (character === '{') {
                depth += 1;
            }
            else if (character === '}') {
                depth -= 1;
                if (depth === 0) {
                    return content.slice(start, index + 1);
                }
            }
        }
        return null;
    }
    async appendToolResults(messages, toolCalls, toolSet) {
        if (!this.toolExecutor) {
            throw new Error('Desktop tool executor is not configured');
        }
        let executedCount = 0;
        let successfulMutations = 0;
        let failedCount = 0;
        for (const toolCall of toolCalls) {
            const requestedName = toolCall.function.name;
            const toolName = toolSet.nameMap.get(requestedName) ?? requestedName;
            const args = this.parseToolArguments(toolCall.function.arguments);
            try {
                if (toolName === SEARCH_TOOLS) {
                    const discovered = this.discoverDeferredTools(toolSet, String(args.query ?? ''), args.limit);
                    for (const tool of discovered) {
                        this.addToolDefinition(toolSet.tools, toolSet.nameMap, toolSet.usedNames, tool);
                    }
                    executedCount += 1;
                    messages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: this.stringifyToolResult({
                            query: String(args.query ?? ''),
                            loadedTools: discovered.map(tool => ({
                                name: tool.name,
                                description: tool.description,
                                readOnly: tool.readOnly,
                            })),
                            instruction: discovered.length > 0
                                ? 'The listed tools are now available for the next structured tool-decision round.'
                                : 'No additional tools matched this capability request.',
                        }),
                    });
                    continue;
                }
                const result = await this.toolExecutor(toolName, args);
                executedCount += 1;
                const commandFailed = Boolean(result && typeof result === 'object' && 'ok' in result && result.ok === false);
                if (commandFailed) {
                    failedCount += 1;
                }
                else if (toolSet.toolsByName.get(toolName)?.readOnly === false) {
                    successfulMutations += 1;
                }
                messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: this.stringifyToolResult(result),
                });
            }
            catch (error) {
                failedCount += 1;
                messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: this.stringifyToolResult({
                        error: error instanceof Error ? error.message : String(error),
                    }),
                });
            }
        }
        return { executedCount, successfulMutations, failedCount };
    }
    normalizeOpenAiToolCalls(value) {
        if (!Array.isArray(value)) {
            return [];
        }
        return value
            .filter(call => call?.function?.name)
            .map(call => ({
            id: String(call.id || `tool-call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
            type: 'function',
            function: {
                name: String(call.function.name),
                arguments: typeof call.function.arguments === 'string' ? call.function.arguments : '{}',
            },
        }));
    }
    mergeOpenAiToolCallDeltas(toolCallsByIndex, deltas) {
        if (!Array.isArray(deltas)) {
            return;
        }
        for (const delta of deltas) {
            const index = Number(delta?.index ?? toolCallsByIndex.size);
            const current = toolCallsByIndex.get(index) ?? {
                id: '',
                type: 'function',
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
    parseToolArguments(rawArguments) {
        if (!rawArguments.trim()) {
            return {};
        }
        try {
            const parsed = JSON.parse(rawArguments);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed;
            }
        }
        catch {
            // Fall through to a raw argument payload for models that stream malformed JSON.
        }
        return { input: rawArguments };
    }
    stringifyToolResult(result) {
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
        }
        catch {
            return String(result);
        }
    }
    toOpenAiToolName(name, usedNames) {
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
    normalizeToolInputSchema(schema) {
        if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
            return { type: 'object', properties: {} };
        }
        return schema;
    }
    normalizeToolNameSet(value) {
        if (Array.isArray(value)) {
            return new Set(value.map(item => String(item).trim()).filter(Boolean));
        }
        if (typeof value === 'string') {
            return new Set(value.split(',').map(item => item.trim()).filter(Boolean));
        }
        return new Set();
    }
    resolveContextTokens(provider, value) {
        const parsed = Number(value ?? DEFAULT_CONTEXT_TOKENS[provider]);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return DEFAULT_CONTEXT_TOKENS[provider];
        }
        return Math.floor(parsed);
    }
    resolveMaxTokens(provider, value, contextTokens) {
        const parsed = Number(value ?? DEFAULT_MAX_TOKENS[provider]);
        const fallback = DEFAULT_MAX_TOKENS[provider];
        const maxTokens = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
        return Math.max(1, Math.min(maxTokens, contextTokens));
    }
    shouldEnableTools(provider, value) {
        if (typeof value === 'boolean') {
            return value;
        }
        if (typeof value === 'string') {
            return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
        }
        return provider !== 'openai-compatible';
    }
    getProjectScopeViolation(request) {
        if (request.permissionProfile === 'ask' || request.permissionProfile === 'full-access') {
            return null;
        }
        if (request.toolScope?.source !== 'project-chat' || !request.toolScope.workspacePath) {
            return null;
        }
        const latestUserMessage = [...request.messages].reverse().find(message => message.role === 'user');
        if (!latestUserMessage) {
            return null;
        }
        const workspacePath = path.resolve(request.toolScope.workspacePath);
        const candidates = this.chatContentToText(latestUserMessage.content)
            .match(/\/(?:[^/\s"'`<>|?*]+\/?)+/g) ?? [];
        for (const candidate of candidates) {
            const requestedPath = candidate.replace(/[.,;:!\])}]+$/g, '');
            if (!path.isAbsolute(requestedPath)) {
                continue;
            }
            const resolvedPath = path.resolve(requestedPath);
            const relativePath = path.relative(workspacePath, resolvedPath);
            const outsideWorkspace = relativePath === '..' ||
                relativePath.startsWith(`..${path.sep}`) ||
                path.isAbsolute(relativePath);
            if (outsideWorkspace) {
                return { requestedPath: resolvedPath, workspacePath };
            }
        }
        return null;
    }
    formatProjectScopeViolation(requestedPath, workspacePath) {
        return [
            `I did not inspect \`${requestedPath}\` because it is outside this project chat's authorized workspace, \`${workspacePath}\`.`,
            'I cannot report whether that external directory exists or what it contains from this project context.',
            'Open that directory as the project workspace, or explicitly add it as an authorized workspace directory, before asking me to inspect it.',
        ].join(' ');
    }
    toOpenAiMessages(request) {
        const conversation = request.messages.map(message => ({
            role: message.role,
            content: this.normalizeChatMessageContent(message.content),
        }));
        let latestUserIndex = -1;
        for (let index = conversation.length - 1; index >= 0; index -= 1) {
            if (conversation[index].role === 'user') {
                latestUserIndex = index;
                break;
            }
        }
        const currentWorkspacePath = request.toolScope?.workspacePath || this.workspacePath;
        const currentTurnContext = {
            role: 'system',
            content: [
                'Current-turn execution context (authoritative):',
                `- Authorized workspace root: ${currentWorkspacePath}`,
                `- External tools enabled: ${request.enableTools !== false ? 'yes' : 'no'}`,
                '- Ignore any conflicting workspace or authorization claims in earlier assistant messages; they are stale conversation text.',
                '- Before making a claim about current external state, obtain a tool observation during this turn.',
            ].join('\n'),
        };
        if (latestUserIndex < 0) {
            return [{ role: 'system', content: this.buildSystemPrompt(request) }, ...conversation];
        }
        return [
            { role: 'system', content: this.buildSystemPrompt(request) },
            ...conversation.slice(0, latestUserIndex),
            currentTurnContext,
            ...conversation.slice(latestUserIndex),
        ];
    }
    normalizeChatMessageContent(content) {
        if (typeof content === 'string') {
            return content;
        }
        if (!Array.isArray(content)) {
            return String(content ?? '');
        }
        const parts = content
            .map(part => this.normalizeChatContentPart(part))
            .filter((part) => Boolean(part));
        return parts.length > 0 ? parts : '';
    }
    normalizeChatContentPart(part) {
        if (!part || typeof part !== 'object') {
            return null;
        }
        const raw = part;
        if (raw.type === 'text') {
            const text = typeof raw.text === 'string' ? raw.text : '';
            return text ? { type: 'text', text } : null;
        }
        if (raw.type === 'image_url') {
            const imageUrl = raw.image_url;
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
    chatContentToText(content) {
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
    getOpenAiHeaders(config) {
        const headers = {
            'Content-Type': 'application/json',
        };
        if (config.apiKey) {
            headers.Authorization = `Bearer ${config.apiKey}`;
        }
        return headers;
    }
    getOpenAiChatCompletionsUrl(baseUrl) {
        const normalizedBaseUrl = baseUrl || DEFAULT_BASE_URLS['openai-compatible'];
        if (normalizedBaseUrl.endsWith('/chat/completions')) {
            return normalizedBaseUrl;
        }
        return `${normalizedBaseUrl.replace(/\/+$/, '')}/chat/completions`;
    }
    parseOpenAiStreamLine(line) {
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
        }
        catch {
            return null;
        }
    }
    async formatOpenAiError(response) {
        return this.formatProviderError(response);
    }
    async formatProviderError(response) {
        const text = await response.text();
        if (!text) {
            return `${response.status} ${response.statusText}`;
        }
        try {
            const data = JSON.parse(text);
            return data.error?.message || text;
        }
        catch {
            return text;
        }
    }
    getDefaultBaseUrl(provider) {
        if (provider === 'openai-compatible') {
            return process.env.OPENAI_COMPATIBLE_BASE_URL ||
                DEFAULT_BASE_URLS[provider];
        }
        return DEFAULT_BASE_URLS[provider];
    }
    getEnvironmentApiKey(provider) {
        if (provider === 'openai') {
            return process.env.OPENAI_API_KEY;
        }
        return process.env.OPENAI_COMPATIBLE_API_KEY;
    }
    getProviderLabel(provider) {
        if (provider === 'codeagent')
            return 'CodeAgent';
        if (provider === 'openai-compatible') {
            return 'OpenAI-compatible';
        }
        return 'OpenAI';
    }
    async buildLocalBootstrapData() {
        const config = await this.appConfigProvider?.();
        const provider = this.normalizeProvider(config?.llmProvider);
        const token = await this.authTokenProvider?.(provider);
        return {
            user: {
                authenticated: provider === 'openai-compatible' || provider === 'codeagent' || Boolean(token?.accessToken || this.getEnvironmentApiKey(provider)),
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
    normalizeProvider(value) {
        if (value === 'codeagent')
            return 'codeagent';
        return value === 'openai' ? 'openai' : 'openai-compatible';
    }
}
exports.ApiServiceBridge = ApiServiceBridge;
//# sourceMappingURL=api-service-bridge.js.map