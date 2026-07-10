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
export {
  CommandServiceBridge,
  type CommandRunPreview,
  type CommandRunResult,
} from './command-service-bridge';
export {
  WebServiceBridge,
  type WebSearchResult,
} from './web-service-bridge';
export {
  FinanceServiceBridge,
  type FinanceQuote,
} from './finance-service-bridge';
export {
  AutomationServiceBridge,
  type SkillManifest,
  type SkillDetail,
  type ScheduledTask,
  type AutomationRetryPolicy,
  type AutomationNotificationPolicy,
  type AutomationMissedRunPolicy,
  type AutomationNotificationEmitter,
  type AutomationRunRecord,
  type AutomationApprovalRequest,
  type AutomationExecutionResult,
  type RemoteControlState,
  type RemoteControlAuditEvent,
  type VirtualTeamBlueprint,
  type VirtualTeamAssignmentPlan,
  type VirtualTeamMember,
  type VirtualTeamMilestone,
  type VirtualTeamPermissionMode,
  type VirtualTeamRunStep,
  type VirtualTeamRunRecord,
  type AutomationProjectExport,
  type AutomationProjectImportResult,
} from './automation-service-bridge';
export {
  LocalHistoryServiceBridge,
  type LocalHistoryRecord,
  type LocalHistoryRecordInput,
  type LocalHistoryRecordType,
  type LocalHistoryFilter,
  type LocalHistoryExport,
  type LocalHistoryStorageInfo,
} from './local-history-service-bridge';
