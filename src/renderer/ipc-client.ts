export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
  source?: 'bridge' | 'mcp' | 'cli';
  readOnly?: boolean;
}

export interface ToolExecuteResponse {
  toolId: string;
}

export interface ToolResultMessage {
  toolId: string;
  data: any;
  timestamp: number;
}

export interface ToolCompleteMessage {
  toolId: string;
  success: boolean;
  duration: number;
}

export interface ToolErrorMessage {
  toolId: string;
  error: string;
  stack?: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type LlmProviderType = 'anthropic' | 'openai' | 'openai-compatible';

export interface ChatRequest {
  messages: ChatMessage[];
  provider?: LlmProviderType;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface ChatStreamRequest extends ChatRequest {
  requestId?: string;
}

export interface ChatStreamResponse {
  requestId: string;
}

export interface ChatDeltaMessage {
  requestId: string;
  delta: string;
  timestamp: number;
}

export interface ChatCompleteMessage {
  requestId: string;
  response: ChatResponse;
  duration: number;
}

export interface ChatErrorMessage {
  requestId: string;
  error: string;
  stack?: string;
}

export interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: number;
}

export interface AuthToken {
  accessToken: string;
  provider?: LlmProviderType;
  expiresAt?: number;
  refreshToken?: string;
}

export interface AppConfig {
  apiKey?: string;
  llmProvider?: LlmProviderType;
  baseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  theme?: 'light' | 'dark' | 'system';
  language?: string;
  [key: string]: any;
}

export interface AppInfo {
  version: string;
  platform: string;
  arch: string;
  isDev: boolean;
}

export interface AppConfigChangedMessage {
  config: AppConfig;
  version: number;
  updatedAt: number;
}

export interface AppStateChangedMessage {
  state: Record<string, any>;
  version: number;
  updatedAt: number;
}

export interface BootstrapData {
  user: any;
  config: any;
  features: Record<string, boolean>;
}

export interface McpServerInfo {
  name: string;
  type: string;
  scope?: string;
  status: 'configured' | 'connected' | 'error';
  command?: string;
  args?: string[];
  url?: string;
  error?: string;
}

export interface McpToolInfo extends Tool {
  serverName: string;
  toolName: string;
}

export interface ElectronRendererApi {
  tools: {
    execute(toolName: string, args: Record<string, any>): Promise<ToolExecuteResponse>;
    list(): Promise<Tool[]>;
  };
  api: {
    chat(request: ChatRequest): Promise<ChatResponse>;
    chatStream(request: ChatStreamRequest): Promise<ChatStreamResponse>;
    fetchBootstrap(): Promise<BootstrapData>;
  };
  mcp: {
    listServers(): Promise<McpServerInfo[]>;
    listTools(): Promise<McpToolInfo[]>;
    refresh(): Promise<McpServerInfo[]>;
  };
  fs: {
    read(path: string, encoding?: string): Promise<string>;
    write(path: string, content: string, encoding?: string): Promise<void>;
    list(path: string): Promise<FileEntry[]>;
  };
  auth: {
    getToken(): Promise<AuthToken | null>;
    logout(): Promise<void>;
    setToken(token: AuthToken): Promise<void>;
  };
  app: {
    info(): Promise<AppInfo>;
    getConfig(): Promise<AppConfig>;
    setConfig(config: Partial<AppConfig>): Promise<void>;
    getState(): Promise<any>;
    setState(state: any): Promise<void>;
  };
  window: {
    minimize(): Promise<void>;
    maximize(): Promise<void>;
    close(): Promise<void>;
    openDevTools(): Promise<void>;
  };
  onToolResult(callback: (data: ToolResultMessage) => void): () => void;
  onToolComplete(callback: (data: ToolCompleteMessage) => void): () => void;
  onToolError(callback: (data: ToolErrorMessage) => void): () => void;
  onChatDelta(callback: (data: ChatDeltaMessage) => void): () => void;
  onChatComplete(callback: (data: ChatCompleteMessage) => void): () => void;
  onChatError(callback: (data: ChatErrorMessage) => void): () => void;
  onConfigChanged(callback: (data: AppConfigChangedMessage) => void): () => void;
  onStateChanged(callback: (data: AppStateChangedMessage) => void): () => void;
}

declare global {
  interface Window {
    api?: ElectronRendererApi;
  }
}

function getApi(): ElectronRendererApi {
  if (!window.api) {
    throw new Error('Electron preload API is unavailable');
  }

  return window.api;
}

export const ipcClient: ElectronRendererApi = {
  tools: {
    execute: (toolName, args) => getApi().tools.execute(toolName, args),
    list: () => getApi().tools.list(),
  },
  api: {
    chat: request => getApi().api.chat(request),
    chatStream: request => getApi().api.chatStream(request),
    fetchBootstrap: () => getApi().api.fetchBootstrap(),
  },
  mcp: {
    listServers: () => getApi().mcp.listServers(),
    listTools: () => getApi().mcp.listTools(),
    refresh: () => getApi().mcp.refresh(),
  },
  fs: {
    read: (path, encoding) => getApi().fs.read(path, encoding),
    write: (path, content, encoding) => getApi().fs.write(path, content, encoding),
    list: path => getApi().fs.list(path),
  },
  auth: {
    getToken: () => getApi().auth.getToken(),
    logout: () => getApi().auth.logout(),
    setToken: token => getApi().auth.setToken(token),
  },
  app: {
    info: () => getApi().app.info(),
    getConfig: () => getApi().app.getConfig(),
    setConfig: config => getApi().app.setConfig(config),
    getState: () => getApi().app.getState(),
    setState: state => getApi().app.setState(state),
  },
  window: {
    minimize: () => getApi().window.minimize(),
    maximize: () => getApi().window.maximize(),
    close: () => getApi().window.close(),
    openDevTools: () => getApi().window.openDevTools(),
  },
  onToolResult: callback => getApi().onToolResult(callback),
  onToolComplete: callback => getApi().onToolComplete(callback),
  onToolError: callback => getApi().onToolError(callback),
  onChatDelta: callback => getApi().onChatDelta(callback),
  onChatComplete: callback => getApi().onChatComplete(callback),
  onChatError: callback => getApi().onChatError(callback),
  onConfigChanged: callback => getApi().onConfigChanged(callback),
  onStateChanged: callback => getApi().onStateChanged(callback),
};
