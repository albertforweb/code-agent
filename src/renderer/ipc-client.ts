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

export interface ChatRequest {
  messages: ChatMessage[];
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

export interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: number;
}

export interface AuthToken {
  accessToken: string;
  expiresAt?: number;
  refreshToken?: string;
}

export interface AppConfig {
  apiKey?: string;
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
};
