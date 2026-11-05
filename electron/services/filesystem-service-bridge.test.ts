import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { FileSystemServiceBridge } from './filesystem-service-bridge';

test('fs.edit replaces one exact match, preserves surrounding content, and can be undone', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagent-fs-edit-'));
  try {
    const filePath = path.join(directory, 'app.js');
    const original = 'before\nconst label = "Page canvas";\nafter\n';
    await fs.writeFile(filePath, original);
    const service = new FileSystemServiceBridge(directory);
    let reviewedDiff = '';

    const result = await service.editFileWithCheckpoint(
      'app.js',
      'const label = "Page canvas";',
      'const label = "Page";',
      'utf-8',
      async preview => {
        reviewedDiff = preview.diff;
      },
    );

    assert.equal(result.replacements, 1);
    assert.equal(await fs.readFile(filePath, 'utf-8'), 'before\nconst label = "Page";\nafter\n');
    assert.match(reviewedDiff, /Page canvas/);
    assert.match(reviewedDiff, /const label = "Page";/);
    await service.restoreLastWriteCheckpoint();
    assert.equal(await fs.readFile(filePath, 'utf-8'), original);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('fs.edit rejects missing or ambiguous text without changing the file', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagent-fs-edit-'));
  try {
    const filePath = path.join(directory, 'app.js');
    const original = 'label\nlabel\n';
    await fs.writeFile(filePath, original);
    const service = new FileSystemServiceBridge(directory);

    await assert.rejects(service.editFileWithCheckpoint('app.js', 'missing', 'changed'), /was not found/);
    await assert.rejects(service.editFileWithCheckpoint('app.js', 'label', 'changed'), /matches more than once/);
    assert.equal(await fs.readFile(filePath, 'utf-8'), original);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('fs.write creation refuses to overwrite an existing file', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagent-fs-edit-'));
  try {
    const filePath = path.join(directory, 'app.js');
    await fs.writeFile(filePath, 'keep this complete file');
    const service = new FileSystemServiceBridge(directory);

    await assert.rejects(
      service.createFileWithCheckpoint('app.js', 'partial replacement'),
      /Use fs\.edit to make a focused change/,
    );
    assert.equal(await fs.readFile(filePath, 'utf-8'), 'keep this complete file');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('fs.edit refuses to apply a reviewed diff if the file changed during review', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'codeagent-fs-edit-'));
  try {
    const filePath = path.join(directory, 'app.js');
    await fs.writeFile(filePath, 'const label = "Page canvas";\n');
    const service = new FileSystemServiceBridge(directory);

    await assert.rejects(
      service.editFileWithCheckpoint(
        'app.js',
        'Page canvas',
        'Page',
        'utf-8',
        async () => {
          await fs.writeFile(filePath, 'concurrent update\n');
        },
      ),
      /changed while the edit was awaiting review/,
    );
    assert.equal(await fs.readFile(filePath, 'utf-8'), 'concurrent update\n');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
