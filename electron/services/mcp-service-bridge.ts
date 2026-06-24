/**
 * Service Bridge - MCP Service
 * Exposes configured MCP servers and MCP tool metadata to the renderer.
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { parse as parseJsonc } from 'jsonc-parser';
import type { McpServerInfo, McpToolInfo } from '../types';

type RawMcpConfig = Record<string, any>;

export class McpServiceBridge {
  private configuredServers: McpServerInfo[] = [];
  private activeTools: McpToolInfo[] = [];

  constructor(private readonly basePath: string = process.cwd()) {}

  async listServers(): Promise<McpServerInfo[]> {
    if (this.configuredServers.length === 0) {
      await this.refresh();
    }

    return [...this.configuredServers];
  }

  async listTools(): Promise<McpToolInfo[]> {
    return [...this.activeTools];
  }

  async refresh(): Promise<McpServerInfo[]> {
    this.configuredServers = await this.loadConfiguredServers();
    return [...this.configuredServers];
  }

  setTools(tools: McpToolInfo[]): void {
    this.activeTools = [...tools];
  }

  private async loadConfiguredServers(): Promise<McpServerInfo[]> {
    const configFiles = [
      { filePath: path.join(this.basePath, '.mcp.json'), scope: 'project' },
      { filePath: path.join(this.basePath, '.claude', 'settings.json'), scope: 'project' },
      { filePath: path.join(os.homedir(), '.claude.json'), scope: 'user' },
    ];

    const servers: McpServerInfo[] = [];

    for (const { filePath, scope } of configFiles) {
      const config = await this.readConfig(filePath);
      if (!config) {
        continue;
      }

      for (const server of this.extractServers(config, scope)) {
        servers.push(server);
      }
    }

    const seen = new Set<string>();
    return servers.filter(server => {
      const key = `${server.scope ?? 'unknown'}:${server.name}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
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

  private extractServers(config: RawMcpConfig, scope: string): McpServerInfo[] {
    const rawServers = config.mcpServers ?? config.mcp_servers ?? {};
    if (!rawServers || typeof rawServers !== 'object') {
      return [];
    }

    return Object.entries(rawServers).map(([name, value]) => {
      const server = value && typeof value === 'object' ? value as RawMcpConfig : {};
      const type = this.inferServerType(server);

      return {
        name,
        type,
        scope,
        status: server.error ? 'error' : 'configured',
        command: typeof server.command === 'string' ? server.command : undefined,
        args: Array.isArray(server.args) ? server.args.map(String) : undefined,
        url: typeof server.url === 'string' ? server.url : undefined,
        error: typeof server.error === 'string' ? server.error : undefined,
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
}
