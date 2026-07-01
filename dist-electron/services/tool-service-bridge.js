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
    constructor(tools = []) {
        this.tools = new Map();
        this.executions = new Map();
        this.onStart = () => { };
        this.onResult = () => { };
        this.onComplete = () => { };
        this.onError = () => { };
        this.permissionPolicyProvider = () => 'allow';
        this.permissionReviewHandler = async () => { };
        for (const tool of tools) {
            this.registerTool(tool.name, tool);
        }
    }
    /**
     * Set start handler
     */
    setStartHandler(handler) {
        this.onStart = handler;
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
    setPermissionPolicyProvider(provider) {
        this.permissionPolicyProvider = provider;
    }
    setPermissionReviewHandler(handler) {
        this.permissionReviewHandler = handler;
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
                source: tool.source ?? 'bridge',
                readOnly: tool.readOnly,
                category: tool.category,
            });
        }
        return tools;
    }
    /**
     * Execute a tool
     */
    async executeTool(toolName, args, toolId) {
        await this.executeToolAndReturn(toolName, args, toolId);
    }
    /**
     * Execute a tool and return the result to callers that need an agent loop.
     */
    async executeToolAndReturn(toolName, args, toolId) {
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
            this.onStart(toolId, toolName, args);
            const permissionMode = await this.permissionPolicyProvider(tool, args, context);
            context.permissionMode = permissionMode;
            if (permissionMode === 'deny') {
                throw new Error(`Tool ${toolName} is denied by desktop permission policy.`);
            }
            if (permissionMode === 'ask' && !tool.customReview) {
                await this.permissionReviewHandler(tool, args, context);
            }
            const result = await this._executeToolInternal(tool, args, context);
            // Emit result
            this.onResult(toolId, result);
            // Emit completion
            const duration = Date.now() - startTime;
            this.onComplete(toolId, true, duration);
            return result;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            this.onError(toolId, error instanceof Error ? error.message : String(error), error instanceof Error ? error.stack : undefined);
            this.onComplete(toolId, false, duration);
            throw error;
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
     * Internal tool execution.
     */
    async _executeToolInternal(tool, args, context) {
        return tool.execute(args, context);
    }
    /**
     * Register a tool manually
     */
    registerTool(name, tool) {
        this.tools.set(name, tool);
    }
    registerTools(tools) {
        for (const tool of tools) {
            this.registerTool(tool.name, tool);
        }
    }
}
exports.ToolServiceBridge = ToolServiceBridge;
//# sourceMappingURL=tool-service-bridge.js.map