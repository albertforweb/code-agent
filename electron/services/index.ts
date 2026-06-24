/**
 * Service Bridges Index
 * Central export for all service bridges
 */

export {
  ToolServiceBridge,
  type BridgeToolDefinition,
  type ToolExecutionContext,
} from './tool-service-bridge';
export { ApiServiceBridge } from './api-service-bridge';
export { FileSystemServiceBridge } from './filesystem-service-bridge';
export { AuthServiceBridge } from './auth-service-bridge';
export { AppStateServiceBridge } from './app-state-service-bridge';
export { McpServiceBridge } from './mcp-service-bridge';
