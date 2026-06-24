// Stubs for missing exports from @anthropic-ai/sdk
declare module "@anthropic-ai/sdk/resources/beta/messages/messages.mjs" {
  export interface BetaMessageStreamParams {}
  export interface BetaContentBlock {}
  export interface BetaContentBlockParam {}
  export interface BetaImageBlockParam {}
  export interface BetaJSONOutputFormat {}
  export interface BetaMessage {}
  export interface BetaMessageDeltaUsage {}
  export interface BetaOutputConfig {}
  export interface BetaRawMessageStreamEvent {}
  export interface BetaRequestDocumentBlock {}
  export type BetaStopReason = string;
  export type BetaToolChoiceAuto = { type: "auto" };
  export type BetaToolChoiceAny = { type: "any" };
  export type BetaToolChoiceDisabled = { type: "disabled" };
  export type BetaToolChoice = BetaToolChoiceAuto | BetaToolChoiceAny | BetaToolChoiceDisabled | { type: "tool"; id: string };
  export interface BetaThinkingBlock {}
  export interface BetaTextBlock {}
  export interface BetaToolUseBlock {}
  export type BetaContentBlockDeltaEvent = Record<string, any>;
}

declare module "@anthropic-ai/sdk/resources/messages.mjs" {
  export interface ImageBlockParam {}
}

declare module "@anthropic-ai/claude-agent-sdk" {
  export type PermissionMode = string;
}
