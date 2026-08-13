import assert from 'node:assert/strict';
import test from 'node:test';
import { WebServiceBridge } from './web-service-bridge';

test('HTTP 404 proves transport reachability while marking the route unavailable', async () => {
  const service = new WebServiceBridge();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('Not Found', {
    status: 404,
    statusText: 'Not Found',
    headers: { 'content-type': 'text/plain' },
  });

  try {
    const result = await service.probe({ url: 'http://127.0.0.1:14321/v1' });
    assert.equal(result.reachable, true);
    assert.equal(result.httpOk, false);
    assert.equal(result.routeAvailable, false);
    assert.equal(result.status, 404);
    assert.match(result.explanation, /host is reachable/i);
    assert.match(result.explanation, /not a connection failure/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a connection failure is reported as unreachable without inventing an HTTP status', async () => {
  const service = new WebServiceBridge();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError('fetch failed: ECONNREFUSED');
  };

  try {
    const result = await service.probe({ url: 'http://127.0.0.1:65534/v1' });
    assert.equal(result.reachable, false);
    assert.equal(result.httpOk, false);
    assert.equal(result.routeAvailable, false);
    assert.equal(result.status, undefined);
    assert.match(result.error ?? '', /ECONNREFUSED/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
