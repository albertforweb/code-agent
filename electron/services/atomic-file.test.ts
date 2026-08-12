import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { atomicWriteFile, atomicWriteJson } from './atomic-file';

test('atomic JSON writes replace complete files and preserve their mode', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagent-atomic-'));
  const filePath = path.join(directory, 'state.json');
  try {
    await fs.writeFile(filePath, '{"old":true}\n', { mode: 0o640 });
    await atomicWriteJson(filePath, { current: true });

    assert.deepEqual(JSON.parse(await fs.readFile(filePath, 'utf8')), { current: true });
    assert.equal((await fs.stat(filePath)).mode & 0o777, 0o640);
    assert.deepEqual((await fs.readdir(directory)).filter(name => name.endsWith('.tmp')), []);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('a failure before rename preserves the previous file and removes the temporary file', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagent-atomic-'));
  const filePath = path.join(directory, 'state.json');
  try {
    await fs.writeFile(filePath, 'previous');
    await assert.rejects(
      atomicWriteFile(filePath, 'replacement', {
        beforeRename: async temporaryPath => {
          assert.equal(await fs.readFile(filePath, 'utf8'), 'previous');
          assert.equal(await fs.readFile(temporaryPath, 'utf8'), 'replacement');
          throw new Error('simulated interruption');
        },
      }),
      /simulated interruption/,
    );

    assert.equal(await fs.readFile(filePath, 'utf8'), 'previous');
    assert.deepEqual((await fs.readdir(directory)).filter(name => name.endsWith('.tmp')), []);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
