"use strict";
/**
 * Service Bridge - MCP Service
 * Exposes configured MCP servers and MCP tool metadata to the renderer.
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
exports.McpServiceBridge = void 0;
const fs = __importStar(require("fs/promises"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const index_js_1 = require("@modelcontextprotocol/sdk/client/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/client/stdio.js");
const jsonc_parser_1 = require("jsonc-parser");
class McpServiceBridge {
    constructor(basePath = process.cwd()) {
        this.basePath = basePath;
        this.configuredServers = [];
        this.activeTools = [];
        this.serverConfigs = new Map();
        this.runtimes = new Map();
        this.refreshPromise = null;
    }
    async listServers() {
        if (this.configuredServers.length === 0) {
            await this.refresh();
        }
        return [...this.configuredServers];
    }
    async listTools() {
        if (this.configuredServers.length === 0) {
            await this.refresh();
        }
        else if (this.refreshPromise) {
            await this.refreshPromise;
        }
        return [...this.activeTools];
    }
    async refresh() {
        if (this.refreshPromise) {
            return this.refreshPromise;
        }
        this.refreshPromise = this.refreshInternal().finally(() => {
            this.refreshPromise = null;
        });
        return this.refreshPromise;
    }
    setTools(tools) {
        this.activeTools = [...tools];
    }
    async dispose() {
        await this.closeRuntimes();
    }
    async callTool(serverName, toolName, args = {}) {
        const parsed = this.parseToolTarget(serverName, toolName);
        if (!parsed.serverName || !parsed.toolName) {
            throw new Error('mcp.callTool requires serverName and toolName.');
        }
        if (this.configuredServers.length === 0) {
            await this.refresh();
        }
        else if (this.refreshPromise) {
            await this.refreshPromise;
        }
        const server = this.findServer(parsed.serverName);
        if (!server) {
            throw new Error(`MCP server not found: ${parsed.serverName}`);
        }
        const runtime = await this.ensureRuntime(server);
        const tool = runtime.tools.find(candidate => candidate.toolName === parsed.toolName);
        if (!tool) {
            throw new Error(`MCP tool not found on ${server.name}: ${parsed.toolName}`);
        }
        return runtime.client.callTool({
            name: parsed.toolName,
            arguments: args && typeof args === 'object' ? args : {},
        });
    }
    async refreshInternal() {
        await this.closeRuntimes();
        const { servers, configs } = await this.loadConfiguredServers();
        this.serverConfigs = configs;
        this.configuredServers = servers;
        this.activeTools = [];
        await Promise.all(this.configuredServers.map(server => this.discoverServerTools(server)));
        return [...this.configuredServers];
    }
    async loadConfiguredServers() {
        const configFiles = [
            { filePath: path.join(this.basePath, '.mcp.json'), scope: 'project' },
        ];
        const servers = [];
        const configs = new Map();
        const seen = new Set();
        for (const { filePath, scope } of configFiles) {
            const config = await this.readConfig(filePath);
            if (!config) {
                continue;
            }
            for (const { server, rawConfig } of this.extractServers(config, scope)) {
                const key = this.serverKey(server);
                if (seen.has(key)) {
                    continue;
                }
                seen.add(key);
                servers.push(server);
                configs.set(key, rawConfig);
            }
        }
        return { servers, configs };
    }
    async readConfig(filePath) {
        try {
            const content = await fs.readFile(filePath, 'utf8');
            const parsed = (0, jsonc_parser_1.parse)(content);
            return parsed && typeof parsed === 'object' ? parsed : null;
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return null;
            }
            return {
                mcpServers: {
                    [path.basename(filePath)]: {
                        type: 'unknown',
                        error: error instanceof Error ? error.message : String(error),
                    },
                },
            };
        }
    }
    extractServers(config, scope) {
        const rawServers = config.mcpServers ?? config.mcp_servers ?? {};
        if (!rawServers || typeof rawServers !== 'object') {
            return [];
        }
        return Object.entries(rawServers).map(([name, value]) => {
            const server = value && typeof value === 'object' ? value : {};
            const type = this.inferServerType(server);
            return {
                server: {
                    name,
                    type,
                    scope,
                    status: server.error ? 'error' : 'configured',
                    command: typeof server.command === 'string' ? server.command : undefined,
                    args: Array.isArray(server.args) ? server.args.map(String) : undefined,
                    url: typeof server.url === 'string' ? server.url : undefined,
                    error: typeof server.error === 'string' ? server.error : undefined,
                },
                rawConfig: server,
            };
        });
    }
    inferServerType(server) {
        if (typeof server.type === 'string') {
            return server.type;
        }
        if (typeof server.url === 'string') {
            return server.url.startsWith('ws') ? 'websocket' : 'http';
        }
        if (typeof server.command === 'string') {
            return 'stdio';
        }
        return 'unknown';
    }
    async discoverServerTools(server) {
        if (server.status === 'error') {
            return;
        }
        if (server.type !== 'stdio') {
            server.error = 'MCP execution currently supports stdio servers only.';
            return;
        }
        if (!server.command) {
            server.status = 'error';
            server.error = 'Stdio MCP server is missing a command.';
            return;
        }
        try {
            const runtime = await this.connectServer(server);
            this.runtimes.set(this.serverKey(server), runtime);
            this.activeTools.push(...runtime.tools);
            server.status = 'connected';
            server.error = undefined;
        }
        catch (error) {
            server.status = 'error';
            server.error = error instanceof Error ? error.message : String(error);
        }
    }
    async ensureRuntime(server) {
        if (server.type !== 'stdio') {
            throw new Error(`MCP server ${server.name} is ${server.type}; only stdio MCP execution is supported right now.`);
        }
        const key = this.serverKey(server);
        const existing = this.runtimes.get(key);
        if (existing) {
            return existing;
        }
        if (!server.command) {
            throw new Error(`MCP server ${server.name} is missing a command.`);
        }
        const runtime = await this.connectServer(server);
        this.runtimes.set(key, runtime);
        server.status = 'connected';
        server.error = undefined;
        const previousTools = this.activeTools.filter(tool => tool.serverKey !== key);
        this.activeTools = [...previousTools, ...runtime.tools];
        return runtime;
    }
    async connectServer(server) {
        const rawConfig = this.serverConfigs.get(this.serverKey(server)) ?? {};
        const transport = new stdio_js_1.StdioClientTransport({
            command: server.command,
            args: server.args ?? [],
            env: this.buildServerEnvironment(rawConfig.env),
            cwd: this.resolveServerCwd(rawConfig.cwd),
            stderr: 'pipe',
        });
        const client = new index_js_1.Client({
            name: 'code-agent-desktop',
            version: '1.0.0',
        });
        try {
            await client.connect(transport);
            const response = await client.listTools();
            const tools = (response.tools ?? []).map(tool => this.toMcpToolInfo(server, tool));
            return { client, transport, tools };
        }
        catch (error) {
            await transport.close().catch(() => undefined);
            throw error;
        }
    }
    toMcpToolInfo(server, tool) {
        return {
            name: `${server.name}.${tool.name}`,
            description: typeof tool.description === 'string' ? tool.description : '',
            inputSchema: tool.inputSchema && typeof tool.inputSchema === 'object'
                ? tool.inputSchema
                : { type: 'object', properties: {} },
            source: 'mcp',
            readOnly: typeof tool.annotations?.readOnlyHint === 'boolean' ? tool.annotations.readOnlyHint : undefined,
            serverName: server.name,
            serverScope: server.scope,
            serverKey: this.serverKey(server),
            toolName: String(tool.name),
        };
    }
    buildServerEnvironment(env) {
        if (!env || typeof env !== 'object' || Array.isArray(env)) {
            return undefined;
        }
        const normalized = {};
        for (const [key, value] of Object.entries(env)) {
            if (value === undefined || value === null) {
                continue;
            }
            normalized[key] = String(value);
        }
        return {
            ...(0, stdio_js_1.getDefaultEnvironment)(),
            ...normalized,
        };
    }
    resolveServerCwd(cwd) {
        if (typeof cwd !== 'string' || cwd.trim().length === 0) {
            return this.basePath;
        }
        if (cwd.startsWith('~')) {
            return path.join(os.homedir(), cwd.slice(1));
        }
        return path.isAbsolute(cwd) ? cwd : path.resolve(this.basePath, cwd);
    }
    parseToolTarget(serverName, toolName) {
        const normalizedServerName = serverName?.trim() ?? '';
        const normalizedToolName = toolName?.trim() ?? '';
        if (!normalizedServerName && normalizedToolName.includes('.')) {
            const [server, ...toolParts] = normalizedToolName.split('.');
            return {
                serverName: server,
                toolName: toolParts.join('.'),
            };
        }
        return {
            serverName: normalizedServerName,
            toolName: normalizedToolName,
        };
    }
    findServer(serverName) {
        return this.configuredServers.find(server => this.serverKey(server) === serverName) ??
            this.configuredServers.find(server => server.name === serverName);
    }
    serverKey(server) {
        return `${server.scope ?? 'unknown'}:${server.name}`;
    }
    async closeRuntimes() {
        const runtimes = [...this.runtimes.values()];
        this.runtimes.clear();
        await Promise.all(runtimes.map(async (runtime) => {
            try {
                await runtime.client.close();
            }
            catch {
                await runtime.transport.close().catch(() => undefined);
            }
        }));
    }
}
exports.McpServiceBridge = McpServiceBridge;
//# sourceMappingURL=mcp-service-bridge.js.map