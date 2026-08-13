import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import type { FeaturePackageAutomationProvider } from '@codeagent/feature-package-sdk';
import { AutomationServiceBridge, type VirtualTeamMember } from './automation-service-bridge';

const worker: VirtualTeamMember = {
  id: 'worker',
  name: 'Worker',
  role: 'Artifact Worker',
  goal: 'Produce the requested artifacts.',
  tools: ['filesystem'],
};

function createTestProvider(
  validateAssignmentPlan: FeaturePackageAutomationProvider['validateAssignmentPlan'] = () => undefined,
  overrides: Partial<FeaturePackageAutomationProvider> = {},
): FeaturePackageAutomationProvider {
  return {
    id: 'test-provider',
    buildPlannerPrompt: (_team, context) => `Create a test plan. Attempt ${context.attempt}.`,
    parseAssignmentPlan: (content, team) => {
      const parsed = JSON.parse(content) as { assignments?: unknown[] };
      return (parsed.assignments ?? []).map((value, index) => {
        const assignment = value as Record<string, unknown>;
        const member = team.members.find(candidate => candidate.id === assignment.memberId) ?? team.members[0]!;
        return {
          ...assignment,
          id: String(assignment.id ?? `assignment-${index + 1}`),
          title: String(assignment.title ?? `Assignment ${index + 1}`),
          description: String(assignment.description ?? member.goal),
          memberId: member.id,
          memberName: member.name,
          role: member.role,
          dependencies: Array.isArray(assignment.dependencies) ? assignment.dependencies.map(String) : [],
          parallelGroup: 1,
          status: 'pending' as const,
        };
      });
    },
    validateAssignmentPlan,
    buildMemberPrompt: (_team, _member, context) => `Complete ${context.assignment.title}.`,
    ...overrides,
  };
}

async function createService(workspacePath: string): Promise<{ service: AutomationServiceBridge; teamId: string }> {
  const service = new AutomationServiceBridge(workspacePath);
  service.registerAutomationProvider(createTestProvider());
  const team = await service.saveTeam({
    providerId: 'test-provider',
    name: 'Test team',
    objective: 'Build a small working application.',
    workspacePath,
    permissionMode: 'full-access',
    providerConfig: { requireQaSignoff: false },
    members: [worker],
    supervisorId: worker.id,
  });
  service.setVirtualTeamPlannerExecutor(async () => ({
    content: JSON.stringify({
      assignments: [{
        id: 'implement',
        title: 'Implement application',
        description: 'Create the working application source.',
        memberId: worker.id,
        dependencies: [],
        requiresArtifact: true,
        expectedArtifacts: ['src/main.py'],
      }],
    }),
  }));
  return { service, teamId: team.id };
}

