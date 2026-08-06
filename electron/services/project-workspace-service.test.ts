import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { ensureProjectChatWorkspace } from './project-workspace-service';

test('a supervised project chat requests approval before recreating its missing workspace', async () => {
  const parent = await mkdtemp(path.join(tmpdir(), 'codeagent-project-workspace-'));
  const workspace = path.join(parent, 'missing-project');
  let reviewCount = 0;

  try {
    const result = await ensureProjectChatWorkspace(workspace, 'workspace-only', async () => {
      reviewCount += 1;
    });

    assert.equal(result, 'created');
    assert.equal(reviewCount, 1);
    await writeFile(path.join(workspace, 'verified.txt'), 'created');
    assert.equal(await readFile(path.join(workspace, 'verified.txt'), 'utf8'), 'created');
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});

test('an existing project workspace is reused without another approval', async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), 'codeagent-existing-workspace-'));
  let reviewCount = 0;

  try {
    const result = await ensureProjectChatWorkspace(workspace, 'ask', async () => {
      reviewCount += 1;
    });

    assert.equal(result, 'existing');
    assert.equal(reviewCount, 0);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
