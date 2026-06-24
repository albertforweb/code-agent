/**
 * Stubs for MCP SDK types and Anthropic SDK internals
 */

// MCP SDK types stub
declare module '@modelcontextprotocol/sdk/types.js' {
  export interface CallToolResult {
    content: any[];
    isError?: boolean;
  }
  export interface ToolAnnotations {
    [key: string]: any;
  }
}

// Anthropic SDK internals stub
declare module '@anthropic-ai/sdk/resources/beta/messages/messages.mjs' {
  export interface MessagesResource {
    create: (params: any) => Promise<any>;
  }
  export const messages: MessagesResource;
}

declare module '@anthropic-ai/sdk/resources/messages.mjs' {
  export interface ContentBlock {
    type: string;
    text?: string;
  }
  
  export interface ContentBlockParam {
    type: string;
    text?: string;
  }

  export interface Base64ImageSource {
    type: 'base64';
    media_type: string;
    data: string;
  }
}

declare module '@anthropic-ai/claude-agent-sdk' {
  export const AgentSDK: any;
}
