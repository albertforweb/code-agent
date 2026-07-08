#!/usr/bin/env tsx

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { AutomationServiceBridge } from '../electron/services/automation-service-bridge';

type Json = Record<string, any>;

const workspacePath = await fs.mkdtemp(path.join(os.tmpdir(), 'code-agent-remote-smoke-'));
const service = new AutomationServiceBridge(workspacePath);

let approvedBy = '';
let resolutionEvent: Json | undefined;

try {
  service.setApprovalResolutionEmitter(event => {
    resolutionEvent = event;
  });

  const remote = await service.createRemotePairingCode('Smoke iPhone');
  assert(remote.enabled, 'remote control should be enabled after creating a pairing code');
  assert(remote.mode === 'local-network', 'remote control should use local-network mode');
  assert(remote.serverUrl, 'remote-control server URL should be available');
  assert(remote.pairingCode, 'pairing code should be available');

  const pairResponse = await request(`${remote.serverUrl}/api/pair`, {
    method: 'POST',
    body: {
      code: remote.pairingCode,
      deviceName: 'Smoke iPhone',
    },
  });
  assert(typeof pairResponse.token === 'string' && pairResponse.token.length > 0, 'pairing should return a token');
  assert(pairResponse.device?.id, 'pairing should return a device id');

  const token = pairResponse.token as string;
  const deviceId = pairResponse.device.id as string;
  const auth = { authorization: `Bearer ${token}` };

  const devices = await request(`${remote.serverUrl}/api/devices`, {
    headers: auth,
  });
  assert(devices.currentDeviceId === deviceId, 'authenticated device list should identify the current device');
  assert(
    Array.isArray(devices.devices) && devices.devices.some((device: Json) => device.id === deviceId),
    'authenticated device list should include the paired device',
  );

  const approval = await service.registerApprovalRequest({
    id: 'smoke-command-approval',
    type: 'command',
    title: 'Review command: pwd',
    summary: 'Run command in .',
    details: { command: 'pwd' },
  }, {
    approve: resolvedBy => {
      approvedBy = resolvedBy ?? '';
    },
    reject: reason => {
      throw new Error(`Approval was unexpectedly rejected: ${reason ?? 'no reason'}`);
    },
  });

  const approvals = await request(`${remote.serverUrl}/api/approvals`, {
    headers: auth,
  });
  assert(
    Array.isArray(approvals.approvals) &&
      approvals.approvals.some((candidate: Json) => candidate.id === approval.id),
    'authenticated approval list should include the pending command approval',
  );

  const approvalResult = await request(`${remote.serverUrl}/api/approvals/${approval.id}`, {
    method: 'POST',
    headers: auth,
    body: {
      approved: true,
    },
  });
  assert(approvalResult.ok === true, 'approval decision should return ok=true');
  assert(approvedBy === 'Smoke iPhone', 'approval resolver should receive the remote device name');
  assert(resolutionEvent?.approvalId === approval.id, 'approval-resolution event should include approval id');
  assert(resolutionEvent?.approved === true, 'approval-resolution event should mark approval as approved');

  const postApproval = await request(`${remote.serverUrl}/api/approvals`, {
    headers: auth,
  });
  assert(
    Array.isArray(postApproval.approvals) &&
      !postApproval.approvals.some((candidate: Json) => candidate.id === approval.id),
    'resolved approval should no longer be pending',
  );

  const revoked = await request(`${remote.serverUrl}/api/devices/${deviceId}`, {
    method: 'DELETE',
    headers: auth,
  });
  assert(
    Array.isArray(revoked.approvedDevices) &&
      !revoked.approvedDevices.some((device: Json) => device.id === deviceId),
    'revoked device should be removed from approved devices',
  );

  const rejectedAfterRevoke = await request(`${remote.serverUrl}/api/devices`, {
    headers: auth,
    expectedStatus: 401,
  });
  assert(
    String(rejectedAfterRevoke.error ?? '').includes('Pair this device first'),
    'revoked token should be rejected by authenticated endpoints',
  );

  console.log('Remote-control local API smoke verified.');
} finally {
  await service.stopRemoteControlServer().catch(() => undefined);
  await fs.rm(workspacePath, { recursive: true, force: true });
}

async function request(url: string, options: {
  method?: string;
  headers?: Record<string, string>;
  body?: Json;
  expectedStatus?: number;
} = {}): Promise<Json> {
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const json = await response.json() as Json;
  const expectedStatus = options.expectedStatus ?? 200;
  if (response.status !== expectedStatus) {
    throw new Error(`Expected HTTP ${expectedStatus} from ${url}, got ${response.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
