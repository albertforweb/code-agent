/**
 * Message Types - Stub Implementation
 */

export interface Message {
  type: string;
  content: any;
  [key: string]: any;
}

export interface NormalizedUserMessage {
  type: 'user';
  content: any;
  [key: string]: any;
}

export interface AssistantMessage {
  type: 'assistant';
  content: any;
  [key: string]: any;
}

export type { Message as SDKMessage };