test('autonomous implementation fails instead of accepting narrative-only completion', async () => {
  const workspacePath = await mkdtemp(path.join(tmpdir(), 'codeagent-team-no-artifacts-'));
  try {
    const { service, teamId } = await createService(workspacePath);
    service.setVirtualTeamMemberExecutor(async () => ({
      content: 'The design is complete. The next step is to create the application files.',
    }));

    const run = await service.runTeam(teamId);

    assert.equal(run.status, 'failed');
    assert.match(run.error ?? '', /produced no verifiable files|missing expected artifact/);
    await assert.rejects(access(path.join(workspacePath, 'src', 'main.py')));
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test('autonomous implementation promotes verified worker files into the project workspace', async () => {
  const workspacePath = await mkdtemp(path.join(tmpdir(), 'codeagent-team-artifacts-'));
  try {
    await writeFile(path.join(workspacePath, 'existing.txt'), 'project seed', 'utf8');
    const { service, teamId } = await createService(workspacePath);
    service.setVirtualTeamMemberExecutor(async (_team, _member, context) => {
      assert.equal(await readFile(path.join(context.workspacePath, 'existing.txt'), 'utf8'), 'project seed');
      const sourcePath = path.join(context.workspacePath, 'src', 'main.py');
      await mkdir(path.dirname(sourcePath), { recursive: true });
      await writeFile(sourcePath, 'print("working")\n', 'utf8');
      return { content: 'Implemented and verified src/main.py.' };
    });

    const run = await service.runTeam(teamId);

    assert.equal(run.status, 'succeeded');
    assert.equal(await readFile(path.join(workspacePath, 'src', 'main.py'), 'utf8'), 'print("working")\n');
    assert.deepEqual(run.assignments?.[0]?.producedArtifacts, ['src/main.py']);
    await assert.rejects(access(path.join(workspacePath, 'ASSIGNMENT.md')));
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test('autonomous implementation verifies and promotes an explicitly expected build artifact', async () => {
  const workspacePath = await mkdtemp(path.join(tmpdir(), 'codeagent-team-build-artifact-'));
  try {
    const service = new AutomationServiceBridge(workspacePath);
    service.registerAutomationProvider(createTestProvider());
    const team = await service.saveTeam({
      providerId: 'test-provider',
      name: 'Build artifact team',
      objective: 'Create a distributable archive.',
      workspacePath,
      permissionMode: 'full-access',
      members: [worker],
      supervisorId: worker.id,
    });
    service.setVirtualTeamPlannerExecutor(async () => ({
      content: JSON.stringify({ assignments: [{
        id: 'package',
        title: 'Package application',
        memberId: worker.id,
        dependencies: [],
        requiresArtifact: true,
        expectedArtifacts: ['build/application.zip'],
      }] }),
    }));
    service.setVirtualTeamMemberExecutor(async (_team, _member, context) => {
      const artifactPath = path.join(context.workspacePath, 'build', 'application.zip');
      await mkdir(path.dirname(artifactPath), { recursive: true });
      await writeFile(artifactPath, 'verified archive bytes\n', 'utf8');
      return { content: 'Created the requested distributable archive.' };
    });

    const run = await service.runTeam(team.id);

    assert.equal(run.status, 'succeeded');
    assert.equal(await readFile(path.join(workspacePath, 'build', 'application.zip'), 'utf8'), 'verified archive bytes\n');
    assert.deepEqual(run.assignments?.[0]?.producedArtifacts, ['build/application.zip']);
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test('autonomous assignment retries narrative output and promotes artifacts from the corrective attempt', async () => {
  const workspacePath = await mkdtemp(path.join(tmpdir(), 'codeagent-team-artifact-retry-'));
  try {
    const { service, teamId } = await createService(workspacePath);
    let calls = 0;
    service.setVirtualTeamMemberExecutor(async (_team, _member, context) => {
      calls += 1;
      if (calls === 1) {
        assert.equal(context.attempt, 1);
        assert.equal(context.verificationFailure, undefined);
        return { content: 'I designed the application. Implementation can begin next.' };
      }
      assert.equal(context.attempt, 2);
      assert.match(context.verificationFailure ?? '', /produced no verifiable files/);
      const sourcePath = path.join(context.workspacePath, 'src', 'main.py');
      await mkdir(path.dirname(sourcePath), { recursive: true });
      await writeFile(sourcePath, 'print("corrected")\n', 'utf8');
      return { content: 'Corrected the failed attempt and wrote src/main.py.' };
    });

    const run = await service.runTeam(teamId);

    assert.equal(run.status, 'succeeded');
    assert.equal(calls, 2);
    assert.equal(await readFile(path.join(workspacePath, 'src', 'main.py'), 'utf8'), 'print("corrected")\n');
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test('autonomous assignment rejects placeholder file content and retries with a real artifact', async () => {
  const workspacePath = await mkdtemp(path.join(tmpdir(), 'codeagent-team-placeholder-retry-'));
  try {
    const { service, teamId } = await createService(workspacePath);
    let calls = 0;
    service.setVirtualTeamMemberExecutor(async (_team, _member, context) => {
      calls += 1;
      const sourcePath = path.join(context.workspacePath, 'src', 'main.py');
      await mkdir(path.dirname(sourcePath), { recursive: true });
      if (calls === 1) {
        await writeFile(sourcePath, '[content omitted after successful tool execution; 1234 characters]', 'utf8');
        return { content: 'Created src/main.py.' };
      }
      assert.match(context.verificationFailure ?? '', /placeholder artifact/i);
      await assert.rejects(access(sourcePath));
      await writeFile(sourcePath, 'print("real implementation")\n', 'utf8');
      return { content: 'Replaced the placeholder and verified src/main.py.' };
    });

    const run = await service.runTeam(teamId);

    assert.equal(run.status, 'succeeded');
    assert.equal(calls, 2);
    assert.equal(await readFile(path.join(workspacePath, 'src', 'main.py'), 'utf8'), 'print("real implementation")\n');
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test('autonomous planner retries until every configured project goal has concrete coverage', async () => {
  const workspacePath = await mkdtemp(path.join(tmpdir(), 'codeagent-team-goal-plan-'));
  try {
    const service = new AutomationServiceBridge(workspacePath);
    service.registerAutomationProvider(createTestProvider((_team, assignments) => {
      const required = ['goal-1', 'goal-2', 'goal-3'];
      const missing = required.filter(goalId => !assignments.some(assignment => assignment.goalIds?.includes(goalId)));
      return missing.length ? `Assignments do not cover ${missing.join(', ')}` : undefined;
    }));
    const team = await service.saveTeam({
      providerId: 'test-provider',
      name: 'Product team',
      objective: [
        'Project name: Complete app',
        '',
        'Goals:',
        '1. Store the requirements dataset.',
        '2. Provide a visual editor.',
        '3. Transform uploaded images.',
        '',
        'Expected software artifacts: source, tests, data',
      ].join('\n'),
      workspacePath,
      permissionMode: 'full-access',
      providerConfig: { requireQaSignoff: false },
      members: [worker],
      supervisorId: worker.id,
    });
    let plannerCalls = 0;
    service.setVirtualTeamPlannerExecutor(async (_team, context) => {
      plannerCalls += 1;
      if (plannerCalls === 1) {
        assert.equal(context.attempt, 1);
        return {
          content: JSON.stringify({ assignments: [{
            id: 'partial',
            title: 'Implement only data',
            description: 'Create data.',
            memberId: worker.id,
            dependencies: [],
            requiresArtifact: true,
            goalIds: ['goal-1'],
            acceptanceCriteria: ['Dataset exists'],
            expectedArtifacts: ['data/requirements.json'],
          }] }),
        };
      }
      assert.equal(context.attempt, 2);
      assert.match(context.validationFailure ?? '', /goal-2|goal-3/);
      return {
        content: JSON.stringify({ assignments: [{
          id: 'complete',
          title: 'Implement complete app',
          description: 'Implement all configured goals.',
          memberId: worker.id,
          dependencies: [],
          requiresArtifact: true,
          goalIds: ['goal-1', 'goal-2', 'goal-3'],
          acceptanceCriteria: ['Dataset, editor, and transforms are integrated'],
          expectedArtifacts: ['src/main.py'],
        }] }),
      };
    });
    service.setVirtualTeamMemberExecutor(async (_team, _member, context) => {
      const sourcePath = path.join(context.workspacePath, 'src', 'main.py');
      await mkdir(path.dirname(sourcePath), { recursive: true });
      await writeFile(sourcePath, 'print("complete")\n', 'utf8');
      return { content: 'Implemented the complete application.' };
    });

    const run = await service.runTeam(team.id);

    assert.equal(run.status, 'succeeded');
    assert.equal(plannerCalls, 2);
    assert.deepEqual(run.assignments?.[0]?.goalIds, ['goal-1', 'goal-2', 'goal-3']);
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test('autonomous run fails when a worker explicitly reports incomplete execution', async () => {
  const workspacePath = await mkdtemp(path.join(tmpdir(), 'codeagent-team-incomplete-outcome-'));
  try {
    const { service, teamId } = await createService(workspacePath);
    let calls = 0;
    service.setVirtualTeamMemberExecutor(async () => {
      calls += 1;
      return {
        content: 'I could not complete the requested project action because the model did not produce a valid, verifiable completion after the available agent rounds.',
      };
    });

    const run = await service.runTeam(teamId);

    assert.equal(run.status, 'failed');
    assert.equal(calls, 3);
    assert.match(run.error ?? '', /reported an incomplete outcome/);
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test('autonomous assignment recovers from an incomplete agent loop with a focused artifact attempt', async () => {
  const workspacePath = await mkdtemp(path.join(tmpdir(), 'codeagent-team-incomplete-retry-'));
  try {
    const { service, teamId } = await createService(workspacePath);
    let calls = 0;
    service.setVirtualTeamMemberExecutor(async (_team, _member, context) => {
      calls += 1;
      if (calls === 1) {
        return {
          content: 'I could not complete the requested project action because the model did not produce a valid, verifiable completion after the available agent rounds.',
        };
      }
      assert.equal(context.attempt, 2);
      assert.match(context.verificationFailure ?? '', /reported an incomplete outcome/);
      const sourcePath = path.join(context.workspacePath, 'src', 'main.py');
      await mkdir(path.dirname(sourcePath), { recursive: true });
      await writeFile(sourcePath, 'print("recovered")\n', 'utf8');
      return { content: 'Created and verified the exact required artifact src/main.py.' };
    });

    const run = await service.runTeam(teamId);

    assert.equal(run.status, 'succeeded');
    assert.equal(calls, 2);
    assert.equal(await readFile(path.join(workspacePath, 'src', 'main.py'), 'utf8'), 'print("recovered")\n');
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test('provider completion validation retries a worker until its evidence is acceptable', async () => {
  const workspacePath = await mkdtemp(path.join(tmpdir(), 'codeagent-team-provider-validation-retry-'));
  try {
    let validationCalls = 0;
    const service = new AutomationServiceBridge(workspacePath);
    service.registerAutomationProvider(createTestProvider(() => undefined, {
      validateAssignmentCompletion: async (_team, _run, _assignment, context) => {
        validationCalls += 1;
        assert.deepEqual(context.producedArtifacts, ['src/main.py']);
        return context.completionRecord?.status === 'completed'
          ? undefined
          : 'Structured completion evidence is missing.';
      },
    }));
    const team = await service.saveTeam({
      providerId: 'test-provider',
      name: 'Provider validation team',
      objective: 'Require provider-owned completion evidence.',
      workspacePath,
      permissionMode: 'full-access',
      members: [worker],
      supervisorId: worker.id,
    });
    service.setVirtualTeamPlannerExecutor(async () => ({
      content: JSON.stringify({ assignments: [{
        id: 'implement',
        title: 'Implement verified application',
        memberId: worker.id,
        dependencies: [],
        requiresArtifact: true,
        expectedArtifacts: ['src/main.py'],
      }] }),
    }));
    let workerCalls = 0;
    service.setVirtualTeamMemberExecutor(async (_team, _member, context) => {
      workerCalls += 1;
      const sourcePath = path.join(context.workspacePath, 'src', 'main.py');
      await mkdir(path.dirname(sourcePath), { recursive: true });
      await writeFile(sourcePath, `print("attempt-${workerCalls}")\n`, 'utf8');
      if (workerCalls === 2) {
        assert.match(context.verificationFailure ?? '', /structured completion evidence is missing/i);
      }
      return {
        content: workerCalls === 1 ? 'done' : 'verified-evidence',
        completionRecord: workerCalls === 1 ? undefined : {
          status: 'completed',
          summary: 'Created and verified src/main.py.',
          changedFiles: ['src/main.py'],
        },
      };
    });

    const run = await service.runTeam(team.id);

    assert.equal(run.status, 'succeeded');
    assert.equal(workerCalls, 2);
    assert.equal(validationCalls, 2);
    assert.equal(await readFile(path.join(workspacePath, 'src', 'main.py'), 'utf8'), 'print("attempt-2")\n');
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test('provider final validation is awaited and can reject an artifact-producing run', async () => {
  const workspacePath = await mkdtemp(path.join(tmpdir(), 'codeagent-team-provider-final-validation-'));
  try {
    const service = new AutomationServiceBridge(workspacePath);
    let finalValidationCompleted = false;
    service.registerAutomationProvider(createTestProvider(() => undefined, {
      validateCompletedRun: async () => {
        await Promise.resolve();
        finalValidationCompleted = true;
        return 'Independent QA report did not pass every project goal.';
      },
    }));
    const team = await service.saveTeam({
      providerId: 'test-provider',
      name: 'Final validation team',
      objective: 'Reject an incomplete integrated product.',
      workspacePath,
      permissionMode: 'full-access',
      members: [worker],
      supervisorId: worker.id,
    });
    service.setVirtualTeamPlannerExecutor(async () => ({
      content: JSON.stringify({ assignments: [{
        id: 'implement',
        title: 'Implement partial application',
        memberId: worker.id,
        dependencies: [],
        requiresArtifact: true,
        expectedArtifacts: ['src/main.py'],
      }] }),
    }));
    service.setVirtualTeamMemberExecutor(async (_team, _member, context) => {
      const sourcePath = path.join(context.workspacePath, 'src', 'main.py');
      await mkdir(path.dirname(sourcePath), { recursive: true });
      await writeFile(sourcePath, 'print("partial")\n', 'utf8');
      return { content: 'Produced a partial artifact.' };
    });

    const run = await service.runTeam(team.id);

    assert.equal(finalValidationCompleted, true);
    assert.equal(run.status, 'failed');
    assert.match(run.error ?? '', /independent QA report did not pass every project goal/i);
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test('package provider owns run and assignment workspace preparation', async () => {
  const workspacePath = await mkdtemp(path.join(tmpdir(), 'codeagent-team-provider-lifecycle-'));
  try {
    const service = new AutomationServiceBridge(workspacePath);
    const lifecycleCalls: string[] = [];
    service.registerAutomationProvider(createTestProvider(() => undefined, {
      prepareRun: async (_team, _run, context) => {
        lifecycleCalls.push('run');
        await writeFile(path.join(context.workspacePath, 'PACKAGE-SEED.md'), 'owned by package\n', 'utf8');
      },
      prepareAssignment: async (_team, _run, assignment, context) => {
        lifecycleCalls.push(`assignment:${assignment.id}`);
        await writeFile(path.join(context.workspacePath, 'PACKAGE-ASSIGNMENT.md'), assignment.title, 'utf8');
      },
    }));
    const team = await service.saveTeam({
      providerId: 'test-provider',
      name: 'Provider lifecycle team',
      objective: 'Exercise package lifecycle hooks.',
      workspacePath,
      permissionMode: 'full-access',
      members: [worker],
      supervisorId: worker.id,
    });
    service.setVirtualTeamPlannerExecutor(async () => ({
      content: JSON.stringify({ assignments: [{
        id: 'implement',
        title: 'Implement package work',
        memberId: worker.id,
        dependencies: [],
        requiresArtifact: true,
        expectedArtifacts: ['result.txt'],
      }] }),
    }));
    service.setVirtualTeamMemberExecutor(async (_team, _member, context) => {
      assert.equal(await readFile(path.join(context.workspacePath, 'PACKAGE-SEED.md'), 'utf8'), 'owned by package\n');
      assert.equal(await readFile(path.join(context.workspacePath, 'PACKAGE-ASSIGNMENT.md'), 'utf8'), 'Implement package work');
      await writeFile(path.join(context.workspacePath, 'result.txt'), 'done\n', 'utf8');
      return { content: 'Completed package work.' };
    });

    const run = await service.runTeam(team.id);

    assert.equal(run.status, 'succeeded');
    assert.deepEqual(lifecycleCalls, ['run', 'assignment:implement']);
    await assert.rejects(access(path.join(workspacePath, 'README.md')));
    await assert.rejects(access(path.join(workspacePath, 'ASSIGNMENT.md')));
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test('package-owned internal artifacts do not satisfy a deliverable requirement', async () => {
  const workspacePath = await mkdtemp(path.join(tmpdir(), 'codeagent-provider-internal-artifact-'));
  try {
    const service = new AutomationServiceBridge(workspacePath);
    service.registerAutomationProvider(createTestProvider(() => undefined, {
      prepareAssignment: async (_team, _run, _assignment, context) => {
        await writeFile(path.join(context.workspacePath, '.provider-state.json'), '{}\n', 'utf8');
      },
      internalArtifactPaths: () => ['.provider-state.json'],
    }));
    const team = await service.saveTeam({
      providerId: 'test-provider',
      name: 'Provider metadata team',
      objective: 'Do not treat provider metadata as a deliverable.',
      workspacePath,
      permissionMode: 'full-access',
      members: [worker],
      supervisorId: worker.id,
    });
    service.setVirtualTeamPlannerExecutor(async () => ({
      content: JSON.stringify({ assignments: [{
        id: 'implement',
        title: 'Produce a real deliverable',
        memberId: worker.id,
        dependencies: [],
        requiresArtifact: true,
        expectedArtifacts: ['result.txt'],
      }] }),
    }));
    service.setVirtualTeamMemberExecutor(async () => ({ content: 'The work is complete.' }));

    const run = await service.runTeam(team.id);

    assert.equal(run.status, 'failed');
    assert.match(run.error ?? '', /produced no verifiable files/i);
    assert.deepEqual(run.assignments?.[0]?.producedArtifacts ?? [], []);
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test('core automation fails when an installed provider has no member executor', async () => {
  const workspacePath = await mkdtemp(path.join(tmpdir(), 'codeagent-team-no-executor-'));
  try {
    const { service, teamId } = await createService(workspacePath);

    const run = await service.runTeam(teamId);

    assert.equal(run.status, 'failed');
    assert.match(run.error ?? '', /no automation member executor is configured/i);
    await assert.rejects(access(path.join(workspacePath, 'src', 'main.py')));
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});
