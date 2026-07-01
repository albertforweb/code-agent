/**
 * IPC Channel Documentation
 * Complete reference for all IPC channels and communication patterns
 */

# IPC Channels Documentation

## Overview

The IPC (Inter-Process Communication) system bridges the Main Process and Renderer Process. All communication is asynchronous and type-safe.

### Communication Patterns

```
┌─────────────────────────────────────────────────────────────┐
│ RENDERER PROCESS (React DOM)                                │
│                                                             │
│  window.api.tools.execute(name, args)                      │
│         ↓ ipcRenderer.invoke('tool:execute', message)      │
│  Waits for response...                                      │
│         ↑ ipcMain.handle('tool:execute', handler)          │
│                                                             │
│  Handler executes asynchronously:                           │
│         ↓ Periodically sends updates                       │
│  window.api.onToolResult(callback)                          │
│         ← ipcRenderer.on('tool:result', callback)          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         │                          │
         │ IPC Bridge               │
         │ (type-safe channels)     │
         ↓                          ↑
┌─────────────────────────────────────────────────────────────┐
│ MAIN PROCESS (Node.js)                                      │
│                                                             │
│  Service Bridge Handlers:                                   │
│  - ToolServiceBridge                                        │
│  - ApiServiceBridge                                         │
│  - FileSystemServiceBridge                                  │
│  - AuthServiceBridge                                        │
│  - AppStateServiceBridge                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Channel Reference

### 1. Tool Channels

#### `tool:execute` - Execute a Tool
**Type**: invoke (request/response + streaming)

**Request**:
```typescript
{
  toolName: string;      // Name of tool to execute
  args: Record<string, any>;  // Tool arguments
}
```

**Response**:
```typescript
{
  toolId: string;  // Unique tool execution ID
}
```

**Streaming Results**:
```typescript
// Listen for results
window.api.onToolResult((data) => {
  console.log('Tool result:', data.toolId, data.data);
});

// Listen for completion
window.api.onToolComplete((data) => {
  console.log('Tool complete:', data.toolId, data.success, data.duration);
});

