/**
 * Service Bridge - Tool Service
 * Bridges CLI tool registry to IPC channels
 * Handles tool discovery, execution, and result streaming
 */

import type { Tool, ToolPermissionDecision, ToolPermissionMode } from '../types';

export interface BridgeToolDefinition extends Tool {
  execute: (args: Record<string, any>, context: ToolExecutionContext) => Promise<any>;
  customReview?: boolean;
}

/**
 * Tool execution context
 */
export interface ToolExecutionContext {
  toolId: string;
  toolName: string;
  args: Record<string, any>;
  startTime: number;
  cancelled: boolean;
  permissionMode?: ToolPermissionMode;
  permissionDecision?: ToolPermissionDecision<Record<string, any>>;
}

/**
 * Tool result streaming handler
 */
export type ToolStartHandler = (toolId: string, toolName: string, args: Record<string, any>) => void;
export type ToolResultHandler = (toolId: string, data: any) => void;
export type ToolCompleteHandler = (toolId: string, success: boolean, duration: number) => void;
export type ToolErrorHandler = (toolId: string, error: string, stack?: string) => void;
export type ToolPermissionPolicyProvider = (
  tool: BridgeToolDefinition,
  args: Record<string, any>,
  context: ToolExecutionContext,
) => Promise<ToolPermissionDecision<Record<string, any>> | ToolPermissionMode>
  | ToolPermissionDecision<Record<string, any>>
  | ToolPermissionMode;
export type ToolPermissionReviewHandler = (
  tool: BridgeToolDefinition,
  args: Record<string, any>,
  context: ToolExecutionContext,
) => Promise<void>;

/**
 * Tool Service Bridge - bridges CLI tools to IPC
 */
export class ToolServiceBridge {
  private tools: Map<string, BridgeToolDefinition> = new Map();
  private executions: Map<string, ToolExecutionContext> = new Map();
  private onStart: ToolStartHandler = () => {};
  private onResult: ToolResultHandler = () => {};
  private onComplete: ToolCompleteHandler = () => {};
  private onError: ToolErrorHandler = () => {};
  private permissionPolicyProvider: ToolPermissionPolicyProvider = () => 'allow';
  private permissionReviewHandler: ToolPermissionReviewHandler = async () => {};

  constructor(tools: BridgeToolDefinition[] = []) {
    for (const tool of tools) {
      this.registerTool(tool.name, tool);
    }
  }

  /**
   * Set start handler
   */
  setStartHandler(handler: ToolStartHandler) {
    this.onStart = handler;
  }

  /**
   * Set result handler for streaming results back to renderer
   */
  setResultHandler(handler: ToolResultHandler) {
    this.onResult = handler;
  }

  /**
   * Set completion handler
   */
  setCompleteHandler(handler: ToolCompleteHandler) {
    this.onComplete = handler;
  }

  /**
   * Set error handler
   */
  setErrorHandler(handler: ToolErrorHandler) {
    this.onError = handler;
  }

  setPermissionPolicyProvider(provider: ToolPermissionPolicyProvider) {
    this.permissionPolicyProvider = provider;
  }

  setPermissionReviewHandler(handler: ToolPermissionReviewHandler) {
    this.permissionReviewHandler = handler;
  }

  /**
   * Get list of available tools
   */
  async getTools(): Promise<Tool[]> {
    const tools: Tool[] = [];

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
  async executeTool(toolName: string, args: Record<string, any>, toolId: string): Promise<void> {
    await this.executeToolAndReturn(toolName, args, toolId);
  }

  /**
   * Execute a tool and return the result to callers that need an agent loop.
   */
  async executeToolAndReturn(toolName: string, args: Record<string, any>, toolId: string): Promise<any> {
    const startTime = Date.now();
    const context: ToolExecutionContext = {
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
    } catch (error) {
      const duration = Date.now() - startTime;
      this.onError(
        toolId,
        error instanceof Error ? error.message : String(error),
        error instanceof Error ? error.stack : undefined
      );
      this.onComplete(toolId, false, duration);
      throw error;
    } finally {
      this.executions.delete(toolId);
    }
  }

  /**
   * Cancel a tool execution
   */
  cancelTool(toolId: string): void {
    const context = this.executions.get(toolId);
    if (context) {
      context.cancelled = true;
    }
  }

  /**
   * Internal tool execution.
   */
  private async _executeToolInternal(
    tool: BridgeToolDefinition,
    args: Record<string, any>,
    context: ToolExecutionContext,
  ): Promise<any> {
    return tool.execute(args, context);
  }

  private normalizeLegacyPermissionDecision(
    behavior: ToolPermissionMode,
    toolName: string,
  ): ToolPermissionDecision<Record<string, any>> {
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
  registerTool(name: string, tool: BridgeToolDefinition): void {
    this.tools.set(name, tool);
  }

  registerTools(tools: BridgeToolDefinition[]): void {
    for (const tool of tools) {
      this.registerTool(tool.name, tool);
    }
  }
}
