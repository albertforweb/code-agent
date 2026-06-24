"use strict";
/**
 * Service Bridge - Tool Service
 * Bridges CLI tool registry to IPC channels
 * Handles tool discovery, execution, and result streaming
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToolServiceBridge = void 0;
/**
 * Tool Service Bridge - bridges CLI tools to IPC
 */
class ToolServiceBridge {
    constructor() {
        this.tools = new Map();
        this.executions = new Map();
        this.onResult = () => { };
        this.onComplete = () => { };
        this.onError = () => { };
        // TODO: Load tools from CLI tool registry
        // this.loadToolsFromRegistry();
    }
    /**
     * Set result handler for streaming results back to renderer
     */
    setResultHandler(handler) {
        this.onResult = handler;
    }
    /**
     * Set completion handler
     */
    setCompleteHandler(handler) {
        this.onComplete = handler;
    }
    /**
     * Set error handler
     */
    setErrorHandler(handler) {
        this.onError = handler;
    }
    /**
     * Get list of available tools
     */
    async getTools() {
        const tools = [];
        for (const [name, tool] of this.tools) {
            tools.push({
                name,
                description: tool.description || '',
                inputSchema: tool.inputSchema || {},
            });
        }
        return tools;
    }
    /**
     * Execute a tool
     */
    async executeTool(toolName, args, toolId) {
        const startTime = Date.now();
        const context = {
            toolId,
            toolName,
            args,
            startTime,
            cancelled: false,
        };
        this.executions.set(toolId, context);
        try {
            const tool = this.tools.get(toolName);
            if (!tool) {
                throw new Error(`Tool not found: ${toolName}`);
            }
            // Execute the tool
            // This will typically be async and may stream results
            const result = await this._executeToolInternal(tool, args, context);
            // Emit result
            this.onResult(toolId, result);
            // Emit completion
            const duration = Date.now() - startTime;
            this.onComplete(toolId, true, duration);
        }
        catch (error) {
            const duration = Date.now() - startTime;
            this.onError(toolId, error instanceof Error ? error.message : String(error), error instanceof Error ? error.stack : undefined);
            this.onComplete(toolId, false, duration);
        }
        finally {
            this.executions.delete(toolId);
        }
    }
    /**
     * Cancel a tool execution
     */
    cancelTool(toolId) {
        const context = this.executions.get(toolId);
        if (context) {
            context.cancelled = true;
        }
    }
    /**
     * Internal tool execution - override in subclass
     */
    async _executeToolInternal(tool, args, context) {
        // TODO: Implement actual tool execution logic
        // This will call the actual CLI tool implementation
        console.log(`Executing tool: ${tool.name}`, args);
        return { status: 'success', message: 'Tool executed' };
    }
    /**
     * Load tools from CLI registry (to be implemented)
     */
    loadToolsFromRegistry() {
        // TODO: Import and load tools from:
        // - /tools/BashTool.ts
        // - /tools/FileEditTool.ts
        // - /tools/WebFetchTool.ts
        // - /tools/AgentTool.ts
        // - etc.
    }
    /**
     * Register a tool manually
     */
    registerTool(name, tool) {
        this.tools.set(name, tool);
    }
}
exports.ToolServiceBridge = ToolServiceBridge;
//# sourceMappingURL=tool-service-bridge.js.map