// Listen for errors
window.api.onToolError((data) => {
  console.log('Tool error:', data.toolId, data.error);
});
```

**Example**:
```javascript
const { toolId } = await window.api.tools.execute('bash', {
  command: 'ls -la',
  cwd: '/home/user'
});
```

#### `tool:list` - List Available Tools
**Type**: invoke (request/response)

**Request**: (none)

**Response**:
```typescript
Tool[]
```

**Example**:
```javascript
const tools = await window.api.tools.list();
console.log(tools);
```

---

### 2. API Channels

#### `api:chat` - Send Chat Message
**Type**: invoke (request/response)

**Request**:
```typescript
{
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
}
```

**Response**:
```typescript
{
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  }
}
```

**Example**:
```javascript
const response = await window.api.api.chat({
  messages: [
    { role: 'user', content: 'Hello, how are you?' }
  ],
  model: 'codeAgent-3-5-sonnet-20241022',
  temperature: 0.7
});
console.log(response.content);
```

#### `api:fetchBootstrap` - Get Bootstrap Data
**Type**: invoke (request/response)

**Request**: (none)

**Response**:
```typescript
{
  user: { id, name, email };
  config: { model, temperature, maxTokens };
  features: { tools, mcp, proactive, buddy };
}
```

**Example**:
```javascript
const bootstrap = await window.api.api.fetchBootstrap();
console.log('User:', bootstrap.user.name);
console.log('Features:', bootstrap.features);
```

---

### 3. File System Channels

#### `fs:read` - Read File
**Type**: invoke (request/response)

**Request**:
```typescript
{
  path: string;
  encoding?: string;  // default: 'utf-8'
}
```

**Response**: `string` (file contents)

**Example**:
```javascript
const content = await window.api.fs.read('src/main.ts');
console.log(content);
```

#### `fs:write` - Write File
**Type**: invoke (request/response)

**Request**:
```typescript
{
  path: string;
  content: string;
  encoding?: string;  // default: 'utf-8'
}
```

**Response**: `void`

**Example**:
```javascript
await window.api.fs.write('output.txt', 'Hello, World!');
```

#### `fs:list` - List Directory
**Type**: invoke (request/response)

**Request**:
```typescript
{
  path: string;
}
```

**Response**:
```typescript
FileEntry[]  // { name, type: 'file' | 'directory', size?, modified? }
```

**Example**:
```javascript
const entries = await window.api.fs.list('src/');
console.log(entries);
```

---

### 4. Authentication Channels

#### `auth:getToken` - Get Current Token
**Type**: invoke (request/response)

**Request**: (none)

**Response**:
```typescript
{
  accessToken: string;
  expiresAt?: number;
  refreshToken?: string;
} | null
```

**Example**:
```javascript
const token = await window.api.auth.getToken();
if (token) {
  console.log('Logged in, expires at:', new Date(token.expiresAt));
} else {
  console.log('Not logged in');
}
```

#### `auth:setToken` - Set Token
**Type**: invoke (request/response)

**Request**:
```typescript
{
  accessToken: string;
  expiresAt?: number;
  refreshToken?: string;
}
```

**Response**: `void`

**Example**:
```javascript
await window.api.auth.setToken({
  accessToken: 'sk-...',
  expiresAt: Date.now() + 3600000
});
```

#### `auth:logout` - Logout
**Type**: invoke (request/response)

**Request**: (none)

**Response**: `void`

**Example**:
```javascript
await window.api.auth.logout();
```

---

### 5. App State Channels

#### `app:getConfig` - Get App Configuration
**Type**: invoke (request/response)

**Request**: (none)

**Response**:
```typescript
{
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  theme?: 'light' | 'dark' | 'system';
  language?: string;
  [key: string]: any;
}
```

**Example**:
```javascript
const config = await window.api.app.getConfig();
console.log('Current model:', config.model);
console.log('Current theme:', config.theme);
```

#### `app:setConfig` - Set App Configuration
**Type**: invoke (request/response)

**Request**:
```typescript
Partial<AppConfig>  // Only provide fields to update
```

**Response**: `void`

**Example**:
```javascript
await window.api.app.setConfig({
  theme: 'dark',
  temperature: 0.5,
  maxTokens: 2048
});
```

#### `app:getState` - Get App State
**Type**: invoke (request/response)

**Request**: (none)

**Response**: `any`

**Example**:
```javascript
const state = await window.api.app.getState();
console.log('Session ID:', state.sessionId);
```

#### `app:setState` - Set App State
**Type**: invoke (request/response)

**Request**: `any` (any object)

**Response**: `void`

**Example**:
```javascript
await window.api.app.setState({
  sessionId: '123',
  lastMessage: 'Hello',
  timestamp: Date.now()
});
```

---

### 6. Window Channels

#### `window:minimize` - Minimize Window
**Type**: invoke (request/response)

#### `window:maximize` - Maximize/Restore Window
**Type**: invoke (request/response)

#### `window:close` - Close Window
**Type**: invoke (request/response)

#### `window:devtools` - Toggle Developer Tools
**Type**: invoke (request/response)

**Example**:
```javascript
await window.api.window.minimize();
await window.api.window.maximize();
await window.api.window.openDevTools();
await window.api.window.close();
```

---

## Error Handling

All channels may throw errors. Always use try/catch:

```javascript
try {
  const result = await window.api.api.chat(request);
  console.log(result);
} catch (error) {
  console.error('Chat failed:', error.message);
}
```

---

## Streaming Examples

### Tool Execution with Streaming

```javascript
// Start tool execution
const { toolId } = await window.api.tools.execute('bash', {
  command: 'npm install'
});

// Setup listeners
const unsubscribeResult = window.api.onToolResult(({ toolId: id, data }) => {
  console.log(`[${id}] Result:`, data);
});

const unsubscribeComplete = window.api.onToolComplete(({ toolId: id, success, duration }) => {
  console.log(`[${id}] Complete: ${success ? 'success' : 'failed'} (${duration}ms)`);
  
  // Cleanup
  unsubscribeResult();
  unsubscribeComplete();
});

const unsubscribeError = window.api.onToolError(({ toolId: id, error }) => {
  console.error(`[${id}] Error:`, error);
  
  // Cleanup
  unsubscribeResult();
  unsubscribeError();
});
```

---

## Security Considerations

1. **Context Isolation Enabled** - Renderer cannot directly access Node.js
2. **Preload Script Validation** - All IPC calls go through preload validation
3. **Path Traversal Protection** - File system paths are validated
4. **Token Storage** - Tokens stored in OS keychain, not plain text
5. **No Direct Node Access** - Renderer never gets Node.js modules

---

## Performance Tips

1. **Batch Operations** - Combine multiple reads into one call when possible
2. **Cache Results** - App state caches bootstrap data (1 hour TTL)
3. **Debounce Updates** - Don't update UI for every tool result
4. **Lazy Load** - Don't fetch all tools on startup
5. **Streaming** - Use event listeners for long-running operations

---

## Debugging

### Enable IPC Logging

In main process:
```javascript
ipcBridge.enableLogging(true);  // Log all channel calls
```

### Monitor IPC Traffic

Open DevTools (Ctrl+Shift+I) and check:
- Console for errors
- Network tab for timing
- Console messages logged by handlers

