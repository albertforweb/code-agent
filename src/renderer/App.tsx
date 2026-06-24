/**
 * Main Application Component
 * Entry point for the Electron renderer UI
 */

import React, { useEffect, useState } from 'react';
import styles from './App.module.css';
import { ipcClient, type AppConfig, type AppInfo } from './ipc-client';

export function App() {
  const [status, setStatus] = useState('Initializing...');
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [toolCount, setToolCount] = useState(0);
  const [mcpServerCount, setMcpServerCount] = useState(0);

  useEffect(() => {
    initializeApp();
  }, []);

  async function initializeApp() {
    try {
      // Test IPC connectivity
      const [info, config, tools, mcpServers] = await Promise.all([
        ipcClient.app.info(),
        ipcClient.app.getConfig(),
        ipcClient.tools.list(),
        ipcClient.mcp.listServers(),
      ]);
      setAppInfo(info);
      setAppConfig(config);
      setToolCount(tools.length);
      setMcpServerCount(mcpServers.length);
      setStatus('Ready');
    } catch (error) {
      console.error('Failed to initialize app:', error);
      setStatus(`Error: ${error}`);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Code Agent</h1>
        <span className={styles.status}>{status}</span>
      </div>

      <div className={styles.content}>
        <div className={styles.welcome}>
          <h2>Welcome to Code Agent</h2>
          <p>Desktop application for Claude Code</p>
          
          {appInfo && (
            <div className={styles.info}>
              <p><strong>Version:</strong> {appInfo.version || 'Unknown'}</p>
              <p><strong>Platform:</strong> {appInfo.platform || 'Unknown'}</p>
              <p><strong>Architecture:</strong> {appInfo.arch || 'Unknown'}</p>
            </div>
          )}

          {appConfig && (
            <div className={styles.info}>
              <p><strong>Model:</strong> {appConfig.model || 'Not configured'}</p>
              <p><strong>Theme:</strong> {appConfig.theme || 'system'}</p>
              <p><strong>Bridge tools:</strong> {toolCount}</p>
              <p><strong>MCP servers:</strong> {mcpServerCount}</p>
            </div>
          )}

          <div className={styles.instructions}>
            <h3>Next Steps:</h3>
            <ol>
              <li>Configure authentication</li>
              <li>Set up API keys</li>
              <li>Start using Code Agent</li>
            </ol>
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <button onClick={() => handleAction('settings')}>Settings</button>
        <button onClick={() => handleAction('help')}>Help</button>
        <button onClick={() => handleAction('about')}>About</button>
      </div>
    </div>
  );
}

function handleAction(action: string) {
  console.log('Action:', action);
  // TODO: Implement actions
}
