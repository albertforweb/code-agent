# Service Bridges - Developer Quick Reference

## Overview

Service Bridges are the middle layer between the Renderer Process and business logic in the Main Process.

```
Renderer (React)  →  Preload  →  IPC Bridge  →  Service Bridge  →  Actual Services
```

---

## Quick Start: Using a Service Bridge

### 1. Add a New Service Handler

**In `electron/main.ts`**:

```typescript
// Register the handler
ipcBridge.registerToolHandler('execute', async (args) => {
  const { toolName, toolArgs } = args;
  return toolService.executeTool(toolName, toolArgs);
});
```

### 2. Call from Renderer

**In `src/renderer/App.tsx`**:

```typescript
const result = await window.api.tools.execute('bash', {
  command: 'ls -la'
});
```

---

## Service Reference

### ToolServiceBridge

**Purpose**: Execute tools and stream results

**Usage**:
```typescript
// List available tools
const tools = await toolService.getTools();

// Execute a tool
const toolId = await toolService.executeTool('bash', 
  { command: 'npm install' }, 
  'unique-tool-id'
);

// Setup result handler
toolService.setResultHandler((toolId, data) => {
  console.log(`Tool ${toolId} result:`, data);
});
```

**IPC Channels**:
- `tool:execute` - Start execution
- `tool:list` - List tools
- `tool:result` - Stream results (one-way)
- `tool:complete` - Execution complete (one-way)
- `tool:error` - Error occurred (one-way)

---

### ApiServiceBridge

**Purpose**: Call LlmProvider CodeAgent API

**Usage**:
```typescript
// Send message to CodeAgent
const response = await apiService.chat({
  messages: [{ role: 'user', content: 'Hello' }],
  model: 'codeAgent-3-5-sonnet-20241022',
  temperature: 0.7
});

console.log(response.content);

// Get bootstrap data (cached)
const bootstrap = await apiService.fetchBootstrap();
console.log(bootstrap.user.name);
```

**IPC Channels**:
- `api:chat` - Send message (request/response)
- `api:bootstrap` - Get bootstrap data (request/response)

---

### FileSystemServiceBridge

**Purpose**: Safely read/write files

**Usage**:
```typescript
// Read file
const content = await filesService.readFile('src/main.ts', 'utf-8');

// Write file
await filesService.writeFile('output.txt', 'Hello', 'utf-8');

// List directory
const entries = await filesService.listDirectory('src/');

// Check if exists
const exists = await filesService.exists('src/main.ts');

// Get file stats
const stats = await filesService.stat('src/main.ts');

// Delete
await filesService.delete('output.txt', false);
```

**Security Features**:
- ✅ Path traversal protection
- ✅ 10MB file size limit
- ✅ Extension whitelist
- ✅ Secure by default

**IPC Channels**:
- `fs:read` - Read file
- `fs:write` - Write file
- `fs:list` - List directory

---

### AuthServiceBridge

**Purpose**: Manage authentication tokens and OAuth

**Usage**:
```typescript
// Get current token
const token = await authService.getToken();

// Set token
await authService.setToken({
  accessToken: 'sk-...',
  expiresAt: Date.now() + 3600000
});

// Start OAuth flow
const { authUrl, codeVerifier } = await authService.startOAuthFlow();
// User visits authUrl...
const token = await authService.exchangeCodeForToken(code, codeVerifier);

// Logout
await authService.logout();

// Check token validity
const isValid = authService.isTokenValid();
```

**IPC Channels**:
- `auth:getToken` - Get current token
- `auth:setToken` - Set token
- `auth:logout` - Clear token

---

### AppStateServiceBridge

**Purpose**: Store and retrieve app configuration and state

**Usage**:
```typescript
// Get configuration
const config = await appStateService.getConfig();
console.log(config.model); // 'codeAgent-3-5-sonnet-20241022'

// Update configuration
await appStateService.setConfig({
  model: 'codeAgent-3-opus-20250219',
  temperature: 0.5
});

// Get state (session data)
const state = await appStateService.getState();

// Update state
await appStateService.setState({
  sessionId: '123',
  lastMessage: 'Hello'
});

// Export all data
const data = await appStateService.exportData();

// Import data
await appStateService.importData(data);

// Reset to defaults
await appStateService.resetConfig();
```

