#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

const bridgePath = path.join(root, 'electron/services/automation-service-bridge.ts');
const cliAutomationPath = path.join(root, 'cli/handlers/automation.ts');
const mainPath = path.join(root, 'main.tsx');
const rendererIpcPath = path.join(root, 'src/renderer/ipc-client.ts');
const iosClientPath = path.join(root, 'ios/CodeAgentCompanion/CodeAgentCompanion/RemoteControlClient.swift');
const securityDocPath = path.join(root, 'docs/remote-control-security.md');
const relayDocPath = path.join(root, 'docs/relay-control-distribution.md');
const iosDocPath = path.join(root, 'docs/ios-companion-distribution.md');

const bridge = read(bridgePath);
const cliAutomation = read(cliAutomationPath);
const main = read(mainPath);
const rendererIpc = read(rendererIpcPath);
const iosClient = read(iosClientPath);
const securityDoc = read(securityDocPath);
const relayDoc = read(relayDocPath);
const iosDoc = read(iosDocPath);

for (const expected of [
  '/api/status',
  '/api/pair',
  '/api/tasks',
  '/api/teams',
  '/api/approvals',
  '/api/devices',
]) {
  if (!bridge.includes(expected)) {
    failures.push(`Missing expected remote-control route: ${expected}`);
  }
}

for (const forbidden of [
  '/api/shell',
  '/api/files',
  '/api/fs',
  '/api/command',
  '/api/terminal',
  '/api/exec',
  '/api/relay',
  '/api/tunnel',
]) {
  if (bridge.includes(forbidden)) {
    failures.push(`Forbidden broad remote-control route is present: ${forbidden}`);
  }
}

for (const [label, text] of [
  ['remote-control security doc', securityDoc],
  ['relay distribution doc', relayDoc],
  ['iOS companion distribution doc', iosDoc],
]) {
  requireText(label, text, 'local-network');
  requireText(label, text, 'token rotation');
  requireText(label, text, 'audit');
}

requireText('remote-control security doc', securityDoc, 'should not be implemented as a simple public tunnel');
requireText('relay distribution doc', relayDoc, 'must not expose arbitrary shell');
requireText('relay distribution doc', relayDoc, 'emergency revocation');
requireText('iOS companion distribution doc', iosDoc, 'Off-network relay control and push notifications are not part of the first iOS package.');

requireText('automation service bridge', bridge, 'interface RemoteRelayConfig');
requireText('automation service bridge', bridge, 'configureRemoteRelay');
requireText('automation service bridge', bridge, 'disableRemoteRelay');
requireText('CLI automation handler', cliAutomation, 'automationRemoteRelayConfigureHandler');
requireText('CLI command registration', main, "automationRemote.command('relay')");
requireText('renderer IPC contract', rendererIpc, 'interface RemoteRelayConfig');
requireText('iOS companion client', iosClient, 'struct RemoteRelayConfig');

const defaultRemotePort = bridge.match(/const DEFAULT_REMOTE_PORT = (\d+);/)?.[1];
if (!defaultRemotePort) {
  failures.push('automation service bridge must define DEFAULT_REMOTE_PORT.');
} else {
  requireText('iOS companion client', iosClient, `http://127.0.0.1:${defaultRemotePort}`);
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`Error: ${failure}`);
  }
  process.exit(1);
}

console.log('Remote-control release scope verified.');

function read(filePath) {
  return readFileSync(filePath, 'utf8');
}

function requireText(label, text, needle) {
  if (!text.toLowerCase().includes(needle.toLowerCase())) {
    failures.push(`${label} must mention: ${needle}`);
  }
}
