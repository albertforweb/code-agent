import assert from 'node:assert/strict';
import test from 'node:test';
import { AuthServiceBridge } from './auth-service-bridge';

class MemoryKeytar {
  readonly values = new Map<string, string>();

  async getPassword(service: string, account: string): Promise<string | null> {
    return this.values.get(`${service}:${account}`) ?? null;
  }

  async setPassword(service: string, account: string, password: string): Promise<void> {
    this.values.set(`${service}:${account}`, password);
  }

  async deletePassword(service: string, account: string): Promise<boolean> {
    return this.values.delete(`${service}:${account}`);
  }
}

function jwtWithExpiry(expiresAtMs: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(expiresAtMs / 1000) })).toString('base64url');
  return `header.${payload}.signature`;
}

test('platform sessions survive service recreation through secure storage', async () => {
  const keytar = new MemoryKeytar();
  const first = new AuthServiceBridge(keytar);
  const expiresAt = Math.floor((Date.now() + 60_000) / 1000) * 1000;
  const accessToken = jwtWithExpiry(expiresAt);

  await first.setPlatformSession({
    accessToken,
    baseUrl: 'http://localhost:18080/',
    orgId: 'gui-2',
    developerMode: true,
  });

  const restored = await new AuthServiceBridge(keytar).getPlatformSession();
  assert.deepEqual(restored, {
    accessToken,
    baseUrl: 'http://localhost:18080',
    orgId: 'gui-2',
    developerMode: true,
    expiresAt,
  });
});

test('expired platform sessions are rejected and removed', async () => {
  const keytar = new MemoryKeytar();
  const service = new AuthServiceBridge(keytar);
  await service.setPlatformSession({
    accessToken: jwtWithExpiry(Date.now() - 60_000),
    baseUrl: 'https://platform.example.com',
  });

  assert.equal(await new AuthServiceBridge(keytar).getPlatformSession(), null);
  assert.equal(keytar.values.has('code-agent:platform-auth-session'), false);
});

test('platform sign-out does not remove LLM credentials', async () => {
  const keytar = new MemoryKeytar();
  const service = new AuthServiceBridge(keytar);
  await service.setToken({ accessToken: 'llm-secret', provider: 'openai-compatible' });
  await service.setPlatformSession({
    accessToken: jwtWithExpiry(Date.now() + 60_000),
    baseUrl: 'https://platform.example.com',
  });

  await service.clearPlatformSession();

  assert.equal((await service.getToken('openai-compatible'))?.accessToken, 'llm-secret');
  assert.equal(await service.getPlatformSession(), null);
});

test('platform login fails instead of claiming persistence without secure storage', async () => {
  const service = new AuthServiceBridge(null);
  await assert.rejects(
    service.setPlatformSession({
      accessToken: jwtWithExpiry(Date.now() + 60_000),
      baseUrl: 'https://platform.example.com',
    }),
    /Secure credential storage is unavailable/,
  );
});