**IPC Channels**:
- `app:getConfig` - Get configuration
- `app:setConfig` - Update configuration
- `app:getState` - Get state
- `app:setState` - Update state

---

## Common Patterns

### Pattern 1: Request-Response

```typescript
// Renderer
const config = await window.api.app.getConfig();

// Preload
app: {
  getConfig: () => ipcRenderer.invoke('app:getConfig')
}

// Main
ipcBridge.registerAppHandler('getConfig', async () => {
  return appStateService.getConfig();
});

// Service
async getConfig(): Promise<AppConfig> {
  return { ...this.appConfig };
}
```

### Pattern 2: Streaming Results

```typescript
// Renderer
window.api.tools.onToolResult(({ toolId, data }) => {
  console.log(`Tool result:`, data);
});

const { toolId } = await window.api.tools.execute('bash', {
  command: 'ls'
});

// Preload
tools: {
  onToolResult: (callback) => 
    ipcRenderer.on('tool:result', (_, data) => callback(data)),
  execute: (name, args) => 
    ipcRenderer.invoke('tool:execute', { toolName: name, args })
}

// Main
toolService.setResultHandler((toolId, data) => {
  mainWindow?.webContents.send('tool:result', { toolId, data });
});

ipcBridge.registerToolHandler('execute', async (args) => {
  const toolId = `tool-${Date.now()}`;
  toolService.executeTool(args.toolName, args.args, toolId);
  return { toolId };
});

// Service
async executeTool(name, args, toolId) {
  // ... execute ...
  this.resultHandler?.(toolId, result);
}
```

### Pattern 3: Error Handling

```typescript
// Renderer
try {
  const result = await window.api.api.chat(request);
} catch (error) {
  console.error('Chat failed:', error.message);
}

// Preload - errors automatically propagate

// Main
ipcBridge.registerApiHandler('chat', async (request) => {
  try {
    return await apiService.chat(request);
  } catch (error) {
    throw new Error(`API error: ${error.message}`);
  }
});

// Service
async chat(request): Promise<ChatResponse> {
  // Throws Error on failure
  return llmProvider.messages.create(...);
}
```

---

## Adding a New Service Bridge

### Step 1: Create Service Class

**File**: `electron/services/new-service-bridge.ts`

```typescript
export class NewServiceBridge {
  constructor() {
    // Initialize
  }

  async doSomething(args: any): Promise<any> {
    // Implementation
    return result;
  }
}
```

### Step 2: Add Type Definitions

**In `electron/types.ts`**:

```typescript
export interface NewServiceRequest {
  param1: string;
}

export interface NewServiceResponse {
  result: string;
}

export const IPC_CHANNELS = {
  // ...
  'new:action': true as const,
};
```

### Step 3: Add Preload Method

**In `electron/preload.ts`**:

```typescript
window.api = {
  // ...
  new: {
    action: (args) => ipcRenderer.invoke('new:action', args)
  }
}
```

### Step 4: Register Handler

**In `electron/main.ts`**:

```typescript
import { NewServiceBridge } from './services';

const newService = new NewServiceBridge();

ipcBridge.registerHandler('new:action', async (args) => {
  return newService.doSomething(args);
});
```

### Step 5: Use from Renderer

```typescript
const result = await window.api.new.action({ param1: 'value' });
```

---

## Testing Service Bridges

### Unit Test Example

```typescript
import { ToolServiceBridge } from './services';

describe('ToolServiceBridge', () => {
  let bridge: ToolServiceBridge;

  beforeEach(() => {
    bridge = new ToolServiceBridge();
  });

  test('should list tools', async () => {
    const tools = await bridge.getTools();
    expect(Array.isArray(tools)).toBe(true);
  });

  test('should execute tool', async () => {
    const handler = jest.fn();
    bridge.setResultHandler(handler);
    
    await bridge.executeTool('test-tool', {}, 'test-id');
    expect(handler).toHaveBeenCalled();
  });
});
```

