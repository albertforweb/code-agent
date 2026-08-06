import assert from 'node:assert/strict';
import test from 'node:test';
import * as path from 'node:path';
import {
  expandHomePath,
  isPathOutsideWorkspace,
  resolvePermissionPath,
} from './path-permission';

const homePath = path.resolve('/Users/example');
const workspacePath = path.join(homePath, 'project');

test('expands current-user home shorthand before resolving tool paths', () => {
  assert.equal(expandHomePath('~', homePath), homePath);
  assert.equal(expandHomePath('~/Documents', homePath), path.join(homePath, 'Documents'));
  assert.equal(resolvePermissionPath('~/Documents', workspacePath, homePath), path.join(homePath, 'Documents'));
});

test('treats home shorthand as external to a nested workspace', () => {
  assert.equal(isPathOutsideWorkspace('~', workspacePath, homePath), true);
  assert.equal(isPathOutsideWorkspace('~/Documents', workspacePath, homePath), true);
  assert.equal(isPathOutsideWorkspace('.', workspacePath, homePath), false);
  assert.equal(isPathOutsideWorkspace('src', workspacePath, homePath), false);
});

test('recognizes traversal and absolute paths outside the workspace', () => {
  assert.equal(isPathOutsideWorkspace('../other', workspacePath, homePath), true);
  assert.equal(isPathOutsideWorkspace(path.join(workspacePath, 'src'), workspacePath, homePath), false);
});
