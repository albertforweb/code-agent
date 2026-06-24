/**
 * Service Bridge - Tool Service
 * Bridges CLI tool registry to IPC channels
 * Handles tool discovery, execution, and result streaming
 */

import type { Tool } from '../types';

export interface BridgeToolDefinition extends Tool {
  execute: (args: Record<string, any>, context: ToolExecutionContext) => Promise<any>;
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
}

/**
 * Tool result streaming handler
 */
export type ToolResultHandler = (toolId: string, data: any) => void;
export type ToolCompleteHandler = (toolId: string, success: boolean, duration: number) => void;
export type ToolErrorHandler = (toolId: string, error: string, stack?: string) => void;

/**
 * Tool Service Bridge - bridges CLI tools to IPC
 */
export class ToolServiceBridge {
  private tools: Map<string, BridgeToolDefinition> = new Map();
  private executions: Map<string, ToolExecutionContext> = new Map();
  private onResult: ToolResultHandler = () => {};
  private onComplete: ToolCompleteHandler = () => {};
  private onError: ToolErrorHandler = () => {};

  constructor(tools: BridgeToolDefinition[] = []) {
    for (const tool of tools) {
      this.registerTool(tool.name, tool);
    }
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
      });
    }

    return tools;
  }

  /**
   * Execute a tool
   */
  async executeTool(toolName: string, args: Record<string, any>, toolId: string): Promise<void> {
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

      const result = await this._executeToolInternal(tool, args, context);

      // Emit result
      this.onResult(toolId, result);

      // Emit completion
      const duration = Date.now() - startTime;
      this.onComplete(toolId, true, duration);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.onError(
        toolId,
        error instanceof Error ? error.message : String(error),
        error instanceof Error ? error.stack : undefined
      );
      this.onComplete(toolId, false, duration);
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
