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
                owner: tool.owner,
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
            const rawDecision = await this.permissionPolicyProvider(tool, args, context);
            const permissionDecision = typeof rawDecision === 'string'
                ? this.normalizeLegacyPermissionDecision(rawDecision, toolName)
                : rawDecision;
            context.permissionMode = permissionDecision.behavior;
            context.permissionDecision = permissionDecision;
            if (permissionDecision.behavior === 'deny') {
                throw new Error(permissionDecision.message);
            }
            const executionArgs = permissionDecision.updatedInput
                ? permissionDecision.updatedInput
                : args;
            context.args = executionArgs;
            if (permissionDecision.behavior === 'ask' && !tool.customReview) {
                await this.permissionReviewHandler(tool, executionArgs, context);
            }
            const result = await this._executeToolInternal(tool, executionArgs, context);
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
    normalizeLegacyPermissionDecision(behavior, toolName) {
        if (behavior === 'deny') {
            return {
                behavior,
                message: `Tool ${toolName} is denied by desktop permission policy.`,
                decisionReason: { type: 'legacy-desktop-policy' },
            };
        }
        if (behavior === 'ask') {
            return {
                behavior,
                message: `Tool ${toolName} requires approval.`,
                decisionReason: { type: 'legacy-desktop-policy' },
            };
        }
        return { behavior, decisionReason: { type: 'legacy-desktop-policy' } };
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