### Integration Test Example

```typescript
test('IPC channel: tool:execute', async () => {
  const { toolId } = await ipcRenderer.invoke('tool:execute', {
    toolName: 'test',
    args: {}
  });
  
  expect(toolId).toBeDefined();
});
```

---

## Debugging

### Enable Logging

In `electron/main.ts`:

```typescript
ipcBridge.enableLogging(true);
```

### Check DevTools Console

1. Open DevTools (`Ctrl+Shift+I`)
2. Go to Console tab
3. Look for IPC call logs
4. Check for errors

### Add Debug Statements

```typescript
// In service
console.log('ToolServiceBridge.executeTool():', { name, args });

// In main
console.log('IPC handler tool:execute:', args);

// In preload
console.log('window.api.tools.execute called');

// In renderer
console.log('Result from IPC:', result);
```

---

## Performance Tips

1. **Cache Results**: Don't re-fetch bootstrap data
   ```typescript
   const bootstrap = await window.api.api.fetchBootstrap(); // Cached 1 hour
   ```

2. **Batch Operations**: Combine multiple reads/writes
   ```typescript
   // Instead of multiple fs:read calls, batch them
   const files = await Promise.all([
     window.api.fs.read('file1.ts'),
     window.api.fs.read('file2.ts')
   ]);
   ```

3. **Use Streaming**: For long operations, don't wait for completion
   ```typescript
   const { toolId } = await window.api.tools.execute('build', {});
   // Rendering doesn't block - results stream in
   ```

4. **Debounce Updates**: Don't update UI for every tool result
   ```typescript
   const debounced = debounce((data) => {
     setResults(data);
   }, 100);
   
   window.api.onToolResult(debounced);
   ```

---

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| "Cannot find module" | Run `npm install` and rebuild |
| IPC call hangs | Check if handler is registered |
| Type errors in preload | Verify `window.api` types match `types.ts` |
| Service method not found | Check service is instantiated in `main.ts` |
| Path security error | Use absolute paths or validate in preload |

---

## Architecture Diagram

```
┌─────────────────────────────────────┐
│     RENDERER (React)                │
│  ├─ App.tsx (UI)                    │
│  └─ window.api calls                │
└─────────────────────────────────────┘
          ↓ IPC invoke
┌─────────────────────────────────────┐
│     PRELOAD                         │
│  ├─ Type-safe API (window.api)      │
│  ├─ ipcRenderer.invoke() calls      │
│  └─ ipcRenderer.on() listeners      │
└─────────────────────────────────────┘
          ↓ IPC channels
┌─────────────────────────────────────┐
│     IPC BRIDGE (main.ts)            │
│  ├─ Handler registration            │
│  ├─ Message dispatch                │
│  └─ Response routing                │
└─────────────────────────────────────┘
          ↓ Method calls
┌─────────────────────────────────────┐
│   SERVICE BRIDGES                   │
│  ├─ ToolServiceBridge              │
│  ├─ ApiServiceBridge               │
│  ├─ FileSystemServiceBridge        │
│  ├─ AuthServiceBridge              │
│  └─ AppStateServiceBridge          │
└─────────────────────────────────────┘
          ↓ Implementation
┌─────────────────────────────────────┐
│   BUSINESS LOGIC                    │
│  ├─ Tool execution                  │
│  ├─ API calls                       │
│  ├─ File I/O                        │
│  ├─ Token management                │
│  └─ State persistence               │
└─────────────────────────────────────┘
```

---

## Resources

- **IPC_CHANNELS.md** - Complete API reference
- **PHASE_2_3_COMPLETE.md** - Architecture details
- **types.ts** - Type definitions
- **bridge.ts** - IPC bridge implementation
- **preload.ts** - Preload script

---

**Last Updated**: June 23, 2026  
**Version**: 1.0 (Phase 2 Complete)
