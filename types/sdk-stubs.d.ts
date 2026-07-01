/**
 * Stubs for MCP SDK types that are absent from the pinned package version.
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

