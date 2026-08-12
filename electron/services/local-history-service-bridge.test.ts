import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { LocalHistoryServiceBridge } from './local-history-service-bridge';

test('local history persists and merges records through atomic JSON writes', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagent-history-'));
  try {
    const service = new LocalHistoryServiceBridge(directory);
    await service.saveRecord({ id: 'turn-1', type: 'tool-event', data: { started: true } });
    await service.saveRecord({ id: 'turn-1', type: 'tool-event', data: { completed: true } });

    const record = await service.getRecord('turn-1');
    assert.deepEqual(record.data, { started: true, completed: true });
    assert.equal((await service.getStorageInfo()).recordCount, 1);
    assert.deepEqual((await fs.readdir(directory)).filter(name => name.endsWith('.tmp')), []);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
