/**
 * Main Application Component
 * Entry point for the Electron renderer UI
 */

import React, { useEffect, useState } from 'react';
import styles from './App.module.css';

export function App() {
  const [status, setStatus] = useState('Initializing...');
  const [appInfo, setAppInfo] = useState<any>(null);

  useEffect(() => {
    initializeApp();
  }, []);

  async function initializeApp() {
    try {
      // Test IPC connectivity
      const info = await (window as any).api.app.getConfig();
      setAppInfo(info);
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
