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
const jsonc_parser_1 = require("jsonc-parser");
class McpServiceBridge {
    constructor(basePath = process.cwd()) {
        this.basePath = basePath;
        this.configuredServers = [];
        this.activeTools = [];
    }
    async listServers() {
        if (this.configuredServers.length === 0) {
            await this.refresh();
        }
        return [...this.configuredServers];
    }
    async listTools() {
        return [...this.activeTools];
    }
    async refresh() {
        this.configuredServers = await this.loadConfiguredServers();
        return [...this.configuredServers];
    }
    setTools(tools) {
        this.activeTools = [...tools];
    }
    async loadConfiguredServers() {
        const configFiles = [
            { filePath: path.join(this.basePath, '.mcp.json'), scope: 'project' },
            { filePath: path.join(this.basePath, '.claude', 'settings.json'), scope: 'project' },
            { filePath: path.join(os.homedir(), '.claude.json'), scope: 'user' },
        ];
        const servers = [];
        for (const { filePath, scope } of configFiles) {
            const config = await this.readConfig(filePath);
            if (!config) {
                continue;
            }
            for (const server of this.extractServers(config, scope)) {
                servers.push(server);
            }
        }
        const seen = new Set();
        return servers.filter(server => {
            const key = `${server.scope ?? 'unknown'}:${server.name}`;
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
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
}
exports.McpServiceBridge = McpServiceBridge;
//# sourceMappingURL=mcp-service-bridge.js.map