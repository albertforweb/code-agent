/**
 * Main Application Component
 * Entry point for the Electron renderer UI
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import hljs from 'highlight.js/lib/common';
import styles from './App.module.css';
import {
  ipcClient,
  type AppConfig,
  type AppInfo,
  type ChatMessage,
  type McpServerInfo,
  type McpToolInfo,
  type Tool,
} from './ipc-client';

type MessageRole = 'assistant' | 'user' | 'system' | 'tool' | 'error';
type MessageStatus = 'sent' | 'sending' | 'failed';

interface UiMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  status?: MessageStatus;
  title?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

interface SettingsDraft {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  theme: 'light' | 'dark' | 'system';
  memoryEnabled: boolean;
  pluginsEnabled: boolean;
  autoUpdate: boolean;
}

const DEFAULT_MODEL = 'claude-3-5-sonnet-20241022';
const SUPPORTED_MODELS = [
  'claude-3-5-sonnet-20241022',
  'claude-3-opus-20240229',
  'claude-3-sonnet-20240229',
  'claude-3-haiku-20240307',
];

function createMessage(
  role: MessageRole,
  content: string,
  overrides: Partial<UiMessage> = {},
): UiMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: Date.now(),
    ...overrides,
  };
}

function createSettingsDraft(config: AppConfig | null): SettingsDraft {
  return {
    apiKey: '',
    model: config?.model || DEFAULT_MODEL,
    temperature: Number(config?.temperature ?? 0.7),
    maxTokens: Number(config?.maxTokens ?? 4096),
    theme: config?.theme || 'system',
    memoryEnabled: Boolean(config?.memoryEnabled ?? true),
    pluginsEnabled: Boolean(config?.pluginsEnabled ?? true),
    autoUpdate: Boolean(config?.autoUpdate ?? false),
  };
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function parseToolCommand(input: string): { toolName: string; args: Record<string, any> } | null {
  const match = input.match(/^\/run\s+(\S+)(?:\s+([\s\S]+))?$/);
  if (!match) {
    return null;
  }

  const [, toolName, rawArgs] = match;
  if (!rawArgs?.trim()) {
    return { toolName, args: {} };
  }

  const parsed = JSON.parse(rawArgs);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Tool arguments must be a JSON object');
  }

  return { toolName, args: parsed as Record<string, any> };
}

function getChatMessages(messages: UiMessage[], nextUserMessage: string): ChatMessage[] {
  const history = messages
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .map(message => ({
      role: message.role as 'user' | 'assistant',
      content: message.content,
    }));

  return [...history, { role: 'user', content: nextUserMessage }];
}

export function App() {
  const [status, setStatus] = useState('Initializing');
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([]);
  const [mcpTools, setMcpTools] = useState<McpToolInfo[]>([]);
  const [messages, setMessages] = useState<UiMessage[]>([
    createMessage('assistant', 'Ready.', { title: 'Code Agent' }),
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<SettingsDraft>(() => createSettingsDraft(null));
  const [settingsMessage, setSettingsMessage] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  const messageListRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const streamMessageIds = useRef<Map<string, string>>(new Map());

  const tokenUsage = useMemo(() => {
    return messages.reduce(
      (totals, message) => ({
        inputTokens: totals.inputTokens + (message.usage?.inputTokens ?? 0),
        outputTokens: totals.outputTokens + (message.usage?.outputTokens ?? 0),
      }),
      { inputTokens: 0, outputTokens: 0 },
    );
  }, [messages]);

  useEffect(() => {
    initializeApp();
  }, []);

  useEffect(() => {
    const removeChatDeltaListener = ipcClient.onChatDelta(data => {
      const messageId = streamMessageIds.current.get(data.requestId);
      if (!messageId) {
        return;
      }

      setMessages(current => current.map(message => (
        message.id === messageId
          ? { ...message, content: `${message.content}${data.delta}` }
          : message
      )));
    });

    const removeChatCompleteListener = ipcClient.onChatComplete(data => {
      const messageId = streamMessageIds.current.get(data.requestId);
      streamMessageIds.current.delete(data.requestId);

      if (messageId) {
        setMessages(current => current.map(message => (
          message.id === messageId
            ? {
              ...message,
              content: data.response.content || message.content || 'No response content.',
              status: 'sent',
              title: data.response.model,
              usage: data.response.usage,
            }
            : message
        )));
      }

      setIsSending(false);
      setStatus('Ready');
      inputRef.current?.focus();
    });

    const removeChatErrorListener = ipcClient.onChatError(data => {
      const messageId = streamMessageIds.current.get(data.requestId);
      streamMessageIds.current.delete(data.requestId);

      if (messageId) {
        setMessages(current => current.map(message => (
          message.id === messageId
            ? { ...message, content: data.error, status: 'failed', title: 'Request failed', role: 'error' }
            : message
        )));
      } else {
        appendMessage(createMessage('error', data.error, {
          title: 'Request failed',
          status: 'failed',
        }));
      }

      setIsSending(false);
      setStatus('Error');
      inputRef.current?.focus();
    });

    const removeResultListener = ipcClient.onToolResult(data => {
      appendMessage(createMessage('tool', `\`\`\`json\n${formatJson(data.data)}\n\`\`\``, {
        title: `Tool result ${data.toolId}`,
      }));
    });

    const removeCompleteListener = ipcClient.onToolComplete(data => {
      appendMessage(createMessage('tool', `${data.success ? 'Completed' : 'Failed'} in ${data.duration} ms`, {
        title: `Tool ${data.toolId}`,
      }));
    });

    const removeErrorListener = ipcClient.onToolError(data => {
      appendMessage(createMessage('error', data.error, {
        title: `Tool error ${data.toolId}`,
        status: 'failed',
      }));
    });

    return () => {
      removeChatDeltaListener();
      removeChatCompleteListener();
      removeChatErrorListener();
      removeResultListener();
      removeCompleteListener();
      removeErrorListener();
    };
  }, []);

  useEffect(() => {
    messageListRef.current?.scrollTo({
      top: messageListRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, isSending]);

  useEffect(() => {
    const theme = appConfig?.theme || 'system';
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    document.body.classList.toggle('dark', theme === 'dark' || (theme === 'system' && prefersDark));
  }, [appConfig?.theme]);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [input]);

  async function initializeApp() {
    try {
      const [info, config, bridgeTools, servers, discoveredMcpTools] = await Promise.all([
        ipcClient.app.info(),
        ipcClient.app.getConfig(),
        ipcClient.tools.list(),
        ipcClient.mcp.listServers(),
        ipcClient.mcp.listTools(),
      ]);

      setAppInfo(info);
      setAppConfig(config);
      setSettingsDraft(createSettingsDraft(config));
      setTools(bridgeTools);
      setMcpServers(servers);
      setMcpTools(discoveredMcpTools);
      setStatus('Ready');
    } catch (error) {
      console.error('Failed to initialize app:', error);
      setStatus('Startup error');
      appendMessage(createMessage('error', error instanceof Error ? error.message : String(error), {
        title: 'Startup error',
        status: 'failed',
      }));
    }
  }

  function appendMessage(message: UiMessage) {
    setMessages(current => [...current, message]);
  }

  function updateSettingsDraft(update: Partial<SettingsDraft>) {
    setSettingsDraft(current => ({ ...current, ...update }));
  }

  async function refreshBridgeData() {
    const [bridgeTools, servers, discoveredMcpTools] = await Promise.all([
      ipcClient.tools.list(),
      ipcClient.mcp.refresh(),
      ipcClient.mcp.listTools(),
    ]);

    setTools(bridgeTools);
    setMcpServers(servers);
    setMcpTools(discoveredMcpTools);

    return { bridgeTools, servers, discoveredMcpTools };
  }

  async function submitPrompt() {
    const prompt = input.trim();
    if (!prompt || isSending) {
      return;
    }

    setInput('');
    setIsSending(true);

    const userMessage = createMessage('user', prompt);
    setMessages(current => [...current, userMessage]);
    let pendingStreamRequestId: string | null = null;

    try {
      if (await handleCommand(prompt)) {
        setStatus('Ready');
        return;
      }

      setStatus('Streaming');
      const requestId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      pendingStreamRequestId = requestId;
      const assistantMessage = createMessage('assistant', '', {
        title: appConfig?.model || DEFAULT_MODEL,
        status: 'sending',
      });

      streamMessageIds.current.set(requestId, assistantMessage.id);
      appendMessage(assistantMessage);

      await ipcClient.api.chatStream({
        requestId,
        messages: getChatMessages(messages, prompt),
        model: appConfig?.model || DEFAULT_MODEL,
        maxTokens: Number(appConfig?.maxTokens ?? 4096),
        temperature: Number(appConfig?.temperature ?? 0.7),
      });
    } catch (error) {
      if (pendingStreamRequestId) {
        streamMessageIds.current.delete(pendingStreamRequestId);
      }

      const message = error instanceof Error ? error.message : String(error);
      appendMessage(createMessage('error', message, {
        title: 'Request failed',
        status: 'failed',
      }));
      setStatus('Error');
    } finally {
      if (!streamMessageIds.current.size) {
        setIsSending(false);
        inputRef.current?.focus();
      }
    }
  }

  async function handleCommand(prompt: string): Promise<boolean> {
    if (!prompt.startsWith('/')) {
      return false;
    }

    if (prompt === '/clear') {
      setMessages([createMessage('assistant', 'Ready.', { title: 'Code Agent' })]);
      return true;
    }

    if (prompt === '/tools') {
      appendMessage(createMessage('system', formatTools(tools), { title: 'Bridge tools' }));
      return true;
    }

    if (prompt === '/mcp') {
      const { servers } = await refreshBridgeData();
      appendMessage(createMessage('system', formatMcpServers(servers), { title: 'MCP servers' }));
      return true;
    }

    if (prompt === '/config') {
      appendMessage(createMessage('system', `\`\`\`json\n${formatJson(appConfig)}\n\`\`\``, {
        title: 'Configuration',
      }));
      return true;
    }

    const toolCommand = parseToolCommand(prompt);
    if (toolCommand) {
      const { toolId } = await ipcClient.tools.execute(toolCommand.toolName, toolCommand.args);
      appendMessage(createMessage('tool', `Started ${toolCommand.toolName}`, {
        title: `Tool ${toolId}`,
      }));
      return true;
    }

    appendMessage(createMessage('error', `Unknown command: ${prompt}`, {
      title: 'Command error',
      status: 'failed',
    }));
    return true;
  }

  function formatTools(availableTools: Tool[]): string {
    if (availableTools.length === 0) {
      return 'No bridge tools are available.';
    }

    return availableTools
      .map(tool => `- ${tool.name}${tool.readOnly ? ' (read-only)' : ''}: ${tool.description}`)
      .join('\n');
  }

  function formatMcpServers(servers: McpServerInfo[]): string {
    if (servers.length === 0) {
      return 'No MCP servers are configured.';
    }

    return servers
      .map(server => `- ${server.name} [${server.scope ?? 'unknown'}]: ${server.status} (${server.type})`)
      .join('\n');
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submitPrompt();
    }
  }

  async function copyMessage(message: UiMessage) {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopiedMessageId(message.id);
      window.setTimeout(() => setCopiedMessageId(null), 1500);
    } catch (error) {
      appendMessage(createMessage('error', error instanceof Error ? error.message : String(error), {
        title: 'Copy failed',
        status: 'failed',
      }));
    }
  }

  function clearChat() {
    setMessages([createMessage('assistant', 'Ready.', { title: 'Code Agent' })]);
    setStatus('Ready');
    inputRef.current?.focus();
  }

  async function saveSettings(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingSettings(true);
    setSettingsMessage('');

    try {
      const nextConfig: Partial<AppConfig> = {
        model: settingsDraft.model,
        temperature: Number(settingsDraft.temperature),
        maxTokens: Number(settingsDraft.maxTokens),
        theme: settingsDraft.theme,
        memoryEnabled: settingsDraft.memoryEnabled,
        pluginsEnabled: settingsDraft.pluginsEnabled,
        autoUpdate: settingsDraft.autoUpdate,
      };

      await ipcClient.app.setConfig(nextConfig);

      if (settingsDraft.apiKey.trim()) {
        await ipcClient.auth.setToken({ accessToken: settingsDraft.apiKey.trim() });
      }

      const config = await ipcClient.app.getConfig();
      setAppConfig(config);
      setSettingsDraft({ ...createSettingsDraft(config), apiKey: '' });
      setSettingsMessage('Saved');
      setStatus('Ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSettingsMessage(message);
      setStatus('Settings error');
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function clearToken() {
    await ipcClient.auth.logout();
    updateSettingsDraft({ apiKey: '' });
    setSettingsMessage('Authentication cleared');
  }

  const statusLabel = isSending ? 'Working' : status;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Code Agent</h1>
          <span className={styles.subtitle}>{appConfig?.model || DEFAULT_MODEL}</span>
        </div>
        <div className={styles.headerActions}>
          <span className={`${styles.status} ${isSending ? styles.statusBusy : ''}`}>{statusLabel}</span>
          <button className={styles.secondaryButton} type="button" onClick={() => setIsSettingsOpen(true)}>
            Settings
          </button>
        </div>
      </header>

      <main className={styles.workspace}>
        <section className={styles.chatPanel} aria-label="Chat">
          <div className={styles.messageList} ref={messageListRef}>
            {messages.map(message => (
              <MessageItem
                key={message.id}
                message={message}
                copied={copiedMessageId === message.id}
                onCopy={() => copyMessage(message)}
              />
            ))}
            {isSending && (
              <div className={styles.typingIndicator} role="status">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>

          <form className={styles.composer} onSubmit={event => {
            event.preventDefault();
            submitPrompt();
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={event => setInput(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Ask Code Agent"
              rows={1}
              disabled={isSending}
              aria-label="Message"
            />
            <div className={styles.composerActions}>
              <button className={styles.secondaryButton} type="button" onClick={clearChat}>
                Clear
              </button>
              <button className={styles.primaryButton} type="submit" disabled={isSending || !input.trim()}>
                Send
              </button>
            </div>
          </form>
        </section>

        <aside className={styles.sidePanel} aria-label="Workspace status">
          <section className={styles.panelSection}>
            <div className={styles.panelHeader}>
              <h2>Session</h2>
              <button className={styles.textButton} type="button" onClick={refreshBridgeData}>
                Refresh
              </button>
            </div>
            <dl className={styles.statsList}>
              <div>
                <dt>Bridge tools</dt>
                <dd>{tools.length}</dd>
              </div>
              <div>
                <dt>MCP servers</dt>
                <dd>{mcpServers.length}</dd>
              </div>
              <div>
                <dt>MCP tools</dt>
                <dd>{mcpTools.length}</dd>
              </div>
              <div>
                <dt>Tokens</dt>
                <dd>{tokenUsage.inputTokens + tokenUsage.outputTokens}</dd>
              </div>
            </dl>
          </section>

          <section className={styles.panelSection}>
            <h2>Tools</h2>
            <div className={styles.tagList}>
              {tools.slice(0, 8).map(tool => (
                <span className={styles.tag} key={tool.name}>
                  {tool.name}
                </span>
              ))}
              {tools.length === 0 && <span className={styles.mutedText}>None</span>}
            </div>
          </section>

          <section className={styles.panelSection}>
            <h2>Runtime</h2>
            <dl className={styles.runtimeList}>
              <div>
                <dt>Version</dt>
                <dd>{appInfo?.version || 'Unknown'}</dd>
              </div>
              <div>
                <dt>Platform</dt>
                <dd>{appInfo ? `${appInfo.platform} ${appInfo.arch}` : 'Unknown'}</dd>
              </div>
              <div>
                <dt>Theme</dt>
                <dd>{appConfig?.theme || 'system'}</dd>
              </div>
            </dl>
          </section>
        </aside>
      </main>

      <footer className={styles.footer}>
        <span>{statusLabel}</span>
        <span>{messages.length} messages</span>
        <span>{tokenUsage.inputTokens} in / {tokenUsage.outputTokens} out</span>
      </footer>

      {isSettingsOpen && (
        <SettingsDialog
          draft={settingsDraft}
          message={settingsMessage}
          saving={isSavingSettings}
          tools={tools}
          mcpServers={mcpServers}
          onChange={updateSettingsDraft}
          onClose={() => setIsSettingsOpen(false)}
          onClearToken={clearToken}
          onSubmit={saveSettings}
        />
      )}
    </div>
  );
}

function MessageItem({
  message,
  copied,
  onCopy,
}: {
  message: UiMessage;
  copied: boolean;
  onCopy: () => void;
}) {
  const roleClass = styles[`message_${message.role}` as keyof typeof styles] || '';

  return (
    <article className={`${styles.message} ${roleClass}`}>
      <div className={styles.messageHeader}>
        <div>
          <span className={styles.messageRole}>{message.title || message.role}</span>
          <time>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
        </div>
        <button className={styles.textButton} type="button" onClick={onCopy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className={styles.messageContent}>{renderMessageContent(message.content)}</div>
      {message.usage && (
        <div className={styles.messageMeta}>
          {message.usage.inputTokens} input tokens / {message.usage.outputTokens} output tokens
        </div>
      )}
    </article>
  );
}

function renderMessageContent(content: string): React.ReactNode {
  const blocks: React.ReactNode[] = [];
  const fencePattern = /```([a-zA-Z0-9_-]+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fencePattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      blocks.push(renderTextBlock(content.slice(lastIndex, match.index), `text-${lastIndex}`));
    }

    const language = match[1];
    const code = match[2].replace(/\n$/, '');
    blocks.push(renderCodeBlock(code, language, `code-${match.index}`));
    lastIndex = fencePattern.lastIndex;
  }

  if (lastIndex < content.length) {
    blocks.push(renderTextBlock(content.slice(lastIndex), `text-${lastIndex}`));
  }

  return blocks.length > 0 ? blocks : renderTextBlock(content, 'text-empty');
}

function renderTextBlock(text: string, key: string): React.ReactNode {
  if (!text) {
    return null;
  }

  return (
    <p className={styles.textBlock} key={key}>
      {text}
    </p>
  );
}

function renderCodeBlock(code: string, language: string | undefined, key: string): React.ReactNode {
  let highlighted = '';
  try {
    highlighted = language
      ? hljs.highlight(code, { language, ignoreIllegals: true }).value
      : hljs.highlightAuto(code).value;
  } catch {
    highlighted = hljs.highlightAuto(code).value;
  }

  return (
    <pre className={styles.codeBlock} key={key}>
      <code dangerouslySetInnerHTML={{ __html: highlighted }} />
    </pre>
  );
}

function SettingsDialog({
  draft,
  message,
  saving,
  tools,
  mcpServers,
  onChange,
  onClose,
  onClearToken,
  onSubmit,
}: {
  draft: SettingsDraft;
  message: string;
  saving: boolean;
  tools: Tool[];
  mcpServers: McpServerInfo[];
  onChange: (update: Partial<SettingsDraft>) => void;
  onClose: () => void;
  onClearToken: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className={styles.dialogBackdrop} role="presentation">
      <form className={styles.settingsDialog} onSubmit={onSubmit} role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className={styles.dialogHeader}>
          <h2 id="settings-title">Settings</h2>
          <button className={styles.textButton} type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className={styles.settingsGrid}>
          <label className={styles.field}>
            <span>API key</span>
            <input
              type="password"
              value={draft.apiKey}
              onChange={event => onChange({ apiKey: event.target.value })}
              autoComplete="off"
            />
          </label>

          <label className={styles.field}>
            <span>Model</span>
            <select value={draft.model} onChange={event => onChange({ model: event.target.value })}>
              {SUPPORTED_MODELS.map(model => (
                <option value={model} key={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>Temperature</span>
            <input
              type="number"
              min="0"
              max="1"
              step="0.1"
              value={draft.temperature}
              onChange={event => onChange({ temperature: Number(event.target.value) })}
            />
          </label>

          <label className={styles.field}>
            <span>Max tokens</span>
            <input
              type="number"
              min="256"
              max="8192"
              step="256"
              value={draft.maxTokens}
              onChange={event => onChange({ maxTokens: Number(event.target.value) })}
            />
          </label>

          <label className={styles.field}>
            <span>Theme</span>
            <select value={draft.theme} onChange={event => onChange({ theme: event.target.value as SettingsDraft['theme'] })}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>

          <label className={styles.toggleField}>
            <input
              type="checkbox"
              checked={draft.memoryEnabled}
              onChange={event => onChange({ memoryEnabled: event.target.checked })}
            />
            <span>Memory</span>
          </label>

          <label className={styles.toggleField}>
            <input
              type="checkbox"
              checked={draft.pluginsEnabled}
              onChange={event => onChange({ pluginsEnabled: event.target.checked })}
            />
            <span>Plugins</span>
          </label>

          <label className={styles.toggleField}>
            <input
              type="checkbox"
              checked={draft.autoUpdate}
              onChange={event => onChange({ autoUpdate: event.target.checked })}
            />
            <span>Auto-update</span>
          </label>
        </div>

        <div className={styles.settingsSummary}>
          <section>
            <h3>Bridge tools</h3>
            <p>{tools.length}</p>
          </section>
          <section>
            <h3>MCP servers</h3>
            <p>{mcpServers.length}</p>
          </section>
        </div>

        <div className={styles.dialogFooter}>
          <span className={styles.settingsMessage}>{message}</span>
          <div className={styles.dialogActions}>
            <button className={styles.dangerButton} type="button" onClick={onClearToken}>
              Clear auth
            </button>
            <button className={styles.secondaryButton} type="button" onClick={onClose}>
              Cancel
            </button>
            <button className={styles.primaryButton} type="submit" disabled={saving}>
              {saving ? 'Saving' : 'Save'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
