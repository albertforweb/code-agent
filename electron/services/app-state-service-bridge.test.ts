import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { AppStateServiceBridge } from './app-state-service-bridge';

test('a selected CodeAgent provider and bundled model survive service recreation', async () => {
  const storeCwd = await mkdtemp(path.join(tmpdir(), 'codeagent-config-'));
  try {
    const first = new AppStateServiceBridge({ storeCwd });
    await first.setConfig({
      llmProvider: 'codeagent',
      baseUrl: 'http://127.0.0.1:14321/v1',
      model: 'Qwen/Qwen3-4B-GGUF',
      contextTokens: 8192,
      enableLlmTools: true,
      theme: 'dark',
      accentColor: 'violet',
    });

    const restored = await new AppStateServiceBridge({ storeCwd }).getConfig();
    assert.equal(restored.llmProvider, 'codeagent');
    assert.equal(restored.baseUrl, 'http://127.0.0.1:14321/v1');
    assert.equal(restored.model, 'Qwen/Qwen3-4B-GGUF');
    assert.equal(restored.contextTokens, 8192);
    assert.equal(restored.enableLlmTools, true);
    assert.equal(restored.theme, 'dark');
    assert.equal(restored.accentColor, 'violet');
  } finally {
    await rm(storeCwd, { recursive: true, force: true });
  }
});

test('all desktop settings categories survive service recreation', async () => {
  const storeCwd = await mkdtemp(path.join(tmpdir(), 'codeagent-config-'));
  try {
    const expected = {
      llmProvider: 'openai-compatible' as const,
      baseUrl: 'http://127.0.0.1:9999/v1',
      model: 'restart-test-model',
      temperature: 0.25,
      maxTokens: 3072,
      contextTokens: 16384,
      localEnginePath: '/opt/codeagent/test-engine',
      localGpuLayers: 24,
      enableLlmTools: true,
      disabledLlmTools: ['command.run'],
      toolPermissionPolicies: {
        'fs.list': 'allow' as const,
        'fs.write': 'ask' as const,
        'command.run': 'deny' as const,
      },
      desktopPermissionProfile: 'trusted-workspace' as const,
      theme: 'dark' as const,
      accentColor: 'ember' as const,
      memoryEnabled: false,
      pluginsEnabled: false,
      autoUpdate: true,
      cliOptions: {
        fallbackModel: 'fallback-test-model',
        outputFormat: 'json',
        inputFormat: 'stream-json',
        thinkingMode: 'enabled',
        effort: 'high',
        maxThinkingTokens: '2048',
        maxTurns: '12',
        maxBudgetUsd: '4.50',
        taskBudget: 'focused',
        workload: 'medium',
        proactive: true,
        systemPrompt: 'Persist this system prompt.',
        addDirs: '/tmp/restart-test',
        chromeIntegration: 'enabled',
        ideAutoConnect: true,
        noSessionPersistence: true,
        sessionName: 'restart-test-session',
        worktree: '/tmp/restart-worktree',
        tmuxMode: 'classic',
        hardFail: true,
      },
    };

    const first = new AppStateServiceBridge({ storeCwd });
    await first.setConfig(expected);

    const restored = await new AppStateServiceBridge({ storeCwd }).getConfig();
    for (const [key, value] of Object.entries(expected)) {
      assert.deepEqual(restored[key], value, `expected ${key} to survive service recreation`);
    }
  } finally {
    await rm(storeCwd, { recursive: true, force: true });
  }
});

test('platform access tokens are removed without changing model preferences', async () => {
  const storeCwd = await mkdtemp(path.join(tmpdir(), 'codeagent-config-'));
  try {
    const service = new AppStateServiceBridge({ storeCwd });
    await service.setConfig({
      llmProvider: 'codeagent',
      model: 'Qwen/Qwen3-4B-GGUF',
      platformAccessToken: 'plaintext-token-that-must-not-persist',
    });

    const restored = await new AppStateServiceBridge({ storeCwd }).getConfig();
    assert.equal(restored.platformAccessToken, '');
    assert.equal(restored.llmProvider, 'codeagent');
    assert.equal(restored.model, 'Qwen/Qwen3-4B-GGUF');
  } finally {
    await rm(storeCwd, { recursive: true, force: true });
  }
});

test('installed feature package runtimes survive stale account-profile rehydration', async () => {
  const storeCwd = await mkdtemp(path.join(tmpdir(), 'codeagent-config-'));
  try {
    const staleProfile = {
      accountStatus: 'signed-in',
      accountId: 'platform-account-1',
      email: 'admin@example.com',
      displayName: 'Admin',
      purchasedPackageIds: ['software-developer'],
      installedPackageIds: [],
      packageInstallRecords: [],
    };
    const service = new AppStateServiceBridge({ storeCwd });
    await service.setConfig({
      featureProfile: staleProfile,
      featureAccounts: {
        'platform-account-1': staleProfile,
        'admin@example.com': staleProfile,
      },
    });

    await service.reconcileInstalledFeaturePackages([{
      packageId: 'software-developer',
      version: '1.0.0',
      installedPath: '/tmp/codeagent/feature-packages/software-developer/1.0.0',
    }]);

    const restored = await new AppStateServiceBridge({ storeCwd }).getConfig();
    const assertInstalled = (profile: Record<string, any>) => {
      assert.deepEqual(profile.installedPackageIds, ['software-developer']);
      assert.equal(profile.packageInstallRecords.length, 1);
      assert.deepEqual(profile.packageInstallRecords[0], {
        packageId: 'software-developer',
        artifactId: 'software-developer.installed-runtime',
        version: '1.0.0',
        state: 'installed',
        installedPath: '/tmp/codeagent/feature-packages/software-developer/1.0.0',
        installedAt: profile.packageInstallRecords[0].installedAt,
      });
      assert.match(profile.packageInstallRecords[0].installedAt, /^\d{4}-\d{2}-\d{2}T/);
    };

    assertInstalled(restored.featureProfile as Record<string, any>);
    const accounts = restored.featureAccounts as Record<string, Record<string, any>>;
    assertInstalled(accounts['platform-account-1']);
    assertInstalled(accounts['admin@example.com']);
  } finally {
    await rm(storeCwd, { recursive: true, force: true });
  }
});
