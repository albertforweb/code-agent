import assert from 'node:assert/strict';
import test from 'node:test';
import { ToolServiceBridge, type BridgeToolDefinition } from './tool-service-bridge';

function testTool(execute: BridgeToolDefinition['execute']): BridgeToolDefinition {
  return {
    name: 'fs.write',
    description: 'write a file',
    inputSchema: { type: 'object' },
    source: 'bridge',
    readOnly: false,
    execute,
  };
}

test('structured allow decisions can normalize input before execution', async () => {
  let executedArgs: Record<string, unknown> | undefined;
  let observedDecision: unknown;
  const service = new ToolServiceBridge([testTool(async (args, context) => {
    executedArgs = args;
    observedDecision = context.permissionDecision;
    return { ok: true };
  })]);
  service.setPermissionPolicyProvider(() => ({
    behavior: 'allow',
    updatedInput: { path: 'normalized.txt' },
    ruleId: 'workspace-write',
  }));

  await service.executeToolAndReturn('fs.write', { path: '../outside.txt' }, 'tool-1');

  assert.deepEqual(executedArgs, { path: 'normalized.txt' });
  assert.deepEqual(observedDecision, {
    behavior: 'allow',
    updatedInput: { path: 'normalized.txt' },
    ruleId: 'workspace-write',
  });
});

test('structured ask decisions review normalized input and preserve context', async () => {
  const reviewed: Record<string, unknown>[] = [];
  const service = new ToolServiceBridge([testTool(async args => args)]);
  service.setPermissionPolicyProvider(() => ({
    behavior: 'ask',
    message: 'Confirm target',
    updatedInput: { path: 'reviewed.txt' },
    suggestions: [{ type: 'add-rule' }],
  }));
  service.setPermissionReviewHandler(async (_tool, args, context) => {
    reviewed.push(args);
    assert.equal(context.permissionMode, 'ask');
    assert.equal(context.permissionDecision?.behavior, 'ask');
  });

  const result = await service.executeToolAndReturn('fs.write', { path: 'raw.txt' }, 'tool-2');

  assert.deepEqual(reviewed, [{ path: 'reviewed.txt' }]);
  assert.deepEqual(result, { path: 'reviewed.txt' });
});

test('structured deny decisions surface the policy reason and do not execute', async () => {
  let executed = false;
  const service = new ToolServiceBridge([testTool(async () => {
    executed = true;
  })]);
  service.setPermissionPolicyProvider(() => ({
    behavior: 'deny',
    message: 'Writes outside the workspace are blocked.',
    ruleId: 'workspace-boundary',
  }));

  await assert.rejects(
    service.executeToolAndReturn('fs.write', { path: '../outside.txt' }, 'tool-3'),
    /Writes outside the workspace are blocked/,
  );
  assert.equal(executed, false);
});

test('legacy string policies remain compatible', async () => {
  const service = new ToolServiceBridge([testTool(async (_args, context) => context.permissionDecision)]);
  service.setPermissionPolicyProvider(() => 'allow');

  const decision = await service.executeToolAndReturn('fs.write', {}, 'tool-4');

  assert.equal(decision.behavior, 'allow');
});
