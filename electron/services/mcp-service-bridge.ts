/**
 * Service Bridge - MCP Service
 * Exposes configured MCP servers and MCP tool metadata to the renderer.
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { getDefaultEnvironment, StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { parse as parseJsonc } from 'jsonc-parser';
import type { McpServerInfo, McpToolInfo } from '../types';

type RawMcpConfig = Record<string, any>;

interface McpServerRuntime {
  client: Client;
  transport: StdioClientTransport;
  tools: McpToolInfo[];
}

export class McpServiceBridge {
  private configuredServers: McpServerInfo[] = [];
  private activeTools: McpToolInfo[] = [];
  private serverConfigs = new Map<string, RawMcpConfig>();
  private runtimes = new Map<string, McpServerRuntime>();
  private refreshPromise: Promise<McpServerInfo[]> | null = null;

  constructor(private readonly basePath: string = process.cwd()) {}

  async listServers(): Promise<McpServerInfo[]> {
    if (this.configuredServers.length === 0) {
      await this.refresh();
    }

    return [...this.configuredServers];
  }

  async listTools(): Promise<McpToolInfo[]> {
    if (this.configuredServers.length === 0) {
      await this.refresh();
    } else if (this.refreshPromise) {
      await this.refreshPromise;
    }

    return [...this.activeTools];
  }

  async refresh(): Promise<McpServerInfo[]> {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.refreshInternal().finally(() => {
      this.refreshPromise = null;
    });

    return this.refreshPromise;
  }

  setTools(tools: McpToolInfo[]): void {
    this.activeTools = [...tools];
  }

  async dispose(): Promise<void> {
    await this.closeRuntimes();
  }

  async callTool(serverName: string, toolName: string, args: Record<string, any> = {}): Promise<any> {
    const parsed = this.parseToolTarget(serverName, toolName);
    if (!parsed.serverName || !parsed.toolName) {
      throw new Error('mcp.callTool requires serverName and toolName.');
    }

    if (this.configuredServers.length === 0) {
      await this.refresh();
    } else if (this.refreshPromise) {
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

  private async refreshInternal(): Promise<McpServerInfo[]> {
    await this.closeRuntimes();

    const { servers, configs } = await this.loadConfiguredServers();
    this.serverConfigs = configs;
    this.configuredServers = servers;
    this.activeTools = [];

    await Promise.all(this.configuredServers.map(server => this.discoverServerTools(server)));

    return [...this.configuredServers];
  }

  private async loadConfiguredServers(): Promise<{
    servers: McpServerInfo[];
    configs: Map<string, RawMcpConfig>;
  }> {
    const configFiles = [
      { filePath: path.join(this.basePath, '.mcp.json'), scope: 'project' },
      { filePath: path.join(this.basePath, '.claude', 'settings.json'), scope: 'project' },
      { filePath: path.join(os.homedir(), '.claude.json'), scope: 'user' },
    ];

    const servers: McpServerInfo[] = [];
    const configs = new Map<string, RawMcpConfig>();
    const seen = new Set<string>();

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

  private async readConfig(filePath: string): Promise<RawMcpConfig | null> {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const parsed = parseJsonc(content);
      return parsed && typeof parsed === 'object' ? parsed as RawMcpConfig : null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
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

  private extractServers(config: RawMcpConfig, scope: string): Array<{
    server: McpServerInfo;
    rawConfig: RawMcpConfig;
  }> {
    const rawServers = config.mcpServers ?? config.mcp_servers ?? {};
    if (!rawServers || typeof rawServers !== 'object') {
      return [];
    }

    return Object.entries(rawServers).map(([name, value]) => {
      const server = value && typeof value === 'object' ? value as RawMcpConfig : {};
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

  private inferServerType(server: RawMcpConfig): string {
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

  private async discoverServerTools(server: McpServerInfo): Promise<void> {
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
    } catch (error) {
      server.status = 'error';
      server.error = error instanceof Error ? error.message : String(error);
    }
  }

  private async ensureRuntime(server: McpServerInfo): Promise<McpServerRuntime> {
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

  private async connectServer(server: McpServerInfo): Promise<McpServerRuntime> {
    const rawConfig = this.serverConfigs.get(this.serverKey(server)) ?? {};
    const transport = new StdioClientTransport({
      command: server.command!,
      args: server.args ?? [],
      env: this.buildServerEnvironment(rawConfig.env),
      cwd: this.resolveServerCwd(rawConfig.cwd),
      stderr: 'pipe',
    });

    const client = new Client({
      name: 'code-agent-desktop',
      version: '1.0.0',
    });

    try {
      await client.connect(transport);
      const response = await client.listTools();
      const tools = (response.tools ?? []).map(tool => this.toMcpToolInfo(server, tool));

      return { client, transport, tools };
    } catch (error) {
      await transport.close().catch(() => undefined);
      throw error;
    }
  }

  private toMcpToolInfo(server: McpServerInfo, tool: any): McpToolInfo {
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

  private buildServerEnvironment(env: unknown): Record<string, string> | undefined {
    if (!env || typeof env !== 'object' || Array.isArray(env)) {
      return undefined;
    }

    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined || value === null) {
        continue;
      }

      normalized[key] = String(value);
    }

    return {
      ...getDefaultEnvironment(),
      ...normalized,
    };
  }

  private resolveServerCwd(cwd: unknown): string {
    if (typeof cwd !== 'string' || cwd.trim().length === 0) {
      return this.basePath;
    }

    if (cwd.startsWith('~')) {
      return path.join(os.homedir(), cwd.slice(1));
    }

    return path.isAbsolute(cwd) ? cwd : path.resolve(this.basePath, cwd);
  }

  private parseToolTarget(serverName: string, toolName: string): {
    serverName: string;
    toolName: string;
  } {
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

  private findServer(serverName: string): McpServerInfo | undefined {
    return this.configuredServers.find(server => this.serverKey(server) === serverName) ??
      this.configuredServers.find(server => server.name === serverName);
  }

  private serverKey(server: Pick<McpServerInfo, 'name' | 'scope'>): string {
    return `${server.scope ?? 'unknown'}:${server.name}`;
  }

  private async closeRuntimes(): Promise<void> {
    const runtimes = [...this.runtimes.values()];
    this.runtimes.clear();

    await Promise.all(runtimes.map(async runtime => {
      try {
        await runtime.client.close();
      } catch {
        await runtime.transport.close().catch(() => undefined);
      }
    }));
  }
}
